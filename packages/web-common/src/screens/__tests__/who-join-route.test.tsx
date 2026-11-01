import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TripView } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { mockMedia } from '../../test/media';
import { guestChiView, picker, tripView, PIDS } from '../../test/fixtures';
import { App } from '../../App';

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
  mockMedia({ wide: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** What the trip page saw before: the group link on this phone, signed in, but no name here yet. */
const guestNoName = (): TripView => ({ ...guestChiView(), me: { kind: 'guest', participantId: null, participantPending: false, isOrganiser: false } });
const signedInPicker = (name: string) =>
  picker({ myPick: null, account: { name, needsGender: false }, myLeftName: null, people: picker().people.map((p) => ({ ...p, lastUsedHere: false })) });
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe('after joining from the trip page', () => {
  it('a signed-in user who joins lands in the trip, not back on who-are-you', async () => {
    let joined = false;
    const member = tripView({ me: { kind: 'member', participantId: PIDS.A, participantPending: false, isOrganiser: false, isAdmin: false } });
    mockApi({
      'GET /api/trips/t-1': () => Response.json(joined ? member : guestNoName()),
      'GET /api/trips/t-1/version': { version: 3 },
      'GET /api/trips/t-1/people/picker': signedInPicker('Dũng'),
      'POST /api/trips/t-1/people/check-name': { matches: [] },
      'POST /api/trips/t-1/join': () => {
        joined = true;
        return Response.json({ participantId: PIDS.A, rejoined: false }, { status: 201 });
      },
    });
    renderAt(<App />, { route: '/t/t-1' });
    await userEvent.click(await screen.findByRole('button', { name: 'Not on the list? Join as Dũng' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/));
    await settle();
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/);
    expect(screen.queryByRole('button', { name: 'Not on the list? Join as Dũng' })).toBeNull();
  });

  it('"Yes, I\'m Bình" lands in the trip as Bình, not back on who-are-you', async () => {
    let picked = false;
    const asBinh: TripView = { ...guestChiView(), me: { kind: 'guest', participantId: PIDS.B, participantPending: false, isOrganiser: false } };
    mockApi({
      'GET /api/trips/t-1': () => Response.json(picked ? asBinh : guestNoName()),
      'GET /api/trips/t-1/version': { version: 3 },
      'GET /api/trips/t-1/people/picker': signedInPicker('Binh'),
      'POST /api/trips/t-1/people/check-name': { matches: [{ id: PIDS.B, name: 'Bình', reason: 'same' }] },
      'POST /api/trips/t-1/people/pick': () => {
        picked = true;
        return new Response(null, { status: 204 });
      },
      'POST /api/trips/t-1/membership': { requestId: 'r-1' },
    });
    renderAt(<App />, { route: '/t/t-1' });
    await userEvent.click(await screen.findByRole('button', { name: 'Not on the list? Join as Binh' }));
    await userEvent.click(await screen.findByRole('button', { name: "Yes, I'm Bình" }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/));
    await settle();
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/);
  });
});
