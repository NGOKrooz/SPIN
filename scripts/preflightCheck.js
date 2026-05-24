#!/usr/bin/env node

/**
 * SPIN 1.0 - Pre-Migration Safety Checklist
 * 
 * Runs automated checks to ensure:
 * - All prerequisites are met
 * - Database is accessible
 * - Backup recommendations
 * - System is ready for migration
 */

const fs = require('fs');
const path = require('path');

const serverModules = path.join(__dirname, '..', 'server', 'node_modules');
require(path.join(serverModules, 'dotenv')).config({ path: './server/.env' });

const checks = {
  passed: 0,
  failed: 0,
  warnings: 0
};

function checkPassed(message) {
  console.log(`  ✅ ${message}`);
  checks.passed++;
}

function checkFailed(message) {
  console.log(`  ✗ ${message}`);
  checks.failed++;
}

function checkWarning(message) {
  console.log(`  ⚠️  ${message}`);
  checks.warnings++;
}

async function runPreflight() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  SPIN 1.0 - PRE-MIGRATION SAFETY CHECKLIST                     ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  try {
    // CHECK 1: Files exist
    console.log('📋 CHECK 1: Required Files');
    const requiredFiles = [
      'scripts/migrateRotationSchema.js',
      'scripts/validateMigration.js',
      'scripts/rollbackMigration.js',
      'server/.env'
    ];
    
    for (const file of requiredFiles) {
      if (fs.existsSync(file)) {
        checkPassed(`${file}`);
      } else {
        checkFailed(`${file} not found`);
      }
    }
    
    // CHECK 2: Environment variables
    console.log('\n🔧 CHECK 2: Environment Configuration');
    
    if (process.env.MONGO_URI) {
      if (process.env.MONGO_URI.includes('mongodb+srv')) {
        checkPassed(`MONGO_URI is set (MongoDB Atlas)`);
      } else if (process.env.MONGO_URI.includes('mongodb://')) {
        checkPassed(`MONGO_URI is set (MongoDB Local)`);
      } else {
        checkWarning(`MONGO_URI format unclear: ${process.env.MONGO_URI.substring(0, 30)}...`);
      }
    } else {
      checkFailed(`MONGO_URI environment variable not set`);
    }
    
    if (process.env.NODE_ENV) {
      if (process.env.NODE_ENV === 'development') {
        checkWarning(`NODE_ENV is 'development' - ensure this is not production!`);
      } else {
        checkPassed(`NODE_ENV is '${process.env.NODE_ENV}'`);
      }
    } else {
      checkWarning(`NODE_ENV not set (defaults to development)`);
    }
    
    // CHECK 3: MongoDB connectivity
    console.log('\n🔌 CHECK 3: MongoDB Connectivity');
    
    const mongoose = require(path.join(serverModules, 'mongoose'));
    try {
      if (process.env.MONGO_URI) {
        // Quick connection test (5 second timeout)
        await Promise.race([
          mongoose.connect(process.env.MONGO_URI, {
            retryWrites: true,
            w: 'majority',
            serverSelectionTimeoutMS: 5000
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Connection timeout')), 5000)
          )
        ]);
        
        // Get database stats
        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();
        const internCount = await db.collection('interns').countDocuments();
        const rotationCount = await db.collection('rotations').countDocuments();
        
        checkPassed(`MongoDB connected`);
        checkPassed(`Database: ${mongoose.connection.name}`);
        checkPassed(`Collections: ${collections.length}`);
        checkPassed(`Interns: ${internCount}`);
        checkPassed(`Rotations: ${rotationCount}`);
        
        await mongoose.disconnect();
      }
    } catch (error) {
      checkFailed(`MongoDB connection failed: ${error.message}`);
    }
    
    // CHECK 4: Backup recommendations
    console.log('\n💾 CHECK 4: Backup Recommendations');
    
    if (process.env.MONGO_URI && process.env.MONGO_URI.includes('mongodb+srv')) {
      console.log(`  ℹ️  Before migration, backup MongoDB Atlas cluster:`);
      console.log(`      1. Go to MongoDB Atlas console`);
      console.log(`      2. Click "Backup" on your cluster`);
      console.log(`      3. Create manual backup`);
      console.log(`      4. Wait for backup to complete before proceeding`);
    }
    
    if (!fs.existsSync('./backup')) {
      checkWarning(`No backup directory found - create: mkdir backup`);
    } else {
      checkPassed(`Backup directory exists`);
    }
    
    // CHECK 5: Migration scripts analysis
    console.log('\n📊 CHECK 5: Migration Scripts');
    
    const migrationScript = 'scripts/migrateRotationSchema.js';
    if (fs.existsSync(migrationScript)) {
      const content = fs.readFileSync(migrationScript, 'utf8');
      
      if (content.includes('SAFE')) checkPassed(`Safe migration markers present`);
      if (content.includes('NON-DESTRUCTIVE')) checkPassed(`Non-destructive guarantees documented`);
      if (content.includes('auditData')) checkPassed(`Pre-flight audit included`);
      if (content.includes('normalizeStatus')) checkPassed(`Status normalization logic present`);
      if (content.includes('validateMigration')) checkPassed(`Validation checks included`);
      if (content.includes('generateReport')) checkPassed(`Report generation included`);
    }
    
    // FINAL SUMMARY
    console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
    console.log(`║  PRE-FLIGHT CHECKLIST SUMMARY                                  ║`);
    console.log(`╠════════════════════════════════════════════════════════════════╣`);
    console.log(`║  ✅ Passed:   ${String(checks.passed).padEnd(53)} ║`);
    console.log(`║  ⚠️  Warnings: ${String(checks.warnings).padEnd(53)} ║`);
    console.log(`║  ✗ Failed:   ${String(checks.failed).padEnd(53)} ║`);
    console.log(`╚════════════════════════════════════════════════════════════════╝\n`);
    
    if (checks.failed > 0) {
      console.log('❌ PREFLIGHT FAILED\n');
      console.log('Fix the issues above before running migration.\n');
      process.exit(1);
    }
    
    if (checks.warnings > 0) {
      console.log('⚠️  PREFLIGHT PASSED WITH WARNINGS\n');
      console.log('Review warnings above. When ready:\n');
    } else {
      console.log('✅ PREFLIGHT PASSED\n');
      console.log('System is ready for migration.\n');
    }
    
    console.log('Next steps:');
    console.log('  1. Backup your MongoDB database');
    console.log('  2. Run: node scripts/migrateRotationSchema.js');
    console.log('  3. Run: node scripts/validateMigration.js');
    console.log('  4. Review: MIGRATION_REPORT.md\n');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Preflight check failed:', error.message);
    process.exit(1);
  }
}

runPreflight();
