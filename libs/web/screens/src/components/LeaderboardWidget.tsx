import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { rankPlayers, type RankedPlayer, type TripView } from '@cc/core';
import { cn } from '@cc/web-ui/lib/utils';
import { buttonVariants } from '@cc/web-ui/components/ui/button';
import { useT } from '@cc/web-i18n';
import { useRatingsLink } from '../lib/detailsNav';
import { Avatar } from '@cc/web-ui/components/Avatar';
import { Icon } from '@cc/web-ui/components/icons';

export type WidgetStage = 'full' | 'collapsed';

/** The players who stand on the podium: the top 3 among those with at least one star. */
export function podiumPlayers(ranked: RankedPlayer[]): RankedPlayer[] {
  return ranked.filter((p) => p.stars > 0).slice(0, 3);
}

/**
 * Radial Top 3 Podium: #2 on the left, #1 in the center (largest avatar + crown), #3 on the right.
 * Only players with stars stand on it; a slot nobody has earned yet shows an anonymous avatar.
 */
export function PodiumTop3({
  players,
  renderScore,
}: {
  players: RankedPlayer[];
  renderScore?: (player: RankedPlayer) => ReactNode;
}) {
  const first = players[0] ?? null;
  const second = players[1] ?? null;
  const third = players[2] ?? null;

  const renderSlot = (player: RankedPlayer | null, rank: 1 | 2 | 3) => {
    const isFirst = rank === 1;
    return (
      <div
        key={rank}
        data-podium-rank={rank}
        className={cn(
          'fsl-podium__slot',
          `fsl-podium__slot--rank-${rank}`,
          'flex min-w-0 flex-col items-center text-center',
          isFirst ? 'z-10 flex-[1.25]' : 'flex-1',
        )}
      >
        {isFirst ? (
          <div className="fsl-podium__crown mb-1 flex items-center justify-center text-primary" aria-hidden="true">
            <Icon name="crown" size={22} />
          </div>
        ) : (
          <div className="fsl-podium__rank-num mb-1 text-sm font-bold tabular-nums text-muted-foreground" aria-hidden="true">
            <span>{rank}</span>
          </div>
        )}
        {player ? (
          <>
            <Avatar
              name={player.name}
              avatarUrl={player.avatarUrl}
              className={cn(
                'fsl-podium__avatar',
                `fsl-podium__avatar--rank-${rank}`,
                'transition-transform duration-200 motion-reduce:transition-none',
                isFirst
                  ? 'size-[68px] border-[3px] border-primary bg-secondary text-lg text-secondary-foreground shadow-xs'
                  : 'size-12 border-2 border-border text-base shadow-xs',
              )}
            />
            <span
              className={cn(
                'fsl-podium__name mt-2 max-w-full truncate text-foreground',
                isFirst ? 'text-sm font-bold' : 'text-xs font-semibold',
              )}
            >
              {player.name}
            </span>
            {renderScore ? (
              renderScore(player)
            ) : (
              <span
                className={cn(
                  'fsl-podium__score font-bold tabular-nums',
                  isFirst ? 'text-base text-foreground' : 'text-sm text-muted-foreground',
                )}
              >
                {`${player.stars} ★`}
              </span>
            )}
          </>
        ) : (
          <>
            <div
              className={cn(
                'fsl-podium__avatar fsl-podium__avatar--empty',
                `fsl-podium__avatar--rank-${rank}`,
                'inline-flex shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground',
                isFirst
                  ? 'size-[68px] border-[3px] border-primary/40 text-lg'
                  : 'size-12 border-2 border-border text-base',
              )}
              data-testid={`podium-anonymous-${rank}`}
              aria-hidden="true"
            >
              <Icon name="user" size={rank === 1 ? 32 : 24} />
            </div>
            <span className="fsl-podium__name fsl-podium__name--empty mt-2 max-w-full truncate text-xs font-semibold text-muted-foreground">
              —
            </span>
            <span className="fsl-podium__score fsl-podium__score--empty text-sm font-bold tabular-nums text-muted-foreground">
              0 ★
            </span>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="fsl-podium flex items-end justify-center gap-2 py-1">
      {renderSlot(second, 2)}
      {renderSlot(first, 1)}
      {renderSlot(third, 3)}
    </div>
  );
}

/** The one-line summary (#1 · #2 · #3) with an expand button: the collapsed widget and the floating bar. */
function LeaderboardBar({
  top3,
  ratingsLink,
  onExpand,
  className,
}: {
  top3: RankedPlayer[];
  ratingsLink: ReturnType<typeof useRatingsLink>;
  onExpand: () => void;
  className?: string;
}) {
  const t = useT();
  return (
    <div className={cn('fsl-leaderboard__bar min-h-11 items-center justify-between gap-2', className)}>
      <Link
        className="fsl-leaderboard__bar-link inline-flex min-h-11 flex-1 min-w-0 items-center gap-2 rounded-lg text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        {...ratingsLink}
      >
        <Icon name="trophy" size={16} className="fsl-leaderboard__trophy shrink-0 text-primary" />
        <span className="fsl-leaderboard__bar-summary flex-1 min-w-0 truncate text-xs tabular-nums">
          {top3.map((p, idx) => (
            <span
              key={p.id}
              className={cn(
                idx === 0
                  ? 'fsl-leaderboard__bar-first font-bold text-foreground'
                  : 'fsl-leaderboard__bar-item font-medium text-muted-foreground',
              )}
            >
              {idx > 0 ? ' · ' : ''}
              {`#${p.rank} ${p.name} ${p.stars}★`}
            </span>
          ))}
        </span>
      </Link>
      <button
        type="button"
        className="fsl-leaderboard__toggle inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-transparent text-muted-foreground transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label={t('ratings.expand')}
        title={t('ratings.expand')}
        onClick={onExpand}
      >
        <Icon name="chevronDown" size={18} />
      </button>
    </div>
  );
}

/**
 * Sport group Leaderboard Widget at the top of MemberTrip, GuestTrip, and ViewOnlyTrip.
 * Full podium, or a collapsed bar when the person taps collapse. Scrolling never changes its
 * height: once it has scrolled above the screen, a floating copy of the bar shows instead.
 */
export function LeaderboardWidget({
  view,
  switching = false,
}: {
  view: TripView;
  switching?: boolean;
}) {
  const t = useT();
  const ratingsLink = useRatingsLink(view.trip.id, switching);
  const [stage, setStage] = useState<WidgetStage>('full');
  const [aboveScreen, setAboveScreen] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  const ratings = view.trip.preset === 'sport' && view.ratings?.enabled ? view.ratings : null;
  const ranked = ratings ? rankPlayers(view.people, ratings.totalStars) : [];
  const totalGroupStars = ranked.reduce((sum, p) => sum + p.stars, 0);
  const rated = ratings !== null && totalGroupStars !== 0;

  useEffect(() => {
    const section = sectionRef.current;
    // Old WebViews have no IntersectionObserver: no floating bar there.
    if (!section || typeof IntersectionObserver === 'undefined') return;
    const headerHeight = document.querySelector<HTMLElement>('.fsl-screen__header')?.offsetHeight ?? 0;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry) {
          setAboveScreen(!entry.isIntersecting && entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0));
        }
      },
      { rootMargin: `-${headerHeight}px 0px 0px 0px` },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, [rated]);

  if (!ratings) {
    return null;
  }

  if (!rated) {
    return (
      <section
        className="fsl-leaderboard fsl-leaderboard--cold flex flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-xs"
        aria-label={t('ratings.title')}
      >
        <div className="fsl-leaderboard__head flex items-center justify-between gap-2">
          <div className="fsl-leaderboard__title-group inline-flex min-w-0 items-center gap-2">
            <Icon name="trophy" size={18} className="fsl-leaderboard__trophy shrink-0 text-primary" />
            <span className="fsl-leaderboard__title truncate text-sm font-semibold text-foreground">
              {t('ratings.title')}
            </span>
          </div>
        </div>
        <p className="fsl-leaderboard__cold-title m-0 text-base font-semibold text-foreground">
          {t('ratings.coldTitle')}
        </p>
        <p className="fsl-leaderboard__cold-body m-0 mb-1 text-sm text-muted-foreground">
          {t('ratings.coldBody')}
        </p>
        <Link
          className={cn(
            buttonVariants({ variant: 'default' }),
            'fsl-button fsl-button--primary fsl-button--block min-h-11 w-full',
          )}
          {...ratingsLink}
        >
          {`★ ${t('ratings.coldCta')}`}
        </Link>
      </section>
    );
  }

  const top3 = podiumPlayers(ranked);

  const expandFromFloat = () => {
    const behavior =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth';
    sectionRef.current?.scrollIntoView({ block: 'start', behavior });
    setStage('full');
  };

  return (
    <>
      <section
        ref={sectionRef}
        className={cn(
          'fsl-leaderboard',
          `fsl-leaderboard--${stage}`,
          // Keeps the scrolled-to widget below the sticky 56px screen header (taller by Zalo's safe-area inset in the Mini App).
          'scroll-mt-[calc(4rem+var(--zmp-safe-top))] overflow-hidden rounded-xl border transition-all duration-200 motion-reduce:transition-none',
          stage === 'full' && 'fsl-leaderboard--full max-h-[340px] border-border bg-card px-4 pt-3 pb-4 shadow-xs',
          stage === 'collapsed' && 'fsl-leaderboard--collapsed max-h-[60px] border-border bg-card px-3 py-1 shadow-xs',
        )}
        data-stage={stage}
        aria-label={t('ratings.leaderboard')}
      >
        {/* Full Radial Podium */}
        <div
          className={cn(
            'fsl-leaderboard__full flex flex-col gap-2 transition-all duration-200 motion-reduce:transition-none',
            stage !== 'full' && 'pointer-events-none max-h-0 scale-95 overflow-hidden opacity-0',
          )}
        >
          <div className="fsl-leaderboard__head flex items-center justify-between gap-2">
            <div className="fsl-leaderboard__title-group inline-flex min-w-0 items-center gap-2">
              <Icon name="trophy" size={18} className="fsl-leaderboard__trophy shrink-0 text-primary" />
              <span className="fsl-leaderboard__title truncate text-sm font-semibold text-foreground">
                {t('ratings.leaderboard')}
              </span>
            </div>
            <div className="fsl-leaderboard__actions inline-flex shrink-0 items-center gap-1">
              <Link
                className="fsl-leaderboard__rate-link inline-flex min-h-11 items-center gap-1 rounded-full bg-secondary px-3 text-xs font-semibold text-secondary-foreground transition-colors hover:bg-secondary/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                {...ratingsLink}
              >
                <span>{t('ratings.rateAction')}</span>
                <Icon name="chevronRight" size={16} />
              </Link>
              <button
                type="button"
                className="fsl-leaderboard__toggle inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-transparent text-muted-foreground transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                aria-label={t('ratings.collapse')}
                title={t('ratings.collapse')}
                onClick={() => setStage('collapsed')}
              >
                <Icon name="chevronUp" size={18} />
              </button>
            </div>
          </div>

          <p className="fsl-leaderboard__quote m-0 text-center text-xs text-muted-foreground">{`“${t('ratings.quote')}”`}</p>

          <Link
            className="fsl-leaderboard__podium-link block rounded-xl text-inherit focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            {...ratingsLink}
          >
            <PodiumTop3 players={top3} />
          </Link>
        </div>

        {/* Collapsed Summary Bar */}
        <LeaderboardBar
          top3={top3}
          ratingsLink={ratingsLink}
          onExpand={() => setStage('full')}
          className={stage === 'collapsed' ? 'flex' : 'hidden'}
        />
      </section>

      {/* Floating bar: only while the widget is above the screen */}
      {aboveScreen && (
        <div
          className="fsl-leaderboard__float fixed inset-x-0 top-[calc(3.5rem+var(--zmp-safe-top))] z-10 mx-auto max-w-[480px] px-4 lg:hidden animate-in fade-in motion-reduce:animate-none"
          role="region"
          aria-label={t('ratings.leaderboardBar')}
        >
          <div className="rounded-xl border border-border bg-card px-3 py-1 shadow-lg">
            <LeaderboardBar top3={top3} ratingsLink={ratingsLink} onExpand={expandFromFloat} className="flex" />
          </div>
        </div>
      )}
    </>
  );
}
