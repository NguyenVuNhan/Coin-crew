import { useCallback, useMemo } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import {
  budgetImpacts,
  budgetPeriodAt,
  budgetPeriodsUpTo,
  budgetProgress,
  budgetRows,
  budgetSpent,
  budgetStarters,
  budgetSuggestion,
  firstBudgetPeriod,
  lastFullMonthSpent,
  limitFor,
  listCountedSpending,
  occurrencesBetween,
  orderBudgets,
  type BudgetDef,
  type BudgetDraft,
  type BudgetImpact,
  type BudgetPeriod,
  type BudgetProgress,
  type BudgetResponse,
  type BudgetsProgressResponse,
  type BudgetsResponse,
  type BudgetStarter,
  type BudgetSuggestion,
  type CalcEntry,
  type CategoryView,
  type CountedSpendRow,
  type CreateBudgetInput,
  type PlannedItemView,
  type RecurringDraft,
  type RecurringRuleView,
  type TagView,
  type UpdateBudgetInput,
  type WalletDetailView,
} from '@cc/core';
import { todayLocal } from '@cc/web-util/localDate';
import { apiFetch, apiSend, type ApiClientError } from './client';
import {
  PERSONAL_BUDGETS_KEY,
  useCategories,
  useGroupSettings,
  useTags,
  useWalletDetails,
} from './personalMoney';
import * as groupCopyMod from './txCopy/groupCopy';
import * as txCopyMod from './txCopy/hooks';
import { usePlannedItems, useRecurringRules } from './recurring';

export { PERSONAL_BUDGETS_KEY } from './personalMoney';

const EMPTY_DEFS: BudgetDef[] = [];
const EMPTY_ROWS: CountedSpendRow[] = [];
const EMPTY_CATEGORIES: CategoryView[] = [];
const EMPTY_WALLETS: WalletDetailView[] = [];
const EMPTY_IMPACTS: BudgetImpact[] = [];
const EMPTY_STARTERS: BudgetStarter[] = [];
const EMPTY_HISTORY: { period: BudgetPeriod; limit: number; spent: number }[] = [];

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

export function useBudgets(opts?: {
  enabled?: boolean;
}): UseQueryResult<BudgetsResponse, ApiClientError> {
  return useQuery<BudgetsResponse, ApiClientError>({
    queryKey: PERSONAL_BUDGETS_KEY,
    queryFn: () => apiFetch<BudgetsResponse>('/api/me/personal/budgets'),
    enabled: opts?.enabled ?? true,
  });
}

export function useCreateBudget() {
  const queryClient = useQueryClient();

  return useMutation<BudgetResponse, ApiClientError, CreateBudgetInput>({
    mutationFn: (input: CreateBudgetInput) =>
      apiSend<BudgetResponse>('/api/me/personal/budgets', 'POST', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PERSONAL_BUDGETS_KEY }),
  });
}

export function useUpdateBudget() {
  const queryClient = useQueryClient();

  return useMutation<
    BudgetResponse,
    ApiClientError,
    { id: string; input: UpdateBudgetInput }
  >({
    mutationFn: ({ id, input }) =>
      apiSend<BudgetResponse>(
        `/api/me/personal/budgets/${encodeURIComponent(id)}`,
        'PATCH',
        input,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PERSONAL_BUDGETS_KEY }),
  });
}

export function useDeleteBudget() {
  const queryClient = useQueryClient();

  return useMutation<{ ok: true }, ApiClientError, string>({
    mutationFn: (id: string) =>
      apiSend<{ ok: true }>(`/api/me/personal/budgets/${encodeURIComponent(id)}`, 'DELETE'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PERSONAL_BUDGETS_KEY }),
  });
}

export interface BudgetsProgress {
  source: 'copy' | 'server' | 'pending';
  current: BudgetProgress[];
  groups: ReturnType<typeof orderBudgets>;
  history(id: string): { period: BudgetPeriod; limit: number; spent: number }[];
  suggestion(id: string): BudgetSuggestion | null;
  rowsFor(id: string, period: BudgetPeriod): CountedSpendRow[];
}

function useBudgetsSource(opts: { enabled: boolean; allowServerFallback: boolean }) {
  const { enabled, allowServerFallback } = opts;
  const today = todayLocal();

  const budgetsQuery = useBudgets({ enabled });
  const walletsQuery = useWalletDetails({ enabled });
  const categoriesQuery = useCategories({ enabled });
  const tagsQuery = useTags({ enabled });
  const groupSettingsQuery = useGroupSettings({ enabled });

  const wallets = walletsQuery.data?.wallets;
  const categories = categoriesQuery.data?.categories;
  const tags = tagsQuery.data?.tags;
  const groupSettings = groupSettingsQuery.data?.settings;

  const metadataReady = Boolean(wallets && categories && tags && groupSettings);

  const txCopy = useTxCopySafe();
  const groupCopy = useGroupCopySafe({ enabled });

  const lookupsLoading =
    walletsQuery.isPending ||
    categoriesQuery.isPending ||
    tagsQuery.isPending ||
    groupSettingsQuery.isPending;

  const txOpening = txCopy.status === 'opening';
  const groupOpening = groupCopy.status === 'opening';
  const waitingForLookups =
    txCopy.status === 'ready' &&
    groupCopy.status === 'ready' &&
    !metadataReady &&
    lookupsLoading;

  const stillOpening = enabled && (txOpening || groupOpening || waitingForLookups);

  const copyReady =
    enabled &&
    txCopy.status === 'ready' &&
    Boolean(txCopy.snapshot) &&
    groupCopy.status === 'ready' &&
    Boolean(groupCopy.snapshot) &&
    metadataReady;

  const copyRows = useMemo(() => {
    if (!copyReady || !wallets || !categories || !tags || !groupSettings || !txCopy.snapshot) {
      return null;
    }
    return listCountedSpending({
      wallets,
      entries: txCopy.snapshot.entries as unknown as Array<
        CalcEntry & { categoryId: string | null; tagIds: string[]; source?: string }
      >,
      categories,
      tags,
      groupRows: groupCopy.snapshot?.rows ?? [],
      groupSettings,
    });
  }, [
    copyReady,
    wallets,
    categories,
    tags,
    groupSettings,
    txCopy.snapshot,
    groupCopy.snapshot,
  ]);

  const defs = budgetsQuery.data?.budgets ?? EMPTY_DEFS;
  const serverQueryEnabled =
    allowServerFallback && enabled && !stillOpening && !copyReady && defs.length > 0;

  const serverQuery = useQuery<BudgetsProgressResponse, ApiClientError>({
    queryKey: [...PERSONAL_BUDGETS_KEY, 'progress', today],
    queryFn: () =>
      apiFetch<BudgetsProgressResponse>(
        `/api/me/personal/budgets/progress?today=${encodeURIComponent(today)}`,
      ),
    enabled: serverQueryEnabled,
  });

  let source: 'copy' | 'server' | 'pending';
  let rows: CountedSpendRow[];
  let isPending: boolean;
  let error: ApiClientError | null;

  if (copyReady) {
    source = 'copy';
    rows = copyRows ?? EMPTY_ROWS;
    isPending = budgetsQuery.isPending;
    error = budgetsQuery.error ?? null;
  } else if (stillOpening) {
    source = 'pending';
    rows = EMPTY_ROWS;
    isPending = true;
    error = budgetsQuery.error ?? null;
  } else {
    source = 'server';
    rows = serverQuery.data?.rows ?? EMPTY_ROWS;
    isPending =
      budgetsQuery.isPending ||
      (serverQueryEnabled && serverQuery.isPending) ||
      categoriesQuery.isPending;
    error = budgetsQuery.error ?? serverQuery.error ?? categoriesQuery.error ?? null;
  }

  return {
    source,
    rows,
    defs,
    categories: categories ?? EMPTY_CATEGORIES,
    wallets: wallets ?? EMPTY_WALLETS,
    today,
    isPending,
    error,
  };
}

export function useBudgetsProgress(opts?: {
  enabled?: boolean;
}): BudgetsProgress & {
  isPending: boolean;
  error: ApiClientError | null;
  defs: BudgetDef[];
} {
  const enabled = opts?.enabled ?? true;
  const { source, rows, defs, categories, today, isPending, error } = useBudgetsSource({
    enabled,
    allowServerFallback: true,
  });

  const defById = useMemo(() => {
    const map = new Map<string, BudgetDef>();
    for (const def of defs) {
      map.set(def.id, def);
    }
    return map;
  }, [defs]);

  const current = useMemo<BudgetProgress[]>(() => {
    return defs.map((def) => {
      const period = budgetPeriodAt(def, today) ?? firstBudgetPeriod(def);
      const spent = budgetSpent(def, rows, period, categories);
      return budgetProgress(def, spent, period, today);
    });
  }, [defs, rows, categories, today]);

  const groups = useMemo(() => orderBudgets(current), [current]);

  const historyCache = useMemo(
    () => new Map<string, { period: BudgetPeriod; limit: number; spent: number }[]>(),
    [defById, today, rows, categories],
  );

  const history = useCallback(
    (id: string): { period: BudgetPeriod; limit: number; spent: number }[] => {
      const cached = historyCache.get(id);
      if (cached) return cached;
      const def = defById.get(id);
      if (!def) return EMPTY_HISTORY;
      const computed = budgetPeriodsUpTo(def, today).map((period) => ({
        period,
        limit: limitFor(def, period),
        spent: budgetSpent(def, rows, period, categories),
      }));
      historyCache.set(id, computed);
      return computed;
    },
    [historyCache, defById, today, rows, categories],
  );

  const suggestionsById = useMemo(() => {
    const map = new Map<string, BudgetSuggestion | null>();
    for (const def of defs) {
      if (def.periodKind === 'once') {
        map.set(def.id, null);
        continue;
      }
      const recentHistory = budgetPeriodsUpTo(def, today)
        .slice(0, 7)
        .map((period) => ({
          period,
          limit: limitFor(def, period),
          spent: budgetSpent(def, rows, period, categories),
        }));
      map.set(def.id, budgetSuggestion(def, recentHistory, today));
    }
    return map;
  }, [defs, rows, categories, today]);

  const suggestion = useCallback(
    (id: string): BudgetSuggestion | null => suggestionsById.get(id) ?? null,
    [suggestionsById],
  );

  const rowsFor = useCallback(
    (id: string, period: BudgetPeriod): CountedSpendRow[] => {
      const def = defById.get(id);
      if (!def) return EMPTY_ROWS;
      return budgetRows(def, rows, period, categories);
    },
    [defById, rows, categories],
  );

  return {
    source,
    current,
    groups,
    history,
    suggestion,
    rowsFor,
    isPending,
    error,
    defs,
  };
}

export function useBudgetImpacts(draft: BudgetDraft | null): BudgetImpact[] {
  const { source, rows, defs, categories, today } = useBudgetsSource({
    enabled: true,
    allowServerFallback: false,
  });

  return useMemo(() => {
    if (source !== 'copy' || draft === null || defs.length === 0) {
      return EMPTY_IMPACTS;
    }
    return budgetImpacts(defs, rows, draft, categories, today);
  }, [source, draft, defs, rows, categories, today]);
}

function filterReportIncludedRows(
  rows: CountedSpendRow[],
  wallets: WalletDetailView[],
): CountedSpendRow[] {
  const excludedWalletIds = new Set(
    wallets.filter((w) => Boolean(w.excludeFromReports)).map((w) => w.id),
  );
  if (excludedWalletIds.size === 0) return rows;
  return rows.filter((r) => r.walletId === null || !excludedWalletIds.has(r.walletId));
}

export function useBudgetStarters(): { starters: BudgetStarter[]; ready: boolean } {
  const { source, rows, defs, categories, wallets, today, isPending } = useBudgetsSource({
    enabled: true,
    allowServerFallback: false,
  });

  const ready = source === 'copy' && !isPending;

  const starters = useMemo(() => {
    if (!ready) return EMPTY_STARTERS;
    const reportRows = filterReportIncludedRows(rows, wallets);
    return budgetStarters(defs, reportRows, categories, today);
  }, [ready, defs, rows, wallets, categories, today]);

  return { starters, ready };
}

export function useLastMonthCategorySpent(categoryId: string | null): number | null {
  const { source, rows, categories, wallets, today } = useBudgetsSource({
    enabled: categoryId !== null,
    allowServerFallback: false,
  });

  return useMemo(() => {
    if (source !== 'copy' || categoryId === null) return null;
    const reportRows = filterReportIncludedRows(rows, wallets);
    return lastFullMonthSpent(reportRows, categoryId, categories, today);
  }, [source, categoryId, rows, wallets, categories, today]);
}

function addOneDayYmd(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + 1));
  const yy = String(dt.getUTCFullYear()).padStart(4, '0');
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Counts future active-rule expenses (tomorrow..period.to) and waiting recurring_occurrence expenses within the period. */
export function budgetStillDue(
  budget: BudgetDef,
  period: BudgetPeriod,
  rules: RecurringRuleView[],
  waitingItems: PlannedItemView[],
  categories: CategoryView[],
  wallets: Pick<WalletDetailView, 'id' | 'currency'>[],
  today: string,
  tags: Pick<TagView, 'id' | 'name'>[] = [],
): { count: number; amount: number } {
  const excluded = new Set(budget.excludedWalletIds);
  const walletCurrency = new Map(wallets.map((w) => [w.id, w.currency]));

  let parentById: Map<string, string | null> | null = null;
  let targetTagName: string | undefined;
  if (budget.target.kind === 'category') {
    parentById = new Map(categories.map((c) => [c.id, c.parentId]));
  } else {
    const tagId = budget.target.tagId;
    targetTagName = tags.find((t) => t.id === tagId)?.name;
  }

  const matchesCategory = (categoryId: string | undefined, targetCategoryId: string): boolean => {
    if (!categoryId) return false;
    let cur: string | null = categoryId;
    const seen = new Set<string>();
    while (cur !== null) {
      if (cur === targetCategoryId) return true;
      if (seen.has(cur)) return false;
      seen.add(cur);
      cur = parentById?.get(cur) ?? null;
    }
    return false;
  };

  const inScope = (draft: RecurringDraft): boolean => {
    if (draft.type !== 'expense' || draft.excludeFromReports) return false;
    if (excluded.has(draft.walletId)) return false;
    if (walletCurrency.get(draft.walletId) !== budget.currency) return false;

    if (budget.target.kind === 'category') {
      return matchesCategory(draft.categoryId, budget.target.categoryId);
    }
    const tagId = budget.target.tagId;
    return (
      draft.tags.includes(tagId) ||
      (targetTagName !== undefined && draft.tags.includes(targetTagName))
    );
  };

  let count = 0;
  let amount = 0;

  const tomorrow = addOneDayYmd(today);
  const windowFrom = tomorrow > period.from ? tomorrow : period.from;
  if (windowFrom <= period.to) {
    for (const rule of rules) {
      if (rule.status !== 'active' || rule.nextDueOn === null) continue;
      if (!inScope(rule.draft)) continue;
      const from = rule.nextDueOn > windowFrom ? rule.nextDueOn : windowFrom;
      if (from > period.to) continue;
      const dates = occurrencesBetween(rule.schedule, from, period.to);
      if (dates.length > 0) {
        count += dates.length;
        amount += dates.length * rule.draft.amount;
      }
    }
  }

  for (const item of waitingItems) {
    if (item.kind !== 'recurring_occurrence' || item.status !== 'waiting' || !item.draft) continue;
    if (item.dueOn < period.from || item.dueOn > period.to) continue;
    if (!inScope(item.draft)) continue;
    count += 1;
    amount += item.draft.amount;
  }

  return { count, amount };
}

const EMPTY_RULES: RecurringRuleView[] = [];
const EMPTY_PLANNED: PlannedItemView[] = [];
const EMPTY_TAGS: TagView[] = [];

/** Expenses from active rules (waiting items included) inside the budget's scope, from tomorrow to the period end. */
export function useBudgetStillDue(
  budget: BudgetDef,
  period: BudgetPeriod,
): { count: number; amount: number } {
  const today = todayLocal();
  const rulesQuery = useRecurringRules();
  const plannedQuery = usePlannedItems();
  const categoriesQuery = useCategories();
  const walletsQuery = useWalletDetails();
  const tagsQuery = useTags();

  const rules = rulesQuery.data?.rules ?? EMPTY_RULES;
  const waitingItems = plannedQuery.data?.items ?? EMPTY_PLANNED;
  const categories = categoriesQuery.data?.categories ?? EMPTY_CATEGORIES;
  const wallets = walletsQuery.data?.wallets ?? EMPTY_WALLETS;
  const tags = tagsQuery.data?.tags ?? EMPTY_TAGS;

  return useMemo(
    () =>
      budgetStillDue(
        budget,
        period,
        rules,
        waitingItems,
        categories,
        wallets,
        today,
        tags,
      ),
    [budget, period, rules, waitingItems, categories, wallets, today, tags],
  );
}
