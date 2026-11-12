# Person History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: execute with the `orchestration` skill, using Orca workers running Claude Code. This replaces Gemini Flash/Argon in this project (owner, 2026-11-11).
> - Each task gets its own child worktree: `orca orchestration worker-start --agent claude --model <id> --effort medium --worktree new-child --setup skip`.
> - Core, DB and complex tasks (1, 2, 3, 6, 9) → `claude-opus-5-5`. Routine tasks (4, 5, 7, 8) → `claude-sonnet-5-5`.
> - Workers may add new tests and run their own task's test file. They never edit existing tests and never use git.
> - The planner diffs each worktree, applies it, runs the suites and commits only when the owner asks.
>
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in member see the transactions behind a balance with one person, from Home (everything) or from a group (that group only). Give the `/r/<id>` request page a clear list of the expenses each row covers. Make `npm run setup` migrate the local D1 without a prompt and seed mock data to test with.

**Architecture:** A pure `pairHistory()` in `@cc/core` turns one trip's cached snapshot into two-way lines, a sum, a trim point and a gap explanation. The API builds a `PersonHistoryView` from the snapshots `loadPersonItems` already loads, with no new per-expense queries, and adds the same lines to `RequestView`. On the web, one `HistoryList` component renders the lines on the person screen in both modes and, compact, on `/r`.

**Tech Stack:** TypeScript 7 (`tsc`), Hono on Cloudflare Workers + D1 (drizzle), React + React Query + react-router, Tailwind v4 / shadcn wrappers, vitest, `node:test` for `scripts/`.

**Spec:** `docs/superpowers/specs/2026-11-11-person-history-design.md`

## Global Constraints

- No new money logic: balances, `suggestions`, "fewest transfers" and rounding stay as they are. History only explains them.
- Waiting (`says_paid`) payments **are counted**. Disabled expenses and payments are shown crossed out and not counted. Pending (unapproved guest) expenses are not counted. Rejected and superseded rows are not shown.
- Fund-paid and planning-mode expenses never appear (reuse `toLedger`'s filter). Incomes are fund-only and never appear.
- D1 budget: history reads only the cached `TripSnapshot`s that `loadPersonItems` loads. No per-expense queries, and no snapshot or cache-version change.
- `/r` is public: lines carry only the two people's shares plus the full expense amount, never other participants' shares.
- Web rules (CLAUDE.md, DESIGN.md):
  - Grouped white `rounded-xl` lists, rows `min-h-11`, money through `Amount` (`tabular-nums`, `1.245.000₫`).
  - Leaf (`success`) / Lychee (`danger`) / Turmeric (`warning`) only for money in, money out and waiting.
  - No raw hex.
  - Copy in `vi.ts` and `en.ts`. Never "simplify debts"; say "to save transfers".
- Keep every existing `fsl-person*` class and `data-testid` on the same element.
- Implementers never edit or delete existing tests. If an existing test breaks, report it to the planner.

## Review Focus

1. **A person with both an own-ledger row and a merged ledger guest.** Both places' lines must show, tagged, and add up to the total. (Test in Task 2.)
2. **A group with fewest transfers where the two-way sum is 0 but the suggested amount isn't.** No trim, the gap line shows, and there are no lines but no crash either. (Test in Task 1.)
3. **An expense the other person paid where only you have a share, and one where a third person paid.** The first is −your share. The second is left out entirely. (Test in Task 1.)
4. **Mode B opened for a guest participant who is linked to a ledger person.** The screen resolves to the canonical key and its name. (Test in Task 2.)
5. **`/r` opened by an anonymous browser.** The lines contain no third person's id or share. (Test in Task 3.)

---

### Task 1: Core `pairHistory`

**Files:**
- Create: `libs/shared/core/src/history.ts`
- Modify: `libs/shared/core/src/index.ts` (add `export * from './history';`)
- Test: `libs/shared/core/test/history.test.ts`

**Interfaces:**
- Consumes: `Transfer` (`./transfers`), `ExpenseView`, `PaymentView` (`./api-types`).
- Produces:

```ts
export type HistoryLineState = 'counted' | 'waiting' | 'disabled' | 'unapproved';
export interface HistoryLine {
  id: string;                 // transaction id
  kind: 'expense' | 'payment';
  tripId: string;
  title: string | null;       // expense description; null for a payment
  date: string;               // YYYY-MM-DD: spentOn (expense) or createdAt's date (payment)
  createdAt: string;          // sort key
  amount: number;             // full expense amount, or the payment amount (amountConfirmed ?? amountClaimed)
  paidBy: 'owner' | 'other';  // expense payer, or the payment's sender
  ownerShare: number;         // 0 for payments
  otherShare: number;         // 0 for payments
  effect: number;             // signed, owner's view: > 0 adds to what `other` owes `owner`
  state: HistoryLineState;
}
export type HistoryGap =
  | { kind: 'rounding' }
  | { kind: 'reroute'; difference: number; viaPid: string | null }; // difference = suggested − twoWay
export interface PairHistoryInput {
  tripId: string;
  ownerPid: string;
  otherPid: string;
  expenses: ExpenseView[];     // snapshot.expenses, already toLedger-filterable
  payments: PaymentView[];
  suggestions: Transfer[];     // snapshot.suggestions
  roundTransfers: boolean;
}
export interface PairHistory {
  lines: HistoryLine[];        // newest first, after trimming
  twoWay: number;              // sum of effects of counted lines (whole history, not just kept lines)
  suggested: number;           // pairItems-equivalent amount for the pair from suggestions
  gap: HistoryGap | null;
  trimmed: boolean;            // true when older lines were cut
}
export function pairHistory(input: PairHistoryInput): PairHistory;
```

Rules the implementation must follow (from the spec):
- **Which expenses are lines:** only those whose payer is owner or other, where the *non-payer* of the two has a share > 0.
  - Effect when the owner paid: `+otherShare`. When the other paid: `−ownerShare`.
  - Skip fund-paid and planning expenses using the same predicates `toLedger` uses (`isFundPaid`, `isPlanningExpense`). If they live in `apps/api`, move them to core first and re-export them from their old place.
- **Which payments are lines:** only those between the two. Other → owner: `−amount`. Owner → other: `+amount`.
- **State:**
  - expense `approved` → counted, `pending` → unapproved, `disabled` → disabled; others are dropped
  - payment `confirmed` → counted, `says_paid` → waiting (counted), `disabled` → disabled; others are dropped
- **Sum:** `twoWay` = the sum of effects over the counted and waiting lines.
- **`suggested`:** `Σ amount(other→owner) − Σ amount(owner→other)` over `suggestions`.
- **Gap:**
  - `null` when `suggested === twoWay`.
  - Otherwise `rounding` when `roundTransfers && |suggested − twoWay| < 1000`.
  - Otherwise `reroute`. `viaPid` is the third pid when exactly one suggestion links owner or other with a third party *and* its amount equals `|difference|`, else `null`.
- **Trim:**
  - Sort the lines by `createdAt` ascending and walk the counted and waiting ones with a running sum.
  - The cut is just after the last line where the running sum is 0. Keep every line (any state) after the cut.
  - **No trim when `gap?.kind === 'reroute'`.**
  - Return the kept lines newest first.

- [ ] **Step 1: Write the failing tests** in `libs/shared/core/test/history.test.ts`, building `ExpenseView`/`PaymentView` fixtures with small helpers. Owner `o`, other `a`, third `b`:
  - `owner paid lunch 240.000 split o/a 120/120 → one line effect +120000, twoWay 120000`
  - `other paid, only owner has a share 50.000 → effect −50000`
  - `third person paid with both sharing → no line`
  - `says_paid payment a→o 100.000 → state waiting, effect −100000, counted in twoWay`
  - `disabled expense → state disabled, not in twoWay`; `pending expense → state unapproved, not in twoWay`; `rejected payment → no line`
  - `trim: +100k, a pays 100k (confirmed), +30k → lines = [the +30k only], trimmed true`
  - `settled now (sum 0 at the end) → lines [] , trimmed true`
  - `pairwise, suggestions match → gap null`
  - `round_transfers: twoWay 120400, suggestion 120000 → gap {kind:'rounding'}`
  - `fewest transfers: twoWay 300000, suggestions a→o 210000 and a→b 90000 → gap {kind:'reroute', difference:-90000, viaPid:'b'}, no trim`
  - `reroute with twoWay 0 and suggested 50000 → lines kept (no trim), gap reroute, viaPid null when no single matching transfer`
  - `lines are newest first`
- [ ] **Step 2:** Run `npx nx test @cc/core -- history`. Expected: FAIL, `pairHistory` is not exported.
- [ ] **Step 3:** Implement `pairHistory` in `libs/shared/core/src/history.ts` and export it from `index.ts`.
- [ ] **Step 4:** Run `npx nx test @cc/core`. Expected: all PASS. Run `npm run typecheck`. Expected: clean.
- [ ] **Step 5:** Commit `feat(core): two-way history lines with trim and gap (#98)`.

### Task 2: API `GET /api/me/people/:key/history` and `GET /api/me/trips/:tripId/people/:pid/history`

**Files:**
- Modify: `apps/api/src/me/balances.ts`: `loadPersonItems` also returns `snapshots: Map<string, TripSnapshot>` and `trips: Map<string, TripRow>` (the ones it already loads). `PersonItems` gets those two fields.
- Create: `apps/api/src/me/history.ts` (builder + routes, mounted next to `balanceRoutes()` wherever that is mounted)
- Modify: `libs/shared/core/src/api-types.ts` (add the view types below)
- Test: `apps/api/test/person-history.test.ts` (seed with `apps/api/test/helpers.ts` like `people-summary.test.ts` does)

**Interfaces:**
- Consumes: `pairHistory`, `PairHistory`, `HistoryLine` (Task 1); `loadPersonItems`, `loadPeopleIndex` (`balances.ts`).
- Produces (in `api-types.ts`):

```ts
export interface HistoryPlace {
  tripId: string;
  tripName: string;
  kind: 'group' | 'direct';
  /** 'own' = my ledger row for them; 'merged' = a ledger guest merged into them; 'theirs' = their ledger with me; 'group' otherwise. */
  source: 'own' | 'merged' | 'theirs' | 'group';
  amount: number;                 // the PersonItem amount (owner's view)
  history: PairHistory | null;    // null for group places in mode 'all'
}
export interface PersonHistoryView {
  key: PersonKey;                 // canonical
  name: string;
  mode: 'all' | 'group';
  total: number;                  // mode 'all': person total; mode 'group': that place's amount
  places: HistoryPlace[];         // mode 'group': exactly one
}
```

- `GET /api/me/people/:key/history` → mode `'all'`. Every item becomes a place. `direct` places get `history`, `group` places get `history: null`.
- `GET /api/me/trips/:tripId/people/:pid/history` → mode `'group'`.
  - Resolve the key with `loadPeopleIndex(db, userId).resolve(pid, trip)`.
  - 404 `NOT_FOUND` when the caller isn't an active participant of the trip, or the pid doesn't resolve.
  - Load `loadPersonItems(key)` and keep the place for `tripId`. When there's no open item there, still return the place with `amount: 0` and the `pairHistory` result.
- Both routes use `requireUser` and let `loadPersonItems`'s 409 `TRY_AGAIN` through (the web hook retries with `withTryAgain`).
- `source`:
  - `group` for non-direct places
  - `theirs` when `trip.organiserUserId !== userId`
  - `own` when `personPid === ledger.personPid`
  - `merged` otherwise

- [ ] **Step 1: Write the failing tests:**
  - `all mode: ledger with two quick expenses and a group → direct place has history lines, group place history null, total = sum of amounts`
  - `all mode: merged ledger guest → two direct places, sources 'own' and 'merged', lines from both`
  - `group mode: fewest-transfers group → one place, history.gap.kind 'reroute'`
  - `group mode: guest pid linked to a ledger person → key is the ledger person's canonical key and name`
  - `group mode: caller not in trip → 404`
  - `unauthenticated → 401`
- [ ] **Step 2:** Run `npx nx test @cc/api -- person-history`. Expected: FAIL (404 route).
- [ ] **Step 3:** Implement the `loadPersonItems` additions, `history.ts` and the types.
- [ ] **Step 4:** Run `npx nx test @cc/api`. Expected: all PASS, including the existing `settle*`, `people-summary*` and `request-link` suites. Then run `npm run typecheck`.
- [ ] **Step 5:** Commit `feat(api): person history endpoints (#98)`.

### Task 3: Lines on the public request view

**Files:**
- Modify: `apps/api/src/requests/routes.ts` (`requestItems`)
- Modify: `libs/shared/core/src/api-types.ts`: `RequestView.items` becomes `RequestItem[]`, with `export interface RequestItem extends PersonItem { lines: HistoryLine[]; gap: HistoryGap | null }`
- Test: `apps/api/test/request-history.test.ts`

**Interfaces:**
- Consumes: `PersonItems.snapshots` (Task 2), `pairHistory` (Task 1).
- Produces: `RequestItem` (used by Task 8).

The lines are from the **owner's** view (as in `pairHistory`). The page flips the wording.

- [ ] **Step 1: Write the failing tests:**
  - `GET /api/r/:token → each item has lines; a quick-expense item lists its open expenses newest first`
  - `group item from a fewest-transfers group carries gap.kind 'reroute'`
  - `anonymous GET: JSON contains no participant id other than owner/person pids and no third person's share` (assert by scanning `JSON.stringify(body)` for the third pid)
- [ ] **Step 2:** Run `npx nx test @cc/api -- request-history`. Expected: FAIL.
- [ ] **Step 3:** In `requestItems`, map each `person.items` entry through `pairHistory` using `person.snapshots.get(tripId)`.
- [ ] **Step 4:** Run `npx nx test @cc/api`. Expected: PASS (the existing `request-link.test.ts` included). Then run `npm run typecheck`.
- [ ] **Step 5:** Commit `feat(api): request page lists the expenses behind each row (#98)`.

### Task 4: Data hooks and copy

**Files:**
- Modify: `libs/web/data-access/src/people.ts`
- Modify: `libs/web/i18n/src/en.ts`, `libs/web/i18n/src/vi.ts`
- Test: `libs/web/data-access/src/__tests__/person-history.test.ts` (if the library has no `__tests__`, follow its existing test location)

**Interfaces:**
- Produces:
  - `usePersonHistory(key: PersonKey): UseQueryResult<PersonHistoryView, ApiClientError>`, with query key `['me','people',key,'history']`
  - `useGroupPersonHistory(tripId: string, pid: string): UseQueryResult<PersonHistoryView, ApiClientError>`, with query key `['me','trips',tripId,'people',pid,'history']`
  - Both fetch through `withTryAgain(() => apiFetch(...))`, with `staleTime: 0`.
  - `settle`, `confirmSettlement` and `rejectSettlement` also invalidate `['me','people']` and `['me','trips']` (prefix), so history refreshes after money moves.
- Copy keys (`en` / `vi`, with `// REVIEW` on the vi lines):

| key | en | vi |
|---|---|---|
| `history.title` | `What makes this up` | `Gồm những khoản nào` |
| `history.betweenYou` | `Between you two` | `Giữa hai bạn` |
| `history.rerouted` | `To save transfers, the group changed this to {amount}.` | `Để bớt lượt chuyển, nhóm đổi số này thành {amount}.` |
| `history.reroutedVia` | `{amount} moved to {name} to save transfers.` | `{amount} được chuyển sang {name} để bớt lượt chuyển.` |
| `history.rounded` | `Rounded to 1.000₫` | `Làm tròn đến 1.000₫` |
| `history.paidBy` | `{name} paid {amount}` | `{name} trả {amount}` |
| `history.shares` | `You {mine} · {name} {theirs}` | `Bạn {mine} · {name} {theirs}` |
| `history.youPaid` | `You paid {name}` | `Bạn đã trả {name}` |
| `history.theyPaid` | `{name} paid you` | `{name} đã trả bạn` |
| `history.waiting` | `Waiting` | `Đang chờ` |
| `history.notApproved` | `Waiting for approval` | `Chờ duyệt` |
| `history.inTheirLedger` | `In {name}'s expenses` | `Trong sổ của {name}` |
| `history.seeAll` | `See everything with {name}` | `Xem tất cả với {name}` |
| `history.seeHistory` | `See history with {name}` | `Xem lịch sử với {name}` |
| `history.covers` | `{names} and {count} more` | `{names} và {count} khoản khác` |

- [ ] **Step 1:** Write a failing test: the hooks call `/api/me/people/u%3Aabc/history` and `/api/me/trips/t1/people/p1/history` (mock `apiFetch` as the library's other tests do).
- [ ] **Step 2:** Run `npx nx test @cc/web-data-access`. Expected: FAIL.
- [ ] **Step 3:** Implement the hooks, the invalidations and the copy.
- [ ] **Step 4:** Run `npx nx test @cc/web-data-access @cc/web-i18n`. Expected: PASS (the i18n parity test, if there is one, sees the keys in both files).
- [ ] **Step 5:** Commit `feat(web): history hooks and copy (#98)`.

### Task 5: `HistoryList` component

**Files:**
- Create: `libs/web/screens/src/components/HistoryList.tsx`
- Test: `libs/web/screens/src/components/__tests__/history-list.test.tsx`

**Interfaces:**
- Consumes: `HistoryLine`, `HistoryGap`, `PairHistory` (core), `Amount`, `Pill` (`@cc/web-ui`), the copy from Task 4.
- Produces:

```ts
export function HistoryList(props: {
  lines: HistoryLine[];
  otherName: string;
  /** Shown above the list when there is a gap: twoWay, suggested, gap. */
  summary?: { twoWay: number; suggested: number; gap: HistoryGap | null; viaName?: string | null };
  /** 'viewer-owes' flips wording/colour for /r (the viewer is `other`). Default 'owner'. */
  perspective?: 'owner' | 'other';
  compact?: boolean;   // /r: title, date, effect only
  /** Tag lines from these tripIds with history.inTheirLedger. */
  theirsTripIds?: Set<string>;
}): JSX.Element
```

Look:
- One white `rounded-xl` list with `divide-y divide-border`, root class `fsl-history`, each row `fsl-history__line` with `data-testid="history-line-<id>"`.
- Row layout: title (14px semibold) + meta line (`date · paidBy · shares`, `text-muted-foreground`) on the left. The signed effect via `Amount` on the right: `success` when it is > 0 from the given perspective, `danger` when < 0.
- Waiting gets a `Pill` tone warning (`history.waiting`). Unapproved gets a warning pill (`history.notApproved`).
- Disabled rows get `line-through text-muted-foreground` with a neutral amount.
- The summary block (`fsl-history__gap`) renders `history.betweenYou` + `Amount(twoWay)`, then `rerouted` / `reroutedVia` / `rounded`. It renders only when `gap` isn't null.

- [ ] **Step 1: Write the failing tests:**
  - `renders lines newest-first with +120.000₫ in text-success and −50.000₫ in text-danger`
  - `waiting line shows the Waiting pill`
  - `disabled line is line-through`
  - `reroute gap shows "Between you two" and "To save transfers, the group changed this to 210.000₫."`
  - `reroute with viaName shows "90.000₫ moved to Minh to save transfers."`
  - `rounding gap shows "Rounded to 1.000₫"`
  - `perspective other flips colour`
  - `compact hides the shares line`
- [ ] **Step 2:** Run `npx nx test @cc/web-screens -- history-list`. Expected: FAIL.
- [ ] **Step 3:** Implement it.
- [ ] **Step 4:** Run `npx nx test @cc/web-screens -- history-list style-guard`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(web): HistoryList (#98)`.

### Task 6: Person screen, both modes

**Files:**
- Modify: `libs/web/screens/src/screens/PersonScreen.tsx`
- Modify: `libs/web/screens/src/App.tsx`: add `<Route path="/people/in/:tripId/:pid" element={<PersonScreen />} />` next to `/people/:key`
- Test: `libs/web/screens/src/screens/__tests__/person-history.test.tsx` (new; leave `person-screen.test.tsx` untouched)

**Interfaces:**
- Consumes: `usePersonHistory`, `useGroupPersonHistory` (Task 4), `HistoryList` (Task 5).

Behaviour:
- **Mode `all`** (`/people/:key`):
  - Unchanged: the header, total, waiting block, linked list and actions.
  - The `fsl-person__items` list keeps one row per **group** place, same markup and `person-item-<tripId>`. Each group row now links to `/people/in/<tripId>/<otherPid>` instead of `/t/<tripId>`.
  - The `direct` places no longer render as rows. Their lines, merged newest first, render under a section label `history.title` via `HistoryList`, inside a wrapper `div data-testid="person-item-<tripId>"` of the first direct place (keeps the old hook).
  - Pass `theirsTripIds` for `source: 'theirs'` places.
- **Mode `group`** (`/people/in/:tripId/:pid`):
  - Title: the person's name, with the group name as a muted line under the name (`fsl-person__group`).
  - The total hero shows `places[0].amount`.
  - `HistoryList` gets `summary` from `places[0].history`. `viaName` is looked up from the trip view when `viaPid` is set (`useTripView` or the cached trip query if available; otherwise `null`).
  - *Planner's call:* hide Edit, Request, Paid in cash and the linked list (they act on every place). Show a ghost `Button href={/people/<key>}` with `history.seeAll`.
  - Back goes to `/t/<tripId>`.
- Loading uses `SkeletonList`, errors use `InlineError` with retry, matching the screen's existing patterns.

- [ ] **Step 1: Write the failing tests** (render with the screen tests' existing query-client and router helpers; mock the hooks' fetch):
  - `all mode: quick-expense lines render under "What makes this up"; group row links to /people/in/<trip>/<pid>`
  - `all mode: a 'theirs' line shows "In An's expenses"`
  - `group mode: shows the group name, the group amount and the gap block; no Request button; "See everything with An" links to /people/<key>`
  - `settled: no history list, settled line shown`
- [ ] **Step 2:** Run `npx nx test @cc/web-screens -- person-history`. Expected: FAIL.
- [ ] **Step 3:** Implement it.
- [ ] **Step 4:** Run `npx nx test @cc/web-screens`. Expected: all PASS, existing `person-screen.test.tsx` included. If an existing assertion conflicts with the spec (e.g. it expects the "Quick expenses" row text), stop and report it to the planner.
- [ ] **Step 5:** Commit `feat(web): person screen shows the history behind the total (#98)`.

### Task 7: Group entry point from "Your transfers"

**Files:**
- Modify: `libs/web/screens/src/components/YourTransfers.tsx` (`TransferDetail`)
- Test: `libs/web/screens/src/components/__tests__/transfer-history-link.test.tsx`

*Planner's call:* tapping a transfer row already opens `TransferDetail`, so the entry is a button inside it. That keeps the current tap behaviour.
- Render a full-width secondary `Button` (`data-testid="transfer-history"`, label `history.seeHistory` with the other person's name) linking to `/people/in/<tripId>/<otherPid>`.
- `otherPid` is `row.fromId` when `row.toId === me`, else `row.toId`.
- Render it only when `view.me.kind === 'member'` and `useMe().data?.user` is set. Guests and viewers see no change.

- [ ] **Step 1: Write the failing tests:**
  - `member signed in: open row shows "See history with Bình" → /people/in/t-1/p-binh`
  - `guest: no transfer-history button`
- [ ] **Step 2:** Run `npx nx test @cc/web-screens -- transfer-history-link`. Expected: FAIL.
- [ ] **Step 3:** Implement it.
- [ ] **Step 4:** Run `npx nx test @cc/web-screens`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(web): open person history from a group transfer (#98)`.

### Task 8: Request page explains each row

**Files:**
- Modify: `libs/web/screens/src/screens/RequestPage.tsx`
- Test: `libs/web/screens/src/screens/__tests__/request-history.test.tsx`

**Interfaces:**
- Consumes: `RequestItem` (Task 3), `HistoryList` with `compact` and `perspective="other"` (Task 5).

Behaviour:
- Each `request-item-<tripId>` row keeps its markup.
- Under it, a muted line lists up to two titles: `history.covers` (`names` = up to two titles joined with ", ", `count` = the rest). With two titles or fewer, just the names. Payments are counted in `count` but not named.
- The line is a button (`data-testid="request-covers-<tripId>"`, `aria-expanded`) that opens the compact `HistoryList` and the gap summary for that item, inline under the row.
- Nothing shows for an item with no lines.

- [ ] **Step 1: Write the failing tests:**
  - `shows "Lunch, Taxi and 3 more" under a row with 5 lines`
  - `tapping it expands the compact list`
  - `gap item shows the rerouted line`
- [ ] **Step 2:** Run `npx nx test @cc/web-screens -- request-history`. Expected: FAIL.
- [ ] **Step 3:** Implement it.
- [ ] **Step 4:** Run `npx nx test @cc/web-screens`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(web): request page shows which expenses each row covers (#98)`.

### Task 9: `npm run setup` migrates without a prompt and seeds mock data

Inspiration (the `Save-to-home-screen-on-iphone-android` worktree's local D1):
- It holds only the owner's real sign-ins: one Google account and two Zalo accounts. Each has its own `direct` ledger (`trips.preset='direct'`, one participant `is_admin=1`).
- It has no transactions.
- So the seed **copies the `users` rows** from the source checkout's local D1 (so a real Google or Zalo sign-in on the tunnel lands on the same account, matched by `google_sub` / `zalo_sub`), then hangs mock people and money off each of those users.
- Sessions and devices are never copied.

**Files:**
- Modify: `scripts/orca-setup.mjs`, `scripts/orca-setup.test.mjs` (**add** tests only)
- Create: `scripts/seed-local.mjs`, `scripts/seed-local.test.mjs`
- Modify: root `package.json`: `"seed:local": "node scripts/seed-local.mjs"`

**Interfaces:**
- `orca-setup.mjs`:
  - `runSetup` runs the migration with `exec(cmd, { env: { ...env, CI: '1' } })`, so wrangler's "Ok to proceed?" defaults to yes.
  - The `exec` option becomes `(cmd, opts?) => void`.
  - It then runs `node scripts/seed-local.mjs --from <sourceDir>` as a new step (`[3/4] Seeding mock data...`, build becomes `[4/4]`).
  - It passes `--from` only when `sourceDir` resolved and differs from `cwd`.
  - A seed failure logs a warning and does not fail setup.
- `seed-local.mjs` exports:
  - `export function localD1File(apiDir: string): string | null`: the non-`metadata` `*.sqlite` under `<apiDir>/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/`.
  - `export function readUsers(sqlitePath: string): UserRow[]`: `node:sqlite` `DatabaseSync` opened read-only; `SELECT * FROM users`.
  - `export function buildSeedSql(owners: UserRow[], now: string): string[]`: pure, idempotent (`INSERT OR IGNORE`, ids `seed-<ownerIdPrefix8>-...`).
  - CLI: `--from <dir>` (copy users from that checkout's local D1), `--reset` (delete `seed-%` rows first), `--dry-run` (print SQL).
  - It writes the SQL to `apps/api/.wrangler/seed-local.sql` and runs `npx wrangler d1 execute fsl --local --file=.wrangler/seed-local.sql` in `apps/api` with `CI=1`.
  - With no users in either DB, it prints "Sign in once on the local app, then run `npm run seed:local`." and exits 0.

**Mock data: one seeded fixture per scenario.** The owner wants to walk through every case by hand. Each row below is seeded for every owner, with ids `seed-<o>-…`.
- `created_at` values are spread over the last 30 days in the order listed, and `spent_on` matches.
- Shares are written as `split_mode 'amounts'` with `input_value = amount`, so the numbers are exact.
- "O" is the owner.
- The **Expect** column is what the screen must show. It goes into the checklist file verbatim.

| # | Scenario | Where | Seeded data | Expect |
|---|---|---|---|---|
| S1 | Trim after a settled stretch | Ledger, person **An** | Lunch 240.000 O paid (O 120k / An 120k) → An paid O 120.000 `confirmed` → Taxi 330.000 O paid (O 165k / An 165k) | Home → An: only Taxi (and S2–S4 lines). Lunch and the payment are hidden. |
| S2 | Waiting payment counts | Ledger, An | An → O 50.000 `says_paid` | Line with a "Waiting" pill, −50.000₫, included in the total |
| S3 | Disabled expense | Ledger, An | Boat 200.000 O paid (An 100k) `disabled` | Crossed out, not counted |
| S4 | Other person paid | Ledger, An | Coffee 90.000 An paid (O 45k / An 45k) | −45.000₫ |
| — | An's ledger total | | | 165k − 50k − 45k = **70.000₫ owes you**. Lines add up to it. |
| S5 | You owe someone | Ledger, **Dũng** | Dinner 400.000 Dũng paid (O 200k / Dũng 200k) | Home → Dũng: **You owe 200.000₫** in Lychee, one −200.000₫ line |
| S6 | Merged ledger guest | Ledger, row **An (cũ)** linked into An (`person_links` kind `merge`) | Snack 60.000 O paid (An (cũ) 60k) | An's screen also lists Snack, and the Merged list shows "An (cũ)". |
| S7 | Their ledger with me | Mock account **Khoa** (fake `google_sub seed-khoa-<o>`) has a `direct` trip with O as participant (`user_id` = O) | Fuel 100.000 Khoa paid (O 100k) | Home → Khoa: −100.000₫ line tagged "In Khoa's expenses" |
| S8 | Long open history | Ledger, **Chi** | 25 small expenses O paid (Chi 10–50k each), no payments | Scrolls cleanly, newest first, nothing trimmed |
| S9 | Group rows + quick expenses together | **Hội An** (below): An's group participant linked to ledger An (`person_links` kind `merge`). Kept out of the fewest-transfers groups so S10 holds. | Lantern tour 100.000 O paid (An 100k) | An's screen shows a "Hội An +100.000₫" row. Tapping it opens group mode. An's overall total is **230.000₫** (70k + 60k S6 + 100k). |
| S10 | Reroute, named | **Đà Lạt (seed)**, `fewest_transfers 1`: O, An, Bình, Minh | Room 300.000 O paid (Bình 300k); Bus 90.000 Minh paid (O 90k) | Group → transfer "Bình pays you 210.000₫" → See history: "Between you two 300.000₫", "90.000₫ moved to Minh to save transfers." |
| S11 | Unapproved guest expense | Đà Lạt, guest **Hà** (`user_id NULL`) | Ice cream 100.000 O paid (Bình 100k) `pending`, created by Hà | In Bình's group history: a "Waiting for approval" line, not counted. S10's numbers are unchanged. The group's approvals list shows it. |
| S12 | Reroute, unnamed | **Phú Quốc (seed)**, fewest on: O, Bình, Minh, Chi | Villa 400.000 O paid (Bình 400k); Lunch 100.000 Minh paid (O 100k); Taxi 100.000 Chi paid (O 100k) | Bình's group history: between you 400.000₫, "To save transfers, the group changed this to 200.000₫." No name. |
| S13 | Reroute with no two-way lines | **Nha Trang (seed)**, fewest on: O, Bình, Minh | Kayak 300.000 O paid (Minh 300k); Bar 300.000 Minh paid (Bình 300k) | Transfer "Bình pays you 300.000₫" → history: no lines, gap line only, no crash |
| S14 | Pairwise group, no gap | **Hội An (seed)**, `fewest_transfers 0`: O, Dũng | Lantern 400.000 Dũng paid (O 200k / Dũng 200k) | Group mode: you owe 200.000₫, lines match, no gap block |
| S15 | Rounding caption | **Cầu lông T5 (seed)**, `round_transfers 1`, fewest off: O, Chi | Court 250.600 O paid (O 125.300 / Chi 125.300) | Total 125.000₫, between you 125.300₫, "Rounded to 1.000₫" |
| S16 | Settled in a group | Hội An, **Giang** | Tea 80.000 O paid (Giang 80k), then Giang → O 80.000 `confirmed` | Open `/people/in/<HộiAn>/<Giang pid>` directly (no transfer row): settled line, no lines |
| S17 | Guest sees no history entry | Đà Lạt | (uses the S10/S11 data) | Open the group's `group_token` link in a private window, pick Hà: no "See history" button |
| S18 | Request page | Ledger An | Set `participants.request_token = 'seed-r-<o>-an'` on ledger An, only if `findRequest` resolves tokens from that column (check `apps/api/src/requests/routes.ts`); otherwise the checklist says "tap Request on An" | `/r/<token>` shows "Lunch…"-free open lines: "Taxi, Coffee and 2 more", which opens into the compact list |

- Every expense gets `transaction_shares` rows for its shares only. Payments have `payer_id` = sender, `to_id` = receiver, and no shares.
- `root_id = id` and `is_latest 1`. `created_by_participant_id` is the payer's participant (Hà for S11).
- No `trip_views` rows: snapshots build cold on first read. Every seeded group gets a `group_token` and `view_token` (`seed-<o>-<slug>-g` / `-v`).
- Mock accounts (Khoa) use `google_sub = 'seed-khoa-<o>'`, which no real sign-in can match.
- `--reset` deletes every row whose id starts with `seed-`. This includes `person_links` rows whose `participant_id` starts with `seed-`, and never touches copied real `users`.
- The script ends by printing the checklist path and, per owner, the S16 URL and the S17 group link.

The S10, S12 and S13 Expect values assume `suggestTransfers` pays the largest debtor to the largest creditor first. The seed test can't run the TypeScript core, so Task 10's walkthrough confirms them. If the real suggestions differ, change the seed amounts and the checklist, never the app.

**Checklist file:** create `docs/manual-testing/person-history.md`. It holds the table above as a tick list (Scenario, how to reach it, Expect), plus a line saying the numbers assume a fresh `npm run seed:local -- --reset`.

- [ ] **Step 1: Write the failing tests** (`node:test`):
  - `buildSeedSql: one owner → contains a direct ledger insert unless owner already has one (pass existing ledger id via owner.ledgerTripId)`
  - `buildSeedSql: every statement is INSERT OR IGNORE and every id starts with "seed-"`
  - `buildSeedSql: Đà Lạt trip has fewest_transfers 1; Cầu lông has round_transfers 1`
  - `buildSeedSql: shares of each expense sum to its amount`
  - `buildSeedSql: seeds every scenario S1–S18` (assert one marker per scenario: trip names, the `says_paid`/`disabled`/`pending` statuses, both `person_links`, Khoa's `direct` trip with the owner as participant, 25 Chi expenses)
  - `buildSeedSql: two owners get disjoint ids`
  - `runSetup: migration exec receives env.CI === '1'`
  - `runSetup: seed step runs with --from <source> after migrations and before build; a throwing seed does not throw runSetup`
- [ ] **Step 2:** Run `node --test scripts/`. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement `seed-local.mjs`, the `orca-setup.mjs` changes and the npm script. `UserRow` carries `ledgerTripId?: string` (filled from the target DB's `trips` where `preset='direct' AND organiser_user_id = id`).
- [ ] **Step 4:** Run `node --test scripts/`. Expected: PASS.
- [ ] **Step 5: Verify for real** in this worktree:
  - Run `npm run setup`. Expected: no "Ok to proceed?" prompt, the seed log lists the copied users.
  - Run `npm run seed:local` twice. Expected: the second run adds 0 rows.
- [ ] **Step 6:** Commit `chore(setup): auto-approve local migrations and seed mock data`.

### Task 10: End-to-end check and tunnel (planner)

- [ ] Run `npm test`, `npm run typecheck` and `npm run lint`. Expected: all clean.
- [ ] Add `e2e/person-history.spec.ts`:
  - The E2E login creates a quick expense with a second person, and a group with three people and fewest transfers.
  - Open Home → person → assert the `history-line-*` rows and the totals match.
  - Open the group → transfer row → "See history" → assert the gap block.
  - Run it with `npm run e2e -- person-history` (it builds first).
- [ ] Run `npm run seed:local -- --reset`, then `npm run tunnel`.
- [ ] Walk `docs/manual-testing/person-history.md` S1–S18 on the tunnel at 375px. Any Expect that fails is a bug in Tasks 1–8, or a wrong seed number. Fix whichever it is.
- [ ] Hand over for the owner's manual test.

## Self-review notes

- Spec coverage:
  - modes A and B → Tasks 2 and 6
  - line content → Tasks 1 and 5
  - states → Task 1
  - gap and rounding → Tasks 1 and 5
  - trim → Task 1
  - `/r` → Tasks 3 and 8
  - entry points → Tasks 6 and 7
  - privacy → Task 3
  - copy → Task 4
  - setup and seed (owner request) → Task 9
- Planner's calls beyond the spec, for the owner to check:
  - Mode B hides the cross-place actions.
  - The group entry is a button inside the opened transfer row.
  - The Mode B URL is `/people/in/:tripId/:pid`.
  - The seed copies `users` rows from the source checkout's local D1.
