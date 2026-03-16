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
    .populate('internId')
    .populate('unitId')
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
    .populate('internId')
    .populate('unitId')
    .sort({ startDate: 1 })
    .exec();
}

/**
 * Auto-advance rotations for an intern
 */
async function autoAdvanceRotation(internId) {
  const today = startOfDay(new Date());

  const lastRotation = await Rotation.findOne({ internId })
    .sort({ endDate: -1 })
    .populate('internId')
    .populate('unitId')
    .exec();

  if (!lastRotation) return false;

  if (isAfter(today, lastRotation.endDate)) {
    if (lastRotation.internId?.status === 'Completed') {
      return false;
    }

    const allUnits = await Unit.find({}).sort({ name: 1 }).exec();
    if (allUnits.length === 0) return false;

    const currentUnitIndex = allUnits.findIndex(u => u._id.equals(lastRotation.unitId._id));
    const nextUnitIndex = (currentUnitIndex + 1) % allUnits.length;
    const nextUnit = allUnits[nextUnitIndex];

    const nextStartDate = addDays(lastRotation.endDate, 1);
    const nextEndDate = addDays(nextStartDate, nextUnit.durationDays - 1);

    await Rotation.create({
      internId,
      unitId: nextUnit._id,
      startDate: nextStartDate,
      endDate: nextEndDate,
      isManualAssignment: false,
    });

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
    internId,
    unitId,
    startDate,
    endDate,
    isManualAssignment: true,
  });
}

/**
 * Update a rotation
 */
async function updateRotation(rotationId, data) {
  const updateData = {};
  if (data.startDate !== undefined) updateData.startDate = data.startDate;
  if (data.endDate !== undefined) updateData.endDate = data.endDate;
  if (data.unitId !== undefined) updateData.unitId = data.unitId;

  return await Rotation.findByIdAndUpdate(rotationId, updateData, { new: true })
    .populate('internId')
    .populate('unitId')
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


