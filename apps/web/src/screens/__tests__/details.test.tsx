import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useNavigate, useNavigationType } from 'react-router';
import type { PaymentView, TripView } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { mockMedia } from '../../test/media';
import { guestChiView, tripView, PIDS } from '../../test/fixtures';
import { App } from '../../App';

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn()); // jsdom has no scrolling; the details page moves the window when it opens and closes
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const TRIP_API = { 'GET /api/trips/t-1/version': { version: 3 } };
const ACTION_BUTTONS = /^(edit|disable|enable|approve|reject|confirm|didn't arrive)$/i;

/** The member's view with Chi's pending expense (e-5) in the list. */
const memberViewWithChiPending = (): TripView => tripView({ expenses: guestChiView().expenses });

const payment = (p: Partial<PaymentView> & Pick<PaymentView, 'id' | 'fromId' | 'toId' | 'status'>): PaymentView => ({
  amountClaimed: 150000, amountConfirmed: p.status === 'confirmed' ? 145000 : null, notArrived: false, createdAt: '2026-10-12T08:00:00.000Z', ...p,
});

function open(view: TripView, route: string) {
  mockMedia({ wide: false });
  const api = mockApi({ ...TRIP_API, 'GET /api/trips/t-1': view });
  renderAt(<App />, { route });
  return api;
}

describe('transaction details', () => {
  it('an expense opens full screen with every share and my row marked', async () => {
    open(tripView(), '/t/t-1/expenses/e-1');
    expect(await screen.findByRole('heading', { name: 'Homestay Bloom · 2 nights' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toHaveAttribute('title', 'Back');
    expect(screen.getAllByText('3.200.000₫').length).toBeGreaterThan(0);
    expect(screen.getByText('Paid by').parentElement).toHaveTextContent('You');
    expect(screen.getByText('Added by').parentElement).toHaveTextContent('You');
    const shares = screen.getByRole('list', { name: 'Split' });
    expect(within(shares).getAllByRole('listitem')).toHaveLength(4);
    expect(within(shares).getByText('Minh (you)')).toBeInTheDocument();
    expect(within(shares).getByText('An')).toBeInTheDocument();
    expect(within(shares).getAllByText('800.000₫')).toHaveLength(4);
  });

  it('lists the split in the order of the trip\'s people, whatever order the API sends', async () => {
    const view = tripView();
    const homestay = view.expenses.find((e) => e.id === 'e-1')!;
    homestay.shares = [PIDS.B, PIDS.M, PIDS.C, PIDS.A].map((participantId) => ({ participantId, amount: 800000, inputValue: 1 }));
    open(view, '/t/t-1/expenses/e-1');
    const shares = await screen.findByRole('list', { name: 'Split' });
    const names = within(shares).getAllByRole('listitem').map((li) => li.textContent?.replace(/[\d.]+₫$/, ''));
    expect(names).toEqual(['Minh (you)', 'An', 'Bình', 'Chi']);
  });

  it('only the person who added it can edit', async () => {
    // A member looking at Chi's pending expense: approve or reject it, but not edit it.
    open(memberViewWithChiPending(), '/t/t-1/expenses/e-5');
    expect(await screen.findByRole('heading', { name: 'Bánh tráng nướng, chợ đêm' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
  });

  it('lets the person who added it edit and disable it', async () => {
    open(tripView(), '/t/t-1/expenses/e-1');
    await screen.findByRole('heading', { name: 'Homestay Bloom · 2 nights' });
    expect(screen.getByRole('button', { name: 'Disable' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1/expenses/e-1/edit'));
  });

  it('a guest can edit their own waiting expense but nothing else', async () => {
    open(guestChiView(), '/t/t-1/expenses/e-5');
    expect(await screen.findByRole('heading', { name: 'Bánh tráng nướng, chợ đêm' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Disable' })).toBeNull();
  });

  it("a guest gets no actions on someone else's expense", async () => {
    open(guestChiView(), '/t/t-1/expenses/e-1');
    expect(await screen.findByRole('heading', { name: 'Homestay Bloom · 2 nights' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: ACTION_BUTTONS })).toBeNull();
  });

  it('archived trips show no actions', async () => {
    const base = memberViewWithChiPending();
    open({ ...base, trip: { ...base.trip, archived: true } }, '/t/t-1/expenses/e-5');
    expect(await screen.findByRole('heading', { name: 'Bánh tráng nướng, chợ đêm' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: ACTION_BUTTONS })).toBeNull();
  });

  it('approves a waiting expense', async () => {
    const { calls } = mockApi({
      ...TRIP_API, 'GET /api/trips/t-1': memberViewWithChiPending(), 'POST /api/trips/t-1/expenses/e-5/approve': null,
    });
    mockMedia({ wide: false });
    renderAt(<App />, { route: '/t/t-1/expenses/e-5' });
    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/trips/t-1/expenses/e-5/approve')).toBe(true));
  });

  it('says which new person to approve first when approving is turned down', async () => {
    const base = memberViewWithChiPending();
    const view = { ...base, people: base.people.map((x) => (x.id === PIDS.C ? { ...x, status: 'pending' as const } : x)) };
    mockApi({
      ...TRIP_API, 'GET /api/trips/t-1': view,
      'POST /api/trips/t-1/expenses/e-5/approve': () => Response.json({ error: { code: 'PERSON_PENDING', message: 'Pending' } }, { status: 409 }),
    });
    mockMedia({ wide: false });
    renderAt(<App />, { route: '/t/t-1/expenses/e-5' });
    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Approve Chi first');
  });

  it('rejecting asks for a reason first', async () => {
    const { calls } = mockApi({
      ...TRIP_API, 'GET /api/trips/t-1': memberViewWithChiPending(), 'POST /api/trips/t-1/expenses/e-5/reject': null,
    });
    mockMedia({ wide: false });
    renderAt(<App />, { route: '/t/t-1/expenses/e-5' });
    await userEvent.click(await screen.findByRole('button', { name: 'Reject' }));
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Why are you rejecting it?'), 'Not ours');
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'POST' && c.path === '/api/trips/t-1/expenses/e-5/reject')?.body).toEqual({ reason: 'Not ours' }),
    );
  });

  it('shows why an expense was rejected', async () => {
    const base = tripView();
    const rejected = { ...base.expenses[0]!, id: 'e-9', status: 'rejected' as const, rejectReason: 'Not ours' };
    open({ ...base, expenses: [rejected, ...base.expenses] }, '/t/t-1/expenses/e-9');
    expect(await screen.findByText('Rejected: Not ours')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Disable' })).toBeNull();
  });

  it('a missing expense says so and offers the way back', async () => {
    open(tripView(), '/t/t-1/expenses/nope');
    expect(await screen.findByText("This isn't in the trip any more.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Back to trip' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/));
  });

  it('a missing payment says so too', async () => {
    open(tripView(), '/t/t-1/payments/nope');
    expect(await screen.findByText("This isn't in the trip any more.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to trip' })).toBeInTheDocument();
  });

  it('on a wide screen the details sit next to the list', async () => {
    mockMedia({ wide: true });
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': tripView() });
    renderAt(<App />, { route: '/t/t-1/expenses/e-1' });
    const heading = await screen.findByRole('heading', { name: 'Homestay Bloom · 2 nights' });
    // Still the trip page, with the list beside the panel and the opened row marked.
    expect(screen.getByRole('heading', { level: 1, name: 'Đà Lạt · Oct 2026' })).toBeInTheDocument();
    const list = screen.getByRole('region', { name: 'Your expenses' });
    expect(within(list).getByRole('button', { name: /^Homestay Bloom/ })).toHaveAttribute('aria-current', 'true');
    expect(within(list).getByRole('button', { name: /^Lẩu gà lá é/ })).not.toHaveAttribute('aria-current');
    // The add link waits for sign-in to be known (no flicker between it and the app nav).
    expect(await within(list).findByRole('link', { name: '+ Add expense' })).toBeInTheDocument();
    expect(screen.queryByText("You're owed")).toBeNull(); // the panel shows the details instead of the balance
    await waitFor(() => expect(heading).toHaveFocus());
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/));
    expect(await screen.findByText("You're owed")).toBeInTheDocument();
  });

  it('Esc closes the wide panel and gives focus back to the row that opened it', async () => {
    mockMedia({ wide: true });
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': tripView() });
    renderAt(<App />, { route: '/t/t-1' });
    await userEvent.click(await screen.findByRole('button', { name: /^Lẩu gà lá é/ }));
    const heading = await screen.findByRole('heading', { name: 'Lẩu gà lá é' });
    await waitFor(() => expect(heading).toHaveFocus());
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/));
    await waitFor(() => expect(screen.getByRole('button', { name: /^Lẩu gà lá é/ })).toHaveFocus());
  });

  it('Esc while typing a reject reason keeps the wide panel and the text', async () => {
    mockMedia({ wide: true });
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': memberViewWithChiPending() });
    renderAt(<App />, { route: '/t/t-1/expenses/e-5' });
    await userEvent.click(await screen.findByRole('button', { name: 'Reject' }));
    const reason = screen.getByLabelText('Why are you rejecting it?');
    await userEvent.type(reason, 'Not ours');
    await userEvent.keyboard('{Escape}');
    expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1/expenses/e-5');
    expect(screen.getByLabelText('Why are you rejecting it?')).toHaveValue('Not ours');
    // Outside the field Esc still closes the panel.
    await userEvent.tab();
    expect(reason).not.toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/));
  });

  it('switching rows on a wide screen keeps closing one step away from the list', async () => {
    mockMedia({ wide: true });
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': tripView() });
    renderAt(<><NavigationKind /><App /></>, { route: '/t/t-1', path: '*' });
    await userEvent.click(await screen.findByRole('button', { name: /^Lẩu gà lá é/ }));
    await screen.findByRole('heading', { name: 'Lẩu gà lá é' });
    await userEvent.click(screen.getByRole('button', { name: /^Motorbike rental/ }));
    expect(await screen.findByRole('heading', { name: 'Motorbike rental + fuel' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1/expenses/e-3');
    expect(screen.getByTestId('navigation-kind')).toHaveTextContent('REPLACE'); // the switch left no entry for Lẩu gà behind
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    // One step back in history lands on the list, not on the first expense.
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/));
    expect(screen.getByTestId('navigation-kind')).toHaveTextContent('POP');
  });

  it('after a shared link and a switch to another row, one × still closes the panel', async () => {
    mockMedia({ wide: true });
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': tripView() });
    renderAt(<><NavigationKind /><App /></>, { route: '/t/t-1/expenses/e-1', path: '*' });
    await screen.findByRole('heading', { name: 'Homestay Bloom · 2 nights' });
    await userEvent.click(screen.getByRole('button', { name: /^Lẩu gà lá é/ }));
    expect(await screen.findByRole('heading', { name: 'Lẩu gà lá é' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/));
    expect(screen.getByTestId('navigation-kind')).toHaveTextContent('REPLACE');
    expect(await screen.findByText("You're owed")).toBeInTheDocument();
  });

  it('a payment row opens its details in the wide panel', async () => {
    mockMedia({ wide: true });
    const view = tripView({ payments: [payment({ id: 'pay-1', fromId: PIDS.C, toId: PIDS.M, status: 'confirmed' })] });
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': view });
    renderAt(<App />, { route: '/t/t-1' });
    const payments = await screen.findByRole('region', { name: 'Your payments' });
    await userEvent.click(within(payments).getByRole('button', { name: /^Chi → You/ }));
    expect(await screen.findByRole('heading', { name: 'Chi → You' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1/payments/pay-1');
  });

  it('a guest on a wide screen gets the details in the panel, like a member', async () => {
    mockMedia({ wide: true });
    const view = { ...guestChiView(), payments: [payment({ id: 'pay-3', fromId: PIDS.B, toId: PIDS.C, status: 'confirmed' })] };
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': view });
    renderAt(<><NavigationKind /><App /></>, { route: '/t/t-1', path: '*' });
    const payments = await screen.findByRole('region', { name: 'Your payments' });
    await userEvent.click(within(payments).getByRole('button', { name: /^Bình → You/ }));
    expect(await screen.findByRole('heading', { name: 'Bình → You' })).toBeInTheDocument();
    // Still the trip page, with the details in the panel beside the lists.
    expect(screen.getByRole('heading', { level: 1, name: 'Đà Lạt · Oct 2026' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Payment' })).toBeInTheDocument();
    // Opened from the guest's list, so × goes back in history.
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/));
    expect(screen.getByTestId('navigation-kind')).toHaveTextContent('POP');
  });

  it('a payment shows who paid whom and its status', async () => {
    const view = tripView({ payments: [payment({ id: 'pay-1', fromId: PIDS.C, toId: PIDS.M, status: 'confirmed' })] });
    open(view, '/t/t-1/payments/pay-1');
    expect(await screen.findByRole('heading', { name: 'Chi → You' })).toBeInTheDocument();
    expect(screen.getByText('Paid ✓')).toBeInTheDocument();
    expect(screen.getByText('Amount sent').parentElement).toHaveTextContent('150.000₫');
    expect(screen.getByText('Amount received').parentElement).toHaveTextContent('145.000₫');
    expect(screen.getByText('Recorded').parentElement).toHaveTextContent('12 Oct 2026');
    expect(screen.getByRole('button', { name: 'Disable' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
  });

  it('the receiving member confirms or reports a payment that is waiting', async () => {
    const view = tripView({ payments: [payment({ id: 'pay-1', fromId: PIDS.C, toId: PIDS.M, status: 'says_paid' })] });
    mockMedia({ wide: false });
    const { calls } = mockApi({
      ...TRIP_API, 'GET /api/trips/t-1': view, 'POST /api/trips/t-1/payments/pay-1/confirm': null,
    });
    renderAt(<App />, { route: '/t/t-1/payments/pay-1' });
    expect(await screen.findByRole('heading', { name: 'Chi → You' })).toBeInTheDocument();
    expect(screen.getByText('Waiting')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Didn't arrive" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Disable' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/trips/t-1/payments/pay-1/confirm')).toBe(true));
  });

  it('a member who is not the receiver gets no confirm button', async () => {
    const view = tripView({ payments: [payment({ id: 'pay-2', fromId: PIDS.A, toId: PIDS.C, status: 'says_paid' })] });
    open(view, '/t/t-1/payments/pay-2');
    expect(await screen.findByRole('heading', { name: 'An → Chi' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
  });

  it('keeps the add and edit expense pages where they were', async () => {
    open(tripView(), '/t/t-1/expenses/new');
    expect(await screen.findByRole('heading', { name: 'Add expense' })).toBeInTheDocument();
  });

  it('keeps the edit page where it was', async () => {
    open(tripView(), '/t/t-1/expenses/e-1/edit');
    expect(await screen.findByRole('heading', { name: 'Edit expense' })).toBeInTheDocument();
  });
});

/** Stands in for tapping a row of the trip page: an in-app push to the details marked as coming from the list, as the rows do. */
function OpenButton({ to }: { to: string }) {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate(to, { state: { fromList: true } })}>Open {to}</button>;
}

/** PUSH, REPLACE or POP: how the router got to the current page. */
function NavigationKind() {
  return <div data-testid="navigation-kind">{useNavigationType()}</div>;
}

function openFromList(to: string) {
  mockMedia({ wide: false });
  mockApi({ ...TRIP_API, 'GET /api/trips/t-1': tripView() });
  renderAt(
    <>
      <OpenButton to={to} />
      <NavigationKind />
      <App />
    </>,
    { route: '/t/t-1', path: '*' },
  );
}

describe('leaving the details', () => {
  it('back from details opened in the app goes back in history instead of adding an entry', async () => {
    openFromList('/t/t-1/expenses/e-1');
    await userEvent.click(await screen.findByRole('button', { name: 'Open /t/t-1/expenses/e-1' }));
    expect(await screen.findByRole('heading', { name: 'Homestay Bloom · 2 nights' })).toBeInTheDocument();
    expect(screen.getByTestId('navigation-kind')).toHaveTextContent('PUSH');
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/));
    expect(screen.getByTestId('navigation-kind')).toHaveTextContent('POP');
  });

  it('a row tapped on a phone opens the details page, and Back goes back in history', async () => {
    mockMedia({ wide: false });
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': tripView() });
    renderAt(<><NavigationKind /><App /></>, { route: '/t/t-1', path: '*' });
    await userEvent.click(await screen.findByRole('button', { name: /^Lẩu gà lá é/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Expense' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/));
    expect(screen.getByTestId('navigation-kind')).toHaveTextContent('POP');
  });

  it("'Back to trip' on something that is gone goes back in history too", async () => {
    openFromList('/t/t-1/expenses/nope');
    await userEvent.click(await screen.findByRole('button', { name: 'Open /t/t-1/expenses/nope' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Back to trip' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/));
    expect(screen.getByTestId('navigation-kind')).toHaveTextContent('POP');
  });

  it('a shared link has nothing to go back to, so back replaces it with the trip', async () => {
    open(tripView(), '/t/t-1/expenses/e-1');
    await userEvent.click(await screen.findByRole('button', { name: 'Back' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/));
    expect(await screen.findByRole('heading', { name: 'Đà Lạt · Oct 2026' })).toBeInTheDocument();
  });

  it('a shared link replaces the entry rather than pushing one', async () => {
    mockMedia({ wide: false });
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': tripView() });
    renderAt(<><NavigationKind /><App /></>, { route: '/t/t-1/payments/nope', path: '*' });
    await userEvent.click(await screen.findByRole('button', { name: 'Back to trip' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/));
    expect(screen.getByTestId('navigation-kind')).toHaveTextContent('REPLACE');
  });

  it('returns to the list at the scroll position it was left at', async () => {
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    vi.stubGlobal('scrollY', 420);
    openFromList('/t/t-1/expenses/e-1');
    const opener = await screen.findByRole('button', { name: 'Open /t/t-1/expenses/e-1' });
    await screen.findByText('Homestay Bloom · 2 nights');
    await userEvent.click(opener);
    await screen.findByRole('heading', { name: 'Homestay Bloom · 2 nights', level: 2 });
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0); // the details page starts at its top
    vi.stubGlobal('scrollY', 0); // the shorter page has clamped the window to the top
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(scrollTo).toHaveBeenLastCalledWith(0, 420));
  });
});
