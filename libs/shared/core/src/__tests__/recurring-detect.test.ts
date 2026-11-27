import { describe, expect, it } from 'vitest';
import { detectRepeat, type RepeatCandidateRow } from '../recurring';

describe('detectRepeat', () => {
  it('3 months on 5/6/4 Oct-Dec within 10% -> monthly on day of latest', () => {
    const latest: RepeatCandidateRow = { date: '2026-12-04', amount: 250_000 };
    const rows: RepeatCandidateRow[] = [
      { date: '2026-10-05', amount: 240_000 },
      { date: '2026-11-06', amount: 265_000 },
      latest,
    ];

    expect(detectRepeat(rows, latest)).toEqual({
      schedule: {
        unit: 'month',
        every: 1,
        monthDay: 4,
        startDate: '2027-01-04',
        end: { kind: 'never' },
      },
      amount: 250_000,
    });
  });

  it('one month missing -> null', () => {
    const latest: RepeatCandidateRow = { date: '2026-12-04', amount: 250_000 };
    const rows: RepeatCandidateRow[] = [
      { date: '2026-10-05', amount: 250_000 },
      latest,
    ];

    expect(detectRepeat(rows, latest)).toBeNull();
  });

  it('amount 15% off -> null', () => {
    const latest: RepeatCandidateRow = { date: '2026-12-04', amount: 200_000 };
    const rows: RepeatCandidateRow[] = [
      { date: '2026-10-05', amount: 200_000 },
      { date: '2026-11-06', amount: 230_000 }, // 15% above 200_000
      latest,
    ];

    expect(detectRepeat(rows, latest)).toBeNull();
  });

  it('4 weekly Mondays -> weekly', () => {
    // 2026-11-30, 2026-12-07, 2026-12-14, 2026-12-21 are all Mondays (ISO weekday 1)
    const latest: RepeatCandidateRow = { date: '2026-12-21', amount: 150_000 };
    const rows: RepeatCandidateRow[] = [
      { date: '2026-11-30', amount: 145_000 },
      { date: '2026-12-07', amount: 155_000 },
      { date: '2026-12-14', amount: 150_000 },
      latest,
    ];

    expect(detectRepeat(rows, latest)).toEqual({
      schedule: {
        unit: 'week',
        every: 1,
        weekdays: [1],
        startDate: '2026-12-28',
        end: { kind: 'never' },
      },
      amount: 150_000,
    });
  });

  it('monthly wins if both monthly and weekly match', () => {
    const latest: RepeatCandidateRow = { date: '2026-12-21', amount: 100_000 };
    const rows: RepeatCandidateRow[] = [
      { date: '2026-10-20', amount: 100_000 },
      { date: '2026-11-22', amount: 100_000 },
      { date: '2026-11-30', amount: 100_000 },
      { date: '2026-12-07', amount: 100_000 },
      { date: '2026-12-14', amount: 100_000 },
      latest,
    ];

    const res = detectRepeat(rows, latest);
    expect(res?.schedule.unit).toBe('month');
    expect(res?.schedule.monthDay).toBe(21);
  });

  it('day outside +-3 days -> null', () => {
    const latest: RepeatCandidateRow = { date: '2026-12-04', amount: 250_000 };
    const rows: RepeatCandidateRow[] = [
      { date: '2026-10-10', amount: 250_000 }, // 6 days away from day 4
      { date: '2026-11-05', amount: 250_000 },
      latest,
    ];

    expect(detectRepeat(rows, latest)).toBeNull();
  });
});
