import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import type {
  AssetsResponse,
  AssetView,
  EntriesResponse,
  EntryInput,
  HoldingsResponse,
  HoldingView,
  ListResponse,
} from '@cc/core';
import {
  buildListQueryString,
  PERSONAL_ASSETS_KEY,
  PERSONAL_HOLDINGS_KEY,
  PERSONAL_LIST_KEY,
  useAssets,
  useCreateAsset,
  useCreateEntry,
  useDeleteAsset,
  useDeleteEntry,
  useHoldings,
  usePersonalList,
  useRestoreEntries,
  useUpdateAsset,
  useUpdateEntry,
} from '../personalMoney';

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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const sampleAsset: AssetView = {
  id: 'a-1',
  name: 'SJC Gold',
  unit: 'chỉ',
  groupName: 'Gold',
  decimals: 2,
  hidden: false,
  sortOrder: 0,
  entryCount: 1,
};

const sampleHolding: HoldingView = {
  walletId: 'w-inv',
  assetId: 'a-1',
  quantity: 2.5,
  cost: 20_000_000,
  costVnd: 20_000_000,
};

describe('personal asset and holdings hooks', () => {
  it('useAssets fetches GET /api/me/personal/assets and respects enabled', async () => {
    const resp: AssetsResponse = { assets: [sampleAsset] };
    const { calls } = mockFetch({
      'GET /api/me/personal/assets': resp,
    });

    const queryClient = makeQueryClient();
    const { result: disabledResult } = renderHook(() => useAssets({ enabled: false }), {
      wrapper: makeWrapper(queryClient),
    });
    expect(disabledResult.current.fetchStatus).toBe('idle');
    expect(calls).toHaveLength(0);

    const { result } = renderHook(() => useAssets(), {
      wrapper: makeWrapper(queryClient),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(resp);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('/api/me/personal/assets');
    expect(queryClient.getQueryData(PERSONAL_ASSETS_KEY)).toEqual(resp);
  });

  it('useCreateAsset and useUpdateAsset mutate and invalidate PERSONAL_ASSETS_KEY', async () => {
    const { calls } = mockFetch({
      'POST /api/me/personal/assets': { asset: sampleAsset },
      'PATCH /api/me/personal/assets/a-1': { asset: { ...sampleAsset, hidden: true } },
    });

    const queryClient = makeQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(
      () => ({
        create: useCreateAsset(),
        update: useUpdateAsset(),
      }),
      { wrapper: makeWrapper(queryClient) },
    );

    await act(async () => {
      await result.current.create.mutateAsync({
        name: 'SJC Gold',
        unit: 'chỉ',
        groupName: 'Gold',
        decimals: 2,
      });
    });

    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: '/api/me/personal/assets',
      body: { name: 'SJC Gold', unit: 'chỉ', groupName: 'Gold', decimals: 2 },
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_ASSETS_KEY });

    invalidateSpy.mockClear();

    await act(async () => {
      await result.current.update.mutateAsync({ id: 'a-1', input: { hidden: true } });
    });

    expect(calls[1]).toMatchObject({
      method: 'PATCH',
      url: '/api/me/personal/assets/a-1',
      body: { hidden: true },
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_ASSETS_KEY });
  });

  it('useDeleteAsset without moveTo invalidates only PERSONAL_ASSETS_KEY; with moveTo also invalidates list and holdings', async () => {
    const { calls } = mockFetch({
      'DELETE /api/me/personal/assets/a-1': { ok: true },
    });

    const queryClient = makeQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useDeleteAsset(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: 'a-1' });
    });

    expect(calls[0]!.url).toBe('/api/me/personal/assets/a-1');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_ASSETS_KEY });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: PERSONAL_LIST_KEY });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: PERSONAL_HOLDINGS_KEY });

    invalidateSpy.mockClear();

    await act(async () => {
      await result.current.mutateAsync({ id: 'a-1', moveTo: 'a/2' });
    });

    expect(calls[1]!.url).toBe('/api/me/personal/assets/a-1?moveTo=a%2F2');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_ASSETS_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_LIST_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_HOLDINGS_KEY });
  });

  it('useHoldings fetches all or filtered by walletId with the expected query key', async () => {
    const resp: HoldingsResponse = { holdings: [sampleHolding] };
    const { calls } = mockFetch({
      'GET /api/me/personal/holdings': resp,
    });

    const queryClient = makeQueryClient();

    const { result: allResult } = renderHook(() => useHoldings(), {
      wrapper: makeWrapper(queryClient),
    });
    await waitFor(() => expect(allResult.current.isSuccess).toBe(true));
    expect(allResult.current.data).toEqual(resp);
    expect(calls[0]!.url).toBe('/api/me/personal/holdings');
    expect(queryClient.getQueryData([...PERSONAL_HOLDINGS_KEY, 'all'])).toEqual(resp);

    const { result: walletResult } = renderHook(() => useHoldings('w/1'), {
      wrapper: makeWrapper(queryClient),
    });
    await waitFor(() => expect(walletResult.current.isSuccess).toBe(true));
    expect(calls[1]!.url).toBe('/api/me/personal/holdings?walletId=w%2F1');
    expect(queryClient.getQueryData([...PERSONAL_HOLDINGS_KEY, 'w/1'])).toEqual(resp);
  });

  it('buildListQueryString and usePersonalList pass assetId and type=trade', async () => {
    expect(buildListQueryString({ assetId: 'a-1', type: 'trade' })).toBe(
      '?assetId=a-1&type=trade',
    );

    const mockList: ListResponse = { rows: [], totals: [] };
    const { calls } = mockFetch({
      'GET /api/me/personal/transactions': mockList,
    });

    const queryClient = makeQueryClient();
    const { result } = renderHook(() => usePersonalList({ assetId: 'a-1', type: 'trade' }), {
      wrapper: makeWrapper(queryClient),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls[0]!.url).toBe('/api/me/personal/transactions?assetId=a-1&type=trade');
  });

  it('entry mutations invalidate PERSONAL_ASSETS_KEY and PERSONAL_HOLDINGS_KEY', async () => {
    const sampleInput: EntryInput = {
      type: 'expense',
      walletId: 'w-1',
      amount: 50_000,
      categoryId: 'c-1',
      date: '2026-11-16',
    };
    const emptyEntries: EntriesResponse = { entries: [] };

    mockFetch({
      'POST /api/me/personal/transactions': emptyEntries,
      'PATCH /api/me/personal/transactions/e-1': emptyEntries,
      'DELETE /api/me/personal/transactions/e-1': emptyEntries,
      'POST /api/me/personal/transactions/restore': emptyEntries,
    });

    const queryClient = makeQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(
      () => ({
        create: useCreateEntry(),
        update: useUpdateEntry(),
        del: useDeleteEntry(),
        restore: useRestoreEntries(),
      }),
      { wrapper: makeWrapper(queryClient) },
    );

    await act(async () => {
      await result.current.create.mutateAsync(sampleInput);
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_ASSETS_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_HOLDINGS_KEY });

    invalidateSpy.mockClear();
    await act(async () => {
      await result.current.update.mutateAsync({ id: 'e-1', input: sampleInput });
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_ASSETS_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_HOLDINGS_KEY });

    invalidateSpy.mockClear();
    await act(async () => {
      await result.current.del.mutateAsync('e-1');
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_ASSETS_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_HOLDINGS_KEY });

    invalidateSpy.mockClear();
    await act(async () => {
      await result.current.restore.mutateAsync(emptyEntries);
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_ASSETS_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_HOLDINGS_KEY });
  });
});
