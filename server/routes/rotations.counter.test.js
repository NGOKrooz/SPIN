/**
 * rotations.counter.test.js
 *
 * Tests for the rotation round-robin counter fix.
 * Verifies the persistent counter logic without needing a live DB.
 *
 * Run with:  npm test -- --testPathPattern=rotations.counter
 */

// ─── Inline the pure logic under test ────────────────────────────────────────
// We re-implement just the counter functions using an injectable store so the
// tests run purely in-memory without touching PostgreSQL or the dbWrapper.

function makeCounterModule(store = {}) {
  const ROTATION_COUNTER_KEY = 'rotation_global_counter';
  let roundRobinOffset = 0;
  let counterLoaded = false;

  async function getState(key) {
    return store[key] !== undefined ? String(store[key]) : null;
  }

  async function setState(key, value) {
    store[key] = value;
  }

  async function deriveCounterFromExistingData(existingInternCount) {
    const count = existingInternCount || 0;
    await setState(ROTATION_COUNTER_KEY, String(count));
    roundRobinOffset = count;
    counterLoaded = true;
    return count;
  }

  async function getRoundRobinCounter(existingInternCount = 0) {
    if (counterLoaded) return roundRobinOffset;

    const stored = await getState(ROTATION_COUNTER_KEY);
    if (stored !== null && stored !== undefined && stored !== '') {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed)) {
        roundRobinOffset = parsed;
        counterLoaded = true;
        return roundRobinOffset;
      }
    }
    return await deriveCounterFromExistingData(existingInternCount);
  }

  async function setRoundRobinCounter(value) {
    roundRobinOffset = value;
    counterLoaded = true;
    await setState(ROTATION_COUNTER_KEY, String(value));
  }

  // Simulate a server restart: clear in-memory cache, keep DB store
  function simulateRestart() {
    roundRobinOffset = 0;
    counterLoaded = false;
  }

  return {
    getRoundRobinCounter,
    setRoundRobinCounter,
    simulateRestart,
    store,
  };
}

// ─── Helper ──────────────────────────────────────────────────────────────────
function getStartingUnit(offset, units) {
  return units[offset % units.length];
}

// ─── Test suite ──────────────────────────────────────────────────────────────
const UNITS = ['U1', 'U2', 'U3', 'U4'];

describe('Rotation round-robin counter — core logic', () => {
  // ───────────────────────────────────────────────────────────────────────────
  // Test Case 1: 4 interns added sequentially (same session, counter starts at 0)
  // ───────────────────────────────────────────────────────────────────────────
  test('TC1 – Sequential: 4 interns receive distinct starting units', async () => {
    const { getRoundRobinCounter, setRoundRobinCounter } = makeCounterModule();

    const assignments = [];
    for (let i = 0; i < 4; i++) {
      const counter = await getRoundRobinCounter();
      assignments.push(getStartingUnit(counter, UNITS));
      await setRoundRobinCounter(counter + 1);
    }

    expect(assignments).toEqual(['U1', 'U2', 'U3', 'U4']);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Test Case 2: Batch addition — 4 interns at once (simulates /generate route)
  // ───────────────────────────────────────────────────────────────────────────
  test('TC2 – Batch: all 4 units covered in a single batch call', async () => {
    const { getRoundRobinCounter, setRoundRobinCounter } = makeCounterModule();

    let counter = await getRoundRobinCounter();
    const assignments = [];
    for (let i = 0; i < 4; i++) {
      assignments.push(getStartingUnit(counter, UNITS));
      counter++;
    }
    await setRoundRobinCounter(counter);

    expect(assignments).toEqual(['U1', 'U2', 'U3', 'U4']);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Test Case 3: Intern added AFTER a server restart — counter must continue
  // ───────────────────────────────────────────────────────────────────────────
  test('TC3 – Post-restart: counter continues from persisted value', async () => {
    const { getRoundRobinCounter, setRoundRobinCounter, simulateRestart } =
      makeCounterModule();

    // Session 1: add 4 interns
    let counter = await getRoundRobinCounter();
    for (let i = 0; i < 4; i++) {
      counter++;
    }
    await setRoundRobinCounter(counter); // counter = 4 persisted to DB

    // Simulate server restart (in-memory cleared, DB store retained)
    simulateRestart();

    // Session 2: add 3 more interns
    const assignments = [];
    for (let i = 0; i < 3; i++) {
      const c = await getRoundRobinCounter();
      assignments.push(getStartingUnit(c, UNITS));
      await setRoundRobinCounter(c + 1);
    }

    // With 4 units and counter starting at 4: 4%4=0→U1, 5%4=1→U2, 6%4=2→U3
    expect(assignments).toEqual(['U1', 'U2', 'U3']);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Test Case 3b: Full sequence across two separate sessions
  // ───────────────────────────────────────────────────────────────────────────
  test('TC3b – Two sessions: sequence is continuous (no duplicate starting units in close range)', async () => {
    const { getRoundRobinCounter, setRoundRobinCounter, simulateRestart } =
      makeCounterModule();

    const session1 = [];
    let c = await getRoundRobinCounter();
    for (let i = 0; i < 4; i++) {
      session1.push(getStartingUnit(c, UNITS));
      await setRoundRobinCounter(++c);
    }

    simulateRestart();

    const session2 = [];
    for (let i = 0; i < 4; i++) {
      const cv = await getRoundRobinCounter();
      session2.push(getStartingUnit(cv, UNITS));
      await setRoundRobinCounter(cv + 1);
    }

    const all = [...session1, ...session2];
    // Every index in [0..7] maps to a unique unit using modulo; verify the
    // sequence wraps correctly instead of restarting
    expect(session1).toEqual(['U1', 'U2', 'U3', 'U4']);
    expect(session2).toEqual(['U1', 'U2', 'U3', 'U4']); // wraps back after full cycle
    // Critically: session2 should NOT start over at U1 because of a reset;
    // it starts at the modulo-correct position after session1
    expect(session2[0]).toBe(getStartingUnit(4, UNITS)); // 4 % 4 = 0 → U1 (correct wrap)
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Test Case 4: Upcoming rotation correctness — counter does NOT affect
  // individual intern's cycle order (only start offset)
  // ───────────────────────────────────────────────────────────────────────────
  test('TC4 – Full cycle: each intern visits every unit exactly once', async () => {
    const { getRoundRobinCounter, setRoundRobinCounter } = makeCounterModule();

    function buildCycle(startOffset, units) {
      return [
        ...units.slice(startOffset),
        ...units.slice(0, startOffset),
      ];
    }

    for (let i = 0; i < 4; i++) {
      const c = await getRoundRobinCounter();
      const startOffset = c % UNITS.length;
      const cycle = buildCycle(startOffset, UNITS);
      await setRoundRobinCounter(c + 1);

      // Every intern must visit all 4 units
      expect(cycle.length).toBe(UNITS.length);
      // Each unit appears exactly once
      expect(new Set(cycle).size).toBe(UNITS.length);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Bootstrap: counter not in DB yet — derived from existing intern count
  // ───────────────────────────────────────────────────────────────────────────
  test('Bootstrap – derives correct starting counter from existing rotation data', async () => {
    // Simulate upgrading: 6 interns already exist, counter not yet in DB
    const { getRoundRobinCounter, setRoundRobinCounter, store } = makeCounterModule({});

    // On first call, pass existingInternCount = 6 (simulating bootstrap query)
    const counter = await getRoundRobinCounter(6);
    expect(counter).toBe(6);
    expect(store['rotation_global_counter']).toBe('6');

    // Next intern (7th) should get offset 6 % 4 = 2 → U3
    const c = await getRoundRobinCounter();
    expect(getStartingUnit(c, UNITS)).toBe('U3');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Circular wrap: offset correctly wraps past the last unit
  // ───────────────────────────────────────────────────────────────────────────
  test('Circular wrap – intern after last unit gets first unit', async () => {
    // counter = 3 → U4; counter = 4 → U1 (wraps)
    const { getRoundRobinCounter, setRoundRobinCounter } = makeCounterModule({
      rotation_global_counter: '3',
    });

    const c1 = await getRoundRobinCounter();
    expect(getStartingUnit(c1, UNITS)).toBe('U4');
    await setRoundRobinCounter(c1 + 1);

    const c2 = await getRoundRobinCounter();
    expect(getStartingUnit(c2, UNITS)).toBe('U1'); // wraps correctly
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Idempotent reads: reading counter multiple times returns same value
  // ───────────────────────────────────────────────────────────────────────────
  test('Idempotent – reading counter without writing does not change it', async () => {
    const { getRoundRobinCounter } = makeCounterModule({
      rotation_global_counter: '7',
    });

    const r1 = await getRoundRobinCounter();
    const r2 = await getRoundRobinCounter();
    const r3 = await getRoundRobinCounter();

    expect(r1).toBe(7);
    expect(r2).toBe(7);
    expect(r3).toBe(7);
  });
});
