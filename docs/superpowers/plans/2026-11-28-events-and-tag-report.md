# Events and Tag Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the built trip mode into events (optional dates, start/stop by hand, several at once, generated tags) and add a report filtered to one tag.

**Architecture:** First a scripted rename from `travel` to `event` with no change in behaviour. Then the event model in `@cc/core`, the rewritten `0038` tables, the API (CRUD, stop/resume/start-now, tagging shares for every matching event), the web hooks and the screens. The tag report is an optional `tagId` on `ReportQuery`, applied inside `buildReport` (used by both the client copy and the server), plus a filter chip and an entry button.

**Tech Stack:** Hono + Drizzle on D1, React 19 + React Query, shadcn + Tailwind v4, vitest, Playwright. Nx monorepo `@cc/*`.

**Spec:** `docs/superpowers/specs/2026-11-28-events-and-tag-report-design.md` (amends `docs/superpowers/specs/2026-11-27-trip-mode-design.md`; read both).

## Global Constraints

- Branch `feat/trip-mode` (PR #160). Base for "existing tests": **`c4976c2`** (main when this branch started). Tests that existed at `c4976c2` are never edited or deleted. Tests added on this branch may be updated.
- Phase 2 rules (#116): no edits to the group money code; at most 50 queries per request; nothing visible with the spending book off; hand-written SQL migrations; money in whole smallest units; never the word "ledger"; the same screens in `apps/web` and `apps/zalo`.
- Migration `0038` is rewritten in place as `apps/api/migrations/0038_personal_events.sql` (it never ran remotely). Never `--remote`.
- Group shares are read, never copied. Share tags live in `personal_group_link_tags`; event marks live in `personal_event_share_marks`.
- Tag-shares stays capped at 100 shares per call.
- UI: `DESIGN.md`, the app wrappers (`Sheet`, `Modal`, `Button`, `Pill`, `Amount`, `Icon`), `min-h-11` targets, money in `tabular-nums`. Keep the existing `data-testid`s, renamed from `travel` to `event`.
- New vi lines end with `// REVIEW`. The exact copy is in Task 8.
- Workers never run git or the test suite, never run `npm run e2e`/builds while the owner's tunnel is up, and never delete files except where a task says so.

## Review Focus

1. **Stop, then add an expense dated today.** It must not get the stopped event's tag (Task 2 test `stopped event excludes its stop day`).
2. **Two events running, own expense:** it gets both tags. **Group share:** it gets a tag for each event whose groups include it (Tasks 2 and 5).
3. **Generated tag collides with an existing tag**, e.g. the owner already has `dalat-201226`: the new tag is `dalat-201226-2`, and a date change that renames into a taken name also adds a suffix (Task 4).
4. **The owner deleted the event's tag:** the next save (or stop/resume/start-now) creates a new generated tag, and the event page shows 0 rather than crashing on `tagId: null` (Tasks 4 and 8).
5. **Tag report with group shares and a "not in reports" wallet:** the filtered totals equal the event page total for the event's tag (Task 6 parity test).

---

### Task 1: Rename `travel` → `event` (planner, scripted, no behaviour change)

Mechanical rename done by the planner with a script, not a worker: it touches about 50 files and only one pass must happen.

**Files:** every file under the branch diff `c4976c2..HEAD` that contains `travel`/`Travel`/`TRAVEL`, plus `git mv` of file names containing `travel`/`Travel` (`travels.ts` → `events.ts`, `TravelForm.tsx` → `EventForm.tsx`, `components/travels/` → `components/events/`, `e2e/travels.spec.ts` → `e2e/events.spec.ts`, `0038_personal_travels.sql` → `0038_personal_events.sql`, the tests…).

- [ ] Replace the tokens `travels`→`events`, `Travels`→`Events`, `travel`→`event`, `Travel`→`Event`, `TRAVELS`→`EVENTS`, `TRAVEL`→`EVENT`, applied only to files changed on this branch. Exclude the docs (`docs/superpowers/**`) and `.impeccable/`.
- [ ] Check for clashes before replacing: `rg -n "\b(Event|EventView|EventState|events)\b"` in the files touched (DOM `Event` types, `events` variables). Rename any clash to `EventDef`-prefixed names, or keep it explicit (`globalThis.Event`).
- [ ] Tables: `personal_events`, `personal_event_groups` (column `event_id`), `personal_event_share_marks` (column `event_id`). Routes: `/api/me/personal/events…`. Query key `['personal','events']`. i18n keys `travels.*` → `events.*`. Route path `/book/travels` (whatever App.tsx uses) → `/book/events`.
- [ ] Local DB: drop the three old tables and the `d1_migrations` row for `0038_personal_travels.sql` in `apps/api/.wrangler`, then `npx wrangler d1 migrations apply fsl --local`. Do the same in the main worktree `C:\repo\experience\coin-crew` before the tunnel. Put the two SQL lines in the PR body.
- [ ] Gate: `npm run typecheck`, `npm run lint`, `npm test`, `npm run e2e -- events`, all green.
- [ ] Commit `refactor(events): rename travel to event (#158)`.

### Task 2: Event model in core

**Files:**
- Modify: `libs/shared/core/src/events.ts`
- Test (new): `libs/shared/core/test/events-model.test.ts`
- Update (branch tests): `libs/shared/core/test/events.test.ts`, `events-summary.test.ts` where the old single-match and overlap rules are asserted.

**Interfaces (Produces):**
```ts
export interface EventDef {
  id: string; tagId: string | null; name: string;
  start: string;            // YYYY-MM-DD, always set
  end: string | null;       // null = runs until stopped
  stoppedAt: string | null; // ISO timestamp when Dừng was tapped
  countsFrom: string; groupIds: string[]; budgetId: string | null;
}
export type EventState = 'upcoming' | 'on' | 'done';
export type EventMatch = { event: EventDef; mode: 'on' | 'leadup' };
export function eventState(e: EventDef, today: string): EventState;
export function eventMatchEnd(e: EventDef): string | null; // last date that auto-tags; null = open
export function eventsForDate(events: EventDef[], date: string): EventMatch[];       // sorted by start
export function eventsForShare(events: EventDef[], share: { tripId: string; date: string }): EventDef[];
export function eventTagName(name: string, start: string, end: string | null): string;
export function uniqueTagName(base: string, taken: Iterable<string>): string;
export function eventDayIndex(e: EventDef, today: string): { day: number; of: number | null } | null;
export function daysUntil(e: EventDef, today: string): number; // unchanged
export function defaultCountsFrom(start: string, today: string): string; // unchanged
// eventRows / summarizeEvent keep their signatures
```
Remove `findEventOverlap` (formerly `findTravelOverlap`) and its callers' use. Task 4 removes the server use, Task 8 the form use.

Rules:
- `eventState`: `stoppedAt` set → `'done'`; `today < start` → `'upcoming'`; `end === null || today <= end` → `'on'`; otherwise `'done'`.
- `eventMatchEnd`: if `stoppedAt` is set, the day **before** `stoppedAt`'s local date (compared with `end`, take the smaller); otherwise `end`.
- `eventsForDate`: `'on'` for every event with `start <= date` and (match end null or `date <=` match end); `'leadup'` for every event with `countsFrom <= date < start`. One match per event, `'on'` wins.
- `eventsForShare`: every event whose `groupIds` include `tripId` and `countsFrom <= date` and (match end null or `date <=` match end).
- `eventTagName`: `foldForSearch(name)` (from `./listFilter`), then remove every char not `[a-z0-9]`. Empty becomes `'event'`. Append `-ddmmyy` of start, and `-ddmmyy` of end when set.
- `uniqueTagName`: compare case-insensitively. Return `base` if free, else `base-2`, `base-3`, and so on.
- `eventRows`: rows whose `tagIds` include `tagId` (no date range). When `tagId` is null, return `[]`. Keep the wallet/report exclusions it has now. `summarizeEvent`'s by-day puts `date < start` in `'leadup'`.

- [ ] **Step 1: Write failing tests** in `events-model.test.ts`:
```ts
const base = { id:'e1', tagId:'t1', name:'Đà Lạt', start:'2026-12-20', end:'2026-12-30', stoppedAt:null, countsFrom:'2026-12-01', groupIds:['g1'], budgetId:null };
it('eventTagName folds and formats', () => {
  expect(eventTagName('Đà Lạt','2026-12-20','2026-12-30')).toBe('dalat-201226-301226');
  expect(eventTagName('Đà Lạt','2026-12-20',null)).toBe('dalat-201226');
  expect(eventTagName('!!!','2026-12-20',null)).toBe('event-201226');
});
it('uniqueTagName adds -2, -3', () => {
  expect(uniqueTagName('dalat-201226',['DaLat-201226','dalat-201226-2'])).toBe('dalat-201226-3');
  expect(uniqueTagName('x',[])).toBe('x');
});
it('open event is on until stopped', () => {
  const open = { ...base, end: null };
  expect(eventState(open,'2027-06-01')).toBe('on');
  expect(eventState({ ...open, stoppedAt:'2027-06-01T11:00:00.000Z' },'2027-06-01')).toBe('done');
});
it('stopped event excludes its stop day', () => {
  const stopped = { ...base, end:'2026-12-25', stoppedAt:'2026-12-25T11:00:00.000Z' };
  expect(eventsForDate([stopped],'2026-12-25')).toEqual([]);
  expect(eventsForDate([stopped],'2026-12-24').map(m=>m.mode)).toEqual(['on']);
});
it('two running events both match, sorted by start', () => {
  const house = { ...base, id:'e2', tagId:'t2', name:'Mua nhà', start:'2026-11-01', end:null, countsFrom:'2026-11-01', groupIds:[] };
  expect(eventsForDate([base, house],'2026-12-21').map(m=>m.event.id)).toEqual(['e2','e1']);
});
it('shares match every event with the group', () => {
  const other = { ...base, id:'e3', start:'2026-12-22', countsFrom:'2026-12-22' };
  expect(eventsForShare([base, other],{ tripId:'g1', date:'2026-12-23' }).map(e=>e.id)).toEqual(['e1','e3']);
  expect(eventsForShare([base],{ tripId:'g9', date:'2026-12-23' })).toEqual([]);
});
it('day index of an open event has no total', () => {
  expect(eventDayIndex({ ...base, end:null },'2026-12-22')).toEqual({ day:3, of:null });
});
it('eventRows counts a tagged row outside the dates and none for a null tag', () => { /* one row tagged t1 dated 2026-10-01 is included; tagId null → [] */ });
```
- [ ] **Step 2:** `npx vitest run test/events-model.test.ts` in `libs/shared/core`. Expected: FAIL.
- [ ] **Step 3:** Implement in `events.ts`. Update the branch tests in `events.test.ts` and `events-summary.test.ts` that assert overlap, single-winner or range-limited rows, and change them to the new rules.
- [ ] **Step 4:** Core tests pass; `npm run typecheck` is expected to fail only in api/web callers (later tasks).
- [ ] **Step 5:** Commit `feat(core): event model — open end, stop, several at once, generated tag (#158)`.

### Task 3: Tables

**Files:** `apps/api/migrations/0038_personal_events.sql`, `libs/api/db/src/schema.ts`, `apps/api/test/schema-personal-events.test.ts` (branch test, update).

- [ ] `personal_events`: `id` PK; `user_id` NOT NULL FK users CASCADE; **`name` text NOT NULL**; **`tag_id` text NULL FK personal_tags ON DELETE SET NULL**; `start_date` NOT NULL; **`end_date` NULL**; **`stopped_at` text NULL**; `counts_from` NOT NULL; `budget_id` NULL FK personal_budgets SET NULL; `created_at`, `updated_at`; index on `user_id`.
- [ ] `personal_event_groups(event_id, trip_id)` as before.
- [ ] `personal_event_share_marks(user_id, root_id, event_id, state)` with **PK `(user_id, root_id, event_id)`** and state `'tagged'|'skipped'`.
- [ ] Schema test asserts: tag delete leaves the event with `tag_id` null; two marks for one root and two events can coexist; `end_date`/`stopped_at` accept null.
- [ ] Commit `feat(db): event tables with open end, stop, per-event share marks (#158)`.

### Task 4: Events API — CRUD, stop, resume, start now (neon)

**Files:** `apps/api/src/personal/events.ts`, `libs/shared/core/src/api-types.ts`, tests `apps/api/test/personal-events.test.ts` (branch, update) and **new** `apps/api/test/personal-events-lifecycle.test.ts`.

**Interfaces:**
```ts
export interface EventView extends EventDef { createdAt: string; tagName: string | null; }
export interface CreateEventInput { name: string; start?: string; end?: string | null; countsFrom?: string; groupIds: string[]; limit?: EventLimitInput; today: string; }
export interface UpdateEventInput { name?: string; start?: string; end?: string | null; countsFrom?: string; groupIds?: string[]; limit?: EventLimitInput | null; today: string; }
// EventSavedResponse { event: EventView; existing: EventExisting } unchanged
POST /api/me/personal/events/:id/stop      body { today }  -> { event: EventView }
POST /api/me/personal/events/:id/resume    body { today }  -> EventSavedResponse   (existing = the stopped gap)
POST /api/me/personal/events/:id/start-now body { today }  -> EventSavedResponse
```
Remove `endNow` and the overlap check (and its 409).

Rules:
- Create: `name` trimmed, 1–30 chars. `start` defaults to `today`. `end`, when given, must be `>= start` (400 `invalid_range`). `countsFrom` defaults to `defaultCountsFrom(start, today)`. A `limit` with no `end` → 400 `limit_needs_end`. The tag is created with `uniqueTagName(eventTagName(name,start,end), <user's tag names>)`.
- **Tag sync** (one helper `syncEventTag(db, userId, event)`, used by create/patch/stop/resume/start-now): the wanted name comes from current dates. If `tag_id` is null, create a new tag. Otherwise, if the tag's name differs, rename it, using `uniqueTagName` against the other tags (excluding itself). It never merges.
- Patch: `end: null` clears the end and **deletes the linked budget**. A limit with the resulting end null → 400 `limit_needs_end`. Date changes move the budget's one-off range (as now) and call tag sync. `existing` is computed as now (exact new-days/new-groups sets).
- Stop: only when state is `'on'` (else 409 `not_running`). Set `end = today` and `stopped_at = new Date().toISOString()`, move the budget's range end to today, sync the tag. No existing question.
- Resume: only when `stopped_at` is set. Clear `end` and `stopped_at`, delete the budget, sync the tag. `existing` = own expenses and group shares dated from the stop day to `today` that don't carry the tag and have no `skipped` mark for this event.
- Start-now: only when `'upcoming'`. Set `start = today` and `countsFrom = min(countsFrom, today)`, sync the tag, and return existing for `today`.
- Every handler stays at or under 50 queries (add `countQueries` assertions as the branch tests do).

- [ ] **Step 1: Write failing tests** in `personal-events-lifecycle.test.ts`:
  - `create with only a name starts today and tags dalat-<ddmmyy>`: POST `{ name:'Đà Lạt', groupIds:[], today:'2026-12-20' }` gives `event.start==='2026-12-20'`, `end===null` and `tagName==='dalat-201226'`.
  - `create rejects a limit without an end`: 400, `error==='limit_needs_end'`.
  - `generated name collides with an owner tag`: the owner has tag `dalat-201226`, so the new event's `tagName==='dalat-201226-2'`.
  - `two events can overlap`: two creates over the same dates both 201.
  - `stop sets end today, renames tag, keeps budget with end today`: an event with end 2026-12-30 and a limit, stopped on 2026-12-25, gives `tagName==='dalat-201226-251226'` and the budget's `to==='2026-12-25'`.
  - `resume clears end, drops the budget and returns the gap`: one own expense dated 2026-12-26 (untagged) gives `existing.ownIds` containing it, `tagName==='dalat-201226'` and the budget row gone.
  - `start-now moves start and renames`: an upcoming event starting 2027-01-10, start-now on 2026-12-28, gives `start==='2026-12-28'` and a tag that starts `dalat-281226`.
  - `deleted tag is recreated on the next save`: delete the tag row, PATCH `{ name:'Đà Lạt', today }`, and `tagId` is non-null again with `tagName==='dalat-201226'`.
  - `hand-renamed tag is renamed back on a date change`.
  - `clearing end deletes the limit`.
- [ ] **Step 2:** `npx vitest run test/personal-events-lifecycle.test.ts` in `apps/api`. Expected: FAIL.
- [ ] **Step 3:** Implement. Update the branch tests in `personal-events.test.ts` that assert overlap 409, `endNow` or a required end.
- [ ] **Step 4:** API event tests pass.
- [ ] **Step 5:** Commit `feat(api): events — optional dates, stop/resume/start now, generated tags (#158)`.

### Task 5: Shares and rows for several events (neon)

**Files:** `apps/api/src/personal/events.ts` (tag-shares, existing, rows), `apps/api/src/personal/groupLinks.ts` (mark write), branch tests `personal-events-shares.test.ts`, `personal-events-rows.test.ts`, `personal-group-link-event-mark.test.ts`, `personal-events-existing-set.test.ts` (update), **new** `apps/api/test/personal-events-multi.test.ts`.

- [ ] Tag-shares: for each candidate share (same cap 100), every event from `eventsForShare` (using the server's cached group rows, as now) whose tag is not on the share and which has no mark `(user, root, event)` gets its tag written and a `tagged` mark. Events with `tagId` null are skipped.
- [ ] groupLinks explicit tag write: for each running/listed event whose tag was **removed** by hand, write a `skipped` mark for `(user, root, event)`; for each one whose tag was **added**, write `tagged`.
- [ ] `/:id/existing` and `/:id/rows` key marks by `event_id`. `/:id/rows` returns all counted rows carrying the event's tag (no date filter, per E8); a null tag gives `{ rows: [] }`.
- [ ] **Tests (new file):**
  - `a share in two events' groups gets both tags`
  - `skipping one event leaves the other's tag`: remove event A's tag by hand, run tag-shares, and only B's tag remains.
  - `stopped event no longer tags shares dated on its stop day`
  - `rows include a hand-tagged item dated before countsFrom`
  - `tag-shares with 100 shares and two events stays <= 50 queries`
- [ ] Commit `feat(api): shares tagged for every matching event; rows by tag (#158)`.

### Task 6: Report filtered to one tag (hydrogen)

**Files:** `libs/shared/core/src/reports.ts`, `libs/web/data-access/src/reports.ts`, `apps/api/src/personal/reports.ts`, `libs/web/screens/src/components/reports/reportUrl.ts`, `libs/web/screens/src/components/reports/TagBarsCard.tsx`, `libs/web/screens/src/screens/ReportsScreen.tsx`; **new** tests `libs/shared/core/test/reports-tag-filter.test.ts`, `libs/web/screens/src/components/reports/__tests__/tag-report.test.tsx`, `apps/api/test/personal-report-tag-filter.test.ts`.

**Interfaces:**
```ts
// ReportQuery gains:
tagId?: string;
// ReportTagItem gains (optional, additive):
firstDate?: string; // earliest date of any counted item with this tag, across all time
// reportUrl.ts:
export function buildTagReportUrl(tagId: string, from: string, to: string): string; // '/reports?mode=custom&from=..&to=..&tagId=..'
```
- [ ] `buildReport`: when `query.tagId` is set, keep only own entries and group rows whose `tagIds` include it, before every total, list and breakdown. `firstDate` is filled for each tag item from all input rows.
- [ ] `parseReportQueryFromSearch` / `buildReportSearch` / `buildReportQueryString` round-trip `tagId`. The server `/api/me/personal/report` (and `/category/:id`) reads `tagId` from the query string.
- [ ] `ReportsScreen`: with `tagId` set, show a `Pill` under the period reading `#<tag name>` with an ✕ (`aria-label` = `reports.tagFilterClear`) that removes `tagId` from the URL. Existing links on the screen (category screen, transactions) carry `tagId` along.
- [ ] `TagBarsCard`: **keep each row's existing link to transactions** (existing tests pin it). Add a 44px icon button per row (lucide `chart-pie`, `aria-label` = `reports.tagReportAria`, `data-testid="tag-report-link"`) linking to `buildTagReportUrl(tagId, item.firstDate ?? period.from, today)`.
- [ ] **Tests:**
  - core `filters totals, categories and group rows to the tag`
  - core `parity: tag report total equals summarizeEvent total for the same tag`, with one THB row, one group share and one "not in reports" wallet row
  - screens `chip shows and clears the filter`
  - screens `tag row button opens the custom range from firstDate`
  - api `server report honours tagId`
- [ ] Commit `feat(reports): report filtered to one tag (#158)`.

### Task 7: Web data-access for events (hydrogen)

**Files:** `libs/web/data-access/src/events.ts`, branch test `__tests__/events-hooks.test.tsx` (update), **new** `__tests__/events-lifecycle-hooks.test.tsx`.

**Interfaces (Produces):**
```ts
export function useStopEvent(): UseMutationResult<{ event: EventView }, ApiClientError, string>;
export function useResumeEvent(): UseMutationResult<EventSavedResponse, ApiClientError, string>;
export function useStartEventNow(): UseMutationResult<EventSavedResponse, ApiClientError, string>;
// useEvents, useCreateEvent, useUpdateEvent, useDeleteEvent, useApplyEventExisting, useEventShareSync, useEventSummary keep their names (after Task 1)
```
- [ ] Each mutation sends `{ today: todayLocal() }`. On success it invalidates `PERSONAL_EVENTS_KEY`, `PERSONAL_BUDGETS_KEY` and the tags query, and requests a group copy refresh (as the existing save does).
- [ ] `useEventSummary` reads rows by tag only (core `eventRows`). With `tagId` null it returns an empty summary, not an error.
- [ ] Tests: each mutation hits the right URL and body and invalidates the keys; `useEventSummary` with a null tag gives zero totals.
- [ ] Commit `feat(data-access): stop, resume, start now (#158)`.

### Task 8: Event screens — form, page, list, copy (neon)

**Files:** `libs/web/screens/src/components/events/EventForm.tsx`, `libs/web/screens/src/screens/EventDetailScreen.tsx`, `libs/web/screens/src/screens/EventsScreen.tsx`, `libs/web/i18n/src/vi.ts`, `libs/web/i18n/src/en.ts`; branch tests `event-form.test.tsx`, `event-detail.test.tsx`, `events-screen.test.tsx` (update), **new** `libs/web/screens/src/screens/__tests__/event-lifecycle.test.tsx`.

**Form:**
- Name label `events.nameLabel`. No tag picker.
- Start date: empty means today, hint `events.startHint`. End date: optional, hint `events.endHint`.
- Counts-from line only when a start date is picked.
- No overlap warning.
- The limit field shows only when an end is set. Otherwise show `events.limitNeedsEnd` as a muted line.
- Clearing the end on an event that has a limit asks `events.clearEndConfirm` before saving.

**Page:**
- Header with name and ✎. The meta line adds `#<tagName>`.
- Action by state:
  - **on:** ghost `events.stop`, with confirm `events.stopConfirm`.
  - **done with `stoppedAt`:** `events.resume`, with confirm `events.resumeConfirm` (plus `events.resumeDropsLimit` when it has a budget). Then the existing-items sheet with the returned `existing`.
  - **upcoming:** `events.startNow`, then the existing-items sheet.
- "Xem báo cáo" link (`events.viewReport`) → `buildTagReportUrl(tagId, countsFrom, end ?? today)`, hidden when `tagId` is null.
- Day line: `ngày {day}/{of}`, or `ngày {day}` when the end is open.

**List:** sections `events.sectionOn` / `sectionUpcoming` / `sectionDone`; button `events.newEvent`.

**Copy** (vi first; `// REVIEW` on each vi line). Change existing `events.*` values to these, and add the new keys:

| key | vi | en |
|---|---|---|
| events.bookIdle | Sự kiện | Events |
| events.bookOn | {name} đang diễn ra | {name} is on |
| events.bookOnMany | {n} sự kiện đang diễn ra · {names} | {n} events on · {names} |
| events.bookUpcoming | Sắp tới: {name} | Upcoming: {name} |
| events.bookDayOpen | ngày {day} | day {day} |
| events.bookLeadSpent | Đã chi trước {amount} | Spent before: {amount} |
| events.listTitle | Sự kiện | Events |
| events.sectionOn | Đang diễn ra | On now |
| events.sectionUpcoming | Sắp tới | Upcoming |
| events.sectionDone | Đã xong | Done |
| events.newEvent | Sự kiện mới | New event |
| events.nameLabel | Tên sự kiện | Event name |
| events.startLabel | Bắt đầu | Starts |
| events.startHint | Để trống là bắt đầu hôm nay | Leave empty to start today |
| events.endLabel | Kết thúc (tuỳ chọn) | Ends (optional) |
| events.endHint | Để trống là chạy đến khi bạn dừng | Leave empty to run until you stop it |
| events.limitNeedsEnd | Đặt ngày kết thúc để đặt hạn mức | Set an end date to set a limit |
| events.clearEndConfirm | Bỏ ngày kết thúc sẽ xoá hạn mức. Tiếp tục? | Removing the end date removes the limit. Continue? |
| events.save | Lưu sự kiện | Save event |
| events.stop | Dừng | Stop |
| events.stopConfirm | Dừng {name} từ bây giờ? Khoản chi mới sẽ không được gắn tag nữa. | Stop {name} now? New expenses won't get its tag. |
| events.resume | Tiếp tục | Resume |
| events.resumeConfirm | Tiếp tục {name}? | Resume {name}? |
| events.resumeDropsLimit | Hạn mức sẽ bị bỏ vì sự kiện không còn ngày kết thúc. | The limit will be removed because the event no longer has an end date. |
| events.startNow | Bắt đầu ngay | Start now |
| events.delete | Xóa sự kiện | Delete event |
| events.leadup | Trước sự kiện | Before the event |
| events.viewReport | Xem báo cáo | View report |
| events.entryOn | {name} | {name} |
| events.entrySuggest | Thêm vào {name} | Add to {name} |
| events.entryRemove | Bỏ khỏi {name} | Remove from {name} |
| events.empty | Chưa có khoản chi nào cho sự kiện này. | No expenses for this event yet. |
| events.statePill.on | Đang diễn ra | On now |
| events.statePill.done | Đã xong | Done |
| reports.tagFilterClear | Bỏ lọc tag | Clear tag filter |
| reports.tagReportAria | Xem báo cáo cho {tag} | View report for {tag} |

Remove the keys no longer used: `events.overlap`, `events.endEarly`, `events.nameLabel`'s old "(also tag)" value, `events.bookDaysLeft` only if unused. Other existing `events.*` keys keep their meaning, with "chuyến" wording replaced by "sự kiện". The ✈️ icon becomes lucide `calendar-days` everywhere.

- [ ] **Tests (new file):**
  - `form with only a name saves start=today, end=null`
  - `limit field hidden until end set, hint shown`
  - `clearing end with a limit asks first`
  - `stop asks then calls stop`
  - `resume shows the existing sheet with the gap`
  - `start now on upcoming`
  - `view report link uses countsFrom..end`
  - `null tag hides the report link and shows 0`
- [ ] Commit `feat(screens): event form, page and list — optional dates, stop/resume/start now (#158)`.

### Task 9: Several events on Sổ chi tiêu and in the expense form (neon)

**Files:** `libs/web/screens/src/components/events/BookEventRow.tsx`, `libs/web/screens/src/components/events/EntryEventRow.tsx`, `libs/web/screens/src/screens/EntryPage.tsx`, `libs/web/screens/src/screens/SpendingBook.tsx`; branch tests `book-event-row.test.tsx`, `entry-event-row.test.tsx` (update), **new** `__tests__/events-multi-rows.test.tsx`.

- [ ] **BookEventRow:**
  - With one running event: as now, with copy `events.bookOn`, the day line, and the bar when there is a limit.
  - With two or more: `events.bookOnMany` with `n` and the names joined by `, `. It opens the list.
  - With none running: the soonest upcoming one, as now.
  - Otherwise: `events.bookIdle`.
- [ ] **Expense form:**
  - `eventsForDate` gives a list.
  - Render one `EntryEventRow` per match: `'on'` rows are on by default with their own 44px ✕; `'leadup'` rows are suggestions.
  - Per-row state is keyed by event id and resets when the date changes the match set.
  - Saving adds the tag of every row that is on and removes the tag of every row turned off (edit mode: a row starts on when the entry already has that tag).
- [ ] **Tests:**
  - `two running events: book row says 2 sự kiện đang diễn ra with both names`
  - `two running events: form shows two rows, removing one saves only the other tag`
  - `stopped event gives no row for today`
  - `lead-up of an upcoming event shows as a suggestion next to a running row`
- [ ] Commit `feat(screens): several running events on Sổ chi tiêu and in the expense form (#158)`.

### Task 10: E2E and docs (hydrogen)

**Files:** `e2e/events.spec.ts` (branch, update), `DESIGN.md` (the trip sections become events).
- [ ] E2E flow:
  1. Create "Đà Lạt" with only a name. The book row reads "Đà Lạt đang diễn ra".
  2. Add an expense; it shows the row on.
  3. Create a second event "Mua sắm Tết"; the book row reads "2 sự kiện đang diễn ra".
  4. Stop "Đà Lạt"; the book row is back to one.
  5. Open "Xem báo cáo" from the event page; the report shows the `#dalat-…` chip and the expense's amount.
- [ ] DESIGN.md: rename the sections and describe the multi-event row, Dừng/Tiếp tục and the tag filter chip.
- [ ] Commit `test(e2e): events flow; docs: events and tag report (#158)`.

### Final

- Gate: `npm test`, `npm run typecheck`, `npm run lint`, `npm run e2e -- events`, `npm run e2e -- golden-path`, `WALKTHROUGH=1 npm run e2e -- walkthrough`.
- Whole-branch review on the most capable model, then one fix wave.
- Push to `feat/trip-mode` (updates PR #160; retitle it to "Events and tag report"). Apply `0038` locally in the main worktree and start the tunnel from `C:\repo\experience\coin-crew`.
