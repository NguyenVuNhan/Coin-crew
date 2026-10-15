import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ExpenseView, TripView } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { guestChiView, picker, viewerView, tripView, PIDS } from '../../test/fixtures';
import { Join } from '../Join';
import { WhoAreYou } from '../WhoAreYou';
import { TripRoute } from '../TripRoute';
import { linkTokens } from '../../lib/linkTokens';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Join', () => {
  it('stores the group link and goes to "Who are you?"', async () => {
    mockApi({ 'GET /api/links/gtok-1': { tripId: 't-1', tripName: 'Đà Lạt · Oct 2026', access: 'group' } });
    renderAt(<Join />, { route: '/j/gtok-1', path: '/j/:token' });
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1/who'));
    expect(linkTokens.get('t-1')).toBe('gtok-1');
  });

  it('a view-only link goes straight to the trip', async () => {
    mockApi({ 'GET /api/links/vtok-1': { tripId: 't-1', tripName: 'Đà Lạt · Oct 2026', access: 'view' } });
    renderAt(<Join />, { route: '/j/vtok-1', path: '/j/:token' });
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/));
  });

  it('a dead link says so', async () => {
    mockApi({ 'GET /api/links/old': () => Response.json({ error: { code: 'LINK_DEAD', message: 'gone' } }, { status: 410 }) });
    renderAt(<Join />, { route: '/j/old', path: '/j/:token' });
    expect(await screen.findByText('This link no longer works. Ask the organiser for a new one.')).toBeInTheDocument();
  });
});

describe('WhoAreYou', () => {
  const route = { route: '/t/t-1/who', path: '/t/:tripId/who' };

  it('pre-selects the name picked on this phone and continues with it', async () => {
    const { calls } = mockApi({ 'GET /api/trips/t-1/people/picker': picker(), 'POST /api/trips/t-1/people/pick': null });
    renderAt(<WhoAreYou />, route);
    expect(await screen.findByText('You picked this on this phone last time')).toBeInTheDocument();
    expect(screen.getByText('Active on another phone · 2 h ago')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continue as Chi' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/));
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ participantId: PIDS.C });
  });

  it('a member name sends you to Google sign-in', async () => {
    mockApi({ 'GET /api/trips/t-1/people/picker': picker() });
    renderAt(<WhoAreYou />, route);
    const minh = await screen.findByRole('link', { name: /Minh/ });
    expect(minh.getAttribute('href')).toMatch(/^\/api\/auth\/google\/start\?returnTo=/);
  });

  it('a new name gets suggestions and an "Are you …?" check', async () => {
    const { calls } = mockApi({
      'GET /api/trips/t-1/people/picker': picker({ myPick: null, people: picker().people.map((p) => ({ ...p, lastUsedHere: false })) }),
      'POST /api/trips/t-1/people/check-name': { matches: [{ id: PIDS.B, name: 'Bình', reason: 'same' }] },
      'POST /api/trips/t-1/people': () => Response.json({ participantId: 'p-new' }, { status: 201 }),
    });
    renderAt(<WhoAreYou />, route);
    await userEvent.click(await screen.findByRole('button', { name: "I'm someone new" }));
    await userEvent.type(screen.getByLabelText('Your name'), 'Binh');
    expect(await screen.findByRole('option', { name: /Bình/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Are you Bình?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Yes, I'm Bình" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'No, add me' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.path === '/api/trips/t-1/people')?.body).toEqual({ name: 'Binh', confirmNew: true }));
  });
});

describe('WhoAreYou errors', () => {
  it('shows an inline error when adding a name is refused', async () => {
    mockApi({
      'GET /api/trips/t-1/people/picker': picker({ myPick: null }),
      'POST /api/trips/t-1/people/check-name': { matches: [] },
      'POST /api/trips/t-1/people': () => Response.json({ error: { code: 'RATE_LIMITED', message: 'x' } }, { status: 429 }),
    });
    renderAt(<WhoAreYou />, { route: '/t/t-1/who', path: '/t/:tripId/who' });
    await userEvent.click(await screen.findByRole('button', { name: "I'm someone new" }));
    await userEvent.type(screen.getByLabelText('Your name'), 'Giang');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Too many items are waiting for approval. Ask a member to approve them first.')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1/who');
  });

  it('shows an inline error when picking fails', async () => {
    mockApi({
      'GET /api/trips/t-1/people/picker': picker(),
      'POST /api/trips/t-1/people/pick': () => Response.json({ error: { code: 'INTERNAL', message: 'x' } }, { status: 500 }),
    });
    renderAt(<WhoAreYou />, { route: '/t/t-1/who', path: '/t/:tripId/who' });
    await userEvent.click(await screen.findByRole('button', { name: 'Continue as Chi' }));
    expect(await screen.findByText('Something went wrong. Try again.')).toBeInTheDocument();
  });
});

describe('TripRoute', () => {
  const route = { route: '/t/t-1', path: '/t/:tripId' };

  it('guest view: what I owe, what would change, and pay', async () => {
    mockApi({ 'GET /api/trips/t-1': guestChiView(), 'GET /api/trips/t-1/version': { version: 3 } });
    renderAt(<TripRoute />, route);
    expect(await screen.findByText('Viewing as Chi')).toBeInTheDocument();
    expect(screen.getByText('You owe Minh')).toBeInTheDocument();
    expect(screen.getAllByText('1.245.000₫').length).toBeGreaterThan(0);
    expect(screen.getByText("If your expenses are approved, you'll owe 1.110.000₫")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pay with VietQR' })).toHaveAttribute('href', `/t/t-1/pay/${PIDS.M}`);
    expect(screen.getByText('Waiting')).toBeInTheDocument();
  });

  it('the add button steps back while there is something to pay', async () => {
    mockApi({ 'GET /api/trips/t-1': guestChiView(), 'GET /api/trips/t-1/version': { version: 3 } });
    const owing = renderAt(<TripRoute />, route);
    expect(await screen.findByRole('link', { name: 'Pay with VietQR' })).toHaveClass('fsl-button--primary');
    // The page's only teal button is Pay; Add is the outline one.
    expect(screen.getByRole('link', { name: '+ Add expense' })).toHaveClass('fsl-button--secondary');
    owing.unmount();

    // Nothing to pay: Add is the primary button again.
    const settled: TripView = { ...guestChiView(), suggestions: [], balances: {}, myBalance: { now: 0, beforePayments: 0, ifPendingApproved: null, waitingConfirm: 0 } };
    mockApi({ 'GET /api/trips/t-1': settled, 'GET /api/trips/t-1/version': { version: 3 } });
    renderAt(<TripRoute />, route);
    expect(await screen.findByText("You're all settled")).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Pay with VietQR' })).toBeNull();
    expect(screen.getByRole('link', { name: '+ Add expense' })).toHaveClass('fsl-button--primary');
  });

  it('a guest only gets Edit on expenses they added', async () => {
    // Chi added e-5 (pending). She also paid for e-6, which Minh added: that one is not hers to edit.
    const view = guestChiView();
    const paidForByChi: ExpenseView = { ...view.expenses[1]!, id: 'e-6', description: 'Taxi to the market', payerId: PIDS.C, status: 'pending' };
    mockApi({ 'GET /api/trips/t-1': { ...view, expenses: [...view.expenses, paidForByChi] }, 'GET /api/trips/t-1/version': { version: 3 } });
    renderAt(<TripRoute />, route);
    const list = await screen.findByRole('region', { name: 'Expenses' });
    const edits = within(list).getAllByRole('button', { name: 'Edit' });
    expect(edits).toHaveLength(1);
    expect(edits[0]!.closest('li')).toHaveTextContent('Bánh tráng nướng, chợ đêm');
    const taxi = within(list).getByRole('button', { name: /^Taxi to the market/ }).closest('li') as HTMLElement;
    expect(within(taxi).queryByRole('button', { name: 'Edit' })).toBeNull();
    // Nothing else is offered to a guest.
    expect(within(list).queryByRole('button', { name: /^(Disable|Approve|Reject)$/ })).toBeNull();
  });

  it('a guest without a name goes to "Who are you?"', async () => {
    mockApi({ 'GET /api/trips/t-1': { ...guestChiView(), me: { kind: 'guest', participantId: null, participantPending: false, isOrganiser: false }, myBalance: null } });
    renderAt(<TripRoute />, route);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1/who'));
  });

  it('view-only: no actions apart from the language switch', async () => {
    mockApi({ 'GET /api/trips/t-1': viewerView(), 'GET /api/trips/t-1/version': { version: 3 } });
    renderAt(<TripRoute />, route);
    expect(await screen.findByText('View only')).toBeInTheDocument();
    expect(screen.getByText('Homestay Bloom · 2 nights')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Switch to Tiếng Việt' })).toBeInTheDocument();
    // The only other buttons are the expense rows, which open read-only details: no Edit, no ticks, no Pay.
    const rows = within(screen.getByRole('region', { name: 'Expenses' })).getAllByRole('button');
    expect(rows).toHaveLength(4);
    const others = screen.queryAllByRole('button').filter((b) => b.getAttribute('aria-label') !== 'Switch to Tiếng Việt' && !rows.includes(b));
    expect(others).toHaveLength(0);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('a dead link on the trip page says so', async () => {
    mockApi({ 'GET /api/trips/t-1': () => Response.json({ error: { code: 'LINK_DEAD', message: 'gone' } }, { status: 410 }) });
    renderAt(<TripRoute />, route);
    expect(await screen.findByText('This link no longer works. Ask the organiser for a new one.')).toBeInTheDocument();
  });

  it('members get the member page (placeholder until Task 20)', async () => {
    mockApi({ 'GET /api/trips/t-1': tripView(), 'GET /api/trips/t-1/version': { version: 3 } });
    renderAt(<TripRoute />, route);
    await waitFor(() => expect(screen.queryByText('Viewing as Chi')).not.toBeInTheDocument());
  });
});
