import { useCallback, useState } from 'react';

export type FoldPart = 'amount' | 'category' | 'details';

export interface UseEntryFoldOptions {
  enabled: boolean;
  isEdit: boolean;
}

export interface EntryFoldState {
  isOpen(part: FoldPart): boolean;
  open(part: FoldPart): void;
  finish(part: FoldPart): void;
}

function initialFoldState(isEdit: boolean): Record<FoldPart, boolean> {
  return isEdit
    ? { amount: false, category: false, details: true }
    : { amount: true, category: false, details: false };
}

/**
 * Tracks which sections of the phone entry flow are expanded.
 * When `enabled` is false (wide layouts), every part stays open.
 */
export function useEntryFold({ enabled, isEdit }: UseEntryFoldOptions): EntryFoldState {
  const [parts, setParts] = useState<Record<FoldPart, boolean>>(() => initialFoldState(isEdit));

  const isOpen = useCallback((part: FoldPart) => !enabled || parts[part], [enabled, parts]);

  const open = useCallback((part: FoldPart) => {
    setParts((prev) => (prev[part] ? prev : { ...prev, [part]: true }));
  }, []);

  const finish = useCallback((part: FoldPart) => {
    setParts((prev) => {
      if (part === 'amount') {
        return { ...prev, amount: false, category: true };
      }
      if (!prev[part]) return prev;
      return { ...prev, [part]: false };
    });
  }, []);

  return { isOpen, open, finish };
}
