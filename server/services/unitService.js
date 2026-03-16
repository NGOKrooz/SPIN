const Unit = require('../models/Unit');

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
  const { name, durationDays, workload, patientCount, description } = data;

  // If frontend sends snake_case fields, they should already be normalized
  // by the route layer. We still defend against undefined values here.
  const finalDurationDays = typeof durationDays === 'number' ? durationDays : 7;

  let finalWorkload = workload;
  if (!finalWorkload && patientCount !== undefined) {
    if (patientCount <= 4) finalWorkload = 'Low';
    else if (patientCount <= 8) finalWorkload = 'Medium';
    else finalWorkload = 'High';
  }

  const unit = new Unit({
    name,
    durationDays: finalDurationDays,
    workload: finalWorkload || 'Medium',
    patientCount: typeof patientCount === 'number' ? patientCount : 0,
    description: description || null,
  });

  return await unit.save();
}

/**
 * Update a unit
 */
async function updateUnit(id, data) {
  const { name, durationDays, workload, patientCount, description } = data;

  let finalWorkload = workload;
  if (!finalWorkload && patientCount !== undefined) {
    if (patientCount <= 4) finalWorkload = 'Low';
    else if (patientCount <= 8) finalWorkload = 'Medium';
    else finalWorkload = 'High';
  }

  const updateData = {};
  if (name !== undefined) updateData.name = name;
  if (durationDays !== undefined) updateData.durationDays = durationDays;
  if (finalWorkload) updateData.workload = finalWorkload;
  if (patientCount !== undefined) updateData.patientCount = patientCount;
  if (description !== undefined) updateData.description = description;

  return await Unit.findByIdAndUpdate(id, updateData, { new: true }).exec();
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
};


