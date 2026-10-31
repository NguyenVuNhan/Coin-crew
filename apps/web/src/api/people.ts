import { useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { PersonKey, PersonSummary, PeopleSummaryResponse } from '@fsl/core';
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

export async function settle(
  key: PersonKey,
  paid: number,
  direction: 'toOwner' | 'fromOwner',
  queryClient?: QueryClient,
): Promise<{ settlementId: string; status: 'confirmed' | 'says_paid' }> {
  const result = await apiSend<{ settlementId: string; status: 'confirmed' | 'says_paid' }>(
    `/api/me/people/${encodeURIComponent(key)}/settle`,
    'POST',
    { paid, direction },
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
