# Setting up Coin Crew from scratch

This guide takes you from an empty machine to the app running on your computer and live on Cloudflare, deployed from GitHub on every push to `main`. Everything fits in the free plans of Cloudflare, Google Cloud and GitHub.

You need accounts on GitHub, Cloudflare and Google Cloud. Allow about 30 minutes.

The live deployment's own values (database ID, public address, Google credentials) live in Cloudflare and in a git-ignored local file, never in the repo:

| Name | Used by | Where it is set |
|---|---|---|
| `D1_DATABASE_ID` | Deploys and remote migrations | Cloudflare build variable; your shell for remote migrations |
| `APP_ORIGIN` | Google sign-in redirect | Cloudflare runtime variable (Text); `apps/api/.dev.vars` locally |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in | Cloudflare secrets; `apps/api/.dev.vars` locally |
| `CF_API_TOKEN`, `CF_ACCOUNT_ID`, `OPS_ALERT_WEBHOOK_URL` | Optional usage alerts | Cloudflare secrets |

## 1. Prerequisites

- **Node.js 24** (comes with npm 11) and **Git**.
- **Google Chrome**, only for the end-to-end test. Playwright uses your installed Chrome instead of downloading a browser.

```bash
git clone https://github.com/NguyenVuNhan/coin-crew.git
```

```bash
cd coin-crew && npm install
```

## 2. Google sign-in (OAuth client)

Members sign in with Google; guests never do. The app asks only for `openid`, `email` and `profile`, which Google treats as non-sensitive, so no verification review is needed. One OAuth client can serve both your machine and the live app.

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create a project (or pick one).
2. Go to **Google Auth Platform** (formerly *APIs & Services → OAuth consent screen*) and click **Get started**:
   - App name and support email: anything you like.
   - Audience: **External**.
3. Under **Data access**, add only the scopes `openid`, `.../auth/userinfo.email` and `.../auth/userinfo.profile`.
4. Under **Audience**, either add the Google accounts that will sign in as **test users**, or click **Publish app** so any Google account can sign in. While the app is in *Testing*, everyone else gets "Access blocked".
5. Under **Clients**, click **Create client**:
   - Application type: **Web application**.
   - Authorised redirect URIs:
     - `http://localhost:8787/api/auth/google/callback` (your machine)
     - `https://<your app address>/api/auth/google/callback` (the live app; add it once you know the address in step 4.2)
6. Copy the **Client ID** and **Client secret** straight away. Google may not show the secret again; if you lose it, add a new secret to the client.

### 2.1 Zalo sign-in (optional)

The Zalo buttons stay hidden until both secrets exist, so you can deploy first and set Zalo up later.

1. Create an app at [developers.zalo.me](https://developers.zalo.me/) and enable Social API / "Đăng nhập với Zalo".
2. Verify each domain with the **meta tag** method ("Thêm thẻ meta vào trang chủ"). The tag is `zalo-platform-site-verification` in `apps/web/index.html`. Zalo's verifier file (`apps/web/public/zalo_verifier….html`) is there too as a backup, but Cloudflare answers its `.html` address with a 307 to the same path without `.html`, so that method passes only if Zalo follows the redirect. Its token belongs to the Zalo app, so the same tag verifies every domain the site runs on. Keep it after verification. A `*.workers.dev` domain cannot take a DNS TXT record, and Zalo reads the tag from `https://<domain>/`, so a domain verifies only once a build with the tag is live there:
   - `coincrew.nvnlab.workers.dev`: after a deploy that contains the tag.
   - `sawfish-dear-heron.ngrok-free.app`: while `npm run tunnel` runs.
   - `localhost`: Zalo cannot reach it, so it cannot be verified. Test Zalo sign-in on your machine through the tunnel.
3. Register the callback URL `<APP_ORIGIN>/api/auth/zalo/callback` for each verified domain, for example `https://coincrew.nvnlab.workers.dev/api/auth/zalo/callback` and `https://sawfish-dear-heron.ngrok-free.app/api/auth/zalo/callback`.
4. Activate the app for public use. In development mode only the app's admins and testers can sign in.
5. Run `wrangler secret put ZALO_APP_ID` and `wrangler secret put ZALO_APP_SECRET` for the live app, and add `ZALO_APP_ID` and `ZALO_APP_SECRET` to `apps/api/.dev.vars` for your machine (the tunnel uses them too; restart `npm run tunnel` after adding them).

## 3. Run it on your machine

Create `apps/api/.dev.vars` (git-ignored; `wrangler dev` reads it):

```
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-secret
APP_ORIGIN=http://localhost:8787
```

`APP_ORIGIN` is required here: `wrangler.jsonc` deliberately has no value for it, and without it Google sign-in breaks.

Create the local database (it lives under `apps/api/.wrangler/`; the placeholder database ID in `wrangler.jsonc` is fine locally):

```bash
npx -w @fsl/api wrangler d1 migrations apply fsl --local
```

Build the web app and start the Worker on http://localhost:8787:

```bash
npm run dev
```

For front-end work with hot reload, run `npm run dev -w @fsl/api` and `npm run dev -w @fsl/web` side by side, and open http://localhost:5173 (it proxies `/api` to port 8787).

Check everything passes:

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npm run e2e
```

`npm test` runs the core, API (inside the Workers runtime with a local D1) and web suites. `npm run e2e` builds the app, starts `wrangler dev` with a fresh database and a test-only sign-in shortcut, and walks the golden path in Chrome at 375×812.

## 4. Deploy to Cloudflare

### 4.1 Create the database

1. In the [Cloudflare dashboard](https://dash.cloudflare.com/), go to **Storage & databases → D1 SQL database → Create database**.
2. Name it `fsl` (the name the config uses). Pick a location near your users, such as Asia-Pacific.
3. Copy its **Database ID**. This is your `D1_DATABASE_ID`.

Leave `apps/api/wrangler.jsonc` as it is. It keeps the placeholder ID `00000000-0000-0000-0000-000000000000`, and deploys swap in the real one (see 4.4).

### 4.2 Work out the app's address

Open **Workers & Pages**. The overview shows your account's `<subdomain>.workers.dev`. The app will run at:

```
https://coin-crew.<subdomain>.workers.dev
```

This is your `APP_ORIGIN`: `https`, no trailing slash. Go back to the Google OAuth client (step 2.5) and add `https://coin-crew.<subdomain>.workers.dev/api/auth/google/callback` as a redirect URI.

### 4.3 Create the tables

From your machine, log in to Cloudflare once (this opens a browser):

```bash
npx wrangler login
```

Set the database ID in your shell. In PowerShell:

```powershell
$env:D1_DATABASE_ID = "<your database id>"
```

In bash:

```bash
export D1_DATABASE_ID=<your database id>
```

Then apply the migrations to the live database:

```bash
npm run db:migrate:remote -w @fsl/api
```

This writes a git-ignored `apps/api/wrangler.deploy.jsonc` with the real ID and runs `wrangler d1 migrations apply fsl --remote` against it.

### 4.4 Deploy from GitHub (Workers Builds)

In **Workers & Pages → Create application**, choose **Continue with GitHub** (authorise the Cloudflare GitHub app the first time), pick the repo and click **Next**. Then fill in:

| Field | Value |
|---|---|
| Project name | `coin-crew`. It must match `name` in `apps/api/wrangler.jsonc`; if you choose another name, change it there too, and your address in 4.2 changes with it. |
| Build command | `npm run build -w @fsl/web` |
| Deploy command | `npm run deploy -w @fsl/api` (replace the default `npx wrangler deploy`) |
| Preview command | Leave it; it's unused with preview builds off. |
| Enable Preview builds | **Off.** A preview would use the live database, and Google sign-in always returns to the main address. |
| Protect with Cloudflare Access | **Off.** Friends open group links without signing in. |
| Advanced settings → Path | Leave it at `/` (the repo root). The lockfile and npm workspaces live there. |
| Advanced settings → API token | Leave **Create new token**. The token it creates includes D1 Storage (edit). |
| Advanced settings → Variable name / value | `D1_DATABASE_ID` = your database ID. It isn't a secret, so you don't need to encrypt it. |

Click **Deploy**. The build page shows the log: it installs with `npm clean-install` at the repo root on Node 24, builds the web app, then `npm run deploy -w @fsl/api` writes `wrangler.deploy.jsonc` with the real ID from `D1_DATABASE_ID`, applies any pending D1 migrations (`wrangler d1 migrations apply fsl --remote`), and runs `wrangler deploy` with it. The log ends with the Worker's address, the hourly cron (`0 * * * *`) and "Success! Build completed."

### 4.5 Add the runtime variables and secrets

Open the Worker, go to **Settings → Runtime variables and secrets → Add variable**, keep **Production** ticked, and add:

| Key | Secret box | Value |
|---|---|---|
| `APP_ORIGIN` | unticked | `https://coin-crew.<subdomain>.workers.dev` |
| `GOOGLE_CLIENT_ID` | ticked | From step 2.6 |
| `GOOGLE_CLIENT_SECRET` | ticked | From step 2.6 |

Click **Add variable and deploy**. The dashboard then suggests copying `APP_ORIGIN` into your Wrangler configuration; ignore it, because the address deliberately stays out of the repo. `keep_vars: true` in `wrangler.jsonc` stops later deploys from removing it, and secrets are always kept.

You can set the two Google values from a terminal instead; each command asks for the value:

```bash
npx -w @fsl/api wrangler secret put GOOGLE_CLIENT_ID
```

```bash
npx -w @fsl/api wrangler secret put GOOGLE_CLIENT_SECRET
```

Never add `E2E_LOGIN`. It turns on a sign-in shortcut meant only for local test runs.

### 4.6 Check it works

1. `https://coin-crew.<subdomain>.workers.dev/api/health` returns `{"ok":true}`.
2. `https://coin-crew.<subdomain>.workers.dev/api/auth/google/start` redirects to `accounts.google.com` with your `client_id` (not `undefined`) and `redirect_uri` set to your address plus `/api/auth/google/callback`.
3. Open the app, sign in with Google, and create a trip.
4. Open the trip's group link in a private window and pick a name, as a guest would.

### 4.7 Optional: usage alerts

An hourly cron compares today's Workers requests and D1 rows with the free-plan limits in `apps/api/src/ops/usage.ts`, and posts once per metric per day to a webhook at 80%. To turn it on, add these as Secrets on the Worker:

- `CF_API_TOKEN`: an API token with **Account Analytics: Read**.
- `CF_ACCOUNT_ID`: your account ID (shown by `npx wrangler whoami`).
- `OPS_ALERT_WEBHOOK_URL`: any endpoint that accepts `{ "text": "…" }`, such as a Slack or Discord-compatible webhook.

## 5. Day to day

- **Pull requests** run GitHub Actions (`.github/workflows/ci.yml`): typecheck and unit tests in one job, the end-to-end golden path in another. Failed e2e runs keep their Playwright traces as an artifact.
- **Merging to `main`** automatically applies any pending D1 migrations and deploys the Worker through Workers Builds.
- **Changing the database schema:**
  1. Edit `apps/api/src/db/schema.ts`.
  2. Generate a migration and commit it:
     ```bash
     npx -w @fsl/api drizzle-kit generate
     ```
  3. Merging to `main` runs `npm run deploy -w @fsl/api`, which applies any unapplied migrations to the live database before deploying the new Worker. Keep migrations additive so the currently running version keeps working while the deploy completes. You can also apply migrations manually at any time with `D1_DATABASE_ID` set:
     ```bash
     npm run db:migrate:remote -w @fsl/api
     ```
- **Deploying by hand**, with `D1_DATABASE_ID` set (also applies pending remote migrations first):
  ```bash
  npm run build -w @fsl/web && npm run deploy -w @fsl/api
  ```

## 6. Troubleshooting

| What you see | What to do |
|---|---|
| Build log: `D1_DATABASE_ID is missing or not a database ID` | Add the build variable under **Settings → Build → Variables and secrets**, then retry the build. |
| Build fails with a D1 permission or authentication error (codes such as 7403 or 10000) | You picked an existing API token instead of **Create new token**. Give it **Account · D1 Storage · Edit** under **Settings → Build → API token**. |
| Google: `client_id=undefined` in the sign-in redirect | `GOOGLE_CLIENT_ID` isn't set on the Worker (step 4.5). |
| Build says the Worker name doesn't match | The project name must equal `name` in `apps/api/wrangler.jsonc`. |
| `/api/health` works but other API calls fail with `no such table` | The migrations weren't applied to the live database. Run step 4.3. |
| Google: `Error 400: redirect_uri_mismatch` | The redirect URI registered in Google must be exactly `APP_ORIGIN` + `/api/auth/google/callback`, with `https` and no trailing slash. |
| Google: the redirect URI starts with `undefined` | `APP_ORIGIN` isn't set on the Worker (step 4.5), or locally in `.dev.vars`. |
| Google: "Access blocked" or "app is being tested" | Add the account as a test user, or publish the app (step 2.4). |
| Signing in on your machine lands on the live site | `apps/api/.dev.vars` is missing `APP_ORIGIN=http://localhost:8787`. |
| Variables disappear after a deploy | `keep_vars` must stay `true` in `apps/api/wrangler.jsonc`. |
