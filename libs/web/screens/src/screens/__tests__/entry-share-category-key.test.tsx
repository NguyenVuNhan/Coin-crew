import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  CategoriesResponse,
  CategoryView,
  EntryView,
  SyncEntryRow,
  TripView,
  WalletDetailView,
} from '@cc/core';
import { setLang } from '@cc/web-i18n';
import type { TxCopyStatus } from '@cc/web-data-access/txCopy/hooks';
import type { TxCopySnapshot } from '@cc/web-data-access/txCopy/store';
import { mockApi, renderAt } from '../../test/render';
import { finishAmount, openDetails, pickPeople } from '../../test/entry';
import { hideUndo } from '../../components/UndoSnackbarHost';
import { App } from '../../App';

let mockTxCopyState: { status: TxCopyStatus; snapshot: TxCopySnapshot | null } = {
  status: 'unavailable',
  snapshot: null,
};

vi.mock('@cc/web-data-access/txCopy/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cc/web-data-access/txCopy/hooks')>();
  return {
    ...actual,
    useTxCopy: () => mockTxCopyState,
  };
});

const bankWallet: WalletDetailView = {
  id: 'w-bank',
  name: 'Techcombank',
  currency: 'VND',
  balance: 2_000_000,
  isDefault: true,
  kind: 'everyday',
  startAmount: 2_000_000,
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: 2_000_000,
  icon: null,
  sortOrder: 0,
  archived: false,
  entryCount: 0,
};

const usdWallet: WalletDetailView = {
  id: 'w-usd',
  name: 'USD Card',
  currency: 'USD',
  balance: 10_000,
  isDefault: false,
  kind: 'everyday',
  startAmount: 10_000,
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: 250_000_000,
  icon: null,
  sortOrder: 1,
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
  parentId: null,
  sortOrder: 1,
  hidden: false,
};

const diningCat: CategoryView = {
  id: 'u-1:food-dining',
  type: 'expense',
  name: 'Ăn ngoài',
  icon: 'utensils-crossed',
  parentId: null,
  sortOrder: 2,
  hidden: false,
  systemKey: 'food-dining',
};

const categoriesResp: CategoriesResponse = {
  categories: [foodCat, coffeeCat, diningCat],
  recentIds: ['cat-food', 'cat-coffee', 'u-1:food-dining'],
};

const meResp = {
  user: { id: 'u-1', email: 'an@example.com', name: 'An', consentAt: '2026-01-01T00:00:00Z' },
  personalArea: true,
  signIn: { zalo: false },
  mergeRequests: { incoming: [], outgoing: [], joining: [], claim: null },
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
      { id: 'p-lan', name: 'Lan', status: 'active', isMember: false, bank: 'none' },
    ],
    balances: { 'p-me': 0, 'p-minh': 0, 'p-lan': 0 },
    suggestions: [],
    expenses: [],
    payments: [],
    myBalance: null,
    approvals: [],
    links: null,
  };
}

function makeEntry(overrides: Partial<EntryView> = {}): EntryView {
  return {
    id: 'e-1',
    type: 'expense',
    walletId: 'w-bank',
    currency: 'VND',
    amount: 50_000,
    categoryId: 'cat-food',
    date: '2026-11-21',
    time: '08:30',
    note: null,
    tags: [],
    excludeFromReports: false,
    transferId: null,
    counterpartWalletId: null,
    source: 'manual',
    beforeStart: false,
    createdAt: '2026-11-21T01:30:00Z',
    ...overrides,
  };
}

function baseRoutes(overrides: Record<string, unknown> = {}) {
  return {
    'GET /api/me': meResp,
    'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
    'GET /api/trips/t-led': directTripView(),
    'GET /api/trips/t-led/version': { version: 1 },
    'GET /api/me/people/candidates': [],
    'GET /api/me/personal/wallets': { wallets: [bankWallet, usdWallet] },
    'GET /api/me/personal/categories': categoriesResp,
    'GET /api/me/personal/tags': { tags: [] },
    'GET /api/me/personal/summary': {
      month: '2026-11',
      totalVnd: 2_000_000,
      spentVnd: 0,
      incomeVnd: 0,
      hasUnvaluedForeign: false,
    },
    'GET /api/me/personal/transactions': { rows: [] },
    'GET /api/me/people/summary': { people: [], incomplete: false },
    'GET /api/me/personal/group-settings': {
      settings: { defaultGroupCategoryId: null, countLoans: false },
    },
    'GET /api/me/personal/balance-checks': { walletIds: [] },
    ...overrides,
  };
}

function renderNewEntry() {
  const result = renderAt(<App />, { route: '/entries/new' });
  act(() => {
    setLang('vi');
  });
  return result;
}

beforeEach(() => {
  localStorage.clear();
  hideUndo();
  mockTxCopyState = { status: 'unavailable', snapshot: null };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
  hideUndo();
});

function shareRoutes(categoryId: string) {
  return baseRoutes({
    'POST /api/trips/t-led/expenses': () => Response.json({ expenseId: 'exp-42' }, { status: 201 }),
    'PUT /api/me/personal/group-links/exp-42': () =>
      Response.json({
        link: { walletId: 'w-bank', categoryId, tagIds: [], intent: 'shared', excludeFromReports: false },
      }),
  });
}

async function saveChiWithMinh(user: ReturnType<typeof userEvent.setup>, tileId: string) {
  renderNewEntry();
  await finishAmount(user, '50000');
  await user.click(await screen.findByTestId(`category-tile-${tileId}`));
  await pickPeople(user, ['Minh']);
  await user.click(screen.getByTestId('entry-save-btn'));
}

describe('EntryPage — Chi with people shares its danh mục with the group (#140)', () => {
  it('Chi with people and Ăn ngoài sends categoryKey food-dining', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi(shareRoutes('u-1:food-dining'));
    await saveChiWithMinh(user, 'u-1:food-dining');

    await waitFor(() => {
      const post = calls.find((c) => c.method === 'POST' && c.path === '/api/trips/t-led/expenses');
      expect(post?.body).toMatchObject({ categoryKey: 'food-dining', amount: 50_000 });
    });
  });

  it('custom category sends null', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi(shareRoutes('cat-coffee'));
    await saveChiWithMinh(user, 'cat-coffee');

    await waitFor(() => {
      const post = calls.find((c) => c.method === 'POST' && c.path === '/api/trips/t-led/expenses');
      expect(post?.body).toMatchObject({ categoryKey: null });
    });
  });
});
