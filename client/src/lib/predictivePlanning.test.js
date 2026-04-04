import { buildUpcomingMovements, previewNextUnitForIntern } from './predictivePlanning';

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
  rotations: [],
});

const units = [
  { id: 'u-ortho', name: 'Ortho', capacity: 5 },
  { id: 'u-neuro', name: 'Neuro', capacity: 5 },
  { id: 'u-geri', name: 'Geri', capacity: 5 },
];

describe('predictivePlanning', () => {
  test('Test 1: 5-day preview appears when intern has 4 days left', () => {
    const intern = buildIntern({
      id: 'i-1',
      name: 'Cynthia',
      unitId: 'u-ortho',
      unitName: 'Ortho',
      startDate: '2026-03-15T00:00:00.000Z',
      endDate: '2026-04-08T00:00:00.000Z',
    });

    const preview = previewNextUnitForIntern(intern, {
      interns: [intern],
      units,
      referenceDate: BASE_DATE,
      leavingSoonDays: 5,
    });

    expect(preview.shouldPreview).toBe(true);
    expect(preview.status).toBe('preview');
  });

  test('Test 2: preview does not appear when intern has more than 5 days left', () => {
    const intern = buildIntern({
      id: 'i-2',
      name: 'Daniel',
      unitId: 'u-neuro',
      unitName: 'Neuro',
      startDate: '2026-03-20T00:00:00.000Z',
      endDate: '2026-04-11T00:00:00.000Z',
    });

    const preview = previewNextUnitForIntern(intern, {
      interns: [intern],
      units,
      referenceDate: BASE_DATE,
      leavingSoonDays: 5,
    });

    expect(preview.shouldPreview).toBe(false);
  });

  test('Test 3: weekly board includes only interns moving in <=7 days', () => {
    const nearMove = buildIntern({
      id: 'i-3',
      name: 'Near Move',
      unitId: 'u-ortho',
      unitName: 'Ortho',
      startDate: '2026-03-20T00:00:00.000Z',
      endDate: '2026-04-10T00:00:00.000Z',
    });
    const farMove = buildIntern({
      id: 'i-4',
      name: 'Far Move',
      unitId: 'u-neuro',
      unitName: 'Neuro',
      startDate: '2026-03-25T00:00:00.000Z',
      endDate: '2026-04-20T00:00:00.000Z',
    });

    const movements = buildUpcomingMovements([nearMove, farMove], units, {
      referenceDate: BASE_DATE,
      movementWindowDays: 7,
      leavingSoonDays: 5,
    });

    expect(movements).toHaveLength(1);
    expect(movements[0].internName).toBe('Near Move');
  });

  test('Test 4: predictive logic treats full unit with leavers by effective load', () => {
    const targetIntern = buildIntern({
      id: 'i-5',
      name: 'Target',
      unitId: 'u-geri',
      unitName: 'Geri',
      startDate: '2026-03-20T00:00:00.000Z',
      endDate: '2026-04-08T00:00:00.000Z',
    });

    const unitAInterns = [0, 1, 2, 3, 4].map((index) => buildIntern({
      id: `a-${index}`,
      name: `A-${index}`,
      unitId: 'u-ortho',
      unitName: 'Ortho',
      startDate: '2026-03-15T00:00:00.000Z',
      endDate: index < 2 ? '2026-04-08T00:00:00.000Z' : '2026-04-20T00:00:00.000Z',
    }));
    const unitBInterns = [0, 1, 2].map((index) => buildIntern({
      id: `b-${index}`,
      name: `B-${index}`,
      unitId: 'u-neuro',
      unitName: 'Neuro',
      startDate: '2026-03-15T00:00:00.000Z',
      endDate: '2026-04-20T00:00:00.000Z',
    }));

    const preview = previewNextUnitForIntern(targetIntern, {
      interns: [targetIntern, ...unitAInterns, ...unitBInterns],
      units,
      referenceDate: BASE_DATE,
      leavingSoonDays: 5,
    });

    expect(preview.metrics.effectiveLoad).toBe(3);
    expect(['Ortho', 'Neuro']).toContain(preview.unit.name);
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
      leavingSoonDays: 5,
    });

    expect(interns).toEqual(internsSnapshot);
    expect(units).toEqual(unitsSnapshot);
  });

  test('Test 6: reassignment changes preview immediately', () => {
    const intern = buildIntern({
      id: 'i-7',
      name: 'Reassigned',
      unitId: 'u-ortho',
      unitName: 'Ortho',
      startDate: '2026-03-15T00:00:00.000Z',
      endDate: '2026-04-07T00:00:00.000Z',
    });

    const before = previewNextUnitForIntern(intern, {
      interns: [intern],
      units: units.slice(0, 2),
      referenceDate: BASE_DATE,
      leavingSoonDays: 5,
    });

    const reassigned = {
      ...intern,
      currentUnit: {
        ...intern.currentUnit,
        id: 'u-neuro',
        name: 'Neuro',
      },
    };

    const after = previewNextUnitForIntern(reassigned, {
      interns: [reassigned],
      units: units.slice(0, 2),
      referenceDate: BASE_DATE,
      leavingSoonDays: 5,
    });

    expect(before.unit.name).toBe('Neuro');
    expect(after.unit.name).toBe('Ortho');
  });
});
