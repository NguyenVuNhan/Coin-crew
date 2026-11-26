import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useParams } from 'react-router';
import type {
  BudgetDef,
  CategoriesResponse,
  CategoryView,
  EntryView,
  SyncEntryRow,
  TagView,
  TripView,
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

const MOCK_TODAY = '2026-11-26'; // Thursday

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
    todayLocal: () => MOCK_TODAY,
    currentMonthLocal: () => '2026-11',
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

const excludedWallet: WalletDetailView = {
  id: 'w-excluded',
  name: 'Ví dự phòng',
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

const coffeeCat: CategoryView = {
  id: 'cat-coffee',
  type: 'expense',
  name: 'Cà phê',
  icon: 'coffee',
  parentId: null,
  sortOrder: 0,
  hidden: false,
};

const otherCat: CategoryView = {
  id: 'cat-other',
  type: 'expense',
  name: 'Khác',
  icon: 'ellipsis',
  parentId: null,
  sortOrder: 1,
  hidden: false,
};

const categoriesResp: CategoriesResponse = {
  categories: [coffeeCat, otherCat],
  recentIds: ['cat-coffee', 'cat-other'],
};

const dalatTag: TagView = {
  id: 'tag-dalat',
  name: 'Đà Lạt',
  useCount: 2,
};

const coffeeBudget: BudgetDef = {
  id: 'b-coffee',
  name: 'Cà phê',
  target: { kind: 'category', categoryId: 'cat-coffee' },
  currency: 'VND',
  periodKind: 'week',
  monthStartDay: null,
  from: null,
  to: null,
  excludedWalletIds: ['w-excluded'],
  limits: [{ effectiveFrom: '2026-10-01', amount: 300_000 }],
  suggestionDismissedUntil: null,
  createdOn: '2026-10-01',
};

const dalatBudget: BudgetDef = {
  id: 'b-dalat',
  name: 'Chuyến Đà Lạt',
  target: { kind: 'tag', tagId: 'tag-dalat' },
  currency: 'VND',
  periodKind: 'once',
  monthStartDay: null,
  from: '2026-11-20',
  to: '2026-11-30',
  excludedWalletIds: [],
  limits: [{ effectiveFrom: '2026-11-20', amount: 1_000_000 }],
  suggestionDismissedUntil: null,
  createdOn: '2026-11-20',
};

function makeSyncEntry(overrides: Partial<SyncEntryRow>): SyncEntryRow {
  return {
    id: 'se-1',
    walletId: 'w-bank',
    type: 'expense',
    amount: 100_000,
    categoryId: 'cat-coffee',
    date: '2026-11-24',
    time: '09:00',
    note: null,
    tagIds: [],
    excludeFromReports: false,
    transferId: null,
    counterpartWalletId: null,
    assetId: null,
    quantity: null,
    createdAt: '2026-11-24T02:00:00Z',
    syncVersion: 1,
    ...overrides,
  };
}

function makeEntryView(overrides: Partial<EntryView> = {}): EntryView {
  return {
    id: 'e-created-1',
    type: 'expense',
    walletId: 'w-bank',
    currency: 'VND',
    amount: 60_000,
    categoryId: 'cat-coffee',
    date: MOCK_TODAY,
    time: '09:00',
    note: null,
    tags: [],
    excludeFromReports: false,
    transferId: null,
    counterpartWalletId: null,
    source: 'manual',
    beforeStart: false,
    createdAt: '2026-11-26T02:00:00Z',
    ...overrides,
  };
}

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
    people: [{ id: 'p-me', name: 'An', status: 'active', isMember: true, bank: 'none' }],
    balances: { 'p-me': 0 },
    suggestions: [],
    expenses: [],
    payments: [],
    myBalance: null,
    approvals: [],
    links: null,
  };
}

function setLocalCopy(entries: SyncEntryRow[]) {
  mockTxCopyState = {
    status: 'ready',
    snapshot: {
      entries,
      tags: [],
      cursor: '1',
      version: 1,
      syncedAt: '2026-11-26T00:00:00Z',
    } as unknown as TxCopySnapshot,
  };
  mockGroupCopyState = {
    status: 'ready',
    snapshot: {
      rows: [],
      syncedAt: '2026-11-26T00:00:00Z',
    } as unknown as GroupCopySnapshot,
  };
}

function BudgetDetailStub() {
  const { id } = useParams<{ id: string }>();
  return <div data-testid="budget-detail-route">Budget {id}</div>;
}

function setupApi(overrides: Record<string, unknown> = {}) {
  return mockApi({
    'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
    'GET /api/trips/t-led': directTripView(),
    'GET /api/trips/t-led/version': { version: 1 },
    'GET /api/me/people/candidates': [],
    'GET /api/me/personal/wallets': { wallets: [bankWallet, excludedWallet] },
    'GET /api/me/personal/categories': categoriesResp,
    'GET /api/me/personal/tags': { tags: [dalatTag] },
    'GET /api/me/personal/group-settings': {
      settings: { defaultGroupCategoryId: null, countLoans: false },
    },
    'GET /api/me/personal/budgets': { budgets: [coffeeBudget, dalatBudget] },
    'GET /api/me/personal/transactions': { rows: [] },
    'POST /api/me/personal/transactions': () =>
      Response.json({ entries: [makeEntryView()] }, { status: 201 }),
    'PATCH /api/me/personal/transactions/e-edit-1': () =>
      Response.json({ entries: [makeEntryView({ id: 'e-edit-1' })] }),
    'DELETE /api/me/personal/transactions/e-created-1': () => Response.json({ ok: true }),
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
              <Route path="/budgets/:id" element={<BudgetDetailStub />} />
              <Route path="/trips" element={<div data-testid="trips-route">Trips</div>} />
            </Routes>
          </NavHistoryProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </PlatformProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  hideUndo();
  setLang('vi');
  mockMedia();
  mockTxCopyState = { status: 'unavailable', snapshot: null };
  mockGroupCopyState = { status: 'unavailable', snapshot: null };
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  hideUndo();
});

describe('EntryPage — budget snackbar ruling, small-amount multiply, tags, and wallet exclusion', () => {
  it('create path shows savedWithBudget AND Undo ("Hoàn tác") deletes the created entry', async () => {
    const user = userEvent.setup();
    setLocalCopy([
      makeSyncEntry({ id: 'se-coffee', categoryId: 'cat-coffee', amount: 160_000, date: '2026-11-24' }),
    ]);
    const { calls } = setupApi();

    renderEntry();
    await finishAmount(user, '60000');
    await user.click(await screen.findByTestId('category-tile-cat-coffee'));
    await screen.findByTestId('entry-budget-warning');

    await user.click(screen.getByTestId('entry-save-btn'));

    expect(await screen.findByText(/Đã lưu\. Cà phê chi nhanh quá/)).toBeInTheDocument();
    const undoBtn = screen.getByRole('button', { name: 'Hoàn tác' });
    await user.click(undoBtn);

    await waitFor(() => {
      expect(
        calls.some(
          (c) => c.method === 'DELETE' && c.path === '/api/me/personal/transactions/e-created-1',
        ),
      ).toBe(true);
    });
  });

  it('edit path shows savedWithBudget AND "Xem" navigates to /budgets/<id>', async () => {
    const user = userEvent.setup();
    const existing = makeEntryView({
      id: 'e-edit-1',
      categoryId: 'cat-coffee',
      amount: 60_000,
      date: MOCK_TODAY,
    });
    setLocalCopy([
      makeSyncEntry({ id: 'se-coffee', categoryId: 'cat-coffee', amount: 160_000, date: '2026-11-24' }),
      makeSyncEntry({ id: 'e-edit-1', categoryId: 'cat-coffee', amount: 60_000, date: MOCK_TODAY }),
    ]);
    setupApi();

    renderEntry('/entries/e-edit-1/edit', { entry: existing });
    await screen.findByTestId('entry-budget-warning');

    await user.click(screen.getByTestId('entry-save-btn'));

    expect(await screen.findByText(/Đã lưu\. Cà phê chi nhanh quá/)).toBeInTheDocument();
    const seeBtn = screen.getByRole('button', { name: 'Xem' });
    await user.click(seeBtn);

    expect(await screen.findByTestId('budget-detail-route')).toHaveTextContent('Budget b-coffee');
  });

  it('recomputes post-save budget snackbar when SmallAmountModal multiplies a 1–999 VND amount', async () => {
    const user = userEvent.setup();
    setLocalCopy([
      makeSyncEntry({ id: 'se-coffee', categoryId: 'cat-coffee', amount: 160_000, date: '2026-11-24' }),
    ]);
    setupApi();

    renderEntry();
    // 60₫ is fine (160.060₫ / (4/7) < 330k), so no warning before save
    await finishAmount(user, '60');
    await user.click(await screen.findByTestId('category-tile-cat-coffee'));
    expect(screen.queryByTestId('entry-budget-warning')).not.toBeInTheDocument();

    // Tapping Lưu opens SmallAmountModal offering 60.000₫
    await user.click(screen.getByTestId('entry-save-btn'));
    const multiplyBtn = await screen.findByRole('button', { name: 'Lưu 60.000₫' });
    await user.click(multiplyBtn);

    // After multiplying to 60.000₫, the snackbar reflects the recomputed fast state
    expect(await screen.findByText(/Đã lưu\. Cà phê chi nhanh quá/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hoàn tác' })).toBeInTheDocument();
  });

  it('shows a tag-targeted budget warning by resolving tag names to tag ids via useTags', async () => {
    const taggedEntry = makeEntryView({
      id: 'e-tag-1',
      categoryId: 'cat-other', // unbudgeted category
      amount: 400_000,
      date: '2026-11-26',
      tags: ['Đà Lạt'],
    });
    setLocalCopy([
      makeSyncEntry({
        id: 'se-dalat',
        categoryId: 'cat-other',
        amount: 750_000,
        date: '2026-11-22',
        tagIds: ['tag-dalat'],
      }),
    ]);
    setupApi();

    // 750k + 400k = 1.150k > 1.000k limit -> over by 150.000₫
    renderEntry('/entries/e-tag-1/edit', { entry: taggedEntry });

    const warning = await screen.findByTestId('entry-budget-warning');
    expect(warning.className).toContain('bg-danger-soft');
    expect(warning).toHaveTextContent('Khoản này làm Chuyến Đà Lạt vượt mức 150.000₫');
  });

  it('hides the warning when switching to a wallet excluded by the budget', async () => {
    const user = userEvent.setup();
    setLocalCopy([
      makeSyncEntry({ id: 'se-coffee', categoryId: 'cat-coffee', amount: 160_000, date: '2026-11-24' }),
    ]);
    setupApi();

    renderEntry();
    await finishAmount(user, '60000');
    await user.click(await screen.findByTestId('category-tile-cat-coffee'));
    expect(await screen.findByTestId('entry-budget-warning')).toBeInTheDocument();

    // Open details and switch wallet to w-excluded (excluded by coffeeBudget)
    await openDetails(user);
    await user.click(screen.getByTestId('entry-wallet-row'));
    await user.click(await screen.findByTestId('wallet-option-w-excluded'));

    await waitFor(() => {
      expect(screen.queryByTestId('entry-budget-warning')).not.toBeInTheDocument();
    });
  });
});
