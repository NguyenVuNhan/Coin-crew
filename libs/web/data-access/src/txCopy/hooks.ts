import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  listFromCopy,
  type ListQuery,
  type ListRow,
  type SyncResponse,
} from '@cc/core';
import { todayLocal } from '@cc/web-util/localDate';
import { apiFetch } from '../client';
import { useMe } from '../hooks';
import { useCategories, useTags, useWalletDetails } from '../personalMoney';
import {
  deleteTxCopy,
  openTxCopyStore,
  type TxCopySnapshot,
  type TxCopyStore,
} from './store';
import { syncTxCopy, type FetchSync } from './sync';

/**
 * Lifecycle status of the browser's local `/transactions` copy. `opening` lasts the few milliseconds it takes to open
 * IndexedDB, so screens wait for a copy that may already be there instead of asking the server first.
 */
export type TxCopyStatus = 'unavailable' | 'opening' | 'loading' | 'ready';

interface TxCopyHookState {
  status: TxCopyStatus;
  snapshot: TxCopySnapshot | null;
}

const UNAVAILABLE_STATE: TxCopyHookState = { status: 'unavailable', snapshot: null };
const LOADING_STATE: TxCopyHookState = { status: 'loading', snapshot: null };
const OPENING_STATE: TxCopyHookState = { status: 'opening', snapshot: null };
const OPENING_TIMEOUT_MS = 1500;

const fetchSync: FetchSync = (params) => {
  const qs = new URLSearchParams();
  if (params.epoch !== undefined) qs.set('epoch', params.epoch);
  if (params.since !== undefined) qs.set('since', String(params.since));
  if (params.ledgerVersion !== undefined) qs.set('ledgerVersion', String(params.ledgerVersion));
  if (params.cursor !== undefined) {
    qs.set('cursorV', String(params.cursor.v));
    qs.set('cursorId', params.cursor.id);
  }
  const query = qs.toString();
  const path = query ? `/api/me/personal/sync?${query}` : '/api/me/personal/sync';
  return apiFetch<SyncResponse>(path);
};

class TxCopyController {
  private readonly userId: string;
  private state: TxCopyHookState = OPENING_STATE;
  private readonly listeners = new Set<() => void>();
  private store: TxCopyStore | null = null;
  private unavailable = false;
  private initPromise: Promise<TxCopyStore | null> | null = null;
  private inFlight: Promise<void> | null = null;
  private pending = false;
  private started = false;
  private disposed = false;

  private readonly onVisibilityChange = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      void this.sync();
    }
  };

  constructor(userId: string) {
    this.userId = userId;
  }

  getSnapshot(): TxCopyHookState {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    if (this.disposed) return () => {};
    this.listeners.add(listener);
    if (this.listeners.size === 1 && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
    if (!this.started) {
      this.started = true;
      // If opening IndexedDB hangs (some in-app webviews), stop waiting and let the screen use the server.
      setTimeout(() => {
        if (this.state.status === 'opening') this.publish(LOADING_STATE);
      }, OPENING_TIMEOUT_MS);
      void this.sync();
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', this.onVisibilityChange);
      }
    };
  }

  sync(): Promise<void> {
    if (this.disposed || this.unavailable) return Promise.resolve();
    if (this.inFlight) {
      this.pending = true;
      return this.inFlight;
    }
    const run = this.runSyncLoop();
    this.inFlight = run;
    return run;
  }

  async reset(): Promise<void> {
    if (this.disposed || this.unavailable) return;
    const store = await this.ensureInit();
    if (!store || this.disposed) return;
    if (this.inFlight) {
      await this.inFlight;
      if (this.disposed) return;
    }
    await store.wipe();
    if (this.disposed) return;
    this.publish(LOADING_STATE);
    await this.sync();
  }

  dispose(): void {
    this.disposed = true;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
    this.listeners.clear();
  }

  private publish(next: TxCopyHookState): void {
    if (this.disposed) return;
    this.state = next;
    for (const listener of this.listeners) {
      listener();
    }
  }

  private ensureInit(): Promise<TxCopyStore | null> {
    if (this.unavailable || this.disposed) return Promise.resolve(null);
    if (this.store) return Promise.resolve(this.store);
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const store = await openTxCopyStore(this.userId);
      if (this.disposed) return null;
      if (!store) {
        this.unavailable = true;
        this.publish(UNAVAILABLE_STATE);
        return null;
      }
      this.store = store;
      const snapshot = await store.load();
      if (this.disposed) return null;
      if (snapshot && snapshot.state.ready) {
        this.publish({ status: 'ready', snapshot });
      } else {
        this.publish(LOADING_STATE);
      }
      return store;
    })();

    return this.initPromise;
  }

  private async runSyncLoop(): Promise<void> {
    try {
      const store = await this.ensureInit();
      if (!store || this.disposed) return;

      do {
        this.pending = false;
        await this.runSingleSync(store);
        if (this.disposed) return;
      } while (this.pending);
    } finally {
      this.inFlight = null;
      this.pending = false;
    }
  }

  private async runSingleSync(store: TxCopyStore): Promise<void> {
    try {
      await syncTxCopy(store, fetchSync);
      if (this.disposed) return;
      const snapshot = await store.load();
      if (this.disposed) return;
      if (snapshot && snapshot.state.ready) {
        this.publish({ status: 'ready', snapshot });
      }
    } catch (err) {
      console.warn('txCopy sync failed:', err);
    }
  }
}

const controllers = new Map<string, TxCopyController>();
let activeUserId: string | null = null;
const txCopySyncListeners = new Set<() => Promise<void> | void>();

/**
 * Registers a listener called whenever `requestTxCopySync()` runs.
 * Returns an unsubscribe function.
 */
export function onTxCopySync(listener: () => Promise<void> | void): () => void {
  txCopySyncListeners.add(listener);
  return () => {
    txCopySyncListeners.delete(listener);
  };
}

function getOrCreateController(userId: string): TxCopyController {
  let controller = controllers.get(userId);
  if (!controller) {
    controller = new TxCopyController(userId);
    controllers.set(userId, controller);
  }
  activeUserId = userId;
  return controller;
}

function getActiveController(): TxCopyController | null {
  if (!activeUserId) return null;
  return controllers.get(activeUserId) ?? null;
}

/**
 * Subscribes to the signed-in user's local IndexedDB copy of `/transactions`.
 * Opens the store on first use, syncs on first mount and when the tab becomes visible,
 * and falls back to `'unavailable'` when signed out or when IndexedDB cannot be used.
 */
export function useTxCopy(): { status: TxCopyStatus; snapshot: TxCopySnapshot | null } {
  const { data, isPending: meLoading } = useMe();
  const userId = data?.user?.id;
  // Until we know who is signed in, the copy may still be there: say "opening", not "unavailable".
  const noUserState = meLoading ? OPENING_STATE : UNAVAILABLE_STATE;
  const controller = userId ? getOrCreateController(userId) : null;

  useEffect(() => {
    if (userId) {
      activeUserId = userId;
    }
  }, [userId]);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!controller) return () => {};
      return controller.subscribe(onStoreChange);
    },
    [controller],
  );

  const getSnapshot = useCallback(
    (): TxCopyHookState => (controller ? controller.getSnapshot() : noUserState),
    [controller, noUserState],
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => UNAVAILABLE_STATE);
}

/**
 * Reads and filters `/transactions` rows from the local copy once both the copy
 * and the reference lists (wallets, categories, tags) have loaded.
 */
export function useCopyList(
  query: ListQuery,
  opts?: { enabled?: boolean },
): { rows: ListRow[] | null; ready: boolean; opening: boolean } {
  const enabled = opts?.enabled ?? true;
  const { status, snapshot } = useTxCopy();
  const walletsQuery = useWalletDetails({ enabled });
  const categoriesQuery = useCategories({ enabled });
  const tagsQuery = useTags({ enabled });

  const wallets = walletsQuery.data?.wallets;
  const categories = categoriesQuery.data?.categories;
  const tags = tagsQuery.data?.tags;

  const rows = useMemo(() => {
    if (!enabled || status !== 'ready' || !snapshot || !wallets || !categories || !tags) {
      return null;
    }
    return listFromCopy(snapshot, query, { wallets, categories, tags }, todayLocal());
  }, [
    enabled,
    status,
    snapshot,
    wallets,
    categories,
    tags,
    query.month,
    query.from,
    query.to,
    query.walletId,
    query.categoryId,
    query.assetId,
    query.tagId,
    query.type,
    query.q,
  ]);

  // Also wait while a ready copy's lookup lists are still loading, so a fresh page doesn't spend a server read.
  const lookupsLoading = walletsQuery.isPending || categoriesQuery.isPending || tagsQuery.isPending;
  const opening = enabled && rows === null && (status === 'opening' || (status === 'ready' && lookupsLoading));
  return { rows, ready: rows !== null, opening };
}

/**
 * Requests a single-flight sync of the active user's local transaction copy and resolves
 * once the copy is up to date. Resolves immediately when no user copy is active or available.
 */
export function requestTxCopySync(): Promise<void> {
  const controller = getActiveController();
  const tasks: Promise<void>[] = [];
  if (controller) {
    tasks.push(controller.sync());
  }
  for (const listener of txCopySyncListeners) {
    const result = listener();
    if (result) {
      tasks.push(result);
    }
  }
  if (tasks.length === 0) return Promise.resolve();
  if (tasks.length === 1) return tasks[0]!;
  return Promise.all(tasks).then(() => undefined);
}

/**
 * Wipes the active user's local transaction copy, publishes a `'loading'` state,
 * and downloads a fresh copy from the server.
 */
export function resetTxCopy(): Promise<void> {
  const controller = getActiveController();
  if (!controller) return Promise.resolve();
  return controller.reset();
}

/**
 * Drops the sync controller for `userId` (removing any listeners) and deletes its
 * IndexedDB copy from the browser.
 */
export async function forgetTxCopy(userId: string): Promise<void> {
  const controller = controllers.get(userId);
  if (controller) {
    controllers.delete(userId);
    controller.dispose();
  }
  if (activeUserId === userId) {
    activeUserId = null;
  }
  await deleteTxCopy(userId);
}

export {
  deleteGroupCopy,
  forgetGroupCopy,
  openGroupCopyStore,
  requestGroupCopySync,
  syncGroupCopy,
  useCopyGroupRows,
  useGroupCopy,
  type FetchGroupRows,
  type GroupCopySnapshot,
  type GroupCopyStatus,
  type GroupCopyStore,
  type GroupRowsSyncResponse,
} from './groupCopy';
