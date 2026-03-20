const ActivityLog = require('../models/ActivityLog');

async function logRecentUpdate(type, message) {
  const activity = await ActivityLog.create({
    action: type,
    metadata: { message },
  });

  return activity;
}

async function logRecentUpdateSafe(type, message) {
  try {
    await logRecentUpdate(type, message);
  } catch (err) {
    console.error(`[RecentUpdates] Failed to log activity ${type}:`, err);
  }
}

module.exports = {
  logRecentUpdate,
  logRecentUpdateSafe,
};
