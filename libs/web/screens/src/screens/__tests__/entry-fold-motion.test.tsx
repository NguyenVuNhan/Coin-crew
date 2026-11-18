import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import type {
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
  delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
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

function mockEntryApi() {
  return mockApi({
    'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
    'GET /api/me/personal/wallets': { wallets: [vndCash] },
    'GET /api/me/personal/categories': categoriesResp,
    'GET /api/me/personal/assets': { assets: [] },
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

describe('EntryPage — fold motion view-transition names (Task 5b)', () => {
  it('sets view-transition-name: entry-amt on entry-fold-amount value after Xong and removes amount-display', async () => {
    const user = userEvent.setup();
    mockEntryApi();

    renderEntryPage('/entries/new?type=expense');
    await screen.findByTestId('amount-keypad');
    for (const ch of '120000') {
      await user.click(screen.getByTestId(`key-${ch}`));
    }
    await user.click(screen.getByTestId('key-done'));

    const foldAmt = await screen.findByTestId('entry-fold-amount');
    expect(screen.queryByTestId('amount-display')).toBeNull();
    const amtValue = foldAmt.querySelector<HTMLElement>('[style*="entry-amt"]');
    expect(amtValue).not.toBeNull();
    expect(amtValue?.style.viewTransitionName).toBe('entry-amt');
  });

  it('omits view-transition-name in mouse mode', async () => {
    mockMedia({ mouse: true });
    mockEntryApi();

    renderEntryPage('/entries/new?type=expense');
    await screen.findByTestId('amount-display');

    expect(screen.getByTestId('entry-tab-expense').style.viewTransitionName).toBe('');
  });

  it('calls document.startViewTransition exactly once per tap on entry-tab-income', async () => {
    const user = userEvent.setup();
    mockEntryApi();

    const startViewTransition = vi.fn((cb: () => void) => {
      queueMicrotask(cb);
      return {} as ViewTransition;
    });
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      writable: true,
      value: startViewTransition,
    });

    renderEntryPage('/entries/new?type=expense');
    await screen.findByTestId('amount-keypad');

    await user.click(screen.getByTestId('entry-tab-income'));

    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('entry-tab-income')).toHaveAttribute('aria-selected', 'true');
  });

  it('renders entry-fold-details with wrapping muted summary on the left and non-wrapping primary action on the right', async () => {
    const user = userEvent.setup();
    mockEntryApi();

    renderEntryPage('/entries/new?type=expense');
    await screen.findByTestId('amount-keypad');
    for (const ch of '120000') {
      await user.click(screen.getByTestId(`key-${ch}`));
    }
    await user.click(screen.getByTestId('key-done'));
    await screen.findByTestId('entry-fold-amount');
    await user.click(screen.getByTestId('category-tile-cat-food'));

    const detailsFold = await screen.findByTestId('entry-fold-details');
    const spans = detailsFold.querySelectorAll<HTMLElement>(':scope > span');
    expect(spans).toHaveLength(2);
    expect(spans[0]).toHaveTextContent('Hôm nay · Tiền mặt · Không ghi chú');
    expect(spans[0]).toHaveClass('text-sm', 'text-muted-foreground');
    expect(spans[0]).not.toHaveClass('truncate');
    expect(spans[1]).toHaveTextContent('Thêm chi tiết');
    expect(spans[1]).toHaveClass('text-sm', 'font-medium', 'text-primary', 'whitespace-nowrap');
  });

  it('never calls document.startViewTransition on a category click in mouse mode (M1)', async () => {
    const user = userEvent.setup();
    mockMedia({ mouse: true });
    mockEntryApi();

    const startViewTransition = vi.fn((cb: () => void) => {
      cb();
      return {} as ViewTransition;
    });
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      writable: true,
      value: startViewTransition,
    });

    renderEntryPage('/entries/new?type=expense');
    await screen.findByTestId('category-grid');
    await user.click(screen.getByTestId('category-tile-cat-food'));

    expect(startViewTransition).not.toHaveBeenCalled();
  });
});
