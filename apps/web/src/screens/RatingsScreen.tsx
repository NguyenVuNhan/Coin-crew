import { useEffect, useRef, useState } from 'react';
import {
  can,
  normalizeName,
  rankPlayers,
  ratingBudget,
  type RankedPlayer,
  type TripView,
} from '@fsl/core';
import {
  RATING_INITIAL_VISIBLE,
  RATING_MAX_STARS_PER_TARGET,
  RATING_SEARCH_THRESHOLD,
} from '../config';
import { useT } from '../i18n';
import { actorOf } from '../lib/rowActions';
import { useBackToTrip } from '../lib/detailsNav';
import { useTripAction } from '../lib/useTripAction';
import { Screen } from '../components/Screen';
import { Avatar } from '../components/Avatar';
import { Pill } from '../components/Pill';
import { Icon } from '../components/icons';
import { InlineError } from '../components/InlineError';
import { PodiumTop3, podiumPlayers } from '../components/LeaderboardWidget';
import './RatingsScreen.css';

/**
 * Pure function that builds a 24x24 SVG `<path d="...">` morphing a 5-pointed star
 * (progress = 0) directly into a smooth solar circle (progress = 1) with no wrapper circle.
 */
export function buildStarSolarPath(progress: number): string {
  const p = Math.max(0, Math.min(1, progress));
  const cx = 12;
  const cy = 12;
  const rOut = 9.8;
  const rIn = 4.2 + (rOut - 4.2) * p;
  const steps = 20;
  const pts: string[] = [];
  for (let i = 0; i < steps; i++) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / steps;
    const mod = i % 4;
    let r: number;
    if (mod === 0) {
      r = rOut;
    } else if (mod === 2) {
      r = rIn;
    } else {
      const midStar = (rOut + 4.2) * 0.48;
      r = midStar + (rOut - midStar) * p;
    }
    const x = (cx + r * Math.cos(angle)).toFixed(2);
    const y = (cy + r * Math.sin(angle)).toFixed(2);
    pts.push(`${i === 0 ? 'M' : 'L'}${x},${y}`);
  }
  return `${pts.join(' ')} Z`;
}

export interface StarVoteProps {
  player: { id: string; name: string; stars: number };
  myStars: number;
  canRate: boolean;
  isMe: boolean;
  tripArchived: boolean;
  remainingStars: number;
  overBudgetBy: number;
  busy: boolean;
  onAdd: (targetParticipantId: string) => void;
  onReset: (targetParticipantId: string) => void;
}

export function StarVote({
  player,
  myStars,
  canRate,
  isMe,
  tripArchived,
  remainingStars,
  overBudgetBy,
  busy,
  onAdd,
  onReset,
}: StarVoteProps) {
  const t = useT();
  const [morphProgress, setMorphProgress] = useState(0);
  const [isPopping, setIsPopping] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [isExploding, setIsExploding] = useState(false);

  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const popTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const explodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const explodedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
      if (popTimerRef.current) clearTimeout(popTimerRef.current);
      if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
      if (explodeTimerRef.current) clearTimeout(explodeTimerRef.current);
    };
  }, []);

  if (!canRate) {
    return (
      <span className="fsl-star-vote fsl-star-vote--readonly">
        <span className="fsl-star-vote__num">{player.stars}</span>
        <span className="fsl-star-vote__icon-wrap">
          <svg className="fsl-star-vote__svg" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d={buildStarSolarPath(0)}
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </span>
    );
  }

  const canAddStar =
    !isMe &&
    !tripArchived &&
    remainingStars > 0 &&
    overBudgetBy === 0 &&
    myStars < RATING_MAX_STARS_PER_TARGET;
  const canHoldReset = !isMe && !tripArchived && myStars > 0;

  const handlePointerDown = () => {
    explodedRef.current = false;
    if (!canHoldReset || busy) return;

    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
    }
    let step = 0;
    holdIntervalRef.current = setInterval(() => {
      step += 1;
      const progress = Math.min(1, step / 14);
      setMorphProgress(progress);
      if (step >= 14) {
        if (holdIntervalRef.current) {
          clearInterval(holdIntervalRef.current);
          holdIntervalRef.current = null;
        }
        explodedRef.current = true;
        setMorphProgress(0);
        setIsExploding(true);
        if (explodeTimerRef.current) clearTimeout(explodeTimerRef.current);
        explodeTimerRef.current = setTimeout(() => {
          setIsExploding(false);
          explodeTimerRef.current = null;
        }, 380);
        onReset(player.id);
      }
    }, 50);
  };

  const cancelHold = () => {
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
      setMorphProgress(0);
    }
  };

  const handleClick = () => {
    if (explodedRef.current) {
      explodedRef.current = false;
      return;
    }
    if (canAddStar) {
      if (busy) return;
      setIsPopping(true);
      if (popTimerRef.current) clearTimeout(popTimerRef.current);
      popTimerRef.current = setTimeout(() => {
        setIsPopping(false);
        popTimerRef.current = null;
      }, 260);
      onAdd(player.id);
    } else {
      setIsShaking(true);
      if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
      shakeTimerRef.current = setTimeout(() => {
        setIsShaking(false);
        shakeTimerRef.current = null;
      }, 320);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (
      (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') &&
      canHoldReset &&
      !busy
    ) {
      e.preventDefault();
      setIsExploding(true);
      if (explodeTimerRef.current) clearTimeout(explodeTimerRef.current);
      explodeTimerRef.current = setTimeout(() => {
        setIsExploding(false);
        explodeTimerRef.current = null;
      }, 380);
      onReset(player.id);
    }
  };

  const className = [
    'fsl-star-vote',
    myStars > 0 ? 'fsl-star-vote--has-mine' : '',
    isPopping ? 'fsl-star-vote--popping' : '',
    isShaking ? 'fsl-star-vote--shaking' : '',
    morphProgress > 0 ? 'fsl-star-vote--holding' : '',
    isExploding ? 'fsl-star-vote--exploding' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      data-testid={`star-vote-${player.id}`}
      data-my-stars={myStars}
      data-morph-progress={morphProgress.toFixed(2)}
      className={className}
      aria-label={t('ratings.giveStar', { name: player.name })}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      onPointerCancel={cancelHold}
      onKeyDown={handleKeyDown}
    >
      <span className="fsl-star-vote__num">{player.stars}</span>
      <span className="fsl-star-vote__icon-wrap">
        <svg
          className="fsl-star-vote__svg"
          viewBox="0 0 24 24"
          aria-hidden="true"
          style={
            morphProgress > 0
              ? { transform: `scale(${(1 + morphProgress * 0.65).toFixed(2)})` }
              : undefined
          }
        >
          <path
            className="fsl-star-vote__path"
            d={buildStarSolarPath(morphProgress)}
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
        {isExploding && (
          <span
            className="fsl-solar-sparks"
            data-testid={`solar-sparks-${player.id}`}
            aria-hidden="true"
          >
            {Array.from({ length: 8 }, (_, i) => (
              <span key={i} className="fsl-solar-spark" data-spark-idx={i} />
            ))}
          </span>
        )}
      </span>
    </button>
  );
}

export function RatingsPanel({ view }: { view: TripView }) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const { busy, error, run } = useTripAction(view.trip.id);

  const ratings = view.ratings;
  const totalStars = ratings?.totalStars ?? {};
  const myAllocations = ratings?.myAllocations ?? {};

  const ranked = rankPlayers(view.people, totalStars);
  const { maxStars, spentStars, remainingStars, overBudgetBy } = ratingBudget(
    ranked.length,
    myAllocations,
  );

  const actor = actorOf(view);
  const isMember = view.me.kind === 'member';
  const canRate = can(actor, 'rate_player') && !view.trip.archived && Boolean(ratings?.enabled);
  const showSearch = ranked.length > RATING_SEARCH_THRESHOLD;

  const trimmedQuery = query.trim();
  const normQuery = normalizeName(trimmedQuery);
  const top3 = podiumPlayers(ranked);
  const podiumIds = new Set(top3.map((p) => p.id));
  // The list continues below the podium (#4 onwards); a search looks through everyone, podium included.
  const filtered =
    normQuery.length > 0
      ? ranked.filter((p) => normalizeName(p.name).includes(normQuery))
      : ranked.filter((p) => !podiumIds.has(p.id));

  const isSearching = normQuery.length > 0;
  const visibleRows =
    isSearching || showAll
      ? filtered
      : filtered.slice(0, RATING_INITIAL_VISIBLE);

  const hasMoreToReveal = !isSearching && !showAll && filtered.length > RATING_INITIAL_VISIBLE;

  const handleAdd = (targetParticipantId: string) => {
    void run('/ratings', { targetParticipantId, delta: 1 });
  };

  const handleReset = (targetParticipantId: string) => {
    void run('/ratings', { targetParticipantId, stars: 0 });
  };

  const renderStarVote = (p: RankedPlayer) => {
    const isMe = p.id === view.me.participantId;
    const myStars = myAllocations[p.id] ?? 0;
    return (
      <StarVote
        player={p}
        myStars={myStars}
        canRate={canRate}
        isMe={isMe}
        tripArchived={view.trip.archived}
        remainingStars={remainingStars}
        overBudgetBy={overBudgetBy}
        busy={busy}
        onAdd={handleAdd}
        onReset={handleReset}
      />
    );
  };

  return (
    <div className="fsl-ratings">
      {/* 1. Radial Top 3 Podium Card */}
      <div className="fsl-ratings__podium-card">
        <p className="fsl-ratings__quote">{`“${t('ratings.quote')}”`}</p>
        <PodiumTop3 players={top3} renderScore={(p) => renderStarVote(p)} />
      </div>

      {/* 2. "Your Star Wallet" Sticky Bar (for members) / Guest Sign-in Banner */}
      {isMember ? (
        <div
          className={`fsl-ratings__budget${overBudgetBy > 0 ? ' fsl-ratings__budget--warning' : ''}`}
          role={overBudgetBy > 0 ? 'status' : undefined}
        >
          <div className="fsl-ratings__budget-head">
            <span className="fsl-ratings__budget-title">
              {overBudgetBy > 0
                ? t('ratings.overBudgetTitle')
                : t('ratings.budgetTitle')}
            </span>
            <span
              className={`fsl-ratings__budget-pill${overBudgetBy > 0 ? ' fsl-ratings__budget-pill--warning' : ''}`}
            >
              {t('ratings.budgetLeft', {
                remaining: overBudgetBy > 0 ? 0 : remainingStars,
                max: maxStars,
              })}
            </span>
          </div>
          <div
            className="fsl-ratings__wallet-meter"
            role="progressbar"
            aria-valuenow={overBudgetBy > 0 ? 0 : remainingStars}
            aria-valuemin={0}
            aria-valuemax={maxStars}
          >
            <div
              className="fsl-ratings__wallet-fill"
              style={{
                width: `${
                  maxStars > 0
                    ? Math.min(
                        100,
                        Math.round(
                          ((overBudgetBy > 0 ? 0 : remainingStars) / maxStars) * 100,
                        ),
                      )
                    : 0
                }%`,
              }}
            />
          </div>
          <p className="fsl-ratings__budget-hint">
            {overBudgetBy > 0
              ? t('ratings.overBudgetHint', {
                  spent: spentStars,
                  max: maxStars,
                  over: overBudgetBy,
                })
              : t('ratings.budgetHint', {
                  maxPerPlayer: RATING_MAX_STARS_PER_TARGET,
                })}
          </p>
        </div>
      ) : view.me.kind === 'guest' && !view.trip.archived ? (
        <div className="fsl-ratings__guest-card">
          <p className="fsl-ratings__guest-title">{t('ratings.guestTitle')}</p>
          <p className="fsl-ratings__guest-body">{t('ratings.guestBody')}</p>
          <a
            href={`/api/auth/google/start?returnTo=${encodeURIComponent(`/t/${view.trip.id}/ratings`)}`}
            className="fsl-button fsl-button--secondary fsl-button--block"
          >
            {t('who.guestSignIn')}
          </a>
        </div>
      ) : null}

      {error ? <InlineError error={error} /> : null}

      {/* 3. Sticky Search Input */}
      {showSearch && (
        <div className="fsl-ratings__search-wrap">
          <div className="fsl-ratings__search-field">
            <Icon name="search" size={18} className="fsl-ratings__search-icon" />
            <input
              type="search"
              className="fsl-ratings__search-input"
              aria-label={t('ratings.searchLabel')}
              placeholder={t('ratings.searchPlaceholder', { count: ranked.length })}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* 4. Ranked Player List */}
      {visibleRows.length === 0 ? (
        isSearching ? (
          <p className="fsl-ratings__empty">
            {t('ratings.noSearchMatch', { query: trimmedQuery })}
          </p>
        ) : null
      ) : (
        <div className="fsl-ratings__list">
          {visibleRows.map((p) => {
            const isMe = p.id === view.me.participantId;

            return (
              <div key={p.id} className="fsl-ratings__row">
                <div className="fsl-ratings__person">
                  <span className="fsl-ratings__rank">{p.rank ?? ''}</span>
                  <Avatar name={p.name} avatarUrl={p.avatarUrl} />
                  <div className="fsl-ratings__meta">
                    <div className="fsl-ratings__name-line">
                      <span className="fsl-ratings__name">{p.name}</span>
                      {(p.gender === 'M' || p.gender === 'F') && (
                        <Pill tone="neutral">{p.gender}</Pill>
                      )}
                      {isMe && <Pill tone="neutral">{t('ratings.youBadge')}</Pill>}
                    </div>
                  </div>
                </div>

                {renderStarVote(p)}
              </div>
            );
          })}
        </div>
      )}

      {hasMoreToReveal && (
        <button
          type="button"
          className="fsl-button fsl-button--secondary fsl-button--block"
          onClick={() => setShowAll(true)}
        >
          {t('ratings.showAll', { count: ranked.length })}
        </button>
      )}
    </div>
  );
}

export function RatingsScreen({ view }: { view: TripView }) {
  const t = useT();
  const goBack = useBackToTrip(view.trip.id);
  return (
    <Screen title={t('ratings.title')} onBack={goBack}>
      <RatingsPanel view={view} />
    </Screen>
  );
}
