import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiSend } from '../api/client';

/**
 * Runs a POST (or a PATCH, or a DELETE, which sends no body) under `/api/trips/:tripId`, then refreshes the trip.
 * Keeps its own busy and error state so the buttons that call it can show a spinner and the error can sit next to them.
 */
export function useTripAction(tripId: string) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const run = useCallback(
    async (path: string, body: unknown = {}, method: 'POST' | 'PATCH' | 'DELETE' = 'POST') => {
      setBusy(true);
      setError(null);
      try {
        await apiSend(`/api/trips/${tripId}${path}`, method, method === 'DELETE' ? undefined : body, tripId);
        await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
      } catch (err) {
        setError(err);
      } finally {
        setBusy(false);
      }
    },
    [tripId, queryClient],
  );

  return { busy, error, run };
}
