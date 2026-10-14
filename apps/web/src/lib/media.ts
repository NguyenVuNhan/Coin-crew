import { useCallback, useSyncExternalStore } from 'react';

function mediaQueryList(query: string): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query) : null;
}

/** Whether a CSS media query matches right now. False where `window.matchMedia` is missing (tests, old browsers). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = mediaQueryList(query);
      list?.addEventListener('change', onChange);
      return () => list?.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => mediaQueryList(query)?.matches ?? false,
    () => false,
  );
}

/** Two-column layout from 1024px. */
export const useIsWide = () => useMediaQuery('(min-width: 1024px)');

/** A touch screen is the main pointer (phones), as opposed to a mouse. */
export const useIsCoarsePointer = () => useMediaQuery('(pointer: coarse)');

export const usePrefersReducedMotion = () => useMediaQuery('(prefers-reduced-motion: reduce)');
