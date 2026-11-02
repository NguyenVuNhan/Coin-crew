# Anonymous Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In-app anonymous feedback (signed-in users and guests) stored in D1, forwarded to a Google Sheet via Apps Script, digested weekly by Gemini.

**Architecture:** `POST /api/feedback` validates and inserts an identity-free row into D1, then forwards it to an Apps Script web app in the background; the existing hourly cron retries undelivered rows and clears old rate-limit buckets. The web app adds a `FeedbackSheet` opened from the account menu and from the guest trip header. The Apps Script appends rows to the Sheet and emails a weekly table that a Gemini scheduled action summarises.

**Tech Stack:** Cloudflare Workers + D1 (drizzle, hand-written SQL migrations), Hono, vitest + `cloudflare:test`; React + react-router + TanStack Query, shadcn/ui + Tailwind v4, Testing Library; Google Apps Script.

**Spec:** `docs/superpowers/specs/2026-11-01-anonymous-feedback-design.md`

## Global Constraints

- Nothing that leaves D1 (Sheet payload) contains user id, device hash, IP, trip id, guest token, or URL.
- `created_at` stored and sent **rounded down to the hour** (`YYYY-MM-DDTHH:00:00.000Z`).
- Message: trimmed, 1–2000 chars. Type: `bug` | `idea` | `other` | null.
- Rate limit: 5 per device per hour; global 100 per hour → 429 `RATE_LIMITED`.
- Contact (only when `contactMe: true`): signed-in → built on server: `name` + ` <email>` if email, else `name (Zalo)`. Guest → client `contactText` trimmed, ≤100 chars, null if empty. Never `zaloSub` or user id.
- API responds after the D1 insert; never waits on Google.
- New optional secrets: `FEEDBACK_SHEET_WEBHOOK_URL`, `FEEDBACK_SHEET_TOKEN`. Unset → rows stay in D1.
- UI rules from `CLAUDE.md`: app wrappers (`Sheet`, `Button`, `Snackbar`, `InlineError`, `Icon`), theme tokens only, `text-base` fields, `min-h-11` targets, `fsl-*` classes + `data-testid` on new elements. All copy in both `en.ts` and `vi.ts`.
- Delegation per user CLAUDE.md: routine tasks → Gemini Flash via Orca worktree; planner reviews, runs tests.

## Review Focus

1. **Whitespace-only message** — rejected with 422 on the server and Send disabled on the client (Task 1 test `rejects blank message`; Task 4 test `send disabled for whitespace`).
2. **Guest ticks "contact me" but leaves the field empty** — stored as `contact = null`, not an empty string (Task 1 test `guest empty contact text becomes null`).
3. **Signed-in user sends `contactText` pretending to be someone else** — server ignores `contactText` for signed-in users (Task 1 test `signed-in contact ignores client text`).
4. **Apps Script returns non-2xx or throws** — row stays `delivered_at IS NULL`, request still 201, cron retries (Task 2 tests `failed delivery leaves row undelivered`, `retry sends undelivered rows`).
5. **Sheet closed mid-typing, reopened** — draft restored; storage throwing doesn't break the sheet (Task 4 tests `restores draft`, `works when localStorage throws`).

---

### Task 1: Feedback table, rate limit and `POST /api/feedback`

**Files:**
- Create: `apps/api/migrations/0013_feedback.sql`
- Modify: `apps/api/src/db/schema.ts` (append two tables)
- Modify: `packages/core/src/api-types.ts` (append types)
- Create: `apps/api/src/feedback/routes.ts`, `apps/api/src/feedback/time.ts`, `apps/api/src/feedback/rateLimit.ts`
- Modify: `apps/api/src/app.ts` (register `feedbackRoutes()` under `/api`)
- Test: `apps/api/test/feedback.test.ts`

**Interfaces:**
- Produces (core):
  ```ts
  export type FeedbackType = 'bug' | 'idea' | 'other';
  export interface FeedbackRequest {
    message: string; type: FeedbackType | null; screen: string;
    device: 'phone' | 'desktop'; lang: 'vi' | 'en'; appVersion: string;
    contactMe: boolean; contactText?: string;
  }
  ```
- Produces (api): `feedbackRoutes(): Hono<AppBindings>`; `hourBucket(d: Date): string`; `checkFeedbackRate(db: Db, deviceHash: string, now: Date): Promise<void>` (throws `ApiError('RATE_LIMITED', 429, …)`); drizzle tables `feedback` and `feedbackRate`.
- `feedback` columns: `id` text pk (uuid), `type` text null, `message` text, `screen` text, `device` text, `lang` text, `app_version` text, `contact` text null, `created_at` text, `delivered_at` text null; index on `delivered_at`.
- `feedback_rate` columns: `key` text pk (`sha256Hex(deviceHash + bucket)`), `bucket` text, `count` integer.

- [ ] **Step 1: Write failing tests** in `apps/api/test/feedback.test.ts` using `call`, `memberSid`, `seedUser` from `./helpers`:
  - `stores an anonymous row`: POST valid body as guest → 201 `{ ok: true }`; one row; `contact` null; `created_at` ends with `:00:00.000Z`; row has no column holding the device hash (assert `Object.keys(row)` equals the column list above).
  - `rejects blank message`: `message: '   '` → 422 `VALIDATION`. Also `message` of 2001 chars → 422; bad `type`, `device`, `lang`, `screen` not matching `/^[a-z0-9-]{1,64}$/` → 422.
  - `signed-in contact uses session user`: seed user name `Minh`, email `minh@example.com`, `contactMe: true` → `contact === 'Minh <minh@example.com>'`.
  - `zalo user contact`: user with `email` null → `'Minh (Zalo)'` (seed via direct SQL with `zalo_sub`).
  - `signed-in contact ignores client text`: `contactText: 'Someone else'` → contact still built from session.
  - `guest contact text`: `contactMe: true, contactText: '  An zalo 09x  '` → `'An zalo 09x'`.
  - `guest empty contact text becomes null`: `contactText: '  '` → null. `contactMe: false` with text → null.
  - `rate limits per device`: same `did` cookie, 5 × 201 then 429 `RATE_LIMITED`; a different device still 201.
  - `global hourly cap`: insert 100 rows with current hour bucket directly, next POST → 429.
- [ ] **Step 2: Run** `npm test -w @fsl/api -- feedback` → FAIL (route 404).
- [ ] **Step 3: Implement.** Migration SQL mirrors the drizzle definitions (style of `0012_merge_proposals.sql`). `hourBucket` truncates minutes/seconds/ms in UTC. Route: `parseJson` like `ratings/routes.ts`; validate; `checkFeedbackRate` (upsert count for device key, then count `feedback` rows where `created_at = bucket` ≥ 100 → throw; device count > 5 → throw); user from `getSessionUser(c)`; insert with `newId()`. Return `c.json({ ok: true }, 201)`. (Delivery is added in Task 2.)
- [ ] **Step 4: Run** `npm test -w @fsl/api -- feedback` → PASS; `npm run typecheck -w @fsl/api` → no errors.
- [ ] **Step 5: Commit** `feat(api): anonymous feedback endpoint`.

### Task 2: Forward to the Sheet and retry from the cron

**Files:**
- Create: `apps/api/src/feedback/deliver.ts`
- Modify: `apps/api/src/feedback/routes.ts`, `apps/api/src/index.ts`, `apps/api/src/env.ts`
- Test: `apps/api/test/feedback-deliver.test.ts`

**Interfaces:**
- Consumes: `feedback`, `feedbackRate`, `hourBucket` from Task 1.
- Produces:
  - `deliverFeedback(env: Env, ids: string[]): Promise<void>` — loads rows, POSTs once, sets `delivered_at = nowIso()` on 2xx; swallows errors (logs `console.warn`).
  - `retryUndeliveredFeedback(env: Env, now: Date): Promise<void>` — up to 50 oldest undelivered → `deliverFeedback`; deletes `feedback_rate` rows with `bucket` older than 24h.
  - Webhook body (exact): `{ "token": FEEDBACK_SHEET_TOKEN, "rows": [{ "id", "createdAt", "type", "message", "screen", "device", "lang", "appVersion", "contact" }] }`.
  - `Env` gains `FEEDBACK_SHEET_WEBHOOK_URL?: string; FEEDBACK_SHEET_TOKEN?: string`.

- [ ] **Step 1: Write failing tests** (mock `fetch` like `test/usage.test.ts`, env spread with both secrets):
  - `delivers and marks row`: insert row, `deliverFeedback(env, [id])` → one POST to the URL, body matches the shape above (no extra keys), `delivered_at` set.
  - `failed delivery leaves row undelivered`: webhook 500, and separately fetch throwing → `delivered_at` null, no throw.
  - `no webhook configured`: env without URL → no fetch, row untouched.
  - `retry sends undelivered rows`: two undelivered + one delivered → one POST with 2 rows.
  - `cleans old rate buckets`: bucket 25h old deleted, 1h old kept.
  - `POST /api/feedback still 201 when Sheet down`: route test with webhook 500.
- [ ] **Step 2: Run** `npm test -w @fsl/api -- feedback-deliver` → FAIL.
- [ ] **Step 3: Implement.** In the route, after insert: `const p = deliverFeedback(c.env, [id]); try { c.executionCtx.waitUntil(p) } catch { await p }` (no execution context under `app.request` in tests). In `index.ts` `scheduled`, add `ctx.waitUntil(retryUndeliveredFeedback(env, new Date()))` beside `checkUsage`.
- [ ] **Step 4: Run** `npm test -w @fsl/api` → all PASS; typecheck clean.
- [ ] **Step 5: Commit** `feat(api): forward feedback to Google Sheet with hourly retry`.

### Task 3: Apps Script and setup docs

**Files:**
- Create: `scripts/feedback-apps-script.gs`
- Modify: `docs/setup.md` (new section "4.8 Optional: user feedback to Google Sheet"; add the two secrets to the table at line ~14)

**Interfaces:**
- Consumes: webhook body from Task 2.
- Produces: `doPost(e)` → checks `body.token === PropertiesService.getScriptProperties().getProperty('TOKEN')` (else 403-ish JSON `{ok:false}`), appends each row whose `id` isn't already in column A, returns `{ok:true}`. `sendWeeklyDigest()` → emails `Session.getEffectiveUser().getEmail()` an HTML table of rows with `createdAt` in the last 7 days, subject `CoinCrew feedback – week of <yyyy-MM-dd>`; no email when there are zero rows. Sheet columns in order: `id, createdAt, type, message, screen, device, lang, appVersion, contact`.

- [ ] **Step 1: Write the script** (no automated test; planner reviews by reading).
- [ ] **Step 2: Write the docs section**: create Sheet → Extensions › Apps Script → paste file → set Script Property `TOKEN` → Deploy as web app (Execute as me, Anyone) → put URL/token in Worker secrets → add time-driven trigger for `sendWeeklyDigest` Monday 07:00–08:00, timezone Asia/Ho_Chi_Minh → set up Gemini scheduled action Monday ~08:00 with the prompt copied **verbatim** from the spec's "Google side" step 3. Note token rotation.
- [ ] **Step 3: Manual check** (owner, after deploy): `curl -X POST <url> -d '{"token":"…","rows":[…]}'` adds a row; running `sendWeeklyDigest` from the editor sends the email.
- [ ] **Step 4: Commit** `docs: feedback Apps Script and setup`.

### Task 4: `FeedbackSheet` component and client call

**Files:**
- Create: `apps/web/src/api/feedback.ts`, `apps/web/src/lib/screenName.ts`, `apps/web/src/components/FeedbackSheet.tsx`
- Modify: `apps/web/src/i18n/en.ts`, `apps/web/src/i18n/vi.ts` (new `feedback.*` keys)
- Modify: `apps/web/vite.config.ts` (`define: { __APP_VERSION__: JSON.stringify(<git short sha via execSync, fallback 'dev'>) }`) + a `declare const __APP_VERSION__: string` in `src/vite-env.d.ts` (or existing d.ts)
- Test: `apps/web/src/components/__tests__/feedback-sheet.test.tsx`, `apps/web/src/lib/__tests__/screenName.test.ts`

**Interfaces:**
- Consumes: `FeedbackRequest`, `FeedbackType` from `@fsl/core`.
- Produces:
  - `sendFeedback(body: FeedbackRequest): Promise<void>` via `apiFetch('/api/feedback', { method: 'POST', … })`.
  - `screenName(pathname: string): string` — maps route patterns from `App.tsx` to names: `/`→`landing`, `/trips`→`trips`, `/groups`→`groups`, `/activity`→`my-activity`, `/trips/new`→`create-trip`, `/people/:key`→`person`, `/r/:token`→`request`, `/privacy`→`privacy`, `/me/bank`→`my-bank`, `/t/:id`→`trip`, `/t/:id/<sub>` → `trip-<first sub segment>` (e.g. `trip-expenses`, `trip-people`, `trip-settings`), `/j/:token`→`guest-trip`, `/j/:token/...`→`guest-trip`, anything else → `other`. Never returns ids/tokens.
  - `FeedbackSheet({ open, onClose, signedIn }: { open: boolean; onClose: () => void; signedIn: boolean })`.
- Copy (en / vi):
  - `feedback.menu`: "Send feedback" / "Gửi góp ý"
  - `feedback.title`: "Send feedback" / "Gửi góp ý"
  - `feedback.hint`: "Anonymous — we don't see who you are." / "Ẩn danh — chúng mình không biết bạn là ai."
  - `feedback.bug` / `idea` / `other`: "Bug" "Idea" "Other" / "Lỗi" "Ý tưởng" "Khác"
  - `feedback.placeholder`: "What happened, or what would make CoinCrew better?" / "Có gì chưa ổn, hay điều gì giúp CoinCrew tốt hơn?"
  - `feedback.contactMe`: "You can contact me about this (shares your name)" / "Có thể liên hệ mình về việc này (chia sẻ tên của bạn)"
  - `feedback.contactField`: "Your name or Zalo" / "Tên hoặc Zalo của bạn"
  - `feedback.send`: "Send" / "Gửi"
  - `feedback.thanks`: "Thanks — we read every message." / "Cảm ơn bạn — chúng mình đọc mọi góp ý."
  - `feedback.error`: "Couldn't send. Please try again." / "Chưa gửi được. Vui lòng thử lại."
  - `feedback.rateLimited`: "You've sent a lot just now — try again later." / "Bạn vừa gửi nhiều quá — thử lại sau nhé."
- Draft key: `localStorage['fsl_feedback_draft']` = JSON `{ message, type }`.
- Snackbar: the sheet calls `onClose()` and shows `<Snackbar message={t('feedback.thanks')} />` for 4s — the component owns that state so it outlives the sheet (render Snackbar outside `<Sheet>`).

- [ ] **Step 1: Write failing tests** (`renderAt`, `mockApi` from `src/test/render`):
  - `screenName` table test covering every mapping above, incl. `/t/abc123/expenses/xyz/edit` → `trip-expenses` and `/j/secret-token` → `guest-trip`.
  - `focuses textarea on open` (`data-testid="feedback-message"` has focus).
  - `send disabled for whitespace`.
  - `chips optional and toggle`: no chip pressed initially (`aria-pressed=false`); click Bug → pressed; click again → unpressed.
  - `sends payload`: type "Hello", click Idea, Send → request body `{ message:'Hello', type:'idea', screen:<screenName of route>, device:'phone'|'desktop', lang:'en', appVersion:<string>, contactMe:false }`; `onClose` called; snackbar text shown.
  - `guest contact field`: `signedIn={false}`, tick contact → field `data-testid="feedback-contact-text"` appears; value sent as `contactText`. With `signedIn` true the field never appears.
  - `error keeps text`: API 500 → sheet still open, text kept, `InlineError` with `feedback.error`; 429 → `feedback.rateLimited`.
  - `restores draft`: type, close, reopen → text back; after successful send, reopen → empty.
  - `works when localStorage throws`: stub `localStorage.getItem/setItem` to throw → sheet renders and sends.
- [ ] **Step 2: Run** `npm test -w @fsl/web -- feedback screenName` → FAIL.
- [ ] **Step 3: Implement.** Chips: single-select buttons with `aria-pressed`, pill style via theme tokens (`rounded-full`, `bg-primary text-primary-foreground` when on) — or shadcn `toggle-group` (already in `ui/`) if it fits; textarea: shadcn `ui/textarea` with `text-base`, `maxLength={2000}`, `autoFocus`; checkbox: shadcn `ui/checkbox` + `ui/label`; Send: `Button variant="primary" block loading`. `device` = `window.matchMedia('(min-width: 640px)').matches ? 'desktop' : 'phone'`. Classes `fsl-feedback__*`; testids `feedback-message`, `feedback-type-bug|idea|other`, `feedback-contact`, `feedback-contact-text`, `feedback-send`.
- [ ] **Step 4: Run** `npm test -w @fsl/web` → all PASS (incl. `style-guard`, `ui-components-guard`); `npm run typecheck -w @fsl/web` clean.
- [ ] **Step 5: Commit** `feat(web): feedback sheet`.

### Task 5: Entry points — account menu and guest trip header

**Files:**
- Modify: `apps/web/src/components/AccountMenu.tsx` (new row in `fsl-account-menu__list`, before the Language row; render `<FeedbackSheet signedIn />` as a sibling of the menu so closing the menu doesn't unmount it)
- Modify: `apps/web/src/screens/GuestTrip.tsx` (icon button in `Screen`'s `right` slot, `aria-label={t('feedback.menu')}`, `min-h-11 min-w-11`, opens `<FeedbackSheet signedIn={false} />`)
- Modify: `apps/web/src/components/icons.tsx` (add `messageSquare: MessageSquare` from lucide and to the name union)
- Test: `apps/web/src/components/__tests__/feedback-entry.test.tsx`

**Interfaces:**
- Consumes: `FeedbackSheet` from Task 4.

- [ ] **Step 1: Write failing tests:**
  - `account menu opens feedback`: render `AccountMenu` (pattern from `merge-request.test.tsx`), open menu, click `data-testid="account-menu-feedback"` → menu closes, `feedback-message` visible.
  - `guest trip header opens feedback`: render `GuestTrip` with existing guest fixtures, click `data-testid="guest-feedback"` → `feedback-message` visible; no contact text field until contact ticked.
- [ ] **Step 2: Run** `npm test -w @fsl/web -- feedback-entry` → FAIL.
- [ ] **Step 3: Implement** as listed under Files; row style copies the existing `fsl-account-menu__row fsl-account-menu__link` classes with `Icon name="messageSquare"`.
- [ ] **Step 4: Run** `npm test -w @fsl/web` and `npm run typecheck` (root) → PASS. Then `npm run dev`, open the app at 375px and 1280px width: menu row → sheet (drawer on phone, dialog on desktop), keyboard focus in textarea, send works against local API (row appears in local D1).
- [ ] **Step 5: Commit** `feat(web): feedback entry in account menu and guest trip`.

---

## Order and delegation

Tasks run in order 1 → 5 (2 depends on 1; 4 on 1's core types; 5 on 4). Task 3 can run in parallel with 4. Per user memory, Tasks 1–2 (DB + core logic) go to the smarter model (Argon/Claude); Tasks 3–5 are routine → Gemini Flash via Orca. Planner runs all tests and reviews every diff.
