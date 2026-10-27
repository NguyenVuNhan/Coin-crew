import { describe, it, expect, afterEach } from 'vitest';
import { screen, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt } from '../../test/render';
import { PIDS, tripView } from '../../test/fixtures';
import { sportFundView } from '../../test/fundFixtures';
import { LeaderboardWidget } from '../LeaderboardWidget';

afterEach(() => {
  Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true });
});

function sportWithRatings(totalStars: Record<string, number>, enabled = true) {
  const base = sportFundView();
  return {
    ...base,
    ratings: {
      enabled,
      totalStars,
      maxStars: 8,
      myAllocations: {},
    },
  };
}

describe('LeaderboardWidget', () => {
  it('renders nothing when ratings is null or disabled', () => {
    const { unmount } = renderAt(<LeaderboardWidget view={tripView()} />);
    expect(screen.queryByRole('region', { name: /Leaderboard|Player ratings/i })).toBeNull();
    unmount();

    renderAt(<LeaderboardWidget view={sportWithRatings({ [PIDS.M]: 10 }, false)} />);
    expect(screen.queryByRole('region', { name: /Leaderboard|Player ratings/i })).toBeNull();
  });

  it('renders Cold-Start empty state CTA when total group stars is 0', () => {
    renderAt(<LeaderboardWidget view={sportWithRatings({ [PIDS.M]: 0, [PIDS.A]: 0, [PIDS.B]: 0, [PIDS.C]: 0 })} />);
    expect(screen.getByText('No ratings yet')).toBeInTheDocument();
    const cta = screen.getByRole('link', { name: /Tap here to rate teammates/i });
    expect(cta).toHaveAttribute('href', '/t/t-1/ratings');
  });

  it('renders the radial Top 3 podium with #2 on the left, #1 in the center (largest), and #3 on the right', () => {
    const view = sportWithRatings({
      [PIDS.M]: 18, // #1 Minh
      [PIDS.A]: 14, // #2 An
      [PIDS.B]: 11, // #3 Bình
      [PIDS.C]: 4,
    });
    renderAt(<LeaderboardWidget view={view} />);

    const slots = document.querySelectorAll('[data-podium-rank]');
    expect(Array.from(slots).map((el) => el.getAttribute('data-podium-rank'))).toEqual(['2', '1', '3']);
    expect(slots[0]).toHaveTextContent('An');
    expect(slots[0]).toHaveTextContent('14');
    expect(slots[1]).toHaveTextContent('Minh');
    expect(slots[1]).toHaveTextContent('18');
    expect(slots[2]).toHaveTextContent('Bình');
    expect(slots[2]).toHaveTextContent('11');
  });

  it('transitions smoothly across full -> collapsed -> hidden on scroll, and supports manual collapse/expand', async () => {
    const view = sportWithRatings({
      [PIDS.M]: 18,
      [PIDS.A]: 14,
      [PIDS.B]: 11,
      [PIDS.C]: 0,
    });
    renderAt(<LeaderboardWidget view={view} />);
    const region = screen.getByRole('region', { name: 'Leaderboard' });
    expect(region).toHaveAttribute('data-stage', 'full');

    // Manual collapse toggle
    await userEvent.click(screen.getByRole('button', { name: 'Collapse leaderboard' }));
    expect(region).toHaveAttribute('data-stage', 'collapsed');
    await userEvent.click(screen.getByRole('button', { name: 'Expand leaderboard' }));
    expect(region).toHaveAttribute('data-stage', 'full');

    // Scroll to mid-range (100px) -> collapsed
    act(() => {
      Object.defineProperty(window, 'scrollY', { value: 100, writable: true, configurable: true });
      fireEvent.scroll(window);
    });
    expect(region).toHaveAttribute('data-stage', 'collapsed');

    // Scroll deep into expenses (260px) -> hidden completely
    act(() => {
      Object.defineProperty(window, 'scrollY', { value: 260, writable: true, configurable: true });
      fireEvent.scroll(window);
    });
    expect(region).toHaveAttribute('data-stage', 'hidden');

    // Scroll back to top (0px) -> full
    act(() => {
      Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true });
      fireEvent.scroll(window);
    });
    expect(region).toHaveAttribute('data-stage', 'full');
  });
});
