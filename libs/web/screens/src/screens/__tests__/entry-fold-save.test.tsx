import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import type {
  AssetView,
  CategoriesResponse,
  CategoryView,
  TripView,
  WalletDetailView,
} from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { browserPlatform, PlatformProvider } from '@cc/web-platform';
import { mockApi } from '../../test/render';
import { mockMedia } from '../../test/media';
import { NavHistoryProvider } from '../../lib/navHistory';
import { UndoSnackbarHost, hideUndo } from '../../components/UndoSnackbarHost';
import { EntryPage } from '../EntryPage';

beforeEach(() => {
  localStorage.clear();
  hideUndo();
  setLang('vi');
  mockMedia();
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

const bankWallet: WalletDetailView = {
  id: 'w-bank',
  name: 'VCB',
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

const usdtWallet: WalletDetailView = {
  id: 'w-usdt',
  name: 'Binance',
  currency: 'USDT',
  balance: 500_000,
  isDefault: true,
  kind: 'investment',
  startAmount: 500_000,
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: 125_000_000,
  icon: null,
  sortOrder: 0,
  archived: false,
  entryCount: 0,
};

const btcAsset: AssetView = {
  id: 'asset-btc',
  name: 'BTC',
  unit: 'BTC',
  groupName: 'Crypto',
  decimals: 8,
  hidden: false,
  sortOrder: 0,
  entryCount: 1,
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

function mockEntryApi(
  wallets: WalletDetailView[] = [vndCash, bankWallet],
  assets: AssetView[] = [],
) {
  return mockApi({
    'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
    'GET /api/me/personal/wallets': { wallets },
    'GET /api/me/personal/categories': categoriesResp,
    'GET /api/me/personal/assets': { assets },
    'GET /api/me/personal/holdings': { holdings: [] },
    'GET /api/trips/t-led': directTripView(),
    'GET /api/me/people/candidates': [],
  });
}

function renderEntryPage(route: string) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  });
  const [pathname, search] = route.split('?');
  return render(
    <PlatformProvider platform={browserPlatform}>
      <QueryClientProvider client={qc}>
        <MemoryRouter
          initialEntries={[
            { pathname: '/trips' },
            { pathname, search: search ? `?${search}` : '' },
          ]}
          initialIndex={1}
        >
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

async function enterAmountAndFold(user: ReturnType<typeof userEvent.setup>, digits = '120000') {
  await screen.findByTestId('amount-keypad');
  for (const ch of digits) {
    await user.click(screen.getByTestId(`key-${ch}`));
  }
  await user.click(screen.getByTestId('key-done'));
  await screen.findByTestId('entry-fold-amount');
}

describe('EntryPage — save button names what it saves (Task 5)', () => {
  it('reads "Lưu" before a category is picked in touch mode', async () => {
    const user = userEvent.setup();
    mockEntryApi();

    renderEntryPage('/entries/new?type=expense');
    await enterAmountAndFold(user, '120000');

    expect(screen.getByTestId('entry-save-btn')).toHaveTextContent('Lưu');
  });

  it('reads "Lưu 120.000₫ · Ăn uống" in touch mode when amount and category are chosen', async () => {
    const user = userEvent.setup();
    mockEntryApi();

    renderEntryPage('/entries/new?type=expense');
    await enterAmountAndFold(user, '120000');
    await user.click(screen.getByTestId('category-tile-cat-food'));

    expect(await screen.findByTestId('entry-save-btn')).toHaveTextContent('Lưu 120.000₫ · Ăn uống');
  });

  it('reads "Lưu 120.000₫ · Chuyển sang ví" for transfer in touch mode', async () => {
    const user = userEvent.setup();
    mockEntryApi();

    renderEntryPage('/entries/new?type=expense');
    await enterAmountAndFold(user, '120000');
    await user.click(screen.getByTestId('category-tile-transfer'));

    expect(await screen.findByTestId('entry-save-btn')).toHaveTextContent(
      'Lưu 120.000₫ · Chuyển sang ví',
    );
  });

  it('reads "Lưu 1.000,00 USDT · Mua BTC" for trade in touch mode when an asset is picked', async () => {
    const user = userEvent.setup();
    mockEntryApi([usdtWallet], [btcAsset]);

    renderEntryPage('/entries/new?type=expense');
    await enterAmountAndFold(user, '1000');
    await user.click(screen.getByTestId('category-tile-buy'));

    expect(screen.getByTestId('entry-save-btn')).toHaveTextContent('Lưu');

    await user.click(await screen.findByTestId('entry-asset-row'));
    await user.click(await screen.findByTestId('asset-option-asset-btc'));

    expect(screen.getByTestId('entry-save-btn')).toHaveTextContent('Lưu 1.000,00 USDT · Mua BTC');
  });

  it('always reads "Lưu" in mouse mode even with amount and category chosen', async () => {
    const user = userEvent.setup();
    mockMedia({ mouse: true });
    mockEntryApi();

    renderEntryPage('/entries/new?type=expense');
    const amountInput = await screen.findByRole('textbox', { name: 'Số tiền' });
    await user.type(amountInput, '120000');
    await user.click(screen.getByTestId('category-tile-cat-food'));

    expect(screen.getByTestId('entry-save-btn')).toHaveTextContent('Lưu');
  });
});
