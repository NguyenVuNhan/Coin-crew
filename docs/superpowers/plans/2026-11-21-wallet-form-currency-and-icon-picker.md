# Wallet Form Currency Picker, Tabbed Icon Packages & No Start Date Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the wallet create/edit experience with an inline logo-next-to-name header opening a scrollbar-free tabbed 7-package icon picker, a searchable 55-currency picker sheet, removal of `Ngày bắt đầu` from the UI and balance calculations, and an active "Exclude wallet transactions from total report" option.

**Architecture:** Expand `@cc/core` currency definitions and generalize 0-decimal parsing while changing `isBeforeStart` to always return `false`. Add an additive `personal_wallet_options` table (migration `0030`) so existing `personal_wallets` (9 cols) and `personal_wallet_settings` (8 cols) schema tests pass unchanged, and filter excluded wallets in `GET /me/personal/summary`. On the web client, add pure-vector `.svg` assets (no `<text>`/`<tspan>`) verified by an automated SVG visual-balance test, expose `<WalletIcon>` and `<CurrencyBadge>` components, build `CurrencyPickerSheet` and `WalletIconPickerSheet`, and integrate them across `WalletForm`, `FirstWalletSheet`, `WalletsScreen`, `WalletSummary`, `EntryPage`, and `TransactionFilters`.

**Tech Stack:** TypeScript 7 (`tsc`), Nx monorepo (`@cc/core`, `@cc/api-db`, `@cc/web-i18n`, `@cc/web-ui`, `@cc/web-screens`, `apps/api`), Drizzle ORM / Cloudflare D1 SQLite, React 19, Tailwind CSS v4, shadcn/ui wrappers (`Sheet`, `Input`, `Label`, `Button`, `Icon`), Vitest, Testing Library, Playwright.

**Spec:** [`docs/superpowers/specs/2026-11-21-wallet-form-currency-and-icon-picker-design.md`](../specs/2026-11-21-wallet-form-currency-and-icon-picker-design.md)

## Global Constraints

- Additive DB migrations only: never alter `personal_wallets` (pinned to 9 columns by `apps/api/test/schema-wallets.test.ts`) or `personal_wallet_settings` (pinned to 8 columns by `apps/api/test/schema-personal-money.test.ts`); write hand-written SQL in `apps/api/migrations/` and keep `libs/api/db/src/schema.ts` in sync by hand.
- Phase 1 guard: do not touch any Phase 1 group-splitting/trip files or Phase 1 tests; all Phase 2 routes stay guarded by `requirePersonal` and scoped to the signed-in user.
- Style guard (`libs/web/screens/src/test/style-guard.test.ts`): `libs/web/ui/src/styles/globals.css` is the only CSS file allowed; zero raw hex colours (`#...`) in `.ts`/`.tsx` files under `libs/web/*/src/`.
- Pure SVG icons only: every generated `.svg` under `libs/web/screens/src/assets/` must use vector path/shape primitives (`<path>`, `<circle>`, `<rect>`, `<polygon>`, `<line>`, `<polyline>`, `<ellipse>`) with zero `<text>` or `<tspan>` elements so fonts never misrender.
- No visible horizontal scrollbar on the icon package tab strip (`scrollbar-width: none` + `::-webkit-scrollbar` hidden via Tailwind classes).
- Touch targets >= 44px (`min-h-11` / `size-11`), text fields >= `text-base` (16px), Vietnamese copy marked `// REVIEW`, `libs/web` imports across workspace libraries use `@cc/*` package names (relative imports inside the same library).
- Hide **Enable wallet notification** and **Link to a bank** from the UI in this task (reserved for #121 and #118/#119).

## Review Focus

- **0-decimal non-VND `parseMoney` inputs (`JPY`, `KRW`, `IDR`, `TWD`):** Typing `1000` or `1.000` in `JPY` parses to `1000`, while typing `50k` or `12.5` returns `null` (and `50k` in `VND` still parses to `50000`). Covered in Task 1 (`libs/shared/core/test/currency.test.ts`).
- **Vietnamese accent-folded currency & category-name search:** Searching `"do la my"`, `"yen nhat"`, or `"jpy"` finds `USD`/`JPY`; searching `"đầu tư"` or `"ngan hang"` in the icon picker returns the full matching package across tabs. Covered in Task 1 & Task 4.
- **Locked wallet vs editable `excludeFromReports`:** Editing a wallet with `entryCount > 0` still forbids changing `kind`/`currency` (`409 IN_USE`, disabled controls in `WalletForm`) while allowing `name`, `icon`, `startAmount`, `startCostVnd`, and `excludeFromReports` updates. Covered in Task 2 & Task 4.
- **Excluded wallet stays in net worth (`vndTotal`), skips summary `spent`/`income`:** Setting `excludeFromReports: true` keeps the wallet's balance in `GET /me/personal/wallets` and `GET /me/personal/summary`'s `totalVnd`/`perCurrency`, omits its transactions from `spent`/`income`, and restores them if toggled back to `false`. Covered in Task 2 (`apps/api/test/personal-wallets-more.test.ts`).
- **SVG visual balance, zero-font purity, & fallback icons:** Every `.svg` icon has a square `viewBox`, zero `<text>`/`<tspan>`, centered bounding box with safe padding; unknown/null `wallet.icon` falls back to `basic:wallet:5` (`bg-avatar-5`); `bank:nab`/`bank:vib` fall back across platform assets. Covered in Task 3 (`libs/web/screens/src/components/__tests__/wallet-icons-balance.test.tsx`).

---

### Task 1: Expand `@cc/core` Currency Catalog & Drop `isBeforeStart` Cutoff

**Files:**
- Modify: `libs/shared/core/src/currency.ts`
- Modify: `libs/shared/core/src/wallets.ts:41-46`
- Modify: `libs/shared/core/src/api-types.ts:681-721`
- Test: `libs/shared/core/test/currency.test.ts`
- Test: `libs/shared/core/test/wallets.test.ts`
- Test: `libs/shared/core/test/copyRows.test.ts`

**Interfaces:**
- Consumes: `foldForSearch(text: string): string` from `libs/shared/core/src/listFilter.ts`.
- Produces:
  - `CurrencyCode` union of all 55 codes (`VND`, `USD`, `USDT`, `USDC`, `EUR`, `JPY`, `GBP`, `SGD`, `AUD`, `KRW`, `CNY`, `THB`, `TWD`, `HKD`, `MYR`, `IDR`, `PHP`, `INR`, `NZD`, `KHR`, `LAK`, `MMK`, `BND`, `MOP`, `PKR`, `BDT`, `LKR`, `NPR`, `CAD`, `CHF`, `SEK`, `NOK`, `DKK`, `PLN`, `CZK`, `HUF`, `RON`, `ISK`, `RUB`, `UAH`, `TRY`, `BRL`, `MXN`, `ARS`, `CLP`, `COP`, `AED`, `SAR`, `QAR`, `ILS`, `ZAR`, `EGP`, `NGN`, `DAI`, `EURC`).
  - `CurrencyInfo` interface `{ decimals: 0 | 2; symbol: string; max: number; nameVi: string; nameEn: string; badge: string; kind: 'fiat' | 'crypto'; popular?: boolean }`.
  - `CURRENCY_CODES: readonly CurrencyCode[]` (starting with `'VND'`, `'USD'`, `'USDT'`, followed by the other 9 popular codes, then regional tiers; 55 items total).
  - `CURRENCIES: Record<CurrencyCode, CurrencyInfo>`.
  - `searchCurrencies(query: string): CurrencyCode[]`.
  - Updated `formatMoney(minor: number, code: CurrencyCode): string` and `parseMoney(input: string, code: CurrencyCode): number | null`.
  - `isBeforeStart()` returning `false`.
  - `WalletDetailView` gains `excludeFromReports: boolean`; `CreateWalletInput` and `UpdateWalletInput` gain optional `excludeFromReports?: boolean`.

- [ ] **Step 1: Write failing tests in `libs/shared/core/test/currency.test.ts`, `wallets.test.ts`, and `copyRows.test.ts`**

Update `libs/shared/core/test/currency.test.ts` to assert:
- `CURRENCY_CODES` has length `55`, starts with `['VND', 'USD', 'USDT']`, and every entry has `nameVi`, `nameEn`, `badge`, `kind`, and `decimals` (`0` or `2`).
- `isCurrencyCode('EUR') === true`, `isCurrencyCode('JPY') === true`, `isCurrencyCode('USDC') === true`, `isCurrencyCode('XXX') === false`.
- `formatMoney(1000, 'JPY') === '1.000¥'`, `formatMoney(100_000, 'IDR') === '100.000 Rp'`, `formatMoney(123456, 'EUR') === '1.234,56 €'`.
- `parseMoney('1.000', 'JPY') === 1000`, `parseMoney('1000', 'KRW') === 1000`, `parseMoney('50k', 'JPY') === null`, `parseMoney('12.5', 'JPY') === null`, `parseMoney('50k', 'VND') === 50000`.
- `searchCurrencies('')` returns all 55 codes, `searchCurrencies('do la my')` contains `'USD'`, `searchCurrencies('yen nhat')` contains `'JPY'`, `searchCurrencies('₮')` contains `'USDT'`.

Update `libs/shared/core/test/wallets.test.ts`:
- Replace `'entries before the start date are ignored'` with `'entries dated before startDate still count toward balance (isBeforeStart is false)'` verifying `walletBalance(w, [e('v', 'expense', 200_000, '2026-11-09'), e('v', 'income', 50_000, '2026-11-10')]) === 850_000` and `isBeforeStart({ date: '2026-11-09' }, { startDate: '2026-11-10' }) === false`.

Update `libs/shared/core/test/copyRows.test.ts:141`:
- Update expected `beforeStart` on `'e-before'` to `false` (and rename test title to `'fills currency, beforeStart: false and tag names'`).

- [ ] **Step 2: Run core tests to verify failures**

Run: `npx nx test core`
Expected: FAIL on `CURRENCY_CODES` length 55, `isCurrencyCode('EUR')`, `searchCurrencies`, and `isBeforeStart` assertions.

- [ ] **Step 3: Implement currency catalog, `parseMoney`/`formatMoney`, `searchCurrencies`, `isBeforeStart`, and `api-types.ts`**

- In `libs/shared/core/src/currency.ts`:
  - Define the 55-entry `CURRENCIES` table matching Section 5.1 of the spec (`popular: true` on the first 12: `VND`, `USD`, `USDT`, `USDC`, `EUR`, `JPY`, `GBP`, `SGD`, `AUD`, `KRW`, `CNY`, `THB`).
  - Derive `CURRENCY_CODES` in exact table order (`VND`, `USD`, `USDT` first).
  - In `formatMoney(minor, code)`: for `info.decimals === 0`, emit `${sign}${whole}${sep}${info.symbol}` where `sep` is `''` when `info.symbol.length === 1` and `' '` when `info.symbol.length > 1`.
  - In `parseMoney(input, code)`: when `CURRENCIES[code].decimals === 0`, allow `k`/`tr` shortcuts only if `code === 'VND'`, otherwise parse whole integers (`^\d+$` or `^\d{1,3}([., ])\d{3}(?:\1\d{3})*$`) bounded by `CURRENCIES[code].max`. When `decimals === 2`, call `parseDecimalAmount(input, CURRENCIES[code].max)`.
  - Export `searchCurrencies(query: string): CurrencyCode[]` using `foldForSearch` across `code`, `symbol`, `nameVi`, and `nameEn`.
- In `libs/shared/core/src/wallets.ts`:
  - Keep `isBeforeStart(_entry, _wallet): boolean` signature exported so all callers compile unchanged, returning `false`.
- In `libs/shared/core/src/api-types.ts`:
  - Add `excludeFromReports: boolean` to `WalletDetailView` and `excludeFromReports?: boolean` to `CreateWalletInput` and `UpdateWalletInput`.

- [ ] **Step 4: Run core tests to verify pass**

Run: `npx nx test core`
Expected: PASS across all `@cc/core` unit tests.

- [ ] **Step 5: Commit**

```bash
git add libs/shared/core/src/currency.ts libs/shared/core/src/wallets.ts libs/shared/core/src/api-types.ts libs/shared/core/test/currency.test.ts libs/shared/core/test/wallets.test.ts libs/shared/core/test/copyRows.test.ts
git commit -m "feat(core): add 55-currency catalog, generalize 0-decimal parseMoney, drop startDate cutoff"
```

---

### Task 2: Additive Migration `0030_personal_wallet_options.sql` & API Support for `excludeFromReports`

**Files:**
- Create: `apps/api/migrations/0030_personal_wallet_options.sql`
- Modify: `libs/api/db/src/schema.ts`
- Modify: `apps/api/src/personal/wallets.ts`
- Modify: `apps/api/src/personal/list.ts:304-359`
- Create: `apps/api/test/schema-wallet-options.test.ts`
- Modify: `apps/api/test/personal-wallets-more.test.ts:135-168`
- Modify: `apps/api/test/personal-entries.test.ts:774-800`

**Interfaces:**
- Consumes: `CurrencyCode`, `WalletDetailView`, `CreateWalletInput`, `UpdateWalletInput`, `isCurrencyCode`, `isBeforeStart` from `@cc/core`.
- Produces:
  - `personalWalletOptions` Drizzle table export in `libs/api/db/src/schema.ts`.
  - `LoadedCalcWallet.excludeFromReports: boolean` in `apps/api/src/personal/wallets.ts`.
  - `POST /me/personal/wallets`, `POST /me/personal/wallets/add`, `PATCH /me/personal/wallets/:id` returning `excludeFromReports: boolean` on `wallet` and persisting `personal_wallet_options`.
  - `GET /me/personal/summary` skipping entries whose wallet has `excludeFromReports: true` when building `spent` and `income` totals (while retaining the wallet in `vndTotal`).

- [ ] **Step 1: Write failing API & schema tests**

- Create `apps/api/test/schema-wallet-options.test.ts` verifying `personal_wallet_options` exists with exact columns `['wallet_id', 'user_id', 'exclude_from_reports', 'enable_notification', 'linked_bank_code', 'updated_at']` and cascades delete on `personal_wallets` and `users`.
- In `apps/api/test/personal-wallets-more.test.ts`:
  - Update the `startDate` test (`'moving startDate after an entry flips its beforeStart and the balance'`) to assert that an entry dated before `startDate` still counts toward `balance` (`380_000`) and `beforeStart` is `false`.
  - Add tests verifying:
    - Creating a wallet with `JPY` (`startAmount: 10_000`, `startCostVnd: 1_700_000`) and `excludeFromReports: true` returns `excludeFromReports: true` and `currency: 'JPY'`.
    - Invalid non-boolean `excludeFromReports: 'yes'` returns `422`.
    - A wallet with `excludeFromReports: true` still contributes to `summary.totalVnd` / `summary.perCurrency`, while its expenses/incomes are excluded from `summary.spent` and `summary.income`; patching `excludeFromReports: false` on a wallet that already has entries (`entryCount > 0`) succeeds (`200`) and includes its entries in `summary.spent` / `summary.income` again.
    - Another account receives `404` when patching `excludeFromReports`.
- In `apps/api/test/personal-entries.test.ts`:
  - Update `'an entry dated before the wallet start is stored with beforeStart: true and leaves the balance'` so `beforeStart` is `false` and `balance` becomes `400_000`.

- [ ] **Step 2: Run API tests to verify failures**

Run: `npx nx test api`
Expected: FAIL on `personal_wallet_options` table missing, `excludeFromReports` assertions, and the updated `beforeStart` assertions.

- [ ] **Step 3: Write migration, schema, and API changes**

- Create `apps/api/migrations/0030_personal_wallet_options.sql` with `CREATE TABLE personal_wallet_options (...)` and `CREATE INDEX personal_wallet_options_user_id_idx ON personal_wallet_options(user_id)` per Spec Section 8.1.
- Add `personalWalletOptions` in `libs/api/db/src/schema.ts` right after `personalWalletSettings` (do NOT modify `personalWallets` or `personalWalletSettings`).
- In `apps/api/src/personal/wallets.ts`:
  - Add `excludeFromReports: boolean` to `LoadedCalcWallet`, left-join `personalWalletOptions` in `loadCalc` and `PATCH` select, and map `Boolean(r.excludeFromReports)` (default `false`).
  - Parse optional `excludeFromReports` boolean in `validateCreateWallet` (default `false`) and `PATCH` (`422` if defined and `typeof !== 'boolean'`).
  - Upsert `personalWalletOptions` inside the existing `db.batch(...)` in `POST /me/personal/wallets`, `POST /me/personal/wallets/add`, and `PATCH /me/personal/wallets/:id`; include `excludeFromReports` in `toWalletView`.
  - Allow `PATCH` on `excludeFromReports` even when `entryCount > 0`.
- In `apps/api/src/personal/list.ts`:
  - In `GET /me/personal/summary`, build `excludedWalletIds = new Set(wallets.filter((w) => w.excludeFromReports).map((w) => w.id))` and skip `e` in the `counted` loop if `excludedWalletIds.has(e.walletId)`.

- [ ] **Step 4: Run API tests (including untouched `schema-wallets.test.ts`, `schema-personal-money.test.ts`, `personal-wallets.test.ts`)**

Run: `npx nx test api`
Expected: PASS across all API tests with zero edits to Phase 1 or schema pin tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/migrations/0030_personal_wallet_options.sql libs/api/db/src/schema.ts apps/api/src/personal/wallets.ts apps/api/src/personal/list.ts apps/api/test/schema-wallet-options.test.ts apps/api/test/personal-wallets-more.test.ts apps/api/test/personal-entries.test.ts
git commit -m "feat(api): add personal_wallet_options, excludeFromReports summary filtering, and drop startDate balance cutoff"
```

---

### Task 3: Pure-Vector SVG Wallet Icon Packages, `<WalletIcon>`, `<CurrencyBadge>`, and Automated SVG Visual-Balance Test

**Files:**
- Create: `libs/web/screens/src/assets/wallet-icons/{ewallet,save,inv,life,fam,biz}/*.svg` (43 static pure-vector SVGs across packages 3–7 per Spec Section 6.2)
- Create: `libs/web/screens/src/assets/currency-icons/*.svg` (static pure-vector SVGs for every distinct currency badge symbol across all 55 currencies)
- Modify: `libs/web/screens/src/lib/bankApps.ts:18-27`
- Create: `libs/web/screens/src/components/walletIcon.ts`
- Create: `libs/web/screens/src/components/WalletIcon.tsx`
- Create: `libs/web/screens/src/components/CurrencyBadge.tsx`
- Test: `libs/web/screens/src/components/__tests__/wallet-icons-balance.test.tsx`

**Interfaces:**
- Consumes: `BANK_APPS`, `foldForSearch`, `CurrencyCode`, `CURRENCIES` from `@cc/core`; `Icon` from `@cc/web-ui/components/icons`; `bankAppLogo` from `../lib/bankApps`.
- Produces:
  - `WALLET_ICON_PACKAGES: readonly WalletIconPackage[]` (`id`, `labelVi`, `labelEn`, `tabIcon`, `keywords`, `items`) covering all 7 packages (`basic`, `bank`, `ewallet`, `save`, `inv`, `life`, `fam`).
  - `WALLET_PASTEL_TONES: readonly WalletPastelTone[]` (`'1'..'6'`, `'t'`, `'n'`).
  - `searchWalletIcons(query: string): WalletIconEntry[]` (matches icon labels/keywords OR parent package title/keywords via `foldForSearch`).
  - `resolveWalletIcon(icon: string | null | undefined): ResolvedWalletIcon`.
  - `walletIconClass(icon: string | null | undefined): string` (backward-compatible helper).
  - `<WalletIcon icon={icon} size="xs" | "sm" | "md" | "lg" className? />`.
  - `<CurrencyBadge code={code} selected? size="sm" | "md" className? />` (renders `<img src={...} alt="" />` from pure-vector `assets/currency-icons/*.svg`, never font text).

- [ ] **Step 1: Author pure-vector `.svg` assets for wallet icon packages & currency badges**

Generate clean, centered, multi-tone flat `.svg` files using `viewBox="0 0 32 32"` (for wallet icons) and `viewBox="0 0 24 24"` (for currency symbol badges):
- **Every SVG file must contain only geometric SVG primitives (`<path>`, `<circle>`, `<rect>`, `<polygon>`, `<polyline>`, `<line>`, `<ellipse>`, `<g>`)—strictly zero `<text>` or `<tspan>` elements.**
- Keep primary artwork comfortably inside safe padding margins (coordinates roughly within `3..29` on `32×32`, and `3..21` on `24×24`) and visually balanced around the center (`16,16` or `12,12`).
- Wallet icon slugs (43 files):
  - `ewallet/`: `momo`, `zalopay`, `vnpay`, `shopeepay`, `viettel`, `vnpt`, `applepay`, `googlepay`, `paypal`, `wise`, `grabpay`, `visa`, `mc`
  - `save/`: `piggy`, `emergency`, `house`, `car`, `edu`, `wedding`, `retire`, `gift`
  - `inv/`: `stocks`, `fund`, `gold`, `crypto`, `usdt`, `btc`, `eth`, `binance`, `okx`, `forex`
  - `life/`: `travel`, `luggage`, `food`, `coffee`, `sport`, `pet`
  - `fam/`: `home`, `couple`, `baby`
  - `biz/`: `shop`, `freelance`, `tax`
- Currency badge SVG files in `libs/web/screens/src/assets/currency-icons/` mapped cleanly from each `CurrencyInfo['badge']` (no `<text>` elements; drawn cleanly with `stroke="currentColor"` or clean dark/neutral geometric strokes/fills so `₫`, `$`, `$C`, `₮`, `€`, `¥`, `£`, `S$`, `A$`, `₩`, `฿`, `NT$`, `HK$`, `RM`, `Rp`, `₱`, `₹`, `NZ$`, `៛`, `₭`, `K`, `B$`, `P`, `₨`, `৳`, `Rs`, `C$`, `Fr`, `kr`, `zł`, `Kč`, `Ft`, `lei`, `₽`, `₴`, `₺`, `R$`, `M$`, `CL$`, `CO$`, `د.إ`, `﷼`, `QR`, `₪`, `R`, `E£`, `₦`, `◈`, `€C` render identically on every OS).

- [ ] **Step 2: Write the failing SVG visual-balance & icon/badge tests in `libs/web/screens/src/components/__tests__/wallet-icons-balance.test.tsx`**

Write tests asserting:
1. **Zero font dependency:** Read every `.svg` file in `assets/wallet-icons/` and `assets/currency-icons/`; assert `<svg` exists, a valid square `viewBox="0 0 N N"` (`N >= 24`) is declared, and neither `<text` nor `<tspan` nor `font-family` appears anywhere.
2. **Coordinate balance & safe-margin geometry:** Parse numeric coordinates from `<path d="...">` (after converting relative commands or tracking bounding box for `M/L/H/V/C/Q/A/Z` & `m/l/h/v/c/q/a`), `<circle cx cy r>`, `<rect x y width height>`, `<line x1 y1 x2 y2>`, `<polygon>`/`<polyline>` points, and `<ellipse>` in every `.svg` file; assert:
   - Overall artwork covers a meaningful area (width >= 35% of `N` and height >= 35% of `N`, not a tiny speck or empty canvas).
   - Outer bounding box stays within safe visual margin (does not clip past `[0, N]` and leaves balanced breathing room or intentional full-bleed background shape with foreground shapes centered).
   - Center of bounding box `(minX + maxX) / 2` and `(minY + maxY) / 2` lies within `±20%` of `(N/2, N/2)` so no icon looks lopsided.
3. **`WalletIcon` & `CurrencyBadge` rendering:**
   - Every item in all 7 `WALLET_ICON_PACKAGES` resolves to a valid icon (no broken/empty `img` src), legacy `bg-avatar-1..6` and `null`/unknown fallback render cleanly at `xs`, `sm`, `md`, `lg`.
   - `bank:nab` and `bank:vib` fall back to available `android-*.webp` when `ios-*.webp` is absent.
   - `searchWalletIcons('đầu tư')` returns all `inv:*` items; `searchWalletIcons('ngan hang')` returns all `bank:*` items + `basic:bank`; `searchWalletIcons('vcb')` finds `bank:vcb`.
   - `<CurrencyBadge code={code} />` renders cleanly for all 55 `CURRENCY_CODES`.

- [ ] **Step 3: Run test to verify failures**

Run: `npx vitest run libs/web/screens/src/components/__tests__/wallet-icons-balance.test.tsx`
Expected: FAIL because `walletIcon.ts`, `WalletIcon.tsx`, and `CurrencyBadge.tsx` do not exist yet.

- [ ] **Step 4: Implement `bankApps.ts` fallback, `walletIcon.ts`, `WalletIcon.tsx`, and `CurrencyBadge.tsx`**

- Update `libs/web/screens/src/lib/bankApps.ts` `bankAppLogo(appId)` to prefer the active platform (`ios` or `android`) and fall back to the opposite platform `.webp` if missing.
- Implement `libs/web/screens/src/components/walletIcon.ts` with all 7 packages (`basic`, `bank`, `ewallet`, `save`, `inv`, `life`, `fam`), `WALLET_PASTEL_TONES`, `searchWalletIcons`, `resolveWalletIcon`, and `walletIconClass`.
- Implement `libs/web/screens/src/components/WalletIcon.tsx` and `libs/web/screens/src/components/CurrencyBadge.tsx` using only Tailwind theme tokens (no raw hex in `.ts`/`.tsx`).

- [ ] **Step 5: Run balance test and style guard**

Run: `npx vitest run libs/web/screens/src/components/__tests__/wallet-icons-balance.test.tsx libs/web/screens/src/test/style-guard.test.ts`
Expected: PASS (all SVG files valid, pure-vector, centered & balanced; zero raw hex violations).

- [ ] **Step 6: Commit**

```bash
git add libs/web/screens/src/assets/wallet-icons libs/web/screens/src/assets/currency-icons libs/web/screens/src/lib/bankApps.ts libs/web/screens/src/components/walletIcon.ts libs/web/screens/src/components/WalletIcon.tsx libs/web/screens/src/components/CurrencyBadge.tsx libs/web/screens/src/components/__tests__/wallet-icons-balance.test.tsx
git commit -m "feat(web): add 7 pure-SVG wallet icon packages, CurrencyBadge, and SVG visual balance test"
```

---

### Task 4: `CurrencyPickerSheet`, `WalletIconPickerSheet`, `WalletForm`, `FirstWalletSheet`, and Wallet Icon Call Sites

**Files:**
- Modify: `libs/web/i18n/src/vi.ts`
- Modify: `libs/web/i18n/src/en.ts`
- Create: `libs/web/screens/src/components/CurrencyPickerSheet.tsx`
- Create: `libs/web/screens/src/components/WalletIconPickerSheet.tsx`
- Modify: `libs/web/screens/src/components/WalletForm.tsx`
- Modify: `libs/web/screens/src/components/FirstWalletSheet.tsx`
- Modify: `libs/web/screens/src/screens/WalletsScreen.tsx:53-63`
- Modify: `libs/web/screens/src/components/WalletSummary.tsx:43-50`
- Modify: `libs/web/screens/src/screens/EntryPage.tsx:1744-1774,2122-2139`
- Modify: `libs/web/screens/src/components/transactions/FilterPickView.tsx`
- Modify: `libs/web/screens/src/components/TransactionFilters.tsx`
- Modify: `libs/web/screens/src/components/__tests__/category-icon-and-wallet-form.test.tsx`
- Modify: `libs/web/screens/src/screens/__tests__/wallets.test.tsx:188-206`
- Modify: `libs/web/screens/src/screens/__tests__/entry-review-r1.test.tsx:515-536`

**Interfaces:**
- Consumes: `CURRENCY_CODES`, `CURRENCIES`, `searchCurrencies`, `CurrencyCode` from `@cc/core`; `<WalletIcon>`, `<CurrencyBadge>`, `WALLET_ICON_PACKAGES`, `searchWalletIcons` from Task 3; `Sheet`, `Input`, `Label`, `Button`, `Icon`, `InlineError` from `@cc/web-ui`.
- Produces:
  - `CurrencyPickerSheet({ open, onClose, value, onSelect })` with `data-testid="currency-picker-search"` and `data-testid="currency-option-${code}"`.
  - `WalletIconPickerSheet({ open, onClose, value, onSelect })` with `data-testid="wallet-icon-search"`, scrollbar-free tab strip `data-testid="wallet-icon-tabs"`, tab buttons `data-testid="wallet-icon-tab-${pkgId}"`, pastel tone dots `data-testid="wallet-icon-tone-${tone}"`, and options `data-testid="wallet-icon-option-${id}"`.
  - Updated `WalletForm`:
    - Row 1: `data-testid="wallet-form-icon-trigger"` beside `data-testid="wallet-form-name"` (`maxLength={40}`) + `{name.length}/40` counter.
    - Row 2: `data-testid="wallet-form-currency-trigger"` (disabled when `locked`) opening `CurrencyPickerSheet`.
    - Row 3: `data-testid="wallet-form-amount"` + conditional `data-testid="wallet-form-cost-vnd"` (no `wallet-form-date`).
    - Options: `data-testid="wallet-form-kind-everyday"` / `investment` + `data-testid="wallet-form-exclude-reports"` (`role="switch"`, `aria-checked`). No `enableNotification` or `linkedBankCode` controls rendered.
  - Updated `FirstWalletSheet` with `data-testid="first-wallet-icon-trigger"` beside `data-testid="first-wallet-name"` and `data-testid="first-wallet-currency-trigger"` opening `CurrencyPickerSheet`.

- [ ] **Step 1: Write/update failing component and screen tests**

- In `libs/web/screens/src/components/__tests__/category-icon-and-wallet-form.test.tsx`:
  - Update the two non-VND `startCostVnd` tests to click `wallet-form-currency-trigger` / `first-wallet-currency-trigger`, pick `currency-option-USD`, and verify `startCostVnd` validation.
  - Add new tests verifying:
    - `WalletForm` renders no `wallet-form-date` input, shows icon trigger beside name input, enforces 40-char limit, toggles `wallet-form-exclude-reports` (`aria-checked`), locks currency & kind triggers when `wallet.entryCount > 0` while keeping `excludeFromReports` editable, and does NOT render notification or bank-link toggles.
    - `CurrencyPickerSheet` renders Popular + All sections, filters by accent-folded Vietnamese name (`"yen nhat"` -> `JPY`) and code (`"SGD"`), and selects currency on click.
    - `WalletIconPickerSheet` switches packages via tabs (`wallet-icon-tab-bank`, `wallet-icon-tab-ewallet`), carries scrollbar-hiding classes on `wallet-icon-tabs`, hides tabs when searching, and matches category names (`"đầu tư"` -> `inv:*` icons).
- Update `libs/web/screens/src/screens/__tests__/wallets.test.tsx:192` and `libs/web/screens/src/screens/__tests__/entry-review-r1.test.tsx:524` to select `USD` via `wallet-form-currency-trigger` / `first-wallet-currency-trigger` -> `currency-option-USD` and verify `excludeFromReports` in submitted `POST` body.

- [ ] **Step 2: Run screen tests to verify failures**

Run: `npx vitest run libs/web/screens/src/components/__tests__/category-icon-and-wallet-form.test.tsx libs/web/screens/src/screens/__tests__/wallets.test.tsx libs/web/screens/src/screens/__tests__/entry-review-r1.test.tsx`
Expected: FAIL on missing triggers, picker sheets, and removed `wallet-form-date`.

- [ ] **Step 3: Add i18n keys, build `CurrencyPickerSheet` and `WalletIconPickerSheet`, update forms & call sites**

- Add new keys in `libs/web/i18n/src/vi.ts` (all marked `// REVIEW`) and `en.ts` for currency picker (`pickCurrency`, `searchCurrency`, `popularCurrencies`, `allCurrencies`, `noCurrencyMatch`), icon picker (`pickIcon`, `searchIcon`, `noIconMatch`, `iconTone`), and `excludeFromReports` (`walletForm.excludeFromReports`, `walletForm.excludeFromReportsHint`, `walletForm.options`).
- Implement `CurrencyPickerSheet.tsx` and `WalletIconPickerSheet.tsx` using `Sheet`, `Input`, `Icon`, `<CurrencyBadge>`, and `<WalletIcon>`.
- Update `WalletForm.tsx`:
  - Remove `startDate` state and `wallet-form-date` `<Input>` (and `todayLocal` import if unused).
  - Put Row 1 (`wallet-form-icon-trigger` + `wallet-form-name`), Row 2 (`wallet-form-currency-trigger`), Row 3 (`wallet-form-amount` + conditional `wallet-form-cost-vnd`), Options (`wallet-form-kind-*` + `wallet-form-exclude-reports`), Submit.
  - Send `excludeFromReports` (and omit `startDate`) in create/update mutations.
- Update `FirstWalletSheet.tsx`:
  - Add `icon` state (default `'bg-avatar-5'`), Row 1 `first-wallet-icon-trigger` + `first-wallet-name`, Row 2 `first-wallet-currency-trigger` opening `CurrencyPickerSheet`, and pass `icon` on create when non-default.
- Replace `<Icon name="wallet" />` / `walletIconClass` tile divs in `WalletsScreen.tsx`, `WalletSummary.tsx`, `EntryPage.tsx` (selected wallet rows + picker sheet list), and `TransactionFilters.tsx`/`FilterPickView.tsx` (`leadingOf` prop) with `<WalletIcon>`.

- [ ] **Step 4: Run targeted screen tests, style guard, and full verification suite**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS across every workspace project (`core`, `api`, `web-ui`, `web-data-access`, `web-screens`, `web`, `zalo`), zero type errors, zero lint errors.

- [ ] **Step 5: Run required Playwright specs**

Run: `npm run e2e -- golden-path.spec.ts && npm run e2e -- walkthrough.spec.ts`
Expected: PASS on both required E2E specs.

- [ ] **Step 6: Commit**

```bash
git add libs/web/i18n libs/web/screens
git commit -m "feat(web): redesign WalletForm with scalable currency picker, tabbed icon packages, and excludeFromReports"
```
