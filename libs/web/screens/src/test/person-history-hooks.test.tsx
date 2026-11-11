import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { usePersonHistory, useGroupPersonHistory } from '@cc/web-data-access/people';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);

const view = { lines: [], twoWay: 0, suggested: 0, gap: null, trimmed: false };

function stubFetch() {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json(view));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('person history hooks', () => {
  it('usePersonHistory fetches the encoded person key', async () => {
    const fetchMock = stubFetch();
    const { result } = renderHook(() => usePersonHistory('u:abc' as never), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/api/me/people/u%3Aabc/history');
  });

  it('useGroupPersonHistory fetches the group person path', async () => {
    const fetchMock = stubFetch();
    const { result } = renderHook(() => useGroupPersonHistory('t1', 'p1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/api/me/trips/t1/people/p1/history');
  });
});
