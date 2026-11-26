# Phase 2: Balance Caching That Scales With Transaction Volume (#109)

**Status:** Draft (pending owner approval)  
**Issue:** [#109](https://github.com/NguyenVuNhan/Coin-crew/issues/109) (Part of #55, follows #74)  
**Date:** 2026-11-22

---

## 1. Intent & Why Now

Coin-crew runs on Cloudflare Workers + D1. Today, the app is not hitting limits yet, but the owner wants to get ahead of Cloudflare's **Free Plan** limits before multiple users enable the personal wallet feature and log transactions day to day:

- **D1 Free Plan limits:** `5,000,000` rows read/day, `100,000` rows written/day, `50` D1 queries/request.
- **Worker Free Plan limit:** `10 ms` CPU time/request.

Right now, personal wallet endpoints (`GET /me/personal/wallets`, `GET /me/personal/summary`, `GET /me/personal/holdings`, `GET /me/personal/group-rows`, `GET /me/personal/sync?groups=show`, `GET /me/personal/transactions?groups=show`) scan **all** `personal_transactions` for the user across all time and/or **all** latest `transactions` and `transaction_shares` across **every** group the user belongs to, then replay them in Worker JS. On the shared group side, `GET /trips` does not persist stale group recomputations, and `GET /me/people/summary` reads large `trip_views.json` blobs or runs up to 4 full 8–9 query `buildSnapshot` rebuilds per request.

Because D1 has been **temporarily upgraded this month**, we have a window to introduce the new cache tables/indexes and run mass backfills cleanly before returning to the free plan.

---

## 2. Goals, Non-Goals, Anti-Goals & Constraints

### Goals
1. **Execution order:** Implement **Part 1 (Personal & Wallets)** first, then **Part 2 (Groups, People & Hidden Archived Quick Win)**.
2. **Eliminate unbounded scans:** Stop day-to-day wallet, summary, holdings, group-list, and people-summary reads from scanning all-time `personal_transactions` or all-group `transactions`/`transaction_shares`.
3. **Single source of truth for money rules:** All cached numbers must be produced by the existing `@cc/core` and `settleLedger` / `myBalanceIn` / `groupRowEffect` / `replayWallets` logic so the group list, group screen, people tab, and wallets always agree.
4. **Enforceable heavy-account budget:** Establish concrete D1 query, row-read, row-written, and Worker CPU budgets and verify them with automated heavy-account tests.

### Non-Goals
- Changing Phase 1 group splitting, rounding, fewest-transfers, or settle-up math.
- Changing the default `GET /trips` response contract in a way that breaks existing tests or older clients.
- Eliminating every non-balance scan in the app (such as monthly cron email digests or free-text `q` search queries).

### Anti-Goals
- **Balance drift or stale numbers** between screens after any write.
- **Write amplification** that solves row-reads at the cost of blowing through D1's `100,000` rows written/day free-plan cap.
- **Editing or deleting existing tests** (per #55 epic rules: existing tests must remain untouched and continue to pass).

### Constraints
- Every existing test (`npm test`, typecheck, lint, `golden-path`, and `walkthrough` Playwright specs) must pass.
- D1 allows at most **100 bound parameters per query** and **50 queries per Worker invocation**; all batch/chunked queries must continue to respect these limits.

---

## 3. Part 1: Personal & Wallets Caching

### 3a. `personal_wallet_balances` Table

A per-wallet running cache table (1 row per `wallet_id`, FK to `personal_wallets.id` with `ON DELETE CASCADE`, indexed on `user_id`):

| Column | Type | Notes |
|---|---|---|
| `wallet_id` | `TEXT PK` | FK `personal_wallets(id) ON DELETE CASCADE` |
| `user_id` | `TEXT NOT NULL` | Indexed (`personal_wallet_balances_user_idx`) |
| `personal_net` | `INTEGER NOT NULL DEFAULT 0` | Running signed sum of `personal_transactions` for this wallet (`income`, `transfer_in`, `sell` are `+amount`; `expense`, `transfer_out`, `buy` are `-amount`) |
| `entry_count` | `INTEGER NOT NULL DEFAULT 0` | Count of `personal_transactions` rows in this wallet |
| `vnd_value` | `INTEGER` (nullable) | Cached VND value for non-VND / investment wallets |
| `cash_vnd` | `INTEGER` (nullable) | Cached cash VND value for non-VND / investment wallets |
| `holdings_json` | `TEXT` (nullable) | JSON array of `Holding[]` for investment wallets |
| `needs_replay` | `INTEGER NOT NULL DEFAULT 0` | `1` when cached `vnd_value` / `cash_vnd` / `holdings_json` is dirty and requires replay |
| `updated_at` | `TEXT NOT NULL` | ISO timestamp |

#### Atomic Write Maintenance
Every personal transaction or wallet mutation updates `personal_wallet_balances` atomically inside `commitPersonalWrite` (same D1 `db.batch`):

- **Everyday VND wallets (`kind = 'everyday'`, `currency = 'VND'`):**
  - Purely additive updates (`personal_net = personal_net + delta`, `entry_count = entry_count + countDelta`), leaving `needs_replay = 0`.
  - **Zero** `personal_transactions` rows scanned on write or on read.
- **Non-VND or investment wallets (and cross-currency transfers involving a non-VND wallet):**
  - Still update `personal_net` and `entry_count` atomically in the batch.
  - Set `needs_replay = 1` on the affected non-VND / investment wallet(s) — or on all non-VND / investment wallets of the user when a cross-currency transfer is created, edited, deleted, or restored (since transfer cost-basis chains across wallets).
  - On the next read (`GET /me/personal/wallets`, `GET /me/personal/summary`, `GET /me/personal/holdings`, `PATCH /me/personal/wallets/:id`, `POST /me/personal/wallets/:id/balance-check`), if any wallet has `needs_replay = 1`, replay using `@cc/core`'s `replayWallets`, persist `vnd_value`, `cash_vnd`, `holdings_json`, and reset `needs_replay = 0`.
  - When `needs_replay = 0`, reads use the cached values directly with **zero** `personal_transactions` scans.

#### Covered Write Paths
- `POST /me/personal/transactions` (expense, income, transfer pair, buy, sell)
- `PATCH /me/personal/transactions/:id` (expense/income edit including wallet move, type flip `expense <-> income`, or amount change; transfer edit including `fromWalletId`/`toWalletId` or amount change; buy/sell edit)
- `DELETE /me/personal/transactions/:id` (single entry or transfer pair)
- `POST /me/personal/transactions/restore` (single entry or transfer pair)
- `POST /me/personal/wallets/:id/balance-check` (when `diff !== 0` inserts an adjustment entry)
- `POST /me/personal/wallets` and `POST /me/personal/wallets/add` (initialize balance row with `personal_net = 0, entry_count = 0, needs_replay = 0`)
- `PATCH /me/personal/wallets/:id` (if `startAmount`, `startDate`, `startCostVnd`, or `currency` changes on a non-VND or investment wallet, set `needs_replay = 1`)
- `DELETE /me/personal/wallets/:id` (cascades via FK)

### 3b. `personal_assets.entry_count`

Add `entry_count INTEGER NOT NULL DEFAULT 0` to `personal_assets` (my call: column on `personal_assets` rather than a separate table, avoiding an extra join on `GET /me/personal/assets`).

Updated atomically inside `commitPersonalWrite` on:
- `POST /me/personal/transactions` (`buy` / `sell`: `+1`)
- `PATCH /me/personal/transactions/:id` (`buy` / `sell` changing `assetId`: `-1` old, `+1` new)
- `DELETE /me/personal/transactions/:id` (`buy` / `sell`: `-1`)
- `POST /me/personal/transactions/restore` (`buy` / `sell`: `+1`)
- `DELETE /me/personal/assets/:id` with reassignment (`apps/api/src/personal/assets.ts`: add deleted asset's count to target asset)

`GET /me/personal/assets` reads `personal_assets.entry_count` directly without joining `personal_transactions`.

### 3c. `personal_trip_cache` Table

A per-`(user_id, trip_id)` cache for personal group-share projections:

| Column | Type | Notes |
|---|---|---|
| `user_id` | `TEXT NOT NULL` | FK `users(id) ON DELETE CASCADE` |
| `trip_id` | `TEXT NOT NULL` | PK `(user_id, trip_id)` |
| `trip_version` | `INTEGER NOT NULL` | `trips.version` when this row was computed |
| `links_version` | `INTEGER NOT NULL` | `COALESCE(MAX(personal_group_links.sync_version), 0)` for `(user_id, trip_id)` |
| `wallet_deltas_json` | `TEXT NOT NULL` | JSON map `{ [walletIdOrKey]: number }`; unlinked rows use key `"__default__"` |
| `rows_json` | `TEXT NOT NULL` | JSON array of `GroupRow[]` for this user in this trip |
| `updated_at` | `TEXT NOT NULL` | ISO timestamp |

#### Why `"__default__"` and Why `wallet_deltas_json` Stays Valid Across Settings Changes
- Unlinked group rows resolve to the user's fallback VND wallet (`pickFallbackVndWallet(wallets, defaultWalletId)`). Storing those deltas under `"__default__"` means changing `isDefault` or archiving a wallet re-routes them at read time with **zero** cache invalidation.
- In `libs/shared/core/src/groupShares.ts`, `groupRowEffect(row, settings).walletDelta` depends **only** on `row.pending`, `row.source`, `row.iPaid`, `row.total`, `row.myShare`, `row.link?.intent`, and `row.link?.walletId`. It does **not** depend on `countLoans`, `defaultGroupCategoryId`, or `excludeFromReports`. Thus `wallet_deltas_json` never goes stale when `personal_group_settings` changes.

#### Read & Lazy-Refresh Paths
1. **Wallets, Summary, Holdings, Balance Check (`GET /me/personal/wallets`, `GET /me/personal/summary`, `GET /me/personal/holdings`, `PATCH /me/personal/wallets/:id`, `POST /me/personal/wallets/:id/balance-check`):**
   - Query 1: Load user's `personal_wallets` joined with `personal_wallet_settings`, `personal_wallet_options`, and `personal_wallet_balances`.
   - Query 2: Load user's active groups (`participants` + `trips`) left-joined with `personal_trip_cache` and the max `personal_group_links.sync_version` for each `(user_id, trip_id)`.
   - Only for **stale** trips (`cache` missing, `cache.trip_version !== trips.version`, or `cache.links_version !== maxLinksVersion`): run `loadGroupRows` scoped to **only those stale `tripIds`**, compute `wallet_deltas_json` via `groupRowEffect`, and upsert `personal_trip_cache` (guarded so an older `trip_version` cannot overwrite a newer one).
   - Resolve `"__default__"` via `pickFallbackVndWallet` at read time.
   - Wallet balance = `startAmount + personal_net + sum(group wallet deltas)`.
2. **Group Rows & Sync (`GET /me/personal/group-rows`, `GET /me/personal/sync?groups=show`):**
   - Check `personal_trip_cache` per active trip; only query raw transactions/shares for stale trips, save refreshed cache rows back, and assemble `GroupRow[]` from cache.
3. **Monthly Summary (`GET /me/personal/summary`):**
   - Wallet balances & `vndTotal` come from `personal_wallet_balances` + `personal_trip_cache` (no all-time `personal_transactions` scan).
   - Monthly `spent` / `income` queries `personal_transactions` **only** for `date BETWEEN from AND to` (using `personal_tx_user_date_idx`) plus `loadPersonRows` for `[from, to]`.
4. **Transactions List with Groups (`GET /me/personal/transactions?groups=show`, including `?recent=N` and `countLoans` `loanPaybacks`):**
   - Reuse `personal_trip_cache.rows_json` (filtering in memory for `[from, to]` or `isDirect` trips for `loanPaybacks`), eliminating the second unbounded all-history `loadGroupRows` DB scan.

---

## 4. Part 2: Groups, People & Hidden Archived Quick Win

### 4a. Hide Archived Groups & Wallets by Default (Quick Win)

- **API (`GET /trips`):**
  - Calling `GET /trips` with no `archived` query param keeps the exact current behavior (returns all active + archived groups as `TripListItem[]`) so no existing test or older client breaks.
  - Add `?archived=exclude` (returns only `trips.archived_at IS NULL`) and `?archived=only` (returns only `trips.archived_at IS NOT NULL`).
  - Include whether/how many archived groups exist via a non-breaking signal (my call: `X-Archived-Count` response header on `GET /trips?archived=exclude`, keeping the JSON body as `TripListItem[]` so existing response types stay intact).
- **Web Groups List UI:**
  - Calls `GET /trips?archived=exclude` by default.
  - When archived groups exist (`X-Archived-Count > 0`), renders a **"Show hidden groups"** button at the bottom of the list that fetches `GET /trips?archived=only` on click.
- **Accounting invariant:** Archived groups **still** count in personal wallet balances (`personal_trip_cache`) and **still** appear in People (`GET /me/people/summary`) when they have unpaid balances or waiting payments.
- **Web Wallets List UI:**
  - Hides archived wallets by default behind a **"Show hidden wallets"** toggle at the bottom of the Wallets list (archived wallets are already excluded from `totalVnd`).

### 4b. Lightweight Group Balance Cache (`trip_participant_balances` + `trip_balance_cache`)

Today, `GET /trips` discards its recomputed balances on stale groups, and `GET /me/people/summary` reads large `trip_views.json` blobs or runs up to 4 full 8–9 query `buildSnapshot` rebuilds per request. We replace both with two compact tables populated by the exact same `settleLedger` + `myBalanceIn` functions:

1. **`trip_participant_balances`** — PK `(trip_id, participant_id)`
   - `trip_version` (`INTEGER NOT NULL`)
   - `raw_balance` (`INTEGER NOT NULL`) — `balances[participantId]` from `settleLedger`
   - `rounded_balance` (`INTEGER NOT NULL`) — `myBalanceIn(trip, { balances, suggestions }, participantId)`
   - `updated_at` (`TEXT NOT NULL`)

2. **`trip_balance_cache`** — PK `trip_id`
   - `trip_version` (`INTEGER NOT NULL`)
   - `suggestions_json` (`TEXT NOT NULL`) — compact `Transfer[]`
   - `waiting_json` (`TEXT NOT NULL`) — compact array of `{ id, fromId, toId, amountClaimed }` for `status = 'says_paid'` payments
   - `oldest_shared_json` (`TEXT NOT NULL`) — compact map of `"minPid~maxPid" -> oldestApprovedCreatedAt`
   - `updated_at` (`TEXT NOT NULL`)

#### Read & Refresh Behavior
- **`GET /trips` (`loadTripList`):**
  - Joins `participants` + `trips` + `trip_participant_balances` (no `trip_views.json` read).
  - For any stale group (`trip_participant_balances.trip_version !== trips.version`), batch-loads money rows (3 queries), runs `settleLedger`, and **writes back** both `trip_participant_balances` and `trip_balance_cache` (guarded by `trip_version <= trips.version`) so subsequent visits are O(1) reads.
- **`GET /me/people/summary` (`loadPeopleSummary`):**
  - Reads `trip_balance_cache` instead of `trip_views.json`.
  - For any stale groups, batch-loads **only** money rows across all stale groups in **3 queries total** (instead of 8–9 queries *per* group in `buildSnapshot`), runs `settleLedger`, and writes back `trip_balance_cache` + `trip_participant_balances`.
- **`buildSnapshot` (`GET /trips/:id`, `loadPersonItems`):**
  - Whenever `buildSnapshot` / `getSnapshot` builds and saves `trip_views`, it also upserts `trip_participant_balances` and `trip_balance_cache` in the same batch/step, guaranteeing all screens agree.

### 4c. Account Merge (`mergeUsers.ts`) & Ledger Folding

- In `foldLedger(db, fromTrip, intoTrip)` (`apps/api/src/auth/mergeUsers.ts`): delete `trip_participant_balances` and `trip_balance_cache` rows for `fromTrip` alongside `tripViews`.
- In `mergeUsers`: delete `personal_trip_cache` rows for survivor `aId` (rows for `bId` cascade when `bId` is deleted) so merged memberships/participants recompute cleanly on the next read.

---

## 5. Backfill Plan (Temporary D1 Upgrade Window)

Because D1 is temporarily upgraded this month:
1. **SQL migration backfill (set-based):**
   - Populate `personal_wallet_balances` from `personal_wallets` + `personal_transactions` (`personal_net`, `entry_count`), setting `needs_replay = 1` for non-VND or investment wallets.
   - Populate `personal_assets.entry_count` from `personal_transactions`.
2. **One-time chunked backfill runner:**
   - A resumable script/admin runner (builder's call on exact CLI/endpoint ergonomics) populates `trip_participant_balances`, `trip_balance_cache`, and `personal_trip_cache` across existing trips and active personal-mode users in bounded batches.
   - Lazy-fill on read remains active as a safety net for any new or missed rows.

---

## 6. Heavy-Account Budget Targets

Tested against a seeded heavy account: **1 user, 30 groups (15 active + 15 archived), 500 transactions/group (15,000 group transactions), and 2,000 personal transactions across 5 wallets (3 VND everyday, 1 USD everyday, 1 investment)**.

| Operation | Max D1 Queries | Max Rows Read | Max Rows Written | Worker CPU |
|---|---|---|---|---|
| Warm `GET /me/personal/wallets` | `<= 6` | `<= 150` | `0` | `< 10 ms` |
| Warm `GET /me/personal/summary` | `<= 6` | `<= 250` (scoped to month) | `0` | `< 10 ms` |
| Warm `GET /trips?archived=exclude` | `<= 3` | `<= 100` | `0` | `< 10 ms` |
| Warm `GET /me/people/summary` | `<= 6` | `<= 200` | `0` | `< 10 ms` |
| `POST /me/personal/transactions` (VND) | `<= 6` | `<= 20` | `<= 10` | `< 10 ms` |
| Next `GET /me/personal/wallets` after VND write | `<= 6` | `<= 150` (0 `personal_transactions`) | `0` | `< 10 ms` |
| After 1 group expense write (`GET /trips` or `GET /me/personal/wallets`) | `<= 8` | Scans **only** the 1 changed group | Writes **only** that 1 group's cache | `< 10 ms` |

---

## 7. Regression-Path Audit & Paired Test Cases

Every write path that can affect a balance or count must have a **cache-vs-full-replay parity test** comparing the cached endpoint response against a full uncached reference replay from raw tables, asserting deep equality:

| Area | Write / Edge-Case Path | Required Test Assertion |
|---|---|---|
| **Personal CRUD** | `POST /me/personal/transactions` (expense, income) | Cached wallet balance & `entryCount` == full replay |
| **Personal Edit** | `PATCH /me/personal/transactions/:id` (amount change, `expense <-> income` flip, wallet move A -> B) | Both old and new wallet balances & `entryCount` == full replay |
| **Personal Delete & Restore** | `DELETE` + `POST .../restore` (single entry) | Balance & `entryCount` decrement then restore exactly |
| **Transfers** | Same-currency & cross-currency `POST`, `PATCH` (flip wallets/amounts), `DELETE`, `restore` | Both wallets' `personal_net`, `entryCount`, and non-VND `vndValue` == full replay |
| **Investments** | `buy` / `sell` `POST`, `PATCH` (amount, qty, asset change, wallet move), `DELETE`, `restore` | `holdings`, `vndValue`, `cashVnd`, and `personal_assets.entry_count` == full replay |
| **Oversell Guard** | `buy` / `sell` / `DELETE` rejected with `422 OVERSELL` | `personal_wallet_balances` & `personal_assets.entry_count` are **unchanged** |
| **Wallet Mutations** | `POST` wallet, `PATCH` (`startAmount`, `startDate`, `startCostVnd`, `isDefault`, `archived`, `excludeFromReports`), `DELETE` | Default wallet change re-routes `"__default__"` group deltas; non-VND `needs_replay` triggers accurate recompute |
| **Balance Check** | `POST /me/personal/wallets/:id/balance-check` (`diff !== 0` and `diff === 0`) | Adjustment entry updates `personal_wallet_balances` so balance == `actual` |
| **Asset Reassign** | `DELETE /me/personal/assets/:id` with target asset | Target asset `entry_count` == sum of both |
| **Group Links & Settings** | `PUT /me/personal/group-links/:rootId` (`walletId`, `intent` `shared <-> loan`, `excludeFromReports`), `PUT /me/personal/group-settings` (`countLoans`) | Only affected trip's `personal_trip_cache` refreshes; `walletDelta` matches `groupRowEffect` |
| **Group Expenses & Fund** | Expense create/edit/delete/approve/reject/disable/enable, fund income, planning expense | `GET /trips`, `GET /trips/:id`, `GET /me/people/summary`, and `GET /me/personal/wallets` all agree |
| **Payments & Multi-Group Settle** | `says_paid`, confirm, not-arrived, disable, `POST /me/people/:key/settle` | `trip_participant_balances`, `trip_balance_cache`, and `personal_trip_cache` all agree |
| **Group Settings** | `PATCH /trips/:id` (`roundTransfers`, `fewestTransfers`, `archive`, `unarchive`) | Rounded vs raw balances match `myBalanceIn` and `settleLedger` |
| **Merges** | `mergeParticipants`, participant remove/leave, `mergeUsers` (with `foldLedger`) | No orphaned cache rows; survivor balances & people totals match full replay |
| **Concurrency / Race** | Out-of-order stale cache write (`trip_version < current`) | Guard rejects stale overwrite; newer cache survives |
| **Archived Filtering** | `GET /trips` (default), `GET /trips?archived=exclude`, `GET /trips?archived=only` | Archived hidden in `exclude`, shown in `only`, still counted in wallets & unpaid People |
| **Heavy-Account Budget** | 30 groups x 500 tx + 2,000 personal tx with D1 query/row counter | Warm & incremental reads/writes stay strictly within Section 6 budget |

---

## 8. Left to the Builder

- Exact Drizzle migration file numbers and SQL index names.
- Exact mechanism for the archived-group count signal on `GET /trips?archived=exclude` (e.g., `X-Archived-Count` header).
- Ergonomics of the one-time backfill runner (CLI script vs. admin endpoint).
- Exact Vietnamese/English UI copy and placement for `"Show hidden groups"` and `"Show hidden wallets"`.
