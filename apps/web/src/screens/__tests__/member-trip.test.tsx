import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TripView } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { mockMedia } from '../../test/media';
import { guestChiView, tripView, PIDS } from '../../test/fixtures';
import { App } from '../../App';
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
    const next = () => userEvent.click(within(card).getByRole('button', { name: 'Next' }));
    // 1. a guest's expense
    expect(within(card).getByText('Bánh tráng nướng, chợ đêm')).toBeInTheDocument();
    expect(within(card).getByText('Chi added · 180.000₫ · split equally, 4')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Reject' })).toBeInTheDocument();
    await userEvent.click(within(card).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/trips/t-1/expenses/e-5/approve')).toBe(true));
    // 2. a new name, with the merge choice
    await next();
    expect(within(card).getByText('Chi Nguyễn wants to join')).toBeInTheDocument();
    expect(within(card).getByText('Looks like Chi')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Same as Chi' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Reject' })).toBeInTheDocument();
    // 3. bank details, with the account number masked
    await next();
    expect(within(card).getByText('0123 •••• 6789')).toBeInTheDocument();
    expect(within(card).queryByText('0123456789')).toBeNull();
    expect(within(card).getByText('MBBank')).toBeInTheDocument();
    // 4. a payment to me
    await next();
    expect(within(card).getByText('Chi says they paid you 1.245.000₫')).toBeInTheDocument();
    expect(within(card).getByText('Did it arrive?')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: "Didn't arrive" })).toBeInTheDocument();
    // 5. a payment that did not arrive
    await next();
    expect(within(card).getByRole('button', { name: 'Disable' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Keep' })).toBeInTheDocument();
    // 6. someone asking to become a member
    await next();
    expect(within(card).getByText('An wants to become a member')).toBeInTheDocument();
    expect(within(card).getByText('An Trần · an@example.com')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Reject' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Next' })).toBeDisabled();
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
    await userEvent.click(within(card).getByRole('button', { name: 'Approve' }));
    expect(await within(card).findByText('Approve Chi Nguyễn first')).toBeInTheDocument();
  });

  it('previews the amount received before confirming', async () => {
    const { calls } = mockApi({
      'GET /api/trips/t-1': busyView(), 'GET /api/trips/t-1/version': { version: 3 },
      'POST /api/trips/t-1/payments/pay-1/confirm': null,
    });
    renderAt(<TripRoute />, route);
    const card = await screen.findByRole('region', { name: 'Needs approval' });
    for (let i = 0; i < 3; i++) await userEvent.click(within(card).getByRole('button', { name: 'Next' }));
    await userEvent.click(within(card).getByRole('button', { name: 'Got a different amount?' }));
    const field = within(card).getByLabelText('Amount received');
    await userEvent.clear(field);
    await userEvent.type(field, '1.200k');
    expect(within(card).getByText('1.200.000₫')).toBeInTheDocument();
    await userEvent.click(within(card).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(calls.find((c) => c.path === '/api/trips/t-1/payments/pay-1/confirm')?.body).toEqual({ amount: 1200000 }));
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

describe('approvals queue', () => {
  beforeEach(() => {
    vi.stubGlobal('scrollTo', vi.fn()); // jsdom has no scrolling; the approvals page moves the window when it opens and closes
  });

  const queueOf = () => screen.findByRole('region', { name: 'Needs approval' });
  const stepNext = async (queue: HTMLElement, times: number) => {
    for (let i = 0; i < times; i++) await userEvent.click(within(queue).getByRole('button', { name: 'Next' }));
  };

  it('shows one approval at a time with its position', async () => {
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': busyView() });
    renderAt(<TripRoute />, route);
    const queue = await queueOf();
    expect(within(queue).getByText('1 of 6 waiting')).toBeInTheDocument();
    expect(within(queue).getByText('Bánh tráng nướng, chợ đêm')).toBeInTheDocument();
    expect(within(queue).queryByText('Chi Nguyễn wants to join')).toBeNull();
    expect(within(queue).queryByRole('heading')).toBeNull();
    expect(within(queue).getByRole('button', { name: 'Previous' })).toBeDisabled();

    await stepNext(queue, 1);
    expect(within(queue).getByText('2 of 6 waiting')).toBeInTheDocument();
    expect(within(queue).getByText('Chi Nguyễn wants to join')).toBeInTheDocument();
    expect(within(queue).queryByText('Bánh tráng nướng, chợ đêm')).toBeNull();

    await userEvent.click(within(queue).getByRole('button', { name: 'Previous' }));
    expect(within(queue).getByText('1 of 6 waiting')).toBeInTheDocument();
  });

  it('approving moves on to the next one', async () => {
    let approved = false;
    mockApi({
      ...TRIP_API,
      'GET /api/trips/t-1': () => {
        const v = busyView();
        return Response.json(approved ? { ...v, approvals: v.approvals.slice(1) } : v);
      },
      'POST /api/trips/t-1/expenses/e-5/approve': () => {
        approved = true;
        return new Response(null, { status: 204 });
      },
    });
    renderAt(<TripRoute />, route);
    const queue = await queueOf();
    await userEvent.click(within(queue).getByRole('button', { name: 'Approve' }));
    expect(await within(queue).findByText('1 of 5 waiting')).toBeInTheDocument();
    expect(within(queue).getByText('Chi Nguyễn wants to join')).toBeInTheDocument();
  });

  it('when the last one is handled the one before it shows', async () => {
    let handled = false;
    mockApi({
      ...TRIP_API,
      'GET /api/trips/t-1': () => {
        const v = busyView();
        return Response.json(handled ? { ...v, approvals: v.approvals.slice(0, 5) } : v);
      },
      'POST /api/trips/t-1/membership/m-1/approve': () => {
        handled = true;
        return new Response(null, { status: 204 });
      },
    });
    renderAt(<TripRoute />, route);
    const queue = await queueOf();
    await stepNext(queue, 5);
    expect(within(queue).getByText('6 of 6 waiting')).toBeInTheDocument();
    await userEvent.click(within(queue).getByRole('button', { name: 'Approve' }));
    expect(await within(queue).findByText('5 of 5 waiting')).toBeInTheDocument();
    expect(within(queue).getByRole('button', { name: 'Keep' })).toBeInTheDocument();
  });

  it('the card goes when nothing is left to approve', async () => {
    let done = false;
    mockApi({
      ...TRIP_API,
      'GET /api/trips/t-1': () => {
        const v = busyView();
        return Response.json({ ...v, approvals: done ? [] : [v.approvals[5]!] });
      },
      'POST /api/trips/t-1/membership/m-1/approve': () => {
        done = true;
        return new Response(null, { status: 204 });
      },
    });
    renderAt(<TripRoute />, route);
    const queue = await queueOf();
    // With one item there are no arrows and no "See all".
    expect(within(queue).getByText('1 of 1 waiting')).toBeInTheDocument();
    expect(within(queue).queryByRole('button', { name: 'Next' })).toBeNull();
    expect(within(queue).queryByRole('link', { name: /^See all/ })).toBeNull();
    await userEvent.click(within(queue).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Needs approval' })).toBeNull());
  });

  it('never offers Edit', async () => {
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': busyView() });
    renderAt(<TripRoute />, route);
    const queue = await queueOf();
    for (let i = 0; i < 6; i++) {
      expect(within(queue).getByText(`${i + 1} of 6 waiting`)).toBeInTheDocument();
      expect(within(queue).queryByRole('button', { name: 'Edit' })).toBeNull();
      expect(within(queue).queryByRole('link', { name: 'Edit' })).toBeNull();
      if (i < 5) await stepNext(queue, 1);
    }
  });

  it('asks about a different amount only when you want to', async () => {
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': busyView() });
    renderAt(<TripRoute />, route);
    const queue = await queueOf();
    await stepNext(queue, 3);
    expect(within(queue).getByText('Chi says they paid you 1.245.000₫')).toBeInTheDocument();
    expect(within(queue).queryByLabelText('Amount received')).toBeNull();
    await userEvent.click(within(queue).getByRole('button', { name: 'Got a different amount?' }));
    expect(within(queue).getByLabelText('Amount received')).toHaveValue('1.245.000');
  });

  it('rejecting an expense asks why first', async () => {
    const { calls } = mockApi({ ...TRIP_API, 'GET /api/trips/t-1': busyView(), 'POST /api/trips/t-1/expenses/e-5/reject': null });
    renderAt(<TripRoute />, route);
    const queue = await queueOf();
    await userEvent.click(within(queue).getByRole('button', { name: 'Reject' }));
    const send = within(queue).getAllByRole('button', { name: 'Reject' }).find((b) => b.classList.contains('fsl-button--danger'))!;
    expect(send).toBeDisabled();
    await userEvent.type(within(queue).getByLabelText('Why are you rejecting it?'), 'Not ours');
    await userEvent.click(send);
    await waitFor(() => expect(calls.find((c) => c.path === '/api/trips/t-1/expenses/e-5/reject')?.body).toEqual({ reason: 'Not ours' }));
  });

  describe('a new person', () => {
    const personCard = async () => {
      const queue = await queueOf();
      await stepNext(queue, 1);
      return queue;
    };

    it('Approve and Same as send what they used to', async () => {
      const { calls } = mockApi({
        ...TRIP_API,
        'GET /api/trips/t-1': busyView(),
        'POST /api/trips/t-1/people/p-new/approve': null,
      });
      renderAt(<TripRoute />, route);
      const queue = await personCard();
      await userEvent.click(within(queue).getByRole('button', { name: 'Approve' }));
      await waitFor(() => expect(calls.find((c) => c.path === '/api/trips/t-1/people/p-new/approve')?.body).toEqual({}));
      await userEvent.click(within(queue).getByRole('button', { name: 'Same as Chi' }));
      await waitFor(() => expect(calls.filter((c) => c.path === '/api/trips/t-1/people/p-new/approve').pop()?.body).toEqual({ sameAs: PIDS.C }));
    });

    it('Reject removes them', async () => {
      const { calls } = mockApi({ ...TRIP_API, 'GET /api/trips/t-1': busyView(), 'DELETE /api/trips/t-1/people/p-new': null });
      renderAt(<TripRoute />, route);
      const queue = await personCard();
      await userEvent.click(within(queue).getByRole('button', { name: 'Reject' }));
      await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.path === '/api/trips/t-1/people/p-new')).toBe(true));
      expect(calls.find((c) => c.method === 'DELETE')?.body).toBeUndefined();
    });

    it('someone already in an expense cannot be rejected: it points to merging', async () => {
      mockApi({
        ...TRIP_API,
        'GET /api/trips/t-1': busyView(),
        'DELETE /api/trips/t-1/people/p-new': () => Response.json({ error: { code: 'VALIDATION', message: 'Use merge instead' } }, { status: 409 }),
      });
      renderAt(<TripRoute />, route);
      const queue = await personCard();
      await userEvent.click(within(queue).getByRole('button', { name: 'Reject' }));
      expect(await within(queue).findByText('Use merge instead')).toBeInTheDocument();
    });

    it('lists every look-alike', async () => {
      const view = busyView();
      view.approvals[1] = { kind: 'name', participantId: 'p-new', matches: [{ id: PIDS.C, name: 'Chi', reason: 'part' }, { id: PIDS.B, name: 'Bình', reason: 'part' }] };
      mockApi({ ...TRIP_API, 'GET /api/trips/t-1': view });
      renderAt(<TripRoute />, route);
      const queue = await personCard();
      expect(within(queue).getByText('Looks like Chi, Bình')).toBeInTheDocument();
      expect(within(queue).getByRole('button', { name: 'Same as Chi' })).toBeInTheDocument();
    });

    it('with no look-alike there is just Approve and Reject', async () => {
      const view = busyView();
      view.approvals[1] = { kind: 'name', participantId: 'p-new', matches: [] };
      mockApi({ ...TRIP_API, 'GET /api/trips/t-1': view });
      renderAt(<TripRoute />, route);
      const queue = await personCard();
      expect(within(queue).queryByText(/^Looks like/)).toBeNull();
      expect(within(queue).queryByRole('button', { name: /^Same as/ })).toBeNull();
      expect(within(queue).getByRole('button', { name: 'Approve' })).toBeInTheDocument();
      expect(within(queue).getByRole('button', { name: 'Reject' })).toBeInTheDocument();
    });
  });

  describe('keyboard focus', () => {
    /** Chi's expense is the first approval; the trip drops it once `release()` lets the approve request finish. */
    function approveFirstGate() {
      let handled = false;
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      mockApi({
        ...TRIP_API,
        'GET /api/trips/t-1': () => {
          const v = busyView();
          return Response.json(handled ? { ...v, approvals: v.approvals.slice(1) } : v);
        },
        'POST /api/trips/t-1/expenses/e-5/approve': async () => {
          await gate;
          handled = true;
          return new Response(null, { status: 204 });
        },
      });
      return release;
    }

    it('after Approve in the queue the next card takes focus', async () => {
      const release = approveFirstGate();
      renderAt(<TripRoute />, route);
      const queue = await queueOf();
      await userEvent.click(within(queue).getByRole('button', { name: 'Approve' }));
      release();
      expect(await within(queue).findByText('1 of 5 waiting')).toBeInTheDocument();
      expect(queue.querySelector('.fsl-approval-queue__item')).toHaveFocus();
    });

    it('also when the browser has already dropped focus from the disabled button', async () => {
      const release = approveFirstGate();
      renderAt(<TripRoute />, route);
      const queue = await queueOf();
      await userEvent.click(within(queue).getByRole('button', { name: 'Approve' }));
      // jsdom lets a disabled button keep focus and ignores blur() on it; a real browser drops the focus to <body>.
      const approve = document.activeElement as HTMLButtonElement;
      approve.disabled = false;
      approve.blur();
      approve.disabled = true;
      expect(document.body).toHaveFocus();
      release();
      expect(await within(queue).findByText('1 of 5 waiting')).toBeInTheDocument();
      expect(queue.querySelector('.fsl-approval-queue__item')).toHaveFocus();
    });

    it('stepping with Next leaves focus on the arrow', async () => {
      mockApi({ ...TRIP_API, 'GET /api/trips/t-1': busyView() });
      renderAt(<TripRoute />, route);
      const queue = await queueOf();
      const next = within(queue).getByRole('button', { name: 'Next' });
      await userEvent.click(next);
      expect(next).toHaveFocus();
    });

    it('focus that moved somewhere else stays there when the card is handled', async () => {
      const release = approveFirstGate();
      renderAt(<TripRoute />, route);
      const queue = await queueOf();
      await userEvent.click(within(queue).getByRole('button', { name: 'Approve' }));
      const elsewhere = screen.getByRole('link', { name: 'Trip settings' });
      elsewhere.focus();
      release();
      expect(await within(queue).findByText('1 of 5 waiting')).toBeInTheDocument();
      expect(elsewhere).toHaveFocus();
    });

    it('a card that arrives later does not steal focus after the last one was handled', async () => {
      mockMedia({ coarse: false });
      let phase: 'one' | 'none' | 'new' = 'one';
      mockApi({
        ...TRIP_API,
        'GET /api/trips/t-1': () => {
          const v = busyView();
          const approvals = phase === 'one' ? [v.approvals[5]!] : phase === 'none' ? [] : [v.approvals[0]!];
          return Response.json({ ...v, approvals });
        },
        'POST /api/trips/t-1/membership/m-1/approve': () => {
          phase = 'none';
          return new Response(null, { status: 204 });
        },
        'POST /api/trips/t-1/expenses/e-4/disable': () => {
          phase = 'new';
          return new Response(null, { status: 204 });
        },
      });
      renderAt(<TripRoute />, route);
      const queue = await queueOf();
      await userEvent.click(within(queue).getByRole('button', { name: 'Approve' }));
      await waitFor(() => expect(screen.queryByRole('region', { name: 'Needs approval' })).toBeNull());

      // Later, somewhere else on the page, the trip refreshes and a new approval shows up.
      const row = screen.getByRole('button', { name: /^Cà phê Túi Mơ To/ }).closest('li')!;
      const disable = within(row).getByRole('button', { name: 'Disable' });
      await userEvent.click(disable);
      const arrived = await screen.findByRole('region', { name: 'Needs approval' });
      expect(within(arrived).getByText('Bánh tráng nướng, chợ đêm')).toBeInTheDocument();
      expect(arrived.contains(document.activeElement)).toBe(false);
      expect(disable).toHaveFocus();
    });

    it('on the list page the item that takes its place gets focus', async () => {
      mockMedia({ wide: false });
      const release = approveFirstGate();
      renderAt(<App />, { route: '/t/t-1/approvals' });
      const first = (await screen.findAllByRole('listitem'))[0]!;
      await userEvent.click(within(first).getByRole('button', { name: 'Approve' }));
      release();
      await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(5));
      const now = screen.getAllByRole('listitem')[0]!;
      expect(within(now).getByText('Chi Nguyễn wants to join')).toBeInTheDocument();
      expect(now).toHaveFocus();
    });
  });

  it('tapping an expense approval opens its details', async () => {
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': busyView() });
    renderAt(<TripRoute />, route);
    const queue = await queueOf();
    await userEvent.click(within(queue).getByRole('button', { name: /^Bánh tráng nướng, chợ đêm/ }));
    expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1/expenses/e-5');
  });

  it('tapping a payment approval opens the payment', async () => {
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': busyView() });
    renderAt(<TripRoute />, route);
    const queue = await queueOf();
    await stepNext(queue, 3);
    await userEvent.click(within(queue).getByRole('button', { name: /^Chi says they paid you/ }));
    expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1/payments/pay-1');
  });

  it('slides the next card in unless motion is reduced', async () => {
    mockMedia({ reducedMotion: false });
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': busyView() });
    const first = renderAt(<TripRoute />, route);
    let queue = await queueOf();
    expect(queue.querySelector('.fsl-approval-queue__item')).not.toHaveClass('fsl-approval-queue__item--next');
    await stepNext(queue, 1);
    expect(queue.querySelector('.fsl-approval-queue__item')).toHaveClass('fsl-approval-queue__item--next');
    first.unmount();

    mockMedia({ reducedMotion: true });
    renderAt(<TripRoute />, route);
    queue = await queueOf();
    await stepNext(queue, 1);
    expect(queue.querySelector('.fsl-approval-queue__item')).not.toHaveClass('fsl-approval-queue__item--next');
  });

  describe('See all', () => {
    it('lists every approval on a page of its own on phones', async () => {
      mockMedia({ wide: false });
      mockApi({ ...TRIP_API, 'GET /api/trips/t-1': busyView() });
      renderAt(<App />, { route: '/t/t-1' });
      await userEvent.click(await screen.findByRole('link', { name: 'See all 6' }));
      expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1/approvals');
      expect(await screen.findByRole('heading', { name: 'Waiting for approval' })).toBeInTheDocument();
      const items = screen.getAllByRole('listitem');
      expect(items).toHaveLength(6);
      expect(within(items[0]!).getByRole('button', { name: 'Approve' })).toBeInTheDocument();
      expect(within(items[3]!).getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();

      // Back returns to the trip page, where the queue is.
      await userEvent.click(screen.getByRole('button', { name: 'Back' }));
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/);
      expect(await queueOf()).toBeInTheDocument();
    });

    it('opens an expense from the list and comes back to the list', async () => {
      mockMedia({ wide: false });
      mockApi({ ...TRIP_API, 'GET /api/trips/t-1': busyView() });
      renderAt(<App />, { route: '/t/t-1' });
      await userEvent.click(await screen.findByRole('link', { name: 'See all 6' }));
      await userEvent.click(await screen.findByRole('button', { name: /^Bánh tráng nướng, chợ đêm/ }));
      expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1/expenses/e-5');
      await userEvent.click(await screen.findByRole('button', { name: 'Back' }));
      expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1/approvals');
    });

    it('opens in the right panel on wide screens, and × and Esc close it', async () => {
      mockMedia({ wide: true });
      mockApi({ ...TRIP_API, 'GET /api/trips/t-1': busyView() });
      renderAt(<App />, { route: '/t/t-1' });
      await userEvent.click(await screen.findByRole('link', { name: 'See all 6' }));
      const panel = await screen.findByRole('region', { name: 'Waiting for approval' });
      expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1/approvals');
      expect(within(panel).getAllByRole('listitem')).toHaveLength(6);
      expect(screen.getByRole('region', { name: 'Needs approval' })).toBeInTheDocument(); // the queue stays on the left

      await userEvent.click(within(panel).getByRole('button', { name: 'Close' }));
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/);
      expect(screen.queryByRole('region', { name: 'Waiting for approval' })).toBeNull();

      await userEvent.click(screen.getByRole('link', { name: 'See all 6' }));
      expect(await screen.findByRole('region', { name: 'Waiting for approval' })).toBeInTheDocument();
      await userEvent.keyboard('{Escape}');
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/);
      expect(screen.queryByRole('region', { name: 'Waiting for approval' })).toBeNull();
    });

    it('switching from the panel list to an expense replaces the entry, so × is one step from the trip', async () => {
      mockMedia({ wide: true });
      mockApi({ ...TRIP_API, 'GET /api/trips/t-1': busyView() });
      renderAt(<App />, { route: '/t/t-1' });
      await userEvent.click(await screen.findByRole('link', { name: 'See all 6' }));
      const panel = await screen.findByRole('region', { name: 'Waiting for approval' });
      await userEvent.click(within(panel).getByRole('button', { name: /^Bánh tráng nướng, chợ đêm/ }));
      expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1/expenses/e-5');
      await userEvent.click(within(await screen.findByRole('region', { name: 'Expense' })).getByRole('button', { name: 'Close' }));
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/);
    });

    it('a shared link to the list with nothing waiting goes to the trip', async () => {
      mockMedia({ wide: false });
      mockApi({ ...TRIP_API, 'GET /api/trips/t-1': tripView() });
      renderAt(<App />, { route: '/t/t-1/approvals' });
      await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/));
    });

    it('a guest has no approvals page', async () => {
      mockMedia({ wide: false });
      mockApi({ ...TRIP_API, 'GET /api/trips/t-1': guestChiView() });
      renderAt(<App />, { route: '/t/t-1/approvals' });
      await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/));
    });
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
