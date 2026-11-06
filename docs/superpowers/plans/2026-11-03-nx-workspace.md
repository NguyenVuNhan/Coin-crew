# Nx Workspace and By-Kind Libraries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo, implementer dispatch goes through the `gemini-execution` skill (owner's CLAUDE.md).

**Goal:** Turn the npm-workspaces repo into an Nx workspace, rename `@fsl/*` to `@cc/*`, and split `packages/web-common` and the API's shared code into by-kind libraries with enforced import rules, without changing any behaviour.

**Architecture:** Nx 24 runs on top of the existing npm workspaces (package.json scripts are the targets; only `@nx/eslint/plugin` is registered). TypeScript 6 is installed as the `typescript` API for tools while `tsc` stays TypeScript 7. Files are moved by a small codemod that rewrites every import specifier; each library is a workspace package exporting raw `.ts` source through `package.json` `exports`.

**Tech Stack:** npm workspaces, Nx 24.0.3, TypeScript 7.0.2 (+ 6.0 API via alias), ESLint 10 flat config + typescript-eslint 8.72 + `@nx/eslint-plugin`, Vite 8, Vitest 4, React 19, Tailwind v4, shadcn, Cloudflare Workers (wrangler, Drizzle, D1).

**Spec:** `docs/superpowers/specs/2026-11-02-nx-workspace-design.md`

## Global Constraints

- **No behaviour change.** Moved files may change only import specifiers, path strings that point at moved files, and comments naming old paths/packages. A file that would need a logic change to move stays where it is.
- **Tests:** never edit assertions; tests may move and get import/path updates only. The test inventory (Task 0) must compare **identical** after every task.
- **Do not rename:** `fsl-*` CSS classes, D1 database name `fsl`, localStorage key `fsl_lang`, any cookie, stored key or URL. Only the `@fsl/` package scope becomes `@cc/`.
- **Never** run `npm run deploy`, `db:migrate:remote` or `deploy:*` scripts. **Never** commit a file under `apps/api/migrations/` (deploys apply new migrations to the live database).
- `tsc` must stay TypeScript 7 (`npx tsc --version` → `7.x`); `node -p "require('typescript').version"` → `6.x` from Task 2 on.
- Root `package.json` devDependencies (Task 2), exactly: `"@typescript/native": "npm:typescript@^7.0.2"`, `"typescript": "npm:@typescript/typescript6@^6.0.2"`.
- Nx packages pinned to the same version: `nx@24.0.3`, `@nx/eslint@24.0.3`, `@nx/eslint-plugin@24.0.3`; plus `eslint@^10.14.0`, `typescript-eslint@^8.72.1`. No other Nx plugin is registered (`@nx/js/typescript`, `@nx/vite`, `@nx/vitest` are forbidden).
- **Lint only through Nx** (`npm run lint` / `nx run-many -t lint` / `nx affected -t lint`). Bare `npx eslint .` silently skips the boundary rule when Nx's graph cache is missing.
- Builds are never cached; `test`, `typecheck`, `lint` are.
- Every jsdom `vitest.config.ts` keeps `maxWorkers: 2` with its comment (copied verbatim from web-common's / web-screens' `vitest.config.ts`). Root `npm test` runs `--parallel=1`.
- Library `package.json` files: `"private": true`, `"version": "0.0.0"`, `"type": "module"`, `exports` pointing at raw `src` files, `"nx": { "tags": [...] }`, `typecheck` script `tsc -p tsconfig.json`, and `test` script `vitest run` only if the library has tests. Dependencies: third-party packages the library's `src` imports, with the same version ranges used today, plus internal `@cc/*` as `"*"`. Do not remove dependencies from existing packages.
- Library `tsconfig.json` extends `../../../tsconfig.base.json`; web libraries use `"lib": ["ES2022", "DOM", "DOM.Iterable"]`, `"jsx": "react-jsx"`, `"types": ["vite/client"]` (+ `"@testing-library/jest-dom"` when the library has tests); API libraries use `"lib": ["ES2022"]`, `"types": ["@cloudflare/workers-types"]`. No `paths` (except the `web-ui` self-alias in Task 7).
- Commit after each task with the message given; end every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Files not named in any task's moves stay where they are** (in `libs/web/screens` or `apps/api`), including anything added on `main` after this plan was written (e.g. PR #35's `BankHandoffSheet.tsx`, `BankPickerSheet.tsx`, `lib/bankApps.ts`, `assets/bank-apps/`).
- **Sync point:** every task starts with `git fetch origin && git log --oneline HEAD..origin/main`. If `main` has new commits, follow **Merging main** below before the task's own steps.

### Merging main (another feature is expected to land first)

The guest "pay one expense" feature (spec `docs/superpowers/specs/2026-11-03-guest-expense-pay-design.md`, developed in the main checkout) is likely to merge before this branch. It touches files this plan moves: `PayQr`, `ExpenseDetails`, `WhoAreYou`, `ApprovalsCard`, `ApprovalQueue` (stay in screens), `icons.tsx` and `globals.css` (→ `web-ui`, Task 7), `i18n/en.ts`, `vi.ts` (→ `web-i18n`, Task 5), `api/client.ts`, `hooks.ts`, `payInfo.ts` (→ `web-data-access`, Task 9), `access/actor.ts` (→ `api-auth`, Task 11), `db/schema.ts` (→ `api-db`, Task 10), core permissions and `api-types.ts`, payment and participant routes (stay in the app), and maybe a new migration. Merge it like this; **never hand-edit import specifiers**:
1. `git merge origin/main`. Resolve conflicts by these rules (the feature's logic always wins; this branch only contributes moves and import paths):
   - A file the feature changed that this branch moved (rename/modify, modify/delete): put the feature's version at the new path (`git show origin/main:<old path> > <new path>`), `git rm` the old path.
   - A content conflict in a file both sides changed: take the feature's side (`git checkout --theirs <file>`); step 3 redoes our import changes.
   - New files the feature added under an old folder (`packages/core/`, `packages/web-common/`): git places them under the renamed folder (`libs/shared/core/`, `libs/web/screens/`); if it left them in the old folder, `git mv` them to the same relative path there. New files under `apps/api/src/` stay where they are.
   - `package-lock.json`: take ours (`git checkout --ours package-lock.json`), then `npm install`.
   - New files in `apps/api/migrations/` from `main` are the feature's: keep them. (The "never commit a migration" rule is about migrations generated on this branch.)
2. Replace `@fsl/` with `@cc/` in the merged files (Task 1's rule), and `@cc/web-common` with `@cc/web-screens`.
3. `node scripts/migration/move-modules.mjs --repair` (from Task 4 on): fixes every import that still points at a pre-move location, using the recorded moves in `scripts/migration/moves/*.json`.
4. Re-baseline on `main`'s tip, because the feature adds tests, CSS classes and maybe schema: `git worktree add --detach <scratch>/cc-main origin/main`; there run `npm ci`, then this branch's scripts by absolute path (`node <branch>/scripts/migration/test-inventory.mjs <branch>/migration-baseline/tests.json`, the `drizzle-kit export`, `css-classes.mjs`); `git worktree remove --force <scratch>/cc-main`. Commit `chore: re-baseline on main <sha>`.
5. Run the gate. If lint reports a layering violation in feature code (e.g. a new component in `web-ui` importing `web-data-access`), fix it by placement (move the file up to `web-screens`), never by changing its code.
6. Commit the merge.

Timing: Tasks 0–4 are cheap to redo. If the feature PR is about to merge, wait for it before Task 5, since each of Tasks 5–11 moves files it changes.

### The gate (referenced by every task as "Run the gate")

Run from the repo root; each line must pass. `<A>` means `apps/api`.
1. `npm run typecheck` → all projects pass.
2. From Task 2 on: `npm run lint` → all projects pass.
3. `node scripts/migration/test-inventory.mjs migration-baseline/.out/tests.json && node scripts/migration/compare-lines.mjs migration-baseline/tests.json migration-baseline/.out/tests.json` → prints `identical`. (The inventory builds `apps/web` first so `no-sdk-in-web` runs.) If it differs only by `failed` tests that are not caused by the change (load timeouts were seen once: `style-guard.test.ts`, `back-navigation.test.tsx`), rerun those files alone; they must pass, then rerun the inventory.
4. `VITE_API_ORIGIN=https://example.invalid npm run build -w apps/zalo` → succeeds. Do not commit build output (`git status` must show no new tracked files from it).
5. `npx -w apps/api wrangler deploy --dry-run --outdir ../../migration-baseline/.out/worker` → succeeds (the path is relative to `apps/api`).
6. `npx -w apps/api drizzle-kit export > migration-baseline/.out/schema.sql && node scripts/migration/compare-lines.mjs migration-baseline/schema.sql migration-baseline/.out/schema.sql` → `identical`.
7. `node scripts/migration/css-classes.mjs migration-baseline/.out/css.txt && node scripts/migration/compare-lines.mjs migration-baseline/css.txt migration-baseline/.out/css.txt` → `identical` (reads the `apps/web` build from step 3).
8. **e2e** (only where a task says "with e2e"): `npm run e2e` → all Playwright specs pass.

## Review Focus

1. **Tailwind classes silently dropped** after `globals.css` moves (`@source` no longer covers a library) → screens render unstyled. Pinned by gate step 7 in Task 7 and every later task.
2. **The production Worker bundles differently** once API code resolves through `@cc/api-*` package exports → Workers Builds deploy fails or ships missing code. Pinned by gate step 5 plus "with e2e" in Tasks 10–11.
3. **The Zalo Mini App build or the `zmp-sdk` boundary breaks** (zalo config needs `VITE_API_ORIGIN`; `zmp-sdk` leaking into web) → Mini App broken or web bundle bloated. Pinned by gate step 4, `no-sdk-in-web` in the inventory, and the injected-violation test in Task 12.
4. **Import rules silently not enforced** (lint run without Nx's graph, or a rule that never fires) → layering erodes unnoticed. Pinned by Task 2 Step 6 and Task 12's injected violations, and CI linting through `nx affected`.
5. **"fsl" names that must not change get renamed** (`fsl_lang`, `fsl-*` classes, D1 `fsl`) → users lose their language choice, tests lose selectors, deploys target a new database. Pinned by Task 1 Step 4.

---

### Task 0: Sync with main, baseline tooling and baseline

**Files:**
- Create: `scripts/migration/test-inventory.mjs`, `scripts/migration/compare-lines.mjs`, `scripts/migration/css-classes.mjs`
- Create: `migration-baseline/tests.json`, `migration-baseline/schema.sql`, `migration-baseline/css.txt`, `migration-baseline/README.md`
- Modify: `.gitignore` (add `migration-baseline/.out/`)
- Commit also: `docs/superpowers/specs/2026-11-02-nx-workspace-design.md`, this plan

**Interfaces:**
- Produces: `node scripts/migration/test-inventory.mjs <out.json>` — runs `npm run build -w apps/web`, then for every workspace directory containing `vitest.config.ts` (globs `apps/*`, `packages/*`, `libs/*/*`) runs `npx vitest run --reporter=json --outputFile=<tmp>` with that directory as cwd, and writes a JSON array of strings `"<test file basename> :: <assertion fullName> :: <status>"`, sorted, one per test. Exits non-zero if any vitest run fails to produce a report.
- Produces: `node scripts/migration/compare-lines.mjs <a> <b>` — compares two files as sorted line sets (a `.json` array is treated as its lines); prints `identical` and exits 0, or prints `- <line>` for lines only in a and `+ <line>` for lines only in b and exits 1.
- Produces: `node scripts/migration/css-classes.mjs <out.txt>` — reads every `apps/api/public/assets/*.css`, extracts class selectors with `/\.(?:\\.|[A-Za-z0-9_-])+/g`, writes the sorted unique list, one per line.

- [ ] **Step 1: Bring in main**

Run: `git fetch origin && git merge origin/main` (expect a clean merge of PRs #33, #34, #35 and anything newer). Run `npm ci`.

- [ ] **Step 2: Write the three scripts** (signatures above; ESM, Node 24, no dependencies).

- [ ] **Step 3: Self-check the comparer**

Run: `node scripts/migration/compare-lines.mjs package.json package.json` → `identical`, exit 0. Make a copy with one line changed in `migration-baseline/.out/x.txt` and compare → shows exactly that `-`/`+` pair, exit 1.

- [ ] **Step 4: Record the baseline**

Run:
```bash
node scripts/migration/test-inventory.mjs migration-baseline/tests.json
npx -w apps/api drizzle-kit export > migration-baseline/schema.sql
node scripts/migration/css-classes.mjs migration-baseline/css.txt
```
Expected: `tests.json` has one entry per test; per-suite totals near core 295, web-common 1025+ (PR #33/#34 may add some), api 657, zalo-relay 12, zalo 15; every status is `passed` except intentionally skipped ones. `schema.sql` starts with `CREATE TABLE`. `css.txt` is non-empty.

- [ ] **Step 5: Baseline sanity**

Run the gate steps 1, 4, 5 and step 8 (`npm run e2e`). All pass. Write `migration-baseline/README.md` (3 lines: what the files are, that `.out/` is scratch, that the folder is deleted in Task 13) and record `npx tsc --version` there.

- [ ] **Step 6: Commit**

```bash
git add .gitignore scripts/migration migration-baseline docs/superpowers
git commit -m "chore: migration baseline (tests, schema, css) and Nx workspace spec + plan"
```

---

### Task 1: Rename `@fsl` to `@cc`

**Files:**
- Modify: every `package.json` (`name`, dependencies), all source/test/config files importing `@fsl/...`, root scripts, `playwright.config.ts`, `apps/zalo-relay/Dockerfile`, `.github/workflows/zalo-relay.yml`, `.claude/launch.json`, `scripts/*.mjs`, `README.md`, `docs/setup.md`, `docs/navigation-map.md` if it mentions `@fsl`, `CLAUDE.md`, code comments; `package-lock.json` (regenerated)
- Delete: `apps/web/tsconfig.tsbuildinfo`; `.gitignore` gets `*.tsbuildinfo`

**Interfaces:**
- Produces: package names `@cc/api`, `@cc/web`, `@cc/zalo`, `@cc/zalo-relay`, `@cc/core`, `@cc/web-common` (renamed to `@cc/web-screens` in Task 3).

- [ ] **Step 1: Replace the scope**

Replace the literal `@fsl/` with `@cc/` in all tracked files except `docs/superpowers/**` and `package-lock.json`. Do not touch any other `fsl` text.

- [ ] **Step 2: Regenerate the lockfile**

Run: `npm install` → lockfile now lists `@cc/*` workspace links. Delete `apps/web/tsconfig.tsbuildinfo`, add `*.tsbuildinfo` to `.gitignore`.

- [ ] **Step 3: Check the rename is complete**

Run: `git grep -n "@fsl" -- ':!docs/superpowers' ':!migration-baseline'` → no output.

- [ ] **Step 4: Check protected names are untouched**

For each pattern `fsl_lang`, `fsl-`, `apply fsl`, `"fsl"`: the total of `git grep -c -e <pattern> HEAD -- ':!docs/superpowers'` (before the change) equals the total of `git grep -c -e <pattern> -- ':!docs/superpowers'` (working tree). `git diff HEAD -- apps/api/wrangler.jsonc` touches no `database_name`.

- [ ] **Step 5: Run the gate** (steps 1, 3–7).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "refactor: rename package scope @fsl to @cc"
```

---

### Task 2: Nx, TypeScript 6+7 and ESLint import rules (current layout)

**Files:**
- Modify: `package.json` (devDependencies, scripts), `package-lock.json`, `.gitignore` (add `.nx/`)
- Create: `nx.json`, `eslint.config.mjs`
- Modify: each project `package.json` (add `"nx": { "tags": [...] }`)
- Modify: `packages/web-common/src/lib/navHistory.tsx` (delete the one `eslint-disable-next-line react-hooks/exhaustive-deps` comment line, near line 209)

**Interfaces:**
- Produces: root scripts `"test": "nx run-many -t test --parallel=1"`, `"typecheck": "nx run-many -t typecheck"`, `"lint": "nx run-many -t lint"`; `dev`, `e2e`, `tunnel` unchanged (they use `-w @cc/...`).
- Produces: tags — `@cc/core`: `scope:shared`, `type:util`; `@cc/web-common`: `scope:web`, `type:screens`; `@cc/web`, `@cc/zalo`: `scope:web`, `type:app`; `@cc/api`: `scope:api`, `type:app`; `@cc/zalo-relay`: `scope:relay`, `type:app`.

- [ ] **Step 1: Install**

```bash
npm i -D "@typescript/native@npm:typescript@^7.0.2" "typescript@npm:@typescript/typescript6@^6.0.2" nx@24.0.3 @nx/eslint@24.0.3 @nx/eslint-plugin@24.0.3 eslint@^10.14.0 typescript-eslint@^8.72.1
```
Then check root `package.json` shows exactly the two TypeScript lines from Global Constraints. Run: `npx tsc --version` → `Version 7.0.2`; `npx tsc6 --version` → `Version 6.0.x`; `node -p "require('typescript').version"` → `6.0.x`; `npm exec -w apps/web -- tsc --version` → `7.0.2`.

- [ ] **Step 2: `nx.json`**

Contents: `pluginsConfig`, `namedInputs` and `targetDefaults` exactly as spec §8; `"plugins": [{ "plugin": "@nx/eslint/plugin", "options": { "targetName": "lint" } }]`; `targetDefaults.build: { "cache": false }`; no `nxCloudId`. Add `.nx/` to `.gitignore`.

- [ ] **Step 3: Tags and root scripts** (values in Interfaces).

- [ ] **Step 4: `eslint.config.mjs`**

Flat config: ignores `**/node_modules/**`, `**/dist/**`, `apps/api/public/**`, `**/.wrangler/**`, `migration-baseline/**`, `playwright-report/**`, `test-results/**`; for `**/*.{ts,tsx,mts,mjs}` use `typescript-eslint`'s parser (`languageOptions.parser`, `ecmaFeatures.jsx: true`) and plugin `@nx` with only:
- `@nx/enforce-module-boundaries`: `error`, `{ enforceBuildableLibDependency: false, allow: [], depConstraints: [ {sourceTag:'scope:shared', onlyDependOnLibsWithTags:['scope:shared']}, {sourceTag:'scope:web', onlyDependOnLibsWithTags:['scope:web','scope:shared']}, {sourceTag:'scope:api', onlyDependOnLibsWithTags:['scope:api','scope:shared']}, {sourceTag:'scope:relay', onlyDependOnLibsWithTags:[]} ] }`
- `no-restricted-imports`: `error`, `{ paths: [{ name: 'zmp-sdk', message: 'Only apps/zalo may import zmp-sdk.' }], patterns: [{ group: ['zmp-sdk/*'], message: 'Only apps/zalo may import zmp-sdk.' }] }`, with an override block for `apps/zalo/**` turning it `off`.
No other rules.

- [ ] **Step 5: Graph and lint**

Run: `npx nx show projects` → exactly `@cc/api @cc/core @cc/web @cc/web-common @cc/zalo @cc/zalo-relay` (any order; no root project). `npx nx graph --file=migration-baseline/.out/graph.json` → no "partial graph" warning; its `dependencies` contain `@cc/api→@cc/core`, `@cc/web-common→@cc/core`, `@cc/web→@cc/web-common`, `@cc/zalo→@cc/web-common` and `npm:zmp-sdk` only from `@cc/zalo`. Delete the navHistory disable comment. `npm run lint` → all pass.

- [ ] **Step 6: Prove the rules fire (then revert)**

Add `import '@cc/web-common';` to `packages/core/src/index.ts` and `import 'zmp-sdk';` to `packages/web-common/src/config.ts`. Run `npx nx reset && npm run lint` → fails, reporting both (the first as a scope or circular-dependency violation, the second as `Only apps/zalo may import zmp-sdk.`). Revert both lines; `npm run lint` passes again.

- [ ] **Step 7: Run the gate** (steps 1–7). `npm test` (now via Nx) must also pass on its own once.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "build: Nx workspace with TypeScript 6 API for tools and ESLint import rules"
```

---

### Task 3: Move packages into `libs/`, rename web-common to web-screens

**Files:**
- Move: `packages/core/` → `libs/shared/core/`; `packages/web-common/` → `libs/web/screens/`
- Modify: root `package.json` `workspaces` → `["apps/*", "libs/*/*"]`; `libs/web/screens/package.json` name `@cc/web-screens`; dependents (`apps/web`, `apps/zalo` package.json and imports `@cc/web-common` → `@cc/web-screens`, incl. `@cc/web-common/styles.css`); `extends` in both moved `tsconfig.json` → `../../../tsconfig.base.json`; `@/` alias paths in `apps/web/vite.config.ts`, `apps/zalo/vite.config.ts`, `apps/web/tsconfig.json`, `apps/zalo/tsconfig.json` (+ any zalo vitest config) → `libs/web/screens/src`; `apps/zalo-relay/Dockerfile` (`packages/core/package.json` → `libs/shared/core/package.json`); `libs/web/screens/src/test/theme.test.ts` (path to `apps/web/src/main.tsx` is now one level deeper); comments naming `packages/...`; `CLAUDE.md` paths (`packages/web-common` → `libs/web/screens`)

- [ ] **Step 1: Move with git**

`git mv packages/core libs/shared/core` and `git mv packages/web-common libs/web/screens`; update names, workspaces and dependents; `npm install`. Record the moves for the Task 4 repair mode in `scripts/migration/moves/03-folders.json`: `{ "moves": [{ "from": "packages/core/", "to": "libs/shared/core/" }, { "from": "packages/web-common/", "to": "libs/web/screens/" }] }` (a record only; nothing runs it).

- [ ] **Step 2: Fix every old path**

Run: `git grep -n "packages/" -- ':!docs/superpowers' ':!migration-baseline' ':!package-lock.json'` → no output (fix each hit, including `theme.test.ts`'s relative path and the Dockerfile).

- [ ] **Step 3: Graph**

`npx nx show projects` lists `@cc/web-screens` (not `web-common`); `npx nx graph --file=migration-baseline/.out/graph.json` keeps the four edges with `@cc/web-screens` in place of `@cc/web-common`.

- [ ] **Step 4: Run the gate** (1–7). Also `docker build -f apps/zalo-relay/Dockerfile .` succeeds.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor: move packages to libs/shared/core and libs/web/screens (@cc/web-screens)"
```

---

### Task 4: The move codemod

**Files:**
- Create: `scripts/migration/move-modules.mjs`
- Test: `scripts/migration/move-modules.test.mjs`

**Interfaces:**
- Produces: `export async function moveModules({ root, moves, aliases = {}, scan, git = true })` returning `{ moved: string[], rewrites: { file: string, from: string, to: string }[] }`, and a CLI `node scripts/migration/move-modules.mjs <plan.json>` where `plan.json` is `{ "moves": [...], "aliases": {...}, "scan": [...] }` (`git: true`, `root` = cwd), printing each rewrite and a count.
  - `moves`: `{ from, to }` repo-relative posix paths. A path ending in `/` moves every file under that directory, keeping relative sub-paths.
  - `aliases`: specifier prefix → repo-relative directory (e.g. `{ "@/": "libs/web/screens/src/" }`).
  - `scan`: repo-relative directories whose `.ts/.tsx/.mts/.mjs` files are importers (skip `node_modules`, `dist`).
- Behaviour (decided here; the implementer writes the code):
  1. Workspace index from root `package.json` `workspaces` globs: `name`, `dir`, `exports` of each package. Moves are applied to target directories that already contain their library `package.json`.
  2. Specifiers found in: `import … from`, `export … from`, side-effect `import '…'`, `import('…')`, and `vi.mock|vi.doMock|vi.unmock|vi.importActual|vi.importMock` (optional `<…>` type argument). A `?query` suffix is split off and re-appended unchanged.
  3. Resolve each specifier against the **pre-move** tree: relative, alias prefix, or workspace package (via `exports`, exact key first, then single-`*` patterns); try extensions `'', .ts, .tsx, .mts, /index.ts, /index.tsx`. A relative or alias specifier that resolves to no file throws `Error("Cannot resolve '<spec>' from <importer>")`. Anything else (externals, `node:`, `virtual:`, `cloudflare:`, non-workspace packages) is left alone.
  4. Rewrite only when the importer or the target moves. Same project after the move → relative posix path (`./` prefix when needed), keeping the original's extension style and directory-index style. Different project → `<package name><subpath>` from the target package's `exports`: an exact target match wins, else the single-`*` pattern with the longest literal prefix. No match → throw `Error("No export of <pkg> matches <file> (imported by <importer>)")` **before moving anything**.
  5. All rewrites are computed in memory first; then files move (`git mv`, or `fs.rename` with `mkdir -p` when `git: false`); then rewritten contents are written at the new paths. Nothing else in a file changes.
- Produces: `export async function repairImports({ root, history, scan })` returning `{ rewrites: { file, from, to }[] }`, and CLI `node scripts/migration/move-modules.mjs --repair` (history = every `scripts/migration/moves/*.json` in filename order, `scan: ['apps', 'libs']`, root = cwd). Used after merging `main` (see **Merging main**).
  - `history`: ordered list of `{ from, to }` moves (files or `/`-terminated folders), as recorded by the carve tasks.
  - For each relative or alias specifier in a scanned file that **does not resolve**: find the importer's pre-history path (walk `history` backwards; unchanged if it never moved), resolve the specifier from there, walk the resolved target forward through `history` to its current path, and if that file exists, rewrite exactly as rule 4 above (same project → relative, else package export). Specifiers that resolve today are never touched. If one still can't be resolved, collect it; at the end throw `Error` listing every `<file>: '<spec>'`.

  Files under the `moves/` folder are named with the task number first (`03-folders.json`, `05-web-i18n.json`, `06-web-util.json`, …) so filename order is history order.

- [ ] **Step 1: Write the failing tests** (`node:test`-free; use Vitest: `import { describe, it, expect } from 'vitest'`). Each test builds a temp repo (`fs.mkdtempSync`) with root `package.json` `{ "workspaces": ["libs/*/*"] }`, packages `libs/web/screens` (`@x/screens`, exports `{ ".": "./src/index.ts" }`), `libs/web/util` (`@x/util`, exports `{ "./*": "./src/*.ts" }`), `libs/web/i18n` (`@x/i18n`, exports `{ ".": "./src/index.ts", "./vi": "./src/vi.ts" }`), and calls `moveModules({ root, git: false, scan: ['libs'], ... })`:

```js
it('rewrites an importer in the old project to the package subpath', ...)
  // screens/src/components/Row.tsx: import { fmt } from '../lib/time';  move lib/time.ts -> util/src/time.ts
  expect(read('libs/web/screens/src/components/Row.tsx')).toContain("from '@x/util/time'")
it('keeps a relative import between two files moved together', ...)
  // lib/activityText.ts imports './tripText'; both move to util/src/
  expect(read('libs/web/util/src/activityText.ts')).toContain("from './tripText'")
it('leaves a moved file\'s package import of a lower package unchanged', ...)
  // screens/src/lib/time.ts has "import { t } from '@x/i18n';" ; move time.ts -> util/src/time.ts
  expect(read('libs/web/util/src/time.ts')).toContain("from '@x/i18n'")
it('rewrites vi.mock and vi.importActual specifiers', ...)
  expect(text).toContain("vi.mock('@x/util/time'") ; expect(text).toContain("vi.importActual<typeof import('@x/util/time')>('@x/util/time')")
it('keeps a ?raw query', ...)
  // "import viRaw from '../i18n/vi.ts?raw'" where vi.ts moves into i18n -> "from '@x/i18n/vi?raw'"
it('resolves the @/ alias', ...)
  // aliases: { '@/': 'libs/web/screens/src/' }; "from '@/lib/utils'", utils.ts moves to util/src -> "from '@x/util/utils'"
it('throws before moving anything when a moved file imports something that stays in a package without a matching export', ...)
  // move screens/src/lib/time.ts -> util/src/time.ts while time.ts imports '../config' (stays in screens, which exports only ".")
  // await expect(moveModules(...)).rejects.toThrow(/No export of @x\/screens matches/) ; expect(exists('libs/web/screens/src/lib/time.ts')).toBe(true)
it('throws on an unresolvable relative or alias specifier', ...)
  // a scanned file imports './missing' -> rejects.toThrow(/Cannot resolve '.\/missing'/)

describe('repairImports', ...)
it('rewrites a stale import in a file added under a moved folder', ...)
  // history: [{from:'packages/screens/', to:'libs/web/screens/'}, {from:'libs/web/screens/src/lib/time.ts', to:'libs/web/util/src/time.ts'}]
  // libs/web/screens/src/components/New.tsx (new file, written against the old layout) imports '../lib/time'
  expect(read('libs/web/screens/src/components/New.tsx')).toContain("from '@x/util/time'")
it('rewrites a stale import between two files that moved together', ...)
  // libs/web/util/src/activityText.ts gained "import { x } from '../lib/tripText'" (old-layout path); tripText moved alongside
  expect(read('libs/web/util/src/activityText.ts')).toContain("from './tripText'")
it('leaves resolvable specifiers alone', ...)
  // a file whose imports all resolve is byte-identical afterwards
it('throws listing every import it cannot place', ...)
  // a file imports '../lib/nowhere' -> rejects.toThrow(/New\.tsx: '..\/lib\/nowhere'/)
it('leaves unrelated specifiers byte-identical', ...)
  // a file importing 'react', 'node:fs', './Sibling' (neither moved) is unchanged: expect(after).toBe(before)
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run scripts/migration/move-modules.test.mjs` → FAIL (`moveModules` is not exported).

- [ ] **Step 3: Implement `moveModules`, `repairImports` and the CLI** in `scripts/migration/move-modules.mjs` per the behaviour above (they share the specifier scanner, resolver and rewrite rule).

- [ ] **Step 4: Run the tests**

Run: `npx vitest run scripts/migration/move-modules.test.mjs` → 13 passed. Then `node scripts/migration/move-modules.mjs --repair` on the real repo → `0 rewrites` (nothing is stale yet).

- [ ] **Step 5: Commit**

```bash
git add scripts/migration && git commit -m "chore: codemod that moves modules and rewrites their imports"
```

---

### Carving recipe (Tasks 5–9, 10–11)

Each carve task follows these steps; the task lists only its specifics.
1. Create the library folder with `package.json` (name, exports, tags, deps, scripts), `tsconfig.json`, and — if it receives tests — `vitest.config.ts` (jsdom, `setupFiles: ['./src/test/setup.ts']`, `include: ['src/**/*.test.{ts,tsx}']`, `maxWorkers: 2` + its comment) and `src/test/setup.ts`. Run `npm install`.
2. Write `scripts/migration/moves/<task number>-<lib>.json` (e.g. `05-web-i18n.json`) with the task's moves, `"scan": ["apps", "libs"]` and `"aliases": { "@/": "libs/web/screens/src/" }` (web tasks before Task 7 only). Run `node scripts/migration/move-modules.mjs scripts/migration/moves/<lib>.json`.
3. If the codemod throws, a moved file depends on something that must stay higher: leave that file in `web-screens` (drop it from the moves), never change its code. Note any such file in the commit message.
4. Check the new edges: `npx nx graph --file=migration-baseline/.out/graph.json` shows `@cc/web-screens → <new lib>` (and the listed lower edges).
5. Run the gate.
6. Commit with the task's message (include the moves JSON).

---

### Task 5: `@cc/web-i18n`

**Files:**
- Create: `libs/web/i18n/{package.json,tsconfig.json,vitest.config.ts,src/test/setup.ts}`
- Move: `libs/web/screens/src/i18n/index.ts|en.ts|vi.ts` → `libs/web/i18n/src/`; tests `libs/web/screens/src/i18n/__tests__/detect-lang.test.ts`, `review-markers.test.ts` → `libs/web/i18n/src/__tests__/`

**Interfaces:**
- Produces: `@cc/web-i18n` exports `{ ".": "./src/index.ts", "./en": "./src/en.ts", "./vi": "./src/vi.ts" }`; tags `scope:web`, `type:i18n`; deps `react`, `@cc/core` only if imported.
- `src/test/setup.ts`: a copy of `libs/web/screens/src/test/setup.ts` with its i18n import pointing at `../index`, headed by the comment `// Copy of libs/web/screens/src/test/setup.ts; keep the two in sync.` (Planner's call: lower libraries can't import the screens test helpers.)

- [ ] Steps 1–6 of the recipe. Commit: `refactor(web): carve @cc/web-i18n out of web-screens`

---

### Task 6: `@cc/web-util`

**Files:**
- Create: `libs/web/util/{package.json,tsconfig.json,vitest.config.ts,src/test/setup.ts}` (setup: same copy rule, i18n import → `@cc/web-i18n`)
- Move from `libs/web/screens/src/lib/` to `libs/web/util/src/`: `activityText.ts`, `clipboard.ts`, `linkTokens.ts`, `media.ts`, `nameSearch.ts`, `qr.ts`, `recentGroups.ts`, `recentPeople.ts`, `screenName.ts`, `searchPeople.ts`, `splitInput.ts`, `time.ts`, `tripText.ts`, `useListMode.ts`, `useSwipeReveal.ts`, `zaloEnv.ts`
- Move tests from `libs/web/screens/src/lib/__tests__/` to `libs/web/util/src/__tests__/`: `clipboard`, `format-expiry`, `name-search`, `qr`, `qr-logo`, `recent-groups`, `recent-people`, `screenName`, `searchPeople`, `split-input`, `zalo-env` (`.test.ts`). `activity-text.test.ts` and `shareCards.test.ts` stay (they use screens test fixtures).
- Do not touch the guard tests here; they still walk only `web-screens` until Task 7 (`qr.ts` simply leaves their walk, so every assertion still holds).

**Interfaces:**
- Produces: `@cc/web-util` exports `{ "./*": "./src/*.ts" }` (e.g. `@cc/web-util/time`); tags `scope:web`, `type:util`; deps `react`, `qrcode`, `@cc/core`, `@cc/web-i18n`.
- If any util file stops type-checking for `__APP_VERSION__`, copy `globals.d.ts` into `libs/web/util/src/` (keep the screens copy).

- [ ] Steps 1–6 of the recipe; graph shows `@cc/web-util → @cc/web-i18n`, `@cc/web-util → @cc/core`. Commit: `refactor(web): carve @cc/web-util out of web-screens`

---

### Task 7: `@cc/web-ui` (design system, theme, shadcn) — with e2e

**Files:**
- Create: `libs/web/ui/{package.json,tsconfig.json,vitest.config.ts,src/test/setup.ts}`
- Move to `libs/web/ui/src/`: `components/ui/` (whole folder), `lib/utils.ts` → `lib/utils.ts`, `styles/globals.css` → `styles/globals.css`, and from `components/`: `ActionRow`, `ActionSheet`, `Amount`, `Avatar`, `AvatarCropModal`, `BottomBar`, `Button`, `EmptyState`, `FocusWatch`, `icons`, `InlineError`, `LanguageButton`, `ListModeChip`, `Modal`, `Pill`, `Sheet`, `Skeleton`, `Snackbar` (`.tsx`) → `components/`
- Move test: `components/__tests__/responsive-sheet.test.tsx` → `libs/web/ui/src/components/__tests__/`
- Move: `libs/web/screens/components.json` → `libs/web/ui/components.json`
- Modify: remove the `@/` alias everywhere — `apps/web/vite.config.ts`, `apps/zalo/vite.config.ts` (`resolve.alias` and the comment above it), `apps/web/tsconfig.json`, `apps/zalo/tsconfig.json`, `libs/web/screens/tsconfig.json` (`paths`), `libs/web/screens/vitest.config.ts` (`resolve.alias`)
- Modify: `apps/web/src/main.tsx`, `apps/zalo/src/main.tsx`: `import '@cc/web-screens/styles.css'` → `import '@cc/web-ui/styles.css'`; remove `./styles.css` from web-screens exports
- Modify: `libs/web/ui/src/styles/globals.css`: `@source "..";` → `@source "../../../";` (covers `libs/web/*`), comment updated to say so
- Modify (paths only): `libs/web/screens/src/test/style-guard.test.ts`, `ui-components-guard.test.ts`, `theme.test.ts` — see Step 4
- Modify: `CLAUDE.md` UI section paths (`libs/web/ui/src/components/ui/`, `npx shadcn@latest add <name>` run in `libs/web/ui`, theme in `libs/web/ui/src/styles/globals.css`, style-guard path) and add one line: "After `npx shadcn add`, change the new file's `@cc/web-ui/...` imports to relative ones (lint flags self-imports)."

**Interfaces:**
- Produces: `@cc/web-ui` exports `{ "./styles.css": "./src/styles/globals.css", "./components/ui/*": "./src/components/ui/*.tsx", "./components/*": "./src/components/*.tsx", "./lib/*": "./src/lib/*.ts" }` (e.g. `@cc/web-ui/components/Button`, `@cc/web-ui/lib/utils`); tags `scope:web`, `type:ui`; deps: the shadcn/Radix/styling packages its files import (`radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `cmdk`, `vaul`, `sonner`, `tw-animate-css`, `shadcn`, `tailwindcss`, `react`, `react-dom` — only those actually imported), `@cc/core`, `@cc/web-i18n`, `@cc/web-util`.
- `libs/web/ui/tsconfig.json` adds `"paths": { "@cc/web-ui/*": ["./src/*"] }` (shadcn resolves its aliases through it).
- `libs/web/ui/components.json`: `"tailwind.css": "src/styles/globals.css"`, aliases `components: "@cc/web-ui/components"`, `utils: "@cc/web-ui/lib/utils"`, `ui: "@cc/web-ui/components/ui"`, `lib: "@cc/web-ui/lib"`, `hooks: "@cc/web-ui/hooks"`; everything else unchanged.
- Codemod aliases for this task: `{ "@/": "libs/web/screens/src/" }` (resolves every remaining `@/` import, inside ui to relative, elsewhere to `@cc/web-ui/...`).

- [ ] **Step 1–2:** recipe steps 1–2.
- [ ] **Step 3: No `@/` left**

Run: `git grep -nE "['\"]@/" -- apps libs` → no output. `git grep -n "web-screens/src" -- apps` → no output.

- [ ] **Step 4: Guard tests walk all web libraries** (paths only, assertions unchanged)
  - `style-guard.test.ts` and `ui-components-guard.test.ts`: walk root = `libs/web` (from the test file: `join(import.meta.dirname, '../../..')`), keeping only files under `<lib>/src/` and skipping `node_modules`; file ids become `<lib>/src/...`; the test-file filter matches `/src/test/` and `__tests__/`; `ui-components-guard` excludes `ui/src/components/ui/`; `style-guard`'s expected stylesheet list is `['ui/src/styles/globals.css']` and `IMAGE_PAINTERS` is `['util/src/qr.ts']`.
  - `theme.test.ts`: reads `globals.css` from `libs/web/ui/src/styles/globals.css` (relative to the test file).
  - Run: `npx vitest run src/test/style-guard.test.ts src/test/ui-components-guard.test.ts src/test/theme.test.ts` in `libs/web/screens` → all pass; same test names as before.

- [ ] **Step 5: shadcn resolves to the library**

In `libs/web/ui` run `npx shadcn@latest add button --dry-run`; expected: it targets `src/components/ui/button.tsx`. If the CLI has no `--dry-run`, run `npx shadcn@latest add button --overwrite`, confirm `git status` shows only `libs/web/ui/src/components/ui/button.tsx`, then `git checkout -- libs/web/ui/src/components/ui/button.tsx`.

- [ ] **Step 6:** recipe steps 4–5 **with e2e** (gate step 7 is the Tailwind proof). Commit: `refactor(web): carve @cc/web-ui (design system, theme, shadcn) out of web-screens`

---

### Task 8: `@cc/web-platform`

**Files:**
- Create: `libs/web/platform/{package.json,tsconfig.json}` (no tests move here: `platform.test.tsx` and `zaloSession.test.ts` use screens test helpers and stay)
- Move: `libs/web/screens/src/platform/index.tsx|browser.ts|session.ts` → `libs/web/platform/src/`
- Keep in place for Task 9: `libs/web/screens/src/platform/zaloSession.ts`
- Modify: `libs/web/screens/src/index.ts` keeps re-exporting `PlatformProvider`, `usePlatform`, `browserPlatform`, `sessionStore`, `PlatformBridge`, `ShareCard`, `ZaloFriend` (now from `@cc/web-platform`) — the codemod rewrites the specifiers.

**Interfaces:**
- Produces: `@cc/web-platform` exports `{ ".": "./src/index.tsx", "./browser": "./src/browser.ts", "./session": "./src/session.ts" }`; tags `scope:web`, `type:platform`; deps `react`.
- `apps/zalo` keeps importing its types from `@cc/web-screens` (no change).

- [ ] Recipe steps 1–6. Commit: `refactor(web): carve @cc/web-platform out of web-screens`

---

### Task 9: `@cc/web-data-access` — with e2e

**Files:**
- Create: `libs/web/data-access/{package.json,tsconfig.json}` (no tests move: `client-platform.test.ts`, `people.test.ts` use screens test helpers)
- Move: `libs/web/screens/src/api/client.ts|feedback.ts|focus.ts|hooks.ts|myActivity.ts|payInfo.ts|people.ts|recentPeople.ts` → `libs/web/data-access/src/`; `libs/web/screens/src/platform/zaloSession.ts` → `libs/web/data-access/src/zaloSession.ts`

**Interfaces:**
- Produces: `@cc/web-data-access` exports `{ "./*": "./src/*.ts" }` (e.g. `@cc/web-data-access/client`, `@cc/web-data-access/zaloSession`); tags `scope:web`, `type:data-access`; deps `@tanstack/react-query`, `react`, `@cc/core`, `@cc/web-util`, `@cc/web-platform` (+ `@cc/web-i18n` only if imported). Copy `globals.d.ts` in if `__APP_VERSION__` is used.
- After this task `libs/web/screens/src/platform/` and `src/api/` hold only `__tests__/`; leave those test folders where they are.

- [ ] Recipe steps 1–6 **with e2e**. Graph shows `@cc/web-data-access → @cc/web-platform`, and **no** `@cc/web-platform → @cc/web-data-access`. Commit: `refactor(web): carve @cc/web-data-access out of web-screens`

---

### Task 10: `@cc/api-util` and `@cc/api-db` — with e2e

**Files:**
- Create: `libs/api/util/{package.json,tsconfig.json}`, `libs/api/db/{package.json,tsconfig.json}`, and first, inside the app, `apps/api/src/db/types.ts`
- Move: `apps/api/src/lib/errors.ts|ids.ts` → `libs/api/util/src/`; `apps/api/src/db/schema.ts|client.ts|types.ts` → `libs/api/db/src/`; `apps/api/src/env.ts` → `libs/api/db/src/env.ts`; `apps/api/src/lib/commit.ts|activityNames.ts` → `libs/api/db/src/`
- Modify (`UserRow` type move, done in the app before the codemod): `apps/api/src/db/types.ts` holds `import type { users } from './schema';` and the exact line `export type UserRow = typeof users.$inferSelect;` taken from `auth/session.ts`; `apps/api/src/env.ts` imports `UserRow` from `./db/types`; `apps/api/src/auth/session.ts` deletes its declaration and adds `import type { UserRow } from '../db/types';` plus `export type { UserRow } from '../db/types';`. The codemod then carries all of these into the libraries.
- Modify: `apps/api/drizzle.config.ts` `schema: '../../libs/api/db/src/schema.ts'`
- Codemod plan: `"scan": ["apps/api", "libs/api"]`, no aliases (also rewrites `apps/api/test/*` imports of `../src/db/...`, `../src/lib/...`, `../src/env`).

**Interfaces:**
- Produces: `@cc/api-util` exports `{ "./*": "./src/*.ts" }`, tags `scope:api`, `type:util`, deps `@cc/core`. `@cc/api-db` exports `{ "./*": "./src/*.ts" }`, tags `scope:api`, `type:data-access`, deps `drizzle-orm`, `hono` (only if imported), `@cc/core`, `@cc/api-util`.

- [ ] **Step 1:** do the `UserRow` type move inside the app and run `npm run typecheck -w apps/api` → passes (the `env ↔ session` cycle is gone). Then create the two library folders (recipe step 1).
- [ ] **Step 2:** recipe steps 2–5 **with e2e**. Gate steps 5 and 6 are the proofs (bundle builds, schema identical). `git status apps/api/migrations` → clean.
- [ ] **Step 3:** Commit: `refactor(api): carve @cc/api-util and @cc/api-db out of the Worker`

---

### Task 11: `@cc/api-auth` — with e2e

**Files:**
- Create: `libs/api/auth/{package.json,tsconfig.json}`
- Move to `libs/api/auth/src/`: from `apps/api/src/auth/`: `session.ts`, `identity.ts`, `google.ts`, `zalo.ts`, `zaloMini.ts`, `zaloSlots.ts`, `me.ts`; from `apps/api/src/access/`: `actor.ts`, `device.ts`, `guard.ts`; from `apps/api/src/lib/`: `cors.ts`
- Stay in the app: `auth/routes.ts`, `accountRoutes.ts`, `zaloMiniRoutes.ts`, `testLogin.ts`, `mergeUsers.ts`, `access/routes.ts`

**Interfaces:**
- Produces: `@cc/api-auth` exports `{ "./*": "./src/*.ts" }` (e.g. `@cc/api-auth/session`, `@cc/api-auth/actor`); tags `scope:api`, `type:auth` (planner's call: the spec's type list has no tag for auth; it needs its own so `api-db` can't import it); deps `hono`, `arctic`, `drizzle-orm`, `@cc/core`, `@cc/api-util`, `@cc/api-db` (only those imported).

- [ ] Recipe steps 1–6 **with e2e**. Graph: `@cc/api → @cc/api-auth → @cc/api-db → @cc/api-util → @cc/core`, no edge from `api-db` or `api-util` to `api-auth`. Commit: `refactor(api): carve @cc/api-auth out of the Worker`

---

### Task 12: Final import rules

**Files:**
- Modify: `eslint.config.mjs` (add type constraints), `scripts/migration/rules.test.mjs` (create)

**Interfaces:**
- Produces: type depConstraints added to the scope ones:
  - `type:util` → `['type:util', 'type:i18n']`
  - `type:i18n` → `['type:util']`
  - `type:ui` → `['type:ui', 'type:util', 'type:i18n']`
  - `type:platform` → `['type:platform', 'type:util']`
  - `type:data-access` → `['type:data-access', 'type:platform', 'type:util', 'type:i18n']`
  - `type:auth` → `['type:auth', 'type:data-access', 'type:util']`
  - `type:screens` → `['type:screens', 'type:data-access', 'type:platform', 'type:ui', 'type:i18n', 'type:util']`
  - `type:app` → `['type:screens', 'type:data-access', 'type:platform', 'type:ui', 'type:i18n', 'type:util', 'type:auth']`
- No `@cc/web-testing` library (planner's call: shared test helpers stay in `libs/web/screens/src/test/`; lower libraries keep their own `src/test/setup.ts` copies).

- [ ] **Step 1: Write the failing rule test** `scripts/migration/rules.test.mjs` (Vitest, runs `npx nx run-many -t lint` via `execSync` after writing a temporary import, restoring the file in `finally`, then `npx nx reset`):

```js
it('rejects ui importing data-access', ...)      // add `import '@cc/web-data-access/client';` to libs/web/ui/src/components/Button.tsx → lint output contains 'type:ui' ; exit code ≠ 0
it('rejects platform importing ui', ...)         // libs/web/platform/src/browser.ts imports '@cc/web-ui/lib/utils' → output contains 'type:platform'
it('rejects data-access importing ui', ...)      // libs/web/data-access/src/focus.ts imports '@cc/web-ui/lib/utils' → output contains 'type:data-access'
it('rejects util importing ui', ...)             // libs/web/util/src/time.ts imports '@cc/web-ui/lib/utils' → exit ≠ 0 (type or circular-dependency message)
it('rejects api-db importing api-auth', ...)     // libs/api/db/src/client.ts imports '@cc/api-auth/session' → exit ≠ 0 (type or circular-dependency message)
it('rejects web importing api', ...)             // libs/web/screens/src/config.ts imports '@cc/api-util/ids'
it('rejects zmp-sdk outside apps/zalo', ...)     // libs/web/platform/src/browser.ts: import 'zmp-sdk' → 'Only apps/zalo may import zmp-sdk.'
it('passes on the clean tree', ...)              // exit code 0
```

- [ ] **Step 2:** Run `npx vitest run scripts/migration/rules.test.mjs` → the first three cases FAIL (no type rules yet); the rest already pass through Nx's cycle check or the scope/zmp rules.
- [ ] **Step 3:** Add the type constraints to `eslint.config.mjs`.
- [ ] **Step 4:** Run `npx vitest run scripts/migration/rules.test.mjs` → 8 passed; `npm run lint` → zero violations, no `eslint-disable` added anywhere (`git grep -n "eslint-disable" -- apps libs` → no output).
- [ ] **Step 5:** Run the gate (1–7). Commit: `build: enforce by-kind import rules`

---

### Task 13: CI, Docker, docs, cleanup — with e2e

**Files:**
- Modify: `.github/workflows/ci.yml`, `.github/workflows/zalo-relay.yml` (test step already `npm test -w @cc/zalo-relay` from Task 1 — confirm), `apps/zalo-relay/Dockerfile` (confirm manifests), `README.md`, `docs/setup.md`, `CLAUDE.md`
- Delete: `migration-baseline/` and the baseline scripts (after the final comparison). **Keep** `scripts/migration/move-modules.mjs`, its test and `scripts/migration/moves/` if the guest "pay one expense" work (or any other branch started before this move) hasn't merged yet, and add `scripts/migration/README.md`: "To bring a branch made before the Nx move up to date: merge main, follow the conflict rules in `docs/superpowers/plans/2026-11-03-nx-workspace.md` (Merging main, steps 1–2), then run `node scripts/migration/move-modules.mjs --repair`." Delete them in a later cleanup once those branches have landed.

**Interfaces:**
- `ci.yml` check job: `actions/checkout@v7` with `fetch-depth: 0`; `nrwl/nx-set-shas` (current major); `npm ci`; env `VITE_API_ORIGIN: https://example.invalid`; steps `npx nx affected -t lint typecheck build` then `npx nx affected -t test --parallel=1`. e2e job unchanged (`npm run e2e`).
- `README.md` / `docs/setup.md`: package names `@cc/*`; folder layout (`apps/`, `libs/shared|web|api/...` with one line per library from spec §5–§6); `npm run lint` (through Nx only); TypeScript note (`tsc` is 7, tools use the 6 API, VS Code workspace TypeScript → `node_modules/@typescript/old/lib`; drop the alias when TS 7 ships its API); **Workers Builds commands `npm run build -w apps/web` and `npm run deploy -w apps/api`**.
- `CLAUDE.md`: a short "Workspace (Nx)" section: libraries by kind with their tags, the import rules in one line each, "lint only through Nx", and where new code goes (UI primitive → `@cc/web-ui`, API call/hook → `@cc/web-data-access`, pure helper → `@cc/web-util`, screen/feature component → `@cc/web-screens`, server helper → `@cc/api-util`, DB schema/helpers → `@cc/api-db`, sign-in/access → `@cc/api-auth`).

- [ ] **Step 1:** CI and docs as above.
- [ ] **Step 2: Final verification (spec §11)**
  - The gate 1–8 (with e2e).
  - `npx tsc --version` → 7.x; `node -p "require('typescript').version"` → 6.x.
  - `docker build -f apps/zalo-relay/Dockerfile -t cc-relay-check .` then `docker run -d -p 18080:8080 --name cc-relay-check cc-relay-check` and `curl -fsS http://127.0.0.1:18080/health` → OK; remove the container.
  - `npm run -w apps/web` and `npm run -w apps/api` list their scripts (Workers Builds folder form resolves; **do not** run deploy).
  - `npx nx graph --file=migration-baseline/.out/graph.json`: projects `@cc/core`, `@cc/web-i18n`, `@cc/web-util`, `@cc/web-ui`, `@cc/web-platform`, `@cc/web-data-access`, `@cc/web-screens`, `@cc/web`, `@cc/zalo`, `@cc/api-util`, `@cc/api-db`, `@cc/api-auth`, `@cc/api`, `@cc/zalo-relay`; no cycles (lint passes).
  - `git grep -n "@fsl" -- ':!docs/superpowers'` → no output.
  - Manual smoke on `npm run dev` (http://localhost:5173): landing, test login, create a group, add an expense, open the pay screen.
- [ ] **Step 3:** Delete `migration-baseline/` and the baseline scripts (keep the codemod as described above), remove the `.gitignore` line; `npm run typecheck && npm run lint` still pass.
- [ ] **Step 4:** Commit: `ci: Nx affected checks; docs for the Nx workspace` and open the PR. The PR description lists the owner action: **switch Cloudflare Workers Builds to `npm run build -w apps/web` / `npm run deploy -w apps/api` before merging**, and records `tsc --version` / TS API version.
