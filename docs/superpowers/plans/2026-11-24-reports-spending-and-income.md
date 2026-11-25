# Reports: Spending & Income Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task (with the workspace's `gemini-execution` workflow where applicable). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Phase 2 personal spending and income reports (`/reports`, `/reports/category/:categoryId`, and quiet monthly totals + `"Báo cáo"` entry row on `Sổ chi tiêu`) featuring the cumulative daily health line chart over grayed 3-month average area charts, parent→sub-category pie drill-downs, a many-tags horizontal bar chart, single-wallet scoping with balance over time, multi-currency `≈ VND` W12 conversion, and local-first browser execution backed by a 0-write server fallback.

**Architecture:** Keep all financial aggregation pure and deterministic in `@cc/core` (`wallets.ts` extensions + `reports.ts`) so the browser (`usePersonalReport` over IndexedDB `txCopy` + `groupCopy` at 0 D1 reads in steady state) and the server fallback (`GET /me/personal/report` in `apps/api`) produce identical numbers. Install shadcn's `chart` primitive (`recharts`) in `libs/web/ui` with `--chart-1..6` tokens in `:root`/`@theme inline`, shape the screen layouts at the Task 5 `/impeccable` checkpoint before building screens, and render identical routes across `apps/web` and `apps/zalo`.

**Tech Stack:** TypeScript 7 (`tsc`), Nx monorepo (`@cc/core`, `@cc/web-data-access`, `@cc/web-i18n`, `@cc/web-ui`, `@cc/web-screens`, `apps/api`), Cloudflare Workers + D1 / Drizzle ORM, Hono, React 19, React Query, React Router, Tailwind CSS v4, shadcn/ui + Recharts, Vitest, Testing Library, Playwright.

**Spec:** [`docs/superpowers/specs/2026-11-24-reports-spending-and-income-design.md`](../specs/2026-11-24-reports-spending-and-income-design.md)

## Global Constraints

- **Zero DB migrations & additive only:** Never alter Phase 1 tables or edit Phase 1 group-money files (`libs/api/db/src/commit.ts`, `computeBalances`/`computeShares`/`suggestTransfers` in `@cc/core`, `apps/api/src/trips/snapshot.ts`, `apps/api/src/me/balances.ts`, `apps/api/src/me/settle.ts`, `apps/api/src/me/ledger.ts`, `libs/api/auth/src/device.ts`, expense/payment routes). Never extend `apps/api/src/me/ledger.ts`.
- **Never edit or delete an existing test:** `apps/api/test/personal-list.test.ts` pins `GET /me/personal/summary` with `.toEqual` (do **not** modify `GET /me/personal/summary`) and pins archived-wallet history counting. `libs/web/screens/src/screens/__tests__/spending-book.test.tsx` pins `book-total`'s first `.fsl-amount` without `text-success`.
- **Cloudflare free plan:** ≤ 50 DB queries/request, **0 rows written** on `GET /me/personal/report` (never lazily seed starter categories on read), well under 5M rows read/day.
- **Guard & privacy:** Every new API route uses `requirePersonal` (403 when switch off), filters by `user.id`, and returns 404 for another user's `walletId`. Every new web route sits inside `<PersonalRoute>` in `libs/web/screens/src/App.tsx` (redirects to `/trips` when switch off).
- **Integer money & product exclusions:** All amounts are whole integers in each currency's smallest unit (never float). No bank APIs, live FX/market prices, Gmail/Drive access, or personal-money push/SMS/email.
- **Design & repository guards:**
  - `libs/web/screens/src/test/style-guard.test.ts`: `libs/web/ui/src/styles/globals.css` is the only CSS file; zero raw hex (`#...`) in `.ts`/`.tsx` under `libs/web/*/src/`.
  - `libs/web/ui/src/styles/__tests__/theme-tokens.test.ts`: `[data-theme]` blocks set ONLY their 6 theme tokens (`--background`, `--primary`, `--primary-foreground`, `--secondary`, `--secondary-foreground`, `--ring`). Add `--chart-1..6` ONLY in `:root` and `@theme inline`. Money uses Leaf (`--success`) / Lychee (`--danger`), never a theme accent.
  - `libs/web/screens/src/test/ui-components-guard.test.ts`: Zero raw `<input>`, `<select>`, `<label>`, or `role="switch|tablist|tab|checkbox"` in app `.tsx` files—use shadcn `<Input>`, `<NativeSelect>`, `<Label>`, `<Switch>`, `<Tabs>`.
  - Nx import boundaries (`CLAUDE.md`): cross-library imports use `@cc/*`; intra-library imports are relative (never `@cc/web-ui/...` inside `libs/web/ui`). Lint only via `npm run lint`.
  - Phone-first at 375px (`min-h-11` ≥ 44px touch targets, `text-base` 16px search fields, `tabular-nums` amounts, `motion-reduce:` honoured), Vietnamese first (`// REVIEW` on every new Vietnamese line in `vi.ts`), English second (`en.ts`), same screens on web and Zalo Mini App.
- **Commits:** Do not run `git commit` unless the owner explicitly asks.

## Review Focus

- **In-progress periods & uneven calendar months (`Feb 28/29` vs `31`-day months):** When `today` is mid-month or `month` has 31 days vs prior 28/30-day months, day `d` averages `min(d, lastDayOfPriorMonth)`, current green/red lines stop at `today` (null on future buckets), both `previousPeriod` and `baseline3m` compare actual-to-`today` against prior periods at the same day-of-period index (`Jan 1..today` vs prior years `Jan 1..same month/day` in `Year` mode), and `k = 0` prior history hides the baseline cleanly. *Pinned in Task 2 (`libs/shared/core/test/reports.test.ts`).*
- **Unrated foreign wallets (idle vs active vs unrated-only period):** Idle unrated foreign wallets never trigger `unratedWallets`; active ones omit null-VND entries from VND pies/bars while surfacing `perCurrency` + `"chưa có tỷ giá"` with 1-tap wallet drill-in; an unrated-only period renders `perCurrency` + the unrated notice rather than `"Chưa có giao dịch"`. *Pinned in Task 2 & Task 7.*
- **`countLoans = true` loan/payback category routing & cold 0-write fallback:** Loans and matched paybacks bypass `defaultGroupCategoryId` and route strictly by cashflow direction (`"Cho vay"` for outflow, `"Đi vay"` for inflow) so Spending & Income pies never mix; cold `GET /me/personal/report` writes 0 DB rows and maps unseeded starter IDs cleanly to synthetic IDs/labels. *Pinned in Task 2 & Task 3.*
- **Excluded default wallet vs archived wallet history & `/transactions` agreement:** `excludeFromReports: true` ignores personal entries AND resolved group rows (`createGroupWalletResolver`) under "All wallets" while remaining inspectable directly with a quiet banner; archived wallets' historical entries stay included in spending/income totals. *Pinned in Task 2 & Task 3.*
- **Existing test & UI guard traps:** `GET /me/personal/summary` stays unmodified; `BookTotal`'s first `.fsl-amount` stays neutral; `useCurrentMonthReportTotals()` never surfaces error alerts when unmocked; `ui-components-guard.test.ts`, `style-guard.test.ts`, and `theme-tokens.test.ts` pass untouched. *Pinned in Task 4, Task 5, Task 6, Task 7, Task 8.*

---

## File Structure

| File | Responsibility |
|---|---|
| `libs/shared/core/src/wallets.ts` | Export `replayEntryVndAmounts` (point-in-time W12 VND values per entry) and `walletBalanceSeries` (native-currency balance trajectory). |
| `libs/shared/core/src/reports.ts` | Pure report engine: `resolveReportPeriod`, `resolveGroupReportCategoryId`, `buildReport`, `buildCategoryDrilldown`, `filterReportTags`, and all report DTO types. |
| `libs/shared/core/src/index.ts` | Re-export `./reports`. |
| `apps/api/src/personal/reports.ts` | `reportRoutes()` mounting `GET /me/personal/report` behind `requirePersonal` with strict 0-write reads. |
| `apps/api/src/personal/routes.ts` | Mount `reportRoutes()`. |
| `libs/web/data-access/src/reports.ts` | `PERSONAL_REPORT_KEY`, `buildReportQueryString`, `usePersonalReport`, `useCategoryDrilldown`, `useCurrentMonthReportTotals`. |
| `libs/web/data-access/src/personalMoney.ts` | Invalidate `PERSONAL_REPORT_KEY` across money/category/tag mutations. |
| `libs/web/i18n/src/vi.ts`, `en.ts` | `reports.*` copy keys (`// REVIEW` on all new Vietnamese strings). |
| `libs/web/ui/src/components/ui/chart.tsx`, `libs/web/ui/src/styles/globals.css`, `libs/web/ui/package.json` | shadcn `chart` primitive (`recharts`), `--chart-1..6` tokens in `:root` & `@theme inline`. |
| `libs/web/screens/src/components/reports/*` | `reportUrl.ts`, `ReportPeriodBar.tsx`, `ReportFilterRow.tsx`, `HealthTrendCard.tsx`, `CategoryPiesCard.tsx`, `TagBarsCard.tsx`, `WalletBalanceCard.tsx`. |
| `libs/web/screens/src/screens/ReportsScreen.tsx`, `ReportCategoryScreen.tsx` | `/reports` and `/reports/category/:categoryId` screens. |
| `libs/web/screens/src/App.tsx`, `libs/web/screens/src/screens/SpendingBook.tsx` | Guarded `/reports*` routes; quiet monthly totals & `"Báo cáo"` row on `SpendingBook`. |

---

### Task 1: `@cc/core` Point-in-Time W12 VND Conversion & Wallet Balance Over Time

**Files:**
- Modify: `libs/shared/core/src/wallets.ts`
- Test: `libs/shared/core/test/reports-wallets.test.ts`

**Interfaces:**
- Consumes: `CalcWallet`, `CalcEntry`, `walletBalance` (`libs/shared/core/src/wallets.ts`); `GroupRow`, `GroupSettingsView`, `groupWalletEntries` (`libs/shared/core/src/groupShares.ts`).
- Produces (exported from `libs/shared/core/src/wallets.ts`, re-exported via `index.ts`):
  ```ts
  export interface EntryVndReplayResult {
    /** Entry id -> VND equivalent at replay time (whole VND, >= 0), or null if wallet is permanently unrated. */
    entryVnd: Map<string, number | null>;
    /** Wallet ids that remain permanently unrated after full replay. */
    unratedWalletIds: Set<string>;
  }

  export interface WalletBalancePoint {
    date: string;
    label: string;
    balance: number;
  }

  export interface WalletBalanceSeriesResult {
    walletId: string;
    currency: CurrencyCode;
    opening: number;
    closing: number;
    netChange: number;
    min: { value: number; date: string };
    max: { value: number; date: string };
    points: WalletBalancePoint[];
  }

  export function replayEntryVndAmounts(
    wallets: CalcWallet[],
    entries: CalcEntry[],
  ): EntryVndReplayResult;

  export function walletBalanceSeries(
    wallet: CalcWallet & { kind?: string; isDefault?: boolean },
    personalEntries: CalcEntry[],
    groupRows: GroupRow[],
    allWallets: (CalcWallet & { kind?: string; isDefault?: boolean })[],
    defaultWalletId: string | null,
    groupSettings: GroupSettingsView,
    period: { from: string; to: string; granularity: 'day' | 'month' },
    today: string,
  ): WalletBalanceSeriesResult;
  ```

- [ ] **Step 1: Write failing tests in `libs/shared/core/test/reports-wallets.test.ts`**

Assert:
1. VND wallet entries return exact `entry.amount` in `entryVnd`.
2. Non-VND wallet funded by two VND transfers (`25_000_000 VND → 100_000` [1,000.00 USDT], then `13_000_000 VND → 50_000` [500.00 USDT]) computes moving-average rate (`25_000` → `25_333.33...` VND per minor unit), so spending `30_000` (300.00 USDT) afterwards records `7_600_000` VND in `entryVnd`.
3. Entries on a non-VND wallet dated *before* its first VND transfer-in retroactively receive that first inflow rate (W19c), and entries on an unrated non-VND wallet (`startCostVnd: null`, no transfers in) yield `null` in `entryVnd` and include that wallet id in `unratedWalletIds`.
4. `walletBalanceSeries` computes `opening = startAmount + Σ(deltas < from)` (including personal entries, transfers, `buy`/`sell`, adjustments, and `groupWalletEntries` mapped to that wallet), tracks `min`/`max` dates and daily (or monthly for `granularity: 'month'`) points through `min(period.to, today)`, and satisfies `closing === walletBalance(wallet, combinedEntries)` when `period.to >= today` and no future-dated entries exist.

- [ ] **Step 2: Run `@cc/core` tests to confirm failure**

Run: `npx nx test core`
Expected: FAIL (`replayEntryVndAmounts` / `walletBalanceSeries` not exported).

- [ ] **Step 3: Implement `replayEntryVndAmounts` and `walletBalanceSeries` in `libs/shared/core/src/wallets.ts`**

- Refactor or share the W12 state-machine loop inside `replayWallets` so both `replayWallets` and `replayEntryVndAmounts` produce identical W12 conversions without duplicating the state transitions: track per-entry `entryVnd` (`entry.amount` for VND, `Math.round(rate * entry.amount)` for rated non-VND, queued against wallet id for W19c retroactive first-inflow backfill before a wallet becomes rated, `null` if still unrated at end of replay). Keep all existing exports (`replayWallets` consumers, `vndTotal`, `walletVndValues`) byte-for-byte compatible.
- Implement `walletBalanceSeries` using `groupWalletEntries(groupRows, allWallets, defaultWalletId, groupSettings)` combined with `personalEntries` filtered to `wallet.id`: accumulate `opening` for `date < period.from`, then step day-by-day (or month-by-month using the last date of each month capped at `cutoff = period.to < today ? period.to : today`), keeping `min`/`max` over `[opening at period.from, ...points]`. Note: omit any future-dated points strictly after `today` when the period is in progress so the line stops cleanly at `today`.

- [ ] **Step 4: Run `@cc/core` tests to verify pass**

Run: `npx nx test core`
Expected: PASS across all `@cc/core` tests including `reports-wallets.test.ts` and existing `wallets.test.ts`.

---

### Task 2: `@cc/core` Pure Reports Engine (`reports.ts`)

**Files:**
- Create: `libs/shared/core/src/reports.ts`
- Modify: `libs/shared/core/src/index.ts`
- Test: `libs/shared/core/test/reports.test.ts`

**Interfaces:**
- Consumes: `CurrencyCode`, `CURRENCIES` (`currency.ts`), `CategoryView`, `TagView`, `WalletDetailView`, `EntryView`, `ListRow` (`api-types.ts`), `CalcEntry`, `replayEntryVndAmounts`, `walletBalanceSeries`, `sumCounted` (`wallets.ts`), `GroupRow`, `GroupSettingsView`, `groupRowEffect`, `loanPaybacks`, `createGroupWalletResolver`, `groupRowCategoryId`, `groupWalletEntries` (`groupShares.ts`), `foldForSearch` (`listFilter.ts`).
- Produces (exported from `libs/shared/core/src/reports.ts` and re-exported by `libs/shared/core/src/index.ts`):
  ```ts
  export const UNCATEGORIZED_CATEGORY_ID = '__uncategorized__';
  export const SYNTHETIC_GROUP_CATEGORY_ID = '__group__';
  export const SYNTHETIC_LEND_CATEGORY_ID = '__lend__';
  export const SYNTHETIC_BORROW_CATEGORY_ID = '__borrow__';

  export type ReportPeriodMode = 'week' | 'month' | 'year' | 'custom';

  export interface ReportQuery {
    mode: ReportPeriodMode;
    /** 'YYYY-MM' when mode === 'month' */
    month?: string;
    /** Any 'YYYY-MM-DD' inside target Mon-Sun week when mode === 'week' */
    week?: string;
    /** 'YYYY' when mode === 'year' */
    year?: string;
    from?: string;
    to?: string;
    walletId?: string;
    includeGroups: boolean;
  }

  export interface ReportPeriodWindow {
    mode: ReportPeriodMode;
    from: string;
    to: string;
    effectiveTo: string;
    inProgress: boolean;
    granularity: 'day' | 'month';
    previous: { from: string; to: string; effectiveTo: string };
    baselines: { from: string; to: string; effectiveTo: string }[];
  }

  export interface ReportMoneyTotals {
    spent: number;
    income: number;
    net: number;
  }

  export interface ReportDelta {
    previousSpent: number;
    previousIncome: number;
    spentDiff: number;
    incomeDiff: number;
    spentPct: number | null;
    incomePct: number | null;
  }

  export interface ReportHealthPoint {
    index: number;
    date: string;
    label: string;
    income: number | null;
    expense: number | null;
    avgIncome: number | null;
    avgExpense: number | null;
  }

  export interface ReportSubCategoryItem {
    categoryId: string;
    name: string;
    icon: string;
    amount: number;
    percent: number;
    isGeneralParentBucket?: boolean;
  }

  export interface ReportCategoryItem {
    categoryId: string;
    name: string;
    icon: string;
    type: 'expense' | 'income';
    amount: number;
    percent: number;
    subCategories: ReportSubCategoryItem[];
  }

  export interface ReportTagItem {
    tagId: string;
    name: string;
    amount: number;
    percent: number;
    entryCount: number;
  }

  export interface ReportUnratedWallet {
    walletId: string;
    name: string;
    currency: CurrencyCode;
    spent: number;
    income: number;
  }

  export type ReportRowRef =
    | { kind: 'entry'; entryId: string; categoryId: string; type: 'expense' | 'income'; vndAmount: number | null; nativeAmount: number }
    | { kind: 'group'; groupRowId: string; categoryId: string; type: 'expense' | 'income'; amount: number };

  export interface ReportData {
    period: ReportPeriodWindow;
    currency: CurrencyCode;
    approximate: boolean;
    singleWallet: { walletId: string; name: string; currency: CurrencyCode; excludedFromTotal: boolean } | null;
    totals: ReportMoneyTotals;
    perCurrency: { currency: CurrencyCode; spent: number; income: number }[];
    previousDelta: ReportDelta;
    baseline3m: (ReportDelta & { historyCount: number }) | null;
    unratedWallets: ReportUnratedWallet[];
    countedCount: number;
    hasAnyUnratedOnly: boolean;
    healthSeries: ReportHealthPoint[];
    spendingByCategory: ReportCategoryItem[];
    incomeByCategory: ReportCategoryItem[];
    tags: {
      expense: ReportTagItem[];
      income: ReportTagItem[];
      hasMultiTagOverlap: boolean;
    };
    walletBalance: WalletBalanceSeriesResult | null;
    /** Normalized counted rows in the active period for 0-cost drill-down. */
    countedRows: ReportRowRef[];
  }

  export interface ReportCategoryDrilldown {
    categoryId: string;
    name: string;
    icon: string;
    type: 'expense' | 'income';
    currency: CurrencyCode;
    approximate: boolean;
    total: number;
    previousTotal: number;
    diffFromPrevious: number;
    pctFromPrevious: number | null;
    baseline3mAvg: number | null;
    historyCount: number;
    subCategories: ReportSubCategoryItem[];
    rows: ReportRowRef[];
  }

  export function resolveReportPeriod(query: ReportQuery, today: string): ReportPeriodWindow;
  export function resolveGroupReportCategoryId(
    row: GroupRow,
    settings: GroupSettingsView,
    payback: number,
    categories: CategoryView[],
  ): { categoryId: string; side: 'expense' | 'income' } | null;
  export function buildReport(input: {
    wallets: WalletDetailView[];
    entries: Array<CalcEntry & { categoryId: string | null; tagIds: string[] }>;
    categories: CategoryView[];
    tags: TagView[];
    groupRows: GroupRow[];
    groupSettings: GroupSettingsView;
    query: ReportQuery;
    today: string;
  }): ReportData;
  export function buildCategoryDrilldown(
    report: ReportData,
    input: Parameters<typeof buildReport>[0] & { categoryId: string },
  ): ReportCategoryDrilldown | null;
  export function filterReportTags(tags: ReportTagItem[], search: string): ReportTagItem[];
  ```

- [ ] **Step 1: Write failing tests in `libs/shared/core/test/reports.test.ts`**

Cover every Review Focus rule and spec requirement:
1. **Periods & baselines (`resolveReportPeriod` + `buildReport`):**
   - `month` default on `today = '2026-11-24'`: `from = '2026-11-01'`, `to = '2026-11-30'`, `effectiveTo = '2026-11-24'`, `inProgress = true`; `previous` compares `2026-10-01..2026-10-24` (`effectiveTo`); `baselines` aligns 31-day/28-day prior months with `min(d, lastDayOfPriorMonth)`; future buckets `25..30` have `income: null, expense: null` while `avgIncome`/`avgExpense` span `01..30`.
   - Completed past month (`month = '2026-10'` on `today = '2026-11-24'`): full-to-full comparison (`2026-10-01..2026-10-31` vs `2026-09-01..2026-09-30`), `inProgress = false`.
   - `week` (Mon–Sun), `year` (`T1..T12` cumulative, `previous` & `baselines` cut off at exact `Jan 1..today` calendar day), and `custom` (`L <= 90` daily vs `L > 90` monthly).
   - `k = 0/1/2/3` prior history windows determined from earliest entry/group date (`k = 0` → `baseline3m === null` and `avgIncome`/`avgExpense` are `null`).
2. **Agreement invariant with `/transactions`:**
   - Fixture with personal expenses/income, default `excludeFromReports: true` transfer, explicit `excludeFromReports: false` transfer, `buy`/`sell`, `adjustment` entry, quick expenses, group shares, group fund contribution, pending group rows (`pending`, `says_paid`), `countLoans` off/on, excluded wallet (`excludeFromReports: true`), and archived wallet (`archived: true`).
   - Assert `report.totals.spent` / `income` equal `sumCounted` + `groupRowsTotals` (excluding `excludedWalletIds` on both personal entries and resolved group rows, while keeping archived wallet entries).
3. **`countLoans = true` category routing:**
   - Even when `settings.defaultGroupCategoryId` points to `"Ăn uống"`, loans (`intent = 'loan'`) and matched paybacks (`payback > 0`) bypass `defaultGroupCategoryId` and route strictly by cashflow direction (`Cho vay` for outflow, `Đi vay` for inflow); test both seeded starter categories (`starterKey === 'group' | 'lend' | 'borrow'`) and cold unseeded fallback (`SYNTHETIC_*` ids mapped to `"Nhóm"` / `"Cho vay"` / `"Đi vay"`).
4. **Parent→sub-category roll-up & drill-down (`buildCategoryDrilldown`):**
   - Sub-categories roll into parent on `spendingByCategory`; drill-down returns sub-categories + `"<Parent> (chung)"` for direct parent entries + `diffFromPrevious`/`baseline3mAvg`; uncategorized entries group under `UNCATEGORIZED_CATEGORY_ID`.
5. **Multi-currency & unrated wallets:**
   - All wallets combines VND + rated USDT into `≈ VND` (`approximate: true`); idle unrated wallet is NOT in `unratedWallets`; active unrated wallet IS in `unratedWallets`, omits null-VND entries from VND pies/bars, populates `perCurrency`; unrated-only period sets `hasAnyUnratedOnly: true`, `countedCount > 0`.
   - Single-wallet scope (`walletId` on USDT wallet) returns `currency: 'USDT'`, `approximate: false`, `walletBalance` present; scoping an `excludeFromReports: true` wallet sets `singleWallet.excludedFromTotal: true` and still computes all charts.
6. **Tags:**
   - Top-down sorted percentages, `hasMultiTagOverlap: true` when one entry has ≥2 tags, `filterReportTags(items, 'an')` matches `#Ăn uống` accent-insensitively.

- [ ] **Step 2: Run `@cc/core` tests to confirm failure**

Run: `npx nx test core`
Expected: FAIL (`./reports` module does not exist).

- [ ] **Step 3: Implement `libs/shared/core/src/reports.ts` and re-export from `libs/shared/core/src/index.ts`**

Keep helper functions small and cohesive:
- Period math (`resolveReportPeriod`, calendar arithmetic in pure UTC `YYYY-MM-DD` strings — zero local-timezone drift).
- Inclusion filter (`isWalletInScope`, `excludedWalletIds`, `resolveGroupReportCategoryId`).
- Aggregation pass building `healthSeries` (cumulative sum up to `effectiveTo` + average over `k` baseline windows), parent/sub-category maps, `tags` map, `perCurrency`, `unratedWallets`, `walletBalance` (via `walletBalanceSeries` when `query.walletId` is set), and `buildCategoryDrilldown` (recomputing prior/baseline totals for that single parent category + matching `ReportRowRef[]`).

- [ ] **Step 4: Run `@cc/core` tests to verify pass**

Run: `npx nx test core`
Expected: PASS across all `@cc/core` tests.

---

### Task 3: Server Fallback Route `GET /me/personal/report` (`apps/api`)

**Files:**
- Create: `apps/api/src/personal/reports.ts`
- Modify: `apps/api/src/personal/routes.ts`
- Test: `apps/api/test/personal-reports.test.ts`

**Interfaces:**
- Consumes: `buildReport`, `ReportData`, `ReportPeriodMode`, `ReportQuery`, `CurrencyCode`, `CalcEntry` (`@cc/core`), `requirePersonal` (`@cc/api-auth/personal`), `getSessionUser` (`@cc/api-auth/session`), `loadCalc` (`apps/api/src/personal/wallets.ts`), `loadGroupRows`, `loadGroupSettings` (`apps/api/src/personal/groupShares.ts`), `nowIso` (`@cc/api-util/ids`), `requireDate`, `ApiError`.
- Produces: `reportRoutes(): Hono<AppBindings>` exposing `GET /me/personal/report` returning `200 ReportData` (and **never** modifying `GET /me/personal/summary` in `list.ts`).

- [ ] **Step 1: Write failing tests in `apps/api/test/personal-reports.test.ts`**

Assert:
1. Signed out → `401`; `personalArea` switch off → `403`.
2. Foreign `walletId` (owned by user B) → `404`; invalid `mode` / `month` / `from > to` / custom range `> 366` days → `422`.
3. Cross-account isolation: user B's entries, wallets, categories, tags, and group rows never affect user A's `GET /me/personal/report`.
4. Mixed-fixture agreement: `GET /me/personal/report?month=2026-11&today=2026-11-24` matches `GET /me/personal/transactions?month=2026-11&groups=show` totals across personal entries, transfers, quick expenses, group shares, excluded wallets, and archived wallets.
5. **Cold 0-write guarantee:** When a fresh switched-on user with 0 rows in `personal_categories` calls `GET /me/personal/report`, response is `200`, `personal_categories` row count in D1 remains `0`, and group loans/shares still resolve cleanly via synthetic labels (`"Nhóm"` / `"Cho vay"` / `"Đi vay"`).
6. **Query budget test:** Seed 365+ daily personal transactions spanning 12 months + baseline + tags + group rows, instrument or count SQL queries / assert `GET /me/personal/report?mode=year&year=2026&today=2026-11-24` succeeds in `< 50` queries (expected ~10–14 queries).

- [ ] **Step 2: Run API report test to confirm failure**

Run: `npx nx test api -- test/personal-reports.test.ts`
Expected: FAIL (`404` route not found).

- [ ] **Step 3: Implement `apps/api/src/personal/reports.ts` and mount in `apps/api/src/personal/routes.ts`**

- Parse & validate query params: `mode` (`month` default | `week` | `year` | `custom`), `month`, `week`, `year`, `from`/`to` (custom bounded to 366 days like `list.ts`), optional `walletId` (checked against user's wallets; 404 if missing), `groups` (`show` default | `hide`), optional `today` (`requireDate`, defaults to `nowIso().slice(0, 10)`).
- Reuse `loadCalc(db, user.id)` + fetch entry `categoryId` + entry tags (`personalTransactionTags` joined on `personalTransactions` for `user.id`, or batch-loaded in one query), `personalCategories`, `personalTags`, `loadGroupRows`, `loadGroupSettings` — strictly read-only, 0 writes. Call `buildReport(...)` and return `200`.
- Mount `app.route('/', reportRoutes());` in `apps/api/src/personal/routes.ts`.

- [ ] **Step 4: Run API tests to verify pass**

Run: `npx nx test api -- test/personal-reports.test.ts test/personal-list.test.ts`
Expected: PASS (new report tests pass AND untouched `personal-list.test.ts` stays green).

---

### Task 4: Local-First Report Hooks (`@cc/web-data-access`) & i18n Copy (`@cc/web-i18n`)

**Files:**
- Create: `libs/web/data-access/src/reports.ts`
- Modify: `libs/web/data-access/src/personalMoney.ts:25-144`
- Modify: `libs/web/i18n/src/vi.ts`, `libs/web/i18n/src/en.ts`
- Test: `libs/web/data-access/src/__tests__/reports-hooks.test.tsx`

**Interfaces:**
- Consumes: `buildReport`, `buildCategoryDrilldown`, `ReportData`, `ReportCategoryDrilldown`, `ReportQuery`, `EntryView`, `GroupRow` (`@cc/core`), `useTxCopy`, `useGroupCopy` (`./txCopy/hooks`), `useWalletDetails`, `useCategories`, `useTags`, `useGroupSettings` (`./personalMoney`), `currentMonthLocal`, `todayLocal` (`@cc/web-util/localDate`), `apiFetch` (`./client`).
- Produces (exported from `libs/web/data-access/src/reports.ts`):
  ```ts
  export const PERSONAL_REPORT_KEY = ['me', 'personal', 'report'] as const;
  export function buildReportQueryString(query: ReportQuery, today?: string): string;
  export function usePersonalReport(
    query: ReportQuery,
    opts?: { enabled?: boolean },
  ): {
    data: ReportData | undefined;
    isPending: boolean;
    error: ApiClientError | null;
    source: 'copy' | 'server' | 'pending';
    refetch: () => void;
  };
  export function useCategoryDrilldown(
    query: ReportQuery,
    categoryId: string,
    opts?: { enabled?: boolean },
  ): {
    report: ReportData | undefined;
    drilldown: ReportCategoryDrilldown | null;
    matchingEntries: EntryView[];
    matchingGroupRows: GroupRow[];
    isPending: boolean;
    error: ApiClientError | null;
    refetch: () => void;
  };
  export function useCurrentMonthReportTotals(opts?: { enabled?: boolean }): {
    spent: number;
    income: number;
    approximate: boolean;
    ready: boolean;
  };
  ```

- [ ] **Step 1: Write failing tests in `libs/web/data-access/src/__tests__/reports-hooks.test.tsx`**

Assert:
1. When `txCopy` and `groupCopy` are ready in IndexedDB (seed via `openTxCopyStore` / `openGroupCopyStore` + `fake-indexeddb`, matching `txCopy-hooks.test.tsx`), `usePersonalReport` returns computed `ReportData` (`source: 'copy'`) with **0 calls** to `/api/me/personal/report`.
2. When IndexedDB is unavailable (`indexedDB` stubbed `undefined`), `usePersonalReport` falls back to `GET /api/me/personal/report?...` (`source: 'server'`).
3. `useCategoryDrilldown` returns `drilldown` + matching `EntryView[]` and `GroupRow[]` hydrated from local copy (or matching server drilldown inputs).
4. `useCurrentMonthReportTotals` returns `{ ready: true, spent, income, approximate }` when ready, and returns `{ ready: false, spent: 0, income: 0, approximate: false }` cleanly (never throwing) if fallback returns 404/error.
5. `invalidateMoney` / `invalidateCategories` / `invalidateTags` in `personalMoney.ts` invalidate `PERSONAL_REPORT_KEY`.

- [ ] **Step 2: Run data-access tests to confirm failure**

Run: `npx nx test web-data-access`
Expected: FAIL (`../reports` module not found).

- [ ] **Step 3: Implement `reports.ts`, `personalMoney.ts` invalidation, and `vi.ts` / `en.ts` copy**

- Implement `libs/web/data-access/src/reports.ts`: map `snapshot.entries` + `snapshot.ledger` into `buildReport` inputs; wait cleanly while `txCopy.status === 'opening'` before triggering fallback `GET /api/me/personal/report` (matching `useCopyList` pattern in `TransactionsScreen.tsx`); in `useCurrentMonthReportTotals`, set `retry: false` on the fallback query and return `{ ready: false }` on pending/error so existing `SpendingBook` callers without `/report` mocks never break.
- Add `queryClient.invalidateQueries({ queryKey: PERSONAL_REPORT_KEY })` to `invalidateMoney`, `invalidateCategories`, and `invalidateTags` in `libs/web/data-access/src/personalMoney.ts`.
- Add all `reports.*` and `book.reportsTitle` / `book.reportsDesc` / `book.monthSpent` / `book.monthIncome` keys to `libs/web/i18n/src/vi.ts` (every new Vietnamese string annotated `// REVIEW`) and matching keys to `libs/web/i18n/src/en.ts`.

- [ ] **Step 4: Run tests & typecheck**

Run: `npx nx test web-data-access && npx nx typecheck web-i18n`
Expected: PASS.

---

### Task 5: Install shadcn `chart` (`libs/web/ui`) & Add Categorical Chart Tokens (`globals.css`)

**Files:**
- Create: `libs/web/ui/src/components/ui/chart.tsx` (generated by shadcn CLI, self-imports rewritten to relative paths)
- Modify: `libs/web/ui/package.json` (`recharts` installed via CLI)
- Modify: `libs/web/screens/package.json` (match `recharts` version if `@cc/web-screens` imports Recharts chart components directly alongside `@cc/web-ui/components/ui/chart`)
- Modify: `libs/web/ui/src/styles/globals.css` (add `--chart-1..6` ONLY inside `@theme inline` and `:root`, NEVER inside `[data-theme]` blocks)
- Test: `libs/web/ui/src/components/__tests__/chart.test.tsx`

**Interfaces:**
- Produces: `@cc/web-ui/components/ui/chart` exporting `ChartContainer`, `ChartTooltip`, `ChartTooltipContent`, `ChartLegend`, `ChartLegendContent`, `ChartConfig`; CSS variables `--color-chart-1..6` / `--chart-1..6` in `globals.css`.

- [ ] **Step 1: Look up and install shadcn `chart` component**

1. Use shadcn MCP (`shadcn` server in `.mcp.json`) or `npx shadcn@latest view chart --cwd libs/web/ui` to inspect the component & dependencies.
2. Run `npx shadcn@latest add chart --cwd libs/web/ui --yes` from the workspace (`libs/web/ui` config). Never copy by hand.
3. Inspect the generated `libs/web/ui/src/components/ui/chart.tsx`:
   - Change any `@cc/web-ui/lib/utils` import to relative `../../lib/utils` (lint forbids a library importing itself by `@cc/*` name).
   - Remove any raw hex literal fallbacks inside `chart.tsx` (if `THEMES` or default indicator colours include any `#...` literals that would trip or diverge from `globals.css`, rely on CSS variables only).
4. Add 6 categorical chart tokens (`--chart-1` .. `--chart-6`) in `:root` and `--color-chart-1..6` in `@theme inline` inside `libs/web/ui/src/styles/globals.css` (checking `theme-tokens.test.ts` — never add them inside `[data-theme='...']`).

- [ ] **Step 2: Write failing test in `libs/web/ui/src/components/__tests__/chart.test.tsx`**

Assert `ChartContainer` renders a `[data-chart]` wrapper injecting `--color-<series>` CSS variables cleanly in JSDOM without throwing (supplying a container width/ResizeObserver stub for JSDOM if needed).

- [ ] **Step 3: Run `web-ui` and repository guard tests**

Run: `npx nx test web-ui && npx nx test web-screens -- src/test/style-guard.test.ts`
Expected: PASS (`theme-tokens.test.ts`, `chart.test.tsx`, `style-guard.test.ts` all pass; zero raw hex in `.ts`/`.tsx`).

> **Design Checkpoint (Issue #115 Step 4):** Before executing Task 6 and Task 7, pause to run `/impeccable` shaping on the Reports screens against the approved mockup (`reports-brainstorm-mockup-v2.html`, cumulative-only with no `"Theo ngày"` toggle) and review live with the owner.

---

### Task 6: Reports UI Components (`libs/web/screens/src/components/reports/`)

**Files:**
- Create: `libs/web/screens/src/components/reports/reportUrl.ts`
- Create: `libs/web/screens/src/components/reports/ReportPeriodBar.tsx`
- Create: `libs/web/screens/src/components/reports/ReportFilterRow.tsx`
- Create: `libs/web/screens/src/components/reports/HealthTrendCard.tsx`
- Create: `libs/web/screens/src/components/reports/CategoryPiesCard.tsx`
- Create: `libs/web/screens/src/components/reports/TagBarsCard.tsx`
- Create: `libs/web/screens/src/components/reports/WalletBalanceCard.tsx`
- Test: `libs/web/screens/src/components/__tests__/reports-components.test.tsx`

**Interfaces:**
- Consumes: `@cc/core` (`ReportData`, `ReportQuery`, `ReportPeriodMode`, `ReportTagItem`, `WalletBalanceSeriesResult`, `filterReportTags`, `formatMoney`), `@cc/web-ui/components/ui/chart` (`ChartContainer`, `ChartTooltip`, `ChartTooltipContent`), `@cc/web-ui/components/ui/tabs` (`Tabs`, `TabsList`, `TabsTrigger`), `@cc/web-ui/components/ui/input` (`Input`), `@cc/web-ui/components/ui/label` (`Label`), `@cc/web-ui/components/ui/card` (`Card`), `@cc/web-ui/components/{Amount,Button,Icon,Pill,Sheet}`, `WalletIcon`.
- Produces: Typed URL serializer/parser (`parseReportQueryFromSearch`, `buildReportSearch`) and the 6 self-contained report cards/controls.

- [ ] **Step 1: Write failing component tests in `libs/web/screens/src/components/__tests__/reports-components.test.tsx`**

Assert:
1. `HealthTrendCard` renders cumulative `Thu` (`var(--success)`), `Chi` (`var(--danger)`), grayed `TB 3 tháng trước` area (`var(--subtle-foreground)`), KPI summary (`Chi`, `Thu`, `Còn lại`), previous-period and 3-month plain-word comparison lines, and **never** renders a `"Theo ngày"` toggle; hides 3-month baseline cleanly when `baseline3m === null`.
2. `CategoryPiesCard` renders both Spending and Income donuts side-by-side plus a `Tabs` toggle switching the ranked parent-category list below; clicking any parent category calls `onSelectCategory(categoryId)`.
3. `TagBarsCard` shows Top 5 tags by default, renders `"Xem tất cả"` to expand when `> 5` tags, renders `<Input type="search">` (`text-base`) filtering accent-insensitively when `> 6` tags, switches `Chi` / `Thu` via `<Tabs>`, and links each tag row to `/transactions?tagId=...`.
4. `WalletBalanceCard` renders native-currency opening/closing/net/min/max and checkpoints table beneath the balance trajectory chart.
5. `ReportPeriodBar` switches `week` / `month` / `year` / `custom` via shadcn `<Tabs>`, opens a `<Sheet>` with `<Input type="date">` + `<Label>` for custom ranges, and steps prev/next periods.

- [ ] **Step 2: Run screen component test to confirm failure**

Run: `npx nx test web-screens -- src/components/__tests__/reports-components.test.tsx`
Expected: FAIL (components missing).

- [ ] **Step 3: Implement report URL helpers and the 6 report components**

Follow every UI rule:
- Use shadcn `<Tabs>`/`<TabsList>`/`<TabsTrigger>` for all segmented switches, `<Input>` + `<Label>` for tag search and custom date range inside `<Sheet>`, `<Button>`, `<Pill>`, `<Amount>`, `<Icon>`, `<WalletIcon>`. Zero raw `<input>`/`<select>`/`<label>`/`role="tab"`, zero raw hex colours.
- In Recharts charts inside `ChartContainer`, handle fixed/bounded height (`h-44` / `h-40`) cleanly without relying on unmeasured `0×0` containers in JSDOM, and disable animations under `prefers-reduced-motion` (`isAnimationActive={false}` or reduced-motion hook).

- [ ] **Step 4: Run `web-screens` component + guard tests**

Run: `npx nx test web-screens -- src/components/__tests__/reports-components.test.tsx src/test/ui-components-guard.test.ts src/test/style-guard.test.ts`
Expected: PASS.

---

### Task 7: Reports Screens (`ReportsScreen`, `ReportCategoryScreen`), Routing & `SpendingBook` Integration

**Files:**
- Create: `libs/web/screens/src/screens/ReportsScreen.tsx`
- Create: `libs/web/screens/src/screens/ReportCategoryScreen.tsx`
- Modify: `libs/web/screens/src/App.tsx`
- Modify: `libs/web/screens/src/screens/SpendingBook.tsx`
- Test: `libs/web/screens/src/screens/__tests__/reports.test.tsx`

**Interfaces:**
- Consumes: `usePersonalReport`, `useCategoryDrilldown`, `useCurrentMonthReportTotals` (`@cc/web-data-access/reports`), `useWalletDetails`, `useCategories`, `useAssets`, `useGroupSettings` (`@cc/web-data-access/personalMoney`), `Screen`, `TransactionRow`, `TransactionDetailContent`, `GroupRowSheet`, `EmptyState`, `SkeletonList`, `InlineError`, plus Task 6 components.
- Produces: `/reports` (`ReportsScreen`) and `/reports/category/:categoryId` (`ReportCategoryScreen`) guarded inside `<PersonalRoute>`; quiet `Tháng này chi` / `Thu` line + `data-testid="book-reports-row"` on `SpendingBook`.

- [ ] **Step 1: Write failing screen tests in `libs/web/screens/src/screens/__tests__/reports.test.tsx`**

Assert:
1. **Switch-off guard:** With `personalArea` off, `/trips` shows no `book-reports-row`, and navigating to `/reports` or `/reports/category/cat-food` redirects to `/trips`.
2. **2-tap food-last-month flow (`SpendingBook` → `ReportsScreen` → `ReportCategoryScreen`):** Tapping `book-reports-row` opens `/reports`; stepping `‹` to last month and tapping `"Ăn uống"` navigates to `/reports/category/cat-food?...`, showing last month's food total, plain-word comparison against the month before, single sub-category pie + list, and matching transactions; tapping a sub-category filters transactions in place.
3. **Single-wallet scope (`USDT` & excluded wallet):** Selecting a `USDT` wallet via `ReportFilterRow` shows `WalletBalanceCard` at top in exact `USDT` (no `≈`), and selecting an `excludeFromReports: true` wallet renders its report with the quiet excluded-wallet notice.
4. **Empty & unrated-only states:** 0 counted entries renders `EmptyState` (with filter-clear/period reset); unrated-only period renders `perCurrency` totals + `"chưa có tỷ giá"` banner with 1-tap drill-in (NOT `"Chưa có giao dịch"`).
5. **Zalo Mini App parity:** Rendering `/reports` with `fakePlatform({ kind: 'zmp' })` renders cleanly inside `Screen`.
6. **Existing `spending-book.test.tsx`:** Keep passing untouched (mocking `/api/me/personal/report` in new `reports.test.tsx` for the `Tháng này chi` / `Thu` test while `spending-book.test.tsx` unmocked 404 degrades silently).

- [ ] **Step 2: Run screen test to confirm failure**

Run: `npx nx test web-screens -- src/screens/__tests__/reports.test.tsx`
Expected: FAIL (`ReportsScreen` / routes missing).

- [ ] **Step 3: Implement `ReportsScreen.tsx`, `ReportCategoryScreen.tsx`, `App.tsx`, and `SpendingBook.tsx`**

- `ReportsScreen.tsx`: uses `Screen` (supports `wide` layout on `≥ 1024px`), `ReportPeriodBar`, `ReportFilterRow` (wallet picker `Sheet` + `"Bao gồm nhóm"` toggle), unrated-wallets `"chưa có tỷ giá"` banner, `WalletBalanceCard` (when `singleWallet` is set), `HealthTrendCard` (leads when "All wallets", sits right under `WalletBalanceCard` when single-wallet), `CategoryPiesCard` (tapping navigates to `/reports/category/:categoryId?...`), `TagBarsCard` (hidden when 0 tags in period or collapsed cleanly), loading skeletons, and `InlineError`.
- `ReportCategoryScreen.tsx`: reads `:categoryId` and query params from URL, shows summary card with total + previous-period + 3-month deltas, single sub-category donut + ranked list (tap toggles sub-category filter), and matching `TransactionRow` items (opening `TransactionDetailContent` sheet or `GroupRowSheet`).
- `App.tsx`: add `<Route path="/reports" element={<PersonalRoute><ReportsScreen /></PersonalRoute>} />` and `<Route path="/reports/category/:categoryId" element={<PersonalRoute><ReportCategoryScreen /></PersonalRoute>} />`.
- `SpendingBook.tsx`: keep `BookTotal`'s hero `Tổng tiền` `<Amount>` first in `tone="neutral"`; render `Tháng này chi` / `Thu` right underneath when `useCurrentMonthReportTotals()` is `ready` (using `formatMoney` in `tabular-nums`, no extra `.fsl-amount` class interference before `book-total`'s first `.fsl-amount`); render `BookPeople` + conditional `book-reports-row` (`hasWallet`) inside the single `fsl-book__list` `divide-y` card.

- [ ] **Step 4: Run `web-screens` tests**

Run: `npx nx test web-screens -- src/screens/__tests__/reports.test.tsx src/screens/__tests__/spending-book.test.tsx`
Expected: PASS on both new `reports.test.tsx` and untouched `spending-book.test.tsx`.

---

### Task 8: 375px Multi-Theme Verification & Full Regression Gate

**Files:**
- Test: `libs/web/screens/src/screens/__tests__/reports-theme-and-layout.test.tsx`

- [ ] **Step 1: Write 375px & multi-theme verification test in `reports-theme-and-layout.test.tsx`**

Verify `/reports` and `/reports/category/:categoryId` render cleanly under `data-theme="jade"` and `data-theme="pink"` (verifying Income/Expense labels retain money semantics and never adopt theme accents, no horizontal scroll traps, chart containers present, and `ThemeController` swaps without breaking).

- [ ] **Step 2: Run the full repository verification suite (zero existing tests modified)**

Run sequentially or via Nx:
1. `npm test`
2. `npm run typecheck`
3. `npm run lint`
4. `npm run e2e -- golden-path`
5. `npm run e2e -- walkthrough`

Expected: ALL suites pass with 0 failures and 0 modified existing test files.
