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
  summarizeEvent,
  type ApplyEventExistingInput,
  type BudgetProgress,
  type CountedSpendRow,
  type CreateEventInput,
  type EventRowsResponse,
  type EventSavedResponse,
  type EventsResponse,
  type EventSummary,
  type EventView,
  type UpdateEventInput,
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

export const PERSONAL_EVENTS_KEY = ['personal', 'events'] as const;

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

async function invalidateEventData(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: PERSONAL_EVENTS_KEY }),
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
export function useEvents(opts?: {
  enabled?: boolean;
}): UseQueryResult<EventsResponse, ApiClientError> {
  return useQuery<EventsResponse, ApiClientError>({
    queryKey: PERSONAL_EVENTS_KEY,
    queryFn: () => apiFetch<EventsResponse>('/api/me/personal/events'),
    enabled: opts?.enabled ?? true,
  });
}

/** Creates a new trip, attaching `todayLocal()`. */
export function useCreateEvent(): UseMutationResult<
  EventSavedResponse,
  ApiClientError,
  Omit<CreateEventInput, 'today'>
> {
  const queryClient = useQueryClient();

  return useMutation<EventSavedResponse, ApiClientError, Omit<CreateEventInput, 'today'>>({
    mutationFn: (input) =>
      apiSend<EventSavedResponse>('/api/me/personal/events', 'POST', {
        ...input,
        today: todayLocal(),
      }),
    onSuccess: () => invalidateEventData(queryClient),
  });
}

/** Updates an existing trip, attaching `todayLocal()`. */
export function useUpdateEvent(): UseMutationResult<
  EventSavedResponse,
  ApiClientError,
  { id: string; input: Omit<UpdateEventInput, 'today'> }
> {
  const queryClient = useQueryClient();

  return useMutation<
    EventSavedResponse,
    ApiClientError,
    { id: string; input: Omit<UpdateEventInput, 'today'> }
  >({
    mutationFn: ({ id, input }) =>
      apiSend<EventSavedResponse>(
        `/api/me/personal/events/${encodeURIComponent(id)}`,
        'PATCH',
        {
          ...input,
          today: todayLocal(),
        },
      ),
    onSuccess: () => invalidateEventData(queryClient),
  });
}

/** Deletes a trip by ID. */
export function useDeleteEvent(): UseMutationResult<void, ApiClientError, string> {
  const queryClient = useQueryClient();

  return useMutation<void, ApiClientError, string>({
    mutationFn: (id) =>
      apiSend<void>(`/api/me/personal/events/${encodeURIComponent(id)}`, 'DELETE'),
    onSuccess: () => invalidateEventData(queryClient),
  });
}

/** Stops a running event as of today. */
export function useStopEvent(): UseMutationResult<
  { event: EventView },
  ApiClientError,
  string
> {
  const queryClient = useQueryClient();

  return useMutation<{ event: EventView }, ApiClientError, string>({
    mutationFn: (id) =>
      apiSend<{ event: EventView }>(
        `/api/me/personal/events/${encodeURIComponent(id)}/stop`,
        'POST',
        { today: todayLocal() },
      ),
    onSuccess: () => invalidateEventData(queryClient),
  });
}

/** Resumes a stopped event as of today. */
export function useResumeEvent(): UseMutationResult<
  EventSavedResponse,
  ApiClientError,
  string
> {
  const queryClient = useQueryClient();

  return useMutation<EventSavedResponse, ApiClientError, string>({
    mutationFn: (id) =>
      apiSend<EventSavedResponse>(
        `/api/me/personal/events/${encodeURIComponent(id)}/resume`,
        'POST',
        { today: todayLocal() },
      ),
    onSuccess: () => invalidateEventData(queryClient),
  });
}

/** Starts an upcoming event immediately as of today. */
export function useStartEventNow(): UseMutationResult<
  EventSavedResponse,
  ApiClientError,
  string
> {
  const queryClient = useQueryClient();

  return useMutation<EventSavedResponse, ApiClientError, string>({
    mutationFn: (id) =>
      apiSend<EventSavedResponse>(
        `/api/me/personal/events/${encodeURIComponent(id)}/start-now`,
        'POST',
        { today: todayLocal() },
      ),
    onSuccess: () => invalidateEventData(queryClient),
  });
}

/** Applies or skips tagging existing matching expenses and group shares for a trip. */
export function useApplyEventExisting(): UseMutationResult<
  { tagged: number },
  ApiClientError,
  { id: string; tag: boolean; ownIds?: string[]; shareRootIds?: string[] }
> {
  const queryClient = useQueryClient();

  return useMutation<
    { tagged: number },
    ApiClientError,
    { id: string; tag: boolean; ownIds?: string[]; shareRootIds?: string[] }
  >({
    mutationFn: ({ id, tag, ownIds, shareRootIds }) =>
      apiSend<{ tagged: number }>(
        `/api/me/personal/events/${encodeURIComponent(id)}/existing`,
        'POST',
        {
          tag,
          ...(ownIds !== undefined ? { ownIds } : {}),
          ...(shareRootIds !== undefined ? { shareRootIds } : {}),
        } satisfies ApplyEventExistingInput,
      ),
    onSuccess: () => invalidateEventData(queryClient),
  });
}

/**
 * On mount and whenever the local group-copy key changes, tags matching group shares
 * on the server when at least one trip exists; triggers a group-copy sync when `tagged > 0`.
 */
export function useEventShareSync(): void {
  const eventsQuery = useEvents();
  const groupCopy = useGroupCopySafe();
  const hasEvents = (eventsQuery.data?.events.length ?? 0) > 0;
  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!hasEvents) return;
    if (groupCopy.status === 'opening' || groupCopy.status === 'loading') return;

    const syncKey =
      groupCopy.status === 'ready' && groupCopy.snapshot
        ? groupCopy.snapshot.key
        : '__mount__';
    if (lastKeyRef.current === syncKey) return;
    lastKeyRef.current = syncKey;

    void apiSend<{ tagged: number }>('/api/me/personal/events/tag-shares', 'POST', {
      today: todayLocal(),
    })
      .then((res) => {
        if (res.tagged > 0) {
          void requestGroupCopySync();
        }
      })
      .catch(() => {
        // Best-effort background sync; ignore transient errors.
      });
  }, [hasEvents, groupCopy.status, groupCopy.snapshot?.key]);
}

const EMPTY_ROWS: CountedSpendRow[] = [];

/** Computes a trip's spending summary from local copy (or server fallback) and linked budget progress. */
export function useEventSummary(id: string): {
  event: EventView | null;
  summary: EventSummary | null;
  progress: BudgetProgress | null;
  isPending: boolean;
  error: unknown;
} {
  const enabled = Boolean(id);
  const eventsQuery = useEvents({ enabled });
  const event = useMemo(
    () => eventsQuery.data?.events.find((t) => t.id === id) ?? null,
    [eventsQuery.data, id],
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

  const eventRowsEnabled =
    enabled && source === 'server' && Boolean(event) && event?.tagId !== null;
  const eventRowsQuery = useQuery<EventRowsResponse, ApiClientError>({
    queryKey: [...PERSONAL_EVENTS_KEY, id, 'rows'],
    queryFn: () =>
      apiFetch<EventRowsResponse>(`/api/me/personal/events/${encodeURIComponent(id)}/rows`),
    enabled: eventRowsEnabled,
    retry: false,
  });

  let rows: CountedSpendRow[];
  let rowsPending: boolean;
  let rowsError: ApiClientError | null;

  if (event && event.tagId === null) {
    rows = EMPTY_ROWS;
    rowsPending = false;
    rowsError = null;
  } else if (source === 'copy') {
    rows = sourceRows;
    rowsPending = sourcePending;
    rowsError = sourceError;
  } else if (source === 'pending') {
    rows = EMPTY_ROWS;
    rowsPending = true;
    rowsError = sourceError;
  } else if (!eventRowsEnabled) {
    rows = EMPTY_ROWS;
    rowsPending = sourcePending;
    rowsError = sourceError;
  } else if (eventRowsQuery.isSuccess) {
    // /rows succeeded: ignore sourcePending and sourceError so budgets/progress cannot block or fail it.
    rows = eventRowsQuery.data.rows;
    rowsPending = false;
    rowsError = null;
  } else if (eventRowsQuery.isError) {
    // /rows failed: fall back to useBudgetsSource server rows (even if empty) unless it also errored.
    if (sourceError) {
      rows = EMPTY_ROWS;
      rowsPending = false;
      rowsError = eventRowsQuery.error;
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

  const hasBudget = Boolean(event?.budgetId);
  const budgetsProgress = useBudgetsProgress({ enabled: enabled && hasBudget });

  const summary = useMemo(() => {
    if (!event || !wallets || rowsPending || rowsError) return null;
    return summarizeEvent(event, rows, wallets, categories);
  }, [event, wallets, rowsPending, rowsError, rows, categories]);

  const progress = useMemo(() => {
    if (!event?.budgetId) return null;
    return budgetsProgress.current.find((p) => p.budgetId === event.budgetId) ?? null;
  }, [event?.budgetId, budgetsProgress.current]);

  const isPending =
    eventsQuery.isPending ||
    rowsPending ||
    walletsQuery.isPending ||
    (hasBudget && budgetsProgress.isPending);

  const error =
    eventsQuery.error ??
    rowsError ??
    walletsQuery.error ??
    (hasBudget ? budgetsProgress.error : null) ??
    null;

  return {
    event,
    summary,
    progress,
    isPending,
    error,
  };
}
