import { useSyncExternalStore, type JSX } from 'react';
import { Snackbar } from '@cc/web-ui/components/Snackbar';

/**
 * One app-wide undo snackbar. A confirmation can remove the card that showed it (the last waiting payment of a
 * grouped approval), so the snackbar lives here, not in the card, and its Undo still works.
 */
interface UndoItem {
  message: string;
  actionLabel: string;
  onAction: () => void;
}

let current: UndoItem | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function set(next: UndoItem | null) {
  current = next;
  listeners.forEach((l) => l());
}

export function showUndo(item: UndoItem, ms = 6000): void {
  if (timer) clearTimeout(timer);
  set(item);
  timer = setTimeout(() => set(null), ms);
}

export function hideUndo(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  set(null);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function UndoSnackbarHost(): JSX.Element | null {
  const item = useSyncExternalStore(subscribe, () => current, () => null);
  if (!item) return null;
  return (
    <Snackbar
      message={item.message}
      actionLabel={item.actionLabel}
      onAction={() => {
        hideUndo();
        item.onAction();
      }}
    />
  );
}
