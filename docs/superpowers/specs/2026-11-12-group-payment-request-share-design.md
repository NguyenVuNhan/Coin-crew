# Group payment request share (issue #93)

## Why

In Quick expenses, the reminder for one person sends a link that opens straight onto what they owe, with a VietQR to pay.
Groups have nothing as direct. The per-person reminder is buried in Your transfers. The last time the owner chased a
group, they sent the group invite into the Zalo group chat, and people who tapped it saw group info with no QR.

The owner wants two things in a group:

1. **Group total:** when you're owed money, one obvious button shares **one message and one link** into the group chat.
   Everyone who taps it lands on their own amount and a QR. (Each person already has their own link elsewhere, and
   that stays as it is.)
2. **Single expense:** whoever paid a normal group expense can share a bill picture plus a QR for that expense, the same
   way sport sessions already can.

Both carry **text, a link, and a picture**.

## Goals

- A clear "request payment" action on the balance card whenever the viewer is owed money in the group.
- A "share bill & QR" action on any normal group expense, for the person who paid it.
- Each share sends a PNG picture, a short text with the amounts, and one link that leads to a pay screen with an exact
  VietQR and "Tôi đã chuyển tiền".
- It works in every chat app (Zalo, Messenger, WhatsApp, Telegram, Google Chat) through the system share sheet, with a
  clipboard fallback and neutral wording ("paste into a message or group chat", never "paste into Zalo").

## Non-goals

- No per-debtor picker sheet or "Gửi link" per person in this flow. Per-person links already exist (Quick expenses /
  people screens, and the per-row reminder in Your transfers); none of them change.
- No new link types, tokens, or API routes. Both links already exist (see below).
- No change to the sport session bill or the planning share.
- No dedicated quick-share buttons per chat app. The system share sheet covers them.

## Anti-goals

- Someone who opens the shared link must never land on group info without a way to pay. That is the bug that started
  this.
- No Zalo-only wording or assumptions on the web.
- A picture must never suggest one fixed amount for everyone when amounts differ.

## What exists to build on

- **Group "what do I owe" link:** `payLink(view)` in `libs/web/screens/src/lib/remind.ts` gives `/j/<token>/owe`.
  `OweScreen` sends an unidentified guest to "Who are you?" with `?next=`, then shows their debts. With one debt and
  nothing waiting, it goes straight to `/pay/<toId>` (exact VietQR plus "Tôi đã chuyển tiền"). A signed-in member on the
  link is redirected to `/t/<tripId>/owe`.
- **Expense link:** `expenseLink(view, id)` gives `/j/<token>/e/<id>`, which already leads to the expense pay view
  (`ExpensePay`, the viewer's exact share). The sport bill share uses it with the bill's root id (`e.rootId ?? e.id`),
  so a link already posted keeps working after an edit.
- **Sport bill share** (`ExpenseDetails.tsx` `handleShareSportBill`, `renderSportBillPng` / `shareSportBill` in
  `libs/web/util/src/qr.ts`, `sportBillCard` in `lib/shareCards.ts`, `useImageSheet`). How it shares on each platform:
  - mouse pointer outside the Zalo webview: copy the text only, with the "copied" status;
  - Zalo Mini App (`platform.kind === 'zmp'`): `platform.saveImage(png)`, then `platform.share(card)`;
  - Zalo in-app browser (`isZaloWebView()`): the image sheet with copy instructions;
  - otherwise: `navigator.share({ files, text })`, falling back to download plus copy.
- **Pay info / QR:** `useQrSvg(payload)` draws a payload. Getting your *own* QR takes bill mode: with `toId` set to
  yourself and no `bill`, the payload is null. `usePayInfo({ bill: true, expenseId })` (`apps/api/src/bank/routes.ts`)
  gives the payer's QR for an expense, with `equalBillShare(e)` filled in when every non-payer owes the same, else no
  amount. `bill: true` without `expenseId` gives your QR with no amount, and its transfer note is the group name.
  `ExpenseDetails` currently enables `usePayInfo` only for sport; widen that gate.
- **Bank guard:** `useBankFirst` (`lib/bankFirst.ts`) opens the "add details / share anyway" sheet when the sharer has
  no usable bank details. The sport bill's payer path uses it. `bankDetailsHref` sends members to `/me/bank` and guests
  to the group's `/bank`.
- The expense link `/j/<token>/e/<id>` reaches `ExpensePay` through the `OldExpenseLink` redirect to
  `/j/<token>/expenses/<id>/pay`. Tests should expect that path.
- **Copy:** `remind.text`, `share.remindTitle`, `sport.shareCopied`, `pay.shareSaved` and `pay.shareFailed` in
  `@cc/web-i18n` (vi + en).

## Part 1: Group total ("Yêu cầu thanh toán")

### Trigger

The debtors are `view.suggestions.filter(s => s.toId === me)`, the group's suggested transfers into the viewer, in the
order the view gives them. On `BalanceCard`, when that list isn't empty, the group isn't archived, and the viewer is a
member or an identified guest (not a viewer), show a primary block button: **"Yêu cầu thanh toán"** / "Request
payment", with the share icon. *(Planner's call: the trigger is "incoming transfers exist", not `now > 0`. When
fewest-transfers is off, the transfers are pairwise, so someone can be owed by some people while their net is zero or
negative. TỔNG is the sum of the incoming transfers and may differ from the card's amount.)*

- **No bank details** (`'none'`): the button goes through `useBankFirst`, like the sport bill's payer path. "Add
  details" goes to `bankDetailsHref`. "Share anyway" sends the picture without the QR or bank line.
- **Details waiting for approval** (a guest's `'pending'`): no sheet, since they already added details. The picture
  goes out without the QR or bank line. *(Planner's call.)*

### The picture (approved wireframe, option A)

A PNG drawn with the same canvas style as the sport bill (same fonts, grey header row, total row, QR and bank line at
the bottom):

- Title: `<group name> · Yêu cầu thanh toán`
- Meta line: `<today's date> · Nhận: <viewer's name>`
- Table **TÊN | CẦN CHUYỂN**: one row per debtor, amount in the debt colour, then a **TỔNG** row with the sum.
- The viewer's VietQR **with no amount filled in** (amounts differ per person; from `usePayInfo({ bill: true })` with
  no `expenseId`, so the note is the group name; *planner's call, no API change*), and the bank line
  `<name> · <bank> · <account> · <holder>`.
- Hint under it: "Mở link để có mã QR đúng số tiền của bạn" / "Open the link for a QR with your exact amount".

Amounts are the suggested-transfer amounts. If the group rounds transfers (`view.trip.roundTransfers`), show what the
pay screen will ask for. Builder: check whether `suggestions` are already rounded, and don't round twice.

### The text

```
Nhóm "<group>", cần chuyển cho <viewer>:
• <name> <amount>
• …
Chọn tên mình để xem mã QR: <payLink(view)>
```

English equivalent in `en`. A new i18n key or keys. Builder decides the exact key structure.

### Recipient

Unchanged `OweScreen` flow through `payLink(view)`. Nothing new on the recipient side.

## Part 2: Single expense bill ("Chia sẻ hoá đơn & mã QR")

### Trigger

In `ExpenseDetails`, for a **normal (non-sport) group expense**, below the split list, in the same spot and style as the
sport bill button. It shows only when **all** of these hold:

- the viewer is the expense's payer (`e.payerId === view.me.participantId`);
- the expense isn't paid from the group fund;
- the group isn't archived;
- the expense is approved. *(Planner's call: not pending, even though the pay view accepts pending. Nobody gets chased
  for an expense the group hasn't accepted.)*

Sport sessions keep their current bill and button, which any viewer can see. Payer-only is new behaviour for this
button.

### The picture (approved wireframe, option B)

Drawn in the same style as the sport bill:

- Title: the expense description.
- Meta line: `<spent-on date> · <group name> · Trả trước: <payer name>`
- Table **TÊN | PHẦN CHIA**: every share. The payer's row is greyed out and marked "(người trả)" / "(paid)". The
  others' amounts are in the debt colour. Then a **TỔNG HOÁ ĐƠN** row with the expense amount.
- The payer's VietQR from `usePayInfo({ bill: true, expenseId })`, the same as the sport bill. *(Planner's call:)*
  - **equal split:** the QR has the one share amount filled in. That's fine here because everyone owes the same. The
    hint reads "Quét mã để chuyển <amount>" / "Scan to send <amount>".
  - **uneven split:** no amount, with the hint "Mở link để có mã QR đúng phần của bạn".
- Then the bank line.
- **No usable bank details:** the button goes through `useBankFirst`, as the sport bill's payer path does. "Share
  anyway" sends the picture without the QR or bank line, and the link works once details are added.

### The text

Short, like the sport one: `<description>: <total>, <split summary>.` then `Mã QR & chi tiết: <expenseLink(view, rootId)>`.
For an equal split the summary is "mỗi người X". Otherwise it is a "riêng <name> X" style list, or just the total.
Builder's call, but keep it to one or two lines.

### Recipient

`/j/<token>/e/<rootId>`, the existing expense pay view: the person picks their name if needed, then sees their exact
share, the QR, and "Tôi đã chuyển tiền".

## Sharing behaviour (both parts)

Use the same platform branches as `handleShareSportBill` (listed above), with status messages in the same place (saved
/ copied / failed). There is one deliberate difference for the two new shares (owner's decision):

- **Mouse pointer outside the Zalo webview (PC):** copy the text first, while the click still counts as a user
  gesture, then open the image sheet (`useImageSheet`) with the picture, so the sharer can save or copy it and paste
  both into the chat.
- **Why:** the link preview for `/owe` and for normal expenses has no QR, unlike the sport bill's, so text alone would
  arrive with no picture.
- The sport bill's PC behaviour stays as it is. Pull the shared logic out so the sport bill, the group request and the expense bill all go through
one helper, rather than copying the branches twice more. The helper's shape is the builder's call.

All copy uses neutral wording: "paste into a message or group chat". The Mini App share cards get a new card builder
(like `sportBillCard`). Its thumbnail can reuse an existing OG image. Builder's call.

## Design constraints

From `DESIGN.md` / `PRODUCT.md` and the project's CLAUDE.md:

- `Button` wrapper (primary, block) with touch targets of at least 44px.
- Money in `tabular-nums`.
- Theme colours only in components. The canvas uses fixed colours like the sport bill does; keep them in the same
  drawing module.
- Keep the existing `fsl-*` classes. Add new ones (`fsl-balance__request`, `fsl-expense-share`, and so on) for tests.
- Platform features go through `usePlatform()`.
- The PNG drawing goes in `@cc/web-util` (next to the sport bill). Text builders and cards go in
  `libs/web/screens/src/lib`. Copy goes in `@cc/web-i18n` (vi + en).

## Tests

- Unit tests: the text builders (group and expense, vi and en, rounding, payer excluded).
- Drawing tests: the drawing functions get the right rows (follow how the sport bill is tested).
- Component tests:
  - the BalanceCard button shows only when owed, not archived, and debtors exist, and its no-bank behaviour;
  - the ExpenseDetails button shows only for the payer, not for fund-paid, sport, archived or pending expenses;
  - a click calls the share path for each platform branch (mocked).
- Add new tests only. Don't edit existing ones except where a moved helper changes an import.

## Left to the builder

The i18n key names, the shared share helper's shape, the exact canvas layout numbers, the split-summary wording for
uneven splits, the Mini App card thumbnail, and how the no-bank state looks on the balance card.
