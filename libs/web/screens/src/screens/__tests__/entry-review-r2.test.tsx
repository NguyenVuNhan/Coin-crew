import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import type { CategoriesResponse, CategoryView, TripView, WalletDetailView } from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { browserPlatform, PlatformProvider } from '@cc/web-platform';
import { mockApi, renderAt } from '../../test/render';
import { NavHistoryProvider } from '../../lib/navHistory';
import { EntryPage } from '../EntryPage';
import { AppNav } from '../../components/AppNav';
import { UndoSnackbarHost, hideUndo } from '../../components/UndoSnackbarHost';

beforeEach(() => {
  localStorage.clear();
  hideUndo();
  setLang('vi');
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  hideUndo();
});

const vndCash: WalletDetailView = {
  id: 'w-vnd',
  name: 'Tiền mặt',
  currency: 'VND',
  balance: 1_000_000,
  isDefault: true,
  kind: 'everyday',
  startAmount: 1_000_000,
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: 1_000_000,
  icon: null,
  sortOrder: 0,
  archived: false,
  entryCount: 0,
};

const foodCat: CategoryView = {
  id: 'cat-food',
  type: 'expense',
  name: 'Ăn uống',
  icon: 'utensils',
  parentId: null,
  sortOrder: 0,
  hidden: false,
};

const categoriesResp: CategoriesResponse = {
  categories: [foodCat],
  recentIds: ['cat-food'],
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
    people: [
      { id: 'led-o', name: 'An', status: 'active', isMember: true, bank: 'none' },
      { id: 'led-m', name: 'Minh', status: 'active', isMember: false, bank: 'none' },
    ],
    balances: { 'led-o': 0, 'led-m': 0 },
    suggestions: [],
    expenses: [],
    payments: [],
    myBalance: null,
    approvals: [],
    links: null,
  };
}

function LocationDisplay() {
  const loc = useLocation();
  return <div data-testid="current-location">{loc.pathname + loc.search}</div>;
}

function renderEntryPage(initialEntries: string[]) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <PlatformProvider platform={browserPlatform}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={initialEntries}>
          <NavHistoryProvider>
            <UndoSnackbarHost />
            <LocationDisplay />
            <Routes>
              <Route path="/entries/new" element={<EntryPage />} />
              <Route path="/entries/:id/edit" element={<EntryPage />} />
              <Route path="/t/:tripId/expenses/new" element={<div data-testid="quick-expense-route">Quick</div>} />
              <Route path="/trips" element={<div data-testid="trips-route">Trips</div>} />
            </Routes>
          </NavHistoryProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </PlatformProvider>,
  );
}

describe('Review Round 2 — R9 embedded Vay/Nợ quick-expense in EntryPage', () => {
  it('Vay/Nợ tab shows quick-expense form under tabs with no "Thêm khoản chi" heading and no navigation away', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
      'GET /api/me/personal/wallets': { wallets: [vndCash] },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/trips/t-led': directTripView(),
      'GET /api/me/people/candidates': [],
    });

    const { container } = renderEntryPage(['/entries/new?type=expense']);
    await screen.findByTestId('amount-display');

    await user.click(screen.getByTestId('entry-tab-loan-debt'));

    await waitFor(() => {
      expect(container.querySelector('#expense-form')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('quick-expense-route')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Thêm khoản chi' })).toBeNull();
    expect(screen.queryByTestId('amount-display')).toBeNull();
    expect(screen.queryByTestId('entry-save-btn')).toBeNull();
    expect(screen.getByTestId('current-location')).toHaveTextContent('/entries/new?type=loan-debt');
  });

  it('?type=loan-debt opens directly on Vay/Nợ with the embedded quick-expense form', async () => {
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
      'GET /api/me/personal/wallets': { wallets: [vndCash] },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/trips/t-led': directTripView(),
      'GET /api/me/people/candidates': [],
    });

    const { container } = renderEntryPage(['/entries/new?type=loan-debt']);
    await waitFor(() => {
      expect(container.querySelector('#expense-form')).toBeInTheDocument();
    });
    expect(screen.getByTestId('entry-tab-loan-debt')).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('heading', { name: 'Thêm khoản chi' })).toBeNull();
    expect(screen.queryByTestId('amount-display')).toBeNull();
  });

  it('saving a quick expense from Vay/Nợ posts to /api/trips/:tripId/expenses and goes back with snackbar', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
      'GET /api/me/personal/wallets': { wallets: [vndCash] },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/trips/t-led': directTripView(),
      'GET /api/me/people/candidates': [],
      'POST /api/trips/t-led/expenses': () => Response.json({ expenseId: 'exp-1' }, { status: 201 }),
    });

    const { container } = renderEntryPage(['/trips', '/entries/new?type=loan-debt']);
    await waitFor(() => {
      expect(container.querySelector('#expense-form')).toBeInTheDocument();
    });

    const descInput = container.querySelector('#expense-what-for') as HTMLInputElement;
    const amountInput = container.querySelector('#expense-amount') as HTMLInputElement;
    expect(descInput).toBeTruthy();
    expect(amountInput).toBeTruthy();

    await user.type(descInput, 'Trà sữa');
    await user.type(amountInput, '50000');

    const submitBtn = container.querySelector('button[type="submit"][form="expense-form"]') as HTMLButtonElement;
    expect(submitBtn).toBeTruthy();
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByTestId('trips-route')).toBeInTheDocument();
    });

    const postCall = calls.find((c) => c.method === 'POST' && c.path.includes('/api/trips/t-led/expenses'));
    expect(postCall).toBeDefined();
    expect(postCall?.body).toMatchObject({
      description: 'Trà sữa',
      amount: 50000,
    });
    expect(screen.getByText('Đã lưu')).toBeInTheDocument();
  });

  it('switching back from Vay/Nợ to Chi shows the keypad again and updates ?type=expense', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
      'GET /api/me/personal/wallets': { wallets: [vndCash] },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/trips/t-led': directTripView(),
      'GET /api/me/people/candidates': [],
    });

    const { container } = renderEntryPage(['/entries/new?type=loan-debt']);
    await waitFor(() => {
      expect(container.querySelector('#expense-form')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('entry-tab-expense'));

    await waitFor(() => {
      expect(screen.getByTestId('amount-display')).toBeInTheDocument();
    });
    expect(screen.getByTestId('key-done')).toBeInTheDocument();
    expect(container.querySelector('#expense-form')).toBeNull();
    expect(screen.getByTestId('current-location')).toHaveTextContent('/entries/new?type=expense');
  });

  it('AddMenu Vay/Nợ item links to /entries/new?type=loan-debt', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me': {
        user: { id: 'u-1', email: 'a@b.com', name: 'A', consentAt: '2026-01-01T00:00:00Z' },
        personalArea: true,
        signIn: { zalo: true },
        mergeRequests: { incoming: [], outgoing: [] },
      },
      'GET /api/me/personal/wallets': { wallets: [vndCash] },
    });

    renderAt(<AppNav section="home" addHref="/t/t-led/expenses/new" />, { route: '/trips' });
    await waitFor(() =>
      expect(screen.getAllByTestId('nav-add')[0]).toHaveAttribute('aria-haspopup', 'dialog'),
    );
    await user.click(screen.getAllByTestId('nav-add')[0]!);

    const loanDebtItem = await screen.findByTestId('add-menu-loan-debt');
    expect(loanDebtItem).toHaveAttribute('href', '/entries/new?type=loan-debt');
  });
});
