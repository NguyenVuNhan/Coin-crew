import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { skipToken, useQuery } from '@tanstack/react-query';
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
 */
export function GroupThemeScope({ children }: { children: ReactNode }) {
  const { tripId } = useTrip();
  const { data: view } = useQuery<TripView>({ queryKey: ['trip', tripId], queryFn: skipToken });
  const raw = view?.trip.theme;
  const theme = isThemeId(raw) ? raw : null;

  useEffect(() => {
    setGroupTheme(theme);
  }, [theme]);

  useEffect(() => () => setGroupTheme(null), []);

  return <>{children}</>;
}
