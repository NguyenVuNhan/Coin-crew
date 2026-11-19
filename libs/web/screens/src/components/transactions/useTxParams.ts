import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { currentMonthLocal } from '@cc/web-util/localDate';
import type { TransactionFilterValues } from '../TransactionFilters';

export interface TxParams {
  month: string;
  filters: TransactionFilterValues;
}

const FILTER_KEYS: (keyof TransactionFilterValues)[] = [
  'walletId',
  'categoryId',
  'assetId',
  'tagId',
  'type',
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

function buildSearchParams(
  month: string,
  filters: TransactionFilterValues,
): URLSearchParams {
  const next = new URLSearchParams();
  next.set('month', month);
  for (const key of FILTER_KEYS) {
    const val = filters[key];
    if (val) next.set(key, val);
  }
  return next;
}

/** Reads and updates transaction list month and filter state in URL search params. */
export function useTxParams(): {
  month: string;
  filters: TransactionFilterValues;
  hasRange: boolean;
  isSearching: boolean;
  advancedCount: number;
  hasAnyFilter: boolean;
  set(
    next: Partial<TxParams['filters']> & { month?: string },
    opts?: { replaceFilters?: boolean },
  ): void;
  clearAll(): void;
} {
  const [searchParams, setSearchParams] = useSearchParams();

  const month = searchParams.get('month') || currentMonthLocal();

  const filters: TransactionFilterValues = useMemo(
    () => ({
      walletId: searchParams.get('walletId') || undefined,
      categoryId: searchParams.get('categoryId') || undefined,
      assetId: searchParams.get('assetId') || undefined,
      tagId: searchParams.get('tagId') || undefined,
      type: parseType(searchParams.get('type')),
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
    (filters.assetId ? 1 : 0);
  const hasAnyFilter = Boolean(
    filters.walletId ||
      filters.categoryId ||
      filters.assetId ||
      filters.tagId ||
      filters.type ||
      filters.q ||
      filters.from ||
      filters.to,
  );

  const set = useCallback(
    (
      next: Partial<TxParams['filters']> & { month?: string },
      opts?: { replaceFilters?: boolean },
    ) => {
      const nextMonth = next.month || month;
      const base: TransactionFilterValues = opts?.replaceFilters
        ? {}
        : { ...filters };

      for (const key of FILTER_KEYS) {
        if (!(key in next)) continue;
        const val = next[key];
        if (val === undefined || val === '') {
          delete base[key];
        } else {
          (base as Record<string, string>)[key] = val;
        }
      }

      setSearchParams(buildSearchParams(nextMonth, base), { replace: true });
    },
    [month, filters, setSearchParams],
  );

  const clearAll = useCallback(() => {
    setSearchParams(buildSearchParams(month, {}), { replace: true });
  }, [month, setSearchParams]);

  return {
    month,
    filters,
    hasRange,
    isSearching,
    advancedCount,
    hasAnyFilter,
    set,
    clearAll,
  };
}
