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
import { finishAmount } from '../../test/entry';
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

const investmentWallet: WalletDetailView = {
  id: 'w-inv',
  name: 'Binance',
  currency: 'VND',
  balance: 50_000_000,
  isDefault: true,
  kind: 'investment',
  startAmount: 50_000_000,
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: 50_000_000,
  icon: null,
  sortOrder: 0,
  archived: false,
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

const btcLotAsset: AssetView = {
  id: 'asset-btc',
  name: 'BTC',
  unit: '',
  groupName: 'Crypto',
  decimals: 4,
  hidden: false,
  sortOrder: 0,
  entryCount: 1,
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

describe('EntryPage — trade polish (#132)', () => {
  it('renders trade amount with neutral tone (no text-danger) and muted wallet chip', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
      'GET /api/me/personal/wallets': { wallets: [investmentWallet] },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/me/personal/assets': { assets: [btcLotAsset] },
      'GET /api/trips/t-led': directTripView(),
      'GET /api/me/people/candidates': [],
    });

    renderEntryPage('/entries/new?type=expense&tile=buy&wallet=w-inv');
    await screen.findByTestId('amount-keypad');
    await user.click(screen.getByTestId('key-1'));
    await user.click(screen.getByTestId('key-0'));
    await user.click(screen.getByTestId('key-0'));
    await user.click(screen.getByTestId('key-000'));

    const amountDisplay = screen.getByTestId('amount-display');
    expect(amountDisplay.querySelector('.text-danger')).toBeNull();
    expect(amountDisplay.querySelector('.fsl-amount--neutral')).not.toBeNull();

    const walletChip = screen.getByTestId('amount-wallet-chip');
    expect(walletChip).toHaveClass('bg-muted');
    expect(walletChip).not.toHaveClass('bg-warning-soft');
  });

  it('shows a single oversell alert with remaining qty, fixQuantity disabled reason, and does not double-announce', async () => {
    const user = userEvent.setup();
    const holding: HoldingView = {
      walletId: 'w-inv',
      assetId: 'asset-btc',
      quantity: 300, // 0,03 BTC (lot asset, decimals 4)
      cost: 30_000_000,
      costVnd: 30_000_000,
    };

    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
      'GET /api/me/personal/wallets': { wallets: [investmentWallet] },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/me/personal/assets': { assets: [btcLotAsset] },
      'GET /api/me/personal/holdings': { holdings: [holding] },
      'GET /api/trips/t-led': directTripView(),
      'GET /api/me/people/candidates': [],
    });

    renderEntryPage('/entries/new?type=income&tile=sell&wallet=w-inv');
    await finishAmount(user, '50000000');
    await user.click(await screen.findByTestId('entry-asset-row'));
    await user.click(await screen.findByTestId('asset-option-asset-btc'));

    // 500 lots of 0,0001 = 0,05 BTC > 0,03 BTC held
    await user.type(screen.getByTestId('entry-quantity'), '500');

    expect(screen.getByTestId('entry-quantity-error')).toHaveTextContent('Chỉ còn 0,03 BTC');
    const oversellAlerts = screen
      .getAllByRole('alert')
      .filter((el) => el.textContent?.includes('Chỉ còn'));
    expect(oversellAlerts).toHaveLength(1);
    expect(screen.getByTestId('trade-disabled-reason')).toHaveTextContent('Sửa số lượng để lưu');
    expect(screen.getByTestId('entry-save-btn')).toBeDisabled();

    // Wait past the live announcer's 50ms tick to verify announce is not called with 'Chỉ còn'
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(screen.getByTestId('entry-live-region')).not.toHaveTextContent('Chỉ còn');
  });

  it('shows a single oversell alert and fixQuantity reason when editing an existing sell', async () => {
    const user = userEvent.setup();
    const existingSell: EntryView = {
      id: 'e-sell-edit',
      walletId: 'w-inv',
      type: 'sell',
      amount: 20_000_000,
      currency: 'VND',
      categoryId: null,
      assetId: 'asset-btc',
      quantity: 200, // 0,02 BTC
      transferId: null,
      counterpartWalletId: null,
      date: '2026-11-15',
      time: '10:30',
      note: null,
      tags: [],
      excludeFromReports: false,
      source: 'manual',
      beforeStart: false,
      createdAt: '2026-11-15T10:30:00Z',
    };
    const remainingHolding: HoldingView = {
      walletId: 'w-inv',
      assetId: 'asset-btc',
      quantity: 100, // 0,01 BTC remaining + 0,02 BTC from this sell = 0,03 BTC available
      cost: 10_000_000,
      costVnd: 10_000_000,
    };

    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
      'GET /api/me/personal/wallets': { wallets: [investmentWallet] },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/me/personal/assets': { assets: [btcLotAsset] },
      'GET /api/me/personal/holdings': { holdings: [remainingHolding] },
      'GET /api/me/personal/transactions': {
        rows: [{ kind: 'entry', entry: existingSell }],
        totals: [],
      },
      'GET /api/trips/t-led': directTripView(),
      'GET /api/me/people/candidates': [],
    });

    renderEntryPage('/entries/e-sell-edit/edit');
    const qtyInput = await screen.findByTestId('entry-quantity');
    await waitFor(() => {
      expect(qtyInput).toHaveValue('200');
    });

    await user.clear(qtyInput);
    await user.type(qtyInput, '500');

    expect(screen.getByTestId('entry-quantity-error')).toHaveTextContent('Chỉ còn 0,03 BTC');
    const oversellAlerts = screen
      .getAllByRole('alert')
      .filter((el) => el.textContent?.includes('Chỉ còn'));
    expect(oversellAlerts).toHaveLength(1);
    expect(screen.getByTestId('trade-disabled-reason')).toHaveTextContent('Sửa số lượng để lưu');
    expect(screen.getByTestId('entry-save-btn')).toBeDisabled();

    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(screen.getByTestId('entry-live-region')).not.toHaveTextContent('Chỉ còn');
  });

  it('closes the docked keypad and focuses the quantity input after picking an asset', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
      'GET /api/me/personal/wallets': { wallets: [investmentWallet] },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/me/personal/assets': { assets: [btcLotAsset] },
      'GET /api/trips/t-led': directTripView(),
      'GET /api/me/people/candidates': [],
    });

    renderEntryPage('/entries/new?type=expense&tile=buy&wallet=w-inv');
    await finishAmount(user, '100000');
    await user.click(await screen.findByTestId('entry-asset-row'));
    await user.click(await screen.findByTestId('asset-option-asset-btc'));

    expect(screen.queryByTestId('amount-keypad')).toBeNull();
    await waitFor(() => {
      expect(screen.getByTestId('entry-quantity')).toHaveFocus();
    });
  });
});
