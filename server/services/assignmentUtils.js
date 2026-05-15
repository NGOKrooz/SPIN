const ACTIVE_LIKE = new Set(['active', 'pending']);

function isActiveLikeAssignment(subject) {
  if (!subject) return false;
  if (typeof subject === 'string') return ACTIVE_LIKE.has(subject);
  if (typeof subject === 'object' && subject.status) return ACTIVE_LIKE.has(String(subject.status));
  return false;
}

module.exports = {
  isActiveLikeAssignment,
};
