import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TripView } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { mockMedia } from '../../test/media';
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

/** A trip with nothing in it yet. */
const emptyTrip = (): TripView =>
  tripView({
    expenses: [], suggestions: [], balances: {}, trip: { ...tripView().trip, total: 0 },
    myBalance: { now: 0, beforePayments: 0, ifPendingApproved: null, waitingConfirm: 0 },
  });

const TRIP_API = { 'GET /api/trips/t-1/version': { version: 3 } };

describe('member trip page', () => {
  it('shows my balance against the trip', async () => {
    mockApi({ 'GET /api/trips/t-1': tripView(), 'GET /api/trips/t-1/version': { version: 3 } });
    renderAt(<TripRoute />, route);
    expect(await screen.findByText("You're owed")).toBeInTheDocument();
    expect(screen.getAllByText('2.195.000₫').length).toBeGreaterThan(0);
    expect(screen.getByText('Trip total 4.900.000₫')).toBeInTheDocument();
    expect(screen.queryByText(/of 2\.195\.000₫/)).toBeNull();
  });

  it('counts the money that has arrived', async () => {
    const view = tripView({ myBalance: { now: 1900000, beforePayments: 2195000, ifPendingApproved: null, waitingConfirm: 0 } });
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': view });
    renderAt(<TripRoute />, route);
    expect(await screen.findByText('Trip total 4.900.000₫ · 295.000₫ received so far')).toBeInTheDocument();
    expect(screen.getAllByText('1.900.000₫').length).toBeGreaterThan(0);
  });

  it('says who I am waiting on', async () => {
    const view = tripView({
      payments: [{ id: 'pay-w', fromId: PIDS.M, toId: PIDS.B, amountClaimed: 100000, amountConfirmed: null, status: 'says_paid', notArrived: false, createdAt: '2026-10-12T08:00:00.000Z' }],
    });
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': view });
    renderAt(<TripRoute />, route);
    expect(await screen.findByText('100.000₫ waiting for Bình to confirm')).toBeInTheDocument();
  });

  it('a new trip leads with the invite card', async () => {
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': emptyTrip() });
    renderAt(<TripRoute />, route);
    const invite = await screen.findByText('Invite your group');
    expect(screen.getByText('Post this link in your group chat. Friends pick their name, no account needed.')).toBeInTheDocument();
    expect(screen.queryByText("You're owed")).toBeNull();
    expect(screen.queryByText("You're all settled")).toBeNull();
    const expenses = screen.getByRole('region', { name: 'Expenses' });
    expect(within(expenses).getByText('Add the first expense')).toBeInTheDocument();
    expect(invite.compareDocumentPosition(expenses) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('the Invite button shares the group link', async () => {
    const share = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, share });
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': tripView() });
    renderAt(<TripRoute />, route);
    await userEvent.click(await screen.findByRole('button', { name: 'Invite' }));
    const sheet = await screen.findByRole('dialog', { name: 'Invite' });
    const group = within(sheet).getByRole('group', { name: 'Group link' });
    expect(within(group).getByLabelText('Group link')).toHaveValue(`${location.origin}/j/gtok-1`);
    expect(within(sheet).getByRole('group', { name: 'View-only link' })).toBeInTheDocument();
    await userEvent.click(within(group).getByRole('button', { name: 'Share' }));
    expect(share).toHaveBeenCalledWith({ title: 'Đà Lạt · Oct 2026', text: 'Join "Đà Lạt · Oct 2026" to split costs:', url: `${location.origin}/j/gtok-1` });
  });

  it('without a share sheet, Share copies the link', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } });
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': emptyTrip() });
    renderAt(<TripRoute />, route);
    await screen.findByText('Invite your group');
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(writeText).toHaveBeenCalledWith(`${location.origin}/j/gtok-1`);
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('making a new link asks first', async () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal('confirm', confirm);
    const { calls } = mockApi({ ...TRIP_API, 'GET /api/trips/t-1': tripView(), 'POST /api/trips/t-1/links/regenerate': null });
    renderAt(<TripRoute />, route);
    await userEvent.click(await screen.findByRole('button', { name: 'Invite' }));
    const viewLink = within(await screen.findByRole('dialog', { name: 'Invite' })).getByRole('group', { name: 'View-only link' });
    await userEvent.click(within(viewLink).getByRole('button', { name: 'Make a new link' }));
    expect(confirm).toHaveBeenCalledWith('The old link will stop working. Make a new one?');
    await waitFor(() => expect(calls.find((c) => c.path === '/api/trips/t-1/links/regenerate')?.body).toEqual({ which: 'view' }));
  });

  it('tapping an expense opens its details', async () => {
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': tripView() });
    renderAt(<TripRoute />, route);
    await userEvent.click(await screen.findByRole('button', { name: /^Cà phê Túi Mơ To/ }));
    expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1/expenses/e-4');
  });

  it('disabling an expense from its row', async () => {
    mockMedia({ coarse: false });
    const base = tripView();
    const view = tripView({ expenses: [{ ...base.expenses[3]!, id: 'e-1d', description: 'Old taxi' }, ...base.expenses] });
    const { calls } = mockApi({ ...TRIP_API, 'GET /api/trips/t-1': view, 'POST /api/trips/t-1/expenses/e-1d/disable': null });
    renderAt(<TripRoute />, route);
    const row = (await screen.findByRole('button', { name: /^Old taxi/ })).closest('li')!;
    await userEvent.click(within(row).getByRole('button', { name: 'Disable' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/trips/t-1/expenses/e-1d/disable')).toBe(true));
  });

  it('the bottom bar adds an expense on phones', async () => {
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': tripView() });
    renderAt(<TripRoute />, route);
    expect(await screen.findByRole('link', { name: '+ Add expense' })).toHaveAttribute('href', '/t/t-1/expenses/new');
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/trips');
    expect(screen.getByRole('link', { name: 'Trip settings' })).toHaveAttribute('title', 'Trip settings');
  });

  it('the loading and error screens offer the language switch', async () => {
    mockApi({ 'GET /api/trips/t-1': () => new Promise<Response>(() => {}) });
    const loading = renderAt(<TripRoute />, route);
    expect(screen.getByRole('button', { name: 'Switch to Tiếng Việt' })).toBeInTheDocument();
    loading.unmount();
    mockApi({ 'GET /api/trips/t-1': () => Response.json({ error: { code: 'BOOM', message: 'x' } }, { status: 500 }) });
    renderAt(<TripRoute />, route);
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Switch to Tiếng Việt' })).toBeInTheDocument();
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

  it('previews the amount received before confirming', async () => {
    mockApi({ 'GET /api/trips/t-1': busyView(), 'GET /api/trips/t-1/version': { version: 3 } });
    renderAt(<TripRoute />, route);
    const field = await screen.findByLabelText('Amount received');
    await userEvent.clear(field);
    await userEvent.type(field, '1.200k');
    expect(screen.getByText('1.200.000₫')).toBeInTheDocument();
  });

  it('shows disabled expenses crossed out with who did it', async () => {
    mockApi({ 'GET /api/trips/t-1': busyView(), 'GET /api/trips/t-1/version': { version: 3 } });
    renderAt(<TripRoute />, route);
    expect(await screen.findByText('Disabled by Minh')).toBeInTheDocument();
    expect(screen.getByText('Old taxi')).toHaveStyle({ textDecoration: 'line-through' });
    const row = screen.getByRole('button', { name: /^Old taxi/ }).closest('li')!;
    expect(within(row).getByRole('button', { name: 'Enable' })).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: 'Disable' })).toBeNull();
  });

  it('an empty trip invites the first expense', async () => {
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': emptyTrip() });
    renderAt(<TripRoute />, route);
    expect(await screen.findByText('Add the first expense')).toBeInTheDocument();
    expect(screen.getByText('Homestay, food, fuel: anything the group shares.')).toBeInTheDocument();
    // The empty state carries the only add link: no bottom bar yet.
    const add = screen.getAllByRole('link', { name: '+ Add expense' });
    expect(add).toHaveLength(1);
    expect(add[0]).toHaveAttribute('href', '/t/t-1/expenses/new');
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
