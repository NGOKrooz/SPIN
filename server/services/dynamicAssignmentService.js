'use strict';

const Intern = require('../models/Intern');
const Rotation = require('../models/Rotation');
const Unit = require('../models/Unit');

const DEFAULT_CAPACITY = 5;
const DEFAULT_DURATION = 20;

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
function selectNextUnit(allUnits, occupancy, completedIds, currentUnitId = null, capacity = DEFAULT_CAPACITY) {
  const buildPool = (ignoreCompleted) =>
    allUnits.filter((u) => {
      const id = String(u._id);
      if (currentUnitId && id === String(currentUnitId)) return false;
      if (!ignoreCompleted && completedIds.has(id)) return false;
      return (occupancy.get(id) || 0) < capacity;
    });

  let pool = buildPool(false);
  let wasReset = false;

  if (pool.length === 0) {
    pool = buildPool(true);
    wasReset = true;
  }

  if (pool.length === 0) return { unit: null, wasReset };

  // Sort ascending by current occupancy
  pool.sort((a, b) => (occupancy.get(String(a._id)) || 0) - (occupancy.get(String(b._id)) || 0));

  // Soft randomisation: pick among top-3 lowest-occupancy candidates
  const lowestCount = occupancy.get(String(pool[0]._id)) || 0;
  const candidates = pool
    .filter((u) => (occupancy.get(String(u._id)) || 0) <= lowestCount)
    .slice(0, 3);
  const unit = candidates[Math.floor(Math.random() * candidates.length)];

  return { unit, wasReset };
}

const buildEligibleUnitPool = (
  allUnits,
  occupancy,
  completedIds,
  currentUnitId = null,
  capacity = DEFAULT_CAPACITY,
  { ignoreCompleted = false, ignoreCapacity = false } = {}
) => allUnits.filter((unit) => {
  const unitId = String(unit._id);
  if (currentUnitId && unitId === String(currentUnitId)) return false;
  if (!ignoreCompleted && completedIds.has(unitId)) return false;
  if (!ignoreCapacity && (occupancy.get(unitId) || 0) >= capacity) return false;
  return true;
});

const sortUnitsByOccupancy = (pool, occupancy) => [...pool]
  .sort((left, right) => (occupancy.get(String(left._id)) || 0) - (occupancy.get(String(right._id)) || 0));

function pickNextUnitForAssignment(
  allUnits,
  occupancy,
  completedIds,
  currentUnitId = null,
  capacity = DEFAULT_CAPACITY
) {
  const primary = selectNextUnit(allUnits, occupancy, completedIds, currentUnitId, capacity);
  if (primary.unit) {
    return { ...primary, usedOverflow: false };
  }

  let wasReset = false;
  let overflowPool = buildEligibleUnitPool(allUnits, occupancy, completedIds, currentUnitId, capacity, {
    ignoreCompleted: false,
    ignoreCapacity: true,
  });

  if (overflowPool.length === 0) {
    overflowPool = buildEligibleUnitPool(allUnits, occupancy, completedIds, currentUnitId, capacity, {
      ignoreCompleted: true,
      ignoreCapacity: true,
    });
    wasReset = true;
  }

  if (overflowPool.length === 0) {
    return { unit: null, wasReset, usedOverflow: true };
  }

  const sorted = sortUnitsByOccupancy(overflowPool, occupancy);
  const lowestCount = occupancy.get(String(sorted[0]._id)) || 0;
  const candidates = sorted.filter((unit) => (occupancy.get(String(unit._id)) || 0) === lowestCount);
  const unit = candidates[Math.floor(Math.random() * candidates.length)];

  return { unit, wasReset, usedOverflow: true };
}

/**
 * TASK 6 – Assign first unit to a newly-created intern.
 * Creates exactly one 'active' Rotation starting on the intern's startDate.
 */
async function assignFirstUnit(intern, allUnits) {
  const occupancy = await getUnitOccupancy();
  const { unit } = pickNextUnitForAssignment(allUnits, occupancy, new Set(), null);

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

  const [occupancy, completedIds] = await Promise.all([
    getUnitOccupancy(),
    getCompletedUnitIds(intern._id),
  ]);

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
  let safetyCounter = Math.max(5, allUnits.length * 3);

  while (safetyCounter > 0) {
    safetyCounter -= 1;

    const nextSelection = pickNextUnitForAssignment(
      allUnits,
      occupancy,
      completedIds,
      previousUnitId
    );

    unit = nextSelection.unit;
    wasReset = wasReset || nextSelection.wasReset;
    usedOverflow = usedOverflow || nextSelection.usedOverflow;

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
  intern.status = Number(intern.extensionDays || 0) > 0 ? 'extended' : 'active';
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
      await Rotation.deleteMany({ intern: intern._id, status: 'upcoming' }).exec();

      const desiredStatus = Number(intern.extensionDays || 0) > 0 ? 'extended' : 'active';
      const currentUnitId = activeRotation.unit?.toString?.() || null;
      const hasChanges = String(intern.currentUnit || '') !== String(currentUnitId || '')
        || intern.status !== desiredStatus;

      if (hasChanges) {
        intern.currentUnit = activeRotation.unit || null;
        intern.status = desiredStatus;
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
  const [allUnits, occupancy, completedIds] = await Promise.all([
    Unit.find({}).sort({ order: 1, position: 1, createdAt: 1 }).exec(),
    getUnitOccupancy(),
    getCompletedUnitIds(internId),
  ]);

  let pool = buildEligibleUnitPool(allUnits, occupancy, completedIds, currentUnitId, DEFAULT_CAPACITY, {
    ignoreCompleted: false,
    ignoreCapacity: false,
  });

  if (pool.length === 0) {
    pool = buildEligibleUnitPool(allUnits, occupancy, completedIds, currentUnitId, DEFAULT_CAPACITY, {
      ignoreCompleted: true,
      ignoreCapacity: false,
    });
  }

  if (pool.length === 0) {
    pool = buildEligibleUnitPool(allUnits, occupancy, completedIds, currentUnitId, DEFAULT_CAPACITY, {
      ignoreCompleted: true,
      ignoreCapacity: true,
    });
  }

  return sortUnitsByOccupancy(pool, occupancy)
    .map((u) => ({
      id: String(u._id),
      name: u.name,
      durationDays: u.durationDays || DEFAULT_DURATION,
      duration_days: u.durationDays || DEFAULT_DURATION,
      currentInterns: occupancy.get(String(u._id)) || 0,
      capacity: DEFAULT_CAPACITY,
    }));
}

module.exports = {
  DEFAULT_CAPACITY,
  DEFAULT_DURATION,
  getUnitOccupancy,
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
