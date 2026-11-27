import { useMemo } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import {
  upcomingOccurrences,
  vnDate,
  type ConfirmPlannedInput,
  type CurrencyCode,
  type PlannedItemsResponse,
  type RecurringRuleInput,
  type RecurringRuleResponse,
  type RecurringRulesResponse,
  type UpcomingItem,
  type WalletDetailView,
} from '@cc/core';
import { apiFetch, apiSend, type ApiClientError } from './client';
import { WALLETS_KEY } from './personal';
import {
  PERSONAL_BUDGETS_KEY,
  PERSONAL_HOLDINGS_KEY,
  PERSONAL_LIST_KEY,
  PERSONAL_PLANNED_KEY,
  PERSONAL_RECURRING_KEY,
  PERSONAL_REPORT_KEY,
  PERSONAL_SUMMARY_KEY,
  useWalletDetails,
} from './personalMoney';
import { requestTxCopySync } from './txCopy/hooks';

export { PERSONAL_PLANNED_KEY, PERSONAL_RECURRING_KEY } from './personalMoney';

const EMPTY_UPCOMING: UpcomingItem[] = [];
const EMPTY_WALLETS: WalletDetailView[] = [];

export interface UpcomingCurrencyTotal {
  currency: CurrencyCode;
  out: number;
  in: number;
}

async function invalidateRecurring(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: PERSONAL_RECURRING_KEY }),
    queryClient.invalidateQueries({ queryKey: PERSONAL_PLANNED_KEY }),
  ]);
}

async function invalidateRecurringWithMoney(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    invalidateRecurring(queryClient),
    queryClient.invalidateQueries({ queryKey: WALLETS_KEY }),
    queryClient.invalidateQueries({ queryKey: PERSONAL_SUMMARY_KEY }),
    queryClient.invalidateQueries({ queryKey: PERSONAL_LIST_KEY }),
    queryClient.invalidateQueries({ queryKey: PERSONAL_HOLDINGS_KEY }),
    queryClient.invalidateQueries({ queryKey: PERSONAL_REPORT_KEY }),
    queryClient.invalidateQueries({ queryKey: PERSONAL_BUDGETS_KEY }),
    requestTxCopySync(),
  ]);
}

/** Totals upcoming items by currency and direction (expense+buy -> out, income -> in, transfers excluded). */
export function upcomingTotals(
  items: UpcomingItem[],
  wallets: Pick<WalletDetailView, 'id' | 'currency'>[],
): { totals: UpcomingCurrencyTotal[]; vndOut: number } {
  const walletCurrency = new Map<string, CurrencyCode>();
  for (const w of wallets) {
    walletCurrency.set(w.id, w.currency);
  }

  const byCurrency = new Map<CurrencyCode, { out: number; in: number }>();

  for (const item of items) {
    if (item.draft.type === 'transfer') continue;
    const currency = walletCurrency.get(item.draft.walletId);
    if (!currency) continue;

    let entry = byCurrency.get(currency);
    if (!entry) {
      entry = { out: 0, in: 0 };
      byCurrency.set(currency, entry);
    }

    if (item.draft.type === 'expense' || item.draft.type === 'buy') {
      entry.out += item.draft.amount;
    } else if (item.draft.type === 'income') {
      entry.in += item.draft.amount;
    }
  }

  const totals: UpcomingCurrencyTotal[] = [];
  for (const [currency, { out, in: incoming }] of byCurrency.entries()) {
    totals.push({ currency, out, in: incoming });
  }

  const vndOut = byCurrency.get('VND')?.out ?? 0;
  return { totals, vndOut };
}

export function useRecurringRules(opts?: {
  enabled?: boolean;
}): UseQueryResult<RecurringRulesResponse, ApiClientError> {
  return useQuery<RecurringRulesResponse, ApiClientError>({
    queryKey: PERSONAL_RECURRING_KEY,
    queryFn: () => apiFetch<RecurringRulesResponse>('/api/me/personal/recurring/rules'),
    enabled: opts?.enabled ?? true,
  });
}

export function useCreateRule() {
  const queryClient = useQueryClient();

  return useMutation<RecurringRuleResponse, ApiClientError, RecurringRuleInput>({
    mutationFn: (input: RecurringRuleInput) =>
      apiSend<RecurringRuleResponse>('/api/me/personal/recurring/rules', 'POST', input),
    onSuccess: () => invalidateRecurringWithMoney(queryClient),
  });
}

export function useUpdateRule() {
  const queryClient = useQueryClient();

  return useMutation<
    RecurringRuleResponse,
    ApiClientError,
    { id: string; input: Partial<RecurringRuleInput> }
  >({
    mutationFn: ({ id, input }) =>
      apiSend<RecurringRuleResponse>(
        `/api/me/personal/recurring/rules/${encodeURIComponent(id)}`,
        'PATCH',
        input,
      ),
    onSuccess: () => invalidateRecurring(queryClient),
  });
}

export function usePauseRule() {
  const queryClient = useQueryClient();

  return useMutation<RecurringRuleResponse, ApiClientError, string>({
    mutationFn: (id: string) =>
      apiSend<RecurringRuleResponse>(
        `/api/me/personal/recurring/rules/${encodeURIComponent(id)}/pause`,
        'POST',
      ),
    onSuccess: () => invalidateRecurring(queryClient),
  });
}

export function useResumeRule() {
  const queryClient = useQueryClient();

  return useMutation<RecurringRuleResponse, ApiClientError, string>({
    mutationFn: (id: string) =>
      apiSend<RecurringRuleResponse>(
        `/api/me/personal/recurring/rules/${encodeURIComponent(id)}/resume`,
        'POST',
      ),
    onSuccess: () => invalidateRecurring(queryClient),
  });
}

export function useDeleteRule() {
  const queryClient = useQueryClient();

  return useMutation<{ ok: true }, ApiClientError, string>({
    mutationFn: (id: string) =>
      apiSend<{ ok: true }>(
        `/api/me/personal/recurring/rules/${encodeURIComponent(id)}`,
        'DELETE',
      ),
    onSuccess: () => invalidateRecurring(queryClient),
  });
}

export function useRuleFromTransaction() {
  const queryClient = useQueryClient();

  return useMutation<RecurringRuleResponse, ApiClientError, string>({
    mutationFn: (transactionId: string) =>
      apiSend<RecurringRuleResponse>(
        `/api/me/personal/recurring/rules/from/${encodeURIComponent(transactionId)}`,
        'POST',
      ),
    onSuccess: () => invalidateRecurring(queryClient),
  });
}

export function usePlannedItems(opts?: {
  enabled?: boolean;
}): UseQueryResult<PlannedItemsResponse, ApiClientError> {
  return useQuery<PlannedItemsResponse, ApiClientError>({
    queryKey: PERSONAL_PLANNED_KEY,
    queryFn: () => apiFetch<PlannedItemsResponse>('/api/me/personal/planned'),
    enabled: opts?.enabled ?? true,
  });
}

export function useConfirmPlanned() {
  const queryClient = useQueryClient();

  return useMutation<
    { ok: true; transactionId: string | null },
    ApiClientError,
    { id: string; input?: ConfirmPlannedInput }
  >({
    mutationFn: ({ id, input }) =>
      apiSend<{ ok: true; transactionId: string | null }>(
        `/api/me/personal/planned/${encodeURIComponent(id)}/confirm`,
        'POST',
        input ?? {},
      ),
    onSuccess: () => invalidateRecurringWithMoney(queryClient),
  });
}

export function useSkipPlanned() {
  const queryClient = useQueryClient();

  return useMutation<{ ok: true }, ApiClientError, string>({
    mutationFn: (id: string) =>
      apiSend<{ ok: true }>(`/api/me/personal/planned/${encodeURIComponent(id)}/skip`, 'POST'),
    onSuccess: () => invalidateRecurring(queryClient),
  });
}

export function useUpcoming(days = 30): {
  items: UpcomingItem[];
  totals: UpcomingCurrencyTotal[];
  vndOut: number;
  ready: boolean;
} {
  const rulesQuery = useRecurringRules();
  const walletsQuery = useWalletDetails();
  const today = vnDate(new Date());

  const rules = rulesQuery.data?.rules;
  const wallets = walletsQuery.data?.wallets ?? EMPTY_WALLETS;
  const ready = Boolean(rulesQuery.data && walletsQuery.data);

  const items = useMemo(
    () => (rules ? upcomingOccurrences(rules, today, days) : EMPTY_UPCOMING),
    [rules, today, days],
  );

  const { totals, vndOut } = useMemo(
    () => upcomingTotals(items, wallets),
    [items, wallets],
  );

  return { items, totals, vndOut, ready };
}
