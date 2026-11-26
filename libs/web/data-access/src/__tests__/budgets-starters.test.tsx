import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import type {
  BudgetDef,
  BudgetsResponse,
  CategoriesResponse,
  CategoryView,
  GroupRow,
  SyncEntryRow,
  TagView,
  WalletDetailsResponse,
  WalletDetailView,
} from '@cc/core';
import { todayLocal } from '@cc/web-util/localDate';
import { openGroupCopyStore, forgetGroupCopy } from '../txCopy/groupCopy';
import { openTxCopyStore } from '../txCopy/store';
import { forgetTxCopy } from '../txCopy/hooks';
import { useBudgetStarters, useLastMonthCategorySpent } from '../budgets';

const TEST_USER_ID = 'budgets-starters-user-1';

type Handler = (init: RequestInit | undefined, url: string) => Response | Promise<Response>;

function mockFetch(routes: Record<string, Handler | unknown>) {
  const calls: { method: string; path: string; url: string }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0]!;
    const method = (init?.method ?? 'GET').toUpperCase();
    calls.push({ method, path, url });
    const handler = routes[`${method} ${path}`];
    if (handler === undefined) {
      return Response.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 });
    }
    if (typeof handler === 'function') return (handler as Handler)(init, url);
    if (handler === null) return new Response(null, { status: 204 });
    return Response.json(handler);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

function makeWrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function lastMonthDate(day = 15): string {
  const today = todayLocal();
  const [y, m] = today.split('-').map(Number);
  const total = y! * 12 + (m! - 1) - 1;
  const py = Math.floor(total / 12);
  const pm = ((total % 12) + 12) % 12 + 1;
  return `${String(py).padStart(4, '0')}-${String(pm).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const signedInMe = {
  user: {
    id: TEST_USER_ID,
    email: 'a@b.c',
    name: 'Alice',
    consentAt: '2026-10-12T00:00:00.000Z',
    zaloName: null,
  },
  signIn: { zalo: true },
  mergeRequests: { incoming: [], outgoing: [], joining: [], claim: null },
  personalArea: true,
};

const walletVnd: WalletDetailView = {
  id: 'w-vnd',
  name: 'Cash',
  currency: 'VND',
  balance: 5_000_000,
  isDefault: true,
  kind: 'everyday',
  startAmount: 5_000_000,
  startDate: '2025-01-01',
  startCostVnd: null,
  vndValue: 5_000_000,
  icon: null,
  sortOrder: 0,
  archived: false,
  excludeFromReports: false,
  entryCount: 1,
};

const walletExcluded: WalletDetailView = {
  ...walletVnd,
  id: 'w-excl',
  name: 'Savings',
  isDefault: false,
  excludeFromReports: true,
  sortOrder: 1,
};

const walletUsd: WalletDetailView = {
  ...walletVnd,
  id: 'w-usd',
  name: 'USD Cash',
  currency: 'USD',
  isDefault: false,
  excludeFromReports: false,
  sortOrder: 2,
};

const catFood: CategoryView = {
  id: 'c-food',
  parentId: null,
  type: 'expense',
  name: 'Food',
  icon: 'utensils',
  hidden: false,
  sortOrder: 0,
};

const catCoffee: CategoryView = {
  id: 'c-coffee',
  parentId: 'c-food',
  type: 'expense',
  name: 'Coffee',
  icon: 'coffee',
  hidden: false,
  sortOrder: 1,
};

const catTransport: CategoryView = {
  id: 'c-transport',
  parentId: null,
  type: 'expense',
  name: 'Transport',
  icon: 'car',
  hidden: false,
  sortOrder: 2,
};

const catShopping: CategoryView = {
  id: 'c-shopping',
  parentId: null,
  type: 'expense',
  name: 'Shopping',
  icon: 'shopping-bag',
  hidden: false,
  sortOrder: 3,
};

const catBills: CategoryView = {
  id: 'c-bills',
  parentId: null,
  type: 'expense',
  name: 'Bills',
  icon: 'receipt',
  hidden: false,
  sortOrder: 4,
};

const sampleTag: TagView = {
  id: 't-1',
  name: 'work',
  useCount: 1,
};

function makeEntry(id: string, overrides: Partial<SyncEntryRow> = {}): SyncEntryRow {
  return {
    id,
    walletId: 'w-vnd',
    type: 'expense',
    amount: 50_000,
    categoryId: 'c-food',
    assetId: null,
    quantity: null,
    transferId: null,
    counterpartWalletId: null,
    date: lastMonthDate(15),
    time: '12:00',
    note: 'Lunch',
    tagIds: [],
    excludeFromReports: false,
    createdAt: '2026-10-15T05:00:00.000Z',
    syncVersion: 1,
    ...overrides,
  };
}

function makeGroupRow(id: string, overrides: Partial<GroupRow> = {}): GroupRow {
  return {
    kind: 'group',
    id,
    rootId: `root-${id}`,
    tripId: 'trip-1',
    tripName: 'Trip 1',
    isDirect: false,
    source: 'expense',
    date: lastMonthDate(12),
    title: 'Team Dinner',
    total: 400_000,
    myShare: 200_000,
    iPaid: false,
    payerName: 'Bob',
    counterpartName: null,
    people: ['Alice', 'Bob'],
    pending: false,
    link: {
      walletId: 'w-vnd',
      categoryId: 'c-food',
      tagIds: [],
      intent: 'shared',
      excludeFromReports: false,
    },
    createdAt: '2026-10-12T12:00:00.000Z',
    activityAt: '2026-10-12T12:00:00.000Z',
    ...overrides,
  };
}

function baseRoutes(
  overrides: Record<string, Handler | unknown> = {},
): Record<string, Handler | unknown> {
  return {
    'GET /api/me': signedInMe,
    'GET /api/me/personal/wallets': {
      wallets: [walletVnd, walletExcluded, walletUsd],
    } satisfies WalletDetailsResponse,
    'GET /api/me/personal/categories': {
      categories: [catFood, catCoffee, catTransport, catShopping, catBills],
      recentIds: ['c-food'],
    } satisfies CategoriesResponse,
    'GET /api/me/personal/tags': { tags: [sampleTag] },
    'GET /api/me/personal/group-settings': {
      settings: { defaultGroupCategoryId: null, countLoans: false },
    },
    'GET /api/me/personal/budgets': { budgets: [] } satisfies BudgetsResponse,
    'GET /api/me/personal/sync': {
      status: 'current',
      epoch: 'ep-1',
      version: 1,
      entries: [],
      removedIds: [],
      cursor: null,
      ledger: null,
    },
    'GET /api/me/personal/group-rows': {
      status: 'current',
    },
    ...overrides,
  };
}

async function seedLocalCopy(entries: SyncEntryRow[], groupRows: GroupRow[] = []) {
  const txStore = await openTxCopyStore(TEST_USER_ID);
  expect(txStore).not.toBeNull();
  await txStore!.saveState({
    format: 1,
    epoch: 'ep-1',
    version: 1,
    ledgerVersion: 1,
    ready: true,
  });
  await txStore!.apply({ entries, removedIds: [] });

  const groupStore = await openGroupCopyStore(TEST_USER_ID);
  expect(groupStore).not.toBeNull();
  await groupStore!.replace('key-1', groupRows);
}

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await forgetTxCopy(TEST_USER_ID);
  await forgetGroupCopy(TEST_USER_ID);
});

describe('budget starter hooks', () => {
  it('useBudgetStarters returns [] and ready=false when local copy is unavailable (0 fallback calls)', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const { calls } = mockFetch(baseRoutes());
    const queryClient = makeQueryClient();

    const { result, unmount } = renderHook(() => useBudgetStarters(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() =>
      expect(calls.some((c) => c.path === '/api/me/personal/budgets')).toBe(true),
    );
    expect(result.current).toEqual({ starters: [], ready: false });
    expect(calls.filter((c) => c.path === '/api/me/personal/budgets/progress')).toHaveLength(0);

    unmount();
  });

  it('useBudgetStarters computes top 3 from local copy, rolls up sub-categories, skips budgeted & excluded wallets & USD', async () => {
    const existingBudget: BudgetDef = {
      id: 'b-bills',
      name: 'Bills',
      target: { kind: 'category', categoryId: 'c-bills' },
      currency: 'VND',
      periodKind: 'month',
      monthStartDay: 1,
      from: null,
      to: null,
      excludedWalletIds: [],
      limits: [{ effectiveFrom: '2026-01-01', amount: 1_000_000 }],
      suggestionDismissedUntil: null,
      createdOn: '2026-01-01',
    };

    const entries: SyncEntryRow[] = [
      // Food: 1_500_000 direct + 430_000 coffee (child) + 200_000 group share = 2_130_000 -> 2_200_000
      makeEntry('e-food', { categoryId: 'c-food', amount: 1_500_000 }),
      makeEntry('e-coffee', { categoryId: 'c-coffee', amount: 430_000 }),
      // Transport: 2_000_000 -> 2_000_000
      makeEntry('e-transport', { categoryId: 'c-transport', amount: 2_000_000 }),
      // Shopping: 350_000 -> 400_000
      makeEntry('e-shopping', { categoryId: 'c-shopping', amount: 350_000 }),
      // Bills: already budgeted -> skipped
      makeEntry('e-bills', { categoryId: 'c-bills', amount: 5_000_000 }),
      // Wallet excluded from reports -> ignored
      makeEntry('e-excl-wallet', {
        walletId: 'w-excl',
        categoryId: 'c-shopping',
        amount: 9_000_000,
      }),
      // USD wallet -> ignored
      makeEntry('e-usd', { walletId: 'w-usd', categoryId: 'c-shopping', amount: 50_000 }),
      // Uncategorized (synthetic) -> ignored
      makeEntry('e-uncat', { categoryId: null, amount: 8_000_000 }),
      // Current month -> ignored
      makeEntry('e-current', { date: todayLocal(), categoryId: 'c-shopping', amount: 7_000_000 }),
    ];

    await seedLocalCopy(entries, [makeGroupRow('gr-food', { myShare: 200_000 })]);

    const { calls } = mockFetch(
      baseRoutes({
        'GET /api/me/personal/budgets': { budgets: [existingBudget] } satisfies BudgetsResponse,
      }),
    );
    const queryClient = makeQueryClient();

    const { result, unmount } = renderHook(() => useBudgetStarters(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.ready).toBe(true));

    expect(result.current.starters).toEqual([
      { categoryId: 'c-food', lastMonthSpent: 2_130_000, suggestedAmount: 2_200_000 },
      { categoryId: 'c-transport', lastMonthSpent: 2_000_000, suggestedAmount: 2_000_000 },
      { categoryId: 'c-shopping', lastMonthSpent: 350_000, suggestedAmount: 400_000 },
    ]);
    expect(calls.filter((c) => c.path === '/api/me/personal/budgets/progress')).toHaveLength(0);

    unmount();
  });

  it('useLastMonthCategorySpent returns null without copy or when categoryId is null, and rolled-up VND spend when ready', async () => {
    vi.stubGlobal('indexedDB', undefined);
    mockFetch(baseRoutes());
    const qc1 = makeQueryClient();

    const { result: unavailRes, unmount: u1 } = renderHook(
      () => useLastMonthCategorySpent('c-food'),
      { wrapper: makeWrapper(qc1) },
    );
    expect(unavailRes.current).toBeNull();
    u1();

    vi.unstubAllGlobals();
    await seedLocalCopy([
      makeEntry('e-food', { categoryId: 'c-food', amount: 1_200_000 }),
      makeEntry('e-coffee', { categoryId: 'c-coffee', amount: 300_000 }),
      makeEntry('e-excl', { walletId: 'w-excl', categoryId: 'c-food', amount: 900_000 }),
      makeEntry('e-usd', { walletId: 'w-usd', categoryId: 'c-food', amount: 5_000 }),
    ]);
    mockFetch(baseRoutes());
    const qc2 = makeQueryClient();

    const { result, rerender, unmount: u2 } = renderHook(
      ({ categoryId }: { categoryId: string | null }) => useLastMonthCategorySpent(categoryId),
      {
        initialProps: { categoryId: 'c-food' as string | null },
        wrapper: makeWrapper(qc2),
      },
    );

    await waitFor(() => expect(result.current).toBe(1_500_000));

    rerender({ categoryId: 'c-coffee' });
    expect(result.current).toBe(300_000);

    rerender({ categoryId: 'c-bills' });
    expect(result.current).toBe(0);

    rerender({ categoryId: null });
    expect(result.current).toBeNull();

    u2();
  });
});
