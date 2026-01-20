const prisma = require('../database/prisma');
const { startOfDay, isAfter, isBefore } = require('date-fns');

/**
 * Get current rotations (active today)
 */
async function getCurrentRotations() {
  const today = startOfDay(new Date());

  return await prisma.rotation.findMany({
    where: {
      startDate: { lte: today },
      endDate: { gte: today },
    },
    include: {
      intern: true,
      unit: true,
    },
    orderBy: {
      startDate: 'asc',
    },
  });
}

/**
 * Get upcoming rotations
 */
async function getUpcomingRotations(daysAhead = 30) {
  const today = startOfDay(new Date());
  const futureDate = new Date(today);
  futureDate.setDate(futureDate.getDate() + daysAhead);

  return await prisma.rotation.findMany({
    where: {
      startDate: {
        gt: today,
        lte: futureDate,
      },
    },
    include: {
      intern: true,
      unit: true,
    },
    orderBy: {
      startDate: 'asc',
    },
  });
}

/**
 * Auto-advance rotations for an intern
 */
async function autoAdvanceRotation(internId) {
  const today = startOfDay(new Date());

  // Get the last rotation for this intern
  const lastRotation = await prisma.rotation.findFirst({
    where: {
      internId,
    },
    orderBy: {
      endDate: 'desc',
    },
    include: {
      unit: true,
      intern: true,
    },
  });

  if (!lastRotation) {
    return false;
  }

  // Check if last rotation has ended
  if (isAfter(today, lastRotation.endDate)) {
    // Check if intern is still active
    if (lastRotation.intern.status === 'Completed') {
      return false;
    }

    // Get next unit (round-robin logic)
    const allUnits = await prisma.unit.findMany({
      orderBy: { id: 'asc' },
    });

    if (allUnits.length === 0) {
      return false;
    }

    // Find current unit index
    const currentUnitIndex = allUnits.findIndex(u => u.id === lastRotation.unitId);
    const nextUnitIndex = (currentUnitIndex + 1) % allUnits.length;
    const nextUnit = allUnits[nextUnitIndex];

    // Calculate next rotation dates
    const nextStartDate = new Date(lastRotation.endDate);
    nextStartDate.setDate(nextStartDate.getDate() + 1);
    const nextEndDate = new Date(nextStartDate);
    nextEndDate.setDate(nextEndDate.getDate() + nextUnit.durationDays - 1);

    // Create new rotation
    await prisma.rotation.create({
      data: {
        internId,
        unitId: nextUnit.id,
        startDate: nextStartDate,
        endDate: nextEndDate,
        isManualAssignment: false,
      },
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

  return await prisma.rotation.create({
    data: {
      internId,
      unitId,
      startDate,
      endDate,
      isManualAssignment: true,
    },
    include: {
      intern: true,
      unit: true,
    },
  });
}

/**
 * Update a rotation
 */
async function updateRotation(rotationId, data) {
  const { startDate, endDate, unitId } = data;

  return await prisma.rotation.update({
    where: { id: rotationId },
    data: {
      ...(startDate && { startDate }),
      ...(endDate && { endDate }),
      ...(unitId && { unitId }),
    },
    include: {
      intern: true,
      unit: true,
    },
  });
}

/**
 * Delete a rotation
 */
async function deleteRotation(rotationId) {
  return await prisma.rotation.delete({
    where: { id: rotationId },
  });
}

module.exports = {
  getCurrentRotations,
  getUpcomingRotations,
  autoAdvanceRotation,
  createManualRotation,
  updateRotation,
  deleteRotation,
};


