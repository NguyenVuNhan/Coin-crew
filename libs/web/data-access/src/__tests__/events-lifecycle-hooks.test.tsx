import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import type { EventSavedResponse, EventView } from '@cc/core';
import { todayLocal } from '@cc/web-util/localDate';
import * as groupCopyMod from '../txCopy/groupCopy';
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
  useResumeEvent,
  useStartEventNow,
  useStopEvent,
} from '../events';

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

function makeEventView(overrides: Partial<EventView> = {}): EventView {
  const today = todayLocal();
  return {
    id: 'ev-1',
    tagId: 'tag-1',
    tagName: 'dalat-281126',
    name: 'Đà Lạt',
    start: today,
    end: null,
    stoppedAt: null,
    countsFrom: today,
    groupIds: [],
    budgetId: null,
    createdAt: '2026-11-28T00:00:00.000Z',
    ...overrides,
  };
}

function expectInvalidatedAndSynced(
  invalidateSpy: ReturnType<typeof vi.spyOn>,
  groupSyncSpy: ReturnType<typeof vi.spyOn>,
) {
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_EVENTS_KEY });
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_BUDGETS_KEY });
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_TAGS_KEY });
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: WALLETS_KEY });
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_SUMMARY_KEY });
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_LIST_KEY });
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_HOLDINGS_KEY });
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_REPORT_KEY });
  expect(groupSyncSpy).toHaveBeenCalledTimes(1);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('events lifecycle hooks', () => {
  it('useStopEvent posts { today } to /stop, invalidates keys, and requests group copy sync', async () => {
    const today = todayLocal();
    const stoppedEvent = makeEventView({
      end: today,
      stoppedAt: '2026-11-28T02:00:00.000Z',
    });
    const { calls } = mockFetch({
      'POST /api/me/personal/events/ev-1/stop': { event: stoppedEvent },
    });
    const groupSyncSpy = vi
      .spyOn(groupCopyMod, 'requestGroupCopySync')
      .mockResolvedValue(undefined);
    const queryClient = makeQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result, unmount } = renderHook(() => useStopEvent(), {
      wrapper: makeWrapper(queryClient),
    });

    const response = await result.current.mutateAsync('ev-1');
    expect(response).toEqual({ event: stoppedEvent });

    const postCall = calls.find(
      (c) => c.method === 'POST' && c.path === '/api/me/personal/events/ev-1/stop',
    );
    expect(postCall).toBeDefined();
    expect(postCall!.body).toEqual({ today });

    expectInvalidatedAndSynced(invalidateSpy, groupSyncSpy);
    unmount();
  });

  it('useResumeEvent posts { today } to /resume, invalidates keys, and requests group copy sync', async () => {
    const today = todayLocal();
    const saved: EventSavedResponse = {
      event: makeEventView({ end: null, stoppedAt: null }),
      existing: {
        own: { count: 1, totals: [{ currency: 'VND', amount: 50_000 }] },
        shares: { count: 0, total: 0 },
      },
    };
    const { calls } = mockFetch({
      'POST /api/me/personal/events/ev-1/resume': saved,
    });
    const groupSyncSpy = vi
      .spyOn(groupCopyMod, 'requestGroupCopySync')
      .mockResolvedValue(undefined);
    const queryClient = makeQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result, unmount } = renderHook(() => useResumeEvent(), {
      wrapper: makeWrapper(queryClient),
    });

    const response = await result.current.mutateAsync('ev-1');
    expect(response).toEqual(saved);

    const postCall = calls.find(
      (c) => c.method === 'POST' && c.path === '/api/me/personal/events/ev-1/resume',
    );
    expect(postCall).toBeDefined();
    expect(postCall!.body).toEqual({ today });

    expectInvalidatedAndSynced(invalidateSpy, groupSyncSpy);
    unmount();
  });

  it('useStartEventNow posts { today } to /start-now, invalidates keys, and requests group copy sync', async () => {
    const today = todayLocal();
    const saved: EventSavedResponse = {
      event: makeEventView({ start: today, end: null, stoppedAt: null }),
      existing: {
        own: { count: 0, totals: [] },
        shares: { count: 0, total: 0 },
      },
    };
    const { calls } = mockFetch({
      'POST /api/me/personal/events/ev-1/start-now': saved,
    });
    const groupSyncSpy = vi
      .spyOn(groupCopyMod, 'requestGroupCopySync')
      .mockResolvedValue(undefined);
    const queryClient = makeQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result, unmount } = renderHook(() => useStartEventNow(), {
      wrapper: makeWrapper(queryClient),
    });

    const response = await result.current.mutateAsync('ev-1');
    expect(response).toEqual(saved);

    const postCall = calls.find(
      (c) => c.method === 'POST' && c.path === '/api/me/personal/events/ev-1/start-now',
    );
    expect(postCall).toBeDefined();
    expect(postCall!.body).toEqual({ today });

    expectInvalidatedAndSynced(invalidateSpy, groupSyncSpy);
    unmount();
  });
});
