# Person Merge Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One "Merge with…" picker on `/people/:key` that suggests duplicates, is searchable, and shows what each pick will do. Same-group duplicates get a real merge (or an admin request), and a guest picked against a signed-in friend becomes a request that the friend and the admin both accept. The page also gets a bigger avatar and a ✎ sheet for the nickname plus group names.

**Architecture:** A pure `planMerge` in `@fsl/core` decides, for a pair of people, which steps a merge takes (view-only link, group merge, admin request, friend request) or why it's blocked. The API builds both sides from one people index and returns candidates with their plans, then executes the plan on `POST /me/people/merge`. Requests live in a new `merge_proposals` table, guarded against `membership_requests` so one guest has at most one pending claim or proposal. Web: `PersonScreen` gets a new header, a ✎ sheet, a `MergePicker` sheet and a pending-request row. `MyTrips` gets a `ProposalBanner`, `ApprovalsCard` a `proposal` kind, and `GuestTrip` a "they already said this is you" prompt.

**Tech Stack:** TypeScript, Hono on Cloudflare Workers, D1 + drizzle, vitest (`@cloudflare/vitest-pool-workers` for the API), React + react-router + TanStack Query, shadcn/ui + Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-10-31-person-merge-picker-design.md`. Read it before any task.

## Global Constraints

- Web follows the "Friendly" look. Use the app wrappers first (`Button`, `Sheet`, `Modal`, `Pill`, `Avatar`, `Icon`, `Snackbar`, `InlineError`, `Skeleton`). Never use shadcn `Drawer`/`Dialog` directly.
- Theme only in `apps/web/src/styles/globals.css`: no raw hex, no per-component `.css` (`src/test/style-guard.test.ts`).
- Fields at `text-base`, touch targets `min-h-11`, money in `tabular-nums`, `font-semibold` titles.
- Keep existing `fsl-*` classes and `data-testid`s: `person-merge`, `merge-pick-{key}`, `person-settle`, `person-pay-sheet`, `person-paid-them`.
- Every new string goes in both `apps/web/src/i18n/en.ts` and `vi.ts`.
- API writes respect `assertWritable` (archived groups refuse) and log through `commitTripWrite`.
- One request handler stays within D1's 50-statement budget. Candidate loading uses a fixed number of queries, never one per candidate.
- Email visibility: a signed-in user's Gmail address (or "Zalo") is shown only to callers who share at least one active group with that user.
- Tests: add new ones; edit existing tests only where the spec deliberately removes behaviour ("Rename or merge in…" link). The planner runs them.

## Review Focus

1. **Stale picker:** the picked guest was merged, removed or claimed after the picker loaded. `POST /me/people/merge` re-plans on the server and answers `409 ALREADY_HANDLED` without a partial write. *(Test in Task 4.)*
2. **Double tap on Confirm:** two identical merge posts create at most one proposal per guest. The second gets `409 ALREADY_CLAIMED`. *(Test in Task 4.)*
3. **Archived group in the plan:** steps in an archived group are left out of the plan. A pair whose only shared place is archived falls back to `link`. *(Test in Task 1.)*
4. **Search with diacritics and case:** "minh" finds "Minh Nguyễn" and "MINH", and "da lat" finds a candidate in "Đà Lạt". *(Test in Task 7.)*
5. **Friend accepts after already being a member:** U joined G another way while the proposal waited. Acceptance merges P into U's participant instead of failing. *(Test in Task 5.)*

---

### Task 1: `planMerge` in core

**Files:**
- Create: `packages/core/src/mergePlan.ts`
- Modify: `packages/core/src/index.ts` (export it)
- Test: `packages/core/src/__tests__/mergePlan.test.ts` (follow the core package's existing test location if different)

**Interfaces:**
- Produces:
```ts
export interface MergePlace { tripId: string; tripName: string; kind: 'group' | 'direct'; participantId: string; archived: boolean }
export interface MergeSide { key: PersonKey; userId: string | null; places: MergePlace[] }
export interface MergePlanContext {
  /** Trips where the caller may merge (admin/organiser; the caller's own ledger counts). */
  adminTripIds: ReadonlySet<string>;
  /** Guest participant id -> user id of a pending membership claim on it. */
  pendingClaims: ReadonlyMap<string, string>;
  /** Guest participant ids with a pending merge proposal. */
  pendingProposals: ReadonlySet<string>;
}
export type MergeStep =
  | { kind: 'link' }
  | { kind: 'merge'; tripId: string; tripName: string; fromPid: string; intoPid: string }
  | { kind: 'ask_admin'; tripId: string; tripName: string; fromPid: string; intoPid: string }
  | { kind: 'ask_user'; tripId: string; tripName: string; tripKind: 'group' | 'direct'; guestPid: string; userId: string; needsAdmin: boolean };
export type MergeTag = 'link' | 'merge' | 'ask_admin' | 'ask_user';
export type MergeBlock =
  | { reason: 'both_signed_in' }
  | { reason: 'claim_pending'; tripName: string; byTarget: boolean }
  | { reason: 'request_pending'; tripName: string };
export type MergePlan = { ok: true; tag: MergeTag; steps: MergeStep[] } | { ok: false; block: MergeBlock };
export function planMerge(a: MergeSide, b: MergeSide, ctx: MergePlanContext): MergePlan;
```

Rules (A = person on the page, B = picked):
- Both have `userId` → `both_signed_in`.
- Exactly one is signed in (U), the other is the guest side G. For each non-archived place of G:
  - pending claim on it → block `claim_pending` (`byTarget` = the claim is by U)
  - pending proposal → block `request_pending`
  - otherwise `ask_user` with `needsAdmin = kind === 'group' && !adminTripIds.has(tripId)`. A `direct` place never needs an admin.
  - No `link` step for this pair: the caller's view stays two people until it's accepted.
- Both guests: for each trip where both have a non-archived place, emit `merge` if the caller is an admin there, else `ask_admin`, with `fromPid` = B's place and `intoPid` = A's place. A pending claim or proposal on either pid blocks with `request_pending`. If any of B's places is *not* covered by such a trip, add one `{ kind: 'link' }` and put it **first**.
- `tag` is the strongest step: `ask_user` > `ask_admin` > `merge` > `link`.

- [ ] **Step 1: Write the failing tests** in `mergePlan.test.ts`:
  - `it('two guests in different groups → link only')`: tag `'link'`, steps `[{ kind: 'link' }]`.
  - `it('two guests in the same group, caller admin → merge B into A')`: `steps` equal `[{ kind:'merge', tripId:'t1', tripName:'Đà Lạt', fromPid:'pB', intoPid:'pA' }]`.
  - `it('same group, caller not admin → ask_admin')`.
  - `it('guests sharing one group plus another group → link first, then merge')`.
  - `it('guest in group + signed-in user → ask_user needing the admin unless caller is admin')`.
  - `it('ledger guest + signed-in user → ask_user without admin')`: `tripKind 'direct'`, `needsAdmin false`.
  - `it('both signed in → blocked')`.
  - `it('pending claim by the target user blocks with byTarget')`, and `it('pending claim by someone else blocks with byTarget false')`.
  - `it('pending proposal blocks')`.
  - `it('archived shared group falls back to link')`. *(Review Focus 3.)*
- [ ] **Step 2: Run it and check it fails:** `npm test -w @fsl/core -- mergePlan`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement `planMerge`** in `packages/core/src/mergePlan.ts` and export it from `index.ts`.
- [ ] **Step 4: Run it and check it passes:** the same command. Expected: PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(core): planMerge decides how two people merge"`

---

### Task 2: `merge_proposals` table and the claim guard

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Create: `apps/api/migrations/0012_merge_proposals.sql` (generate with drizzle-kit as earlier migrations were, then check the SQL)
- Create: `apps/api/src/proposals/store.ts`
- Modify: `apps/api/src/participants/routes.ts` (`POST /trips/:id/membership`, around line 790)
- Test: `apps/api/test/merge-proposals.test.ts`

**Interfaces:**
- Produces the table `merge_proposals`:
  - `id`, `trip_id`, `guest_pid` (participant P), `into_pid` (nullable; set for an admin-only same-group merge), `target_user_id` (nullable; U for `ask_user`)
  - `requested_by_user_id`, `needs_user` (0/1), `needs_admin` (0/1), `user_accepted_at` / `admin_accepted_at` (nullable)
  - `status` enum `pending | approved | declined | cancelled`, `created_at`, `decided_at` (nullable)
  - Indexes: `merge_proposals_trip_id_idx`, plus a partial unique index `merge_proposals_one_pending` on `guest_pid` WHERE `status = 'pending'`.
- Produces in `store.ts`:
```ts
export type ProposalRow = typeof mergeProposals.$inferSelect;
/** Inserts a pending proposal unless P already has a pending claim or proposal. Throws ApiError ALREADY_CLAIMED (409). */
export async function insertProposal(db: Db, p: { tripId: string; guestPid: string; intoPid: string | null; targetUserId: string | null; requestedBy: string; needsUser: boolean; needsAdmin: boolean }): Promise<string>;
export async function pendingProposalFor(db: Db, guestPid: string): Promise<ProposalRow | null>;
```
- `insertProposal` is a single `INSERT … SELECT … WHERE NOT EXISTS (SELECT 1 FROM membership_requests WHERE participant_id = ? AND status = 'pending') AND EXISTS (participant P still active/pending, user_id IS NULL)`. A unique-index failure maps to `ALREADY_CLAIMED`, and 0 rows inserted maps to `ALREADY_HANDLED`.
- The claim `INSERT` in `POST /trips/:id/membership` gains `AND NOT EXISTS (SELECT 1 FROM merge_proposals WHERE guest_pid = ? AND status = 'pending')`. Task 5 turns the same-user case into a prompt; here the claim simply refuses with `ALREADY_CLAIMED`.

- [ ] **Step 1: Write the failing tests:**
  - `it('insertProposal refuses when a claim is pending on the guest')` → rejects with code `ALREADY_CLAIMED`.
  - `it('a claim is refused while a proposal is pending on the guest')` → `POST /membership` gives 409.
  - `it('two concurrent insertProposal on one guest: one wins')` → statuses `[fulfilled, rejected]`.
- [ ] **Step 2: Run and check it fails:** `npm test -w @fsl/api -- merge-proposals`. Expected: FAIL.
- [ ] **Step 3: Implement** the schema, migration, `store.ts` and the claim guard.
- [ ] **Step 4: Run and check it passes.** Also run `npm test -w @fsl/api -- claim` (the existing claim tests still pass).
- [ ] **Step 5: Commit:** `feat(api): merge_proposals table, one pending claim or proposal per guest`

---

### Task 3: `GET /api/me/people/:key/merge-options`

**Files:**
- Modify: `apps/api/src/me/balances.ts`: extract the participant/link/nickname grouping from `loadPeopleSummary` (lines ~80–130) into `export async function loadPeopleIndex(db, userId): Promise<PeopleIndex>`. `loadPeopleSummary` uses it, and its output stays the same.
- Create: `apps/api/src/me/mergeOptions.ts` (loader + route, mounted from `personRoutes()`)
- Modify: `packages/core/src/api-types.ts`
- Test: `apps/api/test/merge-options.test.ts`

**Interfaces:**
- Consumes: `planMerge`, `MergeSide`, `MergePlan` (Task 1); the `merge_proposals` table (Task 2).
- Produces:
```ts
// api-types.ts
export interface MergeGroupRef { tripId: string; tripName: string; kind: 'group' | 'direct' }
export interface MergeCandidate {
  key: PersonKey; name: string; nickname: string | null; avatarUrl: string | null;
  /** Only when the caller shares an active group with this user. */
  signIn: { provider: 'google' | 'zalo'; label: string } | null;
  groups: MergeGroupRef[]; similar: boolean; plan: MergePlan;
}
export interface MergeOptionsResponse {
  person: { key: PersonKey; groups: (MergeGroupRef & { participantId: string; name: string; canRename: boolean })[] };
  candidates: MergeCandidate[];
}
// balances.ts
export interface PeopleIndex {
  people: Map<PersonKey, { name: string; userId: string | null; places: MergePlace[] }>;
  adminTripIds: Set<string>;
}
```
- `similar` comes from `findSimilarNames(person.name, …)`. Candidates are ordered with similar ones first (in `findSimilarNames` order), then the rest A–Z (`localeCompare`, sensitivity `base`).
- `signIn.label` is `users.email` for Google, or `users.zaloName ?? 'Zalo'` for Zalo. It's `null` unless the user has an active participant in one of the caller's active trips.
- `canRename` is true when the place is a group guest (`userId` null), the caller is an admin there, and the group isn't archived.
- `pendingClaims` and `pendingProposals` take one query each, over the caller's trips.
- Total statements per request: ≤ 6.

- [ ] **Step 1: Write the failing tests:**
  - `it('lists everyone else with plans, similar names first')`: seed guest "Minh N" in T1. Asking for `p:p-an` shows `similar` false. Asking for a guest named "Minh" shows `similar: true` first.
  - `it('shows Gmail only for users sharing a group')`: a user in a shared trip gets `signIn.label` `'<id>@example.com'`. A user reachable only through a ledger link with no shared group gets `signIn: null`.
  - `it('person.groups marks canRename for an admin only')`.
  - `it('loadPeopleSummary output is unchanged')`: the existing `people-summary*.test.ts` still pass.
- [ ] **Step 2: Run and check it fails:** `npm test -w @fsl/api -- merge-options`.
- [ ] **Step 3: Implement** `loadPeopleIndex`, the loader and the route (`requireUser`; 404 `NOT_FOUND` when the key isn't someone the caller shares a group or ledger with).
- [ ] **Step 4: Run and check it passes.** Then run `npm test -w @fsl/api -- people-summary`.
- [ ] **Step 5: Commit:** `feat(api): merge options with plans for the person page picker`

---

### Task 4: `POST /api/me/people/merge`

**Files:**
- Modify: `apps/api/src/me/mergeOptions.ts` (add the route)
- Modify: `apps/api/src/me/personRoutes.ts`: export `linkGuests` and `parseLinkKeys`
- Modify: `apps/api/src/participants/merge.ts`: narrow `mergeParticipants`'s `actor` parameter to `{ userId: string | null }`. Only `actor.userId` is read, so existing callers still type-check.
- Test: `apps/api/test/merge-execute.test.ts`

**Interfaces:**
- Consumes: `planMerge` (Task 1), `insertProposal` (Task 2), the people index (Task 3), `linkGuests`, `mergeParticipants`.
- Produces: `POST /api/me/people/merge` with body `{ keys: [PersonKey, PersonKey] }` (A first). It answers `200 { key: PersonKey; proposals: string[] }`, where `key` is where the person page should navigate (A's canonical key after any link or merge).
- The server re-plans; it never trusts a client plan. `ok: false` → 409, with code `BOTH_SIGNED_IN` / `ALREADY_CLAIMED` (`claim_pending`, `request_pending`).
- Order: `link` step, then each `merge` (via `getActor(c, tripId)`, `ensure(actor,'merge')`, `assertWritable`), then each `ask_*` as `insertProposal`:
  - `ask_admin`: `needsUser false`, `needsAdmin true`, `intoPid` set
  - `ask_user`: `needsUser true`, `needsAdmin` from the step, `targetUserId` set
- Log `merge_proposed` through `commitTripWrite` for each proposal. Add `'merge_proposed' | 'merge_proposal_accepted' | 'merge_proposal_declined'` to the activity action union in core, and `activity.action.*` strings in en/vi.

- [ ] **Step 1: Write the failing tests:**
  - `it('guests in two groups → link, no proposal')`: `proposals` is `[]`, and the summary shows one person.
  - `it('admin merges two guests in the same group')`: B's row has `status` `'merged'`.
  - `it('non-admin same-group pick creates an admin-only proposal')`.
  - `it('guest + signed-in user creates a proposal and leaves the caller view at two people')`.
  - `it('re-plans: a guest merged after loading gives 409 and writes nothing')`. *(Review Focus 1.)*
  - `it('double submit makes one proposal')`: two concurrent posts give statuses `[200, 409]`, and `merge_proposals` has 1 pending row. *(Review Focus 2.)*
- [ ] **Step 2: Run and check it fails:** `npm test -w @fsl/api -- merge-execute`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run and check it passes.** Then run `npm test -w @fsl/api -- merge` (the existing merge tests).
- [ ] **Step 5: Commit:** `feat(api): one merge endpoint that links, merges or asks`

---

### Task 5: Accepting, declining, cancelling and completing proposals

**Files:**
- Create: `apps/api/src/proposals/routes.ts` (mounted in `apps/api/src/app.ts` under `/api`)
- Modify: `apps/api/src/proposals/store.ts`: add `completeIfReady`
- Modify: `apps/api/src/trips/view.ts`: a `proposal` approval for admins
- Modify: `apps/api/src/participants/routes.ts`: in `POST /trips/:id/membership`, answer the same-user case with `409 PROPOSAL_PENDING`
- Modify: `packages/core/src/api-types.ts`
- Test: `apps/api/test/merge-proposals-flow.test.ts`

**Interfaces:**
- Produces:
```ts
// api-types.ts — add to the Approval union:
| { kind: 'proposal'; proposalId: string; guestPid: string; intoPid: string | null; targetUserName: string | null; requestedByName: string }
export interface ProposalView {
  id: string; tripId: string; tripName: string; tripKind: 'group' | 'direct'; guestName: string;
  /** The guest as the caller's people key (canonicalKey of p:guestPid). */
  guestKey: PersonKey;
  requestedByName: string; targetUserName: string | null;
  waitingFor: ('user' | 'admin')[]; status: 'pending' | 'approved' | 'declined' | 'cancelled';
}
export interface ProposalsResponse { incoming: ProposalView[]; outgoing: ProposalView[] }
// store.ts
export async function completeIfReady(db: Db, proposalId: string, logActor: { participantId: string | null; userId: string | null; deviceHash: string | null }): Promise<'approved' | 'waiting'>;
```
- Routes:
  - `GET /api/me/proposals`:
    - `incoming`: pending proposals where `target_user_id` = me
    - `outgoing`: mine as requester; pending ones, plus ones decided in the last 7 days (so the person page can say "declined")
  - `POST /api/me/proposals/:id/accept` and `/decline`: target user only.
  - `POST /api/me/proposals/:id/cancel`: requester only, while pending.
  - `POST /api/trips/:id/proposals/:pid/approve` and `/reject`: `ensure(actor,'approve')`, `assertWritable`.
  - If the requester is an admin of the trip when creating, Task 4 already sets `needs_admin` = 0.
  - Each route sets its `*_accepted_at` or the status with a conditional `UPDATE … WHERE status='pending'`. 0 changes → `ALREADY_HANDLED`.
- `completeIfReady`: once every side it needs has accepted, it re-reads P (it must still be active or pending, with `user_id` NULL; else mark `cancelled` and return `'waiting'`):
  - `into_pid` set → `mergeParticipants(P → into_pid)`
  - else, if U has an active participant in the trip → `mergeParticipants(P → U's pid)`
  - else link P to U the way an approved claim does (copy the update block from `/membership/:rid/approve`)
  - then mark it `approved` and log `merge_proposal_accepted`
- Claim case 2: `POST /trips/:id/membership` by user U on P with a pending proposal targeting U → `409 { code: 'PROPOSAL_PENDING', proposalId, requestedByName }`. A different user still gets `ALREADY_CLAIMED`.
- `view.ts` adds `proposal` approvals to the `approvals` list next to `membership` (same admin condition).

- [ ] **Step 1: Write the failing tests:**
  - `it('user accept then admin approve links the guest to the user')`: P gets `user_id = U`.
  - `it('admin first then user also completes')`.
  - `it('either decline marks declined and changes nothing')`.
  - `it('ledger proposal completes on the user alone')`.
  - `it('user already a member when the last side accepts → guest merged into their participant')`. *(Review Focus 5.)*
  - `it('guest gone before the last accept → cancelled, 409 ALREADY_HANDLED')`.
  - `it('claim by the target user while pending → 409 PROPOSAL_PENDING with proposalId')`.
  - `it('trip view lists the proposal for admins only')`.
  - `it('requester can cancel; others get 403')`.
- [ ] **Step 2: Run and check it fails:** `npm test -w @fsl/api -- merge-proposals-flow`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run and check it passes.** Then run the full API suite: `npm test -w @fsl/api`.
- [ ] **Step 5: Commit:** `feat(api): proposals need the friend and the admin, then merge or link`

---

### Task 6: Person page header and the ✎ sheet

**Files:**
- Modify: `apps/web/src/components/Avatar.tsx`: add `size` `'xl'` (`size-24 text-4xl`)
- Modify: `apps/web/src/api/people.ts`: add `useMergeOptions(key: PersonKey, enabled: boolean)` (query key `['people','merge-options',key]`) and `renameInGroup(tripId: string, pid: string, name: string, qc)` (`PATCH /api/trips/:id/people/:pid`, then invalidate the people summary and merge options)
- Modify: `apps/web/src/screens/PersonScreen.tsx`: header (lines ~264–275), remove the "Rename or merge in…" buttons (lines ~474–487), nickname sheet (lines ~502–522)
- Modify: `apps/web/src/i18n/en.ts`, `vi.ts`
- Modify: `apps/web/src/screens/__tests__/person-screen.test.tsx`: the test at line ~174 asserts the removed link; change only that assertion so it checks the link is gone
- Test: `apps/web/src/screens/__tests__/person-edit.test.tsx`

**Interfaces:**
- Consumes: `MergeOptionsResponse.person.groups` (Task 3).
- Header:
  - `<Avatar size="xl">`, with `avatarUrl` when signed in (the person summary has none; take it from merge options once loaded, falling back to initials)
  - `h2` name with an `Icon name="pencil"` ghost icon button right next to it: `aria-label={t('person.edit')}`, `data-testid="person-edit"`, `min-h-11 min-w-11`
  - under the name: the nickname in quotes, and `t('person.guestIn', { group: person.groupLabel })` for a guest
- ✎ sheet (title `t('person.edit')`):
  - the nickname field and help, as today
  - then for each `person.groups` entry with `canRename`, an `Input` labelled `t('person.nameIn', { group })` (`data-testid="person-name-{tripId}"`)
  - groups without `canRename` show the name as plain text
  - a signed-in person shows only the nickname
  - Save runs only the changed calls. On success: one snackbar, `t('person.saved')`. On error: `InlineError` and the sheet stays open.

- [ ] **Step 1: Write the failing tests** in `person-edit.test.tsx`:
  - `it('shows a large avatar and an edit icon next to the name')`: `getByTestId('person-edit')` is inside the header, and there's no "Edit nickname" text button.
  - `it('admin sees a name field per group and saving renames')`: the PATCH body is `{ name: 'Minh Béo' }` on `/api/trips/t-dl/people/p-1`.
  - `it('non-admin sees only the nickname field')`.
  - `it('no "Rename or merge in" link on the page')`.
- [ ] **Step 2: Run and check it fails:** `npm test -w @fsl/web -- person-edit`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run and check it passes.** Then run `npm test -w @fsl/web -- person-screen style-guard`.
- [ ] **Step 5: Commit:** `feat(web): bigger avatar, edit icon, rename in group from the person page`

---

### Task 7: The merge picker

**Files:**
- Create: `apps/web/src/components/MergePicker.tsx`
- Create: `apps/web/src/lib/searchPeople.ts`
- Modify: `apps/web/src/api/people.ts`: `mergePeople(keys: [PersonKey, PersonKey], qc): Promise<{ key: PersonKey; proposals: string[] }>` (invalidates the summary, merge options and `['me','proposals']`)
- Modify: `apps/web/src/screens/PersonScreen.tsx`: replace the merge sheet (lines ~588–625) with `<MergePicker>`
- Modify: `en.ts`, `vi.ts`
- Test: `apps/web/src/components/__tests__/merge-picker.test.tsx`, `apps/web/src/lib/__tests__/searchPeople.test.ts`
- Check: `apps/web/src/screens/__tests__/person-merge.test.tsx` still passes, apart from expectations about the old bare-button sheet. Update only those, since that UI is deliberately replaced.

**Interfaces:**
- Consumes: `useMergeOptions` (Task 6), `MergeCandidate`, `MergePlan` (Tasks 1, 3).
- Produces:
```ts
export function searchPeople(candidates: MergeCandidate[], query: string): MergeCandidate[];
export interface MergePickerProps { person: { key: PersonKey; name: string }; open: boolean; onClose: () => void; onMerged: (r: { key: PersonKey; proposals: string[] }) => void }
export function MergePicker(props: MergePickerProps): JSX.Element;
```
- `searchPeople` matches name, nickname, `signIn.label`, and group names, using the core normaliser behind `findSimilarNames` (case- and diacritic-insensitive). An empty query returns the input unchanged.
- Layout follows the mockup `.superpowers/brainstorm/15020-1793461977/content/person-and-merge.html`:
  - sheet title `t('merge.pickTitle', { name })`
  - search `Input` (`type="search"`, `text-base`, `data-testid="merge-search"`)
  - an empty query shows the sections `t('merge.suggested', { name })` (`similar`) and `t('merge.everyone')`; a query shows one list, similar first
- Row (`data-testid="merge-pick-{key}"`, a button, `min-h-11`):
  - `Avatar` (photo or initials), name
  - meta line: `signIn.label` · group names joined with `, `, where `direct` shows `t('person.quickExpenses')`
  - a `Pill` for the tag:
    - `link` → `t('merge.tagOnlyYou')`
    - `merge` → `t('merge.tagGroup', { group })`
    - `ask_admin` → `t('merge.tagAskAdmin', { group })`
    - `ask_user` → `t('merge.tagAskUser', { name, group })`, or with no admin `t('merge.tagAskUserOnly', { name })`
  - a blocked plan: the row is disabled with the reason. `both_signed_in` → the existing `person.mergeBothSignedIn`; `claim_pending` with `byTarget` → `t('merge.tagClaimPending', { name, group })`.
- Tapping a row → a confirm view inside the same sheet: one sentence per step, from the step texts in the spec, plus "{A} keeps their name" for merges. Then **Confirm** (primary, `data-testid="merge-confirm"`, `loading` while posting) and **Back**. On error: `InlineError`, and the sheet stays.
- On success, `PersonScreen` closes the sheet, navigates to `/people/{key}` (replace), and shows a snackbar: `person.merged` when there are no proposals, else `t('merge.sent')`.

- [ ] **Step 1: Write the failing tests:**
  - `searchPeople`: `it('matches without diacritics or case')`. "minh" finds "Minh Nguyễn", "da lat" finds a candidate in group "Đà Lạt", and an email substring matches. *(Review Focus 4.)*
  - picker: `it('shows suggested section first with tags')`, `it('search filters to one list')`, `it('blocked row is disabled with reason')`, `it('confirm posts keys [A, B] and calls onMerged')`, `it('error stays in the sheet')`.
- [ ] **Step 2: Run and check it fails:** `npm test -w @fsl/web -- merge-picker searchPeople`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run and check it passes.** Then run `npm test -w @fsl/web -- person`.
- [ ] **Step 5: Commit:** `feat(web): searchable merge picker with suggested matches and outcome tags`

---

### Task 8: Waiting rows, the friend's banner, admin approvals, the claim prompt

**Files:**
- Modify: `apps/web/src/api/people.ts`: `useProposals()` (`GET /api/me/proposals`, key `['me','proposals']`), plus `acceptProposal`, `declineProposal`, `cancelProposal`
- Modify: `apps/web/src/screens/PersonScreen.tsx`: the waiting row
- Create: `apps/web/src/components/ProposalBanner.tsx`
- Modify: `apps/web/src/screens/MyTrips.tsx`: render it under `MergeRequestBanner`
- Modify: `apps/web/src/components/ApprovalsCard.tsx`: a `ProposalApproval` next to `MembershipApproval` (line ~283), plus the two `switch` cases (lines ~318, ~347)
- Modify: `apps/web/src/screens/GuestTrip.tsx`: the `POST /membership` call (line ~64) handles `PROPOSAL_PENDING`
- Modify: `en.ts`, `vi.ts`
- Test: `apps/web/src/components/__tests__/proposal-banner.test.tsx`, `apps/web/src/screens/__tests__/person-proposals.test.tsx`; extend `guest-trip.test.tsx` with a new `it`

**Interfaces:**
- Consumes: `ProposalView`, `ProposalsResponse`, the `proposal` `Approval` (Task 5).
- Person page: for each `outgoing` with `guestKey === person.key`:
  - pending → a row `t('merge.waitingFor', { who })`, where `who` is built from `waitingFor` (the friend's name, `t('merge.theAdmin', { group })`, or both). Its Cancel ghost button has `data-testid="proposal-cancel-{id}"`.
  - declined → a muted row `t('merge.declined', { name })`
- `ProposalBanner`: one banner for all `incoming` from the same requester, `t('merge.isThisYou', { by, names })`. It lists each guest and group with **Accept** / **Decline** per item, plus **Accept all** when there are several (`data-testid="proposal-accept-all"`).
- `ProposalApproval`: title `t('approvals.proposal', { by, guest, into })`, where `into` is `targetUserName` or the `intoPid` name. **Approve** / **Decline** post to `/proposals/:id/approve` and `/reject`, the same way `MembershipApproval`'s `run` does.
- `GuestTrip`: on a `409 PROPOSAL_PENDING`, show a notice card `t('merge.alreadySaid', { by })` with **Accept** → `acceptProposal(proposalId)`, then a snackbar. Other errors are still ignored, as today.

- [ ] **Step 1: Write the failing tests:**
  - `it('person page shows waiting row and cancel calls the API')`.
  - `it('declined proposal shows a declined note')`.
  - `it('banner groups proposals from one requester and Accept all accepts each')`.
  - `it('admin approval card approves a proposal')`.
  - `it('claim answered PROPOSAL_PENDING shows accept prompt')`.
- [ ] **Step 2: Run and check it fails:** `npm test -w @fsl/web -- proposal person-proposals guest-trip`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run and check it passes.** Then run everything: `npm test` and `npm run typecheck` at the repo root.
- [ ] **Step 5: Commit:** `feat(web): proposal banner, waiting rows, admin approvals, claim prompt`
