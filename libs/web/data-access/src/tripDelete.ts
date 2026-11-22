import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiSend, type ApiClientError } from './client';
import { WALLETS_KEY } from './personal';
import {
  PERSONAL_HOLDINGS_KEY,
  PERSONAL_LIST_KEY,
  PERSONAL_SUMMARY_KEY,
} from './personalMoney';
import { requestGroupCopySync } from './txCopy/groupCopy';

export interface ScheduleTripDeleteResponse {
  deleteAfter: string;
}

async function invalidateAfterDeleteToggle(queryClient: QueryClient, tripId: string): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['trip', tripId] }),
    queryClient.invalidateQueries({ queryKey: ['trips'] }),
    queryClient.invalidateQueries({ queryKey: WALLETS_KEY }),
    queryClient.invalidateQueries({ queryKey: PERSONAL_SUMMARY_KEY }),
    queryClient.invalidateQueries({ queryKey: PERSONAL_LIST_KEY }),
    queryClient.invalidateQueries({ queryKey: PERSONAL_HOLDINGS_KEY }),
  ]);
  void requestGroupCopySync();
}

/** Schedules 30-day delayed permanent deletion for an archived group. */
export function useScheduleTripDelete(tripId: string) {
  const queryClient = useQueryClient();

  return useMutation<ScheduleTripDeleteResponse, ApiClientError, void>({
    mutationFn: () =>
      apiSend<ScheduleTripDeleteResponse>(`/api/trips/${tripId}/delete`, 'POST', undefined, tripId),
    onSuccess: () => invalidateAfterDeleteToggle(queryClient, tripId),
  });
}

/** Cancels scheduled permanent deletion, returning the group to archived state. */
export function useCancelTripDelete(tripId: string) {
  const queryClient = useQueryClient();

  return useMutation<void, ApiClientError, void>({
    mutationFn: () => apiSend<void>(`/api/trips/${tripId}/cancel-delete`, 'POST', undefined, tripId),
    onSuccess: () => invalidateAfterDeleteToggle(queryClient, tripId),
  });
}
