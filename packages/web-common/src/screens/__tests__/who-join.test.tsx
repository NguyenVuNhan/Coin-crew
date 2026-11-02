import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PickerView } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { picker, PIDS } from '../../test/fixtures';
import { WhoAreYou } from '../WhoAreYou';

afterEach(() => {
  vi.unstubAllGlobals();
});

const route = { route: '/t/t-1/who', path: '/t/:tripId/who' };

/** A signed-in user (Dũng by default) who is not in the group yet and has picked no name on this phone. */
function signedIn(overrides: Partial<PickerView> = {}): PickerView {
  return picker({
    myPick: null,
    account: { name: 'Dũng', needsGender: false },
    myLeftName: null,
    people: picker().people.map((p) => ({ ...p, lastUsedHere: false })),
    ...overrides,
  });
}

describe('WhoAreYou: joining without approval', () => {
  it('signed-out guests see no Join or Rejoin, and keep the guest note', async () => {
    mockApi({ 'GET /api/trips/t-1/people/picker': picker() });
    renderAt(<WhoAreYou />, route);
    await screen.findByRole('radiogroup');
    expect(screen.queryByText(/Join as/)).toBeNull();
    expect(screen.queryByText(/Rejoin as/)).toBeNull();
    expect(screen.getByText('Joining as a guest')).toBeInTheDocument();
  });

  it('a signed-in user not on the list joins with their account name', async () => {
    const { calls } = mockApi({
      'GET /api/trips/t-1/people/picker': signedIn(),
      'POST /api/trips/t-1/people/check-name': { matches: [] },
      'POST /api/trips/t-1/join': { participantId: 'p-dung', rejoined: false },
    });
    renderAt(<WhoAreYou />, route);
    await userEvent.click(await screen.findByRole('button', { name: 'Not on the list? Join as Dũng' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/));
    expect(calls.find((c) => c.path === '/api/trips/t-1/people/check-name')?.body).toEqual({ name: 'Dũng' });
    expect(calls.find((c) => c.path === '/api/trips/t-1/join')?.body).toEqual({});
    expect(screen.queryByText('Joining as a guest')).toBeNull();
  });

  it('a look-alike name asks first; "Yes" picks that name and asks to become a member', async () => {
    const { calls } = mockApi({
      'GET /api/trips/t-1/people/picker': signedIn({ account: { name: 'Binh', needsGender: false } }),
      'POST /api/trips/t-1/people/check-name': { matches: [{ id: PIDS.B, name: 'Bình', reason: 'same' }] },
      'POST /api/trips/t-1/people/pick': null,
    });
    renderAt(<WhoAreYou />, route);
    await userEvent.click(await screen.findByRole('button', { name: 'Not on the list? Join as Binh' }));
    expect(await screen.findByText('"Binh" looks like "Bình", who\'s already in this trip.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: "Yes, I'm Bình" }));
    await waitFor(() => expect(calls.find((c) => c.path === '/api/trips/t-1/people/pick')?.body).toEqual({ participantId: PIDS.B }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/));
    expect(calls.some((c) => c.path === '/api/trips/t-1/join')).toBe(false);
  });

  it('"No, add me" joins as someone new', async () => {
    const { calls } = mockApi({
      'GET /api/trips/t-1/people/picker': signedIn({ account: { name: 'Binh', needsGender: false } }),
      'POST /api/trips/t-1/people/check-name': { matches: [{ id: PIDS.B, name: 'Bình', reason: 'same' }] },
      'POST /api/trips/t-1/join': { participantId: 'p-binh-2', rejoined: false },
    });
    renderAt(<WhoAreYou />, route);
    await userEvent.click(await screen.findByRole('button', { name: 'Not on the list? Join as Binh' }));
    await userEvent.click(await screen.findByRole('button', { name: 'No, add me' }));
    await waitFor(() => expect(calls.find((c) => c.path === '/api/trips/t-1/join')?.body).toEqual({ confirmNew: true }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/));
  });

  it('asks for a gender first when the group needs one', async () => {
    const { calls } = mockApi({
      'GET /api/trips/t-1/people/picker': signedIn({ account: { name: 'Dũng', needsGender: true } }),
      'POST /api/trips/t-1/people/check-name': { matches: [] },
      'POST /api/trips/t-1/join': { participantId: 'p-dung', rejoined: false },
    });
    renderAt(<WhoAreYou />, route);
    await userEvent.click(await screen.findByRole('button', { name: 'Not on the list? Join as Dũng' }));
    expect(calls.some((c) => c.path === '/api/trips/t-1/join')).toBe(false);
    expect(screen.getByRole('button', { name: 'Join as Dũng' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Gender for Dũng' }));
    await userEvent.click(screen.getByRole('button', { name: 'Join as Dũng' }));
    await waitFor(() => expect(calls.find((c) => c.path === '/api/trips/t-1/join')?.body).toEqual({ gender: 'M' }));
  });

  it('offers Rejoin first, preselected', async () => {
    const { calls } = mockApi({
      'GET /api/trips/t-1/people/picker': signedIn({
        account: { name: 'An', needsGender: false },
        myLeftName: { id: PIDS.A, name: 'An' },
        people: picker().people.filter((p) => p.id !== PIDS.A).map((p) => ({ ...p, lastUsedHere: false })),
      }),
      'POST /api/trips/t-1/join': { participantId: PIDS.A, rejoined: true },
    });
    renderAt(<WhoAreYou />, route);
    expect(await screen.findByText('You left this group · your past expenses are still here')).toBeInTheDocument();
    expect(screen.queryByText(/Not on the list\? Join as/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Rejoin as An' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/));
    expect(calls.find((c) => c.path === '/api/trips/t-1/join')?.body).toEqual({});
    expect(calls.some((c) => c.path === '/api/trips/t-1/people/check-name')).toBe(false);
  });

  it('a failed join shows the error in the bottom bar', async () => {
    mockApi({
      'GET /api/trips/t-1/people/picker': signedIn(),
      'POST /api/trips/t-1/people/check-name': { matches: [] },
      'POST /api/trips/t-1/join': () => Response.json({ error: { code: 'VALIDATION', message: 'Gender required' } }, { status: 422 }),
    });
    renderAt(<WhoAreYou />, route);
    await userEvent.click(await screen.findByRole('button', { name: 'Not on the list? Join as Dũng' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Gender required');
    expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1/who');
  });
});
