# Rewrite Part 1: Payment Share Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo the `gemini-execution` skill overrides implementer dispatch (see Global Constraints).

**Goal:** A friend who taps a "pay me" link in Zalo reaches their QR in the fewest steps, in both share situations, with the audit's payment-share bugs fixed and the path checked end to end.

**Architecture:** A new "pay link" (`/j/<token>/owe`, `/t/<tripId>/owe`) opens a new `OweScreen` that lists what the visitor owes (or jumps straight to the one pay screen); reminders use it, the ordinary invite does not. `ExpensePay` (the bill link) gains a "View the bill" sheet and an honest "nothing for you" state; the bill table becomes a shared component that fits a phone. `WhoAreYou` lets signed-in newcomers join from bill links and drops the amber guest box there. A guard asks for bank details before a "pay me" share. New groups round transfers by default.

**Tech Stack:** React 19, react-router 8, TanStack Query, Tailwind v4 + shadcn (DESIGN.md), Vitest + Testing Library (jsdom), Playwright e2e, Hono on Cloudflare Workers + D1/Drizzle, Nx.

**Spec:** `docs/superpowers/specs/2026-11-05-app-rewrite-design.md` (§4 is this plan; §1–3 apply). Read `DESIGN.md` and `CLAUDE.md` before any UI work.

## Global Constraints

- Money behaviour unchanged except the rounding default (spec §2 anti-goals, §4.7): amounts, splits, approvals, confirmation rules, balances.
- The ordinary invite link `/j/<token>` keeps opening the group page; only "pay me" reminders use the pay link (spec §4.1).
- Visual: DESIGN.md tokens only (no raw hex, no per-component CSS), 44px touch targets (`min-h-11`), fields ≥16px, money `tabular-nums`, app wrappers first (`Button`, `Sheet`, `Pill`, `Amount`, `InlineError`), never shadcn `Drawer`/`Dialog` directly for a sheet.
- Copy: every new string in both `libs/web/i18n/src/en.ts` and `vi.ts`; Vietnamese drafts end with `// REVIEW`. Keep `fsl-*` classes and `data-testid`s on the elements they mark today.
- Placement: screens and CoinCrew components in `libs/web/screens`; import across libraries by package name; lint must pass (`npm run lint`).
- Harness: each task runs in its own Orca worktree via `gemini-execution` (Gemini Flash), reviewed by Opus. Gemini adds new tests only; steps marked **[architect]** edit existing tests and are done by Opus.
- Never run `npm run deploy`, `db:migrate:remote`, `deploy:*`; never tunnel the e2e server (`E2E_LOGIN`).
- Commands: web unit tests `cd libs/web/screens && npx vitest run <file>`; API `cd apps/api && npx vitest run <file>`; e2e `npx playwright test <file>` (starts `npm run e2e:server` on :8788); all `npm test`, `npm run typecheck`, `npm run lint`.

## Review Focus

1. A remembered name that has since **left** the group or been merged opens the pay link: re-ask "Who are you?", never show another person's debts. → test in Task 3.
2. The visitor already **marked a payment that waits for confirmation**: the owe screen says "Waiting for Minh to confirm", not "Pay" again and not "You're all set". → test in Task 3.
3. The pay link of an **archived** group, or opened with the **view-only** token: no paying; land on the group page. → tests in Task 3.
4. A **signed-in member** opening `/j/<token>/owe`: same list, on their `/t/<tripId>/owe` address. → test in Task 3.
5. The **payer** opening their own bill link keeps the bill with "Share bill & QR"; anyone else with no share sees "Nothing for X in this bill", never the bill silently. → tests in Task 4.

---

### Task 1: Walkthrough harness and baseline (reproduce the reported bug)

**Files:**
- Create: `e2e/walkthrough.spec.ts`
- Modify: `.gitignore` (add `/walkthrough-shots/`)
- Create: `docs/superpowers/plans/2026-11-05-rewrite-part1-findings.md` (the reproduction result)

**Interfaces:**
- Produces: `WALKTHROUGH=1 npx playwright test e2e/walkthrough.spec.ts` saves full-page screenshots to `walkthrough-shots/<lang>-<width>/<NN>-<step>.png`; skipped unless `WALKTHROUGH=1`, so `npm run e2e` is unchanged.

- [ ] **Step 1: Write the walkthrough** as one `test.describe` per language (`vi`, `en`, via `localStorage.lang`) × viewport (375×812, 1280×800). Each phone is its own browser context; sign-in via `POST /api/test/login` as in `e2e/golden-path.spec.ts`. Steps:
  - Organiser Minh (bank details added) creates a **sport** group with Bình, Chi (Nữ), Tuấn Anh, Dũng and "Nguyễn Thị Thanh Hương" (a long name, for the bill), records a session (court 400k, 6 × 26k shuttles), opens its details, the group page and People.
  - On the session details with a Zalo in-app browser user agent (`userAgent` containing `Zalo`), taps "Share bill & QR" so the bill image shows; screenshot it.
  - Minh creates a **trip** group where Minh and Bình both paid, so Chi owes two people and Dũng owes nothing; and a group whose payee has no bank details.
  - Guest phones on the group link: Chi (owes two), a guest owing one, Dũng (owes nothing); Chi marks "I've paid" and Minh confirms (waiting, then confirmed).
  - The bill link `/j/<token>/e/<expenseId>`: a new phone picks Bình; the same phone reopens it; Minh opens his own bill link.
  - Signed-in newcomers: "Nhân" from the group link, "Hoa" from the bill link.

  Each step: `page.screenshot({ fullPage: true })`; a failing step is logged with `test.info().annotations` and the walk continues (`test.step` + try/catch). `scratchpad/audit-walk.cjs` from the audit is a working starting point for the selectors.
- [ ] **Step 2: Run it**
Run: `WALKTHROUGH=1 npx playwright test e2e/walkthrough.spec.ts`
Expected: screenshots for every step in four folders; `npm run e2e` still runs 6 tests (walkthrough skipped).
- [ ] **Step 3: [architect] Reproduce "first tap shows the bill and the share button"** from the screenshots (and on a phone via the tunnel if needed). Record which case the team hit (payer, remembered other name, signed-in member, Mini App) in the findings file; Task 4's tests must cover that case.
- [ ] **Step 4: Commit**
```bash
git add e2e/walkthrough.spec.ts .gitignore docs/superpowers/plans/2026-11-05-rewrite-part1-findings.md
git commit -m "test(e2e): opt-in phone and desktop walkthrough of the payment share path"
```

### Task 2: New groups round transfers by default (spec §4.7)

**Files:**
- Modify: `apps/api/src/trips/routes.ts:192` (`roundTransfers: 0` → `1` in the create insert; `POST /trips` only creates `trip` and `sport` groups, both round)
- Test: `apps/api/test/trips.test.ts`

**Interfaces:**
- Produces: a group created by `POST /api/trips` starts with `trip.roundTransfers === true`; the PATCH switch (`routes.ts:478–507`) and existing groups are untouched.

- [ ] **Step 1: [architect] Change the existing test** `creates new groups with roundTransfers: false by default` (`trips.test.ts:114`) to `creates new groups with roundTransfers: true by default` expecting `v.trip.roundTransfers` `toBe(true)`.
- [ ] **Step 2: Add the test** `sport groups also start rounded` (POST with `preset: 'sport'` → `roundTransfers` `true`).
- [ ] **Step 3: Run** `cd apps/api && npx vitest run test/trips.test.ts` → both FAIL.
- [ ] **Step 4: Implement** the default.
- [ ] **Step 5: Run the API suite** (`npx nx run @cc/api:test`). **[architect]** An existing test that now sees rounded suggestions on a freshly created group, and whose subject is not rounding, gets `PATCH /api/trips/:id { roundTransfers: false }` after creating its group; list those tests in the commit body.
- [ ] **Step 6: Commit** `feat(api): new groups round transfers to 1.000₫ by default`

### Task 3: The pay link and the "you owe" screen (spec §4.1, §4.8)

**Files:**
- Create: `libs/web/screens/src/lib/owe.ts`
- Create: `libs/web/screens/src/screens/OweScreen.tsx`
- Modify: `libs/web/screens/src/App.tsx` (`tripPages`: `<Route path="owe" element={<OweScreen />} />`)
- Modify: `libs/web/screens/src/lib/remind.ts` (add `payLink`)
- Modify: `libs/web/screens/src/components/YourTransfers.tsx:84` (the receive QR's `remindText` link → `payLink(view)`; this is the only "pay me" reminder: the bank-details requests at `YourTransfers.tsx:102` and `PayScreen.tsx:162` keep `groupLink`, and the per-bill reminder at `ExpensePaymentsApproval.tsx:445` keeps `expenseLink`)
- Modify: `libs/web/screens/src/screens/PayScreen.tsx` ("See the group" when opened from the pay link)
- Modify: `libs/web/i18n/src/en.ts`, `vi.ts`
- Test: `libs/web/screens/src/screens/__tests__/owe-screen.test.tsx`, `libs/web/screens/src/lib/__tests__/owe.test.ts`, `libs/web/screens/src/components/__tests__/your-transfers.test.tsx` (existing)

**Interfaces:**
- Produces: `payLink(view: TripView): string` → `` `${groupLink(view)}/owe` ``.
- Produces: `owedTransfers(view: TripView): Transfer[]` → `view.suggestions` with `fromId === view.me.participantId`, in that order; `[]` when `participantId` is null.
- Produces: `waitingPayments(view: TripView): PaymentView[]` → `view.payments` with `status === 'says_paid'` and `fromId` = me (show `amountClaimed`).
- Produces: route `owe` under both `/t/:tripId` and `/j/:token`; `OweScreen` (no props). It is a sibling of `PayScreen` in `tripPages`, not inside `TripRoute`, so it does its own redirects.
- Produces: `PayScreen` shows a ghost `Button` "See the group" (`owe.seeGroup`, to `href()`) when the page URL has `?via=owe`.
- Copy (en; vi drafts `// REVIEW`): `owe.title` "{name}, you owe" · `owe.pay` "Pay {name}" · `owe.allSet` "You're all set" · `owe.allSetBody` "You don't owe anyone in {trip}." · `owe.waiting` "Waiting for {name} to confirm" · `owe.seeGroup` "See the group".

- [ ] **Step 1: Write the failing tests** (`renderAt` + `mockApi` from `src/test/render.tsx`, fixtures from `src/test/fixtures.ts`):
  - `owe.test.ts`: `owedTransfers` returns only my rows; `[]` without a participant; `waitingPayments` returns only my `says_paid` payments.
  - `owe-screen.test.tsx`:
    - `owes two people: lists both with a Pay button each` → rows "Minh" / "Bình" with amounts, buttons "Pay Minh", "Pay Bình" linking to `…/pay/<toId>`, and "See the group" linking to the group page.
    - `owes exactly one person: opens that pay screen` → location is `…/pay/p-minh?via=owe`; `PayScreen` there shows "See the group".
    - `owes nothing: says you're all set` → "You're all set", "See the group".
    - `a payment waits for confirmation: says so instead of all set` → "Waiting for Minh to confirm", no "You're all set".
    - `guest without a remembered name: goes to Who are you? and comes back here` → navigates to `…/who?next=<encoded …/owe>`.
    - `remembered name has left the group: asks again` → `me.participantId` is Chi but Chi's `people` row has `status: 'left'` → same redirect to `who` (Review Focus 1).
    - `archived group: lands on the group page`; `view-only link (me.kind 'viewer'): lands on the group page` (Review Focus 3).
    - `member on /j/<token>/owe: moves to /t/<tripId>/owe` (Review Focus 4).
- [ ] **Step 2: [architect] Update the existing test** at `your-transfers.test.tsx:142`: the receive QR's reminder text now ends with `${location.origin}/j/gtok-1/owe`. Add a line there asserting the bank-details request still ends with `/j/gtok-1`.
- [ ] **Step 3: Run** `cd libs/web/screens && npx vitest run src/screens/__tests__/owe-screen.test.tsx src/lib/__tests__/owe.test.ts src/components/__tests__/your-transfers.test.tsx` → FAIL.
- [ ] **Step 4: Implement** `owe.ts`, `payLink`, the route, `OweScreen` and the `PayScreen` link. `OweScreen` loads the view with `useTripView(tripId, 20000, { stopAfterMs: 15 * 60_000 })` and redirects in this order: guest with no participant, or whose own row is `left` → `href('/who') + '?next=' + <this path>`; member on `/j/…` → `/t/<tripId>/owe` (as `TripRoute.tsx:162–165` does); archived or `viewer` → `href()`. Then: one owed transfer and nothing waiting → `<Navigate replace to={href('/pay/<toId>') + '?via=owe'} />`; otherwise a `Screen` titled `owe.title` with a white grouped list (Avatar, name, `Amount` in `danger`, a `Button` per row: the first primary, the rest secondary), waiting payments as rows with a clock icon and `owe.waiting`, the all-set empty state when both are empty, and a ghost `Button` "See the group" to `href()`.
- [ ] **Step 5: Run** the tests → PASS; `npm run typecheck`, `npm run lint` clean.
- [ ] **Step 6: Commit** `feat(web): pay link opens "you owe", straight to the QR when it's one person`

### Task 4: The bill link opens on your share; the bill fits a phone (spec §4.2, §4.5)

**Files:**
- Create: `libs/web/screens/src/lib/sportBill.ts` (the calculation now inside `ExpenseDetails.tsx:86–143`)
- Create: `libs/web/screens/src/components/SportBillTable.tsx` (the table now at `ExpenseDetails.tsx:334–404`)
- Modify: `libs/web/screens/src/components/ExpenseDetails.tsx` (use both)
- Modify: `libs/web/screens/src/screens/ExpensePay.tsx` (bill sheet; no-share states at `:152–161`)
- Modify (only if Step 6 finds clipping): `libs/web/util/src/qr.ts:172` (`renderSportBillPng`, the bill image shared to Zalo)
- Modify: `libs/web/i18n/src/en.ts`, `vi.ts`
- Test: `libs/web/screens/src/components/__tests__/sport-bill-table.test.tsx`, `libs/web/screens/src/screens/__tests__/expense-pay-bill.test.tsx`, `libs/web/screens/src/screens/__tests__/expense-pay.test.tsx` (existing)

**Interfaces:**
- Produces: `type SportBillCalc = Omit<SportShareTextInput, 'link'>` and `sportBillCalc(view: TripView, expense: ExpenseView): SportBillCalc | null` (null when the expense has no sport meta) in `lib/sportBill.ts`; `ExpenseDetails` and `sportShareText` callers use it unchanged in result.
- Produces: `SportBillTable({ calc, expenseAmount, meId }: { calc: SportBillCalc; expenseAmount: number; meId: string | null })`.
- Copy: `expensePay.viewBill` "View the bill" · `expensePay.billTitle` "The bill" · `expensePay.nothingHere` "Nothing for {name} in this bill" · reuse `guest.switch` "Not {name}? Switch" and `owe.seeGroup`.

- [ ] **Step 1: Write the failing tests:**
  - `sport-bill-table.test.tsx`: renders every participant with slots and amounts, the total-slots, costs and per-slot rows with the same numbers `ExpenseDetails` shows today (use `src/test/sportExpense.test.tsx`'s fixture); `has no sideways scroll container` → no element with class `overflow-x-auto`, and the table uses `table-fixed` with a name column that wraps (`break-words`).
  - `expense-pay-bill.test.tsx`:
    - `a person with a share sees the QR first and opens the bill in a sheet` → "View the bill" button; clicking opens a dialog named "The bill" containing the table; the QR stays rendered.
    - `the payer opening their own bill link sees the bill with Share bill & QR` (Review Focus 5).
    - `a remembered name with no share sees Nothing for Bình in this bill` → text, a "Not Bình? Switch" control that goes to `…/who?expense=<id>&next=…`, and "See the group" (Review Focus 5).
    - The case recorded in Task 1's findings file, asserting the person lands on the pay screen.
- [ ] **Step 2: [architect] Update the existing test** `row null redirects to the expense page` (`expense-pay.test.tsx:216`): its viewer is guest Chi, who is not the payer, so it now expects "Nothing for Chi in this bill" and no redirect. The payer case is covered by the new test above.
- [ ] **Step 3: Run** `cd libs/web/screens && npx vitest run src/components/__tests__/sport-bill-table.test.tsx src/screens/__tests__/expense-pay-bill.test.tsx src/screens/__tests__/expense-pay.test.tsx` → FAIL.
- [ ] **Step 4: Implement.** Extract the calculation and table without changing any number; make the table fit 320–375px (fixed layout, name column wraps, the amount column right-aligned and never clipped; stacking rows is acceptable). In `ExpensePay`: a secondary `Button` "View the bill" under "I've paid" opening a `Sheet` with `SportBillTable` (non-sport bills: description, amount and the per-person shares list); replace the redirect at `:161` with: payer (`view.expenses` entry's `payerId === view.me.participantId`) → today's redirect to the bill; anyone else → the "nothing here" state.
- [ ] **Step 5: Run** the tests → PASS; run `src/test/sportExpense.test.tsx`, `src/test/sportShare.test.ts` and the other `expense-pay*.test.tsx` → still PASS.
- [ ] **Step 6: [architect] Check the bill image** (spec §4.5's share card): run Task 1's walkthrough step that opens "Share bill & QR" with a Zalo user agent, in vi and en, with the long name in the roster. If a name or the amount column is clipped, fix `renderSportBillPng` (wrap or shorten the name, never the amount) in this task.
- [ ] **Step 7: Commit** `feat(web): bill link opens on your share with the bill in a sheet; bill table fits a phone`

### Task 5: "Who are you?" on bill links (spec §4.3, §4.4)

**Files:**
- Modify: `libs/web/screens/src/screens/WhoAreYou.tsx` (guest note `:466–488`; join row gate `:679`)
- Modify: `libs/web/i18n/src/en.ts`, `vi.ts`
- Test: `libs/web/screens/src/screens/__tests__/who-bill-link.test.tsx`

**Interfaces:**
- Consumes: `isExpenseMode` (`WhoAreYou.tsx:97`), `join()`, `onJoinRow()`.
- Copy: `who.guestLine` "Joining as a guest: what you add waits for a member's approval."

- [ ] **Step 1: Write the failing tests:**
  - `bill link: no guest box, just the list` → no element with role `note`; the name list is present.
  - `group link: the guest explanation is one quiet line` → `who.guestLine` text present, no `role="note"` box, sign-in buttons still rendered below the list.
  - `bill link: a signed-in newcomer can join` → "Join as Hoa" visible with an expense param; joining POSTs the join and navigates to `next` (`…/expenses/<id>/pay`).
  - `bill link, sport group: joining asks the gender first` → the gender step appears before the join request (the labelled control comes in Part 2; here assert the step is reached).
- [ ] **Step 2: Run** `cd libs/web/screens && npx vitest run src/screens/__tests__/who-bill-link.test.tsx` → FAIL.
- [ ] **Step 3: [architect] Update two existing tests** that pin the old behaviour on purpose: `who-expense.test.tsx:54–56` (its picker has `account: Dũng`; it now expects "Not on the list? Join as Dũng" in expense mode, and still no "Rejoin as") and `who-join.test.tsx:33` (expects the `who.guestLine` text instead of the "Joining as a guest" title).
- [ ] **Step 4: Implement:** keep the `fsl-who__guest-note` class on the new line; render it only when `!isExpenseMode`, as a `p` in `text-sm text-muted-foreground` with `who.guestLine` (no `role="note"`, no amber), sign-in buttons moved under the list; remove `!isExpenseMode &&` from the join row's condition at `:679`.
- [ ] **Step 5: Run** the new and existing `who*.test.tsx` → PASS.
- [ ] **Step 6: Commit** `fix(web): newcomers can join from a bill link; no guest warning box on bill links`

### Task 6: Ask for bank details before a "pay me" share (spec §4.6)

**Files:**
- Create: `libs/web/screens/src/components/BankFirstSheet.tsx`
- Create: `libs/web/screens/src/lib/bankFirst.ts`
- Modify: `libs/web/screens/src/components/InviteSheet.tsx` (`useLinkActions` share/copy, `:21–57`)
- Modify: `libs/web/screens/src/components/ExpenseDetails.tsx` (`handleShareSportBill`)
- Modify: `libs/web/i18n/src/en.ts`, `vi.ts`
- Test: `libs/web/screens/src/components/__tests__/bank-first.test.tsx`

**Interfaces:**
- Produces: `needsBankFirst(view: TripView): boolean` → my person row exists and its `bank === 'none'` (pending or approved → false).
- Produces: `useBankFirst(view: TripView): { guard: (action: () => void | Promise<void>) => void; sheet: ReactNode }`; `guard` runs `action` at once unless `needsBankFirst`, else opens `BankFirstSheet`, whose "Share anyway" runs `action` and "Add bank details" goes to `/me/bank` (signed-in) or `href('/bank')` (guest). After "Share anyway", that group stops asking on this phone (`localStorage` key `cc.bankFirst.skip.<tripId>`, read and written in try/catch; no storage → it asks again, which is fine).
- Where it guards: the Invite sheet's Share and Copy, and "Share bill & QR" only when the bill's payer is me. The "pay me" reminder needs no guard: its QR (`YourTransfers.tsx:66–70`) only exists once bank details do.
- Copy: `bankFirst.title` "Add your bank details first?" · `bankFirst.body` "Friends who open this link will see a QR to pay you only after you add them." · `bankFirst.add` "Add bank details" · `bankFirst.anyway` "Share anyway".

- [ ] **Step 1: Write the failing tests:** `shares at once when bank details exist`; `asks first when there are none` (sheet with both buttons, nothing shared yet); `Share anyway shares`; `after Share anyway the group doesn't ask again`; `Add bank details goes to /me/bank`; `pending bank details don't ask`; in `InviteSheet` and the sport bill share, the share call happens only after "Share anyway" when bank is `none`; `sharing a bill someone else paid doesn't ask`.
- [ ] **Step 2: Run** `cd libs/web/screens && npx vitest run src/components/__tests__/bank-first.test.tsx` → FAIL.
- [ ] **Step 3: Implement**, keeping the user gesture: `guard` must call `action` synchronously from the button handler when no sheet is needed (copy-to-clipboard and `navigator.share` need it).
- [ ] **Step 4: Run** the new tests and the existing `InviteSheet`/`ExpenseDetails` tests → PASS.
- [ ] **Step 5: Commit** `feat(web): suggest adding bank details before sharing a pay-me link`

### Task 7: End-to-end tests for the payment share path (spec §4.9.2)

**Files:**
- Create: `e2e/payment-share.spec.ts`

**Interfaces:**
- Consumes: `/owe` (Task 3), bill sheet and states (Task 4), join from bill link (Task 5), bank-first (Task 6).

- [ ] **Step 1: Write the tests** at 375×812, English, sign-in via `/api/test/login`, Minh with bank details (as in `golden-path.spec.ts`):
  - `pay link: a guest who owes one person lands on the QR` → after picking Chi, `getByRole('img', { name: /VietQR code to pay Minh/ })` visible without other taps.
  - `pay link: a guest who owes two people sees both, pays one` (trip with Minh and Bình both paying).
  - `ordinary invite link still opens the group page` → "Viewing as Chi" visible.
  - `bill link: a guest's first screen is their share and the QR; View the bill opens the bill` → session share amount and QR; the dialog "The bill" lists the court.
  - `bill link: a signed-in newcomer joins and lands on their share`.
  - `sharing with no bank details asks first` → "Add your bank details first?" then "Share anyway".
- [ ] **Step 2: Run** `npx playwright test e2e/payment-share.spec.ts` → PASS; `npm run e2e` → all specs PASS.
- [ ] **Step 3: Commit** `test(e2e): payment share path from Zalo links`

### Task 8: Bug check and hand-off (spec §4.9)

**Files:**
- Modify: `DESIGN.md` (Components: the "you owe" list and the bill sheet, one short entry each)
- Modify: `.impeccable/design.json` (regenerate after DESIGN.md)

- [ ] **Step 1: Run the walkthrough** (`WALKTHROUGH=1 npx playwright test e2e/walkthrough.spec.ts`, extended with the pay-link steps) and **[architect]** review every screenshot at 375 and 1280, vi and en: no clipping, no sideways scroll, copy fits, the states of §4.8 all reached. Fix anything found in the task that owns it.
- [ ] **Step 2: Full checks:** `npm run typecheck`, `npm run lint`, `npm test`, `npm run e2e` → all green.
- [ ] **Step 3: Update DESIGN.md** and regenerate the sidecar.
- [ ] **Step 4: Commit** `docs: DESIGN.md entries for the you-owe list and the bill sheet`
- [ ] **Step 5: Push and open the PR** with base `NguyenVuNhan/Nx-workspace`; the body carries the real-phone checklist for the owner: in Zalo's in-app browser (Android, iPhone), Chrome Android, Safari iPhone, the home-screen app and the Mini App, open (a) a reminder pay link owing one person, (b) owing two, (c) a session bill link on a new phone and a remembered one, (d) the bill link as a signed-in newcomer; for each, reach the QR, save it, open the bank app, mark "I've paid", and confirm from the organiser's phone. Offer `npm run tunnel` for the check.
