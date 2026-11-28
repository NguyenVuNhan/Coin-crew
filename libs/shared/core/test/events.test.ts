import { describe, it, expect } from 'vitest';
import {
  eventState,
  eventForDate,
  eventForShare,
  findEventOverlap,
  defaultCountsFrom,
  eventDayIndex,
  daysUntil,
  type EventDef,
} from '../src/events';

function makeEvent(overrides: Partial<EventDef> = {}): EventDef {
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

describe('eventState', () => {
  it('returns upcoming before start, on from start through end inclusive, done after end', () => {
    const t = makeEvent({ start: '2026-12-01', end: '2026-12-03' });
    expect(eventState(t, '2026-11-30')).toBe('upcoming');
    expect(eventState(t, '2026-12-01')).toBe('on');
    expect(eventState(t, '2026-12-02')).toBe('on');
    expect(eventState(t, '2026-12-03')).toBe('on');
    expect(eventState(t, '2026-12-04')).toBe('done');
  });
});

describe('eventForDate', () => {
  it('returns on inside start..end, leadup between countsFrom and start, null before countsFrom and after end', () => {
    const t = makeEvent({
      countsFrom: '2026-11-20',
      start: '2026-12-01',
      end: '2026-12-03',
    });
    expect(eventForDate([t], '2026-11-19')).toBeNull();
    expect(eventForDate([t], '2026-11-20')).toEqual({ event: t, mode: 'leadup' });
    expect(eventForDate([t], '2026-11-30')).toEqual({ event: t, mode: 'leadup' });
    expect(eventForDate([t], '2026-12-01')).toEqual({ event: t, mode: 'on' });
    expect(eventForDate([t], '2026-12-03')).toEqual({ event: t, mode: 'on' });
    expect(eventForDate([t], '2026-12-04')).toBeNull();
  });

  it("leadup of a later trip overlapping an earlier trip's days picks the earlier trip as on", () => {
    const a = makeEvent({
      id: 'tr-a',
      name: 'Trip A',
      countsFrom: '2026-11-25',
      start: '2026-12-01',
      end: '2026-12-03',
    });
    const b = makeEvent({
      id: 'tr-b',
      name: 'Trip B',
      countsFrom: '2026-11-20',
      start: '2026-12-10',
      end: '2026-12-12',
    });

    expect(eventForDate([b, a], '2026-12-02')).toEqual({ event: a, mode: 'on' });
  });

  it('among overlapping leadups picks the one with earliest start', () => {
    const later = makeEvent({
      id: 'tr-later',
      countsFrom: '2026-11-15',
      start: '2026-12-10',
      end: '2026-12-12',
    });
    const earlier = makeEvent({
      id: 'tr-earlier',
      countsFrom: '2026-11-18',
      start: '2026-12-05',
      end: '2026-12-07',
    });

    expect(eventForDate([later, earlier], '2026-11-20')).toEqual({
      event: earlier,
      mode: 'leadup',
    });
  });
});

describe('eventForShare', () => {
  it("ignores trips without the share's group", () => {
    const t = makeEvent({ groupIds: ['grp-other'] });
    expect(eventForShare([t], { tripId: 'grp-1', date: '2026-12-02' })).toBeNull();
  });

  it('prefers on over leadup', () => {
    const leadup = makeEvent({
      id: 'tr-lead',
      countsFrom: '2026-11-20',
      start: '2026-12-10',
      end: '2026-12-12',
      groupIds: ['grp-1'],
    });
    const on = makeEvent({
      id: 'tr-on',
      countsFrom: '2026-11-25',
      start: '2026-12-01',
      end: '2026-12-03',
      groupIds: ['grp-1'],
    });

    expect(eventForShare([leadup, on], { tripId: 'grp-1', date: '2026-12-02' })).toEqual(on);
  });

  it('among leadups picks earliest start', () => {
    const later = makeEvent({
      id: 'tr-later',
      countsFrom: '2026-11-10',
      start: '2026-12-20',
      end: '2026-12-22',
      groupIds: ['grp-1'],
    });
    const earlier = makeEvent({
      id: 'tr-earlier',
      countsFrom: '2026-11-15',
      start: '2026-12-10',
      end: '2026-12-12',
      groupIds: ['grp-1'],
    });

    expect(eventForShare([later, earlier], { tripId: 'grp-1', date: '2026-11-25' })).toEqual(
      earlier,
    );
  });

  it('returns null outside countsFrom..end', () => {
    const t = makeEvent({
      countsFrom: '2026-11-20',
      start: '2026-12-01',
      end: '2026-12-03',
      groupIds: ['grp-1'],
    });
    expect(eventForShare([t], { tripId: 'grp-1', date: '2026-11-19' })).toBeNull();
    expect(eventForShare([t], { tripId: 'grp-1', date: '2026-12-04' })).toBeNull();
  });
});

describe('findEventOverlap', () => {
  it('touching ranges overlap (end == other start), exceptId skips self, lead-up is ignored', () => {
    const existing = makeEvent({
      id: 'tr-1',
      countsFrom: '2026-11-10',
      start: '2026-12-01',
      end: '2026-12-05',
    });

    // Touching on start
    expect(findEventOverlap([existing], '2026-11-28', '2026-12-01')).toEqual(existing);
    // Touching on end
    expect(findEventOverlap([existing], '2026-12-05', '2026-12-08')).toEqual(existing);
    // Skipping self via exceptId
    expect(findEventOverlap([existing], '2026-12-01', '2026-12-05', 'tr-1')).toBeNull();
    // Overlapping only lead-up (countsFrom..start-1) is ignored
    expect(findEventOverlap([existing], '2026-11-15', '2026-11-30')).toBeNull();
    // Completely after
    expect(findEventOverlap([existing], '2026-12-06', '2026-12-10')).toBeNull();
  });
});

describe('defaultCountsFrom', () => {
  it('returns today when start is in the future, start when start is in the past', () => {
    expect(defaultCountsFrom('2026-12-10', '2026-11-27')).toBe('2026-11-27');
    expect(defaultCountsFrom('2026-11-20', '2026-11-27')).toBe('2026-11-20');
    expect(defaultCountsFrom('2026-11-27', '2026-11-27')).toBe('2026-11-27');
  });
});

describe('eventDayIndex', () => {
  it('12..14/11 on the 13th is {day: 2, of: 3}; null when not on', () => {
    const t = makeEvent({ start: '2026-11-12', end: '2026-11-14' });
    expect(eventDayIndex(t, '2026-11-11')).toBeNull();
    expect(eventDayIndex(t, '2026-11-12')).toEqual({ day: 1, of: 3 });
    expect(eventDayIndex(t, '2026-11-13')).toEqual({ day: 2, of: 3 });
    expect(eventDayIndex(t, '2026-11-14')).toEqual({ day: 3, of: 3 });
    expect(eventDayIndex(t, '2026-11-15')).toBeNull();
  });
});

describe('daysUntil', () => {
  it('returns days until start', () => {
    const t = makeEvent({ start: '2026-12-01', end: '2026-12-03' });
    expect(daysUntil(t, '2026-11-29')).toBe(2);
    expect(daysUntil(t, '2026-12-01')).toBe(0);
    expect(daysUntil(t, '2026-12-02')).toBe(-1);
  });
});
