import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  BudgetDef,
  CategoryView,
  CountedSpendRow,
  EventView,
  ReportData,
  TagView,
  TripView,
  WalletDetailView,
} from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { renderAt, mockApi } from '../../test/render';
import { tripView } from '../../test/fixtures';
import { App } from '../../App';

vi.mock('@cc/web-util/localDate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cc/web-util/localDate')>();
  return {
    ...actual,
    todayLocal: () => '2026-11-13',
  };
});

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  setLang('en');
});

const meOn = {
  user: { id: 'u-me', email: 'me@example.com', name: 'Me', consentAt: '2026-10-12T00:00:00.000Z' },
  signIn: { zalo: true },
  mergeRequests: { incoming: [], outgoing: [] },
  personalArea: true,
};

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
  balance: 10_000_000,
  isDefault: true,
  kind: 'everyday',
  startAmount: 10_000_000,
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: 10_000_000,
  icon: 'wallet',
  sortOrder: 0,
  archived: false,
  entryCount: 10,
  excludeFromReports: false,
};

const categories: CategoryView[] = [
  { id: 'cat-food', parentId: null, type: 'expense', name: 'Ăn uống', icon: 'utensils', hidden: false, sortOrder: 0 },
  { id: 'cat-stay', parentId: null, type: 'expense', name: 'Lưu trú', icon: 'hotel', hidden: false, sortOrder: 1 },
  { id: 'cat-refund', parentId: null, type: 'income', name: 'Hoàn tiền', icon: 'wallet', hidden: false, sortOrder: 2 },
];

const tags: TagView[] = [
  { id: 'tag-dl', name: 'dalat-121126-141126', useCount: 3 },
];

const daLatEvent: EventView = {
  id: 'tr-dl',
  tagId: 'tag-dl',
  tagName: 'dalat-121126-141126',
  name: 'Đà Lạt',
  start: '2026-11-12',
  end: '2026-11-14',
  stoppedAt: null,
  countsFrom: '2026-11-05',
  groupIds: ['g-friends'],
  budgetId: 'b-dl',
  createdAt: '2026-11-05T00:00:00.000Z',
};

const nullTagEvent: EventView = {
  id: 'tr-null',
  tagId: null,
  tagName: null,
  name: 'Sự kiện cũ',
  start: '2026-11-12',
  end: '2026-11-14',
  stoppedAt: null,
  countsFrom: '2026-11-12',
  groupIds: [],
  budgetId: null,
  createdAt: '2026-11-12T00:00:00.000Z',
};

const dlBudget: BudgetDef = {
  id: 'b-dl',
  name: 'Đà Lạt',
  target: { kind: 'tag', tagId: 'tag-dl' },
  currency: 'VND',
  periodKind: 'once',
  monthStartDay: null,
  from: '2026-11-05',
  to: '2026-11-14',
  excludedWalletIds: [],
  limits: [{ effectiveFrom: '2026-11-05', amount: 5_000_000 }],
  suggestionDismissedUntil: null,
  createdOn: '2026-11-05',
};

function spendRow(
  id: string,
  date: string,
  amount: number,
  tagIds: string[],
  opts: Partial<CountedSpendRow> = {},
): CountedSpendRow {
  return {
    id,
    kind: 'entry',
    date,
    amount,
    currency: 'VND',
    walletId: 'w-cash',
    categoryId: 'cat-food',
    tagIds,
    ...opts,
  };
}

function makeReport(overrides?: Partial<ReportData>): ReportData {
  return {
    period: {
      mode: 'custom',
      from: '2026-11-12',
      to: '2026-11-13',
      effectiveTo: '2026-11-13',
      inProgress: true,
      granularity: 'day',
      previous: { from: '2026-11-10', to: '2026-11-11', effectiveTo: '2026-11-11' },
      baselines: [],
    },
    currency: 'VND',
    approximate: false,
    singleWallet: null,
    totals: { spent: 2_000_000, income: 500_000, net: -1_500_000 },
    perCurrency: [{ currency: 'VND', spent: 2_000_000, income: 500_000 }],
    previousDelta: {
      previousSpent: 0,
      previousIncome: 0,
      spentDiff: 2_000_000,
      incomeDiff: 500_000,
      spentPct: null,
      incomePct: null,
    },
    baseline3m: null,
    unratedWallets: [],
    countedCount: 3,
    hasAnyUnratedOnly: false,
    healthSeries: [],
    spendingByCategory: [
      {
        categoryId: 'cat-food',
        name: 'Ăn uống',
        icon: 'utensils',
        type: 'expense',
        amount: 1_200_000,
        percent: 60,
        subCategories: [],
      },
      {
        categoryId: 'cat-stay',
        name: 'Lưu trú',
        icon: 'hotel',
        type: 'expense',
        amount: 800_000,
        percent: 40,
        subCategories: [],
      },
    ],
    incomeByCategory: [
      {
        categoryId: 'cat-refund',
        name: 'Hoàn tiền',
        icon: 'wallet',
        type: 'income',
        amount: 500_000,
        percent: 100,
        subCategories: [],
      },
    ],
    tags: {
      expense: [{ tagId: 'tag-dl', name: 'dalat-121126-141126', amount: 2_000_000, percent: 100, entryCount: 2 }],
      income: [{ tagId: 'tag-dl', name: 'dalat-121126-141126', amount: 500_000, percent: 100, entryCount: 1 }],
      hasMultiTagOverlap: false,
    },
    walletBalance: null,
    countedRows: [],
    ...overrides,
  };
}

function stubApis(opts: {
  events?: EventView[];
  budgets?: BudgetDef[];
  rows?: CountedSpendRow[];
  report?: ReportData;
} = {}) {
  const {
    events = [daLatEvent],
    budgets = [dlBudget],
    rows = [],
    report,
  } = opts;
  return mockApi({
    'GET /api/me': meOn,
    'GET /api/me/personal/events': { events },
    'GET /api/me/personal/events/tr-dl/rows': { rows },
    'GET /api/me/personal/budgets': { budgets },
    'GET /api/me/personal/budgets/progress': { today: '2026-11-13', rows },
    'GET /api/me/personal/wallets': { wallets: [cashWallet] },
    'GET /api/me/personal/categories': { categories },
    'GET /api/me/personal/tags': { tags },
    'GET /api/me/personal/group-settings': {
      settings: { defaultGroupCategoryId: null, countLoans: false },
    },
    ...(report ? { 'GET /api/me/personal/report': report } : {}),
    'GET /api/me/groups': {
      items: [{ id: 'g-friends', name: 'Nhóm Đà Lạt', preset: 'trip' }],
    },
    'GET /api/me/ledger': ledger,
    'GET /api/me/people': peopleSummary,
    'GET /api/trips/t-led': ledgerView(),
    'GET /api/trips': [],
  });
}

function renderDetailVi(route: string) {
  const utils = renderAt(<App />, { route, path: '*' });
  act(() => {
    setLang('vi', false);
  });
  return utils;
}

describe('EventDetailScreen income summary', () => {
  it('shows Đã chi / Đã thu / Chênh lệch, keeps limit & own/group & by-day, and switches to income categories', async () => {
    const user = userEvent.setup();
    const rows: CountedSpendRow[] = [
      spendRow('r-1', '2026-11-12', 1_200_000, ['tag-dl'], { kind: 'entry', categoryId: 'cat-food' }),
      spendRow('r-2', '2026-11-13', 800_000, ['tag-dl'], { kind: 'group', categoryId: 'cat-stay' }),
    ];
    const api = stubApis({ rows, report: makeReport() });
    renderDetailVi('/events/tr-dl');

    // Summary card shows Đã chi, Đã thu, Chênh lệch
    const incomeFig = await screen.findByTestId('event-income-figure');
    const spentFig = screen.getByTestId('event-spent-figure');
    const netFig = screen.getByTestId('event-net-figure');

    expect(spentFig).toHaveTextContent('Đã chi');
    expect(spentFig).toHaveTextContent('2.000.000₫');
    expect(incomeFig).toHaveTextContent('Đã thu');
    expect(incomeFig).toHaveTextContent('500.000₫');
    expect(netFig).toHaveTextContent('Chênh lệch');
    expect(netFig).toHaveTextContent('-1.500.000₫');

    // Limit bar keeps tracking spending only (5M - 2M = 3M remaining)
    const card = screen.getByTestId('event-summary-card');
    expect(card).toHaveTextContent('Còn 3.000.000₫ trong hạn mức 5.000.000₫');
    expect(card.querySelector('.fsl-budget-bar')).not.toBeNull();
    expect(card).toHaveTextContent('Bạn tự chi');
    expect(card).toHaveTextContent('1.200.000₫');
    expect(card).toHaveTextContent('Phần của bạn trong nhóm');
    expect(card).toHaveTextContent('800.000₫');

    // By-day breakdown remains intact
    expect(screen.getByTestId('event-by-day')).toHaveTextContent('12/11');

    // Transaction count includes income row
    expect(screen.getByTestId('event-see-tx')).toHaveTextContent('Xem 3 giao dịch');

    // Category switch Chi / Thu
    const catSection = screen.getByTestId('event-by-category');
    const catSwitch = within(catSection).getByTestId('event-category-switch');
    const expenseTab = within(catSwitch).getByTestId('event-category-tab-expense');
    const incomeTab = within(catSwitch).getByTestId('event-category-tab-income');
    expect(expenseTab).toHaveAttribute('aria-pressed', 'true');
    expect(incomeTab).toHaveAttribute('aria-pressed', 'false');
    expect(catSection).toHaveTextContent('Ăn uống');
    expect(catSection).toHaveTextContent('Lưu trú');
    expect(catSection).not.toHaveTextContent('Hoàn tiền');

    await user.click(incomeTab);
    expect(incomeTab).toHaveAttribute('aria-pressed', 'true');
    expect(expenseTab).toHaveAttribute('aria-pressed', 'false');
    expect(catSection).toHaveTextContent('Hoàn tiền');
    expect(catSection).toHaveTextContent('500.000₫');
    expect(catSection).not.toHaveTextContent('Ăn uống');

    // Report query used custom mode, same range as links, includeGroups=show, tagId=tag-dl
    await waitFor(() => {
      const reportUrls = api.fetchMock.mock.calls
        .map(([input]) => String(input))
        .filter((u) => u.includes('/api/me/personal/report'));
      const matched = reportUrls.find(
        (u) =>
          u.includes('mode=custom') &&
          u.includes('from=2026-11-12') &&
          u.includes('to=2026-11-13') &&
          u.includes('tagId=tag-dl') &&
          u.includes('groups=show'),
      );
      expect(matched).toBeDefined();
    });
  });

  it('income-only event shows Đã chi 0₫, Đã thu, positive Chênh lệch, and defaults to income category', async () => {
    const incomeOnlyReport = makeReport({
      totals: { spent: 0, income: 1_200_000, net: 1_200_000 },
      perCurrency: [{ currency: 'VND', spent: 0, income: 1_200_000 }],
      countedCount: 1,
      spendingByCategory: [],
      incomeByCategory: [
        {
          categoryId: 'cat-refund',
          name: 'Hoàn tiền',
          icon: 'wallet',
          type: 'income',
          amount: 1_200_000,
          percent: 100,
          subCategories: [],
        },
      ],
    });
    stubApis({ rows: [], report: incomeOnlyReport });
    renderDetailVi('/events/tr-dl');

    const incomeFig = await screen.findByTestId('event-income-figure');
    expect(screen.getByTestId('event-spent-figure')).toHaveTextContent('0₫');
    expect(incomeFig).toHaveTextContent('1.200.000₫');
    expect(screen.getByTestId('event-net-figure')).toHaveTextContent('1.200.000₫');

    // Defaults to Thu tab showing the income category
    expect(screen.getByTestId('event-category-tab-income')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('event-by-category')).toHaveTextContent('Hoàn tiền');
    expect(screen.queryByTestId('event-empty')).not.toBeInTheDocument();
  });

  it('without income shows the single total and no Chi / Thu switch', async () => {
    const rows: CountedSpendRow[] = [
      spendRow('r-1', '2026-11-12', 1_200_000, ['tag-dl'], { kind: 'entry', categoryId: 'cat-food' }),
      spendRow('r-2', '2026-11-13', 800_000, ['tag-dl'], { kind: 'group', categoryId: 'cat-stay' }),
    ];
    const noIncomeReport = makeReport({
      totals: { spent: 2_000_000, income: 0, net: -2_000_000 },
      perCurrency: [{ currency: 'VND', spent: 2_000_000, income: 0 }],
      countedCount: 2,
      incomeByCategory: [],
    });
    stubApis({ rows, report: noIncomeReport });
    renderDetailVi('/events/tr-dl');

    const card = await screen.findByTestId('event-summary-card');
    expect(card).toHaveTextContent('Tổng chi');
    expect(card).toHaveTextContent('2.000.000₫');
    expect(card).not.toHaveTextContent('Đã thu');
    expect(card).not.toHaveTextContent('Chênh lệch');
    expect(screen.queryByTestId('event-income-net')).not.toBeInTheDocument();
    expect(screen.queryByTestId('event-category-switch')).not.toBeInTheDocument();
  });

  it('with tagId null shows zeros, no crash, and skips report fetch', async () => {
    const api = stubApis({ events: [nullTagEvent], budgets: [], rows: [], report: makeReport() });
    renderDetailVi('/events/tr-null');

    const card = await screen.findByTestId('event-summary-card');
    expect(card).toHaveTextContent('0₫');
    expect(screen.getByTestId('event-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('event-income-net')).not.toBeInTheDocument();
    expect(screen.queryByTestId('event-category-switch')).not.toBeInTheDocument();

    await waitFor(() => {
      const reportCalls = api.calls.filter((c) => c.path.startsWith('/api/me/personal/report'));
      expect(reportCalls).toHaveLength(0);
    });
  });
});
