# Pay one expense from a shared link: design

Date: 2026-11-03. Status: draft for review.

## Why

An organiser (example: Nhàn) pays 425.000 ₫ for a badminton court, adds the expense and taps **"Chia sẻ bill & QR"**. The bill picture and a link to that expense go into the Zalo group. Today a guest who opens the link picks a name and lands on the same full expense page the organiser sees: the slot table, the share button, and a QR that only has an amount when everyone owes the same. They have to work out their own number, then go somewhere else to pay.

What the guest wants is one number and one button. The organiser wants transfers to arrive with names they can match, and to confirm them quickly, often five or more within ten minutes while still at the court.

Some players bring friends, and they're on the bill as extra slots on the player's row. The link gets forwarded to those friends, who need to find "their" row and pay for it, either the whole row or only their own slot.

## Goals

1. A single-expense link opens a **pay-only screen** scoped to the viewer's share of **that expense**. The screen has the amount, the transfer note, the QR and the shared **"Mở ứng dụng ngân hàng"** button. Nothing else.
2. On a single-expense link, the picker lists **only the people in that split**. A row with more than one slot reads **"<Name> hoặc bạn của <Name>"**.
3. A friend paying through that row says which part they paid, and the organiser sees **who** paid (Lan, or Lan's friend).
4. The organiser confirms "đã trả" reports in **one card per expense** (option B): one tap per row, "Đã nhận tất cả", undo, and edit later.
5. Opening the link again shows only **what's left** of that share, plus what's been paid and by whom. When nothing is left it shows "Đã trả đủ ✓" with no QR.

## Non-goals

- No change to the organiser's own expense page or to "Chia sẻ bill & QR" itself, beyond the link it already shares.
- No change to group links (`/j/:token`). The picker and landing stay as they are, including "picked the payer, or has no share → normal page".
- Friends do **not** become people in the group. A friend's payment is recorded against the row they paid for.
- No automatic bank matching. The organiser still confirms by hand.

## Anti-goals (a failure even if it works)

- The guest has to read the slot table or do arithmetic to know what to pay.
- A guest who picks the row of a **signed-in member** can then act as that member (sign in as them, see their history or debts, change their data).
- The organiser has to open a separate screen for each transfer or answer "are you sure?" dialogs.
- A second copy of the bank-app button. The pay screen must use the existing `PayQr` component (`packages/web-common/src/components/PayQr.tsx`). The bank button was reworked in PR #35 (spec `docs/superpowers/specs/2026-11-02-bank-app-handoff-design.md`). This work passes `PayQr` a `PayInfo` and doesn't change its internals.

## Bank button after PR #35 (what this design relies on)

- **`PayQr`'s props are unchanged** (`info`, `variant: 'pay'`, `summary`), so the pay screen renders `<PayQr variant="pay" info={…} />` as planned.
- **No bank app prefills from a link any more.** The bank reads the amount from the **saved QR picture** (save first, then open the bank). So the scoped amount must be in `PayInfo.payload` (the VietQR string) and in `PayInfo.amount`. The server has to build a `PayInfo` for **this row's remaining amount on this expense**. Today's `?bill=1&expense=` only gives a per-person amount when everyone owes the same, so that needs a new query, for example `&for=<participantId>`, which is also what friend mode uses.
- **The QR file is named after `refCode`**, which stays one code per pair. That's fine.
- **The button label changes** once a bank is remembered: "Mở ACB ONE" with a ⇄ switch, instead of "Mở ứng dụng ngân hàng". The mockups' wording means "whatever `PayQr` shows".
- **The handoff sheet stays open when the guest comes back** from the bank, showing ✓ and the "Quét QR → tải ảnh lên" tip. "Tôi đã chuyển" sits outside `PayQr`, so the guest closes the sheet first. That's acceptable, and it's how `PayScreen` works today. A "Tôi đã chuyển" inside the sheet would be a follow-up change to `PayQr`, not part of this work.
- **Zalo Mini App (`apps/zalo`):** step 2 of the handoff tells people to open their bank by hand. Nothing changes for us, except that the pay screen and the picker rules have to work on that platform too, through `usePlatform()`.
- **Paths:** the web UI now lives in `packages/web-common/src/` (moved in #32), not `apps/web/src/`. That covers `ExpenseDetails`, `WhoAreYou`, `ApprovalsCard`, `icons.tsx` and `styles/globals.css`.

## The flow (agreed with the user, see `.superpowers/brainstorm/*/content/whole-flow.html`)

1. **Organiser shares**, as today: `expenseLink()` → `/j/:token/e/:expenseId`.
2. **Guest opens the link and picks a name.** Only people with a share in this expense are listed, and the payer isn't. Rows with more than one slot (sport `maleSlots + femaleSlots > 1`) read "Lan hoặc bạn của Lan". A signed-in member of the group skips the picker.
3. **Pay screen** (new): "Trả cho Nhàn", the expense name and date, the remaining amount for this row, the transfer note, then `PayQr variant="pay"`. On a phone that's the bank-app button; on a computer it's the QR to scan, as `PayQr` already does. Below it is "Tôi đã chuyển". The back button goes to the group's "Khoản chi" page. Signed-in members who open the link get this screen too.
4. **"Tôi đã chuyển".** If the row has more than one slot, a one-question sheet asks **"Bạn trả cho ai?"** The options are "Cả phần của Lan · <remaining>", one tile per extra slot with its ♀/♂ icon and that slot's amount ("Chỉ phần của tôi"), and "Số khác" to type an amount. That records a `says_paid` payment from Lan to the payer, linked to this expense, with who paid it. (This step was my suggestion; the user preferred it to deciding everything at confirm time.)
5. **The organiser gets one approval card per expense**: a header with the 🏸 expense, a progress bar showing "X / Y ₫ đã về", and how many people haven't reported yet. Each row has the avatar, the sender label, the transfer note, the amount and a round ✓. People who haven't reported are greyed out with a 🔔 remind icon. "Đã nhận tất cả · <sum>" sits at the bottom. With only one report the card is the single version (card A on the mockup).
6. **Confirming:** tapping ✓ confirms the reported amount and shows a snackbar with "↺ Hoàn tác". Tapping the row opens the detail (card A): "✓ Đã nhận <amount>", "✎ Số khác" (slot tiles, or type an amount; the button label shows the total), and "✕ Chưa nhận". Tapping a confirmed ✓ again reopens it to fix a mistake.
7. **Reopening the link:** the screen shows only the remaining amount, plus a ✓ line for each payment ("Bạn của Lan đã trả 45.000 ₫"). When it's all paid: "Đã trả đủ ✓", with no QR and no button.

### Sender label

| Row's person | What the guest picked at step 4 | Label the organiser sees |
|---|---|---|
| Signed-in member (Lan has an account) | anything, from a device in friend mode | **"Bạn của Lan"** ("her friend paid her share") |
| Guest Lan | "Cả phần của Lan" | "Lan (hoặc bạn của Lan)", because we can't tell who tapped |
| Guest Lan | a single extra slot | "Bạn của Lan" |
| Signed-in Lan, on her own account | (no "friend" choice) | "Lan" |

## Constraints

- **UI:** follow `CLAUDE.md` (shadcn + the app wrappers `Button`, `Sheet`, `Snackbar`, `Avatar`, `Pill`, `Icon`, `Amount`; colours only from `globals.css`; tap targets of at least 44px; amounts in `tabular-nums`). The icons already exist in `icons.tsx`: `userPlus` (friend badge), `circleCheck`/`check`, `x`, `edit`, `rotateCcw` (undo), `bank`, `copy`, `clock`, `mars`/`venus`, plus a bell or remind icon (add a lucide one if missing).
- **i18n:** new strings go in both `vi.ts` and `en.ts`. The Vietnamese text in the mockups is the starting point, marked `// REVIEW` the way the files already do it.
- **Tests** select by `fsl-*` classes and `data-testid`. Existing ones on `ApprovalsCard`/`ApprovalQueue` stay on the same elements.
- **Transfer notes** stay one per payer→receiver pair (`payments/refs.ts`). Every guest row still has its own code, which is all the organiser needs to tell transfers apart.

## Decisions I made (please check)

1. **Linking a payment to an expense.** A payment row stores in `meta_json` `{ expenseId, paidBy: 'self' | 'friend', slots?: [...] }`. Pair balances still use the payment exactly as today. "What's left of this share" = the share for this expense minus the `says_paid` and `confirmed` payments linked to it, **and never more than what the pair still owes overall**, so someone who settled the pair elsewhere isn't asked twice.
2. **Which links get the pay-only screen:** every single-expense link where the viewer has a share and isn't the payer, not only sport expenses (reminders use the same link). The "hoặc bạn của" label and the slot tiles only appear for sport rows with more than one slot. For anyone who isn't in the split (the payer, an admin), the link opens the normal expense page.
3. **Who confirms:** the person the payment goes to (the expense payer), as the queue works today.
4. **The grouped card** replaces the separate "says they paid" cards only for payments linked to the same expense. Payments that aren't linked keep today's card.
5. **The amount on a slot tile** is that slot's price on the bill (`femaleSlotRate` / `maleSlotRate` from `computeSportShares`), and never more than what's left. "Cả phần của <Name>" is always the remaining amount. Fixed-amount rows have no tiles, only "Cả phần" and "Số khác".
6. **`meta_json.expenseId` is the expense's root id.** What's left is always worked out against the expense's current version, so editing the shares changes what's left.
7. **Members' own reports keep today's rule.** A signed-in member reporting their own payment to a member counts as confirmed straight away (`statusForNewPayment`) and appears on the card already ticked. If the expense payer has no account, reports count straight away and no card appears, as today.
8. **Undo, edit after confirming, and "Chưa nhận" on a confirmed payment are new backend work.** Today the confirm route accepts only `says_paid`, and `not-arrived` refuses confirmed payments. Each change updates the payment row in place, guarded on its status the way `/confirm` and `/arrived` already work (payments aren't versioned today), and writes an activity entry (`payment_revised`):
   - **Undo** (snackbar): back to `says_paid`.
   - **Edit:** a new confirmed amount.
   - **"Chưa nhận" after confirming:** the payment becomes `rejected`/not arrived.

   In every case, what's left goes back up. The guest's pay screen then shows a short notice ("Nhàn chưa nhận được 45.000 ₫") above the amount. Core permission rules need to allow these for the receiver.

## Identity when picking a row (decided by the user)

- **The row's person is a guest (no account):** picking the row works as it does today. The device claims that person, the same as any group-link pick. If Lan's friend picks it, they see what Lan sees, which **the user accepts**. "Bạn trả cho ai?" at step 4 is how the friend says they only paid their own slot, and the organiser sees "Bạn của Lan" for that report.
- **The row's person is a signed-in member:** picking their row from a device that isn't signed in as them **does not claim them** and never signs that device in (today `/people/pick` answers 403 for rows tied to an account; that stays). Instead, the device gets **friend mode, limited to this one expense**. It can see this expense's pay screen for that row, the share and what's left, and report a payment (`says_paid`, `paidBy: 'friend'`). It can't see anything else: no history, no other debts. The member's row reads "Lan hoặc bạn của Lan" only when it has more than one slot. A member row with one slot isn't selectable from a device that isn't signed in, and tapping it prompts the person to sign in.
- **How friend mode is granted and checked is the builder's call**, within these rules:
  - It's tied to the link token plus the expense id.
  - It can only create a `says_paid` payment from that row's person to the expense payer, for no more than what's left.
  - It's stored per device, so reopening the link shows what's left.
  - It doesn't touch `deviceParticipants` or "last used here".

  Today `statusForNewPayment` and `resolveActor` assume the actor is the sender. Friend mode is an explicit, narrow exception and needs its own tests.

## Left to the builder

- The route and component layout for the pay screen (a new screen under the `/j/:token/expenses/:id` route, or a mode of `ExpenseDetails`).
- How the picker gets "people in this expense" (a query parameter on `/people/picker` or filtering on the client).
- The undo window length and the progress-bar styling, within the "Friendly" look.
