import type { JSX } from 'react';
import {
  formatMoney,
  groupRowCategoryId,
  groupRowsTotals,
  type BookRow,
  type CategoryView,
  type CurrencyCode,
  type GroupRow,
  type GroupSettingsView,
} from '@cc/core';
import { todayLocal } from '@cc/web-util/localDate';
import { useT } from '@cc/web-i18n';
import { cn } from '@cc/web-ui/lib/utils';

const DEFAULT_GROUP_SETTINGS: GroupSettingsView = {
  defaultGroupCategoryId: null,
  countLoans: false,
};

const EMPTY_PAYBACKS = new Map<string, number>();

/** Day or category groups of /transactions rows, shared by the month list and the search results. */
export interface RowGroup {
  id: string;
  title: string;
  rows: BookRow[];
  nets: { currency: CurrencyCode; net: number }[];
  hasExcludedMovements?: boolean;
}

function hasExcludedMovementRows(rows: BookRow[]): boolean {
  return rows.some(
    (row) =>
      (row.kind === 'group' && row.source === 'payment') ||
      (row.kind === 'entry' &&
        (row.entry.type === 'transfer_in' || row.entry.type === 'transfer_out')),
  );
}

function rowDate(row: BookRow): string {
  return row.kind === 'entry' ? row.entry.date : row.date;
}

export function rowKey(row: BookRow): string {
  if (row.kind === 'entry') return row.entry.id;
  if (row.kind === 'group') return `g-${row.id}`;
  return `person-${row.id}`;
}

function formatDayHeader(dateStr: string, lang: 'vi' | 'en', currentYear: number): string {
  const [yStr, mStr, dStr] = dateStr.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(y, m - 1, d);
  const weekday = dt.toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US', {
    weekday: 'short',
  });
  const dayMonth = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
  return y === currentYear ? `${weekday}, ${dayMonth}` : `${weekday}, ${dayMonth}/${y}`;
}

function computeCurrencyNets(
  rows: BookRow[],
  settings: GroupSettingsView = DEFAULT_GROUP_SETTINGS,
): { currency: CurrencyCode; net: number }[] {
  const totals = new Map<CurrencyCode, number>();
  const groupRowsList: GroupRow[] = [];
  for (const row of rows) {
    if (row.kind === 'group') {
      groupRowsList.push(row);
      continue;
    }
    if (row.kind === 'person') {
      totals.set(row.currency, (totals.get(row.currency) ?? 0) - Math.abs(row.share));
      continue;
    }
    const e = row.entry;
    if (e.type === 'expense') {
      totals.set(e.currency, (totals.get(e.currency) ?? 0) - Math.abs(e.amount));
    } else if (e.type === 'income') {
      totals.set(e.currency, (totals.get(e.currency) ?? 0) + Math.abs(e.amount));
    }
  }
  if (groupRowsList.length > 0) {
    const { spent, income } = groupRowsTotals(groupRowsList, settings, EMPTY_PAYBACKS);
    if (spent > 0 || income > 0) {
      totals.set('VND', (totals.get('VND') ?? 0) + income - spent);
    }
  }
  return Array.from(totals.entries()).map(([currency, net]) => ({ currency, net }));
}

export function CurrencyNetList({
  nets,
  hasExcludedMovements = false,
}: {
  nets: { currency: CurrencyCode; net: number }[];
  hasExcludedMovements?: boolean;
}): JSX.Element | null {
  const t = useT();
  if (nets.length === 0) return null;
  const showPrefix = hasExcludedMovements;
  const prefixLabel =
    nets.length === 1 && nets[0]!.net < 0
      ? t('transactions.spendingNetLabel')
      : t('transactions.netLabel');
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {showPrefix && (
        <span className="text-xs font-normal text-muted-foreground whitespace-nowrap">
          {prefixLabel}
        </span>
      )}
      {nets.map(({ currency, net }) => {
        const absText = formatMoney(Math.abs(net), currency);
        const text =
          net > 0 ? `+${absText}` : net < 0 ? `\u2212${absText}` : absText;
        const tone =
          net > 0 ? 'text-success' : net < 0 ? 'text-danger' : 'text-foreground';
        return (
          <span
            key={currency}
            className={cn('text-xs font-semibold tabular-nums whitespace-nowrap', tone)}
          >
            {text}
          </span>
        );
      })}
    </div>
  );
}

export function groupRows(
  rows: BookRow[],
  viewMode: 'day' | 'category',
  categories: CategoryView[],
  lang: 'vi' | 'en',
  t: ReturnType<typeof useT>,
  currentYear: number = Number(todayLocal().slice(0, 4)),
  settings: GroupSettingsView = DEFAULT_GROUP_SETTINGS,
): RowGroup[] {
  if (rows.length === 0) return [];

  if (viewMode === 'day') {
    const byDay = new Map<string, BookRow[]>();
    for (const row of rows) {
      const d = rowDate(row);
      const list = byDay.get(d);
      if (list) list.push(row);
      else byDay.set(d, [row]);
    }
    return Array.from(byDay.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, dayRows]) => ({
        id: date,
        title: formatDayHeader(date, lang, currentYear),
        rows: dayRows,
        nets: computeCurrencyNets(dayRows, settings),
        hasExcludedMovements: hasExcludedMovementRows(dayRows),
      }));
  }

  const catMap = new Map(categories.map((c) => [c.id, c.name]));
  const fallbackGroupCat = categories.find((c) => c.type === 'expense' && c.name === 'Nhóm');
  const byCat = new Map<string, { title: string; rows: BookRow[] }>();
  for (const row of rows) {
    let key: string;
    let title: string;
    if (row.kind === 'group') {
      const catId = groupRowCategoryId(row, settings, null);
      if (catId && catMap.has(catId)) {
        key = `cat:${catId}`;
        title = catMap.get(catId)!;
      } else if (fallbackGroupCat) {
        key = `cat:${fallbackGroupCat.id}`;
        title = fallbackGroupCat.name;
      } else {
        key = 'cat:other';
        title = t('transactions.otherCategory');
      }
    } else if (row.kind === 'person') {
      key = 'person';
      title = t('transactions.typePerson');
    } else if (
      row.entry.type === 'transfer_in' ||
      row.entry.type === 'transfer_out'
    ) {
      key = 'transfer';
      title = t('personalEntry.transfer');
    } else if (row.entry.type === 'buy' || row.entry.type === 'sell') {
      key = 'trade';
      title = t('transactions.typeTrade');
    } else {
      key = `cat:${row.entry.categoryId ?? 'other'}`;
      title =
        (row.entry.categoryId ? catMap.get(row.entry.categoryId) : undefined) ??
        t('transactions.otherCategory');
    }
    const existing = byCat.get(key);
    if (existing) existing.rows.push(row);
    else byCat.set(key, { title, rows: [row] });
  }
  return Array.from(byCat.entries()).map(([id, group]) => ({
    id,
    title: group.title,
    rows: group.rows,
    nets: computeCurrencyNets(group.rows, settings),
    hasExcludedMovements: hasExcludedMovementRows(group.rows),
  }));
}

