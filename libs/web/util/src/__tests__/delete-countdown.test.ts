import { describe, it, expect } from 'vitest';
import { deleteDaysLeft, formatDeleteDate } from '../time';

describe('deleteDaysLeft', () => {
  it('returns rounded-up days remaining', () => {
    expect(deleteDaysLeft('2026-12-22T10:00:00.000Z', Date.parse('2026-11-22T10:00:00.000Z'))).toBe(30);
  });

  it('returns 1 when under 24h remain', () => {
    expect(deleteDaysLeft('2026-12-22T10:00:00.000Z', Date.parse('2026-12-22T09:59:00.000Z'))).toBe(1);
  });

  it('returns 0 at the exact boundary', () => {
    expect(deleteDaysLeft('2026-12-22T10:00:00.000Z', Date.parse('2026-12-22T10:00:00.000Z'))).toBe(0);
  });

  it('returns 0 during the final-hour window before cron cleanup (never negative)', () => {
    expect(deleteDaysLeft('2026-12-22T10:00:00.000Z', Date.parse('2026-12-22T10:45:00.000Z'))).toBe(0);
  });

  it('returns 0 on invalid date input', () => {
    expect(deleteDaysLeft('not-a-date', Date.now())).toBe(0);
  });
});

describe('formatDeleteDate', () => {
  it('formats Vietnamese date as dd/MM in Vietnam time', () => {
    expect(formatDeleteDate('2026-12-22T05:00:00.000Z', 'vi')).toBe('22/12');
  });

  it('formats English date as short month and day in Vietnam time', () => {
    expect(formatDeleteDate('2026-12-22T05:00:00.000Z', 'en')).toBe('Dec 22');
  });

  it('handles UTC+7 midnight rollover cleanly', () => {
    expect(formatDeleteDate('2026-12-21T18:30:00.000Z', 'vi')).toBe('22/12');
  });

  it('returns the input string if invalid', () => {
    expect(formatDeleteDate('not-a-date', 'vi')).toBe('not-a-date');
  });
});
