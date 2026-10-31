import { useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { GroupPerson, PayInfo, PersonKey, PersonSummary, PeopleSummaryResponse } from '@fsl/core';
import { apiFetch, apiSend, ApiClientError } from './client';

export const PEOPLE_SUMMARY_QUERY_KEY = ['me', 'people', 'summary'] as const;

export function usePeopleSummary(): {
  people: PersonSummary[] | undefined;
  incomplete: boolean;
  isLoading: boolean;
  error: ApiClientError | null;
  refetch(): void;
} {
  const query = useQuery<PeopleSummaryResponse, ApiClientError>({
    queryKey: PEOPLE_SUMMARY_QUERY_KEY,
    queryFn: () => apiFetch<PeopleSummaryResponse>('/api/me/people/summary'),
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const refetchRef = useRef(query.refetch);
  refetchRef.current = query.refetch;

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (query.data?.incomplete && retryCountRef.current < 8) {
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        retryCountRef.current += 1;
        void refetchRef.current();
      }, 500);
    } else if (query.data && !query.data.incomplete) {
      retryCountRef.current = 0;
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [query.data?.incomplete, query.dataUpdatedAt]);

  const refetch = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    retryCountRef.current = 0;
    void query.refetch();
  }, [query]);

  return {
    people: query.data?.people,
    incomplete: query.data?.incomplete ?? false,
    isLoading: query.isLoading,
    error: (query.error as ApiClientError) ?? null,
    refetch,
  };
}

export function useLedger(): {
  ledger: { tripId: string; ownerPid: string } | undefined;
  isLoading: boolean;
} {
  const query = useQuery<{ tripId: string; ownerPid: string }, ApiClientError>({
    queryKey: ['me', 'ledger'],
    queryFn: () => apiFetch<{ tripId: string; ownerPid: string }>('/api/me/ledger'),
  });

  return {
    ledger: query.data,
    isLoading: query.isLoading,
  };
}

export async function requestLink(key: PersonKey): Promise<{ url: string }> {
  return apiSend<{ url: string }>(
    `/api/me/people/${encodeURIComponent(key)}/request-link`,
    'POST',
  );
}

/** One key per submit (a sheet open, a page load), reused on every retry so the server writes it once. */
export function newIdempotencyKey(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    // Not a secure context: fall through.
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Runs `send` again while the server is still adding things up (409 TRY_AGAIN), a few times. */
export async function withTryAgain<T>(send: () => Promise<T>, retries = 3, delayMs = 700): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await send();
    } catch (err) {
      if (!(err instanceof ApiClientError) || err.code !== 'TRY_AGAIN' || attempt >= retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

export async function settle(
  key: PersonKey,
  paid: number,
  direction: 'toOwner' | 'fromOwner',
  queryClient?: QueryClient,
  idempotencyKey?: string,
): Promise<{ settlementId: string; status: 'confirmed' | 'says_paid' }> {
  const result = await withTryAgain(() =>
    apiSend<{ settlementId: string; status: 'confirmed' | 'says_paid' }>(
      `/api/me/people/${encodeURIComponent(key)}/settle`,
      'POST',
      idempotencyKey ? { paid, direction, idempotencyKey } : { paid, direction },
    ),
  );
  if (queryClient) {
    await queryClient.invalidateQueries({ queryKey: PEOPLE_SUMMARY_QUERY_KEY });
  }
  return result;
}

export async function confirmSettlement(
  settlementId: string,
  queryClient?: QueryClient,
): Promise<void> {
  await apiSend<void>(
    `/api/me/settlements/${encodeURIComponent(settlementId)}/confirm`,
    'POST',
  );
  if (queryClient) {
    await queryClient.invalidateQueries({ queryKey: PEOPLE_SUMMARY_QUERY_KEY });
  }
}

export async function rejectSettlement(
  settlementId: string,
  queryClient?: QueryClient,
): Promise<void> {
  await apiSend<void>(
    `/api/me/settlements/${encodeURIComponent(settlementId)}/reject`,
    'POST',
  );
  if (queryClient) {
    await queryClient.invalidateQueries({ queryKey: PEOPLE_SUMMARY_QUERY_KEY });
  }
}

/** The person's VietQR for the netted total the caller owes them ("Settle up"). */
export function usePersonPay(key: PersonKey, enabled: boolean) {
  return useQuery<PayInfo, ApiClientError>({
    queryKey: ['me', 'people', key, 'pay'],
    queryFn: () => withTryAgain(() => apiFetch<PayInfo>(`/api/me/people/${encodeURIComponent(key)}/pay`)),
    enabled,
    staleTime: 0,
  });
}

export async function setNickname(
  key: PersonKey,
  nickname: string | null,
  queryClient?: QueryClient,
): Promise<void> {
  await apiSend<void>(
    `/api/me/people/${encodeURIComponent(key)}/nickname`,
    'PUT',
    { nickname },
  );
  if (queryClient) {
    await queryClient.invalidateQueries({ queryKey: PEOPLE_SUMMARY_QUERY_KEY });
  }
}

export async function linkPeople(
  keys: PersonKey[],
  queryClient?: QueryClient,
): Promise<{ key: PersonKey }> {
  const result = await apiSend<{ key: PersonKey }>(
    '/api/me/people/link',
    'POST',
    { keys },
  );
  if (queryClient) {
    await queryClient.invalidateQueries({ queryKey: PEOPLE_SUMMARY_QUERY_KEY });
  }
  return result;
}

export async function unlinkPerson(
  participantId: string,
  queryClient?: QueryClient,
): Promise<void> {
  await apiSend<void>(
    `/api/me/people/link/${encodeURIComponent(participantId)}`,
    'DELETE',
  );
  if (queryClient) {
    await queryClient.invalidateQueries({ queryKey: PEOPLE_SUMMARY_QUERY_KEY });
  }
}

export async function importPerson(
  input: { name: string } | { participantId: string },
  queryClient?: QueryClient,
): Promise<{ participantId: string }> {
  const result = await apiSend<{ participantId: string }>(
    '/api/me/ledger/people',
    'POST',
    input,
  );
  if (queryClient) {
    await queryClient.invalidateQueries({ queryKey: PEOPLE_SUMMARY_QUERY_KEY });
  }
  return result;
}

export function useInvalidatePeople(): () => Promise<void> {
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: PEOPLE_SUMMARY_QUERY_KEY }),
    [queryClient],
  );
}

/** People from my groups to pick into a quick expense; cached like `useRecentPeople`, failures just mean no suggestions. */
export function useGroupPeople() {
  return useQuery<GroupPerson[]>({
    queryKey: ['me', 'people', 'candidates'],
    queryFn: () => apiFetch<GroupPerson[]>('/api/me/people/candidates'),
    staleTime: 5 * 60_000,
    retry: false,
  });
}
