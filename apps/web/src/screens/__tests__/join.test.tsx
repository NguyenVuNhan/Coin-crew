import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    expect(screen.getByText('Drops to 1.110.000₫ if your expenses are approved')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pay with VietQR' })).toHaveAttribute('href', `/t/t-1/pay/${PIDS.M}`);
    expect(screen.getByText('Waiting')).toBeInTheDocument();
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
    const buttons = screen.queryAllByRole('button').filter((b) => !/Tiếng Việt|English/.test(b.textContent ?? ''));
    expect(buttons).toHaveLength(0);
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
