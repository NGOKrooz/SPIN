/* eslint-disable no-console */

/**
 * Deterministic validation for reassignment swap behavior.
 * Verifies the core array-transform rule independent of API data availability.
 */
const runSwap = ({ currentUnit, upcomingUnits, selectedUnit }) => {
  const originalUpcoming = [...upcomingUnits];
  const selectedIndex = originalUpcoming.findIndex((unit) => String(unit.id) === String(selectedUnit.id));
  if (selectedIndex < 0) {
    throw new Error('Selected unit must be in upcoming units');
  }

  const nextUpcoming = originalUpcoming.filter((unit) => String(unit.id) !== String(selectedUnit.id));
  nextUpcoming.splice(selectedIndex, 0, currentUnit);

  return {
    current: selectedUnit,
    upcoming: nextUpcoming,
  };
};

const assert = (label, condition, details) => {
  if (!condition) {
    console.error(`FAIL ${label}: ${details}`);
    process.exitCode = 1;
    return;
  }
  console.log(`PASS ${label}`);
};

const ids = (units) => units.map((unit) => unit.id).join(',');

(() => {
  // Case 1: A -> [B,C,D], select B => B -> [A,C,D]
  const case1 = runSwap({
    currentUnit: { id: 'A' },
    upcomingUnits: [{ id: 'B' }, { id: 'C' }, { id: 'D' }],
    selectedUnit: { id: 'B' },
  });
  assert('Case 1 current', case1.current.id === 'B', `expected B got ${case1.current.id}`);
  assert('Case 1 upcoming', ids(case1.upcoming) === 'A,C,D', `expected A,C,D got ${ids(case1.upcoming)}`);

  // Case 2: A -> [B,C,D], select C => C -> [B,A,D]
  const case2 = runSwap({
    currentUnit: { id: 'A' },
    upcomingUnits: [{ id: 'B' }, { id: 'C' }, { id: 'D' }],
    selectedUnit: { id: 'C' },
  });
  assert('Case 2 current', case2.current.id === 'C', `expected C got ${case2.current.id}`);
  assert('Case 2 upcoming', ids(case2.upcoming) === 'B,A,D', `expected B,A,D got ${ids(case2.upcoming)}`);

  // Case 3: A -> [B], select B => B -> [A]
  const case3 = runSwap({
    currentUnit: { id: 'A' },
    upcomingUnits: [{ id: 'B' }],
    selectedUnit: { id: 'B' },
  });
  assert('Case 3 current', case3.current.id === 'B', `expected B got ${case3.current.id}`);
  assert('Case 3 upcoming', ids(case3.upcoming) === 'A', `expected A got ${ids(case3.upcoming)}`);

  const beforeCount = 1 + 3;
  const afterCount = 1 + case2.upcoming.length;
  assert('Count preserved', beforeCount === afterCount, `expected ${beforeCount} got ${afterCount}`);

  if (!process.exitCode) {
    console.log('OVERALL=PASS');
  }
})();
