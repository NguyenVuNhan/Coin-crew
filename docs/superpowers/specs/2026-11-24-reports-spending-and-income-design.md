# Reports: spending and income by category and period

Date: 2026-11-24 · Issue: [#115](https://github.com/NguyenVuNhan/Coin-crew/issues/115) (Phase 2 · Stage 1 · sub-task 04 of 12; epic #55) · Blocked by #114 (closed) · Blocks #116.

Builds on: `2026-11-13-phase-2-personal-money-breakdown-design.md` (D1–D9, Phase 1 guard rules), `2026-11-15-spending-book-shape-and-navigation-design.md` (#112), `2026-11-16-wallets-and-transactions-design.md` (#113), `2026-11-19-transactions-search-flow-design.md` (#133), `2026-11-21-group-shares-in-spending-book-design.md` (#114), `2026-11-21-wallet-form-currency-and-icon-picker-design.md` (#134), and `2026-11-21-per-wallet-visibility-design.md` (#130).

Lines marked **(owner)** record decisions made or confirmed by the owner during brainstorming on 2026-11-24. Lines marked **(my call)** are design choices made by the writer; the owner may overrule them.

> **Non-negotiable Phase 2 rules (issue #115):** All 11 rules apply unchanged:
> 1. **Additive only** (no altering or dropping Phase 1 tables or columns; no migration is even needed here).
> 2. **Do not edit group money code:** `commitTripWrite` / `guardedTripWrite` (`libs/api/db/src/commit.ts`), `computeBalances`, `computeShares`, `suggestTransfers` (`libs/shared/core`), `getSnapshot` (`apps/api/src/trips/snapshot.ts`), `apps/api/src/me/balances.ts`, `apps/api/src/me/settle.ts`, `apps/api/src/me/ledger.ts`, `libs/api/auth/src/device.ts`, and expense/payment routes. Mounting new personal routes in `apps/api/src/personal/routes.ts` is allowed.
> 3. **Never edit or delete an existing test.** `npm test`, `npm run typecheck`, `npm run lint`, and Playwright specs `golden-path` and `walkthrough` must pass untouched.
> 4. **Cloudflare free plan:** ≤ 50 DB queries per request; stay well inside 100k rows written and 5M rows read per day.
> 5. **Group-only users and guests see and reach nothing new** when the personal area switch is off (both on screen and via API, enforced by `requirePersonal`).
> 6. **Personal data is private** to its owner; cross-account reads return 404 or empty owner-scoped data.
> 7. **Hand-written SQL migrations** if any (this feature needs none).
> 8. **Money is never a float:** whole numbers in each currency's smallest unit.
> 9. **Never in the product:** moving money, bank connections, Gmail/Drive access, live market price feeds, or personal-money push/SMS/email.
> 10. **Mind the name:** never touch or extend `apps/api/src/me/ledger.ts` (`PersonalLedger`); name new code under `reports` / `personal`.
> 11. **Same screens, two shells:** both `apps/web` and `apps/zalo` (Zalo Mini App) render the same screens, using `usePlatform()` for any platform-specific behaviour.

---

## 1. Intent and Why

Recording personal transactions and syncing group shares only pays off if the owner can quickly answer:
1. *"Are my income and expenses still healthy this month compared with my recent baseline?"*
2. *"What did I spend on food last month, and is that more than the month before?"*
3. *"How much am I spending across specific services (`#tags`), and how did a specific wallet's balance move?"*

In Money Lover, the owner checked an income-vs-expenses graph alongside a grayed 3-month average first, then scanned two parent-category pie charts (income and spending) and tapped into a parent category to see a single sub-category pie and its transactions. Bringing this workflow into CoinCrew—while keeping `Sổ chi tiêu` calm on the main screen—closes the reporting gap blocking Budgets (#116).

---

## 2. Goals, Non-Goals, Anti-Goals

### Goals
1. **Keep the main `Sổ chi tiêu` screen calm:** show simple this-month spending and income totals on the summary card plus a `"Báo cáo"` row opening `/reports`.
2. **Lead `/reports` with the cumulative health graph (`Thu & Chi trong kỳ`):** a cumulative daily line chart (Income in green, Expenses in red) overlaid on **grayed area charts for the 3-month average**, alongside total income, total spending, net difference, and plain-word comparison against the previous period and 3-month baseline.
3. **Two parent-category pies (`Theo danh mục`):** Spending and Income broken down by top-level parent category (largest first, amount and percentage), with a ranked list below; tapping any parent category opens `/reports/category/:categoryId` showing previous-period comparison, a **single sub-category pie + list**, and matching transactions — answering *"what did I spend on food last month, and is that more than the month before?"* in **two taps**.
4. **By-tag breakdown (`Theo thẻ`):** a **horizontal bar chart** designed to stay readable and fast even with dozens of tags (Top 5 default, expand-all, live accent-folded search when `> 6` tags, Chi/Thu toggle, tap opens filtered `/transactions`).
5. **Single-wallet scope inside Reports:** filtering Reports to one wallet displays a **Wallet balance over time** chart + key-dates table at the top of Reports in that wallet's exact native currency and scopes all charts underneath to that wallet.
6. **Combined multi-currency view (`≈ VND`):** viewing "All wallets" converts non-VND entries using each wallet's W12 actual transfer average rate (never silently mixing or dropping unrated currencies).
7. **Period, wallet, and group filters:** default to this calendar month; support Week (Mon–Sun), Year, Custom date range, Wallet selector, and an Include/Exclude group shares toggle.
8. **Zero-read steady state via browser copy + server fallback:** compute reports in the browser from the synced local copy (`txCopy` + `groupCopy`), with a server fallback (`GET /me/personal/report`) sharing one pure `@cc/core` engine.
9. **Accessible and theme-safe at 375px:** every chart pairs with a list/table carrying exact numbers, uses non-colour cues, and works across all 5 themes (`Jade`, `Pink`, `Orchid`, `Sky`, `Indigo`) on web and Zalo Mini App.

### Non-Goals
- Budgets (#116), recurring rules (#117), review inbox / spreadsheet / Apple Pay / Android capture (#118–#121), asset distribution & targets (#122), loan planner (#123), Google Sheets export (#57), market values or live FX rates (Rule 9).
- Non-cumulative `"Theo ngày"` mode on `Thu & Chi trong kỳ` (**owner** explicitly dropped it).
- Separate carve-out for investment purchases (**owner**: all enabled transactions count as logged).
- Putting the wallet balance over time chart on `WalletScreen` (**owner**: lives inside Reports).
- Re-adding tags to the entry form (#113 R6).

### Anti-Goals (a failure even if it works)
- Report totals disagreeing with `/transactions` totals for the same filters.
- Default transfers (`excludeFromReports: true`), non-payback group settlements/payments, pending group rows, `buy`/`sell` asset trades, balance-adjustment entries, or excluded wallets (#134) leaking into overall spending/income totals.
- Mixing currencies without conversion or silently dropping unrated foreign wallets.
- Relying on colour alone (missing labels, missing tabular breakdown, or indistinguishable series).
- Adding raw hex colours in `.ts`/`.tsx` (`style-guard.test.ts`), touching the 6-token `[data-theme]` blocks in `globals.css` (`theme-tokens.test.ts`), or colouring money with a theme's accent (Fixed Money Rule).
- Horizontal overflow at 375px, or rendering empty/broken axes on zero or thin data.
- Editing any existing test — notably `apps/api/test/personal-list.test.ts` (which pins `GET /me/personal/summary` with `.toEqual` and pins archived-wallet history counting) and `libs/web/screens/src/screens/__tests__/spending-book.test.tsx` (which pins `book-total`'s first `.fsl-amount` not having `text-success`).

---

## 3. Decisions

| # | Decision | Source |
|---|---|---|
| R1 | **Lead chart is `Thu & Chi trong kỳ` — cumulative daily line + 3-month grayed area.** Always cumulative (`Lũy kế`), no `"Theo ngày"` toggle. X-axis is each day; Income is a green line (`--success`), Expenses are a red line (`--danger`), and the 3-month average sits underneath as grayed area charts (`--subtle-foreground`). Leads `/reports` above the category pies. | **owner** |
| R2 | **Two parent-category pie charts (`Theo danh mục`), drilling down to sub-category pie.** Spending pie and Income pie show top-level parent categories. Tapping a category opens a dedicated drill-down page showing a single sub-category pie, list, and matching transactions. | **owner** |
| R3 | **Main `Sổ chi tiêu` screen stays calm.** `BookTotal` shows simple this-month spending & income totals beneath `Tổng tiền`, and the top grouped list adds a `"Báo cáo"` row opening `/reports`. No charts from Reports live on the main screen. | **owner** |
| R4 | **No separate carve-out for investments.** All enabled transactions (`!excludeFromReports`, wallet not excluded) count as logged. (`buy`/`sell` asset trades inside investment wallets remain cash↔asset conversions and are excluded from spending/income just as in `/transactions` `toCountedRow`.) | **owner** |
| R5 | **One combined `≈ VND` report across currencies.** Viewing "All wallets" converts non-VND transactions to VND at each wallet's W12 actual transfer average rate so all wallets roll into one report. | **owner** |
| R6 | **Single-wallet scope and wallet balance over time live inside Reports.** Picking one wallet scopes all charts to it and displays **Số dư theo thời gian** at the top of Reports. | **owner** |
| R7 | **By-tag report uses a horizontal bar chart** with UX tailored for many tags. | **owner** |
| R8 | **Browser-computed from synced local copy, with server fallback.** Uses `txCopy` + `groupCopy` in `@cc/web-data-access` for 0-read interactions in steady state, backed by `GET /me/personal/report` running the exact same `@cc/core` logic when local storage is unavailable or still downloading. | **owner** |
| R9 | **Side-by-side compact donuts + toggleable ranked parent list.** Both Spending (left) and Income (right) donuts sit side by side in one white `rounded-xl` card at 375px; a `Chi tiêu \| Thu nhập` toggle switches the ranked parent-category list below (colour dot, category icon, name, `tabular-nums` amount, `%`, chevron). Tapping either donut switches the list; tapping any slice or row opens `/reports/category/:categoryId`. On wide screens (`≥ 1024px`), Reports opts into the 1040px two-column layout (`Thu & Chi` + `Theo thẻ` or `Số dư` paired cleanly with `Theo danh mục`). | **my call** |
| R10 | **Category drill-down page (`/reports/category/:categoryId`).** Displays the category's period total, plain-word comparison vs previous period and 3-month average (so "what did I spend on food last month vs the month before?" takes 2 taps: `‹` to last month → tap `Ăn uống`), a single sub-category donut + ranked list, and matching transactions underneath. Entries directly on the parent category render as `"<Parent> (chung)"`; entries with no category roll under a synthetic `__uncategorized__` (`"Chưa phân loại"`) row. Tapping a sub-category slice or row filters the transaction list below in place with a removable chip. Preserves current period, wallet, and group filter query params in the URL so back navigation and deep links stay exact. | **my call** |
| R11 | **Currency display, excluded wallets (#134), and archived wallets.** Under **All wallets**, totals show `≈ VND` when any rated non-VND transaction is included, list per-currency spending/income breakdowns underneath matching `/transactions`, ignore wallets with `excludeFromReports: true` (#134), and **include historical transactions of archived wallets** (matching `apps/api/test/personal-list.test.ts`). **Unrated foreign wallets (`unratedWalletIds`):** includes **only** non-excluded unrated foreign wallets that have **≥ 1 counted entry in the selected period** (so idle foreign wallets never warn on VND periods); unrated entries (`vndAmount === null`) are omitted from VND pie slices and VND tag bars (so VND chart sums equal the VND total) while `summary.perCurrency` plus a prominent `"chưa có tỷ giá"` notice explicitly name each affected unrated wallet and its native currency total with a 1-tap action to scope Reports to that wallet. Under **Single wallet**, everything renders in **that wallet's exact native currency** (e.g. `USDT`, no `≈ VND`), and if that wallet has `excludeFromReports: true`, Reports still renders it with a quiet Jade Mist info banner (`"Ví này không tính vào báo cáo tổng — đang xem riêng ví này"`). | **my call** |
| R12 | **Periods, x-axis granularity, in-progress cutoff, and 3-month baseline.** Default period is the current local calendar month. Supported modes: **Month** (daily `01..lastDay`; prev = prior month; baseline = mean of up to 3 prior full months `k ∈ {1,2,3}`), **Week** (Mon–Sun per #133, `T2..CN`; prev = prior week; baseline = mean of up to 3 prior full weeks), **Year** (12 monthly points `T1..T12` cumulative; prev = prior year; baseline = mean of up to 3 prior years), **Custom** (`from..to` inclusive, length `L` days: daily x-axis for `L ≤ 90`, monthly for `L > 90`; prev = preceding `L`-day window ending `from - 1 day`; baseline = mean of up to 3 preceding `L`-day windows). History availability `k` is determined from the user's earliest entry/group date; if `k = 0`, the grayed average area and baseline delta hide cleanly. In Month mode, day `d` averages cumulative values at `min(d, lastDayOfPriorMonth)` so 28/30/31-day months align cleanly. For an **in-progress** current period (Month, Week, Year, or Custom containing `today`), the green/red cumulative lines stop at `today` (or the current month bucket in Year mode) so they do not flat-line across future dates, while the grayed 3-month area spans the full period; **both `previousPeriod` and `baseline3m` deltas** compare actual-to-`today` against the prior period(s) through the same day-of-period index (e.g., Nov 1–24 vs. Oct 1–24, labeled `"so với cùng kỳ tháng trước"`, and in Year mode exact calendar `Jan 1..today` vs. prior years `Jan 1..same month/day`), whereas completed past periods compare full-to-full (`"so với tháng 10"`). | **my call** |
| R13 | **Point-in-time W12 VND conversion (`@cc/core`).** Add `replayEntryVndAmounts(wallets, entries)` in `libs/shared/core/src/wallets.ts` (leaving existing exports untouched) replaying all personal + group-wallet entries using W12's exact average-rate state machine: VND wallets use exact `entry.amount`; rated non-VND wallets convert at `Math.round(rate * entry.amount)` at that moment in replay (`transfer_in` from VND passes exact `transferCostVnd`; entries before a wallet's first inflow retroactively take that first inflow rate per W19c); permanently unrated non-VND wallets return `null` for their entries and appear in `unratedWalletIds`. | **my call** |
| R14 | **Many-tags horizontal bar chart UX (`Theo thẻ`).** Includes a `Chi \| Thu` toggle, sorted largest first; each bar renders `#tag`, proportional fill, `tabular-nums` amount, and `%` of that side's total. Displays **Top 5** by default with `"Xem tất cả (N thẻ)"` expand/collapse, and adds a live accent-folded search box (`16px` text, `normalizeName`) when `> 6` active tags exist. Tapping a tag navigates to `/transactions?tagId=<id>&from=<from>&to=<to>` (plus `walletId` / `groups=hide` when active). Multi-tagged entries count once toward each of their tags; when any multi-tagged entry exists in the period, a quiet caption notes that tags can overlap so bar sums may exceed total spending. | **my call** |
| R15 | **Wallet balance over time (`@cc/core`).** `walletBalanceSeries(wallet, personalEntries, groupRows, groupSettings, period, today)` replays every entry affecting that wallet (personal entries including transfers/buys/sells/adjustments/excluded + `groupWalletEntries` resolved to that wallet) in its native currency: `opening = startAmount + Σ(deltas with date < period.from)`, then records closing balance at each x-axis bucket through `min(period.to, today)` (or `period.to` for completed periods), returning `opening`, `closing`, `netChange`, `min` (value + date), `max` (value + date), and key checkpoints (start, min, max, end) rendered in a table below the chart. Invariant: when `period.to >= today` and there are no future-dated entries, `closing === walletBalance(wallet, allEntries)`. | **my call** |
| R16 | **Chart component & theme tokens (`libs/web/ui`).** Look up shadcn `chart` via the shadcn MCP and install via `npx shadcn@latest add chart` in `libs/web/ui` (rewriting `@cc/web-ui/...` self-imports to relative imports). Add 6 categorical palette tokens (`--chart-1`..`--chart-6`) ONLY inside `:root` and `@theme inline` of `libs/web/ui/src/styles/globals.css`—never inside `[data-theme]` blocks so `theme-tokens.test.ts` stays green. Income line uses `var(--success)`, Expense line uses `var(--danger)`, 3-month average area uses `var(--subtle-foreground)`—preserving the Fixed Money Rule and `style-guard.test.ts` (zero raw hex in `.ts`/`.tsx`). | **my call** |
| R17 | **Routes & `SpendingBook` main screen integration.** Add `/reports` and `/reports/category/:categoryId` inside `<PersonalRoute>` in `libs/web/screens/src/App.tsx`. Leave `GET /me/personal/summary` **completely untouched** (pinned by `apps/api/test/personal-list.test.ts`). In `SpendingBook.tsx`: keep `BookTotal`'s hero `Tổng tiền` as the first `.fsl-amount` with `tone="neutral"` (pinned by `spending-book.test.tsx`); add the quiet `Tháng này chi` / `Thu` line below it via a new `useCurrentMonthReportTotals()` hook (local copy first, `GET /me/personal/report` fallback, silent when loading/no data); add the `"Báo cáo"` row (`data-testid="book-reports-row"`, linking to `/reports`) inside `fsl-book__list` right beneath `book-people-row` once `hasWallet` is true. | **my call** |
| R18 | **Empty and thin data states.** With 0 counted entries in the period, show an `EmptyState` (with a quick jump to clear filters / switch period) instead of an empty chart. When a period contains **only** unrated foreign entries (`countedCount > 0`, `perCurrency` non-empty, VND total `0₫`), do **not** show `"Chưa có giao dịch trong kỳ này"`; instead render the period summary's native `perCurrency` figures + the `"chưa có tỷ giá"` banner with 1-tap links to inspect each wallet in its native currency, and omit the VND charts cleanly. With 1-sided data (only expenses or only income), plot the active series and show `"0₫"` / `"Chưa có ..."` in the empty pie. With 1 active day, plot a crisp cumulative step curve rather than a lonely dot. With 0 prior history (`k = 0`), hide the grayed 3-month area and comparison delta with a quiet note instead of comparing against `0₫`. | **my call** |

---

## 4. Counting Rules, Agreement with `/transactions`, and Edge Cases

Every report aggregate and `/transactions` (`sumCounted` + `groupRowsTotals`) share the exact same inclusion semantics so totals match identically for the same filters:

| Source row | Spending / Income reports | Wallet balance over time | Notes |
|---|---|---|---|
| Personal `expense` / `income` (`excludeFromReports = false`) | Counted (`expense` or `income`) | Changes balance (`-` or `+`) | Includes `source = 'manual'` and future Stage 2 sources |
| Personal `expense` / `income` (`excludeFromReports = true` or `source = 'adjustment'`) | **Not counted** | Changes balance (`-` or `+`) | Balance adjustments from #114 §4.5 move balance only |
| Transfer (`transfer_out` / `transfer_in`, default `excludeFromReports = true`) | **Not counted** | Changes balance (`-` / `+`) | Counts only if user flips `excludeFromReports = false` (W5) |
| Asset trade (`buy` / `sell`) | **Not counted** | Changes cash balance (`-` / `+`) | Cash↔asset conversion (`toCountedRow` `!isTrade`) |
| Group expense (`approved`, you paid or have share, `!isFundPaid`, `!isPlanningExpense`, `intent !== 'loan'`) | Your `myShare` as spending (`!link.excludeFromReports`) | `iPaid ? -total : 0` | Reuses `groupRowEffect` (`@cc/core`) |
| Group fund contribution (`type = 'income'`, `approved`, you paid) | Full contribution as spending (`!link.excludeFromReports`) | `-total` | Reuses `groupRowEffect` |
| Group loan (`intent = 'loan'` in direct group) | Counted only when `groupSettings.countLoans = true` (`total - myShare` spent if lent; `myShare` income if borrowed; paybacks via `loanPaybacks`) | Always affects wallet (`iPaid ? -total : +myShare`; repayments `-` / `+`) | Matches #114 §5 exactly |
| Group settlement / payment (`confirmed`, non-payback or `countLoans = false`) | **Not counted** | `-amount` paid or `+amount` received | Settlements never appear as spending/income |
| Pending group rows (`pending`, `says_paid`) | **Not counted** | **No effect** | Never included in reports or balances |
| Wallet with `excludeFromReports = true` (#134) | **Ignored in "All wallets"** (both personal entries in it and group rows whose resolved wallet via `createGroupWalletResolver` is in `excludedWalletIds`); shown when scoped to that single wallet | Shown when scoped to that wallet | **(my call)** Keeps "All wallets" strictly equal to the union of non-excluded wallets |
| Archived wallet (`archivedAt !== null`) | **Included in spending/income reports** | Viewable if explicitly picked by `walletId` | Matches `apps/api/test/personal-list.test.ts` lines 701–758 |

**Category attribution:**
- Personal entries use `entry.categoryId` (falling back to `__uncategorized__` `"Chưa phân loại"` if `null`, e.g. an unexcluded transfer).
- **Group rows & `countLoans` (**my call**):**
  - When `groupSettings.countLoans` is `true` and a group row is a loan (`row.link?.intent === 'loan'`) or a matched loan payback (`payback > 0`), report attribution **bypasses `groupSettings.defaultGroupCategoryId`**: it uses explicit `row.link?.categoryId` when set, otherwise resolves strictly by **cashflow direction** (`eff.spending > 0` → `"Cho vay"` `${userId}:lend`; `eff.income > 0` → `"Đi vay"` `${userId}:borrow`). This ensures `spendingByCategory` holds only outflows, `incomeByCategory` holds only inflows, and `/reports/category/:categoryId` never mixes spending and income rows under one loan category.
  - All other counted group rows (ordinary shared expenses and fund contributions) reuse `groupRowCategoryId(row, groupSettings, fallbackGroupCategoryId)` (`@cc/core`), where `fallbackGroupCategoryId` is `"Nhóm"` (`${userId}:group`).
- When `categoryId` belongs to a sub-category, its amount rolls up into its `parentId` on the parent-category pie (`Theo danh mục`), while the drill-down view breaks the parent into its sub-categories (plus `"<Parent> (chung)"` for entries assigned directly to the parent).

**Agreement invariant:** For any filter combination `(period, walletId, includeGroups)` where all wallets are VND (or for any single wallet in its native currency), `report.summary.spent` and `report.summary.income` equal the totals of `/transactions` (`listFromCopy` + `groupRowsFromCopy` summed via `sumCounted` + `groupRowsTotals`) after excluding personal entries and resolved group rows belonging to `excludedWalletIds`.

---

## 5. Architecture, API Fallback, and Cloudflare Free-Plan Cost

### 5.1 Pure Engine in `@cc/core` (`libs/shared/core/src/reports.ts`)
Zero database migrations are needed. All report logic lives in pure TypeScript functions tested without a DB or DOM:
- Input: `{ wallets, entries, categories, tags, groupRows, groupSettings, fallbackGroupCategoryId, query, today }` where `query` is `{ mode: 'week' | 'month' | 'year' | 'custom', month?, week?, year?, from?, to?, walletId?, includeGroups }`.
- Runs `replayEntryVndAmounts(wallets, allCalcEntries)` once across the user's history (including `groupWalletEntries` so non-VND wallets stay in exact rate sync), then computes:
  1. `summary`: current period `{ spent, income, net }`, `approximate`, `perCurrency[]`, `unratedWalletIds[]`, `previousPeriod` totals & deltas, `baseline3m` totals & deltas (to-date for in-progress periods, `historyMonthsAvailable: 0..3`).
  2. `healthSeries`: array of cumulative points `{ label, date, income, expense, avgIncome, avgExpense }` through `today` (actuals) and full period (3-month grayed baseline), plus `granularity: 'day' | 'month'`.
  3. `spendingByCategory` and `incomeByCategory`: sorted descending `{ categoryId, name, icon, amount, percent, subCategories[] }`.
  4. `categoryDrilldown(categoryId)`: returns single-category summary, previous/3m deltas, sub-category breakdown (`SubCategorySlice[]`), and filtered row IDs/descriptors.
  5. `tags`: `{ expense: TagReportBar[], income: TagReportBar[], hasMultiTagOverlap: boolean }`.
  6. `walletBalanceSeries`: present when `walletId` is set (computed in that wallet's native currency via `walletBalanceSeries(...)`).

### 5.2 Browser Local-Copy Execution & Fallback (`libs/web/data-access/src/reports.ts`)
- `usePersonalReport(query)` composes `useTxCopy()`, `useGroupCopy()`, `useWalletDetails()`, `useCategories()`, `useTags()`, and `useGroupSettings()`.
- **Ready state:** When `txCopy` (`status === 'ready'`), `groupCopy` (when `includeGroups` is true and `status === 'ready'`), and the reference lists have loaded, `buildReport(...)` runs synchronously inside `useMemo` — **0 D1 reads** on every period step, filter toggle, wallet pick, category drill-down, or tag search.
- **Fallback state:** If IndexedDB is `'unavailable'` or `'loading'` (after the existing `1500ms` `'opening'` grace window in `useTxCopy`), `usePersonalReport` automatically calls `GET /api/me/personal/report?...` and swaps seamlessly to the local copy once ready.
- **`useCurrentMonthReportTotals()`** powers `SpendingBook.tsx`'s `Tháng này chi` / `Thu` line using the exact same copy-first / report-fallback pattern (so `SpendingBook` never hits `GET /me/personal/summary`'s pinned response shape).

### 5.3 Fallback Route: `GET /me/personal/report` (`apps/api/src/personal/reports.ts`)
Mounted on `personalRoutes()` in `apps/api/src/personal/routes.ts`, guarded by `requirePersonal`, scoped strictly to `user.id`:
- Query params: `mode` (`month` default | `week` | `year` | `custom`), `month` (`YYYY-MM`), `from` / `to` (`YYYY-MM-DD`, validated like `list.ts`; custom up to 366 days on server fallback), `walletId` (optional; returns `404` if not owned by `user.id`), `groups` (`show` default | `hide`).
- Loads wallets (`loadCalc` pattern + tags on entries in the `[baselineStart..periodEnd]` window, plus minimal earlier non-VND history only if needed for W12 conversion, plus `loadGroupRows` + `loadGroupSettings` + categories + tags) and invokes the exact same `@cc/core` `buildReport(...)`.
- **Strictly 0 writes (**my call**):** `GET /me/personal/report` never lazily seeds starter categories into D1 on read. If `${userId}:group`, `${userId}:lend`, or `${userId}:borrow` have not yet been seeded on a cold call, `buildReport` maps them cleanly to synthetic labels (`"Nhóm"` / `"Cho vay"` / `"Đi vay"`) or `__uncategorized__`.

### 5.4 Cloudflare Free-Plan Cost (Measured Ranges: 1 year of daily transactions ≈ 365–1,500 personal rows, 10 wallets, 20 groups)

| Action | Queries | Rows read | Rows written |
|---|---|---|---|
| Open `/reports` (local copy ready, steady state) | 4–5 (auth, sync version checks, small reference lists if uncached) | ~3–25 rows (sync cursor + refs) | 0 |
| Switch period / toggle groups / drill into category / search tags / scope wallet (local copy ready) | **0** | **0** | 0 |
| Server fallback `GET /me/personal/report` (1 full year + 3-month baseline) | 10–14 (≤ 50 limit) | ~500–2,500 rows (up to ~4,000 with heavy group history; ≤ 5M/day) | 0 |
| Opening `Sổ chi tiêu` main screen (local copy ready) | +0 new | +0 new | 0 |
| Opening `Sổ chi tiêu` main screen (cold fallback, 1 month + 3m baseline) | 10–12 (within 50) | ~120–450 rows | 0 |

*Note on #109 (balance caching):* Because steady-state Reports runs in the browser at ~3–25 rows read and even the 1-year server fallback stays well under 50 queries and ~4,000 rows read, #109 is **not** needed for #115.

---

## 6. Visual Design, Accessibility, and `/impeccable` Checkpoint

- **Visual reference:** Brainstormed and confirmed by the owner on 2026-11-24 (`reports-brainstorm-mockup-v2.html`, minus the dropped `"Theo ngày"` toggle).
- **Design system (`DESIGN.md`):**
  - Warm off-white Rice Paper page (`bg-background`), sticky header (`← Báo cáo` / `← <Category>`), white `rounded-xl` cards (`border border-border`, zero shadows on flat content, zero nested cards).
  - Money always in `tabular-nums`, formatted via `@cc/core` `formatMoney` (`1.245.000₫`, `≈` when converted VND is included), Income in Leaf (`text-success`), Spending in Lychee (`text-danger`), net balance in Leaf/Lychee.
  - Charts use shadcn's `ChartContainer` / Recharts (`libs/web/ui/src/components/ui/chart.tsx`), verified at **375px** width with zero horizontal overflow, responsive sizing, and full respect for `motion-reduce:`.
  - Non-colour redundancy: every chart is paired with a tabular list or summary row carrying exact values, percentages, and text labels; the 3-month baseline uses dashed/shaded grayed area styling distinct from the solid green/red cumulative lines.
  - Touch targets ≥ `44px` (`min-h-11`), search inputs `16px` (`text-base` to prevent iOS zoom), accessible `aria-label`s on charts, and focus management across sheets/navigation.
- **Language:** Vietnamese first, English second (`libs/web/i18n/src/vi.ts` and `en.ts`); every new Vietnamese string marked `// REVIEW`.
- **Two-shell parity:** Same screens in `apps/web` and `apps/zalo` (clearing Zalo Mini App header/capsule safe areas automatically via `Screen`).
- **`/impeccable` Checkpoint (Issue #115 Step 4):** Before writing screen UI code in `libs/web/screens`, run `/impeccable` to shape the final production layouts, review live with the owner, then implement.

---

## 7. Tests That Must Exist (Zero Existing Tests Edited)

1. **`@cc/core` unit tests:**
   - Cumulative `Thu & Chi` daily line + 3-month grayed area calculation across Month (28/30/31-day alignment), Week (Mon–Sun), Year, and Custom ranges; `k = 0/1/2/3` history handling; in-progress cutoff at `today`.
   - Parent-category roll-up, sub-category drill-down, `"<Parent> (chung)"`, and `__uncategorized__` (`"Chưa phân loại"`).
   - Point-in-time W12 VND conversion (`replayEntryVndAmounts`) across VND, USD, USDT, cross-currency transfers, unrated wallets (`unratedWalletIds`), and `≈` flagging.
   - Counting rules & agreement test: report totals match `sumCounted` + `groupRowsTotals` across manual entries, transfers (excluded vs included), `buy`/`sell`, adjustments, quick expenses, group shares, group funds, pending rows, `countLoans` off/on, excluded wallets (#134), and archived wallets.
   - `walletBalanceSeries`: opening balance before `period.from`, daily closing balances, `closing === walletBalance(...)` invariant, `min`/`max` dates, native currency formatting.
   - By-tag aggregation, multi-tag overlap flag, accent-folded tag search.
2. **API tests (`apps/api/test/`):**
   - Auth & Phase 2 guards: 401 when signed out, 403 when `personalArea` switch is off, 404 when scoping `walletId` belonging to another user, strict data isolation across two accounts.
   - Server `GET /me/personal/report` matches `listFromCopy` + `groupRowsFromCopy` / `GET /me/personal/transactions` totals on a mixed fixture.
   - Query & row count guard test: 1 year of daily transactions (365+ rows) plus 3 months prior baseline completes well under 50 queries.
3. **Screen & visual tests (`libs/web/screens`):**
   - Switch-off user sees no `"Báo cáo"` row on Home and `/reports` redirects to `/trips`.
   - Two-tap flow: navigate `"Báo cáo"` / previous month → tap `"Ăn uống"` → verifies last-month spending, vs-prior-month comparison, sub-category pie, and transactions.
   - Tag bar chart: Top 5 default, `"Xem tất cả"` expansion, live search filtering with >6 tags, `Chi`/`Thu` toggle, link to `/transactions?tagId=...`.
   - Single-wallet scope: switches to native currency (`USDT` without `≈`), renders balance-over-time chart + checkpoints, shows quiet note when scoping an `excludeFromReports` wallet.
   - Empty and thin data states render `EmptyState` / calm messages with no broken SVGs.
   - Rendered verification at **375px** width in **Jade** and at least one other theme (**Pink** or **Sky**), verifying `style-guard.test.ts` and `theme-tokens.test.ts`.
4. **Existing regression gates (all untouched & passing):** `npm test`, `npm run typecheck`, `npm run lint`, Playwright `golden-path` and `walkthrough`.

---

## 8. Left to the Builder

- Exact file and component breakdown inside `@cc/core`, `@cc/web-data-access`, and `@cc/web-screens`.
- Exact shadcn `ChartContainer` / Recharts axis tick formatter, responsive container fallback for JSDOM unit tests, and custom tooltip styling using theme tokens.
- Exact `data-testid` and `fsl-*` class naming for new Reports elements and rows.
- Complete i18n keys (`// REVIEW` on new Vietnamese lines in `vi.ts`, matching `en.ts`) beyond the labels named above.
- Whether to deliver in one PR or two sequential PRs (e.g., Part 1 `@cc/core` + `GET /me/personal/report` + `@cc/web-data-access`, followed by Part 2 `libs/web/ui` chart + `/impeccable` review + screens).
