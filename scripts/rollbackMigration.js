#!/usr/bin/env node

/**
 * SPIN 1.0 - Migration Rollback Script
 * 
 * Safely reverses changes from migration if needed
 * Uses MIGRATION_CHANGES.json to restore original values
 * 
 * SAFETY: Only reverts status changes, does not restore deleted data (none was deleted)
 */

const mongoose = require('mongoose');
const fs = require('fs');
require('dotenv').config({ path: './server/.env' });

const Rotation = require('../server/models/Rotation');

async function rollbackMigration() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  SPIN 1.0 - MIGRATION ROLLBACK                                 ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  try {
    // Load change log
    if (!fs.existsSync('./MIGRATION_CHANGES.json')) {
      throw new Error('MIGRATION_CHANGES.json not found - cannot rollback');
    }
    
    const changeLog = JSON.parse(fs.readFileSync('./MIGRATION_CHANGES.json', 'utf8'));
    const changes = changeLog.changes || [];
    
    console.log(`📋 Loaded ${changes.length} changes to rollback\n`);
    
    // Connect to database
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MONGO_URI environment variable not set');
    }
    
    await mongoose.connect(mongoUri, { retryWrites: true, w: 'majority' });
    console.log('✅ Connected to MongoDB\n');
    
    let rolledBack = 0;
    let errors = 0;
    
    // Rollback each change
    for (const change of changes) {
      if (change.type === 'STATUS_UPDATE') {
        try {
          const rotation = await Rotation.findById(change.rotationId);
          if (!rotation) {
            console.log(`⚠️  Rotation ${change.rotationId} not found - skipping`);
            continue;
          }
          
          // Restore original status
          rotation.status = change.oldValue;
          await rotation.save();
          
          console.log(`  ✓ ${change.internName}: ${change.newValue} → ${change.oldValue}`);
          rolledBack++;
          
        } catch (error) {
          console.log(`  ✗ Error rolling back: ${error.message}`);
          errors++;
        }
      }
    }
    
    // Summary
    console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
    console.log(`║  ROLLBACK COMPLETE                                             ║`);
    console.log(`╠════════════════════════════════════════════════════════════════╣`);
    console.log(`║  ✅ Rolled back:   ${String(rolledBack).padEnd(53)} ║`);
    console.log(`║  ✗ Errors:        ${String(errors).padEnd(53)} ║`);
    console.log(`╚════════════════════════════════════════════════════════════════╝\n`);
    
    process.exit(errors > 0 ? 1 : 0);
    
  } catch (error) {
    console.error('\n❌ Rollback failed:', error.message);
    process.exit(1);
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
  }
}

rollbackMigration();
