const { calculateInternExtensionDays } = require('../services/extensionCalculationService');

const unit = (durationDays) => ({ durationDays });

describe('calculateInternExtensionDays', () => {
  const today = new Date('2026-09-04T00:00:00.000Z');

  it('returns 0 for no rotations', () => {
    expect(calculateInternExtensionDays([], today)).toBe(0);
  });

  it('a 30-day unit completed in exactly 30 days contributes 0', () => {
    const rotations = [{
      status: 'completed',
      startDate: '2026-01-01',
      endDate: '2026-01-30', // 30 days
      unit: unit(30),
    }];
    expect(calculateInternExtensionDays(rotations, today)).toBe(0);
  });

  it('a 30-day unit completed in 25 days contributes 0 (never negative)', () => {
    const rotations = [{
      status: 'completed',
      startDate: '2026-01-01',
      endDate: '2026-01-25', // 25 days
      unit: unit(30),
    }];
    expect(calculateInternExtensionDays(rotations, today)).toBe(0);
  });

  it('a 30-day unit completed in 35 days contributes +5', () => {
    const rotations = [{
      status: 'completed',
      startDate: '2026-01-01',
      endDate: '2026-02-04', // 35 days
      unit: unit(30),
    }];
    expect(calculateInternExtensionDays(rotations, today)).toBe(5);
  });

  it('a 21-day unit completed in 25 days contributes +4', () => {
    const rotations = [{
      status: 'completed',
      startDate: '2026-01-01',
      endDate: '2026-01-25', // 25 days
      unit: unit(21),
    }];
    expect(calculateInternExtensionDays(rotations, today)).toBe(4);
  });

  it('sums excess across multiple completed rotations with different required durations', () => {
    // Matches the exact scenario reported for Ugwu Benita: two 30-day units
    // each run 1 day over, one 21-day unit run 4 days over.
    const rotations = [
      { status: 'completed', startDate: '2026-06-06', endDate: '2026-07-06', unit: unit(30) }, // 31 days -> +1
      { status: 'completed', startDate: '2026-07-07', endDate: '2026-08-06', unit: unit(30) }, // 31 days -> +1
      { status: 'completed', startDate: '2026-08-07', endDate: '2026-08-31', unit: unit(21) }, // 25 days -> +4
      { status: 'active', startDate: '2026-08-31', unit: unit(21) }, // just started, day 5 of 21 -> +0
    ];
    expect(calculateInternExtensionDays(rotations, today)).toBe(6);
  });

  it('a normal in-progress active rotation (not yet past its duration) contributes 0', () => {
    const rotations = [{
      status: 'active',
      startDate: '2026-09-01', // 4 days elapsed as of "today"
      unit: unit(21),
    }];
    expect(calculateInternExtensionDays(rotations, today)).toBe(0);
  });

  it('an active/pending rotation that has exceeded its required duration counts its excess', () => {
    const rotations = [{
      status: 'active',
      startDate: '2026-08-01', // 35 days elapsed as of "today" on a 30-day unit
      unit: unit(30),
    }];
    expect(calculateInternExtensionDays(rotations, today)).toBe(5);
  });

  it('a "pending" status rotation is treated the same as an overdue active one', () => {
    const rotations = [{
      status: 'pending',
      startDate: '2026-08-01',
      unit: unit(30),
    }];
    expect(calculateInternExtensionDays(rotations, today)).toBe(5);
  });

  it('excludes upcoming rotations entirely, even if their computed span would exceed duration', () => {
    const rotations = [{
      status: 'upcoming',
      startDate: '2026-01-01',
      endDate: '2026-03-01',
      unit: unit(20),
    }];
    expect(calculateInternExtensionDays(rotations, today)).toBe(0);
  });

  it('excludes awaiting_confirmation (staged, undecided) rotations entirely', () => {
    const rotations = [{
      status: 'awaiting_confirmation',
      startDate: '2026-09-05',
      endDate: '2026-10-05',
      unit: unit(30),
    }];
    expect(calculateInternExtensionDays(rotations, today)).toBe(0);
  });

  it('does not count a future upcoming rotation whose startDate is after today', () => {
    const rotations = [{
      status: 'active', // mis-tagged edge case: status active but date is in the future
      startDate: '2026-12-01',
      unit: unit(30),
    }];
    expect(calculateInternExtensionDays(rotations, today)).toBe(0);
  });

  it('ignores a rotation with no configured unit duration rather than throwing', () => {
    const rotations = [{
      status: 'completed',
      startDate: '2026-01-01',
      endDate: '2026-02-01',
      unit: {},
    }];
    expect(calculateInternExtensionDays(rotations, today)).toBe(0);
  });

  it('is resilient to backdating: recomputes purely from current dates, never from a stale prior value', () => {
    // Simulates a start-date edit that reconciled a completed rotation's
    // dates to a new, earlier position while preserving its TRUE duration.
    // Whatever the rotation's dates were before the edit is irrelevant -
    // only its current recorded span vs the unit's duration matters.
    const beforeEdit = [{ status: 'completed', startDate: '2026-06-07', endDate: '2026-07-08', unit: unit(30) }]; // 32 days -> +2
    const afterBackdate = [{ status: 'completed', startDate: '2026-05-01', endDate: '2026-06-01', unit: unit(30) }]; // same 32-day span, shifted earlier -> +2

    expect(calculateInternExtensionDays(beforeEdit, today)).toBe(2);
    expect(calculateInternExtensionDays(afterBackdate, today)).toBe(2);
  });

  it('accepts rotations using snake_case date fields too', () => {
    const rotations = [{
      status: 'completed',
      start_date: '2026-01-01',
      end_date: '2026-02-04', // 35 days
      unit: { duration_days: 30 },
    }];
    expect(calculateInternExtensionDays(rotations, today)).toBe(5);
  });
});
