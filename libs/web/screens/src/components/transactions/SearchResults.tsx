import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import {
  compareBookRows,
  type AssetView,
  type BookRow,
  type CategoryView,
  type EntryView,
  type GroupRow,
  type GroupSettingsView,
  type ListQuery,
  type WalletDetailView,
} from '@cc/core';
import { getLang, useT } from '@cc/web-i18n';
import { useCopyList } from '@cc/web-data-access/txCopy/hooks';
import { todayLocal } from '@cc/web-util/localDate';
import { Button } from '@cc/web-ui/components/Button';
import type { TransactionFilterValues } from '../TransactionFilters';
import { TransactionRow } from '../TransactionRow';
import { CurrencyNetList, groupRows, rowKey } from './groupRows';
import { NoMatch } from './NoMatch';

const PAGE_SIZE = 50;
const ALL_FROM = '0000-01-01';
const ALL_TO = '9999-12-31';
const EMPTY_GROUP_ROWS: GroupRow[] = [];

export interface SearchResultsProps {
  filters: TransactionFilterValues;
  viewMode: 'day' | 'category';
  wallets: WalletDetailView[];
  categories: CategoryView[];
  assets: AssetView[];
  groupRows?: GroupRow[];
  settings?: GroupSettingsView;
  onOpenEntry?(entry: EntryView): void;
  onOpenGroup?(row: GroupRow): void;
  onClear(): void;
}

export function SearchResults({
  filters,
  viewMode,
  wallets,
  categories,
  assets,
  groupRows: extraGroupRows = EMPTY_GROUP_ROWS,
  settings,
  onOpenEntry,
  onOpenGroup,
  onClear,
}: SearchResultsProps): JSX.Element {
  const t = useT();
  const lang = getLang();
  // No date range means all history: without explicit bounds the shared period rule would fall back to this month.
  const query: ListQuery = filters.from || filters.to ? filters : { ...filters, from: ALL_FROM, to: ALL_TO };
  const copy = useCopyList(query);
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
    filters.tripId,
    filters.groups,
    viewMode,
  ]);

  const rows = useMemo<BookRow[] | null>(() => {
    if (!copy.rows) return null;
    if (extraGroupRows.length === 0) return copy.rows;
    const base = copy.rows.filter((r) => r.kind !== 'person');
    return [...base, ...extraGroupRows].sort(compareBookRows);
  }, [copy.rows, extraGroupRows]);
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
    () => groupRows(visibleRows, viewMode, categories, lang, t, currentYear, settings),
    [visibleRows, viewMode, categories, lang, t, currentYear, settings],
  );

  if (!copy.ready || !rows) {
    return <></>;
  }

  if (rows.length === 0) {
    return <NoMatch onClear={onClear} />;
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
                settings={settings}
                onOpenEntry={onOpenEntry}
                onOpenGroup={onOpenGroup}
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
