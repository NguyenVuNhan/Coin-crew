import type { ExpenseView, PickerView, TripView } from '@fsl/core';

/** The mockup trip (docs/superpowers/mockups/v1-flow.html) as the API returns it. */
export const PIDS = { M: 'p-minh', A: 'p-an', B: 'p-binh', C: 'p-chi' } as const;

const eq = (ids: string[], each: number) => ids.map((participantId) => ({ participantId, amount: each, inputValue: 1 }));
const all = [PIDS.M, PIDS.A, PIDS.B, PIDS.C];

const expense = (id: string, description: string, payerId: string, amount: number, people: string[], extra: Partial<ExpenseView> = {}): ExpenseView => ({
  id, description, amount, spentOn: '2026-10-10', payerId, mode: 'equal', status: 'approved', rejectReason: null,
  disabledByName: null, createdById: PIDS.M, shares: eq(people, amount / people.length), ...extra,
});

export function tripView(overrides: Partial<TripView> = {}): TripView {
  return {
    trip: { id: 't-1', name: 'Đà Lạt · Oct 2026', currency: 'VND', fewestTransfers: true, archived: false, version: 3, total: 4900000 },
    me: { kind: 'member', participantId: PIDS.M, participantPending: false, isOrganiser: true },
    people: [
      { id: PIDS.M, name: 'Minh', status: 'active', isMember: true, bank: 'approved' },
      { id: PIDS.A, name: 'An', status: 'active', isMember: false, bank: 'none' },
      { id: PIDS.B, name: 'Bình', status: 'active', isMember: false, bank: 'none' },
      { id: PIDS.C, name: 'Chi', status: 'active', isMember: false, bank: 'none' },
    ],
    balances: { [PIDS.M]: 2195000, [PIDS.A]: -385000, [PIDS.B]: -565000, [PIDS.C]: -1245000 },
    suggestions: [
      { fromId: PIDS.C, toId: PIDS.M, amount: 1245000 },
      { fromId: PIDS.B, toId: PIDS.M, amount: 565000 },
      { fromId: PIDS.A, toId: PIDS.M, amount: 385000 },
    ],
    expenses: [
      expense('e-4', 'Cà phê Túi Mơ To', PIDS.M, 240000, [PIDS.M, PIDS.A, PIDS.C]),
      expense('e-3', 'Motorbike rental + fuel', PIDS.B, 600000, all),
      expense('e-2', 'Lẩu gà lá é', PIDS.A, 860000, all),
      expense('e-1', 'Homestay Bloom · 2 nights', PIDS.M, 3200000, all),
    ],
    payments: [],
    myBalance: { now: 2195000, beforePayments: 2195000, ifPendingApproved: null, waitingConfirm: 0 },
    approvals: [],
    links: { group: 'gtok-1', view: 'vtok-1' },
    ...overrides,
  };
}

/** Chi's view as a guest, with a pending street-food expense of hers. */
export function guestChiView(): TripView {
  const base = tripView();
  return {
    ...base,
    me: { kind: 'guest', participantId: PIDS.C, participantPending: false, isOrganiser: false },
    expenses: [
      expense('e-5', 'Bánh tráng nướng, chợ đêm', PIDS.C, 180000, all, { status: 'pending', createdById: PIDS.C }),
      ...base.expenses,
    ],
    myBalance: { now: -1245000, beforePayments: -1245000, ifPendingApproved: -1110000, waitingConfirm: 0 },
    approvals: [],
    links: null,
  };
}

export function viewerView(): TripView {
  return { ...tripView(), me: { kind: 'viewer', participantId: null, participantPending: false, isOrganiser: false }, myBalance: null, approvals: [], links: null };
}

export function picker(overrides: Partial<PickerView> = {}): PickerView {
  return {
    people: [
      { id: PIDS.M, name: 'Minh', status: 'active', isMember: true, lastUsedHere: false, activeElsewhere: null },
      { id: PIDS.A, name: 'An', status: 'active', isMember: false, lastUsedHere: false, activeElsewhere: new Date(Date.now() - 2 * 3600_000).toISOString() },
      { id: PIDS.B, name: 'Bình', status: 'active', isMember: false, lastUsedHere: false, activeElsewhere: null },
      { id: PIDS.C, name: 'Chi', status: 'active', isMember: false, lastUsedHere: true, activeElsewhere: null },
    ],
    myPick: PIDS.C,
    ...overrides,
  };
}
