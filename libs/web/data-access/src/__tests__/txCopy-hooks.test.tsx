import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import type {
  CategoriesResponse,
  CategoryView,
  SyncEntryRow,
  SyncResponse,
  TagView,
  WalletDetailsResponse,
  WalletDetailView,
} from '@cc/core';
import { openTxCopyStore } from '../txCopy/store';
import {
  forgetTxCopy,
  requestTxCopySync,
  resetTxCopy,
  useCopyList,
  useTxCopy,
} from '../txCopy/hooks';

const TEST_USER_ID = 'txcopy-hooks-user-1';

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

const sampleCategory: CategoryView = {
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
    date: '2026-11-19',
    time: '12:00',
    note: 'Lunch',
    tagIds: ['t-1'],
    excludeFromReports: false,
    createdAt: '2026-11-19T05:00:00.000Z',
    syncVersion: 1,
    ...overrides,
  };
}

function makeResetResponse(
  entries: SyncEntryRow[],
  overrides: Partial<SyncResponse> = {},
): SyncResponse {
  return {
    status: 'reset',
    epoch: 'ep-1',
    version: 1,
    entries,
    removedIds: [],
    cursor: null,
    ledger: { version: 1, rows: [] },
    ...overrides,
  };
}

function makeCurrentResponse(overrides: Partial<SyncResponse> = {}): SyncResponse {
  return {
    status: 'current',
    epoch: 'ep-1',
    version: 1,
    entries: [],
    removedIds: [],
    cursor: null,
    ledger: null,
    ...overrides,
  };
}

function baseRoutes(syncHandler: Handler | SyncResponse): Record<string, Handler | unknown> {
  return {
    'GET /api/me': signedInMe,
    'GET /api/me/personal/wallets': { wallets: [sampleWallet] } satisfies WalletDetailsResponse,
    'GET /api/me/personal/categories': {
      categories: [sampleCategory],
      recentIds: ['c-food'],
    } satisfies CategoriesResponse,
    'GET /api/me/personal/tags': { tags: [sampleTag] },
    'GET /api/me/personal/sync': syncHandler,
  };
}

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Object.defineProperty(document, 'visibilityState', {
    value: 'visible',
    configurable: true,
  });
  await forgetTxCopy(TEST_USER_ID);
});

describe('txCopy hooks', () => {
  it('first mount downloads and becomes ready', async () => {
    const e1 = makeEntry('e-1');
    const { calls } = mockFetch(baseRoutes(makeResetResponse([e1])));

    const queryClient = makeQueryClient();
    const { result, unmount } = renderHook(() => useTxCopy(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.snapshot?.entries).toEqual([e1]);
    expect(result.current.snapshot?.state.version).toBe(1);

    const syncCalls = calls.filter((c) => c.path === '/api/me/personal/sync');
    expect(syncCalls).toHaveLength(1);
    unmount();
  });

  it('useCopyList returns null rows until ready, then the rows', async () => {
    const e1 = makeEntry('e-1');
    let resolveSync!: (resp: Response) => void;
    const syncGate = new Promise<Response>((resolve) => {
      resolveSync = resolve;
    });

    mockFetch(baseRoutes(() => syncGate));

    const queryClient = makeQueryClient();
    const { result, unmount } = renderHook(() => useCopyList({ month: '2026-11' }), {
      wrapper: makeWrapper(queryClient),
    });

    expect(result.current.rows).toBeNull();
    expect(result.current.ready).toBe(false);

    resolveSync(Response.json(makeResetResponse([e1])));

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows![0]).toMatchObject({
      kind: 'entry',
      entry: {
        id: 'e-1',
        amount: 50_000,
        currency: 'VND',
        tags: ['work'],
      },
    });
    unmount();
  });

  it('a visibility change to visible triggers a sync', async () => {
    let syncCount = 0;
    mockFetch(
      baseRoutes(() => {
        syncCount += 1;
        return Response.json(
          syncCount === 1 ? makeResetResponse([makeEntry('e-1')]) : makeCurrentResponse(),
        );
      }),
    );

    const queryClient = makeQueryClient();
    const { result, unmount } = renderHook(() => useTxCopy(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(syncCount).toBe(1);

    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(syncCount).toBe(1);

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => expect(syncCount).toBe(2));
    unmount();
  });

  it('two requestTxCopySync calls while one runs make exactly two sync requests in total', async () => {
    let syncCount = 0;
    let releaseFirstManual!: () => void;
    const firstManualGate = new Promise<void>((resolve) => {
      releaseFirstManual = resolve;
    });

    mockFetch(
      baseRoutes(async () => {
        syncCount += 1;
        if (syncCount === 1) {
          return Response.json(makeResetResponse([makeEntry('e-1')]));
        }
        if (syncCount === 2) {
          await firstManualGate;
        }
        return Response.json(makeCurrentResponse());
      }),
    );

    const queryClient = makeQueryClient();
    const { result, unmount } = renderHook(() => useTxCopy(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(syncCount).toBe(1);

    const p1 = requestTxCopySync();
    await waitFor(() => expect(syncCount).toBe(2));

    const p2 = requestTxCopySync();
    const p3 = requestTxCopySync();

    releaseFirstManual();
    await Promise.all([p1, p2, p3]);

    // 1 initial mount sync + 2 coalesced manual syncs = 3 total (2 for the manual calls).
    expect(syncCount).toBe(3);
    unmount();
  });

  it('a failed sync keeps the copy readable', async () => {
    const e1 = makeEntry('e-1');
    let syncCount = 0;
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    mockFetch(
      baseRoutes(() => {
        syncCount += 1;
        if (syncCount === 1) {
          return Response.json(makeResetResponse([e1]));
        }
        return Response.json(
          { error: { code: 'INTERNAL', message: 'sync down' } },
          { status: 500 },
        );
      }),
    );

    const queryClient = makeQueryClient();
    const { result, unmount } = renderHook(() => useTxCopy(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.snapshot?.entries).toEqual([e1]);

    await act(async () => {
      await requestTxCopySync();
    });

    expect(syncCount).toBe(2);
    expect(result.current.status).toBe('ready');
    expect(result.current.snapshot?.entries).toEqual([e1]);
    unmount();
  });

  it('resetTxCopy downloads again', async () => {
    const e1 = makeEntry('e-1', { amount: 10_000 });
    const e2 = makeEntry('e-2', { amount: 20_000, syncVersion: 2 });
    let syncCount = 0;

    const { calls } = mockFetch(
      baseRoutes(() => {
        syncCount += 1;
        return Response.json(
          syncCount === 1
            ? makeResetResponse([e1], { epoch: 'ep-1', version: 1 })
            : makeResetResponse([e2], { epoch: 'ep-2', version: 2 }),
        );
      }),
    );

    const queryClient = makeQueryClient();
    const { result, unmount } = renderHook(() => useTxCopy(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.snapshot?.entries).toEqual([e1]);

    await act(async () => {
      await resetTxCopy();
    });

    expect(result.current.status).toBe('ready');
    expect(result.current.snapshot?.entries).toEqual([e2]);
    expect(result.current.snapshot?.state.epoch).toBe('ep-2');

    const syncUrls = calls
      .filter((c) => c.path === '/api/me/personal/sync')
      .map((c) => c.url);
    expect(syncUrls).toEqual(['/api/me/personal/sync', '/api/me/personal/sync']);
    unmount();
  });

  it('forgetTxCopy deletes the copy', async () => {
    const e1 = makeEntry('e-1');
    mockFetch(baseRoutes(makeResetResponse([e1])));

    const queryClient = makeQueryClient();
    const { result, unmount } = renderHook(() => useTxCopy(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    unmount();

    await forgetTxCopy(TEST_USER_ID);

    const store = await openTxCopyStore(TEST_USER_ID);
    expect(store).not.toBeNull();
    expect(await store!.load()).toBeNull();
  });

  it('status is unavailable when indexedDB is missing', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const { calls } = mockFetch(baseRoutes(makeResetResponse([makeEntry('e-1')])));

    const queryClient = makeQueryClient();
    queryClient.setQueryData(['me'], signedInMe);

    const { result, unmount } = renderHook(() => useTxCopy(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(result.current.snapshot).toBeNull();
    expect(calls.filter((c) => c.path === '/api/me/personal/sync')).toHaveLength(0);
    unmount();
  });
});
