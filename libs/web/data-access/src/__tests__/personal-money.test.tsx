import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import type {
  CategoriesResponse,
  CategoryView,
  CreateWalletInput,
  EntriesResponse,
  EntryInput,
  EntryView,
  ListResponse,
  PersonalSummary,
  TagView,
  WalletDetailView,
} from '@cc/core';
import { WALLETS_KEY } from '../personal';
import {
  PERSONAL_CATEGORIES_KEY,
  PERSONAL_LIST_KEY,
  PERSONAL_SUMMARY_KEY,
  PERSONAL_TAGS_KEY,
  readLastWallet,
  useAddWallet,
  useCategories,
  useCreateCategory,
  useCreateEntry,
  useDeleteCategory,
  useDeleteEntry,
  useDeleteTag,
  useDeleteWallet,
  usePersonalList,
  usePersonalSummary,
  useRenameTag,
  useReorderWallets,
  useRestoreEntries,
  useTags,
  useUpdateCategory,
  useUpdateEntry,
  useUpdateWallet,
  writeLastWallet,
} from '../personalMoney';

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
  vi.restoreAllMocks();
});

const sampleEntry: EntryView = {
  id: 'e-1',
  walletId: 'w-1',
  type: 'expense',
  amount: 50000,
  currency: 'VND',
  categoryId: 'c-food',
  transferId: null,
  counterpartWalletId: null,
  date: '2026-11-16',
  time: '12:30',
  note: 'Lunch',
  tags: ['work'],
  excludeFromReports: false,
  source: 'manual',
  beforeStart: false,
  createdAt: '2026-11-16T05:30:00.000Z',
};

const sampleWalletDetail: WalletDetailView = {
  id: 'w-2',
  name: 'Savings',
  currency: 'VND',
  balance: 1000000,
  isDefault: false,
  kind: 'everyday',
  startAmount: 1000000,
  startDate: '2026-11-01',
  startCostVnd: null,
  vndValue: 1000000,
  icon: 'piggy-bank',
  sortOrder: 1,
  archived: false,
  entryCount: 0,
};

const sampleSummary: PersonalSummary = {
  totalVnd: 1500000,
  approximate: false,
  perCurrency: [{ currency: 'VND', balance: 1500000 }],
  unratedWalletIds: [],
  month: '2026-11',
  spent: [{ currency: 'VND', amount: 50000 }],
  income: [],
};

describe('personal money hooks', () => {
  it('useCreateEntry posts the body and invalidates wallets, summary and list', async () => {
    const input: EntryInput = {
      type: 'expense',
      walletId: 'w-1',
      amount: 50000,
      categoryId: 'c-food',
      date: '2026-11-16',
      note: 'Lunch',
      tags: ['work'],
    };

    const { calls } = mockFetch({
      'POST /api/me/personal/transactions': { entries: [sampleEntry] } satisfies EntriesResponse,
    });

    const queryClient = makeQueryClient();
    queryClient.setQueryData(WALLETS_KEY, { wallets: [] });
    queryClient.setQueryData([...PERSONAL_SUMMARY_KEY, '2026-11'], sampleSummary);
    queryClient.setQueryData([...PERSONAL_LIST_KEY, { month: '2026-11' }], { rows: [], totals: [] });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCreateEntry(), {
      wrapper: makeWrapper(queryClient),
    });

    act(() => {
      result.current.mutate(input);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const postCall = calls.find(
      (c) => c.method === 'POST' && c.path === '/api/me/personal/transactions',
    );
    expect(postCall).toBeDefined();
    expect(postCall!.body).toEqual(input);
    expect(result.current.data).toEqual({ entries: [sampleEntry] });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: WALLETS_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_SUMMARY_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_LIST_KEY });
  });

  it('useDeleteEntry returns the deleted entries so undo can restore them', async () => {
    const deletedResponse: EntriesResponse = { entries: [sampleEntry] };

    const { calls } = mockFetch({
      'DELETE /api/me/personal/transactions/e-1': deletedResponse,
      'POST /api/me/personal/transactions/restore': deletedResponse,
    });

    const queryClient = makeQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(
      () => ({
        del: useDeleteEntry(),
        restore: useRestoreEntries(),
      }),
      { wrapper: makeWrapper(queryClient) },
    );

    let returned: EntriesResponse | undefined;
    await act(async () => {
      returned = await result.current.del.mutateAsync('e-1');
    });

    expect(returned).toEqual(deletedResponse);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: WALLETS_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_SUMMARY_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_LIST_KEY });

    invalidateSpy.mockClear();

    await act(async () => {
      await result.current.restore.mutateAsync(returned!);
    });

    const restoreCall = calls.find(
      (c) => c.method === 'POST' && c.path === '/api/me/personal/transactions/restore',
    );
    expect(restoreCall).toBeDefined();
    expect(restoreCall!.body).toEqual(deletedResponse);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: WALLETS_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_SUMMARY_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_LIST_KEY });
  });

  it('useUpdateEntry patches the entry and invalidates money queries', async () => {
    const input: EntryInput = {
      type: 'expense',
      walletId: 'w-1',
      amount: 75000,
      categoryId: 'c-food',
      date: '2026-11-16',
    };

    const { calls } = mockFetch({
      'PATCH /api/me/personal/transactions/e-1': {
        entries: [{ ...sampleEntry, amount: 75000 }],
      } satisfies EntriesResponse,
    });

    const queryClient = makeQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateEntry(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: 'e-1', input });
    });

    const patchCall = calls.find(
      (c) => c.method === 'PATCH' && c.path === '/api/me/personal/transactions/e-1',
    );
    expect(patchCall?.body).toEqual(input);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: WALLETS_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_SUMMARY_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_LIST_KEY });
  });

  it('usePersonalList builds the query string from filters, skipping empty ones', async () => {
    const mockList: ListResponse = {
      rows: [{ kind: 'entry', entry: sampleEntry }],
      totals: [{ currency: 'VND', spent: 50000, income: 0 }],
    };

    const { calls } = mockFetch({
      'GET /api/me/personal/transactions': mockList,
    });

    const queryClient = makeQueryClient();
    const { result } = renderHook(
      () =>
        usePersonalList({
          month: '2026-11',
          walletId: '',
          categoryId: undefined,
          tagId: 't-1',
          type: 'expense',
          q: '',
        }),
      { wrapper: makeWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockList);
    expect(calls).toHaveLength(1);
    const url = calls[0]!.url;
    expect(url).toBe('/api/me/personal/transactions?month=2026-11&tagId=t-1&type=expense');
  });

  it('readLastWallet survives a throwing localStorage', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    });

    expect(readLastWallet()).toBeNull();
    expect(() => writeLastWallet('w-1')).not.toThrow();
    expect(() => writeLastWallet(null)).not.toThrow();
  });

  it('readLastWallet and writeLastWallet persist under cc.personal.lastWallet', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    });

    expect(readLastWallet()).toBeNull();
    writeLastWallet('w-2');
    expect(store.get('cc.personal.lastWallet')).toBe('w-2');
    expect(readLastWallet()).toBe('w-2');
    writeLastWallet(null);
    expect(readLastWallet()).toBeNull();
  });

  it('wallet mutations (add, update, reorder, delete) hit the right endpoints and invalidate money queries', async () => {
    const { calls } = mockFetch({
      'POST /api/me/personal/wallets/add': { wallet: sampleWalletDetail },
      'PATCH /api/me/personal/wallets/w-2': { wallet: { ...sampleWalletDetail, name: 'Cash 2' } },
      'POST /api/me/personal/wallets/reorder': { ok: true },
      'DELETE /api/me/personal/wallets/w-2': { ok: true },
    });

    const queryClient = makeQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(
      () => ({
        add: useAddWallet(),
        update: useUpdateWallet(),
        reorder: useReorderWallets(),
        del: useDeleteWallet(),
      }),
      { wrapper: makeWrapper(queryClient) },
    );

    const addInput: CreateWalletInput = { name: 'Savings', startAmount: 1000000 };
    await act(async () => {
      await result.current.add.mutateAsync(addInput);
      await result.current.update.mutateAsync({ id: 'w-2', input: { name: 'Cash 2' } });
      await result.current.reorder.mutateAsync(['w-2', 'w-1']);
      await result.current.del.mutateAsync('w-2');
    });

    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'POST /api/me/personal/wallets/add',
      'PATCH /api/me/personal/wallets/w-2',
      'POST /api/me/personal/wallets/reorder',
      'DELETE /api/me/personal/wallets/w-2',
    ]);
    expect(calls[2]!.body).toEqual({ ids: ['w-2', 'w-1'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: WALLETS_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_SUMMARY_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_LIST_KEY });
  });

  it('usePersonalSummary fetches /api/me/personal/summary?month=...', async () => {
    const { calls } = mockFetch({
      'GET /api/me/personal/summary': sampleSummary,
    });

    const queryClient = makeQueryClient();
    const { result } = renderHook(() => usePersonalSummary('2026-11'), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(sampleSummary);
    expect(calls[0]!.url).toBe('/api/me/personal/summary?month=2026-11');
  });

  it('category hooks fetch and mutate categories, encoding moveTo, and invalidate categories and list', async () => {
    const cat: CategoryView = {
      id: 'c-1',
      parentId: null,
      type: 'expense',
      name: 'Food',
      icon: 'utensils',
      hidden: false,
      sortOrder: 0,
    };
    const catResp: CategoriesResponse = { categories: [cat], recentIds: ['c-1'] };

    const { calls } = mockFetch({
      'GET /api/me/personal/categories': catResp,
      'POST /api/me/personal/categories': { category: cat },
      'PATCH /api/me/personal/categories/c-1': { category: { ...cat, name: 'Dining' } },
      'DELETE /api/me/personal/categories/c-1': { ok: true },
    });

    const queryClient = makeQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(
      () => ({
        list: useCategories(),
        create: useCreateCategory(),
        update: useUpdateCategory(),
        del: useDeleteCategory(),
      }),
      { wrapper: makeWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    expect(result.current.list.data).toEqual(catResp);

    await act(async () => {
      await result.current.create.mutateAsync({ type: 'expense', name: 'Food', icon: 'utensils' });
      await result.current.update.mutateAsync({ id: 'c-1', input: { name: 'Dining', parentId: 'p-1' } });
      await result.current.update.mutateAsync({ id: 'c-1', input: { parentId: null } });
      await result.current.del.mutateAsync({ id: 'c-1', moveTo: 'c/other' });
      await result.current.del.mutateAsync({ id: 'c-1', children: 'promote' });
      await result.current.del.mutateAsync({ id: 'c-1', moveTo: 'c/other', children: 'p-2' });
    });

    const patchCalls = calls.filter((c) => c.method === 'PATCH');
    expect(patchCalls[0]?.body).toEqual({ name: 'Dining', parentId: 'p-1' });
    expect(patchCalls[1]?.body).toEqual({ parentId: null });

    const delCalls = calls.filter((c) => c.method === 'DELETE');
    expect(delCalls[0]?.url).toBe('/api/me/personal/categories/c-1?moveTo=c%2Fother');
    expect(delCalls[1]?.url).toBe('/api/me/personal/categories/c-1?children=promote');
    expect(delCalls[2]?.url).toBe('/api/me/personal/categories/c-1?moveTo=c%2Fother&children=p-2');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_CATEGORIES_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_LIST_KEY });
  });

  it('tag hooks fetch, rename, delete tags and invalidate tags and list', async () => {
    const tag: TagView = { id: 't-1', name: 'work', useCount: 3 };
    const { calls } = mockFetch({
      'GET /api/me/personal/tags': { tags: [tag] },
      'PATCH /api/me/personal/tags/t-1': { tag: { ...tag, name: 'office' } },
      'DELETE /api/me/personal/tags/t-1': { ok: true },
    });

    const queryClient = makeQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(
      () => ({
        list: useTags(),
        rename: useRenameTag(),
        del: useDeleteTag(),
      }),
      { wrapper: makeWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    expect(result.current.list.data).toEqual({ tags: [tag] });

    await act(async () => {
      await result.current.rename.mutateAsync({ id: 't-1', name: 'office' });
      await result.current.del.mutateAsync('t-1');
    });

    const patchCall = calls.find((c) => c.method === 'PATCH');
    expect(patchCall?.body).toEqual({ name: 'office' });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_TAGS_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PERSONAL_LIST_KEY });
  });
});
