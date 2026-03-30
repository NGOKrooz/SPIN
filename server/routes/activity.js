const express = require('express');

const Activity = require('../models/Activity');
const ActivityLog = require('../models/ActivityLog');
const Intern = require('../models/Intern');
const Rotation = require('../models/Rotation');
const Unit = require('../models/Unit');
const {
  ACTIVITY_TYPES,
  getRecentActivities,
  logActivityEventSafe,
} = require('../services/recentUpdatesService');

const router = express.Router();

const DEFAULT_ROTATION_DURATION_DAYS = 20;

function recalculateEndDate(startDate, duration) {
  const start = new Date(startDate);
  const safeDuration = Number(duration);
  const finalDuration = Number.isFinite(safeDuration) && safeDuration > 0
    ? safeDuration
    : DEFAULT_ROTATION_DURATION_DAYS;

  const end = new Date(start);
  end.setDate(end.getDate() + finalDuration);
  return end;
}

async function syncRotationMovementsForFeed() {
  const now = new Date();
  const interns = await Intern.find({})
    .select('name currentUnit status extensionDays')
    .populate('currentUnit', 'name')
    .exec();

  for (const intern of interns) {
    const rotations = await Rotation.find({ intern: intern._id }).sort({ startDate: 1 }).exec();
    if (rotations.length === 0) {
      continue;
    }

    let hasActiveRotation = false;
    for (const rotation of rotations) {
      const duration = Number(rotation.duration);
      const safeDuration = Number.isFinite(duration) && duration > 0
        ? duration
        : DEFAULT_ROTATION_DURATION_DAYS;

      if (rotation.duration !== safeDuration) {
        rotation.duration = safeDuration;
      }

      if (!rotation.endDate || Number.isNaN(new Date(rotation.endDate).getTime())) {
        rotation.endDate = recalculateEndDate(rotation.startDate, safeDuration);
      }

      const startDate = new Date(rotation.startDate);
      const endDate = new Date(rotation.endDate);

      let nextStatus = rotation.status;
      if (rotation.status !== 'completed' && now > endDate) {
        nextStatus = 'completed';
      } else if (rotation.status !== 'completed' && !hasActiveRotation && startDate <= now && now <= endDate) {
        nextStatus = 'active';
        hasActiveRotation = true;
      } else if (rotation.status !== 'completed') {
        nextStatus = 'upcoming';
      }

      if (rotation.status !== nextStatus) {
        rotation.status = nextStatus;
      }

      await rotation.save();
    }

    const currentRotation = rotations.find((rotation) => rotation.status === 'active') || null;
    const completedRotations = rotations.filter((rotation) => rotation.status === 'completed');
    const previousUnitId = intern.currentUnit?._id?.toString?.() || intern.currentUnit?.toString?.() || null;
    const nextUnitId = currentRotation?.unit?.toString?.() || null;
    const nextStatus = rotations.length > 0 && completedRotations.length === rotations.length
      ? 'completed'
      : (Number(intern.extensionDays || 0) > 0 ? 'extended' : 'active');

    if (previousUnitId && nextUnitId && previousUnitId !== nextUnitId) {
      const nextUnit = await Unit.findById(nextUnitId).select('name').exec();

      await logActivityEventSafe({
        type: ACTIVITY_TYPES.ROTATION_MOVED,
        metadata: {
          internId: intern._id.toString(),
          internName: intern.name,
          previousUnitId,
          previousUnitName: intern.currentUnit?.name || 'Unknown unit',
          nextUnitId,
          nextUnitName: nextUnit?.name || 'Unknown unit',
        },
      });
    }

    if (intern.status !== nextStatus || String(previousUnitId || '') !== String(nextUnitId || '')) {
      intern.status = nextStatus;
      intern.currentUnit = currentRotation?.unit || null;
      await intern.save();
    }
  }
}

// GET /api/activity/recent - Get recent activities
router.get('/recent', async (req, res) => {
  try {
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(limitRaw, 1000)
      : 10;

    await syncRotationMovementsForFeed();

    const activities = await getRecentActivities(limit);
    res.json(activities);
  } catch (err) {
    console.error('Error fetching recent activities:', err);
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
});

// DELETE /api/activity/clear - Clear all activities
router.delete('/clear', async (req, res) => {
  try {
    await Promise.all([
      Activity.deleteMany({}).exec(),
      ActivityLog.deleteMany({}).exec(),
    ]);
    res.json({ success: true, message: 'Activities cleared' });
  } catch (err) {
    console.error('Error clearing activities:', err);
    res.status(500).json({ error: 'Failed to clear activities' });
  }
});

module.exports = router;
