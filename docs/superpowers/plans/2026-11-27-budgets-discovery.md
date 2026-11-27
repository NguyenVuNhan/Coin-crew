# Budgets discovery and first budget — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Implementers run as Orca workers (gemini-execution); the planner reviews and commits.

**Goal:** New users can find budgets from three places and create a first budget from their own spending in one tap (spec addendum D1–D6).

**Architecture:** One new pure core function suggests starter budgets from the same counted rows budgets already use; a data hook exposes it from the local copy only. Screens add an always-visible card, a gear row, a report-page action, and a short create form with starters.

**Tech Stack:** as in \`docs/superpowers/plans/2026-11-26-budgets.md\`.

**Spec:** \`docs/superpowers/specs/2026-11-26-budgets-design.md\` — "Addendum, 2026-11-27".

## Global Constraints
- Everything in the first plan's Global Constraints applies (never edit tests that existed before the feature branch; theme tokens only; vi lines end \`// REVIEW\`; ≤50 queries/request; no build or e2e by workers while the owner's tunnel is up).
- Starters: up to **3** expense categories, last **full calendar month**, amount = that month's spending rounded **up** to the next **100_000** (VND), budgets default to monthly from the 1st, currency VND, excluded wallets = VND wallets with \`excludeFromReports\`.

## Review Focus
1. A user with no spending last month (or only this month) → no starters, short form opens. → test in Task 13/14.
2. A category already budgeted never appears as a starter or gets the report "Đặt" action. → tests in Task 13/15.
3. Spending exactly 2_000_000 rounds to 2_000_000, not 2_100_000. → Task 13.
4. Tapping "Đặt" twice quickly creates one budget. → Task 14.
5. Back after creating returns to the starting screen, not to an open sheet. → Task 14.

---

### Task 13: Starter suggestions (core + hook)
**Files:** modify \`libs/shared/core/src/budgets.ts\`; modify \`libs/web/data-access/src/budgets.ts\`; tests NEW \`libs/shared/core/test/budgets-starters.test.ts\`, NEW \`libs/web/data-access/src/__tests__/budgets-starters.test.tsx\`.
**Interfaces (produces):**
\`\`\`ts
export interface BudgetStarter { categoryId: string; lastMonthSpent: number; suggestedAmount: number }
export function budgetStarters(defs: BudgetDef[], rows: CountedSpendRow[], categories: CategoryView[], today: string, opts?: { max?: number; currency?: CurrencyCode }): BudgetStarter[];
export function lastFullMonthSpent(rows: CountedSpendRow[], categoryId: string, categories: CategoryView[], today: string, currency?: CurrencyCode): number;
// data-access
export function useBudgetStarters(): { starters: BudgetStarter[]; ready: boolean }; // ready=false and [] unless the local copy is ready
export function useLastMonthCategorySpent(categoryId: string | null): number | null; // null unless copy ready
\`\`\`
Category roll-up: a sub-category's spending counts toward its top-level parent; starters are top-level expense categories only, sorted by spent desc, excluding categories (or their parents) that already have a category budget in VND. Excludes synthetic categories (\`__uncategorized__\`, \`__group__\`, \`__lend__\`, \`__borrow__\`). Wallets excluded from reports are left out.
- [ ] Tests: top 3 by spend with rounding up (2_130_000→2_200_000; 2_000_000→2_000_000); budgeted category skipped; no last-month rows → []; sub-category rolls up; synthetic categories skipped; USD rows ignored; hook returns [] and ready=false without the copy.
- [ ] Run \`npx nx run @cc/core:test\`, \`@cc/core:typecheck\`, \`@cc/web-data-access:test\`, \`@cc/web-data-access:typecheck\`.

### Task 14: Create sheet — starters, short form, prefill, after-create
**Files:** modify \`libs/web/screens/src/components/budgets/BudgetForm.tsx\`, \`libs/web/screens/src/screens/BudgetsScreen.tsx\` (only if the ?new=1 wiring needs the prefill params); en/vi; NEW test \`libs/web/screens/src/screens/__tests__/budget-create-starters.test.tsx\`.
- The create sheet reads optional URL params \`categoryId\` and \`amount\` (prefill → short form with both filled). Without them: starters list (from \`useBudgetStarters\`) with "Đặt" per row (one tap creates: monthly, start 1, VND, default exclusions, name = category name) and an editable amount; "Chọn danh mục khác" → short form. No starters / not ready → short form directly.
- Short form: what (Danh mục | Thẻ) + amount; "Thêm tuỳ chọn" expands period/start day, wallets, name. Edit mode unchanged.
- Double-tap guard on "Đặt" (disable while pending). After create: navigate to \`/budgets/<id>\` with \`replace: false\` from the starting screen so Back returns there, close the sheet, and \`showUndo\` snackbar "Đã đặt ngân sách {name}" with a Close action.
- [ ] Tests: starters render with rounded amounts and create in one tap with the exact POST body; editing a starter amount sends the edited amount; double tap → one POST; no starters → short form; prefill params fill category and amount; "Thêm tuỳ chọn" hides/shows advanced fields; after create lands on the budget page and Back returns to the origin.
- [ ] Run \`npx vitest run src/screens/__tests__/budget --root libs/web/screens\`, \`npx nx run @cc/web-screens:typecheck\`, \`npx nx run @cc/web-i18n:test\`.

### Task 15: The three doors
**Files:** modify \`libs/web/screens/src/components/budgets/BookBudgets.tsx\` (empty state: line + secondary "Đặt ngân sách" → opens the create sheet via \`/budgets?new=1\`), \`libs/web/screens/src/components/PersonalSettingsMenu.tsx\` (row "Ngân sách" with count → \`/budgets\`), \`libs/web/screens/src/screens/ReportCategoryScreen.tsx\` (action under the summary card: no budget → "Đặt ngân sách cho {name} · tháng trước {amount}" → \`/budgets?new=1&categoryId=…&amount=…\` (amount = last month rounded up); budget exists → "Xem ngân sách" → \`/budgets/<id>\`; hidden for income and synthetic categories); en/vi; NEW tests \`book-budgets-empty.test.tsx\`, \`settings-budgets-row.test.tsx\`, \`report-category-budget-action.test.tsx\`.
- Must not edit existing tests (\`spending-book.test.tsx\`, reports tests, \`book-budgets.test.tsx\` from this branch may be amended only where D1 changes "hidden when no budgets").
- [ ] Tests: card visible with no budgets and its button opens the sheet; gear row present with count; report action for an unbudgeted expense category with the right href, "Xem ngân sách" when budgeted, absent for income.
- [ ] Run the screens vitest for these files + typecheck.

### Task 16: Discovery e2e + gate
**Files:** NEW \`e2e/budgets-discovery.spec.ts\`.
- From a fresh account with the book on, a wallet and last-month expenses, no budgets: see the card's empty state → open sheet → starters show → tap "Đặt" → land on the budget page; Back to Sổ chi tiêu; gear → Ngân sách → page lists it; a category report shows "Xem ngân sách". 375px, Vietnamese.
- Coordinator runs the full gate (npm test, typecheck, lint, e2e budgets, budgets-discovery, golden-path, walkthrough with WALKTHROUGH=1), then restarts the tunnel.
