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

function getRotationUnitId(rotation) {
  if (!rotation || typeof rotation !== 'object') return null;
  const unit = rotation.unitId || rotation.unit_id || rotation.unit;
  if (!unit) return null;
  if (typeof unit === 'string') return unit;
  if (typeof unit === 'object') {
    if (unit._id !== undefined) return String(unit._id);
    if (unit.id !== undefined) return String(unit.id);
    if (typeof unit.toString === 'function') return unit.toString();
  }
  return null;
}

function getAssignmentRecords(subject = {}) {
  if (Array.isArray(subject)) return subject;
  if (Array.isArray(subject.rotations)) return subject.rotations;
  if (Array.isArray(subject.assignments)) return subject.assignments;
  return [];
}

function isActiveAssignment(rotation) {
  const normalized = normalizeRotation(rotation);
  return Boolean(normalized && normalized.status === 'active');
}

function isValidRotationStatus(rotation) {
  if (!rotation) return false;
  const rawStatus = String(rotation.status || '').trim().toLowerCase();
  if (rawStatus === LEGACY_PENDING_STATUS) return true;
  return VALID_LIFECYCLE_STATUSES.has(rawStatus);
}

function getRotationStartTime(rotation) {
  const date = parseRotationDate(rotation?.startDate || rotation?.start_date);
  if (date) return date.getTime();
  const created = new Date(rotation?.createdAt || rotation?.created_at || 0);
  return Number.isNaN(created.getTime()) ? 0 : created.getTime();
}

function resolveCurrentAssignment(subject = {}) {
  const rotations = getAssignmentRecords(subject);

  const activeAssignments = [...rotations]
    .map(normalizeRotation)
    .filter((rotation) => rotation && rotation.status === 'active' && getRotationUnitId(rotation));

  if (!activeAssignments.length) return null;

  return activeAssignments.sort((a, b) => {
    const diff = getRotationStartTime(b) - getRotationStartTime(a);
    if (diff !== 0) return diff;
    const createdA = new Date(a.createdAt || a.created_at || 0).getTime();
    const createdB = new Date(b.createdAt || b.created_at || 0).getTime();
    return createdB - createdA;
  })[0] || null;
}

function resolveUpcomingAssignment(subject = {}) {
  const rotations = getAssignmentRecords(subject);

  return [...rotations]
    .map(normalizeRotation)
    .filter((rotation) => rotation && rotation.status === 'upcoming' && getRotationUnitId(rotation))
    .sort((a, b) => getRotationStartTime(a) - getRotationStartTime(b))[0] || null;
}

function collectRotationIntegrityIssues(rotations = []) {
  const assignments = [...rotations]
    .map((rotation) => ({ original: rotation, normalized: normalizeRotation(rotation) }))
    .filter(({ normalized }) => normalized);

  const activeAssignments = assignments.filter(({ original }) => String(original.status || '').trim().toLowerCase() === 'active');
  const missingUnits = assignments.filter(({ normalized }) => !getRotationUnitId(normalized)).length;
  const missingDates = assignments.filter(({ normalized }) => !parseRotationDate(normalized.startDate || normalized.start_date)).length;
  const invalidStatuses = assignments.filter(({ original }) => !isValidRotationStatus(original)).length;

  return {
    duplicateActiveAssignments: Math.max(0, activeAssignments.length - 1),
    missingUnits,
    missingDates,
    invalidStatuses,
  };
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

function isCompletedRotation(rotation, today = new Date()) {
  if (!rotation || typeof rotation !== 'object') return false;

  const status = String(rotation.status || '').trim().toLowerCase();
  if (status === 'completed') return true;

  const workflowState = String(rotation.workflowState || '').trim().toLowerCase();
  if (workflowState === 'completed') return true;

  if (rotation.endDate) {
    const endDate = new Date(rotation.endDate);
    const todayDate = new Date(today);
    if (!Number.isNaN(endDate.getTime()) && !Number.isNaN(todayDate.getTime())) {
      endDate.setHours(0, 0, 0, 0);
      todayDate.setHours(0, 0, 0, 0);
      return endDate < todayDate;
    }
  }

  return false;
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
  isCompletedRotation,
  normalizeRotation,
  resolveCurrentAssignment,
  resolveUpcomingAssignment,
  getLatestActiveLikeAssignment,
  collectRotationIntegrityIssues,
  getRotationUnitId,
  isValidRotationStatus,
  transitionAssignmentStatus,
  calculateOverdueDays,
};
