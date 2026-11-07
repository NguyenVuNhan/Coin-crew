import { describe, it, expect } from 'vitest';
import type { PaymentView, TripView } from '@cc/core';
import { PIDS, guestChiView, tripView } from '../../test/fixtures';
import { owedTransfers, waitingPayments } from '../owe';

const payment = (overrides: Partial<PaymentView>): PaymentView => ({
  id: 'pay-1', fromId: PIDS.C, toId: PIDS.M, amountClaimed: 500000, amountConfirmed: null,
  status: 'says_paid', notArrived: false, createdAt: '2026-10-12T00:00:00.000Z', disabledByName: null, ...overrides,
});

describe('owedTransfers', () => {
  it('returns only the transfers I make, in order', () => {
    const view: TripView = {
      ...guestChiView(),
      suggestions: [
        { fromId: PIDS.B, toId: PIDS.M, amount: 565000 },
        { fromId: PIDS.C, toId: PIDS.M, amount: 1000000 },
        { fromId: PIDS.C, toId: PIDS.B, amount: 245000 },
      ],
    };
    expect(owedTransfers(view)).toEqual([
      { fromId: PIDS.C, toId: PIDS.M, amount: 1000000 },
      { fromId: PIDS.C, toId: PIDS.B, amount: 245000 },
    ]);
  });

  it('is empty when I owe nothing', () => expect(owedTransfers(tripView())).toEqual([]));

  it('is empty without a participant', () => {
    const view: TripView = { ...guestChiView(), me: { ...guestChiView().me, participantId: null } };
    expect(owedTransfers(view)).toEqual([]);
  });
});

describe('waitingPayments', () => {
  it('returns only my payments that wait for confirmation', () => {
    const mine = payment({ id: 'pay-mine' });
    const view: TripView = {
      ...guestChiView(),
      payments: [
        mine,
        payment({ id: 'pay-confirmed', status: 'confirmed', amountConfirmed: 500000 }),
        payment({ id: 'pay-binh', fromId: PIDS.B }),
      ],
    };
    expect(waitingPayments(view)).toEqual([mine]);
  });

  it('is empty without a participant', () => {
    const view: TripView = { ...guestChiView(), me: { ...guestChiView().me, participantId: null }, payments: [payment({})] };
    expect(waitingPayments(view)).toEqual([]);
  });
});
