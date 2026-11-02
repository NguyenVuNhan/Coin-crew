import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import type { PersonSummary, TripView } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { tripView, guestChiView } from '../../test/fixtures';
import { TripRoute } from '../TripRoute';
import { PersonScreen } from '../PersonScreen';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const TRIP_API = { 'GET /api/trips/t-1/version': { version: 3 } };
const route = { route: '/t/t-1', path: '/t/:tripId' };

describe('app navigation on pages', () => {
  it('member trip page shows the nav with Nhóm current and + adding to this group', async () => {
    mockApi({
      ...TRIP_API,
      'GET /api/trips/t-1': tripView(),
      'GET /api/me': {
        user: { id: 'u-minh', name: 'Minh', email: 'minh@example.com', consentAt: '2026-10-12T00:00:00.000Z' },
      },
    });
    renderAt(<TripRoute />, route);

    const navBar = await screen.findByTestId('app-nav-bar');
    const navGroups = within(navBar).getByTestId('nav-groups');
    expect(navGroups).toHaveAttribute('aria-current', 'page');

    const navAdd = within(navBar).getByTestId('nav-add');
    expect(navAdd).toHaveAttribute('href', '/t/t-1/expenses/new');
    expect(screen.queryByRole('link', { name: '+ Add expense' })).toBeNull();
    expect(document.querySelector('.fsl-bottom-bar')).toBeNull();
  });

  it("a guest's trip page keeps its own add bar and no nav", async () => {
    mockApi({
      ...TRIP_API,
      'GET /api/trips/t-1': guestChiView(),
      'GET /api/me': { user: null },
    });
    renderAt(<TripRoute />, route);

    const add = await screen.findByRole('link', { name: '+ Add expense' });
    expect(add.closest('.fsl-bottom-bar')).not.toBeNull();
    expect(add).toHaveAttribute('href', '/t/t-1/expenses/new');
    expect(screen.queryByTestId('app-nav')).toBeNull();
    expect(screen.queryByTestId('app-nav-bar')).toBeNull();
  });

  it('opening the ledger trip list redirects to /trips', async () => {
    const directTrip: TripView = {
      ...tripView(),
      trip: {
        ...tripView().trip,
        id: 't-led',
        preset: 'direct',
      },
    };
    mockApi({
      'GET /api/trips/t-led': directTrip,
      'GET /api/trips/t-led/version': { version: 3 },
      'GET /api/me': {
        user: { id: 'u-minh', name: 'Minh', email: 'minh@example.com', consentAt: '2026-10-12T00:00:00.000Z' },
      },
    });
    renderAt(<TripRoute />, { route: '/t/t-led', path: '/t/:tripId' });

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/trips');
    });
  });

  it('person page has the nav with home current', async () => {
    const person: PersonSummary = {
      key: 'u:u-minh',
      name: 'Minh',
      nickname: null,
      userId: 'u-minh',
      groupLabel: null,
      total: 270000,
      items: [],
      waiting: [],
      linked: [],
    };
    mockApi({
      'GET /api/me': {
        user: { id: 'u-me', name: 'Me', email: 'me@example.com', consentAt: '2026-10-12T00:00:00.000Z' },
      },
      'GET /api/me/ledger': { tripId: 't-ledger', ownerPid: 'p-me' },
      'GET /api/me/people/summary': {
        people: [person],
        incomplete: false,
      },
    });
    renderAt(<PersonScreen />, { route: '/people/u%3Au-minh', path: '/people/:key' });

    const navBar = await screen.findByTestId('app-nav-bar');
    const navHome = within(navBar).getByTestId('nav-home');
    expect(navHome).toHaveAttribute('aria-current', 'page');

    await waitFor(() => expect(within(screen.getByTestId('app-nav-bar')).getByTestId('nav-add')).toHaveAttribute('href', '/t/t-ledger/expenses/new'));
  });
});

describe('app navigation: final review fixes', () => {
  const signedIn = { user: { id: 'u-minh', name: 'Minh', email: 'minh@example.com', consentAt: '2026-10-12T00:00:00.000Z' } };

  it("an archived group's + adds a quick expense, with Nhóm still current", async () => {
    const archived: TripView = { ...tripView(), trip: { ...tripView().trip, archived: true } };
    mockApi({
      ...TRIP_API,
      'GET /api/trips/t-1': archived,
      'GET /api/me': signedIn,
      'GET /api/me/ledger': { tripId: 't-ledger', ownerPid: 'p-me' },
    });
    renderAt(<TripRoute />, route);

    const navBar = await screen.findByTestId('app-nav-bar');
    expect(within(navBar).getByTestId('nav-groups')).toHaveAttribute('aria-current', 'page');
    await waitFor(() => expect(within(navBar).getByTestId('nav-add')).toHaveAttribute('href', '/t/t-ledger/expenses/new'));
    for (const add of screen.getAllByTestId('nav-add')) expect(add).not.toHaveAttribute('href', '/t/t-1/expenses/new');
  });

  it('the "Tap to check" bar sits above the footer', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': tripView(), 'GET /api/me': signedIn });
    renderAt(<TripRoute />, route);
    await screen.findByTestId('app-nav-bar');
    await act(async () => {
      vi.advanceTimersByTime(15 * 60_000 + 1);
    });
    const bar = screen.getByTestId('resume-bar');
    expect(within(bar).getByRole('button', { name: 'Tap to check again' })).toBeInTheDocument();
    // The footer's top is 1rem + 56px (72px) above the safe area: the bar starts 12px above it, as the Snackbar does.
    expect(bar).toHaveClass('bottom-[calc(72px+env(safe-area-inset-bottom,0px)+12px)]');
    expect(bar).not.toHaveClass('bottom-[calc(1rem+env(safe-area-inset-bottom,0px))]');
  });

  it('without the nav (a guest) the "Tap to check" bar stays at the bottom', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': guestChiView(), 'GET /api/me': { user: null } });
    renderAt(<TripRoute />, route);
    await screen.findByRole('link', { name: '+ Add expense' });
    await act(async () => {
      vi.advanceTimersByTime(15 * 60_000 + 1);
    });
    expect(screen.getByTestId('resume-bar')).toHaveClass('bottom-[calc(1rem+env(safe-area-inset-bottom,0px))]');
  });

  it('a member page shows neither the add bar nor the nav until sign-in is known', async () => {
    let answerMe: (r: Response) => void = () => {};
    mockApi({
      ...TRIP_API,
      'GET /api/trips/t-1': tripView(),
      'GET /api/me': () => new Promise<Response>((resolve) => { answerMe = resolve; }),
    });
    renderAt(<TripRoute />, route);
    await screen.findByText("You're owed");
    expect(document.querySelector('.fsl-bottom-bar')).toBeNull();
    expect(screen.queryByTestId('app-nav')).toBeNull();

    await act(async () => {
      answerMe(Response.json(signedIn));
    });
    expect(await screen.findByTestId('app-nav-bar')).toBeInTheDocument();
    expect(document.querySelector('.fsl-bottom-bar')).toBeNull();
  });
});
