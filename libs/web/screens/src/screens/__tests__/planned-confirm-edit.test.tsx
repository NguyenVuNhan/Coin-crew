import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import type {
  AssetView,
  CategoriesResponse,
  CategoryView,
  ConfirmPlannedInput,
  PlannedItemView,
  TripView,
  WalletDetailView,
} from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { browserPlatform, PlatformProvider } from '@cc/web-platform';
import { mockApi } from '../../test/render';
import { NavHistoryProvider } from '../../lib/navHistory';
import { EntryPage } from '../EntryPage';
import { UndoSnackbarHost, hideUndo } from '../../components/UndoSnackbarHost';

function mockMousePointerMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === '(hover: hover) and (pointer: fine)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

beforeEach(() => {
  localStorage.clear();
  hideUndo();
  setLang('vi');
  mockMousePointerMatchMedia();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  hideUndo();
});

const everydayWallet: WalletDetailView = {
  id: 'w-vnd',
  name: 'Ví ngân hàng',
  currency: 'VND',
  balance: 10_000_000,
  isDefault: true,
  kind: 'everyday',
  startAmount: 10_000_000,
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: 10_000_000,
  icon: null,
  sortOrder: 0,
  archived: false,
  entryCount: 0,
};

const investmentWallet: WalletDetailView = {
  id: 'w-inv',
  name: 'TCBS',
  currency: 'VND',
  balance: 50_000_000,
  isDefault: false,
  kind: 'investment',
  startAmount: 50_000_000,
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: 50_000_000,
  icon: null,
  sortOrder: 1,
  archived: false,
  entryCount: 0,
};

const rentCat: CategoryView = {
  id: 'cat-rent',
  type: 'expense',
  name: 'Tiền nhà',
  icon: 'house',
  parentId: null,
  sortOrder: 0,
  hidden: false,
};

const categoriesResp: CategoriesResponse = {
  categories: [rentCat],
  recentIds: ['cat-rent'],
};

const etfAsset: AssetView = {
  id: 'asset-etf',
  name: 'E1VFVN30',
  unit: 'CCQ',
  groupName: 'ETF',
  decimals: 0,
  hidden: false,
  sortOrder: 0,
  entryCount: 0,
};

function directTripView(): TripView {
  return {
    trip: {
      id: 't-led',
      name: 'Quick expenses',
      currency: 'VND',
      fewestTransfers: true,
      archived: false,
      version: 1,
      total: 0,
      preset: 'direct',
    },
    me: {
      kind: 'member',
      participantId: 'led-o',
      participantPending: false,
      isOrganiser: true,
    },
    people: [{ id: 'led-o', name: 'An', status: 'active', isMember: true, bank: 'none' }],
    balances: { 'led-o': 0 },
    suggestions: [],
    expenses: [],
    payments: [],
    myBalance: null,
    approvals: [],
    links: null,
  };
}

function renderConfirmRoute(route: string) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <PlatformProvider platform={browserPlatform}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/recurring', route]} initialIndex={1}>
          <NavHistoryProvider>
            <UndoSnackbarHost />
            <Routes>
              <Route path="/entries/new" element={<EntryPage />} />
              <Route
                path="/recurring"
                element={<div data-testid="recurring-route">Recurring</div>}
              />
            </Routes>
          </NavHistoryProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </PlatformProvider>,
  );
}

const etfPlannedItem: PlannedItemView = {
  id: 'pl-etf',
  kind: 'recurring_occurrence',
  ruleId: 'rule-etf',
  dueOn: '2026-12-05',
  draft: {
    type: 'buy',
    walletId: 'w-inv',
    assetId: 'asset-etf',
    amount: 5_000_000,
    tags: [],
    note: null,
  },
  status: 'waiting',
  meta: null,
  createdOn: '2026-12-05',
};

const rentPlannedItem: PlannedItemView = {
  id: 'pl-rent',
  kind: 'recurring_occurrence',
  ruleId: 'rule-rent',
  dueOn: '2026-12-01',
  draft: {
    type: 'expense',
    walletId: 'w-vnd',
    categoryId: 'cat-rent',
    amount: 6_000_000,
    tags: [],
    note: 'Tiền nhà tháng 12',
    excludeFromReports: false,
  },
  status: 'waiting',
  meta: null,
  createdOn: '2026-12-01',
};

function baseMocks(extra: Record<string, unknown> = {}) {
  return {
    'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
    'GET /api/me/personal/wallets': { wallets: [everydayWallet, investmentWallet] },
    'GET /api/me/personal/categories': categoriesResp,
    'GET /api/me/personal/assets': { assets: [etfAsset] },
    'GET /api/me/personal/budgets': { budgets: [] },
    'GET /api/me/personal/budgets/progress': { rows: [] },
    'GET /api/trips/t-led': directTripView(),
    'GET /api/me/people/candidates': [],
    ...extra,
  };
}

describe('EntryPage — planned item confirm mode', () => {
  it('opens ETF buy item with 5.000.000₫ and empty units, blocks save without units, and posts confirm with quantity and dueOn', async () => {
    const user = userEvent.setup();
    const confirmedPayloads: ConfirmPlannedInput[] = [];
    let postedTx = false;

    mockApi(
      baseMocks({
        'GET /api/me/personal/planned': { items: [etfPlannedItem] },
        'POST /api/me/personal/planned/pl-etf/confirm': (init: RequestInit | undefined) => {
          const body = JSON.parse(String(init?.body ?? '{}')) as ConfirmPlannedInput;
          confirmedPayloads.push(body);
          return Response.json({ ok: true, transactionId: 'tx-etf-1' });
        },
        'POST /api/me/personal/transactions': () => {
          postedTx = true;
          return Response.json({ entries: [] }, { status: 201 });
        },
      }),
    );

    renderConfirmRoute('/entries/new?planned=pl-etf');

    expect(await screen.findByTestId('planned-confirm-title')).toHaveTextContent(
      'Xác nhận khoản định kỳ',
    );
    expect(screen.queryByTestId('repeat-field-row')).not.toBeInTheDocument();

    const amountInput = await screen.findByTestId('amount-input');
    expect(amountInput).toHaveValue('5000000');

    const qtyInput = await screen.findByTestId('entry-quantity');
    expect(qtyInput).toHaveValue('');

    // Saving without units is blocked
    const saveBtn = screen.getByTestId('entry-save-btn');
    expect(saveBtn).toBeDisabled();

    // Enter units and save
    await user.type(qtyInput, '200');
    await waitFor(() => {
      expect(screen.getByTestId('entry-save-btn')).toBeEnabled();
    });
    await user.click(screen.getByTestId('entry-save-btn'));

    await waitFor(() => {
      expect(confirmedPayloads).toHaveLength(1);
    });
    expect(postedTx).toBe(false);
    expect(confirmedPayloads[0]?.entry).toMatchObject({
      type: 'buy',
      walletId: 'w-inv',
      assetId: 'asset-etf',
      amount: 5_000_000,
      quantity: 200,
      date: '2026-12-05',
    });

    expect(await screen.findByTestId('recurring-route')).toBeInTheDocument();
    expect(screen.getByText('Đã ghi Mua E1VFVN30')).toBeInTheDocument();
  });

  it('allows changing amount on an expense item and posts confirm with the new amount', async () => {
    const user = userEvent.setup();
    const confirmedPayloads: ConfirmPlannedInput[] = [];
    let postedTx = false;

    mockApi(
      baseMocks({
        'GET /api/me/personal/planned': { items: [rentPlannedItem] },
        'POST /api/me/personal/planned/pl-rent/confirm': (init: RequestInit | undefined) => {
          const body = JSON.parse(String(init?.body ?? '{}')) as ConfirmPlannedInput;
          confirmedPayloads.push(body);
          return Response.json({ ok: true, transactionId: 'tx-rent-1' });
        },
        'POST /api/me/personal/transactions': () => {
          postedTx = true;
          return Response.json({ entries: [] }, { status: 201 });
        },
      }),
    );

    renderConfirmRoute('/entries/new?planned=pl-rent');

    const amountInput = await screen.findByTestId('amount-input');
    await waitFor(() => {
      expect(amountInput).toHaveValue('6000000');
    });

    await user.clear(amountInput);
    await user.type(amountInput, '6500000');
    await user.click(screen.getByTestId('entry-save-btn'));

    await waitFor(() => {
      expect(confirmedPayloads).toHaveLength(1);
    });
    expect(postedTx).toBe(false);
    expect(confirmedPayloads[0]?.entry).toMatchObject({
      type: 'expense',
      walletId: 'w-vnd',
      categoryId: 'cat-rent',
      amount: 6_500_000,
      date: '2026-12-01',
    });

    expect(await screen.findByTestId('recurring-route')).toBeInTheDocument();
    expect(screen.getByText('Đã ghi Tiền nhà tháng 12')).toBeInTheDocument();
  });

  it('shows InlineError with link back to /recurring when confirm returns 409 ALREADY_RESOLVED', async () => {
    const user = userEvent.setup();

    mockApi(
      baseMocks({
        'GET /api/me/personal/planned': { items: [rentPlannedItem] },
        'POST /api/me/personal/planned/pl-rent/confirm': () =>
          Response.json(
            { error: { code: 'ALREADY_RESOLVED', message: 'Planned item already resolved' } },
            { status: 409 },
          ),
      }),
    );

    renderConfirmRoute('/entries/new?planned=pl-rent');

    const amountInput = await screen.findByTestId('amount-input');
    await waitFor(() => {
      expect(amountInput).toHaveValue('6000000');
    });

    await user.click(screen.getByTestId('entry-save-btn'));

    const resolvedBox = await screen.findByTestId('planned-already-resolved');
    expect(resolvedBox).toHaveTextContent('Khoản này đã được xử lý.');
    const backLink = screen.getByTestId('planned-already-resolved-back');
    expect(backLink).toHaveAttribute('href', '/recurring');
  });

  it('shows EmptyState linking to /recurring for an unknown planned item id', async () => {
    mockApi(
      baseMocks({
        'GET /api/me/personal/planned': { items: [] },
      }),
    );

    renderConfirmRoute('/entries/new?planned=missing-id');

    expect(await screen.findByTestId('planned-confirm-not-found')).toBeInTheDocument();
    expect(screen.getByTestId('planned-confirm-back-recurring')).toHaveAttribute(
      'href',
      '/recurring',
    );
  });
});
