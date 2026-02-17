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

module.exports = router;
