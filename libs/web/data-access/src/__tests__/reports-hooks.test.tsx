import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import type {
  CategoriesResponse,
  CategoryView,
  EntryView,
  GroupRow,
  ListResponse,
  ReportCategoryDrilldown,
  ReportData,
  ReportQuery,
  SyncEntryRow,
  TagView,
  WalletDetailsResponse,
  WalletDetailView,
} from '@cc/core';
import { todayLocal } from '@cc/web-util/localDate';
import { openGroupCopyStore, forgetGroupCopy } from '../txCopy/groupCopy';
import { openTxCopyStore } from '../txCopy/store';
import { forgetTxCopy } from '../txCopy/hooks';
import {
  PERSONAL_REPORT_KEY,
  buildReportQueryString,
  useCategoryDrilldown,
  useCurrentMonthReportTotals,
  usePersonalReport,
} from '../reports';
import {
  useCreateCategory,
  useCreateEntry,
  useRenameTag,
} from '../personalMoney';

const TEST_USER_ID = 'reports-hooks-user-1';

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

const signedInMe = {
  user: {
    id: TEST_USER_ID,
    email: 'a@b.c',
    name: 'Alice',
    consentAt: '2026-10-12T00:00:00.000Z',
    zaloName: null,
  },
  signIn: { zalo: true },
  mergeRequests: { incoming: [], outgoing: [], joining: [], claim: null },
  personalArea: true,
};

const sampleWallet: WalletDetailView = {
  id: 'w-1',
  name: 'Cash',
  currency: 'VND',
  balance: 1_000_000,
  isDefault: true,
  kind: 'everyday',
  startAmount: 1_000_000,
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: 1_000_000,
  icon: null,
  sortOrder: 0,
  archived: false,
  entryCount: 1,
};

const sampleCategory: CategoryView = {
  id: 'c-food',
  parentId: null,
  type: 'expense',
  name: 'Food',
  icon: 'utensils',
  hidden: false,
  sortOrder: 0,
};

const sampleTag: TagView = {
  id: 't-1',
  name: 'work',
  useCount: 1,
};

const sampleGroupRow: GroupRow = {
  kind: 'group',
  id: 'gr-1',
  rootId: 'root-1',
  tripId: 'trip-1',
  tripName: 'Trip 1',
  isDirect: false,
  source: 'expense',
  date: '2026-11-20',
  title: 'Team Dinner',
  total: 200_000,
  myShare: 100_000,
  iPaid: false,
  payerName: 'Bob',
  counterpartName: null,
  people: ['Alice', 'Bob'],
  pending: false,
  link: {
    walletId: 'w-1',
    categoryId: 'c-food',
    tagIds: ['t-1'],
    intent: 'shared',
    excludeFromReports: false,
  },
  createdAt: '2026-11-20T12:00:00.000Z',
  activityAt: '2026-11-20T12:00:00.000Z',
};

const sampleEntryView: EntryView = {
  id: 'e-1',
  walletId: 'w-1',
  type: 'expense',
  amount: 50_000,
  currency: 'VND',
  categoryId: 'c-food',
  assetId: null,
  quantity: null,
  transferId: null,
  counterpartWalletId: null,
  date: '2026-11-19',
  time: '12:00',
  note: 'Lunch',
  tags: ['work'],
  excludeFromReports: false,
  source: 'manual',
  beforeStart: false,
  createdAt: '2026-11-19T05:00:00.000Z',
};

function makeEntry(id: string, overrides: Partial<SyncEntryRow> = {}): SyncEntryRow {
  return {
    id,
    walletId: 'w-1',
    type: 'expense',
    amount: 50_000,
    categoryId: 'c-food',
    assetId: null,
    quantity: null,
    transferId: null,
    counterpartWalletId: null,
    date: '2026-11-19',
    time: '12:00',
    note: 'Lunch',
    tagIds: ['t-1'],
    excludeFromReports: false,
    createdAt: '2026-11-19T05:00:00.000Z',
    syncVersion: 1,
    ...overrides,
  };
}

function baseRoutes(overrides: Record<string, Handler | unknown> = {}): Record<string, Handler | unknown> {
  return {
    'GET /api/me': signedInMe,
    'GET /api/me/personal/wallets': { wallets: [sampleWallet] } satisfies WalletDetailsResponse,
    'GET /api/me/personal/categories': {
      categories: [sampleCategory],
      recentIds: ['c-food'],
    } satisfies CategoriesResponse,
    'GET /api/me/personal/tags': { tags: [sampleTag] },
    'GET /api/me/personal/group-settings': {
      settings: { defaultGroupCategoryId: null, countLoans: false },
    },
    'GET /api/me/personal/sync': {
      status: 'current',
      epoch: 'ep-1',
      version: 1,
      entries: [],
      removedIds: [],
      cursor: null,
      ledger: null,
    },
    'GET /api/me/personal/group-rows': {
      status: 'current',
    },
    ...overrides,
  };
}

const mockReportData: ReportData = {
  period: {
    mode: 'month',
    from: '2026-11-01',
    to: '2026-11-30',
    effectiveTo: '2026-11-25',
    inProgress: true,
    granularity: 'day',
    previous: { from: '2026-10-01', to: '2026-10-31', effectiveTo: '2026-10-25' },
    baselines: [],
  },
  currency: 'VND',
  approximate: false,
  singleWallet: null,
  totals: { spent: 50_000, income: 0, net: -50_000 },
  perCurrency: [{ currency: 'VND', spent: 50_000, income: 0 }],
  previousDelta: {
    previousSpent: 0,
    previousIncome: 0,
    spentDiff: 50_000,
    incomeDiff: 0,
    spentPct: null,
    incomePct: null,
  },
  baseline3m: null,
  unratedWallets: [],
  countedCount: 1,
  hasAnyUnratedOnly: false,
  healthSeries: [],
  spendingByCategory: [
    {
      categoryId: 'c-food',
      name: 'Food',
      icon: 'utensils',
      type: 'expense',
      amount: 50_000,
      percent: 100,
      subCategories: [],
    },
  ],
  incomeByCategory: [],
  tags: { expense: [], income: [], hasMultiTagOverlap: false },
  walletBalance: null,
  countedRows: [
    {
      kind: 'entry',
      entryId: 'e-1',
      categoryId: 'c-food',
      type: 'expense',
      vndAmount: 50_000,
      nativeAmount: 50_000,
    },
  ],
};

const mockDrilldownData: ReportCategoryDrilldown = {
  categoryId: 'c-food',
  name: 'Food',
  icon: 'utensils',
  type: 'expense',
  currency: 'VND',
  approximate: false,
  total: 50_000,
  previousTotal: 0,
  diffFromPrevious: 50_000,
  pctFromPrevious: null,
  baseline3mAvg: null,
  historyCount: 0,
  subCategories: [],
  rows: [
    {
      kind: 'entry',
      entryId: 'e-1',
      categoryId: 'c-food',
      type: 'expense',
      vndAmount: 50_000,
      nativeAmount: 50_000,
    },
    {
      kind: 'group',
      groupRowId: 'gr-1',
      categoryId: 'c-food',
      type: 'expense',
      amount: 100_000,
    },
  ],
};

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await forgetTxCopy(TEST_USER_ID);
  await forgetGroupCopy(TEST_USER_ID);
});

describe('buildReportQueryString', () => {
  it('serializes month, week, year, and custom queries cleanly', () => {
    const qsMonth = buildReportQueryString(
      { mode: 'month', month: '2026-11', includeGroups: true, walletId: 'w-1' },
      '2026-11-25',
    );
    expect(qsMonth).toBe('mode=month&month=2026-11&walletId=w-1&groups=show&today=2026-11-25');

    const qsWeek = buildReportQueryString(
      { mode: 'week', week: '2026-11-19', includeGroups: false },
      '2026-11-25',
    );
    expect(qsWeek).toBe('mode=week&week=2026-11-19&groups=hide&today=2026-11-25');

    const qsYear = buildReportQueryString(
      { mode: 'year', year: '2026', includeGroups: true },
      '2026-11-25',
    );
    expect(qsYear).toBe('mode=year&year=2026&groups=show&today=2026-11-25');

    const qsCustom = buildReportQueryString(
      { mode: 'custom', from: '2026-11-01', to: '2026-11-15', includeGroups: false },
      '2026-11-25',
    );
    expect(qsCustom).toBe('mode=custom&from=2026-11-01&to=2026-11-15&groups=hide&today=2026-11-25');
  });
});

describe('reports hooks', () => {
  it('1. Seeded openTxCopyStore + openGroupCopyStore ready -> usePersonalReport returns computed ReportData (source: copy) with 0 calls to /api/me/personal/report', async () => {
    const e1 = makeEntry('e-1', { amount: 50_000, date: '2026-11-19', categoryId: 'c-food' });
    const txStore = await openTxCopyStore(TEST_USER_ID);
    expect(txStore).not.toBeNull();
    await txStore!.saveState({
      format: 1,
      epoch: 'ep-1',
      version: 1,
      ledgerVersion: 1,
      ready: true,
    });
    await txStore!.apply({ entries: [e1], removedIds: [] });

    const groupStore = await openGroupCopyStore(TEST_USER_ID);
    expect(groupStore).not.toBeNull();
    await groupStore!.replace('key-1', [sampleGroupRow]);

    const { calls } = mockFetch(baseRoutes());
    const queryClient = makeQueryClient();

    const query: ReportQuery = { mode: 'month', month: '2026-11', includeGroups: true };
    const { result, unmount } = renderHook(() => usePersonalReport(query), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.source).toBe('copy'));
    expect(result.current.isPending).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.data).toBeDefined();
    expect(result.current.data?.totals.spent).toBe(150_000); // 50_000 (entry) + 100_000 (group share)

    const reportCalls = calls.filter((c) => c.path === '/api/me/personal/report');
    expect(reportCalls).toHaveLength(0);

    unmount();
  });

  it('2. indexedDB stubbed undefined -> usePersonalReport falls back to GET /api/me/personal/report?... (source: server)', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const { calls } = mockFetch(
      baseRoutes({
        'GET /api/me/personal/report': mockReportData,
      }),
    );
    const queryClient = makeQueryClient();

    const query: ReportQuery = { mode: 'month', month: '2026-11', includeGroups: true };
    const { result, unmount } = renderHook(() => usePersonalReport(query), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.source).toBe('server'));
    expect(result.current.isPending).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.data?.totals.spent).toBe(50_000);

    const reportCalls = calls.filter((c) => c.path === '/api/me/personal/report');
    expect(reportCalls).toHaveLength(1);

    unmount();
  });

  it('3a. useCategoryDrilldown works in local-copy mode (0 API calls, hydrates matchingEntries & matchingGroupRows)', async () => {
    const e1 = makeEntry('e-1', { amount: 50_000, date: '2026-11-19', categoryId: 'c-food' });
    const txStore = await openTxCopyStore(TEST_USER_ID);
    await txStore!.saveState({
      format: 1,
      epoch: 'ep-1',
      version: 1,
      ledgerVersion: 1,
      ready: true,
    });
    await txStore!.apply({ entries: [e1], removedIds: [] });

    const groupStore = await openGroupCopyStore(TEST_USER_ID);
    await groupStore!.replace('key-1', [sampleGroupRow]);

    const { calls } = mockFetch(baseRoutes());
    const queryClient = makeQueryClient();

    const query: ReportQuery = { mode: 'month', month: '2026-11', includeGroups: true };
    const { result, unmount } = renderHook(() => useCategoryDrilldown(query, 'c-food'), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.drilldown).not.toBeNull());
    expect(result.current.drilldown?.categoryId).toBe('c-food');
    expect(result.current.drilldown?.total).toBe(150_000);
    expect(result.current.matchingEntries).toHaveLength(1);
    expect(result.current.matchingEntries[0]!.id).toBe('e-1');
    expect(result.current.matchingEntries[0]!.tags).toEqual(['work']);
    expect(result.current.matchingGroupRows).toHaveLength(1);
    expect(result.current.matchingGroupRows[0]!.id).toBe('gr-1');

    const apiCalls = calls.filter(
      (c) =>
        c.path.startsWith('/api/me/personal/report') || c.path === '/api/me/personal/transactions',
    );
    expect(apiCalls).toHaveLength(0);

    unmount();
  });

  it('3b. useCategoryDrilldown works in server-fallback mode (fetches /report/category/:id + usePersonalList)', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const { calls } = mockFetch(
      baseRoutes({
        'GET /api/me/personal/report': mockReportData,
        'GET /api/me/personal/report/category/c-food': mockDrilldownData,
        'GET /api/me/personal/transactions': {
          rows: [{ kind: 'entry', entry: sampleEntryView }],
          totals: [{ currency: 'VND', spent: 50_000, income: 0 }],
          groupRows: [sampleGroupRow],
        } satisfies ListResponse,
      }),
    );
    const queryClient = makeQueryClient();

    const query: ReportQuery = { mode: 'month', month: '2026-11', includeGroups: true };
    const { result, unmount } = renderHook(() => useCategoryDrilldown(query, 'c-food'), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.drilldown).not.toBeNull());
    expect(result.current.drilldown?.categoryId).toBe('c-food');
    expect(result.current.drilldown?.total).toBe(50_000);

    await waitFor(() => expect(result.current.matchingEntries).toHaveLength(1));
    expect(result.current.matchingEntries[0]!.id).toBe('e-1');
    expect(result.current.matchingGroupRows).toHaveLength(1);
    expect(result.current.matchingGroupRows[0]!.id).toBe('gr-1');

    const categoryCalls = calls.filter((c) => c.path === '/api/me/personal/report/category/c-food');
    expect(categoryCalls).toHaveLength(1);

    const txCalls = calls.filter((c) => c.path === '/api/me/personal/transactions');
    expect(txCalls).toHaveLength(1);

    unmount();
  });

  it('4a. useCurrentMonthReportTotals returns totals when ready', async () => {
    const e1 = makeEntry('e-1', { amount: 80_000, date: todayLocal(), categoryId: 'c-food' });
    const txStore = await openTxCopyStore(TEST_USER_ID);
    await txStore!.saveState({
      format: 1,
      epoch: 'ep-1',
      version: 1,
      ledgerVersion: 1,
      ready: true,
    });
    await txStore!.apply({ entries: [e1], removedIds: [] });

    const groupStore = await openGroupCopyStore(TEST_USER_ID);
    await groupStore!.replace('key-1', []);

    mockFetch(baseRoutes());
    const queryClient = makeQueryClient();

    const { result: res1, unmount: unmount1 } = renderHook(() => useCurrentMonthReportTotals(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(res1.current.ready).toBe(true));
    expect(res1.current.spent).toBe(80_000);
    expect(res1.current.income).toBe(0);
    expect(res1.current.approximate).toBe(false);
    unmount1();
  });

  it('4b. useCurrentMonthReportTotals returns 0s quietly on fallback 404', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const { calls } = mockFetch(
      baseRoutes({
        'GET /api/me/personal/report': () =>
          Response.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 }),
      }),
    );
    const queryClient404 = makeQueryClient();

    const { result: res2, unmount: unmount2 } = renderHook(() => useCurrentMonthReportTotals(), {
      wrapper: makeWrapper(queryClient404),
    });

    await waitFor(() => expect(calls.some((c) => c.path === '/api/me/personal/report')).toBe(true));
    expect(res2.current.ready).toBe(false);
    expect(res2.current.spent).toBe(0);
    expect(res2.current.income).toBe(0);
    expect(res2.current.approximate).toBe(false);

    unmount2();
  });

  it('5. invalidateMoney, invalidateCategories, and invalidateTags all trigger invalidation on PERSONAL_REPORT_KEY', async () => {
    mockFetch(
      baseRoutes({
        'POST /api/me/personal/transactions': { entries: [sampleEntryView] },
        'POST /api/me/personal/categories': { category: sampleCategory },
        'PATCH /api/me/personal/tags/t-1': { tag: { ...sampleTag, name: 'work-2' } },
      }),
    );
    const queryClient = makeQueryClient();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = makeWrapper(queryClient);

    const { result: entryMut, unmount: u1 } = renderHook(() => useCreateEntry(), { wrapper });
    await entryMut.current.mutateAsync({
      type: 'expense',
      walletId: 'w-1',
      amount: 50_000,
      date: '2026-11-25',
      categoryId: 'c-food',
    });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: PERSONAL_REPORT_KEY }));
    spy.mockClear();
    u1();

    const { result: catMut, unmount: u2 } = renderHook(() => useCreateCategory(), { wrapper });
    await catMut.current.mutateAsync({
      type: 'expense',
      name: 'Snacks',
      icon: 'coffee',
      parentId: null,
    });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: PERSONAL_REPORT_KEY }));
    spy.mockClear();
    u2();

    const { result: tagMut, unmount: u3 } = renderHook(() => useRenameTag(), { wrapper });
    await tagMut.current.mutateAsync({ id: 't-1', name: 'work-2' });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: PERSONAL_REPORT_KEY }));
    u3();
  });
});
