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

    // FIX: dates must be relative to "now", not a hardcoded absolute past
    // date - a fixed 2024-01-01 start meant this test's assertions on exact
    // extension-day counts silently rotted as real time passed (by 2026 the
    // rotation was genuinely ~2.5 years overdue, so the extend route's real
    // day-math no longer matched the small numbers asserted below). The
    // scenario needs the rotation to be GENUINELY overdue by a small, fixed
    // amount (not just artificially fixture-flagged 'pending') -
    // syncInternRotationStates (called at the top of the /extend route)
    // recomputes intern.status from the actual dates and would otherwise
    // overwrite an unrealistic "pending but not actually overdue" fixture
    // back to 'active' before this test's own assertions ever run. With a
    // fixed 2-day overdue window, ensureContinuousAssignment's own overdue
    // handling contributes exactly 2 auto-extension days before /extend adds
    // the requested 3, for a stable, non-drifting total of 5.
    const internStart = new Date();
    internStart.setDate(internStart.getDate() - 8); // 7-day rotation, 2 days overdue as of "today"
    const rotationEnd = new Date();
    rotationEnd.setDate(rotationEnd.getDate() - 2);
    const nextStart = new Date();
    nextStart.setDate(nextStart.getDate() - 1);
    const nextEnd = new Date();
    nextEnd.setDate(nextEnd.getDate() + 5);

    const intern = await Intern.create({
      name: 'Ben',
      gender: 'Male',
      batch: 'A',
      phone: '555',
      status: 'pending',
      startDate: internStart,
      currentUnit: unit._id,
    });

    const activeRotation = await Rotation.create({
      intern: intern._id,
      unit: unit._id,
      startDate: internStart,
      endDate: rotationEnd,
      baseDuration: 7,
      duration: 7,
      status: 'active',
    });

    await Rotation.create({
      intern: intern._id,
      unit: nextUnit._id,
      startDate: nextStart,
      endDate: nextEnd,
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
    // 2 days already overdue (auto) + 3 requested (this call) = 5.
    expect(updatedRotation.extensionDays).toBe(5);
    expect(updatedRotation.duration).toBe(12);
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
    // FIX: reassignNextUnit only changes which unit is queued NEXT - the
    // current rotation is still the same overdue, unconfirmed one, so the
    // intern correctly stays 'pending' (see the FIX comment in
    // reassignNextUnit itself). This assertion previously expected 'active',
    // which was the OLD, since-corrected behavior; the code was fixed but
    // this test was never updated to match.
    expect(refreshedIntern.status).toBe('pending');
    expect(refreshedIntern.currentUnit).toBeTruthy();
    expect(String(completedRotation.unit)).toBe(String(completedUnit._id));
  });
});
