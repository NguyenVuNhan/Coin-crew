# Coin Crew — phase 1

Split trip expenses with friends and settle up with VietQR. Friends join from one link in the group chat, with no account. Members sign in with Google.

- Design, plan and project notes live in the owner's Obsidian vault: `30_Projects/Coin Crew/` (`2026-10-12-group-split-vietqr-design.md`, `2026-10-12-phase1-group-split-vietqr.md`, `2026-10-13-idea-discussion-next-steps.md`).
- Layout mockups: [docs/superpowers/mockups/](docs/superpowers/mockups/)

## Layout

An [Nx](https://nx.dev) workspace on npm workspaces. Libraries are split by kind; each is a workspace package (`@cc/*`) that exports its TypeScript source.

| Path | Package | What |
|---|---|---|
| `apps/api` | `@cc/api` | One Cloudflare Worker (Hono + D1 via Drizzle): the routes. Serves `/api/*` and the built web app from `apps/api/public` |
| `apps/web` | `@cc/web` | Browser shell (Vite PWA). `npm run build -w apps/web` writes into `apps/api/public` |
| `apps/zalo` | `@cc/zalo` | Zalo Mini App shell; the only place that imports `zmp-sdk` |
| `apps/zalo-relay` | `@cc/zalo-relay` | Small Node server (Docker image) that fetches Zalo profiles from Vietnam |
| `libs/shared/core` | `@cc/core` | Pure TypeScript shared by API and web: money, splits, balances, transfers, name matching, VietQR, permissions, API types |
| `libs/web/screens` | `@cc/web-screens` | The React app: screens, CoinCrew-specific components and hooks, test helpers |
| `libs/web/ui` | `@cc/web-ui` | Design system: shadcn parts, app wrappers (`Button`, `Sheet`, `Amount`…), the theme (`globals.css`) |
| `libs/web/data-access` | `@cc/web-data-access` | API client and React Query hooks |
| `libs/web/platform` | `@cc/web-platform` | Platform bridge (`usePlatform()`: web vs Zalo Mini App) and the session store |
| `libs/web/i18n` | `@cc/web-i18n` | Vietnamese and English copy, `t()` and the language store |
| `libs/web/util` | `@cc/web-util` | Helpers with no UI and no API calls (time, names, QR, text) |
| `libs/api/auth` | `@cc/api-auth` | Sign-in and access: sessions, Google/Zalo identity, actors, guards, CORS |
| `libs/api/db` | `@cc/api-db` | Drizzle schema and client, the Worker's env types, write helpers |
| `libs/api/util` | `@cc/api-util` | Server helpers: errors, ids |
| `e2e` | | Playwright golden path at 375px |

Import rules are checked by ESLint through Nx (`npm run lint`): web and API code never import each other (only `@cc/core` is shared), and lower kinds never import higher ones (util → i18n → ui / platform → data-access → screens → app). Run lint through Nx only; plain `npx eslint .` skips the import rule when Nx's graph cache is missing.

TypeScript: `tsc` is TypeScript 7 (`@typescript/native`); the `typescript` package is TypeScript 6 only so tools that need its API (Nx, typescript-eslint) work ([Nx guide](https://nx.dev/docs/kb/typescript-7)). In VS Code, if you pick the workspace TypeScript version, point it at `node_modules/@typescript/old/lib`. Drop the TypeScript 6 alias once TypeScript 7 ships its API.

## Run it locally

Needs Node 24.

```bash
npm install
```

Create `apps/api/.dev.vars` (git-ignored):

```
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-secret
APP_ORIGIN=http://localhost:8787
```

Create the local database, then build the app and start the Worker:

```bash
npx -w @cc/api wrangler d1 migrations apply fsl --local
```

```bash
npm run dev
```

Open http://localhost:8787. For front-end work with hot reload, run `npm run dev -w @cc/web` (port 5173, proxies `/api` to 8787) next to `npm run dev -w @cc/api`.

Google sign-in needs an OAuth client; [docs/setup.md](docs/setup.md#2-google-sign-in-oauth-client) shows how to create one.

## Tests

```bash
npm test
```

Runs every project's suite through Nx, one project at a time: core, API (inside the Workers runtime with a local D1) and the web libraries (jsdom). `npm run typecheck` and `npm run lint` work the same way; results are cached, so a rerun only repeats what changed.

```bash
npm run e2e
```

Builds the app, starts `wrangler dev` with a fresh local database and the test-only sign-in route, and runs the golden path in your installed Google Chrome at 375×812.

## Deploy (Cloudflare free plan)

Every push to `main` deploys through Cloudflare Workers Builds. The database ID, public address and Google credentials live in Cloudflare, not in the repo. [docs/setup.md](docs/setup.md) walks through the whole setup from scratch: Google sign-in, the D1 database, Workers Builds, variables and secrets, migrations, usage alerts and troubleshooting.

## Still to check before going live

See the design's §14:

1. Which bank apps open with the payment already filled in through `dl.vietqr.io`, and the exact parameters. Flip `PREFILL_VERIFIED` in `libs/shared/core/src/banks.ts` once confirmed.
2. Transfer-note length and character limits at the major banks.
3. The current D1 and Workers free-plan numbers. Update `FREE_LIMITS` and the `DAILY_LIMIT` error matcher in `libs/api/util/src/errors.ts`.
4. What Vietnam's personal-data rules require. Replace the draft privacy notice in `libs/web/screens/src/screens/Privacy.tsx`.

Also review the Vietnamese copy in `libs/web/i18n/src/vi.ts`: every line marked `// REVIEW` is a draft translation.
