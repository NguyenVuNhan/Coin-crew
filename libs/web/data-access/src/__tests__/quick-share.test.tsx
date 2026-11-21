import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import type { GroupLinkView } from '@cc/core';
import { ApiClientError } from '../client';
import { WALLETS_KEY } from '../personal';
import {
  PERSONAL_CATEGORIES_KEY,
  PERSONAL_HOLDINGS_KEY,
  PERSONAL_LIST_KEY,
  PERSONAL_SUMMARY_KEY,
  PERSONAL_TAGS_KEY,
} from '../personalMoney';
import { QuickShareLinkError, useSaveQuickShare, type QuickShareInput } from '../quickShare';
import { onTxCopySync } from '../txCopy/syncEvents';

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

const sampleInput: QuickShareInput = {
  tripId: 't-led',
  expense: {
    description: 'Ăn uống',
    amount: 50_000,
    spentOn: '2026-11-21',
    payerId: 'p-me',
    mode: 'equal',
    entries: [
      { participantId: 'p-me', value: 1 },
      { participantId: 'p-minh', value: 1 },
    ],
  },
  link: {
    intent: 'shared',
    categoryId: 'cat-food',
    walletId: 'w-bank',
    tagIds: ['t-1'],
    excludeFromReports: false,
  },
};

const sampleLinkView: GroupLinkView = {
  walletId: 'w-bank',
  categoryId: 'cat-food',
  tagIds: ['t-1'],
  intent: 'shared',
  excludeFromReports: false,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useSaveQuickShare', () => {
  it('POSTs the expense then PUTs the link in order, invalidates queries, and requests tx copy sync', async () => {
    const { calls } = mockFetch({
      'POST /api/trips/t-led/expenses': { expenseId: 'exp-123' },
      'PUT /api/me/personal/group-links/exp-123': { link: sampleLinkView },
    });

    const queryClient = makeQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const syncListener = vi.fn();
    const unsubscribe = onTxCopySync(syncListener);

    try {
      const { result } = renderHook(() => useSaveQuickShare(), {
        wrapper: makeWrapper(queryClient),
      });

      let returned: { expenseId: string } | undefined;
      await act(async () => {
        returned = await result.current.save(sampleInput);
      });

      expect(returned).toEqual({ expenseId: 'exp-123' });
      expect(result.current.isSaving).toBe(false);
      expect(result.current.error).toBeNull();

      expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
        'POST /api/trips/t-led/expenses',
        'PUT /api/me/personal/group-links/exp-123',
      ]);
      expect(calls[0]!.body).toEqual(sampleInput.expense);
      expect(calls[1]!.body).toEqual(sampleInput.link);

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_LIST_KEY });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: WALLETS_KEY });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_SUMMARY_KEY });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_HOLDINGS_KEY });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_TAGS_KEY });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_CATEGORIES_KEY });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['trip', 't-led'] });
      expect(syncListener).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
    }
  });

  it('throws ApiClientError and makes no PUT when the expense POST fails', async () => {
    const { calls } = mockFetch({
      'POST /api/trips/t-led/expenses': () =>
        Response.json(
          { error: { code: 'VALIDATION_ERROR', message: 'Invalid expense' } },
          { status: 400 },
        ),
    });

    const queryClient = makeQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useSaveQuickShare(), {
      wrapper: makeWrapper(queryClient),
    });

    let caught: unknown;
    await act(async () => {
      try {
        await result.current.save(sampleInput);
      } catch (err) {
        caught = err;
      }
    });

    expect(caught).toBeInstanceOf(ApiClientError);
    expect((caught as ApiClientError).status).toBe(400);
    expect(result.current.error).toBe(caught);
    expect(result.current.isSaving).toBe(false);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'POST /api/trips/t-led/expenses',
    ]);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('throws QuickShareLinkError with expenseId on PUT 500, and retryLink PUTs without a second POST', async () => {
    let putAttempts = 0;
    const { calls } = mockFetch({
      'POST /api/trips/t-led/expenses': { expenseId: 'exp-456' },
      'PUT /api/me/personal/group-links/exp-456': () => {
        putAttempts += 1;
        if (putAttempts === 1) {
          return Response.json(
            { error: { code: 'INTERNAL', message: 'Link save failed' } },
            { status: 500 },
          );
        }
        return Response.json({ link: sampleLinkView });
      },
    });

    const queryClient = makeQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const syncListener = vi.fn();
    const unsubscribe = onTxCopySync(syncListener);

    try {
      const { result } = renderHook(() => useSaveQuickShare(), {
        wrapper: makeWrapper(queryClient),
      });

      let caught: unknown;
      await act(async () => {
        try {
          await result.current.save(sampleInput);
        } catch (err) {
          caught = err;
        }
      });

      expect(caught).toBeInstanceOf(QuickShareLinkError);
      expect((caught as QuickShareLinkError).expenseId).toBe('exp-456');
      expect(result.current.error).toBe(caught);
      expect(result.current.isSaving).toBe(false);
      expect(invalidateSpy).not.toHaveBeenCalled();
      expect(syncListener).not.toHaveBeenCalled();

      await act(async () => {
        await result.current.retryLink();
      });

      expect(result.current.error).toBeNull();
      expect(result.current.isSaving).toBe(false);
      expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
        'POST /api/trips/t-led/expenses',
        'PUT /api/me/personal/group-links/exp-456',
        'PUT /api/me/personal/group-links/exp-456',
      ]);
      expect(calls[2]!.body).toEqual(sampleInput.link);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_LIST_KEY });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['trip', 't-led'] });
      expect(syncListener).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
    }
  });
});
