import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import {
  formatMoney,
  type AssetView,
  type CategoryView,
  type CurrencyCode,
  type EntryView,
  type ListRow,
  type WalletDetailView,
} from '@cc/core';
import { getLang, useT } from '@cc/web-i18n';
import { useCopyList } from '@cc/web-data-access/txCopy/hooks';
import { todayLocal } from '@cc/web-util/localDate';
import { Button } from '@cc/web-ui/components/Button';
import { Icon } from '@cc/web-ui/components/icons';
import { cn } from '@cc/web-ui/lib/utils';
import type { TransactionFilterValues } from '../TransactionFilters';
import { TransactionRow } from '../TransactionRow';

const PAGE_SIZE = 50;

export interface SearchResultsProps {
  filters: TransactionFilterValues;
  viewMode: 'day' | 'category';
  wallets: WalletDetailView[];
  categories: CategoryView[];
  assets: AssetView[];
  onOpenEntry?(entry: EntryView): void;
  onClear(): void;
}

interface RowGroup {
  id: string;
  title: string;
  rows: ListRow[];
  nets: { currency: CurrencyCode; net: number }[];
}

function rowDate(row: ListRow): string {
  return row.kind === 'entry' ? row.entry.date : row.date;
}

function rowKey(row: ListRow): string {
  return row.kind === 'entry' ? row.entry.id : `person-${row.id}`;
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
  rows: ListRow[],
): { currency: CurrencyCode; net: number }[] {
  const totals = new Map<CurrencyCode, number>();
  for (const row of rows) {
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
  return Array.from(totals.entries()).map(([currency, net]) => ({ currency, net }));
}

function CurrencyNetList({
  nets,
}: {
  nets: { currency: CurrencyCode; net: number }[];
}): JSX.Element | null {
  if (nets.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
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
  rows: ListRow[],
  viewMode: 'day' | 'category',
  categories: CategoryView[],
  lang: 'vi' | 'en',
  t: (key: string) => string,
  currentYear: number = Number(todayLocal().slice(0, 4)),
): RowGroup[] {
  if (rows.length === 0) return [];

  if (viewMode === 'day') {
    const byDay = new Map<string, ListRow[]>();
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
        nets: computeCurrencyNets(dayRows),
      }));
  }

  const catMap = new Map(categories.map((c) => [c.id, c.name]));
  const byCat = new Map<string, { title: string; rows: ListRow[] }>();
  for (const row of rows) {
    let key: string;
    let title: string;
    if (row.kind === 'person') {
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
    nets: computeCurrencyNets(group.rows),
  }));
}

export function SearchResults({
  filters,
  viewMode,
  wallets,
  categories,
  assets,
  onOpenEntry,
  onClear,
}: SearchResultsProps): JSX.Element {
  const t = useT();
  const lang = getLang();
  const copy = useCopyList(filters);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [
    filters.q,
    filters.tagId,
    filters.type,
    filters.walletId,
    filters.categoryId,
    filters.assetId,
    filters.from,
    filters.to,
    viewMode,
  ]);

  const rows = copy.rows;
  const totalRows = rows?.length ?? 0;
  const hasMore = copy.ready && visibleCount < totalRows;

  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, totalRows));
        }
      },
      { rootMargin: '120px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, totalRows]);

  const visibleRows = useMemo(
    () => (rows ? rows.slice(0, visibleCount) : []),
    [rows, visibleCount],
  );

  const currentYear = Number(todayLocal().slice(0, 4));
  const grouped = useMemo(
    () => groupRows(visibleRows, viewMode, categories, lang, t, currentYear),
    [visibleRows, viewMode, categories, lang, t, currentYear],
  );

  if (!copy.ready || !rows) {
    return <></>;
  }

  if (rows.length === 0) {
    return (
      <div
        data-testid="tx-no-match"
        className="py-8 px-4 flex flex-col items-center gap-3 text-center"
      >
        <Icon name="searchX" size={20} className="text-muted-foreground" />
        <p className="m-0 text-sm text-muted-foreground">
          {t('transactions.noMatch')}
        </p>
        <Button
          type="button"
          variant="secondary"
          data-testid="tx-clear-filters"
          onClick={onClear}
        >
          {t('transactions.clearFilters')}
        </Button>
      </div>
    );
  }

  return (
    <div className="fsl-tx-search-results flex flex-col gap-4" data-testid="tx-search-results">
      {grouped.map((group) => (
        <section
          key={group.id}
          data-testid={`tx-group-${group.id}`}
          className="fsl-tx-group flex flex-col gap-1.5"
        >
          <div className="fsl-tx-group__header flex items-center justify-between gap-2 px-1">
            <h3 className="m-0 text-xs font-semibold text-muted-foreground">
              {group.title}
            </h3>
            <CurrencyNetList nets={group.nets} />
          </div>
          <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
            {group.rows.map((row) => (
              <TransactionRow
                key={rowKey(row)}
                row={row}
                wallets={wallets}
                categories={categories}
                assets={assets}
                onOpenEntry={onOpenEntry}
              />
            ))}
          </div>
        </section>
      ))}
      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center pt-1">
          <Button
            type="button"
            variant="ghost"
            data-testid="tx-search-more"
            onClick={() => setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, totalRows))}
          >
            {t('transactions.loadMore')}
          </Button>
        </div>
      )}
    </div>
  );
}
