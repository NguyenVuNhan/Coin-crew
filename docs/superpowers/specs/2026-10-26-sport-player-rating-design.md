# Sport Group Anonymous Player Rating & Leaderboard — Design

Date: 2026-10-26 · Status: approved for implementation · Wireframes: [v6-player-ratings.html](superpowers/mockups/v6-player-ratings.html)

---

## 1. Intent & Why

Weekly badminton and sport clubs (`preset === 'sport'`) need a lightweight, fair way to gauge player skill and celebrate active contributors:

1. **Matchmaking:** Help Group Admins evaluate player skill tiers and pair balanced doubles teams.
2. **Personal Evaluation:** Give players community feedback on their standing in the club.
3. **Fun & Engagement:** Add friendly gamification with a Top 3 podium and limited personal star budgets.

### Decisions (from the brainstorm)
- **Sport groups only (`preset === 'sport'`), opt-in per group:** A Group Admin (`isAdmin || isOrganiser`) enables or disables **Player ratings** in `Settings.tsx` (`trips.ratings_enabled`).
- **Strict anonymity (API & Activity guarantee):**
  - No user—not even a Group Admin or the Organiser—can ever see *who* gave stars to *whom*.
  - The cached `TripSnapshot` (`trip_views`) stores only public aggregate `totalStars` per `participantId`.
  - `toTripView` attaches `myAllocations: Record<participantId, number>` **only** for the authenticated signed-in member making the request.
  - Giving or taking back stars bumps `trips.version` **without** writing an `activity` row, preventing timestamp/actor correlation in `/t/:tripId/activity`.
- **Who can view vs. rate:**
  - Every group viewer (`member`, `guest`, `viewer`) sees the Leaderboard Widget and the full Rating Page (`/t/:tripId/ratings`) when ratings are enabled.
  - **Only active signed-in members** (`view.me.kind === 'member' && !view.me.participantPending`) can give or reclaim stars. Guests see a prompt to sign in to rate.
- **Star budget, anti-abuse cap & no self-rating:**
  - Total budget per member: $\text{MaxStars} = \text{RATING\_STAR\_MULTIPLIER} \times N$, where `RATING_STAR_MULTIPLIER = 2` and $N$ is the count of `active` participants in the group.
  - Per-recipient cap: `RATING_MAX_STARS_PER_TARGET = 5` stars maximum from one member to any single teammate.
  - **No self-rating:** A member cannot give stars to their own `participantId`. Their own row displays a neutral `You` pill and no `−`/`+` controls.
  - Members can **reclaim (`−`)** stars they previously gave to any player at any time.
- **Roster shrinking (`left` or deleted participants):**
  - When a participant leaves or is removed (`takeOutOfTrip`), any `player_ratings` rows where they are the rater or target are deleted, immediately refunding stars to members who rated them and removing departed players from the podium.
  - If $N$ shrinks and a member's existing allocations to remaining active players exceed the new `2 × N` budget, their existing allocations are **soft-frozen** (never auto-deleted): `+` is disabled across all rows until they reclaim enough stars (`−`) to drop below the new budget.
- **Option B Radial Podium + 3-Stage Scroll/Collapse Transition:**
  - **Podium layout:** `#1` in the center with a Crown icon and largest circular avatar (`68px`), `#2` on the left and `#3` on the right with slightly smaller circular avatars (`48px`), player names and bold tabular star counts underneath.
  - **3-Stage Widget behavior on Group Page (`MemberTrip`, `GuestTrip`, `ViewOnlyTrip`):**
    1. **Stage 1 (Full Podium — at top of scroll, `scrollY <= 40px`):** Shows the radial Top 3 podium and motivational club subtitle.
    2. **Stage 2 (Collapsed Bar — mid-scroll `40px < scrollY <= 200px` or manual collapse toggle):** Smoothly transitions (`200ms var(--ease-out)`) into a compact `48px` summary pill (`🏆 #1 Name 18★ · #2 Name 14★ · #3 Name 11★ ›`).
    3. **Stage 3 (Hidden — deep scroll `scrollY > 200px` into Expenses/Payments or dismissed):** Smoothly slides up and hides completely (`max-height: 0; opacity: 0; pointer-events: none`) so it does not stay on screen while reading transactions; scrolling back to the top restores it.
- **Progressive reveal & search on `/t/:tripId/ratings`:**
  - All constants live in `apps/web/src/config.ts` (and `@fsl/core`): `RATING_STAR_MULTIPLIER = 2`, `RATING_MAX_STARS_PER_TARGET = 5`, `RATING_SEARCH_THRESHOLD = 12`, `RATING_INITIAL_VISIBLE = 10`.
  - Shows a non-overlapping sticky search bar (`16px` `--text-input`) when active players `> 12`.
  - Shows the first `10` ranked players initially with a `"Show all {count} players"` button; typing a search query filters across all active players immediately.

---

## 2. Goals, Non-Goals & Constraints

**Goals**
- Anonymous peer star allocation (`+1` / `−1`) with strict budget (`2 × N`) and per-target cap (`5 ★`).
- Admin toggle in `Settings.tsx` for sport groups.
- Radial Top 3 Podium widget with 3-stage scroll transition (Full → Collapsed → Hidden) and Cold-Start empty state (`0 ★`).
- Dedicated Rating screen (`/t/:tripId/ratings`) as a full page on phones (`< 1024px`) and right-hand `DetailsPanel` on wide screens (`>= 1024px`).

**Non-Goals**
- Exposing who rated whom to admins or anyone else.
- Rating history logs or per-session ratings (ratings are a live standing pool per sport group).
- Ratings in non-sport (`preset === 'trip'`) groups.

**Global Constraints**
- Zero new npm dependencies across `@fsl/core`, `@fsl/api`, and `@fsl/web`.
- Design tokens only (`apps/web/src/styles/tokens.css`); no raw hex values in component CSS; inline Lucide SVGs in `icons.tsx`.
- `tabular-nums` on all star counts, ranks, and budgets; touch targets `>= 44×44px`; search input `16px` (`var(--text-input)`).
- No horizontal overflow (`scrollWidth <= innerWidth`) at `375px`, `768px`, and `1280px`.
- i18n parity between `apps/web/src/i18n/en.ts` and `vi.ts` (every new Vietnamese string ending with `// REVIEW`).

---

## 3. Data Model (`0006_player_ratings.sql` & `schema.ts`)

### 3.1 `trips` column
```sql
ALTER TABLE `trips` ADD COLUMN `ratings_enabled` integer DEFAULT 0 NOT NULL;
```

### 3.2 `player_ratings` table
```sql
CREATE TABLE `player_ratings` (
  `trip_id` text NOT NULL,
  `rater_participant_id` text NOT NULL,
  `target_participant_id` text NOT NULL,
  `stars` integer NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY(`trip_id`, `rater_participant_id`, `target_participant_id`)
);
CREATE INDEX `player_ratings_trip_id_idx` ON `player_ratings` (`trip_id`);
```
- When a member increments a target's stars from `0` to `1`, a row is inserted (`stars = 1`).
- Further `+1` / `−1` updates `stars` (`1 .. 5`).
- When `stars` is decremented from `1` to `0`, the row is deleted.

---

## 4. Core (`@fsl/core`)

### 4.1 New `packages/core/src/ratings.ts`
```ts
export const RATING_STAR_MULTIPLIER = 2;
export const RATING_MAX_STARS_PER_TARGET = 5;
export const RATING_SEARCH_THRESHOLD = 12;
export const RATING_INITIAL_VISIBLE = 10;

export interface RankedPlayer {
  id: string;
  name: string;
  avatarUrl: string | null;
  gender: 'M' | 'F' | null;
  isMember: boolean;
  stars: number;
  rank: number;
}

/** Total star budget for each signed-in member in a group with `activeCount` active participants. */
export function maxStarsForGroup(activeCount: number): number;

/** Ranks active participants by total stars descending, tie-broken by their order in `people`. */
export function rankPlayers(
  people: { id: string; name: string; status: string; avatarUrl?: string | null; gender?: 'M' | 'F' | null; isMember: boolean }[],
  totalStars: Record<string, number>,
): RankedPlayer[];

/** Computes the caller's spent stars, remaining budget, and whether they are over budget after a roster shrink. */
export function ratingBudget(
  activeCount: number,
  myAllocations: Record<string, number>,
): { maxStars: number; spentStars: number; remainingStars: number; overBudgetBy: number };
```

### 4.2 `permissions.ts`
- `Action` gains `'manage_ratings' | 'rate_player'`.
- `manage_ratings`: `isMember && isAdmin` (same as `manage_fund` and `set_fewest`).
- `rate_player`: `isMember && !actor.participantPending`.

### 4.3 `api-types.ts`
- `ApiErrorCode` gains `'RATING_LIMIT'`.
- `ActivityAction` gains `'ratings_changed'`.
- `RatingsView`:
  ```ts
  export interface RatingsView {
    enabled: boolean;
    /** Total stars received per active participantId. */
    totalStars: Record<string, number>;
    /** Max stars each signed-in member can allocate (RATING_STAR_MULTIPLIER * activeCount). */
    maxStars: number;
    /** Caller's own allocations (targetParticipantId -> stars). Empty object for guests/viewers. */
    myAllocations: Record<string, number>;
  }
  ```
- `TripView` gains `ratings?: RatingsView | null` (`null` for non-sport groups).

---

## 5. API (`@fsl/api`)

### 5.1 Toggling Ratings (`PATCH /api/trips/:id` in `apps/api/src/trips/routes.ts`)
- Accepts `{ fewestTransfers?: boolean; ratingsEnabled?: boolean }` (at least one boolean required; `422 VALIDATION` otherwise).
- When `ratingsEnabled` is provided:
  - Must be a sport group (`actor.trip.preset === 'sport'`, else `403 FORBIDDEN`).
  - Checks `ensure(actor, 'manage_ratings')`.
  - Updates `trips.ratings_enabled` (`1` or `0`) and commits via `commitTripWrite` with action `'ratings_changed'` and `details: { ratingsEnabled }`.

### 5.2 Allocating & Reclaiming Stars (`POST /api/trips/:id/ratings` in `apps/api/src/ratings/routes.ts`)
- Mounted in `app.ts`.
- Guards:
  1. `resolveActor(c, tripId)`
  2. `assertWritable(actor.trip)` (`409 TRIP_ARCHIVED` if archived)
  3. `actor.trip.preset === 'sport' && actor.trip.ratingsEnabled === 1` (`403 FORBIDDEN` otherwise)
  4. `ensure(actor, 'rate_player')` (`403 FORBIDDEN` for guests/viewers/pending)
- Input validation (`422 VALIDATION`):
  - `{ targetParticipantId: string, delta: 1 | -1 }`
  - `targetParticipantId !== actor.participantId` (`422 VALIDATION` "You cannot rate yourself.")
  - Target must be an `'active'` participant in this trip (`422 VALIDATION` "Invalid player.").
- Budget & cap check (`409 RATING_LIMIT`):
  - Count active participants $N \implies \text{maxStars} = 2 \times N$.
  - Load caller's current rows in `player_ratings` for active targets $\implies \text{spentStars}, \text{currentTargetStars}$.
  - If `delta === 1`:
    - If `spentStars + 1 > maxStars` $\implies$ `409 RATING_LIMIT` ("No stars left in your budget.").
    - If `currentTargetStars + 1 > RATING_MAX_STARS_PER_TARGET` $\implies$ `409 RATING_LIMIT` ("Maximum 5 stars per player.").
  - If `delta === -1`:
    - If `currentTargetStars <= 0` $\implies$ `409 RATING_LIMIT` ("No stars to take back.").
- Atomic D1 batch (**no `activity` insert**):
  - Upsert or delete the `(tripId, actor.participantId, targetParticipantId)` row in `player_ratings`.
  - Increment `trips.version = trips.version + 1` so `trip_views` rebuilds on next read.
  - Return `200 { stars: nextTargetStars, spentStars: nextSpentStars, maxStars }`.

### 5.3 Snapshot & View (`snapshot.ts`, `view.ts`, `remove.ts`)
- `buildSnapshot`:
  - For `trip.preset === 'sport'`, queries `player_ratings` for `trip.id`, filters to rows where both `raterParticipantId` and `targetParticipantId` are in the `active` participant set, sums `totalStars` per active participant, and sets `snapshot.ratings = { enabled: trip.ratingsEnabled === 1, totalStars, maxStars: maxStarsForGroup(activeIds.size), myAllocations: {} }`.
  - For `trip.preset !== 'sport'`, `snapshot.ratings = null`.
  - `getSnapshot` checks `'ratings' in cached` so snapshots cached before this deploy rebuild automatically.
- `toTripView`:
  - If `snapshot.ratings` is non-null and `actor.kind === 'member' && actor.participantId !== null`, queries `player_ratings` where `tripId = actor.trip.id AND raterParticipantId = actor.participantId`, filters to active target IDs, and populates `view.ratings = { ...snapshot.ratings, myAllocations }`.
- `takeOutOfTrip` (`apps/api/src/participants/remove.ts`):
  - Adds `db.delete(playerRatings).where(and(eq(playerRatings.tripId, tripId), or(eq(playerRatings.raterParticipantId, participantId), eq(playerRatings.targetParticipantId, participantId))))` to both the `'deleted'` and `'left'` query batches.

---

## 6. Web (`@fsl/web`)

### 6.1 Constants & Icons
- `apps/web/src/config.ts` exports `RATING_STAR_MULTIPLIER = 2`, `RATING_MAX_STARS_PER_TARGET = 5`, `RATING_SEARCH_THRESHOLD = 12`, `RATING_INITIAL_VISIBLE = 10`.
- `apps/web/src/components/icons.tsx` gains `'star'` and `'crown'` Lucide SVG shapes.

### 6.2 Settings Toggle (`RatingsSwitch.tsx` in `Settings.tsx`)
- Rendered right below `FewestSwitch` when `view.trip.preset === 'sport' && !view.trip.archived && can(actorOf(view), 'manage_ratings')`.
- Uses the same accessible `role="switch"` pattern and CSS tokens as `FewestSwitch`, calling `PATCH /api/trips/:id` with `{ ratingsEnabled: !on }`.

### 6.3 Leaderboard Widget & 3-Stage Transition (`LeaderboardWidget.tsx`)
- Rendered at the top of `MemberTrip`, `GuestTrip`, and `ViewOnlyTrip` (above `BalanceCard` on phones; top of left column on `>= 1024px`) when `view.trip.preset === 'sport' && view.ratings?.enabled === true`.
- **Cold-start state (`totalGroupStars === 0`):**
  - Displays trophy icon, title (`"Player ratings"`), cold-start prompt (`"No ratings yet — be the first to rate your teammates anonymously!"`), and a primary CTA button (`"★ Tap here to rate teammates"`) linking to `/t/:tripId/ratings`.
- **Active state (`totalGroupStars > 0`):**
  - **Radial Podium (`PodiumTop3`):**
    - Center slot (`#1`): Crown SVG (`--color-warning`), largest `68px` circular avatar with `--color-warning-border` ring, bold player name, and tabular star count (`{stars} ★`).
    - Left slot (`#2`) & Right slot (`#3`): Rank number (`2`, `3`) above `48px` circular avatars, player names, and tabular star counts. (If only 1 or 2 players have `> 0` stars, remaining podium slots take the next active players in rank order or render placeholders cleanly.)
  - **3-Stage Scroll & Collapse Transition (`200ms var(--ease-out)`):**
    - **Stage 1 (`full`):** Shown at the top of the page (`window.scrollY <= 40` and not manually collapsed). Clicking the podium or `"Rate ›"` opens `/t/:tripId/ratings`; a `44×44px` chevron button lets the user collapse it manually.
    - **Stage 2 (`collapsed`):** Triggered when `40 < window.scrollY <= 200` (or manually collapsed). Smoothly transitions `max-height`, `padding`, and `opacity` into a single `48px` bar showing `🏆 #1 {name} {stars}★ · #2 {name} · #3 {name}` and a button to expand or open `/t/:tripId/ratings`.
    - **Stage 3 (`hidden`):** Triggered when scrolling deep into the transaction feed (`window.scrollY > 200`) or when dismissed for the current scroll pass. Smoothly transitions to `max-height: 0; opacity: 0; pointer-events: none` so it does not occupy screen space permanently. Scrolling back near the top (`window.scrollY <= 20`) restores Stage 1.

### 6.4 Dedicated Rating Page & Right Panel (`RatingsScreen.tsx`, `TripRoute.tsx`, `DetailsPanel.tsx`)
- Route `/t/:tripId/ratings` in `App.tsx` renders `TripRoute`.
- `Selection` in `TripRoute.tsx` gains `| { kind: 'ratings' }`.
  - Below `1024px`: renders `<RatingsScreen view={view} />` as a full `<Screen>` page (`useListScroll('ratings')`).
  - From `1024px`: opens inside the right-hand `<DetailsPanel view={view} selection={selection} />`.
  - If `view.ratings?.enabled !== true`, `/t/:tripId/ratings` redirects cleanly to `/t/:tripId`.
- Inside `RatingsView`:
  1. **Radial Top 3 Podium** + motivational quote (`"Play hard, rate fair — every star counts"`).
  2. **Star Budget / Role Banner:**
     - **Member (`can(actor, 'rate_player')`):**
       - Normal: `"Your star budget"` · `"{remaining} of {max} ★ left"` + scarcity reminder (`"Stars are limited (max 5★ per player) — spend them wisely. Anonymous; you can take stars back anytime."`).
       - Over-budget soft-freeze (`overBudgetBy > 0`): warning banner explaining that the group roster shrank and asking them to reclaim stars before giving new ones.
     - **Guest (`view.me.kind === 'guest'`):** Card prompting `"Sign in to rate teammates"` with a `"Sign in with Google"` link (`/api/auth/google/start?returnTo=...`).
     - **Viewer (`view.me.kind === 'viewer'`):** Read-only subtitle.
  3. **Sticky Search Input:**
     - Shown when `activePeople.length > RATING_SEARCH_THRESHOLD` (`12`).
     - `16px` (`--text-input`), sticky at the top of the player list container with `background: var(--color-surface)` and bottom border so it never overlaps player rows.
  4. **Ranked Player List & Progressive Reveal:**
     - Sorted by `rankPlayers(view.people, view.ratings.totalStars)`.
     - Shows first `RATING_INITIAL_VISIBLE` (`10`) players by default when search is empty, with a `"Show all {count} players"` button (`44px` min-height) at the bottom.
     - When a search query is typed, filters across all active players immediately (matching normalized name).
     - Each row displays:
       - Rank (`1`, `2`, `3`, ... in `tabular-nums`), `Avatar`, Name (plus `You` pill for `p.id === view.me.participantId`), and total stars (`{stars} ★`).
       - For members on other players' rows: `−` button (`44×44px`, disabled when `myStars === 0` or busy), `{myStars}★` indicator, and `+` button (`44×44px`, disabled when `remainingStars <= 0`, `myStars >= RATING_MAX_STARS_PER_TARGET`, `archived`, or busy).

---

## 7. Copy (`en.ts` & `vi.ts`)

| Key | English | Tiếng Việt (`// REVIEW`) |
|---|---|---|
| `ratings.title` | Player ratings | Đánh giá người chơi |
| `ratings.leaderboard` | Leaderboard | Bảng xếp hạng |
| `ratings.quote` | Play hard, rate fair — every star counts | Đánh hết mình, chấm công tâm — mỗi sao đều quý |
| `ratings.rateAction` | Rate | Chấm sao |
| `ratings.coldTitle` | No ratings yet | Chưa có đánh giá nào |
| `ratings.coldBody` | Be the first to rate your teammates anonymously and build the club leaderboard. | Hãy là người đầu tiên chấm sao ẩn danh cho đồng đội để lập bảng xếp hạng CLB. |
| `ratings.coldCta` | Tap here to rate teammates | Nhấn vào đây để chấm sao |
| `ratings.budgetTitle` | Your star budget | Quỹ sao của bạn |
| `ratings.budgetLeft` | {remaining} of {max} ★ left | Còn {remaining}/{max} ★ |
| `ratings.budgetHint` | Stars are limited (max {maxPerPlayer}★ per player) — spend them wisely. Anonymous; you can take stars back anytime. | Số sao có hạn (tối đa {maxPerPlayer}★ mỗi người) — hãy dùng thật chuẩn. Hoàn toàn ẩn danh; có thể thu hồi sao bất cứ lúc nào. |
| `ratings.overBudgetTitle` | Over budget after roster change | Vượt quỹ sao do giảm thành viên |
| `ratings.overBudgetHint` | You allocated {spent} ★ (new limit: {max} ★). Take back at least {over} ★ before giving new ones. | Bạn đã phát {spent} ★ (giới hạn mới: {max} ★). Hãy thu hồi ít nhất {over} ★ trước khi tặng thêm. |
| `ratings.totalStars` | {count} ★ total | Tổng {count} ★ |
| `ratings.yours` | Yours: {count}/{max} ★ | Bạn tặng: {count}/{max} ★ |
| `ratings.youBadge` | You | Bạn |
| `ratings.giveStar` | Give a star to {name} | Tặng 1 sao cho {name} |
| `ratings.takeStar` | Take back a star from {name} | Thu hồi 1 sao từ {name} |
| `ratings.searchPlaceholder` | Search {count} players... | Tìm trong {count} người chơi... |
| `ratings.noSearchMatch` | No players match "{query}". | Không tìm thấy người chơi "{query}". |
| `ratings.showAll` | Show all {count} players | Hiện tất cả {count} người chơi |
| `ratings.guestTitle` | Sign in to rate teammates | Đăng nhập để chấm sao |
| `ratings.guestBody` | Only signed-in members get a star budget to rate players anonymously. | Chỉ thành viên đã đăng nhập mới có quỹ sao để đánh giá ẩn danh. |
| `ratings.switchTitle` | Player ratings | Đánh giá người chơi |
| `ratings.switchExplain` | Let signed-in members anonymously give stars to rate players and show the club leaderboard. | Cho phép thành viên ẩn danh tặng sao đánh giá kỹ năng và hiện bảng xếp hạng CLB. |
| `ratings.collapse` | Collapse leaderboard | Thu gọn bảng xếp hạng |
| `ratings.expand` | Expand leaderboard | Mở rộng bảng xếp hạng |
| `error.ratingLimit` | You've reached the star limit. Reclaim a star first and try again. | Bạn đã chạm giới hạn sao. Hãy thu hồi sao trước rồi thử lại. |
| `activity.ratingsChanged` | {actor} turned player ratings {state} | {actor} đã {state} đánh giá người chơi |
| `activity.action.ratings_changed` | Player ratings | Đánh giá người chơi |

---

## 8. Testing

- **Core (`packages/core/test/ratings.test.ts`):** `maxStarsForGroup`, `rankPlayers` (sorting, deterministic tie-breaking, filtering out `left` and `pending`), `ratingBudget` (normal and over-budget deficit), `can()` for `manage_ratings` and `rate_player`.
- **API (`apps/api/test/ratings.test.ts`):**
  - Admin enables/disables `ratingsEnabled` via `PATCH /api/trips/:id` (403 for non-admins and non-sport groups).
  - Member gives and reclaims stars (`POST /api/trips/:id/ratings`): updates aggregate `totalStars` and caller's `myAllocations`.
  - Strict anonymity check: Member B and Admin A never see Member A's `myAllocations` in `GET /api/trips/:id`; `GET /api/trips/:id/activity` contains zero rows for star allocations.
  - Anti-abuse guards: self-rating rejected (`422`), `> 5` stars to one target rejected (`409 RATING_LIMIT`), `> 2 × N` total stars rejected (`409 RATING_LIMIT`), reclaiming at `0` rejected (`409 RATING_LIMIT`), guest/viewer rejected (`403`).
  - Roster shrinking (`DELETE /people/:pid` and `POST /leave`): stars given to/by removed person are deleted and refunded; over-budget member is soft-frozen on `+` (`409 RATING_LIMIT`) but allowed to reclaim (`−`) until back within budget.
- **Web (`apps/web/src/components/__tests__/LeaderboardWidget.test.tsx`, `apps/web/src/screens/__tests__/RatingsScreen.test.tsx`):**
  - Cold-start CTA when total stars is `0`.
  - Radial Top 3 podium order (`#2` left, `#1` center with crown, `#3` right) and 3-stage transition classes (`full`, `collapsed`, `hidden`).
  - Rating page: budget display, `+`/`−` actions, self-row `You` pill without buttons, `5 ★` per-target cap disabling `+`, soft-freeze over-budget banner, progressive reveal (`10` rows + `"Show all 15 players"`), sticky search filtering when `N > 12`, guest sign-in prompt, and `Settings.tsx` `RatingsSwitch`.
  - `scaffold.test.tsx` i18n parity check passes.
