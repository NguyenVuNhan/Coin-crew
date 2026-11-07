import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { useLocation } from 'react-router';
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
