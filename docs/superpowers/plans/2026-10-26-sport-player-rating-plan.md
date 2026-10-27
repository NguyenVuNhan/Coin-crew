# Sport Group Anonymous Player Rating & Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sport groups get an opt-in anonymous peer-rating and leaderboard system where signed-in members allocate stars from a `2 × N` budget (capped at `5 ★` per teammate, no self-rating), surfaced via a radial Top 3 podium widget that smoothly transitions from Full → Collapsed → Hidden on scroll, plus a dedicated `/t/:tripId/ratings` view.

**Architecture:** `trips` gains `ratings_enabled` and a new `player_ratings` table stores `(trip_id, rater_participant_id, target_participant_id, stars)`. `buildSnapshot` caches only public aggregate `totalStars` per active participant; `toTripView` attaches caller-private `myAllocations` only for the authenticated member, and star mutations bump `trips.version` without writing to `activity` so ratings remain 100% anonymous. On the web, `LeaderboardWidget` renders at the top of sport group pages with a 3-stage scroll transition, and `/t/:tripId/ratings` opens as a full screen on phones (`< 1024px`) or inside the right-hand `DetailsPanel` on wide screens (`>= 1024px`).

**Tech Stack:** TypeScript, Hono + Drizzle on Cloudflare Workers/D1 (`@fsl/api`), React 19 + React Router + TanStack Query (`@fsl/web`), Vitest (`@cloudflare/vitest-plugin` for API, Testing Library for Web).

**Spec:** [docs/2026-10-26-sport-player-rating-design.md](2026-10-26-sport-player-rating-design.md) · Wireframes: [docs/superpowers/mockups/v6-player-ratings.html](superpowers/mockups/v6-player-ratings.html)

## Global Constraints

- Zero new npm dependencies across `@fsl/core`, `@fsl/api`, and `@fsl/web`.
- Sport groups only (`trip.preset === 'sport'`); admin means `isAdmin || isOrganiser` on a signed-in member.
- Strict anonymity: `TripSnapshot` never contains rater identities; `toTripView` populates `myAllocations` only for `actor.kind === 'member'`; `POST /api/trips/:id/ratings` never writes to `activity`.
- Configurable constants in `@fsl/core` and re-exported in `apps/web/src/config.ts`: `RATING_STAR_MULTIPLIER = 2`, `RATING_MAX_STARS_PER_TARGET = 5`, `RATING_SEARCH_THRESHOLD = 12`, `RATING_INITIAL_VISIBLE = 10`.
- Phone-first at `375px`: `scrollWidth <= innerWidth` at `375px`, `768px`, and `1280px`; touch targets `>= 44×44px`; search input `16px` (`var(--text-input)`).
- Design tokens only (`apps/web/src/styles/tokens.css`); no raw hex values in CSS; `tabular-nums` on all star counts, ranks, and budgets; inline Lucide SVGs in `apps/web/src/components/icons.tsx`.
- Every new i18n key added to both `apps/web/src/i18n/en.ts` and `apps/web/src/i18n/vi.ts` (ending with `// REVIEW`); `scaffold.test.tsx` must pass.

## Review Focus

1. **Snapshots cached before this deploy have no `ratings` field:** `getSnapshot` must detect `!'ratings' in cached` and rebuild once, and web components must treat missing `view.ratings` as `null`. → Task 2 test `rebuilds a cached snapshot missing ratings` & Task 6 test `renders nothing when ratings is null or disabled`.
2. **Strict anonymity against admins and activity feed:** Even the group organiser or an admin querying `GET /api/trips/:id` or `GET /api/trips/:id/activity` must never see another member's `myAllocations` or an activity log entry for giving/reclaiming stars. → Task 3 test `strict anonymity: organiser never sees another member's allocations and activity log stays empty`.
3. **Roster shrinking soft-freeze:** When a guest leaves or is removed and $N$ drops, a member who already allocated `2 × N_old` stars to remaining active teammates must keep their allocations, be blocked from `+` (`409 RATING_LIMIT`), and be able to `-` (reclaim) until back under the new budget. → Task 3 test `roster shrink refunds stars on the removed player and soft-freezes over-budget members until they reclaim`.
4. **Search input when `N > 12` must search all active players even before "Show all" is clicked:** Typing a query for player #14 when only the top 10 are visible must immediately show player #14 without overlapping rows. → Task 7 test `search filters across all 15 players even when progressive reveal is at 10`.
5. **3-stage scroll transition (`full` → `collapsed` → `hidden`):** Scrolling past `40px` collapses the podium to the summary bar; scrolling past `200px` hides it completely; scrolling back to top (`<= 20px`) restores the full podium. → Task 6 test `transitions across full, collapsed, and hidden stages on scroll`.

---

### Task 1: Core — rating constants, ranking/budget helpers, types & permissions

**Files:**
- Create: `packages/core/src/ratings.ts`
- Modify: `packages/core/src/api-types.ts`, `packages/core/src/permissions.ts`, `packages/core/src/index.ts`
- Test: `packages/core/test/ratings.test.ts`

**Interfaces:**
- Produces (`packages/core/src/ratings.ts`, re-exported from `packages/core/src/index.ts`):
  - `RATING_STAR_MULTIPLIER = 2`
  - `RATING_MAX_STARS_PER_TARGET = 5`
  - `RATING_SEARCH_THRESHOLD = 12`
  - `RATING_INITIAL_VISIBLE = 10`
  - `interface RankedPlayer { id: string; name: string; avatarUrl: string | null; gender: 'M' | 'F' | null; isMember: boolean; stars: number; rank: number }`
  - `maxStarsForGroup(activeCount: number): number`
  - `rankPlayers(people: { id: string; name: string; status: string; avatarUrl?: string | null; gender?: 'M' | 'F' | null; isMember: boolean }[], totalStars: Record<string, number>): RankedPlayer[]`
  - `ratingBudget(activeCount: number, myAllocations: Record<string, number>): { maxStars: number; spentStars: number; remainingStars: number; overBudgetBy: number }`
- Produces (`packages/core/src/api-types.ts`):
  - `ApiErrorCode` gains `'RATING_LIMIT'`
  - `ActivityAction` gains `'ratings_changed'`
  - `interface RatingsView { enabled: boolean; totalStars: Record<string, number>; maxStars: number; myAllocations: Record<string, number> }`
  - `TripView` gains `ratings?: RatingsView | null`
- Produces (`packages/core/src/permissions.ts`):
  - `Action` gains `'manage_ratings' | 'rate_player'`
  - `can(actor, 'manage_ratings')` → `isMember && isAdmin`
  - `can(actor, 'rate_player')` → `isMember && !actor.participantPending`

- [ ] **Step 1: Write the failing test in `packages/core/test/ratings.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import {
  RATING_INITIAL_VISIBLE,
  RATING_MAX_STARS_PER_TARGET,
  RATING_SEARCH_THRESHOLD,
  RATING_STAR_MULTIPLIER,
  can,
  maxStarsForGroup,
  rankPlayers,
  ratingBudget,
} from '../src';

describe('ratings core helpers', () => {
  it('exports the configured rating constants', () => {
    expect(RATING_STAR_MULTIPLIER).toBe(2);
    expect(RATING_MAX_STARS_PER_TARGET).toBe(5);
    expect(RATING_SEARCH_THRESHOLD).toBe(12);
    expect(RATING_INITIAL_VISIBLE).toBe(10);
    expect(maxStarsForGroup(15)).toBe(30);
    expect(maxStarsForGroup(0)).toBe(0);
  });

  it('rankPlayers filters to active people and sorts by stars desc then roster order', () => {
    const people = [
      { id: 'p1', name: 'An', status: 'active', isMember: true, gender: 'M' as const, avatarUrl: null },
      { id: 'p2', name: 'Bình', status: 'active', isMember: false, gender: 'F' as const, avatarUrl: 'https://img/b.png' },
      { id: 'p3', name: 'Chi', status: 'left', isMember: false, gender: 'F' as const, avatarUrl: null },
      { id: 'p4', name: 'Dũng', status: 'pending', isMember: false, gender: 'M' as const, avatarUrl: null },
      { id: 'p5', name: 'Em', status: 'active', isMember: true, gender: 'M' as const, avatarUrl: null },
    ];
    const ranked = rankPlayers(people, { p1: 5, p2: 12, p3: 99, p4: 50, p5: 5 });
    expect(ranked.map((r) => [r.rank, r.id, r.stars])).toEqual([
      [1, 'p2', 12],
      [2, 'p1', 5],
      [3, 'p5', 5],
    ]);
  });

  it('ratingBudget computes remaining stars and over-budget deficit when roster shrinks', () => {
    expect(ratingBudget(10, { p2: 5, p3: 3 })).toEqual({
      maxStars: 20,
      spentStars: 8,
      remainingStars: 12,
      overBudgetBy: 0,
    });
    expect(ratingBudget(4, { p2: 5, p3: 5 })).toEqual({
      maxStars: 8,
      spentStars: 10,
      remainingStars: 0,
      overBudgetBy: 2,
    });
  });

  it('permissions: manage_ratings is admin-only; rate_player is active member-only', () => {
    const admin = { kind: 'member' as const, participantId: 'p1', participantPending: false, isOrganiser: false, isAdmin: true };
    const member = { kind: 'member' as const, participantId: 'p2', participantPending: false, isOrganiser: false, isAdmin: false };
    const guest = { kind: 'guest' as const, participantId: 'p3', participantPending: false, isOrganiser: false };
    const viewer = { kind: 'viewer' as const, participantId: null, participantPending: false, isOrganiser: false };

    expect(can(admin, 'manage_ratings')).toBe(true);
    expect(can(member, 'manage_ratings')).toBe(false);
    expect(can(guest, 'manage_ratings')).toBe(false);

    expect(can(admin, 'rate_player')).toBe(true);
    expect(can(member, 'rate_player')).toBe(true);
    expect(can(guest, 'rate_player')).toBe(false);
    expect(can(viewer, 'rate_player')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @fsl/core -- ratings`
Expected: FAIL (`rankPlayers` / `ratingBudget` not exported).

- [ ] **Step 3: Implement `packages/core/src/ratings.ts`, update `api-types.ts`, `permissions.ts`, and `index.ts`**

- [ ] **Step 4: Run core tests and typecheck**

Run: `npm test -w @fsl/core && npm run typecheck -w @fsl/core`
Expected: PASS.

---

### Task 2: API — D1 migration, schema, snapshot & caller-private `myAllocations`, and removal cleanup

**Files:**
- Create: `apps/api/migrations/0006_player_ratings.sql`
- Modify: `apps/api/src/db/schema.ts`, `apps/api/src/trips/snapshot.ts`, `apps/api/src/trips/view.ts`, `apps/api/src/participants/remove.ts`
- Test: `apps/api/test/ratings-snapshot.test.ts`

**Interfaces:**
- Consumes: Task 1 (`maxStarsForGroup`, `RatingsView`).
- Produces:
  - `trips.ratingsEnabled` and `playerRatings` table in `apps/api/src/db/schema.ts`
  - `TripSnapshot.ratings` (`null` for `trip` preset; `{ enabled, totalStars, maxStars, myAllocations: {} }` for `sport` preset)
  - `toTripView` populates `view.ratings.myAllocations` for `actor.kind === 'member' && actor.participantId !== null`
  - `takeOutOfTrip` deletes `player_ratings` rows where `raterParticipantId = participantId OR targetParticipantId = participantId`

- [ ] **Step 1: Write the failing test in `apps/api/test/ratings-snapshot.test.ts`**

Test that:
1. A `'trip'` group has `view.ratings === null`.
2. A `'sport'` group has `view.ratings = { enabled: false, totalStars: { ...0 }, maxStars: 2 * N, myAllocations: {} }` by default.
3. Seeded `player_ratings` rows aggregate into `totalStars`, while `toTripView` returns only the calling member's `myAllocations` (and `{}` for guests/viewers).
4. Cached snapshot without `'ratings'` in `trip_views` is rebuilt automatically.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @fsl/api -- ratings-snapshot`
Expected: FAIL.

- [ ] **Step 3: Create `0006_player_ratings.sql` and update `schema.ts`, `snapshot.ts`, `view.ts`, and `remove.ts`**

- [ ] **Step 4: Run API tests and typecheck**

Run: `npm test -w @fsl/api -- ratings-snapshot && npm run typecheck -w @fsl/api`
Expected: PASS.

---

### Task 3: API — `PATCH /trips/:id` `ratingsEnabled` toggle and `POST /trips/:id/ratings` anonymous star allocation/reclaim

**Files:**
- Create: `apps/api/src/ratings/routes.ts`
- Modify: `apps/api/src/trips/routes.ts`, `apps/api/src/app.ts`
- Test: `apps/api/test/ratings.test.ts`

**Interfaces:**
- Consumes: Task 1 (`RATING_MAX_STARS_PER_TARGET`, `maxStarsForGroup`, `can`), Task 2 (`playerRatings`, `trips.ratingsEnabled`).
- Produces:
  - `PATCH /api/trips/:id` accepts `{ fewestTransfers?: boolean; ratingsEnabled?: boolean }`; toggling `ratingsEnabled` requires a `'sport'` group and `ensure(actor, 'manage_ratings')`, logs `'ratings_changed'` in `activity`.
  - `POST /api/trips/:id/ratings` accepts `{ targetParticipantId: string; delta: 1 | -1 }`, validates sport group + `ratingsEnabled === 1` + `ensure(actor, 'rate_player')` + not self + active target + budget/cap limits (`409 RATING_LIMIT`), updates `player_ratings` and bumps `trips.version` in a D1 batch **without** writing to `activity`. Returns `200 { stars, spentStars, maxStars }`.

- [ ] **Step 1: Write the failing tests in `apps/api/test/ratings.test.ts`**

Cover:
1. Admin toggles `ratingsEnabled: true` and `false` on a sport group (`204`); non-admin or non-sport group gets `403`.
2. Member allocates `+1` up to `5 ★` on a target and reclaims `−1` down to `0` (deleting the row at `0`).
3. Strict anonymity: Organiser (`Minh`) never sees `An`'s `myAllocations`, and `GET /api/trips/:id/activity` has no entries for star changes (only `ratings_changed` when enabled).
4. Anti-abuse guards: self-rating → `422`; `> 5 ★` on one target → `409 RATING_LIMIT`; exceeding `2 × N` total budget → `409 RATING_LIMIT`; reclaiming at `0 ★` → `409 RATING_LIMIT`; guest/viewer/archived/disabled → `403`/`409`.
5. Roster shrink (`DELETE /people/:pid` and `POST /leave`): stars given to/by the removed person are deleted and refunded; if a member is over budget after another guest is removed, `+1` is refused with `409 RATING_LIMIT` while `−1` succeeds until back within the new `2 × N` budget.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @fsl/api -- ratings.test`
Expected: FAIL (`404` on `/ratings`).

- [ ] **Step 3: Implement `apps/api/src/ratings/routes.ts`, update `PATCH /trips/:id` in `apps/api/src/trips/routes.ts`, and mount `ratingRoutes()` in `apps/api/src/app.ts`**

- [ ] **Step 4: Run full API test suite and typecheck**

Run: `npm test -w @fsl/api && npm run typecheck -w @fsl/api`
Expected: PASS.

---

### Task 4: Web foundations — `config.ts`, `star` & `crown` icons, i18n keys, `InlineError` & `activityText`

**Files:**
- Modify: `apps/web/src/config.ts`, `apps/web/src/components/icons.tsx`, `apps/web/src/i18n/en.ts`, `apps/web/src/i18n/vi.ts`, `apps/web/src/components/InlineError.tsx`, `apps/web/src/lib/activityText.ts`
- Test: `apps/web/src/__tests__/scaffold.test.tsx`

**Interfaces:**
- Produces:
  - `RATING_STAR_MULTIPLIER`, `RATING_MAX_STARS_PER_TARGET`, `RATING_SEARCH_THRESHOLD`, `RATING_INITIAL_VISIBLE` in `apps/web/src/config.ts`
  - `'star'` and `'crown'` in `IconName` (`apps/web/src/components/icons.tsx`)
  - All `ratings.*`, `error.ratingLimit`, `activity.ratingsChanged`, `activity.action.ratings_changed` keys in `en.ts` and `vi.ts`

- [ ] **Step 1: Add constants to `config.ts`, SVG shapes to `icons.tsx`, error mapping to `InlineError.tsx`, activity formatting to `activityText.ts`, and i18n keys to `en.ts` and `vi.ts`**

- [ ] **Step 2: Run web scaffold test and typecheck**

Run: `npm test -w @fsl/web -- scaffold && npm run typecheck -w @fsl/web`
Expected: PASS.

---

### Task 5: Web — `RatingsSwitch` in `Settings.tsx`

**Files:**
- Create: `apps/web/src/components/RatingsSwitch.tsx`
- Modify: `apps/web/src/screens/Settings.tsx`
- Test: `apps/web/src/screens/__tests__/Settings-ratings.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`can`), Task 4 (`ratings.switchTitle`, `ratings.switchExplain`).
- Produces: `<RatingsSwitch view={view} />` rendered in `Settings.tsx` for sport group admins (`view.trip.preset === 'sport' && !view.trip.archived && can(actorOf(view), 'manage_ratings')`).

- [ ] **Step 1: Write failing tests in `apps/web/src/screens/__tests__/Settings-ratings.test.tsx`**

Verify that:
1. Sport group admin sees the `Player ratings` switch (`role="switch"`), and clicking it sends `PATCH /api/trips/:id` with `{ ratingsEnabled: true }`.
2. Non-admin member or non-sport group does not see `RatingsSwitch`.

- [ ] **Step 2: Implement `RatingsSwitch.tsx` and wire into `Settings.tsx`**

- [ ] **Step 3: Run test to verify it passes**

Run: `npm test -w @fsl/web -- Settings-ratings`
Expected: PASS.

---

### Task 6: Web — `LeaderboardWidget` with Radial Top 3 Podium, Cold-Start CTA & 3-Stage Scroll Transition

**Files:**
- Create: `apps/web/src/components/LeaderboardWidget.tsx`, `apps/web/src/components/LeaderboardWidget.css`
- Test: `apps/web/src/components/__tests__/LeaderboardWidget.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`rankPlayers`), Task 4 (`Icon` with `trophy`, `crown`, `star`, `chevronUp`, `chevronDown`, `chevronRight`; `ratings.*` copy).
- Produces:
  - `<PodiumTop3 players={top3} />` (reusable radial podium: `#2` left, `#1` center with crown and largest `68px` avatar, `#3` right).
  - `<LeaderboardWidget view={view} switching={boolean} />`:
    - Returns `null` unless `view.trip.preset === 'sport' && view.ratings?.enabled === true`.
    - When total stars across all active players is `0`: renders Cold-Start card with primary CTA link to `/t/:tripId/ratings`.
    - When total stars `> 0`: renders the 3-stage widget:
      - Stage 1 (`full` when `scrollY <= 40` and not manually collapsed): header, motivational club quote, `<PodiumTop3 />`, and collapse toggle button.
      - Stage 2 (`collapsed` when `40 < scrollY <= 200` or manually collapsed): compact `48px` bar with `#1`, `#2`, `#3` summary, expand button, and link to `/t/:tripId/ratings`.
      - Stage 3 (`hidden` when `scrollY > 200`): `fsl-leaderboard--hidden` (`max-height: 0; opacity: 0; pointer-events: none`, `aria-hidden="true"`).

- [ ] **Step 1: Write failing tests in `apps/web/src/components/__tests__/LeaderboardWidget.test.tsx`**

Verify:
1. Returns nothing when `ratings` is null or `ratings.enabled === false`.
2. Renders Cold-Start CTA (`Tap here to rate teammates`) when all players have `0` stars.
3. Renders radial podium with `#1` in the center slot (with Crown), `#2` on the left, `#3` on the right when stars `> 0`.
4. Transitions across `full` (`scrollY = 0`), `collapsed` (`scrollY = 100`), and `hidden` (`scrollY = 260`), and restores `full` when scrolling back to `scrollY = 0`.

- [ ] **Step 2: Implement `LeaderboardWidget.tsx` and `LeaderboardWidget.css`**

- [ ] **Step 3: Run test to verify it passes**

Run: `npm test -w @fsl/web -- LeaderboardWidget`
Expected: PASS.

---

### Task 7: Web — `RatingsScreen` (`/t/:tripId/ratings`), `TripRoute` & `DetailsPanel` integration, and Group Page placement

**Files:**
- Create: `apps/web/src/screens/RatingsScreen.tsx`, `apps/web/src/screens/RatingsScreen.css`
- Modify: `apps/web/src/App.tsx`, `apps/web/src/screens/TripRoute.tsx`, `apps/web/src/screens/DetailsPanel.tsx`, `apps/web/src/lib/detailsNav.ts`, `apps/web/src/screens/MemberTrip.tsx`, `apps/web/src/screens/GuestTrip.tsx`, `apps/web/src/screens/ViewOnlyTrip.tsx`
- Test: `apps/web/src/screens/__tests__/RatingsScreen.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`rankPlayers`, `ratingBudget`, `can`), Task 4 (`RATING_MAX_STARS_PER_TARGET`, `RATING_SEARCH_THRESHOLD`, `RATING_INITIAL_VISIBLE`), Task 6 (`LeaderboardWidget`, `PodiumTop3`).
- Produces:
  - `<RatingsPanel view={view} />` and `<RatingsScreen view={view} />` in `apps/web/src/screens/RatingsScreen.tsx`
  - `/t/:tripId/ratings` route in `App.tsx`, `Selection` union `{ kind: 'ratings' }` in `TripRoute.tsx` and `DetailsPanel.tsx`, `useRatingsLink` in `detailsNav.ts`
  - `<LeaderboardWidget view={view} />` placed at the top of `MemberTrip`, `GuestTrip`, and `ViewOnlyTrip`

- [ ] **Step 1: Write failing tests in `apps/web/src/screens/__tests__/RatingsScreen.test.tsx`**

Verify:
1. Member sees `<PodiumTop3 />`, star budget (`22 of 30 ★ left`), `You` badge on their own row with no `−`/`+` buttons, `+` disabled on a player already at `5 ★`, and clicking `+` / `−` calls `POST /api/trips/:id/ratings` with `{ targetParticipantId, delta: 1 | -1 }`.
2. Over-budget soft-freeze state (`spent > maxStars`) displays the warning banner and disables all `+` buttons while keeping `−` enabled on rated players.
3. With 15 players (`> RATING_SEARCH_THRESHOLD = 12`), renders the sticky search input and shows the first `10` rows (`RATING_INITIAL_VISIBLE = 10`) with `"Show all 15 players"`; typing into search immediately filters across all 15 players.
4. Guest sees the leaderboard and the `"Sign in to rate teammates"` prompt with Google sign-in link, without `−`/`+` buttons.

- [ ] **Step 2: Implement `RatingsScreen.tsx`, `RatingsScreen.css`, and wire into `App.tsx`, `TripRoute.tsx`, `DetailsPanel.tsx`, `detailsNav.ts`, `MemberTrip.tsx`, `GuestTrip.tsx`, and `ViewOnlyTrip.tsx`**

- [ ] **Step 3: Run full test suites and typechecks across all workspaces**

Run: `npm test && npm run typecheck`
Expected: PASS across `@fsl/core`, `@fsl/api`, and `@fsl/web`.
