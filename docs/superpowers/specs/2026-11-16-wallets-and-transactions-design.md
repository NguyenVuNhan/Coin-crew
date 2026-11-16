# Wallets and transactions (manual entry, categories, tags, currencies, investment wallets)

Issue: [#113](https://github.com/NguyenVuNhan/Coin-crew/issues/113) (Phase 2 · Stage 1 · sub-task 02 of 12; epic #55). Blocked by #112 (closed). Blocks #114.

Builds on: `2026-11-15-spending-book-shape-and-navigation-design.md` (decisions S1–S36 and its section 6 table) and `2026-11-13-phase-2-personal-money-breakdown-design.md` (D1–D9, the Phase 1 guard rules). Every "Rules for every Phase 2 sub-task" item in issue #113 applies unchanged; this document only adds to them.

Brainstormed with the owner on 2026-11-16. Each decision is marked **owner** (they said it) or **my call** (decided while writing; the owner can overrule).

## 1. Why

The owner keeps every money movement of the day in Money Lover: daily spending, money moved to a broker or an exchange, ETF and crypto buys, interest and fees. CoinCrew must hold the same by hand before anything is automated. On top of Money Lover, the owner wants the data recorded well enough that they can later ask: **which assets do I hold and how much**, and **what profit or loss did I make on each asset, and over how long**. This sub-task records those facts; the answers (reports) come in #115 and #122.

## 2. Goals, non-goals, anti-goals

**Goals**
- Wallets in several currencies (VND, USD, USDT at the start), of two kinds: everyday and investment.
- Expense, income and transfer entered by hand; categories with one level of sub-categories; free tags; an "exclude from reports" switch on every entry.
- Investment wallets that hold assets bought and sold with the wallet's cash, so holdings and their cost are always known.
- One VND total across all wallets, converted at the rate the money actually moved at.
- A transaction list by month with filters and search.

**Non-goals (this sub-task)**
- Group shares in the stream (#114); reports, profit figures and charts other than the wallet pie (#115); budgets (#116); recurring rules (#117); anything imported (#118–#121); targets (#122); contract loans (#123).
- Any new debt or loan feature. Debts with people keep using today's "with a person" quick expense. The owner wants to discuss how those fit wallets later (**owner**, 2026-11-16).
- Live market prices or live exchange rates (Phase 2 rule 9).

**Anti-goals (a failure even if it works)**
- Two currencies added together without a stated rate, anywhere.
- A wallet balance that changes because of a transaction dated before the wallet's start date.
- Any change to Phase 1 tables, the group money code or an existing test.
- An expense that takes more than amount → category → save.

## 3. Decisions

| # | Decision | By |
|---|---|---|
| W1 | **Two wallet kinds: everyday and investment.** The kind is chosen when the wallet is created and cannot change once the wallet has transactions. | owner |
| W2 | **Everyday wallet entries:** expense, income, transfer in/out. Quick expenses with a person show in its history (W14). | owner |
| W3 | **Investment wallet entries:** buy/sell, income (interest, dividends / cổ tức), expense (tax, fees), transfer in/out. | owner |
| W4 | **A transfer is two linked entries**: an outgoing entry in the sending wallet and an incoming entry in the receiving wallet, saved, edited and deleted together. Across currencies the owner types the amount sent and the amount received; the rate is whatever those imply. | owner |
| W5 | **Every entry has an "exclude from reports" switch.** Whether a transfer counts as spending or income depends only on that switch. This overrules issue #113's requirement 9 ("a transfer is neither spending nor income in any report"). | owner |
| W6 | The switch starts **on** for both sides of a new transfer and **off** for every other entry. | my call (owner agreed in the playback) |
| W7 | **Investment purchases have no special type in an everyday wallet.** Buying an ETF straight from a bank wallet is an expense in an investing category with a tag naming the ETF; going through a fund first is a transfer into an investment wallet. Both habits must work. | owner |
| W8 | **Currencies: VND (0 decimals), USD (2), USDT (2).** USDT is its own currency, never USD. The list is one constant in `@cc/core`; adding one is a one-line change. | owner (USDT); my call (USDT decimals) |
| W9 | **Assets are the owner's own list**, set up once and managed like categories: a name (BTC, VNM, E1VFVN30, SJC…), a unit (coin, share, chỉ…), a group (Crypto, Stock, ETF, Gold…) and how many decimals the quantity has (0–8). | owner (set up once); my call (fields) |
| W10 | **Buy/sell** is one entry in an investment wallet: the asset, the quantity, and the cash paid or received in the wallet's currency, with a date. Fees are a separate expense entry. | owner (buy/sell); my call (fees apart) |
| W11 | **An investment wallet's balance is its cash only**, in its currency. Its holdings show separately: asset, quantity, total cost. No market value. | my call (owner agreed in the playback) |
| W12 | **One VND total across all wallets**, using the rate the money actually moved at. Each non-VND wallet carries a VND cost: a transfer in adds the VND sent; money leaving lowers it at the wallet's average rate; money arriving from outside a transfer (income, a sell, the starting amount) is valued at the current average rate. Holdings count at their cost. The total shows "≈" whenever converted money is part of it; per-currency lines sit under it. | owner (rate as moved); my call (averaging rules) |
| W13 | **A non-VND wallet's starting amount comes with its VND value**, typed once at creation, since no transfer exists yet to give a rate. | my call (owner agreed in the playback) |
| W14 | **Quick expenses with a person show read-only in the wallet history and in the transaction list**, on the default wallet, as rows marked "with ⟨name⟩", counting your share as spending. They are read from their own rows, never copied (S36, D2). Tapping one opens the existing quick expense. In this sub-task they **do not change any wallet balance**; the section 6 table of the 15 November spec is applied to balances in #114 together with group shares. | owner (show, not copy); my call (balance effect waits for #114) |
| W15 | **Deleting asks for confirmation, offers undo in the snackbar for about 5 seconds, then the entry is gone for good.** Deleting either side of a transfer deletes both. | owner (disappear); my call (5 s) |
| W16 | **Two pull requests**, one design: **Part 1** wallets and transactions; **Part 2** assets, buy/sell and holdings (section 9). | owner |
| W17 | Categories and assets are lazily seeded: a user who has no categories gets the starter set (section 5) the first time categories are read. Users who already made their first wallet in #112 get it the same way. | my call |
| W18 | A wallet's start date and starting amount can both be edited later; balances are always recomputed from them, never stored. | issue #113 req. 2 |
| W19 | **W12 edge cases.** (a) Entries dated before the start date never touch the VND cost. (b) A transfer between two non-VND wallets moves the sender's average-rate cost of the amount sent into the receiver. (c) A non-VND wallet with no rate yet (starting amount 0 and no transfer in) is left out of the VND total and shown on its own currency line with "chưa có tỷ giá" (REVIEW); money arriving before a rate exists gets the rate of the first transfer in. (d) When the balance falls to zero or below, the cost follows the balance at the last known average rate (so it can go negative); the next transfer in sets a fresh average from there. | my call |
| W20 | **The wallet pie is built in Part 1** (as the 15 November spec assigns it to #113): plain SVG, slices sized by each wallet's VND value (cash VND cost, plus holdings at cost in Part 2); wallets at zero, below zero or without a rate are left out of the pie but stay in the legend list on the wallets page. | my call |
| W21 | **Quick expenses in totals.** A quick expense row counts your share in the day, category and month spending totals of Part 1 (that is what the section 6 table calls your spending), under a fixed "Với người khác" (REVIEW) category. It has no exclude switch and no tags until #114 adds the per-user link table. "Most used categories" counts typed entries only. | my call |

## 4. Wallets

- **Fields:** name (1–40 characters), kind (W1), currency (W8), starting amount (may be zero or negative), start date (default the day of creation, editable), VND value of the starting amount (W13, only for non-VND currencies), an icon or colour from the theme's avatar set (`bg-avatar-1..6`), order, archived or not, default or not.
- **Balance** (in the wallet's own currency) = starting amount + every entry dated on or after the start date, signed by type (income, transfer in, sell: +; expense, transfer out, buy: −). Entries dated before the start date are listed with the line "Trước ngày bắt đầu ví" (REVIEW) and do not change the balance.
- **Rename, reorder, archive, restore.** Archived wallets keep their history, leave every picker and the total, and show in a collapsed "Đã lưu trữ" (REVIEW) group on the wallets page. A wallet with any entry cannot be deleted, only archived; an empty one can be deleted. The default wallet cannot be archived until another wallet is made default.
- **More than one wallet.** The one-wallet limit of #112 (S34) is lifted. The first-wallet popup (S26) gains the currency and kind choices; the default stays the first wallet created.
- **Wallets page** ("Ví ›" from the pie): the VND total with "≈" when converted, one line per currency, then everyday wallets and investment wallets as two grouped lists, each row showing name, kind icon and balance in its currency. Totals never add two currencies without converting them by W12.
- **Wallet page:** balance, history (same rows as the transaction list, filtered to this wallet); for an investment wallet also a "Đang nắm giữ" (REVIEW) list: asset, quantity, total cost (Part 2).

## 5. Categories, tags, assets

- **Categories:** the owner's own list, each marked expense or income, with a name and an icon (lucide name); one level of sub-categories (a sub-category has the type of its parent). Starter set (Vietnamese first, REVIEW):
  - Expense: Ăn uống, Di chuyển, Mua sắm, Hóa đơn, Sức khỏe, Đầu tư (subs: Cổ phiếu, Crypto, ETF, Vàng), Thuế, Phí.
  - Income: Lương, Lãi, Cổ tức, Thu nhập khác.
  Every one can be renamed, hidden or removed.
- **Tags:** free labels, typed in the entry form with suggestions from the owner's existing tags as they type; any entry type, transfers included, can carry several (the owner tags providers such as Binance, OKX and which ETF was bought). **my call** (tags on transfers).
- **Assets (Part 2):** W9. Groups are a fixed starter list the owner can extend, managed in the same way as categories.
- **Removing something in use** (a category, tag or asset with entries) asks what happens: move the entries to another one of the same type, or (categories and assets only) hide it and keep the history. A tag in use can be removed, which takes it off its entries, after confirmation.
- All three lists live behind the gear in the Sổ chi tiêu header (S22), beside wallets and the default wallet.

## 6. Transactions

- **Expense / income:** amount, wallet, category, date (default today), optional time, optional note (up to 200 characters), optional tags, the exclude switch.
- **Transfer:** from-wallet, to-wallet (different, not archived), amount sent, amount received (asked only when the currencies differ), date, optional note and tags, the exclude switch for the pair.
- **Buy / sell (Part 2, investment wallets only):** asset, quantity (> 0, within the asset's decimals), cash amount, date, optional note and tags. A sell may not take the quantity held on that date below zero.
- **Source:** every entry records where it came from. Values now: `manual`. Reserved for later: `recurring`, `import`, `apple_pay`, `android`. An optional outside reference is stored with it, unique per user and source, to spot duplicates later.
- **Limits per currency** (smallest unit): VND 1.000.000.000.000; USD and USDT 10.000.000.000 (100 million dollars). Quantity up to 10^15 smallest units. Anything else (zero, negative, letters, too many decimals) is refused with a plain message.
- **Fast entry (issue reqs 18–20):** "+" opens the short menu of S12 (expense, income, transfer, with a person; buy/sell appears only when an investment wallet exists). The expense form opens with the amount focused (numeric keypad, `text-base`), the last used wallet and today filled in, and the six most used categories of the last 30 days first, then the rest. After saving, the user is back where they were, a snackbar confirms it, and the new row is visible.
- **Transaction list** (S16): month switcher, newest first, by day (default) or by category, each group with its total per currency. A row shows category icon and name, note, wallet, tags and the amount with − / + and `text-danger` / `text-success` (never colour alone). Transfers show "→ ⟨wallet⟩" in neutral ink. Filter sheet: wallet, category, tag, type, asset (Part 2), date range; search by note. Active filters are removable pills; no match shows one line and "Xóa bộ lọc" (REVIEW).
- On a computer the details open as a dialog (S20), using the `Modal` wrapper.

## 7. Data

New migration `0027_personal_money.sql`, hand-written; `schema.ts` kept in step. No Phase 1 table is touched.

**Kept as #112 left them (added while planning, my call):** #112's tests, which may not be edited, pin `personal_wallets` to exactly nine columns, pin `POST /me/personal/wallets` to "one wallet only, starting amount ≥ 0, a second create gets 409", and pin `GET /me/personal/wallets` to the body `{ wallets }` with nothing beside it. So `personal_wallets` keeps its columns, the extra wallet fields live in a new table keyed by the wallet, further wallets are made by a new route (`POST /me/personal/wallets/add`), and the totals come from a new route (`GET /me/personal/summary`). New fields inside each wallet object are allowed, because those tests compare a wallet only with what the server itself returned.

- **`personal_wallet_settings`** (one row per wallet, absent means the defaults): `wallet_id` text primary key, references `personal_wallets(id)` on delete cascade; `user_id`; `kind` text not null default `'everyday'`; `start_cost_vnd` integer null (W13); `icon` text null; `sort_order` integer not null default 0; `archived_at` text null; `updated_at`.
- **`personal_categories`**: id, user_id (cascade), parent_id null, type (`expense`|`income`), name, icon, hidden (0/1), sort_order, created_at, updated_at. Index on user_id.
- **`personal_tags`**: id, user_id, name; unique (user_id, lower(name)).
- **`personal_transactions`**: id, user_id, wallet_id, type (`expense`|`income`|`transfer_out`|`transfer_in`|`buy`|`sell`), amount (integer, > 0, wallet currency's smallest unit), category_id null, transfer_id null (shared by both sides), asset_id null, quantity integer null, date (`YYYY-MM-DD`), time null (`HH:MM`), note null, exclude_from_reports (0/1), source (default `manual`), external_ref null, created_at, updated_at. Indexes: (user_id, date), (wallet_id, date), transfer_id; unique (user_id, source, external_ref) where external_ref is not null.
- **`personal_transaction_tags`**: transaction_id, tag_id; primary key on both.
- **`personal_assets`** (Part 2, own migration `0028_personal_assets.sql`): id, user_id, name, unit, group_name, decimals (0–8), hidden, sort_order, timestamps.
- **Computed, never stored:** balances, VND cost (W12), holdings. They are computed in `@cc/core` as pure functions from wallets and entries, so they are unit-tested without a database.
- **API** (all under `/me/personal`, all behind `requirePersonal`, every query filtered by the signed-in user's id; another user's id in a path or body gives 404): wallets (list with balances and VND cost, create, update, archive/restore, reorder, delete-when-empty); categories (list, create, update, remove-with-choice); tags (list, rename, remove); transactions (list by month with filters, create, update, delete, restore-after-delete for undo); assets and holdings (Part 2).
- **Undo:** the delete route returns the deleted entries (both sides of a transfer, with tags); the snackbar's undo posts them back to a restore route that reinserts them with the same ids. **my call**

## 8. Query and row cost (Cloudflare free plan)

Assumed ranges: up to 10 wallets, up to about 300 entries a month, a few years of history (≈ 10.000 entries).

| Action | Queries | Rows read | Rows written |
|---|---|---|---|
| List wallets with balances and VND totals | 3 (guard, wallets, one grouped sum per wallet + type) | wallets + entries of non-VND wallets replayed for W12 (≈ up to a few thousand) | 0 |
| List one month of transactions | 4 (guard, entries of the month, their tags, categories) | ≈ 300 + tags + categories | 0 |
| Create expense / income | 4–5 (guard, wallet and category check, insert, tag upserts) | ≈ 3 | 1 + tags |
| Create transfer | 5–6 | ≈ 3 | 2 + tags |
| Edit / delete | 4–6 | ≈ 3 | 1–2 + tags |

Every action stays far under 50 queries. Balances use SQL sums for VND wallets so their rows are read by an index; only non-VND wallets are replayed in date order for W12. If the daily read budget is ever at risk, a stored per-wallet total is the fallback; it is not built now. **my call**

## 9. The two pull requests

- **Part 1 (closes the ticket's "done when"):** wallet kinds and currencies, all wallet actions, categories and tags, expense / income / transfer, the exclude switch, VND total (W12, W13), the transaction list and filters, quick expenses shown read-only (W14), the updated first-wallet popup. Investment wallets exist and take income, expense and transfers.
- **Part 2:** assets, buy/sell, holdings on the wallet page, the asset filter, buy/sell in the "+" menu.

Issue #113 is updated with this split; Part 2 is tracked as a task list item on #113 (or a follow-up issue if the owner prefers). The implementation plan covers Part 1 only; Part 2 gets its own plan once Part 1 is merged, so its asset API is fixed against the shipped Part 1. **my call**

**Order inside Part 1:** data, `@cc/core` functions and API first (fully testable without screens); then a design checkpoint where the screens are shaped with `/impeccable` and reviewed live with the owner; then the screens. The plan stops at the checkpoint and resumes after the owner approves. **my call** (follows the ticket's "how to work" step 4)

## 10. Screens

Phones first at 375px, Vietnamese first and English second, new Vietnamese lines marked `// REVIEW`. Before any screen is built, the screens of section 4–6 are shaped with `/impeccable` and reviewed live with the owner, using the real components in `libs/web/ui` (wrappers first: `Sheet`, `Modal`, `Button`, `Pill`, `Amount`, `Icon`) and theme colours only. `Amount` learns the currency (decimals and symbol: `₫`, `$`, `USDT`). Each screen has loading, empty and error states. The Zalo Mini App shows the same screens.

## 11. Tests that prove it

- `@cc/core` unit tests: balance with a start date (entries before it ignored); a transfer between VND and USDT (both balances, VND cost moves with it); average-rate VND cost after a later transfer in and a spend (25.000.000 VND → 1.000 USDT, then 13.000.000 VND → 500 USDT gives 38.000.000 VND; spending 300 USDT leaves ≈ 30.400.000); an archived wallet left out of the total; exclude switch respected by the month totals; amounts parsed and formatted per currency; per-currency limits. Part 2: holdings and cost after buys and a partial sell; a sell beyond the holding refused.
- API tests: a second account cannot list, read, edit, delete or restore the first account's wallets, categories, tags, transactions or assets (404); a user with the switch off gets 403 on every new route; deleting a wallet with entries is refused; deleting one side of a transfer removes both; undo restores them.
- Screen tests: a user with the switch off sees no new screen or menu item; fast entry focuses the amount and pre-fills wallet and date; the list shows − / + with words, not colour alone.
- Unchanged and passing: `npm test`, `npm run typecheck`, `npm run lint`, and the Playwright specs `golden-path` and `walkthrough`.

## 12. Left to the builder

File layout inside the libraries named in `CLAUDE.md`; route and type names (avoid "ledger", rule 10); exact SQL of the sums; component structure; icon choices for the starter categories; English copy.
