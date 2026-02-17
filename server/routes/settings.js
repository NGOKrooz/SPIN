const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../database/dbWrapper');

const router = express.Router();

const getSetting = (key, defaultValue = '') => new Promise((resolve, reject) => {
  db.get('SELECT value FROM settings WHERE key = ?', [key], (err, row) => {
    if (err) return reject(err);
    if (!row || row.value === undefined || row.value === null) {
      return resolve(defaultValue);
    }
    resolve(row.value);
  });
});

const setSetting = (key, value, description = '') => new Promise((resolve, reject) => {
  const valueStr = value === undefined || value === null ? '' : String(value);
  const query = `
    INSERT INTO settings (key, value, description, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT (key)
    DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description, updated_at = CURRENT_TIMESTAMP
  `;

  db.run(query, [key, valueStr, description], (err) => {
    if (err) return reject(err);
    resolve();
  });
});

const normalizeSystemSettings = (raw) => {
  const rotationDurationWeeksRaw = raw.rotation_duration_weeks;
  const rotationDurationWeeks = rotationDurationWeeksRaw === '' || rotationDurationWeeksRaw === null || rotationDurationWeeksRaw === undefined
    ? 4
    : parseInt(rotationDurationWeeksRaw, 10);

  return {
    rotation_duration_weeks: Number.isFinite(rotationDurationWeeks) ? rotationDurationWeeks : 4,
    allow_reassignment: String(raw.allow_reassignment ?? 'true').toLowerCase() === 'true',
    auto_log_activity: String(raw.auto_log_activity ?? 'true').toLowerCase() === 'true',
  };
};

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
