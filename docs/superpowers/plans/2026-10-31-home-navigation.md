# Home, navigation and people merging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "Khoản chi nhanh" a group-page-like main screen, add a floating footer on phones and a side panel on computers, add an Activity feed across all groups, and let the owner merge and unmerge any guest with anyone in their People list.

**Architecture:**
- **Merges are owner-only links.** They extend `person_links`: any guest participant, including a ledger guest, points at one ledger person, which may be a signed-in user's ledger participant. The People summary and pair loading follow these links, and unmerge deletes one link row.
- **Navigation.** One `AppNav` component renders the floating pill + "+" below `lg`, and a side panel from `lg`. `Screen` hosts it.
- **Main screen.** It reuses `ExpenseList`, `PaymentsList` and `TripTabs` over the hidden ledger trip's `TripView`.

**Tech Stack:**
- **API:** Hono on Cloudflare Workers, D1 + Drizzle.
- **Web:** React + Vite, shadcn/ui + Tailwind v4, React Query.
- **Tests:** vitest (`cloudflare:test` for the API), Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-31-home-navigation-design.md` (builds on `docs/superpowers/specs/2026-10-31-quick-expenses-and-people-design.md`)

## Global Constraints

- **D1 limits:** ≤100 bound parameters per query and ≤50 queries per invocation.
- **UI rules from `CLAUDE.md`:**
  - App wrappers come first (`Button`, `Sheet`, `Avatar`, `Amount`, `Icon`, `Skeleton`, `InlineError`, `Snackbar`), and shadcn `Input` for text fields.
  - Theme colours only, with no raw hex. `src/test/style-guard.test.ts` and `ui-components-guard.test.ts` enforce this.
  - Touch targets ≥44px (`min-h-11`). Money uses `tabular-nums`.
  - Keep `fsl-*` classes and `data-testid` values.
- **Copy:** Vietnamese first. Every new key goes in `apps/web/src/i18n/en.ts` and `vi.ts`, and vi lines end with `// REVIEW`.
- **Money rules from PR #25 are unchanged.** That covers netting by suggested transfers, settlement spreading, `says_paid` + confirm/reject, and the idempotency keys.
- **Navigation is for signed-in users only.** Guests and link viewers keep today's screens with no nav.
- **Hide the nav on forms:** add/edit expense, fund, pay screen, bank screens and create group.
- **Two signed-in people can never be merged.** "Gộp với…" is offered on guest rows only.
- **Delegation:**
  - Tasks 1–2 (API/DB) go to Argon `gemini-4-argon-medium`, or to Claude at medium effort when Argon has no quota.
  - Tasks 3–7 (web) go to Gemini 3.8 Flash (High), split at dispatch if over ~300 lines / 3 files.

## Review Focus

1. **Merging a ledger guest A who already has links pointing at A.** Every link to A must be repointed to the survivor in the same batch, so that no total is counted twice or lost. Pinned by Task 1, test "repoints links that pointed at the merged ledger guest".
2. **Unmerging one entry.** The split-off person reappears as their own row with exactly their old lines. The kept person's total drops by that amount, and the kept person keeps the request token. Pinned by Task 1, test "unmerge splits one entry off".
3. **The floating footer hides the last row or a save bar.** The last row of a long list must be reachable, and forms must show no nav at all. Pinned by Task 3, test "pads the page and is absent on forms".
4. **Activity paging when many rows share `created_at`.** The `(createdAt, id)` cursor must not repeat or skip rows. Pinned by Task 2, test "pages by (createdAt, id) without gaps".
5. **Old links.** `/trips?mergeReview=…` and `/trips?tab=groups` must land on `/groups` with the banner. Pinned by Task 5, test "old /trips links redirect to /groups".

---

### Task 1: API — merge any guest with anyone, and unmerge

**Files:**
- Modify: `apps/api/src/me/personRoutes.ts` (`parseLinkKeys`, `linkGuests`, new unlink route)
- Modify: `apps/api/src/me/balances.ts` (`loadPeopleSummary`, `loadPersonItems`: follow links to user-owned ledger participants and between ledger participants; fill `linked`)
- Modify: `packages/core/src/api-types.ts` (`PersonSummary.linked`)
- Test: `apps/api/test/people-merge-any.test.ts`

**Interfaces:**
- Consumes: `ensurePersonalLedger`, `importPerson` (`apps/api/src/me/ledger.ts`), and the `person_links` and `nicknames` tables.
- Produces:
  - **`POST /api/me/people/link`**
    - Body: `{ keys: PersonKey[] }`, with 2–20 keys, any number of `p:` and at most one `u:`.
    - Returns `{ key: PersonKey }`, the surviving person's key. When a `u:` is present it is that `u:` key, otherwise `p:<ledgerPid>`.
    - Two `u:` keys give 422 `VALIDATION` "Two accounts can't be merged".
  - **`DELETE /api/me/people/link/:participantId`**
    - Removes the caller's `person_links` row for that participant and returns 204.
    - Returns 404 `NOT_FOUND` when the caller has no such link.
  - **`PersonSummary.linked: { participantId: string; name: string; tripName: string; kind: 'group' | 'direct' }[]`**
    - Lists every participant folded into this person through a link, excluding the person's own ledger participant.
    - It is `[]` when nothing is linked.

- [ ] **Step 1: Write the failing tests** in `apps/api/test/people-merge-any.test.ts`, seeded with the helpers from `people-summary.test.ts`:
  - **`merges a ledger guest with a group guest into one person with combined totals`**
    - Ledger guest Minh owes 120000. Group guest "Minh" in Badminton owes 50000.
    - After `POST /api/me/people/link { keys: ['p:<ledgerMinh>', 'p:<groupMinh>'] }`, the summary has one row with `total: 170000` and `linked` = `[{ participantId: '<groupMinh>', tripName: 'Badminton', kind: 'group', name: 'Minh' }]`.
  - **`merges two ledger guests`**
    - Ledger guests "Minh" owes 100000 and "Minh N" owes 20000.
    - After linking, one row has `total: 120000`, and the response key is one of the two `p:` keys.
  - **`merges a guest into a signed-in user`**
    - Group guest "Linh" owes 30000. Signed-in Linh (`u:u-linh`) owes 40000 in another group.
    - After linking `['p:<guestLinh>', 'u:u-linh']`, the response is `{ key: 'u:u-linh' }` and the summary has one `u:u-linh` row with `total: 70000`.
    - `POST /api/me/people/u%3Au-linh/settle { paid: 70000, direction: 'toOwner' }` settles both lines.
  - **`refuses two accounts`:** `['u:u-a', 'u:u-b']` gives 422.
  - **`repoints links that pointed at the merged ledger guest`**
    - Group guest G is linked to ledger A. Then A is merged with ledger B, and the response key is `p:B`.
    - Afterwards G's link points at B. The summary shows one row whose total is the sum of the three, and `linked` lists both G and A.
  - **`unmerge splits one entry off`**
    - After the first test, `DELETE /api/me/people/link/<groupMinh>` returns 204.
    - The summary then has two rows: the ledger Minh at 120000 and the group Minh at 50000 with `groupLabel: 'Badminton'`.
    - The ledger Minh's `request_token` is unchanged.
  - **`unmerge of someone else's or a missing link is 404`.**
- [ ] **Step 2: Run** `npx vitest run test/people-merge-any.test.ts` in `apps/api`. Expect FAIL.
- [ ] **Step 3: Implement `linkGuests` so it chooses the survivor and repoints links.**
  - **Choose the survivor.**
    - If a `u:` key is present, the survivor is that user's ledger participant. If the user has none, import it with `importPerson` from any active participant with that `user_id` in the caller's trips; with none, return 403.
    - Otherwise the survivor is the oldest ledger participant among the keys (or behind their links), or a new import as today.
  - **Write the links.**
    - Upsert a `person_links` row for each non-survivor participant: group guests, other ledger guests, and every participant already linked to a merged ledger guest.
    - Move nicknames onto the survivor's key.
  - **Keep everything in one `db.batch`.** The cost is ≤ 6 queries + 1 batch.
- [ ] **Step 4: Implement link-following in `balances.ts`.**
  - A participant with a link row nets under the person behind the link. If the link target has a `user_id`, the key is `u:<user_id>`; otherwise it is `p:<target>`.
  - `loadPersonItems` for a `u:` key also includes guests linked to that user's ledger participant.
  - `linked` is filled from the same link rows, with no extra query.
  - Keep `MAX_COLD_REBUILDS` and the query budget unchanged.
- [ ] **Step 5: Add `DELETE /me/people/link/:participantId`.** It deletes the row where `owner_user_id = caller AND participant_id = :participantId`, writes an activity row in the ledger, and nicknames are not restored.
- [ ] **Step 6: Run** `npm test -w @fsl/api`. Expect all PASS, including the existing `people-*`, `settle*` and `request*` tests.
- [ ] **Step 7: Commit** `feat(api): merge any guest with anyone, and unmerge`.

### Task 2: API — activity across all groups

**Files:**
- Create: `apps/api/src/me/activity.ts`
- Modify: `apps/api/src/app.ts` (mount `myActivityRoutes()` under `/api`)
- Modify: `packages/core/src/api-types.ts` (`MyActivityItem`, `MyActivityPage`)
- Test: `apps/api/test/my-activity.test.ts`

**Interfaces:**
- Consumes: the `activity`, `participants` and `trips` tables, and the actor-name resolution used by `GET /trips/:id/activity` (`apps/api/src/trips/routes.ts:311`). Extract it into a shared helper if needed.
- Produces:
  - **`GET /api/me/activity?before=<cursor>`** returns `MyActivityPage`. It has no `before` on the first page.
  - **`interface MyActivityItem extends ActivityItem`** adds:
    - `tripId: string`
    - `tripName: string`
    - `kind: 'group' | 'direct'`
    - `names: Record<string, string>`: names for the participant ids in `details` (`fromId`, `toId`, `participantId`), so lines render without a `TripView`.
  - **`interface MyActivityPage { items: MyActivityItem[]; next: string | null }`**
    - The page size is 50.
    - `next` is an opaque cursor `<createdAt>~<id>`, or `null` on the last page.
  - **Which trips:** every trip where the caller is an active participant, including their own ledger and archived groups. It never includes someone else's ledger.

- [ ] **Step 1: Write the failing tests:**
  - **`lists activity from all my groups and my quick expenses, newest first, with trip names`**
    - Two groups plus the ledger give items from all three, sorted by `createdAt` desc.
    - Ledger items have `kind: 'direct'`.
  - **`includes other members' actions in my groups`.**
  - **`leaves out groups I'm not in and other people's ledgers`.**
  - **`pages by (createdAt, id) without gaps`**
    - Seed 60 rows, 30 of them with an identical `createdAt`.
    - Page 1 has 50 items and a `next`. Page 2 has 10 items and `next: null`. Together the ids are unique and number 60.
  - **`fills names for payment and bank lines`:** `names[fromId] === 'Minh'`.
  - **`needs a signed-in user`:** 401.
- [ ] **Step 2: Run** `npx vitest run test/my-activity.test.ts` in `apps/api`. Expect FAIL.
- [ ] **Step 3: Implement it.**
  - **The main query** joins `activity` with `trips` where `trip_id IN (SELECT trip_id FROM participants WHERE user_id = ? AND status = 'active')`. With a cursor it adds `AND (created_at < ? OR (created_at = ? AND id < ?))`, then `ORDER BY created_at DESC, id DESC LIMIT 51`.
  - **One query for actor names and one for detail names.** Each id list is chunked to ≤90 ids per query.
  - **Total:** ≤ 6 queries.
- [ ] **Step 4: Run** `npm test -w @fsl/api`. Expect PASS.
- [ ] **Step 5: Commit** `feat(api): activity across all my groups`.

### Task 3: Web — AppNav (floating footer + side panel) hosted by Screen

**Files:**
- Create: `apps/web/src/components/AppNav.tsx`
- Modify: `apps/web/src/components/Screen.tsx` (optional `nav` prop)
- Modify: `apps/web/src/i18n/en.ts` and `vi.ts`
- Test: `apps/web/src/components/__tests__/app-nav.test.tsx`

**Interfaces:**
- Produces:
  - `type NavSection = 'home' | 'groups' | 'activity'`
  - `function AppNav({ section, addHref }: { section: NavSection; addHref: string }): JSX.Element`
  - `ScreenProps.nav?: { section: NavSection; addHref: string }`. When it is set:
    - `Screen` renders `<AppNav>`.
    - Below `lg`, it adds bottom padding `pb-28` to the content.
    - From `lg`, it lays out `[side panel 15rem | content]`.
    - Without `nav`, `Screen` is unchanged.
- **Links:**
  - Khoản chi nhanh → `/trips`
  - Nhóm → `/groups`
  - Hoạt động → `/activity`
- **Phone layout (below `lg`):**
  - A fixed row `bottom-4 inset-x-4`, `justify-between`.
  - **Left:** a pill `rounded-full bg-card shadow-lg p-1.5` with three icon-only `Link`s, each `size-11 rounded-full`.
    - The current one is `bg-secondary text-foreground` with `aria-current="page"`; the others are `text-muted-foreground`.
    - Icons: `home`, `users`, `clock`. Add `home` to `components/icons.tsx` if missing, via lucide `House`.
  - **Right:** a `Link` "+" `size-14 rounded-full bg-foreground text-background shadow-lg` with `aria-label={t('nav.add')}` and `href={addHref}`.
- **Computer layout (from `lg`):**
  - An `aside` of `w-60 bg-card border-r border-border`, sticky full-height.
  - From top to bottom:
    - the brand "CoinCrew" (`font-semibold`)
    - a `Button variant="primary" block href={addHref}` with text `+ {t('nav.add')}`
    - three nav links, each icon + label, `min-h-11 rounded-full`, with the current one `bg-secondary font-semibold`
    - `AccountMenu` at the bottom
- **Test ids:** `app-nav`, `nav-home`, `nav-groups`, `nav-activity` and `nav-add`. The phone and computer variants use the same ids in separate containers, `app-nav-bar` and `app-nav-side`.
- **i18n:**

| Key | en | vi |
|---|---|---|
| `nav.home` | Quick expenses | Khoản chi nhanh |
| `nav.groups` | Groups | Nhóm |
| `nav.activity` | Activity | Hoạt động |
| `nav.add` | Add transaction | Thêm giao dịch |
| `nav.label` | Main menu | Menu chính |

- [ ] **Step 1: Write the failing tests:**
  - **`marks the current section and links each icon`:** render `AppNav section="groups" addHref="/t/t-1/expenses/new"`. In `app-nav-bar`, `nav-groups` has `aria-current="page"`, `nav-home` has href `/trips`, `nav-activity` has href `/activity`, and `nav-add` has href `/t/t-1/expenses/new` with name "Add transaction".
  - **`pads the page and is absent on forms`:**
    - A `Screen` with `nav` has content with class `pb-28`.
    - A `Screen` without `nav` renders no `app-nav`.
  - **`side panel lists the same links with labels`:** `within(app-nav-side)` shows the texts 'Quick expenses', 'Groups', 'Activity' and '+ Add transaction'.
- [ ] **Step 2–4:** FAIL → implement → `npm test -w @fsl/web` PASS, including the style and ui guards.
- [ ] **Step 5: Commit** `feat(web): floating footer and side panel`.

### Task 4: Web — main screen "Khoản chi nhanh" (layout A)

**Files:**
- Modify: `apps/web/src/screens/Home.tsx` (rewrite: no tabs, layout A)
- Modify: `apps/web/src/i18n/en.ts` and `vi.ts`
- Modify: `apps/web/src/screens/__tests__/home-people.test.tsx`. Update the cases that assert the old tabs and the "New group" button: they go, or become `/groups` tests in Task 5. List each edit in the report.
- Test: `apps/web/src/screens/__tests__/home-main.test.tsx`

**Interfaces:**
- **Consumes:**
  - `usePeopleSummary`, `useLedger` (`api/people.ts`)
  - `useTripView(ledger.tripId, 0)` (`api/hooks.ts`)
  - `ExpenseList`, `PaymentsList`, `TripTabs`, `DetailsPanel`
  - `Screen` with `nav={{ section: 'home', addHref: '/t/<ledgerId>/expenses/new' }}` (Task 3)
- **Layout, from top to bottom:**
  1. **Total card** (`fsl-home__total`, `data-testid="home-total"`, BalanceCard look).
     - Label `home.totalOwed`, with `<Amount tone="success" size="xl">` of the sum of positive totals.
     - Under it, `home.totalOwe` with the sum of negative totals when > 0.
     - Both sums come from the same `people` array as the list.
  2. **Heading `home.byPerson`**, then the existing person rows. Keep `person-row-<key>` and the waiting line; sort owed-to-you first by size, then you-owe.
  3. **`TripTabs`**, then `ExpenseList` or `PaymentsList` over the ledger view.
     - `onOpen` navigates to `/t/<ledgerId>/expenses/<id>` or `/t/<ledgerId>/payments/<id>`.
     - From `lg`, it instead sets a local selection shown in `DetailsPanel` in the right column.
  - **No "New group" button.**
- **Computer layout:** `TripLayout`, with left = the tabs' lists (expenses and payments stacked as in `MemberTrip` wide) and right = the total card + by-person list, or `DetailsPanel` when an item is selected.
- **i18n:**

| Key | en | vi |
|---|---|---|
| `home.title` (changed) | Quick expenses | Khoản chi nhanh |
| `home.totalOwed` | Owed to you, all groups | Mọi người nợ bạn (tất cả nhóm) |
| `home.totalOwe` | You owe {amount} | Bạn nợ {amount} |
| `home.byPerson` | By person · all groups | Theo người · mọi nhóm |

- [ ] **Step 1: Write the failing tests** in `home-main.test.tsx`. The fixtures are the ledger view `t-led` with one expense "Taxi" 240000 and one payment, plus a summary of Linh +350000, Minh +270000 and Tuấn −80000.
  - **`shows the total card as the sum of the list`:** `home-total` contains '620.000' and 'You owe 80.000₫'.
  - **`lists people by person across groups`:** `person-row-u:u-linh` comes before `person-row-p:p-tuan`.
  - **`lists quick expenses and payments in tabs`:** 'Taxi' is visible. Clicking the Payments tab shows the payment row.
  - **`opening an expense goes to its details`:** clicking Taxi sets `location` to `/t/t-led/expenses/<id>`.
  - **`no New group button and the + adds a quick expense`:** there is no 'New group' link, and `nav-add` has href `/t/t-led/expenses/new`.
- [ ] **Step 2–4:** FAIL → implement → PASS (whole web suite).
- [ ] **Step 5: Commit** `feat(web): Khoản chi nhanh main screen like a group page`.

### Task 5: Web — Groups and Activity screens, routes and redirects

**Files:**
- Create: `apps/web/src/screens/Groups.tsx` (wraps `MyTrips embedded` in `Screen` with title `trips.title`, `AccountMenu`, `ConsentSheet` and nav `{ section: 'groups', addHref: '/t/<ledgerId>/expenses/new' }`)
- Create: `apps/web/src/screens/MyActivity.tsx`
- Create: `apps/web/src/api/myActivity.ts` (`useMyActivity()` infinite query over `GET /api/me/activity`)
- Modify:
  - `apps/web/src/App.tsx`: routes `/groups` and `/activity`. On `/trips`, when the search has `mergeReview` or `tab=groups`, redirect to `/groups` with the same search.
  - `apps/web/src/components/MergeSheet.tsx:248`: `'/groups?mergeReview='`.
  - `apps/web/src/lib/activityText.ts`: `activityLine` accepts an optional `names` map used when `view` is undefined.
- Test: `apps/web/src/screens/__tests__/groups-activity.test.tsx`

**Interfaces:**
- **Consumes:** `MyActivityItem` and `MyActivityPage` (Task 2), `AppNav` (Task 3).
- **Produces:** `function useMyActivity(): { items: MyActivityItem[]; isLoading; error; fetchNextPage(): void; hasNextPage: boolean }`.
- **`activityLine(item, view, t, names?)`:** when `view` is undefined and `names` is given, payment and bank lines use `names[id]`.
- **MyActivity layout:**
  - The same day grouping as `Activity.tsx` (`groupByDay`, `timeOf`).
  - Each row's meta line shows `item.kind === 'direct' ? t('nav.home') : item.tripName` · time.
  - Tapping a row with `details.expenseId` goes to `/t/<tripId>/expenses/<expenseId>`, and with `details.paymentId` to `/t/<tripId>/payments/<paymentId>`.
  - A "Load more" ghost `Button` shows while `hasNextPage`.
  - Nav section is `'activity'`.

- [ ] **Step 1: Write the failing tests:**
  - **`old /trips links redirect to /groups`:** render `App` at `/trips?mergeReview=req-1`, and `location` becomes `/groups`. The same for `?tab=groups`.
  - **`groups screen lists groups and has New group, with Nhóm current`.**
  - **`activity shows lines from several groups with their names and loads more`:** page 1 has a `next`, and clicking "Load more" fetches `?before=<next>`.
  - **`a quick-expense line is labelled Quick expenses`.**
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(web): groups and activity screens with the new nav`.

### Task 6: Web — nav on group and person pages; ledger trip page goes home

**Files:**
- Modify: `apps/web/src/screens/MemberTrip.tsx`
  - For a signed-in user, pass `nav={{ section: 'groups', addHref: '/t/<tripId>/expenses/new' }}` and drop the `bottomBar` add link. Keep the bar for guests and viewers.
- Modify: `apps/web/src/screens/TripRoute.tsx`
  - For `view.trip.preset === 'direct'` on the list route `/t/:tripId`, `Navigate` to `/trips`.
  - Detail pages for the ledger keep working; their back goes to `/trips`.
- Modify: `apps/web/src/screens/PersonScreen.tsx` (nav section `'home'`, addHref the ledger form)
- Modify: the view-only trip page and the no-access (403) screen used by `TripRoute`. When `useMe()` has a user, pass the same nav with section `'groups'`. The addHref is the ledger form, because a viewer can't add to that group.
- Test: `apps/web/src/screens/__tests__/nav-pages.test.tsx`

- [ ] **Step 1: Write the failing tests:**
  - **`member trip page shows the nav with Nhóm current and + adding to this group`:** `nav-add` has href `/t/t-1/expenses/new`.
  - **`a guest's trip page keeps its own add bar and no nav`.**
  - **`opening the ledger trip list redirects to /trips`.**
  - **`person page has the nav with home current`.**
- [ ] **Step 2–4:** FAIL → implement → PASS. Existing `member-trip.test.tsx` cases that assert the bottom bar for members change to assert `nav-add`; list each edit.
- [ ] **Step 5: Commit** `feat(web): app nav on group and person pages`.

### Task 7: Web — "Gộp với…" and "Tách ra" on the person page; e2e

**Files:**
- Modify: `apps/web/src/screens/PersonScreen.tsx`. Replace the "Same person?" button and sheet with "Gộp với…"; add the linked list with "Tách ra".
- Modify: `apps/web/src/api/people.ts`. Add `unlinkPerson(participantId: string, queryClient?: QueryClient): Promise<void>`, which calls `DELETE /api/me/people/link/:participantId` and then invalidates the summary.
- Modify: `apps/web/src/i18n/en.ts` and `vi.ts`
- Modify: `apps/web/src/screens/__tests__/person-screen.test.tsx`. Swap the "Same person?" assertions for the new ones and list each edit.
- Modify: `e2e/quick-expense.spec.ts` for the new main screen: Home → nav-add, rows on the main screen.
- Test: `apps/web/src/screens/__tests__/person-merge.test.tsx`

**Interfaces:**
- **Consumes:** `linkPeople(keys, qc)` (exists), `PersonSummary.linked` (Task 1), `findSimilarNames` (`@fsl/core`).
- **"Gộp với…" action:**
  - A secondary `Button`, `data-testid="person-merge"`, shown only when `person.userId === null`.
  - It opens a `Sheet` titled `person.mergeWith`, with help `person.mergeHelp`.
  - The list is every other person from the summary. Similar names come first (`findSimilarNames`), then the rest A–Z.
  - Rows are `data-testid="merge-pick-<key>"`.
  - When this person and the candidate are both signed in, the row is disabled with `person.mergeBothSignedIn`.
  - Tapping a row calls `linkPeople([key, other.key], qc)`, then `navigate('/people/' + encodeURIComponent(result.key), { replace: true })`.
- **Linked list:**
  - Under the items, a section lists `person.linked`, one row each: `{name} · {tripName or nav.home}`.
  - Each row has a ghost button `person.unmerge` with `data-testid="unmerge-<participantId>"`, which calls `unlinkPerson(participantId, qc)`.
- **i18n:**

| Key | en | vi |
|---|---|---|
| `person.mergeWith` | Merge with… | Gộp với… |
| `person.mergeHelp` | They become one person here, with one total. Your groups don't change. | Họ sẽ thành một người ở đây, với một tổng. Các nhóm không thay đổi. |
| `person.mergeBothSignedIn` | Both have accounts | Cả hai đều có tài khoản |
| `person.unmerge` | Split {name} off | Tách {name} ra |
| `person.linkedTitle` | Merged here | Đã gộp vào đây |

- [ ] **Step 1: Write the failing tests:**
  - **`merge sheet lists everyone, similar names first`:** for guest Minh, the "Minh N" row comes before "Linh"; tapping it posts `/api/me/people/link` with `{ keys: ['p:p-minh', 'p:p-minhn'] }` and navigates to `/people/<returned key>`.
  - **`signed-in candidates are disabled when this person is signed in`:** for a `u:` person, the `person-merge` button is absent.
  - **`linked entries can be split off`:** clicking `unmerge-g-minh` sends DELETE `/api/me/people/link/g-minh`.
- [ ] **Step 2: Extend the e2e test.** After the existing flow, add a second quick expense with a new name "Minh N", merge it into Minh from Minh's page, and assert one row with the combined total on the main screen. Then split it off and assert two rows.
- [ ] **Step 3–4:** FAIL → implement → `npm test -w @fsl/web` PASS, and `npm run build -w @fsl/web && npx playwright test` with 4+ passing.
- [ ] **Step 5: Commit** `feat(web): merge and unmerge people from the person page`.
