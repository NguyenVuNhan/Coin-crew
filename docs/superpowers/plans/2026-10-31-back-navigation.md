# Back Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every back control in `apps/web` returns to the page the user came from. With no app page behind it, it goes to
the screen's natural parent. Pages come back on the same tab and scroll position.

**Architecture:** A `NavHistoryProvider` at the router root records, per `location.key` in `sessionStorage`, the history
depth, the address the entry was opened as, its scroll position and small view state. A single `useBack(parent)` hook
uses `navigate(-1)` when depth > 0, else replaces with the parent. `<Screen>`, AppNav and every screen move onto it.
The per-screen mechanisms are deleted: `fromList`, `useBackToTrip`, `useLeaveForm`, `useListScroll` and `?from=`.

**Tech Stack:** React 19, React Router v7 (`BrowserRouter`, declarative `<Routes>`), Vitest + Testing Library (jsdom),
Playwright (`e2e/`, phone viewport 375px).

**Spec:** `docs/superpowers/specs/2026-10-31-back-navigation-design.md` (evidence: `docs/navigation-map.md`, §4 mismatch
rows referenced below as "row N").

## Global Constraints

- Keep React Router v7 `<BrowserRouter>`. No data router, no `<ScrollRestoration>`.
- No visual change. Same arrow, same place. Back controls keep their accessible names ("Back", "Back to trip") and their
  element type (a screen whose back is a `<Link>` today stays a link, a `<button>` stays a button). The 21 tests that
  find `button 'Back'` and the 7 that find `link 'Back'` must keep passing without edits.
- Keep `fsl-*` classes and `data-testid`s on the same elements. Theme only in `globals.css`. Use the app wrappers
  (`CLAUDE.md`).
- An existing test may be edited only where it asserts a destination this plan deliberately changes. Name each such
  edit in the task.
- `sessionStorage` access is always wrapped in try/catch. When it fails, depth is 0, so back falls back to the parent
  and never leaves the app.
- The entry key `'default'` (the router's first entry of a page load) always has depth 0 and is never written.
- Branch `feat/no-group-expenses` already carries uncommitted fixes. Keep MemberTrip's `back="/groups"` and CreateTrip's
  `back="/groups"`. Remove the `?from=` on People and PersonScreen (Task 4).
- Commit only when the user asks (user rule). The commit steps below are "stage + commit when asked".

## Review Focus

1. **A shared `/j/<token>` link that redirects (replace) to `/t/<id>`, then back:** must land on `/groups` (the
   parent), not leave the app. *Test in Task 1 (`replace keeps depth 0 on a first-load redirect`) and Task 5.*
2. **Reload in the middle of a visit, then back:** the depth survives in `sessionStorage`, so back still steps through
   history. *Test in Task 1 (`a reloaded entry keeps its depth`).*
3. **Back to a page whose list is still loading:** the scroll position is restored after the content appears, not
   on the skeleton. *Test in Task 1 (`restore waits until the page is tall enough`).*
4. **The arrow pressed twice quickly:** two `navigate(-1)` calls must not skip past the opener and out of the app.
   *Test in Task 2 (`a double tap goes back one page`).*
5. **Tabs:** going Groups → Home → Activity → Groups, then system back, must not replay the tab hops. A tab tapped
   from a deeper page must still come back to it. *Test in Task 2.*

---

## File Structure

- Create `apps/web/src/lib/navHistory.tsx`: the provider and every hook (one responsibility: history bookkeeping).
- Create `apps/web/src/lib/__tests__/navHistory.test.tsx`.
- Modify `apps/web/src/main.tsx` and `apps/web/src/test/render.tsx`: mount the provider inside the router.
- Modify `apps/web/src/components/Screen.tsx` and `apps/web/src/components/AppNav.tsx`.
- Modify `apps/web/src/lib/detailsNav.ts`: delete the history helpers and keep the Home param helpers.
- Modify the screens listed per task.
- Create `e2e/back-navigation.spec.ts`. Modify `docs/navigation-map.md`.

---

### Task 1: History bookkeeping (`lib/navHistory.tsx`)

**Files:**
- Create: `apps/web/src/lib/navHistory.tsx`
- Modify: `apps/web/src/main.tsx` (wrap `<App />` inside `<BrowserRouter>`)
- Modify: `apps/web/src/test/render.tsx` (wrap the `<Routes>` and `<LocationProbe>` inside `<MemoryRouter>`)
- Test: `apps/web/src/lib/__tests__/navHistory.test.tsx`

**Interfaces:**
- Produces:
  - `NavHistoryProvider({ children }: { children: ReactNode }): JSX.Element`
  - `useNavEntry(): { depth: number; openedAs: string | null }`. `openedAs` is the `pathname + search` the entry had
    when it was pushed (or first loaded), unchanged by later replaces of that same entry.
  - `useBack(parent?: string): { canGoBack: boolean; goBack: () => void }`. `canGoBack = depth > 0 || parent !==
    undefined`. `goBack` is `navigate(-1)` when depth > 0, else `navigate(parent, { replace: true })`, else a no-op.
    It ignores a second call until the location changes (Review Focus 4).
  - `useEntryState<T>(name: string, initial: T): [T, (value: T) => void]`. Like `useState`, but stored on the current
    entry. A POP or a reload reads it back. A PUSH starts from `initial`.
- Outside a provider, every hook acts as depth 0 with no stored state (no throw).

**Record per key** (storage key `fsl:nav`, one JSON object `{ [key]: { depth, openedAs, scrollY?, view? , t } }`,
pruned to the newest 100 by `t`):
- PUSH: `depth = depth(prev) + 1`, `openedAs = new path`.
- REPLACE: the new key copies the previous record (same depth, same `openedAs`), and the previous key is deleted.
- POP: read the record. An unknown key or `'default'` counts as depth 0, `openedAs = current path`.
- Scroll: save `window.scrollY` for the key being left while rendering the new location, before commit, as
  `useListScroll` does today. In a layout effect: PUSH → `scrollTo(0, 0)`; REPLACE → leave the scroll alone; POP → if a
  `scrollY` is stored, restore it once `document.documentElement.scrollHeight - innerHeight >= scrollY`, checking each
  animation frame for at most 60 frames, then restore anyway. When `scrollHeight` is 0 (jsdom, no layout), restore at
  once. A user scroll during the wait cancels it.

- [ ] **Step 1: Write the failing tests** in `navHistory.test.tsx`. Each test renders a `MemoryRouter` with
  `NavHistoryProvider` and a probe that shows `useNavEntry()` and exposes `useNavigate`/`useBack`. `sessionStorage` is
  cleared in `beforeEach`.
  - `push adds one level`: start `/a`, push `/b` → `depth` 1, `openedAs` `/b`.
  - `replace keeps depth 0 on a first-load redirect`: start `/j/x`, `navigate('/t/1', { replace: true })` → depth 0;
    `useBack('/groups').goBack()` → location `/groups`, navigation type `REPLACE`.
  - `replace keeps the opened-as address`: `/a` → push `/trips?expense=e1` → replace `/trips?expense=e2` →
    `openedAs` is `/trips?expense=e1`, depth 1.
  - `pop reads the stored depth`: `/a` → push `/b` → push `/c` → `navigate(-1)` → depth 1.
  - `a reloaded entry keeps its depth`: write a record for key `k1` with depth 2, then mount at
    `initialEntries={[{ pathname: '/c', key: 'k1' }]}` → depth 2.
  - `storage that throws counts as depth 0`: `vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw
    new Error() })` → depth 0, and `goBack` replaces with the parent.
  - `goBack with depth goes back one step`: `/a` → push `/b` → `goBack()` → location `/a`, type `POP`.
  - `entry state survives going back`: on `/a`, set `useEntryState('tab','expenses')` to `'payments'`, push `/b`, go
    back → `'payments'`. Push `/a` again → `'expenses'`.
  - `a new page starts at the top and back restores the scroll`: stub `scrollY` 420 on `/a`, push `/b` → `scrollTo`
    last called `(0, 0)`; stub `scrollY` 0, go back → `scrollTo` last called `(0, 420)`.
  - `restore waits until the page is tall enough`: stub `scrollHeight` 500 and `innerHeight` 400 with a target of 420.
    No restore at first. Set `scrollHeight` 900 → restored to 420 within the frame loop.
  - `prunes to 100 entries`: 120 pushes → the stored object has 100 keys.
- [ ] **Step 2: Run** `npx vitest run src/lib/__tests__/navHistory.test.tsx` in `apps/web`. Expected: FAIL (module not
  found).
- [ ] **Step 3: Implement** `lib/navHistory.tsx` with the interfaces above. Mount the provider in `main.tsx` and in
  `test/render.tsx`.
- [ ] **Step 4: Run** the new test file (expected PASS), then `npx vitest run` (expected: all existing tests still pass;
  nothing uses the provider yet).
- [ ] **Step 5: Stage and commit when asked:** `feat(web): history depth, entry state and scroll restore per entry`.

### Task 2: `<Screen>` back arrow and AppNav tabs

**Files:**
- Modify: `apps/web/src/components/Screen.tsx`, `apps/web/src/components/AppNav.tsx`
- Test: `apps/web/src/components/__tests__/Screen.back.test.tsx` (create), `apps/web/src/components/__tests__/AppNav.tabs.test.tsx` (create)

**Interfaces:**
- Consumes: `useBack`, `useNavEntry` (Task 1).
- Produces, on `ScreenProps`:
  - `back?: string`: now **the natural parent**. It renders `<Link to={back} replace>` as today, with an `onClick`
    that, when depth > 0, calls `preventDefault()` and `goBack()`.
  - `onBack?: () => void`: unchanged (button). Screens pass `useBack(parent).goBack`.
  - `backInApp?: boolean`: new. With no `back`/`onBack`, show the arrow as a button only when depth > 0, running
    `goBack()`. Used by the guest and view-only group pages (Task 5).
- AppNav: a tab `Link` gets `replace` when the current `pathname` is one of `/trips`, `/groups`, `/activity`
  (the query string is ignored). Otherwise it pushes. The "+" link is unchanged.

- [ ] **Step 1: Write the failing tests.**
  - `Screen.back.test.tsx`:
    - `back link keeps its href`: `<Screen back="/groups">` → `link 'Back'` has `href` `/groups`.
    - `with a page behind, back goes back in history`: `/x` → push `/y` (renders `<Screen back="/groups">`) → click
      `Back` → location `/x`, type `POP`.
    - `with nothing behind, back replaces with the parent`: start at `/y` → click → `/groups`, type `REPLACE`.
    - `a double tap goes back one page`: `/x` → push `/y` → push `/z`, then click `Back` twice before the location
      updates (two `fireEvent.click` in a row) → location `/y`.
    - `backInApp hides the arrow when opened by link and shows it in the app`: start at `/g` → no `button 'Back'`;
      `/x` → push `/g` → `button 'Back'` → click → `/x`.
  - `AppNav.tabs.test.tsx`:
    - `tab to tab replaces`: start `/groups`, push `/trips` via `nav-home`, then `nav-activity` → navigation type
      `REPLACE` and depth 1.
    - `a tab from a deeper page pushes`: start `/groups`, push `/t/1`, click `nav-home` → type `PUSH`, then
      `navigate(-1)` → `/t/1`.
- [ ] **Step 2: Run** both files. Expected: FAIL.
- [ ] **Step 3: Implement** the `Screen` and `AppNav` changes.
- [ ] **Step 4: Run** both files (PASS), then `npx vitest run` (all pass; the `button`/`link 'Back'` tests are untouched).
- [ ] **Step 5: Stage and commit when asked:** `feat(web): back arrow follows history, tabs don't stack`.

### Task 3: Trip details, approvals, ratings and forms on `useBack`

**Files:**
- Modify: `apps/web/src/lib/detailsNav.ts`. Delete `DetailsState`, `cameFromList`, `entryOptions`'s `fromList`
  marking, `useBackToTrip`, `useLeaveForm`, `useListScroll`, `TripPage`, `DEPTH` and `scrollWindowTo`.
  `useOpenDetails`, `useApprovalsLink` and `useRatingsLink` keep their signatures: they push, or replace when
  `switching`, without state. Keep the Home helpers.
- Modify: `screens/TripRoute.tsx` (DetailsPage `onBack`; remove `useListScroll`), `screens/DetailsPanel.tsx`,
  `screens/Approvals.tsx`, `screens/RatingsScreen.tsx`, `screens/ExpenseForm.tsx` (`useLeaveForm` at :1548),
  `IncomeForm` inside `screens/ExpenseForm.tsx` (it gets `leave` from the same hook).
- Test: `apps/web/src/screens/__tests__/back-navigation.test.tsx` (create)

**Interfaces:**
- Consumes: `useBack(parent)`.
- Parents: details, approvals, ratings and forms → `base` from `useTrip(tripId)`; the ledger (`preset === 'direct'`)
  → `/trips`.

- [ ] **Step 1: Write the failing tests** in `back-navigation.test.tsx` (render `<App />` via `renderAt(..., { path:
  '*' })`, phone unless stated, `mockApi` with `tripView()` and a `GET /api/me/activity` fixture like
  `groups-activity.test.tsx` uses):
  - `row 3: Activity → group expense → Back returns to Activity`: start `/activity`, click the item → `/t/t-1/expenses/<id>`
    → `button 'Back'` → location `/activity`.
  - `row 4: wide, Activity → group expense → panel × returns to Activity` (`mockMedia({ wide: true })`).
  - `row 5: Activity → ledger expense on a phone → Back returns to Activity`.
  - `expense form opened from Activity's + returns to Activity on Back` (ledger form).
  - `wide: with the panel open, the group's header Back closes the panel first` (`/groups` → group → row → `link 'Back'` → `/t/t-1`, then `Back` → `/groups`).
- [ ] **Step 2: Run** the file. Expected: FAIL (back lands on the trip or `/trips`).
- [ ] **Step 3: Implement.** Replace each `useBackToTrip(...)` / `useLeaveForm(...)` call with
  `useBack(parent).goBack` and delete the helpers. Saving a form keeps calling the same `leave` function (now
  `goBack`).
- [ ] **Step 4: Run** the new file (PASS), then `npx vitest run`. `details.test.tsx` "leaving the details" (6 tests,
  including the scroll test) must pass unchanged. Its `OpenButton` still passes `{ fromList: true }`, which is now
  ignored. That's fine.
- [ ] **Step 5: Stage and commit when asked:** `refactor(web): trip details and forms go back through useBack`.

### Task 4: Screens with one hard-coded back

**Files (parent per the spec §4; each passes it as `back`, so the link gains history behaviour from Task 2):**
- `screens/PersonScreen.tsx` (`/trips`; remove the `?from=` built at :481, so the link is `/t/<id>/people` again)
- `screens/People.tsx` (`href('/settings')`; remove `useSearchParams`, `from` and the regex)
- `screens/BankDetails.tsx` (no trip: `/trips`; trip: `href()`; the success "Back" link uses the same `goBack` via `onClick`)
- `screens/Privacy.tsx` (`/`)
- `screens/GuestBank.tsx` (`href('/people')`; success "Back" links as above)
- `screens/PayScreen.tsx` (`href()`; "Back to trip" and "Back" buttons at :223, :280 → `goBack`)
- `screens/Settings.tsx` (`href()`), `screens/Activity.tsx` (`href('/settings')`)
- Test: `apps/web/src/screens/__tests__/back-navigation.test.tsx` (extend)

- [ ] **Step 1: Write the failing tests** (one per row, each "enter from X, press Back, land on X"):
  - `row 1: person → group → Back returns to the person` (`/people/p%3Ap-tuan` → group row → `link 'Back'` → `/people/p%3Ap-tuan`).
  - `row 7: group BalanceCard → /me/bank → Back returns to the group`.
  - `row 8: Groups → account menu → /me/bank → Back returns to Groups`.
  - `row 9: group → privacy → Back returns to the group` (guest under `/j/<token>` too).
  - `row 10: group transfers → guest bank → Back returns to the group`.
  - `row 11: pay screen → guest bank → Back returns to the pay screen`.
  - `row 12: person → People → guest bank → Back → Back returns to the person`.
  - `opened by link, /me/bank Back goes to /trips` (replace).
- [ ] **Step 2: Edit the existing tests that assert `?from=`** (the only allowed edits): `person-screen.test.tsx` ("a
  guest: … Rename or merge link") goes back to expecting `href` `/t/t-dl/people`. In `people-left.test.tsx`, delete
  the `People back arrow` describe added on this branch; the row 12 test covers it.
- [ ] **Step 3: Run** the file. Expected: FAIL for rows 1 and 7–12.
- [ ] **Step 4: Implement** the parents and remove `?from=`.
- [ ] **Step 5: Run** the file (PASS), then `npx vitest run` (all pass).
- [ ] **Step 6: Stage and commit when asked:** `fix(web): every back arrow returns to the page it came from`.

### Task 5: Finished steps and guest pages

**Files:**
- `screens/CreateTrip.tsx:59`: `navigate('/t/<id>', { replace: true })`.
- `screens/Settings.tsx:62` (archive/unarchive): `goBack()` with parent `href()`. `:78` (leave):
  `navigate('/', { replace: true })`.
- `components/AccountMenu.tsx:112` (sign out): `navigate('/', { replace: true })`.
- `screens/WhoAreYou.tsx:137,154`: when the URL has `?next=`, `navigate(target, { replace: true })`. Otherwise
  (opened from "Switch"), `useBack(href()).goBack()`. When `becomeMember` adds a query to `target`, always replace.
- `screens/GuestTrip.tsx:157`, `screens/ViewOnlyTrip.tsx:84`: `backInApp` on `<Screen>`.
- `screens/ExpenseForm.tsx:665` and `components/ExpenseHistoryList.tsx:57` already replace. No change; covered by a
  test.
- Test: `back-navigation.test.tsx` (extend)

- [ ] **Step 1: Write the failing tests:**
  - `create group → the group → Back returns to Groups, not the form` (`/groups` → New group → submit → `link
    'Back'` → `/groups`).
  - `archive from settings returns to the group and Back leaves it` (`/groups` → group → settings → archive → back on
    `/t/t-1` → `Back` → `/groups`).
  - `leave and sign out replace the page` (navigation type `REPLACE`).
  - `Switch → pick a name → back on the group with no extra entry` (guest; after picking, `navigate(-1)` from the
    group leaves the guest trip, i.e. location is the entry before `/j/x`).
  - `row 2: person → a group I only view → Back returns to the person` (`/t/<id>` replaced to `/j/<token>`, arrow
    shown via `backInApp`).
  - `a guest group opened by link has no back arrow`.
  - `new sport expense → its details → Back returns to the group`.
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file (PASS), then `npx vitest run`.
- [ ] **Step 5: Stage and commit when asked:** `fix(web): finished steps drop out of history`.

### Task 6: Home panel close, tab and scroll restore

**Files:**
- `screens/Home.tsx`: `closeDetails` calls `goBack()` (parent `/trips`) when `depth > 0` and `openedAs` has an
  `expense`, `payment` or `income` param (opened from outside Home, e.g. Activity; row 6). Otherwise it clears the
  params with replace, as today.
- `screens/Home.tsx:45`, `screens/MemberTrip.tsx:35`, `screens/GuestTrip.tsx:32`, `screens/ViewOnlyTrip.tsx:26`:
  `useState<'expenses' | 'payments'>('expenses')` → `useEntryState<'expenses' | 'payments'>('tab', 'expenses')`.
- Check `screens/MyActivity.tsx` and `screens/Activity.tsx` for any other view state (filters, expanded sections). Move
  each one to `useEntryState` and list them in the task report.
- Test: `back-navigation.test.tsx` (extend)

- [ ] **Step 1: Write the failing tests:**
  - `row 6: wide, Activity → ledger item → × returns to Activity`.
  - `selecting rows on Home then × stays on Home` (wide; open from Home's own list, × → `/trips`, no param).
  - `group page comes back on Payments after details` (phone: Payments tab → open a payment → `Back` → the Payments
    tab is selected).
  - `Home comes back on Payments after a ledger payment` (phone).
  - `group page comes back at its scroll position after details` (stub `scrollY` 300 → open → back → `scrollTo` last
    `(0, 300)`).
  - `a new visit to the group starts on Expenses` (Groups → group (Payments) → Back → open the group again → Expenses).
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file (PASS), then `npx vitest run`.
- [ ] **Step 5: Stage and commit when asked:** `feat(web): pages come back on the same tab and scroll`.

### Task 7: End-to-end walk and map update

**Files:**
- Create: `e2e/back-navigation.spec.ts` (follow `e2e/quick-expense.spec.ts` for sign-in and setup).
- Modify: `docs/navigation-map.md`: §3 exits describe `useBack`. In §4, mark each row resolved, or kept with the
  reason (row 20, the no-access page: kept, nav only). §6 lists the single mechanism.

- [ ] **Step 1: Write the e2e:** create a group with a person and an expense, then open `/trips` → the person row (`/people/<key>`) →
  the group → scroll down → the expense → on-screen `Back` → the group at the same scroll → `Back` →
  `/people/<key>` → `page.goBack()` (browser back) → `/trips`. Then open the group URL in a new page (no history) → `Back` →
  `/groups`.
- [ ] **Step 2: Run** `npm run e2e` from the repo root. Expected: the new spec passes, and the existing specs still pass.
- [ ] **Step 3: Update the map** as described.
- [ ] **Step 4: Run** `npx vitest run` and `npx tsc --noEmit -p .` in `apps/web`. Expected: all pass, no type errors.
- [ ] **Step 5: Stage and commit when asked:** `test(e2e): back navigation walk; map updated`.
