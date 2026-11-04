# Merge a Google account with Zalo from Zalo's browser — design

Date: 2026-11-04 · Status: draft for review

## Why

A member who joined a group with **Google** taps a link the admin shared in a Zalo chat (for example the badminton session's payment request). Zalo opens it in its **in-app browser**, where Google blocks sign-in. Today the person has three options, and none is good. They can tap their own name, which only opens the general sign-in sheet. They can read the hint "⋯ → Open in browser…". Or they can join as a stranger. They can't pay as themselves, and the group can end up with a duplicate person.

Success means: tap the link in Zalo, tap your name, sign in with Zalo (one or two taps; confirmed by the owner), and either finish the merge right there or send a merge request. You can pay **this request** immediately. Once the merge is approved, every later link in Zalo opens as you.

## Goals

1. Inside Zalo's browser, tapping a name that belongs to a member with a Google account (and no Zalo login) explains why and leads to Zalo sign-in, with that member in mind.
2. After Zalo sign-in:
   - **A request from that Google account is waiting** for this Zalo login (the existing direction: Google account = survivor, this Zalo account = merged): show it and let the person accept it right there, using the existing accept flow.
   - **Nothing is waiting:** the Zalo account sends a merge request **to** that Google account. The Google account survives and the Zalo account is merged into it.
3. While that request is waiting, the Zalo session can **pay the request it came from** as that member, on a locked screen (below).
4. In a normal browser signed in with Google, the member sees "A Zalo account wants to join yours" and can accept or decline. Accepting merges the Zalo account into the Google one.
5. From Zalo, a clear way to get to the normal browser: an "Open in browser" button where the platform allows it, otherwise the ⋯ → Open in browser instructions.

## Non-goals

- **Signing in with Zalo from a phone's normal browser.** Zalo's web login there needs a phone number + password or a QR scan from a second device, so it's unusable on a phone. This also covers people who set Zalo to open links in the external browser: Google works for them. Desktop QR login keeps working as today. Recorded as a known limitation in the owner's project notes.
- **The Mini App route** ("Link Zalo" in a browser opens the CoinCrew Mini App with a one-time code). Future work, after the Mini App launches.
- Any change to the Zalo Mini App (`platform.kind === 'zmp'`) flow.

## Anti-goals (a failure even if it "works")

- Someone else in the Zalo chat taps your name and gets into your account or sees your group, history or balances without your Google approval.
- The waiting Zalo session can browse anything beyond the one payment request.
- The Zalo account ends up as the survivor, so the member's Google-side groups move into an account they don't control the same way.

## What exists today (build on it)

- `account_merge_requests` (`apps/api/src/db/schema.ts`): `survivorUserId`, `mergedUserId`, `provider`, `providerSub`, `status`, a 7-day `expiresAt`, `otherName`, `identityLabel`, `dismissedAt`.
- `linkIdentity` (`apps/api/src/auth/identity.ts`): when the signed-in user (A) links a login already owned by B, it creates a request with A as survivor. B accepts via `POST /me/merge-requests/:id/accept` (`accountRoutes.ts`). That route checks that B still holds `providerSub`, then calls `mergeUsers` (B into A). Decline (B), cancel (A) and dismiss also exist.
- `/me` returns `mergeRequests: { incoming, outgoing }`. The web side has `MergeRequestBanner`, `MergeConfirmSheet`, `MergeSheet` and `LinkedAccounts`.
- Zalo web OAuth: `/auth/zalo/start?returnTo=&intent=` and `/auth/zalo/callback`.
- In Zalo's browser (`isZaloWebView()`), `SignInButtons` hides Google and shows `signIn.googleInZalo`.
- `WhoAreYou.tsx`: tapping a member row (`fsl-who__row--member`) opens `SignInSheet`.
- The payment request page is `ExpensePay` (`/t/:tripId/expenses/:expenseId/pay`, reached through the `/j/:token` join links). Its feature branch is `feat/guest-expense-pay`.

## The flow

### A. Inside Zalo's browser: tap your name

1. On "Who are you?", the person taps a member row. When we're in Zalo's browser (`isZaloWebView()`, not `zmp`) **and** that member has a Google login but no Zalo login, show a sheet instead of the general sign-in sheet:
   - Title along the lines of: "{name} signs in with Google".
   - Body: "Google doesn't work inside Zalo. Sign in with Zalo, and we'll ask {name}'s Google account to connect it."
   - Primary: "Sign in with Zalo". Secondary: "Open in browser" (see E).

   If the member already has a Zalo login, keep today's behaviour: sign in with Zalo, and you're them.
2. "Sign in with Zalo" goes through `/auth/zalo/start` and remembers the claim: the trip, the tapped participant, and the page to return to (the payment request). It's carried in the OAuth cookies/state like `intent` today, never trusted from the URL alone.
3. On the callback, find or create the Zalo user (as today), start the session, then:
   - **That Zalo user already *is* the member's user** (linked earlier): return to the page. Done.
   - **A pending request already exists** with survivor = the member's user and merged = this Zalo user: return to the page and show the existing accept sheet (`MergeConfirmSheet`).
   - **Otherwise:** create a request in the new direction (see the data section) and return to the page in the **waiting state** (C).

### B. The new request direction

Today only the survivor side can create a request. The merged side accepts. The new case is the opposite: the **merged** side (the Zalo account) creates it, and the **survivor** (the Google account) approves it.

- Store who started it (for example an `initiated_by` column: `survivor` | `merged`, defaulting to `survivor` for existing rows).
- For a merged-initiated request:
  - The survivor accepts and declines, and the merged side can cancel. That's the reverse of today's rules.
  - On accept, check that the merged user still holds the Zalo `providerSub` and the survivor still exists, then run the same `mergeUsers` (Zalo into Google).
  - The accepting session belongs to the survivor already, so the session handling differs from today's accept, which re-points B's session. The builder works this out. The Zalo user's sessions must end up belonging to the survivor (as `mergeUsers` already does for B).
- One pending merged-initiated request per (Zalo user, survivor). A new claim replaces an older pending one from the same Zalo user, like `linkIdentity`'s cancel-then-insert.
- Expiry: 7 days, as today.
- `/me` must show these requests on the right side: the survivor sees them as incoming, the Zalo user as outgoing. The existing banner and sheets are reused with copy for this direction (C, D).

### C. The waiting state in Zalo (pay-only)

While the request is pending, the Zalo session may act as the claimed participant **only on the payment request it came from**.

- The screen shows only that payment: amount, VietQR, bank hand-off, "Tải mã QR" and "I've paid", plus a short status line, "Waiting for {name} to approve in a browser", with the "Open in browser" help.
- **No way out:** no back button, no header navigation, no links to the group, people, activity, other expenses or the account menu. Reloading or reopening the same link lands on the same locked screen.
- The server enforces this, not just the UI. Every other trip route treats this session as a plain signed-in non-member. The rule is scoped to the claimed participant, the trip and that one expense, and only while the request is pending and unexpired.
- "I've paid" records the payment from the claimed participant, but it **never counts on its own while the request is waiting** (owner's decision). It always waits for review, even where the normal rules would count it straight away:
  - The person receiving the money sees it flagged: "Marked by a Zalo account waiting to join {name}". They confirm it once the money arrives, or reject it.
  - If the merge is approved first, the flag goes away and the payment follows the normal rules.
  - If it's declined, cancelled or expires, the payment stays unconfirmed and flagged until the receiver rejects or confirms it.
- Opening a **different** link in Zalo while waiting gives the same locked treatment for that page if it's a payment request for the same participant. Otherwise the person sees "Who are you?" with the waiting status. *(Builder's call: whether other payment requests for the same participant also unlock; default yes, same participant only.)*

### D. Approving in a normal browser (Google)

- Signed in with Google, the member sees a banner (reuse `MergeRequestBanner`): "A Zalo account ({Zalo name}) wants to join your account." Actions: **Review** (opens the confirm sheet: what joins, that the Zalo login becomes a way to sign in) → **Accept** / **Decline**.
- **The Zalo account already has its own history** (other groups, or a separate person in a shared group): this is allowed, but the confirm sheet warns before Accept. It lists the groups that will move over, and names any group where two people will become one, so the member can check before agreeing (owner's decision). A brand-new Zalo account gets no warning.
- Accept runs the merge (B). Afterwards, Linked accounts shows Zalo, and the next link opened in Zalo signs in as the member with no lock.
- Decline closes the request. The Zalo session drops out of the waiting state and becomes a normal non-member.

### E. Getting to a normal browser from Zalo

- "Open in browser" opens the same page outside Zalo when the platform lets us (for example an Android `intent://` URL for Chrome). Otherwise show the steps "Tap ⋯ → Open in browser" (existing copy `signIn.googleInZalo`, adjusted). The builder confirms on a real phone what works on Android and iPhone.

## Constraints

- **UI rules from CLAUDE.md:**
  - shadcn + app wrappers (`Sheet`, `Button`, `InlineError`, …)
  - theme colours only
  - `min-h-11` touch targets
  - copy in both `en.ts` and `vi.ts`
  - keep `fsl-*` classes and `data-testid`s on restyled elements
- **Platform branching:** check `platform.kind === 'zmp'` before the Zalo-browser check (the Mini App's user agent also says Zalo).
- **D1 limits:** at most 100 bound parameters and about 50 queries per invocation. `mergeUsers` already watches its query budget, so the new accept path must not add queries after it.
- New DB columns go in a numbered migration, and existing rows keep today's behaviour.
- **Tests:** API tests for the new direction (create, accept by the survivor, decline, cancel, expiry, stale identity) and for the pay-only scope (allowed on the claimed expense, refused elsewhere). Web tests for the member-row sheet in Zalo's browser and the locked pay screen.

## Left to the builder

- Exact column and route names, and how the claim travels through OAuth.
- How the pay-only permission is represented (derived from the pending request at request time vs. stored on the session).
- How the survivor-side accept handles sessions.
- Exact copy, within the tone above (Vietnamese reviewed by the owner).
- How "Open in browser" works on each platform, after a device check.

## Calls made by me, not the owner (check these)

- The Google account always survives.
- Requests started from Zalo also expire after 7 days.
- The unlock applies only to the payment page the person came from (plus other payment requests for the same participant, as the default).
- "Open in browser" tries a direct hand-off and falls back to instructions.
- The server decides which sheet a member-row tap opens. The picker doesn't reveal which login each member uses.
- Pay-only access belongs to the Zalo account, not the device: any session of that Zalo user gets it while the request is pending. It may undo its own "I've paid" like any payer. Cancel and expiry are treated like decline.
- One Zalo user has one pending claim at a time (a new claim replaces the old). Several Zalo accounts may claim the same member. The member sees each one separately, and accepting one cancels the others.
