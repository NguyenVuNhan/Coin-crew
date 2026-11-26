import { describe, it, expect } from 'vitest';
import { budgetStarters, lastFullMonthSpent, type BudgetDef } from '../src/budgets';
import {
  UNCATEGORIZED_CATEGORY_ID,
  SYNTHETIC_GROUP_CATEGORY_ID,
  type CountedSpendRow,
} from '../src/reports';
import type { CategoryView } from '../src/api-types';

const TODAY = '2026-11-27';

function makeDef(overrides: Partial<BudgetDef> = {}): BudgetDef {
  return {
    id: 'b-1',
    name: 'Cà phê',
    target: { kind: 'category', categoryId: 'c-coffee' },
    currency: 'VND',
    periodKind: 'month',
    monthStartDay: 1,
    from: null,
    to: null,
    excludedWalletIds: [],
    limits: [{ effectiveFrom: '2026-01-01', amount: 1_000_000 }],
    suggestionDismissedUntil: null,
    createdOn: '2026-01-01',
    ...overrides,
  };
}

function makeCategory(
  id: string,
  name: string,
  parentId: string | null = null,
): CategoryView {
  return {
    id,
    parentId,
    type: 'expense',
    name,
    icon: 'utensils',
    hidden: false,
    sortOrder: 1,
  };
}

function makeRow(overrides: Partial<CountedSpendRow> = {}): CountedSpendRow {
  return {
    kind: 'entry',
    id: 'e-1',
    walletId: 'w-vnd',
    currency: 'VND',
    date: '2026-10-15',
    amount: 500_000,
    categoryId: 'c-food',
    tagIds: [],
    ...overrides,
  };
}

const CATEGORIES: CategoryView[] = [
  makeCategory('c-food', 'Ăn uống', null),
  makeCategory('c-coffee', 'Cà phê', 'c-food'),
  makeCategory('c-transport', 'Đi lại', null),
];

describe('budgetStarters sub-category budget exclusion', () => {
  it('excludes the top-level parent (Ăn uống) when a VND budget exists on its sub-category (Cà phê)', () => {
    const defs: BudgetDef[] = [
      makeDef({
        id: 'b-coffee',
        name: 'Cà phê',
        target: { kind: 'category', categoryId: 'c-coffee' },
        currency: 'VND',
      }),
    ];

    const rows: CountedSpendRow[] = [
      makeRow({ id: 'e-1', categoryId: 'c-food', amount: 2_000_000 }),
      makeRow({ id: 'e-2', categoryId: 'c-coffee', amount: 500_000 }),
      makeRow({ id: 'e-3', categoryId: 'c-transport', amount: 800_000 }),
    ];

    const result = budgetStarters(defs, rows, CATEGORIES, TODAY);
    expect(result).toEqual([
      { categoryId: 'c-transport', lastMonthSpent: 800_000, suggestedAmount: 800_000 },
    ]);
  });

  it('does not exclude the top-level parent when the sub-category budget is in another currency', () => {
    const defs: BudgetDef[] = [
      makeDef({
        id: 'b-coffee-usd',
        name: 'Coffee USD',
        target: { kind: 'category', categoryId: 'c-coffee' },
        currency: 'USD',
      }),
    ];

    const rows: CountedSpendRow[] = [
      makeRow({ id: 'e-1', categoryId: 'c-food', amount: 1_200_000 }),
    ];

    const result = budgetStarters(defs, rows, CATEGORIES, TODAY);
    expect(result).toEqual([
      { categoryId: 'c-food', lastMonthSpent: 1_200_000, suggestedAmount: 1_200_000 },
    ]);
  });
});

describe('lastFullMonthSpent synthetic & non-positive guards', () => {
  it('skips synthetic categories and non-positive row amounts', () => {
    const rows: CountedSpendRow[] = [
      makeRow({ id: 'e-pos', categoryId: 'c-food', amount: 400_000 }),
      makeRow({ id: 'e-zero', categoryId: 'c-food', amount: 0 }),
      makeRow({ id: 'e-neg', categoryId: 'c-food', amount: -100_000 }),
      makeRow({ id: 'e-uncat', categoryId: UNCATEGORIZED_CATEGORY_ID, amount: 300_000 }),
      makeRow({ id: 'e-group', categoryId: SYNTHETIC_GROUP_CATEGORY_ID, amount: 200_000 }),
    ];

    expect(lastFullMonthSpent(rows, 'c-food', CATEGORIES, TODAY)).toBe(400_000);
    expect(lastFullMonthSpent(rows, UNCATEGORIZED_CATEGORY_ID, CATEGORIES, TODAY)).toBe(0);
    expect(lastFullMonthSpent(rows, SYNTHETIC_GROUP_CATEGORY_ID, CATEGORIES, TODAY)).toBe(0);
  });
});
