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

/**
 * TASK 6 – Assign first unit to a newly-created intern.
 * Creates exactly one 'active' Rotation starting on the intern's startDate.
 */
async function assignFirstUnit(intern, allUnits) {
  const occupancy = await getUnitOccupancy();
  const { unit } = selectNextUnit(allUnits, occupancy, new Set(), null);

  if (!unit) {
    throw new Error('No eligible unit available for assignment — all units are at capacity');
  }

  const duration = getUnitDuration(unit);
  const startDate = startOfDay(intern.startDate || new Date());
  const endDate = startOfDay(addDays(startDate, duration - 1));

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
  const intern = await Intern.findById(internId).exec();
  if (!intern) throw new Error('Intern not found');

  const allUnits = await Unit.find({}).sort({ order: 1, position: 1, createdAt: 1 }).exec();
  if (!allUnits.length) throw new Error('No units configured');

  const [occupancy, completedIds] = await Promise.all([
    getUnitOccupancy(),
    getCompletedUnitIds(internId),
  ]);

  const currentUnitId = intern.currentUnit?.toString?.() || null;

  // Mark current active rotation as completed
  const current = await Rotation.findOne({ intern: internId, status: 'active' }).exec();
  if (current) {
    current.status = 'completed';
    await current.save();
    const uid = current.unit?.toString?.() || null;
    if (uid) {
      completedIds.add(uid);
      if (occupancy.has(uid)) occupancy.set(uid, Math.max(0, occupancy.get(uid) - 1));
    }
  }

  // Select next unit
  const { unit, wasReset } = selectNextUnit(allUnits, occupancy, completedIds, null);

  if (!unit) {
    intern.currentUnit = null;
    intern.status = 'completed';
    await intern.save();
    return null;
  }

  const duration = getUnitDuration(unit);
  const startDate = startOfDay(new Date());
  const endDate = startOfDay(addDays(startDate, duration - 1));

  const nextRotation = await Rotation.create({
    intern: internId,
    unit: unit._id,
    startDate,
    endDate,
    baseDuration: duration,
    extensionDays: 0,
    duration,
    status: 'active',
  });

  intern.currentUnit = unit._id;
  intern.status = wasReset ? 'active' : 'active';
  const allRotations = await Rotation.find({ intern: internId })
    .sort({ startDate: 1, createdAt: 1 })
    .select('_id')
    .exec();
  intern.rotationHistory = allRotations.map((r) => r._id);
  await intern.save();

  return nextRotation;
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

  return allUnits
    .filter((u) => {
      const id = String(u._id);
      if (currentUnitId && id === String(currentUnitId)) return false;
      if (completedIds.has(id)) return false;
      return (occupancy.get(id) || 0) < DEFAULT_CAPACITY;
    })
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
  selectNextUnit,
  assignFirstUnit,
  advanceToNextUnit,
  getEligibleUnits,
};
