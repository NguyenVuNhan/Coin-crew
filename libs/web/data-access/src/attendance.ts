import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { AttendanceView } from '@cc/core';
import { apiFetch } from './client';

/** Admin-only attendance scores for a group (`GET /api/trips/:id/attendance`); 403 for everyone else. */
export function useAttendance(tripId: string, opts: { enabled: boolean }): UseQueryResult<AttendanceView> {
  return useQuery<AttendanceView>({
    queryKey: ['attendance', tripId],
    queryFn: () => apiFetch<AttendanceView>(`/api/trips/${encodeURIComponent(tripId)}/attendance`, { tripId }),
    enabled: opts.enabled,
    retry: false,
  });
}
