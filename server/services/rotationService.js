const { startOfDay, addDays, isAfter } = require('date-fns');
const Rotation = require('../models/Rotation');
const Unit = require('../models/Unit');
const Intern = require('../models/Intern');
const { logRecentUpdateSafe } = require('./recentUpdatesService');
const { trace } = require('./mutationTraceService');

const DEFAULT_ROTATION_DURATION_DAYS = 20;

function calculateRotationEndDate(startDate, duration) {
  const start = startOfDay(new Date(startDate));
  const safeDuration = Number(duration);
  const effectiveDuration = Number.isFinite(safeDuration) && safeDuration > 0
    ? safeDuration
    : DEFAULT_ROTATION_DURATION_DAYS;
  return addDays(start, effectiveDuration - 1);
}

async function getActiveRotationForIntern(internId) {
  return Rotation.findOne({ intern: internId, status: 'active' })
    .sort({ startDate: 1 })
    .populate('unit')
    .exec();
}

async function getNextStagedRotation(internId) {
  return Rotation.findOne({
    intern: internId,
    status: { $in: ['awaiting_confirmation', 'upcoming'] },
  })
    .sort({ startDate: 1, createdAt: 1 })
    .populate('unit')
    .exec();
}

async function acceptMovement(internId) {
  if (!internId) {
    throw new Error('Intern ID is required to accept movement');
  }

  const intern = await Intern.findById(internId).exec();
  if (!intern) {
    throw new Error(`Intern not found: ${internId}`);
  }

  const activeRotation = await getActiveRotationForIntern(internId);
  if (!activeRotation) {
    throw new Error('Missing active or upcoming rotation');
  }

  const nextRotation = await getNextStagedRotation(internId);
  if (!nextRotation) {
    throw new Error('No next rotation found');
  }

  // Trace pre-accept snapshot
  trace('acceptMovement:pre', internId, {
    activeRotation: { id: activeRotation._id.toString(), unit: activeRotation.unit?.toString?.() || activeRotation.unit },
    awaiting: { id: nextRotation._id.toString(), unit: nextRotation.unit?.toString?.() || nextRotation.unit },
    upcoming: (await Rotation.find({ intern: internId, status: 'upcoming' }).sort({ startDate: 1 }).select('_id unit').exec()).map(r => ({ id: r._id.toString(), unit: r.unit?.toString?.() || r.unit })),
  });


  const today = startOfDay(new Date());
  activeRotation.status = 'completed';
  activeRotation.actualEndDate = today;
  await activeRotation.save();

  const duration = Number(nextRotation.duration || nextRotation.baseDuration || DEFAULT_ROTATION_DURATION_DAYS);
  nextRotation.status = 'active';
  nextRotation.startDate = today;
  nextRotation.endDate = calculateRotationEndDate(today, duration);
  nextRotation.workflowState = null;
  await nextRotation.save();

  // Trace post-accept snapshot
  trace('acceptMovement:post', internId, {
    activeRotation: { id: activeRotation._id.toString(), unit: activeRotation.unit?.toString?.() || activeRotation.unit },
    newActive: { id: nextRotation._id.toString(), unit: nextRotation.unit?.toString?.() || nextRotation.unit },
    upcoming: (await Rotation.find({ intern: internId, status: 'upcoming' }).sort({ startDate: 1 }).select('_id unit').exec()).map(r => ({ id: r._id.toString(), unit: r.unit?.toString?.() || r.unit })),
  });

  

  intern.currentUnit = nextRotation.unit?._id || nextRotation.unit;
  intern.status = Number(intern.extensionDays || 0) > 0 ? 'extended' : 'active';
  await intern.save();

  await logRecentUpdateSafe('movement_accepted', `${intern.name} moved from ${activeRotation.unit?.name || String(activeRotation.unit || 'Unknown')} to ${nextRotation.unit?.name || String(nextRotation.unit || 'Unknown')}`, intern._id);

  return {
    internName: intern.name,
    fromUnit: activeRotation.unit?.name || String(activeRotation.unit || 'Unknown'),
    toUnit: nextRotation.unit?.name || String(nextRotation.unit || 'Unknown'),
    updatedRotation: nextRotation,
  };
}

async function reassignNextUnit(internId, newUnitId) {
  if (!internId) {
    throw new Error('Intern ID is required to reassign the next unit');
  }
  if (!newUnitId) {
    throw new Error('newUnitId is required');
  }

  const intern = await Intern.findById(internId).exec();
  if (!intern) {
    throw new Error(`Intern not found: ${internId}`);
  }

  const unit = await Unit.findById(newUnitId).exec();
  if (!unit) {
    throw new Error('Unit not found');
  }

  const activeRotation = await getActiveRotationForIntern(internId);
  const activeUnitId = activeRotation?.unit?._id?.toString?.() || activeRotation?.unit?.toString?.();
  if (activeUnitId && String(activeUnitId) === String(newUnitId)) {
    throw new Error('Cannot reassign to current active unit');
  }

  const completedRotation = await Rotation.findOne({
    intern: internId,
    status: 'completed',
    unit: newUnitId,
  }).exec();
  if (completedRotation) {
    throw new Error('Cannot reassign to a unit already completed by this intern');
  }

  const nextRotation = await getNextStagedRotation(internId);
  if (!nextRotation) {
    throw new Error('No next rotation found');
  }

  const previousUnit = nextRotation.unit?.name || String(nextRotation.unit || 'Unknown');
  const nextUnitId = nextRotation.unit?._id?.toString?.() || nextRotation.unit?.toString?.();
  if (String(nextUnitId) === String(newUnitId)) {
    throw new Error('New unit is already scheduled as the next unit');
  }

  nextRotation.unit = newUnitId;
  await nextRotation.save();

  await logRecentUpdateSafe('unit_reassigned', `${intern.name} reassigned from ${previousUnit} to ${unit.name}`, intern._id);

  return {
    internName: intern.name,
    previousUnit,
    newUnit: unit.name,
    updatedRotation: nextRotation,
  };
}

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
    .populate({ path: 'intern', populate: { path: 'currentUnit' } })
    .populate('unit')
    .sort({ startDate: 1 })
    .exec();
}

/**
 * Auto-advance rotations for an intern
 */
async function autoAdvanceRotation(internId) {
  const today = startOfDay(new Date());

  const lastRotation = await Rotation.findOne({ intern: internId })
    .sort({ endDate: -1 })
    .populate('intern')
    .populate('unit')
    .exec();

  if (!lastRotation) return false;

  if (isAfter(today, lastRotation.endDate)) {
    if (lastRotation.intern?.status === 'completed') {
      return false;
    }

    const allUnits = await Unit.find({}).sort({ order: 1 }).exec();
    if (allUnits.length === 0) return false;

    const currentUnitIndex = allUnits.findIndex(u => u._id.equals(lastRotation.unit._id));
    const nextUnitIndex = (currentUnitIndex + 1) % allUnits.length;
    const nextUnit = allUnits[nextUnitIndex];

    const duration = getDuration(nextUnit);
    const nextStartDate = new Date(lastRotation.endDate);
    const nextEndDate = new Date(nextStartDate);
    nextEndDate.setDate(nextEndDate.getDate() + duration);

    await Rotation.create({
      intern: internId,
      unit: nextUnit._id,
      startDate: nextStartDate,
      duration,
      endDate: nextEndDate,
      status: 'active'
    });

    await Intern.findByIdAndUpdate(internId, { currentUnit: nextUnit._id }).exec();
    return true;
  }

  return false;
}

/**
 * Create a manual rotation assignment
 */
async function createManualRotation(data) {
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

module.exports = {
  getCurrentRotations,
  getUpcomingRotations,
  autoAdvanceRotation,
  createManualRotation,
  updateRotation,
  deleteRotation,
  acceptMovement,
  reassignNextUnit,
};


