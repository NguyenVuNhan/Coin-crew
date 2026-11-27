import { describe, expect, it } from 'vitest';
import {
  budgetRows,
  budgetSpent,
  type BudgetDef,
  type BudgetPeriod,
  type CategoryView,
  type CountedSpendRow,
} from '../src/index';

const categories: CategoryView[] = [
  {
    id: 'c-food',
    parentId: null,
    type: 'expense',
    name: 'Food',
    icon: 'utensils',
    hidden: false,
    sortOrder: 0,
  },
  {
    id: 'c-coffee',
    parentId: 'c-food',
    type: 'expense',
    name: 'Coffee',
    icon: 'coffee',
    hidden: false,
    sortOrder: 1,
  },
  {
    id: 'c-travel',
    parentId: null,
    type: 'expense',
    name: 'Travel',
    icon: 'plane',
    hidden: false,
    sortOrder: 2,
  },
];

const period: BudgetPeriod = { from: '2026-11-01', to: '2026-11-30' };

const sampleRows: CountedSpendRow[] = [
  {
    kind: 'entry',
    id: 'r-food-early',
    walletId: 'w-1',
    currency: 'VND',
    date: '2026-11-05',
    amount: 100_000,
    categoryId: 'c-food',
    tagIds: [],
  },
  {
    kind: 'entry',
    id: 'r-coffee-late',
    walletId: 'w-1',
    currency: 'VND',
    date: '2026-11-20',
    amount: 55_000,
    categoryId: 'c-coffee',
    tagIds: ['t-work'],
  },
  {
    kind: 'group',
    id: 'r-group-mid',
    walletId: 'w-1',
    currency: 'VND',
    date: '2026-11-12',
    amount: 120_000,
    categoryId: 'c-food',
    tagIds: ['t-work'],
  },
  {
    kind: 'entry',
    id: 'r-excluded-wallet',
    walletId: 'w-excluded',
    currency: 'VND',
    date: '2026-11-15',
    amount: 500_000,
    categoryId: 'c-food',
    tagIds: ['t-work'],
  },
  {
    kind: 'group',
    id: 'r-null-wallet',
    walletId: null,
    currency: 'VND',
    date: '2026-11-16',
    amount: 90_000,
    categoryId: 'c-food',
    tagIds: ['t-work'],
  },
  {
    kind: 'entry',
    id: 'r-usd',
    walletId: 'w-usd',
    currency: 'USD',
    date: '2026-11-17',
    amount: 20,
    categoryId: 'c-food',
    tagIds: ['t-work'],
  },
  {
    kind: 'entry',
    id: 'r-outside-period',
    walletId: 'w-1',
    currency: 'VND',
    date: '2026-10-31',
    amount: 200_000,
    categoryId: 'c-food',
    tagIds: ['t-work'],
  },
  {
    kind: 'entry',
    id: 'r-travel-tag',
    walletId: 'w-1',
    currency: 'VND',
    date: '2026-11-25',
    amount: 300_000,
    categoryId: 'c-travel',
    tagIds: ['t-work'],
  },
];

describe('budgetRows', () => {
  it('filters category budget rows including sub-categories, respecting currency, wallets, and period, newest first', () => {
    const def: BudgetDef = {
      id: 'b-food',
      name: 'Food',
      target: { kind: 'category', categoryId: 'c-food' },
      currency: 'VND',
      periodKind: 'month',
      monthStartDay: 1,
      from: null,
      to: null,
      excludedWalletIds: ['w-excluded'],
      limits: [{ effectiveFrom: '2026-11-01', amount: 1_000_000 }],
      suggestionDismissedUntil: null,
      createdOn: '2026-11-01',
    };

    const matched = budgetRows(def, sampleRows, period, categories);
    expect(matched.map((r) => r.id)).toEqual(['r-coffee-late', 'r-group-mid', 'r-food-early']);
    expect(matched.reduce((sum, r) => sum + r.amount, 0)).toBe(
      budgetSpent(def, sampleRows, period, categories),
    );
  });

  it('filters tag budget rows across categories and matches budgetSpent sum', () => {
    const def: BudgetDef = {
      id: 'b-work',
      name: 'Work',
      target: { kind: 'tag', tagId: 't-work' },
      currency: 'VND',
      periodKind: 'month',
      monthStartDay: 1,
      from: null,
      to: null,
      excludedWalletIds: ['w-excluded'],
      limits: [{ effectiveFrom: '2026-11-01', amount: 1_000_000 }],
      suggestionDismissedUntil: null,
      createdOn: '2026-11-01',
    };

    const matched = budgetRows(def, sampleRows, period, categories);
    expect(matched.map((r) => r.id)).toEqual(['r-travel-tag', 'r-coffee-late', 'r-group-mid']);
    expect(matched.reduce((sum, r) => sum + r.amount, 0)).toBe(
      budgetSpent(def, sampleRows, period, categories),
    );
  });
});
