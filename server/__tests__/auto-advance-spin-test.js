const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const express = require('express');
const request = require('supertest');

const Intern = require('../models/Intern');
const Unit = require('../models/Unit');
const Rotation = require('../models/Rotation');

const app = express();
app.use(express.json());

// Import routes
const internRoutes = require('../routes/interns');
const rotationRoutes = require('../routes/rotations');

app.use('/api/interns', internRoutes);
app.use('/api/rotations', rotationRoutes);

// Mock the services that require database connection
jest.mock('../services/recentUpdatesService', () => ({
  ACTIVITY_TYPES: { INTERN_ADVANCED: 'intern_advanced' },
  logActivityEventSafe: jest.fn().mockResolvedValue(),
}));

jest.mock('../services/internService', () => ({
  ensureInternStatusIsCorrect: jest.fn().mockResolvedValue(),
}));

jest.mock('../routes/dashboard', () => ({
  updateBatchStats: jest.fn().mockResolvedValue(),
}));

jest.mock('../services/internViewService', () => ({
  buildInternView: jest.fn().mockResolvedValue({}),
}));

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Intern.deleteMany({});
  await Unit.deleteMany({});
  await Rotation.deleteMany({});
});

describe('Auto-advance endpoints mark rotations as completed', () => {
  let intern, unit1, unit2;

  beforeEach(async () => {
    // Create test units
    unit1 = await Unit.create({
      name: 'Unit 1',
      order: 1,
      capacity: 2,
      durationDays: 20
    });

    unit2 = await Unit.create({
      name: 'Unit 2',
      order: 2,
      capacity: 2,
      durationDays: 20
    });

    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(now.getDate() - 21);
    const endDate = new Date(now);
    endDate.setDate(now.getDate() - 1);

    // Create test intern with initial rotation that ended yesterday
    intern = await Intern.create({
      name: 'Test Intern',
      gender: 'Male',
      batch: 'A',
      startDate,
      status: 'active',
      currentUnit: unit1._id
    });

    await Rotation.create({
      intern: intern._id,
      unit: unit1._id,
      startDate,
      endDate,
      duration: 20,
      status: 'active'
    });
  });

  test('POST /api/interns/:id/auto-advance marks rotation as completed', async () => {
    const response = await request(app)
      .post(`/api/interns/${intern._id}/auto-advance`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.autoAdvanced).toBe(true);

    const completedRotations = await Rotation.find({ status: 'completed' });
    expect(completedRotations).toHaveLength(1);
    expect(completedRotations[0].intern.toString()).toBe(intern._id.toString());
    expect(completedRotations[0].unit.toString()).toBe(unit1._id.toString());
  });

  test('POST /api/rotations/auto-advance marks rotation as completed', async () => {
    const response = await request(app)
      .post('/api/rotations/auto-advance')
      .send({ internId: intern._id.toString() })
      .expect(200);

    expect(response.body.autoAdvanced).toBe(true);

    const completedRotations = await Rotation.find({ status: 'completed' });
    expect(completedRotations).toHaveLength(1);
    expect(completedRotations[0].intern.toString()).toBe(intern._id.toString());
    expect(completedRotations[0].unit.toString()).toBe(unit1._id.toString());
  });
});