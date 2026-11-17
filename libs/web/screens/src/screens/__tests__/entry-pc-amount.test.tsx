import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { CategoriesResponse, CategoryView, TripView, WalletDetailView } from '@cc/core';
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

const usdWallet: WalletDetailView = {
  id: 'w-usd',
  name: 'Ví USD',
  currency: 'USD',
  balance: 50_000,
  isDefault: false,
  kind: 'everyday',
  startAmount: 50_000,
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: 1_250_000_000,
  icon: null,
  sortOrder: 1,
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

function renderEntryPage(route: string) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <PlatformProvider platform={browserPlatform}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/trips', route]} initialIndex={1}>
          <NavHistoryProvider>
            <UndoSnackbarHost />
            <Routes>
              <Route path="/entries/new" element={<EntryPage />} />
              <Route path="/trips" element={<div data-testid="trips-route">Trips</div>} />
            </Routes>
          </NavHistoryProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </PlatformProvider>,
  );
}

describe('EntryPage PC (mouse-pointer) amount field', () => {
  it('never renders amount-keypad on Chi, transfer, or Vay/Nợ and focuses the field on arrival', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/me/personal/wallets': { wallets: [vndCash, usdWallet] },
      'GET /api/trips/t-led': directTripView(),
      'GET /api/me/people/candidates': [],
    });

    renderEntryPage('/entries/new?type=expense');

    const amountInput = await screen.findByRole('textbox', { name: 'Số tiền' });
    expect(amountInput).toHaveFocus();
    expect(screen.queryByTestId('amount-keypad')).toBeNull();
    expect(screen.queryByTestId('amount-suggestions')).toBeNull();

    // Switch to transfer
    await user.click(screen.getByTestId('category-tile-transfer'));
    expect(screen.getByRole('textbox', { name: 'Số nhận được' })).toBeInTheDocument();
    expect(screen.queryByTestId('amount-keypad')).toBeNull();
    expect(screen.queryByTestId('amount-suggestions')).toBeNull();

    // Switch to Vay/Nợ
    await user.click(screen.getByTestId('entry-tab-loan-debt'));
    expect(await screen.findByTestId('loan-debt-with-row')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Số tiền' })).toBeInTheDocument();
    expect(screen.queryByTestId('amount-keypad')).toBeNull();
    expect(screen.queryByTestId('amount-suggestions')).toBeNull();
  });

  it('typing "85" then Enter with no category focuses the first category tile and posts nothing', async () => {
    const user = userEvent.setup();
    let postCount = 0;
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/me/personal/wallets': { wallets: [vndCash] },
      'POST /api/me/personal/transactions': () => {
        postCount += 1;
        return Response.json({ entries: [{ id: 'e-1' }] }, { status: 201 });
      },
    });

    renderEntryPage('/entries/new?type=expense');
    const amountInput = await screen.findByRole('textbox', { name: 'Số tiền' });

    await user.type(amountInput, '85{Enter}');

    expect(screen.getByTestId('category-tile-transfer')).toHaveFocus();
    expect(postCount).toBe(0);
    expect(screen.queryByTestId('amount-suggestions')).toBeNull();
  });

  it('typing "35000", picking a category, and clicking Lưu posts amount 35000 once', async () => {
    const user = userEvent.setup();
    const posted: unknown[] = [];
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/me/personal/wallets': { wallets: [vndCash] },
      'POST /api/me/personal/transactions': (init?: RequestInit) => {
        posted.push(JSON.parse(String(init?.body ?? '{}')));
        return Response.json({ entries: [{ id: 'e-1' }] }, { status: 201 });
      },
    });

    renderEntryPage('/entries/new?type=expense');
    const amountInput = await screen.findByRole('textbox', { name: 'Số tiền' });

    await user.type(amountInput, '35000');
    await user.click(screen.getByTestId('category-tile-cat-food'));
    await user.click(screen.getByTestId('entry-save-btn'));

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({
      type: 'expense',
      walletId: 'w-vnd',
      amount: 35000,
      categoryId: 'cat-food',
    });
  });

  it('evaluates "50+20" on Enter to 70 and ignores "." in VND', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/me/personal/wallets': { wallets: [vndCash] },
    });

    renderEntryPage('/entries/new?type=expense');
    const amountInput = await screen.findByRole('textbox', { name: 'Số tiền' });

    await user.type(amountInput, '50+20{Enter}');
    expect(amountInput).toHaveValue('70');

    await user.clear(amountInput);
    await user.type(amountInput, '100.000');
    expect(amountInput).toHaveValue('100000');
  });

  it('shows invalid state on unparseable expression, formats on blur without moving focus, and does nothing special on Escape', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/me/personal/wallets': { wallets: [vndCash] },
    });

    renderEntryPage('/entries/new?type=expense');
    const amountInput = await screen.findByRole('textbox', { name: 'Số tiền' });

    await user.type(amountInput, '50+');
    expect(amountInput).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('entry-save-btn')).toBeDisabled();

    // Enter on invalid expression does not clear or move focus
    await user.keyboard('{Enter}');
    expect(amountInput).toHaveFocus();
    expect(amountInput).toHaveValue('50+');

    // Finish expression and press Escape: nothing special happens
    await user.type(amountInput, '20{Escape}');
    expect(amountInput).toHaveFocus();
    expect(amountInput).toHaveValue('50+20');

    // Blur formats to 70 without moving focus back
    await user.click(screen.getByTestId('entry-note-input'));
    expect(amountInput).toHaveValue('70');
    expect(screen.getByTestId('entry-note-input')).toHaveFocus();
  });

  it('on different-currency transfer, Enter on the first amount focuses the second amount field', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/me/personal/wallets': { wallets: [vndCash, usdWallet] },
    });

    renderEntryPage('/entries/new?type=expense');
    const firstAmount = await screen.findByRole('textbox', { name: 'Số tiền' });

    await user.click(screen.getByTestId('category-tile-transfer'));
    await user.click(firstAmount);
    await user.type(firstAmount, '250000{Enter}');

    const secondAmount = screen.getByRole('textbox', { name: 'Số nhận được' });
    expect(secondAmount).toHaveFocus();
  });

  it('Vay/Nợ amount field accepts typing and its save still works', async () => {
    const user = userEvent.setup();
    const posted: unknown[] = [];
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/me/personal/wallets': { wallets: [vndCash] },
      'GET /api/trips/t-led': directTripView(),
      'GET /api/me/people/candidates': [],
      'POST /api/trips/t-led/expenses': (init?: RequestInit) => {
        posted.push(JSON.parse(String(init?.body ?? '{}')));
        return Response.json({ expenseId: 'exp-1' }, { status: 201 });
      },
    });

    const { container } = renderEntryPage('/entries/new?type=loan-debt');
    const amountInput = await screen.findByRole('textbox', { name: 'Số tiền' });
    expect(amountInput).toHaveFocus();

    await user.type(amountInput, '50000');

    // Pick Minh in "Với ai"
    await user.click(screen.getByTestId('loan-debt-with-row'));
    await user.click(await screen.findByRole('button', { name: /Minh/ }));
    await user.click(screen.getByRole('button', { name: 'Xong' }));

    const noteInput = container.querySelector('#expense-what-for') as HTMLInputElement;
    await user.type(noteInput, 'Cà phê');

    await user.click(screen.getByTestId('entry-save-btn'));

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({
      amount: 50000,
    });
  });
});
