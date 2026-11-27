import { useEffect, useMemo, useRef } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import {
  summarizeTravel,
  type ApplyTravelExistingInput,
  type BudgetProgress,
  type CountedSpendRow,
  type CreateTravelInput,
  type TravelRowsResponse,
  type TravelSavedResponse,
  type TravelsResponse,
  type TravelSummary,
  type TravelView,
  type UpdateTravelInput,
} from '@cc/core';
import { todayLocal } from '@cc/web-util/localDate';
import { apiFetch, apiSend, type ApiClientError } from './client';
import { useBudgetsProgress, useBudgetsSource } from './budgets';
import { WALLETS_KEY } from './personal';
import {
  PERSONAL_BUDGETS_KEY,
  PERSONAL_HOLDINGS_KEY,
  PERSONAL_LIST_KEY,
  PERSONAL_REPORT_KEY,
  PERSONAL_SUMMARY_KEY,
  PERSONAL_TAGS_KEY,
  useWalletDetails,
} from './personalMoney';
import * as groupCopyMod from './txCopy/groupCopy';
import { requestGroupCopySync } from './txCopy/groupCopy';
import { requestTxCopySync } from './txCopy/hooks';

export const PERSONAL_TRAVELS_KEY = ['personal', 'travels'] as const;

const UNAVAILABLE_GROUP_COPY: ReturnType<typeof groupCopyMod.useGroupCopy> = {
  status: 'unavailable',
  snapshot: null,
};

const useGroupCopySafe: typeof groupCopyMod.useGroupCopy = (() => {
  try {
    const fn = (groupCopyMod as Record<string, unknown>)['useGroupCopy'];
    if (typeof fn === 'function') return fn as typeof groupCopyMod.useGroupCopy;
  } catch {
    // ignore partial test mocks
  }
  return () => UNAVAILABLE_GROUP_COPY;
})();

async function invalidateTravelData(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: PERSONAL_TRAVELS_KEY }),
    queryClient.invalidateQueries({ queryKey: PERSONAL_BUDGETS_KEY }),
    queryClient.invalidateQueries({ queryKey: PERSONAL_TAGS_KEY }),
    queryClient.invalidateQueries({ queryKey: WALLETS_KEY }),
    queryClient.invalidateQueries({ queryKey: PERSONAL_SUMMARY_KEY }),
    queryClient.invalidateQueries({ queryKey: PERSONAL_LIST_KEY }),
    queryClient.invalidateQueries({ queryKey: PERSONAL_HOLDINGS_KEY }),
    queryClient.invalidateQueries({ queryKey: PERSONAL_REPORT_KEY }),
    requestTxCopySync(),
    requestGroupCopySync(),
  ]);
}

/** Fetches the user's personal trips. */
export function useTravels(opts?: {
  enabled?: boolean;
}): UseQueryResult<TravelsResponse, ApiClientError> {
  return useQuery<TravelsResponse, ApiClientError>({
    queryKey: PERSONAL_TRAVELS_KEY,
    queryFn: () => apiFetch<TravelsResponse>('/api/me/personal/travels'),
    enabled: opts?.enabled ?? true,
  });
}

/** Creates a new trip, attaching `todayLocal()`. */
export function useCreateTravel(): UseMutationResult<
  TravelSavedResponse,
  ApiClientError,
  Omit<CreateTravelInput, 'today'>
> {
  const queryClient = useQueryClient();

  return useMutation<TravelSavedResponse, ApiClientError, Omit<CreateTravelInput, 'today'>>({
    mutationFn: (input) =>
      apiSend<TravelSavedResponse>('/api/me/personal/travels', 'POST', {
        ...input,
        today: todayLocal(),
      }),
    onSuccess: () => invalidateTravelData(queryClient),
  });
}

/** Updates an existing trip, attaching `todayLocal()`. */
export function useUpdateTravel(): UseMutationResult<
  TravelSavedResponse,
  ApiClientError,
  { id: string; input: Omit<UpdateTravelInput, 'today'> }
> {
  const queryClient = useQueryClient();

  return useMutation<
    TravelSavedResponse,
    ApiClientError,
    { id: string; input: Omit<UpdateTravelInput, 'today'> }
  >({
    mutationFn: ({ id, input }) =>
      apiSend<TravelSavedResponse>(
        `/api/me/personal/travels/${encodeURIComponent(id)}`,
        'PATCH',
        {
          ...input,
          today: todayLocal(),
        },
      ),
    onSuccess: () => invalidateTravelData(queryClient),
  });
}

/** Deletes a trip by ID. */
export function useDeleteTravel(): UseMutationResult<void, ApiClientError, string> {
  const queryClient = useQueryClient();

  return useMutation<void, ApiClientError, string>({
    mutationFn: (id) =>
      apiSend<void>(`/api/me/personal/travels/${encodeURIComponent(id)}`, 'DELETE'),
    onSuccess: () => invalidateTravelData(queryClient),
  });
}

/** Applies or skips tagging existing matching expenses and group shares for a trip. */
export function useApplyTravelExisting(): UseMutationResult<
  { tagged: number },
  ApiClientError,
  { id: string; tag: boolean }
> {
  const queryClient = useQueryClient();

  return useMutation<{ tagged: number }, ApiClientError, { id: string; tag: boolean }>({
    mutationFn: ({ id, tag }) =>
      apiSend<{ tagged: number }>(
        `/api/me/personal/travels/${encodeURIComponent(id)}/existing`,
        'POST',
        { tag } satisfies ApplyTravelExistingInput,
      ),
    onSuccess: () => invalidateTravelData(queryClient),
  });
}

/**
 * On mount and whenever the local group-copy key changes, tags matching group shares
 * on the server when at least one trip exists; triggers a group-copy sync when `tagged > 0`.
 */
export function useTravelShareSync(): void {
  const travelsQuery = useTravels();
  const groupCopy = useGroupCopySafe();
  const hasTravels = (travelsQuery.data?.travels.length ?? 0) > 0;
  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!hasTravels) return;
    if (groupCopy.status === 'opening' || groupCopy.status === 'loading') return;

    const syncKey =
      groupCopy.status === 'ready' && groupCopy.snapshot
        ? groupCopy.snapshot.key
        : '__mount__';
    if (lastKeyRef.current === syncKey) return;
    lastKeyRef.current = syncKey;

    let cancelled = false;
    void apiSend<{ tagged: number }>('/api/me/personal/travels/tag-shares', 'POST', {
      today: todayLocal(),
    })
      .then((res) => {
        if (!cancelled && res.tagged > 0) {
          void requestGroupCopySync();
        }
      })
      .catch(() => {
        // Best-effort background sync; ignore transient errors.
      });

    return () => {
      cancelled = true;
    };
  }, [hasTravels, groupCopy.status, groupCopy.snapshot?.key]);
}

const EMPTY_ROWS: CountedSpendRow[] = [];

/** Computes a trip's spending summary from local copy (or server fallback) and linked budget progress. */
export function useTravelSummary(id: string): {
  travel: TravelView | null;
  summary: TravelSummary | null;
  progress: BudgetProgress | null;
  isPending: boolean;
  error: unknown;
} {
  const enabled = Boolean(id);
  const travelsQuery = useTravels({ enabled });
  const travel = useMemo(
    () => travelsQuery.data?.travels.find((t) => t.id === id) ?? null,
    [travelsQuery.data, id],
  );

  const {
    source,
    rows: sourceRows,
    categories,
    isPending: sourcePending,
    error: sourceError,
  } = useBudgetsSource({
    enabled,
    allowServerFallback: true,
  });

  const travelRowsEnabled = enabled && source === 'server' && Boolean(travel);
  const travelRowsQuery = useQuery<TravelRowsResponse, ApiClientError>({
    queryKey: [...PERSONAL_TRAVELS_KEY, id, 'rows'],
    queryFn: () =>
      apiFetch<TravelRowsResponse>(`/api/me/personal/travels/${encodeURIComponent(id)}/rows`),
    enabled: travelRowsEnabled,
    retry: false,
  });

  let rows: CountedSpendRow[];
  let rowsPending: boolean;
  let rowsError: ApiClientError | null;

  if (source === 'copy') {
    rows = sourceRows;
    rowsPending = sourcePending;
    rowsError = sourceError;
  } else if (source === 'pending') {
    rows = EMPTY_ROWS;
    rowsPending = true;
    rowsError = sourceError;
  } else if (!travelRowsEnabled) {
    rows = EMPTY_ROWS;
    rowsPending = sourcePending;
    rowsError = sourceError;
  } else if (travelRowsQuery.isSuccess) {
    // /rows succeeded: ignore sourcePending and sourceError so budgets/progress cannot block or fail it.
    rows = travelRowsQuery.data.rows;
    rowsPending = false;
    rowsError = null;
  } else if (travelRowsQuery.isError) {
    // /rows failed: fall back to useBudgetsSource server rows (even if empty) unless it also errored.
    if (sourceError) {
      rows = EMPTY_ROWS;
      rowsPending = false;
      rowsError = travelRowsQuery.error;
    } else {
      rows = sourceRows;
      rowsPending = sourcePending;
      rowsError = null;
    }
  } else {
    rows = EMPTY_ROWS;
    rowsPending = true;
    rowsError = null;
  }

  const walletsQuery = useWalletDetails({ enabled });
  const wallets = walletsQuery.data?.wallets;

  const hasBudget = Boolean(travel?.budgetId);
  const budgetsProgress = useBudgetsProgress({ enabled: enabled && hasBudget });

  const summary = useMemo(() => {
    if (!travel || !wallets || rowsPending || rowsError) return null;
    return summarizeTravel(travel, rows, wallets, categories);
  }, [travel, wallets, rowsPending, rowsError, rows, categories]);

  const progress = useMemo(() => {
    if (!travel?.budgetId) return null;
    return budgetsProgress.current.find((p) => p.budgetId === travel.budgetId) ?? null;
  }, [travel?.budgetId, budgetsProgress.current]);

  const isPending =
    travelsQuery.isPending ||
    rowsPending ||
    walletsQuery.isPending ||
    (hasBudget && budgetsProgress.isPending);

  const error =
    travelsQuery.error ??
    rowsError ??
    walletsQuery.error ??
    (hasBudget ? budgetsProgress.error : null) ??
    null;

  return {
    travel,
    summary,
    progress,
    isPending,
    error,
  };
}
