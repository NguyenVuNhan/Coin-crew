# Group shares Part 3: the entry page (option C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo, implementer tasks run as Orca workers (`gemini-execution` skill): **H** = `gemini-4-hydrogen-medium`, **N** = `gemini-4-neon-medium`. Workers never install packages, run tests or touch git; the planner runs every command below.

**Goal:** On the Sổ chi tiêu "+" page, Chi gets an optional "Chia với ai?" block, and Vay/Nợ becomes a pure-loan form. Recording money with a person takes 2–4 taps after the amount (spec section 7).

**Architecture:** Both tabs share one new state hook (`useQuickSplit`) and three new entry-only components (people chips, folded "Cách chia", outcome sentence) inside `EntryPage`. Empty "Chia với ai?" saves a personal entry as today. With people, it saves through the existing quick-expense route (`POST /api/trips/<direct>/expenses`), then writes the Part 1 link (`PUT /api/me/personal/group-links/:rootId`) carrying intent, category, wallet, tags and the report switch. Vay/Nợ stops embedding the group form (`QuickExpenseEmbed`), so the group form and the group-only quick-expense page are no longer on this path at all.

**Tech Stack:** React + React Query, shadcn/Tailwind v4 wrappers from `@cc/web-ui`, `@cc/core` split maths (`computeShares`), vitest + Testing Library, Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-11-21-group-shares-in-spending-book-design.md`, section 7 (also 4.1 "Loans from Vay/Nợ", 5, 9 last table row, 10). Mocks: `.superpowers/brainstorm/1483-1795232631/content/entry-c-fewer-taps.html` and `entry-c-split-mode.html`.

**Branch:** `feat/group-shares-entry`, cut from `feat/group-shares-screens` (PR #142). The PR is stacked on #142 until #142 merges, then retargets `main`.

## Global Constraints

- The group expense form, the group-only quick-expense page (`/t/<direct>/expenses/new`, `isDirect` without embed), `SplitModePicker` and `SplitPeopleSheet` render and behave exactly as today. Do not change those files.
- No edits to existing tests without the owner's approval. Task 8 is the only place that happens.
- Quick-expense description is 1–80 characters: the trimmed note, else the category name (Chi), else "Cho vay" / "Đi vay" (Vay/Nợ). Cut at 80.
- Money is integer VND. Quick expenses live in the direct group, which is VND only.
- New Vietnamese strings carry `// REVIEW`, with English added second (`libs/web/i18n`).
- Tests select by `fsl-*` classes and `data-testid`. Touch targets `min-h-11`, fields `text-base`, money `tabular-nums`, theme colours only (`bg-success-soft`, `text-success`…). The style guard test enforces the last two.
- The outcome sentence uses text plus colour, never colour alone.
- Only direct-group people can be in a quick expense. "+" opens the existing `SplitPeopleSheet`, including adding a new name.
- Vay/Nợ creates with `intent = 'loan'` and the category "Cho vay" (you lent) or "Đi vay" (you borrowed). Chi with people creates with `intent = 'shared'` and the picked category.

## Review Focus

1. **The link write fails after the expense is saved.** Expected: no second expense is created. The page shows an error with "Thử lại", and the retry writes only the link. Pinned in Task 2 and e2e E-10.
2. **A non-VND wallet is picked.** Expected: "Chia với ai?" is hidden on Chi, and Vay/Nợ offers only VND wallets. Pinned in Tasks 6 and 7.
3. **The direct ledger is slow or fails to load.** Expected: Chi still saves plain spending, with the people block hidden. Vay/Nợ shows `InlineError` with retry. Pinned in Tasks 6 and 7.
4. **A brand-new name is added from "+".** Expected: the person is added to the direct group, used in this expense, and shown first among the chips next time. Pinned in Tasks 3 and 4.
5. **Switching tabs or pressing back mid-entry.** Expected: the amount and people survive a Chi ↔ Vay/Nợ switch, and the ⇄ flip resets. Picked people count as unsaved input for the leave guard. Pinned in Task 7.

---

### Task 1 (H): Pure helpers in core

**Files:**
- Create: `libs/shared/core/src/quickEntry.ts`; export it from `libs/shared/core/src/index.ts`
- Test: `libs/shared/core/test/quickEntry.test.ts`

**Interfaces (produces):**
```ts
export function recentDirectPeopleIds(view: Pick<TripView, 'people' | 'expenses' | 'payments'>, meId: string, limit?: number /* 4 */): string[];
export interface OwedLine { personId: string; amount: number; direction: 'owesMe' | 'iOwe' }
export function owedLines(shares: { participantId: string; amount: number }[], payerId: string, meId: string): { myShare: number; lines: OwedLine[] };
export function quickExpenseDescription(input: { note: string; fallback: string }): string;
export type TimeBand = 'morning' | 'midday' | 'afternoon' | 'evening' | 'night';
export function timeBand(hour: number): TimeBand;   // 5–9 morning, 10–13 midday, 14–17 afternoon, 18–22 evening, else night
export type AmountBand = 'small' | 'medium' | 'large' | 'huge';
export function amountBand(vnd: number): AmountBand; // <50k, 50k–<200k, 200k–<1M, ≥1M
export interface GuessEntry { categoryId: string | null; type: 'expense' | 'income' | string; amount: number; date: string; time: string | null; createdAt: string }
export interface GuessPersonRow { personNames: string[]; categoryId: string | null; activityAt: string }
export function guessExpenseCategory(input: { entries: GuessEntry[]; personRows: GuessPersonRow[]; personNames: string[]; amount: number; now: Date }): string | null;
```

- [ ] **Step 1: Write the failing tests** (`describe('quickEntry')`):
  - `recentDirectPeopleIds`:
    - the people of the latest-`createdAt` expenses and payments (payer, shares, payment from/to) come newest first;
    - `meId` and `status !== 'active'` people are excluded;
    - no duplicates;
    - the list is padded with the remaining active people in `people` order, then cut to `limit`.
  - `owedLines`:
    - 50k, shares me 25k / Minh 25k, payer me → `{ myShare: 25000, lines: [{ personId: 'minh', amount: 25000, direction: 'owesMe' }] }`;
    - same shares, payer Minh → `[{ personId: 'minh', amount: 25000, direction: 'iOwe' }]`;
    - loan with shares Minh 50k only, payer me → `myShare: 0`, Minh owes me 50k;
    - borrowed, shares me 50k, payer Minh → `myShare: 50000`, I owe Minh 50k.
  - `quickExpenseDescription`:
    - `'  '` with fallback `'Cà phê'` → `'Cà phê'`;
    - a 100-character note → its first 80 characters, trimmed.
  - `timeBand`: 4 → night, 5 → morning, 13 → midday, 22 → evening, 23 → night.
  - `amountBand`: 49_999 → small, 50_000 → medium, 1_000_000 → huge.
  - `guessExpenseCategory`:
    - the last category used with the same person (newest `activityAt` among `personRows` whose `personNames` meet `personNames`) wins over the band rule;
    - otherwise, the most used `expense` category in the same time band and amount band within 90 days of `now`, needing at least 2 matches; a tie goes to the most recent;
    - an entry's hour comes from `time`, else the local hour of `createdAt`;
    - entries older than 90 days are ignored;
    - with no support → `null`.
- [ ] **Step 2:** Run `npx nx run core:test -- quickEntry`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement in `quickEntry.ts`. These are pure functions, so no imports beyond `@cc/core` types.
- [ ] **Step 4:** Run it again. Expected: PASS.
- [ ] **Step 5:** Commit `feat(core): helpers for entering money with a person`.

### Task 2 (H): Save a quick share (expense, then link)

**Files:**
- Create: `libs/web/data-access/src/quickShare.ts`
- Test: `libs/web/data-access/src/__tests__/quick-share.test.tsx`

**Interfaces:**
- Consumes: `apiSend` (`./client`); `UpdateGroupLinkInput` and the invalidation used by `useUpdateGroupLink` (`./personalMoney`).
- Produces:
```ts
export interface QuickShareInput {
  tripId: string;
  expense: { description: string; amount: number; spentOn: string; payerId: string; mode: SplitMode; entries: { participantId: string; value: number }[] };
  link: UpdateGroupLinkInput & { intent: 'shared' | 'loan' };
}
export function useSaveQuickShare(): {
  save(input: QuickShareInput): Promise<{ expenseId: string }>;
  retryLink(): Promise<void>;     // only after save() threw a QuickShareLinkError
  isSaving: boolean;
  error: unknown;                 // ApiClientError from the POST, or QuickShareLinkError
};
export class QuickShareLinkError extends Error { expenseId: string }
```
The `expense` body is what `addTripExpense` in `e2e/group-shares-helpers.ts` posts. `entries[].value` is the per-mode input value, the same one `ExpenseForm` sends.

- [ ] **Step 1: Write the failing tests:**
  - `save` POSTs `/api/trips/t-led/expenses` with the body, then PUTs `/api/me/personal/group-links/<expenseId>` with `link`, in that order;
  - on success it invalidates the personal list and the trip view `['trip', tripId]`, and calls `requestTxCopySync`;
  - a POST failure throws the `ApiClientError` and makes no PUT;
  - a PUT failure (500) throws `QuickShareLinkError` with `expenseId`;
  - `retryLink()` then PUTs the same link again and makes no second POST.
- [ ] **Step 2:** Run `npx nx run web-data-access:test -- quick-share`. Expected: FAIL.
- [ ] **Step 3:** Implement it. Keep the last `{ expenseId, link }` in a ref so `retryLink` can resend.
- [ ] **Step 4:** Run it again. Expected: PASS.
- [ ] **Step 5:** Commit `feat(web): save a quick share with its personal link`.

### Task 3 (N): `useQuickSplit` state hook

**Files:**
- Create: `libs/web/screens/src/components/quickShare/useQuickSplit.ts`
- Test: `libs/web/screens/src/components/quickShare/__tests__/use-quick-split.test.tsx`

**Interfaces:**
- Consumes: `computeShares`, `SplitMode`, `SplitResult`, `TripView` (`@cc/core`); `recentDirectPeopleIds`, `owedLines` (Task 1). For adding names from other groups into the direct ledger, use the same `splitExtra` wiring as `ExpenseForm.tsx:325-358` (read it, do not import from it).
- Produces:
```ts
export type QuickSplitKind = 'shared' | 'loan';
export interface QuickSplit {
  people: PersonView[];            // active direct-group people
  chipIds: string[];               // recentDirectPeopleIds(view, me, 4)
  chosen: ReadonlySet<string>;     // people picked; never contains me unless toggled in
  toggle(id: string): void;
  setChosen(next: Set<string>): void;
  flipped: boolean;                // ⇄: someone else paid (shared) / I borrowed (loan)
  setFlipped(v: boolean): void;
  payerId: string;                 // see rules below
  setPayerId(id: string): void;    // used when flipped with several people
  mode: SplitMode; setMode(m: SplitMode): void;
  inputs: Record<string, string>; setInput(personId: string, v: string): void;
  splitParticipants: string[];     // who the split runs over (rules below)
  result: SplitResult | null;      // computeShares(amount, mode, …) or null without amount/people
  outcome: ReturnType<typeof owedLines> | null;
  canFlip: boolean;
  splitExtra: SplitPeopleSheetProps['extra'];
  isDirty: boolean;                // chosen.size > 0
  reset(): void;
}
export function useQuickSplit(args: { view: TripView | null; me: string | null; kind: QuickSplitKind; amount: number | null }): QuickSplit;
```
**Rules (spec section 7, decided here):**

| kind | flipped | split over | payer |
|---|---|---|---|
| shared | no | me + chosen | me |
| shared | yes | me + chosen | the one chosen person, or `payerId` picked among chosen when there are several |
| loan | no | chosen only (me only if toggled in) | me |
| loan | yes | me, the whole amount | the one chosen person |

- `canFlip` is true when chosen is not empty. For a loan it also needs exactly one person, because one expense has one payer: "Bạn nợ Minh, Lan" cannot be a single expense.
- Equal mode passes `value: 1` for each participant. Other modes take `inputs`.
- Changing `kind` keeps `chosen` and resets `flipped`.

- [ ] **Step 1: Write the failing tests** with `renderHook`. Cover each row of the table:
  - for 50k with Minh, the resulting `shares` and `payerId`;
  - loan with Minh and Lan for 100k → 50k each and `outcome.lines` names both;
  - loan with two people → `canFlip === false`;
  - shared + flipped with two people → `payerId` defaults to the first chosen, and `setPayerId` changes it;
  - `amounts` mode with 20/50/50 on 120k → ok; 20/50/40 → `result.ok === false`;
  - switching `kind` keeps `chosen` and resets `flipped`;
  - `chipIds` puts a person just added through `setChosen` first after the view refetches with their new expense.
- [ ] **Step 2:** Run `npx nx run web-screens:test -- use-quick-split`. Expected: FAIL.
- [ ] **Step 3:** Implement it.
- [ ] **Step 4:** Run it again. Expected: PASS.
- [ ] **Step 5:** Commit `feat(web): quick split state for the entry page`.

### Task 4 (H): People chips and the outcome sentence

**Files:**
- Create: `libs/web/screens/src/components/quickShare/PeopleChips.tsx`, `libs/web/screens/src/components/quickShare/OutcomeSentence.tsx`
- Modify: `libs/web/i18n/src/vi.ts`, `libs/web/i18n/src/en.ts` (the keys below)
- Test: `libs/web/screens/src/components/quickShare/__tests__/people-chips.test.tsx`

**Interfaces:**
- Consumes: `QuickSplit` (Task 3), `Pill`, `Avatar`, `Icon` (`@cc/web-ui`), `SplitPeopleSheet` (unchanged).
- Produces:
  - `<PeopleChips split={split} label={string} me={string|null} testId="entry-people" />`. It renders:
    - the `chipIds` chips;
    - any chosen person not among the chips;
    - a **"Bạn"** chip whenever `me` is chosen;
    - "+", which opens `SplitPeopleSheet` with `split.people`, `chosen`, `me`, `extra={split.splitExtra}`.

    Each chip is a toggle button with `aria-pressed`, `min-h-11`, `data-testid="entry-person-<id>"`; "+" is `entry-people-more`.
  - `<OutcomeSentence split={split} kind={QuickSplitKind} names={Map<string,string>} onFlip={() => void} />`. It renders `fsl-outcome` in `bg-success-soft` above the save bar, with `aria-live="polite"`. The ⇄ chip is shown only when `canFlip` (`data-testid="entry-flip"`, aria-label `entry.flip`).
- Copy (vi, all `// REVIEW`; en second):
  - `entry.shareWith`: "Chia với ai? (không bắt buộc)"
  - `loanDebt.withWho`: stays "Với ai"
  - `entry.me`: "Bạn"
  - `entry.flip`: "Đổi người trả"
  - `outcome.myShare`: "Phần bạn {amount}"
  - `outcome.owesMe`: "{name} nợ bạn {amount}"
  - `outcome.eachOwesMe`: "{names} mỗi người nợ bạn {amount}" (used when every line is equal and there are 2+)
  - `outcome.iOwe`: "Bạn nợ {name} {amount}"
  - `outcome.paidBy`: "{name} trả"
  - Lines join with " · ". Shared: "Phần bạn 25.000₫ · Minh nợ bạn 25.000₫"; flipped: "Minh trả · Bạn nợ Minh 25.000₫". Loan: no "Phần bạn" part.
- [ ] **Step 1: Write the failing tests:**
  - chips render in `chipIds` order;
  - tapping a chip toggles `aria-pressed`;
  - choosing me from the sheet shows the "Bạn" chip;
  - the sentence reads exactly "Phần bạn 25.000₫ · Minh nợ bạn 25.000₫" for shared 50k with Minh, and "Minh, Lan mỗi người nợ bạn 50.000₫" for a 100k loan with Minh and Lan;
  - ⇄ is absent for a two-person loan.
- [ ] **Step 2:** Run `npx nx run web-screens:test -- people-chips`. Expected: FAIL.
- [ ] **Step 3:** Implement it.
- [ ] **Step 4:** Run it again. Expected: PASS.
- [ ] **Step 5:** Commit `feat(web): people chips and outcome sentence for the entry page`.

### Task 5 (H): Folded "Cách chia"

**Files:**
- Create: `libs/web/screens/src/components/quickShare/SplitFold.tsx`
- Test: `libs/web/screens/src/components/quickShare/__tests__/split-fold.test.tsx`

**Interfaces:**
- Consumes: `QuickSplit` (Task 3), `SplitModePicker` (unchanged), `Input`.
- Produces: `<SplitFold split={split} amount={number|null} names={Map<string,string>} />`.
  - Folded, it is one row, "Cách chia · Chia đều · 3 người ›", using `loanDebt.splitSummaryCount` with the mode label (`data-testid="entry-split-fold"`).
  - Tapping it opens in place: `SplitModePicker`, then one row per split participant with that mode's input (`data-testid="entry-split-input-<id>"`), the same input types and placeholders as the per-person rows in `LoanDebtEmbedForm.tsx`.
  - When the split doesn't add up, `splitError.<code>` shows under it with `role="alert"`.
  - The row is hidden when fewer than 2 people are in the split.
- [ ] **Step 1: Write the failing tests:**
  - folded text for 120k equal over 3 people;
  - opening shows the five modes;
  - typing 20/50/50 in `amounts` calls `setInput` each time;
  - a mismatch shows the alert;
  - no row with a single participant.
- [ ] **Step 2:** Run `npx nx run web-screens:test -- split-fold`. Expected: FAIL.
- [ ] **Step 3:** Implement it.
- [ ] **Step 4:** Run it again. Expected: PASS.
- [ ] **Step 5:** Commit `feat(web): folded split modes for the entry page`.

### Task 6 (N): Chi with "Chia với ai?" and the category guess

**Files:**
- Modify: `libs/web/screens/src/screens/EntryPage.tsx` (the Chi branch and save path only)
- Modify: `libs/web/screens/src/components/CategoryPicker.tsx` (new optional prop `guessedId?: string | null`, drawn with a dashed `border-primary` ring and `data-guess="true"`; no change when it is absent)
- Create: `libs/web/screens/src/components/quickShare/useCategoryGuess.ts`
- Test: `libs/web/screens/src/screens/__tests__/entry-share-with.test.tsx`

**Interfaces:**
- Consumes:
  - Tasks 1–5;
  - `useLedger` (`@cc/web-data-access/people`) for the direct `tripId` and `useTripView(tripId, 20000, { stopAfterMs: 15 * 60_000 })` (`@cc/web-data-access/hooks`) for its view;
  - `useTxCopy` (entries) and `useCopyGroupRows` (group rows with `people` / `counterpartName` and `link.categoryId`) for the guess.
- Produces: `useCategoryGuess({ personNames, amount, enabled }): string | null`. It calls `guessExpenseCategory` with `now = new Date()`; with the copy unavailable it returns `null`.

**Behaviour:**
- When does the block show? On create, on Chi, outside transfer and trade modes, with a VND wallet and a loaded ledger. The block is `PeopleChips` under the category, then `SplitFold`, then `OutcomeSentence` once someone is chosen.
- **Guess:** when the user hasn't picked a category, `categoryId` takes the guess and the picker gets `guessedId`. Any tap on a category clears the guess flag.
- **No people chosen:** save exactly as today (`useCreateEntry`).
- **People chosen:** `useSaveQuickShare().save` with:
  - `description = quickExpenseDescription({ note, fallback: categoryName })`;
  - the split's payer, mode and entries;
  - `link = { intent: 'shared', categoryId, walletId, tagIds, excludeFromReports }`.

  Then do the same back-and-snackbar as a personal save.
- A `QuickShareLinkError` shows `InlineError` with "Thử lại" calling `retryLink`, with no second POST.
- Lưu is disabled while `split.result?.ok === false`.
- The ledger loading or failing hides the block. Chi still saves plain spending.

- [ ] **Step 1: Write the failing tests** with `renderAt(<App/>, { route: '/entries/new' })` and `mockApi`, mocking `GET /api/me/ledger` and `GET /api/trips/t-led`:
  - (a) with no person, Lưu POSTs `/api/me/personal/transactions` as today;
  - (b) 50k, tap `entry-person-p-minh`, Lưu → POST `/api/trips/t-led/expenses`:
    - body `{ description: 'Ăn uống', amount: 50000, payerId: 'p-me', mode: 'equal', entries: [{participantId:'p-me',value:1},{participantId:'p-minh',value:1}] }`;
    - then PUT `/api/me/personal/group-links/<id>` with `{ intent: 'shared', categoryId: 'cat-food', walletId: 'w-bank' }`;
  - (c) ⇄ makes `payerId: 'p-minh'` and the sentence "Minh trả · Bạn nợ Minh 25.000₫";
  - (d) the link PUT returns 500 → alert shown; "Thử lại" PUTs again; exactly one POST to expenses;
  - (e) picking a USD wallet hides `entry-people`;
  - (f) `GET /api/me/ledger` 500 → no `entry-people`, and the plain save still works;
  - (g) with a stubbed `useTxCopy` holding two 45k morning entries in `cat-coffee` at 8:00 and the clock at 8:30, the picker shows `cat-coffee` with `data-guess="true"`; Xong then Lưu saves `cat-coffee` (2 taps).
- [ ] **Step 2:** Run `npx nx run web-screens:test -- entry-share-with`. Expected: FAIL.
- [ ] **Step 3:** Implement it. Keep new JSX in the Task 4/5 components. `EntryPage` only wires state and the save branch.
- [ ] **Step 4:** Run `npx nx run web-screens:test -- entry`. Expected: the new file passes. Note every **existing** `entry-*` test that fails; Task 8 handles them. Do not edit them here.
- [ ] **Step 5:** Commit `feat(web): Chi can be shared with a person from the entry page`.

### Task 7 (N): Vay/Nợ as a pure-loan form

**Files:**
- Modify: `libs/web/screens/src/screens/EntryPage.tsx`. The `loan-debt` tab renders the entry page's own form, with no category row and with `PeopleChips` labelled "Với ai?", instead of `<QuickExpenseEmbed>`.
- Test: `libs/web/screens/src/screens/__tests__/entry-loan.test.tsx`

**Interfaces:**
- Consumes: Tasks 1–6. The loan categories are the starters seeded by `GET /api/me/personal/group-settings` (`apps/api/src/personal/groupLinks.ts` `GROUP_STARTERS`). Their ids are fixed: `<userId>:lend` ("Cho vay", expense) and `<userId>:borrow` ("Đi vay", income). The ids survive a rename. Call `useGroupSettings()` on the tab so they exist, then find them in `useCategories()` by id suffix `:lend` / `:borrow`. If one is missing (the user hid it, or deletion left none), send `categoryId: null`, which falls back to the group default, and show nothing extra.
- Produces: no new exports.

**Behaviour:**
- **Order:** amount, "Với ai?", outcome sentence, then the folded details line "Hôm nay · Techcombank · Không ghi chú ›". The details line holds Ví (VND wallets only), Ngày, then Ghi chú (optional, no "Bánh tráng nướng, chợ đêm" placeholder), Thẻ and "Không tính vào báo cáo".
- There is no "Người trả" row and no "trong nhóm".
- **Saving:**
  - `description = quickExpenseDescription({ note, fallback: flipped ? 'Đi vay' : 'Cho vay' })`;
  - `link = { intent: 'loan', categoryId: flipped ? borrowId : lendId, walletId, tagIds, excludeFromReports }`.
- Lưu is disabled until there is an amount and at least one person, and the split adds up.
- Switching Chi ↔ Vay/Nợ keeps the amount and the people, and resets ⇄. The leave guard counts chosen people as unsaved input.

- [ ] **Step 1: Write the failing tests:**
  - (a) "Với ai: Minh, paid by you, 50k":
    - three interactions after the amount (Xong, Minh, Lưu);
    - POST body `payerId: 'p-me'`, `entries: [{participantId:'p-minh',value:1}]`, `description: 'Cho vay'`;
    - link `{ intent: 'loan', categoryId: 'cat-lend' }`;
  - (b) ⇄:
    - POST `payerId: 'p-minh'`, `entries: [{participantId:'p-me',value:1}]`;
    - link category `cat-borrow`;
    - sentence "Bạn nợ Minh 50.000₫";
  - (c) Minh and Lan, 100k → the sentence names both; no `entry-flip`;
  - (d) no `loan-debt-payer-row`; the note is not required;
  - (e) in DOM order, Ngày comes before Ghi chú inside the opened details;
  - (f) the wallet list has no USD wallet;
  - (g) Chi → Vay/Nợ → Chi keeps the 50k and Minh chosen, with ⇄ off;
  - (h) back with Minh chosen asks before leaving.
- [ ] **Step 2:** Run `npx nx run web-screens:test -- entry-loan`. Expected: FAIL.
- [ ] **Step 3:** Implement it.
- [ ] **Step 4:** Run `npx nx run web-screens:test -- entry`. Expected: the new files pass. Note the failing existing tests for Task 8.
- [ ] **Step 5:** Commit `feat(web): Vay/Nợ records a loan only over the people picked`.

### Task 8 (planner): Existing-test gate with the owner

These existing tests are expected to fail, because they pin today's Vay/Nợ layout:
- `entry-critique-step2.test.tsx`:
  - "orders Với ai -> Người trả -> Ghi chú";
  - "opens Payer sheet with you first…".
- `entry-review-r2.test.tsx`:
  - "Vay/Nợ tab shows quick-expense form…";
  - "?type=loan-debt opens directly … embedded quick-expense form";
  - "saving a quick expense from Vay/Nợ posts…": the body no longer includes you, and a link PUT follows.
- Possibly `entry-critique-step1` "3. leave guard … Vay/Nợ tab switch" and `entry-critique-step3` "Vay/Nợ shows the row without time".

- [ ] **Step 1:** Run `npx nx run web-screens:test`. Record the exact failing tests and the assertion that fails in each.
- [ ] **Step 2:** Ask the owner, listing each test with its old assertion and the proposed new one. Edit only the approved ones; drop or rewrite each as the owner decides.
- [ ] **Step 3:** Run `npm test`. Expected: all pass.
- [ ] **Step 4:** Commit `test(web): Vay/Nợ tests follow the owner-approved loan form (owner approved)`.

### Task 9 (planner): Remove the old embed

- [ ] **Step 1:** Delete `QuickExpenseEmbed` and the `embedded` branch from `ExpenseForm.tsx`, and delete `components/LoanDebtEmbedForm.tsx`. Keep every non-embedded line of `ExpenseForm` byte-identical; check with `git diff --stat` and by reading the diff.
- [ ] **Step 2:** Run `npm test`, `npm run typecheck` and `npm run lint`. Expected: all green, with the group-form tests untouched.
- [ ] **Step 3:** Commit `refactor(web): drop the embedded group form from the entry page`.

### Task 10 (H writes, planner runs): E2E catalogue E-01…E-12

**Files:**
- Create: `e2e/entry-with-person.spec.ts`
- Modify: `e2e/group-shares-helpers.ts`, adding only new helpers: `openEntry(page, type?)`, `typeAmount(page, digits)`, `directView(page)`.

Each case runs on the existing `MATRIX`, uses `setupDaLatScenario` or `setupNhanBook`, and ends with `saveShot`.

| ID | Case | Expected |
|---|---|---|
| E-01 | Solo 45k coffee at the usual time, guess right | 2 taps after the amount; a personal entry in Cà phê |
| E-02 | Chi 50k, Minh | Direct group: me 25k / Minh 25k, payer me. Sổ: −25k "phần của bạn" in the picked category; wallet −50k; Minh's group shows it |
| E-03 | Chi 50k, Minh, ⇄ | Payer Minh; "Bạn nợ Minh 25.000₫"; wallet unchanged; spending 25k |
| E-04 | Vay/Nợ, lent Minh 50k | 3 taps; Minh owes Nhan 50k in the group; Sổ row under Cho vay, not in spending (countLoans off); wallet −50k |
| E-05 | Vay/Nợ, borrowed 50k from Minh | 4 taps; Nhan owes Minh 50k; Đi vay; wallet +50k; not income |
| E-06 | Lent Minh and Lan 100k | 50k each; the sentence names both |
| E-07 | 120k with Minh and Lan, exact 20/50/50 | Lưu disabled at 20/50/40; saved shares 20/50/50 |
| E-08 | Old 50/50 quick expense (created via `/t/<direct>/expenses/new` first) | Still −25k "phần của bạn"; its group edit page lists you in the split; saving unchanged keeps the shares; link intent stays null |
| E-09 | Group-only quick-expense page | Still includes you by default and saves as before |
| E-10 | `page.route` makes the link PUT 500 once | Error with retry; retry succeeds; exactly one expense in the group |
| E-11 | USD wallet picked on Chi | No "Chia với ai?"; Vay/Nợ wallet list has no USD |
| E-12 | countLoans on: lend Minh 50k, then Minh pays back 50k | +50k spending under Cho vay, then +50k income |

- [ ] **Step 1:** The worker writes the spec and helpers.
- [ ] **Step 2:** Run `npm run e2e -- entry-with-person`. Expected: all pass. Fix the helpers yourself; real permission rules win over the test's assumptions.
- [ ] **Step 3:** Add the E-01…E-12 table to this plan under "As built" if anything changed.
- [ ] **Step 4:** Commit `test(e2e): entry page with a person (E-01…E-12)`.

### Task 11 (planner): Gate and handoff

- [ ] Run `npm test`, `npm run typecheck`, `npm run lint`, then `WALKTHROUGH=1 npm run e2e`. Expected: all green, `golden-path` and `walkthrough` included.
- [ ] `/impeccable polish` the entry page against the two mocks at 375px and 1024px. Fix what one look shows, then look again.
- [ ] Push `feat/group-shares-entry`. Open the PR (base `feat/group-shares-screens` while #142 is open).
- [ ] Restart the tunnel on the new build, probe it in a browser, and give the owner the URL. Stop until they approve.
