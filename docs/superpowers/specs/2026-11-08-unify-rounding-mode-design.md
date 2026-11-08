# Unify Rounding Mode (1.000 ₫) Across All Group Interactions: Design

Date: 2026-11-08. Status: Ready for User Approval.
Related Epic: #82
Issue Ticket: #85

## 1. Intent & The Why

In Vietnam, cash and electronic banking operate in thousands of đồng (1.000 ₫ is the smallest practical unit; coins and odd single đồng do not circulate).
While PR #41 / #44 (`dc84d2d`) added transfer settlement suggestion rounding to 1.000 ₫ (`roundTransfers`), it deliberately left all expense-level, split-level, and member-balance UI surfaces showing raw, unrounded figures (e.g. `16.667 ₫`, `83.333 ₫`, `333 ₫`).

This creates sharp friction and inconsistency:
- When a user enters a 50.000 ₫ bill split 3 ways, the form's live preview says `16.667 ₫`.
- In the expense details breakdown, it says `16.667 ₫`.
- When sharing the bill link or copying reminder text to Zalo/Messenger, the message and link preview snippet say `16.667 ₫` or `66.667 ₫`.
- However, when the debtor opens the bill link or VietQR to pay, the app asks them to pay `17.000 ₫`.
- After paying `17.000 ₫`, the People list and View-Only tab display lingering residual debts (`333 ₫`) instead of showing "Settled" because `TripView.balances` leaks raw unrounded ledger numbers.

Users expect that when a group has rounding enabled, **every interaction and display in the group consistently reflects clean rounded thousands (1.000 ₫)**, while keeping the underlying ledger mathematically sound and exact down to the single đồng.

---

## 2. Goals, Non-Goals, & Anti-Goals

### Goals
1. **Unified Presentation Rounding**: Whenever `trip.roundTransfers` is enabled (true), all monetary amounts shown to users across all group surfaces format to the nearest 1.000 ₫ (`Math.round(val / 1000) * 1000`):
   - Expense creation/editing live split preview (`ExpenseForm.tsx`).
   - Expense row card amounts on the home dashboard (`ExpenseRow.tsx`).
   - Expense details participant share breakdown (`ExpenseDetails.tsx`).
   - Sport bill table breakdown and slot rates (`SportBillTable.tsx`).
   - Canvas PNG bill export image (`qr.ts`).
   - Copied chat share messages (`sportShareText`, `remindText` in `remind.ts`).
   - Social Open Graph preview cards for shared links (`apps/api/src/og/text.ts`).
   - Group member balances in the People tab (`People.tsx`) and View-Only tab (`ViewOnlyTrip.tsx`).
2. **VietQR & Payment Amount Alignment**:
   - Single-bill VietQR, settlement VietQR, and `ExpensePay` remaining amount continue to encode and transfer the rounded figure (e.g. `17.000 ₫`).
   - Fix the API bug in `GET /api/trips/:id/pay/:toId?bill=1` so `PayInfo.amount` returns the rounded `billAmount` instead of the caller's overall pairwise suggestion debt.
3. **Residual Balance Extinguishment in `TripView.balances`**:
   - In `apps/api/src/trips/view.ts`, when `roundTransfers` is true, derive all participant balances in `TripView.balances` directly from the active rounded suggestions (`owedToId - idOwes`, matching `myBalance.now`), ensuring zero phantom balances and displaying clean "Settled" badges once rounded transfers are paid.
4. **Preserve Group Settings Toggle**:
   - Retain the existing switch in Group Settings (`RoundTransfersSwitch.tsx`) with its existing title and explain text (*"Làm tròn số tiền trả"* / *"Round transfer amounts"*).

### Non-Goals
- **No altering of raw database records**: `transactions.amount` and `transaction_shares.amount` continue to store exact single đồng integer values. Rounding is strictly a presentation and payment suggestion rule.
- **No artificial forced balance tampering during expense creation**: No arbitrary distortion of expense shares in the database (e.g. forced 17k/17k/16k storage). Zero-sum ledger integrity is strictly preserved.
- **No change to Personal Ledger (`preset: 'direct'`)**: The quick personal ledger continues with exact single-đồng tracking unless explicitly configured.

### Anti-Goals (Failure Criteria)
- **Database Drift / Ledger Corruption**: Causing `transaction_shares` to sum to anything other than `transaction.amount`.
- **Amount Mismatches Between Text & QR**: Sharing a message saying "mỗi người 16.667 ₫" while the recipient's QR asks for "17.000 ₫".
- **Persistent Phantom Balances**: Showing "Owes 333 ₫" or "+333 ₫" on the People tab after all rounded suggestions have been fully paid.
- **Overpayment Ping-Pong Loops**: Allowing a 500 ₫ overpayment to round up to 1.000 ₫, generating unending reverse transfers.

---

## 3. Constraints
- **Design System & Monetary Formatting**: Follow `CLAUDE.md`. Tabular numbers (`tabular-nums font-semibold`), touch targets $\ge 44$px.
- **Monorepo Architecture**: Nx workspace (`apps/api`, `libs/shared/core`, `libs/web/screens`, `libs/web/util`, `libs/web/ui`).
- **i18n**: Strings in `libs/web/i18n/src/vi.ts` and `en.ts`.
- **Backward Compatibility**: Existing database records remain unchanged. Groups with `roundTransfers: 0` continue displaying exact unrounded figures.

---

## 4. Decisions Made

### 4.1 Strict Layer Separation
- **Presentation Layer (100% Rounded)**: Controlled by `view.trip.roundTransfers`. When `true`, every UI component, chat template, and preview snippet formats amounts to nearest 1.000 ₫ (extinguishing residuals $\le 500$ ₫ to 0 ₫).
- **Transaction & Ledger Layer (Strictly Raw)**: Database storage, validation, and accounting compute exact raw đồng.

### 4.2 Group Settings Switch
- The switch remains in Group Settings with its existing label:
  - VI: *"Làm tròn số tiền trả"* / *"Làm tròn số tiền chuyển khoản và mã QR đến 1.000 ₫ gần nhất."*
  - EN: *"Round transfer amounts"* / *"Round suggested transfers and QR codes to the nearest 1,000 ₫."*

### 4.3 Component & Presentation Updates
1. **Expense Form Split Preview ([`ExpenseForm.tsx`](file:///C:/Users/NvN/orca/workspaces/coin-crew/epic-phase-1-group-split-vietqr-hardening/libs/web/screens/src/screens/ExpenseForm.tsx))**:
   - When `roundTransfers` is enabled on the group, format the right-hand share preview column for calculated splits (`equal`, `percent`, `shares`, `sport`) with `formatVnd(roundToThousand(shareAmount))` so users see `17.000 ₫` instead of `16.667 ₫`.
2. **Expense List Rows ([`ExpenseRow.tsx`](file:///C:/Users/NvN/orca/workspaces/coin-crew/epic-phase-1-group-split-vietqr-hardening/libs/web/screens/src/components/ExpenseRow.tsx))**:
   - When `roundTransfers` is true, format the user's row share with presentation rounding (`Math.round(amount / 1000) * 1000`).
3. **Expense Details Participant Breakdown ([`ExpenseDetails.tsx`](file:///C:/Users/NvN/orca/workspaces/coin-crew/epic-phase-1-group-split-vietqr-hardening/libs/web/screens/src/components/ExpenseDetails.tsx))**:
   - In `<Amount value={s.amount} />`, when `roundTransfers` is true, pass the presentation-rounded value `roundToThousand(s.amount)`.
4. **Sport Bill Breakdown & Canvas Export ([`SportBillTable.tsx`](file:///C:/Users/NvN/orca/workspaces/coin-crew/epic-phase-1-group-split-vietqr-hardening/libs/web/screens/src/components/SportBillTable.tsx), [`qr.ts`](file:///C:/Users/NvN/orca/workspaces/coin-crew/epic-phase-1-group-split-vietqr-hardening/libs/web/util/src/qr.ts))**:
   - When `roundTransfers` is true, round `maleSlotRate`, `femaleSlotRate`, and each player's row amount in the table and on the generated HTML5 canvas bill image.
5. **Share Link Content & Social Previews ([`apps/api/src/og/text.ts`](file:///C:/Users/NvN/orca/workspaces/coin-crew/epic-phase-1-group-split-vietqr-hardening/apps/api/src/og/text.ts), [`remind.ts`](file:///C:/Users/NvN/orca/workspaces/coin-crew/epic-phase-1-group-split-vietqr-hardening/libs/web/screens/src/lib/remind.ts))**:
   - In `apps/api/src/og/text.ts`, when `snapshot.trip.roundTransfers` is true, round slot rates and expense share descriptions in Open Graph card snippets.
   - In `remind.ts` (`sportShareText`), format slot rates and member amounts with rounding if the group has `roundTransfers`.
   - In `ExpensePaymentsApproval.tsx`, when sending a reminder for an unconfirmed share, send the rounded share matching what `ExpensePay` will prompt.
6. **Group Member Balances (`TripView.balances`)**:
   - In `apps/api/src/trips/view.ts`, when `snapshot.trip.roundTransfers` is enabled, derive each participant's balance in `TripView.balances` directly from active rounded suggestions (`owedToId - idOwes`, exactly matching the logic used for `myBalance.now` in `view.ts:43-49`).
   - This ensures `TripView.balances` is mathematically zero-sum, avoids aggregation drift, and guarantees that `People.tsx` and `ViewOnlyTrip.tsx` display clean "Settled" badges without phantom residual debts.

### 4.4 API Bug Fix
- In `apps/api/src/bank/routes.ts` (`GET /api/trips/:id/pay/:toId?bill=1`):
  - Return `amount: billAmount` in `PayInfo` instead of `suggestion?.amount ?? 0`. If `equalBillShare` is null (unequal split), `billAmount` is 0 (open amount QR).

---

## 5. Decisions I Made (Builder Calls)

1. **`TripView.balances` Derived from Suggestions**:
   - When `roundTransfers` is true, `balances[participantId]` is computed by netting incoming rounded suggestions minus outgoing rounded suggestions for that participant (`owedToParticipant - participantOwes`).
   - This prevents aggregation errors where multiple rounded payments against fractional shares could leave a multi-creditor with an apparent phantom debt.
2. **Presentation Rounding in Manual/Exact Split Modes**:
   - In `exact` (custom amounts) mode, typed values entered by users are displayed as typed. Presentation rounding applies to proportional/automatic shares (`equal`, `percent`, `shares`, `sport` rates, and blank auto-fill boxes).
3. **Universal vs Per-Person Bill QR**:
   - `GET /api/trips/:id/pay/:toId?bill=1` remains the broadcast bill share QR (using `equalBillShare`). When shares differ, `billAmount` is 0 (the standard VietQR behavior for variable amount transfers). Individual debtor bill shares continue to be served with full per-person rounding by `GET /api/trips/:id/expenses/:eid/pay`.

---

## 6. Left to the Builder
- Utility helper placement: Standardize `roundToThousand(val: number): number` and `roundResidual(val: number): number` in `@cc/core` (`libs/shared/core/src/money.ts`) so frontend and backend share the exact same rounding formulas.
- Unit and integration tests covering:
  - `ExpenseForm` split preview rendering with `roundTransfers: true` vs `false`.
  - `ExpenseDetails` participant list rendering with rounded values.
  - `SportBillTable` and `sportShareText` formatting with rounded values.
  - `apps/api/src/og/text.ts` Open Graph snippet formatting.
  - `TripView.balances` suggestion derivation in `toTripView`.
  - `GET /api/trips/:id/pay/:toId?bill=1` returning correct `PayInfo.amount`.
