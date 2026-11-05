# Part 1 findings: "the first tap only shows the bill and the share button"

Reproduced on 2026-11-05 with `WALKTHROUGH=1 npx playwright test e2e/walkthrough.spec.ts` (private e2e server, test sign-in) against the branch before Task 4. Rewrite spec §4.2.

## What happens on a bill link today

`/j/<token>/e/<expenseId>` goes to `/j/<token>/expenses/<id>/pay` (`ExpensePay`). The API (`apps/api/src/expenses/payView.ts:48–95`) finds "your share" in this order:

1. The person this visitor is (a guest's remembered pick, or a signed-in member's own person), if they're not the payer and have a share above 0.
2. A friend slot this phone was granted.
3. A claim this account is waiting on.

When none of these applies, it answers `{ row: null }`. `ExpensePay.tsx:161` then redirects to the bill page. That page shows the bill and **Share bill & QR**, which is the reported symptom.

| Who opens the bill link | Seen in the walkthrough | Lands on |
|---|---|---|
| A guest on a new phone, picks their name (Bình) | yes (`16-…-bill-guest-binh-screen`) | Pay screen: share, QR, I've paid. Correct. |
| The same phone again | yes (`17-…-reloaded`) | Pay screen. Correct. |
| The payer (Minh) | yes (`18-…-minh-own-bill-link`) | Bill + Share bill & QR. Wanted: the spec keeps it for the organiser. |
| A phone that remembers someone **with no share** in that bill (picked another name earlier, a shared phone) | from code (`row: null`) | Bill + Share bill & QR. **The reported symptom.** |
| A **signed-in teammate whose account sits on a different person** than the one the organiser put in the bill (e.g. the organiser typed "Tuấn" before Tuấn signed in and joined as "Tuấn Anh") | from code (`row: null`) | Bill + Share bill & QR. **The reported symptom.** |
| A signed-in newcomer (Hoa) | yes (`21-…-hoa-opens-bill-link`) | "Who are you?" with no "Join as Hoa" (fixed in Task 5). |

## Which case the team hit

The team reported people who owed money seeing the bill instead of paying. Only the last two rows produce that for someone who isn't the payer. The walkthrough can't tell which of the two it was. The second (a signed-in teammate counted under another name) fits a team that signs in through Zalo and Google, and Part 2's look-alike merge addresses its cause. **To confirm with the owner:** were the teammates who saw it signed in?

## What Task 4 does about it

- Payer → the bill with "Share bill & QR", as today.
- Anyone else with no share → "Nothing for {name} in this bill" and "See the group". Guests also get "Not {name}? Switch" (the group-wide switch). A signed-in member can't switch who their account is, so they get no switch. The bill is never shown silently again.
- Task 4's tests cover a remembered guest name with no share and a signed-in member with no share, and check that a person with a share lands on the pay screen.
