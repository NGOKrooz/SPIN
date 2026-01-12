const prisma = require('../database/prisma');

/**
 * Get all units
 */
async function getAllUnits() {
  return await prisma.unit.findMany({
    orderBy: { name: 'asc' },
  });
}

/**
 * Get unit by ID
 */
async function getUnitById(id) {
  return await prisma.unit.findUnique({
    where: { id },
  });
}

/**
 * Create a new unit
 */
async function createUnit(data) {
  const { name, durationDays, workload, patientCount, description } = data;

  // Calculate workload from patient_count if not provided
  let finalWorkload = workload;
  if (!finalWorkload && patientCount !== undefined) {
    if (patientCount <= 4) finalWorkload = 'Low';
    else if (patientCount <= 8) finalWorkload = 'Medium';
    else finalWorkload = 'High';
  }

  return await prisma.unit.create({
    data: {
      name,
      durationDays,
      workload: finalWorkload || 'Medium',
      patientCount: patientCount || 0,
      description: description || null,
    },
  });
}

/**
 * Update a unit
 */
async function updateUnit(id, data) {
  const { name, durationDays, workload, patientCount, description } = data;

  // Calculate workload from patient_count if not provided
  let finalWorkload = workload;
  if (!finalWorkload && patientCount !== undefined) {
    if (patientCount <= 4) finalWorkload = 'Low';
    else if (patientCount <= 8) finalWorkload = 'Medium';
    else finalWorkload = 'High';
  }

  return await prisma.unit.update({
    where: { id },
    data: {
      ...(name && { name }),
      ...(durationDays !== undefined && { durationDays }),
      ...(finalWorkload && { workload: finalWorkload }),
      ...(patientCount !== undefined && { patientCount }),
      ...(description !== undefined && { description }),
    },
  });
}

/**
 * Delete a unit
 */
async function deleteUnit(id) {
  return await prisma.unit.delete({
    where: { id },
  });
}

module.exports = {
  getAllUnits,
  getUnitById,
  createUnit,
  updateUnit,
  deleteUnit,
};

