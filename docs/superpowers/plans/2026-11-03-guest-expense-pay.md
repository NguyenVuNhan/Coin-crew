# Pay One Expense From a Shared Link: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Someone opening a single-expense link sees only what their row owes for that expense and pays it with the shared bank button. Friends of a player can pay part of the row, and the organiser confirms everything for one expense in one grouped card.

**Architecture:** Pure rules live in `@fsl/core` (`expensePay.ts`: share, slot tiles, remaining, who-paid label, revise permission). The API adds:
- a per-device "friend of" grant table
- an expense-scoped pay view
- a report endpoint
- a revise endpoint for confirmed payments
- a grouped `expense_payments` approval

Payments stay pair-level rows in `transactions`, tagged with `meta_json {expenseId, paidBy}`. The web adds an `expenses/:expenseId/pay` route, an expense mode for `WhoAreYou`, a "Bạn trả cho ai?" sheet, and a grouped approval card. The pay screen renders the existing `PayQr` unchanged.

**Tech Stack:** TypeScript monorepo; Hono + Drizzle on Cloudflare D1 (`apps/api`); React 19 + react-router + TanStack Query + shadcn/Tailwind v4 (`packages/web-common`); Vitest everywhere.

**Spec:** `docs/superpowers/specs/2026-11-03-guest-expense-pay-design.md`

## Global Constraints

- Branch `feat/guest-expense-pay` off `origin/main`. Web UI lives in `packages/web-common/src/`.
- `PayQr` (`packages/web-common/src/components/PayQr.tsx`) is used as is: `<PayQr variant="pay" info={…} />`. Don't edit it.
- UI rules from `CLAUDE.md`:
  - Use the app wrappers `Button`, `Sheet`, `Snackbar`, `Avatar`, `Pill`, `Icon`, `Amount`, `InlineError`, `Skeleton`; never shadcn `Drawer`/`Dialog` directly.
  - Colours only from `styles/globals.css`, no raw hex.
  - `min-h-11` tap targets, amounts `tabular-nums`, fields `text-base`.
  - Tests select by `fsl-*` classes and `data-testid`.
- Every new string goes in both `i18n/vi.ts` and `i18n/en.ts`. Mark Vietnamese strings `// REVIEW`.
- Payments to an expense always run **row person → expense payer**. The transfer note stays one per pair (`payments/refs.ts`).
- `meta_json.expenseId` is the expense **root id**.
- Existing tests are not edited or deleted, except where a task names the test file and the exact change.
- Migrations are hand-written SQL in `apps/api/migrations/`, numbered after `0014_zalo_mini_app.sql`.

## Review Focus

1. **The expense is edited after someone paid, and their share drops below what they paid.** Remaining shows 0 (never negative), with "Đã trả đủ" and no QR. Test in Task 1 and Task 3.
2. **The group uses fewest transfers.** Lan owes Nhàn on this expense even though the suggestions route her debt elsewhere. The cap uses `pairwiseTransfers`, not `snapshot.suggestions`. Test in Task 3.
3. **A friend-mode device reports a payment on a different expense, for a different row, or above what's left.** 403 for the first two, 422 for the last. Test in Task 3 and Task 4.
4. **The payer has no approved bank details.** The pay screen shows `pay.bankNone`/`pay.bankPending` instead of the QR, and "Tôi đã chuyển" still works. Test in Task 6.
5. **A second report arrives after the first has already covered what's left.** `ALREADY_HANDLED` 409, nothing recorded. Test in Task 4.

---

### Task 1: Core rules for paying one expense

**Files:**
- Create: `packages/core/src/expensePay.ts`
- Modify: `packages/core/src/api-types.ts` (types below), `packages/core/src/index.ts` (export)
- Test: `packages/core/test/expensePay.test.ts`

**Interfaces:**
- Produces (types in `api-types.ts`):
  ```ts
  export type PaidBy = 'self' | 'friend';
  export interface PaymentMeta { expenseId: string; paidBy: PaidBy }
  // PaymentView gains:  expenseId?: string; paidBy?: PaidBy; confirmedById?: string | null
  export interface SlotTile { gender: 'F' | 'M'; amount: number }
  export interface ExpensePayView {
    expense: { id: string; description: string; spentOn: string; amount: number };
    payer: { id: string; name: string };
    row: { participantId: string; name: string; isMember: boolean; slots: number; share: number; remaining: number; tiles: SlotTile[] };
    viewer: PaidBy;
    paid: { paymentId: string; amount: number; status: PaymentStatus; paidBy: PaidBy; notArrived: boolean }[];
    pay: PayInfo | null;
  }
  // Approval union gains: | { kind: 'expense_payments'; expenseId: string; paymentIds: string[] }
  // PickerView.people[] gains: slots?: number
  // PickerView gains: expense?: { id: string; payerId: string } | null
  ```
- Produces (functions in `expensePay.ts`):
  - `expenseShareOf(e: ExpenseView, participantId: string): number`: that person's `shares[].amount`, or 0.
  - `rowSlots(e: ExpenseView, participantId: string): number`: `maleSlots + femaleSlots` of the sport entry; 1 for non-sport expenses, or when the entry has a `fixedAmount`; 0 when the person isn't in the split.
  - `slotTiles(e: ExpenseView, participantId: string, gender: Gender | null | undefined, remaining: number): SlotTile[]`
  - `linkedPaid(payments: PaymentView[], expenseRootId: string, fromId: string): number`
  - `expenseRemaining(share: number, paid: number, pairOwed: number): number` = `Math.max(0, Math.min(share - paid, pairOwed))`
  - `payerLabel(a: { paidBy: PaidBy; fromIsMember: boolean; slots: number }): 'name' | 'friend' | 'name_or_friend'`
  - `canRevisePayment(actor: Actor, p: { toId: string; status: PaymentStatus; confirmedById: string | null }, receiverIsMember: boolean): boolean` (in `permissions.ts`, re-exported)

- [ ] **Step 1: Write failing tests** in `packages/core/test/expensePay.test.ts`. Build a sport expense with the fixture helpers in `test/fixtures.ts`:
  - Lan (`F`): `femaleSlots: 1, maleSlots: 1`, share 85000
  - Minh: 1 male slot, 45000
  - `femaleSlotRate: 40000`, `maleSlotRate: 45000`

  ```ts
  it('rowSlots counts both genders, 1 for plain and fixed rows, 0 when absent', () => {
    expect(rowSlots(sport, 'lan')).toBe(2); expect(rowSlots(sport, 'minh')).toBe(1);
    expect(rowSlots(plain, 'lan')).toBe(1); expect(rowSlots(sport, 'nobody')).toBe(0);
    expect(rowSlots(withFixed, 'lan')).toBe(1);
  });
  it('slotTiles drops the person\'s own slot and caps at remaining', () => {
    expect(slotTiles(sport, 'lan', 'F', 85000)).toEqual([{ gender: 'M', amount: 45000 }]);
    expect(slotTiles(sport, 'lan', 'M', 85000)).toEqual([{ gender: 'F', amount: 40000 }]);
    expect(slotTiles(sport, 'lan', null, 30000)).toEqual([{ gender: 'M', amount: 30000 }]); // unknown gender: female slot is "own"
    expect(slotTiles(sport, 'minh', 'M', 45000)).toEqual([]);
    expect(slotTiles(withFixed, 'lan', 'F', 85000)).toEqual([]);
  });
  it('linkedPaid sums says_paid and confirmed for this expense and payer, skipping rejected, not-arrived and other expenses', () => {
    // says_paid 45000 (expenseId root1), confirmed amountConfirmed 30000 (root1), rejected 10000 (root1),
    // confirmed notArrived 5000 (root1), confirmed 99000 (root2), confirmed 7000 (root1 but fromId minh)
    expect(linkedPaid(payments, 'root1', 'lan')).toBe(75000);
  });
  it('expenseRemaining never goes negative and never exceeds the pair debt', () => {
    expect(expenseRemaining(85000, 45000, 200000)).toBe(40000);
    expect(expenseRemaining(40000, 45000, 200000)).toBe(0);
    expect(expenseRemaining(85000, 0, 20000)).toBe(20000);
  });
  it('payerLabel', () => {
    expect(payerLabel({ paidBy: 'friend', fromIsMember: true, slots: 2 })).toBe('friend');
    expect(payerLabel({ paidBy: 'self', fromIsMember: false, slots: 2 })).toBe('name_or_friend');
    expect(payerLabel({ paidBy: 'self', fromIsMember: false, slots: 1 })).toBe('name');
    expect(payerLabel({ paidBy: 'self', fromIsMember: true, slots: 2 })).toBe('name');
  });
  ```
  Add to `packages/core/test/permissions.test.ts` (new `describe`, existing cases untouched):
  ```ts
  it('canRevisePayment: only the member receiver who confirmed it', () => {
    const nhan = { kind: 'member', participantId: 'nhan', participantPending: false, isOrganiser: false } as const;
    expect(canRevisePayment(nhan, { toId: 'nhan', status: 'confirmed', confirmedById: 'nhan' }, true)).toBe(true);
    expect(canRevisePayment(nhan, { toId: 'nhan', status: 'confirmed', confirmedById: 'lan' }, true)).toBe(false);
    expect(canRevisePayment(nhan, { toId: 'nhan', status: 'says_paid', confirmedById: null }, true)).toBe(false);
    expect(canRevisePayment({ ...nhan, kind: 'guest' }, { toId: 'nhan', status: 'confirmed', confirmedById: 'nhan' }, false)).toBe(false);
  });
  ```
- [ ] **Step 2:** `npx vitest run test/expensePay.test.ts test/permissions.test.ts` in `packages/core`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** the types and functions above.
  - `slotTiles` algorithm: take the entry's `femaleSlots`/`maleSlots` and remove one slot of `gender`, or the female slot first when `gender` is unknown or that count is 0. Emit one tile per gender that still has slots left, in order F then M. The amount is `Math.min(rate, remaining)`, and tiles with an amount of 0 are dropped.
  - `linkedPaid` counts a payment when `expenseId === root`, `fromId` matches, `status` is `says_paid` or `confirmed`, and `!notArrived`. It counts `amountConfirmed ?? amountClaimed`.
- [ ] **Step 4:** Same command. Expected: PASS. Then `npm run typecheck` in `packages/core`, which must be clean.
- [ ] **Step 5: Commit** `feat(core): rules for paying one expense from a link`

### Task 2: Friend grant table and expense-scoped picker

**Files:**
- Create: `apps/api/migrations/0015_device_expense_grants.sql`
- Modify: `apps/api/src/db/schema.ts`, `apps/api/src/participants/routes.ts` (picker at `:222`, plus the new route)
- Create: `apps/api/src/expenses/friendGrant.ts`
- Test: `apps/api/test/expense-pay-picker.test.ts`

**Interfaces:**
- Consumes: `rowSlots` (Task 1).
- Produces:
  - Table `device_expense_grants(device_hash text, trip_id text, expense_root_id text, participant_id text, created_at text, PRIMARY KEY(device_hash, expense_root_id))`. Drizzle export: `deviceExpenseGrants`.
  - `getFriendGrant(db: Db, deviceHash: string, tripId: string, expenseRootId: string): Promise<string | null>` returns the granted participant id. Lives in `friendGrant.ts`.
  - `GET /trips/:id/people/picker?expense=<id>`: the `people` list is filtered to the people with a share in that (latest, approved or pending, not fund-paid) expense, minus its payer. Each row gets `slots`. `view.expense = { id: rootId, payerId }`. An unknown expense id returns 404.
  - `POST /trips/:id/expenses/:eid/friend` with body `{ participantId }` returns 204. It requires `actor.kind === 'guest'` (the group token). The target must be in the split, not the payer, a **member** (`userId !== null`), and `rowSlots >= 2`; anything else is 403. It upserts the grant. It never writes `deviceParticipants`.

- [ ] **Step 1: Write failing tests.** Use `seedTrip`, `newDevice`, `guestHeaders` and `linkMember` from `test/helpers.ts`, and seed a sport expense where Lan has 2 slots and is linked as a member.
  - `picker?expense= lists only split people without the payer, with slots`
  - `picker without expense is unchanged` (same `people.length` as today's seed)
  - `friend grant: member row with 2 slots → 204 and no deviceParticipants row`
  - `friend grant: 403 for a guest row, a 1-slot member row, the payer, someone outside the split, and a view-token actor`
  - `pick still 403s for the member row` (anti-goal: no claim)
- [ ] **Step 2:** `npx vitest run test/expense-pay-picker.test.ts` in `apps/api`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Write the SQL `CREATE TABLE` plus `CREATE INDEX device_expense_grants_trip_idx ON (trip_id)`, and the matching `sqliteTable` in `schema.ts`.
  - Load the expense through `getSnapshot(db, actor.trip)` and match it by `id` or `rootId`, the same as `bank/routes.ts:625`.
  - Register the friend route in `participants/routes.ts`, next to `/people/pick`.
- [ ] **Step 4:** Run the test (PASS), then `npm test` in `apps/api`. Every existing test still passes.
- [ ] **Step 5: Commit** `feat(api): expense-scoped picker and friend-of grant`

### Task 3: Expense pay view

**Files:**
- Create: `apps/api/src/expenses/payView.ts` (route + builder)
- Modify: `apps/api/src/app.ts` (mount), `apps/api/src/trips/snapshot.ts:302-312` (PaymentView gains `expenseId`, `paidBy`, `confirmedById` from `metaJson` / `confirmedByParticipantId`)
- Modify: `apps/api/src/bank/routes.ts`: extract the body of `GET /trips/:id/pay/:toId` that builds `bankState`, `bank` and `payload` into `buildPayInfo(db, trip, { payerId, toId, amount, snapshot }): Promise<PayInfo>`, and keep the route's behaviour identical
- Test: `apps/api/test/expense-pay-view.test.ts`

**Interfaces:**
- Consumes: Task 1 functions, `getFriendGrant` (Task 2), `pairwiseTransfers` + `toLedger` (core / snapshot).
- Produces: `GET /trips/:id/expenses/:eid/pay`, which returns `ExpensePayView`, or `{ row: null }` with status 200 when the viewer has no row to pay.
  - **Who the row is:** `actor.participantId` if that person is in the split and isn't the payer (`viewer: 'self'`). Otherwise the device's friend grant for this expense (`viewer: 'friend'`). Otherwise `{ row: null }`.
  - **What's owed:** `pairOwed` = the `pairwiseTransfers(...)` amount for row → payer, computed from the snapshot ledger, whatever `fewestTransfers` is set to. `remaining = expenseRemaining(share, linkedPaid(...), pairOwed)`.
  - **`pay`:** `buildPayInfo(...)` with `amount: remaining`, or `null` when `remaining === 0`.
  - **`paid`:** the linked payments for this row, newest first.

- [ ] **Step 1: Write failing tests:**
  - `self guest sees share, remaining and a VietQR payload carrying the remaining amount`: decode the payload with the core `vietqr` parser, or assert it contains `540${len}${amount}`, whichever `packages/core/test/vietqr.test.ts` already uses.
  - `remaining drops after a linked says_paid payment; pay is null at 0`
  - `share edited below what was paid → remaining 0` (Review Focus 1)
  - `fewestTransfers on: remaining still equals the share` (Review Focus 2)
  - `friend grant device gets viewer friend; another expense id returns row null` (Review Focus 3)
  - `payer viewing returns row null`
  - `GET /pay/:toId responses are unchanged` (run the existing `bank.test.ts`)
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3: Implement** as above.
- [ ] **Step 4:** Run the new test file and `npm test` in `apps/api`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): pay view for one expense`

### Task 4: Report a payment for an expense

**Files:**
- Modify: `apps/api/src/expenses/payView.ts` (add the route)
- Test: `apps/api/test/expense-pay-report.test.ts`

**Interfaces:**
- Produces: `POST /trips/:id/expenses/:eid/pay-report` with body `{ amount: number; paidBy: PaidBy }`, returning `201 { paymentId, status }`.
  - **Row resolution:** same as Task 3; no row gives 403. `viewer: 'friend'` forces `paidBy: 'friend'`. A `self` viewer may send either value.
  - **Validation:** 422 when the amount is invalid or `> remaining`. 409 `ALREADY_HANDLED` when `remaining === 0`.
  - **Status:** for `self`, `statusForNewPayment({ actorId: rowId, fromId: rowId, toId: payerId, … })`. For `friend`, `'says_paid'` when the receiver is an active member, otherwise `'confirmed'`.
  - **What's written:** a payment row the same way `POST /payments` does (`payments/routes.ts:157-200`), with `metaJson: JSON.stringify({ expenseId: root, paidBy })`, `createdByParticipantId: rowId` and `createdByDevice: actor.deviceHash`, plus the activity `payment_recorded` with `details.expenseId`. Factor the insert into `insertPayment(db, args)` in `payments/routes.ts` and call it from both places.

- [ ] **Step 1: Write failing tests:**
  - `guest self report → says_paid with meta`
  - `member self report → confirmed`
  - `friend report → says_paid, paidBy friend, payer from row`
  - `friend cannot send paidBy self` (stored as `friend`)
  - `amount over remaining → 422`
  - `second report after the first covered everything → 409, one row only` (Review Focus 5)
  - `friend grant for expense A cannot report on expense B → 403`
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** New tests plus `npm test` in `apps/api`: PASS.
- [ ] **Step 5: Commit** `feat(api): report a payment against one expense`

### Task 5: Grouped approval and revising a confirmed payment

**Files:**
- Modify: `apps/api/src/trips/view.ts:83-88` (approvals), `apps/api/src/payments/routes.ts` (new route)
- Test: `apps/api/test/expense-payments-approval.test.ts`

**Interfaces:**
- Consumes: `canRevisePayment` (Task 1), `PaymentView.expenseId` (Task 3).
- Produces:
  - **Approvals:** `says_paid` payments to the actor that carry an `expenseId` are grouped by it. Two or more for the same expense become one `{ kind: 'expense_payments', expenseId, paymentIds }`, placed where the first of them would have been. A single one stays `{ kind: 'payment' }`. Payments without an `expenseId` don't change.
  - `POST /trips/:id/payments/:pid/revise` with body `{ action: 'undo' } | { action: 'amount'; amount: number } | { action: 'not_arrived' }`, returning 204. It is guarded by `canRevisePayment`, and 403 otherwise.
    - `undo` → `status 'says_paid'`, `amountConfirmed null`, `confirmedByParticipantId null`.
    - `amount` → `amountConfirmed` and the share amount set to `amount`.
    - `not_arrived` → `status 'rejected'`.
    - Each one updates in place with an `isLatest = 1 AND status = 'confirmed'` guard (409 when 0 rows change), like `/confirm`. It logs activity `payment_revised` with `{ action, amount? }`.
  - The existing `/confirm` with `{ amount }` stays the way to confirm a different amount.

- [ ] **Step 1: Write failing tests:**
  - `two linked reports → one expense_payments approval with both ids`
  - `one linked report → plain payment approval`
  - `unlinked reports unchanged`
  - `revise undo puts it back in the grouped approval`
  - `revise amount changes balances`
  - `revise not_arrived rejects and remaining goes back up`: assert through the Task 3 view
  - `revise by someone other than the confirming receiver → 403`
  - `revise on says_paid → 403`
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** New tests plus the full `npm test` in `apps/api`: PASS.
- [ ] **Step 5: Commit** `feat(api): group expense payment approvals, revise confirmed payments`

### Task 6: Web pay screen for one expense

**Files:**
- Create: `packages/web-common/src/api/expensePay.ts`, `packages/web-common/src/screens/ExpensePay.tsx`
- Modify: `packages/web-common/src/App.tsx` (route `expenses/:expenseId/pay` in `tripPages`, before `expenses/:expenseId`), `packages/web-common/src/screens/Join.tsx` (`OldExpenseLink` navigates to `/j/${token}/expenses/${id}/pay`), `i18n/vi.ts`, `i18n/en.ts`
- Test: `packages/web-common/src/screens/__tests__/expense-pay.test.tsx`

**Interfaces:**
- Consumes: `ExpensePayView` (Task 1), `GET …/expenses/:eid/pay` (Task 3).
- Produces:
  - `useExpensePay(tripId: string, expenseId: string, version: number)`, query key `['expense-pay', tripId, expenseId, version]`.
  - `useReportExpensePayment(tripId, expenseId)`, a mutation with `{ amount, paidBy }` that invalidates `['expense-pay', tripId, expenseId]` and `['trip', tripId]`.
  - `<ExpensePay />` with these states:
    - **Not picked yet:** a guest with `participantId === null` and no row is sent to `href('/who') + '?expense=<id>&next=<this path>'`.
    - **No row** (the payer, or someone outside the split): `<Navigate to={href('/expenses/'+id)} replace />`.
    - **Something left to pay:** title `expensePay.title` ("Trả cho {name}"), a subtitle with the description · day, and `rowLabel` ("Phần của {name}"). Then `<Amount value={remaining} size="lg" />`, `<PayQr variant="pay" info={pay} />` (or the `pay.bankNone`/`pay.bankPending` line when `pay.bankState !== 'ok'`), a primary `Button` `pay.iPaid`, and the paid lines.
    - **Nothing left:** `expensePay.allPaid` ("Đã trả đủ ✓") with the paid lines, and no QR or button.
    - **Paid lines** (`fsl-expense-pay__paid`): `circleCheck` + "{who} đã trả {amount}". `who` comes from `payerLabel`: `name` → name, `friend` → `expensePay.friendOf` ("Bạn của {name}"), `name_or_friend` → `expensePay.nameOrFriend` ("{name} (hoặc bạn của {name})"). A `notArrived`/`rejected` line uses `danger` text: `expensePay.notReceived` ("{payer} chưa nhận được {amount}").
    - **Back** (`Screen` back) goes to `href('/')`.
    - Pressing "Tôi đã chuyển" calls `onPaid()`. For now it reports `{ amount: remaining, paidBy: viewer }`; Task 8 replaces this with the sheet when `row.slots >= 2`.
- New keys: `expensePay.title`, `expensePay.rowLabel`, `expensePay.allPaid`, `expensePay.friendOf`, `expensePay.nameOrFriend`, `expensePay.paidLine`, `expensePay.notReceived`.

- [ ] **Step 1: Write failing tests** (follow `screens/__tests__/pay.test.tsx` for `api()` mocks, `renderAt` and `mockMedia`):
  - `shows only remaining, PayQr and I've paid`
  - `coarse pointer shows Open bank app from PayQr`
  - `remaining 0 shows all paid, no QR`
  - `friend line reads "Lan's friend paid 45,000 ₫"`
  - `bank none shows the bankNone line and I've paid still works` (Review Focus 4)
  - `row null redirects to the expense page`
  - `unpicked guest redirects to who with expense param`
  - `old /e/ link lands on /pay`
- [ ] **Step 2:** `npx vitest run src/screens/__tests__/expense-pay.test.tsx` in `packages/web-common`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run, then the full `npm test` and `npm run typecheck` in `packages/web-common`: PASS. `src/test/style-guard.test.ts` must pass.
- [ ] **Step 5: Commit** `feat(web): pay screen for one expense`

### Task 7: Picker in expense mode

**Files:**
- Modify: `packages/web-common/src/screens/WhoAreYou.tsx`, `i18n/*`
- Test: `packages/web-common/src/screens/__tests__/who-expense.test.tsx`

**Interfaces:**
- Consumes: the `?expense=` picker and `POST …/friend` (Task 2).
- Produces: when `searchParams.get('expense')` is set:
  - The picker fetches `/people/picker?expense=<id>`.
  - Rows with `slots >= 2` read `who.nameOrFriend` ("{name} hoặc bạn của {name}"), with `userPlus` on the "bạn của" part, plus a sub-line `who.slots` ("{n} suất").
  - A guest row picks exactly as today (`handlePickPerson`).
  - A member row with `slots >= 2`, when the viewer isn't that member, calls `POST /api/trips/:tripId/expenses/:eid/friend` and then navigates to `next`. The cached `['trip', tripId]` is not cleared (they stay unpicked).
  - A member row with 1 slot keeps today's sign-in behaviour.
  - Join / "add me" is hidden in expense mode.
- Keys: `who.nameOrFriend`, `who.slots`.

- [ ] **Step 1: Write failing tests:**
  - `expense mode lists only API rows with the "or friend of" label`
  - `guest row → people/pick then next`
  - `member 2-slot row → friend endpoint, not people/pick`
  - `member 1-slot row → sign-in prompt as today`
  - `no expense param → unchanged`: the existing `who-join*.test.tsx` files pass untouched
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Full `npm test` in `packages/web-common`: PASS.
- [ ] **Step 5: Commit** `feat(web): expense-scoped picker with friend-of rows`

### Task 8: "Bạn trả cho ai?" sheet

**Files:**
- Create: `packages/web-common/src/components/WhoPaidSheet.tsx`
- Modify: `packages/web-common/src/screens/ExpensePay.tsx`, `i18n/*`
- Test: `packages/web-common/src/components/__tests__/who-paid-sheet.test.tsx`

**Interfaces:**
- Consumes: `ExpensePayView.row` (`tiles`, `remaining`, `name`), `viewer`, and `useReportExpensePayment` (Task 6).
- Produces: `<WhoPaidSheet open onClose row={row} viewer={viewer} onReport={(r: { amount: number; paidBy: PaidBy }) => Promise<void>} />`, built on the app `Sheet`. Its options, all with `min-h-11`:
  - `whoPaid.wholeRow` ("Cả phần của {name} · {amount}") → `{ amount: remaining, paidBy: viewer }`
  - one tile per `row.tiles` with the `venus`/`mars` icon and `whoPaid.mySlot` ("Chỉ phần của tôi · {amount}") → `{ amount: tile.amount, paidBy: 'friend' }`
  - `whoPaid.other` ("Số khác") opens a number field (`text-base`, `inputMode="numeric"`) with a confirm button whose label shows the typed amount. The amount must be 1..remaining, otherwise an inline error. → `{ amount, paidBy: viewer }`

  `ExpensePay` opens the sheet when `row.slots >= 2`. Otherwise it reports straight away, as in Task 6.
- Keys: `whoPaid.title` ("Bạn trả cho ai?"), `whoPaid.wholeRow`, `whoPaid.mySlot`, `whoPaid.other`, `whoPaid.otherConfirm`, `whoPaid.tooMuch`.

- [ ] **Step 1: Write failing tests:**
  - `whole row reports remaining with viewer`
  - `slot tile reports tile amount as friend`
  - `other amount over remaining shows tooMuch and does not report`
  - `ExpensePay with slots 1 reports directly without the sheet`
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Full `npm test` in `packages/web-common`: PASS.
- [ ] **Step 5: Commit** `feat(web): ask who paid when a row has friends`

### Task 9: Grouped approval card with undo and edit

**Files:**
- Create: `packages/web-common/src/components/ExpensePaymentsApproval.tsx`
- Modify: `packages/web-common/src/components/ApprovalsCard.tsx` (`approvalKey` gives `ep-${expenseId}`; `ApprovalItem` gets a case for `expense_payments`; the single `PaymentApproval` shows the `payerLabel` text and the expense name when the payment has an `expenseId`), `i18n/*`
- Test: `packages/web-common/src/components/__tests__/expense-payments-approval.test.tsx`

**Interfaces:**
- Consumes: `Approval` `expense_payments`, `PaymentView.expenseId/paidBy/confirmedById`, `payerLabel`, `canRevisePayment` (Task 1), `/confirm`, `/not-arrived` and `/revise` (Task 5).
- Produces: `<ExpensePaymentsApproval view expenseId paymentIds />`, laid out as in `.superpowers/brainstorm/*/content/owner-notification-v2.html` option B.
  - **Header:** a 🏸 `Icon` for sport (`receipt` otherwise), the description · day, and `epa.reported` ("{n} người báo đã trả").
  - **Progress bar:** the share of the expense covered by confirmed linked payments, with `epa.progress` ("{got} / {total} đã về") and `epa.notReported` ("còn {n} người chưa trả").
  - **One row per split person except the payer** (`fsl-epa__row`): `Avatar` with a `userPlus` badge when `paidBy === 'friend'`, the label from `payerLabel`, the transfer note when it's known (`PayInfo` isn't loaded here, so leave the note out for now), the amount, and a round 44px tick `Button`:
    - **Waiting:** the tick is an outline; tapping it calls `/confirm`.
    - **Confirmed:** the tick is a filled `success`; tapping it opens the detail.
    - **Not reported:** the row is muted, with a `bell`/remind icon that links to `href('/pay/'+row)` (the existing remind flow).
  - **Tapping a row body** opens the detail `Sheet` (card A):
    - "✓ Đã nhận {amount}" (`/confirm`)
    - "✎ Số khác": `/confirm` with `{amount}` while waiting, `/revise` `amount` once confirmed
    - "✕ Chưa nhận": `/not-arrived` while waiting, `/revise` `not_arrived` once confirmed

    For a row with `slots >= 2`, the "Số khác" panel shows the slot tiles from `slotTiles`.
  - **Footer:** `epa.confirmAll` ("Đã nhận tất cả · {sum}") confirms every waiting row one after another.
  - **Undo:** after any confirm, a `Snackbar` shows `epa.confirmed` with the action `epa.undo` ("Hoàn tác"), which calls `/revise` `undo`. It stays for 6 s (the builder's call in the spec: 6 s).
- Add a `bell` icon to `components/icons.tsx` from lucide (`Bell`) if it isn't there.

- [ ] **Step 1: Write failing tests:**
  - `renders one row per split person with waiting/confirmed/not reported states`
  - `tick confirms; snackbar undo calls revise undo`
  - `confirm all confirms each waiting payment`
  - `confirmed tick opens detail; Số khác on confirmed calls revise amount`
  - `friend payment shows "Lan's friend" with badge`
  - `approvalKey for expense_payments is ep-<id>`
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Full `npm test` and `npm run typecheck` in `packages/web-common`: PASS.
- [ ] **Step 5: Commit** `feat(web): grouped expense payment approvals with undo`

### Task 10: Whole-branch verification

- [ ] **Step 1:** Run `npm run typecheck && npm test` at the repo root. All workspaces pass. Record the counts.
- [ ] **Step 2:** Use the `run` skill on a phone-width browser. Walk through the spec flow:
  1. The organiser shares the link.
  2. A second device opens it and picks "Lan hoặc bạn của Lan" (Lan as a member).
  3. The pay screen shows 85.000 ₫, the bank button and "Tôi đã chuyển".
  4. The sheet: "Chỉ phần của tôi" for 45.000 ₫.
  5. The organiser sees the grouped card, ticks the row, then undoes it.
  6. After confirming, Lan's own pay screen shows 40.000 ₫ and the "Bạn của Lan đã trả 45.000 ₫" line.

  Take screenshots of each step.
- [ ] **Step 3:** Finish the branch the default way for this repo: push, open a PR, then `npm run tunnel`.
