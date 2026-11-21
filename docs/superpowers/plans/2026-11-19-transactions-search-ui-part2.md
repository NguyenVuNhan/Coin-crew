# Transactions search UI (Part 2 of 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo, implementation tasks run as Orca workers per the `gemini-execution` skill.

**Goal:** Rebuild the `/transactions` search flow: a search bar in the body with `#tag` chips, a tappable period row with a "When" sheet, an advanced-filters sheet with pick views instead of chip walls, clear filter states, and all-time search over the saved copy from Part 1.

**Architecture:** `TransactionsScreen` keeps the URL as the single source of filter state. New focused components in `libs/web/screens/src/components/transactions/` (search bar, period row, When sheet, pick view) replace the header icon and the chip walls; pure date maths lives in `@cc/web-util`. Search mode (text or tag, no range) renders the whole history from `useCopyList` with client-side windowing.

**Tech Stack:** React 19, react-router `useSearchParams`, Tailwind v4 + shadcn (`InputGroup`), app wrappers (`Sheet`, `Button`, `Pill`, `Icon`), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-19-transactions-search-flow-design.md` (sections "Page layout", "When sheet", "Advanced-filters sheet", "States and ranges", "Copy", "Tests and testids").

**Depends on:** Part 1 plan `docs/superpowers/plans/2026-11-19-transactions-saved-copy-part1.md` merged (`useTxCopy`, `useCopyList`, `foldForSearch`).

## Global Constraints

- Read `DESIGN.md` and `PRODUCT.md` before UI work. Theme colours only (`bg-card`, `bg-primary`, `text-muted-foreground`, …); no raw hex, no per-component `.css` (style-guard test).
- App wrappers first: `Button`, `Sheet`, `Pill`, `Icon`; never shadcn `Drawer`/`Dialog` directly. New shadcn parts only via `npx shadcn@latest add` in `libs/web/ui`.
- Touch targets ≥ 44px (`min-h-11` / `size-11` hit area); fields `text-base`; money `tabular-nums`; motion 100–200ms ease-out with `motion-reduce:`.
- Keep every `fsl-*` class and `data-testid`. Moved: `tx-filter-search` → the body search input; `tx-filter-btn` → the advanced-filters button in the search bar.
- New Vietnamese copy in `libs/web/i18n/src/vi.ts` marked `// REVIEW`, English in `en.ts`.
- Implementers add new tests only; existing tests are adjusted by the planner (Task 9).
- URL params unchanged: `month, q, tagId, walletId, categoryId, assetId, type, from, to`, written with `replace: true`.
- Weeks run Monday–Sunday.

## Review Focus

1. **Typing `#` mid-text** (`cà phê #an`): suggestions use the word under the caret; picking keeps the rest of the text. Task 3 test.
2. **Back/forward or a pasted URL with `q` and `tagId`**: the box shows the text and the chip on load. Task 3 test.
3. **A tag id in the URL that no longer exists**: the chip shows the raw id like today's pill does, and × removes it. Task 3 test.
4. **Search mode with thousands of matches**: renders 50 rows first, more on scroll, no freeze. Task 7 test with 2,000 rows.
5. **Range set while searching**: search stays inside the range and the range button shows. Task 4 test.

---

### Task 1: Date maths and copy strings

**Files:**
- Create: `libs/web/util/src/dateRanges.ts`
- Modify: `libs/web/i18n/src/vi.ts`, `libs/web/i18n/src/en.ts`
- Modify: `libs/web/ui/src/components/icons.tsx` (add `sliders` → lucide `SlidersHorizontal`, `searchX` → lucide `SearchX`)
- Test: `libs/web/util/src/__tests__/dateRanges.test.ts`

**Interfaces:**
- Produces:
```ts
export type QuickRange = 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'last30';
export function quickRangeDates(range: QuickRange, today: string): { from: string; to: string };
export function matchQuickRange(from: string | undefined, to: string | undefined, today: string): QuickRange | null; // only for the from/to ranges: thisWeek, lastWeek, last30
export function formatRangeLabel(from: string | undefined, to: string | undefined, today: string): string; // "12/11 – 19/11/2026"; one date when equal; year on both ends when they differ
export function validateRange(from?: string, to?: string, opts?: { maxDays?: number }): 'ok' | 'fromAfterTo' | 'tooLong';
```
- Rules: weeks Monday–Sunday; `thisWeek` and `thisMonth` end today; `last30` = today and the 29 days before; `thisMonth`/`lastMonth` are used as months by the screen (they still return dates for the label). `tooLong` = more than `maxDays` inclusive days after filling a missing end like the server (`listPeriod`).
- Copy keys (vi / en):
  - `transactions.searchPlaceholder` → "Tìm theo ghi chú hoặc #thẻ" / "Search notes or #tag" (replaces the old value)
  - `transactions.searchSubmit` "Tìm" / "Search"; `transactions.clearSearch` "Xóa nội dung tìm" / "Clear search text"; `transactions.advancedFilters` "Bộ lọc nâng cao" / "More filters"
  - `transactions.noTagMatch` "Không có thẻ nào khớp" / "No matching tags"
  - `transactions.clearAll` "Xóa tất cả" / "Clear all"
  - `transactions.allTime` "Mọi lúc" / "All time"; `transactions.clearRange` "Bỏ khoảng thời gian" / "Clear date range"
  - `transactions.whenTitle` "Chọn thời gian" / "Choose dates"; `transactions.quickThisWeek` "Tuần này" / "This week"; `transactions.quickLastWeek` "Tuần trước" / "Last week"; `transactions.quickThisMonth` "Tháng này" / "This month"; `transactions.quickLastMonth` "Tháng trước" / "Last month"; `transactions.quickLast30` "30 ngày qua" / "Last 30 days"
  - `transactions.customRange` "Tùy chọn" / "Custom"; `transactions.rangeFromAfterTo` "Ngày bắt đầu phải trước ngày kết thúc" / "Start date must be before end date"; `transactions.rangeTooLong` "Chọn tối đa 1 năm" / "Pick at most 1 year"
  - `transactions.loadingHistory` "Đang tải toàn bộ lịch sử để tìm…" / "Loading your full history to search…"
  - `transactions.backToFilters` "Quay lại bộ lọc" / "Back to filters"; `transactions.loadMore` "Xem thêm" / "Show more"

- [ ] **Step 1: Write the failing tests** with `today = '2026-11-19'` (a Thursday): `thisWeek → 2026-11-16..2026-11-19`; `lastWeek → 2026-11-09..2026-11-15`; `lastMonth → 2026-10-01..2026-10-31`; `last30 → 2026-10-21..2026-11-19`; `lastWeek across a year: today 2026-01-01 → 2025-12-22..2025-12-28`; `matchQuickRange('2026-11-09','2026-11-15') === 'lastWeek'`; `matchQuickRange('2026-11-09','2026-11-14') === null`; `formatRangeLabel('2026-11-12','2026-11-19') === '12/11 – 19/11/2026'`; `formatRangeLabel('2026-11-19','2026-11-19') === '19/11/2026'`; `formatRangeLabel('2025-12-20','2026-01-05') === '20/12/2025 – 05/01/2026'`; `validateRange('2026-11-20','2026-11-19') === 'fromAfterTo'`; `validateRange('2025-01-01', undefined, { maxDays: 366 })` with today 2026-11-19 → `'tooLong'`.
- [ ] **Step 2: Run** `npm test -w @cc/web-util -- dateRanges` — Expected: FAIL.
- [ ] **Step 3: Implement** the helpers, strings and icons.
- [ ] **Step 4: Run** — Expected: PASS; `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(web): date ranges, copy and icons for transaction search (#133)`

### Task 2: URL state helper for the screen

**Files:**
- Create: `libs/web/screens/src/components/transactions/useTxParams.ts`
- Test: `libs/web/screens/src/components/transactions/__tests__/useTxParams.test.tsx`

**Interfaces:**
- Produces:
```ts
export interface TxParams { month: string; filters: TransactionFilterValues }
export function useTxParams(): {
  month: string; filters: TransactionFilterValues;
  hasRange: boolean; isSearching: boolean;     // isSearching = Boolean(q || tagId)
  advancedCount: number;                       // type + walletId + categoryId + assetId set
  hasAnyFilter: boolean;
  set(next: Partial<TxParams['filters']> & { month?: string }, opts?: { replaceFilters?: boolean }): void; // merges; undefined/'' removes a key
  clearAll(): void;                            // keeps month
};
```
- Replaces the inline `filters` memo and `updateParams` in `TransactionsScreen.tsx` (same parsing, same `replace: true`).

- [ ] **Step 1: Write the failing tests:** `parses all params and ignores an unknown type`; `set merges and removes empty keys`; `clearAll keeps month`; `isSearching is true for q or tagId`; `advancedCount counts type, wallet, category, asset`.
- [ ] **Step 2: Run** `npm test -w @cc/web-screens -- useTxParams` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `refactor(web): transaction URL state hook (#133)`

### Task 3: Search bar with `#tag` suggestions

**Files:**
- Create: `libs/web/screens/src/components/transactions/TransactionSearchBar.tsx`
- Test: `libs/web/screens/src/components/transactions/__tests__/TransactionSearchBar.test.tsx`

**Interfaces:**
- Consumes: `TagView[]`, `foldForSearch` (`@cc/core`), `InputGroup*` (`@cc/web-ui/components/ui/input-group`), `Pill`, `Icon`.
- Produces:
```ts
export interface TransactionSearchBarProps {
  q: string | undefined; tagId: string | undefined; tags: TagView[];
  advancedCount: number;
  onSubmit(next: { q?: string; tagId?: string }): void;  // every list update goes through here
  onOpenAdvanced(): void;
  draftRef?: React.RefObject<{ text: string } | null>;  // lets other apply paths read the box text
}
export function TransactionSearchBar(props: TransactionSearchBarProps): JSX.Element;
```
- Behaviour (spec "Search bar"): `fsl-tx-search` root; input `data-testid="tx-filter-search"` (`type="search"`, `enterKeyHint="search"`, `text-base`); chip `tx-search-tag-chip` (accent `Pill` "#name ×", raw id when the tag is missing); clear × `tx-search-clear` (only with text; empties and calls `onSubmit({ q: undefined, tagId })`); search button `tx-search-submit` (Jade round icon, `aria-label` `transactions.searchSubmit`); advanced button `tx-filter-btn` (ghost round `sliders` icon, `aria-label` `transactions.advancedFilters`, Jade count badge `tx-filter-count` when `advancedCount > 0`). Text from props on mount and whenever `q` changes (back/forward).
- Suggestions: list `tx-tag-suggestions` (`role="listbox"`, white `rounded-xl`, `shadow-lg`, input `aria-controls`/`aria-activedescendant`) opens while the word at the caret starts with `#`; items `tx-tag-option-<id>` (44px rows) filtered by `foldForSearch` prefix-or-substring on the text after `#`; first item highlighted; ArrowUp/Down move; Enter picks the highlighted item while the list is open, else submits; Escape closes; empty → one muted line `transactions.noTagMatch`; no tags at all → no list. Picking removes the `#word`, sets the chip and calls `onSubmit({ q: remaining text trimmed || undefined, tagId })`. Backspace in an empty input with a chip calls `onSubmit({ q: undefined, tagId: undefined })`.

- [ ] **Step 1: Write the failing tests:**
  - `typing does not submit; the search button submits the trimmed text`; `Enter submits when no list is open`;
  - `typing #an lists #ăn uống and Enter picks it` → `onSubmit({ q: undefined, tagId: 't-an' })`;
  - `picking in "cà phê #an" keeps "cà phê"` → `onSubmit({ q: 'cà phê', tagId })`;
  - `ArrowDown then Enter picks the second suggestion`; `Escape closes the list`; `no match shows the empty line`;
  - `Backspace in an empty box removes the chip`; `clear × empties and submits without q`;
  - `shows q and the chip from props, and updates when q changes`; `a missing tag id shows the raw id`;
  - `the count badge shows advancedCount`.
- [ ] **Step 2: Run** `npm test -w @cc/web-screens -- TransactionSearchBar` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): transaction search bar with #tag suggestions (#133)`

### Task 4: Period row and When sheet

**Files:**
- Create: `libs/web/screens/src/components/transactions/PeriodRow.tsx`, `libs/web/screens/src/components/transactions/WhenSheet.tsx`
- Test: `libs/web/screens/src/components/transactions/__tests__/PeriodRow.test.tsx`, `.../WhenSheet.test.tsx`

**Interfaces:**
- Consumes: Task 1 helpers, `Sheet`, `Button`, `Icon`, `MIN_MONTH = '2000-01'`.
- Produces:
```ts
export interface PeriodRowProps {
  month: string; from?: string; to?: string; isSearching: boolean; today: string;
  onShiftMonth(delta: number): void; onOpenWhen(): void; onClearRange(): void;
  right: React.ReactNode;                 // the existing view toggle
}
export function PeriodRow(p: PeriodRowProps): JSX.Element;
export interface WhenSheetProps {
  open: boolean; onClose(): void; month: string; from?: string; to?: string; today: string;
  rangeLimitDays?: number;                // 366 until the copy is ready, undefined after
  onPickMonth(month: string): void;       // clears from/to
  onPickRange(r: { from?: string; to?: string }): void;
}
export function WhenSheet(p: WhenSheetProps): JSX.Element;
```
- PeriodRow: no range and not searching → `month-prev`, a heading button `tx-month-label` ("Tháng 12, 2026" + `chevronDown`, opens When), `month-next`. Range set → arrows hidden; outlined pill button `tx-range-button` with `matchQuickRange` name or `formatRangeLabel`, opening When, and a separate 44px × `tx-range-clear`. Searching without range → arrows hidden; pill `tx-range-button` "Mọi lúc ▾" opening When, no ×.
- WhenSheet (title `transactions.whenTitle`): quick list `tx-when-quick-<range>` rows with a check on the current one (`thisMonth`/`lastMonth` call `onPickMonth`, others `onPickRange`); year stepper `tx-when-year-prev/next` (stops at the current year and 2000) over 12 month pills `tx-when-month-<MM>` (current month filled, future months disabled) calling `onPickMonth`; custom `tx-when-from`, `tx-when-to` (`type="date"`, `text-base`) and `tx-when-apply` (primary) with inline error `tx-when-error` from `validateRange`. Every pick closes the sheet.

- [ ] **Step 1: Write the failing tests** (today 2026-11-19):
  - PeriodRow: `no range shows arrows and the month button`; `a range hides the arrows and shows "Tuần trước" for 09–15/11`; `a custom range shows the dates and × clears it`; `searching shows "Mọi lúc" and no arrows`; `searching with a range shows the range`.
  - WhenSheet: `Tuần trước picks 2026-11-09..2026-11-15`; `Tháng trước picks month 2026-10`; `month grid picks 2026-03 and disables 2026-12`; `the year stepper stops at 2026`; `custom from after to shows the error and doesn't apply`; `custom over 366 days shows the error only when rangeLimitDays is set`; `same day in both applies a single day`.
- [ ] **Step 2: Run** `npm test -w @cc/web-screens -- PeriodRow WhenSheet` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): period row and When sheet (#133)`

### Task 5: Advanced-filters sheet with pick views

**Files:**
- Modify: `libs/web/screens/src/components/TransactionFilters.tsx` (`TransactionFilters` rewritten; `ActiveFilterPills` handled in Task 6)
- Create: `libs/web/screens/src/components/transactions/FilterPickView.tsx`
- Test: `libs/web/screens/src/components/transactions/__tests__/TransactionFilters.test.tsx`

**Interfaces:**
- Produces (props of `TransactionFilters` unchanged except it no longer edits `q`, `from`, `to`; `onApply` receives the draft merged over the incoming `value`, so `q/from/to` pass through):
```ts
export interface FilterPickViewProps<T extends { id: string; name: string }> {
  title: string; allLabel: string; items: T[]; selectedId?: string;
  indentOf?(item: T): number;              // 1 for sub-categories
  testIdPrefix: string;                    // 'tx-filter-wallet' | 'tx-filter-category' | 'tx-filter-asset' | 'tx-filter-tag'
  onPick(id: string | undefined): void; onBack(): void;
}
export function FilterPickView<T extends { id: string; name: string }>(p: FilterPickViewProps<T>): JSX.Element;
```
- Main view: type chips unchanged (`tx-filter-type-*`); a white `rounded-xl` grouped list of 44px rows `tx-filter-row-wallet|category|asset|tag` (label left, current value + `chevronRight` right; asset row only with assets; tag row only with tags; wallet/category rows hidden when empty, as now); footer `tx-filter-reset` (ghost) and `tx-filter-apply` (primary).
- Pick view: replaces the main content inside the same `Sheet`; header with back button `tx-filter-pick-back` (`aria-label` `transactions.backToFilters`, focused on open) and the title; "Tất cả …" row first, then items as rows `<testIdPrefix>-<id>` with a check on the selected one; categories show sub-categories indented under their parent; tags render `#name`; a search field `tx-filter-pick-search` (accent-insensitive, local) appears when `items.length > 8`. Picking returns to the main view and focuses that row. Slide 150ms ease-out, `motion-reduce:transition-none`.

- [ ] **Step 1: Write the failing tests:** `no search or date fields in the sheet`; `tapping the wallet row opens its pick view and picking returns with the value shown`; `picking "Tất cả ví" clears the wallet`; `sub-categories are indented after their parent`; `a pick list of 9 shows a search that ignores accents`; `back returns focus to the row`; `apply passes q, from and to through unchanged`; `reset clears type, wallet, category, asset and tag in the draft`.
- [ ] **Step 2: Run** `npm test -w @cc/web-screens -- TransactionFilters` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): advanced filters with pick views (#133)`

### Task 6: Active filters row and the no-match state

**Files:**
- Modify: `libs/web/screens/src/components/TransactionFilters.tsx` (`ActiveFilterPills`)
- Create: `libs/web/screens/src/components/transactions/NoMatch.tsx`
- Test: `libs/web/screens/src/components/transactions/__tests__/ActiveFilters.test.tsx`

**Interfaces:**
- Produces: `ActiveFilterPills` gains `hasAnyFilter: boolean` and `onClearAll(): void`; it shows pills only for `type`, `walletId`, `categoryId`, `assetId` (not `q`, `tagId`, `from`, `to`), and ends with a ghost `Button` `tx-clear-all` (`x` icon, `transactions.clearAll`) whenever `hasAnyFilter`; hidden when nothing is filtered. `NoMatch({ onClear }: { onClear(): void }): JSX.Element` — no card: centred `searchX` icon (20px, `text-muted-foreground`), `transactions.noMatch` in `text-sm text-muted-foreground`, secondary `Button` `tx-clear-filters` (`transactions.clearFilters`); root keeps `data-testid="tx-no-match"`.

- [ ] **Step 1: Write the failing tests:** `q, tag and range get no pills`; `a wallet pill removes the wallet`; `Xóa tất cả shows when only q is set and clears everything`; `the row is hidden with no filters`; `NoMatch has no card border and its button clears`.
- [ ] **Step 2: Run** `npm test -w @cc/web-screens -- ActiveFilters` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): active filters row and quieter no-match (#133)`

### Task 7: Search mode list

**Files:**
- Create: `libs/web/screens/src/components/transactions/SearchResults.tsx`
- Test: `libs/web/screens/src/components/transactions/__tests__/SearchResults.test.tsx`

**Interfaces:**
- Consumes: `useCopyList` (Part 1), the day/category grouping already in `TransactionsScreen.tsx` (extract `groupRows(rows, viewMode, categories, lang, t)` into `libs/web/screens/src/components/transactions/groupRows.ts` and use it from both).
- Produces:
```ts
export interface SearchResultsProps {
  filters: TransactionFilterValues; viewMode: 'day' | 'category';
  wallets: WalletDetailView[]; categories: CategoryView[]; assets: AssetView[];
  onOpenEntry?(entry: EntryView): void; onClear(): void;
}
export function SearchResults(p: SearchResultsProps): JSX.Element;
```
- With the copy ready: all-history rows (no `month`; `from/to` when set), newest first, grouped; renders the first 50 rows, then +50 when a sentinel nears the viewport (IntersectionObserver, `rootMargin: '120px'`) with a ghost `tx-search-more` button fallback; day headings include the year when it isn't the current one (`T5, 19/11/2025`). No rows → `NoMatch`. Copy not ready → render nothing here (the screen falls back, Task 8).

- [ ] **Step 1: Write the failing tests** (mock `useCopyList`): `renders 50 of 2,000 rows, then 100 after "Xem thêm"`; `a day from last year shows its year`; `category view groups all matches`; `no rows shows NoMatch`.
- [ ] **Step 2: Run** `npm test -w @cc/web-screens -- SearchResults` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): all-time search results from the saved copy (#133)`

### Task 8: Wire the screen

**Files:**
- Modify: `libs/web/screens/src/screens/TransactionsScreen.tsx`
- Test: `libs/web/screens/src/screens/__tests__/transactions-search-flow.test.tsx`

**Interfaces:**
- Consumes: Tasks 2–7, `useTxCopy`.
- Layout top to bottom: header without the search icon (`right` removed); `TransactionSearchBar`; `PeriodRow` (with the existing `tx-view-toggle` as `right`); `ActiveFilterPills`; results: `SearchResults` when `isSearching && !hasRange && copy ready`, else the existing `MonthBlock` list (range or months), with `NoMatch` replacing the old card.
- Before the copy is ready and searching without a range: `MonthBlock`s as today with `q`/`tagId` (server), plus a muted line `tx-loading-history` (`transactions.loadingHistory`) under the search bar; when the copy becomes ready the screen switches to `SearchResults` by itself.
- Every apply path commits the box text (spec): the When sheet picks, the advanced sheet's apply, pill removals and "Xóa tất cả" call `set({...change, q: draftRef.current.text.trim() || undefined})` ("Xóa tất cả" passes `q: undefined`).
- `WhenSheet.rangeLimitDays` = 366 while the copy isn't ready, `undefined` after.

- [ ] **Step 1: Write the failing tests:** `the header has no search icon and the body has the search bar`; `submitting a search with the copy ready shows all-time results and "Mọi lúc"`; `before the copy is ready the search covers loaded months and shows the loading line`; `picking a quick range hides the arrows`; `clearing the range brings the arrows back on the earlier month`; `opening the advanced sheet from the bar and applying a wallet keeps typed text as q`; `Xóa tất cả clears q, tag, range and filters but keeps the month`; `no match shows the quiet block`.
- [ ] **Step 2: Run** `npm test -w @cc/web-screens -- transactions-search-flow` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): new search flow on /transactions (#133)`

### Task 9: Existing tests and verification (planner task)

- [ ] Adjust `libs/web/screens/src/screens/__tests__/transactions.test.tsx` (~line 345: type into the body `tx-filter-search` and press `tx-search-submit`; the pill `tx-filter-pill-q` no longer exists, assert the box value instead) and `holdings-and-trade-rows.test.tsx` (~line 287: open `tx-filter-row-asset` before tapping `tx-filter-asset-<id>`; the asset pill stays). Keep each test's intent.
- [ ] `npm test`, `npm run typecheck`, `npm run lint` — all green.
- [ ] `/impeccable polish` pass on `/transactions` at 375px and 1024px (rendered, both a theme with Jade and one other theme).
- [ ] Build, `npm run e2e -- <transactions spec if any>`, then the tunnel; browser-check: `#` suggestions on a phone keyboard, the When sheet as a bottom sheet (375px) and a dialog (≥640px), focus moving into and out of the pick view.
