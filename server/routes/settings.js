const express = require('express');
const { body, validationResult } = require('express-validator');
const { getDatabase } = require('../database/init');
const { parseISO, differenceInDays } = require('date-fns');

const router = express.Router();
const db = getDatabase();

// Helper function to get batch off day for a specific date
function getBatchOffDay(batch, date, scheduleSettings) {
  const scheduleStartDate = parseISO(scheduleSettings.schedule_start_date || '2024-01-01');
  const daysSinceStart = differenceInDays(parseISO(date), scheduleStartDate);
  const weekNumber = Math.floor(daysSinceStart / 7) + 1;
  
  // Determine if it's weeks 1&2 or weeks 3&4 (cycles every 4 weeks)
  const cycleWeek = ((weekNumber - 1) % 4) + 1;
  const isWeek1Or2 = cycleWeek <= 2;
  
  if (batch === 'A') {
    return isWeek1Or2 ? scheduleSettings.batch_a_off_day_week1 : scheduleSettings.batch_a_off_day_week3;
  } else if (batch === 'B') {
    return isWeek1Or2 ? scheduleSettings.batch_b_off_day_week1 : scheduleSettings.batch_b_off_day_week3;
  }
  
  return null;
}

// Helper function to check if a batch is off on a specific date
function isBatchOffOnDate(batch, date, scheduleSettings) {
  const offDay = getBatchOffDay(batch, date, scheduleSettings);
  const dayOfWeek = new Date(date).toLocaleDateString('en-US', { weekday: 'long' });
  return offDay === dayOfWeek;
}

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
    'batch_a_off_day_week1',
    'batch_b_off_day_week1',
    'batch_a_off_day_week3',
    'batch_b_off_day_week3',
    'schedule_start_date',
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
    WHERE key IN ('batch_a_off_day_week1', 'batch_b_off_day_week1', 'batch_a_off_day_week3', 'batch_b_off_day_week3', 'schedule_start_date', 'internship_duration_months', 'rotation_buffer_days')
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
      batch_a_off_day_week1: schedule.batch_a_off_day_week1 || 'Monday',
      batch_b_off_day_week1: schedule.batch_b_off_day_week1 || 'Wednesday',
      batch_a_off_day_week3: schedule.batch_a_off_day_week3 || 'Wednesday',
      batch_b_off_day_week3: schedule.batch_b_off_day_week3 || 'Monday',
      schedule_start_date: schedule.schedule_start_date || '2024-01-01',
      internship_duration_months: parseInt(schedule.internship_duration_months) || 12,
      rotation_buffer_days: parseInt(schedule.rotation_buffer_days) || 2
    });
  });
});

// PUT /api/settings/batch-schedule - Update batch schedule configuration
router.put('/batch-schedule', [
  body('batch_a_off_day_week1').isIn(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']).withMessage('Invalid day for Batch A in weeks 1&2'),
  body('batch_b_off_day_week1').isIn(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']).withMessage('Invalid day for Batch B in weeks 1&2'),
  body('batch_a_off_day_week3').isIn(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']).withMessage('Invalid day for Batch A in weeks 3&4'),
  body('batch_b_off_day_week3').isIn(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']).withMessage('Invalid day for Batch B in weeks 3&4'),
  body('schedule_start_date').isISO8601().withMessage('Schedule start date must be a valid date'),
  body('internship_duration_months').isInt({ min: 6, max: 24 }).withMessage('Internship duration must be 6-24 months'),
  body('rotation_buffer_days').isInt({ min: 0, max: 7 }).withMessage('Buffer days must be 0-7')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  const { 
    batch_a_off_day_week1, 
    batch_b_off_day_week1, 
    batch_a_off_day_week3, 
    batch_b_off_day_week3, 
    schedule_start_date,
    internship_duration_months, 
    rotation_buffer_days 
  } = req.body;
  
  // Validate that batches don't have the same off day in the same week
  if (batch_a_off_day_week1 === batch_b_off_day_week1) {
    return res.status(400).json({ error: 'Batch A and Batch B cannot have the same off day in weeks 1&2' });
  }
  
  if (batch_a_off_day_week3 === batch_b_off_day_week3) {
    return res.status(400).json({ error: 'Batch A and Batch B cannot have the same off day in weeks 3&4' });
  }
  
  const updates = [
    { key: 'batch_a_off_day_week1', value: batch_a_off_day_week1 },
    { key: 'batch_b_off_day_week1', value: batch_b_off_day_week1 },
    { key: 'batch_a_off_day_week3', value: batch_a_off_day_week3 },
    { key: 'batch_b_off_day_week3', value: batch_b_off_day_week3 },
    { key: 'schedule_start_date', value: schedule_start_date },
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

// Helper function to get/set JSON settings
function getJSONSetting(key, defaultValue = {}) {
  return new Promise((resolve, reject) => {
    db.get('SELECT value FROM settings WHERE key = ?', [key], (err, row) => {
      if (err) return reject(err);
      if (!row) return resolve(defaultValue);
      try {
        resolve(JSON.parse(row.value));
      } catch (e) {
        resolve(defaultValue);
      }
    });
  });
}

function setJSONSetting(key, value, description = '') {
  return new Promise((resolve, reject) => {
    const valueStr = JSON.stringify(value);
    db.run(
      `INSERT OR REPLACE INTO settings (key, value, description, updated_at) 
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
      [key, valueStr, description],
      function(err) {
        if (err) return reject(err);
        resolve();
      }
    );
  });
}

// PUT /api/settings/workload-thresholds - Update workload thresholds
router.put('/workload-thresholds', [
  body('low_max').isInt({ min: 0 }).withMessage('Low max must be a non-negative integer'),
  body('medium_min').isInt({ min: 0 }).withMessage('Medium min must be a non-negative integer'),
  body('medium_max').isInt({ min: 0 }).withMessage('Medium max must be a non-negative integer'),
  body('high_min').isInt({ min: 0 }).withMessage('High min must be a non-negative integer')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    await setJSONSetting('workload_thresholds', req.body, 'Patient count thresholds for workload calculation');
    res.json({ message: 'Workload thresholds updated successfully' });
  } catch (err) {
    console.error('Error updating workload thresholds:', err);
    res.status(500).json({ error: 'Failed to update workload thresholds' });
  }
});

// GET /api/settings/workload-thresholds - Get workload thresholds
router.get('/workload-thresholds', async (req, res) => {
  try {
    const thresholds = await getJSONSetting('workload_thresholds', {
      low_max: 4,
      medium_min: 5,
      medium_max: 8,
      high_min: 9
    });
    res.json(thresholds);
  } catch (err) {
    console.error('Error fetching workload thresholds:', err);
    res.status(500).json({ error: 'Failed to fetch workload thresholds' });
  }
});

// PUT /api/settings/coverage-rules - Update coverage rules
router.put('/coverage-rules', [
  body('min_interns_low').isInt({ min: 0 }).withMessage('Min interns for low workload must be non-negative'),
  body('min_interns_medium').isInt({ min: 0 }).withMessage('Min interns for medium workload must be non-negative'),
  body('min_interns_high').isInt({ min: 0 }).withMessage('Min interns for high workload must be non-negative'),
  body('batch_balance_enabled').isBoolean().withMessage('Batch balance enabled must be boolean'),
  body('batch_balance_threshold').optional().isFloat({ min: 0, max: 100 }).withMessage('Batch balance threshold must be 0-100'),
  body('critical_coverage_days').isInt({ min: 0 }).withMessage('Critical coverage days must be non-negative')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    await setJSONSetting('coverage_rules', req.body, 'Coverage rules for unit assignments');
    res.json({ message: 'Coverage rules updated successfully' });
  } catch (err) {
    console.error('Error updating coverage rules:', err);
    res.status(500).json({ error: 'Failed to update coverage rules' });
  }
});

// GET /api/settings/coverage-rules - Get coverage rules
router.get('/coverage-rules', async (req, res) => {
  try {
    const rules = await getJSONSetting('coverage_rules', {
      min_interns_low: 1,
      min_interns_medium: 2,
      min_interns_high: 2,
      batch_balance_enabled: true,
      batch_balance_threshold: 30,
      critical_coverage_days: 0
    });
    res.json(rules);
  } catch (err) {
    console.error('Error fetching coverage rules:', err);
    res.status(500).json({ error: 'Failed to fetch coverage rules' });
  }
});

// PUT /api/settings/auto-generation - Update auto-generation rules
router.put('/auto-generation', [
  body('auto_generate_on_create').isBoolean().withMessage('Auto generate on create must be boolean'),
  body('auto_extend_on_extension').isBoolean().withMessage('Auto extend on extension must be boolean'),
  body('allow_overlap').isBoolean().withMessage('Allow overlap must be boolean'),
  body('conflict_resolution_mode').isIn(['strict', 'lenient']).withMessage('Conflict resolution mode must be strict or lenient'),
  body('auto_resolve_conflicts').isBoolean().withMessage('Auto resolve conflicts must be boolean'),
  body('notify_on_conflicts').isBoolean().withMessage('Notify on conflicts must be boolean')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    await setJSONSetting('auto_generation', req.body, 'Auto-generation rules');
    res.json({ message: 'Auto-generation rules updated successfully' });
  } catch (err) {
    console.error('Error updating auto-generation rules:', err);
    res.status(500).json({ error: 'Failed to update auto-generation rules' });
  }
});

// GET /api/settings/auto-generation - Get auto-generation rules
router.get('/auto-generation', async (req, res) => {
  try {
    const rules = await getJSONSetting('auto_generation', {
      auto_generate_on_create: false,
      auto_extend_on_extension: true,
      allow_overlap: false,
      conflict_resolution_mode: 'strict',
      auto_resolve_conflicts: false,
      notify_on_conflicts: true
    });
    res.json(rules);
  } catch (err) {
    console.error('Error fetching auto-generation rules:', err);
    res.status(500).json({ error: 'Failed to fetch auto-generation rules' });
  }
});

// PUT /api/settings/notifications - Update notification settings
router.put('/notifications', [
  body('enabled').isBoolean().withMessage('Enabled must be boolean'),
  body('email_enabled').isBoolean().withMessage('Email enabled must be boolean'),
  body('sms_enabled').optional().isBoolean().withMessage('SMS enabled must be boolean'),
  body('in_app_enabled').isBoolean().withMessage('In-app enabled must be boolean'),
  body('reminder_days_start').isInt({ min: 0 }).withMessage('Reminder days start must be non-negative'),
  body('reminder_days_end').isInt({ min: 0 }).withMessage('Reminder days end must be non-negative'),
  body('weekly_summary_enabled').isBoolean().withMessage('Weekly summary enabled must be boolean'),
  body('weekly_summary_day').optional().isIn(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']).withMessage('Invalid day for weekly summary'),
  body('email_recipients').optional().isString().withMessage('Email recipients must be string')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    await setJSONSetting('notifications', req.body, 'Notification settings');
    res.json({ message: 'Notification settings updated successfully' });
  } catch (err) {
    console.error('Error updating notification settings:', err);
    res.status(500).json({ error: 'Failed to update notification settings' });
  }
});

// GET /api/settings/notifications - Get notification settings
router.get('/notifications', async (req, res) => {
  try {
    const settings = await getJSONSetting('notifications', {
      enabled: true,
      email_enabled: true,
      sms_enabled: false,
      in_app_enabled: true,
      reminder_days_start: 3,
      reminder_days_end: 1,
      weekly_summary_enabled: true,
      weekly_summary_day: 'Monday',
      email_recipients: ''
    });
    res.json(settings);
  } catch (err) {
    console.error('Error fetching notification settings:', err);
    res.status(500).json({ error: 'Failed to fetch notification settings' });
  }
});

// GET /api/settings/notification-templates - Get notification templates
router.get('/notification-templates', async (req, res) => {
  try {
    const templates = await getJSONSetting('notification_templates', {
      rotation_start: 'Dear {intern_name}, your rotation at {unit_name} starts on {start_date}.',
      rotation_end: 'Dear {intern_name}, your rotation at {unit_name} ends on {end_date}.',
      coverage_alert: 'Alert: {unit_name} has insufficient coverage. Current interns: {current_count}, Required: {required_count}.'
    });
    res.json(templates);
  } catch (err) {
    console.error('Error fetching notification templates:', err);
    res.status(500).json({ error: 'Failed to fetch notification templates' });
  }
});

// PUT /api/settings/notification-templates - Update notification templates
router.put('/notification-templates', [
  body('rotation_start').isString().withMessage('Rotation start template must be string'),
  body('rotation_end').isString().withMessage('Rotation end template must be string'),
  body('coverage_alert').isString().withMessage('Coverage alert template must be string')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    await setJSONSetting('notification_templates', req.body, 'Notification email templates');
    res.json({ message: 'Notification templates updated successfully' });
  } catch (err) {
    console.error('Error updating notification templates:', err);
    res.status(500).json({ error: 'Failed to update notification templates' });
  }
});

// GET /api/settings/export-format - Get export format settings
router.get('/export-format', async (req, res) => {
  try {
    const settings = await getJSONSetting('export_format', {
      default_format: 'Excel',
      include_images_pdf: false,
      date_format: 'YYYY-MM-DD',
      include_system_info: true
    });
    res.json(settings);
  } catch (err) {
    console.error('Error fetching export format settings:', err);
    res.status(500).json({ error: 'Failed to fetch export format settings' });
  }
});

// PUT /api/settings/export-format - Update export format settings
router.put('/export-format', [
  body('default_format').isIn(['Excel', 'PDF', 'CSV']).withMessage('Default format must be Excel, PDF, or CSV'),
  body('include_images_pdf').isBoolean().withMessage('Include images PDF must be boolean'),
  body('date_format').isIn(['YYYY-MM-DD', 'MM/DD/YYYY', 'DD/MM/YYYY']).withMessage('Invalid date format'),
  body('include_system_info').isBoolean().withMessage('Include system info must be boolean')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    await setJSONSetting('export_format', req.body, 'Export format preferences');
    res.json({ message: 'Export format settings updated successfully' });
  } catch (err) {
    console.error('Error updating export format settings:', err);
    res.status(500).json({ error: 'Failed to update export format settings' });
  }
});

// POST /api/settings/backup - Create backup
router.post('/backup', async (req, res) => {
  try {
    const { type = 'critical' } = req.body; // 'critical' (interns, rotations, settings) or 'settings'
    
    let backupData = {};
    
    if (type === 'critical') {
      // Backup critical tables only: interns, rotations, settings
      const tables = ['interns', 'rotations', 'settings'];
      
      for (const table of tables) {
        await new Promise((resolve, reject) => {
          db.all(`SELECT * FROM ${table}`, [], (err, rows) => {
            if (err) return reject(err);
            backupData[table] = rows;
            resolve();
          });
        });
      }
    } else if (type === 'settings') {
      // Backup only settings
      await new Promise((resolve, reject) => {
        db.all('SELECT * FROM settings', [], (err, rows) => {
          if (err) return reject(err);
          backupData.settings = rows;
          resolve();
        });
      });
    }
    
    backupData.metadata = {
      type,
      created_at: new Date().toISOString(),
      version: '1.0.0'
    };
    
    // Store last backup timestamp
    await setJSONSetting('last_backup', { timestamp: new Date().toISOString(), type }, 'Last backup timestamp');
    
    res.json({
      message: 'Backup created successfully',
      backup: backupData,
      download_url: `/api/settings/backup/download?type=${type}`
    });
  } catch (err) {
    console.error('Error creating backup:', err);
    res.status(500).json({ error: 'Failed to create backup' });
  }
});

// Cloud backup endpoints
const cloudBackup = require('../services/cloudBackup');
const autoRestore = require('../services/autoRestore');
const scheduler = require('../services/scheduler');
const path = require('path');
const fs = require('fs');

// GET /api/settings/backup/cloud-config - Get cloud storage configuration
router.get('/backup/cloud-config', async (req, res) => {
  try {
    const provider = process.env.CLOUD_BACKUP_PROVIDER || 'googledrive';
    const enabled = process.env.CLOUD_BACKUP_ENABLED === 'true';
    
    res.json({
      enabled,
      provider,
      configured: provider === 'onedrive' 
        ? !!(process.env.ONEDRIVE_CLIENT_ID && process.env.ONEDRIVE_CLIENT_SECRET)
        : !!(process.env.GOOGLE_DRIVE_CLIENT_ID && process.env.GOOGLE_DRIVE_CLIENT_SECRET),
    });
  } catch (error) {
    console.error('Error getting cloud config:', error);
    res.status(500).json({ error: 'Failed to get cloud configuration' });
  }
});

// PUT /api/settings/backup/cloud-config - Update cloud storage configuration
router.put('/backup/cloud-config', [
  body('provider').optional().isIn(['onedrive', 'googledrive']).withMessage('Provider must be onedrive or googledrive'),
  body('enabled').optional().isBoolean().withMessage('Enabled must be boolean'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    // Note: In production, you'd update .env file or use a proper config management system
    // For now, we'll just store in settings table
    const { provider, enabled } = req.body;
    
    if (provider) {
      await setJSONSetting('cloud_backup_provider', provider, 'Cloud backup provider');
    }
    if (enabled !== undefined) {
      await setJSONSetting('cloud_backup_enabled', enabled, 'Cloud backup enabled status');
    }
    
    res.json({ message: 'Cloud configuration updated successfully' });
  } catch (error) {
    console.error('Error updating cloud config:', error);
    res.status(500).json({ error: 'Failed to update cloud configuration' });
  }
});

// POST /api/settings/backup/cloud - Create and upload backup to cloud
router.post('/backup/cloud', async (req, res) => {
  try {
    const { type = 'critical' } = req.body;
    const provider = process.env.CLOUD_BACKUP_PROVIDER || 'googledrive';
    
    if (process.env.CLOUD_BACKUP_ENABLED !== 'true') {
      return res.status(400).json({ error: 'Cloud backup is not enabled' });
    }
    
    // Create local backup first
    const { filePath, fileName, backupData } = await scheduler.createLocalBackup();
    
    // Upload to cloud
    const uploadResult = await cloudBackup.uploadToCloud(provider, filePath, fileName);
    
    res.json({
      message: 'Backup uploaded to cloud successfully',
      fileName: uploadResult.fileName,
      provider,
    });
  } catch (error) {
    console.error('Error uploading to cloud:', error);
    res.status(500).json({ error: `Failed to upload backup: ${error.message}` });
  }
});

// GET /api/settings/backup/cloud/list - List cloud backups
router.get('/backup/cloud/list', async (req, res) => {
  try {
    const provider = process.env.CLOUD_BACKUP_PROVIDER || 'googledrive';
    
    if (process.env.CLOUD_BACKUP_ENABLED !== 'true') {
      return res.status(400).json({ error: 'Cloud backup is not enabled' });
    }
    
    const backups = await cloudBackup.listCloudBackups(provider);
    
    res.json({
      provider,
      backups,
      count: backups.length,
    });
  } catch (error) {
    console.error('Error listing cloud backups:', error);
    res.status(500).json({ error: `Failed to list backups: ${error.message}` });
  }
});

// POST /api/settings/auto-restore - Trigger auto-restore check
router.post('/auto-restore', async (req, res) => {
  try {
    const result = await autoRestore.performAutoRestore();
    
    res.json(result);
  } catch (error) {
    console.error('Error performing auto-restore:', error);
    res.status(500).json({ error: `Failed to perform auto-restore: ${error.message}` });
  }
});

// GET /api/settings/backup/download - Download backup
router.get('/backup/download', (req, res) => {
  const { type = 'full' } = req.query;
  
  // This would generate and send the backup file
  // For now, return a placeholder response
  res.json({ message: 'Backup download endpoint - implement file download logic' });
});

// POST /api/settings/restore - Restore from backup
router.post('/restore', [
  body('backup').isObject().withMessage('Backup data is required'),
  body('confirm').equals('true').withMessage('Restoration must be confirmed')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { backup, tables = [] } = req.body;
  
  try {
    // Restore specified tables or all tables
    const tablesToRestore = tables.length > 0 ? tables : Object.keys(backup).filter(k => k !== 'metadata');
    
    for (const table of tablesToRestore) {
      if (!backup[table] || !Array.isArray(backup[table])) continue;
      
      // Clear existing data
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM ${table}`, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
      
      // Insert backed up data
      if (backup[table].length > 0) {
        const columns = Object.keys(backup[table][0]);
        const placeholders = columns.map(() => '?').join(', ');
        
        const insertQuery = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
        
        for (const row of backup[table]) {
          await new Promise((resolve, reject) => {
            db.run(insertQuery, columns.map(col => row[col]), (err) => {
              if (err) return reject(err);
              resolve();
            });
          });
        }
      }
    }
    
    res.json({ message: 'Backup restored successfully' });
  } catch (err) {
    console.error('Error restoring backup:', err);
    res.status(500).json({ error: 'Failed to restore backup' });
  }
});

// Generic routes for individual settings (must be LAST to avoid conflicting with specific routes above)
// GET /api/settings/:key - Get specific setting
router.get('/:key', (req, res) => {
  const { key } = req.params;
  
  // Skip if it's a specific route key
  const specificRoutes = ['batch-schedule', 'system-info', 'workload-thresholds', 'coverage-rules', 
    'auto-generation', 'notifications', 'notification-templates', 'export-format', 'backup', 'restore'];
  if (specificRoutes.includes(key)) {
    return res.status(404).json({ error: 'Setting not found' });
  }
  
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
  const { key } = req.params;
  
  // Skip if it's a specific route key - these should use their dedicated endpoints
  const specificRoutes = ['batch-schedule', 'system-info', 'workload-thresholds', 'coverage-rules', 
    'auto-generation', 'notifications', 'notification-templates', 'export-format', 'backup', 'restore'];
  if (specificRoutes.includes(key)) {
    return res.status(400).json({ 
      error: `Use the dedicated endpoint for ${key} settings instead of generic /:key endpoint` 
    });
  }
  
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
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

module.exports = { router, getBatchOffDay, isBatchOffOnDate };
