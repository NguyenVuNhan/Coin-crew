# Recurring transactions and the "to confirm" list: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo, implementer work runs as Orca workers per the `gemini-execution` skill; the planner reviews each worktree diff and runs the tests.

**Goal:** Rules that record personal transactions on schedule (Vietnam dates, exactly once, with catch-up), a check-in that pauses forgotten rules, "ask me" occurrences, rule suggestions, and one shared "to confirm" list.

**Architecture:** Pure schedule and run-planning maths in `@cc/core` (`recurring.ts`), shared by API and web. The API stores rules and planned items in new D1 tables, writes occurrences through one entry-write helper extracted from the existing transaction POST route, and runs a dedicated hourly cron (`15 * * * *`) with a statement budget. The web adds a Định kỳ screen, a home row, a repeat section in the entry form, and a "still due" line on budgets.

**Tech Stack:** TypeScript 7 (`tsc`), Hono on Cloudflare Workers, D1 + Drizzle, Vitest (`cloudflare:test` for API, Testing Library for web), React + React Query, shadcn/ui + Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-11-27-recurring-transactions-design.md` (R1–R21, §4–§11). Read it before any task.

## Global Constraints

- Additive only: migrations create new tables and indexes; never alter, drop or add a column to an existing table.
- Do not edit: `libs/api/db/src/commit.ts`, `computeBalances`, `computeShares`, `suggestTransfers`, `apps/api/src/trips/snapshot.ts`, `apps/api/src/me/balances.ts`, `apps/api/src/me/settle.ts`, `apps/api/src/me/ledger.ts`, `libs/api/auth/src/device.ts`, the group expense and payment routes.
- Never edit or delete an existing test. Gemini workers may add tests, never run them; the planner runs them.
- At most 50 database queries per request **and per cron invocation**; 100,000 rows written / 5,000,000 read per day.
- Every new route uses `requirePersonal` (`@cc/api-auth/personal`). Personal data is private to its owner.
- Migration `apps/api/migrations/0038_personal_recurring.sql`, hand-written; `libs/api/db/src/schema.ts` kept in step by hand. No `drizzle-kit generate`.
- Money is whole numbers in the currency's smallest unit; never a float.
- No push, email or SMS about any of this.
- Never name new code "ledger"; use `recurring` / `planned`.
- Same screens in `apps/web` and `apps/zalo`; platform things via `usePlatform()`.
- Dates are `YYYY-MM-DD` Vietnam calendar dates (UTC+7).
- UI: `DESIGN.md` and `PRODUCT.md` first; wrappers in `@cc/web-ui/components/*` first; theme colours only; phones first at 375px; `min-h-11` touch targets; money `tabular-nums`; Vietnamese first, every new `vi.ts` line ends `// REVIEW`; tests select by `fsl-*` classes and `data-testid`.
- Before merge: `npm test`, `npm run typecheck`, `npm run lint`, `npm run e2e -- golden-path`, `npm run e2e -- walkthrough` pass.

## Deviations from the spec (planner's calls)

- Buy rules have no fee: the buy input (`parseEntryInput`) has no fee field, so spec §5's "usual fee" is dropped.
- The job runs in its own trigger `15 * * * *` with a 45-statement budget instead of "25 rules × 31 occurrences" (see below); still hourly, still bounded.

## Review Focus

1. **Two runs at once** (cron overlap, or create-route inline run racing the cron): each occurrence recorded once and balances moved once. Pinned in Task 5 (`concurrent runs record once`).
2. **The Vietnam midnight edge:** at 16:59 UTC on the 4th a rule "on the 5th" records nothing; at 17:15 UTC it records, dated the 5th. Pinned in Task 5.
3. **Editing a rule whose schedule moves** (e.g. day 5 → day 20, or start date moved back): no back-fill of dates before the edit, no second occurrence for a date already made. Pinned in Task 4.
4. **A rule pointing at an archived wallet or deleted category/asset:** pauses with a reason once; the job doesn't retry it every hour. Pinned in Task 5.
5. **Double-tapping Xác nhận** on a waiting item: one transaction. Pinned in Task 6.

## Statement budget (decided here, refines spec §11)

D1 batch statements are counted as queries, so the cron works to a **budget of 45 statements per invocation**, in its own cron trigger `15 * * * *` (added to `apps/api/wrangler.jsonc`, which has 3 of the free plan's 5 triggers) so it doesn't share the limit with the `0 * * * *` tasks. Rules are taken oldest-due first; a rule's due occurrences (max 31) are written in **one atomic batch**; a rule whose batch would overflow the remaining budget waits for the next run. One recorded expense ≈ 4 statements (insert, tags, balance delta, plus the shared sync bump and rule update per batch), so ~8–10 occurrences per hour, ~200/day. A daily rule after a month-long outage catches up in about 4 hours. Each run logs `recurring: budget hit, N rules left` when it stops early.

---

### Task 0: Branch

- [ ] **Step 1:** `git branch -m feat/recurring-transactions` (memory: `feat/` prefix, never Orca's), check that `git status` is clean apart from the spec, plan and mockups, and commit those: `docs: recurring transactions design and plan (#117)`.

### Task 1: Schedule and run-planning maths (`@cc/core`)

**Files:**
- Create: `libs/shared/core/src/recurring.ts`
- Modify: `libs/shared/core/src/index.ts` (export it), `libs/shared/core/src/api-types.ts` (types below)
- Test: `libs/shared/core/src/__tests__/recurring-schedule.test.ts`, `libs/shared/core/src/__tests__/recurring-plan.test.ts`

**Interfaces (Produces):**
```ts
export type RepeatUnit = 'day' | 'week' | 'month' | 'year';
export type RepeatEnd = { kind: 'never' } | { kind: 'count'; count: number } | { kind: 'date'; date: string };
export interface RecurringSchedule {
  unit: RepeatUnit;
  every: number;                 // >= 1
  weekdays?: number[];           // unit 'week' only; 1 = Mon … 7 = Sun; default: startDate's weekday
  monthDay?: number | 'last';    // unit 'month' only; 1–31 or 'last'; default: startDate's day
  startDate: string;             // first possible occurrence; 'year' repeats startDate's month/day
  end: RepeatEnd;
}
export type RecurringType = 'expense' | 'income' | 'transfer' | 'buy';
export interface RecurringDraft {   // what each occurrence records (no date)
  type: RecurringType;
  walletId: string; toWalletId?: string;          // toWalletId: transfer only
  amount: number; amountReceived?: number;       // amountReceived: cross-currency transfer only
  categoryId?: string; assetId?: string;          // category: expense/income; asset: buy
  tags: string[]; note: string | null; excludeFromReports?: boolean;
}
export interface RecurringRuleView {
  id: string; draft: RecurringDraft; schedule: RecurringSchedule; askMe: boolean;
  status: 'active' | 'paused' | 'ended';
  pausedReason: 'checkin' | 'waiting' | 'missing_wallet' | 'missing_category' | 'missing_asset' | 'manual' | null;
  nextDueOn: string | null; lastConfirmedOn: string;
}
export type PlannedKind = 'recurring_occurrence' | 'recurring_checkin' | 'recurring_paused' | 'rule_suggestion';
export interface PlannedItemView {
  id: string; kind: PlannedKind | string; ruleId: string | null; dueOn: string;
  draft: RecurringDraft | null; status: 'waiting' | 'confirmed' | 'skipped' | 'dismissed';
  meta: Record<string, unknown> | null;   // kind-specific (e.g. pausesAfter, reason, pattern)
  createdOn: string;
}

export function vnDate(now: Date): string;                                      // UTC+7 calendar date
export function occurrencesBetween(s: RecurringSchedule, from: string, to: string): string[]; // inclusive, ascending, honours end
export function nextOccurrenceAfter(s: RecurringSchedule, date: string): string | null;       // strictly after
export function intervalDays(s: RecurringSchedule): number;                     // day: every; week: 7*every/weekdays.length; month: 30*every; year: 365*every
export type CheckInPolicy = { kind: 'every' } | { kind: 'after'; askAfterDays: number; graceDays: number | null; graceOccurrences: number | null };
export function checkInPolicy(s: RecurringSchedule): CheckInPolicy;
export interface RunInput {
  rule: Pick<RecurringRuleView, 'schedule' | 'askMe' | 'status' | 'nextDueOn' | 'lastConfirmedOn'>;
  today: string;
  waitingOccurrences: number;                       // this rule's waiting recurring_occurrence items
  openCheckIn: { createdOn: string; occurrencesSince: number } | null;
  maxOccurrences: number;                           // 31, or less when the budget is short
}
export interface RunPlan {
  record: string[];                                 // dates to record now
  wait: string[];                                   // dates to put in "to confirm"
  nextDueOn: string | null;                         // null = ended
  openCheckIn: boolean;                             // create a recurring_checkin item now
  pause: 'checkin' | 'waiting' | null;
}
export function planRuleRun(input: RunInput): RunPlan;
export interface UpcomingItem { ruleId: string; date: string; draft: RecurringDraft; approximate: boolean }
export function upcomingOccurrences(rules: RecurringRuleView[], today: string, days: number): UpcomingItem[]; // active rules only, today+1 … today+days, date order
```

Rules the functions encode (spec R3, R6, §4):
- Monthly day 29–31 / `'last'` clamps to the month's last day; the next month returns to the chosen day. Yearly 29 Feb → 28 Feb in non-leap years.
- `every` steps from `startDate`'s period (week of startDate, month of startDate…).
- `end.count` counts occurrences from `startDate`; `end.date` is inclusive.
- `checkInPolicy`: interval < 7 → `{after, askAfterDays: 30, graceDays: 14, graceOccurrences: null}`; 7 to < 28 → `{after, 60, null, 3}`; 28 to < 365 → `{after, 182, null, 3}`; ≥ 365 → `{every}`.
- `planRuleRun`: dates = `occurrencesBetween(schedule, nextDueOn, today)` cut to `maxOccurrences`. With `askMe` or policy `every`, all go to `wait`; otherwise to `record`. `pause: 'waiting'` when `waitingOccurrences + wait.length >= 3` (the dates up to and including the third still go to `wait`; later dates are dropped). For policy `after` and no `askMe`: `openCheckIn` when no check-in is open and `today >= lastConfirmedOn + askAfterDays`; `pause: 'checkin'` when a check-in is open and (`graceDays` passed since `createdOn`, or more than `graceOccurrences` occurrences would have been recorded since it opened). The first `graceOccurrences` after the check-in are recorded; the occurrence that triggers the pause isn't. `nextDueOn` = `nextOccurrenceAfter` the last handled date (or the current value if nothing was handled); `null` when the schedule has ended.

- [ ] **Step 1: Write the failing schedule tests** (`recurring-schedule.test.ts`):
  - `monthly on 31 clamps in February and returns in March`: `occurrencesBetween({unit:'month',every:1,monthDay:31,startDate:'2027-01-31',end:{kind:'never'}}, '2027-01-01','2027-04-30')` → `['2027-01-31','2027-02-28','2027-03-31','2027-04-30']`.
  - `29 and 30 in a leap February`: monthDay 29 over 2028-01..03 → `['2028-01-29','2028-02-29','2028-03-29']`; monthDay 30 → `['2028-01-30','2028-02-29','2028-03-30']`.
  - `last day`: `monthDay:'last'`, 2027-01..03 → `['2027-01-31','2027-02-28','2027-03-31']`.
  - `yearly 29 Feb`: startDate `2028-02-29`, to 2030-12-31 → `['2028-02-29','2029-02-28','2030-02-28']`.
  - `weekly on Mon and Thu every 2 weeks`: startDate `2026-11-30` (Mon), weekdays [1,4], to 2026-12-17 → `['2026-11-30','2026-12-03','2026-12-14','2026-12-17']`.
  - `every 3 days`, `ends after 3 times` (count 3 → exactly 3 dates), `ends on a date` (inclusive).
  - `nextOccurrenceAfter` is strictly after; returns null after the end.
  - `vnDate`: `new Date('2026-12-04T16:59:00Z')` → `'2026-12-04'`; `'2026-12-04T17:00:00Z'` → `'2026-12-05'`.
  - `checkInPolicy` for daily, weekly, monthly, yearly gives the four values above.
- [ ] **Step 2: Write the failing plan tests** (`recurring-plan.test.ts`):
  - `records each missed date once`: monthly on 5, nextDueOn 2027-01-05, today 2027-03-06 → record `['2027-01-05','2027-02-05','2027-03-05']`, nextDueOn `'2027-04-05'`.
  - `nothing before due`: today 2027-01-04 → record `[]`, nextDueOn unchanged.
  - `ask me waits`, `yearly waits`: dates in `wait`, not `record`.
  - `third waiting pauses`: waitingOccurrences 2, one new date → wait 1, `pause: 'waiting'`.
  - `check-in opens after 6 months for monthly`: lastConfirmedOn 2027-01-01, today 2027-07-05 → `openCheckIn: true`.
  - `check-in grace pauses monthly after 3 more`: openCheckIn occurrencesSince 3, one due → record `[]`, `pause: 'checkin'`; with occurrencesSince 2 and two due → the first is recorded, then pause.
  - `daily grace is 14 days`: daily rule, check-in created 2027-01-01, today 2027-01-16 → `pause: 'checkin'`.
  - `respects maxOccurrences`: daily, 40 days missed, max 31 → 31 recorded, nextDueOn = the 32nd date.
  - `ended schedule`: count 2 with both made → nextDueOn null.
  - `upcomingOccurrences` lists active rules only, in date order, `approximate` true for askMe.
- [ ] **Step 3:** Run `npx vitest run libs/shared/core/src/__tests__/recurring-schedule.test.ts libs/shared/core/src/__tests__/recurring-plan.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 4:** Implement `recurring.ts` (pure, no Date-zone tricks beyond `vnDate`; do date maths on UTC `Date`s built from `YYYY-MM-DD`).
- [ ] **Step 5:** Run the same command. Expected: PASS. `npm run typecheck` passes.
- [ ] **Step 6:** Commit `feat(core): recurring schedule and run planning (#117)`.

### Task 2: Tables

**Files:**
- Create: `apps/api/migrations/0038_personal_recurring.sql`
- Modify: `libs/api/db/src/schema.ts` (add `personalRecurringRules`, `personalRecurringRuleTags`, `personalPlannedItems`)
- Test: `apps/api/test/schema-personal-recurring.test.ts` (pattern: `schema-personal-budgets.test.ts`)

Tables (statements separated by `--> statement-breakpoint`, as in 0037):
- `personal_recurring_rules`: `id` PK, `user_id` → users cascade, `type` CHECK IN ('expense','income','transfer','buy'), `draft` text (JSON `RecurringDraft` minus tags), `schedule` text (JSON), `ask_me` int default 0, `status` CHECK IN ('active','paused','ended') default 'active', `paused_reason` text, `next_due_on` text, `last_confirmed_on` text not null, `created_at`, `updated_at`. Indexes: `(status, next_due_on)`, `(user_id)`.
- `personal_recurring_rule_tags`: `rule_id` → rules cascade, `tag_id` → `personal_tags` cascade, PK both. (Deleting a tag drops it from rules: R20.)
- `personal_planned_items`: `id` PK, `user_id` → users cascade, `kind` text, `ref_key` text not null, `rule_id` text (no FK; rule delete removes waiting items itself), `due_on` text not null, `draft` text, `meta` text, `status` CHECK IN ('waiting','confirmed','skipped','dismissed') default 'waiting', `transaction_id` text, `created_on` text not null, `resolved_at` text. Unique `(user_id, kind, ref_key)`; index `(user_id, status)`; index `(rule_id, status)`.

`ref_key` values: occurrence `'<ruleId>:<date>'`; check-in `'<ruleId>:checkin:<createdOn>'`; paused notice `'<ruleId>:paused:<date>'`; suggestion `'<categoryId>:<walletId>:<amountBand>'` (band = `Math.round(log(amount)/log(1.1))`).

- [ ] **Step 1:** Write `schema-personal-recurring.test.ts`: the three tables exist with exactly the columns above in that order; inserting two planned items with the same `(user_id, kind, ref_key)` throws; deleting a tag removes its `personal_recurring_rule_tags` row; a `type` of `'sell'` is rejected.
- [ ] **Step 2:** Run `npx vitest run --project api apps/api/test/schema-personal-recurring.test.ts` (or the api package's test script with that file). Expected: FAIL.
- [ ] **Step 3:** Write the migration and the schema entries.
- [ ] **Step 4:** Run it again. Expected: PASS. Apply locally for the tunnel later: `npx wrangler d1 migrations apply <db> --local` (memory: hand-written migrations).
- [ ] **Step 5:** Commit `feat(db): recurring rules and planned items tables (#117)`.

### Task 3: One entry-write helper (refactor, no behaviour change)

**Files:**
- Create: `apps/api/src/personal/entryWrite.ts`
- Modify: `apps/api/src/personal/entries.ts:471-772` (POST handler calls the helper)
- Test: `apps/api/test/personal-entry-write.test.ts`

**Interfaces (Produces):**
```ts
export interface EntryWriteOptions { source: 'manual' | 'recurring'; externalRef: string | null; now: string }
/** Validates (wallet, category, asset, oversell, amounts) exactly as POST /me/personal/transactions does, and returns the batch items without running them. */
export async function prepareEntryWrite(db: Db, userId: string, input: EntryInput, opts: EntryWriteOptions):
  Promise<{ items: (v: SQL) => BatchItem<'sqlite'>[]; entries: EntryView[] }>;
/** prepare + commitPersonalWrite in one call. */
export async function writeEntry(db: Db, userId: string, input: EntryInput, opts: EntryWriteOptions): Promise<EntryView[]>;
```
For a transfer with `externalRef`, the out row gets `externalRef` and the in row `externalRef + ':in'` (spec §10). Move the private helpers it needs (`loadWalletsMap`, `requireCategory`, `requireAsset`, `loadWalletTrades`, `assertNoOversell`, `resolveTags`, `resolveTransferAmounts`, `buildEntryView`, `walletNeedsReplay`) into `entryWrite.ts` and import them back into `entries.ts`. `prepareEntryWrite` must not write: `resolveTags` creates missing tags today, so split it into a read-and-plan step that returns the tag inserts as batch items.

- [ ] **Step 1:** Write `personal-entry-write.test.ts`: `writeEntry` with `source:'recurring', externalRef:'r1:2026-12-05'` stores those values; a second call with the same ref throws and leaves the wallet balance cache and transaction count unchanged (whole batch rolled back); a transfer stores `'r1:2026-12-05'` and `'r1:2026-12-05:in'`; a buy without a valid quantity throws `VALIDATION`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Extract the helper and make the POST route call `writeEntry(db, user.id, input, {source:'manual', externalRef:null, now})`.
- [ ] **Step 4:** Run the new test plus every existing `apps/api/test/personal-*.test.ts`. Expected: all PASS, existing ones unchanged.
- [ ] **Step 5:** Commit `refactor(api): shared personal entry write (#117)`.

### Task 4: Rule routes

**Files:**
- Create: `apps/api/src/personal/recurring.ts` (routes), `apps/api/src/personal/recurringApply.ts` (applies a `RunPlan` for one rule)
- Modify: `apps/api/src/personal/routes.ts` (mount `recurringRoutes()`; in `PATCH /me/personal` when `enabled` turns true, reset R19 below), `libs/shared/core/src/api-types.ts` (inputs)
- Test: `apps/api/test/personal-recurring-rules.test.ts`, `apps/api/test/personal-recurring-guard.test.ts`

**Interfaces:**
- Consumes: Task 1 (`planRuleRun`, `nextOccurrenceAfter`, `vnDate`, types), Task 3 (`prepareEntryWrite`).
- Produces:
```ts
// core
export interface RecurringRuleInput { draft: RecurringDraft; schedule: RecurringSchedule; askMe?: boolean }
export interface RecurringRulesResponse { rules: RecurringRuleView[] }
export interface RecurringRuleResponse { rule: RecurringRuleView }
// api: recurringApply.ts
/** Loads refs, plans with planRuleRun, writes everything for this rule in ONE commitPersonalWrite batch. Returns statements used. Missing refs (archived/missing wallet, deleted category, deleted asset) pause the rule with that reason; a plan with pause 'checkin' or 'waiting' pauses it too. Every self-pause adds one recurring_paused item (meta.reason) and resolves an open check-in. */
export async function applyRule(db: Db, userId: string, ruleId: string, today: string, statementBudget: number): Promise<{ used: number } | 'over_budget'>;
export function estimateStatements(plan: RunPlan, draft: RecurringDraft): number;
```
Routes (all `requirePersonal`, all scoped to the session user; another user's id → 404):
- `GET /me/personal/recurring/rules` → `RecurringRulesResponse`
- `POST /me/personal/recurring/rules` body `RecurringRuleInput` → 201 `RecurringRuleResponse`. Validation: the draft passes the same checks as `parseEntryInput` would for one occurrence (build an `EntryInput` with `date = startDate`); `askMe` is forced `true` for `buy` (R11, §5) and the draft's quantity is never stored. `lastConfirmedOn = vnDate(now)`, `nextDueOn = startDate`. Then **runs `applyRule` inline** for today, so a start date of today or earlier records (or waits) at once.
- `POST /me/personal/recurring/rules/from/:transactionId` → creates a rule from that transaction (monthly on its day, start = `nextOccurrenceAfter` its date) and returns it, **without** linking the old transaction (it stays manual).
- `PATCH /me/personal/recurring/rules/:id` body `Partial<RecurringRuleInput>`: changes apply to occurrences not yet made (R9). If the schedule changes, `nextDueOn = nextOccurrenceAfter(newSchedule, yesterday)` but never a date ≤ the latest occurrence already made (look up the max `external_ref` date / planned `ref_key` date for the rule). Sets `lastConfirmedOn = today` and resolves an open check-in (R14). Waiting items keep their drafts.
- `POST …/rules/:id/pause`: status paused, reason `manual`. `POST …/rules/:id/resume`: status active, `nextDueOn = nextOccurrenceAfter(schedule, today)` (no catch-up, R6), `lastConfirmedOn = today`, its `recurring_paused` item → `dismissed`.
- `DELETE …/rules/:id`: deletes the rule and its tags, deletes its `waiting` planned items; recorded transactions stay untouched (R10).
- R19 in `PATCH /me/personal` turning on: `UPDATE personal_recurring_rules SET next_due_on = <computed per rule>, last_confirmed_on = today` for that user's active rules (load, compute with `nextOccurrenceAfter(schedule, today)`, write in one batch).

Query cost per request (state these in code comments): list 2 (rules + tags); create ≤ 8 + the inline apply's batch; patch ≤ 6; pause/resume/delete ≤ 4.

- [ ] **Step 1:** Write `personal-recurring-rules.test.ts`:
  - `create with start today records the first occurrence`: monthly expense starting today → one transaction with `source='recurring'`, `external_ref = '<id>:<today>'`, the rule's `nextDueOn` next month.
  - `create a buy rule forces ask me`: `askMe:false` in, `askMe:true` out; a waiting `recurring_occurrence` item for today, no transaction.
  - `edit rule changes future only`: after one recorded occurrence, PATCH amount → the recorded transaction keeps the old amount.
  - `moving the schedule does not back-fill`: monthly day 5 recorded for 2026-12-05 (today 2026-12-10), PATCH monthDay 1 → nextDueOn `2027-01-01`; PATCH startDate to 2026-10-01 → still no transaction before 2026-12-05 and no second one for December.
  - `pause then resume skips paused time`, `delete keeps transactions and removes waiting items`, `from transaction makes a monthly rule starting next month`.
  - `turning the area back on does not catch up`: rule due 2026-11-05, area off, today 2027-02-10, PATCH `/me/personal` on → `nextDueOn = '2027-03-05'`.
- [ ] **Step 2:** Write `personal-recurring-guard.test.ts` (pattern: `personal-guard-sweep.test.ts`): every new route returns 401 signed out and 403 with the area off; account B gets 404 on A's rule ids and planned item ids (including Task 6 routes, added there) and A's data is unchanged.
- [ ] **Step 3:** Run both. Expected: FAIL.
- [ ] **Step 4:** Implement `recurring.ts`, `recurringApply.ts`, the mount and the R19 reset. Use a test hook for "today": routes take `vnDate(new Date())`; tests control time with `vi.setSystemTime`.
- [ ] **Step 5:** Run both. Expected: PASS.
- [ ] **Step 6:** Commit `feat(api): recurring rule routes (#117)`.

### Task 5: The cron job

**Files:**
- Create: `apps/api/src/personal/recurringJob.ts`
- Modify: `apps/api/src/index.ts` (branch for `'15 * * * *'`), `apps/api/wrangler.jsonc` (add `"15 * * * *"` to `triggers.crons`)
- Test: `apps/api/test/personal-recurring-job.test.ts`

**Interfaces:**
- Consumes: Task 4 `applyRule`.
- Produces: `export async function runRecurring(env: Env, now: Date): Promise<{ rules: number; statements: number; leftOver: number }>`; `export const RECURRING_STATEMENT_BUDGET = 45`.

Pick query (1 statement): active rules with `next_due_on <= vnDate(now)` whose user has `user_personal_settings.enabled = 1`, ordered by `next_due_on, id`, limit 50. Then `applyRule` for each until the budget is used; stop at the first `'over_budget'` and log `recurring: budget hit, N rules left`. If an `applyRule` batch throws a unique-constraint error, treat that rule as done by another run and move on (log, no rethrow).

- [ ] **Step 1:** Write `personal-recurring-job.test.ts` (seed a user, wallet and category with the personal helpers; set the rule's `next_due_on` directly in the DB):
  - `a monthly rule records on its due date exactly once`: rule created 2026-11-27, monthly on the 5th; `runRecurring` at `2026-12-04T16:59Z` → 0 transactions; at `2026-12-04T17:15Z` → 1 transaction dated `2026-12-05`; again at `18:15Z` → still 1.
  - `catches up after a missed run, once each`: next due 2026-12-05, first run at `2027-02-06T00:15Z` → transactions for 12-05, 01-05, 02-05; another run → still 3.
  - `concurrent runs record once`: `await Promise.all([runRecurring(env, t), runRecurring(env, t)])` → 1 transaction and the wallet balance cache moved by the amount once.
  - `February edge`: rules on the 29th, 30th, 31st and "last day", runs on 2027-02-28 and 2028-02-29 dates → one transaction each on the month's last day.
  - `area off records nothing`.
  - `archived wallet pauses with a reason, once`: archive the wallet, run twice → 0 transactions, rule `paused` / `missing_wallet`, exactly 1 `recurring_paused` item.
  - `check-in opens and pauses after grace`: monthly rule, `last_confirmed_on` 7 months back → a `recurring_checkin` item opens; three more monthly runs record, the 4th pauses (`checkin`) without recording.
  - `respects the statement budget`: 30 due daily rules → one run uses ≤ 45 statements (count via returned `statements`), `leftOver > 0`, the rest record on the next run.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement `runRecurring`, wire `index.ts` (`if (controller.cron === '15 * * * *') { ctx.waitUntil(runRecurring(env, now)); return; }`) and the wrangler trigger.
- [ ] **Step 4:** Run it plus `apps/api/test/cron-notifications.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(api): hourly recurring job with a statement budget (#117)`.

### Task 6: The "to confirm" list routes

**Files:**
- Create: `apps/api/src/personal/planned.ts` (routes + kind registry)
- Modify: `apps/api/src/personal/routes.ts` (mount), `apps/api/src/personal/entries.ts` (PATCH of a `source='recurring'` transaction sets its rule's `last_confirmed_on = today` and resolves its open check-in, R14: one extra statement in the existing batch, one lookup), `apps/api/src/personal/categories.ts:~600` (delete with `moveTo`: also `UPDATE personal_recurring_rules SET draft = json_set(draft,'$.categoryId', moveTo)` where it points at the deleted id, R20), `libs/shared/core/src/api-types.ts`
- Test: `apps/api/test/personal-planned.test.ts`; extend `personal-recurring-guard.test.ts` (new test cases only)

**Interfaces (Produces):**
```ts
export interface PlannedItemsResponse { items: PlannedItemView[] }           // waiting only, due_on then created_on
export interface ConfirmPlannedInput { entry?: EntryInput }                  // omitted = record the draft on dueOn
// api: planned.ts
export interface PlannedKindHandler {
  confirm(db: Db, userId: string, item: PlannedItemRow, body: ConfirmPlannedInput, now: string): Promise<{ transactionId: string | null; extra: BatchItem<'sqlite'>[] }>;
}
export const plannedKinds: Record<string, PlannedKindHandler>;               // #122/#123 add theirs here
type PlannedItemRow = typeof personalPlannedItems.$inferSelect;
```
Routes (`requirePersonal`):
- `GET /me/personal/planned` → `PlannedItemsResponse` (1 query).
- `POST /me/personal/planned/:id/confirm` body `ConfirmPlannedInput`:
  - `recurring_occurrence`: writes `entry ?? draft-on-dueOn` with `writeEntry` parts, `source:'recurring'`, `externalRef = ref_key` (the scheduled date stays the identity even if `entry.date` differs, R5), and in the same batch sets the item `confirmed` + `transaction_id` **with `WHERE status = 'waiting'`**, and the rule's `last_confirmed_on`. A buy without `entry` → 422 (quantity needed).
  - `recurring_checkin`: item confirmed, rule `last_confirmed_on = today`.
  - `recurring_paused`: resumes the rule (as Task 4 resume).
  - `rule_suggestion`: marks confirmed (the web creates the rule through Task 4's POST first).
  - Already resolved → 409 `ALREADY_RESOLVED`, nothing written.
- `POST /me/personal/planned/:id/skip`: `recurring_occurrence` → `skipped` (never remade: the unique key holds it); `recurring_checkin` → pauses the rule (reason `manual`) and resolves the item ("Tạm dừng"); `rule_suggestion` → `dismissed` (stays forever, R16).

- [ ] **Step 1:** Write `personal-planned.test.ts`:
  - `a waiting item moves nothing`: an ask-me occurrence waiting → wallet balance, `/me/personal/list`, reports and `/budgets/progress` rows are identical to before it existed.
  - `confirm with a changed amount and date`: records that amount and date, `external_ref` keeps the scheduled date.
  - `double confirm records once`: two concurrent confirms → 1 transaction, one 200 and one 409.
  - `skip is never remade`: skip, then run the job past that date again → no transaction, no new item.
  - `buy confirm needs units`: no `entry` → 422; with `entry` (quantity set) → holdings change as for a manual buy.
  - `editing a recurring transaction confirms the rule`: PATCH its amount → rule `last_confirmed_on` = today, open check-in resolved.
  - `category delete with moveTo moves the rule`; `category delete without moveTo pauses the rule on the next run` (`missing_category`).
- [ ] **Step 2:** Add the planned routes to the guard test (401/403/404 from account B).
- [ ] **Step 3:** Run both. Expected: FAIL.
- [ ] **Step 4:** Implement.
- [ ] **Step 5:** Run them plus `personal-entries*.test.ts` and `personal-categories.test.ts`. Expected: PASS.
- [ ] **Step 6:** Commit `feat(api): to-confirm list with confirm and skip (#117)`.

### Task 7: Rule suggestions

**Files:**
- Modify: `libs/shared/core/src/recurring.ts` (add `detectRepeat`), `apps/api/src/personal/entries.ts` (POST: after a manual expense/income write, call `maybeSuggestRule`), `apps/api/src/personal/planned.ts` (`maybeSuggestRule`)
- Test: `libs/shared/core/src/__tests__/recurring-detect.test.ts`, `apps/api/test/personal-rule-suggest.test.ts`

**Interfaces (Produces):**
```ts
export interface RepeatCandidateRow { date: string; amount: number }
/** rows: same user, type, category and wallet, last 100 days, including the new one. */
export function detectRepeat(rows: RepeatCandidateRow[], latest: RepeatCandidateRow):
  { schedule: RecurringSchedule; amount: number } | null;
export async function maybeSuggestRule(db: Db, userId: string, entry: EntryView, today: string): Promise<void>; // ≤ 3 queries
```
Monthly: one row in each of the last 3 calendar months (including the latest's) within ±3 days of the latest's day, every amount within 10% of the latest → monthly on that day, start = next month's date, amount = latest. Weekly: one row on the latest's weekday in each of the last 4 weeks, same amount rule → weekly. Monthly wins if both match. Not suggested when an active or paused rule has the same type, category and wallet and an amount within 10%, or when the item's `ref_key` already exists in any status.

- [ ] **Step 1:** Core tests: 3 months on 5/6/4 Oct–Dec within 10% → monthly on day of latest; one month missing → null; amount 15% off → null; 4 weekly Mondays → weekly.
- [ ] **Step 2:** API tests: the third monthly internet entry creates one `rule_suggestion` item with `meta.pattern`; a fourth entry doesn't add another; after `skip` (dismiss) a later match adds nothing; an existing rule blocks it; the POST response is unchanged.
- [ ] **Step 3:** Run. Expected: FAIL. **Step 4:** Implement. **Step 5:** Run them plus `personal-entries.test.ts`. Expected: PASS.
- [ ] **Step 6:** Commit `feat: suggest a rule for repeated entries (#117)`.

### Task 8: Web data hooks

**Files:**
- Create: `libs/web/data-access/src/recurring.ts`
- Modify: `libs/web/data-access/src/budgets.ts` (still due), `libs/web/data-access/src/personalMoney.ts` (invalidate keys after entry writes)
- Test: `libs/web/data-access/src/__tests__/recurring.test.ts`

**Interfaces (Produces):**
```ts
export const PERSONAL_RECURRING_KEY = ['me','personal','recurring'] as const;
export const PERSONAL_PLANNED_KEY = ['me','personal','planned'] as const;
export function useRecurringRules(opts?: { enabled?: boolean }): UseQueryResult<RecurringRulesResponse>;
export function useCreateRule(); useUpdateRule(); usePauseRule(); useResumeRule(); useDeleteRule(); useRuleFromTransaction();
export function usePlannedItems(opts?: { enabled?: boolean }): UseQueryResult<PlannedItemsResponse>;
export function useConfirmPlanned(); useSkipPlanned();
export function useUpcoming(days = 30): { items: UpcomingItem[]; totals: { currency: CurrencyCode; out: number; in: number }[]; vndOut: number; ready: boolean };
/** Expenses from active rules (waiting items included) inside the budget's scope, from tomorrow to the period end. */
export function useBudgetStillDue(budget: BudgetDef, period: BudgetPeriod): { count: number; amount: number };
```
Every mutation invalidates `PERSONAL_RECURRING_KEY`, `PERSONAL_PLANNED_KEY`, and (confirm, create) the list, summary, wallets and budgets keys. `useUpcoming` totals: `out` = expense + buy, `in` = income, transfers not totalled (R15); `vndOut` for the home row (R21). `useBudgetStillDue` uses the budget's scope rules (B1–B3: category with sub-categories or tag, currency, ticked wallets). Budget pace with still due: `Math.floor((left - stillDue) / daysLeft)` (spec §7); state unchanged.

- [ ] **Step 1:** Tests with `mockApi`: upcoming totals split by currency and direction; a transfer is listed but not totalled; still due counts only in-scope rules before the period end and includes waiting items.
- [ ] **Step 2:** Run `npx vitest run libs/web/data-access/src/__tests__/recurring.test.ts`. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(web): recurring data hooks (#117)`.

### Task 9: Shape the screens with the owner (/impeccable)

Architect-level, planner-run (not delegated): this sets the look the next tasks build.

- [ ] **Step 1:** Run `/impeccable` shape for: the home row, the Định kỳ screen (three sections), the repeat section of the entry form (schedule sheet), the rule detail, the "repeats" mark on rows and detail, the budget "still due" line. Start from `docs/superpowers/mockups/recurring/2-recurring-combined.html` and the real components.
- [ ] **Step 2:** Review live with the owner; record the approved choices as a short addendum at the end of the spec (`## Addendum: screens`) with the Vietnamese copy (marked `// REVIEW` when it reaches `vi.ts`).
- [ ] **Step 3:** Commit `docs: recurring screens addendum (#117)`.

### Task 10: Định kỳ screen and home row

**Files:**
- Create: `libs/web/screens/src/screens/RecurringScreen.tsx`, `libs/web/screens/src/components/PlannedItemCard.tsx` (renders per `kind`; unknown kinds render nothing)
- Modify: `libs/web/screens/src/App.tsx` (`/recurring` inside `PersonalRoute`), `libs/web/screens/src/screens/SpendingBook.tsx` (row after Báo cáo, only when a wallet exists), `libs/web/i18n/src/vi.ts`, `en.ts` (`recurring.*` keys)
- Test: `libs/web/screens/src/screens/__tests__/recurring-screen.test.tsx`, `recurring-home-row.test.tsx`

testids / classes: `book-recurring-row` (`fsl-book__recurring`), `book-recurring-count`, `recurring-waiting`, `planned-item-<id>`, `planned-confirm`, `planned-edit`, `planned-skip`, `recurring-upcoming`, `recurring-upcoming-total`, `recurring-rules`, `rule-row-<id>`, `rule-resume-<id>`, `recurring-add`.

- [ ] **Step 1:** Tests: the home row shows "4 quy tắc · 30 ngày tới 7.450.000₫" and a count pill of 3 with three waiting items, and no pill with none; the screen's sections are in order (waiting, upcoming, rules); waiting is hidden when empty; Xác nhận calls confirm; Bỏ qua calls skip; a check-in shows Vẫn dùng / Tạm dừng; a paused rule shows Tiếp tục; the "Chưa tính vào số dư" note is present; **area off: `/recurring` is unreachable and the home row absent** (pattern: `meOff` in `budgets-screen.test.tsx`).
- [ ] **Step 2:** Run. Expected: FAIL. **Step 3:** Implement with the Task 9 decisions. **Step 4:** Run, plus `npm run lint` (style guard). Expected: PASS.
- [ ] **Step 5:** Commit `feat(web): recurring screen and home row (#117)`.

### Task 11: Rule create/edit through the entry form

**Files:**
- Create: `libs/web/screens/src/components/RepeatField.tsx` (row + schedule sheet; value `{ schedule: RecurringSchedule; askMe: boolean } | null`)
- Modify: `libs/web/screens/src/screens/EntryPage.tsx` (modes below), `libs/web/screens/src/screens/TransactionDetail.tsx` (repeat mark + "Xem quy tắc" link when `source === 'recurring'`; "Lặp lại giao dịch này" action), `libs/web/screens/src/App.tsx` (`/recurring/:id` rule detail can be `EntryPage` in rule mode), i18n
- Test: `libs/web/screens/src/screens/__tests__/entry-repeat.test.tsx`, `tx-detail-recurring.test.tsx`

EntryPage modes (query params, no new page): `/entries/new?repeat=1` opens with the repeat field set (monthly on the chosen date); saving with a repeat value calls `useCreateRule` (start = entry date) instead of `useCreateEntry`. `/recurring/:id` loads the rule into the form, saving calls `useUpdateRule`, and the footer offers Tạm dừng/Tiếp tục and Xóa (the confirm text says recorded transactions stay). The "Hỏi số tiền mỗi lần" switch is shown inside RepeatField, locked on for buys. `EntryView` needs `source` and `ruleId` for the mark: add optional `source?: string; ruleId?: string | null` to `EntryView` in `api-types.ts` and fill them in `buildEntryView` / the list route (`ruleId` = part of `external_ref` before the first `:` when `source = 'recurring'`).

- [ ] **Step 1:** Tests: setting Lặp lại → Hằng tháng and saving posts a rule with `schedule.unit 'month'`, `monthDay` = the date's day and `startDate` = the entry date; "Ngày cuối tháng" posts `monthDay:'last'`; "Kết thúc sau 12 lần" posts `end.count 12`; a buy shows the switch on and disabled; editing a rule posts PATCH; a recurring transaction's detail shows the mark and links to `/recurring/<ruleId>`; a deleted rule shows the mark with "Quy tắc đã bị xóa" and no link; "Lặp lại giao dịch này" calls `useRuleFromTransaction`.
- [ ] **Step 2:** Run. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run plus every `entry-*.test.tsx` and `personal-final-fixes.test.tsx`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(web): repeat field, rule edit and recurring mark (#117)`.

### Task 12: Confirm with changes, suggestions, and budgets

**Files:**
- Modify: `EntryPage.tsx` (`/entries/new?planned=<id>`: pre-fills from the item's draft and `dueOn`; for a buy it opens the buy form with the planned amount and empty units; saving calls `useConfirmPlanned({ entry })` and returns to `/recurring`), `PlannedItemCard.tsx` (Sửa → that route; suggestion "Tạo quy tắc" → `/entries/new?repeat=1&from=<itemId>` pre-filled from `meta.pattern`, and on save also confirms the item), `BudgetDetailScreen.tsx` and `BudgetsScreen.tsx` rows (still due line + pace via Task 8), i18n
- Test: `planned-confirm-edit.test.tsx`, `budget-still-due.test.tsx`

- [ ] **Step 1:** Tests: Sửa on an ETF item opens the buy form with 5.000.000₫ and no units, and saving with units posts `/planned/<id>/confirm` with `entry.quantity`; Tạo quy tắc creates the rule and confirms the suggestion; a budget with a 600.000₫ rule due before the period ends shows "Còn 1 khoản cố định sắp tới: 600.000₫" and a pace of `(left - 600000) / daysLeft` while its state label is unchanged.
- [ ] **Step 2:** Run. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run plus all `budget*.test.tsx`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(web): confirm with changes, rule suggestions, budget still due (#117)`.

### Task 13: Whole-branch verification and hand-off

- [ ] **Step 1:** `npm test`, `npm run typecheck`, `npm run lint`. Expected: all pass.
- [ ] **Step 2:** `npm run e2e -- golden-path` and `npm run e2e -- walkthrough` (they build first). Expected: pass.
- [ ] **Step 3:** Apply 0038 `--local`, rebuild, start the tunnel through an Orca worker (memory: tunnel after each task), browser-check the Định kỳ screen at 375px in web and Zalo shells.
- [ ] **Step 4:** Owner tests on the tunnel; after their approval, push and open a PR into `main` ("Closes #117"), body ending with the Claude Code line.
