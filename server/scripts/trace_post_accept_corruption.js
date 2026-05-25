const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const fs = require('fs');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { addDays, startOfDay } = require('date-fns');

const Intern = require('../models/Intern');
const Rotation = require('../models/Rotation');
const Unit = require('../models/Unit');
const rotationPlanService = require('../services/rotationPlanService');

const internsRouter = require('../routes/interns');
const rotationsRouter = require('../routes/rotations');
const activityRouter = require('../routes/activity');

const TRACE_FILE = 'POST_ACCEPT_CORRUPTION_TRACE.md';

const write = (line) => fs.appendFileSync(TRACE_FILE, `${line}\n`, 'utf8');
const dump = async (label, internId) => {
  const rotations = await Rotation.find({ intern: internId }).populate('unit').sort({ startDate: 1, createdAt: 1 }).exec();
  const summary = {
    total: rotations.length,
    active: rotations.filter((r) => r.status === 'active').map((r) => ({ id: r._id.toString(), unit: r.unit?.name || String(r.unit), startDate: r.startDate?.toISOString(), endDate: r.endDate?.toISOString(), status: r.status, actualEndDate: r.actualEndDate?.toISOString?.() || null })),
    awaiting: rotations.filter((r) => r.status === 'awaiting_confirmation').map((r) => ({ id: r._id.toString(), unit: r.unit?.name || String(r.unit), startDate: r.startDate?.toISOString(), endDate: r.endDate?.toISOString(), status: r.status })),
    upcoming: rotations.filter((r) => r.status === 'upcoming').map((r) => ({ id: r._id.toString(), unit: r.unit?.name || String(r.unit), startDate: r.startDate?.toISOString(), endDate: r.endDate?.toISOString(), status: r.status })),
    completed: rotations.filter((r) => r.status === 'completed').map((r) => ({ id: r._id.toString(), unit: r.unit?.name || String(r.unit), startDate: r.startDate?.toISOString(), endDate: r.endDate?.toISOString(), status: r.status, actualEndDate: r.actualEndDate?.toISOString?.() || null })),
  };
  write(`\n=== ${label} ===`);
  write(`internId=${internId.toString()}`);
  write(JSON.stringify(summary, null, 2));
};

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/interns', internsRouter);
  app.use('/api/rotations', rotationsRouter);
  app.use('/api/activity', activityRouter);
  return app;
};

const createUnits = async () => {
  await Unit.deleteMany({}).exec();
  return Unit.insertMany([
    { name: 'Cardiology', order: 1, position: 1, duration: 20 },
    { name: 'Neurology', order: 2, position: 2, duration: 20 },
    { name: 'Pediatrics', order: 3, position: 3, duration: 20 },
    { name: 'Orthopedics', order: 4, position: 4, duration: 20 },
    { name: 'Dermatology', order: 5, position: 5, duration: 20 },
  ]);
};

const createIntern = async (name, units) => {
  const intern = await Intern.create({
    name,
    gender: 'Female',
    batch: 'A',
    phone: '555-1000',
    status: 'active',
    extensionDays: 0,
    totalExtensionDays: 0,
    startDate: addDays(startOfDay(new Date()), -100),
    currentUnit: units[0]._id,
  });

  const currentStart = addDays(startOfDay(new Date()), -25);
  const currentEnd = addDays(currentStart, 19);
  const nextStart = addDays(currentEnd, 1);
  const nextEnd = addDays(nextStart, 19);
  const futureStart = addDays(nextEnd, 1);
  const futureEnd = addDays(futureStart, 19);

  await Rotation.create({ intern: intern._id, unit: units[0]._id, status: 'active', startDate: currentStart, endDate: currentEnd, duration: 20, baseDuration: 20, extensionDays: 0 });
  await Rotation.create({ intern: intern._id, unit: units[1]._id, status: 'awaiting_confirmation', startDate: nextStart, endDate: nextEnd, duration: 20, baseDuration: 20, extensionDays: 0 });
  await Rotation.create({ intern: intern._id, unit: units[2]._id, status: 'upcoming', startDate: futureStart, endDate: futureEnd, duration: 20, baseDuration: 20, extensionDays: 0 });

  return intern;
};

const logOperation = async (label, internId, app) => {
  write(`\n--- ${label} ---`);
  if (app) {
    write(`calling GET /api/interns`);
    const listRes = await request(app).get('/api/interns');
    write(`    /api/interns status=${listRes.status}`);
  }
  await dump(`DB state after ${label}`, internId);
};

const run = async () => {
  if (fs.existsSync(TRACE_FILE)) fs.unlinkSync(TRACE_FILE);
  write('# POST_ACCEPT_CORRUPTION_TRACE');
  write(`Date: ${new Date().toISOString()}`);

  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  const app = createApp();
  const units = await createUnits();
  const intern = await createIntern('Trace Intern', units);

  write('\nInitial state:');
  await dump('initial', intern._id);

  // pre-accept queue / predictive refresh state
  write('\nBefore acceptMovement:');
  await dump('before acceptMovement (DB)', intern._id);
  const beforeRoute = await request(app).get('/api/interns');
  write(`GET /api/interns => ${beforeRoute.status}`);
  await dump('after GET /api/interns pre-accept', intern._id);

  // select available unit for reassign
  const rotations = await Rotation.find({ intern: intern._id }).sort({ startDate: 1 }).exec();
  const usedUnitIds = new Set(rotations.map((r) => String(r.unit)).filter(Boolean));
  const available = units.find((u) => !usedUnitIds.has(String(u._id)));

  if (!available) {
    write('No available unit for reassignment');
    process.exit(1);
  }

  write(`\nReassign next unit to ${available.name} (${available._id})`);
  const reassignRes = await request(app)
    .post(`/api/rotations/${intern._id}/reassign-next`)
    .send({ newUnitId: available._id.toString() });
  write(`reassign-next status=${reassignRes.status}`);
  write(JSON.stringify(reassignRes.body, null, 2));
  await dump('after reassign-next', intern._id);

  write('\nCalling acceptMovement');
  const acceptRes = await request(app).post(`/api/rotations/${intern._id}/accept-movement`);
  write(`accept-movement status=${acceptRes.status}`);
  write(JSON.stringify(acceptRes.body, null, 2));
  await dump('after acceptMovement', intern._id);

  write('\nCalling reshuffleAllUpcoming() directly');
  const reshuffleRes = await rotationPlanService.reshuffleAllUpcoming();
  write(`reshuffleAllUpcoming result: ${JSON.stringify(reshuffleRes, null, 2)}`);
  await dump('after reshuffleAllUpcoming', intern._id);

  write('\nCalling GET /api/interns again (queue refresh / sync)');
  const refreshRes = await request(app).get('/api/interns');
  write(`GET /api/interns => ${refreshRes.status}`);
  await dump('after GET /api/interns post-reshuffle', intern._id);

  write('\nCalling GET /api/interns/:id schedule (queue details)');
  const scheduleRes = await request(app).get(`/api/interns/${intern._id}/schedule`);
  write(`GET /api/interns/:id/schedule => ${scheduleRes.status}`);
  write(JSON.stringify(scheduleRes.body, null, 2));
  await dump('after schedule fetch', intern._id);

  await mongoose.disconnect();
  await mongod.stop();
};

run().catch((err) => {
  write(`ERROR: ${err.stack || err}`);
  process.exit(1);
});
