# Group shares in Sổ chi tiêu, and faster entry with a person

Date: 2026-11-21 · Issue: [#114](https://github.com/NguyenVuNhan/Coin-crew/issues/114) (Phase 2 · Stage 1 · sub-task 03; epic #55) · Blocked by #113 (closed) · Blocks #115 · Absorbs #138 (closed as covered) · Follow-up: #140

Lines marked **(owner)** are the owner's decisions in the brainstorm of 2026-11-21. Lines marked **(my call)** are the writer's; the owner may overrule them. Read with: `2026-11-13-phase-2-personal-money-breakdown-design.md` (rules, D1–D9), `2026-11-15-spending-book-shape-and-navigation-design.md` (section 6 table, approved S17), `2026-11-16-wallets-and-transactions-design.md` (W14, W21), `2026-11-19-transactions-search-flow-design.md` (the saved copy and sync).

## 1. Intent

The owner keeps re-entering CoinCrew shares into Money Lover. For a dinner they paid for the table, that is three entries: their part as spending, the rest as a loan, and a third when friends pay back **(owner)**. This sub-task makes all of it appear in Sổ chi tiêu with nothing typed, always equal to what the group says.

It also fixes how money with one person is entered on the Sổ chi tiêu "+" page: Vay/Nợ today halves a loan ("I lent Minh 50k" saves as 25k owed), and Chi cannot involve a person at all. The owner chose to rework the entry page in this ticket too, for the fewest taps **(owner: "Let's work on it here")**.

## 2. Goals

1. Every share of the owner in a group expense, every fund contribution, every group payment and settlement, and every quick expense with a person appears in Sổ chi tiêu automatically, read live from the group rows (D2), back to the first group.
2. The personal figures always agree with the group's net balance for that person.
3. Wallet balances reflect money that really left or arrived (section 4 table).
4. Recording money with someone takes 2–4 taps after the amount (section 7).
5. The main screen shows one stream ("Giao dịch gần đây") instead of three lists.

## 3. Non-goals and anti-goals

**Non-goals:** changing anything in groups; editing a group expense from Sổ chi tiêu; reports (#115); bank capture (#118, which only inherits the principle in 4.7); the group expense form and the group-only quick-expense page (#140 brainstorms them later).

**Anti-goals (a failure even if it works):**
- A personal figure that disagrees with the group screen.
- A group screen, a guest's path, or a group-only user that looks or behaves differently. The group form, the group-only quick-expense page (`/t/<direct>/expenses/new`) and their split behaviour stay exactly as today **(owner: "Does this affect the group UI?" → no)**.
- Spending counted twice (a fund's expenses after the contribution; a payback as income; a shared coffee as both a quick expense and a personal entry).
- The fastest path (solo spending) getting slower.

All Phase 2 rules from issue #114 apply unchanged (additive migrations only, no edits to the group money code or the expense/payment routes, no edits to existing tests, ≤50 queries per request, switch-off users see nothing new, private to the owner, hand-written migrations, integer money, nothing pushed, the "ledger" name reserved, both shells).

## 4. How group money reads into Sổ chi tiêu

### 4.1 What appears

The rows come from `transactions` (latest version, `isLatest = 1`) in every group where a participant has `userId = me` and status `active` (a `merged` participant's rows follow the person it merged into, the same way `apps/api/src/me/balances.ts` resolves them; import its helpers, do not change it). Unlinked names contribute nothing until claimed or merged, then appear with no action (issue req. 11).

| Group row | Shown as | Counts as spending | Wallet effect (after the wallet's start date) |
|---|---|---|---|
| Expense you are in, someone else paid | "your share", payer named | your share | none until you settle up |
| Expense you paid, you are in it | your share; line "Bạn trả 300.000₫ · 200.000₫ mọi người nợ bạn" | your share | − full amount |
| Expense you paid, you are not in it | movement, "mọi người nợ bạn" | nothing | − full amount |
| Money you put into a group fund (type `income`, you the payer) | spending, "Vào quỹ nhóm" **(owner)** | full contribution | − contribution |
| Expense paid from the fund (`isFundPaid`) or a planning expense (`isPlanningExpense`) | not shown | — | — |
| Payment you made (confirmed) | movement "Thanh toán", neutral ink | nothing | − amount (`amountConfirmed ?? amount`) |
| Payment you received (confirmed) | movement "Thanh toán", neutral ink | nothing | + amount |
| Expense waiting for approval (`pending`), payment marked paid but not confirmed (`says_paid`) | greyed, "Chờ duyệt · chưa tính" **(owner: greyed)** | nothing | none **(my call)** |
| Disabled, rejected, superseded, removed | not shown | — | — |

**Loans from Vay/Nợ** (`intent = 'loan'`, section 5) override the rows above: you lent → no spending (by default), wallet − the amount; you borrowed ("Bạn nợ Minh") → no spending (by default), **wallet + the amount**, because the cash arrived **(owner, 2026-11-21)**; your repayment later lowers the wallet as any payment does. "Minh paid my lunch" is entered on Chi with ⇄ and follows the "someone else paid" row (no wallet effect).

The quick-expense group ("direct", `findLedger` with preset `direct`) follows the same table, which replaces W14's "no wallet effect" now **(as planned in W14)**. Payments and rows inside it follow the same rules.

Filters reuse `toLedger` (`apps/api/src/trips/snapshot.ts`) and `isFundPaid` / `isPlanningExpense` (`libs/shared/core/src/fund.ts`); import them, never copy their logic.

### 4.2 History and the wallet's start date **(owner)**

All history shows, back to the first group. Rows dated before the wallet's start date are listed and searchable but change no balance (the starting amount already includes them; S26/S27). Money still owed from before stays under "Mọi người nợ bạn" and raises the wallet when it is paid back.

### 4.3 Which wallet **(owner)**

Every group row sits on the default wallet automatically. The owner can move one row to another wallet from its sheet (4.6); the choice is kept in the per-user link table and survives edits to the group expense. Never asked per row.

Group money is whole VND, so group rows only go to VND wallets: the default wallet if it is VND, else the first VND everyday wallet; the sheet lists VND wallets only; with no VND wallet the rows show with no wallet effect **(my call)**.

### 4.4 Agreement with the group (issue req. 3)

For one group and one person, from the rows of this view only (expenses, shares, payments, both directions):
`net = Σ paid by you − Σ your shares + Σ payments you made − Σ payments you received`
must equal `myBalanceIn(trip, snapshot, pid)` in a group with settlement rounding **off**. Fund contributions are outside this figure (the group balance leaves `income` out). With rounding on, the group's figure is rounded to 1,000₫ transfers; Sổ chi tiêu shows the real shares and "Mọi người nợ bạn" keeps using the existing people summary, so it matches the group screen. The test runs for an ordinary group, a sport group and a group with a fund.

### 4.5 Turning Sổ chi tiêu off and on again **(owner: add it)**

Off brings back the normal app and deletes nothing; on restores everything (S29); the saved copy is deleted and rebuilt (#133). Group rows from the off months reappear by themselves and move balances as usual, but spending the owner did not type during the gap is missing, so a wallet can disagree with the bank.

So, when Sổ chi tiêu is turned on again after being off for more than one day **(my call)**, each everyday wallet shows a one-line prompt at the top of the wallets page and on the wallet: **"Số dư có khớp với ngân hàng không?"** `// REVIEW` with "Nhập số dư thật" and "Bỏ qua". Typing the real balance saves one **adjustment entry**: the difference as an `expense` or `income` row dated today, `source = 'adjustment'`, `exclude_from_reports = 1`, note "Điều chỉnh số dư" `// REVIEW`, no category needed. It moves the balance and never counts as spending or income. The prompt disappears per wallet once answered or skipped. The time of turning off is kept in `personal_group_settings.disabled_at`, written by the existing on/off route through a new helper (that route is not in the rule-2 list).

Quick expenses entered on the group-only page during the gap come back as ordinary shared quick expenses (`intent` null); a loan can be fixed from its sheet (4.6).

### 4.6 Opening a group row

Tapping a group or quick-expense row opens a small sheet (shared `Sheet` wrapper): group name, date, your share and the outcome sentence, then your own **category**, **tags** and **wallet**, invisible to the group, and a **"Xem trong nhóm"** button that opens the expense in its group. Amount, people and payer are edited only in the group.

### 4.7 Bank capture and group rows (the principle for #118) **(owner)**

When a captured bank payment and a group expense look like the same money, the app **asks each time**. On confirm, the group row stays and the bank entry is marked "already in a group" and changes nothing. Unconfirmed, both stay as they are.

## 5. Categories

- **Group rows:** a default category for group shares, chosen once in Sổ chi tiêu settings **(owner)**; change one row from its sheet. Until chosen, group rows use a starter category "Nhóm" `// REVIEW` **(my call)**.
- **Shared cost from Chi:** your share takes the category picked on the form.
- **Loans (Vay/Nợ):** their own categories, "Cho vay" (you lent) and "Đi vay" (you borrowed) **(owner: own category; second name my call)**, added to the starter list and renameable like any category.
- **Loans in totals:** **left out of spending and income totals by default**; one Sổ chi tiêu setting, "Tính khoản vay vào chi tiêu" `// REVIEW`, counts them when turned on **(owner: "disable by default, count if the user enables"; one global setting is my reading)**.
- **What counting means, Money Lover style (owner, 2026-11-21: option a):** with the setting on, money you lend counts as spending under "Cho vay" (`type = expense`) and the payback as income; money you borrow counts as income under "Đi vay" (`type = income`) and your repayment as spending. Over the life of a loan the two cancel. With the setting off, the loan and its paybacks count nothing (movements).
- **Which payments are paybacks** (payments settle a balance with a person, not one expense) **(my call)**: with the setting on, a payment between you and a person in the direct group counts as a loan payback up to the open loan balance with that person, oldest loan first; the rest stays a neutral movement. Group payments outside the direct group are never paybacks.
- **Old quick expenses** saved before this ticket keep counting as today (W21: your share as spending, "Với người khác"), unless the owner recategorises one.

A quick expense is a loan when it was saved from the Vay/Nợ tab after this ticket (recorded in the link table as `intent = 'loan'`), not inferred from the shares **(my call: "Bạn nợ Minh" and "Minh paid my lunch" have the same shares)**.

## 6. Screens

### 6.1 Main screen (Sổ chi tiêu on) **(owner)**

Remove "Khoản chi của bạn" and "Các khoản đã trả của bạn" (the direct group's `ExpenseList` / `PaymentsList` rendered by `Home` when `book` is true; Home with the book off is unchanged). "Giao dịch gần đây" carries the richer rows instead; older items are reached through "Tất cả ›" and search. Mock: `.superpowers/brainstorm/*/content/book-main.html` (proposed, right).

### 6.2 Transaction rows

Extend `TransactionRow` for group rows: category icon, title (expense name), the group's name as a small label, a meta line that says the rest ("Bạn trả 300.000₫ · 200.000₫ mọi người nợ bạn", "Hùng trả", "Vào quỹ nhóm · Techcombank", "Thanh toán · Techcombank"), amount = your share with − / colour by type, "phần của bạn" under it when it differs from the bill; movements in neutral ink; pending rows at reduced emphasis with "Chờ duyệt · chưa tính", still AA contrast. Keep `fsl-tx-row*` classes.

### 6.3 Filters (my calls)

The `/transactions` filter sheet gains "Nhóm" (pick one group, the direct group listed as "Với người khác") and a switch "Hiện khoản từ nhóm" (on by default). Active filters show as removable pills like the others. Search covers group rows by name, group name and the owner's note/tags.

## 7. The entry page (Sổ chi tiêu "+"), option C **(owner)**

Mocks: `entry-with-person.html` (A/B/C), `entry-c-fewer-taps.html`, `entry-c-split-mode.html` in `.superpowers/brainstorm/*/content/`.

**Chi** gets an optional **"Chia với ai?"** block of recent-people chips below the category. Empty = plain spending (saved as today, a personal transaction). With people = a quick expense in the direct group through the existing route, you always included, paid by you by default; the outcome sentence carries the same ⇄ chip as Vay/Nợ to say another person paid ("Minh trả · Bạn nợ Minh 25.000₫"), so "Minh paid my lunch" is entered as spending, not a loan **(my call)**. Your category, wallet, tags and the report switch go to the link table, written after the expense comes back.

**Description saved to the group** (the quick-expense route needs 1–80 characters and is not changed): the typed note when there is one, else the category name on Chi and "Cho vay" / "Đi vay" on Vay/Nợ. The note is shared with the other person, as quick-expense notes are today **(my call)**.

**Vay/Nợ** stays for pure loans:
- **"Với ai?"** chips; the split covers **only the people picked** (you are not in it unless you add yourself) **(owner)**.
- The "Người trả" row is replaced by one sentence, "Minh nợ bạn 50.000₫", with a ⇄ chip that flips it to "Bạn nợ Minh" (another person as payer). With several people the sentence names each.
- Note becomes optional; Ngày before Ghi chú; "Chia cho" → "Với ai"; drop "trong nhóm" and the "Bánh tráng nướng, chợ đêm" placeholder (issue comment).
- Saved with `intent = 'loan'` (section 5).

**Old quick expenses stay as they are (owner, 2026-11-21: "this will break the old expenses").** The "only the people in Với ai" rule is a default for **new** Vay/Nợ entries, nothing more:
- Stored shares are never rewritten. An old quick expense that split 50k between you and Minh keeps you at 25k; with `intent` null it counts as a shared expense (your share as spending), exactly as today.
- **Editing** an old one starts from its stored shares (as `ExpenseForm` already does: `included = expense.shares`). Because the "Với ai" row hides you today, the form must show you as a **"Bạn"** chip whenever you are in the split, so the owner can see it and take themselves out. Saving an edit keeps `intent` as it was (null stays null) unless the owner flips it with ⇄.
- The new default (you not in the split) applies only to the Sổ chi tiêu entry page's Vay/Nợ tab when creating. The group-only quick-expense page (`isDirect` without the embed) keeps today's default of you included.
- Tests: an old 50/50 quick expense shows −25k "phần của bạn" before and after Part 3; opening it on Vay/Nợ shows "Bạn" and Minh chips; saving without changes keeps the shares and `intent` null.

**Thu** is unchanged.

**Shared by both:**
- **Chips:** the 3–4 most recently used people of the direct group, newest first; "+" opens the existing person sheet (`SplitPeopleSheet`, including adding a new name) **(my call: only direct-group people can be in a quick expense)**.
- **Cách chia** reuses the group form's pieces (`SplitPeopleSheet`, `SplitModePicker`, per-person inputs) without changing them **(owner)**. Folded as "Cách chia: Chia đều · N người ›"; tapping opens the five modes in place; the sentence updates live; Lưu stays disabled until the amounts add up.
- **Outcome sentence** in `bg-success-soft`-style green above the save bar, text plus colour (never colour alone).
- **Guesses accepted by doing nothing** **(owner: guess from group, behaviour…)**: category pre-picked and drawn dashed when the guess has support; default wallet; today. Category guess, in order: the last category used with the same person, then the most used category for the same time-of-day band and amount band in the last 90 days, else nothing. Computed on the device from the saved copy (#133), no server query **(my call)**.
- **Folding** **(owner)**: Ví, Ngày, Ghi chú, Thẻ and "Không tính vào báo cáo" fold into one tappable summary line, "Hôm nay · Techcombank · Không ghi chú ›".

**Tap targets (after typing the amount):** solo spending with a right guess 2 (Xong, Lưu); coffee split with Minh 3; lent Minh 50k 3; borrowed from Minh 4.

**Untouched:** the group expense form, the group-only quick-expense page, `SplitModePicker` / `SplitPeopleSheet` behaviour in groups. New pieces live in new components used only by the entry page (#140 decides later whether groups adopt them).

## 8. Data

New migration `apps/api/migrations/0030_personal_group_links.sql`, `schema.ts` updated by hand:

- **`personal_group_links`**: `user_id`, `root_id` (the group transaction's stable `rootId`, so it survives edits), `trip_id`, `wallet_id` (null = default wallet), `category_id` (null = default), `intent` (`'shared' | 'loan'`, null for old rows), `exclude_from_reports` (0/1, shown in the 4.6 sheet), timestamps; PK `(user_id, root_id)`; index `(user_id, trip_id)`.
- **`personal_group_link_tags`**: `user_id`, `root_id`, `tag_id`; PK on all three.
- **Settings:** `default_group_category_id`, `count_loans`, `disabled_at` and `reenabled_at` (for the 4.5 prompt; which wallets were answered can live in a small `personal_balance_checks (user_id, wallet_id, answered_at)` table) in a new table `personal_group_settings` (`user_id` PK) **(my call: rule 1 forbids adding columns to `user_personal_settings`)**.
- Starter categories "Nhóm", "Cho vay", "Đi vay" are added for users who already have their list by the same migration's insert or lazily on first read (builder's choice; must be idempotent).

No table stores a copy of a group row (D2).

## 9. API and cost

New routes under the personal router, all behind `requirePersonal`:
- the list and month endpoints include group rows (new `kind: 'group'` alongside `'entry'` and `'person'`);
- `PUT /personal/group-links/:rootId` (wallet, category, tags, report switch, intent);
- `GET/PUT /personal/group-settings`.

The read is per user, not per group: one query for my participant ids and trip names, one for latest expense/income/payment rows of those trips in the range (chunked `IN` lists of ≤90 trips), one for my shares of them, one for links and their tags. No `getSnapshot` per group. Wallet balances add one grouped sum over the same filters from each wallet's start date.

| Action | Queries (new) | Rows read | Rows written |
|---|---|---|---|
| Month list with group rows | +4–6 (constant up to 90 groups, +2 per further 90) | group rows of my groups in the month | 0 |
| Wallet balances | +2 | all my group rows since the start date (aggregated) | 0 |
| Save a row's extras | 2–3 | 1–3 | 1 + tags |
| Save a shared Chi / loan | existing quick-expense route + 1 link write | as today | as today + 1–3 |

Test: an account in 60 groups stays under 50 queries for the list and for balances. Measure rows read for a heavy account; raise #109 with the owner only if numbers demand it.

**Sync (#133):** group rows are derived and ride on the trips' `version` the way the direct ledger already does in `apps/api/src/personal/sync.ts` (the cursor carries the versions of every group the user is in); link-table writes go through the per-person change counter. The saved copy and search then pick group rows up with no extra work.

## 10. Tests that must exist

- Agreement (4.4) for an ordinary group, a sport group and a fund group, rounding off.
- Edit, disable, rollback, removal and person-merge in a group change the personal view on the next load.
- Each row type in 4.1 appears with the right spending and wallet effect, including before and after the start date.
- A switch-off user sees and reaches nothing new (screen and API); a second account cannot read or change links or settings.
- Vay/Nợ: "Với ai: Minh, paid by you, 50k" saves Minh owing 50k; ⇄ saves you owing Minh; several people name each.
- Group expense form and group-only quick-expense page render and save exactly as before (existing tests untouched and passing; `golden-path` and `walkthrough` pass).
- Query count for 60 groups.

## 11. Delivery in parts **(my call)**

1. **Read-in and balances** (API, sections 4, 8, 9 and sync, including the 4.5 balance check): rows appear, agreement test, wallet effects, links and settings.
2. **List and main screen** (sections 5 and 6): rows, sheet, filters, categories and the loans setting.
3. **Entry page** (section 7).

Each part is its own pull request into `main` from `feat/group-shares-…`, built tests first, reviewed live by the owner. `/impeccable` shapes parts 2 and 3 against the mocks before generating.

## 12. Left to the builder

Exact component names and file split; the time-of-day and amount bands for the guess; sheet layout details within DESIGN.md; copy beyond the strings named here (new Vietnamese lines marked `// REVIEW`, English second); how starter categories are seeded; how the sync cursor encodes many trip versions, as long as one changed group invalidates the saved copy.
