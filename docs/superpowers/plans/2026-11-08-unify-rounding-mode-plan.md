# Unify Rounding Mode (1.000 ₫) Across All Group Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure that whenever a group has rounding mode enabled (`trip.roundTransfers === true`), all group interactions—including live split previews, expense cards, expense details breakdowns, sport bill tables, canvas bill exports, share link messages, Open Graph snippets, and member balances—consistently display clean rounded thousands (1.000 ₫) while preserving underlying exact ledger accounting.

**Architecture:**
- **Core Domain Math:** Centralize `roundToThousand(val)` and `snapResidual(val)` in `@cc/core` (`money.ts`).
- **Backend API & Serialization:** In `toTripView` (`apps/api/src/trips/view.ts`), derive `TripView.balances` from active rounded suggestions (`owedToId - idOwes`, matching `myBalance.now`), extinguishing lingering residuals and ensuring zero-sum balance guarantees. In `GET /api/trips/:id/pay/:toId?bill=1`, return `PayInfo.amount` as `billAmount`. In `apps/api/src/og/text.ts`, format slot rates and share descriptions with 1.000 ₫ rounding when `roundTransfers` is true.
- **Frontend Presentation Layer:** In `ExpenseForm.tsx`, `ExpenseRow.tsx`, `ExpenseDetails.tsx`, `SportBillTable.tsx`, `qr.ts`, and `remind.ts`, apply presentation rounding to proportional/automatic shares, slot rates, and reminder copy without modifying raw stored database rows.
- **Impeccable Coaching & Design Rules:** Adhere strictly to "The Friendly Ledger" rules (`DESIGN.md`): tabular numbers (`tabular-nums font-semibold`), 44px touch targets, zero-sum consistency, and strict isolation of money colors (Leaf for credit, Lychee for debt, never theme primary).

**Tech Stack:** TypeScript, React, Hono, Drizzle ORM, Vitest, HTML5 Canvas, Tailwind CSS.

**Spec:** [`docs/superpowers/specs/2026-11-08-unify-rounding-mode-design.md`](file:///C:/Users/NvN/orca/workspaces/coin-crew/epic-phase-1-group-split-vietqr-hardening/docs/superpowers/specs/2026-11-08-unify-rounding-mode-design.md)

## Global Constraints

- Never alter stored raw amounts or shares in database tables (`transactions.amount`, `transaction_shares.amount`); zero-sum mathematical integrity must be strictly maintained.
- Groups with `roundTransfers: 0` (or `false`) must remain 100% exact and unchanged down to single đồng.
- VietQR payloads and payment amounts must always match what is shown on screen to the user.
- All monetary amounts must be displayed with `tabular-nums font-semibold` per `DESIGN.md`.
- Informational hints and explanations use stone muted (`text-muted-foreground`), never money state colors.
- Touch targets must remain $\ge 44$px for all interactive share buttons, rows, and toggles.

## Review Focus

1. **Multi-creditor aggregate balance (`TripView.balances`):** When debtors pay rounded transfers (e.g. two people pay 17.000 ₫ on two 16.667 ₫ shares to one creditor), creditor's raw ledger balance is `-667 ₫`. Deriving `balances` from suggestions ensures creditor shows 0 ₫ ("Settled"), avoiding phantom `-1.000 ₫` debt.
2. **Single-bill pay route (`GET /api/trips/:id/pay/:toId?bill=1`):** `PayInfo.amount` returns the rounded `billAmount` rather than the caller's total pairwise suggestion debt.
3. **Expense live split preview vs custom amounts in `ExpenseForm.tsx`:** Proportional/automatic splits (`equal`, `percent`, `shares`, `sport`) display rounded previews (`17.000 ₫`), while manual exact entries (`exact` mode) remain exactly as typed by the user.
4. **Remind bell vs ExpensePay alignment:** In `ExpensePaymentsApproval.tsx`, sending a reminder for an unconfirmed share sends `17.000 ₫`, perfectly matching what `ExpensePay` requests when opening the link.
5. **Sport bill Canvas PNG export vs VietQR payload:** In `renderSportBillPng` (`qr.ts`), table rows draw rounded slot rates (`67.000 ₫`) matching the VietQR amount drawn directly underneath.

---

### Task 1: Core Rounding Helpers in `@cc/core`

**Files:**
- Modify: `libs/shared/core/src/money.ts:1-32`
- Modify: `libs/shared/core/src/index.ts:1-20`
- Test: `libs/shared/core/test/money.test.ts:1-40`

**Interfaces:**
- Consumes: Nothing
- Produces:
  - `roundToThousand(val: number): number`: `Math.round(val / 1000) * 1000`
  - `snapResidual(val: number, threshold?: number): number`: `Math.abs(val) <= (threshold ?? 500) ? 0 : Math.round(val / 1000) * 1000`

- [ ] **Step 1: Write the failing tests in `libs/shared/core/test/money.test.ts`**

Add tests for `roundToThousand` and `snapResidual`:
```typescript
describe('roundToThousand and snapResidual', () => {
  it('rounds amounts to the nearest 1,000 VND', () => {
    expect(roundToThousand(16667)).toBe(17000);
    expect(roundToThousand(16499)).toBe(16000);
    expect(roundToThousand(83333)).toBe(83000);
    expect(roundToThousand(0)).toBe(0);
    expect(roundToThousand(-16667)).toBe(-17000);
  });

  it('snaps residuals <= 500 to 0', () => {
    expect(snapResidual(333)).toBe(0);
    expect(snapResidual(-333)).toBe(0);
    expect(snapResidual(500)).toBe(0);
    expect(snapResidual(-500)).toBe(0);
    expect(snapResidual(501)).toBe(1000);
    expect(snapResidual(-501)).toBe(-1000);
    expect(snapResidual(16667)).toBe(17000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run libs/shared/core/test/money.test.ts`
Expected: FAIL with `roundToThousand is not defined`.

- [ ] **Step 3: Implement `roundToThousand` and `snapResidual` in `libs/shared/core/src/money.ts` and export from `src/index.ts`**

```typescript
export function roundToThousand(val: number): number {
  return Math.round(val / 1000) * 1000;
}

export function snapResidual(val: number, threshold = 500): number {
  return Math.abs(val) <= threshold ? 0 : Math.round(val / 1000) * 1000;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run libs/shared/core/test/money.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/shared/core/src/money.ts libs/shared/core/src/index.ts libs/shared/core/test/money.test.ts
git commit -m "feat(core): add roundToThousand and snapResidual helpers (#85)"
```

---

### Task 2: Backend `TripView.balances` Suggestion-Derived Rounding & Single-Bill Bug Fix

**Files:**
- Modify: `apps/api/src/trips/view.ts:38-55, 285-298`
- Modify: `apps/api/src/bank/routes.ts:553, 585, 726`
- Test: `apps/api/test/trips.test.ts`
- Test: `apps/api/test/bank.test.ts`

**Interfaces:**
- Consumes: `roundToThousand`, `snapResidual` from `@cc/core`
- Produces:
  - `toTripView`: when `snapshot.trip.roundTransfers === true`, `balances[pid] = sum(toPid) - sum(fromPid)` using rounded `snapshot.suggestions`.
  - `buildPayInfo`: when `opts.bill` is supplied, `PayInfo.amount` returns `billAmount` instead of `suggestion?.amount ?? 0`.

- [ ] **Step 1: Write failing tests in `apps/api/test/bank.test.ts` and `apps/api/test/trips.test.ts`**

In `apps/api/test/bank.test.ts`:
```typescript
it('?bill=1 returns rounded billAmount in PayInfo.amount when roundTransfers is on', async () => {
  // Create trip with roundTransfers: 1, 50k bill split 3 ways (An, Binh, Chi; An paid).
  // Request GET /api/trips/:id/pay/:anId?bill=1&expense=:eid as Binh.
  const res = await call(`/api/trips/${tripId}/pay/${anId}?bill=1&expense=${expId}`, {
    headers: await binh(),
  });
  const info = await json<PayInfo>(res);
  expect(info.amount).toBe(17000);
});
```

In `apps/api/test/trips.test.ts`:
```typescript
it('derives TripView.balances from rounded suggestions when roundTransfers is enabled', async () => {
  // Setup group where 50k 3-way split is settled with 17k payment from Binh to An.
  // Verify TripView.balances[binhId] is 0 and TripView.balances[anId] is 17000 (from remaining suggestion from Chi), with no 333 residual.
  const res = await call(`/api/trips/${tripId}`, { headers: await an() });
  const view = await json<TripView>(res);
  expect(view.balances[binhId]).toBe(0);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -w @cc/api -- test/bank.test.ts`
Expected: FAIL with `expected 0 to be 17000` (or suggestion amount).

- [ ] **Step 3: Implement `TripView.balances` suggestion derivation in `view.ts` and fix `PayInfo.amount` in `bank/routes.ts`**

In `apps/api/src/trips/view.ts`:
```typescript
let balances = snapshot.balances;
if (snapshot.trip.roundTransfers) {
  const roundedBalances: Record<string, number> = {};
  for (const person of snapshot.people) {
    const owedToMe = snapshot.suggestions
      .filter((s) => s.toId === person.id)
      .reduce((sum, s) => sum + s.amount, 0);
    const iOwe = snapshot.suggestions
      .filter((s) => s.fromId === person.id)
      .reduce((sum, s) => sum + s.amount, 0);
    roundedBalances[person.id] = owedToMe - iOwe;
  }
  balances = roundedBalances;
}
```

In `apps/api/src/bank/routes.ts`:
```typescript
// Inside GET /trips/:id/pay/:toId
const amount = isBill ? 0 : (self && !forPayer ? 0 : (suggestion?.amount ?? 0));
// Inside buildPayInfo when bill is defined:
if (bill) {
  // set opts.amount or info.amount = billAmount
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w @cc/api -- test/bank.test.ts`
Run: `npm test -w @cc/api -- test/trips.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/trips/view.ts apps/api/src/bank/routes.ts apps/api/test/bank.test.ts apps/api/test/trips.test.ts
git commit -m "fix(api): derive TripView.balances from suggestions and return billAmount in pay route (#85)"
```

---

### Task 3: Social Previews & Chat Link Content (`og/text.ts` & `remind.ts`)

**Files:**
- Modify: `apps/api/src/og/text.ts:189-218`
- Modify: `libs/web/screens/src/lib/remind.ts:18-80`
- Modify: `libs/web/screens/src/components/ExpensePaymentsApproval.tsx:448-452`
- Test: `apps/api/test/og-text.test.ts`
- Test: `libs/web/screens/src/test/sportShare.test.ts`

**Interfaces:**
- Consumes: `roundToThousand` from `@cc/core`
- Produces:
  - `pageMeta`: formats slot rates and share descriptions with `roundToThousand` when `snapshot.trip.roundTransfers === true`.
  - `sportShareText`: rounds slot rates and participant amounts when `roundTransfers === true`.
  - `ExpensePaymentsApproval.tsx`: sends rounded share amount in reminder bell message.

- [ ] **Step 1: Write failing tests in `apps/api/test/og-text.test.ts` and `libs/web/screens/src/test/sportShare.test.ts`**

In `apps/api/test/og-text.test.ts`:
```typescript
it('rounds sport slot rates in OG description when roundTransfers is true', () => {
  const snapshot = makeSportSnapshot({ roundTransfers: true });
  const expense = makeSportExpense({ total: 400000, maleSlots: 6 }); // 66.667 ₫ per slot
  const meta = pageMeta({ kind: 'expense', snapshot, expense, now: new Date() });
  expect(meta.description).toContain('67.000₫');
  expect(meta.description).not.toContain('66.667₫');
});
```

In `libs/web/screens/src/test/sportShare.test.ts`:
```typescript
it('rounds slot rates and participant amounts when roundTransfers is true', () => {
  const text = sportShareText('vi', {
    court: 400000,
    shuttlecocksTotal: 0,
    extra: 0,
    maleSlotRate: 66667,
    femaleSlotRate: 66667,
    totalMaleSlots: 6,
    totalFemaleSlots: 0,
    participants: [{ participantId: 'p1', name: 'An', maleSlots: 1, femaleSlots: 0, amount: 66667 }],
    link: 'https://coincrew.app/j/tok',
    roundTransfers: true,
  });
  expect(text).toContain('67.000₫');
  expect(text).not.toContain('66.667₫');
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -w @cc/api -- test/og-text.test.ts`
Run: `npm test -w @cc/web-screens -- src/test/sportShare.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement rounding in `apps/api/src/og/text.ts`, `remind.ts`, and `ExpensePaymentsApproval.tsx`**

In `og/text.ts`:
```typescript
const round = snapshot.trip.roundTransfers ? roundToThousand : (v: number) => v;
const rate = round(maleSlots > 0 ? sport.maleSlotRate : sport.femaleSlotRate);
```

In `remind.ts`:
```typescript
const round = input.roundTransfers ? roundToThousand : (v: number) => v;
// apply to input.maleSlotRate, input.femaleSlotRate, p.amount
```

In `ExpensePaymentsApproval.tsx`:
```typescript
amount: formatVnd(view.trip.roundTransfers ? roundToThousand(row.amount) : row.amount)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w @cc/api -- test/og-text.test.ts`
Run: `npm test -w @cc/web-screens -- src/test/sportShare.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/og/text.ts libs/web/screens/src/lib/remind.ts libs/web/screens/src/components/ExpensePaymentsApproval.tsx apps/api/test/og-text.test.ts libs/web/screens/src/test/sportShare.test.ts
git commit -m "feat(web,api): apply presentation rounding to share link texts and OG snippets (#85)"
```

---

### Task 4: Expense Form Live Split Preview Presentation Rounding

**Files:**
- Modify: `libs/web/screens/src/screens/ExpenseForm.tsx:1230-1245, 1505-1512`
- Test: `libs/web/screens/src/test/sportExpense.test.tsx`
- Test: `libs/web/screens/src/screens/__tests__/expense-links.test.tsx`

**Interfaces:**
- Consumes: `roundToThousand` from `@cc/core`
- Produces:
  - Form split row share column displays `formatVnd(roundToThousand(shareAmount))` when `view.trip.roundTransfers` is true for proportional split modes (`equal`, `percent`, `shares`, `sport`), while submitting exact integer shares in the payload.

- [ ] **Step 1: Write failing test in `libs/web/screens/src/test/sportExpense.test.tsx`**

```typescript
it('displays rounded thousand in sport share button when roundTransfers is true', async () => {
  // Render ExpenseForm with sport group having roundTransfers: true
  // 400.000 ₫ court split 6 ways -> raw 66.667 ₫
  // Assert button text shows '67.000₫'
  expect(screen.getByTestId('sport-share-btn-p1')).toHaveTextContent('67.000₫');
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -w @cc/web-screens -- src/test/sportExpense.test.tsx`
Expected: FAIL with `expected 66.667₫ to be 67.000₫`.

- [ ] **Step 3: Implement presentation rounding in `ExpenseForm.tsx`**

In `libs/web/screens/src/screens/ExpenseForm.tsx`:
```typescript
const displayShare = (amt: number | undefined) => {
  if (amt === undefined) return '';
  const rounded = view.trip.roundTransfers && splitMode !== 'amounts' ? roundToThousand(amt) : amt;
  return formatVnd(rounded);
};
```
Apply `displayShare` to both the sport share button (`line 1239`) and standard split row (`line 1508`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w @cc/web-screens -- src/test/sportExpense.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/web/screens/src/screens/ExpenseForm.tsx libs/web/screens/src/test/sportExpense.test.tsx
git commit -m "feat(screens): apply presentation rounding to live split previews in ExpenseForm (#85)"
```

---

### Task 5: Expense Cards & Details Breakdown Presentation Rounding

**Files:**
- Modify: `libs/web/screens/src/components/ExpenseRow.tsx:90-105`
- Modify: `libs/web/screens/src/components/ExpenseDetails.tsx:325-337`
- Test: `libs/web/screens/src/components/__tests__/expense-list.test.tsx`
- Test: `libs/web/screens/src/test/expense-history-and-updates.test.tsx`

**Interfaces:**
- Consumes: `roundToThousand` from `@cc/core`
- Produces:
  - `ExpenseRow`: right-side amount displays rounded amount when `roundTransfers === true`.
  - `ExpenseDetails`: participant shares list displays `<Amount value={roundToThousand(s.amount)} />`.

- [ ] **Step 1: Write failing test in `libs/web/screens/src/components/__tests__/expense-list.test.tsx`**

```typescript
it('rounds user share in ExpenseRow when trip roundTransfers is true', () => {
  // Expense 50.000 ₫ 3 ways -> user share raw 16.667 ₫
  // Assert row amount displays 17.000 ₫
  const row = renderExpenseRow({ expense: exp50k, view: viewWithRounding });
  expect(within(row).getByText('17.000₫')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -w @cc/web-screens -- src/components/__tests__/expense-list.test.tsx`
Expected: FAIL with `expected 17.000₫ but found 16.667₫`.

- [ ] **Step 3: Implement presentation rounding in `ExpenseRow.tsx` and `ExpenseDetails.tsx`**

In `ExpenseRow.tsx`:
```typescript
const finalAmount = view.trip.roundTransfers ? roundToThousand(amount) : amount;
```

In `ExpenseDetails.tsx`:
```typescript
const shareVal = view.trip.roundTransfers ? roundToThousand(s.amount) : s.amount;
<Amount value={shareVal} className="font-semibold tabular-nums text-right" />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w @cc/web-screens -- src/components/__tests__/expense-list.test.tsx`
Run: `npm test -w @cc/web-screens -- src/test/expense-history-and-updates.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/web/screens/src/components/ExpenseRow.tsx libs/web/screens/src/components/ExpenseDetails.tsx libs/web/screens/src/components/__tests__/expense-list.test.tsx
git commit -m "feat(screens): round expense row and details breakdown when roundTransfers is true (#85)"
```

---

### Task 6: Sport Bill Table & Canvas PNG Bill Image Rounding

**Files:**
- Modify: `libs/web/screens/src/components/SportBillTable.tsx:55-102`
- Modify: `libs/web/util/src/qr.ts:160-175, 260-310`
- Test: `libs/web/screens/src/test/sportExpense.test.tsx`
- Test: `libs/web/util/src/__tests__/qr.test.ts`

**Interfaces:**
- Consumes: `roundToThousand` from `@cc/core`
- Produces:
  - `SportBillTable`: slot rates and participant amounts render rounded when `roundTransfers` is true.
  - `renderSportBillPng`: draws rounded slot rates and row amounts on Canvas so they match the VietQR payload.

- [ ] **Step 1: Write failing test in `libs/web/util/src/__tests__/qr.test.ts`**

```typescript
it('draws rounded slot rates on Canvas when roundTransfers is true', async () => {
  const canvas = renderSportBillPng({ ...sampleInput, maleSlotRate: 66667, femaleSlotRate: 66667, roundTransfers: true });
  // Verify canvas drawing calls formatVnd(67000)
  expect(mockDrawCell).toHaveBeenCalledWith('67.000₫', expect.anything(), expect.anything(), expect.anything(), expect.anything(), expect.anything(), expect.anything());
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -w @cc/web-util -- src/__tests__/qr.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement rounding in `SportBillTable.tsx` and `qr.ts`**

In `SportBillTable.tsx`:
```typescript
const round = view.trip.roundTransfers ? roundToThousand : (v: number) => v;
// apply to p.amount, calc.femaleSlotRate, calc.maleSlotRate
```

In `qr.ts`:
```typescript
const round = input.roundTransfers ? roundToThousand : (v: number) => v;
// apply to drawCell for rates and row amounts
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w @cc/web-screens -- src/test/sportExpense.test.tsx`
Run: `npm test -w @cc/web-util -- src/__tests__/qr.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/web/screens/src/components/SportBillTable.tsx libs/web/util/src/qr.ts libs/web/util/src/__tests__/qr.test.ts
git commit -m "feat(web): round sport bill table and canvas bill card export (#85)"
```

---

### Task 7: Full System Verification, Impeccable Critique & Regression Check

**Files:**
- Test across workspace: `@cc/core`, `@cc/api`, `@cc/web-screens`, `@cc/web-util`

- [ ] **Step 1: Run complete unit & integration test suites**

```bash
npx vitest run libs/shared/core/test/money.test.ts
npm test -w @cc/api -- test/settle.test.ts test/bank.test.ts test/trips.test.ts test/og-text.test.ts
npm test -w @cc/web-screens -- src/components/__tests__/round-transfers-switch.test.tsx src/test/sportExpense.test.tsx src/test/sportShare.test.ts
npm test -w @cc/web-util -- src/__tests__/qr.test.ts
```
Expected: All suites PASS.

- [ ] **Step 2: Run typecheck across the monorepo**

```bash
npm run typecheck
```
Expected: Clean exit code 0.

- [ ] **Step 3: Run Impeccable Design Critique Verification**
  - Verify every rendered amount uses `tabular-nums font-semibold`.
  - Confirm money state colors strictly adhere to Leaf (`text-success`) for incoming/owed, Lychee (`text-danger`) for debt, and Stone Muted (`text-muted-foreground`) for neutral captions.
  - Verify zero-sum ledger integrity: raw database records remain integer đồng, and no phantom balances or overpayment loops exist.

- [ ] **Step 4: Commit any polish / documentation updates**

```bash
git commit --allow-empty -m "chore(release): complete unify rounding mode across all group interactions (#85)"
```
