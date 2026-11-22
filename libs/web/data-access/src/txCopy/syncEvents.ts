/**
 * Listeners called whenever `requestTxCopySync()` runs. Kept in its own module so the group copy can subscribe
 * without importing `./hooks` (tests replace that module with a mock).
 */
export const txCopySyncListeners = new Set<() => Promise<void> | void>();

/** Registers a listener; returns an unsubscribe function. */
export function onTxCopySync(listener: () => Promise<void> | void): () => void {
  txCopySyncListeners.add(listener);
  return () => {
    txCopySyncListeners.delete(listener);
  };
}
