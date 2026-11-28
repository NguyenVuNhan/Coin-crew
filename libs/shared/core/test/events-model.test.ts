import { describe, it, expect } from 'vitest';
import {
  eventState,
  eventMatchEnd,
  eventsForDate,
  eventsForShare,
  eventTagName,
  uniqueTagName,
  eventDayIndex,
  eventRows,
  type EventDef,
} from '../src/events';
import type { CountedSpendRow } from '../src/reports';
import type { WalletDetailView } from '../src/api-types';

const base: EventDef = {
  id: 'e1',
  tagId: 't1',
  name: 'Đà Lạt',
  start: '2026-12-20',
  end: '2026-12-30',
  stoppedAt: null,
  countsFrom: '2026-12-01',
  groupIds: ['g1'],
  budgetId: null,
};

const wallet: WalletDetailView = {
  id: 'w1',
  name: 'Cash',
  currency: 'VND',
  balance: 1_000_000,
  isDefault: true,
  kind: 'everyday',
  startAmount: 1_000_000,
  startDate: '2025-01-01',
  startCostVnd: null,
  vndValue: 1_000_000,
  icon: 'wallet',
  sortOrder: 1,
  archived: false,
  entryCount: 0,
  excludeFromReports: false,
};

describe('events model', () => {
  it('eventTagName folds and formats', () => {
    expect(eventTagName('Đà Lạt', '2026-12-20', '2026-12-30')).toBe('dalat-201226-301226');
    expect(eventTagName('Đà Lạt', '2026-12-20', null)).toBe('dalat-201226');
    expect(eventTagName('!!!', '2026-12-20', null)).toBe('event-201226');
  });

  it('uniqueTagName adds -2, -3', () => {
    expect(uniqueTagName('dalat-201226', ['DaLat-201226', 'dalat-201226-2'])).toBe('dalat-201226-3');
    expect(uniqueTagName('x', [])).toBe('x');
  });

  it('open event is on until stopped', () => {
    const open: EventDef = { ...base, end: null };
    expect(eventState(open, '2027-06-01')).toBe('on');
    expect(
      eventState({ ...open, end: '2027-06-01', stoppedAt: '2027-06-01T11:00:00.000Z' }, '2027-06-01'),
    ).toBe('done');
  });

  it('stopped event excludes its stop day', () => {
    const stopped: EventDef = { ...base, end: '2026-12-25', stoppedAt: '2026-12-25T11:00:00.000Z' };
    expect(eventMatchEnd(stopped)).toBe('2026-12-24');
    expect(eventsForDate([stopped], '2026-12-25')).toEqual([]);
    expect(eventsForDate([stopped], '2026-12-24').map((m) => m.mode)).toEqual(['on']);
  });

  it('stop day comes from end, not the clock', () => {
    const stopped: EventDef = {
      ...base,
      end: '2026-12-29',
      stoppedAt: '2026-12-28T23:00:00.000Z',
    };
    expect(eventMatchEnd(stopped)).toBe('2026-12-28');
  });

  it('two running events both match, sorted by start', () => {
    const house: EventDef = {
      ...base,
      id: 'e2',
      tagId: 't2',
      name: 'Mua nhà',
      start: '2026-11-01',
      end: null,
      countsFrom: '2026-11-01',
      groupIds: [],
    };
    expect(eventsForDate([base, house], '2026-12-21').map((m) => m.event.id)).toEqual(['e2', 'e1']);
  });

  it('shares match every event with the group', () => {
    const other: EventDef = { ...base, id: 'e3', start: '2026-12-22', countsFrom: '2026-12-22' };
    expect(eventsForShare([base, other], { tripId: 'g1', date: '2026-12-23' }).map((e) => e.id)).toEqual(['e1', 'e3']);
    expect(eventsForShare([base], { tripId: 'g9', date: '2026-12-23' })).toEqual([]);
  });

  it('day index of an open event has no total', () => {
    expect(eventDayIndex({ ...base, end: null }, '2026-12-22')).toEqual({ day: 3, of: null });
  });

  it('eventRows counts a tagged row outside the dates and none for a null tag', () => {
    const row: CountedSpendRow = {
      kind: 'entry',
      id: 'r1',
      walletId: 'w1',
      currency: 'VND',
      date: '2026-10-01',
      amount: 100_000,
      categoryId: 'cat-1',
      tagIds: ['t1'],
    };
    expect(eventRows(base, [row], [wallet]).map((r) => r.id)).toEqual(['r1']);
    expect(eventRows({ ...base, tagId: null }, [row], [wallet])).toEqual([]);
  });
});
