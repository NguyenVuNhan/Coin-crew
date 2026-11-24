# Delete Archived Group Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a group organiser schedule 30-day delayed permanent deletion of an archived group (immediately dropping its transactions from Sổ chi tiêu while keeping People balances intact and recording People settlements directly inside archived groups), show countdown flags/banners with organiser cancel, and atomically purge expired groups on a dedicated hourly cron.

**Architecture:** Add a nullable `trips.delete_after` column with a partial index and expose `deleteAfter` on `TripView` and `TripListItem`. Gate schedule/cancel/unarchive transitions with `guardedTripWrite` and organiser-only permissions in `@cc/core`, filter pending-delete trips out of Sổ chi tiêu while fixing `me/balances.ts` to keep archived groups `writable: true` for People-tab settlements, and run a dedicated `:30` hourly Cloudflare Worker cron that atomically cascades up to 10 due trips in one ≤31-statement `db.batch`. On the web/Zalo UI (`@cc/web-screens`), add a `Sheet`-based confirmation flow in `Settings`, countdown flags on `MyTrips`, and a shared `DeletePendingBanner` across `MemberTrip`, `GuestTrip`, and `ViewOnlyTrip`.

**Tech Stack:** TypeScript (Nx monorepo), Cloudflare Workers + D1 + Drizzle ORM, Hono, React + React Query + Tailwind v4 (`@cc/web-ui` wrappers), Vitest + `@cloudflare/vitest-plugin`.

**Spec:** `docs/superpowers/specs/2026-11-22-delete-archived-group-design.md`

## Global Constraints

- Cloudflare Workers + D1 free plan: max **50 D1 statements per Worker invocation** (every statement inside `db.batch([...])` counts) and max **100 bound parameters per query**; no unindexed scans on `trips`.
- Hand-written additive SQL migration (`apps/api/migrations/0033_delete_archived_group.sql`) mirroring Drizzle schema (`libs/api/db/src/schema.ts`).
- Respect Nx library boundaries (`CLAUDE.md`): `util -> i18n -> ui / platform -> data-access -> screens -> app`; API `util -> db -> auth -> app`; web and API never import each other; use relative imports inside a library and `@cc/*` across libraries. Always run lint via `npm run lint` (Nx).
- UI follows `DESIGN.md`: theme tokens only (`bg-danger-soft`, `text-danger`, `bg-warning-soft`, `border-warning-border`, `text-warning-foreground`, etc.), no raw hex, no per-component `.css` files (`style-guard.test.ts` enforces both), app wrappers (`Button`, `Sheet`, `Pill`, `Snackbar`, `InlineError`, `Icon`) instead of raw shadcn `Drawer`/`Dialog` or `window.confirm`, touch targets ≥44px (`min-h-11`), preserve existing `fsl-*` classes and `data-testid` attributes.
- Copy (`PRODUCT.md`): Vietnamese first, English second, plain everyday wording without jargon; mark every new Vietnamese string with `// REVIEW` in `libs/web/i18n/src/vi.ts`.
- Works in browsers, PWA standalone mode, Zalo in-app browser, and Zalo Mini App (`apps/zalo` shares `@cc/web-screens`).

## Review Focus

1. **D1 50-statement budget under max multi-trip purge:** Purging `BATCH_LIMIT` (`10`) due trips populated across all 27 tables in one `:30` cron invocation must stay strictly ≤50 D1 statements (counting every statement in `db.batch`) and ≤100 bound parameters per statement, and zero due trips must use ≤1 statement. *(Pinned in Task 4.)*
2. **Concurrent cancel-vs-purge and delete-vs-unarchive races:** A concurrent `cancel-delete` between `purgeDeletedGroups`'s `SELECT` and `batch` must roll back the entire batch with zero partial deletes; a concurrent `delete` vs `unarchive` must let only one win and return `409 CONFLICT` to the loser so `delete_after` is never set on an active trip. *(Pinned in Task 2 and Task 4.)*
3. **Preserving account-level bank details and personal direct ledgers during purge:** Purging a group whose signed-in members have account-level `bank_details` (`user_id IS NOT NULL`), a personal `direct` ledger (`preset = 'direct'`), and `person_links` to guests in the deleted group must delete only guest `bank_details` (`user_id IS NULL`) and `person_links` pointing to the deleted group's participants — never touching account bank details, `direct` ledgers, or other groups. *(Pinned in Task 4.)*
4. **Sổ chi tiêu round-trip across multiple members:** Scheduling deletion must immediately change `computeGroupsKey` and drop group rows from wallet balances, transaction lists, and `group-rows` sync for *all* active members (not just the organiser), and cancelling within 30 days must restore their custom `personal_group_links` (wallet, category, tags, intent, report exclusion) intact. *(Pinned in Task 3.)*
5. **Final-hour countdown boundary and unmounting banner snackbar:** When `deleteAfter <= now` (before the `:30` tick runs), UI shows "Deletes today" / "Xóa trong hôm nay" (never `0` or negative days); cancelling from `DeletePendingBanner` inside `MemberTrip` keeps the confirmation `Snackbar` visible after the banner itself unmounts. *(Pinned in Task 1 and Task 7.)*

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `libs/shared/core/src/permissions.ts` | Modify | Add `'delete_group'` and `'cancel_delete_group'` organiser-only actions |
| `libs/shared/core/src/api-types.ts` | Modify | Add optional `deleteAfter?: string \| null` on `TripView['trip']` & `TripListItem`; add `trip_delete_scheduled` & `trip_delete_cancelled` to `ActivityAction` |
| `libs/web/util/src/time.ts` | Modify | Export pure `deleteDaysLeft(deleteAfter, nowMs?)` and `formatDeleteDate(iso, lang)` helpers |
| `apps/api/migrations/0033_delete_archived_group.sql` | Create | Add `trips.delete_after` column and partial index `trips_delete_after_idx` |
| `libs/api/db/src/schema.ts` | Modify | Add `deleteAfter` column and partial index on `trips` |
| `apps/api/src/trips/snapshot.ts` | Modify | Include `deleteAfter` in `buildSnapshot` and conditionally on `TripListItem` in `loadTripList` |
| `apps/api/src/trips/routes.ts` | Modify | Add `POST /trips/:id/delete`, `POST /trips/:id/cancel-delete`; guard `unarchive` while pending delete; clear unsent `push_reminders` on archive/delete |
| `apps/api/src/notifications/push/reminders.ts` | Modify | Exclude archived trips (`isNull(trips.archivedAt)`) in `rebuildSessionReminders` and `rebuildRemindersForSubscription` |
| `apps/api/src/personal/groupShares.ts` | Modify | Exclude `trips.deleteAfter IS NOT NULL` in `computeGroupsKey` and `loadGroupRows` |
| `apps/api/src/personal/groupLinks.ts` | Modify | Reject `PUT /me/personal/group-links/:rootId` with `404` when trip has `deleteAfter` set |
| `apps/api/src/me/balances.ts` | Modify | Set `writable: true` for archived groups in `loadPeopleSummary` and `loadPersonItems` so People settlements record directly inside archived groups |
| `apps/api/src/trips/purge.ts` | Create | Implement `purgeDeletedGroups(env, now)` multi-trip atomic 27-table cascade purge |
| `apps/api/src/index.ts` | Modify | Route `"30 * * * *"` exclusively to `purgeDeletedGroups(env, now)` |
| `apps/api/wrangler.jsonc` | Modify | Add `"30 * * * *"` cron trigger |
| `libs/web/i18n/src/en.ts` | Modify | Add English copy for delete flow, confirmation sheet, countdown flags/banners, and activity actions |
| `libs/web/i18n/src/vi.ts` | Modify | Add Vietnamese copy (marked `// REVIEW`) mirroring `en.ts` |
| `libs/web/data-access/src/tripDelete.ts` | Create | Export `useScheduleTripDelete(tripId)` and `useCancelTripDelete(tripId)` with trip, trips, personal-money, and `groupCopy` invalidation |
| `libs/web/screens/src/components/DeleteGroupSheet.tsx` | Create | `Sheet`-based delete confirmation with Sổ chi tiêu/30-day/People warnings and conditional unsettled-balance callout |
| `libs/web/screens/src/components/DeletePendingBanner.tsx` | Create | Shared pending-delete countdown banner with optional organiser inline Cancel button |
| `libs/web/screens/src/screens/Settings.tsx` | Modify | Add archived Danger zone → `DeleteGroupSheet`; pending-delete view hiding Unarchive with `Cancel deletion` + `Snackbar` |
| `libs/web/screens/src/screens/MyTrips.tsx` | Modify | Show danger-soft countdown pill flag on pending-delete rows |
| `libs/web/screens/src/screens/MemberTrip.tsx` | Modify | Replace archived notice with `DeletePendingBanner` + host cancel `Snackbar` |
| `libs/web/screens/src/screens/GuestTrip.tsx` | Modify | Replace archived notice with `DeletePendingBanner` (no cancel action, no Sổ chi tiêu line) |
| `libs/web/screens/src/screens/ViewOnlyTrip.tsx` | Modify | Show `DeletePendingBanner` above view-only banner when pending delete |

---

### Task 1: Shared Core Permissions, API Types, and Countdown Helpers

**Files:**
- Modify: `libs/shared/core/src/permissions.ts:5-42`
- Modify: `libs/shared/core/src/api-types.ts:70-93,405-434`
- Modify: `libs/web/util/src/time.ts:1-44`
- Test: `libs/shared/core/test/permissions.test.ts`
- Create: `libs/web/util/src/__tests__/delete-countdown.test.ts`

**Interfaces:**
- Consumes: Existing `Actor`, `can`, `TripView`, `TripListItem`, `ActivityAction` in `@cc/core`, and `formatExpiry` convention in `@cc/web-util/time`.
- Produces:
  - `Action` union includes `'delete_group' | 'cancel_delete_group'`; `can(actor, 'delete_group')` and `can(actor, 'cancel_delete_group')` return `actor.kind === 'member' && actor.isOrganiser`.
  - `TripView['trip']` gains `deleteAfter?: string | null`; `TripListItem` gains `deleteAfter?: string | null`.
  - `ActivityAction` gains `'trip_delete_scheduled' | 'trip_delete_cancelled'`.
  - `deleteDaysLeft(deleteAfter: string, nowMs?: number): number` in `@cc/web-util/time` (returns `Math.ceil((target - nowMs) / 86_400_000)` when `target > nowMs`, else `0`; returns `0` on invalid dates).
  - `formatDeleteDate(iso: string, lang: 'vi' | 'en'): string` in `@cc/web-util/time` (Vietnam time `Asia/Ho_Chi_Minh`: `"22/12"` for `'vi'`, `"Dec 22"` for `'en'`; falls back to `iso` on invalid input).

- [ ] **Step 1: Write failing permission and countdown tests**

In `libs/shared/core/test/permissions.test.ts`, add matrix cases right after the `unarchive` rows:
```ts
['organiser delete_group', ORG, 'delete_group', undefined, true],
['admin member delete_group', ADM, 'delete_group', undefined, false],
['member delete_group', M, 'delete_group', undefined, false],
['guest delete_group', G, 'delete_group', undefined, false],
['viewer delete_group', viewer, 'delete_group', undefined, false],
['organiser cancel_delete_group', ORG, 'cancel_delete_group', undefined, true],
['admin member cancel_delete_group', ADM, 'cancel_delete_group', undefined, false],
['member cancel_delete_group', M, 'cancel_delete_group', undefined, false],
['guest cancel_delete_group', G, 'cancel_delete_group', undefined, false],
['viewer cancel_delete_group', viewer, 'cancel_delete_group', undefined, false],
```

Create `libs/web/util/src/__tests__/delete-countdown.test.ts` asserting (including Review Focus 5):
- `deleteDaysLeft('2026-12-22T10:00:00.000Z', Date.parse('2026-11-22T10:00:00.000Z'))` → `30`
- `deleteDaysLeft('2026-12-22T10:00:00.000Z', Date.parse('2026-12-22T09:59:00.000Z'))` → `1` (under 24h still positive)
- `deleteDaysLeft('2026-12-22T10:00:00.000Z', Date.parse('2026-12-22T10:00:00.000Z'))` → `0` (exact boundary)
- `deleteDaysLeft('2026-12-22T10:00:00.000Z', Date.parse('2026-12-22T10:45:00.000Z'))` → `0` (final-hour window before `:30` cron, never negative)
- `deleteDaysLeft('not-a-date', Date.now())` → `0`
- `formatDeleteDate('2026-12-22T05:00:00.000Z', 'vi')` → `'22/12'`
- `formatDeleteDate('2026-12-22T05:00:00.000Z', 'en')` → `'Dec 22'`
- `formatDeleteDate('2026-12-21T18:30:00.000Z', 'vi')` → `'22/12'` (UTC+7 crosses midnight cleanly)
- `formatDeleteDate('not-a-date', 'vi')` → `'not-a-date'`

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run libs/shared/core/test/permissions.test.ts` and `npx vitest run libs/web/util/src/__tests__/delete-countdown.test.ts`
Expected: FAIL (missing permission cases / missing `deleteDaysLeft` & `formatDeleteDate` exports).

- [ ] **Step 3: Implement shared core additions and countdown helpers**

- In `libs/shared/core/src/permissions.ts`: add `'delete_group' | 'cancel_delete_group'` to `Action` and place both cases alongside `'archive'` and `'unarchive'` returning `isMember && actor.isOrganiser`.
- In `libs/shared/core/src/api-types.ts`:
  - Add `'trip_delete_scheduled' | 'trip_delete_cancelled'` to `ActivityAction`.
  - Add `deleteAfter?: string | null;` to `TripView['trip']` and `TripListItem`.
- In `libs/web/util/src/time.ts`: export `deleteDaysLeft(deleteAfter: string, nowMs = Date.now()): number` and `formatDeleteDate(iso: string, lang: 'vi' | 'en'): string` (using `timeZone: 'Asia/Ho_Chi_Minh'`; `'vi'` formats `dd/MM` via `'en-GB'`, `'en'` formats `{ month: 'short', day: 'numeric' }` via `'en-US'`).

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run libs/shared/core/test/permissions.test.ts` and `npx vitest run libs/web/util/src/__tests__/delete-countdown.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/shared/core/src/permissions.ts libs/shared/core/src/api-types.ts libs/shared/core/test/permissions.test.ts libs/web/util/src/time.ts libs/web/util/src/__tests__/delete-countdown.test.ts
git commit -m "feat(core,web-util): add delete-group permissions, types, and countdown helpers"
```

---

### Task 2: Database Migration, Schema, Delete/Cancel/Unarchive Routes, and Push Reminder Exclusion

**Files:**
- Create: `apps/api/migrations/0033_delete_archived_group.sql`
- Modify: `libs/api/db/src/schema.ts:60-84`
- Modify: `apps/api/src/trips/snapshot.ts:465-480,729-736`
- Modify: `apps/api/src/trips/routes.ts:446-494`
- Modify: `apps/api/src/notifications/push/reminders.ts:66-104`
- Create: `apps/api/test/trip-delete.test.ts`

**Interfaces:**
- Consumes: `delete_group`, `cancel_delete_group`, `TripView['trip']['deleteAfter']`, `TripListItem['deleteAfter']`, `trip_delete_scheduled`, `trip_delete_cancelled` from Task 1; `guardedTripWrite` from `@cc/api-db/commit`.
- Produces:
  - SQL column `trips.delete_after text` + partial index `trips_delete_after_idx`.
  - `POST /api/trips/:id/delete` → `200 { deleteAfter: string }` (idempotent when already set; `403` for non-organiser or `preset = 'direct'`; `409 CONFLICT` when not archived).
  - `POST /api/trips/:id/cancel-delete` → `204` (idempotent when not pending delete; `403` for non-organiser or `preset = 'direct'`).
  - `POST /api/trips/:id/unarchive` → `409 CONFLICT` when `deleteAfter` is set (and SQL race guard `AND delete_after IS NULL`).
  - `TripView.trip.deleteAfter` (`string | null`) and `TripListItem.deleteAfter` (included only when non-null so existing strict list assertions stay intact).

- [ ] **Step 1: Write failing API tests in `apps/api/test/trip-delete.test.ts`**

Cover:
1. Only organiser can schedule or cancel deletion (member, admin member, guest, viewer all get `403`).
2. `POST /api/trips/:id/delete` on an active (unarchived) group returns `409 CONFLICT`; on a personal `direct` ledger returns `403 FORBIDDEN`.
3. Organiser archives then calls `POST /api/trips/:id/delete` → `200 { deleteAfter }` (~30 days ahead); `GET /api/trips/:id` has `trip.archived === true` and `trip.deleteAfter === deleteAfter`; `GET /api/trips` includes `deleteAfter` on that item (and omits `deleteAfter` on non-pending trips); activity logs `trip_delete_scheduled` with `{ deleteAfter }`.
4. Idempotency: calling `POST /api/trips/:id/delete` a second time returns `200` with the **same** `deleteAfter`, does not bump version or add a duplicate `trip_delete_scheduled` activity row.
5. While pending delete: `POST /api/trips/:id/unarchive` returns `409 CONFLICT`; `PATCH /api/trips/:id` and `POST /api/trips/:id/leave` return `409 TRIP_ARCHIVED`; guest link (`groupToken`) and view link (`viewToken`) still return `200` with `trip.deleteAfter`.
6. Organiser calls `POST /api/trips/:id/cancel-delete` → `204`; group returns to archived (`archived: true`, `deleteAfter: null`), activity logs `trip_delete_cancelled`, second `cancel-delete` is idempotent `204` with no extra activity row, and `POST /api/trips/:id/unarchive` now succeeds (`204`).
7. **Review Focus 2 (delete vs unarchive race):** Install a SQLite `BEFORE UPDATE` trigger (following `apps/api/test/claim-race.test.ts` pattern) that simulates a concurrent unarchive clearing `archived_at` right before `POST /api/trips/:id/delete`'s guard executes, verifying `409 CONFLICT` is returned and `delete_after` remains `NULL`. Also test concurrent delete vs unarchive so `unarchive` returns `409 CONFLICT` if `delete_after` was concurrently set.
8. **Push reminders exclusion:** Archiving or scheduling deletion deletes unsent `push_reminders` (`sent_at IS NULL`) for the trip, and `rebuildSessionReminders` / `rebuildRemindersForSubscription` skip archived trips.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/api/test/trip-delete.test.ts`
Expected: FAIL (`404` on `/delete` and missing `delete_after` column).

- [ ] **Step 3: Add migration `0033_delete_archived_group.sql` and update Drizzle schema**

- Create `apps/api/migrations/0033_delete_archived_group.sql`:
  ```sql
  ALTER TABLE `trips` ADD COLUMN `delete_after` text;
  --> statement-breakpoint
  CREATE INDEX `trips_delete_after_idx` ON `trips` (`delete_after`) WHERE `delete_after` IS NOT NULL;
  ```
- In `libs/api/db/src/schema.ts` on `trips`: add `deleteAfter: text('delete_after'),` and index `index('trips_delete_after_idx').on(t.deleteAfter).where(sql`${t.deleteAfter} IS NOT NULL`)`.

- [ ] **Step 4: Wire snapshot, routes, and push reminder guards**

- In `apps/api/src/trips/snapshot.ts`:
  - In `buildSnapshot`: set `deleteAfter: trip.deleteAfter ?? null` inside `trip`.
  - In `loadTripList`: spread `...(row.trip.deleteAfter ? { deleteAfter: row.trip.deleteAfter } : {})` onto each pushed `TripListItem`.
- In `apps/api/src/trips/routes.ts`:
  - `POST /trips/:id/archive`: include `db.delete(pushReminders).where(and(eq(pushReminders.tripId, tripId), isNull(pushReminders.sentAt)))` in the `commitTripWrite` queries array.
  - `POST /trips/:id/unarchive`: if `actor.trip.deleteAfter` is set, throw `new ApiError('CONFLICT', 409, 'Cancel deletion before unarchiving this group.')`; switch to `guardedTripWrite` guarding `and(eq(trips.id, tripId), isNotNull(trips.archivedAt), isNull(trips.deleteAfter))`, with `onMiss` re-checking or throwing `new ApiError('CONFLICT', 409, 'Cancel deletion before unarchiving this group.')`.
  - Add `POST /trips/:id/delete`: reject `preset === 'direct'` (`403`), `ensure(actor, 'delete_group')`, require `actor.trip.archivedAt !== null` (`409 CONFLICT`), return idempotent `200 { deleteAfter }` if `actor.trip.deleteAfter` is already set, compute `deleteAfter = new Date(Date.now() + 30 * 86_400_000).toISOString()`, run `guardedTripWrite` setting `{ deleteAfter }` where `and(eq(trips.id, tripId), isNotNull(trips.archivedAt), isNull(trips.deleteAfter), ne(trips.preset, 'direct'))` plus deleting unsent `pushReminders`, logging `trip_delete_scheduled` with `{ deleteAfter }`. On guard miss, re-read `trips.deleteAfter`: if set return `200 { deleteAfter }`, else throw `409 CONFLICT`.
  - Add `POST /trips/:id/cancel-delete`: reject `preset === 'direct'` (`403`), `ensure(actor, 'cancel_delete_group')`, return idempotent `204` if `!actor.trip.deleteAfter`, run `guardedTripWrite` setting `{ deleteAfter: null }` where `and(eq(trips.id, tripId), isNotNull(trips.deleteAfter))`, logging `trip_delete_cancelled`, returning `204` (on guard miss return `204` idempotently since already cancelled).
- In `apps/api/src/notifications/push/reminders.ts`:
  - In `rebuildSessionReminders`: also select `archivedAt: trips.archivedAt` and return early if `trip.archivedAt !== null`.
  - In `rebuildRemindersForSubscription`: add `isNull(trips.archivedAt)` to the `.where(...)` clause.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run apps/api/test/trip-delete.test.ts apps/api/test/trips.test.ts apps/api/test/push-cron.test.ts`
Expected: PASS (all new and existing tests green).

- [ ] **Step 6: Commit**

```bash
git add apps/api/migrations/0033_delete_archived_group.sql libs/api/db/src/schema.ts apps/api/src/trips/snapshot.ts apps/api/src/trips/routes.ts apps/api/src/notifications/push/reminders.ts apps/api/test/trip-delete.test.ts
git commit -m "feat(api): add delete/cancel-delete routes, migration 0033, and push reminder guards"
```

---

### Task 3: Sổ chi tiêu Exclusion and Direct Archived-Group People Settlements

**Files:**
- Modify: `apps/api/src/personal/groupShares.ts:33-44,98-110`
- Modify: `apps/api/src/personal/groupLinks.ts:188-205`
- Modify: `apps/api/src/me/balances.ts:285-292,517-529`
- Modify: `apps/api/test/settle.test.ts:184-197`
- Create: `apps/api/test/trip-delete-personal-and-people.test.ts`

**Interfaces:**
- Consumes: `trips.deleteAfter`, `POST /api/trips/:id/delete`, `POST /api/trips/:id/cancel-delete` from Task 2.
- Produces:
  - `computeGroupsKey` and `loadGroupRows` exclude trips with `delete_after IS NOT NULL` (propagating automatically to `/me/personal/group-rows`, `/me/personal/sync`, `/me/personal/list`, and `/me/personal/wallets`).
  - `PUT /me/personal/group-links/:rootId` returns `404` for transactions belonging to a pending-delete trip.
  - `loadPeopleSummary` and `loadPersonItems` set `writable: true` on archived (and pending-delete) trips so `createSettlement` records archived-group settlement parts directly inside the archived group.

- [ ] **Step 1: Write failing tests for Sổ chi tiêu exclusion and People settlements**

Create `apps/api/test/trip-delete-personal-and-people.test.ts` asserting (including Review Focus 4):
1. Seed an archived group with an expense shared between Organiser (`A`) and Member (`B`), with personal area enabled for both and custom `personal_group_links` (custom wallet, category, tags, `excludeFromReports: true`) saved by `B`.
2. Before delete: both `A` and `B` see the expense in `GET /api/me/personal/group-rows`, `GET /api/me/personal/list`, `GET /api/me/personal/wallets` balance, and `GET /api/me/personal/sync?groups=show`.
3. `A` calls `POST /api/trips/:id/delete`:
   - `computeGroupsKey` changes immediately for **both** `A` and `B` (`GET /api/me/personal/group-rows?key=<oldKey>` returns `{ status: 'rows', rows: [] }` for that group).
   - Both `A`'s and `B`'s wallet balances, `/me/personal/list`, and `/me/personal/sync?groups=show` immediately exclude the group's transactions.
   - `PUT /api/me/personal/group-links/:rootId` for an expense in that group returns `404 NOT_FOUND`.
   - **People stays intact:** `GET /api/me/people/summary` and `GET /api/me/people/:key/history` still include the pending-delete group's balance for both `A` and `B`.
4. `A` calls `POST /api/trips/:id/cancel-delete`:
   - Both `A` and `B` immediately see the group's rows back in `/group-rows`, `/list`, `/wallets`, and `/sync`, **and** `B`'s custom `walletId`, `categoryId`, `tagIds`, and `excludeFromReports` link settings are intact.
5. **Archived People-tab settlement records directly inside the archived group:** With an archived group (`t-arch`) where Minh owes Owen 200k and Owen's `direct` ledger has 120k owed, settling 320k via `POST /api/me/people/u:u-minh/settle` writes a 200k payment into `t-arch` and a 120k payment into `direct` (leaving `t-arch`'s own `view.suggestions` empty and `direct` at 0₫, so later deleting `t-arch` leaves `0₫` instead of a phantom reverse debt). Also verify this works while `t-arch` is pending deletion during the 30-day wait.

Update `apps/api/test/settle.test.ts:184-196` (`'the part for an archived group goes to the ledger'` → rename to `'the part for an archived group lands in that archived group'`): assert `rows` contains `['t-bad', 'bad-m', 'bad-o', 200]`, `['t-din', 'din-o', 'din-m', 50]`, and `['t-led', 'led-m', 'led-o', 120]` and `minh()` nets to `0`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/api/test/trip-delete-personal-and-people.test.ts apps/api/test/settle.test.ts`
Expected: FAIL (pending-delete rows still appear in Sổ chi tiêu; archived settlement still redirects to `t-led`).

- [ ] **Step 3: Implement Sổ chi tiêu exclusion and People-settlement fix**

- In `apps/api/src/personal/groupShares.ts`:
  - Add `isNull` import from `'drizzle-orm'`.
  - Add `isNull(trips.deleteAfter)` to the `.where(...)` clause in both `computeGroupsKey` and `loadGroupRows`.
- In `apps/api/src/personal/groupLinks.ts`:
  - Import `trips` from `@cc/api-db/schema`.
  - In `PUT /me/personal/group-links/:rootId`, join `trips` (`eq(trips.id, transactions.tripId)`) and add `isNull(trips.deleteAfter)` to the `.where(...)` clause.
- In `apps/api/src/me/balances.ts`:
  - Change `writable: trip.archivedAt === null` to `writable: true` at lines 288, 525, and 527 (leaving `archived: trip.archivedAt !== null || o.status === 'left'` at line 194 untouched so archived groups still cannot be merged or renamed).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run apps/api/test/trip-delete-personal-and-people.test.ts apps/api/test/settle.test.ts apps/api/test/personal-group-cost.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/personal/groupShares.ts apps/api/src/personal/groupLinks.ts apps/api/src/me/balances.ts apps/api/test/settle.test.ts apps/api/test/trip-delete-personal-and-people.test.ts
git commit -m "feat(api): exclude pending-delete groups from spending book and settle archived groups in place"
```

---

### Task 4: Dedicated `:30` Hourly Permanent-Deletion Purge Cron

**Files:**
- Create: `apps/api/src/trips/purge.ts`
- Modify: `apps/api/src/index.ts:1-26`
- Modify: `apps/api/wrangler.jsonc:28`
- Modify: `apps/api/test/push-cron.test.ts:262-298`
- Create: `apps/api/test/trip-purge.test.ts`

**Interfaces:**
- Consumes: `trips.deleteAfter` and partial index from Task 2; all 27 trip-related tables in `@cc/api-db/schema`.
- Produces:
  - `export const PURGE_BATCH_LIMIT = 10;`
  - `export async function purgeDeletedGroups(env: Env, now: Date): Promise<void>` in `apps/api/src/trips/purge.ts`.
  - Cron trigger `"30 * * * *"` in `apps/api/wrangler.jsonc`, routed exclusively in `apps/api/src/index.ts` `scheduled()`.

- [ ] **Step 1: Write failing purge and cron-routing tests**

Create `apps/api/test/trip-purge.test.ts` covering:
1. **Zero due trips (fast path, Review Focus 1):** Wrap `env.DB` with a counting proxy (counting every `prepare` and every statement inside `batch`) and assert `purgeDeletedGroups(env, now)` prepares **1 statement** when no trip is due (and skips trips whose `delete_after > now`).
2. **Complete 27-table wipe + FK integrity:** Seed one due trip with rows in **every** dependent table (`personal_group_link_tags`, `personal_group_links`, `participant_merge_rows`, `participant_merges`, `transaction_shares`, `transactions`, guest `bank_details`, `person_links`, pending & historical `account_merge_requests` with `claim_trip_id`, `notification_logs` with `trip_id`, `trip_views`, `activity`, `payment_refs`, `player_ratings`, `membership_requests`, `merge_proposals`, `zalo_chat_links`, `device_participants`, `device_expense_grants`, `payment_keys`, `push_reminders`, `trip_locations`, `attendance_scores`, `attendance_counted`, `attendance_state`, `participants`, `trips`). Run `purgeDeletedGroups`, assert all trip rows are removed, pending `account_merge_requests` for that trip are `cancelled` with nullified `claim_trip_id`/`claim_participant_id`, `GET /api/trips/:id` returns `404`, `GET /api/links/:token` returns `410 LINK_DEAD`, and People summary no longer shows that trip's balance.
3. **Preservation of unrelated data (Review Focus 3):** Alongside the due trip, seed a signed-in member's account-level `bank_details` (`user_id IS NOT NULL`), their personal `direct` ledger (`preset = 'direct'`, even if corrupted with a `delete_after` in SQL), and a second active group with expenses and `personal_group_links`. Assert none of those rows are deleted or altered.
4. **Max batch statement budget (Review Focus 1):** Seed `12` due trips (more than `PURGE_BATCH_LIMIT = 10`) with dependent rows. Run `purgeDeletedGroups` once with the counting D1 wrapper: assert **10** trips are deleted, **2** remain for the next tick, and total prepared statements (counting every item in `db.batch`) is **≤ 35** (strictly under D1's 50-statement cap). Run a second tick: the remaining 2 are purged.
5. **Concurrent cancel race rollback (Review Focus 2):** Install a `BEFORE UPDATE` trigger on `trips` that clears `delete_after = NULL` when `purgeDeletedGroups`'s guard runs on one of the selected trips; assert `purgeDeletedGroups` resolves without throwing and **zero** rows across all tables were deleted (atomic rollback).

Update `apps/api/test/push-cron.test.ts`: add a test verifying `worker.scheduled({ cron: '30 * * * *' }, env, ctx)` calls ONLY `purgeDeletedGroups` (not `sendDueReminders`, `sendWeeklyLoanReminders`, or `sendMonthlyNotices`), and that `0 * * * *` and `*/5 * * * *` do NOT call `purgeDeletedGroups`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/api/test/trip-purge.test.ts apps/api/test/push-cron.test.ts`
Expected: FAIL (missing `apps/api/src/trips/purge.ts` / missing `30 * * * *` branch).

- [ ] **Step 3: Implement `apps/api/src/trips/purge.ts` and wire `index.ts` + `wrangler.jsonc`**

- Create `apps/api/src/trips/purge.ts`:
  - `export const PURGE_BATCH_LIMIT = 10;`
  - `purgeDeletedGroups(env: Env, now: Date): Promise<void>`:
    1. `const nowStr = now.toISOString();`
    2. Select due IDs (1 query): `db.select({ id: trips.id }).from(trips).where(and(isNotNull(trips.deleteAfter), lte(trips.deleteAfter, nowStr), ne(trips.preset, 'direct'))).orderBy(asc(trips.deleteAfter)).limit(PURGE_BATCH_LIMIT).all()`. Return early if empty.
    3. Build ONE atomic `db.batch([...])` of 29–30 statements for `ids`:
       - Guard 1: `db.update(trips).set({ deleteAfter: sql`${trips.deleteAfter}` }).where(and(inArray(trips.id, ids), isNotNull(trips.deleteAfter), lte(trips.deleteAfter, nowStr), ne(trips.preset, 'direct')))`
       - Guard 2: `db.update(trips).set({ version: sql`CASE WHEN changes() = ${ids.length} THEN ${trips.version} + 1 ELSE NULL END` }).where(eq(trips.id, ids[0]!))`
       - Deletes/updates in dependency order (exact 27-table list from Spec §6.3):
         1. `personalGroupLinkTags`: `WHERE EXISTS (SELECT 1 FROM personal_group_links pgl WHERE pgl.user_id = personal_group_link_tags.user_id AND pgl.root_id = personal_group_link_tags.root_id AND pgl.trip_id IN (...ids))`
         2. `personalGroupLinks` (`inArray(tripId, ids)`)
         3. `participantMergeRows` (`inArray(mergeId, select id from participantMerges where tripId in ids)`)
         4. `participantMerges` (`inArray(tripId, ids)`)
         5. `transactionShares` (`inArray(transactionId, select id from transactions where tripId in ids)`)
         6. `transactions` (`inArray(tripId, ids)`)
         7. `bankDetails` (`and(isNull(bankDetails.userId), inArray(bankDetails.participantId, select id from participants where tripId in ids))`)
         8. `personLinks` (`inArray(personLinks.participantId, select id from participants where tripId in ids)`)
         9. `accountMergeRequests` update 1: cancel pending (`status = 'cancelled', decidedAt = nowStr, claimTripId = null, claimParticipantId = null` where `and(inArray(claimTripId, ids), eq(status, 'pending'))`) — and update 2: nullify `claimTripId = null, claimParticipantId = null` where `inArray(claimTripId, ids)` (note: can even be combined into 1 `UPDATE` using `CASE WHEN status = 'pending' THEN 'cancelled' ELSE status END` and `CASE WHEN status = 'pending' THEN ${nowStr} ELSE decided_at END` to save 1 statement!).
         10. `notificationLogs` (`inArray(tripId, ids)`)
         11–25. `tripViews`, `activity`, `paymentRefs`, `playerRatings`, `membershipRequests`, `mergeProposals`, `zaloChatLinks`, `deviceParticipants`, `deviceExpenseGrants`, `paymentKeys`, `pushReminders`, `tripLocations`, `attendanceScores`, `attendanceCounted`, `attendanceState` (each `inArray(tripId, ids)`)
         26. `participants` (`inArray(tripId, ids)`)
         27. `trips` (`inArray(id, ids)`) — last statement!
    4. Wrap in `try/catch`: silently ignore `isDbError(err, 'NOT NULL constraint failed: trips.version')` (concurrent cancel guard hit); log any other error via `console.error('Failed to purge deleted groups:', err)`.
- In `apps/api/wrangler.jsonc`: change `"crons": ["0 * * * *", "*/5 * * * *"]` to `"crons": ["0 * * * *", "30 * * * *", "*/5 * * * *"]`.
- In `apps/api/src/index.ts`: import `purgeDeletedGroups` from `./trips/purge` and add `if (controller.cron === '30 * * * *') { ctx.waitUntil(purgeDeletedGroups(env, now)); return; }` before the `:00` tasks.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run apps/api/test/trip-purge.test.ts apps/api/test/push-cron.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/trips/purge.ts apps/api/src/index.ts apps/api/wrangler.jsonc apps/api/test/trip-purge.test.ts apps/api/test/push-cron.test.ts
git commit -m "feat(api): add dedicated hourly purge cron for expired deleted groups"
```

---

### Task 5: i18n Copy and Data-Access Delete/Cancel Mutations

**Files:**
- Modify: `libs/web/i18n/src/en.ts:99-105,640-655,728-735`
- Modify: `libs/web/i18n/src/vi.ts:103-109,644-659,732-739`
- Create: `libs/web/data-access/src/tripDelete.ts`
- Create: `libs/web/data-access/src/__tests__/trip-delete.test.tsx`

**Interfaces:**
- Consumes: `POST /api/trips/:id/delete`, `POST /api/trips/:id/cancel-delete` (Task 2); `WALLETS_KEY` from `./personal`, `PERSONAL_SUMMARY_KEY`, `PERSONAL_LIST_KEY`, `PERSONAL_HOLDINGS_KEY` from `./personalMoney`, and `requestGroupCopySync` from `./txCopy/groupCopy`.
- Produces:
  - i18n keys in both `en.ts` and `vi.ts` (all new `vi.ts` lines marked `// REVIEW`):
    - `trips.deleteInOneDay` / `trips.deleteInDays` (`{days}`) / `trips.deleteToday`
    - `settings.deleteGroup`, `settings.deleteGroupHint`, `settings.deleteSheetTitle` (`{group}`), `settings.deleteWarnBook`, `settings.deleteWarnWait` (`{date}`), `settings.deleteWarnPeople`, `settings.deleteWarnUnsettled`, `settings.deleteConfirm`, `settings.cancelDelete`, `settings.cancelDeleteShort`, `settings.cancelDeleteHint`, `settings.cancelDeleteSuccess`
    - `trip.deleteBannerHeadlineOneDay` (`{date}`), `trip.deleteBannerHeadline` (`{days}`, `{date}`), `trip.deleteBannerHeadlineToday`, `trip.deleteBannerBookNote`
    - `activity.action.trip_delete_scheduled`, `activity.action.trip_delete_cancelled`
  - `useScheduleTripDelete(tripId: string)` → React Query `UseMutationResult<{ deleteAfter: string }, ApiClientError, void>`
  - `useCancelTripDelete(tripId: string)` → React Query `UseMutationResult<void, ApiClientError, void>`

- [ ] **Step 1: Write failing hook test in `libs/web/data-access/src/__tests__/trip-delete.test.tsx`**

Assert:
1. `useScheduleTripDelete('t-1')` sends `POST /api/trips/t-1/delete`, invalidates `['trip', 't-1']`, `['trips']`, `WALLETS_KEY`, `PERSONAL_SUMMARY_KEY`, `PERSONAL_LIST_KEY`, and `PERSONAL_HOLDINGS_KEY`, and invokes `requestGroupCopySync()`.
2. `useCancelTripDelete('t-1')` sends `POST /api/trips/t-1/cancel-delete`, performs the exact same query invalidations and `requestGroupCopySync()` call.
3. Failed requests expose `ApiClientError` without swallowing errors.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run libs/web/data-access/src/__tests__/trip-delete.test.tsx`
Expected: FAIL (missing `tripDelete.ts`).

- [ ] **Step 3: Add i18n copy and implement `libs/web/data-access/src/tripDelete.ts`**

- In `libs/web/i18n/src/en.ts` and `libs/web/i18n/src/vi.ts`, add the exact keys listed in Interfaces (matching the approved wording from the mockup and Spec §7; every new `vi.ts` line carries `// REVIEW`; `vi.ts` satisfies `Record<MessageKey, string>`).
- Create `libs/web/data-access/src/tripDelete.ts` exporting `useScheduleTripDelete(tripId: string)` and `useCancelTripDelete(tripId: string)`:
  - Shared helper `invalidateAfterDeleteToggle(queryClient, tripId)` awaits `Promise.all` of `invalidateQueries` on `['trip', tripId]`, `['trips']`, `WALLETS_KEY`, `PERSONAL_SUMMARY_KEY`, `PERSONAL_LIST_KEY`, `PERSONAL_HOLDINGS_KEY`, and calls `void requestGroupCopySync()`.

- [ ] **Step 4: Run tests (including i18n parity test)**

Run: `npx vitest run libs/web/data-access/src/__tests__/trip-delete.test.tsx` and `npx nx test web-i18n`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/web/i18n/src/en.ts libs/web/i18n/src/vi.ts libs/web/data-access/src/tripDelete.ts libs/web/data-access/src/__tests__/trip-delete.test.tsx
git commit -m "feat(web): add delete-group i18n copy and React Query mutation hooks"
```

---

### Task 6: `DeleteGroupSheet`, `DeletePendingBanner`, and Group Settings Flow

**Files:**
- Create: `libs/web/screens/src/components/DeleteGroupSheet.tsx`
- Create: `libs/web/screens/src/components/DeletePendingBanner.tsx`
- Modify: `libs/web/screens/src/screens/Settings.tsx:1-226`
- Create: `libs/web/screens/src/screens/__tests__/settings-delete.test.tsx`

**Interfaces:**
- Consumes: `deleteDaysLeft`, `formatDeleteDate` from `@cc/web-util/time`; `useScheduleTripDelete`, `useCancelTripDelete` from `@cc/web-data-access/tripDelete`; i18n keys from Task 5; `Sheet`, `Button`, `InlineError`, `Snackbar`, `Icon` from `@cc/web-ui/components/*`.
- Produces:
  - `export function DeleteGroupSheet(props: { open: boolean; onClose(): void; tripId: string; tripName: string; hasUnsettled: boolean; onScheduled(): void }): JSX.Element`
  - `export function DeletePendingBanner(props: { tripId: string; deleteAfter: string; canCancel: boolean; showSpendingBookNote: boolean; onCancelled?: () => void }): JSX.Element`
  - Updated `Settings` screen supporting archived Danger zone → `DeleteGroupSheet` and pending-delete cancel state.

- [ ] **Step 1: Write failing screen tests in `libs/web/screens/src/screens/__tests__/settings-delete.test.tsx`**

Cover:
1. Archived group + organiser: renders `Unarchive group` AND Danger zone with `Delete group` button (never calls `window.confirm`). Non-organiser admin/member on an archived group does NOT see `Delete group`.
2. Clicking `Delete group` opens the `Sheet` titled `Delete "<name>"?`, displaying the Sổ chi tiêu immediate-exclusion warning, the 30-day permanent-deletion date, and the People-balances-stay-for-30-days warning.
3. Unsettled callout: when `view.suggestions` is non-empty OR any payment has `status: 'says_paid'`, the sheet shows the unsettled-balance warning callout; when both are empty, the callout is not rendered.
4. Confirming `Delete in 30 days` calls `POST /api/trips/t-1/delete`, closes the sheet, and navigates back to `/t/t-1`. API failure shows `InlineError` inside the sheet without closing it.
5. Pending-delete group (`deleteAfter` set) + organiser: hides `Unarchive group` and `Delete group`, shows the pending-delete countdown notice (`days` + date) and `Cancel deletion` button. Clicking `Cancel deletion` calls `POST /api/trips/t-1/cancel-delete`, stays on `/t/t-1/settings`, and shows the confirmation `Snackbar`.
6. Pending-delete group + non-organiser: shows the pending-delete countdown notice without `Cancel deletion` or `Unarchive`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run libs/web/screens/src/screens/__tests__/settings-delete.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement `DeleteGroupSheet`, `DeletePendingBanner`, and update `Settings.tsx`**

- Create `libs/web/screens/src/components/DeleteGroupSheet.tsx`:
  - Uses `@cc/web-ui/components/Sheet` (`open`, `onClose`, `title={t('settings.deleteSheetTitle', { group: tripName })}`).
  - Uses `useScheduleTripDelete(tripId)`.
  - Computes preview deletion date `formatDeleteDate(new Date(Date.now() + 30 * 86_400_000).toISOString(), lang)`.
  - Renders `InlineError` on `mutation.error`, optional `bg-danger-soft text-danger rounded-xl p-3 text-sm` callout when `hasUnsettled` is true, `bg-warning-soft border border-warning-border text-warning-foreground rounded-xl p-3.5 text-sm` list with the 3 warning points, `Button variant="danger" block loading={mutation.isPending}`, and `Button variant="ghost" block onClick={onClose}` (disabled while pending).
  - On mutate success: call `onClose()` then `onScheduled()`.
- Create `libs/web/screens/src/components/DeletePendingBanner.tsx`:
  - Computes `days = deleteDaysLeft(deleteAfter)` and `date = formatDeleteDate(deleteAfter, lang)`.
  - Picks headline key: `days <= 0` → `trip.deleteBannerHeadlineToday`, `days === 1` → `trip.deleteBannerHeadlineOneDay`, else `trip.deleteBannerHeadline`.
  - Uses `bg-danger-soft rounded-xl px-4 py-3` container with `Icon name="clock"` (`text-danger`), `text-danger font-semibold text-sm` headline, optional `text-foreground text-sm` `trip.deleteBannerBookNote` when `showSpendingBookNote` is true.
  - When `canCancel` is true, renders a Lychee-outlined white pill button (`min-h-11` / `Button variant="secondary"` styled consistently with `Settings` danger-outline or `Button` wrapper with `className` using theme tokens only) calling `useCancelTripDelete(tripId)` and invoking `onCancelled?.()` on success, plus `InlineError` on failure.
- Update `libs/web/screens/src/screens/Settings.tsx`:
  - Derive `deleteAfter = view.trip.deleteAfter ?? null`, `pendingDelete = Boolean(deleteAfter)`, `hasUnsettled = view.suggestions.length > 0 || view.payments.some((p) => p.status === 'says_paid')`.
  - When `archived && pendingDelete`: render the pending-delete countdown notice (using `DeletePendingBanner` with `canCancel={false}` or dedicated notice block + organiser-only full-width `Button variant="secondary"` `Cancel deletion` + muted hint calling `useCancelTripDelete`), hiding `Unarchive group` and `Delete group`. Render `<Snackbar message={t('settings.cancelDeleteSuccess')} />` when cancel succeeds (auto-dismissing after 4s, matching `MyTrips`).
  - When `archived && !pendingDelete`: keep existing muted archived notice + organiser `Unarchive group` block, and add the organiser-only `Danger zone` section below with the Lychee-outlined `Delete group` button + hint + `<DeleteGroupSheet ... onScheduled={goBack} />`.
  - Keep all existing `fsl-settings*` classes and `settings-leave.test.tsx` behaviour intact.

- [ ] **Step 4: Run screen tests and style guard**

Run: `npx vitest run libs/web/screens/src/screens/__tests__/settings-delete.test.tsx libs/web/screens/src/screens/__tests__/settings-leave.test.tsx libs/web/screens/src/test/style-guard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/web/screens/src/components/DeleteGroupSheet.tsx libs/web/screens/src/components/DeletePendingBanner.tsx libs/web/screens/src/screens/Settings.tsx libs/web/screens/src/screens/__tests__/settings-delete.test.tsx
git commit -m "feat(web-screens): add DeleteGroupSheet, DeletePendingBanner, and Settings delete flow"
```

---

### Task 7: Groups List Countdown Flag, Group Page Banners, and Full Workspace Verification

**Files:**
- Modify: `libs/web/screens/src/screens/MyTrips.tsx:122-180`
- Modify: `libs/web/screens/src/screens/MemberTrip.tsx:40-85,155-186`
- Modify: `libs/web/screens/src/screens/GuestTrip.tsx:125-135`
- Modify: `libs/web/screens/src/screens/ViewOnlyTrip.tsx:34-42,83-90`
- Modify: `libs/web/screens/src/screens/__tests__/trips.test.tsx`
- Create: `libs/web/screens/src/screens/__tests__/trip-delete-banners.test.tsx`

**Interfaces:**
- Consumes: `DeletePendingBanner` (Task 6), `deleteDaysLeft` (Task 1), `Pill` and `Icon` from `@cc/web-ui/components/*`, i18n keys (Task 5).
- Produces: Complete end-to-end UI across Groups list and Member/Guest/ViewOnly trip views, verified by full workspace lint, typecheck, and tests.

- [ ] **Step 1: Write failing tests for Groups list flag and Member/Guest/ViewOnly banners**

In `libs/web/screens/src/screens/__tests__/trips.test.tsx`, add tests asserting:
- A pending-delete trip row displays the danger pill flag (`Deletes in 29 days` / `Deletes today` when `deleteAfter <= now`) alongside `· archived`.
- An ordinary archived trip without `deleteAfter` renders no deletion countdown pill.

Create `libs/web/screens/src/screens/__tests__/trip-delete-banners.test.tsx` covering (including Review Focus 5):
1. `MemberTrip` + organiser + `deleteAfter` 29 days out: replaces muted archived notice with `DeletePendingBanner` showing days + date + Sổ chi tiêu note + `Cancel deletion` button. Clicking `Cancel deletion` calls `POST /api/trips/t-1/cancel-delete`, refetches `GET /api/trips/t-1` (returning `deleteAfter: null`), unmounts the banner, and **keeps the confirmation `Snackbar` visible**.
2. `MemberTrip` + non-organiser member + `deleteAfter` set: shows the countdown banner and Sổ chi tiêu note, with NO `Cancel deletion` button.
3. `MemberTrip` + `deleteAfter` in the past (before `:30` cron): shows `Deletes today` (never `0` or negative days).
4. `GuestTrip` + `deleteAfter` set: replaces muted archived notice with `DeletePendingBanner` (no `Cancel deletion` button, no Sổ chi tiêu note).
5. `ViewOnlyTrip` + `deleteAfter` set: renders `DeletePendingBanner` above the view-only banner (no `Cancel deletion` button, no Sổ chi tiêu note).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run libs/web/screens/src/screens/__tests__/trips.test.tsx libs/web/screens/src/screens/__tests__/trip-delete-banners.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Wire `MyTrips`, `MemberTrip`, `GuestTrip`, and `ViewOnlyTrip`**

- In `libs/web/screens/src/screens/MyTrips.tsx`: when `trip.deleteAfter` is set, compute `days = deleteDaysLeft(trip.deleteAfter)` and render a `<Pill tone="danger" className="fsl-my-trips__delete-flag mt-1 w-fit inline-flex items-center gap-1">` containing `<Icon name="clock" size={12} />` and the countdown text (`trips.deleteToday` / `trips.deleteInOneDay` / `trips.deleteInDays`) inside `.fsl-my-trips__row-info`.
- In `libs/web/screens/src/screens/MemberTrip.tsx`:
  - Hold `const [cancelNotice, setCancelNotice] = useState(false)` with 4s auto-clear timeout (so the `<Snackbar>` survives `DeletePendingBanner` unmounting on cancel!).
  - Replace `notice`: when `view.trip.deleteAfter` is set, render `<DeletePendingBanner tripId={view.trip.id} deleteAfter={view.trip.deleteAfter} canCancel={view.me.isOrganiser} showSpendingBookNote onCancelled={() => setCancelNotice(true)} />`; else keep the existing muted archived notice. Render `{cancelNotice && <Snackbar message={t('settings.cancelDeleteSuccess')} />}` at the bottom of `MemberTrip`.
- In `libs/web/screens/src/screens/GuestTrip.tsx`: when `view.trip.deleteAfter` is set, render `<DeletePendingBanner tripId={view.trip.id} deleteAfter={view.trip.deleteAfter} canCancel={false} showSpendingBookNote={false} />` in place of the muted archived notice.
- In `libs/web/screens/src/screens/ViewOnlyTrip.tsx`: when `view.trip.deleteAfter` is set, render `<DeletePendingBanner tripId={view.trip.id} deleteAfter={view.trip.deleteAfter} canCancel={false} showSpendingBookNote={false} />` above `{banner}`.

- [ ] **Step 4: Run targeted screen tests, then full workspace lint, typecheck, and test suite**

Run: `npx vitest run libs/web/screens/src/screens/__tests__/trips.test.tsx libs/web/screens/src/screens/__tests__/trip-delete-banners.test.tsx`
Then run full workspace verification:
`npm run lint && npm run typecheck && npm test`
Expected: All lint checks (including Nx import rules), TypeScript checks, style-guard tests, and unit/API/screen tests PASS with zero errors.

- [ ] **Step 5: Commit**

```bash
git add libs/web/screens/src/screens/MyTrips.tsx libs/web/screens/src/screens/MemberTrip.tsx libs/web/screens/src/screens/GuestTrip.tsx libs/web/screens/src/screens/ViewOnlyTrip.tsx libs/web/screens/src/screens/__tests__/trips.test.tsx libs/web/screens/src/screens/__tests__/trip-delete-banners.test.tsx
git commit -m "feat(web-screens): show pending-delete countdown flags and group banners"
```
