import { describe, it, expect } from 'vitest';
import { parseSlotStart, sessionStartUtc } from '../src/notifications/push/sessionTime';

describe('parseSlotStart', () => {
  const cases: [string, { h: number; m: number } | null][] = [
    ['05:00 - 07:00', { h: 5, m: 0 }],
    ['5:00-7:00', { h: 5, m: 0 }],
    ['9h - 11h', { h: 9, m: 0 }],
    ['9h30 - 11h', { h: 9, m: 30 }],
    ['19 giờ - 21 giờ', { h: 19, m: 0 }],
    ['7h sáng', { h: 7, m: 0 }],
    ['abc', null],
    ['25:00', null],
    ['12:60', null],
    ['9h75', null],
    ['', null],
  ];

  it.each(cases)('parseSlotStart(%j) -> %j', (input, expected) => {
    expect(parseSlotStart(input)).toEqual(expected);
  });
});

describe('sessionStartUtc', () => {
  it('picks the earliest parsed start and converts UTC+7 to UTC', () => {
    const d = sessionStartUtc('2026-11-14', [
      { courtName: 'S5', timeRange: '19:00 - 21:00' },
      { courtName: 'S6', timeRange: '05:00 - 07:00' },
    ]);
    expect(d?.toISOString()).toBe('2026-11-13T22:00:00.000Z');
  });

  it('returns null when there are no slots or none parse', () => {
    expect(sessionStartUtc('2026-11-14', undefined)).toBeNull();
    expect(sessionStartUtc('2026-11-14', [])).toBeNull();
    expect(sessionStartUtc('2026-11-14', [{ courtName: 'S1', timeRange: 'tối' }])).toBeNull();
  });
});
