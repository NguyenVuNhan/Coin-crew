# Removing, Leaving, Rejoining & Joining Without Approval — Design

Date: 2026-10-22 · Status: draft for review · Branch: `feat/add-remove-members` (from `main` at `58ab602`) · Builds on: [2026-10-17-ui-ux-and-transactions-design.md](2026-10-17-ui-ux-and-transactions-design.md) (Group Admin role, §4.2) · Code: https://github.com/NguyenVuNhan/coin-crew

---

## 1. Intent & Why

Groups change. Someone stops coming to badminton, a friend drops out of a trip halfway, a member signs in once and never returns. Today the roster can only grow:

1. **Removal is almost never allowed.** An admin can remove a name only if it is a guest *and* appears in no expense, payment or split. Anyone with history gets "Use merge instead", which is wrong: the person is not a duplicate.
2. **Signed-in members cannot be removed at all**, and nobody can leave a group on their own.
3. **A signed-in user cannot join with their own name.** Since 2026-10-17 only admins add names; a signed-in user can only claim an existing guest name and wait for an admin.

### Success criteria
- An admin removes anyone except the organiser (and, for admins, only the organiser removes them), whatever their history, without breaking a single balance.
- A signed-in member leaves a group from Settings; the group disappears from their My Trips.
- Someone who left or was removed still shows, marked **Left**, wherever money is still owed, and can still be paid or recorded as paying.
- A signed-in user with the group link joins with their account name, or rejoins under their own old name, with no approval.
- Claiming someone else's guest name still needs an admin.

---

## 2. Goals, Non-Goals & Anti-Goals

### Goals
1. A `left` participant status: out of the group's working set, kept in its history and balances.
2. Admin removal of guests and members, organiser-only removal of admins; a no-history name is still deleted outright.
3. Self-service **Leave** for signed-in members other than the organiser.
4. Admin **Bring back** for left people.
5. **Join** (new name, signed-in, no approval) and **Rejoin** (own left name, no approval).

### Non-Goals
- Guests leaving. A guest cannot leave; only an admin removes a guest.
- Bans. Removal is not a ban: a removed person with the group link can come back (members by rejoining, guests via an admin's Bring back). Shutting someone out fully stays "regenerate links".
- Handing over the organiser role. The organiser cannot leave or be removed; they can archive.
- Non-admin members adding or removing people.
- Merging a left person (merge keeps accepting only `active`/`pending`; bring them back first).

### Anti-Goals
- Never drop a left person from balances or transfers while their balance is not zero — the group's totals must keep adding up.
- Never let a removed member keep member or admin rights through any path (access, approvals, payments confirmation).
- Never give a user two names in one group through Join/Rejoin.

---

## 3. Global Constraints

- **No migration.** `participants.status` is plain `text` with no CHECK constraint (`0000_init.sql`); the enum lives only in Drizzle (`apps/api/src/db/schema.ts`). Add `'left'` there.
- Every write goes through `commitTripWrite` (version bump + activity row), like the existing routes.
- `assertWritable` applies to every new route: an archived group refuses remove, leave, restore and join.
- Permissions are decided in `packages/core/src/permissions.ts` (`can`) and checked with `ensure`.
- UI reuses existing tokens (`apps/web/src/styles/tokens.css`), `Pill` tones, `ActionRow`, `ActionSheet`, `InlineError`, `SkeletonList`, `GenderToggle`. No new colours, no new primitives.
- Copy in `en.ts` and `vi.ts`; every new Vietnamese line marked `// REVIEW`.
- The unmerged branch `feat/zalo-oauth-webview-og` also changes `WhoAreYou.tsx` and `api-types.ts`. This design keeps who-are-you independent of `useMe` (the signed-in account comes from the picker response, §4.3.2) so the two branches merge with small, mechanical conflicts.

---

## 4. Detailed Design

### 4.1 Rules

#### 4.1.1 The `left` status
`participants.status`: `'active' | 'pending' | 'merged' | 'left'`.

A name has **history** when it is any transaction's `payer_id`, `to_id` or `created_by_participant_id`, or has a `transaction_shares` row in the trip.

Removing or leaving:
- **No history → delete** the participant and its `device_participants` rows (today's behaviour, now for members too).
- **History → `left`**, in one batch: `status = 'left'`, `is_admin = 0`, delete its `device_participants` rows, set its `membership_requests` with `status = 'pending'` to `rejected`, set its `bank_details` with `status = 'pending'` to `rejected`. Approved bank details stay so people who owe them can still pay.

#### 4.1.2 Who can do what

| Action | Who | Target rules | Approval |
|---|---|---|---|
| Remove a guest | Admin | any guest name (`active` or `pending`) | none |
| Remove a member | Admin | non-admin member; an admin target needs the organiser | none |
| Remove the organiser | nobody | — | — |
| Remove yourself | nobody (use Leave) | — | — |
| Leave | signed-in member, not the organiser | self | none |
| Bring back | Admin | a `left` name | none |
| Rejoin | the signed-in user whose `left` name it is | own name | **none** |
| Join as a new name | any signed-in user with the group link, not already an active member | — | **none** → member |
| Claim a guest name | signed-in user | unchanged (`POST /membership`) | admin |

#### 4.1.3 What `left` means

| Area | Left person |
|---|---|
| Access (`resolveActor`) | not a member (it requires `active`); with the group link they are a guest with no name, without it 403 |
| My Trips (`GET /trips`) | gone (filters `active`) |
| Admin / approvals | no admin, cannot approve; their pending membership claims and bank details were rejected on removal; pending expenses they added stay waiting for approval |
| Who-are-you list | hidden; only the owner sees **Rejoin** (§4.3.2) |
| New expense | cannot be payer or in a split |
| Editing an existing expense | stays if already on it (payer or share); cannot be re-added once taken off |
| Rollback to an older version | allowed even if it brings them back onto the expense (history) |
| Past expenses, details, activity | name shown as before |
| Balances & transfers | included while their balance ≠ 0, with a **Left** marker |
| Payments | the other party records a payment to or from them; a left member counts as a non-member receiver, so it is `confirmed` straight away |
| Bank details | approved details remain visible to people who owe them (`view_bank`) |
| `PersonView.isMember` | `false` (they cannot confirm payments or act as a member) |

#### 4.1.4 Join and Rejoin
`POST /trips/:id/join` by a signed-in user holding the group link:
1. If the user already has an **active** name in the trip → 409.
2. If the user has a **`left`** name in the trip → set it `active` (Rejoin). Name, gender and `is_admin = 0` stay as they are. Activity `member_rejoined`.
3. Otherwise create an **active** participant with `user_id = user.id` (Join):
   - `name` = body `name` (trimmed, 1–40) or the account name; `gender` = body `gender` or the account's; in a `sport` group a gender is required (422 `Gender required`), same rule as the membership claim.
   - If `findSimilarNames(name, active+pending names)` matches and `confirmNew !== true` → 422 `A similar name is already in this trip.` (same check and message as `POST /people`). The 422 carries no match list (`ApiError` has no payload); the web gets the matches from the existing `POST /people/check-name` before joining (§4.3.2).
   - Upsert `device_participants` for this device → the new name (as `pick` does), so the device remembers it.
   - Activity `member_joined`.
4. Both Join and Rejoin set this user's `pending` `membership_requests` in the trip to `rejected` in the same batch, and `POST /membership/:rid/approve` gains a guard: if the claiming user already has an `active` name in the trip → 409 `ALREADY_HANDLED`. Together these keep one user to one name per group.

### 4.2 API & shared types

#### 4.2.1 `packages/core`
- **`api-types.ts`**
  - `PersonView.status: 'active' | 'pending' | 'left'`.
  - `PickerView` gains:
    - `account: { name: string; gender: Gender | null } | null` — the signed-in viewer when they are not an active member of this trip; `null` when signed out.
    - `myLeftName: { id: string; name: string } | null` — that viewer's own `left` name in this trip.
    - `people` never contains `left` names.
  - `ActivityAction` adds `'person_left' | 'person_restored' | 'member_joined' | 'member_rejoined'`. `person_removed` stays (used for both delete and → `left`).
- **`permissions.ts`**
  - `Action` adds `'leave' | 'restore_person'`.
  - `ActionContext` adds `targetIsAdmin?: boolean`.
  - `remove_person`: `isMember && isAdmin && (ctx.targetIsAdmin !== true || actor.isOrganiser)`.
  - `leave`: `isMember && !actor.isOrganiser`.
  - `restore_person`: `isMember && isAdmin`.

#### 4.2.2 Routes (`apps/api/src/participants/routes.ts`)

| Route | Change |
|---|---|
| `DELETE /trips/:id/people/:pid` | `ensure(actor, 'remove_person', { targetIsAdmin })`. 404 if not in trip or already `left`/`merged`. 403 if target is the organiser or `pid === actor.participantId`. Delete or → `left` per §4.1.1. The 409 "Use merge instead" and "Signed-in people cannot be removed" branches go. Activity `person_removed { name }`. 204. |
| `POST /trips/:id/leave` (new) | `ensure(actor, 'leave')`. Applies §4.1.1 to `actor.participantId`. Activity `person_left { name }`. 204. |
| `POST /trips/:id/people/:pid/restore` (new) | `ensure(actor, 'restore_person')`. 404 unless target is `left`. → `active`. Activity `person_restored { name }`. 204. |
| `POST /trips/:id/join` (new) | §4.1.4. No session → 401. Then by actor: `member` → 409 `ALREADY_HANDLED`, `viewer` → 403, `guest` (group link) → continue. Body `{ name?, gender?, confirmNew? }`. 201 `{ participantId, rejoined: boolean }`. |
| `GET /trips/:id/people/picker` | Excludes `left`. Fills `account` and `myLeftName` from the session. |
| `POST /trips/:id/membership/:rid/approve` | New guard: claiming user already has an `active` name in the trip → 409 `ALREADY_HANDLED` (§4.1.4 step 4). |

#### 4.2.3 Places that must accept `left` on purpose
- **`apps/api/src/trips/snapshot.ts`** — load people with `status in ('active','pending','left')`; `isMember = userId !== null && status !== 'left'`.
- **`apps/api/src/payments/routes.ts`** (`POST /payments`) — `from`/`to` may be `active` or `left`; `receiverIsMember` / `payerIsMember` are true only for `active` names with a user.
- **`apps/api/src/expenses/routes.ts`** — `validateExpenseInput` gains an `allowedLeftIds: Set<string>` argument. `POST` passes an empty set; `PATCH` passes the payer and share ids of the current version. A `left` id outside the set → 422 `Invalid participant in entries` / `Invalid payer`. Rollback keeps accepting the stored version.
- **`apps/api/src/trips/view.ts`** — name approvals and admin lists already filter on `pending`/`active`; no change beyond confirming that.

Already correct with no change (they require `active`): `resolveActor`, `GET /trips`, `POST /people/:pid/admin`, `POST /people/pick` (`active`/`pending`), `mergeParticipants` (`active`/`pending`).

### 4.3 Screens

#### 4.3.1 People (`apps/web/src/screens/People.tsx`, `People.css`, `apps/web/src/lib/rowActions.ts`)
- **Main list**: `view.people` without `left`, as today.
- **Remove** action (`rowActions.personActions`): shown when `can(actor, 'remove_person', { targetIsAdmin: person.isAdmin })`, the person is not the organiser and not me, and `status !== 'left'`. Members are no longer excluded. Before calling `DELETE`, `window.confirm(t('people.removeConfirm', { name }))` — "Remove {name} from the group? Their past expenses and payments stay."
- **Left section** below the main list, rendered only when at least one person is `left` (no empty state — absence is the empty state):
  - Heading `people.leftTitle` "Left the group": `--text-sm`, `--weight-semibold`, `--color-text-muted`, `--space-2` above the list.
  - Same list container and `ActionRow` as the main list. Leading `Avatar`; name in the existing name style; under it, in the existing `fsl-people__bank` style (muted, `tabular-nums`), the balance from `view.balances[id]` (positive = is owed): `people.leftOwes` "Owes {amount}", `people.leftOwed` "Is owed {amount}", `people.leftSettled` "Settled up". Trailing neutral `Pill` `people.leftBadge` "Left".
  - Row action for admins: **Bring back** (`people.restore`) → `POST /people/:pid/restore`.
- **Loading**: existing `SkeletonList`. **Errors**: existing per-row `fsl-people__row-error`. `actionErrorText` maps 403 → `people.cannotRemove` "You can't remove this person." and drops the 409 → `people.useMerge` mapping; delete the `people.useMerge` key.

#### 4.3.2 Who-are-you (`apps/web/src/screens/WhoAreYou.tsx`)
Signed-out guests: no change. When `picker.account` is set (signed-in, not an active member):
- **Rejoin** (`picker.myLeftName` set): a radio row at the top of the list, preselected, with the name and sub-line `who.rejoinHint` "You left this group · your past expenses are still here". When selected, the bottom button reads `who.rejoinAs` "Rejoin as {name}" and calls `POST /join` with no body.
- **Join** (no `myLeftName`): a quiet row under the list, `who.joinAs` "Not on the list? Join as {name}" (account name). In a `sport` group with `account.gender === null`, tapping it reveals an inline `GenderToggle` and the button is disabled until a gender is chosen. Calls `POST /join { gender? }`.
- **Similar name**: before `POST /join` on the Join path, call the existing `POST /people/check-name { name: account.name }`. If it returns matches, do not join yet; the bottom area shows, for the first (best-ranked) match, `who.similar` ('"{typed}" looks like "{name}", who's already in this trip.') with two buttons: `who.yesIm` "Yes, I'm {name}" (calls the existing `POST /people/pick` for that row, then navigates to `/t/{id}?becomeMember=1` so `GuestTrip` sends the existing membership claim, which needs approval) and `who.noAddMe` "No, add me" (`POST /join { confirmNew: true }`). These copy keys exist and are unused today.
- **Success**: invalidate `['trip', tripId]`, `['picker', tripId]` and `['me']`, then `navigate(target)` — the user lands in the member view.
- **In flight**: the bottom button shows its loading state and is disabled. **Errors**: existing `InlineError` in the bottom bar.

#### 4.3.3 Settings (`apps/web/src/screens/Settings.tsx`)
- The danger zone shows for the organiser (Archive, unchanged) **and** for a non-organiser member (**Leave group**, `settings.leave`). Same `Button variant="secondary" block` and hint style; hint `settings.leaveHint` "The group leaves your list. Your past expenses stay, and you can rejoin from the group link."
- `window.confirm(t('settings.leaveConfirm'))` "Leave {group}?" → `POST /leave` → reset cached queries (`queryClient.resetQueries()`) → `navigate('/')`.
- Error: `InlineError` with Retry, like archive. Archived group: no Leave (the existing archived notice shows instead).

#### 4.3.4 Expense form (`apps/web/src/screens/ExpenseForm.tsx`)
- One memoised `formPeople`: `view.people` without `left`, plus `left` people who are the payer or in a share of the expense being edited. Every current `view.people` use in the form switches to `formPeople`.
- A `left` person in the form carries the neutral `Left` pill next to their name.

#### 4.3.5 Balances, transfers, details, activity
- `YourTransfers.tsx`, `ExpenseDetails.tsx`: a `left` person's name gets the neutral `people.leftBadge` pill — the word "Left", so colour is never the only signal.
- `activityText.ts`: `person_left` → `activity.personLeft` "{actor} left the group"; `person_restored` → `activity.personRestored` "{actor} brought back {name}"; `member_joined` → `activity.memberJoined` "{actor} joined"; `member_rejoined` → `activity.memberRejoined` "{actor} rejoined". Matching `activity.action.*` keys.

---

## 5. Error Handling

| Case | Response |
|---|---|
| Remove/leave/restore/join on an archived group | 409 `TRIP_ARCHIVED` (`assertWritable`) |
| Remove the organiser, or yourself | 403 `FORBIDDEN` |
| Admin removes an admin | 403 `FORBIDDEN` (`ensure`) |
| Remove a name that is already `left`/`merged` or not in the trip | 404 `NOT_FOUND` |
| Organiser leaves | 403 `FORBIDDEN` |
| Restore a name that is not `left` | 404 `NOT_FOUND` |
| Join signed out | 401 `UNAUTHENTICATED` |
| Join with the view-only link | 403 `FORBIDDEN` |
| Join when already an active member | 409 `ALREADY_HANDLED` |
| Join with a similar name, no `confirmNew` | 422 `VALIDATION` "A similar name is already in this trip." |
| Join in a sport group with no gender | 422 `VALIDATION` "Gender required" |
| New expense with a `left` person | 422 `VALIDATION` |
| Removal races an expense being saved | whichever commits second sees the other; an expense validated just before removal keeps the person, which is the same state as editing an old expense — accepted |

---

## 6. Testing

**Core** (`packages/core`): `can` for `remove_person` (admin vs member target, organiser vs admin actor, guest/viewer refused), `leave` (member yes, organiser no, guest no), `restore_person` (admin only).

**API** (`apps/api/test/participants.test.ts`, new `apps/api/test/leave-join.test.ts`):
- Remove: no-history guest deleted; guest with history → `left` and still in `view.balances`; member with history → `left`, `is_admin` cleared, device links gone, pending membership/bank requests rejected; admin removes admin → 403; organiser removes admin → ok; organiser and self → 403.
- Leave: member → `left`, `GET /trips` no longer lists it, `GET /trips/:id` with the group link resolves as a guest with no name; organiser → 403; guest → 403.
- Restore: `left` → `active`; a restored member is a member again but not admin.
- Join: new name → active member; similar name → 422, then `confirmNew` → ok; sport group without gender → 422; already a member → 409; signed out → 401; view link → 403.
- Rejoin: a user with a `left` name gets the same participant back (`rejoined: true`), no second name.
- One name per user: Join while holding a pending membership claim rejects that claim; approving a claim for a user who already has an active name → 409.
- Picker: excludes `left`; `myLeftName` and `account` filled for the owner, `null` signed out.
- Payments: record to and from a `left` person; left member as receiver → `confirmed`.
- Expenses: new expense with a `left` person → 422; editing an expense that already has them → ok; adding them to an expense they were not on → 422.

**Existing tests that change on purpose** (updated by the architect, not delegated): `participants.test.ts` "signed-in people (like the organiser) cannot be removed" (organiser still refused, a plain member now removable) and the 409 "Use merge instead" cases (now → `left`).

**Web** (`apps/web/src/screens/__tests__`, `apps/web/src/components/__tests__`): People — Left section renders with balance lines and Bring back, absent when nobody left, Remove shown on members and hidden on organiser/self/admins for non-organisers; Settings — Leave for a non-organiser member only, navigates to My Trips; WhoAreYou — Rejoin row preselected and button label, Join row, sport gender gate, similar-name branch both ways, signed-out unchanged; ExpenseForm — left people hidden on a new expense, kept with the Left pill when editing.

---

## 7. Summary of File Changes

| Area | Files |
|---|---|
| Core | `packages/core/src/api-types.ts`, `packages/core/src/permissions.ts` (+ tests) |
| API | `apps/api/src/db/schema.ts`, `apps/api/src/participants/routes.ts`, `apps/api/src/trips/snapshot.ts`, `apps/api/src/payments/routes.ts`, `apps/api/src/expenses/routes.ts` (+ tests) |
| Web | `apps/web/src/screens/People.tsx`, `People.css`, `apps/web/src/lib/rowActions.ts`, `apps/web/src/screens/WhoAreYou.tsx`, `apps/web/src/screens/Settings.tsx`, `apps/web/src/screens/ExpenseForm.tsx`, `apps/web/src/components/YourTransfers.tsx`, `apps/web/src/components/ExpenseDetails.tsx`, `apps/web/src/lib/activityText.ts`, `apps/web/src/i18n/en.ts`, `apps/web/src/i18n/vi.ts` (+ tests) |
| Migrations | none |

---

## 8. What's Left to the Builder

- Exact placement of the Left pill inside `YourTransfers` rows (next to the name, before the amount) — follow the row's existing layout.
- Whether `ActionRow`'s swipe hint (`hintable`) applies to the first Left row — default: no, only the first row of the main list.
- Activity `details` shape for the new actions — mirror `person_removed` (`{ name }`).
