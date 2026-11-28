import { describe, expect, it } from 'vitest';
import {
  checkInPolicy,
  intervalDays,
  nextOccurrenceAfter,
  occurrencesBetween,
  vnDate,
  type RecurringSchedule,
} from '../recurring';

describe('recurring schedule maths', () => {
  it('monthly on 31 clamps in February and returns in March', () => {
    const s: RecurringSchedule = {
      unit: 'month',
      every: 1,
      monthDay: 31,
      startDate: '2027-01-31',
      end: { kind: 'never' },
    };
    expect(occurrencesBetween(s, '2027-01-01', '2027-04-30')).toEqual([
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
      '2027-04-30',
    ]);
  });

  it('29 and 30 in a leap February', () => {
    const s29: RecurringSchedule = {
      unit: 'month',
      every: 1,
      monthDay: 29,
      startDate: '2028-01-29',
      end: { kind: 'never' },
    };
    expect(occurrencesBetween(s29, '2028-01-01', '2028-03-31')).toEqual([
      '2028-01-29',
      '2028-02-29',
      '2028-03-29',
    ]);

    const s30: RecurringSchedule = {
      unit: 'month',
      every: 1,
      monthDay: 30,
      startDate: '2028-01-30',
      end: { kind: 'never' },
    };
    expect(occurrencesBetween(s30, '2028-01-01', '2028-03-31')).toEqual([
      '2028-01-30',
      '2028-02-29',
      '2028-03-30',
    ]);
  });

  it('last day', () => {
    const s: RecurringSchedule = {
      unit: 'month',
      every: 1,
      monthDay: 'last',
      startDate: '2027-01-31',
      end: { kind: 'never' },
    };
    expect(occurrencesBetween(s, '2027-01-01', '2027-03-31')).toEqual([
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
    ]);
  });

  it('yearly 29 Feb', () => {
    const s: RecurringSchedule = {
      unit: 'year',
      every: 1,
      startDate: '2028-02-29',
      end: { kind: 'never' },
    };
    expect(occurrencesBetween(s, '2028-01-01', '2030-12-31')).toEqual([
      '2028-02-29',
      '2029-02-28',
      '2030-02-28',
    ]);
  });

  it('weekly on Mon and Thu every 2 weeks', () => {
    const s: RecurringSchedule = {
      unit: 'week',
      every: 2,
      weekdays: [1, 4],
      startDate: '2026-11-30',
      end: { kind: 'never' },
    };
    expect(occurrencesBetween(s, '2026-11-30', '2026-12-17')).toEqual([
      '2026-11-30',
      '2026-12-03',
      '2026-12-14',
      '2026-12-17',
    ]);
  });

  it('every 3 days', () => {
    const s: RecurringSchedule = {
      unit: 'day',
      every: 3,
      startDate: '2027-01-01',
      end: { kind: 'never' },
    };
    expect(occurrencesBetween(s, '2027-01-01', '2027-01-10')).toEqual([
      '2027-01-01',
      '2027-01-04',
      '2027-01-07',
      '2027-01-10',
    ]);
  });

  it('ends after 3 times', () => {
    const s: RecurringSchedule = {
      unit: 'day',
      every: 3,
      startDate: '2027-01-01',
      end: { kind: 'count', count: 3 },
    };
    expect(occurrencesBetween(s, '2027-01-01', '2027-12-31')).toEqual([
      '2027-01-01',
      '2027-01-04',
      '2027-01-07',
    ]);
  });

  it('ends on a date (inclusive)', () => {
    const s: RecurringSchedule = {
      unit: 'day',
      every: 3,
      startDate: '2027-01-01',
      end: { kind: 'date', date: '2027-01-07' },
    };
    expect(occurrencesBetween(s, '2027-01-01', '2027-01-31')).toEqual([
      '2027-01-01',
      '2027-01-04',
      '2027-01-07',
    ]);
  });

  it('nextOccurrenceAfter is strictly after and returns null after the end', () => {
    const s: RecurringSchedule = {
      unit: 'month',
      every: 1,
      monthDay: 5,
      startDate: '2027-01-05',
      end: { kind: 'count', count: 2 },
    };
    expect(nextOccurrenceAfter(s, '2027-01-04')).toBe('2027-01-05');
    expect(nextOccurrenceAfter(s, '2027-01-05')).toBe('2027-02-05');
    expect(nextOccurrenceAfter(s, '2027-02-05')).toBeNull();

    const sDate: RecurringSchedule = {
      unit: 'day',
      every: 2,
      startDate: '2027-01-01',
      end: { kind: 'date', date: '2027-01-03' },
    };
    expect(nextOccurrenceAfter(sDate, '2027-01-01')).toBe('2027-01-03');
    expect(nextOccurrenceAfter(sDate, '2027-01-03')).toBeNull();
  });

  it('vnDate returns UTC+7 calendar date', () => {
    expect(vnDate(new Date('2026-12-04T16:59:00Z'))).toBe('2026-12-04');
    expect(vnDate(new Date('2026-12-04T17:00:00Z'))).toBe('2026-12-05');
  });

  it('checkInPolicy and intervalDays for daily, weekly, monthly, yearly', () => {
    const daily: RecurringSchedule = {
      unit: 'day',
      every: 1,
      startDate: '2027-01-01',
      end: { kind: 'never' },
    };
    const weekly: RecurringSchedule = {
      unit: 'week',
      every: 1,
      startDate: '2027-01-04',
      end: { kind: 'never' },
    };
    const monthly: RecurringSchedule = {
      unit: 'month',
      every: 1,
      startDate: '2027-01-05',
      end: { kind: 'never' },
    };
    const yearly: RecurringSchedule = {
      unit: 'year',
      every: 1,
      startDate: '2027-01-05',
      end: { kind: 'never' },
    };

    expect(intervalDays(daily)).toBe(1);
    expect(intervalDays(weekly)).toBe(7);
    expect(intervalDays(monthly)).toBe(30);
    expect(intervalDays(yearly)).toBe(365);

    expect(checkInPolicy(daily)).toEqual({
      kind: 'after',
      askAfterDays: 30,
      graceDays: 14,
      graceOccurrences: null,
    });
    expect(checkInPolicy(weekly)).toEqual({
      kind: 'after',
      askAfterDays: 60,
      graceDays: null,
      graceOccurrences: 3,
    });
    expect(checkInPolicy(monthly)).toEqual({
      kind: 'after',
      askAfterDays: 182,
      graceDays: null,
      graceOccurrences: 3,
    });
    expect(checkInPolicy(yearly)).toEqual({ kind: 'every' });
  });
});
