# Back navigation: "back returns to the page I came from"

Date: 2026-10-31 · Branch: `feat/no-group-expenses` · App: `apps/web`
Evidence: `docs/navigation-map.md` (route audit: 42 routes, 8 back mechanisms, 20 mismatch rows).
Supersedes: the line in `2026-10-31-home-navigation-design.md` §"Every place that sends someone to `/trips`" that
lists "the back from a group" as landing on the main screen. Back from a group now follows this document.

## 1. Intent

While testing on Chrome, the owner kept finding back arrows that went to the wrong place. Each fix revealed another
one:

- group page → back went to `/trips`, not `/groups`;
- `/people/<key>` → "Rename or merge" → `/t/<id>/people` → back went to the group's settings;
- `/people/<key>` → a group → back went to `/groups`, not `/people/<key>`.

The audit found the cause. Most screens hard-code **one** back address (`<Screen back="/…">`), but many screens can be
opened from several places. The app uses eight different back mechanisms side by side. Patching one screen at a time
won't converge, so the owner asked for one rule for the whole app.

**The rule, in the owner's words: back should always return to the page I came from.**

## 2. Decisions the owner made

1. **Back = the page you came from, everywhere.** This covers the on-screen back arrow and the phone's or browser's
   back button, and the two must agree.
2. **The page you go back to comes back as you left it: the same tab (Expenses / Payments) and the same scroll
   position.** The owner chose this over "the right page is enough for now", knowing it is the bigger job. It also
   applies to the wide panel: if a panel was open when you left, it is open again.
3. **No app page behind (opened from a shared or Zalo link, typed, or the first page of the visit): back goes to the
   screen's natural parent** (§4), e.g. a group goes to Groups and an expense to its group.
4. **Finished forms drop out of history.** After you create a group, save an expense, archive a group or pick your
   name, back skips the form. It goes to where you were before you opened the form.
5. **Switching tabs (Home / Groups / Activity) does not pile up back presses.** Tabs are places, not steps.

## 3. Goals, non-goals, anti-goals

**Goals**

- One shared mechanism decides what "back" does. A screen only declares its natural parent.
- Every confirmed mismatch in `docs/navigation-map.md` §4 (rows 1, 3–12) is resolved. The suspected rows (2, 15–20)
  are resolved or explicitly kept, with a reason.
- The on-screen arrow never adds a history entry. Arrow then system back must not ping-pong
  (`/groups → /t/x → /groups → /t/x`).
- The rule holds on phones and on wide screens (≥1024px), for members (`/t/…`) and guests (`/j/…`), and for the ledger
  (quick expenses, `preset === 'direct'`).

**Non-goals**

- No visual change: same arrow, same place, same look. No route renames, no new screens.
- No change to what the wide panel shows, or to Home's `?expense=` selection model (only to how they're left).
- Sign-in/OAuth round trips keep their `returnTo` / `?next=`. They don't have to restore the history behind them.

**Anti-goals (a failure even if it "works")**

- **The back arrow takes the user out of the app** (to Zalo, a blank tab, or Google sign-in) when they opened a link
  straight into a screen. It must go to the natural parent instead.
- Back drops the user into a filled-in or already-submitted form.
- A screen grows its own one-off back logic again (new `?from=`-style params, new hard-coded backs).
- Tests that select by `fsl-*` classes or `data-testid`, or that find the back link by role and name, break needlessly.

## 4. Natural parents (the fallback when nothing of the app is behind)

| Screen | Natural parent |
|---|---|
| Home `/trips`, Groups `/groups`, Activity `/activity` | none (tabs: no back arrow) |
| `/` Landing, `/r/:token` request page | none |
| `/trips/new` | `/groups` |
| `/people/:key` | `/trips` |
| `/me/bank` | `/trips` |
| `/privacy` | `/` (Landing already sends signed-in users on to `/trips`) |
| Member group page `<base>` | `/groups` |
| Guest / view-only group page `<base>` under `/j/…` | none (it is the guest's top) |
| `who` | none (as today) |
| Details `expenses/:id`, `payments/:id`, `fund/:id`; `approvals`; `ratings` | the group page (ledger: `/trips`) |
| `expenses/new`, `expenses/:id/edit`, `fund/:id/edit` | the group page (ledger: `/trips`) |
| `pay/:toId`, `bank`, `settings` | the group page |
| `people`, `activity` (group) | `<base>/settings` |
| `people/:pid/bank` | `<base>/people` |

`<base>` is `/t/<id>` or `/j/<token>` from `useTrip()`, as today. The ledger's group page redirects to `/trips`, so
any parent that is "the ledger's group page" ends up on Home. That's fine.

## 5. The mechanism (my call; the builder may refine the details)

### 5.1 Knowing whether an app page is behind

`location.key !== 'default'` (what `useLeaveForm` uses today) is **not enough**. A replace-redirect gives the first
page a new key. For example, a shared `/j/<token>` link that `TripRoute` replaces to `/t/<id>`, or Landing replacing
to `/trips`, would then look as if the app had a page behind it, and `navigate(-1)` would leave the app. That's the
anti-goal.

So the app keeps its own **history depth**:

- A small tracker at the router root (inside `BrowserRouter`, `main.tsx`) watches `useLocation()` +
  `useNavigationType()`. It records `depth` per `location.key` in `sessionStorage` (per tab, survives reload):
  - `PUSH` → `depth(previous key) + 1`
  - `REPLACE` → `depth(previous key)` (same slot)
  - `POP` → whatever is stored for that key. An unknown key, i.e. the first load or an entry from before the
    tracker existed, counts as `0`.
- **An app page is behind iff `depth > 0`.**
- The storage access is wrapped in try/catch. If storage is unavailable, everything counts as depth 0, so the app
  falls back to the parent, never out of the app.

### 5.2 One hook, one arrow

- `useBack(parent?: string): { href: string | undefined; onBack: () => void }`. When `depth > 0` it runs
  `navigate(-1)`; otherwise `navigate(parent, { replace: true })`. When there is no parent and nothing is behind,
  there's no back.
- `<Screen>` keeps its `back` prop, now meaning **the natural parent**. It still renders a `<Link to={parent}>`, so
  the href is correct, middle-click works and existing tests that check the link's `href` keep passing. Its click
  handler calls `preventDefault()` and runs `onBack`. The `onBack` prop goes away, or becomes a thin alias, as the
  builder prefers.
- The arrow is shown when there is a parent **or** `depth > 0`. That gives guest and view-only group pages an arrow
  when the user came from inside the app (e.g. `/people/<key>` → a group where they're a viewer; mismatch row 2), and
  none when they arrived by link.
- `useBackToTrip`, `useLeaveForm`, the `fromList` router-state marker (`lib/detailsNav.ts`) and `?from=` on People
  (`People.tsx`, `PersonScreen.tsx`) are replaced by `useBack`. In-page "Back" / "Back to trip" buttons
  (PayScreen, BankDetails, GuestBank, the details' not-found state) use the same hook.

### 5.3 Forms and other finished steps

- **The result is the page you came from** (save or cancel an expense or income; archive or unarchive from Settings →
  the group): `onBack()`, i.e. `-1` if something is behind, else replace with the parent. `Settings.tsx:62` changes
  from push to this. *(My call, from the review:)* the bank screens (`/me/bank`, `bank`, `people/:pid/bank`) keep
  their success message in place after saving. Only their "Back" links and arrow use the hook.
- **The result is a new page** (create group → the new group; a new sport expense → its details; rollback → the
  restored details): **replace** the form's entry with the result. Back from the result then goes to where the form
  was opened from. Applies to `CreateTrip.tsx:59`, `ExpenseForm.tsx:665`, `ExpenseHistoryList.tsx:57`.
- **Picking a name (`WhoAreYou.tsx:137,154`)** *(my call)*: opened from the guest group's "Switch" (no `?next`), the
  result is the group right behind, so use `onBack()`. Opened by the guard redirect (`?next=`, which replaced the
  page), replace `who` with the target. Either way you never get two copies of the group page in a row, and the
  tracker doesn't need to store paths.
- **Leaving a group (`Settings.tsx:78`) and signing out (`AccountMenu.tsx:112`)** *(my call)*: replace with `/`
  instead of pushing. Older entries in the browser history may still point into the group, or into signed-in pages.
  That's acceptable: those pages already show no-access or send you to Landing. There's no "reset history" mechanism.

### 5.4 Tabs

- A tab tap (AppNav footer or side panel) from **a tab screen** replaces the current entry. From a **deeper screen**
  it pushes, so system back returns to that screen. Tab screens show no back arrow, as today.

### 5.5 Wide screens

- Opening details, approvals or ratings in the right panel pushes (as today). Switching rows inside an open panel
  replaces (as today). Panel × and Esc call `onBack()`. The group header's arrow also calls `onBack()`, so with a
  panel open it closes the panel first (mismatch row 19, resolved by the rule).
- Home's wide `?expense=` selection: opening a row and closing the panel currently replace. That stays. Activity →
  a ledger item opens `/trips?expense=<id>` by push, and the panel's × then returns to Activity (row 6). The builder
  decides how Home's close tells "opened here" from "opened by a link": e.g. `depth > 0` plus the previous path, or
  simply calling `onBack()` when the entry was pushed from outside Home.

### 5.6 Redirects

Replace-redirects stay replace (TripRoute `/t` ↔ `/j`, ledger → Home, TripsRoute → `/groups`, OldExpenseLink,
signed-out guards, Home's phone redirect). The tracker treats them as the same slot, so depth is preserved.

### 5.7 Restoring the page as it was left (tab and scroll)

Today the Expenses / Payments tab is plain `useState` (`Home.tsx:45`, `MemberTrip.tsx:35`, `GuestTrip.tsx:32`,
`ViewOnlyTrip.tsx:26`). On phones the group page unmounts when details open (`TripRoute.tsx`), so going back resets
it to Expenses at the top. Scroll is only kept between one group's own pages (`useListScroll`, `lib/detailsNav.ts`).
`<ScrollRestoration>` needs a data router, which §6 rules out.

The design: **view state belongs to the history entry**, stored alongside the depth, keyed by `location.key` in
`sessionStorage`.

- **`useEntryState<T>(name, initial)`**: like `useState`, but the value is saved on the current entry. A page that
  is returned to (POP), or reloaded, reads it back. A new visit (PUSH) starts from `initial`. All four tabbed screens
  use it for the tab. Any other per-screen view choice the builder finds (e.g. a filter or an expanded section on
  Activity) uses it too. **No URL change**, so addresses and tests stay as they are.
- **Scroll**: the tracker saves `window.scrollY` for the entry being left, read before the next page renders (as
  `useListScroll` does today) or by a throttled scroll listener. Then:
  - **PUSH**: the new page starts at the top.
  - **REPLACE**: e.g. switching rows in the wide panel, or a redirect. Scroll stays where it is.
  - **POP / back**: the page restores its saved position **once its content is on screen**. A page whose lists load
    asynchronously restores after they render, not on the skeleton. The builder picks the "ready" signal, e.g. a
    `useRestoreScroll(ready)` that each screen calls with its loading flag, with a cap of a few frames or retries if
    the document isn't tall enough yet.
  - `useListScroll` is replaced by this.
- **Wide panel**: an open panel is part of the address (`expenses/:id`, `/trips?expense=`), so going back to that
  entry reopens it by itself.
- The stored records are pruned so `sessionStorage` doesn't grow without limit, e.g. keep the newest ~100 entries.

## 6. Constraints

- React Router v7 with `<BrowserRouter>` (no data router), as today. Don't switch routers for this.
- Follow `CLAUDE.md`: shadcn + app wrappers, theme only in `globals.css`. Keep `fsl-*` classes and `data-testid`s on
  the same elements. Back links keep their accessible name ("Back" / "Quay lại").
- Tests: existing tests may change only where they assert the old wrong destination (e.g. People's `?from` hrefs).
  Each changed assertion is called out in review.
- The `?from=` added to `PersonScreen`/`People` earlier today on this branch (uncommitted) gets removed by this
  work. Today's `/groups` back fixes for MemberTrip and CreateTrip stay: those are now their natural parents.

## 7. Acceptance

- Unit tests for the depth tracker: push, replace, pop, reload (known key), first load (unknown key), storage
  throwing. Also tests for `useEntryState` and the scroll save/restore (new visit at the top, back restores, restore
  waits for content).
- Screen tests: on a group page (phone and wide) and on Home, switch to Payments, scroll, open an item, go back:
  Payments is still the tab and the scroll position is back.
- Screen tests, one per confirmed mismatch row in `docs/navigation-map.md` §4: enter from the listed page, press
  the arrow, land on the opener. Plus the "opened by link" case for a few screens (lands on the natural parent, and
  stays in the app).
- One Playwright e2e that walks `/people/<key>` → group → expense → back → back → back and checks each address,
  including the browser back button.
- `docs/navigation-map.md` updated: §3 exits and §4 rows marked resolved.

## 8. Left to the builder

- File and hook names, whether the tracker is a component or a hook in `App`, and the storage key format.
- Exactly how `<Screen>`'s props change (`back` as parent; `onBack` removed or aliased).
- How Home's wide panel decides between `onBack()` and clearing the param (§5.5).
- The "content is ready" signal for scroll restore, and the pruning limit (§5.7).
- The order of migration, screen by screen, as long as each step leaves the tests green.
