const path = require('path');
const fs = require('fs');
const { getDatabase } = require('../database/init');

// Conditional import for cron
let cron;
try {
  cron = require('node-cron');
} catch (error) {
  console.warn('node-cron not installed. Scheduled backups will be disabled. Install with: npm install node-cron');
}

const cloudBackup = require('./cloudBackup');
const db = getDatabase();

// Create local backup
async function createLocalBackup() {
  return new Promise((resolve, reject) => {
    const backupData = {};
    const tables = ['interns', 'rotations', 'settings'];
    
    let completed = 0;
    let hasError = false;
    
    tables.forEach((table) => {
      db.all(`SELECT * FROM ${table}`, [], (err, rows) => {
        if (err && !hasError) {
          hasError = true;
          return reject(err);
        }
        
        if (!hasError) {
          backupData[table] = rows;
        }
        
        completed++;
        if (completed === tables.length && !hasError) {
          backupData.metadata = {
            type: 'critical',
            created_at: new Date().toISOString(),
            version: '1.0.0',
          };
          
          // Create backup directory if it doesn't exist
          const backupDir = path.join(__dirname, '../../backups');
          if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
          }
          
          // Save to file
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + 
            '-' + new Date().toTimeString().split(' ')[0].replace(/:/g, '');
          const fileName = `spin-backup-${timestamp}.json`;
          const filePath = path.join(backupDir, fileName);
          
          fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2));
          
          resolve({ filePath, fileName, backupData });
        }
      });
    });
  });
}

// Perform scheduled backup
async function performScheduledBackup() {
  try {
    console.log('[Scheduler] Starting scheduled backup...');
    
    // Check if cloud backup is enabled
    const cloudEnabled = process.env.CLOUD_BACKUP_ENABLED === 'true';
    const cloudProvider = process.env.CLOUD_BACKUP_PROVIDER || 'googledrive';
    const retentionCount = parseInt(process.env.BACKUP_RETENTION_COUNT || '10');
    
    // Create local backup
    const { filePath, fileName, backupData } = await createLocalBackup();
    
    console.log(`[Scheduler] Local backup created: ${fileName}`);
    
    // Upload to cloud if enabled
    if (cloudEnabled) {
      try {
        await cloudBackup.uploadToCloud(cloudProvider, filePath, fileName);
        console.log(`[Scheduler] Backup uploaded to ${cloudProvider}: ${fileName}`);
        
        // Clean up old backups
        await cloudBackup.deleteOldBackups(cloudProvider, retentionCount);
        console.log(`[Scheduler] Old backups cleaned up (keeping ${retentionCount})`);
      } catch (cloudError) {
        console.error('[Scheduler] Cloud upload failed:', cloudError);
        // Continue - local backup was successful
      }
    }
    
    // Log backup operation
    db.run(
      `INSERT INTO settings (key, value, description, updated_at) 
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
      ['last_scheduled_backup', new Date().toISOString(), 'Timestamp of last scheduled backup'],
      (err) => {
        if (err) console.error('[Scheduler] Error logging backup:', err);
      }
    );
    
    // Clean up old local backups (keep last 5)
    try {
      const backupDir = path.join(__dirname, '../../backups');
      if (fs.existsSync(backupDir)) {
        const files = fs.readdirSync(backupDir)
          .filter(f => f.startsWith('spin-backup-') && f.endsWith('.json'))
          .map(f => ({
            name: f,
            path: path.join(backupDir, f),
            time: fs.statSync(path.join(backupDir, f)).mtime.getTime(),
          }))
          .sort((a, b) => b.time - a.time);
        
        // Delete old local backups (keep last 5)
        const toDelete = files.slice(5);
        toDelete.forEach(file => {
          try {
            fs.unlinkSync(file.path);
            console.log(`[Scheduler] Deleted old local backup: ${file.name}`);
          } catch (err) {
            console.error(`[Scheduler] Error deleting ${file.name}:`, err);
          }
        });
      }
    } catch (cleanupError) {
      console.error('[Scheduler] Error cleaning up local backups:', cleanupError);
    }
    
    return { success: true, fileName };
  } catch (error) {
    console.error('[Scheduler] Scheduled backup failed:', error);
    return { success: false, error: error.message };
  }
}

// Initialize scheduler
function initializeScheduler() {
  if (!cron) {
    console.warn('[Scheduler] node-cron not installed. Scheduled backups disabled.');
    return null;
  }

  const schedule = process.env.BACKUP_SCHEDULE || 'daily';
  
  let cronExpression;
  const backupTime = process.env.BACKUP_TIME || '02:00'; // Default 2 AM
  const [hours, minutes] = backupTime.split(':');
  
  if (schedule === 'daily') {
    // Run daily at specified time
    cronExpression = `${minutes} ${hours} * * *`;
  } else if (schedule === 'weekly') {
    // Run weekly on Sunday at specified time
    cronExpression = `${minutes} ${hours} * * 0`;
  } else {
    console.log('[Scheduler] Invalid backup schedule, defaulting to daily at 2 AM');
    cronExpression = '0 2 * * *';
  }
  
  // Schedule the backup job
  const task = cron.schedule(cronExpression, async () => {
    await performScheduledBackup();
  }, {
    scheduled: true,
    timezone: process.env.TZ || 'UTC',
  });
  
  console.log(`[Scheduler] Initialized with schedule: ${schedule} at ${backupTime}`);
  
  return task;
}

module.exports = {
  initializeScheduler,
  performScheduledBackup,
  createLocalBackup,
};

