# Attendance Reliability and Crew Memes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store per-person attendance scores (presence, reliability, guests) for sport groups, show admins a turnout estimate in the plan form, and let admins share four animated meme cards.

**Architecture:**
- **Scoring:** pure functions in `@cc/core` (`attendance.ts`) do all scoring. The API reads sport bill version chains, applies uncounted sessions, and stores the result in three new D1 tables under a per-group version guard. Counting runs when an admin creates a plan. A read-only "preview" applies uncounted sessions in memory for the plan form and the cards.
- **Web:** the web side reads one admin-only endpoint. The four cards are animated React components, with matching canvas painters that make the PNG saved or shared through `usePlatform()`.

**Tech Stack:** TypeScript, Hono on Cloudflare Workers, D1 + drizzle, React 19, Tailwind v4 / shadcn wrappers, Vitest (`cloudflare:test` for the API), canvas 2D.

**Spec:** `docs/superpowers/specs/2026-11-13-attendance-reliability-design.md` (approved 2026-11-13). Read it before any task.

## Global Constraints

- Constants, verbatim from the spec: join `min(0.08 + 0.04·(s−1), 0.35)`, then `score += gain·(100 − score)`; skip `min(0.2 · 1.5^(k−1), 0.6)`, then `score ×= (1 − loss)`. Presence starts at 30, reliability at 80, guest at 0. `guest = 0.8·guest + guestsBrought`. Regular ≥ 75, rare ≤ 20, flaky ≤ 50 (with ≥ 5 plans), no label below 5 counted sessions.
- `guestsBrought = max(0, maleSlots + femaleSlots − 1)`.
- One session = one sport bill chain (`rootId`). Count only chains whose head is `status = 'approved'` with `meta.sport` and `planning !== true`. Pending, disabled, rejected and deleted chains are skipped.
- Scores, labels and cards are **admins only** (`can(actor, 'plan_session')`). Members and guests never get them.
- No push, email or SMS. Sharing is the admin's own tap through `usePlatform()` (`saveImage` / `share`).
- Import rules from `CLAUDE.md`: relative imports inside a library, package names across libraries, no `@/`. Lint only through Nx (`npm run lint`).
- Colours come only from tokens in `libs/web/ui/src/styles/globals.css`. Canvas painters are the one hex exception, listed in `IMAGE_PAINTERS` in `libs/web/screens/src/test/style-guard.test.ts`.
- Award accents are Jade, never Turmeric. Every animation honours `motion-reduce:` / `prefers-reduced-motion` and rests on its final frame.
- Copy goes in `@cc/web-i18n`, Vietnamese first (`vi.ts`) and English (`en.ts`). Every new Vietnamese line is marked `// REVIEW`.
- Hand-written D1 migration, applied locally with `--local` for the tunnel. Commit only when the owner says so.
- Branch: rename to `feat/attendance-reliability` before the first commit. The PR targets `main`.

## Review Focus

1. **A bill edited after it was counted** gets a new row id, but its `rootId` is unchanged. It must not be counted again. Test: Task 4, "an edit after counting is not recounted".
2. **A person merged after their session finished, before counting.** The old bill's `sport.entries` still name the merged-away id, so the score must land on the survivor. Test: Task 3, "resolves merged ids to the survivor".
3. **Two admins create plans at the same moment.** One counting run wins, the other writes nothing, and no score is stepped twice. Test: Task 4, "a stale version writes nothing".
4. **A brand-new sport group, with no finished sessions or no scores yet.** The turnout card shows signed-up people at 0.8 each. The awards screen shows an empty state, and no card is offered with no content. Tests: Task 6, "turnout with no scores", and Task 8, "empty state".
5. **A long Vietnamese name** such as "Nguyễn Thị Phương Thảo" on every card. Canvas text is cut with "…" to fit, and the DOM card wraps without overflowing 270px. Test: Task 7, "long names fit".

---

## File structure

| File | Responsibility |
|---|---|
| `libs/shared/core/src/attendance.ts` (new) | constants, types, step formulas, `applySession`, labels, `turnoutEstimate`, `mergeScores` |
| `libs/shared/core/src/api-types.ts` | `AttendanceView` response types |
| `apps/api/migrations/0023_attendance.sql` (new), `libs/api/db/src/schema.ts` | three tables |
| `libs/api/db/src/attendance.ts` (new) | `commitAttendance` guarded batch, row ↔ `AttendanceScore` mapping |
| `apps/api/src/attendance/sessions.ts` (new) | load sport sessions from version chains |
| `apps/api/src/attendance/count.ts` (new) | `countPendingSessions`, `previewAttendance` |
| `apps/api/src/attendance/routes.ts` (new), `apps/api/src/app.ts` | `GET /api/trips/:id/attendance` |
| `apps/api/src/expenses/routes.ts` | run counting after a plan is created |
| `apps/api/src/participants/merge.ts` | merge score rows |
| `libs/web/data-access/src/attendance.ts` (new) | `useAttendance` |
| `libs/web/screens/src/components/TurnoutCard.tsx`, `TurnoutSheet.tsx` (new), `screens/ExpenseForm.tsx` | plan-form summary and "look who's back" |
| `libs/web/util/src/memeCards.ts` (new) | four canvas painters → PNG |
| `libs/web/screens/src/lib/awards.ts` (new) | pick award content and verses from the view |
| `libs/web/screens/src/components/meme/*.tsx` (new), `screens/CrewAwards.tsx` (new), `App.tsx`, `screens/MemberTrip.tsx` | animated cards, awards screen, route, entry point |
| `libs/web/i18n/src/vi.ts`, `en.ts` | copy |
| `DESIGN.md`, `.impeccable/design.json`, `libs/web/ui/src/styles/globals.css` | the card world and its tokens |

---

### Task 1: Core scoring (`@cc/core/attendance`)

**Files:**
- Create: `libs/shared/core/src/attendance.ts`; export it from `libs/shared/core/src/index.ts`
- Test: `libs/shared/core/src/__tests__/attendance.test.ts`

**Interfaces:**
- Produces:
```ts
export const ATTENDANCE = { joinBase: 0.08, joinStep: 0.04, joinCap: 0.35, skipBase: 0.2, skipGrowth: 1.5, skipCap: 0.6,
  presenceStart: 30, reliabilityStart: 80, guestDecay: 0.8, regularAt: 75, rareAt: 20, flakyAt: 50, minSessions: 5,
  newcomerChance: 0.8 } as const;
export interface AttendanceSession { rootId: string; spentOn: string; planned: boolean; planIds: string[];
  bill: { participantId: string; slots: number }[] }
export interface AttendanceScore { participantId: string; presence: number; reliability: number; guest: number;
  presenceJoinStreak: number; presenceSkipStreak: number; reliabilityJoinStreak: number; reliabilitySkipStreak: number;
  sessionsSeen: number; sessionsPlanned: number; timesPlayed: number; guestsTotal: number; lastPlayedOn: string | null;
  lastSessionRoot: string | null; lastBack: boolean; lastReturnGap: number; lastEndedNoShowStreak: number }
export type AttendanceLabel = 'new' | 'regular' | 'rare' | 'flaky' | 'topGuest' | 'back';
export function newScore(participantId: string): AttendanceScore;
export function joinStep(score: number, streak: number): number;
export function skipStep(score: number, streak: number): number;
/** `active`: ids that may be stepped as "skipped" (tracked, not left). Anyone on the plan or bill gets a row. Returns a new map. */
export function applySession(scores: ReadonlyMap<string, AttendanceScore>, session: AttendanceSession,
  active: ReadonlySet<string>): Map<string, AttendanceScore>;
export function attendanceLabels(score: AttendanceScore, ctx: { latestRootId: string | null; topGuestId: string | null }): AttendanceLabel[];
export function topGuestId(scores: Iterable<AttendanceScore>): string | null;   // highest guest ≥ 1, ties → higher guestsTotal, then id
export function wantedStamp(score: AttendanceScore, latestRootId: string | null): boolean;
export function turnoutEstimate(entries: { participantId: string; slots: number }[],
  scores: ReadonlyMap<string, AttendanceScore>): { likely: number; total: number; sure: number; unsure: number; flaky: number };
export function mergeScores(into: AttendanceScore, from: AttendanceScore): AttendanceScore;
```

- [ ] **Step 1: Write the failing tests**

```ts
describe('attendance formulas', () => {
  it('joins from the start reach regular in 6 sessions', () => {
    // apply 6 "played" direct-bill sessions to one person from newScore
    expect(presences.map(Math.round)).toEqual([36, 43, 52, 62, 71, 79]);
  });
  it('skips from 80 drop 64 → 45 → 25 → 10', () => {
    let p = 80; const out = [];
    for (let k = 1; k <= 4; k++) { p = skipStep(p, k); out.push(Math.round(p)); }
    expect(out).toEqual([64, 45, 25, 10]);
  });
  it('two no-shows in a row make a planned person flaky after 5 plans', () => { /* 3 played + 2 noShow planned sessions → reliability ≈ 45, labels contain 'flaky' */ });
  it('walk-in raises presence and leaves reliability alone', () => {});
  it('direct bill (planned=false) never changes reliability', () => {});
  it('guest score: 0.8·g + brought; slots 3 → brought 2', () => {});
  it('an active tracked person missing from the bill is skipped; one not in `active` is untouched', () => {});
  it('no label before 5 sessions: labels === ["new"]', () => {});
  it('back: joined while presence ≤ 20 before the session, and lastSessionRoot is latest', () => {});
  it('wantedStamp: no-show streak ≥ 2 ended by playing in the latest session', () => {});
  it('turnout with no scores counts each slot at 0.8 and rounds', () => {
    expect(turnoutEstimate([{ participantId: 'a', slots: 1 }, { participantId: 'b', slots: 3 }], new Map()))
      .toEqual({ likely: 3, total: 4, sure: 4, unsure: 0, flaky: 0 });
  });
  it('turnout buckets by reliability: ≥75 sure, 50–75 unsure, ≤50 flaky, weighted by slots', () => {});
  it('mergeScores takes the max of every number; last* fields from the later lastPlayedOn', () => {});
});
```

- [ ] **Step 2: Run them and watch them fail.** Command: `npm test -w @cc/core -- attendance`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement `attendance.ts`.** Each person in `applySession` follows the spec's tables.
  - **Presence:** on the bill = join, else skip if in `active`.
  - **Reliability:** only when `planned && planIds.includes(id)`.
  - **Bookkeeping:** `sessionsSeen++` for everyone stepped, and `sessionsPlanned++` for people on the plan.
  - **`last*` fields:** `lastBack` is true when the person joined and their presence before the session was ≤ `rareAt` with `sessionsSeen ≥ minSessions` before it. `lastReturnGap` is the presence skip streak that ended. `lastEndedNoShowStreak` is the reliability skip streak that a played session just ended, and 0 otherwise. `lastSessionRoot = session.rootId` for everyone stepped.
  - **Labels:** `'new'` alone while `sessionsSeen < minSessions`. In turnout, a newcomer (`sessionsSeen < minSessions`) counts at `newcomerChance` and in the "sure" bucket.
- [ ] **Step 4: Run the tests.** Command: `npm test -w @cc/core -- attendance`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(core): attendance scores, labels and turnout estimate (#87)`

---

### Task 2: Tables and the guarded write

**Files:**
- Create: `apps/api/migrations/0023_attendance.sql`, `libs/api/db/src/attendance.ts`
- Modify: `libs/api/db/src/schema.ts` (add `attendanceScores`, `attendanceCounted`, `attendanceState`)
- Test: `apps/api/test/attendance-db.test.ts`

**Interfaces:**
- Consumes: `AttendanceScore` (Task 1).
- Produces:
```ts
export async function readAttendance(db: Db, tripId: string): Promise<{ version: number; scores: Map<string, AttendanceScore>; counted: Set<string> }>;
/** One batch: version guard, upsert every score, insert every counted root. On a version miss nothing lands. */
export async function commitAttendance(db: Db, tripId: string, expectedVersion: number,
  scores: AttendanceScore[], countedRoots: string[]): Promise<'written' | 'raced'>;
```

SQL (column names are the snake_case of `AttendanceScore`; `last_back` is an integer 0/1):

```sql
CREATE TABLE `attendance_scores` (`trip_id` text NOT NULL, `participant_id` text NOT NULL, `presence` real NOT NULL, `reliability` real NOT NULL, `guest` real NOT NULL,
  `presence_join_streak` integer NOT NULL DEFAULT 0, `presence_skip_streak` integer NOT NULL DEFAULT 0, `reliability_join_streak` integer NOT NULL DEFAULT 0, `reliability_skip_streak` integer NOT NULL DEFAULT 0,
  `sessions_seen` integer NOT NULL DEFAULT 0, `sessions_planned` integer NOT NULL DEFAULT 0, `times_played` integer NOT NULL DEFAULT 0, `guests_total` integer NOT NULL DEFAULT 0,
  `last_played_on` text, `last_session_root` text, `last_back` integer NOT NULL DEFAULT 0, `last_return_gap` integer NOT NULL DEFAULT 0, `last_ended_no_show_streak` integer NOT NULL DEFAULT 0,
  `updated_at` text NOT NULL, PRIMARY KEY (`trip_id`, `participant_id`));--> statement-breakpoint
CREATE TABLE `attendance_counted` (`root_id` text PRIMARY KEY NOT NULL, `trip_id` text NOT NULL, `counted_at` text NOT NULL);--> statement-breakpoint
CREATE INDEX `attendance_counted_trip_idx` ON `attendance_counted` (`trip_id`);--> statement-breakpoint
CREATE TABLE `attendance_state` (`trip_id` text PRIMARY KEY NOT NULL, `version` integer NOT NULL DEFAULT 0);
```

- [ ] **Step 1: Write failing tests:**
  - "commitAttendance writes scores and counted roots and bumps version"
  - "a stale version writes nothing and returns raced"
  - "readAttendance of an empty group gives version 0, no scores"
- [ ] **Step 2: Run them.** Command: `npm test -w @cc/api -- attendance-db`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The guard follows the `changes()` trick in `libs/api/db/src/commit.ts:56-80`, on `attendance_state` instead of `trips`:
    - first `INSERT OR IGNORE` the state row, before the batch;
    - then, inside the batch, `UPDATE attendance_state SET version = version + 1 WHERE trip_id = ? AND version = ?`;
    - then `UPDATE attendance_state SET version = CASE WHEN changes() > 0 THEN version ELSE NULL END WHERE trip_id = ?`;
    - then the upserts and inserts.
  - A NOT NULL failure means `'raced'`.
  - Don't bump `trips.version` and don't write activity. Counting is invisible bookkeeping.
- [ ] **Step 4: Run the tests and apply the migration locally.** Commands: `npm test -w @cc/api -- attendance-db`, then `npx wrangler d1 migrations apply fsl --local` in `apps/api`. Expected: PASS, and the migration applies.
- [ ] **Step 5: Commit** `feat(db): attendance tables and guarded write (#87)`

---

### Task 3: Load sessions from version chains

**Files:**
- Create: `apps/api/src/attendance/sessions.ts`
- Test: `apps/api/test/attendance-sessions.test.ts`

**Interfaces:**
- Consumes: `AttendanceSession` (Task 1).
- Produces:
```ts
/** Finished sport sessions oldest first (spentOn, then root created_at); skips roots in `exclude`. */
export async function loadSportSessions(db: Db, tripId: string, exclude: ReadonlySet<string>): Promise<AttendanceSession[]>;
/** id → survivor id (follows merged_into), and the set of ids still active (not left/merged). */
export async function loadPeople(db: Db, tripId: string): Promise<{ resolve: (id: string) => string; active: Set<string> }>;
```

- [ ] **Step 1: Write failing tests.** Seed with `seedTrip()` + `preset = 'sport'`, inserting version rows by SQL as in `apps/api/test/helpers.ts`.
  - "a plan finished into a bill: planned = true, planIds from the last planning version"
  - "a plan edited twice before finishing uses the last planning version"
  - "a bill edited after finishing still reads the plan from history (current planning flag gone)"
  - "a direct bill: planned = false, planIds = []"
  - "slots = maleSlots + femaleSlots per entry"
  - "skips pending, disabled, still-planning and excluded roots"
  - "resolves merged ids to the survivor"
  - "orders by spentOn then created_at"
- [ ] **Step 2: Run them.** Command: `npm test -w @cc/api -- attendance-sessions`. Expected: FAIL.
- [ ] **Step 3: Implement** with two queries:
  - the latest expense heads of the trip whose `meta_json` has a sport block;
  - all versions for those roots (`root_id IN (...)`, ordered by `created_at`).

  Walk each chain to the first non-planning version. The last planning version before it gives `planIds`.
- [ ] **Step 4: Run the tests.** Command: `npm test -w @cc/api -- attendance-sessions`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): read sport sessions with their plan lists (#87)`

---

### Task 4: Counting, preview, endpoint and the plan trigger

**Files:**
- Create: `apps/api/src/attendance/count.ts`, `apps/api/src/attendance/routes.ts`
- Modify: `apps/api/src/app.ts` (`app.route('/api', attendanceRoutes())`), `apps/api/src/expenses/routes.ts` (the POST handler, after `commitTripWrite`, when `isPlanningExpense(validated)`), `libs/shared/core/src/api-types.ts`
- Test: `apps/api/test/attendance-count.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
```ts
// api-types.ts
export interface AttendancePerson { participantId: string; score: AttendanceScore; labels: AttendanceLabel[]; wantedStamp: boolean }
export interface AttendanceView { people: AttendancePerson[]; latestSession: { rootId: string; spentOn: string } | null; pendingSessions: number }
// count.ts
export async function countPendingSessions(db: Db, tripId: string): Promise<'counted' | 'nothing' | 'raced'>;
export async function previewAttendance(db: Db, tripId: string): Promise<AttendanceView>;
```
- Route: `GET /api/trips/:id/attendance`. It returns 403 unless `preset === 'sport'` and `ensure(actor, 'plan_session')` passes, and otherwise returns `AttendanceView`.

- [ ] **Step 1: Write failing tests:**
  - "creating a plan counts finished sessions oldest first and stores scores"
  - "an edit after counting is not recounted"
  - "a stale version writes nothing" (call `commitAttendance` with an old version between the read and the write)
  - "counting failure does not fail plan creation": the response is still 201
  - "preview includes a finished session not yet counted, without writing it"
  - "preview on a direct-bill-only group still returns scores"
  - "GET attendance is 403 for a member who is not an admin, a guest and a viewer; 403 in a trip group"
  - "labels and wantedStamp use the latest session overall"
- [ ] **Step 2: Run them.** Command: `npm test -w @cc/api -- attendance-count`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **`countPendingSessions`:** `readAttendance`, then `loadSportSessions(exclude = counted)`, then fold `applySession`, then `commitAttendance`.
  - **`previewAttendance`:** the same fold with no write. Then labels with `topGuestId`.
  - **The trigger in the POST route:** `await countPendingSessions(...)` inside `try/catch` that logs through the existing safe logger and never throws.
  - **The launch backfill falls out of this:** nothing is counted at launch, so a group's first new plan counts its whole history, oldest first, with plan lists rebuilt from version history. No separate script. Add the test "first plan after launch counts every historical session once".
- [ ] **Step 4: Run the tests and the whole API suite.** Command: `npm test -w @cc/api`. Expected: PASS, with no regressions in `sport-planning-expenses.test.ts`.
- [ ] **Step 5: Commit** `feat(api): count sessions on new plans and serve an admin preview (#87)`

---

### Task 5: Merges keep the higher score

**Files:**
- Modify: `apps/api/src/participants/merge.ts` (`mergeParticipants`, around `:56` and its write batch)
- Test: `apps/api/test/attendance-merge.test.ts`

**Interfaces:**
- Consumes: `mergeScores` (Task 1), the row mapping from Task 2 (export `scoreRow` / `rowToScore` from `libs/api/db/src/attendance.ts`).

- [ ] **Step 1: Write failing tests:**
  - "merging a guest into a member keeps the max of each score and deletes the guest's row"
  - "merging into someone without a row moves the row"
  - "merging two people without rows writes nothing"
- [ ] **Step 2: Run them.** Command: `npm test -w @cc/api -- attendance-merge`. Expected: FAIL.
- [ ] **Step 3: Implement.** Read both rows before the batch. Add the upsert of `mergeScores(into, from)` and the delete of `from` to the merge's existing batch, so they land or fail with the merge.
- [ ] **Step 4: Run the merge suites.** Command: `npm test -w @cc/api -- merge`. Expected: PASS, including every existing `merge-*.test.ts`.
- [ ] **Step 5: Commit** `feat(api): merged people keep the higher attendance score (#87)`

---

### Task 6: Turnout card in the plan form

**Files:**
- Create: `libs/web/data-access/src/attendance.ts`, `libs/web/screens/src/components/TurnoutCard.tsx`, `libs/web/screens/src/components/TurnoutSheet.tsx`
- Modify: `libs/web/screens/src/screens/ExpenseForm.tsx` (render under the schedule card at `:1173`, only when `isPlanningMode && sportShown`; per-row "back" pill in the planning participant list), `libs/web/i18n/src/vi.ts`, `en.ts`
- Test: `libs/web/screens/src/__tests__/turnout-card.test.tsx`

**Interfaces:**
- Consumes: `GET /api/trips/:id/attendance`, `turnoutEstimate`, `AttendanceView`.
- Produces: `export function useAttendance(tripId: string, opts: { enabled: boolean }): UseQueryResult<AttendanceView>` (query key `['attendance', tripId]`, through `apiFetch`); `<TurnoutCard tripId entries={SportParticipantEntry[]} />`.

Copy (vi, `// REVIEW`; en in brackets):
- `turnout.title`: "Khả năng đến thật" ("Likely to actually come")
- `turnout.estimate`: "khoảng {likely}/{total}" ("about {likely} of {total}")
- `turnout.counts`: "{sure} chắc đến · {unsure} chưa chắc · {flaky} hay bùng" ("{sure} sure · {unsure} unsure · {flaky} often no-show")
- `turnout.seeWho`: "Xem ai ›" ("See who ›")
- `turnout.back`: "Đã trở lại!" ("Look who's back!")
- `attendance.label.<label>` for each `AttendanceLabel`

- [ ] **Step 1: Write failing tests:**
  - "shows about 7 of 9 from scores and updates when an entry is removed"
  - "turnout with no scores": everyone counts at 0.8
  - "See who opens a Sheet listing labels and the three scores"
  - "a rare joiner added to the plan shows the back pill; tapping it links to /t/:id/awards"
  - "not rendered outside planning mode"
  - "keeps fsl- classes": add `fsl-turnout-card` and `data-testid="turnout-card"`
- [ ] **Step 2: Run them.** Command: `npm test -w @cc/web-screens -- turnout-card`. Expected: FAIL.
- [ ] **Step 3: Implement** with the existing wrappers (`Sheet`, `Pill`, `Avatar`, `Button`).
  - The card is a white `rounded-xl` summary card with a hairline border.
  - Bar segments use `bg-primary` (sure), `bg-muted-foreground/40` (unsure) and `bg-danger` (flaky). This is admin-only status, not money; the danger tone stays for "often no-show" because it marks a problem.
  - The back pill pops with `motion-reduce:animate-none`.
- [ ] **Step 4: Run tests and typecheck.** Commands: `npm test -w @cc/web-screens -- turnout-card`, then `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): turnout estimate and look-who's-back in the plan form (#87)`

---

### Task 7: Canvas painters for the four cards

**Files:**
- Create: `libs/web/util/src/memeCards.ts`
- Modify: `libs/web/screens/src/test/style-guard.test.ts` (add `'util/src/memeCards.ts'` to `IMAGE_PAINTERS`; planner-owned edit of an existing test), `libs/web/screens/package.json` (add `@fontsource/alfa-slab-one`, `@fontsource/playfair-display`, `@fontsource/bungee`, pinned versions that ship a `vietnamese` subset; fall back to the nearest face that does and record it in DESIGN.md)
- Test: `libs/web/util/src/__tests__/memeCards.test.ts`

**Interfaces:**
- Produces:
```ts
export type MemeKind = 'awards' | 'wanted' | 'verse' | 'board';
export interface MemeAward { kind: 'regular' | 'back' | 'guest' | 'noShow'; title: string; name: string; stat: string }
export type MemeInput =
  | { kind: 'awards'; heading: string; subheading: string; awards: MemeAward[]; footer: string }
  | { kind: 'wanted'; heading: string; group: string; name: string; initials: string; crime: string; lastSeen: string; reward: string; stamp: string | null; footer: string }
  | { kind: 'verse'; heading: string; month: string; verses: { line6: string; line8: string; name: string; tag: string }[]; seal: string; footer: string }
  | { kind: 'board'; heading: string; subheading: string; rows: { label: string; name: string; value: number; tone: 'hot' | 'plain' | 'cold' }[]; ticker: string; footer: string };
/** 1080×1920 PNG of the card's final frame. Waits for `document.fonts.load` of the card's faces first. */
export function renderMemePng(input: MemeInput): Promise<Blob | null>;
```
- Copy comes from the caller, since this library has no copy, as with `ledgerCard.ts`. Colours are a `MEME_COLOURS` constant matching the mockup in `.superpowers/brainstorm/*/content/meme-cards.html`.

- [ ] **Step 1: Write failing tests.** Use a mocked canvas context, as in `ledgerCard.test.ts`.
  - "each kind draws its heading and every name"
  - "long names fit": a name like "Nguyễn Thị Phương Thảo" is cut with "…" within its column width
  - "wanted draws the stamp only when stamp ≠ null"
  - "board pads values to two flip digits"
- [ ] **Step 2: Run them.** Command: `npm test -w @cc/web-util -- memeCards`. Expected: FAIL.
- [ ] **Step 3: Implement the four painters at 4× the mockup's 270×480 layout.**
- [ ] **Step 4: Run the tests and the style guard.** Commands: `npm test -w @cc/web-util -- memeCards`, then `npm test -w @cc/web-screens -- style-guard`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): canvas painters for the crew meme cards (#87)`

---

### Task 8: Crew awards screen and the animated cards

**Files:**
- Create: `libs/web/screens/src/lib/awards.ts`, `libs/web/screens/src/components/meme/AwardNightCard.tsx`, `WantedCard.tsx`, `VerseCard.tsx`, `BoardCard.tsx`, `libs/web/screens/src/screens/CrewAwards.tsx`
- Modify: `libs/web/screens/src/App.tsx` (`<Route path="awards" element={<CrewAwards />} />` beside `ratings`), `libs/web/screens/src/screens/MemberTrip.tsx` (a "Crew awards" row for sport admins near `LeaderboardWidget`, `:138` / `:153`), `TurnoutSheet.tsx` (link), `vi.ts`, `en.ts`
- Test: `libs/web/screens/src/__tests__/crew-awards.test.tsx`, `libs/web/screens/src/lib/__tests__/awards.test.ts`

**Interfaces:**
- Consumes: `useAttendance`, `renderMemePng` / `MemeInput`, `usePlatform().saveImage` / `share`.
- Produces:
```ts
export interface AwardsContent { awards: MemeInput & { kind: 'awards' } | null; wantedCandidates: string[];
  wanted(participantId: string): MemeInput & { kind: 'wanted' }; verse: MemeInput & { kind: 'verse' } | null; board: MemeInput & { kind: 'board' } | null }
export function buildAwards(view: AttendanceView, people: { id: string; name: string }[], t: Translate): AwardsContent;
export function pickVerse(kind: 'regular' | 'back' | 'noShow', seed: string, poolSize: number): number;  // stable index, rotates with seed = latest rootId
```
- Award selection:
  - **Regular:** the highest presence among the "regular" labels (ties go to the longer join streak).
  - **Back:** the "back" label, with `lastReturnGap` in the stat.
  - **Guest:** "topGuest", with `guestsTotal` in the stat.
  - **No-show:** the "flaky" person with the longest `reliabilitySkipStreak`, always placed last.
  - **Wanted candidates:** everyone flaky. The stamp is shown when `wantedStamp`.
- Copy (vi drafts from the mockup, `// REVIEW`; en alongside):
  - Award titles: `awards.title.regular` "Vua chuyên cần", `awards.title.back` "Sự trở lại ngoạn mục", `awards.title.guest` "Đại sứ kéo khách", `awards.title.noShow` "Thánh bùng kèo".
  - Wanted: `awards.wanted.heading` "TRUY NÃ", `awards.wanted.crime` "Tội danh: bùng kèo {n} trận liên tiếp", `awards.wanted.stamp` "ĐÃ RA SÂN!", `awards.wanted.reward` "TIỀN THƯỞNG: 1 QUẢ CẦU".
  - Verses: three per kind, `awards.verse.<kind>.<1..3>` with `{name}`. Seed them with the mockup couplets plus two new lục bát each.
  - Board: `awards.board.*`.
- The animations follow the mockup: staggered award flip with falling shuttlecocks; poster pin then stamp slam with a shake; line-by-line ink reveal with a seal; flip digits with a ticker. Each is 100–600ms per element, `motion-reduce:` shows the final frame, and there is one "Replay" button per card.
- Draw the shuttlecock as an authored SVG component, not an emoji.
- Load the three display fonts by dynamic import inside `CrewAwards` only, so they are not in the main bundle.

- [ ] **Step 1: Write failing tests:**
  - "buildAwards orders praise first and noShow last; drops missing awards"
  - "empty state": no counted or preview sessions → an empty message, no cards
  - "only admins reach the screen": a member is redirected, as on `RatingsScreen`
  - "Save calls platform.saveImage with a PNG named crew-awards-<kind>.png"
  - "Share on zmp calls platform.share"
  - "wanted picker lists flaky people and shows the stamp variant when wantedStamp"
  - "pickVerse is stable for a seed and changes with it"
  - "reduced motion: cards render with no animation classes active"
- [ ] **Step 2: Run them.** Command: `npm test -w @cc/web-screens -- awards`. Expected: FAIL.
- [ ] **Step 3: Implement.** Shape and animate the four cards with `/impeccable` (owner's request), starting from the mockup. Read `DESIGN.md` and the impeccable craft floor first.
- [ ] **Step 4: Run all checks.** Command: `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): crew awards screen with four animated meme cards (#87)`

---

### Task 9: Design record, end-to-end check, handoff

**Files:**
- Modify: `DESIGN.md` (a "Crew meme cards" section: an own world inside CoinCrew, its three display faces, Jade awards, its tokens), `.impeccable/design.json`, `libs/web/ui/src/styles/globals.css` (meme tokens used by the DOM cards)
- Test: `e2e/crew-awards.spec.ts` (new): admin creates a plan → the turnout card is visible; opens Crew awards → four cards; Save produces a download

- [ ] **Step 1: Write the e2e spec** with the steps above.
- [ ] **Step 2: Build and run it.** Command: `npm run e2e -- e2e/crew-awards.spec.ts`. Expected: PASS.
- [ ] **Step 3: Update DESIGN.md and the sidecar.** Then run `/impeccable` audit on the new screens and fix what it finds.
- [ ] **Step 4: Run the full verification.** Command: `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5: Hand off for the owner's test.** Apply the migration with `--local`, start `npm run tunnel`, check in the browser at the ngrok URL, then hand off for the owner's manual test.
- [ ] **Step 6: Commit and PR, after the owner approves.** `docs: crew meme card world in DESIGN.md (#87)`, then push and open a PR into `main`.
