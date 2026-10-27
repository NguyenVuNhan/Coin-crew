import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PersonView, TripView } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { PIDS, guestChiView } from '../../test/fixtures';
import { sportFundView } from '../../test/fundFixtures';
import { RatingsScreen, buildStarSolarPath } from '../RatingsScreen';
import { TripRoute } from '../TripRoute';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function make15People(): PersonView[] {
  return Array.from({ length: 15 }, (_, idx) => ({
    id: idx === 0 ? PIDS.M : idx === 1 ? PIDS.A : idx === 2 ? PIDS.B : idx === 3 ? PIDS.C : `p-${idx + 1}`,
    name: idx === 0 ? 'Minh' : idx === 1 ? 'An' : idx === 2 ? 'Bình' : idx === 3 ? 'Chi' : `Player ${idx + 1}`,
    status: 'active',
    isMember: idx === 0,
    bank: 'none',
    gender: 'M',
  }));
}

function buildSportRatingsView(overrides: Partial<TripView> = {}): TripView {
  const base = sportFundView();
  return {
    ...base,
    ratings: {
      enabled: true,
      totalStars: {
        [PIDS.M]: 12,
        [PIDS.A]: 18,
        [PIDS.B]: 14,
        [PIDS.C]: 11,
      },
      maxStars: 8,
      myAllocations: {
        [PIDS.A]: 5,
        [PIDS.B]: 1,
      },
    },
    ...overrides,
  };
}

describe('RatingsScreen & /t/:tripId/ratings', () => {
  it('member sees "Your star wallet" progress meter (22 / 30 ★ left), <StarVote /> with no -/+ stepper buttons, tapping adds fsl-star-vote--popping and sends POST with delta: 1', async () => {
    const fifteenPeople = make15People();
    const totalStars: Record<string, number> = {};
    fifteenPeople.forEach((p, idx) => {
      totalStars[p.id] = 30 - idx;
    });

    const view = buildSportRatingsView({
      people: fifteenPeople,
      ratings: {
        enabled: true,
        totalStars,
        maxStars: 30,
        myAllocations: {
          [PIDS.A]: 5,
          [PIDS.B]: 3,
        },
      },
    });
    const { calls } = mockApi({
      'POST /api/trips/t-1/ratings': { stars: 1, spentStars: 9, maxStars: 30 },
    });

    renderAt(<RatingsScreen view={view} />);

    expect(screen.getByText('Your star wallet')).toBeInTheDocument();
    expect(screen.getByText('22 / 30 ★ left')).toBeInTheDocument();
    const meter = screen.getByRole('progressbar');
    expect(meter).toHaveAttribute('aria-valuenow', '22');
    expect(meter).toHaveAttribute('aria-valuemax', '30');

    expect(screen.queryByText('−')).toBeNull();
    expect(screen.queryByText('+')).toBeNull();
    expect(screen.queryByRole('button', { name: /Take back a star/i })).toBeNull();

    const chiBtn = screen.getByTestId(`star-vote-${PIDS.C}`);
    expect(chiBtn).toBeInTheDocument();
    expect(chiBtn).not.toHaveClass('fsl-star-vote--popping');

    fireEvent.click(chiBtn);
    expect(chiBtn).toHaveClass('fsl-star-vote--popping');

    await waitFor(() =>
      expect(calls.find((c) => c.path === '/api/trips/t-1/ratings')?.body).toEqual({
        targetParticipantId: PIDS.C,
        delta: 1,
      }),
    );
  });

  it('tapping when quota is exceeded (5 ★ cap, 0 ★ wallet remaining, over-budget, or own row) triggers fsl-star-vote--shaking and sends no API request', () => {
    const viewNormal = buildSportRatingsView();
    const { calls: callsNormal } = mockApi({
      'POST /api/trips/t-1/ratings': { stars: 1 },
    });
    const { unmount } = renderAt(<RatingsScreen view={viewNormal} />);

    const anBtn = screen.getAllByTestId(`star-vote-${PIDS.A}`)[0]!;
    fireEvent.click(anBtn);
    expect(anBtn).toHaveClass('fsl-star-vote--shaking');
    expect(callsNormal).toHaveLength(0);

    const minhBtn = screen.getAllByTestId(`star-vote-${PIDS.M}`)[0]!;
    fireEvent.click(minhBtn);
    expect(minhBtn).toHaveClass('fsl-star-vote--shaking');
    expect(callsNormal).toHaveLength(0);

    unmount();

    const viewZeroWallet = buildSportRatingsView({
      ratings: {
        enabled: true,
        totalStars: { [PIDS.M]: 0, [PIDS.A]: 5, [PIDS.B]: 3, [PIDS.C]: 0 },
        maxStars: 8,
        myAllocations: { [PIDS.A]: 5, [PIDS.B]: 3 },
      },
    });
    const { calls: callsZero } = mockApi({
      'POST /api/trips/t-1/ratings': { stars: 1 },
    });
    const { unmount: unmountZero } = renderAt(<RatingsScreen view={viewZeroWallet} />);

    const chiBtnZero = screen.getByTestId(`star-vote-${PIDS.C}`);
    fireEvent.click(chiBtnZero);
    expect(chiBtnZero).toHaveClass('fsl-star-vote--shaking');
    expect(callsZero).toHaveLength(0);

    unmountZero();

    const viewOverBudget = buildSportRatingsView({
      ratings: {
        enabled: true,
        totalStars: { [PIDS.M]: 0, [PIDS.A]: 5, [PIDS.B]: 5, [PIDS.C]: 0 },
        maxStars: 8,
        myAllocations: { [PIDS.A]: 5, [PIDS.B]: 5 },
      },
    });
    const { calls: callsOver } = mockApi({
      'POST /api/trips/t-1/ratings': { stars: 1 },
    });
    renderAt(<RatingsScreen view={viewOverBudget} />);

    expect(screen.getByText('Over budget after roster change')).toBeInTheDocument();
    const chiBtnOver = screen.getByTestId(`star-vote-${PIDS.C}`);
    fireEvent.click(chiBtnOver);
    expect(chiBtnOver).toHaveClass('fsl-star-vote--shaking');
    expect(callsOver).toHaveLength(0);
  });

  it('holding (700ms) morphs star path to solar circle, spawns solar-sparks-<id>, and sends POST with stars: 0; releasing early (300ms) cancels without calling API', () => {
    const path0 = buildStarSolarPath(0);
    const path1 = buildStarSolarPath(1);
    expect(path0).toContain('M');
    expect(path0).toContain('Z');
    expect(path1).toContain('M');
    expect(path1).toContain('Z');
    expect(path0).not.toEqual(path1);

    const view = buildSportRatingsView({
      ratings: {
        enabled: true,
        totalStars: { [PIDS.M]: 12, [PIDS.A]: 18, [PIDS.B]: 14, [PIDS.C]: 11 },
        maxStars: 8,
        myAllocations: { [PIDS.A]: 5, [PIDS.B]: 1 },
      },
    });
    const { calls } = mockApi({
      'POST /api/trips/t-1/ratings': { stars: 0, spentStars: 1, maxStars: 8 },
    });

    renderAt(<RatingsScreen view={view} />);
    const anBtn = screen.getAllByTestId(`star-vote-${PIDS.A}`)[0]!;

    vi.useFakeTimers();
    try {
      fireEvent.pointerDown(anBtn);
      act(() => {
        vi.advanceTimersByTime(300);
      });
      const prog300 = Number(anBtn.getAttribute('data-morph-progress'));
      expect(prog300).toBeGreaterThan(0.3);
      expect(prog300).toBeLessThan(0.6);

      fireEvent.pointerUp(anBtn);
      expect(anBtn).toHaveAttribute('data-morph-progress', '0.00');
      expect(calls).toHaveLength(0);
      expect(screen.queryByTestId(`solar-sparks-${PIDS.A}`)).toBeNull();

      fireEvent.pointerDown(anBtn);
      act(() => {
        vi.advanceTimersByTime(350);
      });
      expect(anBtn).toHaveAttribute('data-morph-progress', '0.50');

      act(() => {
        vi.advanceTimersByTime(350);
      });
      expect(anBtn).toHaveAttribute('data-morph-progress', '0.00');
      const sparks = screen.getByTestId(`solar-sparks-${PIDS.A}`);
      expect(sparks).toBeInTheDocument();
      expect(sparks.children).toHaveLength(8);

      expect(calls.find((c) => c.path === '/api/trips/t-1/ratings')?.body).toEqual({
        targetParticipantId: PIDS.A,
        stars: 0,
      });

      act(() => {
        vi.advanceTimersByTime(380);
      });
      expect(screen.queryByTestId(`solar-sparks-${PIDS.A}`)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows sticky search when active players > 12, progressively reveals 10 then all 15, and searches across all 15 immediately', async () => {
    const fifteenPeople = make15People();
    const totalStars: Record<string, number> = {};
    fifteenPeople.forEach((p, idx) => {
      totalStars[p.id] = 30 - idx;
    });

    const view = buildSportRatingsView({
      me: { kind: 'member', participantId: 'p-1', participantPending: false, isOrganiser: true, isAdmin: true },
      people: fifteenPeople,
      ratings: {
        enabled: true,
        totalStars,
        maxStars: 30,
        myAllocations: {},
      },
    });

    renderAt(<RatingsScreen view={view} />);

    const searchInput = screen.getByRole('searchbox', { name: 'Search players' });
    expect(searchInput).toBeInTheDocument();

    expect(screen.getByText('Player 10')).toBeInTheDocument();
    expect(screen.queryByText('Player 15')).toBeNull();

    await userEvent.type(searchInput, 'Player 15');
    expect(screen.getByText('Player 15')).toBeInTheDocument();
    expect(screen.queryByText('Player 10')).toBeNull();

    await userEvent.clear(searchInput);
    expect(screen.queryByText('Player 15')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Show all 15 players' }));
    expect(screen.getByText('Player 15')).toBeInTheDocument();
  });

  it('podium holds only starred players (anonymous avatars fill the rest); the list continues from #4 and unrated players have no number, sorted by name', () => {
    const person = (id: string, name: string): PersonView => ({ id, name, status: 'active', isMember: false, bank: 'none', gender: null });
    const people = [
      { ...person(PIDS.M, 'Minh'), isMember: true },
      person(PIDS.A, 'Yến'),
      person(PIDS.B, 'Bảo'),
      person(PIDS.C, 'Đạt'),
      person('p-5', 'An'),
    ];

    // Only one player has stars: the #2 and #3 slots stay anonymous and everyone else is unranked.
    const { unmount } = renderAt(
      <RatingsScreen view={buildSportRatingsView({ people, ratings: { enabled: true, totalStars: { [PIDS.C]: 4 }, maxStars: 10, myAllocations: {} } })} />,
    );
    expect(document.querySelector('[data-podium-rank="1"]')).toHaveTextContent('Đạt');
    expect(screen.getByTestId('podium-anonymous-2')).toBeInTheDocument();
    expect(screen.getByTestId('podium-anonymous-3')).toBeInTheDocument();
    const rows = Array.from(document.querySelectorAll('.fsl-ratings__row'));
    expect(rows.map((r) => r.querySelector('.fsl-ratings__name')?.textContent)).toEqual(['An', 'Bảo', 'Minh', 'Yến']);
    expect(rows.map((r) => r.querySelector('.fsl-ratings__rank')?.textContent)).toEqual(['', '', '', '']);
    expect(screen.getByText('You')).toBeInTheDocument();
    unmount();

    // Four starred players: the first list row is #4, then the unrated one without a number.
    renderAt(
      <RatingsScreen
        view={buildSportRatingsView({
          people,
          ratings: { enabled: true, totalStars: { [PIDS.M]: 9, [PIDS.A]: 7, [PIDS.B]: 5, [PIDS.C]: 2 }, maxStars: 10, myAllocations: {} },
        })}
      />,
    );
    expect(screen.queryByTestId('podium-anonymous-3')).toBeNull();
    const rows4 = Array.from(document.querySelectorAll('.fsl-ratings__row'));
    expect(rows4.map((r) => r.querySelector('.fsl-ratings__rank')?.textContent)).toEqual(['4', '']);
    expect(rows4.map((r) => r.querySelector('.fsl-ratings__name')?.textContent)).toEqual(['Đạt', 'An']);
  });

  it('shows guest sign-in prompt and shows read-only star counts for guests', () => {
    const gView = {
      ...buildSportRatingsView(),
      me: guestChiView().me,
    };
    renderAt(<RatingsScreen view={gView} />);

    expect(screen.getByText('Sign in to rate teammates')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in with Google for full access' })).toHaveAttribute(
      'href',
      expect.stringContaining('/api/auth/google/start'),
    );
    expect(screen.queryByRole('button', { name: /Give a star/i })).toBeNull();

    const readonlyElements = document.querySelectorAll('.fsl-star-vote--readonly');
    expect(readonlyElements.length).toBeGreaterThan(0);
  });

  it('routes /t/:tripId/ratings through TripRoute and redirects to /t/:tripId if ratings are disabled', async () => {
    const disabledView = buildSportRatingsView({
      ratings: { enabled: false, totalStars: {}, maxStars: 8, myAllocations: {} },
    });
    mockApi({ 'GET /api/trips/t-1': disabledView });
    renderAt(<TripRoute />, { route: '/t/t-1/ratings', path: '/t/:tripId/ratings' });
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/));
  });
});
