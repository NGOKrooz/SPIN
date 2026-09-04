const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Intern = require('../models/Intern');
const Rotation = require('../models/Rotation');
const Unit = require('../models/Unit');
const {
  selectBestUnit,
  computeUnitNeedSnapshot,
  assignFirstUnit,
  getEligibleUnits,
} = require('../services/dynamicAssignmentService');

jest.setTimeout(120000);

async function makeUnit(name, order, durationDays = 20) {
  return Unit.create({ name, order, durationDays });
}

async function makeActiveRotation(internId, unitId, startDaysAgo, durationDays = 20, extra = {}) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - startDaysAgo);
  const end = new Date(start);
  end.setDate(end.getDate() + durationDays - 1);
  return Rotation.create({
    intern: internId,
    unit: unitId,
    startDate: start,
    endDate: end,
    baseDuration: durationDays,
    duration: durationDays,
    extensionDays: 0,
    status: 'active',
    ...extra,
  });
}

async function makeIntern(name, batch = 'A') {
  return Intern.create({ name, gender: 'Male', batch, status: 'active', startDate: new Date() });
}

describe('dynamic need-and-balance scheduling', () => {
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterEach(async () => {
    await mongoose.connection.dropDatabase();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('never repeatedly picks the same unit just because it sorts first by id/array order', async () => {
    // Five units, all equally empty - repeated selection should NOT always
    // land on unit A just because it's first in the array.
    const units = [];
    for (let i = 0; i < 5; i += 1) {
      units.push(await makeUnit(`Unit ${i}`, i));
    }

    const picks = new Set();
    for (let i = 0; i < 40; i += 1) {
      const chosen = await selectBestUnit(units);
      picks.add(String(chosen._id));
    }

    // With 40 draws across 5 equally-empty units and real randomization,
    // it would be astronomically unlikely to only ever see one unit.
    expect(picks.size).toBeGreaterThan(1);
  });

  it('prioritizes a completely empty unit over units that already have interns', async () => {
    const empty = await makeUnit('Empty Unit', 0);
    const occupiedA = await makeUnit('Occupied A', 1);
    const occupiedB = await makeUnit('Occupied B', 2);

    const i1 = await makeIntern('One');
    const i2 = await makeIntern('Two');
    await makeActiveRotation(i1._id, occupiedA._id, 2);
    await makeActiveRotation(i2._id, occupiedB._id, 2);

    for (let i = 0; i < 10; i += 1) {
      const chosen = await selectBestUnit([empty, occupiedA, occupiedB]);
      expect(String(chosen._id)).toBe(String(empty._id));
    }
  });

  it('computes capacity as a dynamic target (interns / units), not a hardcoded number', async () => {
    const units = [];
    for (let i = 0; i < 5; i += 1) {
      units.push(await makeUnit(`Unit ${i}`, i));
    }
    // 20 interns spread evenly across 5 units -> target should be exactly 4,
    // NOT a hardcoded MAX_CAPACITY value like 4 or 5 regardless of population.
    for (let u = 0; u < 5; u += 1) {
      for (let n = 0; n < 4; n += 1) {
        const intern = await makeIntern(`Intern-${u}-${n}`);
        await makeActiveRotation(intern._id, units[u]._id, 2);
      }
    }
    const snapshot = await computeUnitNeedSnapshot(units);
    expect(snapshot.target).toBe(4);

    // Now change the population to 10 interns / 5 units -> target should
    // recompute to 2, proving it's derived from live data each call, not a
    // fixed constant.
    await Rotation.deleteMany({});
    for (let u = 0; u < 5; u += 1) {
      for (let n = 0; n < 2; n += 1) {
        const intern = await makeIntern(`Intern2-${u}-${n}`);
        await makeActiveRotation(intern._id, units[u]._id, 2);
      }
    }
    const snapshot2 = await computeUnitNeedSnapshot(units);
    expect(snapshot2.target).toBe(2);
  });

  it('distributes interns as evenly as possible when assigned one at a time (no repeated round-robin, no pile-up)', async () => {
    const units = [];
    for (let i = 0; i < 5; i += 1) {
      units.push(await makeUnit(`Unit ${i}`, i));
    }

    // Simulate 17 interns each getting their first unit assignment in turn.
    // Ideal distribution for 17/5 is 4,4,3,3,3 - never 4,4,4,4,1 and never a
    // fixed unit-1,2,3,4,5,1,2,3... cycle regardless of actual load.
    for (let n = 0; n < 17; n += 1) {
      const intern = await makeIntern(`Seq-${n}`);
      const { unit } = await assignFirstUnit(intern, units);
      await Rotation.updateOne(
        { intern: intern._id, unit: unit._id },
        { $set: { startDate: new Date(new Date().setDate(new Date().getDate() - 2)) } }
      );
    }

    const occupancy = new Map();
    const rotations = await Rotation.find({ status: 'active' }).exec();
    for (const r of rotations) {
      const id = String(r.unit);
      occupancy.set(id, (occupancy.get(id) || 0) + 1);
    }

    const counts = units.map((u) => occupancy.get(String(u._id)) || 0).sort((a, b) => b - a);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(17);
    // Max-min spread of at most 1 - true even balancing, not a fixed
    // 4,4,4,4,1 pile-up pattern.
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it('treats an interns-leaving-soon unit as having anticipated vacancy, not permanently full', async () => {
    const leavingSoonUnit = await makeUnit('Leaving Soon Unit', 0);
    const steadyUnit = await makeUnit('Steady Unit', 1);

    const i1 = await makeIntern('LeavingPerson');
    // Rotation ends in 2 days (within the 5-day leaving-soon window).
    const start = new Date();
    start.setDate(start.getDate() - 18);
    const rotation = await Rotation.create({
      intern: i1._id,
      unit: leavingSoonUnit._id,
      startDate: start,
      endDate: new Date(new Date().setDate(new Date().getDate() + 2)),
      baseDuration: 20,
      duration: 20,
      extensionDays: 0,
      status: 'active',
    });
    expect(rotation.status).toBe('active');

    const i2 = await makeIntern('SteadyPerson');
    await makeActiveRotation(i2._id, steadyUnit._id, 2);

    const snapshot = await computeUnitNeedSnapshot([leavingSoonUnit, steadyUnit]);
    const leavingSoonLoad = snapshot.effectiveLoad.get(String(leavingSoonUnit._id));
    const steadyLoad = snapshot.effectiveLoad.get(String(steadyUnit._id));

    // Both units have 1 occupant, but the leaving-soon one's effective load
    // should be lower (anticipated vacancy), making it the preferred pick.
    expect(leavingSoonLoad).toBeLessThan(steadyLoad);

    const chosen = await selectBestUnit([leavingSoonUnit, steadyUnit]);
    expect(String(chosen._id)).toBe(String(leavingSoonUnit._id));
  });

  it('only offers each intern units still in their remaining/uncompleted set', async () => {
    const unitA = await makeUnit('A', 0);
    const unitB = await makeUnit('B', 1);
    const unitC = await makeUnit('C', 2);

    const intern = await makeIntern('Grad');
    // Completed A already.
    await Rotation.create({
      intern: intern._id,
      unit: unitA._id,
      startDate: new Date(new Date().setDate(new Date().getDate() - 40)),
      endDate: new Date(new Date().setDate(new Date().getDate() - 21)),
      baseDuration: 20,
      duration: 20,
      extensionDays: 0,
      status: 'completed',
    });

    const completedIds = new Set([String(unitA._id)]);
    for (let i = 0; i < 10; i += 1) {
      const chosen = await selectBestUnit([unitA, unitB, unitC], new Date(), completedIds);
      expect(String(chosen._id)).not.toBe(String(unitA._id));
    }

    const eligible = await getEligibleUnits(intern._id, null);
    const eligibleIds = eligible.map((u) => u.id);
    expect(eligibleIds).not.toContain(String(unitA._id));
    expect(eligibleIds).toContain(String(unitB._id));
    expect(eligibleIds).toContain(String(unitC._id));
  });

  it('randomizes among equally-suitable units instead of always returning the same one', async () => {
    const units = [];
    for (let i = 0; i < 4; i += 1) {
      units.push(await makeUnit(`Tied-${i}`, i));
    }
    // All four units get exactly one occupant each - perfectly tied.
    for (let i = 0; i < 4; i += 1) {
      const intern = await makeIntern(`Occupant-${i}`);
      await makeActiveRotation(intern._id, units[i]._id, 2);
    }

    const picks = new Set();
    for (let i = 0; i < 40; i += 1) {
      const chosen = await selectBestUnit(units);
      picks.add(String(chosen._id));
    }
    expect(picks.size).toBeGreaterThan(1);
  });

  it('does NOT hard-block manual reassignment eligibility just because a unit is at/above the dynamic target', async () => {
    const heavyUnit = await makeUnit('Heavy', 0);
    const lightUnit = await makeUnit('Light', 1);

    // Load heavyUnit well past any reasonable target.
    for (let i = 0; i < 8; i += 1) {
      const intern = await makeIntern(`Heavy-${i}`);
      await makeActiveRotation(intern._id, heavyUnit._id, 2);
    }

    const intern = await makeIntern('Reassignee');
    const eligible = await getEligibleUnits(intern._id, null);
    const eligibleIds = eligible.map((u) => u.id);

    // The heavily-loaded unit must still appear as a valid candidate - never
    // hard-excluded - so an administrator can deliberately choose it.
    expect(eligibleIds).toContain(String(heavyUnit._id));
    expect(eligibleIds).toContain(String(lightUnit._id));
    // But it should sort AFTER the lighter unit (preference, not exclusion).
    expect(eligibleIds.indexOf(String(lightUnit._id))).toBeLessThan(eligibleIds.indexOf(String(heavyUnit._id)));
  });

  it('assigning a new intern favors the empty/underfilled unit, not simply the lowest-id unit', async () => {
    const first = await makeUnit('First By Order', 0);
    const second = await makeUnit('Second By Order', 1);

    // Load up the first unit so it's clearly not the best choice, while the
    // second (numerically/order-later) unit is empty.
    for (let i = 0; i < 3; i += 1) {
      const intern = await makeIntern(`Filler-${i}`);
      await makeActiveRotation(intern._id, first._id, 2);
    }

    const newIntern = await makeIntern('NewArrival');
    const { unit } = await assignFirstUnit(newIntern, [first, second]);

    expect(String(unit._id)).toBe(String(second._id));
  });
});
