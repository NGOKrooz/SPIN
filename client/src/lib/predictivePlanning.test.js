import {
  buildBalancedBatchAssignments,
  buildMovementQueue,
  buildUpcomingMovements,
  previewNextUnitForIntern,
  PREDICTIVE_WINDOW_DAYS,
  getActiveAssignment,
} from './predictivePlanning';

const BASE_DATE = new Date('2026-04-04T00:00:00.000Z');

const buildIntern = ({
  id,
  name,
  unitId,
  unitName,
  startDate,
  endDate,
  duration = 21,
  completedUnits = [],
  rotations = null,
}) => ({
  id,
  name,
  currentUnit: {
    id: unitId,
    name: unitName,
    startDate,
    endDate,
    duration,
    duration_days: duration,
  },
  completedUnits,
  rotations: rotations !== null ? rotations : [
    {
      status: 'active',
      unit: { id: unitId, name: unitName },
      startDate,
      endDate,
      duration,
      duration_days: duration,
    },
  ],
});

const units = [
  { id: 'u-ortho', name: 'Ortho', capacity: 5 },
  { id: 'u-neuro', name: 'Neuro', capacity: 5 },
  { id: 'u-geri', name: 'Geri', capacity: 5 },
];

describe('predictivePlanning', () => {
  test('Test 1: movement board uses <=5-day moving intern batch', () => {
    const nearMove = buildIntern({
      id: 'i-1',
      name: 'Near Move',
      unitId: 'u-ortho',
      unitName: 'Ortho',
      startDate: '2026-03-20T00:00:00.000Z',
      endDate: '2026-04-09T00:00:00.000Z',
    });
    const farMove = buildIntern({
      id: 'i-2',
      name: 'Far Move',
      unitId: 'u-neuro',
      unitName: 'Neuro',
      startDate: '2026-03-25T00:00:00.000Z',
      endDate: '2026-04-20T00:00:00.000Z',
    });

    const rows = buildUpcomingMovements([nearMove, farMove], units, {
      referenceDate: BASE_DATE,
      movementWindowDays: PREDICTIVE_WINDOW_DAYS,
      leavingSoonDays: PREDICTIVE_WINDOW_DAYS,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].internName).toBe('Near Move');
  });

  test('Test 1a: movement queue includes nearing completion and awaiting confirmation interns', () => {
    const nearing = buildIntern({
      id: 'i-10',
      name: 'Nearing Move',
      unitId: 'u-ortho',
      unitName: 'Ortho',
      startDate: '2026-03-20T00:00:00.000Z',
      endDate: '2026-04-09T00:00:00.000Z',
    });

    const awaiting = {
      ...buildIntern({
        id: 'i-11',
        name: 'Awaiting Move',
        unitId: 'u-neuro',
        unitName: 'Neuro',
        startDate: '2026-03-01T00:00:00.000Z',
        endDate: '2026-03-21T00:00:00.000Z',
      }),
      rotations: [
        { status: 'active', unit: { id: 'u-neuro', name: 'Neuro' }, startDate: '2026-03-01T00:00:00.000Z', endDate: '2026-03-21T00:00:00.000Z', duration: 21 },
        { status: 'awaiting_confirmation', unit: { id: 'u-geri', name: 'Geri' } },
      ],
    };

    const notQueued = buildIntern({
      id: 'i-12',
      name: 'Not Queued',
      unitId: 'u-geri',
      unitName: 'Geri',
      startDate: '2026-04-01T00:00:00.000Z',
      endDate: '2026-04-30T00:00:00.000Z',
    });

    const queue = buildMovementQueue([nearing, awaiting, notQueued], {
      units,
      referenceDate: BASE_DATE,
      leavingSoonDays: PREDICTIVE_WINDOW_DAYS,
    });

    expect(queue).toHaveLength(2);
    expect(queue.map((item) => item.internName)).toEqual(expect.arrayContaining(['Nearing Move', 'Awaiting Move']));

    const nearingItem = queue.find((item) => item.internName === 'Nearing Move');
    expect(nearingItem.status).toBe('nearing_completion');
    expect(nearingItem.remainingDays).toBe(5);
    expect(nearingItem.nextAssignment).toBeTruthy();
    expect(nearingItem.nextAssignment.status).toBe('preview');
    expect(nearingItem.nextUnit).toBeTruthy();
    expect(nearingItem.nextUnitPreview).toBeTruthy();

    const awaitingItem = queue.find((item) => item.internName === 'Awaiting Move');
    expect(awaitingItem.status).toBe('awaiting_confirmation');
    expect(awaitingItem.isAwaitingConfirmation).toBe(true);
    expect(awaitingItem.nextAssignment).toBeTruthy();
    expect(awaitingItem.nextUnit).toBe('Geri');
  });

  test('Test 1b: overdue items are ordered before nearing completion items', () => {
    const overdue = buildIntern({
      id: 'i-13',
      name: 'Overdue Intern',
      unitId: 'u-neuro',
      unitName: 'Neuro',
      startDate: '2026-03-01T00:00:00.000Z',
      endDate: '2026-03-25T00:00:00.000Z',
    });

    const nearing = buildIntern({
      id: 'i-14',
      name: 'Soon Intern',
      unitId: 'u-ortho',
      unitName: 'Ortho',
      startDate: '2026-03-20T00:00:00.000Z',
      endDate: '2026-04-09T00:00:00.000Z',
    });

    const queue = buildMovementQueue([overdue, nearing], {
      units,
      referenceDate: BASE_DATE,
      leavingSoonDays: PREDICTIVE_WINDOW_DAYS,
    });

    expect(queue[0].internName).toBe('Overdue Intern');
    expect(queue[0].isOverdue).toBe(true);
    expect(queue[1].internName).toBe('Soon Intern');
  });

  test('Test 1c: active assignment resolver picks the newest active rotation', () => {
    const multiActive = buildIntern({
      id: 'i-15',
      name: 'Multiple Actives',
      unitId: 'u-ortho',
      unitName: 'Ortho',
      startDate: '2026-03-01T00:00:00.000Z',
      endDate: '2026-03-21T00:00:00.000Z',
      rotations: [
        { status: 'active', unit: { id: 'u-ortho', name: 'Ortho' }, startDate: '2026-03-01T00:00:00.000Z', endDate: '2026-03-21T00:00:00.000Z' },
        { status: 'active', unit: { id: 'u-ortho', name: 'Ortho' }, startDate: '2026-03-05T00:00:00.000Z', endDate: '2026-03-25T00:00:00.000Z' },
      ],
    });

    const activeAssignment = getActiveAssignment(multiActive);
    expect(activeAssignment).not.toBeNull();
    expect(activeAssignment.startDate).toBe('2026-03-05T00:00:00.000Z');
  });

  test('Test 2: recently filled unit is deprioritized', () => {
    const target = buildIntern({
      id: 'i-3',
      name: 'Target',
      unitId: 'u-neuro',
      unitName: 'Neuro',
      startDate: '2026-03-20T00:00:00.000Z',
      endDate: '2026-04-08T00:00:00.000Z',
    });

    const recentToOrthoA = buildIntern({
      id: 'i-recent-1',
      name: 'Recent A',
      unitId: 'u-ortho',
      unitName: 'Ortho',
      startDate: '2026-04-02T00:00:00.000Z',
      endDate: '2026-04-25T00:00:00.000Z',
    });
    const recentToOrthoB = buildIntern({
      id: 'i-recent-2',
      name: 'Recent B',
      unitId: 'u-ortho',
      unitName: 'Ortho',
      startDate: '2026-04-03T00:00:00.000Z',
      endDate: '2026-04-25T00:00:00.000Z',
    });

    const preview = previewNextUnitForIntern(target, {
      interns: [target, recentToOrthoA, recentToOrthoB],
      units,
      referenceDate: BASE_DATE,
    });

    expect(preview.unit.name).toBe('Geri');
  });

  test('Test 3: multiple same-day movers are distributed by incomingBatch', () => {
    const movers = [
      buildIntern({ id: 'i-m1', name: 'Mover 1', unitId: 'u-ortho', unitName: 'Ortho', startDate: '2026-03-20T00:00:00.000Z', endDate: '2026-04-08T00:00:00.000Z' }),
      buildIntern({ id: 'i-m2', name: 'Mover 2', unitId: 'u-neuro', unitName: 'Neuro', startDate: '2026-03-20T00:00:00.000Z', endDate: '2026-04-08T00:00:00.000Z' }),
      buildIntern({ id: 'i-m3', name: 'Mover 3', unitId: 'u-geri', unitName: 'Geri', startDate: '2026-03-20T00:00:00.000Z', endDate: '2026-04-08T00:00:00.000Z' }),
    ];

    const { assignments } = buildBalancedBatchAssignments(movers, units, {
      referenceDate: BASE_DATE,
    });

    const destinations = assignments.map((row) => row.toUnitId);
    expect(new Set(destinations).size).toBeGreaterThan(1);
  });

  test('Test 4: resulting true-load spread is near-balanced', () => {
    const movers = [
      buildIntern({ id: 'i-b1', name: 'B1', unitId: 'u-ortho', unitName: 'Ortho', startDate: '2026-03-20T00:00:00.000Z', endDate: '2026-04-08T00:00:00.000Z' }),
      buildIntern({ id: 'i-b2', name: 'B2', unitId: 'u-neuro', unitName: 'Neuro', startDate: '2026-03-20T00:00:00.000Z', endDate: '2026-04-08T00:00:00.000Z' }),
      buildIntern({ id: 'i-b3', name: 'B3', unitId: 'u-geri', unitName: 'Geri', startDate: '2026-03-20T00:00:00.000Z', endDate: '2026-04-08T00:00:00.000Z' }),
      buildIntern({ id: 'i-b4', name: 'B4', unitId: 'u-geri', unitName: 'Geri', startDate: '2026-03-20T00:00:00.000Z', endDate: '2026-04-08T00:00:00.000Z' }),
    ];

    const { unitState } = buildBalancedBatchAssignments(movers, units, {
      referenceDate: BASE_DATE,
    });

    const loads = unitState.map((row) => row.trueLoad);
    const spread = Math.max(...loads) - Math.min(...loads);
    expect(spread).toBeLessThanOrEqual(2);
  });

  test('Test 5: preview generation does not mutate source data', () => {
    const intern = buildIntern({
      id: 'i-6',
      name: 'Immutable',
      unitId: 'u-neuro',
      unitName: 'Neuro',
      startDate: '2026-03-15T00:00:00.000Z',
      endDate: '2026-04-07T00:00:00.000Z',
    });
    const interns = [intern];
    const internsSnapshot = JSON.parse(JSON.stringify(interns));
    const unitsSnapshot = JSON.parse(JSON.stringify(units));

    previewNextUnitForIntern(intern, {
      interns,
      units,
      referenceDate: BASE_DATE,
      leavingSoonDays: PREDICTIVE_WINDOW_DAYS,
    });

    expect(interns).toEqual(internsSnapshot);
    expect(units).toEqual(unitsSnapshot);
  });
});
