// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import {
  vnDate,
  type BudgetDef,
  type BudgetPeriod,
  type CategoriesResponse,
  type CategoryView,
  type EntriesResponse,
  type EntryInput,
  type PlannedItemsResponse,
  type PlannedItemView,
  type RecurringRuleInput,
  type RecurringRulesResponse,
  type RecurringRuleView,
  type TagView,
  type UpcomingItem,
  type WalletDetailsResponse,
  type WalletDetailView,
} from '@cc/core';
import { todayLocal } from '@cc/web-util/localDate';
import {
  PERSONAL_BUDGETS_KEY,
  PERSONAL_LIST_KEY,
  PERSONAL_PLANNED_KEY,
  PERSONAL_RECURRING_KEY,
  PERSONAL_SUMMARY_KEY,
  useCreateEntry,
  type TagsResponse,
} from '../personalMoney';
import { WALLETS_KEY } from '../personal';
import {
  upcomingTotals,
  useConfirmPlanned,
  useCreateRule,
  useUpcoming,
} from '../recurring';
import { budgetStillDue, useBudgetStillDue } from '../budgets';

type Handler = (init: RequestInit | undefined, url: string) => Response | Promise<Response>;

function mockApi(routes: Record<string, Handler | unknown>) {
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

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function makeWrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

function addDays(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + delta));
  const yy = String(dt.getUTCFullYear()).padStart(4, '0');
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function makeWallet(
  id: string,
  currency: WalletDetailView['currency'],
  kind: WalletDetailView['kind'] = 'everyday',
): WalletDetailView {
  return {
    id,
    name: id,
    kind,
    currency,
    startAmount: 0,
    startDate: '2026-01-01',
    startCostVnd: null,
    vndValue: currency === 'VND' ? 1_000_000 : null,
    balance: 1_000_000,
    isDefault: id === 'w-vnd',
    archived: false,
    excludeFromReports: false,
    sortOrder: 0,
    icon: null,
    entryCount: 0,
  };
}

const wallets: WalletDetailView[] = [
  makeWallet('w-vnd', 'VND'),
  makeWallet('w-inv', 'VND', 'investment'),
  makeWallet('w-usd', 'USD'),
  makeWallet('w-excluded', 'VND'),
];

const categories: CategoryView[] = [
  {
    id: 'cat-food',
    type: 'expense',
    name: 'Food',
    icon: 'utensils',
    hidden: false,
    sortOrder: 0,
    parentId: null,
  },
  {
    id: 'cat-coffee',
    type: 'expense',
    name: 'Coffee',
    icon: 'coffee',
    hidden: false,
    sortOrder: 1,
    parentId: 'cat-food',
  },
  {
    id: 'cat-rent',
    type: 'expense',
    name: 'Rent',
    icon: 'home',
    hidden: false,
    sortOrder: 2,
    parentId: null,
  },
];

const tags: TagView[] = [{ id: 'tag-fixed', name: 'fixed', useCount: 1 }];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('upcomingTotals', () => {
  it('splits totals by currency and direction and excludes transfers', () => {
    const items: UpcomingItem[] = [
      {
        ruleId: 'r1',
        date: '2026-11-28',
        draft: {
          type: 'expense',
          walletId: 'w-vnd',
          categoryId: 'cat-food',
          amount: 150_000,
          tags: [],
          note: null,
        },
        approximate: false,
      },
      {
        ruleId: 'r2',
        date: '2026-11-29',
        draft: {
          type: 'buy',
          walletId: 'w-inv',
          assetId: 'a1',
          amount: 5_000_000,
          tags: [],
          note: null,
        },
        approximate: true,
      },
      {
        ruleId: 'r3',
        date: '2026-11-30',
        draft: {
          type: 'income',
          walletId: 'w-vnd',
          categoryId: 'cat-salary',
          amount: 20_000_000,
          tags: [],
          note: null,
        },
        approximate: false,
      },
      {
        ruleId: 'r4',
        date: '2026-12-01',
        draft: {
          type: 'expense',
          walletId: 'w-usd',
          categoryId: 'cat-food',
          amount: 1200,
          tags: [],
          note: null,
        },
        approximate: false,
      },
      {
        ruleId: 'r5',
        date: '2026-12-02',
        draft: {
          type: 'transfer',
          walletId: 'w-vnd',
          toWalletId: 'w-inv',
          amount: 3_000_000,
          tags: [],
          note: null,
        },
        approximate: false,
      },
    ];

    const res = upcomingTotals(items, wallets);
    expect(res.vndOut).toBe(5_150_000);
    expect(res.totals).toEqual([
      { currency: 'VND', out: 5_150_000, in: 20_000_000 },
      { currency: 'USD', out: 1200, in: 0 },
    ]);
  });
});

describe('budgetStillDue', () => {
  const today = '2026-11-10';
  const period: BudgetPeriod = { from: '2026-11-01', to: '2026-11-30' };
  const foodBudget: BudgetDef = {
    id: 'b-food',
    name: 'Food',
    target: { kind: 'category', categoryId: 'cat-food' },
    currency: 'VND',
    periodKind: 'month',
    monthStartDay: 1,
    from: null,
    to: null,
    excludedWalletIds: ['w-excluded'],
    limits: [{ effectiveFrom: '2026-11-01', amount: 5_000_000 }],
    suggestionDismissedUntil: null,
    createdOn: '2026-11-01',
  };

  it('counts only in-scope active expense rules before period end and includes waiting items', () => {
    const rules: RecurringRuleView[] = [
      // In-scope subcategory, weekly on Tue (2026-11-17, 2026-11-24 -> 2 occurrences)
      {
        id: 'r-coffee',
        draft: {
          type: 'expense',
          walletId: 'w-vnd',
          categoryId: 'cat-coffee',
          amount: 50_000,
          tags: [],
          note: null,
        },
        schedule: {
          unit: 'week',
          every: 1,
          weekdays: [2],
          startDate: '2026-11-03',
          end: { kind: 'never' },
        },
        askMe: false,
        status: 'active',
        pausedReason: null,
        nextDueOn: '2026-11-17',
        lastConfirmedOn: '2026-11-10',
      },
      // Today (2026-11-10) should NOT be counted by rule schedule (starts from tomorrow), only next month 2026-12-10 which is after period.to
      {
        id: 'r-today-and-next-period',
        draft: {
          type: 'expense',
          walletId: 'w-vnd',
          categoryId: 'cat-food',
          amount: 200_000,
          tags: [],
          note: null,
        },
        schedule: {
          unit: 'month',
          every: 1,
          monthDay: 10,
          startDate: '2026-11-10',
          end: { kind: 'never' },
        },
        askMe: false,
        status: 'active',
        pausedReason: null,
        nextDueOn: '2026-11-10',
        lastConfirmedOn: '2026-11-10',
      },
      // Out of scope: wrong category
      {
        id: 'r-rent',
        draft: {
          type: 'expense',
          walletId: 'w-vnd',
          categoryId: 'cat-rent',
          amount: 4_000_000,
          tags: [],
          note: null,
        },
        schedule: {
          unit: 'month',
          every: 1,
          monthDay: 25,
          startDate: '2026-11-25',
          end: { kind: 'never' },
        },
        askMe: false,
        status: 'active',
        pausedReason: null,
        nextDueOn: '2026-11-25',
        lastConfirmedOn: '2026-11-01',
      },
      // Out of scope: excluded wallet
      {
        id: 'r-excluded-wallet',
        draft: {
          type: 'expense',
          walletId: 'w-excluded',
          categoryId: 'cat-food',
          amount: 100_000,
          tags: [],
          note: null,
        },
        schedule: {
          unit: 'month',
          every: 1,
          monthDay: 20,
          startDate: '2026-11-20',
          end: { kind: 'never' },
        },
        askMe: false,
        status: 'active',
        pausedReason: null,
        nextDueOn: '2026-11-20',
        lastConfirmedOn: '2026-11-01',
      },
      // Out of scope: USD currency
      {
        id: 'r-usd',
        draft: {
          type: 'expense',
          walletId: 'w-usd',
          categoryId: 'cat-food',
          amount: 500,
          tags: [],
          note: null,
        },
        schedule: {
          unit: 'month',
          every: 1,
          monthDay: 20,
          startDate: '2026-11-20',
          end: { kind: 'never' },
        },
        askMe: false,
        status: 'active',
        pausedReason: null,
        nextDueOn: '2026-11-20',
        lastConfirmedOn: '2026-11-01',
      },
      // Out of scope: buy (not expense)
      {
        id: 'r-buy',
        draft: {
          type: 'buy',
          walletId: 'w-inv',
          assetId: 'a1',
          amount: 1_000_000,
          tags: [],
          note: null,
        },
        schedule: {
          unit: 'month',
          every: 1,
          monthDay: 20,
          startDate: '2026-11-20',
          end: { kind: 'never' },
        },
        askMe: true,
        status: 'active',
        pausedReason: null,
        nextDueOn: '2026-11-20',
        lastConfirmedOn: '2026-11-01',
      },
      // Paused rule: ignored
      {
        id: 'r-paused',
        draft: {
          type: 'expense',
          walletId: 'w-vnd',
          categoryId: 'cat-food',
          amount: 300_000,
          tags: [],
          note: null,
        },
        schedule: {
          unit: 'month',
          every: 1,
          monthDay: 22,
          startDate: '2026-11-22',
          end: { kind: 'never' },
        },
        askMe: false,
        status: 'paused',
        pausedReason: 'manual',
        nextDueOn: '2026-11-22',
        lastConfirmedOn: '2026-11-01',
      },
    ];

    const waitingItems: PlannedItemView[] = [
      // Included: waiting recurring_occurrence in scope within period
      {
        id: 'p1',
        kind: 'recurring_occurrence',
        ruleId: 'r-ask',
        dueOn: '2026-11-10',
        draft: {
          type: 'expense',
          walletId: 'w-vnd',
          categoryId: 'cat-food',
          amount: 120_000,
          tags: [],
          note: null,
        },
        status: 'waiting',
        meta: null,
        createdOn: '2026-11-10',
      },
      // Ignored: check-in item
      {
        id: 'p2',
        kind: 'recurring_checkin',
        ruleId: 'r-coffee',
        dueOn: '2026-11-10',
        draft: null,
        status: 'waiting',
        meta: null,
        createdOn: '2026-11-10',
      },
      // Ignored: outside period
      {
        id: 'p3',
        kind: 'recurring_occurrence',
        ruleId: 'r-ask',
        dueOn: '2026-10-31',
        draft: {
          type: 'expense',
          walletId: 'w-vnd',
          categoryId: 'cat-food',
          amount: 999_000,
          tags: [],
          note: null,
        },
        status: 'waiting',
        meta: null,
        createdOn: '2026-10-31',
      },
    ];

    const res = budgetStillDue(
      foodBudget,
      period,
      rules,
      waitingItems,
      categories,
      wallets,
      today,
      tags,
    );
    expect(res).toEqual({
      count: 3, // 2 coffee + 1 waiting item
      amount: 220_000, // 2 * 50_000 + 120_000
    });
  });

  it('matches tag-targeted budgets using tag names or ids', () => {
    const tagBudget: BudgetDef = {
      ...foodBudget,
      id: 'b-tag',
      target: { kind: 'tag', tagId: 'tag-fixed' },
    };
    const rules: RecurringRuleView[] = [
      {
        id: 'r-tagged',
        draft: {
          type: 'expense',
          walletId: 'w-vnd',
          categoryId: 'cat-rent',
          amount: 500_000,
          tags: ['fixed'],
          note: null,
        },
        schedule: {
          unit: 'month',
          every: 1,
          monthDay: 15,
          startDate: '2026-11-15',
          end: { kind: 'never' },
        },
        askMe: false,
        status: 'active',
        pausedReason: null,
        nextDueOn: '2026-11-15',
        lastConfirmedOn: '2026-11-01',
      },
    ];

    expect(
      budgetStillDue(tagBudget, period, rules, [], categories, wallets, today, tags),
    ).toEqual({ count: 1, amount: 500_000 });
  });
});

describe('recurring and budget hooks with mockApi', () => {
  it('useUpcoming lists transfers without totalling them and splits totals by currency', async () => {
    const today = vnDate(new Date());
    const tomorrow = addDays(today, 1);
    const inTwoDays = addDays(today, 2);

    const rules: RecurringRuleView[] = [
      {
        id: 'r-exp',
        draft: {
          type: 'expense',
          walletId: 'w-vnd',
          categoryId: 'cat-food',
          amount: 100_000,
          tags: [],
          note: null,
        },
        schedule: {
          unit: 'month',
          every: 1,
          startDate: tomorrow,
          end: { kind: 'count', count: 1 },
        },
        askMe: false,
        status: 'active',
        pausedReason: null,
        nextDueOn: tomorrow,
        lastConfirmedOn: today,
      },
      {
        id: 'r-xfer',
        draft: {
          type: 'transfer',
          walletId: 'w-vnd',
          toWalletId: 'w-inv',
          amount: 2_000_000,
          tags: [],
          note: null,
        },
        schedule: {
          unit: 'month',
          every: 1,
          startDate: inTwoDays,
          end: { kind: 'count', count: 1 },
        },
        askMe: false,
        status: 'active',
        pausedReason: null,
        nextDueOn: inTwoDays,
        lastConfirmedOn: today,
      },
    ];

    mockApi({
      'GET /api/me/personal/recurring/rules': { rules } satisfies RecurringRulesResponse,
      'GET /api/me/personal/wallets': { wallets } satisfies WalletDetailsResponse,
    });

    const qc = makeQueryClient();
    const { result } = renderHook(() => useUpcoming(30), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.ready).toBe(true));

    expect(result.current.items).toHaveLength(2);
    expect(result.current.items.map((i) => i.draft.type)).toEqual(['expense', 'transfer']);
    expect(result.current.vndOut).toBe(100_000);
    expect(result.current.totals).toEqual([{ currency: 'VND', out: 100_000, in: 0 }]);
  });

  it('useBudgetStillDue reads rules, planned items, categories, wallets, and tags', async () => {
    const today = todayLocal();
    const tomorrow = addDays(today, 1);
    const period: BudgetPeriod = { from: today, to: addDays(today, 10) };
    const budget: BudgetDef = {
      id: 'b-1',
      name: 'Food',
      target: { kind: 'category', categoryId: 'cat-food' },
      currency: 'VND',
      periodKind: 'once',
      monthStartDay: null,
      from: period.from,
      to: period.to,
      excludedWalletIds: [],
      limits: [{ effectiveFrom: period.from, amount: 1_000_000 }],
      suggestionDismissedUntil: null,
      createdOn: today,
    };

    const rules: RecurringRuleView[] = [
      {
        id: 'r1',
        draft: {
          type: 'expense',
          walletId: 'w-vnd',
          categoryId: 'cat-food',
          amount: 150_000,
          tags: [],
          note: null,
        },
        schedule: {
          unit: 'month',
          every: 1,
          startDate: tomorrow,
          end: { kind: 'count', count: 1 },
        },
        askMe: false,
        status: 'active',
        pausedReason: null,
        nextDueOn: tomorrow,
        lastConfirmedOn: today,
      },
    ];
    const items: PlannedItemView[] = [
      {
        id: 'p1',
        kind: 'recurring_occurrence',
        ruleId: 'r2',
        dueOn: today,
        draft: {
          type: 'expense',
          walletId: 'w-vnd',
          categoryId: 'cat-coffee',
          amount: 50_000,
          tags: [],
          note: null,
        },
        status: 'waiting',
        meta: null,
        createdOn: today,
      },
    ];

    mockApi({
      'GET /api/me/personal/recurring/rules': { rules } satisfies RecurringRulesResponse,
      'GET /api/me/personal/planned': { items } satisfies PlannedItemsResponse,
      'GET /api/me/personal/categories': { categories, recentIds: [] } satisfies CategoriesResponse,
      'GET /api/me/personal/wallets': { wallets } satisfies WalletDetailsResponse,
      'GET /api/me/personal/tags': { tags } satisfies TagsResponse,
    });

    const qc = makeQueryClient();
    const { result } = renderHook(() => useBudgetStillDue(budget, period), {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => expect(result.current.count).toBe(2));
    expect(result.current.amount).toBe(200_000);
  });

  it('invalidates recurring, planned, and money keys on createRule, confirmPlanned, and createEntry', async () => {
    const sampleRuleInput: RecurringRuleInput = {
      draft: {
        type: 'expense',
        walletId: 'w-vnd',
        categoryId: 'cat-food',
        amount: 50_000,
        tags: [],
        note: null,
      },
      schedule: {
        unit: 'month',
        every: 1,
        startDate: '2026-12-01',
        end: { kind: 'never' },
      },
    };
    const sampleRule: RecurringRuleView = {
      id: 'r1',
      ...sampleRuleInput,
      askMe: false,
      status: 'active',
      pausedReason: null,
      nextDueOn: '2026-12-01',
      lastConfirmedOn: '2026-11-27',
    };
    const sampleEntry: EntryInput = {
      type: 'expense',
      walletId: 'w-vnd',
      amount: 50_000,
      categoryId: 'cat-food',
      date: '2026-11-27',
    };

    mockApi({
      'POST /api/me/personal/recurring/rules': { rule: sampleRule },
      'POST /api/me/personal/planned/p1/confirm': { ok: true, transactionId: 'tx1' },
      'POST /api/me/personal/transactions': { entries: [] } satisfies EntriesResponse,
    });

    const qc = makeQueryClient();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    const wrapper = makeWrapper(qc);

    const { result: createRuleHook } = renderHook(() => useCreateRule(), { wrapper });
    await act(async () => {
      await createRuleHook.current.mutateAsync(sampleRuleInput);
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: PERSONAL_RECURRING_KEY });
    expect(spy).toHaveBeenCalledWith({ queryKey: PERSONAL_PLANNED_KEY });
    expect(spy).toHaveBeenCalledWith({ queryKey: WALLETS_KEY });
    expect(spy).toHaveBeenCalledWith({ queryKey: PERSONAL_SUMMARY_KEY });
    expect(spy).toHaveBeenCalledWith({ queryKey: PERSONAL_LIST_KEY });
    expect(spy).toHaveBeenCalledWith({ queryKey: PERSONAL_BUDGETS_KEY });

    spy.mockClear();
    const { result: confirmHook } = renderHook(() => useConfirmPlanned(), { wrapper });
    await act(async () => {
      await confirmHook.current.mutateAsync({ id: 'p1' });
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: PERSONAL_RECURRING_KEY });
    expect(spy).toHaveBeenCalledWith({ queryKey: PERSONAL_PLANNED_KEY });
    expect(spy).toHaveBeenCalledWith({ queryKey: PERSONAL_LIST_KEY });
    expect(spy).toHaveBeenCalledWith({ queryKey: PERSONAL_BUDGETS_KEY });

    spy.mockClear();
    const { result: createEntryHook } = renderHook(() => useCreateEntry(), { wrapper });
    await act(async () => {
      await createEntryHook.current.mutateAsync(sampleEntry);
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: PERSONAL_RECURRING_KEY });
    expect(spy).toHaveBeenCalledWith({ queryKey: PERSONAL_PLANNED_KEY });
  });
});
