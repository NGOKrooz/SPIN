const Unit = require('../models/Unit');

function calculateWorkload(unit) {
  const patientCount = Number(unit.patientCount || 0);
  const capacity = Number(unit.capacity || 0);
  if (!patientCount || !capacity) return 'Low';

  const ratio = patientCount / capacity;
  if (ratio >= 0.8) return 'High';
  if (ratio >= 0.4) return 'Medium';
  return 'Low';
}

function isCritical(unit) {
  const patientCount = Number(unit.patientCount || 0);
  const capacity = Number(unit.capacity || 0);
  return capacity > 0 && patientCount >= capacity;
}

/**
 * Get all units
 */
async function getAllUnits() {
  return await Unit.find({}).sort({ name: 1 }).exec();
}

/**
 * Get unit by ID
 */
async function getUnitById(id) {
  return await Unit.findById(id).exec();
}

/**
 * Create a new unit
 */
async function createUnit(data) {
  const { name, durationDays, duration, workload, patientCount, capacity, description } = data;

  // Normalize duration (support `duration` or `durationDays`)
  const finalDurationDays = typeof durationDays === 'number' ? durationDays : (typeof duration === 'number' ? duration : 7);

  const finalPatientCount = typeof patientCount === 'number' ? patientCount : 0;
  const finalCapacity = typeof capacity === 'number' ? capacity : 0;

  const unit = new Unit({
    name,
    durationDays: finalDurationDays,
    capacity: finalCapacity,
    patientCount: finalPatientCount,
    workload: calculateWorkload({ patientCount: finalPatientCount, capacity: finalCapacity }),
    description: description || null,
  });

  return await unit.save();
}

/**
 * Update a unit
 */
async function updateUnit(id, data) {
  const { name, durationDays, duration, workload, patientCount, capacity, description } = data;

  const updateData = {};
  if (name !== undefined) updateData.name = name;
  if (durationDays !== undefined) updateData.durationDays = durationDays;
  if (duration !== undefined) updateData.durationDays = duration;
  if (capacity !== undefined) updateData.capacity = capacity;
  if (patientCount !== undefined) updateData.patientCount = patientCount;
  if (description !== undefined) updateData.description = description;

  const updatedUnit = await Unit.findByIdAndUpdate(id, updateData, { new: true }).exec();

  if (updatedUnit) {
    const computedWorkload = calculateWorkload(updatedUnit);
    if (computedWorkload !== updatedUnit.workload) {
      updatedUnit.workload = computedWorkload;
      await updatedUnit.save();
    }
  }

  return updatedUnit;
}

/**
 * Delete a unit
 */
async function deleteUnit(id) {
  return await Unit.findByIdAndDelete(id).exec();
}

module.exports = {
  getAllUnits,
  getUnitById,
  createUnit,
  updateUnit,
  deleteUnit,
  calculateWorkload,
  isCritical,
};


