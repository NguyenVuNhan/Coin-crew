import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  BudgetDef,
  CategoryView,
  CountedSpendRow,
  EntryView,
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
    todayLocal: () => '2026-11-26',
  };
});

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const meOff = {
  user: { id: 'u-me', email: 'me@example.com', name: 'Me', consentAt: '2026-10-12T00:00:00.000Z' },
  signIn: { zalo: true },
  mergeRequests: { incoming: [], outgoing: [] },
  personalArea: false,
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
  balance: 5_000_000,
  isDefault: true,
  kind: 'everyday',
  startAmount: 5_000_000,
  startDate: '2025-01-01',
  startCostVnd: null,
  vndValue: 5_000_000,
  icon: 'wallet',
  sortOrder: 0,
  archived: false,
  entryCount: 20,
  excludeFromReports: false,
};

const categories: CategoryView[] = [
  { id: 'cat-food', parentId: null, type: 'expense', name: 'Ăn uống', icon: 'utensils', hidden: false, sortOrder: 0 },
  { id: 'cat-home', parentId: null, type: 'expense', name: 'Sửa nhà', icon: 'house', hidden: false, sortOrder: 1 },
  { id: 'cat-shop', parentId: null, type: 'expense', name: 'Mua sắm', icon: 'shopping-bag', hidden: false, sortOrder: 2 },
];

const tags: TagView[] = [
  { id: 'tag-trip', name: 'Đà Lạt', useCount: 3 },
];

const foodBudget: BudgetDef = {
  id: 'b-food',
  name: 'Ăn uống',
  target: { kind: 'category', categoryId: 'cat-food' },
  currency: 'VND',
  periodKind: 'month',
  monthStartDay: 1,
  from: null,
  to: null,
  excludedWalletIds: [],
  limits: [
    { effectiveFrom: '2026-04-01', amount: 2_500_000 },
    { effectiveFrom: '2026-09-01', amount: 3_000_000 },
  ],
  suggestionDismissedUntil: null,
  createdOn: '2026-04-10',
};

const shortHistoryBudget: BudgetDef = {
  id: 'b-short',
  name: 'Ăn uống ngắn',
  target: { kind: 'category', categoryId: 'cat-food' },
  currency: 'VND',
  periodKind: 'month',
  monthStartDay: 1,
  from: null,
  to: null,
  excludedWalletIds: [],
  limits: [{ effectiveFrom: '2026-10-01', amount: 3_000_000 }],
  suggestionDismissedUntil: null,
  createdOn: '2026-10-15',
};

const longOnceBudget: BudgetDef = {
  id: 'b-renovation',
  name: 'Sửa nhà',
  target: { kind: 'category', categoryId: 'cat-home' },
  currency: 'VND',
  periodKind: 'once',
  monthStartDay: null,
  from: '2025-01-01',
  to: '2027-12-31',
  excludedWalletIds: [],
  limits: [{ effectiveFrom: '2025-01-01', amount: 200_000_000 }],
  suggestionDismissedUntil: null,
  createdOn: '2025-01-01',
};

const tagBudget: BudgetDef = {
  id: 'b-trip',
  name: 'Chuyến Đà Lạt',
  target: { kind: 'tag', tagId: 'tag-trip' },
  currency: 'VND',
  periodKind: 'month',
  monthStartDay: 1,
  from: null,
  to: null,
  excludedWalletIds: [],
  limits: [{ effectiveFrom: '2026-11-01', amount: 5_000_000 }],
  suggestionDismissedUntil: null,
  createdOn: '2026-11-01',
};

function spendRow(
  id: string,
  date: string,
  categoryId: string,
  amount: number,
  tagIds: string[] = [],
): CountedSpendRow {
  return {
    id,
    kind: 'entry',
    date,
    amount,
    currency: 'VND',
    walletId: 'w-cash',
    categoryId,
    tagIds,
  };
}

function makeEntry(
  id: string,
  date: string,
  categoryId: string,
  amount: number,
  note: string,
  tagsList: string[] = [],
): EntryView {
  return {
    id,
    walletId: 'w-cash',
    type: 'expense',
    amount,
    currency: 'VND',
    categoryId,
    transferId: null,
    counterpartWalletId: null,
    date,
    time: '12:00',
    note,
    tags: tagsList,
    excludeFromReports: false,
    source: 'manual',
    beforeStart: false,
    createdAt: `${date}T12:00:00.000Z`,
  };
}

function stubApis(opts: {
  budgets: BudgetDef[];
  rows: CountedSpendRow[];
  listEntries?: EntryView[];
  me?: typeof meOn;
  patchRoutes?: Record<string, unknown>;
}) {
  const { budgets, rows, listEntries = [], me = meOn, patchRoutes = {} } = opts;
  return mockApi({
    'GET /api/me': me,
    'GET /api/me/personal/budgets': { budgets },
    'GET /api/me/personal/budgets/progress': { rows },
    'GET /api/me/personal/wallets': { wallets: [cashWallet] },
    'GET /api/me/personal/categories': { categories },
    'GET /api/me/personal/tags': { tags },
    'GET /api/me/personal/group-settings': {
      settings: { defaultGroupCategoryId: null, countLoans: false },
    },
    'GET /api/me/personal/list': {
      rows: listEntries.map((entry) => ({ kind: 'entry', entry })),
      totals: [],
      groupRows: [],
    },
    ...patchRoutes,
    'GET /api/me/ledger': ledger,
    'GET /api/me/people': peopleSummary,
    'GET /api/trips/t-led': ledgerView(),
    'GET /api/trips': { trips: [] },
  });
}

function renderDetailVi(route: string) {
  const utils = renderAt(<App />, { route, path: '*' });
  act(() => {
    setLang('vi', false);
  });
  return utils;
}

describe('BudgetDetailScreen', () => {
  it('renders summary card with period label, Còn lại amount, limit/spent/time-left, state note, and edit link', async () => {
    const rows: CountedSpendRow[] = [
      spendRow('e-nov-1', '2026-11-10', 'cat-food', 1_130_000),
      spendRow('e-nov-2', '2026-11-20', 'cat-food', 1_000_000),
    ];
    stubApis({ budgets: [foodBudget], rows });
    renderDetailVi('/budgets/b-food');

    const card = await screen.findByTestId('budget-summary-card');
    expect(within(card).getByTestId('budget-period-label')).toHaveTextContent(/Tháng 11\/2026/);
    expect(within(card).getByText('Còn lại')).toBeInTheDocument();
    expect(within(card).getByTestId('budget-remaining-amount')).toHaveTextContent('870.000₫');
    expect(within(card).getByText('3.000.000₫')).toBeInTheDocument();
    expect(within(card).getByText('2.130.000₫')).toBeInTheDocument();
    expect(within(card).getByText(/5 ngày/)).toBeInTheDocument();
    expect(within(card).getByTestId('budget-pace-amount')).toHaveTextContent(/174\.000₫/);
    expect(within(card).getByText('mỗi ngày còn')).toBeInTheDocument();

    const editBtn = screen.getByTestId('budget-edit-button');
    expect(editBtn).toHaveAttribute('href', '/budgets/b-food?edit=1');
  });

  it('steps back with ‹ and stops at firstBudgetPeriod (B18), and disables › on current period', async () => {
    const user = userEvent.setup();
    const rows: CountedSpendRow[] = [
      spendRow('e-oct', '2026-10-18', 'cat-food', 1_200_000),
      spendRow('e-nov', '2026-11-10', 'cat-food', 800_000),
    ];
    // Created 2026-10-15 -> firstBudgetPeriod is Oct 2026; today is Nov 2026 -> 2 periods total
    stubApis({ budgets: [shortHistoryBudget], rows });
    renderDetailVi('/budgets/b-short');

    const prevBtn = await screen.findByTestId('budget-prev-period');
    const nextBtn = screen.getByTestId('budget-next-period');

    expect(nextBtn).toBeDisabled();
    expect(prevBtn).not.toBeDisabled();
    expect(screen.getByTestId('budget-period-label')).toHaveTextContent(/Tháng 11\/2026/);

    await user.click(prevBtn);
    expect(screen.getByTestId('budget-period-label')).toHaveTextContent(/Tháng 10\/2026/);
    expect(prevBtn).toBeDisabled();
    expect(nextBtn).not.toBeDisabled();

    await user.click(nextBtn);
    expect(screen.getByTestId('budget-period-label')).toHaveTextContent(/Tháng 11\/2026/);
    expect(nextBtn).toBeDisabled();
  });

  it('renders at most 6 chart columns with aria-labels and past-period rows using each period limit', async () => {
    const user = userEvent.setup();
    // Created 2026-04-10 -> 8 periods up to Nov 2026; chart should cap at 6 (Jun..Nov)
    const rows: CountedSpendRow[] = [
      spendRow('e-04', '2026-04-15', 'cat-food', 2_000_000),
      spendRow('e-05', '2026-05-15', 'cat-food', 2_100_000),
      spendRow('e-06', '2026-06-15', 'cat-food', 2_310_000),
      spendRow('e-07', '2026-07-15', 'cat-food', 2_780_000),
      spendRow('e-08', '2026-08-15', 'cat-food', 2_050_000),
      spendRow('e-09', '2026-09-15', 'cat-food', 2_890_000),
      spendRow('e-10', '2026-10-15', 'cat-food', 3_240_000),
      spendRow('e-11', '2026-11-15', 'cat-food', 2_130_000),
    ];
    stubApis({ budgets: [foodBudget], rows });
    renderDetailVi('/budgets/b-food');

    const chart = await screen.findByTestId('budget-history-chart');
    expect(screen.getByRole('list', { name: /.+/ })).toBeInTheDocument();
    const cols = within(chart).getAllByTestId('budget-chart-col');
    expect(cols).toHaveLength(6);
    for (const col of cols) {
      expect(col.querySelector('rect, line')).not.toBeNull();
    }

    // Month 10 has limit 3.000.000₫, Month 8 has limit 2.500.000₫
    const octRow = screen.getByTestId('budget-past-row-2026-10-01');
    expect(within(octRow).getByText('3.240.000₫')).toBeInTheDocument();
    expect(within(octRow).getByText('trên 3.000.000₫')).toBeInTheDocument();

    const augRow = screen.getByTestId('budget-past-row-2026-08-01');
    expect(within(augRow).getByText('2.050.000₫')).toBeInTheDocument();
    expect(within(augRow).getByText('trên 2.500.000₫')).toBeInTheDocument();

    // Tapping a past-period row moves the summary card to that period
    await user.click(augRow);
    expect(screen.getByTestId('budget-period-label')).toHaveTextContent(/Tháng 8\/2026/);
    expect(within(screen.getByTestId('budget-summary-card')).getByText('2.500.000₫')).toBeInTheDocument();
  });

  it('shows suggestion line with "Đổi mức thành …" and calls PATCH amount on accept and dismissSuggestion on dismiss', async () => {
    const user = userEvent.setup();
    // 6 completed periods (May..Oct 2026) all over 2.5M / 3M limit -> average ~3.6M
    const rows: CountedSpendRow[] = [
      spendRow('s-05', '2026-05-15', 'cat-food', 3_500_000),
      spendRow('s-06', '2026-06-15', 'cat-food', 3_600_000),
      spendRow('s-07', '2026-07-15', 'cat-food', 3_500_000),
      spendRow('s-08', '2026-08-15', 'cat-food', 3_700_000),
      spendRow('s-09', '2026-09-15', 'cat-food', 3_600_000),
      spendRow('s-10', '2026-10-15', 'cat-food', 3_700_000),
      spendRow('s-11', '2026-11-15', 'cat-food', 1_000_000),
    ];

    const api = stubApis({
      budgets: [foodBudget],
      rows,
      patchRoutes: {
        'PATCH /api/me/personal/budgets/b-food': { budget: foodBudget },
      },
    });
    renderDetailVi('/budgets/b-food');

    const acceptBtn = await screen.findByTestId('budget-suggest-accept');
    expect(acceptBtn).toHaveTextContent(/Đổi mức thành 3\.600\.000₫/);

    await user.click(acceptBtn);
    await waitFor(() => {
      expect(api.calls.filter((c) => c.method === 'PATCH')).toHaveLength(1);
    });
    expect(api.calls.filter((c) => c.method === 'PATCH')[0]?.body).toMatchObject({
      amount: 3_600_000,
    });

    const dismissBtn = screen.getByTestId('budget-suggest-dismiss');
    await user.click(dismissBtn);
    await waitFor(() => {
      expect(api.calls.filter((c) => c.method === 'PATCH')).toHaveLength(2);
    });
    expect(api.calls.filter((c) => c.method === 'PATCH')[1]?.body).toMatchObject({
      dismissSuggestion: true,
    });
  });

  it('shows per-year bars for periods longer than 92 days', async () => {
    const rows: CountedSpendRow[] = [
      spendRow('h-25', '2025-06-10', 'cat-home', 40_000_000),
      spendRow('h-26', '2026-05-10', 'cat-home', 42_000_000),
    ];
    stubApis({ budgets: [longOnceBudget], rows });
    renderDetailVi('/budgets/b-renovation');

    await screen.findByTestId('budget-summary-card');
    expect(screen.getByText('Theo năm')).toBeInTheDocument();

    const chart = screen.getByTestId('budget-history-chart');
    const cols = within(chart).getAllByTestId('budget-chart-col');
    expect(cols).toHaveLength(3); // 2025, 2026, 2027
    expect(within(chart).getByText('2025')).toBeInTheDocument();
    expect(within(chart).getByText('2026')).toBeInTheDocument();
    expect(within(chart).getByText('2027')).toBeInTheDocument();
    expect(screen.getByText('mỗi tháng còn')).toBeInTheDocument();
  });

  it('lists only counted rows of the shown period under "Giao dịch kỳ này" and links "Tất cả ›" to /transactions with filters', async () => {
    const countedNov = spendRow('e-nov-counted', '2026-11-20', 'cat-food', 85_000);
    const countedOct = spendRow('e-oct-counted', '2026-10-12', 'cat-food', 120_000);
    const otherCatNov = spendRow('e-nov-shop', '2026-11-21', 'cat-shop', 500_000);

    const listEntries: EntryView[] = [
      makeEntry('e-nov-counted', '2026-11-20', 'cat-food', 85_000, 'Ăn trưa'),
      makeEntry('e-nov-shop', '2026-11-21', 'cat-shop', 500_000, 'Mua áo'),
    ];

    stubApis({
      budgets: [foodBudget],
      rows: [countedNov, countedOct, otherCatNov],
      listEntries,
    });
    renderDetailVi('/budgets/b-food');

    await screen.findByText('Giao dịch kỳ này (1)');
    expect(screen.getByTestId('tx-row-e-nov-counted')).toBeInTheDocument();
    expect(screen.queryByTestId('tx-row-e-nov-shop')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tx-row-e-oct-counted')).not.toBeInTheDocument();

    const seeAll = screen.getByTestId('budget-tx-see-all');
    expect(seeAll).toHaveTextContent(/Tất cả/);
    const href = seeAll.getAttribute('href') ?? '';
    const url = new URL(href, 'http://localhost');
    expect(url.pathname).toBe('/transactions');
    expect(url.searchParams.get('from')).toBe('2026-11-01');
    expect(url.searchParams.get('to')).toBe('2026-11-30');
    expect(url.searchParams.get('categoryId')).toBe('cat-food');
    expect(url.searchParams.get('tagId')).toBeNull();
  });

  it('links "Tất cả ›" with tagId for a tag budget', async () => {
    const rows: CountedSpendRow[] = [
      spendRow('e-tag-1', '2026-11-18', 'cat-food', 350_000, ['tag-trip']),
    ];
    stubApis({ budgets: [tagBudget], rows });
    renderDetailVi('/budgets/b-trip');

    const seeAll = await screen.findByTestId('budget-tx-see-all');
    const url = new URL(seeAll.getAttribute('href') ?? '', 'http://localhost');
    expect(url.pathname).toBe('/transactions');
    expect(url.searchParams.get('from')).toBe('2026-11-01');
    expect(url.searchParams.get('to')).toBe('2026-11-30');
    expect(url.searchParams.get('tagId')).toBe('tag-trip');
    expect(url.searchParams.get('categoryId')).toBeNull();
  });

  it('shows not-found state for an unknown budget id', async () => {
    stubApis({ budgets: [foodBudget], rows: [] });
    renderDetailVi('/budgets/does-not-exist');

    expect(await screen.findByTestId('budget-not-found')).toBeInTheDocument();
  });

  it('is not reachable when personalArea is switched off', async () => {
    stubApis({ budgets: [foodBudget], rows: [], me: meOff });
    renderDetailVi('/budgets/b-food');

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/trips');
    });
  });
});
