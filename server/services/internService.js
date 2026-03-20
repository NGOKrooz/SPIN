const { addDays, startOfDay, isAfter } = require('date-fns');
const mongoose = require('mongoose');
const Intern = require('../models/Intern');
const Rotation = require('../models/Rotation');
const Unit = require('../models/Unit');

/**
 * Create a new intern with optional automatic rotation generation
 */
async function createIntern(data, options = {}) {
  const { name, email, gender, batch, startDate, phoneNumber, initialUnitId } = data;
  const { autoGenerateRotations = false } = options;

  let finalBatch = batch;
  if (!finalBatch || !['A', 'B'].includes(finalBatch)) {
    const internCount = await Intern.countDocuments();
    finalBatch = internCount % 2 === 0 ? 'A' : 'B';
  }

  const parsedStartDate = startDate ? (typeof startDate === 'string' ? new Date(startDate) : startDate) : new Date();

  const intern = await Intern.create({
    name,
    email: email || null,
    gender: ['Male', 'Female'].includes(gender) ? gender : null,
    batch: finalBatch,
    startDate: parsedStartDate,
    phoneNumber: phoneNumber || null,
    status: 'Active',
    extensionDays: 0,
  });

  if (initialUnitId) {
    if (!mongoose.Types.ObjectId.isValid(initialUnitId)) {
      throw new Error('Invalid unitId format');
    }

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

    intern.currentUnit = unit._id;
    await intern.save();
  }

  if (autoGenerateRotations) {
    await generateRotationsForIntern(intern._id, parsedStartDate);

    const today = startOfDay(new Date());
    const activeRotation = await Rotation.findOne({
      internId: intern._id,
      startDate: { $lte: today },
      endDate: { $gte: today },
    }).exec();

    if (activeRotation && activeRotation.unitId) {
      intern.currentUnit = activeRotation.unitId;
      await intern.save();
    }
  }

  return intern;
}

/**
 * Generate rotations for an intern
 */
async function generateRotationsForIntern(internId, startDate) {
  const units = await Unit.find({}).sort({ position: 1, name: 1 }).exec();
  if (units.length === 0) {
    console.warn('[GenerateRotations] No units available, skipping rotation creation');
    return;
  }

  const intern = await Intern.findById(internId).exec();
  if (!intern) {
    throw new Error(`Intern ${internId} not found`);
  }

  const rotations = generateInternRotations(intern, units, startDate);

  if (rotations.length > 0) {
    await Rotation.insertMany(rotations);
  }
}

/**
 * Generate rotation schedule for a single intern
 */
function generateInternRotations(intern, units, startDate) {
  const rotations = [];
  const currentDate = typeof startDate === 'string' ? new Date(startDate) : startDate;
  let currentDateCopy = new Date(currentDate);

  // Use the unit ordering as defined in the units collection (position / name)
  const orderedUnits = units;

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
  const newExtensionDays = Number(extensionDays);
  if (!Number.isFinite(newExtensionDays) || newExtensionDays < 0) {
    throw new Error('Invalid extensionDays value');
  }

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

  if (activeRotation && activeRotation.unitId) {
    intern.currentUnit = activeRotation.unitId;
  } else {
    intern.currentUnit = null;
  }

  if (newStatus !== intern.status || intern.isModified('currentUnit')) {
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


