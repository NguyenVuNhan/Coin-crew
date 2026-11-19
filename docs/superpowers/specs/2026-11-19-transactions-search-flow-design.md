# Transactions search flow — design

Issue #133 (from the owner's design review of PR #131, 2026-11-18). Shaped with `/impeccable shape` and confirmed by the owner on 2026-11-19.

## Why

On `/transactions` (Sổ chi tiêu → Giao dịch) search hides behind a magnifier icon in the header, so the owner doesn't see it. The filter sheet it opens is a long wall of chips (every wallet, category, asset and tag as a chip), which looks noisy. The no-match card looks out of place, the month heading can't be tapped to jump anywhere, and a date range sits awkwardly next to the month arrows.

The person is the owner (and friends who turned on Sổ chi tiêu). They use it on a phone right after paying, or on a computer for a weekly look-over, to find a transaction.

**Success:** search is the first thing in the page body; jumping to a month or a common range takes one or two taps; it's always clear what's filtered and how to undo it.

**Mode:** Operate. Stay inside the existing Friendly Ledger system (`DESIGN.md`): no new tokens, no new visual language. The improvement comes from structure.

**The cost problem (owner, 2026-11-19):** the owner wants search to reach all of a person's history, but must not hit the D1 free plan's daily read limit (5M rows read) with just a few searches. A note search has no usable index, so an all-time server search reads the person's whole history every time (≈11,000 rows for 3 years at 10 a day). So search, and the month view with it, move onto a **saved copy in the browser**, kept fresh by a cheap sync.

## Two parts

- **Part 1: the saved copy and sync** (server change counter, deletion records, sync endpoint; browser copy; month view and filters read from it). Built first: all-time search depends on it.
- **Part 2: the search UI** (everything under "Page layout" and the two sheets), searching the saved copy.

Each part is its own PR into `main`, like "Personal money Part 1/2".

## Goals

1. Searching, paging months and filtering on `/transactions` cost no D1 reads once a browser's copy is ready; the steady-state cost of opening the screen is about one row read.
2. A visible search bar at the top of the body, with a search button and an advanced-filters button inside it.
3. Search reaches all history (owner's choice) and ignores accents in notes (`ca phe` finds `cà phê`).
4. `#tag` search with suggestions inside the same field.
5. Tap the month heading to open a "When" sheet: quick ranges, month grid, custom range.
6. While a date range or a search is on, the month paging (‹ ›) is hidden.
7. An advanced-filters sheet without walls of chips.
8. A clear active-filter state: pills, a real "clear all" button, results directly below; a no-match state that isn't an out-of-place card.

## Non-goals

- Filtering by several tags (one `tagId`, as today).
- Offline writes. The copy is read-only offline; adding or editing still needs the network.
- Moving other screens onto the copy (the Sổ chi tiêu overview, wallet pages, reports keep their server calls). The copy is built so they could later.
- Saved searches, search history, sorting options.
- Changing the transaction rows, the day/category grouping, the wide layout's detail dialog, or auto-loading older months.

## Anti-goals

- Any search, month change or filter that reads from D1 once the copy is ready.
- A copy that is silently stale: a change made on another device or by a group member must show up on the next open.
- Search that fires on every keystroke (the owner chose search-on-button).
- Nested sheets (a sheet opening another sheet).
- Losing the current URL contract: links like `/transactions?month=2026-11&tagId=…` keep working.

## Page layout, top to bottom

The header keeps the back button and title; **its search icon is removed**.

### 1. Search bar (first in the body)

One white `rounded-xl` field, 44px tall, Field Edge outline, 16px text (an `InputGroup` from `libs/web/ui/src/components/ui/input-group.tsx` fits). Contents, left to right:

- **Tag chip** (only when a tag is picked): an accent `Pill` "#ăn uống ×" inside the field. Tapping its × removes the tag and re-runs the list.
- **Text input**, placeholder "Tìm theo ghi chú hoặc #thẻ" (new copy, `// REVIEW`).
- **Clear ×** (only when there is text): clears the text box; does not search by itself.
- **Search button**: a round Jade icon button (search icon). Runs the search.
- **Advanced-filters button**: a round ghost icon button (sliders icon), with a small Jade count badge when any advanced filter (type, wallet, category, asset) is on. Opens the advanced-filters sheet.

Every button is a 44px touch target (the visible circle may be smaller, with the hit area around it).

**Behaviour (owner's choices):**

- **Text search runs only on the search button or Enter**, never while typing. Submitting sets `q` (trimmed; empty removes `q`). Enter also closes the phone keyboard. The text is searched as typed, a leftover `#word` included.
- **What's in the box is what's searched** (my call, so the box never shows text the list isn't using): every action that updates the list also commits the box's current text as `q`: picking a tag, removing the chip, applying the advanced sheet, choosing in the When sheet, "Xóa tất cả" (which empties it). The clear × empties the box **and** removes `q` straight away. On load and on back/forward the box shows the URL's `q`.
- **`#` opens tag suggestions.** When the word under the caret starts with `#`, a white `rounded-xl` list drops below the field (over the content, `shadow-lg`, since it floats) with the person's tags matching the text after `#`, ignoring accents and case (`#an` finds `#ăn uống`; reuse the accent-folding in `libs/web/util/src/nameSearch.ts`). Each row is 44px: "#name". The first suggestion is highlighted as soon as the list opens, so **Enter picks it while the list is open** (Enter searches only when the list is closed or empty); Up/Down move the highlight; Escape closes the list; tapping the search button always searches the text as it is (my call).
- **Picking a tag** removes the `#word` from the text, shows the chip, and **applies straight away** (sets `tagId`; my call: picking is already a deliberate act). Picking a second tag replaces the first (one tag only).
- **Backspace in an empty text box** removes the chip (and applies).
- No matching tags: the list shows one muted line, "Không có thẻ nào khớp" (new copy). No tags at all: typing `#` shows nothing.
- The field shows the current URL state on load (text from `q`, chip from `tagId`).

### 2. Period row

- **Searching (`q` or `tagId` set) with no date range: all time.** Search reaches back through everything the person has recorded (owner's choice). The arrows are hidden and the row shows one outlined pill button, "Mọi lúc ▾" (new copy), which opens the When sheet to narrow it. See "Search mode" below. Wallet, category, asset and type filters alone do **not** switch to all time; they keep month paging.
- **No date range, not searching:** `‹` **Tháng 12, 2026 ▾** `›` on the left, the "Theo ngày / Theo nhóm" toggle on the right (unchanged). The heading becomes a button (chevron-down icon) that opens the **When sheet**. The arrows keep `month-prev` / `month-next`, the heading keeps `tx-month-label`.
- **Date range set (`from` and/or `to`):** the arrows are hidden. In their place, one outlined pill button shows the range: the quick-range name when the dates match one exactly ("Tuần trước"), else the dates ("12/11 – 19/11/2026"; one date when from = to). Tapping it opens the When sheet; a × beside it (its own 44px target) clears the range and goes back to month paging on the month that was showing before.

### 3. Active filters

A wrapping row of removable accent pills, as now (`ActiveFilterPills`, `tx-filter-pill-*`), for: type, wallet, category, asset. **Not** for `q`, the tag or the date range: those already show in the search bar and the period row (my call: one place per filter). When at least one filter of any kind is on (including `q`, tag, range), the row ends with a **"Xóa tất cả"** ghost `Button` (small, x icon) that clears every filter and keeps the month. The row is hidden when nothing is filtered.

### 4. Results

Results render directly below, as now.

**Search mode** (`q` or `tagId` set, no range): one list over all history, newest first, grouped by day (or by category with the toggle), computed from the saved copy. To keep the page light, it renders about 50 rows at first and more as the end scrolls into view (ghost "Xem thêm" fallback, same pattern as `tx-load-older`); no network is involved. Day headings show the year when it isn't the current year. The category view groups all matches. With a range set, search stays inside that range.

**Before the copy is ready** (a browser's first download): search covers only the months already loaded from the server (the existing month-scoped `q`), and a muted line under the search bar says "Đang tải toàn bộ lịch sử để tìm…" (new copy). When the copy is ready, the results refresh to all history by themselves.

**No match** (filters on, primary block empty): no card. A plain, centred block on the page: a 20px search-x icon in Stone Muted, one line "Không có giao dịch nào khớp bộ lọc." (`text-sm text-muted-foreground`), and a secondary `Button` "Xóa bộ lọc" (`tx-clear-filters`) that clears everything, like "Xóa tất cả". Keeps `data-testid="tx-no-match"`. The empty state with no filters is unchanged (`EmptyState`).

## When sheet

A `Sheet` titled "Chọn thời gian" (new copy). Top to bottom:

1. **Quick ranges**: one white `rounded-xl` grouped list, 44px rows: Tuần này, Tuần trước, Tháng này, Tháng trước, 30 ngày qua. The one matching the current state shows a check. Tapping applies and closes.
   - Weeks run Monday–Sunday (my call; Vietnamese convention). "Tuần này" and "Tháng này" end today; "30 ngày qua" is today and the 29 days before it.
   - "Tháng này" and "Tháng trước" **set the month** (month paging, no range), since they are whole months. The others set `from`/`to`.
2. **Month grid**: a year stepper (‹ 2026 ›) over a 4×3 grid of month pills (T1…T12 / Jan…Dec). The month showing gets the active fill; future months are disabled; the year stepper stops at the current year and at 2000 (`MIN_MONTH`). Tapping a month sets `month`, clears `from`/`to`, closes.
3. **Custom range**: "Từ ngày" and "Đến ngày" date fields side by side (existing `type="date"` inputs), and an "Áp dụng" primary button. Only one date is fine: from alone runs to today; to alone runs from the 1st of its month (current behaviour). From after to shows an inline error and doesn't apply. The same date in both gives a single day. Ranges have no length limit when the copy is ready (it's local); before that, a range over 366 days (the API's limit) shows the inline error "Chọn tối đa 1 năm" (new copy).

## Advanced-filters sheet

A `Sheet` titled "Lọc giao dịch". Two views inside the same sheet, never a second sheet.

**Main view**
- **Loại**: the six type chips stay as they are (`tx-filter-type-*`), since it's a short fixed list.
- **A grouped list of rows**, each 44px with label left, current value + chevron right: "Ví · Tất cả ví ›", "Danh mục · Tất cả danh mục ›", "Tài sản · Tất cả tài sản ›" (only if the person has assets), "Thẻ · Tất cả thẻ ›" (only if they have tags). Rows for empty lists are hidden, as now.
- The tag row edits the same `tagId` the search-bar chip shows.
- No search field and no date fields here any more.
- Footer: "Đặt lại" ghost (`tx-filter-reset`, resets the draft) and "Áp dụng" primary (`tx-filter-apply`, applies and closes), as now.

**Pick view** (tapping a row)
- Replaces the main view's content inside the sheet: a back arrow + the field name at the top, then one grouped list: "Tất cả …" first, then each item (active wallets, visible categories with sub-categories indented under their parent, assets, `#tags`). The chosen one shows a check. Tapping one sets the draft and returns to the main view.
- When the list has more than 8 items, a small search field sits above it, filtering as you type with accents ignored (local list, no request).
- Item rows keep the testids `tx-filter-wallet-<id>`, `tx-filter-category-<id>`, `tx-filter-asset-<id>`, `tx-filter-tag-<id>`.
- Focus moves to the back arrow when a pick view opens, and back to the row when it closes.

## States and ranges

- Wallets: 1–10 typical. Categories: 10–40 with sub-categories. Tags: 0–50. Assets: 0–20.
- Long Vietnamese names wrap in rows; chips and pills truncate with an ellipsis.
- Loading: the existing skeletons. Error: the existing `InlineError` with retry.
- The search bar and the period row stay usable while results load.

## URL and data

- Same URL params as today: `month`, `q`, `tagId`, `walletId`, `categoryId`, `assetId`, `type`, `from`, `to`, written with `replace: true`. Quick-range names are derived from dates, never stored. In search mode `month` stays in the URL (it's where paging returns when the search is cleared) but doesn't limit the results.
- Tag suggestions use the `useTags()` data already loaded.
- The data comes from the saved copy (Part 1, below). `GET /me/personal/transactions` stays as it is, used before the copy is ready.

## Part 1: the saved copy and sync

All confirmed by the owner on 2026-11-19 unless marked "my call".

### What the copy holds

Exactly what `/transactions` can list for the signed-in person: every personal wallet transaction (all types, with tag ids and the transfer counterpart wallet) and every people-ledger share row (`kind: 'person'`, from `loadPersonRows`: approved, latest-version expenses in the person's direct ledger). The screen turns them into the same `ListRow` shape the list endpoint returns (see "Stored as ids" below). Owner: "group expenses are part of a wallet, hence search will also include those." Wallets, categories, assets and tags are **not** in the copy; they stay small server lists loaded as today (`useWalletDetails`, `useCategories`, `useAssets`, `useTags`).

**Shares in ordinary groups** (trips, sport groups) are meant to be part of a wallet too (owner, 2026-11-19): turning on Sổ chi tiêu should ask for a wallet and bring the person's group expenses into it. That isn't built today (`/transactions` lists only the direct ledger), and it is **a separate sub-ticket (#138), not part of this one**. This design only has to leave room for it: once group shares become wallet transactions, the copy and search pick them up with no extra work, provided that ticket's writes go through the same bump helper (below).

**Stored as ids, not names** (my call, from the builder check): the copy stores each row's own fields and ids (wallet id, category id, asset id, tag ids, counterpart wallet id, the ledger row's share, total and participant ids), and the browser fills in names, currency, `beforeStart` and the default wallet from the lists it already loads. So renaming a tag, switching the default wallet or changing a wallet's currency/start date never needs a re-sync.

### Where it lives

- Browser storage (IndexedDB), in every place the web app runs: Chrome, Safari, the home-screen app, Zalo's in-app browser, the Mini App's webview. One store per signed-in user id.
- **Signing out deletes it** (next to the theme cache clean-up in `libs/web/data-access/src/signOut.ts`).
- Storage can vanish (Safari deletes a site's data after ~7 days unused when not saved to the home screen; private windows; Zalo's browser). That's handled as a first visit: download again. IndexedDB unavailable or throwing: the screen behaves exactly as today (server), never breaks.
- Code: a new module in `@cc/web-data-access` (the copy, the sync, hooks). Picking an IndexedDB helper library (or none) is the builder's call; a dependency must be small.

### Keeping it fresh

1. **Change counter per person (server).** A per-user `version` number, bumped by every write that changes what the copy holds:
   - personal transactions: add, edit, delete, undo-delete, transfers (both sides), buy/sell, tag changes on a transaction, imports;
   - deleting a wallet, category or tag where it cascades to transaction rows.
   Renames and other list-only changes to wallets/categories/tags don't bump it (names are filled in by the browser).
   **The people ledger is handled per ledger, not per row** (my call): ledger writes go through the shared group code (`expenses/routes.ts`, participant merge/remove/rename, `proposals`, `claimGrant`, …), which already bumps `trips.version` via `commitTripWrite`/`guardedTripWrite` in `libs/api/db/src/commit.ts`. The sync compares the ledger trip's `version` with the one the browser last saw; when it moved, the sync re-sends **all** of that person's ledger rows (they are few) and the browser replaces its ledger rows wholesale. No per-row stamps or deletion records on the shared `transactions` table.
   **An account merge** (`auth/mergeUsers.ts`) moves rows between users: it bumps a **per-user epoch**, so that person's browsers re-download everything.
2. **Each changed personal transaction is stamped** with the version that changed it, and each deleted one leaves a **deletion record** (user, row id, version). Both are indexed by (user, version), so "what changed since version N" reads only the changed rows.
3. **Sync endpoint** (new, e.g. `GET /me/personal/sync?since=<version>&epoch=<epoch>`):
   - The browser sends its personal `version`, the ledger trip version it last saw, and the epoch (server-wide + per-user).
   - All the same: returns "up to date". Cost ≈ two row reads (the person's counter row and the ledger trip).
   - Ledger version moved: also returns the person's full set of ledger rows.
   - Behind: returns the changed rows and removed ids since `since`, in batches (builder picks the size, e.g. 500) with a "more" flag, plus the new version.
   - No `since` (first download) or too old (see 3 below) or wrong epoch: returns "reset" and the browser downloads everything in batches.
4. **When it syncs:** when `/transactions` opens, when the tab becomes visible again, and right after this browser makes a write. Never on a timer while hidden (my call).
5. **This browser's own writes** update the copy straight away from the write's response, then the next sync confirms them, so the list never waits.

### Full reset (download everything again)

- **App update:** the copy stores a format number; an app version that changes the stored shape bumps it, and a mismatch wipes the copy.
- **Server epoch:** one server-wide number we raise by hand (config or a row) after a migration or a sync bug; a browser with a different epoch wipes and re-downloads.
- **Away too long:** deletion records are kept for 90 days (my guess; cleaned by the existing hourly cron in `apps/api/src/index.ts`). A browser whose last sync is older than the oldest kept record re-downloads.
- **Manual:** a quiet "Tải lại dữ liệu" row (new copy) under the Sổ chi tiêu setting in the account menu wipes and re-downloads this browser's copy (my call on the place).
- Turning Sổ chi tiêu off deletes the copy; turning it on starts fresh.

### Guarding against a missed bump

The bump and the row stamp live in one shared write helper in `@cc/api-db` that every personal-transaction write goes through, never hand-written in each route. A test lists every route that writes `personal_transactions` or `personal_transaction_tags` and checks that each bumps the version and stamps or records the rows it touches. Ledger freshness rides on `trips.version`, which the existing commit helpers already bump for every group write, so the test only needs to check that ledger writes use those helpers. This is the main risk of the design.

### Reading from the copy

- **Same results as the server.** The filter rules (period bounds, type groups, category including its children, wallet, asset, tag, note match) move into `@cc/core` as one pure function, used by both the list endpoint and the copy, so the two can't drift. Sorting uses the same `compareListRows`. Text match ignores accents and case on **both** sides (my call, from the builder check): the server already filters notes in JavaScript after the query, so it uses the same folding from `@cc/core` at no extra read cost, and results don't jump when the copy takes over.
- **Month view:** once the copy is ready, every month, range, filter and the auto-load of older months read from it; no list requests. The 3-empty-months auto-load stop can stay as is.
- **Before the copy is ready:** the month view loads from the server exactly as today; the first download runs in the background without blocking the screen. Then the screen switches to the copy without a visible jump (same rows, same order).
- **Sync errors** never block reading: the screen shows the copy as it is and retries on the next trigger. If the copy can't be built at all, the screen stays on the server.

### Costs (to keep in view)

- First download per browser: reads every row once (about what one all-time server search would have read).
- Every later visit: ≈1 row read when nothing changed; otherwise only the changed rows.
- Searches, month changes, filters: 0.
- Writes: each write adds one counter update and possibly one deletion record (writes are within the free plan's 100k/day).

### Migrations

Hand-written D1 SQL migrations (per-user counter + epoch table, the stamp column on `personal_transactions`, deletion-record table, indexes), applied `--local` for the dev tunnel. Backfill: existing rows start stamped at version 0, so the first download after release picks them up as a normal full download.

## Responsive

- Phones (375px): everything in the 480px column. The suggestion list is as wide as the field.
- From 640px the sheets are centred dialogs (the `Sheet` wrapper already does this).
- Wide layout (≥1024px): the search bar and period row span the list column; nothing else changes.

## Copy

New strings go in `libs/web/i18n/src/vi.ts` and `en.ts`, Vietnamese marked `// REVIEW`. Reuse existing keys where they fit (`transactions.clearFilters`, `transactions.noMatch`, `transactions.fromDate`, `transactions.toDate`, `transactions.applyFilters`, `transactions.resetFilters`, `transactions.all*`). Needed: search placeholder, search button and advanced-filters button labels, "clear text", tag-suggestion empty line, "Xóa tất cả", When sheet title, the five quick-range names, "custom range" heading, "from after to" error, range-clear label, pick-view back label.

## Tests and testids

- Keep every existing `fsl-*` class and `data-testid` on the matching element. Moved ones: `tx-filter-search` goes to the body search input; `tx-filter-btn` goes to the advanced-filters button in the search bar.
- Existing tests that open the sheet to type a search (`transactions.test.tsx` around line 345) or tap a wallet/asset/tag chip in the main view (`holdings-and-trade-rows.test.tsx` around line 287) will need adjusting by the planner (asset/wallet/tag picks now go through a pick view). Implementers add new tests only and don't edit existing ones.
- Part 1 tests: every personal/ledger write route bumps the version; the sync endpoint's up-to-date, delta (rows + removals), batching, reset (no `since`, wrong epoch, too old) cases; the shared filter function gives the same rows as today's list endpoint on a fixture; the browser copy applies deltas and removals, wipes on format change and sign-out, and falls back to the server when storage is unavailable.
- Part 2 tests: search runs on button/Enter only; the `#` suggestion → chip → `tagId`; backspace removes the chip; the When sheet's quick ranges (dates for a fixed "today"), month grid and custom range validation; paging hidden while a range is set; "Xóa tất cả"; the pick view.

## Calls I made (owner to check)

- Picking a `#tag` applies straight away; only free text waits for the search button.
- Weeks start on Monday.
- The range button shows the quick-range name when the dates match one.
- No nested sheets: the pick lists slide inside the advanced sheet.
- "Tháng này / Tháng trước" switch to month paging instead of setting a range.
- The search text, tag and range don't get pills (they show in the search bar and period row); "Xóa tất cả" still clears them.
- Pick views get their own search field from 9 items.
- Every list update commits the box's text; the clear × also clears `q`.
- With tag suggestions open, the first is highlighted and Enter picks it.
- Before the copy is ready, a custom range over 366 days shows an inline error rather than being clamped.
- Saved copy stores ids; the browser fills in names, currency and the default wallet.
- People-ledger freshness uses the existing per-group `trips.version`: when it moves, all ledger rows are re-sent. An account merge resets that person's copies through a per-user epoch.
- Server note search ignores accents too.
- Shares in ordinary groups: a separate sub-ticket; this design only leaves room for it.
- Saved copy: sync on open, on tab return and after own writes, never on a timer; deletion records kept 90 days; "Tải lại dữ liệu" sits under the Sổ chi tiêu setting; Part 1 ships before Part 2.

## Left to the builder

- Exact component split (e.g. `TransactionSearchBar`, `WhenSheet`, a pick-view inside `TransactionFilters`) and file names, inside `libs/web/screens`.
- The date maths helpers (pure, in `@cc/web-util`, next to `localDate`), with tests.
- Small motion for the pick-view slide (100–200ms, ease-out, `motion-reduce:` respected).
