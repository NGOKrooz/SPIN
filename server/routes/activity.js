const express = require('express');

const Activity = require('../models/Activity');

const router = express.Router();

// GET /api/activity/recent - Get recent activities
router.get('/recent', async (req, res) => {
  try {
    const activities = await Activity.find({})
      .sort({ createdAt: -1 })
      .limit(10)
      .exec();
    res.json(activities);
  } catch (err) {
    console.error('Error fetching recent activities:', err);
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
});

// DELETE /api/activity/clear - Clear all activities
router.delete('/clear', async (req, res) => {
  try {
    await Activity.deleteMany({}).exec();
    res.json({ success: true, message: 'Activities cleared' });
  } catch (err) {
    console.error('Error clearing activities:', err);
    res.status(500).json({ error: 'Failed to clear activities' });
  }
});

module.exports = router;
