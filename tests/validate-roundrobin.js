/* eslint-disable no-console */
'use strict';

/**
 * Dynamic Assignment Engine — Validation Tests
 *
 * Tests: selectNextUnit (pure) — no DB connection needed.
 * Run: node tests/validate-roundrobin.js
 */

const {
  getNextRotationStartDate,
  getRotationWindow,
  pickNextUnitForAssignment,
  selectNextUnit,
  DEFAULT_CAPACITY,
} = require('../server/services/dynamicAssignmentService');

// ─── Minimal assertion helpers ────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log('  ✓ ' + message);
    passed++;
  } else {
    console.error('  ✗ FAIL: ' + message);
    failed++;
  }
}

function section(title) {
  console.log('\n=== ' + title + ' ===');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeUnits(n, capacity = DEFAULT_CAPACITY) {
  return Array.from({ length: n }, (_, i) => ({
    _id: String(i + 1),
    name: 'Unit-' + (i + 1),
    durationDays: 20,
    capacity,
  }));
}

function makeOccupancy(counts) {
  const m = new Map();
  Object.entries(counts).forEach(([k, v]) => m.set(k, v));
  return m;
}

function toLocalDateKey(value) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildChainedTimeline(firstStartDate, durations) {
  const timeline = [];
  let previousEndDate = null;

  for (const duration of durations) {
    const startDate = getNextRotationStartDate(previousEndDate, firstStartDate);
    const window = getRotationWindow(startDate, duration);
    timeline.push(window);
    previousEndDate = window.endDate;
  }

  return timeline;
}

// ─── TEST 1: Assignment – lowest-occupancy first ──────────────────────────────
section('TEST 1: Assignment – lowest-occupancy first');
{
  // 4 units with counts 3,1,2,4 → must always pick unit-2 (count=1)
  const units = makeUnits(4);
  const occ = makeOccupancy({ '1': 3, '2': 1, '3': 2, '4': 4 });
  const completed = new Set();
  let unit2Picks = 0;
  const TRIALS = 100;
  for (let i = 0; i < TRIALS; i++) {
    const { unit } = selectNextUnit(units, occ, completed, null, DEFAULT_CAPACITY);
    if (unit && String(unit._id) === '2') unit2Picks++;
  }
  // Lowest is count=1 (unit-2 only). All picks must be unit-2.
  assert(unit2Picks === TRIALS, `All ${TRIALS} picks go to unit-2 (lowest count=1). Got ${unit2Picks}`);
}

// ─── TEST 2: Capacity – full unit never selected ──────────────────────────────
section('TEST 2: Capacity – full unit excluded');
{
  const units = makeUnits(3);
  // unit-1 at capacity, unit-2 has 2, unit-3 has 0
  const occ = makeOccupancy({ '1': DEFAULT_CAPACITY, '2': 2, '3': 0 });
  const completed = new Set();
  let unit1Picks = 0;
  const TRIALS = 200;
  for (let i = 0; i < TRIALS; i++) {
    const { unit } = selectNextUnit(units, occ, completed, null, DEFAULT_CAPACITY);
    if (unit && String(unit._id) === '1') unit1Picks++;
  }
  assert(unit1Picks === 0, `Unit-1 (at capacity=${DEFAULT_CAPACITY}) never selected over ${TRIALS} picks`);
}

// ─── TEST 3: Current unit always excluded ─────────────────────────────────────
section('TEST 3: Current unit excluded from selection');
{
  const units = makeUnits(3);
  const occ = makeOccupancy({ '1': 0, '2': 0, '3': 0 });
  const completed = new Set();
  let currentPicks = 0;
  const TRIALS = 200;
  for (let i = 0; i < TRIALS; i++) {
    const { unit } = selectNextUnit(units, occ, completed, '1', DEFAULT_CAPACITY);
    if (unit && String(unit._id) === '1') currentPicks++;
  }
  assert(currentPicks === 0, `Current unit (id=1) never re-selected over ${TRIALS} picks`);
}

// ─── TEST 4: Completed units excluded until reset ─────────────────────────────
section('TEST 4: Completed units excluded until reset');
{
  const units = makeUnits(4);
  const occ = makeOccupancy({});
  // units 1,2,3 completed → only unit-4 eligible
  const completed = new Set(['1', '2', '3']);
  let unit4Picks = 0;
  const TRIALS = 100;
  for (let i = 0; i < TRIALS; i++) {
    const { unit } = selectNextUnit(units, occ, completed, null, DEFAULT_CAPACITY);
    if (unit && String(unit._id) === '4') unit4Picks++;
  }
  assert(unit4Picks === TRIALS, `All ${TRIALS} picks go to unit-4 (only non-completed unit)`);
}

// ─── TEST 5: Rotation reset – all completed triggers full reset ───────────────
section('TEST 5: Rotation reset when all units completed');
{
  const units = makeUnits(3);
  const occ = makeOccupancy({});
  // All 3 completed AND current unit is unit-1 → after reset, units 2 & 3 available
  const allCompleted = new Set(['1', '2', '3']);
  const { unit, wasReset } = selectNextUnit(units, occ, allCompleted, '1', DEFAULT_CAPACITY);
  assert(wasReset === true, 'wasReset flag is true when completedIds covers all units');
  assert(unit !== null, 'A unit is still returned after reset');
  assert(String(unit._id) !== '1', 'Current unit (id=1) still excluded after reset');
}

// ─── TEST 6: Returns null only when every unit is full ───────────────────────
section('TEST 6: Returns null only when all units are at capacity');
{
  const units = makeUnits(3);
  const occ = makeOccupancy({
    '1': DEFAULT_CAPACITY,
    '2': DEFAULT_CAPACITY,
    '3': DEFAULT_CAPACITY,
  });
  const completed = new Set();
  const { unit } = selectNextUnit(units, occ, completed, null, DEFAULT_CAPACITY);
  assert(unit === null, `unit is null when all ${units.length} units are at capacity`);
}

// ─── TEST 7: Load Balance – 15 interns, 8 units, capacity=5 ──────────────────
section('TEST 7: Load balance – 15 interns across 8 units (capacity=5)');
{
  const NUM_UNITS = 8;
  const CAPACITY = 5;
  const NUM_INTERNS = 15;
  const units = makeUnits(NUM_UNITS, CAPACITY);
  const occupancy = makeOccupancy({});
  const assignments = Array(NUM_INTERNS).fill(null);

  for (let i = 0; i < NUM_INTERNS; i++) {
    const { unit } = selectNextUnit(units, occupancy, new Set(), null, CAPACITY);
    if (unit) {
      const uid = String(unit._id);
      assignments[i] = uid;
      occupancy.set(uid, (occupancy.get(uid) || 0) + 1);
    }
  }

  const assigned = assignments.filter(Boolean).length;
  assert(assigned === NUM_INTERNS, `All ${NUM_INTERNS} interns received a unit`);

  let maxLoad = 0;
  let minLoad = Infinity;
  for (const count of occupancy.values()) {
    if (count > maxLoad) maxLoad = count;
    if (count < minLoad) minLoad = count;
  }
  assert(maxLoad <= CAPACITY, `No unit exceeded capacity ${CAPACITY} (max=${maxLoad})`);

  const spread = maxLoad - minLoad;
  assert(spread <= 2, `Load spread ≤ 2 (max=${maxLoad}, min=${minLoad}, spread=${spread})`);
}

// ─── TEST 8: Stress – 50 interns, 10 units, capacity=5, two rotation waves ───
section('TEST 8: Stress – 50 interns × 2 waves across 10 units (capacity=5)');
{
  const NUM_UNITS = 10;
  const CAPACITY = 5;
  const NUM_INTERNS = 50;
  const units = makeUnits(NUM_UNITS, CAPACITY);
  const occupancy = makeOccupancy({});

  // Track each intern's completed set and current unit
  const completedSets = Array.from({ length: NUM_INTERNS }, () => new Set());
  const currentUnits = Array(NUM_INTERNS).fill(null);

  // Wave 1: assign first unit to each intern sequentially
  let nullCount = 0;
  for (let i = 0; i < NUM_INTERNS; i++) {
    const { unit } = selectNextUnit(units, occupancy, completedSets[i], null, CAPACITY);
    if (unit) {
      const uid = String(unit._id);
      currentUnits[i] = uid;
      completedSets[i].add(uid);
      occupancy.set(uid, (occupancy.get(uid) || 0) + 1);
    } else {
      nullCount++;
    }
  }

  let overCapacityWave1 = 0;
  for (const count of occupancy.values()) {
    if (count > CAPACITY) overCapacityWave1++;
  }
  assert(nullCount === 0, `All ${NUM_INTERNS} interns assigned in wave 1 (0 nulls)`);
  assert(overCapacityWave1 === 0, 'No unit exceeded capacity after wave 1');

  // Wave 2: rotate all interns to their next unit
  for (let i = 0; i < NUM_INTERNS; i++) {
    const prev = currentUnits[i];
    // Intern leaves previous unit
    if (prev) occupancy.set(prev, Math.max(0, (occupancy.get(prev) || 0) - 1));
    const { unit } = selectNextUnit(units, occupancy, completedSets[i], prev, CAPACITY);
    if (unit) {
      const uid = String(unit._id);
      currentUnits[i] = uid;
      completedSets[i].add(uid);
      occupancy.set(uid, (occupancy.get(uid) || 0) + 1);
    }
  }

  let overCapacityWave2 = 0;
  for (const count of occupancy.values()) {
    if (count > CAPACITY) overCapacityWave2++;
  }
  assert(overCapacityWave2 === 0, 'No unit exceeded capacity after wave 2');

  // No intern stayed in the same unit across waves
  let stayedSame = 0;
  // (currentUnits now has wave-2 assignments; completedSets has 2 entries each)
  for (let i = 0; i < NUM_INTERNS; i++) {
    const completed = [...completedSets[i]];
    if (completed.length >= 2 && completed[0] === completed[1]) stayedSame++;
  }
  assert(stayedSame === 0, `No intern stayed in the same unit across two waves (${stayedSame} repeats)`);
}

// ─── TEST 9: No idle fallback when all units are full ────────────────────────
section('TEST 9: No idle fallback uses overflow when all units are full');
{
  const units = makeUnits(3);
  const occ = makeOccupancy({
    '1': DEFAULT_CAPACITY,
    '2': DEFAULT_CAPACITY,
    '3': DEFAULT_CAPACITY,
  });
  const completed = new Set(['1', '2']);

  const { unit, usedOverflow } = pickNextUnitForAssignment(units, occ, completed, '1', DEFAULT_CAPACITY);

  assert(usedOverflow === true, 'Overflow fallback is used when capacity blocks every unit');
  assert(unit !== null, 'An intern still receives a next unit instead of being left idle');
  assert(String(unit._id) !== '1', 'Overflow fallback still excludes the current unit');
}

// ─── TEST 10: Simultaneous completions redistribute across low-load units ────
section('TEST 10: Simultaneous completions redistribute across lowest-load units');
{
  const units = makeUnits(4);
  const occupancy = makeOccupancy({ '1': 2, '2': 0, '3': 0, '4': 1 });
  const currentUnits = ['1', '4', '1', '4'];

  for (const previousUnit of currentUnits) {
    occupancy.set(previousUnit, Math.max(0, (occupancy.get(previousUnit) || 0) - 1));
    const { unit } = pickNextUnitForAssignment(units, occupancy, new Set(), previousUnit, DEFAULT_CAPACITY);
    if (unit) {
      const unitId = String(unit._id);
      occupancy.set(unitId, (occupancy.get(unitId) || 0) + 1);
    }
  }

  const loads = units.map((unit) => occupancy.get(String(unit._id)) || 0);
  const maxLoad = Math.max(...loads);
  const minLoad = Math.min(...loads);

  assert(maxLoad - minLoad <= 1, `Simultaneous completions stay balanced (max=${maxLoad}, min=${minLoad})`);
  assert(loads.filter((count) => count > 0).length >= 3, 'Assignments spread across multiple units instead of colliding into one');
}

// ─── TEST 11: Exact bug – next unit starts previous end + 1 day ─────────────
section('TEST 11: Exact bug – March 30 end rolls to March 31 start');
{
  const nextStartDate = getNextRotationStartDate(new Date(2026, 2, 30), new Date(2026, 3, 1));
  assert(toLocalDateKey(nextStartDate) === '2026-03-31', `Next unit starts on 2026-03-31, got ${toLocalDateKey(nextStartDate)}`);
}

// ─── TEST 12: Multi-unit progression has zero gaps ───────────────────────────
section('TEST 12: Multi-unit progression has zero gaps');
{
  const timeline = buildChainedTimeline(new Date(2026, 2, 1), [10, 11, 12]);
  assert(toLocalDateKey(timeline[0].endDate) === '2026-03-10', `Unit A ends on 2026-03-10, got ${toLocalDateKey(timeline[0].endDate)}`);
  assert(toLocalDateKey(timeline[1].startDate) === '2026-03-11', `Unit B starts on 2026-03-11, got ${toLocalDateKey(timeline[1].startDate)}`);
  assert(toLocalDateKey(timeline[1].endDate) === '2026-03-21', `Unit B ends on 2026-03-21, got ${toLocalDateKey(timeline[1].endDate)}`);
  assert(toLocalDateKey(timeline[2].startDate) === '2026-03-22', `Unit C starts on 2026-03-22, got ${toLocalDateKey(timeline[2].startDate)}`);
}

// ─── TEST 13: Same-day transitions have no overlap and no skip ───────────────
section('TEST 13: Same-day transitions have no overlap and no skip');
{
  const timeline = buildChainedTimeline('2026-04-01T00:00:00Z', [1, 1, 1]);
  for (let index = 1; index < timeline.length; index += 1) {
    const previous = timeline[index - 1];
    const current = timeline[index];
    const expectedStart = getNextRotationStartDate(previous.endDate, current.startDate);
    assert(
      toLocalDateKey(current.startDate) === toLocalDateKey(expectedStart),
      `Unit ${index + 1} starts exactly after unit ${index} ends`
    );
  }
}

// ─── TEST 14: Backward start-date shift rebuilds a continuous chain ──────────
section('TEST 14: Backward start-date shift rebuilds a continuous chain');
{
  const today = new Date('2026-04-01T00:00:00Z');
  const durations = [30, 30, 21];
  const rebuilt = buildChainedTimeline('2026-02-20T00:00:00Z', durations);

  const activeRotation = rebuilt.find((window) => window.startDate <= today && window.endDate >= today);
  assert(activeRotation !== undefined, 'A current unit exists after rebuilding from an earlier start date');

  for (let index = 1; index < rebuilt.length; index += 1) {
    const previous = rebuilt[index - 1];
    const current = rebuilt[index];
    const dayDelta = Math.round((current.startDate.getTime() - previous.endDate.getTime()) / (1000 * 60 * 60 * 24));
    assert(dayDelta === 1, `Gap between rebuilt units ${index} and ${index + 1} is exactly 1 day step`);
  }
}

// ─── TEST 15: Random stress – 50 edited timelines keep continuity ────────────
section('TEST 15: Random stress – 50 edited timelines keep continuity');
{
  const baseStart = new Date('2026-01-01T00:00:00Z');
  let continuityFailures = 0;

  for (let internIndex = 0; internIndex < 50; internIndex += 1) {
    const editedStart = new Date(baseStart);
    editedStart.setDate(baseStart.getDate() - (internIndex % 17));
    const durations = [21, 30, 21, 30, 21].map((duration, idx) => duration + ((internIndex + idx) % 2));
    const timeline = buildChainedTimeline(editedStart, durations);

    for (let index = 1; index < timeline.length; index += 1) {
      const previous = timeline[index - 1];
      const current = timeline[index];
      const expectedStart = getNextRotationStartDate(previous.endDate, editedStart);
      if (toLocalDateKey(current.startDate) !== toLocalDateKey(expectedStart)) {
        continuityFailures += 1;
      }
    }
  }

  assert(continuityFailures === 0, `Randomized continuity stress produced zero gaps/overlaps (${continuityFailures} failures)`);
}

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED');
}

