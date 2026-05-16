const path = require('path');
const { spawn } = require('child_process');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const { setTimeout: wait } = require('timers/promises');

const SERVER_PORT = 5001;
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;
const SERVER_START_TIMEOUT_MS = 30000;
const SERVER_HEALTH_PATH = '/api/health';

const startOfDay = (date = new Date()) => {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
};

const addDays = (date, days) => {
  const value = new Date(date);
  value.setDate(value.getDate() + Number(days || 0));
  return value;
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
};

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => null);
  return { status: response.status, body, headers: response.headers };
};

const spawnServer = (mongoUri, additionalEnv = {}) => {
  const serverPath = path.resolve(__dirname, '..');
  const env = {
    ...process.env,
    MONGO_URI: mongoUri,
    PORT: String(SERVER_PORT),
    NODE_ENV: 'test',
    AUTO_ROTATION: 'false',
    ADMIN_PASSWORD: 'space3key',
    ...additionalEnv,
  };

  const child = spawn('node', ['index.js'], {
    cwd: serverPath,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const logs = [];
  const blockingLogs = [];

  const capture = (chunk, source) => {
    const text = chunk.toString();
    text.split(/\r?\n/).filter(Boolean).forEach((line) => {
      const entry = `[${source}] ${line}`;
      logs.push(entry);
      if (line.includes('[MOVEMENT BLOCKED]')) {
        blockingLogs.push(entry);
      }
      console.log(entry);
    });
  };

  child.stdout.on('data', (chunk) => capture(chunk, 'stdout'));
  child.stderr.on('data', (chunk) => capture(chunk, 'stderr'));

  return { child, logs, blockingLogs };
};

const waitForServerReady = async () => {
  const deadline = Date.now() + SERVER_START_TIMEOUT_MS;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${SERVER_URL}${SERVER_HEALTH_PATH}`);
      if (response.ok) {
        return;
      }
      lastError = new Error(`Health check returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await wait(500);
  }

  throw new Error(`Server did not become ready in time: ${lastError?.message || 'unknown'}`);
};

const createScenarioState = async () => {
  const Unit = require('../models/Unit');
  const Intern = require('../models/Intern');
  const Rotation = require('../models/Rotation');

  await Unit.deleteMany({}).exec();
  await Intern.deleteMany({}).exec();
  await Rotation.deleteMany({}).exec();

  const units = await Unit.create([
    { name: 'Adult Neurology', order: 1, durationDays: 21, position: 1, capacity: 4 },
    { name: 'Pediatrics', order: 2, durationDays: 21, position: 2, capacity: 4 },
    { name: 'Orthopedics', order: 3, durationDays: 21, position: 3, capacity: 4 },
    { name: 'Cardiology', order: 4, durationDays: 21, position: 4, capacity: 4 },
  ]);

  const unitByName = new Map(units.map((unit) => [unit.name, unit]));

  const intern = await Intern.create({
    name: 'John Doe',
    gender: 'Male',
    batch: 'A',
    phone: '555-0100',
    status: 'active',
    startDate: startOfDay(new Date()),
    currentUnit: unitByName.get('Adult Neurology')._id,
    manualExtensionDays: 0,
    autoExtensionDays: 0,
    extensionDays: 0,
    totalExtensionDays: 0,
    rotationHistory: [],
  });

  return { intern, unitByName };
};

const seedInitialRotations = async (internId, unitByName, elapsedDays) => {
  const Rotation = require('../models/Rotation');
  const today = startOfDay(new Date());
  const currentStart = addDays(today, -(elapsedDays - 1));
  const currentEnd = addDays(currentStart, 20); // 21-day total window
  const nextStart = addDays(currentEnd, 1);
  const nextEnd = addDays(nextStart, 20);

  await Rotation.deleteMany({ intern: internId }).exec();

  const currentRotation = await Rotation.create({
    intern: internId,
    unit: unitByName.get('Adult Neurology')._id,
    startDate: currentStart,
    endDate: currentEnd,
    baseDuration: 21,
    duration: 21,
    extensionDays: 0,
    manualExtensionDays: 0,
    autoExtensionDays: 0,
    status: 'active',
  });

  const nextRotation = await Rotation.create({
    intern: internId,
    unit: unitByName.get('Pediatrics')._id,
    startDate: nextStart,
    endDate: nextEnd,
    baseDuration: 21,
    duration: 21,
    extensionDays: 0,
    manualExtensionDays: 0,
    autoExtensionDays: 0,
    status: 'upcoming',
  });

  const Intern = require('../models/Intern');
  await Intern.findByIdAndUpdate(internId, {
    currentUnit: unitByName.get('Adult Neurology')._id,
    status: 'active',
    rotationHistory: [currentRotation._id, nextRotation._id],
    manualExtensionDays: 0,
    autoExtensionDays: 0,
    extensionDays: 0,
    totalExtensionDays: 0,
  }).exec();

  return { currentRotation, nextRotation };
};

const dumpRotations = async (internId, label) => {
  const Rotation = require('../models/Rotation');
  const rotations = await Rotation.find({ intern: internId }).sort({ startDate: 1 }).populate('unit');
  console.log(`DEBUG ROTATIONS (${label}):`);
  rotations.forEach((rotation) => {
    console.log(' ', {
      id: rotation._id.toString(),
      unit: rotation.unit?.name || rotation.unit,
      status: rotation.status,
      startDate: rotation.startDate?.toISOString().slice(0, 10),
      endDate: rotation.endDate?.toISOString().slice(0, 10),
      duration: rotation.duration,
      extensionDays: rotation.extensionDays,
      manualExtensionDays: rotation.manualExtensionDays,
      autoExtensionDays: rotation.autoExtensionDays,
    });
  });
};

const updateRotationProgress = async (internId, elapsedDays) => {
  const Rotation = require('../models/Rotation');
  const today = startOfDay(new Date());
  const currentStart = addDays(today, -(elapsedDays - 1));
  const currentEnd = addDays(currentStart, 20);

  const currentRotation = await Rotation.findOne({ intern: internId, status: { $in: ['active', 'pending'] } })
    .sort({ startDate: -1, createdAt: -1 })
    .exec();
  assert(currentRotation, 'Expected active rotation to exist to update progress');

  currentRotation.startDate = currentStart;
  currentRotation.endDate = currentEnd;
  currentRotation.duration = 21;
  currentRotation.baseDuration = 21;
  currentRotation.manualExtensionDays = 0;
  currentRotation.autoExtensionDays = 0;
  currentRotation.extensionDays = 0;
  await currentRotation.save();

  return currentRotation;
};

const getState = async (internId) => {
  const internResp = await fetchJson(`${SERVER_URL}/api/interns/${internId}`);
  assert(internResp.status === 200, `Expected 200 from GET /api/interns/${internId}, got ${internResp.status}`);

  const healthResp = await fetchJson(`${SERVER_URL}${SERVER_HEALTH_PATH}`);
  assert(healthResp.status === 200, 'Server health endpoint failed after fetch');

  return internResp.body;
};

const findRotation = (internView, status) => {
  return (internView.rotations || []).find((rotation) => rotation.status === status) || null;
};

const isActiveLikeStatus = (status) => status === 'active' || status === 'pending';

const findActiveLikeRotation = (internView) => (
  (internView.rotations || []).find((rotation) => isActiveLikeStatus(rotation.status)) || null
);

const buildQueueStatus = (internView) => {
  const activeRotation = findActiveLikeRotation(internView);
  assert(activeRotation, 'Active rotation missing from intern view');
  const nextRotation = findRotation(internView, 'awaiting_confirmation') || findRotation(internView, 'upcoming');
  assert(nextRotation, 'Next rotation missing from intern view');

  const today = startOfDay(new Date());
  const activeStartDate = startOfDay(activeRotation.startDate);
  const plannedDuration = Number(activeRotation.baseDuration || activeRotation.plannedDuration || 21);
  const totalDuration = Number(activeRotation.duration || plannedDuration);
  const plannedEndDate = addDays(activeStartDate, plannedDuration - 1);
  const remainingDays = Math.floor((plannedEndDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const elapsedDays = Math.floor((today.getTime() - activeStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const overdueDays = Math.max(0, elapsedDays - plannedDuration);
  const isOverdue = overdueDays > 0;
  const buttonsEnabled = isOverdue;
  const statusLabel = nextRotation.status === 'awaiting_confirmation' ? 'awaiting_confirmation' : (remainingDays <= 5 ? 'nearing_completion' : 'none');

  return {
    currentUnit: activeRotation.unit?.name || activeRotation.unit_name || activeRotation.unit,
    currentStatus: isActiveLikeStatus(activeRotation.status) ? 'active' : activeRotation.status,
    plannedDuration,
    activeDuration: totalDuration,
    activeExtensionDays: activeRotation.extensionDays,
    elapsedDays,
    remainingDays,
    overdueDays,
    isOverdue,
    queueStatus: statusLabel,
    nextUnit: nextRotation.unit?.name || nextRotation.unit_name || nextRotation.unit,
    nextRotationStatus: nextRotation.status,
    buttons: {
      acceptEnabled: buttonsEnabled,
      reassignEnabled: buttonsEnabled,
    },
    rotationHistoryCount: internView.rotations.length,
    awaitingCount: (internView.rotations || []).filter((r) => r.status === 'awaiting_confirmation').length,
    activeCount: (internView.rotations || []).filter((r) => r.status === 'active' || r.status === 'pending').length,
  };
};

const run = async () => {
  const mongod = await MongoMemoryServer.create();
  const mongoUri = mongod.getUri();
  console.log('🧪 Using in-memory MongoDB at', mongoUri);

  await mongoose.connect(mongoUri);
  console.log('✅ Connected script mongoose to memory DB');

  const server = spawnServer(mongoUri, { AUTO_ROTATION: 'false' });
  try {
    await waitForServerReady();
    console.log('🚀 Backend ready at', SERVER_URL);

    await mongoose.connect(mongoUri);
    const { intern: refreshedIntern, unitByName } = await createScenarioState();
    await seedInitialRotations(refreshedIntern._id, unitByName, 18);
    console.log('✅ Initial rotation progress set to 18/21 days');
    await mongoose.disconnect();

    const initialState = await getState(refreshedIntern._id);
    const initialQueue = buildQueueStatus(initialState);

    console.log('--- PHASE 1 — PRE-COMPLETION STATE ---');
    console.log('Current unit:', initialQueue.currentUnit);
    console.log('Elapsed days:', initialQueue.elapsedDays);
    console.log('Remaining days:', initialQueue.remainingDays);
    console.log('Queue status:', initialQueue.queueStatus);
    console.log('Next unit:', initialQueue.nextUnit);
    console.log('Accept button enabled:', initialQueue.buttons.acceptEnabled);
    console.log('Reassign button enabled:', initialQueue.buttons.reassignEnabled);

    assert(initialQueue.currentUnit === 'Adult Neurology', 'John Doe should remain in Adult Neurology in Phase 1');
    assert(initialQueue.currentStatus === 'active', 'John Doe should be active in Phase 1');
    assert(initialQueue.nextUnit === 'Pediatrics', 'Next unit should be Pediatrics in Phase 1');
    assert(initialQueue.buttons.acceptEnabled === false, 'Accept should be disabled in Phase 1');
    assert(initialQueue.buttons.reassignEnabled === false, 'Reassign should be disabled in Phase 1');
    assert(initialQueue.queueStatus === 'nearing_completion', 'Intern should appear in nearing_completion queue in Phase 1');

    console.log('✅ PHASE 1 verification passed');

    console.log('--- PHASE 2 — FINAL DAY ---');
    await mongoose.connect(mongoUri);
    await dumpRotations(refreshedIntern._id, 'before final day update');
    await updateRotationProgress(refreshedIntern._id, 21);
    await dumpRotations(refreshedIntern._id, 'after final day update');
    await mongoose.disconnect();

    const finalDayState = await getState(refreshedIntern._id);
    const finalDayQueue = buildQueueStatus(finalDayState);

    console.log('Current unit:', finalDayQueue.currentUnit);
    console.log('Elapsed days:', finalDayQueue.elapsedDays);
    console.log('Remaining days:', finalDayQueue.remainingDays);
    console.log('Queue status:', finalDayQueue.queueStatus);
    console.log('Accept enabled:', finalDayQueue.buttons.acceptEnabled);
    console.log('Reassign enabled:', finalDayQueue.buttons.reassignEnabled);

    assert(finalDayQueue.currentUnit === 'Adult Neurology', 'John Doe should still be in Adult Neurology on final day');
    assert(finalDayQueue.buttons.acceptEnabled === false, 'Accept should still be disabled on final day');
    assert(finalDayQueue.buttons.reassignEnabled === false, 'Reassign should still be disabled on final day');
    assert(finalDayQueue.queueStatus === 'nearing_completion', 'Intern should remain in nearing_completion queue on final day');

    console.log('✅ PHASE 2 verification passed');

    console.log('--- PHASE 3 — OVERDUE STATE ---');
    await mongoose.connect(mongoUri);
    await dumpRotations(refreshedIntern._id, 'before overdue update');
    await updateRotationProgress(refreshedIntern._id, 27);
    await dumpRotations(refreshedIntern._id, 'after overdue update');
    await mongoose.disconnect();

    const overdueState = await getState(refreshedIntern._id);
    const overdueQueue = buildQueueStatus(overdueState);

    console.log('Current unit:', overdueQueue.currentUnit);
    console.log('Remaining days:', overdueQueue.remainingDays);
    console.log('Elapsed days:', overdueQueue.elapsedDays);
    console.log('Planned duration:', overdueQueue.plannedDuration);
    console.log('Active duration:', overdueQueue.activeDuration);
    console.log('Extension days:', overdueQueue.activeExtensionDays);
    console.log('Overdue days:', overdueQueue.overdueDays);
    console.log('Next unit:', overdueQueue.nextUnit);
    console.log('Queue status:', overdueQueue.queueStatus);
    console.log('Accept enabled:', overdueQueue.buttons.acceptEnabled);
    console.log('Reassign enabled:', overdueQueue.buttons.reassignEnabled);

    assert(overdueQueue.currentUnit === 'Adult Neurology', 'Intern should remain in Adult Neurology while overdue');
    assert(overdueQueue.currentStatus === 'active', 'Intern should remain active while overdue');
    assert(overdueQueue.isOverdue === true, 'Intern should be overdue in Phase 3');
    assert(overdueQueue.elapsedDays === 27, `Expected elapsedDays to be 27, got ${overdueQueue.elapsedDays}`);
    assert(overdueQueue.plannedDuration === 21, `Expected plannedDuration to be 21, got ${overdueQueue.plannedDuration}`);
    assert(overdueQueue.overdueDays === 6, `Expected overdueDays to be 6, got ${overdueQueue.overdueDays}`);
    assert(overdueQueue.activeDuration === 27, `Expected active duration to be 27, got ${overdueQueue.activeDuration}`);
    assert(overdueQueue.activeExtensionDays === 6, `Expected extensionDays to be 6, got ${overdueQueue.activeExtensionDays}`);
    assert(overdueQueue.buttons.acceptEnabled === true, 'Accept should be clickable when overdue');
    assert(overdueQueue.buttons.reassignEnabled === true, 'Reassign should be clickable when overdue');
    assert(overdueQueue.queueStatus === 'awaiting_confirmation', 'Intern should be awaiting_confirmation after becoming overdue');

    console.log('✅ PHASE 3 verification passed');

    console.log('--- PHASE 4 — REFRESH TEST ---');
    const refresh1 = await getState(refreshedIntern._id);
    const refresh2 = await getState(refreshedIntern._id);
    const refreshQueue1 = buildQueueStatus(refresh1);
    const refreshQueue2 = buildQueueStatus(refresh2);
    assert(refreshQueue1.currentUnit === refreshQueue2.currentUnit, 'Current unit changed after refresh');
    assert(refreshQueue1.awaitingCount === refreshQueue2.awaitingCount, 'Awaiting confirmation count changed after refresh');
    assert(refreshQueue2.elapsedDays === 27, `Expected refresh elapsedDays to remain 27, got ${refreshQueue2.elapsedDays}`);
    assert(refreshQueue2.activeExtensionDays === 6, `Expected refresh extensionDays to remain 6, got ${refreshQueue2.activeExtensionDays}`);
    console.log('✅ Refresh preserved overdue state and did not trigger movement');

    console.log('--- PHASE 5 — BACKEND RESTART TEST ---');
    await new Promise((resolve, reject) => {
      server.child.kill('SIGTERM');
      server.child.once('exit', resolve);
      server.child.once('error', reject);
    });
    await wait(1000);
    console.log('Backend stopped, restarting...');

    const restarted = spawnServer(mongoUri, { AUTO_ROTATION: 'false' });
    await waitForServerReady();
    console.log('Backend restarted successfully');

    const stateAfterRestart = await getState(refreshedIntern._id);
    const queueAfterRestart = buildQueueStatus(stateAfterRestart);
    assert(queueAfterRestart.currentUnit === 'Adult Neurology', 'Current unit changed after backend restart');
    assert(queueAfterRestart.currentStatus === 'active', 'Intern should remain active after backend restart');
    assert(queueAfterRestart.isOverdue === true, 'Intern should remain overdue after backend restart');
    assert(queueAfterRestart.buttons.acceptEnabled === true, 'Accept should remain clickable after backend restart');
    console.log('✅ Backend restart preserved overdue awaiting-confirmation state without movement');

    console.log('--- PHASE 6 — RESHUFFLE TEST ---');
    const beforeRefreshUpcoming = stateAfterRestart.rotations.find((r) => r.status === 'awaiting_confirmation');
    assert(beforeRefreshUpcoming, 'Awaiting confirmation rotation should exist before refresh-upcoming');
    const beforeCurrentUnit = queueAfterRestart.currentUnit;

    const refreshUpcomingResp = await fetchJson(`${SERVER_URL}/api/rotations/refresh-upcoming`, { method: 'POST' });
    assert(refreshUpcomingResp.status === 200, `Refresh upcoming failed: ${refreshUpcomingResp.status}`);

    const afterRefreshUpcomingState = await getState(refreshedIntern._id);
    const afterAwaiting = afterRefreshUpcomingState.rotations.find((r) => r.status === 'awaiting_confirmation');
    assert(afterAwaiting, 'Awaiting confirmation rotation must still exist after refresh-upcoming');
    assert(afterAwaiting.unit?.name === 'Pediatrics' || afterAwaiting.unit_name === 'Pediatrics', 'Awaiting confirmation next unit should remain Pediatrics after refresh-upcoming');
    const activeLikeAfterRefreshUpcoming = findActiveLikeRotation(afterRefreshUpcomingState);
    assert(activeLikeAfterRefreshUpcoming?.unit?.name === beforeCurrentUnit || activeLikeAfterRefreshUpcoming?.unit_name === beforeCurrentUnit, 'Current unit changed after refresh-upcoming');
    console.log('✅ Refresh upcoming preserved the overdue assignment without moving the intern');

    console.log('--- PHASE 7 — REASSIGN TEST ---');
    const reassignResponse = await fetchJson(`${SERVER_URL}/api/rotations/${refreshedIntern._id}/reassign-next`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newUnitId: unitByName.get('Orthopedics')._id.toString() }),
    });
    assert(reassignResponse.status === 200, `Reassign-next failed: ${reassignResponse.status}`);
    assert(reassignResponse.body.data?.newUnit === 'Orthopedics', 'Reassign-next did not change next unit to Orthopedics');

    const stateAfterReassign = await getState(refreshedIntern._id);
    const nextRotationAfterReassign = stateAfterReassign.rotations.find((r) => r.status === 'awaiting_confirmation');
    assert(nextRotationAfterReassign, 'There should still be one awaiting_confirmation rotation after reassign');
    assert(nextRotationAfterReassign.unit?.name === 'Orthopedics' || nextRotationAfterReassign.unit_name === 'Orthopedics', 'Next unit did not update to Orthopedics after reassign');
    assert(stateAfterReassign.rotations.filter((r) => r.status === 'active' || r.status === 'pending').length === 1, 'Multiple active-like rotations found after reassign');
    console.log('✅ Reassign changed the next unit only and did not move the intern yet');

    console.log('--- PHASE 8 — ACCEPT CONFIRMATION TEST ---');
    console.log('Confirm move dialog displayed by frontend would show intern name and current/next unit based on the fetched movement queue. In this API simulation, we verify the same details from the state:');
    console.log('  Intern:', stateAfterReassign.name || 'John Doe');
    console.log('  Current unit:', queueAfterRestart.currentUnit);
    console.log('  Next unit before confirm:', nextRotationAfterReassign.unit?.name || nextRotationAfterReassign.unit_name);
    console.log('  Overdue days:', Math.max(0, -queueAfterRestart.remainingDays));
    const acceptReady = nextRotationAfterReassign.status === 'awaiting_confirmation' && queueAfterRestart.isOverdue;
    assert(acceptReady, 'Accept confirmation modal would not be enabled until overdue and awaiting confirmation');
    console.log('✅ Confirmation modal state would display correct move details before clicking Confirm Move');

    console.log('--- PHASE 9 — FINAL MOVEMENT TEST ---');
    const acceptResponse = await fetchJson(`${SERVER_URL}/api/rotations/${refreshedIntern._id}/accept-movement`, {
      method: 'POST',
    });
    assert(acceptResponse.status === 200, `Accept movement failed: ${acceptResponse.status}`);
    const acceptData = acceptResponse.body.data || {};
    assert(acceptData.toUnit === 'Orthopedics', 'Confirm Move did not activate Orthopedics');
    assert(acceptData.fromUnit === 'Adult Neurology', 'Confirm Move did not complete Adult Neurology');
    assert(acceptData.newStartDate, 'Confirm Move did not set a start date for Orthopedics');

    const finalState = await getState(refreshedIntern._id);
    const activeAfterAccept = findRotation(finalState, 'active');
    const completedAfterAccept = findRotation(finalState, 'completed');
    assert(activeAfterAccept, 'No active rotation after acceptance');
    assert(completedAfterAccept, 'No completed rotation after acceptance');
    assert(activeAfterAccept.unit?.name === 'Orthopedics' || activeAfterAccept.unit_name === 'Orthopedics', 'Active unit after confirm is not Orthopedics');
    assert(completedAfterAccept.unit?.name === 'Adult Neurology' || completedAfterAccept.unit_name === 'Adult Neurology', 'Completed rotation after confirm is not Adult Neurology');
    assert(startOfDay(new Date(activeAfterAccept.startDate)).getTime() === startOfDay(new Date()).getTime(), 'Orthopedics did not start today');
    assert(completedAfterAccept.actualEndDate, 'Completed rotation missing actualEndDate after accept');

    console.log('✅ PHASE 9 final movement verification passed');

    console.log('--- PHASE 10 — HISTORY VALIDATION ---');
    assert(completedAfterAccept.duration === 27, 'Completed rotation duration is not preserved as 27 days');
    assert(completedAfterAccept.extensionDays === 6, 'Completed rotation extensionDays is not 6');
    console.log('✅ Completed history preserved 27 total days and 6 extension days for Adult Neurology');

    console.log('--- PHASE 11 — DUPLICATE ASSIGNMENT VALIDATION ---');
    assert(finalState.rotations.filter((r) => r.status === 'active' || r.status === 'pending').length === 1, 'Multiple active-like assignments found');
    assert(finalState.rotations.filter((r) => r.status === 'awaiting_confirmation').length === 0, 'Multiple awaiting_confirmation assignments found');
    console.log('✅ No duplicate active or awaiting_confirmation assignments exist');

    console.log('--- PHASE 12 — MOVEMENT LOCK VALIDATION ---');
    const blockedMessages = [...(server.blockingLogs || []), ...(restarted.blockingLogs || [])];
    assert(blockedMessages.length > 0, 'Expected blocked movement logs to appear');
    console.log('Captured blocked movement log entries:');
    blockedMessages.slice(-10).forEach((entry) => console.log(' ', entry));
    console.log('✅ Movement lock messages were logged for blocked automatic movement paths');

    console.log('\n🎯 TEST PASS: Confirm-only movement behavior validated end-to-end.');
  } finally {
    if (server && server.child && !server.child.killed) {
      server.child.kill('SIGTERM');
    }
    await mongoose.disconnect().catch(() => {});
    await mongod.stop();
  }
};

run().catch((error) => {
  console.error('❌ Behavioral verification failed:', error);
  process.exit(1);
});
