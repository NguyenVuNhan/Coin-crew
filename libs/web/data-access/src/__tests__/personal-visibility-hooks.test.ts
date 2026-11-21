import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import {
  PERSONAL_ASSETS_KEY,
  PERSONAL_CATEGORIES_KEY,
  useSetAssetWallets,
  useSetCategoryWallets,
  useSetWalletVisibility,
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

describe('personal visibility hooks', () => {
  it('useSetWalletVisibility sends PUT to encoded wallet visibility route and invalidates categories and assets', async () => {
    const { calls } = mockFetch({
      'PUT /api/me/personal/wallets/w%2F1/visibility': { ok: true },
    });

    const queryClient = makeQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useSetWalletVisibility(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({
        walletId: 'w/1',
        categories: [{ id: 'food', visible: false }],
        assets: [{ id: 'btc', visible: true }],
      });
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: 'PUT',
      url: '/api/me/personal/wallets/w%2F1/visibility',
      body: {
        categories: [{ id: 'food', visible: false }],
        assets: [{ id: 'btc', visible: true }],
      },
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_CATEGORIES_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_ASSETS_KEY });
  });

  it('useSetCategoryWallets sends PUT to encoded category wallets route and invalidates categories and assets', async () => {
    const { calls } = mockFetch({
      'PUT /api/me/personal/categories/u1%3Afood%2F1/wallets': { ok: true },
    });

    const queryClient = makeQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useSetCategoryWallets(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({
        id: 'u1:food/1',
        walletIds: ['w1', 'w2'],
      });
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: 'PUT',
      url: '/api/me/personal/categories/u1%3Afood%2F1/wallets',
      body: { walletIds: ['w1', 'w2'] },
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_CATEGORIES_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_ASSETS_KEY });
  });

  it('useSetAssetWallets sends PUT to encoded asset wallets route and invalidates categories and assets', async () => {
    const { calls } = mockFetch({
      'PUT /api/me/personal/assets/a%2F1/wallets': { ok: true },
    });

    const queryClient = makeQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useSetAssetWallets(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({
        id: 'a/1',
        walletIds: ['w1'],
      });
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: 'PUT',
      url: '/api/me/personal/assets/a%2F1/wallets',
      body: { walletIds: ['w1'] },
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_CATEGORIES_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_ASSETS_KEY });
  });
});
