import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt, mockApi } from './render';
import { mockMedia } from './media';
import { tripView } from './fixtures';
import { App } from '../App';

// Regressions found in the Part 4 final review: reading a group's colours must never break that group's refreshes
// (C1), and signing out must put Jade back on screen at once (I1, Review Focus 1).

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.documentElement.removeAttribute('data-theme');
  localStorage.clear();
});

const user = (theme: string | null) => ({
  user: { id: 'u-m', email: 'm@example.com', name: 'Minh', consentAt: '2026-10-12T00:00:00.000Z', providers: ['google'], theme },
  signIn: { zalo: false },
  mergeRequests: { incoming: [], outgoing: [] },
});

describe('themes never break the app around them', () => {
  it('a failed action inside a group refreshes the view and keeps the screen', async () => {
    vi.stubGlobal('scrollTo', vi.fn());
    mockMedia({ wide: false });
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
      errors.push(String(a[0]));
    });
    const state = { fewest: true, version: 3, fail: false };
    mockApi({
      'GET /api/me': user(null),
      'GET /api/trips/t-1': () => {
        const base = tripView();
        return Response.json({ ...base, trip: { ...base.trip, fewestTransfers: state.fewest, version: state.version } });
      },
      'GET /api/trips/t-1/version': () => Response.json({ version: state.version }),
      'PATCH /api/trips/t-1': (init: RequestInit | undefined) => {
        if (state.fail) return Response.json({ error: { code: 'FUND_SHORT', message: 'Fund short' } }, { status: 409 });
        state.fewest = JSON.parse(String(init?.body)).fewestTransfers;
        state.version++;
        return new Response(null, { status: 204 });
      },
    });
    renderAt(<App />, { route: '/t/t-1/settings', path: '*' });

    await userEvent.click(await screen.findByRole('switch', { name: /Fewest transfers/ }));
    await waitFor(() => expect(state.version).toBe(4));
    state.fail = true;
    await userEvent.click(await screen.findByRole('switch', { name: /Fewest transfers/ }));

    expect(await screen.findByText(/There isn't enough in the group fund/)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /Fewest transfers/ })).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong. Try again.')).toBeNull();
    expect(errors.filter((e) => /skipToken|Missing queryFn/.test(e))).toEqual([]);
  });

  it('signing out puts Jade back on screen straight away', async () => {
    vi.stubGlobal('scrollTo', vi.fn());
    mockMedia({ wide: false });
    let signedIn = true;
    mockApi({
      'GET /api/me': () => Response.json(signedIn ? user('orchid') : { user: null, signIn: { zalo: false }, mergeRequests: { incoming: [], outgoing: [] } }),
      'POST /api/auth/logout': () => {
        signedIn = false;
        return new Response(null, { status: 204 });
      },
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/people/summary': { people: [], incomplete: false },
      'GET /api/trips': [],
    });
    renderAt(<App />, { route: '/groups', path: '*' });
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('orchid'));

    const accountButtons = await screen.findAllByRole('button', { name: 'Account' });
    await userEvent.click(accountButtons[accountButtons.length - 1]!);
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Account' })).getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('jade'));
    expect(localStorage.getItem('theme')).toBeNull();
  });
});
