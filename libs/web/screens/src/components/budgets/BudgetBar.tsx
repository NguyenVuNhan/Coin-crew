import type { JSX } from 'react';
import type { BudgetState } from '@cc/core';
import { cn } from '@cc/web-ui/lib/utils';

const FILL_CLASS: Record<BudgetState, string> = {
  over: 'bg-danger',
  fast: 'bg-warning',
  near: 'bg-warning',
  fine: 'bg-primary',
};

export interface BudgetBarProps {
  state: BudgetState;
  /** Percentage of the limit spent, in 0..100. */
  used: number;
  /** Optional percentage of the period elapsed ("today" mark), in 0..100. */
  today?: number;
  /** Optional percentage added by an expense being entered, in 0..100. */
  adding?: number;
  className?: string;
}

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(value, 100));
}

/** Progress bar for a budget: spent fill, optional pending-expense preview, and a "today" tick. */
export function BudgetBar({
  state,
  used,
  today,
  adding = 0,
  className,
}: BudgetBarProps): JSX.Element {
  const u = clampPct(used);
  const a = clampPct(Math.min(adding, 100 - u));
  const td = today !== undefined ? clampPct(today) : undefined;
  const fill = FILL_CLASS[state];

  return (
    <div
      className={cn('fsl-budget-bar relative h-2 rounded-full bg-muted', className)}
      aria-hidden="true"
    >
      <div
        className={cn('absolute inset-y-0 left-0 rounded-full', fill)}
        style={{ width: `${u}%` }}
      />
      {a > 0 && (
        <div
          className={cn('absolute inset-y-0 rounded-r-full opacity-40', fill)}
          style={{ left: `${u}%`, width: `${a}%` }}
        />
      )}
      {td !== undefined && (
        <div
          className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-foreground"
          style={{ left: `${td}%` }}
        />
      )}
    </div>
  );
}
