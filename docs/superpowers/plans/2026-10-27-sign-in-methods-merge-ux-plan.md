# Sign-in methods and account merge UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "Cách đăng nhập" a set of provider cards with official logos, where every merge in progress lives on its provider's card as a chip that opens a step-by-step sheet, and confirming a merge takes four taps on one device.

**Architecture:**
- **API:** additive migration `0007` adds the Zalo name to users, and the other account's name, verified login and a dismiss time to merge requests. `/api/me` then returns at most one outgoing request per provider, plus the Zalo name, and a new dismiss route clears finished requests.
- **Web:** a shared `ProviderLogo` component, a new `MergeSheet`, a card-based `LinkedAccounts`, and a `mergeReview` hand-off on `MyTrips` that auto-opens the existing confirmation sheet.

**Tech Stack:** Cloudflare Workers + Hono, D1 + Drizzle, React 19, React Router, TanStack Query v5, Vitest (Workers pool for the API, jsdom for the web), npm workspaces (`@fsl/core`, `@fsl/api`, `@fsl/web`).

**Spec:** `docs/superpowers/specs/2026-10-27-sign-in-methods-merge-ux-design.md` (read it with this plan; it wins on any conflict). Base spec: `docs/superpowers/specs/2026-10-20-zalo-oauth-webview-og-design.md` §4.5.

**Branch:** `feat/zalo-oauth-webview-og` (PR 14). Work in place.

## Global Constraints

- No new npm dependencies.
- Migration `0007_merge_ux.sql` is additive only (`ALTER TABLE … ADD COLUMN`); never edit `0006_zalo_oauth.sql`.
- Styles use the tokens in `tokens.css`. No raw hex values in components, except the brand colours inside the official logo SVGs in `ProviderLogo.tsx`.
- Every interactive control is a tap target of at least 44px.
- `en.ts` and `vi.ts` keep the same keys. Every new or changed `vi.ts` line ends with `// REVIEW`. Copy is exactly as in spec §3.8.
- Brand artwork is copied from official sources, never redrawn. Each source URL is cited in a comment in `ProviderLogo.tsx`.
- `OutgoingMergeRequest.otherName`, `OutgoingMergeRequest.identityLabel` and `MeUserView.zaloName` are optional in `@fsl/core`, so existing fixtures still type-check. The API always sends them, and `useMe` fills in defaults.
- Harness (`~/.claude/harness/HARNESS.md`):
  - Gemini 3.8 Flash runs through `agy-exec.sh` with `AGY_ALLOW` set to exact paths. It writes **new** test files first, plus the components marked "Gemini screen/small build". It never edits existing tests, never runs tests and never commits.
  - Claude implementers write the migration, the contract, server rules and edits under 40 lines.
  - **Existing tests are edited only by the controller**; each task lists the edits.
  - Any `HARNESS-REJECT` → roll back with `agy-restore.sh`.
- Verify each task with `npm run typecheck` and the suite it touches: `npm run test -w @fsl/api` or `npm run test -w @fsl/web`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **`mergeReview` arrives before `/api/me` has loaded.** The user just signed in, so `/api/me` is still loading. Expected: no "no request" snackbar while it's loading, and the sheet opens once the data arrives. Test in Task 8.
2. **Both providers in a merge state at once** (Google pending and Zalo declined). Expected: each card shows its own chip and opens its own request's sheet. Test in Task 7.
3. **A pending Zalo merge viewed inside the Zalo app.** Expected: the confirm button stays, because Zalo sign-in works there. Only a pending Google merge gets the open-in-browser hint. Test in Task 6.
4. **A double tap on "Huỷ yêu cầu" or "Đã hiểu".** Expected: one request in flight, with the button loading and disabled until it settles. Test in Task 6.
5. **A very long Zalo name or email.** Expected: the identity line truncates with an ellipsis, keeps the full text in `title`, and never pushes the buttons out of the card. Test in Task 7.

---

### Task 1: Migration 0007, schema, contract, and `zaloName` in `/api/me`

**Lane:** Gemini writes the new test file; Claude writes the migration, schema, types and `toMeUserView`.

**Files:**
- Create: `apps/api/migrations/0007_merge_ux.sql`
- Modify: `apps/api/src/db/schema.ts`, `packages/core/src/api-types.ts`, `apps/api/src/auth/me.ts` (`toMeUserView`)
- Test (new): `apps/api/test/migration-0007.test.ts`

**Interfaces:**
- Produces:
  - Drizzle columns `users.zaloName` (`zalo_name`) and `accountMergeRequests.otherName` (`other_name`), `.identityLabel` (`identity_label`), `.dismissedAt` (`dismissed_at`), all nullable text.
  - `MeUserView.zaloName?: string | null`.
  - `OutgoingMergeRequest.otherName?: string` and `.identityLabel?: string`.
  - `toMeUserView(user)` returns `zaloName: user.zaloName ?? null`.

- [ ] **Step 1: Write the failing test** `migration-0007.test.ts`:
  - `it('adds zalo_name to users')`: `PRAGMA table_info(users)` has a `zalo_name` row with `notnull === 0`.
  - `it('adds other_name, identity_label and dismissed_at to account_merge_requests')`: the same check for each of the three columns.
  - `it('returns zaloName in /api/me')`: seed a Zalo-only user with `zalo_name = 'Noah Zalo'` and a session (`memberSid` pattern from `test/helpers.ts`). Then `(await json(call('/api/me', { headers: { Cookie: 'sid=…' } }))).user.zaloName === 'Noah Zalo'`, and a Google-only user gets `zaloName === null`.
- [ ] **Step 2: Run** `npm run test -w @fsl/api -- test/migration-0007.test.ts`. Expected: FAIL (no such column).
- [ ] **Step 3: Implement** the four `ALTER TABLE` statements exactly as in spec §3.5, the matching schema columns, the optional contract fields (with the spec's doc comments), and `zaloName` in `toMeUserView`.
- [ ] **Step 4: Run** the new file, then the whole API suite and `npm run typecheck`. Expected: all PASS.
- [ ] **Step 5: Commit** `feat(api): migration 0007 for the Zalo name and merge request details`.

### Task 2: Keep `users.zalo_name` current

**Lane:** Gemini writes the new test file; Claude implements (under 40 lines across four files).

**Files:**
- Modify: `apps/api/src/auth/identity.ts` (`upsertIdentity`, `linkIdentity`), `apps/api/src/auth/accountRoutes.ts` (unlink), `apps/api/src/auth/mergeUsers.ts` (`mergedUserFields`)
- Test (new): `apps/api/test/zalo-name.test.ts`. Copy `mockZaloFetch`, `mockGoogleToken` and the `linkZalo` flow helper from `apps/api/test/link-identity.test.ts`.

**Interfaces:**
- Consumes: `users.zaloName` (Task 1).
- Produces: `zalo_name` always equals the verified Zalo profile `name` of the account's current `zalo_sub`, or null when there's no `zalo_sub`.

- [ ] **Step 1: Write the failing tests:**
  - `it('stores the Zalo name on a first Zalo sign-in')`: profile `{ id: 'z-1', name: 'Noah Zalo' }`; then `users.zalo_name === 'Noah Zalo'`.
  - `it('refreshes the Zalo name on a later sign-in without changing an edited name')`: the user has `custom_profile = 1, name = 'Minh tự đặt'`; sign in with `name: 'Noah Mới'`; then `zalo_name === 'Noah Mới'` and `name === 'Minh tự đặt'`.
  - `it('sets the Zalo name when linking and changing Zalo')`: a Google user links `z-2` named 'Zalo A', then changes to `z-3` named 'Zalo B'; `zalo_name` is 'Zalo A', then 'Zalo B'.
  - `it('clears the Zalo name on unlink')`: a Google + Zalo user; `DELETE /api/me/identities/zalo` returns 200, then `zalo_name === null`.
  - `it('keeps the Zalo name that goes with the surviving zalo_sub after a merge')`. Two cases:
    - (a) the provider is Zalo: survivor A gets B's `zalo_name`;
    - (b) the provider is Google and A already has Zalo: A keeps its own `zalo_name`.

    Build the merge with the `merge-users.test.ts` fixture style and accept as B.
- [ ] **Step 2: Run** `npm run test -w @fsl/api -- test/zalo-name.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement:**
  - **`upsertIdentity`:** for `provider === 'zalo'`, set `zaloName: profile.name` on insert and in the existing-user `updates`, independent of `customProfile`.
  - **`linkIdentity`:** in the "unused" branch, add `zaloName: profile.name` when the provider is Zalo.
  - **Unlink route:** `set({ zaloSub: null, zaloName: null })`.
  - **`mergedUserFields`:** `zaloName: provider === 'zalo' ? b.zaloName : (a.zaloSub != null ? a.zaloName : b.zaloName)`.
- [ ] **Step 4: Run** the new file and the whole API suite. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): keep the Zalo name current on sign-in, link, unlink and merge`.

### Task 3: Merge request details, one open request per provider, outgoing selection

**Lane:** Gemini writes the new test file; implementation is a Gemini small build (`identity.ts`, `me.ts`, about 60 lines) with Claude review, or Claude if it fails twice.

**Files:**
- Modify: `apps/api/src/auth/identity.ts` (`linkIdentity`, "belongs to B" branch), `apps/api/src/auth/me.ts` (`buildMeResponse` outgoing)
- Test (new): `apps/api/test/merge-outgoing.test.ts`
- **Controller edit (existing test):** `apps/api/test/me.test.ts:134-140`. It expects the pending **and** declined Zalo requests. Under spec §3.5 only the newest Zalo request is returned, so change it to expect length 1, holding the fixture's request with the latest `created_at`.

**Interfaces:**
- Consumes: the `accountMergeRequests.otherName`, `.identityLabel` and `.dismissedAt` columns (Task 1).
- Produces: each `/api/me` `mergeRequests.outgoing` item has string `otherName` and `identityLabel`; at most one item per `provider`.

- [ ] **Step 1: Write the failing tests:**
  - `it('saves the other account name and the verified login on a new request')`:
    - Zalo case: B named 'Noah Nguyen' owns `z-9`, whose Zalo profile name is 'Noah Zalo'; A links `z-9`; the row has `other_name === 'Noah Nguyen'` and `identity_label === 'Noah Zalo'`;
    - Google case: `identity_label` is the verified email.
  - `it('cancels the other pending requests for the same provider only')`:
    - setup: A has a pending Zalo request to B1 and a pending Google request to B2, then links a Zalo owned by B3;
    - the B1 request is `cancelled`, the B2 one stays `pending`, and the new one is `pending`.
  - `it('returns the newest request per provider')`:
    - setup: Zalo `declined` (older) and Zalo `pending` (newer), plus Google `accepted`;
    - `outgoing` has length 2, holding the pending Zalo request and the accepted Google one.
  - `it('leaves out dismissed and expired requests')`.
  - `it('falls back for requests without saved details')`:
    - `other_name` and `identity_label` are null while B still exists: `otherName === B.name`, `identityLabel === 'Zalo'`;
    - B deleted: `otherName === 'Zalo'`.
  - `it('keeps mergeReview in the return address')`: `safeReturnTo('/trips?mergeReview=mr-1') === '/trips?mergeReview=mr-1'`, with `safeReturnTo` imported from `../src/auth/routes`. It should already pass; it pins the hand-off in Task 8.
- [ ] **Step 2: Run** the new file. Expected: FAIL.
- [ ] **Step 3: Implement:**
  - **`linkIdentity` "belongs to B":** in one `db.batch([...])`, cancel every `pending` request with `survivorUserId = userId AND provider = provider`, then insert the new request with `otherName: owner.name` and `identityLabel` (`provider === 'google' ? profile.email ?? profile.name : profile.name`).
  - **`buildMeResponse`:** select the outgoing requests with `dismissedAt IS NULL`, the existing status and expiry filters, and a `leftJoin(users, users.id = mergedUserId)` for the current name; order by `createdAt` descending; keep the first per provider in code.
  - **Fallbacks:**
    - `otherName = r.otherName ?? r.mergedName ?? providerLabel`;
    - `identityLabel = r.identityLabel ?? providerLabel`;
    - `providerLabel` is `'Google'` or `'Zalo'`.
- [ ] **Step 4: Controller** makes the `me.test.ts` edit above. **Run** the whole API suite and typecheck. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): name the other account on merge requests and keep one per provider`.

### Task 4: Dismiss route

**Lane:** Gemini writes the new test file; Claude implements (under 40 lines).

**Files:**
- Modify: `apps/api/src/auth/accountRoutes.ts`
- Test (new): `apps/api/test/merge-dismiss.test.ts`

**Interfaces:**
- Consumes: `accountMergeRequests.dismissedAt` (Task 1).
- Produces: `POST /api/me/merge-requests/:id/dismiss`. It returns 204 for the signed-in survivor's `accepted` or `declined` request that isn't yet dismissed, and 404 otherwise.

- [ ] **Step 1: Write the failing tests:**
  - `it('dismisses a declined request')`: 204; then `dismissed_at` is set and `/api/me` outgoing no longer lists it.
  - `it('dismisses an accepted request')`: 204.
  - `it('refuses a pending request')`: 404.
  - `it('refuses another account’s request')`: 404, and the row is unchanged.
  - `it('refuses an already dismissed or unknown request')`: 404 for both.
- [ ] **Step 2: Run** the new file. Expected: FAIL (404 for every case, because the route doesn't exist).
- [ ] **Step 3: Implement** the route with `requireUser`: an `update … set({ dismissedAt: nowIso() }) where id AND survivorUserId = user.id AND status IN ('accepted','declined') AND dismissedAt IS NULL`, with `.returning`. Empty → `ApiError('NOT_FOUND', 404)`; else 204.
- [ ] **Step 4: Run** the API suite. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): let the account that started a merge dismiss a finished request`.

### Task 5: Official logos on every sign-in button

**Lane:**
- **Controller, before dispatch:** obtain the official artwork.
  - **Google:** the standard "G" SVG from Google's sign-in branding assets (https://developers.google.com/identity/branding-guidelines).
  - **Zalo:** the official Zalo logo SVG from Zalo's own brand resources.

  Put both files in the brief. If no official Zalo SVG exists, stop and ask the owner for the brand file.
- Gemini writes the new test files and builds `ProviderLogo` (screen lane, small); Claude edits `SignInButtons` and `icons.tsx`.

**Files:**
- Create: `apps/web/src/components/ProviderLogo.tsx`, `apps/web/src/components/ProviderLogo.css`
- Modify: `apps/web/src/components/SignInButtons.tsx`, `apps/web/src/components/SignInButtons.css`, `apps/web/src/components/icons.tsx` (remove the `zalo` entry from `IconName` and its glyph; add `swap`, a stroke-style left-right arrows icon like Lucide `arrow-left-right`)
- Test (new): `apps/web/src/components/__tests__/provider-logo.test.tsx`, `apps/web/src/components/__tests__/sign-in-buttons-logos.test.tsx`

**Interfaces:**
- Produces:
  - `ProviderLogo({ provider, size = 20, muted = false }: { provider: AuthProvider; size?: number; muted?: boolean })` renders an `<svg aria-hidden="true" data-provider={provider} class="fsl-provider-logo[ fsl-provider-logo--muted]" width={size} height={size}>`.
  - `providerName(provider: AuthProvider): 'Google' | 'Zalo'`, exported from the same file.
  - `IconName` gains `'swap'` and loses `'zalo'`.

- [ ] **Step 1: Write the failing tests:**
  - **provider-logo:**
    - each provider renders an `svg[data-provider]` with `aria-hidden="true"` and the given `size`;
    - `muted` adds `fsl-provider-logo--muted`;
    - `providerName('zalo') === 'Zalo'`.
  - **sign-in-buttons-logos:** with `signIn.zalo: true`, layout `stack`:
    - the Google link holds `svg[data-provider="google"]` inside `.fsl-signin__logo-tile` (the white 28px square);
    - the Zalo link holds `svg[data-provider="zalo"]` with no tile;
    - with `layout="inline"`, the Google logo still renders;
    - inside Zalo (`ZALO_UA` stub as in `linked-accounts.test.tsx`), the Zalo button keeps its logo.
- [ ] **Step 2: Run** `npm run test -w @fsl/web -- provider-logo sign-in-buttons-logos`. Expected: FAIL.
- [ ] **Step 3: Implement:**
  - **`ProviderLogo`:** Gemini small build from the official artwork in the brief. The brand colours stay inside the SVG. The CSS defines `.fsl-provider-logo--muted { filter: grayscale(1); opacity: 0.45; }`.
  - **`SignInButtons`:** Claude edit. The Google button starts with `<span className="fsl-signin__logo-tile"><ProviderLogo provider="google" /></span>`; the tile is white, 28px, `--radius-sm`, centred. The Zalo button uses `<ProviderLogo provider="zalo" />` in place of `<Icon name="zalo" />`.
- [ ] **Step 4: Run** the web suite and typecheck. Expected: PASS. The existing sign-in tests still find buttons by their text, because the logos are `aria-hidden`.
- [ ] **Step 5: Commit** `feat(web): official Google and Zalo logos on every sign-in button`.

### Task 6: Merge sheet

**Lane:**
- Gemini writes the new test file and builds `MergeSheet` (screen lane). The controller writes the screen spec from spec §3.3 and §3.6.
- Claude adds `formatExpiry` and the `merge.*` copy from spec §3.8.

**Files:**
- Create: `apps/web/src/components/MergeSheet.tsx`, `apps/web/src/components/MergeSheet.css`
- Modify: `apps/web/src/lib/time.ts` (add `formatExpiry`), `apps/web/src/i18n/en.ts`, `apps/web/src/i18n/vi.ts` (add the `merge.*` keys for the sheet from spec §3.8: `sheetTitle`, `sheetIntro`, `step1`, `step2Pending`, `step2Help`, `step2Declined`, `step2Accepted`, `step3`, `declinedHelp`, `acceptedSummary`, `confirmHere`, `switchNote`, `cancelRequest`, `linkAgain`, `gotIt`)
- Test (new): `apps/web/src/components/__tests__/merge-sheet.test.tsx`, `apps/web/src/lib/__tests__/format-expiry.test.ts`

**Interfaces:**
- Consumes: `OutgoingMergeRequest` with `otherName` and `identityLabel` (Task 1); `POST …/cancel` (existing) and `POST …/dismiss` (Task 4); `providerName` (Task 5); `signInHref(provider, returnTo, intent?)` from `SignInButtons`.
- Produces:
  - `MergeSheet({ request, open, onClose }: { request: OutgoingMergeRequest; open: boolean; onClose: () => void })`;
  - `formatExpiry(iso: string): string`, returning "dd/MM" in `Asia/Ho_Chi_Minh`.

- [ ] **Step 1: Write the failing tests:**
  - **format-expiry:** `formatExpiry('2026-11-02T18:00:00.000Z') === '03/11'`.
  - **merge-sheet**, with `request = { id: 'mr-1', provider: 'zalo', status, expiresAt: '2026-11-02T18:00:00.000Z', otherName: 'Noah Nguyen', identityLabel: 'Noah Zalo' }`:
    - **pending:**
      - dialog title 'Merge with Noah Nguyen's account';
      - the steps list has three items, and the second has `aria-current="step"` and contains 'Expires 03/11';
      - the link 'Sign in with Zalo to confirm' has `href === '/api/auth/zalo/start?returnTo=%2Ftrips%3FmergeReview%3Dmr-1'`;
      - the switch note text is present;
      - the 'Cancel request' button is present.
    - **declined:** step 2 'Noah Nguyen declined the merge'; the 'Got it' button is present. Rendered at route `/trips`, the 'Link again' link has `href === signInHref('zalo', '/trips', 'link')`. Its return address is the current `useLocation().pathname`, as `LinkedAccounts` does for Link and Change.
    - **accepted:** three done steps, the summary text, and only the 'Got it' button.
    - **cancel:** POST `/api/me/merge-requests/mr-1/cancel`, then `onClose` is called and `/api/me` is fetched again.
    - **dismiss:** the same, for `/dismiss`.
    - **404:** the cancel answers 404 `NOT_FOUND`; `onClose` is called and no alert is shown.
    - **500:** the dismiss answers 500; an alert is shown and `onClose` is not called.
    - **Review Focus 4:**
      - while the cancel request is in flight, the 'Cancel request' button is disabled;
      - a second click sends no second POST, so the mock records one call.
    - **Review Focus 3 (Zalo UA stub):**
      - a pending **zalo** request still shows the 'Sign in with Zalo to confirm' link;
      - a pending **google** request shows the `signIn.googleInZalo` hint and no confirm link.
- [ ] **Step 2: Run** `npm run test -w @fsl/web -- merge-sheet format-expiry`. Expected: FAIL.
- [ ] **Step 3: Implement:**
  - **`formatExpiry`:** `Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit' })`.
  - **i18n keys:** as in spec §3.8.
  - **`MergeSheet`:** inside `Sheet`, as specified in spec §3.3. Steps are an `<ol>`; the cancel and dismiss buttons use `Button loading` and are disabled while busy. A `NOT_FOUND` `ApiClientError` is treated as success. Other errors render `InlineError`. Focus goes to the primary control on open.
- [ ] **Step 4: Run** the web suite and typecheck. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): step-by-step merge sheet with confirm, cancel, link again and dismiss`.

### Task 7: Sign-in method cards

**Lane:** Gemini writes the new test file and rewrites `LinkedAccounts` (+ `.css`) from a controller screen spec (spec §3.2 and §3.6). Claude does the copy changes and the `useMe` defaults. The controller edits the existing tests.

**Files:**
- Modify: `apps/web/src/components/LinkedAccounts.tsx`, `apps/web/src/components/LinkedAccounts.css`, `apps/web/src/api/hooks.ts` (`useMe` select), `apps/web/src/i18n/en.ts`, `apps/web/src/i18n/vi.ts`
- Copy:
  - add `account.methodsHint`, `account.whyLink`, `merge.chipPending`, `merge.chipDeclined`, `merge.chipAccepted` and `merge.rowLabel` (spec §3.8);
  - delete `account.unlinkLast`, `merge.outgoingPending`, `merge.outgoingAccepted` and `merge.outgoingDeclined`;
  - keep `account.backupNudgeZalo` and `account.backupNudgeGoogle`.
- Test (new): `apps/web/src/components/__tests__/linked-accounts-cards.test.tsx`
- **Controller edits (existing tests)**, rewritten to the new behaviour, the cards being the source of truth:
  - `apps/web/src/components/__tests__/linked-accounts.test.tsx`:
    - 'the last method cannot be unlinked' now expects **no** Unlink button and **no** note text, and the nudge only after clicking `account.whyLink`;
    - 'shows both providers' expects the Zalo identity line rather than 'Not linked' where linked;
    - the outgoing-request cases now expect chips.
  - `apps/web/src/components/__tests__/linked-accounts-zalo-off.test.tsx`: the note and nudge assertions follow the same rules.

**Interfaces:**
- Consumes: `ProviderLogo` and `providerName` (Task 5); `MergeSheet` (Task 6); `MeUserView.zaloName`; `OutgoingMergeRequest` fields (Task 1); `Pill` (`tone` `'warning' | 'danger' | 'success'`); the `Icon` names `circleCheck`, `info`, `link`, `swap`, `trash`, `chevronRight`.
- Produces:
  - `LinkedAccounts({ me })`, same props as before;
  - `useMe().data` with `user.zaloName` always `string | null`, and every outgoing item with `otherName` and `identityLabel` filled in (defaulting to `providerName(provider)`).

- [ ] **Step 1: Write the failing tests** (`linked-accounts-cards.test.tsx`, using the `renderAt` + `mockApi` + `useMe` harness from the existing linked-accounts tests):
  - **Google-only, Zalo on:**
    - the section subtitle 'Manage the accounts you sign in with';
    - two cards (`data-testid` `method-google` and `method-zalo`);
    - the Google card has `svg[data-provider="google"]` not muted, and the identity line 'minh@example.com';
    - the Zalo card's logo has `fsl-provider-logo--muted`, the text 'Not linked', and the 'Link' link;
    - no 'Unlink' button anywhere;
    - no 'Link another way' text;
    - clicking the ⓘ button (name 'Why link it?') sets `aria-expanded="true"` and shows 'Link Zalo too so you can sign in from the Zalo app'.
  - **Both linked, `zaloName: 'Noah Zalo'`:**
    - the Zalo card shows 'Linked' with the check icon and 'Noah Zalo';
    - both cards have 'Change' and an enabled 'Unlink';
    - no ⓘ button.
  - **Zalo linked, `zaloName: null`:** the Zalo identity line is absent and the status shows 'Linked'.
  - **Chips:**
    - a pending Zalo request (`otherName: 'Noah Nguyen'`) makes the Zalo card one button named by `merge.rowLabel` that contains 'Waiting to confirm' and 'Noah Nguyen';
    - clicking it opens the dialog 'Merge with Noah Nguyen's account';
    - declined shows 'Declined'; accepted shows 'Merged'.
  - **Review Focus 2:**
    - Google pending (`otherName: 'B1'`) and Zalo declined (`otherName: 'B2'`) at once;
    - each card shows its own chip;
    - clicking the Google card opens 'Merge with B1's account'.
  - **Review Focus 5:**
    - with `zaloName` 120 characters long, the identity element has class `fsl-linked__identity` and `title` equal to the full name;
    - the CSS for `.fsl-linked__identity` sets `text-overflow: ellipsis` (assert the class only; the controller checks the CSS in review).
  - **Zalo off and not linked:** no Zalo card (as now).
  - **Inside Zalo:** the Google card shows the `signIn.googleInZalo` hint and no Link or Change.
- [ ] **Step 2: Run** `npm run test -w @fsl/web -- linked-accounts-cards`. Expected: FAIL.
- [ ] **Step 3: Implement:**
  - **Copy and `useMe` defaults:** Claude.
  - **`LinkedAccounts` rewrite:** Gemini screen lane, from spec §3.2 and §3.6. It renders one `MergeSheet` for whichever card's request is open. The unlink confirmation sheet stays as it is.
- [ ] **Step 4: Controller** edits the two existing test files as listed. **Run** the web suite and typecheck. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): sign-in method cards with logos, chips and the merge sheet`.

### Task 8: Confirm-on-this-device hand-off

**Lane:** Gemini writes the new test file; Claude implements (under 40 lines).

**Files:**
- Modify: `apps/web/src/components/MergeRequestBanner.tsx` (add `autoOpen`), `apps/web/src/screens/MyTrips.tsx`, `apps/web/src/i18n/en.ts`, `apps/web/src/i18n/vi.ts` (`merge.noRequestHere`)
- Test (new): `apps/web/src/screens/__tests__/my-trips-merge-review.test.tsx`

**Interfaces:**
- Consumes: `MergeRequestBanner({ request })`, `Snackbar({ message })`, `useMe()`.
- Produces: `MergeRequestBanner({ request, autoOpen = false }: { request: IncomingMergeRequest; autoOpen?: boolean })`. When `autoOpen` is true, it opens its `MergeConfirmSheet` on mount.

- [ ] **Step 1: Write the failing tests** (route `/trips?mergeReview=mr-7`, signed-in user):
  - `it('opens the confirmation sheet for the matching request')`: `/api/me` incoming has `id: 'mr-7'` among two requests. The dialog for mr-7's survivor opens without a click, and afterwards the location search no longer contains `mergeReview`.
  - `it('says so when no request matches')`: incoming is `[]`. The text 'This account has no merge request waiting.' appears, and the parameter is removed.
  - **Review Focus 1:**
    - `/api/me` resolves only after a deferred promise is released;
    - before release, no "no request" text is shown;
    - after release with a matching request, the sheet opens.
  - `it('shows the first incoming request when there is no mergeReview')`: unchanged behaviour, so the banner shows without the sheet.
- [ ] **Step 2: Run** `npm run test -w @fsl/web -- my-trips-merge-review`. Expected: FAIL.
- [ ] **Step 3: Implement:**
  - **`MyTrips`:**
    - read `mergeReview` with `useSearchParams`;
    - once `meQuery.isSuccess`, pick the matching incoming request, otherwise `incoming[0]`;
    - pass `autoOpen` when it matched, and show `Snackbar` with `merge.noRequestHere` when nothing matched;
    - remove the parameter with `navigate({ search }, { replace: true })`, keeping the other parameters.
  - **`MergeRequestBanner`:** `useState(autoOpen)` for `open`.
- [ ] **Step 4: Run** the web suite and typecheck. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): open the merge confirmation after signing in to confirm`.

## Final verification (controller)

1. **Full checks:** `npm run typecheck`, `npm test` and `npm run e2e`. Expected: all PASS.
2. **Rebuild and restart the tunnel** (`npm run tunnel`, which applies `0007` to the tunnel database). Then run the device checks from spec §4 in Chrome with real Google and Zalo:
   1. Signed in with Google, link a Zalo that already has its own account: the card shows **Chờ xác nhận**.
   2. Open the sheet and tap **Đăng nhập Zalo để xác nhận**: the confirmation sheet opens by itself.
   3. Tap **Gộp tài khoản**: the device is back on the Google account with **Đã gộp**.
   4. Tap **Đã hiểu**: the chip disappears.
   5. Decline path: after a decline, the card shows **Bị từ chối**; **Đã hiểu** clears it, and **Liên kết lại** starts a new request.
3. **Screenshots** at 375px and 1280px of the cards (one-method, both-linked, pending chip) and of the sheet, scored with the UI/UX companion critique matrix.
