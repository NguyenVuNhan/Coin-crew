# Zalo → Google Merge from Zalo's Browser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Per the user's CLAUDE.md, routine tasks go to Gemini Flash through the `gemini-execution` skill. Tasks 3 and 5 (merge and money rules) go to the smarter model, per memory.

**Goal:** Inside Zalo's in-app browser, a member who uses Google can tap their name, sign in with Zalo, and either accept a waiting merge or send a merge request to their Google account. While the request waits, they can pay that payment request on a locked screen. Payments made then always wait for the receiver's review. The Google account approves the request in a normal browser.

**Architecture:** `account_merge_requests` gains a direction (`initiated_by`) and a claim target (trip + participant). The Zalo OAuth callback gets a third intent, `claim`. `buildExpensePayView` gets a third way to resolve the viewer row (`viewer: 'claim'`), derived at request time from a pending, unexpired claim. Payments made through it carry `claim_request_id`, which forces `says_paid` and shows a flag until the merge is accepted. On the web: a claim sheet on "Who are you?", a locked mode in `ExpensePay`, and a "join your account" banner and sheet for the survivor.

**Tech Stack:** Cloudflare Workers + Hono + D1/Drizzle (`apps/api`), React + shadcn/Tailwind v4 (`packages/web-common`), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-04-zalo-google-merge-design.md`

## Global Constraints

- The Google account (the claimed member's user) is always the survivor. The Zalo user is always the one merged into it.
- Claim requests expire after 7 days (`7 * 86400000` ms), like `linkIdentity`.
- One pending claim per Zalo user. A new claim cancels that user's older pending claims. Several Zalo users may claim the same member. Accepting one cancels the other pending claims for that survivor.
- Pay-only access belongs to the Zalo **user** (any of their sessions), only while the claim is `pending` and unexpired. It covers payment requests for the claimed participant in the claimed trip, and nothing else.
- A claim payment is always `says_paid`, whatever `statusForNewPayment` would say.
- The member-row sheet in Zalo's browser is shown for **every** member row (`isZaloWebView() && platform.kind !== 'zmp'`), so it never reveals which login a member uses. The OAuth callback decides what happens.
- D1: at most 100 bound parameters per query and about 50 queries per invocation. Nothing may run a query after `mergeUsers` in the accept route.
- UI: app wrappers (`Sheet`, `Button`, `InlineError`, `Snackbar`), theme colours only, `min-h-11`, `text-base` fields. Copy goes in both `en.ts` and `vi.ts` (Vietnamese lines marked `// REVIEW`). Keep existing `fsl-*` classes and `data-testid`s.
- Check `platform.kind === 'zmp'` before `isZaloWebView()`. The Mini App's flow is unchanged.
- Implementers may add tests but must not edit or delete existing ones.

## Review Focus

1. **A claim for a member who already has a Zalo login** (a different Zalo account) must not create a request. Sign the person in as themselves and return with `claim=taken`. Test in Task 2.
2. **Claim then decline:** the Zalo session immediately loses pay access (pay view `row: null`), and the payment stays `says_paid` with `claimPending: true`. Test in Tasks 3 and 5.
3. **An expired claim** (`expiresAt` in the past) grants nothing and can't be accepted. Test in Tasks 3 and 5.
4. **The claimed person isn't on this expense** (share 0, or they are the expense's payer): the pay view returns `row: null`, never another person's row. Test in Task 5.
5. **A Zalo user who is already a member of the same trip** claims another member. On accept, the two participants in that trip collapse. `/me` lists that trip under `collapsing`, and the merge still succeeds. Test in Tasks 3 and 4.

---

### Task 1: Schema and migration

**Files:**
- Create: `apps/api/migrations/0016_merge_claims.sql`
- Modify: `apps/api/src/db/schema.ts` (`accountMergeRequests`, `transactions`)
- Test: `apps/api/test/migration-0016.test.ts`

**Interfaces:**
- Produces:
  - `accountMergeRequests.initiatedBy: 'survivor' | 'merged'` (column `initiated_by`, not null, default `'survivor'`)
  - `claimTripId: string | null` (`claim_trip_id`)
  - `claimParticipantId: string | null` (`claim_participant_id`)
  - index `account_merge_requests_claim_idx` on (`claim_trip_id`, `claim_participant_id`, `status`)
  - `transactions.claimRequestId: string | null` (`claim_request_id`)

- [ ] **Step 1: Write the failing test.** Follow `migration-0011.test.ts`. Assert that an existing request row reads back `initiated_by = 'survivor'` with null claim columns, and that inserting a transaction with `claim_request_id = 'r1'` round-trips.
- [ ] **Step 2:** Run `npm test -w @fsl/api -- migration-0016`. Expected: FAIL (no such column).
- [ ] **Step 3:** Write the SQL (`ALTER TABLE … ADD COLUMN` ×4 + `CREATE INDEX`) and add the matching Drizzle columns.
- [ ] **Step 4:** Run the same command. Expected: PASS. Then run `npm test -w @fsl/api`. Expected: all green.
- [ ] **Step 5:** Commit with the message `feat(api): merge claim columns`.

### Task 2: Create a claim from the Zalo callback

**Files:**
- Modify: `apps/api/src/auth/identity.ts` (add `requestClaim`)
- Modify: `apps/api/src/auth/routes.ts` (`/auth/zalo/start`, `/auth/zalo/callback`)
- Test: `apps/api/test/zalo-claim.test.ts`

**Interfaces:**
- Consumes: Task 1 columns.
- Produces:
  - `requestClaim(db: Db, zaloUserId: string, claim: { tripId: string; participantId: string }): Promise<ClaimOutcome>`
  - `type ClaimOutcome = { result: 'self' } | { result: 'incoming'; requestId: string } | { result: 'taken' } | { result: 'requested'; requestId: string } | { result: 'invalid' }`
  - `/auth/zalo/start?intent=claim&trip=<id>&pid=<pid>&returnTo=…` stores the cookie `zalo_oauth_claim` (`JSON {tripId, participantId}`, same options as the other `zalo_oauth_*` cookies). `clearOauthCookies` clears it.
  - The callback with intent `claim` always signs in the Zalo user (as `signin` does today), then redirects to `returnTo` with `claim=<self|incoming|taken|requested|invalid>`.

Outcome rules, in order:
1. Participant not found in the trip, not `active`, or `userId` null → `invalid`.
2. Participant's `userId === zaloUserId` → `self`.
3. A pending, unexpired request with survivor = participant's user, merged = Zalo user, `initiatedBy = 'survivor'` exists → `incoming` (its id).
4. Participant's user has a `zaloSub` → `taken`.
5. Otherwise, in one `db.batch`: cancel the Zalo user's pending `initiatedBy='merged'` requests, then insert:
   - `initiatedBy: 'merged'`, `provider: 'zalo'`, `providerSub` = the Zalo user's `zaloSub`
   - `survivorUserId` = the participant's user, `mergedUserId` = `zaloUserId`
   - `claimTripId`, `claimParticipantId`
   - `otherName` = the survivor's name, `identityLabel` = the Zalo user's `zaloName ?? name`
   - 7-day expiry
   
   The result is `requested`.

- [ ] **Step 1: Write the failing tests** in `zalo-claim.test.ts`, one per outcome. Use the existing Zalo OAuth mocking from `zalo-auth.test.ts`.
  - `claim=requested` sets a session cookie for the Zalo user and creates exactly one pending row with the fields above.
  - A second claim by the same Zalo user for another member leaves the first row `cancelled`.
  - Two different Zalo users claiming the same member leave two pending rows.
  - `taken` creates no row. `invalid` for a guest participant (null `userId`).
- [ ] **Step 2:** Run `npm test -w @fsl/api -- zalo-claim`. Expected: FAIL.
- [ ] **Step 3:** Implement `requestClaim` and the `claim` intent. Read the claim from the cookie only, never from callback query params.
- [ ] **Step 4:** Run the same command, then `npm test -w @fsl/api -- zalo-auth`. Expected: PASS.
- [ ] **Step 5:** Commit with the message `feat(api): claim a member from Zalo sign-in`.

### Task 3: Accept, decline and cancel claims (smarter model)

**Files:**
- Modify: `apps/api/src/auth/accountRoutes.ts` (accept, `closeRequest`)
- Modify: `apps/api/src/auth/mergeUsers.ts` (phase-1 batch)
- Test: `apps/api/test/merge-claim.test.ts`

**Interfaces:**
- Consumes: Task 1 and Task 2 rows.
- Produces: the same routes, now direction-aware:
  - **Accept:** `POST /me/merge-requests/:id/accept` is allowed when (`initiatedBy='survivor'` and user = merged) **or** (`initiatedBy='merged'` and user = survivor). For `merged`, the stale check is that the merged user still has `zaloSub === providerSub` and the survivor still exists. It responds `{ user }` for the survivor.
  - **Decline:** `/decline` closes on the side that must approve (merged for `survivor`-initiated, survivor for `merged`-initiated).
  - **Cancel:** `/cancel` closes on the side that started it.
  - **Inside `mergeUsers` phase 1** (same batch, no extra round trip):
    - `UPDATE transactions SET claim_request_id = NULL WHERE claim_request_id = request.id`
    - cancel the other pending `initiatedBy='merged'` requests with the same `survivorUserId`

- [ ] **Step 1: Write the failing tests.**
  - The survivor accepts a claim. The Zalo user's participants and sessions now belong to the survivor, and the survivor has the Zalo `zaloSub`.
  - The Zalo user can't accept their own claim (404). The survivor can decline it, and the Zalo user can cancel it.
  - An expired claim gets 404 on accept.
  - A claim where the Zalo user is already in the claimed trip as another participant merges, and leaves one active participant there.
  - Accepting one claim cancels a second Zalo user's claim on the same survivor.
  - A claim payment (insert one with `claim_request_id`) has a null `claim_request_id` after accept.
  - All existing `merge-*.test.ts` files still pass unchanged.
- [ ] **Step 2:** Run `npm test -w @fsl/api -- merge-claim`. Expected: FAIL.
- [ ] **Step 3:** Implement. Keep the "no query after `mergeUsers`" rule.
- [ ] **Step 4:** Run `npm test -w @fsl/api`. Expected: all green.
- [ ] **Step 5:** Commit with the message `feat(api): approve Zalo claims from the Google account`.

### Task 4: `/me` shows claims on both sides

**Files:**
- Modify: `packages/core/src/api-types.ts`
- Modify: `apps/api/src/auth/me.ts`
- Test: `apps/api/test/me-claims.test.ts`

**Interfaces:**
- Produces, in `MeResponse.mergeRequests`:
  - `joining: JoiningMergeRequest[]` for the survivor: pending, unexpired `merged`-initiated requests. These are excluded from `incoming` and `outgoing`.
  - `claim: ClaimStatus | null` for the Zalo user: their pending, unexpired claim.

```ts
export interface JoiningMergeRequest {
  id: string;
  expiresAt: string;
  zalo: { name: string; avatarUrl: string | null };
  /** Groups the Zalo account is an active member of; empty for a brand-new account. */
  groups: { tripId: string; name: string }[];
  /** Groups both accounts are in: their two people become one. */
  collapsing: { tripId: string; name: string; zaloPersonName: string; yourPersonName: string }[];
}
export interface ClaimStatus { id: string; tripId: string; participantId: string; name: string; expiresAt: string }
```

  The web hook `useMe` (`packages/web-common/src/api/hooks.ts:138`) defaults both fields (`joining: []`, `claim: null`) for older servers.

- [ ] **Step 1: Write the failing tests.**
  - The survivor sees one `joining` entry with `groups: []` for a new Zalo user.
  - Given a Zalo user in trip T as "Nhân Z" while the survivor is "Nhân", `collapsing` names both.
  - The Zalo user sees `claim` with the participant's name.
  - Expired and declined claims appear on neither side. Existing `me.test.ts` passes.
- [ ] **Step 2:** Run `npm test -w @fsl/api -- me-claims`. Expected: FAIL.
- [ ] **Step 3:** Implement with at most 3 extra queries, using `inArray` over the request ids.
- [ ] **Step 4:** Run `npm test -w @fsl/api && npm test -w @fsl/web-common -- hooks`. Expected: PASS.
- [ ] **Step 5:** Commit with the message `feat(api): claim status in /me`.

### Task 5: Pay as the claimed person (smarter model)

**Files:**
- Create: `apps/api/src/expenses/claimGrant.ts`
- Modify: `apps/api/src/expenses/payView.ts`, `apps/api/src/trips/snapshot.ts`, `packages/core/src/api-types.ts`
- Test: `apps/api/test/expense-pay-claim.test.ts`

**Interfaces:**
- Consumes: Task 1 columns, Task 2 rows.
- Produces:
  - `getClaimGrant(db: Db, userId: string | null, tripId: string): Promise<{ requestId: string; participantId: string } | null>`: the pending, unexpired `merged`-initiated request whose `mergedUserId = userId` and `claimTripId = tripId`.
  - `PaidBy` stays as it is. `ExpensePayView.viewer` becomes `PaidBy | 'claim'`.
  - `ExpensePayView` gets `claim?: { name: string; expiresAt: string }` when `viewer === 'claim'`.
  - The snapshot payment type and `ExpensePayView.paid[]` get `claimPending?: true` when `claim_request_id` is not null.

Rules:
- In `buildExpensePayView`, try the claim grant **after** self and friend. It applies only when the claimed participant isn't the payer and has a share above 0.
- In `pay-report` with `viewer === 'claim'`:
  - `paidBy` is forced to `'self'` and `status` to `'says_paid'`.
  - `insertPayment` gets `claimRequestId` (add an optional field). `createdByParticipantId` is the claimed participant, and `actorUserId` is the Zalo user.
- Any other trip route sees this session as a non-member, which `resolveActor` already does. Add a test that proves it.

- [ ] **Step 1: Write the failing tests.**
  - The Zalo user with a pending claim on Minh gets `viewer: 'claim'` and Minh's row on an expense Minh shares.
  - On an expense Minh doesn't share, or where Minh is the payer, they get `row: null`.
  - `pay-report` creates `says_paid` with `claimRequestId` set, even when the receiver is a guest (where the normal rule would be `confirmed`).
  - After decline or expiry, the pay view returns `row: null`, and the earlier payment shows `claimPending: true` in `GET /trips/:id`.
  - `GET /trips/:id/people` returns the viewer treatment, not member data.
- [ ] **Step 2:** Run `npm test -w @fsl/api -- expense-pay-claim`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test -w @fsl/api`. Expected: all green, including the `expense-pay-*` tests.
- [ ] **Step 5:** Commit with the message `feat(api): pay a request while a Zalo claim waits`.

### Task 6: Claim sheet on "Who are you?" and the open-in-browser helper

**Files:**
- Create: `packages/web-common/src/components/ClaimSheet.tsx`
- Create: `packages/web-common/src/lib/openInBrowser.ts`
- Modify: `packages/web-common/src/screens/WhoAreYou.tsx` (member row, ~line 550), `packages/web-common/src/components/SignInButtons.tsx` (`signInHref`), `i18n/en.ts`, `i18n/vi.ts`
- Test: `packages/web-common/src/components/__tests__/claim-sheet.test.tsx`, `packages/web-common/src/lib/__tests__/open-in-browser.test.ts`

**Interfaces:**
- Produces:
  - `signInHref(provider, returnTo, intent?, claim?: { tripId: string; participantId: string }): string`, which adds `intent=claim&trip=&pid=`.
  - `<ClaimSheet open name tripId participantId returnTo onClose />`, a `Sheet` with `data-testid="claim-sheet"`.
  - `browserUrl(url: string, ua?: string): string | null`: on Android it returns `intent://<host><path>#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=<encoded url>;end`, otherwise `null`.
  - Copy keys:
    - `claim.title`: "Continue as {name}"
    - `claim.body`: "Google doesn't work inside Zalo. Sign in with Zalo to continue. If {name} uses Google, their Google account will be asked to approve."
    - `claim.zalo`: "Sign in with Zalo"
    - `claim.openBrowser`: "Open in browser"
    - `claim.browserSteps`: "Tap ⋯ → Open in browser"

- [ ] **Step 1: Write the failing tests.**
  - With the user agent stubbed to Zalo and `platform.kind` `web`, tapping a `fsl-who__row--member` row opens `claim-sheet`, whose Zalo button links to `/api/auth/zalo/start?…intent=claim&trip=T&pid=P…`.
  - With `zmp`, there's no claim sheet.
  - Outside Zalo, today's `SignInSheet` opens.
  - `browserUrl` returns an `intent://` URL for an Android UA and `null` for iPhone.
- [ ] **Step 2:** Run `npm test -w @fsl/web-common -- claim-sheet open-in-browser`. Expected: FAIL.
- [ ] **Step 3:** Implement. When `browserUrl` returns `null`, "Open in browser" shows `claim.browserSteps` instead of a link.
- [ ] **Step 4:** Run `npm test -w @fsl/web-common`. Expected: all green, including `style-guard`.
- [ ] **Step 5:** Commit with the message `feat(web): claim your name from Zalo's browser`.

### Task 7: Locked pay screen and return handling

**Files:**
- Modify: `packages/web-common/src/screens/ExpensePay.tsx`, `packages/web-common/src/screens/WhoAreYou.tsx`, `i18n/en.ts`, `i18n/vi.ts`
- Test: `packages/web-common/src/screens/__tests__/expense-pay-claim.test.tsx`

**Interfaces:**
- Consumes: Task 4 `me.mergeRequests.claim`, Task 5 `viewer: 'claim'`, Task 6 `ClaimSheet`/`browserUrl`.
- Produces:
  - **Locked screen:** when `v.viewer === 'claim'`, `ExpensePay` renders `<Screen>` without `onBack`, with no header links and no account menu (`data-testid="pay-locked"`). It shows a status line, `claim.waiting`: "Waiting for {name} to approve in a browser", plus the open-in-browser help.
  - **Pay controls:** the "paid by a friend" option is hidden. The rest of the pay UI is unchanged.
  - **Return query param `claim`:**
    - `incoming` opens the existing `MergeConfirmSheet` for that request.
    - `taken` shows `claim.taken` inline: "{name} already signs in with a different Zalo account".
    - `invalid` shows a generic `InlineError`.
  - **"Who are you?" while waiting:** when `me.mergeRequests.claim` is set and the page isn't a claim pay view, a banner `claim.waitingWho` shows the status.

- [ ] **Step 1: Write the failing tests.**
  - `viewer: 'claim'` renders `pay-locked` with no back button (query `fsl-screen__back` is absent) and the waiting text.
  - `?claim=incoming` opens the merge confirm sheet.
  - `?claim=taken` shows the taken message.
  - The existing `expense-pay.test.tsx` passes.
- [ ] **Step 2:** Run `npm test -w @fsl/web-common -- expense-pay-claim`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test -w @fsl/web-common`. Expected: all green.
- [ ] **Step 5:** Commit with the message `feat(web): locked pay screen while a Zalo claim waits`.

### Task 8: The survivor approves, and receivers see the flag

**Files:**
- Create: `packages/web-common/src/components/JoinRequestSheet.tsx`
- Modify: `packages/web-common/src/components/MergeRequestBanner.tsx`, `AccountMenu.tsx`, `screens/MyTrips.tsx`, the payment row and confirm UI that renders `says_paid` payments, `i18n/en.ts`, `i18n/vi.ts`
- Test: `packages/web-common/src/components/__tests__/join-request-sheet.test.tsx`

**Interfaces:**
- Consumes: Task 3 routes, Task 4 `joining`, Task 5 `claimPending`.
- Produces:
  - **Banner:** shown for each `joining` entry, with the text `join.banner`: "A Zalo account ({name}) wants to join your account".
  - **`JoinRequestSheet`** (`data-testid="join-request-sheet"`):
    - The Zalo name and avatar.
    - When `groups` isn't empty, a warning listing those groups (`join.groupsMove`), plus one line per `collapsing` entry (`join.collapse`: "In {group}, {zaloPersonName} and {yourPersonName} become one person").
    - Accept calls `/accept`, refetches `me`, and shows a `Snackbar`. Decline calls `/decline`.
  - **Payment flag:** any `says_paid` payment with `claimPending` shows `claim.paymentFlag`: "Marked by a Zalo account waiting to join {name}", where it's listed for the receiver.

- [ ] **Step 1: Write the failing tests.**
  - With one `joining` entry and empty groups, there's no warning, and Accept posts to `/api/me/merge-requests/<id>/accept`.
  - With `collapsing`, the collapse line is shown.
  - A payment row with `claimPending` shows the flag text.
- [ ] **Step 2:** Run `npm test -w @fsl/web-common -- join-request-sheet`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test -w @fsl/web-common && npm run typecheck`. Expected: all green.
- [ ] **Step 5:** Commit with the message `feat(web): approve a Zalo account joining yours`.

### Task 9: Device check (owner + planner, not delegated)

- [ ] Run `npm run tunnel`. In the "Coin crew Test" Zalo group only, open a payment link. Check each case:
  - Tap a Google member's name → sign in with Zalo → locked pay screen → "I've paid".
  - Approve in Chrome with Google → the next Zalo link opens unlocked as the member.
  - "Open in browser" on Android (the `intent://` URL) and on iPhone (the steps text).
- [ ] Record the device findings in the project notes.
