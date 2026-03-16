const express = require('express');

const ActivityLog = require('../models/ActivityLog');

const router = express.Router();

// GET /api/activity/recent - Get recent activity logs
router.get('/recent', async (req, res) => {
  try {
    const logs = await ActivityLog.find({})
      .sort({ createdAt: -1 })
      .limit(10)
      .exec();
    res.json(logs);
  } catch (err) {
    console.error('Error fetching recent activity:', err);
    res.status(500).json({ error: 'Failed to fetch activity logs' });
  }
});

// DELETE /api/activity/clear - Clear all activity logs
router.delete('/clear', async (req, res) => {
  try {
    await ActivityLog.deleteMany({}).exec();
    res.json({ success: true, message: 'Activity logs cleared' });
  } catch (err) {
    console.error('Error clearing activity logs:', err);
    res.status(500).json({ error: 'Failed to clear activity logs' });
  }
});

module.exports = router;
