'use strict';

const Intern = require('../models/Intern');
const Rotation = require('../models/Rotation');
const Unit = require('../models/Unit');
const { canAssignmentTransition } = require('./movementGuard');
const { normalizeRotation, resolveCurrentAssignment } = require('./assignmentUtils');
const { cleanupInvalidUpcomingRotations } = require('./rotationCleanupService');

const DEFAULT_DURATION = 20;
const DAY_IN_MS = 1000 * 60 * 60 * 24;
const LEAVING_SOON_DAYS = 5;
// How much a completely empty unit's need score is boosted over any
// non-empty unit's, regardless of how close the fractional target-based
// scores might otherwise be. Large enough that no realistic combination of
// occupancy/target/leaving-soon numbers could out-rank a genuinely empty
// unit - see "EMPTY UNITS MUST BE PRIORITIZED".
const EMPTY_UNIT_NEED_BONUS = 1000;
// Two units within this much need-score of each other are treated as
// "equally suitable" and chosen between randomly, rather than always
// picking whichever sorts first.
const NEED_TIE_EPSILON = 0.5;

const startOfDay = (d = new Date()) => {
  const v = new Date(d);
  v.setHours(0, 0, 0, 0);
  return v;
};

const addDays = (d, n) => {
  const v = new Date(d);
  v.setDate(v.getDate() + Number(n || 0));
  return v;
};

const getUnitDuration = (unit) => {
  const raw = unit?.durationDays ?? unit?.duration ?? unit?.duration_days;
  const d = Number(raw);
  return Number.isFinite(d) && d > 0 ? d : DEFAULT_DURATION;
};

const getNextRotationStartDate = (previousEndDate = null, fallbackDate = new Date()) => {
  if (previousEndDate) {
    return startOfDay(addDays(previousEndDate, 1));
  }
  return startOfDay(fallbackDate);
};

const getRotationWindow = (startDateLike, durationLike) => {
  const duration = Number(durationLike);
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : DEFAULT_DURATION;
  const startDate = startOfDay(startDateLike);
  const endDate = startOfDay(addDays(startDate, safeDuration - 1));
  return {
    startDate,
    endDate,
    duration: safeDuration,
  };
};

const getRotationManualExtensionDays = (rotation) => {
  const rawManual = Number(rotation?.manualExtensionDays);
  const rawAuto = Number(rotation?.autoExtensionDays);
  const totalExtensionDays = Number(rotation?.extensionDays);

  if (Number.isFinite(rawManual) && rawManual >= 0 && Number.isFinite(rawAuto) && rawAuto >= 0) {
    if (rawManual === 0 && rawAuto === 0 && Number.isFinite(totalExtensionDays) && totalExtensionDays > 0) {
      return totalExtensionDays;
    }
    return rawManual;
  }

  if (Number.isFinite(rawManual) && rawManual >= 0) {
    return rawManual;
  }

  if (Number.isFinite(totalExtensionDays) && totalExtensionDays >= 0) {
    return totalExtensionDays;
  }

  return 0;
};

const getRotationAutoExtensionDays = (rotation) => {
  const rawAuto = Number(rotation?.autoExtensionDays);
  if (Number.isFinite(rawAuto) && rawAuto >= 0) {
    return rawAuto;
  }
  return 0;
};

const getRotationTotalExtensionDays = (rotation) => {
  if (rotation?.manualExtensionDays !== undefined || rotation?.autoExtensionDays !== undefined) {
    return getRotationManualExtensionDays(rotation) + getRotationAutoExtensionDays(rotation);
  }
  const rawExtensionDays = Number(rotation?.extensionDays);
  return Number.isFinite(rawExtensionDays) && rawExtensionDays >= 0 ? rawExtensionDays : 0;
};

const shiftFutureRotations = async (internId, pivotEndDate, dayDelta, excludeRotationIds = []) => {
  if (!pivotEndDate || !Number.isFinite(Number(dayDelta)) || dayDelta === 0) return;
  const pivot = startOfDay(pivotEndDate);
  const futureRotations = await Rotation.find({
    intern: internId,
    startDate: { $gt: pivot },
    _id: { $nin: excludeRotationIds },
  }).exec();

  for (const rotation of futureRotations) {
    if (rotation.startDate) rotation.startDate = addDays(rotation.startDate, dayDelta);
    if (rotation.endDate) rotation.endDate = addDays(rotation.endDate, dayDelta);
    if (rotation.actualEndDate) rotation.actualEndDate = addDays(rotation.actualEndDate, dayDelta);
    await rotation.save();
  }
};

async function getResolvedActiveRotations() {
  const allRotations = await Rotation.find({})
    .select('intern unit startDate endDate status workflowState extensionDays createdAt')
    .exec();

  const rotationsByIntern = new Map();
  for (const rotation of allRotations) {
    const internId = rotation.intern?.toString?.();
    if (!internId) continue;
    const list = rotationsByIntern.get(internId) || [];
    list.push(rotation);
    rotationsByIntern.set(internId, list);
  }

  const resolved = [];
  for (const [, internRotations] of rotationsByIntern.entries()) {
    const current = resolveCurrentAssignment({ rotations: internRotations });
    if (current && current.unit) {
      resolved.push(current);
    }
  }

  return resolved;
}

/**
 * Count active interns per unit based on live Rotation records.
 * Only counts resolved active assignments for each intern.
 * Returns Map<unitIdStr, number>
 */
async function getUnitOccupancy(todayRef = new Date()) {
  const today = startOfDay(todayRef);
  const rotations = await getResolvedActiveRotations();

  const counts = new Map();
  for (const rot of rotations) {
    const norm = normalizeRotation(rot);
    if (!norm || norm.status !== 'active') continue;
    const start = norm.startDate ? startOfDay(norm.startDate) : null;
    const end = norm.endDate ? startOfDay(norm.endDate) : null;
    if (start && start > today) continue;
    if (end && end < today) continue;
    const uid = norm.unit?.toString?.() || norm.unit?._id?.toString?.() || null;
    if (uid) counts.set(uid, (counts.get(uid) || 0) + 1);
  }
  return counts;
}

/**
 * Count active interns whose current rotation ends within N days, considering extensions.
 * Returns Map<unitIdStr, number>
 */
async function getUnitInternsLeavingSoon(windowDays = LEAVING_SOON_DAYS, todayRef = new Date()) {
  const today = startOfDay(todayRef);
  const maxDate = startOfDay(addDays(today, windowDays));
  const rotations = await getResolvedActiveRotations();

  const counts = new Map();
  for (const rot of rotations) {
    const uid = rot.unit?.toString?.() || rot.unit?._id?.toString?.() || null;
    const end = rot.endDate ? startOfDay(rot.endDate) : null;
    const extensionDays = Number(rot.extensionDays || 0);
    const finalEnd = end ? startOfDay(addDays(end, extensionDays)) : null;
    if (!uid || !finalEnd) continue;
    if (finalEnd < today || finalEnd > maxDate) continue;
    counts.set(uid, (counts.get(uid) || 0) + 1);
  }

  return counts;
}

/**
 * Count interns already lined up to occupy each unit next - a staged
 * 'awaiting_confirmation' suggestion nobody has accepted yet, or a
 * genuinely scheduled 'upcoming' rotation. These aren't occupying the unit
 * YET, but assigning yet another intern there without accounting for them
 * would overload it the moment they land. Returns Map<unitIdStr, number>.
 */
async function getUnitPendingDemand() {
  const rows = await Rotation.find({ status: { $in: ['awaiting_confirmation', 'upcoming'] } })
    .select('unit')
    .exec();

  const counts = new Map();
  for (const row of rows) {
    const uid = row.unit?.toString?.() || null;
    if (uid) counts.set(uid, (counts.get(uid) || 0) + 1);
  }
  return counts;
}

/**
 * Single snapshot of every signal the dynamic scheduler needs, computed once
 * per selection call so occupancy/leaving-soon/pending-demand all reflect
 * the same instant.
 *
 * effectiveLoad = current occupancy, minus interns leaving soon (an
 * anticipated vacancy - see "ACCOUNT FOR LEAVING SOON"), plus pending
 * demand (interns already lined up to arrive there next). Floored at 0 -
 * more leaving-soon interns than current occupancy can't make a unit
 * "negatively" empty.
 *
 * target = eligible interns currently occupying a rotation, divided by the
 * number of units - a BALANCING TARGET, never a hard cap (see "DEFINE
 * DYNAMIC CAPACITY"). With 0 units this is 0 (no basis to target anything).
 */
async function computeUnitNeedSnapshot(allUnits, todayRef = new Date()) {
  const [occupancy, leavingSoon, pendingDemand] = await Promise.all([
    getUnitOccupancy(todayRef),
    getUnitInternsLeavingSoon(LEAVING_SOON_DAYS, todayRef),
    getUnitPendingDemand(),
  ]);

  const effectiveLoad = new Map();
  let totalOccupancy = 0;
  for (const unit of allUnits) {
    const id = String(unit._id);
    const occ = occupancy.get(id) || 0;
    totalOccupancy += occ;
    const leaving = leavingSoon.get(id) || 0;
    const pending = pendingDemand.get(id) || 0;
    effectiveLoad.set(id, Math.max(0, occ - leaving) + pending);
  }

  const target = allUnits.length > 0 ? totalOccupancy / allUnits.length : 0;

  return { occupancy, leavingSoon, pendingDemand, effectiveLoad, target };
}

/**
 * Core dynamic unit-selection engine - answers "among the units this intern
 * is eligible to enter, which unit currently needs an intern the most while
 * keeping the overall distribution as even as possible?"
 *
 * Excludes only units this intern has already completed (and, via
 * `completedIds` carrying the current unit id too where callers merge it
 * in) - capacity is never a hard block, only a scoring preference, so a
 * unit that's numerically "full" is still eligible if it's the intern's
 * only remaining option (see "DEFINE DYNAMIC CAPACITY").
 *
 * Need score per unit = (target - effectiveLoad), so units sitting below
 * the dynamic target rank higher than units at or above it. A completely
 * empty unit always gets a large flat bonus on top, so it can never be
 * out-ranked by fractional target-vs-load differences elsewhere (see
 * "EMPTY UNITS MUST BE PRIORITIZED"). Units within NEED_TIE_EPSILON of the
 * top score are treated as equally suitable and chosen between randomly
 * (see "RANDOMIZATION").
 */
async function selectBestUnit(units, today = new Date(), completedIds = new Set()) {
  const eligible = units.filter((unit) => !completedIds.has(String(unit._id)));
  if (eligible.length === 0) return null;

  const snapshot = await computeUnitNeedSnapshot(units, today);

  const scored = eligible.map((unit) => {
    const id = String(unit._id);
    const occupancy = snapshot.occupancy.get(id) || 0;
    const effectiveLoad = snapshot.effectiveLoad.get(id) || 0;
    const isEmpty = occupancy === 0;
    const need = (snapshot.target - effectiveLoad) + (isEmpty ? EMPTY_UNIT_NEED_BONUS : 0);
    return { unit, need };
  });

  scored.sort((a, b) => b.need - a.need);

  const topNeed = scored[0].need;
  const topTier = scored.filter((entry) => topNeed - entry.need <= NEED_TIE_EPSILON);
  const chosen = topTier[Math.floor(Math.random() * topTier.length)];

  return chosen.unit;
}

/**
 * Get set of unit IDs already completed by an intern.
 * Derived from Rotation records with status 'completed'.
 */
async function getCompletedUnitIds(internId) {
  const completed = await Rotation.find({ intern: internId, status: 'completed' })
    .select('unit')
    .exec();
  return new Set(completed.map((r) => r.unit?.toString?.()).filter(Boolean));
}

/**
 * Assign the first unit to a newly-created intern.
 * Creates exactly one 'active' Rotation starting on the intern's startDate.
 */
async function assignFirstUnit(intern, allUnits) {
  canAssignmentTransition('assignFirstUnit');
  const unit = await selectBestUnit(allUnits);

  if (!unit) {
    throw new Error('No eligible unit available for assignment — no units are configured');
  }

  const duration = getUnitDuration(unit);
  const { startDate, endDate } = getRotationWindow(intern.startDate || new Date(), duration);

  const rotation = await Rotation.create({
    intern: intern._id,
    unit: unit._id,
    startDate,
    endDate,
    baseDuration: duration,
    extensionDays: 0,
    duration,
    status: 'active',
  });

  return { rotation, unit };
}

/**
 * TASK 6 – Advance intern to the next unit.
 * Called when the current rotation completes.
 * Marks current rotation as completed and creates a new active rotation.
 */
async function advanceToNextUnit(internId) {
  canAssignmentTransition('advanceToNextUnit');
  throw new Error('advanceToNextUnit is disabled in Phase 1. Movement must be confirmed manually via acceptMovement.');
}

async function ensureContinuousAssignment(internId, now = new Date()) {
  canAssignmentTransition('ensureContinuousAssignment');
  const intern = await Intern.findById(internId).exec();
  if (!intern) throw new Error('Intern not found');

  const { trace } = require('./mutationTraceService');

  const today = startOfDay(now);
  const allRotationsForIntern = await Rotation.find({ intern: internId }).sort({ startDate: -1, createdAt: -1 }).exec();
  const activeNorm = resolveCurrentAssignment({ rotations: allRotationsForIntern });
  const activeRotation = activeNorm ? allRotationsForIntern.find((r) => String(r._id) === String(activeNorm._id)) : null;

  if (activeRotation) {
    const startDate = activeRotation.startDate ? startOfDay(activeRotation.startDate) : null;
    const endDate = activeRotation.endDate ? startOfDay(activeRotation.endDate) : null;
    // NOTE: was `const` — must be `let` because we may stage and assign it below.
    let nextPlannedRotation = await Rotation.findOne({
      intern: intern._id,
      status: { $in: ['upcoming', 'awaiting_confirmation'] }
    })
      .sort({ startDate: 1, createdAt: 1 })
      .exec();

    try {
      trace('ensureContinuousAssignment:active_found', internId, { active: { id: activeRotation._id.toString(), unit: activeRotation.unit?.toString?.() || activeRotation.unit }, nextPlannedRotation: nextPlannedRotation ? { id: nextPlannedRotation._id.toString(), unit: nextPlannedRotation.unit?.toString?.() || nextPlannedRotation.unit } : null });
    } catch (err) {
      console.error('[MUTATION_TRACE] trace error in ensureContinuousAssignment', err);
    }

    if (startDate && today < startDate) {
      activeRotation.status = 'upcoming';
      await activeRotation.save();
    } else if (endDate && today > endDate) {
      // Keep rotation as 'active' with workflowState tracking for pending confirmation
      if (activeRotation.workflowState !== 'pending_confirmation') {
        activeRotation.workflowState = 'pending_confirmation';
        console.log(`[WORKFLOW STATE] intern ${intern._id.toString()}: workflowState set to pending_confirmation (elapsedDays >= plannedDuration)`);
      }

      // --- FIX #1: stage the next rotation if nothing is queued yet ------------
      // Nothing previously ever created a rotation with status 'awaiting_confirmation',
      // so this whole workflow was unreachable. We now auto-stage the best eligible
      // next unit here. This does NOT move the intern anywhere — it only queues a
      // proposed next unit for HR/operator to Accept or Reassign.
      if (!nextPlannedRotation) {
        const currentUnitId = activeRotation.unit?.toString?.() || null;
        const [allUnits, completedIds] = await Promise.all([
          Unit.find({}).sort({ order: 1, position: 1, createdAt: 1 }).exec(),
          getCompletedUnitIds(intern._id),
        ]);
        const exclusionIds = new Set(completedIds);
        if (currentUnitId) exclusionIds.add(currentUnitId);

        const stagedUnit = await selectBestUnit(allUnits, today, exclusionIds);

        if (stagedUnit) {
          const stagedDuration = getUnitDuration(stagedUnit);
          const provisionalStart = addDays(endDate, 1);
          const { endDate: provisionalEnd } = getRotationWindow(provisionalStart, stagedDuration);

          nextPlannedRotation = await Rotation.create({
            intern: intern._id,
            unit: stagedUnit._id,
            startDate: provisionalStart,
            endDate: provisionalEnd,
            baseDuration: stagedDuration,
            duration: stagedDuration,
            extensionDays: 0,
            status: 'awaiting_confirmation',
          });

          console.log(`[STAGE NEXT] intern ${intern._id.toString()}: staged "${stagedUnit.name}" awaiting confirmation`);
        } else {
          console.warn(`[STAGE NEXT] intern ${intern._id.toString()}: no eligible unit to stage (all completed or all full)`);
        }
      }
      // --- end FIX #1 -------------------------------------------------------------

      // PHASE 4: Preserve overdue active assignments when a next movement is already staged.
      if (nextPlannedRotation) {
        console.warn(`[MOVEMENT BLOCKED]\nsource: refresh\nintern: ${intern._id.toString()}\nreason: automatic transitions disabled`);
        trace('ensureContinuousAssignment:blocking_overdue_with_next', internId, { active: { id: activeRotation._id.toString(), unit: activeRotation.unit?.toString?.() }, nextPlannedRotation: { id: nextPlannedRotation._id.toString(), unit: nextPlannedRotation.unit?.toString?.() } });
        const overdueDays = Math.max(0, Math.floor((today.getTime() - endDate.getTime()) / DAY_IN_MS));
        const manualExtensionDays = getRotationManualExtensionDays(activeRotation);
        // --- FIX #2: overdueDays was computed but never actually stored anywhere,
        // so the "25/21 days" style auto-growing counter could never move. Math.max
        // guards against ever ticking backwards.
        const autoExtensionDays = Math.max(getRotationAutoExtensionDays(activeRotation), overdueDays);

        activeRotation.manualExtensionDays = manualExtensionDays;
        activeRotation.autoExtensionDays = autoExtensionDays;
        activeRotation.extensionDays = manualExtensionDays + autoExtensionDays;
        await activeRotation.save();

        // --- FIX #3 (status model): 'pending' is now the ONLY status used to
        // represent an overdue/awaiting-confirmation intern. Extension days are
        // still tracked as a NUMBER (intern.extensionDays) so "22/21" style
        // counters keep working, but they no longer produce a separate
        // "extended" status. Valid statuses are now just: active, pending, completed.
        if (intern) {
          intern.currentUnit = activeRotation.unit || null;
          intern.status = 'pending';
          intern.manualExtensionDays = manualExtensionDays;
          intern.autoExtensionDays = autoExtensionDays;
          intern.extensionDays = manualExtensionDays + autoExtensionDays;
          await intern.save();
        }

        return { rotation: activeRotation, unit: activeRotation.unit, wasReset: false, usedOverflow: false };
      }

      // No eligible unit could be staged (e.g. intern has completed every unit).
      // This is a genuine "internship complete" edge case, not a pending-approval
      // case. Leaving as 'active' for now — worth deciding separately whether this
      // should instead flip intern.status to 'completed'.
      await activeRotation.save();
      trace('ensureContinuousAssignment:post_save_active_overdue', internId, { active: { id: activeRotation._id.toString(), unit: activeRotation.unit?.toString?.() }, internCurrentUnit: intern.currentUnit ? intern.currentUnit.toString?.() : intern.currentUnit });
      intern.currentUnit = activeRotation.unit || null;
      intern.status = 'active';
      await intern.save();
      return { rotation: activeRotation, unit: activeRotation.unit, wasReset: false, usedOverflow: false };
    } else {
      // --- FIX #3 (status model), continued: previously this computed
      // desiredStatus = activeExtensionDays > 0 ? 'extended' : 'active'. Since
      // 'extended' is no longer a status, this branch (rotation is neither in
      // the future nor overdue, i.e. a normal in-progress assignment) is now
      // always 'active'. Extension day NUMBERS below are still tracked and
      // displayed (e.g. "22/21 days") — they just don't change the status word.
      const activeExtensionDays = getRotationTotalExtensionDays(activeRotation);
      const desiredStatus = 'active';
      const currentUnitId = activeRotation.unit?.toString?.() || null;
      const hasChanges = String(intern.currentUnit || '') !== String(currentUnitId || '')
        || intern.status !== desiredStatus
        || Number(intern.extensionDays || 0) !== activeExtensionDays
        || Number(intern.manualExtensionDays || 0) !== getRotationManualExtensionDays(activeRotation)
        || Number(intern.autoExtensionDays || 0) !== getRotationAutoExtensionDays(activeRotation);

      if (hasChanges) {
        intern.currentUnit = activeRotation.unit || null;
        intern.status = desiredStatus;
        intern.manualExtensionDays = getRotationManualExtensionDays(activeRotation);
        intern.autoExtensionDays = getRotationAutoExtensionDays(activeRotation);
        intern.extensionDays = activeExtensionDays;
        intern.totalExtensionDays = getRotationTotalExtensionDays(activeRotation);
        await intern.save();
      }

      return { rotation: activeRotation, unit: activeRotation.unit, wasReset: false, usedOverflow: false };
    }
  }

  const rotationCount = await Rotation.countDocuments({ intern: intern._id }).exec();
  if (rotationCount === 0) {
    const allUnits = await Unit.find({}).sort({ order: 1, position: 1, createdAt: 1 }).exec();
    if (!allUnits.length) {
      intern.currentUnit = null;
      intern.status = 'completed';
      await intern.save();
      return { rotation: null, unit: null, wasReset: false, usedOverflow: false };
    }

    const { rotation, unit } = await assignFirstUnit(intern, allUnits);
    intern.currentUnit = unit._id;
    // FIX #3 (status model): first assignment is always 'active', never 'extended'.
    intern.status = 'active';
    intern.rotationHistory = [rotation._id];
    await intern.save();
    return { rotation, unit, wasReset: false, usedOverflow: false };
  }

  // PHASE 1: Do not auto-assign the next unit when an intern has existing rotations.
  // Movement must only happen via explicit acceptance.
  console.warn(`[MOVEMENT BLOCKED]\nsource: ensureContinuousAssignment\nintern: ${intern._id.toString()}\nreason: automatic transitions disabled`);
  return { rotation: null, unit: null, wasReset: false, usedOverflow: false };
}

/**
 * Get eligible units for reassignment or next-unit display.
 * Returns all units an intern can be moved to right now.
 */
async function getEligibleUnits(internId, currentUnitId = null) {
  const [allUnits, completedIds] = await Promise.all([
    Unit.find({}).sort({ order: 1, position: 1, createdAt: 1 }).exec(),
    getCompletedUnitIds(internId),
  ]);

  // FIX: capacity must never hard-block a MANUAL reassignment decision -
  // only completed units and the intern's own current unit are genuinely
  // ineligible. A unit at or above its dynamic target is still offered, just
  // sorted after less-loaded ones, so an administrator can always make a
  // necessary assignment even if it temporarily makes distribution uneven.
  const snapshot = await computeUnitNeedSnapshot(allUnits);

  const eligible = [];
  for (const unit of allUnits) {
    const unitId = String(unit._id);
    if (currentUnitId && unitId === String(currentUnitId)) continue;
    if (completedIds.has(unitId)) continue;
    eligible.push({
      id: unitId,
      name: unit.name,
      durationDays: getUnitDuration(unit),
      duration_days: getUnitDuration(unit),
      effectiveLoad: snapshot.effectiveLoad.get(unitId) || 0,
    });
  }

  eligible.sort((a, b) => a.effectiveLoad - b.effectiveLoad);
  return eligible.map(({ effectiveLoad, ...rest }) => rest);
}

module.exports = {
  DEFAULT_DURATION,
  getUnitOccupancy,
  getUnitInternsLeavingSoon,
  getUnitPendingDemand,
  computeUnitNeedSnapshot,
  selectBestUnit,
  getCompletedUnitIds,
  getNextRotationStartDate,
  getRotationWindow,
  assignFirstUnit,
  advanceToNextUnit,
  ensureContinuousAssignment,
  getEligibleUnits,
  getUnitDuration,
};
