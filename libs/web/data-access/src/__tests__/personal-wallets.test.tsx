import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import type {
  WalletView,
  WalletsResponse,
  CreateWalletInput,
} from '@cc/core';
import { WALLETS_KEY, useCreateWallet, useWallets } from '../personal';
import { ApiClientError } from '../client';

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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('personal wallets hooks', () => {
  it('useWallets fetches GET /api/me/personal/wallets and returns the list', async () => {
    const mockWallets: WalletView[] = [
      { id: 'w-1', name: 'Cash', currency: 'VND', balance: 500000, isDefault: true },
      { id: 'w-2', name: 'Bank', currency: 'VND', balance: 1200000, isDefault: false },
    ];

    const { calls } = mockFetch({
      'GET /api/me/personal/wallets': { wallets: mockWallets },
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(() => useWallets(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.wallets).toEqual(mockWallets);

    const getCalls = calls.filter(
      (c) => c.method === 'GET' && c.path === '/api/me/personal/wallets',
    );
    expect(getCalls).toHaveLength(1);
  });

  it('useWallets({ enabled: false }) makes no request', () => {
    const { calls } = mockFetch({
      'GET /api/me/personal/wallets': { wallets: [] },
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(() => useWallets({ enabled: false }), {
      wrapper: makeWrapper(queryClient),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.isFetching).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it('useCreateWallet posts { name, startAmount } and afterwards a mounted useWallets shows the new wallet without a second GET', async () => {
    const initialWallets: WalletView[] = [
      { id: 'w-1', name: 'Cash', currency: 'VND', balance: 500000, isDefault: true },
    ];
    const newWallet: WalletView = {
      id: 'w-2',
      name: 'Savings',
      currency: 'VND',
      balance: 1000000,
      isDefault: false,
    };

    let getCount = 0;
    const { calls } = mockFetch({
      'GET /api/me/personal/wallets': () => {
        getCount++;
        return Response.json({ wallets: initialWallets });
      },
      'POST /api/me/personal/wallets': { wallet: newWallet },
    });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const { result } = renderHook(
      () => {
        const wallets = useWallets();
        const createWallet = useCreateWallet();
        return { wallets, createWallet };
      },
      { wrapper: makeWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.wallets.isSuccess).toBe(true));
    expect(result.current.wallets.data?.wallets).toEqual(initialWallets);
    expect(getCount).toBe(1);

    const input: CreateWalletInput = { name: 'Savings', startAmount: 1000000 };
    act(() => {
      result.current.createWallet.mutate(input);
    });

    await waitFor(() => expect(result.current.createWallet.isSuccess).toBe(true));

    const postCall = calls.find(
      (c) => c.method === 'POST' && c.path === '/api/me/personal/wallets',
    );
    expect(postCall).toBeDefined();
    expect(postCall!.body).toEqual(input);

    expect(result.current.wallets.data?.wallets).toEqual([
      ...initialWallets,
      newWallet,
    ]);
    expect(getCount).toBe(1);
    expect(
      calls.filter((c) => c.method === 'GET' && c.path === '/api/me/personal/wallets'),
    ).toHaveLength(1);
  });

  it('a failed create (status 409 with error.code ALREADY_HANDLED) leaves the cached list unchanged and the mutation in error', async () => {
    const initialWallets: WalletView[] = [
      { id: 'w-1', name: 'Cash', currency: 'VND', balance: 500000, isDefault: true },
    ];

    let getCount = 0;
    const { calls } = mockFetch({
      'GET /api/me/personal/wallets': () => {
        getCount++;
        return Response.json({ wallets: initialWallets });
      },
      'POST /api/me/personal/wallets': () =>
        Response.json(
          { error: { code: 'ALREADY_HANDLED', message: 'Wallet already exists' } },
          { status: 409 },
        ),
    });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const { result } = renderHook(
      () => {
        const wallets = useWallets();
        const createWallet = useCreateWallet();
        return { wallets, createWallet };
      },
      { wrapper: makeWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.wallets.isSuccess).toBe(true));
    expect(result.current.wallets.data?.wallets).toEqual(initialWallets);
    expect(getCount).toBe(1);

    act(() => {
      result.current.createWallet.mutate({ name: 'Duplicate', startAmount: 0 });
    });

    await waitFor(() => expect(result.current.createWallet.isError).toBe(true));

    expect(result.current.createWallet.error).toBeInstanceOf(ApiClientError);
    expect(result.current.createWallet.error?.code).toBe('ALREADY_HANDLED');
    expect(result.current.createWallet.error?.status).toBe(409);

    expect(result.current.wallets.data?.wallets).toEqual(initialWallets);
    expect(queryClient.getQueryData<WalletsResponse>(WALLETS_KEY)).toEqual({
      wallets: initialWallets,
    });
  });
});
