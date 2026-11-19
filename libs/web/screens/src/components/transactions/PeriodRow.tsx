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
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-sm font-medium text-foreground transition-colors motion-reduce:transition-none hover:bg-muted cursor-pointer"
        >
          <span>{label}</span>
          <Icon name="chevronDown" size={16} className="text-muted-foreground shrink-0" />
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
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-sm font-medium text-foreground transition-colors motion-reduce:transition-none hover:bg-muted cursor-pointer"
      >
        <span>{t('transactions.allTime')}</span>
        <Icon name="chevronDown" size={16} className="text-muted-foreground shrink-0" />
      </button>
    );
  } else {
    left = (
      <div className="flex items-center gap-1">
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
          className="inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-sm font-semibold text-foreground hover:bg-muted transition-colors motion-reduce:transition-none cursor-pointer bg-transparent border-0"
        >
          <span>{formatMonthHeading(month, lang)}</span>
          <Icon name="chevronDown" size={16} className="text-muted-foreground shrink-0" />
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
    <div className="fsl-tx-period flex items-center justify-between gap-2">
      {left}
      {right}
    </div>
  );
}
