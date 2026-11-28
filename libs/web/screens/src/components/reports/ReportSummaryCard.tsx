import type { JSX } from 'react';
import { formatMoney, type ReportData } from '@cc/core';
import { useT, type t as translateFn } from '@cc/web-i18n';
import { Card } from '@cc/web-ui/components/ui/card';
import { cn } from '@cc/web-ui/lib/utils';

export interface ReportSummaryCardProps {
  report: ReportData;
  hideComparison?: boolean;
}

function formatPreviousPeriodLabel(report: ReportData): string {
  const p = report.period.previous;
  if (report.period.mode === 'month') {
    return `${p.from.slice(5, 7)}/${p.from.slice(0, 4)}`;
  }
  if (report.period.mode === 'year') {
    return p.from.slice(0, 4);
  }
  return `${p.from.slice(8, 10)}/${p.from.slice(5, 7)}–${p.to.slice(8, 10)}/${p.to.slice(5, 7)}`;
}

function resolveComparisonTarget(
  report: ReportData,
  t: typeof translateFn,
  forZeroPrevSpend: boolean,
): string {
  if (report.period.inProgress) {
    if (report.period.mode === 'month') {
      return t('reports.summaryTargetSamePointMonth');
    }
    if (!forZeroPrevSpend && report.period.mode === 'year') {
      return t('reports.summaryTargetSamePointYear');
    }
    if (!forZeroPrevSpend && report.period.mode === 'week') {
      return t('reports.summaryTargetSamePointWeek');
    }
    return t(
      forZeroPrevSpend
        ? 'reports.summaryTargetSamePointAt'
        : 'reports.summaryTargetSamePoint',
    );
  }

  const label = formatPreviousPeriodLabel(report);
  if (report.period.mode === 'month') {
    return t(
      forZeroPrevSpend
        ? 'reports.summaryTargetInPeriodMonth'
        : 'reports.summaryTargetPeriodMonth',
      { label },
    );
  }
  if (report.period.mode === 'year') {
    return t(
      forZeroPrevSpend
        ? 'reports.summaryTargetInPeriodYear'
        : 'reports.summaryTargetPeriodYear',
      { label },
    );
  }
  return t(
    forZeroPrevSpend
      ? 'reports.summaryTargetInPeriod'
      : 'reports.summaryTargetPeriod',
    { label },
  );
}

/** Builds the plain-language spend comparison sentence for the report summary card. */
export function buildSpendComparison(
  report: ReportData,
  t: typeof translateFn,
): string {
  const { spentPct, previousSpent, previousIncome } = report.previousDelta;

  if (
    spentPct === null &&
    previousSpent === 0 &&
    previousIncome === 0 &&
    report.baseline3m === null
  ) {
    return t('reports.noBaselineYet');
  }

  if (spentPct === null) {
    const target = resolveComparisonTarget(report, t, true);
    return t('reports.summaryNoPrevSpend', { target });
  }

  const target = resolveComparisonTarget(report, t, false);
  if (spentPct > 0) {
    return t('reports.summaryMore', { pct: String(spentPct), target });
  }
  if (spentPct < 0) {
    return t('reports.summaryLess', {
      pct: String(Math.abs(spentPct)),
      target,
    });
  }
  return t('reports.summarySame', { target });
}

export function ReportSummaryCard({
  report,
  hideComparison = false,
}: ReportSummaryCardProps): JSX.Element {
  const t = useT();
  const approxPrefix = report.approximate ? '≈ ' : '';
  const netSign =
    report.totals.net > 0 ? '+' : report.totals.net < 0 ? '-' : '';
  const netColorClass =
    report.totals.net > 0
      ? 'text-success'
      : report.totals.net < 0
        ? 'text-danger'
        : 'text-foreground';

  const comparison = hideComparison ? null : buildSpendComparison(report, t);

  return (
    <Card
      data-testid="reports-summary"
      className="fsl-report-summary rounded-xl bg-card border border-border p-5 shadow-none ring-0 flex flex-col gap-2 w-full text-card-foreground"
    >
      <span className="text-sm font-medium text-muted-foreground">
        {t('reports.spent')}
      </span>
      <div className="text-3xl font-bold tabular-nums text-danger leading-tight">
        {approxPrefix}
        {formatMoney(report.totals.spent, report.currency)}
      </div>
      <div className="text-sm tabular-nums flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
        <span>
          {t('reports.income')}{' '}
          <span
            className={cn(
              'font-semibold',
              report.totals.income > 0 ? 'text-success' : 'text-foreground',
            )}
          >
            {approxPrefix}
            {formatMoney(report.totals.income, report.currency)}
          </span>
        </span>
        <span>
          {t('reports.net')}{' '}
          <span className={cn('font-semibold', netColorClass)}>
            {netSign}
            {approxPrefix}
            {formatMoney(Math.abs(report.totals.net), report.currency)}
          </span>
        </span>
      </div>
      {comparison !== null && (
        <p className="text-sm text-foreground">{comparison}</p>
      )}
      {!hideComparison && report.baseline3m !== null && (
        <p className="text-sm text-muted-foreground">
          {t('reports.summaryUsual', {
            count: String(report.baseline3m.historyCount),
            amount: `${approxPrefix}${formatMoney(report.baseline3m.previousSpent, report.currency)}`,
          })}
        </p>
      )}
    </Card>
  );
}
