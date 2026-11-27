import { describe, it, expect } from 'vitest';
import {
  budgetStarters,
  lastFullMonthSpent,
  type BudgetDef,
} from '../src/budgets';
import {
  UNCATEGORIZED_CATEGORY_ID,
  SYNTHETIC_GROUP_CATEGORY_ID,
  SYNTHETIC_LEND_CATEGORY_ID,
  SYNTHETIC_BORROW_CATEGORY_ID,
  type CountedSpendRow,
} from '../src/reports';
import type { CategoryView } from '../src/api-types';

const TODAY = '2026-11-27'; // last full month: 2026-10-01..2026-10-31

function makeDef(overrides: Partial<BudgetDef> = {}): BudgetDef {
  return {
    id: 'b-1',
    name: 'Ăn uống',
    target: { kind: 'category', categoryId: 'c-food' },
    currency: 'VND',
    periodKind: 'month',
    monthStartDay: 1,
    from: null,
    to: null,
    excludedWalletIds: [],
    limits: [{ effectiveFrom: '2026-01-01', amount: 3_000_000 }],
    suggestionDismissedUntil: null,
    createdOn: '2026-01-01',
    ...overrides,
  };
}

function makeCategory(
  id: string,
  parentId: string | null = null,
  overrides: Partial<CategoryView> = {},
): CategoryView {
  return {
    id,
    parentId,
    type: 'expense',
    name: id,
    icon: 'utensils',
    hidden: false,
    sortOrder: 1,
    ...overrides,
  };
}

function makeRow(overrides: Partial<CountedSpendRow> = {}): CountedSpendRow {
  return {
    kind: 'entry',
    id: 'e-1',
    walletId: 'w-vnd',
    currency: 'VND',
    date: '2026-10-15',
    amount: 100_000,
    categoryId: 'c-food',
    tagIds: [],
    ...overrides,
  };
}

const BASE_CATEGORIES: CategoryView[] = [
  makeCategory('c-food'),
  makeCategory('c-coffee', 'c-food'),
  makeCategory('c-espresso', 'c-coffee'),
  makeCategory('c-transport'),
  makeCategory('c-shopping'),
  makeCategory('c-bills'),
  makeCategory('c-salary', null, { type: 'income' }),
  makeCategory('c-hidden', null, { hidden: true }),
];

describe('budgetStarters', () => {
  it('returns top 3 categories sorted by spend desc with suggestedAmount rounded up to 100_000 VND', () => {
    const rows: CountedSpendRow[] = [
      makeRow({ id: 'e-1', categoryId: 'c-food', amount: 2_130_000 }),
      makeRow({ id: 'e-2', categoryId: 'c-transport', amount: 2_000_000 }),
      makeRow({ id: 'e-3', categoryId: 'c-shopping', amount: 450_000 }),
      makeRow({ id: 'e-4', categoryId: 'c-bills', amount: 120_000 }),
    ];

    const result = budgetStarters([], rows, BASE_CATEGORIES, TODAY);
    expect(result).toEqual([
      { categoryId: 'c-food', lastMonthSpent: 2_130_000, suggestedAmount: 2_200_000 },
      { categoryId: 'c-transport', lastMonthSpent: 2_000_000, suggestedAmount: 2_000_000 },
      { categoryId: 'c-shopping', lastMonthSpent: 450_000, suggestedAmount: 500_000 },
    ]);

    expect(budgetStarters([], rows, BASE_CATEGORIES, TODAY, { max: 2 })).toHaveLength(2);
  });

  it('skips categories that already have a VND category budget (including sub-categories rolling up to it)', () => {
    const defs: BudgetDef[] = [
      makeDef({ id: 'b-food', target: { kind: 'category', categoryId: 'c-food' }, currency: 'VND' }),
      // Tag budget and USD budget should NOT exclude VND category starters
      makeDef({ id: 'b-tag', target: { kind: 'tag', tagId: 't-1' }, currency: 'VND' }),
      makeDef({
        id: 'b-usd',
        target: { kind: 'category', categoryId: 'c-transport' },
        currency: 'USD',
      }),
    ];

    const rows: CountedSpendRow[] = [
      makeRow({ id: 'e-1', categoryId: 'c-food', amount: 3_000_000 }),
      makeRow({ id: 'e-2', categoryId: 'c-coffee', amount: 500_000 }),
      makeRow({ id: 'e-3', categoryId: 'c-transport', amount: 1_200_000 }),
      makeRow({ id: 'e-4', categoryId: 'c-shopping', amount: 800_000 }),
    ];

    const result = budgetStarters(defs, rows, BASE_CATEGORIES, TODAY);
    expect(result.map((s) => s.categoryId)).toEqual(['c-transport', 'c-shopping']);
  });

  it('returns [] when there are no last-month rows', () => {
    const rows: CountedSpendRow[] = [
      makeRow({ id: 'e-curr', date: '2026-11-01', amount: 500_000 }),
      makeRow({ id: 'e-older', date: '2026-09-30', amount: 500_000 }),
    ];

    expect(budgetStarters([], [], BASE_CATEGORIES, TODAY)).toEqual([]);
    expect(budgetStarters([], rows, BASE_CATEGORIES, TODAY)).toEqual([]);
  });

  it('rolls up sub-category and nested sub-category spending to the top-level parent', () => {
    const rows: CountedSpendRow[] = [
      makeRow({ id: 'e-1', categoryId: 'c-food', amount: 1_000_000 }),
      makeRow({ id: 'e-2', categoryId: 'c-coffee', amount: 600_000 }),
      makeRow({ id: 'e-3', categoryId: 'c-espresso', amount: 530_000 }),
      makeRow({ id: 'e-4', categoryId: 'c-transport', amount: 1_500_000 }),
    ];

    const result = budgetStarters([], rows, BASE_CATEGORIES, TODAY);
    expect(result).toEqual([
      { categoryId: 'c-food', lastMonthSpent: 2_130_000, suggestedAmount: 2_200_000 },
      { categoryId: 'c-transport', lastMonthSpent: 1_500_000, suggestedAmount: 1_500_000 },
    ]);
  });

  it('skips synthetic, income, hidden, and unknown categories', () => {
    const rows: CountedSpendRow[] = [
      makeRow({ id: 'e-1', categoryId: UNCATEGORIZED_CATEGORY_ID, amount: 5_000_000 }),
      makeRow({ id: 'e-2', categoryId: SYNTHETIC_GROUP_CATEGORY_ID, amount: 4_000_000 }),
      makeRow({ id: 'e-3', categoryId: SYNTHETIC_LEND_CATEGORY_ID, amount: 3_000_000 }),
      makeRow({ id: 'e-4', categoryId: SYNTHETIC_BORROW_CATEGORY_ID, amount: 2_000_000 }),
      makeRow({ id: 'e-5', categoryId: 'c-salary', amount: 9_000_000 }),
      makeRow({ id: 'e-6', categoryId: 'c-hidden', amount: 8_000_000 }),
      makeRow({ id: 'e-7', categoryId: 'c-does-not-exist', amount: 7_000_000 }),
      makeRow({ id: 'e-8', categoryId: 'c-food', amount: 50_000 }),
    ];

    const result = budgetStarters([], rows, BASE_CATEGORIES, TODAY);
    expect(result).toEqual([
      { categoryId: 'c-food', lastMonthSpent: 50_000, suggestedAmount: 100_000 },
    ]);
  });

  it('ignores USD rows by default', () => {
    const rows: CountedSpendRow[] = [
      makeRow({ id: 'e-usd', currency: 'USD', categoryId: 'c-shopping', amount: 50_000 }),
      makeRow({ id: 'e-vnd', walletId: 'w-vnd', categoryId: 'c-food', amount: 310_000 }),
    ];

    const result = budgetStarters([], rows, BASE_CATEGORIES, TODAY);
    expect(result).toEqual([
      { categoryId: 'c-food', lastMonthSpent: 310_000, suggestedAmount: 400_000 },
    ]);
  });

  it('handles year boundary and leap February for last full calendar month', () => {
    const decRows: CountedSpendRow[] = [
      makeRow({ id: 'e-dec-1', date: '2025-12-01', categoryId: 'c-food', amount: 150_000 }),
      makeRow({ id: 'e-dec-2', date: '2025-12-31', categoryId: 'c-food', amount: 250_000 }),
      makeRow({ id: 'e-jan', date: '2026-01-01', categoryId: 'c-food', amount: 999_000 }),
    ];
    expect(budgetStarters([], decRows, BASE_CATEGORIES, '2026-01-15')).toEqual([
      { categoryId: 'c-food', lastMonthSpent: 400_000, suggestedAmount: 400_000 },
    ]);

    const febRows: CountedSpendRow[] = [
      makeRow({ id: 'e-feb-29', date: '2028-02-29', categoryId: 'c-transport', amount: 210_000 }),
      makeRow({ id: 'e-mar-1', date: '2028-03-01', categoryId: 'c-transport', amount: 500_000 }),
    ];
    expect(budgetStarters([], febRows, BASE_CATEGORIES, '2028-03-05')).toEqual([
      { categoryId: 'c-transport', lastMonthSpent: 210_000, suggestedAmount: 300_000 },
    ]);
  });
});

describe('lastFullMonthSpent', () => {
  it('sums last full calendar month spending including sub-categories and ignores other months/currencies', () => {
    const rows: CountedSpendRow[] = [
      makeRow({ id: 'e-1', date: '2026-10-01', categoryId: 'c-food', amount: 1_000_000 }),
      makeRow({ id: 'e-2', date: '2026-10-31', categoryId: 'c-coffee', amount: 250_000 }),
      makeRow({ id: 'e-3', date: '2026-10-15', categoryId: 'c-espresso', amount: 50_000 }),
      makeRow({ id: 'e-4', date: '2026-10-15', categoryId: 'c-transport', amount: 400_000 }),
      makeRow({ id: 'e-5', date: '2026-11-01', categoryId: 'c-food', amount: 900_000 }),
      makeRow({ id: 'e-6', date: '2026-09-30', categoryId: 'c-food', amount: 900_000 }),
      makeRow({
        id: 'e-7',
        date: '2026-10-20',
        categoryId: 'c-food',
        currency: 'USD',
        amount: 10_000,
      }),
    ];

    expect(lastFullMonthSpent(rows, 'c-food', BASE_CATEGORIES, TODAY)).toBe(1_300_000);
    expect(lastFullMonthSpent(rows, 'c-coffee', BASE_CATEGORIES, TODAY)).toBe(300_000);
    expect(lastFullMonthSpent(rows, 'c-bills', BASE_CATEGORIES, TODAY)).toBe(0);
    expect(lastFullMonthSpent(rows, 'c-food', BASE_CATEGORIES, TODAY, 'USD')).toBe(10_000);
  });
});
