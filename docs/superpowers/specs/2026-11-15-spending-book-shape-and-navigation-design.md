# Sổ chi tiêu: the personal area's shape and navigation — design

Issue: [#112](https://github.com/NguyenVuNhan/Coin-crew/issues/112) (Phase 2 · Stage 1 · sub-task 01 of 12; epic #55). Blocks #113.
Status: shaped with the owner on 2026-11-15 (`/impeccable shape`, then a live review of the mockup). This document is the build reference.
Changed the same day, after the plan was first written: the owner replaced the hidden owner-only switch with a setting every signed-in user can use (S25), and the automatic first wallet with a popup (S26, S27).
Mockup: `docs/superpowers/mockups/v7-spending-book.html` (owner: "Looks good now").
Builds on: `2026-11-13-phase-2-personal-money-breakdown-design.md` (decisions D1–D7, D9 and the Phase 1 guard rules apply unchanged; D8 is replaced by S25).

Lines marked **(owner)** are the owner's decisions. Lines marked **(my call)** were proposed by the writer and not answered; the owner may overrule them.

## 1. Intent

Phase 2 adds a personal side to CoinCrew: wallets, transactions, reports, budgets, a review inbox and planning. This sub-task draws the map once, so that no later sub-task invents its own place, and builds the smallest piece of it: a per-user switch, the renamed first section and its empty screen.

## 2. Decisions

| # | Decision | Source |
|---|---|---|
| S1 | **One merged main screen.** There is no separate personal section. For a switched-on user the main screen shows their whole financial status, and "Khoản chi nhanh" is folded into it. | owner |
| S2 | **It is called "Sổ chi tiêu" / "Spending book".** This is the nav label and the screen title, replacing "Khoản chi nhanh" for switched-on users. | owner |
| S3 | **Quick expenses are a kind of transaction.** Personal transactions, quick expenses with a person and the owner's shares of group expenses appear in one stream. This resolves #100 for switched-on users. | owner |
| S4 | **The main screen is an overview of widgets.** Each widget shows a little and opens its own page for more. The full transaction list is not on the main screen. | owner |
| S5 | **Few figures on the overview.** Below the summary card, widgets show shape and words, not amounts. Recent transactions are the exception. The owner's words: with amounts everywhere the app "looks like a receipt". | owner |
| S6 | **The top figure is the total across wallets**, with this month's spending and income under it. One line per currency when there are several. | owner |
| S7 | **"People owe you" is one row** that opens the per-person list on its own page. | owner |
| S8 | **Wallets are a pie chart** with a legend of names, no amounts. | owner |
| S9 | **No spending widget on the overview.** Spending by category lives in the Report view, reached from a "Báo cáo" row. | owner |
| S10 | **Budgets share one card**, a row per budget: name, status in words, bar. The bar and the words change colour when a budget is near its limit or over it. | owner |
| S11 | **"Báo cáo" and "Kế hoạch" are rows in the top list**, beside "Chờ xem lại" and "Mọi người nợ bạn". | owner approved as drawn |
| S12 | **"+" opens a short menu** on the main sections (expense, income, transfer, with a person), then the matching form. Inside a group it stays a group expense. When only one kind exists, the menu is skipped. | owner |
| S13 | **Every transaction names a wallet**, including a loan or a shared expense (the wallet the money left) and a repayment (the wallet it arrives in). | owner |
| S14 | **A default wallet**, set once in settings and prefilled everywhere, so a quick expense stays quick: amount, person, done. | owner |
| S15 | **Group expenses show as transactions and use the default wallet.** The wallet can be changed on a single transaction. | owner |
| S16 | **The transaction list is its own page:** grouped by day or by category inside a month, loaded a month at a time, with a filter. | owner |
| S17 | A wallet's balance drops only when money actually leaves it (table in section 6). | owner |
| S18 | Switched-on users see Sổ chi tiêu at `/trips`; the address does not change. | my call |
| S19 | The first-run popup (S26) is designed here and built in #113, when wallets exist. | my call |
| S20 | On a computer, a transaction's details open as a dialog, from #113 on. | my call |
| S21 | A budget counts as "near its limit" from 85%. Final value is #116's to set. | my call |
| S22 | Personal settings (wallets, categories, default wallet, later capture keys) sit behind a gear in the screen header. | my call |
| S25 | **Every signed-in user can turn the spending book on or off themselves**, with a setting in the account menu. It is off by default. This overrules decision D8 and issue #112's requirement 4 ("no visible way to turn it on"): there is no owner-only database switch. | owner |
| S26 | **Turning it on asks for a wallet.** A popup has the user create their first wallet and type how much they hold today. All their earlier expenses (quick expenses and their shares of group expenses) are attached to that wallet, and it becomes the default wallet. No wallet is created automatically. | owner |
| S27 | **Right after that, the wallet's balance is exactly the amount typed.** Earlier expenses show in the wallet's history and in reports but do not change today's balance. | owner |
| S28 | The popup shows whenever the spending book is on and the user has no wallet, so someone who turned it on before #113 shipped meets it on their next visit. | my call |
| S29 | Turning the setting off brings back today's app and deletes nothing; turning it on again restores everything. | my call |
| S30 | The setting's row carries a neutral "Thử nghiệm" (Beta) pill until sub-task 06 ships, because any friend can now turn on a feature that is still being built. | my call |

One consequence the owner accepted with S7: person pages are one tap further away for switched-on users than today. The ticket's requirement 3 ("the same number of taps as today") still holds for Groups, Activity, group pages and guest pages, and for every switched-off user.

## 3. Navigation

### Phones (below 1024px)

The floating footer keeps three sections and the "+" button. Only the first section changes, and only for switched-on users.

| Section | Switch off | Switch on |
|---|---|---|
| First | "Khoản chi nhanh" → `/trips` (Home) | "Sổ chi tiêu" → `/trips` (Sổ chi tiêu) |
| Second | "Nhóm" → `/groups` | unchanged |
| Third | "Hoạt động" → `/activity` | unchanged |
| "+" | quick expense, or group expense inside a group | the short menu (S12), or group expense inside a group |

The first section keeps `data-testid="nav-home"` and the `home` section id in both cases, so existing tests select it unchanged.

### Computers (from 1024px)

The 240px side panel keeps its three links with the same change of label. Sổ chi tiêu uses the wide layout in two columns: summary, top list and wallets on the left; budgets and recent transactions on the right.

### Places for every later sub-task

| Sub-task | Where it lives | Reached from |
|---|---|---|
| #113 wallets | Wallets page | the wallet pie's "Ví ›" |
| #113 transactions | Transactions page (S16) | "Giao dịch gần đây" → "Tất cả ›" |
| #113 forms | expense, income, transfer, with a person | "+" menu |
| #114 group shares | rows in the transaction stream | same stream |
| #115 reports | Report view | "Báo cáo" row |
| #116 budgets | Budgets page | budgets card → "Tất cả ›" |
| #117 recurring rules | personal settings; planned items join "Chờ xem lại" | gear; top list |
| #118 review inbox | Review page, with a count | "Chờ xem lại" row |
| #119 import | an action on the Review page | "Chờ xem lại" |
| #120, #121 capture guides | personal settings → capture | gear |
| #122 distribution and funds, #123 loan planner | Planning page | "Kế hoạch" row |
| per-person list (today's Home list) | People page | "Mọi người nợ bạn" row |

A row or widget appears in the built app only when its sub-task ships, and a widget hides when it has nothing to show.

## 4. The main screen

Top to bottom, as in the mockup:

1. **Summary card.** "Tổng tiền" and the total across wallets in the display size; "Tháng này chi" and "Thu" under it. Not tappable.
2. **Top list** (one grouped list): "Chờ xem lại" with a Turmeric count, shown only when something waits; "Mọi người nợ bạn" with avatars and the amount in Leaf; "Báo cáo"; "Kế hoạch".
3. **"Tiền đang ở đâu"** (wallets). A pie beside a legend of wallet names. Segments are tints of the theme accent, so the chart follows the theme and never uses a money colour. At most four segments; further wallets are grouped as "Khác". The pie carries a text alternative naming the order ("Vietcombank nhiều nhất, rồi …").
4. **"Ngân sách".** One card; the one or two budgets closest to their limit, a row each.

   | State | Bar | Words |
   |---|---|---|
   | Healthy | theme accent | plain, Stone Muted ("Còn gần một phần ba") |
   | Near the limit (from 85%) | Turmeric | "Sắp chạm mức", Turmeric ink, semibold |
   | Over | Lychee | "Đã vượt mức", Lychee, semibold |

   The words always change with the colour, so the state never depends on colour alone.
5. **"Giao dịch gần đây".** The latest few rows with amounts: personal transactions, quick expenses ("Với người khác") and group shares ("phần của bạn"), each naming its wallet.

### States

- **First run (on, no wallet).** From #113: the popup of S26 opens over the screen. It is a `Sheet` with a wallet name, a currency, "how much you hold today", and one primary button; closing it leaves the screen in the state below, and it returns on the next visit (S28).
- **Empty (on, no wallet, popup closed or not yet built).** In place of the summary card: two plain lines saying what a wallet is and that it comes first. From #113 a primary button, "Tạo ví đầu tiên", reopens the popup. Everything the user has today stays visible below it.
- **Loading.** Skeletons for the summary card, the top list and three transaction rows.
- **Error.** An inline error next to the block that failed; the rest of the screen still shows.
- **Ranges.** 1 to 10 wallets, 1 to 3 currencies, 0 to about 300 transactions a month, a review count of 0 to 99+.

### Transactions page (built in #113)

A month switcher; a view switch between by day (default) and by category; each group header carries its total; one month loads at a time and earlier months load on scroll. A filter icon opens a sheet (wallet, category, type, person, period); active filters show as removable pills. A filter that matches nothing shows one line and a "clear filters" button.

## 5. What this sub-task builds

Nothing below changes a Phase 1 table, test or money function.

### The per-user setting

- **Table** `user_personal_settings` (migration `0025_personal_area.sql`, hand-written; `schema.ts` kept in step): `user_id` primary key referencing `users.id`, `enabled` integer not null default 0, `updated_at` text not null. No row means off. It follows `user_notification_settings`; nothing is added to `users`.
- **`GET /me`** returns `personalArea: true` when on, and leaves the field out when off.
- **`PATCH /me/personal`** with `{ "enabled": true | false }`, for any signed-in user, sets their own row (S25). It is the only route that changes the setting.
- **Guard** `requirePersonal`, next to `requireUser`: it answers 403 when the setting is off. Every other Phase 2 route uses it.
- **First guarded route** `GET /me/personal`, returning an empty summary. It exists so the guard is exercised and tested now. **(my call)**
- **The setting's row** in the account menu, after Notifications: "Sổ chi tiêu", the "Thử nghiệm" pill (S30), one muted line saying what it is, and a switch. It saves on tap; a failed save shows the error under the row and flips the switch back. Guests have no account menu and never see it.

### The screen

- `/trips` renders `SpendingBook` (in `@cc/web-screens`) when `personalArea` is true, and today's `Home` otherwise. Guests and signed-out visitors never reach it.
- **People page** at `/people`: today's per-person list on its own page, reachable only with the switch on; with it off the address redirects to `/trips`.
- **What the screen shows in this sub-task:** the empty-state lines (no button and no popup, S19), the "Mọi người nợ bạn" row, and today's quick expenses and payments exactly as Home lists them, reusing Home's components. The owner loses nothing they have today. The unified stream replaces those tabs in #113 and #114. **(my call)**
- **"+"** still opens a quick expense, because it is the only kind that exists (S12).
- **Details on a computer** keep today's right-column behaviour for quick expenses until #113 (S20).
- **Copy** in `@cc/web-i18n`, Vietnamese first; new Vietnamese lines are marked `// REVIEW`.
- **Zalo Mini App:** same screen; the title is left-aligned and the header clears the capsule, as on every other screen.

### Cost (Cloudflare free plan)

| Action | Queries | Rows read | Rows written |
|---|---|---|---|
| `GET /me` | +1 | +1 | 0 |
| Any guarded route (the guard itself) | 1 | 1 | 0 |
| `GET /me/personal` | 1 (the guard) | 1 | 0 |
| Opening Sổ chi tiêu, empty | the same queries Home makes today, plus `GET /me/personal` | | 0 |
| `PATCH /me/personal` | 1 | 0 | 1 |

### Tests

- The guard refuses a signed-in user whose switch is off, and lets a switched-on user through.
- With the setting off: the nav shows "Khoản chi nhanh", `/trips` is Home, `/people` redirects, and `GET /me/personal` answers 403. The only new thing on screen is the setting's row.
- `PATCH /me/personal` turns the caller's own setting on and off, refuses a signed-out caller, and never touches another account.
- With the switch on: the nav shows "Sổ chi tiêu" on the phone and computer layouts, and the empty state renders.
- A second account cannot read another user's switch or personal summary through any route.
- No existing test is edited. `npm test`, `npm run typecheck`, `npm run lint` and the Playwright specs `golden-path` and `walkthrough` pass untouched.

## 6. How group and shared expenses meet wallets (for #113 and #114)

Recorded here because it shapes the stream; it is built later. Nothing is copied: group shares are read from the group's own rows (D2), so the amount always equals what the group screen says. The wallet link for a quick expense or a group share needs a new table keyed by the user and the transaction; the hidden "direct" group and the group money code are not touched (D1, rule 2).

| Case | Counts as your spending | Wallet |
|---|---|---|
| You paid the whole bill | your share only | drops by the full amount; the rest shows under "Mọi người nợ bạn" |
| Someone else paid | your share | unchanged until you settle up |
| You settle up | nothing new | drops by what you pay |
| Someone pays you back | nothing | rises by what arrives |

The wallet is the default wallet unless the owner changes it on that transaction (S14, S15). Records from before the wallet was created are attached to it without changing its balance (S26, S27); money still owed from before stays under "Mọi người nợ bạn" and raises the wallet when it is paid back. The owner approved this table on 2026-11-15 (S17). The simpler alternative (your share always leaves the default wallet on the day of the expense) was rejected because the wallet would disagree with the real bank balance whenever someone else paid.

## 7. Documents to update in the same pull request

- **`docs/navigation-map.md`:** the switch-dependent first section, `/people`, and the table in section 3.
- **`2026-11-13-phase-2-personal-money-breakdown-design.md`:** a dated note under D8 and under rule 5 pointing to S25, since both say there is no visible way to turn the area on.
- **Issue #112 and epic #55:** a comment recording the same change (the issue text says the opposite).
- **`PRODUCT.md`:**
  - the phase order matches GitHub (personal money is Phase 2);
  - "categories" and "currencies other than VND" leave "Not yet" for the personal side;
  - "QR pay gateway" is marked parked;
  - "bank-email capture" becomes spreadsheet import;
  - a new user description for the owner's personal use.
- **`DESIGN.md`:**
  - the overview pattern (summary card, top list, widgets that open their own page);
  - **The Quiet Overview Rule** (S5);
  - the wallet pie (accent tints, at most four segments plus "Khác", a text alternative);
  - the budget bar's three states, as a named use of Turmeric and Lychee under The Money Means Something Rule.

## 8. Anti-goals

- A nav whose shape differs between users: it is always three sections and "+".
- A tab strip across the main screen.
- Amounts on every widget.
- Cards inside cards, or money in the theme accent.
- Any personal screen or route reachable with the setting off. The one thing a switched-off user sees is the setting's own row in the account menu.

## 9. Left to later sub-tasks

- **#113:** the chart's implementation (a plain SVG is enough; no chart library is assumed here), totals across currencies, the short "+" menu's forms, the first-run popup that creates the wallet and attaches earlier expenses (S26–S28).
- **#114:** building the rule in section 6.
- **#116:** the "near the limit" threshold and how many budgets the card shows.
- **Not asked for, not included:** reordering or hiding widgets.

## 10. Addendum, 2026-11-16: the first wallet moves into this sub-task

The owner tested the build and found a dead end: after turning the setting on there was no popup and nowhere to create a wallet. They decided to build a minimal first wallet here instead of waiting for #113. This overrules S19 and the "no data model beyond the per-user switch" line in issue #112.

| # | Decision | Source |
|---|---|---|
| S31 | **The first wallet is built in this sub-task, minimal.** A wallet has a name and "how much you hold today". Editing, deleting, more wallets, the wallet list and the pie stay in #113. | owner |
| S32 | **VND only for now.** The table stores a currency per wallet, so #113 adds the choice without a data change. | owner |
| S33 | **Turning the setting on leads straight to the popup:** the account menu closes, the app goes to Sổ chi tiêu, and the popup opens. It also opens on any later visit while the person has no wallet (S28). Closing it leaves the empty state, whose button "Tạo ví đầu tiên" reopens it. | owner asked for the popup; the flow is my call |
| S34 | One wallet per person until #113; a second create is refused. The first wallet is the default wallet. | my call |
| S35 | With a wallet, the summary card replaces the empty state: "Tổng tiền", the amount in Ink, and the wallet's name. | my call |
| S36 | "Earlier expenses go to this wallet" is true by rule, not by copying: the default wallet is the wallet of every quick expense and group share once #113 and #114 show them. Nothing is written per expense now. | my call |

### Data and API

- **Table** `personal_wallets` (migration `0026_personal_wallets.sql`): `id` text primary key; `user_id` text not null, references `users(id)` on delete cascade; `name` text not null; `currency` text not null default `'VND'`; `start_amount` integer not null (whole units of the currency's smallest unit); `start_date` text not null (`YYYY-MM-DD`, the day it was created); `is_default` integer not null default 0; `created_at`, `updated_at` text not null. Index on `user_id`; unique index on `user_id` where `is_default = 1`, which also stops two first wallets from a double tap.
- **`GET /me/personal/wallets`** → `{ wallets: WalletView[] }`, oldest first. `WalletView` is `{ id, name, currency: 'VND', balance, isDefault }`; with no transactions yet, `balance` is `start_amount`.
- **`POST /me/personal/wallets`** with `{ name, startAmount }` → `201 { wallet }`. Name: 1 to 40 characters after trimming. Amount: a whole number from 0 to 1.000.000.000.000. A person who already has a wallet gets `409 ALREADY_HANDLED`.
- Both sit behind `requirePersonal`. No other account can read or create another person's wallet.

### Cost

| Action | Queries | Rows read | Rows written |
|---|---|---|---|
| `GET /me/personal/wallets` | 2 (guard, list) | 1 + wallets | 0 |
| `POST /me/personal/wallets` | 3 (guard, existing check, insert) | 2 | 1 |
| Opening Sổ chi tiêu | Home's queries + the wallet list | | 0 |
