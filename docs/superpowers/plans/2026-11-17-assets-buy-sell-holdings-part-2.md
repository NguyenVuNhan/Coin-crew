# Personal money Part 2: assets, buy/sell and holdings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Investment wallets hold assets: the owner keeps an asset list, records buys and sells (as "Mua tài sản" / "Bán tài sản" tiles), and sees each investment wallet's holdings at cost, which also count in the VND total.

**Architecture:** One new table (`personal_assets`, migration 0028). `personal_transactions` already has `buy`/`sell` types, `asset_id` and `quantity` (0027), so buy/sell are ordinary entries. Holdings and their cost are never stored: pure `@cc/core` functions replay a wallet's entries (as W12 already does for cash). The API adds asset routes, a holdings route and the `buy`/`sell` entry variant; the web adds an assets settings screen, the two tiles on the entry page, holdings on the wallet page, and an asset filter.

**Tech Stack:** Nx monorepo, Hono on Cloudflare D1 + Drizzle (hand-written SQL migration), React + React Query, shadcn/ui + Tailwind v4, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-16-wallets-and-transactions-design.md`: W3, W9, W10, W11, W12, W19, W20, §5 "Assets", §6 "Buy / sell", §7 `personal_assets`, §9 Part 2, §11 Part 2 tests, R10. Part 1 (PR #129) is merged; build against its shipped code.

## Global Constraints

- Phase 2 rules: additive only. Never edit or delete a test that exists on main; tests this branch adds may be updated by planner ruling.
- Every new route is under `/me/personal`, behind `requirePersonal`, and filters every query by the signed-in user's id. Another user's id in a path, query or body gives **404**; a user with the switch off gets **403**.
- At most 50 queries per request; keep any `IN (…)` list under D1's ~100 bound parameters (use joins, as Part 1 does).
- Money and quantities are integers in smallest units. Quantity: **> 0, at most 10^15 smallest units**, decimals per asset **0–8**. Cash amount limits as Part 1 (`isValidAmount`).
- Migration `apps/api/migrations/0028_personal_assets.sql` is **hand-written SQL** (never `drizzle-kit generate`); apply `--local` for the tunnel; the owner decides when it is committed.
- Vietnamese first, English second; every new vi line ends `// REVIEW`. No raw hex, no `.css` files, theme tokens only; wrappers first (`Sheet`, `Modal`, `Button`, `Amount`, `Icon`, `Input`; raw `<input>` is not allowed in screens). Touch targets `min-h-11`, fields `text-base`, money and quantities `tabular-nums`.
- Tests select by `fsl-*` classes and `data-testid`.
- Avoid the word "ledger" in new names.

## Decisions this plan makes (the spec left them open; listed for the owner's review)

- **D1 Starter list:** no starter assets (they are the owner's own). Groups come from a constant `ASSET_GROUPS = ['Crypto', 'Cổ phiếu', 'ETF', 'Vàng']` (// REVIEW in i18n) plus any group name the owner has already typed; the owner can type a new one.
- **D2 Buy/sell never count as spending or income** in month and day totals (they swap cash for an asset). They have no exclude switch and no category (`category_id` null).
- **D3 Cost basis is average cost.** A sell of `q` from a holding of `Q` removes `round(cost × q / Q)` from its cost (and the same share of its VND cost). Realised profit is not shown in this PR (reports are #115/#122) but follows from the stored entries.
- **D4 W12 with holdings:** a buy moves cash out at the wallet's average VND rate (as an expense does) and that VND amount becomes the holding's VND cost; a sell brings cash in valued at the current average rate (as W12 says for sells) and takes the average-cost share off the holding's VND cost. In a VND wallet the VND cost is the cost. A wallet's VND value = cash VND cost + holdings VND cost. While a non-VND wallet has no rate (W19c), its holdings' VND cost is unknown too and gets the first transfer-in rate, like its cash.
- **D5 An asset's decimals cannot change once it has entries.** Moving an asset's entries to another asset (remove-with-choice) is allowed only to an asset with the same decimals.
- **D6 Oversell is checked over the whole timeline**, not only on the entry's date: after any create, edit, delete, restore or wallet start-date change, replaying that wallet's buys and sells for each affected asset must never go below zero, or the request is refused with `422 OVERSELL` and `details: { assetId, date }`.
- **D7 "+" menu:** when at least one active investment wallet exists, the menu gains "Mua / bán tài sản", opening `/entries/new?type=expense&tile=buy&wallet=<last used investment wallet or the first one>`.

## Review Focus

1. Editing or deleting an earlier buy (or moving it to another wallet or asset) so a later sell would oversell → refused with `OVERSELL`, nothing written. Owner: Task 4.
2. Changing an investment wallet's start date so a buy falls before it while its sell stays after → refused with `OVERSELL`. Owner: Task 4.
3. Same-day buy and sell: a sell timed earlier than the buy on the same date oversells → refused; with no times the order is `createdAt`. Owner: Task 1.
4. A buy/sell sent for an everyday wallet, with another user's asset, or with a quantity that has more decimals than the asset allows → 422 / 404, never stored. Owner: Task 4.
5. An archived investment wallet's holdings stay out of the VND total and the pie, like its cash. Owner: Task 1.

---

### Task 1: Core math and types for assets, buy/sell and holdings

**Files:**
- Modify: `libs/shared/core/src/wallets.ts`, `libs/shared/core/src/api-types.ts`, `libs/shared/core/src/index.ts` (exports)
- Create: `libs/shared/core/src/assets.ts`
- Test: `libs/shared/core/src/__tests__/holdings.test.ts`, `libs/shared/core/src/__tests__/assets.test.ts`

**Interfaces:**
- Produces (in `wallets.ts`):
  - `PersonalEntryType` gains `'buy' | 'sell'`.
  - `CalcEntry` gains `assetId: string | null; quantity: number | null`.
  - `walletBalance`: `sell` adds, `buy` subtracts (income, transfer_in, sell: +; everything else −).
  - `interface Holding { assetId: string; quantity: number; cost: number; costVnd: number | null }` (`cost` in the wallet's currency).
  - `walletHoldings(wallet: CalcWallet, entries: CalcEntry[]): Holding[]`: replays the wallet's buy/sell entries on or after the start date in `compareEntries` order and applies D3. Holdings at quantity 0 are dropped. `costVnd` follows D4.
  - `findOversell(wallet: CalcWallet, entries: CalcEntry[]): { assetId: string; date: string } | null`: the first point where a held quantity would go below zero.
  - `walletVndValues` adds each wallet's holdings VND cost (D4); `vndTotal` keeps skipping archived wallets.
- Produces (in `assets.ts`):
  - `ASSET_GROUPS: readonly string[]` (D1).
  - `MAX_ASSET_DECIMALS = 8`, `MAX_QUANTITY = 10 ** 15`.
  - `parseQuantity(text: string, decimals: number): number | null`: vi format with comma decimals; null for empty, letters, zero, negatives, too many decimals or above the max.
  - `formatQuantity(q: number, decimals: number): string`: vi format, trailing zeros trimmed (`50000000, 8` → `"0,5"`).
  - `isValidQuantity(q: number): boolean`.
- Produces (in `api-types.ts`):
  - `AssetView { id; name; unit; groupName; decimals; hidden; sortOrder; entryCount }` and `AssetsResponse { assets: AssetView[] }`.
  - `HoldingView { walletId; assetId; quantity; cost; costVnd: number | null }` and `HoldingsResponse { holdings: HoldingView[] }`.
  - `EntryInput` gains the variant `{ type: 'buy' | 'sell'; walletId; assetId; quantity; amount; date; time?; note?; tags? }`.
  - `EntryView` gains `assetId: string | null; quantity: number | null`.
  - `ListQuery` gains `assetId?: string` and `type` gains `'trade'` (buy and sell together).
  - `ApiErrorCode` gains `'OVERSELL'`.

- [ ] **Step 1: Write the failing tests** in `holdings.test.ts`:
  - **Buys then a partial sell (VND wallet):** buy 1 BTC (decimals 8) for 1.000.000.000; buy 1 for 1.400.000.000; sell 0,5 for 800.000.000. Expect: holding quantity 150000000, cost 1.800.000.000 (average 1,2 tỷ × 1,5); wallet balance = start − 2.400.000.000 + 800.000.000.
  - **USDT wallet:** 25.000.000 VND → 1.000 USDT; buy BTC for 400 USDT. Expect: cash VND cost 15.000.000, holding costVnd 10.000.000, wallet VND value 25.000.000. Then sell half for 300 USDT. Expect: holding costVnd 5.000.000; cash 900 USDT valued at the current average rate.
  - `findOversell` returns `{ assetId, date }` for a sell above the held quantity on its date; returns null when a later buy would cover it only afterwards (the order matters).
  - **Same date:** a sell with time 09:00 before a buy at 10:00 oversells; with no times, `createdAt` decides.
  - **Before the start date:** a buy before `startDate` is ignored by holdings (and so is its sell).
  - **Archived wallet:** an archived investment wallet's holdings are not in `vndTotal`.
  - **Unrated wallet (W19c):** a buy in a USDT wallet with no rate leaves holdings costVnd null until the first transfer in, then valued at that rate.
- [ ] **Step 2:** Write `assets.test.ts`: `parseQuantity('0,5', 8) === 50000000`; `parseQuantity('1,123', 2) === null`; `parseQuantity('0', 0) === null`; `parseQuantity('abc', 2) === null`; `formatQuantity(150000000, 8) === '1,5'`; `formatQuantity(3, 0) === '3'`.
- [ ] **Step 3:** Run `npx nx test @cc/core`. Expected: the new tests FAIL.
- [ ] **Step 4:** Implement the interfaces above. Holdings replay sits beside the existing `NonVndState` replay in `walletVndValues`, so cash and holdings VND cost are updated in one ordered pass.
- [ ] **Step 5:** Run `npx nx test @cc/core` and `npm run typecheck`. Expected: PASS, and the existing Part 1 core tests are unchanged and passing. Fix any exhaustive `switch` in web/api code that typecheck flags, by giving `buy`/`sell` the behaviour above.
- [ ] **Step 6: Commit** with `feat(core): buy/sell entries, holdings at average cost, quantities`.

### Task 2: Migration 0028 and schema

**Files:**
- Create: `apps/api/migrations/0028_personal_assets.sql`
- Modify: `libs/api/db/src/schema.ts`
- Test: `apps/api/test/schema-personal-assets.test.ts`

**Interfaces:**
- Produces: the `personalAssets` table, with columns `id` (text pk), `user_id` (text, not null, FK users), `name` (text, not null), `unit` (text, not null), `group_name` (text, not null), `decimals` (integer, not null, CHECK 0–8), `hidden` (integer 0/1, default 0), `sort_order` (integer, not null), `created_at`, `updated_at`. Indexes: (`user_id`, `sort_order`), and unique (`user_id`, lower(`name`)) to stop duplicate names. Add an index on `personal_transactions(asset_id)`.

- [ ] **Step 1:** Write the schema test, mirroring `schema-personal-money.test.ts`: it inserts an asset, rejects `decimals = 9`, and rejects a duplicate name differing only in case for the same user while allowing it for another user.
- [ ] **Step 2:** Run `npx vitest run apps/api/test/schema-personal-assets.test.ts`. Expected: FAIL (no table).
- [ ] **Step 3:** Write the SQL by hand, add the Drizzle table with the same columns, then run `wrangler d1 migrations apply fsl --local` for the dev DB.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5: Commit** the schema and test only. The migration file waits for the owner's word (hand-written-migrations rule).

### Task 3: Assets API

**Files:**
- Create: `apps/api/src/personal/assets.ts`
- Modify: `apps/api/src/personal/routes.ts` (mount)
- Test: `apps/api/test/personal-assets.test.ts`

**Interfaces:**
- Consumes: `AssetView`, `AssetsResponse`, `ASSET_GROUPS`, `MAX_ASSET_DECIMALS` (Task 1); `personalAssets` (Task 2).
- Produces the routes:
  - `GET /me/personal/assets` → `AssetsResponse`. Sorted by `sortOrder`. `entryCount` comes from one grouped count.
  - `POST /me/personal/assets` with `{ name, unit, groupName, decimals }` → `{ asset }`, status 201. Name 1–40 chars, trimmed; unit 1–20; group 1–30; decimals an integer 0–8. A duplicate name (case-insensitive) → `422 VALIDATION` with `details.field = 'name'`.
  - `PATCH /me/personal/assets/:id` with any of `{ name, unit, groupName, decimals, hidden }` → `{ asset }`. Changing `decimals` while `entryCount > 0` → `409 IN_USE` (D5).
  - `DELETE /me/personal/assets/:id[?moveTo=<id>]`: the categories.ts pattern. Unused → deleted. In use without `moveTo` → `409 IN_USE` with `{ count }`. With `moveTo`, the target must be the user's own (else 404), different from the asset, and have the same decimals (else 422); entries are moved and the asset deleted in one `db.batch`. Hiding is done through `PATCH hidden: true`.

- [ ] **Step 1:** Write the failing tests:
  - create, list, rename, hide
  - duplicate name → 422
  - decimals change when unused → 200; when used → 409
  - delete unused → 200; delete used → 409 with count
  - `moveTo` same decimals → entries moved; different decimals → 422
  - second account: 404 on PATCH and DELETE, its asset never listed; `moveTo` pointing at another user's asset → 404
  - switch off → 403 on all four routes

  Seed "used" assets by inserting `buy` rows directly in the test DB.
- [ ] **Step 2:** Run `npx vitest run apps/api/test/personal-assets.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `assetRoutes()` and mount it.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(api): personal assets list, create, edit, hide, remove-with-choice`.

### Task 4: Buy/sell entries in the API

**Files:**
- Modify: `apps/api/src/personal/entryInput.ts`, `apps/api/src/personal/entries.ts`, `apps/api/src/personal/wallets.ts` (`loadCalc` maps `assetId`/`quantity`; the start-date PATCH runs the oversell check)
- Test: `apps/api/test/personal-trades.test.ts`

**Interfaces:**
- Consumes: the `EntryInput` buy/sell variant, `findOversell`, `isValidQuantity`, `isValidAmount` (Task 1).
- Produces: `parseEntryInput` accepts `type: 'buy' | 'sell'` with `walletId`, `assetId`, `quantity`, `amount` and `date`, plus optional `time`, `note` and `tags`. `categoryId` is not accepted, and `excludeFromReports` is stored as 0 and ignored by totals (D2). Create, update, delete and restore all handle the new type. Responses carry `assetId` and `quantity` on `EntryView`.

- [ ] **Step 1:** Write the failing tests:
  - buy in an investment wallet → 201, and the row has `asset_id` and `quantity`
  - buy in an everyday wallet → 422
  - another user's asset → 404
  - a hidden asset on create → 422; editing an existing entry of a hidden asset → 200
  - quantity with more decimals than the asset → 422; quantity 0 or above 10^15 → 422
  - sell above the held quantity → `422 OVERSELL` with `details.assetId` and `details.date`
  - deleting the buy behind a later sell → 422 OVERSELL and nothing deleted
  - editing the buy's quantity down below what was sold later → 422; editing a buy's wallet to another investment wallet → both wallets checked
  - restoring a deleted sell that no longer fits → 422
  - PATCHing the wallet start date past a buy whose sell stays after it → 422 OVERSELL
  - query count for create stays ≤ 50
- [ ] **Step 2:** Run `npx vitest run apps/api/test/personal-trades.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement it. The oversell check loads only that wallet's buy/sell rows (one query, with an index on wallet and date), applies the change in memory, runs `findOversell`, and writes only when it returns null.
- [ ] **Step 4:** Run the new test plus `personal-entries*.test.ts` and `personal-guard-sweep.test.ts`. Expected: PASS. Add the new routes to the guard sweep only by adding new test cases in the new file, never by editing the sweep.
- [ ] **Step 5: Commit** with `feat(api): buy and sell entries with an oversell check across the timeline`.

### Task 5: Holdings, list filter and totals in the API

**Files:**
- Modify: `apps/api/src/personal/list.ts` (filter, totals), `apps/api/src/personal/wallets.ts` (VND values include holdings)
- Create: `apps/api/src/personal/holdings.ts`
- Test: `apps/api/test/personal-holdings.test.ts`

**Interfaces:**
- Consumes: `walletHoldings`, `walletVndValues` (Task 1); `loadCalc`.
- Produces:
  - `GET /me/personal/holdings[?walletId=]` → `HoldingsResponse` for the user's investment wallets (a foreign `walletId` → 404).
  - `GET /me/personal/transactions` accepts `assetId` (filter) and `type=trade`.
  - Buy/sell rows never add to `totals` (D2).
  - `GET /me/personal/wallets` `vndValue` and `GET /me/personal/summary` `totalVnd` include holdings at VND cost (D4).

- [ ] **Step 1:** Write the failing tests:
  - the holdings route returns quantity, cost and costVnd after buy, buy, partial sell (Task 1's numbers)
  - `assetId` filter returns only that asset's rows; a foreign `assetId` → 404
  - `type=trade` returns buys and sells
  - a month with a buy and an expense: totals count only the expense
  - the summary total includes the holding's VND cost
  - switch off → 403
- [ ] **Step 2:** Run `npx vitest run apps/api/test/personal-holdings.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement it.
- [ ] **Step 4:** Run `npx nx test @cc/api`. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(api): holdings route, asset filter, holdings in the VND total`.

### Task 6: Data-access hooks

**Files:**
- Modify: `libs/web/data-access/src/personalMoney.ts`
- Test: `libs/web/data-access/src/__tests__/personal-assets-hooks.test.ts`

**Interfaces:**
- Produces:
  - `PERSONAL_ASSETS_KEY = ['me','personal','assets']` and `PERSONAL_HOLDINGS_KEY = ['me','personal','holdings']`.
  - `useAssets(opts?)`, `useCreateAsset()`, `useUpdateAsset()`, `useDeleteAsset()` (takes `{ id, moveTo? }`), and `useHoldings(walletId?: string, opts?)`.
  - `buildListQueryString` passes `assetId` and `type=trade`.
  - `invalidateEntry` also invalidates assets (`entryCount`) and holdings.

- [ ] **Step 1:** Write the failing tests: each hook calls its route (mock fetch), and saving an entry invalidates the holdings and assets keys.
- [ ] **Step 2:** Run `npx nx test @cc/web-data-access`. Expected: FAIL.
- [ ] **Step 3:** Implement following the category hooks.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(web-data-access): asset and holdings hooks`.

### Task 7: Assets settings screen

**Files:**
- Create: `libs/web/screens/src/screens/AssetsScreen.tsx`, `libs/web/screens/src/components/AssetForm.tsx`
- Modify: `libs/web/screens/src/App.tsx` (route `/personal/assets` inside `PersonalRoute`), `libs/web/screens/src/components/PersonalSettingsMenu.tsx` (item "Tài sản" // REVIEW, after "Nhóm chi tiêu"), `libs/web/i18n/src/vi.ts`, `en.ts`
- Test: `libs/web/screens/src/screens/__tests__/assets-screen.test.tsx`

**Interfaces:**
- Consumes: Task 6 hooks, `ASSET_GROUPS`, `formatQuantity`.
- Produces:
  - `AssetForm` with props `{ asset?: AssetView; groups: string[]; onSaved(asset: AssetView): void; onCancel(): void }`. Task 8 reuses it for adding an asset from the entry page.
  - Fields: Tên, Đơn vị, Nhóm (chips from `ASSET_GROUPS` plus the owner's used groups, plus "Nhóm khác" free text), and Số chữ số thập phân (0–8 stepper; disabled with a one-line reason when `entryCount > 0`).
  - The screen lists assets grouped by `groupName` in one white `rounded-xl` list per group; hidden assets sit collapsed under "Đã ẩn".
  - A row opens the edit sheet (wrapper `Sheet`). Remove: unused → confirm and delete; used → a choice of "Chuyển giao dịch sang…" (a picker of assets with the same decimals) or "Ẩn và giữ lịch sử".
  - Empty state: one line plus a "Thêm tài sản" button.

- [ ] **Step 1:** Write the failing tests:
  - the gear menu shows "Tài sản" and opens `/personal/assets`
  - add BTC (coin, Crypto, 8) → POST body exact
  - rename → PATCH
  - the decimals stepper is disabled for a used asset
  - removing a used asset shows both choices; moving to a same-decimals asset → DELETE with `moveTo`; hiding → PATCH `hidden: true`
  - the empty state shows "Thêm tài sản"
  - a user with the switch off has no menu item and no route
- [ ] **Step 2:** Run `npx vitest run libs/web/screens/src/screens/__tests__/assets-screen.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement following `CategoriesScreen` and `WalletForm` patterns.
- [ ] **Step 4:** Run the test, `npm run typecheck` and `npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(screens): assets settings screen`.

### Task 8: "Mua tài sản" / "Bán tài sản" tiles on the entry page (R10)

**Files:**
- Modify: `libs/web/screens/src/components/CategoryPicker.tsx` (tiles), `libs/web/screens/src/screens/EntryPage.tsx` (trade mode, save, edit)
- Create: `libs/web/screens/src/components/AssetPicker.tsx` (sheet: assets grouped, search, "Thêm tài sản" opens `AssetForm`)
- Modify: i18n `vi.ts`, `en.ts`
- Test: `libs/web/screens/src/screens/__tests__/entry-trade.test.tsx`

**Interfaces:**
- Consumes: Tasks 1, 6 and 7 (`AssetForm`, `useHoldings`, `parseQuantity`, `formatQuantity`).
- Produces:
  - `CategoryPicker` gets `tradeSelected?: boolean` and `onTradeSelect?(): void`, plus `showTrade?: boolean`. The tile is "Mua tài sản" (`data-testid="category-tile-buy"`) on Chi and "Bán tài sản" (`category-tile-sell`) on Thu, placed after the transfer tile, shown only when `showTrade` (the selected wallet is investment).
  - The URL learns `tile=buy|sell`.

- [ ] **Step 1:** Write the failing tests:
  - on an everyday wallet, no trade tile; switching the wallet to an investment wallet shows it
  - picking "Mua tài sản" shows a "Tài sản" row (opens `AssetPicker`) and a "Số lượng" field (the `Input` wrapper, `inputMode="decimal"`, its unit after it)
  - save posts `{ type: 'buy', walletId, assetId, quantity: 50000000, amount, date }` once; no category error is shown for a trade
  - "Bán tài sản" shows "Đang có: 1,5 BTC" from `useHoldings`; a quantity above it shows an inline error and Lưu is disabled with that reason; a server `OVERSELL` shows the same error
  - "Thêm tài sản" from the picker creates the asset and selects it
  - editing a buy opens Chi with the buy tile selected and the asset and quantity filled
  - on a mouse device (matchMedia mocked) the quantity field still works and the amount is the typed field
  - the exclude switch is not shown for a trade (D2)
- [ ] **Step 2:** Run `npx vitest run libs/web/screens/src/screens/__tests__/entry-trade.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement it. A trade keeps every Part 1 save check that applies (small-amount, foreign-wallet, leave guard). "Xong" focuses the "Tài sản" row when none is chosen, then "Số lượng", then Lưu.
- [ ] **Step 4:** Run `npx nx run-many -t test typecheck lint -p @cc/web-screens @cc/web-ui @cc/web-i18n`. Expected: PASS, with no Part 1 entry test changed.
- [ ] **Step 5: Commit** with `feat(screens): buy and sell as tiles on the entry page`.

### Task 9: Holdings on the wallet page, rows, filter and "+" menu

**Files:**
- Modify: `libs/web/screens/src/screens/WalletScreen.tsx` (a "Đang nắm giữ" section for investment wallets), `libs/web/screens/src/components/TransactionRow.tsx` and `screens/TransactionDetail.tsx` (trade display), `libs/web/screens/src/components/TransactionFilters.tsx` (an asset filter and a "Mua / bán" type), `libs/web/screens/src/components/AddMenu.tsx` (D7), i18n
- Test: `libs/web/screens/src/screens/__tests__/holdings-and-trade-rows.test.tsx`

**Interfaces:**
- Consumes: `useHoldings`, `useAssets`, `formatQuantity`, `Amount`.
- Produces:
  - **Holdings section:** a white `rounded-xl` list with one row per holding (asset name; quantity + unit in `tabular-nums`; total cost with `Amount` in the wallet currency), and a muted "Giá vốn, chưa tính giá thị trường" line under the heading (// REVIEW). Empty state: "Chưa nắm giữ tài sản nào".
  - **Rows:** "Mua BTC" / "Bán BTC" with "0,5 coin · <wallet>" as the second line. The amount reads − for a buy and + for a sell, in neutral ink, since it is not spending (D2).
  - **Filter:** asset as a pill.
  - **Menu:** the "+" item "Mua / bán tài sản" appears only with an active investment wallet.

- [ ] **Step 1:** Write the failing tests:
  - an investment wallet page lists holdings with quantity and cost; an everyday wallet has no section
  - a buy row reads "Mua BTC" with the quantity
  - the detail page shows the asset, quantity and price per unit (amount ÷ quantity, formatted in the wallet currency)
  - the asset filter adds `assetId` to the list query and shows a removable pill
  - the "+" menu shows the item only when an investment wallet exists, and it opens `/entries/new?type=expense&tile=buy&wallet=<id>`
- [ ] **Step 2:** Run `npx vitest run libs/web/screens/src/screens/__tests__/holdings-and-trade-rows.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement it.
- [ ] **Step 4:** Run the full web checks, `npm test`, and the e2e specs `golden-path`, `spending-book` and `WALKTHROUGH=1 walkthrough`. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(screens): holdings on the wallet page, trade rows, asset filter, buy/sell in the + menu`.

### Task 10: Owner review on the tunnel

- [ ] Apply 0028 `--local`, rebuild, restart `npm run tunnel` and probe it.
- [ ] Hand the owner a short check list: add an asset; buy, buy, sell part; see the holdings and the VND total; try to oversell; edit the first buy down.
- [ ] Owner feedback becomes follow-up tasks. On approval: commit the migration (owner's word), push, and open a PR into main as "Part 2 of 2", closing #113.
