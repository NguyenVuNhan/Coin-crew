import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  CategoryView,
  GroupSettingsView,
  ReportCategoryDrilldown,
  ReportData,
  TagView,
  TripView,
  WalletDetailView,
} from '@cc/core';
import { renderAt, mockApi } from '../../test/render';
import { mockMedia } from '../../test/media';
import { tripView } from '../../test/fixtures';
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
            width: 375,
            height: 300,
            top: 0,
            right: 375,
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

let client: QueryClient | null = null;
function GrabClient() {
  client = useQueryClient();
  return null;
}

function renderApp(initialEntry: string) {
  return renderAt(
    <>
      <App />
      <GrabClient />
    </>,
    { route: initialEntry, path: '*' },
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  vi.stubGlobal('scrollTo', vi.fn());
  mockMedia({ wide: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('data-theme');
  localStorage.clear();
  client = null;
});

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

const defaultWallets: WalletDetailView[] = [cashWallet];

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

const defaultTransactions = {
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

function mockThemeReportsApi(theme: 'jade' | 'pink') {
  let activeTheme = theme;

  const routes = {
    'GET /api/me': () =>
      Response.json({
        user: {
          id: 'u-me',
          email: 'me@example.com',
          name: 'Me',
          consentAt: '2026-10-12T00:00:00.000Z',
          providers: ['google'],
          theme: activeTheme,
        },
        personalArea: true,
        signIn: { zalo: true },
        mergeRequests: { incoming: [], outgoing: [] },
      }),
    'GET /api/me/ledger': ledger,
    'GET /api/me/people/summary': peopleSummary,
    'GET /api/trips': [{ id: 't-1', name: 'Đà Lạt · Oct 2026', archived: false, myBalance: 500000 }],
    'GET /api/trips/t-led': ledgerView(),
    'GET /api/trips/t-led/version': { version: 1 },
    'GET /api/me/personal/wallets': { wallets: defaultWallets },
    'GET /api/me/personal/categories': { categories: defaultCategories },
    'GET /api/me/personal/tags': { tags: defaultTags },
    'GET /api/me/personal/assets': { assets: [] },
    'GET /api/me/personal/group-settings': { settings: defaultGroupSettings },
    'GET /api/me/personal/transactions': defaultTransactions,
    'GET /api/me/personal/report': () => Response.json(createMockReportData()),
    'GET /api/me/personal/report/category/cat-food': () => Response.json(createMockDrilldown()),
  };

  const api = mockApi(routes);

  return {
    ...api,
    setTheme(next: 'jade' | 'pink') {
      activeTheme = next;
    },
  };
}

describe('Task 8 — 375px & Multi-Theme Verification (reports-theme-and-layout)', () => {
  describe('Reports screen at 375px across jade and pink themes', () => {
    it('verifies /reports at 375px on data-theme="jade"', async () => {
      mockThemeReportsApi('jade');
      renderApp('/reports');

      await waitFor(() => expect(document.documentElement.dataset.theme).toBe('jade'));

      const catSec = await screen.findByTestId('reports-category-section');
      const tagSec = await screen.findByTestId('reports-tags-section');

      // [data-slot="chart"] chart containers render cleanly (at least 3: health trend + 2 category donuts)
      const charts = document.querySelectorAll('[data-slot="chart"]');
      expect(charts.length).toBeGreaterThanOrEqual(3);

      // Fixed Money colors invariant: spent total retains text-danger class and income total retains text-success class (neither adopts text-primary)
      const spentTotal = screen.getByText(/1\.200\.000/);
      expect(spentTotal).toHaveClass('text-danger');
      expect(spentTotal).not.toHaveClass('text-primary');

      const incomeTotal = screen.getByText(/3\.500\.000/);
      expect(incomeTotal).toHaveClass('text-success');
      expect(incomeTotal).not.toHaveClass('text-primary');

      // Step 4 layout invariants hold: reports-category-section strictly precedes reports-tags-section, and NO "Theo ngày" / "By day" toggle exists
      expect(Boolean(catSec.compareDocumentPosition(tagSec) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
      expect(screen.queryByText(/theo ngày/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/by day/i)).not.toBeInTheDocument();
    });

    it('verifies /reports at 375px on data-theme="pink"', async () => {
      mockThemeReportsApi('pink');
      renderApp('/reports');

      await waitFor(() => expect(document.documentElement.dataset.theme).toBe('pink'));

      const catSec = await screen.findByTestId('reports-category-section');
      const tagSec = await screen.findByTestId('reports-tags-section');

      // [data-slot="chart"] chart containers render cleanly (at least 3: health trend + 2 category donuts)
      const charts = document.querySelectorAll('[data-slot="chart"]');
      expect(charts.length).toBeGreaterThanOrEqual(3);

      // Fixed Money colors invariant: spent total retains text-danger class and income total retains text-success class (neither adopts text-primary)
      const spentTotal = screen.getByText(/1\.200\.000/);
      expect(spentTotal).toHaveClass('text-danger');
      expect(spentTotal).not.toHaveClass('text-primary');

      const incomeTotal = screen.getByText(/3\.500\.000/);
      expect(incomeTotal).toHaveClass('text-success');
      expect(incomeTotal).not.toHaveClass('text-primary');

      // Step 4 layout invariants hold: reports-category-section strictly precedes reports-tags-section, and NO "Theo ngày" / "By day" toggle exists
      expect(Boolean(catSec.compareDocumentPosition(tagSec) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
      expect(screen.queryByText(/theo ngày/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/by day/i)).not.toBeInTheDocument();
    });
  });

  describe('Report category drilldown at 375px across jade and pink themes', () => {
    it('verifies /reports/category/cat-food at 375px on data-theme="jade"', async () => {
      mockThemeReportsApi('jade');
      renderApp('/reports/category/cat-food');

      await waitFor(() => expect(document.documentElement.dataset.theme).toBe('jade'));

      // Summary total retains text-danger class for expense (cat-food)
      const summaryCard = await screen.findByTestId('category-drilldown-summary');
      const summaryTotal = within(summaryCard).getByText(/850\.000/);
      expect(summaryTotal).toHaveClass('text-danger');
      expect(summaryTotal).not.toHaveClass('text-primary');

      // [data-slot="chart"] sub-category donut renders
      const subChart = document.querySelector('[data-slot="chart"]');
      expect(subChart).toBeInTheDocument();

      // Sub-categories list renders (Cà phê, Ăn uống (general) / Ăn uống (chung))
      const subCard = await screen.findByTestId('category-subcategories-card');
      expect(within(subCard).getByText('Cà phê')).toBeInTheDocument();
      expect(within(subCard).getByText(/Ăn uống \((general|chung)\)/)).toBeInTheDocument();

      // Transactions list renders
      const txSection = await screen.findByTestId('category-transactions-section');
      expect(within(txSection).getByText(/Cà phê muối/)).toBeInTheDocument();
      expect(within(txSection).getByText(/Cơm trưa/)).toBeInTheDocument();
    });

    it('verifies /reports/category/cat-food at 375px on data-theme="pink"', async () => {
      mockThemeReportsApi('pink');
      renderApp('/reports/category/cat-food');

      await waitFor(() => expect(document.documentElement.dataset.theme).toBe('pink'));

      // Summary total retains text-danger class for expense (cat-food)
      const summaryCard = await screen.findByTestId('category-drilldown-summary');
      const summaryTotal = within(summaryCard).getByText(/850\.000/);
      expect(summaryTotal).toHaveClass('text-danger');
      expect(summaryTotal).not.toHaveClass('text-primary');

      // [data-slot="chart"] sub-category donut renders
      const subChart = document.querySelector('[data-slot="chart"]');
      expect(subChart).toBeInTheDocument();

      // Sub-categories list renders (Cà phê, Ăn uống (general) / Ăn uống (chung))
      const subCard = await screen.findByTestId('category-subcategories-card');
      expect(within(subCard).getByText('Cà phê')).toBeInTheDocument();
      expect(within(subCard).getByText(/Ăn uống \((general|chung)\)/)).toBeInTheDocument();

      // Transactions list renders
      const txSection = await screen.findByTestId('category-transactions-section');
      expect(within(txSection).getByText(/Cà phê muối/)).toBeInTheDocument();
      expect(within(txSection).getByText(/Cơm trưa/)).toBeInTheDocument();
    });
  });

  describe('Live ThemeController swap', () => {
    it('swaps live from jade -> pink without unmounting or losing category section or charts', async () => {
      const api = mockThemeReportsApi('jade');
      renderApp('/reports');

      await waitFor(() => expect(document.documentElement.dataset.theme).toBe('jade'));
      expect(await screen.findByTestId('reports-category-section')).toBeInTheDocument();
      expect(document.querySelectorAll('[data-slot="chart"]').length).toBeGreaterThanOrEqual(3);

      // Update mocked GET /api/me theme to 'pink' and invalidate ['me'] query (exact: true) via GrabClient
      api.setTheme('pink');
      await act(async () => {
        await client!.invalidateQueries({ queryKey: ['me'], exact: true });
      });

      await waitFor(() => expect(document.documentElement.dataset.theme).toBe('pink'));
      expect(screen.getByTestId('reports-category-section')).toBeInTheDocument();
      expect(document.querySelectorAll('[data-slot="chart"]').length).toBeGreaterThanOrEqual(3);
    });
  });
});
