const { buildInternSchedule } = require('./internScheduleService');

describe('internScheduleService.buildInternSchedule', () => {
  const now = new Date('2026-02-18T00:00:00.000Z');

  const unitsInOrder = [
    { id: 1, name: 'ICU', duration_days: 14, workload: 'High', position: 1 },
    { id: 2, name: 'Ortho', duration_days: 14, workload: 'Medium', position: 2 },
    { id: 3, name: 'Neuro', duration_days: 14, workload: 'High', position: 3 },
    { id: 4, name: 'Pediatrics', duration_days: 14, workload: 'Low', position: 4 },
  ];

  test('Fresh intern: upcoming follows full unit order', () => {
    const schedule = buildInternSchedule({
      internId: 10,
      rotations: [],
      orderedUnits: unitsInOrder,
      now,
    });

    expect(schedule.completed).toEqual([]);
    expect(schedule.current).toBeNull();
    expect(schedule.upcoming.map((u) => u.unit_id)).toEqual([1, 2, 3, 4]);
  });

  test('Intern with completed units: reorder updates upcoming order dynamically', () => {
    const reorderedUnits = [
      { id: 3, name: 'Neuro', duration_days: 14, workload: 'High', position: 1 },
      { id: 1, name: 'ICU', duration_days: 14, workload: 'High', position: 2 },
      { id: 4, name: 'Pediatrics', duration_days: 14, workload: 'Low', position: 3 },
      { id: 2, name: 'Ortho', duration_days: 14, workload: 'Medium', position: 4 },
    ];

    const rotations = [
      { id: 101, intern_id: 10, unit_id: 1, unit_name: 'ICU', start_date: '2026-01-01', end_date: '2026-01-14' },
      { id: 102, intern_id: 10, unit_id: 2, unit_name: 'Ortho', start_date: '2026-01-15', end_date: '2026-01-31' },
    ];

    const schedule = buildInternSchedule({
      internId: 10,
      rotations,
      orderedUnits: reorderedUnits,
      now,
    });

    expect(schedule.completed.map((r) => r.unit_id)).toEqual([1, 2]);
    expect(schedule.upcoming.map((u) => u.unit_id)).toEqual([3, 4]);
  });

  test('Intern mid-rotation: current unit remains, upcoming realigns by position', () => {
    const reorderedUnits = [
      { id: 3, name: 'Neuro', duration_days: 14, workload: 'High', position: 1 },
      { id: 1, name: 'ICU', duration_days: 14, workload: 'High', position: 2 },
      { id: 4, name: 'Pediatrics', duration_days: 14, workload: 'Low', position: 3 },
      { id: 2, name: 'Ortho', duration_days: 14, workload: 'Medium', position: 4 },
    ];

    const rotations = [
      { id: 201, intern_id: 10, unit_id: 1, unit_name: 'ICU', start_date: '2026-01-01', end_date: '2026-01-14' },
      { id: 202, intern_id: 10, unit_id: 2, unit_name: 'Ortho', start_date: '2026-02-10', end_date: '2026-02-24' },
    ];

    const schedule = buildInternSchedule({
      internId: 10,
      rotations,
      orderedUnits: reorderedUnits,
      now,
    });

    expect(schedule.current?.unit_id).toBe(2);
    expect(schedule.upcoming.map((u) => u.unit_id)).toEqual([3, 4]);
  });

  test('Repeated fetch (server restart equivalent): order remains from persisted unit positions', () => {
    const rotations = [
      { id: 301, intern_id: 10, unit_id: 1, unit_name: 'ICU', start_date: '2026-01-01', end_date: '2026-01-14' },
      { id: 302, intern_id: 10, unit_id: 2, unit_name: 'Ortho', start_date: '2026-02-10', end_date: '2026-02-24' },
    ];

    const first = buildInternSchedule({
      internId: 10,
      rotations,
      orderedUnits: unitsInOrder,
      now,
    });

    const second = buildInternSchedule({
      internId: 10,
      rotations,
      orderedUnits: unitsInOrder,
      now,
    });

    expect(first.upcoming.map((u) => u.unit_id)).toEqual([3, 4]);
    expect(second.upcoming.map((u) => u.unit_id)).toEqual([3, 4]);
  });

  test('Deleted unit: removed from upcoming automatically and no crash', () => {
    const rotations = [
      { id: 401, intern_id: 10, unit_id: 1, unit_name: 'ICU', start_date: '2026-01-01', end_date: '2026-01-14' },
      { id: 402, intern_id: 10, unit_id: 5, unit_name: null, start_date: '2026-03-01', end_date: '2026-03-14' },
    ];

    const schedule = buildInternSchedule({
      internId: 10,
      rotations,
      orderedUnits: unitsInOrder,
      now,
    });

    expect(() => schedule.upcoming.map((u) => u.unit_id)).not.toThrow();
    expect(schedule.upcoming.map((u) => u.unit_id)).toEqual([2, 3, 4]);
    expect(schedule.rotations.find((r) => r.id === 402)?.unit_name).toBe('Deleted Unit (5)');
  });
});
