# Balance Caching (#109) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate full-history transaction scans on personal wallet/summary/holdings/group-row/sync endpoints (Part 1) and on group-list/people-summary endpoints while hiding archived groups by default (Part 2), keeping exact balance parity across all screens within Cloudflare Free Plan limits.

**Architecture:**
- **Part 1 (Personal & Wallets):** Maintain `personal_wallet_balances` atomically inside `commitPersonalWrite` for O(1) everyday VND wallet reads and dirty-flagged `needs_replay` for non-VND/investment wallets, store `personal_assets.entry_count`, and cache per-`(user_id, trip_id)` group projections in `personal_trip_cache` (with `"__default__"` routing for unlinked rows) so reads only scan changed groups.
- **Part 2 (Groups & People + Hidden Archived Quick Win):** Consolidate group balance caching into `trip_balance_cache` (1 row per trip: raw + rounded participant balances, `suggestions`, `waiting` payments, `oldest_shared` map) populated exclusively via `settleLedger` and `myBalanceIn` so `GET /trips` refreshes stale groups in 1 multi-row upsert (`<= 6` queries total, preserving `trips-list-budget.test.ts` and `trip_views`) and `GET /me/people/summary` batch-refreshes stale groups in 3 queries instead of 8–9/group `buildSnapshot`. Add `?archived=exclude|only` + `X-Archived-Count` on `GET /trips` and a `"Show hidden groups"` toggle in `MyTrips.tsx`.

**Tech Stack:** TypeScript, Hono, Cloudflare Workers + D1 (SQLite), Drizzle ORM, Vitest (`@cloudflare/vitest-pool-workers`), React + TanStack Query, `@cc/core`.

**Spec:** [2026-11-22-balance-caching-design.md](file:///C:/Users/NvN/orca/workspaces/coin-crew/phase-2-balance-caching-that-scales-with-transac/docs/superpowers/specs/2026-11-22-balance-caching-design.md)

---

## Global Constraints

- Cloudflare Free Plan budgets: `5,000,000` D1 rows read/day, `100,000` D1 rows written/day, `50` D1 queries/request, `100` bound parameters/query, `10 ms` Worker CPU/request.
- Execution order: Part 1 (Personal & Wallets) first, then Part 2 (Groups, People & Hidden Archived Quick Win).
- Single source of truth: all money math uses `@cc/core` (`replayWallets`, `walletHoldings`, `vndTotal`, `groupRowEffect`, `pickFallbackVndWallet`) and `settleLedger` / `myBalanceIn`.
- No existing test may be edited or deleted; `npm test`, typecheck, lint, and Playwright `golden-path` & `walkthrough` specs must pass before merge.
- Archived groups must still count in personal wallet balances (`personal_trip_cache`) and appear in People (`GET /me/people/summary`) when they have unpaid balances or waiting payments.

## Review Focus

1. **Cross-currency transfer edits/deletes/restores:** Updating, deleting, or restoring a cross-currency transfer can alter cost basis across multiple non-VND/investment wallets; `markReplayStmts` must set `needs_replay = 1` on all non-VND/investment wallets of the user, and Task 2 tests must verify this.
2. **Oversell-rejected trade (`422 OVERSELL`):** A rejected `buy`/`sell` or `DELETE` must not mutate `personal_wallet_balances` or `personal_assets.entry_count`; all cache statements must run inside the same `commitPersonalWrite` batch after `assertNoOversell`, verified in Task 2.
3. **Default wallet swap or archiving a wallet:** Changing `isDefault` or `archived` on a wallet must re-route `"__default__"` group deltas at read time without invalidating `personal_trip_cache`, verified in Task 3.
4. **Concurrent stale-version cache writes:** An out-of-order read holding an older `trip_version` must never overwrite a newer `trip_balance_cache` or `personal_trip_cache` row (`setWhere: lte(...)`), verified in Tasks 3 and 4.
5. **Account merge (`mergeUsers` + `foldLedger`):** Folding a second ledger must delete `trip_balance_cache` for `fromTrip`, and merging accounts must delete `personal_trip_cache` for the survivor so merged memberships recompute cleanly, verified in Task 5.

---

## File Structure

| File | Responsibility |
|---|---|
| `libs/api/db/src/schema.ts` | Drizzle definitions for `personalWalletBalances`, `personalTripCache`, `tripBalanceCache`, and `personalAssets.entryCount` |
| `apps/api/migrations/0035_balance_caching.sql` | DDL for new tables/columns/indexes + set-based SQL backfill for `personal_wallet_balances` and `personal_assets.entry_count` |
| `apps/api/src/personal/balanceCache.ts` | Pure batch-statement builders for `personal_wallet_balances` and `personal_assets.entry_count` |
| `apps/api/src/personal/tripCache.ts` | Per-`(user_id, trip_id)` `personal_trip_cache` lazy refresh, `"__default__"` resolution, and cached `GroupRow[]` loader |
| `apps/api/src/personal/entries.ts` | Wire `balanceCache` delta/replay/asset-count statements into personal transaction POST, PATCH, DELETE, restore |
| `apps/api/src/personal/wallets.ts` | Initialize/update `personal_wallet_balances`; read wallets via cached `loadCalcCached` |
| `apps/api/src/personal/assets.ts` | Maintain `entry_count` on asset delete/reassign; read `entry_count` directly in `GET /me/personal/assets` |
| `apps/api/src/personal/groupLinks.ts` | Use `balanceCache` in `balance-check`; use `personal_trip_cache` in `GET /me/personal/group-rows` |
| `apps/api/src/personal/list.ts` | Scope `GET /me/personal/summary` to `[from, to]` + cached totals; reuse `personal_trip_cache` in `groups=show` list |
| `apps/api/src/personal/holdings.ts` | Use `loadCalcCached` instead of full-history `loadCalc` |
| `apps/api/src/personal/sync.ts` | Use `personal_trip_cache` for `GET /me/personal/sync?groups=show` |
| `apps/api/src/trips/balanceCache.ts` | `trip_balance_cache` builder/upserter from `settleLedger`, `myBalanceIn`, `waiting` payments, and `oldest_shared` |
| `apps/api/src/trips/snapshot.ts` | Read/write `trip_balance_cache` in `loadTripList` (1 multi-row upsert) & `getSnapshot`; support `archived` filter in `loadTripList` |
| `apps/api/src/trips/routes.ts` | Support `?archived=exclude\|only` and `X-Archived-Count` header on `GET /trips` |
| `apps/api/src/me/balances.ts` | Read `trip_balance_cache` in `loadPeopleSummary` and batch-refresh stale trips in 3 queries |
| `apps/api/src/auth/mergeUsers.ts` | Clean `trip_balance_cache` in `foldLedger` and `personal_trip_cache` in `mergeUsers` |
| `apps/api/src/ops/backfillBalances.ts` | One-time chunked backfill runner for `trip_balance_cache` and `personal_trip_cache` |
| `libs/web/i18n/src/en.ts`, `libs/web/i18n/src/vi.ts` | Translation keys `trips.showHidden` and `trips.hideHidden` |
| `libs/web/screens/src/screens/MyTrips.tsx` | Fetch `/api/trips?archived=exclude` by default; toggle `"Show hidden groups"` via `/api/trips?archived=only` |

---

### Task 1: Schema, Migration `0035_balance_caching.sql`, and SQL Backfill

**Files:**
- Modify: `libs/api/db/src/schema.ts`
- Create: `apps/api/migrations/0035_balance_caching.sql`
- Test: `apps/api/test/schema-balance-caching.test.ts`

**Interfaces:**
- Produces in `libs/api/db/src/schema.ts`:
  - `personalAssets.entryCount` (`integer('entry_count').notNull().default(0)`)
  - `personalWalletBalances` (`walletId` PK, `userId`, `personalNet`, `entryCount`, `vndValue`, `cashVnd`, `holdingsJson`, `needsReplay`, `updatedAt`)
  - `personalTripCache` (`userId`, `tripId`, composite PK `(userId, tripId)`, `tripVersion`, `linksVersion`, `walletDeltasJson`, `rowsJson`, `updatedAt`)
  - `tripBalanceCache` (`tripId` PK, `tripVersion`, `balancesJson`, `roundedBalancesJson`, `suggestionsJson`, `waitingJson`, `oldestSharedJson`, `updatedAt`)

- [ ] **Step 1: Write the failing test**

Create `apps/api/test/schema-balance-caching.test.ts` that verifies:
- `personal_wallet_balances`, `personal_trip_cache`, `trip_balance_cache` tables exist in `sqlite_master` and `personal_assets` has `entry_count`.
- Inserting a user, VND wallet, USD wallet, asset, and personal transactions, then applying the backfill SQL statements produces exact `personal_net`, `entry_count`, `needs_replay = 0` for VND everyday and `needs_replay = 1` for USD/investment, and exact `personal_assets.entry_count`.
- Deleting the wallet cascades to `personal_wallet_balances`; deleting the user cascades to `personal_trip_cache`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config apps/api/vitest.config.ts apps/api/test/schema-balance-caching.test.ts`
Expected: FAIL (`no such table: personal_wallet_balances` / missing schema exports).

- [ ] **Step 3: Update `libs/api/db/src/schema.ts` and create `apps/api/migrations/0035_balance_caching.sql`**

In `libs/api/db/src/schema.ts`:
- Add `entryCount: integer('entry_count').notNull().default(0)` to `personalAssets`.
- Add `personalWalletBalances`, `personalTripCache`, and `tripBalanceCache` table definitions with indexes (`personal_wallet_balances_user_idx`, `personal_trip_cache_trip_idx`).

In `apps/api/migrations/0035_balance_caching.sql`:
- `ALTER TABLE personal_assets ADD COLUMN entry_count INTEGER NOT NULL DEFAULT 0;`
- `CREATE TABLE personal_wallet_balances (...)` + index on `user_id`.
- `CREATE TABLE personal_trip_cache (...)` + index on `trip_id`.
- `CREATE TABLE trip_balance_cache (...)`.
- Set-based SQL backfill for `personal_wallet_balances`:
  - `INSERT OR IGNORE INTO personal_wallet_balances ...` joining `personal_wallets`, `personal_wallet_settings`, and aggregated `personal_transactions` (`SUM(CASE WHEN type IN ('income','transfer_in','sell') THEN amount ELSE -amount END)`, `COUNT(*)`), setting `needs_replay = CASE WHEN pw.currency <> 'VND' OR COALESCE(pws.kind, 'everyday') = 'investment' THEN 1 ELSE 0 END`.
- Set-based SQL backfill for `personal_assets.entry_count` from `personal_transactions`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config apps/api/vitest.config.ts apps/api/test/schema-balance-caching.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add libs/api/db/src/schema.ts apps/api/migrations/0035_balance_caching.sql apps/api/test/schema-balance-caching.test.ts
git commit -m "feat(db): add balance cache tables and SQL backfill (#109)"
```

---

### Task 2: Atomic `personal_wallet_balances` & `personal_assets.entry_count` Maintenance on Personal Writes

**Files:**
- Create: `apps/api/src/personal/balanceCache.ts`
- Modify: `apps/api/src/personal/entries.ts`
- Modify: `apps/api/src/personal/wallets.ts`
- Modify: `apps/api/src/personal/groupLinks.ts`
- Modify: `apps/api/src/personal/assets.ts`
- Test: `apps/api/test/personal-wallet-cache-writes.test.ts`

**Interfaces:**
- Consumes: `personalWalletBalances`, `personalWallets`, `personalWalletSettings`, `personalAssets` from `@cc/api-db/schema`; `commitPersonalWrite` from `@cc/api-db/personalSync`.
- Produces in `apps/api/src/personal/balanceCache.ts`:
  - `signedPersonalAmount(type: PersonalEntryType, amount: number): number`
  - `initWalletBalanceStmt(db: Db, userId: string, walletId: string, now: string): BatchItem<'sqlite'>`
  - `walletBalanceDeltaStmts(db: Db, userId: string, deltas: Array<{ walletId: string; netDelta: number; countDelta: number; needsReplay?: boolean }>, now: string): BatchItem<'sqlite'>[]`
  - `markAllNonVndOrInvestmentReplayStmt(db: Db, userId: string, now: string): BatchItem<'sqlite'>`
  - `assetCountDeltaStmts(db: Db, userId: string, deltas: Array<{ assetId: string; delta: number }>): BatchItem<'sqlite'>[]`

- [ ] **Step 1: Write the failing test**

Create `apps/api/test/personal-wallet-cache-writes.test.ts` testing:
- Creating VND everyday, USD everyday, and VND investment wallets initializes `personal_wallet_balances` rows (`0, 0, needs_replay = 0`).
- Creating, editing (amount change, `expense <-> income` flip, wallet move A -> B), deleting, and restoring expenses/income updates `personal_net` and `entry_count` identically to summing `personal_transactions`.
- Creating, editing (flipping wallets or amounts), deleting, and restoring a cross-currency transfer (VND -> USD) updates both wallets' `personal_net`/`entry_count` and sets `needs_replay = 1` on the USD wallet (and all non-VND/investment wallets).
- Creating, editing (changing `assetId`, amount, qty, wallet), deleting, and restoring `buy`/`sell` updates `personal_wallet_balances` (`needs_replay = 1`) and `personal_assets.entry_count`.
- A `sell` or `DELETE` of `buy` rejected with `422 OVERSELL` leaves `personal_wallet_balances` and `personal_assets.entry_count` completely unchanged.
- `POST /me/personal/wallets/:id/balance-check` (with `diff !== 0`) updates `personal_wallet_balances`.
- `DELETE /me/personal/assets/:id` with reassignment transfers `entry_count` to the target asset; `GET /me/personal/assets` returns the exact `entryCount`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config apps/api/vitest.config.ts apps/api/test/personal-wallet-cache-writes.test.ts`
Expected: FAIL (`personal_wallet_balances` not updated on writes).

- [ ] **Step 3: Implement `apps/api/src/personal/balanceCache.ts` and wire write paths**

- Implement `balanceCache.ts` using `onConflictDoUpdate` / `UPDATE` with `sql` arithmetic so deltas are atomic inside `commitPersonalWrite`.
- In `entries.ts`:
  - `POST /me/personal/transactions`: include `walletBalanceDeltaStmts` (and `assetCountDeltaStmts` for `buy`/`sell`, `markAllNonVndOrInvestmentReplayStmt` when transfer touches non-VND).
  - `PATCH /me/personal/transactions/:id`: read existing `amount`, `type`, `walletId`, `assetId` on `target` (and `pairRows` for transfers) before `commitPersonalWrite`, compute exact net/count/asset deltas (`-old`, `+new`), and append `walletBalanceDeltaStmts` / `assetCountDeltaStmts` / `markAllNonVndOrInvestmentReplayStmt`.
  - `DELETE /me/personal/transactions/:id`: append negative deltas for `sortedRows` (`buy`/`sell` also decrement `assetCountDeltaStmts`; cross-currency transfer sets replay).
  - `POST /me/personal/transactions/restore`: append positive deltas for `items` (and `assetCountDeltaStmts` / replay).
- In `wallets.ts`:
  - `POST /me/personal/wallets` and `POST /me/personal/wallets/add`: include `initWalletBalanceStmt` in `db.batch`.
  - `PATCH /me/personal/wallets/:id`: if `startAmount`, `startDate`, `startCostVnd`, or `currency` changed on a non-VND or investment wallet, set `needs_replay = 1` in the same batch.
- In `groupLinks.ts`:
  - `POST /me/personal/wallets/:id/balance-check`: when `diff !== 0`, include `walletBalanceDeltaStmts` inside `commitPersonalWrite`.
- In `assets.ts`:
  - `GET /me/personal/assets`: read `personalAssets.entryCount` directly (remove `LEFT JOIN personal_transactions` and `GROUP BY`).
  - `DELETE /me/personal/assets/:id`: when reassigning transactions to `targetAssetId`, add the deleted asset's `entry_count` to `targetAssetId` in the same `commitPersonalWrite` batch.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config apps/api/vitest.config.ts apps/api/test/personal-wallet-cache-writes.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/personal/balanceCache.ts apps/api/src/personal/entries.ts apps/api/src/personal/wallets.ts apps/api/src/personal/groupLinks.ts apps/api/src/personal/assets.ts apps/api/test/personal-wallet-cache-writes.test.ts
git commit -m "feat(personal): maintain wallet balance and asset count caches atomically on writes (#109)"
```

---

### Task 3: `personal_trip_cache` Lazy Refresh & Cached Personal Read Endpoints

**Files:**
- Create: `apps/api/src/personal/tripCache.ts`
- Modify: `apps/api/src/personal/wallets.ts`
- Modify: `apps/api/src/personal/list.ts`
- Modify: `apps/api/src/personal/holdings.ts`
- Modify: `apps/api/src/personal/sync.ts`
- Modify: `apps/api/src/personal/groupLinks.ts`
- Modify: `apps/api/src/personal/groupShares.ts` (add optional `tripIds?: string[]` scope to `loadGroupRows`)
- Test: `apps/api/test/personal-balance-parity.test.ts`

**Interfaces:**
- Consumes: `personalTripCache`, `personalWalletBalances`, `personalGroupLinks` from `@cc/api-db/schema`; `groupRowEffect`, `pickFallbackVndWallet`, `replayWallets`, `vndTotal`, `walletHoldings`, `walletVndValues` from `@cc/core`; `loadGroupRows` from `./groupShares`.
- Produces in `apps/api/src/personal/tripCache.ts`:
  - `DEFAULT_WALLET_DELTA_KEY = '__default__'`
  - `computeWalletDeltasForTrip(rows: GroupRow[]): Record<string, number>`
  - `loadCachedGroupRows(db: Db, userId: string): Promise<GroupRow[]>`
  - `loadCachedGroupWalletDeltas(db: Db, userId: string): Promise<Map<string, number>>`
- Produces in `apps/api/src/personal/wallets.ts`:
  - `loadCachedWalletsSummary(db: Db, userId: string): Promise<{ wallets: CachedWalletCalc[]; vnd: VndTotal; walletBalances: Map<string, number>; vndValues: Map<string, number | null>; holdingsByWallet: Map<string, Holding[]> }>`

- [ ] **Step 1: Write the failing test**

Create `apps/api/test/personal-balance-parity.test.ts` comparing cached endpoints against an uncached reference full-replay across:
- Everyday VND wallets + USD wallet + investment wallet (with buys, sells, cross-currency transfers, and group expenses/payments).
- Changing `isDefault` wallet and archiving a wallet re-routes `"__default__"` group deltas at read time without invalidating `personal_trip_cache`.
- Editing `PUT /me/personal/group-links/:rootId` (`walletId`, `intent` `shared <-> loan`, `excludeFromReports`) and `PUT /me/personal/group-settings` (`countLoans`) refreshes only the changed trip and matches `GET /me/personal/wallets`, `GET /me/personal/summary`, `GET /me/personal/holdings`, `GET /me/personal/transactions?groups=show`, `GET /me/personal/group-rows`, and `GET /me/personal/sync?groups=show`.
- Concurrent stale-version guard: attempting to upsert `personal_trip_cache` with `tripVersion < existing.tripVersion` does not overwrite the newer row.
- Warm `GET /me/personal/wallets` and `GET /me/personal/summary` execute `<= 6` D1 queries and read `0` rows from `personal_transactions` on `GET /me/personal/wallets`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config apps/api/vitest.config.ts apps/api/test/personal-balance-parity.test.ts`
Expected: FAIL (`personal_trip_cache` not populated or `personal_transactions` still scanned).

- [ ] **Step 3: Implement `tripCache.ts` and update personal read endpoints**

- In `groupShares.ts`: allow `loadGroupRows(db, userId, range?, tripIdsFilter?: string[])` so stale-trip refreshes only query `tripIdsFilter`.
- In `tripCache.ts`:
  - Query active participations (`participants` + `trips`) left-joined with `personal_trip_cache` and `MAX(personal_group_links.sync_version)` per `trip_id`.
  - For stale trips (`!cache || cache.tripVersion !== trip.version || cache.linksVersion !== maxLinksVersion`), call `loadGroupRows(db, userId, undefined, staleTripIds)`, compute `walletDeltasJson` with `computeWalletDeltasForTrip` (using `groupRowEffect` and `"__default__"` when `row.link?.walletId` is null), and upsert `personal_trip_cache` guarded with `setWhere: lte(personalTripCache.tripVersion, tripVersion)`.
  - Also prune any `personal_trip_cache` rows for trips the user is no longer active in.
- In `wallets.ts`:
  - Implement `loadCachedWalletsSummary`: reads wallets + `personal_wallet_balances` (1 query) and `loadCachedGroupWalletDeltas` (1–2 queries when warm).
  - If any wallet has `needs_replay === 1`, load `personal_transactions` ONLY if needed for replay (when `needs_replay === 1`) + `loadCachedGroupRows`, run `replayWallets`, persist `vnd_value`, `cash_vnd`, `holdings_json`, and clear `needs_replay = 0`.
  - Otherwise compute each wallet's balance directly as `startAmount + personalNet + resolvedGroupDelta` and build `vndTotal` / `holdings` from cached values with **zero** `personal_transactions` reads!
  - `GET /me/personal/wallets` reads `entryCount` from `personal_wallet_balances` (removes the `COUNT(*) GROUP BY` query).
- Update `list.ts` (`GET /me/personal/summary` uses `loadCachedWalletsSummary` + month-scoped `[from, to]` query on `personal_transactions`; `GET /me/personal/transactions?groups=show` uses `loadCachedGroupRows`), `holdings.ts`, `sync.ts`, and `groupLinks.ts` (`GET /me/personal/group-rows`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config apps/api/vitest.config.ts apps/api/test/personal-balance-parity.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/personal/tripCache.ts apps/api/src/personal/groupShares.ts apps/api/src/personal/wallets.ts apps/api/src/personal/list.ts apps/api/src/personal/holdings.ts apps/api/src/personal/sync.ts apps/api/src/personal/groupLinks.ts apps/api/test/personal-balance-parity.test.ts
git commit -m "feat(personal): cache group projections and serve wallet/summary/holdings from cache (#109)"
```

---

### Task 4: `trip_balance_cache` for `GET /trips`, `GET /me/people/summary`, and `buildSnapshot`

**Files:**
- Create: `apps/api/src/trips/balanceCache.ts`
- Modify: `apps/api/src/trips/snapshot.ts`
- Modify: `apps/api/src/me/balances.ts`
- Test: `apps/api/test/trip-balance-cache-parity.test.ts`

**Interfaces:**
- Consumes: `tripBalanceCache` from `@cc/api-db/schema`; `settleLedger`, `myBalanceIn` from `./snapshot`.
- Produces in `apps/api/src/trips/balanceCache.ts`:
  - `interface TripBalanceCachePayload { tripId: string; tripVersion: number; balances: Record<string, number>; roundedBalances: Record<string, number>; suggestions: Transfer[]; waiting: WaitingPaymentItem[]; oldestShared: Record<string, string>; }`
  - `buildTripBalanceCachePayload(trip: Pick<TripRow, 'id' | 'version' | 'fewestTransfers' | 'roundTransfers'>, source: LedgerSource & { expenses: { id: string; payerId: string; status: string; createdAt?: string; shares: { participantId: string }[] }[]; payments: { id: string; fromId: string; toId: string; amountClaimed: number; status: string }[] }, settled?: { balances: Record<string, number>; suggestions: Transfer[] }): TripBalanceCachePayload`
  - `upsertTripBalanceCacheBatch(db: Db, payloads: TripBalanceCachePayload[], now: string): Promise<void>` (multi-row `INSERT ... ON CONFLICT DO UPDATE` chunked at `12` rows per statement with `setWhere: lte(tripBalanceCache.tripVersion, sql\`excluded.trip_version\`)`)

- [ ] **Step 1: Write the failing test**

Create `apps/api/test/trip-balance-cache-parity.test.ts` testing:
- Group expenses (approved, pending, rejected, disabled, fund-paid, planning), payments (`says_paid`, `confirmed`, `notArrived`), `roundTransfers` on/off, `fewestTransfers` on/off, and multi-group `POST /me/people/:key/settle`:
  - `GET /trips`, `GET /trips/:id`, and `GET /me/people/summary` all return identical balances, waiting payments, and `oldestOpenAt`.
- After `GET /trips` or `GET /me/people/summary` refreshes stale groups, `trip_balance_cache` is populated and a second request executes `<= 3` (`GET /trips`) / `<= 6` (`GET /me/people/summary`) D1 queries without reading `transactions` or `transaction_shares`.
- Out-of-order stale-version guard: attempting to upsert `trip_balance_cache` with `tripVersion < existing.tripVersion` does not overwrite the newer row.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config apps/api/vitest.config.ts apps/api/test/trip-balance-cache-parity.test.ts`
Expected: FAIL (`trip_balance_cache` not populated or read).

- [ ] **Step 3: Implement `apps/api/src/trips/balanceCache.ts` and update `snapshot.ts` & `me/balances.ts`**

- In `apps/api/src/trips/balanceCache.ts`:
  - `buildTripBalanceCachePayload`: calls `settleLedger` (if not passed), computes `roundedBalances` via `myBalanceIn`, extracts `says_paid` payments into `waiting`, and computes `oldestShared` map keyed by `min(a,b)~max(a,b)`.
  - `upsertTripBalanceCacheBatch`: writes up to 12 payloads per multi-row `INSERT ... ON CONFLICT DO UPDATE` so 8 stale groups = **1** statement.
- In `apps/api/src/trips/snapshot.ts`:
  - `loadTripList`: left-join `tripBalanceCache` instead of `tripViews` (so `trip_views.json` is never read or parsed!). For stale groups, batch-load money rows (3 queries), run `settleLedger`, and call `upsertTripBalanceCacheBatch` (1 statement for `<= 12` groups).
  - `getSnapshot` / `buildSnapshot`: after building snapshot, also call `upsertTripBalanceCacheBatch` for that trip.
- In `apps/api/src/me/balances.ts`:
  - `loadPeopleSummary`: query `tripBalanceCache` instead of `tripViews`. For stale trips, batch-load money rows in 3 queries (shared helper with `loadTripList`), run `settleLedger`, call `upsertTripBalanceCacheBatch`, and assemble `people` summary without calling `buildSnapshot` per group (removing the 4-group `incomplete` cap for `loadPeopleSummary`).

- [ ] **Step 4: Run new test and existing budget test to verify both pass**

Run: `npx vitest run --config apps/api/vitest.config.ts apps/api/test/trip-balance-cache-parity.test.ts apps/api/test/trips-list-budget.test.ts apps/api/test/people-summary.test.ts`
Expected: PASS (and `trips-list-budget.test.ts` passes unmodified with `counter.queries <= 6` and untouched `trip_views`).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/trips/balanceCache.ts apps/api/src/trips/snapshot.ts apps/api/src/me/balances.ts apps/api/test/trip-balance-cache-parity.test.ts
git commit -m "feat(trips): add trip_balance_cache for group list and people summary (#109)"
```

---

### Task 5: Account Merge & Participant Merge Cache Invalidation

**Files:**
- Modify: `apps/api/src/auth/mergeUsers.ts`
- Test: `apps/api/test/balance-cache-merges.test.ts`

**Interfaces:**
- Consumes: `tripBalanceCache`, `personalTripCache` from `@cc/api-db/schema`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/test/balance-cache-merges.test.ts` testing:
- Account merge (`mergeUsers` with two accounts that both have personal ledgers and shared groups, after `trip_balance_cache` and `personal_trip_cache` were warmed):
  - `fromTrip` has no orphaned `trip_balance_cache` row.
  - Survivor's `GET /trips`, `GET /me/people/summary`, and `GET /me/personal/wallets` match a fresh uncached full-replay.
- Participant merge (`mergeParticipants`), participant remove, and participant leave:
  - `trips.version` bumps and next `GET /trips`, `GET /me/people/summary`, and `GET /me/personal/wallets` match uncached full-replay.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config apps/api/vitest.config.ts apps/api/test/balance-cache-merges.test.ts`
Expected: FAIL (orphaned `trip_balance_cache` or stale `personal_trip_cache` for survivor).

- [ ] **Step 3: Update `apps/api/src/auth/mergeUsers.ts`**

- In `foldLedger`: add `db.delete(tripBalanceCache).where(eq(tripBalanceCache.tripId, fromTrip))` alongside `tripViews`.
- In `mergeUsers` `phase1` batch: add `db.delete(personalTripCache).where(eq(personalTripCache.userId, aId))` (and `bId`'s rows cascade on `users` delete).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config apps/api/vitest.config.ts apps/api/test/balance-cache-merges.test.ts apps/api/test/merge-users.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/auth/mergeUsers.ts apps/api/test/balance-cache-merges.test.ts
git commit -m "fix(merge): invalidate and clean balance caches on account and ledger merge (#109)"
```

---

### Task 6: Hide Archived Groups by Default (API + `MyTrips.tsx` UI)

**Files:**
- Modify: `apps/api/src/trips/snapshot.ts` (`loadTripList`)
- Modify: `apps/api/src/trips/routes.ts` (`GET /trips`)
- Modify: `libs/web/i18n/src/en.ts`, `libs/web/i18n/src/vi.ts`
- Modify: `libs/web/screens/src/screens/MyTrips.tsx`
- Test: `apps/api/test/trips-archived-filter.test.ts`
- Test: `libs/web/screens/src/screens/__tests__/my-trips-archived.test.tsx`

**Interfaces:**
- Produces in `apps/api/src/trips/snapshot.ts`:
  - `type ArchivedFilter = 'all' | 'exclude' | 'only';`
  - `loadTripList(db: Db, userId: string, archivedFilter?: ArchivedFilter): Promise<{ items: TripListItem[]; archivedCount: number }>` (or keep `loadTripList` returning `TripListItem[]` and add `loadTripListFiltered` — keep existing callers of `loadTripList(db, userId)` working cleanly).
- Produces in `apps/api/src/trips/routes.ts`:
  - `GET /trips` supports `?archived=exclude` and `?archived=only`; sets `X-Archived-Count: <n>` header when `archived=exclude`; default (omitted) returns all groups unchanged.

- [ ] **Step 1: Write the failing tests (API + Web)**

- `apps/api/test/trips-archived-filter.test.ts`:
  - User with 2 active + 2 archived groups (one with unpaid balance):
    - `GET /api/trips` returns all 4.
    - `GET /api/trips?archived=exclude` returns only the 2 active groups and `X-Archived-Count: 2` header.
    - `GET /api/trips?archived=only` returns only the 2 archived groups.
    - `GET /api/me/personal/wallets` and `GET /api/me/people/summary` still include the archived groups' money/unpaid balances.
- `libs/web/screens/src/screens/__tests__/my-trips-archived.test.tsx`:
  - Renders `<MyTrips />` with active trips from `/api/trips?archived=exclude` and `X-Archived-Count: 1`.
  - Asserts archived trips are not shown initially, `"Show hidden groups"` button is visible at the bottom, clicking it fetches `/api/trips?archived=only` and renders the archived group, and clicking `"Hide hidden groups"` collapses them.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run --config apps/api/vitest.config.ts apps/api/test/trips-archived-filter.test.ts` and `npx vitest run --config libs/web/screens/vitest.config.ts libs/web/screens/src/screens/__tests__/my-trips-archived.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement API filter + `X-Archived-Count` and `MyTrips.tsx` toggle**

- Update `snapshot.ts` & `routes.ts`: validate `archived` query param (`undefined | 'exclude' | 'only'`, `422` otherwise); filter rows in SQL/memory without scanning `trip_balance_cache` for excluded archived groups; set `X-Archived-Count` header when `archived=exclude`.
- Add `trips.showHidden` (`"Show hidden groups"` / `"Hiện nhóm đã ẩn"`) and `trips.hideHidden` (`"Hide hidden groups"` / `"Ẩn nhóm đã ẩn"`) to `en.ts` and `vi.ts`.
- Update `MyTrips.tsx`: default `tripsQuery` fetches `/api/trips?archived=exclude` and reads `X-Archived-Count` header; render `"Show hidden groups"` button at the bottom when `archivedCount > 0`, lazily fetching `/api/trips?archived=only` on click.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --config apps/api/vitest.config.ts apps/api/test/trips-archived-filter.test.ts` and `npx vitest run --config libs/web/screens/vitest.config.ts libs/web/screens/src/screens/__tests__/my-trips-archived.test.tsx libs/web/screens/src/components/__tests__/merge-request.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/trips/snapshot.ts apps/api/src/trips/routes.ts libs/web/i18n/src/en.ts libs/web/i18n/src/vi.ts libs/web/screens/src/screens/MyTrips.tsx apps/api/test/trips-archived-filter.test.ts libs/web/screens/src/screens/__tests__/my-trips-archived.test.tsx
git commit -m "feat(trips): hide archived groups by default with show-hidden toggle (#109)"
```

---

### Task 7: One-Time Chunked Backfill Runner & Heavy-Account Budget Test Suite

**Files:**
- Create: `apps/api/src/ops/backfillBalances.ts`
- Test: `apps/api/test/balance-caching-budget.test.ts`

**Interfaces:**
- Produces in `apps/api/src/ops/backfillBalances.ts`:
  - `backfillTripBalanceCache(db: Db, opts?: { limit?: number; afterTripId?: string }): Promise<{ processed: number; lastTripId: string | null; done: boolean }>`
  - `backfillPersonalTripCache(db: Db, opts?: { limit?: number; afterUserId?: string }): Promise<{ processed: number; lastUserId: string | null; done: boolean }>`

- [ ] **Step 1: Write the failing test**

Create `apps/api/test/balance-caching-budget.test.ts` that:
1. Seeds the exact heavy account profile from Spec Section 6:
   - 1 user, 30 groups (15 active + 15 archived), 500 transactions/group (15,000 group transactions), 2,000 personal transactions across 5 wallets (3 VND everyday, 1 USD everyday, 1 investment).
2. Runs `backfillTripBalanceCache` and `backfillPersonalTripCache` in chunks until `done === true`, verifying idempotency and exact balance parity.
3. Wraps `env.DB` with a proxy counting both `queries` (`prepare` calls) and `rowsRead` / `rowsWritten` (from D1 `meta.rows_read` and `meta.rows_written`) and asserts all Section 6 budgets:
   - Warm `GET /api/me/personal/wallets`: `queries <= 6`, `rowsRead <= 150`, `rowsWritten === 0`
   - Warm `GET /api/me/personal/summary?month=...`: `queries <= 6`, `rowsRead <= 250`, `rowsWritten === 0`
   - Warm `GET /api/trips?archived=exclude`: `queries <= 3`, `rowsRead <= 100`, `rowsWritten === 0`
   - Warm `GET /api/me/people/summary`: `queries <= 6`, `rowsRead <= 200`, `rowsWritten === 0`
   - `POST /api/me/personal/transactions` (VND): `queries <= 6`, `rowsRead <= 20`, `rowsWritten <= 10`
   - Next `GET /api/me/personal/wallets` after VND write: `queries <= 6`, `rowsRead <= 150`, `rowsWritten === 0`
   - After 1 group expense write (`POST /api/trips/:id/expenses`): `GET /api/trips?archived=exclude` and `GET /api/me/personal/wallets` each use `queries <= 8`, scan only the 1 changed group, and the following read returns to warm O(1).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config apps/api/vitest.config.ts apps/api/test/balance-caching-budget.test.ts`
Expected: FAIL (`backfillBalances` module not found).

- [ ] **Step 3: Implement `apps/api/src/ops/backfillBalances.ts`**

Implement resumable cursor-paged backfill helpers for `trip_balance_cache` and `personal_trip_cache` using `settleLedger` / `buildTripBalanceCachePayload` and `loadGroupRows` / `computeWalletDeltasForTrip`.

- [ ] **Step 4: Run heavy-account budget test + full verification suite**

Run:
- `npx vitest run --config apps/api/vitest.config.ts apps/api/test/balance-caching-budget.test.ts`
- `npm test`
- Typecheck, lint, and Playwright `golden-path` & `walkthrough` specs.
Expected: All pass with 0 failures and 0 modified existing tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/ops/backfillBalances.ts apps/api/test/balance-caching-budget.test.ts
git commit -m "feat(ops): add chunked balance cache backfill and heavy-account budget tests (#109)"
```

---

## Self-Review Check
- **Spec coverage:** Part 1 (`personal_wallet_balances`, `personal_assets.entry_count`, `personal_trip_cache`, month-scoped summary, cached `holdings`/`sync`/`group-rows`/`transactions?groups=show`), Part 2 (`trip_balance_cache`, `GET /trips` + `GET /me/people/summary` + `buildSnapshot` parity, `?archived=exclude|only` + `MyTrips.tsx` toggle), `mergeUsers`/`foldLedger`, SQL + chunked backfill, and all Section 6/7 parity & budget tests are mapped 1-to-1 to Tasks 1–7.
- **Type consistency:** `tripBalanceCache` (consolidated from `trip_participant_balances` + `trip_balance_cache` to satisfy `trips-list-budget.test.ts` `<= 6` query limit), `personalWalletBalances`, `personalTripCache`, and `personalAssets.entryCount` use consistent names and signatures across all tasks.
- **Review Focus:** All 5 failure modes are explicitly covered by tests in Tasks 2, 3, 4, and 5.
