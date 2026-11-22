import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { ApiClientError } from '../client';
import { WALLETS_KEY } from '../personal';
import {
  PERSONAL_HOLDINGS_KEY,
  PERSONAL_LIST_KEY,
  PERSONAL_SUMMARY_KEY,
} from '../personalMoney';
import { useCancelTripDelete, useScheduleTripDelete } from '../tripDelete';
import { requestGroupCopySync } from '../txCopy/groupCopy';

vi.mock('../txCopy/groupCopy', () => ({
  requestGroupCopySync: vi.fn(() => Promise.resolve()),
}));

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
  vi.clearAllMocks();
});

describe('trip delete mutation hooks', () => {
  it('useScheduleTripDelete posts to /api/trips/:id/delete, invalidates trip + personal queries, and triggers groupCopy sync', async () => {
    const deleteAfter = '2026-12-22T10:00:00.000Z';
    const { calls } = mockFetch({
      'POST /api/trips/t-1/delete': { deleteAfter },
    });
    const qc = makeQueryClient();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useScheduleTripDelete('t-1'), {
      wrapper: makeWrapper(qc),
    });

    let response: { deleteAfter: string } | undefined;
    await act(async () => {
      response = await result.current.mutateAsync();
    });

    expect(response).toEqual({ deleteAfter });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/api/trips/t-1/delete' });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['trip', 't-1'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['trips'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: WALLETS_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_SUMMARY_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_LIST_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_HOLDINGS_KEY });
    expect(requestGroupCopySync).toHaveBeenCalledTimes(1);
  });

  it('useCancelTripDelete posts to /api/trips/:id/cancel-delete, invalidates trip + personal queries, and triggers groupCopy sync', async () => {
    const { calls } = mockFetch({
      'POST /api/trips/t-1/cancel-delete': null,
    });
    const qc = makeQueryClient();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useCancelTripDelete('t-1'), {
      wrapper: makeWrapper(qc),
    });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/api/trips/t-1/cancel-delete' });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['trip', 't-1'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['trips'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: WALLETS_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_SUMMARY_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_LIST_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_HOLDINGS_KEY });
    expect(requestGroupCopySync).toHaveBeenCalledTimes(1);
  });

  it('useScheduleTripDelete exposes ApiClientError on failure without swallowing it', async () => {
    mockFetch({
      'POST /api/trips/t-1/delete': () =>
        Response.json(
          { error: { code: 'CONFLICT', message: 'Archive the group before deleting it.' } },
          { status: 409 },
        ),
    });
    const qc = makeQueryClient();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useScheduleTripDelete('t-1'), {
      wrapper: makeWrapper(qc),
    });

    let caught: unknown;
    await act(async () => {
      try {
        await result.current.mutateAsync();
      } catch (err) {
        caught = err;
      }
    });

    expect(caught).toBeInstanceOf(ApiClientError);
    expect(caught).toMatchObject({
      code: 'CONFLICT',
      status: 409,
      message: 'Archive the group before deleting it.',
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiClientError);
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(requestGroupCopySync).not.toHaveBeenCalled();
  });

  it('useCancelTripDelete exposes ApiClientError on failure without swallowing it', async () => {
    mockFetch({
      'POST /api/trips/t-1/cancel-delete': () =>
        Response.json(
          { error: { code: 'FORBIDDEN', message: 'Only the organiser can do that.' } },
          { status: 403 },
        ),
    });
    const qc = makeQueryClient();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useCancelTripDelete('t-1'), {
      wrapper: makeWrapper(qc),
    });

    let caught: unknown;
    await act(async () => {
      try {
        await result.current.mutateAsync();
      } catch (err) {
        caught = err;
      }
    });

    expect(caught).toBeInstanceOf(ApiClientError);
    expect(caught).toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
      message: 'Only the organiser can do that.',
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiClientError);
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(requestGroupCopySync).not.toHaveBeenCalled();
  });
});
