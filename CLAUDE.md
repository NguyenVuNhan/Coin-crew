# CoinCrew

## Workspace (Nx)

Nx on npm workspaces; every project is a workspace package (`@cc/*`) exporting raw TypeScript. Layout and libraries: `README.md` → Layout. Design: `docs/superpowers/specs/2026-11-02-nx-workspace-design.md`.

- **Where new code goes:** UI primitive or wrapper → `@cc/web-ui`; API call or React Query hook → `@cc/web-data-access`; platform (web vs Zalo) → `@cc/web-platform`; copy → `@cc/web-i18n`; pure web helper → `@cc/web-util`; screen or CoinCrew-specific component → `@cc/web-screens`; server helper → `@cc/api-util`; DB schema or write helper → `@cc/api-db`; sign-in/access → `@cc/api-auth`; routes → `apps/api`; logic both sides need → `@cc/core`.
- **Import rules** (tags in each `package.json` `"nx"`, enforced in `eslint.config.mjs`): web and API never import each other; lower kinds never import higher (util → i18n → ui / platform → data-access → screens → app; api: util → db → auth → app). Inside a library use relative imports; across libraries use the package name (`@cc/web-ui/components/Button`). No `@/` alias.
- **Commands:** `npm test`, `npm run typecheck`, `npm run lint` run through Nx. Lint only through Nx (bare `npx eslint .` silently skips the import rule without Nx's graph cache).
- **TypeScript:** `tsc` is TypeScript 7; the `typescript` package is TypeScript 6 only for tools (Nx, typescript-eslint). Don't add Nx inference plugins (`@nx/js/typescript`, `@nx/vite`, `@nx/vitest`): targets come from package.json scripts.

## UI (design system in libs/web/ui, screens in libs/web/screens, shells in apps/web and apps/zalo)

The web app uses **shadcn/ui + Tailwind v4** with the "Friendly" look. Spec: `docs/superpowers/specs/2026-10-28-shadcn-friendly-redesign-design.md` ("The look" table).

**Before any UI work, read `DESIGN.md`** (the design system: tokens, components, named rules, do's and don'ts; sidecar `.impeccable/design.json`) and `PRODUCT.md` (who CoinCrew is for and what every screen must protect).

- **Use real components, don't invent them.** shadcn components live in `libs/web/ui/src/components/ui/` (import them as `@cc/web-ui/components/ui/<name>`). Before adding or describing one, look it up with the **shadcn MCP** (`.mcp.json`); add new ones with `npx shadcn@latest add <name>` run in `libs/web/ui`, never by hand. Afterwards change the new file's `@cc/web-ui/...` imports to relative ones (lint flags a library importing itself by name).
- **App wrappers come first** when they exist (`@cc/web-ui/components/<Name>`): `Button` (variants primary / secondary / danger / ghost, `href` routes in-app), `Sheet` and `Modal` (bottom drawer on phones, dialog from 640px), `Pill`, `Avatar`, `Skeleton`, `InlineError`, `Snackbar`, `Icon` (lucide), `Amount`. Never use shadcn `Drawer`/`Dialog` directly for a sheet.
- **Theme lives only in `libs/web/ui/src/styles/globals.css`** (the shells import `@cc/web-ui/styles.css`). Use its Tailwind colours (`bg-background`, `bg-card`, `bg-primary`, `bg-secondary`, `text-muted-foreground`, `text-success`, `text-danger`, `bg-warning-soft`, `bg-avatar-1..6`…). No raw hex, no `.css` files per component; `libs/web/screens/src/test/style-guard.test.ts` enforces both across every web library.
- **The look:** warm off-white page, white `rounded-xl` grouped lists (no nested cards), pill buttons, `font-semibold` titles, money in `tabular-nums`, fields at `text-base` (16px, iOS zoom), touch targets ≥44px (`min-h-11`), 4px spacing grid. Breakpoints: `sm` 640px, `lg` 1024px ("layout A").
- **Platform features go through `usePlatform()`** (`@cc/web-platform`, `libs/web/platform`): share, save image, open external links, Zalo sign-in, chat context and friend picking. Screens branch on `platform.kind === 'zmp'` first (the Mini App's user agent also says Zalo), and `apps/zalo` is the only place that imports `zmp-sdk`.
- **Tests select by `fsl-*` classes and `data-testid`.** Keep them on the same elements when restyling.
