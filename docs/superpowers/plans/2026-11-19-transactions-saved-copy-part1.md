# Transactions saved copy and sync (Part 1 of 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo, implementation tasks run as Orca workers per the `gemini-execution` skill.

**Goal:** Every browser keeps a saved copy of what `/transactions` lists, kept fresh by a cheap sync, and the month view and filters read from it, so paging, filtering and (in Part 2) search cost no D1 reads.

**Architecture:** The server stamps every personal-transaction write with a per-user change counter (`personal_sync_state.version`) and records deletions; people-ledger freshness rides on the existing `trips.version` of the person's direct ledger. A new `GET /me/personal/sync` returns "current", a delta, or "reset". The browser stores raw rows (ids, not names) in IndexedDB, syncs on open, tab return and after its own writes, and turns rows into `ListRow`s with the wallet/category/tag lists it already loads.

**Tech Stack:** Cloudflare Workers + D1 (Drizzle, hand-written SQL migrations), Hono, React 19 + TanStack Query, IndexedDB via `idb`, Vitest (`@cloudflare/vitest-plugin` for the API, jsdom + `fake-indexeddb` for web).

**Spec:** `docs/superpowers/specs/2026-11-19-transactions-search-flow-design.md` (section "Part 1: the saved copy and sync").

## Global Constraints

- Import rules: web and API never import each other; `@cc/core` holds logic both sides need; across libraries import by package name, inside a library use relative imports; no `@/` alias.
- `npm test`, `npm run typecheck`, `npm run lint` through Nx only.
- D1 migrations are hand-written SQL in `apps/api/migrations/` (next number `0029`); apply `--local` for the dev tunnel.
- Implementers add new tests only; they never edit or delete existing tests and never run them. The planner runs them.
- New dependencies pinned to exact versions: `idb@8.0.0` (dependency of `@cc/web-data-access`), `fake-indexeddb@6.0.0` (devDependency of `@cc/web-data-access`).
- Copy format number: `TX_COPY_FORMAT = 1`. Deletion records kept 90 days. Sync batch size 500 rows.
- Server-wide epoch: env var `PERSONAL_SYNC_EPOCH` (string, default `"1"`); the epoch sent to browsers is `` `${PERSONAL_SYNC_EPOCH}.${user epoch}` ``.
- Text match ignores accents and case on both server and browser (`foldForSearch`, Task 7).
- New Vietnamese copy marked `// REVIEW` in `libs/web/i18n/src/vi.ts`, with the English in `en.ts`.
- Keep every existing `fsl-*` class and `data-testid`.

## Review Focus

1. **A write path that skips the bump** (e.g. a new route later, or a bulk category/asset move): the copy goes silently stale. Task 3 and Task 4 tests cover every current route; Task 5 adds a static guard.
2. **Writes landing while a first download is still paging**: the copy must not lose them. Task 9 test: the version stored is the one from the first page, so the next sync picks them up.
3. **A deleted transaction restored with the same id** (the 5-second undo): it must reappear on other devices, not stay deleted. Task 3 test: restore clears the deletion record and stamps the row.
4. **IndexedDB missing or throwing** (private window, Zalo browser, Safari clean-up): the screen must behave exactly as today. Task 8 and Task 12 tests.
5. **The switch from server rows to copy rows**: same rows, same order, so nothing jumps. Task 11 parity test on a fixture with transfers, trades, tags, sub-categories, ledger rows and a before-start row.

**Execution notes:** Tasks 1–7 and 10–11 are server/core; 8, 9, 12 web data; 13 screens. Order: 1 → 2 → (3, 4, 5 in parallel) → 6 → 7 → 10 → 11 → 8 → 9 → 12 → 13 → 14. Task 5's allow-list and Task 11's fixes need planner review.

---

### Task 1: Sync tables and the stamp column

**Files:**
- Create: `apps/api/migrations/0029_personal_sync.sql`
- Modify: `libs/api/db/src/schema.ts` (new tables; `syncVersion` on `personalTransactions`)
- Modify: `apps/api/wrangler.jsonc` (`vars.PERSONAL_SYNC_EPOCH = "1"`), `libs/api/db/src/env.ts` (add `PERSONAL_SYNC_EPOCH?: string`)
- Test: `apps/api/test/schema-personal-sync.test.ts`

**Interfaces:**
- Produces (Drizzle): `personalSyncState` { `userId` text PK → users.id cascade, `version` int not null default 0, `epoch` int not null default 0, `purgedVersion` int not null default 0, `updatedAt` text not null }; `personalSyncDeletions` { `userId` text not null → users.id cascade, `transactionId` text not null, `version` int not null, `deletedAt` text not null, PK (`userId`, `transactionId`), index `personal_sync_del_user_version_idx` (`userId`, `version`), index `personal_sync_del_deleted_at_idx` (`deletedAt`) }; `personalTransactions.syncVersion` int not null default 0 (column `sync_version`) with index `personal_tx_user_sync_idx` (`userId`, `syncVersion`, `id`).

- [ ] **Step 1: Write the failing test** `schema-personal-sync.test.ts`: after migrations, `PRAGMA table_info(personal_sync_state)` lists `user_id, version, epoch, purged_version, updated_at`; `personal_transactions` has `sync_version` defaulting to 0 (insert a row without it, read 0); `PRAGMA index_list(personal_transactions)` includes `personal_tx_user_sync_idx`; `personal_sync_deletions` has both indexes.
- [ ] **Step 2: Run** `npm test -w @cc/api -- schema-personal-sync` — Expected: FAIL (no such table).
- [ ] **Step 3: Write the migration and schema** (SQL matches the Drizzle definitions above; existing rows get `sync_version = 0`).
- [ ] **Step 4: Run** the test — Expected: PASS. Also `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(api): personal sync tables and stamp column (#133)`

### Task 2: Shared write helper

**Files:**
- Create: `libs/api/db/src/personalSync.ts`
- Test: `apps/api/test/personal-sync-helpers.test.ts`

**Interfaces:**
- Produces:
  - `personalVersionExpr(userId: string): SQL` — `(SELECT version FROM personal_sync_state WHERE user_id = ?)`; used as the value of `syncVersion` in inserts/updates inside the same batch, after the bump.
  - `commitPersonalWrite(db: Db, userId: string, build: (v: SQL) => BatchItem<'sqlite'>[]): Promise<void>` — runs one `db.batch` of `[upsert-bump, ...build(personalVersionExpr(userId))]`. The bump is `INSERT INTO personal_sync_state (user_id, version, epoch, purged_version, updated_at) VALUES (?, 1, 0, 0, now) ON CONFLICT(user_id) DO UPDATE SET version = version + 1, updated_at = excluded.updated_at`.
  - `personalBumpStatement(db: Db, userId: string): BatchItem<'sqlite'>` — the bump alone, for routes that already build their own batch.
  - `recordDeletions(db: Db, userId: string, where: SQL): BatchItem<'sqlite'>` — `INSERT OR REPLACE INTO personal_sync_deletions SELECT user_id, id, <versionExpr>, now FROM personal_transactions WHERE user_id = ? AND (<where>)`; must sit **before** the delete in the batch.
  - `clearDeletions(db: Db, userId: string, ids: string[]): BatchItem<'sqlite'>` — removes deletion records for re-inserted ids.
  - `bumpPersonalEpoch(db: Db, userId: string): BatchItem<'sqlite'>` — upsert that sets `epoch = epoch + 1`.

- [ ] **Step 1: Write the failing tests:**
  - `commitPersonalWrite bumps from 0 to 1 then 2`: two calls with an empty build → `version` 2.
  - `stamps rows with the new version`: build inserts a personal transaction with `syncVersion: v` → row's `sync_version` equals state `version`.
  - `recordDeletions before delete records id and version`: seed a row, `commitPersonalWrite(db, u, v => [recordDeletions(db, u, sql\`id = 'tx1'\`), db.delete(...)])` → `personal_sync_deletions` has (`u`, `tx1`, current version); row gone.
  - `clearDeletions removes the record`.
  - `bumpPersonalEpoch` raises `epoch` by 1 and leaves `version`.
- [ ] **Step 2: Run** `npm test -w @cc/api -- personal-sync-helpers` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `libs/api/db/src/personalSync.ts` with the signatures above.
- [ ] **Step 4: Run** the tests — Expected: PASS.
- [ ] **Step 5: Commit** `feat(api-db): commitPersonalWrite and deletion records (#133)`

### Task 3: Entries routes go through the helper

**Files:**
- Modify: `apps/api/src/personal/entries.ts` (create at ~430, patch at ~685, delete at ~1000, restore at ~1131: every `db.batch` that writes `personalTransactions` or `personalTransactionTags`)
- Test: `apps/api/test/personal-sync-entries.test.ts`

**Interfaces:**
- Consumes: Task 2 (`commitPersonalWrite`, `recordDeletions`, `clearDeletions`).
- Produces: every insert/update of `personalTransactions` sets `syncVersion: v` and `updatedAt`; a tag-only change on a transaction also stamps that transaction; delete records both sides of a transfer; restore clears deletion records for the restored ids.

- [ ] **Step 1: Write the failing tests** (helper `stateVersion(userId)` and `rowVersion(id)` read straight from D1). Each asserts the version rose by exactly 1 and every touched row's `sync_version` equals it:
  - `create expense stamps the row`; `create transfer stamps both sides`; `create buy stamps the row`;
  - `patch amount stamps`; `patch tags only stamps the transaction`; `patch transfer stamps both sides`;
  - `delete records deletions for both transfer sides and removes rows`;
  - `restore re-inserts, stamps and clears the deletion records`;
  - `a rejected write (422) leaves the version unchanged`.
- [ ] **Step 2: Run** `npm test -w @cc/api -- personal-sync-entries` — Expected: FAIL.
- [ ] **Step 3: Implement**: replace each `db.batch(stmts)` with `commitPersonalWrite(db, user.id, (v) => stmts)` built with `syncVersion: v`; deletes add `recordDeletions` first; restore adds `clearDeletions`.
- [ ] **Step 4: Run** the new test and the existing `personal-entries*`, `personal-trades`, `personal-list` tests — Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): stamp personal entry writes for sync (#133)`

### Task 4: Bulk writes in categories, assets and tags

**Files:**
- Modify: `apps/api/src/personal/categories.ts` (category delete with `moveTo` ~360; tag delete ~477), `apps/api/src/personal/assets.ts` (asset delete with `moveTo` ~333)
- Test: `apps/api/test/personal-sync-bulk.test.ts`

**Interfaces:**
- Consumes: Task 2.
- Produces: a category/asset move stamps every moved row; deleting a tag stamps every transaction that carried it, **before** the tag rows are deleted (`UPDATE personal_transactions SET sync_version = v WHERE id IN (SELECT transaction_id FROM personal_transaction_tags WHERE tag_id = ?)`). Renames don't bump.

- [ ] **Step 1: Write the failing tests:** `category delete with moveTo stamps moved rows`; `asset delete with moveTo stamps moved rows`; `tag delete stamps tagged transactions`; `renaming a tag does not bump the version`.
- [ ] **Step 2: Run** `npm test -w @cc/api -- personal-sync-bulk` — Expected: FAIL.
- [ ] **Step 3: Implement** with `commitPersonalWrite`.
- [ ] **Step 4: Run** the new test plus existing `personal-categories`, `personal-assets*` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): stamp bulk personal writes for sync (#133)`

### Task 5: Account merge resets copies; static guard

**Files:**
- Modify: `apps/api/src/auth/mergeUsers.ts` (add `bumpPersonalEpoch` for both user ids to the merge batch)
- Test: `apps/api/test/personal-sync-merge.test.ts`, `apps/api/test/personal-sync-guard.test.ts`

**Interfaces:**
- Consumes: Task 2 (`bumpPersonalEpoch`).

- [ ] **Step 1: Write the failing tests:**
  - `merging accounts bumps the epoch of the surviving user` (state `epoch` rises by 1).
  - Static guard `personal-sync-guard.test.ts`: read every `.ts` under `apps/api/src` (Vite `import.meta.glob('../src/**/*.ts', { query: '?raw', eager: true })`). (a) Every file containing `insert(personalTransactions`, `update(personalTransactions` or `delete(personalTransactions` also contains `commitPersonalWrite`. (b) Every file containing `insert(transactions)`, `update(transactions)`, `insert(transactionShares)`, `update(transactionShares)` or `delete(transactionShares)` also contains `commitTripWrite` or `guardedTripWrite`; files that legitimately don't are listed in an explicit `ALLOWED` array with a one-line reason each (the implementer fills it from the scan; the planner reviews every entry).
- [ ] **Step 2: Run** both — Expected: merge test FAILS; the guard test may pass or list offenders.
- [ ] **Step 3: Implement** the merge change; fix or allow-list guard offenders (allow-list only with a reason that the write can't change a direct-ledger row).
- [ ] **Step 4: Run** both plus existing `auth*merge*` tests — Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): reset saved copies on account merge, guard sync writes (#133)`

### Task 6: Sync endpoint and deletion purge

**Files:**
- Create: `apps/api/src/personal/sync.ts` (route), mount in `apps/api/src/personal/routes.ts`
- Modify: `apps/api/src/personal/personRows.ts` (extract `loadLedgerRows(db, ledger, range?)` used by both `loadPersonRows` and sync)
- Modify: `apps/api/src/index.ts` (hourly cron calls `purgeSyncDeletions(env, now)`), create `apps/api/src/personal/syncPurge.ts`
- Modify: `libs/shared/core/src/api-types.ts` (types below)
- Test: `apps/api/test/personal-sync-endpoint.test.ts`, `apps/api/test/personal-sync-purge.test.ts`

**Interfaces:**
- Produces (core types):
```ts
export interface SyncEntryRow {
  id: string; walletId: string; type: PersonalEntryType; amount: number;
  categoryId: string | null; assetId: string | null; quantity: number | null;
  transferId: string | null; counterpartWalletId: string | null;
  date: string; time: string | null; note: string | null; tagIds: string[];
  excludeFromReports: boolean; createdAt: string; syncVersion: number;
}
export interface SyncLedgerRow {
  id: string; tripId: string; date: string; share: number; total: number;
  note: string; people: string[]; createdAt: string;
}
export interface SyncCursor { v: number; id: string }
export interface SyncResponse {
  status: 'current' | 'delta' | 'reset';
  epoch: string;              // `${PERSONAL_SYNC_EPOCH}.${state.epoch}`
  version: number;            // server version when this request read the state
  entries: SyncEntryRow[];    // ordered by (syncVersion, id), at most 500
  removedIds: string[];       // only on the first page of a delta (no cursor sent)
  cursor: SyncCursor | null;  // non-null: call again with it for the next page
  ledger: { version: number; rows: SyncLedgerRow[] } | null; // null = unchanged; only on the first page
}
```
- Route `GET /me/personal/sync` (`requirePersonal`), query: `epoch?`, `since?` (int, the browser's stored version), `ledgerVersion?` (int), `cursorV?` + `cursorId?`.
  - Reads `personal_sync_state` (missing row = version 0, epoch 0, purgedVersion 0).
  - `reset` when `since` is absent, `epoch` differs, or `since < purgedVersion`; a reset pages through **all** the user's rows (`syncVersion >= 0`) and always sends `ledger`.
  - `current` when `since === version` and the ledger version matches: no entries, `ledger: null`, ≤ 3 rows read (state, ledger lookup, trip version).
  - `delta` otherwise: rows with `syncVersion > since`, plus `removedIds` with deletion `version > since`.
  - Paging: `WHERE user_id = ? AND (sync_version, id) > (cursorV, cursorId)` ordered by `sync_version, id`, limit 500 (fetch 501 to set `cursor`).
  - `ledger` when `ledgerVersion` differs from the direct ledger trip's `trips.version` (or on reset): all of that ledger's rows (approved, latest, expense), via `loadLedgerRows` with no date range. No ledger → `{ version: 0, rows: [] }`.
- `purgeSyncDeletions(env: Env, now: Date): Promise<void>`: per user, sets `purged_version = max(purged_version, max(version of records older than 90 days))`, then deletes those records.

- [ ] **Step 1: Write the failing tests:**
  - `no since → reset with every row and the ledger`; `same version and ledger → current with no entries`;
  - `after an edit → delta with just that row`; `after a delete → delta with removedIds`;
  - `1,201 rows page as 500/500/201 with cursors, no duplicates or gaps`;
  - `wrong epoch → reset`; `since below purgedVersion → reset`;
  - `a quick expense added → ledger rows resent with the new trip version`; `a guest expense approved in the ledger → ledger resent`;
  - `no personal area → 403` (same as other personal routes);
  - purge: `records older than 90 days are removed and purgedVersion rises`; `newer records stay`.
- [ ] **Step 2: Run** `npm test -w @cc/api -- personal-sync-endpoint personal-sync-purge` — Expected: FAIL.
- [ ] **Step 3: Implement** the route, `loadLedgerRows`, the purge and the types.
- [ ] **Step 4: Run** these plus existing `personal-list`, `cron-*` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): personal sync endpoint and deletion purge (#133)`

### Task 7: Shared list rules in core; accent-free server note match

**Files:**
- Create: `libs/shared/core/src/listFilter.ts`, export from `libs/shared/core/src/index.ts`
- Modify: `apps/api/src/personal/list.ts` (the `needle` filter uses `matchesNote`)
- Test: `libs/shared/core/src/__tests__/listFilter.test.ts`, add a case to a new `apps/api/test/personal-list-accents.test.ts`

**Interfaces:**
- Produces:
  - `foldForSearch(text: string): string` — NFD, strip combining marks, `đ/Đ → d`, lower-case. (Same folding as `normalizeName` without collapsing spaces.)
  - `matchesNote(note: string | null, q: string): boolean` — `foldForSearch(note ?? '').includes(foldForSearch(q.trim()))`; empty `q` matches all.
  - `listPeriod(query: ListQuery, today: string): { from: string; to: string }` — the same bounds as `parseListPeriod` in `list.ts` (month → its first/last day; only `to` → 1st of its month; only `from` → today), moved here and used by `list.ts`.
  - `compareListRows(a: ListRow, b: ListRow): number` — moved from `list.ts` unchanged.
  - `matchesListQuery(row: ListRow, query: ListQuery, ctx: { period: { from: string; to: string }; tagIdsOf(entryId: string): string[]; categoryParentOf(id: string): string | null }): boolean` — the same rules the endpoint applies: period, `type` groups (`transfer` = transfer_in/out, `trade` = buy/sell, `person` = person rows only, other types exclude person rows), wallet, category including direct children, asset, tag, note. Person rows pass wallet only when it equals their `walletId`, and drop out for category, asset and tag filters (as today: those filters only exist in the entries SQL).

- [ ] **Step 1: Write the failing tests:** `foldForSearch('Cà Phê Đá') === 'ca phe da'`; `matchesNote('Cà phê sữa', 'ca phe')`; `matchesNote(null, '')`; one `matchesListQuery` case per rule above; `compareListRows` keeps today's order (date desc, time desc, createdAt desc). API test: a note `Cà phê` is found by `q=ca phe`.
- [ ] **Step 2: Run** `npm test -w @cc/core -- listFilter` and `npm test -w @cc/api -- personal-list-accents` — Expected: FAIL.
- [ ] **Step 3: Implement**; `list.ts` imports `listPeriod`, `compareListRows`, `matchesNote` from `@cc/core`.
- [ ] **Step 4: Run** these plus the existing `personal-list` test — Expected: PASS.
- [ ] **Step 5: Commit** `feat(core): shared list rules and accent-free note match (#133)`

### Task 8: The browser copy store

**Files:**
- Create: `libs/web/data-access/src/txCopy/store.ts`
- Modify: `libs/web/data-access/package.json` (`idb@8.0.0`, dev `fake-indexeddb@6.0.0`)
- Test: `libs/web/data-access/src/__tests__/txCopy-store.test.ts` (imports `fake-indexeddb/auto`)

**Interfaces:**
- Produces:
```ts
export const TX_COPY_FORMAT = 1;
export interface TxCopyState { format: number; epoch: string; version: number; ledgerVersion: number; ready: boolean }
export interface TxCopySnapshot { state: TxCopyState; entries: SyncEntryRow[]; ledger: SyncLedgerRow[] }
export interface TxCopyStore {
  load(): Promise<TxCopySnapshot | null>;          // null = empty or wrong format (wiped)
  apply(change: { entries: SyncEntryRow[]; removedIds: string[]; ledger?: SyncLedgerRow[] }): Promise<void>; // ledger given = replace all ledger rows
  saveState(state: TxCopyState): Promise<void>;
  wipe(): Promise<void>;
}
export function openTxCopyStore(userId: string): Promise<TxCopyStore | null>; // null when IndexedDB is unavailable or throws
export function deleteTxCopy(userId: string): Promise<void>;                  // never throws
```
- DB name `cc-tx-copy-<userId>`; object stores `entries` (keyPath `id`), `ledger` (keyPath `id`), `meta` (key `state`).

- [ ] **Step 1: Write the failing tests:** `apply then load returns the rows`; `removedIds delete rows`; `ledger replaces all ledger rows`; `a stored state with another format loads as null and wipes`; `openTxCopyStore returns null when indexedDB is undefined`; `openTxCopyStore returns null when open throws`; `deleteTxCopy removes the database`.
- [ ] **Step 2: Run** `npm test -w @cc/web-data-access -- txCopy-store` — Expected: FAIL.
- [ ] **Step 3: Implement** with `idb`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web-data-access): IndexedDB transaction copy store (#133)`

### Task 9: Sync engine

**Files:**
- Create: `libs/web/data-access/src/txCopy/sync.ts`
- Test: `libs/web/data-access/src/__tests__/txCopy-sync.test.ts`

**Interfaces:**
- Consumes: Task 6 (`SyncResponse`), Task 8 (`TxCopyStore`).
- Produces:
```ts
export type FetchSync = (params: { epoch?: string; since?: number; ledgerVersion?: number; cursor?: SyncCursor }) => Promise<SyncResponse>;
export function syncTxCopy(store: TxCopyStore, fetchSync: FetchSync): Promise<'current' | 'updated' | 'reset'>;
```
- Behaviour: load state; first request sends its `epoch/since/ledgerVersion` (none when no state). On `reset`, wipe first. Apply each page (`entries`, first page's `removedIds` and `ledger`), follow `cursor` until null, then save `{ format, epoch, version: <first page's version>, ledgerVersion: <ledger.version or the stored one>, ready: true }`. A failure mid-run leaves the previous state (not `ready` if it was a first download) so the next run starts again.

- [ ] **Step 1: Write the failing tests** (fake `FetchSync`, real store on fake-indexeddb): `first run downloads all pages and becomes ready`; `current makes no writes`; `delta upserts and removes`; `reset wipes stale rows`; `the stored version is the first page's even when later pages carry newer rows`; `ledger null keeps ledger rows, ledger given replaces them`; `a fetch error mid-download leaves ready false`.
- [ ] **Step 2: Run** `npm test -w @cc/web-data-access -- txCopy-sync` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web-data-access): transaction copy sync engine (#133)`

### Task 10: From copy rows to list rows

**Files:**
- Create: `libs/shared/core/src/copyRows.ts` (in core, so the API parity test in Task 11 can call it), export from `index.ts`
- Test: `libs/shared/core/src/__tests__/copyRows.test.ts`

**Interfaces:**
- Consumes: Task 7 (`matchesListQuery`, `listPeriod`, `compareListRows`), Task 6 types, existing `WalletDetailView`, `CategoryView`, `TagView`.
- Produces:
```ts
export interface CopyRows { entries: SyncEntryRow[]; ledger: SyncLedgerRow[] }
export interface CopyLookups { wallets: WalletDetailView[]; categories: CategoryView[]; tags: TagView[] }
export function listFromCopy(rows: CopyRows, query: ListQuery, lookups: CopyLookups, today: string): ListRow[];
```
(`TxCopySnapshot` from Task 8 satisfies `CopyRows`.)
- Fills `EntryView.currency` from the wallet, `beforeStart` = `date < wallet.startDate` (same rule as `list.ts`), `tags` = tag names in the order the server returns them, `source: 'manual'`; person rows get `walletId` = the default wallet's id and `currency: 'VND'`, and are dropped when there is no default wallet (as `loadPersonRows` does). Filters with `matchesListQuery`, sorts with `compareListRows`.

- [ ] **Step 1: Write the failing tests:** `fills currency, beforeStart and tag names`; `person rows take the default wallet`; `no default wallet → no person rows`; `month filter`; `tag filter by id`; `sorted like the server`.
- [ ] **Step 2: Run** `npm test -w @cc/core -- copyRows` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(core): build list rows from the saved copy (#133)`

### Task 11: Parity check

**Files:**
- Test: `apps/api/test/personal-sync-parity.test.ts`

**Interfaces:**
- Consumes: Task 6 route, Task 10 `listFromCopy` (from `@cc/core`), the existing wallets/categories/tags endpoints for the lookups.

- [ ] **Step 1: Write the failing test.** Seed one user: two wallets (one with a start date after some rows), a transfer, a buy, a parent category with a sub-category, two tags, notes with accents (`Cà phê sữa`), three quick expenses in the direct ledger. Fetch `/sync` (full), the lookups, and for each query — a month, a range, `type=transfer`, `categoryId=<parent>`, `tagId`, `q=ca phe`, `type=person` — assert `listFromCopy(sync, query, lookups, today)` deep-equals `GET /me/personal/transactions?<query>`'s `rows`.
- [ ] **Step 2: Run** `npm test -w @cc/api -- personal-sync-parity` — Expected: PASS if Tasks 6, 7 and 10 agree; any FAIL names the drifting field.
- [ ] **Step 3: Fix** whichever side drifts (in Task 6/7/10 code), never the assertion.
- [ ] **Step 4: Run** again — Expected: PASS.
- [ ] **Step 5: Commit** `test: server and saved copy give the same rows (#133)`

### Task 12: Copy lifecycle in the app

**Files:**
- Create: `libs/web/data-access/src/txCopy/hooks.ts` (imported as `@cc/web-data-access/txCopy/hooks`; the package exports `./*` → `./src/*.ts`)
- Modify: `libs/web/data-access/src/personalMoney.ts` (mutations notify the copy), `libs/web/data-access/src/signOut.ts` (delete the copy), `libs/web/data-access/src/personal.ts` (`useSetPersonalArea` off → delete the copy)
- Test: `libs/web/data-access/src/__tests__/txCopy-hooks.test.tsx`

**Interfaces:**
- Consumes: Tasks 8–10, `useMe()` for the user id, `apiFetch`.
- Produces:
```ts
export type TxCopyStatus = 'unavailable' | 'loading' | 'ready';
export function useTxCopy(): { status: TxCopyStatus; snapshot: TxCopySnapshot | null };
export function useCopyList(query: ListQuery, opts?: { enabled?: boolean }): { rows: ListRow[] | null; ready: boolean }; // rows null until ready
export function requestTxCopySync(): void;   // single-flight; coalesces calls
export function resetTxCopy(): Promise<void>; // wipe + full download
```
- One module-level controller per user id: opens the store, loads the snapshot (status `ready` when the stored state is ready), syncs on the first `useTxCopy` mount, on `visibilitychange` to visible, and on `requestTxCopySync()`. Never on a timer. Snapshot updates re-render subscribers (`useSyncExternalStore`).
- After own writes: `useCreateEntry`, `useUpdateEntry`, `useDeleteEntry`, `useRestoreEntry` and the category/asset/tag delete mutations apply the response's entries to the copy where the response has them (create/update/restore return `EntriesResponse`; delete removes the id) and then call `requestTxCopySync()`. Quick-expense mutations only call `requestTxCopySync()`.
- Sign-out and turning Sổ chi tiêu off call `deleteTxCopy(userId)` and drop the controller.

- [ ] **Step 1: Write the failing tests** (fake-indexeddb, mocked `apiFetch`): `first mount downloads and becomes ready`; `useCopyList returns null rows until ready`; `visibility change triggers a sync`; `two requestTxCopySync calls make one request`; `creating an entry shows in useCopyList before the sync returns`; `sign-out deletes the copy`; `status is unavailable when indexedDB is missing`; `a failed sync keeps the copy readable and retries on the next trigger`.
- [ ] **Step 2: Run** `npm test -w @cc/web-data-access -- txCopy-hooks` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** plus existing `web-data-access` tests — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web-data-access): saved copy lifecycle and hooks (#133)`

### Task 13: `/transactions` reads the copy; "Tải lại dữ liệu"

**Files:**
- Modify: `libs/web/screens/src/screens/TransactionsScreen.tsx` (`MonthBlock` takes rows from `useCopyList(query)` when ready, else `usePersonalList(query)`, which is disabled once the copy is ready)
- Modify: `libs/web/screens/src/components/AccountMenu.tsx` (a "Tải lại dữ liệu" row under the Sổ chi tiêu setting, shown only when it is on; calls `resetTxCopy()`, shows a snackbar "Đang tải lại dữ liệu…")
- Modify: `libs/web/i18n/src/vi.ts`, `en.ts`: `account.reloadData` "Tải lại dữ liệu" / "Reload data", `account.reloadDataHint` "Tải lại giao dịch đã lưu trên máy này" / "Download this device's saved transactions again", `account.reloadDataStarted` "Đang tải lại dữ liệu…" / "Reloading data…" (Vietnamese marked `// REVIEW`)
- Test: `libs/web/screens/src/screens/__tests__/transactions-copy.test.tsx`, `libs/web/screens/src/components/__tests__/account-reload-data.test.tsx`

**Interfaces:**
- Consumes: Task 12 hooks.

- [ ] **Step 1: Write the failing tests:** `before the copy is ready the month loads from the server`; `once ready, paging months makes no list request`; `rows are the same before and after the switch`; `filters apply from the copy`; `with IndexedDB unavailable the screen behaves as today`; account menu: `the reload row shows only with Sổ chi tiêu on` and `tapping it resets the copy`.
- [ ] **Step 2: Run** `npm test -w @cc/web-screens -- transactions-copy account-reload-data` — Expected: FAIL.
- [ ] **Step 3: Implement.** The "load older months" logic stays as is.
- [ ] **Step 4: Run** plus the existing `transactions`, `holdings-and-trade-rows`, `account-book` tests — Expected: PASS. Then `npm run typecheck && npm run lint`.
- [ ] **Step 5: Commit** `feat(web): /transactions reads the saved copy (#133)`

### Task 14: Planner verification

- [ ] Apply the migration locally: `npx wrangler d1 migrations apply fsl --local` (in `apps/api`).
- [ ] `npm test`, `npm run typecheck`, `npm run lint` — all green.
- [ ] Build, run the tunnel, and check in the browser on a phone width: first load (server, then copy), paging months with no network calls in DevTools, an edit on a second browser showing up after a tab return, sign-out clearing `cc-tx-copy-*`.
