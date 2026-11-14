import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import type { PushDeviceSettings } from '@cc/core';
import { browserPlatform } from '@cc/web-platform';
import { sessionStore } from '@cc/web-platform/session';
import { useEnablePush, usePushDevice, usePushKey, useUpdatePushDevice } from '../push';
import { signOut } from '../signOut';

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

function stubPushBrowser(opts: {
  permission?: NotificationPermission;
  endpoint?: string;
  p256dh?: string;
  auth?: string;
  hasExistingSub?: boolean;
  unsubscribeThrows?: boolean;
  noRegistration?: boolean;
} = {}) {
  const endpoint = opts.endpoint ?? 'https://fcm.googleapis.com/fcm/send/dev-1';
  const p256dh = opts.p256dh ?? 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
  const auth = opts.auth ?? 'UUQM04vu21s2_7fX9G9M0Q';
  const permission = opts.permission ?? 'granted';

  const requestPermission = vi.fn(async () => permission);
  vi.stubGlobal('Notification', {
    permission,
    requestPermission,
  });
  vi.stubGlobal('PushManager', function PushManager() {});

  const unsubscribe = vi.fn(async () => {
    if (opts.unsubscribeThrows) throw new Error('unsubscribe failed');
    currentSub = null;
    return true;
  });

  const makeSub = () => ({
    endpoint,
    toJSON: () => ({
      endpoint,
      keys: { p256dh, auth },
    }),
    unsubscribe,
  });

  let currentSub: ReturnType<typeof makeSub> | null = opts.hasExistingSub ? makeSub() : null;

  const subscribe = vi.fn(async () => {
    currentSub = makeSub();
    return currentSub;
  });

  const getSubscription = vi.fn(async () => currentSub);

  const reg = opts.noRegistration
    ? undefined
    : {
        pushManager: {
          subscribe,
          getSubscription,
        },
      };

  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      getRegistration: vi.fn(async () => reg),
      ready: Promise.resolve(reg),
    },
  });

  return { requestPermission, subscribe, getSubscription, unsubscribe, endpoint, p256dh, auth };
}

const DEFAULT_SETTINGS: PushDeviceSettings = {
  newSession: true,
  sessionReminder: true,
  reminderLeadMinutes: 30,
  expenseNew: true,
};

beforeEach(async () => {
  localStorage.clear();
  await sessionStore.init(browserPlatform);
});

afterEach(() => {
  sessionStore.reset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('push data-access hooks', () => {
  it('usePushKey fetches GET /api/push/key', async () => {
    mockFetch({ 'GET /api/push/key': { publicKey: 'AQAB' } });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => usePushKey(), { wrapper: makeWrapper(queryClient) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe('AQAB');
  });

  it('useEnablePush rejects when no key is cached and does not call requestPermission', async () => {
    const { requestPermission } = stubPushBrowser();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    // Ensure no key is in cache
    const { result } = renderHook(() => useEnablePush(), { wrapper: makeWrapper(queryClient) });
    await expect(result.current.mutateAsync()).rejects.toThrow('push key not loaded');
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('useEnablePush with a cached key invokes requestPermission as the first await and PUTs the subscription', async () => {
    const { subscribe, requestPermission, endpoint, p256dh, auth } = stubPushBrowser();
    const order: string[] = [];
    const { calls } = mockFetch({
      'PUT /api/push/subscription': () => {
        order.push('fetch:PUT');
        return Response.json({ settings: DEFAULT_SETTINGS });
      },
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(['push', 'key'], 'AQAB');
    queryClient.setQueryData(['push', 'device'], null);

    requestPermission.mockImplementation(async () => {
      order.push('requestPermission');
      // Verify no network call has been made before requestPermission
      expect(calls).toHaveLength(0);
      return 'granted';
    });

    const { result } = renderHook(() => useEnablePush(), { wrapper: makeWrapper(queryClient) });

    let returned: PushDeviceSettings | undefined;
    await act(async () => {
      returned = await result.current.mutateAsync();
    });

    expect(order).toEqual(['requestPermission', 'fetch:PUT']);
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(returned).toEqual(DEFAULT_SETTINGS);

    const putCall = calls.find((c) => c.method === 'PUT' && c.path === '/api/push/subscription');
    expect(putCall).toBeDefined();
    expect(putCall!.body).toEqual({
      endpoint,
      keys: { p256dh, auth },
    });
    expect(queryClient.getQueryState(['push', 'device'])?.isInvalidated).toBe(true);
  });

  it('usePushDevice returns null on 404', async () => {
    stubPushBrowser({ hasExistingSub: true });
    mockFetch({
      'GET /api/push/subscription': () =>
        Response.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 }),
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => usePushDevice(true), { wrapper: makeWrapper(queryClient) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('usePushDevice returns null when no browser subscription exists and returns settings on 200', async () => {
    stubPushBrowser({ hasExistingSub: false });
    const { calls } = mockFetch({
      'GET /api/push/subscription': { settings: DEFAULT_SETTINGS },
    });

    const qc1 = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result: r1 } = renderHook(() => usePushDevice(true), { wrapper: makeWrapper(qc1) });
    await waitFor(() => expect(r1.current.isSuccess).toBe(true));
    expect(r1.current.data).toBeNull();
    expect(calls).toHaveLength(0);

    stubPushBrowser({ hasExistingSub: true });
    const qc2 = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result: r2 } = renderHook(() => usePushDevice(true), { wrapper: makeWrapper(qc2) });
    await waitFor(() => expect(r2.current.isSuccess).toBe(true));
    expect(r2.current.data).toEqual(DEFAULT_SETTINGS);
  });

  it('useUpdatePushDevice optimistically updates ["push","device"], PATCHes with endpoint, and rolls back on error', async () => {
    const { endpoint } = stubPushBrowser({ hasExistingSub: true });
    const updated: PushDeviceSettings = { ...DEFAULT_SETTINGS, reminderLeadMinutes: 60 };
    const { calls } = mockFetch({
      'PATCH /api/push/subscription': { settings: updated },
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(['push', 'device'], DEFAULT_SETTINGS);

    const { result } = renderHook(() => useUpdatePushDevice(), { wrapper: makeWrapper(queryClient) });
    await act(async () => {
      await result.current.mutateAsync({ reminderLeadMinutes: 60 });
    });

    const patchCall = calls.find((c) => c.method === 'PATCH' && c.path === '/api/push/subscription');
    expect(patchCall?.body).toEqual({ endpoint, reminderLeadMinutes: 60 });
    expect(queryClient.getQueryData(['push', 'device'])).toEqual(updated);

    // Rollback on failure
    mockFetch({
      'PATCH /api/push/subscription': () =>
        Response.json({ error: { code: 'INTERNAL', message: 'boom' } }, { status: 500 }),
    });
    await act(async () => {
      await expect(result.current.mutateAsync({ expenseNew: false })).rejects.toThrow();
    });
    expect(queryClient.getQueryData(['push', 'device'])).toEqual(updated);
  });
});

describe('signOut push cleanup', () => {
  it('removes the push subscription and still signs out when it fails', async () => {
    const { unsubscribe, endpoint } = stubPushBrowser({ hasExistingSub: true });
    const { calls } = mockFetch({
      'DELETE /api/push/subscription': null,
      'POST /api/auth/logout': null,
    });

    await signOut(browserPlatform, new QueryClient());

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'DELETE /api/push/subscription',
      'POST /api/auth/logout',
    ]);
    expect(calls[0]!.body).toEqual({ endpoint });

    // Now test when DELETE /api/push/subscription fails (500): signOut must still succeed
    stubPushBrowser({ hasExistingSub: true });
    const failingDelete = mockFetch({
      'DELETE /api/push/subscription': () =>
        Response.json({ error: { code: 'INTERNAL', message: 'boom' } }, { status: 500 }),
      'POST /api/auth/logout': null,
    });

    await expect(signOut(browserPlatform, new QueryClient())).resolves.toBeUndefined();
    expect(failingDelete.calls.some((c) => c.method === 'POST' && c.path === '/api/auth/logout')).toBe(true);
  });

  it('no registration -> getBrowserSubscription resolves null and signOut still calls /api/auth/logout', async () => {
    stubPushBrowser({ noRegistration: true });
    const { calls } = mockFetch({
      'POST /api/auth/logout': null,
    });

    await signOut(browserPlatform, new QueryClient());

    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(['POST /api/auth/logout']);
  });

  it('when browser unsubscribe() throws, signOut still sends DELETE to server with captured endpoint and logs out', async () => {
    const { unsubscribe, endpoint } = stubPushBrowser({ hasExistingSub: true, unsubscribeThrows: true });
    const { calls } = mockFetch({
      'DELETE /api/push/subscription': null,
      'POST /api/auth/logout': null,
    });

    await expect(signOut(browserPlatform, new QueryClient())).resolves.toBeUndefined();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'DELETE /api/push/subscription',
      'POST /api/auth/logout',
    ]);
    expect(calls[0]!.body).toEqual({ endpoint });
  });
});
