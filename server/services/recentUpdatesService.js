const ActivityLog = require('../models/ActivityLog');

async function logActivity(action, details = {}, internId = null) {
  const activity = await ActivityLog.create({
    action,
    details: details || null,
    message: details?.message || null,
    intern: internId || details?.internId || null,
    timestamp: new Date(),
  });

  return activity;
}

async function logActivitySafe(action, details = {}, internId = null) {
  try {
    await logActivity(action, details, internId);
  } catch (err) {
    console.error(`[RecentUpdates] Failed to log activity ${action}:`, err);
  }
}

async function logRecentUpdate(type, message, internId = null) {
  return logActivity(type, { message }, internId);
}

async function logRecentUpdateSafe(type, message, internId = null) {
  return logActivitySafe(type, { message }, internId);
}

module.exports = {
  logActivity,
  logActivitySafe,
  logRecentUpdate,
  logRecentUpdateSafe,
};
