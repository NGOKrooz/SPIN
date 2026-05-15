const { startOfDay } = require('date-fns');
const Rotation = require('../models/Rotation');
const Intern = require('../models/Intern');

const ALLOWED_TRANSITIONS = new Set([
  'assignFirstUnit',
  'createManualRotation',
  'checkAndMarkAwaitingConfirmation',
  'acceptMovement',
  'reassignNextUnit',
  'ensureContinuousAssignment',
]);

const BLOCKED_TRANSITIONS = new Set([
  'autoAdvanceRotation',
  'assignNextUnit',
  'advanceToNextUnit',
]);

function canAssignmentTransition(source) {
  if (!source || typeof source !== 'string') {
    throw new Error('Movement transition source is required');
  }

  const normalized = source.trim();

  if (BLOCKED_TRANSITIONS.has(normalized)) {
    const message = `Movement transition blocked in Phase 1: ${normalized}. Movement must only occur via explicit acceptMovement.`;
    console.warn(`[MOVEMENT BLOCKED]\nsource: ${normalized}\nreason: automatic transitions disabled`);
    throw new Error(message);
  }

  if (!ALLOWED_TRANSITIONS.has(normalized)) {
    const message = `Movement transition source not permitted in Phase 1: ${normalized}.`;
    console.warn(`[MOVEMENT BLOCKED]\nsource: ${normalized}\nreason: transition source not permitted`);
    throw new Error(message);
  }

  return true;
}

async function validateRotationIntegrity(internId) {
  if (!internId) {
    throw new Error('Intern ID is required for rotation integrity validation');
  }

  const intern = await Intern.findById(internId).exec();
  if (!intern) {
    throw new Error(`Intern not found: ${internId}`);
  }

  const rotations = await Rotation.find({ intern: internId })
    .sort({ startDate: 1, createdAt: 1 })
    .populate('unit')
    .exec();

  const issues = [];
  const active = rotations.filter((rotation) => rotation.status === 'active' || rotation.status === 'pending');
  const awaiting = rotations.filter((rotation) => rotation.status === 'awaiting_confirmation');
  const upcoming = rotations.filter((rotation) => rotation.status === 'upcoming');

  if (active.length > 1) {
    issues.push('Multiple active rotations found');
  }

  if (!active.length && awaiting.length) {
    issues.push('Awaiting confirmation exists without an active rotation');
  }

  for (let i = 1; i < rotations.length; i += 1) {
    const previous = rotations[i - 1];
    const current = rotations[i];
    if (previous.endDate && current.startDate && startOfDay(current.startDate) <= startOfDay(previous.endDate)) {
      issues.push(`Rotation overlap found between ${previous._id} and ${current._id}`);
    }
  }

  if (active.length === 1) {
    const activeUnitId = String(active[0].unit?._id || active[0].unit || '');
    const currentUnitId = String(intern.currentUnit || '');
    if (activeUnitId && currentUnitId && activeUnitId !== currentUnitId) {
      issues.push('Intern currentUnit does not match active rotation unit');
    }
  }

  return {
    internId: intern._id.toString(),
    issues,
    activeCount: active.length,
    awaitingCount: awaiting.length,
    upcomingCount: upcoming.length,
    rotationCount: rotations.length,
  };
}

module.exports = {
  canAssignmentTransition,
  validateRotationIntegrity,
};
