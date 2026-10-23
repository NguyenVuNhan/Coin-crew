import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { formatVnd, type TripView } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { tripView, PIDS } from '../../test/fixtures';
import { People } from '../People';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const at = { route: '/t/t-1/people', path: '/t/:tripId/people' };
const rowOf = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name},`) }).closest('li')!;
const leftRegion = () => screen.findByRole('region', { name: 'Left the group' });
const rowInLeft = async (name: string) => within(await leftRegion()).getByText(name).closest('li')!;

/** Minh (organiser) looks at a group that Chi (owes money) and Bình (settled up) have left. */
function leftView(): TripView {
  const base = tripView();
  return {
    ...base,
    people: base.people.map((p) => {
      if (p.id === PIDS.C) return { ...p, status: 'left', isMember: false };
      if (p.id === PIDS.B) return { ...p, status: 'left' };
      return p;
    }),
    balances: { ...base.balances, [PIDS.B]: 0 },
  };
}

/** An, a signed-in admin who did not create the trip, with Bình signed in too (optionally an admin). */
function anView(binhIsAdmin = false): TripView {
  const base = tripView();
  return {
    ...base,
    me: { kind: 'member', participantId: PIDS.A, participantPending: false, isOrganiser: false, isAdmin: true },
    people: base.people.map((p) => {
      if (p.id === PIDS.M) return { ...p, isOrganiser: true, isAdmin: true };
      if (p.id === PIDS.A) return { ...p, isMember: true, isAdmin: true };
      if (p.id === PIDS.B) return { ...p, isMember: true, isAdmin: binhIsAdmin };
      return p;
    }),
  };
}

describe('People who left', () => {
  it('people who left sit in their own section with what they owe', async () => {
    mockApi({ 'GET /api/trips/t-1': leftView() });
    renderAt(<People />, at);
    const section = await leftRegion();
    expect(within(section).getByText(`Owes ${formatVnd(1245000)}`)).toBeInTheDocument();
    expect(within(section).getByText('Settled up')).toBeInTheDocument();
    expect(within(section).getAllByText('Left')).toHaveLength(2);
    expect(within(screen.getAllByRole('list')[0]!).queryByText('Chi')).toBeNull();
  });

  it('someone who left and is owed money says so', async () => {
    const view = leftView();
    mockApi({ 'GET /api/trips/t-1': { ...view, balances: { ...view.balances, [PIDS.B]: 50000 } } });
    renderAt(<People />, at);
    expect(within(await leftRegion()).getByText(`Is owed ${formatVnd(50000)}`)).toBeInTheDocument();
  });

  it('shows no Left section when nobody left', async () => {
    mockApi({ 'GET /api/trips/t-1': tripView() });
    renderAt(<People />, at);
    await screen.findByRole('button', { name: /^Minh,/ });
    expect(screen.queryByText('Left the group')).toBeNull();
  });

  it('an admin brings someone back', async () => {
    const { calls } = mockApi({ 'GET /api/trips/t-1': leftView(), 'POST /api/trips/t-1/people/p-chi/restore': null });
    renderAt(<People />, at);
    await userEvent.click(within(await rowInLeft('Chi')).getByRole('button', { name: 'Bring back' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/trips/t-1/people/p-chi/restore')).toBe(true));
  });

  it('a non-admin member sees no Bring back', async () => {
    const view = leftView();
    mockApi({
      'GET /api/trips/t-1': {
        ...view,
        me: { kind: 'member', participantId: PIDS.A, participantPending: false, isOrganiser: false, isAdmin: false },
        people: view.people.map((p) => (p.id === PIDS.A ? { ...p, isMember: true } : p)),
      },
    });
    renderAt(<People />, at);
    await leftRegion();
    expect(screen.queryByRole('button', { name: 'Bring back' })).toBeNull();
  });
});

describe('Removing people', () => {
  it('Remove is offered on a signed-in member and asks first', async () => {
    const { calls } = mockApi({ 'GET /api/trips/t-1': anView(), 'DELETE /api/trips/t-1/people/p-binh': null });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderAt(<People />, at);
    await screen.findByRole('button', { name: /^Bình,/ });
    await userEvent.click(within(rowOf('Bình')).getByRole('button', { name: 'Remove' }));
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    await userEvent.click(within(rowOf('Bình')).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.path === '/api/trips/t-1/people/p-binh')).toBe(true));
    expect(confirm).toHaveBeenCalledWith('Remove Bình from the group? Their past expenses and payments stay.');
  });

  it('an admin gets no Remove on another admin; the organiser does', async () => {
    mockApi({ 'GET /api/trips/t-1': anView(true) });
    const { unmount } = renderAt(<People />, at);
    await screen.findByRole('button', { name: /^Bình,/ });
    expect(within(rowOf('Bình')).queryByRole('button', { name: 'Remove' })).toBeNull();
    unmount();

    const view = anView(true);
    mockApi({ 'GET /api/trips/t-1': { ...view, me: tripView().me } });
    renderAt(<People />, at);
    await screen.findByRole('button', { name: /^Bình,/ });
    expect(within(rowOf('Bình')).getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('a refused removal says so in plain words', async () => {
    mockApi({
      'GET /api/trips/t-1': anView(),
      'DELETE /api/trips/t-1/people/p-chi': () => Response.json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }, { status: 403 }),
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAt(<People />, at);
    await screen.findByRole('button', { name: /^Chi,/ });
    await userEvent.click(within(rowOf('Chi')).getByRole('button', { name: 'Remove' }));
    expect(await within(rowOf('Chi')).findByText("You can't remove this person.")).toBeInTheDocument();
  });
});
