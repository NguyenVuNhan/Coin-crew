import type { JSX, MouseEvent } from 'react';
import { useId, useMemo, useState } from 'react';
import { Cell, Pie, PieChart } from 'recharts';
import {
  formatMoney,
  UNCATEGORIZED_CATEGORY_ID,
  type CurrencyCode,
  type ReportCategoryItem,
} from '@cc/core';
import { useT } from '@cc/web-i18n';
import { Card } from '@cc/web-ui/components/ui/card';
import {
  ChartContainer,
  type ChartConfig,
} from '@cc/web-ui/components/ui/chart';
import { Icon } from '@cc/web-ui/components/icons';
import { cn } from '@cc/web-ui/lib/utils';
import { resolveCategoryIcon } from '../TransactionRow';
import { compactReportAmount } from './reportUrl';

export const REPORT_SEGMENT_MAX = 4;

export function reportSegmentColor(idx: number): string {
  if (idx >= 0 && idx < REPORT_SEGMENT_MAX) {
    return `var(--chart-${idx + 1})`;
  }
  return 'var(--chart-other)';
}

export interface ReportSegment {
  key: string;
  amount: number;
  color: string;
}

export function groupReportSegments<
  T extends { categoryId: string; amount: number },
>(items: T[]): ReportSegment[] {
  if (items.length === 0) return [];
  const top = items.slice(0, REPORT_SEGMENT_MAX).map((item, idx) => ({
    key: item.categoryId,
    amount: item.amount,
    color: reportSegmentColor(idx),
  }));
  if (items.length <= REPORT_SEGMENT_MAX) {
    return top;
  }
  const otherAmount = items
    .slice(REPORT_SEGMENT_MAX)
    .reduce((sum, item) => sum + item.amount, 0);
  return [
    ...top,
    {
      key: 'other',
      amount: otherAmount,
      color: 'var(--chart-other)',
    },
  ];
}

export interface CategoryPiesCardProps {
  spending: ReportCategoryItem[];
  income: ReportCategoryItem[];
  currency: CurrencyCode;
  approximate: boolean;
  onSelectCategory: (categoryId: string) => void;
}

export function CategoryPiesCard({
  spending,
  income,
  currency,
  approximate,
  onSelectCategory,
}: CategoryPiesCardProps): JSX.Element {
  const t = useT();
  const [activeTab, setActiveTab] = useState<'expense' | 'income'>('expense');
  const expenseTotalId = useId();
  const incomeTotalId = useId();

  const approxPrefix = approximate ? '≈ ' : '';

  const totalSpending = useMemo(
    () => spending.reduce((sum, item) => sum + item.amount, 0),
    [spending],
  );
  const totalIncome = useMemo(
    () => income.reduce((sum, item) => sum + item.amount, 0),
    [income],
  );
  const spendingSegments = useMemo(
    () => groupReportSegments(spending),
    [spending],
  );
  const incomeSegments = useMemo(() => groupReportSegments(income), [income]);

  const donutConfig = useMemo(
    () =>
      ({
        spending: {
          label: t('reports.tabExpense'),
        },
        income: {
          label: t('reports.tabIncome'),
        },
      }) satisfies ChartConfig,
    [t],
  );

  const activeCategories = activeTab === 'expense' ? spending : income;

  return (
    <Card className="rounded-xl bg-card border border-border p-4 shadow-none ring-0 flex flex-col gap-4 w-full text-card-foreground">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-heading text-base font-semibold text-foreground">
          {t('reports.categoryTitle')}
        </h3>
        <span className="text-xs text-muted-foreground">
          {t('reports.viewCategoryHint')}
        </span>
      </div>

      {/* Two side-by-side compact donuts (NO duplicate captions underneath) */}
      <div className="grid grid-cols-2 gap-2">
        {/* Spending Donut Button */}
        <button
          type="button"
          aria-label={t('reports.tabExpense')}
          aria-describedby={expenseTotalId}
          aria-pressed={activeTab === 'expense'}
          onClick={() => setActiveTab('expense')}
          className={cn(
            'relative flex flex-col items-center justify-center p-1 rounded-xl min-h-11 transition-colors motion-reduce:transition-none cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            activeTab === 'expense'
              ? 'bg-muted'
              : 'bg-transparent hover:bg-muted/50',
          )}
        >
          <div className="relative w-full aspect-square mx-auto flex items-center justify-center">
            <ChartContainer
              config={donutConfig}
              className="size-full aspect-square"
              initialDimension={{ width: 160, height: 160 }}
            >
              <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                {spending.length === 0 ? (
                  <Pie
                    data={[{ name: 'empty', amount: 1 }]}
                    dataKey="amount"
                    cx="50%"
                    cy="50%"
                    innerRadius="62%"
                    outerRadius="98%"
                    stroke="none"
                    isAnimationActive={false}
                  >
                    <Cell fill="var(--muted)" />
                  </Pie>
                ) : (
                  <Pie
                    data={spendingSegments}
                    dataKey="amount"
                    nameKey="key"
                    cx="50%"
                    cy="50%"
                    innerRadius="62%"
                    outerRadius="98%"
                    stroke="var(--card)"
                    strokeWidth={2}
                    isAnimationActive={false}
                  >
                    {spendingSegments.map((seg) => (
                      <Cell
                        key={seg.key}
                        fill={seg.color}
                        onClick={(e?: MouseEvent) => {
                          e?.stopPropagation?.();
                          setActiveTab('expense');
                          if (seg.key !== 'other') {
                            onSelectCategory(seg.key);
                          }
                        }}
                      />
                    ))}
                  </Pie>
                )}
              </PieChart>
            </ChartContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center select-none">
              <span className="text-xs font-medium text-muted-foreground leading-none">
                {t('reports.legendExpense')}
              </span>
              <span className="text-sm font-bold text-foreground tabular-nums leading-tight mt-1 truncate max-w-[56%]">
                {approxPrefix}
                {compactReportAmount(totalSpending)}
              </span>
            </div>
          </div>
          <span id={expenseTotalId} className="sr-only">
            {approxPrefix}
            {formatMoney(totalSpending, currency)}
          </span>
        </button>

        {/* Income Donut Button */}
        <button
          type="button"
          aria-label={t('reports.tabIncome')}
          aria-describedby={incomeTotalId}
          aria-pressed={activeTab === 'income'}
          onClick={() => setActiveTab('income')}
          className={cn(
            'relative flex flex-col items-center justify-center p-1 rounded-xl min-h-11 transition-colors motion-reduce:transition-none cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            activeTab === 'income'
              ? 'bg-muted'
              : 'bg-transparent hover:bg-muted/50',
          )}
        >
          <div className="relative w-full aspect-square mx-auto flex items-center justify-center">
            <ChartContainer
              config={donutConfig}
              className="size-full aspect-square"
              initialDimension={{ width: 160, height: 160 }}
            >
              <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                {income.length === 0 ? (
                  <Pie
                    data={[{ name: 'empty', amount: 1 }]}
                    dataKey="amount"
                    cx="50%"
                    cy="50%"
                    innerRadius="62%"
                    outerRadius="98%"
                    stroke="none"
                    isAnimationActive={false}
                  >
                    <Cell fill="var(--muted)" />
                  </Pie>
                ) : (
                  <Pie
                    data={incomeSegments}
                    dataKey="amount"
                    nameKey="key"
                    cx="50%"
                    cy="50%"
                    innerRadius="62%"
                    outerRadius="98%"
                    stroke="var(--card)"
                    strokeWidth={2}
                    isAnimationActive={false}
                  >
                    {incomeSegments.map((seg) => (
                      <Cell
                        key={seg.key}
                        fill={seg.color}
                        onClick={(e?: MouseEvent) => {
                          e?.stopPropagation?.();
                          setActiveTab('income');
                          if (seg.key !== 'other') {
                            onSelectCategory(seg.key);
                          }
                        }}
                      />
                    ))}
                  </Pie>
                )}
              </PieChart>
            </ChartContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center select-none">
              <span className="text-xs font-medium text-muted-foreground leading-none">
                {t('reports.legendIncome')}
              </span>
              <span className="text-sm font-bold text-foreground tabular-nums leading-tight mt-1 truncate max-w-[56%]">
                {approxPrefix}
                {compactReportAmount(totalIncome)}
              </span>
            </div>
          </div>
          <span id={incomeTotalId} className="sr-only">
            {approxPrefix}
            {formatMoney(totalIncome, currency)}
          </span>
        </button>
      </div>

      {/* Ranked Category List */}
      {activeCategories.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground gap-1">
          <p className="text-sm">
            {activeTab === 'expense'
              ? t('reports.noExpenseCategory')
              : t('reports.noIncomeCategory')}
          </p>
          <span className="text-xs tabular-nums text-muted-foreground/75">
            {formatMoney(0, currency)}
          </span>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-border/40">
          {activeCategories.map((item, idx) => (
            <button
              key={item.categoryId}
              type="button"
              className="w-full min-h-12 flex items-center gap-3 py-2.5 px-2 rounded-lg text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors motion-reduce:transition-none cursor-pointer border-0 bg-transparent"
              onClick={() => onSelectCategory(item.categoryId)}
            >
              <span
                className="size-2.5 rounded-full shrink-0"
                style={{
                  backgroundColor: reportSegmentColor(idx),
                }}
                aria-hidden="true"
              />
              <Icon
                name={resolveCategoryIcon(item.icon)}
                size={18}
                className="text-muted-foreground shrink-0"
              />
              <span className="font-medium text-sm text-foreground truncate flex-1 min-w-0">
                {item.categoryId === UNCATEGORIZED_CATEGORY_ID
                  ? t('reports.uncategorized')
                  : item.name}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="tabular-nums text-sm font-semibold text-foreground">
                  {approxPrefix}
                  {formatMoney(item.amount, currency)}
                </span>
                <span className="tabular-nums text-xs text-muted-foreground min-w-[34px] text-right">
                  {item.percent}%
                </span>
                <Icon
                  name="chevronRight"
                  size={16}
                  className="text-muted-foreground shrink-0"
                />
              </div>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
