// Strict allowed lifecycle statuses
const VALID_LIFECYCLE_STATUSES = new Set(['active', 'upcoming', 'completed', 'awaiting_confirmation']);

function parseRotationDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

// normalizeRotation is intentionally a no-op under strict single-source-of-truth rules.
// Do NOT reinterpret or map status values. Return the rotation object as-is.
function normalizeRotation(rotation = {}) {
  if (!rotation || typeof rotation !== 'object') return null;
  return rotation;
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
  if (!rotation) return false;
  return String(rotation.status || '').trim().toLowerCase() === 'active';
}

function isValidRotationStatus(rotation) {
  if (!rotation) return false;
  const rawStatus = String(rotation.status || '').trim().toLowerCase();
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
  if (!Array.isArray(rotations) || rotations.length === 0) return null;
  // Strict resolution: return first rotation with status === 'active'
  const found = rotations.find((r) => String(r.status || '').trim().toLowerCase() === 'active');
  return found || null;
}

function resolveUpcomingAssignment(subject = {}) {
  const rotations = getAssignmentRecords(subject);
  if (!Array.isArray(rotations) || rotations.length === 0) return null;
  // Strict resolution: return first rotation with status === 'upcoming'
  const found = rotations.find((r) => String(r.status || '').trim().toLowerCase() === 'upcoming');
  return found || null;
}

function collectRotationIntegrityIssues(rotations = []) {
  const assignments = Array.isArray(rotations) ? rotations : [];
  const activeAssignments = assignments.filter((r) => String(r.status || '').trim().toLowerCase() === 'active');
  const missingUnits = assignments.filter((r) => !getRotationUnitId(r)).length;
  const missingDates = assignments.filter((r) => !parseRotationDate(r.startDate || r.start_date)).length;
  const invalidStatuses = assignments.filter((r) => !isValidRotationStatus(r)).length;

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

function isCompletedRotation(rotation) {
  if (!rotation || typeof rotation !== 'object') return false;
  return String(rotation.status || '').trim().toLowerCase() === 'completed';
}

function transitionAssignmentStatus(assignment, action) {
  if (!assignment || typeof assignment !== 'object') return assignment;
  if (action === 'admin-confirm') {
    return {
      ...assignment,
      status: 'completed',
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
