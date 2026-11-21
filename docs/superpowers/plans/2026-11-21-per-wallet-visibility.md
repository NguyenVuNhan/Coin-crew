# Per-wallet Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each wallet offers only the categories and assets that belong in it on the entry page. Defaults follow the wallet kind, the owner's changes are stored as overrides, and the starter categories are reshaped (Phí & lệ phí, Đầu tư without subs, Thưởng / Staking).

**Architecture:**
- `@cc/core` holds the pure rules: kind defaults, effective visibility and asset inheritance.
- The API stores only overrides, in two tables, and returns them inside the existing categories and assets responses. Three PUT routes write them.
- The web filters `CategoryPicker` and `AssetPicker` by the selected wallet. There are two new sheets: "Hiện trong ví này", opened from the wallet screen's menu, and "Hiện ở ví", a row in the category and asset edit sheets.

**Tech Stack:** TypeScript, Hono on Cloudflare Workers + D1 (Drizzle), React + React Query, shadcn/Tailwind v4 (`@cc/web-ui`), Vitest (`@cloudflare/vitest-pool-workers` for the API).

**Spec:** `docs/superpowers/specs/2026-11-21-per-wallet-visibility-design.md`. Read it before any task.

## Global Constraints

- Every new route sits behind `requirePersonal` and is scoped to the session user. Another user's wallet, category or asset id gives **404**.
- Every visibility write goes through `commitPersonalWrite` (`libs/api/db/src/personalSync.ts`), so the personal sync version bumps. The new tables do **not** join the transaction sync payload.
- Visibility only limits what the entry page **offers**. Lists, search, filters, detail, wallet history and holdings are untouched.
- Migrations are hand-written SQL in `apps/api/migrations/`, statements separated by `--> statement-breakpoint`. Apply `--local` for the tunnel. Commit a migration only when the owner says.
- New Vietnamese copy goes in `libs/web/i18n/src/vi.ts` with `// REVIEW`, with English in `en.ts`. Exact strings: "Hiện trong ví này", "Danh mục", "Chi", "Thu", "Tài sản", "Hiện ở ví", "Tất cả ví", "Chỉ {wallet}", "{n} ví", "Không ví nào", "Phí & lệ phí", "Thưởng / Staking".
- UI rules from `CLAUDE.md` and `DESIGN.md`:
  - use the `Sheet` wrapper, never shadcn `Drawer`/`Dialog`
  - white `rounded-xl` grouped lists with no nested cards
  - `min-h-11` touch targets, theme colours only (no raw hex)
  - each switch's accessible name is the item name
  - focus returns to the opener when a sheet closes
- Before using a shadcn `switch`, check `libs/web/ui/src/components/ui/`. If it's missing, add it with `npx shadcn@latest add switch` run in `libs/web/ui`, then make its imports relative.
- Tests select by `data-testid`. Implementers add new tests only. The one existing test that changes (Task 7) is changed by the planner.
- Starter category ids are `${userId}:${key}`. User-created ids come from `newId()`.

## Review Focus

1. **Switching wallet mid-entry with a category that's hidden in the new wallet.** The pick stays selected and still shows as a tile. Test in Task 7.
2. **Editing an old entry whose category or asset is now hidden in its wallet.** It shows as selected and saves. Test in Task 7.
3. **A parent switched off, then one sub switched back on.** The sub is offered and the parent isn't. Tests in Task 1 (core) and Task 7 (picker).
4. **Changing a wallet's kind (everyday → investment).** The defaults flip and the explicit overrides stay. Test in Task 3.
5. **An item PUT naming an archived wallet, or a wallet the user doesn't own.** Archived: rows untouched. Not owned: 404. Tests in Task 4.

---

### Task 1: Core visibility rules

**Files:**
- Create: `libs/shared/core/src/visibility.ts`
- Modify: `libs/shared/core/src/api-types.ts` (`CategoryView`, `AssetView`), `libs/shared/core/src/index.ts` (export)
- Test: `libs/shared/core/test/visibility.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface WalletOverride { walletId: string; visible: boolean }
  export interface VisibilityWallet { id: string; kind: WalletKind }
  // CategoryView gains: starterKey: string | null; walletOverrides: WalletOverride[]
  // AssetView gains:    walletOverrides: WalletOverride[]
  export const INVESTMENT_VISIBLE_ROOT_KEYS: readonly string[]; // ['fees']
  export function categoryRoot(cat: CategoryView, all: CategoryView[]): CategoryView;
  export function categoryDefaultVisible(cat: CategoryView, all: CategoryView[], kind: WalletKind): boolean;
  export function isCategoryVisibleIn(cat: CategoryView, all: CategoryView[], wallet: VisibilityWallet): boolean;
  export function isAssetVisibleIn(asset: AssetView, walletId: string): boolean;
  export function inheritedAssetOverrides(groupName: string, assets: AssetView[], wallets: VisibilityWallet[]): WalletOverride[];
  ```

- [ ] **Step 1: Write failing tests** in `visibility.test.ts`. Build fixtures with a `cat(id, opts)` helper:
  - **Everyday wallet:** `categoryDefaultVisible` is true for `food`, `invest` and a user category `u1`.
  - **Investment wallet:**
    - `fees`, `tax` and `fee` (both with parent `fees`) are true
    - `food`, `invest`, `invest-stock` (parent `invest`) and a user expense root `u1` are false, as is its child `u1c`
    - income `salary` and `other-income-reward` (parent `other-income`) are true
  - **Overrides:**
    - `isCategoryVisibleIn` returns the override's `visible` when one exists for the wallet id, else the default
    - parent `food` with override `{w-inv: true}` and child `food-cafe` with no override: the child is still false on `w-inv`, because there's no parent cascade at read time
    - parent `fees` override `false` and child `tax` override `true` on `w-inv`: `tax` is true and `fees` is false
  - **Assets:** `isAssetVisibleIn` is true with no override and false with `{walletId:'w1', visible:false}`.
  - **`inheritedAssetOverrides('Crypto', assets, wallets)`:**
    - two Crypto assets, both hidden on `w1`, one hidden on `w2`: returns `[{walletId:'w1', visible:false}]`
    - an empty group returns `[]`
    - assets of other groups are ignored
- [ ] **Step 2: Run** `npx nx test core -- visibility`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `visibility.ts`.
  - `categoryRoot` walks `parentId` until it reaches null, and stops if it meets an id it has already seen.
  - The default on an investment wallet is: income gives true; expense gives true only when `categoryRoot(...).starterKey` is in `INVESTMENT_VISIBLE_ROOT_KEYS`.
  - Add the two fields to the view types and export everything from `index.ts`.
- [ ] **Step 4: Run** `npx nx test core -- visibility` and `npm run typecheck`. Expected: PASS. Typecheck will fail in the API and web until Tasks 2–3 fill the new fields. Fix the fixtures that build `CategoryView`/`AssetView` objects in non-test code only. Fixtures in existing tests are left for the planner to add `starterKey: null, walletOverrides: []` at review.
- [ ] **Step 5: Commit** `feat(core): per-wallet visibility rules (#130)`

### Task 2: Migration, schema and starter reshape

**Files:**
- Create: `apps/api/migrations/0030_personal_visibility.sql`
- Modify: `libs/api/db/src/schema.ts`, `apps/api/src/personal/starterCategories.ts`
- Test: `apps/api/test/personal-visibility-migration.test.ts`

**Interfaces:**
- Produces: Drizzle tables `personalCategoryVisibility` and `personalAssetVisibility`, each with columns `userId`, `walletId`, `itemId` (named `categoryId` / `assetId`) and `visible` (integer 0|1).
  - SQL names: `personal_category_visibility(user_id, wallet_id, category_id, visible)` and `personal_asset_visibility(user_id, wallet_id, asset_id, visible)`
  - PK is (`wallet_id`, item id). Index on `user_id`.
  - FKs `ON DELETE CASCADE` to `users`, `personal_wallets`, and `personal_categories` or `personal_assets`
- **Starters:**
  - add `{ key: 'fees', parentKey: null, type: 'expense', name: 'Phí & lệ phí', icon: 'receipt-text', sortOrder: 6 }`
  - `tax` and `fee` get `parentKey: 'fees'` with `sortOrder` 0 and 1
  - remove the four `invest-*` entries
  - add `{ key: 'other-income-reward', parentKey: 'other-income', type: 'income', name: 'Thưởng / Staking', icon: 'gift', sortOrder: 0 }`
  - keep parents before children

- [ ] **Step 1: Write failing tests.**
  - **Seeding (new user):** a brand-new user's `GET /api/me/personal/categories` has `:fees` as a root, `:tax` and `:fee` with `parentId` `${uid}:fees`, no `:invest-*` ids, and `:other-income-reward` under `:other-income`. Use the helpers in `personal-helpers.ts` (`switchOn`).
  - **Migration data steps:**
    - Insert old-shape rows for a user directly with `env.DB`: top-level `tax`/`fee`, `invest` with `invest-stock`, and `other-income`.
    - Re-run the data statements of `0030` from `env.TEST_MIGRATIONS`. Find the migration by name and run only the queries that start with `INSERT` or `UPDATE`.
    - Assert: `:fees` exists, `tax`/`fee` are re-parented, `invest-stock` is untouched, and `:other-income-reward` exists.
    - Run the data statements again and assert that nothing changes (idempotent).
    - A user whose `tax` already has a parent keeps that parent.
- [ ] **Step 2: Run** `npx nx test api -- personal-visibility-migration`. Expected: FAIL.
- [ ] **Step 3: Write `0030`.** Every statement is guarded so it's idempotent:
  1. create the tables and indexes
  2. `INSERT OR IGNORE` the `fees` row per user who has `:tax` or `:fee`, at the old `tax` sort order (or `fee` when there's no `tax`)
  3. `UPDATE` re-parenting `:tax`/`:fee` `WHERE parent_id IS NULL` and the user's `:fees` row exists
  4. `INSERT OR IGNORE` `:other-income-reward` for users who have `:other-income`
  5. `UPDATE personal_sync_state SET version = version + 1` for the affected users
  
  Use `strftime('%Y-%m-%dT%H:%M:%fZ','now')` for the timestamps. Add the Drizzle tables to `schema.ts` and change the starters.
- [ ] **Step 4: Run** the test, then `npx nx test api -- personal-categories migration-guard`. Expected: PASS. Starter-count assertions in existing tests may fail; report them to the planner and don't edit them.
- [ ] **Step 5: Commit** the schema and starters. Commit the migration file only after the owner says so; leave it staged and say so in the report.

### Task 3: Overrides in the list responses, and inheritance on create

**Files:**
- Modify: `apps/api/src/personal/categories.ts` (GET, POST, `toCategoryView`), `apps/api/src/personal/assets.ts` (GET, POST, `toAssetView`)
- Test: `apps/api/test/personal-visibility-read.test.ts`

**Interfaces:**
- Consumes: Task 1 types and `inheritedAssetOverrides`; Task 2 tables.
- Produces:
  - `GET /me/personal/categories`: each `CategoryView` has `starterKey` (the part after `${userId}:` for ids with that prefix, else `null`) and `walletOverrides`
  - `GET /me/personal/assets`: each `AssetView` has `walletOverrides`
  - both cost one extra select each, filtered by `user_id`

- [ ] **Step 1: Write failing tests.**
  - **Read:** after inserting override rows directly, GET returns them per item, and the starter `food` has `starterKey: 'food'` while a created category has `null`.
  - **Category create:** creating a sub under a parent that has overrides `{w1:false}` copies `{w1:false}` to the sub. A new top-level category has `[]`.
  - **Asset create:** creating a Crypto asset when every existing Crypto asset is hidden on `w1` gives `{w1:false}`.
  - **Kind change (Review Focus 4):** an everyday wallet with an override `food: true` is PATCHed to `kind: 'investment'`. The overrides are unchanged, and `isCategoryVisibleIn` on the fetched data gives `food` true and `invest` false.
  - **Another user's data:** user B's GET never includes user A's rows.
- [ ] **Step 2: Run** `npx nx test api -- personal-visibility-read`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Load the overrides with one query per GET and group them by item id.
  - On POST, insert the inherited rows in the same `commitPersonalWrite` batch as the item.
- [ ] **Step 4: Run** the test and `npx nx test api -- personal-categories personal-assets`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): wallet overrides in category/asset responses (#130)`

### Task 4: Visibility write routes

**Files:**
- Create: `apps/api/src/personal/visibility.ts`
- Modify: `apps/api/src/personal/routes.ts` (add `app.route('/', visibilityRoutes())`)
- Test: `apps/api/test/personal-visibility-routes.test.ts`

**Interfaces:**
- Produces: `visibilityRoutes(): Hono<AppBindings>` with three routes.
  - **`PUT /me/personal/wallets/:id/visibility`**
    - body `{ categories?: {id: string; visible: boolean}[]; assets?: {id: string; visible: boolean}[] }`
    - upserts one row per entry
    - returns `200 { ok: true }`
  - **`PUT /me/personal/categories/:id/wallets`**
    - body `{ walletIds: string[] }`
    - for every **non-archived** wallet of the user, writes `visible = walletIds.includes(wallet.id)` for the category **and its direct children**
    - returns `200 { ok: true }`
  - **`PUT /me/personal/assets/:id/wallets`**: same, for one asset.
  - **Errors:**
    - 400 for a malformed body
    - 404 when the path id or any referenced wallet, category or asset id isn't the user's
    - an archived wallet in `walletIds` gives 404, because the sheet never offers one

- [ ] **Step 1: Write failing tests.**
  - **Wallet route:** sets `food: false` and `invest: true`, then GET categories shows both overrides.
  - **Category route:** `PUT categories/:fees/wallets {walletIds:[w1]}` with wallets w1 and w2 gives `fees`, `tax` and `fee` `{w1:true, w2:false}`.
  - **Archived wallet (Review Focus 5):** an archived wallet w3 gets no rows; naming w3 in `walletIds` gives 404.
  - **Another user's ids (Review Focus 5):** user B's wallet id or category id gives 404 on each route.
  - **Guard:** no session gives 401, and a user without personal money turned on is refused as `requirePersonal` does elsewhere. Copy the expectation from `personal-guard-sweep.test.ts`.
  - **Sync version:** the personal sync version goes up after each PUT.
- [ ] **Step 2: Run** `npx nx test api -- personal-visibility-routes`. Expected: FAIL.
- [ ] **Step 3: Implement** with `onConflictDoUpdate` on the PK, inside `commitPersonalWrite`. Validate ownership with one select per id kind using `inArray`.
- [ ] **Step 4: Run** the test, and also add the three routes to the guard sweep, if `personal-guard-sweep.test.ts` lists routes in a table, by telling the planner. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): per-wallet visibility routes (#130)`

### Task 5: Data-access hooks

**Files:**
- Modify: `libs/web/data-access/src/personalMoney.ts`
- Test: `libs/web/data-access/src/__tests__/personal-visibility-hooks.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface VisibilityChange { id: string; visible: boolean }
  export function useSetWalletVisibility(): UseMutationResult<{ok: true}, ApiClientError, { walletId: string; categories?: VisibilityChange[]; assets?: VisibilityChange[] }>;
  export function useSetCategoryWallets(): UseMutationResult<{ok: true}, ApiClientError, { id: string; walletIds: string[] }>;
  export function useSetAssetWallets(): UseMutationResult<{ok: true}, ApiClientError, { id: string; walletIds: string[] }>;
  ```
  Each one invalidates `PERSONAL_CATEGORIES_KEY` and `PERSONAL_ASSETS_KEY` on success.

- [ ] **Step 1: Write a failing test** per hook, following the existing `__tests__` style for mutations: the right URL, `PUT`, the body, and invalidation of both keys.
- [ ] **Step 2: Run** `npx nx test web-data-access -- personal-visibility-hooks`. Expected: FAIL.
- [ ] **Step 3: Implement** with `apiSend`.
- [ ] **Step 4: Run** it again. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web-data-access): visibility hooks (#130)`

### Task 6: The "Hiện trong ví này" sheet and the "Hiện ở ví" row

**Files:**
- Create:
  - `libs/web/screens/src/components/visibility/WalletVisibilitySheet.tsx`
  - `libs/web/screens/src/components/visibility/ItemWalletsRow.tsx`
- Modify:
  - `libs/web/screens/src/screens/WalletScreen.tsx`: a menu item in the existing `wallet-menu-btn` menu opens the sheet
  - `libs/web/screens/src/screens/CategoriesScreen.tsx` (`CategoryFormSheet`, edit mode only)
  - `libs/web/screens/src/components/AssetForm.tsx` (edit mode only)
  - `libs/web/i18n/src/vi.ts`, `en.ts`
- Test: `libs/web/screens/src/components/visibility/__tests__/visibility-sheets.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`isCategoryVisibleIn`, `isAssetVisibleIn`); Task 5 hooks; `useCategories`, `useAssets`, `useWalletDetails`.
- Produces:
  ```ts
  export function WalletVisibilitySheet(props: { open: boolean; onClose(): void; wallet: WalletDetailView }): JSX.Element;
  export function ItemWalletsRow(props: { kind: 'category' | 'asset'; item: CategoryView | AssetView }): JSX.Element;
  ```
- **Test ids:**
  - `wallet-menu-visibility` (menu item), `wallet-visibility-sheet`
  - `vis-cat-${id}` (switch), `vis-cat-expand-${id}`, `vis-asset-group-${groupName}` (switch), `vis-asset-expand-${groupName}`, `vis-asset-${id}`
  - `item-wallets-row`, `item-wallet-option-${walletId}`
- **Behaviour (spec, "Hiện trong ví này" and "Hiện ở ví"):**
  - **Wallet sheet layout:**
    - "Danh mục" is split into Chi and Thu, listing roots with a switch and an expand control for subs
    - a parent's switch writes the parent and all its subs in one `useSetWalletVisibility` call
    - a parent with mixed subs shows "k/n" next to its switch
  - **Assets:** "Tài sản" is grouped by `groupName`. A group switch writes every asset in the group.
  - **Hidden and archived items:** globally hidden items (`hidden: true`) are left out. Changes apply as they're made; on failure, roll back and show `Snackbar`. `ItemWalletsRow` lists non-archived wallets only.
  - **`ItemWalletsRow` summary:**
    - every wallet visible: "Tất cả ví"
    - one visible: "Chỉ {wallet}"
    - none: "Không ví nào"
    - otherwise the names joined with ", " when there are two, else "{n} ví"
  - **`ItemWalletsRow` writes:** tapping the row opens a checklist sheet; saving calls `useSetCategoryWallets` / `useSetAssetWallets`.

- [ ] **Step 1: Write failing tests** (mock the hooks the way existing screen tests do):
  - the wallet menu opens the sheet
  - on an investment wallet with no overrides, `vis-cat-food` is off and `vis-cat-fees` is on
  - toggling `vis-cat-fees` off calls the mutation with `fees`, `tax` and `fee` all `visible:false`
  - `vis-cat-fees` shows "1/2" after one sub has an override back on
  - the Crypto group switch writes every Crypto asset
  - the `ItemWalletsRow` summary reads "Chỉ Binance" for one visible wallet, and saving calls `useSetCategoryWallets` with the ticked ids
  - each switch's accessible name is the item name
- [ ] **Step 2: Run** `npx nx test web-screens -- visibility-sheets`. Expected: FAIL.
- [ ] **Step 3: Implement**, following DESIGN.md and the Global Constraints.
- [ ] **Step 4: Run** it again, plus `npm run lint` (through Nx) and the style guard `npx nx test web-screens -- style-guard`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): wallet visibility sheet and item wallets row (#130)`

### Task 7: Entry page filters by the selected wallet

**Files:**
- Modify:
  - `libs/web/screens/src/components/CategoryPicker.tsx`: replace the `walletKind?: WalletKind` prop with `wallet?: VisibilityWallet`; delete `investingIds` and `blocked`
  - `libs/web/screens/src/components/AssetPicker.tsx`: add a `walletId?: string` prop
  - `libs/web/screens/src/screens/EntryPage.tsx`: pass `wallet={selectedWallet && {id, kind}}` and `walletId`
- Test:
  - `libs/web/screens/src/screens/__tests__/entry-wallet-visibility.test.tsx` (new)
  - `entry-critique-step5.test.tsx` (planner edits)

**Interfaces:**
- Consumes: Task 1 `isCategoryVisibleIn`, `isAssetVisibleIn`.
- **Behaviour:**
  - **`CategoryPicker`:** `visible` becomes `!c.hidden && (!wallet || isCategoryVisibleIn(c, categories, wallet))`. The existing `value` fallback keeps a picked or edited category as a tile (Review Focus 1–2).
  - **`AssetPicker`:** filter `nonHidden` the same way, but always keep the asset whose id is `value`.

- [ ] **Step 1: Write failing tests** in the new file, reusing the `setup` / `renderEntryPage` / `finishAmount` / `openDetails` helpers from `entry-critique-step5.test.tsx`. Use fixtures with `starterKey` set.
  - **Investment wallet:** `category-tile-cat-food` and `category-tile-cat-invest` are absent, and `category-tile-cat-tax` is present. In "Thêm", food is absent too.
  - **Everyday wallet:** `cat-invest` and `cat-food` are offered.
  - **Override sub (Review Focus 3):** on an investment wallet, an override `food-cafe: true` (sub of food) offers `cat-food-cafe` and not `cat-food`.
  - **Wallet switch (Review Focus 1):** pick `cat-food` on the everyday wallet, switch to the investment wallet, and `cat-food` is still the selected tile.
  - **Old entry (Review Focus 2):** an existing entry on the investment wallet with category food opens in edit mode with food selected, and saves.
  - **Asset picker:** on a wallet with an override hiding ETF assets, the picker lists only the Crypto ones.
- [ ] **Step 2: Run** `npx nx test web-screens -- entry-wallet-visibility`. Expected: FAIL.
- [ ] **Step 3: Implement** the prop changes.
- [ ] **Step 4 (planner):** rewrite `entry-critique-step5.test.tsx` "recent tiles skip investing categories on an everyday wallet…" so it pins the new rule: everyday offers `cat-invest`; investment hides `cat-stock` and `cat-food`. Add `starterKey`/`walletOverrides` to that file's fixtures.
- [ ] **Step 5: Run** `npm test`, `npm run typecheck` and `npm run lint`. Expected: all PASS.
- [ ] **Step 6: Commit** `feat(web): entry page offers only what the wallet shows (#130)`

### Task 8 (planner): Whole-branch check

- [ ] `npm run build`, apply `0030` with `--local`, then walk through on the tunnel: Binance shows only Phí & lệ phí with no ETF/Vàng after the Crypto-only toggle; a bank wallet shows Đầu tư; history shows everything everywhere.
- [ ] Report to the owner and wait for approval before committing the migration, pushing, or opening a PR into `main`.
