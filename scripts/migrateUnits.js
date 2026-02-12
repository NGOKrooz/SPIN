const db = require('../server/database/dbWrapper');
const fs = require('fs');
const path = require('path');

// Updated canonical unit list with sort_order
const NEW_UNITS = [
  { id: 1, oldName: null, newName: 'Exercise Immunology', duration_days: 2, sort_order: 1 },
  { id: 2, oldName: null, newName: 'Intensive Care Unit', duration_days: 2, sort_order: 2 },
  { id: 3, oldName: null, newName: 'Pelvic and Women\'s Health', duration_days: 2, sort_order: 3 },
  { id: 4, oldName: 'Neurosurgery', newName: 'Neurosurgery', duration_days: 2, sort_order: 4 },
  { id: 5, oldName: 'Adult Neurology', newName: 'Adult Neurology', duration_days: 2, sort_order: 5 },
  { id: 6, oldName: null, newName: 'Medicine and Acute Care', duration_days: 2, sort_order: 6 },
  { id: 7, oldName: 'Geriatrics', newName: 'Geriatric and Mental Health', duration_days: 2, sort_order: 7 },
  { id: 8, oldName: 'Electrophysiology', newName: 'Electrophysiology', duration_days: 2, sort_order: 8 },
  { id: 9, oldName: 'Orthopedic Outpatients', newName: 'Orthopedic Out-Patient', duration_days: 2, sort_order: 9 },
  { id: 10, oldName: 'Orthopedic Inpatients', newName: 'Orthopedic In-Patient', duration_days: 2, sort_order: 10 },
  { id: 11, oldName: 'Pediatrics Inpatients', newName: 'Pediatric-In', duration_days: 2, sort_order: 11 },
  { id: 12, oldName: 'Pediatrics Outpatients', newName: 'Pediatric-Out (NDT)', duration_days: 2, sort_order: 12 }
];

// Units to remove (no longer in the new list)
const UNITS_TO_REMOVE = ['Acute Stroke', 'Cardio Thoracic Unit', 'Women\'s Health'];

async function migrateUnits() {
  console.log('Starting Units migration...\n');
  
  try {
    // Backup the database first
    const dbPath = process.env.DB_PATH || './server/database/spin.db';
    const backupPath = dbPath + '.migration-backup-' + Date.now();
    
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, backupPath);
      console.log(`✅ Database backed up to: ${backupPath}\n`);
    }
    
    // Step 1: Rename existing units that changed names
    console.log('Step 1: Updating unit names...');
    for (const unit of NEW_UNITS) {
      if (unit.oldName && unit.newName && unit.oldName !== unit.newName) {
        await new Promise((resolve, reject) => {
          db.run(
            `UPDATE units SET name = ?, sort_order = ? WHERE name = ?`,
            [unit.newName, unit.sort_order, unit.oldName],
            (err) => {
              if (err) {
                console.warn(`  ⚠️  Could not update ${unit.oldName}: ${err.message}`);
              } else {
                console.log(`  ✅ Renamed "${unit.oldName}" → "${unit.newName}" (sort_order: ${unit.sort_order})`);
              }
              resolve();
            }
          );
        });
      }
    }
    
    // Step 2: Insert new units that don't exist yet
    console.log('\nStep 2: Adding new units...');
    for (const unit of NEW_UNITS) {
      if (!unit.oldName) {
        await new Promise((resolve, reject) => {
          db.run(
            `INSERT OR IGNORE INTO units (name, duration_days, workload, sort_order) VALUES (?, ?, ?, ?)`,
            [unit.newName, unit.duration_days, 'Low', unit.sort_order],
            (err) => {
              if (err) {
                console.warn(`  ⚠️  Could not add ${unit.newName}: ${err.message}`);
              } else {
                console.log(`  ✅ Added "${unit.newName}" (sort_order: ${unit.sort_order})`);
              }
              resolve();
            }
          );
        });
      }
    }
    
    // Step 3: Delete old units that are no longer needed
    console.log('\nStep 3: Removing obsolete units...');
    for (const unitName of UNITS_TO_REMOVE) {
      await new Promise((resolve, reject) => {
        db.run(
          `DELETE FROM units WHERE name = ?`,
          [unitName],
          (err) => {
            if (err) {
              console.warn(`  ⚠️  Could not delete ${unitName}: ${err.message}`);
            } else {
              console.log(`  ✅ Removed "${unitName}"`);
            }
            resolve();
          }
        );
      });
    }
    
    // Step 4: Verify migration
    console.log('\nStep 4: Verifying migration...');
    await new Promise((resolve, reject) => {
      db.all(
        `SELECT id, name, sort_order FROM units ORDER BY sort_order, name`,
        [],
        (err, rows) => {
          if (err) {
            console.error('  ❌ Verification failed:', err.message);
            resolve();
            return;
          }
          
          console.log(`  ✅ Total units: ${rows.length}`);
          console.log('\n  Units in order:');
          rows.forEach((u, idx) => {
            console.log(`    ${idx + 1}. ${u.name} (sort_order: ${u.sort_order || 'null'})`);
          });
          
          if (rows.length === 12) {
            console.log('\n✅ Migration completed successfully!');
          } else {
            console.warn(`\n⚠️  Expected 12 units but found ${rows.length}`);
          }
          resolve();
        }
      );
    });
    
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
  
  process.exit(0);
}

migrateUnits();
