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
import { compactReportAmount } from './reportUrl';

export interface HealthTrendCardProps {
  report: ReportData;
}

export function HealthTrendCard({ report }: HealthTrendCardProps): JSX.Element {
  const t = useT();
  const approxPrefix = report.approximate ? '≈ ' : '';

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

      <p className="sr-only">
        {t('reports.healthChartSummary', {
          spent: `${approxPrefix}${formatMoney(report.totals.spent, report.currency)}`,
          income: `${approxPrefix}${formatMoney(report.totals.income, report.currency)}`,
        })}
      </p>

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
          <>
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
                {t('reports.legendAvgIncome', {
                  count: String(report.baseline3m.historyCount),
                })}
              </span>
            </div>
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
          </>
        )}
      </div>
    </Card>
  );
}
