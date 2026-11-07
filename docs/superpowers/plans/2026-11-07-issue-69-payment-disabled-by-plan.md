# Record Who Disabled a Payment (Issue #69) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record the member ID in `transactions.disabled_by_user_id` when disabling a payment, return `disabledByName` in the trip snapshot, and surface attribution in `PaymentsList` and `PaymentDetails` matching expenses and fund incomes.

**Architecture:**
- **Shared Core (`@cc/core`)**: Add `disabledByName: string | null` to `PaymentView` contract in `api-types.ts`.
- **API Backend (`@cc/api`)**: In `POST /trips/:id/payments/:pid/disable`, set `disabledByUserId = actor.userId`. In `POST .../enable`, clear `disabledByUserId = null`. In `snapshot.ts`, include `activePaymentRows` in `disabledUserIds` lookup and populate `disabledByName` on each `PaymentView`.
- **Frontend UI (`@cc/web-screens`)**: In `PaymentsList.tsx`, render `t('expenses.disabledBy', { name: payment.disabledByName })` when disabled. In `PaymentDetails.tsx`, render the note under the amount. In `TripTabs.tsx`, upgrade `TabsTrigger` touch target to `min-h-11` (44px).

**Tech Stack:** TypeScript, Hono, Drizzle ORM, React 19, Tailwind CSS v4, shadcn/ui, Vitest.

**Spec:** [GitHub Issue #69](https://github.com/NguyenVuNhan/Coin-crew/issues/69), `PRODUCT.md`, `DESIGN.md`.

## Global Constraints
- Every user-facing string must use translation keys from `@cc/web-i18n` (use existing `expenses.disabledBy`).
- No raw hex colors in code; all styling must use theme tokens from `DESIGN.md`.
- No new dependencies.
- Changes must pass all unit and snapshot tests in `@cc/core`, `@cc/api`, and `@cc/web-screens`.

## Review Focus
1. When disabling a payment with a guest actor (`actor.userId === null`), `disabledByUserId` is `null` and `disabledByName` is `null` (safe fallback, no crash).
2. When re-enabling a previously disabled payment, `disabledByUserId` is reset to `null` and `disabledByName` becomes `null`.
3. In `buildSnapshot`, active payment rows must be merged into `disabledUserIds` without duplicates, so a single query fetches user names for expenses, incomes, and payments.
4. In `PaymentsList`, the line-through styling applies to the title and amount, but the `disabledByName` note remains legible (normal style, `text-muted-foreground`).
5. Touch targets on `TripTabs` meet 44px (`min-h-11`) while preserving smooth tab switching animations.

---

### Task 1: Core Contract and Types

**Files:**
- Modify: `libs/shared/core/src/api-types.ts:315-325`
- Test: `libs/shared/core/test/balances.test.ts`

- [x] **Step 1: Write test expectations in core**
Add a test in `libs/shared/core/test/expensePay.test.ts` or `balances.test.ts` verifying that `PaymentView` supports `disabledByName: string | null`.

- [x] **Step 2: Update `PaymentView` interface**
In `libs/shared/core/src/api-types.ts`, add `disabledByName: string | null;` to `PaymentView`:
```typescript
export interface PaymentView {
  id: string; fromId: string; toId: string; amountClaimed: number; amountConfirmed: number | null;
  status: PaymentStatus; notArrived: boolean; createdAt: string;
  disabledByName: string | null;
  throughPeople?: boolean;
  expenseId?: string;
  paidBy?: PaidBy;
  confirmedById?: string | null;
  claimPending?: true;
}
```

- [x] **Step 3: Update fixtures across `@cc/core`**
Update any `PaymentView` mocks in `libs/shared/core/test/` to include `disabledByName: null`.

- [x] **Step 4: Verify `@cc/core` passes**
Run `npm test -w @cc/core`.

- [x] **Step 5: Commit changes**
`git commit -am "feat(core): add disabledByName to PaymentView contract"`

---

### Task 2: Backend API Routes and Snapshot

**Files:**
- Modify: `apps/api/src/payments/routes.ts:596-675`
- Modify: `apps/api/src/trips/snapshot.ts:250-327`
- Test: `apps/api/test/payments.test.ts`

- [ ] **Step 1: Write failing integration tests**
In `apps/api/test/payments.test.ts`, add a test case:
- Member records a payment.
- Member disables the payment (`POST /trips/:id/payments/:pid/disable`).
- Assert snapshot returns `payment.status === 'disabled'` and `payment.disabledByName === 'Minh'`.
- Member enables the payment (`POST /trips/:id/payments/:pid/enable`).
- Assert snapshot returns `payment.status === 'says_paid'` and `payment.disabledByName === null`.

- [ ] **Step 2: Update `disable` and `enable` routes in `apps/api/src/payments/routes.ts`**
In `POST /trips/:id/payments/:pid/disable`:
```typescript
    const r = await db
      .update(transactions)
      .set({
        status: 'disabled',
        disabledByUserId: actor.userId,
        updatedAt: now,
      })
```
In `POST /trips/:id/payments/:pid/enable`:
```typescript
    const r = await db
      .update(transactions)
      .set({
        status: sql<'says_paid' | 'confirmed'>`CASE WHEN ${transactions.confirmedByParticipantId} IS NULL THEN 'says_paid' ELSE 'confirmed' END`,
        amountConfirmed: sql<number | null>`CASE WHEN ${transactions.confirmedByParticipantId} IS NULL THEN NULL ELSE coalesce(${transactions.amountConfirmed}, ${transactions.amount}) END`,
        notArrivedAt: null,
        disabledByUserId: null,
        updatedAt: now,
      })
```

- [ ] **Step 3: Update `buildSnapshot` in `apps/api/src/trips/snapshot.ts`**
Include active payment rows in `disabledUserIds`:
```typescript
  const activeExpenseRows = txRows.filter((tx) => tx.type === 'expense' && tx.isLatest === 1);
  const activeIncomeRows = txRows.filter((tx) => tx.type === 'income' && tx.isLatest === 1);
  const activePaymentRows = txRows.filter((tx) => tx.type === 'payment' && tx.isLatest === 1);
  const disabledUserIds = Array.from(
    new Set(
      [...activeExpenseRows, ...activeIncomeRows, ...activePaymentRows]
        .map((e) => e.disabledByUserId)
        .filter((id): id is string => id !== null),
    ),
  );
```
In `paymentViews.map((p) => ...)` assign:
```typescript
    disabledByName: p.disabledByUserId ? (disabledNameMap.get(p.disabledByUserId) ?? null) : null,
```

- [ ] **Step 4: Run tests and verify**
Run `npm test -w @cc/api apps/api/test/payments.test.ts`.

- [ ] **Step 5: Commit changes**
`git commit -am "feat(api): record disabledByUserId on payment disable and surface in snapshot"`

---

### Task 3: Frontend UI Attribution (`PaymentsList` & `PaymentDetails`)

**Files:**
- Modify: `libs/web/screens/src/components/PaymentsList.tsx:55-75`
- Modify: `libs/web/screens/src/components/PaymentDetails.tsx:75-80`
- Modify: `libs/web/screens/src/test/fixtures.ts`
- Test: `libs/web/screens/src/components/__tests__/payments-list.test.tsx`

- [ ] **Step 1: Write UI tests for disabled payment attribution**
In `libs/web/screens/src/components/__tests__/payments-list.test.tsx`, add a test that renders a disabled payment with `disabledByName: 'Minh'` and asserts `screen.getByText('Disabled by Minh')` (or translated `Đã bị vô hiệu hóa bởi Minh`) is present.

- [ ] **Step 2: Update `PaymentsList.tsx`**
In `libs/web/screens/src/components/PaymentsList.tsx`, under the payment title:
```tsx
            <span
              className={cn(
                'fsl-payments__text min-w-0 truncate text-base font-semibold text-foreground',
                off && 'fsl-payments__text--off text-subtle-foreground line-through',
              )}
              style={off ? { textDecoration: 'line-through' } : undefined}
            >
              {title}
            </span>
            {off && payment.disabledByName ? (
              <span className="fsl-payments__disabled-by truncate text-xs text-muted-foreground">
                {t('expenses.disabledBy', { name: payment.disabledByName })}
              </span>
            ) : null}
            {payment.throughPeople ? (
              <span className="fsl-payments__through truncate text-sm text-muted-foreground">{t('payments.throughPeople')}</span>
            ) : null}
```

- [ ] **Step 3: Update `PaymentDetails.tsx`**
In `libs/web/screens/src/components/PaymentDetails.tsx`, above or below the status amount:
```tsx
      {p.status === 'disabled' && p.disabledByName ? (
        <p className="fsl-details__note text-sm text-muted-foreground m-0">
          {t('expenses.disabledBy', { name: p.disabledByName })}
        </p>
      ) : null}
```

- [ ] **Step 4: Update test fixtures**
Update `libs/web/screens/src/test/fixtures.ts` and test files where `PaymentView` mocks are defined so `disabledByName: null` is present.

- [ ] **Step 5: Verify web screens tests**
Run `npm test -w @cc/web-screens`.

- [ ] **Step 6: Commit changes**
`git commit -am "feat(web): display disabled by attribution in PaymentsList and PaymentDetails"`

---

### Task 4: Ergonomics Polish (`TripTabs` 44px)

**Files:**
- Modify: `libs/web/screens/src/components/TripTabs.tsx:21-45`
- Test: `libs/web/screens/src/components/__tests__/member-trip.test.tsx`

- [ ] **Step 1: Update `TripTabs.tsx` touch target**
Change `min-h-9` to `min-h-11` (44px touch target) in `TabsTrigger`:
```tsx
        <TabsTrigger
          value="expenses"
          className={cn(
            'fsl-trip-tab',
            'flex-1 min-h-11 px-3 py-1.5 rounded-full text-sm font-medium text-muted-foreground text-center cursor-pointer transition-colors motion-reduce:transition-none hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'data-active:bg-card data-active:text-foreground data-active:shadow-sm data-active:font-semibold',
            activeTab === 'expenses' && 'fsl-trip-tab--active',
          )}
        >
```
Do the same for the `payments` tab.

- [ ] **Step 2: Verify `TripTabs` tests**
Run `npm test -w @cc/web-screens`.

- [ ] **Step 3: Commit changes**
`git commit -am "style(web): upgrade TripTabs touch target to 44px min-h-11"`

---

### Task 5: Whole-Branch Verification

**Files:**
- Verification only

- [ ] **Step 1: Run typecheck**
Run `npm run typecheck`.

- [ ] **Step 2: Run test suite**
Run `npm test`.

- [ ] **Step 3: Run linter and style guard**
Run `npm run lint` and `npx vitest run libs/web/screens/src/test/style-guard.test.ts`.
