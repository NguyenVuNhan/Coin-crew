import { describe, it, expect } from 'vitest';
import {
  eventState,
  eventsForDate,
  eventsForShare,
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
    stoppedAt: null,
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

describe('eventsForDate', () => {
  it('returns on inside start..end, leadup between countsFrom and start, [] before countsFrom and after end', () => {
    const t = makeEvent({
      countsFrom: '2026-11-20',
      start: '2026-12-01',
      end: '2026-12-03',
    });
    expect(eventsForDate([t], '2026-11-19')).toEqual([]);
    expect(eventsForDate([t], '2026-11-20')).toEqual([{ event: t, mode: 'leadup' }]);
    expect(eventsForDate([t], '2026-11-30')).toEqual([{ event: t, mode: 'leadup' }]);
    expect(eventsForDate([t], '2026-12-01')).toEqual([{ event: t, mode: 'on' }]);
    expect(eventsForDate([t], '2026-12-03')).toEqual([{ event: t, mode: 'on' }]);
    expect(eventsForDate([t], '2026-12-04')).toEqual([]);
  });

  it("leadup of a later event overlapping an earlier event's days returns both sorted by start", () => {
    const a = makeEvent({
      id: 'tr-a',
      name: 'Event A',
      countsFrom: '2026-11-25',
      start: '2026-12-01',
      end: '2026-12-03',
    });
    const b = makeEvent({
      id: 'tr-b',
      name: 'Event B',
      countsFrom: '2026-11-20',
      start: '2026-12-10',
      end: '2026-12-12',
    });

    expect(eventsForDate([b, a], '2026-12-02')).toEqual([
      { event: a, mode: 'on' },
      { event: b, mode: 'leadup' },
    ]);
  });

  it('among overlapping leadups returns all sorted by start', () => {
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

    expect(eventsForDate([later, earlier], '2026-11-20')).toEqual([
      { event: earlier, mode: 'leadup' },
      { event: later, mode: 'leadup' },
    ]);
  });
});

describe('eventsForShare', () => {
  it("ignores events without the share's group", () => {
    const t = makeEvent({ groupIds: ['grp-other'] });
    expect(eventsForShare([t], { tripId: 'grp-1', date: '2026-12-02' })).toEqual([]);
  });

  it('returns all matching events sorted by start', () => {
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

    expect(eventsForShare([leadup, on], { tripId: 'grp-1', date: '2026-12-02' })).toEqual([
      on,
      leadup,
    ]);
  });

  it('returns [] outside countsFrom..end', () => {
    const t = makeEvent({
      countsFrom: '2026-11-20',
      start: '2026-12-01',
      end: '2026-12-03',
      groupIds: ['grp-1'],
    });
    expect(eventsForShare([t], { tripId: 'grp-1', date: '2026-11-19' })).toEqual([]);
    expect(eventsForShare([t], { tripId: 'grp-1', date: '2026-12-04' })).toEqual([]);
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
