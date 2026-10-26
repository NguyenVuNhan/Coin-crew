# Sport Group Fund — Design

Date: 2026-10-26 · Status: draft for review · Branch: `feat/sport-group-fund`, cut from `feat/auto-split-people-picker` (not on `main` yet; it reshaped the expense form this feature edits) · Wireframes: [v5-group-fund.html](superpowers/mockups/v5-group-fund.html)

---

## 1. Intent & Why

Badminton clubs (and other sport groups) keep a **group fund** (Quỹ nhóm) beside per-session bill splitting:

1. **Walk-in players** (khách vãng lai) pay an admin a flat fee on the spot, and the admin puts it in the fund.
2. **Members or sponsors** give money to the club (tài trợ / đóng quỹ).
3. The fund later **pays for club costs**: drinks after a game, a small party, a box of shuttlecocks.

Today the app has nowhere to put this money. Admins track it on paper, and paying for drinks "from the fund" has to be faked as an expense somebody paid.

### Decisions (from the brainstorm)
- **One shared fund per sport group, kept by the admins.** No per-person holder, no handing cash between admins.
- **Income is a gift to the group.** It never changes anyone's personal balance and never counts as credit against their future bills.
- **Spending is all or nothing.** An admin picks **Group fund** in *Paid by*; the whole expense comes out of the fund and nobody owes a share. Subsidising part of a bill means recording two expenses (one paid by the fund, one split as usual).
- **The fund never goes below 0₫.** Every write that lowers it is checked, in the form and in the API.
- **Sport groups only** (`preset === 'sport'`).
- **Admins only** (organiser or admin) add, edit, disable, enable and roll back income, and do any write on a fund-paid expense. Everyone who can see the group sees the fund balance and the income rows.
- **Income is added from the existing add screen**, behind an *Expense | Fund income* switcher. No second button in the bottom bar.
- **Category is reserved, not built:** income stores `meta_json = {"category": null}`; there is no category UI.
- **No SQL migration.**

### Success criteria
- Xanh (admin) records "Thu 2 khách vãng lai" 200.000₫: **+ Add → Fund income → 200k → note → Add to fund**. The fund pill shows 200.000₫ and nobody's balance, transfers or trip-list balance changes.
- Xanh records "Nước sau trận" 150.000₫ with *Paid by: Group fund*. The fund drops by 150.000₫, the group total rises by 150.000₫, and nobody's balance or transfers change.
- An amount larger than the fund is refused by the form (Save disabled, inline reason) and by the API (`409 FUND_SHORT`).
- Disabling or lowering an income whose money is already spent is refused, with the amount already spent.
- Non-admins and non-sport groups see no switcher and no *Group fund* option; the API answers their attempts with `403 FORBIDDEN`.
- `computeBalances`, `suggestTransfers` and `pairwiseTransfers` are not modified, and their existing tests pass unchanged.
- At 375px: no horizontal scroll (`scrollWidth <= innerWidth`), every touch target at least 44×44px, every text input 16px (`--text-input`).
- `scaffold.test.tsx` passes: `en.ts` and `vi.ts` have the same keys, and every new Vietnamese string ends with `// REVIEW`.

---

## 2. Goals & Non-Goals

**Goals**
- Fund income as a new transaction type with edit history, disable/enable and roll back.
- Fund-paid expenses through *Paid by: Group fund*.
- One fund balance, shown to everyone in a sport group.
- Admin-only writes, enforced in `can()` and in every route.

**Constraints**
- Zero new npm dependencies, in every workspace.
- Whole-đồng integer maths only (`parseVnd`, `formatVnd`).
- Phone first at 375px; inline Lucide SVGs in `icons.tsx`; i18n parity between `en.ts` and `vi.ts`.

**Non-goals**
- Partial subsidy (the fund paying part of one expense).
- Tracking which admin physically holds the cash, or moving cash between admins.
- Paying a member back from the fund as a tracked transfer. If a member paid at the counter with their own money, an admin pays them back in cash and then records the expense as *Paid by: Group fund*; or the expense is recorded as paid by that member and split as usual.
- Category UI, fund reports or export, tournament fees.
- The fund in trip (non-sport) groups.
- Hard-deleting income (it is only ever disabled).
- Guests or non-admin members adding income.

---

## 3. Accounting Model

There are two ledgers, and they never touch.

| | Personal ledger (`computeBalances`) | Fund ledger |
|---|---|---|
| What it answers | Who owes whom | How much group money exists |
| Expense paid by a person | Payer +amount, each share −share | No change |
| Payment | From +amount, to −amount | No change |
| Fund income (approved) | **No change** | +amount |
| Fund-paid expense (approved) | **No change** (it never reaches `computeBalances`) | −amount |

- **Fund balance** = Σ approved income − Σ approved fund-paid expenses. Disabled, superseded, pending and rejected items count as 0. (Fund-paid expenses are never pending, because only admins, who are members, create them.)
- **Zero-sum is kept** because a fund-paid expense has no shares and is skipped entirely when the personal ledger is built (§5.3). Neither side touches a person.
- **Group total** (`trip.total`) still adds up approved expenses, fund-paid ones included. Income is not part of it.
- **Invariant:** after every committed write, fund balance ≥ 0. Checked read-then-write (§9.10).

---

## 4. Data Model (no migration)

`transactions.type` is plain `text` in D1; `0004_unified_transactions.sql` has no CHECK constraint, so the allowed values live only in Drizzle. The Drizzle enum in `apps/api/src/db/schema.ts` gains `'income'`.

### 4.1 Income row (`type = 'income'`)

| Column | Value |
|---|---|
| `amount` | Whole đồng, 1 … `MAX_AMOUNT` |
| `spent_on` | `YYYY-MM-DD` |
| `description` | The note, 1–80 characters after trimming |
| `payer_id` | The admin who **first added** it. Copied unchanged into every later version; read as "Added by" |
| `to_id` | `null` |
| `split_mode` | `'equal'` (the column default; unused) |
| `status` | `'approved'`, `'disabled'` or `'superseded'` |
| `disabled_by_user_id` | Who disabled it |
| `created_by_participant_id` | Who wrote **this version** (the editor, for edits and roll backs) |
| `root_id` / `parent_id` / `is_latest` | Versioning exactly as expenses: an edit or roll back supersedes the latest row and inserts a new one |
| `meta_json` | `{"category": null}` |

Income has no `transaction_shares` rows.

### 4.2 Fund-paid expense (`type = 'expense'`)

| Column | Value |
|---|---|
| `payer_id` | The admin who recorded it. The column is NOT NULL; the UI never shows this person as the payer |
| `split_mode` | `'equal'` |
| `meta_json` | `{"paidFromFund": true}` |
| shares | None |

Everything else (status, versioning, history, roll back) is the same as any expense. The flag lives in `meta_json` because no migration is needed, roll back already copies `meta_json`, and edits already write it from the request.

---

## 5. Core (`@fsl/core`)

### 5.1 New `packages/core/src/fund.ts`

```ts
export type IncomeStatus = 'approved' | 'disabled';

export interface LedgerIncome { id: string; amount: number; status: IncomeStatus }
export interface FundSummary { balance: number; added: number; spent: number }

/** A fund-paid expense: the whole amount came out of the group fund and nobody owes a share. */
export function isFundPaid(e: { meta?: ExpenseMeta | null }): boolean;

/** What one item does to the fund balance: +amount for approved income, −amount for an approved fund-paid expense, else 0. */
export function fundEffect(item: { kind: 'income' | 'expense'; amount: number; status: string; meta?: ExpenseMeta | null }): number;

/** added = Σ approved income; spent = Σ approved fund-paid expenses; balance = added − spent. */
export function fundSummary(incomes: LedgerIncome[], expenses: { amount: number; status: string; meta?: ExpenseMeta | null }[]): FundSummary;
```

The API's fund check is `balance − fundEffect(before) + fundEffect(after) >= 0`, where `before` is the row being replaced (or nothing, for a new row) and `after` is the row about to be written.

`index.ts` re-exports `fund.ts`.

### 5.2 `permissions.ts`
New action `'manage_fund'`: `isMember && isAdmin` (admin or organiser). It is checked by every income route and by every write on a fund-paid expense (§6.2).

### 5.3 What stays the same
`computeBalances`, `suggestTransfers`, `pairwiseTransfers`, `computeShares` and `computeSportShares` are not changed. Fund-paid expenses are filtered out before they reach the ledger functions (§6.3).

### 5.4 `api-types.ts`

```ts
// ApiErrorCode gains:
| 'FUND_SHORT'

// ActivityAction gains:
| 'income_added' | 'income_edited' | 'income_disabled' | 'income_enabled' | 'income_rolled_back'

export interface ExpenseMeta {
  sport?: ExpenseSportMeta;
  /** The whole expense came out of the group fund: no shares, and it stays off the personal ledger. */
  paidFromFund?: boolean;
}

export interface IncomeInput {
  amount: number;
  /** YYYY-MM-DD */
  spentOn: string;
  /** 1–80 characters. */
  description: string;
  /** Reserved for categories; v1 accepts only null or leaving it out. */
  category?: null;
}

export interface IncomeHistoryItem {
  id: string; amount: number; spentOn: string; description: string;
  /** Who wrote this version. */
  createdById: string;
  createdAt: string;
}

export interface IncomeView {
  id: string; rootId: string; amount: number; spentOn: string; description: string;
  /** The admin who first added it. */
  addedById: string;
  /** Who wrote the latest version. */
  createdById: string;
  createdAt: string;
  status: IncomeStatus;
  disabledByName: string | null;
  meta: { category: string | null };
  /** Older versions, newest first. */
  history: IncomeHistoryItem[];
}

// TripView gains:
/** Sport groups only; null otherwise. Left out by an older server: read it as null. */
fund?: { balance: number; added: number; spent: number; incomes: IncomeView[] } | null;
```

`TripSnapshot` is `Omit<TripView, …>`, so it carries `fund` with no extra change.

---

## 6. API

### 6.1 Income routes — new `apps/api/src/fund/routes.ts`, mounted in `app.ts`

Every route: `resolveActor`, `assertWritable` (archived groups refuse writes), the group must be a sport group (`403 FORBIDDEN` otherwise), then `ensure(actor, 'manage_fund')`. `:iid` matches the latest income row by its id or its root id, like the expense routes.

| Route | Does | Fund check | Response |
|---|---|---|---|
| `POST /trips/:id/fund/incomes` | Inserts an approved income (`payer_id` = actor) | none (only adds) | `201 { incomeId }` |
| `PATCH /trips/:id/fund/incomes/:iid` | New version with the new amount, date and note; keeps status and `payer_id` | yes | `200 { incomeId, rootId }` |
| `POST …/:iid/disable` | `approved` → `disabled`, records `disabled_by_user_id` | yes | `200 { ok: true }` |
| `POST …/:iid/enable` | `disabled` → `approved` | none (only adds) | `200 { ok: true }` |
| `POST …/:iid/rollback` `{ targetHistoryId }` | Copies an older version (amount, date, note, meta) as the new latest; keeps status and `payer_id` | yes | `200 { incomeId, rootId }` |

- **Validation** (`422 VALIDATION`): `amount` a safe integer from 1 to `MAX_AMOUNT`; `spentOn` matches `YYYY-MM-DD`; `description` 1–80 characters after trimming; `category` absent or `null`.
- **Already handled** (`409 ALREADY_HANDLED`): disabling a disabled income, enabling an approved one.
- **Fund check** (`409 FUND_SHORT`): run before the batch is written, as in §5.1.
- **Activity:** `income_added`, `income_edited`, `income_disabled`, `income_enabled`, `income_rolled_back`, each with `details: { description, amount }`; roll back adds `targetHistoryId`. Written through `commitTripWrite`, which also bumps the trip version.

### 6.2 Changes to `apps/api/src/expenses/routes.ts`

- **Validation.** When `meta.paidFromFund === true`:
  - `entries` must be `[]`, `mode` must be `'equal'`, and `meta.sport` must be absent (`422 VALIDATION` otherwise).
  - `computeShares` is skipped; the expense gets no shares.
  - `payerId` from the request is ignored; `payer_id` is the actor.
  - Any other value of `paidFromFund` than `true` or absent is `422`.
- **Every write on a fund-paid expense needs `manage_fund`** and a sport group. A write "on a fund-paid expense" is one where the latest version, the new version or the roll back target has `paidFromFund`. That covers POST, PATCH, roll back, disable, enable and DELETE. The existing creator-only rule for edit, roll back and delete still applies on top.
- **Fund checks:** POST (`−amount`), PATCH and roll back (`fundEffect(head)` → `fundEffect(new)`), enable (`−amount`). Disable and delete only return money, so they skip it.
- **Activity:** `expense_added` and `expense_edited` add `paidFromFund: true` to `details` when it is set, so the feed can say "paid … from the fund".

### 6.3 Snapshot (`apps/api/src/trips/snapshot.ts`)

- `type = 'income'` rows: the latest versions become `IncomeView`s (newest first by `createdAt`); older versions become `history`, grouped by `root_id`, newest first. `addedById` comes from `payer_id`.
- `disabledByName` for income uses the same user lookup as expenses (the income rows' `disabled_by_user_id`s join the list).
- `toLedger` skips expenses where `isFundPaid(e)`, whatever the group's preset. This one filter keeps balances, suggestions, `myBalance` (`view.ts`) and the trip list's balance (`GET /trips`) free of fund-paid expenses.
- `fund` is `{ ...fundSummary(incomes, expenses), incomes }` for sport groups and `null` otherwise.
- `trip.total` is unchanged.

### 6.4 Not changed
Approvals (`view.ts`), payments, bank, participants, merge and the trip list routes need no change.

---

## 7. Web

Wireframes for every item: [v5-group-fund.html](superpowers/mockups/v5-group-fund.html). No new design tokens: income amounts use `--color-success` (emerald-700, 5.5:1 on white), fund-paid totals use `--color-text-subtle`. One new icon, Lucide `piggy-bank`, added to `icons.tsx` as `piggyBank`.

### 7.1 Who sees what

| Thing | Who | When |
|---|---|---|
| *Expense \| Fund income* switcher | Admins | Sport group, adding a new item, group not archived |
| *Group fund* in *Paid by* | Admins | Sport group (and always when editing a fund-paid expense) |
| Fund pill | Everyone, including guests and the view-only link | `view.fund` is set and there is any income or any fund-paid expense |
| *Add to fund* in the fund sheet | Admins | Group not archived |
| Edit / Disable / Enable / Roll back on income | Admins | Group not archived |

`?type=income` from a non-admin, or in a non-sport group, is ignored: the expense form shows as today.

### 7.2 Add screen (`ExpenseForm.tsx` hosts; new components do the work)
- **New `EntryTypeSwitch`** at the top: a `role="tablist"` with two 44px tabs, styled like the split picker track. The tab is kept in the URL (`/t/:id/expenses/new?type=income`, replaced in history, not pushed), so refresh and back keep it and the fund sheet can link straight to it. Screen title: *Add expense* or *Add to fund*.
- **New `IncomeForm`**: Amount (16px, `parseVnd`, live "= 200.000₫" preview, the same hint as the expense amount), Date, Note (1–80). The bottom bar button is *Add to fund* (new) or *Save changes* (edit). Editing opens at the new route `/t/:id/fund/:incomeId/edit`, without the switcher.
  - Editing an approved income can't go below what is already spent: the form works out `minimum = amount − balance` and, when the typed amount is lower, shows "Keep at least {minimum}: the rest is already spent." with Save disabled.
- `ExpenseForm.tsx` is already 1,464 lines, so the income form and the fund panel are separate components; `ExpenseForm.tsx` only wires them in.

### 7.3 *Paid by: Group fund* (expense form)
- *Paid by* gets a first option, **Group fund · {balance}**, for admins in sport groups. Its select value is a UI-only constant; it is never sent.
- Choosing it:
  - replaces the whole split section (the *Split between* line, the split picker and the rows) with the new **`FundPaidPanel`**: "Paid from the group fund. Nobody owes a share." and "Fund after this: {balance − amount}";
  - turns a sport cost card into the plain Amount field, carrying over the sport total if one was typed;
  - keeps the hidden split state, so choosing a person again restores it.
- Amount over the fund (counting this expense's own amount when editing an approved one): the panel shows "The fund has only {available}. Lower the amount or choose who paid." and Save is disabled.
- Submit sends `{ description, amount, spentOn, payerId: me, mode: 'equal', entries: [], meta: { paidFromFund: true } }`.
- Editing a fund-paid expense needs `edit_expense` **and** `manage_fund`; without both the form shows the existing "not yours" screen.

### 7.4 Expense list (`ExpenseList.tsx`)
- One feed: `view.expenses` and `view.fund.incomes` merged, newest first by `createdAt`.
- **New `IncomeRow`:** note; subline "Added to fund · by {name}" ("by you" for me); amount "+200.000₫" in `--color-success`, tabular, right-aligned. Disabled: struck through with the *Disabled* pill and "Disabled by {name}", like expenses. The "+" and the words carry the meaning, not the colour alone.
- **Fund-paid expense row** (`ExpenseRow.tsx`): subline "Paid from group fund"; the full amount in `--color-text-subtle`, because it is nobody's share.
- **Mine** filter: income I added; fund-paid expenses I recorded.
- **Empty state:** shown only when there are no expenses **and** no income.
- **Row shortcuts:** new `incomeActions()` in `rowActions.ts` (Edit, Disable or Enable) for admins. `expenseActions()` offers nothing on a fund-paid expense unless the person has `manage_fund`.
- Tapping an income row opens its details.

### 7.5 Fund pill and sheet (new `FundPill`)
- **Pill:** a flat 48px full-width bar on `--color-surface-muted` (no border, no shadow, so it does not read as a second card): piggy-bank icon, "Group fund", balance (tabular), chevron. Placed directly under `BalanceCard` on `MemberTrip` and `GuestTrip` (left column from 1024px), and at the top of `ViewOnlyTrip`, which has no balance card. On `MemberTrip` it shows even before the first expense if there is income. A balance of 0₫ is muted; a balance below 0₫ (only possible after the race in §9.10) is in `--color-danger`.
- **Sheet** (existing `Sheet`): "Group fund", the balance, *Added* (+650.000₫), *Spent* (−250.000₫), *Kept by the admins* (their names), the footnote "Only admins add or spend fund money.", and for admins an **Add to fund** button that opens `?type=income`.
- **Empty sheet** (balance 0₫): "The fund is empty right now." / "Money added by walk-ins or gifts shows here." plus the admin button.

### 7.6 Details
- **New `IncomeDetails`**, route `/t/:id/fund/:incomeId` → `TripRoute`. `Selection` gains `{ kind: 'income'; id }`; `DetailsPanel` and `detailsNav.ts` handle it, so it is a full page on phones and the right-hand panel from 1024px.
  - Shows the note, "+{amount}", status pill, Date, and "Added by {name} · {day}".
  - Admins: Edit, Disable or Enable, and a version history with **Roll back** on each older version. A `FUND_SHORT` from Disable or Roll back shows inline under the buttons ("Can't disable: {amount} of this money is already spent.").
  - Others: read-only, with "Only admins can change fund income."
  - Not found: the same `EmptyState` the expense details use.
- **Fund-paid expense** (`ExpenseDetails.tsx`): *Paid by* reads "Group fund"; the split list is replaced by "Nobody owes a share. The money came out of the group fund."; "Added by {name}". The pay-by-QR bill block (sport only) never shows, since there is no sport meta.

### 7.7 Other web changes
- `App.tsx`: the two new routes.
- `InlineError.tsx`: `FUND_SHORT` → "There isn't enough in the group fund for this. Check the fund and try again."
- `activityText.ts`: lines for the five income actions, and "{actor} paid {amount} from the fund · {description}" for `expense_added` with `paidFromFund`.
- `UpdatedTransactionsBanner.tsx`: skips fund-paid expenses (nobody has a share in them).
- Every reader of `view.fund` treats a missing field as `null`.

### 7.8 States (every new view)
- **Loading:** the add screen keeps its existing skeleton, with an income-shaped variant (three fields and the button). The pill and details render from the already-loaded trip view.
- **Empty:** the feed and the sheet, as above.
- **Errors:** inline, next to the cause: field hints, the panel's over-limit line, `FUND_SHORT` under the buttons, network errors through `InlineError` with Retry.

### 7.9 Accessibility and layout
- Touch targets ≥ 44×44px; focus ring `--focus-ring` on every control.
- The switcher is a `tablist` of `tab`s; the sheet uses the existing `Sheet` focus handling; the pill is a `button` whose label includes the balance.
- No horizontal scroll at 375px; long notes wrap in rows and details, and truncate only in the wide list.

---

## 8. Copy

Every key goes into `en.ts` and `vi.ts`; Vietnamese lines end with `// REVIEW`. Existing keys (amount, date, save, back) are reused where they say the same thing. Final key names are set in the plan.

| Where | English | Tiếng Việt |
|---|---|---|
| Switcher | Expense · Fund income | Chi tiêu · Quỹ thu |
| Add screen title / button | Add to fund | Thêm vào quỹ |
| Edit title | Edit fund income | Sửa khoản thu quỹ |
| Note field / placeholder | Note · e.g. Thu 2 khách vãng lai | Ghi chú · VD: Thu 2 khách vãng lai |
| Edit too low | Keep at least {amount}: the rest is already spent. | Giữ ít nhất {amount}: phần còn lại đã được chi. |
| Paid by option | Group fund · {amount} | Quỹ nhóm · {amount} |
| Fund panel | Paid from the group fund. Nobody owes a share. | Chi từ quỹ nhóm. Không ai phải góp. |
| Fund panel | Fund after this: {amount} | Quỹ còn lại: {amount} |
| Over limit | The fund has only {amount}. Lower the amount or choose who paid. | Quỹ chỉ còn {amount}. Giảm số tiền hoặc chọn người trả. |
| Income row | Added to fund · by {name} / by you | Quỹ thu · {name} thêm / bạn thêm |
| Fund-paid row | Paid from group fund | Chi từ quỹ nhóm |
| Pill / sheet title | Group fund | Quỹ nhóm |
| Sheet | Added · Spent · Kept by the admins | Đã thu · Đã chi · Quản trị viên giữ |
| Sheet footnote | Only admins add or spend fund money. | Chỉ quản trị viên được thêm hoặc chi tiền quỹ. |
| Empty sheet | The fund is empty right now. · Money added by walk-ins or gifts shows here. | Quỹ đang trống. · Tiền khách vãng lai hoặc tài trợ sẽ hiện ở đây. |
| Details title | Fund income | Khoản thu quỹ |
| Details | Added by | Người thêm |
| Details (non-admin) | Only admins can change fund income. | Chỉ quản trị viên được sửa khoản thu quỹ. |
| Disable refused | Can't disable: {amount} of this money is already spent. | Không thể tắt: {amount} trong khoản này đã được chi. |
| Fund-paid details | Nobody owes a share. The money came out of the group fund. | Không ai phải góp. Tiền được chi từ quỹ nhóm. |
| `FUND_SHORT` | There isn't enough in the group fund for this. Check the fund and try again. | Quỹ nhóm không đủ cho khoản này. Kiểm tra quỹ rồi thử lại. |
| Activity | {actor} added {amount} to the fund · {description} | {actor} thêm {amount} vào quỹ · {description} |
| Activity | {actor} edited fund income · {description} · {amount} | {actor} sửa khoản thu quỹ · {description} · {amount} |
| Activity | {actor} disabled / enabled fund income · {description} | {actor} tắt / bật khoản thu quỹ · {description} |
| Activity | {actor} rolled back fund income · {description} | {actor} khôi phục khoản thu quỹ · {description} |
| Activity | {actor} paid {amount} from the fund · {description} | {actor} chi {amount} từ quỹ · {description} |

---

## 9. Edge Cases

1. **Fund at 0₫.** *Group fund* stays in *Paid by* for admins; choosing it shows "The fund has only 0₫…". The pill stays (muted 0₫) once there is any fund history.
2. **Editing an approved fund-paid expense.** Available = balance + its own amount.
3. **Enabling a disabled fund-paid expense** is checked like a new one.
4. **Roll back** of income to a smaller amount, or of an expense to or from a fund-paid version, runs the fund check; any roll back touching a fund-paid version needs `manage_fund`.
5. **Turning an expense into a fund-paid one** by editing it (its creator, who must be an admin): its shares are dropped and the fund is checked.
6. **An admin is demoted.** They lose every fund write, including on fund-paid expenses they recorded (`manage_fund` is checked on every write).
7. **Archived group.** Every write is refused (`assertWritable`); the pill and sheet are read-only.
8. **Snapshot cached before the deploy** has no `fund` field. The web reads it as `null`; the next write in that group rebuilds it.
9. **A browser tab opened before the deploy** ignores `fund` and shows a fund-paid expense with an empty split. A refresh fixes it; no data is wrong.
10. **Two admins spend the last đồng at the same moment.** Both checks can pass and the balance can end below 0₫ (the API reads, then writes, as the guest pending-expense limit does). Accepted. The pill then shows the negative balance in `--color-danger`, and every further fund-lowering write is refused until it is topped up.
11. **People who left.** Income added by someone who later left shows their name with the existing left marker.
12. **Preset** is set when a group is created and never changes, so the fund can't appear or vanish on an existing group.

---

## 10. Testing

- **Core** (`packages/core`, new `fund.test.ts` and additions to the permissions tests): `fundSummary` across every status; `fundEffect` for every kind and status; `isFundPaid`; the `manage_fund` matrix (organiser, admin, member, guest, viewer). Existing `computeBalances`, `suggestTransfers` and `pairwiseTransfers` tests stay untouched and pass.
- **API** (`apps/api/test`, new `fund.test.ts` plus additions to `expenses.test.ts`):
  - each income route: success, 403 for non-admins and non-sport groups, 422 validation, 409 `ALREADY_HANDLED`, 409 `FUND_SHORT`;
  - fund-paid expense: created with no shares; balances, suggestions and the trip list's balance unchanged; `trip.total` includes it; POST, PATCH, roll back, enable refused past the balance; disable and delete return the money; every write refused without `manage_fund`;
  - snapshot: `fund` null for trip groups; income history newest first; `addedById` stable across edits.
- **Web** (new component tests; existing tests are not edited): switcher visibility and URL tab; `IncomeForm` add, edit and too-low; *Paid by: Group fund* panel, over-limit and payload; merged feed order, income row, fund-paid row and empty state; pill visibility and sheet for admins and others; `IncomeDetails` actions and inline `FUND_SHORT`. `scaffold.test.tsx` passes with the new keys.
- **End to end** (`e2e/`, one new spec): an admin adds income, pays an expense from the fund, and sees the pill change while their balance does not.
- **Visual:** 375px and 1280px screenshots of every new view, reviewed against the UI/UX companion's thresholds (§4 of that skill).

---

## 11. Future

Partial subsidy (fund pays part of a bill); tracking which admin holds the cash and handovers; paying a member back from the fund as a tracked transfer; category picker and fund reports; tournament fees; the fund in trip groups.
