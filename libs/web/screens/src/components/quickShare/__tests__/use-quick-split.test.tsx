import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import type { ExpenseView, PersonView, TripView } from '@cc/core';
import { entriesForSave, useQuickSplit, type QuickSplitKind } from '../useQuickSplit';

const ME = 'p-me';
const MINH = 'p-minh';
const LAN = 'p-lan';
const HUNG = 'p-hung';

function makePerson(id: string, name: string, status: PersonView['status'] = 'active'): PersonView {
  return {
    id,
    name,
    status,
    isMember: id === ME,
    bank: 'none',
  };
}

function makeExpense(overrides: Partial<ExpenseView> & Pick<ExpenseView, 'id' | 'payerId' | 'shares'>): ExpenseView {
  return {
    description: 'Cà phê',
    amount: 50_000,
    spentOn: '2026-11-21',
    mode: 'equal',
    status: 'approved',
    rejectReason: null,
    disabledByName: null,
    createdById: ME,
    createdAt: '2026-11-21T08:00:00.000Z',
    ...overrides,
  };
}

function makeTripView(overrides: Partial<TripView> = {}): TripView {
  return {
    trip: {
      id: 't-led',
      name: 'Direct',
      currency: 'VND',
      fewestTransfers: true,
      archived: false,
      version: 1,
      total: 0,
      preset: 'direct',
    },
    me: {
      kind: 'member',
      participantId: ME,
      participantPending: false,
      isOrganiser: true,
      isAdmin: true,
    },
    people: [
      makePerson(ME, 'Nhân'),
      makePerson(MINH, 'Minh'),
      makePerson(LAN, 'Lan'),
      makePerson('p-left', 'Cũ', 'left'),
    ],
    balances: {},
    suggestions: [],
    expenses: [
      makeExpense({
        id: 'e-1',
        payerId: ME,
        createdAt: '2026-11-20T10:00:00.000Z',
        shares: [
          { participantId: ME, amount: 25_000, inputValue: 1 },
          { participantId: MINH, amount: 25_000, inputValue: 1 },
        ],
      }),
    ],
    payments: [],
    myBalance: null,
    approvals: [],
    links: null,
    ...overrides,
  };
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

type FetchRouteHandler = (init: RequestInit | undefined, url: string) => Response | Promise<Response>;

function mockFetch(routes: Record<string, FetchRouteHandler | unknown>) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0]!;
    const method = (init?.method ?? 'GET').toUpperCase();
    calls.push({
      method,
      path,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const handler = routes[`${method} ${path}`];
    if (handler === undefined) {
      return Response.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 });
    }
    if (typeof handler === 'function') return (handler as FetchRouteHandler)(init, url);
    return Response.json(handler);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

beforeEach(() => {
  mockFetch({
    'GET /api/me/people/candidates': [],
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useQuickSplit', () => {
  it('handles null view or empty selection cleanly', () => {
    const queryClient = makeQueryClient();
    const { result } = renderHook(
      () => useQuickSplit({ view: null, me: null, kind: 'shared', amount: null }),
      { wrapper: makeWrapper(queryClient) },
    );

    expect(result.current.people).toEqual([]);
    expect(result.current.chipIds).toEqual([]);
    expect(result.current.chosen.size).toBe(0);
    expect(result.current.splitParticipants).toEqual([]);
    expect(result.current.result).toBeNull();
    expect(result.current.outcome).toBeNull();
    expect(result.current.canFlip).toBe(false);
    expect(result.current.splitExtra).toBeUndefined();
    expect(result.current.isDirty).toBe(false);
  });

  it('filters people to active direct-group members and computes shared 50k with Minh (unflipped and flipped)', () => {
    const view = makeTripView();
    const queryClient = makeQueryClient();
    const { result } = renderHook(
      () => useQuickSplit({ view, me: ME, kind: 'shared', amount: 50_000 }),
      { wrapper: makeWrapper(queryClient) },
    );

    expect(result.current.people.map((p) => p.id)).toEqual([ME, MINH, LAN]);
    expect(result.current.chipIds).toEqual([MINH, LAN]);
    expect(result.current.isDirty).toBe(false);
    expect(result.current.canFlip).toBe(false);

    act(() => {
      result.current.toggle(MINH);
    });

    // shared | flipped=no | split over me + chosen | payer me
    expect(result.current.isDirty).toBe(true);
    expect(result.current.canFlip).toBe(true);
    expect(result.current.payerId).toBe(ME);
    expect(result.current.splitParticipants).toEqual([ME, MINH]);
    expect(result.current.result).toEqual({
      ok: true,
      shares: [
        { participantId: ME, amount: 25_000 },
        { participantId: MINH, amount: 25_000 },
      ],
    });
    expect(result.current.outcome).toEqual({
      myShare: 25_000,
      lines: [{ personId: MINH, amount: 25_000, direction: 'owesMe' }],
    });
    expect(entriesForSave(result.current)).toEqual([
      { participantId: ME, value: 1 },
      { participantId: MINH, value: 1 },
    ]);

    // shared | flipped=yes | split over me + chosen | payer Minh
    act(() => {
      result.current.setFlipped(true);
    });

    expect(result.current.flipped).toBe(true);
    expect(result.current.payerId).toBe(MINH);
    expect(result.current.splitParticipants).toEqual([ME, MINH]);
    expect(result.current.result).toEqual({
      ok: true,
      shares: [
        { participantId: ME, amount: 25_000 },
        { participantId: MINH, amount: 25_000 },
      ],
    });
    expect(result.current.outcome).toEqual({
      myShare: 25_000,
      lines: [{ personId: MINH, amount: 25_000, direction: 'iOwe' }],
    });
  });

  it('computes loan 50k with Minh (unflipped and flipped)', () => {
    const view = makeTripView();
    const queryClient = makeQueryClient();
    const { result } = renderHook(
      () => useQuickSplit({ view, me: ME, kind: 'loan', amount: 50_000 }),
      { wrapper: makeWrapper(queryClient) },
    );

    act(() => {
      result.current.toggle(MINH);
    });

    // loan | flipped=no | split over chosen only | payer me
    expect(result.current.canFlip).toBe(true);
    expect(result.current.payerId).toBe(ME);
    expect(result.current.splitParticipants).toEqual([MINH]);
    expect(result.current.result).toEqual({
      ok: true,
      shares: [{ participantId: MINH, amount: 50_000 }],
    });
    expect(result.current.outcome).toEqual({
      myShare: 0,
      lines: [{ personId: MINH, amount: 50_000, direction: 'owesMe' }],
    });
    expect(entriesForSave(result.current)).toEqual([{ participantId: MINH, value: 1 }]);

    // loan | flipped=yes | split over me, the whole amount | payer Minh
    act(() => {
      result.current.setFlipped(true);
    });

    expect(result.current.flipped).toBe(true);
    expect(result.current.payerId).toBe(MINH);
    expect(result.current.splitParticipants).toEqual([ME]);
    expect(result.current.result).toEqual({
      ok: true,
      shares: [{ participantId: ME, amount: 50_000 }],
    });
    expect(result.current.outcome).toEqual({
      myShare: 50_000,
      lines: [{ personId: MINH, amount: 50_000, direction: 'iOwe' }],
    });
    expect(entriesForSave(result.current)).toEqual([{ participantId: ME, value: 1 }]);
  });

  it('splits loan with Minh and Lan for 100k into 50k each and disables flip', () => {
    const view = makeTripView();
    const queryClient = makeQueryClient();
    const { result } = renderHook(
      () => useQuickSplit({ view, me: ME, kind: 'loan', amount: 100_000 }),
      { wrapper: makeWrapper(queryClient) },
    );

    act(() => {
      result.current.toggle(MINH);
      result.current.toggle(LAN);
    });

    expect(result.current.canFlip).toBe(false);
    expect(result.current.payerId).toBe(ME);
    expect(result.current.splitParticipants).toEqual([MINH, LAN]);
    expect(result.current.result).toEqual({
      ok: true,
      shares: [
        { participantId: MINH, amount: 50_000 },
        { participantId: LAN, amount: 50_000 },
      ],
    });
    expect(result.current.outcome).toEqual({
      myShare: 0,
      lines: [
        { personId: MINH, amount: 50_000, direction: 'owesMe' },
        { personId: LAN, amount: 50_000, direction: 'owesMe' },
      ],
    });

    // Attempting to flip when canFlip is false is ignored
    act(() => {
      result.current.setFlipped(true);
    });
    expect(result.current.flipped).toBe(false);
  });

  it('defaults payerId to the first chosen when shared + flipped with two people, and setPayerId changes it', () => {
    const view = makeTripView();
    const queryClient = makeQueryClient();
    const { result } = renderHook(
      () => useQuickSplit({ view, me: ME, kind: 'shared', amount: 90_000 }),
      { wrapper: makeWrapper(queryClient) },
    );

    act(() => {
      result.current.toggle(MINH);
      result.current.toggle(LAN);
    });
    act(() => {
      result.current.setFlipped(true);
    });

    expect(result.current.canFlip).toBe(true);
    expect(result.current.flipped).toBe(true);
    expect(result.current.payerId).toBe(MINH);

    act(() => {
      result.current.setPayerId(LAN);
    });

    expect(result.current.payerId).toBe(LAN);
    expect(result.current.outcome).toEqual({
      myShare: 30_000,
      lines: [{ personId: LAN, amount: 30_000, direction: 'iOwe' }],
    });
  });

  it('validates amounts mode: 20k/50k/50k on 120k is ok; 20k/50k/40k fails', () => {
    const view = makeTripView();
    const queryClient = makeQueryClient();
    const { result } = renderHook(
      () => useQuickSplit({ view, me: ME, kind: 'shared', amount: 120_000 }),
      { wrapper: makeWrapper(queryClient) },
    );

    act(() => {
      result.current.toggle(MINH);
      result.current.toggle(LAN);
      result.current.setMode('amounts');
    });

    act(() => {
      result.current.setInput(ME, '20000');
      result.current.setInput(MINH, '50000');
      result.current.setInput(LAN, '50000');
    });

    expect(result.current.result).toEqual({
      ok: true,
      shares: [
        { participantId: ME, amount: 20_000 },
        { participantId: MINH, amount: 50_000 },
        { participantId: LAN, amount: 50_000 },
      ],
    });
    expect(entriesForSave(result.current)).toEqual([
      { participantId: ME, value: 20_000 },
      { participantId: MINH, value: 50_000 },
      { participantId: LAN, value: 50_000 },
    ]);

    act(() => {
      result.current.setInput(LAN, '40000');
    });

    expect(result.current.result).toEqual({ ok: false, error: 'AMOUNTS_DONT_ADD_UP' });
    expect(result.current.outcome).toBeNull();
  });

  it('keeps chosen and resets flipped when kind changes', () => {
    const view = makeTripView();
    const queryClient = makeQueryClient();
    const { result, rerender } = renderHook(
      ({ kind }: { kind: QuickSplitKind }) =>
        useQuickSplit({ view, me: ME, kind, amount: 50_000 }),
      {
        wrapper: makeWrapper(queryClient),
        initialProps: { kind: 'shared' as QuickSplitKind },
      },
    );

    act(() => {
      result.current.toggle(MINH);
    });
    act(() => {
      result.current.setFlipped(true);
    });

    expect(result.current.chosen.has(MINH)).toBe(true);
    expect(result.current.flipped).toBe(true);

    rerender({ kind: 'loan' });

    expect(result.current.chosen.has(MINH)).toBe(true);
    expect(result.current.flipped).toBe(false);
    expect(result.current.payerId).toBe(ME);
    expect(result.current.splitParticipants).toEqual([MINH]);

    act(() => {
      result.current.setFlipped(true);
    });
    expect(result.current.flipped).toBe(true);

    rerender({ kind: 'shared' });

    expect(result.current.chosen.has(MINH)).toBe(true);
    expect(result.current.flipped).toBe(false);
    expect(result.current.splitParticipants).toEqual([ME, MINH]);
  });

  it('puts a newly added person first in chipIds after the view refetches with their expense', async () => {
    const { calls } = mockFetch({
      'GET /api/me/people/candidates': [],
      'POST /api/me/ledger/people': { participantId: HUNG },
    });

    const initialView = makeTripView();
    const queryClient = makeQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result, rerender } = renderHook(
      ({ view }: { view: TripView }) =>
        useQuickSplit({ view, me: ME, kind: 'shared', amount: 50_000 }),
      {
        wrapper: makeWrapper(queryClient),
        initialProps: { view: initialView },
      },
    );

    expect(result.current.chipIds).toEqual([MINH, LAN]);
    expect(result.current.splitExtra).toBeDefined();

    let addedId = '';
    await act(async () => {
      addedId = await result.current.splitExtra!.onAddName('Hùng');
    });

    expect(addedId).toBe(HUNG);
    expect(calls.some((c) => c.method === 'POST' && c.path === '/api/me/ledger/people')).toBe(true);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['trip', 't-led'] });

    act(() => {
      result.current.setChosen(new Set([addedId]));
    });
    expect(result.current.chosen.has(HUNG)).toBe(true);

    const refetchedView = makeTripView({
      people: [...initialView.people, makePerson(HUNG, 'Hùng')],
      expenses: [
        ...initialView.expenses,
        makeExpense({
          id: 'e-2',
          payerId: ME,
          createdAt: '2026-11-21T12:00:00.000Z',
          shares: [
            { participantId: ME, amount: 25_000, inputValue: 1 },
            { participantId: HUNG, amount: 25_000, inputValue: 1 },
          ],
        }),
      ],
    });

    rerender({ view: refetchedView });

    expect(result.current.chipIds[0]).toBe(HUNG);
  });

  it('resets state cleanly with reset()', () => {
    const view = makeTripView();
    const queryClient = makeQueryClient();
    const { result } = renderHook(
      () => useQuickSplit({ view, me: ME, kind: 'shared', amount: 60_000 }),
      { wrapper: makeWrapper(queryClient) },
    );

    act(() => {
      result.current.toggle(MINH);
      result.current.setMode('amounts');
    });
    act(() => {
      result.current.setFlipped(true);
      result.current.setInput(ME, '20000');
      result.current.setInput(MINH, '40000');
    });

    expect(result.current.isDirty).toBe(true);
    expect(result.current.flipped).toBe(true);
    expect(result.current.mode).toBe('amounts');

    act(() => {
      result.current.reset();
    });

    expect(result.current.isDirty).toBe(false);
    expect(result.current.chosen.size).toBe(0);
    expect(result.current.flipped).toBe(false);
    expect(result.current.mode).toBe('equal');
    expect(result.current.inputs).toEqual({});
    expect(result.current.result).toBeNull();
    expect(result.current.outcome).toBeNull();
  });

  it('resolves blank boxes in entriesForSave for amounts, percent, shares, and adjust modes', () => {
    const view = makeTripView();
    const queryClient = makeQueryClient();
    const { result } = renderHook(
      () => useQuickSplit({ view, me: ME, kind: 'shared', amount: 120_000 }),
      { wrapper: makeWrapper(queryClient) },
    );

    act(() => {
      result.current.toggle(MINH);
      result.current.toggle(LAN);
      result.current.setMode('amounts');
    });
    act(() => {
      result.current.setInput(ME, '20000');
      // MINH and LAN left blank -> auto-split remaining 100k as 50k each
    });
    expect(entriesForSave(result.current)).toEqual([
      { participantId: ME, value: 20_000 },
      { participantId: MINH, value: 50_000 },
      { participantId: LAN, value: 50_000 },
    ]);

    act(() => {
      result.current.setMode('percent');
    });
    act(() => {
      result.current.setInput(ME, '50');
      // MINH and LAN left blank -> 25% each (2500 bps)
    });
    expect(entriesForSave(result.current)).toEqual([
      { participantId: ME, value: 5000 },
      { participantId: MINH, value: 2500 },
      { participantId: LAN, value: 2500 },
    ]);

    act(() => {
      result.current.setMode('shares');
    });
    act(() => {
      result.current.setInput(ME, '2');
      // MINH and LAN left blank -> 1 share each (100)
    });
    expect(entriesForSave(result.current)).toEqual([
      { participantId: ME, value: 200 },
      { participantId: MINH, value: 100 },
      { participantId: LAN, value: 100 },
    ]);

    act(() => {
      result.current.setMode('adjust');
    });
    act(() => {
      result.current.setInput(ME, '+10000');
      // MINH and LAN left blank -> 0 adjustment
    });
    expect(entriesForSave(result.current)).toEqual([
      { participantId: ME, value: 10_000 },
      { participantId: MINH, value: 0 },
      { participantId: LAN, value: 0 },
    ]);
  });
});
