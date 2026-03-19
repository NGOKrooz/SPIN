const express = require('express');
const { startOfDay } = require('date-fns');

const Intern = require('../models/Intern');
const Rotation = require('../models/Rotation');
const Unit = require('../models/Unit');
const Activity = require('../models/Activity');

const router = express.Router();

async function updateBatchStats() {
  const today = startOfDay(new Date());
  const totalInterns = await Intern.countDocuments();
  const totalUnits = await Unit.countDocuments();
  const activeInterns = await Rotation.countDocuments({
    startDate: { $lte: today },
    endDate: { $gte: today },
  });

  return { totalInterns, activeInterns, totalUnits };
}

// GET /api/dashboard - Summary stats used for dashboard
router.get('/', async (req, res) => {
  try {
    const stats = await updateBatchStats();
    const recentActivities = await Activity.find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .exec();

    res.json({ ...stats, recentActivities });
  } catch (err) {
    console.error('Error fetching dashboard stats:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

// GET /api/dashboard/recent - Recent activity feed
router.get('/recent', async (req, res) => {
  try {
    const updates = await Activity.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .exec();

    res.json({ success: true, data: updates });
  } catch (error) {
    console.error('Dashboard updates error:', error);
    res.status(500).json({ success: false, data: [] });
  }
});

// GET /api/dashboard/stats - Batch stats recalculation
router.get('/stats', async (req, res) => {
  try {
    const stats = await updateBatchStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ success: false, data: {} });
  }
});

module.exports = router;
module.exports.updateBatchStats = updateBatchStats;
