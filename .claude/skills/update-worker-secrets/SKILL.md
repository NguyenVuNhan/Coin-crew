---
name: update-worker-secrets
description: Use when setting, changing, rotating, listing or removing secrets on the prod Cloudflare Worker (coin-crew) — ZALO_RELAY_URL, ZALO_RELAY_SECRET, ZALO_APP_ID, ZALO_APP_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, CF_API_TOKEN, CF_ACCOUNT_ID, OPS_ALERT_WEBHOOK_URL — or when Zalo users show up as "Zalo" on prod and the relay secrets may be missing.
---

# Update the Worker's secrets

Secrets live on the Worker `coin-crew` (`apps/api/wrangler.jsonc`), not in the repo. Every `secret put`/`delete` deploys a new Worker version immediately, so it is a prod change.

## Which keys

| Key | Kind | Notes |
|---|---|---|
| `ZALO_RELAY_URL`, `ZALO_RELAY_SECRET` | secret | Relay on the DSM, `docs/setup.md` §2.2. Secret must equal `ZALO_RELAY_SECRET` in the DSM `.env`. |
| `ZALO_APP_ID`, `ZALO_APP_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | secret | Sign-in. |
| `CF_API_TOKEN`, `CF_ACCOUNT_ID`, `OPS_ALERT_WEBHOOK_URL` | secret | Usage alerts, §4.7. |
| `APP_ORIGIN` | plain var | Dashboard → Settings → Variables. Not a secret; don't `secret put` it. |
| `E2E_LOGIN` | **never on prod** | Turns on a sign-in shortcut. Refuse, even if asked. |

## Procedure

1. **Check the account:** `npx -w @fsl/api wrangler whoami`. Not logged in → ask the user to run `! npx -w @fsl/api wrangler login`.
2. **Confirm with the user** which keys will change on prod and where each value comes from (`apps/api/.dev.vars`, a new random value, or the user). If the user's request already names every key and its source, that request is the yes; otherwise ask and wait. Deletes always need their own yes.
3. **Never show a value.** Not in chat, not in a command line, not via `cat`/`echo` of `.dev.vars`. Pipe it into wrangler (no TTY → it reads stdin):

   ```bash
   # from .dev.vars (strip CR and surrounding quotes)
   sed -n 's/^ZALO_RELAY_URL=//p' apps/api/.dev.vars | tr -d '\r' | sed 's/^"\(.*\)"$/\1/' \
     | npx -w @fsl/api wrangler secret put ZALO_RELAY_URL
   # a new random secret
   NEW=$(openssl rand -hex 32); printf %s "$NEW" | npx -w @fsl/api wrangler secret put ZALO_RELAY_SECRET
   ```
   Check the key exists and is non-empty first: `grep -c '^KEY=.' apps/api/.dev.vars` → `1`.
4. **Verify:** `npx -w @fsl/api wrangler secret list` shows the names. For the relay keys, also have the user sign in with Zalo on prod and check the relay log in Container Manager for `GET /me 200`; real name and avatar should appear.
5. **Remove** (rollback): `npx -w @fsl/api wrangler secret delete KEY` — confirm with the user first.

## Rotating `ZALO_RELAY_SECRET`

Two sides must match: the DSM `.env` (user edits it in Container Manager, then restarts the project) and the Worker. While they differ the relay answers 401 and the Worker falls back to calling Zalo directly — sign-in keeps working, prod names show as "Zalo" for that minute. So:

1. Generate `NEW` as above; put it on the Worker by stdin.
2. Give the value to the user **only** by writing it into `apps/api/.dev.vars` (replace the line) so they can copy it into the DSM `.env`; say where it is, don't print it.
3. User updates the DSM `.env` and restarts the project; restart `npm run tunnel` if running.
4. Verify as in step 4.

## Common mistakes

- `wrangler secret put KEY` can't prompt in a non-interactive shell — always pipe the value in.
- `.dev.vars` written on Windows has `\r` line endings; without `tr -d '\r'` the secret gets a trailing CR and the relay rejects it (401).
- Running wrangler from the repo root without `-w @fsl/api` misses `wrangler.jsonc` and targets the wrong Worker.
