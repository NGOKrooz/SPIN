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

  return await Rotation.create({
    intern: internId,
    unit: unitId,
    startDate,
    duration,
    endDate,
    status: 'active'
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

  activeRotation.status = 'completed';
  activeRotation.actualEndDate = startOfDay(new Date());
  await activeRotation.save();

  const nextDuration = getDuration(nextRotation.unit);
  const nextStartDate = startOfDay(new Date());
  const nextEndDate = addDays(nextStartDate, nextDuration - 1);

  nextRotation.status = 'active';
  nextRotation.startDate = nextStartDate;
  nextRotation.endDate = nextEndDate;
  nextRotation.duration = nextDuration;
  nextRotation.extensionDays = 0;
  await nextRotation.save();

  intern.currentUnit = nextRotation.unit?._id || nextRotation.unit;
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


