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
  const { name, durationDays, duration, order, position, patientCount, capacity, description } = data;

  const normalizedName = typeof name === 'string' ? name.trim() : '';
  if (!normalizedName) {
    throw new Error('Unit name is required');
  }

  // Normalize duration (support `duration` or `durationDays`)
  const parsedDurationDays = Number(durationDays);
  const parsedDuration = Number(duration);
  const finalDurationDays = Number.isFinite(parsedDurationDays)
    ? parsedDurationDays
    : (Number.isFinite(parsedDuration) ? parsedDuration : NaN);

  if (!Number.isFinite(finalDurationDays) || finalDurationDays <= 0) {
    throw new Error('Valid duration is required');
  }

  const finalPatientCount = Number.isFinite(Number(patientCount)) ? Number(patientCount) : 0;
  const finalCapacity = Number.isFinite(Number(capacity)) ? Number(capacity) : 0;

  // Normalize ordering inputs. `order` is canonical; `position` is accepted for backward compatibility.
  let finalOrder = Number.isInteger(order) ? order : (Number.isInteger(position) ? position : null);
  if (finalOrder === null) {
    const lastUnit = await Unit.findOne({}).sort({ order: -1 }).exec();
    finalOrder = (lastUnit?.order || 0) + 1;
  }

  const unit = new Unit({
    name: normalizedName,
    order: finalOrder,
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
  const { name, durationDays, duration, order, position, patientCount, capacity, description } = data;

  const updateData = {};
  if (name !== undefined) updateData.name = typeof name === 'string' ? name.trim() : name;
  if (durationDays !== undefined) updateData.durationDays = Number(durationDays);
  if (duration !== undefined) updateData.durationDays = Number(duration);
  if (order !== undefined) updateData.order = order;
  if (position !== undefined && order === undefined) updateData.order = position;
  if (capacity !== undefined) updateData.capacity = Number(capacity);
  if (patientCount !== undefined) updateData.patientCount = Number(patientCount);
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


