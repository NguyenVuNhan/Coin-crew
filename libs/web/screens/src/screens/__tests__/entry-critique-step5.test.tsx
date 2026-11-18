import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { CategoriesResponse, CategoryView, WalletDetailView } from '@cc/core';
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
  name: 'Chứng khoán',
  isDefault: false,
  kind: 'investment',
  sortOrder: 1,
};

const cat = (id: string, name: string, icon: string, parentId: string | null, sortOrder: number): CategoryView => ({
  id,
  type: 'expense',
  name,
  icon,
  parentId,
  sortOrder,
  hidden: false,
});

const categoriesResp: CategoriesResponse = {
  categories: [
    cat('cat-food', 'Ăn uống', 'utensils', null, 0),
    cat('cat-invest', 'Đầu tư', 'trending-up', null, 1),
    cat('cat-stock', 'Cổ phiếu', 'candlestick-chart', 'cat-invest', 0),
  ],
  recentIds: ['cat-stock', 'cat-food'],
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
              <Route path="/trips" element={<div data-testid="trips-route">Trips</div>} />
            </Routes>
          </NavHistoryProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </PlatformProvider>,
  );
}

function setup(wallets: WalletDetailView[]) {
  mockApi({
    'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
    'GET /api/me/personal/categories': categoriesResp,
    'GET /api/me/personal/wallets': { wallets },
  });
}

describe('EntryPage critique step 5 — polish', () => {
  it('tabs are at least 44px tall', async () => {
    setup([vndCash]);
    renderEntryPage('/entries/new?type=expense');
    await screen.findByTestId('amount-display');
    for (const id of ['expense', 'income', 'loan-debt']) {
      expect(screen.getByTestId(`entry-tab-${id}`).className).toContain('min-h-11');
    }
  });

  it('wallet row reads "Từ ví" with the transfer tile, the normal label otherwise', async () => {
    const user = userEvent.setup();
    setup([vndCash, investWallet]);
    renderEntryPage('/entries/new?type=expense');
    await finishAmount(user, '50000');
    await user.click(await screen.findByTestId('category-tile-cat-food'));
    await openDetails(user);
    const row = await screen.findByTestId('entry-wallet-row');
    expect(row).toHaveTextContent('Ví');
    expect(row).not.toHaveTextContent('Từ ví');
    await user.click(screen.getByTestId('entry-fold-category'));
    await user.click(screen.getByTestId('category-tile-transfer'));
    expect(screen.getByTestId('entry-wallet-row')).toHaveTextContent('Từ ví');
    expect(screen.getByTestId('entry-to-wallet-row')).toHaveTextContent('Đến ví');
    await user.click(screen.getByTestId('entry-fold-category'));
    await user.click(screen.getByTestId('category-tile-cat-food'));
    expect(screen.getByTestId('entry-wallet-row')).not.toHaveTextContent('Từ ví');
  });

  it('amount box shows a visible "Số tiền" label while the name is read once', async () => {
    setup([vndCash]);
    renderEntryPage('/entries/new?type=expense');
    const box = await screen.findByTestId('amount-display');
    fireEvent.click(screen.getByTestId('key-8'));
    fireEvent.click(screen.getByTestId('key-5'));
    fireEvent.click(screen.getByTestId('key-000'));
    expect(box).toHaveTextContent('Số tiền');
    expect(box).toHaveAccessibleName('Số tiền: 85.000₫');
    expect(box.querySelector('[aria-hidden="true"]')).toHaveTextContent('Số tiền');
  });

  it('recent tiles skip investing categories on an everyday wallet and re-filter on switch', async () => {
    const user = userEvent.setup();
    setup([vndCash, investWallet]);
    renderEntryPage('/entries/new?type=expense');
    await finishAmount(user, '50000');
    await screen.findByTestId('category-tile-cat-food');
    expect(screen.queryByTestId('category-tile-cat-stock')).toBeNull();
    expect(screen.queryByTestId('category-tile-cat-invest')).toBeNull();

    await user.click(screen.getByTestId('category-tile-cat-food'));
    await openDetails(user);
    await user.click(screen.getByTestId('entry-wallet-row'));
    await user.click(await screen.findByTestId('wallet-option-w-inv'));
    await user.click(screen.getByTestId('entry-fold-category'));
    expect(await screen.findByTestId('category-tile-cat-stock')).toBeInTheDocument();

    await user.click(screen.getByTestId('category-tile-cat-food'));
    await user.click(screen.getByTestId('entry-wallet-row'));
    await user.click(await screen.findByTestId('wallet-option-w-vnd'));
    await user.click(screen.getByTestId('entry-fold-category'));
    expect(screen.queryByTestId('category-tile-cat-stock')).toBeNull();
  });

  it('transfer shows the exclude switch inline without "Thêm chi tiết"; a category keeps it', async () => {
    const user = userEvent.setup();
    setup([vndCash, investWallet]);
    renderEntryPage('/entries/new?type=transfer');
    await finishAmount(user, '50000');
    await user.click(await screen.findByTestId('category-tile-transfer'));
    await openDetails(user);
    const sw = await screen.findByTestId('entry-exclude-switch');
    expect(sw).toBeChecked();
    expect(screen.queryByTestId('entry-more-details-toggle')).toBeNull();
    expect(screen.queryByText('Thêm chi tiết')).toBeNull();

    await user.click(screen.getByTestId('entry-fold-category'));
    await user.click(screen.getByTestId('category-tile-cat-food'));
    expect(screen.getByTestId('entry-more-details-toggle')).toHaveTextContent('Thêm chi tiết');
    expect(screen.queryByTestId('entry-exclude-switch')).toBeNull();
  });
});
