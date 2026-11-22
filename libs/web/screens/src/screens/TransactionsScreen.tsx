import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
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
import { todayLocal } from '@cc/web-util/localDate';
import {
  useAssets,
  useCategories,
  useGroupSettings,
  usePersonalList,
  useTags,
  useWalletDetails,
} from '@cc/web-data-access/personalMoney';
import { useCopyGroupRows } from '@cc/web-data-access/txCopy/groupCopy';
import { useCopyList, useTxCopy } from '@cc/web-data-access/txCopy/hooks';
import { Button } from '@cc/web-ui/components/Button';
import { EmptyState } from '@cc/web-ui/components/EmptyState';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { SkeletonList } from '@cc/web-ui/components/Skeleton';
import { Badge } from '@cc/web-ui/components/ui/badge';
import { GroupRowSheet } from '../components/GroupRowSheet';
import { Screen } from '../components/Screen';
import {
  ActiveFilterPills,
  TransactionFilters,
  type GroupFilterOption,
  type TransactionFilterValues,
} from '../components/TransactionFilters';
import { TransactionRow } from '../components/TransactionRow';
import { CurrencyNetList, groupRows, rowKey } from '../components/transactions/groupRows';
import { NoMatch } from '../components/transactions/NoMatch';
import { PeriodRow } from '../components/transactions/PeriodRow';
import { SearchResults } from '../components/transactions/SearchResults';
import { TransactionSearchBar } from '../components/transactions/TransactionSearchBar';
import { useTxParams } from '../components/transactions/useTxParams';
import { WhenSheet } from '../components/transactions/WhenSheet';
import { BackToTop } from '../components/transactions/BackToTop';
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

const DEFAULT_GROUP_SETTINGS: GroupSettingsView = {
  defaultGroupCategoryId: null,
  countLoans: false,
};

interface MonthBlockProps {
  month?: string;
  range?: { from: string; to: string };
  filters: TransactionFilterValues;
  viewMode: ViewMode;
  wallets: WalletDetailView[];
  categories: CategoryView[];
  assets: AssetView[];
  settings: GroupSettingsView;
  isPrimaryMonth: boolean;
  hasActiveFilters: boolean;
  onClearFilters(): void;
  onOpenEntry?: (entry: EntryView) => void;
  onOpenGroup?: (row: GroupRow) => void;
  onGroupRows?: (rows: GroupRow[]) => void;
  onLoaded?: (month: string, isEmpty: boolean) => void;
}

function MonthBlock({
  month,
  range,
  filters,
  viewMode,
  wallets,
  categories,
  assets,
  settings,
  isPrimaryMonth,
  hasActiveFilters,
  onClearFilters,
  onOpenEntry,
  onOpenGroup,
  onGroupRows,
  onLoaded,
}: MonthBlockProps): JSX.Element | null {
  const t = useT();
  const lang = getLang();
  const { from: _f, to: _t, ...restFilters } = filters;
  const query: ListQuery = range
    ? { ...restFilters, from: range.from, to: range.to }
    : { ...restFilters, month };
  const copy = useCopyList(query);
  const groupCopy = useCopyGroupRows(query, { settings });
  // While the copy is still opening (a few ms), wait for it rather than spending a server read.
  const server = usePersonalList(query, {
    enabled: !copy.ready && !copy.opening,
    groups: true,
  });
  const baseRows = copy.ready
    ? groupCopy.ready
      ? (copy.rows ?? []).filter((r) => r.kind !== 'person')
      : (copy.rows ?? [])
    : server.data?.rows;
  const extraGroupRows = groupCopy.ready
    ? (groupCopy.groupRows ?? [])
    : (server.data?.groupRows ?? []);
  const rows = useMemo<BookRow[] | undefined>(() => {
    if (baseRows === undefined) return undefined;
    if (extraGroupRows.length === 0) return baseRows;
    return [...baseRows, ...extraGroupRows].sort(compareBookRows);
  }, [baseRows, extraGroupRows]);

  useEffect(() => {
    if (month && rows !== undefined && onLoaded) {
      onLoaded(month, rows.length === 0);
    }
  }, [month, rows, onLoaded]);

  useEffect(() => {
    if (extraGroupRows.length > 0 && onGroupRows) {
      onGroupRows(extraGroupRows);
    }
  }, [extraGroupRows, onGroupRows]);

  const grouped = useMemo(
    () => (rows ? groupRows(rows, viewMode, categories, lang, t, undefined, settings) : []),
    [rows, viewMode, categories, lang, t, settings],
  );

  const isPending = !copy.ready && (copy.opening || server.isPending);
  if (isPending) {
    return <SkeletonList rows={isPrimaryMonth ? 5 : 2} />;
  }

  const error = !copy.ready ? server.error : null;
  if (error) {
    return (
      <InlineError
        error={error}
        onRetry={() => server.refetch()}
      />
    );
  }

  if (!rows || rows.length === 0) {
    if (!isPrimaryMonth) return null;
    if (hasActiveFilters) {
      return <NoMatch onClear={onClearFilters} />;
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
                assets={assets}
                settings={settings}
                onOpenEntry={onOpenEntry}
                onOpenGroup={onOpenGroup}
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
  const today = todayLocal();
  const { month: selectedMonth, filters, hasRange, isSearching, advancedCount, hasAnyFilter, set, clearAll } =
    useTxParams();
  const copyStatus = useTxCopy().status;
  const copyReady = copyStatus === 'ready';
  /** Searching with no date range covers all history, which only the saved copy can answer for free. */
  const allTimeSearch = isSearching && !hasRange;

  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [filterOpen, setFilterOpen] = useState(false);
  const [whenOpen, setWhenOpen] = useState(false);
  const [loadedMonths, setLoadedMonths] = useState<string[]>([selectedMonth]);
  const [emptyMonths, setEmptyMonths] = useState<Record<string, boolean>>({});
  const [selectedEntry, setSelectedEntry] = useState<EntryView | null>(null);
  const [selectedGroupRow, setSelectedGroupRow] = useState<GroupRow | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  /** The search box's current text, so every list update also searches what is typed there. */
  const draftRef = useRef<{ text: string } | null>(null);

  const resolvedTo = filters.to || today;
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
  const showsMonths = !hasRange && !(allTimeSearch && copyReady);
  const canLoadOlder = showsMonths && nextOlderMonth >= MIN_MONTH;
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
  const assetsQuery = useAssets();
  const tagsQuery = useTags();
  const groupSettingsQuery = useGroupSettings();

  const wallets = walletsQuery.data?.wallets ?? [];
  const categories = categoriesQuery.data?.categories ?? [];
  const assets = assetsQuery.data?.assets ?? [];
  const tags = tagsQuery.data?.tags ?? [];
  const groupSettings = groupSettingsQuery.data?.settings ?? DEFAULT_GROUP_SETTINGS;

  const allGroupCopy = useCopyGroupRows(
    { from: '0000-01-01', to: '9999-12-31', groups: 'show' },
    { settings: groupSettings },
  );
  const searchGroupQuery: ListQuery =
    filters.from || filters.to
      ? { ...filters, groups: filters.groups ?? 'show' }
      : { ...filters, from: '0000-01-01', to: '9999-12-31', groups: filters.groups ?? 'show' };
  const searchGroupCopy = useCopyGroupRows(searchGroupQuery, {
    enabled: allTimeSearch && copyReady,
    settings: groupSettings,
  });
  const [seenGroupRows, setSeenGroupRows] = useState<GroupRow[]>([]);
  const handleGroupRows = useCallback((incoming: GroupRow[]) => {
    setSeenGroupRows((prev) => {
      const existing = new Set(prev.map((r) => r.tripId));
      const next = [...prev];
      let changed = false;
      for (const r of incoming) {
        if (!existing.has(r.tripId)) {
          existing.add(r.tripId);
          next.push(r);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const groupOptions = useMemo<GroupFilterOption[]>(() => {
    const source =
      allGroupCopy.ready && allGroupCopy.groupRows
        ? allGroupCopy.groupRows
        : seenGroupRows;
    const byTripId = new Map<string, GroupFilterOption>();
    for (const row of source) {
      if (!byTripId.has(row.tripId)) {
        byTripId.set(row.tripId, {
          id: row.tripId,
          name: row.isDirect ? t('transactions.typePerson') : row.tripName,
        });
      }
    }
    return [...byTripId.values()];
  }, [allGroupCopy.ready, allGroupCopy.groupRows, seenGroupRows, t]);

  /** Applies a change and commits whatever is typed in the search box with it (spec: the box is what's searched). */
  const apply = (change: Partial<TransactionFilterValues> & { month?: string }) => {
    const typed = draftRef.current?.text.trim() || undefined;
    set({ q: typed, ...change });
  };

  const handleLoadOlder = () => {
    setLoadedMonths((prev) => {
      const last = prev[prev.length - 1] ?? selectedMonth;
      const older = shiftMonth(last, -1);
      if (older < MIN_MONTH || prev.includes(older)) return prev;
      return [...prev, older];
    });
  };

  const onOpenEntry = (entry: EntryView) => setSelectedEntry(entry);

  return (
    <Screen title={t('transactions.title')} back="/trips">
      <div className="fsl-transactions flex flex-col gap-4 py-4">
        <div className="flex flex-col gap-1.5">
          <TransactionSearchBar
            q={filters.q}
            tagId={filters.tagId}
            tags={tags}
            advancedCount={advancedCount}
            draftRef={draftRef}
            onSubmit={(next) => set({ q: next.q, tagId: next.tagId })}
            onOpenAdvanced={() => setFilterOpen(true)}
          />
          {allTimeSearch && !copyReady && copyStatus === 'loading' && (
            <p data-testid="tx-loading-history" className="m-0 px-1 text-sm text-muted-foreground">
              {t('transactions.loadingHistory')}
            </p>
          )}
        </div>

        <PeriodRow
          month={selectedMonth}
          from={filters.from}
          to={filters.to}
          isSearching={allTimeSearch && copyReady}
          today={today}
          onShiftMonth={(delta) => apply({ month: shiftMonth(selectedMonth, delta) })}
          onOpenWhen={() => setWhenOpen(true)}
          onClearRange={() => apply({ from: undefined, to: undefined })}
          right={
            <button
              type="button"
              data-testid="tx-view-toggle"
              onClick={() => setViewMode((prev) => (prev === 'day' ? 'category' : 'day'))}
              className="fsl-list-chip group inline-flex min-h-11 min-w-11 items-center justify-end pl-2 m-0 border-0 bg-transparent cursor-pointer font-inherit text-foreground focus-visible:outline-none"
            >
              <Badge
                variant="outline"
                className="fsl-list-chip__pill inline-flex min-h-7 items-center rounded-full border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors group-hover:bg-muted group-focus-visible:ring-2 group-focus-visible:ring-ring"
              >
                {viewMode === 'day' ? t('transactions.byDay') : t('transactions.byCategory')}
              </Badge>
            </button>
          }
        />

        <ActiveFilterPills
          filters={filters}
          wallets={wallets}
          categories={categories}
          assets={assets}
          tags={tags}
          groups={groupOptions}
          hasAnyFilter={hasAnyFilter}
          onRemove={(key) => apply({ [key]: undefined })}
          onClearAll={clearAll}
        />

        <div className="flex flex-col gap-6">
          {allTimeSearch && copyReady ? (
            <SearchResults
              filters={filters}
              viewMode={viewMode}
              wallets={wallets}
              categories={categories}
              assets={assets}
              groupRows={searchGroupCopy.ready ? (searchGroupCopy.groupRows ?? []) : undefined}
              settings={groupSettings}
              onOpenEntry={onOpenEntry}
              onOpenGroup={setSelectedGroupRow}
              onClear={clearAll}
            />
          ) : hasRange ? (
            <MonthBlock
              key="range"
              range={{ from: resolvedFrom, to: resolvedTo }}
              filters={filters}
              viewMode={viewMode}
              wallets={wallets}
              categories={categories}
              assets={assets}
              settings={groupSettings}
              isPrimaryMonth
              hasActiveFilters={hasAnyFilter}
              onClearFilters={clearAll}
              onOpenEntry={onOpenEntry}
              onOpenGroup={setSelectedGroupRow}
              onGroupRows={handleGroupRows}
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
                assets={assets}
                settings={groupSettings}
                isPrimaryMonth={idx === 0}
                hasActiveFilters={hasAnyFilter}
                onClearFilters={clearAll}
                onOpenEntry={onOpenEntry}
                onOpenGroup={setSelectedGroupRow}
                onGroupRows={handleGroupRows}
                onLoaded={(m, isEmpty) =>
                  setEmptyMonths((prev) => (prev[m] === isEmpty ? prev : { ...prev, [m]: isEmpty }))
                }
              />
            ))
          )}
        </div>

        {canLoadOlder && (
          <div ref={sentinelRef} className="flex justify-center pt-1">
            <Button type="button" variant="ghost" data-testid="tx-load-older" onClick={handleLoadOlder}>
              {t('transactions.loadOlder')}
            </Button>
          </div>
        )}
      </div>

      <BackToTop />

      <TransactionFilters
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        value={filters}
        onApply={(next) => apply({ ...next })}
        wallets={wallets}
        categories={categories}
        assets={assets}
        tags={tags}
        groups={groupOptions}
      />

      <WhenSheet
        open={whenOpen}
        onClose={() => setWhenOpen(false)}
        month={selectedMonth}
        from={filters.from}
        to={filters.to}
        today={today}
        rangeLimitDays={copyReady ? undefined : 366}
        onPickMonth={(month) => apply({ month, from: undefined, to: undefined })}
        onPickRange={({ from, to }) => apply({ from, to })}
      />

      <Sheet
        open={Boolean(selectedEntry)}
        onClose={() => setSelectedEntry(null)}
        title={t('transactions.detailTitle')}
      >
        {selectedEntry && (
          <TransactionDetailContent
            entry={selectedEntry}
            wallets={wallets}
            categories={categories}
            assets={assets}
            onDone={() => setSelectedEntry(null)}
          />
        )}
      </Sheet>

      <GroupRowSheet
        row={selectedGroupRow}
        open={selectedGroupRow !== null}
        onClose={() => setSelectedGroupRow(null)}
      />
    </Screen>
  );
}
