# Delete archived group (30-day grace period)

Date: 2026-11-22

Lines marked **(owner)** are the owner's decisions from brainstorming on 2026-11-22. Lines marked **(my call)** are the writer's sensible defaults; the owner may overrule any of them. Read with: `PRODUCT.md`, `DESIGN.md`, `CLAUDE.md`, and `docs/superpowers/specs/2026-11-21-group-shares-in-spending-book-design.md`.

## 1. Intent

Organisers sometimes create test groups to try out features, or finish with old groups they no longer want cluttering their list, only to realise an archived group can never be deleted **(owner)**.

At the same time, accidental permanent deletion of a real group would wipe shared transaction history **(owner)**. To protect against lost transactions while letting organisers clean up immediately, deleting an archived group starts a **30-day grace period**: the group's transactions stop counting in **Sổ chi tiêu** right away, a visible countdown warning flags how many days remain, and the group is permanently wiped only after 30 days if deletion is not cancelled **(owner)**.

## 2. Goals

1. Let a group's organiser schedule permanent deletion of an **archived** group (`trip` or `sport`), starting a 30-day countdown **(owner)**.
2. Immediately exclude the pending-delete group's transactions from **Sổ chi tiêu** (transaction lists, totals, wallet balances, and local browser sync) for all signed-in members, and warn the organiser clearly about this before confirming **(owner)**.
3. Keep **People** tab balances ("who owes whom" across groups) intact during the 30-day grace period, removing them only when permanent deletion completes — and fix People-tab settlements so settling an archived group records the payment directly inside that archived group instead of redirecting it into the personal direct ledger **(owner)**.
4. Display a clear warning flag showing how many days remain until permanent deletion so the organiser and other members can catch mistakes in time **(owner)**.
5. Let the organiser cancel deletion at any time during the 30 days, restoring the group to **archived** and bringing its transactions (and per-user Sổ chi tiêu links) back intact **(my call, owner-confirmed)**.
6. Automatically and atomically purge due groups and all associated database records via a dedicated hourly Cloudflare Worker cron trigger once 30 days have elapsed, staying comfortably under D1's 50-statement cap **(my call)**.

## 3. Non-goals and anti-goals

**Non-goals:**
- Immediate ("skip the 30-day wait") deletion, even for empty groups — every scheduled deletion follows the same 30-day rule **(my call)**.
- Deleting an active (unarchived) group directly; the group must be archived first **(owner)**.
- Deleting a user's personal direct ledger (`preset = 'direct'`) — never allowed **(my call, owner-confirmed)**.
- Email or Web Push notifications when deletion is scheduled, cancelled, or completed — in-app countdown flags and banners are sufficient **(my call, owner-confirmed)**.
- Export/backup of group data before deletion.

**Anti-goals (a failure even if it technically works):**
- Silently removing transactions from Sổ chi tiêu without explicitly warning the organiser before they confirm **(owner)**.
- Dropping unsettled People balances during the 30-day wait before the group is actually gone **(owner)**.
- Redirecting new People-tab settlements for an archived group into the personal direct ledger so that deleting the archived group later leaves a phantom reverse balance **(owner)**.
- Losing per-user Sổ chi tiêu categorisations, wallets, or tags (`personal_group_links` / `personal_group_link_tags`) if the organiser cancels deletion within 30 days **(my call)**.
- Partial deletion or foreign-key failures during the hourly purge, or purging a group that the organiser concurrently cancelled.
- Breaking the Cloudflare D1 free-plan budget (50 statements per Worker invocation including every statement inside `db.batch`, 100 bound parameters per query, no unindexed table scans on `trips`).
- Affecting active groups, non-archived flows, or users who have Sổ chi tiêu turned off.

## 4. Constraints

- **Platform & hosting:** Cloudflare Workers + D1 on the free plan (50 statements per Worker invocation including every statement inside `db.batch`, 100 bound parameters per query). Existing triggers in `apps/api/wrangler.jsonc` are `"0 * * * *"` and `"*/5 * * * *"` (Free Plan allows up to 5 cron triggers), so adding a dedicated `"30 * * * *"` trigger isolates the purge batch from the sibling hourly cron tasks.
- **Migrations:** Hand-written, additive SQL migration (`apps/api/migrations/0033_delete_archived_group.sql`) mirroring Drizzle schema (`libs/api/db/src/schema.ts`).
- **Workspace & architecture (`CLAUDE.md`):** Respect Nx library boundaries (`@cc/core` for permissions and shared types, `@cc/api-db` for schema, `apps/api` for routes/cron, `@cc/web-data-access` for API/sync hooks, `@cc/web-i18n` for copy, `@cc/web-screens` for UI).
- **UI & design system (`DESIGN.md`):** Phone-first (375px), warm off-white Rice Paper, white `rounded-xl` grouped lists, pill buttons (≥44px touch targets), theme tokens only (no raw hex, no per-component CSS files), app wrappers (`Button`, `Sheet`, `Pill`, `Snackbar`, `InlineError`, `Icon`) instead of raw shadcn `Drawer`/`Dialog` or `window.confirm`. Preserve existing `fsl-*` classes and `data-testid` hooks.
- **Languages & copy (`PRODUCT.md`):** Vietnamese first, English second. Plain everyday words, no jargon. Mark all new Vietnamese strings with `// REVIEW` in `libs/web/i18n/src/vi.ts`.
- **Works everywhere:** Standard mobile/desktop browsers, PWA home-screen standalone mode, Zalo in-app browser, and Zalo Mini App (`apps/zalo`).

## 5. Lifecycle, permissions, and data rules

### 5.1 State machine

| State | `archived_at` | `delete_after` | Allowed transitions |
|---|---|---|---|
| Active | `NULL` | `NULL` | Archive → Archived |
| Archived | set | `NULL` | Unarchive → Active; Schedule delete → Pending deletion |
| Pending deletion | set | set (`now + 30 days`) | Cancel deletion → Archived; Hourly cron after `delete_after` → Permanently deleted |
| Permanently deleted | row removed | row removed | None (group URLs return 404 / dead link) |

- **Archived-first rule:** `POST /api/trips/:id/delete` requires `archived_at IS NOT NULL` and `preset <> 'direct'`.
- **Unarchive guard:** While `delete_after IS NOT NULL`, `POST /api/trips/:id/unarchive` is refused with `409 CONFLICT`. The organiser must cancel deletion first **(my call, owner-confirmed)**.
- **Read-only during wait:** Because `archived_at` remains set during the 30-day wait, `assertWritable(trip)` automatically blocks all direct group-page mutations (expenses, payments, edits, people changes, leave, settings, theme, links). The one exception is People-tab settlements described in Section 5.4.
- **Unsettled balances allowed:** An archived group with unsettled balances or waiting payments may still be scheduled for deletion; the confirmation sheet adds an explicit extra warning **(my call, owner-confirmed)**.
- **Grace-period end window (my call):** Permanent deletion happens on the next `:30` hourly cron tick where `delete_after <= now`. Between `delete_after` passing and the cron tick running (at most ~59 minutes), the group remains in pending-delete state (displaying "Deletes today" / "Xóa trong hôm nay") and can still be cancelled rather than mutating state on a `GET` request.

### 5.2 Permissions **(owner)**

- Only the group's **organiser** (`actor.kind === 'member' && actor.isOrganiser`) can schedule deletion or cancel deletion — matching `archive` and `unarchive`. Other members (including group admins), guests, and viewers cannot.
- Add `'delete_group'` and `'cancel_delete_group'` actions to `can(actor, action)` in `libs/shared/core/src/permissions.ts`, both returning `isMember && actor.isOrganiser`.
- **Shared links during the 30 days (my call, owner-confirmed):** Existing `groupToken` and `viewToken` links continue to open read-only with the countdown warning banner until permanent deletion. Once permanently deleted, `/api/links/:token` returns `410 LINK_DEAD` and `/api/trips/:id` returns `404 NOT_FOUND` (existing behaviour).

### 5.3 Sổ chi tiêu, Activity, and notifications

**During the 30-day wait:**
- **Sổ chi tiêu — excluded immediately (owner):**
  - `computeGroupsKey(db, userId)` and `loadGroupRows(db, userId, range?)` in `apps/api/src/personal/groupShares.ts` filter out trips where `trips.deleteAfter IS NOT NULL` (`isNull(trips.deleteAfter)`).
  - Because `delete` and `cancel-delete` bump `trips.version` via `guardedTripWrite` and toggle membership in `computeGroupsKey`, every member's Sổ chi tiêu wallet balances (`apps/api/src/personal/wallets.ts`), transaction lists & summaries (`apps/api/src/personal/list.ts`), and local IndexedDB `groupCopy` (`GET /api/me/personal/group-rows`, `GET /api/me/personal/sync`) immediately exclude the group's rows on sync.
  - `PUT /api/me/personal/group-links/:rootId` (`apps/api/src/personal/groupLinks.ts`) joins `trips` and rejects links belonging to a pending-delete group with `404 NOT_FOUND`.
  - **Preserve links for cancel (my call):** `personal_group_links` and `personal_group_link_tags` rows for the group are **not** deleted when scheduling deletion. If the organiser cancels within 30 days, every member's custom categories, wallets, tags, loan/shared intents, and report-exclusion flags come back automatically.
- **Activity feed — unchanged during wait (my call):**
  - Group activity and `GET /api/me/activity` remain visible during the 30 days and record two new actions: `trip_delete_scheduled` (with `details: { deleteAfter }`) and `trip_delete_cancelled` (with `details: {}`).
- **Email & push crons (my call):**
  - Email crons (`loanReminders.ts`, `monthlyNotice.ts`) already exclude archived groups (`isNull(trips.archivedAt)`).
  - Push session reminders (`apps/api/src/notifications/push/reminders.ts`): add `isNull(trips.archivedAt)` to `rebuildSessionReminders` and `rebuildRemindersForSubscription`, and delete unsent `push_reminders` (`WHERE trip_id = ? AND sent_at IS NULL`) when archiving or scheduling delete, so archived and pending-delete sport groups never send upcoming session push reminders.

**Upon permanent deletion (after 30 days):**
- The group and all its transactions, participants, links, activity, and balances are permanently removed. Any remaining People balances from that group disappear automatically once the rows are gone.

### 5.4 People-tab balances and archived-group settlements **(owner)**

- **People tab stays intact during the 30-day wait (owner):** `loadPeopleIndex`, `loadPeopleSummary`, `loadPersonItems` (`apps/api/src/me/balances.ts`), `loadPersonHistory` (`apps/api/src/me/history.ts`), and `confirmSettlement` (`apps/api/src/me/settle.ts`) continue to include pending-delete groups just like archived groups.
- **Record People-tab settlements directly inside archived groups (owner):**
  - Previously, `apps/api/src/me/balances.ts` set `writable: trip.archivedAt === null`, causing `spreadSettlement` (`libs/shared/core/src/people.ts`) and `createSettlement` (`apps/api/src/me/settle.ts`) to redirect archived-group balances into the caller's personal `direct` ledger without tracking which archived `tripId` was offset. Deleting that archived group later would wipe the group debt while leaving the offsetting payment in `direct`, flipping the People balance into a phantom reverse debt.
  - Fix this by treating archived groups (including pending-delete groups during the 30-day wait) as `writable: true` in `apps/api/src/me/balances.ts` (`loadPersonItems` and `loadPeopleSummary`) when computing People-tab settlements (`POST /api/me/people/:key/settle` and `/r/:token` via `createSettlement`), so the settlement payment is recorded **directly inside that archived group** instead of redirecting into `direct` **(owner)**.
  - This matches `confirmSettlement` (which already confirms `says_paid` settlement parts inside archived groups) and keeps the archived group's own balance (`0₫`) and Settings unsettled-balance warning accurate.
  - **Scope:** Direct writes from inside an archived group page (`expenses`, `payments`, `people`, `settings`) stay blocked by `assertWritable(trip)`; only People-tab settlements write settlement parts into an archived group. Update the existing API test (`apps/api/test/settle.test.ts` `'the part for an archived group goes to the ledger'`) accordingly.
  - **Pre-existing settlements note (my call):** For any archived group that already has an open balance inside it (including groups whose People balance was settled into `direct` before this fix ships), the Settings confirmation sheet's unsettled-balance callout notes that open balances — and any earlier People-tab settlement tied to them — will be affected once permanent deletion runs after 30 days.

## 6. Data model, API, and hourly purge

### 6.1 Schema & migration

- Add nullable `delete_after TEXT` column to `trips` in `libs/api/db/src/schema.ts` (`deleteAfter: text('delete_after')`) and hand-written migration `apps/api/migrations/0033_delete_archived_group.sql`:
  - `ALTER TABLE trips ADD COLUMN delete_after text;`
  - Partial index `CREATE INDEX trips_delete_after_idx ON trips (delete_after) WHERE delete_after IS NOT NULL;` so the hourly cron reads zero rows when nothing is due.

### 6.2 Shared types & API routes

- **Shared types (`libs/shared/core/src/api-types.ts`):**
  - Add optional `deleteAfter?: string | null` to `TripView['trip']` and `TripListItem` (populated as `trip.deleteAfter ?? null` in `buildSnapshot` and `loadTripList` in `apps/api/src/trips/snapshot.ts`).
  - Add `'trip_delete_scheduled'` and `'trip_delete_cancelled'` to `ActivityAction`.
- **`POST /api/trips/:id/delete`:**
  - `resolveActor(c, tripId)` → reject `preset === 'direct'` (`403 FORBIDDEN`) → `ensure(actor, 'delete_group')`.
  - If `!actor.trip.archivedAt`, throw `409 CONFLICT` (`'Archive the group before deleting it.'`).
  - Idempotent: if `actor.trip.deleteAfter` is already set, return `200` with `{ deleteAfter: actor.trip.deleteAfter }` without resetting the 30-day timer or writing a duplicate activity row **(my call)**.
  - Compute `deleteAfter = new Date(Date.now() + 30 * 86_400_000).toISOString()`.
  - Execute via `guardedTripWrite` guarding `WHERE id = tripId AND archived_at IS NOT NULL AND delete_after IS NULL AND preset <> 'direct'`, setting `delete_after = deleteAfter`, clearing unsent `push_reminders` (`trip_id = tripId AND sent_at IS NULL`), and logging `trip_delete_scheduled` with `{ deleteAfter }`. Return `200 { deleteAfter }`.
  - **Concurrent race handling (my call):** If `guardedTripWrite` misses (e.g., concurrent unarchive or concurrent delete), re-read `trips.deleteAfter`: if `deleteAfter` is now set, return idempotent `200 { deleteAfter }`; otherwise throw `409 CONFLICT`.
- **`POST /api/trips/:id/cancel-delete`:**
  - `resolveActor(c, tripId)` → reject `preset === 'direct'` (`403 FORBIDDEN`) → `ensure(actor, 'cancel_delete_group')`.
  - Idempotent: if `!actor.trip.deleteAfter`, return `204` without writing an activity row **(my call)**.
  - Execute via `guardedTripWrite` guarding `WHERE id = tripId AND delete_after IS NOT NULL`, setting `delete_after = NULL`, logging `trip_delete_cancelled`. Return `204`.
- **`POST /api/trips/:id/archive`:**
  - Also delete unsent `push_reminders` (`WHERE trip_id = tripId AND sent_at IS NULL`) inside the archive batch so archiving stops pending session push reminders immediately **(my call)**.
- **`POST /api/trips/:id/unarchive`:**
  - If `actor.trip.deleteAfter` is set, throw `409 CONFLICT` (`'Cancel deletion before unarchiving this group.'`). Also include `AND delete_after IS NULL` in the unarchive write guard to prevent concurrent race with scheduling deletion.

### 6.3 Dedicated hourly permanent-deletion purge **(my call)**

Add a third cron trigger `"30 * * * *"` in `apps/api/wrangler.jsonc` and route `controller.cron === '30 * * * *'` in `apps/api/src/index.ts` exclusively to `purgeDeletedGroups(env, now)`. Giving the purge its own Worker invocation gives it the full **50-statement D1 budget** with zero collision against the `:00` tasks (`checkUsage`, `retryUndeliveredFeedback`, `sendWeeklyLoanReminders`, `sendMonthlyNotices`, `purgeSyncDeletions`).

1. **Fast path (1 statement):** Query up to `BATCH_LIMIT` (`10`) due trip IDs:
   `SELECT id FROM trips WHERE delete_after IS NOT NULL AND delete_after <= ? AND preset <> 'direct' ORDER BY delete_after ASC LIMIT 10`.
   When 0 rows match, `purgeDeletedGroups` returns immediately in **1 statement**.
2. **Atomic multi-trip batch (29–30 statements, ≤11 bound params per statement):** When `ids.length > 0` (1 to 10 due trips), run **one single `db.batch([...])`** covering `ids` so the entire invocation uses only **30–31 statements** (well under D1's 50-statement cap, where every statement inside `db.batch` counts):
   - **Batch race guard (first two statements):**
     1. `UPDATE trips SET delete_after = delete_after WHERE id IN (...ids) AND delete_after IS NOT NULL AND delete_after <= ? AND preset <> 'direct'`
     2. `UPDATE trips SET version = CASE WHEN changes() = ${ids.length} THEN version + 1 ELSE NULL END WHERE id = ${ids[0]}`
     If the organiser concurrently cancelled deletion on any trip in `ids` between the `SELECT` and the `batch`, `changes() < ids.length`, `trips.version` violates `NOT NULL`, and D1 rolls back the entire batch atomically with zero partial deletes (remaining due trips are picked up cleanly on the next hourly `:30` tick).
   - **Cascade cleanup in dependency order (all set-based with `IN (...ids)` / `IN (SELECT ... WHERE trip_id IN (...ids))`):**
     - `personal_group_link_tags` (`EXISTS (SELECT 1 FROM personal_group_links pgl WHERE pgl.user_id = personal_group_link_tags.user_id AND pgl.root_id = personal_group_link_tags.root_id AND pgl.trip_id IN (...ids))`)
     - `personal_group_links` (`trip_id IN (...ids)`)
     - `participant_merge_rows` (`merge_id IN (SELECT id FROM participant_merges WHERE trip_id IN (...ids))`)
     - `participant_merges` (`trip_id IN (...ids)`)
     - `transaction_shares` (`transaction_id IN (SELECT id FROM transactions WHERE trip_id IN (...ids))`)
     - `transactions` (`trip_id IN (...ids)`)
     - `bank_details` (guest-only: `participant_id IN (SELECT id FROM participants WHERE trip_id IN (...ids)) AND user_id IS NULL` — **never** delete account-level bank details where `user_id IS NOT NULL`)
     - `person_links` (`participant_id IN (SELECT id FROM participants WHERE trip_id IN (...ids))`)
     - `account_merge_requests`: cancel any `pending` claims referencing `claim_trip_id IN (...ids)` (`status = 'cancelled', decided_at = now`), and nullify `claim_trip_id = NULL, claim_participant_id = NULL` on all rows with `claim_trip_id IN (...ids)`
     - `notification_logs` (`trip_id IN (...ids)` — required before deleting `trips` because `notification_logs.trip_id` has a SQL foreign key `REFERENCES trips(id)`)
     - `trip_views`, `activity`, `payment_refs`, `player_ratings`, `membership_requests`, `merge_proposals`, `zalo_chat_links`, `device_participants`, `device_expense_grants`, `payment_keys`, `push_reminders`, `trip_locations`, `attendance_scores`, `attendance_counted`, `attendance_state` (each `WHERE trip_id IN (...ids)`)
     - `participants` (`trip_id IN (...ids)`)
     - `trips` (`id IN (...ids)`) — last statement.
3. Catch expected guard rollbacks and log any unexpected error without throwing so the Worker stays clean and retries on the next hourly `:30` tick.

## 7. Screens and user flow

Approved visually in the inline mockup (`delete-archived-group-screens-v1.html`, owner: "Looks right", 2026-11-22).

### 7.1 Countdown formatting **(my call, owner-confirmed)**

- Compute remaining time from `deleteAfter` vs current time:
  - `daysLeft = Math.ceil((Date.parse(deleteAfter) - nowMs) / 86_400_000)` when `> 0`.
  - When `daysLeft >= 1`: show whole days (`Xóa sau {days} ngày` / `Deletes in {days} days`, singular `1 day` in English) and, in banners/sheets, the formatted calendar date (e.g. `22/12` in VI, `Dec 22` in EN).
  - When `deleteAfter <= now` (final hour before the `:30` cron tick) or `daysLeft <= 0`: show `Xóa trong hôm nay` / `Deletes today` (no negative numbers).

### 7.2 Group Settings (`libs/web/screens/src/screens/Settings.tsx`)

- **Archived, not pending delete (organiser only):**
  - Keep existing muted archived notice + secondary `Unarchive group` button and hint.
  - Add a **Danger zone** section below it with a Lychee-outlined white pill button `Delete group` / `Xóa nhóm` (matching the existing `Archive group` button style) and a muted hint noting the 30-day wait.
- **Delete confirmation sheet (`Sheet` wrapper, bottom drawer on phones / dialog from 640px — never `window.confirm`):**
  - Title: `Xóa nhóm "{name}"?` / `Delete "{name}"?`.
  - Conditional Lychee-soft (`bg-danger-soft text-danger`) callout if the group still has unsettled balances (`view.suggestions.length > 0 || view.payments.some((p) => p.status === 'says_paid')`): warns that unsettled balances (and any earlier People-tab settlements tied to them) will be permanently lost or affected after 30 days **(my call, owner-confirmed)**.
  - Warning block (`bg-warning-soft border-warning-border text-warning-foreground`) explicitly stating:
    1. **Sổ chi tiêu:** Transactions in this group **stop counting in Sổ chi tiêu right away** **(owner)**.
    2. **30-day wait:** Permanently deleted on `{date}`; can be cancelled anytime before then **(owner)**.
    3. **People:** Balances with people stay intact during the 30 days and are removed when permanently deleted **(owner)**.
  - Actions: full-width `Button variant="danger"` (`Xóa sau 30 ngày` / `Delete in 30 days`) and `Button variant="ghost"` (`Hủy` / `Cancel`).
  - Inline error (`InlineError`) inside the sheet if the API request fails; focus returns cleanly when closed.
  - On success: invalidate `['trip', tripId]`, `['trips']`, and personal-money queries (`['personal']`), trigger `requestGroupCopySync()`, close the sheet, and navigate back to the group page (`goBack()`) so the new countdown banner is visible immediately **(my call)**.
- **Pending deletion (organiser only):**
  - Replace the muted archived notice and hide `Unarchive group` **(my call, owner-confirmed)**.
  - Show the soft-danger countdown notice (`Nhóm sẽ bị xóa vĩnh viễn sau {days} ngày ({date})` + `Giao dịch đã ngừng tính vào Sổ chi tiêu.`).
  - Show a full-width secondary pill button `Hủy xóa nhóm` / `Cancel deletion` with a muted hint explaining it returns the group to archived and restores transactions in Sổ chi tiêu.
  - On cancel success: invalidate `['trip', tripId]`, `['trips']`, and personal-money queries, trigger `requestGroupCopySync()`, and stay on Settings (showing the archived notice and `Unarchive group` again) with a confirmation `Snackbar` **(my call)**.

### 7.3 Groups list (`libs/web/screens/src/screens/MyTrips.tsx`)

- Keep existing list order (`createdAt DESC`) and balance line **(my call)**.
- When `trip.deleteAfter` is set, display a high-contrast danger-soft pill flag (`Pill tone="danger"` or matching pill with clock icon: `Xóa sau {days} ngày` / `Deletes in {days} days`, or `Xóa trong hôm nay` / `Deletes today`) directly on the row for **all signed-in members** **(owner)**.

### 7.4 Inside the group (`MemberTrip.tsx`, `GuestTrip.tsx`, `ViewOnlyTrip.tsx`)

- When `view.trip.deleteAfter` is set, replace the muted archived notice (and add above the banner in `ViewOnlyTrip`) with a shared pending-delete warning banner (`bg-danger-soft` rounded-xl):
  - Headline in Lychee (`text-danger font-semibold`): `Nhóm sẽ bị xóa vĩnh viễn sau {days} ngày ({date})` / `Permanently deletes in {days} days ({date})` (or `Deletes today`).
  - Sub-line in Ink: `Giao dịch đã ngừng tính vào Sổ chi tiêu.` / `Transactions no longer count in Sổ chi tiêu.` (for members; guests/viewers see the deletion countdown line without Sổ chi tiêu wording if irrelevant, or keep the same concise banner — see section 8).
  - For the **organiser only** (`view.me.isOrganiser`), include an inline pill button `Hủy xóa` / `Cancel deletion` right inside the banner that calls `POST /api/trips/:id/cancel-delete`, refreshes trip/trips/personal queries + `requestGroupCopySync()`, and shows a confirmation `Snackbar` **(my call, owner-confirmed)**. Non-organiser members, guests, and viewers see the banner without the button.

## 8. Left to the builder

- Exact filenames, helper function names, and component structure (e.g. a shared `DeletePendingBanner` component and `DeleteGroupSheet` component in `@cc/web-screens`, plus a pure date/countdown helper in `@cc/web-util` or `@cc/core`).
- Whether guests and view-only visitors see the "Transactions no longer count in Sổ chi tiêu" sub-line in the group banner or just the deletion countdown headline (either is fine; omitting Sổ chi tiêu wording for guests/viewers who have no Sổ chi tiêu is clean).
- Exact Vietnamese copy polish (following the house style at the top of `libs/web/i18n/src/vi.ts`, with `// REVIEW` markers on every new Vietnamese line).
- Exact React Query key list to invalidate for Sổ chi tiêu (`personalMoney.ts` / `txCopy`) so wallet totals, overview, and transaction list refresh immediately after scheduling or cancelling deletion.
- Exact `BATCH_LIMIT` in `purgeDeletedGroups` (suggested `10` trips per `:30` hourly tick via a single ~30-statement multi-trip batch, staying safely under Cloudflare Workers' 50-statement D1 limit and 100-param limit).
- Unit, API integration, and E2E test structure and fixtures (including updating `apps/api/test/settle.test.ts` for direct archived-group People settlements, and ensuring existing `fsl-*` classes, `data-testid` attributes, and style-guard tests continue to pass).
