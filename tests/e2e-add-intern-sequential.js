'use strict';

require('../server/node_modules/dotenv').config();

const mongoose = require('../server/node_modules/mongoose');
const Intern = require('../server/models/Intern');
const Rotation = require('../server/models/Rotation');
const Unit = require('../server/models/Unit');
const {
  sortUnitsByOrder,
  recalculateEndDate,
  startOfDay,
  addDays,
  getUnitDuration,
} = require('../server/services/rotationPlanService');

const API_BASE = 'http://localhost:5000/api';
const TEST_PREFIX = 'E2E RR';
const TEST_TOTAL = 20;
const TODAY = new Date().toISOString().slice(0, 10);

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const apiJson = async (path, options = {}) => {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${JSON.stringify(body)}`);
  }
  return body;
};

const cleanupExistingTestInterns = async () => {
  const interns = await Intern.find({ name: new RegExp(`^${TEST_PREFIX}`) }).select('_id name').lean();
  for (const intern of interns) {
    await Rotation.deleteMany({ intern: intern._id }).exec();
    await Intern.deleteOne({ _id: intern._id }).exec();
  }
  return interns.length;
};

const verifyTimeline = async (internId, orderedUnits) => {
  const rotations = await Rotation.find({ intern: internId }).populate('unit').sort({ startDate: 1, createdAt: 1 }).lean();
  assert(rotations.length === orderedUnits.length, `Expected ${orderedUnits.length} rotations, got ${rotations.length}`);

  for (let index = 0; index < rotations.length; index += 1) {
    const rotation = rotations[index];
    const duration = getUnitDuration(rotation.unit);
    const expectedEndDate = startOfDay(recalculateEndDate(rotation.startDate, duration)).toISOString().slice(0, 10);
    const actualEndDate = startOfDay(rotation.endDate).toISOString().slice(0, 10);
    assert(actualEndDate === expectedEndDate, `Rotation ${index + 1} endDate mismatch: expected ${expectedEndDate}, got ${actualEndDate}`);

    if (index > 0) {
      const prevEnd = startOfDay(rotations[index - 1].endDate);
      const expectedStart = startOfDay(addDays(prevEnd, 1)).toISOString().slice(0, 10);
      const actualStart = startOfDay(rotation.startDate).toISOString().slice(0, 10);
      assert(actualStart === expectedStart, `Rotation ${index + 1} startDate mismatch: expected ${expectedStart}, got ${actualStart}`);
    }
  }

  const activeRotations = rotations.filter((rotation) => rotation.status === 'active');
  assert(activeRotations.length === 1, `Expected exactly 1 active rotation, got ${activeRotations.length}`);

  return rotations;
};

const main = async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    retryWrites: true,
    w: 'majority',
  });

  let currentStep = 'initialization';

  const cleaned = await cleanupExistingTestInterns();
  console.log(`Cleaned ${cleaned} leftover test interns`);

  const orderedUnits = sortUnitsByOrder(await Unit.find({}).lean());
  assert(orderedUnits.length > 0, 'No units configured');

  const baselineAssignedCount = await Intern.countDocuments({ rotationHistory: { $exists: true, $ne: [] } }).exec();
  console.log(`Units in order (${orderedUnits.length}): ${orderedUnits.map((unit, index) => `${index}:${unit.name}[order=${unit.order}]`).join(' | ')}`);
  console.log(`Baseline assigned intern count: ${baselineAssignedCount}`);

  const createdInternIds = [];
  const createdSummaries = [];

  try {
    for (let index = 0; index < TEST_TOTAL; index += 1) {
      currentStep = `create ${index + 1}`;
      const expectedUnitIndex = (baselineAssignedCount + index) % orderedUnits.length;
      const expectedFirstUnit = orderedUnits[expectedUnitIndex];
      const name = `${TEST_PREFIX} ${String(index + 1).padStart(2, '0')}`;

      const created = await apiJson('/interns', {
        method: 'POST',
        body: JSON.stringify({
          name,
          gender: index % 2 === 0 ? 'Male' : 'Female',
          batch: index % 2 === 0 ? 'A' : 'B',
          startDate: TODAY,
          phone: '',
        }),
      });

      createdInternIds.push(created.id || created._id);

      const persistedIntern = await Intern.findById(created.id || created._id).populate('currentUnit').lean();
      assert(persistedIntern, `Intern not found after create: ${name}`);
      assert(persistedIntern.currentUnit, `currentUnit was not assigned for ${name}`);
      assert(String(persistedIntern.currentUnit._id) === String(expectedFirstUnit._id), `${name} assigned ${persistedIntern.currentUnit.name}, expected ${expectedFirstUnit.name}`);

      const rotations = await verifyTimeline(persistedIntern._id, orderedUnits);
      const upcomingUnitNames = rotations.slice(1, 4).map((rotation) => rotation.unit.name).join(', ');

      createdSummaries.push({
        name,
        expectedFirstUnit: expectedFirstUnit.name,
        actualFirstUnit: persistedIntern.currentUnit.name,
        upcomingPreview: upcomingUnitNames,
      });

      console.log(`${name} -> ${persistedIntern.currentUnit.name} | expected=${expectedFirstUnit.name} | upcoming=[${upcomingUnitNames}]`);
    }

    const uniqueUpcomingPreviews = new Set(createdSummaries.map((item) => item.upcomingPreview));
    currentStep = 'final uniqueness check';
    console.log(`Unique upcoming previews among 20 interns: ${uniqueUpcomingPreviews.size}/${createdSummaries.length}`);
    assert(uniqueUpcomingPreviews.size > 1, 'Upcoming units did not vary across created interns');

    console.log('All sequential create tests passed');
  } catch (error) {
    error.step = currentStep;
    throw error;
  } finally {
    if (createdInternIds.length > 0) {
      await Rotation.deleteMany({ intern: { $in: createdInternIds } }).exec();
      await Intern.deleteMany({ _id: { $in: createdInternIds } }).exec();
      console.log(`Cleaned up ${createdInternIds.length} created test interns`);
    }
    await mongoose.disconnect();
  }
};

main().catch((error) => {
  console.error(`Test failed during step: ${error?.step || 'unknown'}`);
  console.error(error);
  process.exit(1);
});
