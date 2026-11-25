import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  buildCategoryDrilldown,
  buildReport,
  isBeforeStart,
  type CalcEntry,
  type CategoryView,
  type EntryView,
  type GroupRow,
  type GroupSettingsView,
  type ReportCategoryDrilldown,
  type ReportData,
  type ReportQuery,
  type ReportRowRef,
  type SyncEntryRow,
  type TagView,
  type WalletDetailView,
  type WalletDetailsResponse,
} from '@cc/core';
import { currentMonthLocal, todayLocal } from '@cc/web-util/localDate';
import { apiFetch, type ApiClientError } from './client';
import { WALLETS_KEY } from './personal';
import {
  PERSONAL_REPORT_KEY,
  useCategories,
  useGroupSettings,
  usePersonalList,
  useTags,
  useWalletDetails,
} from './personalMoney';
import * as groupCopyMod from './txCopy/groupCopy';
import * as txCopyMod from './txCopy/hooks';

export { PERSONAL_REPORT_KEY } from './personalMoney';

const DEFAULT_GROUP_SETTINGS: GroupSettingsView = {
  defaultGroupCategoryId: null,
  countLoans: false,
};

const UNAVAILABLE_GROUP_COPY: ReturnType<typeof groupCopyMod.useGroupCopy> = {
  status: 'unavailable',
  snapshot: null,
};

const UNAVAILABLE_TX_COPY: ReturnType<typeof txCopyMod.useTxCopy> = {
  status: 'unavailable',
  snapshot: null,
};

// Existing screen tests partially mock txCopy modules without useGroupCopy; tolerate missing exports safely.
function resolveOptionalFn<T>(mod: Record<string, unknown>, key: string): T | null {
  try {
    const value = mod[key];
    return typeof value === 'function' ? (value as T) : null;
  } catch {
    return null;
  }
}

const useGroupCopySafe: typeof groupCopyMod.useGroupCopy =
  resolveOptionalFn<typeof groupCopyMod.useGroupCopy>(
    groupCopyMod as Record<string, unknown>,
    'useGroupCopy',
  ) ?? (() => UNAVAILABLE_GROUP_COPY);

const useTxCopySafe: typeof txCopyMod.useTxCopy =
  resolveOptionalFn<typeof txCopyMod.useTxCopy>(
    txCopyMod as Record<string, unknown>,
    'useTxCopy',
  ) ?? (() => UNAVAILABLE_TX_COPY);

function requestGroupCopySyncSafe(): Promise<void> {
  const fn = resolveOptionalFn<typeof groupCopyMod.requestGroupCopySync>(
    groupCopyMod as Record<string, unknown>,
    'requestGroupCopySync',
  );
  return fn ? fn() : Promise.resolve();
}

function requestTxCopySyncSafe(): Promise<void> {
  const fn = resolveOptionalFn<typeof txCopyMod.requestTxCopySync>(
    txCopyMod as Record<string, unknown>,
    'requestTxCopySync',
  );
  return fn ? fn() : Promise.resolve();
}

export function buildReportQueryString(query: ReportQuery, today?: string): string {
  const params = new URLSearchParams();
  params.set('mode', query.mode);
  if (query.mode === 'month' && query.month) {
    params.set('month', query.month);
  } else if (query.mode === 'week' && query.week) {
    params.set('week', query.week);
  } else if (query.mode === 'year' && query.year) {
    params.set('year', query.year);
  } else if (query.mode === 'custom') {
    if (query.from) params.set('from', query.from);
    if (query.to) params.set('to', query.to);
  }
  if (query.walletId) {
    params.set('walletId', query.walletId);
  }
  params.set('groups', query.includeGroups ? 'show' : 'hide');
  params.set('today', today ?? todayLocal());
  return params.toString();
}

function hydrateEntryView(
  r: SyncEntryRow,
  walletById: Map<string, WalletDetailView>,
  tagNameById: Map<string, string>,
): EntryView {
  const wallet = walletById.get(r.walletId);
  const tags: string[] = [];
  for (const tid of r.tagIds) {
    const tname = tagNameById.get(tid);
    if (tname !== undefined) tags.push(tname);
  }
  return {
    id: r.id,
    walletId: r.walletId,
    type: r.type,
    amount: r.amount,
    currency: wallet?.currency ?? 'VND',
    categoryId: r.categoryId,
    assetId: r.assetId,
    quantity: r.quantity,
    transferId: r.transferId,
    counterpartWalletId: r.counterpartWalletId,
    date: r.date,
    time: r.time,
    note: r.note,
    tags,
    excludeFromReports: r.excludeFromReports,
    source: 'manual',
    beforeStart: wallet ? isBeforeStart({ date: r.date }, { startDate: wallet.startDate }) : false,
    createdAt: r.createdAt,
  };
}

function compareEntryViews(a: EntryView, b: EntryView): number {
  if (a.date !== b.date) return a.date > b.date ? -1 : 1;
  const at = a.time ?? a.createdAt;
  const bt = b.time ?? b.createdAt;
  if (at !== bt) {
    if (a.time === null && b.time !== null) return 1;
    if (b.time === null && a.time !== null) return -1;
    return at > bt ? -1 : 1;
  }
  if (a.createdAt !== b.createdAt) return a.createdAt > b.createdAt ? -1 : 1;
  return a.id.localeCompare(b.id);
}

function compareGroupRows(a: GroupRow, b: GroupRow): number {
  if (a.date !== b.date) return a.date > b.date ? -1 : 1;
  if (a.createdAt !== b.createdAt) return a.createdAt > b.createdAt ? -1 : 1;
  return a.id.localeCompare(b.id);
}

export interface ReportHookOptions {
  enabled?: boolean;
  retryOnFallback?: boolean;
  skipWalletsIfCached?: boolean;
}

function useReportInternal(query: ReportQuery, opts?: ReportHookOptions) {
  const enabled = opts?.enabled ?? true;
  const today = todayLocal();
  const queryClient = useQueryClient();
  const walletsAlreadyCached =
    queryClient.getQueryData<WalletDetailsResponse>(WALLETS_KEY) !== undefined;
  const walletsEnabled =
    enabled && (!opts?.skipWalletsIfCached || !walletsAlreadyCached);

  const walletsQuery = useWalletDetails({ enabled: walletsEnabled });
  const categoriesQuery = useCategories({ enabled });
  const tagsQuery = useTags({ enabled });
  const groupSettingsQuery = useGroupSettings({ enabled: enabled && query.includeGroups });

  const wallets = walletsQuery.data?.wallets;
  const categories = categoriesQuery.data?.categories;
  const tags = tagsQuery.data?.tags;
  const groupSettings = query.includeGroups
    ? groupSettingsQuery.data?.settings
    : DEFAULT_GROUP_SETTINGS;

  const metadataReady = Boolean(wallets && categories && tags && groupSettings);

  const txCopy = useTxCopySafe();
  const groupCopy = useGroupCopySafe({ enabled: enabled && query.includeGroups });

  const lookupsLoading =
    walletsQuery.isPending ||
    categoriesQuery.isPending ||
    tagsQuery.isPending ||
    (query.includeGroups && groupSettingsQuery.isPending);

  const txOpening = txCopy.status === 'opening';
  const groupOpening = query.includeGroups && groupCopy.status === 'opening';
  const waitingForLookups =
    txCopy.status === 'ready' &&
    (!query.includeGroups || groupCopy.status === 'ready') &&
    !metadataReady &&
    lookupsLoading;

  const stillOpening = enabled && (txOpening || groupOpening || waitingForLookups);

  const copyReady =
    enabled &&
    txCopy.status === 'ready' &&
    Boolean(txCopy.snapshot) &&
    (!query.includeGroups || (groupCopy.status === 'ready' && Boolean(groupCopy.snapshot))) &&
    metadataReady;

  const copyInput = useMemo(() => {
    if (!copyReady || !wallets || !categories || !tags || !groupSettings || !txCopy.snapshot) {
      return null;
    }
    return {
      wallets,
      entries: txCopy.snapshot.entries as unknown as Array<
        CalcEntry & { categoryId: string | null; tagIds: string[]; source?: string }
      >,
      categories,
      tags,
      groupRows: query.includeGroups ? (groupCopy.snapshot?.rows ?? []) : [],
      groupSettings,
      query,
      today,
    };
  }, [
    copyReady,
    wallets,
    categories,
    tags,
    groupSettings,
    txCopy.snapshot,
    query.includeGroups,
    groupCopy.snapshot,
    query.mode,
    query.month,
    query.week,
    query.year,
    query.from,
    query.to,
    query.walletId,
    today,
  ]);

  const copyReport = useMemo(() => {
    if (!copyInput) return null;
    return buildReport(copyInput);
  }, [copyInput]);

  const qs = useMemo(
    () => buildReportQueryString(query, today),
    [
      query.mode,
      query.month,
      query.week,
      query.year,
      query.from,
      query.to,
      query.walletId,
      query.includeGroups,
      today,
    ],
  );

  const serverQueryEnabled = enabled && !stillOpening && !copyReady;

  const serverQuery = useQuery<ReportData, ApiClientError>({
    queryKey: [...PERSONAL_REPORT_KEY, query, today],
    queryFn: () => apiFetch<ReportData>(`/api/me/personal/report?${qs}`),
    enabled: serverQueryEnabled,
    retry: opts?.retryOnFallback,
  });

  const refetch = useCallback(() => {
    if (copyReady) {
      void requestTxCopySyncSafe();
      if (query.includeGroups) {
        void requestGroupCopySyncSafe();
      }
    } else {
      void serverQuery.refetch();
    }
    void walletsQuery.refetch();
    void categoriesQuery.refetch();
    void tagsQuery.refetch();
    if (query.includeGroups) {
      void groupSettingsQuery.refetch();
    }
  }, [
    copyReady,
    query.includeGroups,
    serverQuery,
    walletsQuery,
    categoriesQuery,
    tagsQuery,
    groupSettingsQuery,
  ]);

  let source: 'copy' | 'server' | 'pending';
  let report: ReportData | undefined;
  let isPending: boolean;
  let error: ApiClientError | null;

  if (copyReady) {
    source = 'copy';
    report = copyReport ?? undefined;
    isPending = false;
    error = null;
  } else if (stillOpening) {
    source = 'pending';
    report = undefined;
    isPending = true;
    error = null;
  } else {
    source = 'server';
    report = serverQuery.data;
    isPending = serverQuery.isPending;
    error = serverQuery.error;
  }

  return {
    enabled,
    report,
    isPending,
    error,
    source,
    refetch,
    copyInput,
    txSnapshot: txCopy.snapshot,
    groupSnapshot: groupCopy.snapshot,
    wallets,
    tags,
    today,
    qs,
  };
}

export function usePersonalReport(
  query: ReportQuery,
  opts?: ReportHookOptions,
): {
  data: ReportData | undefined;
  isPending: boolean;
  error: ApiClientError | null;
  source: 'copy' | 'server' | 'pending';
  refetch: () => void;
} {
  const { report, isPending, error, source, refetch } = useReportInternal(query, opts);
  return {
    data: report,
    isPending,
    error,
    source,
    refetch,
  };
}

export function useCategoryDrilldown(
  query: ReportQuery,
  categoryId: string,
  opts?: { enabled?: boolean },
): {
  report: ReportData | undefined;
  drilldown: ReportCategoryDrilldown | null;
  matchingEntries: EntryView[];
  matchingGroupRows: GroupRow[];
  isPending: boolean;
  error: ApiClientError | null;
  refetch: () => void;
} {
  const enabled = opts?.enabled ?? true;
  const internal = useReportInternal(query, opts);

  // Local-copy drilldown
  const drilldownCopy = useMemo(() => {
    if (internal.source !== 'copy' || !internal.copyInput || !internal.report) {
      return null;
    }
    return buildCategoryDrilldown(internal.report, {
      ...internal.copyInput,
      categoryId,
    });
  }, [internal.source, internal.copyInput, internal.report, categoryId]);

  // Server drilldown query
  const categoryServerEnabled =
    enabled && internal.source === 'server' && Boolean(internal.report);

  const categoryQuery = useQuery<ReportCategoryDrilldown, ApiClientError>({
    queryKey: [...PERSONAL_REPORT_KEY, 'category', categoryId, query, internal.today],
    queryFn: () =>
      apiFetch<ReportCategoryDrilldown>(
        `/api/me/personal/report/category/${encodeURIComponent(categoryId)}?${internal.qs}`,
      ),
    enabled: categoryServerEnabled,
  });

  const drilldownServer =
    categoryQuery.error?.status === 404 ? null : (categoryQuery.data ?? null);

  const drilldown = internal.source === 'copy' ? drilldownCopy : drilldownServer;

  // List query for server fallback
  const listEnabled =
    enabled &&
    internal.source === 'server' &&
    Boolean(internal.report && drilldown && drilldown.rows.length > 0);

  const listQuery = usePersonalList(
    {
      from: internal.report?.period.from,
      to: internal.report?.period.effectiveTo,
      walletId: query.walletId,
      groups: query.includeGroups ? 'show' : 'hide',
    },
    { enabled: listEnabled },
  );

  const matchingEntries = useMemo(() => {
    if (!drilldown) return [];
    const entryIds = new Set(
      drilldown.rows
        .filter((r): r is Extract<ReportRowRef, { kind: 'entry' }> => r.kind === 'entry')
        .map((r) => r.entryId),
    );
    if (internal.source === 'copy') {
      if (!internal.txSnapshot) return [];
      const walletById = new Map((internal.wallets ?? []).map((w) => [w.id, w]));
      const tagNameById = new Map((internal.tags ?? []).map((t) => [t.id, t.name]));
      const entries: EntryView[] = [];
      for (const r of internal.txSnapshot.entries) {
        if (entryIds.has(r.id)) {
          entries.push(hydrateEntryView(r, walletById, tagNameById));
        }
      }
      entries.sort(compareEntryViews);
      return entries;
    }
    if (internal.source === 'server') {
      if (!listQuery.data) return [];
      const entries: EntryView[] = [];
      for (const r of listQuery.data.rows) {
        if (r.kind === 'entry' && entryIds.has(r.entry.id)) {
          entries.push(r.entry);
        }
      }
      entries.sort(compareEntryViews);
      return entries;
    }
    return [];
  }, [
    drilldown,
    internal.source,
    internal.txSnapshot,
    internal.wallets,
    internal.tags,
    listQuery.data,
  ]);

  const matchingGroupRows = useMemo(() => {
    if (!drilldown) return [];
    const groupIds = new Set(
      drilldown.rows
        .filter((r): r is Extract<ReportRowRef, { kind: 'group' }> => r.kind === 'group')
        .map((r) => r.groupRowId),
    );
    if (internal.source === 'copy') {
      if (!internal.groupSnapshot) return [];
      const rows: GroupRow[] = [];
      for (const r of internal.groupSnapshot.rows) {
        if (groupIds.has(r.id)) {
          rows.push(r);
        }
      }
      rows.sort(compareGroupRows);
      return rows;
    }
    if (internal.source === 'server') {
      if (!listQuery.data) return [];
      const rows: GroupRow[] = [];
      for (const r of listQuery.data.groupRows ?? []) {
        if (groupIds.has(r.id)) {
          rows.push(r);
        }
      }
      rows.sort(compareGroupRows);
      return rows;
    }
    return [];
  }, [drilldown, internal.source, internal.groupSnapshot, listQuery.data]);

  const isPending =
    internal.source === 'pending' ||
    internal.isPending ||
    (internal.source === 'server' &&
      (categoryQuery.isPending || (listEnabled && listQuery.isPending)));

  const error =
    internal.error ??
    (categoryQuery.error && categoryQuery.error.status !== 404
      ? categoryQuery.error
      : null) ??
    listQuery.error ??
    null;

  const refetch = useCallback(() => {
    internal.refetch();
    if (internal.source === 'server') {
      void categoryQuery.refetch();
      if (listEnabled) {
        void listQuery.refetch();
      }
    }
  }, [internal, categoryQuery, listEnabled, listQuery]);

  return {
    report: internal.report,
    drilldown,
    matchingEntries,
    matchingGroupRows,
    isPending,
    error,
    refetch,
  };
}

export function useCurrentMonthReportTotals(opts?: { enabled?: boolean }): {
  spent: number;
  income: number;
  approximate: boolean;
  ready: boolean;
} {
  const query = useMemo<ReportQuery>(
    () => ({
      mode: 'month',
      month: currentMonthLocal(),
      includeGroups: true,
    }),
    [],
  );

  const { data } = usePersonalReport(query, {
    enabled: opts?.enabled ?? true,
    retryOnFallback: false,
    skipWalletsIfCached: true,
  });

  if (data) {
    return {
      spent: data.totals.spent,
      income: data.totals.income,
      approximate: data.approximate,
      ready: true,
    };
  }

  return {
    spent: 0,
    income: 0,
    approximate: false,
    ready: false,
  };
}
