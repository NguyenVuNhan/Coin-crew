# Person History, Part 2 (owner feedback) Implementation Plan

> **For agentic workers:** execute with the `orchestration` skill: Orca workers on Claude Code, `--worktree current`, sequential, with a 20-minute pause between tasks (owner). Tasks 11, 12, 13 and 15 → `claude-opus-5-5`; task 14 → `claude-sonnet-5-5`. Workers may add tests and run them, never edit existing tests (except where a task says the planner allowed it), never use git, LF line endings only.

**Goal:** Rework the person-history UI after the owner's 2026-11-12 feedback:
- the person page becomes one ledger whose rows open a sheet
- group transfer rows link to the person page
- `/r` takes the group pay page's layout, with the ledger in a sheet

**Spec:** `docs/superpowers/specs/2026-11-11-person-history-design.md`, plus the "Part 2" section added on 2026-11-12. Part 1's plan: `docs/superpowers/plans/2026-11-11-person-history.md` (Tasks 1–10 done).

## Global Constraints (in addition to Part 1's)

- No money-logic changes.
- Reuse `HistoryList`, `PersonTotal`, `Sheet` (`@cc/web-ui/components/Sheet`: `open, onClose, title, children`), `Amount` and `Button`.
- Keep the existing `fsl-*` classes and `data-testid`s.
- New copy (en / vi, vi marked `// REVIEW`):

| key | en | vi |
|---|---|---|
| `history.total` | `Total` | `Tổng` |
| `history.openGroup` | `Open {group}` | `Mở {group}` |
| `request.covers` | `What this covers ({count})` | `Gồm những khoản nào ({count})` |

## Review Focus

1. **A person with three quick-expense places** (own, merged, theirs): one "Quick expenses" ledger row whose amount is the sum, and whose sheet lists all their lines tagged.
2. **`?open=<tripId>` for a trip the person has no open item in:** no sheet, no crash.
3. **`/people/in/<trip>/<pid>` for a guest linked to a ledger person:** it lands on the canonical `/people/<key>?open=<trip>`.
4. **`/r` with no bank details, with a waiting settlement, and when settled:** the same states as today, in the PayScreen layout.
5. **"They owe you" row in Your transfers:** tapping the tick still records "received" and does not navigate.

---

### Task 11: History for group places in mode 'all'

**Files:** `apps/api/src/me/history.ts`, test `apps/api/test/person-history-groups.test.ts` (new).
- `loadPersonHistory` fills `history` for **every** place, groups included. Same `historyOf`, and no new queries (the snapshots are already loaded).
- Update the `HistoryPlace.history` doc comment in `libs/shared/core/src/api-types.ts`.
- Test: mode 'all' with a fewest-transfers group → the group place has `history.gap.kind === 'reroute'`, and the direct place still has its lines.
- Existing `person-history.test.ts` asserts `history null` for group places. **The planner allows updating that one assertion** to expect a history object.
- Verify: `npx nx test @cc/api`, `npm run typecheck`.

### Task 12: `PersonLedger` and `PlaceSheet` components

**Files:** create `libs/web/screens/src/components/PersonLedger.tsx`, test `libs/web/screens/src/components/__tests__/person-ledger.test.tsx`.

```ts
export interface LedgerPlace {
  /** 'direct' merges every direct place into one row. */
  id: string;               // tripId, or 'direct'
  kind: 'group' | 'direct';
  label: string;            // group name, or t('person.quickExpenses') / t('request.quickExpenses', { owner })
  amount: number;           // owner's view
  lines: HistoryLine[];     // newest first (merged for 'direct')
  summary: { twoWay: number; suggested: number; gap: HistoryGap | null; viaName?: string | null } | null;
  theirsTripIds?: Set<string>;
  groupHref?: string;       // '/t/<tripId>' for groups on the person page; omitted on /r
}
export function toLedgerPlaces(places: HistoryPlace[], labels: { quickExpenses: string }): LedgerPlace[]; // pure: merges direct places (sum amounts, merge+sort lines, theirsTripIds from source 'theirs'), keeps groups in input order; summary only for groups with a gap
export function PersonLedger(props: {
  places: LedgerPlace[];
  otherName: string;
  perspective?: 'owner' | 'other';
  /** 'sheet': a row opens PlaceSheet (person page). 'inline': a row expands its compact lines in place (inside the /r sheet). */
  open: 'sheet' | 'inline';
  /** Person page: the place whose sheet is open (controlled, for ?open=). */
  openId?: string | null;
  onOpenChange?: (id: string | null) => void;
}): JSX.Element;
```

- **The ledger:** one white `rounded-xl` list, root `fsl-ledger`. Each row is `fsl-ledger__row`, `data-testid="ledger-row-<id>"`, a `button` `min-h-11` showing the label, the signed `Amount` (+/− like `HistoryList`, Leaf/Lychee) and a chevron-right (`'sheet'`) or chevron-down/up (`'inline'`). The last row is `fsl-ledger__total` with `history.total` and the sum of the amounts, as a non-button.
- **`PlaceSheet`** (internal, `'sheet'` mode): `Sheet` titled with the label, then `HistoryList` (`summary`, `theirsTripIds`, `otherName`, `perspective`). For groups with `groupHref`, it ends with a ghost `Button href={groupHref}` showing `history.openGroup` with `{ group: label }` (`data-testid="ledger-open-group"`).
- **`'inline'` mode:** tapping a row toggles `HistoryList compact` under it, plus the summary when set. `aria-expanded` is on the row button.
- **Tests:**
  - `toLedgerPlaces merges three direct places into one row with the summed amount and all lines newest first, tagging theirs`
  - `total row equals the sum`
  - `sheet mode: tapping a row opens a dialog titled with the label and shows its lines and Between you two`
  - `sheet mode: group sheet has Open <group> link to groupHref`
  - `inline mode: tapping toggles the compact list`
  - `perspective other flips the row colour`
- **Verify:** `npx nx test @cc/web-screens -- person-ledger style-guard`, typecheck, lint.

### Task 13: Person page uses the ledger

**Files:** `libs/web/screens/src/screens/PersonScreen.tsx`, `libs/web/screens/src/screens/PersonGroupHistory.tsx`, `libs/web/screens/src/App.tsx` (route kept), test `libs/web/screens/src/screens/__tests__/person-ledger-screen.test.tsx` (new).

- **The ledger replaces the rows:** in `PersonAll`, the `fsl-person__items` rows and the `DirectHistory` section are replaced by `PersonLedger open="sheet"` fed by `toLedgerPlaces(usePersonHistory(key).data.places)`.
  - Keep a wrapper `div.fsl-person__items` holding the ledger.
  - Each row keeps the old `data-testid="person-item-<tripId>"` on the row button: for the merged direct row, the first direct place's tripId. So `PersonLedger` must accept an optional `testIdOf(place)` prop, or Task 12's row testid gets reused. Pick one, and say which.
  - Group places get `groupHref: '/t/<tripId>'`.
  - While the history loads, show `SkeletonList`. On error, show `InlineError` with retry.
  - Waiting, Merged here and the actions stay as they are.
- **`?open=<tripId>`:** opens that place's sheet (the `'direct'` id when the tripId is a direct place). Closing it removes the param with `replace`.
- **`/people/in/:tripId/:pid`:** `PersonGroupHistory` becomes a redirect. It calls `useGroupPersonHistory`, then `navigate('/people/<encodeURIComponent(key)>?open=<tripId>', { replace: true })`. It shows `SkeletonList` while loading and `InlineError` on error. Delete its old screen body and `PersonTotal` only if nothing else uses them.
- **Existing tests:**
  - **The planner allows updating** `back-navigation.test.tsx` "row 1", "Switch → pick a name", and "row 2": after clicking `person-item-t-1` they also click `ledger-open-group` in the sheet. They must add the history-endpoint mocks they need, and nothing else changes.
  - `person-screen.test.tsx` "shows three items…" may get the history mock added; its assertions stay.
  - Remove Part 1's `person-history.test.tsx` cases that test the deleted group screen. Replace them with the redirect test (that file is ours, from Task 6).
- **Tests:**
  - `ledger rows and total render; tapping Quick expenses opens a sheet with its lines`
  - `?open=t-1 opens the group sheet with Between you two`
  - `/people/in/t-1/p-binh redirects to /people/<key>?open=t-1`
  - `closing the sheet drops ?open`
- **Verify:** the whole `@cc/web-screens` suite, typecheck, lint.

### Task 14: "Your transfers" rows link to the person page

**Files:** `libs/web/screens/src/components/YourTransfers.tsx`, test `libs/web/screens/src/components/__tests__/transfer-person-link.test.tsx` (new).

- **When:** for a signed-in member (`view.me.kind === 'member'` and `useMe().data?.user`) and a row where **they owe me** (`row.toId === me`).
- **Main area:** a link (react-router `Link`, `data-testid="transfer-person-<fromId>"`) to `/people/in/<tripId>/<fromId>`, which Task 13 redirects to the sheet.
  - It replaces the expand/QR toggle and the chevron (use chevron-right instead).
  - The leading tick button stays exactly as it is, outside the link, so ticking never navigates.
  - Swipe actions stay.
- **Unchanged:** rows where I owe (expand to the QR, with "See history" in the panel), guests, viewers, and rows not involving me.
- **Tests:**
  - `member, they owe me: row links to /people/in/t-1/p-binh and has no QR panel`
  - `member, I owe: row still expands`
  - `ticking does not navigate`
  - `guest: unchanged`
- **Verify:** the whole `@cc/web-screens` suite, typecheck, lint.

### Task 15: `/r` in the pay page layout

**Files:** `libs/web/screens/src/screens/RequestPage.tsx` (remove `RequestCovers` usage; delete `components/RequestCovers.tsx` and its test only if unused), test `libs/web/screens/src/screens/__tests__/request-layout.test.tsx` (new).

- **Layout:** match `PayScreen.tsx` (`/j/<token>/pay/<id>`) for the paying states.
  - Screen title `t('pay.title', { name: owner })`.
  - The hero amount (`fsl-pay__hero` styling), then `PayQr` (or the no-bank block, mirroring PayScreen's `bankNone` card copy where the request page has equivalents), then the primary "I've paid" with its hint, then `request.cashHint`.
  - Reuse PayScreen's class names and markup patterns. Extract small shared pieces into `libs/web/screens/src/components/PayLayout.tsx` if that avoids duplication, without changing PayScreen's output. Its existing tests must pass untouched.
  - Waiting, settled, owner-owes and not-found states keep their current copy and `data-testid`s (`request-waiting`, `request-paid`, `request-single`, `request-netted`, `request-item-*`), placed in the new layout.
  - Every existing `request-page.test.tsx` assertion must still pass. If one can't (a layout-only assertion), stop and `ask`.
- **The ledger:** under "I've paid", a full-width secondary `Button` `data-testid="request-covers"` showing `request.covers` with `{ count: places }`. It opens a `Sheet` (title `history.title`) holding `PersonLedger open="inline" perspective="other"`, fed by `toLedgerPlaces` over the request items. Map `RequestItem` to `HistoryPlace`-like input: `amount`, `lines ?? []`, `gap ?? null`, no `groupHref`. The direct label is `request.quickExpenses` with `{ owner }`.
  - The netted per-place rows that `/r` shows today (`request-item-*`) stay inside the sheet's ledger as the row testids, if the existing tests need them on the page. Check `request-page.test.tsx` and keep whatever it asserts visible on the page.
- **Tests:**
  - `request page shows Pay <owner>, the amount, I've paid`
  - `What this covers (3) opens a sheet with 3 rows and the total`
  - `tapping a row in the sheet expands its compact lines`
  - `no bank: shows the no-bank copy`
- **Verify:** the whole `@cc/web-screens` suite, typecheck, lint; e2e `npm run e2e -- person-history` and `npm run e2e -- quick-expense` (the planner runs these).

### Task 16 (planner): check and hand over

- Run `npm test`, typecheck and lint.
- Update `e2e/person-history.spec.ts` (ours) for the ledger and sheet. Run `npm run e2e -- person-history quick-expense back-navigation`.
- Run `npm run seed:local -- --reset`, take 375px screenshots of the person page (ledger + sheet), group transfers, and `/r` (main + sheet), and look at them.
- Update `docs/manual-testing/person-history.md` for the new interactions.
- Tunnel: ask the owner before stopping another worktree's tunnel.
