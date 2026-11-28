import { describe, it, expect } from 'vitest';
import {
  buildReport,
  listCountedSpending,
  type CountedSpendRow,
} from '../src/reports';
import { summarizeEvent, eventRows, type EventDef } from '../src/events';
import type { CalcEntry } from '../src/wallets';
import type { GroupRow, GroupSettingsView } from '../src/groupShares';
import type { CategoryView, TagView, WalletDetailView } from '../src/api-types';
import type { CurrencyCode } from '../src/currency';

function createWallet(
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

function createEntry(
  id: string,
  walletId: string,
  amount: number,
  date: string,
  categoryId = 'cat-food',
  tagIds: string[] = [],
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
  };
}

function createRow(
  overrides: Partial<CountedSpendRow> & Pick<CountedSpendRow, 'id' | 'amount' | 'date'>,
): CountedSpendRow {
  return {
    kind: 'entry',
    walletId: 'w-vnd',
    currency: 'VND',
    categoryId: 'cat-food',
    tagIds: ['tag-trip'],
    vnd: overrides.currency && overrides.currency !== 'VND' ? null : overrides.amount,
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
  },
  {
    id: 'cat-coffee',
    parentId: 'cat-food',
    type: 'expense',
    name: 'Coffee',
    icon: 'coffee',
    hidden: false,
    sortOrder: 2,
  },
  {
    id: 'cat-stay',
    parentId: null,
    type: 'expense',
    name: 'Stay',
    icon: 'bed',
    hidden: false,
    sortOrder: 3,
  },
];

const tripDef: EventDef = {
  id: 'tr-1',
  tagId: 'tag-trip',
  name: 'Đà Lạt',
  start: '2026-11-10',
  end: '2026-11-14',
  countsFrom: '2026-11-01',
  groupIds: ['trip-g1'],
  budgetId: null,
};

describe('events summary', () => {
  it('agrees with the report for the trip tag and range', () => {
    const wallets: WalletDetailView[] = [
      createWallet('w-vnd', 'VND'),
      createWallet('w-excluded', 'VND', { excludeFromReports: true, isDefault: false }),
    ];

    const tags: TagView[] = [
      { id: 'tag-trip', name: 'Đà Lạt', useCount: 0 },
    ];

    const entries = [
      createEntry('e-own', 'w-vnd', 200_000, '2026-11-10', 'cat-food', ['tag-trip']),
      createEntry('e-sub', 'w-vnd', 50_000, '2026-11-11', 'cat-coffee', ['tag-trip']),
      createEntry('e-excluded-wallet', 'w-excluded', 999_000, '2026-11-12', 'cat-food', ['tag-trip']),
      createEntry('e-other-tag', 'w-vnd', 100_000, '2026-11-12', 'cat-food', []),
    ];

    const groupRows: GroupRow[] = [
      {
        kind: 'group',
        id: 'g-approved',
        rootId: 'g-approved',
        tripId: 'trip-g1',
        tripName: 'Đà Lạt',
        isDirect: false,
        source: 'expense',
        date: '2026-11-12',
        title: 'Hotel',
        total: 600_000,
        myShare: 300_000,
        iPaid: false,
        payerName: 'Friend',
        counterpartName: 'Me',
        people: ['Me', 'Friend'],
        pending: false,
        link: {
          walletId: 'w-vnd',
          categoryId: 'cat-stay',
          tagIds: ['tag-trip'],
          intent: 'shared',
          excludeFromReports: false,
        },
        createdAt: '2026-11-12T10:00:00Z',
        activityAt: '2026-11-12T10:00:00Z',
      },
      {
        kind: 'group',
        id: 'g-pending',
        rootId: 'g-pending',
        tripId: 'trip-g1',
        tripName: 'Đà Lạt',
        isDirect: false,
        source: 'expense',
        date: '2026-11-13',
        title: 'Dinner',
        total: 400_000,
        myShare: 200_000,
        iPaid: false,
        payerName: 'Friend',
        counterpartName: 'Me',
        people: ['Me', 'Friend'],
        pending: true,
        link: {
          walletId: 'w-vnd',
          categoryId: 'cat-food',
          tagIds: ['tag-trip'],
          intent: 'shared',
          excludeFromReports: false,
        },
        createdAt: '2026-11-13T10:00:00Z',
        activityAt: '2026-11-13T10:00:00Z',
      },
    ];

    const groupSettings: GroupSettingsView = {
      defaultGroupCategoryId: 'cat-food',
      countLoans: false,
    };

    const rows = listCountedSpending({
      wallets,
      entries,
      categories,
      tags,
      groupRows,
      groupSettings,
    });

    const summary = summarizeEvent(tripDef, rows, wallets, categories);
    const report = buildReport({
      wallets,
      entries,
      categories,
      tags,
      groupRows,
      groupSettings,
      query: {
        mode: 'custom',
        from: tripDef.countsFrom,
        to: tripDef.end,
        includeGroups: true,
      },
      today: '2026-11-20',
    });

    const reportTag = report.tags.expense.find((t) => t.tagId === tripDef.tagId);
    expect(reportTag).toBeDefined();
    expect(summary.currencies).toHaveLength(1);
    expect(summary.currencies[0]!.total).toBe(reportTag!.amount);
    expect(summary.currencies[0]!.total).toBe(550_000);
    expect(summary.rowIds).not.toContain('e-excluded-wallet');
  });

  it('two trips on one tag count only their own dates', () => {
    const wallets = [createWallet('w-vnd', 'VND')];
    const trip1: EventDef = {
      id: 'tr-2025',
      tagId: 'tag-dalat',
      name: 'Đà Lạt 2025',
      start: '2025-03-10',
      end: '2025-03-12',
      countsFrom: '2025-03-01',
      groupIds: [],
      budgetId: null,
    };
    const trip2: EventDef = {
      id: 'tr-2026',
      tagId: 'tag-dalat',
      name: 'Đà Lạt 2026',
      start: '2026-11-10',
      end: '2026-11-12',
      countsFrom: '2026-11-05',
      groupIds: [],
      budgetId: null,
    };

    const rows: CountedSpendRow[] = [
      createRow({ id: 'r1', amount: 300_000, date: '2025-03-10', tagIds: ['tag-dalat'] }),
      createRow({ id: 'r2', amount: 500_000, date: '2026-11-11', tagIds: ['tag-dalat'] }),
      createRow({ id: 'r3', amount: 900_000, date: '2026-10-01', tagIds: ['tag-dalat'] }),
    ];

    const s1 = summarizeEvent(trip1, rows, wallets, categories);
    const s2 = summarizeEvent(trip2, rows, wallets, categories);

    expect(s1.currencies[0]?.total).toBe(300_000);
    expect(s1.rowIds).toEqual(['r1']);
    expect(s2.currencies[0]?.total).toBe(500_000);
    expect(s2.rowIds).toEqual(['r2']);
  });

  it('own vs group split', () => {
    const wallets = [createWallet('w-vnd', 'VND')];
    const rows: CountedSpendRow[] = [
      createRow({ id: 'r-own-1', kind: 'entry', amount: 120_000, date: '2026-11-10' }),
      createRow({ id: 'r-own-2', kind: 'entry', amount: 80_000, date: '2026-11-11' }),
      createRow({ id: 'r-grp-1', kind: 'group', amount: 350_000, date: '2026-11-12' }),
    ];

    const summary = summarizeEvent(tripDef, rows, wallets, categories);
    const vnd = summary.currencies[0]!;
    expect(vnd.own).toBe(200_000);
    expect(vnd.group).toBe(350_000);
    expect(vnd.total).toBe(550_000);
    expect(vnd.count).toBe(3);
  });

  it('byDay puts lead-up rows in one leadup bucket first', () => {
    const wallets = [createWallet('w-vnd', 'VND')];
    const rows: CountedSpendRow[] = [
      createRow({ id: 'r-d2', amount: 100_000, date: '2026-11-12' }),
      createRow({ id: 'r-lead-1', amount: 400_000, date: '2026-11-02' }),
      createRow({ id: 'r-lead-2', amount: 250_000, date: '2026-11-09' }),
      createRow({ id: 'r-d1', amount: 150_000, date: '2026-11-10' }),
    ];

    const summary = summarizeEvent(tripDef, rows, wallets, categories);
    expect(summary.currencies[0]!.byDay).toEqual([
      { date: 'leadup', amount: 650_000 },
      { date: '2026-11-10', amount: 150_000 },
      { date: '2026-11-12', amount: 100_000 },
    ]);
  });

  it('byCategory rolls sub-categories into their top-level parent', () => {
    const wallets = [createWallet('w-vnd', 'VND')];
    const rows: CountedSpendRow[] = [
      createRow({ id: 'r1', amount: 100_000, date: '2026-11-10', categoryId: 'cat-food' }),
      createRow({ id: 'r2', amount: 75_000, date: '2026-11-11', categoryId: 'cat-coffee' }),
      createRow({ id: 'r3', amount: 300_000, date: '2026-11-12', categoryId: 'cat-stay' }),
    ];

    const summary = summarizeEvent(tripDef, rows, wallets, categories);
    expect(summary.currencies[0]!.byCategory).toEqual([
      { categoryId: 'cat-stay', amount: 300_000 },
      { categoryId: 'cat-food', amount: 175_000 },
    ]);
  });

  it('currencies apart: ₫ and ฿ rows give two summaries, VND first', () => {
    const wallets = [
      createWallet('w-vnd', 'VND'),
      createWallet('w-thb', 'THB', { isDefault: false }),
    ];
    const rows: CountedSpendRow[] = [
      createRow({
        id: 'r-thb',
        walletId: 'w-thb',
        currency: 'THB',
        amount: 1200,
        vnd: 900_000,
        date: '2026-11-11',
      }),
      createRow({
        id: 'r-vnd',
        walletId: 'w-vnd',
        currency: 'VND',
        amount: 500_000,
        vnd: 500_000,
        date: '2026-11-10',
      }),
    ];

    const summary = summarizeEvent(tripDef, rows, wallets, categories);
    expect(summary.currencies.map((c) => c.currency)).toEqual(['VND', 'THB']);
    expect(summary.currencies[0]!.total).toBe(500_000);
    expect(summary.currencies[1]!.total).toBe(1200);
  });

  it('approxVnd sums vnd when every row is rated, null when one ฿ row is unrated, null when only VND', () => {
    const wallets = [
      createWallet('w-vnd', 'VND'),
      createWallet('w-thb', 'THB', { isDefault: false }),
    ];

    const ratedRows: CountedSpendRow[] = [
      createRow({ id: 'r1', walletId: 'w-vnd', currency: 'VND', amount: 500_000, vnd: 500_000, date: '2026-11-10' }),
      createRow({ id: 'r2', walletId: 'w-thb', currency: 'THB', amount: 1000, vnd: 750_000, date: '2026-11-11' }),
    ];
    expect(summarizeEvent(tripDef, ratedRows, wallets, categories).approxVnd).toBe(1_250_000);

    const unratedRows: CountedSpendRow[] = [
      ...ratedRows,
      createRow({ id: 'r3', walletId: 'w-thb', currency: 'THB', amount: 200, vnd: null, date: '2026-11-12' }),
    ];
    expect(summarizeEvent(tripDef, unratedRows, wallets, categories).approxVnd).toBeNull();

    const undefinedVndRows: CountedSpendRow[] = [
      ratedRows[0]!,
      { id: 'r4', kind: 'entry', walletId: 'w-thb', currency: 'THB', date: '2026-11-12', amount: 200, categoryId: 'cat-food', tagIds: ['tag-trip'] },
    ];
    expect(summarizeEvent(tripDef, undefinedVndRows, wallets, categories).approxVnd).toBeNull();

    const onlyVndRows: CountedSpendRow[] = [ratedRows[0]!];
    expect(summarizeEvent(tripDef, onlyVndRows, wallets, categories).approxVnd).toBeNull();
  });

  it('limit currency with no rows', () => {
    const wallets = [createWallet('w-thb', 'THB', { isDefault: false })];
    const rows: CountedSpendRow[] = [
      createRow({
        id: 'r-thb',
        walletId: 'w-thb',
        currency: 'THB',
        amount: 800,
        vnd: 600_000,
        date: '2026-11-11',
      }),
    ];

    const summary = summarizeEvent(tripDef, rows, wallets, categories);
    expect(summary.currencies).toHaveLength(1);
    expect(summary.currencies[0]!.currency).toBe('THB');
    expect(summary.currencies[0]!.total).toBe(800);
    expect(summary.approxVnd).toBe(600_000);
  });

  it('eventRows drops null walletId and excludeFromReports wallets', () => {
    const wallets = [
      createWallet('w-vnd', 'VND'),
      createWallet('w-ex', 'VND', { excludeFromReports: true, isDefault: false }),
    ];
    const rows: CountedSpendRow[] = [
      createRow({ id: 'r-ok', walletId: 'w-vnd', amount: 100_000, date: '2026-11-10' }),
      createRow({ id: 'r-null', walletId: null, amount: 100_000, date: '2026-11-10' }),
      createRow({ id: 'r-ex', walletId: 'w-ex', amount: 100_000, date: '2026-11-10' }),
    ];

    expect(eventRows(tripDef, rows, wallets).map((r) => r.id)).toEqual(['r-ok']);
  });
});
