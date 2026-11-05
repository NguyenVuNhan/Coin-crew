import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt } from '../../test/render';
import { PIDS, tripView } from '../../test/fixtures';
import { sportFundView } from '../../test/fundFixtures';
import { LeaderboardWidget } from '../LeaderboardWidget';

afterEach(() => {
  vi.unstubAllGlobals();
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

  const ratedView = () =>
    sportWithRatings({
      [PIDS.M]: 18,
      [PIDS.A]: 14,
      [PIDS.B]: 11,
      [PIDS.C]: 0,
    });
  const inFlow = () => document.querySelector('section.fsl-leaderboard') as HTMLElement;

  it('collapses and expands only when tapped', async () => {
    renderAt(<LeaderboardWidget view={ratedView()} />);
    expect(inFlow()).toHaveAttribute('data-stage', 'full');
    await userEvent.click(screen.getByRole('button', { name: 'Collapse leaderboard' }));
    expect(inFlow()).toHaveAttribute('data-stage', 'collapsed');
    await userEvent.click(screen.getByRole('button', { name: 'Expand leaderboard' }));
    expect(inFlow()).toHaveAttribute('data-stage', 'full');
  });

  it('scrolling never changes the in-flow widget', () => {
    renderAt(<LeaderboardWidget view={ratedView()} />);
    for (const y of [100, 260, 0]) {
      act(() => {
        Object.defineProperty(window, 'scrollY', { value: y, writable: true, configurable: true });
        fireEvent.scroll(window);
      });
      expect(inFlow()).toHaveAttribute('data-stage', 'full');
    }
  });

  it('the floating bar shows once the widget scrolls above the screen', () => {
    let report: ((entries: Partial<IntersectionObserverEntry>[]) => void) | null = null;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: (entries: Partial<IntersectionObserverEntry>[]) => void) {
          report = cb;
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    renderAt(<LeaderboardWidget view={ratedView()} />);
    expect(document.querySelector('.fsl-leaderboard__float')).toBeNull();
    act(() => report!([{ isIntersecting: false, boundingClientRect: { top: -50 } as DOMRect }]));
    expect(document.querySelector('.fsl-leaderboard__float')).not.toBeNull();
    expect(inFlow()).toHaveAttribute('data-stage', 'full');
    act(() => report!([{ isIntersecting: true, boundingClientRect: { top: 10 } as DOMRect }]));
    expect(document.querySelector('.fsl-leaderboard__float')).toBeNull();
  });

  it('no floating bar while the widget is below the screen', () => {
    let report: ((entries: Partial<IntersectionObserverEntry>[]) => void) | null = null;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: (entries: Partial<IntersectionObserverEntry>[]) => void) {
          report = cb;
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    renderAt(<LeaderboardWidget view={ratedView()} />);
    act(() => report!([{ isIntersecting: false, boundingClientRect: { top: 900 } as DOMRect }]));
    expect(document.querySelector('.fsl-leaderboard__float')).toBeNull();
  });

  it('the floating bar never shows without IntersectionObserver', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    renderAt(<LeaderboardWidget view={ratedView()} />);
    act(() => {
      Object.defineProperty(window, 'scrollY', { value: 260, writable: true, configurable: true });
      fireEvent.scroll(window);
    });
    expect(document.querySelector('.fsl-leaderboard__float')).toBeNull();
    expect(inFlow()).toHaveAttribute('data-stage', 'full');
  });
});
