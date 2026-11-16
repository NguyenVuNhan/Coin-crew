# Wallets and transactions, Part 1: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo every implementer task runs through the `gemini-execution` skill (an Orca worktree per task); the planner reviews each diff and runs the tests.

**Goal:** Part 1 of #113 (design §9): several wallets in VND / USD / USDT, of kind everyday or investment, with expense, income and transfer entered by hand, categories, tags, an "exclude from reports" switch, one VND total and the transaction list.

**Architecture:** The money rules (currencies, balances, the VND cost of foreign-currency wallets, list totals) are pure functions in `@cc/core`, tested without a database. A new migration adds five personal tables beside #112's `personal_wallets`. New Hono routes sit in `apps/api/src/personal/`, all behind `requirePersonal` and all filtered by the signed-in user. React Query hooks go in `@cc/web-data-access`. Screens are built only after an `/impeccable` checkpoint with the owner (Task 10).

**Tech Stack:** TypeScript 7, Hono on Cloudflare Workers + D1 (Drizzle), Vitest (`@cloudflare/vitest-plugin` for the API), React + React Query, shadcn/ui + Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-11-16-wallets-and-transactions-design.md` (decisions W1–W21; §7 "Kept as #112 left them"). It builds on `docs/superpowers/specs/2026-11-15-spending-book-shape-and-navigation-design.md`.

## Global Constraints

- **Additive only.** Never alter or drop a Phase 1 table or column. Never edit or delete an existing test, including #112's `apps/api/test/personal-wallets.test.ts`, `schema-wallets.test.ts`, `schema-personal.test.ts` and `libs/web/screens/src/screens/__tests__/spending-book.test.tsx`.
- **Do not edit** `libs/api/db/src/commit.ts`, `computeBalances` / `computeShares` / `suggestTransfers`, `apps/api/src/trips/snapshot.ts`, `apps/api/src/me/{balances,settle,ledger}.ts`, `libs/api/auth/src/device.ts`, or the expense and payment routes. Importing from them is fine (`findLedger` from `apps/api/src/me/ledger.ts`).
- **`personal_wallets` keeps exactly its nine columns.** `POST /me/personal/wallets` keeps "first wallet only, startAmount 0…MAX_WALLET_AMOUNT, second → 409 ALREADY_HANDLED". `GET /me/personal/wallets` returns exactly `{ wallets }`.
- **Every new route** is under `/api/me/personal/…`, uses `requirePersonal`, and filters every query by the session user's id. Another user's id in a path or body → `404 NOT_FOUND`. Switch off → `403`.
- **Money is integers** in the currency's smallest unit. VND has 0 decimals, USD 2, USDT 2. Maximum per currency: VND `1_000_000_000_000`, USD and USDT `10_000_000_000`.
- **Naming:** never "ledger" for the new code (rule 10). Use `personal`, `wallet`, `entry`.
- **Migrations are hand-written SQL.** Never run `drizzle-kit generate`. Apply them with `--local` for the tunnel. Never commit unless the owner says so.
- **At most 50 database queries per request.** Each route's query count is stated in its task.
- **Copy:** Vietnamese first, English second, in `libs/web/i18n` (`vi.ts`, `en.ts`). Every new Vietnamese line carries `// REVIEW`.
- **UI:** read `DESIGN.md` and `PRODUCT.md` first. Use the wrappers first (`Sheet`, `Modal`, `Button`, `Pill`, `Amount`, `Icon`, `Snackbar`, `Skeleton`, `InlineError`) and theme colours only. Fields are `text-base`; touch targets use `min-h-11`. Expense and income use − / + plus `text-danger` / `text-success`, never colour alone. Tests select by `fsl-*` classes and `data-testid`.
- **Commands:** `npm test`, `npm run typecheck`, `npm run lint` (lint only through Nx), and `npm run e2e -- golden-path` / `npm run e2e -- walkthrough` (each builds first).

## Review Focus

1. **A transfer edited from either side.** Opening the receiving side and changing the amount must update both rows, keep one `transfer_id`, and leave no orphan. Pinned in Task 6: `editing the in-side of a transfer rewrites both sides`.
2. **A wallet's start date moved later than existing entries.** The entries must stay listed with `beforeStart: true` and drop out of the balance and the VND cost without being deleted. Pinned in Task 2 (`entries before the start date are ignored`) and Task 4 (`moving startDate after an entry flips its beforeStart and the balance`).
3. **Undo after the category or wallet changed.** The restore route must refuse (`404`) if the wallet was deleted, or (`422`) if it was archived, rather than inserting rows that point at nothing. A hidden category must still be accepted on restore. Pinned in Task 6: `restore refuses when the wallet is gone`.
4. **A double tap on save.** Two identical POSTs make two entries (no idempotency key in Part 1), but a double tap on the first wallet must make exactly one. Pinned in Task 4: `two parallel /wallets/add for a user with no wallet make one default wallet`.
5. **Foreign-currency amounts typed the Vietnamese way.** "12,5", "12.50" and "1.234,56" for USD, while "1.234.567" and "50k" stay valid for VND only. Pinned in Task 1's `parseMoney` table.

---

## Stage A: data, rules and API (no screens)

### Task 1: Currencies and money parsing in `@cc/core`

**Files:**
- Create: `libs/shared/core/src/currency.ts`
- Modify: `libs/shared/core/src/index.ts` (export it)
- Test: `libs/shared/core/test/currency.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const CURRENCIES: { readonly VND: CurrencyInfo; readonly USD: CurrencyInfo; readonly USDT: CurrencyInfo };
  export interface CurrencyInfo { decimals: 0 | 2; symbol: string; max: number }
  export type CurrencyCode = 'VND' | 'USD' | 'USDT';
  export const CURRENCY_CODES: readonly CurrencyCode[]; // ['VND', 'USD', 'USDT']
  export function isCurrencyCode(x: unknown): x is CurrencyCode;
  export function isValidAmount(minor: unknown, code: CurrencyCode, opts?: { allowNegative?: boolean; allowZero?: boolean }): minor is number;
  export function formatMoney(minor: number, code: CurrencyCode): string;
  export function parseMoney(input: string, code: CurrencyCode): number | null; // > 0 only
  ```
  Symbols: VND `₫` (suffix, as `formatVnd`), USD `$` (suffix after a space), USDT `USDT` (suffix after a space). Thousands use `.` and decimals use `,` (Vietnamese).

- [ ] **Step 1: Write the failing tests**

```ts
describe('formatMoney', () => {
  it.each([
    [1234567, 'VND', '1.234.567₫'],
    [-5000, 'VND', '-5.000₫'],
    [123456, 'USD', '1.234,56 $'],
    [5, 'USDT', '0,05 USDT'],
    [-100, 'USD', '-1,00 $'],
  ])('%d %s → %s', (m, c, out) => expect(formatMoney(m, c as CurrencyCode)).toBe(out));
});
describe('parseMoney', () => {
  it.each([
    ['50k', 'VND', 50000], ['1.234.567', 'VND', 1234567], ['2tr', 'VND', 2000000],
    ['12', 'USD', 1200], ['12,5', 'USD', 1250], ['12.50', 'USD', 1250], ['1.234,56', 'USD', 123456],
    ['0,01', 'USDT', 1],
  ])('%s %s → %d', (s, c, v) => expect(parseMoney(s, c as CurrencyCode)).toBe(v));
  it.each([
    ['12,345', 'USD'], ['50k', 'USD'], ['0', 'VND'], ['-5', 'VND'], ['abc', 'USDT'],
    ['100000001', 'USD'], ['1000000000001', 'VND'],
  ])('%s %s → null', (s, c) => expect(parseMoney(s, c as CurrencyCode)).toBeNull());
});
describe('isValidAmount', () => {
  it('rejects floats, zero and over-max by default', () => {
    expect(isValidAmount(1.5, 'USD')).toBe(false);
    expect(isValidAmount(0, 'VND')).toBe(false);
    expect(isValidAmount(10_000_000_001, 'USDT')).toBe(false);
    expect(isValidAmount(-10, 'VND', { allowNegative: true, allowZero: true })).toBe(true);
  });
});
```

- [ ] **Step 2: Run** `npx nx test @cc/core -- currency`. It should FAIL with "Cannot find module '../src/currency'".
- [ ] **Step 3: Implement.** VND parsing accepts the same grammar as `parseVnd` (`k` / `tr` suffixes, `.` `,` or space thousands groups) with `CURRENCIES.VND.max` as the limit. Write it as its own function in `currency.ts`, leaving `money.ts` unchanged. USD and USDT accept digits with an optional single decimal part of 1–2 digits after `.` or `,`, or `.` thousands groups followed by a `,` decimal part. Three digits after a lone separator is ambiguous, so it returns `null`. No suffixes.
- [ ] **Step 4: Run** `npx nx test @cc/core`. Everything should PASS, including the existing `money.test.ts`.
- [ ] **Step 5: Commit** `feat(core): currencies with decimals, limits, format and parse`.

### Task 2: Wallet balances, VND cost and list totals in `@cc/core`

**Files:**
- Create: `libs/shared/core/src/wallets.ts`
- Modify: `libs/shared/core/src/index.ts`
- Test: `libs/shared/core/test/wallets.test.ts`

**Interfaces:**
- Consumes: `CurrencyCode` (Task 1).
- Produces:
  ```ts
  export type PersonalEntryType = 'expense' | 'income' | 'transfer_out' | 'transfer_in';
  export interface CalcWallet { id: string; currency: CurrencyCode; startAmount: number; startDate: string; startCostVnd: number | null; archived: boolean }
  export interface CalcEntry { id: string; walletId: string; type: PersonalEntryType; amount: number; date: string; time: string | null; createdAt: string; transferId: string | null; excludeFromReports: boolean }
  export function isBeforeStart(entry: Pick<CalcEntry, 'date'>, wallet: Pick<CalcWallet, 'startDate'>): boolean;
  export function walletBalance(wallet: CalcWallet, entries: CalcEntry[]): number;
  export function walletVndValues(wallets: CalcWallet[], entries: CalcEntry[]): Map<string, number | null>;
  export interface VndTotal { totalVnd: number; approximate: boolean; perCurrency: { currency: CurrencyCode; balance: number }[]; unratedWalletIds: string[] }
  export function vndTotal(wallets: CalcWallet[], entries: CalcEntry[]): VndTotal;
  export interface CountedRow { currency: CurrencyCode; signedAmount: number; counted: boolean } // − for money out
  export function sumCounted(rows: CountedRow[]): { currency: CurrencyCode; spent: number; income: number }[];
  ```
  A wallet's entries are the ones whose `walletId` equals its id. A VND wallet's VND value is its balance. Archived wallets are left out of `vndTotal` and `perCurrency`. `perCurrency` lists only currencies that appear, in `CURRENCY_CODES` order. `approximate` is true when any counted wallet is non-VND with a non-zero balance. `sumCounted` skips `counted: false` rows, returns `spent` and `income` as positive numbers, and keeps zero-sum currencies out.

- [ ] **Step 1: Write the failing tests** (amounts in the smallest unit; USDT ×100):

```ts
it('entries before the start date are ignored', () => {
  const w = wallet({ id: 'v', currency: 'VND', startAmount: 1_000_000, startDate: '2026-11-10' });
  expect(walletBalance(w, [e('v', 'expense', 200_000, '2026-11-09'), e('v', 'income', 50_000, '2026-11-10')])).toBe(1_050_000);
});
it('a VND → USDT transfer moves balances and VND cost', () => {
  const bank = wallet({ id: 'b', currency: 'VND', startAmount: 30_000_000 });
  const ex = wallet({ id: 'x', currency: 'USDT', startAmount: 0, startCostVnd: null });
  const es = transfer('t1', 'b', 25_000_000, 'x', 100_000, '2026-11-11');
  expect(walletBalance(bank, es)).toBe(5_000_000);
  expect(walletBalance(ex, es)).toBe(100_000);
  expect(walletVndValues([bank, ex], es).get('x')).toBe(25_000_000);
});
it('average rate after a second transfer and a spend (design §11)', () => {
  // 25.000.000 → 1.000 USDT, then 13.000.000 → 500 USDT, then spend 300 USDT
  const es = [...transfer('t1', 'b', 25_000_000, 'x', 100_000, '2026-11-11'), ...transfer('t2', 'b', 13_000_000, 'x', 50_000, '2026-11-12'), e('x', 'expense', 30_000, '2026-11-13')];
  const v = walletVndValues([bank, ex], es);
  expect(v.get('x')).toBe(30_400_000);
});
it('USD → USDT carries the sender\'s average cost', () => { /* USD wallet start 1.000,00 $ worth 25.000.000; send 400,00 $ for 399,00 USDT → USDT value 10.000.000, USD value 15.000.000 */ });
it('a USDT wallet with no rate yet is unrated, then valued at the first transfer-in rate', () => { /* start 0, income 10,00 USDT → unrated; then transfer 2.500.000 VND → 100,00 USDT → value (10+100)/100 × 2.500.000 = 2.750.000 */ });
it('below zero the cost follows the balance at the last rate', () => { /* 100,00 USDT worth 2.500.000, spend 150,00 → balance -5.000, value -1.250.000 */ });
it('archived wallets stay out of the total', () => { /* archived VND wallet of 9.000.000 not in totalVnd */ });
it('vndTotal marks converted totals approximate and lists per currency', () => { /* VND 5.000.000 + USDT 1.000,00 at 25.000.000 → totalVnd 30.000.000, approximate true, perCurrency [VND 5.000.000, USDT 100.000] */ });
it('sumCounted skips excluded rows', () => {
  expect(sumCounted([{ currency: 'VND', signedAmount: -50_000, counted: true }, { currency: 'VND', signedAmount: -10_000, counted: false }, { currency: 'VND', signedAmount: 200_000, counted: true }]))
    .toEqual([{ currency: 'VND', spent: 50_000, income: 200_000 }]);
});
```
  The `/* … */` cases are part of this step. Write each with the numbers given in its comment.

- [ ] **Step 2: Run** `npx nx test @cc/core -- wallets`. It should FAIL with "Cannot find module".
- [ ] **Step 3: Implement.** `walletBalance` sums entries with `!isBeforeStart` (income and transfer_in add, expense and transfer_out subtract). `walletVndValues` replays every entry of every wallet in one pass, ordered by (`date`, `time ?? ''`, `createdAt`, `transfer_out` before `transfer_in`). Pre-start entries are skipped for the wallet they sit in. Each non-VND wallet starts with `{ qty: startAmount, cost: startCostVnd ?? 0, rated: startCostVnd !== null && startAmount !== 0, lastRate }`. The rules (W12, W19):
  - Out (expense or transfer_out): `rate = qty > 0 ? cost / qty : lastRate`, then `cost -= Math.round(rate × amount)`. Record the removed VND on the transfer for its in-side.
  - Income: `cost += Math.round(rate × amount)` when rated. When not rated, add the amount to `unratedQty`.
  - transfer_in: add the VND value of the out-side. A VND sender gives the amount sent; a non-VND sender gives the cost it removed. The first rated inflow sets `rated`, and any `unratedQty` is valued at that inflow's rate.
  - After each step, `lastRate = cost / qty` whenever `qty > 0`.
  - A wallet still unrated at the end maps to `null`.
- [ ] **Step 4: Run** `npx nx test @cc/core`. It should PASS.
- [ ] **Step 5: Commit** `feat(core): wallet balances, VND value at the moved rate, counted totals`.

### Task 3: Migration and schema for personal money

**Files:**
- Create: `apps/api/migrations/0027_personal_money.sql`
- Modify: `libs/api/db/src/schema.ts` (after `personalWallets`)
- Test: `apps/api/test/schema-personal-money.test.ts`

**Interfaces:**
- Produces Drizzle tables `personalWalletSettings`, `personalCategories`, `personalTags`, `personalTransactions`, `personalTransactionTags`, with the columns in design §7. Column names are snake_case in SQL and camelCase in Drizzle. Constraints:
  - `personal_wallet_settings.wallet_id` is the primary key, references `personal_wallets(id)` on delete cascade.
  - `personal_categories.parent_id` references `personal_categories(id)`.
  - `personal_transactions.wallet_id` references `personal_wallets(id)` (no cascade). `category_id` is nullable and references `personal_categories(id)`.
  - `personal_transactions.type` has `CHECK (type IN ('expense','income','transfer_out','transfer_in','buy','sell'))`. `asset_id` and `quantity` are created now as nullable columns for Part 2.
  - `source` text not null default `'manual'`; `external_ref` text null.
  - Every table has `user_id` referencing `users(id)` on delete cascade.
  - Indexes: `personal_categories_user_idx`, `personal_tags_user_name_uq` on (`user_id`, `lower(name)`), `personal_tx_user_date_idx` (`user_id`, `date`), `personal_tx_wallet_date_idx` (`wallet_id`, `date`), `personal_tx_transfer_idx` (`transfer_id`), and a unique `personal_tx_external_uq` on (`user_id`, `source`, `external_ref`) where `external_ref IS NOT NULL`. `personal_transaction_tags` has primary key (`transaction_id`, `tag_id`) and `personal_tx_tags_tag_idx` on `tag_id`.

- [ ] **Step 1: Write the failing tests**:
  - `the five tables exist with their columns` (PRAGMA table_info for each table, listing names in order);
  - `a sixth type is refused by the CHECK` (insert type `'loan'` → rejects);
  - `two tags differing only in case are refused`;
  - `the same external_ref twice for one user and source is refused, null twice is fine`;
  - `deleting a user removes all five tables' rows` (seedUser, insert one row each, delete the user, count 0).
- [ ] **Step 2: Run** `npm test -w @cc/api -- schema-personal-money`. It should FAIL with "no such table".
- [ ] **Step 3: Write the SQL and the Drizzle tables.** Separate statements with `--> statement-breakpoint`, as in `0026`.
- [ ] **Step 4: Run** `npm test -w @cc/api`. It should PASS, including the untouched `schema-wallets.test.ts` (still nine columns).
- [ ] **Step 5: Commit** `feat(db): personal money tables (0027)`.

### Task 4: Wallet routes and the summary

**Files:**
- Modify: `libs/shared/core/src/api-types.ts` (widen `WalletView`, add the inputs below, add `'IN_USE' | 'DEFAULT_WALLET'` to `ApiErrorCode`)
- Create: `apps/api/src/personal/wallets.ts` (the wallet routes and a `loadCalc(db, userId)` helper); move the two existing wallet handlers out of `routes.ts` and leave their behaviour unchanged
- Create: `apps/api/src/personal/validate.ts` (shared body checks: `parseJson`, `requireDate(v): string` for `YYYY-MM-DD` real dates, `optionalTime`, `name1to40`)
- Modify: `apps/api/src/personal/routes.ts` (mount the wallet routes)
- Test: `apps/api/test/personal-wallets-more.test.ts`, plus `apps/api/test/personal-helpers.ts` (`switchOn(userId)`, `postJson(path, sid, body)`, `addWallet(sid, body)`)

**Interfaces:**
- Consumes: Task 1 (`isCurrencyCode`, `isValidAmount`), Task 2 (`walletBalance`, `walletVndValues`, `vndTotal`, `CalcWallet`, `CalcEntry`), Task 3 tables.
- Produces:
  ```ts
  export type WalletKind = 'everyday' | 'investment';
  export interface WalletView { id: string; name: string; currency: CurrencyCode; balance: number; isDefault: boolean;
    kind: WalletKind; startAmount: number; startDate: string; startCostVnd: number | null; vndValue: number | null;
    icon: string | null; sortOrder: number; archived: boolean; entryCount: number }
  export interface CreateWalletInput { name: string; startAmount: number; currency?: CurrencyCode; kind?: WalletKind; startDate?: string; startCostVnd?: number | null; icon?: string | null }
  export interface UpdateWalletInput { name?: string; startAmount?: number; startDate?: string; startCostVnd?: number | null; icon?: string | null; archived?: boolean; isDefault?: true; kind?: WalletKind; currency?: CurrencyCode }
  export interface PersonalSummary { totalVnd: number; approximate: boolean; perCurrency: { currency: CurrencyCode; balance: number }[]; unratedWalletIds: string[]; month: string; spent: { currency: CurrencyCode; amount: number }[]; income: { currency: CurrencyCode; amount: number }[] }
  ```
  `async function loadCalc(db, userId): Promise<{ wallets: (CalcWallet & row fields)[]; entries: CalcEntry[] }>` takes 2 queries: the wallets joined to their settings, then every entry of the user with only the calc columns. Task 7 reuses it for the summary.
- Routes (queries per call in brackets):
  - `GET /me/personal/wallets` returns `{ wallets: WalletView[] }` ordered by `sortOrder`, then `createdAt` [3].
  - `POST /me/personal/wallets` is #112's route. It also accepts the optional `CreateWalletInput` fields; all other behaviour is unchanged [3].
  - `POST /me/personal/wallets/add` [4] returns `201 { wallet }`.
    - It allows a negative `startAmount` (`isValidAmount` with `allowNegative` and `allowZero`).
    - A non-VND wallet whose `startAmount ≠ 0` needs `startCostVnd`, an integer from 0 to the VND max. Otherwise `startCostVnd` must be absent or null.
    - It becomes the default when the user has none. A unique clash on the default index → `409 ALREADY_HANDLED`.
  - `PATCH /me/personal/wallets/:id` [≤6]:
    - changing `kind` or `currency` with `entryCount > 0` → `409 IN_USE`;
    - `archived: true` on the default → `409 DEFAULT_WALLET`;
    - `isDefault: true` clears the old default and sets this one in one `db.batch`.
  - `POST /me/personal/wallets/reorder` with `{ ids }` [3]. `ids` must be exactly the user's wallet ids, else `422`.
  - `DELETE /me/personal/wallets/:id` [4]:
    - with entries → `409 IN_USE`;
    - the default while other wallets exist → `409 DEFAULT_WALLET`;
    - otherwise it deletes the wallet and its settings.

- [ ] **Step 1: Write the failing tests** in `personal-wallets-more.test.ts`:
  - `/wallets/add makes a USDT investment wallet with a negative start` → 201, wallet `{ currency: 'USDT', kind: 'investment', startAmount: -500, balance: -500, isDefault: false }` when a default already exists;
  - `a non-VND start without startCostVnd is 422, with it the vndValue equals it`;
  - `two parallel /wallets/add for a user with no wallet make one default wallet` (`Promise.all`, then exactly one `isDefault`);
  - `moving startDate after an entry flips its beforeStart and the balance` (insert an entry row directly on 2026-11-12, PATCH startDate to 2026-11-13, balance back to startAmount);
  - `archiving the default is 409 DEFAULT_WALLET; after making another default it works and the wallet shows archived: true`;
  - `kind cannot change once the wallet has an entry` (409 IN_USE);
  - `delete refuses a wallet with entries and removes an empty one`;
  - `reorder with a missing or foreign id is 422; a valid reorder changes the GET order`;
  - `the #112 first-wallet route still refuses a second wallet` (sanity check beside the untouched old test);
  - `another account gets 404 for PATCH, DELETE and reorder with this account's wallet id`;
  - `switch off: 403 on add, PATCH, reorder, DELETE`.
- [ ] **Step 2: Run** `npm test -w @cc/api -- personal-wallets`. The new file should FAIL; the old file should still PASS.
- [ ] **Step 3: Implement the routes** as specified.
- [ ] **Step 4: Run** `npm test -w @cc/api` and `npm run typecheck`. Both should PASS. `personal-wallets.test.ts` must stay unmodified and green.
- [ ] **Step 5: Commit** `feat(api): more wallets, kinds, currencies, archive, reorder`.

### Task 5: Categories and tags

**Files:**
- Create: `apps/api/src/personal/categories.ts`, `apps/api/src/personal/starterCategories.ts`
- Modify: `apps/api/src/personal/routes.ts`, `libs/shared/core/src/api-types.ts`
- Test: `apps/api/test/personal-categories.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface CategoryView { id: string; parentId: string | null; type: 'expense' | 'income'; name: string; icon: string; hidden: boolean; sortOrder: number }
  export interface CategoriesResponse { categories: CategoryView[]; recentIds: string[] } // recentIds: up to 6 most used by typed entries in the last 30 days, most used first
  export interface TagView { id: string; name: string; useCount: number }
  ```
  `STARTER_CATEGORIES` holds the design §5 list, with Vietnamese names and lucide icon names. Đầu tư has the subs Cổ phiếu, Crypto, ETF, Vàng.
- Routes:
  - `GET /me/personal/categories` [3–4]. When the user has no category it seeds the starter set in one `db.batch` and returns it. A concurrent seed must not double the set: check again after the batch, or use a deterministic id per starter (`${userId}:${key}`) with `onConflictDoNothing`.
  - `POST /me/personal/categories` with `{ type, name (1–40), icon, parentId? }` [3–4]. The parent must be the user's own, top-level and of the same type, else `422`.
  - `PATCH /me/personal/categories/:id` with `{ name?, icon?, hidden?, sortOrder? }` [3].
  - `DELETE /me/personal/categories/:id?moveTo=<id>` [≤6]:
    - has children → `409 IN_USE` with `extra: { reason: 'HAS_CHILDREN' }`;
    - in use and no `moveTo` → `409 IN_USE` with `extra: { count }`;
    - `moveTo` must be the user's own, of the same type, not itself and not its own child. Then entries move and the category is deleted in one batch.
  - `GET /me/personal/tags` [2] is sorted by `useCount` descending, then name.
  - `PATCH /me/personal/tags/:id` with `{ name }` [3]. A case-insensitive clash → `409 CONFLICT`.
  - `DELETE /me/personal/tags/:id` [3] removes the tag and its links.

- [ ] **Step 1: Write the failing tests**:
  - `first GET seeds the starter set once, even when called twice in parallel` (count stays the same);
  - `a sub-category must share its parent's type and cannot nest two deep`;
  - `deleting an unused category works; one in use is 409 with the count; with moveTo the entries move`;
  - `moveTo of the other type is 422`;
  - `hiding keeps entries pointing at it`;
  - `recentIds orders by use in the last 30 days and ignores older entries`;
  - `tags: rename clash is 409, delete removes links`;
  - `another account gets 404 for every :id route, and its GET never shows these rows`;
  - `switch off: 403 on all routes`.
- [ ] **Step 2: Run** `npm test -w @cc/api -- personal-categories`. It should FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test -w @cc/api`. It should PASS.
- [ ] **Step 5: Commit** `feat(api): personal categories with starter set, tags`.

### Task 6: Creating, editing, deleting and restoring entries

**Files:**
- Create: `apps/api/src/personal/entries.ts`, `apps/api/src/personal/entryInput.ts` (pure body parsing, unit-testable)
- Modify: `apps/api/src/personal/routes.ts`, `libs/shared/core/src/api-types.ts`
- Test: `apps/api/test/personal-entries.test.ts`

**Interfaces:**
- Consumes: Task 1 (`isValidAmount`), Task 2 (`isBeforeStart`), Task 4 (`validate.ts`), Task 5 (categories).
- Produces:
  ```ts
  export type EntryInput =
    | { type: 'expense' | 'income'; walletId: string; amount: number; categoryId: string; date: string; time?: string | null; note?: string | null; tags?: string[]; excludeFromReports?: boolean }
    | { type: 'transfer'; fromWalletId: string; toWalletId: string; amountSent: number; amountReceived?: number; date: string; time?: string | null; note?: string | null; tags?: string[]; excludeFromReports?: boolean };
  export interface EntryView { id: string; walletId: string; type: PersonalEntryType; amount: number; currency: CurrencyCode; categoryId: string | null;
    transferId: string | null; counterpartWalletId: string | null; date: string; time: string | null; note: string | null; tags: string[];
    excludeFromReports: boolean; source: 'manual'; beforeStart: boolean; createdAt: string }
  export interface EntriesResponse { entries: EntryView[] } // one entry, or both sides of a transfer (out first)
  ```
- Rules:
  - The note is at most 200 characters after trimming; empty means null.
  - Tags: at most 10, each 1–30 characters after trimming, deduplicated case-insensitively. They are upserted by name, so an existing tag is reused whatever its case.
  - `excludeFromReports` defaults to `true` for a transfer and `false` otherwise (W6).
  - Expense and income need a wallet that is the user's own and not archived, and a category of the same type that is not hidden. The amount must pass `isValidAmount` for the wallet's currency.
  - A transfer needs two different wallets, both the user's own and not archived. When the currencies differ, `amountReceived` is required and checked against the receiving currency. When they are the same, it must be absent or equal.
  - The pair shares one new `transfer_id`, with the out-side written before the in-side.
- Routes:
  - `POST /me/personal/transactions` [≤8: guard, wallets, category, tag lookup, one batch] → `201 EntriesResponse`.
  - `PATCH /me/personal/transactions/:id` takes the full `EntryInput` [≤9]. On either side of a transfer it rewrites both rows and their tags in one batch. Changing between transfer and non-transfer → `422`.
  - `DELETE /me/personal/transactions/:id` [≤5] deletes the entry, or both sides of a transfer, with their tag links. It returns `200 EntriesResponse` holding what was deleted.
  - `POST /me/personal/transactions/restore` with `EntriesResponse` [≤8]:
    - re-inserts the entries with the same ids, `createdAt` and tags (by name);
    - every wallet must be the user's own (missing → `404`) and not archived (→ `422`);
    - an id that already exists → `409 ALREADY_HANDLED`;
    - a hidden category is accepted;
    - at most 2 entries, and 2 only as a matching transfer pair.

- [ ] **Step 1: Write the failing tests**:
  - `expense with tags and a time is stored and returned; the wallet balance drops`;
  - `income in a USDT wallet with 12,34 USDT (1234) is accepted; 1.5 is 422`;
  - `an expense with an income category is 422; a hidden category is 422`;
  - `a VND → USDT transfer needs amountReceived; both sides share transferId and default to excluded`;
  - `same-currency transfer with a different amountReceived is 422; from = to is 422`;
  - `editing the in-side of a transfer rewrites both sides`;
  - `turning a transfer into an expense is 422`;
  - `delete of one transfer side removes both and returns both`;
  - `restore puts them back with the same ids and tags; restoring twice is 409`;
  - `restore refuses when the wallet is gone`;
  - `an entry dated before the wallet start is stored with beforeStart: true and leaves the balance`;
  - `a 201-character note, 11 tags or a 31-character tag is 422`;
  - `another account: POST with this account's walletId or categoryId is 404; PATCH/DELETE/restore of this account's entries are 404`;
  - `switch off: 403 on all four routes`.
- [ ] **Step 2: Run** `npm test -w @cc/api -- personal-entries`. It should FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test -w @cc/api`. It should PASS.
- [ ] **Step 5: Commit** `feat(api): personal expense, income and transfer entries with undo`.

### Task 7: The transaction list, quick expenses and the summary

**Files:**
- Create: `apps/api/src/personal/list.ts` (list and summary routes), `apps/api/src/personal/personRows.ts` (reads quick expenses)
- Modify: `apps/api/src/personal/routes.ts`, `libs/shared/core/src/api-types.ts`
- Test: `apps/api/test/personal-list.test.ts`

**Interfaces:**
- Consumes: `findLedger(db, userId)` from `apps/api/src/me/ledger.ts` (import only), Task 2 `sumCounted` / `vndTotal`, Task 4 `loadCalc`, Task 6 `EntryView`.
- Produces:
  ```ts
  export interface PersonRow { kind: 'person'; id: string; tripId: string; date: string; share: number; total: number; note: string; people: string[]; walletId: string; currency: 'VND'; createdAt: string }
  export type ListRow = { kind: 'entry'; entry: EntryView } | PersonRow;
  export interface ListQuery { month?: string; from?: string; to?: string; walletId?: string; categoryId?: string; tagId?: string; type?: 'expense' | 'income' | 'transfer' | 'person'; q?: string }
  export interface ListResponse { rows: ListRow[]; totals: { currency: CurrencyCode; spent: number; income: number }[] }
  ```
- Routes:
  - `GET /me/personal/transactions?…` [≤7: guard, entries of the period, their tags, the ledger lookup, quick expenses, their shares and names].
    - Either `month` (`YYYY-MM`) or `from` + `to` (at most 366 days apart); neither, or a bad value → `422`.
    - Rows run newest first by (`date`, `time`, `createdAt`).
    - A `categoryId` filter includes that category's subs. `q` matches the note, case-insensitively, through SQL `LIKE` with `%` and `_` escaped.
    - Quick-expense rows (W14, W21) come from the user's direct trip (`findLedger`): rows of `transactions` with `type = 'expense'` and `is_latest = 1`, filtered by status the same way `apps/api/src/me/history.ts` filters a person's history (read it and match it), within the period. The `share` is the `transaction_shares.amount` for the ledger's `ownerPid`; `people` are the other participants' names; `walletId` is the default wallet.
    - Quick expenses are included only when there's no `categoryId`, `tagId` or `type` filter other than `person`, the `walletId` filter (if any) is the default wallet, and `q` (if any) matches their description.
    - `totals` = `sumCounted` over the rows. An entry counts when `!excludeFromReports`. A person row counts its `share` as spending.
  - `GET /me/personal/summary?month=YYYY-MM` [≤6] → `PersonalSummary`: `vndTotal` from `loadCalc`, plus the month's `spent` / `income` from the same counting as the list (quick expenses included).

- [ ] **Step 1: Write the failing tests**:
  - `month list is newest first and totals skip excluded rows`;
  - `a transfer counts in totals only when its switch is turned off`;
  - `filters: wallet, category with subs, tag, type, date range, search "phở" matches "Phở bò" but "%" matches only a literal %`;
  - `quick expenses show as person rows with the owner's share, on the default wallet, and count in totals`, seeded through the existing quick-expense route (`POST /api/me/ledger/people` plus the expense route the web uses) so no group code is called in a new way;
  - `quick expenses are hidden by a category filter and by a non-default wallet filter`;
  - `from/to more than 366 days apart is 422; no month and no range is 422`;
  - `summary: VND 5.000.000 + 1.000 USDT bought for 25.000.000 gives totalVnd 30.000.000, approximate, two currency lines`;
  - `summary leaves archived wallets out`;
  - `another account sees only its own rows, never this account's entries or quick expenses`;
  - `switch off: 403 on list and summary`.
- [ ] **Step 2: Run** `npm test -w @cc/api -- personal-list`. It should FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test -w @cc/api`. It should PASS.
- [ ] **Step 5: Commit** `feat(api): personal transaction list with quick expenses, summary`.

### Task 8: One sweep for privacy and the switch

**Files:**
- Test: `apps/api/test/personal-guard-sweep.test.ts`

**Interfaces:**
- Consumes: every route from Tasks 4–7.

- [ ] **Step 1: Write the test.** A table of `[method, pathTemplate, bodyFor(ids)]` covers every new route. One case runs each as a signed-out user (→ 401), a switch-off user (→ 403) and a second switched-on account holding the first account's ids (→ 404 for `:id` routes; for list routes, a 200 without any of the first account's ids in the body). Afterwards a final check confirms the first account's rows are unchanged (row counts and balances).
- [ ] **Step 2: Run** `npm test -w @cc/api -- personal-guard-sweep`. It should PASS. If it fails, fix the route, never the test.
- [ ] **Step 3: Commit** `test(api): personal money privacy and switch sweep`.

### Task 9: Data hooks

**Files:**
- Create: `libs/web/data-access/src/personalMoney.ts`
- Modify: `libs/web/data-access/src/personal.ts` (`useCreateWallet` stays as it is)
- Test: `libs/web/data-access/src/__tests__/personal-money.test.tsx` (same mocking pattern as `personal-wallets.test.tsx`)

**Interfaces:**
- Produces:
  - **Hooks:** `useAddWallet()`, `useUpdateWallet()` (`{ id, input }`), `useReorderWallets()`, `useDeleteWallet()`, `usePersonalSummary(month: string)`, `useCategories()`, `useCreateCategory()`, `useUpdateCategory()`, `useDeleteCategory()` (`{ id, moveTo? }`), `useTags()`, `useRenameTag()`, `useDeleteTag()`, `usePersonalList(query: ListQuery)`, `useCreateEntry()`, `useUpdateEntry()` (`{ id, input }`), `useDeleteEntry()` (returns the `EntriesResponse`), `useRestoreEntries()`.
  - **Query keys:** all under `['me', 'personal', …]`. Every mutation that changes money invalidates wallets, the summary and the list.
  - **Last used wallet:** `readLastWallet(): string | null` and `writeLastWallet(id)` keep it in localStorage under `cc.personal.lastWallet`, wrapped in try/catch, as `personalHint.ts` does.

- [ ] **Step 1: Write the failing tests**:
  - `useCreateEntry posts the body and invalidates wallets, summary and list`;
  - `useDeleteEntry returns the deleted entries so undo can restore them`;
  - `usePersonalList builds the query string from filters, skipping empty ones`;
  - `readLastWallet survives a throwing localStorage`.
- [ ] **Step 2: Run** `npx nx test @cc/web-data-access`. It should FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx nx test @cc/web-data-access` and `npm run typecheck`. Both should PASS.
- [ ] **Step 5: Commit** `feat(web-data): personal money hooks`.

---

## Checkpoint: shape the screens with the owner (stop here)

### Task 10: `/impeccable` design review

- [ ] **Step 1:** Run `npm test`, `npm run typecheck` and `npm run lint`. All must pass before the checkpoint.
- [ ] **Step 2:** Run `/impeccable` on the screens of design §4–6: the wallets page with the pie (W20), the wallet page, the "+" menu, the expense / income form (fast entry), the transfer form, the transaction list with its filter sheet, the settings lists (wallets, categories, tags), the updated first-wallet sheet (currency and kind), and delete with undo. Work at 375px first, from `docs/superpowers/mockups/v7-spending-book.html` and `DESIGN.md`.
- [ ] **Step 3:** Review it live with the owner. Record the approved look as an addendum in the design (§10). **Do not start Task 11 until the owner approves.**

## Stage B: screens (after approval)

Each screen task follows the approved mockup for its look. The behaviour and tests below are fixed by the design. All copy goes in `vi.ts` / `en.ts` with `// REVIEW` on new Vietnamese lines, and each screen has loading (`Skeleton`), empty and error (`InlineError`) states.

### Task 11: `Amount` learns currencies

**Files:** Modify `libs/web/ui/src/components/Amount.tsx`. Test: `libs/web/ui/src/components/__tests__/amount-currency.test.tsx`.
**Interfaces:** `AmountProps` gains `currency?: CurrencyCode` (default `'VND'`, so existing calls render unchanged) and `approximate?: boolean` (prefix `≈ `). Formatting uses `formatMoney`.
- [ ] **Step 1:** Write the failing tests: `renders 1,234.56 USD as "1.234,56 $" in tabular-nums`; `approximate adds ≈`; `no currency prop renders exactly like before (formatVnd)`.
- [ ] **Step 2:** Run `npx nx test @cc/web-ui`. It should FAIL. Then implement, run it again (PASS), and commit `feat(ui): Amount shows any currency`.

### Task 12: Wallets page, wallet page, pie, and the first-wallet sheet

**Files:**
- Create in `libs/web/screens/src/screens/`: `WalletsScreen.tsx`, `WalletScreen.tsx`
- Create in `libs/web/screens/src/components/`: `WalletPie.tsx`, `WalletForm.tsx`
- Modify: `components/FirstWalletSheet.tsx`, `screens/SpendingBook.tsx`, the router in `App.tsx`
- Modify: `docs/navigation-map.md`
- Test: `libs/web/screens/src/screens/__tests__/wallets.test.tsx`

**Interfaces:**
- Consumes: Task 9 hooks and Task 11 `Amount`.
- Routes: `/wallets` and `/wallets/:id`, reachable only with the personal area on. Otherwise they redirect as `/people` does in `App.tsx`.
- `WalletPie({ slices }: { slices: { id: string; name: string; vndValue: number }[] })`:
  - plain SVG, accent tints;
  - at most four slices plus "Khác";
  - leaves out values ≤ 0 (W20);
  - carries a text alternative naming the order.
- The first-wallet sheet keeps every behaviour the existing `spending-book.test.tsx` checks. It adds currency and kind selects (default VND / everyday) and the VND value field for non-VND starts. A non-VND or negative choice is sent to `/wallets/add`; otherwise the sheet keeps calling #112's route, so the old tests' expectations hold.

- [ ] **Step 1:** Write the failing tests:
  - `wallets page shows the ≈ VND total, one line per currency, everyday and investment groups, archived collapsed`;
  - `a USDT wallet without a rate shows "chưa có tỷ giá" and stays out of the total`;
  - `create a second wallet in USD with its VND value`;
  - `archive, restore, make default, reorder`;
  - `delete is offered only for an empty wallet`;
  - `pie leaves out a negative wallet and groups the fifth as Khác`;
  - `switch off: /wallets redirects and no wallet link renders`.
- [ ] **Step 2:** Run `npx nx test @cc/web-screens`. It should FAIL. Implement, then run it again. It should PASS, and `spending-book.test.tsx` must stay untouched and green.
- [ ] **Step 3:** Commit `feat(screens): wallets page, wallet page and pie`.

### Task 13: Entry forms and fast entry

**Files:**
- Create in `libs/web/screens/src/components/`: `AddMenu.tsx`, `EntrySheet.tsx` (expense and income), `TransferSheet.tsx`, `CategoryPicker.tsx`, `TagInput.tsx`
- Modify: the place where "+" opens today's quick expense
- Test: `libs/web/screens/src/components/__tests__/entry-forms.test.tsx`

**Interfaces:**
- `AddMenu` lists expense, income, transfer and with a person (S12). The menu is skipped when the personal area is off.
- `EntrySheet({ type, entry? })` and `TransferSheet({ entry? })` use `Sheet` on a phone and `Modal` on a computer through the existing wrapper.

- [ ] **Step 1:** Write the failing tests:
  - `expense opens with the amount focused, inputMode decimal, text-base, last used wallet and today filled`;
  - `six recent categories come first`;
  - `amount → category → save posts once and closes, the snackbar confirms, the row is in the list`;
  - `USD wallet accepts "12,5"`;
  - `transfer between VND and USDT asks for the received amount; same currency does not`;
  - `the exclude switch starts on for a transfer and off for an expense`;
  - `tags suggest existing ones while typing`;
  - `a 422 from the server shows a plain message and keeps the input`.
- [ ] **Step 2:** Run it. It should FAIL. Implement, then run it again. It should PASS.
- [ ] **Step 3:** Commit `feat(screens): expense, income and transfer forms with fast entry`.

### Task 14: Transaction list, filters, details, delete with undo

**Files:**
- Create in `libs/web/screens/src/screens/`: `TransactionsScreen.tsx`
- Create in `libs/web/screens/src/components/`: `TransactionRow.tsx`, `TransactionFilters.tsx`
- Modify: the "Giao dịch gần đây" block in `SpendingBook.tsx` (the "Tất cả ›" link and rows from `usePersonalList`)
- Test: `libs/web/screens/src/screens/__tests__/transactions.test.tsx`

**Interfaces:** route `/transactions`; month switcher; by day or by category; one month per load with earlier months loading on scroll (S16).

- [ ] **Step 1:** Write the failing tests:
  - `rows grouped by day with a per-currency day total, newest first`;
  - `expense shows "−" and text-danger, income "+" and text-success, transfer "→ wallet" in neutral ink`;
  - `before-start entries carry "Trước ngày bắt đầu ví"`;
  - `quick expenses show "with Minh" and open the existing quick expense`;
  - `filters show as removable pills; no match shows "Xóa bộ lọc"`;
  - `delete asks first, removes the row, Undo within 5 s restores it, after 5 s it is gone`;
  - `deleting one side of a transfer removes both rows`;
  - `on a computer the details open in a Modal`.
- [ ] **Step 2:** Run it. It should FAIL. Implement, then run it again. It should PASS.
- [ ] **Step 3:** Commit `feat(screens): transaction list, filters and undoable delete`.

### Task 15: Settings lists (categories and tags) behind the gear

**Files:**
- Create in `libs/web/screens/src/screens/`: `CategoriesScreen.tsx`, `TagsScreen.tsx`
- Modify: the Sổ chi tiêu header gear menu (S22)
- Test: `libs/web/screens/src/screens/__tests__/categories-tags.test.tsx`

- [ ] **Step 1:** Write the failing tests:
  - `starter set shows grouped by type with Đầu tư's subs`;
  - `rename, hide and add a sub-category`;
  - `removing a used category asks to move or hide, and the move posts moveTo`;
  - `a tag rename that clashes says so`;
  - `removing a tag in use confirms first`.
- [ ] **Step 2:** Run it. It should FAIL. Implement, then run it again. It should PASS.
- [ ] **Step 3:** Commit `feat(screens): categories and tags settings`.

### Task 16: Whole-branch verification and handoff

- [ ] **Step 1:** Run `npm test`, `npm run typecheck` and `npm run lint`. All should PASS with no existing test edited (`git diff main --stat -- '*.test.*'` shows only new files).
- [ ] **Step 2:** Run `npm run e2e -- golden-path` and `npm run e2e -- walkthrough`. Both should PASS.
- [ ] **Step 3:** Apply the migration locally: `npx wrangler d1 migrations apply <db> --local` from `apps/api`.
- [ ] **Step 4:** Run `npm run tunnel` on the fresh build. In the browser, walk through: switch on, a second wallet in USDT, a VND → USDT transfer, an expense, the list, delete with undo. Hand over to the owner for manual testing.
- [ ] **Step 5:** After the owner approves, push `feat/wallets-and-transactions` and open a PR into `main` linking #113 ("Part 1 of 2"). Tick Part 1 in the #113 comment.
