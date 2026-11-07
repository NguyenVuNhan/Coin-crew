# [Issue #80] Atomic Membership Claims & Persistent Pending Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the long-term architecture recommendations from Argon's review (Issue #80): atomic multi-statement D1 batch writes for membership claims and persistent `hasPendingMembershipRequest` on `TripView['me']` to retain guest status across reloads.

**Architecture:**
1. In `apps/api/src/participants/routes.ts`, execute superseding of prior claims and insertion of new claims within an atomic Cloudflare D1 batch transaction (`c.env.DB.batch([supersedeStmt, insertStmt])`), guaranteeing that claim insertions and supersede updates commit together or roll back together.
2. In `@cc/core` (`libs/shared/core/src/api-types.ts`), extend `TripView['me']` with `hasPendingMembershipRequest?: boolean`.
3. In `apps/api/src/trips/view.ts`, populate `hasPendingMembershipRequest` when `actor.userId` is present and `actor.kind !== 'member'`.
4. In `libs/web/screens/src/screens/GuestTrip.tsx`, bind the pending banner to `isMemberRequested = memberRequested || Boolean(view.me.hasPendingMembershipRequest)`.

**Tech Stack:** TypeScript, Cloudflare D1 / SQLite, Hono, Drizzle ORM, React, React Router, Vitest.

**Spec:** Argon Code Review Advisory on PR #78 (Issue #72).

## Global Constraints
- Preserve zero-overhead / zero-db operation for unauthenticated bot crawls.
- Maintain idempotent 200 responses on duplicate claims by the same user.
- Ensure all automated tests in `@cc/api` and `@cc/web-screens` pass cleanly.
- Strict typecheck passing across the entire Nx workspace.

## Review Focus
- Prior claim roll-back on failed insert: If a user has a pending claim on Person A, and attempts to claim Person B which fails (e.g. Person B already claimed by another user), Person A's pending claim must NOT be superseded or rejected.
- Hard page reload persistence: When a guest with a pending membership request reloads the page (F5 without `?becomeMember=1`), the pending approval banner must render immediately.
- Clean param stripping without re-post: When a guest with `hasPendingMembershipRequest: true` re-enters with `?becomeMember=1`, it immediately cleans the query parameter without firing another POST request.
- Active member exemption: Once a membership request is approved (`actor.kind === 'member'`), `hasPendingMembershipRequest` must be false/undefined.
- Anonymous / unauthenticated guest exemption: A guest without a session user must receive `hasPendingMembershipRequest: false` without triggering unnecessary queries.

---

### Task 1: Extend `@cc/core` API Contract

**Files:**
- Modify: `libs/shared/core/src/api-types.ts:344-348`

**Interfaces:**
- Consumes: None
- Produces: `TripView['me'].hasPendingMembershipRequest?: boolean`

- [ ] **Step 1: Add `hasPendingMembershipRequest` to `TripView['me']`**
  In `libs/shared/core/src/api-types.ts`:
  ```typescript
  export interface TripView {
    trip: ...;
    me: {
      kind: ActorKind;
      participantId: string | null;
      participantPending: boolean;
      isOrganiser: boolean;
      isAdmin?: boolean;
      hasPendingMembershipRequest?: boolean;
    };
    ...
  ```

- [ ] **Step 2: Verify typecheck**
  Run: `npm run typecheck`
  Expected: PASS

- [ ] **Step 3: Commit**
  ```bash
  git add libs/shared/core/src/api-types.ts
  git commit -m "feat(core): expose hasPendingMembershipRequest on TripView me contract"
  ```

---

### Task 2: Implement Atomic Batch Writes for Membership Claims in API

**Files:**
- Modify: `apps/api/src/participants/routes.ts:1000-1065`
- Test: `apps/api/test/membership-dedup.test.ts`

**Interfaces:**
- Consumes: `c.env.DB.batch`, `membership_requests_one_pending_user` partial index
- Produces: Atomic transactional claim insertion + prior claim supersede

- [ ] **Step 1: Write failing integration test in `membership-dedup.test.ts`**
  Add a test: "rolls back superseding of prior claim when insert of new claim fails due to conflict".
  - User A claims PID.A (becomes pending).
  - User B claims PID.B (becomes pending).
  - User A tries to claim PID.B (fails with 409 ALREADY_CLAIMED).
  - Assert that User A's claim on PID.A is STILL `pending`, not `rejected`.

- [ ] **Step 2: Run test to verify failure**
  Run: `npx vitest run apps/api/test/membership-dedup.test.ts`
  Expected: FAIL (because prior implementation rejects before insert without transaction rollback).

- [ ] **Step 3: Implement atomic batch write in `apps/api/src/participants/routes.ts`**
  Use `c.env.DB.batch([supersedeStmt, insertStmt])`.
  Wrap in `try / catch (err)` checking `isDbError(err, 'UNIQUE constraint failed')`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `npx vitest run apps/api/test/membership-dedup.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add apps/api/src/participants/routes.ts apps/api/test/membership-dedup.test.ts
  git commit -m "fix(api): execute claim insert and prior claim supersede in atomic D1 batch"
  ```

---

### Task 3: Expose `hasPendingMembershipRequest` in TripView and API Tests

**Files:**
- Modify: `apps/api/src/trips/view.ts:20-30`
- Test: `apps/api/test/membership-dedup.test.ts`

**Interfaces:**
- Consumes: `ResolvedActor.userId`, `db.select().from(membershipRequests)`
- Produces: `me.hasPendingMembershipRequest: boolean`

- [ ] **Step 1: Write failing test in `membership-dedup.test.ts`**
  Add test: "reflects hasPendingMembershipRequest: true in TripView for user with pending claim, and false for member".
  - Guest user with session claims PID.A.
  - Call `GET /api/trips/:id` as that guest. Assert `view.me.hasPendingMembershipRequest === true`.
  - Approve the claim. Call `GET /api/trips/:id` as the now-member. Assert `view.me.hasPendingMembershipRequest === false` or `undefined`.

- [ ] **Step 2: Run test to verify failure**
  Run: `npx vitest run apps/api/test/membership-dedup.test.ts`
  Expected: FAIL (`view.me.hasPendingMembershipRequest` is undefined / not populated).

- [ ] **Step 3: Implement `hasPendingMembershipRequest` in `apps/api/src/trips/view.ts`**
  In `toTripView`:
  ```typescript
  let hasPendingMembershipRequest = false;
  if (actor.userId && actor.kind !== 'member') {
    const pendingReq = await db
      .select({ id: membershipRequests.id })
      .from(membershipRequests)
      .where(
        and(
          eq(membershipRequests.tripId, snapshot.trip.id),
          eq(membershipRequests.userId, actor.userId),
          eq(membershipRequests.status, 'pending'),
        ),
      )
      .get();
    hasPendingMembershipRequest = Boolean(pendingReq);
  }
  ```
  Include `...(hasPendingMembershipRequest ? { hasPendingMembershipRequest: true } : {})` in `me`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `npx vitest run apps/api/test/membership-dedup.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add apps/api/src/trips/view.ts apps/api/test/membership-dedup.test.ts
  git commit -m "feat(api): populate hasPendingMembershipRequest in toTripView"
  ```

---

### Task 4: Persist Guest Membership Status in Frontend Across Hard Reloads

**Files:**
- Modify: `libs/web/screens/src/screens/GuestTrip.tsx:50-95`
- Test: `libs/web/screens/src/test/guest-trip-membership.test.tsx`

**Interfaces:**
- Consumes: `view.me.hasPendingMembershipRequest`
- Produces: Persistent pending approval banner on hard reload without URL params

- [ ] **Step 1: Write failing test in `guest-trip-membership.test.tsx`**
  Add test: "renders pending approval banner when view.me.hasPendingMembershipRequest is true without search params".
  - Render `GuestTrip` with `view: tripView({ me: { ..., hasPendingMembershipRequest: true } })` at `/t/t-1`.
  - Assert that `screen.getByText('You asked to become a member. A member will approve it.')` is visible.

- [ ] **Step 2: Run test to verify failure**
  Run: `npx vitest run libs/web/screens/src/test/guest-trip-membership.test.tsx`
  Expected: FAIL (banner only rendered if `memberRequested` state is true).

- [ ] **Step 3: Implement persistent status in `libs/web/screens/src/screens/GuestTrip.tsx`**
  Define `const isMemberRequested = memberRequested || Boolean(view.me.hasPendingMembershipRequest);`.
  Use `isMemberRequested` in place of `memberRequested`.
  In `useEffect`, if `becomeMemberParam` is set and `isMemberRequested` is already true, clean `searchParams` without posting.

- [ ] **Step 4: Run test to verify it passes**
  Run: `npx vitest run libs/web/screens/src/test/guest-trip-membership.test.tsx`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add libs/web/screens/src/screens/GuestTrip.tsx libs/web/screens/src/test/guest-trip-membership.test.tsx
  git commit -m "feat(web): persist pending membership approval banner across reloads"
  ```

---

### Task 5: Full Verification & Remote CI Push

**Files:**
- All modified files

- [ ] **Step 1: Run full API test suite**
  Run: `npm test -w @cc/api`
  Expected: All 87 test suites PASS.

- [ ] **Step 2: Run full Web test suite**
  Run: `npm test -w @cc/web-screens`
  Expected: All web screens tests PASS.

- [ ] **Step 3: Run workspace typecheck**
  Run: `npm run typecheck`
  Expected: 0 type errors.

- [ ] **Step 4: Push to origin and monitor PR #78 CI**
  Run: `git push origin NguyenVuNhan/epic-phase-1-group-split-vietqr-hardening`
  Run: `gh pr checks 78 --watch`
  Expected: 100% Green.
