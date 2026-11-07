# Devices & Membership Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate orphan `devices` rows from stateless health/uptime probes, prevent re-posting membership claims on page reload by stripping `?becomeMember=1`, and ensure idempotent de-duplicated membership requests.

**Architecture:** Route `/api/health` before device middleware and defer SQLite `devices` row creation until a cookie handshake, restore header, or mutating HTTP method occurs. In the web frontend, strip `?becomeMember=1` via `setSearchParams(..., { replace: true })` immediately upon processing. In the backend, return idempotent `200` for repeat membership claims by the same user, auto-supersede existing user claims in the same trip, and enforce a partial unique index on `(trip_id, user_id) WHERE status = 'pending'`.

**Tech Stack:** Hono, Drizzle ORM, Cloudflare D1 (SQLite), Vitest, React, React Router.

**Spec:** [`docs/superpowers/specs/2026-11-07-devices-and-membership-hardening-design.md`](file:///C:/Users/NvN/orca/workspaces/coin-crew/epic-phase-1-group-split-vietqr-hardening/docs/superpowers/specs/2026-11-07-devices-and-membership-hardening-design.md)

## Global Constraints

- Never insert rows into `devices` for stateless GET requests to `/api/health` or first-time read-only GET requests without cookies.
- Maintain seamless cookie-based guest identification: set `did` cookie in `Set-Cookie` on initial request and persist device upon receiving the cookie in subsequent requests.
- Strip `?becomeMember=1` using `replace: true` so browser history and reloads do not retain the query parameter.
- Never crash or display unhandled errors if a membership request has already been recorded for the user.
- Enforce that a user cannot have more than one `pending` membership claim in a trip at any time.

## Review Focus

1. **Uptime probe hitting `/api/health` without cookies:** Must return `200 OK` with `{ ok: true }` without `Set-Cookie: did=...` and with 0 rows added to SQLite `devices` table.
2. **First-time anonymous user visiting `/api/me` (read-only GET):** Receives `Set-Cookie: did=<id>` and `X-Device-Id: <id>`, but 0 rows are inserted into `devices` table until a subsequent request sends `Cookie: did=<id>`.
3. **First-time anonymous user executing a mutating call (POST/PUT/PATCH/DELETE):** Eagerly inserts row into `devices` table so relational constraints (foreign keys / device_participants) succeed on the first mutation.
4. **User reloads `/t/:tripId?becomeMember=1`:** The URL is cleaned immediately to `/t/:tripId`, preventing the effect from re-running on reload; if a duplicate request arrives at the backend, it returns `200` with existing `requestId` without duplicate activity logs.
5. **User claims Participant A, then claims Participant B in the same trip:** The pending claim for Participant A is marked `rejected`, the claim for Participant B is inserted as `pending`, and the partial unique index prevents race duplicates.

---

### Task 1: Health Route Exemption & Lazy Device Persistence Middleware

**Files:**
- Modify: `apps/api/src/app.ts:38-42`
- Modify: `libs/api/auth/src/device.ts:9-63`
- Modify: `apps/api/test/helpers.ts:64-70`
- Modify: `apps/api/test/access.test.ts:22-36`

**Interfaces:**
- Consumes: `deviceMiddleware` in `libs/api/auth/src/device.ts`, `createApp` in `apps/api/src/app.ts`
- Produces:
  - `/api/health` mounted before `deviceMiddleware`.
  - `deviceMiddleware` persists to `devices` table only when `cookieDid`, `X-Device-Restore`, or mutating HTTP method (`POST`, `PUT`, `PATCH`, `DELETE`) is present.
  - `newDevice()` in `apps/api/test/helpers.ts` completes handshake via `/api/me` or `/api/health`.

- [ ] **Step 1: Write the failing tests in `apps/api/test/access.test.ts`**

Update `access.test.ts` to test both health probe exemption and lazy device insertion on handshake:
```typescript
describe('device identity & lazy persistence', () => {
  it('health probe does not set cookies or insert device rows', async () => {
    const before = await count('devices');
    const res = await call('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Device-Id')).toBeNull();
    expect(res.headers.get('Set-Cookie')).toBeNull();
    expect(await count('devices')).toBe(before);
  });

  it('first GET request issues cookie but does not insert device row until handshake or mutation', async () => {
    const before = await count('devices');
    const res1 = await call('/api/me');
    const did = res1.headers.get('X-Device-Id');
    expect(did).toBeTruthy();
    expect(await count('devices')).toBe(before);

    // Handshake request presenting the cookie
    const res2 = await call('/api/me', { headers: { Cookie: `did=${did}` } });
    expect(res2.status).toBe(200);
    expect(await count('devices')).toBe(before + 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cc/api test test/access.test.ts`  
Expected: FAIL (health check currently returns `X-Device-Id` and creates device rows).

- [ ] **Step 3: Implement health exemption and lazy persistence**

1. In `apps/api/src/app.ts`:
   Move `app.get('/api/health', (c) => c.json({ ok: true }));` before `app.use('/api/*', deviceMiddleware);`.
2. In `libs/api/auth/src/device.ts`:
   Check if request has cookie, restore header, or mutating method:
   ```typescript
   const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method);
   const shouldPersist = !!cookieDid || !!c.req.header('X-Device-Restore') || isMutation;

   if (!existing && shouldPersist) {
     await db.insert(devices).values({
       idHash: hash,
       createdAt: now,
       lastSeenAt: now,
     });
   }
   ```
3. In `apps/api/test/helpers.ts`:
   Update `newDevice()` to hit `/api/me`, obtain `X-Device-Id`, and perform the handshake request:
   ```typescript
   export async function newDevice(): Promise<{ deviceId: string; cookie: string }> {
     const res = await call('/api/me');
     const deviceId = res.headers.get('X-Device-Id')!;
     const cookie = `did=${deviceId}`;
     await call('/api/me', { headers: { Cookie: cookie } });
     return { deviceId, cookie };
   }
   ```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cc/api test test/access.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/app.ts libs/api/auth/src/device.ts apps/api/test/helpers.ts apps/api/test/access.test.ts
git commit -m "feat(api): exempt health checks and make device persistence lazy (#72)"
```

---

### Task 2: Membership Request Deduplication, Idempotency, and Unique Index

**Files:**
- Modify: `libs/api/db/src/schema.ts:124-129`
- Create: `apps/api/migrations/0019_membership_user_dedup.sql`
- Modify: `apps/api/src/participants/routes.ts:970-1017`
- Test: `apps/api/test/membership-dedup.test.ts`

**Interfaces:**
- Consumes: `membershipRequests` table definition in `libs/api/db/src/schema.ts`, `POST /trips/:id/membership` route
- Produces:
  - Database partial unique index `membership_requests_one_pending_user` on `(trip_id, user_id) WHERE status = 'pending'`.
  - Idempotent `POST /trips/:id/membership`: returns existing `requestId` with status 200 if already pending for caller.
  - Auto-superseding: rejects previous pending claim by same user in the trip before inserting new claim.

- [ ] **Step 1: Write the failing tests in `apps/api/test/membership-dedup.test.ts`**

Create `apps/api/test/membership-dedup.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { call, memberSid, seedTrip, T, PID, U } from './helpers';

describe('membership request deduplication & idempotency', () => {
  beforeEach(seedTrip);

  it('returns existing requestId idempotently (200) on duplicate claim by same user', async () => {
    const sid = await memberSid('u-new', 'New User');
    const cookie = `sid=${sid}`;

    // First claim
    const res1 = await call(`/api/trips/${T.tripId}/membership`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantId: PID.A }),
    });
    expect(res1.status).toBe(201);
    const { requestId: id1 } = await res1.json<{ requestId: string }>();

    // Duplicate claim on same participant
    const res2 = await call(`/api/trips/${T.tripId}/membership`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantId: PID.A }),
    });
    expect(res2.status).toBe(200);
    const { requestId: id2 } = await res2.json<{ requestId: string }>();
    expect(id2).toBe(id1);
  });

  it('supersedes previous pending claim when user claims a different participant', async () => {
    const sid = await memberSid('u-new2', 'New User 2');
    const cookie = `sid=${sid}`;

    // First claim on PID.A
    const res1 = await call(`/api/trips/${T.tripId}/membership`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantId: PID.A }),
    });
    expect(res1.status).toBe(201);

    // Second claim on PID.B
    const res2 = await call(`/api/trips/${T.tripId}/membership`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantId: PID.B }),
    });
    expect(res2.status).toBe(201);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cc/api test test/membership-dedup.test.ts`  
Expected: FAIL (returns 409 `ALREADY_CLAIMED` instead of idempotent 200).

- [ ] **Step 3: Implement database index and route logic**

1. In `libs/api/db/src/schema.ts`, add index:
   ```typescript
   uniqueIndex('membership_requests_one_pending_user')
     .on(t.tripId, t.userId)
     .where(sql`${t.status} = 'pending'`),
   ```
2. Create migration `apps/api/migrations/0019_membership_user_dedup.sql`:
   ```sql
   CREATE UNIQUE INDEX `membership_requests_one_pending_user`
   ON `membership_requests` (`trip_id`, `user_id`)
   WHERE `status` = 'pending';
   ```
3. In `apps/api/src/participants/routes.ts`:
   Before inserting into `membership_requests`:
   * Check for existing pending claim on `(tripId, participantId)`. If exists and `userId === user.id`, return `c.json({ requestId: existingClaim.id }, 200)`.
   * If exists and `userId !== user.id`, throw `ApiError('ALREADY_CLAIMED', 409)`.
   * Auto-reject any prior pending claims by `user.id` in `tripId` on other participants.
   * Insert new pending claim.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cc/api test test/membership-dedup.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add libs/api/db/src/schema.ts apps/api/migrations/0019_membership_user_dedup.sql apps/api/src/participants/routes.ts apps/api/test/membership-dedup.test.ts
git commit -m "feat(api): make membership claims idempotent and deduplicate per user (#72)"
```

---

### Task 3: URL Parameter Cleanup & Resilient UI State in `GuestTrip`

**Files:**
- Modify: `libs/web/screens/src/screens/GuestTrip.tsx:49-86`
- Create/Modify: `libs/web/screens/src/test/guest-trip-membership.test.tsx`

**Interfaces:**
- Consumes: `useSearchParams` from `react-router-dom`, `GuestTrip` component
- Produces: URL parameter `becomeMember` is deleted via `setSearchParams(..., { replace: true })`; 409 `ALREADY_CLAIMED` does not crash and leaves `memberRequested = true`.

- [ ] **Step 1: Write the failing test in `libs/web/screens/src/test/guest-trip-membership.test.tsx`**

Create test verifying `becomeMember` parameter is removed from search params upon handling:
```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderAt, mockApi } from './render';
import { tripView } from './fixtures';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GuestTrip becomeMember parameter handling', () => {
  it('strips ?becomeMember=1 from URL search params upon triggering membership request', async () => {
    mockApi({
      'POST /api/trips/t-1/membership': { requestId: 'req-1' },
    });
    const guestView = {
      ...tripView,
      me: { kind: 'guest', participantId: 'p-an' },
    };

    const { router } = renderAt('/t/t-1?becomeMember=1', {
      initialView: guestView,
    });

    await waitFor(() => {
      expect(router.state.location.search).not.toContain('becomeMember=1');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cc/web test guest-trip-membership`  
Expected: FAIL (search params still contain `becomeMember=1`).

- [ ] **Step 3: Implement URL stripping and 409 handling in `GuestTrip.tsx`**

In `libs/web/screens/src/screens/GuestTrip.tsx`:
1. Change `const [searchParams] = useSearchParams();` to:
   ```typescript
   const [searchParams, setSearchParams] = useSearchParams();
   ```
2. In `useEffect`:
   ```typescript
   if (
     becomeMemberParam &&
     !archived &&
     view.me.kind === 'guest' &&
     myId &&
     !requestedRef.current
   ) {
     requestedRef.current = true;
     setMemberRequested(true);
     const nextParams = new URLSearchParams(searchParams);
     nextParams.delete('becomeMember');
     setSearchParams(nextParams, { replace: true });

     apiSend(
       `/api/trips/${view.trip.id}/membership`,
       'POST',
       { participantId: myId },
       view.trip.id,
     ).catch((err: unknown) => {
       if (err instanceof ApiClientError && err.code === 'PROPOSAL_PENDING' && typeof err.details.proposalId === 'string') {
         setMemberRequested(false);
         setProposal({ id: err.details.proposalId, by: typeof err.details.requestedByName === 'string' ? err.details.requestedByName : '' });
       } else if (err instanceof ApiClientError && err.code === 'ALREADY_CLAIMED') {
         setMemberRequested(true);
       }
     });
   }
   ```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cc/web test guest-trip-membership`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add libs/web/screens/src/screens/GuestTrip.tsx libs/web/screens/src/test/guest-trip-membership.test.tsx
git commit -m "feat(web): clean becomeMember url param and handle existing claim gracefully (#72)"
```

---

### Task 4: Full Workspace Verification & Regression Run

**Files:**
- None (verification task across workspace)

**Interfaces:**
- Consumes: All tests across `@cc/api` and `@cc/web`
- Produces: Passing test suites, clean typecheck, clean lint.

- [ ] **Step 1: Run all API tests**

Run: `pnpm --filter @cc/api test`  
Expected: All tests pass.

- [ ] **Step 2: Run all Web tests**

Run: `pnpm --filter @cc/web test`  
Expected: All tests pass.

- [ ] **Step 3: Run full workspace typecheck**

Run: `pnpm typecheck`  
Expected: Exit code 0, no type errors.

- [ ] **Step 4: Commit any cleanup (if needed)**

```bash
git commit --allow-empty -m "chore: verify tests and typecheck for issue 72 (#72)"
```
