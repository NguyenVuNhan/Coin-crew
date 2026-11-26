import { describe, it, expect } from 'vitest';
import { budgetSuggestion, type BudgetDef, type BudgetPeriod } from '@cc/core';

function monthPeriod(year: number, month: number): BudgetPeriod {
  const m = String(month).padStart(2, '0');
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: `${year}-${m}-01`,
    to: `${year}-${m}-${String(lastDay).padStart(2, '0')}`,
  };
}

function makeBudget(overrides: Partial<BudgetDef> = {}): BudgetDef {
  return {
    id: 'b-food',
    name: 'Food',
    target: { kind: 'category', categoryId: 'cat-food' },
    currency: 'VND',
    periodKind: 'month',
    monthStartDay: 1,
    from: null,
    to: null,
    excludedWalletIds: [],
    limits: [{ effectiveFrom: '2026-05-01', amount: 2_000_000 }],
    suggestionDismissedUntil: null,
    createdOn: '2026-05-01',
    ...overrides,
  };
}

describe('budgetSuggestion reset after accepting suggestion', () => {
  it('setting suggestionDismissedUntil to current period start prevents re-triggering on the very next period', () => {
    const baseHistory = [
      { period: monthPeriod(2026, 5), limit: 2_000_000, spent: 2_500_000 },
      { period: monthPeriod(2026, 6), limit: 2_000_000, spent: 2_500_000 },
      { period: monthPeriod(2026, 7), limit: 2_000_000, spent: 2_500_000 },
      { period: monthPeriod(2026, 8), limit: 2_000_000, spent: 2_500_000 },
      { period: monthPeriod(2026, 9), limit: 2_000_000, spent: 2_500_000 },
      { period: monthPeriod(2026, 10), limit: 2_000_000, spent: 2_500_000 },
    ];

    // Before accepting on 2026-11-15: 6 completed periods (May..Oct) all over limit -> suggests 2.5M
    const beforeAccept = makeBudget();
    const firstSuggestion = budgetSuggestion(beforeAccept, baseHistory, '2026-11-15');
    expect(firstSuggestion).toEqual({
      direction: 'raise',
      amount: 2_500_000,
      average: 2_500_000,
    });

    // Accepting updates limit at current period start (2026-11-01) AND sets suggestionDismissedUntil = '2026-11-01'
    const afterAccept = makeBudget({
      limits: [
        { effectiveFrom: '2026-05-01', amount: 2_000_000 },
        { effectiveFrom: '2026-11-01', amount: 2_500_000 },
      ],
      suggestionDismissedUntil: '2026-11-01',
    });

    // One period later (2026-12-15), even if Nov also overspent the new 2.5M limit,
    // the 6-period run (Jun..Nov) includes periods before 2026-11-01 -> no suggestion
    const nextPeriodHistory = [
      ...baseHistory,
      { period: monthPeriod(2026, 11), limit: 2_500_000, spent: 3_000_000 },
    ];
    expect(budgetSuggestion(afterAccept, nextPeriodHistory, '2026-12-15')).toBeNull();

    // After 6 full completed periods starting at 2026-11-01 (Nov 2026..Apr 2027), suggestion can appear again
    const sixFreshPeriods = [
      ...nextPeriodHistory,
      { period: monthPeriod(2026, 12), limit: 2_500_000, spent: 3_000_000 },
      { period: monthPeriod(2027, 1), limit: 2_500_000, spent: 3_000_000 },
      { period: monthPeriod(2027, 2), limit: 2_500_000, spent: 3_000_000 },
      { period: monthPeriod(2027, 3), limit: 2_500_000, spent: 3_000_000 },
      { period: monthPeriod(2027, 4), limit: 2_500_000, spent: 3_000_000 },
    ];
    expect(budgetSuggestion(afterAccept, sixFreshPeriods, '2027-05-15')).toEqual({
      direction: 'raise',
      amount: 3_000_000,
      average: 3_000_000,
    });
  });
});
