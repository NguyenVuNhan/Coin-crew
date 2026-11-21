import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { CategoriesResponse, CategoryView, WalletDetailView } from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { browserPlatform, PlatformProvider } from '@cc/web-platform';
import { readLastWallet, writeLastWallet } from '@cc/web-data-access/personalMoney';
import { mockApi } from '../../test/render';
import { finishAmount, openDetails } from '../../test/entry';
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
const bank: WalletDetailView = { ...vndCash, id: 'w-bank', name: 'Ngân hàng', isDefault: false, sortOrder: 1 };
const binance: WalletDetailView = {
  ...vndCash,
  id: 'w-bin',
  name: 'Binance',
  currency: 'USDT',
  isDefault: false,
  kind: 'investment',
  sortOrder: 2,
  balance: 100_000,
  startAmount: 100_000,
  vndValue: 2_500_000,
};
const binance2: WalletDetailView = { ...binance, id: 'w-bin2', name: 'Binance 2', sortOrder: 3 };
const foodCat: CategoryView = {
  id: 'cat-food',
  type: 'expense',
  name: 'Ăn uống',
  icon: 'utensils',
  parentId: null,
  sortOrder: 0,
  hidden: false,
  // Shown on the Binance wallets on purpose: these tests are about currency, not visibility (#130).
  walletOverrides: [
    { walletId: 'w-bin', visible: true },
    { walletId: 'w-bin2', visible: true },
  ],
};
const categoriesResp: CategoriesResponse = { categories: [foodCat], recentIds: ['cat-food'] };

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

function setup(posts: unknown[], failFirst = false) {
  let n = 0;
  mockApi({
    'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
    'GET /api/me/personal/wallets': { wallets: [vndCash, bank, binance, binance2] },
    'GET /api/me/personal/categories': categoriesResp,
    'POST /api/me/personal/transactions': (init?: RequestInit) => {
      posts.push(JSON.parse(String(init?.body ?? '{}')));
      n += 1;
      return failFirst && n === 1
        ? Response.json({ error: { code: 'x', message: 'boom' } }, { status: 500 })
        : Response.json({ entries: [] }, { status: 201 });
    },
  });
}

async function openKeypad() {
  if (!screen.queryByTestId('amount-keypad')) {
    const fold = screen.queryByTestId('entry-fold-amount');
    fireEvent.click(fold ?? screen.getByTestId('amount-display'));
  }
  await screen.findByTestId('amount-keypad');
}

function typeAmountAndCategory() {
  fireEvent.click(screen.getByTestId('key-3'));
  fireEvent.click(screen.getByTestId('key-5'));
  fireEvent.click(screen.getByTestId('key-done'));
  fireEvent.click(screen.getByTestId('category-tile-cat-food'));
}

describe('EntryPage critique 2 step A — never the wrong wallet or currency', () => {
  it('saving a transfer does not change the remembered wallet; a Chi does', async () => {
    const user = userEvent.setup();
    writeLastWallet('w-bank');
    const posts: unknown[] = [];
    setup(posts);
    const first = renderEntryPage('/entries/new?type=transfer');
    await finishAmount(user, '5000');
    fireEvent.click(screen.getByTestId('entry-wallet-row'));
    fireEvent.click(await screen.findByTestId('wallet-option-w-bin'));
    fireEvent.click(screen.getByTestId('entry-to-wallet-row'));
    fireEvent.click(await screen.findByTestId('wallet-option-w-bin2'));
    fireEvent.click(screen.getByTestId('entry-save-btn'));
    await waitFor(() => expect(posts.length).toBeGreaterThan(0));
    expect(readLastWallet()).toBe('w-bank');
    first.unmount();

    posts.length = 0;
    renderEntryPage('/entries/new?type=expense');
    await finishAmount(user, '5000');
    await user.click(await screen.findByTestId('category-tile-cat-food'));
    await openDetails(user);
    fireEvent.click(screen.getByTestId('entry-wallet-row'));
    fireEvent.click(await screen.findByTestId('wallet-option-w-vnd'));
    fireEvent.click(screen.getByTestId('entry-save-btn'));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(readLastWallet()).toBe('w-vnd');
  });

  it('wallet chip shows for USDT, not for everyday VND, and opens the picker', async () => {
    writeLastWallet('w-bin');
    setup([]);
    const a = renderEntryPage('/entries/new?type=expense');
    await screen.findByTestId('amount-keypad');
    const chip = await screen.findByTestId('amount-wallet-chip');
    expect(chip).toHaveAccessibleName('Ví: Binance, USDT');
    expect(screen.getByTestId('amount-display')).toHaveAccessibleName('Số tiền: chưa nhập');
    fireEvent.click(chip);
    expect(await screen.findByTestId('wallet-picker-list')).toBeInTheDocument();
    a.unmount();

    writeLastWallet('w-vnd');
    renderEntryPage('/entries/new?type=expense');
    await screen.findByTestId('amount-keypad');
    expect(screen.queryByTestId('amount-wallet-chip')).toBeNull();
  });

  it('non-VND first save asks; Đổi ví opens the picker and posts nothing; Lưu posts once', async () => {
    writeLastWallet('w-bin');
    const posts: unknown[] = [];
    setup(posts);
    renderEntryPage('/entries/new?type=expense');
    await screen.findByTestId('amount-keypad');
    typeAmountAndCategory();
    fireEvent.click(screen.getByTestId('entry-save-btn'));
    await screen.findByText('Lưu bằng USDT?');
    await waitFor(() =>
      expect(screen.getByTestId('entry-live-region').textContent).toContain('Lưu bằng USDT?'),
    );
    fireEvent.click(screen.getByTestId('foreign-change-wallet'));
    expect(await screen.findByTestId('wallet-picker-list')).toBeInTheDocument();
    expect(posts).toHaveLength(0);
    fireEvent.click(screen.getByTestId('wallet-option-w-bin'));
    await openKeypad();
    fireEvent.click(screen.getByTestId('key-done'));
    fireEvent.click(screen.getByTestId('entry-save-btn'));
    fireEvent.click(await screen.findByTestId('foreign-save'));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({ walletId: 'w-bin', amount: 3500 });
  });

  it('second save on the same visit does not ask again', async () => {
    writeLastWallet('w-bin');
    const posts: unknown[] = [];
    setup(posts, true);
    renderEntryPage('/entries/new?type=expense');
    await screen.findByTestId('amount-keypad');
    typeAmountAndCategory();
    fireEvent.click(screen.getByTestId('entry-save-btn'));
    fireEvent.click(await screen.findByTestId('foreign-save'));
    await waitFor(() => expect(posts).toHaveLength(1));
    await openKeypad();
    await waitFor(() => expect(screen.getByTestId('key-done')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('key-done'));
    fireEvent.click(screen.getByTestId('entry-save-btn'));
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(screen.queryByTestId('foreign-save')).toBeNull();
  });

  it('transfers never ask', async () => {
    const user = userEvent.setup();
    writeLastWallet('w-bin');
    const posts: unknown[] = [];
    setup(posts);
    renderEntryPage('/entries/new?type=transfer');
    await finishAmount(user, '5000');
    await user.click(await screen.findByTestId('amount-received-box'));
    await finishAmount(user, '5000');
    fireEvent.click(screen.getByTestId('entry-to-wallet-row'));
    fireEvent.click(await screen.findByTestId('wallet-option-w-bin2'));
    fireEvent.click(screen.getByTestId('entry-save-btn'));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(screen.queryByTestId('foreign-save')).toBeNull();
  });
});
