const express = require('express');

const Activity = require('../models/Activity');
const ActivityLog = require('../models/ActivityLog');

const router = express.Router();

function toDescription(activity) {
  if (activity?.details?.message) return activity.details.message;
  if (activity?.details?.intern || activity?.details?.unit || activity?.details?.newUnit) {
    const internText = activity?.details?.intern ? `intern: ${activity.details.intern}` : null;
    const unitText = activity?.details?.unit ? `unit: ${activity.details.unit}` : null;
    const newUnitText = activity?.details?.newUnit ? `newUnit: ${activity.details.newUnit}` : null;
    const daysText = Number.isFinite(Number(activity?.details?.days)) ? `days: ${activity.details.days}` : null;
    const parts = [internText, unitText, newUnitText, daysText].filter(Boolean);
    if (parts.length > 0) return parts.join(', ');
  }
  if (activity?.message) return activity.message;
  if (activity?.description) return activity.description;
  if (activity?.messageText) return activity.messageText;

  const action = activity?.action || activity?.type || 'activity';
  const cleanedAction = String(action).replace(/_/g, ' ').trim();
  return cleanedAction.length > 0
    ? cleanedAction.charAt(0).toUpperCase() + cleanedAction.slice(1)
    : 'Activity update';
}

function normalizeActivity(item) {
  return {
    id: item?._id?.toString?.() || item?.id || null,
    action: item?.action || item?.type || 'activity',
    details: item?.details || null,
    description: toDescription(item),
    created_at: item?.timestamp || item?.createdAt || item?.created_at || null,
    createdAt: item?.timestamp || item?.createdAt || item?.created_at || null,
    intern: item?.intern || item?.internId || null,
    unit: item?.unit || item?.unitId || null,
  };
}

// GET /api/activity/recent - Get recent activities
router.get('/recent', async (req, res) => {
  try {
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(limitRaw, 1000)
      : 10;

    const [activityLogs, legacyActivities] = await Promise.all([
      ActivityLog.find({})
        .populate('intern')
        .sort({ timestamp: -1, createdAt: -1 })
        .limit(limit)
        .exec(),
      Activity.find({})
        .populate('internId')
        .populate('unitId')
        .sort({ createdAt: -1 })
        .limit(limit)
        .exec(),
    ]);

    const merged = [...(activityLogs || []), ...(legacyActivities || [])]
      .sort((a, b) => {
        const aRawDate = a?.timestamp || a?.createdAt || a?.created_at;
        const bRawDate = b?.timestamp || b?.createdAt || b?.created_at;
        const aDate = aRawDate ? new Date(aRawDate).getTime() : 0;
        const bDate = bRawDate ? new Date(bRawDate).getTime() : 0;
        return bDate - aDate;
      })
      .slice(0, limit)
      .map(normalizeActivity);

    console.log('ACTIVITIES:', merged);

    res.json(merged);
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
