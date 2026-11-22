import type { JSX, ReactNode } from 'react';
import { getLang, useT } from '@cc/web-i18n';
import { formatRangeLabel, matchQuickRange, type QuickRange } from '@cc/web-util/dateRanges';
import { Icon } from '@cc/web-ui/components/icons';

export interface PeriodRowProps {
  month: string;
  from?: string;
  to?: string;
  isSearching: boolean;
  today: string;
  onShiftMonth(delta: number): void;
  onOpenWhen(): void;
  onClearRange(): void;
  right: ReactNode;
}

const QUICK_RANGE_KEYS = {
  thisWeek: 'transactions.quickThisWeek',
  lastWeek: 'transactions.quickLastWeek',
  thisMonth: 'transactions.quickThisMonth',
  lastMonth: 'transactions.quickLastMonth',
  last30: 'transactions.quickLast30',
} as const satisfies Record<QuickRange, string>;

function formatMonthHeading(ym: string, lang: 'vi' | 'en'): string {
  const [yStr, mStr] = ym.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  if (lang === 'vi') {
    return `Tháng ${m}, ${y}`;
  }
  const date = new Date(y, m - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function PeriodRow({
  month,
  from,
  to,
  isSearching,
  today,
  onShiftMonth,
  onOpenWhen,
  onClearRange,
  right,
}: PeriodRowProps): JSX.Element {
  const t = useT();
  const lang = getLang();
  const hasRange = Boolean(from || to);

  let left: ReactNode;

  if (hasRange) {
    const matched = matchQuickRange(from, to, today);
    const label = matched ? t(QUICK_RANGE_KEYS[matched]) : formatRangeLabel(from, to, today);
    left = (
      <div className="flex items-center gap-1">
        <button
          type="button"
          data-testid="tx-range-button"
          onClick={onOpenWhen}
          className="group inline-flex min-h-11 items-center bg-transparent border-0 p-0 cursor-pointer focus-visible:outline-none"
        >
          <span className="inline-flex min-h-8 items-center gap-1 rounded-full border border-border bg-card pl-3 pr-2 text-sm font-medium text-foreground whitespace-nowrap transition-colors motion-reduce:transition-none group-hover:bg-muted group-focus-visible:ring-2 group-focus-visible:ring-ring">
            {label}
            <Icon name="chevronDown" size={16} className="text-muted-foreground shrink-0" />
          </span>
        </button>
        <button
          type="button"
          data-testid="tx-range-clear"
          aria-label={t('transactions.clearRange')}
          onClick={onClearRange}
          className="size-11 grid place-items-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors motion-reduce:transition-none cursor-pointer bg-transparent border-0"
        >
          <Icon name="x" size={16} />
        </button>
      </div>
    );
  } else if (isSearching) {
    left = (
      <button
        type="button"
        data-testid="tx-range-button"
        onClick={onOpenWhen}
        className="group inline-flex min-h-11 items-center bg-transparent border-0 p-0 cursor-pointer focus-visible:outline-none"
      >
        <span className="inline-flex min-h-8 items-center gap-1 rounded-full border border-border bg-card pl-3 pr-2 text-sm font-medium text-foreground whitespace-nowrap transition-colors motion-reduce:transition-none group-hover:bg-muted group-focus-visible:ring-2 group-focus-visible:ring-ring">
          {t('transactions.allTime')}
          <Icon name="chevronDown" size={16} className="text-muted-foreground shrink-0" />
        </span>
      </button>
    );
  } else {
    left = (
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          data-testid="month-prev"
          aria-label={t('transactions.prevMonth')}
          onClick={() => onShiftMonth(-1)}
          className="size-11 grid place-items-center rounded-full text-foreground hover:bg-muted transition-colors motion-reduce:transition-none cursor-pointer bg-transparent border-0"
        >
          <Icon name="chevronLeft" size={20} />
        </button>
        <button
          type="button"
          data-testid="tx-month-label"
          onClick={onOpenWhen}
          className="inline-flex min-h-11 items-center rounded-full px-1.5 text-sm font-semibold text-foreground whitespace-nowrap hover:bg-muted transition-colors motion-reduce:transition-none cursor-pointer bg-transparent border-0"
        >
          <span>{formatMonthHeading(month, lang)}</span>
        </button>
        <button
          type="button"
          data-testid="month-next"
          aria-label={t('transactions.nextMonth')}
          onClick={() => onShiftMonth(1)}
          className="size-11 grid place-items-center rounded-full text-foreground hover:bg-muted transition-colors motion-reduce:transition-none cursor-pointer bg-transparent border-0"
        >
          <Icon name="chevronRight" size={20} />
        </button>
      </div>
    );
  }

  return (
    <div className="fsl-tx-period flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
      {left}
      <div className="ml-auto shrink-0">{right}</div>
    </div>
  );
}
