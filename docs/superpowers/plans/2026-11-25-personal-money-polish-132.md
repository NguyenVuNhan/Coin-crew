# Personal money polish (#132) + asset icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo, implementer tasks run as Orca workers on Antigravity (see the `gemini-execution` skill); the planner reviews each diff and runs the tests.

**Goal:** Ship the open #132 polish items and let each asset carry an icon from the four approved packs, with a letter tile when none is set.

**Architecture:**
- A nullable `icon` column on `personal_assets` flows through the asset API and `AssetView`.
- On the web, a registry (`lib/assetIcon.ts`) and an `<AssetIcon>` component mirror `lib/walletIcon.ts` and `<WalletIcon>`. They read the packs' `manifest.json` files and SVGs with `import.meta.glob`.
- An `AssetIconPickerSheet` copies the wallet picker's tabs and search.
- The remaining items are local edits to existing screens.

**Tech Stack:** Hono + Drizzle on Cloudflare D1 (hand-written SQL migrations); React + Tailwind v4 + shadcn; Vitest + Testing Library; Nx.

**Spec:** `docs/superpowers/specs/2026-11-25-personal-money-polish-132-design.md`

## Global Constraints

- Branch `fix/personal-money-polish-132` off `main`; the PR targets `main`.
- New Vietnamese strings go in `libs/web/i18n/src/vi.ts` with a trailing `// REVIEW`, and every key also goes in `en.ts`.
- No raw hex and no per-component `.css`; `style-guard.test.ts` enforces both. The approved SVGs are exempt because they are image assets.
- Keep the `fsl-*` classes and `data-testid` values on the same elements. Existing test ids that must survive: `asset-row-<id>`, `asset-edit-<id>`, `asset-toggle-hidden-<id>`, `amount-wallet-chip`, `entry-quantity-error`, `tx-row-<id>`.
- Touch targets ≥ 44px (`min-h-11`), fields `text-base`, money `tabular-nums`.
- Imports across libraries use package names (`@cc/core`, `@cc/web-ui/...`); imports inside a library are relative.
- Don't edit or rename the approved files in `libs/web/screens/src/assets/asset-icons/**`.
- Workers may add new tests but must not edit or delete existing ones. The one exception is a test that pins copy this plan changes; the task says so explicitly.
- The icon value format is `<pack>:<slug>` with pack ∈ `crypto | stocks | gold | property`, at most 40 characters.

## Review Focus

1. **An asset whose stored icon is unknown** (for example `crypto:shib` after a pack edit, or junk from an old client) must render the letter tile, never a broken image. The test for this is in Task 2.
2. **Letter tile input:** a name with Vietnamese accents, emoji, or only spaces (`"Vàng SJC"` → `VS`, `"  "` → `?`). The test is in Task 2.
3. **Clearing an icon:** PATCH `{ icon: null }` must clear it, and omitting `icon` must keep it. The test is in Task 1.
4. **Older API responses without `icon`** must not crash the web, because `AssetView.icon` is optional. Covered by the Task 2 test (`resolveAssetIcon(undefined, …)`).
5. **Oversell on edit of an existing sell** must still show the message once. The test is in Task 6.

---

### Task 0 (planner): branch

- [ ] `git switch -c fix/personal-money-polish-132`, then commit the approved icon packs, the spec and this plan:

```bash
git add libs/web/screens/src/assets/asset-icons docs/superpowers
git commit -m "docs: #132 polish brief, plan and approved asset icon packs"
```

---

### Task 1: `icon` on assets (DB, API, types) — worker: hydrogen

**Files:**
- Create: `apps/api/migrations/0035_asset_icon.sql`
- Modify: `libs/api/db/src/schema.ts` (`personalAssets`, about line 686)
- Modify: `libs/shared/core/src/api-types.ts` (`AssetView`, about line 887)
- Modify: `apps/api/src/personal/assets.ts` (`toAssetView`, the POST and PATCH handlers, and every select that builds an `AssetView`)
- Modify: `libs/web/data-access/src/personalMoney.ts` (`CreateAssetInput`, `UpdateAssetInput`)
- Test: `apps/api/test/personal-assets-icon.test.ts` (new)

**Interfaces:**
- Produces: `AssetView.icon?: string | null`, `CreateAssetInput.icon?: string | null`, `UpdateAssetInput.icon?: string | null`. The API always returns `icon` (`null` when unset).

- [ ] **Step 1: Write the failing tests** in `personal-assets-icon.test.ts`, using the setup from `personal-assets.test.ts`:
  - `creates an asset with an icon` → POST `{ name: 'BTC', unit: '', groupName: 'Crypto', decimals: 4, icon: 'crypto:btc' }` returns `asset.icon === 'crypto:btc'`.
  - `defaults icon to null` → POST without `icon` returns `asset.icon === null`.
  - `PATCH keeps icon when omitted and clears it with null` → PATCH `{ name: 'Bitcoin' }` leaves `'crypto:btc'`, then PATCH `{ icon: null }` returns `null`.
  - `rejects an icon longer than 40 chars or empty` → `'x'.repeat(41)` and `'  '` both return 422.
  - The GET list includes `icon` on each asset.
- [ ] **Step 2: Run** `npx nx test @cc/api -- personal-assets-icon`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The migration is exactly `ALTER TABLE personal_assets ADD COLUMN icon text;`.
  - Schema: `icon: text('icon')` after `decimals`.
  - In `assets.ts`, add a local `parseOptionalIcon(v: unknown): string | null` with the same rules as `apps/api/src/personal/wallets.ts:139`. On PATCH, treat `undefined` as "keep the stored icon".
- [ ] **Step 4: Run** `npx nx test @cc/api -- personal-assets` (the new and existing asset tests, plus `migration-guard`). Expected: PASS. Then run `npm run typecheck`.
- [ ] **Step 5: Commit** with message `feat(api): optional icon on personal assets`.

---

### Task 2: asset icon registry + `<AssetIcon>` — worker: hydrogen (parallel with Tasks 1 and 6)

**Files:**
- Create: `libs/web/screens/src/lib/assetIcon.ts`
- Create: `libs/web/screens/src/components/AssetIcon.tsx`
- Test: `libs/web/screens/src/components/__tests__/asset-icon.test.tsx` (new)

**Interfaces:**
- Produces, from `lib/assetIcon.ts`:
  - `type AssetIconPackageId = 'crypto' | 'stocks' | 'gold' | 'property'`
  - `interface AssetIconEntry { id: string /* 'crypto:btc' */; packageId: AssetIconPackageId; labelVi: string; labelEn: string; keywords: readonly string[]; src: string }`
  - `interface AssetIconPackage { id: AssetIconPackageId; tabLabelVi: string; tabLabelEn: string; tabIcon: IconName; items: readonly AssetIconEntry[] }`
  - `const ASSET_ICON_PACKAGES: readonly AssetIconPackage[]`, in the order crypto, stocks, gold, property. The tab labels are Vi `Tiền mã hóa` / `Cổ phiếu` / `Vàng` / `Tài sản khác` and En `Crypto` / `Stocks` / `Gold` / `Other`. The tab icons are `coins` / `candlestick-chart` / `gem` / `house`.
  - `function searchAssetIcons(query: string): AssetIconEntry[]`, which matches labels and keywords through `foldForSearch` from `@cc/core`, across all packs.
  - `function assetLetters(name: string): string`
  - `function assetToneClass(seed: string): string`, which returns one of the six `bg-avatar-N text-avatar-N-fg` pairs.
  - `type ResolvedAssetIcon = { kind: 'svg'; src: string } | { kind: 'letters'; text: string; toneClass: string }`
  - `function resolveAssetIcon(icon: string | null | undefined, asset: { id: string; name: string }): ResolvedAssetIcon`
- Produces, from `components/AssetIcon.tsx`: `AssetIcon({ asset, size = 'md', className }: { asset: { id: string; name: string; icon?: string | null }; size?: 'xs' | 'sm' | 'md' | 'lg'; className?: string })`. Sizes and the outer markup match `WalletIcon`. SVG icons render on `bg-card border border-border p-1` like WalletIcon's SVG branch. The root has `aria-hidden="true"` and `data-testid="asset-icon"`.

- [ ] **Step 1: Write the failing tests:**
  - `ASSET_ICON_PACKAGES` has 4 packs with 17/14/12/14 items. Every `src` is truthy, and every id matches `/^(crypto|stocks|gold|property):[a-z0-9-]+$/`.
  - `resolveAssetIcon('crypto:btc', a)` returns `kind === 'svg'`.
  - `resolveAssetIcon('crypto:shib', a)`, `resolveAssetIcon('junk', a)`, `resolveAssetIcon(null, a)` and `resolveAssetIcon(undefined, a)` all return `kind === 'letters'`.
  - `assetLetters`: `'BTC'→'BTC'`, `'vnm'→'VNM'`, `'Bitcoin'→'BI'`, `'Vàng SJC'→'VS'`, `'nhẫn trơn 9999'→'NT'`, `'  '→'?'`, `'🚀 Moon'→'M'`.
  - `assetToneClass('a1') === assetToneClass('a1')`, and the class is one of the six pairs.
  - `searchAssetIcons('vang')` includes `gold:gold-bar`; `searchAssetIcons('BTC')` includes `crypto:btc`.
  - `<AssetIcon asset={{ id: 'a', name: 'Vàng SJC', icon: null }} />` renders the text `VS`.
- [ ] **Step 2: Run** `npx nx test @cc/web-screens -- asset-icon`. Expected: FAIL.
- [ ] **Step 3: Implement.** Load the files with `import.meta.glob('../assets/asset-icons/*/manifest.json', { eager: true, import: 'default' })` and `import.meta.glob('../assets/asset-icons/**/*.svg', { eager: true, query: '?url', import: 'default' })`. Normalise backslashes in the keys, as `walletSvgUrl` does.
  - `assetLetters` algorithm:
    1. Take the words of the name that contain a letter or digit (`/[\p{L}\p{N}]/u`).
    2. With no such words, return `?`.
    3. With one word of 4 or fewer characters, return it uppercased (Vietnamese locale).
    4. With one longer word, return its first 2 characters uppercased.
    5. Otherwise return the first character of each of the first two words, uppercased.
  - `assetToneClass` is a string hash (sum of char codes) modulo 6.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** with message `feat(web): asset icon registry and AssetIcon with letter tile`.

---

### Task 3: icon picker in the asset form + unit help copy — worker: hydrogen (after 1 and 2)

**Files:**
- Create: `libs/web/screens/src/components/AssetIconPickerSheet.tsx`
- Modify: `libs/web/screens/src/components/AssetForm.tsx`
- Modify: `libs/web/i18n/src/vi.ts`, `en.ts`
- Test: `libs/web/screens/src/components/__tests__/asset-icon-picker.test.tsx` (new)

**Interfaces:**
- Consumes: `ASSET_ICON_PACKAGES`, `searchAssetIcons`, `AssetIcon` (Task 2); `icon` on `CreateAssetInput`/`UpdateAssetInput` (Task 1).
- Produces: `AssetIconPickerSheet({ open, onClose, value, onSelect }: { open: boolean; onClose: () => void; value: string | null; onSelect: (icon: string | null) => void })`.

- [ ] **Step 1: Write the failing tests:**
  - The picker opens on the tab that holds `value` (`gold:gold-ring` opens Vàng).
  - Typing `btc` shows the BTC tile across tabs.
  - Picking a tile calls `onSelect('crypto:btc')`.
  - The first tile is "Chữ cái" (`assets.iconLetters`), shows the asset's letter tile, and calls `onSelect(null)`.
  - In AssetForm, the icon row (`data-testid="asset-icon-row"`) shows `<AssetIcon>`. Choosing an icon and saving sends `icon: 'crypto:btc'` in the create payload. Editing an asset that has an icon and choosing "Chữ cái" sends `icon: null`.
  - The help text equals the new `assets.unitHelp`.
- [ ] **Step 2: Run** `npx nx test @cc/web-screens -- asset-icon-picker`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Copy `WalletIconPickerSheet`'s structure (Sheet, search `Input`, `Tabs`), minus tones and the basic pack. Grid tiles are `min-h-11` with a `line-clamp-2 text-xs` label; don't copy its `text-[11px]`. The selected tile has `aria-pressed="true"` and a `ring-2 ring-primary`.
  - In AssetForm, put an icon row above the name field: `<AssetIcon size="lg">`, label `assets.icon`, and an `edit` icon button that opens the sheet (icon button, per the owner's rule).
  - New keys (Vi / En):
    - `assets.icon`: `Biểu tượng` / `Icon`
    - `assets.iconPick`: `Chọn biểu tượng` / `Choose icon`
    - `assets.iconLetters`: `Chữ cái` / `Letters`
    - `assets.iconSearch`: `Tìm biểu tượng` / `Search icons`
  - Change `assets.unitHelp` to Vi `Số (vd 0,0001) là bước lẻ nhỏ nhất; chữ (vd chỉ) là tên đơn vị, lẻ đến 2 số thập phân` and En `A number (e.g. 0,0001) sets the smallest step; a word (e.g. oz) names the unit and allows 2 decimals`. Change `assets.unitStepError` to `Nhập bước nhỏ nhất như 1, 0,1, 0,01…` and its En twin. Tests that pin the old strings may be updated.
- [ ] **Step 4: Run** `npx nx test @cc/web-screens -- asset`. Expected: PASS.
- [ ] **Step 5: Commit** with message `feat(web): pick an asset icon from four packs`.

---

### Task 4: asset rows, trade rows, unit subtitle — worker: hydrogen (after 2)

**Files:**
- Modify: `libs/shared/core/src/assets.ts`: `assetUnitText` (comma form); add `assetStepText`
- Modify: `libs/web/ui/src/components/icons.tsx`: add `arrow-down-left` and `arrow-up-right` (lucide `ArrowDownLeft`, `ArrowUpRight`)
- Modify: `libs/web/screens/src/screens/AssetsScreen.tsx` (`renderRow`, about lines 165–245, and the target row at about 440)
- Modify: `libs/web/screens/src/components/AssetPicker.tsx` (rows at about 140)
- Modify: `libs/web/screens/src/components/TransactionRow.tsx` (trade leading icon)
- Modify: `libs/web/i18n/src/vi.ts`, `en.ts`
- Test: `libs/shared/core/test/asset-unit.test.ts` (add cases), `libs/web/screens/src/components/__tests__/asset-rows-polish.test.tsx` (new)

**Interfaces:**
- Consumes: `AssetIcon` (Task 2).
- Produces:
  - `assetUnitText(asset)` returns `'0,0001'` (not `'0.0001'`) for lot assets. The AssetForm round-trip still works because `parseAssetUnit` accepts a comma.
  - `assetStepText(asset: { unit: string; decimals: number }): { kind: 'lot'; step: string } | { kind: 'word'; unit: string }`. A lot asset with decimals 0 gives step `'1'`.

- [ ] **Step 1: Write the failing tests:**
  - Core: `assetUnitText({unit:'',decimals:4}) === '0,0001'`, and `assetStepText({unit:'chỉ',decimals:2})` deep-equals `{kind:'word',unit:'chỉ'}`. The existing test expecting `'0.0001'` may be updated; it pins the old copy.
  - Assets screen:
    - Each row shows `data-testid="asset-icon"`.
    - The subtitle reads `lẻ đến 0,0001` for a lot asset and `chỉ` for a word unit.
    - Within a row there is exactly one control for hide/show: a `Switch` with `data-testid="asset-toggle-hidden-<id>"`. Toggling it calls the hide mutation.
    - Row tap edits, with the open button's `data-testid="asset-edit-<id>"` (pass `openTestId`).
    - `actions` contains only `delete`. No `edit` or `toggle-hidden` actions. Any other existing entry points, such as the move/target sheet at about line 440, stay as they are.
  - AssetPicker rows show `asset-icon` and the same subtitle.
  - TransactionRow for a `buy`:
    - the leading icon is the asset's `asset-icon`, with a badge `data-testid="trade-direction-buy"`
    - a `sell` row has `trade-direction-sell`
    - the amount has no `text-danger` or `text-success` class
- [ ] **Step 2: Run** `npx nx test @cc/web-screens -- asset-rows-polish` and `npx nx test @cc/core -- asset-unit`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The assets row mirrors the CategoriesScreen row (about lines 776–836): leading `<AssetIcon asset size="sm">` (`size-9`), trailing `{hidden pill}` + `Switch checked={!asset.hidden}`.
  - Subtitle key `assets.stepLot`: Vi `lẻ đến {step}`, En `step {step}`.
  - The trade badge is a `size-4 rounded-full bg-card ring-2 ring-card` holding the `arrow-down-left` (buy) or `arrow-up-right` (sell) icon at size 12, positioned bottom-right of the leading `relative` wrapper.
- [ ] **Step 4: Run** the commands from Step 2, then `npx nx test @cc/web-screens -- categories asset transaction-row`. Expected: PASS.
- [ ] **Step 5: Commit** with message `feat(web): asset icons on rows, one place per asset action, trade direction badge`.

---

### Task 5: list/detail/filter polish — worker: hydrogen (after 4)

**Files:**
- Modify: `libs/web/screens/src/components/transactions/rowHelpers.ts`: add `formatFullCalendarDate`
- Modify: `libs/web/screens/src/screens/TransactionDetail.tsx` (date line about 473)
- Modify: `libs/web/screens/src/components/TransactionRow.tsx`: add prop `titleMode?: 'category' | 'detail'` (default `'category'`)
- Modify: `libs/web/screens/src/components/transactions/TransactionGroupList.tsx` (about line 101): pass `titleMode={viewMode === 'category' ? 'detail' : 'category'}`
- Modify: `libs/web/screens/src/components/transactions/FilterPickView.tsx` and `libs/web/screens/src/components/TransactionFilters.tsx` (category pick, about line 172)
- Test: `libs/web/screens/src/components/__tests__/tx-polish-132.test.tsx` (new)

**Interfaces:**
- Produces:
  - `formatFullCalendarDate(dateStr: string): string`: `'2026-10-09' → '09/10/2026'`; it returns the input unchanged when it isn't ISO.
  - `FilterPickView` gains an optional `sectionOf?: (item) => { key: string; label: string }`. When given, items are grouped under section headers in first-seen order. Headers are `text-xs font-semibold text-muted-foreground px-4 pt-3`, not headings.

- [ ] **Step 1: Write the failing tests:**
  - TransactionDetail for an entry with date `2026-10-09` and time `14:05` shows `09/10/2026 · 14:05`.
  - With `titleMode="detail"`:
    - an expense with note `Phở` has the title `Phở`, and the note isn't repeated in the meta line
    - with no note, the title is the wallet name
    - with neither, the title is `Chi`
  - With the default `titleMode`, the title is still the category name.
  - The filter category pick shows section labels `Chi` and `Thu`. Each expense category sits under Chi, and the "Tất cả danh mục" row stays above both sections.
- [ ] **Step 2: Run** `npx nx test @cc/web-screens -- tx-polish-132`. Expected: FAIL.
- [ ] **Step 3: Implement.** In TransactionFilters, `sectionOf={(c) => c.type === 'expense' ? {key:'expense',label:t('personalEntry.expense')} : {key:'income',label:t('personalEntry.income')}}`. `titleMode` affects only expense/income rows; trades and transfers keep their titles.
- [ ] **Step 4: Run** `npx nx test @cc/web-screens -- tx-polish-132 transactions filter`. Expected: PASS.
- [ ] **Step 5: Commit** with message `fix(web): dd/mm/yyyy on detail, no repeated category titles, Chi/Thu filter sections`.

---

### Task 6: entry page trade fixes — worker: neon (EntryPage is about 3,000 lines; parallel with 1 and 2)

**Files:**
- Modify: `libs/web/screens/src/screens/EntryPage.tsx`:
  - `displayTone` (about line 1743)
  - wallet chip (about line 2078)
  - oversell error (about lines 2530–2540 and 2688)
  - the asset-picked focus path (about lines 415–425)
- Modify: `libs/web/i18n/src/vi.ts`, `en.ts`
- Test: `libs/web/screens/src/screens/__tests__/entry-trade-polish.test.tsx` (new)

**Interfaces:**
- Consumes: nothing new.
- Produces: `personalEntry.oversellError` becomes a template, Vi `Chỉ còn {qty} {unit}` and En `Only {qty} {unit} left`. New key `personalEntry.fixQuantity`: Vi `Sửa số lượng để lưu`, En `Fix the quantity to save`.

- [ ] **Step 1: Write the failing tests:**
  - In trade mode (buy tile), the main amount `Amount` doesn't render with the danger tone; assert no `text-danger` inside the amount display.
  - `amount-wallet-chip` has `bg-muted` and not `bg-warning-soft`.
  - Selling 0,05 of an asset holding 0,03 BTC (lot asset, decimals 4, name BTC):
    - `entry-quantity-error` reads `Chỉ còn 0,03 BTC`
    - exactly one `role="alert"` contains `Chỉ còn`
    - the save button's disabled reason reads `Sửa số lượng để lưu`
    - `announce` is not called with `Chỉ còn` a second time
  - The same holds when editing an existing sell (Review Focus 5).
  - After picking an asset in the AssetPicker, the docked keypad isn't rendered and the quantity input has focus.
- [ ] **Step 2: Run** `npx nx test @cc/web-screens -- entry-trade-polish`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `displayTone` returns `'neutral'` when `isTradeMode`.
  - The chip class swaps `bg-warning-soft` for `bg-muted`.
  - The oversell text uses `formatQuantity(heldQuantity, selectedAsset.decimals)` and `selectedAsset.unit || selectedAsset.name`.
  - On asset pick, call `setKeypadOpen(false)` and focus and `scrollIntoView({ block: 'nearest' })` the quantity input in place of the asset row. Add a ref if none exists.
  - Tests that pin the old `Vượt quá số đang có` may be updated.
- [ ] **Step 4: Run** `npx nx test @cc/web-screens -- entry` (all entry tests). Expected: PASS.
- [ ] **Step 5: Commit** with message `fix(web): neutral trade amount, muted wallet chip, single oversell message, keypad yields after asset pick`.

---

### Task 7 (planner): verify and hand off

- [ ] Run `npm run typecheck`, `npm run lint`, and `npm test`. All must pass.
- [ ] Run the impeccable detector on the touched screens. Confirm there's no off-scale text and no skipped heading level on `/transactions`.
- [ ] Apply the migration with `--local` for the tunnel, rebuild, and launch the tunnel. Browser-check at 375px and 1280px:
  - the asset list
  - the icon picker
  - a buy and a sell on the entry page
  - transactions by category
  - the filter sheet
  - the trade detail
- [ ] Wait for the owner's manual test, then push and open a PR into `main` with `Closes #132`. File the three ideas as separate issues.
