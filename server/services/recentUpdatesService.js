const db = require('../database/dbWrapper');

function logRecentUpdate(action, description) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO activity_logs (action, description) VALUES (?, ?)',
      [action, description],
      function(err) {
        if (err) return reject(err);
        resolve({ id: this.lastID || null, changes: this.changes || 0 });
      }
    );
  });
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
