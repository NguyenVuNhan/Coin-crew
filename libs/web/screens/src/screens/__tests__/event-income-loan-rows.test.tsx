import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import type {
  CategoriesResponse,
  CategoryView,
  EntryView,
  EventView,
  TagView,
  TripView,
  WalletDetailView,
} from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { browserPlatform, PlatformProvider } from '@cc/web-platform';
import { mockApi } from '../../test/render';
import { mockMedia } from '../../test/media';
import { finishAmount, pickPeople } from '../../test/entry';
import { NavHistoryProvider } from '../../lib/navHistory';
import { UndoSnackbarHost, hideUndo } from '../../components/UndoSnackbarHost';
import { EntryPage } from '../EntryPage';

let mockToday = '2026-11-12';

vi.mock('@cc/web-util/localDate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cc/web-util/localDate')>();
  return {
    ...actual,
    todayLocal: () => mockToday,
    currentMonthLocal: () => mockToday.slice(0, 7),
  };
});

const bankWallet: WalletDetailView = {
  id: 'w-bank',
  name: 'Techcombank',
  currency: 'VND',
  balance: 10_000_000,
  isDefault: true,
  kind: 'everyday',
  startAmount: 10_000_000,
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: 10_000_000,
  icon: null,
  sortOrder: 0,
  archived: false,
  entryCount: 0,
};

const cashWallet: WalletDetailView = {
  ...bankWallet,
  id: 'w-cash',
  name: 'Tiền mặt',
  isDefault: false,
  sortOrder: 1,
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
  icon: 'banknote',
  parentId: null,
  sortOrder: 0,
  hidden: false,
};

const lendCat: CategoryView = {
  id: 'u-1:lend',
  type: 'expense',
  name: 'Cho vay',
  icon: 'hand-coins',
  parentId: null,
  sortOrder: 1,
  hidden: false,
};

const borrowCat: CategoryView = {
  id: 'u-1:borrow',
  type: 'income',
  name: 'Đi vay',
  icon: 'hand-coins',
  parentId: null,
  sortOrder: 2,
  hidden: false,
};

const categoriesResp: CategoriesResponse = {
  categories: [foodCat, salaryCat, lendCat, borrowCat],
  recentIds: ['cat-food', 'cat-salary'],
};

const daLatTag: TagView = {
  id: 'tag-dl',
  name: 'Đà Lạt',
  useCount: 1,
};

const daLatEvent: EventView = {
  id: 'ev-dl',
  tagId: 'tag-dl',
  tagName: 'Đà Lạt',
  name: 'Đà Lạt',
  start: '2026-11-12',
  end: '2026-11-14',
  stoppedAt: null,
  countsFrom: '2026-11-05',
  groupIds: [],
  budgetId: null,
  createdAt: '2026-11-05T00:00:00Z',
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
      participantId: 'p-me',
      participantPending: false,
      isOrganiser: true,
    },
    people: [
      { id: 'p-me', name: 'An', status: 'active', isMember: true, bank: 'none' },
      { id: 'p-minh', name: 'Minh', status: 'active', isMember: false, bank: 'none' },
    ],
    balances: { 'p-me': 0, 'p-minh': 0 },
    suggestions: [],
    expenses: [],
    payments: [],
    myBalance: null,
    approvals: [],
    links: null,
  };
}

function makeIncomeEntry(): EntryView {
  return {
    id: 'e-inc-1',
    type: 'income',
    walletId: 'w-bank',
    currency: 'VND',
    amount: 500_000,
    categoryId: 'cat-salary',
    date: mockToday,
    time: '09:00',
    note: null,
    tags: ['Đà Lạt'],
    excludeFromReports: false,
    transferId: null,
    counterpartWalletId: null,
    source: 'manual',
    beforeStart: false,
    createdAt: '2026-11-12T02:00:00Z',
  };
}

function setupApi(events: EventView[] = [daLatEvent]) {
  return mockApi({
    'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
    'GET /api/trips/t-led': directTripView(),
    'GET /api/trips/t-led/version': { version: 1 },
    'GET /api/me/personal/wallets': { wallets: [bankWallet, cashWallet] },
    'GET /api/me/personal/categories': categoriesResp,
    'GET /api/me/personal/tags': { tags: [daLatTag] },
    'GET /api/me/personal/group-settings': {
      settings: { defaultGroupCategoryId: null, countLoans: false },
    },
    'GET /api/me/personal/budgets': { budgets: [] },
    'GET /api/me/personal/events': { events },
    'GET /api/me/personal/transactions': { rows: [] },
    'POST /api/me/personal/transactions': () =>
      Response.json({ entries: [makeIncomeEntry()] }, { status: 201 }),
    'POST /api/trips/t-led/expenses': () =>
      Response.json({ expenseId: 'exp-loan-1' }, { status: 201 }),
    'PUT /api/me/personal/group-links/exp-loan-1': () =>
      Response.json({
        link: {
          walletId: 'w-bank',
          categoryId: 'u-1:lend',
          tagIds: ['tag-dl'],
          intent: 'loan',
          excludeFromReports: false,
        },
      }),
  });
}

function renderEntry(route: string) {
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

describe('EntryPage event rows for income and loan/debt', () => {
  beforeEach(() => {
    setLang('vi');
    localStorage.clear();
    hideUndo();
    mockMedia();
    mockToday = '2026-11-12';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-12T10:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    localStorage.clear();
    hideUndo();
  });

  it('income tab shows the running event row on and saves its tag', async () => {
    const user = userEvent.setup();
    const api = setupApi();

    renderEntry('/entries/new?type=income');

    const row = await screen.findByTestId('entry-event-row');
    expect(row).toHaveTextContent('Đà Lạt');
    expect(screen.getByRole('button', { name: 'Bỏ khỏi Đà Lạt' })).toBeInTheDocument();

    await finishAmount(user, '500000');
    await user.click(await screen.findByTestId('category-tile-cat-salary'));
    await user.click(screen.getByTestId('entry-save-btn'));

    await waitFor(() => {
      const post = api.calls.find(
        (c) => c.method === 'POST' && c.path === '/api/me/personal/transactions',
      );
      expect(post).toBeDefined();
      expect((post?.body as { type?: string; tags?: string[] })).toMatchObject({
        type: 'income',
        tags: ['Đà Lạt'],
      });
    });
  });

  it('loan/debt tab shows the running event row on and the saved loan carries the tag', async () => {
    const user = userEvent.setup();
    const api = setupApi();

    renderEntry('/entries/new?type=loan-debt');

    const row = await screen.findByTestId('entry-event-row');
    expect(row).toHaveTextContent('Đà Lạt');
    expect(screen.getByRole('button', { name: 'Bỏ khỏi Đà Lạt' })).toBeInTheDocument();

    await finishAmount(user, '200000');
    await pickPeople(user, ['Minh']);
    await user.click(screen.getByTestId('entry-save-btn'));

    await waitFor(() => {
      const put = api.calls.find(
        (c) => c.method === 'PUT' && c.path === '/api/me/personal/group-links/exp-loan-1',
      );
      expect(put).toBeDefined();
      expect(put?.body).toMatchObject({
        intent: 'loan',
        tagIds: ['tag-dl'],
      });
    });
  });

  it('removing the event row with ✕ saves income and loan without the tag', async () => {
    const user = userEvent.setup();
    const apiIncome = setupApi();

    const { unmount } = renderEntry('/entries/new?type=income');
    await screen.findByTestId('entry-event-row');
    await finishAmount(user, '300000');
    await user.click(await screen.findByTestId('category-tile-cat-salary'));
    await user.click(screen.getByRole('button', { name: 'Bỏ khỏi Đà Lạt' }));
    await user.click(screen.getByTestId('entry-save-btn'));

    await waitFor(() => {
      const post = apiIncome.calls.find(
        (c) => c.method === 'POST' && c.path === '/api/me/personal/transactions',
      );
      expect(post).toBeDefined();
      expect((post?.body as { tags?: string[] }).tags).toEqual([]);
    });
    unmount();

    const apiLoan = setupApi();
    renderEntry('/entries/new?type=loan-debt');
    await screen.findByTestId('entry-event-row');
    await finishAmount(user, '150000');
    await pickPeople(user, ['Minh']);
    await user.click(screen.getByRole('button', { name: 'Bỏ khỏi Đà Lạt' }));
    await user.click(screen.getByTestId('entry-save-btn'));

    await waitFor(() => {
      const put = apiLoan.calls.find(
        (c) => c.method === 'PUT' && c.path === '/api/me/personal/group-links/exp-loan-1',
      );
      expect(put).toBeDefined();
      expect(put?.body).toMatchObject({
        intent: 'loan',
        tagIds: [],
      });
    });
  });

  it('transfer mode shows no event row', async () => {
    setupApi();

    renderEntry('/entries/new?type=transfer');
    await screen.findByTestId('amount-keypad');
    expect(screen.queryByTestId('entry-event-row')).not.toBeInTheDocument();
  });
});
