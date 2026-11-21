# Group shares in Sổ chi tiêu — Part 1: read-in and balances — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. In this repo, implementer work runs through the `gemini-execution` skill (Orca worktrees), per the owner's CLAUDE.md. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner's group shares, fund contributions, group payments and quick expenses are read live into Sổ chi tiêu's list, totals, wallet balances and sync, with per-user extras, settings, and a balance check after turning the area back on. API and `@cc/core` only; screens are Part 2 and Part 3.

**Architecture:** One per-user loader (`loadGroupRows`) reads the latest group rows of every group the user is linked to with a constant number of queries, never per group. Pure functions in `@cc/core` turn those rows into spending/income figures and into synthetic `CalcEntry` rows, so `walletBalance` and every existing caller of `loadCalc` pick up group money without change. Extras live in new tables keyed by `(user_id, root_id)`.

**Tech Stack:** Hono on Cloudflare Workers, D1 + drizzle, vitest with `cloudflare:test` (`apps/api/test`), `@cc/core` (pure TS, vitest).

**Spec:** `docs/superpowers/specs/2026-11-21-group-shares-in-spending-book-design.md` (sections 4, 5, 8, 9, 10). Read it first.

## Global Constraints

- Additive only: migrations create tables and indexes; never alter, drop or add a column to an existing table.
- Do not edit: `libs/api/db/src/commit.ts`, `computeBalances` / `computeShares` / `suggestTransfers` (`libs/shared/core`), `apps/api/src/trips/snapshot.ts`, `apps/api/src/me/balances.ts`, `apps/api/src/me/settle.ts`, `apps/api/src/me/ledger.ts`, `libs/api/auth/src/device.ts`, the expense and payment routes. Import from them only.
- Never edit or delete an existing test. Implementers may add tests; the planner runs them.
- ≤ 50 D1 queries per request.
- Every new route uses `requirePersonal` (`@cc/api-auth/personal`); switch-off users get 403; other accounts get 404.
- Hand-written SQL migration `apps/api/migrations/0030_personal_group_links.sql`; `libs/api/db/src/schema.ts` updated by hand. Never run `drizzle-kit generate`.
- Money is integer VND; never floats.
- Never name new code "ledger"; use `group` / `personal`. Never extend `apps/api/src/me/ledger.ts`.
- Filters: import `toLedger` (`apps/api/src/trips/snapshot.ts`) / `isFundPaid`, `isPlanningExpense` (`libs/shared/core/src/fund.ts`); do not copy their logic.
- New Vietnamese strings (none expected in Part 1 except starter category names) are marked `// REVIEW`: "Nhóm", "Cho vay", "Đi vay", "Điều chỉnh số dư".
- Commands: `npm test`, `npm run typecheck`, `npm run lint` (through Nx only).

## Review Focus

1. **A payment between two other people in the same group** must not appear for the owner. → Task 3 test `ignores payments that do not involve me`.
2. **A payment whose confirmed amount differs from the claimed amount** must use `amountConfirmed`. → Task 3 test `uses the confirmed amount of a payment`.
3. **A group expense edited to move its date across the wallet's start date** changes the balance on the next load (before: no effect; after: effect). → Task 4 test `date moved across start date`.
4. **The default wallet is not VND, or is archived** — group rows go to the first VND everyday wallet that is not archived; with none, no wallet effect. → Task 4 test `picks a VND wallet`.
5. **A user with Sổ chi tiêu on, in groups, but with no wallet yet** — list and balances return group rows with no wallet effect and do not throw. → Task 5 test `no wallet yet`.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/api/migrations/0030_personal_group_links.sql` (new) | four new tables |
| `libs/api/db/src/schema.ts` (modify, append) | drizzle definitions of the four tables |
| `libs/shared/core/src/groupShares.ts` (new) | `GroupRow`, `GroupLinkView`, `GroupSettingsView` types; `groupRowEffect`, `loanPaybacks`, `groupWalletEntries`, `groupNetFor` |
| `libs/shared/core/src/index.ts` (modify) | export the above |
| `libs/shared/core/src/api-types.ts` (modify) | `ListRow` gains `GroupRow`; `ListQuery` gains `tripId`, `groups`; `SyncResponse` gains `groups` |
| `apps/api/src/personal/groupShares.ts` (new) | `loadGroupRows(db, userId, range?)` |
| `apps/api/src/personal/groupLinks.ts` (new) | routes: group links, group settings, balance checks; `recordPersonalToggle` helper |
| `apps/api/src/personal/wallets.ts` (modify `loadCalc`) | append synthetic group entries |
| `apps/api/src/personal/list.ts` (modify) | include group rows and their totals; filters |
| `apps/api/src/personal/sync.ts` (modify) | `groups` field keyed by trip versions |
| `apps/api/src/personal/routes.ts` (modify) | mount `groupLinkRoutes()`; call `recordPersonalToggle` in `PATCH /me/personal` |
| `apps/api/test/personal-group-*.test.ts` (new) | API tests per task |
| `libs/shared/core/src/__tests__/groupShares.test.ts` (new) | pure tests |

---

### Task 1: Migration and schema

**Files:**
- Create: `apps/api/migrations/0030_personal_group_links.sql`
- Modify: `libs/api/db/src/schema.ts` (append after `personalTransactionTags`)
- Test: `apps/api/test/schema-personal-group-links.test.ts`

**Interfaces:**
- Produces (drizzle exports): `personalGroupLinks`, `personalGroupLinkTags`, `personalGroupSettings`, `personalBalanceChecks`.

Tables (all `user_id` reference `users.id` on delete cascade):
- `personal_group_links`: `user_id` text, `root_id` text, `trip_id` text not null, `wallet_id` text null → `personal_wallets.id`, `category_id` text null → `personal_categories.id`, `intent` text null CHECK in (`'shared'`,`'loan'`), `exclude_from_reports` integer not null default 0, `created_at`, `updated_at` text not null, `sync_version` integer not null default 0; PK `(user_id, root_id)`; index `personal_group_links_user_trip_idx (user_id, trip_id)`.
- `personal_group_link_tags`: `user_id`, `root_id`, `tag_id` → `personal_tags.id`; PK all three; index on `tag_id`.
- `personal_group_settings`: `user_id` PK, `default_group_category_id` text null, `count_loans` integer not null default 0, `disabled_at` text null, `reenabled_at` text null, `updated_at` text not null.
- `personal_balance_checks`: `user_id`, `wallet_id` → `personal_wallets.id`, `answered_at` text not null; PK `(user_id, wallet_id)`.

- [ ] **Step 1: Write the failing test** — follow `schema-personal-sync.test.ts`: assert each table exists with the columns above (`PRAGMA table_info`), the PKs reject duplicates, and inserting `intent = 'other'` fails.
- [ ] **Step 2: Run** `npx nx run @cc/api:test -- schema-personal-group-links` → FAIL (no such table).
- [ ] **Step 3: Write the SQL and the drizzle definitions** as listed.
- [ ] **Step 4: Run** the same command → PASS; `npm run typecheck` → clean.
- [ ] **Step 5: Commit** `feat(api): personal group link tables (0030)`.

---

### Task 2: Core — group row types and effects

**Files:**
- Create: `libs/shared/core/src/groupShares.ts`, `libs/shared/core/src/__tests__/groupShares.test.ts`
- Modify: `libs/shared/core/src/index.ts`, `libs/shared/core/src/api-types.ts`

**Interfaces:**
- Produces:

```ts
export type GroupRowSource = 'expense' | 'fund' | 'payment';
export interface GroupLinkView {
  walletId: string | null; categoryId: string | null; tagIds: string[];
  intent: 'shared' | 'loan' | null; excludeFromReports: boolean;
}
export interface GroupRow {
  kind: 'group';
  id: string;            // latest transactions.id
  rootId: string;
  tripId: string; tripName: string; isDirect: boolean;
  source: GroupRowSource;
  date: string;          // spentOn
  title: string;         // description
  total: number;         // expense amount / fund contribution / payment amount (confirmed ?? claimed)
  myShare: number;       // 0 for payments and fund
  iPaid: boolean;        // expense/fund: I am payer; payment: I am the sender
  payerName: string | null;
  counterpartName: string | null; // payments only: the other side
  people: string[];      // other participants with a share, in sort order
  pending: boolean;      // expense 'pending' or payment 'says_paid'
  link: GroupLinkView | null;
  createdAt: string;
}
export interface GroupSettingsView { defaultGroupCategoryId: string | null; countLoans: boolean }
export interface GroupEffect { spending: number; income: number; walletDelta: number }

export function groupRowEffect(row: GroupRow, settings: GroupSettingsView, payback?: number): GroupEffect;
export function loanPaybacks(rows: GroupRow[]): Map<string, number>;      // row.id → part that repays a loan
export function groupWalletEntries(
  rows: GroupRow[], wallets: CalcWallet[] & { kind?: string }[], defaultWalletId: string | null,
  settings: GroupSettingsView,
): CalcEntry[];
export function groupNetFor(rows: GroupRow[], tripId: string): number;
```

- `api-types.ts`: `ListRow = { kind: 'entry'; entry: EntryView } | PersonRow | GroupRow`; `ListQuery` adds `tripId?: string; groups?: 'show' | 'hide'`; `SyncResponse` adds `groups: { key: string; rows: GroupRow[] } | null`.

Rules `groupRowEffect` implements (spec 4.1, 5), pending rows → all zero:

| Row | spending | income | walletDelta |
|---|---|---|---|
| expense, `link.intent !== 'loan'`, someone else paid | myShare | 0 | 0 |
| expense, not loan, iPaid | myShare | 0 | −total |
| fund, iPaid | total | 0 | −total |
| loan, iPaid (I lent) | countLoans ? total − myShare : 0 | 0 | −total |
| loan, not iPaid (I borrowed) | 0 | countLoans ? myShare : 0 | +myShare |
| payment, iPaid | countLoans ? payback : 0 | 0 | −total |
| payment, not iPaid | 0 | countLoans ? payback : 0 | +total |
| `link.excludeFromReports` | spending and income forced to 0; walletDelta unchanged | | |

`loanPaybacks`: per counterpart in direct-group rows only, walk rows by `(date, createdAt)`; a loan opens a balance (lent: they owe me `total − myShare`; borrowed: I owe `myShare`); a payment in the closing direction reduces the open balance and its reduced amount is that payment's payback; the rest is 0.

`groupWalletEntries`: one `CalcEntry` per non-pending row with `walletDelta ≠ 0`: `id = 'g:' + row.id`, `type = delta > 0 ? 'income' : 'expense'`, `amount = |delta|`, `walletId = link.walletId ?? chosen`, `excludeFromReports = true`, `transferId = null`, `time = null`. `chosen` = the default wallet if VND and not archived, else the first VND non-archived wallet with `kind` everyday (or unset), else the row is skipped. A `link.walletId` pointing to a non-VND or missing wallet falls back to `chosen`.

`groupNetFor` (spec 4.4): over rows of `tripId` with `source !== 'fund'` and not pending: Σ(total where expense iPaid) − Σ myShare + Σ(total where payment iPaid) − Σ(total where payment !iPaid).

- [ ] **Step 1: Write failing tests** — one per table row above with values: bill 300 000, myShare 100 000; loan total 50 000 myShare 0 (lent) and myShare 50 000 (borrowed); `countLoans` false and true; pending row → `{0,0,0}`; `excludeFromReports` → spending 0, walletDelta −300 000. `loanPaybacks`: lent 50 000 then received 30 000 then 40 000 → paybacks 30 000 and 20 000. `groupWalletEntries`: default USD wallet + VND wallet → entries on the VND wallet; no VND wallet → `[]`. `groupNetFor`: paid 300 000 share 100 000, share 80 000 on Hùng's taxi, paid Lan 50 000, received 120 000 → `300000 − 180000 + 50000 − 120000 = 50000`.
- [ ] **Step 2: Run** `npx nx run @cc/core:test -- groupShares` → FAIL.
- [ ] **Step 3: Implement** in `groupShares.ts`; export from `index.ts`; update `api-types.ts`.
- [ ] **Step 4: Run** → PASS; `npm run typecheck` → clean (existing `ListRow` switch sites may need a `group` branch: add one that returns the existing default, no behaviour change).
- [ ] **Step 5: Commit** `feat(core): group row effects for Sổ chi tiêu`.

---

### Task 3: API — `loadGroupRows`

**Files:**
- Create: `apps/api/src/personal/groupShares.ts`, `apps/api/test/personal-group-rows.test.ts`

**Interfaces:**
- Consumes: `GroupRow`, `GroupLinkView` (Task 2); tables (Task 1); `isFundPaid`, `isPlanningExpense`.
- Produces: `export async function loadGroupRows(db: Db, userId: string, range?: { from: string; to: string }): Promise<GroupRow[]>`.

Query shape (constant count, spec 9): (1) my participant ids with trip id, trip name, preset and `version` — `participants.userId = me AND status = 'active'`, plus participants whose `merged_into` resolves to one of them (resolve the chain in JS the way `apps/api/src/me/balances.ts` does; read it, don't change it); (2) latest transactions of those trips, `isLatest = 1`, types expense/income/payment, statuses `approved`, `pending`, `confirmed`, `says_paid`, within range when given, chunked `IN` of ≤ 90 trip ids; (3) shares of those transactions joined to participant names; (4) links + link tags for `user_id = me`. Then in JS: drop expenses where `isFundPaid` / `isPlanningExpense` (on parsed `metaJson`); keep `income` rows only when payer is mine (source `fund`); keep payments only when sender or receiver is mine; expenses only when I have a share or I paid. `pending` = status `pending` or `says_paid`.

- [ ] **Step 1: Write failing tests** (seed with `helpers.ts` `seedTrip`/`linkMember` and direct SQL):
  - `shows my share of an expense someone else paid`; `shows a bill I paid with myShare and total`; `shows a fund contribution as source fund`; `hides fund-paid and planning expenses`; `shows pending and says_paid as pending`; `hides disabled, rejected and superseded`;
  - `ignores payments that do not involve me`; `uses the confirmed amount of a payment`;
  - `unlinked name contributes nothing until linked` (link it, reload, row appears); `merged participant rows follow the survivor`;
  - `edit, disable and rollback change the rows on next load` (insert a new version with `isLatest`, flip statuses);
  - `includes quick expenses from the direct group with isDirect true`.
  - **Agreement** `net matches myBalanceIn` for an ordinary group, a sport group (preset `sport`) and a group with a fund, rounding off: build the snapshot with `getSnapshot` and compare `groupNetFor(rows, tripId)` to `myBalanceIn(trip, snapshot, pid)`.
- [ ] **Step 2: Run** `npx nx run @cc/api:test -- personal-group-rows` → FAIL.
- [ ] **Step 3: Implement** `loadGroupRows`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(api): read group rows for Sổ chi tiêu`.

---

### Task 4: Wallet balances include group money

**Files:**
- Modify: `apps/api/src/personal/wallets.ts` (`loadCalc`)
- Test: `apps/api/test/personal-group-balances.test.ts`

**Interfaces:**
- Consumes: `loadGroupRows` (Task 3, no range), `groupWalletEntries`, settings row (Task 1; absent row = `{ defaultGroupCategoryId: null, countLoans: false }`).
- Produces: `loadCalc` returns `entries` with the synthetic `g:` entries appended. Callers unchanged.

Replace the W14 "no balance effect" for direct-group rows (the existing `PersonRow` path stays for the list until Task 5 retires it).

- [ ] **Step 1: Write failing tests**: bill I paid after start date → balance −300 000; someone else paid → unchanged; payment received → +; borrowed loan (`intent 'loan'`, not iPaid) → +myShare; before start date → unchanged; `date moved across start date` (new version with later date → effect appears); `picks a VND wallet` (default USD, archived VND, active VND → active VND moves); link with `walletId` of another VND wallet → that wallet moves.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** this file and `personal-wallets*.test.ts` → PASS (existing tests unchanged; if one fails because it relied on direct rows having no effect, stop and report — do not edit it).
- [ ] **Step 5: Commit** `feat(api): group money moves wallet balances`.

---

### Task 5: List endpoint with group rows

**Files:**
- Modify: `apps/api/src/personal/list.ts`
- Test: `apps/api/test/personal-group-list.test.ts`

**Interfaces:**
- Consumes: `loadGroupRows(db, userId, { from, to })`, `groupRowEffect`, `loanPaybacks`.
- Produces: `GET` list returns `GroupRow` items (`kind: 'group'`) merged by date/createdAt with entries. **Direct-group expenses keep coming as `PersonRow`** exactly as today (existing tests `personal-list.test.ts`, `personal-sync-parity.test.ts` and the current web UI rely on it; Part 2 switches the UI). Every other group row — other groups' expenses, fund contributions, all payments including direct-group ones — comes as `GroupRow`. A transaction never appears as both.
- Totals: for `GroupRow` items add `groupRowEffect(...)` spending/income (VND) to the per-currency totals; for `PersonRow` items keep today's figure (myShare as spending), which equals `groupRowEffect` for `intent` null, and use `groupRowEffect` when the row has a link. Paybacks come from `loanPaybacks` over all loaded rows (direct expenses included, converted internally).
- Query params: `tripId` (only that group's rows; entries still filtered by other params), `groups=hide` (no group rows), `type=group` (only group rows). `q` matches title, trip name and link tags' names, accent-insensitive like existing search.

- [ ] **Step 1: Write failing tests**: month list contains group rows with correct totals (spending counts myShare, not total); pending rows listed but not in totals; `groups=hide`; `tripId`; `q` by trip name; `no wallet yet` (rows present, no throw); a second account gets none of my rows.
- [ ] **Step 2–4:** run → FAIL, implement, run this file and `personal-list*.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat(api): group rows in the transaction list`.

---

### Task 6: Links and settings routes

**Files:**
- Create: `apps/api/src/personal/groupLinks.ts`
- Modify: `apps/api/src/personal/routes.ts` (mount)
- Test: `apps/api/test/personal-group-links.test.ts`

**Interfaces:**
- Produces:
  - `PUT /api/me/personal/group-links/:rootId` body `{ walletId?: string|null; categoryId?: string|null; tagIds?: string[]; intent?: 'shared'|'loan'|null; excludeFromReports?: boolean }` → `200 { link: GroupLinkView }`. 404 when `rootId` is not a transaction in one of my groups or wallet/category/tag is not mine; 422 for a non-VND wallet.
  - `GET /api/me/personal/group-settings` → `{ settings: GroupSettingsView }`; `PUT` same shape partial → `200 { settings }`. 404 for a category not mine.
  - Every write bumps the per-person change counter the way entry writes do (`personal_sync_state`; see `entries.ts`) and stamps `sync_version`.
  - Starter categories "Nhóm" (expense), "Cho vay" (expense), "Đi vay" (income) `// REVIEW` exist for every user after the first read of group settings (idempotent by name+type; add them to `starterCategories.ts` for new users).
- [ ] **Step 1: Write failing tests**: set and read back wallet/category/tags/intent/exclude; survives a new version of the group expense (same `rootId`); 404 on someone else's root; 403 with switch off on all three routes; second account cannot read or change; starters created once.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(api): personal extras and settings for group rows`.

---

### Task 7: Sync carries group rows

**Files:**
- Modify: `apps/api/src/personal/sync.ts`
- Test: `apps/api/test/personal-group-sync.test.ts`

**Interfaces:**
- Consumes: `loadGroupRows` (no range).
- Produces: `SyncResponse.groups`. Query param `groupsKey`. `key` = a string derived from the sorted `tripId:version` pairs of my groups plus the max `sync_version` of my links (e.g. a short hash). On the first page, when `isReset` or `groupsKey !== key`, return `{ key, rows }`; else `null`. The `status: 'current'` short-circuit also requires `groupsKey === key`. The existing `ledger` field stays as is.
- [ ] **Step 1: Write failing tests**: first sync returns groups; same key → `groups: null` and `current`; an expense added in one group → new key, rows returned; a link write → new key.
- [ ] **Step 2–4:** FAIL → implement → PASS (also `personal-sync*.test.ts`).
- [ ] **Step 5: Commit** `feat(api): sync group rows by trip versions`.

---

### Task 8: Turn-off record and balance check

**Files:**
- Modify: `apps/api/src/personal/routes.ts` (`PATCH /me/personal` calls the helper after its upsert)
- Modify: `apps/api/src/personal/groupLinks.ts`
- Test: `apps/api/test/personal-balance-check.test.ts`

**Interfaces:**
- Produces:
  - `export async function recordPersonalToggle(db: Db, userId: string, enabled: boolean, now: string): Promise<void>` — off: set `disabled_at = now`; on: if `disabled_at` is set, set `reenabled_at = now`.
  - `GET /api/me/personal/balance-checks` → `{ walletIds: string[] }`: everyday, non-archived wallets with no `personal_balance_checks` row answered after `reenabled_at`, only when `reenabled_at − disabled_at > 24h`.
  - `POST /api/me/personal/wallets/:id/balance-check` body `{ actual: number } | { skip: true }` → `200 { entryId: string | null }`. With `actual`: difference `actual − balance` (balance from `loadCalc` + `walletBalance`); if ≠ 0 insert a `personal_transactions` row `type = diff > 0 ? 'income' : 'expense'`, `amount = |diff|`, `date = today`, `source = 'adjustment'`, `exclude_from_reports = 1`, `note = 'Điều chỉnh số dư'` `// REVIEW`, `category_id = null`, bumping sync like entry writes. Either way upsert `personal_balance_checks`.
  - Widen the `source` type in `EntryView` to `'manual' | 'adjustment'`.
- [ ] **Step 1: Write failing tests**: off→on within 1h → no wallets; off→on after 2 days → the everyday wallets; answer with actual = balance + 70 000 → income entry 70 000 excluded from reports, wallet leaves the list; skip → leaves the list, no entry; switch-off 403; another account's wallet 404.
- [ ] **Step 2–4:** FAIL → implement → PASS (also `personal-area.test.ts`).
- [ ] **Step 5: Commit** `feat(api): balance check after turning Sổ chi tiêu back on`.

---

### Task 9: Cost and guard sweep

**Files:**
- Test: `apps/api/test/personal-group-cost.test.ts`

- [ ] **Step 1: Write the tests**: seed one user in 60 groups with 20 expenses and 5 payments each; with the counting `env` proxy from `attendance-count.test.ts`, the month list, `GET wallets` (details) and sync each run `< 50` queries. Log rows read per request (`console.info`) for the PR description. A switch-off user gets 403 from every route added in Tasks 6 and 8 and sees no `kind: 'group'` rows anywhere.
- [ ] **Step 2: Run** → PASS (if a count is ≥ 50, fix the loader's chunking, not the test).
- [ ] **Step 3: Full gate** `npm test`, `npm run typecheck`, `npm run lint`, then `npm run e2e -- golden-path` and `npm run e2e -- walkthrough` → all pass.
- [ ] **Step 4: Commit** `test(api): group read-in stays under the query limit`.

---

Part 1 ends here: branch `feat/group-shares-read-in` off `main`, PR into `main`, owner tests before merge. Part 2 (list rows, row sheet, main screen, filters, categories UI, the balance-check prompt) and Part 3 (entry page) get their own plans after this merges, built on the interfaces above.
