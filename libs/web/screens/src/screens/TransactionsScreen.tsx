import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { useSearchParams } from 'react-router';
import {
  formatMoney,
  type CategoryView,
  type CurrencyCode,
  type EntryView,
  type ListQuery,
  type ListRow,
  type WalletDetailView,
} from '@cc/core';
import { getLang, useT } from '@cc/web-i18n';
import { currentMonthLocal, todayLocal } from '@cc/web-util/localDate';
import {
  useCategories,
  usePersonalList,
  useTags,
  useWalletDetails,
} from '@cc/web-data-access/personalMoney';
import { useIsWide } from '@cc/web-util/media';
import { Button } from '@cc/web-ui/components/Button';
import { EmptyState } from '@cc/web-ui/components/EmptyState';
import { Icon } from '@cc/web-ui/components/icons';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { Modal } from '@cc/web-ui/components/Modal';
import { SkeletonList } from '@cc/web-ui/components/Skeleton';
import { Badge } from '@cc/web-ui/components/ui/badge';
import { cn } from '@cc/web-ui/lib/utils';
import { Screen } from '../components/Screen';
import {
  ActiveFilterPills,
  TransactionFilters,
  type TransactionFilterValues,
} from '../components/TransactionFilters';
import { TransactionRow } from '../components/TransactionRow';
import { TransactionDetailContent } from './TransactionDetail';

type ViewMode = 'day' | 'category';

const MIN_MONTH = '2000-01';

function shiftMonth(ym: string, delta: number): string {
  const [yStr, mStr] = ym.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(ym: string, lang: 'vi' | 'en'): string {
  const [yStr, mStr] = ym.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  if (lang === 'vi') {
    return `Tháng ${m}, ${y}`;
  }
  const date = new Date(y, m - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function formatDayHeader(dateStr: string, lang: 'vi' | 'en'): string {
  const [yStr, mStr, dStr] = dateStr.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(y, m - 1, d);
  const weekday = dt.toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US', {
    weekday: 'short',
  });
  return `${weekday}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
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

function rowDate(row: ListRow): string {
  return row.kind === 'entry' ? row.entry.date : row.date;
}

function rowKey(row: ListRow): string {
  return row.kind === 'entry' ? row.entry.id : `person-${row.id}`;
}

interface MonthBlockProps {
  month?: string;
  range?: { from: string; to: string };
  filters: TransactionFilterValues;
  viewMode: ViewMode;
  wallets: WalletDetailView[];
  categories: CategoryView[];
  isPrimaryMonth: boolean;
  hasActiveFilters: boolean;
  onClearFilters(): void;
  onOpenEntry?: (entry: EntryView) => void;
  onLoaded?: (month: string, isEmpty: boolean) => void;
}

function MonthBlock({
  month,
  range,
  filters,
  viewMode,
  wallets,
  categories,
  isPrimaryMonth,
  hasActiveFilters,
  onClearFilters,
  onOpenEntry,
  onLoaded,
}: MonthBlockProps): JSX.Element | null {
  const t = useT();
  const lang = getLang();
  const { from: _f, to: _t, ...restFilters } = filters;
  const query: ListQuery = range
    ? { ...restFilters, from: range.from, to: range.to }
    : { ...restFilters, month };
  const listQuery = usePersonalList(query);

  useEffect(() => {
    if (month && listQuery.isSuccess && onLoaded) {
      onLoaded(month, listQuery.data.rows.length === 0);
    }
  }, [month, listQuery.isSuccess, listQuery.data, onLoaded]);

  const grouped = useMemo(() => {
    const rows = listQuery.data?.rows ?? [];
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
        .map(([date, groupRows]) => ({
          id: date,
          title: formatDayHeader(date, lang),
          rows: groupRows,
          nets: computeCurrencyNets(groupRows),
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
  }, [listQuery.data?.rows, viewMode, categories, lang, t]);

  if (listQuery.isPending) {
    return <SkeletonList rows={isPrimaryMonth ? 5 : 2} />;
  }

  if (listQuery.error) {
    return (
      <InlineError
        error={listQuery.error}
        onRetry={() => listQuery.refetch()}
      />
    );
  }

  const rows = listQuery.data?.rows ?? [];
  if (rows.length === 0) {
    if (!isPrimaryMonth) return null;
    if (hasActiveFilters) {
      return (
        <div
          data-testid="tx-no-match"
          className="bg-card border border-border rounded-xl p-6 flex flex-col items-center gap-3 text-center"
        >
          <p className="m-0 text-sm text-muted-foreground">
            {t('transactions.noMatch')}
          </p>
          <Button
            type="button"
            variant="secondary"
            data-testid="tx-clear-filters"
            onClick={onClearFilters}
          >
            {t('transactions.clearFilters')}
          </Button>
        </div>
      );
    }
    return (
      <EmptyState
        icon="receipt"
        title={t('transactions.emptyTitle')}
        body={t('transactions.emptyBody')}
      />
    );
  }

  return (
    <div className="fsl-tx-month flex flex-col gap-4" data-month={month ?? 'range'}>
      {!isPrimaryMonth && month && (
        <h2 className="m-0 px-1 text-sm font-semibold text-muted-foreground">
          {formatMonthLabel(month, lang)}
        </h2>
      )}
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
                onOpenEntry={onOpenEntry}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function TransactionsScreen(): JSX.Element {
  const t = useT();
  const lang = getLang();
  const wide = useIsWide();
  const [searchParams, setSearchParams] = useSearchParams();

  const selectedMonth = searchParams.get('month') || currentMonthLocal();

  const filters: TransactionFilterValues = useMemo(() => {
    const typeParam = searchParams.get('type');
    const type =
      typeParam === 'expense' ||
      typeParam === 'income' ||
      typeParam === 'transfer' ||
      typeParam === 'person'
        ? typeParam
        : undefined;
    return {
      walletId: searchParams.get('walletId') || undefined,
      categoryId: searchParams.get('categoryId') || undefined,
      tagId: searchParams.get('tagId') || undefined,
      type,
      q: searchParams.get('q') || undefined,
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
    };
  }, [searchParams]);

  const hasActiveFilters = Boolean(
    filters.walletId ||
      filters.categoryId ||
      filters.tagId ||
      filters.type ||
      filters.q ||
      filters.from ||
      filters.to,
  );

  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [filterOpen, setFilterOpen] = useState(false);
  const [loadedMonths, setLoadedMonths] = useState<string[]>([selectedMonth]);
  const [emptyMonths, setEmptyMonths] = useState<Record<string, boolean>>({});
  const [selectedEntry, setSelectedEntry] = useState<EntryView | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const hasDateRange = Boolean(filters.from || filters.to);
  const resolvedTo = filters.to || todayLocal();
  const resolvedFrom = filters.from || `${resolvedTo.slice(0, 7)}-01`;

  useEffect(() => {
    setLoadedMonths([selectedMonth]);
    setEmptyMonths({});
  }, [selectedMonth, filters]);

  const trailingEmpty = useMemo(() => {
    let count = 0;
    for (let i = loadedMonths.length - 1; i >= 0; i--) {
      const m = loadedMonths[i]!;
      if (emptyMonths[m] === true) count++;
      else break;
    }
    return count;
  }, [loadedMonths, emptyMonths]);

  const lastLoadedMonth = loadedMonths[loadedMonths.length - 1] ?? selectedMonth;
  const nextOlderMonth = shiftMonth(lastLoadedMonth, -1);
  const canLoadOlder = !hasDateRange && nextOlderMonth >= MIN_MONTH;
  const canAutoLoadOlder =
    canLoadOlder && emptyMonths[lastLoadedMonth] !== undefined && trailingEmpty < 3;

  useEffect(() => {
    if (!canAutoLoadOlder) return;
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setLoadedMonths((prev) => {
            const last = prev[prev.length - 1] ?? selectedMonth;
            const older = shiftMonth(last, -1);
            if (older < MIN_MONTH || prev.includes(older)) return prev;
            return [...prev, older];
          });
        }
      },
      { rootMargin: '120px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [selectedMonth, canAutoLoadOlder]);

  const walletsQuery = useWalletDetails();
  const categoriesQuery = useCategories();
  const tagsQuery = useTags();

  const wallets = walletsQuery.data?.wallets ?? [];
  const categories = categoriesQuery.data?.categories ?? [];
  const tags = tagsQuery.data?.tags ?? [];

  const updateParams = (
    nextMonth: string,
    nextFilters: TransactionFilterValues,
  ) => {
    const next = new URLSearchParams();
    next.set('month', nextMonth);
    if (nextFilters.walletId) next.set('walletId', nextFilters.walletId);
    if (nextFilters.categoryId) next.set('categoryId', nextFilters.categoryId);
    if (nextFilters.tagId) next.set('tagId', nextFilters.tagId);
    if (nextFilters.type) next.set('type', nextFilters.type);
    if (nextFilters.q) next.set('q', nextFilters.q);
    if (nextFilters.from) next.set('from', nextFilters.from);
    if (nextFilters.to) next.set('to', nextFilters.to);
    setSearchParams(next, { replace: true });
  };

  const handleShiftMonth = (delta: number) => {
    const nextMonth = shiftMonth(selectedMonth, delta);
    updateParams(nextMonth, filters);
  };

  const handleRemoveFilter = (key: keyof TransactionFilterValues) => {
    const next = { ...filters };
    delete next[key];
    updateParams(selectedMonth, next);
  };

  const handleLoadOlder = () => {
    setLoadedMonths((prev) => {
      const last = prev[prev.length - 1] ?? selectedMonth;
      const older = shiftMonth(last, -1);
      if (older < MIN_MONTH || prev.includes(older)) return prev;
      return [...prev, older];
    });
  };

  return (
    <Screen
      title={t('transactions.title')}
      back="/trips"
      right={
        <button
          type="button"
          data-testid="tx-filter-btn"
          aria-label={t('transactions.filters')}
          onClick={() => setFilterOpen(true)}
          className="size-11 grid place-items-center rounded-full text-foreground hover:bg-muted cursor-pointer bg-transparent border-0"
        >
          <Icon name="search" size={20} />
        </button>
      }
    >
      <div className="fsl-transactions flex flex-col gap-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              data-testid="month-prev"
              aria-label={t('transactions.prevMonth')}
              onClick={() => handleShiftMonth(-1)}
              className="size-11 grid place-items-center rounded-full text-foreground hover:bg-muted cursor-pointer bg-transparent border-0"
            >
              <Icon name="chevronLeft" size={20} />
            </button>
            <span
              data-testid="tx-month-label"
              className="text-sm font-semibold text-foreground min-w-28 text-center"
            >
              {formatMonthLabel(selectedMonth, lang)}
            </span>
            <button
              type="button"
              data-testid="month-next"
              aria-label={t('transactions.nextMonth')}
              onClick={() => handleShiftMonth(1)}
              className="size-11 grid place-items-center rounded-full text-foreground hover:bg-muted cursor-pointer bg-transparent border-0"
            >
              <Icon name="chevronRight" size={20} />
            </button>
          </div>

          <button
            type="button"
            data-testid="tx-view-toggle"
            onClick={() =>
              setViewMode((prev) => (prev === 'day' ? 'category' : 'day'))
            }
            className="fsl-list-chip group inline-flex min-h-11 min-w-11 items-center justify-end pl-2 m-0 border-0 bg-transparent cursor-pointer font-inherit text-foreground focus-visible:outline-none"
          >
            <Badge
              variant="outline"
              className="fsl-list-chip__pill inline-flex min-h-7 items-center rounded-full border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors group-hover:bg-muted group-focus-visible:ring-2 group-focus-visible:ring-ring"
            >
              {viewMode === 'day'
                ? t('transactions.byDay')
                : t('transactions.byCategory')}
            </Badge>
          </button>
        </div>

        <ActiveFilterPills
          filters={filters}
          wallets={wallets}
          categories={categories}
          tags={tags}
          onRemove={handleRemoveFilter}
        />

        <div className="flex flex-col gap-6">
          {hasDateRange ? (
            <MonthBlock
              key="range"
              range={{ from: resolvedFrom, to: resolvedTo }}
              filters={filters}
              viewMode={viewMode}
              wallets={wallets}
              categories={categories}
              isPrimaryMonth
              hasActiveFilters={hasActiveFilters}
              onClearFilters={() => updateParams(selectedMonth, {})}
              onOpenEntry={wide ? (entry) => setSelectedEntry(entry) : undefined}
            />
          ) : (
            loadedMonths.map((month, idx) => (
              <MonthBlock
                key={month}
                month={month}
                filters={filters}
                viewMode={viewMode}
                wallets={wallets}
                categories={categories}
                isPrimaryMonth={idx === 0}
                hasActiveFilters={hasActiveFilters}
                onClearFilters={() => updateParams(selectedMonth, {})}
                onOpenEntry={wide ? (entry) => setSelectedEntry(entry) : undefined}
                onLoaded={(m, isEmpty) =>
                  setEmptyMonths((prev) => (prev[m] === isEmpty ? prev : { ...prev, [m]: isEmpty }))
                }
              />
            ))
          )}
        </div>

        {canLoadOlder && (
          <div ref={sentinelRef} className="flex justify-center pt-1">
            <Button
              type="button"
              variant="ghost"
              data-testid="tx-load-older"
              onClick={handleLoadOlder}
            >
              {t('transactions.loadOlder')}
            </Button>
          </div>
        )}
      </div>

      <TransactionFilters
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        value={filters}
        onApply={(next) => updateParams(selectedMonth, next)}
        wallets={wallets}
        categories={categories}
        tags={tags}
      />

      <Modal
        open={Boolean(selectedEntry)}
        onClose={() => setSelectedEntry(null)}
        title={t('transactions.detailTitle')}
      >
        {selectedEntry && (
          <TransactionDetailContent
            entry={selectedEntry}
            wallets={wallets}
            categories={categories}
            onDone={() => setSelectedEntry(null)}
          />
        )}
      </Modal>
    </Screen>
  );
}
