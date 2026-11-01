# Quick Expenses, People View and Tikkie-style Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo, implementation tasks go to Gemini in Orca worktrees via the `gemini-execution` skill; Opus reviews.

**Goal:** Expenses without a group, a People tab netting every open balance per person across groups, Tikkie-style request links, cross-group settlement, nicknames, linking, rename/merge with a merge log and race-safe claims.

**Architecture:** Each user gets one hidden personal ledger: a `trips` row with `preset = 'direct'`, never listed under Groups, so quick expenses reuse the existing expense, payment, guest, bank and activity machinery unchanged. A pure core module computes per-person totals from each trip's existing `suggestions` (the transfers the group already shows), and spreads one settlement into per-trip payments sharing `metaJson.settlementId`. New `/me/people*` and `/r/:token` API routes sit on top; the web home becomes tabs People / Groups / Activity.

**Tech Stack:** TypeScript monorepo — `packages/core` (pure logic, vitest), `apps/api` (Hono on Cloudflare Workers + D1 + Drizzle, vitest with `cloudflare:test`), `apps/web` (React + Vite PWA, shadcn/ui + Tailwind v4, vitest + Testing Library), Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-10-31-quick-expenses-and-people-design.md`

## Global Constraints

- VND only; amounts are integer dong. Money renders with `Amount` / `tabular-nums`.
- D1: at most **100 bound parameters per query** and **50 queries per invocation** (free plan). No id lists as bound parameters; use subqueries (see `apps/api/src/me/people.ts`).
- Every trip write goes through `commitTripWrite` (`apps/api/src/lib/commit.ts`) so version + activity update.
- Money-safety rules (spec §5): owner-recorded items count straight away (including "a guest paid for me"); a guest's "I've paid" is `says_paid` until the receiver confirms; owner's "Paid in cash" as receiver is `confirmed`; guests cannot add expenses via a request link.
- Pair balance inside a group = that trip snapshot's `suggestions` between the two participants (spec §6a.1). Never invent pairwise debts.
- The word "simplify" never appears in UI copy. Vietnamese first, English second (`apps/web/src/i18n/vi.ts`, `en.ts`).
- UI: real shadcn components and app wrappers (`Button`, `Sheet`, `Modal`, `Pill`, `Avatar`, `Amount`, `Skeleton`, `InlineError`, `Snackbar`, `Icon`); theme only from `globals.css`; no raw hex; touch targets `min-h-11`; fields `text-base`. Keep existing `fsl-*` classes and `data-testid`s.
- Request link: **one per (owner, person) pair**; page shows single-request layout (A) when exactly one open item, netted layout (B) when two or more.
- Gemini may add tests but never edit or delete existing ones.

## Review Focus

1. **Person with no open items** opening a request link (everything already settled) → a friendly "You're all settled with Nhan" page, not an error or 0₫ QR. Test in Task 6.
2. **Owner has no bank details** → request page shows the total and "I've paid" but no QR, with a line asking to pay Nhan directly. Test in Task 6.
3. **Partial payment** (paid less than the net) → negative items settled fully, positive items oldest-first, last one partially; nothing lost or double-counted. Test in Task 1.
4. **Archived group** holding an open balance → still counted in People totals, but the settlement must not write into an archived trip; its part goes to the personal ledger instead. Test in Task 1 (`writable: false`) and Task 5.
5. **Same user is the owner's counterpart in many groups (≥ 30 trips)** → `/me/people` stays within the D1 query budget. Test in Task 4 with 30 seeded trips.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/core/src/people.ts` (new) | `pairItems`, `spreadSettlement`, `PersonKey` helpers — pure |
| `packages/core/src/api-types.ts` | `PersonSummary`, `PersonItem`, `RequestView`, `'direct'` preset |
| `apps/api/migrations/0009_people_ledger.sql` (new) | new columns and tables |
| `apps/api/src/db/schema.ts` | Drizzle for the above |
| `apps/api/src/me/ledger.ts` (new) | `ensurePersonalLedger`, import a person into the ledger |
| `apps/api/src/me/balances.ts` (new) | `loadPeopleSummary` + `GET /me/people/summary` |
| `apps/api/src/me/settle.ts` (new) | settlement writes + confirm |
| `apps/api/src/me/personRoutes.ts` (new) | nickname, link, request-link routes |
| `apps/api/src/requests/routes.ts` (new) | public `/r/:token` view and "I've paid" |
| `apps/api/src/participants/merge.ts`, `routes.ts` | merge log, claim rule |
| `apps/api/src/trips/routes.ts` | hide `direct` from `GET /trips` |
| `apps/web/src/screens/Home.tsx` (new) | tabs People / Groups / Activity |
| `apps/web/src/screens/PersonScreen.tsx` (new) | one person: items + actions |
| `apps/web/src/screens/RequestPage.tsx` (new) | `/r/:token` A/B layouts |
| `apps/web/src/api/people.ts` (new) | hooks for the new routes |

---

### Task 1: Core — pair items and settlement spreading

**Files:**
- Create: `packages/core/src/people.ts`
- Modify: `packages/core/src/index.ts` (export), `packages/core/src/api-types.ts`
- Test: `packages/core/test/people.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type PersonKey = `u:${string}` | `p:${string}`; // user id, or personal-ledger / unlinked guest participant id
  export interface TripPairInput {
    tripId: string; tripName: string; kind: 'group' | 'direct';
    ownerPid: string; otherPid: string;
    suggestions: Transfer[]; oldestOpenAt: string; writable: boolean;
  }
  export interface PersonItem { tripId: string; tripName: string; kind: 'group' | 'direct'; amount: number; oldestOpenAt: string } // amount > 0: they owe owner
  export function pairItems(inputs: TripPairInput[]): PersonItem[]; // drops zero items, sorted by oldestOpenAt asc
  export interface SettlementPart { tripId: string; fromOwner: boolean; amount: number }
  export function spreadSettlement(items: (PersonItem & { writable: boolean })[], paid: number, direction: 'toOwner' | 'fromOwner', directTripId: string): SettlementPart[];
  ```
  In `api-types.ts`: `GroupPreset` gains `'direct'`; add `PersonSummary { key: PersonKey; name: string; nickname: string | null; userId: string | null; groupLabel: string | null; total: number; items: PersonItem[] }` and `RequestView { ownerName: string; total: number; items: PersonItem[]; settled: boolean; pay: PayInfo | null; settlementWaiting: boolean }` (reuse the existing pay-info type used by `PayScreen`).

- [ ] **Step 1: Write failing tests** in `packages/core/test/people.test.ts`:
  - `pairItems` with suggestions `[{fromId:'m',toId:'o',amount:200}]` and `[{fromId:'o',toId:'m',amount:50}]` in two trips → amounts `200` and `-50`; a trip whose suggestions route `m→x` yields no item.
  - `spreadSettlement(items=[+120 (direct, oldest), +200 (group), -50 (group2)], paid=270, 'toOwner', 'D')` → parts `{D, fromOwner:false, 120}`, `{group, false, 200}`, `{group2, true, 50}`; sum of signed parts = 270.
  - Partial: same items, `paid=170` → `-50` settled fully, `+120` fully, `+200` gets `100`.
  - Overpay: `paid=300` → as full case plus `{D, false, 30}`.
  - Non-writable item (`writable:false`, +200) → its 200 is moved onto a `D` part instead (`{D,false,320}` merged with the direct 120), never a part for that trip.
- [ ] **Step 2: Run** `npm test -w @fsl/core -- people` → FAIL (module missing).
- [ ] **Step 3: Implement** in `packages/core/src/people.ts`. Algorithm for `spreadSettlement` with `direction='toOwner'` (mirror signs for `'fromOwner'`): budget = `paid + Σ|negative items|`; settle every negative item fully (part `fromOwner:true`); walk positive items oldest-first assigning `min(remaining, amount)`; leftover budget → part on `directTripId`. Non-writable items are redirected to `directTripId`. Merge parts with the same `(tripId, fromOwner)`.
- [ ] **Step 4: Run** `npm test -w @fsl/core` → all PASS; `npm run typecheck -w @fsl/core` clean.
- [ ] **Step 5: Commit** `feat(core): pair items and settlement spreading`.

### Task 2: Migration and schema

**Files:**
- Create: `apps/api/migrations/0009_people_ledger.sql`
- Modify: `apps/api/src/db/schema.ts`
- Test: `apps/api/test/migration-0009.test.ts` (follow `migration-0007.test.ts`)

**Interfaces:**
- Produces (SQL):
  - `participants.request_token TEXT UNIQUE` (nullable).
  - `person_links(owner_user_id TEXT NOT NULL, participant_id TEXT NOT NULL, person_pid TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(owner_user_id, participant_id))` — `person_pid` is a personal-ledger participant id.
  - `nicknames(owner_user_id TEXT NOT NULL, person_key TEXT NOT NULL, nickname TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(owner_user_id, person_key))`.
  - `participant_merges(id TEXT PRIMARY KEY, trip_id, from_id, into_id, actor_user_id, created_at)` and `participant_merge_rows(merge_id TEXT NOT NULL, table_name TEXT NOT NULL, row_key TEXT NOT NULL, before_json TEXT NOT NULL)` with index on `merge_id`.
  - Partial unique index `membership_requests_one_pending ON membership_requests(participant_id) WHERE status = 'pending'`.
  - `trips.preset` stays TEXT; Drizzle enum becomes `['trip','sport','direct']`. Add `trips_organiser_direct_idx` unique on `(organiser_user_id) WHERE preset = 'direct'`.
- Drizzle names: `personLinks`, `nicknames`, `participantMerges`, `participantMergeRows`, `participants.requestToken`.

- [ ] **Step 1: Write failing test**: after migrations, inserting two `direct` trips for one organiser throws; two pending membership requests for one participant throw; tables exist.
- [ ] **Step 2: Run** `npm test -w @fsl/api -- migration-0009` → FAIL.
- [ ] **Step 3: Write the migration and schema.** Before writing, check existing pending duplicates would not break the unique index: the migration first sets all but the oldest duplicate pending request per participant to `rejected`.
- [ ] **Step 4: Run** `npm test -w @fsl/api` → PASS; typecheck clean.
- [ ] **Step 5: Commit** `feat(api): migration 0009 for personal ledger, links, nicknames, merge log`.

### Task 3: Personal ledger and importing people

**Files:**
- Create: `apps/api/src/me/ledger.ts`
- Modify: `apps/api/src/app.ts` (mount), `apps/api/src/trips/routes.ts:266` (filter `preset <> 'direct'`), `apps/api/src/trips/routes.ts` `POST /trips` (reject `preset: 'direct'`)
- Test: `apps/api/test/ledger.test.ts`

**Interfaces:**
- Produces:
  - `ensurePersonalLedger(db: Db, user: { id: string; name: string }): Promise<{ tripId: string; ownerPid: string }>` — idempotent; insert races resolved by the unique index (catch, re-select). Owner participant is an admin member with `userId`.
  - `GET /me/ledger` → `{ tripId, ownerPid }`.
  - `POST /me/ledger/people` body `{ name: string } | { participantId: string }` → `{ participantId }`. With `participantId` (someone from one of the caller's groups): if that participant has `userId`, reuse/create a ledger participant with the same `userId` (no account claim needed, it is the same user); else create a ledger guest with that name and write a `person_links` row `(caller, participantId → newLedgerPid)`. If a link already exists, return the linked ledger pid. With `name`: plain guest add through the same code path as `POST /trips/:id/people`.
  - Request token is created lazily in Task 6, not here.

- [ ] **Step 1: Failing tests:** `GET /me/ledger` twice returns the same tripId; `GET /trips` does not list it; `POST /trips {preset:'direct'}` → 422; importing a group member with an account gives a ledger participant with that `userId`; importing a group guest twice returns the same pid and one `person_links` row; caller must be an active member of the source trip, else 403.
- [ ] **Step 2: Run** `npm test -w @fsl/api -- ledger` → FAIL.
- [ ] **Step 3: Implement.** Expenses then use the existing `/trips/:ledgerId/expenses` routes untouched (owner is a member, so `initialExpenseStatus` is `approved`).
- [ ] **Step 4: Run** full `npm test -w @fsl/api` → PASS.
- [ ] **Step 5: Commit** `feat(api): personal ledger for quick expenses`.

### Task 4: People summary

**Files:**
- Create: `apps/api/src/me/balances.ts`
- Test: `apps/api/test/people-summary.test.ts`

**Interfaces:**
- Consumes: `pairItems`, `PersonSummary` (Task 1); `getSnapshot` (`apps/api/src/trips/snapshot.ts:406`); `ensurePersonalLedger` (Task 3).
- Produces: `loadPeopleSummary(db: Db, userId: string): Promise<PersonSummary[]>` and `GET /me/people/summary`.
  - For each trip the caller is an active participant in (including the ledger and archived trips), take `snapshot.suggestions` and map every other participant to a `PersonKey`: `u:<userId>` if they have one; else `p:<person_pid>` via `person_links` (one query for all the caller's links); else, in the ledger, `p:<their own pid>`; else `p:<their pid>` with `groupLabel = trip name` (unlinked guest).
  - `oldestOpenAt` = `createdAt` of the oldest approved expense in that trip involving both people (from the snapshot).
  - `name`: the user's name / ledger participant name; `nickname` from `nicknames`.
  - Only people with `total !== 0` or open `says_paid` are returned; sorted by `|total|` desc.

- [ ] **Step 1: Failing tests:**
  - Minh (user) owes owner 200 in badminton (suggestion), owner owes Minh 50 in another group, Minh owes 120 in the ledger → one row `u:u-minh`, `total: 270`, three items.
  - Group suggestion routing Minh's debt to someone else → no badminton item.
  - Two unlinked guests both named "Minh" in different groups → two rows with `groupLabel` set; after a `person_links` row joins them to one ledger pid → one row.
  - Nickname appears.
  - 30 seeded trips with Minh → completes, and the test asserts the D1 query count stays below 50 (wrap `env.DB` the way `size-limits.test.ts` does, or count via a spy on `getSnapshot` + fixed extra queries).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** If 50+ trips would exceed the query budget, skip archived trips whose snapshot shows zero balance for the caller (snapshot cache in `trip_views` keeps most reads to one query).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(api): people summary across groups and quick expenses`.

### Task 5: Settlement writes and confirmation

**Files:**
- Create: `apps/api/src/me/settle.ts`
- Test: `apps/api/test/settle.test.ts`

**Interfaces:**
- Consumes: `spreadSettlement` (Task 1), `loadPeopleSummary` (Task 4), `statusForNewPayment` (core), `commitTripWrite`.
- Produces:
  - `createSettlement(db, args: { ownerUserId: string; key: PersonKey; paid: number; direction: 'toOwner' | 'fromOwner'; recordedBy: 'owner' | 'guest'; device: string | null }): Promise<{ settlementId: string; status: 'confirmed' | 'says_paid' }>` — one `payment` transaction per part, each with `metaJson: {"settlementId": "..."}`, written per trip through `commitTripWrite` (activity action `payment_added`, details include `settlementId`). Status: `recordedBy:'owner'` → `confirmed` (owner is receiver for toOwner, payer for fromOwner — both count straight away per §5); `recordedBy:'guest'` → `says_paid` on every part. Each part's payer/receiver is that person's participant in that trip.
  - `POST /me/people/:key/settle` body `{ paid: number; direction }` (owner; "Paid in cash" and "I paid them").
  - `POST /me/settlements/:sid/confirm` (owner as receiver) → every `says_paid` part with that `settlementId` becomes `confirmed`, via the existing confirm logic per trip.
  - Disabling one part uses the existing `POST /trips/:id/payments/:pid/disable`; nothing else changes.

- [ ] **Step 1: Failing tests:** owner "Paid in cash" 270 for the Task 4 fixture → three payments, all `confirmed`, same `settlementId`; summary total becomes 0; badminton activity shows the payment. Guest-recorded → all `says_paid`, summary unchanged until confirm, then 0. Disabling the badminton part → summary total back to 200. Archived trip part goes to the ledger. `paid <= 0` → 422.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** full api suite → PASS.
- [ ] **Step 5: Commit** `feat(api): cross-group settlements`.

### Task 6: Request links and public request page API

**Files:**
- Create: `apps/api/src/me/personRoutes.ts` (request-link part), `apps/api/src/requests/routes.ts`
- Modify: `apps/api/src/og/routes.ts` (preview for `/r/:token`)
- Test: `apps/api/test/request-link.test.ts`

**Interfaces:**
- Consumes: Tasks 3–5; existing pay-info builder used by `PayScreen` (owner's approved bank details → VietQR).
- Produces:
  - `POST /me/people/:key/request-link` → `{ url: string }` (`${APP_ORIGIN}/r/<token>`). Ensures the person has a ledger participant (import if needed, Task 3) and a `request_token` (32+ char random, `newId` style).
  - `GET /r/:token` (no auth) → `RequestView` from the **person's** point of view (amounts flipped: positive = they owe the owner); `settled: true` when no items; `pay: null` when owner has no approved bank details; binds the device to the ledger participant in `device_participants`.
  - `POST /r/:token/paid` body `{ amount: number }` → `createSettlement(... recordedBy:'guest')`; repeated call while one is waiting → 409 `ALREADY_WAITING`.
  - OG title: "Nhan asked you for 120.000₫" (single) / "You owe Nhan 270.000₫" (several), in the trip's default language.

- [ ] **Step 1: Failing tests:** link is stable across calls; unknown token → 404; view has 1 item → client will show A, 3 items → B (assert `items.length`); settled person → `settled: true, total: 0`; owner without bank → `pay: null`; "I've paid" → `settlementWaiting: true` and second call 409; owner confirm → `settled: true`.
- [ ] **Step 2–4:** run → FAIL, implement, run full api suite → PASS.
- [ ] **Step 5: Commit** `feat(api): tikkie-style request links`.

### Task 7: Nicknames and "Same person?" links

**Files:**
- Modify: `apps/api/src/me/personRoutes.ts`
- Test: `apps/api/test/person-routes.test.ts`

**Interfaces:**
- Produces: `PUT /me/people/:key/nickname` body `{ nickname: string | null }` (1–40 chars trimmed; null deletes). `POST /me/people/link` body `{ keys: PersonKey[] }` (2+ `p:` keys of guests) → all their participants point to one ledger pid (create via Task 3 import if none); returns the merged `PersonKey`. Refuse `u:` keys (422): accounts are already one person.

- [ ] **Step 1: Failing tests:** nickname set/clear reflected in summary; nickname visible only to its owner (another user's summary lacks it); link two group guests → summary shows one row with combined total; linking a `u:` key → 422; linking guests from trips the caller isn't in → 403.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(api): nicknames and same-person links`.

### Task 8: Merge log and race-safe claims

**Files:**
- Modify: `apps/api/src/participants/merge.ts`, `apps/api/src/participants/routes.ts:568` (merge refuses pending claims), `:721` (claim), `:794` (approve)
- Test: `apps/api/test/merge-log.test.ts`, `apps/api/test/claim-race.test.ts`

**Interfaces:**
- Produces:
  - `mergeParticipants(...)` keeps its signature; before its updates it reads every row it will change and adds to the **same** `db.batch` an insert into `participant_merges` plus one `participant_merge_rows` per changed row (`table_name`, `row_key` = primary key as JSON, `before_json` = full row). Insert rows in chunks so no single statement exceeds 100 bound params.
  - Merge throws `ApiError('CONFLICT', 409, 'CLAIM_PENDING')` if either participant has a pending membership request.
  - Claim (`POST /trips/:id/membership`): follow `merged_into` to the survivor first; insert with `INSERT ... SELECT ... WHERE` the target is `active`, `user_id IS NULL`; the partial unique index from Task 2 rejects a second pending claim → map the constraint error to `409 ALREADY_CLAIMED` with message "Someone already claimed this person, ask the owner".
  - Approve: `UPDATE participants SET user_id = ? WHERE id = ? AND user_id IS NULL AND status = 'active'`; zero rows changed → 409 and the request becomes `rejected`.

- [ ] **Step 1: Failing tests:** merge B into A where both had shares in one expense → `participant_merge_rows` holds B's deleted share and A's pre-sum share; replaying `before_json` restores the original totals (assert by sum). Two concurrent claims (`Promise.all`) on A → exactly one 201, one 409. Claim on B after B merged into A → request lands on A. Merge while a claim is pending → 409. Claim racing merge (`Promise.all`) → exactly one of them succeeds, and the database is consistent (no pending request on a `merged` participant).
- [ ] **Step 2–4:** FAIL → implement → PASS (do not edit existing merge tests; if they break, fix the code).
- [ ] **Step 5: Commit** `feat(api): merge log and race-safe guest claims`.

### Task 9: Web — Home tabs and People list

**Files:**
- Create: `apps/web/src/screens/Home.tsx`, `apps/web/src/api/people.ts`
- Modify: `apps/web/src/App.tsx` (`/trips` → `Home`; keep `MyTrips` as the Groups tab content), `apps/web/src/i18n/vi.ts`, `en.ts`
- Test: `apps/web/src/screens/__tests__/home-people.test.tsx`

**Interfaces:**
- Consumes: `GET /me/people/summary`, `GET /me/ledger`.
- Produces: hooks `usePeopleSummary()`, `useLedger()`, `requestLink(key)`, `settle(key, paid, direction)`, `setNickname`, `linkPeople`, `confirmSettlement(sid)` in `apps/web/src/api/people.ts`, following `api/hooks.ts` patterns.
- UI per mockup `debts-view.html` option B: tabs **People · Groups · Activity** (shadcn `tabs` — add with `npx shadcn@latest add tabs` in `apps/web` if missing); **+ New expense** primary pill button → `/t/<ledgerId>/expenses/new`; sections "Owed to you" / "You owe", rows `Avatar`, name + `"nickname"`, group label for unlinked guests, `Amount` in `text-success` / `text-danger`. Row → `/people/:key`. Activity tab = ledger activity via existing `Activity` component. `data-testid`s: `home-tab-people`, `home-new-expense`, `person-row-<key>`.

- [ ] **Step 1: Failing test** with mocked fetch: two people (+350, −80) render under the right headings with amounts; tapping a row navigates to `/people/u:u-linh`; New expense button href uses the ledger id; Groups tab shows the existing trip list (`fsl-*` selectors from `trips.test.tsx` still pass).
- [ ] **Step 2–4:** FAIL → implement → `npm test -w @fsl/web` PASS (including `style-guard.test.ts`).
- [ ] **Step 5: Commit** `feat(web): home tabs with people list`.

### Task 10: Web — quick expense form and person screen

**Files:**
- Create: `apps/web/src/screens/PersonScreen.tsx`
- Modify: `apps/web/src/screens/ExpenseForm.tsx` (ledger mode), `apps/web/src/components/PeopleInput.tsx` / `SplitPeopleSheet.tsx` (offer group people via `POST /me/ledger/people`), `App.tsx` (`/people/:key`)
- Test: `apps/web/src/screens/__tests__/quick-expense.test.tsx`, `person-screen.test.tsx`

**Interfaces:**
- Consumes: Task 9 hooks; existing `useRecentPeople` (`api/recentPeople.ts`), `nameSearch.ts` for accent-insensitive suggestions; existing rename (`PATCH /trips/:id/people/:pid`) and merge (`POST /trips/:id/people/merge`) routes; `MergeSheet`.
- ExpenseForm in a `direct` trip: title "New expense", payer picker defaults to me and lists the ledger people, people picker shows ledger people + recent group people (picking one calls the import route first), typing a new name shows similar matches before "Add “X”". After save → `/people/<key>` of the single other person, or `/trips` (People tab) if several.
- PersonScreen: header name + nickname (edit via `Sheet`), total, item list (group name, signed amount), actions: **Request** (calls `requestLink`, then `navigator.share` with fallback copy + `Snackbar`), **Settle up** (`/t/<trip>/pay/<pid>` for the largest you-owe item when the owner owes), **Paid in cash** (`Sheet` with amount prefilled to total → `settle(key, amount, 'toOwner')`), **Rename** and **Merge** (guests only; per trip, reusing `MergeSheet`), **Same person?** (for rows with `groupLabel`, lists other guests with similar names → `linkPeople`). Waiting settlements show "Minh says they paid 270.000₫" with **Confirm**.

- [ ] **Step 1: Failing tests:** ledger-mode form shows "Who paid" defaulting to me and can switch to Minh; picking a group person calls the import route; typing "minh" suggests existing "Minh" before adding; PersonScreen shows three items for the fixture, Paid in cash posts `{paid:270, direction:'toOwner'}`, Request shares the returned URL, Confirm calls `confirmSettlement`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(web): quick expense form and person screen`.

### Task 11: Web — request page and e2e golden path

**Files:**
- Create: `apps/web/src/screens/RequestPage.tsx`
- Modify: `apps/web/src/App.tsx` (`/r/:token`)
- Test: `apps/web/src/screens/__tests__/request-page.test.tsx`, `e2e/quick-expense.spec.ts`

**Interfaces:**
- Consumes: `GET /r/:token`, `POST /r/:token/paid`; existing `PayQr` and `BankAppSheet` components.
- Layout per mockup `request-page.html`: one item → A ("Nhan asked you for 120.000₫", description, QR, **Open bank app**, **I've paid**, cash hint "Paid in cash? Tell Nhan, they'll mark it."); 2+ items → B ("You owe Nhan 270.000₫", item list with signed amounts, one QR for total, **I've paid**). `settled` → "You're all settled with Nhan". `pay: null` → no QR, line "Nhan hasn't added bank details — pay them directly". After "I've paid" → "Waiting for Nhan to confirm". No sign-in prompt anywhere on the page.

- [ ] **Step 1: Failing unit tests** for the four states (A, B, settled, no-bank) and the waiting state.
- [ ] **Step 2: Failing e2e** at 375px: sign in (test login) → New expense "Taxi" 240.000₫ split equally with new guest "Minh" → Request → open the link in a fresh context → layout A with 120.000₫ → I've paid → owner People tab shows "Minh says they paid" → Confirm → Minh row gone.
- [ ] **Step 3: Implement.** **Step 4: Run** `npm test -w @fsl/web` and `npm run e2e` → PASS; root `npm run typecheck` clean.
- [ ] **Step 5: Commit** `feat(web): tikkie-style request page`.
