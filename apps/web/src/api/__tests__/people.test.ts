import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { type ReactNode } from 'react';
import { ApiClientError } from '../client';
import { mockApi } from '../../test/render';
import {
  usePeopleSummary,
  useLedger,
  useInvalidatePeople,
  requestLink,
  settle,
  confirmSettlement,
  setNickname,
  linkPeople,
  importPerson,
  PEOPLE_SUMMARY_QUERY_KEY,
} from '../people';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function createWrapper(queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
})) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('usePeopleSummary', () => {
  it('refetches while incomplete then stops after at most 8 times in a row', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let fetchCount = 0;
    mockApi({
      'GET /api/me/people/summary': () => {
        fetchCount += 1;
        return Response.json({
          people: [],
          incomplete: true,
        });
      },
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = createWrapper(queryClient);

    const { result } = renderHook(() => usePeopleSummary(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fetchCount).toBe(1);
    expect(result.current.incomplete).toBe(true);

    // Advance timers for 8 consecutive automatic refetches (8 * 500 ms)
    for (let i = 0; i < 8; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
    }

    // Total fetches: 1 initial + 8 automatic refetches = 9
    await waitFor(() => expect(fetchCount).toBe(9));

    // Advance further time: should not refetch again
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(fetchCount).toBe(9);
    expect(result.current.incomplete).toBe(true);
  });

  it('stops refetching when incomplete becomes false', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let fetchCount = 0;
    mockApi({
      'GET /api/me/people/summary': () => {
        fetchCount += 1;
        return Response.json({
          people: [
            {
              key: 'u:u1',
              name: 'Alice',
              nickname: null,
              userId: 'u1',
              groupLabel: null,
              total: 100,
              items: [],
              waiting: [],
            },
          ],
          incomplete: fetchCount < 3,
        });
      },
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = createWrapper(queryClient);

    const { result } = renderHook(() => usePeopleSummary(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fetchCount).toBe(1);
    expect(result.current.incomplete).toBe(true);

    // 1st refetch: incomplete is true
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(fetchCount).toBe(2);

    // 2nd refetch: incomplete is false
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    await waitFor(() => expect(result.current.incomplete).toBe(false));
    expect(fetchCount).toBe(3);
    expect(result.current.people).toHaveLength(1);

    // Advance further time: no more refetches
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(fetchCount).toBe(3);
  });

  it('resets retry counter on manual refetch', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let fetchCount = 0;
    mockApi({
      'GET /api/me/people/summary': () => {
        fetchCount += 1;
        return Response.json({
          people: [],
          incomplete: true,
        });
      },
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = createWrapper(queryClient);

    const { result } = renderHook(() => usePeopleSummary(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Exhaust 8 automatic refetches
    for (let i = 0; i < 8; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
    }
    expect(fetchCount).toBe(9);

    // Manual refetch
    await act(async () => {
      result.current.refetch();
    });
    await waitFor(() => expect(fetchCount).toBe(10));

    // Refetches automatically again after manual refetch
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(fetchCount).toBe(11);
  });

  it('exposes ApiClientError on query error', async () => {
    mockApi({
      'GET /api/me/people/summary': () =>
        Response.json({ error: { code: 'INTERNAL', message: 'Database error' } }, { status: 500 }),
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = createWrapper(queryClient);

    const { result } = renderHook(() => usePeopleSummary(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBeInstanceOf(ApiClientError);
    expect(result.current.error?.code).toBe('INTERNAL');
    expect(result.current.incomplete).toBe(false);
  });
});

describe('useLedger', () => {
  it('fetches ledger from /api/me/ledger', async () => {
    mockApi({
      'GET /api/me/ledger': {
        tripId: 'trip-ledger-1',
        ownerPid: 'pid-owner-1',
      },
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = createWrapper(queryClient);

    const { result } = renderHook(() => useLedger(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.ledger).toEqual({
      tripId: 'trip-ledger-1',
      ownerPid: 'pid-owner-1',
    });
  });
});

describe('settle', () => {
  it('posts the right body and URL with an encoded key u:u-minh', async () => {
    const { calls } = mockApi({
      'POST /api/me/people/u%3Au-minh/settle': {
        settlementId: 'set-123',
        status: 'confirmed',
      },
    });

    const result = await settle('u:u-minh', 50_000, 'toOwner');

    expect(result).toEqual({ settlementId: 'set-123', status: 'confirmed' });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      method: 'POST',
      path: '/api/me/people/u%3Au-minh/settle',
      body: { paid: 50_000, direction: 'toOwner' },
    });
  });

  it('posts with fromOwner direction and invalidates queryClient if provided', async () => {
    const { calls } = mockApi({
      'POST /api/me/people/u%3Au-minh/settle': {
        settlementId: 'set-456',
        status: 'says_paid',
      },
    });

    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const result = await settle('u:u-minh', 75_000, 'fromOwner', queryClient);

    expect(result).toEqual({ settlementId: 'set-456', status: 'says_paid' });
    expect(calls[0]!.body).toEqual({ paid: 75_000, direction: 'fromOwner' });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PEOPLE_SUMMARY_QUERY_KEY });
  });
});

describe('requestLink', () => {
  it('posts to /api/me/people/:key/request-link with encoded key', async () => {
    const { calls } = mockApi({
      'POST /api/me/people/p%3Ap-1/request-link': {
        url: 'https://coincrew.app/r/token-abc',
      },
    });

    const result = await requestLink('p:p-1');

    expect(result).toEqual({ url: 'https://coincrew.app/r/token-abc' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.path).toBe('/api/me/people/p%3Ap-1/request-link');
    expect(calls[0]!.method).toBe('POST');
  });
});

describe('confirmSettlement', () => {
  it('posts to /api/me/settlements/:sid/confirm and optionally invalidates', async () => {
    const { calls } = mockApi({
      'POST /api/me/settlements/s-789/confirm': null,
    });

    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await confirmSettlement('s-789', queryClient);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.path).toBe('/api/me/settlements/s-789/confirm');
    expect(calls[0]!.method).toBe('POST');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PEOPLE_SUMMARY_QUERY_KEY });
  });
});

describe('setNickname', () => {
  it('puts to /api/me/people/:key/nickname with encoded key and nickname JSON', async () => {
    const { calls } = mockApi({
      'PUT /api/me/people/u%3Au-minh/nickname': {},
    });

    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await setNickname('u:u-minh', 'Minh Boss', queryClient);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.path).toBe('/api/me/people/u%3Au-minh/nickname');
    expect(calls[0]!.method).toBe('PUT');
    expect(calls[0]!.body).toEqual({ nickname: 'Minh Boss' });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PEOPLE_SUMMARY_QUERY_KEY });
  });

  it('supports null nickname to clear it', async () => {
    const { calls } = mockApi({
      'PUT /api/me/people/u%3Au-minh/nickname': {},
    });

    await setNickname('u:u-minh', null);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.body).toEqual({ nickname: null });
  });
});

describe('linkPeople', () => {
  it('posts keys to /api/me/people/link and invalidates', async () => {
    const { calls } = mockApi({
      'POST /api/me/people/link': { key: 'p:lead' },
    });

    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const result = await linkPeople(['p:p-1', 'p:p-2'], queryClient);

    expect(result).toEqual({ key: 'p:lead' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.path).toBe('/api/me/people/link');
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.body).toEqual({ keys: ['p:p-1', 'p:p-2'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PEOPLE_SUMMARY_QUERY_KEY });
  });
});

describe('importPerson', () => {
  it('posts name to /api/me/ledger/people', async () => {
    const { calls } = mockApi({
      'POST /api/me/ledger/people': { participantId: 'pid-new' },
    });

    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const result = await importPerson({ name: 'Charlie' }, queryClient);

    expect(result).toEqual({ participantId: 'pid-new' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.path).toBe('/api/me/ledger/people');
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.body).toEqual({ name: 'Charlie' });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PEOPLE_SUMMARY_QUERY_KEY });
  });

  it('posts participantId to /api/me/ledger/people', async () => {
    const { calls } = mockApi({
      'POST /api/me/ledger/people': { participantId: 'pid-imported' },
    });

    const result = await importPerson({ participantId: 'pid-source' });

    expect(result).toEqual({ participantId: 'pid-imported' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body).toEqual({ participantId: 'pid-source' });
  });
});

describe('useInvalidatePeople', () => {
  it('invalidates summary query when called', async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = createWrapper(queryClient);

    const { result } = renderHook(() => useInvalidatePeople(), { wrapper });
    await result.current();

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PEOPLE_SUMMARY_QUERY_KEY });
  });
});
