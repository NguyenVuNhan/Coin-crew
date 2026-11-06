import { useState } from 'react';

export type ListMode = 'mine' | 'all';

/**
 * A section's "only what involves me / everything" choice, remembered on this device under `storageKey`
 * (like Your transfers). Starts at "mine".
 */
export function useListMode(storageKey: string): [ListMode, () => void] {
  const [mode, setMode] = useState<ListMode>(() => {
    try {
      return localStorage.getItem(storageKey) === 'all' ? 'all' : 'mine';
    } catch {
      return 'mine';
    }
  });

  const toggle = () => {
    const next: ListMode = mode === 'mine' ? 'all' : 'mine';
    setMode(next);
    try {
      localStorage.setItem(storageKey, next);
    } catch {
      // storage blocked
    }
  };

  return [mode, toggle];
}
