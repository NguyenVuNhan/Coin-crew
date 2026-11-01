import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderAt, mockApi } from '../../test/render';
import { picker, PIDS } from '../../test/fixtures';
import { mockMedia } from '../../test/media';
import { TripRoute } from '../TripRoute';
import { WhoAreYou } from '../WhoAreYou';

afterEach(() => {
  vi.unstubAllGlobals();
});

const forbidden = () => Response.json({ error: { code: 'FORBIDDEN', message: 'FORBIDDEN' } }, { status: 403 });
const signedOut = { user: null, signIn: { zalo: true } };

describe('no access to the group', () => {
  it('the trip page offers sign-in instead of a retry', async () => {
    mockMedia({ wide: false });
    vi.stubGlobal('scrollTo', vi.fn());
    mockApi({ 'GET /api/trips/t-1': forbidden, 'GET /api/me': signedOut });
    renderAt(<TripRoute />, { route: '/t/t-1', path: '/t/:tripId' });

    expect(await screen.findByText("You don't have access to this group")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in with Google' })).toHaveAttribute(
      'href',
      '/api/auth/google/start?returnTo=%2Ft%2Ft-1',
    );
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('the who page offers sign-in, returning to the trip', async () => {
    mockApi({ 'GET /api/trips/t-1/people/picker': forbidden, 'GET /api/me': signedOut });
    renderAt(<WhoAreYou />, { route: '/t/t-1/who', path: '/t/:tripId/who' });

    expect(await screen.findByText("You don't have access to this group")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in with Google' })).toHaveAttribute(
      'href',
      '/api/auth/google/start?returnTo=%2Ft%2Ft-1',
    );
  });
});

describe('a signed-in member on the who page', () => {
  it('goes straight to the trip and never picks a name', async () => {
    const { calls } = mockApi({
      'GET /api/trips/t-1/people/picker': picker({ myPick: PIDS.M, account: null, myLeftName: null }),
      'GET /api/me': {
        user: { id: 'u-minh', email: null, name: 'Minh', consentAt: null, providers: ['google'] },
        signIn: { zalo: true },
      },
    });
    renderAt(<WhoAreYou />, { route: '/t/t-1/who', path: '/t/:tripId/who' });

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/));
    expect(calls.some((c) => c.path === '/api/trips/t-1/people/pick')).toBe(false);
  });
});
