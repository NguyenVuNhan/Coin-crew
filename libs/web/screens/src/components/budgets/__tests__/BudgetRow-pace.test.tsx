import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { BudgetDef, BudgetProgress } from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { BudgetRow } from '../BudgetRow';

afterEach(() => {
  cleanup();
  setLang('en');
});

const def: BudgetDef = {
  id: 'b-1',
  name: 'Ăn ngoài',
  target: { kind: 'category', categoryId: 'cat-food' },
  currency: 'VND',
  periodKind: 'month',
  monthStartDay: 1,
  from: null,
  to: null,
  excludedWalletIds: [],
  limits: [{ effectiveFrom: '2026-11-01', amount: 1_500_000 }],
  suggestionDismissedUntil: null,
  createdOn: '2026-11-01',
} as BudgetDef;

function progress(over: Partial<BudgetProgress>): BudgetProgress {
  return {
    budgetId: 'b-1',
    period: { from: '2026-11-01', to: '2026-11-30' },
    limit: 1_500_000,
    spent: 1_350_000,
    left: 150_000,
    elapsed: 0.9,
    daysLeft: 4,
    state: 'near',
    projectedOverPct: null,
    pace: { unit: 'day', amount: 37_500 },
    ended: false,
    ...over,
  } as BudgetProgress;
}

function renderRow(p: BudgetProgress): void {
  setLang('vi');
  render(
    <MemoryRouter>
      <BudgetRow progress={p} def={def} />
    </MemoryRouter>,
  );
}

describe('BudgetRow lead amount', () => {
  it('leads with the per-day amount and moves what is left to the meta line', () => {
    renderRow(progress({}));
    expect(screen.getByTestId('budget-row-amount')).toHaveTextContent('37.500₫');
    expect(screen.getByText('mỗi ngày')).toBeInTheDocument();
    expect(screen.getByText('150.000₫ còn lại')).toBeInTheDocument();
  });

  it('uses the per-month label for long periods', () => {
    renderRow(progress({ pace: { unit: 'month', amount: 600_000 }, daysLeft: 200 }));
    expect(screen.getByTestId('budget-row-amount')).toHaveTextContent('600.000₫');
    expect(screen.getByText('mỗi tháng')).toBeInTheDocument();
  });

  it('shows what is left on the last day', () => {
    renderRow(progress({ daysLeft: 1, pace: { unit: 'day', amount: 150_000 } }));
    expect(screen.getByTestId('budget-row-amount')).toHaveTextContent('150.000₫');
    expect(screen.getByText('còn lại')).toBeInTheDocument();
  });

  it('keeps the overage on the right when over', () => {
    renderRow(progress({ state: 'over', spent: 1_650_000, left: -150_000, pace: null }));
    expect(screen.getByTestId('budget-row-amount')).toHaveTextContent('150.000₫');
    expect(screen.getByTestId('budget-row-amount')).toHaveClass('text-danger');
  });
});
