# Group shares in Sổ chi tiêu — Part 2: list, main screen, categories — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. In this repo, implementer work runs through Orca workers (Hydrogen for routine, Neon for complex/risky), per the owner. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sổ chi tiêu shows the owner's group money: richer rows in "Giao dịch gần đây", the transaction list and wallet history, a row sheet for personal extras, group filters, the two group settings and the balance-check prompt; the main screen drops the quick-expense lists. Rows that do not involve the owner never appear.

**Architecture:** The web opts in to Part 1's `groups=show` on the list and on sync. With it, the server sends **every** group row, direct-group expenses included, as `GroupRow` (filtered to "I paid or I have a share"), and stops sending `PersonRow`. One pure filter in `@cc/core` (`filterGroupRows`) serves both the server list and the browser's saved copy, so they agree. Screens render a `BookRow = ListRow | GroupRow` union.

**Tech Stack:** React + react-router, React Query, IndexedDB saved copy (`libs/web/data-access/src/txCopy`), shadcn/ui + Tailwind v4 wrappers (`@cc/web-ui`), vitest + Testing Library, Playwright (`e2e/`).

**Spec:** `docs/superpowers/specs/2026-11-21-group-shares-in-spending-book-design.md` (sections 4.5–4.6, 5, 6, 10). Part 1 plan: `docs/superpowers/plans/2026-11-21-group-shares-part-1-read-in.md` (interfaces it produced).

## The bug this part fixes (owner, 2026-11-21)

"Many transactions not involving me show up" in Sổ chi tiêu. Root causes, both confirmed in code:
1. `loadLedgerRows` (`apps/api/src/personal/personRows.ts`) returns **every** approved expense of the direct group, whatever the owner's share, so `PersonRow`s with share 0 and no payment by the owner reach "Giao dịch gần đây", `/transactions` and the saved copy. Part 1's `loadGroupRows` already filters correctly (I paid or I have a share). **Fix:** with `groups=show`, direct-group expenses come from `loadGroupRows`; `PersonRow` and the sync `ledger` field are no longer used by the new screens (Task 1).
2. "Khoản chi của bạn" in "Chỉ của tôi" (`ExpenseList`, `involves()` at `libs/web/screens/src/components/ExpenseList.tsx:133`) counts an expense **you created** as yours even without a share. This is deliberate Phase 1 behaviour pinned by an existing test (`expense-list.test.tsx` "an expense you added is yours even without a share"). In Sổ chi tiêu this list goes away (Task 7). In groups it stays as is unless the owner decides otherwise (open question, not in this plan; changing it needs an edit to that existing test, which needs the owner's approval).

## Global Constraints

- Same as Part 1 (no Phase 1 table altered, rule-2 files untouched, never edit or delete an existing test, ≤ 50 queries, `requirePersonal`, integer VND, no "ledger" naming for new code).
- Group screens, the group-only Home (`book` false) and the guest path render exactly as today.
- UI: read `DESIGN.md` and `PRODUCT.md`; wrappers first (`Sheet`, `Button`, `Pill`, `Amount`, `Icon`, `Skeleton`, `InlineError`, `Snackbar`); theme tokens only; phones first at 375px, `sm` 640, `lg` 1024; touch targets `min-h-11`; fields `text-base`; money `tabular-nums`; never colour alone (− / + and words).
- Copy in `@cc/web-i18n`: Vietnamese first with `// REVIEW` on each new line, English second. Strings named below are fixed; the rest are the builder's.
- Tests select by `fsl-*` classes and `data-testid`; keep existing ones on the same elements.
- `@cc/web-*` import rules from `CLAUDE.md` (util → i18n → ui / platform → data-access → screens).
- While the owner's tunnel is up, workers do not build or run e2e.

## Review Focus

1. **An expense among other people only** (Minh paid for Minh and Lan, in a trip or in the direct group, even if the owner created it) never appears anywhere in Sổ chi tiêu. → Task 1 API test `direct expense not involving me is not sent`; Task 2 core test; e2e G-04.
2. **Saved copy and server disagree** after a group edit (the copy shows the old amount). → Task 3 test `group key change replaces group rows in the copy`; e2e G-11.
3. **A group row in another wallet's history** after the owner moves it in the sheet: it leaves the default wallet's history and appears in the chosen one, and both balances change. → Task 6 test; e2e G-16.
4. **Archived default wallet / no VND wallet**: rows show with no wallet name and no balance effect; the sheet's wallet picker lists VND wallets only. → Task 6 test `wallet picker lists VND wallets only`.
5. **Group-only user and guest**: no request with `groups=show` is ever made when the book is off, and Home is unchanged. → Task 7 test; e2e G-23, G-24.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/api/src/personal/list.ts`, `sync.ts` (modify) | with `groups=show`: direct expenses as `GroupRow`, no `PersonRow`, no `ledger` |
| `libs/shared/core/src/groupShares.ts` (modify) | `filterGroupRows`, `groupRowsTotals`, `groupRowCategoryId`, `groupRowSentence` data |
| `libs/shared/core/src/copyRows.ts` (modify) | `listFromCopy` returns group rows too |
| `libs/web/data-access/src/txCopy/{store,sync,hooks}.ts` (modify) | `groups` object store, `groupsKey`, `groupRows` from the copy |
| `libs/web/data-access/src/personalMoney.ts` (modify) | `groups=show` on list; new group hooks |
| `libs/web/i18n/src/{vi,en}.ts` (modify) | new copy |
| `libs/web/screens/src/components/GroupTxRow.tsx` (new) | one group row in any list |
| `libs/web/screens/src/components/GroupRowSheet.tsx` (new) | the row sheet |
| `libs/web/screens/src/components/TransactionRow.tsx`, `transactions/groupRows.tsx` (modify) | accept `BookRow` |
| `libs/web/screens/src/screens/{TransactionsScreen,WalletScreen,SpendingBook,Home}.tsx` (modify) | wiring |
| `libs/web/screens/src/components/TransactionFilters.tsx`, `transactions/useTxParams.ts` (modify) | Nhóm filter, show/hide switch |
| `libs/web/screens/src/components/PersonalSettingsMenu.tsx` (modify) | default group category, count loans |
| `libs/web/screens/src/components/BalanceCheckPrompt.tsx` (new) | prompt + sheet |
| `apps/api/src/test/…` (modify, test-only router) | `POST /api/test/personal/off-since` for e2e |
| `e2e/group-shares-*.spec.ts` (new) | section "E2E catalogue" |

---

### Task 0: Shape the screens with the owner (planner, no worker)

- [ ] Run `/impeccable shape` on: the group row (all variants in the 4.1 table), the row sheet, the filter additions, the two settings, the balance-check prompt, at 375px and 1024px, Vietnamese first, against the mocks in `.superpowers/brainstorm/*/content/book-main.html`.
- [ ] Review live with the owner; record decisions in the spec (dated) before Task 5 starts. Tasks 1–4 do not wait for this.

---

### Task 1: API — `groups=show` sends every group row as `GroupRow` (Hydrogen)

**Files:** Modify `apps/api/src/personal/list.ts`, `apps/api/src/personal/sync.ts`. Test: `apps/api/test/personal-group-show.test.ts` (new).

**Interfaces:**
- Produces: with `groups=show`, list `rows` has no `kind: 'person'`; `groupRows` includes direct-group expenses (`isDirect: true`, `source: 'expense'`); totals count them via `groupRowEffect`. Sync with `groups=show` returns `ledger: null` always and `groups.rows` includes direct expenses. Without `groups=show`: unchanged (existing tests stay green).

- [ ] **Step 1: Failing tests:** `direct expense not involving me is not sent` (owner creates a quick expense paid by Minh for Minh+Lan → absent from `rows` and `groupRows`; present today as a `person` row without the flag — assert that too to pin the old path unchanged); `direct expense I paid comes as a group row`; `no person rows with groups=show`; `sync groups=show has no ledger and includes direct expenses`.
- [ ] **Step 2:** run `npx nx run @cc/api:test -- personal-group-show` → FAIL. **Step 3:** implement (drop the `PersonRow` branch and the direct-expense exclusion when `showGroups`). **Step 4:** run it plus `personal-list*.test.ts`, `personal-sync*.test.ts`, `personal-group-*.test.ts` → PASS.
- [ ] **Step 5: Commit** `fix(api): Sổ chi tiêu only shows group money that involves you`.

---

### Task 2: Core — one filter for server and copy (Neon)

**Files:** Modify `libs/shared/core/src/groupShares.ts`, `libs/shared/core/src/copyRows.ts`; `apps/api/src/personal/list.ts` (use the shared filter). Test: `libs/shared/core/test/groupShares-filter.test.ts` (new), and extend nothing existing.

**Interfaces:**
- Produces:

```ts
export type BookRow = ListRow | GroupRow;
export function filterGroupRows(rows: GroupRow[], query: ListQuery, tagNames: Map<string, string>): GroupRow[];
export function groupRowsTotals(rows: GroupRow[], settings: GroupSettingsView, paybacks: Map<string, number>): { spent: number; income: number };
export function groupRowCategoryId(row: GroupRow, settings: GroupSettingsView, fallbackGroupCategoryId: string | null): string | null;
export function compareBookRows(a: BookRow, b: BookRow): number; // date desc, then createdAt desc, entries and group rows interleaved
```

- `filterGroupRows`: drops all when `query.groups !== 'show'`; `assetId` set → none; `type` set and not `'group'`/`'expense'`/`'income'` → none (`expense` keeps rows whose effect is spending, `income` keeps income); `tripId`; `walletId` (row's wallet = `link.walletId ?? default`, so the filter needs the resolved wallet — pass it in `query` resolution, builder's choice of extra param); `categoryId` against `groupRowCategoryId`; `tagId` against `link.tagIds`; `q` accent-insensitive over title, trip name, counterpart/payer name and tag names (reuse `matchesNote`).
- `listFromCopy(snapshot, query, ctx, today)` returns `{ rows: ListRow[]; groupRows: GroupRow[] }` — **check every caller and keep their behaviour** (builder updates `useCopyList` in Task 3).
- `list.ts` uses `filterGroupRows` instead of its inline filter (same results; Part 1 tests stay green).

- [ ] **Step 1: Failing tests** for each filter dimension above, plus `copy and server agree` (build a snapshot and a server-shaped list from the same seed rows; same ids, same totals).
- [ ] **Steps 2–4:** FAIL → implement → `npx nx run @cc/core:test` and `npx nx run @cc/api:test -- personal-group` → PASS.
- [ ] **Step 5: Commit** `feat(core): one group-row filter for list and saved copy`.

---

### Task 3: Data access — saved copy and hooks (Neon)

**Files:** Modify `libs/web/data-access/src/txCopy/store.ts`, `sync.ts`, `hooks.ts`, `libs/web/data-access/src/personalMoney.ts`. Test: `libs/web/data-access/src/__tests__/group-shares-hooks.test.tsx` (new).

**Interfaces:**
- Store: new object store `groups` (keyPath `id`), DB version + 1; state gains `groupsKey: string | null`; `apply` takes `groups?: GroupRow[]` and replaces the store when present.
- Sync: always sends `groups=show` and `groupsKey`; stores `groups.rows` and `groups.key`.
- `useCopyList(query)` → `{ rows; groupRows; ready; opening }`; `usePersonalList(query)` always sends `groups=show`.
- New hooks (React Query; invalidate list, wallet details, summary and request a copy sync on success):
  - `useGroupSettings()` → `GET /api/me/personal/group-settings`
  - `useUpdateGroupSettings()` → `PUT` same
  - `useUpdateGroupLink()` → `PUT /api/me/personal/group-links/:rootId`
  - `useBalanceChecks()` → `GET /api/me/personal/balance-checks`
  - `useAnswerBalanceCheck()` → `POST /api/me/personal/wallets/:id/balance-check`
- [ ] **Step 1: Failing tests:** `group key change replaces group rows in the copy`; `copy list returns group rows filtered like the server`; each hook calls the right URL and invalidates; turning the book off deletes the `groups` store with the copy.
- [ ] **Steps 2–4:** FAIL → implement → `npx nx run @cc/web-data-access:test` → PASS (existing txCopy tests unchanged).
- [ ] **Step 5: Commit** `feat(web): saved copy and hooks carry group rows`.

---

### Task 4: Copy (Hydrogen)

**Files:** Modify `libs/web/i18n/src/vi.ts`, `libs/web/i18n/src/en.ts`. Test: existing i18n key-parity test covers it.

Keys (Vietnamese `// REVIEW`, then English):
`groupRow.yourShare` "phần của bạn" / "your share" · `groupRow.youPaid` "Bạn trả {total} · {rest} mọi người nợ bạn" / "You paid {total} · {rest} owed to you" · `groupRow.paidBy` "{name} trả" / "{name} paid" · `groupRow.fund` "Vào quỹ nhóm" / "Into the group fund" · `groupRow.payment` "Thanh toán" / "Payment" · `groupRow.paymentTo` "Bạn trả {name}" / "You paid {name}" · `groupRow.paymentFrom` "{name} trả bạn" / "{name} paid you" · `groupRow.pending` "Chờ duyệt · chưa tính" / "Waiting for approval · not counted" · `groupRow.openInGroup` "Xem trong nhóm" / "Open in the group" · `groupRow.sheetTitle` "Khoản từ nhóm" / "From a group" · `groupRow.editInGroup` "Số tiền và người chia chỉ sửa được trong nhóm." / "Amount and people are edited in the group." · `filters.group` "Nhóm" / "Group" · `filters.showGroupRows` "Hiện khoản từ nhóm" / "Show group items" · `settings.groupCategory` "Danh mục cho khoản nhóm" / "Category for group items" · `settings.countLoans` "Tính khoản vay vào chi tiêu" / "Count loans in spending" · `balanceCheck.question` "Số dư có khớp với ngân hàng không?" / "Does the balance match your bank?" · `balanceCheck.enter` "Nhập số dư thật" / "Enter the real balance" · `balanceCheck.skip` "Bỏ qua" / "Skip" · `balanceCheck.saved` "Đã điều chỉnh số dư" / "Balance adjusted".

- [ ] Add keys; run `npx nx run @cc/web-i18n:test` → PASS; commit `feat(i18n): copy for group rows in Sổ chi tiêu`.

---

### Task 5: Group row component (Hydrogen, after Task 0)

**Files:** Create `libs/web/screens/src/components/GroupTxRow.tsx`; modify `TransactionRow.tsx` (dispatch `kind: 'group'` to it). Test: `libs/web/screens/src/components/__tests__/group-tx-row.test.tsx` (new).

**Interfaces:** `GroupTxRow({ row, wallets, categories, settings, onOpen }: { row: GroupRow; wallets: WalletDetailView[]; categories: CategoryView[]; settings: GroupSettingsView; onOpen(row: GroupRow): void })`. Root `button` with class `fsl-tx-row fsl-tx-row--group`, `data-testid="tx-row-g-{row.id}"`; trip name as a `Pill`; amount `−{myShare}` (`text-danger`, with "−") for spending, neutral ink for movements, `+` for income; "phần của bạn" under the amount when `total !== myShare` and source is expense; pending rows at reduced emphasis but AA contrast, with `groupRow.pending`; meta line per 4.1 table using Task 4 keys.

- [ ] **Step 1: Failing tests:** one per 4.1 row (someone else paid; I paid with share; I paid not in it; fund; payment out; payment in; pending; says_paid; loan lent; loan borrowed), asserting visible text and sign, never colour only.
- [ ] **Steps 2–4:** FAIL → implement → `npx nx run @cc/web-screens:test -- group-tx-row` → PASS.
- [ ] **Step 5: Commit** `feat(web): group rows in the transaction list`.

---

### Task 6: The row sheet (Neon, after Task 0)

**Files:** Create `libs/web/screens/src/components/GroupRowSheet.tsx`. Test: `__tests__/group-row-sheet.test.tsx` (new).

**Interfaces:** `GroupRowSheet({ row, open, onClose }: { row: GroupRow | null; open: boolean; onClose(): void })`, built on the `Sheet` wrapper, `data-testid="group-row-sheet"`. Shows group name, date, the outcome sentence, `groupRow.editInGroup`; pickers for category (existing category picker component), tags (existing tag input), wallet (VND, non-archived only), the report switch; saves each change with `useUpdateGroupLink`; "Xem trong nhóm" → `ledgerDetailsPath(row.tripId, kind, row.id)` (kind `expense` / `payment` / `income` by source). Focus moves in on open and back on close.

- [ ] **Step 1: Failing tests:** sets category → PUT body `{ categoryId }`; `wallet picker lists VND wallets only`; tags replace the set; report switch; "Xem trong nhóm" link target for each source; no amount field.
- [ ] **Steps 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(web): personal extras sheet for group rows`.

---

### Task 7: Wire the screens (Neon, after 3, 5, 6)

**Files:** Modify `TransactionsScreen.tsx`, `transactions/groupRows.tsx` (day / category grouping takes `BookRow[]`, totals per group include `groupRowsTotals`), `WalletScreen.tsx` (history includes group rows whose resolved wallet is this wallet), `SpendingBook.tsx` (`BookRecent` merges `rows` and `groupRows` by `compareBookRows`, first `limit`), `Home.tsx` (when `book` is true, render neither `ExpenseList` nor `PaymentsList`, on phone and wide). Test: `__tests__/group-shares-screens.test.tsx` (new).

- [ ] **Step 1: Failing tests:** recent list interleaves entries and group rows by date; `/transactions` by day and by category include group rows and their totals; wallet history shows only rows on that wallet; Home with `book` true has no `fsl-expense-list` / `fsl-payments`; Home with `book` false unchanged and **makes no `groups=show` request**; tapping a group row opens the sheet.
- [ ] **Steps 2–4:** FAIL → implement → `npx nx run @cc/web-screens:test` → PASS (all existing screen tests unchanged).
- [ ] **Step 5: Commit** `feat(web): group money on the Sổ chi tiêu screens`.

---

### Task 8: Filters (Hydrogen, after 7)

**Files:** Modify `TransactionFilters.tsx`, `transactions/useTxParams.ts`. Test: `__tests__/group-filters.test.tsx` (new).

URL params `trip=<tripId>` and `groups=hide`; "Nhóm" picker lists the trips present in the user's group rows (names from rows), the direct group as "Với người khác"; switch "Hiện khoản từ nhóm" on by default; active ones become removable pills like the others; "Xóa bộ lọc" clears them.

- [ ] Tests (pick group → only its rows; hide → none; pills remove; params survive reload) → implement → PASS → commit `feat(web): filter Sổ chi tiêu by group`.

---

### Task 9: Settings (Hydrogen, after 3)

**Files:** Modify `PersonalSettingsMenu.tsx`. Test: `__tests__/group-settings-menu.test.tsx` (new).

Two rows: "Danh mục cho khoản nhóm" (opens the category picker, expense categories) and "Tính khoản vay vào chi tiêu" (switch, off by default), via `useGroupSettings` / `useUpdateGroupSettings`.

- [ ] Tests (shows current values; change sends PUT; switch is a real switch with `aria-checked`) → implement → PASS → commit `feat(web): group settings in Sổ chi tiêu`.

---

### Task 10: Balance-check prompt (Hydrogen, after 3)

**Files:** Create `BalanceCheckPrompt.tsx`; modify the wallets page screen and `WalletScreen.tsx` to render it. Test: `__tests__/balance-check-prompt.test.tsx` (new).

One line per listed wallet (`useBalanceChecks`), "Nhập số dư thật" opens a `Sheet` with the amount field (`text-base`, `inputMode="numeric"`), saving calls `useAnswerBalanceCheck` and shows `balanceCheck.saved` in a `Snackbar`; "Bỏ qua" calls it with `skip`. Hidden when the list is empty.

- [ ] Tests (hidden when empty; enter amount → POST `{ actual }`; skip → POST `{ skip: true }`; line disappears after) → implement → PASS → commit `feat(web): balance check after turning Sổ chi tiêu back on`.

---

### Task 11: E2E (Neon, after 7–10; planner runs them)

**Files:** Create the four specs below; modify the test-only router in `apps/api` (find where `/api/test/login` is defined; only the `api-e2e` server mounts it) to add `POST /api/test/personal/off-since { days }` which sets the caller's `personal_group_settings.disabled_at` to `now − days` and `reenabled_at = now`. Seed through the real UI or the real API as the user would (create group, add people, add expenses, approve, pay); never through SQL from the spec.

- [ ] Write the specs; the planner builds and runs `npm run e2e -- group-shares` and the two gate specs.
- [ ] Commit `test(e2e): group shares in Sổ chi tiêu`.

### Task 12: Gate (planner)

- [ ] `npm test`, `npm run typecheck`, `npm run lint`, `npm run e2e -- golden-path`, `WALKTHROUGH=1 npm run e2e -- walkthrough`, `npm run e2e -- spending-book`, `npm run e2e -- quick-expense`, `npm run e2e -- group-shares` → all pass. Push, PR into `main`, tunnel, owner test.

---

## E2E catalogue

Actors: **Nhan** (owner; Sổ chi tiêu on; VND wallet "Techcombank", default, start date = the 1st of last month; a second VND wallet "Tiền mặt"; one USD wallet), **Minh** (signed-in member), **Lan** (a name nobody has claimed), **Hùng** (signed-in member), **Khách** (guest on the group link). Each test runs on `vi-phone` (375px) and `en-desktop` (1024px) unless marked; screenshots saved for the owner.

### `e2e/group-shares-list.spec.ts` — what appears and how it counts

| ID | Use case | Expect |
|---|---|---|
| G-01 | Trip "Đà Lạt": Hùng pays a 240.000₫ taxi split Nhan + Hùng + Minh | Row "Taxi" with pill "Đà Lạt", "Hùng trả", −80.000₫ "phần của bạn"; Techcombank balance unchanged; month spending +80.000₫ |
| G-02 | Nhan pays a 300.000₫ dinner split three ways | −100.000₫; "Bạn trả 300.000₫ · 200.000₫ mọi người nợ bạn"; Techcombank −300.000₫; "Mọi người nợ bạn" +200.000₫ |
| G-03 | Nhan pays 150.000₫ for Minh + Lan only | Neutral row, no spending; Techcombank −150.000₫ |
| G-04 | Minh pays 90.000₫ for Minh + Lan, in the trip **and** as a quick expense Nhan created | Neither row appears in "Giao dịch gần đây", `/transactions`, wallet history or search (**the reported bug**) |
| G-05 | Minh pays Nhan back 200.000₫, Nhan confirms | "Minh trả bạn" "Thanh toán", +200.000₫ neutral ink; not income; Techcombank +200.000₫ |
| G-06 | Nhan pays Hùng 80.000₫ (VietQR flow), Hùng confirms | "Bạn trả Hùng", −80.000₫ neutral; not spending |
| G-07 | Sport group "Cầu lông T5" with a fund: Nhan pays 500.000₫ into the fund; the fund pays a 400.000₫ court | "Vào quỹ nhóm" −500.000₫ counted as spending; the court never appears |
| G-08 | A planning (not yet played) session in the sport group | Not shown |
| G-09 | A trip expense dated before Techcombank's start date | Listed with the "before start" pill; balance unchanged |
| G-10 | Main screen with the book on | No "Khoản chi của bạn" / "Các khoản đã trả của bạn"; "Giao dịch gần đây" shows the newest group and personal rows interleaved; "Tất cả ›" opens `/transactions` |

### `e2e/group-shares-changes.spec.ts` — the group changes, the book follows

| ID | Use case | Expect |
|---|---|---|
| G-11 | Hùng edits the taxi to 300.000₫ | After reload (and in the offline copy: search "Taxi") Nhan's share shows −100.000₫ |
| G-12 | Khách adds a 60.000₫ expense with Nhan in it (pending) | Greyed "Chờ duyệt · chưa tính", not in totals; after Minh approves, counted |
| G-13 | Hùng disables the taxi, then enables it | Row disappears, then returns |
| G-14 | A new name "Nhan" in a second trip (unclaimed) has expenses | Nothing appears; after Nhan claims the name, the rows appear without other action |
| G-15 | Nhan is merged from a duplicate name into the claimed one | Rows of both names appear once |

### `e2e/group-shares-extras.spec.ts` — personal extras, settings, filters

| ID | Use case | Expect |
|---|---|---|
| G-16 | Open the dinner row: set category "Ăn uống", tag "#dalat", wallet "Tiền mặt" | Sheet saves; row shows the category; Techcombank back +300.000₫, Tiền mặt −300.000₫; the row moves to Tiền mặt's history |
| G-17 | Then Minh edits the dinner amount | Category, tag and wallet survive |
| G-18 | "Xem trong nhóm" from the sheet | Opens the expense in "Đà Lạt"; no amount field in the sheet |
| G-19 | Settings: default group category "Du lịch" | Rows without their own category show "Du lịch"; G-16's row keeps "Ăn uống" |
| G-20 | Filter "Nhóm: Đà Lạt", then "Hiện khoản từ nhóm" off, then search "Đà Lạt" | Only that trip's rows; then no group rows; search finds rows by group name; pills remove each |
| G-21 | Loans setting on (a loan created through the API, since the Vay/Nợ form is Part 3) | The month totals change as the spec's section 5 says; off again → back |
| G-22 | Default wallet switched to the USD wallet | Group rows stay on a VND wallet; the sheet lists VND wallets only |

### `e2e/group-shares-guard.spec.ts` — who sees what (phone only unless marked)

| ID | Use case | Expect |
|---|---|---|
| G-23 | Hùng (book off) opens Home and the trip | Today's Home with "Khoản chi của bạn"; no request contains `groups=show`; trip screens unchanged |
| G-24 | Khách on the group link: pick name, see what they owe, pay | Exactly as `golden-path`; no personal requests |
| G-25 | Minh with the book on sees only Minh's own shares, never Nhan's extras (category, tags, wallet) | API and screen |
| G-26 | Nhan turns the book off, `off-since { days: 2 }`, turns it on | Balance-check line on each everyday wallet; enter the real balance → one adjustment, not in spending; the line goes; "Bỏ qua" on another wallet removes its line |
| G-27 | Off then on within an hour | No balance-check line |

Left to unit/API tests (already covered or cheaper there): query counts, rounding-on groups, `says_paid` greying, payback matching across months, privacy 404s.
