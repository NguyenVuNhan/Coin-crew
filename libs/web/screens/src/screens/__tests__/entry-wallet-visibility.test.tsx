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
  WalletDetailView,
  WalletOverride,
} from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { browserPlatform, PlatformProvider } from '@cc/web-platform';
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

const investWallet: WalletDetailView = {
  ...vndCash,
  id: 'w-inv',
  name: 'Binance',
  isDefault: false,
  kind: 'investment',
  sortOrder: 1,
};

const cat = (
  id: string,
  name: string,
  icon: string,
  parentId: string | null,
  sortOrder: number,
  opts?: { starterKey?: string | null; walletOverrides?: WalletOverride[] },
): CategoryView => ({
  id,
  type: 'expense',
  name,
  icon,
  parentId,
  sortOrder,
  hidden: false,
  starterKey: opts?.starterKey ?? null,
  walletOverrides: opts?.walletOverrides ?? [],
});

const baseCategories: CategoryView[] = [
  cat('cat-food', 'Ăn uống', 'utensils', null, 0, { starterKey: 'food' }),
  cat('cat-invest', 'Đầu tư', 'trending-up', null, 1, { starterKey: 'invest' }),
  cat('cat-fees', 'Phí & lệ phí', 'receipt-text', null, 2, { starterKey: 'fees' }),
  cat('cat-tax', 'Thuế', 'percent', 'cat-fees', 0, { starterKey: 'tax' }),
];

const btcAsset: AssetView = {
  id: 'asset-btc',
  name: 'BTC',
  unit: 'BTC',
  groupName: 'Crypto',
  decimals: 8,
  hidden: false,
  sortOrder: 0,
  entryCount: 0,
  walletOverrides: [],
};

const etfAssetHiddenOnInv: AssetView = {
  id: 'asset-etf',
  name: 'E1VFVN30',
  unit: 'ccq',
  groupName: 'ETF',
  decimals: 0,
  hidden: false,
  sortOrder: 1,
  entryCount: 0,
  walletOverrides: [{ walletId: 'w-inv', visible: false }],
};

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

function setup(
  wallets: WalletDetailView[],
  opts?: {
    categories?: CategoriesResponse;
    assets?: AssetView[];
    extraRoutes?: Record<string, unknown>;
  },
) {
  return mockApi({
    'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
    'GET /api/me/personal/categories': opts?.categories ?? {
      categories: baseCategories,
      recentIds: ['cat-food', 'cat-invest', 'cat-tax'],
    },
    'GET /api/me/personal/wallets': { wallets },
    'GET /api/me/personal/assets': { assets: opts?.assets ?? [btcAsset, etfAssetHiddenOnInv] },
    ...(opts?.extraRoutes ?? {}),
  });
}

describe('EntryPage — per-wallet visibility', () => {
  it('investment wallet hides food and invest in tiles and "Thêm", while offering tax', async () => {
    const user = userEvent.setup();
    setup([vndCash, investWallet]);
    renderEntryPage('/entries/new?type=expense&wallet=w-inv');
    await finishAmount(user, '50000');

    expect(await screen.findByTestId('category-tile-cat-tax')).toBeInTheDocument();
    expect(screen.queryByTestId('category-tile-cat-food')).toBeNull();
    expect(screen.queryByTestId('category-tile-cat-invest')).toBeNull();

    await user.click(screen.getByTestId('category-more'));
    await screen.findByTestId('category-sheet-list');
    expect(screen.getByTestId('category-option-cat-tax')).toBeInTheDocument();
    expect(screen.queryByTestId('category-option-cat-food')).toBeNull();
    expect(screen.queryByTestId('category-option-cat-invest')).toBeNull();
  });

  it('everyday wallet offers both invest and food', async () => {
    const user = userEvent.setup();
    setup([vndCash, investWallet]);
    renderEntryPage('/entries/new?type=expense&wallet=w-vnd');
    await finishAmount(user, '50000');

    expect(await screen.findByTestId('category-tile-cat-food')).toBeInTheDocument();
    expect(screen.getByTestId('category-tile-cat-invest')).toBeInTheDocument();
  });

  it('override sub: investment wallet offers food-cafe when overridden on, without offering parent food', async () => {
    const user = userEvent.setup();
    const foodCafe = cat('cat-food-cafe', 'Cà phê', 'coffee', 'cat-food', 0, {
      starterKey: null,
      walletOverrides: [{ walletId: 'w-inv', visible: true }],
    });
    setup([vndCash, investWallet], {
      categories: {
        categories: [...baseCategories, foodCafe],
        recentIds: ['cat-food', 'cat-food-cafe'],
      },
    });
    renderEntryPage('/entries/new?type=expense&wallet=w-inv');
    await finishAmount(user, '50000');

    expect(await screen.findByTestId('category-tile-cat-food-cafe')).toBeInTheDocument();
    expect(screen.queryByTestId('category-tile-cat-food')).toBeNull();

    await user.click(screen.getByTestId('category-more'));
    await screen.findByTestId('category-sheet-list');
    expect(screen.getByTestId('category-option-cat-food-cafe')).toBeInTheDocument();
    expect(screen.queryByTestId('category-option-cat-food')).toBeNull();
  });

  it('wallet switch keeps a picked category selected and visible as a tile even if hidden in the new wallet', async () => {
    const user = userEvent.setup();
    setup([vndCash, investWallet]);
    renderEntryPage('/entries/new?type=expense&wallet=w-vnd');
    await finishAmount(user, '50000');

    await user.click(await screen.findByTestId('category-tile-cat-food'));
    await openDetails(user);
    await user.click(screen.getByTestId('entry-wallet-row'));
    await user.click(await screen.findByTestId('wallet-option-w-inv'));

    await user.click(screen.getByTestId('entry-fold-category'));
    const foodTile = await screen.findByTestId('category-tile-cat-food');
    expect(foodTile).toBeInTheDocument();
    expect(foodTile).toHaveAttribute('aria-pressed', 'true');
  });

  it('old entry on investment wallet with hidden category opens with food selected and saves', async () => {
    const user = userEvent.setup();
    const oldEntry: EntryView = {
      id: 'e-old-food',
      walletId: 'w-inv',
      type: 'expense',
      amount: 75_000,
      currency: 'VND',
      categoryId: 'cat-food',
      transferId: null,
      counterpartWalletId: null,
      date: '2026-11-15',
      time: '12:00',
      note: 'Lunch',
      tags: [],
      excludeFromReports: false,
      source: 'manual',
      beforeStart: false,
      createdAt: '2026-11-15T12:00:00Z',
    };

    const { calls } = setup([vndCash, investWallet], {
      extraRoutes: {
        'GET /api/me/personal/transactions': {
          rows: [{ kind: 'entry', entry: oldEntry }],
          totals: [],
        },
        'PATCH /api/me/personal/transactions/e-old-food': {
          entries: [oldEntry],
        },
      },
    });

    renderEntryPage('/entries/e-old-food/edit');

    const foldCat = await screen.findByTestId('entry-fold-category');
    expect(foldCat).toHaveTextContent('Ăn uống');

    await user.click(foldCat);
    const foodTile = await screen.findByTestId('category-tile-cat-food');
    expect(foodTile).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByTestId('entry-save-btn'));
    await waitFor(() => {
      const patchCalls = calls.filter(
        (c) => c.method === 'PATCH' && c.path.endsWith('/api/me/personal/transactions/e-old-food'),
      );
      expect(patchCalls).toHaveLength(1);
      expect(patchCalls[0]!.body).toMatchObject({
        walletId: 'w-inv',
        categoryId: 'cat-food',
        amount: 75_000,
      });
    });
  });

  it('asset picker hides ETF assets overridden off for the selected wallet and lists only Crypto', async () => {
    const user = userEvent.setup();
    setup([vndCash, investWallet]);
    renderEntryPage('/entries/new?type=expense&tile=buy&wallet=w-inv');
    await finishAmount(user, '500000');

    await user.click(await screen.findByTestId('entry-asset-row'));
    await screen.findByTestId('asset-picker-list');
    expect(screen.getByTestId('asset-option-asset-btc')).toBeInTheDocument();
    expect(screen.queryByTestId('asset-option-asset-etf')).toBeNull();
  });

  it('old trade entry whose asset is now hidden in its wallet still shows that asset as selected and saves', async () => {
    const user = userEvent.setup();
    const oldBuy: EntryView = {
      id: 'e-old-etf',
      walletId: 'w-inv',
      type: 'buy',
      amount: 1_000_000,
      currency: 'VND',
      categoryId: null,
      assetId: 'asset-etf',
      quantity: 50,
      transferId: null,
      counterpartWalletId: null,
      date: '2026-11-15',
      time: '10:00',
      note: null,
      tags: [],
      excludeFromReports: false,
      source: 'manual',
      beforeStart: false,
      createdAt: '2026-11-15T10:00:00Z',
    };

    const { calls } = setup([vndCash, investWallet], {
      extraRoutes: {
        'GET /api/me/personal/transactions': {
          rows: [{ kind: 'entry', entry: oldBuy }],
          totals: [],
        },
        'PATCH /api/me/personal/transactions/e-old-etf': {
          entries: [oldBuy],
        },
      },
    });

    renderEntryPage('/entries/e-old-etf/edit');

    await waitFor(() => {
      expect(screen.getByTestId('entry-asset-row')).toHaveTextContent('E1VFVN30');
    });

    await user.click(screen.getByTestId('entry-asset-row'));
    await screen.findByTestId('asset-picker-list');
    expect(screen.getByTestId('asset-option-asset-etf')).toBeInTheDocument();
    expect(screen.getByTestId('asset-option-asset-btc')).toBeInTheDocument();
    await user.click(screen.getByTestId('asset-option-asset-etf'));

    await user.click(screen.getByTestId('entry-save-btn'));
    await waitFor(() => {
      const patchCalls = calls.filter(
        (c) => c.method === 'PATCH' && c.path.endsWith('/api/me/personal/transactions/e-old-etf'),
      );
      expect(patchCalls).toHaveLength(1);
      expect(patchCalls[0]!.body).toMatchObject({
        type: 'buy',
        walletId: 'w-inv',
        assetId: 'asset-etf',
        quantity: 50,
        amount: 1_000_000,
      });
    });
  });
});
