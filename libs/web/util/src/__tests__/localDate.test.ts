import { describe, it, expect } from 'vitest';
import { currentMonthLocal, todayLocal } from '../localDate';

describe('localDate helpers', () => {
  it('formats local date and month using local calendar components rather than UTC', () => {
    // Construct a local date where local components are explicitly known
    const localLateNight = new Date(2026, 10, 16, 23, 55, 0); // 2026-11-16 23:55 local
    expect(todayLocal(localLateNight)).toBe('2026-11-16');
    expect(currentMonthLocal(localLateNight)).toBe('2026-11');

    const localEarlyMorning = new Date(2026, 0, 1, 0, 5, 0); // 2026-01-01 00:05 local
    expect(todayLocal(localEarlyMorning)).toBe('2026-01-01');
    expect(currentMonthLocal(localEarlyMorning)).toBe('2026-01');
  });
});
