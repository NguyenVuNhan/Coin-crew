import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  BudgetDef,
  CategoryView,
  CountedSpendRow,
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
  startDate: '2025-01-01',
  startCostVnd: null,
  vndValue: 5_000_000,
  icon: 'wallet',
  sortOrder: 0,
  archived: false,
  entryCount: 10,
  excludeFromReports: false,
};

const categories: CategoryView[] = [
  { id: 'cat-food', parentId: null, type: 'expense', name: 'Ăn uống', icon: 'utensils', hidden: false, sortOrder: 0 },
];

const tags: TagView[] = [];

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

function spendRow(id: string, date: string, amount: number): CountedSpendRow {
  return {
    id,
    kind: 'entry',
    date,
    amount,
    currency: 'VND',
    walletId: 'w-cash',
    categoryId: 'cat-food',
    tagIds: [],
  };
}

function stubApis(opts: {
  budgets: BudgetDef[];
  rows?: CountedSpendRow[];
  extraRoutes?: Record<string, unknown>;
}) {
  const { budgets, rows = [], extraRoutes = {} } = opts;
  return mockApi({
    'GET /api/me': meOn,
    'GET /api/me/personal/budgets': { budgets },
    'GET /api/me/personal/budgets/progress': { rows },
    'GET /api/me/personal/wallets': { wallets: [cashWallet] },
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

function HistoryHarness() {
  const loc = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <span data-testid="loc-full">{`${loc.pathname}${loc.search}`}</span>
      <button type="button" data-testid="browser-back" onClick={() => navigate(-1)}>
        Back
      </button>
    </>
  );
}

describe('budgets final review fixes (screens)', () => {
  it('accepting a suggestion sends amount + dismissSuggestion: true + today in one PATCH', async () => {
    const user = userEvent.setup();
    const rows: CountedSpendRow[] = [
      spendRow('s-05', '2026-05-15', 3_500_000),
      spendRow('s-06', '2026-06-15', 3_600_000),
      spendRow('s-07', '2026-07-15', 3_500_000),
      spendRow('s-08', '2026-08-15', 3_700_000),
      spendRow('s-09', '2026-09-15', 3_600_000),
      spendRow('s-10', '2026-10-15', 3_700_000),
    ];

    const api = stubApis({
      budgets: [foodBudget],
      rows,
      extraRoutes: {
        'PATCH /api/me/personal/budgets/b-food': { budget: foodBudget },
      },
    });

    renderAt(<App />, { route: '/budgets/b-food', path: '*' });
    act(() => {
      setLang('vi', false);
    });

    const acceptBtn = await screen.findByTestId('budget-suggest-accept');
    await user.click(acceptBtn);

    await waitFor(() => {
      expect(api.calls.filter((c) => c.method === 'PATCH')).toHaveLength(1);
    });
    expect(api.calls.find((c) => c.method === 'PATCH')?.body).toEqual({
      amount: 3_600_000,
      dismissSuggestion: true,
      today: '2026-11-26',
    });
  });

  it('BudgetTransactions allTxHref includes type=expense alongside from/to and categoryId', async () => {
    stubApis({
      budgets: [foodBudget],
      rows: [spendRow('e-1', '2026-11-10', 100_000)],
    });

    renderAt(<App />, { route: '/budgets/b-food', path: '*' });
    act(() => {
      setLang('vi', false);
    });

    const seeAll = await screen.findByTestId('budget-tx-see-all');
    const url = new URL(seeAll.getAttribute('href') ?? '', 'http://localhost');
    expect(url.pathname).toBe('/transactions');
    expect(url.searchParams.get('from')).toBe('2026-11-01');
    expect(url.searchParams.get('to')).toBe('2026-11-30');
    expect(url.searchParams.get('type')).toBe('expense');
    expect(url.searchParams.get('categoryId')).toBe('cat-food');
  });

  it('BudgetForm rename-only edit omits amount from PATCH body', async () => {
    const user = userEvent.setup();
    const api = stubApis({
      budgets: [foodBudget],
      extraRoutes: {
        'PATCH /api/me/personal/budgets/b-food': {
          budget: { ...foodBudget, name: 'Ăn uống hàng tháng' },
        },
      },
    });

    renderAt(<App />, { route: '/budgets/b-food?edit=1', path: '*' });
    act(() => {
      setLang('vi', false);
    });

    const nameInput = await screen.findByTestId('budget-form-name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Ăn uống hàng tháng');
    await user.click(screen.getByTestId('budget-form-submit'));

    await waitFor(() => {
      expect(api.calls.filter((c) => c.method === 'PATCH')).toHaveLength(1);
    });

    const body = api.calls.find((c) => c.method === 'PATCH')?.body as Record<string, unknown>;
    expect(body).toEqual({
      name: 'Ăn uống hàng tháng',
      excludedWalletIds: [],
      today: '2026-11-26',
    });
    expect('amount' in body).toBe(false);
  });

  it('opening and closing ?edit=1 sheet leaves no duplicate history entry so Back leaves the page', async () => {
    const user = userEvent.setup();
    stubApis({
      budgets: [foodBudget],
      extraRoutes: {
        'PATCH /api/me/personal/budgets/b-food': { budget: foodBudget },
      },
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/budgets', '/budgets/b-food']} initialIndex={1}>
          <Routes>
            <Route path="*" element={<App />} />
          </Routes>
          <HistoryHarness />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    act(() => {
      setLang('vi', false);
    });

    const editBtn = await screen.findByTestId('budget-edit-button');
    await user.click(editBtn);

    await screen.findByTestId('budget-form');
    expect(screen.getByTestId('loc-full')).toHaveTextContent('/budgets/b-food?edit=1');

    // Submit closes the sheet via replace
    await user.click(screen.getByTestId('budget-form-submit'));
    await waitFor(() => {
      expect(screen.queryByTestId('budget-form')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('loc-full')).toHaveTextContent('/budgets/b-food');

    // Single Back leaves /budgets/b-food back to /budgets
    await user.click(screen.getByTestId('browser-back'));
    expect(screen.getByTestId('loc-full')).toHaveTextContent('/budgets');
  });

  it('opening ?new=1 sheet replaces history entry so Back leaves /budgets', async () => {
    const user = userEvent.setup();
    stubApis({ budgets: [foodBudget] });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/trips', '/budgets']} initialIndex={1}>
          <Routes>
            <Route path="*" element={<App />} />
          </Routes>
          <HistoryHarness />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    act(() => {
      setLang('vi', false);
    });

    const addBtn = await screen.findByTestId('budgets-add-button');
    await user.click(addBtn);

    await screen.findByTestId('budget-form');
    expect(screen.getByTestId('loc-full')).toHaveTextContent('/budgets?new=1');

    // Close the sheet (Escape), then single Back leaves /budgets straight to /trips
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByTestId('budget-form')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('loc-full')).toHaveTextContent('/budgets');

    await user.click(screen.getByTestId('browser-back'));
    expect(screen.getByTestId('loc-full')).toHaveTextContent('/trips');
  });
});
