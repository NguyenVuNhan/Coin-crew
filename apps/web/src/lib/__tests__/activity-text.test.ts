import { describe, it, expect, afterEach } from 'vitest';
import type { ActivityItem } from '@fsl/core';
import { setLang, t } from '../../i18n';
import { tripView, PIDS } from '../../test/fixtures';
import { activityLine, groupByDay, timeOf } from '../activityText';

afterEach(() => setLang('en'));

const item = (action: ActivityItem['action'], details: ActivityItem['details'] = {}, actorName: string | null = 'Chi', createdAt = '2026-10-14T10:00:00.000Z'): ActivityItem => ({
  id: `${action}-${createdAt}`, action, actorName, details, deviceShort: null, createdAt,
});

describe('activityLine', () => {
  const view = tripView();

  it('names the expense and its amount', () => {
    expect(activityLine(item('expense_added', { description: 'Bánh tráng nướng', amount: 180000 }), view, t)).toBe('Chi added Bánh tráng nướng · 180.000₫');
    expect(activityLine(item('expense_edited', { description: 'Lẩu', amount: 900000 }, 'Minh'), view, t)).toBe('Minh edited Lẩu · 900.000₫');
    expect(activityLine(item('expense_approved', { description: 'Lẩu' }, 'Minh'), view, t)).toBe('Minh approved Lẩu');
    expect(activityLine(item('expense_rejected', { description: 'Lẩu', reason: 'twice' }, 'Minh'), view, t)).toBe('Minh rejected Lẩu');
  });

  it('says who paid whom, from the people in the trip', () => {
    expect(activityLine(item('payment_recorded', { fromId: PIDS.C, toId: PIDS.M, amount: 177500 }), view, t)).toBe('Chi paid Minh 177.500₫');
    expect(activityLine(item('payment_confirmed', { amount: 177500 }, 'Minh'), view, t)).toBe('Minh confirmed a payment · 177.500₫');
  });

  it('names people in the name actions', () => {
    expect(activityLine(item('name_added', { name: 'Hà' }, 'Minh'), view, t)).toBe('Minh added Hà');
    expect(activityLine(item('name_approved', { name: 'Hà' }, 'Minh'), view, t)).toBe('Minh approved Hà');
    expect(activityLine(item('person_removed', { name: 'Hà' }, 'Minh'), view, t)).toBe('Minh removed Hà');
    expect(activityLine(item('name_merged', { fromName: 'Chi Nguyễn', intoName: 'Chi' }, 'Minh'), view, t)).toBe('Minh merged Chi Nguyễn into Chi');
  });

  it('says Someone when nobody is known', () => {
    expect(activityLine(item('expense_approved', { description: 'Lẩu' }, null), view, t)).toBe('Someone approved Lẩu');
  });

  it('keeps the generic line when the details are empty, missing or odd', () => {
    expect(activityLine(item('trip_created'), view, t)).toBe('Chi created the trip');
    expect(activityLine(item('expense_disabled'), view, t)).toBe('Chi disabled an expense');
    expect(activityLine(item('expense_added', { description: 'Lẩu' }), view, t)).toBe('Chi added an expense');
    expect(activityLine(item('expense_added', { description: 42, amount: '180000' }), view, t)).toBe('Chi added an expense');
    expect(activityLine(item('name_added', { name: '' }), view, t)).toBe('Chi added a name');
  });

  it('keeps the generic line when it cannot name who paid whom', () => {
    const paid = item('payment_recorded', { fromId: 'p-gone', toId: PIDS.M, amount: 100000 });
    expect(activityLine(paid, view, t)).toBe('Chi recorded a payment');
    expect(activityLine(paid, undefined, t)).toBe('Chi recorded a payment');
    expect(activityLine(item('payment_recorded', { fromId: PIDS.C, toId: PIDS.M }), view, t)).toBe('Chi recorded a payment');
  });

  it('speaks Vietnamese', () => {
    setLang('vi');
    expect(activityLine(item('expense_added', { description: 'Lẩu', amount: 180000 }), view, t)).toBe('Chi đã thêm Lẩu · 180.000₫');
  });
});

describe('groupByDay', () => {
  const now = new Date(2026, 9, 15, 0, 30); // 15 Oct 2026, half past midnight
  const at = (y: number, m: number, d: number, h = 12, min = 0) => item('trip_created', {}, 'Minh', new Date(y, m - 1, d, h, min).toISOString());

  it('groups by calendar day in the viewer\'s time zone, newest first as given', () => {
    const items = [at(2026, 10, 15, 0, 10), at(2026, 10, 14, 23, 59), at(2026, 10, 14, 8), at(2026, 10, 13)];
    const groups = groupByDay(items, now);
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([['Today', 1], ['Yesterday', 2], ['13 Oct 2026', 1]]);
  });

  it('keeps one group per day even when the items are out of order', () => {
    const groups = groupByDay([at(2026, 10, 15), at(2026, 10, 14), at(2026, 10, 15, 9)], now);
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([['Today', 2], ['Yesterday', 1]]);
  });

  it('labels in the current language and handles no items', () => {
    setLang('vi');
    expect(groupByDay([at(2026, 10, 15), at(2026, 10, 14)], now).map((g) => g.label)).toEqual(['Hôm nay', 'Hôm qua']);
    expect(groupByDay([], now)).toEqual([]);
  });
});

describe('timeOf', () => {
  it('is HH:mm in the viewer\'s time zone', () => {
    expect(timeOf(new Date(2026, 9, 15, 8, 5).toISOString())).toBe('08:05');
    expect(timeOf(new Date(2026, 9, 15, 21, 40).toISOString())).toBe('21:40');
  });
});
