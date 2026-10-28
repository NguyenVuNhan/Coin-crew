# shadcn/ui Friendly Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `apps/web`'s component layer on shadcn/ui + Tailwind v4 with the "B. Friendly" look, delete all hand-written CSS, and set up the shadcn MCP so future screens are described in shadcn terms.

**Architecture:** Tailwind v4 and shadcn are added first and themed with the Friendly tokens while the old CSS still loads. The app's shared primitives (`Button`, `Sheet`, `Modal`, `Snackbar`, `Pill`, `Avatar`, `Skeleton`, `InlineError`, `Icon`) are rebuilt on shadcn **keeping their current props**, so the ~60 callers keep working. Then each feature group of components and each screen swaps its `.css` file for Tailwind classes, and finally all old CSS is deleted and a guard test keeps it gone.

**Tech Stack:** React 19, Vite 8, TypeScript 7, Tailwind CSS v4 (`@tailwindcss/vite`), shadcn/ui (new-york, Radix, lucide-react), vaul (Drawer), sonner (toasts), `@fontsource/be-vietnam-pro`, vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-28-shadcn-friendly-redesign-design.md`

## Global Constraints

- Scope is `apps/web` plus repo-root `CLAUDE.md` and `.mcp.json`. No changes to `apps/api` source or `packages/core`.
- Behaviour, copy (all text via `useT`), routes and data flow unchanged.
- Keep every existing `fsl-*` class name and `data-testid` on the same element (test hooks). They may carry no styles.
- No raw hex colours in `.tsx`/`.ts` files; colours come from theme variables in `src/styles/globals.css` only.
- No per-component `.css` files when done; `src/styles/globals.css` is the only stylesheet.
- Theme values are hex (not oklch). Neutrals: stone. Accent: teal `#0f766e`.
- Inputs, selects, textareas render at ≥16px (`text-base`) — iOS zoom rule.
- Money uses `tabular-nums`.
- Muted text on the page background uses `--muted-foreground: #57534e` (≥4.5:1 on `#f6f7f4`). `#78716c` is allowed only on white surfaces.
- Sheets: Drawer below 640px, centred Dialog from 640px (`ResponsiveSheet`). Focus moves into the sheet on open and back to the opener on close.
- Breakpoints unchanged: 640px (sheets), 1024px ("layout A", `useIsWide`).
- Harness: implementers (Gemini Flash) never edit existing tests; the architect retargets tests. Each delegated component/screen gets a screen spec per `ui-ux-design-companion` §5.2 and a 375px + 1280px screenshot review.
- Work on branch `feat/shadcn-friendly`; one PR at the end.

## Review Focus

1. **Long Vietnamese names and big amounts** (`Nguyễn Thị Phương Thảo`, `1.250.000.000 ₫`) in rows and the balance card: titles truncate with ellipsis, amounts never wrap or get cut. → test in Task 6.
2. **Old in-app webviews (Zalo on iOS < 16.4)**: Tailwind v4 relies on `@property`/`color-mix`; colours must still show. Keep theme colours as plain hex vars and avoid `/opacity` modifiers on theme colours for anything essential (text, buttons, borders). → manual check in Task 10.
3. **Focus return after closing a sheet** in both Drawer and Dialog modes, including Escape and overlay tap; non-dismissible sheets ignore both. → tests in Task 3.
4. **Disabled and loading buttons** (archived trips, pending mutations) still look disabled, keep `aria-busy`, and in-app `href` buttons still route via `Link`. → tests in Task 3.
5. **Vietnamese diacritics** render in Be Vietnam Pro (the `vietnamese` subset is loaded, not just `latin`). → guard test in Task 1.

---

### Task 1: Tailwind, shadcn init, Friendly theme, font, test polyfills

**Files:**
- Modify: `apps/web/package.json`, `apps/web/vite.config.ts`, `apps/web/tsconfig.json`, `apps/web/src/main.tsx`, `apps/web/src/test/setup.ts`
- Create: `apps/web/components.json`, `apps/web/src/styles/globals.css`, `apps/web/src/lib/utils.ts` (shadcn `cn`)
- Test: `apps/web/src/test/theme.test.ts`

**Interfaces:**
- Produces: `cn(...inputs: ClassValue[]): string` from `@/lib/utils`; `@/` alias → `apps/web/src`; Tailwind theme colours `background, foreground, card, primary, primary-foreground, secondary, secondary-foreground, muted, muted-foreground, accent, destructive, border, input, ring, success, success-soft, warning, warning-soft, warning-foreground, danger, danger-soft`, `avatar-1..6` (+ `-fg`), font `font-sans` = Be Vietnam Pro.

- [ ] **Step 1:** `git checkout -b feat/shadcn-friendly`
- [ ] **Step 2: Write the failing test** `theme.test.ts` (reads `src/styles/globals.css` with `fs`):
  - `it('defines the Friendly theme')`: file contains `--background: #f6f7f4`, `--primary: #0f766e`, `--secondary: #ccfbf1`, `--secondary-foreground: #134e4a`, `--foreground: #1c1917`, `--muted-foreground: #57534e`, `--success: #047857`, `--danger: #be123c`, `--warning: #b45309`, `--radius: 1.25rem`.
  - `it('loads Be Vietnam Pro with the vietnamese subset')`: `src/main.tsx` imports `@fontsource/be-vietnam-pro/vietnamese-400.css` and `latin-400.css` (and 500/600/700).
- [ ] **Step 3:** Run `npx vitest run src/test/theme.test.ts` → FAIL (file missing).
- [ ] **Step 4:** Install `tailwindcss @tailwindcss/vite @fontsource/be-vietnam-pro` (web workspace). Add `tailwindcss()` to Vite plugins and `resolve.alias { '@': src }`; add `baseUrl`/`paths { "@/*": ["./src/*"] }` to `tsconfig.json`. Run `npx shadcn@latest init` in `apps/web` (style new-york, base colour stone, CSS variables yes, css file `src/styles/globals.css`). Replace the generated oklch values with the hex theme above; add the app colours (`--success-soft #d1fae5`, `--warning-soft #fef3c7`, `--warning-foreground #78350f`, `--danger-soft #ffe4e6`, `--card #ffffff`, `--border #e7e5e4`, `--input #d6d3d1`, `--ring #0f766e`, `--muted #efefeb`) and six avatar pastel pairs (amber/blue/rose/green/teal/violet 200 bg + 900 fg) under `@theme inline`. Set `font-sans` to `"Be Vietnam Pro", system-ui, sans-serif`. Import `globals.css` and the font weights in `main.tsx` **after** the three old stylesheets (old CSS stays until Task 9). Add jsdom polyfills to `setup.ts`: `ResizeObserver`, `window.matchMedia` (only if `src/test/media.ts` doesn't already provide it), `Element.prototype.hasPointerCapture/setPointerCapture/releasePointerCapture`, `Element.prototype.scrollIntoView`.
- [ ] **Step 5:** `npx vitest run src/test/theme.test.ts` → PASS; `npm run typecheck && npm test` (in `apps/web`) → all green; `npm run build` → succeeds.
- [ ] **Step 6:** Commit `feat(web): add Tailwind v4, shadcn and the Friendly theme`.

### Task 2: shadcn components, Friendly button variants, ResponsiveSheet

**Files:**
- Create (via `npx shadcn@latest add`): `src/components/ui/{button,drawer,dialog,badge,tabs,toggle-group,switch,skeleton,sonner,alert,avatar,dropdown-menu,card,input,label,select,textarea,separator}.tsx`
- Create: `src/components/ui/responsive-sheet.tsx`
- Test: `src/components/__tests__/responsive-sheet.test.tsx`

**Interfaces:**
- Produces: `buttonVariants({ variant: 'default'|'secondary'|'destructive'|'ghost'|'outline'|'link', size: 'default'|'sm'|'lg'|'icon' })`. `default` = `bg-primary text-primary-foreground rounded-full font-semibold`; `secondary` = `bg-secondary text-secondary-foreground rounded-full font-semibold`; `destructive` = rose pill; heights: default 44px, sm 36px (touch targets).
- Produces: `ResponsiveSheet({ open, onOpenChange, title, dismissible?, className?, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; dismissible?: boolean; className?: string; children: ReactNode })` — renders shadcn `Drawer` when `!matchMedia('(min-width: 640px)').matches`, else `Dialog`; title in `DrawerTitle`/`DialogTitle`; close button (`aria-label` from `t('common.close')`) only when dismissible; when `dismissible === false` Escape and overlay do nothing.

- [ ] **Step 1: Write failing tests** in `responsive-sheet.test.tsx` (use the existing `src/test/media.ts` helper to set width):
  - `renders a dialog named by its title at 375px` → `getByRole('dialog', { name: 'Invite people' })`.
  - `renders a dialog at 1280px` → same query passes; the element has `data-slot="dialog-content"`.
  - `Escape calls onOpenChange(false) when dismissible`; `ignores Escape when dismissible is false`.
  - `returns focus to the opener on close` → open from a button, close, `expect(opener).toHaveFocus()`.
- [ ] **Step 2:** Run → FAIL (module missing).
- [ ] **Step 3:** Add the shadcn components with the CLI; edit `ui/button.tsx` variants to the values above; write `responsive-sheet.tsx` (use a `useMediaQuery('(min-width: 640px)')` local hook; Drawer `dismissible` prop / Dialog `onEscapeKeyDown`+`onInteractOutside` `preventDefault` when not dismissible).
- [ ] **Step 4:** Run → PASS; full `npm test` green.
- [ ] **Step 5:** Commit `feat(web): add shadcn components and ResponsiveSheet`.

### Task 3: Rebuild the shared primitives on shadcn (props unchanged)

**Files:**
- Modify: `src/components/{Button,Sheet,Modal,Snackbar,Pill,Avatar,Skeleton,InlineError,icons}.tsx`, `src/App.tsx` (mount `<Toaster />`), `src/test/render.tsx` (mount `<Toaster />`)
- Delete: `src/components/{Button,Sheet,Modal,Snackbar,Pill,Avatar,Skeleton,InlineError}.css`
- Test: `src/components/__tests__/primitives.test.tsx` (new); architect retargets `transfer-ticks.test.tsx` and any test whose query broke

**Interfaces:**
- Consumes: Task 2 `buttonVariants`, `ResponsiveSheet`, shadcn `Badge`, `Avatar`, `Skeleton`, `Alert`, `toast` from `sonner`.
- Produces (unchanged public props):
  - `Button` — `variant` map: `primary→default`, `secondary→secondary`, `danger→destructive`, `ghost→ghost`; `block → w-full`; keeps `fsl-button fsl-button--<variant>` classes, `aria-busy`, `Link` for in-app paths.
  - `Sheet(SheetProps)` and `Modal(ModalProps)` — thin wrappers over `ResponsiveSheet` (`onOpenChange(false) → onClose?.()`); keep `fsl-sheet` / `fsl-modal` + `className` on the content element.
  - `Snackbar({ message, actionLabel?, onAction? })` — declarative adapter: `useEffect` calls `toast(message, { id, action })` on mount/change and `toast.dismiss(id)` on unmount; renders `null`.
  - `Pill({ tone, className, children })` → `Badge` with tone → soft colour pair (`neutral: muted`, `success: success-soft/success`, `danger: danger-soft/danger`, `warning: warning-soft/warning-foreground`, `accent: secondary/secondary-foreground`) — check `Pill.tsx` for the exact tone union and keep it.
  - `Avatar({ name, avatarUrl, size, className })` → shadcn `Avatar` with image + fallback initials; fallback colour = `avatarTone(name): 1..6` (stable hash of `name`) using `bg-avatar-N text-avatar-N-fg`.
  - `Skeleton`/`SkeletonList`, `InlineError({ error, onRetry, className })` → shadcn `Skeleton` / inline `Alert` (destructive), retry stays a `Button`.
  - `Icon` keeps `IconName` and props; internals map each name to a `lucide-react` component (no hand-copied paths).

- [ ] **Step 1: Write failing tests** in `primitives.test.tsx`:
  - `Button primary renders the teal pill` → `toHaveClass('fsl-button', 'fsl-button--primary', 'bg-primary', 'rounded-full')`.
  - `Button loading is disabled and aria-busy` → `toBeDisabled()`, `toHaveAttribute('aria-busy', 'true')`.
  - `Button with in-app href routes` → inside `renderAt`, click → `getByTestId('location')` has the path.
  - `Snackbar shows its message and runs the action` → `findByText('Marked as paid')`, click `Undo` → `onAction` called once; unmount → text gone.
  - `Avatar fallback colour is stable for a name` → two renders of `Lan` have the same `bg-avatar-N` class; `Minh` may differ.
  - `Sheet keeps fsl-sheet and is labelled` → `getByRole('dialog', { name })` has class `fsl-sheet`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement the wrappers (delegate per file to Gemini in the small-build lane; architect writes `render.tsx`/`App.tsx` Toaster lines). Remove each deleted `.css` import.
- [ ] **Step 4:** Run `npm test`. Architect retargets the tests that broke because of DOM changes only (toast container, portal), keeping their behaviour assertions. Expected end state: all green.
- [ ] **Step 5:** Commit `feat(web): rebuild shared primitives on shadcn`.

### Tasks 4–8: Feature groups to Tailwind (same shape for each)

Each group: for every listed component, replace its `.css` with Tailwind classes using `ui/` components per the spec's mapping table, delete the `.css` file and its import, keep props, `fsl-*` classes and test ids. One Gemini screen-lane call per component, screen spec per `ui-ux-design-companion` §5.2 citing the spec's look table. Then: `npm run typecheck && npm test` green, screenshot 375px + 1280px of a screen using the group, critique matrix ≥4, commit `feat(web): Friendly <group>`.

Group-specific decisions and tests:

**Task 4 — Trip page core:** `Screen`, `TripLayout`, `BottomBar`, `TripTabs` (→ `Tabs`), `BalanceCard` (→ `Card`, amount `text-3xl font-bold tabular-nums`, `text-primary` owed / `text-danger` owe), `FundPill`, `ListModeChip` (→ `Badge`), `EmptyState` (→ `Card`, icon + one CTA), `UpdatedTransactionsBanner`, `MergeRequestBanner`. Page background `bg-background`; content groups in white `rounded-[20px]` lists, no nested cards.

**Task 5 — Sheets & dialogs:** `ActionSheet`, `InviteSheet`, `InviteModal`, `BankAppSheet`, `ConsentSheet`, `SaveImageSheet`, `SplitPeopleSheet`, `MergeSheet`, `MergeConfirmSheet`, `SignInSheet`, `AvatarCropModal`. All use `Sheet`/`Modal` from Task 3 — no direct Drawer/Dialog use. Sheet footers: primary + secondary pill buttons, full width stacked below 640px.

**Task 6 — Lists & rows:** `ExpenseRow`, `ExpenseList`, `IncomeRow`, `PaymentsList`, `ActionRow`, `YourTransfers`, `ExpenseHistoryList`, `LeaderboardWidget`, `ApprovalsCard`, `ApprovalQueue`, `MyBankRow`, `Amount`. Row pattern: 38px `rounded-xl` tinted icon tile (one neutral tint `bg-secondary text-secondary-foreground` — no category feature), title `font-semibold truncate`, meta `text-sm text-muted-foreground`, amount `font-semibold tabular-nums whitespace-nowrap shrink-0`. `ActionRow` hover tools hidden with `invisible pointer-events-none` + `group-hover:visible group-hover:pointer-events-auto` (and `group-focus-within`). Architect replaces `action-row.test.tsx`'s CSS-file read with class assertions on those utilities.
  - New test `rows.test.tsx` → `long name truncates and amount stays whole`: render `ExpenseRow` with title `Nguyễn Thị Phương Thảo trả tiền homestay 2 đêm` and amount `1250000000`; title element `toHaveClass('truncate')`, amount element `toHaveClass('whitespace-nowrap', 'shrink-0')` and text `1.250.000.000 ₫`.

**Task 7 — Forms & switches:** `BankFields`, `IncomeForm`, `PeopleInput`, `SplitBetween`, `SplitModePicker`, `EntryTypeSwitch`, `FewestSwitch` (→ `Switch`), `GenderToggle` (→ `ToggleGroup`), `RatingsSwitch`. Fields use `Label` + `Input`/`Select`/`Textarea` at `text-base`. Architect replaces `foundations.test.tsx`'s `base.css` read with: every `input`, `select`, `textarea` rendered by `BankFields` and `IncomeForm` has class `text-base`.

**Task 8 — Account, details, screens:** components `AccountMenu`, `LanguageButton` (→ `DropdownMenu`), `LinkedAccounts`, `SignInButtons`, `ProviderLogo`, `AuthNotice`, `ExpenseDetails`, `IncomeDetails`, `PaymentDetails`, `FundPaidPanel`, `PayQr`; then every `src/screens/*.css` (20 files) → Tailwind in its `.tsx`. One Gemini call per screen.

### Task 9: Delete the old CSS and guard against its return

**Files:**
- Delete: `src/styles/{tokens,base,components}.css` and any remaining `src/**/*.css` except `src/styles/globals.css`
- Modify: `src/main.tsx` (drop the three old imports), `vite.config.ts` (PWA `background_color: '#f6f7f4'`)
- Test: `src/test/style-guard.test.ts`

- [ ] **Step 1: Write failing test** `style-guard.test.ts` (walks `src` with `fs`):
  - `globals.css is the only stylesheet` → list of `*.css` under `src` equals `['styles/globals.css']`.
  - `no component imports a .css file` → no `.ts/.tsx` outside `main.tsx` matches `/import ['"].*\.css['"]/`.
  - `no raw hex colours in code` → no `.ts/.tsx` outside `__tests__`/`test` matches `/#[0-9a-fA-F]{3,8}\b/` in a string literal or className.
- [ ] **Step 2:** Run → FAIL (old files exist).
- [ ] **Step 3:** Delete files, fix imports, move any remaining `var(--color-*)`/`var(--space-*)` usages in `.tsx` inline styles to Tailwind classes.
- [ ] **Step 4:** `npm run typecheck && npm test && npm run build` → green; `npm run e2e` (repo root) → green.
- [ ] **Step 5:** Commit `refactor(web): remove hand-written CSS`.

### Task 10: shadcn MCP, project note, final visual pass

**Files:**
- Create: `.mcp.json` (repo root, via `npx shadcn@latest mcp init --client claude`), `CLAUDE.md` (repo root)

- [ ] **Step 1:** Run the MCP init from the repo root with `apps/web` as the shadcn project (if the CLI needs `components.json` in cwd, set the server's `cwd`/args to `apps/web`). Verify with `claude mcp list` that `shadcn` connects, and that a lookup (e.g. list components) returns results.
- [ ] **Step 2:** Write `CLAUDE.md` "UI" section (≤20 lines): components live in `apps/web/src/components/ui` (shadcn) + app wrappers (`Button`, `Sheet`, `Modal`, `Snackbar`, `Pill`, `Avatar`, `Icon`); look components up with the shadcn MCP before adding; add new ones with `npx shadcn@latest add` in `apps/web`; theme lives only in `src/styles/globals.css`; no raw hex, no `.css` files; sheets via `Sheet`; the Friendly look table → link to the spec.
- [ ] **Step 3:** Visual pass: run the app, screenshot 375px and 1280px of Landing, MyTrips, MemberTrip (with data), ExpenseForm, an open Sheet, PayScreen, Settings. Critique matrix ≥4 each; fix rejects. Check Review Focus #2 on iOS Safari/Zalo if a device is available; otherwise say so in the PR.
- [ ] **Step 4:** `npm run typecheck && npm test && npm run e2e` from repo root → green.
- [ ] **Step 5:** Commit `chore: shadcn MCP and UI guidance`; finish the branch (PR + tunnel, per the usual flow).
