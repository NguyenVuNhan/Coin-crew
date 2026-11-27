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
import { finishAmount, pickPeople } from '../../test/entry';
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

const foodCat: CategoryView = {
  id: 'cat-food',
  type: 'expense',
  name: 'Ăn uống',
  icon: 'utensils',
  parentId: null,
  sortOrder: 0,
  hidden: false,
};

const coffeeCat: CategoryView = {
  id: 'cat-coffee',
  type: 'expense',
  name: 'Cà phê',
  icon: 'coffee',
  parentId: 'cat-food',
  sortOrder: 1,
  hidden: false,
};

const shoppingCat: CategoryView = {
  id: 'cat-shopping',
  type: 'expense',
  name: 'Mua sắm',
  icon: 'shopping-bag',
  parentId: null,
  sortOrder: 2,
  hidden: false,
};

const unbudgetedCat: CategoryView = {
  id: 'cat-other',
  type: 'expense',
  name: 'Khác',
  icon: 'ellipsis',
  parentId: null,
  sortOrder: 3,
  hidden: false,
};

const categoriesResp: CategoriesResponse = {
  categories: [foodCat, coffeeCat, shoppingCat, unbudgetedCat],
  recentIds: ['cat-food', 'cat-coffee', 'cat-shopping', 'cat-other'],
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
  excludedWalletIds: [],
  limits: [{ effectiveFrom: '2026-10-01', amount: 300_000 }],
  suggestionDismissedUntil: null,
  createdOn: '2026-10-01',
};

const foodBudget: BudgetDef = {
  id: 'b-food',
  name: 'Ăn uống',
  target: { kind: 'category', categoryId: 'cat-food' },
  currency: 'VND',
  periodKind: 'month',
  monthStartDay: 1,
  from: null,
  to: null,
  excludedWalletIds: [],
  limits: [{ effectiveFrom: '2026-10-01', amount: 3_000_000 }],
  suggestionDismissedUntil: null,
  createdOn: '2026-10-01',
};

const shoppingBudget: BudgetDef = {
  id: 'b-shopping',
  name: 'Mua sắm',
  target: { kind: 'category', categoryId: 'cat-shopping' },
  currency: 'VND',
  periodKind: 'month',
  monthStartDay: 1,
  from: null,
  to: null,
  excludedWalletIds: [],
  limits: [{ effectiveFrom: '2026-10-01', amount: 1_000_000 }],
  suggestionDismissedUntil: null,
  createdOn: '2026-10-01',
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
    id: 'e-new',
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

function setupApi(
  budgets: BudgetDef[] = [coffeeBudget, foodBudget, shoppingBudget],
  overrides: Record<string, unknown> = {},
) {
  return mockApi({
    'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
    'GET /api/trips/t-led': directTripView(),
    'GET /api/trips/t-led/version': { version: 1 },
    'GET /api/me/people/candidates': [],
    'GET /api/me/personal/wallets': { wallets: [bankWallet] },
    'GET /api/me/personal/categories': categoriesResp,
    'GET /api/me/personal/tags': { tags: [] },
    'GET /api/me/personal/group-settings': {
      settings: { defaultGroupCategoryId: null, countLoans: false },
    },
    'GET /api/me/personal/budgets': { budgets },
    'GET /api/me/personal/transactions': { rows: [] },
    'POST /api/me/personal/transactions': () =>
      Response.json({ entries: [makeEntryView()] }, { status: 201 }),
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

describe('EntryPage — live budget warning and post-save snackbar (Task 11)', () => {
  it('renders nothing for a fine budget or an unbudgeted category', async () => {
    const user = userEvent.setup();
    setLocalCopy([]);
    setupApi();

    renderEntry();
    await finishAmount(user, '20000');
    await user.click(await screen.findByTestId('category-tile-cat-coffee'));

    // 20k out of 300k weekly on Thursday is fine -> no warning
    expect(screen.queryByTestId('entry-budget-warning')).not.toBeInTheDocument();

    // Switch to unbudgeted category -> still no warning
    await user.click(screen.getByTestId('entry-fold-category'));
    await user.click(await screen.findByTestId('category-tile-cat-other'));
    expect(screen.queryByTestId('entry-budget-warning')).not.toBeInTheDocument();
  });

  it('shows the fast warning block for 60.000 in Cà phê (weekly 300.000, spent 160.000, Thursday) and keeps Lưu enabled', async () => {
    const user = userEvent.setup();
    setLocalCopy([
      makeSyncEntry({ id: 'se-coffee', categoryId: 'cat-coffee', amount: 160_000, date: '2026-11-24' }),
    ]);
    setupApi();

    renderEntry();
    await finishAmount(user, '60000');
    await user.click(await screen.findByTestId('category-tile-cat-coffee'));

    const warning = await screen.findByTestId('entry-budget-warning');
    expect(warning).toHaveAttribute('role', 'status');
    expect(warning.className).toContain('bg-warning-soft');
    expect(warning).toHaveTextContent('Khoản này làm Cà phê chi nhanh quá');
    expect(warning).toHaveTextContent('80.000₫');
    expect(warning).toHaveTextContent('20.000₫ mỗi ngày');

    // Save button stays enabled
    expect(screen.getByTestId('entry-save-btn')).toBeEnabled();
  });

  it('shows the over warning block for 1.200.000 in Ăn uống with "vượt mức 330.000₫"', async () => {
    const user = userEvent.setup();
    setLocalCopy([
      makeSyncEntry({ id: 'se-food', categoryId: 'cat-food', amount: 2_130_000, date: '2026-11-15' }),
    ]);
    setupApi();

    renderEntry();
    await finishAmount(user, '1200000');
    await user.click(await screen.findByTestId('category-tile-cat-food'));

    const warning = await screen.findByTestId('entry-budget-warning');
    expect(warning).toHaveAttribute('role', 'status');
    expect(warning.className).toContain('bg-danger-soft');
    expect(warning).toHaveTextContent('vượt mức 330.000₫');
    expect(screen.getByTestId('entry-save-btn')).toBeEnabled();
  });

  it('shows a warnAlso line when an expense touches multiple budgets', async () => {
    const user = userEvent.setup();
    // Cà phê is a child of Ăn uống: 60k in Cà phê pushes Cà phê to fast and Ăn uống to near (2.54M + 60k = 2.6M >= 85% of 3M).
    setLocalCopy([
      makeSyncEntry({ id: 'se-coffee', categoryId: 'cat-coffee', amount: 160_000, date: '2026-11-24' }),
      makeSyncEntry({ id: 'se-food', categoryId: 'cat-food', amount: 2_380_000, date: '2026-11-15' }),
    ]);
    setupApi();

    renderEntry();
    await finishAmount(user, '60000');
    await user.click(await screen.findByTestId('category-tile-cat-coffee'));

    const warning = await screen.findByTestId('entry-budget-warning');
    expect(warning).toHaveTextContent('Khoản này làm Cà phê chi nhanh quá');
    expect(warning).toHaveTextContent('Ăn uống cũng sẽ sắp chạm mức.');
  });

  it('still warns on an already-over budget (B21)', async () => {
    const user = userEvent.setup();
    setLocalCopy([
      makeSyncEntry({
        id: 'se-shop',
        categoryId: 'cat-shopping',
        amount: 1_200_000,
        date: '2026-11-10',
      }),
    ]);
    setupApi();

    renderEntry();
    await finishAmount(user, '60000');
    await user.click(await screen.findByTestId('category-tile-cat-shopping'));

    const warning = await screen.findByTestId('entry-budget-warning');
    expect(warning.className).toContain('bg-danger-soft');
    expect(warning).toHaveTextContent('Mua sắm đã vượt mức, giờ vượt 260.000₫');
    expect(screen.getByTestId('entry-save-btn')).toBeEnabled();
  });

  it('editing an expense from an earlier month warns about that month without double-counting itself', async () => {
    const octEntry = makeEntryView({
      id: 'e-oct',
      categoryId: 'cat-shopping',
      amount: 600_000,
      date: '2026-10-15',
    });
    setLocalCopy([
      makeSyncEntry({
        id: 'e-oct',
        categoryId: 'cat-shopping',
        amount: 600_000,
        date: '2026-10-15',
      }),
      makeSyncEntry({
        id: 'e-oct-other',
        categoryId: 'cat-shopping',
        amount: 500_000,
        date: '2026-10-10',
      }),
    ]);
    setupApi();

    // October already has 500k + 600k = 1.1M (100k over the 1M limit).
    // Replacing e-oct keeps October at 1.1M -> over by 100.000₫ (not 700.000₫!).
    renderEntry('/entries/e-oct/edit', { entry: octEntry });

    const warning = await screen.findByTestId('entry-budget-warning');
    expect(warning.className).toContain('bg-danger-soft');
    expect(warning).toHaveTextContent('vượt mức 100.000₫');
    expect(warning).not.toHaveTextContent('700.000₫');
  });

  it('uses the owner share when split with people (B19)', async () => {
    const user = userEvent.setup();
    // Weekly Cà phê 300k, spent 160k.
    // Full 100k would push to 260k (fast). Split equally with Minh -> owner share 50k -> 210k.
    // On Thursday (4/7 elapsed): 210k / (4/7) = 367.5k >= 330k (fast).
    // Let's test 60k split equally -> owner share 30k -> 190k / (4/7) = 332.5k vs 40k split -> 20k -> 180k / (4/7) = 315k (fine!).
    setLocalCopy([
      makeSyncEntry({ id: 'se-coffee', categoryId: 'cat-coffee', amount: 160_000, date: '2026-11-24' }),
    ]);
    setupApi();

    renderEntry();
    await finishAmount(user, '60000');
    await user.click(await screen.findByTestId('category-tile-cat-coffee'));

    // Unsplit 60k -> fast warning appears
    expect(await screen.findByTestId('entry-budget-warning')).toHaveTextContent(
      'Khoản này làm Cà phê chi nhanh quá',
    );

    // Now test 40k: unsplit 40k -> 200k / (4/7) = 350k >= 330k (fast),
    // split with Minh -> owner share 20k -> 180k / (4/7) = 315k < 330k (fine, warning disappears!)
    await user.click(screen.getByTestId('entry-fold-amount'));
    await screen.findByTestId('amount-keypad');
    for (let i = 0; i < 6; i++) {
      await user.click(screen.getByTestId('key-back'));
    }
    await finishAmount(user, '40000');
    expect(await screen.findByTestId('entry-budget-warning')).toBeInTheDocument();

    await pickPeople(user, ['Minh']);
    await waitFor(() => {
      expect(screen.queryByTestId('entry-budget-warning')).not.toBeInTheDocument();
    });
  });

  it('after saving a new fast-making expense, snackbar shows savedWithBudget and keeps Hoàn tác without any confirm dialog', async () => {
    const user = userEvent.setup();
    setLocalCopy([
      makeSyncEntry({ id: 'se-coffee', categoryId: 'cat-coffee', amount: 160_000, date: '2026-11-24' }),
    ]);
    setupApi();

    renderEntry();
    await finishAmount(user, '60000');
    await user.click(await screen.findByTestId('category-tile-cat-coffee'));
    await screen.findByTestId('entry-budget-warning');

    await user.click(screen.getByTestId('entry-save-btn'));

    // No confirm dialog
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Snackbar shows savedWithBudget message and keeps Undo ("Hoàn tác") on new entries
    expect(await screen.findByText(/Đã lưu\. Cà phê chi nhanh quá/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hoàn tác' })).toBeInTheDocument();
  });

  it('after saving a fine expense, the existing saved message is unchanged', async () => {
    const user = userEvent.setup();
    setLocalCopy([]);
    setupApi();

    renderEntry();
    await finishAmount(user, '20000');
    await user.click(await screen.findByTestId('category-tile-cat-coffee'));
    expect(screen.queryByTestId('entry-budget-warning')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('entry-save-btn'));

    expect(await screen.findByText('Đã chi 20.000₫ · Cà phê')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hoàn tác' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xem' })).not.toBeInTheDocument();
  });
});
