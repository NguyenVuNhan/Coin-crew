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
const ARC_LENGTH = Math.PI * 90;

export interface BudgetArcProps {
  /** Percentage of the limit spent, clamped to 0..100. */
  used: number;
  state: BudgetState;
  className?: string;
}

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(value, 100));
}

/** Half-ring progress arc for a budget's summary card. */
export function BudgetArc({ used, state, className }: BudgetArcProps): JSX.Element {
  const clamped = clampPct(used);
  const dash = (ARC_LENGTH * clamped) / 100;

  return (
    <svg
      viewBox="0 0 220 120"
      className={cn('fsl-budget-arc w-[220px] h-[120px]', className)}
      aria-hidden="true"
    >
      <path
        d={ARC_PATH}
        fill="none"
        className="stroke-muted"
        strokeWidth="14"
        strokeLinecap="round"
      />
      {clamped > 0 && (
        <path
          d={ARC_PATH}
          fill="none"
          className={STROKE_CLASS[state]}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${ARC_LENGTH}`}
        />
      )}
    </svg>
  );
}
