# Phase 2: personal money, broken into sub-tasks

Date: 2026-11-13 · Epic: #55 · Builds on: Phase 1 (#53, group split and VietQR settle-up)

This document breaks epic #55 into twelve sub-tasks and records what the owner decided. It is not a build plan. Each sub-task gets its own brainstorm, design and plan later; this document tells that later work what is fixed, what is open, and what must not be disturbed.

Lines marked **(owner)** are the owner's words or explicit decisions. Lines marked **(my call)** are the writer's choices; the owner may overrule them.

## 1. Intent

The owner keeps personal money in Money Lover and shared money in CoinCrew, and types every shared expense twice. They record everything they spend, plus recurring ETF purchases and trades on crypto and stock accounts. Entry used to happen every evening; it has slipped to once a week, because batch entry is a chore. **(owner)**

Phase 2 makes CoinCrew the only money app the owner opens:

1. It does what Money Lover's core does, so Money Lover can be dropped.
2. Transactions arrive without typing wherever that is possible.
3. It helps plan money: where it sits, where new money should go, and how to pay down a loan. Money Lover cannot do this.

Built for the owner first. Friends get it once it is stable. **(owner)**

## 2. Goals

1. **Drop Money Lover.** Wallets, income, expenses, transfers, categories, tags, reports, budgets and recurring transactions all work in CoinCrew. **(owner: "handle all the core features of Money Lover first"; budgets included)**
2. **No double entry.** The owner's share of every group expense and settlement shows up in the personal ledger by itself. **(owner)**
3. **Capture as you pay.** The owner pays in the bank app or with a wallet tap as usual, and the transaction turns up in CoinCrew. **(owner)**
4. **Set up once.** Recurring transactions (for example a monthly ETF purchase) run on their own. **(owner)**
5. **Import with review.** The owner uploads a spreadsheet (typically produced by Gemini reading bank emails), reviews the rows, and likely duplicates are flagged before anything is saved. **(owner)**
6. **See and steer the distribution.** A bar chart of money put into each kind of asset and each service; target percentages; a suggestion for how to split free money. **(owner)**
7. **Plan the loan.** A suggested payment schedule for a contract loan (the owner's house loan), based on recorded income and spending. **(owner)**

## 3. Non-goals

- **Market prices and returns.** Weights are judged by money put in, never by current value. **(owner)** Price-based performance tracking stays in epic #58.
- **Moving money.** CoinCrew never pays, transfers or connects to a bank. Suggestions are advice only. (Existing product rule.)
- **Gmail, Drive or bank API access.** The owner runs Gemini themselves and uploads the result. (Existing product rule.)
- **Scanning a merchant QR in CoinCrew.** Parked: no bank app accepts a prefilled payment, so the owner would scan twice. Paying in the bank app and capturing afterwards is more convenient. **(owner)**
- **Push notifications (#97).** Parked; it conflicts with `PRODUCT.md` and belongs to epic #82.
- **Full Money Lover history import.** Optional. Wallets start from a starting amount instead. **(owner)** A history import may reuse the spreadsheet import later (see sub-task 08).
- **Savings goals and bill reminders.** Not part of "core" **(my call)**.
- **Native apps.**

## 4. Anti-goals (a failure even if it works)

- **Phase 1 becomes less reliable.** Group splitting, sport groups, settle-up, approvals, VietQR and bank hand-off must behave exactly as before. **(owner constraint)**
- **A friend on a trip is confronted with finance screens.** The guest path (link → pick name → pay) and group-only users must not see or feel the personal area until the owner releases it.
- **The ledger disagrees with a group.** The personal view of a group share must always equal what the group screen says.
- **Typing moves instead of disappearing.** A review step that takes as long as manual entry defeats the purpose.
- **An ugly or confusing app.** Every screen goes through the design process in section 7. **(owner constraint)**

## 5. Decisions that shape every sub-task

| # | Decision | Source |
|---|---|---|
| D1 | The personal ledger uses **new tables**, separate from groups. It does not reuse the hidden "direct" group that holds quick expenses and person-to-person loans. Those keep working as they do today. | my call, from the code investigation |
| D2 | **Group shares are read, not copied.** The personal view of group expenses and settlements is a query over existing rows (`transaction_shares`, `transactions`, `participants.userId`), with the same filters the group balance uses. No hooks on group writes. | my call, from the code investigation |
| D3 | **Each wallet has its own currency.** The owner trades in more than one currency. Amounts are whole numbers in the currency's smallest unit; no floating point. Group money stays whole VND. | owner (multi-currency), my call (storage) |
| D4 | **Kinds, services, categories and tags are the owner's own lists**, never hard-coded. | my call |
| D5 | **One review inbox for everything that arrives from outside** (Apple Pay, Android notifications, spreadsheet rows). Nothing from outside changes a balance until the owner confirms it. Likely duplicates are flagged across sources. | my call, accepted by owner |
| D6 | **Reliability comes in layers:** automatic capture first, spreadsheet import as the safety net, quick manual entry for cash and gaps. | my call, accepted by owner |
| D7 | **Weights use money put in.** No price feeds anywhere in Phase 2. | owner |
| D8 | **The personal area is off for everyone except the owner** until the owner says it is stable: a per-user switch (its own new table), default off, with no visible way to turn it on, enforced on the server by one shared guard that every new route uses. It applies to the web app and the Zalo Mini App alike, since both render the same screens. | my call |
| D9 | **Outside tools sign in with a personal capture key**, not the user's session: stored hashed, revocable, able to do one thing only (add to that user's review inbox). | my call |

**D8, changed.** Changed 2026-11-15 (owner): every signed-in user can turn the personal area on or off in the account menu; see S25 in `2026-11-15-spending-book-shape-and-navigation-design.md`. The server guard and the default of off stand.

## 6. Rules for every sub-task (the Phase 1 guard)

1. **Additive only.** New tables, new routes, new screens. Migrations only create new tables and indexes; they never alter or drop a Phase 1 table or column, and never add a column to one.
2. **Do not edit the group money code:** `commitTripWrite` / `guardedTripWrite` (`libs/api/db/src/commit.ts`), `computeBalances`, `computeShares`, `suggestTransfers` (`libs/shared/core`), `getSnapshot` (`apps/api/src/trips/snapshot.ts`), the people summary (`apps/api/src/me/balances.ts`), settlement (`apps/api/src/me/settle.ts`), the quick-expense group (`apps/api/src/me/ledger.ts`), the device middleware (`libs/api/auth/src/device.ts`), and the expense and payment routes. Importing from these files is allowed; changing them is not. If a sub-task believes it must change one of these, it stops and asks the owner first.
3. **Never edit or delete an existing test.** `npm test`, `npm run typecheck`, `npm run lint` and the Playwright specs `golden-path` and `walkthrough` pass before every merge.
4. **Stay inside the Cloudflare free plan:** at most 50 database queries per request, 100,000 rows written and 5,000,000 rows read per day. Each sub-task states its cost per action.
5. **Group-only users and guests see no change** while D8's switch is off for them. Each sub-task tests this.
   - Changed 2026-11-15 (owner): every signed-in user can turn the personal area on or off in the account menu; see S25 in `2026-11-15-spending-book-shape-and-navigation-design.md`. The server guard and the default of off stand. Group-only users now see one new row there and nothing else.
6. **Migrations are hand-written SQL** in `apps/api/migrations/`, with `libs/api/db/src/schema.ts` kept in step by hand.
7. **Money is never a float.** Personal amounts follow D3.
8. **No push, SMS or email about personal money.** Phase 1's group emails are not a precedent.
9. **Mind the name.** In the code, "ledger" and `PersonalLedger` already mean the hidden "direct" group for quick expenses. The new personal-money code takes a different name and never extends `apps/api/src/me/ledger.ts`.
10. **Personal financial data is private to its owner.** No other user, group member or guest can read it through any route. Each sub-task tests access from another account.

## 7. How each sub-task is worked

1. Confirm every "blocked by" issue is closed.
2. Read epic #55, this document, `PRODUCT.md`, `DESIGN.md` and the sub-task's issue.
3. Run `/superpowers:brainstorming` with the owner to settle the open questions listed in the issue, and write a design document.
4. For anything with a screen: run `/impeccable` to shape the design, review it live with the owner, then generate. Use the real components and tokens (`CLAUDE.md` → UI). Phones first at 375px; Vietnamese first, English second.
5. Write the plan (`/superpowers:writing-plans`), then build.
6. Branch off `main` as `feat/<topic>`; pull request into `main`.

## 8. The sub-tasks

Pick the lowest-numbered open sub-task whose "blocked by" issues are all closed. Stage 3 may be postponed further. **(owner)**

### Stage 1: replace Money Lover's core

| # | Sub-task | Outcome | Blocked by |
|---|---|---|---|
| 01 (#112) | Personal area: shape and navigation | The owner approves where the personal area lives, its main screens and how fast entry works. `PRODUCT.md` and `DESIGN.md` are updated. The per-user switch (D8) exists. | none |
| 02 (#113) | Wallets and transactions | Wallets with a starting amount, start date and currency; income, expense and transfer; categories and tags; fast manual entry; edit and delete. | 01 |
| 03 (#114) | Group shares in the ledger | The owner's shares of group expenses and settlements appear in the ledger automatically and always match the group. | 02 |
| 04 (#115) | Reports | Spending and income by category and period; wallet balances over time. | 03 |
| 05 (#116) | Budgets | A limit per category per period, with progress. | 04 |
| 06 (#117) | Recurring transactions | A rule set up once creates transactions on schedule. Also builds the "to confirm" list for planned transactions, which 11 and 12 reuse. | 05 |

When 06 closes, the owner can stop using Money Lover.

### Stage 2: stop typing

| # | Sub-task | Outcome | Blocked by |
|---|---|---|---|
| 07 (#118) | Review inbox and capture key | One inbox for incoming transactions with confirm, fix and dismiss; duplicate flagging; a personal capture key and one endpoint that outside tools post to. | 06 |
| 08 (#119) | Spreadsheet import | Upload a sheet, map columns, review in the inbox, duplicates flagged. Optional follow-up: Money Lover history. | 07 |
| 09 (#120) | Apple Pay capture | An iOS Shortcut posts each card tap to the inbox; a setup guide in the app. | 07 |
| 10 (#121) | Android notification capture | A MacroDroid or Tasker recipe forwards wallet and bank notifications to the inbox; a setup guide. | 07 |

### Stage 3: plan the money (may be postponed)

| # | Sub-task | Outcome | Blocked by |
|---|---|---|---|
| 11 (#122) | Distribution and funds | Bar chart by kind and by service; purpose funds (for example emergency); target percentages; the free-money suggestion. | 06 |
| 12 (#123) | Loan planner | Contract terms, accumulated amount, and a suggested payment schedule from recorded income and spending. | 11 |

### Existing issues

- **#109 (balance caching):** stays under #55. It changes how group balances are computed, which rule 2 in section 6 forbids without the owner's approval. Work it only if sub-task 03 or 04 measures a real cost problem. Blocked by 03.
- **#100 (one stream for expenses and payments on the main screen):** an input to sub-task 01, which decides how the main screen and the personal ledger relate.
- **#97 (push):** parked.
- **#57 (Sheets export and Gemini):** sub-task 08 replaces #55's "bank-email capture" idea with an uploaded sheet. Automatic matching of group payments stays in #57.
- **#58 (investment tracking and imports):** price-based performance and the Splitwise import stay there. Sub-task 11 covers the distribution by money put in.

## 9. Left to each sub-task's brainstorm

The issues list the open questions in full. The larger ones:

- **01:** whether the personal ledger becomes the main screen, sits beside it as a new section, or nests under it; what "+" does once there are personal transactions as well as quick expenses.
- **02:** how totals across currencies are shown (per currency, or converted with a rate the owner types in); how a transfer between two currencies records its rate.
- **03:** how a group expense the owner paid in full affects a wallet balance (the full amount left the wallet, but only the owner's share is spending; the rest is owed back).
- **07:** what counts as a likely duplicate (amount, date window, wallet, merchant), and how a group share and a captured bank transaction for the same payment are recognised as one.
- **11:** the exact rule behind "moves toward the target but still spreads the money" and how a loan and a fund with a target amount take part.
- **12:** what "optimise" means precisely (least total interest subject to a monthly safety margin is the working assumption) and how many months of history the estimate needs.

## 10. Documents to bring in line

`PRODUCT.md` numbers the phases differently from GitHub (it puts Sheets and Gemini second and personal records third), lists "currencies other than VND" and "categories" under "Not yet", and names "QR pay gateway" and "bank-email capture" as planned. Sub-task 01 updates it to match this document.
