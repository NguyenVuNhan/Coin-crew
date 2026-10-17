import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PaymentView, TripView } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { mockMedia } from '../../test/media';
import { guestChiView, tripView, viewerView, PIDS } from '../../test/fixtures';
import { App } from '../../App';
import { TripRoute } from '../TripRoute';

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn()); // jsdom has no scrolling; the trip's pages move the window
  try {
    localStorage.removeItem('fsl.swipeHintSeen');
  } catch {
    // storage blocked
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const TRIP_API = { 'GET /api/trips/t-1/version': { version: 3 } };
const route = { route: '/t/t-1', path: '/t/:tripId' };

const payment = (p: Partial<PaymentView> & Pick<PaymentView, 'id' | 'fromId' | 'toId' | 'status'>): PaymentView => ({
  amountClaimed: 150000, amountConfirmed: p.status === 'confirmed' ? 150000 : null, notArrived: false, createdAt: '2026-10-12T08:00:00.000Z', ...p,
});

const myBalance = (now: number, ifPendingApproved: number | null): TripView['myBalance'] => ({ now, beforePayments: now, ifPendingApproved, waitingConfirm: 0 });

/** Chi owes Minh and An, so there is no single person to pay. */
function chiOwesTwo(): TripView {
  return {
    ...guestChiView(),
    suggestions: [
      { fromId: PIDS.C, toId: PIDS.M, amount: 700000 },
      { fromId: PIDS.C, toId: PIDS.A, amount: 545000 },
    ],
  };
}

/** Chi is owed 200.000₫ by An and has not added bank details yet. */
function chiIsOwed(): TripView {
  return {
    ...guestChiView(),
    balances: { [PIDS.M]: 0, [PIDS.A]: -200000, [PIDS.B]: 0, [PIDS.C]: 200000 },
    suggestions: [{ fromId: PIDS.A, toId: PIDS.C, amount: 200000 }],
    myBalance: myBalance(200000, null),
  };
}

const follows = (a: HTMLElement, b: HTMLElement) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe('guest page on a phone', () => {
  beforeEach(() => {
    mockMedia({ wide: false });
  });

  it('with several debts it shows the total and no Pay button', async () => {
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': chiOwesTwo() });
    renderAt(<TripRoute />, route);
    expect(await screen.findByText('You owe')).toBeInTheDocument();
    expect(screen.getAllByText('1.245.000₫').length).toBeGreaterThan(0);
    expect(screen.queryByText(/^You owe Minh$/)).toBeNull();
    expect(screen.queryByRole('link', { name: 'Pay with VietQR' })).toBeNull();
    // They pay from Your transfers instead.
    const transfers = screen.getByRole('region', { name: 'Your transfers' });
    expect(within(transfers).getByRole('button', { name: /^You → Minh/ })).toBeInTheDocument();
    expect(within(transfers).getByRole('button', { name: /^You → An/ })).toBeInTheDocument();
    // With no Pay button, Add is the teal one.
    expect(screen.getByRole('link', { name: '+ Add expense' })).toHaveClass('fsl-button--primary');
  });

  it.each([
    [-1110000, "If your expenses are approved, you'll owe 1.110.000₫"],
    [50000, "If your expenses are approved, you'll be owed 50.000₫"],
    [0, "If your expenses are approved, you'll be settled"],
  ])('says what approval would change when it would leave %i', async (after, line) => {
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': { ...guestChiView(), myBalance: myBalance(-1245000, after) } });
    renderAt(<TripRoute />, route);
    expect(await screen.findByText(line)).toBeInTheDocument();
  });

  it('says nothing about approval when nothing of theirs waits', async () => {
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': { ...guestChiView(), myBalance: myBalance(-1245000, null) } });
    renderAt(<TripRoute />, route);
    await screen.findByText('You owe Minh');
    expect(screen.queryByText(/If your expenses are approved/)).toBeNull();
  });

  it('shows what the guest is owed and one row for their bank details', async () => {
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': chiIsOwed() });
    renderAt(<TripRoute />, route);
    expect(await screen.findByText("You're owed")).toBeInTheDocument();
    expect(screen.getAllByText('200.000₫').length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Pay with VietQR' })).toBeNull();
    const rows = screen.getAllByRole('region', { name: 'Your bank details' });
    expect(rows).toHaveLength(1);
    expect(within(rows[0]!).getByText('No bank details yet')).toBeInTheDocument();
    expect(within(rows[0]!).getByRole('link', { name: 'Add' })).toHaveAttribute('href', '/t/t-1/bank');
  });

  it('has no separate "How we got your share": the expense rows show the share', async () => {
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': guestChiView() });
    renderAt(<TripRoute />, route);
    const expenses = await screen.findByRole('region', { name: 'Your expenses' });
    expect(screen.queryByText('How we got your share')).toBeNull();
    expect(screen.queryByText('Your total')).toBeNull();
    const homestay = within(expenses).getByText('Homestay Bloom · 2 nights').closest('li')!;
    expect(within(homestay).getByText('800.000₫')).toBeInTheDocument();
    expect(within(homestay).getByText('Minh paid 3.200.000₫ · split equally, 4')).toBeInTheDocument();
  });

  it('offers to add bank details even when nobody owes the guest', async () => {
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': guestChiView() });
    renderAt(<TripRoute />, route);
    const row = await screen.findByRole('region', { name: 'Your bank details' });
    expect(within(row).getByRole('link', { name: 'Add' })).toHaveAttribute('href', '/t/t-1/bank');
  });

  it('shows waiting details with Change, and approved ones locked', async () => {
    const account = { bankName: 'VPBank', accountNumberMasked: '0123 •••• 6789', holderName: 'TRAN THI CHI' };
    const withBank = (bank: 'pending' | 'approved'): TripView => {
      const v = chiIsOwed();
      return { ...v, people: v.people.map((p) => (p.id === PIDS.C ? { ...p, bank, bankAccount: account } : p)) };
    };
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': withBank('pending') });
    const waiting = renderAt(<TripRoute />, route);
    let row = await screen.findByRole('region', { name: 'Your bank details' });
    expect(within(row).getByText('VPBank · 0123 •••• 6789')).toBeInTheDocument();
    expect(within(row).getByText('Waiting for a member to approve')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'Change' })).toHaveAttribute('href', '/t/t-1/bank');
    waiting.unmount();

    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': withBank('approved') });
    renderAt(<TripRoute />, route);
    row = await screen.findByRole('region', { name: 'Your bank details' });
    expect(within(row).getByText('VPBank · 0123 •••• 6789')).toBeInTheDocument();
    expect(within(row).getByText('Only a member can change them')).toBeInTheDocument();
    expect(within(row).queryByRole('link')).toBeNull();
  });

  it('tells a guest whose name waits when they can add bank details', async () => {
    const v = guestChiView();
    mockApi({
      ...TRIP_API,
      'GET /api/trips/t-1': { ...v, me: { ...v.me, participantPending: true }, people: v.people.map((p) => (p.id === PIDS.C ? { ...p, status: 'pending' as const } : p)) },
    });
    renderAt(<TripRoute />, route);
    const row = await screen.findByRole('region', { name: 'Your bank details' });
    expect(within(row).getByText('You can add them once a member approves your name.')).toBeInTheDocument();
    expect(within(row).queryByRole('link')).toBeNull();
  });

  it('lists the guest\'s debts and what is owed to them in Your transfers, and nothing is left of "Who pays you"', async () => {
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': chiIsOwed() });
    renderAt(<TripRoute />, route);
    const transfers = await screen.findByRole('region', { name: 'Your transfers' });
    expect(within(transfers).getByRole('button', { name: /^An → You/ })).toBeInTheDocument();
    expect(screen.queryByText('Who pays you')).toBeNull();
  });

  it('is laid out top to bottom: who, balance, transfers, tabs, expenses (or payments), footer', async () => {
    const view = { ...guestChiView(), payments: [payment({ id: 'pay-3', fromId: PIDS.B, toId: PIDS.C, status: 'confirmed' })] };
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': view });
    renderAt(<TripRoute />, route);
    const viewing = await screen.findByText('Viewing as Chi');
    const balance = screen.getByText('You owe Minh');
    const transfers = screen.getByRole('region', { name: 'Your transfers' });
    const tabs = screen.getByRole('tablist', { name: 'Trip tabs' });
    const expenses = screen.getByRole('region', { name: 'Your expenses' });
    const footer = screen.getByRole('link', { name: 'Sign in with Google to become a member' });
    const order = [viewing, balance, transfers, tabs, expenses, footer];
    order.slice(1).forEach((el, i) => expect(follows(order[i]!, el)).toBe(true));

    await userEvent.click(screen.getByRole('tab', { name: 'Payments' }));
    const payments = screen.getByRole('region', { name: 'Your payments' });
    expect(follows(tabs, payments)).toBe(true);
    expect(follows(payments, footer)).toBe(true);
  });

  it('the language switch sits in the footer, not the header', async () => {
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': guestChiView() });
    renderAt(<TripRoute />, route);
    const signIn = await screen.findByRole('link', { name: 'Sign in with Google to become a member' });
    const footer = signIn.closest('footer') as HTMLElement;
    expect(within(footer).getByRole('button', { name: 'Switch to Tiếng Việt' })).toBeInTheDocument();
    expect(within(screen.getByRole('banner')).queryByRole('button', { name: /^Switch to/ })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Switch to Tiếng Việt' })).toHaveLength(1);
  });

  it('the + Add expense bar is fixed to the bottom while there are expenses', async () => {
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': guestChiView() });
    renderAt(<TripRoute />, route);
    const add = await screen.findByRole('link', { name: '+ Add expense' });
    expect(add.closest('.fsl-bottom-bar')).not.toBeNull();
    expect(add).toHaveAttribute('href', '/t/t-1/expenses/new');
  });

  it('a trip with no expenses has no bar: the empty state carries the one + Add expense', async () => {
    const empty: TripView = {
      ...guestChiView(), expenses: [], suggestions: [], balances: {}, payments: [], trip: { ...guestChiView().trip, total: 0 },
      myBalance: myBalance(0, null),
    };
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': empty });
    renderAt(<TripRoute />, route);
    const expenses = await screen.findByRole('region', { name: 'Your expenses' });
    expect(within(expenses).getByText('Add the first expense')).toBeInTheDocument();
    const adds = screen.getAllByRole('link', { name: '+ Add expense' });
    expect(adds).toHaveLength(1);
    expect(expenses).toContainElement(adds[0]!);
    expect(adds[0]!.closest('.fsl-bottom-bar')).toBeNull();
    expect(adds[0]).toHaveClass('fsl-button--primary');
    // Nothing to show of a balance yet.
    expect(screen.queryByText("You're all settled")).toBeNull();
  });

  it('the swipe hint goes on the first row of the first list only', async () => {
    mockMedia({ wide: false, coarse: true });
    // A confirmed payment into Chi's account can be reported, so its row swipes; Chi's pending expense swipes too.
    const view = { ...guestChiView(), payments: [payment({ id: 'pay-3', fromId: PIDS.B, toId: PIDS.C, status: 'confirmed' })] };
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': view });
    const withPayments = renderAt(<TripRoute />, route);
    const expenses = await screen.findByRole('region', { name: 'Your expenses' });
    expect(within(expenses).getByText('Swipe left or tap a row for options')).toBeInTheDocument();
    expect(screen.getAllByText('Swipe left or tap a row for options')).toHaveLength(1);
    // Switching to payments tab does not show it again
    await userEvent.click(screen.getByRole('tab', { name: 'Payments' }));
    const payments = await screen.findByRole('region', { name: 'Your payments' });
    expect(within(payments).queryByText('Swipe left or tap a row for options')).toBeNull();
    withPayments.unmount();

    // Without payments the expenses are still the first list.
    localStorage.removeItem('fsl.swipeHintSeen');
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': guestChiView() });
    renderAt(<TripRoute />, route);
    const expensesOnly = await screen.findByRole('region', { name: 'Your expenses' });
    expect(within(expensesOnly).getByText('Swipe left or tap a row for options')).toBeInTheDocument();
    expect(screen.getAllByText('Swipe left or tap a row for options')).toHaveLength(1);
  });

  it('opening an expense shows it as a page of its own, with Edit only on their own pending one', async () => {
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': guestChiView() });
    renderAt(<App />, { route: '/t/t-1' });
    await userEvent.click(await screen.findByRole('button', { name: /^Bánh tráng nướng, chợ đêm/ }));
    expect(await screen.findByRole('heading', { name: 'Bánh tráng nướng, chợ đêm' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Expense' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    await userEvent.click(await screen.findByRole('button', { name: /^Homestay Bloom/ }));
    expect(await screen.findByRole('heading', { name: 'Homestay Bloom · 2 nights' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });
});

describe('guest page on an archived trip', () => {
  /** The API refuses every write on an archived trip, so the page offers none of them. */
  const archived = (view: TripView): TripView => ({ ...view, trip: { ...view.trip, archived: true } });

  it('says so and offers nothing the API would refuse, on a phone', async () => {
    mockMedia({ wide: false });
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': archived(guestChiView()) });
    renderAt(<TripRoute />, route);
    expect(await screen.findByText('This trip is archived. You can still look at it.')).toBeInTheDocument();
    expect(screen.getByText('You owe')).toBeInTheDocument(); // still looking at it, with no one to pay from the card
    expect(screen.getAllByText('1.245.000₫').length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Pay with VietQR' })).toBeNull();
    expect(screen.queryByRole('link', { name: '+ Add expense' })).toBeNull();
    expect(document.querySelector('.fsl-bottom-bar')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Sign in with Google to become a member' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Mark / })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    // The language switch is still in the footer.
    expect(screen.getByRole('button', { name: 'Switch to Tiếng Việt' }).closest('footer')).not.toBeNull();
  });

  it('asks for no bank details and has no add button on a wide screen or in an empty trip', async () => {
    mockMedia({ wide: true });
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': archived(chiIsOwed()) });
    const owed = renderAt(<TripRoute />, route);
    const expenses = await screen.findByRole('region', { name: 'Your expenses' });
    expect(screen.getByText('This trip is archived. You can still look at it.')).toBeInTheDocument();
    expect(within(expenses).queryByRole('link', { name: '+ Add expense' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Your bank details' })).toBeNull();
    owed.unmount();

    const empty = archived({ ...guestChiView(), expenses: [], suggestions: [], balances: {}, payments: [], myBalance: myBalance(0, null) });
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': empty });
    renderAt(<TripRoute />, route);
    expect(await screen.findByText('No expenses yet.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '+ Add expense' })).toBeNull();
  });

  it('coming back from Google sign-in does not ask to become a member', async () => {
    mockMedia({ wide: false });
    const { calls } = mockApi({ ...TRIP_API, 'GET /api/trips/t-1': archived(guestChiView()), 'POST /api/trips/t-1/membership': null });
    renderAt(<TripRoute />, { route: '/t/t-1?becomeMember=1', path: '/t/:tripId' });
    await screen.findByText('This trip is archived. You can still look at it.');
    expect(screen.queryByText('You asked to become a member. A member will approve it.')).toBeNull();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });
});

describe('guest page on a wide screen', () => {
  beforeEach(() => {
    mockMedia({ wide: true });
  });

  const withPayment = (): TripView => ({ ...guestChiView(), payments: [payment({ id: 'pay-3', fromId: PIDS.B, toId: PIDS.C, status: 'confirmed' })] });

  it('has payments and expenses on the left, the balance and transfers on the right', async () => {
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': withPayment() });
    renderAt(<TripRoute />, route);
    const balance = await screen.findByText('You owe Minh');
    const side = balance.closest('.fsl-trip-layout__side') as HTMLElement;
    const main = screen.getByRole('region', { name: 'Your expenses' }).closest('.fsl-trip-layout__main') as HTMLElement;
    expect(side).not.toBeNull();
    expect(within(side).getByRole('region', { name: 'Your transfers' })).toBeInTheDocument();
    expect(within(side).getByRole('link', { name: 'Pay with VietQR' })).toBeInTheDocument();
    expect(within(main).getByRole('region', { name: 'Your payments' })).toBeInTheDocument();
    expect(within(main).queryByRole('region', { name: 'Your transfers' })).toBeNull();
    // The "Viewing as" bar and the footer span both columns.
    expect(screen.getByText('Viewing as Chi').closest('.fsl-trip-layout')).toBeNull();
    expect(screen.getByRole('link', { name: 'Sign in with Google to become a member' }).closest('.fsl-trip-layout')).toBeNull();
  });

  it('+ Add expense moves into the Expenses heading and still steps back while there is something to pay', async () => {
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': guestChiView() });
    renderAt(<TripRoute />, route);
    const expenses = await screen.findByRole('region', { name: 'Your expenses' });
    const add = within(expenses).getByRole('link', { name: '+ Add expense' });
    expect(add).toHaveClass('fsl-button--secondary');
    expect(screen.getAllByRole('link', { name: '+ Add expense' })).toHaveLength(1);
    expect(add.closest('.fsl-bottom-bar')).toBeNull();
  });

  it('an expense opens in the right panel, and × brings the balance back', async () => {
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': guestChiView() });
    renderAt(<App />, { route: '/t/t-1' });
    await userEvent.click(await screen.findByRole('button', { name: /^Bánh tráng nướng, chợ đêm/ }));
    const heading = await screen.findByRole('heading', { name: 'Bánh tráng nướng, chợ đêm' });
    expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1/expenses/e-5');
    // Still the trip page: the list is beside the panel and the panel replaced the balance.
    expect(screen.getByRole('heading', { level: 1, name: 'Đà Lạt · Oct 2026' })).toBeInTheDocument();
    expect(screen.queryByText('You owe Minh')).toBeNull();
    await waitFor(() => expect(heading).toHaveFocus());
    const panel = screen.getByRole('region', { name: 'Expense' });
    expect(within(panel).getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Pay with VietQR' })).toBeNull();

    await userEvent.click(within(panel).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/));
    expect(await screen.findByText('You owe Minh')).toBeInTheDocument();
  });

  it('with the panel open, + Add expense is the teal button again (Pay is not on screen)', async () => {
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': guestChiView() });
    renderAt(<App />, { route: '/t/t-1/expenses/e-1' });
    await screen.findByRole('heading', { name: 'Homestay Bloom · 2 nights' });
    expect(screen.getByRole('link', { name: '+ Add expense' })).toHaveClass('fsl-button--primary');
  });

  it('a payment opens in the panel too', async () => {
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': withPayment() });
    renderAt(<App />, { route: '/t/t-1' });
    const payments = await screen.findByRole('region', { name: 'Your payments' });
    await userEvent.click(within(payments).getByRole('button', { name: /^Bình → You/ }));
    expect(await screen.findByRole('heading', { name: 'Bình → You' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Payment' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1/payments/pay-3');
  });

  it('a missing expense says so and offers the way back', async () => {
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': guestChiView() });
    renderAt(<App />, { route: '/t/t-1/expenses/nope' });
    expect(await screen.findByText("This isn't in the trip any more.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Back to trip' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/));
  });
});

describe('view-only page', () => {
  const withMoney = (): TripView => ({
    ...viewerView(),
    payments: [payment({ id: 'pay-1', fromId: PIDS.C, toId: PIDS.M, status: 'confirmed' })],
  });

  it('on a phone shows everyone\'s balances and who pays whom first, then tabs for expenses and payments, read-only', async () => {
    mockMedia({ wide: false });
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': withMoney() });
    renderAt(<TripRoute />, route);
    const pill = await screen.findByText('View only');
    const balances = screen.getByRole('region', { name: 'Balances' });
    expect(within(balances).getByText('Minh')).toBeInTheDocument();
    expect(within(balances).getByText('2.195.000₫')).toBeInTheDocument();
    expect(within(balances).getByText('-1.245.000₫')).toBeInTheDocument();
    const transfers = screen.getByRole('region', { name: 'Who pays whom' });
    expect(within(transfers).getAllByRole('listitem')).toHaveLength(3); // every row, whoever it involves
    expect(within(transfers).getByText('Chi → Minh')).toBeInTheDocument();
    // Read-only: no chip, no ticks, no rows to open, no QR.
    expect(within(transfers).queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByRole('img', { name: /VietQR/ })).toBeNull();
    const tablist = screen.getByRole('tablist');
    const expenses = screen.getByRole('region', { name: 'Expenses' });
    const order = [pill, balances, transfers, tablist, expenses];
    order.slice(1).forEach((el, i) => expect(follows(order[i]!, el)).toBe(true));

    // Switching to Payments tab shows Payments
    await userEvent.click(within(tablist).getByRole('tab', { name: 'Payments' }));
    expect(screen.getByRole('region', { name: 'Payments' })).toBeInTheDocument();

    // No row offers an action: the payment's Disable and the expenses' Edit are for members.
    expect(screen.queryByRole('button', { name: /^(Edit|Disable|Enable|Approve|Reject|Confirm|Didn't arrive)$/ })).toBeNull();
    expect(screen.queryByRole('link', { name: '+ Add expense' })).toBeNull();
  });

  it('on a phone an expense opens as a read-only page', async () => {
    mockMedia({ wide: false });
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': withMoney() });
    renderAt(<App />, { route: '/t/t-1' });
    await userEvent.click(await screen.findByRole('button', { name: /^Lẩu gà lá é/ }));
    expect(await screen.findByRole('heading', { name: 'Lẩu gà lá é' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(Edit|Disable|Enable|Approve|Reject)$/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  it('on a wide screen the right side holds the balances and who pays whom, and an expense replaces them', async () => {
    mockMedia({ wide: true });
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': withMoney() });
    renderAt(<App />, { route: '/t/t-1' });
    const balances = await screen.findByRole('region', { name: 'Balances' });
    const side = balances.closest('.fsl-trip-layout__side') as HTMLElement;
    expect(side).not.toBeNull();
    expect(within(side).getByRole('region', { name: 'Who pays whom' })).toBeInTheDocument();
    const main = screen.getByRole('region', { name: 'Expenses' }).closest('.fsl-trip-layout__main') as HTMLElement;
    expect(within(main).getByRole('region', { name: 'Payments' })).toBeInTheDocument();

    await userEvent.click(within(main).getByRole('button', { name: /^Lẩu gà lá é/ }));
    const heading = await screen.findByRole('heading', { name: 'Lẩu gà lá é' });
    expect(screen.queryByRole('region', { name: 'Balances' })).toBeNull();
    await waitFor(() => expect(heading).toHaveFocus());
    const panel = screen.getByRole('region', { name: 'Expense' });
    expect(within(panel).queryByRole('button', { name: /^(Edit|Disable|Enable|Approve|Reject)$/ })).toBeNull();

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/));
    expect(await screen.findByRole('region', { name: 'Balances' })).toBeInTheDocument();
  });

  it('a settled trip says so', async () => {
    mockMedia({ wide: false });
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': { ...viewerView(), suggestions: [] } });
    renderAt(<TripRoute />, route);
    const transfers = await screen.findByRole('region', { name: 'Who pays whom' });
    expect(within(transfers).getByText('Everyone is settled up.')).toBeInTheDocument();
  });

  it('a trip with no expenses shows an empty state without an add button', async () => {
    mockMedia({ wide: false });
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': { ...viewerView(), expenses: [], suggestions: [], balances: {} } });
    renderAt(<TripRoute />, route);
    const expenses = await screen.findByRole('region', { name: 'Expenses' });
    expect(within(expenses).getByText('No expenses yet.')).toBeInTheDocument();
    expect(within(expenses).queryByText('Add the first expense')).toBeNull();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});
