# Automatic Split Boxes & Choosing Who's In — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Blank boxes in Exact amounts and Percent share what's left equally and stay blank after saving, and a "Split between" line opens a sheet (recent groups, tick list, or chip search above 12 people) that decides who is on the expense in every mode.

**Architecture:** `computeShares` in core accepts `value: null` (automatic) in `amounts` and `percent` and works out the remainder. The API stores it as `transaction_shares.input_auto` and returns `inputValue: null`. The form calls the same core function for live numbers and placeholders. Two new components (`SplitBetween`, `SplitPeopleSheet`) and two pure helpers (`nameSearch`, `recentGroups`) replace the per-row tick boxes.

**Tech Stack:** TypeScript, Hono + Drizzle on Cloudflare D1 (Workers vitest pool), React 19 + TanStack Query + react-router, vitest + Testing Library (jsdom).

**Spec:** [docs/superpowers/specs/2026-10-26-auto-split-and-people-picker-design.md](../specs/2026-10-26-auto-split-and-people-picker-design.md)

## Global Constraints

- Money is whole dong. Percent values are hundredths (100% = `10000`). Shares values are hundredths (1 share = `100`).
- `null` (automatic) is accepted only in `amounts` and `percent`. Any other mode returns `INVALID_VALUE`.
- Migration file `apps/api/migrations/0005_share_input_auto.sql` contains exactly ``ALTER TABLE `transaction_shares` ADD COLUMN `input_auto` integer DEFAULT 0 NOT NULL;``.
- Search mode in the sheet when the offered people number **more than 12** (`SEARCH_ABOVE = 12`). At most **3** recent groups.
- UI uses tokens from `apps/web/src/styles/tokens.css` only (no raw hex, no Tailwind, no new colours). Reuse `Sheet`, `Avatar`, `Button`, `Pill`. Rows at least 48px tall, tap targets at least 44px, and text inputs at `--text-input` (16px).
- Every new copy key goes in both `apps/web/src/i18n/en.ts` and `vi.ts`, and each new Vietnamese line ends with `// REVIEW`.
- Harness (`~/.claude/harness/HARNESS.md`): Gemini may create new test files but never edits or deletes existing tests. Steps marked **(Opus)** are done by the architect. Gemini never runs tests; the architect runs every verification step. Delegated calls use `AGY_ALLOW` with exactly the task's files.
- Workspace names: `@fsl/core`, `@fsl/api`, `@fsl/web`. Every task ends with `npm run typecheck` green.

### Plan refinements of the spec (decided while planning)
1. **Core tests go in a new file** `packages/core/test/split-auto.test.ts`, not `split.test.ts`. The existing helper `e()` turns `null` into `1` (`values[i] ?? 1`), and the harness keeps existing test files untouched by Gemini.
2. `fromEntryValue(mode, value: number | null)` returns `''` for `null`. It changes in Task 2, before the API types make `inputValue` nullable in Task 4.
3. For a single automatic person, the line under the picker uses their plain `name` (no "You").
4. One more existing test changes on purpose, besides those listed in spec §8.1: *"exact amounts that do not add up block saving"* (`expense-form.test.tsx`, around line 50). With two blank boxes, 50.000 + 20.000 of 100.000 now adds up, so it changes to typed values that go over.
5. The `SplitBetween` accessible name joins names with ", " ("Split between You, An, Chi. Change") and doesn't use "and".
6. Each recent-group **Use** button is labelled "Use the people from {description}", so several on screen have distinct names.
7. `expenseForm.include` stays in the i18n files, unused. Removing keys is out of scope.

## Review Focus

1. **The group-size boundary:** exactly 12 people must get the tick list, and 13 the search field. → Task 6 tests `12 people still get the tick list` and `13 people get the search field`.
2. **Vietnamese names with đ and tone marks:** "duc" must find "Đức" and "loc" must find "Hà Lộc", but "oc" must not. → Task 3 tests in `name-search.test.ts`, and Task 6 `Enter adds the first suggestion`.
3. **Someone chosen leaves while the form is open:** the line must count and name only people still offered, not stale ids. → Task 5 test `ignores chosen ids that are not offered`, and Task 7 **(Opus)** extension of the roster-refresh test.
4. **Taking someone out after typing their value, then putting them back:** the remainder re-divides while they're out, and their value comes back when they return. → Task 7 test `taking someone out and back keeps what was typed`.
5. **An old percent expense with every box filled:** it opens filled, and clearing one box makes only that person automatic on save. → Task 7 test `an old percent expense opens filled; clearing a box makes it automatic`.

---

### Task 1: Core — automatic entries in `computeShares`

**Delegation:** Opus (about 30 lines in `split.ts`, money logic).

**Files:**
- Modify: `packages/core/src/split.ts` (`SplitEntry`, `computeShares`)
- Modify: `apps/web/src/screens/ExpenseForm.tsx` (only the three `e.value` uses in `assigned` and `liveShares` become `e.value ?? 0`, so it type-checks; Task 7 rewrites them)
- Test (new): `packages/core/test/split-auto.test.ts`

**Interfaces:**
- Produces: `interface SplitEntry { participantId: string; value: number | null }`. `computeShares(total, mode, entries)` follows spec §3.2–3.4, and its shares keep the entry order.

- [ ] **Step 1: Write the failing tests** in `packages/core/test/split-auto.test.ts`

```ts
const ea = (ids: string[], values: (number | null)[]) => ids.map((participantId, i) => ({ participantId, value: values[i] as number | null }));
const amounts = (r: SplitResult) => { if (!r.ok) throw new Error(r.error); return r.shares.map((s) => s.amount); };
const ids4 = ['m', 'a', 'b', 'c'];

it('exact: blanks share what is left', () => expect(amounts(computeShares(1_000_000, 'amounts', ea(ids4, [400000, null, null, null])))).toEqual([400000, 200000, 200000, 200000]));
it('exact: blanks are at most 1₫ apart', () => expect(amounts(computeShares(100_000, 'amounts', ea(ids4, [50000, null, null, null])))).toEqual([50000, 16667, 16667, 16666]));
it('exact: nothing left gives blanks 0', () => expect(amounts(computeShares(100_000, 'amounts', ea(['m', 'a', 'b'], [100000, null, null])))).toEqual([100000, 0, 0]));
it('exact: typed over the total is refused', () => expect(computeShares(100_000, 'amounts', ea(['m', 'a'], [120000, null]))).toEqual({ ok: false, error: 'AMOUNTS_DONT_ADD_UP' }));
it('exact: all blank splits equally', () => expect(amounts(computeShares(100_000, 'amounts', ea(['m', 'a', 'b'], [null, null, null])))).toEqual([33334, 33333, 33333]));
it('exact: one blank takes the rest', () => expect(amounts(computeShares(100_000, 'amounts', ea(['m', 'a'], [30000, null])))).toEqual([30000, 70000]));
it('exact: a typed 0 stays on at 0', () => { const r = computeShares(100_000, 'amounts', ea(['m', 'a'], [0, null])); expect(r.ok && r.shares).toEqual([{ participantId: 'm', amount: 0 }, { participantId: 'a', amount: 100000 }]); });
it('percent: 40% and three blanks', () => expect(amounts(computeShares(1_000_000, 'percent', ea(ids4, [4000, null, null, null])))).toEqual([400000, 200000, 200000, 200000]));
it('percent: all blank', () => expect(amounts(computeShares(100_000, 'percent', ea(['m', 'a', 'b'], [null, null, null])))).toEqual([33334, 33333, 33333]));
it('percent: 33.33% typed', () => expect(amounts(computeShares(100_000, 'percent', ea(['m', 'a', 'b'], [3333, null, null])))).toEqual([33330, 33335, 33335]));
it('percent: 100% typed leaves blanks at 0', () => expect(amounts(computeShares(100_000, 'percent', ea(ids4, [6000, 4000, null, null])))).toEqual([60000, 40000, 0, 0]));
it('percent: over 100% is refused', () => expect(computeShares(100_000, 'percent', ea(['m', 'a', 'b'], [6000, 5000, null]))).toEqual({ ok: false, error: 'PERCENT_NOT_100' }));
it('percent: no blanks still needs 100%', () => expect(computeShares(100_000, 'percent', ea(['m', 'a'], [6000, 3000]))).toEqual({ ok: false, error: 'PERCENT_NOT_100' }));
it.each([['equal', 1], ['shares', 100], ['adjust', 0]] as const)('a blank is refused in %s', (mode, v) =>
  expect(computeShares(100_000, mode, ea(['m', 'a'], [null, v]))).toEqual({ ok: false, error: 'INVALID_VALUE' }));
it('blanks always add up to the total (200 seeded cases)', () => { /* see below */ });
```

The seeded case uses the same LCG as `split.test.ts` (`seed = 42`). Mode alternates `amounts` and `percent`, with n from 1 to 7 and the total from 1 to 50.000.000. Entry 0 is always `null`, and each other entry is `null` with probability ½. Otherwise it's typed: `amounts` gets `floor(rnd() * floor(total / (2n)))`, and `percent` gets `floor(rnd() * floor(10000 / (2n)))`. Assert `r.ok`, that the amounts sum to `total`, and that the automatic amounts' max minus min is ≤ 1.

- [ ] **Step 2: Run them and see them fail**

Run: `npm test -w @fsl/core -- split-auto`
Expected: FAIL. The type check rejects `null`, or the results come back as errors.

- [ ] **Step 3: Implement in `packages/core/src/split.ts`**

Widen `SplitEntry.value` to `number | null`. At the top of the `equal`, `shares` and `adjust` cases, return `INVALID_VALUE` if any entry is `null`. In `amounts` and `percent`, sum only the typed entries (same negative and safe-integer checks and errors as today), count `k` nulls, and apply spec §3.2 / §3.3 exactly. Percent weights are `p * k` for typed entries and `10000 - P` for automatic ones, with `k === 0` keeping today's weights. Exact amounts places `distributeWeighted(total - S, ones)` on the automatic entries in order. Then apply the three `?? 0` edits in `ExpenseForm.tsx`.

- [ ] **Step 4: Run core tests and typecheck**

Run: `npm test -w @fsl/core && npm run typecheck`
Expected: PASS, including the existing `split.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/split.ts packages/core/test/split-auto.test.ts apps/web/src/screens/ExpenseForm.tsx
git commit -m "feat(core): blank exact and percent entries share what is left"
```

---

### Task 2: Web — read a split box, including blank

**Delegation:** Opus (under 20 lines).

**Files:**
- Modify: `apps/web/src/lib/splitInput.ts`
- Test (new): `apps/web/src/lib/__tests__/split-input.test.ts`

**Interfaces:**
- Produces:
  - `readSplitInput(mode: SplitMode, text: string): { ok: true; value: number | null } | { ok: false }`
  - `fromEntryValue(mode: SplitMode, value: number | null): string` (`null` gives `''`)
  - `toEntryValue` unchanged (null still means invalid)

- [ ] **Step 1: Write the failing tests**

```ts
it('a blank exact or percent box is automatic', () => {
  expect(readSplitInput('amounts', '')).toEqual({ ok: true, value: null });
  expect(readSplitInput('amounts', '   ')).toEqual({ ok: true, value: null });
  expect(readSplitInput('percent', '')).toEqual({ ok: true, value: null });
});
it('blank shares count as 1 share, blank adjust as 0, equal as 1', () => {
  expect(readSplitInput('shares', '')).toEqual({ ok: true, value: 100 });
  expect(readSplitInput('adjust', '')).toEqual({ ok: true, value: 0 });
  expect(readSplitInput('equal', '')).toEqual({ ok: true, value: 1 });
});
it('typed values parse as before, and a typed 0 is kept', () => {
  expect(readSplitInput('percent', '40')).toEqual({ ok: true, value: 4000 });
  expect(readSplitInput('amounts', '0')).toEqual({ ok: true, value: 0 });
  expect(readSplitInput('amounts', '50k')).toEqual({ ok: true, value: 50000 });
});
it('junk is not ok', () => expect(readSplitInput('percent', 'abc')).toEqual({ ok: false }));
it('an automatic value shows as an empty box', () => {
  expect(fromEntryValue('percent', null)).toBe('');
  expect(fromEntryValue('amounts', null)).toBe('');
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npm test -w @fsl/web -- split-input`
Expected: FAIL with "readSplitInput is not a function".

- [ ] **Step 3: Implement both in `splitInput.ts`.** Check for a blank trimmed text before calling `toEntryValue`, because `toEntryValue('amounts', '')` returns 0 today.

- [ ] **Step 4: Run web tests and typecheck**

Run: `npm test -w @fsl/web -- split-input expense-form && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/splitInput.ts apps/web/src/lib/__tests__/split-input.test.ts
git commit -m "feat(web): read a blank exact or percent box as automatic"
```

---

### Task 3: Web helpers — `nameSearch` and `recentGroups`

**Delegation:** Gemini small build (3 files plus 2 new test files): `AGY_ALLOW="apps/web/src/lib/nameSearch.ts,apps/web/src/lib/recentGroups.ts,apps/web/src/lib/recentPeople.ts,apps/web/src/lib/__tests__/name-search.test.ts,apps/web/src/lib/__tests__/recent-groups.test.ts"`.

**Files:**
- Create: `apps/web/src/lib/nameSearch.ts`, `apps/web/src/lib/recentGroups.ts`
- Modify: `apps/web/src/lib/recentPeople.ts:27-39` (`filterRecentPeople` uses `matchesWordStart` and keeps its own empty-query `return []`)
- Test (new): `apps/web/src/lib/__tests__/name-search.test.ts`, `apps/web/src/lib/__tests__/recent-groups.test.ts`

**Interfaces:**
- Produces:
  - `matchesWordStart(query: string, name: string): boolean` builds on `normalizeName` from `@fsl/core`. It returns `true` when the normalized query is empty, and otherwise `` ` ${normalizeName(name)}`.includes(` ${q}`) ``.
  - `interface RecentGroup { expenseId: string; description: string; spentOn: string; people: string[] }`
  - `recentGroups(expenses: readonly ExpenseView[], offered: readonly PersonView[], current: ReadonlySet<string>, editingId: string | undefined, max = 3): RecentGroup[]`, following the rules in spec §6.2.

- [ ] **Step 1: Write the failing tests**

`name-search.test.ts`:
```ts
expect(matchesWordStart('lo', 'Hà Lộc')).toBe(true);
expect(matchesWordStart('loc', 'Hà Lộc')).toBe(true);
expect(matchesWordStart('oc', 'Hà Lộc')).toBe(false);
expect(matchesWordStart('duc', 'Đức')).toBe(true);
expect(matchesWordStart('MINH', 'Minh')).toBe(true);
expect(matchesWordStart('ha l', 'Hà Lộc')).toBe(true);
expect(matchesWordStart('  ', 'An')).toBe(true);
```

`recent-groups.test.ts` (inline `ExpenseView` builder with `shares` from a list of ids; people `p1`–`p5`, all offered unless a test says otherwise):
- `newest first, at most 3`: five expenses with groups `[p1,p2]`, `[p2,p3]`, `[p3,p4]`, `[p4,p5]`, `[p1,p3]` in that order give the first three `expenseId`s, in order.
- `skips rejected and disabled expenses`: statuses `rejected` and `disabled` are left out; `pending` is kept.
- `skips the expense being edited`: `editingId` equal to the first expense's id leaves it out.
- `drops people who are not offered, and skips a group that becomes empty`: an expense on `[p1, p9]` (p9 not offered) gives `people: ['p1']`, and one on `[p9]` is skipped.
- `skips everyone, the current selection and repeats`: `[p1..p5]` is skipped; with `current = {p1,p2}`, `[p2,p1]` is skipped; a second `[p3,p4]` is skipped.
- `lists people in group order and carries the description and date`: an expense with shares ordered `[p3, p1]` gives `people: ['p1','p3']`, `description` and `spentOn` as given.

- [ ] **Step 2: Run them and see them fail** (Opus)

Run: `npm test -w @fsl/web -- name-search recent-groups`
Expected: FAIL with modules not found.

- [ ] **Step 3: Implement both files and the `recentPeople.ts` change.**

- [ ] **Step 4: Run the tests** (Opus)

Run: `npm test -w @fsl/web -- name-search recent-groups recent-people && npm run typecheck`
Expected: PASS, including the existing `recent-people.test.ts`.

- [ ] **Step 5: Commit** (Opus)

```bash
git add apps/web/src/lib/nameSearch.ts apps/web/src/lib/recentGroups.ts apps/web/src/lib/recentPeople.ts apps/web/src/lib/__tests__/name-search.test.ts apps/web/src/lib/__tests__/recent-groups.test.ts
git commit -m "feat(web): word-start name search and recent groups from past expenses"
```

---

### Task 4: API — accept, store and return automatic shares

**Delegation:** Opus (about 20 lines across 6 files).

**Files:**
- Create: `apps/api/migrations/0005_share_input_auto.sql` (see Global Constraints)
- Modify: `apps/api/src/db/schema.ts` (`transactionShares.inputAuto: integer('input_auto').notNull().default(0)`)
- Modify: `apps/api/src/expenses/routes.ts` (entry parsing accepts `null`; the validated `shares` type gains `inputAuto: 0 | 1`; every `transactionShares` insert writes `inputAuto: sh.inputAuto`; an automatic share gets `inputValue: 0, inputAuto: 1`)
- Modify: `apps/api/src/trips/snapshot.ts` (`inputValue: s.inputAuto === 1 ? null : s.inputValue`)
- Modify: `apps/api/src/participants/merge.ts` (both `.set({ … inputValue … })` calls also set `inputAuto: 0`)
- Modify: `packages/core/src/api-types.ts` (`inputValue: number | null` in `ExpenseHistoryItem.shares` and `ExpenseView.shares`)
- Test (new): `apps/api/test/expenses-auto.test.ts`

**Interfaces:**
- Consumes: Task 1's `SplitEntry` and Task 2's `fromEntryValue(…, null)`.
- Produces: `ExpenseView.shares[].inputValue: number | null` (`null` means automatic).

- [ ] **Step 1: Write the failing tests.** Use the same `send` / `minh` / `view` / `err` helpers as `expenses.test.ts`, with `seedTrip` + `seedExpenses` in `beforeEach`, and four people `PID.M, A, B, C`.

```ts
const auto = (amount: number, mode: 'amounts' | 'percent', first: number): ExpenseInput => ({
  description: 'Lẩu nấm', amount, spentOn: '2026-10-20', payerId: PID.M, mode,
  entries: [{ participantId: PID.M, value: first }, ...[PID.A, PID.B, PID.C].map((participantId) => ({ participantId, value: null }))],
});
```
- `blank exact boxes are stored as automatic and come back blank`: POST `auto(1_000_000, 'amounts', 400000)` gives 201. The view's expense shares give M `{ amount: 400000, inputValue: 400000 }` and A/B/C `{ amount: 200000, inputValue: null }`.
- `blank percent boxes share what is left`: POST `auto(1_000_000, 'percent', 4000)` gives the same amounts, with M `inputValue: 4000` and the others `null`.
- `editing the total re-divides the blank people and history keeps them blank`: PATCH with `auto(1_300_000, 'amounts', 400000)` gives A/B/C `300000` each, and `history[0].shares` for A has `inputValue: null`.
- `a blank in an equal split is refused`: mode `equal` with one `null` entry gives 422 and `{ code: 'VALIDATION', message: 'INVALID_VALUE' }`.
- `a value that is neither a number nor blank is refused`: `value: '5'` gives 422 with message `Invalid entry`.
- `merging people turns automatic boxes into typed amounts`: after the POST above, `POST /people/merge { fromId: PID.B, intoId: PID.A }` gives 204. The expense's mode is `amounts` and every share's `inputValue` is a number.

- [ ] **Step 2: Run them and see them fail**

Run: `npm test -w @fsl/api -- expenses-auto`
Expected: FAIL (422 `Invalid entry` for `null`).

- [ ] **Step 3: Implement the six file changes listed above.**

- [ ] **Step 4: Run all API tests and typecheck**

Run: `npm test -w @fsl/api && npm run typecheck`
Expected: PASS, with the migration applied by `readD1Migrations`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/migrations/0005_share_input_auto.sql apps/api/src/db/schema.ts apps/api/src/expenses/routes.ts apps/api/src/trips/snapshot.ts apps/api/src/participants/merge.ts packages/core/src/api-types.ts apps/api/test/expenses-auto.test.ts
git commit -m "feat(api): store automatic split boxes and return them blank"
```

---

### Task 5: `SplitBetween` line

**Delegation:** Gemini screen lane, from spec §9.1 (screen-spec template filled from §5.2 and §9.1): `AGY_ALLOW="apps/web/src/components/SplitBetween.tsx,apps/web/src/components/SplitBetween.css,apps/web/src/i18n/en.ts,apps/web/src/i18n/vi.ts,apps/web/src/components/__tests__/split-between.test.tsx"`, timeout 900, run in the background.

**Files:**
- Create: `apps/web/src/components/SplitBetween.tsx`, `SplitBetween.css`
- Modify: `apps/web/src/i18n/en.ts`, `vi.ts`
- Test (new): `apps/web/src/components/__tests__/split-between.test.tsx`

**Interfaces:**
- Produces: `SplitBetween(props: { people: readonly PersonView[]; chosen: ReadonlySet<string>; me: string | null; onOpen(): void }): JSX.Element`. It counts only `people` whose id is in `chosen`.
- Copy (en): `splitBetween.label` "Split between · {n} of {total}", `splitBetween.everyone` "Split between · Everyone ({n})", `splitBetween.none` "No one yet", `splitBetween.change` "Change", `splitBetween.you` "You", `splitBetween.aria` "Split between {names}. Change". The error line reuses `splitError.NO_PARTICIPANTS`.

- [ ] **Step 1: Write the failing tests.** Render directly after `setLang('en')`, as `split-mode-picker.test.tsx` does, with four people Minh (`me`), An, Bình, Chi.

```ts
it('shows how many and who', …) // chosen {Minh, An, Chi}: text 'Split between · 3 of 4' and 'You, An, Chi'
it('says Everyone when all are in', …) // 'Split between · Everyone (4)'
it('says no one yet and asks to choose', …) // chosen {}: 'No one yet' and 'Choose at least one person.'
it('ignores chosen ids that are not offered', …) // chosen {Minh, 'p-gone'}: 'Split between · 1 of 4'
it('is one button that opens the sheet', …) // getByRole('button', { name: 'Split between You, An, Chi. Change' }); click calls onOpen once
```

- [ ] **Step 2: Run them and see them fail** (Opus)

Run: `npm test -w @fsl/web -- split-between`
Expected: FAIL with the module not found.

- [ ] **Step 3: Build the component** from the screen spec: up to 3 stacked `Avatar size="sm"`, label, names on one line with ellipsis, and "Change". The error line uses `role="alert"` and `className="fsl-field-error"`.

- [ ] **Step 4: Run the tests and typecheck** (Opus). Read every changed file.

Run: `npm test -w @fsl/web -- split-between && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit** (Opus)

```bash
git add apps/web/src/components/SplitBetween.tsx apps/web/src/components/SplitBetween.css apps/web/src/i18n/en.ts apps/web/src/i18n/vi.ts apps/web/src/components/__tests__/split-between.test.tsx
git commit -m "feat(web): Split between line on the expense form"
```

---

### Task 6: `SplitPeopleSheet`

**Delegation:** Gemini screen lane, from spec §6 and §9.2: `AGY_ALLOW="apps/web/src/components/SplitPeopleSheet.tsx,apps/web/src/components/SplitPeopleSheet.css,apps/web/src/i18n/en.ts,apps/web/src/i18n/vi.ts,apps/web/src/components/__tests__/split-people-sheet.test.tsx"`, timeout 900, run in the background.

**Files:**
- Create: `apps/web/src/components/SplitPeopleSheet.tsx`, `SplitPeopleSheet.css`
- Modify: `apps/web/src/i18n/en.ts`, `vi.ts`
- Test (new): `apps/web/src/components/__tests__/split-people-sheet.test.tsx`

**Interfaces:**
- Consumes: `matchesWordStart` and `RecentGroup` (Task 3), `Sheet`, `Avatar`, `Button`, `Pill`, `formatDay` (`apps/web/src/lib/time.ts`), and `splitBetween.you` (Task 5) for the viewer's chip and their name in recent-group rows.
- Produces:
  - `export const SEARCH_ABOVE = 12`
  - `SplitPeopleSheet(props: { open: boolean; onClose(): void; people: readonly PersonView[]; chosen: ReadonlySet<string>; onChange(next: Set<string>): void; me: string | null; recent: readonly RecentGroup[] }): JSX.Element`
- Copy (en): `splitSheet.title` "Split between", `splitSheet.count` "{n} of {total}", `splitSheet.recent` "Same people as", `splitSheet.recentMeta` "{date} · {n} people · {names}", `splitSheet.more` "+{n}", `splitSheet.use` "Use", `splitSheet.useAria` "Use the people from {description}", `splitSheet.clearAll` "Clear all", `splitSheet.addEveryone` "Add everyone", `splitSheet.searchLabel` "Add people", `splitSheet.searchPlaceholder` "Add people…", `splitSheet.remove` "Remove {name}", `splitSheet.add` "Add {name}", `splitSheet.you` "{name} (you)", `splitSheet.noMatch` 'No one called "{q}" in this group.', `splitSheet.allChosen` "Everyone in the group is already chosen.", `splitSheet.matches` "{n} matches", `splitSheet.done` "Done". "Choose at least one person." reuses `splitError.NO_PARTICIPANTS`.

- [ ] **Step 1: Write the failing tests.** Use a stateful wrapper that holds `chosen` in `useState` and passes `onChange` through. Small group: Minh (`me`), An, Bình, Chi, Dũng. Big group: those five plus Long, Loan, Hà Lộc, Đức, Thảo, Khoa, Vy, Phúc, Quân (14 people).

Small group:
- `ticks show who is in, and unticking takes them out`: An's checkbox is checked; unticking it changes the header to "4 of 5".
- `Clear all, then Add everyone`: "0 of 5" shows "Choose at least one person." and no Clear all; then "5 of 5" shows no Add everyone.
- `12 people still get the tick list`: with 12 people there's no `textbox` named "Add people", and there are 12 checkboxes.

Big group:
- `13 people get the search field`: with 13 people, the `textbox` "Add people" is there and there are no checkboxes.
- `typing suggests only people not chosen, by word start`: chosen {Minh}, typing "lo" shows buttons "Add Long", "Add Loan" and "Add Hà Lộc", and no "Add Minh"; the status reads "3 matches".
- `a suggestion becomes a chip, clears the text and keeps focus`: after clicking "Add Long", "Remove Long" exists, the input value is `''` and the input has focus.
- `× removes the chip and the person is suggested again`.
- `Enter adds the first suggestion`: typing "duc" then Enter gives "Remove Đức".
- `Backspace in an empty field removes the last chip, and does nothing with no chips`.
- `no match and everyone chosen`: "xyz" shows 'No one called "xyz" in this group.'; with all 14 chosen, "Everyone in the group is already chosen."

Both:
- `Use replaces the selection`: with `recent = [{ expenseId: 'e-4', description: 'Cà phê Túi Mơ To', spentOn: '2026-10-10', people: [Minh, An, Chi] }]`, the row shows the description and "3 people". Clicking "Use the people from Cà phê Túi Mơ To" changes the header to "3 of 5".
- `no recent groups hides the section`: no text "Same people as".
- `Done closes`: clicking "Done" calls `onClose` once.

- [ ] **Step 2: Run them and see them fail** (Opus)

Run: `npm test -w @fsl/web -- split-people-sheet`
Expected: FAIL with the module not found.

- [ ] **Step 3: Build the sheet** from spec §6.1–6.5 and §9.2. The live region is visually hidden with `aria-live="polite"`.

- [ ] **Step 4: Run the tests and typecheck** (Opus). Read every changed file and check the reject thresholds in the UI companion §5.4 (code review now, screenshots in Task 8).

Run: `npm test -w @fsl/web -- split-people-sheet && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit** (Opus)

```bash
git add apps/web/src/components/SplitPeopleSheet.tsx apps/web/src/components/SplitPeopleSheet.css apps/web/src/i18n/en.ts apps/web/src/i18n/vi.ts apps/web/src/components/__tests__/split-people-sheet.test.tsx
git commit -m "feat(web): Split between sheet with recent groups, ticks and chip search"
```

---

### Task 7: Expense form — wire it together

**Delegation:** Gemini small build for `ExpenseForm.tsx` + `en.ts` + `vi.ts` and the new test file: `AGY_ALLOW="apps/web/src/screens/ExpenseForm.tsx,apps/web/src/i18n/en.ts,apps/web/src/i18n/vi.ts,apps/web/src/screens/__tests__/expense-form-auto.test.tsx"`, timeout 900, run in the background. Existing tests are updated by **(Opus)**.

**Files:**
- Modify: `apps/web/src/screens/ExpenseForm.tsx`
- Modify: `apps/web/src/i18n/en.ts`, `vi.ts` (the caption keys below)
- Test (new): `apps/web/src/screens/__tests__/expense-form-auto.test.tsx`
- Test (existing, Opus): `apps/web/src/screens/__tests__/expense-form.test.tsx`, `apps/web/src/screens/__tests__/roster-refresh.test.tsx`

**Interfaces:**
- Consumes: `SplitBetween` (Task 5), `SplitPeopleSheet` (Task 6), `recentGroups` (Task 3), `readSplitInput` / `fromEntryValue` (Task 2), and `computeShares` with nulls (Task 1).
- Changes inside `ExpenseForm.tsx`:
  - Render `<SplitBetween>` between the "Split" heading and `<SplitModePicker>`, and `<SplitPeopleSheet>` with `peopleSheetOpen` state. `recent = recentGroups(view.expenses, formPeople, included, expenseId)`.
  - Remove both row tick-box blocks (the sport row and the equal/adjust row). Rows render `formPeople.filter((p) => included.has(p.id))`.
  - `sharesInputs` and `adjustInputs` start as `''`.
  - `entries` uses `readSplitInput` for every person in `included`, in `formPeople` order. `{ ok: false }` marks the row invalid as today.
  - Placeholders follow spec §5.3.
  - `splitCaption(t, mode, people, result, total, assigned, autoCount, autoName)`, where `assigned` sums typed values only. The old `captionPeople` rule goes; `people = entries.length`.
- Copy (en): `split.captionPercentShare` "By percent · {n} people · {k} share the {pct}% left", `split.captionPercentLeftFor` "By percent · {n} people · {pct}% left for {name}", `split.captionPercentNothing` "By percent · {n} people · {k} owe nothing", `split.captionPercentNothingOne` "By percent · {n} people · {name} owes nothing", `split.captionExactShare` "Exact amounts · {n} people · {k} share {amount} left", `split.captionExactLeftFor` "Exact amounts · {n} people · {amount} left for {name}", `split.captionExactNothing` "Exact amounts · {n} people · {k} owe nothing", `split.captionExactNothingOne` "Exact amounts · {n} people · {name} owes nothing".

- [ ] **Step 1: Write the failing tests** in `expense-form-auto.test.tsx`. Use the same `renderAt` / `mockApi` / `tripView` / `rowOf` / `newRoute` / `editRoute` setup as `expense-form.test.tsx`: four people, Minh is `me`, and `e-4` is on Minh, An and Chi.
- `percent: 40% for Minh gives the other three 20% each`: with amount 1.000.000, Percent, and "40" typed for Minh, the box "Percent for An" has value `''` and placeholder `'20'`, `rowOf('An')` shows "200.000₫", and the caption is "By percent · 4 people · 3 share the 60% left".
- `exact: 400.000 for Minh gives the others 200.000 each`: the placeholder is `'200.000'` and the caption is "Exact amounts · 4 people · 3 share 600.000₫ left".
- `one blank box is named`: Percent with Minh 50, An 30, Bình 10 gives "By percent · 4 people · 10% left for Chi".
- `nothing left: they owe nothing and it still saves`: Minh 60, An 40 gives "By percent · 4 people · 2 owe nothing". "Add expense" is enabled, and the POST `entries` are `[{M,6000},{A,4000},{B,null},{C,null}]`.
- `over is still an error`: Minh 70, An 40 gives "By percent · 4 people · 10% over", and "Add expense" is disabled.
- `a typed 0 is sent as 0`: Exact with amount 100.000 and Minh "0" posts Minh `value: 0` and the others `null`.
- `shares and adjust boxes start empty with placeholders`: "Shares for An" has value `''` and placeholder `'1'`; "Adjustment for An" has placeholder `'0'`.
- `editing restores blank boxes`: the view gets an extra expense `e-6` in `percent` mode with shares M `{ amount: 72000, inputValue: 4000 }` and A/B/C `{ amount: 36000, inputValue: null }`, total 180.000, edited as Minh. "Percent for Minh" is `'40'`, and "Percent for An" is `''` with placeholder `'20'`.
- `an old percent expense opens filled; clearing a box makes it automatic`: `e-6` with inputValues `4000, 2000, 2000, 2000` opens with every box filled. Clearing Chi's box gives placeholder `'20'`, and on save the PATCH `entries` send Chi as `null` and the others as numbers.
- `the line opens the sheet, and unticking there takes the row away`: click the button whose name starts with "Split between", untick "Bình", then "Done". `rowOf('Bình')` is gone and the line reads "Split between · 3 of 4".
- `Use on a recent group`: "Use the people from Cà phê Túi Mơ To" leaves rows for Minh, An and Chi only.
- `taking someone out and back keeps what was typed`: Exact, amount 100.000, An "30.000". Untick An: the caption is "Exact amounts · 3 people · 3 share 100.000₫ left". Tick An again: "Amount for An" has value `'30.000'`.

- [ ] **Step 2: Run them and see them fail** (Opus)

Run: `npm test -w @fsl/web -- expense-form-auto`
Expected: FAIL (no "Split between" button, blank boxes left off).

- [ ] **Step 3: Implement the `ExpenseForm.tsx` and i18n changes listed above.**

- [ ] **Step 4: (Opus) Update the existing tests that encode the old behaviour,** and list each one in the commit message.
  - `expense-form.test.tsx`
    - *exact amounts that do not add up block saving*: type 80.000 for Minh and 30.000 for An, so it goes over and the error still shows.
    - *unticking someone leaves them out*, *shows each person's share as you type*, *says about when an equal split leaves a few dong over*: untick through the sheet.
    - *percent shows each amount as you type and what is left*: the captions become "4 share the 100% left", then "3 share the 40% left", "2 owe nothing", and "10% over" with n = 4.
    - *rounds a percent share to whole dong while you type*: the caption becomes "3 share the 66.67% left".
    - The exact-amounts caption test: the captions become "4 share 100.000₫ left", "3 share 50.000₫ left", "2 owe nothing", and "Exact amounts · 4 people · 10.000₫ over".
  - `roster-refresh.test.tsx` (Review Focus 3): after Chi is removed, also expect the button named "Split between You, An, Bình. Change".

- [ ] **Step 5: Run the whole web suite and typecheck** (Opus)

Run: `npm test -w @fsl/web && npm run typecheck`
Expected: PASS. Any other failure is either a real bug (fix it) or an old-behaviour expectation (update it and add it to the commit message list).

- [ ] **Step 6: Commit** (Opus)

```bash
git add apps/web/src/screens/ExpenseForm.tsx apps/web/src/i18n/en.ts apps/web/src/i18n/vi.ts apps/web/src/screens/__tests__/expense-form-auto.test.tsx apps/web/src/screens/__tests__/expense-form.test.tsx apps/web/src/screens/__tests__/roster-refresh.test.tsx
git commit -m "feat(web): choose who's in from the Split between sheet; blank boxes share what's left"
```

---

### Task 8: Full verification and visual check

**Delegation:** Opus.

- [ ] **Step 1: Run everything**

Run: `npm test && npm run typecheck`
Expected: all three workspaces PASS.

- [ ] **Step 2: Screenshots.** Start the `web` preview (`.claude/launch.json`). Take screenshots at 375px and 1280px of: the form in Percent with one typed and three automatic boxes; the sheet in a group of 12 or fewer (tick list + recent groups); and the sheet in a group of 13 or more (chips + suggestions). If no local group has 13 people, add guest names in a local dev group.

- [ ] **Step 3: Score** Layout, Visual Hierarchy and Usability from 1 to 5 for each screen, and check contrast of the placeholders (`--color-text-subtle`, 4.8:1). Reject and fix anything scoring below 4, following the UI companion's correction rounds.

- [ ] **Step 4: Commit** any fixes from Step 3 with a message naming what changed.
