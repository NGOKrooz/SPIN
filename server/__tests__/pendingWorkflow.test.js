const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Intern = require('../models/Intern');
const Rotation = require('../models/Rotation');
const Unit = require('../models/Unit');
const { ensureContinuousAssignment } = require('../services/dynamicAssignmentService');
const { createManualRotation } = require('../services/rotationService');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/interns', require('../routes/interns'));
  app.use('/api/rotations', require('../routes/rotations'));
  return app;
}

jest.setTimeout(120000);

describe('pending workflow', () => {
  let mongoServer;
  let app;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    app = buildApp();
  });

  afterEach(async () => {
    await mongoose.connection.dropDatabase();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('creates future rotations as upcoming rather than active', async () => {
    const unit = await Unit.create({ name: 'Cardiology', order: 1, durationDays: 7 });
    const futureStart = new Date();
    futureStart.setDate(futureStart.getDate() + 5);
    const futureEnd = new Date(futureStart);
    futureEnd.setDate(futureEnd.getDate() + 6);

    const rotation = await createManualRotation({
      internId: new mongoose.Types.ObjectId(),
      unitId: unit._id,
      startDate: futureStart,
      endDate: futureEnd,
    });

    expect(rotation.status).toBe('upcoming');
  });

  it('marks an intern as pending when the current rotation has expired and a next rotation is awaiting confirmation', async () => {
    const unit = await Unit.create({ name: 'Orthopaedics', order: 1, durationDays: 7 });
    const nextUnit = await Unit.create({ name: 'Neurology', order: 2, durationDays: 7 });

    const intern = await Intern.create({
      name: 'Ava',
      gender: 'Female',
      batch: 'A',
      phone: '123456789',
      status: 'active',
      startDate: new Date('2024-01-01'),
      currentUnit: unit._id,
    });

    const expiredRotation = await Rotation.create({
      intern: intern._id,
      unit: unit._id,
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-01-07'),
      baseDuration: 7,
      duration: 7,
      status: 'active',
    });

    await Rotation.create({
      intern: intern._id,
      unit: nextUnit._id,
      startDate: new Date('2024-01-08'),
      endDate: new Date('2024-01-14'),
      baseDuration: 7,
      duration: 7,
      status: 'awaiting_confirmation',
    });

    await ensureContinuousAssignment(intern._id, new Date('2024-01-09'));

    const refreshedIntern = await Intern.findById(intern._id).exec();
    const refreshedRotation = await Rotation.findById(expiredRotation._id).exec();

    expect(refreshedIntern.status).toBe('pending');
    expect(refreshedRotation.workflowState).toBe('pending_confirmation');
  });

  it('keeps the intern pending after an extension is applied and preserves the current unit', async () => {
    const unit = await Unit.create({ name: 'Pediatrics', order: 1, durationDays: 7 });
    const nextUnit = await Unit.create({ name: 'Dermatology', order: 2, durationDays: 7 });

    const intern = await Intern.create({
      name: 'Ben',
      gender: 'Male',
      batch: 'A',
      phone: '555',
      status: 'pending',
      startDate: new Date('2024-01-01'),
      currentUnit: unit._id,
    });

    const activeRotation = await Rotation.create({
      intern: intern._id,
      unit: unit._id,
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-01-08'),
      baseDuration: 7,
      duration: 7,
      status: 'active',
    });

    await Rotation.create({
      intern: intern._id,
      unit: nextUnit._id,
      startDate: new Date('2024-01-09'),
      endDate: new Date('2024-01-15'),
      baseDuration: 7,
      duration: 7,
      status: 'awaiting_confirmation',
    });

    const response = await request(app)
      .post(`/api/interns/${intern._id}/extend`)
      .send({ days: 3, reason: 'Pending extension' });

    expect(response.status).toBe(200);

    const updatedIntern = await Intern.findById(intern._id).exec();
    const updatedRotation = await Rotation.findById(activeRotation._id).exec();

    expect(updatedIntern.status).toBe('pending');
    expect(String(updatedIntern.currentUnit)).toBe(String(unit._id));
    expect(updatedRotation.extensionDays).toBe(3);
    expect(updatedRotation.duration).toBe(10);
  });

  it('accepts a pending movement and activates the staged next rotation without leaving the intern pending', async () => {
    const unit = await Unit.create({ name: 'Oncology', order: 1, durationDays: 7 });
    const nextUnit = await Unit.create({ name: 'Psychiatry', order: 2, durationDays: 7 });

    const intern = await Intern.create({
      name: 'Cara',
      gender: 'Female',
      batch: 'B',
      phone: '444',
      status: 'pending',
      startDate: new Date('2024-01-01'),
      currentUnit: unit._id,
    });

    const activeRotation = await Rotation.create({
      intern: intern._id,
      unit: unit._id,
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-01-08'),
      baseDuration: 7,
      duration: 7,
      status: 'active',
      workflowState: 'pending_confirmation',
    });

    const nextRotation = await Rotation.create({
      intern: intern._id,
      unit: nextUnit._id,
      startDate: new Date('2024-01-09'),
      endDate: new Date('2024-01-15'),
      baseDuration: 7,
      duration: 7,
      status: 'awaiting_confirmation',
    });

    const response = await request(app).post(`/api/rotations/${intern._id}/accept-movement`);

    expect(response.status).toBe(200);

    const refreshedActiveRotation = await Rotation.findById(activeRotation._id).exec();
    const refreshedNextRotation = await Rotation.findById(nextRotation._id).exec();
    const refreshedIntern = await Intern.findById(intern._id).exec();

    expect(refreshedActiveRotation.status).toBe('completed');
    expect(refreshedNextRotation.status).toBe('active');
    expect(refreshedIntern.status).toBe('active');
    expect(String(refreshedIntern.currentUnit)).toBe(String(nextUnit._id));
  });

  it('reassigns a pending intern to a remaining eligible unit and clears the pending state', async () => {
    const currentUnit = await Unit.create({ name: 'Respiratory', order: 1, durationDays: 7 });
    const completedUnit = await Unit.create({ name: 'ICU', order: 2, durationDays: 7 });
    const remainingUnit = await Unit.create({ name: 'Emergency', order: 3, durationDays: 7 });

    const intern = await Intern.create({
      name: 'Dina',
      gender: 'Female',
      batch: 'A',
      phone: '666',
      status: 'pending',
      startDate: new Date('2024-01-01'),
      currentUnit: currentUnit._id,
    });

    await Rotation.create({
      intern: intern._id,
      unit: currentUnit._id,
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-01-08'),
      baseDuration: 7,
      duration: 7,
      status: 'active',
      workflowState: 'pending_confirmation',
    });

    const completedRotation = await Rotation.create({
      intern: intern._id,
      unit: completedUnit._id,
      startDate: new Date('2024-01-09'),
      endDate: new Date('2024-01-15'),
      baseDuration: 7,
      duration: 7,
      status: 'completed',
    });

    const nextRotation = await Rotation.create({
      intern: intern._id,
      unit: remainingUnit._id,
      startDate: new Date('2024-01-16'),
      endDate: new Date('2024-01-22'),
      baseDuration: 7,
      duration: 7,
      status: 'awaiting_confirmation',
    });

    const rejected = await request(app)
      .post(`/api/rotations/${intern._id}/reassign-next`)
      .send({ newUnitId: completedUnit._id });

    expect(rejected.status).toBe(400);

    const response = await request(app)
      .post(`/api/rotations/${intern._id}/reassign-next`)
      .send({ newUnitId: remainingUnit._id });

    expect(response.status).toBe(200);

    const refreshedNextRotation = await Rotation.findById(nextRotation._id).exec();
    const refreshedIntern = await Intern.findById(intern._id).exec();

    expect(String(refreshedNextRotation.unit)).toBe(String(remainingUnit._id));
    expect(refreshedIntern.status).toBe('active');
    expect(refreshedIntern.currentUnit).toBeTruthy();
    expect(String(completedRotation.unit)).toBe(String(completedUnit._id));
  });
});
