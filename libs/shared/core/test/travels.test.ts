import { describe, it, expect } from 'vitest';
import {
  travelState,
  travelForDate,
  travelForShare,
  findTravelOverlap,
  defaultCountsFrom,
  travelDayIndex,
  daysUntil,
  type TravelDef,
} from '../src/travels';

function makeTravel(overrides: Partial<TravelDef> = {}): TravelDef {
  return {
    id: 'tr-1',
    tagId: 'tag-1',
    name: 'Đà Lạt',
    start: '2026-12-01',
    end: '2026-12-03',
    countsFrom: '2026-11-20',
    groupIds: ['grp-1'],
    budgetId: null,
    ...overrides,
  };
}

describe('travelState', () => {
  it('returns upcoming before start, on from start through end inclusive, done after end', () => {
    const t = makeTravel({ start: '2026-12-01', end: '2026-12-03' });
    expect(travelState(t, '2026-11-30')).toBe('upcoming');
    expect(travelState(t, '2026-12-01')).toBe('on');
    expect(travelState(t, '2026-12-02')).toBe('on');
    expect(travelState(t, '2026-12-03')).toBe('on');
    expect(travelState(t, '2026-12-04')).toBe('done');
  });
});

describe('travelForDate', () => {
  it('returns on inside start..end, leadup between countsFrom and start, null before countsFrom and after end', () => {
    const t = makeTravel({
      countsFrom: '2026-11-20',
      start: '2026-12-01',
      end: '2026-12-03',
    });
    expect(travelForDate([t], '2026-11-19')).toBeNull();
    expect(travelForDate([t], '2026-11-20')).toEqual({ travel: t, mode: 'leadup' });
    expect(travelForDate([t], '2026-11-30')).toEqual({ travel: t, mode: 'leadup' });
    expect(travelForDate([t], '2026-12-01')).toEqual({ travel: t, mode: 'on' });
    expect(travelForDate([t], '2026-12-03')).toEqual({ travel: t, mode: 'on' });
    expect(travelForDate([t], '2026-12-04')).toBeNull();
  });

  it("leadup of a later trip overlapping an earlier trip's days picks the earlier trip as on", () => {
    const a = makeTravel({
      id: 'tr-a',
      name: 'Trip A',
      countsFrom: '2026-11-25',
      start: '2026-12-01',
      end: '2026-12-03',
    });
    const b = makeTravel({
      id: 'tr-b',
      name: 'Trip B',
      countsFrom: '2026-11-20',
      start: '2026-12-10',
      end: '2026-12-12',
    });

    expect(travelForDate([b, a], '2026-12-02')).toEqual({ travel: a, mode: 'on' });
  });

  it('among overlapping leadups picks the one with earliest start', () => {
    const later = makeTravel({
      id: 'tr-later',
      countsFrom: '2026-11-15',
      start: '2026-12-10',
      end: '2026-12-12',
    });
    const earlier = makeTravel({
      id: 'tr-earlier',
      countsFrom: '2026-11-18',
      start: '2026-12-05',
      end: '2026-12-07',
    });

    expect(travelForDate([later, earlier], '2026-11-20')).toEqual({
      travel: earlier,
      mode: 'leadup',
    });
  });
});

describe('travelForShare', () => {
  it("ignores trips without the share's group", () => {
    const t = makeTravel({ groupIds: ['grp-other'] });
    expect(travelForShare([t], { tripId: 'grp-1', date: '2026-12-02' })).toBeNull();
  });

  it('prefers on over leadup', () => {
    const leadup = makeTravel({
      id: 'tr-lead',
      countsFrom: '2026-11-20',
      start: '2026-12-10',
      end: '2026-12-12',
      groupIds: ['grp-1'],
    });
    const on = makeTravel({
      id: 'tr-on',
      countsFrom: '2026-11-25',
      start: '2026-12-01',
      end: '2026-12-03',
      groupIds: ['grp-1'],
    });

    expect(travelForShare([leadup, on], { tripId: 'grp-1', date: '2026-12-02' })).toEqual(on);
  });

  it('among leadups picks earliest start', () => {
    const later = makeTravel({
      id: 'tr-later',
      countsFrom: '2026-11-10',
      start: '2026-12-20',
      end: '2026-12-22',
      groupIds: ['grp-1'],
    });
    const earlier = makeTravel({
      id: 'tr-earlier',
      countsFrom: '2026-11-15',
      start: '2026-12-10',
      end: '2026-12-12',
      groupIds: ['grp-1'],
    });

    expect(travelForShare([later, earlier], { tripId: 'grp-1', date: '2026-11-25' })).toEqual(
      earlier,
    );
  });

  it('returns null outside countsFrom..end', () => {
    const t = makeTravel({
      countsFrom: '2026-11-20',
      start: '2026-12-01',
      end: '2026-12-03',
      groupIds: ['grp-1'],
    });
    expect(travelForShare([t], { tripId: 'grp-1', date: '2026-11-19' })).toBeNull();
    expect(travelForShare([t], { tripId: 'grp-1', date: '2026-12-04' })).toBeNull();
  });
});

describe('findTravelOverlap', () => {
  it('touching ranges overlap (end == other start), exceptId skips self, lead-up is ignored', () => {
    const existing = makeTravel({
      id: 'tr-1',
      countsFrom: '2026-11-10',
      start: '2026-12-01',
      end: '2026-12-05',
    });

    // Touching on start
    expect(findTravelOverlap([existing], '2026-11-28', '2026-12-01')).toEqual(existing);
    // Touching on end
    expect(findTravelOverlap([existing], '2026-12-05', '2026-12-08')).toEqual(existing);
    // Skipping self via exceptId
    expect(findTravelOverlap([existing], '2026-12-01', '2026-12-05', 'tr-1')).toBeNull();
    // Overlapping only lead-up (countsFrom..start-1) is ignored
    expect(findTravelOverlap([existing], '2026-11-15', '2026-11-30')).toBeNull();
    // Completely after
    expect(findTravelOverlap([existing], '2026-12-06', '2026-12-10')).toBeNull();
  });
});

describe('defaultCountsFrom', () => {
  it('returns today when start is in the future, start when start is in the past', () => {
    expect(defaultCountsFrom('2026-12-10', '2026-11-27')).toBe('2026-11-27');
    expect(defaultCountsFrom('2026-11-20', '2026-11-27')).toBe('2026-11-20');
    expect(defaultCountsFrom('2026-11-27', '2026-11-27')).toBe('2026-11-27');
  });
});

describe('travelDayIndex', () => {
  it('12..14/11 on the 13th is {day: 2, of: 3}; null when not on', () => {
    const t = makeTravel({ start: '2026-11-12', end: '2026-11-14' });
    expect(travelDayIndex(t, '2026-11-11')).toBeNull();
    expect(travelDayIndex(t, '2026-11-12')).toEqual({ day: 1, of: 3 });
    expect(travelDayIndex(t, '2026-11-13')).toEqual({ day: 2, of: 3 });
    expect(travelDayIndex(t, '2026-11-14')).toEqual({ day: 3, of: 3 });
    expect(travelDayIndex(t, '2026-11-15')).toBeNull();
  });
});

describe('daysUntil', () => {
  it('returns days until start', () => {
    const t = makeTravel({ start: '2026-12-01', end: '2026-12-03' });
    expect(daysUntil(t, '2026-11-29')).toBe(2);
    expect(daysUntil(t, '2026-12-01')).toBe(0);
    expect(daysUntil(t, '2026-12-02')).toBe(-1);
  });
});
