const { startOfDay, addDays, isAfter } = require('date-fns');
const Rotation = require('../models/Rotation');
const Unit = require('../models/Unit');
const Intern = require('../models/Intern');
const { getEligibleUnits } = require('./dynamicAssignmentService');

const DEFAULT_ROTATION_DURATION_DAYS = 20;

const getDuration = (unitDoc) => {
  const raw = unitDoc?.duration ?? unitDoc?.durationDays ?? unitDoc?.duration_days;
  const duration = Number(raw);
  return Number.isFinite(duration) && duration > 0 ? duration : DEFAULT_ROTATION_DURATION_DAYS;
};

/**
 * Get current rotations (active today)
 */
async function getCurrentRotations() {
  const today = startOfDay(new Date());

  return await Rotation.find({
    startDate: { $lte: today },
    endDate: { $gte: today },
  })
    .populate('intern')
    .populate('unit')
    .sort({ startDate: 1 })
    .exec();
}

/**
 * Get upcoming rotations
 */
async function getUpcomingRotations(daysAhead = 30) {
  const today = startOfDay(new Date());
  const futureDate = addDays(today, daysAhead);

  return await Rotation.find({
    startDate: { $gt: today, $lte: futureDate },
  })
    .populate('intern')
    .populate('unit')
    .sort({ startDate: 1 })
    .exec();
}

/**
 * Auto-advance rotations for an intern
 */
async function autoAdvanceRotation(internId) {
  const today = startOfDay(new Date());

  const lastRotation = await Rotation.findOne({ intern: internId })
    .sort({ endDate: -1 })
    .populate('intern')
    .populate('unit')
    .exec();

  if (!lastRotation) return false;

  if (isAfter(today, lastRotation.endDate)) {
    if (lastRotation.intern?.status === 'completed') {
      return false;
    }

    const allUnits = await Unit.find({}).sort({ order: 1 }).exec();
    if (allUnits.length === 0) return false;

    const currentUnitIndex = allUnits.findIndex(u => u._id.equals(lastRotation.unit._id));
    const nextUnitIndex = (currentUnitIndex + 1) % allUnits.length;
    const nextUnit = allUnits[nextUnitIndex];

    const duration = getDuration(nextUnit);
    const nextStartDate = new Date(lastRotation.endDate);
    const nextEndDate = new Date(nextStartDate);
    nextEndDate.setDate(nextEndDate.getDate() + duration);

    await Rotation.create({
      intern: internId,
      unit: nextUnit._id,
      startDate: nextStartDate,
      duration,
      endDate: nextEndDate,
      status: 'active'
    });

    await Intern.findByIdAndUpdate(internId, { currentUnit: nextUnit._id }).exec();
    return true;
  }

  return false;
}

/**
 * Create a manual rotation assignment
 */
async function createManualRotation(data) {
  const { internId, unitId } = data;
  const unit = await Unit.findById(unitId).exec();
  const duration = getDuration(unit);
  let startDate = data.startDate ? new Date(data.startDate) : new Date();
  if (Number.isNaN(startDate.getTime())) {
    startDate = new Date();
  }

  let endDate = data.endDate ? new Date(data.endDate) : new Date(startDate);
  if (!data.endDate || Number.isNaN(endDate.getTime())) {
    endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + duration);
  }

  const today = startOfDay(new Date());
  const rotationStart = startOfDay(startDate);
  const status = rotationStart > today ? 'upcoming' : 'active';

  return await Rotation.create({
    intern: internId,
    unit: unitId,
    startDate,
    duration,
    endDate,
    status,
  });
}

/**
 * Update a rotation
 */
async function updateRotation(rotationId, data) {
  const updateData = {};
  if (data.startDate !== undefined) updateData.startDate = data.startDate;
  if (data.endDate !== undefined) updateData.endDate = data.endDate;
  if (data.unit !== undefined) updateData.unit = data.unit;

  return await Rotation.findByIdAndUpdate(rotationId, updateData, { new: true })
    .populate('intern')
    .populate('unit')
    .exec();
}

/**
 * Delete a rotation
 */
async function deleteRotation(rotationId) {
  return await Rotation.findByIdAndDelete(rotationId).exec();
}

async function acceptMovement(internId) {
  const intern = await Intern.findById(internId).exec();
  if (!intern) throw new Error('Intern not found');

  const activeRotation = await Rotation.findOne({ intern: intern._id, status: 'active' })
    .populate('unit')
    .sort({ startDate: 1 })
    .exec();
  if (!activeRotation) throw new Error('No active rotation available to accept');

  const nextRotation = await Rotation.findOne({
    intern: intern._id,
    status: { $in: ['awaiting_confirmation', 'upcoming'] },
  })
    .populate('unit')
    .sort({ startDate: 1 })
    .exec();
  if (!nextRotation) throw new Error('No next rotation available to activate');

  // FIX: activate the next rotation BEFORE marking the old one completed.
  // Previously this saved activeRotation as 'completed' first, then nextRotation
  // as 'active' second — for the gap between those two writes, this intern had
  // ZERO rotations with status 'active' in the database. Any request that hit
  // GET /api/interns or /schedule during that gap (services/assignmentUtils.js's
  // resolveCurrentAssignment only ever looks for status === 'active') would find
  // no current rotation, and syncInternRotationStates (routes/interns.js) falls
  // back to intern.status = 'completed' whenever that happens — even though the
  // intern still had units left to go. It self-corrected on the next request
  // once nextRotation.save() finished, which is why it looked like a flash.
  // Reordering removes the zero-active window entirely: there's now a brief
  // moment with TWO active rotations instead, which resolveCurrentAssignment
  // handles fine (it just takes the first match).
  const nextDuration = getDuration(nextRotation.unit);
  const nextStartDate = startOfDay(new Date());
  const nextEndDate = addDays(nextStartDate, nextDuration - 1);

  nextRotation.status = 'active';
  nextRotation.startDate = nextStartDate;
  nextRotation.endDate = nextEndDate;
  nextRotation.duration = nextDuration;
  nextRotation.extensionDays = 0;
  await nextRotation.save();

  activeRotation.status = 'completed';
  // FIX (issue 3): actualEndDate was being set but nothing ever displayed it —
  // the "Completed Rotations" view reads start_date/end_date, so a rotation
  // that sat overdue for extra days before being accepted still showed only
  // its ORIGINAL planned duration (e.g. "30 days completed" instead of the
  // true 35). endDate now gets set to today directly, so the completed
  // record reflects the real full duration including the overdue period.
  const trueCompletionDate = startOfDay(new Date());
  activeRotation.actualEndDate = trueCompletionDate;
  activeRotation.endDate = trueCompletionDate;
  await activeRotation.save();

  // FIX (issue 5): extension days must persist as a running total across the
  // WHOLE internship, not reset to 0 every time a unit is accepted. Before
  // this fix, only the per-rotation extensionDays existed, which got zeroed
  // out on every new rotation — so any overdue history from a previous unit
  // was completely lost the moment the intern moved on. intern.totalExtensionDays
  // is now a permanent bank: whatever this rotation's live overdue count was
  // right before being accepted gets added to it here, forever. The new
  // rotation's own live counters start fresh at 0, but the banked total is
  // never touched by anything except this line.
  const finalOverdueDaysForThisRotation = Number(activeRotation.extensionDays || 0);
  intern.totalExtensionDays = Number(intern.totalExtensionDays || 0) + finalOverdueDaysForThisRotation;

  intern.currentUnit = nextRotation.unit?._id || nextRotation.unit;
  // FIX (status model): 'extended' removed — only active, pending, completed
  // exist now. Extension days remain tracked as a number on the record; they
  // just no longer produce their own status word.
  intern.status = 'active';
  // Fresh rotation, fresh live counters — the permanent bank above is what
  // carries the history forward, not these.
  intern.extensionDays = 0;
  intern.manualExtensionDays = 0;
  intern.autoExtensionDays = 0;
  await intern.save();

  return {
    internId: intern._id.toString(),
    internName: intern.name,
    fromUnit: activeRotation.unit?.name || String(activeRotation.unit),
    toUnit: nextRotation.unit?.name || String(nextRotation.unit),
    activeRotationId: activeRotation._id.toString(),
    nextRotationId: nextRotation._id.toString(),
  };
}

async function reassignNextUnit(internId, newUnitId) {
  const intern = await Intern.findById(internId).exec();
  if (!intern) throw new Error('Intern not found');

  const nextRotation = await Rotation.findOne({
    intern: intern._id,
    status: { $in: ['awaiting_confirmation', 'upcoming'] },
  })
    .populate('unit')
    .sort({ startDate: 1 })
    .exec();
  if (!nextRotation) throw new Error('No next rotation available to reassign');

  const currentRotation = await Rotation.findOne({ intern: intern._id, status: 'active' })
    .populate('unit')
    .sort({ startDate: 1 })
    .exec();
  const currentUnitId = currentRotation?.unit?._id?.toString?.() || intern.currentUnit?.toString?.() || null;
  const eligibleUnits = await getEligibleUnits(intern._id, currentUnitId);
  const selectedUnit = eligibleUnits.find((unit) => String(unit._id || unit.id) === String(newUnitId));

  if (!selectedUnit) {
    throw new Error('Selected unit is not eligible for reassignment');
  }

  const previousUnitName = nextRotation.unit?.name || 'Unknown unit';
  nextRotation.unit = newUnitId;
  const updatedRotation = await nextRotation.save();

  intern.currentUnit = currentRotation?.unit?._id || intern.currentUnit || null;
  // FIX (status model + correctness): reassigning only changes which unit is
  // queued next — the current rotation is still overdue and unconfirmed, so
  // the intern should stay 'pending', not flip back to 'active'. (It used to
  // self-correct back to 'pending' on the next request anyway once
  // ensureContinuousAssignment re-ran, but setting it explicitly here is
  // correct immediately instead of relying on that.) 'extended' is removed —
  // only active, pending, completed exist now.
  intern.status = 'pending';
  await intern.save();

  return {
    internId: intern._id.toString(),
    internName: intern.name,
    previousUnit: previousUnitName,
    newUnit: selectedUnit.name,
    nextRotationId: nextRotation._id.toString(),
    updatedRotation,
  };
}

module.exports = {
  getCurrentRotations,
  getUpcomingRotations,
  autoAdvanceRotation,
  createManualRotation,
  updateRotation,
  deleteRotation,
  acceptMovement,
  reassignNextUnit,
};