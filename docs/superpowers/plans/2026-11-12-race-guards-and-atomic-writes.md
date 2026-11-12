# Race Guards and Atomic Trip Writes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the races in #70 and the non-atomic guarded writes in #68: a double tap, a retry, or two people acting at once never doubles a record, silently undoes an approval, or leaves a stale group view.

**Architecture:** A new `guardedTripWrite` helper in `@cc/api-db` runs "guarded update + version bump + follow-ups + activity" as one D1 batch. The version bump turns NULL when the guard matched nothing, so NOT NULL rolls the batch back. Every guarded route moves onto it. The merge and expense-edit races get guards inside their existing batches. Payments get a `payment_keys` table copied from `settlement_keys`, and `payment_refs` gets a unique pair index. Both come in one hand-written migration.

**Tech Stack:** Hono on Cloudflare Workers, D1 (SQLite) via drizzle-orm, Vitest with `@cloudflare/vitest-plugin` (real D1, migrations applied), React + React Query on the web.

**Spec:** `docs/superpowers/specs/2026-11-12-race-guards-and-atomic-writes-design.md`

## Global Constraints

- Existing tests are never edited or deleted. New tests only. Every existing API test must still pass after each task.
- A guard miss becomes the caller's existing 409 (code **and** message unchanged per site). Any other DB failure is rethrown unchanged, never turned into a 409.
- `ALREADY_HANDLED` copy stays `'Someone already handled this.'`. No new i18n strings.
- D1 migrations are hand-written SQL. The next file is `apps/api/migrations/0022_race_guards.sql`. Apply it with `--local` for the tunnel. Don't use drizzle-kit generate.
- Don't touch #80's area: `POST /trips/:id/membership`, `apps/api/src/trips/view.ts`, `GuestTrip.tsx`.
- Imports follow CLAUDE.md: relative inside a library, `@cc/...` across libraries. `@cc/api-db` may import `@cc/api-util`.
- Commands: `npm test`, `npm run typecheck`, `npm run lint` (through Nx). A single API test file runs with `npx vitest run test/<file> --root apps/api` (or the package's `npm test -- <file>` in `apps/api`).
- Commits only when the owner asks. Each task's "Commit" step means: stage the files and leave them for the owner's go-ahead (or commit if the owner has said to).

## Review Focus

1. **A guard that matches a row but changes no values** (e.g. re-approving with identical fields). SQLite's `changes()` still counts it, so it must commit. Test in Task 1.
2. **A different constraint failure inside a guarded batch** (e.g. a unique index on a follow-up insert). It must surface as that error, not as `ALREADY_HANDLED`. Test in Task 1.
3. **The tick payment retried after the first send succeeded but the response was lost.** It must return the original payment (200), not `409 ALREADY_HANDLED` from the `settles` check. Test in Task 6.
4. **Old clients with no `idempotencyKey`.** Behaviour unchanged: each request records a payment. Test in Task 6.
5. **Existing duplicate `payment_refs` rows in production.** The migration must keep the oldest code per pair, so the transfer note people already used doesn't change. Test in Task 5.

---

### Task 1: `guardedTripWrite` helper

**Files:**
- Modify: `libs/api/db/src/commit.ts`
- Test: `apps/api/test/guarded-write.test.ts` (new)

**Interfaces:**
- Produces:
  ```ts
  export async function guardedTripWrite(
    db: Db,
    tripId: string,
    guard: BatchItem<'sqlite'>,          // the conditional UPDATE (or INSERT…SELECT)
    queries: BatchItem<'sqlite'>[],      // follow-ups, run only if the guard changed ≥1 row
    activity: ActivityInput,
    onMiss: () => Error = () => new ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.'),
  ): Promise<void>
  ```

- [ ] **Step 1: Write the failing tests** in `guarded-write.test.ts`. Use `getDb(env)` from `@cc/api-db/client`, `seedTrip` from `./helpers`, and seed one pending expense row via `env.DB.prepare`.
  - `guard hit commits guard, follow-ups, version bump and activity`: guard = update expense `status='approved' WHERE status='pending'`, follow-up = an update on its share. Expect status `approved`, share updated, `trips.version` +1, one new `activity` row with the given action.
  - `guard miss writes nothing and throws onMiss`: the same guard run twice. The second call rejects with `ApiError` code `ALREADY_HANDLED` (status 409). Version and activity count are unchanged since the first call, and the follow-up isn't applied again.
  - `custom onMiss error is thrown on miss`: `onMiss: () => new ApiError('CONFLICT', 409, 'x')` → rejects with code `CONFLICT`.
  - `guard matching a row with identical values still commits` (Review Focus 1).
  - `other constraint failures are rethrown, not 409` (Review Focus 2): guard hits, but a follow-up inserts a duplicate `activity.id` (or another PK clash). It rejects with an error that is **not** an `ApiError`, and nothing is written (status still pending, version unchanged).

- [ ] **Step 2: Run the tests and confirm they fail** (`guardedTripWrite` is not exported).

- [ ] **Step 3: Implement `guardedTripWrite`** in `commit.ts`. Batch order: `[guard, bump, ...queries, insertActivity]`, where the bump is `UPDATE trips SET version = CASE WHEN changes() > 0 THEN version + 1 ELSE NULL END WHERE id = ?`. It must come **immediately** after the guard, because `changes()` reads the previous statement. Catch `isDbError(err, 'NOT NULL constraint failed: trips.version')` → `throw onMiss()`, and rethrow everything else. Share the activity-row builder with `commitTripWrite` rather than duplicating it. Leave `commitTripWrite` unchanged.

- [ ] **Step 4: Run the tests and confirm they pass**, then run `npm run typecheck`.

- [ ] **Step 5: Commit**: `feat(api-db): add guardedTripWrite for atomic guarded trip writes (#68)`

---

### Task 2: Move the payments guards onto the helper

**Files:**
- Modify: `apps/api/src/payments/routes.ts` (guards at ~329 confirm, ~458 revise, ~544 and ~566 not-arrived, ~627 disable, ~690 enable, ~779 arrived, ~832 keep)
- Test: `apps/api/test/guarded-routes-payments.test.ts` (new)

**Interfaces:**
- Consumes: `guardedTripWrite` (Task 1).

- [ ] **Step 1: Write the failing test** `a lost confirm writes nothing`. It records a `says_paid` payment, sends `POST …/payments/:pid/confirm` twice in sequence, and expects the second to be 409 `ALREADY_HANDLED`. It also expects `trips.version` and the `activity` count to be unchanged by the second call. It **passes today** (the old code also writes nothing on a miss), so add a second assertion that fails today. Stub `env.DB.batch` once to reject, then check the payment is still `says_paid` after the 500. Today the update has already run outside the batch, so this fails. Add one such pair for `disable` too.

- [ ] **Step 2: Run it and confirm the batch-failure assertions fail.**

- [ ] **Step 3: Convert each site.** Turn the `update(...).run()` + `if (r.meta.changes === 0) throw …` + `commitTripWrite(db, tripId, followUps, activity)` into `guardedTripWrite(db, tripId, update, followUps, activity, () => <that site's existing error>)`. Reads that come after the update stay after the commit. The two branches in not-arrived (~544, ~566) each become their own call.

- [ ] **Step 4: Run `payments.test.ts`, every `claim-*`/`expense-pay*` test and the new file, and confirm all pass.**

- [ ] **Step 5: Commit**: `refactor(api): make payment status changes atomic (#68)`

---

### Task 3: Move the expenses, bank and fund guards onto the helper

**Files:**
- Modify: `apps/api/src/expenses/routes.ts` (~1113 approve, ~1189 reject, ~1258 disable, ~1333 enable), `apps/api/src/bank/routes.ts` (~406, ~473), `apps/api/src/fund/routes.ts` (~389, ~456)
- Test: `apps/api/test/guarded-routes-expenses.test.ts` (new)

**Interfaces:**
- Consumes: `guardedTripWrite` (Task 1).

- [ ] **Step 1: Write the failing tests**, the same shape as Task 2: one batch-failure test for expense approve, one for a bank route, one for a fund route (status unchanged after a forced `batch` rejection).
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Convert the 8 sites** as in Task 2, Step 3.
- [ ] **Step 4: Run the `expenses*`, `fund-*`, `bank*`, `me-bank` tests and the new file, and confirm all pass.**
- [ ] **Step 5: Commit**: `refactor(api): make expense, bank and fund status changes atomic (#68)`

---

### Task 4: Move the participants and proposals guards; record the skipped sites

**Files:**
- Modify: `apps/api/src/participants/routes.ts` (~745 name approve, ~1168, ~1243), `apps/api/src/proposals/routes.ts` (~121, ~163, ~217)
- Leave as-is (spec decision): `participants/routes.ts` ~1029 (insert count, not a guard; it's #80's route), ~1128 and ~1203 (chained approve→merge / approve→link with compensating writes), `proposals/store.ts` ~46, ~130, ~162. If any of these can just put its trailing `commitTripWrite` into the batch it already runs, do that. Otherwise leave it.
- Test: `apps/api/test/guarded-routes-people.test.ts` (new)

**Interfaces:**
- Consumes: `guardedTripWrite` (Task 1).

- [ ] **Step 1: Write the failing tests**, the batch-failure shape, for name approve (~745) and one proposals route.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Convert the 6 sites.** Before ~1168 or ~1243, read the code around them. If either is really part of the chained membership flow, treat it as a skipped site.
- [ ] **Step 4: Write `docs/superpowers/plans/2026-11-12-race-guards-skipped-sites.md`**, one line per site left alone with the reason. The PR body quotes it.
- [ ] **Step 5: Run `participants.test.ts`, `merge-*`, `membership-dedup`, `claim-*`, `roster-*` and the new file, and confirm all pass.**
- [ ] **Step 6: Commit**: `refactor(api): make people and proposal status changes atomic (#68)`

---

### Task 5: Migration 0022 — `payment_refs` pair index and `payment_keys`

**Files:**
- Create: `apps/api/migrations/0022_race_guards.sql`
- Modify: `libs/api/db/src/schema.ts` (`paymentRefs` gets `uniqueIndex('payment_refs_trip_pair_uidx').on(t.tripId, t.fromId, t.toId)`; new `paymentKeys` table)
- Test: `apps/api/test/migration-0022.test.ts` (new)

**Interfaces:**
- Produces: `paymentKeys = sqliteTable('payment_keys', { key: text('key').primaryKey(), tripId: text('trip_id').notNull(), paymentId: text('payment_id').notNull(), createdAt: text('created_at').notNull() })`

- [ ] **Step 1: Write the failing tests:**
  - `dedupe keeps the oldest code per pair` (Review Focus 5): inside the test, create a scratch `payment_refs_old` table without the index, insert pair (t, a, b) codes `X` (created 2026-01-01) and `Y` (2026-02-01), plus another pair's `Z`. Run the migration's DELETE statement text against it (read the SQL file and run its DELETE with the table name swapped) and expect only `X` and `Z` left. Also check that a tie on `created_at` keeps the smaller `code`.
  - `pair index rejects a second ref for the same pair`: insert (t, a, b, 'X') then (t, a, b, 'Y') into the real table. The second insert throws `UNIQUE constraint failed`.
  - `payment_keys exists`: insert and select a row.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Write the SQL.** First `DELETE FROM payment_refs WHERE rowid NOT IN (SELECT …the first row per (trip_id, from_id, to_id) ordered by created_at, code…)`, then `CREATE UNIQUE INDEX payment_refs_trip_pair_uidx ON payment_refs (trip_id, from_id, to_id)`, then `CREATE TABLE payment_keys (...)`. Mirror it in `schema.ts`. `getOrCreateRefCode` stays as is.
- [ ] **Step 4: Run the new test plus `npm test` for the API, and confirm everything passes.** Then apply locally: `npx wrangler d1 migrations apply <db> --local` in `apps/api`.
- [ ] **Step 5: Commit**: `fix(db): one transfer note per pair and payment idempotency keys (#70)`

---

### Task 6: Idempotent `POST /trips/:id/payments`

**Files:**
- Move: `parseIdempotencyKey` from `apps/api/src/me/settle.ts` to `libs/api/util/src/idempotency.ts`, and re-import it in `settle.ts` (no behaviour change)
- Modify: `apps/api/src/payments/routes.ts` (`insertPayment` args gain `idempotencyKey?: string | null`; the route parses the body field)
- Test: `apps/api/test/payments-idempotency.test.ts` (new)

**Interfaces:**
- Consumes: `paymentKeys` (Task 5).
- Produces: request body `idempotencyKey?: string` (regex `^[A-Za-z0-9_-]{16,64}$`). Response `201 { paymentId, status }` when the payment is new, `200 { paymentId, status }` on a replay.

- [ ] **Step 1: Write the failing tests:**
  - `same key twice records one payment`: the second response is 200 with the same `paymentId`, and there's exactly one payment row with that `root_id`.
  - `concurrent same key records one payment`: `Promise.all` of two identical requests gives statuses `[200, 201]` in either order, one payment row and one `payment_keys` row.
  - `replay sends no notification`: spy as in `transaction-notifications.test.ts`. One `says_paid` notification only.
  - `same key with a different amount is 409 CONFLICT`, and `the same key used in another trip is 409 CONFLICT`.
  - `malformed key is 422 VALIDATION` (`'short'`).
  - `no key keeps today's behaviour` (Review Focus 4): two keyless requests give two payments.
  - `retried tick after success returns the original` (Review Focus 3): the first `{settles: true, idempotencyKey: K}` gives 201, and repeating it gives 200 with the same id, not 409.
  - `replay returns the current status`: confirm the payment, replay → `status: 'confirmed'`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement it.** The route parses the key right after body validation. If there's a key, look it up first (before `settles` and before the insert) via a `paymentForKey(db, key, tripId, {fromId, toId, amount})` in `payments/routes.ts`, modelled on `settlementForKey`. It returns `{ paymentId, status }` (the status of the head with `root_id = payment_id AND is_latest = 1`) or null, and throws `ApiError('CONFLICT', 409)` when the trip differs or the first row's (`id = payment_id`) from/to/amount differ. `insertPayment` adds `db.insert(paymentKeys)` to its batch when it has a key. The route catches `isDbError(err, 'UNIQUE constraint failed: payment_keys.key')`, reruns `paymentForKey`, and returns 200.
- [ ] **Step 4: Run the new file plus `payments.test.ts`, `settle*.test.ts` and `requests`-related tests, and confirm all pass.**
- [ ] **Step 5: Commit**: `fix(api): idempotency key on POST /payments (#70)`

---

### Task 7: Payment clients send a key and reuse it on retry

**Files:**
- Modify: `libs/web/screens/src/lib/usePendingPayment.ts`, `libs/web/screens/src/screens/PayScreen.tsx`
- Test: `libs/web/screens/src/lib/__tests__/payment-idempotency.test.tsx` (new; follow the existing screen test setup)

**Interfaces:**
- Consumes: `newIdempotencyKey()` from `@cc/web-data-access/people` (it already exists). The body field is from Task 6.

- [ ] **Step 1: Write the failing tests:**
  - `a scheduled tick sends an idempotencyKey`: the POST body has a string `idempotencyKey` of length ≥16.
  - `I paid retry after an error reuses the key`: the first POST rejects with a network error and the user taps again. Both bodies carry the same key.
  - `I paid after a success uses a new key`: two successful payments get different keys.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement it.** `usePendingPayment` adds the key to the `PendingPayment` when `schedule` is called and sends it in `flush`. `PayScreen` keeps the key in a `useRef`, creates it lazily in `handleIPaid`, and clears it after a success.
- [ ] **Step 4: Run the new test and the existing `request-page`/pay tests, and confirm they pass.**
- [ ] **Step 5: Commit**: `fix(web): send idempotency key with payments (#70)`

---

### Task 8: "Same as X" approval merges once

**Files:**
- Modify: `apps/api/src/participants/merge.ts` (the CASE in the `participant_merges` insert at ~128, and the catch at ~479)
- Test: `apps/api/test/merge-race.test.ts` (new)

**Interfaces:**
- `mergeParticipants` keeps its signature. On the NOT NULL failure it now throws `ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.')` when a re-read shows `from` or `into` no longer `active`/`pending`. Otherwise it throws the existing `claimPending()` as before.

- [ ] **Step 1: Write the failing tests** (seed: a pending name `p-new`, an active `PID.A`, an admin member):
  - `two concurrent Same-as approvals merge once`: `Promise.all` of two `POST /people/p-new/approve {sameAs: PID.A}` gives statuses that sort to `[204, 409]`. There's exactly one `participant_merges` row and one `name_merged` activity row, and `p-new` is `merged`.
  - `second Same-as approval after the first is ALREADY_HANDLED`: approve once (204), then approve again in sequence. The second is 409 `ALREADY_HANDLED` (the route's pre-check), and there's still one `participant_merges` row. The batch guard itself is proven by the concurrent test above.
  - `pending claim still maps to CLAIM_PENDING`: the existing behaviour is pinned. Check `merge-claim.test.ts` covers it; if it does, skip this test.
- [ ] **Step 2: Run them and confirm the concurrent test fails** (two merges).
- [ ] **Step 3: Extend the CASE** so it also yields NULL when `NOT EXISTS (SELECT 1 FROM participants WHERE id = fromId AND status IN ('active','pending'))` or the same check for `intoId`. In the catch, re-read both participants to choose `ALREADY_HANDLED` vs `claimPending()`.
- [ ] **Step 4: Run the new file plus every `merge-*`, `people-merge-any`, `claim-*` test, and confirm all pass.**
- [ ] **Step 5: Commit**: `fix(api): concurrent Same-as approvals merge once (#70)`

---

### Task 9: An expense edit can't undo an approval

**Files:**
- Modify: `apps/api/src/expenses/routes.ts`. In PATCH (~691–830), pull the write into `export async function writeExpenseEdit(db: Db, tripId: string, head: TransactionRow, validated: ValidatedExpense, actor: ResolvedActor, fundPaid: boolean): Promise<string>` (returns the new head id; use the types the route already has). Its supersede becomes the guard of `guardedTripWrite`: `WHERE id = head.id AND trip_id = ? AND is_latest = 1 AND status = head.status`. Give rollback (~834) the same supersede-guard treatment if it supersedes the head, and give delete (~978) a status/is_latest condition if it reads the head and then writes.
- Modify: `libs/web/screens/src/screens/ExpenseForm.tsx` (catch ~1064): on `ALREADY_HANDLED`, also invalidate `['trip', tripId]`, as for `PERSON_LEFT`.
- Test: `apps/api/test/expense-edit-race.test.ts` (new), plus `libs/web/screens/src/screens/__tests__/expense-form-already-handled.test.tsx` (new)

**Interfaces:**
- Consumes: `guardedTripWrite` (Task 1).

- [ ] **Step 1: Write the failing API tests:**
  - `stale edit after approve is refused`: read the pending head, approve via the route, then call `writeExpenseEdit` with the stale head. It rejects with `ALREADY_HANDLED`. The expense is still `approved`, there's exactly one `is_latest = 1` row for the root, and its description is unchanged.
  - `two stale edits leave one head`: call `writeExpenseEdit` twice with the same head. The first resolves and the second rejects with `ALREADY_HANDLED`, leaving one `is_latest = 1` row.
  - `concurrent guest edit and member approve never leave a pending copy of an approved expense`: `Promise.all([PATCH as guest, approve as member])`. Afterwards, either (approve 204, edit 403/409, head `approved`) or (edit 200, approve 409, head `pending` with the edit). Never approve 204 together with a `pending` head.
  - `member edit of an approved expense keeps it approved`: today's behaviour is pinned (skip it if `expenses.test.ts` already covers it).
- [ ] **Step 2: Run them and confirm they fail** (the stale edit succeeds today).
- [ ] **Step 3: Implement `writeExpenseEdit`** and the rollback/delete guards. Notifications stay in the route, after the write.
- [ ] **Step 4: Write the failing web test** `edit refused as already handled reloads the trip`: PATCH responds 409 `ALREADY_HANDLED`. Expect the inline error to show and `invalidateQueries` to be called with `['trip', tripId]`. Run it and confirm it fails, implement, then run it and confirm it passes.
- [ ] **Step 5: Run every `expenses*`, `fund-expenses`, `sport-planning-expenses`, `transactions-history` test, the `expense-form*` web tests and both new files, and confirm all pass.**
- [ ] **Step 6: Commit**: `fix(api): an expense edit can't undo an approval (#70)`

---

### Task 10: Whole-branch verification

- [ ] **Step 1:** Run `npm test`, `npm run typecheck` and `npm run lint`, and confirm all are green. Report any failure verbatim.
- [ ] **Step 2:** Check that `grep -rn "meta.changes" apps/api/src` lists only the sites in the skipped-sites note.
- [ ] **Step 3:** Build, restart the tunnel on the new build, browser-check a payment tick, an "I paid", an approve and an edit, then hand over for the owner's manual test.
