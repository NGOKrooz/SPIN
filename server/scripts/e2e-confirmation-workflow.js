const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { addDays, startOfDay } = require('date-fns');

const Intern = require('../models/Intern');
const Rotation = require('../models/Rotation');
const Unit = require('../models/Unit');
const ActivityLog = require('../models/ActivityLog');
const { resolveCurrentAssignment } = require('../services/assignmentUtils');
const internsRouter = require('../routes/interns');
const rotationsRouter = require('../routes/rotations');

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/interns', internsRouter);
  app.use('/api/rotations', rotationsRouter);
  return app;
};

const createSampleUnits = async () => {
  await Unit.deleteMany({}).exec();
  const units = [
    { name: 'Neurosciences', order: 1, position: 1, duration: 21 },
    { name: 'Pediatrics', order: 2, position: 2, duration: 21 },
    { name: 'Orthopedics', order: 3, position: 3, duration: 21 },
    { name: 'Cardiology', order: 4, position: 4, duration: 21 },
  ];
  return Unit.insertMany(units);
};

const createInternWithRotations = async (name, units, startOffsetDays = -26, delayDays = 6) => {
  const intern = await Intern.create({
    name,
    gender: 'Male',
    batch: 'A',
    phone: '555-1000',
    status: 'active',
    extensionDays: 0,
    totalExtensionDays: 0,
    startDate: addDays(startOfDay(new Date()), startOffsetDays),
    currentUnit: units[0]._id,
  });

  const currentStart = addDays(startOfDay(new Date()), startOffsetDays);
  const currentEnd = addDays(currentStart, 20);
  const nextStart = addDays(currentEnd, 1);
  const nextEnd = addDays(nextStart, 20);

  const currentRotation = await Rotation.create({
    intern: intern._id,
    unit: units[0]._id,
    status: 'active',
    startDate: currentStart,
    endDate: currentEnd,
    duration: 21,
    baseDuration: 21,
    extensionDays: 0,
  });

  const nextRotation = await Rotation.create({
    intern: intern._id,
    unit: units[1]._id,
    status: 'upcoming',
    startDate: nextStart,
    endDate: nextEnd,
    duration: 21,
    baseDuration: 21,
    extensionDays: 0,
  });

  return { intern, currentRotation, nextRotation };
};

const getCurrentRotation = async (internId) => {
  const rotations = await Rotation.find({ intern: internId })
    .populate('unit')
    .sort({ startDate: 1, createdAt: 1 })
    .exec();

  const currentAssignment = resolveCurrentAssignment(rotations);
  if (!currentAssignment || !currentAssignment._id) return null;
  return rotations.find((rotation) => String(rotation._id) === String(currentAssignment._id)) || null;
};

const runScenario = async () => {
  const mongod = await MongoMemoryServer.create();
  const mongoUri = mongod.getUri();
  await mongoose.connect(mongoUri);

  const app = createApp();
  const units = await createSampleUnits();

  console.log('✅ Created units:', units.map((u) => u.name).join(', '));

  const { intern, currentRotation, nextRotation } = await createInternWithRotations('Test Intern', units);
  console.log('✅ Created intern and rotations. Current rotation end:', currentRotation.endDate.toISOString().slice(0, 10));

  const response1 = await request(app).get('/api/interns');
  if (response1.status !== 200) {
    throw new Error(`GET /api/interns failed: ${response1.status} ${response1.text}`);
  }

  const fetchedInterns = response1.body;
  console.log('✅ Fetched interns count:', fetchedInterns.length);

  const internView = fetchedInterns.find((item) => item.name === 'Test Intern');
  if (!internView) throw new Error('Intern view missing');
  if (!internView.awaitingConfirmationUnits || internView.awaitingConfirmationUnits.length !== 1) {
    throw new Error(`Expected 1 awaitingConfirmationUnits, got ${internView.awaitingConfirmationUnits?.length}`);
  }

  const awaiting = internView.awaitingConfirmationUnits[0];
  console.log('✅ Awaiting confirmation unit:', awaiting.unit_name, 'status:', awaiting.status);

  const currentProgress = internView.dashboard?.progress || 'unknown';
  if (!currentProgress.includes('27/21')) {
    console.warn('⚠️ Dashboard progress may not show expected 27/21:', currentProgress);
  } else {
    console.log('✅ Dashboard progress indicates delayed reporting:', currentProgress);
  }

  // Simulate page refresh / repeated fetch
  const response2 = await request(app).get(`/api/interns/${intern._id}`);
  if (response2.status !== 200) throw new Error(`GET /api/interns/${intern._id} failed: ${response2.status}`);
  if (!response2.body.awaitingConfirmationUnits || response2.body.awaitingConfirmationUnits.length !== 1) {
    throw new Error('Awaiting confirmation state did not persist after refresh');
  }
  console.log('✅ Awaiting confirmation persisted after single-intern refresh');

  // Reassign the next unit before accepting movement
  const newUnit = units.find((unit) => unit.name === 'Orthopedics');
  const reassignResponse = await request(app)
    .post(`/api/rotations/${intern._id}/reassign-next`)
    .send({ newUnitId: newUnit._id.toString() });

  if (reassignResponse.status !== 200) {
    throw new Error(`Reassign next unit failed: ${reassignResponse.status} ${reassignResponse.text}`);
  }

  console.log('✅ Reassigned next unit to:', newUnit.name);
  if (reassignResponse.body.data.updatedRotation.unit.toString() !== newUnit._id.toString()) {
    throw new Error('Reassigned rotation did not update unit correctly');
  }

  const refreshResponse = await request(app).post('/api/rotations/refresh-upcoming');
  if (refreshResponse.status !== 200) {
    throw new Error(`Refresh upcoming failed: ${refreshResponse.status} ${refreshResponse.text}`);
  }
  console.log('✅ Refreshed upcoming rotations without affecting awaiting confirmation state');

  const responseAfterRefresh = await request(app).get(`/api/interns/${intern._id}`);
  if (responseAfterRefresh.status !== 200) {
    throw new Error(`GET /api/interns/${intern._id} failed after refresh: ${responseAfterRefresh.status}`);
  }
  if (responseAfterRefresh.body.awaitingConfirmationUnits.length !== 1) {
    throw new Error('Awaiting confirmation state was altered by refresh-upcoming');
  }

  // Accept movement
  const acceptResponse = await request(app).post(`/api/rotations/${intern._id}/accept-movement`);
  if (acceptResponse.status !== 200) {
    throw new Error(`Accept movement failed: ${acceptResponse.status} ${acceptResponse.text}`);
  }
  console.log('✅ Accepted movement into next unit');

  const finalInternResponse = await request(app).get(`/api/interns/${intern._id}`);
  if (finalInternResponse.status !== 200) {
    throw new Error(`GET /api/interns/${intern._id} failed after acceptance: ${finalInternResponse.status}`);
  }

  if (finalInternResponse.body.awaitingConfirmationUnits?.length > 0) {
    throw new Error('Awaiting confirmation units still present after acceptance');
  }

  const activeRotation = await getCurrentRotation(intern._id);
  if (!activeRotation || activeRotation.unit.name !== newUnit.name) {
    throw new Error('Active rotation did not switch to reassigned unit after acceptance');
  }

  const completedRotation = await Rotation.findOne({ intern: intern._id, status: 'completed' }).populate('unit').exec();
  if (!completedRotation || completedRotation.unit.name !== 'Neurosciences') {
    throw new Error('Original active rotation was not completed correctly');
  }
  if (!completedRotation.actualEndDate) {
    throw new Error('Completed rotation does not have an actualEndDate recorded');
  }

  console.log('✅ Original rotation completed with actualEndDate:', completedRotation.actualEndDate.toISOString().slice(0, 10));
  console.log('✅ Workflow validation completed successfully.');

  await mongoose.disconnect();
  await mongod.stop();
};

runScenario().catch((error) => {
  console.error('E2E workflow validation failed:', error);
  process.exit(1);
});
