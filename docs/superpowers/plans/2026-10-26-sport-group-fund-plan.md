# Sport Group Fund Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sport groups get one shared group fund: admins add income from the add screen, pay expenses with *Paid by: Group fund*, and everyone sees the balance, while personal balances stay exactly as they are.

**Architecture:** Income is a new `type: 'income'` row in `transactions`; a fund-paid expense is an ordinary expense with `meta.paidFromFund` and no shares. `@fsl/core` gets pure fund helpers and a `manage_fund` permission; the API filters fund-paid expenses out of `toLedger`, so the balance functions never see them. The web adds a switcher and income form on the add screen, a *Group fund* option in *Paid by*, income rows in the feed, a fund pill with a sheet, and income details.

**Tech Stack:** TypeScript, Hono + Drizzle on Cloudflare Workers/D1 (`@fsl/api`), React 19 + React Router + TanStack Query (`@fsl/web`), Vitest (+ `@cloudflare/vitest-plugin` for the API, Testing Library for the web), Playwright.

**Spec:** [docs/2026-10-26-sport-group-fund-design.md](2026-10-26-sport-group-fund-design.md) · Wireframes: [docs/superpowers/mockups/v5-group-fund.html](superpowers/mockups/v5-group-fund.html)

**Branch:** `feat/sport-group-fund` (cut from `feat/auto-split-people-picker`).

**Harness:** every task names its lane from `~/.claude/CLAUDE.md` / `~/.claude/harness/HARNESS.md`. "Opus" means the task needs judgment or is under ~40 lines; "Small build", "Mechanical" and "Screen" go to Gemini 3.8 Flash through `agy-exec.sh` with `AGY_ALLOW` set to exactly the files listed, then through the review gate (read every changed file, run the tests yourself). Screens get a screen spec (`ui-ux-design-companion` §5.2) built from this plan, the spec §7 and the wireframes. Gemini never edits existing tests and never runs tests. **Commit steps run only after the user has OK'd per-task commits on this branch** (user CLAUDE.md: commits only when asked).

## Global Constraints

- Zero new npm dependencies, in every workspace.
- Whole-đồng integer maths only (`parseVnd`, `formatVnd`, `MAX_AMOUNT` from `@fsl/core`).
- `computeBalances`, `suggestTransfers`, `pairwiseTransfers`, `computeShares`, `computeSportShares` are not modified; their existing tests pass unchanged.
- No SQL migration; only the Drizzle `type` enum gains `'income'`.
- Sport groups only (`trip.preset === 'sport'`); admin means `isAdmin || isOrganiser` on a member.
- Phone first at 375px: no horizontal scroll (`scrollWidth <= innerWidth`), touch targets ≥ 44×44px, text inputs 16px (`var(--text-input)`).
- Colours only through tokens in `apps/web/src/styles/tokens.css`; income amounts `--color-success`, fund-paid totals `--color-text-subtle`; no new tokens; no raw hex in components.
- Icons are inline Lucide SVGs in `apps/web/src/components/icons.tsx`.
- Every new key is in both `apps/web/src/i18n/en.ts` and `vi.ts`; every new Vietnamese line ends with `// REVIEW`.
- Existing tests are never edited; new behaviour gets new test files.

## Review Focus

1. **An older server or cached snapshot without `fund`** (and expenses without `createdAt`): every page must render as it does today, with no pill and no crash. → Task 7 test `renders as before when the view has no fund`.
2. **Editing a fund-paid expense when the fund is at 0₫**: its own amount must count as available, or an admin can't fix a typo. → Task 4 test `edit counts the expense's own amount as available`; Task 10 test `editing a fund-paid expense at 0₫ balance still saves its own amount`.
3. **Choosing Group fund, then a person again** must restore the split and send no `paidFromFund`. → Task 10 test `choosing a person again restores the split and drops the fund flag`.
4. **A non-admin or guest typing `?type=income` or an income edit URL** must get today's expense form or a read-only message, never the income form. → Task 9 tests `non-admin ?type=income gets the expense form` and `income edit URL for a non-admin is read-only`.
5. **A second admin editing or rolling back someone else's income** must keep *Added by* as the first adder. → Task 3 test `edit and roll back keep addedById, record the editor`.

---

### Task 1: Core — fund helpers, types and `manage_fund`

**Lane:** Opus (shared contracts every later task depends on; ~80 lines).

**Files:**
- Create: `packages/core/src/fund.ts`
- Modify: `packages/core/src/api-types.ts`, `packages/core/src/permissions.ts`, `packages/core/src/index.ts`
- Test: `packages/core/test/fund.test.ts`, `packages/core/test/permissions-fund.test.ts` (new)

**Interfaces:**
- Produces (in `fund.ts`, re-exported from `index.ts`):
  - `type IncomeStatus = 'approved' | 'disabled'`
  - `interface LedgerIncome { id: string; amount: number; status: IncomeStatus }`
  - `interface FundSummary { balance: number; added: number; spent: number }`
  - `type FundItem = { kind: 'income' | 'expense'; amount: number; status: string; meta?: ExpenseMeta | null }`
  - `isFundPaid(e: { meta?: ExpenseMeta | null }): boolean`
  - `fundEffect(item: FundItem): number`
  - `fundSummary(incomes: LedgerIncome[], expenses: { amount: number; status: string; meta?: ExpenseMeta | null }[]): FundSummary`
- Produces (in `api-types.ts`): `'FUND_SHORT'` in `ApiErrorCode`; `'income_added' | 'income_edited' | 'income_disabled' | 'income_enabled' | 'income_rolled_back'` in `ActivityAction`; `ExpenseMeta.paidFromFund?: boolean`; `ExpenseView.createdAt?: string`; `IncomeInput`, `IncomeHistoryItem`, `IncomeView`, `TripView.fund?` exactly as spec §5.4.
- Produces (in `permissions.ts`): `'manage_fund'` in `Action`; `can(actor, 'manage_fund')` is `isMember && isAdmin`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/core/test/fund.test.ts
const fund = { paidFromFund: true };
it('isFundPaid reads meta.paidFromFund', () => {
  expect(isFundPaid({ meta: fund })).toBe(true);
  expect(isFundPaid({ meta: null })).toBe(false);
  expect(isFundPaid({})).toBe(false);
  expect(isFundPaid({ meta: { paidFromFund: false } })).toBe(false);
});
it('fundEffect counts approved income up and approved fund-paid expenses down, nothing else', () => {
  expect(fundEffect({ kind: 'income', amount: 200000, status: 'approved' })).toBe(200000);
  expect(fundEffect({ kind: 'income', amount: 200000, status: 'disabled' })).toBe(0);
  expect(fundEffect({ kind: 'income', amount: 200000, status: 'superseded' })).toBe(0);
  expect(fundEffect({ kind: 'expense', amount: 150000, status: 'approved', meta: fund })).toBe(-150000);
  for (const status of ['pending', 'rejected', 'disabled', 'superseded']) {
    expect(fundEffect({ kind: 'expense', amount: 150000, status, meta: fund })).toBe(0);
  }
  expect(fundEffect({ kind: 'expense', amount: 600000, status: 'approved', meta: null })).toBe(0);
});
it('fundSummary: 650.000 added − 250.000 spent = 400.000', () => {
  const incomes: LedgerIncome[] = [
    { id: 'i-1', amount: 200000, status: 'approved' }, { id: 'i-2', amount: 300000, status: 'approved' },
    { id: 'i-3', amount: 150000, status: 'approved' }, { id: 'i-4', amount: 100000, status: 'disabled' },
  ];
  const expenses = [
    { amount: 150000, status: 'approved', meta: fund }, { amount: 100000, status: 'approved', meta: fund },
    { amount: 600000, status: 'approved', meta: null }, { amount: 50000, status: 'disabled', meta: fund },
  ];
  expect(fundSummary(incomes, expenses)).toEqual({ balance: 400000, added: 650000, spent: 250000 });
  expect(fundSummary([], [])).toEqual({ balance: 0, added: 0, spent: 0 });
});

// packages/core/test/permissions-fund.test.ts — same actor builders as permissions.test.ts
it.each([
  ['organiser', member('O', true), true], ['admin', member('A', false, true), true],
  ['plain member', member('M'), false], ['guest flagged admin', { ...guest('G'), isAdmin: true }, false],
  ['viewer', viewer, false],
])('manage_fund for %s', (_n, actor, expected) => expect(can(actor, 'manage_fund')).toBe(expected));
```

- [ ] **Step 2: Run them and see them fail**

Run: `npm test -w @fsl/core -- fund`
Expected: FAIL (`isFundPaid` / `fundSummary` not exported; `manage_fund` returns false for admins).

- [ ] **Step 3: Implement `fund.ts`, the types and the permission**

`fund.ts` imports `ExpenseMeta` with `import type` from `./api-types`; `api-types.ts` imports `IncomeStatus` with `import type` from `./fund` (type-only cycle is fine). `fundSummary` builds on `fundEffect`. In `can()`, add `case 'manage_fund':` to the existing admin-only member group (`return isMember && isAdmin;`).

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test -w @fsl/core && npm run typecheck -w @fsl/core`
Expected: all pass, including the untouched `balances`, `transfers`, `split*` and `permissions*` suites.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): group fund helpers, income types and the manage_fund permission"
```

---

### Task 2: API — snapshot reads income and the fund, keeps fund-paid expenses off the ledger

**Lane:** Small build (`schema.ts` + `snapshot.ts`, ~110 lines); Mechanical for the new test files.

**Files:**
- Modify: `apps/api/src/db/schema.ts` (the `type` enum), `apps/api/src/trips/snapshot.ts`
- Create: `apps/api/test/fund-helpers.ts`
- Test: `apps/api/test/fund-snapshot.test.ts` (new)

**Interfaces:**
- Consumes: Task 1 (`isFundPaid`, `fundSummary`, `IncomeView`, `IncomeHistoryItem`, `LedgerIncome`).
- Produces (`fund-helpers.ts`, used by Tasks 3 and 4 tests):
  - `makeSport(tripId = T.tripId): Promise<void>` — `UPDATE trips SET preset = 'sport'`
  - `bumpVersion(tripId = T.tripId): Promise<void>` — `UPDATE trips SET version = version + 1` (seeded rows don't bump it)
  - `archive(tripId = T.tripId): Promise<void>` — sets `archived_at`
  - `makeAdmin(participantId: string, on = true): Promise<void>` — sets `is_admin`
  - `seedIncome(r: { id: string; amount: number; payerId?: string; createdById?: string; status?: 'approved' | 'disabled' | 'superseded'; rootId?: string; parentId?: string | null; isLatest?: 0 | 1; description?: string; createdAt?: string; disabledByUserId?: string | null }): Promise<void>` — defaults: `payerId`/`createdById` `PID.M`, `approved`, `rootId = id`, `isLatest 1`, `meta_json '{"category":null}'`, `spent_on '2026-10-26'`
  - `seedFundExpense(r: { id: string; amount: number; status?: string; createdAt?: string; description?: string }): Promise<void>` — `payer_id`/`created_by` `PID.M`, `split_mode 'equal'`, `meta_json '{"paidFromFund":true}'`, no shares
- Produces (snapshot): `TripSnapshot.fund`, `ExpenseView.createdAt`; `toLedger` skips `isFundPaid` expenses.

- [ ] **Step 1: Write the failing tests** (`beforeEach`: `seedTrip`, `seedExpenses`; Minh's member headers via `memberSid(U.minh)`)

```ts
it('a trip group has fund null', async () => { expect((await view(minh)).fund).toBeNull(); });

it('sums approved income minus approved fund-paid expenses, newest income first', async () => {
  await makeSport();
  await seedIncome({ id: 'i-1', amount: 200000, createdAt: '2026-10-26T10:00:00.000Z' });
  await seedIncome({ id: 'i-2', amount: 300000, createdAt: '2026-10-25T10:00:00.000Z' });
  await seedIncome({ id: 'i-3', amount: 150000, createdAt: '2026-10-24T10:00:00.000Z' });
  await seedIncome({ id: 'i-4', amount: 100000, status: 'disabled', disabledByUserId: U.minh, createdAt: '2026-10-23T10:00:00.000Z' });
  await seedFundExpense({ id: 'e-f1', amount: 150000 });
  await seedFundExpense({ id: 'e-f2', amount: 100000 });
  const v = await view(minh);
  expect(v.fund).toMatchObject({ balance: 400000, added: 650000, spent: 250000 });
  expect(v.fund!.incomes.map((i) => i.id)).toEqual(['i-1', 'i-2', 'i-3', 'i-4']);
  expect(v.fund!.incomes[3]).toMatchObject({ status: 'disabled', disabledByName: 'Minh' });
  expect(v.expenses.find((e) => e.id === 'e-f1')).toMatchObject({ meta: { paidFromFund: true }, shares: [] });
});

it('fund-paid expenses stay off balances, suggestions and the trip list, but count in the total', async () => {
  await makeSport();
  const before = await view(minh);
  const listBefore = await json<TripListItem[]>(call('/api/trips', { headers: minh }));
  await seedFundExpense({ id: 'e-f1', amount: 150000 });
  await bumpVersion();
  const after = await view(minh);
  expect(after.balances).toEqual(before.balances);
  expect(after.suggestions).toEqual(before.suggestions);
  expect(after.myBalance).toEqual(before.myBalance);
  expect(after.trip.total).toBe(before.trip.total + 150000);
  expect(await json<TripListItem[]>(call('/api/trips', { headers: minh }))).toEqual(listBefore);
});

it('income history: addedById from payer_id, createdById from the latest version, older versions newest first', async () => {
  await makeSport();
  await seedIncome({ id: 'i-1', amount: 100000, status: 'superseded', isLatest: 0, createdAt: '2026-10-24T10:00:00.000Z' });
  await seedIncome({ id: 'i-2', rootId: 'i-1', parentId: 'i-1', amount: 150000, createdById: PID.A, createdAt: '2026-10-25T10:00:00.000Z' });
  const [income] = (await view(minh)).fund!.incomes;
  expect(income).toMatchObject({ id: 'i-2', rootId: 'i-1', addedById: PID.M, createdById: PID.A, amount: 150000, meta: { category: null } });
  expect(income!.history.map((h) => [h.id, h.amount])).toEqual([['i-1', 100000]]);
});

it('every expense carries createdAt', async () => {
  expect((await view(minh)).expenses.every((e) => typeof e.createdAt === 'string')).toBe(true);
});
```

- [ ] **Step 2: Run and see them fail**

Run: `npm test -w @fsl/api -- fund-snapshot`
Expected: FAIL (`fund` undefined; `createdAt` missing; balances include the fund-paid expense).

- [ ] **Step 3: Implement**

In `buildSnapshot`: map `type === 'income'` rows like expense rows (latest → `IncomeView`, `isLatest 0` → `history` by `rootId`, newest first); add income rows' `disabledByUserId` to the user-name lookup; set `createdAt` on each `ExpenseView`; `fund = trip.preset === 'sport' ? { ...fundSummary(incomeLedger, expenseViews), incomes } : null` (with `fund: null` in `partialSnapshot`). In `toLedger`, map only `s.expenses.filter((e) => !isFundPaid(e))`.

- [ ] **Step 4: Run the API suite**

Run: `npm test -w @fsl/api && npm run typecheck -w @fsl/api`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/db/schema.ts apps/api/src/trips/snapshot.ts apps/api/test/fund-helpers.ts apps/api/test/fund-snapshot.test.ts
git commit -m "feat(api): read fund income into the trip view and keep fund-paid expenses off balances"
```

---

### Task 3: API — income routes

**Lane:** Small build (`check.ts` + `routes.ts`, ~250 lines, 900s in the background); Opus mounts it in `app.ts` (1 line); Mechanical for the test file.

**Files:**
- Create: `apps/api/src/fund/check.ts`, `apps/api/src/fund/routes.ts`
- Modify: `apps/api/src/app.ts` (`app.route('/api', fundRoutes())` after `expenseRoutes()`)
- Test: `apps/api/test/fund-income.test.ts` (new)

**Interfaces:**
- Consumes: Task 1 (`fundEffect`, `fundSummary`, `FundItem`, `IncomeInput`), Task 2 (`fund-helpers.ts`).
- Produces (`check.ts`, used by Task 4):
  - `assertSportGroup(trip: TripRow): void` — throws `ApiError('FORBIDDEN', 403, 'The group fund is for sport groups.')`
  - `currentFundBalance(db: Db, tripId: string): Promise<number>` — `fundSummary` over the trip's latest income and expense rows (`is_latest = 1`; parse `meta_json`)
  - `assertFundCovers(balance: number, before: FundItem | null, after: FundItem | null): void` — throws `ApiError('FUND_SHORT', 409, 'Not enough in the group fund.')` when `balance − fundEffect(before) + fundEffect(after) < 0`
- Produces (`routes.ts`): `fundRoutes(): Hono<AppBindings>` with the five routes of spec §6.1. Responses: POST `201 { incomeId }`; PATCH and roll back `200 { incomeId, rootId }`; disable and enable `204`.

Route order inside each handler: `resolveActor` → `assertWritable` → `assertSportGroup` → `ensure(actor, 'manage_fund')` → find the latest income by id or root id (`404 NOT_FOUND`) → validate → fund check → `commitTripWrite` with the activity of spec §6.1. PATCH and roll back copy `payer_id` from the head and set `created_by_participant_id` to the actor; status stays the head's.

- [ ] **Step 1: Write the failing tests** (`beforeEach`: `seedTrip`, `seedExpenses`, `makeSport`; `minh` = organiser headers; An linked as a member with `linkMember(PID.A, U.an, 'An')`)

```ts
const income = { amount: 200000, spentOn: '2026-10-26', description: 'Thu 2 khách vãng lai' };

it('an admin adds income: 201, fund +200.000, nobody\'s balance changes', async () => {
  const before = await view(minh);
  const res = await post('/fund/incomes', minh, income);
  expect(res.status).toBe(201);
  const after = await view(minh);
  expect(after.fund!.balance).toBe(200000);
  expect(after.balances).toEqual(before.balances);
  expect(after.fund!.incomes[0]).toMatchObject({ ...income, addedById: PID.M, status: 'approved', meta: { category: null } });
});

it('refuses non-admins, guests, trip groups and archived groups', async () => {
  expect((await post('/fund/incomes', an, income)).status).toBe(403);
  expect((await post('/fund/incomes', await guestHeaders(PID.B), income)).status).toBe(403);
  await archive();
  expect((await post('/fund/incomes', minh, income)).status).toBe(409); // TRIP_ARCHIVED
});
describe('in a trip group', () => {
  // its own beforeEach: seedTrip only, no makeSport
  it('refuses income', async () => expect((await post('/fund/incomes', minh, income)).status).toBe(403));
});

it.each([
  [{ ...income, amount: 0 }], [{ ...income, amount: 1.5 }], [{ ...income, amount: MAX_AMOUNT + 1 }],
  [{ ...income, spentOn: '26/10/2026' }], [{ ...income, description: '   ' }], [{ ...income, description: 'x'.repeat(81) }],
  [{ ...income, category: 'walk-in' }],
])('422 for %j', async (body) => expect((await post('/fund/incomes', minh, body)).status).toBe(422));

it('edit and roll back keep addedById, record the editor', async () => {
  const { incomeId } = await json<{ incomeId: string }>(post('/fund/incomes', minh, income));
  await makeAdmin(PID.A);
  const edited = await json<{ incomeId: string; rootId: string }>(patch(`/fund/incomes/${incomeId}`, an, { ...income, amount: 250000 }));
  expect(edited.rootId).toBe(incomeId);
  let latest = (await view(minh)).fund!.incomes[0]!;
  expect(latest).toMatchObject({ amount: 250000, addedById: PID.M, createdById: PID.A });
  const res = await post(`/fund/incomes/${edited.incomeId}/rollback`, an, { targetHistoryId: incomeId });
  expect(res.status).toBe(200);
  latest = (await view(minh)).fund!.incomes[0]!;
  expect(latest).toMatchObject({ amount: 200000, addedById: PID.M, createdById: PID.A });
});

it('disable and enable return 204; a second disable is ALREADY_HANDLED', async () => {
  const { incomeId } = await json<{ incomeId: string }>(post('/fund/incomes', minh, income));
  expect((await post(`/fund/incomes/${incomeId}/disable`, minh)).status).toBe(204);
  expect((await view(minh)).fund).toMatchObject({ balance: 0, incomes: [{ status: 'disabled', disabledByName: 'Minh' }] });
  expect((await post(`/fund/incomes/${incomeId}/disable`, minh)).status).toBe(409);
  expect((await post(`/fund/incomes/${incomeId}/enable`, minh)).status).toBe(204);
  expect((await post(`/fund/incomes/${incomeId}/enable`, minh)).status).toBe(409);
});

it('FUND_SHORT when money already spent would go missing', async () => {
  const { incomeId } = await json<{ incomeId: string }>(post('/fund/incomes', minh, { ...income, amount: 300000 }));
  await seedFundExpense({ id: 'e-f1', amount: 250000 });
  await bumpVersion();
  const short = async (res: Promise<Response>) => {
    const r = await res;
    expect(r.status).toBe(409);
    expect((await json<{ error: { code: string } }>(r)).error.code).toBe('FUND_SHORT');
  };
  await short(post(`/fund/incomes/${incomeId}/disable`, minh));
  await short(patch(`/fund/incomes/${incomeId}`, minh, { ...income, amount: 200000 }));
  expect((await patch(`/fund/incomes/${incomeId}`, minh, { ...income, amount: 250000 })).status).toBe(200);
});

it('writes income activity', async () => {
  await post('/fund/incomes', minh, income);
  const [item] = await json<ActivityItem[]>(call(`${base}/activity`, { headers: minh }));
  expect(item).toMatchObject({ action: 'income_added', details: { description: income.description, amount: 200000 } });
});
```

- [ ] **Step 2: Run and see them fail**

Run: `npm test -w @fsl/api -- fund-income`
Expected: FAIL (routes return 404).

- [ ] **Step 3: Implement `check.ts`, `routes.ts` and the mount** as described in this task's Interfaces.

- [ ] **Step 4: Run the API suite**

Run: `npm test -w @fsl/api && npm run typecheck -w @fsl/api`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/fund apps/api/src/app.ts apps/api/test/fund-income.test.ts
git commit -m "feat(api): add, edit, disable, enable and roll back fund income"
```

---

### Task 4: API — fund-paid expenses

**Lane:** Opus (permission ordering inside a 935-line route file; every handler changes a little).

**Files:**
- Modify: `apps/api/src/expenses/routes.ts`
- Test: `apps/api/test/fund-expenses.test.ts` (new)

**Interfaces:**
- Consumes: Task 1 (`isFundPaid`, `FundItem`), Task 3 (`assertSportGroup`, `currentFundBalance`, `assertFundCovers`), Task 2 (`fund-helpers.ts`).
- Produces: `POST/PATCH /trips/:id/expenses` accept `meta: { paidFromFund: true }` with `entries: []`, `mode: 'equal'`; spec §6.2 rules on every handler.

Rules to implement (spec §6.2): in `validateExpenseInput`, `meta.paidFromFund === true` → require `entries.length === 0`, `mode === 'equal'`, no `meta.sport`, skip `computeShares`, `shares = []`; any other non-absent `paidFromFund` → 422. A local `ensureFundWrite(actor)` (`assertSportGroup(actor.trip)` + `ensure(actor, 'manage_fund')`) runs whenever the head, the new version or the roll back target is fund-paid — in POST, PATCH, roll back, disable, enable and DELETE, before the existing checks. POST/PATCH store `payer_id = actor.participantId` for fund-paid bodies. Fund checks with `assertFundCovers(await currentFundBalance(db, tripId), before, after)` in POST, PATCH, roll back and enable. `expense_added` / `expense_edited` details gain `paidFromFund: true` when set.

- [ ] **Step 1: Write the failing tests** (`beforeEach`: `seedTrip`, `seedExpenses`, `makeSport`, then `post('/fund/incomes', minh, { amount: 400000, spentOn: '2026-10-26', description: 'Quỹ' })`; An linked as a member)

```ts
const fundPaid = { description: 'Nước sau trận', amount: 150000, spentOn: '2026-10-26', payerId: PID.M, mode: 'equal', entries: [], meta: { paidFromFund: true } };

it('an admin pays from the fund: no shares, payer is the admin, balances unchanged, fund −150.000, total +150.000', async () => {
  const before = await view(minh);
  const res = await post('/expenses', minh, { ...fundPaid, payerId: PID.B });
  expect(res.status).toBe(201);
  const after = await view(minh);
  const e = after.expenses.find((x) => x.description === 'Nước sau trận')!;
  expect(e).toMatchObject({ payerId: PID.M, shares: [], status: 'approved', meta: { paidFromFund: true } });
  expect(after.balances).toEqual(before.balances);
  expect(after.fund!.balance).toBe(250000);
  expect(after.trip.total).toBe(before.trip.total + 150000);
});

it.each([
  [{ ...fundPaid, entries: [{ participantId: PID.M, value: 1 }] }],
  [{ ...fundPaid, mode: 'amounts' }],
  [{ ...fundPaid, meta: { paidFromFund: true, sport: { court: 150000, shuttlecocks: [], extra: 0, rule: { kind: 'equal' }, entries: [], maleSlotRate: 0, femaleSlotRate: 0 } } }],
  [{ ...fundPaid, meta: { paidFromFund: 'yes' } }],
])('422 for a malformed fund-paid body', async (body) => expect((await post('/expenses', minh, body)).status).toBe(422));

it('FUND_SHORT past the balance; exactly the balance is fine', async () => {
  expect((await post('/expenses', minh, { ...fundPaid, amount: 400001 })).status).toBe(409);
  expect((await post('/expenses', minh, { ...fundPaid, amount: 400000 })).status).toBe(201);
  expect((await view(minh)).fund!.balance).toBe(0);
});

it('edit counts the expense\'s own amount as available', async () => {
  const { expenseId } = await json<{ expenseId: string }>(post('/expenses', minh, { ...fundPaid, amount: 400000 }));
  expect((await patch(`/expenses/${expenseId}`, minh, { ...fundPaid, amount: 400000, description: 'Nước + đá' })).status).toBe(200);
  expect((await patch(`/expenses/${expenseId}`, minh, { ...fundPaid, amount: 400001 })).status).toBe(409);
});

it('turning an admin\'s own expense into a fund-paid one drops its shares', async () => {
  const { expenseId } = await json<{ expenseId: string }>(post('/expenses', minh, { ...fundPaid, meta: null, entries: [{ participantId: PID.M, value: 1 }, { participantId: PID.B, value: 1 }] }));
  const { expenseId: next } = await json<{ expenseId: string }>(patch(`/expenses/${expenseId}`, minh, fundPaid));
  expect((await view(minh)).expenses.find((e) => e.id === next)).toMatchObject({ shares: [], meta: { paidFromFund: true } });
});

it('disable returns the money; enable checks again', async () => {
  const { expenseId } = await json<{ expenseId: string }>(post('/expenses', minh, { ...fundPaid, amount: 300000 }));
  expect((await post(`/expenses/${expenseId}/disable`, minh)).status).toBe(204);
  expect((await view(minh)).fund!.balance).toBe(400000);
  await post('/expenses', minh, { ...fundPaid, amount: 300000 });
  expect((await post(`/expenses/${expenseId}/enable`, minh)).status).toBe(409);
});

it('every write on a fund-paid expense needs manage_fund', async () => {
  expect((await post('/expenses', an, fundPaid)).status).toBe(403);
  expect((await post('/expenses', await guestHeaders(PID.B), fundPaid)).status).toBe(403);
  await makeAdmin(PID.A);
  const { expenseId } = await json<{ expenseId: string }>(post('/expenses', an, fundPaid));
  await makeAdmin(PID.A, false);
  expect((await patch(`/expenses/${expenseId}`, an, { ...fundPaid, description: 'x' })).status).toBe(403);
  expect((await post(`/expenses/${expenseId}/disable`, an)).status).toBe(403);
  expect((await call(`${base}/expenses/${expenseId}`, { method: 'DELETE', headers: an })).status).toBe(403);
});

describe('in a trip group', () => {
  // its own beforeEach: seedTrip and seedExpenses only, no makeSport, no income
  it('refuses paidFromFund', async () => expect((await post('/expenses', minh, fundPaid)).status).toBe(403));
});

it('roll back to a larger fund-paid version is checked', async () => {
  const { expenseId } = await json<{ expenseId: string }>(post('/expenses', minh, { ...fundPaid, amount: 300000 }));
  const { expenseId: v2 } = await json<{ expenseId: string }>(patch(`/expenses/${expenseId}`, minh, { ...fundPaid, amount: 100000 }));
  await post('/expenses', minh, { ...fundPaid, amount: 300000 }); // balance now 0
  expect((await post(`/expenses/${v2}/rollback`, minh, { targetHistoryId: expenseId })).status).toBe(409);
});

it('activity says the expense was paid from the fund', async () => {
  await post('/expenses', minh, fundPaid);
  const [item] = await json<ActivityItem[]>(call(`${base}/activity`, { headers: minh }));
  expect(item).toMatchObject({ action: 'expense_added', details: { paidFromFund: true, amount: 150000 } });
});
```

- [ ] **Step 2: Run and see them fail**

Run: `npm test -w @fsl/api -- fund-expenses`
Expected: FAIL (fund-paid bodies get 422 `NO_PARTICIPANTS`).

- [ ] **Step 3: Implement the rules above in `expenses/routes.ts`.**

- [ ] **Step 4: Run the API suite**

Run: `npm test -w @fsl/api && npm run typecheck -w @fsl/api`
Expected: all pass, including the untouched `expenses*.test.ts`, `transactions-history.test.ts`, `admin-permissions.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/expenses/routes.ts apps/api/test/fund-expenses.test.ts
git commit -m "feat(api): pay an expense from the group fund"
```

---

### Task 5: Web — copy, icon, error, activity lines, view helpers and fixtures

**Lane:** Mechanical (`en.ts` + `vi.ts` keys below); Opus (`icons.tsx`, `InlineError.tsx`, `activityText.ts`, `lib/fund.ts`, each under 40 lines); Mechanical (`fundFixtures.ts` + the test file).

**Files:**
- Modify: `apps/web/src/i18n/en.ts`, `apps/web/src/i18n/vi.ts`, `apps/web/src/components/icons.tsx`, `apps/web/src/components/InlineError.tsx`, `apps/web/src/lib/activityText.ts`
- Create: `apps/web/src/lib/fund.ts`, `apps/web/src/test/fundFixtures.ts`
- Test: `apps/web/src/lib/__tests__/fund.test.ts`, `apps/web/src/test/fund-foundations.test.tsx` (new)

**Interfaces:**
- Produces (`lib/fund.ts`):
  - `fundOf(view: TripView): NonNullable<TripView['fund']> | null` — `view.fund ?? null`
  - `showFund(view: TripView): boolean` — `fundOf(view) !== null && (incomes.length > 0 || view.expenses.some(isFundPaid))`
  - `isFundAdmin(view: TripView): boolean` — `fundOf(view) !== null && !view.trip.archived && can(actorOf(view), 'manage_fund')`
  - `fundAvailable(view: TripView, editing?: ExpenseView): number` — balance, plus `editing.amount` when `editing` is approved and fund-paid
  - `incomeMinimum(view: TripView, income: IncomeView): number` — `income.status === 'approved' ? Math.max(0, income.amount − balance) : 0`
  - `type FeedItem = { kind: 'expense'; item: ExpenseView } | { kind: 'income'; item: IncomeView }`
  - `mergeFeed(expenses: ExpenseView[], incomes: IncomeView[]): FeedItem[]` — newest first by `createdAt`; a missing `createdAt` sorts as `''` (oldest); ties keep expenses first
- Produces (`fundFixtures.ts`): `income(id, description, amount, extra?: Partial<IncomeView>): IncomeView` (`addedById`/`createdById` `PIDS.M`, `approved`, `spentOn '2026-10-26'`, `meta { category: null }`, `history []`, `disabledByName null`); `fundPaid(id, description, amount, extra?: Partial<ExpenseView>): ExpenseView` (`payerId`/`createdById` `PIDS.M`, `mode 'equal'`, `shares []`, `meta { paidFromFund: true }`); `sportFundView(overrides?: Partial<TripView>): TripView` — `tripView()` with `trip.preset 'sport'`, Minh organiser, `fund { balance: 400000, added: 650000, spent: 250000, incomes }` where incomes are `i-1` 'Thu 2 khách vãng lai' 200000 (`createdAt 2026-10-26T10:00`), `i-2` 'Anh Minh donate quỹ' 300000 (`2026-10-25T10:00`), `i-3` 'Lan đóng quỹ' 150000 (`2026-10-24T10:00`), `i-4` 'Thu vãng lai (nhập trùng)' 100000 disabled, `disabledByName 'Minh'` (`2026-10-23T10:00`); expenses `e-f1` 'Nước sau trận' 150000 (`2026-10-26T11:00`), `e-f2` 'Hộp cầu mới' 100000 (`2026-10-25T09:00`), then `tripView().expenses`; `sportMemberView(): TripView` — the same with `me` = `{ kind: 'member', participantId: PIDS.A, participantPending: false, isOrganiser: false, isAdmin: false }`.
- Produces (icons): `Icon name="piggyBank"` (Lucide `piggy-bank` paths).
- Produces (i18n keys, `en` / `vi`; every `vi` line ends `// REVIEW`):

| Key | en | vi |
|---|---|---|
| `entry.tabs` | What are you adding? | Bạn đang thêm gì? |
| `entry.expense` | Expense | Chi tiêu |
| `entry.income` | Fund income | Quỹ thu |
| `fund.title` | Group fund | Quỹ nhóm |
| `fund.pillLabel` | Group fund, {amount} | Quỹ nhóm, {amount} |
| `fund.addTitle` | Add to fund | Thêm vào quỹ |
| `fund.editTitle` | Edit fund income | Sửa khoản thu quỹ |
| `fund.add` | Add to fund | Thêm vào quỹ |
| `fund.note` | Note | Ghi chú |
| `fund.notePlaceholder` | e.g. Thu 2 khách vãng lai | VD: Thu 2 khách vãng lai |
| `fund.keepAtLeast` | Keep at least {amount}: the rest is already spent. | Giữ ít nhất {amount}: phần còn lại đã được chi. |
| `fund.payerOption` | Group fund · {amount} | Quỹ nhóm · {amount} |
| `fund.paidTitle` | Paid from the group fund | Chi từ quỹ nhóm |
| `fund.noShares` | Nobody owes a share. | Không ai phải góp. |
| `fund.after` | Fund after this: {amount} | Quỹ còn lại: {amount} |
| `fund.overLimit` | The fund has only {amount}. Lower the amount or choose who paid. | Quỹ chỉ còn {amount}. Giảm số tiền hoặc chọn người trả. |
| `fund.rowIncome` | Added to fund · by {name} | Quỹ thu · {name} thêm |
| `fund.rowIncomeMe` | Added to fund · by you | Quỹ thu · bạn thêm |
| `fund.rowPaid` | Paid from group fund | Chi từ quỹ nhóm |
| `fund.added` | Added | Đã thu |
| `fund.spent` | Spent | Đã chi |
| `fund.keptBy` | Kept by the admins | Quản trị viên giữ |
| `fund.adminsOnly` | Only admins add or spend fund money. | Chỉ quản trị viên được thêm hoặc chi tiền quỹ. |
| `fund.emptyTitle` | The fund is empty right now. | Quỹ đang trống. |
| `fund.emptyBody` | Money added by walk-ins or gifts shows here. | Tiền khách vãng lai hoặc tài trợ sẽ hiện ở đây. |
| `fund.addedBy` | Added by | Người thêm |
| `fund.readOnly` | Only admins can change fund income. | Chỉ quản trị viên được sửa khoản thu quỹ. |
| `fund.cantDisable` | Can't disable: {amount} of this money is already spent. | Không thể tắt: {amount} trong khoản này đã được chi. |
| `fund.expenseNote` | Nobody owes a share. The money came out of the group fund. | Không ai phải góp. Tiền được chi từ quỹ nhóm. |
| `details.income` | Fund income | Khoản thu quỹ |
| `error.fundShort` | There isn't enough in the group fund for this. Check the fund and try again. | Quỹ nhóm không đủ cho khoản này. Kiểm tra quỹ rồi thử lại. |
| `activity.incomeAdded` | {actor} added {amount} to the fund · {description} | {actor} thêm {amount} vào quỹ · {description} |
| `activity.incomeEdited` | {actor} edited fund income · {description} · {amount} | {actor} sửa khoản thu quỹ · {description} · {amount} |
| `activity.incomeDisabled` | {actor} disabled fund income · {description} | {actor} tắt khoản thu quỹ · {description} |
| `activity.incomeEnabled` | {actor} enabled fund income · {description} | {actor} bật khoản thu quỹ · {description} |
| `activity.incomeRolledBack` | {actor} rolled back fund income · {description} | {actor} khôi phục khoản thu quỹ · {description} |
| `activity.fundExpenseAdded` | {actor} paid {amount} from the fund · {description} | {actor} chi {amount} từ quỹ · {description} |
| `activity.action.income_added` | added money to the fund | thêm tiền vào quỹ |
| `activity.action.income_edited` | edited fund income | sửa khoản thu quỹ |
| `activity.action.income_disabled` | disabled fund income | tắt khoản thu quỹ |
| `activity.action.income_enabled` | enabled fund income | bật khoản thu quỹ |
| `activity.action.income_rolled_back` | rolled back fund income | khôi phục khoản thu quỹ |

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/lib/__tests__/fund.test.ts
it('fundOf reads a missing fund as null', () => expect(fundOf(tripView())).toBeNull());
it('showFund needs a fund with history', () => {
  expect(showFund(sportFundView())).toBe(true);
  expect(showFund(sportFundView({ fund: { balance: 0, added: 0, spent: 0, incomes: [] }, expenses: tripView().expenses }))).toBe(false);
  expect(showFund(tripView())).toBe(false);
});
it('isFundAdmin: sport, admin, not archived', () => {
  expect(isFundAdmin(sportFundView())).toBe(true);
  expect(isFundAdmin(sportMemberView())).toBe(false);
  expect(isFundAdmin(sportFundView({ trip: { ...sportFundView().trip, archived: true } }))).toBe(false);
  expect(isFundAdmin(tripView())).toBe(false);
});
it('fundAvailable adds back the expense being edited', () => {
  const v = sportFundView();
  expect(fundAvailable(v)).toBe(400000);
  expect(fundAvailable(v, v.expenses[0])).toBe(550000);
  expect(fundAvailable(v, { ...v.expenses[0]!, status: 'disabled' })).toBe(400000);
});
it('incomeMinimum is what is already spent', () => {
  const v = sportFundView({ fund: { ...sportFundView().fund!, balance: 50000 } });
  expect(incomeMinimum(v, v.fund!.incomes[1]!)).toBe(250000);
  expect(incomeMinimum(v, v.fund!.incomes[3]!)).toBe(0);
});
it('mergeFeed: newest first across both lists; expenses without createdAt last', () => {
  const v = sportFundView();
  expect(mergeFeed(v.expenses, v.fund!.incomes).slice(0, 6).map((f) => f.item.id)).toEqual(['e-f1', 'i-1', 'i-2', 'e-f2', 'i-3', 'i-4']);
});

// apps/web/src/test/fund-foundations.test.tsx
it('Vietnamese still has exactly the English keys', () => expect(Object.keys(vi).sort()).toEqual(Object.keys(en).sort()));
it('new Vietnamese fund lines are marked for review', () => {
  const src = readFileSync(resolve(__dirname, '../i18n/vi.ts'), 'utf8');
  for (const key of ['entry.income', 'fund.title', 'fund.overLimit', 'error.fundShort']) {
    expect(src.split('\n').find((l) => l.includes(`'${key}'`))).toMatch(/\/\/ REVIEW$/);
  }
});
it('renders the piggyBank icon', () => { /* render <Icon name="piggyBank" />, expect an svg with path children */ });
it('InlineError explains FUND_SHORT', () => {
  renderAt(<InlineError error={{ code: 'FUND_SHORT' }} />);
  expect(screen.getByText("There isn't enough in the group fund for this. Check the fund and try again.")).toBeInTheDocument();
});
it('activity lines for income and fund-paid expenses', () => {
  const item = (action: ActivityAction, details: Record<string, unknown>) => ({ id: 'a', action, actorName: 'Minh', deviceShort: null, details, createdAt: '' });
  expect(activityLine(item('income_added', { description: 'Thu 2 khách vãng lai', amount: 200000 }), undefined, t)).toBe('Minh added 200.000₫ to the fund · Thu 2 khách vãng lai');
  expect(activityLine(item('expense_added', { description: 'Nước sau trận', amount: 150000, paidFromFund: true }), undefined, t)).toBe('Minh paid 150.000₫ from the fund · Nước sau trận');
  expect(activityLine(item('income_disabled', {}), undefined, t)).toBe('Minh disabled fund income');
});
```

- [ ] **Step 2: Run and see them fail**

Run: `npm test -w @fsl/web -- fund`
Expected: FAIL (modules and keys missing).

- [ ] **Step 3: Implement** the keys, icon, `InlineError` branch (`code === 'FUND_SHORT'` → `t('error.fundShort')`), the `activityText.ts` cases (income lines need `description`; edited also `amount`; `expense_added` with `details.paidFromFund === true` uses `activity.fundExpenseAdded`), `lib/fund.ts` and `fundFixtures.ts`.

- [ ] **Step 4: Run the web suite**

Run: `npm test -w @fsl/web && npm run typecheck -w @fsl/web`
Expected: all pass, including `scaffold.test.tsx`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/i18n apps/web/src/components/icons.tsx apps/web/src/components/InlineError.tsx apps/web/src/lib/activityText.ts apps/web/src/lib/fund.ts apps/web/src/lib/__tests__/fund.test.ts apps/web/src/test/fundFixtures.ts apps/web/src/test/fund-foundations.test.tsx
git commit -m "feat(web): group fund copy, icon, error, activity lines and view helpers"
```

---

### Task 6: Web — income details and routing

**Lane:** Screen (`IncomeDetails.tsx` + `.css`); Opus (routing in `TripRoute.tsx`, `DetailsPanel.tsx`, `detailsNav.ts`, `App.tsx`, and the fund-paid branch in `ExpenseDetails.tsx`).

**Files:**
- Create: `apps/web/src/components/IncomeDetails.tsx`, `apps/web/src/components/IncomeDetails.css`
- Modify: `apps/web/src/screens/TripRoute.tsx`, `apps/web/src/screens/DetailsPanel.tsx`, `apps/web/src/lib/detailsNav.ts`, `apps/web/src/App.tsx`, `apps/web/src/components/ExpenseDetails.tsx`
- Test: `apps/web/src/components/__tests__/income-details.test.tsx` (new)

**Interfaces:**
- Consumes: Task 5 (`fundOf`, `isFundAdmin`, keys, fixtures).
- Produces:
  - `Selection` gains `{ kind: 'income'; id: string }`; `selectionFrom` reads `incomeId`; `DetailsPage` title `t('details.income')`.
  - `useOpenDetails(tripId)` accepts `kind: 'expense' | 'payment' | 'income'` (`income` → `/t/:id/fund/:id`); `useDetailsSelection(...).open` accepts `'income'`.
  - Route `/t/:tripId/fund/:incomeId` → `<TripRoute />`.
  - `IncomeDetails({ view, incomeId, onClose }: { view: TripView; incomeId: string; onClose(): void })` — finds the income by `id`, `rootId` or a history `id`.
- Behaviour (spec §7.6, wireframe §5): admins (`isFundAdmin`) get Edit (navigate `/t/:id/fund/:incomeId/edit`), Disable or Enable (`useTripAction` `run('/fund/incomes/:id/disable' | '/enable')`), and Roll back per history item (`run('/fund/incomes/:id/rollback', { targetHistoryId })`). A `FUND_SHORT` from Disable shows `t('fund.cantDisable', { amount: formatVnd(income.amount − balance) })` under the buttons; other errors use `InlineError`. Non-admins see `t('fund.readOnly')` and no buttons. In `ExpenseDetails`, a fund-paid expense shows *Paid by* = `t('fund.title')`, "Added by {name} · {day}", and `t('fund.expenseNote')` in place of the split list.

- [ ] **Step 1: Write the failing tests**

```ts
const at = (id: string) => renderAt(<IncomeDetails view={v} incomeId={id} onClose={() => {}} />);
it('admin sees amount, date, added by, Edit and Disable', () => {
  v = sportFundView(); at('i-2');
  expect(screen.getByText('+300.000₫')).toBeInTheDocument();
  expect(screen.getByText(/Minh · /)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Edit/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Disable/ })).toBeInTheDocument();
});
it('FUND_SHORT on Disable says how much is already spent', async () => {
  v = sportFundView({ fund: { ...sportFundView().fund!, balance: 50000 } });
  mockApi({ 'POST /api/trips/t-1/fund/incomes/i-2/disable': () => Response.json({ error: { code: 'FUND_SHORT', message: '' } }, { status: 409 }) });
  at('i-2');
  await userEvent.click(screen.getByRole('button', { name: /Disable/ }));
  expect(await screen.findByText("Can't disable: 250.000₫ of this money is already spent.")).toBeInTheDocument();
});
it('Roll back posts the older version', async () => { /* income with history [{ id: 'i-0', amount: 200000, … }]; click "Roll back"; calls[0] body { targetHistoryId: 'i-0' } */ });
it('a disabled income offers Enable', () => { /* at('i-4') → button /Enable/, text 'Disabled' */ });
it('non-admins get a read-only page', () => { v = sportMemberView(); at('i-1'); expect(screen.getByText('Only admins can change fund income.')).toBeInTheDocument(); expect(screen.queryByRole('button', { name: /Edit/ })).toBeNull(); });
it('an unknown id shows not found', () => { /* at('nope') → the same EmptyState copy ExpenseDetails uses */ });
it('/t/t-1/fund/i-1 opens the income page', async () => {
  mockApi({ 'GET /api/trips/t-1': sportFundView() });
  renderAt(<TripRoute />, { route: '/t/t-1/fund/i-1', path: '/t/:tripId/fund/:incomeId' });
  expect(await screen.findByText('Fund income')).toBeInTheDocument();
  expect(screen.getByText('Thu 2 khách vãng lai')).toBeInTheDocument();
});
it('a fund-paid expense says Group fund paid and nobody owes a share', () => {
  renderAt(<ExpenseDetails view={sportFundView()} expenseId="e-f1" onClose={() => {}} />);
  expect(screen.getByText('Group fund')).toBeInTheDocument();
  expect(screen.getByText('Nobody owes a share. The money came out of the group fund.')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run and see them fail**

Run: `npm test -w @fsl/web -- income-details`
Expected: FAIL.

- [ ] **Step 3: Implement** the routing changes (Opus), then delegate `IncomeDetails` with a screen spec (wireframe §5 frames 1–2, spec §7.6, states §7.8), then the `ExpenseDetails` branch (Opus).

- [ ] **Step 4: Run the web suite**

Run: `npm test -w @fsl/web && npm run typecheck -w @fsl/web`
Expected: all pass, including the untouched `details.test.tsx` and `layout-switch.test.tsx`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/IncomeDetails.* apps/web/src/screens/TripRoute.tsx apps/web/src/screens/DetailsPanel.tsx apps/web/src/lib/detailsNav.ts apps/web/src/App.tsx apps/web/src/components/ExpenseDetails.tsx apps/web/src/components/__tests__/income-details.test.tsx
git commit -m "feat(web): fund income details and fund-paid expense details"
```

---

### Task 7: Web — the feed: income rows, fund-paid rows, row actions

**Lane:** Screen (`IncomeRow.tsx` + `.css`); Opus (`ExpenseList.tsx`, `ExpenseRow.tsx`, `rowActions.ts`, `UpdatedTransactionsBanner.tsx`, page wiring).

**Files:**
- Create: `apps/web/src/components/IncomeRow.tsx`, `apps/web/src/components/IncomeRow.css`
- Modify: `apps/web/src/components/ExpenseList.tsx`, `apps/web/src/components/ExpenseRow.tsx`, `apps/web/src/lib/rowActions.ts`, `apps/web/src/components/UpdatedTransactionsBanner.tsx`, `apps/web/src/screens/MemberTrip.tsx`, `apps/web/src/screens/GuestTrip.tsx`, `apps/web/src/screens/ViewOnlyTrip.tsx`
- Test: `apps/web/src/components/__tests__/fund-list.test.tsx` (new)

**Interfaces:**
- Consumes: Task 5 (`mergeFeed`, `fundOf`, `isFundAdmin`), Task 6 (`open('income', id)`).
- Produces:
  - `IncomeRow({ income, view }: { income: IncomeView; view: TripView })` — note; subline `fund.rowIncomeMe` when `addedById === me`, else `fund.rowIncome`; `+{formatVnd(amount)}` in `--color-success`, tabular, right-aligned; disabled: struck through, *Disabled* pill, `expenses.disabledBy`.
  - `ExpenseList` gains `onOpenIncome?(id: string): void`; renders `mergeFeed(...)`; *Mine* keeps income where `addedById` or `createdById` is me; the empty state shows only when there are no expenses and no income.
  - `incomeActions(view: TripView, income: IncomeView, deps: ActionDeps): RowAction[]` — `isFundAdmin(view)` → `edit` (navigate `/t/:id/fund/:incomeId/edit`) then `disable` (approved) or `enable` (disabled); otherwise `[]`.
  - `expenseActions` returns `[]` for a fund-paid expense unless `can(actor, 'manage_fund')`.
  - `rowAmount` returns `expense.amount` for a fund-paid expense; `ExpenseRow` shows `fund.rowPaid` as its subline and the amount with class `fsl-expense-row__amount--fund` (`--color-text-subtle`).
  - `UpdatedTransactionsBanner` ignores fund-paid expenses.
  - `MemberTrip`, `GuestTrip`, `ViewOnlyTrip` pass `onOpenIncome={(id) => open('income', id)}` (all three get `open` from `useDetailsSelection`).

- [ ] **Step 1: Write the failing tests**

```ts
const render = (view: TripView, onOpenIncome = vi.fn()) => renderAt(<ExpenseList view={view} onOpen={() => {}} onOpenIncome={onOpenIncome} />);
beforeEach(() => localStorage.setItem('fsl.expenses.mode', 'all'));

it('income rows: +amount and who added it', () => {
  render(sportFundView());
  const row = screen.getByText('Thu 2 khách vãng lai').closest('li')!;
  expect(within(row).getByText('+200.000₫')).toBeInTheDocument();
  expect(within(row).getByText('Added to fund · by you')).toBeInTheDocument();
});
it('a disabled income is struck through with Disabled by Minh', () => { /* row 'Thu vãng lai (nhập trùng)': 'Disabled', 'Disabled by Minh' */ });
it('fund-paid rows show the whole amount, muted, and Paid from group fund', () => {
  render(sportFundView());
  const row = screen.getByText('Nước sau trận').closest('li')!;
  expect(within(row).getByText('150.000₫')).toHaveClass('fsl-expense-row__amount--fund');
  expect(within(row).getByText('Paid from group fund')).toBeInTheDocument();
});
it('one feed, newest first', () => {
  render(sportFundView());
  const titles = screen.getAllByRole('listitem').map((li) => li.textContent);
  expect(titles.findIndex((t) => t!.includes('Nước sau trận'))).toBeLessThan(titles.findIndex((t) => t!.includes('Thu 2 khách vãng lai')));
  expect(titles.findIndex((t) => t!.includes('Thu 2 khách vãng lai'))).toBeLessThan(titles.findIndex((t) => t!.includes('Hộp cầu mới')));
});
it('income alone is enough to skip the empty state', () => {
  renderAt(<ExpenseList view={sportFundView({ expenses: [] })} onOpen={() => {}} add={<a href="/new">Add</a>} />);
  expect(screen.queryByText('Add the first expense')).toBeNull();
  expect(screen.getByText('Thu 2 khách vãng lai')).toBeInTheDocument();
});
it('Mine keeps income I added and drops income others added', () => { /* sportMemberView (An) in 'mine' mode: no 'Thu 2 khách vãng lai' */ });
it('tapping an income row opens it', async () => { const open = vi.fn(); render(sportFundView(), open); await userEvent.click(screen.getByText('Thu 2 khách vãng lai')); expect(open).toHaveBeenCalledWith('i-1'); });
it('renders as before when the view has no fund', () => {
  render(tripView());
  expect(screen.getAllByRole('listitem')).toHaveLength(4);
  expect(screen.queryByText(/Added to fund/)).toBeNull();
});
it('incomeActions: admins edit and disable or enable; others get nothing', () => {
  const v = sportFundView();
  const deps = { t, navigate: vi.fn(), run: vi.fn() };
  expect(incomeActions(v, v.fund!.incomes[0]!, deps).map((a) => a.id)).toEqual(['edit', 'disable']);
  expect(incomeActions(v, v.fund!.incomes[3]!, deps).map((a) => a.id)).toEqual(['edit', 'enable']);
  expect(incomeActions(sportMemberView(), v.fund!.incomes[0]!, deps)).toEqual([]);
});
it('expenseActions offers nothing on a fund-paid expense to a non-admin', () => {
  const v = sportMemberView();
  expect(expenseActions(v, { ...v.expenses[0]!, createdById: PIDS.A }, { t, navigate: vi.fn(), run: vi.fn() })).toEqual([]);
});
```

- [ ] **Step 2: Run and see them fail**

Run: `npm test -w @fsl/web -- fund-list`
Expected: FAIL.

- [ ] **Step 3: Implement** — delegate `IncomeRow` with a screen spec (wireframe §3 frames 1–2, spec §7.4), then the Opus edits.

- [ ] **Step 4: Run the web suite**

Run: `npm test -w @fsl/web && npm run typecheck -w @fsl/web`
Expected: all pass, including the untouched `expense-list.test.tsx`, `member-trip.test.tsx`, `guest-trip.test.tsx`, `expense-history-and-updates.test.tsx`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/IncomeRow.* apps/web/src/components/ExpenseList.tsx apps/web/src/components/ExpenseRow.tsx apps/web/src/lib/rowActions.ts apps/web/src/components/UpdatedTransactionsBanner.tsx apps/web/src/screens/MemberTrip.tsx apps/web/src/screens/GuestTrip.tsx apps/web/src/screens/ViewOnlyTrip.tsx apps/web/src/components/__tests__/fund-list.test.tsx
git commit -m "feat(web): fund income and fund-paid expenses in the expense feed"
```

---

### Task 8: Web — fund pill and sheet

**Lane:** Screen (`FundPill.tsx` + `.css`); Opus places it on the three pages.

**Files:**
- Create: `apps/web/src/components/FundPill.tsx`, `apps/web/src/components/FundPill.css`
- Modify: `apps/web/src/screens/MemberTrip.tsx`, `apps/web/src/screens/GuestTrip.tsx`, `apps/web/src/screens/ViewOnlyTrip.tsx`
- Test: `apps/web/src/components/__tests__/fund-pill.test.tsx` (new)

**Interfaces:**
- Consumes: Task 5 (`showFund`, `fundOf`, `isFundAdmin`, `piggyBank`, keys).
- Produces: `FundPill({ view }: { view: TripView })` — `null` unless `showFund(view)`. A 48px full-width `button` (accessible name `t('fund.pillLabel', { amount: formatVnd(balance) })`) on `--color-surface-muted`, no border or shadow; balance muted at 0, `--color-danger` below 0. Opens the existing `Sheet` titled `fund.title`: balance; `fund.added` `+{formatVnd(added)}`; `fund.spent` `{formatVnd(-spent)}`; `fund.keptBy` with the names of people where `isAdmin || isOrganiser`; footnote `fund.adminsOnly`; for `isFundAdmin(view)` a link *Add to fund* to `/t/:id/expenses/new?type=income`. At balance 0 the sheet shows `fund.emptyTitle` / `fund.emptyBody` instead of the Added/Spent rows. Placement: directly after the balance (or invite) card on `MemberTrip` and `GuestTrip` (inside the left column at ≥1024px); first on `ViewOnlyTrip`.

- [ ] **Step 1: Write the failing tests**

```ts
it('no pill in a trip group, or before any fund history', () => {
  renderAt(<FundPill view={tripView()} />);
  expect(screen.queryByRole('button', { name: /Group fund/ })).toBeNull();
});
it('admin: balance on the pill; sheet with Added, Spent, admins and Add to fund', async () => {
  renderAt(<FundPill view={sportFundView()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Group fund, 400.000₫' }));
  const sheet = screen.getByRole('dialog', { name: 'Group fund' });
  expect(within(sheet).getByText('+650.000₫')).toBeInTheDocument();
  expect(within(sheet).getByText('-250.000₫')).toBeInTheDocument();
  expect(within(sheet).getByText('Minh')).toBeInTheDocument();
  expect(within(sheet).getByRole('link', { name: 'Add to fund' })).toHaveAttribute('href', '/t/t-1/expenses/new?type=income');
});
it('others: the same sheet without the link', async () => { /* sportMemberView → no link, 'Only admins add or spend fund money.' present */ });
it('empty fund: the empty message', async () => { /* balance 0, added 200000, spent 200000 → 'The fund is empty right now.' */ });
it('sits under the balance on the member page and leads the view-only page', async () => {
  /* render MemberTrip with sportFundView and ViewOnlyTrip with { ...sportFundView(), me: viewer }: pill button present;
     on MemberTrip it follows the balance card in document order */
});
```

- [ ] **Step 2: Run and see them fail**

Run: `npm test -w @fsl/web -- fund-pill`
Expected: FAIL.

- [ ] **Step 3: Implement** — delegate `FundPill` with a screen spec (wireframe §3–4, spec §7.5), then place it (Opus).

- [ ] **Step 4: Run the web suite**

Run: `npm test -w @fsl/web && npm run typecheck -w @fsl/web`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/FundPill.* apps/web/src/screens/MemberTrip.tsx apps/web/src/screens/GuestTrip.tsx apps/web/src/screens/ViewOnlyTrip.tsx apps/web/src/components/__tests__/fund-pill.test.tsx
git commit -m "feat(web): group fund pill and sheet"
```

---

### Task 9: Web — Expense / Fund income switcher and the income form

**Lane:** Screen ×2 (`EntryTypeSwitch` + `.css`; `IncomeForm` + `.css`, one call each); Opus wires `ExpenseForm.tsx` and `App.tsx`.

**Files:**
- Create: `apps/web/src/components/EntryTypeSwitch.tsx`, `.css`; `apps/web/src/components/IncomeForm.tsx`, `.css`
- Modify: `apps/web/src/screens/ExpenseForm.tsx`, `apps/web/src/App.tsx`
- Test: `apps/web/src/screens/__tests__/income-form.test.tsx` (new)

**Interfaces:**
- Consumes: Task 5 (`isFundAdmin`, `incomeMinimum`, keys), Task 3 routes.
- Produces:
  - `EntryTypeSwitch({ value, onChange }: { value: 'expense' | 'income'; onChange(v: 'expense' | 'income'): void })` — `role="tablist"` labelled `entry.tabs`, two `role="tab"` buttons (`entry.expense`, `entry.income`), 44px, styled like the split picker track.
  - `IncomeForm({ view, tripId, income, switcher, leave }: { view: TripView; tripId: string; income?: IncomeView; switcher?: ReactNode; leave(): void })` — renders its own `Screen` (title `fund.addTitle` / `fund.editTitle`) with `switcher` above the fields: Amount (`expenseForm.amount`, 16px, `parseVnd`, the same preview and `expenseForm.amountInvalid` hint as the expense form), Date (`expenseForm.date`), Note (`fund.note`, placeholder `fund.notePlaceholder`, 1–80 after trim). Button `fund.add` / `expenseForm.save`, disabled until valid; when editing an approved income below `incomeMinimum`, shows `fund.keepAtLeast` and stays disabled. Submit: `apiSend('/api/trips/:id/fund/incomes', 'POST', { amount, spentOn, description }, tripId)` or `PATCH …/fund/incomes/:incomeId`; then invalidate `['trip', tripId]` and `leave()`. Errors through `InlineError` in the bottom bar.
  - `ExpenseFormContent` gains `switcher?: ReactNode`, rendered first in the form.
  - The `ExpenseForm` route component: reads `incomeId` (param) and `type` (search param). Switcher shows when `isFundAdmin(view)` and neither `expenseId` nor `incomeId` is set; changing it calls `setSearchParams` with `{ replace: true }`. `type=income` renders `IncomeForm` only when `isFundAdmin(view)`. With `incomeId`: an admin gets `IncomeForm` with that income (no switcher); anyone else gets `t('fund.readOnly')` and a Back button; an unknown id gets the existing `NOT_FOUND` error.
  - Route `/t/:tripId/fund/:incomeId/edit` → `<ExpenseForm />`.
  - While the trip loads, `type=income` and the income edit route show an income-shaped skeleton (amount, date, note, button) in place of the expense skeleton.

- [ ] **Step 1: Write the failing tests**

```ts
const newRoute = (q = '') => ({ route: `/t/t-1/expenses/new${q}`, path: '/t/:tripId/expenses/new' });
const editRoute = (id: string) => ({ route: `/t/t-1/fund/${id}/edit`, path: '/t/:tripId/fund/:incomeId/edit' });

it('admins in a sport group see the switcher; Fund income shows Amount, Date and Note', async () => {
  mockApi({ 'GET /api/trips/t-1': sportFundView() });
  renderAt(<ExpenseForm />, newRoute());
  await userEvent.click(await screen.findByRole('tab', { name: 'Fund income' }));
  expect(screen.getByRole('tab', { name: 'Fund income' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByLabelText('Note')).toBeInTheDocument();
  expect(screen.queryByText('Paid by')).toBeNull();
});
it('adds income', async () => {
  const { calls } = mockApi({ 'GET /api/trips/t-1': sportFundView(), 'POST /api/trips/t-1/fund/incomes': { incomeId: 'i-9' } });
  renderAt(<ExpenseForm />, newRoute('?type=income'));
  await userEvent.type(await screen.findByLabelText('Amount'), '200k');
  expect(screen.getAllByText('200.000₫').length).toBeGreaterThan(0);
  await userEvent.type(screen.getByLabelText('Note'), 'Thu 2 khách vãng lai');
  await userEvent.click(screen.getByRole('button', { name: 'Add to fund' }));
  await waitFor(() => expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ amount: 200000, spentOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), description: 'Thu 2 khách vãng lai' }));
});
it('an amount it cannot read keeps Add to fund disabled', async () => { /* type '2 trăm' → 'Enter an amount like 180.000, 50k or 1,5tr.'; button disabled */ });
it('editing below what is spent says Keep at least 250.000₫', async () => {
  mockApi({ 'GET /api/trips/t-1': sportFundView({ fund: { ...sportFundView().fund!, balance: 50000 } }) });
  renderAt(<ExpenseForm />, editRoute('i-2'));
  const amount = await screen.findByLabelText('Amount');
  await userEvent.clear(amount); await userEvent.type(amount, '200k');
  expect(screen.getByText('Keep at least 250.000₫: the rest is already spent.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  expect(screen.queryByRole('tablist')).toBeNull();
});
it('non-admin ?type=income gets the expense form', async () => {
  mockApi({ 'GET /api/trips/t-1': sportMemberView() });
  renderAt(<ExpenseForm />, newRoute('?type=income'));
  expect(await screen.findByText('Paid by')).toBeInTheDocument();
  expect(screen.queryByRole('tablist')).toBeNull();
});
it('income edit URL for a non-admin is read-only', async () => {
  mockApi({ 'GET /api/trips/t-1': sportMemberView() });
  renderAt(<ExpenseForm />, editRoute('i-1'));
  expect(await screen.findByText('Only admins can change fund income.')).toBeInTheDocument();
});
it('no switcher in a trip group or when editing an expense', async () => { /* tripView() new route → no tablist; sportFundView edit e-1 → no tablist */ });
```

- [ ] **Step 2: Run and see them fail**

Run: `npm test -w @fsl/web -- income-form`
Expected: FAIL.

- [ ] **Step 3: Implement** — delegate `EntryTypeSwitch`, then `IncomeForm` (screen specs from wireframe §1 and spec §7.2), then wire `ExpenseForm.tsx` and `App.tsx` (Opus).

- [ ] **Step 4: Run the web suite**

Run: `npm test -w @fsl/web && npm run typecheck -w @fsl/web`
Expected: all pass, including the untouched `expense-form*.test.tsx`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/EntryTypeSwitch.* apps/web/src/components/IncomeForm.* apps/web/src/screens/ExpenseForm.tsx apps/web/src/App.tsx apps/web/src/screens/__tests__/income-form.test.tsx
git commit -m "feat(web): add and edit fund income from the add screen"
```

---

### Task 10: Web — *Paid by: Group fund*

**Lane:** Screen (`FundPaidPanel` + `.css`); Opus (`ExpenseForm.tsx`: state, payer option, split swap, payload, gating).

**Files:**
- Create: `apps/web/src/components/FundPaidPanel.tsx`, `apps/web/src/components/FundPaidPanel.css`
- Modify: `apps/web/src/screens/ExpenseForm.tsx`
- Test: `apps/web/src/screens/__tests__/expense-form-fund.test.tsx` (new)

**Interfaces:**
- Consumes: Task 5 (`isFundAdmin`, `fundAvailable`, `isFundPaid`, keys), Task 4 API.
- Produces:
  - `FundPaidPanel({ available, amount }: { available: number; amount: number | null })` — `fund.paidTitle`, `fund.noShares`; `fund.after` with `formatVnd(available − amount)` when `amount !== null && amount <= available`; `fund.overLimit` with `formatVnd(available)` (danger) when `amount > available`.
  - In `ExpenseForm.tsx`: a module constant `FUND_PAYER = '__fund__'`; the *Paid by* select gets `<option value={FUND_PAYER}>{t('fund.payerOption', { amount: formatVnd(available) })}</option>` first when `isFundAdmin(view)` (or when editing a fund-paid expense, for an admin). Choosing it: the split section (`SplitBetween`, `SplitModePicker`, rows, sport rule section) is replaced by `FundPaidPanel`; a sport cost card turns into the plain Amount field, with `amountText` set from the sport total when one was typed; split state is kept, so choosing a person restores it. `canSubmit` with the fund: description valid, amount parsed, `amount <= fundAvailable(view, expense)`. Payload: `{ description, amount, spentOn, payerId: me, mode: 'equal', entries: [], meta: { paidFromFund: true } }`. A fund-paid expense opens with `FUND_PAYER` selected; editing one needs `edit_expense` and `can(actor, 'manage_fund')`, else the existing "not yours" screen.

- [ ] **Step 1: Write the failing tests**

```ts
const newRoute = { route: '/t/t-1/expenses/new', path: '/t/:tripId/expenses/new' };
const pickFund = async () => userEvent.selectOptions(await screen.findByLabelText('Paid by'), 'Group fund · 400.000₫');

it('admins get Group fund · 400.000₫ first in Paid by', async () => {
  mockApi({ 'GET /api/trips/t-1': sportFundView() });
  renderAt(<ExpenseForm />, newRoute);
  const options = within(await screen.findByLabelText('Paid by')).getAllByRole('option');
  expect(options[0]).toHaveTextContent('Group fund · 400.000₫');
});
it('choosing it swaps the split for the fund panel and saves a fund-paid body', async () => {
  const { calls } = mockApi({ 'GET /api/trips/t-1': sportFundView(), 'POST /api/trips/t-1/expenses': { expenseId: 'e-9' } });
  renderAt(<ExpenseForm />, newRoute);
  await pickFund();
  expect(screen.queryByRole('button', { name: /^Split between/ })).toBeNull();
  await userEvent.type(screen.getByLabelText('What for'), 'Nước sau trận');
  await userEvent.type(screen.getByLabelText('Amount'), '150k');
  expect(screen.getByText('Fund after this: 250.000₫')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Add expense' }));
  await waitFor(() => expect(calls.find((c) => c.method === 'POST')!.body).toMatchObject({ amount: 150000, payerId: PIDS.M, mode: 'equal', entries: [], meta: { paidFromFund: true } }));
});
it('over the fund: the message and Save disabled', async () => { /* 500k → 'The fund has only 400.000₫. Lower the amount or choose who paid.'; 'Add expense' disabled */ });
it('carries a typed sport total into Amount', async () => { /* type Court 150k in the sport card, pickFund → Amount field has value '150.000' */ });
it('choosing a person again restores the split and drops the fund flag', async () => {
  const { calls } = mockApi({ 'GET /api/trips/t-1': sportFundView(), 'POST /api/trips/t-1/expenses': { expenseId: 'e-9' } });
  renderAt(<ExpenseForm />, newRoute);
  await pickFund();
  await userEvent.selectOptions(screen.getByLabelText('Paid by'), 'Minh (me)');
  expect(screen.getByRole('button', { name: /^Split between/ })).toBeInTheDocument();
  /* fill and submit a normal expense → body.meta?.paidFromFund is undefined and entries is not empty */
});
it('editing a fund-paid expense at 0₫ balance still saves its own amount', async () => {
  mockApi({ 'GET /api/trips/t-1': sportFundView({ fund: { ...sportFundView().fund!, balance: 0 } }), 'PATCH /api/trips/t-1/expenses/e-f1': { expenseId: 'e-f9', rootId: 'e-f1' } });
  renderAt(<ExpenseForm />, { route: '/t/t-1/expenses/e-f1/edit', path: '/t/:tripId/expenses/:expenseId/edit' });
  expect(await screen.findByText('Fund after this: 0₫')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
});
it('no Group fund for a non-admin or in a trip group', async () => { /* sportMemberView and tripView → no option matching /Group fund/ */ });
it('a non-admin editing a fund-paid expense gets the not-yours screen', async () => { /* sportMemberView with e-f1 createdById PIDS.A → the existing not-yours copy */ });
```

- [ ] **Step 2: Run and see them fail**

Run: `npm test -w @fsl/web -- expense-form-fund`
Expected: FAIL.

- [ ] **Step 3: Implement** — delegate `FundPaidPanel` (wireframe §2 frames 2–3, spec §7.3), then the Opus edits.

- [ ] **Step 4: Run the web suite**

Run: `npm test -w @fsl/web && npm run typecheck -w @fsl/web`
Expected: all pass, including the untouched `expense-form*.test.tsx` and `sportExpense.test.tsx`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/FundPaidPanel.* apps/web/src/screens/ExpenseForm.tsx apps/web/src/screens/__tests__/expense-form-fund.test.tsx
git commit -m "feat(web): pay an expense from the group fund"
```

---

### Task 11: End to end, visual review, full run

**Lane:** Mechanical (the e2e spec); Opus (visual review and the full run).

**Files:**
- Create: `e2e/group-fund.spec.ts`

- [ ] **Step 1: Write the e2e spec** — copy the sign-in, consent and `englishContext` / `noSidewaysScroll` helpers' approach from `e2e/golden-path.spec.ts`:

```ts
test('an admin fills and spends the group fund', async ({ browser }) => {
  // test login 'e2e-fund-xanh' (name 'Xanh'); consent; New group → 'Sport group' → 'Cầu lông Thứ 5', add 'Lan'; create.
  // + Add → tab 'Fund income' → Amount '200k' → Note 'Thu 2 khách vãng lai' → 'Add to fund'.
  await expect(page.getByRole('button', { name: 'Group fund, 200.000₫' })).toBeVisible();
  // + Add → What for 'Nước sau trận' → Paid by 'Group fund · 200.000₫' → Amount '150k' → 'Add expense'.
  await expect(page.getByRole('button', { name: 'Group fund, 50.000₫' })).toBeVisible();
  await expect(page.getByText('Paid from group fund')).toBeVisible();
  await noSidewaysScroll(page);
});
```

- [ ] **Step 2: Run it**

Run: `npm run e2e -- --grep "group fund"`
Expected: PASS.

- [ ] **Step 3: Visual review** — with the dev server (`.claude/launch.json` or `npm run dev`), screenshot at 375px and 1280px: the add screen on both tabs, *Paid by: Group fund* (fits and over the limit), the member page with the pill and feed, the sheet (admin, other, empty), income details, fund-paid expense details. Score each with the `ui-ux-design-companion` §4 matrix; any score under 4, banned pattern, missing state or contrast failure goes back to its task. Check `document.documentElement.scrollWidth <= innerWidth` at 375px on each.

- [ ] **Step 4: Full run**

Run: `npm test && npm run typecheck && npm run e2e`
Expected: everything passes.

- [ ] **Step 5: Commit**

```bash
git add e2e/group-fund.spec.ts
git commit -m "test(e2e): fill and spend the group fund"
```
