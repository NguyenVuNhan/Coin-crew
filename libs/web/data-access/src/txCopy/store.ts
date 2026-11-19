import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { SyncEntryRow, SyncLedgerRow } from '@cc/core';

export const TX_COPY_FORMAT = 1;

export interface TxCopyState {
  format: number;
  epoch: string;
  version: number;
  ledgerVersion: number;
  ready: boolean;
}

export interface TxCopySnapshot {
  state: TxCopyState;
  entries: SyncEntryRow[];
  ledger: SyncLedgerRow[];
}

export interface TxCopyStore {
  load(): Promise<TxCopySnapshot | null>;
  apply(change: { entries: SyncEntryRow[]; removedIds: string[]; ledger?: SyncLedgerRow[] }): Promise<void>;
  saveState(state: TxCopyState): Promise<void>;
  wipe(): Promise<void>;
}

interface TxCopySchema extends DBSchema {
  entries: {
    key: string;
    value: SyncEntryRow;
  };
  ledger: {
    key: string;
    value: SyncLedgerRow;
  };
  meta: {
    key: string;
    value: TxCopyState;
  };
}

const DB_VERSION = 1;
const STATE_KEY = 'state';

function dbName(userId: string): string {
  return `cc-tx-copy-${userId}`;
}

function createStore(db: IDBPDatabase<TxCopySchema>): TxCopyStore {
  async function wipe(): Promise<void> {
    const tx = db.transaction(['entries', 'ledger', 'meta'], 'readwrite');
    await Promise.all([
      tx.objectStore('entries').clear(),
      tx.objectStore('ledger').clear(),
      tx.objectStore('meta').clear(),
      tx.done,
    ]);
  }

  return {
    async load(): Promise<TxCopySnapshot | null> {
      const state = await db.get('meta', STATE_KEY);
      if (!state) return null;
      if (state.format !== TX_COPY_FORMAT) {
        await wipe();
        return null;
      }

      const tx = db.transaction(['entries', 'ledger'], 'readonly');
      const [entries, ledger] = await Promise.all([
        tx.objectStore('entries').getAll(),
        tx.objectStore('ledger').getAll(),
        tx.done,
      ]);
      return { state, entries, ledger };
    },

    async apply(change): Promise<void> {
      const tx = db.transaction(['entries', 'ledger'], 'readwrite');
      const entryStore = tx.objectStore('entries');
      const ops: Promise<unknown>[] = [];

      for (const entry of change.entries) {
        ops.push(entryStore.put(entry));
      }
      for (const id of change.removedIds) {
        ops.push(entryStore.delete(id));
      }
      if (change.ledger !== undefined) {
        const ledgerStore = tx.objectStore('ledger');
        ops.push(ledgerStore.clear());
        for (const row of change.ledger) {
          ops.push(ledgerStore.put(row));
        }
      }
      ops.push(tx.done);
      await Promise.all(ops);
    },

    async saveState(state: TxCopyState): Promise<void> {
      await db.put('meta', state, STATE_KEY);
    },

    wipe,
  };
}

/**
 * Opens the browser's IndexedDB copy of `/transactions` for `userId`.
 * Returns `null` (never throws) when IndexedDB is unavailable or opening fails.
 */
export async function openTxCopyStore(userId: string): Promise<TxCopyStore | null> {
  if (typeof globalThis.indexedDB === 'undefined' || globalThis.indexedDB === null) {
    return null;
  }

  try {
    const db = await openDB<TxCopySchema>(dbName(userId), DB_VERSION, {
      upgrade(upgradeDb) {
        if (!upgradeDb.objectStoreNames.contains('entries')) {
          upgradeDb.createObjectStore('entries', { keyPath: 'id' });
        }
        if (!upgradeDb.objectStoreNames.contains('ledger')) {
          upgradeDb.createObjectStore('ledger', { keyPath: 'id' });
        }
        if (!upgradeDb.objectStoreNames.contains('meta')) {
          upgradeDb.createObjectStore('meta');
        }
      },
    });
    return createStore(db);
  } catch {
    return null;
  }
}

/**
 * Deletes the IndexedDB copy of `/transactions` for `userId`.
 * Best-effort: never throws, including when IndexedDB is unavailable.
 */
export async function deleteTxCopy(userId: string): Promise<void> {
  if (typeof globalThis.indexedDB === 'undefined' || globalThis.indexedDB === null) {
    return;
  }

  try {
    await deleteDB(dbName(userId));
  } catch {
    // Best-effort: storage cleanup must never throw.
  }
}
