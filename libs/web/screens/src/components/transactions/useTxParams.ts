import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { currentMonthLocal } from '@cc/web-util/localDate';
import type { TransactionFilterValues } from '../TransactionFilters';

export type TxViewMode = 'day' | 'category';

export interface TxParams {
  month: string;
  filters: TransactionFilterValues;
  viewMode: TxViewMode;
}

const FILTER_KEYS: (keyof TransactionFilterValues)[] = [
  'walletId',
  'categoryId',
  'assetId',
  'tagId',
  'type',
  'tripId',
  'groups',
  'q',
  'from',
  'to',
];

function parseType(
  raw: string | null,
): TransactionFilterValues['type'] | undefined {
  if (
    raw === 'expense' ||
    raw === 'income' ||
    raw === 'transfer' ||
    raw === 'trade' ||
    raw === 'person'
  ) {
    return raw;
  }
  return undefined;
}

function parseGroups(raw: string | null): 'hide' | undefined {
  return raw === 'hide' ? 'hide' : undefined;
}

function parseViewMode(raw: string | null): TxViewMode {
  return raw === 'category' ? 'category' : 'day';
}

function buildSearchParams(
  month: string,
  filters: TransactionFilterValues,
  viewMode: TxViewMode = 'day',
): URLSearchParams {
  const next = new URLSearchParams();
  next.set('month', month);
  if (viewMode === 'category') {
    next.set('view', 'category');
  }
  for (const key of FILTER_KEYS) {
    const val = filters[key];
    if (!val) continue;
    if (key === 'tripId') {
      next.set('trip', val);
    } else if (key === 'groups') {
      if (val === 'hide') next.set('groups', 'hide');
    } else {
      next.set(key, val);
    }
  }
  return next;
}

/** Reads and updates transaction list month, view mode, and filter state in URL search params. */
export function useTxParams(): {
  month: string;
  viewMode: TxViewMode;
  filters: TransactionFilterValues;
  hasRange: boolean;
  isSearching: boolean;
  advancedCount: number;
  hasAnyFilter: boolean;
  set(
    next: Partial<TxParams['filters']> & { month?: string; view?: TxViewMode },
    opts?: { replaceFilters?: boolean },
  ): void;
  clearAll(): void;
} {
  const [searchParams, setSearchParams] = useSearchParams();

  const month = searchParams.get('month') || currentMonthLocal();
  const viewMode = parseViewMode(searchParams.get('view'));

  const filters: TransactionFilterValues = useMemo(
    () => ({
      walletId: searchParams.get('walletId') || undefined,
      categoryId: searchParams.get('categoryId') || undefined,
      assetId: searchParams.get('assetId') || undefined,
      tagId: searchParams.get('tagId') || undefined,
      type: parseType(searchParams.get('type')),
      tripId: searchParams.get('trip') || undefined,
      groups: parseGroups(searchParams.get('groups')),
      q: searchParams.get('q') || undefined,
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
    }),
    [searchParams],
  );

  const hasRange = Boolean(filters.from || filters.to);
  const isSearching = Boolean(filters.q || filters.tagId);
  const advancedCount =
    (filters.type ? 1 : 0) +
    (filters.walletId ? 1 : 0) +
    (filters.categoryId ? 1 : 0) +
    (filters.assetId ? 1 : 0) +
    (filters.tripId ? 1 : 0) +
    (filters.groups === 'hide' ? 1 : 0);
  const hasAnyFilter = Boolean(
    filters.walletId ||
      filters.categoryId ||
      filters.assetId ||
      filters.tagId ||
      filters.type ||
      filters.tripId ||
      filters.groups === 'hide' ||
      filters.q ||
      filters.from ||
      filters.to,
  );

  const set = useCallback(
    (
      next: Partial<TxParams['filters']> & { month?: string; view?: TxViewMode },
      opts?: { replaceFilters?: boolean },
    ) => {
      const nextMonth = next.month || month;
      const nextView = next.view ?? viewMode;
      const base: TransactionFilterValues = opts?.replaceFilters
        ? {}
        : { ...filters };

      for (const key of FILTER_KEYS) {
        if (!(key in next)) continue;
        const val = next[key];
        if (
          val === undefined ||
          val === '' ||
          (key === 'groups' && val !== 'hide')
        ) {
          delete base[key];
        } else {
          (base as Record<string, string>)[key] = val;
        }
      }

      setSearchParams(buildSearchParams(nextMonth, base, nextView), { replace: true });
    },
    [month, viewMode, filters, setSearchParams],
  );

  const clearAll = useCallback(() => {
    setSearchParams(buildSearchParams(month, {}, 'day'), { replace: true });
  }, [month, setSearchParams]);

  return {
    month,
    viewMode,
    filters,
    hasRange,
    isSearching,
    advancedCount,
    hasAnyFilter,
    set,
    clearAll,
  };
}
