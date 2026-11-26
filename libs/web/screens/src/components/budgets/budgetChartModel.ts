import {
  formatMoney,
  type BudgetDef,
  type BudgetPeriod,
  type CountedSpendRow,
} from '@cc/core';
import type { useT } from '@cc/web-i18n';
import type { BudgetHistoryBar } from './BudgetHistoryChart';
import { diffDaysUtc, formatBudgetPeriodLabel } from './budgetLabels';

export const LONG_PERIOD_DAYS = 92;

export interface BudgetHistoryEntry {
  period: BudgetPeriod;
  limit: number;
  spent: number;
}

export interface BudgetChartModel {
  heading: string;
  ariaLabel: string;
  bars: BudgetHistoryBar[];
  showCaption: boolean;
}

export interface BuildBudgetChartModelInput {
  def: BudgetDef;
  shownItem: BudgetHistoryEntry;
  allPeriods: BudgetHistoryEntry[];
  countedRows: CountedSpendRow[];
  today: string;
  lang: 'vi' | 'en';
  t: ReturnType<typeof useT>;
}

/** Builds the history column chart model (max 6 periods, or per-year bars for periods > 92 days). */
export function buildBudgetChartModel({
  def,
  shownItem,
  allPeriods,
  countedRows,
  today,
  lang,
  t,
}: BuildBudgetChartModelInput): BudgetChartModel {
  const periodDays = diffDaysUtc(shownItem.period.from, shownItem.period.to) + 1;
  const isLongPeriod = periodDays > LONG_PERIOD_DAYS;

  if (isLongPeriod) {
    if (def.periodKind === 'year') {
      const recent = allPeriods.slice(0, 6).reverse();
      const bars: BudgetHistoryBar[] = recent.map((item) => {
        const yearLabel = item.period.from.slice(0, 4);
        return {
          key: item.period.from,
          label: yearLabel,
          spent: item.spent,
          limit: item.limit,
          isCurrent: item.period.from === shownItem.period.from,
          ariaLabel: t('budgets.chartBarAria', {
            label: yearLabel,
            spent: formatMoney(item.spent, def.currency),
            limit: formatMoney(item.limit, def.currency),
          }),
        };
      });
      return {
        heading: t('budgets.byYear'),
        ariaLabel: t('budgets.chartAriaByYear', { count: bars.length }),
        bars,
        showCaption: true,
      };
    }

    // Multi-month / multi-year once-budget: aggregate counted rows per year
    const startYear = Number(shownItem.period.from.slice(0, 4));
    const endYear = Number(shownItem.period.to.slice(0, 4));
    const spentByYear = new Map<number, number>();
    for (const row of countedRows) {
      const y = Number(row.date.slice(0, 4));
      spentByYear.set(y, (spentByYear.get(y) ?? 0) + row.amount);
    }
    const currentYear = Number(today.slice(0, 4));
    const years: number[] = [];
    for (let y = startYear; y <= endYear; y++) {
      years.push(y);
    }
    const visibleYears = years.slice(-6);
    const bars: BudgetHistoryBar[] = visibleYears.map((y) => {
      const spent = spentByYear.get(y) ?? 0;
      const label = String(y);
      return {
        key: label,
        label,
        spent,
        isCurrent: y === currentYear,
        ariaLabel: t('budgets.chartBarYearAria', {
          label,
          spent: formatMoney(spent, def.currency),
        }),
      };
    });
    return {
      heading: t('budgets.byYear'),
      ariaLabel: t('budgets.chartAriaByYear', { count: bars.length }),
      bars,
      showCaption: false,
    };
  }

  const recent = allPeriods.slice(0, 6).reverse();
  const bars: BudgetHistoryBar[] = recent.map((item) => {
    const label = formatBudgetPeriodLabel(def, item.period, lang, 'short');
    return {
      key: item.period.from,
      label,
      spent: item.spent,
      limit: item.limit,
      isCurrent: item.period.from === shownItem.period.from,
      ariaLabel: t('budgets.chartBarAria', {
        label,
        spent: formatMoney(item.spent, def.currency),
        limit: formatMoney(item.limit, def.currency),
      }),
    };
  });
  return {
    heading: t('budgets.recentPeriods'),
    ariaLabel: t('budgets.chartAria', { count: bars.length }),
    bars,
    showCaption: true,
  };
}
