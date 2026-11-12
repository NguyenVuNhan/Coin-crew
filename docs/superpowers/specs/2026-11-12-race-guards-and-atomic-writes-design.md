# Race guards and atomic trip writes — design

Issues: #70 (race conditions and duplicate guards) with #68 (atomic status changes) folded in.
Branch: `defect-fix-race-conditions-and-duplicate-guards` (the empty #68 worktree was removed).

## Intent

Cleanup, not an incident: nobody has been hurt by these yet. A product review (Gemini) flagged them, and
we checked each against today's code before designing. The goal is that a double tap, a slow network
retry, or two people acting on the same thing at the same moment can never produce a doubled record, a
silently undone approval, or a stale group view.

## Goals

1. **Atomic guarded writes (#68).** Every "change status only if it is still X" write commits the status
   change, the trip version bump and the activity row together, or none of them. Today they are two D1
   calls (`update(...).run()`, check `meta.changes`, then `commitTripWrite`), so a failure between them
   leaves the change in place with no version bump, and cached views stay stale.
2. **"Same as X" approval merges once (#70.1).** Two members approving the same pending name as "Same as X"
   at the same moment yields one merge and one log entry; the second gets `409 ALREADY_HANDLED`.
3. **An edit cannot undo an approval (#70.2).** If a guest's edit of a pending expense lands just after a
   member approves it, the edit is refused with `409 ALREADY_HANDLED` and the approval stands.
4. **`POST /trips/:id/payments` is idempotent (#70.3).** A repeated request with the same idempotency key
   returns the first payment instead of recording another.
5. **One transfer note per pair (#70.4).** `payment_refs` gets a unique `(trip_id, from_id, to_id)` index.

## Non-goals

- No UI redesign. The only visible change is that an edit refused by goal 3 shows the existing
  "someone already handled this" message (`ALREADY_HANDLED`) and reloads, as approve/reject already do.
- Not reworking the non-guarded writes that already go through a single `commitTripWrite` batch.
- Not touching #80's area (`POST /trips/:id/membership`, `trips/view.ts`, `GuestTrip`). #80 runs in its
  own worktree; it shares only the file `apps/api/src/participants/routes.ts`, in a different route. Whichever
  lands second rebases; no logic overlaps.

## Anti-goals

- A guard that turns a genuine failure (network, constraint bug) into a silent `409`. Only "the row was
  no longer in the expected state" may become `ALREADY_HANDLED`; anything else must still surface as an error.
- Losing or rewriting existing data in the migration, beyond collapsing duplicate `payment_refs` rows.

## What exists today (verified 2026-11-12)

- `libs/api/db/src/commit.ts` — `commitTripWrite(db, tripId, queries, activity)` batches
  `[...queries, bump trips.version, insert activity]`. `trips.version` is `NOT NULL`.
- ~22 call sites do a guarded `update(...).run()` + `meta.changes === 0 → 409`, then
  `commitTripWrite(db, tripId, [], …)` separately: payments (8), participants (5), expenses (4),
  proposals routes/store (5), bank (2), fund (2), `me/mergeOptions.ts` (1), `trips/routes.ts` (1).
  Find them with `grep -rn "meta.changes" apps/api/src`.
- **Item 1:** `POST /trips/:id/people/:pid/approve` with `sameAs` checks `target.status === 'pending'`
  in a read, then calls `mergeParticipants` (`apps/api/src/participants/merge.ts`). The merge batch's first
  statement inserts `participant_merges` with an `actor_user_id` CASE that becomes NULL (NOT NULL fails,
  batch rolls back) only if a membership claim is pending. Nothing re-checks that `from` is still
  pending/active, so two concurrent approvals both merge and both log.
- **Item 2:** `PATCH /trips/:id/expenses/:eid` reads the head, then batches a supersede
  (`WHERE id = head.id AND is_latest = 1`, no status condition) and inserts the new head with
  `status: head.status` from the stale read. If approve commits in between, the edit supersedes the
  approved head and inserts a **pending** copy: the approval is silently undone. (The issue described the
  effect backwards.) Because the supersede's row count is never checked, two racing edits can probably
  both insert a head, leaving two `is_latest = 1` rows for one root — unconfirmed; the builder should
  write a test for it and the fix below covers it either way.
- **Item 3:** `POST /payments` has only the `settles: true` soft check, which narrows but doesn't close
  the race (the code comment says so). Clients: `libs/web/screens/src/lib/usePendingPayment.ts` (tick,
  `keepalive`, flushed on timer/pagehide/visibilitychange) and `PayScreen.tsx` `handleIPaid` ("I paid").
- **Item 4:** `payment_refs` has a unique `(trip_id, code)` and a plain index on `trip_id`.
  `getOrCreateRefCode` (`apps/api/src/payments/refs.ts`) picks the oldest row for the pair, so duplicates
  are harmless today but possible.
- API tests run on real D1 via `@cloudflare/vitest-plugin` with migrations applied, so SQLite
  behaviour (`changes()`, constraint rollback in a batch) is testable for real.

## Decisions

### A. One guarded-commit helper in `@cc/api-db` (goal 1)

Add a helper next to `commitTripWrite` that takes the guarded statement, the follow-up statements and the
activity, and runs them as **one** `db.batch`. The guard must stop the rest of the batch when the guarded
statement changed no rows.

Suggested mechanism (builder may choose another that meets the same contract): put the version bump
directly after the guarded statement as
`UPDATE trips SET version = CASE WHEN changes() > 0 THEN version + 1 ELSE NULL END WHERE id = ?`.
When the guard matched nothing, `version` becomes NULL, the NOT NULL constraint fails, and D1 rolls the
whole batch back. The helper catches exactly that failure (match the constraint on `trips.version`, not
any error) and throws `ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.')`, or a
caller-supplied error for sites that use a different one. Every other error propagates unchanged.

Contract:
- all-or-nothing: guarded change + version bump + follow-ups + activity row;
- guard miss → the caller's "already handled" error, nothing written;
- other failures → rethrown as-is.

Migrate all the call sites listed above to it. Sites whose 409 message or code differs keep their
current code and message. Any extra reads the route does *after* the update to build its response stay
after the commit.

**Sites that chain into another batch or a second guard** (decided during design): these are left in
their current multi-step shape with their compensating writes. They are `proposals/store.ts` ~125
(claim, then `mergeParticipants`) and the two membership-approve paths in `participants/routes.ts`
~1121 (approve, then merge, writing `pending` back on failure) and ~1155 (approve, then link, writing
`rejected` back on a miss). Where the trailing `commitTripWrite` can simply join the merge's or link's
existing batch, fold it in. Otherwise leave it and list the site in the PR as skipped, with the reason.
Don't restructure `mergeParticipants` to make them fit.

### B. "Same as X" merge (goal 2)

Extend the existing first-statement guard in `mergeParticipants` so the CASE also yields NULL when
`from` is no longer `active`/`pending` (and `into` is no longer `active`/`pending`). The second concurrent
merge then rolls back entirely. Both conditions raise the same NOT NULL failure, which
`merge.ts` ~479 already maps to `409 CONFLICT CLAIM_PENDING`. So on that failure, re-read the two
participants: if `from` or `into` is no longer active/pending, throw `ALREADY_HANDLED`; otherwise keep
`CLAIM_PENDING`. Callers: the approve route and `me/mergeOptions.ts` surface it as-is.
`auth/mergeUsers.ts` already catches and logs per-group merge failures during sign-in and carries on,
which is correct here too (another request already did the merge); no change there. Don't restructure
the merge; it already runs as one batch.

### C. Expense edit vs approve (goal 3)

The edit's supersede becomes the guard: `WHERE id = head.id AND is_latest = 1 AND status = head.status`
(the status the edit read). Run the edit through helper A so the new head, shares and activity are only
written if the supersede matched. A miss → `409 ALREADY_HANDLED`. This also closes edit-vs-edit
(two heads). Apply the same guard to the other version-chain writes in that file that read the head then
supersede it (rollback, delete) if they share the pattern.

Losing the guest's edit is intended. Guests may only edit **pending** expenses (`libs/shared/core/src/permissions.ts:37`),
so once it's approved their edit wouldn't have been allowed anyway. A member whose edit races an approval
also gets 409 (their read was stale) and can simply edit again after the reload; members' edits to
approved expenses keep them approved, as today.

Client: if the edit sheet doesn't already handle `ALREADY_HANDLED`, show the existing "someone already
handled this" copy and reload the trip, matching approve/reject. No new copy, and no attempt to keep the
typed changes.

### D. Payment idempotency (goal 4)

**Follow the pattern the repo already uses for settlements** (`apps/api/src/me/settle.ts`,
`requests/routes.ts`; web `newIdempotencyKey()` in `libs/web/data-access/src/people.ts`, used by
`PersonScreen`). Don't invent a second scheme.

- **Key:** body field `idempotencyKey`, optional so old clients keep working, validated with the existing
  `parseIdempotencyKey` (move it to a shared spot such as `@cc/api-util` if importing it from `me/` would
  be awkward).
- **Storage:** a new `payment_keys` table modelled on `settlement_keys` (`key` primary/unique,
  `trip_id`, `payment_id`, `created_at`), with the key row inserted **in the same batch** as the payment.
  Kept forever, like `settlement_keys`. Version-chain writes (`revise`, etc.) don't touch it; the key
  points at the payment's first row, and the lookup returns that payment's current head.
- **Server:** look the key up first. If it exists for this trip, return `200 { paymentId, status }` for the
  existing payment (201 for a fresh record), with no notification. If a concurrent request wins the
  insert, catch the unique-constraint failure on `payment_keys.key` and do the same lookup (as
  `settle.ts` does). A key that belongs to another trip, or to a payment with a different
  `fromId`/`toId`/`amount`, → `409 CONFLICT`, matching how settle treats a reused key.
  The key check runs before the `settles` check, so a retried tick returns the original payment
  instead of `409 ALREADY_HANDLED`.
- **Clients:** `usePendingPayment` generates the key with `newIdempotencyKey()` when a payment is
  scheduled and reuses it for that payment's send. `PayScreen` generates one per "I paid" attempt, reuses
  it if that attempt is retried after an error, and resets it after a success.

### E. `payment_refs` uniqueness (goal 5)

Hand-written migration `0022_...sql` (D1 migrations are hand-written in this repo; apply with `--local`
for the tunnel). It deletes all but the oldest row per `(trip_id, from_id, to_id)` (ties broken by
`code`), then creates `payment_refs_trip_pair_uidx` unique on `(trip_id, from_id, to_id)`. Add the index
to `schema.ts`. The same migration creates goal D's `payment_keys` table. `getOrCreateRefCode`'s retry loop stays
(it still handles code clashes); a pair clash now always resolves via `firstForPair()`.

## Testing

Integration tests in `apps/api/test/` against real D1, existing tests untouched:
- helper A: guard hit commits all three; guard miss writes nothing and throws the caller's error; a
  non-guard failure is rethrown, not turned into 409.
- item 1: two "Same as X" approvals for the same pending name → one merge, one `participant_merges`
  row, one activity row, second request 409.
- item 2: approve then a stale edit (head read before approve) → 409, expense still approved, one
  `is_latest` head. Two stale edits → one succeeds, one 409, one head.
- item 3: same key twice → one payment, same id, second 200; same key, different amount or another
  trip → 409 CONFLICT; malformed key → 422; no key → unchanged behaviour; retried tick with a key after
  the first succeeded → original payment, not 409.
- item 4: migration collapses duplicates to the oldest code; a second insert for the pair fails the index.
- web: a test that both payment clients send the header and reuse it on retry.

True concurrency can't be forced in the test runner; tests simulate the interleaving by running the
"other side" between the route's read and its write (e.g. pre-approving, or calling the helper with a
guard that matches nothing).

## Left to the builder

- The exact guard mechanism in A, if `changes()`-in-CASE proves awkward with drizzle; the contract is
  what matters.
- Helper name and signature; whether `commitTripWrite` grows an option or a sibling function is added.
- Ordering of the call-site migration and how to split it into commits.
- Whether some call sites are better left alone because their "guard" is not really a race guard — note
  each one skipped and why.

Calls made during design (owner to check): reuse the settlement idempotency pattern; 200 on replay vs
201 fresh; keys kept forever; 409 CONFLICT on a reused key with a different body; keep the oldest
`payment_refs` row; leave the chained merge/link sites in their compensating shape; re-read after a
merge failure to pick `ALREADY_HANDLED` vs `CLAIM_PENDING`; a lost edit is simply refused, with no
attempt to keep the typed changes.
