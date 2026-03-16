const ActivityLog = require('../models/ActivityLog');

async function logRecentUpdate(action, description) {
  const log = await ActivityLog.create({
    activityType: action,
    details: description,
  });

  return log;
}

async function logRecentUpdateSafe(action, description) {
  try {
    await logRecentUpdate(action, description);
  } catch (err) {
    console.error(`[RecentUpdates] Failed to log action ${action}:`, err);
  }
}

module.exports = {
  logRecentUpdate,
  logRecentUpdateSafe,
};
