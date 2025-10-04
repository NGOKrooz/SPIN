const express = require('express');
const { body, validationResult } = require('express-validator');
const { getDatabase } = require('../database/init');

const router = express.Router();
const db = getDatabase();

// Validation middleware
const validateSetting = [
  body('key').trim().isLength({ min: 1, max: 50 }).withMessage('Key must be 1-50 characters'),
  body('value').trim().isLength({ min: 1, max: 200 }).withMessage('Value must be 1-200 characters')
];

// GET /api/settings - Get all settings
router.get('/', (req, res) => {
  const query = 'SELECT * FROM settings ORDER BY key';
  
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('Error fetching settings:', err);
      return res.status(500).json({ error: 'Failed to fetch settings' });
    }
    
    // Convert to key-value object
    const settings = rows.reduce((acc, row) => {
      acc[row.key] = {
        value: row.value,
        description: row.description,
        updated_at: row.updated_at
      };
      return acc;
    }, {});
    
    res.json(settings);
  });
});

// GET /api/settings/:key - Get specific setting
router.get('/:key', (req, res) => {
  const { key } = req.params;
  
  const query = 'SELECT * FROM settings WHERE key = ?';
  
  db.get(query, [key], (err, row) => {
    if (err) {
      console.error('Error fetching setting:', err);
      return res.status(500).json({ error: 'Failed to fetch setting' });
    }
    
    if (!row) {
      return res.status(404).json({ error: 'Setting not found' });
    }
    
    res.json({
      key: row.key,
      value: row.value,
      description: row.description,
      updated_at: row.updated_at
    });
  });
});

// PUT /api/settings/:key - Update setting
router.put('/:key', [
  body('value').trim().isLength({ min: 1, max: 200 }).withMessage('Value must be 1-200 characters')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  const { key } = req.params;
  const { value } = req.body;
  
  const query = `
    UPDATE settings 
    SET value = ?, updated_at = CURRENT_TIMESTAMP
    WHERE key = ?
  `;
  
  db.run(query, [value, key], function(err) {
    if (err) {
      console.error('Error updating setting:', err);
      return res.status(500).json({ error: 'Failed to update setting' });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Setting not found' });
    }
    
    res.json({ message: 'Setting updated successfully' });
  });
});

// POST /api/settings - Create new setting
router.post('/', validateSetting, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  const { key, value, description } = req.body;
  
  const query = `
    INSERT INTO settings (key, value, description)
    VALUES (?, ?, ?)
  `;
  
  db.run(query, [key, value, description], function(err) {
    if (err) {
      console.error('Error creating setting:', err);
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(400).json({ error: 'Setting key already exists' });
      }
      return res.status(500).json({ error: 'Failed to create setting' });
    }
    
    res.status(201).json({
      id: this.lastID,
      key,
      value,
      description
    });
  });
});

// DELETE /api/settings/:key - Delete setting
router.delete('/:key', (req, res) => {
  const { key } = req.params;
  
  // Prevent deletion of critical settings
  const criticalSettings = [
    'batch_a_off_day',
    'batch_b_off_day',
    'internship_duration_months',
    'rotation_buffer_days'
  ];
  
  if (criticalSettings.includes(key)) {
    return res.status(400).json({ error: 'Cannot delete critical system setting' });
  }
  
  const query = 'DELETE FROM settings WHERE key = ?';
  
  db.run(query, [key], function(err) {
    if (err) {
      console.error('Error deleting setting:', err);
      return res.status(500).json({ error: 'Failed to delete setting' });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Setting not found' });
    }
    
    res.json({ message: 'Setting deleted successfully' });
  });
});

// GET /api/settings/batch-schedule - Get batch schedule configuration
router.get('/batch-schedule', (req, res) => {
  const query = `
    SELECT key, value FROM settings 
    WHERE key IN ('batch_a_off_day', 'batch_b_off_day', 'internship_duration_months', 'rotation_buffer_days')
  `;
  
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('Error fetching batch schedule:', err);
      return res.status(500).json({ error: 'Failed to fetch batch schedule' });
    }
    
    const schedule = rows.reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
    
    res.json({
      batch_a_off_day: schedule.batch_a_off_day || 'Monday',
      batch_b_off_day: schedule.batch_b_off_day || 'Wednesday',
      internship_duration_months: parseInt(schedule.internship_duration_months) || 12,
      rotation_buffer_days: parseInt(schedule.rotation_buffer_days) || 2
    });
  });
});

// PUT /api/settings/batch-schedule - Update batch schedule configuration
router.put('/batch-schedule', [
  body('batch_a_off_day').isIn(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']).withMessage('Invalid day for Batch A'),
  body('batch_b_off_day').isIn(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']).withMessage('Invalid day for Batch B'),
  body('internship_duration_months').isInt({ min: 6, max: 24 }).withMessage('Internship duration must be 6-24 months'),
  body('rotation_buffer_days').isInt({ min: 0, max: 7 }).withMessage('Buffer days must be 0-7')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  const { batch_a_off_day, batch_b_off_day, internship_duration_months, rotation_buffer_days } = req.body;
  
  if (batch_a_off_day === batch_b_off_day) {
    return res.status(400).json({ error: 'Batch A and Batch B cannot have the same off day' });
  }
  
  const updates = [
    { key: 'batch_a_off_day', value: batch_a_off_day },
    { key: 'batch_b_off_day', value: batch_b_off_day },
    { key: 'internship_duration_months', value: internship_duration_months.toString() },
    { key: 'rotation_buffer_days', value: rotation_buffer_days.toString() }
  ];
  
  const query = `
    UPDATE settings 
    SET value = ?, updated_at = CURRENT_TIMESTAMP
    WHERE key = ?
  `;
  
  let completed = 0;
  let hasError = false;
  
  updates.forEach(update => {
    db.run(query, [update.value, update.key], function(err) {
      if (err && !hasError) {
        hasError = true;
        console.error('Error updating batch schedule:', err);
        return res.status(500).json({ error: 'Failed to update batch schedule' });
      }
      
      completed++;
      if (completed === updates.length && !hasError) {
        res.json({ message: 'Batch schedule updated successfully' });
      }
    });
  });
});

// GET /api/settings/system-info - Get system information
router.get('/system-info', (req, res) => {
  const queries = [
    'SELECT COUNT(*) as count FROM interns',
    'SELECT COUNT(*) as count FROM units',
    'SELECT COUNT(*) as count FROM rotations',
    'SELECT COUNT(*) as count FROM interns WHERE status = "Active"',
    'SELECT COUNT(*) as count FROM interns WHERE status = "Extended"',
    'SELECT COUNT(*) as count FROM interns WHERE status = "Completed"'
  ];
  
  const results = {};
  let completed = 0;
  let hasError = false;
  
  queries.forEach((query, index) => {
    db.get(query, [], (err, row) => {
      if (err && !hasError) {
        hasError = true;
        console.error('Error fetching system info:', err);
        return res.status(500).json({ error: 'Failed to fetch system information' });
      }
      
      if (!hasError) {
        switch (index) {
          case 0:
            results.total_interns = row.count;
            break;
          case 1:
            results.total_units = row.count;
            break;
          case 2:
            results.total_rotations = row.count;
            break;
          case 3:
            results.active_interns = row.count;
            break;
          case 4:
            results.extended_interns = row.count;
            break;
          case 5:
            results.completed_interns = row.count;
            break;
        }
      }
      
      completed++;
      if (completed === queries.length && !hasError) {
        res.json({
          ...results,
          database_path: process.env.DB_PATH || './database/spin.db',
          server_version: '1.0.0',
          last_updated: new Date().toISOString()
        });
      }
    });
  });
});

module.exports = router;
