import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { rankPlayers, type RankedPlayer, type TripView } from '@fsl/core';
import { useT } from '../i18n';
import { useRatingsLink } from '../lib/detailsNav';
import { Avatar } from './Avatar';
import { Icon } from './icons';
import './LeaderboardWidget.css';

const COLLAPSE_SCROLL_Y = 40;
const HIDE_SCROLL_Y = 200;
const RESTORE_SCROLL_Y = 20;

export type WidgetStage = 'full' | 'collapsed' | 'hidden';

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
        className={`fsl-podium__slot fsl-podium__slot--rank-${rank}`}
      >
        {isFirst ? (
          <div className="fsl-podium__crown" aria-hidden="true">
            <Icon name="crown" size={22} />
          </div>
        ) : (
          <div className="fsl-podium__rank-num" aria-hidden="true">
            <span>{rank}</span>
          </div>
        )}
        {player ? (
          <>
            <Avatar
              name={player.name}
              avatarUrl={player.avatarUrl}
              className={`fsl-podium__avatar fsl-podium__avatar--rank-${rank}`}
            />
            <span className="fsl-podium__name">{player.name}</span>
            {renderScore ? (
              renderScore(player)
            ) : (
              <span className="fsl-podium__score">{`${player.stars} ★`}</span>
            )}
          </>
        ) : (
          <>
            <div
              className={`fsl-podium__avatar fsl-podium__avatar--empty fsl-podium__avatar--rank-${rank}`}
              data-testid={`podium-anonymous-${rank}`}
              aria-hidden="true"
            >
              <Icon name="user" size={rank === 1 ? 32 : 24} />
            </div>
            <span className="fsl-podium__name fsl-podium__name--empty">—</span>
            <span className="fsl-podium__score fsl-podium__score--empty">0 ★</span>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="fsl-podium">
      {renderSlot(second, 2)}
      {renderSlot(first, 1)}
      {renderSlot(third, 3)}
    </div>
  );
}

/**
 * Sport group Leaderboard Widget at the top of MemberTrip, GuestTrip, and ViewOnlyTrip.
 * Smoothly transitions across 3 stages on scroll: Full Podium -> Collapsed Bar -> Hidden.
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
  const [scrollStage, setScrollStage] = useState<WidgetStage>('full');
  const [manualCollapsed, setManualCollapsed] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const y = typeof window !== 'undefined' ? window.scrollY : 0;
      if (y > HIDE_SCROLL_Y) {
        setScrollStage('hidden');
      } else if (y > COLLAPSE_SCROLL_Y) {
        setScrollStage('collapsed');
      } else if (y <= RESTORE_SCROLL_Y) {
        setScrollStage('full');
        setManualCollapsed(false);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (view.trip.preset !== 'sport' || !view.ratings?.enabled) {
    return null;
  }

  const ranked = rankPlayers(view.people, view.ratings.totalStars);
  const totalGroupStars = ranked.reduce((sum, p) => sum + p.stars, 0);

  if (totalGroupStars === 0) {
    return (
      <section className="fsl-leaderboard fsl-leaderboard--cold" aria-label={t('ratings.title')}>
        <div className="fsl-leaderboard__head">
          <div className="fsl-leaderboard__title-group">
            <Icon name="trophy" size={18} className="fsl-leaderboard__trophy" />
            <span className="fsl-leaderboard__title">{t('ratings.title')}</span>
          </div>
        </div>
        <p className="fsl-leaderboard__cold-title">{t('ratings.coldTitle')}</p>
        <p className="fsl-leaderboard__cold-body">{t('ratings.coldBody')}</p>
        <Link className="fsl-button fsl-button--primary fsl-button--block" {...ratingsLink}>
          {`★ ${t('ratings.coldCta')}`}
        </Link>
      </section>
    );
  }

  const stage: WidgetStage =
    scrollStage === 'hidden'
      ? 'hidden'
      : scrollStage === 'collapsed' || manualCollapsed
        ? 'collapsed'
        : 'full';

  const top3 = podiumPlayers(ranked);

  return (
    <section
      className={`fsl-leaderboard fsl-leaderboard--${stage}`}
      data-stage={stage}
      aria-label={t('ratings.leaderboard')}
      aria-hidden={stage === 'hidden' ? 'true' : undefined}
    >
      {/* Stage 1: Full Radial Podium */}
      <div className="fsl-leaderboard__full">
        <div className="fsl-leaderboard__head">
          <div className="fsl-leaderboard__title-group">
            <Icon name="trophy" size={18} className="fsl-leaderboard__trophy" />
            <span className="fsl-leaderboard__title">{t('ratings.leaderboard')}</span>
          </div>
          <div className="fsl-leaderboard__actions">
            <Link className="fsl-leaderboard__rate-link" {...ratingsLink}>
              <span>{t('ratings.rateAction')}</span>
              <Icon name="chevronRight" size={16} />
            </Link>
            <button
              type="button"
              className="fsl-leaderboard__toggle"
              aria-label={t('ratings.collapse')}
              title={t('ratings.collapse')}
              onClick={() => setManualCollapsed(true)}
            >
              <Icon name="chevronUp" size={18} />
            </button>
          </div>
        </div>

        <p className="fsl-leaderboard__quote">{`“${t('ratings.quote')}”`}</p>

        <Link className="fsl-leaderboard__podium-link" {...ratingsLink}>
          <PodiumTop3 players={top3} />
        </Link>
      </div>

      {/* Stage 2: Collapsed Summary Bar */}
      <div className="fsl-leaderboard__bar">
        <Link className="fsl-leaderboard__bar-link" {...ratingsLink}>
          <Icon name="trophy" size={16} className="fsl-leaderboard__trophy" />
          <span className="fsl-leaderboard__bar-summary">
            {top3.map((p, idx) => (
              <span key={p.id} className={idx === 0 ? 'fsl-leaderboard__bar-first' : 'fsl-leaderboard__bar-item'}>
                {idx > 0 ? ' · ' : ''}
                {`#${p.rank} ${p.name} ${p.stars}★`}
              </span>
            ))}
          </span>
        </Link>
        <button
          type="button"
          className="fsl-leaderboard__toggle"
          aria-label={t('ratings.expand')}
          title={t('ratings.expand')}
          onClick={() => {
            setManualCollapsed(false);
            setScrollStage('full');
          }}
        >
          <Icon name="chevronDown" size={18} />
        </button>
      </div>
    </section>
  );
}
