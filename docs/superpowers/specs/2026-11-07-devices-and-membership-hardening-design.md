# Devices & Membership Hardening (Cookie-less Rows, ?becomeMember=1 Reload, Duplicate Requests) — Design

Date: 2026-11-07 · Status: Ready for Review & Approval  
Issue: [NguyenVuNhan/Coin-crew#72](https://github.com/NguyenVuNhan/Coin-crew/issues/72)  
Parent Epic: [NguyenVuNhan/Coin-crew#53](https://github.com/NguyenVuNhan/Coin-crew/issues/53) (*Phase 1: Group Split & VietQR Hardening*)  

---

## 1. Why

During Phase 1 final review, three related defects were uncovered across device session tracking, URL handling for member onboarding, and membership request processing:

1. **Cookie-less Uptime Rows:** The backend eagerly inserts a new row into the `devices` table on *every* request lacking a `did` cookie, even for read-only GET requests and health probes (`/api/health`). Automated uptime monitors (e.g. Cloudflare Health Monitor, UptimeRobot) make cookie-less pings every 30–60 seconds, creating ~86,400 orphan device rows per month. This wastes Cloudflare D1 write quota and bloats storage with dead hashes.
2. **`?becomeMember=1` Reload Re-submission:** When a guest returns from OAuth or clicks a member proposal, the web app lands on `/t/:tripId?becomeMember=1`. A `useEffect` in `GuestTrip.tsx` triggers `POST /api/trips/:id/membership`, but the query parameter is never stripped from the URL bar. Reloading the page (F5 or browser reopen) re-triggers the effect, firing a duplicate POST that fails with an unhandled 409 error and glitches the UI.
3. **Non-Idempotent & Duplicate Membership Requests:** When a user re-submits a membership claim for a participant they already claimed, the database unique constraint throws `409 ALREADY_CLAIMED` instead of idempotently returning the existing request. Furthermore, the database schema only enforces `(participant_id) WHERE status = 'pending'`, allowing a single user to submit multiple pending claims for different participants in the same trip, creating duplicate and conflicting approval cards for group admins.

Fixing these three defects hardens device management and group onboarding reliability before Phase 1 goes live.

---

## 2. Goals

1. **Zero Orphan Devices from Stateless Probes:** Uptime monitors, health pings, search bots, and one-off cookie-less GET requests must never insert rows into the SQLite `devices` table.
2. **Cookie Handshake / Lazy Device Insertion:** Device records in `devices` table are persisted only when:
   - The client proves cookie support by sending back the `did` cookie in an incoming request (cookie handshake confirmed), OR
   - The request contains an explicit `X-Device-Restore` header, OR
   - The client performs a state-mutating HTTP method (`POST`, `PUT`, `PATCH`, `DELETE`).
3. **Clean Onboarding URL Bar:** `?becomeMember=1` is stripped immediately from the browser URL upon processing via `setSearchParams(..., { replace: true })`, preventing re-submission on reload.
4. **Idempotent Membership Claiming:** If a user re-posts `POST /api/trips/:id/membership` for a participant they already have a pending claim for, the API returns `200 OK` with `{ requestId }` without inserting duplicate activity logs.
5. **Single Pending Claim Per User Per Trip:** A user may not have more than one `pending` membership claim in a trip. Submitting a new claim supersedes/rejects any prior pending claim for that user in that trip, enforced at the database level via a partial unique index.
6. **Graceful UI Claim Handling:** In `GuestTrip.tsx`, if the claim endpoint returns 200 or indicates an already-claimed state by the user, the UI remains in the friendly "membership requested" banner state.

---

## 3. Non-Goals

- Deprecating or redesigning device tokens (`did` cookies / SHA-256 hashes): The existing token architecture and `device_participants` mapping work well and remain intact.
- Changing merge proposal mechanics or admin approval workflows: Approving, rejecting, and merging participants already function properly; we are only hardening the request submission and deduplication paths.
- Altering other query parameters or routing flows outside of `becomeMember`.

---

## 4. Anti-Goals

- Breaking health monitoring: `/api/health` must remain fast, simple, and return `{ ok: true }` with 200 without side effects.
- Breaking anonymous/guest workflows: Users who do not sign in must still be identified seamlessly via cookies and `device_participants` across pages and visits.
- Regressing test suites: Helpers like `newDevice()` or existing access tests that expect device cookies or records must remain fully functional.

---

## 5. Detailed Technical Specifications

### Defect 1: Cookie-less Requests & Lazy Device Insertion

#### Affected Files:
* `apps/api/src/app.ts`
* `libs/api/auth/src/device.ts`
* `apps/api/test/helpers.ts` (and related test suites)

#### Changes:
1. **Route Ordering in `apps/api/src/app.ts`:**
   Move `app.get('/api/health', (c) => c.json({ ok: true }))` **before** `app.use('/api/*', deviceMiddleware)`. Health checks must never execute device logic or set cookies.
2. **Lazy Device Insertion in `libs/api/auth/src/device.ts`:**
   * Read incoming cookie: `const cookieDid = getCookie(c, 'did')`.
   * Read restore header: `const restoreHeader = c.req.header('X-Device-Restore')`.
   * **Case A: Existing Cookie or Restore Header:**
     * `id = cookieDid || restoreHeader`.
     * `hash = await sha256Hex(id)`.
     * Query `devices` by `idHash`.
     * If found: update `lastSeenAt` if older than threshold (as currently implemented).
     * If not found (e.g. cookie arrived from client after handshake, or restore header provided): insert into `devices` with `(idHash, createdAt: now, lastSeenAt: now)`.
     * Set `c.set('deviceId', id)` and `c.set('deviceHash', hash)`.
   * **Case B: No Cookie, No Restore Header (Brand New Device):**
     * Generate `id = newToken()`.
     * `hash = await sha256Hex(id)`.
     * Set `c.set('deviceId', id)` and `c.set('deviceHash', hash)`.
     * Set response cookie: `Set-Cookie: did=<id>; Max-Age=34560000; ...` and response header `X-Device-Id: <id>`.
     * **Do NOT insert into `devices` table on safe methods (`GET`, `HEAD`, `OPTIONS`)**.
     * **Exception / Eager write on mutations:** If the incoming method is mutating (`POST`, `PUT`, `PATCH`, `DELETE`), eagerly insert into `devices` table so foreign keys or relationships depending on `device_hash` succeed immediately.
3. **Test Helper Compatibility:**
   * Review `apps/api/test/helpers.ts`: `newDevice()` currently hits `/api/health` to obtain a cookie. Since `/api/health` is exempt from device middleware, update `newDevice()` to hit a lightweight test ping route (or send a handshake request) so tests receive a valid `did` cookie and device record.

---

### Defect 2: URL Cleanup for `?becomeMember=1`

#### Affected Files:
* `libs/web/screens/src/screens/GuestTrip.tsx`

#### Changes:
1. **Search Params Stripping:**
   * In `GuestTrip.tsx`, use `const [searchParams, setSearchParams] = useSearchParams()`.
   * When `becomeMemberParam` is detected, immediately strip the parameter from the URL using `{ replace: true }`:
     ```typescript
     const nextParams = new URLSearchParams(searchParams);
     nextParams.delete('becomeMember');
     setSearchParams(nextParams, { replace: true });
     ```
   * This matches the pattern in `ExpensePay.tsx:85-88` and ensures browser reloads do not retain `?becomeMember=1`.
2. **Resilient Claim Handling:**
   * In the `apiSend('/api/trips/:id/membership', 'POST', ...)` call:
     * Catch `ALREADY_CLAIMED` or handle 200 idempotent responses without displaying unhandled error toasts.
     * Keep `memberRequested = true` so the guest sees `{t('guest.memberRequested')}` banner.

---

### Defect 3: Membership Request Deduplication & Idempotency

#### Affected Files:
* `libs/api/db/src/schema.ts`
* `apps/api/migrations/` (new migration file)
* `apps/api/src/participants/routes.ts`

#### Changes:
1. **Database Schema & Migration:**
   * In `libs/api/db/src/schema.ts`, add a unique partial index on `membership_requests`:
     ```typescript
     uniqueIndex('membership_requests_one_pending_user')
       .on(t.tripId, t.userId)
       .where(sql`${t.status} = 'pending'`),
     ```
   * Create migration `apps/api/migrations/0010_membership_dedup.sql`:
     ```sql
     CREATE UNIQUE INDEX `membership_requests_one_pending_user`
     ON `membership_requests` (`trip_id`, `user_id`)
     WHERE `status` = 'pending';
     ```
2. **Idempotency in `POST /api/trips/:id/membership`:**
   * Before inserting a new request:
     1. Query for an existing pending request on the same participant:
        ```typescript
        const existingClaim = await db.select()
          .from(membershipRequests)
          .where(and(
            eq(membershipRequests.tripId, tripId),
            eq(membershipRequests.participantId, participantId),
            eq(membershipRequests.status, 'pending')
          ))
          .get();
        ```
     2. If `existingClaim` exists:
        - If `existingClaim.userId === user.id`: Return `c.json({ requestId: existingClaim.id }, 200)` immediately (idempotent, no new activity log).
        - If `existingClaim.userId !== user.id`: Throw `new ApiError('ALREADY_CLAIMED', 409, 'Someone already claimed this person, ask the owner')`.
     3. If no existing claim on this participant, but the user has an existing pending claim on *another* participant in this trip:
        - Auto-supersede/cancel the previous pending claim:
          ```typescript
          await db.update(membershipRequests)
            .set({ status: 'rejected' })
            .where(and(
              eq(membershipRequests.tripId, tripId),
              eq(membershipRequests.userId, user.id),
              eq(membershipRequests.status, 'pending')
            ));
          ```
     4. Proceed with insertion of the new claim into `membership_requests`.

---

## 6. What's Left to the Builder

- Exact name and path of the lightweight ping endpoint for test helpers (e.g. `/api/auth/device-ping` or updating `newDevice` in `apps/api/test/helpers.ts`).
- Specific test fixtures and assertions covering:
  - Cookie-less GET `/api/health` does not create rows in `devices`.
  - Cookie-less GET `/api/trips/:id` issues a cookie without creating rows in `devices`.
  - Subsequent request presenting the `did` cookie creates the row in `devices`.
  - Repeated `POST /api/trips/:id/membership` by the same user returns 200 with the existing `requestId`.
  - Claiming a second participant in the same trip supersedes the first pending claim.
  - Reloading `GuestTrip` after `?becomeMember=1` does not fire duplicate network calls.

---

## 7. Verification Plan

1. **Unit & Integration Tests:**
   * Run API test suite: `pnpm --filter @cc/api test`
   * Run Web test suite: `pnpm --filter @cc/web test`
   * Run Workspace typecheck and lint: `pnpm typecheck`
2. **Specific Defect Verification:**
   * Test `/api/health` sends `{ ok: true }` without touching DB.
   * Test cookie handshake flow for devices table.
   * Test membership claim idempotency and unique index enforcement.
   * Test `GuestTrip` search params cleanup.
