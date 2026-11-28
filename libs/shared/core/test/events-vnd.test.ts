import { describe, it, expect } from 'vitest';
import { listCountedSpending } from '../src/reports';
import type { CalcEntry } from '../src/wallets';
import type { GroupRow, GroupSettingsView } from '../src/groupShares';
import type { CategoryView, WalletDetailView } from '../src/api-types';

function createWallet(
  id: string,
  currency: 'VND' | 'USD',
  overrides?: Partial<WalletDetailView>,
): WalletDetailView {
  return {
    id,
    name: `Wallet ${id}`,
    currency,
    balance: 1000,
    isDefault: id === 'w-vnd',
    kind: 'everyday',
    startAmount: 1000,
    startDate: '2026-01-01',
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
    tagIds: [],
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
];

const groupSettings: GroupSettingsView = {
  defaultGroupCategoryId: 'cat-food',
  countLoans: false,
};

describe('listCountedSpending rows carry vnd', () => {
  it('VND rows equal amount, rated foreign rows use the wallet cost, unrated foreign rows are null', () => {
    const wallets: WalletDetailView[] = [
      createWallet('w-vnd', 'VND', { startAmount: 10_000_000, balance: 10_000_000 }),
      createWallet('w-usd-rated', 'USD', { startAmount: 1000, startCostVnd: 25_000_000 }),
      createWallet('w-usd-unrated', 'USD', {
        startAmount: 1000,
        startCostVnd: null,
        vndValue: null,
      }),
    ];

    const entries = [
      createEntry('e-vnd', 'w-vnd', 150_000, '2026-11-20'),
      createEntry('e-usd-rated', 'w-usd-rated', 10, '2026-11-21'),
      createEntry('e-usd-unrated', 'w-usd-unrated', 20, '2026-11-22'),
    ];

    const groupRows: GroupRow[] = [
      {
        kind: 'group',
        id: 'g-1',
        rootId: 'g-1',
        tripId: 'trip-1',
        tripName: 'Trip 1',
        isDirect: false,
        source: 'expense',
        date: '2026-11-23',
        title: 'Dinner',
        total: 400_000,
        myShare: 200_000,
        iPaid: true,
        payerName: 'Me',
        counterpartName: 'Friend',
        people: ['Me', 'Friend'],
        pending: false,
        link: null,
        createdAt: '2026-11-23T10:00:00Z',
        activityAt: '2026-11-23T10:00:00Z',
      },
    ];

    const rows = listCountedSpending({
      wallets,
      entries,
      categories,
      tags: [],
      groupRows,
      groupSettings,
    });

    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get('e-vnd')?.vnd).toBe(150_000);
    expect(byId.get('e-usd-rated')?.vnd).toBe(250_000);
    expect(byId.get('e-usd-unrated')?.vnd).toBeNull();
    expect(byId.get('g-1')?.vnd).toBe(200_000);
  });
});
