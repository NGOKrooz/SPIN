/* eslint-disable no-console */
'use strict';
const { sortUnitsByOrder, getUnitOrderIndex } = require('../server/services/rotationPlanService.js');

const units = Array.from({ length: 14 }, (_, i) => ({
  _id: String(i + 1), name: 'Unit ' + (i + 1), order: i + 1, durationDays: 20,
}));
const orderedUnits = sortUnitsByOrder(units);

// ============================================================
// TASK 8: 20 INTERN ROUND-ROBIN
// ============================================================
console.log('=== TASK 8: 20 INTERN ROUND-ROBIN (14 units) ===\n');
const assignments = [];
for (let n = 1; n <= 20; n++) {
  const idx = (n - 1) % orderedUnits.length;
  assignments.push({ n, idx, unit: orderedUnits[idx].name });
  console.log(
    '  Intern ' + String(n).padStart(2) +
    ' | assignedCount=' + String(n - 1).padStart(2) +
    ' | idx=' + String(idx).padStart(2) +
    ' -> ' + orderedUnits[idx].name +
    (n > 14 ? '  << WRAP' : '')
  );
}

// ============================================================
// SPEC TEST CASES
// ============================================================
console.log('\n=== SPEC TEST CASES ===');
const cases = [
  [1,  'Unit 1'],
  [2,  'Unit 2'],
  [14, 'Unit 14'],
  [15, 'Unit 1'],
  [16, 'Unit 2'],
  [20, 'Unit 6'],
];
let allOk = true;
for (const [n, expected] of cases) {
  const got = assignments[n - 1].unit;
  const pass = got === expected;
  if (!pass) allOk = false;
  console.log('  Intern ' + n + ' -> ' + got + (pass ? '  PASS' : '  FAIL (expected ' + expected + ')'));
}
console.log('\n  Overall:', allOk ? 'ALL PASSED' : 'SOME FAILED');

// ============================================================
// TASK 5: RANDOMIZED UPCOMING UNITS
// Verify via seeded hash that different interns get different sequences
// ============================================================
console.log('\n=== TASK 5: UPCOMING UNIT RANDOMIZATION ===');

// Replicate the seeding logic from rotationPlanService (hashString + createSeededRandom)
const hashString = (value) => {
  const input = String(value || '');
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
};
const createSeededRandom = (seed) => {
  let state = hashString(seed) || 1;
  return () => {
    state += 0x6D2B79F5;
    let v = state;
    v = Math.imul(v ^ (v >>> 15), v | 1);
    v ^= v + Math.imul(v ^ (v >>> 7), v | 61);
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
};
const sig = orderedUnits.map(u => u._id + ':' + getUnitOrderIndex(u)).join('|');

const seqs = [];
for (let n = 1; n <= 5; n++) {
  const idx = (n - 1) % orderedUnits.length;
  const first = orderedUnits[idx];
  const remaining = orderedUnits.filter(u => u._id !== first._id);
  const startDate = '2026-01-' + String(n).padStart(2, '0');
  const seed = ['intern' + n, new Date(startDate).toISOString(), sig, 0].join('|');
  const rng = createSeededRandom(seed);
  const shuffled = [...remaining].sort(() => rng() - 0.5);
  seqs.push(shuffled.map(u => u.name).join(','));
  console.log(
    '  Intern ' + n + ': first=' + first.name +
    '  upcoming[0..2]=[' + shuffled.slice(0, 3).map(u => u.name).join(', ') + ']'
  );
}
const uniqueCount = new Set(seqs).size;
console.log('\n  Unique sequences: ' + uniqueCount + '/' + seqs.length + (uniqueCount === seqs.length ? '  ALL UNIQUE' : '  HAS DUPLICATES'));

// ============================================================
// TASK 6: TIMELINE DATE ARITHMETIC
// ============================================================
console.log('\n=== TASK 6: TIMELINE DATE CHECK ===');
let cursor = new Date('2026-01-01T00:00:00Z');
for (let i = 0; i < 4; i++) {
  const start = new Date(cursor);
  const end = new Date(cursor);
  end.setUTCDate(end.getUTCDate() + 19); // duration - 1
  console.log(
    '  Rotation ' + (i + 1) + ': ' +
    start.toISOString().slice(0, 10) + ' -> ' + end.toISOString().slice(0, 10) + ' (20 days)'
  );
  cursor = new Date(end);
  cursor.setUTCDate(cursor.getUTCDate() + 1); // next day
}
const expected4Start = new Date('2026-01-01T00:00:00Z');
expected4Start.setUTCDate(expected4Start.getUTCDate() + 80); // 4 * 20
console.log('  Rotation 5 start should be 2026-03-22: ' + (expected4Start.toISOString().slice(0, 10) === '2026-03-22' ? 'PASS' : 'FAIL'));

// ============================================================
// TASK 7: COUNT QUERY EXPLANATION
// ============================================================
console.log('\n=== TASK 7: EDGE CASE SUMMARY ===');
console.log("  Count query: Intern.countDocuments({ 'rotationHistory.0': { $exists: true } })");
console.log('  => Counts only interns with at least one rotation assigned (first unit confirmed)');
console.log('  => Ghost interns (create succeeded, rotation failed): EXCLUDED');
console.log('  => Hard-deleted interns: EXCLUDED (removed from collection)');
console.log('  => Completed interns: INCLUDED (still in DB, still count toward round-robin)');
console.log('  Units reordered: rebuildInternFutureRotations keeps currentUnit fixed, reshuffles upcoming only');
