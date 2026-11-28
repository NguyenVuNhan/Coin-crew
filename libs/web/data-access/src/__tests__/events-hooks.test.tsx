import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import type {
  BudgetsResponse,
  CategoriesResponse,
  CategoryView,
  GroupRow,
  SyncEntryRow,
  TagView,
  EventSavedResponse,
  EventsResponse,
  EventView,
  TripListItem,
  WalletDetailsResponse,
  WalletDetailView,
} from '@cc/core';
import { todayLocal } from '@cc/web-util/localDate';
import { openGroupCopyStore, forgetGroupCopy, requestGroupCopySync } from '../txCopy/groupCopy';
import { openTxCopyStore } from '../txCopy/store';
import { forgetTxCopy } from '../txCopy/hooks';
import { WALLETS_KEY } from '../personal';
import {
  PERSONAL_BUDGETS_KEY,
  PERSONAL_HOLDINGS_KEY,
  PERSONAL_LIST_KEY,
  PERSONAL_REPORT_KEY,
  PERSONAL_SUMMARY_KEY,
  PERSONAL_TAGS_KEY,
} from '../personalMoney';
import {
  PERSONAL_EVENTS_KEY,
  useCreateEvent,
  useEventShareSync,
  useEventSummary,
} from '../events';
import { useMyGroups } from '../groups';

const TEST_USER_ID = 'events-hooks-user-1';

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

const eventTag: TagView = {
  id: 't-dalat',
  name: 'Đà Lạt',
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
      wallets: [sampleWallet],
    } satisfies WalletDetailsResponse,
    'GET /api/me/personal/categories': {
      categories: [catFood],
      recentIds: ['c-food'],
    } satisfies CategoriesResponse,
    'GET /api/me/personal/tags': { tags: [eventTag] },
    'GET /api/me/personal/group-settings': {
      settings: { defaultGroupCategoryId: null, countLoans: false },
    },
    'GET /api/me/personal/budgets': { budgets: [] } satisfies BudgetsResponse,
    'GET /api/me/personal/events': { events: [] } satisfies EventsResponse,
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

async function seedLocalCopy(
  entries: SyncEntryRow[],
  groupRows: GroupRow[] = [],
  groupKey = 'key-1',
) {
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

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await forgetTxCopy(TEST_USER_ID);
  await forgetGroupCopy(TEST_USER_ID);
});

describe('events hooks', () => {
  it('useCreateEvent sends today and invalidates events and budgets', async () => {
    const today = todayLocal();
    const createdEvent: EventView = {
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
    const saved: EventSavedResponse = {
      event: createdEvent,
      existing: {
        own: { count: 0, totals: [] },
        shares: { count: 0, total: 0 },
      },
    };

    const { calls } = mockFetch(
      baseRoutes({
        'POST /api/me/personal/events': saved,
      }),
    );

    const queryClient = makeQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result, unmount } = renderHook(() => useCreateEvent(), {
      wrapper: makeWrapper(queryClient),
    });

    await result.current.mutateAsync({
      name: 'Đà Lạt',
      start: today,
      end: today,
      groupIds: [],
    });

    const postCall = calls.find((c) => c.method === 'POST' && c.path === '/api/me/personal/events');
    expect(postCall).toBeDefined();
    expect(postCall!.body).toEqual({
      name: 'Đà Lạt',
      start: today,
      end: today,
      groupIds: [],
      today,
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_EVENTS_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_BUDGETS_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_TAGS_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: WALLETS_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_SUMMARY_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_LIST_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_HOLDINGS_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_REPORT_KEY });

    unmount();
  });

  it('useEventShareSync posts once per group copy key and requests a group sync only when tagged > 0', async () => {
    const today = todayLocal();
    const trip: EventView = {
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

    await seedLocalCopy([], [], 'key-1');

    let tagSharesResponse = { tagged: 0 };
    let groupRowsResponse: { status: 'current' } | { status: 'rows'; key: string; rows: GroupRow[] } = {
      status: 'current',
    };
    const { calls } = mockFetch(
      baseRoutes({
        'GET /api/me/personal/events': { events: [trip] } satisfies EventsResponse,
        'GET /api/me/personal/group-rows': () => Response.json(groupRowsResponse),
        'POST /api/me/personal/events/tag-shares': () => Response.json(tagSharesResponse),
      }),
    );

    const queryClient = makeQueryClient();
    const { rerender, unmount } = renderHook(() => useEventShareSync(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => {
      expect(calls.filter((c) => c.path === '/api/me/personal/events/tag-shares')).toHaveLength(1);
    });

    const firstPost = calls.find((c) => c.path === '/api/me/personal/events/tag-shares')!;
    expect(firstPost.body).toEqual({ today });

    // Rerendering with the same group copy key does not post again
    rerender();
    await new Promise((r) => setTimeout(r, 20));
    expect(calls.filter((c) => c.path === '/api/me/personal/events/tag-shares')).toHaveLength(1);
    const groupRowSyncCallsBefore = calls.filter(
      (c) => c.path === '/api/me/personal/group-rows',
    ).length;

    // Update group copy key via sync -> triggers another tag-shares post; with tagged > 0, requests group copy sync
    tagSharesResponse = { tagged: 2 };
    groupRowsResponse = { status: 'rows', key: 'key-2', rows: [] };
    await requestGroupCopySync();
    groupRowsResponse = { status: 'current' };

    await waitFor(() => {
      expect(calls.filter((c) => c.path === '/api/me/personal/events/tag-shares')).toHaveLength(2);
    });
    await waitFor(() => {
      expect(
        calls.filter((c) => c.path === '/api/me/personal/group-rows').length,
      ).toBeGreaterThan(groupRowSyncCallsBefore + 1);
    });

    unmount();
  });

  it('useEventSummary returns the summary from copy rows', async () => {
    const today = todayLocal();
    const trip: EventView = {
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

    await seedLocalCopy(
      [makeEntry('e-1', { amount: 150_000, date: today, tagIds: ['t-dalat'] })],
      [
        makeGroupRow('gr-1', {
          date: today,
          myShare: 100_000,
          link: {
            walletId: 'w-1',
            categoryId: 'c-food',
            tagIds: ['t-dalat'],
            intent: 'shared',
            excludeFromReports: false,
          },
        }),
      ],
    );

    mockFetch(
      baseRoutes({
        'GET /api/me/personal/events': { events: [trip] } satisfies EventsResponse,
      }),
    );

    const queryClient = makeQueryClient();
    const { result, unmount } = renderHook(() => useEventSummary('tr-1'), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
      expect(result.current.summary).not.toBeNull();
    });

    expect(result.current.event?.id).toBe('tr-1');
    expect(result.current.progress).toBeNull();
    expect(result.current.summary!.currencies).toHaveLength(1);
    expect(result.current.summary!.currencies[0]!.total).toBe(250_000);
    expect(result.current.summary!.currencies[0]!.own).toBe(150_000);
    expect(result.current.summary!.currencies[0]!.group).toBe(100_000);

    unmount();
  });

  it('useMyGroups shares the [trips, active] queryKey and parses X-Archived-Count', async () => {
    const items: TripListItem[] = [
      {
        id: 'trip-1',
        name: 'Đà Lạt',
        archived: false,
        myBalance: 0,
      },
    ];

    mockFetch(
      baseRoutes({
        'GET /api/trips': () =>
          Response.json(items, { headers: { 'X-Archived-Count': '3' } }),
      }),
    );

    const queryClient = makeQueryClient();
    const { result, unmount } = renderHook(() => useMyGroups(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual({ items, archivedCount: 3 });
    expect(queryClient.getQueryData(['trips', 'active'])).toEqual({ items, archivedCount: 3 });

    unmount();
  });
});
