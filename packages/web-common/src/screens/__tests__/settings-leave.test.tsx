import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TripView } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { tripView, PIDS } from '../../test/fixtures';
import { Settings } from '../Settings';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const at = { route: '/t/t-1/settings', path: '/t/:tripId/settings' };
const hint = 'The group leaves your list. Your past expenses stay, and you can rejoin from the group link.';

/** An, a signed-in admin who did not create the trip. */
function anView(): TripView {
  const base = tripView();
  return {
    ...base,
    me: { kind: 'member', participantId: PIDS.A, participantPending: false, isOrganiser: false, isAdmin: true },
    people: base.people.map((p) => (p.id === PIDS.A ? { ...p, isMember: true, isAdmin: true } : p)),
  };
}

describe('Leaving a group', () => {
  it('a member who is not the organiser leaves after confirming, and lands on My Trips', async () => {
    const { calls } = mockApi({ 'GET /api/trips/t-1': anView(), 'POST /api/trips/t-1/leave': null });
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderAt(<Settings />, at);
    expect(await screen.findByText(hint)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Leave group' }));
    expect(calls.some((c) => c.path === '/api/trips/t-1/leave')).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Leave group' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/));
    expect(window.confirm).toHaveBeenCalledWith('Leave Đà Lạt · Oct 2026?');
  });

  it('the organiser has Archive and no Leave', async () => {
    mockApi({ 'GET /api/trips/t-1': tripView() });
    renderAt(<Settings />, at);
    expect(await screen.findByRole('button', { name: 'Archive group' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Leave group' })).toBeNull();
  });

  it('an archived group offers no Leave', async () => {
    const view = anView();
    mockApi({ 'GET /api/trips/t-1': { ...view, trip: { ...view.trip, archived: true } } });
    renderAt(<Settings />, at);
    await screen.findByText('This trip is archived. You can still look at it.');
    expect(screen.queryByRole('button', { name: 'Leave group' })).toBeNull();
  });

  it('a failed leave shows the error with Try again', async () => {
    mockApi({
      'GET /api/trips/t-1': anView(),
      'POST /api/trips/t-1/leave': () => Response.json({ error: { code: 'INTERNAL', message: 'Boom' } }, { status: 500 }),
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAt(<Settings />, at);
    await userEvent.click(await screen.findByRole('button', { name: 'Leave group' }));
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1/settings');
  });
});
