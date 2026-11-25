import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { setLang } from '@cc/web-i18n';
import {
  formatMoney,
  type ReportCategoryItem,
  type ReportQuery,
  type WalletBalanceSeriesResult,
} from '@cc/core';
import { CategoryPiesCard } from '../CategoryPiesCard';
import { ReportFilterRow } from '../ReportFilterRow';
import { WalletBalanceCard } from '../WalletBalanceCard';
import { formatDayMonth } from '../reportUrl';

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

describe('formatDayMonth', () => {
  it('formats YYYY-MM-DD as dd/mm and returns empty string for invalid input', () => {
    expect(formatDayMonth('2026-11-05')).toBe('05/11');
    expect(formatDayMonth('')).toBe('');
    expect(formatDayMonth('not-a-date')).toBe('');
    expect(formatDayMonth('2026-11')).toBe('');
    expect(formatDayMonth('2026-13-01')).toBe('');
    expect(formatDayMonth('2026-00-10')).toBe('');
  });
});

describe('CategoryPiesCard (distilled switch)', () => {
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

  it('renders no tablist and clicking the income donut flips aria-pressed', () => {
    render(
      <CategoryPiesCard
        spending={spending}
        income={income}
        currency="VND"
        approximate={false}
        onSelectCategory={() => {}}
      />,
    );

    expect(screen.queryByRole('tablist')).toBeNull();

    const expenseBtn = screen.getByRole('button', { name: 'Spending' });
    const incomeBtn = screen.getByRole('button', { name: 'Income' });

    expect(expenseBtn.getAttribute('aria-pressed')).toBe('true');
    expect(incomeBtn.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(incomeBtn);

    expect(expenseBtn.getAttribute('aria-pressed')).toBe('false');
    expect(incomeBtn.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('ReportFilterRow (fixed groups label)', () => {
  const baseQuery: ReportQuery = {
    mode: 'month',
    month: '2026-11',
    includeGroups: true,
  };

  it('shows the fixed "Group money" label with aria-pressed true/false', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ReportFilterRow query={baseQuery} wallets={[]} onChange={onChange} />,
    );

    const btn = screen.getByRole('button', { name: 'Group money' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');

    rerender(
      <ReportFilterRow
        query={{ ...baseQuery, includeGroups: false }}
        wallets={[]}
        onChange={onChange}
      />,
    );

    const btnOff = screen.getByRole('button', { name: 'Group money' });
    expect(btnOff.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('WalletBalanceCard (distilled caption & net change)', () => {
  const baseBalance: WalletBalanceSeriesResult = {
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

  it('renders one min/max caption with dd/mm dates and does not render opening/closing twice', () => {
    render(<WalletBalanceCard balance={baseBalance} />);

    expect(
      screen.getAllByText(formatMoney(baseBalance.opening, 'VND')),
    ).toHaveLength(1);
    expect(
      screen.getAllByText(formatMoney(baseBalance.closing, 'VND')),
    ).toHaveLength(1);

    const minText = screen.getByText(/Lowest/);
    expect(minText.textContent).toContain('(05/11)');
    expect(minText.textContent).toContain(formatMoney(800000, 'VND'));

    const maxText = screen.getByText(/Highest/);
    expect(maxText.textContent).toContain('(15/11)');
    expect(maxText.textContent).toContain(formatMoney(1800000, 'VND'));
  });

  it('uses text-foreground when netChange is exactly 0', () => {
    const zeroBalance: WalletBalanceSeriesResult = {
      ...baseBalance,
      closing: 1000000,
      netChange: 0,
    };
    render(<WalletBalanceCard balance={zeroBalance} />);

    const netLabel = screen.getByText('Change');
    const netValueEl = netLabel.nextElementSibling;
    expect(netValueEl).not.toBeNull();
    expect(netValueEl?.className).toContain('text-foreground');
    expect(netValueEl?.className).not.toContain('text-success');
  });
});
