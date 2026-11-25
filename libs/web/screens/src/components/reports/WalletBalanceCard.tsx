import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts';
import { formatMoney, type WalletBalanceSeriesResult } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { Card } from '@cc/web-ui/components/ui/card';
import { Pill } from '@cc/web-ui/components/Pill';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@cc/web-ui/components/ui/chart';
import { cn } from '@cc/web-ui/lib/utils';
import { compactReportAmount } from './reportUrl';

export interface WalletBalanceCardProps {
  balance: WalletBalanceSeriesResult;
}

export function WalletBalanceCard({ balance }: WalletBalanceCardProps) {
  const t = useT();

  const isNetPositiveOrZero = balance.netChange >= 0;
  const formattedNetChange =
    balance.netChange > 0
      ? `+${formatMoney(balance.netChange, balance.currency)}`
      : formatMoney(balance.netChange, balance.currency);

  const startDate = balance.points[0]?.date ?? '';
  const endDate = balance.points[balance.points.length - 1]?.date ?? '';

  return (
    <Card className="p-4 rounded-xl bg-card border border-border shadow-none ring-0 flex flex-col gap-3 w-full text-card-foreground">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-heading text-base font-semibold text-foreground">
          {t('reports.walletBalanceTitle')}
        </h3>
        <Pill tone="neutral">{balance.currency}</Pill>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground truncate">
            {t('reports.balanceOpening')}
          </span>
          <span className="text-sm font-bold tabular-nums text-foreground truncate">
            {formatMoney(balance.opening, balance.currency)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground truncate">
            {t('reports.balanceClosing')}
          </span>
          <span className="text-sm font-bold tabular-nums text-foreground truncate">
            {formatMoney(balance.closing, balance.currency)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground truncate">
            {t('reports.balanceNetChange')}
          </span>
          <span
            className={cn(
              'text-sm font-bold tabular-nums truncate',
              isNetPositiveOrZero ? 'text-success' : 'text-danger',
            )}
          >
            {formattedNetChange}
          </span>
        </div>
      </div>

      <ChartContainer
        config={{
          balance: {
            label: t('reports.walletBalanceTitle'),
            color: 'var(--primary)',
          },
        }}
        className="h-40 w-full"
        aria-label={t('reports.walletBalanceTitle')}
      >
        <AreaChart
          data={balance.points}
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
            width={44}
            tickLine={false}
            axisLine={false}
            tickFormatter={compactReportAmount}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value) => (
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="text-muted-foreground">
                      {t('reports.walletBalanceTitle')}
                    </span>
                    <span className="font-mono font-medium text-foreground tabular-nums">
                      {formatMoney(Number(value), balance.currency)}
                    </span>
                  </div>
                )}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="balance"
            stroke="var(--primary)"
            fill="var(--primary)"
            fillOpacity={0.14}
            strokeWidth={2.5}
            dot={balance.points.length <= 1 ? { r: 3 } : false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartContainer>

      <div className="grid grid-cols-2 gap-2 mt-1">
        <div className="flex flex-col rounded-xl bg-muted/40 p-2.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground gap-1">
            <span>{t('reports.checkpointStart')}</span>
            {startDate && (
              <span className="tabular-nums truncate">{startDate}</span>
            )}
          </div>
          <span className="text-sm font-bold tabular-nums text-foreground mt-0.5 truncate">
            {formatMoney(balance.opening, balance.currency)}
          </span>
        </div>

        <div className="flex flex-col rounded-xl bg-muted/40 p-2.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground gap-1">
            <span>{t('reports.checkpointMin')}</span>
            {balance.min.date && (
              <span className="tabular-nums truncate">{balance.min.date}</span>
            )}
          </div>
          <span
            className={cn(
              'text-sm font-bold tabular-nums mt-0.5 truncate',
              balance.min.value < 0 ? 'text-danger' : 'text-foreground',
            )}
          >
            {formatMoney(balance.min.value, balance.currency)}
          </span>
        </div>

        <div className="flex flex-col rounded-xl bg-muted/40 p-2.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground gap-1">
            <span>{t('reports.checkpointMax')}</span>
            {balance.max.date && (
              <span className="tabular-nums truncate">{balance.max.date}</span>
            )}
          </div>
          <span className="text-sm font-bold tabular-nums text-foreground mt-0.5 truncate">
            {formatMoney(balance.max.value, balance.currency)}
          </span>
        </div>

        <div className="flex flex-col rounded-xl bg-muted/40 p-2.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground gap-1">
            <span>{t('reports.checkpointEnd')}</span>
            {endDate && (
              <span className="tabular-nums truncate">{endDate}</span>
            )}
          </div>
          <span className="text-sm font-bold tabular-nums text-foreground mt-0.5 truncate">
            {formatMoney(balance.closing, balance.currency)}
          </span>
        </div>
      </div>
    </Card>
  );
}
