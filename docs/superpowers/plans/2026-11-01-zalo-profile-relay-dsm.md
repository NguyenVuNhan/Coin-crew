# Zalo Profile Relay on the DSM — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prod Zalo sign-ins get the real name and avatar by sending the one profile call through a relay on the owner's home DSM (Vietnamese IP), with today's id-only path as fallback.

**Architecture:** A new workspace `apps/zalo-relay` (Node 24 + Hono) exposes `GET /me` and `GET /health`, guarded by a shared secret, and only ever calls `graph.zalo.me/v2.0/me`. GitHub Actions builds a multi-arch image to GHCR; on the DSM a Container Manager project runs it behind the DSM reverse proxy, with an updater that pulls new images. The Worker's `fetchZaloProfile` tries the relay first when `ZALO_RELAY_URL`/`ZALO_RELAY_SECRET` are set.

**Tech Stack:** TypeScript, Hono 4, `@hono/node-server`, Vitest 4, Docker (buildx, GHCR), Cloudflare Workers + `@cloudflare/vitest-plugin`.

**Spec:** `docs/superpowers/specs/2026-11-01-zalo-profile-relay-dsm-design.md`

## Global Constraints

- Node 24; npm workspaces at the repo root; the relay package is `@fsl/zalo-relay` with `test` and `typecheck` scripts so root `npm test` / `npm run typecheck` (and CI) pick it up.
- Relay upstream is hard-coded `https://graph.zalo.me/v2.0/me`; allowed `fields`: exactly `id` and `id,name,picture`.
- Worker → relay token header: `X-Zalo-Access-Token`. Relay → Zalo header: `access_token`. Auth: `Authorization: Bearer <ZALO_RELAY_SECRET>`, constant-time.
- Timeouts: Worker → relay 3000 ms; relay → Zalo 5000 ms.
- Never log tokens, secrets, header values, query values or bodies (relay logs method, path, status, duration).
- Image: `ghcr.io/nguyenvunhan/coin-crew-zalo-relay`, `linux/amd64` + `linux/arm64`, public, tags `latest` (main) / `edge` (manual run on a branch) plus the commit SHA. No secrets in the image.
- Container listens on 8080; compose publishes it on `127.0.0.1` only.
- Worker env: `ZALO_RELAY_URL`, `ZALO_RELAY_SECRET` (both optional). Either unset → today's behaviour exactly.
- Existing tests are not edited or deleted: `fetchZaloProfile` keeps its first parameter and gains an optional second one, so current call sites still compile.

## Review Focus

- `ZALO_RELAY_URL` set with a trailing slash (`https://…diskstation.me/`) → still calls `…/me`, not `//me`. (Task 4 test)
- Relay answers 200 but the body is a Zalo error (e.g. the DSM's IP is also refused) → Worker treats it as a relay failure and falls back. (Task 4 test)
- Relay answers 200 with an id but no name → sign-in works, `nameWithheld: true`, so an existing real name isn't overwritten with "Zalo". (Task 4 test)
- Right secret but no `X-Zalo-Access-Token` → 400, Zalo never called. (Task 1 test)
- Container started with an empty/missing `ZALO_RELAY_SECRET` → refuses to start rather than running unauthenticated. (Task 1 test)

---

### Task 1: Relay app

**Files:**
- Create: `apps/zalo-relay/package.json`, `apps/zalo-relay/tsconfig.json`, `apps/zalo-relay/vitest.config.ts`
- Create: `apps/zalo-relay/src/app.ts`
- Test: `apps/zalo-relay/test/app.test.ts`

**Interfaces:**
- Produces: `createApp(opts: { secret: string; fetch?: typeof fetch; log?: (line: string) => void }): Hono` — throws `Error('ZALO_RELAY_SECRET is required')` if `secret` is empty. `UPSTREAM_URL = 'https://graph.zalo.me/v2.0/me'` exported.

- [ ] **Step 1: Scaffold the package.** `package.json`: name `@fsl/zalo-relay`, private, `"type": "module"`, scripts `test: vitest run`, `typecheck: tsc -p tsconfig.json`, `build: tsc -p tsconfig.build.json` (emits `dist/`), `start: node dist/server.js`; deps `hono` (same range as `apps/api`), `@hono/node-server`. `tsconfig.json` extends `../../tsconfig.base.json` with `"types": ["node"]`. Vitest `environment: 'node'`. Run `npm install` at the root so the lockfile includes it.

- [ ] **Step 2: Write the failing tests** in `test/app.test.ts`, using a `vi.fn()` fake `fetch` and `app.request(...)`:
  - `createApp({ secret: '' })` throws `'ZALO_RELAY_SECRET is required'`.
  - `GET /health` with no auth → 200, body `ok`, fake fetch not called.
  - `GET /me?fields=id` with no `Authorization`, and with `Bearer wrong` → 401; fetch not called.
  - Right secret, `fields=email` → 400; `fields` missing → 400; fetch not called.
  - Right secret, valid fields, no `X-Zalo-Access-Token` → 400; fetch not called.
  - Right secret, `fields=id,name,picture`, `X-Zalo-Access-Token: tok` → fetch called once with URL `https://graph.zalo.me/v2.0/me?fields=id,name,picture` and header `access_token: tok`; response status and JSON body (`{ id: '123', name: 'An' }`) passed through unchanged.
  - Upstream returns 500 with a JSON body → relay returns 500 with that body.
  - Fake fetch rejects with `TypeError` → 502; rejects with an `AbortError`/`TimeoutError` → 504.
  - `GET /anything` → 404.
  - A `log` spy: after a successful `/me` call, no logged line contains `tok` or the secret.

- [ ] **Step 3: Run** `npm test -w @fsl/zalo-relay` → FAIL (module missing).

- [ ] **Step 4: Implement `createApp`.** Secret check: compare SHA-256 digests of the given and expected values with `crypto.timingSafeEqual` (handles different lengths). Upstream call uses `AbortSignal.timeout(5000)`. Log one line per request: `${method} ${path} ${status} ${ms}ms` (path without query string).

- [ ] **Step 5: Run** `npm test -w @fsl/zalo-relay` and `npm run typecheck -w @fsl/zalo-relay` → PASS.

- [ ] **Step 6: Commit** `feat(zalo-relay): relay app for the Zalo profile call`

### Task 2: Server entry, Docker image and DSM compose

**Files:**
- Create: `apps/zalo-relay/src/server.ts`, `apps/zalo-relay/tsconfig.build.json`
- Create: `apps/zalo-relay/Dockerfile`, `.dockerignore` (repo root, if none exists; exclude `node_modules`, `.wrangler`, `apps/api/.dev.vars`, `.git`)
- Create: `apps/zalo-relay/compose.yaml`, `apps/zalo-relay/.env.example`

**Interfaces:**
- Consumes: `createApp` from Task 1.
- Produces: an image that serves on port 8080, reads `ZALO_RELAY_SECRET` from env; compose that reads `RELAY_TAG` (default `latest`), `RELAY_PORT` (default `8080`), `ZALO_RELAY_SECRET` from `.env`.

- [ ] **Step 1: `src/server.ts`:** `serve({ fetch: createApp({ secret: process.env.ZALO_RELAY_SECRET ?? '', log: console.log }).fetch, port: 8080 })`; exit non-zero if `createApp` throws.

- [ ] **Step 2: Dockerfile** (build context = repo root, so the root lockfile is used): build stage on `node:24-alpine` installs `npm ci -w @fsl/zalo-relay`, runs `npm run build -w @fsl/zalo-relay`; runtime stage on `node:24-alpine` with production deps only, `USER node`, `EXPOSE 8080`, `CMD ["node", "apps/zalo-relay/dist/server.js"]`. No `ENV`/`ARG` for the secret.

- [ ] **Step 3: compose.yaml:** service `zalo-relay` — `image: ghcr.io/nguyenvunhan/coin-crew-zalo-relay:${RELAY_TAG:-latest}`, `env_file: .env`, `ports: ["127.0.0.1:${RELAY_PORT:-8080}:8080"]`, `restart: unless-stopped`, label `com.centurylinklabs.watchtower.enable=true`. Service `updater` — Watchtower (or a maintained fork; check it is still maintained and pin a version), `--label-enable --cleanup --interval 900`, Docker socket mounted read-only. `.env.example` lists `ZALO_RELAY_SECRET=` (with "generate with `openssl rand -hex 32`"), `RELAY_TAG=latest`, `RELAY_PORT=8080`.

- [ ] **Step 4: Verify locally:**
  - `docker build -f apps/zalo-relay/Dockerfile -t zalo-relay:local .` → succeeds.
  - `docker run --rm -e ZALO_RELAY_SECRET=x -p 18080:8080 zalo-relay:local` then `curl -s localhost:18080/health` → `ok`; `curl -s -o /dev/null -w '%{http_code}' localhost:18080/me?fields=id` → `401`.
  - `docker run --rm zalo-relay:local` (no secret) → exits non-zero.
  - `docker history zalo-relay:local` shows no secret.

- [ ] **Step 5: Commit** `feat(zalo-relay): Docker image and DSM compose project`

### Task 3: Image workflow

**Files:**
- Create: `.github/workflows/zalo-relay.yml`

**Interfaces:**
- Consumes: Dockerfile from Task 2.
- Produces: `ghcr.io/nguyenvunhan/coin-crew-zalo-relay:{latest|edge, <sha>}`.

- [ ] **Step 1: Write the workflow.** Triggers: `push` to `main` with `paths: ['apps/zalo-relay/**', '.github/workflows/zalo-relay.yml', 'package-lock.json']`, and `workflow_dispatch`. Permissions `contents: read`, `packages: write`. Job: checkout, setup-node 24 + `npm ci`, `npm test -w @fsl/zalo-relay`, then `docker/setup-qemu-action`, `docker/setup-buildx-action`, `docker/login-action` (ghcr.io, `GITHUB_TOKEN`), `docker/build-push-action` with `context: .`, `file: apps/zalo-relay/Dockerfile`, `platforms: linux/amd64,linux/arm64`, tags: `latest` if `github.ref == 'refs/heads/main'`, otherwise `edge`; always `${{ github.sha }}`. Use the same major action versions as `ci.yml` where they overlap.

- [ ] **Step 2: Lint** with `npx --yes actionlint .github/workflows/zalo-relay.yml` (or `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint`) → no errors.

- [ ] **Step 3: Commit** `ci(zalo-relay): build and publish the relay image to GHCR`

(The first real run happens in Task 6 step 1; making the package public is a one-time manual step documented in Task 5.)

### Task 4: Worker uses the relay

**Files:**
- Modify: `apps/api/src/env.ts` (add `ZALO_RELAY_URL?: string; ZALO_RELAY_SECRET?: string;` next to the Zalo vars)
- Modify: `apps/api/src/auth/zalo.ts` (`fetchZaloProfile`, `requestZaloProfile`)
- Modify: `apps/api/src/auth/routes.ts:215` (pass `c.env`)
- Test: `apps/api/test/zalo-relay.test.ts` (new)

**Interfaces:**
- Produces: `fetchZaloProfile(accessToken: string, env?: Pick<Env, 'ZALO_RELAY_URL' | 'ZALO_RELAY_SECRET'>): Promise<{ sub; name; avatarUrl; nameWithheld? }>` — same return shape as today.

- [ ] **Step 1: Write the failing tests** in `test/zalo-relay.test.ts`, mocking `globalThis.fetch` like `zalo-client.test.ts`, with `relayEnv = { ZALO_RELAY_URL: 'https://relay.example', ZALO_RELAY_SECRET: 's3cret' }`:
  - Relay OK (`{ id: '123', name: 'An', picture: { data: { url: 'https://a/p.jpg' } } }`) → `{ sub: '123', name: 'An', avatarUrl: 'https://a/p.jpg' }`, no `nameWithheld`; exactly one fetch, to `https://relay.example/me?fields=id,name,picture`, with `Authorization: Bearer s3cret` and `X-Zalo-Access-Token: tok`, and **no** `access_token` header.
  - `ZALO_RELAY_URL: 'https://relay.example/'` → URL is `https://relay.example/me?fields=id,name,picture`.
  - Relay 200 with `{ id: '123' }` only → `name: 'Zalo'`, `nameWithheld: true`, no direct call.
  - Relay 502 → falls back: next calls go to `https://graph.zalo.me/v2.0/me?fields=id,name,picture` with `access_token: tok`; result from the direct path.
  - Relay fetch rejects (network / timeout) → falls back the same way.
  - Relay 200 with `{ error: -501, message: 'IP address not inside Vietnam' }` → falls back.
  - Only one of the two env vars set, neither, or `env` omitted → relay never called; behaviour identical to today.
  - On fallback, `console.warn` is called once and none of its arguments contains `tok` or `s3cret`.

- [ ] **Step 2: Run** `npm test -w @fsl/api -- zalo-relay` → FAIL.

- [ ] **Step 3: Implement.** Split the response checks in `requestZaloProfile` into a shared `parseZaloProfile(res: Response): Promise<ZaloProfileResponse>` (throws `ZaloError`, as today). Add `requestViaRelay(env, accessToken)` using `AbortSignal.timeout(3000)` and that parser. In `fetchZaloProfile`, when both env vars are non-empty, try the relay; on any error `console.warn('Zalo relay failed, calling Zalo directly: ' + err.message)` and continue with the existing direct path unchanged. On relay success, set `nameWithheld` when the name is empty. Update `routes.ts` to `fetchZaloProfile(accessToken, c.env)`. Existing tests call it without `env` and keep passing untouched.

- [ ] **Step 4: Run** `npm test -w @fsl/api` and `npm run typecheck` → PASS (all existing Zalo tests still green).

- [ ] **Step 5: Commit** `feat(api): fetch the Zalo profile through the DSM relay when configured`

### Task 5: Setup docs

**Files:**
- Modify: `docs/setup.md` (new `### 2.2 Zalo profile relay on a Synology DSM (optional)` after 2.1; one row each for `ZALO_RELAY_URL` (unticked) and `ZALO_RELAY_SECRET` (ticked) wherever 4.5 / other sections list Zalo vars; a troubleshooting entry for "Zalo users show up as 'Zalo'")
- Modify: `README.md` only if it lists env vars

- [ ] **Step 1: Write section 2.2**, in the same tone as 2.1, covering in order:
  - Why: Zalo withholds name/avatar outside Vietnam.
  - Make the GHCR package public: once, after the first workflow run.
  - Certificate: Control Panel → Security → Certificate, Let's Encrypt, with `zalo-relay.<name>.diskstation.me` (or a `*.<name>.diskstation.me` wildcard) as a SAN.
  - Reverse proxy: Control Panel → Login Portal → Advanced → Reverse Proxy, HTTPS `zalo-relay.<name>.diskstation.me:443` → HTTP `localhost:<RELAY_PORT>`, plus assigning the certificate to it.
  - Container Manager: Project → Create from `compose.yaml`, `.env` from `.env.example` with a secret from `openssl rand -hex 32`.
  - Check: `curl https://zalo-relay.<name>.diskstation.me/health`.
  - Worker: `wrangler secret put ZALO_RELAY_URL` / `ZALO_RELAY_SECRET` and the same keys in `apps/api/.dev.vars`.
  - Updates: automatic within ~15 minutes after merging to `main`; `RELAY_TAG=edge` to try a branch build from a manual workflow run.
  - Rollback: delete the two Worker secrets.

- [ ] **Step 2: Commit** `docs(setup): Zalo profile relay on a Synology DSM`

### Task 6: Validate on the real DSM, then open the PR

Manual, with the owner. Follow the spec's "Validation on the real DSM" section step by step; Claude runs the outside-network `curl` checks and reads the logs the owner pastes.

- [ ] **Step 1:** Push the branch and run `zalo-relay.yml` by hand on it (`gh workflow run zalo-relay.yml --ref <branch>`). Confirm `:edge` exists with amd64 + arm64 (`docker buildx imagetools inspect ghcr.io/nguyenvunhan/coin-crew-zalo-relay:edge`), then make the package public.
- [ ] **Step 2:** The owner follows `docs/setup.md` 2.2 word for word with `RELAY_TAG=edge`. Fix any wrong or missing step in the doc and commit.
- [ ] **Step 3:** Outside-network checks: `/health` → 200 with a valid cert; `/me` without or with a wrong secret → 401; `fields=email` → 400; `/nope` → 404; the relay port isn't reachable except through 443.
- [ ] **Step 4:** `npm run tunnel` with the relay vars in `.dev.vars`; Zalo sign-in shows the real name and avatar; the relay log shows `GET /me 200`.
- [ ] **Step 5:** Stop the relay container; Zalo sign-in still works; the Worker logs one relay warning; restart the container.
- [ ] **Step 6:** The relay log and the DSM reverse proxy log contain no token and no secret.
- [ ] **Step 7:** Push a trivial relay change, rerun the workflow on the branch, and confirm the updater replaced the container within ~15 minutes while `/health` still answers.
- [ ] **Step 8:** Set `RELAY_TAG=latest` in the DSM `.env`.
- [ ] **Step 9:** Run `npm run typecheck`, `npm test` and `npm run e2e` → all green. Open the PR (per the finish-branch routine). The PR description has the validation results and a post-merge checklist: `latest` arrived on the DSM, Worker secrets set on prod, prod Zalo sign-in shows the real name.
