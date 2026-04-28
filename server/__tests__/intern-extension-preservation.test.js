const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const internRouter = require('../routes/interns');
const Intern = require('../models/Intern');
const Rotation = require('../models/Rotation');
const Unit = require('../models/Unit');

jest.setTimeout(30000);

describe('Intern extension persistence', () => {
  let app;
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    await mongoose.connect(mongoUri);

    app = express();
    app.use(express.json());
    app.use('/api/interns', internRouter);
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await Promise.all([
      Intern.deleteMany({}),
      Rotation.deleteMany({}),
      Unit.deleteMany({}),
    ]);
  });

  it('persists extension on a completed rotation after extend', async () => {
    const unit = await Unit.create({
      name: 'Completed Unit',
      order: 1,
      durationDays: 20,
      capacity: 5,
    });

    const intern = await Intern.create({
      name: 'Test Intern',
      gender: 'Male',
      batch: 'A',
      startDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 40),
      status: 'completed',
      extensionDays: 0,
      totalExtensionDays: 0,
      currentUnit: unit._id,
    });

    const rotationStart = new Date(Date.now() - 1000 * 60 * 60 * 24 * 40);
    rotationStart.setHours(0, 0, 0, 0);
    const rotationEnd = new Date(rotationStart);
    rotationEnd.setDate(rotationStart.getDate() + 19);

    const rotation = await Rotation.create({
      intern: intern._id,
      unit: unit._id,
      startDate: rotationStart,
      endDate: rotationEnd,
      baseDuration: 20,
      extensionDays: 0,
      duration: 20,
      status: 'completed',
    });

    intern.rotationHistory = [rotation._id];
    await intern.save();

    const response = await request(app)
      .post(`/api/interns/${intern._id}/extend`)
      .send({ days: 5, reason: 'Preserve completed extension' })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.intern).toBeDefined();
    expect(response.body.intern.totalExtensionDays).toBe(5);
    expect(response.body.intern.extensionDays).toBe(0);

    const updatedRotation = await Rotation.findById(rotation._id).lean();
    expect(updatedRotation).toBeTruthy();
    expect(updatedRotation.extensionDays).toBe(5);
    expect(updatedRotation.duration).toBe(25);
    expect(updatedRotation.status).toBe('completed');

    const formattedRotation = response.body.intern.rotations.find((r) => r.id === rotation._id.toString());
    expect(formattedRotation).toBeDefined();
    expect(formattedRotation.extensionDays).toBe(5);
    expect(formattedRotation.duration).toBe(25);
    expect(formattedRotation.status).toBe('completed');
  });
});
