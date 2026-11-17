import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

beforeEach(() => {
  localStorage.clear();
  hideUndo();
  setLang('vi');
});

afterEach(() => {
  vi.useRealTimers();
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
  ...vndCash,
  id: 'w-usd',
  name: 'USD',
  currency: 'USD',
  isDefault: false,
  sortOrder: 1,
  balance: 10_000,
  startAmount: 10_000,
  vndValue: 250_000,
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

const categoriesResp: CategoriesResponse = { categories: [foodCat], recentIds: ['cat-food'] };

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
    me: { kind: 'member', participantId: 'led-o', participantPending: false, isOrganiser: true },
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


const base = {
  'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
  'GET /api/me/personal/categories': categoriesResp,
};

describe('EntryPage critique step 4 — screen reader and keyboard', () => {
  it('amount button names: empty, typed, transfer second amount, Vay/Nợ', async () => {
    mockApi({ ...base, 'GET /api/me/personal/wallets': { wallets: [vndCash] } });
    const { unmount } = renderEntryPage('/entries/new?type=expense');
    await screen.findByTestId('amount-keypad');
    expect(screen.getByTestId('amount-display')).toHaveAccessibleName('Số tiền: chưa nhập');
    fireEvent.click(screen.getByTestId('key-8'));
    fireEvent.click(screen.getByTestId('key-5'));
    fireEvent.click(screen.getByTestId('key-000'));
    expect(screen.getByTestId('amount-display')).toHaveAccessibleName('Số tiền: 85.000₫');
    unmount();

    mockApi({ ...base, 'GET /api/me/personal/wallets': { wallets: [vndCash, usdWallet] } });
    const t2 = renderEntryPage('/entries/new?type=transfer');
    const box = await screen.findByTestId('amount-received-box');
    expect(box).toHaveAccessibleName('Số nhận được: chưa nhập');
    t2.unmount();

    mockApi({
      ...base,
      'GET /api/me/personal/wallets': { wallets: [vndCash] },
      'GET /api/trips/t-led': directTripView(),
      'GET /api/me/people/candidates': [],
    });
    renderEntryPage('/entries/new?type=loan-debt');
    await screen.findByTestId('amount-keypad');
    expect(screen.getByTestId('amount-display')).toHaveAccessibleName('Số tiền: chưa nhập');
    fireEvent.click(screen.getByTestId('key-7'));
    fireEvent.click(screen.getByTestId('key-000'));
    expect(screen.getByTestId('amount-display')).toHaveAccessibleName('Số tiền: 7.000₫');
    expect(screen.getByTestId('key-done')).toHaveAccessibleName('Xong');
    expect(screen.getByTestId('key-done')).toHaveAttribute('title', 'Xong');
  });

  it('live region announces the amount once, after the debounce', async () => {
    mockApi({ ...base, 'GET /api/me/personal/wallets': { wallets: [vndCash] } });
    renderEntryPage('/entries/new?type=expense');
    await screen.findByTestId('amount-keypad');
    const region = screen.getByTestId('entry-live-region');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveTextContent('');
    vi.useFakeTimers();
    fireEvent.click(screen.getByTestId('key-8'));
    fireEvent.click(screen.getByTestId('key-5'));
    fireEvent.click(screen.getByTestId('key-000'));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(region).toHaveTextContent('');
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(region.textContent).toBe('Số tiền: 85.000₫');
    vi.useRealTimers();
  });

  it('keypad takes focus on open; physical 8, 5 type; Escape closes and returns focus to the amount button', async () => {
    const user = userEvent.setup();
    mockApi({ ...base, 'GET /api/me/personal/wallets': { wallets: [vndCash] } });
    renderEntryPage('/entries/new?type=expense');
    const keypad = await screen.findByTestId('amount-keypad');
    await waitFor(() => expect(keypad).toHaveFocus());
    expect(keypad).toHaveAttribute('tabindex', '-1');
    await user.keyboard('85');
    expect(screen.getByTestId('amount-display')).toHaveAccessibleName('Số tiền: 85₫');
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('amount-keypad')).toBeNull();
    expect(screen.getByTestId('amount-display')).toHaveFocus();
    // Enter on the amount button opens the keypad and focuses it again.
    await user.keyboard('{Enter}');
    const again = await screen.findByTestId('amount-keypad');
    await waitFor(() => expect(again).toHaveFocus());
  });

  it('keyboard-only path: amount, digits, Tab to tiles, select, Tab to Lưu, Enter posts once', async () => {
    const user = userEvent.setup();
    const posts: unknown[] = [];
    mockApi({
      ...base,
      'GET /api/me/personal/wallets': { wallets: [vndCash] },
      'POST /api/me/personal/transactions': (init?: RequestInit) => {
        posts.push(JSON.parse(String(init?.body ?? '{}')));
        return Response.json({ entries: [] }, { status: 201 });
      },
    });
    renderEntryPage('/entries/new?type=expense');
    const keypad = await screen.findByTestId('amount-keypad');
    await waitFor(() => expect(keypad).toHaveFocus());
    await user.keyboard('85000');
    expect(screen.getByTestId('amount-display')).toHaveAccessibleName('Số tiền: 85.000₫');

    await user.tab();
    const tiles = screen.getByTestId('category-grid').querySelectorAll('button');
    expect(tiles[0]).toHaveFocus();
    await user.tab();
    const food = screen.getByTestId('category-tile-cat-food');
    expect(food).toHaveFocus();
    expect(food).toHaveAccessibleName('Ăn uống');
    expect(food).toHaveAttribute('aria-pressed', 'false');
    await user.keyboard(' ');
    expect(food).toHaveAttribute('aria-pressed', 'true');

    const save = await screen.findByTestId('entry-save-btn');
    for (let i = 0; i < 15 && document.activeElement !== save; i += 1) await user.tab();
    expect(save).toHaveFocus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({ walletId: 'w-vnd', amount: 85000, categoryId: 'cat-food' });
  });
});
