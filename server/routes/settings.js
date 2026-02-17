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
  const systemName = raw.system_name?.trim() || 'SPIN';
  const defaultDurationRaw = raw.default_rotation_duration_days;
  const defaultDuration = defaultDurationRaw === '' || defaultDurationRaw === null || defaultDurationRaw === undefined
    ? null
    : parseInt(defaultDurationRaw, 10);

  return {
    system_name: systemName,
    default_rotation_duration_days: Number.isFinite(defaultDuration) ? defaultDuration : null,
    auto_rotation_enabled: String(raw.auto_rotation_enabled ?? 'true').toLowerCase() === 'true',
  };
};

// GET /api/settings/system - Get system settings
router.get('/system', async (req, res) => {
  try {
    const [systemName, defaultDuration, autoRotation] = await Promise.all([
      getSetting('system_name', 'SPIN'),
      getSetting('default_rotation_duration_days', ''),
      getSetting('auto_rotation_enabled', 'true'),
    ]);

    res.json(normalizeSystemSettings({
      system_name: systemName,
      default_rotation_duration_days: defaultDuration,
      auto_rotation_enabled: autoRotation,
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
    body('system_name').optional().trim().isLength({ min: 2, max: 100 }),
    body('default_rotation_duration_days').optional().isInt({ min: 1 }),
    body('auto_rotation_enabled').optional().isBoolean(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const updates = [];
      if (req.body.system_name !== undefined) {
        updates.push(setSetting('system_name', req.body.system_name, 'System display name'));
      }
      if (req.body.default_rotation_duration_days !== undefined) {
        updates.push(setSetting('default_rotation_duration_days', req.body.default_rotation_duration_days, 'Default rotation duration'));
      }
      if (req.body.auto_rotation_enabled !== undefined) {
        updates.push(setSetting('auto_rotation_enabled', req.body.auto_rotation_enabled, 'Auto-rotation enabled'));
      }

      if (updates.length > 0) {
        await Promise.all(updates);
      }

      const [systemName, defaultDuration, autoRotation] = await Promise.all([
        getSetting('system_name', 'SPIN'),
        getSetting('default_rotation_duration_days', ''),
        getSetting('auto_rotation_enabled', 'true'),
      ]);

      res.json(normalizeSystemSettings({
        system_name: systemName,
        default_rotation_duration_days: defaultDuration,
        auto_rotation_enabled: autoRotation,
      }));
    } catch (err) {
      console.error('Error updating system settings:', err);
      res.status(500).json({ error: 'Failed to update system settings' });
    }
  }
);

module.exports = { router };
