import { describe, it, expect } from 'vitest';
import {
  budgetSuggestion,
  budgetImpacts,
  type BudgetDef,
  type BudgetPeriod,
  type BudgetDraft,
} from '../src/budgets';
import type { CountedSpendRow } from '../src/reports';
import type { CategoryView } from '../src/api-types';

const TODAY = '2026-11-26';

function makeDef(overrides: Partial<BudgetDef> = {}): BudgetDef {
  return {
    id: 'b-food',
    name: 'Ăn uống',
    target: { kind: 'category', categoryId: 'cat-food' },
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
    date: TODAY,
    amount: 100_000,
    categoryId: 'cat-food',
    tagIds: [],
    ...overrides,
  };
}

const SIX_MONTH_PERIODS: BudgetPeriod[] = [
  { from: '2026-10-01', to: '2026-10-31' },
  { from: '2026-09-01', to: '2026-09-30' },
  { from: '2026-08-01', to: '2026-08-31' },
  { from: '2026-07-01', to: '2026-07-31' },
  { from: '2026-06-01', to: '2026-06-30' },
  { from: '2026-05-01', to: '2026-05-31' },
];

describe('budgetSuggestion', () => {
  it('suggests raising limit after 6 completed periods over, rounded to 100_000 for VND', () => {
    const def = makeDef();
    const spents = [3_420_000, 3_510_000, 3_480_000, 3_600_000, 3_390_000, 3_540_000];
    const history = [
      // In-progress period must be ignored
      { period: { from: '2026-11-01', to: '2026-11-30' }, limit: 3_000_000, spent: 500_000 },
      ...SIX_MONTH_PERIODS.map((period, i) => ({
        period,
        limit: 3_000_000,
        spent: spents[i]!,
      })),
    ];

    const suggestion = budgetSuggestion(def, history, TODAY);
    expect(suggestion).toEqual({
      direction: 'raise',
      amount: 3_500_000,
      average: 3_490_000,
    });
  });

  it('suggests lowering limit after 6 completed periods strictly under 80%', () => {
    const def = makeDef();
    const spents = [1_900_000, 1_950_000, 1_920_000, 1_980_000, 1_910_000, 1_980_000];
    const history = SIX_MONTH_PERIODS.map((period, i) => ({
      period,
      limit: 3_000_000,
      spent: spents[i]!,
    }));

    const suggestion = budgetSuggestion(def, history, TODAY);
    expect(suggestion).toEqual({
      direction: 'lower',
      amount: 1_900_000,
      average: 1_940_000,
    });

    // Exactly 80% (2_400_000) is not strictly under 80%
    const boundaryHistory = history.map((h, i) => (i === 0 ? { ...h, spent: 2_400_000 } : h));
    expect(budgetSuggestion(def, boundaryHistory, TODAY)).toBeNull();
  });

  it('returns null after only 5 completed periods over', () => {
    const def = makeDef();
    const history = [
      { period: { from: '2026-11-01', to: '2026-11-30' }, limit: 3_000_000, spent: 3_500_000 },
      ...SIX_MONTH_PERIODS.slice(0, 5).map((period) => ({
        period,
        limit: 3_000_000,
        spent: 3_500_000,
      })),
    ];

    expect(budgetSuggestion(def, history, TODAY)).toBeNull();
  });

  it('never suggests for once budgets', () => {
    const def = makeDef({
      periodKind: 'once',
      monthStartDay: null,
      from: '2026-05-01',
      to: '2026-10-31',
    });
    const history = SIX_MONTH_PERIODS.map((period) => ({
      period,
      limit: 3_000_000,
      spent: 3_500_000,
    }));

    expect(budgetSuggestion(def, history, TODAY)).toBeNull();
  });

  it('returns null when dismissed until the latest period start, and suggests once all 6 start at or after dismissal', () => {
    const history = SIX_MONTH_PERIODS.map((period) => ({
      period,
      limit: 3_000_000,
      spent: 3_500_000,
    }));

    const dismissed = makeDef({ suggestionDismissedUntil: '2026-10-01' });
    expect(budgetSuggestion(dismissed, history, TODAY)).toBeNull();

    const cleared = makeDef({ suggestionDismissedUntil: '2026-05-01' });
    expect(budgetSuggestion(cleared, history, TODAY)).toEqual({
      direction: 'raise',
      amount: 3_500_000,
      average: 3_500_000,
    });
  });

  it('returns null when budget was created 4 periods ago even if older history is passed (B18)', () => {
    const def = makeDef({ createdOn: '2026-07-15' });
    const history = SIX_MONTH_PERIODS.map((period) => ({
      period,
      limit: 3_000_000,
      spent: 3_500_000,
    }));

    expect(budgetSuggestion(def, history, TODAY)).toBeNull();
  });

  it('rounds to one main unit for non-VND currencies (USD 10^2, JPY 10^0)', () => {
    const usdDef = makeDef({
      currency: 'USD',
      limits: [{ effectiveFrom: '2026-01-01', amount: 10_000 }], // $100.00
    });
    const usdHistory = SIX_MONTH_PERIODS.map((period) => ({
      period,
      limit: 10_000,
      spent: 12_360, // $123.60 -> rounds to $124.00 (12_400)
    }));
    expect(budgetSuggestion(usdDef, usdHistory, TODAY)).toEqual({
      direction: 'raise',
      amount: 12_400,
      average: 12_360,
    });

    const jpyDef = makeDef({
      currency: 'JPY',
      limits: [{ effectiveFrom: '2026-01-01', amount: 10_000 }],
    });
    const jpyHistory = SIX_MONTH_PERIODS.map((period) => ({
      period,
      limit: 10_000,
      spent: 12_345,
    }));
    expect(budgetSuggestion(jpyDef, jpyHistory, TODAY)).toEqual({
      direction: 'raise',
      amount: 12_345,
      average: 12_345,
    });
  });

  it('returns null when the rounded amount equals the current limit', () => {
    const def = makeDef({
      limits: [{ effectiveFrom: '2026-01-01', amount: 3_000_000 }],
    });
    const history = SIX_MONTH_PERIODS.map((period) => ({
      period,
      limit: 3_000_000,
      spent: 3_020_000, // rounds to 3_000_000 === current limit
    }));

    expect(budgetSuggestion(def, history, TODAY)).toBeNull();
  });
});

describe('budgetImpacts', () => {
  const categories: CategoryView[] = [
    makeCategory('cat-food', null),
    makeCategory('cat-coffee', 'cat-food'),
    makeCategory('cat-shop', null),
    makeCategory('cat-other', null),
  ];

  const baseDraft: BudgetDraft = {
    amount: 50_000,
    categoryId: 'cat-food',
    tagIds: [],
    date: TODAY,
    walletId: 'w-vnd',
    currency: 'VND',
  };

  it('returns [] when the budget stays fine', () => {
    const foodDef = makeDef({ id: 'b-food', name: 'Ăn uống' });
    const rows = [makeRow({ id: 'r1', amount: 1_000_000, categoryId: 'cat-food' })];

    expect(budgetImpacts([foodDef], rows, baseDraft, categories, TODAY)).toEqual([]);
  });

  it('returns [] for an expense with no budgeted category or tag, or in excluded wallet / other currency', () => {
    const foodDef = makeDef({
      id: 'b-food',
      excludedWalletIds: ['w-excluded'],
      limits: [{ effectiveFrom: '2026-01-01', amount: 100_000 }],
    });
    const rows = [makeRow({ id: 'r1', amount: 95_000, categoryId: 'cat-food' })];

    expect(
      budgetImpacts([foodDef], rows, { ...baseDraft, categoryId: 'cat-other' }, categories, TODAY),
    ).toEqual([]);
    expect(
      budgetImpacts([foodDef], rows, { ...baseDraft, categoryId: null }, categories, TODAY),
    ).toEqual([]);
    expect(
      budgetImpacts([foodDef], rows, { ...baseDraft, walletId: 'w-excluded' }, categories, TODAY),
    ).toEqual([]);
    expect(
      budgetImpacts([foodDef], rows, { ...baseDraft, currency: 'USD' }, categories, TODAY),
    ).toEqual([]);
  });

  it('returns one impact with after.state === fast when draft pushes Cà phê too fast', () => {
    const coffeeDef = makeDef({
      id: 'b-coffee',
      name: 'Cà phê',
      target: { kind: 'category', categoryId: 'cat-coffee' },
      periodKind: 'week',
      monthStartDay: null,
      limits: [{ effectiveFrom: '2026-01-01', amount: 300_000 }],
    });
    const rows = [
      makeRow({ id: 'r1', date: '2026-11-24', amount: 160_000, categoryId: 'cat-coffee' }),
    ];
    const draft: BudgetDraft = {
      ...baseDraft,
      categoryId: 'cat-coffee',
      amount: 45_000,
    };

    const impacts = budgetImpacts([coffeeDef], rows, draft, categories, TODAY);
    expect(impacts).toHaveLength(1);
    expect(impacts[0]!.budgetId).toBe('b-coffee');
    expect(impacts[0]!.name).toBe('Cà phê');
    expect(impacts[0]!.before.state).toBe('fine');
    expect(impacts[0]!.before.spent).toBe(160_000);
    expect(impacts[0]!.after.state).toBe('fast');
    expect(impacts[0]!.after.spent).toBe(205_000);
  });

  it('keeps impact for an already-over budget even with a small expense (B21)', () => {
    const shopDef = makeDef({
      id: 'b-shop',
      name: 'Mua sắm',
      target: { kind: 'category', categoryId: 'cat-shop' },
      limits: [{ effectiveFrom: '2026-01-01', amount: 1_500_000 }],
    });
    const rows = [
      makeRow({ id: 'r1', amount: 1_720_000, categoryId: 'cat-shop' }),
    ];
    const draft: BudgetDraft = {
      ...baseDraft,
      categoryId: 'cat-shop',
      amount: 40_000,
    };

    const impacts = budgetImpacts([shopDef], rows, draft, categories, TODAY);
    expect(impacts).toHaveLength(1);
    expect(impacts[0]!.before.state).toBe('over');
    expect(impacts[0]!.after.state).toBe('over');
    expect(impacts[0]!.after.spent).toBe(1_760_000);
    expect(impacts[0]!.after.left).toBe(-260_000);
  });

  it('sorts overlapping budgets by severity over > fast > near, ties narrower first (sub-category before parent, category before tag) (B20)', () => {
    const foodDef = makeDef({
      id: 'b-food',
      name: 'Ăn uống',
      target: { kind: 'category', categoryId: 'cat-food' },
      limits: [{ effectiveFrom: '2026-01-01', amount: 3_000_000 }],
    });
    const coffeeDef = makeDef({
      id: 'b-coffee',
      name: 'Cà phê',
      target: { kind: 'category', categoryId: 'cat-coffee' },
      limits: [{ effectiveFrom: '2026-01-01', amount: 1_000_000 }],
    });
    const tagDef = makeDef({
      id: 'b-tag',
      name: 'Đi làm',
      target: { kind: 'tag', tagId: 'tag-work' },
      limits: [{ effectiveFrom: '2026-01-01', amount: 1_000_000 }],
    });

    // All three end up in 'near' (>= 85%, projected < 110% on Nov 26: 26/30 = 86.7% elapsed)
    const rows = [
      makeRow({ id: 'r-food', amount: 1_850_000, categoryId: 'cat-food' }),
      makeRow({ id: 'r-coffee', amount: 850_000, categoryId: 'cat-coffee', tagIds: ['tag-work'] }),
    ];
    const draft: BudgetDraft = {
      ...baseDraft,
      categoryId: 'cat-coffee',
      tagIds: ['tag-work'],
      amount: 50_000,
    };

    // Pass in reverse order (tag, parent, child) to verify sorting
    const tieImpacts = budgetImpacts([tagDef, foodDef, coffeeDef], rows, draft, categories, TODAY);
    expect(tieImpacts.map((i) => i.budgetId)).toEqual(['b-coffee', 'b-food', 'b-tag']);
    expect(tieImpacts.every((i) => i.after.state === 'near')).toBe(true);

    // Severity overrides narrowness: tag is over, parent is fast (weekly), child is near
    const overTagDef = makeDef({
      id: 'b-tag-over',
      name: 'Tag over',
      target: { kind: 'tag', tagId: 'tag-work' },
      limits: [{ effectiveFrom: '2026-01-01', amount: 800_000 }],
    });
    const fastFoodDef = makeDef({
      id: 'b-food-fast',
      name: 'Food fast',
      target: { kind: 'category', categoryId: 'cat-food' },
      periodKind: 'week',
      monthStartDay: null,
      limits: [{ effectiveFrom: '2026-01-01', amount: 300_000 }],
    });
    const nearCoffeeDef = makeDef({
      id: 'b-coffee-near',
      name: 'Coffee near',
      target: { kind: 'category', categoryId: 'cat-coffee' },
      limits: [{ effectiveFrom: '2026-01-01', amount: 1_000_000 }],
    });
    const sevRows = [
      makeRow({ id: 's1', date: '2026-11-24', amount: 160_000, categoryId: 'cat-coffee', tagIds: ['tag-work'] }),
      makeRow({ id: 's2', date: '2026-11-10', amount: 700_000, categoryId: 'cat-coffee', tagIds: ['tag-work'] }),
    ];

    const sevImpacts = budgetImpacts(
      [nearCoffeeDef, fastFoodDef, overTagDef],
      sevRows,
      { ...baseDraft, categoryId: 'cat-coffee', tagIds: ['tag-work'], amount: 50_000 },
      categories,
      TODAY,
    );
    expect(sevImpacts.map((i) => [i.budgetId, i.after.state])).toEqual([
      ['b-tag-over', 'over'],
      ['b-food-fast', 'fast'],
      ['b-coffee-near', 'near'],
    ]);
  });

  it('editing entry e1 from 50_000 to 60_000 counts 60_000 once, not 110_000 (Review Focus 5)', () => {
    const coffeeDef = makeDef({
      id: 'b-coffee',
      name: 'Cà phê',
      target: { kind: 'category', categoryId: 'cat-coffee' },
      limits: [{ effectiveFrom: '2026-01-01', amount: 100_000 }],
    });
    const rows = [
      makeRow({ id: 'e1', amount: 50_000, categoryId: 'cat-coffee' }),
      makeRow({ id: 'e2', amount: 35_000, categoryId: 'cat-coffee' }),
    ];
    const draft: BudgetDraft = {
      ...baseDraft,
      categoryId: 'cat-coffee',
      amount: 60_000,
      replacesId: 'e1',
    };

    const impacts = budgetImpacts([coffeeDef], rows, draft, categories, TODAY);
    expect(impacts).toHaveLength(1);
    expect(impacts[0]!.before.spent).toBe(35_000);
    expect(impacts[0]!.after.spent).toBe(95_000);
    expect(impacts[0]!.after.state).toBe('near');
  });

  it('uses October period when draft is dated in October (B15)', () => {
    const foodDef = makeDef({
      id: 'b-food',
      name: 'Ăn uống',
      limits: [{ effectiveFrom: '2026-01-01', amount: 3_000_000 }],
    });
    const rows = [
      makeRow({ id: 'oct-1', date: '2026-10-10', amount: 2_700_000, categoryId: 'cat-food' }),
      makeRow({ id: 'nov-1', date: '2026-11-10', amount: 200_000, categoryId: 'cat-food' }),
    ];
    const draft: BudgetDraft = {
      ...baseDraft,
      date: '2026-10-15',
      amount: 400_000,
    };

    const impacts = budgetImpacts([foodDef], rows, draft, categories, TODAY);
    expect(impacts).toHaveLength(1);
    expect(impacts[0]!.before.period).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(impacts[0]!.before.spent).toBe(2_700_000);
    expect(impacts[0]!.after.spent).toBe(3_100_000);
    expect(impacts[0]!.after.state).toBe('over');
  });
});
