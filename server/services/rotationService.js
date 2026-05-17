const { startOfDay, addDays, isAfter } = require('date-fns');
const Rotation = require('../models/Rotation');
const Unit = require('../models/Unit');
const Intern = require('../models/Intern');
const ActivityLog = require('../models/ActivityLog');
const { canAssignmentTransition, validateRotationIntegrity } = require('./movementGuard');
const { resolveCurrentAssignment } = require('./assignmentUtils');

const DEFAULT_ROTATION_DURATION_DAYS = 20;

const getDuration = (unitDoc) => {
  const raw = unitDoc?.duration ?? unitDoc?.durationDays ?? unitDoc?.duration_days;
  const duration = Number(raw);
  return Number.isFinite(duration) && duration > 0 ? duration : DEFAULT_ROTATION_DURATION_DAYS;
};

/**
 * Get current rotations (active today)
 */
async function getCurrentRotations() {
  const today = startOfDay(new Date());

  return await Rotation.find({
    startDate: { $lte: today },
    endDate: { $gte: today },
  })
    .populate('intern')
    .populate('unit')
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
    .populate('intern')
    .populate('unit')
    .sort({ startDate: 1 })
    .exec();
}

/**
 * Auto-advance rotations for an intern.
 * In Phase 1, this completes an overdue active rotation and preserves the next planned
 * rotation as awaiting_confirmation if one exists.
 */
async function autoAdvanceRotation(internId) {
  canAssignmentTransition('autoAdvanceRotation');
  console.warn(`[MOVEMENT BLOCKED]\nsource: autoAdvanceRotation\nintern: ${internId}\nreason: automatic transitions disabled`);
  return false;
}

/**
 * Create a manual rotation assignment
 */
async function createManualRotation(data) {
  canAssignmentTransition('createManualRotation');
  const { internId, unitId } = data;
  const unit = await Unit.findById(unitId).exec();
  const duration = getDuration(unit);
  let startDate = data.startDate ? new Date(data.startDate) : new Date();
  if (Number.isNaN(startDate.getTime())) {
    startDate = new Date();
  }

  let endDate = data.endDate ? new Date(data.endDate) : new Date(startDate);
  if (!data.endDate || Number.isNaN(endDate.getTime())) {
    endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + duration);
  }

  return await Rotation.create({
    intern: internId,
    unit: unitId,
    startDate,
    duration,
    endDate,
    status: 'active'
  });
}

/**
 * Update a rotation
 */
async function updateRotation(rotationId, data) {
  const updateData = {};
  if (data.startDate !== undefined) updateData.startDate = data.startDate;
  if (data.endDate !== undefined) updateData.endDate = data.endDate;
  if (data.unit !== undefined) updateData.unit = data.unit;

  return await Rotation.findByIdAndUpdate(rotationId, updateData, { new: true })
    .populate('intern')
    .populate('unit')
    .exec();
}

/**
 * Delete a rotation
 */
async function deleteRotation(rotationId) {
  return await Rotation.findByIdAndDelete(rotationId).exec();
}

/**
 * PHASE 1: Check if intern's current rotation has expired and mark next rotation as awaiting_confirmation
 * This replaces the old auto-advance behavior.
 * When an intern's planned duration ends, the next rotation is marked as "awaiting_confirmation"
 * instead of auto-activating it.
 */
async function checkAndMarkAwaitingConfirmation(internId, today = new Date()) {
  canAssignmentTransition('checkAndMarkAwaitingConfirmation');
  const normalizedToday = startOfDay(today);
  
  // Find the intern's current active rotation using resolver
  const allRotations = await Rotation.find({ intern: internId }).sort({ startDate: -1 }).exec();
  const currentNorm = resolveCurrentAssignment({ rotations: allRotations });
  const currentRotation = currentNorm ? allRotations.find((r) => String(r._id) === String(currentNorm._id)) : null;
  if (currentRotation) await currentRotation.populate('intern');
  
  if (!currentRotation) return null;
  
  // Check if the planned duration has been exceeded
  const endDate = startOfDay(currentRotation.endDate);
  if (normalizedToday <= endDate) {
    return null;
  }
  
  // Current rotation has expired - mark it as awaiting review while keeping it active
  if (currentRotation.workflowState !== 'pending_confirmation') {
    currentRotation.status = 'active';
    currentRotation.workflowState = 'pending_confirmation';
    await currentRotation.save();
    console.log(`[STATUS TRANSITION] ${currentRotation.intern?.name || internId}: ACTIVE -> ACTIVE (pending confirmation)`);
  }

  let nextRotation = await Rotation.findOne({ 
    intern: internId, 
    $or: [
      { status: 'upcoming' },
      { status: 'awaiting_confirmation' }
    ]
  })
    .sort({ startDate: 1 })
    .exec();
  
  if (!nextRotation) {
    // No upcoming rotation exists yet - this will be created by the batch assignment process
    // For now, just log
    console.log(`[PHASE 1] No upcoming rotation found for intern ${currentRotation.intern?.name || internId}`);
    return null;
  }
  
  // Mark the next rotation as awaiting_confirmation if not already
  if (nextRotation.status !== 'awaiting_confirmation') {
    nextRotation.status = 'awaiting_confirmation';
    await nextRotation.save();
    console.log(`[PHASE 1] Awaiting Confirmation: ${currentRotation.intern?.name || internId} - Next unit: ${nextRotation.unit}`);
  }
  
  return nextRotation;
}

/**
 * PHASE 2: Accept movement for an intern
 * Admin confirms intern has reported and is ready to move to next unit.
 * This completes the current assignment and activates the next awaiting_confirmation assignment.
 */
async function acceptMovement(internId) {
  canAssignmentTransition('acceptMovement');
  const today = startOfDay(new Date());
  
  // 1. Find current active assignment
  const allRotations = await Rotation.find({ intern: internId }).sort({ startDate: -1, createdAt: -1 }).exec();
  const currentNorm = resolveCurrentAssignment({ rotations: allRotations });
  const currentRotation = currentNorm ? allRotations.find((r) => String(r._id) === String(currentNorm._id)) : null;
  if (currentRotation) {
    await currentRotation.populate('intern');
    await currentRotation.populate('unit');
  }
  
  if (!currentRotation) {
    throw new Error(`No active rotation found for intern ${internId}`);
  }
  
  // 2. Find next awaiting assignment
  const nextRotation = await Rotation.findOne({ 
    intern: internId, 
    status: 'awaiting_confirmation' 
  })
    .populate('unit')
    .sort({ startDate: 1 })
    .exec();
  
  if (!nextRotation) {
    throw new Error(`No awaiting_confirmation rotation found for intern ${internId}`);
  }
  
  // 3. Close current unit
  currentRotation.status = 'completed';
  currentRotation.actualEndDate = today; // Record ACTUAL completion date (preserves delayed reporting)
  await currentRotation.save();
  
  // 4. Activate next unit
  nextRotation.status = 'active';
  nextRotation.startDate = today; // Set new unit start date = TODAY
  
  // Recalculate end date based on new start date
  const duration = getDuration(nextRotation.unit);
  nextRotation.endDate = addDays(today, duration);
  await nextRotation.save();
  
  // 5. Update intern's currentUnit reference
  await Intern.findByIdAndUpdate(internId, { 
    currentUnit: nextRotation.unit._id 
  }).exec();
  
  // 6. History logging
  const internName = currentRotation.intern?.name || 'Unknown Intern';
  const fromUnitName = currentRotation.unit?.name || 'Unknown Unit';
  const toUnitName = nextRotation.unit?.name || 'Unknown Unit';
  
  await ActivityLog.create({
    action_type: 'movement_accepted',
    description: `${internName} moved from ${fromUnitName} to ${toUnitName}`,
    intern: internId,
    unit: nextRotation.unit._id,
  });
  
  // 7. Debugging
  console.log(`[PHASE 2] ✅ Accepted movement for ${internName}`);
  console.log(`[PHASE 2] 📅 Old unit (${fromUnitName}) completed with actual end date: ${today.toISOString().split('T')[0]}`);
  console.log(`[PHASE 2] 🚀 New active unit: ${toUnitName} (start: ${today.toISOString().split('T')[0]})`);
  
  return {
    completedRotation: currentRotation,
    activatedRotation: nextRotation,
    internName,
    fromUnit: fromUnitName,
    toUnit: toUnitName,
    actualEndDate: today,
    newStartDate: today
  };
}

/**
 * PHASE 3: Reassign next unit for an intern
 * Admin changes the upcoming unit assignment before movement is confirmed.
 * Only affects awaiting_confirmation rotations, NOT current active assignments.
 */
async function reassignNextUnit(internId, newUnitId) {
  canAssignmentTransition('reassignNextUnit');
  // 1. Find the awaiting_confirmation rotation (next assignment)
  const awaitingRotation = await Rotation.findOne({
    intern: internId,
    status: 'awaiting_confirmation'
  })
    .populate('intern')
    .populate('unit')
    .exec();

  if (!awaitingRotation) {
    throw new Error(`No awaiting_confirmation rotation found for intern ${internId}`);
  }

  // 2. Validate new unit exists
  const newUnit = await Unit.findById(newUnitId).exec();
  if (!newUnit) {
    throw new Error(`Unit ${newUnitId} not found`);
  }

  // Normalize newUnitId to string for comparisons
  const newUnitIdStr = String(newUnitId);

  // 3. Get intern's completed rotations to prevent duplicates
  const completedRotations = await Rotation.find({
    intern: internId,
    status: 'completed'
  })
    .populate('unit')
    .exec();

  const completedUnitIds = completedRotations.map(r => r.unit._id.toString());

  // 4. Check if intern has already completed this unit
  if (completedUnitIds.includes(newUnitIdStr)) {
    throw new Error(`Intern has already completed unit ${newUnit.name}`);
  }

  // 5. Check if this is the current active unit
  const allRotationsForCurrentCheck = await Rotation.find({ intern: internId }).sort({ startDate: -1, createdAt: -1 }).exec();
  const currentNormForCheck = resolveCurrentAssignment({ rotations: allRotationsForCurrentCheck });
  const currentRotationForCheck = currentNormForCheck ? allRotationsForCurrentCheck.find((r) => String(r._id) === String(currentNormForCheck._id)) : null;
  const currentRotation = currentRotationForCheck ? await currentRotationForCheck.populate('unit') : null;

  if (currentRotation && currentRotation.unit._id.toString() === newUnitIdStr) {
    throw new Error(`Cannot reassign to current active unit ${newUnit.name}`);
  }

  // 6. Record previous unit for logging
  const previousUnitName = awaitingRotation.unit?.name || 'Unknown Unit';
  const newUnitName = newUnit.name;

  // 7. Update the awaiting rotation with new unit
  awaitingRotation.unit = newUnitId;

  // Recalculate end date based on unit duration
  const duration = getDuration(newUnit);
  awaitingRotation.endDate = addDays(awaitingRotation.startDate, duration);

  await awaitingRotation.save();

  // 8. History logging
  const internName = awaitingRotation.intern?.name || 'Unknown Intern';

  await ActivityLog.create({
    action_type: 'unit_reassigned',
    description: `${internName} reassigned from ${previousUnitName} to ${newUnitName} before movement`,
    intern: internId,
    unit: newUnitId,
  });

  // 9. Debugging
  console.log(`[PHASE 3] 🔄 Reassigned intern: ${internName}`);
  console.log(`[PHASE 3] 📤 Previous unit: ${previousUnitName}`);
  console.log(`[PHASE 3] 📥 New unit: ${newUnitName}`);

  return {
    updatedRotation: awaitingRotation,
    internName,
    previousUnit: previousUnitName,
    newUnit: newUnitName,
    newUnitId
  };
}

module.exports = {
  getCurrentRotations,
  getUpcomingRotations,
  autoAdvanceRotation,
  createManualRotation,
  updateRotation,
  deleteRotation,
  checkAndMarkAwaitingConfirmation,
  acceptMovement,
  reassignNextUnit,
  validateRotationIntegrity,
};


