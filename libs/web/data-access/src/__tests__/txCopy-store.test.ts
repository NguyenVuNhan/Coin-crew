import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { SyncEntryRow, SyncLedgerRow } from '@cc/core';
import {
  TX_COPY_FORMAT,
  deleteTxCopy,
  openTxCopyStore,
  type TxCopyState,
} from '../txCopy/store';

let userSeq = 0;
function nextUserId(): string {
  return `user-${Date.now()}-${++userSeq}`;
}

function makeEntry(id: string, overrides: Partial<SyncEntryRow> = {}): SyncEntryRow {
  return {
    id,
    walletId: 'wallet-1',
    type: 'expense',
    amount: 50000,
    categoryId: 'cat-food',
    assetId: null,
    quantity: null,
    transferId: null,
    counterpartWalletId: null,
    date: '2026-11-19',
    time: '12:00',
    note: 'Lunch',
    tagIds: ['tag-1'],
    excludeFromReports: false,
    createdAt: '2026-11-19T05:00:00.000Z',
    syncVersion: 1,
    ...overrides,
  };
}

function makeLedger(id: string, overrides: Partial<SyncLedgerRow> = {}): SyncLedgerRow {
  return {
    id,
    tripId: 'trip-1',
    date: '2026-11-19',
    share: 25000,
    total: 50000,
    note: 'Dinner',
    people: ['Alice', 'Bob'],
    createdAt: '2026-11-19T12:00:00.000Z',
    ...overrides,
  };
}

function makeState(overrides: Partial<TxCopyState> = {}): TxCopyState {
  return {
    format: TX_COPY_FORMAT,
    epoch: 'epoch-1',
    version: 1,
    ledgerVersion: 1,
    ready: true,
    ...overrides,
  };
}

describe('txCopy/store', () => {
  it('apply then load returns the rows', async () => {
    const store = await openTxCopyStore(nextUserId());
    expect(store).not.toBeNull();

    const entries = [makeEntry('e1'), makeEntry('e2', { amount: 120000 })];
    const ledger = [makeLedger('l1')];
    const state = makeState({ version: 2, ledgerVersion: 1 });

    await store!.apply({ entries, removedIds: [], ledger });
    await store!.saveState(state);

    const snapshot = await store!.load();
    expect(snapshot).toEqual({ state, entries, ledger });
  });

  it('removedIds delete rows', async () => {
    const store = await openTxCopyStore(nextUserId());
    expect(store).not.toBeNull();

    const e1 = makeEntry('e1');
    const e2 = makeEntry('e2');
    const e3 = makeEntry('e3');
    await store!.apply({ entries: [e1, e2, e3], removedIds: [] });
    await store!.saveState(makeState());

    await store!.apply({ entries: [], removedIds: ['e1', 'e3'] });

    const snapshot = await store!.load();
    expect(snapshot?.entries).toEqual([e2]);
  });

  it('ledger replaces all ledger rows', async () => {
    const store = await openTxCopyStore(nextUserId());
    expect(store).not.toBeNull();

    await store!.apply({
      entries: [],
      removedIds: [],
      ledger: [makeLedger('l1'), makeLedger('l2')],
    });
    await store!.saveState(makeState());

    const replacement = [makeLedger('l3')];
    await store!.apply({ entries: [], removedIds: [], ledger: replacement });

    const snapshot = await store!.load();
    expect(snapshot?.ledger).toEqual(replacement);
  });

  it('apply without ledger keeps ledger rows', async () => {
    const store = await openTxCopyStore(nextUserId());
    expect(store).not.toBeNull();

    const initialLedger = [makeLedger('l1')];
    await store!.apply({
      entries: [makeEntry('e1')],
      removedIds: [],
      ledger: initialLedger,
    });
    await store!.saveState(makeState());

    const e2 = makeEntry('e2');
    await store!.apply({ entries: [e2], removedIds: [] });

    const snapshot = await store!.load();
    expect(snapshot?.ledger).toEqual(initialLedger);
    expect(snapshot?.entries).toEqual([makeEntry('e1'), e2]);
  });

  it('load returns null with no state', async () => {
    const store = await openTxCopyStore(nextUserId());
    expect(store).not.toBeNull();

    await store!.apply({
      entries: [makeEntry('e1')],
      removedIds: [],
      ledger: [makeLedger('l1')],
    });

    expect(await store!.load()).toBeNull();
  });

  it('a stored state with another format loads as null and wipes', async () => {
    const store = await openTxCopyStore(nextUserId());
    expect(store).not.toBeNull();

    await store!.apply({
      entries: [makeEntry('e1')],
      removedIds: [],
      ledger: [makeLedger('l1')],
    });
    await store!.saveState(makeState({ format: TX_COPY_FORMAT + 1 }));

    expect(await store!.load()).toBeNull();

    // Verify all stores were wiped by saving a valid state and loading again.
    const validState = makeState();
    await store!.saveState(validState);
    expect(await store!.load()).toEqual({
      state: validState,
      entries: [],
      ledger: [],
    });
  });

  it('openTxCopyStore returns null when indexedDB is undefined', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
    try {
      Object.defineProperty(globalThis, 'indexedDB', {
        value: undefined,
        configurable: true,
        writable: true,
      });
      expect(await openTxCopyStore(nextUserId())).toBeNull();
    } finally {
      if (descriptor) {
        Object.defineProperty(globalThis, 'indexedDB', descriptor);
      }
    }
  });

  it('openTxCopyStore returns null when open throws', async () => {
    const originalOpen = globalThis.indexedDB.open;
    try {
      globalThis.indexedDB.open = () => {
        throw new Error('IndexedDB blocked');
      };
      expect(await openTxCopyStore(nextUserId())).toBeNull();
    } finally {
      globalThis.indexedDB.open = originalOpen;
    }
  });

  it('deleteTxCopy removes the database', async () => {
    const userId = nextUserId();
    const store = await openTxCopyStore(userId);
    expect(store).not.toBeNull();

    await store!.apply({
      entries: [makeEntry('e1')],
      removedIds: [],
      ledger: [makeLedger('l1')],
    });
    await store!.saveState(makeState());
    expect(await store!.load()).not.toBeNull();

    await deleteTxCopy(userId);

    const reopened = await openTxCopyStore(userId);
    expect(reopened).not.toBeNull();
    expect(await reopened!.load()).toBeNull();
  });
});
