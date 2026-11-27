import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import * as groupCopy from './txCopy/groupCopy';
import { useTravelShareSync } from './travels';

describe('useTravelShareSync unmount behavior', () => {
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it('still requests a group copy sync when tag-shares resolves tagged > 0 after unmount', async () => {
    let resolveTagShares!: (res: Response) => void;
    const tagSharesPromise = new Promise<Response>((resolve) => {
      resolveTagShares = resolve;
    });

    const syncSpy = vi.spyOn(groupCopy, 'requestGroupCopySync').mockResolvedValue();
    vi.spyOn(groupCopy, 'useGroupCopy').mockReturnValue({
      status: 'unavailable',
      snapshot: null,
    });

    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/me/personal/travels')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              travels: [
                {
                  id: 'tr-1',
                  tagId: 'tag-1',
                  name: 'Trip',
                  start: '2026-11-10',
                  end: '2026-11-12',
                  countsFrom: '2026-11-01',
                  groupIds: ['g-1'],
                  budgetId: null,
                  createdAt: '2026-11-01T00:00:00.000Z',
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }
      if (url.endsWith('/api/me/personal/travels/tag-shares')) {
        return tagSharesPromise;
      }
      return Promise.resolve(new Response('{}', { status: 200 }));
    }) as typeof fetch;

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);

    const { unmount } = renderHook(() => useTravelShareSync(), { wrapper });

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/me/personal/travels/tag-shares'),
        expect.anything(),
      );
    });

    // Unmount before tag-shares finishes
    unmount();

    resolveTagShares(
      new Response(JSON.stringify({ tagged: 2 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await waitFor(() => {
      expect(syncSpy).toHaveBeenCalledTimes(1);
    });
  });
});
