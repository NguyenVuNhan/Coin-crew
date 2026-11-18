# Entry Flow A (folding page) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On phones, the add-transaction page shows one decision at a time. Amount comes first, then category, then optional details; each finished part folds into a one-line summary that reopens on tap.

**Architecture:** A presentational fold layer sits over the existing `EntryPage` state. A small hook (`useEntryFold`) decides which parts are open. A `FoldLine` component renders a folded part. `EntryPage` wraps its existing blocks (amount, `CategoryPicker`, compact rows, more-details) in fold conditions. Field state, validation, save and the API are untouched. Folding applies only when `!isMousePointer`: the PC layout stays exactly as today.

**Tech Stack:** React 19, react-router, Vitest + Testing Library, Tailwind v4 with the shadcn wrappers in `@cc/web-ui`, and copy in `@cc/web-i18n`.

**Spec:** GitHub issue #136 (brief) and the mockup `docs/superpowers/mockups/2026-11-18-entry-flow-shape.html`, flow A.

## Global Constraints

- Touch layout only. When `useIsMousePointer()` is true, the page renders as today, with no fold UI.
- Keep every existing `data-testid` on the element it marks today. New test ids: `entry-fold-amount`, `entry-fold-category`, `entry-fold-details`.
- New Vietnamese lines carry `// REVIEW` and have an English pair in `en.ts`.
- Wrappers and theme tokens only (DESIGN.md). Touch targets are `min-h-11`; money uses `tabular-nums` through `Amount` or `formatMoney`.
- Don't change `CategoryPicker`, `AmountKeypadDock`, `EntryDateRow` or `PeopleEntry` internals; only decide whether they render.
- **Decisions** (open in #136, settled here):
  - The category tiles stay as `CategoryPicker` shows them today: recent-first, with the transfer and trade tiles.
  - The wallet chip stays in the amount block, and the folded amount line shows the wallet name. Moving it to the top bar is not part of this plan.
- **Entry types:**
  - The Chi / Thu / Vay/Nợ tabs at the top stay exactly as today and are always visible; they are how you switch types.
  - Chi and Thu use the folding page.
  - Switching between them keeps the amount (folded if it was finished), clears the category as today (`handleTabChange`), and reopens the category part.
  - Vay/Nợ keeps its own form (`QuickExpenseEmbed`, people and split) unchanged. Folding it is a follow-up.
- **Test gate:** tests that exist on `origin/main` may NOT be edited until the owner approves the list produced in Task 6. Before that, new behaviour is proven only by new test files.

## Review Focus

1. **Edit mode** (`/entries/:id/edit`): the amount and category start folded with their saved values, and details start expanded. Nothing is hidden that the user came to change.
2. **Validation pointing at a folded part:** an error from save (missing category, oversell, archived wallet) must open the part that holds the problem. `categoryRingActive` opens the category part.
3. **Transfer mode:** the "to/from wallet" rows are required, so they never fold. Only date and note fold. A different-currency transfer folds the amount only after both amounts are filled.
4. **Trade mode:** after the Mua / Bán tile, the asset and quantity rows show unfolded under the category line. The details fold behind them.
5. **Leave guard and draft:** reopening a folded part never clears its value. The leave guard still fires when any value is set.

---

### Task 1: Fold model and FoldLine

**Files:**
- Create: `libs/web/screens/src/components/entryFold.ts`
- Create: `libs/web/screens/src/components/FoldLine.tsx`
- Test: `libs/web/screens/src/components/__tests__/entry-fold.test.tsx` (new)

**Interfaces:**
- Produces:
  - `type FoldPart = 'amount' | 'category' | 'details'`
  - `useEntryFold(opts: { enabled: boolean; isEdit: boolean }): { isOpen(part: FoldPart): boolean; open(part: FoldPart): void; finish(part: FoldPart): void }`
  - `FoldLine(props: { testId: string; label: string; children: ReactNode; onOpen(): void }): JSX.Element`

- [ ] **Step 1: Write the failing tests.**
  - `useEntryFold` with `enabled: false`: `isOpen(x) === true` for all parts.
  - New entry with `enabled: true`: `isOpen('amount')` is true, and `category` and `details` are false.
  - After `finish('amount')`: amount is false and category is true.
  - After `finish('category')`: category is false, and details is still false (details opens only by `open('details')`).
  - Edit with `enabled: true`: amount false, category false, details true.
  - `open('amount')` after finishing reopens it and leaves category's state alone.
  - `FoldLine` renders a `button` with `data-testid`, the label in muted text and the children on the right. Its `onOpen` fires on click, and it has `aria-expanded="false"`.
- [ ] **Step 2: Run them and see them fail.** Command: `npx vitest run src/components/__tests__/entry-fold.test.tsx` in `libs/web/screens`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement.**
  - `useEntryFold`: `useState` holding a `Record<FoldPart, boolean>`, initialised from `isEdit`.
  - `FoldLine`: the white `rounded-xl bg-card` row from the mockup, `min-h-11 px-4 py-3`, label `text-sm text-muted-foreground`, value `text-base font-semibold`.
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Commit:** `feat(screens): entry fold model and FoldLine`.

### Task 2: Amount folds, category waits for it

**Files:**
- Modify: `libs/web/screens/src/screens/EntryPage.tsx`: the amount block (~1215–1375), `handleKeypadDone` (~717), and the `CategoryPicker` render (~1378)
- Modify: `libs/web/i18n/src/vi.ts`, `en.ts`
- Test: `libs/web/screens/src/screens/__tests__/entry-fold-amount.test.tsx` (new)

**Interfaces:**
- Consumes: `useEntryFold`, `FoldLine` (Task 1).
- Produces: `fold` (the hook's return), created once in `EntryPage` with `enabled: !isMousePointer`. Later tasks use the same instance.

- [ ] **Step 1: Write the failing tests** (touch mode, `/entries/new`, expense, VND wallet "Tiền mặt").
  - On load, `amount-display` is visible and `category-grid` is absent.
  - Type 120000 on the keypad and press Xong. Now `entry-fold-amount` shows "120.000₫", `amount-display` is absent, and `category-grid` is visible.
  - Click `entry-fold-amount`: `amount-display` is back, the keypad is open, and the value is still "120.000₫".
  - The investment-wallet chip `amount-wallet-chip` shows inside the folded line as "· Binance" when that wallet is selected.
  - Mouse mode (`media.ts` `mouse: true`): `category-grid` is visible on load, and `entry-fold-amount` never renders.
  - A different-currency transfer stays open after the first amount's Xong, and folds after the second.
- [ ] **Step 2: Run them; they fail.**
- [ ] **Step 3: Implement.**
  - Call `fold.finish('amount')` inside `handleKeypadDone` when `minor > 0` and the transfer isn't waiting on a secondary amount. Keep the existing `pendingFocusTargetRef` logic: the category grid now mounts in the same render, so the focus target still exists.
  - Render `FoldLine testId="entry-fold-amount" label={t('personalEntry.amountBoxLabel')}` in place of the amount block when it's not open.
  - Show `CategoryPicker` only when `fold.isOpen('category')` or the amount is finished.
  - New copy: none (reuse `amountBoxLabel`).
- [ ] **Step 4: Run the new test file and `entry-trade.test.tsx`; both pass.**
- [ ] **Step 5: Commit:** `feat(screens): amount folds after Xong on phones`.

### Task 3: Category folds; transfer and trade lines

**Files:**
- Modify: `EntryPage.tsx`: `handleSelectCategory`, `handleSelectTransfer`, `handleSelectTrade`, and the `CategoryPicker` render
- Modify: `vi.ts`, `en.ts`
- Test: `libs/web/screens/src/screens/__tests__/entry-fold-category.test.tsx` (new)

**Interfaces:**
- Consumes: `fold` (Task 2).

- [ ] **Step 1: Write the failing tests.**
  - After the amount folds, the heading above the grid reads "Chi cho việc gì?" (expense) or "Thu từ đâu?" (income).
  - Picking "Ăn uống" folds the grid: `entry-fold-category` reads "Danh mục" with "Ăn uống" and its icon.
  - Tapping it reopens the grid with "Ăn uống" pressed.
  - Picking the transfer tile shows the fold line "Chuyển sang ví" with `entry-wallet-row` and `entry-to-wallet-row` visible under it.
  - Picking "Mua tài sản" shows the fold line "Mua tài sản" with `entry-asset-row` and `entry-quantity` visible.
  - Tab switch: with the amount folded at "120.000₫" and the category folded at "Ăn uống", tapping `entry-tab-income` keeps `entry-fold-amount` at "120.000₫", opens the grid under "Thu từ đâu?" with nothing pressed, and hides `entry-fold-details`. Tapping `entry-tab-loan-debt` shows today's Vay/Nợ form with no fold lines.
  - Save with no category in an expense (forced through an existing path, e.g. editing amount after a cleared category) leaves the grid open with the error ring.
- [ ] **Step 2: Run them; they fail.**
- [ ] **Step 3: Implement.**
  - Call `fold.finish('category')` at the end of the three select handlers.
  - Open the category part when `categoryRingActive` turns true (a `useEffect` on it).
  - The heading is a `p` with `text-sm text-muted-foreground`, shown only in fold mode.
  - New copy:
    - `'personalEntry.categoryPromptExpense': 'Chi cho việc gì?'` (en `'What was it for?'`)
    - `'personalEntry.categoryPromptIncome': 'Thu từ đâu?'` (en `'Where did it come from?'`)
    - `'personalEntry.categoryLine': 'Danh mục'` (en `'Category'`)
- [ ] **Step 4: Run the tests; they pass.**
- [ ] **Step 5: Commit:** `feat(screens): category folds after a pick on phones`.

### Task 4: Details behind one line

**Files:**
- Modify: `EntryPage.tsx`: the compact rows (~1396–1565) and the more-details block
- Modify: `vi.ts`, `en.ts`
- Test: `libs/web/screens/src/screens/__tests__/entry-fold-details.test.tsx` (new)

**Interfaces:**
- Consumes: `fold` (Task 2).

- [ ] **Step 1: Write the failing tests** (touch, new expense, after amount and category).
  - `entry-fold-details` reads "Hôm nay · Tiền mặt · Không ghi chú" with "Thêm chi tiết".
  - `entry-note-input`, `entry-date-*` and `entry-wallet-row` are absent.
  - Clicking it shows the existing rows and `entry-more-details-toggle`.
  - Editing an entry with note "Phở" dated yesterday: details start expanded, and `entry-note-input` holds "Phở" (Review Focus 1).
  - Folded line with note "Phở" set: it reads "Hôm nay · Tiền mặt · Phở".
  - Transfer: `entry-wallet-row` and `entry-to-wallet-row` are visible and not folded, while date and note are behind `entry-fold-details` reading "Hôm nay · Không ghi chú".
  - The details line shows only after the category is done; before that it's absent.
- [ ] **Step 2: Run them; they fail.**
- [ ] **Step 3: Implement.**
  - Render the date label with the same helper `EntryDateRow` uses for "Hôm nay" / "Hôm qua" / a date. If that helper isn't exported, export it from `EntryDateRow.tsx`.
  - The wallet name is `selectedWallet.name`.
  - Note: the trimmed note, cut to 24 chars with "…", else `personalEntry.noNote`.
  - New copy:
    - `'personalEntry.noNote': 'Không ghi chú'` (en `'No note'`)
    - `'personalEntry.addDetails': 'Thêm chi tiết'` (en `'Add details'`)
- [ ] **Step 4: Run the tests; they pass.**
- [ ] **Step 5: Commit:** `feat(screens): entry details fold behind one line on phones`.

### Task 5: Save names what it saves

**Files:**
- Modify: `EntryPage.tsx`: the `entry-save-btn` label (~1660)
- Modify: `vi.ts`, `en.ts`
- Test: `libs/web/screens/src/screens/__tests__/entry-fold-save.test.tsx` (new)

- [ ] **Step 1: Write the failing tests.**
  - Touch, amount 120000, category Ăn uống: `entry-save-btn` reads "Lưu 120.000₫ · Ăn uống".
  - Transfer: "Lưu 120.000₫ · Chuyển sang ví".
  - Trade: "Lưu 1.000,00 USDT · Mua BTC" when an asset is picked.
  - No category yet: "Lưu".
  - Mouse mode: always "Lưu".
- [ ] **Step 2: Run them; they fail.**
- [ ] **Step 3: Implement.**
  - New copy: `'personalEntry.saveSummary': 'Lưu {amount} · {what}'` (en `'Save {amount} · {what}'`).
  - `amount` = `formatMoney(activeMinor, activeCurrency)`.
  - `what` = the category name, `personalEntry.transferTile`'s text, or the existing trade row label ("Mua {asset}" / "Bán {asset}").
- [ ] **Step 4: Run the tests; they pass.**
- [ ] **Step 5: Commit:** `feat(screens): save button names the amount and category`.

### Task 5b: Fold motion

The motion spec comes from `/impeccable animate`, and its reference is the clickable phone in `docs/superpowers/mockups/2026-11-18-entry-flow-a-storyboard.html`. The thesis: a finished part's value travels into its summary line, and nothing that persists moves.

**Files:**
- Create: `libs/web/screens/src/components/foldTransition.ts`
- Modify: `EntryPage.tsx`, to put the `view-transition-name` style on the elements listed below
- Modify: `libs/web/ui/src/styles/globals.css`, the only stylesheet allowed. Add the `::view-transition-*` rules and the `tile-in` keyframes copied from the mockup's "Motion" block, written with theme tokens.
- Test: `libs/web/screens/src/components/__tests__/fold-transition.test.ts` (new)

**Interfaces:**
- Produces: `runFoldTransition(update: () => void): void`. It calls `document.startViewTransition(() => flushSync(update))` when that exists and reduced motion is off; otherwise it calls `update()` directly.
- Consumes: `fold.finish` / `fold.open` (Tasks 1–4). Every call goes through `runFoldTransition`; typing on the keypad does not.

**Names and timings** (they must not repeat on screen at once):

| Name | Element | Motion |
|---|---|---|
| `entry-amt` | the big amount value and the `entry-fold-amount` value | shared element, 260ms `cubic-bezier(0.16,1,0.3,1)` |
| `entry-cat-ic`, `entry-cat-name` | the tapped tile's icon and label, and the fold line's | shared element, 260ms. Set on the tapped tile just before the transition. |
| `entry-keypad` / `entry-save` | the keypad dock / the BottomBar | keypad drops 160ms ease-in; save rises 220ms with a 60ms delay |
| `entry-tiles` | the category grid | fade in 160ms. Each tile enters in 200ms with an 18ms stagger (≤ 150ms total), first render after a fold only. |
| `entry-details` | the details line and the expanded rows | morph 240ms, rows fade in 200ms |
| `entry-tab` | the active tab trigger | 220ms slide |

**Reduced motion:** groups take 0ms, and old and new crossfade over 120ms linear. Tiles fade without moving, and the button press doesn't scale.

- [ ] **Step 1: Write the failing tests.**
  - `runFoldTransition` calls `update` once, synchronously, when `document.startViewTransition` is missing (jsdom).
  - With a stub `startViewTransition`, it passes a callback that runs `update`.
  - With `matchMedia('(prefers-reduced-motion: reduce)')` true, it skips the stub.
  - In `EntryPage`, after Xong, the `entry-fold-amount` value has the style `view-transition-name: entry-amt`, and `amount-display` is gone.
- [ ] **Step 2: Run them; they fail.**
- [ ] **Step 3: Implement** per the table. Names go on inline `style` only in fold mode (`!isMousePointer`).
- [ ] **Step 4: Run the tests and `style-guard.test.ts`; both pass.**
- [ ] **Step 5: Check by eye in Chrome at 375px:** each fold, tab switch, details expansion, and the same with reduced motion on. Check also that there's no "duplicate view-transition-name" console error.
- [ ] **Step 6: Commit:** `feat(screens): fold transitions on the entry page`.

### Task 6: Main-test gate, then the full suite

**Files:**
- Test: the tests on `origin/main` that fail (list them; edit only after approval)

- [ ] **Step 1: Run** `npx nx run-many -t test -p @cc/web-screens` (foreground, nothing else running). Collect every failing test file and test name.
- [ ] **Step 2: For each failure, record in `.superpowers/entry-fold-main-tests.md`:** file, test name, the old expectation, and why folding changes it (e.g. "expects `category-grid` on load"). Also propose the minimal edit, usually "finish the amount first" via a shared helper `finishAmount(user, '120000')` in `libs/web/screens/src/test/entry.ts` (new file).
- [ ] **Step 3: STOP and ask the owner to approve the list.** Do not edit any `origin/main` test before approval.
- [ ] **Step 4: After approval, apply exactly the approved edits.** Run `npx nx run-many -t test typecheck lint -p @cc/web-screens @cc/web-i18n`. Expected: all pass.
- [ ] **Step 5: Commit:** `test(screens): entry tests finish the amount before picking (owner-approved)`.

### Task 7: Walkthrough on a real build

- [ ] **Step 1:** `npm run build -w @cc/web`, then `npm run e2e -- e2e/<entry spec>`. Run only when no tunnel is up, or restart the tunnel afterwards.
- [ ] **Step 2:** Start the tunnel detached (memory `finish-branch-pr-and-tunnel`). Then walk through on a 375px headless browser: new expense, transfer, trade, and edit. Check for page errors.
- [ ] **Step 3:** Push the branch `feat/entry-flow-fold`, open a PR into `main` that closes #136, and hand the tunnel URL to the owner.
