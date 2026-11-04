# Round settlements to 1,000 ₫: design

Date: 2026-11-03. Status: ready for approval.

## Why

In Vietnam, cash and banking transactions commonly deal in thousands of đồng (1.000 ₫ is the smallest practical denomination; coins and odd single đồng are not used). When splitting a 50.000 ₫ bill 3 ways (16.666,7 ₫) or a 500.000 ₫ bill 6 ways (83.333,3 ₫), CoinCrew currently displays exact shares like 16.667 ₫ or 83.333 ₫. Asking friends to transfer odd figures like 16.667 ₫ or 83.333 ₫ creates friction and looks unnatural.

Users want an option to round these split numbers to clean thousands (e.g. 17.000 ₫ or 83.000 ₫), while keeping the underlying database records and accounting exact.

## Goals

1. **Clean settlement amounts**: In the **"Who pays whom"** transfer suggestions, all suggested transfer amounts round to the nearest 1.000 ₫ (`Math.round(amount / 1000) * 1000`).
2. **Single-bill QR rounding**: When someone views an expense and scans or pays via its bill QR code (equal bill share or the interactive Expense Pay flow), the QR code amount also rounds to the nearest 1.000 ₫.
3. **Group setting toggle**: A new switch in Group Settings ("Làm tròn số tiền trả" / "Round transfer amounts"), defaulting to **off (disabled)** for all groups.
4. **All split modes covered**: Because all split modes (equal, percentage, shares, adjust, sport) ultimately resolve into pair balances and "Who pays whom" suggestions, this rounding naturally handles settlements across every split mode.
5. **Clean settlement closure**: Once a member transfers the rounded amount, any small residual balance under or equal to 500 ₫ rounds to 0 ₫ and is omitted from "Who pays whom", so groups are considered fully settled without odd leftovers.

## Non-goals

- No altering of raw expense records in the database. Expense amounts and individual share records (`transaction_shares`) store their exact values.
- No forced artificial rebalancing among participants during expense creation. The ledger remains mathematically sound and zero-sum.
- No global default to true. Existing and newly created groups have this setting disabled by default.

## Anti-goals (a failure even if it works)

- **Database corruption or drift**: Altering stored expense shares so they don't match the expense amount or leaking money across group balances.
- **Persistent phantom debts**: Showing transfers or badges for 333 ₫, 500 ₫, or 667 ₫ after someone has already paid the requested 17.000 ₫ or 83.000 ₫ rounded amount.
- **Inconsistent QR payment**: Showing 17.000 ₫ in "Who pays whom" or on a bill screen but generating a VietQR payload for 16.667 ₫.
- **Overpayment ping-pong**: Rounding a 500 ₫ overpayment up to 1.000 ₫, generating an endless loop of 1.000 ₫ reverse transfers.

## Constraints

- **Exact storage**: The database continues to store exact figures down to the single đồng for all expenses, shares, payments, and balances. Rounding is strictly presentation and transfer suggestion logic in backend/frontend.
- **UI & design system**: Follow `CLAUDE.md` (shadcn + app wrappers, theme tokens from `globals.css`, touch targets ≥44px, tabular numbers for money).
- **i18n**: Strings in `packages/web-common/src/i18n/vi.ts` and `en.ts` with `// REVIEW` comment on new Vietnamese keys.

## Decisions Made

### 1. Database Schema & API
- Add column `round_transfers` (integer, default 0, not null) to `trips` table in `apps/api/src/db/schema.ts`.
- Expose `roundTransfers: boolean` on `TripView['trip']` in `packages/core/src/api-types.ts`.
- Allow updating via `PATCH /api/trips/:id` with `{ roundTransfers: boolean }`, guarded by member permission (`manage_settings` or member role, matching `fewestTransfers`).

### 2. "Who pays whom" Calculation & Residual Extinguishment
In `apps/api/src/trips/snapshot.ts`:
- When `trip.roundTransfers === 1` (true):
  - For each generated `Transfer` in `suggestions`:
    - To prevent rounding-up loops for half-way amounts (e.g. 500 ₫ overpayment becoming 1.000 ₫), transfers with amount `<= 500 ₫` round to `0 ₫`.
    - Amounts `> 500 ₫` round to the nearest 1.000 ₫: `Math.round(t.amount / 1000) * 1000`.
    - Filter out transfers where `amount <= 0`.
- When a user marks a transfer as paid or pays via VietQR from "Who pays whom", the recorded payment amount is the rounded suggestion (e.g. 83.000 ₫ or 17.000 ₫).
- The payment updates ledger balances normally. For example, paying 83.000 ₫ on an 83.333 ₫ debt leaves a 333 ₫ residual balance. On next snapshot calculation, 333 ₫ is `<= 500 ₫`, so it rounds to 0 ₫ and disappears from `suggestions`, settling the debt cleanly.

### 3. Balance Presentation (`myBalance`)
- In `apps/api/src/trips/snapshot.ts` and `apps/api/src/trips/view.ts`:
  - When `trip.roundTransfers` is enabled:
    - `TripView.myBalance.now` and `beforePayments` are rounded: if `|val| <= 500 ₫`, the displayed balance is `0 ₫`; otherwise it is `Math.round(val / 1000) * 1000`.
  - In `GET /api/trips` (`TripListItem`):
    - `myBalance` is similarly snapped to 0 if `|myBalance| <= 500 ₫` when the group has `roundTransfers` on.
  - This ensures `BalanceCard` and `MyTrips` show the group as fully settled once rounded transfers are paid.

### 4. Single-Bill QR & Interactive Expense Pay Rounding
- In `apps/api/src/bank/routes.ts` (`equalBillShare` / `?bill=1`):
  - When `trip.roundTransfers` is enabled, the bill share rounds to nearest 1.000 ₫: `Math.round(share / 1000) * 1000`.
- In `apps/api/src/expenses/payView.ts` (`/expenses/:id/pay`):
  - When `trip.roundTransfers` is enabled:
    - The row's `remaining` display and VietQR payload amount round to nearest 1.000 ₫ (or 0 if `<= 500 ₫`).
    - `POST .../pay-report` validation accepts payment amounts up to the rounded remaining amount (so paying 17.000 ₫ on a 16.667 ₫ share is accepted).

### 5. Group Settings UI
- In `packages/web-common/src/screens/Settings.tsx`:
  - Add `RoundTransfersSwitch` right next to `FewestSwitch`.
  - Visible to members when group is not archived.
  - Toggles `roundTransfers` via `useTripAction` (calling `PATCH /api/trips/:id`).
  - Label:
    - English: "Round transfer amounts" / "Round transfer suggestions to the nearest 1,000 ₫"
    - Vietnamese: "Làm tròn số tiền trả" / "Làm tròn số tiền chuyển khoản đến 1.000 ₫ gần nhất"

## Decisions I Made (Please Check)

1. **Residual threshold (`<= 500 ₫`)**: Any leftover balance of 500 ₫ or less from rounded payments (such as 333 ₫ or an exact 500 ₫ split) rounds down to 0 ₫ and disappears from suggestions and balances. This prevents infinite 1.000 ₫ overpayment ping-pong loops.
2. **`myBalance` presentation rounding**: When `roundTransfers` is on, the user balance displayed in the header and trip list also rounds to nearest 1.000 ₫ (and snaps to 0 ₫ if `<= 500 ₫`) so the user isn't told "You owe 333 ₫" with no way to pay it.
3. **Expense Pay (`payView.ts`) integration**: Extended the single-bill rounding to the interactive `/expenses/:id/pay` screen and permitted `pay-report` to accept the rounded amount up to `Math.round(remaining / 1000) * 1000`.

## Left to the Builder

- The exact component extraction (`RoundTransfersSwitch.tsx` matching `FewestSwitch.tsx` conventions).
- Unit tests covering:
  - Schema default and PATCH endpoint for `roundTransfers`.
  - `snapshot` suggestion rounding and `<= 500 ₫` filtering.
  - `myBalance` display rounding when `roundTransfers` is true vs false.
  - Bill QR and `payView` payload amount rounding and `pay-report` validation.
  - Settings screen switch rendering and interaction.
