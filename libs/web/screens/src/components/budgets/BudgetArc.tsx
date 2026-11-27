import type { JSX } from 'react';
import type { BudgetState } from '@cc/core';
import { cn } from '@cc/web-ui/lib/utils';

const STROKE_CLASS: Record<BudgetState, string> = {
  over: 'stroke-danger',
  fast: 'stroke-warning',
  near: 'stroke-warning',
  fine: 'stroke-primary',
};

const ARC_PATH = 'M20 110 A90 90 0 0 1 200 110';
const CX = 110;
const CY = 110;
const RADIUS = 90;
const ARC_LENGTH = Math.PI * RADIUS;

export interface BudgetArcProps {
  spent: number;
  limit: number;
  state: BudgetState;
  /** Percentage of the period elapsed (0..100). Omit for past periods. */
  todayPct?: number;
  className?: string;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(value, 1));
}

function radialPoint(share: number, r: number): { x: number; y: number } {
  const theta = Math.PI * (1 - clamp01(share));
  return {
    x: CX + r * Math.cos(theta),
    y: CY - r * Math.sin(theta),
  };
}

/** Half-ring progress arc for a budget's summary card. */
export function BudgetArc({
  spent,
  limit,
  state,
  todayPct,
  className,
}: BudgetArcProps): JSX.Element {
  const isOver = state === 'over' || spent > limit;
  const fillShare = !isOver && limit > 0 ? clamp01(spent / limit) : 0;
  const fillDash = ARC_LENGTH * fillShare;

  const limitBoundaryShare =
    isOver && spent > 0
      ? Math.max(0.5, limit > 0 ? Math.min(0.9, limit / spent) : 0.5)
      : 0;
  const limitDash = ARC_LENGTH * limitBoundaryShare;
  const limitInner = isOver ? radialPoint(limitBoundaryShare, RADIUS - 10) : null;
  const limitOuter = isOver ? radialPoint(limitBoundaryShare, RADIUS + 10) : null;

  const showToday = todayPct !== undefined && !isOver;
  const todayShare = showToday ? clamp01(todayPct / 100) : 0;
  const todayInner = showToday ? radialPoint(todayShare, RADIUS - 10) : null;
  const todayOuter = showToday ? radialPoint(todayShare, RADIUS + 10) : null;

  return (
    <svg
      viewBox="0 0 220 120"
      className={cn('fsl-budget-arc w-[264px] h-[144px]', className)}
      aria-hidden="true"
    >
      <path
        d={ARC_PATH}
        fill="none"
        className="stroke-muted"
        strokeWidth="14"
        strokeLinecap="round"
      />
      {isOver ? (
        <>
          <path
            d={ARC_PATH}
            fill="none"
            className="stroke-danger/35"
            strokeWidth="14"
            strokeLinecap="round"
          />
          <circle cx={20} cy={110} r={7} className="fill-danger" />
          <path
            d={ARC_PATH}
            fill="none"
            className="stroke-danger"
            strokeWidth="14"
            strokeLinecap="butt"
            strokeDasharray={`${limitDash} ${ARC_LENGTH}`}
          />
          {limitInner && limitOuter && (
            <line
              x1={limitInner.x}
              y1={limitInner.y}
              x2={limitOuter.x}
              y2={limitOuter.y}
              className="stroke-card"
              strokeWidth="2.5"
              strokeLinecap="butt"
            />
          )}
        </>
      ) : (
        fillShare > 0 && (
          <path
            d={ARC_PATH}
            fill="none"
            className={STROKE_CLASS[state]}
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={`${fillDash} ${ARC_LENGTH}`}
          />
        )
      )}
      {todayInner && todayOuter && (
        <line
          x1={todayInner.x}
          y1={todayInner.y}
          x2={todayOuter.x}
          y2={todayOuter.y}
          className="stroke-foreground"
          strokeWidth="2"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
