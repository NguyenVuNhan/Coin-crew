import { describe, it, expect } from 'vitest';
import {
  BUDGET_NEAR,
  BUDGET_FAST_MARGIN,
  BUDGET_SUGGEST_RUN,
  BUDGET_UNDER,
  budgetPeriodAt,
  firstBudgetPeriod,
  budgetPeriodsUpTo,
  limitFor,
  budgetSpent,
  budgetProgress,
  orderBudgets,
  type BudgetDef,
  type BudgetPeriod,
} from '../src/budgets';
import type { CountedSpendRow } from '../src/reports';
import type { CategoryView } from '../src/api-types';

const TODAY = '2026-11-26';

function makeDef(overrides: Partial<BudgetDef> = {}): BudgetDef {
  return {
    id: 'b-1',
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

describe('budget constants', () => {
  it('exports the expected threshold constants', () => {
    expect(BUDGET_NEAR).toBe(0.85);
    expect(BUDGET_FAST_MARGIN).toBe(1.1);
    expect(BUDGET_SUGGEST_RUN).toBe(6);
    expect(BUDGET_UNDER).toBe(0.8);
  });
});

describe('budgetPeriodAt', () => {
  it('computes monthly period starting on the 1st', () => {
    const def = makeDef({ periodKind: 'month', monthStartDay: 1 });
    expect(budgetPeriodAt(def, TODAY)).toEqual({ from: '2026-11-01', to: '2026-11-30' });
  });

  it('computes monthly period starting on the 25th', () => {
    const def = makeDef({ periodKind: 'month', monthStartDay: 25 });
    expect(budgetPeriodAt(def, TODAY)).toEqual({ from: '2026-11-25', to: '2026-12-24' });
  });

  it('clamps monthly start day 31 across short February (non-leap year 2027)', () => {
    const def = makeDef({ periodKind: 'month', monthStartDay: 31 });
    expect(budgetPeriodAt(def, '2027-02-15')).toEqual({ from: '2027-01-31', to: '2027-02-27' });
    expect(budgetPeriodAt(def, '2027-02-28')).toEqual({ from: '2027-02-28', to: '2027-03-30' });
  });

  it('clamps monthly start day 30 in leap-year February 2028', () => {
    const def = makeDef({ periodKind: 'month', monthStartDay: 30 });
    expect(budgetPeriodAt(def, '2028-02-28')).toEqual({ from: '2028-01-30', to: '2028-02-28' });
    expect(budgetPeriodAt(def, '2028-02-29')).toEqual({ from: '2028-02-29', to: '2028-03-29' });
  });

  it('begins a new period today when start day equals today', () => {
    const def = makeDef({ periodKind: 'month', monthStartDay: 26 });
    expect(budgetPeriodAt(def, TODAY)).toEqual({ from: '2026-11-26', to: '2026-12-25' });
  });

  it('computes weekly period (Monday to Sunday)', () => {
    const def = makeDef({ periodKind: 'week', monthStartDay: null });
    expect(budgetPeriodAt(def, TODAY)).toEqual({ from: '2026-11-23', to: '2026-11-29' });
  });

  it('computes yearly period (Jan 1 to Dec 31)', () => {
    const def = makeDef({ periodKind: 'year', monthStartDay: null });
    expect(budgetPeriodAt(def, TODAY)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });

  it('computes once period inside range and returns null outside range', () => {
    const def = makeDef({
      periodKind: 'once',
      monthStartDay: null,
      from: '2026-11-20',
      to: '2026-11-25',
    });
    expect(budgetPeriodAt(def, '2026-11-22')).toEqual({ from: '2026-11-20', to: '2026-11-25' });
    expect(budgetPeriodAt(def, '2026-11-19')).toBeNull();
    expect(budgetPeriodAt(def, TODAY)).toBeNull();
  });
});

describe('firstBudgetPeriod and budgetPeriodsUpTo', () => {
  it('returns periods from creation period up to current, newest first', () => {
    const def = makeDef({
      periodKind: 'month',
      monthStartDay: 1,
      createdOn: '2026-09-10',
    });
    expect(firstBudgetPeriod(def)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(budgetPeriodsUpTo(def, TODAY)).toEqual([
      { from: '2026-11-01', to: '2026-11-30' },
      { from: '2026-10-01', to: '2026-10-31' },
      { from: '2026-09-01', to: '2026-09-30' },
    ]);
  });

  it('returns the once range for firstBudgetPeriod and budgetPeriodsUpTo', () => {
    const def = makeDef({
      periodKind: 'once',
      monthStartDay: null,
      from: '2026-10-01',
      to: '2026-10-10',
      createdOn: '2026-09-25',
    });
    expect(firstBudgetPeriod(def)).toEqual({ from: '2026-10-01', to: '2026-10-10' });
    expect(budgetPeriodsUpTo(def, TODAY)).toEqual([{ from: '2026-10-01', to: '2026-10-10' }]);
  });
});

describe('limitFor', () => {
  it('picks the latest limit with effectiveFrom <= period.from', () => {
    const def = makeDef({
      limits: [
        { effectiveFrom: '2026-06-01', amount: 2_500_000 },
        { effectiveFrom: '2026-09-01', amount: 3_000_000 },
      ],
    });
    expect(limitFor(def, { from: '2026-08-01', to: '2026-08-31' })).toBe(2_500_000);
    expect(limitFor(def, { from: '2026-09-01', to: '2026-09-30' })).toBe(3_000_000);
    expect(limitFor(def, { from: '2026-11-01', to: '2026-11-30' })).toBe(3_000_000);
  });
});

describe('budgetSpent', () => {
  const categories: CategoryView[] = [
    makeCategory('cat-food', null),
    makeCategory('cat-coffee', 'cat-food'),
    makeCategory('cat-latte', 'cat-coffee'),
    makeCategory('cat-shop', null),
  ];

  const novPeriod: BudgetPeriod = { from: '2026-11-01', to: '2026-11-30' };

  it('counts direct and descendant categories, ignores other currencies, unticked wallets, null wallets, and out-of-range dates', () => {
    const def = makeDef({
      target: { kind: 'category', categoryId: 'cat-food' },
      currency: 'VND',
      excludedWalletIds: ['w-excluded'],
      createdOn: '2026-11-15',
    });

    const rows: CountedSpendRow[] = [
      // Before createdOn but inside the period — must count (Review Focus 1)
      makeRow({ id: 'r1', date: '2026-11-02', amount: 200_000, categoryId: 'cat-food' }),
      // Sub-category counts toward parent
      makeRow({ id: 'r2', date: '2026-11-10', amount: 55_000, categoryId: 'cat-coffee' }),
      // Grandchild category counts toward parent
      makeRow({ id: 'r3', date: '2026-11-12', amount: 45_000, categoryId: 'cat-latte' }),
      // Different category ignored
      makeRow({ id: 'r4', date: '2026-11-12', amount: 500_000, categoryId: 'cat-shop' }),
      // USD row ignored by VND budget
      makeRow({ id: 'r5', date: '2026-11-12', amount: 1_000, currency: 'USD', walletId: 'w-usd', categoryId: 'cat-food' }),
      // Unticked wallet ignored
      makeRow({ id: 'r6', date: '2026-11-12', amount: 150_000, walletId: 'w-excluded', categoryId: 'cat-food' }),
      // walletId: null ignored
      makeRow({ id: 'r7', date: '2026-11-12', amount: 120_000, walletId: null, categoryId: 'cat-food' }),
      // Outside period ignored
      makeRow({ id: 'r8', date: '2026-10-31', amount: 90_000, categoryId: 'cat-food' }),
    ];

    expect(budgetSpent(def, rows, novPeriod, categories)).toBe(300_000);
  });

  it('counts rows of any category carrying the target tag', () => {
    const def = makeDef({
      target: { kind: 'tag', tagId: 'tag-dalat' },
      currency: 'VND',
    });

    const rows: CountedSpendRow[] = [
      makeRow({ id: 't1', amount: 100_000, categoryId: 'cat-food', tagIds: ['tag-dalat'] }),
      makeRow({ id: 't2', amount: 250_000, categoryId: 'cat-shop', tagIds: ['tag-other', 'tag-dalat'] }),
      makeRow({ id: 't3', amount: 400_000, categoryId: 'cat-food', tagIds: ['tag-other'] }),
    ];

    expect(budgetSpent(def, rows, novPeriod, categories)).toBe(350_000);
  });
});

describe('budgetProgress states, thresholds and pace', () => {
  const novPeriod: BudgetPeriod = { from: '2026-11-01', to: '2026-11-30' };
  const weekPeriod: BudgetPeriod = { from: '2026-11-23', to: '2026-11-29' };

  it('classifies fine, near, over, and computes daily pace', () => {
    const foodDef = makeDef({
      id: 'b-food',
      limits: [{ effectiveFrom: '2026-01-01', amount: 3_000_000 }],
    });

    const fine = budgetProgress(foodDef, 2_130_000, novPeriod, TODAY);
    expect(fine.state).toBe('fine');
    expect(fine.left).toBe(870_000);
    expect(fine.daysLeft).toBe(5);
    expect(fine.elapsed).toBeCloseTo(26 / 30, 6);
    expect(fine.projectedOverPct).toBeNull();
    expect(fine.pace).toEqual({ unit: 'day', amount: 174_000 });
    expect(fine.ended).toBe(false);

    // 2_760_000 / 3_000_000 = 92% (>= 85%), projected = 92% / (26/30) = 106.15% (< 110%) => near
    const near = budgetProgress(foodDef, 2_760_000, novPeriod, TODAY);
    expect(near.state).toBe('near');
    expect(near.projectedOverPct).toBeNull();

    const shopDef = makeDef({
      id: 'b-shop',
      limits: [{ effectiveFrom: '2026-01-01', amount: 1_500_000 }],
    });
    const over = budgetProgress(shopDef, 1_720_000, novPeriod, TODAY);
    expect(over.state).toBe('over');
    expect(over.left).toBe(-220_000);
    expect(over.projectedOverPct).toBeNull();
    expect(over.pace).toBeNull();
  });

  it('classifies weekly fast vs fine on Thursday (elapsed 4/7)', () => {
    const coffeeDef = makeDef({
      id: 'b-coffee',
      periodKind: 'week',
      monthStartDay: null,
      limits: [{ effectiveFrom: '2026-01-01', amount: 300_000 }],
    });

    const fast = budgetProgress(coffeeDef, 200_000, weekPeriod, TODAY);
    expect(fast.state).toBe('fast');
    expect(fast.elapsed).toBeCloseTo(4 / 7, 6);
    expect(fast.projectedOverPct).toBeCloseTo(1 / 6, 4);

    const fine = budgetProgress(coffeeDef, 160_000, weekPeriod, TODAY);
    expect(fine.state).toBe('fine');
    expect(fine.projectedOverPct).toBeNull();
  });

  it('suppresses fast state during first 2 days of a month', () => {
    const def = makeDef({
      limits: [{ effectiveFrom: '2026-01-01', amount: 3_000_000 }],
    });
    // Day 2 of Nov (elapsed = 2/30); spent 234_000 gives projected 117% (> 110%)
    const day2 = budgetProgress(def, 234_000, novPeriod, '2026-11-02');
    expect(day2.state).toBe('fine');
    expect(day2.projectedOverPct).toBeNull();
  });

  it('suppresses fast state in first 5% of a 3-year once budget and computes monthly pace', () => {
    // 2025-12-01..2028-11-30 => 1096 days; on 2026-11-26, 25 calendar months left (Nov 2026..Nov 2028)
    const longPeriod: BudgetPeriod = { from: '2025-12-01', to: '2028-11-30' };
    const longDef = makeDef({
      id: 'b-house',
      periodKind: 'once',
      monthStartDay: null,
      from: longPeriod.from,
      to: longPeriod.to,
      limits: [{ effectiveFrom: longPeriod.from, amount: 200_000_000 }],
      createdOn: longPeriod.from,
    });

    // At ~4% elapsed (day 44 of 1096 = 2026-01-13), spent 12_000_000 (6%, projected ~150%) => not fast
    const early = budgetProgress(longDef, 12_000_000, longPeriod, '2026-01-13');
    expect(early.elapsed).toBeLessThan(0.05);
    expect(early.state).toBe('fine');

    // At ~31% elapsed (day 340 of 1096 = 2026-11-05, elapsed ≈ 0.3102), spent 82_000_000 (41%) => fast, projectedOverPct ≈ 0.32
    const mid = budgetProgress(longDef, 82_000_000, longPeriod, '2026-11-05');
    expect(mid.elapsed).toBeCloseTo(0.31, 2);
    expect(mid.state).toBe('fast');
    expect(mid.projectedOverPct).toBeCloseTo(0.32, 2);

    // Monthly pace on 2026-11-26: left = 118_000_000, 25 months left => 4_720_000 / month
    const paceCheck = budgetProgress(longDef, 82_000_000, longPeriod, TODAY);
    expect(paceCheck.left).toBe(118_000_000);
    expect(paceCheck.pace).toEqual({ unit: 'month', amount: 4_720_000 });
  });

  it('marks past once-budget as ended with null pace and elapsed 1', () => {
    const pastPeriod: BudgetPeriod = { from: '2026-10-01', to: '2026-10-05' };
    const onceDef = makeDef({
      id: 'b-trip',
      periodKind: 'once',
      monthStartDay: null,
      from: pastPeriod.from,
      to: pastPeriod.to,
      limits: [{ effectiveFrom: pastPeriod.from, amount: 5_000_000 }],
      createdOn: pastPeriod.from,
    });

    const prog = budgetProgress(onceDef, 4_000_000, pastPeriod, TODAY);
    expect(prog.ended).toBe(true);
    expect(prog.elapsed).toBe(1);
    expect(prog.daysLeft).toBe(0);
    expect(prog.pace).toBeNull();
  });
});

describe('orderBudgets', () => {
  it('groups and sorts over (by % desc), fast (by projected desc), onPace (by % desc), and ended last', () => {
    const novPeriod: BudgetPeriod = { from: '2026-11-01', to: '2026-11-30' };
    const weekPeriod: BudgetPeriod = { from: '2026-11-23', to: '2026-11-29' };
    const pastPeriod: BudgetPeriod = { from: '2026-10-01', to: '2026-10-05' };

    const overLow = budgetProgress(
      makeDef({ id: 'over-low', limits: [{ effectiveFrom: '2026-01-01', amount: 1_000_000 }] }),
      1_100_000,
      novPeriod,
      TODAY,
    );
    const overHigh = budgetProgress(
      makeDef({ id: 'over-high', limits: [{ effectiveFrom: '2026-01-01', amount: 1_000_000 }] }),
      1_500_000,
      novPeriod,
      TODAY,
    );
    const fastLow = budgetProgress(
      makeDef({ id: 'fast-low', periodKind: 'week', monthStartDay: null, limits: [{ effectiveFrom: '2026-01-01', amount: 300_000 }] }),
      200_000,
      weekPeriod,
      TODAY,
    );
    const fastHigh = budgetProgress(
      makeDef({ id: 'fast-high', periodKind: 'week', monthStartDay: null, limits: [{ effectiveFrom: '2026-01-01', amount: 300_000 }] }),
      250_000,
      weekPeriod,
      TODAY,
    );
    const nearItem = budgetProgress(
      makeDef({ id: 'near', limits: [{ effectiveFrom: '2026-01-01', amount: 3_000_000 }] }),
      2_760_000,
      novPeriod,
      TODAY,
    );
    const fineItem = budgetProgress(
      makeDef({ id: 'fine', limits: [{ effectiveFrom: '2026-01-01', amount: 3_000_000 }] }),
      1_500_000,
      novPeriod,
      TODAY,
    );
    const endedOver = budgetProgress(
      makeDef({
        id: 'ended-over',
        periodKind: 'once',
        monthStartDay: null,
        from: pastPeriod.from,
        to: pastPeriod.to,
        limits: [{ effectiveFrom: pastPeriod.from, amount: 1_000_000 }],
      }),
      1_200_000,
      pastPeriod,
      TODAY,
    );

    const ordered = orderBudgets([fineItem, overLow, fastLow, endedOver, nearItem, fastHigh, overHigh]);
    expect(ordered.over.map((p) => p.budgetId)).toEqual(['over-high', 'over-low']);
    expect(ordered.fast.map((p) => p.budgetId)).toEqual(['fast-high', 'fast-low']);
    expect(ordered.onPace.map((p) => p.budgetId)).toEqual(['near', 'fine']);
    expect(ordered.ended.map((p) => p.budgetId)).toEqual(['ended-over']);
  });
});
