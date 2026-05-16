const ACTIVE_LIKE = new Set(['active', 'pending']);
const VISIBLE_STATUSES = ['active', 'pending'];

function isActiveLikeAssignment(subject) {
  if (!subject) return false;
  if (typeof subject === 'string') return ACTIVE_LIKE.has(subject);
  if (typeof subject === 'object' && subject.status) return ACTIVE_LIKE.has(String(subject.status));
  return false;
}

function getLatestActiveLikeAssignment(rotations = []) {
  if (!Array.isArray(rotations)) return null;
  return [...rotations]
    .filter((rotation) => isActiveLikeAssignment(rotation))
    .sort((a, b) => {
      const aDate = new Date(a.startDate || a.start_date || 0).getTime();
      const bDate = new Date(b.startDate || b.start_date || 0).getTime();
      return bDate - aDate;
    })[0] || null;
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
      status: 'pending',
      overdueDays: calculateOverdueDays(assignment),
    };
  }

  if (action === 'admin-confirm') {
    return {
      ...assignment,
      status: 'completed',
    };
  }

  return assignment;
}

module.exports = {
  isActiveLikeAssignment,
  getLatestActiveLikeAssignment,
  transitionAssignmentStatus,
  calculateOverdueDays,
  VISIBLE_STATUSES,
};
