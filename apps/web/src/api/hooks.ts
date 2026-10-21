import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { TripView, MeResponse } from '@fsl/core';
import { apiFetch, ApiClientError } from './client';

function useIsDocumentVisible(): boolean {
  const [isVisible, setIsVisible] = useState(() =>
    typeof document !== 'undefined' ? document.visibilityState === 'visible' : true,
  );

  useEffect(() => {
    const onVisibilityChange = () => {
      setIsVisible(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return isVisible;
}

export function useTripView(
  tripId: string,
  pollMs: number,
  opts?: { stopAfterMs?: number },
): {
  view: TripView | undefined;
  error: ApiClientError | null;
  isLoading: boolean;
  stopped: boolean;
  resume(): void;
  refetch(): void;
} {
  const queryClient = useQueryClient();
  const isDocumentVisible = useIsDocumentVisible();
  const [stopped, setStopped] = useState(false);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopAfterMs = opts?.stopAfterMs;

  const startStopTimer = useCallback(() => {
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    if (stopAfterMs !== undefined && stopAfterMs > 0) {
      stopTimerRef.current = setTimeout(() => {
        setStopped(true);
      }, stopAfterMs);
    }
  }, [stopAfterMs]);

  useEffect(() => {
    setStopped(false);
    startStopTimer();
    return () => {
      if (stopTimerRef.current) {
        clearTimeout(stopTimerRef.current);
      }
    };
  }, [startStopTimer]);

  const resume = useCallback(() => {
    setStopped(false);
    startStopTimer();
  }, [startStopTimer]);

  // Coming back to the page restarts polling that paused while it sat open.
  const wasVisible = useRef(isDocumentVisible);
  useEffect(() => {
    if (isDocumentVisible && !wasVisible.current && stopped) resume();
    wasVisible.current = isDocumentVisible;
  }, [isDocumentVisible, stopped, resume]);

  const viewQuery = useQuery({
    queryKey: ['trip', tripId],
    queryFn: () => apiFetch<TripView>(`/api/trips/${tripId}`, { tripId }),
  });

  const view = viewQuery.data;
  const isViewLoaded = view !== undefined;
  const isPollingEnabled = isViewLoaded && isDocumentVisible && !stopped;

  const versionQuery = useQuery({
    queryKey: ['trip', tripId, 'version'],
    queryFn: () => apiFetch<{ version: number }>(`/api/trips/${tripId}/version`, { tripId }),
    enabled: isPollingEnabled,
    refetchInterval: isPollingEnabled ? pollMs : false,
  });

  const currentVersion = view?.trip.version;
  const polledVersion = versionQuery.data?.version;

  useEffect(() => {
    if (
      polledVersion !== undefined &&
      currentVersion !== undefined &&
      polledVersion !== currentVersion
    ) {
      queryClient.invalidateQueries({
        queryKey: ['trip', tripId],
        exact: true,
      });
    }
  }, [polledVersion, currentVersion, queryClient, tripId]);

  const error = (viewQuery.error as ApiClientError) ?? null;

  const refetch = useCallback(() => {
    viewQuery.refetch();
  }, [viewQuery]);

  return {
    view,
    error,
    isLoading: viewQuery.isLoading,
    stopped,
    resume,
    refetch,
  };
}

/** The signed-in user plus sign-in options and merge requests; fills in what an older API leaves out. */
export function useMe(opts?: { enabled?: boolean }) {
  return useQuery<MeResponse, Error, MeResponse>({
    enabled: opts?.enabled ?? true,
    queryKey: ['me'],
    queryFn: () => apiFetch<MeResponse>('/api/me'),
    select: (d) => {
      const p = d as Partial<MeResponse>;
      return {
        user: p.user ?? null,
        signIn: { zalo: p.signIn?.zalo === true },
        mergeRequests: {
          incoming: p.mergeRequests?.incoming ?? [],
          outgoing: p.mergeRequests?.outgoing ?? [],
        },
      };
    },
  });
}
