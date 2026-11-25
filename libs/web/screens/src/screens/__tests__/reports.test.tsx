import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  CategoryView,
  GroupSettingsView,
  ReportCategoryDrilldown,
  ReportData,
  TagView,
  TripView,
  WalletDetailView,
} from '@cc/core';
import { todayLocal, currentMonthLocal } from '@cc/web-util/localDate';
import { renderAt, mockApi } from '../../test/render';
import { tripView } from '../../test/fixtures';
import { fakePlatform } from '../../test/fakePlatform';
import { App } from '../../App';

class FakeResizeObserver {
  private callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    this.callback(
      [
        {
          target,
          contentRect: {
            x: 0,
            y: 0,
            width: 400,
            height: 300,
            top: 0,
            right: 400,
            bottom: 300,
            left: 0,
            toJSON: () => ({}),
          },
          borderBoxSize: [],
          contentBoxSize: [],
          devicePixelContentBoxSize: [],
        } as unknown as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver,
    );
  }
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const meOff = {
  user: { id: 'u-me', email: 'me@example.com', name: 'Me', consentAt: '2026-10-12T00:00:00.000Z' },
  signIn: { zalo: true },
  mergeRequests: { incoming: [], outgoing: [] },
};
const meOn = { ...meOff, personalArea: true };

const ledger = { tripId: 't-led', ownerPid: 'p-me' };
const peopleSummary = { people: [], incomplete: false };

function ledgerView(): TripView {
  return tripView({
    trip: {
      id: 't-led',
      name: 'Quick expenses',
      currency: 'VND',
      fewestTransfers: true,
      archived: false,
      version: 1,
      total: 0,
    },
    me: { kind: 'member', participantId: 'p-me', participantPending: false, isOrganiser: true },
    people: [{ id: 'p-me', name: 'Me', status: 'active', isMember: true, bank: 'approved' }],
    expenses: [],
    payments: [],
  });
}

const cashWallet: WalletDetailView = {
  id: 'w-cash',
  name: 'Tiền mặt',
  currency: 'VND',
  balance: 5000000,
  isDefault: true,
  kind: 'everyday',
  startAmount: 5000000,
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: 5000000,
  icon: 'wallet',
  sortOrder: 0,
  archived: false,
  entryCount: 10,
  excludeFromReports: false,
};

const usdtWallet: WalletDetailView = {
  id: 'w-usdt',
  name: 'Tài khoản USDT',
  currency: 'USDT',
  balance: 1000,
  isDefault: false,
  kind: 'investment',
  startAmount: 1000,
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: 25000000,
  icon: 'crypto',
  sortOrder: 1,
  archived: false,
  entryCount: 2,
  excludeFromReports: false,
};

const exclWallet: WalletDetailView = {
  id: 'w-excl',
  name: 'Quỹ riêng',
  currency: 'VND',
  balance: 2000000,
  isDefault: false,
  kind: 'everyday',
  startAmount: 2000000,
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: 2000000,
  icon: 'savings',
  sortOrder: 2,
  archived: false,
  entryCount: 1,
  excludeFromReports: true,
};

const defaultWallets: WalletDetailView[] = [cashWallet, usdtWallet, exclWallet];

const defaultCategories: CategoryView[] = [
  { id: 'cat-food', parentId: null, type: 'expense', name: 'Ăn uống', icon: 'food', hidden: false, sortOrder: 0 },
  { id: 'cat-coffee', parentId: 'cat-food', type: 'expense', name: 'Cà phê', icon: 'coffee', hidden: false, sortOrder: 1 },
  { id: 'cat-salary', parentId: null, type: 'income', name: 'Lương', icon: 'salary', hidden: false, sortOrder: 2 },
];

const defaultTags: TagView[] = [
  { id: 'tag-work', name: 'Công việc', useCount: 5 },
];

const defaultGroupSettings: GroupSettingsView = {
  defaultGroupCategoryId: null,
  countLoans: false,
};

function createMockReportData(overrides: Partial<ReportData> = {}): ReportData {
  return {
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
        effectiveTo: '2026-10-31',
      },
      baselines: [
        { from: '2026-10-01', to: '2026-10-31', effectiveTo: '2026-10-31' },
      ],
    },
    currency: 'VND',
    approximate: false,
    singleWallet: null,
    totals: {
      spent: 1200000,
      income: 3500000,
      net: 2300000,
    },
    perCurrency: [
      { currency: 'VND', spent: 1200000, income: 3500000 },
    ],
    previousDelta: {
      previousSpent: 1000000,
      previousIncome: 3000000,
      spentDiff: 200000,
      incomeDiff: 500000,
      spentPct: 20,
      incomePct: 17,
    },
    baseline3m: {
      previousSpent: 1000000,
      previousIncome: 3000000,
      spentDiff: 200000,
      incomeDiff: 500000,
      spentPct: 20,
      incomePct: 17,
      historyCount: 3,
    },
    unratedWallets: [],
    countedCount: 5,
    hasAnyUnratedOnly: false,
    healthSeries: [
      { index: 1, date: '2026-11-01', label: '1', income: 3500000, expense: 500000, avgIncome: 3000000, avgExpense: 400000 },
      { index: 2, date: '2026-11-15', label: '15', income: 3500000, expense: 1200000, avgIncome: 3000000, avgExpense: 800000 },
    ],
    spendingByCategory: [
      {
        categoryId: 'cat-food',
        name: 'Ăn uống',
        icon: 'food',
        type: 'expense',
        amount: 850000,
        percent: 71,
        subCategories: [
          { categoryId: 'cat-coffee', name: 'Cà phê', icon: 'coffee', amount: 350000, percent: 41 },
          { categoryId: 'cat-food', name: 'Ăn uống', icon: 'food', amount: 500000, percent: 59, isGeneralParentBucket: true },
        ],
      },
    ],
    incomeByCategory: [
      {
        categoryId: 'cat-salary',
        name: 'Lương',
        icon: 'salary',
        type: 'income',
        amount: 3500000,
        percent: 100,
        subCategories: [],
      },
    ],
    tags: {
      expense: [
        { tagId: 'tag-work', name: 'Công việc', amount: 350000, percent: 29, entryCount: 1 },
      ],
      income: [],
      hasMultiTagOverlap: false,
    },
    walletBalance: null,
    countedRows: [],
    ...overrides,
  };
}

function createMockDrilldown(overrides: Partial<ReportCategoryDrilldown> = {}): ReportCategoryDrilldown {
  return {
    categoryId: 'cat-food',
    name: 'Ăn uống',
    icon: 'food',
    type: 'expense',
    currency: 'VND',
    approximate: false,
    total: 850000,
    previousTotal: 750000,
    diffFromPrevious: 100000,
    pctFromPrevious: 13,
    baseline3mAvg: 800000,
    historyCount: 3,
    subCategories: [
      { categoryId: 'cat-coffee', name: 'Cà phê', icon: 'coffee', amount: 350000, percent: 41 },
      { categoryId: 'cat-food', name: 'Ăn uống', icon: 'food', amount: 500000, percent: 59, isGeneralParentBucket: true },
    ],
    rows: [
      { kind: 'entry', entryId: 'e-coffee-1', categoryId: 'cat-coffee', type: 'expense', vndAmount: 350000, nativeAmount: 350000 },
      { kind: 'entry', entryId: 'e-food-1', categoryId: 'cat-food', type: 'expense', vndAmount: 500000, nativeAmount: 500000 },
    ],
    ...overrides,
  };
}

function mockReportsApp({
  me = meOn,
  wallets = defaultWallets,
  categories = defaultCategories,
  tags = defaultTags,
  groupSettings = defaultGroupSettings,
  reportOverride,
  drilldownOverride,
  transactionsOverride,
}: {
  me?: unknown;
  wallets?: WalletDetailView[];
  categories?: CategoryView[];
  tags?: TagView[];
  groupSettings?: GroupSettingsView;
  reportOverride?: ((url: string) => ReportData | null) | ReportData;
  drilldownOverride?: ((url: string, categoryId: string) => ReportCategoryDrilldown | null) | ReportCategoryDrilldown;
  transactionsOverride?: unknown;
} = {}) {
  const routes: Record<string, unknown> = {
    'GET /api/me': me,
    'GET /api/me/ledger': ledger,
    'GET /api/me/people/summary': peopleSummary,
    'GET /api/trips/t-led': ledgerView(),
    'GET /api/trips/t-led/version': { version: 1 },
    'GET /api/me/personal/wallets': { wallets },
    'GET /api/me/personal/categories': { categories },
    'GET /api/me/personal/tags': { tags },
    'GET /api/me/personal/group-settings': { settings: groupSettings },
    'GET /api/me/personal/transactions': transactionsOverride ?? {
      rows: [
        {
          kind: 'entry',
          entry: {
            id: 'e-coffee-1',
            walletId: 'w-cash',
            type: 'expense',
            amount: 350000,
            currency: 'VND',
            categoryId: 'cat-coffee',
            note: 'Cà phê muối',
            tags: ['Công việc'],
            date: '2026-10-15',
            time: '09:00',
            excludeFromReports: false,
            source: 'manual',
            beforeStart: false,
            createdAt: '2026-10-15T09:00:00.000Z',
            transferId: null,
            counterpartWalletId: null,
          },
        },
        {
          kind: 'entry',
          entry: {
            id: 'e-food-1',
            walletId: 'w-cash',
            type: 'expense',
            amount: 500000,
            currency: 'VND',
            categoryId: 'cat-food',
            note: 'Cơm trưa',
            tags: [],
            date: '2026-10-14',
            time: '12:00',
            excludeFromReports: false,
            source: 'manual',
            beforeStart: false,
            createdAt: '2026-10-14T12:00:00.000Z',
            transferId: null,
            counterpartWalletId: null,
          },
        },
      ],
      totals: [],
    },
    'GET /api/me/personal/report': (_init: RequestInit | undefined, url: string) => {
      if (typeof reportOverride === 'function') {
        const res = reportOverride(url);
        return Response.json(res ?? createMockReportData());
      }
      if (reportOverride) return Response.json(reportOverride);

      const urlObj = new URL(url, 'http://localhost');
      const walletId = urlObj.searchParams.get('walletId');
      const month = urlObj.searchParams.get('month');

      if (walletId === 'w-usdt') {
        return Response.json(
          createMockReportData({
            currency: 'USDT',
            approximate: false,
            singleWallet: {
              walletId: 'w-usdt',
              name: 'Tài khoản USDT',
              currency: 'USDT',
              excludedFromTotal: false,
            },
            walletBalance: {
              walletId: 'w-usdt',
              currency: 'USDT',
              opening: 1000,
              closing: 1050,
              netChange: 50,
              min: { value: 1000, date: '2026-11-01' },
              max: { value: 1050, date: '2026-11-30' },
              points: [
                { date: '2026-11-01', label: '01/11', balance: 1000 },
                { date: '2026-11-30', label: '30/11', balance: 1050 },
              ],
            },
          }),
        );
      }

      if (walletId === 'w-excl') {
        return Response.json(
          createMockReportData({
            currency: 'VND',
            approximate: false,
            singleWallet: {
              walletId: 'w-excl',
              name: 'Quỹ riêng',
              currency: 'VND',
              excludedFromTotal: true,
            },
          }),
        );
      }

      const currMonth = currentMonthLocal();
      const isPrevMonth = month !== null && month !== currMonth;

      if (isPrevMonth) {
        return Response.json(
          createMockReportData({
            period: {
              mode: 'month',
              from: `${month}-01`,
              to: `${month}-31`,
              effectiveTo: `${month}-31`,
              inProgress: false,
              granularity: 'day',
              previous: {
                from: '2026-09-01',
                to: '2026-09-30',
                effectiveTo: '2026-09-30',
              },
              baselines: [],
            },
            totals: { spent: 850000, income: 3000000, net: 2150000 },
          }),
        );
      }

      return Response.json(createMockReportData());
    },
    'GET /api/me/personal/report/category/cat-food': (_init: RequestInit | undefined, url: string) => {
      if (typeof drilldownOverride === 'function') {
        const res = drilldownOverride(url, 'cat-food');
        return Response.json(res ?? createMockDrilldown());
      }
      if (drilldownOverride) return Response.json(drilldownOverride);
      return Response.json(createMockDrilldown());
    },
  };

  return mockApi(routes);
}

describe('Reports & SpendingBook wiring', () => {
  describe('1. Switch-off guard (personalArea off)', () => {
    it('/trips does NOT show book-reports-row or book-month-totals and makes 0 /api/me/personal requests', async () => {
      const { calls } = mockReportsApp({ me: meOff });
      renderAt(<App />, { route: '/trips' });

      expect(await screen.findByTestId('home-total')).toBeInTheDocument();
      expect(screen.queryByTestId('book-reports-row')).not.toBeInTheDocument();
      expect(screen.queryByTestId('book-month-totals')).not.toBeInTheDocument();
      expect(calls.some((c) => c.path.startsWith('/api/me/personal'))).toBe(false);
    });

    it('navigating to /reports redirects to /trips', async () => {
      mockReportsApp({ me: meOff });
      renderAt(<App />, { route: '/reports' });

      await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/trips$/));
      expect(await screen.findByTestId('home-total')).toBeInTheDocument();
    });

    it('navigating to /reports/category/cat-food redirects to /trips', async () => {
      mockReportsApp({ me: meOff });
      renderAt(<App />, { route: '/reports/category/cat-food' });

      await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/trips$/));
      expect(await screen.findByTestId('home-total')).toBeInTheDocument();
    });
  });

  describe('2. 2-tap flow: SpendingBook -> /reports -> step prev month -> tap "Ăn uống" -> category drilldown -> sub-category filter', () => {
    it('walks from SpendingBook into reports, steps month, drills down into Food, and filters by subcategory', async () => {
      const user = userEvent.setup();
      mockReportsApp({ me: meOn });

      renderAt(<App />, { route: '/trips' });

      // Tap reports row in SpendingBook
      const reportsRow = await screen.findByTestId('book-reports-row');
      expect(reportsRow).toHaveAttribute('href', '/reports');
      expect(reportsRow).toHaveTextContent('Reports');
      await user.click(reportsRow);

      await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/reports/));
      expect(await screen.findByTestId('reports-category-section')).toBeInTheDocument();

      // Verify DOM order invariant: category-section precedes tags-section
      const catSec = screen.getByTestId('reports-category-section');
      const tagSec = screen.getByTestId('reports-tags-section');
      expect(Boolean(catSec.compareDocumentPosition(tagSec) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);

      // Verify NO "Theo ngày" / "By day" toggle exists
      expect(screen.queryByText(/theo ngày/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/by day/i)).not.toBeInTheDocument();

      // Step to previous month and wait for previous month data (totals.spent changes from 1.200.000₫ to 850.000₫)
      const prevBtn = screen.getByRole('button', { name: 'Previous period' });
      await user.click(prevBtn);

      await waitFor(() => expect(screen.queryByText(/1\.200\.000₫/)).not.toBeInTheDocument());
      const freshCatSec = await screen.findByTestId('reports-category-section');
      const foodCategoryBtn = await within(freshCatSec).findByRole('button', { name: /Ăn uống/i });
      await user.click(foodCategoryBtn);

      // Arrives at /reports/category/cat-food
      await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/\/reports\/category\/cat-food/));

      // 1. Summary Card
      const summaryCard = await screen.findByTestId('category-drilldown-summary');
      expect(summaryCard).toHaveTextContent('Ăn uống');
      expect(summaryCard).toHaveTextContent('850.000₫');
      expect(summaryCard).toHaveTextContent('+13%');

      // 2. Sub-categories breakdown card
      const subCard = await screen.findByTestId('category-subcategories-card');
      const coffeeBtn = within(subCard).getByRole('button', { name: /cà phê/i });
      const generalBtn = within(subCard).getByRole('button', { name: /ăn uống \((chung|general)\)/i });
      expect(coffeeBtn).toBeInTheDocument();
      expect(generalBtn).toBeInTheDocument();

      // 3. Transactions section lists both
      const txSection = screen.getByTestId('category-transactions-section');
      expect(within(txSection).getByText(/Cà phê muối/)).toBeInTheDocument();
      expect(within(txSection).getByText(/Cơm trưa/)).toBeInTheDocument();

      // Click "Cà phê" sub-category button to filter
      await user.click(coffeeBtn);

      // Active sub filter chip is shown
      const filterChip = await screen.findByTestId('active-sub-filter-chip');
      expect(filterChip).toHaveTextContent('Cà phê');

      // Transactions section is filtered in place
      expect(within(txSection).getByText(/Cà phê muối/)).toBeInTheDocument();
      expect(within(txSection).queryByText(/Cơm trưa/)).not.toBeInTheDocument();

      // Click clear button on filter chip
      const clearBtn = within(filterChip).getByRole('button');
      await user.click(clearBtn);

      // Filter chip is gone and all matching transactions are restored
      expect(screen.queryByTestId('active-sub-filter-chip')).not.toBeInTheDocument();
      expect(within(txSection).getByText(/Cà phê muối/)).toBeInTheDocument();
      expect(within(txSection).getByText(/Cơm trưa/)).toBeInTheDocument();
    });
  });

  describe('3. Single-wallet scope (USDT & excludeFromReports: true wallet)', () => {
    it('renders WalletBalanceCard without any ≈ when scoped to USDT', async () => {
      const user = userEvent.setup();
      mockReportsApp({ me: meOn });

      renderAt(<App />, { route: '/reports' });

      expect(await screen.findByTestId('reports-category-section')).toBeInTheDocument();

      // Open wallet picker sheet
      const walletScopeBtn = screen.getByRole('button', { name: 'All wallets' });
      await user.click(walletScopeBtn);

      // Select USDT wallet
      const usdtOption = await screen.findByRole('button', { name: /tài khoản usdt/i });
      await user.click(usdtOption);

      // Wallet filter updates to Tài khoản USDT
      await screen.findByRole('button', { name: 'Wallet: Tài khoản USDT' });

      // WalletBalanceCard is displayed
      const balanceTitle = await screen.findByText('Balance over time');
      expect(balanceTitle).toBeInTheDocument();
      expect(screen.getByText('USDT')).toBeInTheDocument();

      // Zero ≈ anywhere in WalletBalanceCard
      const balanceCard = balanceTitle.closest('.rounded-xl')!;
      expect(balanceCard).not.toHaveTextContent('≈');

      // WalletBalanceCard is rendered above HealthTrendCard
      const healthCard = screen.getByText('Income & spending this period').closest('.rounded-xl')!;
      expect(Boolean(balanceCard.compareDocumentPosition(healthCard) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    });

    it('renders reports-excluded-wallet-banner and data when scoped to an excluded wallet', async () => {
      const user = userEvent.setup();
      mockReportsApp({ me: meOn });

      renderAt(<App />, { route: '/reports' });

      expect(await screen.findByTestId('reports-category-section')).toBeInTheDocument();

      // Open wallet picker sheet
      const walletScopeBtn = screen.getByRole('button', { name: 'All wallets' });
      await user.click(walletScopeBtn);

      // Select excluded wallet
      const exclOption = await screen.findByRole('button', { name: /quỹ riêng/i });
      await user.click(exclOption);

      // Excluded banner is rendered
      expect(await screen.findByTestId('reports-excluded-wallet-banner')).toBeInTheDocument();
      expect(screen.getByText('This wallet is excluded from overall reports — viewing separately')).toBeInTheDocument();
      expect(screen.getByTestId('reports-category-section')).toBeInTheDocument();
      expect(screen.getByText('Income & spending this period')).toBeInTheDocument();
    });
  });

  describe('4. Empty & unrated-only states', () => {
    it('renders empty state with Clear filters button when filtered with 0 transactions', async () => {
      const user = userEvent.setup();
      mockReportsApp({
        me: meOn,
        reportOverride: createMockReportData({
          countedCount: 0,
          hasAnyUnratedOnly: false,
          spendingByCategory: [],
          incomeByCategory: [],
          tags: { expense: [], income: [], hasMultiTagOverlap: false },
        }),
      });

      renderAt(<App />, { route: '/reports?walletId=w-cash' });

      expect(await screen.findByText('No transactions in this period')).toBeInTheDocument();
      const clearBtn = screen.getByRole('button', { name: 'Clear filters' });
      expect(clearBtn).toBeInTheDocument();

      await user.click(clearBtn);

      // Resets walletId & sets includeGroups
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'All wallets' })).toBeInTheDocument();
      });
    });

    it('renders reports-unrated-only and unrated banner with 1-tap inspect button, not empty state', async () => {
      mockReportsApp({
        me: meOn,
        reportOverride: createMockReportData({
          hasAnyUnratedOnly: true,
          unratedWallets: [
            { walletId: 'w-jpy', name: 'Ví Yên', currency: 'JPY', spent: 10000, income: 0 },
          ],
          perCurrency: [
            { currency: 'JPY', spent: 10000, income: 0 },
          ],
        }),
      });

      renderAt(<App />, { route: '/reports' });

      // Renders unrated banner & unrated only card
      expect(await screen.findByTestId('reports-unrated-banner')).toBeInTheDocument();
      expect(screen.getByTestId('reports-unrated-only')).toBeInTheDocument();
      expect(screen.getByText('JPY')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'View Ví Yên wallet' })).toBeInTheDocument();

      // Does NOT show empty state
      expect(screen.queryByText('No transactions in this period')).not.toBeInTheDocument();
      expect(screen.queryByText('Chưa có giao dịch')).not.toBeInTheDocument();
    });
  });

  describe('5. Zalo Mini App parity', () => {
    it('renders cleanly inside .fsl-screen--zmp on ZMP platform', async () => {
      mockReportsApp({ me: meOn });

      renderAt(<App />, {
        route: '/reports',
        platform: fakePlatform({ kind: 'zmp' }),
      });

      expect(await screen.findByTestId('reports-category-section')).toBeInTheDocument();
      expect(document.querySelector('.fsl-screen--zmp')).toBeInTheDocument();
      expect(screen.getByText('Income & spending this period')).toBeInTheDocument();
    });
  });

  describe('6. SpendingBook quiet monthly totals & no hero color regression', () => {
    it('renders quiet monthly totals and preserves neutral hero amount tone', async () => {
      mockReportsApp({
        me: meOn,
        reportOverride: createMockReportData({
          totals: { spent: 1200000, income: 3500000, net: 2300000 },
        }),
      });

      renderAt(<App />, { route: '/trips' });

      const monthTotals = await screen.findByTestId('book-month-totals');
      expect(monthTotals).toHaveTextContent('Spent this month 1.200.000₫');
      expect(monthTotals).toHaveTextContent('Income 3.500.000₫');

      const total = screen.getByTestId('book-total');
      const firstAmount = total.querySelector('.fsl-amount');
      expect(firstAmount).not.toBeNull();
      expect(firstAmount).not.toHaveClass('text-success');
    });
  });
});
