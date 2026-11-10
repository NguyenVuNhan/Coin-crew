# Sport Session Time Range & Auto Duration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace free-text time range input and manual duration in the sport schedule card with recent start time suggestions, a custom native time picker, duration steppers, and reactive auto-calculated duration.

**Architecture:** 
1. Extract unique start times (up to 3) from the group's recent games (`view.expenses`).
2. For each court row: provide a court name input, a native `<input type="time">` custom start time input alongside recent start time chips (e.g. `18:00`), and a duration stepper (`1h`, `1.5h`, `2h`, `2.5h`, `3h`).
3. Automatically compute the court slot's `timeRange` (`start - end`), inherit Court 1's time slot for new rows (`+ Thêm sân đấu`), and calculate `totalDuration` reactively.
4. Replace the standalone `input#sport-total-duration` with an auto-computed Jade status banner (`⏱ Thời lượng: 2 giờ thi đấu (18:00 – 20:00) · 1 sân`) and save directly to `meta.sport.totalDuration`.
5. Update `@cc/web-i18n` with all required localized strings, eliminate hardcoded English ARIA strings, and apply `rounded-full` to icon buttons.

**Tech Stack:** React 19, Tailwind CSS v4, TypeScript, shadcn/ui primitives, Vitest, `@testing-library/react`.

**Spec:** Shaped Design Brief (Option B with Recent Games & Custom Time).

## Global Constraints

- **Design System ("The Friendly Ledger", `DESIGN.md`, `.impeccable/design.json`):** Every colour must use theme tokens (`bg-background`, `bg-card`, `border-border`, `bg-primary`, `bg-secondary text-secondary-foreground`, `bg-muted text-muted-foreground`); never use raw hex in React components (enforced by `style-guard.test.ts`), never use money colours for decoration, keep all interactive targets at least `min-h-11` (44px), input text at `16px` (`text-base`), and use `rounded-full` for all icon/dismiss buttons.
- **No breaking changes to API schema or DTOs:** `meta.sport.bookingCode`, `meta.sport.totalDuration`, and `meta.sport.courtSlots` (`{ courtName: string; timeRange: string }[]`) interfaces remain strictly preserved.
- **Language consistency:** Both Vietnamese (`vi.ts`) and English (`en.ts`) translations must be kept in sync.

## Review Focus

1. **Zero past games fallback:** In a newly created sport group with 0 past games, no chips are rendered and the native `<input type="time">` is readily accessible for custom input.
2. **Overnight session calculation:** e.g., `23:00` start + `2h` duration correctly yields `23:00 - 01:00` and `2h` total duration without 25-hour arithmetic distortion.
3. **Multi-court slot inheritance:** Adding court 2 inherits court 1's start time and duration, but allows court 2 to be edited independently.
4. **Existing expense edit mode:** Loading an existing planned expense with a pre-saved `timeRange` (e.g., `18:30 - 20:30`) correctly parses and initializes start time (`18:30`) and duration (`2h`).
5. **No manual duration input & form submission:** Form submits with `totalDuration` populated from auto-calculation, with no `input#sport-total-duration` element.

---

### Task 1: Translation Keys in `@cc/web-i18n`

**Files:**
- Modify: `libs/web/i18n/src/vi.ts`
- Modify: `libs/web/i18n/src/en.ts`

**Interfaces:**
- Consumes: Existing sport keys in `@cc/web-i18n`.
- Produces: Localized labels for court slots, start time, duration stepper, and accessibility.

- [ ] **Step 1: Write translation keys in `libs/web/i18n/src/vi.ts`**
  Add/update keys:
  - `sport.startTimeLabel`: `'Giờ bắt đầu'`
  - `sport.durationLabel`: `'Thời lượng'`
  - `sport.customTimePlaceholder`: `'00:00'`
  - `sport.courtNameIndex`: `'Tên sân {index}'`
  - `sport.timeRangeIndex`: `'Khung giờ sân {index}'`
  - `sport.removeCourtIndex`: `'Xóa sân {index}'`
  - `sport.calculatedRange`: `'Khung giờ tính toán: {range}'`
  - `sport.totalDurationBanner`: `'Thời lượng: {duration} ({range}) · {courts} sân'`

- [ ] **Step 2: Write translation keys in `libs/web/i18n/src/en.ts`**
  Add corresponding English keys:
  - `sport.startTimeLabel`: `'Start time'`
  - `sport.durationLabel`: `'Duration'`
  - `sport.customTimePlaceholder`: `'00:00'`
  - `sport.courtNameIndex`: `'Court name {index}'`
  - `sport.timeRangeIndex`: `'Time slot court {index}'`
  - `sport.removeCourtIndex`: `'Remove court {index}'`
  - `sport.calculatedRange`: `'Calculated slot: {range}'`
  - `sport.totalDurationBanner`: `'Duration: {duration} ({range}) · {courts} courts'`

- [ ] **Step 3: Verify i18n compiles**
  Run: `npx nx run web-i18n:typecheck` (or `npx vitest run libs/web/screens/src/__tests__/sport-planning-ui.test.tsx`)
  Expected: PASS

- [ ] **Step 4: Commit translation keys**
  ```bash
  git add libs/web/i18n/src/vi.ts libs/web/i18n/src/en.ts
  git commit -m "feat(sport): add i18n keys for start time, duration steppers and accessible labels"
  ```

---

### Task 2: Pure Time & Duration Utilities

**Files:**
- Modify: `libs/web/screens/src/screens/ExpenseForm.tsx`
- Test: `libs/web/screens/src/__tests__/sport-planning-ui.test.tsx`

**Interfaces:**
- Produces:
  - `extractRecentStartTimes(expenses: ExpenseView[], maxCount?: number): string[]`
  - `parseStartAndDuration(timeRange: string): { startTime: string; durationHours: number } | null`
  - `formatTimeRange(startTime: string, durationHours: number): string`
  - `calculateSlotsDuration(slots: { courtName: string; timeRange: string }[]): string | null`

- [ ] **Step 1: Write unit tests for the time utilities in `sport-planning-ui.test.tsx`**
  - Test `extractRecentStartTimes` extracts up to 3 unique start times ordered by recency from expenses with `meta.sport.courtSlots`.
  - Test `parseStartAndDuration('18:00 - 20:00')` returns `{ startTime: '18:00', durationHours: 2 }`.
  - Test `parseStartAndDuration('05:30 - 07:00')` returns `{ startTime: '05:30', durationHours: 1.5 }`.
  - Test `formatTimeRange('18:00', 2)` returns `'18:00 - 20:00'`.
  - Test `formatTimeRange('23:00', 2)` returns `'23:00 - 01:00'`.
  - Test `calculateSlotsDuration` returns `'2h'` for `[{ courtName: 'Sân 1', timeRange: '18:00 - 20:00' }, { courtName: 'Sân 2', timeRange: '18:00 - 20:00' }]`.

- [ ] **Step 2: Run test to verify it fails**
  Run: `npx vitest run libs/web/screens/src/__tests__/sport-planning-ui.test.tsx`
  Expected: FAIL with missing exports / functions.

- [ ] **Step 3: Implement utilities in `ExpenseForm.tsx`**
  - Implement `extractRecentStartTimes` inspecting `expenses` (filtering for `meta.sport.courtSlots`, sorting by `spentOn`/`createdAt` desc, extracting valid start times, deduplicating, limiting to `maxCount`).
  - Implement `parseStartAndDuration` supporting standard and Vietnamese connectors (`-`, `–`, `—`, `to`, `đến`, `tới`, `~`).
  - Implement `formatTimeRange(startTime, durationHours)` calculating `endH` and `endM` modulo 24.
  - Harden `calculateSlotsDuration` to support multi-court spans and avoid midnight overflow bugs.

- [ ] **Step 4: Run test to verify it passes**
  Run: `npx vitest run libs/web/screens/src/__tests__/sport-planning-ui.test.tsx`
  Expected: PASS

- [ ] **Step 5: Commit utilities**
  ```bash
  git add libs/web/screens/src/screens/ExpenseForm.tsx libs/web/screens/src/__tests__/sport-planning-ui.test.tsx
  git commit -m "feat(sport): add time extraction and start-duration calculation helpers"
  ```

---

### Task 3: Sport Schedule Card UI Refinement

**Files:**
- Modify: `libs/web/screens/src/screens/ExpenseForm.tsx`
- Test: `libs/web/screens/src/__tests__/sport-planning-ui.test.tsx`

**Interfaces:**
- Consumes: Utilities from Task 2 and i18n keys from Task 1.
- Produces: Refined `div.fsl-sport-schedule-card` UI.

- [ ] **Step 1: Write UI tests in `sport-planning-ui.test.tsx`**
  - Verify recent start time chips render when past expenses exist, and clicking a chip updates the slot's time range and computed duration.
  - Verify native `<input type="time">` updates start time and computed end time.
  - Verify duration stepper (`1h`, `1.5h`, `2h`, `2.5h`, `3h`) updates duration and end time.
  - Verify `+ Thêm sân đấu` inherits previous slot's start time and duration.
  - Verify `input#sport-total-duration` is removed and replaced by duration summary banner.
  - Verify remove button uses `rounded-full` and localized `aria-label`.

- [ ] **Step 2: Run test to verify it fails**
  Run: `npx vitest run libs/web/screens/src/__tests__/sport-planning-ui.test.tsx`
  Expected: FAIL

- [ ] **Step 3: Implement Schedule Card UI in `ExpenseForm.tsx`**
  - Compute `recentStartTimes = useMemo(() => extractRecentStartTimes(view.expenses, 3), [view.expenses])`.
  - For court slots: render court name input, start time row (with native `<input type="time">` and clean recent chips), duration pills (`[1h]`, `[1.5h]`, `[2h]`, `[2.5h]`, `[3h]`), and calculated range text.
  - When adding a court slot (`+ Thêm sân đấu`), prefill with the previous slot's start time and duration.
  - Render live Jade status banner: `⏱ {t('sport.totalDurationBanner', ...)}`.
  - Ensure `totalDuration` automatically syncs with computed duration on form submit.
  - Apply `rounded-full` to remove button with localized `aria-label={t('sport.removeCourtIndex', { index: idx + 1 })}`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `npx vitest run libs/web/screens/src/__tests__/sport-planning-ui.test.tsx`
  Expected: PASS

- [ ] **Step 5: Commit UI refinement**
  ```bash
  git add libs/web/screens/src/screens/ExpenseForm.tsx libs/web/screens/src/__tests__/sport-planning-ui.test.tsx
  git commit -m "feat(sport): refine schedule card with recent start times, duration stepper and auto duration"
  ```

---

### Task 4: Design Token & Style Guard Verification

**Files:**
- Test: `libs/web/screens/src/test/style-guard.test.ts`
- Test: `libs/web/screens/src/__tests__/sport-planning-ui.test.tsx`

- [ ] **Step 1: Run style-guard and full screens test suite**
  Run: `npx vitest run libs/web/screens/src/test/style-guard.test.ts`
  Run: `npx vitest run libs/web/screens/src/__tests__/sport-planning-ui.test.tsx`
  Expected: PASS (No raw hex, token compliance, min 44px touch targets).

- [ ] **Step 2: Typecheck and lint**
  Run: `npm run typecheck`
  Run: `npm run lint`
  Expected: PASS

- [ ] **Step 3: Re-run Impeccable Critique to verify score improvement**
  Run detector:
  ```powershell
  & "C:\Users\NvN\.claude\skills\impeccable\scripts\impeccable.cmd" detect --json libs/web/screens/src/screens/ExpenseForm.tsx
  ```
  Expected: 0 findings, verified score improvement.
