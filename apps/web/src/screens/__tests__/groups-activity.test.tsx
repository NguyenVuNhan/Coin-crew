import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router';
import { renderAt, mockApi } from '../../test/render';
import { App } from '../../App';
import { Groups } from '../Groups';

afterEach(() => {
  vi.unstubAllGlobals();
});

function LocationProbe() {
  const location = useLocation();
  return (
    <>
      <div data-testid="location">{location.pathname}</div>
      <div data-testid="location-path">{location.pathname}</div>
      <div data-testid="location-search">{location.search}</div>
    </>
  );
}

function renderApp(initialEntry: string) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <App />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('groups and activity routing', () => {
  it('old /trips links redirect to /groups', () => {
    mockApi({
      'GET /api/me': () => new Promise(() => {}),
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/trips': [],
    });

    const { unmount } = renderApp('/trips?mergeReview=req-1');
    expect(screen.getByTestId('location-path')).toHaveTextContent('/groups');
    expect(screen.getByTestId('location-search')).toHaveTextContent('mergeReview=req-1');
    unmount();

    renderApp('/trips?tab=groups');
    expect(screen.getByTestId('location-path')).toHaveTextContent('/groups');
    expect(screen.getByTestId('location-search')).toHaveTextContent('tab=groups');
  });

  it('groups screen lists groups and has New group, with Nhóm current', async () => {
    const meUser = {
      user: {
        id: 'u-me',
        email: 'me@example.com',
        name: 'Me',
        consentAt: '2026-10-12T00:00:00.000Z',
        providers: ['google'],
      },
      signIn: { zalo: false },
      mergeRequests: { incoming: [], outgoing: [] },
    };

    const ledger = { tripId: 't-led', ownerPid: 'p-me' };

    mockApi({
      'GET /api/me': meUser,
      'GET /api/me/ledger': ledger,
      'GET /api/trips': [
        { id: 't-1', name: 'Đà Lạt · Oct 2026', archived: false, myBalance: 500000 },
      ],
    });

    const { unmount } = renderAt(<Groups />, { route: '/groups' });

    expect(await screen.findByText('Đà Lạt · Oct 2026')).toBeInTheDocument();
    const newGroupLink = screen.getByRole('link', { name: 'New group' });
    expect(newGroupLink).toBeInTheDocument();
    expect(newGroupLink).toHaveAttribute('href', '/trips/new');

    const navBar = screen.getByTestId('app-nav-bar');
    expect(within(navBar).getByTestId('nav-groups')).toHaveAttribute('aria-current', 'page');

    unmount();

    mockApi({
      'GET /api/me': meUser,
      'GET /api/me/ledger': ledger,
      'GET /api/trips': [],
    });

    renderAt(<Groups />, { route: '/groups' });

    expect(await screen.findByText('Create your first group')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New group' })).toHaveAttribute('href', '/trips/new');
    expect(
      within(screen.getByTestId('app-nav-bar')).getByTestId('nav-groups'),
    ).toHaveAttribute('aria-current', 'page');
  });
});

describe('groups and activity when signed out', () => {
  it('Groups shows no nav and sends a signed-out visitor to the start page', async () => {
    mockApi({ 'GET /api/me': { user: null }, 'GET /api/trips': [] });
    renderApp('/groups');
    await waitFor(() => expect(screen.getByTestId('location-path')).toHaveTextContent(/^\/$/));
    expect(screen.queryByTestId('app-nav')).toBeNull();
  });

  it('Activity shows no nav, asks for nothing and sends a signed-out visitor to the start page', async () => {
    const { calls } = mockApi({ 'GET /api/me': { user: null } });
    renderApp('/activity');
    expect(screen.queryByTestId('app-nav')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('location-path')).toHaveTextContent(/^\/$/));
    expect(screen.queryByTestId('app-nav')).toBeNull();
    expect(calls.some((c) => c.path === '/api/me/activity')).toBe(false);
  });
});
