const { getDatabase } = require('../database/init');
const cloudBackup = require('./cloudBackup');
const db = getDatabase();

// Check if this is a fresh deployment (empty or minimal database)
async function checkIfFreshDeployment() {
  return new Promise((resolve, reject) => {
    // Check if interns table has minimal data (less than 5 interns = likely fresh)
    db.get('SELECT COUNT(*) as count FROM interns', [], (err, row) => {
      if (err) return reject(err);
      
      const internCount = row.count || 0;
      
      // Also check settings table
      db.get('SELECT COUNT(*) as count FROM settings', [], (err, settingsRow) => {
        if (err) return reject(err);
        
        const settingsCount = settingsRow.count || 0;
        
        // Fresh if less than 5 interns AND less than 10 settings (default settings are 7)
        const isFresh = internCount < 5 && settingsCount < 10;
        
        resolve({
          isFresh,
          internCount,
          settingsCount,
          shouldRestore: isFresh,
        });
      });
    });
  });
}

// Find latest backup from cloud storage
async function findLatestBackup(cloudType) {
  try {
    const backups = await cloudBackup.listCloudBackups(cloudType);
    
    if (!backups || backups.length === 0) {
      return null;
    }
    
    // Return the most recent backup (already sorted by date desc)
    return backups[0];
  } catch (error) {
    console.error('Error finding latest backup:', error);
    throw error;
  }
}

// Restore data from backup
async function autoRestore(backupData) {
  return new Promise(async (resolve, reject) => {
    try {
      // Restore critical tables only: interns, rotations, settings
      const tablesToRestore = ['interns', 'rotations', 'settings'];
      
      for (const table of tablesToRestore) {
        if (!backupData[table] || !Array.isArray(backupData[table])) {
          console.log(`Skipping ${table} - no data in backup`);
          continue;
        }
        
        // Clear existing data
        await new Promise((resolve, reject) => {
          db.run(`DELETE FROM ${table}`, (err) => {
            if (err) return reject(err);
            resolve();
          });
        });
        
        // Insert backed up data
        if (backupData[table].length > 0) {
          const columns = Object.keys(backupData[table][0]);
          const placeholders = columns.map(() => '?').join(', ');
          const insertQuery = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
          
          for (const row of backupData[table]) {
            await new Promise((resolve, reject) => {
              db.run(insertQuery, columns.map(col => row[col]), (err) => {
                if (err) return reject(err);
                resolve();
              });
            });
          }
        }
        
        console.log(`Restored ${backupData[table].length} records to ${table}`);
      }
      
      // Log restore operation
      db.run(
        `INSERT INTO settings (key, value, description, updated_at) 
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
        ['last_auto_restore', new Date().toISOString(), 'Timestamp of last automatic restore'],
        (err) => {
          if (err) console.error('Error logging restore:', err);
        }
      );
      
      resolve({
        success: true,
        message: 'Auto-restore completed successfully',
        tablesRestored: tablesToRestore.filter(t => backupData[t] && backupData[t].length > 0),
      });
    } catch (error) {
      console.error('Error during auto-restore:', error);
      reject(error);
    }
  });
}

// Main auto-restore function
async function performAutoRestore() {
  try {
    // Check if this is a fresh deployment
    const deploymentCheck = await checkIfFreshDeployment();
    
    if (!deploymentCheck.shouldRestore) {
      return {
        performed: false,
        reason: 'Database is not fresh - has existing data',
        internCount: deploymentCheck.internCount,
        settingsCount: deploymentCheck.settingsCount,
      };
    }
    
    // Get cloud provider from settings
    const cloudProvider = process.env.CLOUD_BACKUP_PROVIDER || 'googledrive';
    
    if (!process.env.CLOUD_BACKUP_ENABLED || process.env.CLOUD_BACKUP_ENABLED !== 'true') {
      return {
        performed: false,
        reason: 'Cloud backup is not enabled',
      };
    }
    
    // Find latest backup
    const latestBackup = await findLatestBackup(cloudProvider);
    
    if (!latestBackup) {
      return {
        performed: false,
        reason: 'No backup found in cloud storage',
      };
    }
    
    // Download backup
    console.log(`Downloading backup: ${latestBackup.name}`);
    const backupContent = await cloudBackup.downloadFromCloud(cloudProvider, latestBackup.id);
    
    // Parse backup data
    let backupData;
    if (typeof backupContent === 'string') {
      backupData = JSON.parse(backupContent);
    } else if (backupContent instanceof Buffer) {
      backupData = JSON.parse(backupContent.toString());
    } else {
      // Stream handling for Google Drive
      const chunks = [];
      for await (const chunk of backupContent) {
        chunks.push(chunk);
      }
      backupData = JSON.parse(Buffer.concat(chunks).toString());
    }
    
    // Validate backup data
    if (!backupData.metadata) {
      throw new Error('Invalid backup file format - missing metadata');
    }
    
    // Perform restore
    const restoreResult = await autoRestore(backupData);
    
    return {
      performed: true,
      backupFile: latestBackup.name,
      backupDate: latestBackup.modified,
      ...restoreResult,
    };
  } catch (error) {
    console.error('Auto-restore error:', error);
    return {
      performed: false,
      error: error.message,
    };
  }
}

module.exports = {
  checkIfFreshDeployment,
  findLatestBackup,
  autoRestore,
  performAutoRestore,
};

