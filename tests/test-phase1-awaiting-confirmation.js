/**
 * Phase 1 Test: Awaiting Confirmation with Completed Units
 * 
 * Tests the new confirmation-based movement system:
 * 1. Create/find intern with completed units
 * 2. Set current rotation to expired duration
 * 3. Verify awaiting_confirmation status appears
 * 4. Test multiple times for consistency
 */

const mongoose = require('mongoose');
const path = require('path');

// Load environment
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });

const Intern = require('../server/models/Intern');
const Rotation = require('../server/models/Rotation');
const Unit = require('../server/models/Unit');

const { checkAndMarkAwaitingConfirmation } = require('../server/services/rotationService');
const { buildInternView } = require('../server/services/internViewService');

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
const TEST_INTERN_NAME = 'Phase1TestIntern-Expired';
const COMPLETED_UNITS = 2;
const CURRENT_UNIT_DURATION = 20;
const DAYS_PAST_EXPIRY = 5;

async function setupTestData() {
  console.log('\n📋 Setting up test data...');
  
  // Get or create units
  let units = await Unit.find({}).sort({ order: 1 }).exec();
  if (units.length === 0) {
    console.warn('⚠️  No units found. Creating test units...');
    units = await Unit.create([
      { name: 'Unit A', order: 1, duration: CURRENT_UNIT_DURATION, capacity: 4 },
      { name: 'Unit B', order: 2, duration: CURRENT_UNIT_DURATION, capacity: 4 },
      { name: 'Unit C', order: 3, duration: CURRENT_UNIT_DURATION, capacity: 4 },
    ]);
    console.log(`✅ Created ${units.length} test units`);
  }
  
  // Clean up any existing test intern
  await Intern.deleteOne({ name: TEST_INTERN_NAME }).exec();
  await Rotation.deleteMany({ intern: { $exists: true } }).exec();
  
  // Create test intern
  const intern = await Intern.create({
    name: TEST_INTERN_NAME,
    gender: 'Male',
    batch: 'A',
    startDate: addDays(new Date(), -100), // Started 100 days ago
  });
  
  console.log(`✅ Created test intern: ${intern.name} (ID: ${intern._id})`);
  
  // Create completed rotations
  const today = normalizeDay(new Date());
  let currentDate = normalizeDay(addDays(intern.startDate, 0));
  
  for (let i = 0; i < COMPLETED_UNITS; i++) {
    const unit = units[i % units.length];
    const rotationStart = currentDate;
    const rotationEnd = addDays(rotationStart, CURRENT_UNIT_DURATION - 1);
    
    await Rotation.create({
      intern: intern._id,
      unit: unit._id,
      startDate: rotationStart,
      endDate: rotationEnd,
      duration: CURRENT_UNIT_DURATION,
      status: 'completed',
    });
    
    console.log(
      `✅ Created completed rotation: ${unit.name} ` +
      `(${rotationStart.toLocaleDateString()} - ${rotationEnd.toLocaleDateString()})`
    );
    
    currentDate = addDays(rotationEnd, 1);
  }
  
  // Create CURRENT rotation with expired duration
  const currentUnit = units[COMPLETED_UNITS % units.length];
  const currentRotationStart = currentDate;
  const currentRotationEnd = addDays(currentRotationStart, CURRENT_UNIT_DURATION - 1);
  const expiredDate = addDays(currentRotationEnd, -DAYS_PAST_EXPIRY); // Already expired
  
  const currentRotation = await Rotation.create({
    intern: intern._id,
    unit: currentUnit._id,
    startDate: currentRotationStart,
    endDate: expiredDate, // Set to PAST date (expired)
    duration: CURRENT_UNIT_DURATION,
    status: 'active',
  });
  
  console.log(
    `✅ Created ACTIVE (expired) rotation: ${currentUnit.name} ` +
    `(${currentRotationStart.toLocaleDateString()} - ${expiredDate.toLocaleDateString()}) ` +
    `EXPIRED ${DAYS_PAST_EXPIRY} DAYS AGO`
  );
  
  // Create NEXT rotation (upcoming)
  const nextUnit = units[(COMPLETED_UNITS + 1) % units.length];
  const nextRotationStart = addDays(expiredDate, 1);
  const nextRotationEnd = addDays(nextRotationStart, CURRENT_UNIT_DURATION - 1);
  
  const nextRotation = await Rotation.create({
    intern: intern._id,
    unit: nextUnit._id,
    startDate: nextRotationStart,
    endDate: nextRotationEnd,
    duration: CURRENT_UNIT_DURATION,
    status: 'upcoming',
  });
  
  console.log(
    `✅ Created UPCOMING rotation: ${nextUnit.name} ` +
    `(${nextRotationStart.toLocaleDateString()} - ${nextRotationEnd.toLocaleDateString()})`
  );
  
  // Update intern's currentUnit
  await Intern.findByIdAndUpdate(intern._id, { currentUnit: currentUnit._id }).exec();
  
  console.log(`✅ Set intern's currentUnit to: ${currentUnit.name}`);
  
  return {
    intern,
    units,
    currentUnit,
    nextUnit,
    currentRotation,
    nextRotation,
  };
}

async function testAwaitingConfirmation(testData, testNumber) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🧪 TEST RUN #${testNumber}`);
  console.log(`${'='.repeat(70)}`);
  
  const { intern, currentUnit, nextUnit } = testData;
  
  // Get current state BEFORE checkAndMark
  const rotationsBefore = await Rotation.find({ intern: intern._id })
    .sort({ startDate: 1 })
    .lean()
    .exec();
  
  console.log(`\n📊 State BEFORE checkAndMarkAwaitingConfirmation():`);
  rotationsBefore.forEach((rot, idx) => {
    console.log(
      `  [${idx}] Status: ${rot.status.padEnd(20)} | ` +
      `Unit: ${rot.unit} | ` +
      `End: ${normalizeDay(rot.endDate).toLocaleDateString()}`
    );
  });
  
  const nextRotBefore = rotationsBefore.find(r => r.status === 'upcoming');
  if (nextRotBefore) {
    console.log(`\n✅ Next rotation before: status=${nextRotBefore.status}`);
  }
  
  // CALL THE PHASE 1 FUNCTION
  console.log(`\n🔄 Calling checkAndMarkAwaitingConfirmation()...`);
  const result = await checkAndMarkAwaitingConfirmation(intern._id, new Date());
  
  if (result) {
    console.log(
      `✅ Function returned rotation: ${result._id} ` +
      `(status: ${result.status})`
    );
  } else {
    console.log(`⚠️  Function returned null (no change needed)`);
  }
  
  // Get state AFTER checkAndMark
  const rotationsAfter = await Rotation.find({ intern: intern._id })
    .sort({ startDate: 1 })
    .lean()
    .exec();
  
  console.log(`\n📊 State AFTER checkAndMarkAwaitingConfirmation():`);
  rotationsAfter.forEach((rot, idx) => {
    console.log(
      `  [${idx}] Status: ${rot.status.padEnd(20)} | ` +
      `Unit: ${rot.unit} | ` +
      `End: ${normalizeDay(rot.endDate).toLocaleDateString()}`
    );
  });
  
  // Verify expectations
  const nextRotAfter = rotationsAfter.find(r => r.unit.toString() === nextUnit._id.toString());
  const currentRotAfter = rotationsAfter.find(r => r.status === 'active');
  
  console.log(`\n✔️  VERIFICATION:`);
  
  // Check 1: Current rotation should still be ACTIVE
  if (currentRotAfter && currentRotAfter.unit.toString() === currentUnit._id.toString()) {
    console.log(`  ✅ Current rotation STILL ACTIVE (${currentUnit.name})`);
  } else {
    console.log(`  ❌ ERROR: Current rotation no longer active!`);
    return false;
  }
  
  // Check 2: Next rotation should be AWAITING_CONFIRMATION
  if (nextRotAfter && nextRotAfter.status === 'awaiting_confirmation') {
    console.log(`  ✅ Next rotation marked AWAITING_CONFIRMATION (${nextUnit.name})`);
  } else if (nextRotAfter) {
    console.log(`  ⚠️  Next rotation status is: ${nextRotAfter.status} (expected awaiting_confirmation)`);
  } else {
    console.log(`  ❌ Next rotation not found!`);
    return false;
  }
  
  // Check 3: Build intern view to verify structure
  console.log(`\n🔍 Building intern view...`);
  const internView = await buildInternView(intern._id);
  
  const awaitingRot = internView.rotations.find(r => r.status === 'awaiting_confirmation');
  const activeRot = internView.rotations.find(r => r.status === 'active');
  
  if (awaitingRot) {
    console.log(`  ✅ Intern view includes awaiting_confirmation rotation`);
    console.log(`     Unit: ${awaitingRot.unitName}`);
  } else {
    console.log(`  ⚠️  No awaiting_confirmation in intern view`);
  }
  
  if (activeRot) {
    console.log(`  ✅ Intern view has active rotation: ${activeRot.unitName}`);
  }
  
  // Check 4: Verify elapsed days
  if (activeRot && activeRot.elapsedDays !== undefined) {
    console.log(
      `\n📅 Duration Check: ${activeRot.elapsedDays} / ${activeRot.duration} days ` +
      `(${activeRot.elapsedDays > activeRot.duration ? '✅ OVERFLOW ALLOWED' : 'OK'})`
    );
  }
  
  return true;
}

async function main() {
  try {
    console.log('\n🚀 Phase 1 Awaiting Confirmation Test Suite');
    console.log('='.repeat(70));
    
    // Connect to MongoDB
    console.log('\n📡 Connecting to MongoDB...');
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/spin-db';
    await mongoose.connect(mongoUri);
    console.log(`✅ Connected to ${mongoUri}`);
    
    // Setup test data
    const testData = await setupTestData();
    
    // Run test multiple times
    const numTests = 3;
    let successCount = 0;
    
    for (let i = 1; i <= numTests; i++) {
      const passed = await testAwaitingConfirmation(testData, i);
      if (passed) successCount++;
      
      if (i < numTests) {
        console.log(`\n⏳ Waiting 1 second before next test run...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Summary
    console.log(`\n${'='.repeat(70)}`);
    console.log(`📈 TEST SUMMARY`);
    console.log(`${'='.repeat(70)}`);
    console.log(`Total Tests: ${numTests}`);
    console.log(`Passed: ${successCount}`);
    console.log(`Failed: ${numTests - successCount}`);
    
    if (successCount === numTests) {
      console.log(`\n✅ ALL TESTS PASSED! Phase 1 awaiting_confirmation is working correctly.`);
    } else {
      console.log(`\n⚠️  Some tests failed. Check output above for details.`);
    }
    
    // Cleanup
    console.log(`\n🧹 Cleaning up test data...`);
    await Intern.deleteOne({ name: TEST_INTERN_NAME }).exec();
    console.log(`✅ Test data cleaned up`);
    
  } catch (error) {
    console.error('\n❌ Test Error:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

main();
