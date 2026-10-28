# CoinCrew

## UI (apps/web)

The web app uses **shadcn/ui + Tailwind v4** with the "Friendly" look. Spec: `docs/superpowers/specs/2026-10-28-shadcn-friendly-redesign-design.md` ("The look" table).

- **Use real components, don't invent them.** shadcn components live in `apps/web/src/components/ui/`. Before adding or describing one, look it up with the **shadcn MCP** (`.mcp.json`); add new ones with `npx shadcn@latest add <name>` run in `apps/web`, never by hand.
- **App wrappers come first** when they exist: `Button` (variants primary / secondary / danger / ghost, `href` routes in-app), `Sheet` and `Modal` (bottom drawer on phones, dialog from 640px), `Pill`, `Avatar`, `Skeleton`, `InlineError`, `Snackbar`, `Icon` (lucide), `Amount`. Never use shadcn `Drawer`/`Dialog` directly for a sheet.
- **Theme lives only in `apps/web/src/styles/globals.css`.** Use its Tailwind colours (`bg-background`, `bg-card`, `bg-primary`, `bg-secondary`, `text-muted-foreground`, `text-success`, `text-danger`, `bg-warning-soft`, `bg-avatar-1..6`…). No raw hex, no `.css` files per component; `src/test/style-guard.test.ts` enforces both.
- **The look:** warm off-white page, white `rounded-xl` grouped lists (no nested cards), pill buttons, `font-semibold` titles, money in `tabular-nums`, fields at `text-base` (16px, iOS zoom), touch targets ≥44px (`min-h-11`), 4px spacing grid. Breakpoints: `sm` 640px, `lg` 1024px ("layout A").
- **Tests select by `fsl-*` classes and `data-testid`.** Keep them on the same elements when restyling.
