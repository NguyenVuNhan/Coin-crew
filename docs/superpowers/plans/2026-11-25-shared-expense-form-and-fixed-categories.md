# Shared expense form and fixed danh mục Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo, implementer tasks run as Orca workers per the `gemini-execution` skill. The planner reviews, runs tests and commits.

**Goal:** One fixed, undeletable danh mục list shared by every user and group, group expenses that carry a danh mục and a separate Nội dung, and one shared expense form layout used by group "Thêm/Sửa khoản chi", "Khoản chi nhanh" and the Vay/Nợ tab.

**Architecture:** The fixed list is data in `@cc/core`. Each user gets real `personal_categories` rows for it (id `${userId}:${key}`, new `system_key` column), so every existing FK keeps working. Group `transactions` get `category_key` + `note`. The server resolves a row's `category_key` to the viewer's own category id (`groupCategoryId`) so the client resolver stays one chain. The form is a set of shared components in `libs/web/screens/src/components/sharedExpense/` that `ExpenseForm` and `EntryPage` compose.

**Tech Stack:** Hono + drizzle on Cloudflare D1 (hand-written SQL migrations), React 19 + React Query, shadcn/Tailwind v4 via `@cc/web-ui`, vitest, Nx.

**Spec:** `docs/superpowers/specs/2026-11-25-shared-expense-form-and-fixed-categories-design.md`

## Global Constraints

- Follow `DESIGN.md`, `PRODUCT.md` and the CLAUDE.md UI rules: app wrappers first (`Sheet`, `Button`, `Icon`…), theme tokens only (no raw hex, no per-component `.css`), touch targets `min-h-11`, fields `text-base`, money `tabular-nums`.
- Icons: lucide only, through `libs/web/ui/src/components/icons.tsx`. No generated SVGs.
- Nx import rules: web ↔ api never import each other. Cross-library imports use the package name, and imports inside a library are relative. Lint only via `npm run lint`.
- Migrations: hand-written SQL, `apps/api/migrations/0034_fixed_categories.sql` (next after `0033_…`), applied `--local` for the tunnel.
- Copy: every new string goes in both `libs/web/i18n/src/vi.ts` and `en.ts`, marked `// REVIEW`.
- Keep existing `fsl-*` classes and `data-testid`s on the same elements wherever the element survives. Any test changed because an element changed shape is listed in that task's commit message. Workers never edit or delete existing tests. The planner does those updates during review.
- Title (`description`) stays 1–80 characters. Nội dung (`note`) is optional, trimmed, empty means `null`, max 500 characters *(planner's call)*.
- Hiding a fixed category in Sổ chi tiêu never hides it in the group form's picker.
- No transaction changes category unless the user merges.

## Review Focus

1. **Existing user, starter renamed or hidden.** Adoption resets name/icon/parent to the fixed values but keeps `hidden`, and keeps every transaction on the same row id. → Task 3 test `adopts starter rows by id, keeps hidden and transactions`.
2. **Two first loads at once** (two tabs, or categories GET racing a group-link write). No duplicate fixed rows. → Task 3 test `ensureFixedCategories is idempotent under concurrent calls` (unique index + `onConflictDoNothing`).
3. **Editing an old group expense** (no `category_key`/`note`), and a pending (approval) edit, must carry both fields forward across versions. Nulls stay null. → Task 5 tests `edit keeps category_key and note across versions` and `pending edit carries note`.
4. **Merging a custom category that is someone's default for group spending or a group-link override.** Both are moved to the target, and the delete doesn't fail on the FK. → Task 4 test `merge into fixed moves links and default`.
5. **Vay/Nợ edit of an existing loan** filed as Cho vay: it opens with no danh mục picked and the payer flip still swaps Cho vay ↔ Đi vay. Picking then clearing a danh mục returns to the automatic loan category. → Task 11 test `loan category follows flip until a danh mục is picked`.

---

### Task 1: Fixed category list in `@cc/core`

**Files:**
- Create: `libs/shared/core/src/fixedCategories.ts`
- Modify: `libs/shared/core/src/index.ts` (export it)
- Test: `libs/shared/core/test/fixedCategories.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface FixedCategory { key: string; parentKey: string | null; type: 'expense' | 'income'; name: string; icon: string; sortOrder: number }
  export const FIXED_CATEGORIES: readonly FixedCategory[];          // parents before children
  export const FIXED_CATEGORY_KEYS: ReadonlySet<string>;
  export const GENERAL_CATEGORY_KEY = 'general';
  export function fixedCategory(key: string): FixedCategory | undefined;
  export function isFixedExpenseKey(key: string): boolean;          // exists and type === 'expense'
  /** Old starter keys whose row is adopted as the fixed entry with the same key. */
  export const ADOPTED_STARTER_KEYS: ReadonlySet<string>;          // food, transport, bills, lend, borrow, salary, interest, other-income
  ```

Exact entries (key · parent · type · name · icon). Sort order follows this table's order within each parent:

| key | parent | type | name | icon |
|---|---|---|---|---|
| food | – | expense | Ăn uống | utensils |
| food-dining | food | expense | Ăn ngoài | utensils-crossed |
| food-groceries | food | expense | Đi chợ / siêu thị | shopping-basket |
| food-liquor | food | expense | Bia rượu | beer |
| transport | – | expense | Di chuyển | car |
| transport-bicycle / -bus-train / -car / -fuel / -hotel / -parking / -plane / -taxi | transport | expense | Xe đạp / Xe buýt / tàu / Ô tô / Xăng xe / Khách sạn / Gửi xe / Máy bay / Taxi / Grab | bike / bus / car / fuel / hotel / square-parking / plane / car-taxi-front |
| entertainment | – | expense | Giải trí | party-popper |
| entertainment-games / -movies / -music / -sports | entertainment | expense | Trò chơi / Xem phim / Âm nhạc / Thể thao | gamepad-2 / film / music / dumbbell |
| home | – | expense | Nhà cửa | house |
| home-electronics / -furniture / -supplies / -maintenance / -mortgage / -pets / -rent / -services | home | expense | Đồ điện tử / Nội thất / Đồ gia dụng / Sửa chữa / Trả góp nhà / Thú cưng / Tiền nhà / Dịch vụ | tv / sofa / package / wrench / landmark / paw-print / key-round / concierge-bell |
| life | – | expense | Cuộc sống | heart-handshake |
| life-childcare / -clothing / -education / -gifts / -insurance / -medical / -taxes | life | expense | Con cái / Quần áo / Học tập / Quà tặng / Bảo hiểm / Khám chữa bệnh / Thuế | baby / shirt / graduation-cap / gift / shield / stethoscope / scale |
| bills | – | expense | Hóa đơn | receipt |
| bills-cleaning / -electricity / -gas / -trash / -internet / -water | bills | expense | Dọn dẹp / Điện / Gas / Rác / Mạng / ĐT / TV / Nước | spray-can / zap / flame / trash-2 / wifi / droplet |
| general | – | expense | Chung | tag |
| lend | – | expense | Cho vay | hand-coins |
| borrow | – | income | Đi vay | handshake |
| salary | – | income | Lương | wallet |
| bonus | – | income | Thưởng | trophy |
| interest | – | income | Lãi | piggy-bank |
| other-income | – | income | Thu nhập khác | coins |

- [ ] **Step 1: Write the failing tests** in `fixedCategories.test.ts`:
  - `has 6 expense groups with 36 subs, plus general and lend, and borrow plus 4 income`: 6 expense parents with children (36 children in total), 2 childless expense entries (`general`, `lend`), 5 income entries, `FIXED_CATEGORIES.length === 49`.
  - `keys are unique and every parentKey exists earlier in the list`.
  - `parents and children share a type`.
  - `isFixedExpenseKey`: `'food-dining'` → true, `'salary'` → false, `'nope'` → false.
  - `ADOPTED_STARTER_KEYS` equals `['food','transport','bills','lend','borrow','salary','interest','other-income']` as a set, and each is a FIXED key.
- [ ] **Step 2:** `npx nx run @cc/core:test -- fixedCategories` → FAIL (module missing).
- [ ] **Step 3:** Implement `fixedCategories.ts` with the table above and export from `index.ts`.
- [ ] **Step 4:** Same command → PASS.
- [ ] **Step 5:** Commit `feat(core): fixed danh mục list (#140)`.

### Task 2: Icon registry covers the fixed list

**Files:**
- Modify: `libs/web/ui/src/components/icons.tsx` (add missing lucide icons under their kebab names)
- Modify: `libs/web/screens/src/components/categoryIcon.ts` (add the new names to `CATEGORY_ICON_OPTIONS` with vi/en keywords)
- Test: `libs/web/screens/src/components/__tests__/fixed-category-icons.test.ts`

**Interfaces:**
- Consumes: `FIXED_CATEGORIES` (Task 1).
- Produces: `categoryIconName(icon)` resolves every fixed icon to a real `IconName` (no generic fallback).

- [ ] **Step 1: Failing test** `every fixed category icon renders a registered lucide icon`: for each `FIXED_CATEGORIES` entry, `categoryIconName(c.icon)` equals `c.icon`, and the icon map has that key.
- [ ] **Step 2:** `npx nx run @cc/web-screens:test -- fixed-category-icons` → FAIL listing the missing names.
- [ ] **Step 3:** Register the missing icons (likely `utensils-crossed shopping-basket beer bike hotel square-parking car-taxi-front party-popper house tv sofa package key-round concierge-bell heart-handshake baby scale spray-can flame trash-2 droplet tag hand-coins handshake paw-print`) and add them to `CATEGORY_ICON_OPTIONS`.
- [ ] **Step 4:** Same command → PASS. Then run `npx nx run @cc/web-screens:test -- style-guard` → PASS.
- [ ] **Step 5:** Commit `feat(ui): icons for the fixed danh mục (#140)`.

### Task 3: Schema, migration and fixed-row seeding/adoption

**Files:**
- Create: `apps/api/migrations/0034_fixed_categories.sql`
- Modify: `libs/api/db/src/schema.ts` (`personalCategories.systemKey`, `transactions.categoryKey`, `transactions.note`)
- Create: `apps/api/src/personal/fixedCategories.ts`
- Modify: `apps/api/src/personal/categories.ts` (GET uses `ensureFixedCategories`, `toCategoryView` adds `systemKey`), `apps/api/src/personal/groupLinks.ts` (replace `GROUP_STARTERS`/`ensureGroupStarterCategories` with `ensureFixedCategories`), `apps/api/src/personal/starterCategories.ts` (delete; update imports)
- Modify: `libs/shared/core/src/api-types.ts` (`CategoryView.systemKey?: string | null`)
- Test: `apps/api/test/personal-fixed-categories.test.ts`, `apps/api/test/schema-fixed-categories.test.ts`

**Interfaces:**
- Consumes: `FIXED_CATEGORIES`, `ADOPTED_STARTER_KEYS` (Task 1).
- Produces:
  ```ts
  export async function ensureFixedCategories(db: Db, userId: string): Promise<void>;
  export function fixedCategoryId(userId: string, key: string): string; // `${userId}:${key}`
  ```
  The DB columns are `personal_categories.system_key TEXT NULL` with `UNIQUE INDEX personal_categories_user_system_key_idx (user_id, system_key)`, `transactions.category_key TEXT NULL` and `transactions.note TEXT NULL`.

Behaviour of `ensureFixedCategories`:
- Load the user's rows. If every fixed key already has a row with that `system_key`, return (no writes).
- For each fixed key with no `system_key` row: if a row with id `fixedCategoryId(userId,key)` exists and `key ∈ ADOPTED_STARTER_KEYS`, update it: set `system_key`, name, icon, type, `parent_id = parentKey ? fixedCategoryId(userId,parentKey) : null`, and keep `hidden` and `sort_order`. Otherwise insert it with `onConflictDoNothing()`.
- Old starters not adopted (shopping, health, invest, fees, tax, fee, dividend, other-income-reward, group) are left untouched. They become custom.
- New users: `personal_group_settings.defaultGroupCategoryId` defaults to `fixedCategoryId(userId,'general')` where the code used the old `group` starter. Existing settings rows are unchanged.

- [ ] **Step 1: Failing tests** (use `apps/api/test/personal-helpers.ts` fixtures):
  - `new user GET /me/personal/categories returns exactly the fixed list with systemKey set`.
  - `adopts starter rows by id, keeps hidden and transactions`: seed old starters (insert old rows `${uid}:food` hidden=1, `${uid}:transport` renamed "Đi lại", `${uid}:tax` under `${uid}:fees`, a transaction on `${uid}:food`), GET → `food` has systemKey 'food', hidden true, name 'Ăn uống'. `transport` is renamed back to 'Di chuyển' with icon 'car'. `tax` has systemKey null and is still under `fees`. The transaction still has category `${uid}:food`.
  - `custom category named "Ăn uống" is never adopted`: a custom row with that name stays `systemKey: null`.
  - `ensureFixedCategories is idempotent under concurrent calls`: `Promise.all` of two calls, then the row count equals `FIXED_CATEGORIES.length`.
  - `second GET does no writes`: row `updated_at` values unchanged.
  - Schema test: the three columns exist and the unique index rejects a duplicate `(user_id, system_key)`.
- [ ] **Step 2:** `npx nx run @cc/api:test -- personal-fixed-categories schema-fixed-categories` → FAIL.
- [ ] **Step 3:** Write the migration (`ALTER TABLE … ADD COLUMN` ×3, `CREATE UNIQUE INDEX`, `--> statement-breakpoint` between statements as in 0032), update `schema.ts`, implement `fixedCategories.ts`, and wire it into the GET and `groupLinks.ts`.
- [ ] **Step 4:** Same command → PASS. Then run the whole API suite `npx nx run @cc/api:test` → PASS. Any existing test that asserts the old starter list is reported to the planner, not edited.
- [ ] **Step 5:** Apply locally: `npx wrangler d1 migrations apply fsl --local` in `apps/api`. Commit `feat(api): fixed danh mục rows and migration 0034 (#140)`.

### Task 4: Locked fixed rows and merge into fixed

**Files:**
- Modify: `apps/api/src/personal/categories.ts` (POST/PATCH/DELETE)
- Test: `apps/api/test/personal-fixed-categories-lock.test.ts`

**Interfaces:**
- Consumes: `systemKey` column (Task 3).
- Produces: the API contract below.
  - `PATCH` on a row with `system_key`: only `hidden` (and the existing per-wallet visibility) may change. `name`/`icon`/`parentId` → `422 { code: 'FIXED_CATEGORY' }`.
  - `DELETE` a fixed row → `422 FIXED_CATEGORY`.
  - `POST` with `parentId` of a fixed parent is allowed (custom child under a fixed parent).
  - `DELETE /:id?moveTo=<fixed id>` (the merge) additionally moves `personal_group_links.category_id` and `personal_group_settings.default_group_category_id` from `id` to `moveTo` inside the same `commitPersonalWrite`.

- [ ] **Step 1: Failing tests:** `rename fixed → 422 FIXED_CATEGORY`, `change icon fixed → 422`, `delete fixed → 422`, `hide fixed → 200 hidden true and it still resolves on old transactions`, `custom child under fixed parent → 201`, `merge into fixed moves links and default` (a custom category used by a transaction, a group link and as the default; after merge all three point at the fixed id and the custom row is gone).
- [ ] **Step 2:** `npx nx run @cc/api:test -- personal-fixed-categories-lock` → FAIL.
- [ ] **Step 3:** Implement the guards and extend the moveTo batch.
- [ ] **Step 4:** Same command → PASS, then `npx nx run @cc/api:test -- personal-categories` → PASS.
- [ ] **Step 5:** Commit `feat(api): lock fixed danh mục and merge into them (#140)`.

### Task 5: `categoryKey` and `note` on group expenses

**Files:**
- Modify: `libs/shared/core/src/api-types.ts` (`ExpenseInput.categoryKey?: string | null; note?: string | null`, `ExpenseView.categoryKey: string | null; note: string | null`, and the expense history item if it mirrors description)
- Modify: `apps/api/src/expenses/routes.ts` (`ValidatedExpense` + validation + every insert/version copy site that copies `description`), the expense view builder that maps rows to `ExpenseView`, and `apps/api/src/fund/*` if it builds `ExpenseView`
- Test: `apps/api/test/expenses-category-note.test.ts`

**Interfaces:**
- Consumes: `isFixedExpenseKey` (Task 1), columns (Task 3).
- Produces: `ExpenseView.categoryKey`, `ExpenseView.note`. Validation errors: `validationError('categoryKey', …)` 422 for an unknown or income key, and `validationError('noteLength', …)` for more than 500 characters. An omitted field on edit means "keep the current value". `null` clears it.

- [ ] **Step 1: Failing tests:**
  - `create with categoryKey food-dining and note round-trips in the trip view`.
  - `create without them stores nulls`.
  - `income key or unknown key → 422`. `note of 501 chars → 422`. `note "  " stores null`.
  - `edit keeps category_key and note across versions` (edit only the amount, so the new version still has both).
  - `pending edit carries note` (a member edit that needs approval: the pending version has the new note, and approving keeps it).
  - `fund income rejects categoryKey` (POST income with `categoryKey` → 422).
- [ ] **Step 2:** `npx nx run @cc/api:test -- expenses-category-note` → FAIL.
- [ ] **Step 3:** Implement. Copy `categoryKey`/`note` wherever `description` is copied between versions.
- [ ] **Step 4:** Same command → PASS, then the full `npx nx run @cc/api:test` → PASS.
- [ ] **Step 5:** Commit `feat(api): danh mục and Nội dung on group expenses (#140)`.

### Task 6: Group rows resolve the group's danh mục

**Files:**
- Modify: `libs/shared/core/src/groupShares.ts` (`GroupRow.groupCategoryId: string | null`, `groupRowCategoryId`)
- Modify: `apps/api/src/personal/groupShares.ts` (select `transactions.categoryKey`, set `groupCategoryId = categoryKey ? fixedCategoryId(userId, categoryKey) : null` for `source === 'expense'`, else null)
- Modify: web defaults that build `GroupRow` literals in tests/fixtures only if they fail to typecheck (planner handles existing tests)
- Test: `libs/shared/core/test/groupShares-category.test.ts`, `apps/api/test/personal-group-category.test.ts`

**Interfaces:**
- Produces: `groupRowCategoryId(row, settings, fallback)` = `row.link?.categoryId ?? row.groupCategoryId ?? settings.defaultGroupCategoryId ?? fallback` (signature unchanged).

- [ ] **Step 1: Failing tests:** core: `own override beats group danh mục`, `group danh mục beats default`, `default when group has none`. API: `group rows expose groupCategoryId for an expense with category_key`, `null for payments and fund rows`.
- [ ] **Step 2:** `npx nx run @cc/core:test -- groupShares-category` and `npx nx run @cc/api:test -- personal-group-category` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Both commands → PASS, then `npm run typecheck` → PASS.
- [ ] **Step 5:** Commit `feat: group rows use the group's danh mục (#140)`.

### Task 7: Categories screen: fixed, hidden and merge

**Files:**
- Modify: `libs/web/screens/src/screens/CategoriesScreen.tsx`
- Modify: `libs/web/data-access/src/personalMoney.ts` (merge reuses the existing delete-with-`moveTo` mutation. Only add a hook if none exists.)
- Modify: `libs/web/i18n/src/vi.ts`, `en.ts`
- Test: `libs/web/screens/src/screens/__tests__/categories-fixed.test.tsx`

**Interfaces:**
- Consumes: `CategoryView.systemKey` (Task 3), the API contract (Task 4).
- UI: fixed rows show a small lock icon (`Icon name="lock"`, `aria-label` = `categories.builtIn` "Có sẵn") and a hide `Switch` (`data-testid="category-hide-<id>"`), and no rename/delete/icon actions. Custom rows get a merge icon button (`data-testid="category-merge-<id>"`, `aria-label` "Gộp vào…") that opens a `Sheet` listing the fixed categories of the same type (`data-testid="merge-target-list"`). Picking one opens a confirm (`Modal`) "Gộp “{from}” vào “{to}”? Các giao dịch sẽ chuyển sang “{to}”.", then calls delete with `moveTo`. Hidden fixed categories are listed under a "Đã ẩn" heading (`data-testid="categories-hidden-section"`).

- [ ] **Step 1: Failing tests:** `fixed row has no delete or rename`, `hide switch moves it to Đã ẩn`, `merge sends DELETE ?moveTo=<fixed id> after confirm`, `merge targets are only fixed categories of the same type`.
- [ ] **Step 2:** `npx nx run @cc/web-screens:test -- categories-fixed` → FAIL.
- [ ] **Step 3:** Implement and add the copy.
- [ ] **Step 4:** Same command → PASS, then `npx nx run @cc/web-screens:test -- categor` → PASS.
- [ ] **Step 5:** Commit `feat(web): fixed danh mục on the categories screen (#140)`.

### Task 8: Shared expense form pieces

**Files:**
- Create in `libs/web/screens/src/components/sharedExpense/`: `TitleWithCategory.tsx`, `DanhMucSheet.tsx`, `PayerSheet.tsx`, `SharedDetailsCard.tsx`, `NoteField.tsx`
- Modify: `libs/web/i18n/src/vi.ts`, `en.ts`
- Test: `libs/web/screens/src/components/__tests__/shared-expense-pieces.test.tsx`

**Interfaces:**
- Consumes: `FIXED_CATEGORIES`, `GENERAL_CATEGORY_KEY` (Task 1), `categoryIconName` (Task 2), `EntryDateRow`, `Sheet`, `Input`.
- Produces:
  ```ts
  /** value is a fixed key in groups; in Sổ chi tiêu it may be a personal category id. */
  export type DanhMucValue = { kind: 'fixed'; key: string } | { kind: 'personal'; id: string } | null;
  TitleWithCategory(props: { title: string; onTitleChange(v: string): void; titleError?: string | null;
    categoryIcon: string; categoryLabel: string; onOpenCategory(): void; inputRef?: RefObject<HTMLInputElement | null> })
    // input data-testid="shared-title-input" (fsl-input, text-base, maxLength 80); icon button data-testid="shared-category-btn", size-11, aria-label = categoryLabel
  DanhMucSheet(props: { open: boolean; onClose(): void; value: DanhMucValue; onChange(v: DanhMucValue): void;
    personal?: { categories: CategoryView[] }   // present only in Sổ chi tiêu: adds the user's visible custom categories, hides their hidden fixed ones
  })  // fixed list grouped by parent, search input (data-testid="danh-muc-search"), "Bỏ chọn" row → onChange(null); list data-testid="danh-muc-list"
  PayerSheet(props: { open: boolean; onClose(): void; people: { id: string; name: string }[]; me: string | null; value: string; onChange(id: string): void })
  SharedDetailsCard(props: { payerName: string; onOpenPayer(): void; date: string; onDateChange(d: string): void; walletRow?: ReactNode })
    // rounded-xl bg-card divide-y; rows data-testid="shared-payer-row" and EntryDateRow (showTime=false); walletRow rendered last
  NoteField(props: { value: string; onChange(v: string): void })  // label "Nội dung", optional, data-testid="shared-note-input", maxLength 500
  ```
- Copy: `sharedExpense.titleLabel` "Tiêu đề", `titlePlaceholder` "VD: Ăn tối quán nướng", `titleRequired` "Nhập tiêu đề", `pickCategory` "Chọn danh mục", `clearCategory` "Bỏ chọn", `payer` "Người trả", `note` "Nội dung", `notePlaceholder` "Ghi chú thêm (không bắt buộc)".

- [ ] **Step 1: Failing tests:** `title button shows Chung icon when no danh mục`, `DanhMucSheet groups fixed by parent and search filters by name`, `DanhMucSheet in groups ignores personal hidden flags` (pass no `personal` → all fixed shown), `DanhMucSheet in Sổ chi tiêu hides the user's hidden fixed and adds customs`, `PayerSheet marks me and calls onChange`, `SharedDetailsCard always shows payer and date rows`.
- [ ] **Step 2:** `npx nx run @cc/web-screens:test -- shared-expense-pieces` → FAIL.
- [ ] **Step 3:** Implement with app wrappers only.
- [ ] **Step 4:** Same command → PASS, then `npx nx run @cc/web-screens:test -- style-guard` → PASS.
- [ ] **Step 5:** Commit `feat(web): shared expense form pieces (#140)`.

### Task 9: `ExpenseForm` uses the shared layout

**Files:**
- Modify: `libs/web/screens/src/screens/ExpenseForm.tsx` (render order only: title+danh mục → amount (`AmountField` + `DockedAmountKeypad`, as `EntryPage` uses them) → `SharedDetailsCard` (payer sheet replaces the `fsl-select` payer; `EntryDateRow` replaces the date input) → split section (existing `SplitBetween`/`SplitModePicker`/rows/sport rule, unchanged logic) → sport/fund cards (unchanged, placed here) → `NoteField` → save bar)
- Modify: `libs/web/data-access` expense create/edit input types if they don't already pass `categoryKey`/`note` through
- Test: `libs/web/screens/src/screens/__tests__/expense-form-shared-layout.test.tsx`

**Interfaces:**
- Consumes: Task 8 components. `ExpenseInput.categoryKey/note` (Task 5).
- Save sends `description = title.trim()`, `categoryKey = value?.kind === 'fixed' ? value.key : null`, `note = note.trim() || null`. Editing loads `expense.categoryKey`/`expense.note`.
- Keep: `fsl-expense-form`, `fsl-expense-form__split-section`, `fsl-split-row*`, `fsl-sport-*`, `fsl-field-error`, the amount input id `expense-amount`, and all `data-testid`s. Move `#expense-what-for` onto the title input. If the payer and date controls change type, report each affected existing test to the planner.

- [ ] **Step 1: Failing tests:** `order is title, amount, payer+date, split, note`, `payer and date visible without any toggle`, `save sends categoryKey and note`, `edit pre-fills title, danh mục and Nội dung`, `title empty blocks save with Nhập tiêu đề`, `sport group still shows court slots and rule picker`, `fund-paid expense still shows FundPaidPanel`, `direct preset (Khoản chi nhanh) renders the same layout`.
- [ ] **Step 2:** `npx nx run @cc/web-screens:test -- expense-form-shared-layout` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Same command → PASS, then `npx nx run @cc/web-screens:test -- expense-form` and report the results (failures in existing tests go to the planner).
- [ ] **Step 5:** Commit `feat(web): group expense form uses the shared layout (#140)`.

### Task 10: Group rows and details show danh mục and Nội dung

**Files:**
- Modify: `libs/web/screens/src/components/GroupTxRow.tsx`, `GroupRowSheet.tsx`, `ExpenseRow.tsx`, `ExpenseDetails.tsx`
- Test: `libs/web/screens/src/components/__tests__/group-danh-muc-display.test.tsx`

**Interfaces:**
- Consumes: `ExpenseView.categoryKey/note`, `GroupRow.groupCategoryId` (Tasks 5–6).
- Group trip expense rows (`ExpenseRow`) show the fixed category icon in place of their generic icon when `categoryKey` is set. `ExpenseDetails` shows the note under the title when non-null (`data-testid="expense-note"`). Sổ chi tiêu group rows already resolve via `groupRowCategoryId`, so verify only.

- [ ] **Step 1: Failing tests:** `expense row shows food-dining icon`, `expense details shows Nội dung only when set`, `Sổ chi tiêu group row uses group danh mục when no override`.
- [ ] **Step 2:** `npx nx run @cc/web-screens:test -- group-danh-muc-display` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Same command → PASS.
- [ ] **Step 5:** Commit `feat(web): show group danh mục and Nội dung (#140)`.

### Task 11: Vay/Nợ tab uses the shared layout

**Files:**
- Modify: `libs/web/screens/src/screens/EntryPage.tsx` (the `isLoanDebt` branch only)
- Test: `libs/web/screens/src/screens/__tests__/entry-loan-shared-layout.test.tsx`

**Interfaces:**
- Consumes: Task 8 components (`DanhMucSheet` with `personal`), `quickShare.save` input (`expense.categoryKey`, `expense.note` added to `QuickShareInput['expense']` in `libs/web/data-access/src/quickShare.ts`).
- Layout on the Vay/Nợ tab: `TitleWithCategory` → existing amount box/keypad → `SharedDetailsCard` (payer row = `quickSplit.payerId`. Choosing a payer other than me sets `quickSplit.setFlipped(true)`, choosing me sets it false. Date. `walletRow` = the existing wallet row) → existing `SplitWithPeople`/`SplitFold`/`OutcomeSentence` → `NoteField` → save bar.
- Save: `description = title.trim()` (required), `expense.note = note.trim() || null`. Danh mục picked (`DanhMucValue` not null): `link.categoryId` = the picked personal row (fixed → `fixedCategoryId`-shaped id from the categories list by `systemKey`, personal → its id), and `expense.categoryKey` = the fixed key or null. Nothing picked: `link.categoryId` = Cho vay / Đi vay by `quickSplit.flipped` (as today) and `expense.categoryKey = null`. Intent stays `'loan'`.
- Edit (`isDirectEdit`): pre-fill the title from `description`, Nội dung from `note`, and danh mục from `categoryKey`. If `categoryKey` is null and the link's category is lend/borrow, treat it as "nothing picked".

- [ ] **Step 1: Failing tests:** `Vay/Nợ shows title, amount, payer+date, people, Nội dung`, `loan category follows flip until a danh mục is picked` (no pick: flip swaps the saved link category between `:lend` and `:borrow`. Pick Ăn ngoài: the link category is `:food-dining` and categoryKey is `food-dining`. Clear: back to `:lend`), `title required`, `edit of an existing Cho vay loan opens with no danh mục and the flip works`.
- [ ] **Step 2:** `npx nx run @cc/web-screens:test -- entry-loan-shared-layout` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Same command → PASS, then `npx nx run @cc/web-screens:test -- entry-` and report the results.
- [ ] **Step 5:** Commit `feat(web): Vay/Nợ uses the shared expense layout (#140)`.

### Task 12: Chi shared with people passes its danh mục to the group

**Files:**
- Modify: `libs/web/screens/src/screens/EntryPage.tsx` (Chi shared-with-people save path only)
- Test: `libs/web/screens/src/screens/__tests__/entry-share-category-key.test.tsx`

**Interfaces:**
- Consumes: `CategoryView.systemKey`, `QuickShareInput['expense'].categoryKey` (Task 11).
- Rule: when the picked personal category has `systemKey` and it is an expense key, send `expense.categoryKey = systemKey`. Otherwise send null. Nothing else on Chi/Thu changes.

- [ ] **Step 1: Failing tests:** `Chi with people and Ăn ngoài sends categoryKey food-dining`, `custom category sends null`.
- [ ] **Step 2:** `npx nx run @cc/web-screens:test -- entry-share-category-key` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Same command → PASS, then `npx nx run @cc/web-screens:test -- entry-share-with` → PASS.
- [ ] **Step 5:** Commit `feat(web): Chi with people shares its danh mục (#140)`.

### Task 13: Whole-branch verification (planner)

- [ ] `npm test`, `npm run typecheck`, `npm run lint` → all pass.
- [ ] Build, then `npm run e2e -- <expense and entry specs>` per the e2e memory.
- [ ] Apply migration 0034 `--local`, start the tunnel on the latest build, browser-check the three entry points + categories screen at phone width and ≥1024px, then hand over for the owner's manual test.
