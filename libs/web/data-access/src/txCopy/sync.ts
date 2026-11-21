import type { SyncCursor, SyncResponse } from '@cc/core';
import { TX_COPY_FORMAT, type TxCopyStore } from './store';

/**
 * Fetches a single sync page from `GET /api/me/personal/sync`.
 */
export type FetchSync = (params: {
  epoch?: string;
  since?: number;
  ledgerVersion?: number;
  cursor?: SyncCursor;
}) => Promise<SyncResponse>;

/**
 * Brings the browser's IndexedDB transaction copy up to date from the server sync endpoint,
 * following paginated responses and handling `current`, `delta`, and `reset` states.
 */
export async function syncTxCopy(
  store: TxCopyStore,
  fetchSync: FetchSync,
): Promise<'current' | 'updated' | 'reset'> {
  const snapshot = await store.load();
  const state = snapshot?.state ?? null;

  const firstParams =
    state && state.ready
      ? { epoch: state.epoch, since: state.version, ledgerVersion: state.ledgerVersion }
      : {};

  const first = await fetchSync(firstParams);
  if (first.status === 'current') {
    return 'current';
  }

  if (first.status === 'reset') {
    await store.wipe();
  }

  await store.apply({
    entries: first.entries,
    removedIds: first.removedIds,
    ledger: first.ledger?.rows,
  });

  const followUpSince = first.status === 'reset' ? undefined : firstParams.since;
  let last = first;
  while (last.cursor !== null) {
    const next = await fetchSync({
      epoch: first.epoch,
      since: followUpSince,
      ledgerVersion: firstParams.ledgerVersion,
      cursor: last.cursor,
    });
    await store.apply({ entries: next.entries, removedIds: [] });
    last = next;
  }

  await store.saveState({
    format: TX_COPY_FORMAT,
    epoch: first.epoch,
    version: first.version,
    ledgerVersion: first.ledger ? first.ledger.version : (state?.ledgerVersion ?? 0),
    ready: true,
  });

  return first.status === 'reset' ? 'reset' : 'updated';
}
