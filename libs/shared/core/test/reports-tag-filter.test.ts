import { describe, it, expect } from 'vitest';
import {
  buildCategoryDrilldown,
  buildReport,
  listCountedSpending,
  tagFirstDates,
} from '../src/reports';
import { summarizeEvent, type EventDef } from '../src/events';
import type { CalcEntry } from '../src/wallets';
import type { GroupRow, GroupSettingsView } from '../src/groupShares';
import type { CategoryView, TagView, WalletDetailView } from '../src/api-types';
import type { CurrencyCode } from '../src/currency';

function makeWallet(
  id: string,
  currency: CurrencyCode,
  overrides?: Partial<WalletDetailView>,
): WalletDetailView {
  return {
    id,
    name: `Wallet ${id}`,
    currency,
    balance: 10_000_000,
    isDefault: id === 'w-vnd',
    kind: 'everyday',
    startAmount: 10_000_000,
    startDate: '2025-01-01',
    startCostVnd: currency === 'VND' ? null : 25_000_000,
    vndValue: 25_000_000,
    icon: 'wallet',
    sortOrder: 1,
    archived: false,
    entryCount: 0,
    excludeFromReports: false,
    ...overrides,
  };
}

function makeEntry(
  id: string,
  walletId: string,
  amount: number,
  date: string,
  categoryId = 'cat-food',
  tagIds: string[] = [],
  overrides?: Partial<CalcEntry & { categoryId: string | null; tagIds: string[] }>,
): CalcEntry & { categoryId: string | null; tagIds: string[] } {
  return {
    id,
    walletId,
    type: 'expense',
    amount,
    date,
    time: null,
    createdAt: `${date}T10:00:00Z`,
    transferId: null,
    excludeFromReports: false,
    categoryId,
    tagIds,
    ...overrides,
  };
}

const categories: CategoryView[] = [
  {
    id: 'cat-food',
    parentId: null,
    type: 'expense',
    name: 'Food',
    icon: 'utensils',
    hidden: false,
    sortOrder: 1,
    starterKey: 'food',
    walletOverrides: [],
  },
  {
    id: 'cat-transport',
    parentId: null,
    type: 'expense',
    name: 'Transport',
    icon: 'car',
    hidden: false,
    sortOrder: 2,
    starterKey: 'transport',
    walletOverrides: [],
  },
  {
    id: 'cat-group',
    parentId: null,
    type: 'expense',
    name: 'Group',
    icon: 'users',
    hidden: false,
    sortOrder: 3,
    starterKey: 'group',
    walletOverrides: [],
  },
  {
    id: 'cat-salary',
    parentId: null,
    type: 'income',
    name: 'Salary',
    icon: 'wallet',
    hidden: false,
    sortOrder: 4,
    starterKey: 'salary',
    walletOverrides: [],
  },
];

const tags: TagView[] = [
  { id: 'tag-house', name: 'Mua nhà', useCount: 3 },
  { id: 'tag-other', name: 'Cà phê', useCount: 1 },
];

const defaultGroupSettings: GroupSettingsView = {
  defaultGroupCategoryId: 'cat-group',
  countLoans: false,
};

describe('reports tagId filter & tagFirstDates', () => {
  it('filters totals, categories and group rows to the tag', () => {
    const wallets = [makeWallet('w-vnd', 'VND')];
    const entries = [
      makeEntry('e-1', 'w-vnd', 300_000, '2026-11-05', 'cat-food', ['tag-house']),
      makeEntry('e-2', 'w-vnd', 150_000, '2026-11-06', 'cat-transport', ['tag-other']),
      makeEntry('e-3', 'w-vnd', 500_000, '2026-11-07', 'cat-salary', ['tag-house'], {
        type: 'income',
      }),
      makeEntry('e-4', 'w-vnd', 200_000, '2026-10-10', 'cat-food', ['tag-house']),
    ];
    const groupRows: GroupRow[] = [
      {
        id: 'g-1',
        tripId: 'trip-1',
        tripName: 'Trip',
        date: '2026-11-08',
        createdAt: '2026-11-08T12:00:00Z',
        description: 'Shared material',
        myPaid: 0,
        myShare: 120_000,
        myNet: -120_000,
        intent: 'normal',
        link: {
          rowId: 'g-1',
          walletId: 'w-vnd',
          categoryId: 'cat-group',
          intent: 'normal',
          excluded: false,
          tagIds: ['tag-house'],
        },
      },
      {
        id: 'g-2',
        tripId: 'trip-1',
        tripName: 'Trip',
        date: '2026-11-09',
        createdAt: '2026-11-09T12:00:00Z',
        description: 'Unrelated share',
        myPaid: 0,
        myShare: 90_000,
        myNet: -90_000,
        intent: 'normal',
        link: {
          rowId: 'g-2',
          walletId: 'w-vnd',
          categoryId: 'cat-group',
          intent: 'normal',
          excluded: false,
          tagIds: ['tag-other'],
        },
      },
    ];

    const query = {
      mode: 'month' as const,
      month: '2026-11',
      includeGroups: true,
      tagId: 'tag-house',
    };

    const report = buildReport({
      wallets,
      entries,
      categories,
      tags,
      groupRows,
      groupSettings: defaultGroupSettings,
      query,
      today: '2026-11-28',
    });

    expect(report.totals.spent).toBe(420_000);
    expect(report.totals.income).toBe(500_000);
    expect(report.totals.net).toBe(80_000);
    expect(report.countedCount).toBe(3);

    expect(report.spendingByCategory.map((c) => [c.categoryId, c.amount])).toEqual([
      ['cat-food', 300_000],
      ['cat-group', 120_000],
    ]);
    expect(report.incomeByCategory.map((c) => [c.categoryId, c.amount])).toEqual([
      ['cat-salary', 500_000],
    ]);

    expect(report.previousDelta.previousSpent).toBe(200_000);
    expect(report.countedRows).toHaveLength(3);

    const drilldown = buildCategoryDrilldown(report, {
      wallets,
      entries,
      categories,
      tags,
      groupRows,
      groupSettings: defaultGroupSettings,
      query,
      today: '2026-11-28',
      categoryId: 'cat-food',
    });
    expect(drilldown?.total).toBe(300_000);
    expect(drilldown?.previousTotal).toBe(200_000);
  });

  it('parity: tag report total equals summarizeEvent total for the same tag', () => {
    const wallets = [
      makeWallet('w-vnd', 'VND'),
      makeWallet('w-thb', 'THB', {
        isDefault: false,
        startAmount: 10_000,
        startCostVnd: 7_500_000, // 750 VND per THB
        vndValue: 7_500_000,
      }),
      makeWallet('w-hidden', 'VND', {
        isDefault: false,
        excludeFromReports: true,
      }),
    ];

    const entries = [
      // THB row with tag
      makeEntry('e-thb', 'w-thb', 1_000, '2026-11-10', 'cat-food', ['tag-trip']),
      // "not in reports" wallet row with tag (must be excluded by both)
      makeEntry('e-hidden', 'w-hidden', 500_000, '2026-11-11', 'cat-food', ['tag-trip']),
    ];

    const groupRows: GroupRow[] = [
      {
        id: 'g-share',
        tripId: 'trip-1',
        tripName: 'Bangkok',
        date: '2026-11-12',
        createdAt: '2026-11-12T10:00:00Z',
        description: 'Hotel',
        myPaid: 0,
        myShare: 400_000,
        myNet: -400_000,
        intent: 'normal',
        link: {
          rowId: 'g-share',
          walletId: 'w-vnd',
          categoryId: 'cat-group',
          intent: 'normal',
          excluded: false,
          tagIds: ['tag-trip'],
        },
      },
    ];

    const report = buildReport({
      wallets,
      entries,
      categories,
      tags: [{ id: 'tag-trip', name: 'bangkok-101126', useCount: 3 }],
      groupRows,
      groupSettings: defaultGroupSettings,
      query: {
        mode: 'custom',
        from: '2026-11-01',
        to: '2026-11-28',
        includeGroups: true,
        tagId: 'tag-trip',
      },
      today: '2026-11-28',
    });

    const countedRows = listCountedSpending({
      wallets,
      entries,
      categories,
      tags: [{ id: 'tag-trip', name: 'bangkok-101126', useCount: 3 }],
      groupRows,
      groupSettings: defaultGroupSettings,
    });

    const eventDef: EventDef = {
      id: 'ev-1',
      name: 'Bangkok',
      tagId: 'tag-trip',
      start: '2026-11-01',
      end: '2026-11-28',
      countsFrom: '2026-11-01',
      groupIds: ['trip-1'],
      limitAmount: null,
      limitCurrency: null,
      stoppedAt: null,
    };

    const summary = summarizeEvent(eventDef, countedRows, wallets, categories);

    // 1,000 THB * 750 = 750,000 VND + 400,000 VND group share = 1,150,000 VND
    expect(summary.approxVnd).toBe(1_150_000);
    expect(report.totals.spent).toBe(summary.approxVnd);
  });

  it('tagFirstDates returns earliest counted item date per tag across all time', () => {
    const wallets = [
      makeWallet('w-vnd', 'VND'),
      makeWallet('w-hidden', 'VND', { isDefault: false, excludeFromReports: true }),
    ];
    const entries = [
      // Excluded entry should not count toward firstDate
      makeEntry('e-ex', 'w-vnd', 100_000, '2025-01-01', 'cat-food', ['tag-house'], {
        excludeFromReports: true,
      }),
      // Excluded wallet should not count toward firstDate
      makeEntry('e-hw', 'w-hidden', 100_000, '2025-02-01', 'cat-food', ['tag-house']),
      // Earliest counted entry
      makeEntry('e-early', 'w-vnd', 200_000, '2026-03-15', 'cat-food', ['tag-house']),
      makeEntry('e-later', 'w-vnd', 300_000, '2026-11-10', 'cat-food', ['tag-house', 'tag-other']),
    ];
    const groupRows: GroupRow[] = [
      {
        id: 'g-early',
        tripId: 'trip-1',
        tripName: 'Trip',
        date: '2026-02-20',
        createdAt: '2026-02-20T10:00:00Z',
        description: 'Early group share',
        myPaid: 0,
        myShare: 50_000,
        myNet: -50_000,
        intent: 'normal',
        link: {
          rowId: 'g-early',
          walletId: 'w-vnd',
          categoryId: 'cat-group',
          intent: 'normal',
          excluded: false,
          tagIds: ['tag-other'],
        },
      },
    ];

    const result = tagFirstDates({
      wallets,
      entries,
      categories,
      tags,
      groupRows,
      groupSettings: defaultGroupSettings,
    });

    expect(result).toEqual({
      'tag-house': '2026-03-15',
      'tag-other': '2026-02-20',
    });
  });
});
