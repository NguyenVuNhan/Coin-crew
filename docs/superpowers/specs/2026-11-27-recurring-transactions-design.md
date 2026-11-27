# Recurring transactions and the "to confirm" list

Date: 2026-11-27 · Issue: [#117](https://github.com/NguyenVuNhan/Coin-crew/issues/117) (Phase 2 · Stage 1 · sub-task 06 of 12; epic #55) · Blocked by #116 (closed) · Blocks #118, #122.

Builds on: `2026-11-13-phase-2-personal-money-breakdown-design.md` (D1–D9, the Phase 1 guard), `2026-11-15-spending-book-shape-and-navigation-design.md` (the Sổ chi tiêu home), `2026-11-16-wallets-and-transactions-design.md` (#113: the `source` field), `2026-11-22-balance-caching-design.md` (#109), `2026-11-26-budgets-design.md` (#116: pace).

Mockups (throwaway wireframes from the brainstorm, small text so phones fit side by side): `docs/superpowers/mockups/recurring/`: `1-placement-options.html` (A vs B; B chosen), `2-recurring-combined.html` (the chosen shape).

Lines marked **(owner)** were decided or confirmed by the owner in the brainstorm on 2026-11-27. Lines marked **(my call)** were proposed by the writer and not answered; the owner may overrule them.

> **The 11 Phase 2 rules in issue #117 apply unchanged.** In short: additive migrations only (new tables and indexes; never a column on an existing table); do not edit the group money code listed in the issue; never edit or delete an existing test; at most 50 queries per request and stay inside the daily row limits (100,000 written, 5,000,000 read); nothing new is visible or reachable with the personal area off; personal data is private; hand-written SQL migrations; money is whole numbers in the smallest unit; no push, SMS or email about personal money; do not use the name "ledger"; same screens in `apps/web` and `apps/zalo`.

---

## 1. Intent

The owner sets up a repeating transaction once and it records itself: salary, rent, subscriptions, a monthly ETF purchase. ETF is one example; this is for **repeating transactions in general**. **(owner)** When this ships the owner can stop using Money Lover (issue #117).

Two things make it trustworthy rather than a silent money printer:

1. **A forgotten rule must not keep recording money that no longer moves.** A cancelled subscription whose rule nobody remembers would quietly corrupt balances, reports and budgets. So every automatic rule **checks in once in a while** ("still happening?"), and **stops recording after a few unanswered reminders**. **(owner)**
2. **Some amounts are never the same twice** (an ETF order, a utility bill). Those rules can **ask for the amount** each time instead of saving. **(owner)**

Both land in one small **"to confirm" list** (Chờ xác nhận), which later features reuse for their own planned items (issue #117 req. 9).

## 2. Goals, non-goals, anti-goals

### Goals
1. Create a rule from scratch or from an existing transaction ("repeat this"): expense, income, transfer, or **asset buy** (§5). **(issue; owner for asset buy)**
2. Schedules: daily, weekly on chosen weekdays, monthly on a day (with "last day"), yearly, every N of those; a start date; an end: never, after N times, or on a date. (issue req. 2)
3. Rules run by themselves on the due Vietnam date, catch up after an outage, and never create the same occurrence twice. (issue req. 3, 10)
4. Transactions made by a rule carry a small "repeats" mark and link to the rule. (issue req. 4)
5. Edit one occurrence (only that one changes) or edit the rule (future occurrences only). Pause, resume, delete (deleting keeps the transactions made). (issue req. 5, 6)
6. See the next 30 days of occurrences across all rules, with their total. (issue req. 7)
7. "Ask me for the amount" rules, and the check-in, both through the "to confirm" list. **(owner)**
8. Notice repeated manual entries and offer to make a rule. **(owner)**
9. Budgets take fixed payments still due this period into account. **(owner)**

### Non-goals
- Reminders by push, email or SMS (issue; Phase 2 rule 9). The check-in lives only inside the app.
- Recurring group expenses; bills with due dates (issue).
- Recurring **sells** (my call: sells are not planned on a schedule).
- A buy rule that plans a fixed number of units. Buy rules plan a **fixed amount of money**. **(owner)**
- Merging the "to confirm" list with the review inbox (#118). #118 decides that.

### Anti-goals (a failure even if it works)
- A duplicate occurrence, ever, including when the job runs twice or overlaps.
- A forgotten rule recording for months with nobody asked.
- Nagging: a rule the owner actively looks after asking "still happening?" anyway; a dismissed rule suggestion coming back.
- An item waiting in "to confirm" moving any balance, report, budget "spent", or holding.
- Editing a rule rewriting history (past transactions change).
- Deleting a rule deleting money that was recorded.

## 3. Decisions

| # | Decision | Source |
|---|---|---|
| R1 | **Rule types:** expense, income, transfer (between two own wallets, made the same way the entry form makes a transfer pair), asset buy. A rule holds what the entry form holds for that type: amount, wallet(s), category, tags, note; for a buy also the asset and fee. | issue req. 1; owner (buy) |
| R2 | **Three ways to create a rule:** (a) "+" on the Định kỳ screen; (b) a **"Lặp lại" (repeat) field in the personal entry form**, so saving a new transaction can also start a rule from it, with the saved transaction as its first occurrence; (c) **"Lặp lại giao dịch này"** on a transaction's detail. | issue req. 1; my call for (b) |
| R3 | **Schedule** as in issue req. 2. "Every N" applies to each unit. Monthly on day 29–31 or "last day" falls on the month's last day in short months; the following month returns to the chosen day (a 31st rule in February runs on 28/29 Feb, then 31 March). Yearly on 29 February runs on 28 February in other years. Weekly with several weekdays: each chosen weekday is one occurrence. | issue req. 2; my call (clamping detail) |
| R4 | **Vietnam dates.** All due dates are calendar dates in UTC+7. An occurrence is due once the Vietnam date reaches it; the hourly job's first run after 00:00 Vietnam time (17:00 UTC) records it. | issue req. 10 |
| R5 | **Exactly once.** An occurrence is identified by (rule, scheduled date). Each one ends up in exactly one state: recorded, waiting in "to confirm", skipped, or not made (paused/ended/deleted). The database enforces it with a unique key, so a second run or an overlapping run cannot insert it again. The scheduled date stays the identity even when the owner moves the transaction's date. | issue req. 3 |
| R6 | **Catch-up.** After a missed run, the next run makes every missed occurrence, once each, each dated on its own scheduled date. Paused time is **not** caught up: resuming continues from the first scheduled date after today. | issue req. 3; my call (paused) |
| R7 | **Marked and linked.** A rule's transaction has `source = 'recurring'` (the #113 field) and shows a small repeat icon in lists and on its detail, with "Lặp lại hằng tháng · Xem quy tắc" linking to the rule. If the rule is deleted the icon stays and the link says the rule was deleted. | issue req. 4; my call (wording) |
| R8 | **Edit one occurrence:** a recorded occurrence is a normal transaction; editing it changes only it, never the rule. | issue req. 5 |
| R9 | **Edit the rule:** applies to occurrences not yet made. Recorded transactions never change. Items already waiting in "to confirm" keep their pre-filled values (the owner can change them when confirming). Changing the schedule never back-fills dates before the change. | issue req. 5; my call (waiting items, no back-fill) |
| R10 | **Pause, resume, delete.** Pause stops new occurrences; waiting items stay. Resume: R6. Delete keeps every recorded transaction (R7) and removes the rule's waiting items. | issue req. 6; my call (waiting items) |
| R11 | **"Ask me for the amount"** (Hỏi số tiền mỗi lần): a per-rule switch. A due occurrence goes into "to confirm" pre-filled with the rule's usual values instead of being recorded. **Always on for buy rules** (§5), off by default for others. | owner; my call (buys, from the code) |
| R12 | **The check-in** ("Còn dùng không?"): automatic rules ask on a rhythm worked out from how often they repeat, never set by the owner. See §4. | owner ("depend on the rule, as natural as possible"; rhythm confirmed) |
| R13 | **Stop after a few reminders.** If the check-in stays unanswered, the rule keeps recording for a grace period, then **pauses** itself (an ordinary pause: nothing deleted, one tap to resume). See §4. | owner (stop after a few reminders); my call (= pause) |
| R14 | **Anything the owner does with a rule counts as confirming it:** creating, editing, resuming, editing or confirming one of its transactions, answering its check-in. | my call, shown to the owner without objection |
| R15 | **Upcoming:** the next 30 days of occurrences of active rules, in date order, with a total. Totals are per currency and never converted; money out (expenses and buys) and money in (income) are totalled separately; transfers are listed but not totalled. "Ask me" occurrences show their usual amount with "≈". | issue req. 7; my call (split totals) |
| R16 | **Rule suggestions** ("Lặp lại tự động?") as in §6. | owner (yes); my call (detection) |
| R17 | **Budgets see what is still due** as in §7. | owner (yes); my call (how) |
| R18 | **No push, email or SMS** about any of this. | issue; Phase 2 rule 9 |
| R19 | **Personal area switched off:** the job skips that user's rules entirely (nothing recorded unseen). Switching back on continues from the first scheduled date after that day, like a resume (R6): no catch-up, and every rule's check-in clock restarts. | my call |
| R20 | **Something a rule uses goes away.** Wallet deleted or archived, category deleted, asset removed: the rule **pauses itself** and a "đã tạm dừng" item says why ("Ví Techcombank đã được lưu trữ") with Sửa quy tắc. Category merged (#155): the rule follows the category it was merged into, as transactions do. Tag deleted: the tag is dropped from the rule and the rule carries on. The job never fails a rule every hour: a rule it cannot write pauses with a reason. Deleting and archiving are never blocked by rules. | my call |
| R21 | **The home row's figure** is money going out (expenses and buys) in the next 30 days in VND, the app's main currency. Other currencies and money coming in show only on the Định kỳ screen (R15). | my call |

## 4. The check-in rhythm

The rhythm depends on how far apart a rule's occurrences are (its interval). **(owner confirmed the table)**

| Interval | Asks "still happening?" | Pauses if unanswered after | Approx. |
|---|---|---|---|
| under 7 days (daily, several weekdays) | 30 days after it was last confirmed (R14) | 14 more days | daily: ask monthly, pause 2 weeks later |
| 7 days to under 1 month (weekly, every 2 weeks) | 60 days after last confirmed | 3 more occurrences | |
| 1 month to under 1 year (monthly, quarterly) | 6 months after last confirmed | 3 more occurrences | |
| 1 year or more | every occurrence: it waits in "to confirm" like an "ask me" occurrence | | |

- The check-in is **one item** in "to confirm" per rule; it does not multiply. It shows how long the rule has recorded and when it will pause ("Sẽ tạm dừng sau 3 lần nữa nếu chưa trả lời").
- Answers: **Vẫn dùng** (confirm, rhythm restarts) or **Tạm dừng** (pause now). Tapping the item opens the rule, so the owner can also edit or delete it.
- **"Ask me" rules have no check-in** (each confirm or skip already proves the rule alive). Their safety: if **3 occurrences of one rule are waiting** at once, the rule pauses; the waiting items stay. The same applies to yearly rules. (my call)
- When a rule pauses itself, the check-in item becomes a "đã tạm dừng" item with **Tiếp tục** (resume), so the owner learns it happened. It leaves the list when resumed or dismissed.

## 5. Asset buy rules **(owner)**

- A buy rule plans a **fixed amount of money** each time (for example 5.000.000₫ a month into E1VFVN30), not a fixed number of units. It stores the asset, the paying wallet, the amount and the usual fee.
- "Ask me" is on by default (R11). Confirming as-is records a buy of the planned amount; **"Sửa"** opens the **real buy form** (the one #157 built), pre-filled, where units, price, total, fee, date and wallet can all change before saving. The resulting buy updates holdings exactly as a manual buy does.
- **"Ask me" is always on for buy rules** and cannot be turned off: a buy needs its units to save (`apps/api/src/personal/entries.ts` rejects a buy without a valid quantity), and only the owner knows how many units the order filled. (my call, from the code)
- Editing a recorded buy works as editing any buy today.

## 6. Rule suggestions (my call for detection; owner wanted it)

- **Trigger:** after the owner saves a manual expense or income, look for the same pattern: same type, category and wallet; amount within 10%; roughly the same day (±3 days) in each of the **last 3 months** (monthly), or the same weekday in each of the **last 4 weeks** (weekly).
- **Not offered** when an existing rule (active or paused) already covers that category and wallet with an amount within 10%, or when this pattern was dismissed.
- **Shown** as one item in "to confirm": "Bạn đã ghi “Internet · 250.000₫” khoảng ngày 5 trong 3 tháng. Lặp lại tự động?" **Tạo quy tắc** opens the rule form pre-filled (schedule from the pattern, start = next expected date). **Không** dismisses it for good (stored, so it never returns for that category + wallet + amount band).
- The check runs inside the save request, bounded (one indexed query over that user's last ~100 days of that category).

## 7. Budgets and what is still due **(owner: yes)**

- On a budget's page and its row, a line: "Còn 2 khoản cố định sắp tới: 600.000₫" when active rules (including "ask me", at their usual amount) will add expenses inside that budget's scope (B1–B3 of the budgets design) before the period ends.
- The **pace figure** (budgets B9) uses what is left **after** those: (limit − spent − still due) ÷ days left. The budget's **state** (over / too fast / near) stays based only on what was actually spent, so a planned payment never makes a budget look over. (my call)
- Waiting items in "to confirm" count as still due (they are not spent yet).

## 8. Screens **(owner chose the shape; layout details are the builder's with /impeccable)**

Phones first at 375px; Vietnamese first; new lines marked `// REVIEW`. Real components, wrappers first, theme colours only.

1. **Sổ chi tiêu (home):** one row in the grouped list after Báo cáo: **"Định kỳ & chờ xác nhận"** (repeat icon), sub-line "4 quy tắc · 30 ngày tới 7.450.000₫", and a count pill when anything waits. **(owner: option B, with the confirmation combined into the recurring row)** Shown once the owner has a wallet (my call).
2. **Định kỳ screen** (new route, e.g. `/recurring`), top to bottom **(owner)**:
   - **Chờ xác nhận · N**, with the note "Chưa tính vào số dư" (not counted yet). Items: "ask me" occurrence (Xác nhận / Sửa / Bỏ qua), check-in (Vẫn dùng / Tạm dừng), self-paused notice (Tiếp tục), rule suggestion (Tạo quy tắc / Không). Hidden when empty.
   - **30 ngày tới** with its totals (R15).
   - **Quy tắc · N:** each rule with its schedule in words ("Ngày cuối mỗi tháng"), amount and next date; paused rules marked, with Tiếp tục. "+" in the header creates one. Empty state explains rules and offers "+".
3. **Rule form:** the entry form's fields for the type plus a schedule section (repeat, every N, weekdays / day of month / last day, start, end) and the "Hỏi số tiền mỗi lần" switch. Rule detail offers Sửa, Tạm dừng/Tiếp tục, Xóa (delete says the recorded transactions stay).
4. **Entry form:** the "Lặp lại" field (R2b). **Transaction detail:** the repeat mark + link (R7), and "Lặp lại giao dịch này" (R2c).
5. **Confirm with changes:** "Sửa" on a waiting item opens the entry form (or buy form) pre-filled; saving confirms the item.

The home row's name is the right size for now. When #122 and #123 add their own planned items (split suggestions, loan payments) to the same list, those tickets may rename the row to something broader (e.g. "Chờ xử lý") and decide whether it joins the #118 inbox. (my call, raised with the owner)

## 9. The "to confirm" list as a shared piece (issue req. 9)

A **planned item** is a stored record owned by one user: a kind (here: `recurring_occurrence`, `recurring_checkin`, `recurring_paused`, `rule_suggestion`; later features add their own), a pointer to what produced it, a due date, a pre-filled transaction draft where relevant, and a status (waiting / confirmed / skipped / dismissed). Its rules:

- A waiting item **affects no balance, report, budget "spent", holding, or transaction list**. Confirming creates a normal transaction through the same write path a manual entry uses (balance cache, sync, budgets all follow). (issue req. 9)
- The list screen renders each kind with its own actions; other features register a kind with a renderer and a confirm handler. The storage and list API know nothing kind-specific beyond that.
- Confirm and skip are idempotent: confirming twice records once.

## 10. Data (constraints; the builder designs the tables)

- New tables only (Phase 2 rule 1). At least: rules (with schedule, template, ask-me flag, paused/ended state, last-confirmed date, next due date), rule tags, planned items, dismissed suggestions. Index rules by next due date so the job finds due rules without scanning.
- **Linking a transaction to its rule and occurrence** without a new column: `personal_transactions` already has `source` and `external_ref` with a unique index on (user, source, external_ref) where external_ref is set. `source = 'recurring'`, `external_ref = '<ruleId>:<YYYY-MM-DD>'` gives both the link and the exactly-once guarantee for recorded occurrences for free (checked: nothing writes `external_ref` today). Planned items need their own unique key on (rule, scheduled date) too. Transfer pairs: both rows carry the same rule link; the builder makes the key unique per pair (e.g. a suffix on the incoming row). (my call)
- Personal data stays private: every route behind the shared personal guard; a test from a second account; a test that a user with the personal area off sees and reaches nothing new.

## 11. Cost (Cloudflare free plan)

The hourly job (`0 * * * *` in `apps/api/src/index.ts`, beside the existing work) adds one task: process due rules.

- **Per run:** pick up to **25 due rules**, oldest due first; per rule make at most **31 occurrences** in one run (so a daily rule after a month-long outage catches up in one go, a longer outage over several runs). Each rule's writes go in one D1 batch. Target: **≤ 40 queries per run** including the pick query. (my call; builder may tune within the 50 limit)
- **Beyond the cap:** remaining due rules wait for the next hour, oldest first; nothing is lost or duplicated (R5). 25 rules × 24 runs = 600 rule-runs a day, far above what one owner needs; if ever exceeded, rules run a few hours late, never twice. The builder logs when a run hits the cap.
- **Rows:** a recorded occurrence writes roughly the transaction, its tags, the balance cache row and the sync row (≈5 rows); a full-cap day stays far below 100,000 written. Reads are indexed and bounded.
- Each new request (list, confirm, skip, create/edit rule, upcoming) states its query count in the plan, each well under 50. Upcoming is computed from rules (no rows stored for the future).

## 12. Done when (issue)

- Tests that advance time: a monthly rule created today records on its due date exactly once, including after a simulated missed run and when the job runs twice.
- Rules on the 29th, 30th, 31st and "last day" behave correctly in February (leap and non-leap).
- Pause, resume (no catch-up of paused time), edit-one and edit-rule behave as described.
- Check-in: asks on the rhythm in §4, pauses after the grace, and R14 actions reset it.
- "Ask me" items move nothing until confirmed; confirming with a changed amount/date records that; skipping records nothing and is never re-made.
- Guard tests: second account, personal area off.
- `npm test`, `npm run typecheck`, `npm run lint`, Playwright `golden-path` and `walkthrough` pass.
- The owner confirms they can stop entering their repeating items by hand.

## 13. Left to the builder

Table and column names; the rule form's exact layout (through /impeccable, reviewed live with the owner); Vietnamese and English copy (marked `// REVIEW`); where the occurrence maths lives (pure functions in `@cc/core` are natural so web and API agree on "next date" and "upcoming"); the job's batch size within §11; how the planned-item kind registry looks in code.

## Addendum: screens (owner approved 2026-11-28, /impeccable shape)

Mockup: `docs/superpowers/mockups/recurring/3-six-screens.html`. Real components only (grouped lists, `Button`, `Sheet`, `Pill`, `EmptyState`, `Icon`); theme tokens only. New Vietnamese lines are marked `// REVIEW`.

**Owner's picks:** schedule presets first; waiting items show their buttons in the row (no swipe); "30 ngày tới" lists each occurrence grouped by date.

1. **Home row** (after Báo cáo, once a wallet exists): repeat icon tile, title "Định kỳ & chờ xác nhận", sub-line "{n} quy tắc · 30 ngày tới chi {vndOut}" (no rules: "Tự ghi các khoản lặp lại"). A Turmeric pill "{n} chờ" only when items wait.
2. **Định kỳ screen** (`/recurring`), header "Định kỳ" with a "+" icon button (aria "Thêm quy tắc"):
   - **"Chờ xác nhận · {n}"**, right note "Chưa tính vào số dư". One grouped list; each item a row with its buttons under the text:
     - occurrence (Turmeric tile, the category icon): title = rule name/category, meta "Đến hạn {d/m}" (+ " · hỏi số tiền mỗi lần" for ask-me), amount (with "~" when ask-me). Buttons **Xác nhận** (primary) · **Sửa** (secondary) · **Bỏ qua** (ghost). A buy: meta "Đến hạn {d/m} · nhập số CCQ khi xác nhận", buttons **Nhập & xác nhận** (opens the buy form) · **Bỏ qua**.
     - check-in (Turmeric tile): "{name} còn dùng không?", meta "{amount}/{unit} · tự tạm dừng sau {n} lần nữa nếu chưa trả lời" (short rules: "…sau {n} ngày…"); **Vẫn dùng** · **Tạm dừng**.
     - paused notice (Turmeric tile): "Đã tạm dừng {name}", meta the reason ("Chưa trả lời 3 lần" / "Ví đã bị xóa" / "Danh mục đã bị xóa" / "Tài sản đã bị xóa"); **Tiếp tục** · **Bỏ qua**.
     - suggestion (Jade Mist bulb tile, not Turmeric): "Tự ghi {category} mỗi tháng?" (weekly: "mỗi tuần"), meta "{amount} quanh ngày {d}, đã 3 tháng liền" (weekly: "vào {weekday}, đã 4 tuần liền"); **Tạo quy tắc** (secondary) · **Không** (ghost).
     Hidden when empty.
   - **"30 ngày tới"**, right "chi {out} · thu {in}" per currency (VND first). Date sub-labels "Thứ Sáu, 5/12"; rows: category tile, name, wallet, signed amount (expense/buy Lychee "−", income Leaf "+", transfer neutral "{from} → {to}"). Empty: "Không có khoản nào trong 30 ngày tới".
   - **"Quy tắc · {n}"**: row = tile, name, meta "{schedule in words} · lần tới {d/m}" (ask-me: "· luôn hỏi"), amount. Paused: muted tile, meta in Turmeric-ink "Đã tạm dừng · {reason}", secondary **Tiếp tục**. Rows link to rule detail.
   - **Empty state** (no rules, nothing waiting): title "Chưa có khoản định kỳ", line "Tiền nhà, lương, Netflix… ghi một lần, CoinCrew tự ghi các lần sau.", button "Thêm quy tắc".
3. **Schedule in words:** "Hàng ngày", "Mỗi {n} ngày", "{Thứ Hai} hàng tuần" / "{T2, T4} hàng tuần", "Mỗi {n} tuần vào {…}", "Ngày {d} mỗi tháng", "Ngày cuối mỗi tháng", "Mỗi {n} tháng, ngày {d}", "Ngày {d/m} hàng năm".
4. **Entry form "Lặp lại" row** (repeat icon; value "Không lặp" or the schedule in words in Jade). Sheet "Lặp lại": Không lặp · Hàng ngày · "{weekday} hàng tuần" · "Ngày {d} hàng tháng" (or "Ngày cuối hàng tháng" when the date is the month's last day) · "Ngày {d/m} hàng năm" · "Tùy chỉnh…", with a hint "Từ lần này, CoinCrew tự ghi khoản này đúng ngày. Lần tới: {d/m}." Picking closes the sheet.
5. **"Tùy chỉnh lặp lại"** (full sheet/page): "Mỗi [n]" + segmented Ngày/Tuần/Tháng/Năm; weekly: weekday chips T2…CN; monthly: segmented "Ngày {d}" / "Ngày cuối tháng" with the note "Tháng không có ngày {d} sẽ ghi vào ngày cuối tháng." (d ≥ 29); Bắt đầu; Kết thúc (Không bao giờ / Vào ngày / Sau {n} lần); switch "Hỏi số tiền mỗi lần" with "Dùng khi số tiền thay đổi (điện, nước). Khoản sẽ chờ bạn xác nhận." (forced on and disabled for a buy: "Mua tài sản luôn chờ bạn nhập số lượng."); Jade Mist note "Thỉnh thoảng CoinCrew sẽ hỏi bạn còn dùng khoản này không, để không ghi mãi một khoản đã hủy."; primary **Xong**.
6. **Rule detail** (`/recurring/:id`): header = name with a pen icon button (Sửa); summary card "{Chi|Thu|Chuyển|Mua} · {schedule}", the amount (display), "Lần tới {d/m} · {wallet} · đã xác nhận {d/m}"; "Đã ghi" list of the rule's transactions (latest 10); buttons **Tạm dừng**/**Tiếp tục** (secondary) and **Xóa quy tắc** (Lychee-outline ghost) with the line "Xóa quy tắc không xóa các giao dịch đã ghi." Delete asks to confirm in a sheet. Editing says "Thay đổi chỉ áp dụng cho các lần sau."
7. **Repeat mark:** list rows of rule-made transactions add a 12px repeat icon + "Lặp lại" to the meta line. Transaction detail: a row "Tự ghi theo quy tắc “{name}”" / "{schedule}" linking to the rule; on a manual expense/income/buy/transfer instead a Jade row "Lặp lại giao dịch này" (opens the rule form pre-filled).
8. **Budget "still due":** a hatched primary segment after "spent" on the bar; line (repeat icon) "Còn {n} khoản định kỳ sắp tới · {amount}"; pace line "Sau đó, mỗi ngày còn khoảng {x} ({days} ngày)". Hidden when n = 0. Budget state is unchanged by still-due.
9. **Confirm feedback:** snackbar "Đã ghi {name}" after Xác nhận; "Đã bỏ qua" with Undo not offered (skip is final); "Đã tạo quy tắc"; errors as `InlineError` in the item row.

