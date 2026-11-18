import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import type { CategoriesResponse, CategoryView, EntryView, TagView, WalletDetailView } from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { browserPlatform, PlatformProvider } from '@cc/web-platform';
import { writeLastWallet } from '@cc/web-data-access/personalMoney';
import { renderAt, mockApi } from '../../test/render';
import { finishAmount, openDetails } from '../../test/entry';
import { NavHistoryProvider } from '../../lib/navHistory';
import { EntryPage } from '../../screens/EntryPage';
import { AppNav } from '../AppNav';
import { UndoSnackbarHost, hideUndo } from '../UndoSnackbarHost';

beforeEach(() => {
  localStorage.clear();
  hideUndo();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  hideUndo();
});

const vndCash: WalletDetailView = {
  id: 'w-vnd',
  name: 'Cash',
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

const usdWallet: WalletDetailView = {
  id: 'w-usd',
  name: 'USD Card',
  currency: 'USD',
  balance: 500_00,
  isDefault: false,
  kind: 'everyday',
  startAmount: 500_00,
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: null,
  icon: null,
  sortOrder: 2,
  archived: false,
  entryCount: 0,
};

const usdtWallet: WalletDetailView = {
  id: 'w-usdt',
  name: 'USDT',
  currency: 'USDT',
  balance: 100_00,
  isDefault: false,
  kind: 'investment',
  startAmount: 100_00,
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: null,
  icon: null,
  sortOrder: 3,
  archived: false,
  entryCount: 0,
};

const categories: CategoryView[] = [
  { id: 'c-food', parentId: null, type: 'expense', name: 'Food', icon: 'utensils', hidden: false, sortOrder: 0 },
  { id: 'c-move', parentId: null, type: 'expense', name: 'Transport', icon: 'bus', hidden: false, sortOrder: 1 },
  { id: 'c-shop', parentId: null, type: 'expense', name: 'Shopping', icon: 'shopping-bag', hidden: false, sortOrder: 2 },
  { id: 'c-bill', parentId: null, type: 'expense', name: 'Bills', icon: 'receipt', hidden: false, sortOrder: 3 },
  { id: 'c-health', parentId: null, type: 'expense', name: 'Health', icon: 'heart-pulse', hidden: false, sortOrder: 4 },
  { id: 'c-invest', parentId: null, type: 'expense', name: 'Invest', icon: 'trending-up', hidden: false, sortOrder: 5 },
  { id: 'c-crypto', parentId: 'c-invest', type: 'expense', name: 'Crypto', icon: 'coins', hidden: false, sortOrder: 0 },
  { id: 'c-hidden', parentId: null, type: 'expense', name: 'Hidden', icon: 'receipt', hidden: true, sortOrder: 6 },
  { id: 'c-salary', parentId: null, type: 'income', name: 'Salary', icon: 'wallet', hidden: false, sortOrder: 0 },
];

const categoriesRes: CategoriesResponse = {
  categories,
  recentIds: ['c-health', 'c-bill'],
};

const tagsList: TagView[] = [
  { id: 't-1', name: 'coffee', useCount: 5 },
  { id: 't-2', name: 'coworkers', useCount: 3 },
  { id: 't-3', name: 'travel', useCount: 2 },
];

function todayYmd(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderEntryPage(route = '/entries/new?type=expense') {
  setLang('en');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <PlatformProvider platform={browserPlatform}>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[route]}>
          <NavHistoryProvider>
            <UndoSnackbarHost />
            <Routes>
              <Route path="/entries/new" element={<EntryPage />} />
              <Route path="/entries/:id/edit" element={<EntryPage />} />
              <Route path="*" element={null} />
            </Routes>
            <LocationProbe />
          </NavHistoryProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </PlatformProvider>,
  );
}

describe('EntryPage and AddMenu', () => {
  it('exclude switch starts on for transfer and off for expense', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me/personal/wallets': { wallets: [vndCash, vndBank] },
      'GET /api/me/personal/categories': categoriesRes,
      'GET /api/me/personal/tags': { tags: [] },
    });

    const { unmount } = renderEntryPage('/entries/new?type=expense');
    await finishAmount(user, '50000');
    await user.click(await screen.findByTestId('category-tile-c-food'));
    await openDetails(user);
    await screen.findByTestId('entry-more-details-toggle');
    await user.click(screen.getByTestId('entry-more-details-toggle'));
    expect(screen.getByTestId('entry-exclude-switch')).toHaveAttribute('aria-checked', 'false');
    unmount();

    renderEntryPage('/entries/new?type=transfer');
    await finishAmount(user, '50000');
    await user.click(await screen.findByTestId('category-tile-transfer'));
    await openDetails(user);
    // Step 5: transfers show the switch inline, with no "Thêm chi tiết" toggle.
    await screen.findByTestId('entry-exclude-switch');
    expect(screen.getByTestId('entry-exclude-switch')).toHaveAttribute('aria-checked', 'true');
  });
});
