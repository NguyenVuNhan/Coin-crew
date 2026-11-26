# Budgets

Date: 2026-11-26 · Issue: [#116](https://github.com/NguyenVuNhan/Coin-crew/issues/116) (Phase 2 · Stage 1 · sub-task 05 of 12; epic #55) · Blocked by #115 (closed) · Blocks #117 · Follow-up: #158 (trip mode).

Builds on: `2026-11-13-phase-2-personal-money-breakdown-design.md` (D1–D9, the Phase 1 guard rules), `2026-11-15-spending-book-shape-and-navigation-design.md` (S10, S21: the budgets card), `2026-11-16-wallets-and-transactions-design.md` (#113), `2026-11-21-group-shares-in-spending-book-design.md` (#114) and `2026-11-24-reports-spending-and-income-design.md` (#115).

Mockups (built from the real stylesheet, font and icons; fake figures, "today" is Thursday 26/11): `docs/superpowers/mockups/budgets/`:
`1-budgets-page.png`, `2-budget-detail.png`, `3a-entry-too-fast.png`, `3b-entry-over.png`, `4-after-save.png`.

Lines marked **(owner)** were decided or confirmed by the owner in the brainstorm on 2026-11-26. Lines marked **(my call)** were proposed by the writer and not answered; the owner may overrule them.

> **The 11 Phase 2 rules in issue #116 apply unchanged.** In short: additive migrations only (new tables, never a column on an existing table); do not edit the group money code listed in the issue; never edit or delete an existing test; at most 50 queries per request and stay well inside the daily row limits; nothing new is visible or reachable with the spending book switched off; personal data is private; hand-written SQL migrations; money is whole numbers in the smallest unit; no push, SMS or email about personal money; do not use the name "ledger"; same screens in `apps/web` and `apps/zalo`.

---

## 1. Intent

The owner checks a budget **to decide whether to buy something**. When spending is close to the limit, they stop buying. **(owner)**

So every budget screen answers one question fast: *can I still spend on this, and how much?* A budget is not a second report. It is a limit, a pace, and a warning at the moment of entry.

Budgets are part of the Money Lover core the owner relies on; they must exist before Money Lover can be dropped (issue #116).

## 2. Goals, non-goals, anti-goals

### Goals
1. Set a limit for a category (with its sub-categories) or for a tag, over a repeating period or one fixed date range.
2. See, per budget, what is left and **how much can be spent per day** (per month for long budgets) without going over.
3. See first what needs attention: budgets over the limit, then budgets spending too fast.
4. Be warned **while entering** an expense that pushes a budget too fast, close to the limit, or over.
5. Look back at past periods: the limit at the time and what was spent.
6. Get a suggestion to change a limit that has been wrong six periods in a row.

### Non-goals
- **Trip mode** (auto-tagging new expenses while travelling): its own ticket, #158. This design only makes a budget able to count a tag over a one-off date range, which #158 builds on. **(owner)**
- Rollover of unspent money. **(owner)**
- A budget that covers "all spending". **(owner: "we don't have tổng chi")**
- A budget that converts between currencies. **(owner)**
- Savings goals, bill reminders (issue #116, out of scope).
- Notifications of any kind outside the app (issue #116, requirement 9).

### Anti-goals (a failure even if it works)
- A budget's "spent" that disagrees with the report for the same category or tag, dates and wallets.
- A confirmation or block before saving an expense. The owner records money **after** spending it; "Are you sure?" is wrong. **(owner)**
- A single total that adds up budgets with different periods or scopes (it mixes money that cannot be swapped, and hides a budget that is already over).
- Any warning for an expense whose category and tags have no budget, or whose budgets are still fine. **(owner)**
- Amounts on the Sổ chi tiêu budgets card (The Quiet Overview Rule, S5).
- State shown by colour alone.

## 3. Decisions

| # | Decision | Source |
|---|---|---|
| B1 | **What a budget counts: one category (with all its sub-categories) or one tag.** No multi-category budgets other than through a tag; no "all spending" budget. | owner (tag: owner, via the trip discussion; no total: owner) |
| B2 | **Money that counts follows the report's rules exactly** (`#115` §4): personal expenses and the owner's share of group expenses in that category or tag; never transfers, settlements, asset trades, balance adjustments, pending group rows or rows excluded from reports. Spending only: income is never counted against a budget. | issue #116 req. 5; my call for "spending only" |
| B3 | **Currency: a budget counts in one currency and never converts.** It counts every wallet in that currency. When creating, all wallets in the currency are ticked, except wallets marked "not in reports" (#134); the owner can untick any. Group shares count when their resolved wallet is one of the ticked wallets. | owner (one currency, several wallets); my call (ticking, #134 default) |
| B4 | **Periods:** weekly (Monday to Sunday, as in #133), monthly with a **start day chosen per budget** (1–31; a start day past the end of a month is that month's last day), yearly (1 January), or **one fixed date range** that does not repeat (a trip, a multi-year project). Default: monthly, starting on the 1st. | owner (start day per budget; multi-year and one-off ranges); issue #116 req. 1–2; my call (Monday, clamping) |
| B5 | **No rollover.** Each period starts fresh at its limit. | owner |
| B6 | **States**, each with words and an icon as well as colour: **over** (spent > limit; Lychee, `ban` icon); **too fast** (at the pace since the period began, it would end at least 10% over: `spent / elapsed ≥ 1.10 × limit`; Turmeric, `zap` icon); **near** (spent ≥ 85% of the limit but not too fast; Turmeric, `clock` icon, "Sắp chạm mức"); **fine** (everything else; theme accent bar, muted words such as "Còn gần một phần ba"). | owner (the three groups, the 10% margin); S21 (85%) |
| B7 | **No budget is "too fast" early in a period**: not in its first two days. For periods longer than three months, not in the first 5% of the period either (whichever is longer). | owner (two days); my call (long periods) |
| B8 | **"Elapsed"** is the share of the period's days up to and including today. | my call |
| B9 | **The pace figure** shown on every budget: what is left ÷ days left in the period (today included). It is worked out afresh each day, so spending less yesterday means more today. Periods longer than one month say it per month ("≈ 4.700.000₫ mỗi tháng"). An over budget shows no figure, only "Nên dừng đến hết kỳ" (stop until the period ends). | owner |
| B10 | **Budgets page order:** three groups with headings and counts: **Đã vượt mức** (over), **Đang chi nhanh quá** (too fast), **Đúng nhịp** (on pace: near and fine). Inside a group: furthest over by % first; most projected overspend by % first; highest % used first. No total card. | owner |
| B11 | **Changing the amount applies from the current period on**; past periods keep their old limit. | issue #116 req. 7 |
| B12 | **Suggest a new limit** when the last **6 completed periods in a row** were all over the limit, or all under 80% of it. The suggestion is the average spent over those 6 periods, rounded to 100.000₫ (for other currencies, a round number of the currency's main unit). It shows only inside the app, on that budget's page, as one line with a button "Đổi mức thành …"; the budget's row in the list gets a small mark. Accepting sets the new limit from the current period (B11). Dismissing hides it until another 6 periods in a row match. Not offered for one-off budgets. This brings back something issue #116 listed as out of scope ("automatic suggestions for limits"), at the owner's request. | owner (6 periods, suggest); my call (80%, average, rounding, dismissal) |
| B13 | **Warning while entering an expense:** shown only when the expense's category or one of its tags has a budget **and** this expense would make that budget too fast, near or over. Nothing shows when the budget stays fine. It updates as the amount, category, tags, date or wallet change. When the expense touches several budgets, the worst one leads and the others get one sentence. Saving is never blocked or confirmed. | owner |
| B14 | **After saving**, the app's usual snackbar adds the budget's state ("Đã lưu. Cà phê đang chi nhanh quá: còn khoảng 20.000₫ mỗi ngày.") with a "Xem" action that opens that budget. Only when a budget is not fine. | owner (see the effect after saving); my call (wording) |
| B15 | **The warning is in the personal entry form** (`EntryPage`, the "+" → Chi form, new and edit). Editing an expense dated in an earlier period warns about **that** period. Group expense forms get no warning in this ticket; the shares still count. | my call |
| B16 | **Only inside the app.** No push, email or SMS about budgets, ever. | issue #116 req. 9 |
| B21 | **The warning shows on every expense in a budget that is not fine**, including one already over or too fast before this expense; it does not wait for a change of state. Wording follows the state after the expense ("Mua sắm đã vượt mức, giờ vượt 260.000₫"). The snackbar (B14) follows the same rule. | owner |
| B17 | **A wallet added later in the budget's currency counts by default.** The budget stores the wallets the owner **unticked**, not the ticked ones, so it keeps matching the report when a new ₫ wallet appears. | my call |
| B18 | **A budget starts at the period that contains its creation date.** Earlier periods do not exist for it: they are not in its history, the ‹ button stops at the first period, and they never count toward the suggestion (B12), so a new budget cannot suggest a change on day one. | my call |
| B19 | **An expense split with people in the personal form** ("Chia với ai?") warns using **the owner's share**, which is what the budget will count; the form already works that share out. | my call |
| B20 | **Budgets may overlap**: a parent and its sub-category (Ăn uống and Cà phê), or a category and a tag. An expense counts toward each. When it touches several, the warning leads with the worst state (over, then too fast, then near); a tie goes to the narrower budget (sub-category before parent, then category before tag). The same target with the same period twice is refused by the create form. | my call |

## 4. Screens

Phones first at 375px; Vietnamese first, English second; every new Vietnamese line marked `// REVIEW`. Use the app wrappers and theme tokens only (`DESIGN.md`). The mockups show the intended look; `/impeccable` refines it before code (issue #116, step 4).

### 4.1 Budgets page (`/budgets`) — mockup 1
- Reached from the Sổ chi tiêu budgets card's "Tất cả ›" (S10, navigation map).
- Header: back, title "Ngân sách", a "+" icon button that opens the create form.
- Three groups (B10), each a section label with its count over one white `rounded-xl` grouped list. A group with no budgets is not shown.
- A row: the category or tag icon in a round Jade Mist tile; the name; the state in words with its icon; on the right the amount left (Ink) or the amount over (Lychee, "vượt mức"); under it the bar with a black **today mark** (the elapsed share, B8); under that the pace line (B9) with how long the period has left ("còn 5 ngày", "còn 2 năm 1 tháng", "còn 4 ngày, hết Chủ nhật"). A row with a pending suggestion (B12) carries a small mark. Tapping opens the budget's page.
- Budgets that have ended (one-off ranges in the past) are not in the three groups; they sit in a collapsed "Đã kết thúc" list at the bottom. **(my call)**
- Empty: an `EmptyState` with one line on what a budget is for and a primary "Đặt ngân sách" button. **(my call)**

### 4.2 One budget (`/budgets/:id`) — mockup 2
- Header: back, the budget's name, an edit icon button.
- Summary card: the period ("Tháng 11/2026 · 1/11 – 30/11") between ‹ › buttons to step through past periods (› disabled on the current one); a half-ring arc filled to the share spent, in the state's colour, with "Còn lại" and the amount in the middle (owner chose the arc in the brainstorm); three small figures: limit, spent, time left; a note in plain words with the state and the pace (B9). Jade Mist for fine, Turmeric soft for too fast or near, Lychee soft for over.
- A suggestion (B12) shows as one line under the summary card with its button.
- "6 kỳ gần đây": a column per period (spent) with a dashed line for that period's limit, the current period strongest; under it the list of past periods, each with the state in words, spent and "trên <limit>"; tapping a row moves the summary card to that period.
- "Giao dịch kỳ này (n)": the expenses counted in the shown period, as `TransactionRow`s, opening their usual detail. "Tất cả ›" opens `/transactions` filtered to the same category or tag, dates and wallets.
- Periods longer than three months show "Theo năm" bars (spent per year) instead of six periods, and the pace note per month. **(my call)**

### 4.3 Create and edit (a `Sheet`, or a page if it grows) — no mockup yet
Fields, in order: **what** (category from the category picker, or a tag); **amount**; **currency** (only when the owner has wallets in more than one currency; default VND); **wallets** (ticked list, B3); **period** (Hằng tuần / Hằng tháng with "bắt đầu ngày" / Hằng năm / Một lần with from–to dates); the name defaults to the category or tag name and can be changed. **(my call)**
- After creating, the **amount**, the **name** and the **unticked wallets** can be changed (amount from the current period on, B11; a wallet change applies to every period, like the report). The period, the start day, what it counts and the currency are fixed: changing them would rewrite history. To change them, remove the budget and make a new one. **(my call)**
- **Remove** sits at the bottom as a Lychee-text ghost button; a sheet asks to confirm, and removing deletes the budget and its history. **(my call)**

### 4.4 The budgets card on Sổ chi tiêu — mockup 4
As already designed (S10 and the "Overview" section of `DESIGN.md`): one card, a row per budget with the name, the state in words on the right, the bar underneath; **no amounts**. It shows the **two most urgent budgets** in the page's order (B10). It hides when the owner has no budgets. **(S10, S21 left this count to #116: my call)**

### 4.5 The warning in the entry form — mockups 3a, 3b
- A block right under the category grid, shown only per B13: Turmeric soft for too fast or near, Lychee soft for over; an icon, one bold line naming the budget and what this expense does ("Khoản này làm Cà phê chi nhanh quá" / "Khoản này làm Ăn uống vượt mức 330.000₫"), one line with what is left and the new pace, and the budget's bar with this expense as a paler piece and the today mark.
- `role="status"` so screen readers hear it when it appears; it does not steal focus.
- Never blocks typing or saving.

### 4.6 Snackbar after saving — mockup 4
The app's `Snackbar`, per B14.

## 5. Counting: one way, shared with reports

Issue #116: *"Reuse the report's sums; do not compute spending a second way."*

- Budget figures come from the **same pure engine in `@cc/core`** (`libs/shared/core/src/reports.ts`) that powers reports, over the same inputs (`txCopy`, `groupCopy`, wallets, categories, tags, group settings). The counted-row rules, category roll-up (a sub-category counts toward its parent) and group row attribution are the report's; budgets add no rule of their own.
- What budgets need that reports may not expose yet: totals for **a set of wallets in their native currency** (reports offer one wallet, or all wallets converted to ≈ VND), and for **one tag** over a date range. The builder extends the engine with these options **additively** (existing exports and their results unchanged) rather than writing a second counter.
- **Agreement invariant (test):** for a budget on one category and all VND wallets, its "spent" for a period equals the report's category total for the same dates scoped to those wallets. For a tag budget, it equals the report's tag total.
- Pure budget logic also in `@cc/core` (a new `budgets.ts`): period windows from the budget's kind and start day; the limit in force for a period; spent, left, elapsed, state (B6–B8), pace (B9), ordering (B10), the suggestion (B12), and "what would this expense do" for the warning (B13).

## 6. Data

New tables only (rule 1), hand-written migration `apps/api/migrations/0037_…`, `libs/api/db/src/schema.ts` kept in step. The shape below is the writer's suggestion; the builder may change it as long as the behaviour holds.

- `personal_budgets`: id, user_id, name, target kind (`category` | `tag`), target id, currency, period kind (`week` | `month` | `year` | `once`), month start day (1–31, monthly only), from and to dates (one-off only), suggestion dismissed until (a period start, nullable), created at.
- `personal_budget_limits`: budget id, effective from (the first period it applies to), amount (whole number, smallest unit). The limit for a period is the latest row whose "effective from" is at or before that period's start.
- `personal_budget_excluded_wallets`: budget id, wallet id (the wallets the owner unticked; B17).
- Deleting a category, a tag or a wallet that a budget uses: the builder decides; the owner must never see a broken budget (suggested: a budget whose category or tag is gone is removed with it; a removed wallet simply stops counting).
- Every row is owned by the user; every route is behind `requirePersonal` and scoped to `user.id` (rules 5, 6).

## 7. API and cost (Cloudflare free plan)

Budget progress is computed **in the browser** from the synced local copy, like reports, so viewing and stepping through budgets reads nothing from D1 in the steady state. The server keeps only the budget definitions, plus a fallback that runs the same engine when the local copy is not ready.

| Action | Queries | Rows read | Rows written |
|---|---|---|---|
| `GET /me/personal/budgets` (definitions, limits, wallets) | ~4 (auth + 3) | ~3 per budget (≈ 30–60 for 10–20 budgets) | 0 |
| Budgets page, budget page, stepping periods, the entry warning (local copy ready) | 0 new | 0 | 0 |
| Fallback progress (`GET /me/personal/budgets/progress`, local copy not ready) | ≤ 14, like the report fallback | ≈ the report fallback over the budget's window (≤ a few thousand) | 0 |
| Create a budget | ~3 (one batch) | ~2 (ownership checks) | 1 + 1 + wallets (≈ 3–6) |
| Change the amount, the name, or dismiss a suggestion | ~2 | ~2 | 1 |
| Remove a budget | ~2 | ~2 | its rows (≈ 3–20) |

The builder measures and records the real numbers in the plan. When the local copy is not ready, the entry form shows **no** warning rather than waiting on the network. **(my call)**

## 8. Tests that must exist (no existing test edited)

1. **Agreement:** a monthly Ăn uống budget's spent equals the report's Ăn uống figure for the same dates and wallets, with personal expenses, a group share and an excluded transfer in the data (issue #116 "Done when").
2. **Period boundaries:** a monthly budget starting on the 1st, the 25th and the 31st; periods across 28/29/30/31-day months and a leap February; weekly Monday–Sunday; a yearly budget; a one-off range; a multi-year range.
3. **Limits over time:** changing the amount mid-period applies to the current and later periods; earlier periods keep the old limit.
4. **States:** over, too fast (including the 10% margin and the early-period grace, B7), near, fine; ordering on the page (B10).
5. **Pace:** per day and per month; over shows no figure.
6. **Currency and wallets:** a ₫ budget ignores a USD wallet; an unticked wallet does not count; a group share counts only when its resolved wallet is ticked.
7. **Tags:** a tag budget counts every category carrying the tag, and nothing without it.
8. **Suggestion:** appears after 6 periods over, and after 6 under 80%; not after 5; not for one-off budgets; dismissal holds until 6 more.
9. **Warning:** nothing for a fine budget or an expense without a budgeted category or tag; too fast, near and over each shown; several budgets touched; editing an old expense uses its own period.
10. **The full flow (issue #116 "Done when"):** set a monthly food budget, add expenses and a group share in that category, see the bar and the amount left change correctly (Playwright, phone at 375px, Vietnamese).
11. **Guard:** with the spending book off, no budget screen, card or route is reachable on screen or through the API (rule 5).
12. **Privacy:** a second account cannot read, change or remove the first account's budgets (rule 6).
13. `npm test`, `npm run typecheck`, `npm run lint`, and the Playwright `golden-path` and `walkthrough` specs pass.

## 9. Left to the builder
- The exact table and column names, indexes and the migration, within §6.
- How the report engine is extended for wallet sets and tags (§5), provided existing results do not change.
- The create/edit form's final layout (shaped with `/impeccable` and reviewed with the owner).
- The English copy, and the Vietnamese copy beyond the lines quoted here (marked `// REVIEW`).
- Removing a category, tag or wallet that a budget uses (§6).
- `DESIGN.md`: record the budget states (B6) and the entry warning block as named uses of Turmeric and Lychee under The Money Means Something Rule.
