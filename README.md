# Finance Sheet Lover — phase 1

Split trip expenses with friends and settle up with VietQR. Friends join from one link in the group chat, with no account. Members sign in with Google.

- Design, plan and project notes live in the owner's Obsidian vault: `30_Projects/Finance Sheet Lover - Trip Split & VietQR App/` (`2026-10-12-group-split-vietqr-design.md`, `2026-10-12-phase1-group-split-vietqr.md`, `2026-10-13-idea-discussion-next-steps.md`).
- Layout mockups: [docs/superpowers/mockups/](docs/superpowers/mockups/)

## Layout

| Path | What |
|---|---|
| `packages/core` | Pure TypeScript: money, splits, balances, transfers, name matching, VietQR, permissions, API types |
| `apps/api` | One Cloudflare Worker (Hono + D1 via Drizzle). Serves `/api/*` and the built web app from `apps/api/public` |
| `apps/web` | React + Vite PWA. `npm run build -w @fsl/web` writes into `apps/api/public` |
| `e2e` | Playwright golden path at 375px |

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
npx -w @fsl/api wrangler d1 migrations apply fsl --local
```

```bash
npm run dev
```

Open http://localhost:8787. For front-end work with hot reload, run `npm run dev -w @fsl/web` (port 5173, proxies `/api` to 8787) next to `npm run dev -w @fsl/api`.

Google sign-in needs an OAuth client; [docs/setup.md](docs/setup.md#2-google-sign-in-oauth-client) shows how to create one.

## Tests

```bash
npm test
```

Runs the core, API (inside the Workers runtime with a local D1) and web (jsdom) suites.

```bash
npm run e2e
```

Builds the app, starts `wrangler dev` with a fresh local database and the test-only sign-in route, and runs the golden path in your installed Google Chrome at 375×812.

## Deploy (Cloudflare free plan)

Every push to `main` deploys through Cloudflare Workers Builds. The database ID, public address and Google credentials live in Cloudflare, not in the repo. [docs/setup.md](docs/setup.md) walks through the whole setup from scratch: Google sign-in, the D1 database, Workers Builds, variables and secrets, migrations, usage alerts and troubleshooting.

## Still to check before going live

See the design's §14:

1. Which bank apps open with the payment already filled in through `dl.vietqr.io`, and the exact parameters. Flip `PREFILL_VERIFIED` in `packages/core/src/banks.ts` once confirmed.
2. Transfer-note length and character limits at the major banks.
3. The current D1 and Workers free-plan numbers. Update `FREE_LIMITS` and the `DAILY_LIMIT` error matcher in `apps/api/src/lib/errors.ts`.
4. What Vietnam's personal-data rules require. Replace the draft privacy notice in `apps/web/src/screens/Privacy.tsx`.

Also review the Vietnamese copy in `apps/web/src/i18n/vi.ts`: every line marked `// REVIEW` is a draft translation.
