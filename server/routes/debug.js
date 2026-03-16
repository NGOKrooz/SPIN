// Debug endpoints for troubleshooting
const express = require('express');

const Intern = require('../models/Intern');
const Unit = require('../models/Unit');
const Rotation = require('../models/Rotation');
const { autoAdvanceRotation } = require('../services/rotationService');

const router = express.Router();

// GET /api/debug/env - Check environment variables
router.get('/env', (req, res) => {
  res.json({
    AUTO_ROTATION: process.env.AUTO_ROTATION,
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    hasAdminPassword: !!process.env.ADMIN_PASSWORD,
    hasMongoUri: !!process.env.MONGO_URI,
  });
});

// GET /api/debug/interns - Check interns in database
router.get('/interns', async (req, res) => {
  try {
    const interns = await Intern.find({}).exec();
    res.json({ count: interns.length, interns });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/debug/units - Check units in database
router.get('/units', async (req, res) => {
  try {
    const units = await Unit.find({}).exec();
    res.json({ count: units.length, units });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/debug/rotations - Check rotations in database
router.get('/rotations', async (req, res) => {
  try {
    const rotations = await Rotation.find({})
      .populate('internId')
      .populate('unitId')
      .sort({ startDate: -1 })
      .limit(50)
      .exec();

    res.json({ count: rotations.length, rotations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/debug/rotations/:internId - Check specific intern's rotations
router.get('/rotations/:internId', async (req, res) => {
  const { internId } = req.params;

  const autoRotationEnabled = process.env.AUTO_ROTATION === 'true';
  if (autoRotationEnabled) {
    try {
      console.log(`[Debug] Triggering auto-advance for intern ${internId}...`);
      await autoAdvanceRotation(internId);
    } catch (err) {
      console.error(`[Debug] Error triggering auto-advance for intern ${internId}:`, err);
    }
  }

  try {
    const rotations = await Rotation.find({ internId })
      .populate('unitId')
      .sort({ startDate: 1 })
      .exec();

    const today = new Date().toISOString().split('T')[0];

    res.json({
      internId,
      today,
      count: rotations.length,
      rotations,
      upcoming: rotations.filter(r => r.startDate.toISOString().split('T')[0] > today),
      current: rotations.filter(r => {
        const start = r.startDate.toISOString().split('T')[0];
        const end = r.endDate.toISOString().split('T')[0];
        return start <= today && end >= today;
      }),
      past: rotations.filter(r => r.endDate.toISOString().split('T')[0] < today),
      autoRotationEnabled,
      note: autoRotationEnabled ? 'Auto-advance was triggered before querying' : 'Auto-rotation is disabled',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
