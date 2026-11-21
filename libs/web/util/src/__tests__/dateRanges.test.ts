import { describe, it, expect } from 'vitest';
import {
  formatRangeLabel,
  matchQuickRange,
  quickRangeDates,
  validateRange,
} from '../dateRanges';

describe('dateRanges', () => {
  const today = '2026-11-19'; // Thursday

  describe('quickRangeDates', () => {
    it('computes thisWeek (Monday to today)', () => {
      expect(quickRangeDates('thisWeek', today)).toEqual({
        from: '2026-11-16',
        to: '2026-11-19',
      });
    });

    it('computes lastWeek (Monday to Sunday)', () => {
      expect(quickRangeDates('lastWeek', today)).toEqual({
        from: '2026-11-09',
        to: '2026-11-15',
      });
    });

    it('computes thisMonth (1st of month to today)', () => {
      expect(quickRangeDates('thisMonth', today)).toEqual({
        from: '2026-11-01',
        to: '2026-11-19',
      });
    });

    it('computes lastMonth', () => {
      expect(quickRangeDates('lastMonth', today)).toEqual({
        from: '2026-10-01',
        to: '2026-10-31',
      });
    });

    it('computes last30 (today and the 29 days before)', () => {
      expect(quickRangeDates('last30', today)).toEqual({
        from: '2026-10-21',
        to: '2026-11-19',
      });
    });

    it('handles lastWeek across a year boundary', () => {
      expect(quickRangeDates('lastWeek', '2026-01-01')).toEqual({
        from: '2025-12-22',
        to: '2025-12-28',
      });
    });
  });

  describe('matchQuickRange', () => {
    it('matches lastWeek when dates match', () => {
      expect(matchQuickRange('2026-11-09', '2026-11-15', today)).toBe('lastWeek');
    });

    it('matches thisWeek and last30 when dates match', () => {
      expect(matchQuickRange('2026-11-16', '2026-11-19', today)).toBe('thisWeek');
      expect(matchQuickRange('2026-10-21', '2026-11-19', today)).toBe('last30');
    });

    it('returns null when dates do not match a from/to quick range', () => {
      expect(matchQuickRange('2026-11-09', '2026-11-14', today)).toBeNull();
      expect(matchQuickRange('2026-11-01', '2026-11-19', today)).toBeNull();
      expect(matchQuickRange(undefined, '2026-11-19', today)).toBeNull();
    });
  });

  describe('formatRangeLabel', () => {
    it('omits the start year when both ends are in the same year', () => {
      expect(formatRangeLabel('2026-11-12', '2026-11-19', today)).toBe('12/11 – 19/11/2026');
    });

    it('formats a single date when from equals to', () => {
      expect(formatRangeLabel('2026-11-19', '2026-11-19', today)).toBe('19/11/2026');
    });

    it('includes the year on both ends when years differ', () => {
      expect(formatRangeLabel('2025-12-20', '2026-01-05', today)).toBe('20/12/2025 – 05/01/2026');
    });
  });

  describe('validateRange', () => {
    it('returns fromAfterTo when start date is after end date', () => {
      expect(validateRange('2026-11-20', '2026-11-19')).toBe('fromAfterTo');
    });

    it('returns tooLong when range exceeds maxDays after filling missing end', () => {
      expect(validateRange('2025-01-01', undefined, { maxDays: 366, today })).toBe('tooLong');
    });

    it('returns ok for valid ranges within maxDays', () => {
      expect(validateRange('2026-11-12', '2026-11-19', { maxDays: 366, today })).toBe('ok');
      expect(validateRange('2025-11-19', '2026-11-19', { maxDays: 366, today })).toBe('ok');
      expect(validateRange(undefined, '2026-11-19', { maxDays: 366, today })).toBe('ok');
    });
  });
});
