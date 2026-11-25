import { describe, it, expect } from 'vitest';
import {
  groupRowCategoryId,
  type GroupLinkView,
  type GroupRow,
  type GroupSettingsView,
} from '../src/index';

let seq = 1;

function makeRow(overrides: Partial<GroupRow> = {}): GroupRow {
  const id = overrides.id ?? `g-${seq++}`;
  return {
    kind: 'group',
    activityAt: '2026-11-01T00:00:00.000Z',
    id,
    rootId: overrides.rootId ?? id,
    tripId: 'trip-1',
    tripName: 'Đà Lạt',
    isDirect: false,
    source: 'expense',
    date: '2026-11-10',
    title: 'Lẩu gà lá é',
    total: 300_000,
    myShare: 100_000,
    iPaid: false,
    payerName: 'Hùng',
    counterpartName: null,
    people: ['Lan'],
    pending: false,
    link: null,
    createdAt: '2026-11-10T12:00:00.000Z',
    ...overrides,
  };
}

function makeLink(overrides: Partial<GroupLinkView> = {}): GroupLinkView {
  return {
    walletId: null,
    categoryId: null,
    tagIds: [],
    intent: null,
    excludeFromReports: false,
    ...overrides,
  };
}

const settingsWithDefault: GroupSettingsView = {
  defaultGroupCategoryId: 'cat-default',
  countLoans: false,
};

const settingsNoDefault: GroupSettingsView = {
  defaultGroupCategoryId: null,
  countLoans: false,
};

describe('groupRowCategoryId with groupCategoryId', () => {
  it('own override beats group danh mục', () => {
    const row = makeRow({
      link: makeLink({ categoryId: 'cat-own' }),
      groupCategoryId: 'u-1:food-dining',
    });
    expect(groupRowCategoryId(row, settingsWithDefault, 'cat-fallback')).toBe('cat-own');
  });

  it('group danh mục beats default', () => {
    const rowNoLink = makeRow({
      link: null,
      groupCategoryId: 'u-1:food-dining',
    });
    const rowNullLinkCat = makeRow({
      link: makeLink({ categoryId: null }),
      groupCategoryId: 'u-1:food-dining',
    });

    expect(groupRowCategoryId(rowNoLink, settingsWithDefault, 'cat-fallback')).toBe(
      'u-1:food-dining',
    );
    expect(groupRowCategoryId(rowNullLinkCat, settingsWithDefault, 'cat-fallback')).toBe(
      'u-1:food-dining',
    );
  });

  it('default when group has none', () => {
    const rowNull = makeRow({ link: null, groupCategoryId: null });
    const rowUndefined = makeRow({ link: null });

    expect(groupRowCategoryId(rowNull, settingsWithDefault, 'cat-fallback')).toBe('cat-default');
    expect(groupRowCategoryId(rowUndefined, settingsWithDefault, 'cat-fallback')).toBe(
      'cat-default',
    );
    expect(groupRowCategoryId(rowNull, settingsNoDefault, 'cat-fallback')).toBe('cat-fallback');
    expect(groupRowCategoryId(rowUndefined, settingsNoDefault, null)).toBeNull();
  });
});
