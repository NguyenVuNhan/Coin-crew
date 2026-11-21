import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { CategoriesResponse, CategoryView, EntryView, TripView, WalletDetailView } from '@cc/core';
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
const binance: WalletDetailView = {
  ...vndCash,
  id: 'w-bin',
  name: 'Binance',
  currency: 'USDT',
  isDefault: false,
  kind: 'investment',
  sortOrder: 1,
  balance: 100_000,
  startAmount: 100_000,
  vndValue: 2_500_000,
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

function renderEntryPage(route: string, state?: unknown) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <PlatformProvider platform={browserPlatform}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/trips', { pathname: route.split('?')[0], search: route.includes('?') ? `?${route.split('?')[1]}` : '', state }]} initialIndex={1}>
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

describe('EntryPage critique 2 step B — one save button (✓ means Xong)', () => {
  it('✓ key reads "Xong" (and "Done" in English) as visible text, accessible name, and title', async () => {
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/wallets': { wallets: [vndCash] },
      'GET /api/me/personal/categories': categoriesResp,
    });
    const { unmount } = renderEntryPage('/entries/new?type=expense');
    await screen.findByTestId('amount-keypad');
    const doneBtn = screen.getByTestId('key-done');
    expect(doneBtn).toHaveTextContent('Xong');
    expect(doneBtn).toHaveAccessibleName('Xong');
    expect(doneBtn).toHaveAttribute('title', 'Xong');
    unmount();

    setLang('en');
    renderEntryPage('/entries/new?type=expense');
    await screen.findByTestId('amount-keypad');
    const enDoneBtn = screen.getByTestId('key-done');
    expect(enDoneBtn).toHaveTextContent('Done');
    expect(enDoneBtn).toHaveAccessibleName('Done');
    expect(enDoneBtn).toHaveAttribute('title', 'Done');
  });

  it('on new Chi with no category: typing 85 then ✓ posts nothing, shows no error, closes keypad, focuses first tile; picking category + Lưu posts once', async () => {
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;
    const posts: unknown[] = [];
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/wallets': { wallets: [vndCash] },
      'GET /api/me/personal/categories': categoriesResp,
      'POST /api/me/personal/transactions': (init?: RequestInit) => {
        posts.push(JSON.parse(String(init?.body ?? '{}')));
        return Response.json({ entries: [] }, { status: 201 });
      },
    });

    renderEntryPage('/entries/new?type=expense');
    await screen.findByTestId('amount-keypad');
    fireEvent.click(screen.getByTestId('key-8'));
    fireEvent.click(screen.getByTestId('key-5'));
    fireEvent.click(screen.getByTestId('key-000'));
    fireEvent.click(screen.getByTestId('key-done'));

    expect(posts).toHaveLength(0);
    expect(screen.queryByTestId('category-error')).toBeNull();
    expect(screen.queryByTestId('amount-keypad')).toBeNull();

    const firstTile = screen.getByTestId('category-grid').querySelector('button:not([disabled])');
    expect(firstTile).toHaveFocus();
    expect(scrollSpy).toHaveBeenCalledWith({ block: 'nearest' });

    fireEvent.click(screen.getByTestId('category-tile-cat-food'));
    fireEvent.click(screen.getByTestId('entry-save-btn'));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({ walletId: 'w-vnd', amount: 85000, categoryId: 'cat-food' });
  });

  it('with a category already chosen (edit mode), ✓ commits amount, closes keypad, and focuses bottom Lưu', async () => {
    const existingEntry: EntryView = {
      id: 'e-1',
      type: 'expense',
      walletId: 'w-vnd',
      currency: 'VND',
      amount: 50000,
      categoryId: 'cat-food',
      date: '2026-11-10',
      time: '09:30',
      note: '',
      tags: [],
      excludeFromReports: false,
      transferId: null,
      counterpartWalletId: null,
      source: 'manual',
      beforeStart: false,
      createdAt: '2026-11-10T09:30:00Z',
    };
    const patches: unknown[] = [];
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/wallets': { wallets: [vndCash] },
      'GET /api/me/personal/categories': categoriesResp,
      'PATCH /api/me/personal/transactions/e-1': (init?: RequestInit) => {
        patches.push(JSON.parse(String(init?.body ?? '{}')));
        return Response.json(existingEntry);
      },
    });

    renderEntryPage('/entries/e-1/edit', { entry: existingEntry });
    const amountBtn = await screen.findByTestId('entry-fold-amount');
    fireEvent.click(amountBtn);
    await screen.findByTestId('amount-keypad');
    fireEvent.click(screen.getByTestId('key-0'));
    fireEvent.click(screen.getByTestId('key-done'));

    expect(patches).toHaveLength(0);
    expect(screen.queryByTestId('amount-keypad')).toBeNull();
    expect(screen.getByTestId('entry-save-btn')).toHaveFocus();
  });

  it('transfer: ✓ on first amount focuses second amount button when empty; ✓ on second amount focuses Lưu', async () => {
    const posts: unknown[] = [];
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/wallets': { wallets: [vndCash, binance] },
      'GET /api/me/personal/categories': categoriesResp,
      'POST /api/me/personal/transactions': (init?: RequestInit) => {
        posts.push(JSON.parse(String(init?.body ?? '{}')));
        return Response.json({ entries: [] }, { status: 201 });
      },
    });

    renderEntryPage('/entries/new?type=transfer');
    await screen.findByTestId('amount-keypad');
    fireEvent.click(screen.getByTestId('key-5'));
    fireEvent.click(screen.getByTestId('key-000'));
    fireEvent.click(screen.getByTestId('key-done'));

    expect(posts).toHaveLength(0);
    expect(screen.queryByTestId('amount-keypad')).toBeNull();
    const receivedBox = screen.getByTestId('amount-received-box');
    expect(receivedBox).toHaveFocus();

    fireEvent.click(receivedBox);
    await screen.findByTestId('amount-keypad');
    fireEvent.click(screen.getByTestId('key-2'));
    fireEvent.click(screen.getByTestId('key-done'));

    expect(posts).toHaveLength(0);
    expect(screen.queryByTestId('amount-keypad')).toBeNull();
    expect(screen.getByTestId('entry-save-btn')).toHaveFocus();
  });

  // Owner approved 2026-11-21 (Part 3): the "Với ai?" chips replace the "Với ai" row.
  it('Vay/Nợ: ✓ never posts and focuses the first Với ai? chip when nobody is chosen', async () => {
    const posts: unknown[] = [];
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/wallets': { wallets: [vndCash] },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/trips/t-led': directTripView(),
      'GET /api/me/people/candidates': [],
      'POST /api/trips/t-led/expenses': (init?: RequestInit) => {
        posts.push(JSON.parse(String(init?.body ?? '{}')));
        return Response.json({ expenseId: 'exp-1' }, { status: 201 });
      },
    });

    renderEntryPage('/entries/new?type=loan-debt');
    await screen.findByTestId('amount-keypad');
    fireEvent.click(screen.getByTestId('key-8'));
    fireEvent.click(screen.getByTestId('key-5'));
    fireEvent.click(screen.getByTestId('key-000'));
    fireEvent.click(screen.getByTestId('key-done'));

    expect(posts).toHaveLength(0);
    expect(screen.queryByTestId('amount-keypad')).toBeNull();
    await waitFor(() => {
      expect(screen.getByTestId('entry-people').querySelector('button')).toHaveFocus();
    });
  });
});
