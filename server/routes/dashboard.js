const express = require('express');
const { startOfDay } = require('date-fns');

const Intern = require('../models/Intern');
const Rotation = require('../models/Rotation');
const Unit = require('../models/Unit');

const router = express.Router();

// GET /api/dashboard - Summary stats used for dashboard
router.get('/', async (req, res) => {
  try {
    const totalInterns = await Intern.countDocuments();
    const totalUnits = await Unit.countDocuments();

    const today = startOfDay(new Date());
    const activeInterns = await Rotation.countDocuments({
      startDate: { $lte: today },
      endDate: { $gte: today },
    });

    res.json({ totalInterns, activeInterns, totalUnits });
  } catch (err) {
    console.error('Error fetching dashboard stats:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

module.exports = router;
