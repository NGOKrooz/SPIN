const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { getSpinCountsByIntern } = require('../services/spinService');

const Intern = require('../models/Intern');
const Unit = require('../models/Unit');
const Rotation = require('../models/Rotation');

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

describe('getSpinCountsByIntern', () => {
  let unit1, unit2, unit3;

  beforeEach(async () => {
    // Create test units
    unit1 = await Unit.create({ name: 'Unit 1', order: 1, capacity: 2, durationDays: 20 });
    unit2 = await Unit.create({ name: 'Unit 2', order: 2, capacity: 2, durationDays: 20 });
    unit3 = await Unit.create({ name: 'Unit 3', order: 3, capacity: 2, durationDays: 20 });
  });

  test('returns correct spin counts for interns with completed rotations', async () => {
    // Create interns
    const intern1 = await Intern.create({
      name: 'Intern A',
      gender: 'Male',
      batch: 'A',
      startDate: new Date('2026-01-01'),
    });

    const intern2 = await Intern.create({
      name: 'Intern B',
      gender: 'Female',
      batch: 'B',
      startDate: new Date('2026-01-02'),
    });

    const intern3 = await Intern.create({
      name: 'Intern C',
      gender: 'Male',
      batch: 'A',
      startDate: new Date('2026-01-03'),
    });

    // Create completed rotations for intern1 (2 spins)
    await Rotation.create({
      intern: intern1._id,
      unit: unit1._id,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-01-21'),
      status: 'completed',
    });

    await Rotation.create({
      intern: intern1._id,
      unit: unit2._id,
      startDate: new Date('2026-01-22'),
      endDate: new Date('2026-02-11'),
      status: 'completed',
    });

    // Create completed rotations for intern2 (1 spin)
    await Rotation.create({
      intern: intern2._id,
      unit: unit1._id,
      startDate: new Date('2026-01-02'),
      endDate: new Date('2026-01-22'),
      status: 'completed',
    });

    // intern3 has no completed rotations (0 spins)

    // Create some active rotations (should not count)
    await Rotation.create({
      intern: intern1._id,
      unit: unit3._id,
      startDate: new Date('2026-02-12'),
      status: 'active',
    });

    const result = await getSpinCountsByIntern();

    expect(result.totalSpins).toBe(3); // 2 + 1 + 0

    expect(result.internSpins).toHaveLength(3);

    // Check interns are sorted by creation date
    expect(result.internSpins[0].intern.name).toBe('Intern A');
    expect(result.internSpins[0].count).toBe(2);

    expect(result.internSpins[1].intern.name).toBe('Intern B');
    expect(result.internSpins[1].count).toBe(1);

    expect(result.internSpins[2].intern.name).toBe('Intern C');
    expect(result.internSpins[2].count).toBe(0);
  });

  test('returns empty result when no interns exist', async () => {
    const result = await getSpinCountsByIntern();

    expect(result.totalSpins).toBe(0);
    expect(result.internSpins).toEqual([]);
  });
});