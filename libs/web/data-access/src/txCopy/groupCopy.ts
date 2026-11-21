import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb';
import {
  createGroupWalletResolver,
  groupRowsFromCopy,
  type GroupListQuery,
  type GroupRow,
  type GroupSettingsView,
} from '@cc/core';
import { todayLocal } from '@cc/web-util/localDate';
import { apiFetch } from '../client';
import { useMe } from '../hooks';
import { useCategories, useTags, useWalletDetails } from '../personalMoney';
import { onTxCopySync } from './hooks';

export type GroupCopyStatus = 'unavailable' | 'opening' | 'loading' | 'ready';

export interface GroupCopySnapshot {
  key: string;
  rows: GroupRow[];
}

export type GroupRowsSyncResponse =
  | { status: 'current' }
  | { status: 'rows'; key: string; rows: GroupRow[] };

export interface GroupCopyStore {
  load(): Promise<GroupCopySnapshot | null>;
  replace(key: string, rows: GroupRow[]): Promise<void>;
  wipe(): Promise<void>;
}

interface GroupCopyMeta {
  key: string;
}

interface GroupCopySchema extends DBSchema {
  rows: {
    key: string;
    value: GroupRow;
  };
  meta: {
    key: string;
    value: GroupCopyMeta;
  };
}

const DB_VERSION = 1;
const META_KEY = 'state';
const OPENING_TIMEOUT_MS = 1500;

/** Open connections by user id, so `deleteGroupCopy` can close them first. */
const openConnections = new Map<string, IDBPDatabase<GroupCopySchema>>();

function dbName(userId: string): string {
  return `cc-group-copy-${userId}`;
}

function createGroupStore(db: IDBPDatabase<GroupCopySchema>): GroupCopyStore {
  async function wipe(): Promise<void> {
    const tx = db.transaction(['rows', 'meta'], 'readwrite');
    await Promise.all([
      tx.objectStore('rows').clear(),
      tx.objectStore('meta').clear(),
      tx.done,
    ]);
  }

  return {
    async load(): Promise<GroupCopySnapshot | null> {
      const meta = await db.get('meta', META_KEY);
      if (!meta) return null;
      const rows = await db.getAll('rows');
      return { key: meta.key, rows };
    },

    async replace(key: string, rows: GroupRow[]): Promise<void> {
      const tx = db.transaction(['rows', 'meta'], 'readwrite');
      const rowStore = tx.objectStore('rows');
      const ops: Promise<unknown>[] = [rowStore.clear()];
      for (const row of rows) {
        ops.push(rowStore.put(row));
      }
      ops.push(tx.objectStore('meta').put({ key }, META_KEY));
      ops.push(tx.done);
      await Promise.all(ops);
    },

    wipe,
  };
}

/**
 * Opens the browser's IndexedDB copy of group rows for `userId`.
 * Returns `null` (never throws) when IndexedDB is unavailable or opening fails.
 */
export async function openGroupCopyStore(userId: string): Promise<GroupCopyStore | null> {
  if (typeof globalThis.indexedDB === 'undefined' || globalThis.indexedDB === null) {
    return null;
  }

  try {
    const db = await openDB<GroupCopySchema>(dbName(userId), DB_VERSION, {
      upgrade(upgradeDb) {
        if (!upgradeDb.objectStoreNames.contains('rows')) {
          upgradeDb.createObjectStore('rows', { keyPath: 'id' });
        }
        if (!upgradeDb.objectStoreNames.contains('meta')) {
          upgradeDb.createObjectStore('meta');
        }
      },
    });
    openConnections.get(userId)?.close();
    openConnections.set(userId, db);
    return createGroupStore(db);
  } catch {
    return null;
  }
}

/**
 * Deletes the IndexedDB copy of group rows for `userId`.
 * Best-effort: never throws, including when IndexedDB is unavailable.
 */
export async function deleteGroupCopy(userId: string): Promise<void> {
  if (typeof globalThis.indexedDB === 'undefined' || globalThis.indexedDB === null) {
    return;
  }

  try {
    openConnections.get(userId)?.close();
    openConnections.delete(userId);
    await deleteDB(dbName(userId));
  } catch {
    // Best-effort: storage cleanup must never throw.
  }
}

export type FetchGroupRows = (key?: string) => Promise<GroupRowsSyncResponse>;

const fetchGroupRows: FetchGroupRows = (key) => {
  const path =
    key !== undefined
      ? `/api/me/personal/group-rows?key=${encodeURIComponent(key)}`
      : '/api/me/personal/group-rows';
  return apiFetch<GroupRowsSyncResponse>(path);
};

/**
 * Brings the browser's IndexedDB group-row copy up to date from `GET /api/me/personal/group-rows`.
 */
export async function syncGroupCopy(
  store: GroupCopyStore,
  fetchFn: FetchGroupRows = fetchGroupRows,
): Promise<'current' | 'updated'> {
  const snapshot = await store.load();
  const res = await fetchFn(snapshot?.key);
  if (res.status === 'current') {
    return 'current';
  }
  await store.replace(res.key, res.rows);
  return 'updated';
}

interface GroupCopyHookState {
  status: GroupCopyStatus;
  snapshot: GroupCopySnapshot | null;
}

const UNAVAILABLE_STATE: GroupCopyHookState = { status: 'unavailable', snapshot: null };
const LOADING_STATE: GroupCopyHookState = { status: 'loading', snapshot: null };
const OPENING_STATE: GroupCopyHookState = { status: 'opening', snapshot: null };

class GroupCopyController {
  private readonly userId: string;
  private state: GroupCopyHookState = OPENING_STATE;
  private readonly listeners = new Set<() => void>();
  private store: GroupCopyStore | null = null;
  private unavailable = false;
  private initPromise: Promise<GroupCopyStore | null> | null = null;
  private inFlight: Promise<void> | null = null;
  private pending = false;
  private started = false;
  private disposed = false;
  private unsubTxSync: (() => void) | null = null;

  private readonly onFocus = () => {
    void this.sync();
  };

  constructor(userId: string) {
    this.userId = userId;
  }

  getSnapshot(): GroupCopyHookState {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    if (this.disposed) return () => {};
    this.listeners.add(listener);
    if (this.listeners.size === 1) {
      if (typeof window !== 'undefined') {
        window.addEventListener('focus', this.onFocus);
      }
      this.unsubTxSync = onTxCopySync(() => this.sync());
    }
    if (!this.started) {
      this.started = true;
      setTimeout(() => {
        if (this.state.status === 'opening') this.publish(LOADING_STATE);
      }, OPENING_TIMEOUT_MS);
      void this.sync();
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        if (typeof window !== 'undefined') {
          window.removeEventListener('focus', this.onFocus);
        }
        this.unsubTxSync?.();
        this.unsubTxSync = null;
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

  dispose(): void {
    this.disposed = true;
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', this.onFocus);
    }
    this.unsubTxSync?.();
    this.unsubTxSync = null;
    this.listeners.clear();
  }

  private publish(next: GroupCopyHookState): void {
    if (this.disposed) return;
    this.state = next;
    for (const listener of this.listeners) {
      listener();
    }
  }

  private ensureInit(): Promise<GroupCopyStore | null> {
    if (this.unavailable || this.disposed) return Promise.resolve(null);
    if (this.store) return Promise.resolve(this.store);
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const store = await openGroupCopyStore(this.userId);
      if (this.disposed) return null;
      if (!store) {
        this.unavailable = true;
        this.publish(UNAVAILABLE_STATE);
        return null;
      }
      this.store = store;
      const snapshot = await store.load();
      if (this.disposed) return null;
      if (snapshot) {
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

  private async runSingleSync(store: GroupCopyStore): Promise<void> {
    try {
      await syncGroupCopy(store, fetchGroupRows);
      if (this.disposed) return;
      const snapshot = await store.load();
      if (this.disposed) return;
      if (snapshot) {
        this.publish({ status: 'ready', snapshot });
      }
    } catch (err) {
      console.warn('groupCopy sync failed:', err);
    }
  }
}

const controllers = new Map<string, GroupCopyController>();
let activeUserId: string | null = null;

function getOrCreateController(userId: string): GroupCopyController {
  let controller = controllers.get(userId);
  if (!controller) {
    controller = new GroupCopyController(userId);
    controllers.set(userId, controller);
  }
  activeUserId = userId;
  return controller;
}

function getActiveController(): GroupCopyController | null {
  if (!activeUserId) return null;
  return controllers.get(activeUserId) ?? null;
}

/**
 * Subscribes to the signed-in user's local IndexedDB copy of group rows.
 * Refreshes on mount, on window focus, and whenever `requestTxCopySync()` runs.
 */
export function useGroupCopy(opts?: {
  enabled?: boolean;
}): { status: GroupCopyStatus; snapshot: GroupCopySnapshot | null } {
  const enabled = opts?.enabled ?? true;
  const { data, isPending: meLoading } = useMe();
  const userId = enabled ? data?.user?.id : undefined;
  const noUserState = enabled && meLoading ? OPENING_STATE : UNAVAILABLE_STATE;
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
    (): GroupCopyHookState => (controller ? controller.getSnapshot() : noUserState),
    [controller, noUserState],
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => UNAVAILABLE_STATE);
}

/**
 * Reads and filters group rows from the local copy once both the copy
 * and the reference lists (wallets, categories, tags) have loaded.
 */
export function useCopyGroupRows(
  query: GroupListQuery,
  opts?: { enabled?: boolean; settings?: GroupSettingsView },
): { groupRows: GroupRow[] | null; ready: boolean } {
  const enabled = opts?.enabled ?? true;
  const { status, snapshot } = useGroupCopy({ enabled });
  const walletsQuery = useWalletDetails({ enabled });
  const categoriesQuery = useCategories({ enabled });
  const tagsQuery = useTags({ enabled });

  const wallets = walletsQuery.data?.wallets;
  const categories = categoriesQuery.data?.categories;
  const tags = tagsQuery.data?.tags;
  const settings = opts?.settings;

  const groupRows = useMemo(() => {
    if (!enabled || status !== 'ready' || !snapshot || !wallets || !categories || !tags) {
      return null;
    }
    const defaultWalletId = wallets.find((w) => w.isDefault)?.id ?? null;
    const effectiveQuery: GroupListQuery =
      query.groups === undefined ? { ...query, groups: 'show' } : query;
    return groupRowsFromCopy(
      snapshot.rows,
      effectiveQuery,
      { wallets, categories, tags, today: todayLocal(), settings },
      createGroupWalletResolver(wallets, defaultWalletId),
    );
  }, [
    enabled,
    status,
    snapshot,
    wallets,
    categories,
    tags,
    settings,
    query.month,
    query.from,
    query.to,
    query.walletId,
    query.categoryId,
    query.assetId,
    query.tagId,
    query.type,
    query.tripId,
    query.groups,
    query.q,
  ]);

  return { groupRows, ready: groupRows !== null };
}

/**
 * Requests a single-flight sync of the active user's local group-row copy.
 */
export function requestGroupCopySync(): Promise<void> {
  const controller = getActiveController();
  if (!controller) return Promise.resolve();
  return controller.sync();
}

/**
 * Drops the group-copy controller for `userId` and deletes its IndexedDB database.
 */
export async function forgetGroupCopy(userId: string): Promise<void> {
  const controller = controllers.get(userId);
  if (controller) {
    controllers.delete(userId);
    controller.dispose();
  }
  if (activeUserId === userId) {
    activeUserId = null;
  }
  await deleteGroupCopy(userId);
}
