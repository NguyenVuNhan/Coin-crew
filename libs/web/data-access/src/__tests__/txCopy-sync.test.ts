import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { SyncEntryRow, SyncLedgerRow, SyncResponse } from '@cc/core';
import { TX_COPY_FORMAT, openTxCopyStore, type TxCopyState } from '../txCopy/store';
import { syncTxCopy, type FetchSync } from '../txCopy/sync';

let userSeq = 0;
function nextUserId(): string {
  return `sync-user-${Date.now()}-${++userSeq}`;
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

function createFakeFetch(steps: Array<SyncResponse | Error>) {
  const calls: Array<Parameters<FetchSync>[0]> = [];
  const queue = [...steps];

  const fetchSync: FetchSync = async (params) => {
    calls.push(params);
    const next = queue.shift();
    if (!next) {
      throw new Error('Unexpected fetchSync call');
    }
    if (next instanceof Error) {
      throw next;
    }
    return next;
  };

  return { fetchSync, calls };
}

describe('txCopy/sync', () => {
  it('first run downloads all pages and becomes ready', async () => {
    const store = await openTxCopyStore(nextUserId());
    expect(store).not.toBeNull();

    const e1 = makeEntry('e1', { syncVersion: 1 });
    const e2 = makeEntry('e2', { syncVersion: 2 });
    const l1 = makeLedger('l1');

    const { fetchSync, calls } = createFakeFetch([
      {
        status: 'reset',
        epoch: 'epoch-1',
        version: 10,
        entries: [e1],
        removedIds: [],
        cursor: { v: 1, id: 'e1' },
        ledger: { version: 3, rows: [l1] },
      },
      {
        status: 'reset',
        epoch: 'epoch-1',
        version: 10,
        entries: [e2],
        removedIds: [],
        cursor: null,
        ledger: null,
      },
    ]);

    const result = await syncTxCopy(store!, fetchSync);
    expect(result).toBe('reset');
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({});
    expect(calls[1]).toEqual({
      epoch: 'epoch-1',
      since: undefined,
      ledgerVersion: undefined,
      cursor: { v: 1, id: 'e1' },
    });

    const snapshot = await store!.load();
    expect(snapshot).toEqual({
      state: {
        format: TX_COPY_FORMAT,
        epoch: 'epoch-1',
        version: 10,
        ledgerVersion: 3,
        ready: true,
      },
      entries: [e1, e2],
      ledger: [l1],
    });
  });

  it('current makes no writes', async () => {
    const store = await openTxCopyStore(nextUserId());
    expect(store).not.toBeNull();

    const initialEntry = makeEntry('e1');
    const initialLedger = makeLedger('l1');
    const initialState = makeState({ epoch: 'epoch-1', version: 5, ledgerVersion: 2, ready: true });

    await store!.apply({ entries: [initialEntry], removedIds: [], ledger: [initialLedger] });
    await store!.saveState(initialState);

    const { fetchSync } = createFakeFetch([
      {
        status: 'current',
        epoch: 'epoch-1',
        version: 5,
        entries: [],
        removedIds: [],
        cursor: null,
        ledger: null,
      },
    ]);

    const result = await syncTxCopy(store!, fetchSync);
    expect(result).toBe('current');

    const snapshot = await store!.load();
    expect(snapshot).toEqual({
      state: initialState,
      entries: [initialEntry],
      ledger: [initialLedger],
    });
  });

  it('delta upserts and removes', async () => {
    const store = await openTxCopyStore(nextUserId());
    expect(store).not.toBeNull();

    const e1 = makeEntry('e1', { amount: 100 });
    const e2 = makeEntry('e2', { amount: 200 });
    const l1 = makeLedger('l1');
    await store!.apply({ entries: [e1, e2], removedIds: [], ledger: [l1] });
    await store!.saveState(makeState({ epoch: 'epoch-1', version: 5, ledgerVersion: 2, ready: true }));

    const e2Updated = makeEntry('e2', { amount: 250, syncVersion: 6 });
    const e3New = makeEntry('e3', { amount: 300, syncVersion: 7 });

    const { fetchSync } = createFakeFetch([
      {
        status: 'delta',
        epoch: 'epoch-1',
        version: 8,
        entries: [e2Updated, e3New],
        removedIds: ['e1'],
        cursor: null,
        ledger: null,
      },
    ]);

    const result = await syncTxCopy(store!, fetchSync);
    expect(result).toBe('updated');

    const snapshot = await store!.load();
    expect(snapshot).toEqual({
      state: {
        format: TX_COPY_FORMAT,
        epoch: 'epoch-1',
        version: 8,
        ledgerVersion: 2,
        ready: true,
      },
      entries: [e2Updated, e3New],
      ledger: [l1],
    });
  });

  it('reset wipes stale rows', async () => {
    const store = await openTxCopyStore(nextUserId());
    expect(store).not.toBeNull();

    await store!.apply({
      entries: [makeEntry('stale-1')],
      removedIds: [],
      ledger: [makeLedger('stale-l1')],
    });
    await store!.saveState(
      makeState({ epoch: 'old-epoch', version: 99, ledgerVersion: 9, ready: true }),
    );

    const freshEntry = makeEntry('fresh-1', { syncVersion: 2 });
    const freshLedger = makeLedger('fresh-l1');

    const { fetchSync } = createFakeFetch([
      {
        status: 'reset',
        epoch: 'new-epoch',
        version: 3,
        entries: [freshEntry],
        removedIds: [],
        cursor: null,
        ledger: { version: 1, rows: [freshLedger] },
      },
    ]);

    const result = await syncTxCopy(store!, fetchSync);
    expect(result).toBe('reset');

    const snapshot = await store!.load();
    expect(snapshot).toEqual({
      state: {
        format: TX_COPY_FORMAT,
        epoch: 'new-epoch',
        version: 3,
        ledgerVersion: 1,
        ready: true,
      },
      entries: [freshEntry],
      ledger: [freshLedger],
    });
  });

  it("the stored version is the first page's even when later pages carry newer rows", async () => {
    const store = await openTxCopyStore(nextUserId());
    expect(store).not.toBeNull();

    const e1 = makeEntry('e1', { syncVersion: 5 });
    const e2 = makeEntry('e2', { syncVersion: 12 });

    const { fetchSync } = createFakeFetch([
      {
        status: 'reset',
        epoch: 'epoch-1',
        version: 10,
        entries: [e1],
        removedIds: [],
        cursor: { v: 5, id: 'e1' },
        ledger: { version: 1, rows: [] },
      },
      {
        status: 'reset',
        epoch: 'epoch-1',
        version: 12,
        entries: [e2],
        removedIds: [],
        cursor: null,
        ledger: null,
      },
    ]);

    const result = await syncTxCopy(store!, fetchSync);
    expect(result).toBe('reset');

    const snapshot = await store!.load();
    expect(snapshot?.state.version).toBe(10);
    expect(snapshot?.entries).toEqual([e1, e2]);
  });

  it('ledger null keeps ledger rows, ledger given replaces them', async () => {
    const store = await openTxCopyStore(nextUserId());
    expect(store).not.toBeNull();

    const l1 = makeLedger('l1');
    const l2 = makeLedger('l2');
    await store!.apply({ entries: [makeEntry('e1')], removedIds: [], ledger: [l1, l2] });
    await store!.saveState(makeState({ epoch: 'epoch-1', version: 1, ledgerVersion: 1, ready: true }));

    const e2 = makeEntry('e2', { syncVersion: 2 });
    const firstRun = createFakeFetch([
      {
        status: 'delta',
        epoch: 'epoch-1',
        version: 2,
        entries: [e2],
        removedIds: [],
        cursor: null,
        ledger: null,
      },
    ]);

    await syncTxCopy(store!, firstRun.fetchSync);
    let snapshot = await store!.load();
    expect(snapshot?.ledger).toEqual([l1, l2]);
    expect(snapshot?.state.ledgerVersion).toBe(1);

    const l3 = makeLedger('l3');
    const secondRun = createFakeFetch([
      {
        status: 'delta',
        epoch: 'epoch-1',
        version: 3,
        entries: [],
        removedIds: [],
        cursor: null,
        ledger: { version: 4, rows: [l3] },
      },
    ]);

    await syncTxCopy(store!, secondRun.fetchSync);
    snapshot = await store!.load();
    expect(snapshot?.ledger).toEqual([l3]);
    expect(snapshot?.state.ledgerVersion).toBe(4);
  });

  it('a fetch error mid-download leaves ready false and rethrows', async () => {
    const store = await openTxCopyStore(nextUserId());
    expect(store).not.toBeNull();

    await store!.saveState(makeState({ epoch: 'epoch-1', version: 0, ledgerVersion: 0, ready: false }));

    const { fetchSync } = createFakeFetch([
      {
        status: 'reset',
        epoch: 'epoch-1',
        version: 5,
        entries: [makeEntry('e1')],
        removedIds: [],
        cursor: { v: 1, id: 'e1' },
        ledger: { version: 1, rows: [] },
      },
      new Error('network error'),
    ]);

    await expect(syncTxCopy(store!, fetchSync)).rejects.toThrow('network error');

    const snapshot = await store!.load();
    expect(snapshot?.state.ready).toBe(false);
  });

  it('a ready copy sends epoch, since and ledgerVersion', async () => {
    const store = await openTxCopyStore(nextUserId());
    expect(store).not.toBeNull();

    await store!.saveState(
      makeState({ epoch: 'ep-42', version: 17, ledgerVersion: 5, ready: true }),
    );

    const { fetchSync, calls } = createFakeFetch([
      {
        status: 'current',
        epoch: 'ep-42',
        version: 17,
        entries: [],
        removedIds: [],
        cursor: null,
        ledger: null,
      },
    ]);

    await syncTxCopy(store!, fetchSync);
    expect(calls).toEqual([{ epoch: 'ep-42', since: 17, ledgerVersion: 5 }]);
  });
});
