const prisma = require('../database/prisma');
const { addDays, format, parseISO, isAfter, isBefore, startOfDay } = require('date-fns');

/**
 * Create a new intern with optional automatic rotation generation
 */
async function createIntern(data, options = {}) {
  const { name, gender, batch, startDate, phoneNumber, initialUnitId } = data;
  const { autoGenerateRotations = false } = options;

  // Auto-assign batch if not provided
  let finalBatch = batch;
  if (!finalBatch || !['A', 'B'].includes(finalBatch)) {
    const internCount = await prisma.intern.count();
    finalBatch = internCount % 2 === 0 ? 'A' : 'B';
  }

  // Parse start date
  const parsedStartDate = typeof startDate === 'string' ? parseISO(startDate) : startDate;

  // Create intern
  const intern = await prisma.intern.create({
    data: {
      name,
      gender,
      batch: finalBatch,
      startDate: parsedStartDate,
      phoneNumber: phoneNumber || null,
      status: 'Active',
      extensionDays: 0,
    },
  });

  // If initial unit is provided, create rotation
  if (initialUnitId) {
    const unit = await prisma.unit.findUnique({
      where: { id: initialUnitId },
    });

    if (!unit) {
      throw new Error('Invalid unit selected');
    }

    const endDate = addDays(parsedStartDate, unit.durationDays - 1);

    await prisma.rotation.create({
      data: {
        internId: intern.id,
        unitId: initialUnitId,
        startDate: parsedStartDate,
        endDate: endDate,
        isManualAssignment: true,
      },
    });
  }

  // Auto-generate rotations if enabled
  if (autoGenerateRotations) {
    await generateRotationsForIntern(intern.id, finalBatch, parsedStartDate);
  }

  return intern;
}

/**
 * Generate rotations for an intern
 */
async function generateRotationsForIntern(internId, batch, startDate) {
  // Get all active interns for round-robin indexing
  const allInterns = await prisma.intern.findMany({
    where: {
      status: { in: ['Active', 'Extended'] },
    },
    orderBy: { id: 'asc' },
  });

  const internIndex = allInterns.findIndex(i => i.id === internId);
  if (internIndex === -1) {
    throw new Error(`Intern ${internId} not found in active interns list`);
  }

  // Get all units ordered by ID
  const units = await prisma.unit.findMany({
    orderBy: { id: 'asc' },
  });

  if (units.length === 0) {
    console.warn('[GenerateRotations] No units available, skipping rotation creation');
    return;
  }

  // Get intern data
  const intern = await prisma.intern.findUnique({
    where: { id: internId },
  });

  if (!intern) {
    throw new Error(`Intern ${internId} not found`);
  }

  // Generate rotations
  const rotations = generateInternRotations(intern, units, startDate, internIndex);

  // Insert rotations
  if (rotations.length > 0) {
    await prisma.rotation.createMany({
      data: rotations,
    });
  }
}

/**
 * Generate rotation schedule for a single intern
 */
function generateInternRotations(intern, units, startDate, internIndex = 0) {
  const rotations = [];
  const currentDate = typeof startDate === 'string' ? parseISO(startDate) : startDate;
  let currentDateCopy = new Date(currentDate);

  // Round-robin: start at different offset for each intern
  const startUnitIndex = internIndex % units.length;
  const orderedUnits = [
    ...units.slice(startUnitIndex),
    ...units.slice(0, startUnitIndex)
  ];

  // Base cycle: rotate through every unit exactly once
  for (const unit of orderedUnits) {
    const rotationStart = new Date(currentDateCopy);
    const rotationEnd = addDays(rotationStart, unit.durationDays - 1);

    rotations.push({
      internId: intern.id,
      unitId: unit.id,
      startDate: rotationStart,
      endDate: rotationEnd,
      isManualAssignment: false,
    });

    currentDateCopy = addDays(rotationEnd, 1);
  }

  // Extension handling – distribute extra days across additional rotations
  let remainingExtension = 0;
  if (intern.status === 'Extended') {
    const ext = parseInt(intern.extensionDays, 10);
    if (!Number.isNaN(ext) && ext > 0) {
      remainingExtension = ext;
    }
  }

  while (remainingExtension > 0) {
    for (const unit of orderedUnits) {
      if (remainingExtension <= 0) break;

      const durationDays = Math.min(unit.durationDays, remainingExtension);
      const rotationStart = new Date(currentDateCopy);
      const rotationEnd = addDays(rotationStart, durationDays - 1);

      rotations.push({
        internId: intern.id,
        unitId: unit.id,
        startDate: rotationStart,
        endDate: rotationEnd,
        isManualAssignment: false,
      });

      currentDateCopy = addDays(rotationEnd, 1);
      remainingExtension -= durationDays;
    }
  }

  return rotations;
}

/**
 * Get current rotation for an intern
 */
async function getCurrentRotation(internId) {
  const today = startOfDay(new Date());

  return await prisma.rotation.findFirst({
    where: {
      internId,
      startDate: { lte: today },
      endDate: { gte: today },
    },
    include: {
      unit: true,
      intern: true,
    },
  });
}

/**
 * Get upcoming rotations for an intern
 */
async function getUpcomingRotations(internId, limit = 10) {
  const today = startOfDay(new Date());

  return await prisma.rotation.findMany({
    where: {
      internId,
      startDate: { gt: today },
    },
    include: {
      unit: true,
    },
    orderBy: {
      startDate: 'asc',
    },
    take: limit,
  });
}

/**
 * Get all rotations for an intern
 */
async function getInternRotations(internId) {
  return await prisma.rotation.findMany({
    where: {
      internId,
    },
    include: {
      unit: true,
    },
    orderBy: {
      startDate: 'asc',
    },
  });
}

/**
 * Extend internship and adjust rotations
 */
async function extendInternship(internId, extensionDays, reason, notes, unitId) {
  const intern = await prisma.intern.findUnique({
    where: { id: internId },
  });

  if (!intern) {
    throw new Error('Intern not found');
  }

  const oldExtensionDays = intern.extensionDays || 0;
  const newExtensionDays = parseInt(extensionDays, 10);
  const daysDifference = newExtensionDays - oldExtensionDays;

  const finalStatus = newExtensionDays > 0 ? 'Extended' : 'Active';

  // Update intern
  const updatedIntern = await prisma.intern.update({
    where: { id: internId },
    data: {
      status: finalStatus,
      extensionDays: newExtensionDays,
    },
  });

  // Record extension reason
  await prisma.extensionReason.create({
    data: {
      internId,
      extensionDays: newExtensionDays,
      reason,
      notes: notes || null,
    },
  });

  // If unit_id is provided and days changed, extend the last rotation for that unit
  if (unitId && daysDifference !== 0) {
    const lastRotation = await prisma.rotation.findFirst({
      where: {
        internId,
        unitId,
      },
      orderBy: {
        endDate: 'desc',
      },
    });

    if (lastRotation) {
      const newEndDate = addDays(lastRotation.endDate, daysDifference);
      await prisma.rotation.update({
        where: { id: lastRotation.id },
        data: {
          endDate: newEndDate,
        },
      });
    }
  }

  // Ensure intern status is correct
  await ensureInternStatusIsCorrect(internId);

  return updatedIntern;
}

/**
 * Ensure intern status matches their rotation state
 */
async function ensureInternStatusIsCorrect(internId) {
  const today = startOfDay(new Date());

  const activeRotations = await prisma.rotation.findFirst({
    where: {
      internId,
      startDate: { lte: today },
      endDate: { gte: today },
    },
  });

  const upcomingRotations = await prisma.rotation.findFirst({
    where: {
      internId,
      startDate: { gt: today },
    },
  });

  const intern = await prisma.intern.findUnique({
    where: { id: internId },
  });

  if (!intern) return;

  let newStatus = intern.status;

  // If no active or upcoming rotations, mark as Completed
  if (!activeRotations && !upcomingRotations) {
    newStatus = 'Completed';
  } else if (intern.extensionDays > 0 && intern.status !== 'Completed') {
    newStatus = 'Extended';
  } else if (intern.status !== 'Completed') {
    newStatus = 'Active';
  }

  if (newStatus !== intern.status) {
    await prisma.intern.update({
      where: { id: internId },
      data: { status: newStatus },
    });
  }
}

module.exports = {
  createIntern,
  generateRotationsForIntern,
  getCurrentRotation,
  getUpcomingRotations,
  getInternRotations,
  extendInternship,
  ensureInternStatusIsCorrect,
};


