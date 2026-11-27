import { describe, it, expect } from 'vitest';
import { budgetStarters, type BudgetDef } from '../src/budgets';
import type { CountedSpendRow } from '../src/reports';
import type { CategoryView } from '../src/api-types';

const TODAY = '2026-11-27';

function makeDef(overrides: Partial<BudgetDef> = {}): BudgetDef {
  return {
    id: 'b-1',
    name: 'Ăn uống',
    target: { kind: 'category', categoryId: 'c-food' },
    currency: 'VND',
    periodKind: 'once',
    monthStartDay: null,
    from: '2026-10-01',
    to: '2026-10-31',
    excludedWalletIds: [],
    limits: [{ effectiveFrom: '2026-10-01', amount: 1_000_000 }],
    suggestionDismissedUntil: null,
    createdOn: '2026-10-01',
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
  makeCategory('c-shop', 'Mua sắm', null),
  makeCategory('c-transport', 'Đi lại', null),
];

describe('budgetStarters ended once-budget handling', () => {
  it('does not exclude a category whose only budget is an ended once-budget (to < today)', () => {
    const defs: BudgetDef[] = [
      makeDef({
        id: 'b-ended',
        target: { kind: 'category', categoryId: 'c-food' },
        periodKind: 'once',
        from: '2026-10-01',
        to: '2026-11-26',
      }),
    ];

    const rows: CountedSpendRow[] = [
      makeRow({ id: 'e-1', categoryId: 'c-food', amount: 1_250_000 }),
    ];

    expect(budgetStarters(defs, rows, CATEGORIES, TODAY)).toEqual([
      { categoryId: 'c-food', lastMonthSpent: 1_250_000, suggestedAmount: 1_300_000 },
    ]);
  });

  it('does not exclude a parent category when an ended once-budget targeted its sub-category', () => {
    const defs: BudgetDef[] = [
      makeDef({
        id: 'b-coffee-ended',
        name: 'Cà phê',
        target: { kind: 'category', categoryId: 'c-coffee' },
        periodKind: 'once',
        from: '2026-10-01',
        to: '2026-10-31',
      }),
    ];

    const rows: CountedSpendRow[] = [
      makeRow({ id: 'e-1', categoryId: 'c-coffee', amount: 450_000 }),
    ];

    expect(budgetStarters(defs, rows, CATEGORIES, TODAY)).toEqual([
      { categoryId: 'c-food', lastMonthSpent: 450_000, suggestedAmount: 500_000 },
    ]);
  });

  it('still excludes categories with an active once-budget (to >= today) or a recurring budget', () => {
    const defs: BudgetDef[] = [
      makeDef({
        id: 'b-ends-today',
        name: 'Ăn uống',
        target: { kind: 'category', categoryId: 'c-food' },
        periodKind: 'once',
        from: '2026-11-01',
        to: TODAY,
      }),
      makeDef({
        id: 'b-future-once',
        name: 'Mua sắm',
        target: { kind: 'category', categoryId: 'c-shop' },
        periodKind: 'once',
        from: '2026-12-01',
        to: '2026-12-15',
      }),
      makeDef({
        id: 'b-monthly',
        name: 'Đi lại',
        target: { kind: 'category', categoryId: 'c-transport' },
        periodKind: 'month',
        monthStartDay: 1,
        from: null,
        to: null,
      }),
    ];

    const rows: CountedSpendRow[] = [
      makeRow({ id: 'e-1', categoryId: 'c-food', amount: 1_500_000 }),
      makeRow({ id: 'e-2', categoryId: 'c-shop', amount: 900_000 }),
      makeRow({ id: 'e-3', categoryId: 'c-transport', amount: 600_000 }),
    ];

    expect(budgetStarters(defs, rows, CATEGORIES, TODAY)).toEqual([]);
  });
});
