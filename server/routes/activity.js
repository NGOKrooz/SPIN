const express = require('express');
const db = require('../database/dbWrapper');

const router = express.Router();

// GET /api/activity/recent - Get recent activity logs
router.get('/recent', (req, res) => {
  const query = `
    SELECT id, action, description, created_at
    FROM activity_logs
    ORDER BY created_at DESC
    LIMIT 10
  `;
  
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('Error fetching recent activity:', err);
      return res.status(500).json({ error: 'Failed to fetch activity logs' });
    }
    
    res.json(rows || []);
  });
});

// DELETE /api/activity/clear - Clear all activity logs
router.delete('/clear', (req, res) => {
  db.run('DELETE FROM activity_logs', [], (err) => {
    if (err) {
      console.error('Error clearing activity logs:', err);
      return res.status(500).json({ error: 'Failed to clear activity logs' });
    }

    res.json({ success: true, message: 'Activity logs cleared' });
  });
});

module.exports = router;
