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

  it('warns guests what they can do before they pick, with a way to sign in', async () => {
    mockApi({ 'GET /api/trips/t-1/people/picker': picker() });
    renderAt(<WhoAreYou />, route);
    const note = await screen.findByRole('note', { name: 'Joining as a guest' });
    expect(within(note).getByText('Expenses you add wait for a member to approve.')).toBeInTheDocument();
    expect(within(note).getByText('Your bank details wait for a member too. After that, only a member can change them.')).toBeInTheDocument();
    const signIn = within(note).getByRole('link', { name: 'Sign in with Google for full access' });
    expect(signIn.getAttribute('href')).toBe(`/api/auth/google/start?returnTo=${encodeURIComponent('/t/t-1')}`);
    // Above the list, so it is read before a name is picked.
    const list = screen.getByRole('radiogroup', { name: 'Who are you?' });
    expect(note.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('a member name sends you to Google sign-in', async () => {
    mockApi({ 'GET /api/trips/t-1/people/picker': picker() });
    renderAt(<WhoAreYou />, route);
    const minh = await screen.findByRole('link', { name: /Minh/ });
    expect(minh.getAttribute('href')).toMatch(/^\/api\/auth\/google\/start\?returnTo=/);
  });
});

describe('WhoAreYou search', () => {
  const route = { route: '/t/t-1/who', path: '/t/:tripId/who' };
  const names = ['Minh', 'An', 'Bình', 'Chi', 'Thảo', 'Thảo Vy', 'Dũng', 'Hà', 'Khoa', 'Lan', 'Mai', 'Nam', 'Oanh', 'Phúc'];
  function crowd(count: number) {
    return picker({
      myPick: null,
      people: names.slice(0, count).map((name, i) => ({
        id: `p-${i}`, name, status: 'active' as const, isMember: i === 0, lastUsedHere: false, activeElsewhere: null,
      })),
    });
  }

  it('big groups get a search that ignores accents', async () => {
    mockApi({ 'GET /api/trips/t-1/people/picker': crowd(14) });
    renderAt(<WhoAreYou />, route);
    expect(await screen.findByText('14 of 14 people')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search names' }), 'thao');
    expect(screen.getByText('2 of 14 people')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.getByRole('radio', { name: 'Thảo' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Thảo Vy' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Chi' })).toBeNull();
    // Case does not matter either, and clearing brings everyone back.
    await userEvent.clear(screen.getByRole('searchbox', { name: 'Search names' }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search names' }), 'DUNG');
    expect(screen.getByText('1 of 14 people')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByText('14 of 14 people')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search names' })).toHaveValue('');
  });

  it('a pre-selected name hidden by the search is not offered in the bottom bar', async () => {
    const { calls } = mockApi({
      'GET /api/trips/t-1/people/picker': { ...crowd(14), myPick: 'p-3' },
      'POST /api/trips/t-1/people/pick': null,
    });
    renderAt(<WhoAreYou />, route);
    expect(await screen.findByRole('button', { name: 'Continue as Chi' })).toBeEnabled();
    const search = screen.getByRole('searchbox', { name: 'Search names' });
    await userEvent.type(search, 'zed');
    expect(screen.queryByRole('button', { name: 'Continue as Chi' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    // A search that shows other people does not offer Chi either.
    await userEvent.clear(search);
    await userEvent.type(search, 'thao');
    expect(screen.queryByRole('button', { name: 'Continue as Chi' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    // Clearing the search brings Chi back, still chosen.
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByRole('radio', { name: 'Chi' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Continue as Chi' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ participantId: 'p-3' }));
  });

  it('10 people or fewer: no search', async () => {
    mockApi({ 'GET /api/trips/t-1/people/picker': crowd(10) });
    renderAt(<WhoAreYou />, route);
    expect(await screen.findByRole('radio', { name: 'An' })).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByText(/of 10 people/)).toBeNull();
  });

  it('member names say they have an account', async () => {
    mockApi({ 'GET /api/trips/t-1/people/picker': picker() });
    renderAt(<WhoAreYou />, route);
    const minh = await screen.findByRole('link', { name: /Minh/ });
    expect(within(minh).getByText('Has an account · sign in with Google')).toBeInTheDocument();
    expect(screen.queryByText(/Signed in/)).toBeNull();
    // Only members get the line.
    expect(screen.getAllByText('Has an account · sign in with Google')).toHaveLength(1);
  });
});

describe('WhoAreYou errors', () => {
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
    const list = await screen.findByRole('region', { name: 'Your expenses' });
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
