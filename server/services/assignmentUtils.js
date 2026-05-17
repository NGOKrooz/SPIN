const LEGACY_PENDING_STATUS = 'pending';
const VALID_LIFECYCLE_STATUSES = new Set(['active', 'upcoming', 'completed', 'awaiting_confirmation']);
const VALID_WORKFLOW_STATES = new Set(['normal', 'pending_confirmation']);

function parseRotationDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function normalizeRotation(rotation = {}) {
  if (!rotation || typeof rotation !== 'object') return null;

  const normalized = { ...rotation };
  if (rotation._id !== undefined) {
    normalized._id = rotation._id;
  }

  const rawStatus = String(rotation.status || '').trim().toLowerCase();
  const rawWorkflow = String(rotation.workflowState || rotation.workflow_state || '').trim().toLowerCase();

  if (rawStatus === LEGACY_PENDING_STATUS) {
    normalized.status = 'active';
    normalized.workflowState = rawWorkflow || 'pending_confirmation';
  } else {
    normalized.status = VALID_LIFECYCLE_STATUSES.has(rawStatus) ? rawStatus : 'upcoming';
    normalized.workflowState = VALID_WORKFLOW_STATES.has(rawWorkflow) ? rawWorkflow : 'normal';
  }

  if (!normalized.workflowState) {
    normalized.workflowState = 'normal';
  }

  return normalized;
}

function isActiveAssignment(rotation) {
  const normalized = normalizeRotation(rotation);
  return normalized ? normalized.status === 'active' : false;
}

function getRotationStartTime(rotation) {
  const date = parseRotationDate(rotation?.startDate || rotation?.start_date);
  return date ? date.getTime() : 0;
}

function resolveCurrentAssignment(subject = {}) {
  const rotations = Array.isArray(subject.rotations)
    ? subject.rotations
    : Array.isArray(subject.assignments)
      ? subject.assignments
      : Array.isArray(subject) && typeof subject !== 'object'
        ? subject
        : [];

  return [...rotations]
    .map(normalizeRotation)
    .filter((rotation) => isActiveAssignment(rotation))
    .sort((a, b) => getRotationStartTime(b) - getRotationStartTime(a))[0] || null;
}

function resolveUpcomingAssignment(subject = {}) {
  const rotations = Array.isArray(subject.rotations)
    ? subject.rotations
    : Array.isArray(subject.assignments)
      ? subject.assignments
      : Array.isArray(subject) && typeof subject !== 'object'
        ? subject
        : [];

  return [...rotations]
    .map(normalizeRotation)
    .filter((rotation) => rotation.status === 'upcoming')
    .sort((a, b) => getRotationStartTime(a) - getRotationStartTime(b))[0] || null;
}

function getLatestActiveLikeAssignment(rotations = []) {
  return resolveCurrentAssignment({ rotations });
}

function calculateOverdueDays(rotation, today = new Date()) {
  if (!rotation || !rotation.endDate) return 0;
  const endDate = new Date(rotation.endDate);
  if (Number.isNaN(endDate.getTime())) return 0;
  endDate.setHours(0, 0, 0, 0);
  const current = new Date(today);
  current.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((current.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24)));
}

function transitionAssignmentStatus(assignment, action) {
  if (!assignment || typeof assignment !== 'object') return assignment;

  if (action === 'auto-time-trigger') {
    return {
      ...assignment,
      status: 'active',
      workflowState: 'pending_confirmation',
      overdueDays: calculateOverdueDays(assignment),
    };
  }

  if (action === 'admin-confirm') {
    return {
      ...assignment,
      status: 'completed',
      workflowState: 'normal',
    };
  }

  return assignment;
}

module.exports = {
  isActiveLikeAssignment: isActiveAssignment,
  isActiveAssignment,
  normalizeRotation,
  resolveCurrentAssignment,
  resolveUpcomingAssignment,
  getLatestActiveLikeAssignment,
  transitionAssignmentStatus,
  calculateOverdueDays,
};
