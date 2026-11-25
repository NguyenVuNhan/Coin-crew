import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setLang } from '@cc/web-i18n';
import {
  formatMoney,
  type ReportCategoryItem,
  type ReportData,
  type ReportQuery,
  type WalletBalanceSeriesResult,
} from '@cc/core';
import { ReportPeriodBar } from '../ReportPeriodBar';
import { HealthTrendCard } from '../HealthTrendCard';
import { WalletBalanceCard } from '../WalletBalanceCard';
import { CategoryPiesCard } from '../CategoryPiesCard';

class FakeResizeObserver {
  private cb: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb;
  }
  observe(target: Element) {
    this.cb(
      [
        {
          target,
          contentRect: {
            width: 400,
            height: 300,
            top: 0,
            left: 0,
            bottom: 300,
            right: 400,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          },
        } as unknown as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver,
    );
  }
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  setLang('en', false);
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ReportPeriodBar next-period button', () => {
  const today = '2026-11-25';

  it('disables next-period arrow for an in-progress month and enables it for a past month', () => {
    const inProgressQuery: ReportQuery = {
      mode: 'month',
      month: '2026-11',
      includeGroups: true,
    };
    const { rerender } = render(
      <ReportPeriodBar
        query={inProgressQuery}
        today={today}
        onChange={() => {}}
      />,
    );

    const nextDisabled = screen.getByRole('button', {
      name: 'Next period',
    }) as HTMLButtonElement;
    expect(nextDisabled.disabled).toBe(true);

    const pastQuery: ReportQuery = {
      mode: 'month',
      month: '2026-10',
      includeGroups: true,
    };
    rerender(
      <ReportPeriodBar query={pastQuery} today={today} onChange={() => {}} />,
    );

    const nextEnabled = screen.getByRole('button', {
      name: 'Next period',
    }) as HTMLButtonElement;
    expect(nextEnabled.disabled).toBe(false);
  });
});

describe('HealthTrendCard accessibility & legend', () => {
  const baseReport: ReportData = {
    period: {
      mode: 'month',
      from: '2026-11-01',
      to: '2026-11-30',
      effectiveTo: '2026-11-25',
      inProgress: true,
      granularity: 'day',
      previous: {
        from: '2026-10-01',
        to: '2026-10-31',
        effectiveTo: '2026-10-25',
      },
      baselines: [],
    },
    currency: 'VND',
    approximate: false,
    singleWallet: null,
    totals: { spent: 500000, income: 1200000, net: 700000 },
    perCurrency: [{ currency: 'VND', spent: 500000, income: 1200000 }],
    previousDelta: {
      previousSpent: 400000,
      previousIncome: 1000000,
      spentDiff: 100000,
      incomeDiff: 200000,
      spentPct: 25,
      incomePct: 20,
    },
    baseline3m: {
      historyCount: 3,
      previousSpent: 450000,
      previousIncome: 1100000,
      spentDiff: 50000,
      incomeDiff: 100000,
      spentPct: 11,
      incomePct: 9,
    },
    unratedWallets: [],
    countedCount: 4,
    hasAnyUnratedOnly: false,
    healthSeries: [
      {
        index: 0,
        date: '2026-11-01',
        label: '01/11',
        income: 1200000,
        expense: 500000,
        avgIncome: 1100000,
        avgExpense: 450000,
      },
    ],
    spendingByCategory: [],
    incomeByCategory: [],
    tags: { expense: [], income: [], hasMultiTagOverlap: false },
    walletBalance: null,
    countedRows: [],
  };

  it('renders both average legend entries when baseline3m is set and sr-only summary with formatted amounts', () => {
    render(<HealthTrendCard report={baseReport} />);

    expect(
      screen.getByText('Usual income (3 periods before)'),
    ).toBeTruthy();
    expect(
      screen.getByText('Usual spending (3 periods before)'),
    ).toBeTruthy();

    const spent = formatMoney(500000, 'VND');
    const income = formatMoney(1200000, 'VND');
    const summary = screen.getByText(
      `Running total chart: spent ${spent}, income ${income} this period.`,
    );
    expect(summary.className).toContain('sr-only');
  });
});

describe('WalletBalanceCard sr-only summary', () => {
  const balance: WalletBalanceSeriesResult = {
    walletId: 'w1',
    currency: 'VND',
    opening: 1000000,
    closing: 1500000,
    netChange: 500000,
    min: { value: 800000, date: '2026-11-05' },
    max: { value: 1800000, date: '2026-11-15' },
    points: [
      { date: '2026-11-01', label: '01/11', balance: 1000000 },
      { date: '2026-11-05', label: '05/11', balance: 800000 },
      { date: '2026-11-15', label: '15/11', balance: 1800000 },
      { date: '2026-11-25', label: '25/11', balance: 1500000 },
    ],
  };

  it('renders sr-only balance summary with formatted opening, closing, min and max', () => {
    render(<WalletBalanceCard balance={balance} />);

    const opening = formatMoney(1000000, 'VND');
    const closing = formatMoney(1500000, 'VND');
    const min = formatMoney(800000, 'VND');
    const max = formatMoney(1800000, 'VND');
    const summary = screen.getByText(
      `Balance chart: from ${opening} to ${closing}, lowest ${min}, highest ${max}.`,
    );
    expect(summary.className).toContain('sr-only');
  });
});

describe('CategoryPiesCard accessibility & type ramp', () => {
  const spending: ReportCategoryItem[] = [
    {
      categoryId: 'food',
      name: 'Food',
      icon: 'utensils',
      type: 'expense',
      amount: 500000,
      percent: 100,
      subCategories: [],
    },
  ];
  const income: ReportCategoryItem[] = [
    {
      categoryId: 'salary',
      name: 'Salary',
      icon: 'wallet',
      type: 'income',
      amount: 2000000,
      percent: 100,
      subCategories: [],
    },
  ];

  it('keeps donut aria-labels, adds aria-describedby with formatted totals, and uses no text-[11px]', () => {
    const { container } = render(
      <CategoryPiesCard
        spending={spending}
        income={income}
        currency="VND"
        approximate={true}
        onSelectCategory={() => {}}
      />,
    );

    const expenseBtn = screen.getByRole('button', { name: 'Spending' });
    const incomeBtn = screen.getByRole('button', { name: 'Income' });

    const expenseDescId = expenseBtn.getAttribute('aria-describedby');
    const incomeDescId = incomeBtn.getAttribute('aria-describedby');
    expect(expenseDescId).toBeTruthy();
    expect(incomeDescId).toBeTruthy();

    const expenseDescEl = document.getElementById(expenseDescId!);
    const incomeDescEl = document.getElementById(incomeDescId!);
    expect(expenseDescEl?.textContent).toBe(
      `≈ ${formatMoney(500000, 'VND')}`,
    );
    expect(incomeDescEl?.textContent).toBe(
      `≈ ${formatMoney(2000000, 'VND')}`,
    );

    expect(container.querySelector('[class*="text-[11px]"]')).toBeNull();
  });
});
