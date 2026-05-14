/**
 * Phase 3 Test: Reassign Workflow - Change Next Unit Assignment
 * 
 * Tests the reassignment-based movement system:
 * 1. Create intern with awaiting_confirmation rotation
 * 2. Get list of available units (excluding current)
 * 3. Reassign to a new unit
 * 4. Verify next rotation's unit is updated
 * 5. Verify history logging
 * 6. Verify current rotation is NOT affected
 * 7. Verify status remains awaiting_confirmation (not activated)
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const path = require('path');

// Load environment
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Intern = require('../models/Intern');
const Rotation = require('../models/Rotation');
const Unit = require('../models/Unit');
const ActivityLog = require('../models/ActivityLog');

const { reassignNextUnit } = require('../services/rotationService');

const DAY_IN_MS = 1000 * 60 * 60 * 24;

const normalizeDay = (dateLike) => {
  const value = new Date(dateLike);
  if (Number.isNaN(value.getTime())) return null;
  value.setHours(0, 0, 0, 0);
  return value;
};

const addDays = (d, n) => {
  const v = new Date(d);
  v.setDate(v.getDate() + Number(n || 0));
  return v;
};

// Test configuration
const TEST_INTERN_NAME = 'Phase3TestIntern-Reassign';
const CURRENT_UNIT_DURATION = 20;

async function setupTestData() {
  console.log('\n📋 [PHASE 3] Setting up test data...');
  
  // Create units
  const units = await Unit.create([
    { name: 'Cardiology', order: 1, duration: CURRENT_UNIT_DURATION, capacity: 4 },
    { name: 'Neurology', order: 2, duration: CURRENT_UNIT_DURATION, capacity: 4 },
    { name: 'Pediatrics', order: 3, duration: CURRENT_UNIT_DURATION, capacity: 4 },
    { name: 'Orthopedics', order: 4, duration: CURRENT_UNIT_DURATION, capacity: 4 },
  ]);
  console.log(`✅ Created ${units.length} test units`);
  
  // Clean up
  await Intern.deleteOne({ name: TEST_INTERN_NAME }).exec();
  
  // Create test intern
  const intern = await Intern.create({
    name: TEST_INTERN_NAME,
    gender: 'Male',
    batch: 'A',
    startDate: normalizeDay(addDays(new Date(), -100)),
  });
  console.log(`✅ Created test intern: ${intern.name} (ID: ${intern._id})`);
  
  // Create current active rotation (expired)
  const today = normalizeDay(new Date());
  const activeStart = normalizeDay(addDays(today, -25)); // Started 25 days ago
  const activeEnd = normalizeDay(addDays(activeStart, CURRENT_UNIT_DURATION - 1));
  
  const activeRotation = await Rotation.create({
    intern: intern._id,
    unit: units[0]._id, // Cardiology
    startDate: activeStart,
    endDate: activeEnd,
    duration: CURRENT_UNIT_DURATION,
    status: 'active',
  });
  console.log(`✅ Created active rotation: ${units[0].name} (status: active, expired)`);
  
  // Create next awaiting_confirmation rotation
  const nextStart = normalizeDay(addDays(activeEnd, 1));
  const nextEnd = normalizeDay(addDays(nextStart, CURRENT_UNIT_DURATION - 1));
  
  const nextRotation = await Rotation.create({
    intern: intern._id,
    unit: units[1]._id, // Neurology
    startDate: nextStart,
    endDate: nextEnd,
    duration: CURRENT_UNIT_DURATION,
    status: 'awaiting_confirmation',
  });
  console.log(`✅ Created next rotation: ${units[1].name} (status: awaiting_confirmation)`);
  
  // Update intern's currentUnit reference
  await Intern.findByIdAndUpdate(intern._id, { currentUnit: units[0]._id }).exec();
  
  return { intern, units, activeRotation, nextRotation };
}

async function testReassignment(intern, units, activeRotation, nextRotation) {
  console.log('\n🧪 [PHASE 3] Testing Reassignment...\n');
  
  // Test 1: Verify initial state
  console.log('📍 Test 1: Verify initial state');
  const initialNext = await Rotation.findById(nextRotation._id).populate('unit').exec();
  console.log(`  Current next unit: ${initialNext.unit.name}`);
  console.log(`  Current status: ${initialNext.status}`);
  
  if (initialNext.unit.name !== 'Neurology') {
    throw new Error('❌ Test 1 Failed: Initial next unit is not Neurology');
  }
  if (initialNext.status !== 'awaiting_confirmation') {
    throw new Error('❌ Test 1 Failed: Initial status is not awaiting_confirmation');
  }
  console.log(`✅ Test 1 Passed: Initial state is correct\n`);
  
  // Test 2: Reassign to Pediatrics
  console.log('📍 Test 2: Reassign to Pediatrics');
  console.log(`  Calling reassignNextUnit(${intern._id}, ${units[2]._id})`);
  
  const result = await reassignNextUnit(intern._id, units[2]._id);
  
  console.log(`  Reassignment result:`, {
    internName: result.internName,
    previousUnit: result.previousUnit,
    newUnit: result.newUnit,
  });
  
  if (result.internName !== TEST_INTERN_NAME) {
    throw new Error('❌ Test 2 Failed: Intern name mismatch');
  }
  if (result.previousUnit !== 'Neurology') {
    throw new Error('❌ Test 2 Failed: Previous unit should be Neurology');
  }
  if (result.newUnit !== 'Pediatrics') {
    throw new Error('❌ Test 2 Failed: New unit should be Pediatrics');
  }
  console.log(`✅ Test 2 Passed: Reassignment completed\n`);
  
  // Test 3: Verify rotation was updated
  console.log('📍 Test 3: Verify rotation was updated');
  const updatedNext = await Rotation.findById(nextRotation._id).populate('unit').exec();
  console.log(`  New unit: ${updatedNext.unit.name}`);
  console.log(`  Status: ${updatedNext.status}`);
  
  if (updatedNext.unit._id.toString() !== units[2]._id.toString()) {
    throw new Error('❌ Test 3 Failed: Unit was not updated');
  }
  if (updatedNext.status !== 'awaiting_confirmation') {
    throw new Error('❌ Test 3 Failed: Status should remain awaiting_confirmation');
  }
  console.log(`✅ Test 3 Passed: Rotation updated correctly\n`);
  
  // Test 4: Verify current rotation was NOT affected
  console.log('📍 Test 4: Verify current rotation was NOT affected');
  const currentAfter = await Rotation.findById(activeRotation._id).populate('unit').exec();
  console.log(`  Current unit: ${currentAfter.unit.name}`);
  console.log(`  Status: ${currentAfter.status}`);
  
  if (currentAfter.unit._id.toString() !== units[0]._id.toString()) {
    throw new Error('❌ Test 4 Failed: Current unit should not change');
  }
  if (currentAfter.status !== 'active') {
    throw new Error('❌ Test 4 Failed: Current status should remain active');
  }
  console.log(`✅ Test 4 Passed: Current rotation unaffected\n`);
  
  // Test 5: Verify activity logging
  console.log('📍 Test 5: Verify activity logging');
  const logs = await ActivityLog.find({
    action_type: 'unit_reassigned',
    intern: intern._id,
  }).exec();
  
  console.log(`  Found ${logs.length} activity logs`);
  if (logs.length === 0) {
    throw new Error('❌ Test 5 Failed: No activity logs found');
  }
  
  const latestLog = logs[logs.length - 1];
  console.log(`  Latest log: "${latestLog.description}"`);
  
  if (!latestLog.description.includes('Neurology') || !latestLog.description.includes('Pediatrics')) {
    throw new Error('❌ Test 5 Failed: Activity log missing unit names');
  }
  console.log(`✅ Test 5 Passed: Activity logged correctly\n`);
  
  // Test 6: Verify duplicate reassignment is prevented
  console.log('📍 Test 6: Verify duplicate unit prevention');
  try {
    // Try to reassign to a completed unit
    await reassignNextUnit(intern._id, units[0]._id); // Cardiology (already current)
    throw new Error('❌ Test 6 Failed: Should have prevented reassignment to current unit');
  } catch (err) {
    if (err.message.includes('Cannot reassign to current active unit')) {
      console.log(`  ✅ Correctly prevented reassignment to current unit`);
    } else {
      throw err;
    }
  }
  console.log(`✅ Test 6 Passed: Duplicate prevention works\n`);
  
  // Test 7: Reassign again to verify it's not stuck
  console.log('📍 Test 7: Reassign again to Orthopedics');
  const result2 = await reassignNextUnit(intern._id, units[3]._id);
  
  const finalRotation = await Rotation.findById(nextRotation._id).populate('unit').exec();
  console.log(`  Final unit: ${finalRotation.unit.name}`);
  
  if (finalRotation.unit.name !== 'Orthopedics') {
    throw new Error('❌ Test 7 Failed: Second reassignment failed');
  }
  console.log(`✅ Test 7 Passed: Can reassign multiple times\n`);
  
  console.log('🎉 All tests passed!\n');
}

async function runTests() {
  let mongoServer = null;
  
  try {
    console.log('🚀 Phase 3 - Reassign Workflow Test Suite');
    console.log('═'.repeat(50));
    
    // Start in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri(), {
      dbName: 'test-phase3-reassign',
    });
    console.log('✅ Connected to test database\n');
    
    // Setup
    const testData = await setupTestData();
    
    // Run tests
    await testReassignment(testData.intern, testData.units, testData.activeRotation, testData.nextRotation);
    
    console.log('═'.repeat(50));
    console.log('✅ Phase 3 Test Suite: ALL TESTS PASSED\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Test failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    if (mongoServer) {
      await mongoose.disconnect();
      await mongoServer.stop();
    }
  }
}

// Run
runTests();
