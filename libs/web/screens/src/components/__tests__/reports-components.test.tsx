import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { setLang } from '@cc/web-i18n';
import {
  formatMoney,
  type ReportCategoryItem,
  type ReportData,
  type ReportPeriodWindow,
  type ReportQuery,
  type WalletBalanceSeriesResult,
  type WalletDetailView,
} from '@cc/core';
import { HealthTrendCard } from '../reports/HealthTrendCard';
import { CategoryPiesCard } from '../reports/CategoryPiesCard';
import { TagBarsCard } from '../reports/TagBarsCard';
import { WalletBalanceCard } from '../reports/WalletBalanceCard';
import { ReportPeriodBar } from '../reports/ReportPeriodBar';
import { ReportFilterRow } from '../reports/ReportFilterRow';
import {
  parseReportQueryFromSearch,
  buildReportSearch,
  stepReportPeriod,
  compactReportAmount,
  buildTransactionsTagUrl,
  formatReportPeriodHeading,
} from '../reports/reportUrl';

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
  setLang('vi', false);
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// 1. HealthTrendCard
// ---------------------------------------------------------------------------

describe('HealthTrendCard', () => {
  const baseHealthReport: ReportData = {
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
    approximate: true,
    singleWallet: null,
    totals: {
      spent: 5000000,
      income: 8000000,
      net: 3000000,
    },
    perCurrency: [{ currency: 'VND', spent: 5000000, income: 8000000 }],
    previousDelta: {
      previousSpent: 4000000,
      previousIncome: 7000000,
      spentDiff: 1000000,
      incomeDiff: 1000000,
      spentPct: 25,
      incomePct: 14,
    },
    baseline3m: {
      previousSpent: 4500000,
      previousIncome: 7500000,
      spentDiff: 500000,
      incomeDiff: 500000,
      spentPct: 11,
      incomePct: 7,
      historyCount: 3,
    },
    unratedWallets: [],
    countedCount: 12,
    hasAnyUnratedOnly: false,
    healthSeries: [
      {
        index: 0,
        date: '2026-11-01',
        label: '01',
        income: 1000000,
        expense: 500000,
        avgIncome: 800000,
        avgExpense: 600000,
      },
      {
        index: 1,
        date: '2026-11-02',
        label: '02',
        income: 2000000,
        expense: 1500000,
        avgIncome: 1600000,
        avgExpense: 1200000,
      },
    ],
    spendingByCategory: [],
    incomeByCategory: [],
    tags: {
      expense: [],
      income: [],
      hasMultiTagOverlap: false,
    },
    walletBalance: null,
    countedRows: [],
  };

  it('renders title, "Lũy kế" badge, KPI summary formatted via formatMoney with ≈ when approximate: true, comparison lines, and [data-slot="chart"]', () => {
    const { container } = render(<HealthTrendCard report={baseHealthReport} />);

    // Title and badge
    expect(screen.getByText('Thu & Chi trong kỳ')).toBeInTheDocument();
    expect(screen.getByText('Lũy kế')).toBeInTheDocument();
    expect(screen.getByText('≈ VND')).toBeInTheDocument();

    // KPI Summary
    expect(screen.getByText('Đã chi')).toBeInTheDocument();
    expect(screen.getByText('Đã thu')).toBeInTheDocument();
    expect(screen.getByText('Chênh lệch')).toBeInTheDocument();

    // Check approximate prefix and formatted money
    expect(container.textContent).toContain('≈ 5.000.000₫');
    expect(container.textContent).toContain('≈ 8.000.000₫');
    expect(container.textContent).toContain('+≈ 3.000.000₫');

    // Previous-period and 3-month baseline comparison lines
    expect(container.textContent).toContain('Đã chi +25% so với cùng kỳ tháng trước');
    expect(container.textContent).toContain('so với TB 3 kỳ trước: ≈ 4.500.000₫');

    // Chart container
    expect(container.querySelector('[data-slot="chart"]')).toBeInTheDocument();
  });

  it('asserts "Theo ngày" text is never rendered anywhere in the card', () => {
    render(<HealthTrendCard report={baseHealthReport} />);
    expect(screen.queryByText(/theo ngày/i)).not.toBeInTheDocument();
  });

  it('when baseline3m === null, hides 3-month baseline legend/value cleanly and shows "Chưa đủ dữ liệu kỳ trước để so sánh"', () => {
    const reportWithoutBaseline: ReportData = {
      ...baseHealthReport,
      baseline3m: null,
    };

    const { container } = render(<HealthTrendCard report={reportWithoutBaseline} />);

    // Shows no baseline message
    expect(screen.getByText('Chưa đủ dữ liệu kỳ trước để so sánh')).toBeInTheDocument();

    // Legend does not render baseline entry
    expect(screen.queryByText(/TB chi 3 kỳ/i)).not.toBeInTheDocument();
    expect(container.textContent).not.toContain('so với TB 3 kỳ trước');
  });
});

// ---------------------------------------------------------------------------
// 2. CategoryPiesCard
// ---------------------------------------------------------------------------

describe('CategoryPiesCard', () => {
  const mockSpending: ReportCategoryItem[] = [
    {
      categoryId: 'cat-food',
      name: 'Ăn uống',
      icon: 'food',
      type: 'expense',
      amount: 3000000,
      percent: 60,
      subCategories: [],
    },
    {
      categoryId: 'cat-transport',
      name: 'Di chuyển',
      icon: 'car',
      type: 'expense',
      amount: 2000000,
      percent: 40,
      subCategories: [],
    },
  ];

  const mockIncome: ReportCategoryItem[] = [
    {
      categoryId: 'cat-salary',
      name: 'Lương',
      icon: 'cash',
      type: 'income',
      amount: 10000000,
      percent: 100,
      subCategories: [],
    },
  ];

  it('renders both compact Spending and Income donuts side-by-side with center Chi/Thu totals, and verifies no duplicate "Chi tiêu"/"Thu nhập" caption labels exist outside the tabs', () => {
    const onSelect = vi.fn();
    render(
      <CategoryPiesCard
        spending={mockSpending}
        income={mockIncome}
        currency="VND"
        approximate={false}
        onSelectCategory={onSelect}
      />,
    );

    // Donut buttons exist via aria-label
    const spendingDonutBtn = screen.getByRole('button', { name: 'Chi tiêu' });
    const incomeDonutBtn = screen.getByRole('button', { name: 'Thu nhập' });
    expect(spendingDonutBtn).toBeInTheDocument();
    expect(incomeDonutBtn).toBeInTheDocument();

    // Center Chi and Thu totals
    expect(spendingDonutBtn.textContent).toContain('Chi');
    expect(spendingDonutBtn.textContent).toContain('5M');
    expect(incomeDonutBtn.textContent).toContain('Thu');
    expect(incomeDonutBtn.textContent).toContain('10M');

    // Exactly ONE visible text "Chi tiêu" and ONE visible text "Thu nhập" (inside the TabsTriggers)
    const expenseTexts = screen.getAllByText('Chi tiêu');
    expect(expenseTexts).toHaveLength(1);
    expect(expenseTexts[0]?.getAttribute('role')).toBe('tab');

    const incomeTexts = screen.getAllByText('Thu nhập');
    expect(incomeTexts).toHaveLength(1);
    expect(incomeTexts[0]?.getAttribute('role')).toBe('tab');
  });

  it('switches ranked parent-category list via the <Tabs> toggle (Chi tiêu -> Thu nhập)', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <CategoryPiesCard
        spending={mockSpending}
        income={mockIncome}
        currency="VND"
        approximate={false}
        onSelectCategory={onSelect}
      />,
    );

    // Default tab is "Chi tiêu"
    expect(screen.getByText('Ăn uống')).toBeInTheDocument();
    expect(screen.getByText('Di chuyển')).toBeInTheDocument();
    expect(screen.queryByText('Lương')).not.toBeInTheDocument();

    // Switch to "Thu nhập" tab
    const incomeTab = screen.getByRole('tab', { name: 'Thu nhập' });
    await user.click(incomeTab);

    expect(screen.getByText('Lương')).toBeInTheDocument();
    expect(screen.queryByText('Ăn uống')).not.toBeInTheDocument();
    expect(screen.queryByText('Di chuyển')).not.toBeInTheDocument();
  });

  it('invokes onSelectCategory(categoryId) when clicking any category row', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <CategoryPiesCard
        spending={mockSpending}
        income={mockIncome}
        currency="VND"
        approximate={false}
        onSelectCategory={onSelect}
      />,
    );

    // Click 'Ăn uống' row button
    const foodRow = screen.getByRole('button', { name: /Ăn uống/i });
    await user.click(foodRow);
    expect(onSelect).toHaveBeenCalledWith('cat-food');

    // Switch to income tab and click 'Lương'
    const incomeTab = screen.getByRole('tab', { name: 'Thu nhập' });
    await user.click(incomeTab);

    const salaryRow = screen.getByRole('button', { name: /Lương/i });
    await user.click(salaryRow);
    expect(onSelect).toHaveBeenCalledWith('cat-salary');
  });
});

// ---------------------------------------------------------------------------
// 3. TagBarsCard
// ---------------------------------------------------------------------------

describe('TagBarsCard', () => {
  const mockTags8 = {
    expense: [
      { tagId: 't1', name: 'Ăn uống', amount: 500000, percent: 50, entryCount: 5 },
      { tagId: 't2', name: 'Du lịch', amount: 200000, percent: 20, entryCount: 2 },
      { tagId: 't3', name: 'Mua sắm', amount: 100000, percent: 10, entryCount: 1 },
      { tagId: 't4', name: 'Tag 4', amount: 80000, percent: 8, entryCount: 1 },
      { tagId: 't5', name: 'Tag 5', amount: 50000, percent: 5, entryCount: 1 },
      { tagId: 't6', name: 'Tag 6', amount: 40000, percent: 4, entryCount: 1 },
      { tagId: 't7', name: 'Tag 7', amount: 20000, percent: 2, entryCount: 1 },
      { tagId: 't8', name: 'Tag 8', amount: 10000, percent: 1, entryCount: 1 },
    ],
    income: [
      { tagId: 't-inc-1', name: 'Thưởng', amount: 1000000, percent: 100, entryCount: 1 },
    ],
    hasMultiTagOverlap: true,
  };

  const mockPeriod: ReportPeriodWindow = {
    mode: 'month',
    from: '2026-11-01',
    to: '2026-11-30',
    effectiveTo: '2026-11-25',
    inProgress: true,
    granularity: 'day',
    previous: { from: '2026-10-01', to: '2026-10-31', effectiveTo: '2026-10-25' },
    baselines: [],
  };

  const mockQuery: ReportQuery = {
    mode: 'month',
    month: '2026-11',
    walletId: 'w-cash',
    includeGroups: false,
  };

  it('shows Top 5 tags by default when 8 tags exist, renders "Xem tất cả (8 thẻ)", expands to all 8 and toggles to "Thu gọn"', () => {
    render(
      <MemoryRouter>
        <TagBarsCard
          tags={mockTags8}
          period={mockPeriod}
          query={mockQuery}
          currency="VND"
          approximate={false}
        />
      </MemoryRouter>,
    );

    // Top 5 visible
    expect(screen.getByText('#Ăn uống')).toBeInTheDocument();
    expect(screen.getByText('#Du lịch')).toBeInTheDocument();
    expect(screen.getByText('#Mua sắm')).toBeInTheDocument();
    expect(screen.getByText('#Tag 4')).toBeInTheDocument();
    expect(screen.getByText('#Tag 5')).toBeInTheDocument();

    // Tags 6..8 hidden by default
    expect(screen.queryByText('#Tag 6')).not.toBeInTheDocument();
    expect(screen.queryByText('#Tag 7')).not.toBeInTheDocument();
    expect(screen.queryByText('#Tag 8')).not.toBeInTheDocument();

    // "Xem tất cả (8 thẻ)" button
    const expandBtn = screen.getByRole('button', { name: 'Xem tất cả (8 thẻ)' });
    expect(expandBtn).toBeInTheDocument();

    // Click expand
    fireEvent.click(expandBtn);
    expect(screen.getByText('#Tag 6')).toBeInTheDocument();
    expect(screen.getByText('#Tag 7')).toBeInTheDocument();
    expect(screen.getByText('#Tag 8')).toBeInTheDocument();
    expect(expandBtn).toHaveTextContent('Thu gọn');

    // Click collapse
    fireEvent.click(expandBtn);
    expect(screen.queryByText('#Tag 6')).not.toBeInTheDocument();
    expect(expandBtn).toHaveTextContent('Xem tất cả (8 thẻ)');
  });

  it('renders search input with text-base class when > 6 active tags exist and filters accent-insensitively (typing "an" matches "#Ăn uống")', () => {
    render(
      <MemoryRouter>
        <TagBarsCard
          tags={mockTags8}
          period={mockPeriod}
          query={mockQuery}
          currency="VND"
          approximate={false}
        />
      </MemoryRouter>,
    );

    const searchInput = screen.getByPlaceholderText('Tìm thẻ...');
    expect(searchInput).toBeInTheDocument();
    expect(searchInput).toHaveClass('text-base');

    // Type 'an' -> matches '#Ăn uống'
    fireEvent.change(searchInput, { target: { value: 'an' } });
    expect(screen.getByText('#Ăn uống')).toBeInTheDocument();
    expect(screen.queryByText('#Du lịch')).not.toBeInTheDocument();
    expect(screen.queryByText('#Mua sắm')).not.toBeInTheDocument();
  });

  it('switches Chi / Thu via <Tabs> and swaps tag series', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <TagBarsCard
          tags={mockTags8}
          period={mockPeriod}
          query={mockQuery}
          currency="VND"
          approximate={false}
        />
      </MemoryRouter>,
    );

    // Initial is Chi
    expect(screen.getByText('#Ăn uống')).toBeInTheDocument();
    expect(screen.queryByText('#Thưởng')).not.toBeInTheDocument();

    // Switch to Thu
    const incomeTab = screen.getByRole('tab', { name: 'Thu' });
    await user.click(incomeTab);

    expect(screen.getByText('#Thưởng')).toBeInTheDocument();
    expect(screen.queryByText('#Ăn uống')).not.toBeInTheDocument();
  });

  it('verifies each tag links cleanly to /transactions with params and renders multi-tag overlap caption when hasMultiTagOverlap is true', () => {
    render(
      <MemoryRouter>
        <TagBarsCard
          tags={mockTags8}
          period={mockPeriod}
          query={mockQuery}
          currency="VND"
          approximate={false}
        />
      </MemoryRouter>,
    );

    const link = screen.getByText('#Ăn uống').closest('a');
    expect(link).toHaveAttribute(
      'href',
      '/transactions?tagId=t1&from=2026-11-01&to=2026-11-25&walletId=w-cash&groups=hide',
    );

    // Multi-tag overlap caption
    expect(
      screen.getByText(
        'Một giao dịch có thể gắn nhiều thẻ nên tổng các thanh có thể vượt tổng kỳ.',
      ),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 4. WalletBalanceCard
// ---------------------------------------------------------------------------

describe('WalletBalanceCard', () => {
  const mockBalance: WalletBalanceSeriesResult = {
    walletId: 'w-usdt',
    currency: 'USDT',
    opening: 1000,
    closing: 1500,
    netChange: 500,
    min: { value: 900, date: '2026-11-05' },
    max: { value: 1600, date: '2026-11-20' },
    points: [
      { date: '2026-11-01', label: '01/11', balance: 1000 },
      { date: '2026-11-15', label: '15/11', balance: 1200 },
      { date: '2026-11-30', label: '30/11', balance: 1500 },
    ],
  };

  it('renders native currency (USDT, NO ≈) badge, opening/closing/netChange KPIs, [data-slot="chart"], and 4 checkpoints with dates and amounts', () => {
    const { container } = render(<WalletBalanceCard balance={mockBalance} />);

    // Native currency badge and NO ≈
    expect(screen.getByText('USDT')).toBeInTheDocument();
    expect(container.textContent).not.toContain('≈');

    // Opening, Closing, NetChange KPIs
    expect(screen.getByText('Đầu kỳ')).toBeInTheDocument();
    expect(screen.getByText('Cuối kỳ')).toBeInTheDocument();
    expect(screen.getByText('Thay đổi ròng')).toBeInTheDocument();

    expect(container.textContent).toContain(formatMoney(1000, 'USDT'));
    expect(container.textContent).toContain(formatMoney(1500, 'USDT'));
    expect(container.textContent).toContain(`+${formatMoney(500, 'USDT')}`);

    // NetChange positive has text-success
    const netChangeEl = screen.getByText(`+${formatMoney(500, 'USDT')}`);
    expect(netChangeEl).toHaveClass('text-success');

    // Chart slot
    expect(container.querySelector('[data-slot="chart"]')).toBeInTheDocument();

    // 4 checkpoints
    expect(screen.getByText('Bắt đầu')).toBeInTheDocument();
    expect(screen.getByText('2026-11-01')).toBeInTheDocument();

    expect(screen.getByText('Thấp nhất')).toBeInTheDocument();
    expect(screen.getByText('2026-11-05')).toBeInTheDocument();
    expect(container.textContent).toContain(formatMoney(900, 'USDT'));

    expect(screen.getByText('Cao nhất')).toBeInTheDocument();
    expect(screen.getByText('2026-11-20')).toBeInTheDocument();
    expect(container.textContent).toContain(formatMoney(1600, 'USDT'));

    expect(screen.getByText('Hiện tại')).toBeInTheDocument();
    expect(screen.getByText('2026-11-30')).toBeInTheDocument();
  });

  it('renders negative netChange with text-danger class', () => {
    const negativeBalance: WalletBalanceSeriesResult = {
      ...mockBalance,
      opening: 2000,
      closing: 1500,
      netChange: -500,
    };

    render(<WalletBalanceCard balance={negativeBalance} />);
    const netChangeEl = screen.getByText(formatMoney(-500, 'USDT'));
    expect(netChangeEl).toHaveClass('text-danger');
  });
});

// ---------------------------------------------------------------------------
// 5. ReportPeriodBar + ReportFilterRow + reportUrl
// ---------------------------------------------------------------------------

describe('reportUrl helpers', () => {
  it('parseReportQueryFromSearch, buildReportSearch, and stepReportPeriod roundtrip cleanly across week, month, year, custom', () => {
    const today = '2026-11-25';

    // 1. Month roundtrip
    const monthQuery: ReportQuery = {
      mode: 'month',
      month: '2026-11',
      walletId: 'w-1',
      includeGroups: false,
    };
    const monthSearch = buildReportSearch(monthQuery);
    expect(monthSearch).toBe('?mode=month&month=2026-11&walletId=w-1&groups=hide');
    expect(parseReportQueryFromSearch(monthSearch, today)).toEqual(monthQuery);

    // Month stepping
    expect(stepReportPeriod(monthQuery, 1, today).month).toBe('2026-12');
    expect(stepReportPeriod(monthQuery, -1, today).month).toBe('2026-10');

    // 2. Week roundtrip
    const weekQuery: ReportQuery = {
      mode: 'week',
      week: '2026-11-25',
      includeGroups: true,
    };
    const weekSearch = buildReportSearch(weekQuery);
    expect(weekSearch).toBe('?mode=week&week=2026-11-25');
    expect(parseReportQueryFromSearch(weekSearch, today)).toEqual(weekQuery);

    // Week stepping (7 days)
    expect(stepReportPeriod(weekQuery, 1, today).week).toBe('2026-12-02');
    expect(stepReportPeriod(weekQuery, -1, today).week).toBe('2026-11-18');

    // 3. Year roundtrip
    const yearQuery: ReportQuery = {
      mode: 'year',
      year: '2026',
      includeGroups: true,
    };
    const yearSearch = buildReportSearch(yearQuery);
    expect(yearSearch).toBe('?mode=year&year=2026');
    expect(parseReportQueryFromSearch(yearSearch, today)).toEqual(yearQuery);

    // Year stepping
    expect(stepReportPeriod(yearQuery, 1, today).year).toBe('2027');
    expect(stepReportPeriod(yearQuery, -1, today).year).toBe('2025');

    // 4. Custom roundtrip
    const customQuery: ReportQuery = {
      mode: 'custom',
      from: '2026-11-01',
      to: '2026-11-10',
      includeGroups: true,
    };
    const customSearch = buildReportSearch(customQuery);
    expect(customSearch).toBe('?mode=custom&from=2026-11-01&to=2026-11-10');
    expect(parseReportQueryFromSearch(customSearch, today)).toEqual(customQuery);

    // Custom stepping (diff is 10 days)
    const steppedNext = stepReportPeriod(customQuery, 1, today);
    expect(steppedNext.from).toBe('2026-11-11');
    expect(steppedNext.to).toBe('2026-11-20');

    const steppedPrev = stepReportPeriod(customQuery, -1, today);
    expect(steppedPrev.from).toBe('2026-10-22');
    expect(steppedPrev.to).toBe('2026-10-31');
  });

  it('compactReportAmount formats amounts as expected', () => {
    expect(compactReportAmount(0)).toBe('0');
    expect(compactReportAmount(500)).toBe('500');
    expect(compactReportAmount(1500)).toBe('1.5k');
    expect(compactReportAmount(2000000)).toBe('2M');
    expect(compactReportAmount(2500000)).toBe('2.5M');
    expect(compactReportAmount(1000000000)).toBe('1B');
    expect(compactReportAmount(-2500000)).toBe('-2.5M');
  });

  it('buildTransactionsTagUrl serializes query params cleanly', () => {
    const period: ReportPeriodWindow = {
      mode: 'month',
      from: '2026-11-01',
      to: '2026-11-30',
      effectiveTo: '2026-11-25',
      inProgress: true,
      granularity: 'day',
      previous: { from: '2026-10-01', to: '2026-10-31', effectiveTo: '2026-10-25' },
      baselines: [],
    };
    const query: ReportQuery = {
      mode: 'month',
      walletId: 'w-abc',
      includeGroups: false,
    };
    expect(buildTransactionsTagUrl('t-123', period, query)).toBe(
      '/transactions?tagId=t-123&from=2026-11-01&to=2026-11-25&walletId=w-abc&groups=hide',
    );
  });
});

describe('ReportPeriodBar', () => {
  const baseQuery: ReportQuery = {
    mode: 'month',
    month: '2026-11',
    includeGroups: true,
  };
  const today = '2026-11-25';

  it('switches week/month/year via shadcn <Tabs> and steps prev/next periods', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ReportPeriodBar query={baseQuery} today={today} onChange={onChange} />);

    // Switch to week
    const weekTab = screen.getByRole('tab', { name: 'Tuần' });
    await user.click(weekTab);
    expect(onChange).toHaveBeenCalledWith({ ...baseQuery, mode: 'week' });

    // Switch to year
    const yearTab = screen.getByRole('tab', { name: 'Năm' });
    await user.click(yearTab);
    expect(onChange).toHaveBeenCalledWith({ ...baseQuery, mode: 'year' });

    // Step previous period
    const prevBtn = screen.getByRole('button', { name: 'Kỳ trước' });
    await user.click(prevBtn);
    expect(onChange).toHaveBeenCalledWith({ ...baseQuery, month: '2026-10' });

    // Step next period
    const nextBtn = screen.getByRole('button', { name: 'Kỳ sau' });
    await user.click(nextBtn);
    expect(onChange).toHaveBeenCalledWith({ ...baseQuery, month: '2026-12' });
  });

  it('clicking "Tùy chọn" opens <Sheet> with date inputs and labels, validates from > to, validates range > 366 days, and applies valid range', () => {
    const onChange = vi.fn();
    render(<ReportPeriodBar query={baseQuery} today={today} onChange={onChange} />);

    // Click "Tùy chọn"
    const customTab = screen.getByRole('tab', { name: 'Tùy chọn' });
    fireEvent.click(customTab);

    // Sheet elements
    const fromLabel = screen.getByText('Từ ngày');
    const toLabel = screen.getByText('Đến ngày');
    expect(fromLabel).toBeInTheDocument();
    expect(toLabel).toBeInTheDocument();

    const fromInput = document.getElementById('report-custom-from') as HTMLInputElement;
    const toInput = document.getElementById('report-custom-to') as HTMLInputElement;
    expect(fromInput).toBeInTheDocument();
    expect(toInput).toBeInTheDocument();

    const applyBtn = screen.getByRole('button', { name: 'Áp dụng' });

    // 1. Validate from > to
    fireEvent.change(fromInput, { target: { value: '2026-11-20' } });
    fireEvent.change(toInput, { target: { value: '2026-11-10' } });
    fireEvent.click(applyBtn);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Ngày bắt đầu phải trước ngày kết thúc',
    );
    expect(onChange).not.toHaveBeenCalled();

    // 2. Validate range > 366 days
    fireEvent.change(fromInput, { target: { value: '2024-01-01' } });
    fireEvent.change(toInput, { target: { value: '2026-01-01' } });
    fireEvent.click(applyBtn);

    expect(screen.getByRole('alert')).toHaveTextContent('Chọn tối đa 1 năm');
    expect(onChange).not.toHaveBeenCalled();

    // 3. Apply valid custom range
    fireEvent.change(fromInput, { target: { value: '2026-11-05' } });
    fireEvent.change(toInput, { target: { value: '2026-11-15' } });
    fireEvent.click(applyBtn);

    expect(onChange).toHaveBeenCalledWith({
      ...baseQuery,
      mode: 'custom',
      from: '2026-11-05',
      to: '2026-11-15',
    });
  });
});

describe('ReportFilterRow', () => {
  const baseQuery: ReportQuery = {
    mode: 'month',
    month: '2026-11',
    includeGroups: true,
  };

  const mockWallets: WalletDetailView[] = [
    {
      id: 'w-cash',
      name: 'Tiền mặt',
      currency: 'VND',
      icon: 'wallet',
      archived: false,
      excludeFromReports: false,
    } as WalletDetailView,
    {
      id: 'w-bank',
      name: 'Ngân hàng',
      currency: 'VND',
      icon: 'bank',
      archived: false,
      excludeFromReports: false,
    } as WalletDetailView,
  ];

  it('opens wallet picker <Sheet>, picks a wallet (walletId), picks "Tất cả ví", and toggles "Gồm nhóm" (includeGroups)', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ReportFilterRow query={baseQuery} wallets={mockWallets} onChange={onChange} />,
    );

    // 1. Initial wallet trigger shows "Tất cả ví"
    const walletTrigger = screen.getByRole('button', { name: 'Tất cả ví' });
    expect(walletTrigger).toBeInTheDocument();

    // Click trigger to open sheet
    fireEvent.click(walletTrigger);

    // Pick 'Ngân hàng'
    const bankOption = screen.getByRole('button', { name: /Ngân hàng/i });
    fireEvent.click(bankOption);
    expect(onChange).toHaveBeenCalledWith({ ...baseQuery, walletId: 'w-bank' });

    // 2. Rerender with walletId: 'w-bank'
    rerender(
      <ReportFilterRow
        query={{ ...baseQuery, walletId: 'w-bank' }}
        wallets={mockWallets}
        onChange={onChange}
      />,
    );

    const activeWalletTrigger = screen.getByRole('button', {
      name: 'Ví: Ngân hàng',
    });
    expect(activeWalletTrigger).toBeInTheDocument();

    // Open sheet and pick "Tất cả ví"
    fireEvent.click(activeWalletTrigger);
    const allWalletsOptions = screen.getAllByRole('button', { name: /Tất cả ví/i });
    // One is the trigger, one is the sheet item
    const sheetAllWalletsBtn = allWalletsOptions.find(
      (btn) => btn !== activeWalletTrigger,
    )!;
    fireEvent.click(sheetAllWalletsBtn);
    expect(onChange).toHaveBeenCalledWith({ ...baseQuery, walletId: undefined });

    // 3. Toggle "Gồm nhóm" button
    const groupsBtn = screen.getByRole('button', { name: /Gồm nhóm/i });
    expect(groupsBtn).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(groupsBtn);
    expect(onChange).toHaveBeenCalledWith({
      ...baseQuery,
      walletId: 'w-bank',
      includeGroups: false,
    });

    // Rerender with includeGroups: false
    rerender(
      <ReportFilterRow
        query={{ ...baseQuery, includeGroups: false }}
        wallets={mockWallets}
        onChange={onChange}
      />,
    );

    const excludeGroupsBtn = screen.getByRole('button', { name: /Ẩn nhóm/i });
    expect(excludeGroupsBtn).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(excludeGroupsBtn);
    expect(onChange).toHaveBeenCalledWith({ ...baseQuery, includeGroups: true });
  });
});
