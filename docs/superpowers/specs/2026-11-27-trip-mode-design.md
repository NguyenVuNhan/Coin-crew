# Trip mode: tag a trip's expenses by itself, and see what the trip cost

Date: 2026-11-27 · Issue: #158 (Phase 2 · Stage 1 follow-up to #116; epic #55) · Builds on PR #159 (`feat/budgets`, budgets for #116) and its design `2026-11-26-budgets-design.md`. Also builds on `2026-11-16-wallets-and-transactions-design.md` (#113, tags), `2026-11-21-group-shares-in-spending-book-design.md` (#114) and `2026-11-24-reports-spending-and-income-design.md` (#115).

Mockup (brainstorm wireframe, layout only): `docs/superpowers/mockups/trip-mode/trip-overview.html`. Option **A** (its own trip page) was chosen.

> **The Phase 2 rules from issue #116 apply unchanged** (summarised in the budgets design): additive migrations only (new tables, never a column on an existing table); no edits to the group money code listed in #116; never edit or delete an existing test; at most 50 queries per request; nothing new visible or reachable with the spending book switched off; personal data is private; hand-written SQL migrations; money is whole numbers in the smallest unit; no push, SMS or email about personal money; never use the name "ledger"; same screens in `apps/web` and `apps/zalo`.

## 1. Why

The owner came back from a trip (Đà Lạt) feeling they had spent too much. To find out, they had to filter for exactly the right transactions by hand, and even then they had no clear overview. Now that budgets exist (#159), they also want to **plan** a trip: set a limit before leaving and watch it while travelling.

Trip mode does two jobs:
1. **Put the trip's tag on new expenses by itself** while the trip is on, both the owner's own expenses and their share of expenses in the groups they travel with.
2. **Read the tag back** on a trip page that shows what the trip cost.

The budget feature is only a shared part: an optional limit is an ordinary one-off budget from #159, and the trip page reuses budget UI pieces. The owner's words: *"Trip mode targets adding tags and reading tags; the only thing in common with budgets is the same component."*

## 2. Goals

- Starting a trip takes a few seconds: name, dates, the groups (or none, when going solo), and an optional limit.
- During the trip, no expense needs tagging by hand, and the one that should not count (for example a bill at home) can be untagged in one tap.
- After the trip, one page answers "what did it cost?": total, against the limit, own spending vs group shares, by category, by day, in every currency used.

## 3. Non-goals

- Anything #159 already does: the budget itself, its warnings, its page and history. The trip's limit **is** a #159 budget.
- A separate "event" concept apart from tags: the trip is built on a tag.
- Converting money at market exchange rates. There are none in CoinCrew.
- Tagging income, transfers, asset trades or settlements.
- Changing anything in a group for other members. Tags are the owner's private data.
- Notifications of any kind.

## 4. Anti-goals (would make this a failure even if it works)

- The trip total disagreeing with the report filtered to the same tag and dates.
- Group shares from an unrelated group (a household or roommates group at home) landing in the trip.
- Adding up different currencies as if they were the same, or showing a ₫ total that pretends to be exact.
- Writing anything into the group money code paths to make shares carry the tag (#114 rule: shares are *read, never copied*).

## 5. Decisions

| # | Decision | Who |
|---|---|---|
| T1 | **A trip is a tag plus dates.** Starting a trip picks an existing tag or creates one (its name, for example "Đà Lạt"), with a **start** and an **end** date. The tag stays an ordinary tag: it can be filtered in reports and edited like any other. **A tag may be reused by later trips** (Đà Lạt again next year), and each trip counts only its own dates. | issue; owner; my call (reuse) |
| T2 | **Counted range = "counts from" → end.** A trip also has a **counts-from** date, so bookings made before the trip count (bus, tickets, a hotel deposit). It defaults to the day the trip was created (or the start date, if that is earlier), and the owner can move it earlier. The trip page and the limit count tagged items from counts-from through end. | owner (bookings before the trip); my call (default, editable) |
| T3 | **Optional limit = a #159 one-off budget** on the trip's tag over the counted range (T2), in one currency (default ₫). Creating a trip with a limit creates that budget, which then behaves like any budget: Budgets page, entry-form warnings, its own page. **The trip stores its budget's id and the limit follows the trip:** changing the trip's dates (or stopping it early) moves the budget's one-off range with it, and the limit can be added, changed or removed from the trip's edit form. The budget's wallets use #159's defaults (B3), which already leave out "not in reports" wallets as the report does. If the owner deletes the budget from the budget page, the trip simply has no limit. | owner; my call (link, follows the trip) |
| T4 | **Groups:** when starting a trip, the owner picks zero or more CoinCrew groups they are travelling with. Zero means going solo. | owner |
| T5 | **Auto-tag own expenses during the trip:** every personal expense (type `expense`) dated from start through end gets the trip tag when it is created. In the entry form this shows as a pre-filled tag chip the owner can remove before saving. It follows the date: picking a date outside the trip removes the pre-filled chip, and picking one inside adds it. | issue; owner |
| T6 | **Before the trip, own expenses are only suggested:** for an expense dated in the lead-up (counts-from up to the day before start), the entry form shows the upcoming trip's tag as a **suggested chip, not pre-filled**, and one tap adds it. Ordinary daily spending therefore stays out of the trip. | owner |
| T7 | **Auto-tag group shares over the whole counted range:** the owner's share of an expense in one of the trip's groups, dated from counts-from through end, carries the trip tag, lead-up included (the groups were picked for this trip). Shares from other groups never do. If two trips' ranges both cover a share (one trip's lead-up overlapping an earlier trip), the trip whose start→end covers it wins, otherwise the one that starts soonest. A share never carries two trips' tags automatically. | owner; my call (tie-break) |
| T8 | **Removing the tag from one item** (own expense or group share) is permanent for that item: it does not come back. | issue; owner |
| T9 | **Late entries count:** an expense or share added after the fact but dated inside the trip follows T5–T7 (an expense forgotten and entered at home still gets the tag). | owner |
| T10 | **Existing items: ask each time.** When creating or editing a trip makes its dates cover items that already exist, the owner is asked, for example "Gắn tag Đà Lạt cho 12 khoản chi đã có trong những ngày này?", with the count. **Yes** tags the existing own expenses dated start→end and the existing shares from the trip's groups dated counts-from→end. **No** tags nothing old. Existing own expenses in the lead-up are not included: like T6, those are tagged by hand. | owner (ask each time); my call (what yes covers) |
| T11 | **Expenses only.** Income, transfers, asset trades, balance adjustments and settlements are never tagged by trip mode, which matches what reports and budgets count as spending. | owner |
| T12 | **Planned ahead, one on at a time.** Trips can be created for future dates and switch on by themselves on their start date. Several upcoming trips may exist. **Start→end ranges may not overlap**, so only one trip is ever on. Lead-ups may overlap another trip (T7 decides shares). | owner |
| T13 | **Ending:** a trip ends by itself after its end date, or earlier when the owner stops it, which moves the end date to today (and the budget's range, T3). Tags already on items stay. | issue; owner |
| T14 | **Row on Sổ chi tiêu.** While a trip is on: "Đang đi Đà Lạt", the day of the trip ("ngày 2/3"), and the limit bar when there is a limit. When no trip is on but one is upcoming: "Sắp đi Đà Lạt · còn 5 ngày", with the bar if the lead-up already has spending. Tapping either opens the trip page. | issue; owner (mockup); my call (upcoming row) |
| T15 | **Trip page (option A):** name, dates and groups; total spent; when there is a limit, the over/under figure and bar; **own spending vs share of group expenses**; spending by category; spending by day (lead-up days grouped as "Trước chuyến đi"); a link to the trip's transactions (the existing list filtered to the tag and the counted range). It works before, during and after the trip. A trip without a limit gets the same page without the bar. | owner (mockup A); my call (lead-up grouping, works any time, no-limit version) |
| T16 | **Currencies are shown separately:** one total per currency (for example "3.200.000₫" and "4.500 ฿"), and the category and day breakdowns per currency. Under the totals, **"≈ … ₫ in total"** converts foreign spending at what the owner actually paid for that currency (the wallet's ₫ cost basis that `libs/shared/core/src/wallets.ts` already works out per entry, `entryVnd`). When any foreign row has no ₫ cost (the currency was never bought with ₫), the ≈ line is left out and the separate totals stand alone. The limit stays in its one currency. | owner |
| T17 | **Trips list:** one "Chuyến đi" page with current, upcoming and past trips, each opening its trip page. Starting a trip is reached from Sổ chi tiêu. | owner |
| T18 | **What counts follows the report's rules exactly** (#115 §4 and budgets B2): the same rows, exclusions ("not in reports" wallets and rows, pending group rows, fund-paid and planning expenses) and the owner's share for group expenses. The trip page's figure for one currency equals the report for the trip's tag, counted range and that currency. Add a test for this, including two trips on the same tag. | anti-goal; my call |
| T19 | **Editing a trip:** name, dates, counts-from, groups and limit can change while T12 holds. Changing them changes what gets tagged from then on, and existing items are handled by T10. Items already tagged keep their tag. | my call |
| T20 | **Deleting a trip** removes the trip and its linked budget. The tag and its links stay, because they are the owner's data and can be deleted as a tag. | my call |

## 6. Constraints the builder must respect

- **Base branch:** `feat/budgets` (PR #159), not `main`. That PR is not merged yet. Its migration is `0037`, so this one is the next number.
- **Name in code:** `trips` already means a **CoinCrew group** throughout the code (`trips` table, `apps/api/src/trips/`, `tripId`). The new concept needs a different code name (for example `personal_travels` / `travel`) so it never gets confused with groups. In the UI it is "Chuyến đi" / "Trip".
- **Group shares are read, never copied** (#114). The owner's per-share tags already live in `personal_group_link_tags` (keyed by user and group transaction `rootId`). Nothing may be added to any group write path. So the T7 tag for shares must come either from the personal side writing link-tag rows (for example when the personal copy syncs or loads, for shares in the trip's groups and dates), or from a rule applied when rows are read (a trip's groups and dates plus a list of items untagged by hand). **The mechanism is the builder's choice**, but it must satisfy all of these:
  - reports, budgets (which run client-side from the synced local copy) and the trip page all see the same tags;
  - removing the tag from one share sticks (T8), and the T10 "yes" covers existing shares too;
  - edits, rollbacks and removals in the group are reflected the way #114 requires.
- **Own expenses:** the tag is a normal `personal_transaction_tags` row written when the expense is saved. Paths that create expenses without the entry form (if any exist, for example imports via `source`) also apply T5 (pre-filled tagging during the trip, never the T6 suggestion). That is the builder's call, but the result must be consistent with T5 and T9.
- **Spending book off** → trips, the row and the pages are hidden and unreachable.
- **Budget pieces are reused, not copied:** the bar (`BudgetBar`), the category rows, and `listCountedSpending` in `@cc/core` for the counting.
- **UI:** follow `DESIGN.md` and `PRODUCT.md`, use the app wrappers (`Sheet`, `Button`, `Pill`, `Amount`), and keep money in `tabular-nums`.

## 7. Left to the builder

- Table shape for trips and their groups (additive), and the share-tagging mechanism within §6.
- How "by day" is drawn (rows as in the mockup, or a small chart).
- Copy, with Vietnamese first; `// REVIEW` on new vi lines as in #159.
- What the row shows on the trip's last day and the day after it ends.
- Final copy of the T10 question.

## 8. Interaction flow (approved 2026-11-27, `impeccable shape`)

Mockup: `docs/superpowers/mockups/trip-mode/trip-flow.html` (wireframes in the Jade tokens; build with the app's components). Mode: Operate, so we use patterns the owner already knows from Sổ chi tiêu and budgets.

1. **Trip row on Sổ chi tiêu** (owner: entry point is this row). One row in the top list, after "Báo cáo". It has three states:
   - **No trip on or upcoming:** "✈️ Chuyến đi", with a muted line. It opens the trips list.
   - **Upcoming:** "Sắp đi Huế", "còn 5 ngày", and what was already spent in the lead-up ("Đã chi trước 1.240.000₫").
   - **On:** "Đang đi Đà Lạt", "ngày 2/3", the budget bar with a today mark, what is left, and spent/limit.

   Upcoming and on open that trip's page. The bar follows the DESIGN.md budget bar rules (accent, Turmeric near the limit, Lychee over, always with words). With the spending book off, the row does not exist.
2. **Trips list "Chuyến đi"** has sections Đang đi / Sắp tới / Đã đi:
   - Past rows show the final total and the ending in words ("vượt 860.000₫", "không đặt hạn mức").
   - A fixed bottom action bar holds "+ Chuyến đi mới".
   - The trip page header can also reach this list.
3. **New / edit trip** is a `Sheet`:
   - **Tên chuyến (cũng là tag):** pick an existing tag or type a new one.
   - **Từ ngày / Đến ngày.**
   - **Counts-from:** a quiet line, "Tính cả chi tiêu trước chuyến từ hôm nay ✎", that opens a date pick.
   - **Đi cùng nhóm:** chips with "+ Chọn nhóm"; leave it empty for solo.
   - **Hạn mức (tuỳ chọn):** amount and currency.
   - **Saving:** one primary "Lưu chuyến đi". Future dates save the trip as upcoming.
   - **Overlap:** an overlap with another trip's start→end shows inline under the dates ("Trùng với chuyến Huế (20–23/12)") and blocks saving.
   - **Edit-only:** the edit sheet adds "Kết thúc sớm" (while on) and "Xoá chuyến đi", each as a ghost action with a confirm.
4. **Existing expenses question (T10).** A `Modal`/`Sheet` after saving, only when there is something to tag:
   - Title: "Gắn tag cho khoản chi đã có?"
   - Two rows: "N khoản bạn tự chi" and "N phần trong nhóm …", each with its total.
   - A note: "Bỏ tag từng khoản sau cũng được."
   - Buttons: primary "Gắn tag cho cả N khoản" and secondary "Chỉ từ giờ trở đi".
5. **Expense form trip row** (owner: its own row, always shown). It sits above the folded details, as one white row:
   - During the trip: "✈️ Chuyến đi Đà Lạt" with a 44px ✕ that removes it (no confirm; tapping again re-adds).
   - In the lead-up: "✈️ Thêm vào chuyến Huế +", a suggestion that adds it on tap.
   - Outside any trip's counted range: no row.
   - It re-evaluates when the date in the details changes.
   - The form has no general tag field today; tags stay editable in the transaction detail.
6. **Trip page.** The header holds the name and an ✎ icon button that opens the edit sheet. Below it, a meta line (dates · groups · state pill "Đang đi" / "Sắp tới" / "Đã xong"). Then:
   - **Summary card:** the total; the over/under line in words with icon and the bar (only with a limit); "Bạn tự chi" and "Phần của bạn trong nhóm".
   - **Breakdowns:** Theo danh mục (rows with bars); Theo ngày, with lead-up days grouped as "Trước chuyến đi".
   - **Transactions:** "Xem N giao dịch ›".
   - **Abroad:** one total per currency, then "≈ X₫ tổng cộng, theo giá bạn đã đổi …" when available. A currency switch (pills) sits above the breakdowns.
   - **Empty trip:** one line and the + hint.
