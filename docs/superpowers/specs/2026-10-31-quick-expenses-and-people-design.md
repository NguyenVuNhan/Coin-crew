# Quick expenses, People view and Tikkie-style requests

Date: 2026-10-31 · Branch: `feat/no-group-expenses`
Vision: Obsidian `30_Projects/Coin Crew/2026-10-13-idea-discussion-next-steps.md`
Mockups: `.superpowers/brainstorm/1489-1793391634/content/` (`request-page.html`, `debts-view.html`)

## 1. Intent

Today every expense needs a group. A taxi for one friend or concert tickets for two means making a throwaway group first. The owner wants to:

- add an expense **without a group**, picking people they already know;
- ask for the money **the way Tikkie does**: send a link, the friend opens it in Zalo with no account, sees the amount and a VietQR, pays;
- see **all open debts and loans in one place**, per person, across every group;
- **simplify** across groups: one transfer per person settles everything open between them.

This serves the vision's goals directly: "Tikkie-level convenience", "friends won't create an account", and Splitwise's "simplify debts" being "a good mechanism with bad wording". So simplify never appears as a feature name; it just *is* the per-person total.

## 2. Goals

1. **New expense** button on the home screen, no group needed.
2. People picker for that expense: past quick-expense contacts **and** anyone in a group the owner belongs to; new names can be typed.
3. Who paid can be the owner (default) or a contact ("Minh paid for me").
4. Split: same Equal / Exact / Percent as group expenses (reuse `SplitModePicker`, `computeShares`).
5. **Request link** per person:
   - exactly one open item between the two → single-request page (mockup option A: "Nhan asked you for 120.000₫ · Taxi", QR, *Open bank app*, *I've paid*);
   - two or more → netted page (mockup option B: "You owe Nhan 270.000₫", list of items across groups and quick expenses with negatives shown, one QR for the total, *I've paid*).
   - The link is per **pair of people**, not per expense, so an old link always shows the current state.
6. **People tab** (mockup option B): tabs *People · Groups · Activity*; People lists "Owed to you" and "You owe", each person's netted amount. Tapping a person shows the items and actions **Request** (share link), **Settle up** (VietQR pay screen when the owner owes), **Paid in cash** (when the owner is owed).
7. **Cross-group settlement:** a payment between two people is **spread across every group and quick expense** with an open balance between them; each group then records its share as a normal payment, so group-mates see e.g. "Minh paid Nhan 200k" in the badminton group.
8. **Nicknames:** the owner can give any person (guest or signed-in user) a private nickname, shown next to the real name (`Linh "chị Linh"`). Only the owner sees it.
9. **Duplicate names:** a typed name is only typed once; afterwards the person is picked. Typing suggests existing people with the current accent-insensitive matching (`packages/core/src/names.ts`).
10. **Claiming a guest:** when someone signs in and says "that guest is me", it goes through the existing confirmed-merge flow (`accountMergeRequests` / membership request UX from the 2026-10-27 merge spec).

11. **Rename and merge guests.** From the person's page in the People tab, the owner can **rename** or **merge** any guest they created, whether in a quick expense or in a group they belong to.
    - Rename changes the guest's real name (not the nickname) and follows the existing group rules: guests can't rename, members can (`PATCH /trips/:id/people/:pid`).
    - Merge reuses `mergeParticipants` (`POST /trips/:id/people/merge`). Inside one group or the personal ledger, it folds a duplicate guest into the right person: their shares and payments move across, and the duplicate becomes `merged`.
    - Across groups, the same action is the "Same person?" link from §6a.3, because participants can't be merged across trips.
    - Merging a guest into a signed-in user's participant is allowed for the owner's own guests; that user's later claims still use the confirm flow (goal 10).
    - Both actions are logged in the activity of the group they touch.
    - **Merge integrity (decided by the owner):** A, the person kept, stays the survivor. No new person is created, so links and sessions pointing at A stay valid.
      - **Merge log.** A new append-only table records every merge: `participant_merges(id, trip_id, from_id, into_id, actor_user_id, created_at)`.
      - **Changed rows.** A child table records every row the merge changed, with its value before the merge: `participant_merge_rows(merge_id, table_name, row_key, before_json)`. This covers shares that were added together or deleted, transactions repointed, `payment_refs`, `device_participants`, `membership_requests` and `bank_details`. It lets a database admin trace any merge and leaves room to undo it later; there is no undo UI in this scope.
      - **The log is written atomically.** It goes in the same D1 `batch` as the merge itself.
      - **Claim rule.** Claiming a guest is a single conditional update that succeeds only while the target is `active`, has `user_id IS NULL`, and has no other pending claim.
      - **Claims follow merges.** A claim aimed at a merged participant follows `merged_into` to the survivor.
      - **Second claimant loses.** When two people claim the same guest, the first claim wins. The second gets "someone already claimed this person, ask the owner".
      - **Pending claims block merges.** A merge is refused while either guest has a pending claim.
      - **Tests.** Concurrent claims on A and B, and a claim racing a merge, each end with exactly one winner.

## 3. Non-goals

- No change to how group expenses are entered.
- No automatic payment detection (phase 2 per vision).
- No push notifications or reminders beyond sharing the link.
- No new currency handling (VND only, as today).

## 4. Anti-goals (would be a failure even if it works)

- A friend needing an account or app install to see or pay a request.
- The word "simplify" or a debt graph shown to users; the total per person must just be right.
- Duplicate people quietly multiplying in the picker.
- A cross-group payment that changes a group's history without the group being able to see it.

## 5. Money-safety rules (unchanged from the vision, applied here)

- Anything the signed-in owner records counts **straight away** (as a member's expense does in a group), including "Minh paid for me" where Minh is a signed-in user.
- Recording that a **guest** paid for the owner also counts straight away; nobody confirms on the guest's side.
- Guests cannot add expenses through a request link (out of scope for now); they can only say "I've paid".
- **Guest taps "I've paid"** → `says_paid`; counts once the receiver confirms. **Owner taps "Paid in cash"** (they are the receiver) → confirmed immediately.
- Owner pays a guest → payer confirms (owner), counts straight away.
- Owner can disable any quick expense or payment, as in groups.

## 6. Decided by the owner

| Topic | Decision |
|---|---|
| Entry point | "New expense" button, no group first |
| People source | past quick-expense contacts + members of any of the owner's groups + typed new names |
| Request page | B (netted list) when 2+ open items with that person, A (single request) when exactly 1 |
| Debts view | B: tabs People / Groups / Activity, split by direction |
| Simplify scope | across all open groups and quick expenses |
| Cross-group payment | spread across each group; each group shows its part |
| Who paid | owner or a contact |
| Confirmations | as in groups: guest-added waits, signed-in counts |
| Duplicates | pick-don't-retype + similar-name suggestions; nicknames for anyone; guest claim → existing confirm-merge flow |
| Payment methods | VietQR bank transfer usually; cash marked by the owner |

## 6a. Netting and settlement rules (decided by the owner after review)

1. **Pairwise balance inside a group = the group's suggested transfers** (`suggestTransfers` in `packages/core`), i.e. what the group already tells Minh to pay. If the group routes Minh's debt to someone else, that group contributes nothing to the owner–Minh total. Quick expenses (personal ledger) contribute their direct balance. The netted request page lists one line per group/quick expense with its signed amount.
2. **Debts in both directions settle as one settlement.** Example: owner owes Minh 100k in badminton, Minh owes owner 370k in quick expenses, Minh transfers 270k. Recorded as: personal ledger "Minh paid Nhan 370k" + badminton "Nhan paid Minh 100k", the latter labelled "settled through the People total". Both parts share `metaJson.settlementId` and count once the receiver of the real money confirms.
3. **Unlinked guests** with the same name in different groups show as separate People rows labelled by group, with a "Same person?" prompt that links them (owner-only link, display + netting; no account merge). Once linked they net together.

## 7. My calls (builder may revisit, owner to check)

- **Data model: quick expenses live in one hidden "personal" trip per user**, `preset: 'direct'`, organised by that user, never listed under Groups. Contacts are its participants (guests or linked users). This reuses transactions, shares, payments, statuses, guest identity, bank details and the activity log untouched. The alternative (expenses without a trip) touches every query that keys on `trip_id`; rejected.
- **Cross-group identity is by `userId`.** A signed-in person is the same everywhere. A guest is only "the same person" across groups and the personal ledger when the owner links them (picking a group member into a quick expense creates a personal-ledger participant pointing to that group participant via a new `linked_participant_id`, or the same `userId`). Unlinked guests are netted only within their own group. This is what keeps the netted total honest.
- **Confirming a settlement:** a guest's "I've paid" covering several groups is one settlement, confirmed once by the receiver. Disabling one group's part (by that group's admin or the owner) reopens only that part.
- **Request link scope:** a guest on the pair link can act only on the items it shows; group payments it creates use that guest's participant in each group.
- **Spreading a payment:** pay off oldest open balances first (by group's oldest open item), each group gets a `payment` transaction with a shared `metaJson.settlementId` so the spread can be shown and undone as one. Overpayment remainder lands in the personal ledger.
- **Request link token:** per (owner, person) pair, stored on the personal-ledger participant; opening it gives a guest session scoped to that participant (like today's group link + "who are you" skipped).
- **Nicknames:** new table `nicknames(owner_user_id, target_user_id | target_participant_id, nickname)`; display only, never in search-blocking or matching other than as an extra search term.
- **Wording:** Vietnamese first, English second, via `apps/web/src/i18n`.

## 8. Left to the builder

- Exact migration (`0009_…`), API routes, and how `GET /me/people` aggregates balances within the D1 limits (100 bound params, 50 queries/invocation — see vision "lessons").
- Screen composition using existing wrappers (`Sheet`, `Button`, `Pill`, `Amount`, `Avatar`), keeping `fsl-*` classes / `data-testid`.
- OG preview for the request link (reuse `apps/api/src/og`).
- Test plan; the 375px e2e golden path should gain: new quick expense → share link → guest opens → "I've paid" → owner confirms.
