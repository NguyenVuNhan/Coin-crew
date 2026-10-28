# shadcn/ui migration and "Friendly" redesign

Date: 2026-10-28
Scope: `apps/web` only. No API or `@fsl/core` changes.

## Intent and why

The owner finds the web app ugly, and every new screen costs a lot of effort describing what each component should look like. They have little UI/UX experience and want a good default look they don't have to invent.

Two outcomes:

1. **One consistent, good-looking style** across the whole app: the "B. Friendly" direction the owner picked from mockups.
2. **A shared vocabulary of real components.** After this, a screen can be described as "a Drawer with a list and two Buttons" and Claude builds it from components that actually exist in the repo. The shadcn MCP server lets Claude look up real shadcn components and examples instead of hallucinating them.

## Goals

- Replace the hand-rolled component layer (~63 components, ~60 per-component `.css` files, `styles/components.css`) with shadcn/ui components styled with Tailwind, themed to the Friendly look.
- Restyle all 21 screens to the Friendly look in one switch-over (owner's decision: whole app at once, no period of mixed old/new styles on `main`).
- Set up the shadcn MCP server for this project.
- Write a short project note so future UI work uses these components and this style by default.
- Behaviour, copy, routes, i18n and data flow stay exactly as they are.

## Non-goals

- No new features, no changes to what any screen does or says.
- No dark mode (my call; can come later, shadcn makes it cheap).
- No layout re-think of flows (e.g. moving things between screens). Screen structure stays; only its look changes, except where the Friendly look needs small structural touches listed below.
- No API, core, or PWA behaviour changes.

## Anti-goals (failure even if it "works")

- The app looks like a default shadcn demo (black buttons, sharp grey borders): that is option A, which was not picked.
- Mixed styles: some screens Friendly, some old, or old `.css` files left half-alive next to Tailwind classes.
- Hand-written look-alikes of components shadcn already has (a custom modal instead of `Dialog`, etc.). That reintroduces the problem this project solves.
- Raw hex colours in components instead of theme tokens.
- Regressions in accessibility (focus rings, labels, 16px inputs on iOS) or in existing tests.

## The look: "B. Friendly"

Reference mockup: `.superpowers/brainstorm/1167-1793199475/content/visual-style.html`, card B (gitignored, local only). Its essentials:

| Element | Friendly look |
|---|---|
| Page background | warm off-white `#f6f7f4` |
| Surfaces / cards | white, radius 20px, no border, no or very soft shadow; content sits in white grouped lists |
| Primary button | solid teal `#0f766e`, white text, pill (fully rounded), semibold |
| Secondary button | soft teal `#ccfbf1` with `#134e4a` text, pill |
| Expense rows | 38px rounded-square (12px) icon tile with a soft tinted background per category, title semibold, meta line small muted, amount right-aligned semibold tabular-nums |
| People | coloured initial avatars (soft pastel bg + dark text of the same hue), overlapping stack where a group is shown |
| Balance | big bold amount (~30px, 700) in teal for "owed to you", rose for "you owe" |
| Section headers | small semibold muted label above a grouped list ("Recent") |
| Navigation (phone) | white bottom bar, active item in teal |
| Text colours | warm neutrals (stone): text `#1c1917`, muted `#57534e` / `#78716c` |

Colour roles kept from today's `tokens.css`: teal accent, emerald = owed to you, rose = you owe, amber = waiting / needs action. Neutrals move from zinc to **stone** (warmer, matches the off-white). All text keeps WCAG AA (≥4.5:1); the builder re-checks muted text on `#f6f7f4`.

Typography: **Be Vietnam Pro**, self-hosted via `@fontsource` (my call: designed for Vietnamese diacritics, friendly shape; self-hosted so the PWA does not depend on Google Fonts). Weights 400/500/600/700. Money always `tabular-nums`. Inputs stay ≥16px.

Spacing stays on the existing 4px grid. Phone-first, one column, centred on wide screens, with the existing ≥1024px "layout A" kept.

## How it gets made (decided)

- **Tailwind CSS v4** via `@tailwindcss/vite`. This overrides the `ui-ux-design-companion` rule "never add Tailwind": shadcn requires it and the owner asked for shadcn.
- **shadcn/ui** initialised in `apps/web` with `components.json` (style: new-york, base colour stone, CSS variables on, Radix primitives, `lucide-react` icons; my calls). Components live in `apps/web/src/components/ui/`, copied in by the shadcn CLI, not hand-written.
- Path alias `@/` → `apps/web/src` in `tsconfig.json` and `vite.config.ts` (shadcn needs it).
- **Theme:** the Friendly values above become shadcn's CSS variables (`--background`, `--primary`, `--radius`, etc.) plus app-specific ones (`--success`, `--warning`, `--danger` and their soft variants) in one global stylesheet, mapped into Tailwind via `@theme`. `tokens.css`, `base.css`, `components.css` and every per-component/per-screen `.css` file are deleted at the end.
- **Button variants** are customised in `ui/button.tsx` so `default` is the teal pill and `secondary` the soft-teal pill. That is what makes "a Button" mean the Friendly button.
- **Icons:** move from `components/icons.tsx` to `lucide-react` (my call: it is what shadcn and its MCP examples use). Brand logos (Google, Zalo, bank apps) stay as images.
- **App components keep their names and props** (`BalanceCard`, `ExpenseRow`, `InviteSheet`…) but are rebuilt from `ui/` components plus Tailwind classes. Screens keep calling them the same way.
- **Test hooks:** existing tests select by `fsl-*` class names (`querySelector`, `toHaveClass`) and `data-testid`. Keep those `fsl-*` class names and test ids on the same elements so existing tests keep passing unchanged. Where a test asserts a *style* class that no longer means anything (e.g. a `--primary` modifier), the architect updates that test; implementers never edit existing tests (harness rule).
- **Tests that break because the DOM changes (my call):** the *behaviour* a test checks is fixed; *how it finds things* may change. Known cases: Snackbar→Sonner tests (`transfer-ticks.test.tsx`) are retargeted at Sonner's toast DOM; tests that read deleted `.css` files from disk (`action-row.test.tsx`, `foundations.test.tsx`) are replaced by equivalent checks on the new markup (e.g. hover tools hidden via classes, inputs carry the ≥16px class); portal-rendered Dialog/Drawer/DropdownMenu tests are retargeted at the portal. Radix/vaul jsdom polyfills (`ResizeObserver`, `matchMedia`, pointer capture, `scrollIntoView`) go in `src/test/setup.ts`. These are architect-owned tasks done before delegated work is expected to go green; implementers still never edit existing tests. Focus must still move into a sheet/dialog on open and return to the opener on close.
- **Sheets on wide screens:** keep today's behaviour. One shared responsive wrapper renders a `Drawer` (bottom sheet) below 640px and a centred `Dialog` from 640px up; all sheet-type components use it.
- **shadcn MCP:** project-scoped `.mcp.json` at the repo root, created with `npx shadcn@latest mcp init --client claude`, committed.
- **Project note:** a `CLAUDE.md` at the repo root (none exists today) with a short "UI" section: use `src/components/ui` (shadcn) components, look them up via the shadcn MCP before adding one, add new ones with the shadcn CLI, never write raw hex or per-component `.css`, follow the Friendly look table (or link this spec).

## Component mapping (starting point)

| Today | Becomes |
|---|---|
| `Button` | shadcn `Button` (variants customised) |
| `Sheet`, `ActionSheet`, `InviteSheet`, `BankAppSheet`, `ConsentSheet`, `SaveImageSheet`, `SplitPeopleSheet`, `MergeSheet`, `MergeConfirmSheet` | responsive wrapper: shadcn `Drawer` below 640px, `Dialog` from 640px |
| `Modal`, `InviteModal`, `AvatarCropModal` | shadcn `Dialog` |
| `Pill`, `FundPill`, `ListModeChip` | shadcn `Badge` |
| `TripTabs`, `EntryTypeSwitch`, `FewestSwitch`, `GenderToggle`, `SplitModePicker` | shadcn `Tabs` / `ToggleGroup` / `Switch` as fits each |
| `Skeleton` | shadcn `Skeleton` |
| `Snackbar` | shadcn `Sonner` (toast) |
| `InlineError` | shadcn `Alert` (destructive), kept inline |
| `Avatar` | shadcn `Avatar` with coloured-initial fallback |
| `AccountMenu`, `LanguageButton` | shadcn `DropdownMenu` |
| `BalanceCard`, `ApprovalsCard`, `LeaderboardWidget`, `EmptyState` | shadcn `Card` + Friendly styling |
| Form fields (`BankFields`, `IncomeForm`, `PeopleInput`, `ExpenseForm` screen) | shadcn `Input`, `Label`, `Select`, `Textarea` |
| Rows (`ExpenseRow`, `IncomeRow`, `ActionRow`, `MyBankRow`) | app components on Tailwind, Friendly row pattern |

The builder may change a mapping when another shadcn component fits better; record it in the plan.

## Constraints

- React 19, Vite 8, TypeScript 7, vitest + Testing Library, Playwright e2e. The built app goes to `apps/api/public` and is served by the Worker; the PWA config stays.
- All existing unit and e2e tests pass at the end (retargeted where the DOM changed, same behaviour asserted; see "Tests that break" above). `npm run typecheck`, `npm test`, `npm run e2e` green.
- i18n (`useT`) untouched; all copy comes from the existing keys.
- One branch, one PR; `main` never shows a half-migrated app. Intermediate commits on the branch may be mixed.
- Harness: implementation is delegated to Gemini Flash per component/screen with screen specs; the architect reviews screenshots at 375px and 1280px.

## Left to the builder

- Order of work and how to batch components into delegable tasks (the plan).
- Exact Tailwind class choices within the look table.
- Category icon/tint mapping for expense tiles (if expenses have no category today, pick one neutral tinted tile style; do not add a category feature).
- Exact pastel set for initial avatars (deterministic by person id/name).
- Whether to keep the per-element `fsl-*` names as plain class names or move tests to roles where trivial; the default is keep.
