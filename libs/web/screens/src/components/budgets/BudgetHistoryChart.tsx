import type { JSX } from 'react';
import { BUDGET_NEAR } from '@cc/core';
import { cn } from '@cc/web-ui/lib/utils';

export interface BudgetHistoryBar {
  key: string;
  label: string;
  spent: number;
  /** Optional limit for this period; draws a dashed line when provided. */
  limit?: number;
  /** Highlights the current/active column at full strength. */
  isCurrent?: boolean;
  /** Accessible label for the column. */
  ariaLabel: string;
}

export interface BudgetHistoryChartProps {
  bars: BudgetHistoryBar[];
  ariaLabel: string;
  className?: string;
}

const CHART_HEIGHT = 112;
const BAR_WIDTH = 30;
const BAR_GAP = 22;
const MAX_COLS = 6;
const VIEWBOX_WIDTH = MAX_COLS * (BAR_WIDTH + BAR_GAP);
const VIEWBOX_HEIGHT = CHART_HEIGHT + 26;

function barFillClass(spent: number, limit?: number): string {
  if (limit !== undefined && limit > 0) {
    if (spent > limit) return 'fill-danger';
    if (spent / limit >= BUDGET_NEAR) return 'fill-warning';
  }
  return 'fill-primary';
}

/** Column chart comparing spent vs. per-period limit (max 6 columns). */
export function BudgetHistoryChart({
  bars,
  ariaLabel,
  className,
}: BudgetHistoryChartProps): JSX.Element {
  const visible = bars.slice(-MAX_COLS);
  const rawMax = visible.reduce(
    (acc, b) => Math.max(acc, b.spent, b.limit ?? 0),
    0,
  );
  const scaleMax = rawMax > 0 ? rawMax * 1.1 : 1;
  const offsetX =
    11 + ((MAX_COLS - visible.length) * (BAR_WIDTH + BAR_GAP)) / 2;

  return (
    <svg
      data-testid="budget-history-chart"
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      className={cn('fsl-budget-history-chart w-full h-auto', className)}
      role="img"
      aria-label={ariaLabel}
    >
      {visible.map((bar, i) => {
        const x = offsetX + i * (BAR_WIDTH + BAR_GAP);
        const barH =
          bar.spent > 0
            ? Math.max(4, (Math.min(bar.spent, scaleMax) / scaleMax) * CHART_HEIGHT)
            : 0;
        const limitY =
          bar.limit !== undefined && bar.limit > 0
            ? CHART_HEIGHT - (Math.min(bar.limit, scaleMax) / scaleMax) * CHART_HEIGHT
            : null;
        const fill = barFillClass(bar.spent, bar.limit);

        return (
          <g
            key={bar.key}
            data-testid="budget-chart-col"
            aria-label={bar.ariaLabel}
          >
            {barH > 0 && (
              <rect
                x={x}
                y={CHART_HEIGHT - barH}
                width={BAR_WIDTH}
                height={barH}
                rx="6"
                className={cn(fill, !bar.isCurrent && 'opacity-60')}
              />
            )}
            {limitY !== null && (
              <line
                x1={x - 5}
                x2={x + BAR_WIDTH + 5}
                y1={limitY}
                y2={limitY}
                className="stroke-foreground"
                strokeWidth="2"
                strokeDasharray="4 3"
              />
            )}
            <text
              x={x + BAR_WIDTH / 2}
              y={CHART_HEIGHT + 18}
              textAnchor="middle"
              className={cn(
                'fill-muted-foreground text-xs',
                bar.isCurrent && 'fill-foreground font-semibold',
              )}
            >
              {bar.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
