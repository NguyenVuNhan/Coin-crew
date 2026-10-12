import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TripView } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { guestChiView, tripView, PIDS } from '../../test/fixtures';
import { TripRoute } from '../TripRoute';
import { Activity } from '../Activity';
import { remindText } from '../../lib/remind';

afterEach(() => {
  vi.unstubAllGlobals();
});

const route = { route: '/t/t-1', path: '/t/:tripId' };

/** Minh's view with one approval of every kind. */
function busyView(): TripView {
  const base = tripView();
  const chiPending = guestChiView().expenses[0]!;
  return {
    ...base,
    people: [...base.people, { id: 'p-new', name: 'Chi Nguyễn', status: 'pending', isMember: false, bank: 'none' }],
    expenses: [chiPending, { ...base.expenses[3]!, id: 'e-1d', description: 'Old taxi', status: 'disabled', disabledByName: 'Minh' }, ...base.expenses],
    payments: [
      { id: 'pay-1', fromId: PIDS.C, toId: PIDS.M, amountClaimed: 1245000, amountConfirmed: null, status: 'says_paid', notArrived: false, createdAt: '2026-10-12T08:00:00.000Z' },
      { id: 'pay-2', fromId: PIDS.A, toId: PIDS.C, amountClaimed: 200000, amountConfirmed: 200000, status: 'confirmed', notArrived: true, createdAt: '2026-10-12T09:00:00.000Z' },
    ],
    approvals: [
      { kind: 'expense', expenseId: chiPending.id },
      { kind: 'name', participantId: 'p-new', matches: [{ id: PIDS.C, name: 'Chi', reason: 'part' }] },
      { kind: 'bank', bankId: 'b-1', participantId: PIDS.C, bankName: 'MBBank', accountNumber: '0123456789', holderName: 'TRAN THI CHI' },
      { kind: 'payment', paymentId: 'pay-1' },
      { kind: 'not_arrived', paymentId: 'pay-2' },
      { kind: 'membership', requestId: 'm-1', participantId: PIDS.A, userName: 'An Trần', userEmail: 'an@example.com' },
    ],
  };
}

describe('member trip page', () => {
  it('shows my balance against the trip', async () => {
    mockApi({ 'GET /api/trips/t-1': tripView(), 'GET /api/trips/t-1/version': { version: 3 } });
    renderAt(<TripRoute />, route);
    expect(await screen.findByText("You're still owed")).toBeInTheDocument();
    expect(screen.getAllByText('2.195.000₫').length).toBeGreaterThan(0);
    expect(screen.getByText('of 2.195.000₫ · trip total 4.900.000₫')).toBeInTheDocument();
  });

  it('lists every kind of approval with its actions', async () => {
    const { calls } = mockApi({
      'GET /api/trips/t-1': busyView(), 'GET /api/trips/t-1/version': { version: 3 },
      'POST /api/trips/t-1/expenses/e-5/approve': null,
    });
    renderAt(<TripRoute />, route);
    const card = await screen.findByRole('region', { name: 'Needs approval' });
    expect(within(card).getByText('Chi added Bánh tráng nướng, chợ đêm')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Same as Chi' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'New person' })).toBeInTheDocument();
    expect(within(card).getByText('0123456789')).toBeInTheDocument();
    expect(within(card).getByText("Chi says it's paid. Did it arrive?")).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: "Didn't arrive" })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Keep' })).toBeInTheDocument();
    expect(within(card).getByText('An Trần (an@example.com) wants to join as An')).toBeInTheDocument();
    await userEvent.click(within(card).getAllByRole('button', { name: 'Approve' })[0]!);
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/trips/t-1/expenses/e-5/approve')).toBe(true));
  });

  it('tells you to approve a pending name first', async () => {
    const view = busyView();
    view.expenses[0] = { ...view.expenses[0]!, shares: [...view.expenses[0]!.shares, { participantId: 'p-new', amount: 0, inputValue: 1 }] };
    mockApi({
      'GET /api/trips/t-1': view, 'GET /api/trips/t-1/version': { version: 3 },
      'POST /api/trips/t-1/expenses/e-5/approve': () => Response.json({ error: { code: 'PERSON_PENDING', message: 'x' } }, { status: 409 }),
    });
    renderAt(<TripRoute />, route);
    const card = await screen.findByRole('region', { name: 'Needs approval' });
    await userEvent.click(within(card).getAllByRole('button', { name: 'Approve' })[0]!);
    expect(await within(card).findByText('Approve Chi Nguyễn first')).toBeInTheDocument();
  });

  it('shows disabled expenses crossed out with who did it', async () => {
    mockApi({ 'GET /api/trips/t-1': busyView(), 'GET /api/trips/t-1/version': { version: 3 } });
    renderAt(<TripRoute />, route);
    expect(await screen.findByText('Disabled by Minh')).toBeInTheDocument();
    expect(screen.getByText('Old taxi')).toHaveStyle({ textDecoration: 'line-through' });
  });

  it('explains Fewest transfers and switches it', async () => {
    const { calls } = mockApi({ 'GET /api/trips/t-1': tripView(), 'GET /api/trips/t-1/version': { version: 3 }, 'PATCH /api/trips/t-1': null });
    renderAt(<TripRoute />, route);
    expect(await screen.findByText("We combine everyone's debts so people make as few bank transfers as possible. What each person owes in total stays the same.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('switch', { name: 'Fewest transfers' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ fewestTransfers: false }));
  });

  it('reminds with the share sheet', async () => {
    const share = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, share });
    mockApi({ 'GET /api/trips/t-1': tripView(), 'GET /api/trips/t-1/version': { version: 3 } });
    renderAt(<TripRoute />, route);
    const chiRow = await screen.findByTestId(`who-pays-${PIDS.C}-${PIDS.M}`);
    await userEvent.click(within(chiRow).getByRole('button', { name: 'Remind' }));
    await waitFor(() => expect(share).toHaveBeenCalledWith({ text: `Hi Chi! You still owe Minh 1.245.000₫ for "Đà Lạt · Oct 2026". See details and pay with VietQR: ${location.origin}/j/gtok-1` }));
  });

  it('an empty trip invites the first expense', async () => {
    mockApi({ 'GET /api/trips/t-1': tripView({ expenses: [], suggestions: [], balances: {}, trip: { ...tripView().trip, total: 0 } }), 'GET /api/trips/t-1/version': { version: 3 } });
    renderAt(<TripRoute />, route);
    expect(await screen.findByText('No expenses yet. Add the first one.')).toBeInTheDocument();
  });
});

describe('remindText', () => {
  it('builds the English and Vietnamese messages', () => {
    const vars = { name: 'Chi', creditor: 'Minh', amount: '1.245.000₫', trip: 'Đà Lạt', link: 'https://x/j/g' };
    expect(remindText('en', vars)).toBe('Hi Chi! You still owe Minh 1.245.000₫ for "Đà Lạt". See details and pay with VietQR: https://x/j/g');
    expect(remindText('vi', vars)).toBe('Chào Chi! Bạn còn 1.245.000₫ cần trả Minh cho chuyến "Đà Lạt". Xem chi tiết và chuyển khoản bằng VietQR: https://x/j/g');
  });
});

describe('Activity', () => {
  it('lists who did what', async () => {
    mockApi({
      'GET /api/trips/t-1/activity': [
        { id: 'a-2', action: 'expense_approved', actorName: 'Minh', deviceShort: 'abc123', details: {}, createdAt: new Date().toISOString() },
        { id: 'a-1', action: 'trip_created', actorName: 'Minh', deviceShort: null, details: {}, createdAt: '2026-10-10T00:00:00.000Z' },
      ],
    });
    renderAt(<Activity />, { route: '/t/t-1/activity', path: '/t/:tripId/activity' });
    expect(await screen.findByText('Minh approved an expense')).toBeInTheDocument();
    expect(screen.getByText('Minh created the trip')).toBeInTheDocument();
  });
});
