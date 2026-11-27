import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  BudgetDef,
  CategoryView,
  TagView,
  TripView,
  WalletDetailView,
} from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { browserPlatform, PlatformProvider } from '@cc/web-platform';
import { renderAt, mockApi } from '../../test/render';
import { tripView } from '../../test/fixtures';
import { App } from '../../App';
import { hideUndo } from '../../components/UndoSnackbarHost';
import { NavHistoryProvider } from '../../lib/navHistory';

interface MockEntry {
  id: string;
  type: 'expense' | 'income';
  date: string;
  time: string | null;
  createdAt: string;
  transferId: string | null;
  amount: number;
  walletId: string;
  categoryId: string | null;
  tagIds: string[];
  excludeFromReports: boolean;
}

const txCopyState: {
  status: 'opening' | 'ready' | 'unavailable';
  snapshot: { entries: MockEntry[] } | null;
} = {
  status: 'ready',
  snapshot: { entries: [] },
};

const groupCopyState: {
  status: 'ready' | 'unavailable';
  snapshot: { rows: unknown[] } | null;
} = {
  status: 'ready',
  snapshot: { rows: [] },
};

vi.mock('@cc/web-util/localDate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cc/web-util/localDate')>();
  return {
    ...actual,
    todayLocal: () => '2026-11-26',
  };
});

vi.mock('@cc/web-data-access/txCopy/hooks', () => ({
  useTxCopy: () => txCopyState,
}));

vi.mock('@cc/web-data-access/txCopy/groupCopy', () => ({
  useGroupCopy: () => groupCopyState,
}));

beforeEach(() => {
  localStorage.clear();
  hideUndo();
  txCopyState.status = 'ready';
  txCopyState.snapshot = { entries: [] };
  groupCopyState.status = 'ready';
  groupCopyState.snapshot = { rows: [] };
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  hideUndo();
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
  balance: 5_000_000,
  isDefault: true,
  kind: 'everyday',
  startAmount: 5_000_000,
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: 5_000_000,
  icon: 'wallet',
  sortOrder: 0,
  archived: false,
  entryCount: 10,
  excludeFromReports: false,
};

const excludedVndWallet: WalletDetailView = {
  ...cashWallet,
  id: 'w-stash',
  name: 'Quỹ riêng',
  isDefault: false,
  sortOrder: 1,
  excludeFromReports: true,
};

const categories: CategoryView[] = [
  { id: 'cat-food', parentId: null, type: 'expense', name: 'Ăn uống', icon: 'utensils', hidden: false, sortOrder: 0 },
  { id: 'cat-coffee', parentId: 'cat-food', type: 'expense', name: 'Cà phê', icon: 'coffee', hidden: false, sortOrder: 1 },
  { id: 'cat-shop', parentId: null, type: 'expense', name: 'Mua sắm', icon: 'shopping-bag', hidden: false, sortOrder: 2 },
  { id: 'cat-move', parentId: null, type: 'expense', name: 'Di chuyển', icon: 'bus', hidden: false, sortOrder: 3 },
];

const tags: TagView[] = [{ id: 'tag-trip', name: 'Đà Lạt', useCount: 2 }];

const lastMonthEntries: MockEntry[] = [
  { id: 'e-1', type: 'expense', date: '2026-10-05', time: null, createdAt: '2026-10-05T10:00:00Z', transferId: null, amount: 2_000_000, walletId: 'w-cash', categoryId: 'cat-food', tagIds: [], excludeFromReports: false },
  { id: 'e-2', type: 'expense', date: '2026-10-12', time: null, createdAt: '2026-10-12T10:00:00Z', transferId: null, amount: 450_000, walletId: 'w-cash', categoryId: 'cat-coffee', tagIds: [], excludeFromReports: false },
  { id: 'e-3', type: 'expense', date: '2026-10-15', time: null, createdAt: '2026-10-15T10:00:00Z', transferId: null, amount: 1_120_000, walletId: 'w-cash', categoryId: 'cat-shop', tagIds: [], excludeFromReports: false },
  { id: 'e-4', type: 'expense', date: '2026-10-20', time: null, createdAt: '2026-10-20T10:00:00Z', transferId: null, amount: 300_000, walletId: 'w-cash', categoryId: 'cat-move', tagIds: [], excludeFromReports: false },
];

function stubApis(opts: {
  budgets?: BudgetDef[];
  wallets?: WalletDetailView[];
  extraRoutes?: Record<string, unknown>;
} = {}) {
  const {
    budgets = [],
    wallets = [cashWallet, excludedVndWallet],
    extraRoutes = {},
  } = opts;
  return mockApi({
    'GET /api/me': meOn,
    'GET /api/me/personal/budgets': { budgets },
    'GET /api/me/personal/budgets/progress': { rows: [] },
    'GET /api/me/personal/wallets': { wallets },
    'GET /api/me/personal/categories': { categories },
    'GET /api/me/personal/tags': { tags },
    'GET /api/me/personal/group-settings': {
      settings: { defaultGroupCategoryId: null, countLoans: false },
    },
    'GET /api/me/personal/list': { rows: [], totals: [], groupRows: [] },
    'GET /api/me/ledger': ledger,
    'GET /api/me/people': peopleSummary,
    'GET /api/trips/t-led': ledgerView(),
    'GET /api/trips': { trips: [] },
    ...extraRoutes,
  });
}

function renderVi(route: string) {
  const utils = renderAt(<App />, { route, path: '*' });
  act(() => {
    setLang('vi', false);
  });
  return utils;
}

function LocationFullProbe() {
  const loc = useLocation();
  return <span data-testid="loc-full">{`${loc.pathname}${loc.search}`}</span>;
}

describe('BudgetForm create starters, short form, prefill & after-create', () => {
  it('renders starters with rounded amounts and creates in one tap with exact POST body', async () => {
    const user = userEvent.setup();
    txCopyState.snapshot = { entries: lastMonthEntries };

    const createdBudget: BudgetDef = {
      id: 'b-food-1',
      name: 'Ăn uống',
      target: { kind: 'category', categoryId: 'cat-food' },
      currency: 'VND',
      periodKind: 'month',
      monthStartDay: 1,
      from: null,
      to: null,
      excludedWalletIds: ['w-stash'],
      limits: [{ effectiveFrom: '2026-11-01', amount: 2_500_000 }],
      suggestionDismissedUntil: null,
      createdOn: '2026-11-26',
    };

    const api = stubApis({
      budgets: [],
      extraRoutes: {
        'POST /api/me/personal/budgets': () =>
          Response.json({ budget: createdBudget }, { status: 201 }),
      },
    });

    renderVi('/budgets?new=1');

    await screen.findByTestId('budget-starters');
    // Rounded up to next 100.000₫: 2.450.000 -> 2.500.000, 1.120.000 -> 1.200.000, 300.000 -> 300.000
    expect(screen.getByTestId('budget-starter-amount-cat-food')).toHaveValue('2.500.000');
    expect(screen.getByTestId('budget-starter-amount-cat-shop')).toHaveValue('1.200.000');
    expect(screen.getByTestId('budget-starter-amount-cat-move')).toHaveValue('300.000');
    expect(screen.getByTestId('budget-starter-row-cat-food')).toHaveTextContent('Tháng trước 2.450.000₫');

    const setBtn = screen.getByTestId('budget-starter-set-cat-food');
    expect(setBtn).toHaveTextContent('Đặt');
    await user.click(setBtn);

    await waitFor(() => {
      expect(api.calls.filter((c) => c.method === 'POST')).toHaveLength(1);
    });

    expect(api.calls.find((c) => c.method === 'POST')?.body).toEqual({
      name: 'Ăn uống',
      target: { kind: 'category', categoryId: 'cat-food' },
      currency: 'VND',
      amount: 2_500_000,
      periodKind: 'month',
      monthStartDay: 1,
      excludedWalletIds: ['w-stash'],
      today: '2026-11-26',
    });

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/budgets/b-food-1');
    });
    expect(screen.queryByTestId('budget-starters')).not.toBeInTheDocument();
    expect(screen.getByText('Đã đặt ngân sách Ăn uống')).toBeInTheDocument();

    // The snackbar offers Undo (deleting the new budget)
    expect(screen.getByRole('button', { name: 'Hoàn tác' })).toBeInTheDocument();
  });

  it('editing a starter amount sends the edited amount', async () => {
    const user = userEvent.setup();
    txCopyState.snapshot = { entries: lastMonthEntries };

    const createdBudget: BudgetDef = {
      id: 'b-food-edited',
      name: 'Ăn uống',
      target: { kind: 'category', categoryId: 'cat-food' },
      currency: 'VND',
      periodKind: 'month',
      monthStartDay: 1,
      from: null,
      to: null,
      excludedWalletIds: ['w-stash'],
      limits: [{ effectiveFrom: '2026-11-01', amount: 3_000_000 }],
      suggestionDismissedUntil: null,
      createdOn: '2026-11-26',
    };

    const api = stubApis({
      budgets: [],
      extraRoutes: {
        'POST /api/me/personal/budgets': () =>
          Response.json({ budget: createdBudget }, { status: 201 }),
      },
    });

    renderVi('/budgets?new=1');
    const amountInput = await screen.findByTestId('budget-starter-amount-cat-food');
    await user.clear(amountInput);
    await user.type(amountInput, '3tr');

    await user.click(screen.getByTestId('budget-starter-set-cat-food'));

    await waitFor(() => {
      expect(api.calls.filter((c) => c.method === 'POST')).toHaveLength(1);
    });
    expect(api.calls.find((c) => c.method === 'POST')?.body).toMatchObject({
      name: 'Ăn uống',
      amount: 3_000_000,
    });
  });

  it('guards against double tap on "Đặt" so only one POST is sent', async () => {
    txCopyState.snapshot = { entries: lastMonthEntries };

    let resolvePost!: (res: Response) => void;
    const postPromise = new Promise<Response>((resolve) => {
      resolvePost = resolve;
    });

    const createdBudget: BudgetDef = {
      id: 'b-food-once',
      name: 'Ăn uống',
      target: { kind: 'category', categoryId: 'cat-food' },
      currency: 'VND',
      periodKind: 'month',
      monthStartDay: 1,
      from: null,
      to: null,
      excludedWalletIds: ['w-stash'],
      limits: [{ effectiveFrom: '2026-11-01', amount: 2_500_000 }],
      suggestionDismissedUntil: null,
      createdOn: '2026-11-26',
    };

    const api = stubApis({
      budgets: [],
      extraRoutes: {
        'POST /api/me/personal/budgets': () => postPromise,
      },
    });

    renderVi('/budgets?new=1');
    const setBtn = await screen.findByTestId('budget-starter-set-cat-food');

    // Two rapid clicks before the first request resolves
    fireEvent.click(setBtn);
    fireEvent.click(setBtn);

    await waitFor(() => {
      expect(setBtn).toBeDisabled();
    });
    expect(api.calls.filter((c) => c.method === 'POST')).toHaveLength(1);

    resolvePost(Response.json({ budget: createdBudget }, { status: 201 }));

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/budgets/b-food-once');
    });
    expect(api.calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });

  it('shows skeleton instead of flashing the short form while budgets source is pending, then shows starters', async () => {
    txCopyState.snapshot = { entries: lastMonthEntries };

    let resolveBudgets!: (res: Response) => void;
    const budgetsPromise = new Promise<Response>((resolve) => {
      resolveBudgets = resolve;
    });

    stubApis({
      budgets: [],
      extraRoutes: {
        'GET /api/me/personal/budgets': () => budgetsPromise,
      },
    });

    renderVi('/budgets?new=1');

    // While budgets source is pending, skeleton renders and short form does NOT flash
    await screen.findByTestId('budget-starters-loading');
    expect(screen.queryByTestId('budget-form')).not.toBeInTheDocument();
    expect(screen.queryByTestId('budget-starters')).not.toBeInTheDocument();

    resolveBudgets(Response.json({ budgets: [] }));

    await screen.findByTestId('budget-starters');
    expect(screen.queryByTestId('budget-starters-loading')).not.toBeInTheDocument();
    expect(screen.queryByTestId('budget-form')).not.toBeInTheDocument();
  });

  it('opens short form directly when there are no starters or copy is not ready', async () => {
    txCopyState.snapshot = { entries: [] };
    stubApis({ budgets: [] });

    renderVi('/budgets?new=1');
    await screen.findByTestId('budget-form');
    expect(screen.queryByTestId('budget-starters')).not.toBeInTheDocument();
    expect(screen.queryByTestId('budget-starters-loading')).not.toBeInTheDocument();
  });

  it('"Chọn danh mục khác" switches from starters to the short form', async () => {
    const user = userEvent.setup();
    txCopyState.snapshot = { entries: lastMonthEntries };
    stubApis({ budgets: [] });

    renderVi('/budgets?new=1');
    await screen.findByTestId('budget-starters');

    await user.click(screen.getByTestId('budget-starters-other'));
    await screen.findByTestId('budget-form');
    expect(screen.queryByTestId('budget-starters')).not.toBeInTheDocument();
  });

  it('prefill URL params skip starters and fill category and amount in the short form', async () => {
    const user = userEvent.setup();
    txCopyState.snapshot = { entries: lastMonthEntries };

    const createdBudget: BudgetDef = {
      id: 'b-shop-prefill',
      name: 'Mua sắm',
      target: { kind: 'category', categoryId: 'cat-shop' },
      currency: 'VND',
      periodKind: 'month',
      monthStartDay: 1,
      from: null,
      to: null,
      excludedWalletIds: ['w-stash'],
      limits: [{ effectiveFrom: '2026-11-01', amount: 1_500_000 }],
      suggestionDismissedUntil: null,
      createdOn: '2026-11-26',
    };

    const api = stubApis({
      budgets: [],
      extraRoutes: {
        'POST /api/me/personal/budgets': () =>
          Response.json({ budget: createdBudget }, { status: 201 }),
      },
    });

    renderVi('/budgets?new=1&categoryId=cat-shop&amount=1500000');

    await screen.findByTestId('budget-form');
    expect(screen.queryByTestId('budget-starters')).not.toBeInTheDocument();
    expect(await screen.findByTestId('category-tile-cat-shop')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('budget-form-amount')).toHaveValue('1500000');
    expect(screen.getByTestId('budget-form-amount-preview')).toHaveTextContent('1.500.000₫');

    await user.click(screen.getByTestId('budget-form-submit'));

    await waitFor(() => {
      expect(api.calls.filter((c) => c.method === 'POST')).toHaveLength(1);
    });
    expect(api.calls.find((c) => c.method === 'POST')?.body).toEqual({
      name: 'Mua sắm',
      target: { kind: 'category', categoryId: 'cat-shop' },
      currency: 'VND',
      amount: 1_500_000,
      periodKind: 'month',
      monthStartDay: 1,
      excludedWalletIds: ['w-stash'],
      today: '2026-11-26',
    });
  });

  it('"Thêm tuỳ chọn" hides and shows advanced fields (period, wallets, name)', async () => {
    const user = userEvent.setup();
    txCopyState.snapshot = { entries: [] };
    stubApis({ budgets: [] });

    renderVi('/budgets?new=1');
    await screen.findByTestId('budget-form');

    const moreBtn = screen.getByTestId('budget-form-more-options');
    expect(moreBtn).toHaveTextContent('Thêm tùy chọn');
    expect(moreBtn).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('budget-form-period')).not.toBeInTheDocument();
    expect(screen.queryByTestId('budget-form-wallets')).not.toBeInTheDocument();
    expect(screen.queryByTestId('budget-form-name')).not.toBeInTheDocument();

    await user.click(moreBtn);
    expect(moreBtn).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('budget-form-period')).toBeInTheDocument();
    expect(screen.getByTestId('budget-form-wallets')).toBeInTheDocument();
    expect(screen.getByTestId('budget-form-name')).toBeInTheDocument();

    await user.click(moreBtn);
    expect(moreBtn).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('budget-form-period')).not.toBeInTheDocument();
    expect(screen.queryByTestId('budget-form-wallets')).not.toBeInTheDocument();
    expect(screen.queryByTestId('budget-form-name')).not.toBeInTheDocument();
  });

  it('after create lands on /budgets/<id> and Back returns to the origin screen', async () => {
    const user = userEvent.setup();
    txCopyState.snapshot = { entries: lastMonthEntries };

    const createdBudget: BudgetDef = {
      id: 'b-back-1',
      name: 'Ăn uống',
      target: { kind: 'category', categoryId: 'cat-food' },
      currency: 'VND',
      periodKind: 'month',
      monthStartDay: 1,
      from: null,
      to: null,
      excludedWalletIds: ['w-stash'],
      limits: [{ effectiveFrom: '2026-11-01', amount: 2_500_000 }],
      suggestionDismissedUntil: null,
      createdOn: '2026-11-26',
    };

    const budgetsRef: BudgetDef[] = [];
    stubApis({
      budgets: budgetsRef,
      extraRoutes: {
        'GET /api/me/personal/budgets': () => Response.json({ budgets: budgetsRef }),
        'POST /api/me/personal/budgets': () => {
          budgetsRef.push(createdBudget);
          return Response.json({ budget: createdBudget }, { status: 201 });
        },
      },
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <PlatformProvider platform={browserPlatform}>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/trips', '/budgets']} initialIndex={1}>
            <NavHistoryProvider>
              <Routes>
                <Route path="*" element={<App />} />
              </Routes>
              <LocationFullProbe />
            </NavHistoryProvider>
          </MemoryRouter>
        </QueryClientProvider>
      </PlatformProvider>,
    );
    act(() => {
      setLang('vi', false);
    });

    await user.click(await screen.findByTestId('budgets-add-button'));
    await screen.findByTestId('budget-starters');
    await user.click(screen.getByTestId('budget-starter-set-cat-food'));

    await waitFor(() => {
      expect(screen.getByTestId('loc-full')).toHaveTextContent('/budgets/b-back-1');
    });

    // Clicking Screen's Back arrow returns to /budgets (clean, sheet closed)
    await user.click(screen.getByRole('link', { name: 'Quay lại' }));

    await waitFor(() => {
      expect(screen.getByTestId('loc-full')).toHaveTextContent('/budgets');
    });
    expect(screen.queryByTestId('budget-starters')).not.toBeInTheDocument();
    expect(screen.queryByTestId('budget-form')).not.toBeInTheDocument();
  });

  it('after create from another origin screen, one Back returns directly to that origin screen', async () => {
    const user = userEvent.setup();
    txCopyState.snapshot = { entries: lastMonthEntries };

    const createdBudget: BudgetDef = {
      id: 'b-origin-2',
      name: 'Mua sắm',
      target: { kind: 'category', categoryId: 'cat-shop' },
      currency: 'VND',
      periodKind: 'month',
      monthStartDay: 1,
      from: null,
      to: null,
      excludedWalletIds: ['w-stash'],
      limits: [{ effectiveFrom: '2026-11-01', amount: 1_200_000 }],
      suggestionDismissedUntil: null,
      createdOn: '2026-11-26',
    };

    const budgetsRef: BudgetDef[] = [];
    stubApis({
      budgets: budgetsRef,
      extraRoutes: {
        'GET /api/me/personal/budgets': () => Response.json({ budgets: budgetsRef }),
        'POST /api/me/personal/budgets': () => {
          budgetsRef.push(createdBudget);
          return Response.json({ budget: createdBudget }, { status: 201 });
        },
      },
    });

    function OriginHarness() {
      return (
        <div>
          <Link
            to="/budgets?new=1&categoryId=cat-shop&amount=1200000"
            data-testid="origin-open"
          >
            Đặt ngân sách cho Mua sắm
          </Link>
        </div>
      );
    }

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <PlatformProvider platform={browserPlatform}>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/reports/category/cat-shop']}>
            <NavHistoryProvider>
              <Routes>
                <Route path="/reports/category/cat-shop" element={<OriginHarness />} />
                <Route path="*" element={<App />} />
              </Routes>
              <LocationFullProbe />
            </NavHistoryProvider>
          </MemoryRouter>
        </QueryClientProvider>
      </PlatformProvider>,
    );
    act(() => {
      setLang('vi', false);
    });

    // Push /budgets?new=1&categoryId=cat-shop&amount=1200000 from the origin screen (as the app does)
    await user.click(screen.getByTestId('origin-open'));
    await screen.findByTestId('budget-form');
    expect(screen.getByTestId('loc-full')).toHaveTextContent(
      '/budgets?new=1&categoryId=cat-shop&amount=1200000',
    );
    await user.click(screen.getByTestId('budget-form-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('loc-full')).toHaveTextContent('/budgets/b-origin-2');
    });
    expect(screen.getByText('Đã đặt ngân sách Mua sắm')).toBeInTheDocument();

    // One Back returns directly to /reports/category/cat-shop (skipping /budgets)
    await user.click(await screen.findByRole('link', { name: 'Quay lại' }));

    await waitFor(() => {
      expect(screen.getByTestId('loc-full')).toHaveTextContent('/reports/category/cat-shop');
    });
  });
});
