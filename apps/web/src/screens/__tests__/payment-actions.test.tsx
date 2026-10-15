import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PaymentView, TripView } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { guestChiView, tripView, PIDS } from '../../test/fixtures';
import { TripRoute } from '../TripRoute';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const route = { route: '/t/t-1', path: '/t/:tripId' };
const payment = (p: Partial<PaymentView> & Pick<PaymentView, 'id' | 'fromId' | 'toId' | 'status'>): PaymentView => ({
  amountClaimed: 100000, amountConfirmed: p.status === 'confirmed' ? 100000 : null, notArrived: false, createdAt: '2026-10-12T08:00:00.000Z', ...p,
});

describe('member: payment actions (spec §9.4)', () => {
  it('marks money as received without waiting for a claim', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
    const { calls } = mockApi({
      'GET /api/trips/t-1': tripView(), 'GET /api/trips/t-1/version': { version: 3 },
      'POST /api/trips/t-1/payments': () => Response.json({ paymentId: 'pay-9', status: 'confirmed' }, { status: 201 }),
    });
    renderAt(<TripRoute />, route);
    const row = await screen.findByTestId(`transfer-${PIDS.C}-${PIDS.M}`);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(within(row).getByRole('button', { name: 'Mark 1.245.000₫ from Chi as received' }));
    // Recorded once Undo has had its 5 seconds.
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    await waitFor(() => expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ fromId: PIDS.C, toId: PIDS.M, amount: 1245000 }));
  });

  it('lists every payment and can disable or re-enable any of them', async () => {
    const view: TripView = tripView({
      payments: [
        payment({ id: 'pay-g', fromId: PIDS.A, toId: PIDS.C, status: 'confirmed' }),
        payment({ id: 'pay-d', fromId: PIDS.B, toId: PIDS.M, status: 'disabled' }),
      ],
    });
    const { calls } = mockApi({
      'GET /api/trips/t-1': view, 'GET /api/trips/t-1/version': { version: 3 },
      'POST /api/trips/t-1/payments/pay-g/disable': null,
      'POST /api/trips/t-1/payments/pay-d/enable': null,
    });
    renderAt(<TripRoute />, route);
    const list = await screen.findByRole('region', { name: 'Payments' });
    await userEvent.click(within(within(list).getByTestId('payment-row-pay-g')).getByRole('button', { name: 'Disable' }));
    await userEvent.click(within(within(list).getByTestId('payment-row-pay-d')).getByRole('button', { name: 'Enable' }));
    await waitFor(() => {
      expect(calls.some((c) => c.path === '/api/trips/t-1/payments/pay-g/disable')).toBe(true);
      expect(calls.some((c) => c.path === '/api/trips/t-1/payments/pay-d/enable')).toBe(true);
    });
    expect(within(list).getByTestId('payment-row-pay-d')).toHaveTextContent('Disabled');
  });
});

describe('guest: payments to me', () => {
  function chiIsOwed(): TripView {
    return {
      ...guestChiView(),
      balances: { [PIDS.M]: 0, [PIDS.A]: -200000, [PIDS.B]: 0, [PIDS.C]: 200000 },
      suggestions: [{ fromId: PIDS.A, toId: PIDS.C, amount: 200000 }],
      payments: [payment({ id: 'pay-3', fromId: PIDS.B, toId: PIDS.C, status: 'confirmed' })],
      myBalance: { now: 200000, beforePayments: 300000, ifPendingApproved: null, waitingConfirm: 0 },
    };
  }

  it('marks a transfer as received and reports one that did not arrive', async () => {
    const { calls } = mockApi({
      'GET /api/trips/t-1': chiIsOwed(), 'GET /api/trips/t-1/version': { version: 3 },
      'POST /api/trips/t-1/payments': () => Response.json({ paymentId: 'pay-9', status: 'confirmed' }, { status: 201 }),
      'POST /api/trips/t-1/payments/pay-3/not-arrived': null,
    });
    renderAt(<TripRoute />, route);
    const paysYou = await screen.findByRole('region', { name: 'Who pays you' });
    await userEvent.click(within(paysYou).getByRole('button', { name: 'Received' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.path === '/api/trips/t-1/payments')?.body).toEqual({ fromId: PIDS.A, toId: PIDS.C, amount: 200000 }));
    await userEvent.click(within(screen.getByTestId('payment-row-pay-3')).getByRole('button', { name: "Didn't arrive" }));
    await waitFor(() => expect(calls.some((c) => c.path === '/api/trips/t-1/payments/pay-3/not-arrived')).toBe(true));
  });
});

describe('polling budget', () => {
  it('pauses updates after 15 minutes and offers to check again', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
    mockApi({ 'GET /api/trips/t-1': tripView(), 'GET /api/trips/t-1/version': { version: 3 } });
    renderAt(<TripRoute />, route);
    await screen.findByText("You're owed");
    await act(async () => {
      vi.advanceTimersByTime(15 * 60_000 + 1);
    });
    expect(screen.getByRole('button', { name: 'Tap to check again' })).toBeInTheDocument();
  });
});
