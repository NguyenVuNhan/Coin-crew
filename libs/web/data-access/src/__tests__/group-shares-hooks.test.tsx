import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import type {
  CategoriesResponse,
  CategoryView,
  GroupLinkView,
  GroupRow,
  GroupSettingsView,
  ListResponse,
  TagView,
  WalletDetailsResponse,
  WalletDetailView,
} from '@cc/core';
import { WALLETS_KEY } from '../personal';
import {
  PERSONAL_BALANCE_CHECKS_KEY,
  PERSONAL_CATEGORIES_KEY,
  PERSONAL_GROUP_SETTINGS_KEY,
  PERSONAL_HOLDINGS_KEY,
  PERSONAL_LIST_KEY,
  PERSONAL_SUMMARY_KEY,
  PERSONAL_TAGS_KEY,
  useAnswerBalanceCheck,
  useBalanceChecks,
  useGroupSettings,
  usePersonalList,
  useUpdateGroupLink,
  useUpdateGroupSettings,
} from '../personalMoney';
import {
  forgetGroupCopy,
  openGroupCopyStore,
  useCopyGroupRows,
  useGroupCopy,
  type GroupRowsSyncResponse,
} from '../txCopy/groupCopy';
import { requestTxCopySync } from '../txCopy/hooks';

const TEST_USER_ID = 'group-copy-hooks-user-1';

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

const defaultWallet: WalletDetailView = {
  id: 'w-default',
  name: 'Techcombank',
  currency: 'VND',
  balance: 1_000_000,
  isDefault: true,
  kind: 'everyday',
  startAmount: 1_000_000,
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: 1_000_000,
  icon: null,
  sortOrder: 0,
  archived: false,
  entryCount: 1,
};

const cashWallet: WalletDetailView = {
  id: 'w-cash',
  name: 'Tiền mặt',
  currency: 'VND',
  balance: 500_000,
  isDefault: false,
  kind: 'everyday',
  startAmount: 500_000,
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: 500_000,
  icon: null,
  sortOrder: 1,
  archived: false,
  entryCount: 0,
};

const sampleCategory: CategoryView = {
  id: 'c-food',
  parentId: null,
  type: 'expense',
  name: 'Ăn uống',
  icon: 'utensils',
  hidden: false,
  sortOrder: 0,
};

const sampleTag: TagView = {
  id: 't-dalat',
  name: 'Đà Lạt',
  useCount: 1,
};

function makeGroupRow(id: string, overrides: Partial<GroupRow> = {}): GroupRow {
  return {
    kind: 'group',
    id,
    rootId: id,
    tripId: 'trip-dalat',
    tripName: 'Đà Lạt',
    isDirect: false,
    source: 'expense',
    date: '2026-11-19',
    title: 'Taxi',
    total: 240_000,
    myShare: 80_000,
    iPaid: false,
    payerName: 'Hùng',
    counterpartName: null,
    people: ['Hùng', 'Minh'],
    pending: false,
    link: null,
    createdAt: '2026-11-19T10:00:00.000Z',
    ...overrides,
  };
}

function baseRoutes(
  groupRowsHandler: Handler | GroupRowsSyncResponse,
  extra: Record<string, Handler | unknown> = {},
): Record<string, Handler | unknown> {
  return {
    'GET /api/me': signedInMe,
    'GET /api/me/personal/wallets': {
      wallets: [defaultWallet, cashWallet],
    } satisfies WalletDetailsResponse,
    'GET /api/me/personal/categories': {
      categories: [sampleCategory],
      recentIds: ['c-food'],
    } satisfies CategoriesResponse,
    'GET /api/me/personal/tags': { tags: [sampleTag] },
    'GET /api/me/personal/group-rows': groupRowsHandler,
    ...extra,
  };
}

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await forgetGroupCopy(TEST_USER_ID);
});

describe('group copy and group-shares hooks', () => {
  it('group key change replaces group rows in the copy', async () => {
    const r1 = makeGroupRow('g-1', { title: 'Taxi', total: 240_000, myShare: 80_000 });
    const r1Edited = makeGroupRow('g-1-v2', {
      rootId: 'g-1',
      title: 'Taxi',
      total: 300_000,
      myShare: 100_000,
    });
    const r2 = makeGroupRow('g-2', { title: 'Bữa tối', total: 300_000, myShare: 100_000 });

    let step = 0;
    const { calls } = mockFetch(
      baseRoutes(() => {
        step += 1;
        if (step === 1) {
          return Response.json({ status: 'rows', key: 'k-1', rows: [r1] } satisfies GroupRowsSyncResponse);
        }
        if (step === 2) {
          return Response.json({ status: 'current' } satisfies GroupRowsSyncResponse);
        }
        return Response.json({
          status: 'rows',
          key: 'k-2',
          rows: [r1Edited, r2],
        } satisfies GroupRowsSyncResponse);
      }),
    );

    const queryClient = makeQueryClient();
    const { result, unmount } = renderHook(() => useGroupCopy(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.snapshot).toEqual({ key: 'k-1', rows: [r1] });

    // Second sync: server says current, rows stay untouched
    await act(async () => {
      await requestTxCopySync();
    });
    expect(result.current.snapshot).toEqual({ key: 'k-1', rows: [r1] });

    // Third sync: key changed -> replaces rows in IndexedDB
    await act(async () => {
      await requestTxCopySync();
    });
    expect(result.current.snapshot?.key).toBe('k-2');
    expect(result.current.snapshot?.rows).toEqual([r1Edited, r2]);

    const groupCalls = calls.filter((c) => c.path === '/api/me/personal/group-rows');
    expect(groupCalls.map((c) => c.url)).toEqual([
      '/api/me/personal/group-rows',
      '/api/me/personal/group-rows?key=k-1',
      '/api/me/personal/group-rows?key=k-1',
    ]);

    unmount();
  });

  it('window focus refreshes the group copy', async () => {
    const r1 = makeGroupRow('g-1');
    let syncCount = 0;
    mockFetch(
      baseRoutes(() => {
        syncCount += 1;
        return Response.json(
          syncCount === 1
            ? ({ status: 'rows', key: 'k-1', rows: [r1] } satisfies GroupRowsSyncResponse)
            : ({ status: 'current' } satisfies GroupRowsSyncResponse),
        );
      }),
    );

    const queryClient = makeQueryClient();
    const { result, unmount } = renderHook(() => useGroupCopy(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(syncCount).toBe(1);

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() => expect(syncCount).toBe(2));
    unmount();
  });

  it('copy list returns group rows filtered like the server', async () => {
    const rDefaultWallet = makeGroupRow('g-1', {
      tripId: 'trip-dalat',
      tripName: 'Đà Lạt',
      date: '2026-11-19',
      title: 'Taxi sân bay',
      link: null,
    });
    const rCashWallet = makeGroupRow('g-2', {
      tripId: 'trip-sport',
      tripName: 'Cầu lông T5',
      date: '2026-11-15',
      title: 'Tiền sân',
      link: {
        walletId: 'w-cash',
        categoryId: 'c-food',
        tagIds: ['t-dalat'],
        intent: null,
        excludeFromReports: false,
      },
    });
    const rOtherMonth = makeGroupRow('g-3', {
      tripId: 'trip-dalat',
      date: '2026-10-05',
      title: 'Khách sạn',
    });

    mockFetch(
      baseRoutes({
        status: 'rows',
        key: 'k-filter',
        rows: [rDefaultWallet, rCashWallet, rOtherMonth],
      } satisfies GroupRowsSyncResponse),
    );

    const queryClient = makeQueryClient();

    const { result, rerender, unmount } = renderHook(
      ({ query }: { query: Parameters<typeof useCopyGroupRows>[0] }) => useCopyGroupRows(query),
      {
        initialProps: { query: { month: '2026-11' } as Parameters<typeof useCopyGroupRows>[0] },
        wrapper: makeWrapper(queryClient),
      },
    );

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.groupRows?.map((r) => r.id)).toEqual(['g-1', 'g-2']);

    // Filter by resolved wallet: default wallet gets unlinked rows, cash wallet gets linked row
    rerender({ query: { month: '2026-11', walletId: 'w-default' } });
    expect(result.current.groupRows?.map((r) => r.id)).toEqual(['g-1']);

    rerender({ query: { month: '2026-11', walletId: 'w-cash' } });
    expect(result.current.groupRows?.map((r) => r.id)).toEqual(['g-2']);

    // Filter by tripId
    rerender({ query: { month: '2026-11', tripId: 'trip-sport' } });
    expect(result.current.groupRows?.map((r) => r.id)).toEqual(['g-2']);

    // Search accent-insensitive over title / tripName / tagName
    rerender({ query: { month: '2026-11', q: 'da lat' } });
    expect(result.current.groupRows?.map((r) => r.id)).toEqual(['g-1', 'g-2']);

    // Hide groups
    rerender({ query: { month: '2026-11', groups: 'hide' } });
    expect(result.current.groupRows).toEqual([]);

    unmount();
  });

  it('useCopyGroupRows makes no group-rows request when disabled', async () => {
    const { calls } = mockFetch(
      baseRoutes({ status: 'rows', key: 'k-1', rows: [] } satisfies GroupRowsSyncResponse),
    );

    const queryClient = makeQueryClient();
    const { result, unmount } = renderHook(
      () => useCopyGroupRows({ month: '2026-11' }, { enabled: false }),
      { wrapper: makeWrapper(queryClient) },
    );

    await new Promise((r) => setTimeout(r, 20));
    expect(result.current).toEqual({ groupRows: null, ready: false });
    expect(calls.filter((c) => c.path === '/api/me/personal/group-rows')).toHaveLength(0);
    unmount();
  });

  it('usePersonalList sends groups=show only when opts.groups is true', async () => {
    const r1 = makeGroupRow('g-1');
    const mockResp: ListResponse = {
      rows: [],
      totals: [{ currency: 'VND', spent: 80_000, income: 0 }],
      groupRows: [r1],
    };

    const { calls } = mockFetch({
      'GET /api/me/personal/transactions': mockResp,
    });

    const queryClient = makeQueryClient();
    const { result } = renderHook(
      () => usePersonalList({ month: '2026-11', tripId: 'trip-dalat' }, { groups: true }),
      { wrapper: makeWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.groupRows).toEqual([r1]);
    expect(calls[0]!.url).toBe('/api/me/personal/transactions?month=2026-11&tripId=trip-dalat&groups=show');
  });

  it('group settings, group link, and balance check hooks call the right URLs, invalidate, and sync copy', async () => {
    const initialSettings: GroupSettingsView = {
      defaultGroupCategoryId: null,
      countLoans: false,
    };
    const updatedSettings: GroupSettingsView = {
      defaultGroupCategoryId: 'c-food',
      countLoans: true,
    };
    const updatedLink: GroupLinkView = {
      walletId: 'w-cash',
      categoryId: 'c-food',
      tagIds: ['t-dalat'],
      intent: 'shared',
      excludeFromReports: false,
    };

    let groupRowsFetches = 0;
    const { calls } = mockFetch(
      baseRoutes(
        () => {
          groupRowsFetches += 1;
          return Response.json({
            status: 'rows',
            key: `k-${groupRowsFetches}`,
            rows: [],
          } satisfies GroupRowsSyncResponse);
        },
        {
          'GET /api/me/personal/group-settings': { settings: initialSettings },
          'PUT /api/me/personal/group-settings': { settings: updatedSettings },
          'PUT /api/me/personal/group-links/root-1': { link: updatedLink },
          'GET /api/me/personal/balance-checks': { walletIds: ['w-default', 'w-cash'] },
          'POST /api/me/personal/wallets/w-default/balance-check': { entryId: 'adj-1' },
          'POST /api/me/personal/wallets/w-cash/balance-check': { entryId: null },
        },
      ),
    );

    const queryClient = makeQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result, unmount } = renderHook(
      () => ({
        copy: useGroupCopy(),
        settings: useGroupSettings(),
        updateSettings: useUpdateGroupSettings(),
        updateLink: useUpdateGroupLink(),
        balanceChecks: useBalanceChecks(),
        answerBalanceCheck: useAnswerBalanceCheck(),
      }),
      { wrapper: makeWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(result.current.copy.status).toBe('ready');
      expect(result.current.settings.isSuccess).toBe(true);
      expect(result.current.balanceChecks.isSuccess).toBe(true);
    });

    expect(result.current.settings.data).toEqual({ settings: initialSettings });
    expect(result.current.balanceChecks.data).toEqual({ walletIds: ['w-default', 'w-cash'] });
    const fetchesBeforeMutations = groupRowsFetches;

    // 1. useUpdateGroupSettings
    invalidateSpy.mockClear();
    await act(async () => {
      await result.current.updateSettings.mutateAsync({
        defaultGroupCategoryId: 'c-food',
        countLoans: true,
      });
    });

    const settingsPut = calls.find(
      (c) => c.method === 'PUT' && c.path === '/api/me/personal/group-settings',
    );
    expect(settingsPut?.body).toEqual({ defaultGroupCategoryId: 'c-food', countLoans: true });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_GROUP_SETTINGS_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: WALLETS_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_SUMMARY_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_LIST_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_HOLDINGS_KEY });
    expect(groupRowsFetches).toBeGreaterThan(fetchesBeforeMutations);

    // 2. useUpdateGroupLink
    const fetchesBeforeLink = groupRowsFetches;
    invalidateSpy.mockClear();
    await act(async () => {
      await result.current.updateLink.mutateAsync({
        rootId: 'root-1',
        input: { walletId: 'w-cash', categoryId: 'c-food', tagIds: ['t-dalat'] },
      });
    });

    const linkPut = calls.find(
      (c) => c.method === 'PUT' && c.path === '/api/me/personal/group-links/root-1',
    );
    expect(linkPut?.body).toEqual({
      walletId: 'w-cash',
      categoryId: 'c-food',
      tagIds: ['t-dalat'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: WALLETS_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_SUMMARY_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_LIST_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_HOLDINGS_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_TAGS_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_CATEGORIES_KEY });
    expect(groupRowsFetches).toBeGreaterThan(fetchesBeforeLink);

    // 3. useAnswerBalanceCheck (actual and skip)
    const fetchesBeforeCheck = groupRowsFetches;
    invalidateSpy.mockClear();
    await act(async () => {
      await result.current.answerBalanceCheck.mutateAsync({
        walletId: 'w-default',
        input: { actual: 950_000 },
      });
      await result.current.answerBalanceCheck.mutateAsync({
        walletId: 'w-cash',
        input: { skip: true },
      });
    });

    const actualPost = calls.find(
      (c) => c.method === 'POST' && c.path === '/api/me/personal/wallets/w-default/balance-check',
    );
    const skipPost = calls.find(
      (c) => c.method === 'POST' && c.path === '/api/me/personal/wallets/w-cash/balance-check',
    );
    expect(actualPost?.body).toEqual({ actual: 950_000 });
    expect(skipPost?.body).toEqual({ skip: true });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_BALANCE_CHECKS_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: WALLETS_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_SUMMARY_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_LIST_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_HOLDINGS_KEY });
    expect(groupRowsFetches).toBeGreaterThan(fetchesBeforeCheck);

    unmount();
  });

  it('forgetGroupCopy deletes the group copy database', async () => {
    const r1 = makeGroupRow('g-1');
    mockFetch(
      baseRoutes({ status: 'rows', key: 'k-1', rows: [r1] } satisfies GroupRowsSyncResponse),
    );

    const queryClient = makeQueryClient();
    const { result, unmount } = renderHook(() => useGroupCopy(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.snapshot?.rows).toEqual([r1]);
    unmount();

    await forgetGroupCopy(TEST_USER_ID);

    const store = await openGroupCopyStore(TEST_USER_ID);
    expect(store).not.toBeNull();
    expect(await store!.load()).toBeNull();
  });
});
