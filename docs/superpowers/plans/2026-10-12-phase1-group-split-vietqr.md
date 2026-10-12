# Phase 1: Group Split & VietQR Settle-up — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A phone-first web app where a trip's expenses are split between signed-in members and link-only guests, and debts are settled with VietQR codes confirmed by hand.

**Architecture:** npm-workspaces monorepo with three parts:

- **`packages/core`:** all money, split, balance, transfer, name-matching, VietQR and permission logic, plus the API's shared types. Pure TypeScript with no I/O.
- **`apps/api`:** a single Cloudflare Worker (Hono, with D1 through Drizzle). It serves `/api/*` and the built web app as static assets.
- **`apps/web`:** a React + Vite PWA that talks only to `/api/*`.

**Tech Stack:**

| Area | Tools |
|---|---|
| Base | TypeScript, Node 24, npm workspaces, Vitest |
| Web | React 19, Vite, React Router, TanStack Query, vite-plugin-pwa, `qrcode`, Testing Library |
| API | Hono, Drizzle ORM + drizzle-kit, Cloudflare Workers + D1 + Wrangler, `@cloudflare/vitest-pool-workers`, `arctic` (Google OAuth) |
| End-to-end | Playwright |

**Spec:** `docs/superpowers/specs/2026-10-12-group-split-vietqr-design.md`. Read §4, §6 and §9 before any task. The mockups in `docs/superpowers/mockups/` (`v1-flow.html`, `v2-guest-expense.html`, `v3-who-are-you.html`) are the layout reference.

## Global Constraints

**Money**
- Integer VND đồng everywhere. Every stored amount has a `currency` column set to `'VND'`.
- `MAX_AMOUNT = 10_000_000_000`.
- Display format `1.245.000₫`: dot as thousands separator, `₫` suffix, no space. Negative amounts as `-385.000₫`.
- Balances: positive means the person is owed money; negative means they owe.

**Permissions and hosting**
- Google scopes are exactly `openid email profile`. No Gmail or Drive scopes.
- Cloudflare free plan only. No other runtime third-party services.
- The bank list and bank-app list are bundled snapshots, never fetched at runtime.

**Data writes**
- Every write to a trip goes through `commitTripWrite` (Task 7). That increments `trips.version` and inserts exactly one `activity` row.
- Status changes (approve, reject, confirm, disable, enable) use a conditional `UPDATE … WHERE status = <expected>`. If no row changed, return `409 ALREADY_HANDLED` and write nothing else.
- Error body: `{ "error": { "code": ApiErrorCode, "message": string } }`.

**Copy**
- This English copy is fixed by the spec; use it verbatim:
  - "This link no longer works. Ask the organiser for a new one."
  - "We combine everyone's debts so people make as few bank transfers as possible. What each person owes in total stays the same."
  - "Fewest transfers"
  - "Keep this note unchanged so the payment can be matched."
  - "{name}'s bank details are waiting for approval"
  - "{name} hasn't added bank details yet"
  - "{name} says it's paid. Did it arrive?"
  - "You picked this on this phone last time"
  - "Active on another phone · {ago}"
  - "We're over today's free limit. Try again after 07:00."
  - "No expenses yet. Add the first one."
  - "Disabled by {name}"
  - "Waiting for the money to reach {name}. This page updates by itself."
  - "I've already paid"
  - "Open my bank app"
  - "Save QR"
  - "Pay with VietQR"
  - "Send for approval"
  - "I'm someone new"
  - "Are you {name}?"
  - "Yes, I'm {name}"
  - "No, add me"
- Every English string has a Vietnamese equivalent in `apps/web/src/i18n/vi.ts`, drafted by the implementer. Each line carries a `// REVIEW` comment so the product owner can check it.
- The working app name is `APP_NAME = 'Finance Sheet Lover'`, defined in one place: `apps/web/src/config.ts`.

**UI and frontend process**
- Phone first: every screen works at 375px wide with no horizontal scroll.
- CSS custom-property tokens only: zinc neutrals, teal accent `#0f766e`, emerald for owed to you, rose for you owe, amber for waiting or needing action.
- `font-variant-numeric: tabular-nums` on every amount. No Tailwind.
- Frontend tasks (16–21) follow the `ui-ux-design-companion` skill §5. Write the screen spec first. Give every screen a loading skeleton, an empty state with one call to action, and inline error recovery. Review at 375px and 1280px.

**Dependencies**
- Install the latest stable versions at install time and save exact versions.
- Minimum versions: React 19, Hono 4, Wrangler 4, TypeScript 5.5.
- `@cloudflare/vitest-pool-workers` decides the Vitest version for `apps/api`.

## Review Focus

1. **Two people handle the same approval or payment at once.** The second request gets `409 ALREADY_HANDLED`, and nothing is counted twice. Tested in Task 12 (expense approve) and Task 14 (payment confirm).
2. **Amounts typed the Vietnamese way.** "1.245.000", "1 245 000", "50k" and "1,5tr" all parse; "12.5" does not. Tested in Task 1.
3. **A guest whose picked name was later merged reopens the link.** They land as the merged-into person. Tested in Task 9.
4. **Approving a guest expense that includes a name still waiting for approval.** Blocked with `409 PERSON_PENDING`. The approvals card tells the member to approve the name first. Tested in Task 12.
5. **Archived trip.** Every write returns `409 TRIP_ARCHIVED`. Reading still works through both links. Tested in Task 10.

---

## Core library (`packages/core`)

### Task 1: Repository setup and VND money helpers

**Files:**
- Create: `package.json`, `.gitignore`, `tsconfig.base.json`, `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/vitest.config.ts`, `packages/core/src/index.ts`, `packages/core/src/money.ts`
- Test: `packages/core/test/money.test.ts`

**Interfaces:**
- Produces:
  - `formatVnd(amount: number): string`
  - `parseVnd(input: string): number | null`
  - `MAX_AMOUNT: number`
  - All of these are re-exported from `@fsl/core`.

- [ ] **Step 1: Initialise git and the workspace.**
  - Run `git init`.
  - `.gitignore` lists `node_modules/ dist/ .wrangler/ .superpowers/ .dev.vars playwright-report/ test-results/`.
  - Commit `docs/` on `main` as "docs: phase 1 design and plan".
  - Run `git switch -c feat/phase1-group-split`.
  - Root `package.json` has `"private": true` and `"workspaces": ["packages/*", "apps/*"]`, with scripts `"test": "npm run test --workspaces --if-present"` and `"typecheck": "npm run typecheck --workspaces --if-present"`.
  - The core package is named `@fsl/core` with `"type": "module"` and `"exports": { ".": "./src/index.ts" }`. Consumers compile it from source, so there is no build step.

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { formatVnd, parseVnd } from '../src/money';

describe('formatVnd', () => {
  it('formats with dot groups and ₫', () => {
    expect(formatVnd(1245000)).toBe('1.245.000₫');
    expect(formatVnd(0)).toBe('0₫');
    expect(formatVnd(-385000)).toBe('-385.000₫');
  });
});

describe('parseVnd', () => {
  it.each([
    ['1.245.000', 1245000], ['1 245 000', 1245000], ['1,245,000', 1245000], ['1245000', 1245000],
    ['50k', 50000], ['1,5tr', 1500000], ['1.5tr', 1500000], ['  180.000 ', 180000],
  ])('parses %s', (input, expected) => expect(parseVnd(input)).toBe(expected));

  it.each(['12.5', 'abc', '', '0', '-5000', '10000000001', '1.2.3'])('rejects %s', (input) =>
    expect(parseVnd(input)).toBeNull());
});
```

- [ ] **Step 3: Run `npm test -w @fsl/core`.** Expected: FAIL (cannot resolve `../src/money`).

- [ ] **Step 4: Implement `formatVnd` and `parseVnd` in `packages/core/src/money.ts`.**
  - `formatVnd` groups digits by hand. Don't use `Intl`, because `vi-VN` inserts a non-breaking space before `₫`.
  - `parseVnd`:
    - With a `k` (×1,000) or `tr` (×1,000,000) suffix, one `,` or `.` is a decimal separator.
    - Without a suffix, `.`, `,` and spaces are accepted only as separators between groups of exactly three digits.
    - Return `null` unless the result is a positive integer no greater than `MAX_AMOUNT`.

- [ ] **Step 5: Run `npm test -w @fsl/core`.** Expected: PASS.

- [ ] **Step 6: Commit** with `git add -A && git commit -m "feat(core): workspace and VND money helpers"`.

### Task 2: Split computation (five modes, exact rounding)

**Files:**
- Create: `packages/core/src/split.ts`
- Test: `packages/core/test/split.test.ts`

**Interfaces:**
- Consumes: `MAX_AMOUNT`
- Produces:

```ts
export type SplitMode = 'equal' | 'amounts' | 'percent' | 'shares' | 'adjust';
export interface SplitEntry { participantId: string; value: number }
// value: equal → ignored (presence means included); amounts → đồng; percent → basis points (10000 = 100%);
// shares → weight × 100 (150 = 1.5 shares); adjust → đồng, may be negative
export type SplitError = 'NO_PARTICIPANTS' | 'INVALID_AMOUNT' | 'AMOUNTS_DONT_ADD_UP'
  | 'PERCENT_NOT_100' | 'SHARES_NOT_POSITIVE' | 'NEGATIVE_SHARE';
export type SplitResult =
  | { ok: true; shares: { participantId: string; amount: number }[] }
  | { ok: false; error: SplitError };
export function computeShares(total: number, mode: SplitMode, entries: SplitEntry[]): SplitResult;
```

Callers pass `entries` in the participants' trip order. Rounding ties go to the earlier entry.

- [ ] **Step 1: Write the failing test.** Use a helper `amounts(r)` that returns `r.shares.map(s => s.amount)`.

```ts
const e = (ids: string[], values: number[] = []) => ids.map((id, i) => ({ participantId: id, value: values[i] ?? 1 }));

it('equal, leftover đồng to earliest', () => expect(amounts(computeShares(100000, 'equal', e(['a','b','c'])))).toEqual([33334, 33333, 33333]));
it('equal homestay', () => expect(amounts(computeShares(3200000, 'equal', e(['a','b','c','d'])))).toEqual([800000, 800000, 800000, 800000]));
it('percent tie', () => expect(amounts(computeShares(100001, 'percent', e(['a','b'], [5000, 5000])))).toEqual([50001, 50000]));
it('percent must be 100', () => expect(computeShares(100, 'percent', e(['a','b','c'], [3333, 3333, 3333]))).toEqual({ ok: false, error: 'PERCENT_NOT_100' }));
it('shares largest remainder', () => expect(amounts(computeShares(1000, 'shares', e(['a','b'], [200, 100])))).toEqual([667, 333]));
it('shares 2/1/1', () => expect(amounts(computeShares(600000, 'shares', e(['a','b','c'], [200, 100, 100])))).toEqual([300000, 150000, 150000]));
it('shares positive', () => expect(computeShares(100, 'shares', e(['a','b'], [0, 100]))).toEqual({ ok: false, error: 'SHARES_NOT_POSITIVE' }));
it('amounts exact', () => expect(amounts(computeShares(80000, 'amounts', e(['a','b'], [50000, 30000])))).toEqual([50000, 30000]));
it('amounts must add up', () => expect(computeShares(80000, 'amounts', e(['a','b'], [50000, 20000]))).toEqual({ ok: false, error: 'AMOUNTS_DONT_ADD_UP' }));
it('adjust plus', () => expect(amounts(computeShares(180000, 'adjust', e(['a','b','c','d'], [20000, 0, 0, 0])))).toEqual([60000, 40000, 40000, 40000]));
it('adjust minus', () => expect(amounts(computeShares(100000, 'adjust', e(['a','b'], [-60000, 0])))).toEqual([20000, 80000]));
it('adjust negative share', () => expect(computeShares(100000, 'adjust', e(['a','b'], [-120000, 0]))).toEqual({ ok: false, error: 'NEGATIVE_SHARE' }));
it('invalid totals', () => {
  expect(computeShares(0, 'equal', e(['a']))).toEqual({ ok: false, error: 'INVALID_AMOUNT' });
  expect(computeShares(10_000_000_001, 'equal', e(['a']))).toEqual({ ok: false, error: 'INVALID_AMOUNT' });
  expect(computeShares(100, 'equal', [])).toEqual({ ok: false, error: 'NO_PARTICIPANTS' });
});
it('always sums to total (200 seeded random cases, all modes)', () => { /* seeded PRNG; assert sum === total for every ok result */ });
```

- [ ] **Step 2: Run `npm test -w @fsl/core -- split`.** Expected: FAIL.

- [ ] **Step 3: Implement `computeShares` in `packages/core/src/split.ts`.**
  - The exact share is `total × weight / Σweights`, using integer arithmetic (use `BigInt` for the products).
  - Floor each share, then hand out the leftover đồng one at a time, largest fractional remainder first. Compare remainders as integers; break ties by entry index.
  - Weights per mode:
    - equal: 1
    - percent: the basis points (must sum to 10000)
    - shares: the value
  - adjust: the pool is `total − Σadj`. Split it equally with the same rounding, then add each person's adjustment. Any result below 0 gives `NEGATIVE_SHARE`.
  - amounts: values must be ≥ 0 and add up to `total`.

- [ ] **Step 4: Run `npm test -w @fsl/core -- split`.** Expected: PASS.

- [ ] **Step 5: Commit** with message "feat(core): five split modes with exact rounding".

### Task 3: Balances, "Fewest transfers" and pairwise debts

**Files:**
- Create: `packages/core/src/balances.ts`, `packages/core/src/transfers.ts`
- Test: `packages/core/test/balances.test.ts`, `packages/core/test/transfers.test.ts`, `packages/core/test/fixtures.ts`

**Interfaces:**
- Produces:

```ts
export type ExpenseStatus = 'approved' | 'pending' | 'rejected' | 'disabled';
export type PaymentStatus = 'says_paid' | 'confirmed' | 'rejected' | 'disabled';
export interface LedgerExpense { id: string; payerId: string; amount: number; status: ExpenseStatus; createdById: string;
  shares: { participantId: string; amount: number }[] }
export interface LedgerPayment { id: string; fromId: string; toId: string; amount: number; status: PaymentStatus }
// LedgerPayment.amount = confirmed amount when confirmed, else claimed amount
export type Balances = Record<string, number>; // every id in `people` present; + owed, − owes
export interface BalanceOptions { includeSaysPaid?: boolean; includePendingCreatedBy?: string; ignorePayments?: boolean }
export function computeBalances(people: string[], expenses: LedgerExpense[], payments: LedgerPayment[], opts?: BalanceOptions): Balances;
export interface Transfer { fromId: string; toId: string; amount: number }
export function suggestTransfers(balances: Balances, order: string[], previous?: Transfer[]): Transfer[];
export function pairwiseTransfers(order: string[], expenses: LedgerExpense[], payments: LedgerPayment[]): Transfer[];
```

The rules:

- **Expenses that count:** only `approved` ones, plus `pending` ones whose `createdById === opts.includePendingCreatedBy`.
- **Payments that count:** only `confirmed` ones, plus `says_paid` ones when `includeSaysPaid` is set. `ignorePayments` skips payments entirely.
- **Effect of a payment:** the payer gets `+amount` and the receiver `−amount`.
- **`pairwiseTransfers`:**
  - Each approved share owed by someone other than the payer is a debt from that person to the payer.
  - Confirmed and `says_paid` payments reduce the debt between that pair.
  - Net each pair, drop zeros, and point each transfer in the direction of the net debt.

`suggestTransfers` works like this. The signature doesn't settle the algorithm, so this is it:

```text
remaining := copy(balances)
for t in previous (in order):                 // keep earlier pairs where they still balance (spec §9.5)
  if remaining[t.fromId] < 0 and remaining[t.toId] > 0:
    amt := min(-remaining[t.fromId], remaining[t.toId]); emit(t.fromId, t.toId, amt); apply
loop:
  d := most negative remaining (tie → earlier in `order`); c := most positive (tie → earlier)
  stop if none; amt := min(-remaining[d], remaining[c]); emit(d, c, amt); apply
```

- [ ] **Step 1: Write the fixtures and failing tests.**
  - `fixtures.ts` holds the mockup trip. People in order: `M` (Minh), `A` (An), `B` (Bình), `C` (Chi).
    - E1 homestay: M pays 3,200,000, equal split [M,A,B,C].
    - E2 lẩu: A pays 860,000, equal split across all four.
    - E3 motorbike: B pays 600,000, equal split across all four.
    - E4 coffee: M pays 240,000, equal split [M,A,C].
    - E5 (pending, created by C): C pays 180,000, equal split across all four.

```ts
expect(computeBalances(P, X, [])).toEqual({ M: 2195000, A: -385000, B: -565000, C: -1245000 });
expect(computeBalances(P, [...X, E5], [])).toEqual({ M: 2195000, A: -385000, B: -565000, C: -1245000 });
expect(computeBalances(P, [...X, E5], [], { includePendingCreatedBy: 'C' })).toMatchObject({ C: -1110000, M: 2150000 });
expect(computeBalances(P, [{ ...X[0], status: 'disabled' }, ...X.slice(1)], [])).toMatchObject({ M: -205000 });
const saysPaid = { id: 'p1', fromId: 'B', toId: 'M', amount: 565000, status: 'says_paid' as const };
expect(computeBalances(P, X, [saysPaid])).toMatchObject({ B: -565000, M: 2195000 });
expect(computeBalances(P, X, [saysPaid], { includeSaysPaid: true })).toMatchObject({ B: 0, M: 1630000 });
const confirmed = { ...saysPaid, status: 'confirmed' as const };
expect(computeBalances(P, X, [confirmed])).toMatchObject({ B: 0, M: 1630000 });
expect(computeBalances(P, X, [confirmed], { ignorePayments: true })).toMatchObject({ M: 2195000 });

const byKey = (ts: Transfer[]) => [...ts].sort((x, y) => (x.fromId + x.toId).localeCompare(y.fromId + y.toId));
expect(byKey(suggestTransfers(computeBalances(P, X, []), P)))
  .toEqual(byKey([{ fromId: 'C', toId: 'M', amount: 1245000 }, { fromId: 'B', toId: 'M', amount: 565000 }, { fromId: 'A', toId: 'M', amount: 385000 }]));
const tie = { M: 150, A: 150, B: -150, C: -150 };
expect(suggestTransfers(tie, P)).toEqual([{ fromId: 'B', toId: 'M', amount: 150 }, { fromId: 'C', toId: 'A', amount: 150 }]);
expect(suggestTransfers(tie, P, [{ fromId: 'B', toId: 'A', amount: 150 }, { fromId: 'C', toId: 'M', amount: 150 }]))
  .toEqual([{ fromId: 'B', toId: 'A', amount: 150 }, { fromId: 'C', toId: 'M', amount: 150 }]);
expect(byKey(pairwiseTransfers(P, X, []))).toEqual(byKey([
  { fromId: 'A', toId: 'M', amount: 665000 }, { fromId: 'B', toId: 'M', amount: 650000 }, { fromId: 'C', toId: 'M', amount: 880000 },
  { fromId: 'B', toId: 'A', amount: 65000 }, { fromId: 'C', toId: 'A', amount: 215000 }, { fromId: 'C', toId: 'B', amount: 150000 },
]));
// invariant (100 seeded random trips): applying suggestTransfers output to balances zeroes every balance
```

- [ ] **Step 2: Run `npm test -w @fsl/core -- balances transfers`.** Expected: FAIL.

- [ ] **Step 3: Implement** `computeBalances` in `balances.ts`, and `suggestTransfers` and `pairwiseTransfers` in `transfers.ts`, following the rules and algorithm above.

- [ ] **Step 4: Run the same command.** Expected: PASS.

- [ ] **Step 5: Commit** with message "feat(core): balances, fewest transfers with stability, pairwise debts".

### Task 4: Name normalising, similar-name check, autocomplete

**Files:**
- Create: `packages/core/src/names.ts`
- Test: `packages/core/test/names.test.ts`

**Interfaces:**
- Produces:

```ts
export function normalizeName(name: string): string;
export type MatchReason = 'same' | 'typo' | 'part';
export interface NameCandidate { id: string; name: string }
export function findSimilarNames(input: string, existing: NameCandidate[]): (NameCandidate & { reason: MatchReason })[];
export function suggestNames(prefix: string, existing: NameCandidate[]): NameCandidate[];
```

The rules:

- **`normalizeName`:** apply NFD, strip combining marks, map `đ`/`Đ` to `d`, lowercase, collapse whitespace, trim.
- **`findSimilarNames` match reasons** (all compared after normalising):
  - `same`: the names are equal.
  - `typo`: Levenshtein distance 1, with both names at least 3 characters.
  - `part`: every word of the shorter name is a word of the longer one, and the names aren't equal.
  - Results are ordered `same`, then `typo`, then `part`, then input order.
- **`suggestNames`:** names where any word starts with the normalised prefix. An empty prefix returns `[]`.

- [ ] **Step 1: Write the failing test**

```ts
expect(normalizeName('  Bình ')).toBe('binh');
expect(normalizeName('Đặng  Thị Chi')).toBe('dang thi chi');
expect(normalizeName('DŨNG')).toBe('dung');
expect(findSimilarNames('Binh', [{ id: '1', name: 'Bình' }, { id: '2', name: 'Chi' }])).toEqual([{ id: '1', name: 'Bình', reason: 'same' }]);
expect(findSimilarNames('Chii', [{ id: '1', name: 'Chi' }])[0].reason).toBe('typo');
expect(findSimilarNames('Chi Nguyễn', [{ id: '1', name: 'Chi' }])[0].reason).toBe('part');
expect(findSimilarNames('Minh', [{ id: '1', name: 'Minh Anh' }])[0].reason).toBe('part');
expect(findSimilarNames('An', [{ id: '1', name: 'Anh' }])).toEqual([]);
expect(findSimilarNames('Dung', [{ id: '1', name: 'Dũng' }, { id: '2', name: 'Dung' }]).map(m => m.id)).toEqual(['1', '2']);
expect(suggestNames('ng', [{ id: '1', name: 'Chi Nguyễn' }, { id: '2', name: 'An' }])).toEqual([{ id: '1', name: 'Chi Nguyễn' }]);
expect(suggestNames('', [{ id: '1', name: 'An' }])).toEqual([]);
```

- [ ] **Step 2: Run `npm test -w @fsl/core -- names`.** Expected: FAIL.

- [ ] **Step 3: Implement the three functions in `names.ts`.**

- [ ] **Step 4: Run the same command.** Expected: PASS.

- [ ] **Step 5: Commit** with message "feat(core): accent-insensitive name matching".

### Task 5: VietQR payload, transfer notes, reference codes, bank data

**Files:**
- Create: `packages/core/src/vietqr.ts`, `packages/core/src/refcode.ts`, `packages/core/src/banks.ts`, `packages/core/src/data/banks.json`, `packages/core/src/data/bank-apps.json`, `scripts/snapshot-vietqr-data.mjs`
- Test: `packages/core/test/vietqr.test.ts`

**Interfaces:**
- Consumes: `normalizeName` (Task 4)
- Produces:

```ts
export function crc16CcittFalse(s: string): string; // 4 uppercase hex chars
export interface VietQrInput { bin: string; accountNumber: string; amount: number; note: string }
export function buildVietQrPayload(input: VietQrInput): string;
export function toTransferNote(text: string): string; // ASCII uppercase [A-Z0-9 ], spaces collapsed, max 25 chars
export const REF_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export function makeRefCode(tripName: string, random: () => number): string;
export interface Bank { bin: string; shortName: string; name: string; code: string }
export const BANKS: Bank[];
export function findBank(bin: string): Bank | undefined;
export interface BankApp { appId: string; appName: string; autofill: boolean }
export const BANK_APPS: { android: BankApp[]; ios: BankApp[] };
export function bankAppLink(appId: string): string; // `https://dl.vietqr.io/pay?app=${appId}`
export const PREFILL_VERIFIED = false; // flip only after the spec §14 real-device check
```

**Payload layout.** Each field is an EMVCo TLV: id, then two-digit length, then value, in this order:

- `00`=`01`
- `01`=`12`
- `38`=[`00`=`A000000727`, `01`=[`00`=bin, `01`=account], `02`=`QRIBFTTA`]
- `53`=`704`
- `54`=amount
- `58`=`VN`
- `62`=[`08`=note]
- `6304` followed by the CRC of everything before it, including `6304`

**Reference code.** Take the first two words of `normalizeName(tripName)`, keep only `a–z0–9`, join them, uppercase, and cut to 6 characters (`TRIP` if empty). Then add a space and 4 characters from `REF_CODE_ALPHABET`, each picked by `random()`.

**Snapshot script.** It fetches `https://api.vietqr.io/v2/banks` (from `data[]`, keep `bin`, `shortName`, `name`, `code`), plus `/v2/android-app-deeplinks` and `/v2/ios-app-deeplinks` (from `apps[]`, keep `appId`, `appName`, and `autofill === 1`). It writes the two JSON files. Run it once and commit the output.

- [ ] **Step 1: Run `node scripts/snapshot-vietqr-data.mjs`** and check that both JSON files are written and are not empty.

- [ ] **Step 2: Write the failing test**

```ts
expect(crc16CcittFalse('123456789')).toBe('29B1');
expect(buildVietQrPayload({ bin: '970407', accountNumber: '19031234565678', amount: 1245000, note: 'DALAT C7K2' }))
  .toBe('00020101021238580010A000000727012800069704070114190312345656780208QRIBFTTA5303704540712450005802VN62140810DALAT C7K263046572');
expect(toTransferNote('Đà Lạt – chị Chi!')).toBe('DA LAT CHI CHI');
expect(toTransferNote('x'.repeat(40))).toHaveLength(25);
expect(makeRefCode('Đà Lạt · Oct 2026', () => 0)).toBe('DALAT 2222');
expect(makeRefCode('Phú Quốc 2027', () => 0)).toBe('PHUQUO 2222');
expect(makeRefCode('🎉', () => 0)).toBe('TRIP 2222');
expect(makeRefCode('Tết', () => 0.9999)).toBe('TET ZZZZ');
expect(findBank('970407')?.shortName).toBe('Techcombank');
expect(BANK_APPS.android.filter(a => a.autofill)).toHaveLength(5); // matches spec §9.3; update spec if the snapshot differs
expect(bankAppLink('vcb')).toBe('https://dl.vietqr.io/pay?app=vcb');
```

- [ ] **Step 3: Run `npm test -w @fsl/core -- vietqr`.** Expected: FAIL.

- [ ] **Step 4: Implement** `vietqr.ts`, `refcode.ts` and `banks.ts` (which imports the JSON).

- [ ] **Step 5: Run the same command.** Expected: PASS.

- [ ] **Step 6: Commit** with message "feat(core): VietQR payload, transfer notes, ref codes, bank snapshots".

### Task 6: Permissions and payment rules

**Files:**
- Create: `packages/core/src/permissions.ts`
- Test: `packages/core/test/permissions.test.ts`

**Interfaces:**
- Consumes: `ExpenseStatus`, `PaymentStatus` (Task 3)
- Produces:

```ts
export type ActorKind = 'member' | 'guest' | 'viewer';
export interface Actor { kind: ActorKind; participantId: string | null; participantPending: boolean; isOrganiser: boolean }
export type Action = 'view' | 'add_expense' | 'edit_expense' | 'delete_expense' | 'approve' | 'disable' | 'merge'
  | 'remove_person' | 'regenerate_links' | 'archive' | 'set_fewest' | 'set_own_bank' | 'record_payment' | 'view_bank';
export interface ActionContext { expenseCreatedById?: string; expenseStatus?: ExpenseStatus;
  paymentFromId?: string; paymentToId?: string; owesTo?: boolean }
export function can(actor: Actor, action: Action, ctx?: ActionContext): boolean;
export function initialExpenseStatus(actor: Actor): 'approved' | 'pending';
export function statusForNewPayment(a: { actorId: string; fromId: string; toId: string; receiverIsMember: boolean }): 'says_paid' | 'confirmed' | 'forbidden';
export function canConfirmPayment(actor: Actor, p: { toId: string; status: PaymentStatus }, receiverIsMember: boolean): boolean;
export type NotArrivedOutcome = 'reject' | 'flag' | 'forbidden';
export function notArrivedOutcome(actor: Actor, p: { toId: string; status: PaymentStatus }, receiverIsMember: boolean): NotArrivedOutcome;
```

Permission matrix, which is the source of truth for every API route:

| Action | Member | Guest (active name) | Guest (pending name) | Viewer |
|---|---|---|---|---|
| view | ✓ | ✓ | ✓ | ✓ |
| add_expense | ✓ (approved) | ✓ (pending) | ✓ (pending) | ✗ |
| edit_expense, delete_expense | any | own and `pending` only | own and `pending` only | ✗ |
| approve, disable, merge, remove_person, regenerate_links, set_fewest | ✓ | ✗ | ✗ | ✗ |
| archive | organiser only | ✗ | ✗ | ✗ |
| set_own_bank | ✓ | ✓ | ✗ | ✗ |
| record_payment | if payer or receiver | if payer or receiver | ✗ | ✗ |
| view_bank | if `ctx.owesTo` | if `ctx.owesTo` | ✗ | ✗ |

The payment rules:

- **`statusForNewPayment`:**
  - `forbidden` if the actor is neither payer nor receiver.
  - `says_paid` if the receiver is a member and the actor isn't the receiver.
  - Otherwise `confirmed`.
- **`canConfirmPayment`:** only the receiver, who must be a member, and only while the payment is `says_paid`.
- **`notArrivedOutcome`:** only the receiver may use it.
  - A member receiver on a `says_paid` payment gives `reject`.
  - A guest receiver on a `confirmed` payment gives `flag`.
  - Anything else gives `forbidden`.

- [ ] **Step 1: Write the failing test.** Make it table-driven over every row of the matrix above, plus these payment cases:

```ts
const s = (actorId: string, fromId: string, toId: string, receiverIsMember: boolean) => statusForNewPayment({ actorId, fromId, toId, receiverIsMember });
expect(s('C', 'C', 'M', true)).toBe('says_paid');   // guest → member, payer records
expect(s('M', 'C', 'M', true)).toBe('confirmed');   // member marks received
expect(s('M', 'M', 'C', false)).toBe('confirmed');  // member → guest, payer records
expect(s('C', 'M', 'C', false)).toBe('confirmed');  // receiving guest marks received
expect(s('A', 'A', 'C', false)).toBe('confirmed');  // guest → guest
expect(s('M', 'M', 'N', true)).toBe('says_paid');   // member → member, payer records
expect(s('N', 'M', 'N', true)).toBe('confirmed');
expect(s('B', 'A', 'M', true)).toBe('forbidden');
expect(notArrivedOutcome(member('M'), { toId: 'M', status: 'says_paid' }, true)).toBe('reject');
expect(notArrivedOutcome(guest('C'), { toId: 'C', status: 'confirmed' }, false)).toBe('flag');
expect(notArrivedOutcome(guest('A'), { toId: 'C', status: 'confirmed' }, false)).toBe('forbidden');
```

- [ ] **Step 2: Run `npm test -w @fsl/core -- permissions`.** Expected: FAIL.

- [ ] **Step 3: Implement `permissions.ts`.**

- [ ] **Step 4: Run the same command.** Expected: PASS.

- [ ] **Step 5: Commit** with message "feat(core): permission matrix and payment confirmation rules".

---

## API (`apps/api`)

### Task 7: Worker scaffold, schema, errors, write helper

**Files:**
- Create: `apps/api/package.json` (`@fsl/api`), `apps/api/wrangler.jsonc`, `apps/api/tsconfig.json`, `apps/api/drizzle.config.ts`, `apps/api/vitest.config.ts`, `apps/api/src/index.ts`, `apps/api/src/app.ts`, `apps/api/src/env.ts`, `apps/api/src/db/schema.ts`, `apps/api/src/db/client.ts`, `apps/api/src/lib/errors.ts`, `apps/api/src/lib/ids.ts`, `apps/api/src/lib/commit.ts`, `apps/api/migrations/0000_init.sql` (generated), `apps/api/test/setup.ts`, `apps/api/test/helpers.ts`, `packages/core/src/api-types.ts`
- Test: `apps/api/test/scaffold.test.ts`

**Interfaces:**
- Produces:
  - `createApp(): Hono<{ Bindings: Env; Variables: Vars }>` from `app.ts`. `index.ts` exports `{ fetch: app.fetch, scheduled }`.
  - `Env = { DB: D1Database; ASSETS: Fetcher; GOOGLE_CLIENT_ID: string; GOOGLE_CLIENT_SECRET: string; APP_ORIGIN: string; E2E_LOGIN?: string; OPS_ALERT_WEBHOOK_URL?: string; CF_API_TOKEN?: string; CF_ACCOUNT_ID?: string; TEST_MIGRATIONS?: D1Migration[] }`
  - In `@fsl/core` `api-types.ts`: `ApiErrorCode = 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'LINK_DEAD' | 'VALIDATION' | 'ALREADY_HANDLED' | 'PERSON_PENDING' | 'TRIP_ARCHIVED' | 'DAILY_LIMIT' | 'RATE_LIMITED' | 'INTERNAL'`
  - `class ApiError extends Error { constructor(public code: ApiErrorCode, public status: number, message?: string) }`
  - `newId(): string` (UUID), `newToken(): string` (32 random bytes, base64url), `sha256Hex(s: string): Promise<string>`
  - `getDb(env): DrizzleD1Database<typeof schema>`
  - `commitTripWrite(db, tripId: string, queries: BatchItem<'sqlite'>[], activity: { action: ActivityAction; actorParticipantId: string | null; actorUserId: string | null; actorDevice: string | null; details: Record<string, unknown> }): Promise<void>`. It runs `db.batch([...queries, bump trips.version, insert activity])`.
  - `ActivityAction`, exported from `api-types.ts`: `'trip_created' | 'expense_added' | 'expense_edited' | 'expense_deleted' | 'expense_approved' | 'expense_rejected' | 'expense_disabled' | 'expense_enabled' | 'name_added' | 'name_approved' | 'name_merged' | 'person_removed' | 'bank_submitted' | 'bank_approved' | 'bank_rejected' | 'payment_recorded' | 'payment_confirmed' | 'payment_not_arrived' | 'payment_disabled' | 'payment_enabled' | 'links_regenerated' | 'trip_archived' | 'fewest_changed' | 'membership_requested' | 'membership_approved' | 'membership_rejected'`
  - Test helpers in `test/helpers.ts`:
    - `makeMember(name)` returns `{ userId, cookie }` and inserts the user and session directly.
    - `makeTrip(cookie, body)` returns `{ tripId, groupToken, viewToken, ids: Record<string, string> }`.
    - `guest(groupToken)` returns the headers for a fresh device.

**Schema** (`schema.ts`; table and column names are fixed because later tasks query them):

- `users`(id pk, google_sub unique, email, name, consent_at null, created_at)
- `sessions`(id_hash pk, user_id, expires_at)
- `trips`(id pk, name, currency default 'VND', fewest_transfers int default 1, organiser_user_id, group_token unique, view_token unique, version int default 0, created_at, archived_at null)
- `participants`(id pk, trip_id, name, normalized_name, user_id null, status 'active'|'pending'|'merged', merged_into null, sort_order int, created_by_device null, created_at)
- `membership_requests`(id pk, trip_id, participant_id, user_id, status 'pending'|'approved'|'rejected', created_at)
- `devices`(id_hash pk, created_at, last_seen_at)
- `device_participants`(device_hash, trip_id, participant_id, last_used_at; pk(device_hash, trip_id))
- `bank_details`(id pk, user_id null, participant_id null, bin, account_number, holder_name, status 'pending'|'approved'|'replaced'|'rejected', approved_by_user_id null, consent_at, created_at)
- `expenses`(id pk, trip_id, description, amount int, currency, spent_on text 'YYYY-MM-DD', payer_id, split_mode, status, reject_reason null, disabled_by_user_id null, created_by_participant_id, created_by_device null, created_at, updated_at)
- `expense_shares`(expense_id, participant_id, input_value int, amount int; pk(expense_id, participant_id))
- `payment_refs`(code, trip_id, from_id, to_id, created_at; unique(trip_id, code))
- `payments`(id pk, trip_id, from_id, to_id, amount_claimed int, amount_confirmed int null, currency, status, not_arrived_at null, recorded_by_participant_id, recorded_by_device null, confirmed_by_participant_id null, created_at, updated_at)
- `activity`(id pk, trip_id, actor_participant_id null, actor_user_id null, actor_device null, action, details_json, created_at)
- `trip_views`(trip_id pk, version int, json text, updated_at)
- `ops_alerts`(day text, metric text; pk(day, metric))

Indexes on every `trip_id` column, plus `participants(trip_id, normalized_name)`.

**Configuration:**

- `wrangler.jsonc`:
  - a `d1_databases` binding named `DB` with `migrations_dir: "migrations"`
  - `assets: { directory: "../web/dist", binding: "ASSETS", not_found_handling: "single-page-application", run_worker_first: ["/api/*"] }`
  - `triggers.crons: ["0 * * * *"]`
- `vitest.config.ts` uses `defineWorkersConfig` and `readD1Migrations("./migrations")` into `TEST_MIGRATIONS`.
- `test/setup.ts` runs `applyD1Migrations(env.DB, env.TEST_MIGRATIONS)`.

- [ ] **Step 1: Write the failing tests.**
  - `GET /api/health` returns `200 {ok:true}`.
  - A test-only route that throws `new ApiError('VALIDATION', 400, 'x')` returns `400 {error:{code:'VALIDATION',message:'x'}}`. Register the route through `createApp()` inside the test.
  - A route that throws `new Error('D1_ERROR: free tier daily rows read limit exceeded')` returns `503` with code `DAILY_LIMIT`. Match `/limit/i` together with `/row|exceed/i`. The real message gets checked under §14.
  - A route that throws any other error returns `500` with code `INTERNAL`.
  - `commitTripWrite` with no queries raises `trips.version` by exactly 1 and inserts exactly 1 `activity` row with the given action.

- [ ] **Step 2: Run `npm test -w @fsl/api -- scaffold`.** Expected: FAIL.

- [ ] **Step 3: Implement the files listed above.** Generate the migration with `npx drizzle-kit generate` (`out: './migrations'`, dialect `sqlite`).

- [ ] **Step 4: Run `npm test -w @fsl/api -- scaffold`.** Expected: PASS.

- [ ] **Step 5: Commit** with message "feat(api): worker scaffold, schema, error mapping, trip write helper".

### Task 8: Google sign-in, sessions, consent

**Files:**
- Create: `apps/api/src/auth/google.ts`, `apps/api/src/auth/session.ts`, `apps/api/src/auth/routes.ts`
- Test: `apps/api/test/auth.test.ts`

**Interfaces:**
- Consumes: `createApp`, schema, `newToken`, `sha256Hex`
- Produces:
  - `getSessionUser(c): Promise<UserRow | null>`
  - middleware `requireUser`, which returns `401 UNAUTHENTICATED` when there is no session
  - routes:

| Route | Behaviour |
|---|---|
| `GET /api/auth/google/start?returnTo=` | 302 to Google with PKCE and state (cookies `oauth_state`, `oauth_verifier`: HttpOnly, Secure, SameSite=Lax, 10 min). `returnTo` must start with `/` and not `//`; otherwise use `/trips`. |
| `GET /api/auth/google/callback` | Check the state, exchange the code (arctic `Google`), decode the id_token (`sub`, `email`, `name`), upsert by `google_sub`, set cookie `sid` (30 days; the DB stores the sha256), 302 to `returnTo` |
| `POST /api/auth/logout` | Delete the session and clear the cookie; 204 |
| `GET /api/me` | `{ user: { id, email, name, consentAt } \| null }` |
| `POST /api/me/consent` | `requireUser`; set `consent_at`; 204 |

- [ ] **Step 1: Write the failing tests.** Use `fetchMock` from `cloudflare:test` for `https://oauth2.googleapis.com/token`, returning an unsigned JWT `id_token`.
  - `start` returns 302. The Location host is `accounts.google.com` and the `scope` param equals `openid email profile`.
  - `callback` with the matching state returns 302 to `returnTo` and sets a `sid` cookie. A second login with the same `sub` reuses the same user id.
  - A wrong state returns `400 VALIDATION`.
  - `returnTo=//evil.com` redirects to `/trips`.
  - `/api/me` with a session returns the user. After logout it returns `{user:null}`, and with an expired session it also returns `{user:null}`.
  - Consent sets `consentAt`.

- [ ] **Step 2: Run `npm test -w @fsl/api -- auth`.** Expected: FAIL.

- [ ] **Step 3: Implement the three files and mount the routes in `createApp`.**

- [ ] **Step 4: Run the same command.** Expected: PASS.

- [ ] **Step 5: Commit** with message "feat(api): Google sign-in, sessions, consent".

### Task 9: Devices, link tokens, actor resolution

**Files:**
- Create: `apps/api/src/access/device.ts`, `apps/api/src/access/actor.ts`, `apps/api/src/access/routes.ts`
- Test: `apps/api/test/access.test.ts`

**Interfaces:**
- Consumes: `getSessionUser`, `Actor` (core), schema
- Produces:
  - **`deviceMiddleware`:**
    - Reads the `did` cookie. If it's missing, accepts header `X-Device-Restore` (at most 64 chars); otherwise creates `newToken()`.
    - Sets cookie `did` (HttpOnly, Secure, SameSite=Lax, 400 days).
    - Inserts the sha256 into `devices` if new.
    - Updates `last_seen_at` only when it is older than 1 hour.
    - Sets `c.var.deviceHash`.
    - Sends response header `X-Device-Id` only when the device was just created.
  - **`resolveActor(c, tripId): Promise<ResolvedActor>`**, where `ResolvedActor = Actor & { userId: string | null; deviceHash: string; trip: TripRow }`. It checks in this order:
    1. Trip missing: `404 NOT_FOUND`.
    2. A session user linked to an `active` participant: `member` (`isOrganiser` from `organiser_user_id`).
    3. Header `X-Link-Token`:
       - equals `group_token`: `guest`. The `participantId` comes from `device_participants`, following the `merged_into` chain to the end. `participantPending` is true when that participant is `pending`.
       - equals `view_token`: `viewer`.
       - any other non-empty value: `410 LINK_DEAD`.
    4. Otherwise: `403 FORBIDDEN`.
  - **`assertWritable(trip)`:** `409 TRIP_ARCHIVED` when `archived_at` is set.
  - **`GET /api/links/:token`:** returns `{ tripId, tripName, access: 'group' | 'view' }`, or `410 LINK_DEAD`.

- [ ] **Step 1: Write the failing tests.**
  - The first request sets `did` and `X-Device-Id`. A repeat with the cookie adds no new `devices` row.
  - `X-Device-Restore` with a known id and no cookie re-sets the same id and adds no new row.
  - Links: the group token gives `group`, the view token gives `view`, and a random token gives 410 `LINK_DEAD`.
  - Using a test route that returns `resolveActor`:
    - a member session gives `member`
    - a non-member session plus the group token gives `guest`
    - the view token gives `viewer`
    - an old token after regeneration (by setting the token column directly) gives 410
  - **Review Focus 3:** a device picked P1, then P1 is merged into P2 (set `status='merged', merged_into=P2` directly). The resolved `participantId` is P2.

- [ ] **Step 2: Run `npm test -w @fsl/api -- access`.** Expected: FAIL.

- [ ] **Step 3: Implement the files, and apply `deviceMiddleware` to `/api/*`.**

- [ ] **Step 4: Run the same command.** Expected: PASS.

- [ ] **Step 5: Commit** with message "feat(api): device identity, link tokens, actor resolution".

### Task 10: Trips, cached trip view, version check, links, archive, activity

**Files:**
- Create: `apps/api/src/trips/routes.ts`, `apps/api/src/trips/snapshot.ts`, `apps/api/src/trips/view.ts`
- Modify: `packages/core/src/api-types.ts` (add the types below)
- Test: `apps/api/test/trips.test.ts`

**Interfaces:**
- Consumes: `resolveActor`, `assertWritable`, `commitTripWrite`, `can`, `computeBalances`, `suggestTransfers`, `pairwiseTransfers`, `findSimilarNames`
- Produces (types in `api-types.ts`):

```ts
export interface PersonView { id: string; name: string; status: 'active' | 'pending'; isMember: boolean; bank: 'none' | 'pending' | 'approved' }
export interface ExpenseView { id: string; description: string; amount: number; spentOn: string; payerId: string; mode: SplitMode;
  status: ExpenseStatus; rejectReason: string | null; disabledByName: string | null; createdById: string;
  shares: { participantId: string; amount: number; inputValue: number }[] }
export interface PaymentView { id: string; fromId: string; toId: string; amountClaimed: number; amountConfirmed: number | null;
  status: PaymentStatus; notArrived: boolean; createdAt: string }
export type Approval =
  | { kind: 'expense'; expenseId: string }
  | { kind: 'name'; participantId: string; matches: (NameCandidate & { reason: MatchReason })[] }
  | { kind: 'bank'; bankId: string; participantId: string; bankName: string; accountNumber: string; holderName: string }
  | { kind: 'payment'; paymentId: string }
  | { kind: 'not_arrived'; paymentId: string }
  | { kind: 'membership'; requestId: string; participantId: string; userName: string; userEmail: string };
export interface TripView {
  trip: { id: string; name: string; currency: 'VND'; fewestTransfers: boolean; archived: boolean; version: number; total: number };
  me: { kind: ActorKind; participantId: string | null; participantPending: boolean; isOrganiser: boolean };
  people: PersonView[]; balances: Balances; suggestions: Transfer[]; expenses: ExpenseView[]; payments: PaymentView[];
  myBalance: { now: number; beforePayments: number; ifPendingApproved: number | null; waitingConfirm: number } | null;
  approvals: Approval[];                          // [] unless member
  links: { group: string; view: string } | null;  // members only
}
export interface TripListItem { id: string; name: string; archived: boolean; myBalance: number }
export interface ActivityItem { id: string; action: ActivityAction; actorName: string | null; deviceShort: string | null;
  details: Record<string, unknown>; createdAt: string }
```

**Routes:**

| Route | Who | Behaviour |
|---|---|---|
| `POST /api/trips` `{ name, myName, people: string[], myBank?: { bin, accountNumber, holderName } }` | signed in, consent given | Creates the trip with two `newToken()` links, the organiser participant (user-linked, sort 0) and the other people (active, sort 1..n). `myBank` is saved as approved user-owned bank details. 201 `{ tripId }` |
| `GET /api/trips` | signed in | `TripListItem[]` |
| `GET /api/trips/:id` | any actor | `TripView` |
| `GET /api/trips/:id/version` | any actor | `{ version }` |
| `PATCH /api/trips/:id` `{ fewestTransfers }` | `set_fewest` | 204 |
| `POST /api/trips/:id/links/regenerate` `{ which: 'group' \| 'view' }` | `regenerate_links` | `{ group, view }` |
| `POST /api/trips/:id/archive` | `archive` | 204 |
| `GET /api/trips/:id/activity?before=` | member or guest | `ActivityItem[]`, newest first, 50 per page |

**Snapshot and view:**

- **`getSnapshot(db, trip)`:**
  - If `trip_views.version === trips.version`, return the cached JSON.
  - Otherwise rebuild it from all trip rows:
    - `balances` uses official rules.
    - `suggestions` use `includeSaysPaid` balances. Use `suggestTransfers(…, previous)` with the previous suggestions from the stale cache row when `fewest_transfers`, otherwise `pairwiseTransfers`.
    - `total` is the sum of approved expenses.
  - Upsert the cache row.
- **`toTripView(snapshot, actor, extras)`** adds the per-actor fields:
  - `myBalance`:
    - `beforePayments` uses `ignorePayments`.
    - `ifPendingApproved` is set only for a guest with their own pending expenses.
    - `waitingConfirm` is the sum of `says_paid` amounts the actor has paid.
  - Approvals for members.
  - Links for members.
  - A viewer's JSON never contains a bank account number.
- Every write route calls `assertWritable` first.

- [ ] **Step 1: Write the failing tests.** Use helpers to insert the Task 3 fixture expenses through the database.
  - The organiser's view has people in order `Minh, An, Bình, Chi`, `me.kind='member'`, `links` not null, and `trip.total` of 4,900,000. `balances` and `suggestions` match the Task 3 fixtures.
  - `PATCH fewestTransfers:false` makes `suggestions` equal the pairwise fixture, and `version` goes up by 1.
  - `/version` equals `view.trip.version`.
  - A guest view has `links===null` and `approvals` equal to `[]`. A viewer view never contains the string `'19031234565678'` (insert the bank details first).
  - Two GETs with no write in between leave `trip_views.updated_at` unchanged.
  - **Review Focus 5:**
    - Archiving as a non-organiser member returns 403; as the organiser it returns 204.
    - After archiving, `PATCH fewestTransfers` returns `409 TRIP_ARCHIVED`, and GETs through the group and view links still return 200.
  - Regenerating the `group` link makes the old token return 410.
  - The activity list starts with `trip_created`.

- [ ] **Step 2: Run `npm test -w @fsl/api -- trips`.** Expected: FAIL.

- [ ] **Step 3: Implement** `snapshot.ts`, `view.ts` and `routes.ts`.

- [ ] **Step 4: Run the same command.** Expected: PASS.

- [ ] **Step 5: Commit** with message "feat(api): trips, cached trip view, version polling, links, archive, activity".

### Task 11: People: picking, new names, approvals, merging, membership

**Files:**
- Create: `apps/api/src/participants/routes.ts`, `apps/api/src/participants/merge.ts`
- Modify: `packages/core/src/api-types.ts` (add `PickerView`)
- Test: `apps/api/test/participants.test.ts`

**Interfaces:**
- Consumes: `resolveActor`, `commitTripWrite`, `can`, `findSimilarNames`, `normalizeName`
- Produces:
  - `PickerView = { people: { id: string; name: string; status: 'active' | 'pending'; isMember: boolean; lastUsedHere: boolean; activeElsewhere: string | null }[]; myPick: string | null }`
  - `activeElsewhere` is the latest `last_used_at` from another device within the last 24 hours, as ISO, or `null`.
  - `mergeParticipants(db, tripId, fromId, intoId, actor): Promise<void>`

**Routes** (all under `/api/trips/:id`):

| Route | Who | Behaviour |
|---|---|---|
| `GET people/picker` | guest, member | `PickerView` |
| `POST people/pick` `{ participantId }` | guest | The target must be an active or pending participant with no linked user, otherwise `403` (message "Sign in to continue as {name}"). Upsert `device_participants`. |
| `POST people/check-name` `{ name }` | guest, member | `{ matches }`, with no write |
| `POST people` `{ name, confirmNew }` | guest, member | If there are matches and `!confirmNew`: `422 VALIDATION`. A guest's new name is `pending` and auto-picked; a member's is `active`. A device may hold at most 3 pending names per trip: `429 RATE_LIMITED`. |
| `POST people/:pid/approve` `{ sameAs? }` | `approve` | `pending` becomes `active`, or merges into `sameAs`. Not pending: `409 ALREADY_HANDLED`. |
| `POST people/merge` `{ fromId, intoId }` | `merge` | `mergeParticipants` |
| `DELETE people/:pid` | `remove_person` | Only when the person has no expenses, shares or payments; otherwise `409 VALIDATION` with message "Use merge instead". |
| `POST membership` `{ participantId }` | signed-in user acting as guest | Creates a `membership_requests` row with status `pending` |
| `POST membership/:rid/approve` and `/reject` | `approve` | Approve sets `participants.user_id` |

**`mergeParticipants` rules** (one `commitTripWrite`, activity `name_merged`):

- If both people are linked to different users: `409 VALIDATION`. If only `from` is linked, move the link to `into`.
- Re-point `expenses.payer_id`.
- `expense_shares`: if an expense has both people, add `from`'s amount into `into`, delete `from`'s row, and set that expense to `split_mode='amounts'` with every `input_value = amount`. Otherwise re-point.
- Re-point `payments`. A payment whose `from` equals its `to` after the merge becomes `disabled`.
- Re-point `payment_refs` (keep their codes), `device_participants` and `membership_requests`.
- Participant-owned `bank_details`: keep `into`'s approved details; if `into` has none, re-point `from`'s.
- Set `from` to `status='merged'` and `merged_into=into`.

- [ ] **Step 1: Write the failing tests.**
  - The picker lists the 4 names and marks Minh as `isMember`. A guest picking Minh gets 403.
  - Device 1 picks Chi. Device 2 picks Chi. Device 1's picker shows Chi with `activeElsewhere` not null and `lastUsedHere: true`.
  - `check-name 'Binh'` returns Bình with reason `same`.
  - `POST people 'Binh'` without `confirmNew` returns 422; with it, a pending person is created. A fourth pending name from the same device returns 429.
  - Approving pending "Chi Nguyễn" with `sameAs: Chi` merges them, and Chi Nguyễn's pending expense now belongs to Chi. Approving again returns 409.
  - Merging two people who share an expense leaves one share with the summed amount and `split_mode='amounts'`. The expense total is unchanged, and everyone else's balance is unchanged.
  - Deleting a person with expenses returns 409; without expenses it returns 204.
  - Membership: a signed-in guest requests, a member approves, and that user's `resolveActor` now returns `member`.

- [ ] **Step 2: Run `npm test -w @fsl/api -- participants`.** Expected: FAIL.

- [ ] **Step 3: Implement the routes and `merge.ts`.**

- [ ] **Step 4: Run the same command.** Expected: PASS.

- [ ] **Step 5: Commit** with message "feat(api): name picking, new-name approval, merge, membership".

### Task 12: Expenses

**Files:**
- Create: `apps/api/src/expenses/routes.ts`
- Test: `apps/api/test/expenses.test.ts`

**Interfaces:**
- Consumes: `computeShares`, `can`, `initialExpenseStatus`, `commitTripWrite`, `assertWritable`
- Produces: the routes below. The body for create and edit is `ExpenseInput = { description: string /* 1–80 */; amount: number; spentOn: string /* YYYY-MM-DD */; payerId: string; mode: SplitMode; entries: SplitEntry[] }`, exported from `api-types.ts`.

| Route | Check | Behaviour |
|---|---|---|
| `POST /api/trips/:id/expenses` | `add_expense` | All referenced people must belong to the trip and not be merged. A split error gives `422 VALIDATION` with the `SplitError` as the message. Status comes from `initialExpenseStatus`. A trip may hold at most 50 pending expenses from guests: `429 RATE_LIMITED`. |
| `PATCH /api/trips/:id/expenses/:eid` | `edit_expense` | Recompute the shares |
| `DELETE /api/trips/:id/expenses/:eid` | `delete_expense` | Hard delete. The activity `details` keeps a snapshot of the expense. |
| `POST …/:eid/approve` | `approve` | A conditional update from `pending`. If the payer or any share belongs to a pending person: `409 PERSON_PENDING`. |
| `POST …/:eid/reject` `{ reason: 1–140 chars }` | `approve` | From `pending` |
| `POST …/:eid/disable` | `disable` | From `approved` or `pending`; sets `disabled_by_user_id` |
| `POST …/:eid/enable` | `disable` | From `disabled` to `approved` |

- [ ] **Step 1: Write the failing tests** (mockup trip; Minh is the member, the others are guests).
  - A member's expense is approved and changes balances.
  - A guest's 180,000 expense split equally four ways is pending. Balances don't change, and the guest's view has `myBalance.ifPendingApproved === -1110000`.
  - A split that doesn't add up returns 422 with message `AMOUNTS_DONT_ADD_UP`.
  - A guest editing their own pending expense gets 200. A guest editing an approved expense, or someone else's, gets 403.
  - **Review Focus 1:** two `approve` requests fired with `Promise.all` return one 200 and one `409 ALREADY_HANDLED`. The `activity` table gains exactly one `expense_approved` row.
  - **Review Focus 4:** approving an expense that includes a pending person returns `409 PERSON_PENDING`.
  - Reject stores the reason, and the guest's view shows it.
  - After disable, the expense is left out of balances and `disabledByName === 'Minh'`. After enable, balances are restored.
  - A viewer POST returns 403.

- [ ] **Step 2: Run `npm test -w @fsl/api -- expenses`.** Expected: FAIL.

- [ ] **Step 3: Implement `routes.ts`.**

- [ ] **Step 4: Run the same command.** Expected: PASS.

- [ ] **Step 5: Commit** with message "feat(api): expenses with approval, rejection, disable".

### Task 13: Bank details and pay info

**Files:**
- Create: `apps/api/src/bank/routes.ts`
- Modify: `packages/core/src/api-types.ts` (add `PayInfo`, `BankInput`)
- Test: `apps/api/test/bank.test.ts`

**Interfaces:**
- Consumes: `findBank`, `buildVietQrPayload`, `makeRefCode`, `toTransferNote`, `can`, snapshot suggestions
- Produces:
  - `BankInput = { bin: string; accountNumber: string /* 6–19 digits */; holderName: string /* 1–50 */; consent: true }`
  - `PayInfo = { to: { id: string; name: string }; amount: number; bankState: 'ok' | 'none' | 'pending'; bank: { bin: string; bankName: string; accountNumber: string; accountNumberMasked: string; holderName: string } | null; refCode: string; payload: string | null; inFlight: PaymentView[] }`

| Route | Check | Behaviour |
|---|---|---|
| `PUT /api/me/bank` | signed in | Validate with `findBank`. `holderName` goes through `toTransferNote` without the 25-character cut. Saved as approved user-owned details; the previous approved row becomes `replaced`. Sets `consent_at`. |
| `PUT /api/trips/:id/bank` | `set_own_bank` | Guest: inserts a `pending` row for their participant (the previous approved row stays in use). Member: same as `/api/me/bank`. |
| `POST /api/trips/:id/bank/:bid/approve` and `/reject` | `approve` | Conditional update from `pending`. Approving moves the previous approved row to `replaced`. |
| `GET /api/trips/:id/pay/:toId` | `view_bank` with `owesTo` | `owesTo` is true when the actor has a current suggestion to `toId`, or the actor is `toId`. `amount` is that suggestion's amount (0 for self). The `refCode` comes from `payment_refs` for (trip, actor, toId); create it if missing with `makeRefCode(trip.name, Math.random)` and retry up to 5 times on a unique conflict. `payload` is set only when `bankState === 'ok'`. `accountNumberMasked` is the first 4 digits, then ` •••• `, then the last 4. |

- [ ] **Step 1: Write the failing tests.**
  - A guest submits bank details and they are pending. The pay info for someone who owes that guest has `bankState:'pending'` and `payload:null`.
  - A member approves. The pay info now has `bankState:'ok'`, and `payload` equals `buildVietQrPayload({ bin, accountNumber, amount, note: refCode })`.
  - The guest changes their bank details. The pay info still uses the previous approved account.
  - An unknown `bin` returns 422.
  - An actor who doesn't owe `toId` gets 403, and a viewer gets 403.
  - `refCode` is the same across calls. A different payer for the same receiver gets a different code.
  - Approving twice returns `409 ALREADY_HANDLED`.
  - `accountNumberMasked` for `19031234565678` is `1903 •••• 5678`.

- [ ] **Step 2: Run `npm test -w @fsl/api -- bank`.** Expected: FAIL.

- [ ] **Step 3: Implement `routes.ts`.**

- [ ] **Step 4: Run the same command.** Expected: PASS.

- [ ] **Step 5: Commit** with message "feat(api): bank details with guest approval, pay info with VietQR payload".

### Task 14: Payments

**Files:**
- Create: `apps/api/src/payments/routes.ts`
- Test: `apps/api/test/payments.test.ts`

**Interfaces:**
- Consumes: `statusForNewPayment`, `canConfirmPayment`, `notArrivedOutcome`, `can`, `commitTripWrite`

| Route | Check | Behaviour |
|---|---|---|
| `POST /api/trips/:id/payments` `{ fromId, toId, amount }` | `record_payment` | Status from `statusForNewPayment`; `forbidden` gives 403. `confirmed` payments set `amount_confirmed = amount`. The amount is a positive integer no greater than `MAX_AMOUNT`. |
| `POST …/payments/:pid/confirm` `{ amount? }` | `canConfirmPayment` | Conditional update from `says_paid` to `confirmed`, with `amount_confirmed = amount ?? amount_claimed` |
| `POST …/payments/:pid/not-arrived` | `notArrivedOutcome` | `reject` sets status `rejected` (conditional from `says_paid`). `flag` sets `not_arrived_at`. `forbidden` gives 403. |
| `POST …/payments/:pid/disable` and `/enable` | `disable` | Disable: from `confirmed` or `says_paid` to `disabled`. Enable: from `disabled` to `confirmed`. |

- [ ] **Step 1: Write the failing tests** (mockup trip; M is the member, A, B and C are guests).
  - C records C→M 1,245,000. It is `says_paid`, and the official balances don't change. C→M is gone from `suggestions`, and C's view has `myBalance.waitingConfirm === 1245000`.
  - **Review Focus 1:** M confirms twice with `Promise.all`. One gets 200 and one `409 ALREADY_HANDLED`, and M's balance is 950,000.
  - M confirms with `{ amount: 1000000 }` instead. The suggestions still show C owing 245,000.
  - M taps not-arrived on a `says_paid` payment. It becomes `rejected`, and C→M comes back into the suggestions.
  - M records M→A. It is `confirmed` straight away.
  - Add an expense where C pays 400,000 split equally between [A, C].
    - A records A→C. It is `confirmed` straight away.
    - C reports not-arrived. It is flagged, and members' `approvals` include `{ kind: 'not_arrived' }`.
    - M disables it. It is left out of balances.
  - B records A→M and gets 403. A guest on a pending name gets 403.

- [ ] **Step 2: Run `npm test -w @fsl/api -- payments`.** Expected: FAIL.

- [ ] **Step 3: Implement `routes.ts`.**

- [ ] **Step 4: Run the same command.** Expected: PASS.

- [ ] **Step 5: Commit** with message "feat(api): payments with confirmation rules, not-arrived, disable".

### Task 15: Free-plan usage alerts

**Files:**
- Create: `apps/api/src/ops/usage.ts`
- Modify: `apps/api/src/index.ts` (the `scheduled` handler calls `checkUsage`)
- Test: `apps/api/test/usage.test.ts`

**Interfaces:**
- Produces:
  - `FREE_LIMITS = { workerRequests: 100_000, d1RowsRead: 5_000_000, d1RowsWritten: 100_000 }`. These figures are to be confirmed under spec §14; keep them in this one constant.
  - `checkUsage(env: Env, now: Date): Promise<{ metric: keyof typeof FREE_LIMITS; used: number; ratio: number }[]>`
- **Behaviour:**
  - If `CF_API_TOKEN` or `CF_ACCOUNT_ID` is missing, return `[]` without fetching anything.
  - Otherwise POST to `https://api.cloudflare.com/client/v4/graphql`. Query today's (UTC) Worker requests (`workersInvocationsAdaptive.sum.requests`) and D1 usage (`d1AnalyticsAdaptiveGroups.sum.rowsRead` and `rowsWritten`). Check the dataset names against Cloudflare's GraphQL docs.
  - For each metric at 80% or more of its limit with no `ops_alerts` row yet for (day, metric): POST `{ text }` to `OPS_ALERT_WEBHOOK_URL` and insert the row.

- [ ] **Step 1: Write the failing tests** (`fetchMock`).
  - At 85% of `d1RowsRead`, the webhook is called once. A second run on the same day doesn't call it again.
  - At 50%, the webhook isn't called.
  - With no token, there is no fetch at all.

- [ ] **Step 2: Run `npm test -w @fsl/api -- usage`.** Expected: FAIL.

- [ ] **Step 3: Implement `usage.ts` and wire up `scheduled`.**

- [ ] **Step 4: Run the same command.** Expected: PASS.

- [ ] **Step 5: Commit** with message "feat(api): hourly free-plan usage alerts".

---

## Web app (`apps/web`)

Before each of Tasks 16–21, write the screen spec from `ui-ux-design-companion` §5.2, using this plan and the mockups.

### Task 16: Web scaffold, tokens, i18n, API client, shared states

**Files:**
- Create: `apps/web/package.json` (`@fsl/web`), `apps/web/vite.config.ts`, `apps/web/index.html`, `apps/web/src/main.tsx`, `apps/web/src/App.tsx`, `apps/web/src/config.ts`, `apps/web/src/styles/tokens.css`, `apps/web/src/styles/base.css`, `apps/web/src/i18n/index.ts`, `apps/web/src/i18n/en.ts`, `apps/web/src/i18n/vi.ts`, `apps/web/src/api/client.ts`, `apps/web/src/api/hooks.ts`, `apps/web/src/lib/linkTokens.ts`, `apps/web/src/components/{Skeleton,EmptyState,InlineError,Amount,Avatar,Pill,Button,Sheet,Screen,LangSwitch}.tsx`, `apps/web/src/test/setup.ts`
- Test: `apps/web/src/test/scaffold.test.tsx`

**Interfaces:**
- Produces:
  - **i18n:**
    - `t(key: MessageKey, vars?: Record<string, string | number>): string`, `useT()` and `setLang(lang: 'vi' | 'en')`.
    - The language comes from `localStorage.lang`, otherwise `navigator.language` starting with `vi` gives `'vi'`, otherwise `'en'`.
    - `MessageKey` is `keyof typeof en`.
  - **API client:**
    - `apiFetch<T>(path: string, init?: RequestInit & { tripId?: string }): Promise<T>`.
    - It sends `credentials: 'include'`, `X-Link-Token` from `linkTokens.get(tripId)`, and `X-Device-Restore` from `localStorage.deviceId`.
    - It stores the `X-Device-Id` response header.
    - It throws `ApiClientError { code: ApiErrorCode; status: number; message: string }`.
  - **Link tokens:** `linkTokens.set(tripId, token)` and `linkTokens.get(tripId)`, stored in localStorage under the key `lt:<tripId>`.
  - **`useTripView(tripId: string, pollMs: number, opts?: { stopAfterMs?: number }): { view: TripView | undefined; error: ApiClientError | null; isLoading: boolean; stopped: boolean; resume(): void }`:**
    - Uses TanStack Query.
    - Polls `/version` every `pollMs` while `document.visibilityState === 'visible'`.
    - Refetches `GET /api/trips/:id` whenever the version changes.
    - Sets `stopped` once `stopAfterMs` has passed since mount or since the last `resume()`.
  - **`<LangSwitch />`:** a small vi/EN toggle in the screen header that calls `setLang`.
  - **Components:**
    - `<InlineError error={ApiClientError} onRetry />`. `DAILY_LIMIT` and `LINK_DEAD` show their exact copy; everything else shows "Something went wrong. Try again." with a Retry button.
    - `<Amount value tone="auto" | "neutral" />` uses `formatVnd` and tabular numbers. With `auto`, positive is emerald and negative is rose.
  - **Routes** in `App.tsx`: `/`, `/trips`, `/trips/new`, `/privacy`, `/me/bank`, `/j/:token`, `/t/:tripId`, `/t/:tripId/who`, `/t/:tripId/expenses/new`, `/t/:tripId/expenses/:expenseId/edit`, `/t/:tripId/pay/:toId`, `/t/:tripId/bank`, `/t/:tripId/people`, `/t/:tripId/activity`, `/t/:tripId/settings`.
  - **Vite config:**
    - The dev server proxies `/api` to `http://localhost:8787`.
    - `vite-plugin-pwa` writes a manifest with `name: APP_NAME`, `theme_color: '#0f766e'` and `display: 'standalone'`. No offline caching of `/api`.

- [ ] **Step 1: Write the failing tests.**
  - `Object.keys(vi)` equals `Object.keys(en)`.
  - `t('fewest.explain')` in English equals the spec copy exactly.
  - `<InlineError>` with code `DAILY_LIMIT` renders "We're over today's free limit. Try again after 07:00.".
  - `<Amount value={1245000}/>` renders `1.245.000₫`.
  - `apiFetch` sends `X-Link-Token` when one is stored for the trip, and turns a 410 body into `code 'LINK_DEAD'`.
  - `useTripView` refetches the view when the version changes. With `document.hidden` set, it doesn't poll (fake timers and a mocked `fetch`).

- [ ] **Step 2: Run `npm test -w @fsl/web -- scaffold`.** Expected: FAIL.

- [ ] **Step 3: Implement the scaffold.**

- [ ] **Step 4: Run the same command.** Expected: PASS.

- [ ] **Step 5: Commit** with message "feat(web): scaffold, tokens, i18n, API client, shared states".

### Task 17: Landing, sign-in, my trips, create trip, privacy and consent

**Files:**
- Create: `apps/web/src/screens/Landing.tsx`, `MyTrips.tsx`, `CreateTrip.tsx`, `Privacy.tsx`, `apps/web/src/components/ConsentSheet.tsx`, `apps/web/src/components/BankFields.tsx`
- Test: `apps/web/src/screens/__tests__/trips.test.tsx`

**Interfaces:**
- Consumes: `apiFetch`, `t`, `TripListItem`, `BANKS`
- Produces:
  - `<BankFields value onChange />`, reused in Task 21. It is a searchable bank select over `BANKS` (`shortName` and `name`), an account number field (digits only), and a holder name field shown uppercased without diacritics.
- **Screens:**
  - **Landing:** a one-line product description and a "Sign in with Google" link to `/api/auth/google/start?returnTo=/trips`. A signed-in user is redirected to `/trips`.
  - **MyTrips:** trips with my balance each, plus a "New trip" button. Empty state: "No trips yet. Create your first trip."
  - **CreateTrip:** trip name, my name (prefilled from `/api/me`), a list of other people's names, and optional `BankFields`. On 201, navigate to `/t/:tripId`.
  - **Privacy:** draft text with a visible "Draft — pending legal review" banner. The owner must review it, as listed under spec §14.
  - **ConsentSheet:** shown whenever `/api/me` returns `consentAt === null`. It has the checkbox "I agree to the privacy notice", which links to `/privacy`, and POSTs to `/api/me/consent`.

- [ ] **Step 1: Write the failing tests.**
  - MyTrips with `[]` shows the empty-state copy and a link to `/trips/new`.
  - CreateTrip's submit is disabled until a name and at least one other person are entered. The POST body equals `{ name, myName, people, myBank? }`. On 201 it navigates to `/t/<id>`.
  - ConsentSheet shows when `consentAt` is null, and submitting it calls `/api/me/consent`.

- [ ] **Step 2: Run `npm test -w @fsl/web -- trips`.** Expected: FAIL.

- [ ] **Step 3: Implement the screens.**

- [ ] **Step 4: Run the same command.** Expected: PASS.

- [ ] **Step 5: Commit** with message "feat(web): landing, my trips, create trip, privacy consent".

### Task 18: Joining by link: "Who are you?", guest view, view-only page

**Files:**
- Create: `apps/web/src/screens/Join.tsx`, `WhoAreYou.tsx`, `TripRoute.tsx`, `GuestTrip.tsx`, `ViewOnlyTrip.tsx`
- Test: `apps/web/src/screens/__tests__/join.test.tsx`

**Interfaces:**
- Consumes: `apiFetch`, `linkTokens`, `useTripView`, `PickerView`, `TripView`, `suggestNames`
- Produces:
  - `<TripRoute />` for `/t/:tripId`. It chooses `GuestTrip` when `me.kind === 'guest'` (sending a guest with no pick to `/who`), `ViewOnlyTrip` when `viewer`, and `MemberTrip` (Task 20) when `member`.
- **Behaviour** (layout per mockups v1 screen 2, v2 screen 2 and v3 screens 1–2):
  - **`/j/:token`:** calls `GET /api/links/:token`, stores the token, and goes to `/t/:tripId/who` for `group` or `/t/:tripId` for `view`. `LINK_DEAD` shows the dead-link copy.
  - **WhoAreYou:**
    - A name with `lastUsedHere` is preselected and shows "You picked this on this phone last time". `activeElsewhere` shows "Active on another phone · {ago}".
    - A member-linked name shows "Signed in" and goes to Google sign-in with `returnTo` set to the current URL.
    - The primary button is "Continue as {name}"; the secondary is "I'm someone new".
    - New-name entry autocompletes with `suggestNames` over the picker list. On submit it calls `check-name`; matches show "Are you {name}?" with "Yes, I'm {name}" (pick) and "No, add me" (`POST people` with `confirmNew: true`). Afterwards it shows "A member checks new names before they show up in the trip."
  - **GuestTrip:**
    - Banner: "Viewing as {name} · Not {name}? Switch".
    - Hero: "You owe {creditor}" or "You're owed", plus "Drops to {amount} if your expenses are approved" when `ifPendingApproved` is set. There is a "Pay with VietQR" button for each suggestion where I'm the payer.
    - "How we got your share" lists my share of each approved expense.
    - Expenses carry Waiting, Rejected (with the reason) or Disabled labels.
    - "+ Add expense".
    - "Sign in with Google to become a member", which POSTs `membership` after sign-in.
  - **ViewOnlyTrip:** name, total, each person's balance, who pays whom and expenses. No action buttons.

- [ ] **Step 1: Write the failing tests.**
  - The picker preselects the `lastUsedHere` person, and "Continue" POSTs `pick` and navigates to `/t/:id`.
  - Typing "Binh" shows the "Bình" suggestion. Submitting with a match shows "Are you Bình?".
  - Clicking a member name navigates to the sign-in URL.
  - Given the Task 12 view fixture, GuestTrip shows "Drops to 1.110.000₫".
  - ViewOnlyTrip has no buttons apart from the language switcher.
  - `/j/<dead>` shows "This link no longer works. Ask the organiser for a new one."

- [ ] **Step 2: Run `npm test -w @fsl/web -- join`.** Expected: FAIL.

- [ ] **Step 3: Implement the screens.**

- [ ] **Step 4: Run the same command.** Expected: PASS.

- [ ] **Step 5: Commit** with message "feat(web): join by link, who are you, guest and view-only pages".

### Task 19: Add / edit expense form

**Files:**
- Create: `apps/web/src/screens/ExpenseForm.tsx`, `apps/web/src/lib/splitInput.ts`
- Test: `apps/web/src/screens/__tests__/expense-form.test.tsx`

**Interfaces:**
- Consumes: `parseVnd`, `computeShares`, `formatVnd`, `ExpenseInput`, `TripView`
- Produces:
  - `toEntryValue(mode: SplitMode, display: string): number | null`. Percent and shares accept up to 2 decimals (`'33.33'` becomes 3333 basis points; `'1.5'` shares becomes 150); amounts and adjustments go through `parseVnd` (adjustments may have a leading `-`).
  - `fromEntryValue(mode, value): string`, the inverse.
- **Behaviour** (mockup v2 screen 1):
  - Fields: "What for", "Amount" (inline error when `parseVnd` returns null), and "Paid by" (defaults to me).
  - Split tabs, in this order: Equally / Amounts / % / Shares / ± Adjust.
  - Each person has a row with a checkbox (equally) or an input. A live preview of each amount comes from `computeShares`.
  - Each `SplitError` gets its own inline message.
  - The submit button says "Send for approval" for guests and "Add expense" for members. Guests also see "A group member checks it before it counts."

- [ ] **Step 1: Write the failing tests.**
  - Equally, with 4 people ticked and 180.000, shows 45.000₫ on each row.
  - Amounts that don't add up show the error copy and disable submit.
  - A guest sees the "Send for approval" label.
  - Edit mode prefills from `ExpenseView.shares[].inputValue`, using `fromEntryValue`.
  - Typing amount `1,5tr` previews `1.500.000₫`.
  - `toEntryValue('percent', '33.33') === 3333` and `toEntryValue('shares', '1.5') === 150`.

- [ ] **Step 2: Run `npm test -w @fsl/web -- expense-form`.** Expected: FAIL.

- [ ] **Step 3: Implement the form and `splitInput.ts`.**

- [ ] **Step 4: Run the same command.** Expected: PASS.

- [ ] **Step 5: Commit** with message "feat(web): expense form with five split modes".

### Task 20: Member trip page, people and merge, settings, activity

**Files:**
- Create: `apps/web/src/screens/MemberTrip.tsx`, `apps/web/src/components/ApprovalsCard.tsx`, `WhoPaysWhom.tsx`, `ExpenseList.tsx`, `ShareLinks.tsx`, `apps/web/src/screens/People.tsx`, `Settings.tsx`, `Activity.tsx`, `apps/web/src/lib/remind.ts`
- Test: `apps/web/src/screens/__tests__/member-trip.test.tsx`

**Interfaces:**
- Consumes: `useTripView(tripId, 20000)`, `apiFetch`, `Approval`, `TripView`, `ActivityItem`
- Produces:
  - `remindText(lang, { name, creditor, amount, trip, link }): string`
  - `remind(text): Promise<void>`, which uses `navigator.share({ text })` and falls back to the clipboard.
- **Remind copy:**
  - vi: `Chào {name}! Bạn còn {amount} cần trả {creditor} cho chuyến "{trip}". Xem chi tiết và chuyển khoản bằng VietQR: {link}` (owner to review)
  - en: `Hi {name}! You still owe {creditor} {amount} for "{trip}". See details and pay with VietQR: {link}`
- **MemberTrip** (mockups v1 screen 1, v2 screen 3, v3 screen 3):
  - **Approvals card** (amber), one row per `Approval.kind`:
    - expense: Approve / Edit / Reject (asks for a reason)
    - name: "Same as {match}" / "New person"
    - bank: shows bank name, full account number and holder; Approve / Reject
    - payment: "{name} says it's paid. Did it arrive?" with Confirm (amount editable) / Didn't arrive
    - not_arrived: Disable / Keep
    - membership: Approve / Reject
    - `PERSON_PENDING` shows "Approve {name} first" inline.
  - **Hero:** "You're still owed {now}" or "You owe {now}", then "of {beforePayments} · trip total {total}".
  - **"Fewest transfers"** switch, with the explanation copy, PATCHes the trip.
  - **Who pays whom:** suggestions, `says_paid` payments and confirmed payments from the last 7 days. Pills say Waiting, Confirm or Paid ✓. Rows owed to me get "Remind"; rows I owe get "Pay".
  - **Expenses:** newest first. Disabled ones are crossed out with "Disabled by {name}"; each row has a Disable / Enable menu.
  - **Share links:** copy the group link and the view-only link; Regenerate asks for confirmation.
- **People:** the list, Merge (pick who to merge into, then confirm) and Remove (`409` shows "Use merge instead").
- **Settings:** archive (organiser only), plus links to People and Activity.
- **Activity:** one row per `ActivityItem`: actor name, a short device id, relative time and the action text.

- [ ] **Step 1: Write the failing tests.**
  - Given a fixture with one approval of each kind, every kind renders with its buttons. Approve on the expense row POSTs `/expenses/:id/approve`.
  - A `says_paid` row renders "Chi says it's paid. Did it arrive?".
  - A disabled expense has `text-decoration: line-through` and "Disabled by Minh".
  - With English selected, Remind calls `navigator.share` with the exact English template.
  - The switch's explanation copy equals the spec text exactly.
  - An empty trip shows "No expenses yet. Add the first one.".
  - Activity renders its rows.

- [ ] **Step 2: Run `npm test -w @fsl/web -- member-trip`.** Expected: FAIL.

- [ ] **Step 3: Implement the screens and components.**

- [ ] **Step 4: Run the same command.** Expected: PASS.

- [ ] **Step 5: Commit** with message "feat(web): member trip page, approvals, people and merge, settings, activity".

### Task 21: Pay screen and bank details form

**Files:**
- Create: `apps/web/src/screens/PayScreen.tsx`, `apps/web/src/components/BankAppSheet.tsx`, `apps/web/src/screens/BankDetails.tsx`
- Test: `apps/web/src/screens/__tests__/pay.test.tsx`

**Interfaces:**
- Consumes: `PayInfo`, `BANK_APPS`, `bankAppLink`, `PREFILL_VERIFIED`, `BankFields` (Task 17), `remindText`, `qrcode`
- **PayScreen** (mockup v1 screen 3):
  - The title is the amount and who it's to. The QR comes from `QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 2, width: 512 })`.
  - Rows: Bank, Account (masked), Name, Amount, Transfer note, then "Keep this note unchanged so the payment can be matched."
  - **"Open my bank app"** opens `BankAppSheet`:
    - It lists the `ios` apps when `navigator.userAgent` matches `/iPhone|iPad/`, otherwise the `android` apps.
    - Each app links to `bankAppLink(appId)`.
    - Apps with `autofill` get the "fills in the payment" label only when `PREFILL_VERIFIED`.
  - **"Save QR"** downloads `vietqr-{refCode}.png`.
  - **Status:**
    - "Waiting for the money to reach {name}. This page updates by itself." The screen polls every 5 seconds through `useTripView(tripId, 5000, { stopAfterMs: 600000 })`.
    - When `stopped`, it shows "Tap to check again", which calls `resume()`.
  - **"I've already paid"** POSTs `{ fromId: me, toId, amount }`.
    - A `says_paid` result shows "Waiting for {name} to confirm".
    - A `confirmed` result shows "Paid ✓".
  - **Bank state:** `pending` shows "{name}'s bank details are waiting for approval". `none` shows "{name} hasn't added bank details yet" with Remind.
- **BankDetails** (`/t/:tripId/bank` for guests, `/me/bank` for members):
  - `BankFields`, plus a required consent checkbox linking to `/privacy`.
  - Guests see "A member approves new bank details before anyone can pay you."

- [ ] **Step 1: Write the failing tests.**
  - The QR `img` has a `src` starting with `data:image/png`, and the note text `DALAT C7K2` is visible.
  - The `pending` bank state shows the exact copy.
  - "I've already paid" POSTs the right body. With a member receiver, the screen shows "Waiting for Minh to confirm".
  - With fake timers, after 10 minutes polling has stopped and "Tap to check again" shows.
  - In BankDetails, holder `Nguyễn Văn Minh` displays as `NGUYEN VAN MINH`, and submit is disabled until consent is ticked.

- [ ] **Step 2: Run `npm test -w @fsl/web -- pay`.** Expected: FAIL.

- [ ] **Step 3: Implement the screens.**

- [ ] **Step 4: Run the same command.** Expected: PASS.

- [ ] **Step 5: Commit** with message "feat(web): VietQR pay screen, bank app picker, bank details form".

---

## End-to-end and release

### Task 22: Golden-path end-to-end test, deploy guide, handover

**Files:**
- Create: `apps/api/src/auth/testLogin.ts`, `playwright.config.ts`, `e2e/golden-path.spec.ts`, `README.md`
- Modify: `apps/api/src/app.ts` (register `testLogin` only when `env.E2E_LOGIN === '1'`)
- Test: `apps/api/test/test-login.test.ts`, `e2e/golden-path.spec.ts`

**Interfaces:**
- Produces:
  - `POST /api/test/login { sub, name, email }`, which creates the user and session and sets `sid`. It exists only when `E2E_LOGIN === '1'`, and that is set in `.dev.vars` for E2E runs, never in `wrangler.jsonc`.
- **Playwright setup:**
  - `webServer` runs `npm run build -w @fsl/web && npx wrangler dev --local --port 8787` from `apps/api`, with migrations applied locally first.
  - Viewport 375×812.
  - Two browser contexts: Minh and a guest.

- [ ] **Step 1: Write the failing tests.**
  - `test-login.test.ts`: without `E2E_LOGIN`, `POST /api/test/login` returns 404; with it, 200 and a `sid` cookie.
  - `golden-path.spec.ts`, in order:
    1. Minh logs in through the test route and gives consent.
    2. Minh creates "Đà Lạt" with An, Bình and Chi, plus Techcombank 19031234565678.
    3. Minh copies the group link.
    4. The guest opens it and picks Chi.
    5. The guest adds "Bánh tráng nướng" for 180.000, split equally. It shows "Waiting".
    6. Minh approves it.
    7. The guest opens Pay. The QR is visible, along with the transfer note.
    8. The guest taps "I've already paid". Minh sees "Chi says it's paid. Did it arrive?" and confirms.
    9. The guest's page shows "Paid ✓".

- [ ] **Step 2: Run `npm test -w @fsl/api -- test-login`, then `npx playwright test`.** Expected: FAIL.

- [ ] **Step 3: Implement `testLogin.ts` and the Playwright config.**

- [ ] **Step 4: Run `npm test` (every workspace), then `npx playwright test`.** Expected: all PASS.

- [ ] **Step 5: Write `README.md`.** It covers:
  - Local dev: `.dev.vars` with `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_ORIGIN=http://localhost:8787`, then `npm run dev`.
  - Google OAuth client setup, with redirect URI `${APP_ORIGIN}/api/auth/google/callback` and scopes `openid email profile`.
  - Deploy:
    - `npx wrangler d1 create fsl`, then put the `database_id` in `wrangler.jsonc`.
    - `npx wrangler d1 migrations apply fsl --remote`.
    - `npx wrangler secret put GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
    - `npm run build -w @fsl/web && npx wrangler deploy`.
  - Optional usage alerts: `CF_API_TOKEN`, `CF_ACCOUNT_ID`, `OPS_ALERT_WEBHOOK_URL`.

- [ ] **Step 6: Commit** with message "test: golden-path e2e; docs: run and deploy guide".

- [ ] **Step 7: Hand over to the product owner, as they asked.** List the four spec §14 checks:
  1. The `dl.vietqr.io` prefill parameters, and which bank apps honour them. Flip `PREFILL_VERIFIED` once confirmed.
  2. Transfer-note length and character limits at the major banks.
  3. The current D1 and Workers free-plan numbers. Update `FREE_LIMITS` and the `DAILY_LIMIT` error matcher.
  4. Vietnam's personal-data requirements. Replace the draft privacy text.

  Also ask them to review the `// REVIEW` Vietnamese strings.
