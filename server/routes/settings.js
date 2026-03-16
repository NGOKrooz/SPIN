const express = require('express');
const { body, validationResult } = require('express-validator');

const Setting = require('../models/Setting');
const { logRecentUpdateSafe } = require('../services/recentUpdatesService');

const router = express.Router();

async function getSetting(key, defaultValue = '') {
  const setting = await Setting.findOne({ key }).exec();
  return setting ? setting.value : defaultValue;
}

async function setSetting(key, value, description = '') {
  const valueStr = value === undefined || value === null ? '' : String(value);
  const updated = await Setting.findOneAndUpdate(
    { key },
    { value: valueStr, description, updatedAt: new Date() },
    { upsert: true, new: true }
  ).exec();
  return updated;
}

function normalizeSystemSettings(raw) {
  const rotationDurationWeeksRaw = raw.rotation_duration_weeks;
  const rotationDurationWeeks = rotationDurationWeeksRaw === '' || rotationDurationWeeksRaw === null || rotationDurationWeeksRaw === undefined
    ? 4
    : parseInt(rotationDurationWeeksRaw, 10);

  return {
    rotation_duration_weeks: Number.isFinite(rotationDurationWeeks) ? rotationDurationWeeks : 4,
    allow_reassignment: String(raw.allow_reassignment ?? 'true').toLowerCase() === 'true',
    auto_log_activity: String(raw.auto_log_activity ?? 'true').toLowerCase() === 'true',
  };
}

// GET /api/settings/system - Get system settings
router.get('/system', async (req, res) => {
  try {
    const [rotationDurationWeeks, allowReassignment, autoLogActivity] = await Promise.all([
      getSetting('rotation_duration_weeks', '4'),
      getSetting('allow_reassignment', 'true'),
      getSetting('auto_log_activity', 'true'),
    ]);

    res.json(normalizeSystemSettings({
      rotation_duration_weeks: rotationDurationWeeks,
      allow_reassignment: allowReassignment,
      auto_log_activity: autoLogActivity,
    }));
  } catch (err) {
    console.error('Error fetching system settings:', err);
    res.status(500).json({ error: 'Failed to fetch system settings' });
  }
});

// GET /api/settings - Alias for backward compatibility
router.get('/', (req, res) => {
  res.redirect(301, '/api/settings/system');
});

// PUT /api/settings/system - Update system settings
router.put(
  '/system',
  [
    body('rotation_duration_weeks').optional().isInt({ min: 1, max: 52 }),
    body('allow_reassignment').optional().isBoolean(),
    body('auto_log_activity').optional().isBoolean(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const updates = [];
      if (req.body.rotation_duration_weeks !== undefined) {
        updates.push(setSetting('rotation_duration_weeks', req.body.rotation_duration_weeks, 'Rotation duration in weeks'));
      }
      if (req.body.allow_reassignment !== undefined) {
        updates.push(setSetting('allow_reassignment', req.body.allow_reassignment, 'Allow manual reassignment'));
      }
      if (req.body.auto_log_activity !== undefined) {
        updates.push(setSetting('auto_log_activity', req.body.auto_log_activity, 'Automatically log activity'));
      }

      if (updates.length > 0) {
        await Promise.all(updates);
      }

      if (req.body.rotation_duration_weeks !== undefined) {
        await logRecentUpdateSafe(
          'settings_rotation_duration_changed',
          `Rotation duration changed to ${req.body.rotation_duration_weeks} week(s).`
        );
      }
      if (req.body.allow_reassignment !== undefined) {
        await logRecentUpdateSafe(
          'settings_reassignment_toggled',
          `Reassignment was ${req.body.allow_reassignment ? 'enabled' : 'disabled'}.`
        );
      }

      const [rotationDurationWeeks, allowReassignment, autoLogActivity] = await Promise.all([
        getSetting('rotation_duration_weeks', '4'),
        getSetting('allow_reassignment', 'true'),
        getSetting('auto_log_activity', 'true'),
      ]);

      res.json(normalizeSystemSettings({
        rotation_duration_weeks: rotationDurationWeeks,
        allow_reassignment: allowReassignment,
        auto_log_activity: autoLogActivity,
      }));
    } catch (err) {
      console.error('Error updating system settings:', err);
      res.status(500).json({ error: 'Failed to update system settings' });
    }
  }
);

module.exports = { router };
