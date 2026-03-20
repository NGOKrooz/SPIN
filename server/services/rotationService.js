const { startOfDay, addDays, isAfter } = require('date-fns');
const Rotation = require('../models/Rotation');
const Unit = require('../models/Unit');
const Intern = require('../models/Intern');

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

    const nextStartDate = addDays(lastRotation.endDate, 1);
    const nextEndDate = addDays(nextStartDate, 6); // 7 days default

    await Rotation.create({
      intern: internId,
      unit: nextUnit._id,
      startDate: nextStartDate,
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
  const { internId, unitId, startDate, endDate } = data;

  return await Rotation.create({
    intern: internId,
    unit: unitId,
    startDate,
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

module.exports = {
  getCurrentRotations,
  getUpcomingRotations,
  autoAdvanceRotation,
  createManualRotation,
  updateRotation,
  deleteRotation,
};


