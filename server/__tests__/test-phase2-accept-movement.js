/**
 * Phase 2 Test: Accept Movement Flow
 *
 * Tests the new confirmation-based movement system:
 * 1. Create intern with expired active rotation + awaiting_confirmation next rotation
 * 2. Call acceptMovement() to complete the transition
 * 3. Verify current rotation is completed with actualEndDate
 * 4. Verify next rotation becomes active with startDate = today
 * 5. Verify intern's currentUnit is updated
 * 6. Verify activity log is created
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

const { acceptMovement } = require('../services/rotationService');
const { buildInternView } = require('../services/internViewService');

const DAY_IN_MS = 1000 * 60 * 60 * 24;

const normalizeDay = (dateLike) => {
  const value = new Date(dateLike);
  if (Number.isNaN(value.getTime())) return null;
  value.setHours(0, 0, 0, 0);
  return value;
};

const TEST_INTERN_NAME = 'Phase2TestIntern-Accept';

async function setupTestData() {
  console.log('\n📋 Setting up test data...');

  // Clean up any existing test data
  await Intern.deleteOne({ name: TEST_INTERN_NAME }).exec();
  await Rotation.deleteMany({ intern: { $exists: true } }).exec();
  await ActivityLog.deleteMany({ action_type: 'movement_accepted' }).exec();

  // Create test units if they don't exist
  let unitA = await Unit.findOne({ name: 'Unit A' }).exec();
  if (!unitA) {
    unitA = await Unit.create({ name: 'Unit A', order: 1, durationDays: 20 });
    console.log('✅ Created Unit A');
  }

  let unitB = await Unit.findOne({ name: 'Unit B' }).exec();
  if (!unitB) {
    unitB = await Unit.create({ name: 'Unit B', order: 2, durationDays: 20 });
    console.log('✅ Created Unit B');
  }

  let unitC = await Unit.findOne({ name: 'Unit C' }).exec();
  if (!unitC) {
    unitC = await Unit.create({ name: 'Unit C', order: 3, durationDays: 15 });
    console.log('✅ Created Unit C');
  }

  // Create test intern
  const today = normalizeDay(new Date());
  const intern = await Intern.create({
    name: TEST_INTERN_NAME,
    gender: 'Female',
    batch: 'A',
    startDate: new Date(today.getTime() - (60 * DAY_IN_MS)), // Started 60 days ago
    currentUnit: unitC._id,
  });
  console.log(`✅ Created test intern: ${TEST_INTERN_NAME} (ID: ${intern._id})`);

  // Create rotation history: Unit A (completed) -> Unit B (completed) -> Unit C (active, expired) -> Unit A (awaiting_confirmation)
  const startDateA = new Date(today.getTime() - (60 * DAY_IN_MS)); // 60 days ago
  const endDateA = new Date(startDateA.getTime() + (20 * DAY_IN_MS)); // 40 days ago

  const startDateB = new Date(endDateA.getTime() + (1 * DAY_IN_MS)); // Next day after A ended
  const endDateB = new Date(startDateB.getTime() + (20 * DAY_IN_MS)); // 20 days ago

  const startDateC = new Date(endDateB.getTime() + (1 * DAY_IN_MS)); // Next day after B ended
  const endDateC = new Date(startDateC.getTime() + (15 * DAY_IN_MS)); // 5 days ago (EXPIRED)

  const startDateANext = new Date(today.getTime() + (1 * DAY_IN_MS)); // Tomorrow
  const endDateANext = new Date(startDateANext.getTime() + (20 * DAY_IN_MS)); // 21 days from tomorrow

  // Completed rotation: Unit A
  await Rotation.create({
    intern: intern._id,
    unit: unitA._id,
    startDate: startDateA,
    endDate: endDateA,
    duration: 20,
    status: 'completed',
  });
  console.log(`✅ Created completed rotation: Unit A (${startDateA.toISOString().split('T')[0]} - ${endDateA.toISOString().split('T')[0]})`);

  // Completed rotation: Unit B
  await Rotation.create({
    intern: intern._id,
    unit: unitB._id,
    startDate: startDateB,
    endDate: endDateB,
    duration: 20,
    status: 'completed',
  });
  console.log(`✅ Created completed rotation: Unit B (${startDateB.toISOString().split('T')[0]} - ${endDateB.toISOString().split('T')[0]})`);

  // ACTIVE (expired) rotation: Unit C
  await Rotation.create({
    intern: intern._id,
    unit: unitC._id,
    startDate: startDateC,
    endDate: endDateC,
    duration: 15,
    status: 'active',
  });
  console.log(`✅ Created ACTIVE (expired) rotation: Unit C (${startDateC.toISOString().split('T')[0]} - ${endDateC.toISOString().split('T')[0]}) EXPIRED ${Math.floor((today.getTime() - endDateC.getTime()) / DAY_IN_MS)} DAYS AGO`);

  // UPCOMING (awaiting_confirmation) rotation: Unit A
  await Rotation.create({
    intern: intern._id,
    unit: unitA._id,
    startDate: startDateANext,
    endDate: endDateANext,
    duration: 20,
    status: 'awaiting_confirmation',
  });
  console.log(`✅ Created AWAITING_CONFIRMATION rotation: Unit A (${startDateANext.toISOString().split('T')[0]} - ${endDateANext.toISOString().split('T')[0]})`);

  return {
    intern,
    currentUnit: unitC,
    nextUnit: unitA,
  };
}

async function testAcceptMovement(testData) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🧪 PHASE 2 ACCEPT MOVEMENT TEST`);
  console.log(`${'='.repeat(70)}`);

  const { intern, currentUnit, nextUnit } = testData;

  // Get state BEFORE acceptMovement
  const rotationsBefore = await Rotation.find({ intern: intern._id })
    .sort({ startDate: 1 })
    .populate('unit')
    .exec();

  console.log(`\n📊 State BEFORE acceptMovement():`);
  rotationsBefore.forEach((rot, idx) => {
    console.log(
      `  [${idx}] Status: ${rot.status.padEnd(20)} | ` +
      `Unit: ${rot.unit?.name || 'Unknown'} | ` +
      `Start: ${normalizeDay(rot.startDate).toISOString().split('T')[0]} | ` +
      `End: ${normalizeDay(rot.endDate).toISOString().split('T')[0]} | ` +
      `Actual End: ${rot.actualEndDate ? normalizeDay(rot.actualEndDate).toISOString().split('T')[0] : 'null'}`
    );
  });

  const activeBefore = rotationsBefore.find(r => r.status === 'active');
  const awaitingBefore = rotationsBefore.find(r => r.status === 'awaiting_confirmation');

  console.log(`\n✅ BEFORE: Active rotation = ${activeBefore?.unit?.name || 'None'}`);
  console.log(`✅ BEFORE: Awaiting rotation = ${awaitingBefore?.unit?.name || 'None'}`);

  // CALL THE PHASE 2 FUNCTION
  console.log(`\n🔄 Calling acceptMovement()...`);
  const result = await acceptMovement(intern._id);

  console.log(`✅ Function returned: ${result.internName} moved from ${result.fromUnit} to ${result.toUnit}`);

  // Get state AFTER acceptMovement
  const rotationsAfter = await Rotation.find({ intern: intern._id })
    .sort({ startDate: 1 })
    .populate('unit')
    .exec();

  console.log(`\n📊 State AFTER acceptMovement():`);
  rotationsAfter.forEach((rot, idx) => {
    console.log(
      `  [${idx}] Status: ${rot.status.padEnd(20)} | ` +
      `Unit: ${rot.unit?.name || 'Unknown'} | ` +
      `Start: ${normalizeDay(rot.startDate).toISOString().split('T')[0]} | ` +
      `End: ${normalizeDay(rot.endDate).toISOString().split('T')[0]} | ` +
      `Actual End: ${rot.actualEndDate ? normalizeDay(rot.actualEndDate).toISOString().split('T')[0] : 'null'}`
    );
  });

  // Verify expectations
  const completedAfter = rotationsAfter.find(r => {
    const unitId = r.unit._id ? r.unit._id.toString() : r.unit.toString();
    return r.status === 'completed' && unitId === currentUnit._id.toString();
  });
  const activeAfter = rotationsAfter.find(r => r.status === 'active');
  const internAfter = await Intern.findById(intern._id).exec();

  console.log(`\n✔️  VERIFICATION:`);

  // Check 1: Previous active rotation should be COMPLETED with actualEndDate = today
  const today = normalizeDay(new Date());
  if (completedAfter && completedAfter.actualEndDate && normalizeDay(completedAfter.actualEndDate).getTime() === today.getTime()) {
    console.log(`  ✅ Previous active rotation (${currentUnit.name}) COMPLETED with actualEndDate = TODAY`);
  } else {
    console.log(`  ❌ ERROR: Previous rotation not properly completed with today's date`);
    return false;
  }
  
  // Check 2: Next rotation should be ACTIVE with startDate = today
  const activeUnitId = activeAfter?.unit._id ? activeAfter.unit._id.toString() : activeAfter?.unit.toString();
  if (activeAfter && activeUnitId === nextUnit._id.toString() &&
      normalizeDay(activeAfter.startDate).getTime() === today.getTime()) {
    console.log(`  ✅ Next rotation (${nextUnit.name}) ACTIVATED with startDate = TODAY`);
  } else {
    console.log(`  ❌ ERROR: Next rotation not properly activated`);
    return false;
  }

  // Check 3: Intern's currentUnit should be updated
  if (internAfter && internAfter.currentUnit.toString() === nextUnit._id.toString()) {
    console.log(`  ✅ Intern's currentUnit updated to ${nextUnit.name}`);
  } else {
    console.log(`  ❌ ERROR: Intern's currentUnit not updated`);
    return false;
  }

  // Check 4: Activity log should be created
  const activityLog = await ActivityLog.findOne({
    action_type: 'movement_accepted',
    intern: intern._id
  }).exec();

  if (activityLog) {
    console.log(`  ✅ Activity log created: "${activityLog.description}"`);
  } else {
    console.log(`  ❌ ERROR: Activity log not created`);
    return false;
  }

  // Check 5: Build intern view to verify structure
  console.log(`\n🔍 Building intern view...`);
  const internView = await buildInternView(intern._id);

  const activeRot = internView.rotations.find(r => r.status === 'active');
  const awaitingRot = internView.rotations.find(r => r.status === 'awaiting_confirmation');

  if (activeRot && activeRot.unitName === nextUnit.name) {
    console.log(`  ✅ Intern view shows active rotation: ${activeRot.unitName}`);
  } else {
    console.log(`  ⚠️  Intern view active rotation issue`);
  }

  if (!awaitingRot) {
    console.log(`  ✅ No awaiting_confirmation rotations (as expected after acceptance)`);
  } else {
    console.log(`  ⚠️  Still has awaiting_confirmation rotation`);
  }

  console.log(`\n✅ PHASE 2 ACCEPT MOVEMENT TEST PASSED!`);
  return true;
}

async function main() {
  let mongoServer;
  try {
    console.log('\n🚀 Phase 2 Accept Movement Test Suite');
    console.log('='.repeat(70));

    // Start in-memory MongoDB server
    console.log('\n📡 Starting MongoDB Memory Server...');
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    console.log(`✅ Memory server started at ${mongoUri}`);

    // Connect to MongoDB
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to in-memory database');

    // Setup test data
    const testData = await setupTestData();

    // Run the test
    const success = await testAcceptMovement(testData);

    if (success) {
      console.log(`\n${'='.repeat(70)}`);
      console.log(`✅ PHASE 2 TEST PASSED! Accept movement flow working correctly.`);
      console.log(`${'='.repeat(70)}`);
    } else {
      console.log(`\n${'='.repeat(70)}`);
      console.log(`❌ PHASE 2 TEST FAILED! Check output above for issues.`);
      console.log(`${'='.repeat(70)}`);
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Test Error:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
      console.log('✅ Memory server stopped');
    }
  }
}

// Run the test
main().catch(console.error);