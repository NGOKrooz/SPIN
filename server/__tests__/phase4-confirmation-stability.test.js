const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const internsRouter = require('../routes/interns');
const rotationsRouter = require('../routes/rotations');
const { reshuffleAllUpcoming } = require('../services/rotationPlanService');
const Intern = require('../models/Intern');
const Rotation = require('../models/Rotation');
const Unit = require('../models/Unit');
const ActivityLog = require('../models/ActivityLog');

const app = express();
app.use(express.json());
app.use('/api/interns', internsRouter);
app.use('/api/rotations', rotationsRouter);

const DAY_IN_MS = 1000 * 60 * 60 * 24;
const normalizeDay = (dateLike) => {
  const value = new Date(dateLike);
  if (Number.isNaN(value.getTime())) return null;
  value.setHours(0, 0, 0, 0);
  return value;
};
const addDays = (dateLike, days) => {
  const value = new Date(dateLike);
  value.setDate(value.getDate() + Number(days || 0));
  return value;
};

describe('Phase 4 confirmation-based movement stability', () => {
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri(), { dbName: 'test-phase4' });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await mongoose.connection.db.dropDatabase();
  });

  test('GET /api/interns/:id preserves awaiting_confirmation and does not auto-advance expired active rotations', async () => {
    const today = normalizeDay(new Date());
    const units = await Unit.create([
      { name: 'Cardiology', order: 1, duration: 20, capacity: 4 },
      { name: 'Neurology', order: 2, duration: 20, capacity: 4 },
      { name: 'Pediatrics', order: 3, duration: 20, capacity: 4 },
    ]);

    const intern = await Intern.create({
      name: 'Phase4 Intern',
      gender: 'Male',
      batch: 'A',
      startDate: addDays(today, -100),
      status: 'active',
    });

    const activeStart = addDays(today, -25);
    const activeEnd = addDays(activeStart, 19);

    await Rotation.create({
      intern: intern._id,
      unit: units[0]._id,
      startDate: activeStart,
      endDate: activeEnd,
      duration: 20,
      status: 'active',
    });

    await Rotation.create({
      intern: intern._id,
      unit: units[1]._id,
      startDate: addDays(activeEnd, 1),
      endDate: addDays(activeEnd, 20),
      duration: 20,
      status: 'awaiting_confirmation',
    });

    const response = await request(app).get(`/api/interns/${intern._id}`);
    expect(response.status).toBe(200);

    const rotations = response.body.rotations || [];
    const active = rotations.find((r) => r.status === 'active');
    const awaiting = rotations.find((r) => r.status === 'awaiting_confirmation');

    expect(active).toBeDefined();
    expect(active.unit_name).toBe('Cardiology');
    expect(awaiting).toBeDefined();
    expect(awaiting.unit_name).toBe('Neurology');
    expect(rotations.filter((r) => r.status === 'active')).toHaveLength(1);
    expect(rotations.filter((r) => r.status === 'awaiting_confirmation')).toHaveLength(1);
  });

  test('reshuffleAllUpcoming preserves awaiting_confirmation units and avoids duplicate upcoming assignments', async () => {
    const today = normalizeDay(new Date());
    const units = await Unit.create([
      { name: 'Cardiology', order: 1, duration: 20, capacity: 4 },
      { name: 'Neurology', order: 2, duration: 20, capacity: 4 },
      { name: 'Pediatrics', order: 3, duration: 20, capacity: 4 },
    ]);

    const intern = await Intern.create({
      name: 'Phase4 Shuffle Intern',
      gender: 'Female',
      batch: 'B',
      startDate: addDays(today, -100),
      status: 'active',
    });

    const activeStart = addDays(today, -25);
    const activeEnd = addDays(activeStart, 19);

    await Rotation.create({
      intern: intern._id,
      unit: units[0]._id,
      startDate: activeStart,
      endDate: activeEnd,
      duration: 20,
      status: 'active',
    });

    await Rotation.create({
      intern: intern._id,
      unit: units[1]._id,
      startDate: addDays(activeEnd, 1),
      endDate: addDays(activeEnd, 20),
      duration: 20,
      status: 'awaiting_confirmation',
    });

    await reshuffleAllUpcoming();

    const upcoming = await Rotation.find({ intern: intern._id, status: 'upcoming' }).populate('unit').exec();
    const awaiting = await Rotation.find({ intern: intern._id, status: 'awaiting_confirmation' }).populate('unit').exec();

    expect(awaiting).toHaveLength(1);
    expect(upcoming.some((row) => String(row.unit._id) === String(awaiting[0].unit._id))).toBe(false);
    expect(upcoming.every((row) => row.unit.name !== 'Neurology')).toBe(true);
  });

  test('Full confirmation workflow preserves delayed days, allows reassignment before movement, and records history accurately', async () => {
    const today = normalizeDay(new Date());
    const units = await Unit.create([
      { name: 'Cardiology', order: 1, duration: 20, capacity: 2 },
      { name: 'Neurology', order: 2, duration: 20, capacity: 2 },
      { name: 'Pediatrics', order: 3, duration: 20, capacity: 2 },
      { name: 'Orthopedics', order: 4, duration: 20, capacity: 2 },
    ]);

    const intern = await Intern.create({
      name: 'Phase4 Full Flow Intern',
      gender: 'Female',
      batch: 'A',
      startDate: addDays(today, -100),
      status: 'active',
    });

    const activeStart = addDays(today, -25);
    const activeEnd = addDays(activeStart, 19);
    const nextStart = addDays(activeEnd, 1);

    await Rotation.create({
      intern: intern._id,
      unit: units[0]._id,
      startDate: activeStart,
      endDate: activeEnd,
      duration: 20,
      status: 'active',
    });

    await Rotation.create({
      intern: intern._id,
      unit: units[1]._id,
      startDate: nextStart,
      endDate: addDays(nextStart, 19),
      duration: 20,
      status: 'upcoming',
    });

    const internResponse = await request(app).get(`/api/interns/${intern._id}`);
    expect(internResponse.status).toBe(200);

    expect(internResponse.body.awaitingConfirmationUnits).toBeDefined();
    expect(internResponse.body.awaitingConfirmationUnits).toHaveLength(1);
    expect(internResponse.body.awaitingConfirmationUnits[0].unit_name).toBe('Neurology');
    expect(internResponse.body.currentUnit).toBeDefined();
    expect(internResponse.body.currentUnit.name).toBe('Cardiology');
    expect(internResponse.body.currentUnit.elapsedDays).toBe(26);
    expect(internResponse.body.dashboard.progress).toBe('26/20');

    const reassignResponse = await request(app)
      .post(`/api/rotations/${intern._id}/reassign-next`)
      .send({ newUnitId: units[3]._id.toString() });

    expect(reassignResponse.status).toBe(200);
    expect(reassignResponse.body.data.newUnit).toBe('Orthopedics');

    const secondGet = await request(app).get(`/api/interns/${intern._id}`);
    expect(secondGet.body.awaitingConfirmationUnits).toHaveLength(1);
    expect(secondGet.body.awaitingConfirmationUnits[0].unit_name).toBe('Orthopedics');

    const acceptResponse = await request(app).post(`/api/rotations/${intern._id}/accept-movement`);
    expect(acceptResponse.status).toBe(200);
    expect(acceptResponse.body.data.fromUnit).toBe('Cardiology');
    expect(acceptResponse.body.data.toUnit).toBe('Orthopedics');

    const rotations = await Rotation.find({ intern: intern._id }).populate('unit').exec();
    const completed = rotations.filter((rot) => rot.status === 'completed');
    const active = rotations.filter((rot) => rot.status === 'active');
    const awaiting = rotations.filter((rot) => rot.status === 'awaiting_confirmation');

    expect(completed).toHaveLength(1);
    expect(active).toHaveLength(1);
    expect(awaiting).toHaveLength(0);
    expect(completed[0].unit.name).toBe('Cardiology');
    expect(completed[0].actualEndDate).toBeTruthy();
    expect(normalizeDay(completed[0].actualEndDate).getTime()).toBe(normalizeDay(today).getTime());
    expect(active[0].unit.name).toBe('Orthopedics');
    expect(normalizeDay(active[0].startDate).getTime()).toBe(normalizeDay(today).getTime());

    const logEntries = await ActivityLog.find({ intern: intern._id }).sort({ created_at: 1 }).exec();
    expect(logEntries.some((entry) => entry.action_type === 'unit_reassigned')).toBe(true);
    expect(logEntries.some((entry) => entry.action_type === 'movement_accepted')).toBe(true);

    await reshuffleAllUpcoming();
    const awaitingAfterShuffle = await Rotation.find({ intern: intern._id, status: 'awaiting_confirmation' }).exec();
    expect(awaitingAfterShuffle).toHaveLength(0);
  });
});
