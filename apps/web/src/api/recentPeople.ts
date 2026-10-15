import { useQuery } from '@tanstack/react-query';
import type { RecentPerson } from '@fsl/core';
import { apiFetch } from './client';

/**
 * The people with an account who shared a trip with me, for suggestions. One request when the screen opens,
 * cached for 5 minutes. Without it there are no suggestions: a failure is neither retried nor shown.
 */
export function useRecentPeople() {
  return useQuery<RecentPerson[]>({
    queryKey: ['me', 'people'],
    queryFn: () => apiFetch<RecentPerson[]>('/api/me/people'),
    staleTime: 5 * 60_000,
    retry: false,
  });
}
