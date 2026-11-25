import type { JSX } from 'react';
import { useMemo } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts';
import { formatMoney, type ReportData } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { Card } from '@cc/web-ui/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@cc/web-ui/components/ui/chart';
import { Pill } from '@cc/web-ui/components/Pill';
import { cn } from '@cc/web-ui/lib/utils';
import { compactReportAmount } from './reportUrl';

export interface HealthTrendCardProps {
  report: ReportData;
}

export function HealthTrendCard({ report }: HealthTrendCardProps): JSX.Element {
  const t = useT();
  const approxPrefix = report.approximate ? '≈ ' : '';

  const { periodCmp, spentPctStr } = useMemo(() => {
    const d = report.previousDelta;
    let cmpText = '';
    if (report.period.inProgress) {
      cmpText =
        report.period.mode === 'month'
          ? t('reports.vsSamePeriodMonth')
          : t('reports.vsSamePeriod');
    } else {
      const p = report.period.previous;
      const prevLabel =
        report.period.mode === 'month'
          ? `${p.from.slice(5, 7)}/${p.from.slice(0, 4)}`
          : report.period.mode === 'year'
            ? p.from.slice(0, 4)
            : `${p.from.slice(8, 10)}/${p.from.slice(5, 7)}–${p.to.slice(8, 10)}/${p.to.slice(5, 7)}`;
      cmpText = t('reports.vsPreviousPeriod', { label: prevLabel });
    }

    const spentDiffSign = d.spentDiff > 0 ? '+' : d.spentDiff < 0 ? '-' : '';
    const spentDiffAbs = Math.abs(d.spentDiff);
    const pctStr =
      d.spentPct !== null
        ? `${d.spentPct > 0 ? '+' : ''}${d.spentPct}%`
        : `${spentDiffSign}${formatMoney(spentDiffAbs, report.currency)}`;

    return { periodCmp: cmpText, spentPctStr: pctStr };
  }, [report, t]);

  const chartConfig = useMemo(
    () =>
      ({
        income: {
          label: t('reports.legendIncome'),
          color: 'var(--success)',
        },
        expense: {
          label: t('reports.legendExpense'),
          color: 'var(--danger)',
        },
        avgIncome: {
          label: t('reports.legendAvgIncome', {
            count: String(report.baseline3m?.historyCount ?? 3),
          }),
          color: 'var(--subtle-foreground)',
        },
        avgExpense: {
          label: t('reports.legendAvgExpense', {
            count: String(report.baseline3m?.historyCount ?? 3),
          }),
          color: 'var(--subtle-foreground)',
        },
      }) satisfies ChartConfig,
    [report.baseline3m?.historyCount, t],
  );

  const activeExpensePoints = useMemo(
    () => report.healthSeries.filter((p) => p.expense !== null).length,
    [report.healthSeries],
  );
  const activeIncomePoints = useMemo(
    () => report.healthSeries.filter((p) => p.income !== null).length,
    [report.healthSeries],
  );

  return (
    <Card className="rounded-xl bg-card border border-border p-4 shadow-none ring-0 flex flex-col gap-3 w-full text-card-foreground">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-heading text-base font-semibold text-foreground">
          {t('reports.healthTitle')}
        </h3>
        <div className="flex items-center gap-1.5">
          <Pill tone="neutral">{t('reports.cumulativeSubtitle')}</Pill>
          {report.approximate && (
            <Pill tone="neutral">{t('reports.approximateVnd')}</Pill>
          )}
        </div>
      </div>

      {/* 3-column KPI strip */}
      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-xs text-muted-foreground truncate">
            {t('reports.spent')}
          </span>
          <span className="tabular-nums text-danger font-bold text-sm sm:text-base truncate">
            {approxPrefix}
            {formatMoney(report.totals.spent, report.currency)}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-xs text-muted-foreground truncate">
            {t('reports.income')}
          </span>
          <span className="tabular-nums text-success font-bold text-sm sm:text-base truncate">
            {approxPrefix}
            {formatMoney(report.totals.income, report.currency)}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-xs text-muted-foreground truncate">
            {t('reports.net')}
          </span>
          <span
            className={cn(
              'tabular-nums font-bold text-sm sm:text-base truncate',
              report.totals.net >= 0 ? 'text-success' : 'text-danger',
            )}
          >
            {report.totals.net > 0 ? '+' : report.totals.net < 0 ? '-' : ''}
            {approxPrefix}
            {formatMoney(Math.abs(report.totals.net), report.currency)}
          </span>
        </div>
      </div>

      {/* Plain-word comparison line below KPIs */}
      <div className="text-xs text-muted-foreground">
        {report.baseline3m === null &&
        report.previousDelta.previousSpent === 0 &&
        report.previousDelta.previousIncome === 0 ? (
          <span>{t('reports.noBaselineYet')}</span>
        ) : (
          <span>
            {t('reports.spent')}{' '}
            <span className="tabular-nums font-medium text-foreground">
              {spentPctStr}
            </span>{' '}
            {periodCmp}
            {report.baseline3m !== null ? (
              <>
                {' · '}
                {t('reports.vs3mAvg', {
                  count: String(report.baseline3m.historyCount),
                })}
                :{' '}
                <span className="tabular-nums font-medium text-foreground">
                  {approxPrefix}
                  {formatMoney(report.baseline3m.previousSpent, report.currency)}
                </span>
              </>
            ) : (
              <>
                {' · '}
                <span>{t('reports.noBaselineYet')}</span>
              </>
            )}
          </span>
        )}
      </div>

      {/* Health Trend Chart */}
      <ChartContainer
        config={chartConfig}
        className="h-44 w-full"
        aria-label={t('reports.healthTitle')}
      >
        <ComposedChart
          data={report.healthSeries}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        >
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            minTickGap={16}
          />
          <YAxis
            width={42}
            tickLine={false}
            axisLine={false}
            tickFormatter={compactReportAmount}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value, name) => (
                  <div className="flex flex-1 items-center justify-between gap-2">
                    <span className="text-muted-foreground">
                      {chartConfig[name as keyof typeof chartConfig]?.label ??
                        name}
                    </span>
                    <span className="font-mono font-medium text-foreground tabular-nums">
                      {approxPrefix}
                      {formatMoney(Number(value), report.currency)}
                    </span>
                  </div>
                )}
              />
            }
          />
          {report.baseline3m !== null && (
            <>
              <Area
                type="monotone"
                dataKey="avgIncome"
                stroke="var(--subtle-foreground)"
                fill="var(--subtle-foreground)"
                fillOpacity={0.14}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="avgExpense"
                stroke="var(--subtle-foreground)"
                fill="var(--subtle-foreground)"
                fillOpacity={0.09}
                strokeWidth={1.5}
                strokeDasharray="2 3"
                dot={false}
                isAnimationActive={false}
              />
            </>
          )}
          <Line
            type="monotone"
            dataKey="income"
            stroke="var(--success)"
            strokeWidth={2.5}
            dot={activeIncomePoints === 1 ? { r: 3 } : false}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="expense"
            stroke="var(--danger)"
            strokeWidth={2.5}
            dot={activeExpensePoints === 1 ? { r: 3 } : false}
            connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ChartContainer>

      {/* Accessible Legend */}
      <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground pt-1">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-[2px]"
            style={{ backgroundColor: 'var(--success)' }}
            aria-hidden="true"
          />
          <span>{t('reports.legendIncome')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-[2px]"
            style={{ backgroundColor: 'var(--danger)' }}
            aria-hidden="true"
          />
          <span>{t('reports.legendExpense')}</span>
        </div>
        {report.baseline3m !== null && (
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-[2px] border border-dashed border-subtle-foreground"
              style={{
                backgroundColor: 'var(--subtle-foreground)',
                opacity: 0.2,
              }}
              aria-hidden="true"
            />
            <span>
              {t('reports.legendAvgExpense', {
                count: String(report.baseline3m.historyCount),
              })}
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}
