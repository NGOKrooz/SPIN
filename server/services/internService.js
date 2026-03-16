const { addDays, startOfDay, isAfter } = require('date-fns');
const Intern = require('../models/Intern');
const Rotation = require('../models/Rotation');
const Unit = require('../models/Unit');

/**
 * Create a new intern with optional automatic rotation generation
 */
async function createIntern(data, options = {}) {
  console.log('createIntern received data:', data); // Debug log
  const { name, gender, batch, startDate, phoneNumber, email, initialUnitId } = data;
  const { autoGenerateRotations = false } = options;

  let finalBatch = batch;
  if (!finalBatch || !['A', 'B'].includes(finalBatch)) {
    const internCount = await Intern.countDocuments();
    finalBatch = internCount % 2 === 0 ? 'A' : 'B';
  }

  const parsedStartDate = typeof startDate === 'string' ? new Date(startDate) : startDate;

  const intern = await Intern.create({
    name,
    gender,
    batch: finalBatch,
    startDate: parsedStartDate,
    phoneNumber: phoneNumber || null,
    email,
    status: 'Active',
    extensionDays: 0,
  });

  if (initialUnitId) {
    const unit = await Unit.findById(initialUnitId).exec();
    if (!unit) {
      throw new Error('Invalid unit selected');
    }

    const endDate = addDays(parsedStartDate, unit.durationDays - 1);

    await Rotation.create({
      internId: intern._id,
      unitId: unit._id,
      startDate: parsedStartDate,
      endDate,
      isManualAssignment: true,
    });
  }

  if (autoGenerateRotations) {
    await generateRotationsForIntern(intern._id, finalBatch, parsedStartDate);
  }

  return intern;
}

/**
 * Generate rotations for an intern
 */
async function generateRotationsForIntern(internId, batch, startDate) {
  const allInterns = await Intern.find({
    status: { $in: ['Active', 'Extended'] },
  })
    .sort({ _id: 1 })
    .exec();

  const internIndex = allInterns.findIndex(i => i._id.equals(internId));
  if (internIndex === -1) {
    throw new Error(`Intern ${internId} not found in active interns list`);
  }

  const units = await Unit.find({}).sort({ _id: 1 }).exec();
  if (units.length === 0) {
    console.warn('[GenerateRotations] No units available, skipping rotation creation');
    return;
  }

  const intern = await Intern.findById(internId).exec();
  if (!intern) {
    throw new Error(`Intern ${internId} not found`);
  }

  const rotations = generateInternRotations(intern, units, startDate, internIndex);

  if (rotations.length > 0) {
    await Rotation.insertMany(rotations);
  }
}

/**
 * Generate rotation schedule for a single intern
 */
function generateInternRotations(intern, units, startDate, internIndex = 0) {
  const rotations = [];
  const currentDate = typeof startDate === 'string' ? new Date(startDate) : startDate;
  let currentDateCopy = new Date(currentDate);

  const startUnitIndex = internIndex % units.length;
  const orderedUnits = [
    ...units.slice(startUnitIndex),
    ...units.slice(0, startUnitIndex),
  ];

  for (const unit of orderedUnits) {
    const rotationStart = new Date(currentDateCopy);
    const rotationEnd = addDays(rotationStart, unit.durationDays - 1);

    rotations.push({
      internId: intern._id,
      unitId: unit._id,
      startDate: rotationStart,
      endDate: rotationEnd,
      isManualAssignment: false,
    });

    currentDateCopy = addDays(rotationEnd, 1);
  }

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
        internId: intern._id,
        unitId: unit._id,
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

  return await Rotation.findOne({
    internId,
    startDate: { $lte: today },
    endDate: { $gte: today },
  })
    .populate('internId')
    .populate('unitId')
    .exec();
}

/**
 * Get upcoming rotations for an intern
 */
async function getUpcomingRotations(internId, limit = 10) {
  const today = startOfDay(new Date());

  return await Rotation.find({
    internId,
    startDate: { $gt: today },
  })
    .populate('unitId')
    .sort({ startDate: 1 })
    .limit(limit)
    .exec();
}

/**
 * Get all rotations for an intern
 */
async function getInternRotations(internId) {
  return await Rotation.find({ internId })
    .populate('unitId')
    .sort({ startDate: 1 })
    .exec();
}

/**
 * Extend internship and adjust rotations
 */
async function extendInternship(internId, extensionDays, reason, notes, unitId) {
  const intern = await Intern.findById(internId).exec();
  if (!intern) {
    throw new Error('Intern not found');
  }

  const oldExtensionDays = intern.extensionDays || 0;
  const newExtensionDays = parseInt(extensionDays, 10);
  const daysDifference = newExtensionDays - oldExtensionDays;

  const finalStatus = newExtensionDays > 0 ? 'Extended' : 'Active';

  intern.status = finalStatus;
  intern.extensionDays = newExtensionDays;
  await intern.save();

  // TODO: Store extension reason somewhere (e.g., separate collection)

  if (unitId && daysDifference !== 0) {
    const lastRotation = await Rotation.findOne({ internId, unitId })
      .sort({ endDate: -1 })
      .exec();

    if (lastRotation) {
      lastRotation.endDate = addDays(lastRotation.endDate, daysDifference);
      await lastRotation.save();
    }
  }

  await ensureInternStatusIsCorrect(internId);

  return intern;
}

/**
 * Ensure intern status matches their rotation state
 */
async function ensureInternStatusIsCorrect(internId) {
  const today = startOfDay(new Date());

  const activeRotation = await Rotation.findOne({
    internId,
    startDate: { $lte: today },
    endDate: { $gte: today },
  }).exec();

  const upcomingRotation = await Rotation.findOne({
    internId,
    startDate: { $gt: today },
  }).exec();

  const intern = await Intern.findById(internId).exec();
  if (!intern) return;

  let newStatus = intern.status;

  if (!activeRotation && !upcomingRotation) {
    newStatus = 'Completed';
  } else if (intern.extensionDays > 0 && intern.status !== 'Completed') {
    newStatus = 'Extended';
  } else if (intern.status !== 'Completed') {
    newStatus = 'Active';
  }

  if (newStatus !== intern.status) {
    intern.status = newStatus;
    await intern.save();
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


