import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import type {
  BudgetDef,
  BudgetDraft,
  BudgetsProgressResponse,
  BudgetsResponse,
  CategoriesResponse,
  CategoryView,
  CountedSpendRow,
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
import {
  PERSONAL_BUDGETS_KEY,
  useBudgetImpacts,
  useBudgets,
  useBudgetsProgress,
  useCreateBudget,
  useDeleteBudget,
  useUpdateBudget,
} from '../budgets';

const TEST_USER_ID = 'budgets-hooks-user-1';

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
  const yy = String(dt.getUTCFullYear()).padStart(4, '0');
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
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

const excludedWallet: WalletDetailView = {
  ...sampleWallet,
  id: 'w-2',
  name: 'Savings',
  isDefault: false,
  sortOrder: 1,
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

const catTrip: CategoryView = {
  id: 'c-trip',
  parentId: null,
  type: 'expense',
  name: 'Travel',
  icon: 'plane',
  hidden: false,
  sortOrder: 2,
};

const sampleTag: TagView = {
  id: 't-1',
  name: 'work',
  useCount: 1,
};

function makeEntry(id: string, overrides: Partial<SyncEntryRow> = {}): SyncEntryRow {
  return {
    id,
    walletId: 'w-1',
    type: 'expense',
    amount: 50_000,
    categoryId: 'c-food',
    assetId: null,
    quantity: null,
    transferId: null,
    counterpartWalletId: null,
    date: todayLocal(),
    time: '12:00',
    note: 'Lunch',
    tagIds: [],
    excludeFromReports: false,
    createdAt: '2026-11-19T05:00:00.000Z',
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
    date: todayLocal(),
    title: 'Team Dinner',
    total: 200_000,
    myShare: 100_000,
    iPaid: false,
    payerName: 'Bob',
    counterpartName: null,
    people: ['Alice', 'Bob'],
    pending: false,
    link: {
      walletId: 'w-1',
      categoryId: 'c-food',
      tagIds: [],
      intent: 'shared',
      excludeFromReports: false,
    },
    createdAt: '2026-11-20T12:00:00.000Z',
    activityAt: '2026-11-20T12:00:00.000Z',
    ...overrides,
  };
}

function baseRoutes(
  overrides: Record<string, Handler | unknown> = {},
): Record<string, Handler | unknown> {
  return {
    'GET /api/me': signedInMe,
    'GET /api/me/personal/wallets': {
      wallets: [sampleWallet, excludedWallet],
    } satisfies WalletDetailsResponse,
    'GET /api/me/personal/categories': {
      categories: [catFood, catCoffee, catTrip],
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

describe('budgets hooks', () => {
  it('1. Copy-ready path computes grouped progress, history, suggestion, and rowsFor with 0 calls to /budgets/progress', async () => {
    const today = todayLocal();
    const fastFrom = shiftDays(today, -10);
    const fastTo = shiftDays(today, 10);
    const endedFrom = shiftDays(today, -30);
    const endedTo = shiftDays(today, -15);
    const weeklyCreated = shiftDays(today, -56);

    const overBudget: BudgetDef = {
      id: 'b-over',
      name: 'Food',
      target: { kind: 'category', categoryId: 'c-food' },
      currency: 'VND',
      periodKind: 'once',
      monthStartDay: null,
      from: fastFrom,
      to: fastTo,
      excludedWalletIds: ['w-2'],
      limits: [{ effectiveFrom: fastFrom, amount: 200_000 }],
      suggestionDismissedUntil: null,
      createdOn: fastFrom,
    };

    const fastBudget: BudgetDef = {
      id: 'b-fast',
      name: 'Work tag',
      target: { kind: 'tag', tagId: 't-1' },
      currency: 'VND',
      periodKind: 'once',
      monthStartDay: null,
      from: fastFrom,
      to: fastTo,
      excludedWalletIds: [],
      limits: [{ effectiveFrom: fastFrom, amount: 1_000_000 }],
      suggestionDismissedUntil: null,
      createdOn: fastFrom,
    };

    const endedBudget: BudgetDef = {
      id: 'b-ended',
      name: 'Past trip',
      target: { kind: 'category', categoryId: 'c-trip' },
      currency: 'VND',
      periodKind: 'once',
      monthStartDay: null,
      from: endedFrom,
      to: endedTo,
      excludedWalletIds: [],
      limits: [{ effectiveFrom: endedFrom, amount: 500_000 }],
      suggestionDismissedUntil: null,
      createdOn: endedFrom,
    };

    const weeklyBudget: BudgetDef = {
      id: 'b-weekly',
      name: 'Weekly coffee',
      target: { kind: 'category', categoryId: 'c-coffee' },
      currency: 'VND',
      periodKind: 'week',
      monthStartDay: null,
      from: null,
      to: null,
      excludedWalletIds: [],
      limits: [{ effectiveFrom: '2025-01-01', amount: 100_000 }],
      suggestionDismissedUntil: null,
      createdOn: weeklyCreated,
    };

    // Entries:
    // - Food: 150k direct + 100k group share + 60k coffee (child of food) = 310k (> 200k limit -> over)
    // - Excluded wallet w-2: 999k food (ignored by b-over)
    // - Work tag: 700k on fastFrom (elapsed = 11/21, 700k / 0.5238 = 1.336M >= 1.1M -> fast)
    // - Past trip: 300k on endedFrom (ended)
    // - Weekly coffee: 150k in each of the last 7 weeks (6 completed weeks all over 100k -> suggestion to raise)
    const entries: SyncEntryRow[] = [
      makeEntry('e-food', { amount: 150_000, date: today, categoryId: 'c-food' }),
      makeEntry('e-coffee-now', { amount: 60_000, date: today, categoryId: 'c-coffee' }),
      makeEntry('e-excluded', {
        amount: 999_000,
        date: today,
        categoryId: 'c-food',
        walletId: 'w-2',
      }),
      makeEntry('e-tag', {
        amount: 700_000,
        date: fastFrom,
        categoryId: 'c-trip',
        tagIds: ['t-1'],
      }),
      makeEntry('e-ended', { amount: 300_000, date: endedFrom, categoryId: 'c-trip' }),
    ];
    for (let w = 1; w <= 7; w++) {
      entries.push(
        makeEntry(`e-week-${w}`, {
          amount: 150_000,
          date: shiftDays(today, -w * 7),
          categoryId: 'c-coffee',
        }),
      );
    }

    await seedLocalCopy(entries, [makeGroupRow('gr-food', { date: today, myShare: 100_000 })]);

    const { calls } = mockFetch(
      baseRoutes({
        'GET /api/me/personal/budgets': {
          budgets: [overBudget, fastBudget, endedBudget, weeklyBudget],
        } satisfies BudgetsResponse,
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

    expect(result.current.error).toBeNull();
    expect(result.current.defs).toHaveLength(4);
    expect(result.current.current).toHaveLength(4);

    // Zero calls to fallback endpoint
    expect(calls.filter((c) => c.path === '/api/me/personal/budgets/progress')).toHaveLength(0);

    // Grouped progress
    expect(result.current.groups.over.map((p) => p.budgetId)).toEqual(['b-over']);
    expect(result.current.groups.over[0]!.spent).toBe(460_000); // 150k + 60k + 100k group + 150k (e-week-1 inside fastFrom..fastTo)
    expect(result.current.groups.fast.map((p) => p.budgetId)).toEqual(['b-fast']);
    expect(result.current.groups.onPace.map((p) => p.budgetId)).toEqual(['b-weekly']);
    expect(result.current.groups.ended.map((p) => p.budgetId)).toEqual(['b-ended']);
    expect(result.current.groups.ended[0]!.spent).toBe(300_000);
    expect(result.current.groups.ended[0]!.ended).toBe(true);

    // History newest first from firstBudgetPeriod
    const weeklyHistory = result.current.history('b-weekly');
    expect(weeklyHistory.length).toBeGreaterThanOrEqual(7);
    expect(weeklyHistory[0]!.period.from > weeklyHistory[1]!.period.from).toBe(true);

    // Suggestion: weeklyBudget has 6+ completed weeks all over 100k
    const weeklySuggestion = result.current.suggestion('b-weekly');
    expect(weeklySuggestion).not.toBeNull();
    expect(weeklySuggestion?.direction).toBe('raise');
    expect(result.current.suggestion('b-ended')).toBeNull();
    expect(result.current.suggestion('unknown-id')).toBeNull();

    // rowsFor returns matching counted spend rows (entries + group share, excluding w-2)
    const foodRows = result.current.rowsFor('b-over', { from: fastFrom, to: fastTo });
    const foodIds = foodRows.map((r) => r.id);
    expect(foodIds).toContain('e-food');
    expect(foodIds).toContain('e-coffee-now');
    expect(foodIds).toContain('gr-food');
    expect(foodIds).not.toContain('e-excluded');
    expect(result.current.rowsFor('unknown-id', { from: fastFrom, to: fastTo })).toEqual([]);

    unmount();
  });

  it('2. Copy unavailable falls back to GET /api/me/personal/budgets/progress?today=... once', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const today = todayLocal();
    const from = shiftDays(today, -10);
    const to = shiftDays(today, 10);

    const budget: BudgetDef = {
      id: 'b-1',
      name: 'Food',
      target: { kind: 'category', categoryId: 'c-food' },
      currency: 'VND',
      periodKind: 'once',
      monthStartDay: null,
      from,
      to,
      excludedWalletIds: [],
      limits: [{ effectiveFrom: from, amount: 500_000 }],
      suggestionDismissedUntil: null,
      createdOn: from,
    };

    const serverRows: CountedSpendRow[] = [
      {
        kind: 'entry',
        id: 'e-srv-1',
        walletId: 'w-1',
        currency: 'VND',
        date: today,
        amount: 600_000,
        categoryId: 'c-coffee', // child of c-food
        tagIds: [],
      },
    ];

    const { calls } = mockFetch(
      baseRoutes({
        'GET /api/me/personal/budgets': { budgets: [budget] } satisfies BudgetsResponse,
        'GET /api/me/personal/budgets/progress': {
          rows: serverRows,
        } satisfies BudgetsProgressResponse,
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

    expect(result.current.error).toBeNull();
    expect(result.current.groups.over).toHaveLength(1);
    expect(result.current.groups.over[0]!.spent).toBe(600_000);
    expect(result.current.rowsFor('b-1', { from, to }).map((r) => r.id)).toEqual(['e-srv-1']);

    const progressCalls = calls.filter((c) => c.path === '/api/me/personal/budgets/progress');
    expect(progressCalls).toHaveLength(1);
    expect(progressCalls[0]!.url).toContain(`today=${encodeURIComponent(today)}`);

    unmount();
  });

  it('3a. useBudgetImpacts returns [] while copy is unavailable and makes 0 calls to /budgets/progress', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const today = todayLocal();
    const from = shiftDays(today, -10);
    const to = shiftDays(today, 10);

    const budget: BudgetDef = {
      id: 'b-fast',
      name: 'Food',
      target: { kind: 'category', categoryId: 'c-food' },
      currency: 'VND',
      periodKind: 'once',
      monthStartDay: null,
      from,
      to,
      excludedWalletIds: [],
      limits: [{ effectiveFrom: from, amount: 1_000_000 }],
      suggestionDismissedUntil: null,
      createdOn: from,
    };

    const { calls } = mockFetch(
      baseRoutes({
        'GET /api/me/personal/budgets': { budgets: [budget] } satisfies BudgetsResponse,
      }),
    );
    const queryClient = makeQueryClient();

    const draft: BudgetDraft = {
      amount: 700_000,
      categoryId: 'c-food',
      tagIds: [],
      date: today,
      walletId: 'w-1',
      currency: 'VND',
    };

    const { result, unmount } = renderHook(() => useBudgetImpacts(draft), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() =>
      expect(calls.some((c) => c.path === '/api/me/personal/budgets')).toBe(true),
    );
    expect(result.current).toEqual([]);
    expect(calls.filter((c) => c.path === '/api/me/personal/budgets/progress')).toHaveLength(0);

    unmount();
  });

  it('3b. useBudgetImpacts returns one impact for a fast-making draft when copy is ready (and [] for null draft)', async () => {
    const today = todayLocal();
    const from = shiftDays(today, -10);
    const to = shiftDays(today, 10);

    const budget: BudgetDef = {
      id: 'b-fast',
      name: 'Food',
      target: { kind: 'category', categoryId: 'c-food' },
      currency: 'VND',
      periodKind: 'once',
      monthStartDay: null,
      from,
      to,
      excludedWalletIds: [],
      limits: [{ effectiveFrom: from, amount: 1_000_000 }],
      suggestionDismissedUntil: null,
      createdOn: from,
    };

    await seedLocalCopy([makeEntry('e-1', { amount: 100_000, date: today, categoryId: 'c-food' })]);

    const { calls } = mockFetch(
      baseRoutes({
        'GET /api/me/personal/budgets': { budgets: [budget] } satisfies BudgetsResponse,
      }),
    );
    const queryClient = makeQueryClient();

    const fastDraft: BudgetDraft = {
      amount: 600_000,
      categoryId: 'c-food',
      tagIds: [],
      date: today,
      walletId: 'w-1',
      currency: 'VND',
    };

    const { result, rerender, unmount } = renderHook(
      ({ draft }: { draft: BudgetDraft | null }) => useBudgetImpacts(draft),
      {
        initialProps: { draft: fastDraft as BudgetDraft | null },
        wrapper: makeWrapper(queryClient),
      },
    );

    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0]!.budgetId).toBe('b-fast');
    expect(result.current[0]!.before.spent).toBe(100_000);
    expect(result.current[0]!.after.spent).toBe(700_000);
    expect(result.current[0]!.after.state).toBe('fast');
    expect(calls.filter((c) => c.path === '/api/me/personal/budgets/progress')).toHaveLength(0);

    rerender({ draft: null });
    expect(result.current).toEqual([]);

    unmount();
  });

  it('4. useBudgets and CRUD mutations call the right endpoints and invalidate PERSONAL_BUDGETS_KEY', async () => {
    const today = todayLocal();
    const createdBudget: BudgetDef = {
      id: 'b-new',
      name: 'Food',
      target: { kind: 'category', categoryId: 'c-food' },
      currency: 'VND',
      periodKind: 'month',
      monthStartDay: 1,
      from: null,
      to: null,
      excludedWalletIds: [],
      limits: [{ effectiveFrom: `${today.slice(0, 7)}-01`, amount: 3_000_000 }],
      suggestionDismissedUntil: null,
      createdOn: today,
    };

    const { calls } = mockFetch(
      baseRoutes({
        'GET /api/me/personal/budgets': { budgets: [createdBudget] } satisfies BudgetsResponse,
        'POST /api/me/personal/budgets': { budget: createdBudget },
        'PATCH /api/me/personal/budgets/b-new': {
          budget: { ...createdBudget, name: 'Dining' },
        },
        'DELETE /api/me/personal/budgets/b-new': { ok: true },
      }),
    );

    const queryClient = makeQueryClient();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = makeWrapper(queryClient);

    const { result: listRes, unmount: u0 } = renderHook(() => useBudgets(), { wrapper });
    await waitFor(() => expect(listRes.current.data?.budgets).toHaveLength(1));
    u0();

    const { result: createRes, unmount: u1 } = renderHook(() => useCreateBudget(), { wrapper });
    await createRes.current.mutateAsync({
      target: { kind: 'category', categoryId: 'c-food' },
      currency: 'VND',
      amount: 3_000_000,
      periodKind: 'month',
      monthStartDay: 1,
      excludedWalletIds: [],
      today,
    });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: PERSONAL_BUDGETS_KEY }));
    spy.mockClear();
    u1();

    const { result: updateRes, unmount: u2 } = renderHook(() => useUpdateBudget(), { wrapper });
    await updateRes.current.mutateAsync({
      id: 'b-new',
      input: { name: 'Dining', today },
    });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: PERSONAL_BUDGETS_KEY }));
    spy.mockClear();
    u2();

    const { result: deleteRes, unmount: u3 } = renderHook(() => useDeleteBudget(), { wrapper });
    await deleteRes.current.mutateAsync('b-new');
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: PERSONAL_BUDGETS_KEY }));
    u3();

    expect(calls.some((c) => c.method === 'POST' && c.path === '/api/me/personal/budgets')).toBe(
      true,
    );
    expect(
      calls.some((c) => c.method === 'PATCH' && c.path === '/api/me/personal/budgets/b-new'),
    ).toBe(true);
    expect(
      calls.some((c) => c.method === 'DELETE' && c.path === '/api/me/personal/budgets/b-new'),
    ).toBe(true);
  });
});
