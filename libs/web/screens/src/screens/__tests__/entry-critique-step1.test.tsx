import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { CategoriesResponse, CategoryView, EntryView, WalletDetailView } from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { browserPlatform, PlatformProvider } from '@cc/web-platform';
import { writeLastWallet } from '@cc/web-data-access/personalMoney';
import { mockApi } from '../../test/render';
import { NavHistoryProvider } from '../../lib/navHistory';
import { EntryPage } from '../EntryPage';
import { UndoSnackbarHost, hideUndo } from '../../components/UndoSnackbarHost';

beforeEach(() => {
  localStorage.clear();
  hideUndo();
  setLang('vi');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
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

const binanceWallet: WalletDetailView = {
  id: 'w-binance',
  name: 'Binance',
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

const usdWallet: WalletDetailView = {
  id: 'w-usd',
  name: 'USD Card',
  currency: 'USD',
  balance: 10_000,
  isDefault: false,
  kind: 'everyday',
  startAmount: 10_000,
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: 250_000_000,
  icon: null,
  sortOrder: 2,
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

function makeEntry(overrides: Partial<EntryView> = {}): EntryView {
  return {
    id: 'e-created-1',
    type: 'expense',
    walletId: 'w-vnd',
    currency: 'VND',
    amount: 85_000,
    categoryId: 'cat-food',
    date: '2026-11-17',
    time: '09:00',
    note: null,
    tags: [],
    excludeFromReports: false,
    transferId: null,
    counterpartWalletId: null,
    source: 'manual',
    beforeStart: false,
    createdAt: '2026-11-17T02:00:00Z',
    ...overrides,
  };
}

function renderEntryPage(route = '/entries/new?type=expense', state?: unknown) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  });
  const [pathname, search = ''] = route.split('?');
  return render(
    <PlatformProvider platform={browserPlatform}>
      <QueryClientProvider client={qc}>
        <MemoryRouter
          initialEntries={[
            '/trips',
            { pathname, search: search ? `?${search}` : '', state },
          ]}
          initialIndex={1}
        >
          <NavHistoryProvider>
            <UndoSnackbarHost />
            <Routes>
              <Route path="/entries/new" element={<EntryPage />} />
              <Route path="/entries/:id/edit" element={<EntryPage />} />
              <Route path="/trips" element={<div data-testid="trips-route">Trips</div>} />
            </Routes>
          </NavHistoryProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </PlatformProvider>,
  );
}

describe('EntryPage critique step 1 (save safety)', () => {
  it('1a. shows small-amount chips when keypad is closed for VND 1..999 and tapping one sets the amount', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/wallets': { wallets: [vndCash, binanceWallet] },
      'GET /api/me/personal/categories': categoriesResp,
    });

    renderEntryPage('/entries/new?type=expense');
    await screen.findByTestId('amount-keypad');

    await user.click(screen.getByTestId('key-8'));
    await user.click(screen.getByTestId('key-5'));
    // Picking category closes keypad
    await user.click(screen.getByTestId('category-tile-cat-food'));
    expect(screen.queryByTestId('amount-keypad')).toBeNull();

    const chips = screen.getAllByTestId('amount-suggestion');
    expect(chips.map((c) => c.textContent)).toEqual(['85.000₫', '850.000₫', '8.500.000₫']);

    await user.click(chips[0]!);
    expect(screen.getByTestId('amount-display')).toHaveTextContent('85.000₫');
    expect(screen.queryByTestId('amount-suggestion')).toBeNull();
  });

  it('1b. saving VND 85 opens Modal offering Lưu 85.000₫ (saves 85000) and Giữ 85₫ (saves 85)', async () => {
    const user = userEvent.setup();
    const postedBodies: unknown[] = [];
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/wallets': { wallets: [vndCash, binanceWallet] },
      'GET /api/me/personal/categories': categoriesResp,
      'POST /api/me/personal/transactions': (init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}'));
        postedBodies.push(body);
        return Response.json({ entries: [makeEntry({ amount: body.amount })] }, { status: 201 });
      },
    });

    const { unmount } = renderEntryPage('/entries/new?type=expense');
    await screen.findByTestId('amount-keypad');

    await user.click(screen.getByTestId('key-8'));
    await user.click(screen.getByTestId('key-5'));
    await user.click(screen.getByTestId('category-tile-cat-food'));
    await user.click(screen.getByTestId('entry-save-btn'));

    expect(postedBodies).toHaveLength(0);
    expect(await screen.findByText('Số tiền này đúng chưa?')).toBeInTheDocument();
    expect(screen.getByText('Bạn đang lưu 85₫.')).toBeInTheDocument();
    expect(screen.getByTestId('small-amount-multiply')).toHaveTextContent('Lưu 85.000₫');
    expect(screen.getByTestId('small-amount-keep')).toHaveTextContent('Giữ 85₫');

    await user.click(screen.getByTestId('small-amount-multiply'));
    await waitFor(() => expect(postedBodies).toHaveLength(1));
    expect(postedBodies[0]).toMatchObject({ amount: 85_000 });
    unmount();

    // Also verify Giữ 85₫ saves 85
    renderEntryPage('/entries/new?type=expense');
    await screen.findByTestId('amount-keypad');
    await user.click(screen.getByTestId('key-8'));
    await user.click(screen.getByTestId('key-5'));
    await user.click(screen.getByTestId('category-tile-cat-food'));
    await user.click(screen.getByTestId('entry-save-btn'));
    await screen.findByTestId('small-amount-keep');
    await user.click(screen.getByTestId('small-amount-keep'));
    await waitFor(() => expect(postedBodies).toHaveLength(2));
    expect(postedBodies[1]).toMatchObject({ amount: 85 });
  });

  it('1c. USD 0,85 never asks and saves 85 directly', async () => {
    const user = userEvent.setup();
    const postedBodies: unknown[] = [];
    writeLastWallet('w-usd');
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/wallets': { wallets: [vndCash, usdWallet] },
      'GET /api/me/personal/categories': categoriesResp,
      'POST /api/me/personal/transactions': (init?: RequestInit) => {
        postedBodies.push(JSON.parse(String(init?.body ?? '{}')));
        return Response.json({ entries: [makeEntry({ currency: 'USD', amount: 85 })] }, { status: 201 });
      },
    });

    renderEntryPage('/entries/new?type=expense');
    await screen.findByTestId('amount-keypad');

    await user.click(screen.getByTestId('key-0'));
    await user.click(screen.getByTestId('key-comma'));
    await user.click(screen.getByTestId('key-8'));
    await user.click(screen.getByTestId('key-5'));
    await user.click(screen.getByTestId('category-tile-cat-food'));
    await user.click(screen.getByTestId('entry-save-btn'));

    expect(screen.queryByText('Số tiền này đúng chưa?')).toBeNull();
    await waitFor(() => expect(postedBodies).toHaveLength(1));
    expect(postedBodies[0]).toMatchObject({ walletId: 'w-usd', amount: 85 });
  });

  it('2. echoing snackbar for expense, income, transfer with Hoàn tác calling DELETE, and edit keeps Đã lưu without Hoàn tác', async () => {
    const user = userEvent.setup();
    const deletedIds: string[] = [];

    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/wallets': { wallets: [vndCash, binanceWallet] },
      'GET /api/me/personal/categories': categoriesResp,
      'POST /api/me/personal/transactions': (init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}'));
        const id =
          body.type === 'transfer'
            ? 'e-tr-1'
            : body.type === 'income'
              ? 'e-inc-1'
              : 'e-exp-1';
        return Response.json({ entries: [makeEntry({ id })] }, { status: 201 });
      },
      'PATCH /api/me/personal/transactions/e-edit-1': () =>
        Response.json({ entries: [makeEntry({ id: 'e-edit-1' })] }),
      'DELETE /api/me/personal/transactions/e-exp-1': () => {
        deletedIds.push('e-exp-1');
        return Response.json({ entries: [] });
      },
      'DELETE /api/me/personal/transactions/e-inc-1': () => {
        deletedIds.push('e-inc-1');
        return Response.json({ entries: [] });
      },
      'DELETE /api/me/personal/transactions/e-tr-1': () => {
        deletedIds.push('e-tr-1');
        return Response.json({ entries: [] });
      },
    });

    // Expense
    const r1 = renderEntryPage('/entries/new?type=expense');
    await screen.findByTestId('amount-keypad');
    await user.click(screen.getByTestId('key-8'));
    await user.click(screen.getByTestId('key-5'));
    await user.click(screen.getByTestId('key-000'));
    await user.click(screen.getByTestId('category-tile-cat-food'));
    await user.click(screen.getByTestId('entry-save-btn'));

    const snack1 = await screen.findByRole('status');
    expect(snack1).toHaveTextContent('Đã chi 85.000₫ · Ăn uống');
    const undoBtn1 = within(snack1).getByRole('button', { name: 'Hoàn tác' });
    await user.click(undoBtn1);
    await waitFor(() => expect(deletedIds).toEqual(['e-exp-1']));
    r1.unmount();

    // Income
    const r2 = renderEntryPage('/entries/new?type=income');
    await screen.findByTestId('amount-keypad');
    await user.click(screen.getByTestId('key-2'));
    await user.click(screen.getByTestId('key-000'));
    await user.click(screen.getByTestId('key-000'));
    await user.click(screen.getByTestId('category-tile-cat-salary'));
    await user.click(screen.getByTestId('entry-save-btn'));

    const snack2 = await screen.findByRole('status');
    expect(snack2).toHaveTextContent('Đã thu 2.000.000₫ · Lương');
    expect(within(snack2).getByRole('button', { name: 'Hoàn tác' })).toBeInTheDocument();
    r2.unmount();
    hideUndo();

    // Transfer
    const r3 = renderEntryPage('/entries/new?type=expense');
    await screen.findByTestId('amount-keypad');
    await user.click(screen.getByTestId('key-2'));
    await user.click(screen.getByTestId('key-5'));
    await user.click(screen.getByTestId('key-0'));
    await user.click(screen.getByTestId('key-000'));
    await user.click(screen.getByTestId('category-tile-transfer'));
    await user.click(screen.getByTestId('entry-save-btn'));

    const snack3 = await screen.findByRole('status');
    expect(snack3).toHaveTextContent('Đã chuyển 250.000₫ → Binance');
    await user.click(within(snack3).getByRole('button', { name: 'Hoàn tác' }));
    await waitFor(() => expect(deletedIds).toEqual(['e-exp-1', 'e-tr-1']));
    r3.unmount();
    hideUndo();

    // Edit
    renderEntryPage('/entries/e-edit-1/edit', { entry: makeEntry({ id: 'e-edit-1' }) });
    await screen.findByTestId('entry-save-btn');
    await user.click(screen.getByTestId('entry-save-btn'));
    const snackEdit = await screen.findByRole('status');
    expect(snackEdit).toHaveTextContent('Đã lưu');
    expect(within(snackEdit).queryByRole('button', { name: 'Hoàn tác' })).toBeNull();
  });

  it('3. leave guard: back with amount asks, empty leaves, edit leaves, Vay/Nợ tab switch does not trigger', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/wallets': { wallets: [vndCash, binanceWallet] },
      'GET /api/me/personal/categories': categoriesResp,
    });

    // Empty amount -> leaves at once
    const r1 = renderEntryPage('/entries/new?type=expense');
    await screen.findByTestId('entry-back');
    await user.click(screen.getByTestId('entry-back'));
    expect(await screen.findByTestId('trips-route')).toBeInTheDocument();
    expect(screen.queryByText('Bỏ khoản đang nhập?')).toBeNull();
    r1.unmount();

    // Non-empty amount -> asks; Vay/Nợ tab switch does not trigger modal
    const r2 = renderEntryPage('/entries/new?type=expense');
    await screen.findByTestId('amount-keypad');
    await user.click(screen.getByTestId('key-5'));
    await user.click(screen.getByTestId('entry-tab-loan-debt'));
    expect(screen.queryByText('Bỏ khoản đang nhập?')).toBeNull();

    // Switch back to Chi tab (amount still 5) and press back -> opens guard modal
    await user.click(screen.getByTestId('entry-tab-expense'));
    await user.click(screen.getByTestId('entry-back'));
    expect(await screen.findByText('Bỏ khoản đang nhập?')).toBeInTheDocument();

    const discardBtn = screen.getByTestId('leave-guard-discard');
    expect(discardBtn).toHaveClass('text-danger', 'border-danger/40');
    const keepBtn = screen.getByTestId('leave-guard-keep');
    expect(keepBtn).toHaveTextContent('Tiếp tục nhập');

    // Keep editing -> stays on entry page
    await user.click(keepBtn);
    await waitFor(() => expect(screen.queryByText('Bỏ khoản đang nhập?')).toBeNull());
    expect(screen.getByTestId('amount-display')).toBeInTheDocument();

    // Discard -> leaves
    await user.click(screen.getByTestId('entry-back'));
    await screen.findByTestId('leave-guard-discard');
    await user.click(screen.getByTestId('leave-guard-discard'));
    expect(await screen.findByTestId('trips-route')).toBeInTheDocument();
    r2.unmount();

    // Edit mode -> leaves at once
    renderEntryPage('/entries/e-1/edit', { entry: makeEntry({ id: 'e-1' }) });
    await screen.findByTestId('entry-back');
    await user.click(screen.getByTestId('entry-back'));
    expect(await screen.findByTestId('trips-route')).toBeInTheDocument();
  });

  it('4. category error renders under grid (no top banner), rings grid for 1.5s, scrolls into view, and clears on tile pick', async () => {
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;

    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/wallets': { wallets: [vndCash, binanceWallet] },
      'GET /api/me/personal/categories': categoriesResp,
    });

    renderEntryPage('/entries/new?type=expense');
    await screen.findByTestId('amount-keypad');

    vi.useFakeTimers();
    fireEvent.click(screen.getByTestId('key-5'));
    fireEvent.click(screen.getByTestId('key-0'));
    fireEvent.click(screen.getByTestId('key-000'));
    fireEvent.click(screen.getByTestId('key-done'));

    const picker = screen.getByTestId('category-picker');
    const catError = within(picker).getByTestId('category-error');
    expect(catError).toHaveTextContent('Hãy chọn một danh mục.');
    // No top-of-page banner outside CategoryPicker
    expect(screen.getAllByRole('alert')).toHaveLength(1);

    const grid = screen.getByTestId('category-grid');
    expect(grid).toHaveClass('ring-2', 'ring-danger');
    expect(scrollSpy).toHaveBeenCalledWith({ block: 'nearest' });

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(grid).not.toHaveClass('ring-danger');
    // Error message stays until tile is picked
    expect(within(picker).getByTestId('category-error')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('category-tile-cat-food'));
    expect(screen.queryByTestId('category-error')).toBeNull();
  });

  it('5a. rapid double tap on Lưu posts once while disabled', async () => {
    const user = userEvent.setup();
    let postCount = 0;
    let resolvePost!: (res: Response) => void;

    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/wallets': { wallets: [vndCash, binanceWallet] },
      'GET /api/me/personal/categories': categoriesResp,
      'POST /api/me/personal/transactions': () => {
        postCount += 1;
        return new Promise<Response>((resolve) => {
          resolvePost = resolve;
        });
      },
    });

    renderEntryPage('/entries/new?type=expense');
    await screen.findByTestId('amount-keypad');
    await user.click(screen.getByTestId('key-5'));
    await user.click(screen.getByTestId('key-000'));
    await user.click(screen.getByTestId('category-tile-cat-food'));

    const saveBtn = screen.getByTestId('entry-save-btn');
    await user.dblClick(saveBtn);

    expect(postCount).toBe(1);
    expect(saveBtn).toBeDisabled();

    resolvePost(Response.json({ entries: [makeEntry()] }, { status: 201 }));
    expect(await screen.findByTestId('trips-route')).toBeInTheDocument();
  });

  it('5b. 500 failure on save shows InlineError and preserves amount, category, wallet, date, note', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/wallets': { wallets: [vndCash, binanceWallet] },
      'GET /api/me/personal/categories': categoriesResp,
      'POST /api/me/personal/transactions': () =>
        Response.json({ error: { code: 'INTERNAL', message: 'Server error' } }, { status: 500 }),
    });

    renderEntryPage('/entries/new?type=expense');
    await screen.findByTestId('amount-keypad');

    await user.click(screen.getByTestId('key-8'));
    await user.click(screen.getByTestId('key-5'));
    await user.click(screen.getByTestId('key-000'));
    await user.type(screen.getByTestId('entry-note-input'), 'Cà phê');
    fireEvent.change(screen.getByTestId('entry-date-picker'), { target: { value: '2026-11-15' } });
    fireEvent.change(screen.getByTestId('entry-time-picker'), { target: { value: '14:30' } });
    await user.click(screen.getByTestId('category-tile-cat-food'));
    await user.click(screen.getByTestId('entry-save-btn'));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByTestId('amount-display')).toHaveTextContent('85.000₫');
    expect(screen.getByTestId('category-tile-cat-food')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('entry-wallet-row')).toHaveTextContent('Tiền mặt (VND)');
    expect(screen.getByTestId('entry-date-picker')).toHaveValue('2026-11-15');
    expect(screen.getByTestId('entry-time-picker')).toHaveValue('14:30');
    expect(screen.getByTestId('entry-note-input')).toHaveValue('Cà phê');
  });

  it('5c. guard modal and small-amount modal both return focus to opener when closed', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/wallets': { wallets: [vndCash, binanceWallet] },
      'GET /api/me/personal/categories': categoriesResp,
    });

    renderEntryPage('/entries/new?type=expense');
    await screen.findByTestId('amount-keypad');

    await user.click(screen.getByTestId('key-8'));
    await user.click(screen.getByTestId('key-5'));
    await user.click(screen.getByTestId('category-tile-cat-food'));

    // Small-amount modal opened from Lưu button
    const saveBtn = screen.getByTestId('entry-save-btn');
    saveBtn.focus();
    await user.click(saveBtn);
    await screen.findByText('Số tiền này đúng chưa?');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByText('Số tiền này đúng chưa?')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(saveBtn));

    // Leave-guard modal opened from back button
    const backBtn = screen.getByTestId('entry-back');
    backBtn.focus();
    await user.click(backBtn);
    await screen.findByText('Bỏ khoản đang nhập?');
    await user.click(screen.getByTestId('leave-guard-keep'));
    await waitFor(() => expect(screen.queryByText('Bỏ khoản đang nhập?')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(backBtn));
  });
});
