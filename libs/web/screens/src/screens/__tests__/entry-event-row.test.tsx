import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import type {
  BudgetDef,
  CategoriesResponse,
  CategoryView,
  EntryView,
  SyncEntryRow,
  TagView,
  EventView,
  WalletDetailView,
} from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { browserPlatform, PlatformProvider } from '@cc/web-platform';
import type { TxCopyStatus } from '@cc/web-data-access/txCopy/hooks';
import type { TxCopySnapshot } from '@cc/web-data-access/txCopy/store';
import type { GroupCopySnapshot } from '@cc/web-data-access/txCopy/groupCopy';
import { mockApi } from '../../test/render';
import { mockMedia } from '../../test/media';
import { finishAmount, openDetails } from '../../test/entry';
import { NavHistoryProvider } from '../../lib/navHistory';
import { UndoSnackbarHost, hideUndo } from '../../components/UndoSnackbarHost';
import { EntryPage } from '../EntryPage';

let mockToday = '2026-11-12';

let mockTxCopyState: { status: TxCopyStatus; snapshot: TxCopySnapshot | null } = {
  status: 'unavailable',
  snapshot: null,
};

let mockGroupCopyState: {
  status: 'opening' | 'ready' | 'unavailable';
  snapshot: GroupCopySnapshot | null;
} = {
  status: 'unavailable',
  snapshot: null,
};

vi.mock('@cc/web-util/localDate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cc/web-util/localDate')>();
  return {
    ...actual,
    todayLocal: () => mockToday,
    currentMonthLocal: () => mockToday.slice(0, 7),
  };
});

vi.mock('@cc/web-data-access/txCopy/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cc/web-data-access/txCopy/hooks')>();
  return {
    ...actual,
    useTxCopy: () => mockTxCopyState,
  };
});

vi.mock('@cc/web-data-access/txCopy/groupCopy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cc/web-data-access/txCopy/groupCopy')>();
  return {
    ...actual,
    useGroupCopy: () => mockGroupCopyState,
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

const categoriesResp: CategoriesResponse = {
  categories: [foodCat, salaryCat],
  recentIds: ['cat-food', 'cat-salary'],
};

const daLatTag: TagView = {
  id: 'tag-dl',
  name: 'Đà Lạt',
  useCount: 1,
};

const coffeeTag: TagView = {
  id: 'tag-cf',
  name: 'Cà phê',
  useCount: 1,
};

const daLatTrip: EventView = {
  id: 'tr-dl',
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

const daLatBudget: BudgetDef = {
  id: 'b-dl',
  name: 'Đà Lạt',
  target: { kind: 'tag', tagId: 'tag-dl' },
  currency: 'VND',
  periodKind: 'once',
  monthStartDay: null,
  from: '2026-11-05',
  to: '2026-11-14',
  excludedWalletIds: [],
  limits: [{ effectiveFrom: '2026-11-05', amount: 500_000 }],
  suggestionDismissedUntil: null,
  createdOn: '2026-11-05',
};

function makeEntryView(overrides: Partial<EntryView> = {}): EntryView {
  return {
    id: 'e-1',
    type: 'expense',
    walletId: 'w-bank',
    currency: 'VND',
    amount: 120_000,
    categoryId: 'cat-food',
    date: mockToday,
    time: '09:00',
    note: null,
    tags: [],
    excludeFromReports: false,
    transferId: null,
    counterpartWalletId: null,
    source: 'manual',
    beforeStart: false,
    createdAt: '2026-11-12T02:00:00Z',
    ...overrides,
  };
}

function makeSyncEntry(overrides: Partial<SyncEntryRow>): SyncEntryRow {
  return {
    id: 'se-1',
    walletId: 'w-bank',
    type: 'expense',
    amount: 450_000,
    categoryId: 'cat-food',
    date: '2026-11-12',
    time: '09:00',
    note: null,
    tagIds: ['tag-dl'],
    excludeFromReports: false,
    transferId: null,
    counterpartWalletId: null,
    assetId: null,
    quantity: null,
    createdAt: '2026-11-12T02:00:00Z',
    syncVersion: 1,
    ...overrides,
  };
}

function setLocalCopy(entries: SyncEntryRow[]) {
  mockTxCopyState = {
    status: 'ready',
    snapshot: {
      entries,
      tags: [daLatTag, coffeeTag],
      cursor: '1',
      version: 1,
      syncedAt: '2026-11-12T00:00:00Z',
    } as unknown as TxCopySnapshot,
  };
  mockGroupCopyState = {
    status: 'ready',
    snapshot: {
      rows: [],
      syncedAt: '2026-11-12T00:00:00Z',
    } as unknown as GroupCopySnapshot,
  };
}

function setupApi({
  events = [daLatTrip],
  budgets = [],
  tags = [daLatTag, coffeeTag],
  entries = [],
  overrides = {},
}: {
  events?: EventView[];
  budgets?: BudgetDef[];
  tags?: TagView[];
  entries?: EntryView[];
  overrides?: Record<string, unknown>;
} = {}) {
  return mockApi({
    'GET /api/me/personal/wallets': { wallets: [bankWallet, cashWallet] },
    'GET /api/me/personal/categories': categoriesResp,
    'GET /api/me/personal/tags': { tags },
    'GET /api/me/personal/group-settings': {
      settings: { defaultGroupCategoryId: null, countLoans: false },
    },
    'GET /api/me/personal/budgets': { budgets },
    'GET /api/me/personal/events': { events },
    'GET /api/me/personal/transactions': {
      rows: entries.map((entry) => ({ kind: 'entry', entry })),
    },
    'POST /api/me/personal/transactions': () =>
      Response.json({ entries: [makeEntryView()] }, { status: 201 }),
    ...Object.fromEntries(
      entries.map((entry) => [
        `PATCH /api/me/personal/transactions/${entry.id}`,
        () => Response.json({ entries: [entry] }, { status: 200 }),
      ]),
    ),
    ...overrides,
  });
}

function renderEntry(route = '/entries/new?type=expense', state?: unknown) {
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
            { pathname, search: search ? `?${search}` : '', state },
          ]}
          initialIndex={1}
        >
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

async function changeDate(user: ReturnType<typeof userEvent.setup>, nextDate: string) {
  if (!screen.queryByTestId('entry-date-overlay-value')) {
    await openDetails(user);
  }
  const input = await screen.findByTestId('entry-date-overlay-value');
  fireEvent.change(input, { target: { value: nextDate } });
}

function setMockDate(ymd: string) {
  mockToday = ymd;
  vi.setSystemTime(new Date(`${ymd}T10:00:00`));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  setMockDate('2026-11-12');
  localStorage.clear();
  hideUndo();
  setLang('vi');
  mockMedia();
  mockTxCopyState = { status: 'unavailable', snapshot: null };
  mockGroupCopyState = { status: 'unavailable', snapshot: null };
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
  hideUndo();
});

describe('EntryPage — trip row (Task 10)', () => {
  it('new expense during a trip saves with the trip tag', async () => {
    const user = userEvent.setup();
    const api = setupApi();

    renderEntry();
    const row = await screen.findByTestId('entry-event-row');
    expect(row).toHaveTextContent('Đà Lạt');

    await finishAmount(user, '120000');
    await user.click(await screen.findByTestId('category-tile-cat-food'));
    await user.click(screen.getByTestId('entry-save-btn'));

    await waitFor(() => {
      const post = api.calls.find(
        (c) => c.method === 'POST' && c.path === '/api/me/personal/transactions',
      );
      expect(post).toBeDefined();
      expect((post?.body as { tags?: string[] }).tags).toEqual(['Đà Lạt']);
    });
  });

  it('✕ removes it and saves without', async () => {
    const user = userEvent.setup();
    const api = setupApi();

    renderEntry();
    await screen.findByTestId('entry-event-row');

    await finishAmount(user, '120000');
    await user.click(await screen.findByTestId('category-tile-cat-food'));

    const removeBtn = screen.getByRole('button', { name: 'Bỏ khỏi Đà Lạt' });
    await user.click(removeBtn);

    expect(screen.getByTestId('entry-event-row')).toHaveTextContent('Thêm vào Đà Lạt');

    await user.click(screen.getByTestId('entry-save-btn'));

    await waitFor(() => {
      const post = api.calls.find(
        (c) => c.method === 'POST' && c.path === '/api/me/personal/transactions',
      );
      expect(post).toBeDefined();
      expect((post?.body as { tags?: string[] }).tags).toEqual([]);
    });
  });

  it('lead-up date shows the suggestion and + adds the tag', async () => {
    setMockDate('2026-11-08'); // inside countsFrom..start-1
    const user = userEvent.setup();
    const api = setupApi();

    renderEntry();
    const row = await screen.findByTestId('entry-event-row');
    expect(row).toHaveTextContent('Thêm vào Đà Lạt');

    await finishAmount(user, '350000');
    await user.click(await screen.findByTestId('category-tile-cat-food'));

    await user.click(screen.getByTestId('entry-event-row'));
    expect(screen.getByTestId('entry-event-row')).toHaveTextContent('Đà Lạt');

    await user.click(screen.getByTestId('entry-save-btn'));

    await waitFor(() => {
      const post = api.calls.find(
        (c) => c.method === 'POST' && c.path === '/api/me/personal/transactions',
      );
      expect(post).toBeDefined();
      expect((post?.body as { tags?: string[] }).tags).toEqual(['Đà Lạt']);
    });
  });

  it('date outside any trip shows no row', async () => {
    setMockDate('2026-11-01'); // before countsFrom
    setupApi();

    renderEntry();
    await screen.findByTestId('amount-keypad');
    await waitFor(() => {
      expect(screen.queryByTestId('entry-event-row')).not.toBeInTheDocument();
    });
  });

  it('date changes across boundaries: during → lead-up → outside → during', async () => {
    const user = userEvent.setup();
    setupApi();

    renderEntry();
    // 1. during (2026-11-12) -> pre-filled on
    expect(await screen.findByTestId('entry-event-row')).toHaveTextContent('Đà Lạt');

    await finishAmount(user, '50000');
    await user.click(await screen.findByTestId('category-tile-cat-food'));

    // 2. lead-up (2026-11-08) -> suggestion
    await changeDate(user, '2026-11-08');
    expect(screen.getByTestId('entry-event-row')).toHaveTextContent('Thêm vào Đà Lạt');

    // 3. outside (2026-11-01) -> hidden
    await changeDate(user, '2026-11-01');
    expect(screen.queryByTestId('entry-event-row')).not.toBeInTheDocument();

    // 4. back to during (2026-11-13) -> pre-filled on again
    await changeDate(user, '2026-11-13');
    expect(screen.getByTestId('entry-event-row')).toHaveTextContent('Đà Lạt');
  });

  it('✕ survives a date change within the same trip', async () => {
    const user = userEvent.setup();
    const api = setupApi();

    renderEntry();
    await screen.findByTestId('entry-event-row');

    await finishAmount(user, '80000');
    await user.click(await screen.findByTestId('category-tile-cat-food'));

    // Remove the pre-filled trip tag
    await user.click(screen.getByRole('button', { name: 'Bỏ khỏi Đà Lạt' }));
    expect(screen.getByTestId('entry-event-row')).toHaveTextContent('Thêm vào Đà Lạt');

    // Change date to another day inside the same trip (2026-11-13)
    await changeDate(user, '2026-11-13');
    expect(screen.getByTestId('entry-event-row')).toHaveTextContent('Thêm vào Đà Lạt');

    await user.click(screen.getByTestId('entry-save-btn'));
    await waitFor(() => {
      const post = api.calls.find(
        (c) => c.method === 'POST' && c.path === '/api/me/personal/transactions',
      );
      expect(post).toBeDefined();
      expect((post?.body as { tags?: string[] }).tags).toEqual([]);
    });
  });

  it('editing an old expense into the trip dates does not add the tag', async () => {
    const user = userEvent.setup();
    const oldEntry = makeEntryView({
      id: 'e-old',
      date: '2026-11-01',
      tags: ['Cà phê'],
    });
    const api = setupApi({ entries: [oldEntry] });

    renderEntry('/entries/e-old/edit', { entry: oldEntry });

    // Outside trip initially -> no row
    await screen.findByTestId('entry-save-btn');
    expect(screen.queryByTestId('entry-event-row')).not.toBeInTheDocument();

    // Move date into the trip dates (2026-11-13)
    await changeDate(user, '2026-11-13');

    // Row shows as off (suggestion), NOT pre-filled on
    expect(screen.getByTestId('entry-event-row')).toHaveTextContent('Thêm vào Đà Lạt');

    await user.click(screen.getByTestId('entry-save-btn'));
    await waitFor(() => {
      const patch = api.calls.find(
        (c) => c.method === 'PATCH' && c.path === '/api/me/personal/transactions/e-old',
      );
      expect(patch).toBeDefined();
      expect((patch?.body as { tags?: string[] }).tags).toEqual(['Cà phê']);
    });
  });

  it('editing a tagged expense and tapping ✕ removes only the trip tag', async () => {
    const user = userEvent.setup();
    const taggedEntry = makeEntryView({
      id: 'e-tagged',
      date: '2026-11-13',
      tags: ['Đà Lạt', 'Cà phê'],
    });
    const api = setupApi({ entries: [taggedEntry] });

    renderEntry('/entries/e-tagged/edit', { entry: taggedEntry });

    expect(await screen.findByTestId('entry-event-row')).toHaveTextContent('Đà Lạt');
    await user.click(screen.getByRole('button', { name: 'Bỏ khỏi Đà Lạt' }));
    await user.click(screen.getByTestId('entry-save-btn'));

    await waitFor(() => {
      const patch = api.calls.find(
        (c) => c.method === 'PATCH' && c.path === '/api/me/personal/transactions/e-tagged',
      );
      expect(patch).toBeDefined();
      expect((patch?.body as { tags?: string[] }).tags).toEqual(['Cà phê']);
    });
  });

  it('income and transfer show no row', async () => {
    setupApi();

    const { unmount } = renderEntry('/entries/new?type=income');
    await screen.findByTestId('amount-keypad');
    expect(screen.queryByTestId('entry-event-row')).not.toBeInTheDocument();
    unmount();

    renderEntry('/entries/new?type=transfer');
    await screen.findByTestId('amount-keypad');
    expect(screen.queryByTestId('entry-event-row')).not.toBeInTheDocument();
  });

  it('budget warning counts the trip tag', async () => {
    const user = userEvent.setup();
    setLocalCopy([makeSyncEntry({ amount: 450_000, date: '2026-11-12', tagIds: ['tag-dl'] })]);
    setupApi({
      events: [{ ...daLatTrip, budgetId: 'b-dl' }],
      budgets: [daLatBudget],
    });

    renderEntry();
    await screen.findByTestId('entry-event-row');

    await finishAmount(user, '100000');
    await user.click(await screen.findByTestId('category-tile-cat-food'));

    // 450k + 100k = 550k > 500k trip budget -> warning appears
    expect(await screen.findByTestId('entry-budget-warning')).toBeInTheDocument();

    // Tapping ✕ removes the trip tag from budgetDraft -> warning disappears
    await user.click(screen.getByRole('button', { name: 'Bỏ khỏi Đà Lạt' }));
    await waitFor(() => {
      expect(screen.queryByTestId('entry-budget-warning')).not.toBeInTheDocument();
    });
  });
});
