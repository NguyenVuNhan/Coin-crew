import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import type { WalletDetailView } from '@cc/core';
import {
  PERSONAL_HOLDINGS_KEY,
  PERSONAL_LIST_KEY,
  PERSONAL_SUMMARY_KEY,
  useUpdateWallet,
} from '../personalMoney';
import { WALLETS_KEY } from '../personal';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('M2: invalidateMoney invalidates PERSONAL_HOLDINGS_KEY', () => {
  it('useUpdateWallet invalidates PERSONAL_HOLDINGS_KEY alongside wallets, summary, and list', async () => {
    const wallet: WalletDetailView = {
      id: 'w-1',
      name: 'Inv',
      currency: 'VND',
      kind: 'investment',
      balance: 0,
      isDefault: false,
      startAmount: 0,
      startDate: '2026-11-01',
      startCostVnd: null,
      vndValue: 0,
      archived: false,
      sortOrder: 0,
      icon: 'wallet',
      entryCount: 0,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ wallet }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spy = vi.spyOn(qc, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children);

    const { result } = renderHook(() => useUpdateWallet(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 'w-1', input: { name: 'Inv 2' } });
    });

    expect(spy).toHaveBeenCalledWith({ queryKey: WALLETS_KEY });
    expect(spy).toHaveBeenCalledWith({ queryKey: PERSONAL_SUMMARY_KEY });
    expect(spy).toHaveBeenCalledWith({ queryKey: PERSONAL_LIST_KEY });
    expect(spy).toHaveBeenCalledWith({ queryKey: PERSONAL_HOLDINGS_KEY });
  });
});
