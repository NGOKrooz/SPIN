const { addDays, startOfDay, isAfter } = require('date-fns');
const mongoose = require('mongoose');
const Intern = require('../models/Intern');
const Rotation = require('../models/Rotation');
const Unit = require('../models/Unit');

/**
 * Create a new intern with automatic initial rotation
 */
async function createIntern(data) {
  const { name, gender = '', batch = '', phone = '', status = 'active', startDate } = data;

  // Create intern
  const intern = await Intern.create({
    name,
    gender,
    batch,
    phone,
    status,
    startDate: startDate ? new Date(startDate) : new Date(),
    currentUnit: null,
    rotationHistory: [],
    extensionDays: 0,
    totalExtensionDays: 0,
  });

  console.log("✅ CREATED INTERN:", JSON.stringify(intern, null, 2));
  console.log("   ID:", intern._id.toString());
  console.log("   Name:", intern.name);

  // STEP 1: Verify intern is actually saved in MongoDB
  const check = await Intern.findById(intern._id).populate('currentUnit').exec();
  if (!check) {
    const errorMsg = `CRITICAL: Intern ${intern._id} was created but cannot be found in DB!`;
    console.error("❌ " + errorMsg);
    throw new Error(errorMsg);
  }

  console.log("✅ VERIFIED IN DB:", JSON.stringify(check, null, 2));
  console.log("   Verified ID:", check._id.toString());
  console.log("   Verified Name:", check.name);
  console.log("   Verified Status:", check.status);

  // Double-check all fields were saved
  if (check.name !== name) {
    console.warn("⚠️  Name mismatch! Input:", name, "Saved:", check.name);
  }
  if (check.status !== status) {
    console.warn("⚠️  Status mismatch! Input:", status, "Saved:", check.status);
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
  const intern = await Intern.findById(internId).exec();
  if (!intern) return;

  const { ensureContinuousAssignment } = require('./dynamicAssignmentService');
  await ensureContinuousAssignment(intern._id, new Date());

  const refreshedIntern = await Intern.findById(intern._id).exec();
  if (!refreshedIntern) return;

  const activeRotation = await Rotation.findOne({
    intern: refreshedIntern._id,
    status: 'active',
  })
    .sort({ startDate: -1, createdAt: -1 })
    .exec();

  let newStatus = 'completed';
  if (activeRotation) {
    const activeExtensionDays = Number(activeRotation.extensionDays || 0);
    newStatus = activeExtensionDays > 0 ? 'extended' : 'active';
    refreshedIntern.extensionDays = activeExtensionDays;
  } else {
    refreshedIntern.extensionDays = 0;
  }

  const newCurrentUnit = activeRotation?.unit || null;

  const statusChanged = refreshedIntern.status !== newStatus;
  const currentUnitChanged = String(refreshedIntern.currentUnit || '') !== String(newCurrentUnit || '');

  if (statusChanged || currentUnitChanged) {
    refreshedIntern.status = newStatus;
    refreshedIntern.currentUnit = newCurrentUnit;
    await refreshedIntern.save();
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


