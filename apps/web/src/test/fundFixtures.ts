import type { ExpenseView, IncomeView, TripView } from '@fsl/core';
import { PIDS, tripView } from './fixtures';

export const income = (id: string, description: string, amount: number, extra: Partial<IncomeView> = {}): IncomeView => ({
  id, rootId: id, description, amount, spentOn: '2026-10-26', addedById: PIDS.M, createdById: PIDS.M, createdAt: '',
  status: 'approved', disabledByName: null, meta: { category: null }, history: [], ...extra,
});

export const fundPaid = (id: string, description: string, amount: number, extra: Partial<ExpenseView> = {}): ExpenseView => ({
  id, description, amount, spentOn: '2026-10-26', payerId: PIDS.M, mode: 'equal', status: 'approved', rejectReason: null,
  disabledByName: null, createdById: PIDS.M, shares: [], meta: { paidFromFund: true }, ...extra,
});

/** A sport group with a fund: 400.000₫ left of 650.000₫ added, two expenses paid from it, then the usual trip. */
export function sportFundView(overrides: Partial<TripView> = {}): TripView {
  const base = tripView();
  return {
    ...base,
    trip: { ...base.trip, preset: 'sport' },
    fund: {
      balance: 400000, added: 650000, spent: 250000,
      incomes: [
        income('i-1', 'Thu 2 khách vãng lai', 200000, { createdAt: '2026-10-26T10:00' }),
        income('i-2', 'Anh Minh donate quỹ', 300000, { createdAt: '2026-10-25T10:00' }),
        income('i-3', 'Lan đóng quỹ', 150000, { createdAt: '2026-10-24T10:00' }),
        income('i-4', 'Thu vãng lai (nhập trùng)', 100000, { createdAt: '2026-10-23T10:00', status: 'disabled', disabledByName: 'Minh' }),
      ],
    },
    expenses: [
      fundPaid('e-f1', 'Nước sau trận', 150000, { createdAt: '2026-10-26T11:00' }),
      fundPaid('e-f2', 'Hộp cầu mới', 100000, { createdAt: '2026-10-25T09:00' }),
      ...base.expenses,
    ],
    ...overrides,
  };
}

/** The same group as An sees it: a member, not an admin. */
export function sportMemberView(): TripView {
  return { ...sportFundView(), me: { kind: 'member', participantId: PIDS.A, participantPending: false, isOrganiser: false, isAdmin: false } };
}
