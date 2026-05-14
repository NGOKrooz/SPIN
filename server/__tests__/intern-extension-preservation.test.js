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

  it('auto-extends overdue active rotations when a next movement is awaiting confirmation', async () => {
    const unit = await Unit.create({
      name: 'Overdue Unit',
      order: 1,
      durationDays: 20,
      capacity: 5,
    });

    const nextUnit = await Unit.create({
      name: 'Next Unit',
      order: 2,
      durationDays: 20,
      capacity: 5,
    });

    const today = new Date();
    const activeStart = new Date(today);
    activeStart.setDate(activeStart.getDate() - 21);
    activeStart.setHours(0, 0, 0, 0);

    const activeEnd = new Date(activeStart);
    activeEnd.setDate(activeStart.getDate() + 19);
    activeEnd.setHours(0, 0, 0, 0);

    const intern = await Intern.create({
      name: 'Overdue Intern',
      gender: 'Male',
      batch: 'A',
      startDate: activeStart,
      status: 'active',
      currentUnit: unit._id,
      totalExtensionDays: 0,
      extensionDays: 0,
    });

    const activeRotation = await Rotation.create({
      intern: intern._id,
      unit: unit._id,
      startDate: activeStart,
      endDate: activeEnd,
      baseDuration: 20,
      extensionDays: 0,
      duration: 20,
      status: 'active',
    });

    const awaitingStart = new Date(activeEnd);
    awaitingStart.setDate(awaitingStart.getDate() + 1);
    awaitingStart.setHours(0, 0, 0, 0);

    const awaitingEnd = new Date(awaitingStart);
    awaitingEnd.setDate(awaitingStart.getDate() + 19);
    awaitingEnd.setHours(0, 0, 0, 0);

    const awaitingRotation = await Rotation.create({
      intern: intern._id,
      unit: nextUnit._id,
      startDate: awaitingStart,
      endDate: awaitingEnd,
      baseDuration: 20,
      extensionDays: 0,
      duration: 20,
      status: 'awaiting_confirmation',
    });

    intern.rotationHistory = [activeRotation._id, awaitingRotation._id];
    await intern.save();

    const response = await request(app)
      .get(`/api/interns/${intern._id}`)
      .expect(200);

    expect(response.body.totalExtensionDays).toBe(2);
    expect(response.body.extensionDays).toBe(2);
    expect(response.body.manualExtensionDays).toBe(0);
    expect(response.body.autoExtensionDays).toBe(2);

    const updatedActiveRotation = await Rotation.findById(activeRotation._id).lean();
    expect(updatedActiveRotation).toBeTruthy();
    expect(updatedActiveRotation.autoExtensionDays).toBe(2);
    expect(updatedActiveRotation.manualExtensionDays).toBe(0);
    expect(updatedActiveRotation.extensionDays).toBe(2);

    const expectedExtendedEnd = new Date(activeEnd);
    expectedExtendedEnd.setDate(expectedExtendedEnd.getDate() + 2);
    expect(new Date(updatedActiveRotation.endDate).toDateString()).toBe(expectedExtendedEnd.toDateString());

    const updatedAwaitingRotation = await Rotation.findById(awaitingRotation._id).lean();
    const expectedAwaitingStart = new Date(awaitingStart);
    expectedAwaitingStart.setDate(expectedAwaitingStart.getDate() + 2);
    expect(new Date(updatedAwaitingRotation.startDate).toDateString()).toBe(expectedAwaitingStart.toDateString());
  });

  it('returns full reassignment options excluding only current and completed units', async () => {
    const today = new Date();
    const pastStart = new Date(today);
    pastStart.setDate(today.getDate() - 30);
    const pastEnd = new Date(pastStart);
    pastEnd.setDate(pastStart.getDate() + 19);

    const currentUnit = await Unit.create({
      name: 'Current Unit',
      order: 1,
      durationDays: 20,
      capacity: 5,
    });

    const completedUnit = await Unit.create({
      name: 'Completed Unit',
      order: 2,
      durationDays: 20,
      capacity: 5,
    });

    const candidateA = await Unit.create({
      name: 'Candidate Unit A',
      order: 3,
      durationDays: 20,
      capacity: 5,
    });

    const candidateB = await Unit.create({
      name: 'Candidate Unit B',
      order: 4,
      durationDays: 20,
      capacity: 5,
    });

    const intern = await Intern.create({
      name: 'Reassign Intern',
      gender: 'Female',
      batch: 'B',
      startDate: pastStart,
      status: 'active',
      currentUnit: currentUnit._id,
    });

    await Rotation.create({
      intern: intern._id,
      unit: currentUnit._id,
      startDate: today,
      endDate: new Date(today.getTime() + 19 * 24 * 60 * 60 * 1000),
      baseDuration: 20,
      extensionDays: 0,
      duration: 20,
      status: 'active',
    });

    await Rotation.create({
      intern: intern._id,
      unit: completedUnit._id,
      startDate: pastStart,
      endDate: pastEnd,
      baseDuration: 20,
      extensionDays: 0,
      duration: 20,
      status: 'completed',
    });

    const response = await request(app)
      .get(`/api/interns/${intern._id}/schedule`)
      .expect(200);

    const eligibleIds = (response.body.eligibleUnits || []).map((unit) => unit.name);
    expect(eligibleIds).toContain('Candidate Unit A');
    expect(eligibleIds).toContain('Candidate Unit B');
    expect(eligibleIds).not.toContain('Current Unit');
    expect(eligibleIds).not.toContain('Completed Unit');
    expect(response.body.eligibleUnits).toHaveLength(2);
  });

  it('reduces extension days and shifts future rotations when removing a partial extension', async () => {
    const unit = await Unit.create({
      name: 'Active Unit',
      order: 1,
      durationDays: 20,
      capacity: 5,
    });

    const intern = await Intern.create({
      name: 'Reduction Intern',
      gender: 'Male',
      batch: 'A',
      startDate: new Date(),
      status: 'active',
      currentUnit: unit._id,
      totalExtensionDays: 5,
      extensionDays: 5,
    });

    const today = new Date();
    const activeStart = new Date(today);
    activeStart.setHours(0, 0, 0, 0);
    const activeEnd = new Date(activeStart);
    activeEnd.setDate(activeStart.getDate() + 24);

    const futureUnit = await Unit.create({
      name: 'Future Unit',
      order: 2,
      durationDays: 20,
      capacity: 5,
    });

    const activeRotation = await Rotation.create({
      intern: intern._id,
      unit: unit._id,
      startDate: activeStart,
      endDate: activeEnd,
      baseDuration: 20,
      extensionDays: 5,
      duration: 25,
      status: 'active',
    });

    const futureStart = new Date(activeEnd);
    futureStart.setDate(futureStart.getDate() + 1);
    const futureEnd = new Date(futureStart);
    futureEnd.setDate(futureStart.getDate() + 19);

    const futureRotation = await Rotation.create({
      intern: intern._id,
      unit: futureUnit._id,
      startDate: futureStart,
      endDate: futureEnd,
      baseDuration: 20,
      extensionDays: 0,
      duration: 20,
      status: 'upcoming',
    });

    const response = await request(app)
      .post(`/api/interns/${intern._id}/remove-extension`)
      .send({ remove_days: 3, reason: 'Early completion' })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.removedDays).toBe(3);
    expect(response.body.intern.extensionDays).toBe(2);
    expect(response.body.intern.totalExtensionDays).toBe(2);

    const updatedActiveRotation = await Rotation.findById(activeRotation._id).lean();
    const updatedFutureRotation = await Rotation.findById(futureRotation._id).lean();

    expect(updatedActiveRotation).toBeTruthy();
    expect(updatedActiveRotation.extensionDays).toBe(2);
    expect(updatedActiveRotation.duration).toBe(22);
    expect(new Date(updatedActiveRotation.endDate).toDateString()).toBe(new Date(activeStart.getTime() + 21 * 24 * 60 * 60 * 1000).toDateString());

    expect(updatedFutureRotation).toBeTruthy();
    expect(new Date(updatedFutureRotation.startDate).toDateString()).toBe(new Date(futureStart.getTime() - 3 * 24 * 60 * 60 * 1000).toDateString());
    expect(new Date(updatedFutureRotation.endDate).toDateString()).toBe(new Date(futureEnd.getTime() - 3 * 24 * 60 * 60 * 1000).toDateString());
  });

  it('rejects remove-extension requests larger than available extension', async () => {
    const unit = await Unit.create({
      name: 'Error Unit',
      order: 1,
      durationDays: 20,
      capacity: 5,
    });

    const intern = await Intern.create({
      name: 'Error Intern',
      gender: 'Female',
      batch: 'B',
      startDate: new Date(),
      status: 'active',
      currentUnit: unit._id,
      totalExtensionDays: 2,
      extensionDays: 2,
    });

    const today = new Date();
    const activeStart = new Date(today);
    activeStart.setHours(0, 0, 0, 0);
    const activeEnd = new Date(activeStart);
    activeEnd.setDate(activeStart.getDate() + 21);

    await Rotation.create({
      intern: intern._id,
      unit: unit._id,
      startDate: activeStart,
      endDate: activeEnd,
      baseDuration: 20,
      extensionDays: 2,
      duration: 22,
      status: 'active',
    });

    const response = await request(app)
      .post(`/api/interns/${intern._id}/remove-extension`)
      .send({ remove_days: 5, reason: 'Too many days' })
      .expect(400);

    expect(response.body.error).toMatch(/Cannot remove more days than current extension/);
  });

  it('tracks manual extension separately from auto-extension', async () => {
    const unit = await Unit.create({
      name: 'Manual Extension Unit',
      order: 1,
      durationDays: 20,
      capacity: 5,
    });

    const intern = await Intern.create({
      name: 'Manual Extend Intern',
      gender: 'Male',
      batch: 'A',
      startDate: new Date(),
      status: 'active',
      currentUnit: unit._id,
      manualExtensionDays: 0,
      autoExtensionDays: 0,
      totalExtensionDays: 0,
    });

    const today = new Date();
    const activeStart = new Date(today);
    activeStart.setHours(0, 0, 0, 0);
    const activeEnd = new Date(activeStart);
    activeEnd.setDate(activeStart.getDate() + 19);

    const rotation = await Rotation.create({
      intern: intern._id,
      unit: unit._id,
      startDate: activeStart,
      endDate: activeEnd,
      baseDuration: 20,
      manualExtensionDays: 0,
      autoExtensionDays: 0,
      extensionDays: 0,
      duration: 20,
      status: 'active',
    });

    intern.rotationHistory = [rotation._id];
    await intern.save();

    // Add manual extension
    const response = await request(app)
      .post(`/api/interns/${intern._id}/extend`)
      .send({ days: 3, reason: 'Manual extension for admin approval' })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.intern.manualExtensionDays).toBe(3);
    expect(response.body.intern.autoExtensionDays).toBe(0);
    expect(response.body.intern.totalExtensionDays).toBe(3);

    const updatedRotation = await Rotation.findById(rotation._id).lean();
    expect(updatedRotation.manualExtensionDays).toBe(3);
    expect(updatedRotation.autoExtensionDays).toBe(0);
    expect(updatedRotation.extensionDays).toBe(3);
  });

  it('prioritizes removing auto-extension before manual extension', async () => {
    const unit = await Unit.create({
      name: 'Mixed Extension Unit',
      order: 1,
      durationDays: 20,
      capacity: 5,
    });

    const intern = await Intern.create({
      name: 'Mixed Intern',
      gender: 'Female',
      batch: 'B',
      startDate: new Date(),
      status: 'active',
      currentUnit: unit._id,
      manualExtensionDays: 3,
      autoExtensionDays: 2,
      totalExtensionDays: 5,
    });

    const today = new Date();
    const activeStart = new Date(today);
    activeStart.setHours(0, 0, 0, 0);
    const activeEnd = new Date(activeStart);
    activeEnd.setDate(activeStart.getDate() + 24);

    const rotation = await Rotation.create({
      intern: intern._id,
      unit: unit._id,
      startDate: activeStart,
      endDate: activeEnd,
      baseDuration: 20,
      manualExtensionDays: 3,
      autoExtensionDays: 2,
      extensionDays: 5,
      duration: 25,
      status: 'active',
    });

    intern.rotationHistory = [rotation._id];
    await intern.save();

    // Remove 2 days (should remove all auto first)
    const response = await request(app)
      .post(`/api/interns/${intern._id}/remove-extension`)
      .send({ remove_days: 2, reason: 'Remove auto-extension' })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.removedDays).toBe(2);
    expect(response.body.intern.manualExtensionDays).toBe(3);
    expect(response.body.intern.autoExtensionDays).toBe(0);
    expect(response.body.intern.totalExtensionDays).toBe(3);

    const updatedRotation = await Rotation.findById(rotation._id).lean();
    expect(updatedRotation.manualExtensionDays).toBe(3);
    expect(updatedRotation.autoExtensionDays).toBe(0);
    expect(updatedRotation.extensionDays).toBe(3);
    expect(updatedRotation.duration).toBe(23);
  });

  it('removes manual extension after exhausting auto-extension', async () => {
    const unit = await Unit.create({
      name: 'Residual Extension Unit',
      order: 1,
      durationDays: 20,
      capacity: 5,
    });

    const intern = await Intern.create({
      name: 'Residual Intern',
      gender: 'Male',
      batch: 'A',
      startDate: new Date(),
      status: 'active',
      currentUnit: unit._id,
      manualExtensionDays: 3,
      autoExtensionDays: 2,
      totalExtensionDays: 5,
    });

    const today = new Date();
    const activeStart = new Date(today);
    activeStart.setHours(0, 0, 0, 0);
    const activeEnd = new Date(activeStart);
    activeEnd.setDate(activeStart.getDate() + 24);

    const rotation = await Rotation.create({
      intern: intern._id,
      unit: unit._id,
      startDate: activeStart,
      endDate: activeEnd,
      baseDuration: 20,
      manualExtensionDays: 3,
      autoExtensionDays: 2,
      extensionDays: 5,
      duration: 25,
      status: 'active',
    });

    intern.rotationHistory = [rotation._id];
    await intern.save();

    // Remove 4 days (auto=2, then manual=2)
    const response = await request(app)
      .post(`/api/interns/${intern._id}/remove-extension`)
      .send({ remove_days: 4, reason: 'Remove auto and partial manual' })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.removedDays).toBe(4);
    expect(response.body.intern.manualExtensionDays).toBe(1);
    expect(response.body.intern.autoExtensionDays).toBe(0);
    expect(response.body.intern.totalExtensionDays).toBe(1);

    const updatedRotation = await Rotation.findById(rotation._id).lean();
    expect(updatedRotation.manualExtensionDays).toBe(1);
    expect(updatedRotation.autoExtensionDays).toBe(0);
    expect(updatedRotation.extensionDays).toBe(1);
    expect(updatedRotation.duration).toBe(21);
  });

  it('preserves manual extension through completed rotation transitions', async () => {
    const unit1 = await Unit.create({
      name: 'First Unit',
      order: 1,
      durationDays: 20,
      capacity: 5,
    });

    const unit2 = await Unit.create({
      name: 'Second Unit',
      order: 2,
      durationDays: 20,
      capacity: 5,
    });

    const today = new Date();
    const firstStart = new Date(today);
    firstStart.setDate(today.getDate() - 30);
    firstStart.setHours(0, 0, 0, 0);
    const firstEnd = new Date(firstStart);
    firstEnd.setDate(firstStart.getDate() + 22);

    const intern = await Intern.create({
      name: 'Multi-unit Intern',
      gender: 'Female',
      batch: 'A',
      startDate: firstStart,
      status: 'active',
      currentUnit: unit2._id,
      manualExtensionDays: 3,
      autoExtensionDays: 0,
      totalExtensionDays: 3,
    });

    const firstRotation = await Rotation.create({
      intern: intern._id,
      unit: unit1._id,
      startDate: firstStart,
      endDate: firstEnd,
      baseDuration: 20,
      manualExtensionDays: 3,
      autoExtensionDays: 0,
      extensionDays: 3,
      duration: 23,
      status: 'completed',
    });

    const secondStart = new Date(firstEnd);
    secondStart.setDate(secondStart.getDate() + 1);
    secondStart.setHours(0, 0, 0, 0);
    const secondEnd = new Date(secondStart);
    secondEnd.setDate(secondStart.getDate() + 19);

    const secondRotation = await Rotation.create({
      intern: intern._id,
      unit: unit2._id,
      startDate: secondStart,
      endDate: secondEnd,
      baseDuration: 20,
      manualExtensionDays: 0,
      autoExtensionDays: 0,
      extensionDays: 0,
      duration: 20,
      status: 'active',
    });

    intern.rotationHistory = [firstRotation._id, secondRotation._id];
    await intern.save();

    // Verify first rotation retained manual extension
    const completedRotation = await Rotation.findById(firstRotation._id).lean();
    expect(completedRotation.manualExtensionDays).toBe(3);
    expect(completedRotation.extensionDays).toBe(3);
    expect(completedRotation.status).toBe('completed');

    // Verify second rotation is fresh (no auto)
    const activeRotation = await Rotation.findById(secondRotation._id).lean();
    expect(activeRotation.manualExtensionDays).toBe(0);
    expect(activeRotation.autoExtensionDays).toBe(0);
    expect(activeRotation.extensionDays).toBe(0);
  });

  it('does NOT auto-extend when no awaiting_confirmation rotation exists', async () => {
    const unit = await Unit.create({
      name: 'Orphan Unit',
      order: 1,
      durationDays: 20,
      capacity: 5,
    });

    const today = new Date();
    const overStart = new Date(today);
    overStart.setDate(today.getDate() - 21);
    overStart.setHours(0, 0, 0, 0);

    const overEnd = new Date(overStart);
    overEnd.setDate(overStart.getDate() + 19);
    overEnd.setHours(0, 0, 0, 0);

    const intern = await Intern.create({
      name: 'Orphan Intern',
      gender: 'Male',
      batch: 'B',
      startDate: overStart,
      status: 'active',
      currentUnit: unit._id,
      manualExtensionDays: 0,
      autoExtensionDays: 0,
      totalExtensionDays: 0,
    });

    const orphanRotation = await Rotation.create({
      intern: intern._id,
      unit: unit._id,
      startDate: overStart,
      endDate: overEnd,
      baseDuration: 20,
      manualExtensionDays: 0,
      autoExtensionDays: 0,
      extensionDays: 0,
      duration: 20,
      status: 'active',
    });

    intern.rotationHistory = [orphanRotation._id];
    await intern.save();

    // GET should not auto-extend without awaiting_confirmation
    const response = await request(app)
      .get(`/api/interns/${intern._id}`)
      .expect(200);

    expect(response.body.autoExtensionDays).toBe(0);
    expect(response.body.totalExtensionDays).toBe(0);

    const rotAfter = await Rotation.findById(orphanRotation._id).lean();
    expect(rotAfter.autoExtensionDays).toBe(0);
    expect(rotAfter.extensionDays).toBe(0);
  });
});
