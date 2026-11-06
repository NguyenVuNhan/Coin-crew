# Bringing an old branch onto the Nx layout

`move-modules.mjs` moved files into the `libs/` layout and rewrote their imports; `moves/*.json` records every move in order
(see `docs/superpowers/plans/2026-11-03-nx-workspace.md`). Keep them until every branch started before the move has landed
(for example the parked `NguyenVuNhan/zmp-task-14`), then delete this folder.

To bring such a branch up to date:

1. `git merge origin/main` and resolve conflicts by the rules in the plan's **Merging main** section, steps 1–2: the branch's
   logic wins, files it changed that were moved go to their new path, new files stay where git's directory-rename detection
   puts them, `@fsl/` becomes `@cc/` and `@cc/web-common` becomes `@cc/web-screens`.
2. `node scripts/migration/move-modules.mjs --repair` rewrites every import still written against the old layout.
3. `npm install`, then `npm run typecheck`, `npm run lint`, `npm test` and `npm run e2e`.

Tests for the codemod: `npx vitest run scripts/migration/move-modules.test.mjs`.
