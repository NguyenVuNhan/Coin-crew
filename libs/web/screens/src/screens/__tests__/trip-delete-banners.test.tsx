import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TripView } from '@cc/core';
import { formatDeleteDate } from '@cc/web-util/time';
import { renderAt, mockApi } from '../../test/render';
import { guestChiView, tripView, viewerView, PIDS } from '../../test/fixtures';
import { TripRoute } from '../TripRoute';
import { MemberTrip } from '../MemberTrip';
import { GuestTrip } from '../GuestTrip';
import { ViewOnlyTrip } from '../ViewOnlyTrip';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const route = { route: '/t/t-1', path: '/t/:tripId' };

function archivedView(
  base: TripView,
  deleteAfter: string | null,
  meOverrides: Partial<TripView['me']> = {},
): TripView {
  return {
    ...base,
    trip: {
      ...base.trip,
      archived: true,
      deleteAfter,
    },
    me: {
      ...base.me,
      ...meOverrides,
    },
  };
}

describe('Trip page pending-delete banners', () => {
  it('MemberTrip + organiser: replaces archived notice with DeletePendingBanner, and cancelling refetches GET /api/trips/t-1, unmounts banner, and keeps Snackbar visible (auto-clearing after 4s)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
    const in29Days = new Date(Date.now() + 29 * 86_400_000 - 3600_000).toISOString();
    const expectedDate = formatDeleteDate(in29Days, 'en');
    let cancelled = false;
    let tripFetches = 0;

    const { calls } = mockApi({
      'GET /api/me': { user: { id: 'u-minh', email: 'minh@example.com', name: 'Minh', consentAt: '2026-10-12T00:00:00.000Z' } },
      'GET /api/trips/t-1/version': { version: 3 },
      'GET /api/trips/t-1': () => {
        tripFetches += 1;
        return Response.json(archivedView(tripView(), cancelled ? null : in29Days));
      },
      'POST /api/trips/t-1/cancel-delete': () => {
        cancelled = true;
        return new Response(null, { status: 204 });
      },
    });

    renderAt(<TripRoute />, route);

    expect(
      await screen.findByText(`Permanently deletes in 29 days (${expectedDate})`),
    ).toBeInTheDocument();
    expect(screen.getByText('Transactions no longer count in Spending book.')).toBeInTheDocument();
    expect(screen.queryByText('This trip is archived. You can still look at it.')).toBeNull();

    const cancelBtn = screen.getByRole('button', { name: 'Cancel deletion' });
    await userEvent.click(cancelBtn);

    await waitFor(() => {
      expect(calls.some((c) => c.method === 'POST' && c.path === '/api/trips/t-1/cancel-delete')).toBe(true);
      expect(tripFetches).toBeGreaterThanOrEqual(2);
    });

    await waitFor(() => {
      expect(screen.queryByText(`Permanently deletes in 29 days (${expectedDate})`)).toBeNull();
      expect(screen.getByText('This trip is archived. You can still look at it.')).toBeInTheDocument();
    });

    expect(screen.getByRole('status')).toHaveTextContent(
      'Deletion cancelled. Group is back to archived.',
    );

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('MemberTrip + non-organiser member: shows countdown banner and Spending book note with no Cancel deletion button', async () => {
    const in10Days = new Date(Date.now() + 10 * 86_400_000 - 3600_000).toISOString();
    const expectedDate = formatDeleteDate(in10Days, 'en');
    mockApi({ 'GET /api/me': { user: null } });

    renderAt(
      <MemberTrip
        view={archivedView(tripView(), in10Days, {
          participantId: PIDS.A,
          isOrganiser: false,
          isAdmin: true,
        })}
      />,
      route,
    );

    expect(
      screen.getByText(`Permanently deletes in 10 days (${expectedDate})`),
    ).toBeInTheDocument();
    expect(screen.getByText('Transactions no longer count in Spending book.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel deletion' })).toBeNull();
    expect(screen.queryByText('This trip is archived. You can still look at it.')).toBeNull();
  });

  it('MemberTrip + deleteAfter in the past (before :30 cron): shows Deletes today (never 0 or negative days)', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    mockApi({ 'GET /api/me': { user: null } });

    renderAt(<MemberTrip view={archivedView(tripView(), past)} />, route);

    expect(screen.getByText('Deletes today')).toBeInTheDocument();
    expect(screen.queryByText(/Permanently deletes in 0/)).toBeNull();
    expect(screen.queryByText(/Permanently deletes in -/)).toBeNull();
  });

  it('GuestTrip + deleteAfter set: replaces muted archived notice with DeletePendingBanner (no Cancel button, no Spending book note)', () => {
    const in15Days = new Date(Date.now() + 15 * 86_400_000 - 3600_000).toISOString();
    const expectedDate = formatDeleteDate(in15Days, 'en');
    mockApi({ 'GET /api/me': { user: null } });

    renderAt(<GuestTrip view={archivedView(guestChiView(), in15Days)} />, route);

    expect(
      screen.getByText(`Permanently deletes in 15 days (${expectedDate})`),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel deletion' })).toBeNull();
    expect(screen.queryByText('Transactions no longer count in Spending book.')).toBeNull();
    expect(screen.queryByText('This trip is archived. You can still look at it.')).toBeNull();
  });

  it('ViewOnlyTrip + deleteAfter set: renders DeletePendingBanner above the view-only banner (no Cancel button, no Spending book note)', () => {
    const in7Days = new Date(Date.now() + 7 * 86_400_000 - 3600_000).toISOString();
    const expectedDate = formatDeleteDate(in7Days, 'en');
    mockApi({ 'GET /api/me': { user: null } });

    renderAt(<ViewOnlyTrip view={archivedView(viewerView(), in7Days)} />, route);

    const bannerHeadline = screen.getByText(`Permanently deletes in 7 days (${expectedDate})`);
    const viewOnlyBadge = screen.getByText('View only');
    expect(bannerHeadline).toBeInTheDocument();
    expect(
      Boolean(bannerHeadline.compareDocumentPosition(viewOnlyBadge) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
    expect(screen.queryByRole('button', { name: 'Cancel deletion' })).toBeNull();
    expect(screen.queryByText('Transactions no longer count in Spending book.')).toBeNull();
  });
});
