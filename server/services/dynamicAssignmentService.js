'use strict';

const Intern = require('../models/Intern');
const Rotation = require('../models/Rotation');
const Unit = require('../models/Unit');

const DEFAULT_CAPACITY = 4;
const DEFAULT_DURATION = 20;
const LEAVING_SOON_DAYS = 5;
const MOVEMENT_WINDOW_DAYS = 7;
const RECENT_INCOMING_DAYS = 7;

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

/**
 * Count active interns per unit based on live Rotation records.
 * Only counts rotations whose date range includes today.
 * Returns Map<unitIdStr, number>
 */
async function getUnitOccupancy() {
  const today = startOfDay(new Date());
  const active = await Rotation.find({ status: 'active' })
    .select('unit startDate endDate')
    .exec();

  const counts = new Map();
  for (const rot of active) {
    const start = rot.startDate ? startOfDay(rot.startDate) : null;
    const end = rot.endDate ? startOfDay(rot.endDate) : null;
    if (start && start > today) continue;
    if (end && end < today) continue;
    const uid = rot.unit?.toString?.() || null;
    if (uid) counts.set(uid, (counts.get(uid) || 0) + 1);
  }
  return counts;
}

/**
 * Count active interns whose current rotation ends within N days, considering extensions.
 * Returns Map<unitIdStr, number>
 */
async function getUnitInternsLeavingSoon(windowDays = LEAVING_SOON_DAYS) {
  const today = startOfDay(new Date());
  const maxDate = startOfDay(addDays(today, windowDays));
  const active = await Rotation.find({ status: 'active' })
    .select('unit endDate extensionDays')
    .exec();

  const counts = new Map();
  for (const rot of active) {
    const uid = rot.unit?.toString?.() || null;
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
 * Get the count of active interns in a unit.
 */
async function getActiveInternsCount(unitId) {
  const count = await Rotation.countDocuments({ unit: unitId, status: 'active' });
  return count;
}

/**
 * Check if a unit is at full capacity.
 */
async function isUnitFull(unit) {
  const count = await getActiveInternsCount(unit._id);
  const capacity = unit.capacity || DEFAULT_CAPACITY;
  return count >= capacity;
}

/**
 * Select the best unit for assignment based on leaving soon priority.
 * Excludes full units and optionally completed units.
 */
async function selectBestUnit(units, today = new Date(), completedIds = new Set()) {
  const availableUnits = [];
  for (const unit of units) {
    const unitId = String(unit._id);
    if (completedIds.has(unitId)) continue;
    if (await isUnitFull(unit)) continue;
    availableUnits.push(unit);
  }

  if (availableUnits.length === 0) {
    return null;
  }

  const leavingSoonCounts = await getUnitInternsLeavingSoon(LEAVING_SOON_DAYS);

  // Sort by leaving soon count descending
  availableUnits.sort((a, b) => {
    const aCount = leavingSoonCounts.get(String(a._id)) || 0;
    const bCount = leavingSoonCounts.get(String(b._id)) || 0;
    return bCount - aCount;
  });

  return availableUnits[0];
}

async function getRecentIncomingCounts(windowDays = RECENT_INCOMING_DAYS, todayRef = new Date()) {
  const today = startOfDay(todayRef);
  const minDate = startOfDay(addDays(today, -windowDays));
  const rows = await Rotation.find({
    startDate: { $gte: minDate, $lte: today },
  })
    .select('unit')
    .exec();

  const counts = new Map();
  for (const row of rows) {
    const uid = row.unit?.toString?.() || null;
    if (!uid) continue;
    counts.set(uid, (counts.get(uid) || 0) + 1);
  }
  return counts;
}

const getUnitLoad = (loadMap, unitId) => loadMap.get(String(unitId)) || 0;

const buildTrueLoadMap = (allUnits, occupancy, leavingSoon, incomingBatch = new Map(), recentIncoming = new Map()) => {
  const trueLoad = new Map();
  for (const unit of allUnits) {
    const unitId = String(unit._id);
    const currentInterns = occupancy.get(unitId) || 0;
    const internsLeavingSoon = leavingSoon.get(unitId) || 0;
    const batchIncoming = incomingBatch.get(unitId) || 0;
    const recent = recentIncoming.get(unitId) || 0;
    trueLoad.set(unitId, currentInterns - internsLeavingSoon + batchIncoming + recent);
  }
  return trueLoad;
};

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
 * Core dynamic unit selection engine.
 *
 * TASK 3 – Filter eligible units:
 *   occupancy < capacity  AND  NOT in completedIds  AND  != currentUnitId
 *
 * TASK 9 – Full rotation reset:
 *   If no eligible units, reset completedIds and repeat with all units.
 *
 * TASK 4 + 5 – Prioritise by need + tie-breaking:
 *   Sort pool by occupancy ASC, then pick randomly among the 3 lowest.
 *
 * @param {Array}        allUnits
 * @param {Map}          occupancy     Map<unitIdStr, count>
 * @param {Set}          completedIds  Set<unitIdStr>
 * @param {string|null}  currentUnitId excluded unit
 * @param {number}       capacity      max per unit (default 5)
 * @returns {{ unit: Object|null, wasReset: boolean }}
 */
function selectNextUnit(allUnits, trueLoad, completedIds, currentUnitId = null, capacity = DEFAULT_CAPACITY) {
  const buildPool = (ignoreCompleted) =>
    allUnits.filter((u) => {
      const id = String(u._id);
      if (currentUnitId && id === String(currentUnitId)) return false;
      if (!ignoreCompleted && completedIds.has(id)) return false;
      return getUnitLoad(trueLoad, id) < capacity;
    });

  let pool = buildPool(false);
  let wasReset = false;

  if (pool.length === 0) {
    pool = buildPool(true);
    wasReset = true;
  }

  if (pool.length === 0) return { unit: null, wasReset };

  // Sort ascending by predictive effective load
  pool.sort((a, b) => getUnitLoad(trueLoad, a._id) - getUnitLoad(trueLoad, b._id));

  // Soft randomisation: pick among top-3 lowest-occupancy candidates
  const lowestCount = getUnitLoad(trueLoad, pool[0]._id);
  const candidates = pool
    .filter((u) => getUnitLoad(trueLoad, u._id) === lowestCount)
    .slice(0, 3);
  const unit = candidates[Math.floor(Math.random() * candidates.length)];

  return { unit, wasReset };
}

const buildEligibleUnitPool = (
  allUnits,
  trueLoad,
  completedIds,
  currentUnitId = null,
  capacity = DEFAULT_CAPACITY,
  { ignoreCompleted = false, ignoreCapacity = false } = {}
) => allUnits.filter((unit) => {
  const unitId = String(unit._id);
  if (currentUnitId && unitId === String(currentUnitId)) return false;
  if (!ignoreCompleted && completedIds.has(unitId)) return false;
  if (!ignoreCapacity && getUnitLoad(trueLoad, unitId) >= capacity) return false;
  return true;
});

const sortUnitsByEffectiveLoad = (pool, trueLoad) => [...pool]
  .sort((left, right) => getUnitLoad(trueLoad, left._id) - getUnitLoad(trueLoad, right._id));

function pickNextUnitForAssignment(
  allUnits,
  trueLoad,
  completedIds,
  currentUnitId = null,
  capacity = DEFAULT_CAPACITY
) {
  const primary = selectNextUnit(allUnits, trueLoad, completedIds, currentUnitId, capacity);
  if (primary.unit) {
    return { ...primary, usedOverflow: false };
  }

  let wasReset = false;
  let overflowPool = buildEligibleUnitPool(allUnits, trueLoad, completedIds, currentUnitId, capacity, {
    ignoreCompleted: false,
    ignoreCapacity: true,
  });

  if (overflowPool.length === 0) {
    overflowPool = buildEligibleUnitPool(allUnits, trueLoad, completedIds, currentUnitId, capacity, {
      ignoreCompleted: true,
      ignoreCapacity: true,
    });
    wasReset = true;
  }

  if (overflowPool.length === 0) {
    return { unit: null, wasReset, usedOverflow: true };
  }

  const sorted = sortUnitsByEffectiveLoad(overflowPool, trueLoad);
  const lowestCount = getUnitLoad(trueLoad, sorted[0]._id);
  const candidates = sorted.filter((unit) => getUnitLoad(trueLoad, unit._id) === lowestCount);
  const unit = candidates[Math.floor(Math.random() * candidates.length)];

  return { unit, wasReset, usedOverflow: true };
}

async function buildGlobalBatchPlan(allUnits, options = {}) {
  const today = startOfDay(options.now || new Date());
  const movementMaxDate = startOfDay(addDays(today, MOVEMENT_WINDOW_DAYS));

  const activeRotations = await Rotation.find({ status: 'active' })
    .select('intern unit startDate endDate')
    .exec();

  const occupancy = new Map();
  const leavingSoon = new Map();
  const moving = [];

  for (const row of activeRotations) {
    const unitId = row.unit?.toString?.() || null;
    if (!unitId) continue;

    occupancy.set(unitId, (occupancy.get(unitId) || 0) + 1);

    const end = row.endDate ? startOfDay(row.endDate) : null;
    if (!end) continue;

    if (end >= today && end <= startOfDay(addDays(today, LEAVING_SOON_DAYS))) {
      leavingSoon.set(unitId, (leavingSoon.get(unitId) || 0) + 1);
    }

    if (end >= today && end <= movementMaxDate) {
      moving.push({
        internId: row.intern?.toString?.() || null,
        currentUnitId: unitId,
        moveDate: end,
      });
    }
  }

  const recentIncoming = await getRecentIncomingCounts(RECENT_INCOMING_DAYS, today);
  const incomingBatch = new Map();
  const trueLoad = buildTrueLoadMap(allUnits, occupancy, leavingSoon, incomingBatch, recentIncoming);

  const movingInternIds = moving.map((item) => item.internId).filter(Boolean);
  const completedRows = movingInternIds.length > 0
    ? await Rotation.find({
      intern: { $in: movingInternIds },
      status: 'completed',
    }).select('intern unit').exec()
    : [];

  const completedByIntern = new Map();
  for (const row of completedRows) {
    const internId = row.intern?.toString?.() || null;
    const unitId = row.unit?.toString?.() || null;
    if (!internId || !unitId) continue;
    if (!completedByIntern.has(internId)) completedByIntern.set(internId, new Set());
    completedByIntern.get(internId).add(unitId);
  }

  moving.sort((left, right) => left.moveDate.getTime() - right.moveDate.getTime());
  const plan = new Map();

  for (const item of moving) {
    if (!item.internId) continue;
    const completedIds = completedByIntern.get(item.internId) || new Set();
    let pool = buildEligibleUnitPool(allUnits, trueLoad, completedIds, item.currentUnitId, DEFAULT_CAPACITY, {
      ignoreCompleted: false,
      ignoreCapacity: true,
    });

    if (pool.length === 0) {
      pool = buildEligibleUnitPool(allUnits, trueLoad, completedIds, item.currentUnitId, DEFAULT_CAPACITY, {
        ignoreCompleted: true,
        ignoreCapacity: true,
      });
    }

    if (pool.length === 0) {
      pool = [...allUnits];
    }

    const sorted = sortUnitsByEffectiveLoad(pool, trueLoad);
    if (!sorted.length) continue;

    const lowestLoad = getUnitLoad(trueLoad, sorted[0]._id);
    const candidates = sorted.filter((unit) => getUnitLoad(trueLoad, unit._id) === lowestLoad);
    const selected = candidates[Math.floor(Math.random() * candidates.length)];
    if (!selected) continue;

    const selectedId = String(selected._id);
    plan.set(item.internId, selectedId);
    incomingBatch.set(selectedId, (incomingBatch.get(selectedId) || 0) + 1);
    trueLoad.set(selectedId, (trueLoad.get(selectedId) || 0) + 1);
  }

  return { plan, occupancy, leavingSoon, recentIncoming, incomingBatch, trueLoad };
}

/**
 * TASK 6 – Assign first unit to a newly-created intern.
 * Creates exactly one 'active' Rotation starting on the intern's startDate.
 */
async function assignFirstUnit(intern, allUnits) {
  const unit = await selectBestUnit(allUnits);

  if (!unit) {
    throw new Error('No eligible unit available for assignment — all units are at capacity');
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

async function assignNextUnit(internOrId, options = {}) {
  const { completeCurrent = true, now = new Date() } = options;
  const intern = typeof internOrId === 'object' && internOrId?._id
    ? internOrId
    : await Intern.findById(internOrId).exec();

  if (!intern) throw new Error('Intern not found');

  const allUnits = await Unit.find({}).sort({ order: 1, position: 1, createdAt: 1 }).exec();
  if (!allUnits.length) throw new Error('No units configured');

  const batchPlan = await buildGlobalBatchPlan(allUnits, { now });
  const occupancy = batchPlan.occupancy;
  const completedIds = await getCompletedUnitIds(intern._id);
  const internsLeavingSoon = batchPlan.leavingSoon;
  const trueLoad = batchPlan.trueLoad;
  const plannedUnitId = batchPlan.plan.get(String(intern._id)) || null;

  const today = startOfDay(now);
  let previousUnitId = intern.currentUnit?.toString?.() || null;
  let previousEndDate = null;
  const currentRotation = await Rotation.findOne({ intern: intern._id, status: 'active' })
    .sort({ startDate: -1, createdAt: -1 })
    .exec();
  const latestRotation = currentRotation || await Rotation.findOne({ intern: intern._id })
    .sort({ endDate: -1, startDate: -1, createdAt: -1 })
    .exec();

  if (currentRotation && completeCurrent) {
    currentRotation.status = 'completed';
    await currentRotation.save();

    previousUnitId = currentRotation.unit?.toString?.() || previousUnitId;
    previousEndDate = currentRotation.endDate ? startOfDay(currentRotation.endDate) : null;
    if (previousUnitId) {
      completedIds.add(previousUnitId);
      if (occupancy.has(previousUnitId)) {
        occupancy.set(previousUnitId, Math.max(0, occupancy.get(previousUnitId) - 1));
      }
      if (trueLoad.has(previousUnitId)) {
        trueLoad.set(previousUnitId, (trueLoad.get(previousUnitId) || 0) - 1);
      }
    }
  } else if (latestRotation) {
    previousUnitId = latestRotation.unit?.toString?.() || previousUnitId;
    previousEndDate = latestRotation.endDate ? startOfDay(latestRotation.endDate) : null;
  }

  await Rotation.deleteMany({ intern: intern._id, status: 'upcoming' }).exec();

  let rotation = null;
  let unit = null;
  let wasReset = false;
  let usedOverflow = false;

  // Build enough historical completed rotations to catch up to "today" for very old start dates.
  const startAnchor = startOfDay(intern.startDate || today);
  const elapsedDays = Math.max(0, Math.floor((today.getTime() - startAnchor.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  const estimatedRotationsNeeded = Math.ceil(elapsedDays / Math.max(1, DEFAULT_DURATION));
  let safetyCounter = Math.max(20, estimatedRotationsNeeded + (allUnits.length * 4));
  let firstSelection = true;

  while (safetyCounter > 0) {
    safetyCounter -= 1;

    // Use new priority-based selection
    let unit = await selectBestUnit(allUnits, today, completedIds);
    if (firstSelection && plannedUnitId) {
      const plannedUnit = allUnits.find((entry) => String(entry._id) === String(plannedUnitId));
      if (plannedUnit && !(await isUnitFull(plannedUnit))) {
        unit = plannedUnit;
      }
    }
    firstSelection = false;

    if (!unit) {
      // Fallback to old logic if no unit available
      const nextSelection = pickNextUnitForAssignment(
        allUnits,
        trueLoad,
        completedIds,
        previousUnitId
      );
      unit = nextSelection.unit;
      wasReset = wasReset || nextSelection.wasReset;
      usedOverflow = usedOverflow || nextSelection.usedOverflow;
    }

    if (!unit) {
      intern.currentUnit = null;
      intern.status = 'completed';
      await intern.save();
      return { rotation: null, unit: null, wasReset, usedOverflow };
    }

    const duration = getUnitDuration(unit);
    const startDate = getNextRotationStartDate(previousEndDate, intern.startDate || today);
    const { endDate } = getRotationWindow(startDate, duration);
    const rotationStatus = endDate < today ? 'completed' : 'active';

    rotation = await Rotation.create({
      intern: intern._id,
      unit: unit._id,
      startDate,
      endDate,
      baseDuration: duration,
      extensionDays: 0,
      duration,
      status: rotationStatus,
    });

    previousUnitId = unit._id.toString();
    previousEndDate = endDate;

    trueLoad.set(previousUnitId, (trueLoad.get(previousUnitId) || 0) + 1);

    if (rotationStatus === 'completed') {
      completedIds.add(previousUnitId);
      continue;
    }

    break;
  }

  if (!rotation || rotation.status !== 'active') {
    throw new Error('Failed to build a continuous rotation timeline');
  }

  const allRotations = await Rotation.find({ intern: intern._id })
    .sort({ startDate: 1, createdAt: 1 })
    .select('_id')
    .exec();

  intern.currentUnit = unit._id;
  intern.extensionDays = 0;
  intern.status = 'active';
  intern.rotationHistory = allRotations.map((entry) => entry._id);
  await intern.save();

  return { rotation, unit, wasReset, usedOverflow };
}

/**
 * TASK 6 – Advance intern to the next unit.
 * Called when the current rotation completes.
 * Marks current rotation as completed and creates a new active rotation.
 */
async function advanceToNextUnit(internId) {
  const { rotation } = await assignNextUnit(internId, { completeCurrent: true, now: new Date() });
  return rotation;
}

async function ensureContinuousAssignment(internId, now = new Date()) {
  const intern = await Intern.findById(internId).exec();
  if (!intern) throw new Error('Intern not found');

  const today = startOfDay(now);
  const activeRotation = await Rotation.findOne({ intern: internId, status: 'active' })
    .sort({ startDate: -1, createdAt: -1 })
    .exec();

  if (activeRotation) {
    const startDate = activeRotation.startDate ? startOfDay(activeRotation.startDate) : null;
    const endDate = activeRotation.endDate ? startOfDay(activeRotation.endDate) : null;

    if (startDate && today < startDate) {
      activeRotation.status = 'upcoming';
      await activeRotation.save();
    } else if (endDate && today > endDate) {
      return assignNextUnit(intern, { completeCurrent: true, now: today });
    } else {
      const activeExtensionDays = Number(activeRotation.extensionDays || 0);
      const desiredStatus = activeExtensionDays > 0 ? 'extended' : 'active';
      const currentUnitId = activeRotation.unit?.toString?.() || null;
      const hasChanges = String(intern.currentUnit || '') !== String(currentUnitId || '')
        || intern.status !== desiredStatus
        || Number(intern.extensionDays || 0) !== activeExtensionDays;

      if (hasChanges) {
        intern.currentUnit = activeRotation.unit || null;
        intern.status = desiredStatus;
        intern.extensionDays = activeExtensionDays;
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
    intern.status = Number(intern.extensionDays || 0) > 0 ? 'extended' : 'active';
    intern.rotationHistory = [rotation._id];
    await intern.save();
    return { rotation, unit, wasReset: false, usedOverflow: false };
  }

  return assignNextUnit(intern, { completeCurrent: false, now: today });
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

  const eligible = [];
  for (const unit of allUnits) {
    const unitId = String(unit._id);
    if (currentUnitId && unitId === String(currentUnitId)) continue;
    if (completedIds.has(unitId)) continue;
    if (await isUnitFull(unit)) continue;
    eligible.push({
      id: unitId,
      name: unit.name,
      durationDays: getUnitDuration(unit),
      duration_days: getUnitDuration(unit),
    });
  }
  return eligible;
}

module.exports = {
  DEFAULT_CAPACITY,
  DEFAULT_DURATION,
  getUnitOccupancy,
  getUnitInternsLeavingSoon,
  getActiveInternsCount,
  isUnitFull,
  selectBestUnit,
  getCompletedUnitIds,
  getNextRotationStartDate,
  getRotationWindow,
  selectNextUnit,
  pickNextUnitForAssignment,
  assignFirstUnit,
  assignNextUnit,
  advanceToNextUnit,
  ensureContinuousAssignment,
  getEligibleUnits,
};
