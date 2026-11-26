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
  SyncEntryRow,
  TagView,
  WalletDetailsResponse,
  WalletDetailView,
} from '@cc/core';
import { todayLocal } from '@cc/web-util/localDate';
import { openGroupCopyStore, forgetGroupCopy } from '../txCopy/groupCopy';
import { openTxCopyStore } from '../txCopy/store';
import { forgetTxCopy } from '../txCopy/hooks';
import { PERSONAL_BUDGETS_KEY, useBudgetsProgress } from '../budgets';
import { useDeleteCategory, useDeleteTag } from '../personalMoney';

const TEST_USER_ID = 'budgets-final-fixes-user';

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

function shiftDays(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + delta));
  return `${String(dt.getUTCFullYear()).padStart(4, '0')}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
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
  startDate: '2024-01-01',
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

const sampleTag: TagView = {
  id: 't-1',
  name: 'trip',
  useCount: 1,
};

function baseRoutes(
  overrides: Record<string, Handler | unknown> = {},
): Record<string, Handler | unknown> {
  return {
    'GET /api/me': signedInMe,
    'GET /api/me/personal/wallets': { wallets: [sampleWallet] } satisfies WalletDetailsResponse,
    'GET /api/me/personal/categories': {
      categories: [catFood],
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
    'GET /api/me/personal/group-rows': { status: 'current' },
    ...overrides,
  };
}

async function seedLocalCopy(entries: SyncEntryRow[]) {
  const txStore = await openTxCopyStore(TEST_USER_ID);
  await txStore!.saveState({
    format: 1,
    epoch: 'ep-1',
    version: 1,
    ledgerVersion: 1,
    ready: true,
  });
  await txStore!.apply({ entries, removedIds: [] });

  const groupStore = await openGroupCopyStore(TEST_USER_ID);
  await groupStore!.replace('key-1', []);
}

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await forgetTxCopy(TEST_USER_ID);
  await forgetGroupCopy(TEST_USER_ID);
});

describe('budgets final review fixes (data-access)', () => {
  it('gates server-fallback progress query on defs.length > 0 and resolves isPending=false', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const { calls } = mockFetch(
      baseRoutes({
        'GET /api/me/personal/budgets': { budgets: [] } satisfies BudgetsResponse,
      }),
    );
    const queryClient = makeQueryClient();

    const { result, unmount } = renderHook(() => useBudgetsProgress(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.source).toBe('server');
      expect(result.current.isPending).toBe(false);
    });

    expect(result.current.defs).toEqual([]);
    expect(calls.filter((c) => c.path === '/api/me/personal/budgets/progress')).toHaveLength(0);

    unmount();
  });

  it('memoizes suggestion(id) and history(id) across repeated calls', async () => {
    const today = todayLocal();
    const weeklyCreated = shiftDays(today, -140); // ~20 weeks of history

    const weeklyBudget: BudgetDef = {
      id: 'b-weekly',
      name: 'Weekly food',
      target: { kind: 'category', categoryId: 'c-food' },
      currency: 'VND',
      periodKind: 'week',
      monthStartDay: null,
      from: null,
      to: null,
      excludedWalletIds: [],
      limits: [{ effectiveFrom: '2024-01-01', amount: 100_000 }],
      suggestionDismissedUntil: null,
      createdOn: weeklyCreated,
    };

    const entries: SyncEntryRow[] = [];
    for (let w = 1; w <= 7; w++) {
      entries.push({
        id: `e-w-${w}`,
        walletId: 'w-1',
        type: 'expense',
        amount: 200_000,
        categoryId: 'c-food',
        assetId: null,
        quantity: null,
        transferId: null,
        counterpartWalletId: null,
        date: shiftDays(today, -w * 7),
        time: '12:00',
        note: 'Meal',
        tagIds: [],
        excludeFromReports: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        syncVersion: 1,
      });
    }

    await seedLocalCopy(entries);

    mockFetch(
      baseRoutes({
        'GET /api/me/personal/budgets': { budgets: [weeklyBudget] } satisfies BudgetsResponse,
      }),
    );
    const queryClient = makeQueryClient();

    const { result, unmount } = renderHook(() => useBudgetsProgress(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.source).toBe('copy');
      expect(result.current.isPending).toBe(false);
    });

    const s1 = result.current.suggestion('b-weekly');
    const s2 = result.current.suggestion('b-weekly');
    expect(s1).not.toBeNull();
    expect(s1?.direction).toBe('raise');
    expect(s1).toBe(s2);

    const h1 = result.current.history('b-weekly');
    const h2 = result.current.history('b-weekly');
    expect(h1.length).toBeGreaterThanOrEqual(20);
    expect(h1).toBe(h2);

    unmount();
  });

  it('useDeleteCategory and useDeleteTag invalidate PERSONAL_BUDGETS_KEY', async () => {
    mockFetch(
      baseRoutes({
        'DELETE /api/me/personal/categories/c-food': { ok: true },
        'DELETE /api/me/personal/tags/t-1': { ok: true },
      }),
    );
    const queryClient = makeQueryClient();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = makeWrapper(queryClient);

    const { result: delCat, unmount: u1 } = renderHook(() => useDeleteCategory(), { wrapper });
    await delCat.current.mutateAsync({ id: 'c-food' });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: PERSONAL_BUDGETS_KEY }));
    spy.mockClear();
    u1();

    const { result: delTag, unmount: u2 } = renderHook(() => useDeleteTag(), { wrapper });
    await delTag.current.mutateAsync('t-1');
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: PERSONAL_BUDGETS_KEY }));
    u2();
  });
});
