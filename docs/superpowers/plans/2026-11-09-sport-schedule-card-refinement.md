# Sport Schedule Card & Duration Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the sport planning schedule card (`fsl-sport-schedule-card`) in `ExpenseForm.tsx` and `ExpenseDetails.tsx` to disambiguate the "Thêm sân" vocabulary (venue vs. court slots), decouple "Mã đặt" and "Thời lượng" into independent labeled fields with duration auto-calculation hints, prefill court time ranges on new rows, and prevent silent slot dropping.

**Architecture:** Update `@cc/web-i18n` with clear, non-colliding terminology for venues and court slots; split the dual-purpose "Mã đặt / Tổng giờ" row in `ExpenseForm` into separate accessible form controls with auto-computed duration suggestions; enhance the court slot addition flow to inherit prior time ranges; update `ExpenseDetails` to render distinct fact rows for booking code and duration; and verify all changes against the design system rules in `DESIGN.md` and automated tests.

**Tech Stack:** React 19, Tailwind CSS v4, TypeScript, shadcn/ui primitives, Vitest, `@testing-library/react`.

**Spec:** `docs/superpowers/specs/2026-11-08-sport-planning-mode-design.md` & Design Feedback critique.

## Global Constraints

- **Design System ("The Friendly Ledger", `DESIGN.md`, `.impeccable/design.json`):** Every colour must use theme tokens (`bg-background`, `bg-card`, `border-border`, `bg-primary`, `bg-secondary text-secondary-foreground`, `bg-muted text-muted-foreground`); never use raw hex in React components (enforced by `style-guard.test.ts`), never use money colours (`success`, `warning`, `danger`) for decorative elements, never nest cards inside cards, and keep all interactive targets at least `min-h-11` (44px) and input text at `16px` (`text-base`).
- **No breaking changes to API schema or DTOs:** `meta.sport.bookingCode`, `meta.sport.totalDuration`, and `meta.sport.courtSlots` interfaces remain intact.
- **Language consistency:** Both Vietnamese (`vi.ts`) and English (`en.ts`) translations must be kept in sync.

## Review Focus

1. **Vocabulary disambiguation between location vs. court slot:** Dropdown displays `+ Thêm địa điểm mới` (`sport.addLocation`), section header displays `Sân đấu & khung giờ` (`sport.courtSlotsLabel`), and add slot button displays `+ Thêm sân đấu` (`sport.addCourtSlot`).
2. **Independent labels and accessibility for booking code & duration:** `sport-booking-code` has its own `<Label>` ("Mã đặt sân"), and `sport-total-duration` has its own `<Label>` ("Thời lượng"), each with corresponding `htmlFor`, placeholders, and no English `aria-label` leak.
3. **Slot time inheritance on add:** Clicking `+ Thêm sân đấu` when previous slots have a non-empty `timeRange` automatically prefills the new slot's `timeRange` so mobile users don't have to re-type the same time range.
4. **Auto-computed duration suggestion:** When valid court slots with time ranges are present, an auto-computed suggestion pill (e.g. `Gợi ý: ~2h`) appears if duration is empty, allowing 1-tap quick filling.
5. **No awkward joined labels in ExpenseDetails:** If only `bookingCode` or only `totalDuration` is present, `ExpenseDetails` renders only the respective fact row with its exact label ("Mã đặt sân" or "Thời lượng"), eliminating `"Mã đặt / Tổng giờ: 2h"`.

---

### Task 1: Translation Keys & Copy Refinement

**Files:**
- Modify: `libs/web/i18n/src/vi.ts`
- Modify: `libs/web/i18n/src/en.ts`

**Interfaces:**
- Consumes: Existing sport keys in `@cc/web-i18n`.
- Produces: Disambiguated sport location, court slot, booking code, duration, and fact label keys.

- [ ] **Step 1: Update Vietnamese translations (`libs/web/i18n/src/vi.ts`)**
  Update and add keys:
  - `sport.addLocation`: `'+ Thêm địa điểm mới'` (was `'+ Thêm sân mới'`)
  - `sport.courtSlotsLabel`: `'Sân đấu & khung giờ'` (was `'Sân & khung giờ'`)
  - `sport.addCourtSlot`: `'+ Thêm sân đấu'` (was `'+ Thêm sân'`)
  - `sport.bookingCodeLabel`: `'Mã đặt sân'` (was `'Mã đặt / Tổng giờ'`)
  - `sport.bookingCodePlaceholder`: `'VD: #4139'`
  - `sport.totalDurationLabel`: `'Thời lượng'`
  - `sport.totalDurationPlaceholder`: `'VD: 2h'`
  - `sport.durationSuggestion`: `'Gợi ý: {duration}'`
  - `sport.bookingCodeFact`: `'Mã đặt sân'`
  - `sport.totalDurationFact`: `'Thời lượng'`

- [ ] **Step 2: Update English translations (`libs/web/i18n/src/en.ts`)**
  Update and add keys:
  - `sport.addLocation`: `'+ Add new venue'`
  - `sport.courtSlotsLabel`: `'Courts & time slots'`
  - `sport.addCourtSlot`: `'+ Add court slot'`
  - `sport.bookingCodeLabel`: `'Booking code'`
  - `sport.bookingCodePlaceholder`: `'e.g. #4139'`
  - `sport.totalDurationLabel`: `'Duration'`
  - `sport.totalDurationPlaceholder`: `'e.g. 2h'`
  - `sport.durationSuggestion`: `'Suggested: {duration}'`
  - `sport.bookingCodeFact`: `'Booking code'`
  - `sport.totalDurationFact`: `'Duration'`

- [ ] **Step 3: Verify TypeScript compilation of i18n package**
  Run: `npm run typecheck` or test with `sport-planning-ui.test.tsx`.

---

### Task 2: Refactor `ExpenseForm.tsx` Schedule Card (Decouple Fields, Prefill Time, Duration Hint)

**Files:**
- Modify: `libs/web/screens/src/screens/ExpenseForm.tsx`

**Interfaces:**
- Consumes: Translations from `@cc/web-i18n`, `SportCourtSlot` from `@cc/core`.
- Produces: Refined schedule card UI with decoupled fields, smart prefilling, and duration hint helper.

- [ ] **Step 1: Implement duration calculation helper `calculateSlotsDuration`**
  Add helper function to parse time ranges like `05:00 - 07:00`, `5h - 7h`, `5h00 - 7h00`, `18h-20h`, `18:00 - 20:30` and calculate total span or elapsed hours.
  Returns e.g. `'2h'`, `'2h30p'`, or `null` if unparseable.

- [ ] **Step 2: Update slot addition to prefill time range from previous row**
  In the `+ Thêm sân đấu` click handler:
  ```tsx
  setCourtSlots((rows) => {
    const lastTime = [...rows].reverse().find((r) => r.timeRange.trim())?.timeRange.trim() ?? '';
    return [...rows, { courtName: '', timeRange: lastTime }];
  });
  ```

- [ ] **Step 3: Decouple Booking Code & Duration inputs**
  Replace the single `Mã đặt / Tổng giờ` block with a 2-column grid containing two distinct field blocks, each with its own `<Label htmlFor="...">` and `<Input id="...">`:
  - Field 1: `sport-booking-code` with label `{t('sport.bookingCodeLabel')}` and placeholder `{t('sport.bookingCodePlaceholder')}`.
  - Field 2: `sport-total-duration` with label `{t('sport.totalDurationLabel')}` and placeholder `{t('sport.totalDurationPlaceholder')}`.
  - Below `sport-total-duration`, if `totalDuration` is empty and `suggestedDuration` is available, render a clickable button/pill (`Gợi ý: {suggestedDuration}`) that sets `totalDuration(suggestedDuration)`.

- [ ] **Step 4: Improve `activeCourtSlots` fallback logic**
  Ensure slots where `courtName` is provided are not silently discarded if a common session time can be inferred, or ensure clarity in slot requirements.

---

### Task 3: Refactor `ExpenseDetails.tsx` (Distinct Fact Rows for Booking Code and Duration)

**Files:**
- Modify: `libs/web/screens/src/components/ExpenseDetails.tsx`

**Interfaces:**
- Consumes: `sportMeta.bookingCode`, `sportMeta.totalDuration`.
- Produces: Independent fact rows when values are present.

- [ ] **Step 1: Replace merged fact row with separate rows in `ExpenseDetails.tsx`**
  ```tsx
  {sportMeta?.bookingCode && (
    <div className="fsl-details__fact flex items-center justify-between gap-3 px-4 py-3 min-h-11">
      <dt className="text-sm text-muted-foreground">{t('sport.bookingCodeFact')}</dt>
      <dd className="text-sm font-medium text-foreground text-right m-0">{sportMeta.bookingCode}</dd>
    </div>
  )}
  {sportMeta?.totalDuration && (
    <div className="fsl-details__fact flex items-center justify-between gap-3 px-4 py-3 min-h-11">
      <dt className="text-sm text-muted-foreground">{t('sport.totalDurationFact')}</dt>
      <dd className="text-sm font-medium text-foreground text-right m-0">{sportMeta.totalDuration}</dd>
    </div>
  )}
  ```

---

### Task 4: Automated Testing & Verification

**Files:**
- Modify: `libs/web/screens/src/__tests__/sport-planning-ui.test.tsx`
- Run: `npm test -w libs/web/screens`
- Run: `npm run lint`

- [ ] **Step 1: Update existing tests in `sport-planning-ui.test.tsx` for new labels**
  Ensure test queries match the decoupled labels (`Mã đặt sân` / `Booking code`, `Thời lượng` / `Duration`).

- [ ] **Step 2: Add unit tests for new behaviors**
  - Test clicking `+ Thêm sân đấu` prefills previous row's time range.
  - Test suggested duration button appears when slots have times and fills the duration input on click.
  - Test `ExpenseDetails` renders independent rows when only `bookingCode` or only `totalDuration` is present.

- [ ] **Step 3: Run style-guard test and typecheck**
  Verify zero raw hex, no forbidden money colors, 44px min-h touch targets, and clean TypeScript compilation.
