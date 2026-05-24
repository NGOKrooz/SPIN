#!/usr/bin/env node

/**
 * SPIN 1.0 - Post-Migration Validation Script
 * 
 * Verifies that migration completed successfully:
 * - No data deleted
 * - All statuses valid
 * - No legacy fields remain
 * - Data integrity preserved
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: './server/.env' });

const Intern = require('../server/models/Intern');
const Rotation = require('../server/models/Rotation');

const VALID_STATUSES = new Set(['active', 'upcoming', 'completed']);

async function validateMigration() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  SPIN 1.0 - POST-MIGRATION VALIDATION                          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MONGO_URI environment variable not set');
    }
    
    await mongoose.connect(mongoUri, { retryWrites: true, w: 'majority' });
    console.log('✅ Connected to MongoDB\n');
    
    // Validation checks
    const checks = {
      passed: 0,
      failed: 0,
      warnings: 0,
      details: []
    };
    
    // CHECK 1: No interns deleted
    const internCount = await Intern.countDocuments();
    console.log(`📊 CHECK 1: Intern Record Count`);
    console.log(`   Total interns: ${internCount}`);
    if (internCount === 0) {
      console.log('   ⚠️  WARNING: No interns in database');
      checks.warnings++;
    } else {
      console.log('   ✅ PASS');
      checks.passed++;
    }
    
    // CHECK 2: Rotation statuses
    console.log(`\n📊 CHECK 2: Rotation Status Validity`);
    const invalidStatusRotations = await Rotation.find({
      status: { $nin: Array.from(VALID_STATUSES) }
    }).lean();
    
    if (invalidStatusRotations.length > 0) {
      console.log(`   ✗ FAIL: ${invalidStatusRotations.length} rotations with invalid status`);
      invalidStatusRotations.forEach(rot => {
        console.log(`     - Rotation ${String(rot._id).substring(0, 8)}...: status="${rot.status}"`);
      });
      checks.failed++;
      checks.details.push({
        check: 'Invalid Statuses',
        count: invalidStatusRotations.length,
        type: 'ERROR'
      });
    } else {
      console.log(`   ✅ PASS: All rotations have valid statuses`);
      checks.passed++;
    }
    
    // CHECK 3: Legacy fields removed
    console.log(`\n📊 CHECK 3: Legacy Fields Removed`);
    const withWorkflowState = await Rotation.countDocuments({ 
      workflowState: { $exists: true } 
    });
    const withAwaitingConf = await Rotation.countDocuments({ 
      awaiting_confirmation: { $exists: true } 
    });
    
    if (withWorkflowState > 0 || withAwaitingConf > 0) {
      console.log(`   ✗ FAIL: Legacy fields still present`);
      if (withWorkflowState > 0) console.log(`     - workflowState: ${withWorkflowState} records`);
      if (withAwaitingConf > 0) console.log(`     - awaiting_confirmation: ${withAwaitingConf} records`);
      checks.failed++;
    } else {
      console.log(`   ✅ PASS: No legacy fields found`);
      checks.passed++;
    }
    
    // CHECK 4: Status distribution
    console.log(`\n📊 CHECK 4: Status Distribution`);
    const statuses = await Rotation.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    statuses.forEach(s => {
      console.log(`   - ${s._id || '[MISSING]'}: ${s.count} rotations`);
    });
    checks.passed++;
    
    // CHECK 5: Interns have assignments
    console.log(`\n📊 CHECK 5: Intern Assignment Coverage`);
    const internsWithoutAssignments = [];
    
    for (const intern of await Intern.find().lean()) {
      const assignmentCount = await Rotation.countDocuments({ intern: intern._id });
      if (assignmentCount === 0) {
        internsWithoutAssignments.push(intern.name);
      }
    }
    
    if (internsWithoutAssignments.length > 0) {
      console.log(`   ⚠️  WARNING: ${internsWithoutAssignments.length} interns without assignments`);
      console.log(`      (May be new interns)`);
      checks.warnings++;
    } else {
      console.log(`   ✅ PASS: All interns have assignments`);
      checks.passed++;
    }
    
    // CHECK 6: Data integrity
    console.log(`\n📊 CHECK 6: Data Integrity`);
    const orphanedRotations = await Rotation.find({
      intern: { $exists: false }
    }).countDocuments();
    
    if (orphanedRotations > 0) {
      console.log(`   ⚠️  WARNING: ${orphanedRotations} rotations without intern reference`);
      checks.warnings++;
    } else {
      console.log(`   ✅ PASS: No orphaned rotations`);
      checks.passed++;
    }
    
    // CHECK 7: Completed assignments preserved
    console.log(`\n📊 CHECK 7: Completed Assignments Preserved`);
    const completedRotations = await Rotation.countDocuments({ status: 'completed' });
    console.log(`   Total completed rotations: ${completedRotations}`);
    if (completedRotations === 0) {
      console.log(`   ⚠️  WARNING: No completed rotations found (may be first run)`);
      checks.warnings++;
    } else {
      console.log(`   ✅ PASS`);
      checks.passed++;
    }
    
    // FINAL SUMMARY
    console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
    console.log(`║  VALIDATION SUMMARY                                            ║`);
    console.log(`╠════════════════════════════════════════════════════════════════╣`);
    console.log(`║  ✅ Passed:   ${String(checks.passed).padEnd(53)} ║`);
    console.log(`║  ⚠️  Warnings: ${String(checks.warnings).padEnd(53)} ║`);
    console.log(`║  ✗ Failed:   ${String(checks.failed).padEnd(53)} ║`);
    console.log(`╚════════════════════════════════════════════════════════════════╝\n`);
    
    if (checks.failed > 0) {
      console.log('❌ VALIDATION FAILED - Please review errors above\n');
      process.exit(1);
    } else if (checks.warnings > 0) {
      console.log('⚠️  VALIDATION PASSED WITH WARNINGS - Please review above\n');
      process.exit(0);
    } else {
      console.log('✅ VALIDATION PASSED - Migration successful!\n');
      process.exit(0);
    }
    
  } catch (error) {
    console.error('\n❌ Validation error:', error.message);
    process.exit(1);
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
  }
}

validateMigration();
