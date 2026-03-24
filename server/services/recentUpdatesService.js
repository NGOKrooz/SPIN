const ActivityLog = require('../models/ActivityLog');

async function logRecentUpdate(type, message, internId = null) {
  const activity = await ActivityLog.create({
    action: type,
    message: message || null,
    intern: internId,
  });

  return activity;
}

async function logRecentUpdateSafe(type, message, internId = null) {
  try {
    await logRecentUpdate(type, message, internId);
  } catch (err) {
    console.error(`[RecentUpdates] Failed to log activity ${type}:`, err);
  }
}

module.exports = {
  logRecentUpdate,
  logRecentUpdateSafe,
};
