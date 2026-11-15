import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useMe, usePersonalArea } from '../hooks';
import { useSetPersonalArea } from '../personal';
import { writePersonalHint } from '../personalHint';

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

const signedInMe = {
  user: {
    id: 'u-1',
    email: 'a@b.c',
    name: 'A',
    consentAt: '2026-10-12T00:00:00.000Z',
  },
  signIn: { zalo: true },
  mergeRequests: { incoming: [], outgoing: [] },
};

const signedInMeOn = {
  ...signedInMe,
  personalArea: true,
};

const signedOutMe = {
  user: null,
  signIn: { zalo: true },
  mergeRequests: { incoming: [], outgoing: [] },
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('personal-area hooks and hint', () => {
  it('is false with no data and no hint', () => {
    const { calls } = mockFetch({});
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => usePersonalArea(), {
      wrapper: makeWrapper(queryClient),
    });
    expect(result.current).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('is true with no data when the hint is set', () => {
    const { calls } = mockFetch({});
    writePersonalHint(true);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => usePersonalArea(), {
      wrapper: makeWrapper(queryClient),
    });
    expect(result.current).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('follows the server once /api/me has loaded', async () => {
    mockFetch({
      'GET /api/me': signedInMeOn,
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () => {
        const me = useMe();
        const personalArea = usePersonalArea();
        return { me, personalArea };
      },
      { wrapper: makeWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.me.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.personalArea).toBe(true));
    expect(localStorage.getItem('personalArea')).toBe('1');
  });

  it('forgets the hint when the server says off', async () => {
    writePersonalHint(true);
    expect(localStorage.getItem('personalArea')).toBe('1');

    mockFetch({
      'GET /api/me': signedInMe,
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () => {
        const me = useMe();
        const personalArea = usePersonalArea();
        return { me, personalArea };
      },
      { wrapper: makeWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.me.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.personalArea).toBe(false));
    expect(localStorage.getItem('personalArea')).toBeNull();
  });

  it('forgets the hint when signed out', async () => {
    writePersonalHint(true);
    expect(localStorage.getItem('personalArea')).toBe('1');

    mockFetch({
      'GET /api/me': signedOutMe,
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () => {
        const me = useMe();
        const personalArea = usePersonalArea();
        return { me, personalArea };
      },
      { wrapper: makeWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.me.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.personalArea).toBe(false));
    expect(localStorage.getItem('personalArea')).toBeNull();
  });

  it('useMe adds no personalArea key when the API omits it', async () => {
    mockFetch({
      'GET /api/me': signedInMe,
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useMe(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeDefined();
    expect('personalArea' in result.current.data!).toBe(false);
  });

  it('useSetPersonalArea sends the PATCH, stores the hint and refetches /api/me', async () => {
    let meCount = 0;
    const { calls } = mockFetch({
      'GET /api/me': () => {
        meCount++;
        return Response.json(meCount > 1 ? signedInMeOn : signedInMe);
      },
      'PATCH /api/me/personal': { enabled: true },
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { result } = renderHook(
      () => {
        const me = useMe();
        const setPersonalArea = useSetPersonalArea();
        return { me, setPersonalArea };
      },
      { wrapper: makeWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.me.isSuccess).toBe(true));
    expect(meCount).toBe(1);
    expect(localStorage.getItem('personalArea')).toBeNull();

    act(() => {
      result.current.setPersonalArea.mutate(true);
    });

    await waitFor(() => expect(result.current.setPersonalArea.isSuccess).toBe(true));

    const patchCall = calls.find(
      (c) => c.method === 'PATCH' && c.path === '/api/me/personal',
    );
    expect(patchCall).toBeDefined();
    expect(patchCall!.body).toEqual({ enabled: true });
    expect(localStorage.getItem('personalArea')).toBe('1');

    await waitFor(() => expect(meCount).toBeGreaterThanOrEqual(2));
  });

  it('useSetPersonalArea leaves the hint alone when the save fails', async () => {
    mockFetch({
      'PATCH /api/me/personal': () =>
        Response.json({ error: { code: 'INTERNAL', message: 'save failed' } }, { status: 500 }),
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { result } = renderHook(() => useSetPersonalArea(), {
      wrapper: makeWrapper(queryClient),
    });

    expect(localStorage.getItem('personalArea')).toBeNull();

    act(() => {
      result.current.mutate(true);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(localStorage.getItem('personalArea')).toBeNull();

    writePersonalHint(true);
    expect(localStorage.getItem('personalArea')).toBe('1');

    act(() => {
      result.current.mutate(false);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(localStorage.getItem('personalArea')).toBe('1');
  });
});
