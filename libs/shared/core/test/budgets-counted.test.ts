import { describe, it, expect } from 'vitest';
import {
  buildReport,
  listCountedSpending,
  type CountedSpendRow,
} from '../src/reports';
import type { CalcEntry } from '../src/wallets';
import type { GroupRow, GroupSettingsView } from '../src/groupShares';
import type { CategoryView, WalletDetailView } from '../src/api-types';

function createWallet(
  id: string,
  currency: 'VND' | 'USD' | 'USDT' = 'VND',
  overrides?: Partial<WalletDetailView>,
): WalletDetailView {
  return {
    id,
    name: `Wallet ${id}`,
    currency,
    balance: 10_000_000,
    isDefault: id === 'w-default',
    kind: 'everyday',
    startAmount: 10_000_000,
    startDate: '2026-01-01',
    startCostVnd: currency === 'VND' ? null : 25_000_000,
    vndValue: 10_000_000,
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
  type: CalcEntry['type'],
  amount: number,
  date: string,
  categoryId: string | null = null,
  tagIds: string[] = [],
  overrides?: Partial<CalcEntry>,
): CalcEntry & { categoryId: string | null; tagIds: string[] } {
  return {
    id,
    walletId,
    type,
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

function createGroupRow(
  id: string,
  date: string,
  source: 'expense' | 'fund' | 'payment',
  total: number,
  myShare: number,
  iPaid: boolean,
  overrides?: Partial<GroupRow>,
): GroupRow {
  return {
    kind: 'group',
    id,
    rootId: id,
    tripId: 'trip-1',
    tripName: 'Trip 1',
    isDirect: false,
    source,
    date,
    title: `Group row ${id}`,
    total,
    myShare,
    iPaid,
    payerName: iPaid ? 'Me' : 'Friend',
    counterpartName: iPaid ? 'Friend' : 'Me',
    people: ['Me', 'Friend'],
    pending: false,
    link: null,
    createdAt: `${date}T10:00:00Z`,
    activityAt: `${date}T10:00:00Z`,
    ...overrides,
  };
}

describe('listCountedSpending', () => {
  const defaultSettings: GroupSettingsView = {
    defaultGroupCategoryId: null,
    countLoans: false,
  };

  it('agrees with buildReport for one VND wallet', () => {
    const w = createWallet('w-default', 'VND', { isDefault: true });
    const entries = [
      createEntry('e-exp-1', w.id, 'expense', 120_000, '2026-11-05'),
      createEntry('e-exp-2', w.id, 'expense', 85_000, '2026-11-12'),
      createEntry('e-oct', w.id, 'expense', 50_000, '2026-10-20'),
      createEntry('e-inc', w.id, 'income', 500_000, '2026-11-06'),
      createEntry('e-xfer', w.id, 'transfer_out', 200_000, '2026-11-08', null, [], {
        excludeFromReports: true,
      }),
      createEntry('e-buy', w.id, 'buy', 300_000, '2026-11-09'),
      createEntry('e-adj', w.id, 'expense', 40_000, '2026-11-10', null, [], {
        source: 'adjustment',
      } as unknown as Partial<CalcEntry>),
    ];
    const groupRows = [
      createGroupRow('g-ok', '2026-11-15', 'expense', 180_000, 90_000, true),
      createGroupRow('g-pending', '2026-11-16', 'expense', 100_000, 50_000, false, {
        pending: true,
      }),
    ];

    const baseInput = {
      wallets: [w],
      entries,
      categories: [],
      tags: [],
      groupRows,
      groupSettings: defaultSettings,
    };

    const rows: CountedSpendRow[] = listCountedSpending(baseInput);
    const novSum = rows
      .filter((r) => r.walletId === w.id && r.date >= '2026-11-01' && r.date <= '2026-11-30')
      .reduce((acc, r) => acc + r.amount, 0);

    const report = buildReport({
      ...baseInput,
      query: { mode: 'month', month: '2026-11', walletId: w.id, includeGroups: true },
      today: '2026-11-26',
    });

    expect(novSum).toBe(report.totals.spent);
    expect(novSum).toBe(120_000 + 85_000 + 90_000);
  });

  it('includes rows from a wallet excluded from reports', () => {
    const wNormal = createWallet('w-normal', 'VND', { isDefault: true });
    const wExcluded = createWallet('w-excl', 'VND', { excludeFromReports: true });
    const wUsdExcl = createWallet('w-usd-excl', 'USD', { excludeFromReports: true });

    const rows = listCountedSpending({
      wallets: [wNormal, wExcluded, wUsdExcl],
      entries: [
        createEntry('e-norm', wNormal.id, 'expense', 100_000, '2026-11-05'),
        createEntry('e-excl', wExcluded.id, 'expense', 250_000, '2026-11-06'),
        createEntry('e-usd', wUsdExcl.id, 'expense', 1500, '2026-11-07'),
      ],
      categories: [],
      tags: [],
      groupRows: [
        createGroupRow('g-excl', '2026-11-08', 'expense', 200_000, 100_000, true, {
          link: {
            walletId: wExcluded.id,
            categoryId: null,
            tagIds: [],
            intent: null,
            excludeFromReports: false,
          },
        }),
      ],
      groupSettings: defaultSettings,
    });

    expect(rows.map((r) => r.id)).toEqual(['e-norm', 'e-excl', 'e-usd', 'g-excl']);
    expect(rows.find((r) => r.id === 'e-excl')).toMatchObject({
      kind: 'entry',
      walletId: wExcluded.id,
      currency: 'VND',
      amount: 250_000,
    });
    expect(rows.find((r) => r.id === 'e-usd')).toMatchObject({
      kind: 'entry',
      walletId: wUsdExcl.id,
      currency: 'USD',
      amount: 1500,
    });
    expect(rows.find((r) => r.id === 'g-excl')).toMatchObject({
      kind: 'group',
      walletId: wExcluded.id,
      currency: 'VND',
      amount: 100_000,
    });
  });

  it('never includes income, transfers, trades, adjustments or pending group rows', () => {
    const w = createWallet('w-default', 'VND', { isDefault: true });

    const rows = listCountedSpending({
      wallets: [w],
      entries: [
        createEntry('e-inc', w.id, 'income', 1_000_000, '2026-11-01'),
        createEntry('e-xfer-out', w.id, 'transfer_out', 200_000, '2026-11-02', null, [], {
          excludeFromReports: true,
        }),
        createEntry('e-xfer-in', w.id, 'transfer_in', 200_000, '2026-11-02', null, [], {
          excludeFromReports: true,
        }),
        createEntry('e-buy', w.id, 'buy', 500_000, '2026-11-03'),
        createEntry('e-sell', w.id, 'sell', 500_000, '2026-11-04'),
        createEntry('e-adj', w.id, 'expense', 75_000, '2026-11-05', null, [], {
          source: 'adjustment',
        } as unknown as Partial<CalcEntry>),
      ],
      categories: [],
      tags: [],
      groupRows: [
        createGroupRow('g-pending', '2026-11-06', 'expense', 300_000, 150_000, true, {
          pending: true,
        }),
      ],
      groupSettings: defaultSettings,
    });

    expect(rows).toEqual([]);
  });

  it('group row with no resolvable wallet has walletId null', () => {
    const wUsdOnly = createWallet('w-usd', 'USD', { isDefault: false });

    const rows = listCountedSpending({
      wallets: [wUsdOnly],
      entries: [],
      categories: [],
      tags: [],
      groupRows: [
        createGroupRow('g-no-wallet', '2026-11-10', 'expense', 120_000, 60_000, true, {
          link: null,
        }),
      ],
      groupSettings: defaultSettings,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: 'group',
      id: 'g-no-wallet',
      walletId: null,
      currency: 'VND',
      date: '2026-11-10',
      amount: 60_000,
    });
  });

  it('category ids match buildReport attribution', () => {
    const w = createWallet('w-default', 'VND', { isDefault: true });
    const categories: CategoryView[] = [
      {
        id: 'cat-food',
        name: 'Ăn uống',
        icon: 'utensils',
        type: 'expense',
        parentId: null,
        hidden: false,
        sortOrder: 1,
      },
      {
        id: 'cat-coffee',
        name: 'Cà phê',
        icon: 'coffee',
        type: 'expense',
        parentId: 'cat-food',
        hidden: false,
        sortOrder: 2,
      },
      {
        id: 'cat-dining',
        name: 'Nhà hàng',
        icon: 'burger',
        type: 'expense',
        parentId: 'cat-food',
        hidden: false,
        sortOrder: 3,
      },
    ];

    const baseInput = {
      wallets: [w],
      entries: [
        createEntry('e-sub', w.id, 'expense', 55_000, '2026-11-10', 'cat-coffee', ['tag-1']),
      ],
      categories,
      tags: [{ id: 'tag-1', name: 'Sáng', useCount: 2 }],
      groupRows: [
        createGroupRow('g-linked', '2026-11-11', 'expense', 240_000, 120_000, true, {
          link: {
            walletId: w.id,
            categoryId: 'cat-dining',
            tagIds: ['tag-1'],
            intent: null,
            excludeFromReports: false,
          },
        }),
      ],
      groupSettings: defaultSettings,
    };

    const counted = listCountedSpending(baseInput);
    const report = buildReport({
      ...baseInput,
      query: { mode: 'month', month: '2026-11', walletId: w.id, includeGroups: true },
      today: '2026-11-26',
    });

    const reportEntryRow = report.countedRows.find(
      (r) => r.kind === 'entry' && r.entryId === 'e-sub',
    );
    const reportGroupRow = report.countedRows.find(
      (r) => r.kind === 'group' && r.groupRowId === 'g-linked',
    );
    const countedEntryRow = counted.find((r) => r.kind === 'entry' && r.id === 'e-sub');
    const countedGroupRow = counted.find((r) => r.kind === 'group' && r.id === 'g-linked');

    expect(countedEntryRow?.categoryId).toBe('cat-coffee');
    expect(countedEntryRow?.categoryId).toBe(reportEntryRow?.categoryId);
    expect(countedEntryRow?.tagIds).toEqual(['tag-1']);

    expect(countedGroupRow?.categoryId).toBe('cat-dining');
    expect(countedGroupRow?.categoryId).toBe(reportGroupRow?.categoryId);
    expect(countedGroupRow?.tagIds).toEqual(['tag-1']);
  });
});
