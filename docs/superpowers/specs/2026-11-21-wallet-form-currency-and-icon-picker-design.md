# Wallet form: scalable currency picker, tabbed icon packages, and no start date

Issue: [#134](https://github.com/NguyenVuNhan/Coin-crew/issues/134) · Parent: [#55](https://github.com/NguyenVuNhan/Coin-crew/issues/55) · Follow-up from owner review of PR #131 (2026-11-18).

Builds on: `2026-11-13-phase-2-personal-money-breakdown-design.md` (D1–D9, Phase 1 guard rules), `2026-11-15-spending-book-shape-and-navigation-design.md`, and `2026-11-16-wallets-and-transactions-design.md`. Every Phase 1 guard rule in #55 stands unchanged.

Brainstormed with the owner on 2026-11-21. Each decision is marked **owner** (explicitly stated by the owner) or **my call** (proposed/settled in design; the owner may overrule).

---

## 1. Intent and Why

Today's wallet create/edit form (`WalletForm` and `FirstWalletSheet`) has three scaling and usability problems identified in the PR #131 review:

1. **Currency buttons don't scale:** Three inline `VND / USD / USDT` buttons fail as soon as more world and digital currencies are added.
2. **Start date adds unwanted friction:** Asking for `Ngày bắt đầu` on creation/edit and ignoring transactions dated before it breaks the natural workflow of creating a wallet today and logging older expenses from earlier in the week or month.
3. **Icons are only 6 colour swatches at the bottom:** Owners want a recognizable wallet identity (banks, e-wallets, goals, investments, everyday icons) sitting directly next to the wallet name, organized into themed packages so it can grow into an icon store later.

At the same time, the wallet form gains an active **Exclude wallet transactions from total report** option (`Không tính vào báo cáo tổng`) while keeping space in the data model (but hidden in the UI) for two upcoming Stage 2 features (**Enable wallet notification** for #121, **Link to a bank** for #118/#119).

---

## 2. Goals, Non-Goals, Anti-Goals

**Goals**
- Redesign the wallet create/edit form into a clean top-to-bottom layout:
  1. Row 1: Tappable logo tile to the left of the length-limited wallet name field.
  2. Row 2: Tappable currency row (symbol badge + currency name) opening a searchable scalable currency picker.
  3. Row 3: Starting balance (`Số dư ban đầu`, plus conditional `startCostVnd` for non-VND wallets), with `Ngày bắt đầu` removed from the UI.
  4. Later rows: Wallet kind (`Loại ví`: Everyday / Investment) and **Exclude wallet transactions from total report** (`Không tính vào báo cáo tổng`).
- Expand currency support from 3 currencies to a scalable **55-currency catalog** (51 fiat + 4 stablecoins, all `0 | 2` decimals) with generalized 0-decimal parsing.
- Build a **7-package themed wallet icon system** (`Basic & Everyday`, `Vietnam Banks`, `E-Wallets & Payments`, `Savings & Goals`, `Investments & Crypto`, `Travel & Lifestyle`, `Family & Business`) presented in a **messaging-style tabbed icon picker with no visible scrollbar** and **category-aware search** (matching both icon keywords and package/category names).
- Render chosen wallet icons consistently everywhere wallets appear (`WalletForm`, `FirstWalletSheet`, `WalletsScreen`, `WalletSummary`, `EntryPage` wallet picker, and transaction wallet filters).
- Remove the "before start date" transaction cutoff so every transaction in a wallet counts toward its balance regardless of date.

**Non-Goals**
- Live exchange rates or market prices (Phase 2 rule 9).
- 3-decimal fiat currencies (`KWD`, `BHD`, `OMR`, etc.) or volatile crypto currencies (`BTC`, `ETH`) as wallet cash currencies (`personal_assets` already handles up to 8 decimals).
- Exposing or wiring **Enable wallet notification** (#121) or **Link to a bank** (#118/#119) in the UI right now—both remain hidden until their Stage 2 tickets ship.
- Remote/paid icon store backend (the package architecture prepares for it without building an external store API now).

**Anti-Goals (a failure even if it works)**
- Showing a visible horizontal scrollbar on the icon package tab strip.
- Leaving any raw hex colour inside `.ts`/`.tsx` files under `libs/web/` (must pass `libs/web/screens/src/test/style-guard.test.ts`; brand/illustrated artwork lives in static `.svg` / `.webp` files or uses theme tokens).
- Relying on Unicode flag emojis (`🇻🇳`, `🇺🇸`) as the primary currency icon (Windows browsers render them as two-letter `VN`/`US` text; crisp symbol badge tiles work everywhere).
- Silently ignoring backdated transactions dated before a wallet's `createdAt` / `start_date`.
- Breaking any Phase 1 test, Phase 1 table, or `schema-wallets.test.ts` / `schema-personal-money.test.ts` column-count check.

---

## 3. Decisions

| # | Decision | By |
|---|---|---|
| WF1 | **Row 1: Logo tile left of Wallet Name (1–40 chars).** Tapping the logo opens a dedicated package-based Icon Picker. | owner |
| WF2 | **Row 2: Currency row showing currency icon + currency name.** Tapping opens the Currency Selector where each row shows currency icon + currency name. | owner |
| WF3 | **Row 3: Starting balance.** Conditional `startCostVnd` appears beneath it when `currency !== 'VND'` and `startAmount !== 0`. | owner (Row 3 balance); my call (keep `startCostVnd` beneath it per W13) |
| WF4 | **Start date removed from UI and stored in DB only.** `personal_wallets.start_date` is set automatically to creation day (`YYYY-MM-DD`) and never shown or edited in the form. | owner |
| WF5 | **Drop the "before start date" transaction cutoff.** Adding a transaction dated before the wallet's creation day must still affect the wallet's balance normally; `isBeforeStart` ceases filtering entries. | owner ("adding transaction should not matter to the start date") |
| WF6 | **Bottom options:** `Loại ví` (`everyday` / `investment`, locked once entries exist) and **Exclude wallet transactions from total report** (`excludeFromReports` switch) ship now. **Enable wallet notification** and **Link to a bank** are hidden in the UI until #121 and #118/#119 (and their issues were updated accordingly). | owner |
| WF7 | **Excluded wallet behavior:** When a wallet has `excludeFromReports: true`, all transactions inside it are ignored in the Sổ chi tiêu Overview monthly `spent`/`income` totals (and in #115 reports), while the wallet itself remains in `WalletsScreen` and `vndTotal` unless archived. | owner |
| WF8 | **55-currency catalog (`0 \| 2` decimals):** 51 world fiat currencies + 4 USD/EUR stablecoins (`USDT`, `USDC`, `DAI`, `EURC`). Popular currencies pinned at top; searchable by code, symbol, Vietnamese (accent-folded), and English name. | my call (proposed catalog approved by owner) |
| WF9 | **Currency icons use pure-vector SVG symbol badges (`₫`, `$`, `₮`, `€`, `¥`, `£`, `₩`...)** inside a rounded tile rather than flag emojis or font text. | my call (symbol badges); owner (pure SVG, no font text) |
| WF10 | **7 themed wallet icon packages:** `basic`, `bank` (reusing the 34 VietQR `.webp` logos), `ewallet`, `save`, `inv`, `life`, `fam`/`biz`. | my call (proposed packages approved by owner) |
| WF11 | **Messaging-style tabbed icon picker with no scrollbar:** Package tabs sit in a horizontal scrollbar-free strip; tapping a tab shows only that package's icons. Typing in the search bar hides the tab strip and searches both icon names/keywords and package/category names. | owner |
| WF12 | **`FirstWalletSheet` alignment:** Apply the same Row 1 (icon trigger left of name) and Row 2 (currency selector trigger row) to `FirstWalletSheet` while keeping `Basic / Wallet` (`bg-avatar-5`) and `VND` preselected so first-wallet onboarding still takes one tap to save. | my call |
| WF13 | **Additive `personal_wallet_options` table:** Store `exclude_from_reports`, `enable_notification`, and `linked_bank_code` in a new table `personal_wallet_options` (migration `0030`) rather than altering `personal_wallet_settings` (whose 8 columns are pinned by `schema-personal-money.test.ts`) or `personal_wallets` (9 columns pinned by `schema-wallets.test.ts`). | my call |
| WF14 | **Pure-SVG icons with visual-balance verification:** All generated wallet icons and currency badges use pure SVG vector paths/shapes (`<path>`, `<circle>`, `<rect>`, `<polygon>`, `<line>`, `<polyline>`, `<ellipse>`—zero `<text>`/`<tspan>` or font dependencies) and are covered by an automated test checking `viewBox` centering, balance, padding, and multi-size rendering. | owner |

---

## 4. Wallet Form & FirstWalletSheet Layout

### 4.1 `WalletForm` Structure (Top to Bottom)

1. **Row 1 — Logo + Wallet Name (`Biểu tượng & Tên ví`):**
   - Horizontal row (`flex items-center gap-2.5`):
     - Left: A 44×44px (`size-11`, `min-h-11 min-w-11`) tappable icon trigger button rendering `<WalletIcon icon={icon} size="md" />` with a subtle edit indicator badge (`✎` / pencil badge or focus ring) and `aria-label` describing "Change wallet icon". Tapping opens `WalletIconPickerSheet` (full-height bottom `Sheet` on mobile / `Modal` dialog from 640px).
     - Right: `<Input>` for wallet name (`flex-1`, `text-base`, `maxLength={40}`), with optional subtle character counter (`{name.length}/40`) in the field label row (`text-xs text-muted-foreground tabular-nums`).
2. **Row 2 — Currency (`Tiền tệ`):**
   - Full-width tappable row button (`min-h-12`, white `bg-card`, `border-border`, `rounded-xl`) showing:
     - Leading currency symbol badge tile (`size-8 rounded-lg` with `CURRENCIES[currency].badge`, e.g. `₫`, `$`, `₮`).
     - Localized currency name (`nameVi` in Vietnamese, `nameEn` in English) + `currency` code subtitle (`VND`, `USD`, `JPY`…).
     - Trailing `chevronRight` icon (hidden or muted when `locked`).
   - Disabled when `locked` (`Boolean(wallet && wallet.entryCount > 0)`), showing the existing `walletForm.lockedHint` text underneath.
   - Tapping opens `CurrencyPickerSheet`.
3. **Row 3 — Starting Balance (`Số dư ban đầu`):**
   - Same amount input + live `formatMoney(resolvedAmount, currency)` preview + inline validation error as today. Supports negative values via leading `-`/`−`.
   - **No `Ngày bắt đầu` (`startDate`) field anywhere in the form.**
   - When `currency !== 'VND'` and `resolvedAmount !== null && resolvedAmount !== 0`, the existing `Giá trị VND ban đầu` (`startCostVnd`) input appears directly beneath Row 3 so the wallet's initial VND cost basis (W13) is captured.
4. **Later Rows — Options (`Tuỳ chọn`):**
   - Grouped list block (`bg-card border border-border rounded-xl divide-y divide-border`):
     - **Loại ví (`kind`):** `Chi tiêu` (`everyday`) / `Đầu tư` (`investment`) segmented toggle; disabled when `locked` (`entryCount > 0`).
     - **Không tính vào báo cáo tổng (`excludeFromReports`):** Standard row with title `"Không tính vào báo cáo tổng"` (`// REVIEW`), short muted subtitle `"Bỏ qua giao dịch của ví này ở tổng quan và báo cáo"` (`// REVIEW`), and an accessible toggle switch (`role="switch"`, `aria-checked`, 44px touch target).
   - **Deferred options (hidden in UI):** `Enable wallet notification` and `Link to a bank` are **not rendered** in `WalletForm` in #134; their state/columns sit dormant until #121 and #118/#119 unhide them.
5. **Submit Button:** Full-width primary pill button (`Lưu`).

### 4.2 `FirstWalletSheet` Alignment (**my call**)

To keep wallet creation consistent across the app without slowing down first-time setup:
- Replace the 3-column inline currency grid in `FirstWalletSheet` with the same Row 2 **Currency Selector trigger** (`VND` selected by default).
- Place the same 44×44px `<WalletIcon>` trigger button next to the wallet name field (default `'bg-avatar-5'`, prefilled name `'Tiền mặt'`).
- Keep `FirstWalletSheet` focused: omit `excludeFromReports` there (defaults to `false`; editable later on the wallet form) so a brand-new user can still tap Create immediately.

---

## 5. Scalable 55-Currency Catalog & Currency Picker

### 5.1 Currency Metadata (`libs/shared/core/src/currency.ts`)

Extend `CurrencyInfo` (preserving existing fields `decimals`, `symbol`, `max`):

```ts
export interface CurrencyInfo {
  decimals: 0 | 2;
  symbol: string;
  max: number;
  nameVi: string;
  nameEn: string;
  badge: string;
  kind: 'fiat' | 'crypto';
  popular?: boolean;
}
```

Keep `VND`, `USD`, `USDT` as the first three entries of `CURRENCY_CODES` so canonical `perCurrency` / `totals` ordering stays deterministic and familiar.

#### Complete 55-Currency Catalog

**Popular / Pinned (12 currencies)**
| Code | Dec | Symbol | Max (minor) | Vietnamese Name (`nameVi`) | English Name (`nameEn`) | Badge | Kind |
|---|---:|---|---:|---|---|---|---|
| `VND` | 0 | `₫` | `1_000_000_000_000` | Việt Nam Đồng | Vietnamese Dong | `₫` | fiat |
| `USD` | 2 | `$` | `10_000_000_000` | Đô la Mỹ | US Dollar | `$` | fiat |
| `USDT` | 2 | `USDT` | `10_000_000_000` | Tether USD | Tether | `₮` | crypto |
| `USDC` | 2 | `USDC` | `10_000_000_000` | USD Coin | USD Coin | `$C` | crypto |
| `EUR` | 2 | `€` | `10_000_000_000` | Euro | Euro | `€` | fiat |
| `JPY` | 0 | `¥` | `100_000_000_000` | Yên Nhật | Japanese Yen | `¥` | fiat |
| `GBP` | 2 | `£` | `10_000_000_000` | Bảng Anh | British Pound | `£` | fiat |
| `SGD` | 2 | `S$` | `10_000_000_000` | Đô la Singapore | Singapore Dollar | `S$` | fiat |
| `AUD` | 2 | `A$` | `10_000_000_000` | Đô la Úc | Australian Dollar | `A$` | fiat |
| `KRW` | 0 | `₩` | `100_000_000_000` | Won Hàn Quốc | South Korean Won | `₩` | fiat |
| `CNY` | 2 | `¥` | `10_000_000_000` | Nhân dân tệ | Chinese Yuan | `¥` | fiat |
| `THB` | 2 | `฿` | `10_000_000_000` | Baht Thái | Thai Baht | `฿` | fiat |

**Asia-Pacific (16 currencies)**
| Code | Dec | Symbol | Max (minor) | `nameVi` | `nameEn` | Badge | Kind |
|---|---:|---|---:|---|---|---|---|
| `TWD` | 0 | `NT$` | `10_000_000_000` | Đô la Đài Loan | New Taiwan Dollar | `NT$` | fiat |
| `HKD` | 2 | `HK$` | `10_000_000_000` | Đô la Hồng Kông | Hong Kong Dollar | `HK$` | fiat |
| `MYR` | 2 | `RM` | `10_000_000_000` | Ringgit Malaysia | Malaysian Ringgit | `RM` | fiat |
| `IDR` | 0 | `Rp` | `1_000_000_000_000` | Rupiah Indonesia | Indonesian Rupiah | `Rp` | fiat |
| `PHP` | 2 | `₱` | `10_000_000_000` | Peso Philippines | Philippine Peso | `₱` | fiat |
| `INR` | 2 | `₹` | `100_000_000_000` | Rupee Ấn Độ | Indian Rupee | `₹` | fiat |
| `NZD` | 2 | `NZ$` | `10_000_000_000` | Đô la New Zealand | New Zealand Dollar | `NZ$` | fiat |
| `KHR` | 0 | `៛` | `1_000_000_000_000` | Riel Campuchia | Cambodian Riel | `៛` | fiat |
| `LAK` | 0 | `₭` | `1_000_000_000_000` | Kip Lào | Lao Kip | `₭` | fiat |
| `MMK` | 0 | `K` | `1_000_000_000_000` | Kyat Myanmar | Myanmar Kyat | `K` | fiat |
| `BND` | 2 | `B$` | `10_000_000_000` | Đô la Brunei | Brunei Dollar | `B$` | fiat |
| `MOP` | 2 | `MOP$` | `10_000_000_000` | Pataca Ma Cao | Macanese Pataca | `P` | fiat |
| `PKR` | 2 | `₨` | `100_000_000_000` | Rupee Pakistan | Pakistani Rupee | `₨` | fiat |
| `BDT` | 2 | `৳` | `100_000_000_000` | Taka Bangladesh | Bangladeshi Taka | `৳` | fiat |
| `LKR` | 2 | `Rs` | `100_000_000_000` | Rupee Sri Lanka | Sri Lankan Rupee | `Rs` | fiat |
| `NPR` | 2 | `₨` | `100_000_000_000` | Rupee Nepal | Nepalese Rupee | `₨` | fiat |

**Americas & Europe (18 currencies)**
| Code | Dec | Symbol | Max (minor) | `nameVi` | `nameEn` | Badge | Kind |
|---|---:|---|---:|---|---|---|---|
| `CAD` | 2 | `CA$` | `10_000_000_000` | Đô la Canada | Canadian Dollar | `C$` | fiat |
| `CHF` | 2 | `CHF` | `10_000_000_000` | Franc Thụy Sĩ | Swiss Franc | `Fr` | fiat |
| `SEK` | 2 | `kr` | `10_000_000_000` | Krona Thụy Điển | Swedish Krona | `kr` | fiat |
| `NOK` | 2 | `kr` | `10_000_000_000` | Krone Na Uy | Norwegian Krone | `kr` | fiat |
| `DKK` | 2 | `kr` | `10_000_000_000` | Krone Đan Mạch | Danish Krone | `kr` | fiat |
| `PLN` | 2 | `zł` | `10_000_000_000` | Zloty Ba Lan | Polish Zloty | `zł` | fiat |
| `CZK` | 2 | `Kč` | `10_000_000_000` | Koruna Séc | Czech Koruna | `Kč` | fiat |
| `HUF` | 0 | `Ft` | `100_000_000_000` | Forint Hungary | Hungarian Forint | `Ft` | fiat |
| `RON` | 2 | `lei` | `10_000_000_000` | Leu Romania | Romanian Leu | `lei` | fiat |
| `ISK` | 0 | `kr` | `100_000_000_000` | Króna Iceland | Icelandic Króna | `kr` | fiat |
| `RUB` | 2 | `₽` | `100_000_000_000` | Rúp Nga | Russian Ruble | `₽` | fiat |
| `UAH` | 2 | `₴` | `10_000_000_000` | Hryvnia Ukraine | Ukrainian Hryvnia | `₴` | fiat |
| `TRY` | 2 | `₺` | `10_000_000_000` | Lira Thổ Nhĩ Kỳ | Turkish Lira | `₺` | fiat |
| `BRL` | 2 | `R$` | `10_000_000_000` | Real Brazil | Brazilian Real | `R$` | fiat |
| `MXN` | 2 | `MX$` | `10_000_000_000` | Peso Mexico | Mexican Peso | `M$` | fiat |
| `ARS` | 2 | `AR$` | `100_000_000_000` | Peso Argentina | Argentine Peso | `A$` | fiat |
| `CLP` | 0 | `CLP$` | `100_000_000_000` | Peso Chile | Chilean Peso | `CL$` | fiat |
| `COP` | 0 | `COL$` | `1_000_000_000_000` | Peso Colombia | Colombian Peso | `CO$` | fiat |

**Middle East, Africa & Additional Stablecoins (9 currencies)**
| Code | Dec | Symbol | Max (minor) | `nameVi` | `nameEn` | Badge | Kind |
|---|---:|---|---:|---|---|---|---|
| `AED` | 2 | `AED` | `10_000_000_000` | Dirham UAE | UAE Dirham | `د.إ` | fiat |
| `SAR` | 2 | `SAR` | `10_000_000_000` | Riyal Ả Rập Xê Út | Saudi Riyal | `﷼` | fiat |
| `QAR` | 2 | `QAR` | `10_000_000_000` | Riyal Qatar | Qatari Riyal | `QR` | fiat |
| `ILS` | 2 | `₪` | `10_000_000_000` | Shekel Israel | Israeli New Shekel | `₪` | fiat |
| `ZAR` | 2 | `R` | `10_000_000_000` | Rand Nam Phi | South African Rand | `R` | fiat |
| `EGP` | 2 | `E£` | `10_000_000_000` | Bảng Ai Cập | Egyptian Pound | `E£` | fiat |
| `NGN` | 2 | `₦` | `100_000_000_000` | Naira Nigeria | Nigerian Naira | `₦` | fiat |
| `DAI` | 2 | `DAI` | `10_000_000_000` | Dai | Dai | `◈` | crypto |
| `EURC` | 2 | `EURC` | `10_000_000_000` | Euro Coin | Euro Coin | `€C` | crypto |

*(Notes: Currencies whose minor sub-unit is obsolete in everyday cash tracking—`IDR`, `TWD`, `HUF`, `KHR`, `LAK`, `MMK`, `COP`—use `decimals: 0`.)*

### 5.2 Parsing & Formatting Rules (`libs/shared/core/src/currency.ts`)

- **Generalize `parseMoney(input, code)`:** Currently `parseMoney` routes only `code === 'VND'` to `parseVndAmount`, which would multiply `JPY`, `KRW`, `IDR`, etc. by `100`. Update `parseMoney` so:
  - When `CURRENCIES[code].decimals === 0`: parse whole-unit integers (`^\d+$` or grouped `\d{1,3}([., ])\d{3}...`) bounded by `CURRENCIES[code].max`. Allow `k` / `tr` shortcuts only when `code === 'VND'` (so `50k` remains rejected for foreign currencies while `50k` / `2tr` continue working for `VND`).
  - When `CURRENCIES[code].decimals === 2`: use `parseDecimalAmount(input, CURRENCIES[code].max)` as today.
- **Formatting `decimals === 0` symbols (`formatMoney`):** Keep tight attachment for single-character symbols (`1.234.567₫`, `1.000¥`, `1.000₩`), and add a space before multi-character symbols (`100.000 Rp`, `1.000 NT$`, `5.000 Ft`) so output stays readable.

### 5.3 `CurrencyPickerSheet` Behavior

- Opens via `Sheet` wrapper (bottom sheet on phones, centered modal dialog from 640px).
- Top search `<Input type="search">` (`text-base`, `min-h-11`) filtering across `code`, `symbol`, `nameVi` (accent-folded via `normalizeName`), and `nameEn`.
- When query is empty: two grouped sections — **Phổ biến** (`popular: true`, 12 currencies) and **Tất cả tiền tệ** (remaining 43 currencies).
- Each row (`min-h-11`):
  - Leading symbol badge (`size-9 rounded-xl`, `bg-secondary text-secondary-foreground` when selected, `bg-muted text-foreground` otherwise) showing `info.badge`.
  - Primary label: localized currency name (`nameVi` / `nameEn`), `font-semibold`.
  - Secondary label: `code · symbol` (e.g. `JPY · ¥`).
  - Trailing checkmark (`Icon name="check"`) on the active currency.
- Selecting a currency immediately updates the form's `currency` state and closes the picker sheet.

---

## 6. Wallet Icon Packages & Tabbed Icon Picker

### 6.1 Package Registry & Storage ID Format

`personal_wallet_settings.icon` accepts nullable strings up to **40 characters** (`parseOptionalIcon` in `apps/api/src/personal/wallets.ts`). No DB schema change is required for icons.

All icon IDs use short package prefixes (`<= 24` chars):

| Prefix / Format | Example | Storage meaning | Backward compatibility |
|---|---|---|---|
| `bg-avatar-[1-6]` | `bg-avatar-5` | Legacy Basic Wallet + pastel tone 1–6 | Preserves 100% of existing DB rows & tests |
| `basic:<glyph>[:tone]` | `basic:cash:4`, `basic:card:2` | Vector icon from `Cơ bản` + tone `1..6` (`avatar-1..6`), `t` (`secondary`), or `n` (`muted`) | If `:tone` omitted, uses glyph's curated default tone |
| `bank:<appId>` | `bank:vcb`, `bank:mb`, `bank:cake` | Vietnam bank logo from `assets/bank-apps/{ios\|android}-<appId>.webp` | Falls back across `ios`/`android` (e.g. `nab`, `vib`) and to `basic:bank:2` if missing |
| `ewallet:<slug>` | `ewallet:momo`, `ewallet:zalopay` | Brand/payment SVG from `assets/wallet-icons/ewallet/` | — |
| `save:<slug>` | `save:piggy`, `save:house` | Goal illustration SVG from `assets/wallet-icons/save/` | — |
| `inv:<slug>` | `inv:stocks`, `inv:binance` | Investment/crypto SVG from `assets/wallet-icons/inv/` | — |
| `life:<slug>` | `life:travel`, `life:sport` | Travel/lifestyle SVG from `assets/wallet-icons/life/` | — |
| `fam:<slug>` / `biz:<slug>` | `fam:home`, `biz:shop` | Family & business SVG from `assets/wallet-icons/fam/` & `biz/` | — |

### 6.2 The 7 Icon Packages (Themes)

Each package has a localized title, short tab label, tab icon, and category search keywords so searching by package/category name returns all icons inside that package.

1. **Cơ bản (Basic & Everyday · `basic:*`)** — Category keywords: `co ban, basic, everyday, mac dinh, co ban`
   - 8 vector glyphs: `wallet` (Ví), `cash` (Tiền mặt), `coins` (Tiền lẻ), `card` (Thẻ), `bank` (Ngân hàng), `vault` (Két sắt), `salary` (Lương), `jar` (Hũ chi tiêu).
   - Supports choosing any of the **6 pastel avatar tones** (`avatar-1..6`) via a compact colour dot selector shown inside the `Cơ bản` tab.
2. **Ngân hàng Việt Nam (Vietnam Banks · `bank:*`)** — Category keywords: `ngan hang, viet nam, vietnam banks, bank, vietqr`
   - Reuses all **34 unique bank app logos** already shipped in `libs/web/screens/src/assets/bank-apps/` (`mb`, `vcb`, `tcb`, `icb`, `bidv`, `vba`, `vpb`, `cake`, `acb`, `tpb`, `ocb`, `timo`, `lpb`, `vib-2`, `hdb`, `shb`, `seab`, `shbvn`, `scb`, `nab`, `abb`, `eib`, `coopbank`, `pvcb`, `wvn`, `klb`, `bvb`, `vab`, `ncb`, `oceanbank`, `pbvn`, `sgicb`, `cimb`, `acb-biz`), ordered by `monthlyInstall` from `BANK_APPS` and searchable by bank shortName, appName, and bankCode.
3. **Ví điện tử & Thanh toán (E-Wallets & Payments · `ewallet:*`)** — Category keywords: `vi dien tu, thanh toan, ewallet, payment, pay`
   - 13 flat static SVGs: `momo` (MoMo), `zalopay` (ZaloPay), `vnpay` (VNPay), `shopeepay` (ShopeePay), `viettel` (Viettel Money), `vnpt` (VNPT Money), `applepay` (Apple Pay), `googlepay` (Google Pay), `paypal` (PayPal), `wise` (Wise), `grabpay` (Grab / Moca), `visa` (Visa), `mc` (Mastercard).
4. **Tiết kiệm & Mục tiêu (Savings & Goals · `save:*`)** — Category keywords: `tiet kiem, muc tieu, savings, goals`
   - 8 flat static SVGs: `piggy` (Heo đất), `emergency` (Quỹ dự phòng), `house` (Mua nhà), `car` (Mua xe), `edu` (Học tập), `wedding` (Cưới hỏi), `retire` (Hưu trí), `gift` (Lì xì / Quà).
5. **Đầu tư & Crypto (Investments & Crypto · `inv:*`)** — Category keywords: `dau tu, chung khoan, crypto, investments, invest`
   - 10 flat static SVGs: `stocks` (Chứng khoán), `fund` (Quỹ / ETF), `gold` (Vàng), `crypto` (Crypto), `usdt` (USDT), `btc` (Bitcoin), `eth` (Ethereum), `binance` (Binance), `okx` (OKX / Bybit), `forex` (Ngoại tệ).
6. **Du lịch & Đời sống (Travel & Lifestyle · `life:*`)** — Category keywords: `du lich, doi song, travel, lifestyle`
   - 6 flat static SVGs: `travel` (Du lịch), `luggage` (Công tác), `food` (Ăn uống), `coffee` (Cà phê), `sport` (Thể thao), `pet` (Thú cưng).
7. **Gia đình & Kinh doanh (Family & Business · `fam:*` / `biz:*`)** — Category keywords: `gia dinh, kinh doanh, family, business`
   - 6 flat static SVGs: `fam:home` (Gia đình), `fam:couple` (Quỹ chung), `fam:baby` (Con cái), `biz:shop` (Kinh doanh), `biz:freelance` (Freelance), `biz:tax` (Thuế & Hóa đơn).

*Style-guard & SVG-purity compliance:* All custom illustrated/brand SVGs for packages 3–7 and currency symbol badges are authored as standalone static pure-vector `.svg` files under `libs/web/screens/src/assets/wallet-icons/<pkg>/<slug>.svg` and `libs/web/screens/src/assets/currency-icons/<badge>.svg` and imported via `import.meta.glob(..., { eager: true, query: '?url', import: 'default' })` (the exact pattern used in `libs/web/screens/src/lib/bankApps.ts`), so zero raw hex values ever appear in `.ts`/`.tsx` files and zero `<text>`/`<tspan>` font dependencies exist.

### 6.5 Pure-SVG & Automated Visual-Balance Test (`wallet-icons-balance.test.tsx`)

To guarantee cross-platform icon fidelity without font rendering regressions:
- Every generated `.svg` file in `assets/wallet-icons/` and `assets/currency-icons/` must declare a square `viewBox="0 0 N N"` and use only vector geometric primitives (`<path>`, `<circle>`, `<rect>`, `<polygon>`, `<polyline>`, `<line>`, `<ellipse>`), with zero `<text>`, `<tspan>`, or `font-family` attributes.
- An automated unit test (`libs/web/screens/src/components/__tests__/wallet-icons-balance.test.tsx`) inspects every generated `.svg` file and verifies:
  1. Valid square `viewBox` and zero `<text>`/`<tspan>` elements.
  2. Vector coordinate bounds occupy a meaningful canvas area with safe padding and a bounding-box center aligned within `±20%` of the `viewBox` center on both axes so no icon looks clipped or off-balance.
  3. `<WalletIcon>` and `<CurrencyBadge>` render cleanly across all 7 icon packages (including `bg-avatar-1..6` legacy and `bank:nab`/`bank:vib` fallbacks), all sizes (`xs`, `sm`, `md`, `lg`), and all 55 currencies.

### 6.3 Tabbed Picker UI & Category Search (`WalletIconPickerSheet`)

- **Top Search Input:** `type="search"`, `text-base`, `min-h-11`.
- **When search is empty (Tab Browse Mode):**
  - Displays a horizontal messaging-style package tab strip directly beneath the search bar (`Cơ bản`, `Ngân hàng`, `Ví ĐT`, `Tiết kiệm`, `Đầu tư`, `Đời sống`, `Gia đình`).
  - **No visible scrollbar:** Apply `scrollbar-none` / `[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden` (via utility classes or Tailwind arbitrary variants inside `WalletIconPickerSheet`—no separate CSS file, keeping `globals.css` clean) so horizontal swipe/scroll works cleanly without rendering a scrollbar.
  - Shows **only the active tab's 4-column grid** (`min-h-11` tiles with concise label underneath).
  - When on the `Cơ bản` tab, a compact row of 6 pastel colour dots (`avatar-1..6`) lets the user switch the pastel tile colour of `basic:*` icons before or after picking a glyph.
- **When search is non-empty (Category-Aware Search Mode):**
  - Hides the tab bar and displays a unified 4-column grid of matching icons across all 7 packages.
  - An icon matches if the accent-folded query (`normalizeName`) matches **either** the icon's own name/keywords (e.g. `vcb`, `momo`, `heo`) **or** its parent package/category title & category keywords (e.g. typing `Đầu tư` returns all 10 `inv:*` icons; typing `Ngân hàng` returns the Vietnam Banks package + `basic:bank`).
- Picking any icon selects it and closes `WalletIconPickerSheet`, returning focus to `WalletForm`.

### 6.4 Shared `<WalletIcon>` Component

Create `libs/web/screens/src/components/WalletIcon.tsx` (+ registry `walletIcon.ts`), supporting `size: 'xs' | 'sm' | 'md' | 'lg'` (`28 / 36 / 40 / 48px`):
- Vector icons (`basic:*`, legacy `bg-avatar-1..6`, fallback): rounded-xl pastel tile (`bg-avatar-N text-avatar-N-fg`).
- Bank `.webp` icons (`bank:*`): `rounded-md`/`rounded-lg` `bg-card border border-border overflow-hidden` with `object-cover`.
- Custom `.svg` package icons (`ewallet:*`, `save:*`, `inv:*`, `life:*`, `fam:*`, `biz:*`): `rounded-lg bg-card border border-border p-1.5` with `object-contain`.

Deploy `<WalletIcon>` across all wallet surfaces:
- `WalletForm` (Row 1 trigger next to name) & `FirstWalletSheet` (Row 1 trigger next to name)
- `WalletsScreen` (`WalletRow`, `size="md"`)
- `WalletSummary` (header badge, `size="lg"`)
- `EntryPage` (wallet picker sheet rows `size="sm"` and selected wallet row `size="xs"`)
- `TransactionFilters` / `FilterPickView` (wallet filter items `size="xs"`)

Keep `walletIconClass` exported for backward compatibility if any test or caller imports it.

---

## 7. Start Date Removal & Balance Rules

1. **Database & API:**
   - `personal_wallets.start_date` remains a `NOT NULL` column so `0026_personal_wallets.sql` and `schema-wallets.test.ts` remain untouched.
   - `POST /me/personal/wallets` and `POST /me/personal/wallets/add` set `startDate` automatically to `now.slice(0, 10)` when omitted from the request body (keeping optional `startDate` acceptance on API create/patch only if existing API callers supply it, or defaulting cleanly on create—**my call**: keep optional backend field compatibility for existing API tests that aren't about `beforeStart`, while never sending or editing `startDate` from the web UI).
   - `WalletForm` removes `startDate` state and the `wallet-form-date` `<Input>` completely.
2. **Dropping the `beforeStart` balance cutoff:**
   - Update `isBeforeStart()` in `libs/shared/core/src/wallets.ts` to always return `false`.
   - Because `walletBalance`, `replayWallets`, `findOversell`, `apps/api/src/personal/entries.ts`, `apps/api/src/personal/list.ts`, and `libs/shared/core/src/copyRows.ts` all delegate to `isBeforeStart()`, every transaction in a wallet now counts toward its balance, VND cost replay, and holdings regardless of date, and `beforeStart` pills never appear in the UI.
3. **Existing Tests Impacted by #134's Explicit Changes:**
   - Phase 1 tests and schema tests (`schema-wallets.test.ts`, `schema-personal-money.test.ts`, `personal-wallets.test.ts`) are **not edited** and continue to pass as-is.
   - The following #113 Phase 2 tests directly test behavior that #134 intentionally replaces and must be updated to match the new spec:
     - `libs/shared/core/test/currency.test.ts`: pins `CURRENCY_CODES` to `['VND', 'USD', 'USDT']` and expects `isCurrencyCode('EUR') === false` → update to validate the 55-currency catalog, `isCurrencyCode('XXX') === false`, and 0-decimal parsing for `JPY`/`KRW`/`IDR`.
     - `libs/shared/core/test/wallets.test.ts`: `'entries before the start date are ignored'` → update to assert that entries dated before `startDate` **do** affect `walletBalance` and `isBeforeStart` returns `false`.
     - `libs/shared/core/test/copyRows.test.ts`: `'fills currency, beforeStart and tag names'` expects `beforeStart: true` → update to `beforeStart: false`.
     - `apps/api/test/personal-entries.test.ts` & `apps/api/test/personal-wallets-more.test.ts`: tests asserting `beforeStart: true` leaves balance unchanged → update to verify entries dated before `startDate` are included in balance (`beforeStart: false`).
     - `libs/web/screens/src/screens/__tests__/wallets.test.tsx`, `libs/web/screens/src/components/__tests__/category-icon-and-wallet-form.test.tsx`, and `libs/web/screens/src/screens/__tests__/entry-review-r1.test.tsx`: replace clicks on inline `wallet-form-currency-USD` / `first-wallet-currency-USD` buttons with opening the new currency picker sheet and selecting `USD`.

---

## 8. Data, API, and Cloudflare Free-Plan Cost

### 8.1 Additive Migration (`0030_personal_wallet_options.sql`)

Create a new migration `apps/api/migrations/0030_personal_wallet_options.sql` and add `personalWalletOptions` to `libs/api/db/src/schema.ts`:

```sql
CREATE TABLE personal_wallet_options (
  wallet_id text PRIMARY KEY REFERENCES personal_wallets(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exclude_from_reports integer NOT NULL DEFAULT 0,
  enable_notification integer NOT NULL DEFAULT 0,
  linked_bank_code text,
  updated_at text NOT NULL
);

CREATE INDEX personal_wallet_options_user_id_idx
  ON personal_wallet_options(user_id);
```

- Using a separate 1:1 keyed table leaves `personal_wallets` (9 cols) and `personal_wallet_settings` (8 cols) completely unchanged, so `schema-wallets.test.ts` and `schema-personal-money.test.ts` pass unmodified.
- Absent row defaults: `excludeFromReports: false`, `enableNotification: false`, `linkedBankCode: null`.
- **`enable_notification`** and **`linked_bank_code`** columns are provisioned cleanly in the schema now (unused/unexposed in #134 API inputs until #121 and #118/#119) or added as optional schema columns; **my call**: include `exclude_from_reports` now and leave `enable_notification` / `linked_bank_code` columns ready with defaults so Stage 2 needs no extra wallet-options table migration.

### 8.2 Shared Types & API Changes

- **`libs/shared/core/src/api-types.ts`:**
  - Add `excludeFromReports: boolean` to `WalletDetailView`.
  - Add optional `excludeFromReports?: boolean` to `CreateWalletInput` and `UpdateWalletInput`.
- **`apps/api/src/personal/wallets.ts`:**
  - `loadCalc` adds `.leftJoin(personalWalletOptions, eq(personalWalletOptions.walletId, personalWallets.id))` in its existing single wallet query (`0` extra queries, `0` extra rows read beyond 1:1 join).
  - `POST /me/personal/wallets`, `POST /me/personal/wallets/add`, and `PATCH /me/personal/wallets/:id` validate optional boolean `excludeFromReports` (`422` if non-boolean) and upsert into `personal_wallet_options` inside the existing `db.batch(...)`.
  - **#112 compatibility note:** `POST /me/personal/wallets` and `GET /me/personal/wallets` still work identically for `personal-wallets.test.ts` (`POST` returns `{ wallet }` including `excludeFromReports: false`, and `GET` returns `{ wallets }` matching the exact same `WalletDetailView` object).
- **`apps/api/src/personal/list.ts` (`GET /me/personal/summary`):**
  - Build `excludedWalletIds = new Set(wallets.filter((w) => w.excludeFromReports).map((w) => w.id))`.
  - When accumulating `counted` rows for monthly `spent` and `income` totals, skip any entry where `excludedWalletIds.has(e.walletId)`.
  - Note on `vndTotal` / `WalletsScreen`: `excludeFromReports` only ignores the wallet's transactions in **total spending/income reports** (Overview monthly spent/income and future #115 reports). The wallet's balance still contributes to the user's net cash total (`Tổng tiền`) unless the wallet is `archived`.
  - Wait—what about the transaction list endpoint `GET /me/personal/transactions`? Showing transactions in `/transactions` (and `/wallets/:id`) continues unchanged so the user can inspect and edit them; only the **summary/report** spending & income totals ignore wallets with `excludeFromReports: true` (**my call**; matches *"ignore all transaction from the wallet"* in overview/reports).
- **Cloudflare Free-Plan Query & Row Cost:**
  - `GET /me/personal/wallets`, `GET /me/personal/summary`: `0` additional SQL queries (left join on `personal_wallet_options` by primary key `wallet_id`).
  - `POST /me/personal/wallets/add`, `PATCH /me/personal/wallets/:id`: `+1` statement inside the existing atomic `db.batch(...)` (at most 1 extra row written per wallet write). Well within the 50 queries/req and 100k writes/day limit.

---

## 9. Left to the Builder

Exact component file organization inside `libs/web/screens/src/` and `libs/shared/core/src/`, specific SVG artwork markup for the static `.svg` files in `assets/wallet-icons/`, Vietnamese/English copy strings (`// REVIEW` on new Vietnamese strings per `CLAUDE.md`), exact `testId` naming for the new picker triggers/tabs/rows, and unit/API/screen test suite implementation.
