import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import type { ThemeId, TripView } from '@cc/core';
import { browserPlatform } from '@cc/web-platform';
import { sessionStore } from '@cc/web-platform/session';
import { signOut } from '@cc/web-data-access/signOut';
import { renderAt, mockApi } from './render';
import { mockMedia } from './media';
import { tripView, guestChiView } from './fixtures';
import { App } from '../App';
import { bootApp } from '../AppRoot';

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('data-theme');
  localStorage.clear();
});

function renderApp(initialEntry: string) {
  return renderAt(<App />, { route: initialEntry, path: '*' });
}

function meWith(theme: ThemeId | null) {
  return {
    user: {
      id: 'u-me',
      email: 'me@example.com',
      name: 'Me',
      consentAt: '2026-10-12T00:00:00.000Z',
      providers: ['google'],
      theme,
    },
    signIn: { zalo: false },
    mergeRequests: { incoming: [], outgoing: [] },
  };
}

function groupView(theme: ThemeId | null): TripView {
  const base = tripView();
  return { ...base, trip: { ...base.trip, theme } };
}

function signedInApi(me: unknown, view: TripView = groupView(null)) {
  return mockApi({
    'GET /api/me': me,
    'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
    'GET /api/me/people/summary': { people: [], incomplete: false },
    'GET /api/trips': [{ id: 't-1', name: 'Đà Lạt · Oct 2026', archived: false, myBalance: 500000 }],
    'GET /api/trips/t-1': view,
    'GET /api/trips/t-1/version': { version: view.trip.version },
  });
}

const themeInView = () => document.documentElement.dataset.theme;

describe('the theme in view', () => {
  it("outside a group the signed-in person's theme applies", async () => {
    mockMedia({ wide: false });
    signedInApi(meWith('sky'));
    renderApp('/groups');

    expect(await screen.findByRole('heading', { level: 1, name: 'Your groups' })).toBeInTheDocument();
    await waitFor(() => expect(themeInView()).toBe('sky'));
  });

  it('inside a group its colours win', async () => {
    mockMedia({ wide: false });
    signedInApi(meWith('sky'), groupView('orchid'));
    renderApp('/groups');

    await waitFor(() => expect(themeInView()).toBe('sky'));

    await userEvent.click(await screen.findByRole('link', { name: /Đà Lạt/ }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/));
    expect(await screen.findByRole('heading', { level: 1, name: 'Đà Lạt · Oct 2026' })).toBeInTheDocument();
    await waitFor(() => expect(themeInView()).toBe('orchid'));

    await userEvent.click(screen.getByRole('link', { name: 'Back' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/groups$/));
    await waitFor(() => expect(themeInView()).toBe('sky'));
  });

  it("a group without colours shows the person's own theme", async () => {
    mockMedia({ wide: false });
    signedInApi(meWith('sky'), groupView(null));
    renderApp('/t/t-1');

    expect(await screen.findByRole('heading', { level: 1, name: 'Đà Lạt · Oct 2026' })).toBeInTheDocument();
    await waitFor(() => expect(themeInView()).toBe('sky'));
  });

  it("guests see the group's colours, and Jade elsewhere", async () => {
    mockMedia({ wide: false });
    const guest = guestChiView();
    mockApi({
      'GET /api/me': { user: null },
      'GET /api/links/tok-1': { tripId: 't-1', tripName: 'Đà Lạt · Oct 2026', access: 'group' },
      'GET /api/trips/t-1': { ...guest, trip: { ...guest.trip, theme: 'indigo' } },
      'GET /api/trips/t-1/version': { version: guest.trip.version },
      'GET /api/me/bank': null,
    });
    const { unmount } = renderApp('/j/tok-1');

    expect(await screen.findByRole('heading', { level: 1, name: 'Đà Lạt · Oct 2026' })).toBeInTheDocument();
    await waitFor(() => expect(themeInView()).toBe('indigo'));
    unmount();

    document.documentElement.removeAttribute('data-theme');
    renderApp('/');
    await waitFor(() => expect(themeInView()).toBe('jade'));
  });

  it('the theme lives on <html>, so portals follow it', async () => {
    mockMedia({ wide: false });
    signedInApi(meWith('sky'), groupView('orchid'));
    const { container } = renderApp('/t/t-1');

    expect(await screen.findByRole('heading', { level: 1, name: 'Đà Lạt · Oct 2026' })).toBeInTheDocument();
    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('orchid'));
    expect(container.querySelector('[data-theme]')).toBeNull();
    expect(document.body.querySelector('[data-theme]')).toBeNull();
  });

  it('boot applies the cached theme before the first render', async () => {
    localStorage.setItem('theme', 'sky');
    const booting = bootApp();
    // Synchronously, before boot awaits anything (and before anything renders).
    expect(themeInView()).toBe('sky');
    await booting;
    expect(themeInView()).toBe('sky');
  });

  it('signing out drops the cached theme', async () => {
    mockApi({ 'POST /api/auth/logout': null });
    await sessionStore.init(browserPlatform);
    localStorage.setItem('theme', 'sky');

    await signOut(browserPlatform, new QueryClient());

    expect(localStorage.getItem('theme')).toBeNull();
  });

  it('a fetched me caches the theme', async () => {
    mockMedia({ wide: false });
    let me: unknown = meWith('indigo');
    mockApi({
      'GET /api/me': () => Response.json(me),
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/people/summary': { people: [], incomplete: false },
      'GET /api/trips': [],
    });
    const { unmount } = renderApp('/groups');

    await waitFor(() => expect(localStorage.getItem('theme')).toBe('indigo'));
    await waitFor(() => expect(themeInView()).toBe('indigo'));
    unmount();

    me = { user: null };
    renderApp('/');
    await waitFor(() => expect(localStorage.getItem('theme')).toBeNull());
    await waitFor(() => expect(themeInView()).toBe('jade'));
  });
});
