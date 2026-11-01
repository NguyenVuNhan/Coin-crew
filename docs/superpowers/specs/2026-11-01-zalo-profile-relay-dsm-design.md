# Zalo profile relay on the home DSM

Status: approved, 2026-11-01

## Why

Zalo's profile API (`graph.zalo.me/v2.0/me`) refuses personal fields to callers outside Vietnam
("Personal information is limited due to IP address not inside Vietnam"). The prod Worker calls from
Cloudflare IPs, so since #28 every Zalo sign-in works but lands with the placeholder name "Zalo" and no
avatar. The owner has a Synology DSM at home on a Vietnamese connection. Routing just that one call
through the DSM brings real names and avatars back without moving the app.

This is **step 1 of 2**. Step 2 (separate design, later) moves the whole app and its data to the DSM or a
Vietnamese provider for data protection. Step 1 should leave the DSM ready for that: reachable over HTTPS
on a subdomain, behind the DSM reverse proxy, fed images from GitHub.

## Goals

- A Zalo sign-in on prod shows the user's real name and avatar.
- Only the profile call goes through the DSM. Authorize and token exchange stay as they are.
- The relay updates itself on the DSM after a merge to `main`, with no manual step and no inbound access
  from GitHub to the home network.

## Non-goals

- Moving the app, database or any other traffic off Cloudflare (that's step 2).
- Proxying the token exchange or any other Zalo endpoint.
- A general-purpose proxy.

## Anti-goals (failure even if it "works")

- Sign-in depends on the DSM: if the relay is down, slow or misconfigured, Zalo sign-in must still work
  exactly as today (id-only fallback).
- The relay is an open proxy, or can be called by anyone without the shared secret.
- A Zalo access token or the shared secret ends up in a URL, a log line (relay, DSM reverse proxy,
  Worker), or the container image.
- New inbound ports on the home router, or SSH exposed for deployment.

## Constraints

- Router forwards 443 to the DSM; 443 is already used by other sites on the DSM, so the relay shares it
  via a hostname rule in the DSM reverse proxy (Control Panel → Login Portal → Advanced → Reverse Proxy).
- DSM is reachable via Synology DDNS under `diskstation.me`. The relay gets a sub-subdomain, e.g.
  `zalo-relay.<name>.diskstation.me`.
- Certificate: DSM's Let's Encrypt for Synology DDNS names supports a wildcard SAN
  (`*.<name>.synology.me`). Sources only confirm this for `synology.me`; **verify it for
  `diskstation.me`** during setup. Fallback: add `zalo-relay.<name>.diskstation.me` as an explicit SAN.
  Sub-subdomains of the DDNS name resolve to the DSM: the owner already runs several sites this way, so
  no hostname fallback is needed.
- DSM has Container Manager (Docker + compose projects).
- Repo is `github.com/NguyenVuNhan/coin-crew`, an npm workspaces monorepo, Node 24, Hono in `apps/api`.

## Decided

**Relay service — `apps/zalo-relay`**
- Node 24 + Hono, its own workspace package, minimal dependencies.
- `GET /me?fields=<f>`: `fields` limited to an allowlist (`id`, `id,name,picture`). Reads the Zalo token
  from the `X-Zalo-Access-Token` request header (not `access_token`: the DSM reverse proxy is nginx, which
  drops headers containing underscores by default) and calls only `https://graph.zalo.me/v2.0/me` with it in the
  `access_token` header. The upstream URL is hard-coded, not taken from the request. Returns Zalo's status
  and JSON body unchanged.
- `GET /health`: `200 ok`, no auth, no upstream call.
- Every other path: 404.
- Auth: `Authorization: Bearer <ZALO_RELAY_SECRET>`, constant-time comparison; wrong or missing → 401
  before anything else happens. Secret comes from the container environment (`.env` on the DSM).
- Upstream timeout ~5 s.
- Logs: method, path, status, duration only. Never headers, query values or bodies.
- Listens on `0.0.0.0:8080` in the container; compose maps it to `127.0.0.1:<port>` on the DSM so only
  the reverse proxy can reach it.

**Image and deployment**
- `apps/zalo-relay/Dockerfile` (multi-stage, small Node 24 base, non-root user).
- GitHub Action `.github/workflows/zalo-relay.yml`: on push to `main` touching `apps/zalo-relay/**` (and
  `workflow_dispatch`), run the relay's tests, build, and push to
  `ghcr.io/nguyenvunhan/coin-crew-zalo-relay` tagged `latest` and the commit SHA, built for both
  `linux/amd64` and `linux/arm64` (DSM models differ). The image contains no
  secrets, so the package is public: the DSM pulls with no registry credentials.
- `apps/zalo-relay/compose.yaml` for Container Manager: the relay (image from GHCR, `restart:
  unless-stopped`, `env_file: .env`) plus an auto-updater (Watchtower or a maintained equivalent) scoped
  by label to the relay container only, polling about every 15 minutes, cleaning old images.
- Updates are automatic after merge to `main` (owner's choice).
- The same workflow can be run by hand (`workflow_dispatch`) on any branch; it then pushes the moving tag
  `edge` (plus the SHA) instead of `latest`. This is how a PR's relay gets onto the real DSM before merge
  (see "Validation on the real DSM"). The image tag is set by `RELAY_TAG` in the DSM `.env`, default
  `latest`.

**Worker change — `apps/api/src/auth/zalo.ts`**
- New optional env: `ZALO_RELAY_URL` (e.g. `https://zalo-relay.<name>.diskstation.me`) and
  `ZALO_RELAY_SECRET`. Add to `apps/api/src/env.ts` alongside the other optional Zalo vars.
- When both are set, `fetchZaloProfile` first asks the relay for `id,name,picture` (timeout 3 s).
  Relay success → use it, `nameWithheld` not set.
- Any relay failure (network, timeout, non-2xx, bad JSON, Zalo error in the body) → log one warning
  without the token, then run today's direct path unchanged (full fields, then id only).
- When either var is unset → today's behaviour exactly. Rollback = delete the secrets.

**Docs**
- New section in `docs/setup.md` (e.g. 2.2 "Zalo profile relay on a Synology DSM"): DDNS sub-subdomain,
  certificate, reverse proxy rule, Container Manager project from `compose.yaml`, `.env` with a generated
  secret, setting `ZALO_RELAY_URL`/`ZALO_RELAY_SECRET` as Worker secrets, and how to check it
  (`/health`, then a real Zalo sign-in).
- `ZALO_RELAY_*` noted wherever env vars are listed.

**Tests** (unit, Vitest like the rest of the repo)
- Relay: missing/wrong secret → 401 with no upstream call; disallowed `fields` → 400; only the
  hard-coded upstream is called, token passed via header; `/health` works without auth; unknown path 404.
- Worker: relay configured and OK → real name/avatar; relay fails/times out → falls back to direct path;
  relay not configured → relay never called.

## Validation on the real DSM (before the PR is merged)

Unit tests and CI are not enough; the PR stays open until the owner and Claude have walked through these on
the real DSM and the results are written in the PR description. Note: the owner's PC is in Vietnam, so a
local sign-in would succeed even without the relay. Steps 4–5 therefore prove the relay was used by its log,
not by the name alone.

1. **Image from the branch.** Run the relay workflow by hand on the PR branch. Check that
   `ghcr.io/nguyenvunhan/coin-crew-zalo-relay:edge` exists, is public, and has amd64 and arm64.
2. **DSM setup by following the new `docs/setup.md` section word for word** with `RELAY_TAG=edge`:
   certificate, reverse proxy rule for `zalo-relay.<name>.diskstation.me`, Container Manager project,
   `.env` with a generated secret. Any step that's wrong or missing in the doc gets fixed in the PR.
3. **From outside the home network** (e.g. phone on mobile data, or Claude's machine via curl):
   - `GET /health` → 200 over HTTPS with a valid certificate.
   - `GET /me` with no secret, and with a wrong secret → 401.
   - `GET /me?fields=email` with the right secret → 400.
   - Any other path → 404.
   - The relay port is not reachable directly from outside (only through 443).
4. **Real sign-in through the relay.** Run `npm run tunnel` with `ZALO_RELAY_URL`/`ZALO_RELAY_SECRET`
   in `apps/api/.dev.vars`, sign in with Zalo on the ngrok address. Expected: real name and avatar, and a
   `GET /me 200` line in the relay's container log.
5. **Fallback.** Stop the relay container and sign in with Zalo again. Sign-in still succeeds (direct path),
   the Worker logs one relay warning, and nothing hangs beyond the 3 s timeout. Start the container again.
6. **No secrets in logs.** Read the relay container log and the DSM reverse proxy log: no Zalo token and no
   relay secret anywhere.
7. **Auto-update.** Run the workflow on the branch once more (any trivial change). Within about 15 minutes
   the updater replaces the relay container with the new `edge` image, and `/health` still answers.
8. **Back to `latest`.** Set `RELAY_TAG=latest` in the DSM `.env` and note in the PR that this takes
   effect once the merge publishes `latest`.

After merge (not blocking the PR): confirm the `latest` image arrived on the DSM, set
`ZALO_RELAY_URL`/`ZALO_RELAY_SECRET` as Worker secrets on prod, and sign in with Zalo on prod. Real name
and avatar = step 1 done.

## Left to the builder

- Exact host port, base image, Hono adapter (`@hono/node-server`), and how the relay package plugs into
  the root `npm test` / CI.
- Whether the Worker's relay call lives in `zalo.ts` or a small helper module.
- Choice of auto-updater image and its exact labels/flags, as long as it only touches the relay.
- Wording and screenshots-free structure of the setup section.
