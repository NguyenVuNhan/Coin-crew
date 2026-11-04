# Round Settlements to 1,000 ₫ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow groups to enable a setting that rounds settlement transfer suggestions, user balances, and bill QR codes to the nearest 1.000 ₫, while maintaining exact đồng amounts in the underlying database ledger.

**Architecture:** Add a `round_transfers` integer column (default 0) to the SQLite `trips` table, exposed as `roundTransfers: boolean` on `TripView['trip']` and modifiable via `PATCH /api/trips/:id`. When enabled, snapshot generation rounds transfer suggestions to the nearest 1.000 ₫ (extinguishing residuals `<= 500 ₫` to 0 ₫) and snaps residual user balances (`|val| <= 500 ₫`) to 0 ₫. The bill VietQR and interactive Expense Pay flows similarly round share amounts and accept payments up to the rounded amount, toggled via a new switch in Group Settings.

**Tech Stack:** TypeScript, SQLite / Drizzle ORM, Hono, React 19, Tailwind CSS v4, shadcn/ui, Vitest.

**Spec:** [docs/superpowers/specs/2026-11-03-round-settlements-design.md](file:///C:/repo/experience/coin-crew/docs/superpowers/specs/2026-11-03-round-settlements-design.md)

## Global Constraints

- **Exact storage**: The database must store exact figures down to the single đồng for all expenses, shares, payments, and balances. Rounding is strictly presentation and transfer suggestion logic in backend/frontend.
- **Default value**: Disabled (`false` / `0`) for newly created and existing groups.
- **UI & design system**: Follow `CLAUDE.md` (shadcn + app wrappers, theme tokens from `globals.css`, touch targets ≥44px, tabular numbers for money).
- **i18n**: Strings in `packages/web-common/src/i18n/vi.ts` and `en.ts` with `// REVIEW` comment on new Vietnamese keys.
- **Residual threshold**: Debts and residuals `<= 500 ₫` extinguish to 0 ₫ to prevent infinite 1.000 ₫ overpayment ping-pong loops.

## Review Focus

1. Equal split 50.000 ₫ for 3 people with `roundTransfers: true`: transfer suggestion is 17.000 ₫ (pinned to Task 2).
2. Equal split 500.000 ₫ for 6 people with `roundTransfers: true`: transfer suggestion is 83.000 ₫ (pinned to Task 2).
3. Residual balance after paying 83.000 ₫ on an 83.333 ₫ debt is 333 ₫: `myBalance` snaps to 0 ₫ and no lingering transfer is generated (pinned to Task 2).
4. Residual overpayment of 500 ₫ (e.g. 15.000 ₫ split 2 ways paid as 8.000 ₫): creditor does not receive a suggested reverse transfer of 1.000 ₫ (pinned to Task 2).
5. Single-bill QR and `/expenses/:id/pay`: VietQR amount is 17.000 ₫ and `pay-report` accepts 17.000 ₫ for a 16.667 ₫ share (pinned to Task 3).

---

### Task 1: Trip Schema, Core Types, and Trips PATCH Route

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Modify: `packages/core/src/api-types.ts`
- Modify: `apps/api/src/trips/routes.ts`
- Test: `apps/api/test/trips.test.ts`

**Interfaces:**
- Consumes: `trips` table in `schema.ts`, `TripView` in `api-types.ts`.
- Produces: `roundTransfers: integer` column in `trips`, `roundTransfers?: boolean` on `TripView['trip']`, handling in `PATCH /api/trips/:id`.

- [ ] **Step 1: Write the failing test**

In `apps/api/test/trips.test.ts`, add tests verifying `roundTransfers` defaults to `false` on trip creation and can be updated to `true` via `PATCH /api/trips/:id`:

```typescript
it('creates new groups with roundTransfers: false by default', async () => {
  const { call, headers } = await authedUser('organiser');
  const res = await call('/api/trips', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Hà Giang' }),
  });
  const v = await res.json<TripView>();
  expect(v.trip.roundTransfers).toBe(false);
});

it('updates roundTransfers via PATCH /api/trips/:id', async () => {
  const { call, headers, tripId } = await authedGroup('member');
  const patch = await call(`/api/trips/${tripId}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ roundTransfers: true }),
  });
  expect(patch.status).toBe(200);
  const v = await patch.json<TripView>();
  expect(v.trip.roundTransfers).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/api test test/trips.test.ts -t "roundTransfers"`
Expected: FAIL (property `roundTransfers` does not exist on `TripView.trip` or schema).

- [ ] **Step 3: Implement schema, api-types, and trip routes**

1. In `apps/api/src/db/schema.ts`:
   Add `roundTransfers: integer('round_transfers').notNull().default(0)` to `trips` table.
2. In `packages/core/src/api-types.ts`:
   Add `roundTransfers?: boolean` to `TripView['trip']`.
3. In `apps/api/src/trips/routes.ts`:
   - In `POST /api/trips`, insert `roundTransfers: 0`.
   - In `PATCH /api/trips/:id`, parse `roundTransfers?: unknown` from body, validate it is boolean if present, and update `patchSet.roundTransfers = body.roundTransfers ? 1 : 0`.
   - In `apps/api/src/me/ledger.ts`: pass `roundTransfers: 0` for direct ledgers.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix apps/api test test/trips.test.ts -t "roundTransfers"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/db/schema.ts packages/core/src/api-types.ts apps/api/src/trips/routes.ts apps/api/src/me/ledger.ts apps/api/test/trips.test.ts
git commit -m "feat(api): add roundTransfers to trips schema and patch route"
```

---

### Task 2: Snapshot Transfer Rounding, Residual Extinguishment, and `myBalance` Snapping

**Files:**
- Modify: `apps/api/src/trips/snapshot.ts`
- Modify: `apps/api/src/trips/view.ts`
- Test: `apps/api/test/settle.test.ts`

**Interfaces:**
- Consumes: `trip.roundTransfers` from `trips` table.
- Produces: Rounded `suggestions` (`amount > 500` rounded to 1.000 ₫, `<= 500` omitted) and snapped `myBalance` in `TripView` and `TripListItem`.

- [ ] **Step 1: Write the failing tests**

In `apps/api/test/settle.test.ts`, add tests for `roundTransfers`:

```typescript
it('rounds 50.000 ₫ split 3 ways to 17.000 ₫ transfer suggestions when roundTransfers is on', async () => {
  // Setup 3 participants, expense of 50.000 ₫ paid by A, trip.roundTransfers: true
  // Verify suggestions contains { fromId: B, toId: A, amount: 17000 } and { fromId: C, toId: A, amount: 17000 }
});

it('rounds 500.000 ₫ split 6 ways to 83.000 ₫ transfer suggestions when roundTransfers is on', async () => {
  // Setup 6 participants, expense of 500.000 ₫ paid by A, trip.roundTransfers: true
  // Verify each other participant owes 83.000 ₫
});

it('extinguishes residual debts <= 500 ₫ and snaps myBalance to 0 when roundTransfers is on', async () => {
  // After paying 83.000 ₫ on an 83.333 ₫ debt, remaining debt is 333 ₫
  // Verify suggestions is empty and view.myBalance.now is 0
});

it('does not ping-pong a 500 ₫ overpayment into a 1.000 ₫ return transfer', async () => {
  // A pays 8.000 ₫ on a 7.500 ₫ share (overpayment of 500 ₫)
  // Verify suggestions does not suggest creditor pay 1.000 ₫ back to debtor
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/api test test/settle.test.ts -t "roundTransfers"`
Expected: FAIL

- [ ] **Step 3: Implement rounding and extinguishment in snapshot and view**

1. In `apps/api/src/trips/snapshot.ts`:
   - Map `trip.roundTransfers === 1` to `roundTransfers: true` on `TripView['trip']`.
   - In `partialSnapshot`, apply rounding to `suggestions` if `trip.roundTransfers === 1`:
     ```typescript
     const rawSuggestions = trip.fewestTransfers === 1
       ? suggestTransfers(...)
       : pairwiseTransfers(...);

     const suggestions = trip.roundTransfers === 1
       ? rawSuggestions
           .map((s) => ({
             ...s,
             amount: s.amount <= 500 ? 0 : Math.round(s.amount / 1000) * 1000,
           }))
           .filter((s) => s.amount > 0)
       : rawSuggestions;
     ```
   - In `myBalanceOf` / `TripView.myBalance`:
     If `trip.roundTransfers === 1`:
     - `now = Math.abs(rawNow) <= 500 ? 0 : Math.round(rawNow / 1000) * 1000`
     - `beforePayments = Math.abs(rawBefore) <= 500 ? 0 : Math.round(rawBefore / 1000) * 1000`
2. In `apps/api/src/trips/view.ts`:
   - For `GET /api/trips` (`TripListItem`): snap `myBalance` to 0 if `item.roundTransfers && Math.abs(rawBalance) <= 500`, else round to nearest 1.000 ₫ if `item.roundTransfers`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix apps/api test test/settle.test.ts -t "roundTransfers"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/trips/snapshot.ts apps/api/src/trips/view.ts apps/api/test/settle.test.ts
git commit -m "feat(api): implement settlement transfer and balance rounding with residual extinguishment"
```

---

### Task 3: Single-Bill QR and Interactive Expense Pay Rounding

**Files:**
- Modify: `apps/api/src/bank/routes.ts`
- Modify: `apps/api/src/expenses/payView.ts`
- Test: `apps/api/test/bank.test.ts`
- Test: `apps/api/test/expense-pay-view.test.ts`

**Interfaces:**
- Consumes: `trip.roundTransfers` flag.
- Produces: Rounded `equalBillShare` and VietQR payload amount on bill routes; rounded `remaining` and relaxed `pay-report` validation tolerance in `payView.ts`.

- [ ] **Step 1: Write the failing tests**

1. In `apps/api/test/bank.test.ts`:
   Add test that `GET /api/trips/:id/pay/:toId?bill=1&expense=:eid` generates VietQR with 17.000 ₫ when `roundTransfers: true` on an expense of 50.000 ₫ split 3 ways.
2. In `apps/api/test/expense-pay-view.test.ts`:
   Add test that `GET /api/trips/:id/expenses/:eid/pay` returns `row.remaining: 17000` and `POST .../pay-report` accepts `amount: 17000` when exact share is 16.667 ₫.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/api test test/bank.test.ts test/expense-pay-view.test.ts -t "roundTransfers"`
Expected: FAIL

- [ ] **Step 3: Implement bill QR and ExpensePay rounding**

1. In `apps/api/src/bank/routes.ts`:
   When computing `billExpense` share for VietQR:
   ```typescript
   let billAmount = billExpense ? (equalBillShare(billExpense) ?? 0) : 0;
   if (actor.trip.roundTransfers === 1 && billAmount > 0) {
     billAmount = billAmount <= 500 ? 0 : Math.round(billAmount / 1000) * 1000;
   }
   ```
2. In `apps/api/src/expenses/payView.ts`:
   - In `expensePayView`: if `trip.roundTransfers === 1`, calculate displayed remaining:
     `roundedRemaining = remaining <= 500 ? 0 : Math.round(remaining / 1000) * 1000`
     Use `roundedRemaining` in the returned `row.remaining` and `payInfo.amount`/`payload`.
   - In `POST .../pay-report`:
     When `trip.roundTransfers === 1`, allow `amount <= (row.remaining <= 500 ? 0 : Math.round(row.remaining / 1000) * 1000)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix apps/api test test/bank.test.ts test/expense-pay-view.test.ts -t "roundTransfers"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/bank/routes.ts apps/api/src/expenses/payView.ts apps/api/test/bank.test.ts apps/api/test/expense-pay-view.test.ts
git commit -m "feat(api): round single-bill QR amounts and support rounded pay-reports"
```

---

### Task 4: Group Settings Switch Component & i18n UI

**Files:**
- Create: `packages/web-common/src/components/RoundTransfersSwitch.tsx`
- Modify: `packages/web-common/src/screens/Settings.tsx`
- Modify: `packages/web-common/src/i18n/en.ts`
- Modify: `packages/web-common/src/i18n/vi.ts`
- Test: `packages/web-common/src/components/__tests__/round-transfers-switch.test.tsx`

**Interfaces:**
- Consumes: `view.trip.roundTransfers`, `useTripAction` from `../lib/useTripAction`.
- Produces: `RoundTransfersSwitch` component rendered in `Settings.tsx`.

- [ ] **Step 1: Write the failing test**

Create `packages/web-common/src/components/__tests__/round-transfers-switch.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { RoundTransfersSwitch } from '../RoundTransfersSwitch';
import { tripView } from '../../test/fixtures';

describe('RoundTransfersSwitch', () => {
  it('renders unchecked when roundTransfers is false and toggles on click', async () => {
    const view = { ...tripView(), trip: { ...tripView().trip, roundTransfers: false } };
    render(<RoundTransfersSwitch view={view} />);
    const toggle = screen.getByRole('switch', { name: /Round transfer amounts/i });
    expect(toggle).not.toBeChecked();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix packages/web-common test src/components/__tests__/round-transfers-switch.test.tsx`
Expected: FAIL (`RoundTransfersSwitch` does not exist).

- [ ] **Step 3: Implement `RoundTransfersSwitch`, i18n, and integration in `Settings.tsx`**

1. In `packages/web-common/src/i18n/en.ts`:
   - `'roundTransfers.title': 'Round transfer amounts',`
   - `'roundTransfers.explain': 'Round suggested transfers and QR codes to the nearest 1,000 ₫.',`
2. In `packages/web-common/src/i18n/vi.ts`:
   - `'roundTransfers.title': 'Làm tròn số tiền trả', // REVIEW`
   - `'roundTransfers.explain': 'Làm tròn số tiền chuyển khoản và mã QR đến 1.000 ₫ gần nhất.', // REVIEW`
3. Create `packages/web-common/src/components/RoundTransfersSwitch.tsx`:
   Model after `FewestSwitch.tsx`:
   ```tsx
   import { useId } from 'react';
   import type { TripView } from '@fsl/core';
   import { Label } from '@/components/ui/label';
   import { Switch } from '@/components/ui/switch';
   import { useT } from '../i18n';
   import { useTripAction } from '../lib/useTripAction';
   import { InlineError } from './InlineError';

   export function RoundTransfersSwitch({ view }: { view: TripView }) {
     const t = useT();
     const switchId = useId();
     const explainId = useId();
     const { busy, error, run } = useTripAction(view.trip.id);
     const on = view.trip.roundTransfers ?? false;
     return (
       <div className="fsl-round-transfers flex flex-col gap-1 p-4 bg-card rounded-xl border border-border">
         <div className="flex items-center justify-between gap-3 min-h-11">
           <Label htmlFor={switchId} className="fsl-round-transfers__label font-semibold text-foreground text-base leading-snug flex-1">
             {t('roundTransfers.title')}
           </Label>
           <Switch
             id={switchId}
             checked={on}
             onCheckedChange={() => run('', { roundTransfers: !on }, 'PATCH')}
             disabled={busy}
             aria-describedby={explainId}
             className="fsl-round-transfers__switch"
           />
         </div>
         <p id={explainId} className="fsl-round-transfers__explain m-0 text-sm text-muted-foreground">{t('roundTransfers.explain')}</p>
         {error ? <InlineError error={error} /> : null}
       </div>
     );
   }
   ```
4. In `packages/web-common/src/screens/Settings.tsx`:
   Import and render `<RoundTransfersSwitch view={view} />` right below `<FewestSwitch view={view} />` when `view.me.kind === 'member' && !view.trip.archived`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix packages/web-common test src/components/__tests__/round-transfers-switch.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web-common/src/components/RoundTransfersSwitch.tsx packages/web-common/src/screens/Settings.tsx packages/web-common/src/i18n/en.ts packages/web-common/src/i18n/vi.ts packages/web-common/src/components/__tests__/round-transfers-switch.test.tsx
git commit -m "feat(web-common): add RoundTransfersSwitch in group settings"
```
