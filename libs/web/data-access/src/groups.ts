import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { TripListItem } from '@cc/core';
import { apiFetchWithHeaders, type ApiClientError } from './client';

/** Fetches the user's active group trips using the shared `['trips', 'active']` cache key. */
export function useMyGroups(opts?: {
  enabled?: boolean;
}): UseQueryResult<{ items: TripListItem[]; archivedCount: number }, ApiClientError> {
  return useQuery<{ items: TripListItem[]; archivedCount: number }, ApiClientError>({
    queryKey: ['trips', 'active'],
    queryFn: async () => {
      const { data, headers } = await apiFetchWithHeaders<TripListItem[]>(
        '/api/trips?archived=exclude',
      );
      const rawCount = Number(headers.get('X-Archived-Count') ?? '0');
      const archivedCount = Number.isFinite(rawCount) && rawCount > 0 ? rawCount : 0;
      return { items: data, archivedCount };
    },
    enabled: opts?.enabled ?? true,
  });
}
