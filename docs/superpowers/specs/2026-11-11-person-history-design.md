# Person history: see why a balance is what it is (issue #98)

Status: draft for owner review · 2026-11-11

## Why

The person screen (`/people/:key`, opened from a name on Home) shows one big total ("An owes you 350.000₫") and one net row per place ("Quick expenses +120.000₫", "Đà Lạt −50.000₫"). Nothing shows which expenses and payments make up those numbers. The owner wants to see at a glance **what debt or loan they are in with a person, and why**. Today the link between the total and the transaction list is unclear.

Success: from either entry point the user can read down the list and see how the lines add up to the number at the top, without opening anything else.

## Goals

1. Tapping a person **on Home (Quick expenses)** or **in a group** opens the person screen.
2. The person screen lists the real transactions behind the total, one line each, in full detail.
3. The request page `/r/<id>` (what the person asked to pay sees) keeps its simple netted view and explains clearly which expenses each row covers.

## Non-goals

- No new money logic: balances, "fewest transfers" and rounding stay as they are. This is a read-only explanation of them.
- No editing from the history (tapping a line may open the existing expense detail; see Builder's calls).
- No history screen for guests (they have no account and no person screen). Guests get the clearer `/r` view.
- No export, search or filters.

## Anti-goals (a failure even if it works)

- Lines that **don't add up** to the number shown, with no explanation.
- A dense spreadsheet or bank-statement look (DESIGN.md "Don't"s).
- Showing a guest on `/r` other people's shares they aren't part of.
- Blowing the D1 daily read budget: the history must come from data already loaded or cached, not one query per expense.

## The person screen: one screen, two modes

One page component and one line component serve both modes. The layout is the same; only the scope changes. (Owner: "the layout from group or home should be similar, reuse the component/page"; "a line from a group should be similar to the one from home".)

Shared layout, top to bottom (existing pieces stay, with their `fsl-person*` classes and `data-testid`s):
1. Header: avatar, name, edit button (as now).
2. Total (the balance hero, as now): "owes you" in Leaf / "you owe" in Lychee / settled line.
3. Waiting settlements with Confirm / Not received (as now).
4. **History**: a grouped list of transaction lines, newest first, under a section label.
5. Linked people, and the actions (Request, Paid in cash, …) as now.

### Transaction line (same component in both modes)

Each line shows:
- what it was (the expense title, or "An paid you" / "You paid An" for a payment)
- the date
- the full expense amount
- who paid
- your share and their share
- **the effect on the balance between you two**, signed, on the right in `tabular-nums` (Leaf when it adds to what they owe you, Lychee when it adds to what you owe)

Line states (owner-confirmed):
- **Counted:** approved expenses and confirmed payments.
- **Waiting:** a payment marked "I've paid" but not confirmed shows with a Turmeric "Waiting" pill and **is counted**, because the app already takes it off the total (`pairwiseTransfers` and `includeSaysPaid` count `says_paid`). The lines always add up to the total. (Owner, 2026-11-11; this replaces an earlier "not counted".)
- **Disabled:** a disabled expense or payment shows crossed out and is **not counted**.
- **Unapproved guest expense:** not counted. *Builder's call:* show it like a waiting line ("Waiting for approval"), or leave it out. Either way it stays out of the sum.

### Mode A: from Home (the full picture)

Opened from a person row on Home (today's entry point).
- Total: the person's overall total (as now).
- Each **group** stays one net loan/debt row ("Đà Lạt −50.000₫"), as now. *Builder's call (owner may correct):* tapping a group row opens **Mode B for that group** instead of the whole group page.
- The single "Quick expenses" row is **replaced by the actual quick-expense transaction lines** (the caller's own `direct` ledger with this person), mixed in date order.

### Mode B: from a group (that group only)

Opened by tapping a person in a group. Entry points (owner-confirmed): the **"You pay Bình 210.000₫" / "Bình pays you" transfer rows** in the group's Your transfers card, and (builder's call) the group row in Mode A. Guests don't get this entry: for a guest the transfer row keeps today's behaviour.
- The header names the group (e.g. a "Đà Lạt" line under the name, or in the screen title; builder's call).
- Total: what the group says you pay or get with this person. This is the existing `PersonItem.amount` for that trip, built from the group's suggested transfers.
- History: every expense and payment in that group **involving both of you**, as transaction lines (same component).
- **The gap line (owner-confirmed).** With "fewest transfers" the group may reroute debts, so the lines between you two can add up to a different amount than the total. Then show:
  - "Between you two: 300.000₫" (the sum of the lines), and
  - a plain line: "To save transfers, the group changed this to 210.000₫." It names a third person only when one clear reroute explains it ("90.000₫ moved to Minh"); otherwise it gives just the difference.
  - When the two numbers are equal, neither line shows.

URL: Mode B needs its own link so Back and sharing work, e.g. `/people/:key?group=<tripId>` (*builder's call on the exact shape*).

### Trimming long histories (owner)

The history starts **after the last time the balance between you two was settled** (reached zero): older, fully paid lines are not shown. Concretely, walk the counted lines oldest to newest, keep the running two-way balance, and show only lines after the last point it was 0. In Mode A this runs per place: each group's trim is shown through its row, and the quick-expense lines are trimmed on their own two-way balance.
- When nothing is open (settled now), the screen shows the settled line and no history. *Builder's call:* a quiet "Show settled history" link that reveals the older lines is optional and not required.
- Waiting and disabled lines that fall in the open stretch are shown; ones before it are not.

## The request page `/r/<id>`

What the person asked to pay sees (often a guest, no account). It keeps its **simplified, netted** view: the "You owe An" total and one row per place ("Expenses with An", "Đà Lạt"), as now.

Added: under each place row, a short plain explanation of the expenses it covers. For example "Lunch, Taxi and 3 more", which opens into compact lines (name, date, effect), using the same open-stretch trimming as above. A group row whose amount was changed by "fewest transfers" carries the same gap line.

Privacy: the lines list only transactions involving **both** the requester and the person viewing, and show only their two shares, never other people's. The link is public (anyone holding it can open it). The owner accepts that expense names and the two shares show to whoever has it, including names from groups (owner, 2026-11-11).

## Constraints

- **Workspace rules (CLAUDE.md):**
  - The pure line, sum, trim and gap math goes in `@cc/core`, where both sides can use it.
  - The API routes go in `apps/api`, the hooks in `@cc/web-data-access`, the screen and the line component in `@cc/web-screens`, and the copy in `@cc/web-i18n`.
  - Import rules stand.
- **Data:** the cached trip snapshot (`TripSnapshot`: `expenses` with `payerId`, `amount`, `status`, `createdAt`, `shares`; `payments` with `status`, `amountClaimed` / `amountConfirmed`; `suggestions`) already has everything needed. Build lines from the cached view the people summary already warms (`balances.ts`), not new per-expense queries. Fund-paid and planning-mode expenses are already left out of the ledger (`toLedger`) and stay out here.
- **Design system (DESIGN.md):**
  - White `rounded-xl` grouped lists, rows at least 44px, money in `tabular-nums` as `1.245.000₫`.
  - Leaf, Lychee and Turmeric only for money in, money out and waiting.
  - Use the `Amount`, `Pill` and `Avatar` wrappers, and no nested cards.
  - Phones first at 375px.
- **Copy:** Vietnamese first, English second, plain words. Say "fewest transfers" and "to save transfers", never "simplify debts".
- **Tests** select by `fsl-*` classes and `data-testid`. Keep the existing ones on the same elements.

## Calls made after the builder check (owner may correct)

- **Rounding.** With "round transfers" on, the suggested amounts are rounded to 1.000₫, and differences of 500₫ or less are dropped. A difference that comes only from rounding gets a quiet caption, "Rounded to 1.000₫", not the gap line. Any other difference uses the gap line.
- **Trimming in a rerouted group (Mode B).** The trim follows the two-way running balance. When there's a gap (the total doesn't equal the two-way sum), don't trim, so the lines that explain the gap stay visible. If no lines are left but the total isn't 0, show the gap line alone.
- **Which quick-expense places become lines (Mode A).** Every `direct` place with this person turns into lines: your own ledger row for them, ledger guests you merged into them, and their ledger where you take part. A line that isn't from your own ledger carries a small tag ("In Bình's expenses").
- **Naming a reroute.** Work it out from the cached snapshot: recompute the two-way debts from the ledger and compare them with `suggestions`. No new data goes into the snapshot and the cache version doesn't change. Name a third person only when one transfer clearly explains the whole difference.

## Left to the builder

- Exact Mode B URL, and where the group name sits in the header.
- Whether a history line opens the existing expense detail.
- Month separators in long open stretches, and the page size for "show more" if an open stretch is very long.
- How to show unapproved guest expenses (waiting-style or hidden; never counted).
- The optional "Show settled history" link.
- Whether incomes (group income entries) appear as lines. They must if they affect the two-way balance, so the sum stays right.
