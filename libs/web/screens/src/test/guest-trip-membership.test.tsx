import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { useLocation, useNavigate } from 'react-router';
import { renderAt, mockApi } from './render';
import { tripView } from './fixtures';
import { GuestTrip } from '../screens/GuestTrip';

afterEach(() => {
  vi.restoreAllMocks();
});

function SearchProbe() {
  const location = useLocation();
  return <div data-testid="search">{location.search}</div>;
}

describe('GuestTrip becomeMember parameter handling (#72)', () => {
  const guestView = tripView({
    me: { kind: 'guest', participantId: 'p-an', participantPending: false, isOrganiser: false },
  });

  it('strips ?becomeMember=1 from URL search params upon triggering membership request', async () => {
    mockApi({
      'POST /api/trips/t-1/membership': { requestId: 'req-1' },
    });

    renderAt(
      <>
        <GuestTrip view={guestView} />
        <SearchProbe />
      </>,
      { route: '/t/t-1?becomeMember=1', path: '/t/:id' },
    );

    await waitFor(() => {
      const search = screen.getByTestId('search').textContent;
      expect(search).not.toContain('becomeMember=1');
    });

    expect(screen.getByText('You asked to become a member. A member will approve it.')).toBeInTheDocument();
  });

  it('keeps requested state when claim returns 409 ALREADY_CLAIMED', async () => {
    mockApi({
      'POST /api/trips/t-1/membership': () =>
        Response.json(
          { error: { code: 'ALREADY_CLAIMED', message: 'Someone already claimed this person, ask the owner' } },
          { status: 409 },
        ),
    });

    renderAt(
      <>
        <GuestTrip view={guestView} />
        <SearchProbe />
      </>,
      { route: '/t/t-1?becomeMember=1', path: '/t/:id' },
    );

    await waitFor(() => {
      const search = screen.getByTestId('search').textContent;
      expect(search).not.toContain('becomeMember=1');
    });

    await waitFor(() => {
      expect(screen.getByText('You asked to become a member. A member will approve it.')).toBeInTheDocument();
    });
  });
});

function ReopenLink() {
  const navigate = useNavigate();
  return <button type="button" data-testid="reopen" onClick={() => navigate('/t/t-1?becomeMember=1')}>reopen</button>;
}

describe('GuestTrip failed membership request (#79)', () => {
  const guestView = tripView({
    me: { kind: 'guest', participantId: 'p-an', participantPending: false, isOrganiser: false },
  });
  const requested = 'You asked to become a member. A member will approve it.';
  const posts = (calls: { method: string; path: string }[]) =>
    calls.filter((c) => c.method === 'POST' && c.path === '/api/trips/t-1/membership');

  it('a network failure drops the requested banner, shows an error, and Try again sends it again', async () => {
    let fail = true;
    const { calls } = mockApi({
      'POST /api/trips/t-1/membership': () => {
        if (fail) return Promise.reject(new TypeError('Failed to fetch'));
        return Response.json({ requestId: 'req-1' }, { status: 201 });
      },
    });

    renderAt(<GuestTrip view={guestView} />, { route: '/t/t-1?becomeMember=1', path: '/t/:id' });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/./);
    expect(screen.queryByText(requested)).not.toBeInTheDocument();

    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(screen.getByText(requested)).toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(posts(calls)).toHaveLength(2);
  });

  it('a server error lets the same link ask again', async () => {
    let fail = true;
    const { calls } = mockApi({
      'POST /api/trips/t-1/membership': () =>
        fail
          ? Response.json({ error: { code: 'INTERNAL', message: 'boom' } }, { status: 500 })
          : Response.json({ requestId: 'req-1' }, { status: 201 }),
    });

    renderAt(
      <>
        <GuestTrip view={guestView} />
        <ReopenLink />
      </>,
      { route: '/t/t-1?becomeMember=1', path: '/t/:id' },
    );

    await screen.findByRole('alert');
    expect(screen.queryByText(requested)).not.toBeInTheDocument();

    fail = false;
    fireEvent.click(screen.getByTestId('reopen'));

    await waitFor(() => expect(screen.getByText(requested)).toBeInTheDocument());
    expect(posts(calls)).toHaveLength(2);
  });
});

describe('GuestTrip persistent pending claim (#80)', () => {
  const pendingView = tripView({
    me: {
      kind: 'guest',
      participantId: 'p-an',
      participantPending: false,
      isOrganiser: false,
      hasPendingMembershipRequest: true,
    },
  });

  it('shows the requested banner from the server flag with no URL params', () => {
    mockApi({});
    renderAt(<GuestTrip view={pendingView} />, { route: '/t/t-1', path: '/t/:id' });
    expect(screen.getByText('You asked to become a member. A member will approve it.')).toBeInTheDocument();
  });

  it('strips ?becomeMember=1 without sending a claim when one is already pending', async () => {
    const { calls } = mockApi({
      'POST /api/trips/t-1/membership': { requestId: 'req-1' },
    });

    renderAt(
      <>
        <GuestTrip view={pendingView} />
        <SearchProbe />
      </>,
      { route: '/t/t-1?becomeMember=1', path: '/t/:id' },
    );

    await waitFor(() => {
      expect(screen.getByTestId('search').textContent).not.toContain('becomeMember=1');
    });
    expect(calls.filter((c) => c.method === 'POST' && c.path === '/api/trips/t-1/membership')).toHaveLength(0);
    expect(screen.getByText('You asked to become a member. A member will approve it.')).toBeInTheDocument();
  });
});
