import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import type { CategoriesResponse, CategoryView, EntryView, WalletDetailView } from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { browserPlatform, PlatformProvider } from '@cc/web-platform';
import { writeLastWallet } from '@cc/web-data-access/personalMoney';
import { mockApi, renderAt } from '../../test/render';
import { finishAmount, openDetails } from '../../test/entry';
import { NavHistoryProvider } from '../../lib/navHistory';
import { EntryPage } from '../EntryPage';
import { AppNav } from '../../components/AppNav';
import { FirstWalletSheet } from '../../components/FirstWalletSheet';
import { WalletForm } from '../../components/WalletForm';
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

const vndBank: WalletDetailView = {
  id: 'w-bank',
  name: 'Vietcombank',
  currency: 'VND',
  balance: 5_000_000,
  isDefault: false,
  kind: 'everyday',
  startAmount: 5_000_000,
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: 5_000_000,
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

const salaryCat: CategoryView = {
  id: 'cat-salary',
  type: 'income',
  name: 'Lương',
  icon: 'wallet',
  parentId: null,
  sortOrder: 0,
  hidden: false,
};

const categoriesResp: CategoriesResponse = {
  categories: [foodCat, salaryCat],
  recentIds: ['cat-food', 'cat-salary'],
};

function LocationDisplay() {
  const loc = useLocation();
  return <div data-testid="current-location">{loc.pathname + loc.search}</div>;
}

function renderEntryPage(route: string, state?: unknown) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <PlatformProvider platform={browserPlatform}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[{ pathname: route.split('?')[0], search: route.includes('?') ? `?${route.split('?')[1]}` : '', state }]}>
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

describe('Review Round 1 — EntryPage, AddMenu, WalletForm', () => {
  // R9 replaced "Vay/Nợ navigates away" with the inline form; entry-review-r2.test.tsx covers that now.
  it('R1: renders Chi / Thu / Vay-Nợ tabs', async () => {
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/wallets': { wallets: [vndCash, vndBank] },
      'GET /api/me/personal/categories': categoriesResp,
    });

    renderEntryPage('/entries/new?type=expense');
    await screen.findByTestId('entry-tab-expense');

    expect(screen.getByTestId('entry-tab-expense')).toHaveTextContent('Chi');
    expect(screen.getByTestId('entry-tab-income')).toHaveTextContent('Thu');
    expect(screen.getByTestId('entry-tab-loan-debt')).toHaveTextContent('Vay/Nợ');
    expect(screen.queryByTestId('entry-tab-transfer')).toBeNull();
  });

  it('R1: AddMenu lists Khoản chi, Khoản thu, Vay/Nợ and drops Chuyển tiền / Với người khác', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me': {
        user: { id: 'u-1', email: 'a@b.com', name: 'A', consentAt: '2026-01-01T00:00:00Z' },
        personalArea: true,
        signIn: { zalo: true },
        mergeRequests: { incoming: [], outgoing: [] },
      },
      'GET /api/me/personal/wallets': { wallets: [vndCash, vndBank] },
    });

    renderAt(<AppNav section="home" addHref="/t/t-led/expenses/new" />, { route: '/trips' });
    await waitFor(() =>
      expect(screen.getAllByTestId('nav-add')[0]).toHaveAttribute('aria-haspopup', 'dialog'),
    );
    await user.click(screen.getAllByTestId('nav-add')[0]!);

    expect(await screen.findByTestId('add-menu-expense')).toHaveTextContent('Expense');
    expect(screen.getByTestId('add-menu-income')).toHaveTextContent('Income');
    expect(screen.getByTestId('add-menu-loan-debt')).toHaveTextContent('Loan/Debt');
    expect(screen.queryByTestId('add-menu-transfer')).toBeNull();
    expect(screen.queryByTestId('add-menu-with-people')).toBeNull();
  });

  it('R2: transfer tile in Chi posts transfer body (from=page wallet, to=picked) and in Thu swaps from/to', async () => {
    const user = userEvent.setup();
    const postedBodies: unknown[] = [];

    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/wallets': { wallets: [vndCash, vndBank] },
      'GET /api/me/personal/categories': categoriesResp,
      'POST /api/me/personal/transactions': (init?: RequestInit) => {
        postedBodies.push(JSON.parse(String(init?.body ?? '{}')));
        return Response.json({ entries: [] }, { status: 201 });
      },
    });

    // Chi transfer
    const { unmount } = renderEntryPage('/entries/new?type=expense');
    await finishAmount(user, '5000');
    const transferTile = await screen.findByTestId('category-tile-transfer');
    expect(transferTile).toHaveTextContent('Chuyển sang ví');
    await user.click(transferTile);

    expect(screen.getByTestId('entry-to-wallet-row')).toBeInTheDocument();
    await user.click(screen.getByTestId('entry-save-btn'));

    await waitFor(() => expect(postedBodies).toHaveLength(1));
    expect(postedBodies[0]).toMatchObject({
      type: 'transfer',
      fromWalletId: 'w-vnd',
      toWalletId: 'w-bank',
      amountSent: 5000,
      excludeFromReports: true,
    });
    unmount();

    // Thu transfer: page's wallet (w-vnd) is receiver, picked wallet (w-bank) is sender
    renderEntryPage('/entries/new?type=income');
    await finishAmount(user, '7000');
    const thuTransferTile = await screen.findByTestId('category-tile-transfer');
    expect(thuTransferTile).toHaveTextContent('Nhận từ ví');
    await user.click(thuTransferTile);

    expect(screen.getByTestId('entry-from-wallet-row')).toBeInTheDocument();
    await user.click(screen.getByTestId('entry-save-btn'));

    await waitFor(() => expect(postedBodies).toHaveLength(2));
    expect(postedBodies[1]).toMatchObject({
      type: 'transfer',
      fromWalletId: 'w-bank',
      toWalletId: 'w-vnd',
      amountSent: 7000,
      excludeFromReports: true,
    });
  });

  it('R4, R5, R6: keypad open on new, hidden on edit until tapped, datetime-local fills date+time, PATCH keeps tags', async () => {
    const user = userEvent.setup();
    let patchedBody: unknown = null;

    const existingEntry: EntryView = {
      id: 'e-1',
      type: 'expense',
      walletId: 'w-vnd',
      currency: 'VND',
      amount: 50000,
      categoryId: 'cat-food',
      date: '2026-11-10',
      time: '09:30',
      note: 'Bún bò',
      tags: ['sáng', 'ăn'],
      excludeFromReports: false,
      transferId: null,
      counterpartWalletId: null,
      source: 'manual',
      beforeStart: false,
      createdAt: '2026-11-10T09:30:00Z',
    };

    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/wallets': { wallets: [vndCash, vndBank] },
      'GET /api/me/personal/categories': categoriesResp,
      'PATCH /api/me/personal/transactions/e-1': (init?: RequestInit) => {
        patchedBody = JSON.parse(String(init?.body ?? '{}'));
        return Response.json(existingEntry);
      },
    });

    // New entry: keypad is open on load, closes when amount is finished
    const { unmount } = renderEntryPage('/entries/new?type=expense');
    await screen.findByTestId('amount-display');
    expect(screen.getByTestId('amount-keypad')).toBeInTheDocument();
    expect(screen.getByTestId('amount-display')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByTestId('entry-time-input')).toBeNull();
    expect(screen.queryByTestId('tag-input')).toBeNull();

    await finishAmount(user, '50000');
    await user.click(screen.getByTestId('category-tile-cat-food'));
    await openDetails(user);
    expect(screen.queryByTestId('amount-keypad')).toBeNull();
    expect(screen.getByTestId('entry-fold-amount')).toHaveAttribute('aria-expanded', 'false');
    unmount();

    // Edit entry: keypad is hidden until amount is tapped
    renderEntryPage('/entries/e-1/edit', { entry: existingEntry });
    const amountBtn = await screen.findByTestId('entry-fold-amount');
    expect(screen.queryByTestId('amount-keypad')).toBeNull();
    expect(amountBtn).toHaveAttribute('aria-expanded', 'false');

    const dateInput = screen.getByTestId('entry-date-picker') as HTMLInputElement;
    const timeInput = screen.getByTestId('entry-time-picker') as HTMLInputElement;
    expect(dateInput.value).toBe('2026-11-10');
    expect(timeInput.value).toBe('09:30');
    fireEvent.change(dateInput, { target: { value: '2026-11-12' } });
    fireEvent.change(timeInput, { target: { value: '14:45' } });

    await user.click(amountBtn);
    expect(screen.getByTestId('amount-keypad')).toBeInTheDocument();
    expect(screen.getByTestId('amount-display')).toHaveAttribute('aria-expanded', 'true');

    await user.click(screen.getByTestId('key-done'));
    await user.click(screen.getByTestId('entry-save-btn'));
    await waitFor(() => expect(patchedBody).not.toBeNull());
    expect(patchedBody).toMatchObject({
      date: '2026-11-12',
      time: '14:45',
      tags: ['sáng', 'ăn'],
    });
  });

  it('R7: WalletForm removes Số âm button and parses "-500000" into negative startAmount', async () => {
    const user = userEvent.setup();
    let createdWallet: unknown = null;

    mockApi({
      'POST /api/me/personal/wallets/add': (init?: RequestInit) => {
        createdWallet = JSON.parse(String(init?.body ?? '{}'));
        return Response.json({ id: 'w-new' }, { status: 201 });
      },
    });

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <PlatformProvider platform={browserPlatform}>
        <QueryClientProvider client={qc}>
          <WalletForm open onClose={vi.fn()} />
        </QueryClientProvider>
      </PlatformProvider>,
    );

    expect(screen.queryByTestId('wallet-form-negative')).toBeNull();
    await user.type(screen.getByTestId('wallet-form-name'), 'Thẻ tín dụng');
    await user.type(screen.getByTestId('wallet-form-amount'), '-500000');
    await user.click(screen.getByTestId('wallet-form-submit'));

    await waitFor(() => expect(createdWallet).not.toBeNull());
    expect(createdWallet).toMatchObject({
      name: 'Thẻ tín dụng',
      startAmount: -500000,
    });
  });

  it('Correction 1: amount -> category tile -> Lưu (BottomBar) posts once and navigates back', async () => {
    const user = userEvent.setup();
    let postedBody: unknown = null;
    let postCount = 0;

    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/wallets': { wallets: [vndCash, vndBank] },
      'GET /api/me/personal/categories': categoriesResp,
      'POST /api/me/personal/transactions': (init?: RequestInit) => {
        postCount += 1;
        postedBody = JSON.parse(String(init?.body ?? '{}'));
        return Response.json({ entries: [] }, { status: 201 });
      },
    });

    renderEntryPage('/entries/new?type=expense');
    await finishAmount(user, '50000');

    // Tapping a category tile closes the keypad and reveals the docked BottomBar Lưu button
    await user.click(screen.getByTestId('category-tile-cat-food'));
    expect(screen.queryByTestId('amount-keypad')).toBeNull();

    const saveBtn = screen.getByTestId('entry-save-btn');
    expect(saveBtn).toHaveTextContent('Lưu');
    expect(saveBtn).toBeEnabled();
    await user.click(saveBtn);

    await waitFor(() => expect(postCount).toBe(1));
    expect(postedBody).toMatchObject({
      type: 'expense',
      walletId: 'w-vnd',
      amount: 50000,
      categoryId: 'cat-food',
    });
    await waitFor(() => expect(screen.getByTestId('trips-route')).toBeInTheDocument());
  });

  it('Correction 1: edit mode -> change note -> Lưu (BottomBar) PATCHes without opening keypad', async () => {
    const user = userEvent.setup();
    let patchedBody: unknown = null;

    const existingEntry: EntryView = {
      id: 'e-edit-note',
      type: 'expense',
      walletId: 'w-vnd',
      currency: 'VND',
      amount: 75000,
      categoryId: 'cat-food',
      date: '2026-11-10',
      time: '09:30',
      note: 'Phở',
      tags: ['sáng'],
      excludeFromReports: false,
      transferId: null,
      counterpartWalletId: null,
      source: 'manual',
      beforeStart: false,
      createdAt: '2026-11-10T09:30:00Z',
    };

    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/wallets': { wallets: [vndCash] },
      'GET /api/me/personal/categories': categoriesResp,
      'PATCH /api/me/personal/transactions/e-edit-note': (init?: RequestInit) => {
        patchedBody = JSON.parse(String(init?.body ?? '{}'));
        return Response.json(existingEntry);
      },
    });

    renderEntryPage('/entries/e-edit-note/edit', { entry: existingEntry });
    const noteInput = await screen.findByTestId('entry-note-input');
    expect(screen.queryByTestId('amount-keypad')).toBeNull();

    await user.clear(noteInput);
    await user.type(noteInput, 'Phở bò');
    await user.click(screen.getByTestId('entry-save-btn'));

    await waitFor(() => expect(patchedBody).not.toBeNull());
    expect(patchedBody).toMatchObject({
      amount: 75000,
      note: 'Phở bò',
      tags: ['sáng'],
    });
  });

  it('Correction 2: prefills last-used wallet, accepts USD "12,5" -> 1250, and preserves input on 422', async () => {
    const user = userEvent.setup();
    const usdWallet: WalletDetailView = {
      ...vndCash,
      id: 'w-usd',
      name: 'USD Card',
      currency: 'USD',
      isDefault: false,
    };
    writeLastWallet('w-usd');

    let return422 = true;
    let postedBody: unknown = null;
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/wallets': { wallets: [vndCash, usdWallet] },
      'GET /api/me/personal/categories': categoriesResp,
      'POST /api/me/personal/transactions': (init?: RequestInit) => {
        if (return422) {
          return Response.json(
            { error: { code: 'VALIDATION', message: 'Bad amount', details: { reason: 'amountInvalid' } } },
            { status: 422 },
          );
        }
        postedBody = JSON.parse(String(init?.body ?? '{}'));
        return Response.json({ entries: [] }, { status: 201 });
      },
    });

    renderEntryPage('/entries/new?type=expense');
    await finishAmount(user, '12,5');
    await user.click(screen.getByTestId('category-tile-cat-food'));
    await openDetails(user);
    expect(screen.getByTestId('entry-wallet-row')).toHaveTextContent('USD Card (USD)');
    await user.type(screen.getByTestId('entry-note-input'), 'Lunch');

    await user.click(screen.getByTestId('entry-save-btn'));
    // Step A: first non-VND save asks once.
    await user.click(await screen.findByTestId('foreign-save'));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByTestId('entry-note-input')).toHaveValue('Lunch');
    expect(screen.getByTestId('entry-fold-amount')).toHaveTextContent('12,50 $');

    return422 = false;
    await user.click(screen.getByTestId('entry-save-btn'));
    await waitFor(() => expect(postedBody).not.toBeNull());
    expect(postedBody).toMatchObject({ walletId: 'w-usd', amount: 1250 });
  });

  it('Correction 2: archived-wallet entry shows notice, disables Lưu, and never PATCHes', async () => {
    const archivedWallet: WalletDetailView = { ...vndCash, id: 'w-arch', name: 'Ví cũ', archived: true };
    const archivedEntry: EntryView = {
      id: 'e-arch',
      type: 'expense',
      walletId: 'w-arch',
      currency: 'VND',
      amount: 50000,
      categoryId: 'cat-food',
      date: '2026-11-16',
      time: null,
      note: 'Old',
      tags: [],
      excludeFromReports: false,
      transferId: null,
      counterpartWalletId: null,
      source: 'manual',
      beforeStart: false,
      createdAt: '2026-11-16T10:00:00Z',
    };
    let patchCount = 0;

    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/wallets': { wallets: [vndCash, archivedWallet] },
      'GET /api/me/personal/categories': categoriesResp,
      'PATCH /api/me/personal/transactions/e-arch': () => {
        patchCount += 1;
        return Response.json(archivedEntry);
      },
    });

    renderEntryPage('/entries/e-arch/edit', { entry: archivedEntry });
    expect(await screen.findByTestId('archived-wallet-notice')).toBeInTheDocument();
    expect(screen.getByTestId('entry-wallet-row')).toHaveTextContent('Ví cũ');
    expect(screen.getByTestId('entry-save-btn')).toBeDisabled();
    expect(patchCount).toBe(0);
  });

  it('Correction 2: FirstWalletSheet sends non-VND, investment, and negative start via "-" to /wallets/add', async () => {
    const user = userEvent.setup();
    let createdBody: unknown = null;

    mockApi({
      'POST /api/me/personal/wallets/add': (init?: RequestInit) => {
        createdBody = JSON.parse(String(init?.body ?? '{}'));
        return Response.json({ wallet: { id: 'w-usd' } }, { status: 201 });
      },
    });

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <PlatformProvider platform={browserPlatform}>
        <QueryClientProvider client={qc}>
          <FirstWalletSheet open onClose={vi.fn()} />
        </QueryClientProvider>
      </PlatformProvider>,
    );

    expect(screen.queryByTestId('first-wallet-negative')).toBeNull();
    await user.click(screen.getByTestId('first-wallet-kind-investment'));
    await user.click(screen.getByTestId('first-wallet-currency-USD'));
    await user.type(screen.getByTestId('first-wallet-amount'), '-100');
    await user.type(screen.getByTestId('first-wallet-cost-vnd'), '2500000');
    await user.click(screen.getByTestId('first-wallet-create'));

    await waitFor(() => expect(createdBody).not.toBeNull());
    expect(createdBody).toMatchObject({
      startAmount: -10000,
      currency: 'USD',
      kind: 'investment',
      startCostVnd: 2500000,
    });
  });
});
