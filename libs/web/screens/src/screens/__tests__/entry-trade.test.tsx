import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import type {
  AssetView,
  CategoriesResponse,
  CategoryView,
  EntryView,
  HoldingView,
  TripView,
  WalletDetailView,
} from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { browserPlatform, PlatformProvider } from '@cc/web-platform';
import { mockApi } from '../../test/render';
import { finishAmount, openDetails } from '../../test/entry';
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
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  hideUndo();
});

const everydayWallet: WalletDetailView = {
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

const investmentWallet: WalletDetailView = {
  id: 'w-inv',
  name: 'Binance',
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

const usdInvestmentWallet: WalletDetailView = {
  id: 'w-usd-inv',
  name: 'Interactive Brokers',
  currency: 'USD',
  balance: 100_000,
  isDefault: false,
  kind: 'investment',
  startAmount: 100_000,
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: 25_000_000,
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

const vnmAsset: AssetView = {
  id: 'asset-vnm',
  name: 'VNM',
  unit: 'cp',
  groupName: 'Cổ phiếu',
  decimals: 0,
  hidden: false,
  sortOrder: 1,
  entryCount: 0,
};

const hiddenAsset: AssetView = {
  id: 'asset-old',
  name: 'OLD',
  unit: 'OLD',
  groupName: 'Crypto',
  decimals: 2,
  hidden: true,
  sortOrder: 2,
  entryCount: 0,
};

const btcHolding: HoldingView = {
  walletId: 'w-inv',
  assetId: 'asset-btc',
  quantity: 150_000_000, // 1,5 BTC
  cost: 30_000_000,
  costVnd: 30_000_000,
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
    ],
    balances: { 'led-o': 0 },
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
              <Route path="/entries/:id/edit" element={<EntryPage />} />
              <Route path="/trips" element={<div data-testid="trips-route">Trips</div>} />
            </Routes>
          </NavHistoryProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </PlatformProvider>,
  );
}

async function tapKeypadDigits(user: ReturnType<typeof userEvent.setup>, digits: string) {
  for (const ch of digits) {
    if (ch === '000') {
      await user.click(screen.getByTestId('key-000'));
    } else {
      await user.click(screen.getByTestId(`key-${ch}`));
    }
  }
}

describe('EntryPage — Buy / Sell trade tiles (R10)', () => {
  it('hides trade tile on everyday wallet and shows it when switching to investment wallet', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
      'GET /api/me/personal/wallets': { wallets: [everydayWallet, investmentWallet] },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/me/personal/assets': { assets: [btcAsset, vnmAsset] },
      'GET /api/trips/t-led': directTripView(),
      'GET /api/me/people/candidates': [],
    });

    renderEntryPage('/entries/new?type=expense');
    await finishAmount(user, '100000');
    await screen.findByTestId('category-picker');

    // Everyday wallet is default -> no trade tile
    expect(screen.queryByTestId('category-tile-buy')).toBeNull();

    // Switch to investment wallet
    await user.click(screen.getByTestId('category-tile-cat-food'));
    await openDetails(user);
    await user.click(screen.getByTestId('entry-wallet-row'));
    await user.click(await screen.findByTestId('wallet-option-w-inv'));

    await user.click(screen.getByTestId('entry-fold-category'));
    expect(await screen.findByTestId('category-tile-buy')).toBeInTheDocument();
    expect(screen.getByTestId('category-tile-buy')).toHaveTextContent('Mua tài sản');

    // Switching to income shows "Bán tài sản"
    await user.click(screen.getByTestId('entry-tab-income'));
    expect(await screen.findByTestId('category-tile-sell')).toBeInTheDocument();
    expect(screen.getByTestId('category-tile-sell')).toHaveTextContent('Bán tài sản');

    // Switching back to everyday wallet clears trade mode
    await user.click(screen.getByTestId('category-tile-sell'));
    expect(await screen.findByTestId('entry-asset-row')).toBeInTheDocument();
    await user.click(screen.getByTestId('entry-wallet-row'));
    await user.click(await screen.findByTestId('wallet-option-w-vnd'));

    expect(screen.queryByTestId('entry-asset-row')).toBeNull();
    expect(screen.queryByTestId('category-tile-sell')).toBeNull();
  });

  it('picking "Mua tài sản" shows "Tài sản" row, "Số lượng" field with unit, and hides exclude switch', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
      'GET /api/me/personal/wallets': { wallets: [investmentWallet] },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/me/personal/assets': { assets: [btcAsset, vnmAsset, hiddenAsset] },
      'GET /api/trips/t-led': directTripView(),
      'GET /api/me/people/candidates': [],
    });

    renderEntryPage('/entries/new?type=expense');
    await finishAmount(user, '100000');
    await user.click(await screen.findByTestId('category-tile-buy'));

    expect(screen.getByTestId('entry-asset-row')).toBeInTheDocument();
    const qtyInput = screen.getByTestId('entry-quantity');
    expect(qtyInput).toHaveAttribute('inputmode', 'decimal');
    // Exclude switch & "More details" are hidden in trade mode (D2)
    expect(screen.queryByTestId('entry-exclude-switch')).toBeNull();
    expect(screen.queryByTestId('entry-more-details-toggle')).toBeNull();

    // Open AssetPicker, hidden asset should not appear
    await user.click(screen.getByTestId('entry-asset-row'));
    expect(await screen.findByTestId('asset-option-asset-btc')).toBeInTheDocument();
    expect(screen.getByTestId('asset-option-asset-vnm')).toBeInTheDocument();
    expect(screen.queryByTestId('asset-option-asset-old')).toBeNull();

    await user.click(screen.getByTestId('asset-option-asset-btc'));
    expect(screen.getByTestId('entry-quantity-unit')).toHaveTextContent('BTC');
  });

  it('saves buy entry without categoryId, shows no category error, and echoes snackbar', async () => {
    const user = userEvent.setup();
    const createdEntry: EntryView = {
      id: 'e-buy-1',
      walletId: 'w-inv',
      type: 'buy',
      amount: 500_000_000,
      currency: 'VND',
      categoryId: null,
      assetId: 'asset-btc',
      quantity: 50_000_000,
      transferId: null,
      counterpartWalletId: null,
      date: '2026-11-18',
      time: null,
      note: null,
      tags: [],
      excludeFromReports: false,
      source: 'manual',
      beforeStart: false,
      createdAt: '2026-11-18T08:00:00Z',
    };
    const { calls } = mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
      'GET /api/me/personal/wallets': { wallets: [investmentWallet] },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/me/personal/assets': { assets: [btcAsset] },
      'GET /api/trips/t-led': directTripView(),
      'GET /api/me/people/candidates': [],
      'POST /api/me/personal/transactions': { entries: [createdEntry] },
    });

    renderEntryPage('/entries/new?type=expense&tile=buy&wallet=w-inv');
    await finishAmount(user, '500000000');
    await screen.findByTestId('entry-asset-row');

    await user.click(screen.getByTestId('entry-asset-row'));
    await user.click(await screen.findByTestId('asset-option-asset-btc'));
    await user.type(screen.getByTestId('entry-quantity'), '0,5');

    await user.click(screen.getByTestId('entry-save-btn'));

    await waitFor(() => {
      const postCalls = calls.filter(
        (c) => c.method === 'POST' && c.path.endsWith('/api/me/personal/transactions'),
      );
      expect(postCalls).toHaveLength(1);
      const body = postCalls[0]!.body as Record<string, unknown>;
      expect(body).toMatchObject({
        type: 'buy',
        walletId: 'w-inv',
        assetId: 'asset-btc',
        quantity: 50_000_000,
        amount: 500_000_000,
      });
      expect(body.categoryId).toBeUndefined();
      expect(body.excludeFromReports).toBeUndefined();
    });

    expect(screen.queryByTestId('category-error')).toBeNull();
    expect(await screen.findByTestId('trips-route')).toBeInTheDocument();
    expect(screen.getByText('Đã mua 0,5 BTC')).toBeInTheDocument();
  });

  it('sell shows held quantity, disables Lưu on client oversell, and shows server OVERSELL error', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
      'GET /api/me/personal/wallets': { wallets: [investmentWallet] },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/me/personal/assets': { assets: [btcAsset] },
      'GET /api/me/personal/holdings': { holdings: [btcHolding] },
      'GET /api/trips/t-led': directTripView(),
      'GET /api/me/people/candidates': [],
      'POST /api/me/personal/transactions': () =>
        Response.json(
          {
            error: {
              code: 'OVERSELL',
              message: 'Oversell',
              details: { assetId: 'asset-btc', date: '2026-11-18' },
            },
          },
          { status: 422 },
        ),
    });

    renderEntryPage('/entries/new?type=income&tile=sell&wallet=w-inv');
    await finishAmount(user, '100000000');
    await screen.findByTestId('entry-asset-row');

    await user.click(screen.getByTestId('entry-asset-row'));
    await user.click(await screen.findByTestId('asset-option-asset-btc'));

    expect(await screen.findByTestId('entry-held')).toHaveTextContent('Đang có: 1,5 BTC');

    // Type more than 1,5 -> inline error & Lưu disabled with reason
    await user.type(screen.getByTestId('entry-quantity'), '2');
    expect(screen.getByTestId('entry-quantity-error')).toHaveTextContent('Vượt quá số đang có');
    expect(screen.getByTestId('trade-disabled-reason')).toHaveTextContent('Vượt quá số đang có');
    expect(screen.getByTestId('entry-save-btn')).toBeDisabled();

    // Change to 1,5 -> valid locally, submit -> server returns 422 OVERSELL
    await user.clear(screen.getByTestId('entry-quantity'));
    await user.type(screen.getByTestId('entry-quantity'), '1,5');
    expect(screen.queryByTestId('entry-quantity-error')).toBeNull();
    expect(screen.getByTestId('entry-save-btn')).toBeEnabled();

    await user.click(screen.getByTestId('entry-save-btn'));

    await waitFor(() => {
      const postCalls = calls.filter(
        (c) => c.method === 'POST' && c.path.endsWith('/api/me/personal/transactions'),
      );
      expect(postCalls).toHaveLength(1);
    });
    expect(await screen.findByTestId('entry-quantity-error')).toHaveTextContent(
      'Lần bán sau đó sẽ vượt số đang có (18/11/2026)',
    );
  });

  it('"Thêm tài sản" from AssetPicker creates the asset and selects it', async () => {
    const user = userEvent.setup();
    const newAsset: AssetView = {
      id: 'asset-eth',
      name: 'ETH',
      unit: 'ETH',
      groupName: 'Crypto',
      decimals: 8,
      hidden: false,
      sortOrder: 2,
      entryCount: 0,
    };
    const manyAssets: AssetView[] = Array.from({ length: 9 }, (_, i) => ({
      id: `asset-${i}`,
      name: `Asset ${i}`,
      unit: `U${i}`,
      groupName: 'Crypto',
      decimals: 2,
      hidden: false,
      sortOrder: i,
      entryCount: 0,
    }));

    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
      'GET /api/me/personal/wallets': { wallets: [investmentWallet] },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/me/personal/assets': { assets: manyAssets },
      'GET /api/trips/t-led': directTripView(),
      'GET /api/me/people/candidates': [],
      'POST /api/me/personal/assets': { asset: newAsset },
    });

    renderEntryPage('/entries/new?type=expense&tile=buy&wallet=w-inv');
    await finishAmount(user, '100000');
    await user.click(await screen.findByTestId('entry-asset-row'));

    // Search field appears when > 8 assets
    expect(await screen.findByTestId('asset-picker-search')).toBeInTheDocument();

    await user.click(screen.getByTestId('asset-picker-add'));
    expect(await screen.findByTestId('asset-form')).toBeInTheDocument();

    await user.type(screen.getByTestId('asset-name-input'), 'ETH');
    await user.type(screen.getByTestId('asset-unit-input'), 'ETH');
    await user.click(screen.getByTestId('asset-save-btn'));

    await waitFor(() => {
      expect(screen.queryByTestId('asset-form')).toBeNull();
    });
    expect(screen.getByTestId('entry-asset-row')).toHaveTextContent('ETH');
    expect(screen.getByTestId('entry-quantity-unit')).toHaveTextContent('ETH');
  });

  it('editing a buy opens Chi with buy tile selected and asset + quantity filled', async () => {
    const user = userEvent.setup();
    const buyEntry: EntryView = {
      id: 'e-buy-edit',
      walletId: 'w-inv',
      type: 'buy',
      amount: 250_000_000,
      currency: 'VND',
      categoryId: null,
      assetId: 'asset-btc',
      quantity: 50_000_000,
      transferId: null,
      counterpartWalletId: null,
      date: '2026-11-15',
      time: '10:30',
      note: 'DCA',
      tags: [],
      excludeFromReports: false,
      source: 'manual',
      beforeStart: false,
      createdAt: '2026-11-15T10:30:00Z',
    };

    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
      'GET /api/me/personal/wallets': { wallets: [investmentWallet] },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/me/personal/assets': { assets: [btcAsset] },
      'GET /api/me/personal/transactions': {
        rows: [{ kind: 'entry', entry: buyEntry }],
        totals: [],
      },
      'GET /api/trips/t-led': directTripView(),
      'GET /api/me/people/candidates': [],
    });

    renderEntryPage('/entries/e-buy-edit/edit');

    await waitFor(() => {
      expect(screen.getByTestId('entry-asset-row')).toHaveTextContent('BTC');
    });
    expect(screen.getByTestId('entry-quantity')).toHaveValue('0,5');
    await user.click(screen.getByTestId('entry-fold-category'));
    expect(screen.getByTestId('category-tile-buy')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('entry-tab-income')).toBeDisabled();
    expect(screen.getByTestId('entry-tab-loan-debt')).toBeDisabled();
    expect(screen.queryByTestId('entry-exclude-switch')).toBeNull();
  });

  it('on a mouse device, amount uses AmountField and quantity field still works', async () => {
    mockMousePointerMatchMedia();
    const user = userEvent.setup();
    const createdEntry: EntryView = {
      id: 'e-buy-pc',
      walletId: 'w-inv',
      type: 'buy',
      amount: 10_000_000,
      currency: 'VND',
      categoryId: null,
      assetId: 'asset-vnm',
      quantity: 100,
      transferId: null,
      counterpartWalletId: null,
      date: '2026-11-18',
      time: null,
      note: null,
      tags: [],
      excludeFromReports: false,
      source: 'manual',
      beforeStart: false,
      createdAt: '2026-11-18T08:00:00Z',
    };
    const { calls } = mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
      'GET /api/me/personal/wallets': { wallets: [investmentWallet] },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/me/personal/assets': { assets: [vnmAsset] },
      'GET /api/trips/t-led': directTripView(),
      'GET /api/me/people/candidates': [],
      'POST /api/me/personal/transactions': { entries: [createdEntry] },
    });

    renderEntryPage('/entries/new?type=expense&tile=buy&wallet=w-inv');

    const amountInput = await screen.findByTestId('amount-input');
    expect(screen.queryByTestId('amount-keypad')).toBeNull();
    await user.type(amountInput, '10000000');

    await user.click(screen.getByTestId('entry-asset-row'));
    await user.click(await screen.findByTestId('asset-option-asset-vnm'));
    await user.type(screen.getByTestId('entry-quantity'), '100');

    await user.click(screen.getByTestId('entry-save-btn'));

    await waitFor(() => {
      const postCalls = calls.filter(
        (c) => c.method === 'POST' && c.path.endsWith('/api/me/personal/transactions'),
      );
      expect(postCalls).toHaveLength(1);
      expect(postCalls[0]!.body).toMatchObject({
        type: 'buy',
        walletId: 'w-inv',
        assetId: 'asset-vnm',
        quantity: 100,
        amount: 10_000_000,
      });
    });
  });

  it('"Xong" focus chain: asset row -> quantity -> Lưu', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
      'GET /api/me/personal/wallets': { wallets: [investmentWallet] },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/me/personal/assets': { assets: [btcAsset] },
      'GET /api/trips/t-led': directTripView(),
      'GET /api/me/people/candidates': [],
    });

    renderEntryPage('/entries/new?type=expense&tile=buy&wallet=w-inv');

    // 1. No asset chosen -> Xong focuses asset row
    await finishAmount(user, '500000');
    await screen.findByTestId('entry-asset-row');
    expect(screen.getByTestId('entry-asset-row')).toHaveFocus();

    // 2. Asset chosen, quantity empty -> Xong focuses quantity
    await user.click(screen.getByTestId('entry-asset-row'));
    await user.click(await screen.findByTestId('asset-option-asset-btc'));
    await user.click(screen.getByTestId('entry-fold-amount'));
    await user.click(screen.getByTestId('key-done'));
    expect(screen.getByTestId('entry-quantity')).toHaveFocus();

    // 3. Quantity filled -> Xong focuses Lưu
    await user.type(screen.getByTestId('entry-quantity'), '0,1');
    await user.click(screen.getByTestId('entry-fold-amount'));
    await user.click(screen.getByTestId('key-done'));
    expect(screen.getByTestId('entry-save-btn')).toHaveFocus();
  });

  it('keeps small-amount and foreign-wallet guards in trade mode', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
      'GET /api/me/personal/wallets': { wallets: [investmentWallet, usdInvestmentWallet] },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/me/personal/assets': { assets: [btcAsset] },
      'GET /api/trips/t-led': directTripView(),
      'GET /api/me/people/candidates': [],
    });

    renderEntryPage('/entries/new?type=expense&tile=buy&wallet=w-inv');
    await finishAmount(user, '500');
    await screen.findByTestId('entry-asset-row');
    await user.click(screen.getByTestId('entry-asset-row'));
    await user.click(await screen.findByTestId('asset-option-asset-btc'));
    await user.type(screen.getByTestId('entry-quantity'), '0,1');

    await user.click(screen.getByTestId('entry-save-btn'));
    expect(await screen.findByText('Số tiền này đúng chưa?')).toBeInTheDocument();
    await user.keyboard('{Escape}');

    // Switch to USD investment wallet -> foreign wallet guard
    await openDetails(user);
    await user.click(screen.getByTestId('entry-wallet-row'));
    await user.click(await screen.findByTestId('wallet-option-w-usd-inv'));
    await user.click(screen.getByTestId('entry-save-btn'));
    expect(await screen.findByText('Lưu bằng USD?')).toBeInTheDocument();
  });
});
