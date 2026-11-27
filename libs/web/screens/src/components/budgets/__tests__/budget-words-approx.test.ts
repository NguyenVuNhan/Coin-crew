import { createElement } from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { formatMoney, type BudgetDef, type BudgetProgress } from '@cc/core';
import { setLang, t } from '@cc/web-i18n';
import { approxMoney, budgetStateWords } from '../budgetWords';
import { BudgetRow } from '../BudgetRow';

beforeEach(() => {
  setLang('vi', false);
});

describe('approxMoney', () => {
  it('formats millions with 1 decimal and drops trailing .0', () => {
    expect(approxMoney(74_000_000, 'vi')).toBe('74 triệu');
    expect(approxMoney(1_500_000, 'vi')).toBe('1,5 triệu');
    expect(approxMoney(74_000_000, 'en')).toBe('74 million ₫');
    expect(approxMoney(1_500_000, 'en')).toBe('1.5 million ₫');
  });

  it('formats thousands rounded to whole', () => {
    expect(approxMoney(450_000, 'vi')).toBe('450 nghìn');
    expect(approxMoney(450_000, 'en')).toBe('450 thousand ₫');
  });

  it('falls back to formatMoney below 1,000', () => {
    expect(approxMoney(500, 'vi')).toBe(formatMoney(500, 'VND'));
    expect(approxMoney(500, 'en')).toBe(formatMoney(500, 'VND'));
  });
});

describe('budgetStateWords fast state', () => {
  it('uses approxMoney for projected overage', () => {
    const progress: BudgetProgress = {
      budgetId: 'b-1',
      period: { from: '2026-11-01', to: '2026-11-30' },
      limit: 100_000_000,
      spent: 90_000_000,
      left: 10_000_000,
      elapsed: 0.5,
      daysLeft: 15,
      state: 'fast',
      projectedOverPct: 0.74,
      pace: { unit: 'day', amount: 666_667 },
      ended: false,
    };
    const res = budgetStateWords(progress, t);
    expect(res.text).toBe('Sẽ vượt khoảng 74 triệu');
  });
});

describe('BudgetRow over state', () => {
  const monthDef: BudgetDef = {
    id: 'b-month',
    name: 'Mua sắm',
    target: { kind: 'category', categoryId: 'cat-shop' },
    currency: 'VND',
    periodKind: 'month',
    monthStartDay: 1,
    from: null,
    to: null,
    excludedWalletIds: [],
    limits: [{ effectiveFrom: '2026-01-01', amount: 1_000_000 }],
    suggestionDismissedUntil: null,
    createdOn: '2026-01-01',
  };

  it('hides the visible over label, names the overage in the row label, and says stop until the next period', () => {
    const progress: BudgetProgress = {
      budgetId: 'b-month',
      period: { from: '2026-11-01', to: '2026-11-30' },
      limit: 1_000_000,
      spent: 1_150_000,
      left: -150_000,
      elapsed: 0.87,
      daysLeft: 4,
      state: 'over',
      projectedOverPct: null,
      pace: null,
      ended: false,
    };

    render(
      createElement(
        MemoryRouter,
        null,
        createElement(BudgetRow, { progress, def: monthDef }),
      ),
    );

    const amount = screen.getByTestId('budget-row-amount');
    expect(amount).toHaveTextContent('−150.000₫');
    expect(amount.className).toContain('text-danger');

    expect(screen.queryByText('vượt mức')).toBeNull();
    expect(screen.getByTestId('budget-row-b-month')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('vượt mức 150.000₫'),
    );

    expect(screen.getByTestId('budget-state-words')).toHaveTextContent('Vượt 15%');
    expect(screen.getByText('Nên dừng đến hết kỳ · Kỳ mới từ 1/12')).toBeInTheDocument();
  });

  it('uses rowEndsOn for once budgets when over', () => {
    const onceDef: BudgetDef = {
      ...monthDef,
      id: 'b-once',
      periodKind: 'once',
      from: '2026-11-01',
      to: '2026-11-30',
    };
    const progress: BudgetProgress = {
      budgetId: 'b-once',
      period: { from: '2026-11-01', to: '2026-11-30' },
      limit: 1_000_000,
      spent: 1_150_000,
      left: -150_000,
      elapsed: 0.87,
      daysLeft: 4,
      state: 'over',
      projectedOverPct: null,
      pace: null,
      ended: false,
    };

    render(
      createElement(
        MemoryRouter,
        null,
        createElement(BudgetRow, { progress, def: onceDef }),
      ),
    );

    expect(screen.getByText('Nên dừng đến hết kỳ · Kết thúc 30/11')).toBeInTheDocument();
  });
});
