const {
  resolveCurrentAssignment,
  collectRotationIntegrityIssues,
} = require('../services/assignmentUtils');

describe('Assignment integrity utilities', () => {
  test('resolveCurrentAssignment returns latest active assignment only', () => {
    const rotations = [
      { _id: '1', status: 'completed', startDate: '2026-01-01', unitId: 'A' },
      { _id: '2', status: 'active', startDate: '2026-03-01', unitId: 'B' },
      { _id: '3', status: 'active', startDate: '2026-02-01', unitId: 'C' },
      { _id: '4', status: 'upcoming', startDate: '2026-04-01', unitId: 'D' },
    ];

    const current = resolveCurrentAssignment({ assignments: rotations });
    expect(current).not.toBeNull();
    expect(current._id).toBe('2');
  });

  test('resolveCurrentAssignment ignores active assignments without valid unit references', () => {
    const rotations = [
      { _id: '1', status: 'active', startDate: '2026-03-01' },
      { _id: '2', status: 'active', startDate: '2026-04-01', unitId: 'B' },
    ];

    const current = resolveCurrentAssignment({ assignments: rotations });
    expect(current).not.toBeNull();
    expect(current._id).toBe('2');
  });

  test('collectRotationIntegrityIssues flags duplicate active assignments, missing units and invalid statuses', () => {
    const rotations = [
      { _id: '1', status: 'active', startDate: '2026-01-01', unitId: 'A' },
      { _id: '2', status: 'active', startDate: '2026-02-01' },
      { _id: '3', status: 'pending', startDate: '2026-02-15', unitId: 'B' },
      { _id: '4', status: 'broken_status', startDate: null, unitId: 'C' },
    ];

    const issues = collectRotationIntegrityIssues(rotations);
    expect(issues.duplicateActiveAssignments).toBe(1);
    expect(issues.missingUnits).toBe(1);
    expect(issues.invalidStatuses).toBe(1);
    expect(issues.missingDates).toBe(1);
  });
});
