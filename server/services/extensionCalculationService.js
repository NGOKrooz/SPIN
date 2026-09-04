// Single source of truth for an intern's extension-days calculation, used by
// both the general Interns list and the individual Intern Dashboard so they
// can never disagree.
//
// Extension = SUM(max(0, actual_days_spent_in_unit - required_days_for_that_unit))
// across every completed rotation, plus the current rotation ONLY if it has
// already exceeded its required duration (i.e. it is overdue/pending
// confirmation) - never for normal in-progress days remaining, and never for
// a future 'upcoming'/'awaiting_confirmation' rotation that hasn't happened
// yet.
//
// This is computed fresh from each rotation's actual recorded dates and the
// unit's currently configured duration every time it's called - nothing is
// read from (or written back to) a persisted running total. That makes it
// automatically correct after a start-date edit or any other rotation-date
// backdating reconciles the underlying dates: there is no stale accumulator
// left over from before the edit that could disagree with the real history.

const DAY_IN_MS = 1000 * 60 * 60 * 24;

const normalizeDay = (dateLike) => {
  if (!dateLike) return null;
  const value = new Date(dateLike);
  if (Number.isNaN(value.getTime())) return null;
  value.setHours(0, 0, 0, 0);
  return value;
};

const getRequiredDuration = (rotation) => {
  const unit = rotation?.unit;
  const required = Number(
    unit?.durationDays
    ?? unit?.duration_days
    ?? unit?.duration
    ?? rotation?.baseDuration
  );
  return Number.isFinite(required) && required > 0 ? required : 0;
};

/**
 * @param {Array} rotations - rotation records for one intern, each with
 *   status, startDate/start_date, endDate/end_date, and a populated unit
 *   (or baseDuration as a fallback if the unit reference is unavailable).
 * @param {Date} todayDate - defaults to now; pass explicitly in tests.
 * @returns {number} total extension days, always >= 0.
 */
function calculateInternExtensionDays(rotations = [], todayDate = new Date()) {
  const today = normalizeDay(todayDate);
  if (!Array.isArray(rotations) || !today) return 0;

  let total = 0;

  for (const rotation of rotations) {
    const status = String(rotation?.status || '').trim().toLowerCase();
    // Future/not-yet-real rotations never contribute - they haven't
    // happened, so there's nothing to have overrun yet.
    if (status === 'upcoming' || status === 'awaiting_confirmation') continue;

    const required = getRequiredDuration(rotation);
    if (!required) continue; // can't judge "excess" without a configured duration

    const start = normalizeDay(rotation?.startDate || rotation?.start_date);
    if (!start) continue;

    let actualDays;
    if (status === 'completed') {
      const end = normalizeDay(rotation?.endDate || rotation?.end_date);
      if (!end) continue;
      actualDays = Math.round((end.getTime() - start.getTime()) / DAY_IN_MS) + 1;
    } else {
      // Active (or otherwise still-current/pending) rotation: only count
      // days actually elapsed so far, never projecting forward into days
      // not yet lived - a rotation that hasn't reached its required
      // duration yet contributes 0, matching "no normal days remaining".
      if (today.getTime() < start.getTime()) continue;
      actualDays = Math.round((today.getTime() - start.getTime()) / DAY_IN_MS) + 1;
    }

    if (Number.isFinite(actualDays) && actualDays > 0) {
      total += Math.max(0, actualDays - required);
    }
  }

  return total;
}

module.exports = {
  calculateInternExtensionDays,
};
