import { useCallback, useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { notifyManager, useQueryClient } from '@tanstack/react-query';
import { isThemeId, type ThemeId, type TripView } from '@cc/core';
import { useTrip } from './tripBase';

/** The colours of the group in view, or null outside a group (or in a group without colours). */
let groupTheme: ThemeId | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ThemeId | null {
  return groupTheme;
}

/** Report the colours of the group in view; null when none (or when leaving the group). */
export function setGroupTheme(id: ThemeId | null): void {
  if (id === groupTheme) return;
  groupTheme = id;
  for (const listener of listeners) listener();
}

/** The colours of the group in view, as reported by the mounted `GroupThemeScope`. */
export function useGroupTheme(): ThemeId | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Wraps a group's pages and reports the group's colours to `ThemeController`. It only reads the cached trip view
 * (the screens fetch it), so it never adds a request; it clears the colours when the group's pages unmount.
 *
 * It reads the cache directly rather than through a query observer: an observer here would hand its options to the
 * trip view's query whenever it re-rendered last, and a refetch would then run without the screens' `queryFn`.
 *
 * While the view is missing from the cache, it keeps the last colours this group reported. "Who are you?" drops the
 * cached view after a guest picks a name, and the next screen fetches it again; without this the page would flash to
 * the default colours and back. A different group never inherits them.
 */
export function GroupThemeScope({ children }: { children: ReactNode }) {
  const { tripId } = useTrip();
  const queryClient = useQueryClient();
  // Batched like TanStack's own cache hooks, so a query added while another component renders doesn't update this one mid-render.
  const subscribeToCache = useCallback(
    (onChange: () => void) => queryClient.getQueryCache().subscribe(notifyManager.batchCalls(onChange)),
    [queryClient],
  );
  const view = useSyncExternalStore(subscribeToCache, () => queryClient.getQueryData<TripView>(['trip', tripId]));
  const raw = view?.trip.theme;
  // undefined: no view in the cache right now; null: the group has no colours.
  const cached: ThemeId | null | undefined = view === undefined ? undefined : isThemeId(raw) ? raw : null;
  const lastKnown = useRef<{ tripId: string; theme: ThemeId | null } | null>(null);

  // Layout effects, so the colours change before the browser paints the group's content (or the page after it).
  useLayoutEffect(() => {
    if (cached !== undefined) {
      lastKnown.current = { tripId, theme: cached };
      setGroupTheme(cached);
    } else {
      setGroupTheme(lastKnown.current?.tripId === tripId ? lastKnown.current.theme : null);
    }
  }, [tripId, cached]);

  useLayoutEffect(() => () => setGroupTheme(null), []);

  return <>{children}</>;
}
