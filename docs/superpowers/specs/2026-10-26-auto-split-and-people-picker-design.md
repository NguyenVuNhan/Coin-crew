# Automatic Split Boxes & Choosing Who's In — Design

Date: 2026-10-26 · Status: draft for review · Branch: to be decided (builds on `feat/add-remove-members-impl`, which is not on `main` yet) · Builds on: [2026-10-22-add-remove-members-design.md](2026-10-22-add-remove-members-design.md) (people who left stay off new expenses)

---

## 1. Intent & Why

Two problems on the expense form:

1. **Percent is all-or-nothing.** Every person on a percent split needs a typed percentage, and they must add up to exactly 100%. Splitting "Minh pays 40%, the rest share what's left" means working out 20% by hand for each of the others, and redoing it whenever someone is added. A blank box quietly takes the person off the expense. Exact amounts has the same problem.
2. **You can't choose who's in before you split.** Only Equally, Adjust and Sport rows have tick boxes. In Exact amounts, Percent and Shares, being on the expense means having a number above 0. Splitwise lets you choose the people first and then split among them.

### Decisions (from the brainstorm)
- In **Exact amounts and Percent**, a blank box is **automatic**: blank people share equally whatever is left of the total or of 100%. Their value shows as a grey **placeholder**, never typed into the box.
- Automatic boxes **stay blank after saving**. The server remembers who was automatic, so an edit (new total, changed value, person added) re-divides among them.
- If the typed values already use up the whole bill, the automatic people **owe 0 and stay on the expense**. It saves.
- Who's in is chosen on a **"Split between" line that opens a sheet** (option C of three mockups).
- In the sheet, groups of **more than 12** people get a **search field with chips**: type to see suggestions, tap one to add a chip, × removes it, and chosen people are no longer suggested.
- A new expense starts with **everyone in**, with **Clear all**.
- The sheet offers **up to 3 recent groups** ("Same people as …") with a one-tap **Use**.
- **The server works out the automatic shares** in core (approach 1), with a new `input_auto` column on shares.

### Success criteria
- With 4 people chosen and a 1.000.000₫ bill split by percent, typing 40% for Minh gives the other three 200.000₫ each, with no error and nothing else typed.
- The same works in Exact amounts: typing 400.000₫ for Minh gives the other three 200.000₫ each.
- Automatic people's shares differ by at most 1₫.
- Reopening a saved expense shows the automatic boxes empty with their placeholders. Changing the total re-divides them.
- In a 16-person group, choosing the 8 players from last Tuesday is one tap (**Use**). Choosing 8 by hand is Clear all plus typing 8 names.
- Expenses saved before this change open and save exactly as they do today.

---

## 2. Goals & Non-Goals

**Goals**
- Automatic boxes in Exact amounts and Percent, worked out in `packages/core` and used by both the form and the API.
- One way to choose who's in, for every split mode including Sport.
- Recent groups, tick list (12 or fewer people) and chip search (more than 12) in one sheet.

**Non-goals**
- No automatic boxes in Shares or Adjust. Their blank boxes just get a default (1 share, no adjustment).
- No change to how the payer is chosen. The payer doesn't have to be in the split.
- No change to expense details, the activity feed or balances. They read `amount` only.
- No new server endpoint. Recent groups come from the expenses the trip view already returns.
- No saved or named groups. "Recent groups" is worked out each time.

---

## 3. Split Rules in Core (`packages/core/src/split.ts`)

### 3.1 Type
`SplitEntry` becomes `{ participantId: string; value: number | null }`. `null` means **automatic**, and only `amounts` and `percent` accept it. `equal`, `shares` and `adjust` return `{ ok: false, error: 'INVALID_VALUE' }` for any null entry.

### 3.2 Exact amounts (`amounts`)
Let **S** be the sum of the typed values (each a safe integer ≥ 0) and **k** the number of automatic entries.
- A typed value that is negative or not a safe integer: `AMOUNTS_DONT_ADD_UP` (unchanged).
- **S > total**: `AMOUNTS_DONT_ADD_UP`.
- **k = 0 and S ≠ total**: `AMOUNTS_DONT_ADD_UP` (unchanged).
- Otherwise typed people get their value, and the automatic people split **total − S** with `distributeWeighted(total − S, [1, …, 1])`, so they differ by at most 1₫. When total − S = 0 they each get 0.

### 3.3 Percent (`percent`)
Values are hundredths of a percent (100% = 10000). Let **P** be the sum of the typed values and **k** the number of automatic entries.
- A typed value that is negative or not a safe integer: `PERCENT_NOT_100` (unchanged).
- **P > 10000**: `PERCENT_NOT_100`.
- **k = 0 and P ≠ 10000**: `PERCENT_NOT_100` (unchanged).
- Otherwise the weights are **p × k** for a typed person and **10000 − P** for each automatic person, and the shares come from `distributeWeighted(total, weights)`. The weights total 10000 × k, so typed people get exactly their percent of the total and the automatic people split the rest of the money, at most 1₫ apart. Leftover dong are placed by the existing largest-remainder rule.
- Worked example: 1.000.000₫, Minh 40% (4000), three automatic, k = 3. The weights are 12000 for Minh and 6000 for each of the others, giving 400.000₫ and 200.000₫ ×3.
- P = 10000 with k > 0 gives the automatic people weight 0, so they each get 0.

### 3.4 Typed zero
A typed `0` is a real value in every mode that accepts it: the person stays on the expense and owes 0. Only the Change sheet takes someone off (§5).

### 3.5 Unchanged
`equal`, `shares`, `adjust` and `computeSportShares` keep their maths. All results still add up to the total.

---

## 4. API & Storage

### 4.1 Request validation (`apps/api/src/expenses/routes.ts`)
- Entry parsing (around line 101) accepts `value` as a number **or `null`**. Anything else is still `Invalid entry`.
- Entries are sorted by `sortOrder` and passed to `computeShares` as today, so a null in the wrong mode comes back as 422 `INVALID_VALUE`.
- When saving, the share row is built (around line 231) like this:
  - automatic entry: `inputAuto: 1`, `inputValue: 0`
  - otherwise: `inputAuto: 0`, `inputValue` as today (`1` for equal, else the typed value)
- Sport, guest approval and the people-who-left checks don't change. Sport always sends full `amounts`, so it never sends nulls.

### 4.2 Migration
`apps/api/migrations/0005_share_input_auto.sql`:

```sql
ALTER TABLE `transaction_shares` ADD COLUMN `input_auto` integer DEFAULT 0 NOT NULL;
```

`apps/api/src/db/schema.ts` adds `inputAuto: integer('input_auto').notNull().default(0)` to `transactionShares`. Every existing row becomes 0, so no data is backfilled. Tests pick the migration up through `readD1Migrations` in `vitest.config.ts`, and deploys through `wrangler d1 migrations apply`.

### 4.3 Read path
- `apps/api/src/trips/snapshot.ts` (around line 182) maps a share to `inputValue: s.inputAuto === 1 ? null : s.inputValue`.
- `packages/core/src/api-types.ts`: `inputValue: number | null` on `ExpenseView.shares` (line 140) and on `ExpenseHistoryItem.shares` (line 84). `ExpenseInput.entries` already uses `SplitEntry`, so it picks up the nullable value.
- The expense form is the only reader of `inputValue`, so nothing else on screen changes.

### 4.4 Other writers of shares
- **Merge** (`apps/api/src/participants/merge.ts`, lines 134 and 156): it already turns the expense into `amounts` with `inputValue = amount`. It now also sets `inputAuto: 0` on the rows it rewrites.
- **Payments** (`apps/api/src/payments/routes.ts:187`): they use the column default and need no change.

### 4.5 Older open tabs
A form loaded before this change only sends numbers, so its requests behave exactly as before.

---

## 5. The Expense Form

### 5.1 Layout of the Split section
Top to bottom: the **"Split between" line**, then the mode picker (`SplitModePicker`, unchanged), then the line under the picker, then **one row per chosen person**, in group order. This applies in every mode including Sport.

The tick boxes on Equally, Adjust and Sport rows are **removed** (`ExpenseForm.tsx` around lines 1002 and 1223). The "Split between" line is the only place to choose people.

### 5.2 "Split between" line: new `apps/web/src/components/SplitBetween.tsx` (+ `.css`)
- **Props:** `people: PersonView[]` (the people the form offers), `chosen: ReadonlySet<string>`, `me: string | null`, `onOpen(): void`.
- **Shows:** up to 3 stacked avatars (`Avatar` size `sm`), a small label, a names line, and "Change" in the accent colour.
  - Label: "Split between · {n} of {total}", or "Split between · Everyone ({n})" when everyone is in.
  - Names: the chosen people's names, with "You" for the viewer, joined with ", " and cut off with an ellipsis on one line.
  - Nobody chosen: the names line reads "No one yet", and the inline error "Choose at least one person." (`splitError.NO_PARTICIPANTS`) shows under the line.
- The whole line is one `<button type="button">`, at least 48px tall, labelled e.g. "Split between You, Minh, An and Lan. Change".

### 5.3 Boxes per mode
A blank box is classified by a new helper in `apps/web/src/lib/splitInput.ts`:

```ts
export function readSplitInput(mode: SplitMode, text: string): { ok: true; value: number | null } | { ok: false };
```

| Mode | Blank box | Placeholder (`--color-text-subtle`) |
|---|---|---|
| `amounts` | `value: null` (automatic) | this person's amount from the core result, formatted like the input (`200.000`); `0` when the total isn't typed or the split doesn't work |
| `percent` | `value: null` (automatic) | `fromEntryValue('percent', Math.round((10000 − P) / k))`, e.g. `20` or `33.33`; `0` when P ≥ 10000 |
| `shares` | `value: 100` (1 share) | `1` |
| `adjust` | `value: 0` | `0` |
| `equal` | no box | — |

- Typed text that doesn't parse is `{ ok: false }` and shows the existing "amount invalid" error on that row.
- `toEntryValue` keeps its meaning (null = invalid). `fromEntryValue` accepts `null` and returns `''`.
- Shares and Adjust boxes now **start empty** with their placeholder, instead of being filled with "1" or "0".
- The amount at the right of each row keeps updating live, using the existing `liveShares` logic.

### 5.4 The line under the picker (`splitCaption`)
**n** is the number of people chosen and **k** the number of automatic boxes. New keys in English and Vietnamese:

| Situation | English |
|---|---|
| Percent, k > 1, something left | `By percent · {n} people · {k} share the {pct}% left` |
| Percent, k = 1, something left | `By percent · {n} people · {pct}% left for {name}` |
| Percent, k > 1, nothing left | `By percent · {n} people · {k} owe nothing` |
| Percent, k = 1, nothing left | `By percent · {n} people · {name} owes nothing` |
| Exact, k > 1, something left | `Exact amounts · {n} people · {k} share {amount} left` |
| Exact, k = 1, something left | `Exact amounts · {n} people · {amount} left for {name}` |
| Exact, k > 1, nothing left | `Exact amounts · {n} people · {k} owe nothing` |
| Exact, k = 1, nothing left | `Exact amounts · {n} people · {name} owes nothing` |

Unchanged: `captionPercent` and `captionExact` (k = 0 and it adds up), `captionPercentOver`, `captionExactOver`, `captionExactLeft` and `captionPercentLeft` (k = 0 and short), Equally, Shares and Adjust. In Exact amounts with no total typed, the line is `captionExact`. The count `n` is always the number of people chosen. The old "everyone listed until someone is given a value" rule at `ExpenseForm.tsx:450` goes away.

### 5.5 State and saving
- The existing `included: Set<string>` becomes the only record of who's in, for every mode. A new expense starts with all of `formPeople`; an edit starts with the expense's share participants (both as today).
- `entries` (around line 311) is built from the people in `included`, in `formPeople` order, using `readSplitInput`. People not in `included` are never sent, but their typed text stays in state while the form is open, so putting them back restores it.
- Edit: shares with `inputValue: null` open with an empty box.
- Save sends `entries` as built, with `value: null` for automatic boxes. `canSubmit` is unchanged: it still needs `splitResult.ok` and no invalid input.
- Sport: `sportEntries` already reads `included`. Only the row tick box goes away.

---

## 6. The Change Sheet: new `apps/web/src/components/SplitPeopleSheet.tsx` (+ `.css`)

### 6.1 Shell
- Built on the existing `Sheet` (`apps/web/src/components/Sheet.tsx`), which handles the dialog role, focus and closing. Title "Split between", with "{n} of {total}" on the right of the header.
- **Props:** `open`, `onClose()`, `people: PersonView[]` (the form's `formPeople`), `chosen: ReadonlySet<string>`, `onChange(next: Set<string>)`, `me: string | null`, `recent: RecentGroup[]`.
- Every change applies to the form immediately. **Done** (a full-width primary `Button`) and dismissing both just close the sheet. There's no Cancel.
- On close, focus goes back to the "Split between" line (the `Sheet` opener behaviour).

### 6.2 "Same people as": recent groups (every group size)
New pure helper `apps/web/src/lib/recentGroups.ts`:

```ts
export interface RecentGroup { expenseId: string; description: string; spentOn: string; people: string[] }
export function recentGroups(
  expenses: ExpenseView[],          // view.expenses, newest first as the trip view returns them
  offered: readonly PersonView[],   // formPeople, in group order
  current: ReadonlySet<string>,
  editingId: string | undefined,
  max = 3,
): RecentGroup[];
```

Rules, in order:
1. Only `status` `approved` or `pending`, never `editingId`.
2. `people` is the expense's share participants that are in `offered`, in `offered` order.
3. Skip it if `people` is empty, includes every offered person, matches `current`, or matches a group already taken (compared as sets).
4. Stop at `max`.

Each row shows 3 stacked avatars, then the description (one line, ellipsis), then "{date} · {n} people · {first 3 names} +{rest}". The date uses the app's existing `formatDay` (e.g. "22 Oct 2026"), not the "22/10" shown in the mockup. A secondary pill **Use** replaces `chosen` with that group. If there are no recent groups, the section is hidden.

### 6.3 Twelve or fewer people: tick list
- One row per offered person, at least 48px: a real checkbox, avatar, name ("{name} (you)" for the viewer), and the `Left` pill where it applies.
- A toolbar under the list header shows **Clear all** when anyone is chosen and **Add everyone** when not everyone is.

### 6.4 More than 12 people: chip search
Search mode switches on when `people.length > 12`.
- **Field:** a bordered box holding the chips, then a text input labelled "Add people" with the placeholder "Add people…" and 16px text, so iOS doesn't zoom. The chip area stops at about 3 lines (~120px) and scrolls inside.
- **Chip:** avatar, name ("You" for the viewer), and a × button labelled "Remove {name}". The × hit area is at least 44px, made larger with padding.
- **Suggestions:** offered people **not chosen**, filtered by word start and ignoring accents. With the field empty, every unchosen person is listed in group order. Each one is a button labelled "Add {name}".
- **Matching:** the word-start, accent-insensitive rule moves from `filterRecentPeople` (`apps/web/src/lib/recentPeople.ts:27`) into a shared `apps/web/src/lib/nameSearch.ts` (`matchesWordStart(query, name)`), which both use.
- **Keys:** tapping a suggestion adds the chip, clears the text and keeps focus in the input. **Enter** adds the first suggestion. **Backspace** in an empty input removes the last chip.
- **Toolbar:** **Clear all** / **Add everyone**, as in §6.3.
- **Live region:** a visually hidden `aria-live="polite"` line announces "{n} matches" while typing.

### 6.5 States
| State | What shows |
|---|---|
| Default | realistic names and the recent groups, as above |
| Loading | none new: the form renders only after the trip view has loaded |
| No match | `No one called "{q}" in this group.` |
| Everyone chosen (search mode) | `Everyone in the group is already chosen.` |
| Nobody chosen | `Choose at least one person.` in the sheet and on the line. Done still closes; Save stays disabled. |
| No recent groups | the section is hidden |

---

## 7. Edge Cases

- **Nothing typed** in Exact or Percent: everyone chosen is automatic, which behaves like Equally ("4 share the 100% left").
- **One automatic person** gets the whole remainder, and the line names them.
- **Changing the total, a typed value, or who's in** re-divides the automatic people immediately. Typed values never change on their own.
- **Switching mode** keeps each mode's own typed values, as today.
- **Old expenses** (every `input_auto = 0`) open with every box filled. Clearing a box makes that person automatic.
- **People who left:** on an edited expense they stay on the line with `Left` and can be taken out. They stay offered until the form closes. New expenses never offer them (unchanged).
- **Guests** use the same form and endpoint, and their expense still waits for approval.
- **Someone leaves while the sheet is open:** the server's existing "this person left" error appears on save.
- **Merge** turns an expense with automatic boxes into exact amounts with every box filled (§4.4).

---

## 8. Testing

### 8.1 Existing tests that change on purpose
`apps/web/src/screens/__tests__/expense-form.test.tsx` encodes the old behaviour. Opus updates these tests in the same change and lists each one in the commit message; Gemini does not edit existing tests.
- Lines 86, 118 and 126 click `Include {name}` row tick boxes. They move to the Change sheet.
- Lines 130–173 expect a blank Percent or Exact box to take the person off (for example "By percent · 2 people" after typing for 2 of 4). They change to the automatic behaviour and the new lines under the picker.

### 8.2 New tests
- **Core** (`packages/core/test/split.test.ts`)
  - Exact with nulls: remainder split equally, 1₫ spread, remainder 0 gives 0 each, S > total errors, all-null equals Equally, one null gets everything.
  - Percent with nulls: 40% + 3 nulls on 1.000.000₫ gives 400.000 / 200.000 ×3; 3 nulls with nothing typed on 100.000₫; 33.33% typed; P = 10000 leaves the nulls at 0; P > 10000 errors.
  - A null in `equal`, `shares` or `adjust` gives `INVALID_VALUE`.
  - A typed 0 is kept as a 0 share.
  - The existing every-mode sum check also covers entries with nulls.
- **API** (`apps/api/test/expenses.test.ts`, plus the merge tests in `participants.test.ts`)
  - A POST with nulls stores `input_auto = 1` and the trip view returns `inputValue: null` with the right amounts.
  - A PATCH with a new total re-divides.
  - A null in `equal` returns 422 `INVALID_VALUE`.
  - A non-number, non-null value is still `Invalid entry`.
  - A merge resets `input_auto` to 0.
- **Web**
  - `recentGroups`: newest first; skips rejected and disabled expenses, the expense being edited, people who left, duplicate groups, everyone and the current selection; at most 3.
  - `readSplitInput`: blank Exact/Percent gives null, blank Shares gives 100, blank Adjust gives 0, junk gives `{ ok: false }`.
  - `nameSearch`: word start and accents ("loc" matches "Hà Lộc", "oc" doesn't).
  - The form: placeholders in Exact and Percent, every new line under the picker, saving sends nulls, editing restores blank boxes, Shares/Adjust placeholders.
  - The sheet with 5 people: ticks, Clear all, Add everyone, nobody-chosen message.
  - The sheet with 14 people: type, add, × removes, Backspace, Enter, no match, everyone chosen, live region text.
  - **Use** on a recent group replaces the selection.

### 8.3 Visual check
After the build, screenshots of the form (Percent with automatic boxes) and both sheet layouts at 375px and 1280px in the dev preview, scored with the UI companion's matrix (Layout, Visual Hierarchy, Usability; reject below 4).

---

## 9. Screen Specs (for the Flash screen lane)

### 9.1 `SplitBetween`
- **Purpose:** on the expense form, show who the bill is split between and open the sheet to change it.
- **Tokens:** `--color-surface`, `--color-border`, `--color-text`, `--color-text-muted`, `--color-text-subtle`, `--color-accent`, `--color-danger` (error line), `--radius-md`, `--space-2`/`--space-3`, `--text-sm`/`--text-base`.
- **Layout:** one row at every width (the form is a single column up to `--content-max`). Avatar stack, then a text column that shrinks (label above, names below, one line with ellipsis), then "Change" at the end. Padding `--space-3`; at least 48px tall.
- **States:** default (some or everyone chosen), nobody chosen (names "No one yet" plus the error line). No loading or empty state of its own.
- **Accessibility:** a single button with the full label from §5.2; focus ring `--focus-ring`; label colour `--color-text-muted` (7.7:1).

### 9.2 `SplitPeopleSheet`
- **Purpose:** choose who's in on this expense: one tap for a recent group, ticks for small groups, chip search for big ones.
- **Tokens:** as above, plus `--color-accent-soft` / `--color-accent-soft-text` for chips, `--color-surface-muted` for avatar fallbacks, `--radius-pill` for chips and Use, `--shadow-sheet` (from `Sheet`).
- **Layout:** the `Sheet`'s existing layout at each breakpoint; no new breakpoints. From top: header (title + count), "Same people as" rows, then the tick list or the search field with its toolbar and suggestions, then Done. Rows at least 48px with `--space-3` gaps; no cards inside cards (recent groups are bordered rows, not elevated cards).
- **States:** §6.5.
- **Accessibility:** WCAG 2.1 AA; checkboxes are real inputs; chips and suggestions are buttons with names; the live region from §6.4; colour is never the only sign that someone is chosen (tick or chip).

---

## 10. Files

| Area | File | Change |
|---|---|---|
| core | `packages/core/src/split.ts` | nullable `SplitEntry.value`; automatic rules for `amounts` and `percent` |
| core | `packages/core/src/api-types.ts` | `inputValue: number \| null` (2 places) |
| core | `packages/core/test/split.test.ts` | new cases |
| api | `apps/api/migrations/0005_share_input_auto.sql` | new |
| api | `apps/api/src/db/schema.ts` | `inputAuto` column |
| api | `apps/api/src/expenses/routes.ts` | accept null; write `inputAuto` |
| api | `apps/api/src/trips/snapshot.ts` | return `inputValue: null` when automatic |
| api | `apps/api/src/participants/merge.ts` | reset `inputAuto` |
| api | `apps/api/test/expenses.test.ts`, `participants.test.ts` | new cases |
| web | `apps/web/src/lib/splitInput.ts` | `readSplitInput`; `fromEntryValue(null)` |
| web | `apps/web/src/lib/recentGroups.ts` | new |
| web | `apps/web/src/lib/nameSearch.ts` | new (moved from `recentPeople.ts`) |
| web | `apps/web/src/lib/recentPeople.ts` | use `nameSearch` |
| web | `apps/web/src/components/SplitBetween.tsx` / `.css` | new |
| web | `apps/web/src/components/SplitPeopleSheet.tsx` / `.css` | new |
| web | `apps/web/src/screens/ExpenseForm.tsx` | line + sheet; remove row ticks; entries, placeholders, captions |
| web | `apps/web/src/i18n/en.ts`, `vi.ts` | new strings (§5.2, §5.4, §6) |
| web | `apps/web/src/screens/__tests__/expense-form.test.tsx` | updated (§8.1) and new cases |
| web | new tests for `recentGroups`, `nameSearch`, `readSplitInput`, `SplitPeopleSheet` | new |
