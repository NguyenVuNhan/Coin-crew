import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import type { EntriesResponse, EntryInput } from '@cc/core';
import {
  PERSONAL_CATEGORIES_KEY,
  PERSONAL_TAGS_KEY,
  useCreateEntry,
  useDeleteEntry,
  useRestoreEntries,
  useUpdateEntry,
} from '../personalMoney';

function mockEntriesFetch() {
  const fetchMock = vi.fn(async () => {
    const body: EntriesResponse = { entries: [] };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('entry mutations invalidate tags and categories', () => {
  const sampleInput: EntryInput = {
    type: 'expense',
    walletId: 'w1',
    amount: 50_000,
    categoryId: 'c1',
    date: '2026-11-16',
  };

  it('useCreateEntry, useUpdateEntry, useDeleteEntry, useRestoreEntries invalidate PERSONAL_TAGS_KEY and PERSONAL_CATEGORIES_KEY', async () => {
    mockEntriesFetch();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spy = vi.spyOn(qc, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children);

    const { result: createHook } = renderHook(() => useCreateEntry(), { wrapper });
    await act(async () => {
      await createHook.current.mutateAsync(sampleInput);
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: PERSONAL_TAGS_KEY });
    expect(spy).toHaveBeenCalledWith({ queryKey: PERSONAL_CATEGORIES_KEY });

    spy.mockClear();
    const { result: updateHook } = renderHook(() => useUpdateEntry(), { wrapper });
    await act(async () => {
      await updateHook.current.mutateAsync({ id: 'e1', input: sampleInput });
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: PERSONAL_TAGS_KEY });
    expect(spy).toHaveBeenCalledWith({ queryKey: PERSONAL_CATEGORIES_KEY });

    spy.mockClear();
    const { result: deleteHook } = renderHook(() => useDeleteEntry(), { wrapper });
    await act(async () => {
      await deleteHook.current.mutateAsync('e1');
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: PERSONAL_TAGS_KEY });
    expect(spy).toHaveBeenCalledWith({ queryKey: PERSONAL_CATEGORIES_KEY });

    spy.mockClear();
    const { result: restoreHook } = renderHook(() => useRestoreEntries(), { wrapper });
    await act(async () => {
      await restoreHook.current.mutateAsync({ entries: [] });
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: PERSONAL_TAGS_KEY });
    expect(spy).toHaveBeenCalledWith({ queryKey: PERSONAL_CATEGORIES_KEY });
  });
});
