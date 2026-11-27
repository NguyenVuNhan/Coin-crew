import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import type {
  BudgetDef,
  BudgetsProgressResponse,
  BudgetsResponse,
  CategoriesResponse,
  CategoryView,
  CountedSpendRow,
  GroupRow,
  SyncEntryRow,
  TagView,
  TravelRowsResponse,
  TravelsResponse,
  TravelView,
  WalletDetailsResponse,
  WalletDetailView,
} from '@cc/core';
import { todayLocal } from '@cc/web-util/localDate';
import { openGroupCopyStore, forgetGroupCopy } from '../txCopy/groupCopy';
import { openTxCopyStore } from '../txCopy/store';
import { forgetTxCopy } from '../txCopy/hooks';
import { PERSONAL_TRAVELS_KEY, useTravelSummary } from '../travels';

const TEST_USER_ID = 'travels-fallback-user-1';

type Handler = (init: RequestInit | undefined, url: string) => Response | Promise<Response>;

function mockFetch(routes: Record<string, Handler | unknown>) {
  const calls: { method: string; path: string; url: string; body: unknown }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0]!;
    const method = (init?.method ?? 'GET').toUpperCase();
    calls.push({
      method,
      path,
      url,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
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

const sampleWallet: WalletDetailView = {
  id: 'w-1',
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
  entryCount: 1,
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

const travelTag: TagView = {
  id: 't-dalat',
  name: 'Đà Lạt',
  useCount: 1,
};

function baseRoutes(overrides: Record<string, Handler | unknown> = {}) {
  return {
    'GET /api/me': signedInMe,
    'GET /api/me/personal/budgets': { budgets: [] } satisfies BudgetsResponse,
    'GET /api/me/personal/wallets': { wallets: [sampleWallet] } satisfies WalletDetailsResponse,
    'GET /api/me/personal/categories': {
      categories: [catFood],
      recentIds: ['c-food'],
    } satisfies CategoriesResponse,
    'GET /api/me/personal/tags': { tags: [travelTag] },
    'GET /api/me/personal/group-settings': {
      settings: { defaultGroupCategoryId: null, countLoans: false },
    },
    'GET /api/me/personal/travels': { travels: [] } satisfies TravelsResponse,
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
      key: 'g-1',
      rows: [],
    },
    ...overrides,
  };
}

async function seedLocalCopy(entries: SyncEntryRow[], groupRows: GroupRow[], groupKey = 'g-1') {
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
  await groupStore!.replace(groupKey, groupRows);
}

describe('useTravelSummary rows fallback', () => {
  afterEach(async () => {
    vi.unstubAllGlobals();
    await forgetTxCopy(TEST_USER_ID).catch(() => {});
    await forgetGroupCopy(TEST_USER_ID).catch(() => {});
  });

  it('with copy unavailable and NO budgets, returns summary from /travels/:id/rows', async () => {
    const today = todayLocal();
    const trip: TravelView = {
      id: 'tr-1',
      tagId: 't-dalat',
      name: 'Đà Lạt',
      start: today,
      end: today,
      countsFrom: today,
      groupIds: ['trip-1'],
      budgetId: null,
      createdAt: '2026-11-27T00:00:00.000Z',
    };

    const serverRows: CountedSpendRow[] = [
      {
        id: 'e-1',
        kind: 'entry',
        date: today,
        amount: 200_000,
        currency: 'VND',
        walletId: 'w-1',
        categoryId: 'c-food',
        tagIds: ['t-dalat'],
      },
      {
        id: 'gr-1',
        kind: 'group',
        date: today,
        amount: 120_000,
        currency: 'VND',
        walletId: 'w-1',
        categoryId: 'c-food',
        tagIds: ['t-dalat'],
      },
    ];

    const { calls } = mockFetch(
      baseRoutes({
        'GET /api/me/personal/travels': { travels: [trip] } satisfies TravelsResponse,
        'GET /api/me/personal/travels/tr-1/rows': { rows: serverRows } satisfies TravelRowsResponse,
      }),
    );

    const queryClient = makeQueryClient();
    const { result, unmount } = renderHook(() => useTravelSummary('tr-1'), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
      expect(result.current.summary).not.toBeNull();
    });

    expect(calls.some((c) => c.path === '/api/me/personal/travels/tr-1/rows')).toBe(true);
    expect(queryClient.getQueryData([...PERSONAL_TRAVELS_KEY, 'tr-1', 'rows'])).toEqual({
      rows: serverRows,
    });
    expect(result.current.summary!.currencies).toHaveLength(1);
    expect(result.current.summary!.currencies[0]!.total).toBe(320_000);
    expect(result.current.summary!.currencies[0]!.own).toBe(200_000);
    expect(result.current.summary!.currencies[0]!.group).toBe(120_000);

    unmount();
  });

  it('with copy ready, does not call /travels/:id/rows', async () => {
    const today = todayLocal();
    const trip: TravelView = {
      id: 'tr-1',
      tagId: 't-dalat',
      name: 'Đà Lạt',
      start: today,
      end: today,
      countsFrom: today,
      groupIds: [],
      budgetId: null,
      createdAt: '2026-11-27T00:00:00.000Z',
    };

    const entry: SyncEntryRow = {
      id: 'e-1',
      walletId: 'w-1',
      type: 'expense',
      amount: 180_000,
      categoryId: 'c-food',
      assetId: null,
      quantity: null,
      transferId: null,
      counterpartWalletId: null,
      date: today,
      time: '12:00',
      note: 'Lunch',
      tagIds: ['t-dalat'],
      excludeFromReports: false,
      createdAt: '2026-11-19T05:00:00.000Z',
      syncVersion: 1,
    };

    await seedLocalCopy([entry], []);

    const { calls } = mockFetch(
      baseRoutes({
        'GET /api/me/personal/travels': { travels: [trip] } satisfies TravelsResponse,
      }),
    );

    const queryClient = makeQueryClient();
    const { result, unmount } = renderHook(() => useTravelSummary('tr-1'), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
      expect(result.current.summary).not.toBeNull();
    });

    expect(calls.some((c) => c.path === '/api/me/personal/travels/tr-1/rows')).toBe(false);
    expect(result.current.summary!.currencies[0]!.total).toBe(180_000);

    unmount();
  });

  it('when /travels/:id/rows returns 500 with a working budgets/progress, uses progress rows with no error', async () => {
    const today = todayLocal();
    const trip: TravelView = {
      id: 'tr-1',
      tagId: 't-dalat',
      name: 'Đà Lạt',
      start: today,
      end: today,
      countsFrom: today,
      groupIds: [],
      budgetId: null,
      createdAt: '2026-11-27T00:00:00.000Z',
    };
    const otherBudget: BudgetDef = {
      id: 'b-other',
      name: 'Food',
      target: { kind: 'category', categoryId: 'c-food' },
      currency: 'VND',
      periodKind: 'month',
      monthStartDay: null,
      from: today,
      to: null,
      excludedWalletIds: [],
      limits: [{ effectiveFrom: today, amount: 1_000_000 }],
      suggestionDismissedUntil: null,
      createdOn: today,
    };
    const progressRows: CountedSpendRow[] = [
      {
        id: 'e-prog',
        kind: 'entry',
        date: today,
        amount: 250_000,
        currency: 'VND',
        walletId: 'w-1',
        categoryId: 'c-food',
        tagIds: ['t-dalat'],
      },
    ];

    mockFetch(
      baseRoutes({
        'GET /api/me/personal/travels': { travels: [trip] } satisfies TravelsResponse,
        'GET /api/me/personal/budgets': { budgets: [otherBudget] } satisfies BudgetsResponse,
        'GET /api/me/personal/budgets/progress': { rows: progressRows } satisfies BudgetsProgressResponse,
        'GET /api/me/personal/travels/tr-1/rows': () =>
          Response.json({ error: { code: 'INTERNAL', message: 'Boom' } }, { status: 500 }),
      }),
    );

    const queryClient = makeQueryClient();
    const { result, unmount } = renderHook(() => useTravelSummary('tr-1'), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
      expect(result.current.summary).not.toBeNull();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.summary!.currencies[0]!.total).toBe(250_000);

    unmount();
  });

  it('when both /travels/:id/rows and budgets/progress fail, sets error', async () => {
    const today = todayLocal();
    const trip: TravelView = {
      id: 'tr-1',
      tagId: 't-dalat',
      name: 'Đà Lạt',
      start: today,
      end: today,
      countsFrom: today,
      groupIds: [],
      budgetId: null,
      createdAt: '2026-11-27T00:00:00.000Z',
    };
    const otherBudget: BudgetDef = {
      id: 'b-other',
      name: 'Food',
      target: { kind: 'category', categoryId: 'c-food' },
      currency: 'VND',
      periodKind: 'month',
      monthStartDay: null,
      from: today,
      to: null,
      excludedWalletIds: [],
      limits: [{ effectiveFrom: today, amount: 1_000_000 }],
      suggestionDismissedUntil: null,
      createdOn: today,
    };

    mockFetch(
      baseRoutes({
        'GET /api/me/personal/travels': { travels: [trip] } satisfies TravelsResponse,
        'GET /api/me/personal/budgets': { budgets: [otherBudget] } satisfies BudgetsResponse,
        'GET /api/me/personal/budgets/progress': () =>
          Response.json({ error: { code: 'INTERNAL', message: 'Progress failed' } }, { status: 500 }),
        'GET /api/me/personal/travels/tr-1/rows': () =>
          Response.json({ error: { code: 'INTERNAL', message: 'Rows failed' } }, { status: 500 }),
      }),
    );

    const queryClient = makeQueryClient();
    const { result, unmount } = renderHook(() => useTravelSummary('tr-1'), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });

    expect(result.current.error).not.toBeNull();
    expect(result.current.summary).toBeNull();

    unmount();
  });

  it('when /travels/:id/rows succeeds and budgets/progress fails, uses /rows with no error', async () => {
    const today = todayLocal();
    const trip: TravelView = {
      id: 'tr-1',
      tagId: 't-dalat',
      name: 'Đà Lạt',
      start: today,
      end: today,
      countsFrom: today,
      groupIds: [],
      budgetId: null,
      createdAt: '2026-11-27T00:00:00.000Z',
    };
    const otherBudget: BudgetDef = {
      id: 'b-other',
      name: 'Food',
      target: { kind: 'category', categoryId: 'c-food' },
      currency: 'VND',
      periodKind: 'month',
      monthStartDay: null,
      from: today,
      to: null,
      excludedWalletIds: [],
      limits: [{ effectiveFrom: today, amount: 1_000_000 }],
      suggestionDismissedUntil: null,
      createdOn: today,
    };
    const serverRows: CountedSpendRow[] = [
      {
        id: 'e-1',
        kind: 'entry',
        date: today,
        amount: 310_000,
        currency: 'VND',
        walletId: 'w-1',
        categoryId: 'c-food',
        tagIds: ['t-dalat'],
      },
    ];

    mockFetch(
      baseRoutes({
        'GET /api/me/personal/travels': { travels: [trip] } satisfies TravelsResponse,
        'GET /api/me/personal/budgets': { budgets: [otherBudget] } satisfies BudgetsResponse,
        'GET /api/me/personal/budgets/progress': () =>
          Response.json({ error: { code: 'INTERNAL', message: 'Progress failed' } }, { status: 500 }),
        'GET /api/me/personal/travels/tr-1/rows': { rows: serverRows } satisfies TravelRowsResponse,
      }),
    );

    const queryClient = makeQueryClient();
    const { result, unmount } = renderHook(() => useTravelSummary('tr-1'), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
      expect(result.current.summary).not.toBeNull();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.summary!.currencies[0]!.total).toBe(310_000);

    unmount();
  });
});
