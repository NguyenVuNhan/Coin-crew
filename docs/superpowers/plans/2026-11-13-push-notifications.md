# Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Signed-in members on a phone get three opt-in Web Push notifications (new session with you in it, session reminder, new expense that includes you), managed from the Notifications sheet and a Home pill.

**Architecture:** The Worker stores one row per subscribed phone (`push_subscriptions`, with that phone's switches) and precomputed reminder rows (`push_reminders`). Expense routes call two push dispatchers next to the existing email dispatcher; a 5-minute cron sends due reminders. A small own Web Push module (VAPID ES256 + RFC 8291 `aes128gcm`, WebCrypto only) does the sending. On the web, `@cc/web-platform/push` reads browser state and subscribes, `@cc/web-data-access/push` talks to the API, and `@cc/web-screens` adds the settings group, the pill and the ask sheet. The generated service worker imports a hand-written `push-sw.js`.

**Tech Stack:** Cloudflare Workers + D1 (Hono, drizzle), WebCrypto, Vitest (`@cloudflare/vitest-pool-workers` for the API, jsdom for web), React 19 + React Query, vite-plugin-pwa 2 (Workbox `generateSW`), shadcn/Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-11-13-push-notifications-design.md` (read it first; this plan argues from it). Mockup: `.superpowers/brainstorm/2299-1794586321/content/push-overview-v3.html`.

## Global Constraints

- Recipients: participant rows with a `userId`, never the actor, never guests/view-only, never `direct` trips (`trips.preset = 'direct'`).
- Reminder lead minutes ∈ `{15, 30, 60, 120}`, default `30`. Session times are Asia/Ho_Chi_Minh (UTC+7, no DST).
- Money in push text as `85.000₫` (dots, no space before ₫) — use the existing core formatter if one produces this, else `n.toLocaleString('vi-VN') + '₫'` normalised to dots.
- Push sends never block or fail the user's request: wrap in `c.executionCtx.waitUntil` with the same try/catch fallback as `dispatchExpenseNotification`.
- No new third-party services and no Node-only dependencies in `apps/api`.
- Feature is off (pill + push group hidden, dispatchers no-op) when `VAPID_PUBLIC_KEY` or `VAPID_PRIVATE_KEY` is unset.
- Web UI: CLAUDE.md library rules and DESIGN.md; app wrappers (`Sheet`, `Button`, `Icon`, `Snackbar`, `InlineError`), theme tokens only, one primary per view, `min-h-11`, Be Vietnam Pro, select by `fsl-*` / `data-testid`.
- Push UI only when `platform.kind === 'web'` and the device is a phone/tablet (`isMobileEnv(currentInstallEnv())`). Hidden in `zmp`.
- Copy: every new string in `libs/web/i18n/src/vi.ts` (with `// REVIEW`) and `en.ts`; Vietnamese strings exactly as in the spec where it gives them.
- D1 migration is hand-written SQL (`apps/api/migrations/0023_push.sql`); no journal edit (the journal only lists `0000`). Apply with `--local` for the tunnel.
- Run tests per project: `npx nx test @cc/api -- <file>`, `npx nx test @cc/web-screens -- <file>`, etc. Full gate: `npm test && npm run typecheck && npm run lint`.

## Review Focus

1. **A session's court slots edited to unparseable text after a reminder was scheduled** → the old reminder row must be deleted, not left with the old time. (Task 5 test `rebuild drops reminders when the time no longer parses`.)
2. **The same phone signs in as a different user** (shared phone) → PUT with an existing endpoint moves it to the new user; the old user stops receiving on it. (Task 3 test `PUT moves an endpoint to the new user`.)
3. **A push service returns 404/410 mid-batch** → that subscription and its reminders are deleted and the rest of the batch still sends. (Task 4 test `gone subscription is removed and others still send`.)
4. **Cron runs with nothing due** → exactly one D1 query. (Task 6 test `empty run does one query`.)
5. **Permission revoked in phone Settings while the app is open** → the settings group switches to `blocked` on return (`visibilitychange`). (Task 9 test `re-reads state on visibilitychange`.)

---

### Task 1: Data model, env, product rule

**Files:**
- Create: `apps/api/migrations/0023_push.sql`
- Modify: `libs/api/db/src/schema.ts` (add two tables after `notificationLogs`)
- Modify: `libs/api/db/src/env.ts` (`Env`)
- Modify: `apps/api/src/auth/mergeUsers.ts:188-200` (move subscriptions before `users` delete)
- Modify: `PRODUCT.md` (Capabilities and Constraints line)
- Modify: `docs/setup.md` (VAPID vars: how to generate, where to set; `.dev.vars` example)
- Test: `apps/api/test/push-schema.test.ts`

**Interfaces:**
- Produces: drizzle tables `pushSubscriptions`, `pushReminders` exported from `@cc/api-db/schema`; `Env.VAPID_PUBLIC_KEY?: string`, `Env.VAPID_PRIVATE_KEY?: string` (base64url raw P-256 private scalar `d`), `Env.VAPID_SUBJECT?: string`.

SQL (columns from the spec):
```sql
CREATE TABLE `push_subscriptions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `endpoint` text NOT NULL UNIQUE,
  `p256dh` text NOT NULL,
  `auth` text NOT NULL,
  `new_session` integer NOT NULL DEFAULT 1,
  `session_reminder` integer NOT NULL DEFAULT 1,
  `reminder_lead_minutes` integer NOT NULL DEFAULT 30,
  `expense_new` integer NOT NULL DEFAULT 1,
  `user_agent` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `last_success_at` text
);
--> statement-breakpoint
CREATE INDEX `push_subscriptions_user_idx` ON `push_subscriptions` (`user_id`);
--> statement-breakpoint
CREATE TABLE `push_reminders` (
  `id` text PRIMARY KEY NOT NULL,
  `subscription_id` text NOT NULL REFERENCES `push_subscriptions`(`id`) ON DELETE CASCADE,
  `transaction_root_id` text NOT NULL,
  `trip_id` text NOT NULL,
  `due_at` text NOT NULL,
  `sent_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_reminders_sub_root_uq` ON `push_reminders` (`subscription_id`, `transaction_root_id`);
--> statement-breakpoint
CREATE INDEX `push_reminders_due_idx` ON `push_reminders` (`sent_at`, `due_at`);
```

- [ ] **Step 1: Write failing tests** in `push-schema.test.ts`:
  - `migration creates push tables`: insert a user, a subscription, a reminder; select back; `expect(row.reminder_lead_minutes).toBe(30)`.
  - `deleting a subscription cascades its reminders`: after `DELETE FROM push_subscriptions`, reminder count is `0` (D1 needs `PRAGMA foreign_keys` on — if the test pool has it off, delete reminders explicitly in code instead and assert that in Task 3; note which in the commit message).
  - `mergeUsers moves push subscriptions to the surviving user`: seed two users with one subscription each, run the existing merge path the other merge tests use, expect both rows' `user_id` = surviving id.
- [ ] **Step 2:** `npx nx test @cc/api -- push-schema` → FAIL (no such table).
- [ ] **Step 3:** Add the SQL, drizzle tables (camelCase fields matching `userNotificationSettings` style), Env fields, and in `mergeUsers` add `db.update(pushSubscriptions).set({ userId: aId }).where(eq(pushSubscriptions.userId, bId))` to the same batch, before the `users` delete. Replace the PRODUCT.md line with the spec's approved wording verbatim. Document VAPID setup in `docs/setup.md` (generate with `npx web-push generate-vapid-keys` run anywhere, or the provided `scripts/vapid-keys.mjs` if you add one; public key → var, private → `wrangler secret put VAPID_PRIVATE_KEY`).
- [ ] **Step 4:** `npx nx test @cc/api -- push-schema` → PASS; `npx nx test @cc/api -- merge` → PASS.
- [ ] **Step 5:** Commit `feat(api): push subscription and reminder tables (#97)`.

---

### Task 2: Web Push sender (VAPID + aes128gcm)

**Files:**
- Create: `apps/api/src/notifications/push/webPush.ts`
- Test: `apps/api/test/web-push.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface PushTarget { endpoint: string; p256dh: string; auth: string }
  export interface PushPayload { title: string; body: string; url: string; tag: string }
  export type PushResult = 'ok' | 'gone' | 'error';
  export interface VapidKeys { publicKey: string; privateKey: string; subject: string } // base64url
  export function vapidFromEnv(env: Env): VapidKeys | null; // null when either key missing; subject defaults to env.APP_ORIGIN
  export async function encryptPayload(plaintext: Uint8Array, target: Pick<PushTarget,'p256dh'|'auth'>, opts?: { salt?: Uint8Array; senderKeys?: CryptoKeyPair }): Promise<Uint8Array>; // RFC 8291 aes128gcm body incl. header
  export async function vapidAuthHeader(endpoint: string, keys: VapidKeys, nowSec?: number): Promise<string>; // "vapid t=<jwt>, k=<publicKey>", aud = endpoint origin, exp = now+12h
  export async function sendPush(target: PushTarget, payload: PushPayload, keys: VapidKeys, opts: { ttlSeconds: number; urgency: 'normal' | 'high' }, fetchImpl?: typeof fetch): Promise<PushResult>;
  ```
  `sendPush`: POST to endpoint with headers `Content-Encoding: aes128gcm`, `Content-Type: application/octet-stream`, `TTL`, `Urgency`, `Authorization`; 2xx → `'ok'`, 404/410 → `'gone'`, anything else or a thrown fetch → `'error'` (log via `safeError`, never throw).

- [ ] **Step 1: Write failing tests:**
  - `encryptPayload matches RFC 8291 Appendix A`: use the RFC's `auth_secret`, receiver public key, sender key pair (import the RFC's private/public as JWK), `salt`, plaintext `"When I grow up, I want to be a watermelon"`; expect base64url of the result to equal the RFC's final message (`DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN`).
  - `vapidAuthHeader produces a JWT the public key verifies`: generate a key pair, build header, split `t=`, verify ES256 signature with WebCrypto, expect payload `aud` = `https://push.example.com`, `sub` = subject, `exp - now` = `43200`.
  - `sendPush maps statuses`: fake fetch returning 201 → `'ok'`, 410 → `'gone'`, 404 → `'gone'`, 500 → `'error'`, throwing → `'error'`; assert request headers `TTL`, `Urgency`, `Content-Encoding: aes128gcm`.
- [ ] **Step 2:** `npx nx test @cc/api -- web-push` → FAIL.
- [ ] **Step 3:** Implement with WebCrypto only (ECDH P-256, HKDF via `crypto.subtle.deriveBits`, AES-GCM, ECDSA P-256/SHA-256; JWT signature is raw r‖s, which WebCrypto already returns). Record size 4096, single record, padding delimiter `0x02`.
- [ ] **Step 4:** `npx nx test @cc/api -- web-push` → PASS.
- [ ] **Step 5:** Commit `feat(api): web push sender with VAPID and aes128gcm (#97)`.

---

### Task 3: Subscription API

**Files:**
- Create: `apps/api/src/notifications/push/routes.ts`
- Create: `apps/api/src/notifications/push/store.ts`
- Modify: `apps/api/src/app.ts` (`app.route('/api', pushRoutes())` after `notificationSettingsRoutes`)
- Modify: `libs/shared/core/src/api-types.ts` (types below)
- Test: `apps/api/test/push-routes.test.ts`

**Interfaces:**
- Consumes: Task 1 tables; Task 5's `rebuildRemindersForSubscription` (call it after PATCH and after PUT; until Task 5 lands, Task 3 imports it from `./reminders` — create that file in this task with an exported no-op `async function rebuildRemindersForSubscription(db: Db, subscriptionId: string, now: Date): Promise<void>` that Task 5 fills in).
- Produces (in `@cc/core`):
  ```ts
  export type PushLeadMinutes = 15 | 30 | 60 | 120;
  export interface PushDeviceSettings { newSession: boolean; sessionReminder: boolean; reminderLeadMinutes: PushLeadMinutes; expenseNew: boolean }
  export interface PushSubscriptionInput { endpoint: string; keys: { p256dh: string; auth: string } }
  ```
  Routes (all `requireUser` except key):
  - `GET /api/push/key` → `{ publicKey: string | null }` (null when `vapidFromEnv` is null).
  - `PUT /api/push/subscription` body `PushSubscriptionInput` (+ optional `userAgent` ≤ 200 chars) → `{ settings: PushDeviceSettings }`. Upsert by endpoint; if owned by another user, reassign to the session user and reset switches to defaults.
  - `GET /api/push/subscription?endpoint=` → `{ settings }` or 404 (also 404 if the endpoint belongs to another user).
  - `PATCH /api/push/subscription` body `{ endpoint } & Partial<PushDeviceSettings>` → `{ settings }`; 422 for non-boolean switches or lead ∉ {15,30,60,120}; 404 if not this user's.
  - `DELETE /api/push/subscription` body `{ endpoint }` → 204 (idempotent; also deletes its reminders).
  - Validation: `endpoint` must be `https://`, ≤ 1000 chars; keys non-empty base64url ≤ 200 chars → else 422 `VALIDATION`.
- `store.ts`: `export async function subscriptionsForUsers(db: Db, userIds: string[], flag: 'newSession' | 'expenseNew' | 'sessionReminder'): Promise<PushSubscriptionRow[]>` (one `IN` query, flag = 1) and `export async function deleteSubscription(db: Db, id: string): Promise<void>` (deletes reminders then subscription).

- [ ] **Step 1: Write failing tests** (use `memberSid` for cookies):
  - `GET key returns null without VAPID env` and `returns the key when set` (set `env.VAPID_PUBLIC_KEY`/`PRIVATE_KEY` in the test).
  - `PUT creates a subscription with default settings` → `{ newSession: true, sessionReminder: true, reminderLeadMinutes: 30, expenseNew: true }`.
  - `PUT moves an endpoint to the new user` (Review Focus 2): PUT as Minh, PUT same endpoint as An → GET as Minh 404, GET as An 200.
  - `PATCH rejects lead 45` → 422; `PATCH saves expenseNew false` → GET shows false.
  - `DELETE removes subscription and reminders` (seed a reminder row) → both gone; second DELETE → 204.
  - `requires sign-in` → 401 for PUT without cookie.
- [ ] **Step 2:** `npx nx test @cc/api -- push-routes` → FAIL.
- [ ] **Step 3:** Implement following `settingsRoutes.ts` style (`parseJson`, `ApiError`, `nowIso`, `newId`).
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(api): push subscription endpoints (#97)`.

---

### Task 4: Expense push dispatcher

**Files:**
- Create: `apps/api/src/notifications/push/dispatch.ts`
- Create: `apps/api/src/notifications/push/messages.ts`
- Modify: `apps/api/src/expenses/routes.ts` (call sites below)
- Test: `apps/api/test/push-expense.test.ts`

**Interfaces:**
- Consumes: `sendPush`, `vapidFromEnv` (Task 2); `subscriptionsForUsers`, `deleteSubscription` (Task 3).
- Produces:
  ```ts
  // dispatch.ts
  export async function dispatchExpensePush(c: Context<AppBindings>, expenseRootId: string, actor: DispatchActor): Promise<void>; // waitUntil-wrapped like dispatchExpenseNotification
  export async function sendToSubscriptions(env: Env, db: Db, subs: PushSubscriptionRow[], payload: PushPayload, opts: { ttlSeconds: number; urgency: 'normal' | 'high' }): Promise<void>; // sends all (Promise.allSettled), deletes 'gone', sets last_success_at on 'ok'
  // messages.ts — pure
  export function expenseMessage(i: { actorName: string; description: string; groupName: string; share: number; tripId: string; rootId: string }): PushPayload;
  ```
  `expenseMessage`: title `` `${actorName} thêm ${description} · ${groupName}` ``, body `` `Phần của bạn ${fmt(share)}` ``, url `` `/t/${tripId}/expenses/${rootId}` ``, tag `` `expense:${rootId}` ``. TTL 86400, urgency `normal`.
- Recipients: latest head of `expenseRootId`; skip if planning, if trip `preset === 'direct'`, or status ≠ `approved`. Participants with share `> 0` and a `userId` ≠ actor user (resolve actor user as the email dispatcher does; also exclude the actor participant's `userId`). Actor name = `participants.name` of `actor.actorParticipantId` in this trip, falling back to the user's name.
- Call sites in `routes.ts` — add `dispatchExpensePush(c, rootId, actorArgs)` directly after each of these existing calls: create (`status === 'approved' && !isPlanningExpense`, ~line 766), PATCH planning→bill branch (~line 839), approve (~line 1156). Not after `'updated'`/`'deleted'`.

- [ ] **Step 1: Write failing tests** (stub `fetch` with `vi.spyOn(globalThis, 'fetch')`, set VAPID env with a generated key pair, seed subscriptions for Minh and An, Minh creates via the API):
  - `new approved expense pushes to included members but not the actor`: expense split Minh+An by Minh → exactly one fetch, to An's endpoint.
  - `no push when An's expenseNew is off`.
  - `no push for a payer with zero share`.
  - `no push in a direct trip` (seed a trip with `preset = 'direct'`).
  - `no push without VAPID keys`.
  - `completing a planned session pushes the bill` (create planning, PATCH to non-planning).
  - `gone subscription is removed and others still send` (Review Focus 3): two An devices, first returns 410 → its row deleted, second still called.
  - `expenseMessage formats share as 85.000₫` (pure): `expenseMessage({ actorName: 'Minh', description: 'Ăn tối', groupName: 'Đà Lạt', share: 85000, tripId: 't', rootId: 'r' })` → `{ title: 'Minh thêm Ăn tối · Đà Lạt', body: 'Phần của bạn 85.000₫', url: '/t/t/expenses/r', tag: 'expense:r' }`.
- [ ] **Step 2:** `npx nx test @cc/api -- push-expense` → FAIL.
- [ ] **Step 3:** Implement. Await `waitUntil` fallback the same way so tests see the sends.
- [ ] **Step 4:** → PASS; `npx nx test @cc/api -- expenses` still PASS.
- [ ] **Step 5:** Commit `feat(api): push a new expense to the members it includes (#97)`.

---

### Task 5: Session push and reminders

**Files:**
- Create: `apps/api/src/notifications/push/sessionTime.ts`
- Modify: `apps/api/src/notifications/push/reminders.ts` (fill the Task 3 stub)
- Modify: `apps/api/src/notifications/push/dispatch.ts` (`dispatchSessionPush`)
- Modify: `apps/api/src/notifications/push/messages.ts`
- Modify: `apps/api/src/expenses/routes.ts` (planning create, PATCH, rollback, delete, disable, enable)
- Test: `apps/api/test/push-session-time.test.ts`, `apps/api/test/push-session.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // sessionTime.ts — pure
  export function parseSlotStart(timeRange: string): { h: number; m: number } | null;
  export function sessionStartUtc(spentOn: string, courtSlots: SportCourtSlot[] | undefined): Date | null; // earliest parsed start, UTC+7 → UTC
  // reminders.ts
  export async function rebuildSessionReminders(db: Db, rootId: string, now: Date): Promise<void>;
  export async function rebuildRemindersForSubscription(db: Db, subscriptionId: string, now: Date): Promise<void>;
  // dispatch.ts
  export interface SessionSnapshot { participantIds: string[]; startUtc: string | null; locationName: string | null; live: boolean }
  export function sessionSnapshotOf(row: TransactionRow | null): SessionSnapshot; // live = planning && status === 'approved'
  export async function dispatchSessionPush(c: Context<AppBindings>, rootId: string, before: SessionSnapshot | null, actor: DispatchActor): Promise<void>;
  // messages.ts
  export function newSessionMessage(i: { description: string; locationName: string | null; startUtc: string | null; male: number; female: number; tripId: string; rootId: string }): PushPayload;
  export function changedSessionMessage(i: { description: string; tripId: string; rootId: string; locationName: string | null; startUtc: string | null }): PushPayload;
  export function reminderMessage(i: { description: string; leadMinutes: PushLeadMinutes; locationName: string | null; courts: string | null; timeRange: string | null; tripId: string; rootId: string }): PushPayload;
  ```
- `parseSlotStart` accepts the start of `"05:00 - 07:00"`, `"5:00-7:00"`, `"9h - 11h"`, `"9h30 - 11h"`, `"19 giờ - 21 giờ"`, `"7h sáng"`; rejects hours > 23 / minutes > 59 / no digits.
- `dispatchSessionPush` logic (`after` = current head snapshot):
  - **new-session push** (flag `newSession`) to users of `after.participantIds − before.participantIds` (all of them when `before` is null or `!before.live`), only if `after.live`.
  - **changed push** to users in both lists when `after.live && before?.live` and `startUtc` or `locationName` differs.
  - Exclude the actor user for both. Never push on removal.
  - Always `rebuildSessionReminders(db, rootId, now)` (deletes all unsent rows for the root, then inserts one per subscription with `sessionReminder = 1` of each listed user — **including the actor** — when `after.live`, `startUtc` is not null and `due = start − lead > now`).
- `rebuildRemindersForSubscription` (called after PUT and PATCH): delete that subscription's unsent rows, then insert rows for every live planned session (in a non-`direct` trip) whose list contains a participant linked to the subscription's user, using the same due rule. This back-fills sessions planned before the phone subscribed (decided: yes, back-fill).
- Messages: new — title `` `${description} · bạn có tên` ``, body parts joined with ` · `: location, `HH:MM thứ N` (Vietnamese weekday: `Chủ nhật`, `thứ Hai`… `thứ Bảy`), `` `${male} Nam, ${female} Nữ` `` (omit zero/missing parts). Changed — title `` `${description} đổi giờ hoặc địa điểm` ``, body location + time. Reminder — title `` `Còn ${lead} nữa: ${description}` `` with lead `15 phút`/`30 phút`/`1 giờ`/`2 giờ`; body location · courts · timeRange. URLs `/t/{tripId}/expenses/{rootId}`; tags `session:{rootId}` / `reminder:{rootId}`. TTL: new/changed 86400; urgency normal.
- Call sites: read `before = sessionSnapshotOf(head)` before the write in PATCH, rollback, delete, disable, enable; after the write call `dispatchSessionPush(c, rootId, before, actorArgs)` when either `before.live` or the new head is planning. Planning create: `before = null`.

- [ ] **Step 1: Write failing tests:**
  - `push-session-time.test.ts`: table-driven `parseSlotStart` for every format above plus `'abc'`, `'25:00'` → null; `sessionStartUtc('2026-11-14', [{courtName:'S5', timeRange:'19:00 - 21:00'}, {courtName:'S6', timeRange:'05:00 - 07:00'}])` → `2026-11-13T22:00:00.000Z`; no slots → null.
  - `push-session.test.ts`:
    - `planning a session pushes everyone on the list except the actor`.
    - `adding a person to a planned session pushes only the newcomer`.
    - `removing a person sends nothing and drops their reminder`.
    - `changing the time pushes "đổi giờ" and moves the reminder` (due_at changes by the delta).
    - `reminder row uses each device's lead time` (devices with 30 and 120 → two rows, due 30 / 120 min before).
    - `rebuild drops reminders when the time no longer parses` (Review Focus 1).
    - `completing, deleting or disabling removes unsent reminders`.
    - `enable re-creates reminders`; `rollback to an older time rebuilds reminders`.
    - `no reminder when due time already passed`.
    - `rebuildRemindersForSubscription follows a lead change` (PATCH lead 60 via API → due_at moves).
    - `reminderMessage('Cầu lông T5', 30, …)` title `'Còn 30 phút nữa: Cầu lông T5'`.
- [ ] **Step 2:** `npx nx test @cc/api -- push-session` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** → PASS; `npx nx test @cc/api -- expenses` still PASS.
- [ ] **Step 5:** Commit `feat(api): push new and changed sessions and schedule reminders (#97)`.

---

### Task 6: Reminder cron

**Files:**
- Create: `apps/api/src/notifications/push/cron.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/wrangler.jsonc` (`"crons": ["0 * * * *", "*/5 * * * *"]`)
- Test: `apps/api/test/push-cron.test.ts`

**Interfaces:**
- Consumes: `sendToSubscriptions`, `reminderMessage`, `sessionSnapshotOf`.
- Produces: `export async function sendDueReminders(env: Env, now: Date): Promise<void>`.
- `index.ts`: `if (controller.cron === '*/5 * * * *') { ctx.waitUntil(sendDueReminders(env, now)); return; }` before the existing hourly jobs (which keep running only on `'0 * * * *'`).
- Logic: one indexed select `sent_at IS NULL AND due_at <= now` (limit 200). If empty, return. Otherwise load heads for the distinct roots, skip (and mark sent) rows whose head is not live or whose start is already past; send the rest; set `sent_at = now` on every processed row.

- [ ] **Step 1: Write failing tests:**
  - `sends a due reminder once`: seed live session + reminder due 1 min ago → one fetch; run again → no fetch.
  - `skips a reminder for a completed session` → no fetch, row marked sent.
  - `does not send future reminders`.
  - `empty run does one query` (Review Focus 4): spy on `env.DB.prepare` → called once.
  - `scheduled handler routes */5 to reminders only`: call the default export's `scheduled` with `{ cron: '*/5 * * * *' }` and spies on the hourly jobs → not called.
- [ ] **Step 2:** `npx nx test @cc/api -- push-cron` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** → PASS; `npx nx test @cc/api -- cron-notifications` still PASS.
- [ ] **Step 5:** Commit `feat(api): send session reminders every five minutes (#97)`.

---

### Task 7: Service worker push handler

**Files:**
- Create: `apps/web/public/push-sw.js`
- Modify: `apps/web/vite.config.ts` (`workbox.importScripts: ['push-sw.js']`; add `push-sw.js` to `includeAssets`)

**Interfaces:**
- Consumes: payload JSON `PushPayload` `{ title, body, url, tag }` (Task 2).
- `push-sw.js` (plain JS, no imports): `push` → `event.waitUntil(self.registration.showNotification(title, { body, tag, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { url } }))`; on unparseable payload show title `'CoinCrew'` with no body (iOS requires every push to show). `notificationclick` → close, then `clients.matchAll({ type: 'window', includeUncontrolled: true })`; focus the first same-origin client and `client.navigate(url)` (fallback `postMessage`), else `clients.openWindow(url)`.

- [ ] **Step 1:** Implement the two files.
- [ ] **Step 2:** `npx nx build @cc/web` → the built `sw.js` contains `importScripts("push-sw.js")` (`grep -c push-sw.js apps/api/public/sw.js` → ≥1) and `apps/api/public/push-sw.js` exists.
- [ ] **Step 3:** Manual check in Chrome DevTools → Application → Service workers → "Push" with `{"title":"Thử","body":"b","url":"/trips","tag":"t"}` shows a notification; clicking opens `/trips`.
- [ ] **Step 4:** Commit `feat(web): service worker shows push notifications (#97)`.

---

### Task 8: Browser push state and API hooks

**Files:**
- Create: `libs/web/platform/src/push.ts` (+ `"./push"` in `libs/web/platform/package.json` exports)
- Create: `libs/web/data-access/src/push.ts` (+ export entry in its package.json, mirroring existing entries)
- Modify: `libs/web/data-access/src/signOut.ts`
- Test: `libs/web/platform/src/__tests__/push.test.ts`, `libs/web/data-access/src/__tests__/push.test.ts` (create the folder if absent, following platform's test setup)

**Interfaces:**
- Produces (platform):
  ```ts
  export type PushState = 'hidden' | 'unsupported' | 'ios-needs-install' | 'not-asked' | 'blocked' | 'granted';
  export interface PushEnv extends InstallEnv { hasPushApi: boolean; permission: NotificationPermission | null }
  export function currentPushEnv(): PushEnv;
  export function detectPushState(env: PushEnv): PushState;
  // 'hidden' when !isMobileEnv(env); 'unsupported' when in-app browser or !hasPushApi (except iOS not standalone → 'ios-needs-install');
  // permission 'denied' → 'blocked'; 'granted' → 'granted'; else 'not-asked'.
  export function usePushState(): PushState; // re-reads on visibilitychange and after subscribe/unsubscribe
  export async function getBrowserSubscription(): Promise<PushSubscription | null>;
  export async function subscribeBrowser(publicKey: string): Promise<PushSubscriptionJSON>; // requestPermission() then pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
  export async function unsubscribeBrowser(): Promise<string | null>; // returns the endpoint it removed
  export const pushStore: { isDismissed(): boolean; dismiss(): void }; // localStorage 'cc.push.dismissed', try/catch
  ```
  `'zmp'` is handled by callers via `usePlatform()` (platform state code stays browser-only).
- Produces (data-access):
  ```ts
  export function usePushKey(): UseQueryResult<string | null>;            // GET /api/push/key, staleTime Infinity
  export function usePushDevice(enabled: boolean): UseQueryResult<PushDeviceSettings | null>; // GET by current endpoint; null when no browser subscription or 404
  export function useEnablePush(): UseMutationResult<PushDeviceSettings, Error, void>;      // subscribeBrowser(key) → PUT; invalidates ['push','device']
  export function useUpdatePushDevice(): UseMutationResult<PushDeviceSettings, Error, Partial<PushDeviceSettings>>; // optimistic like NotificationSettingsModal
  ```
  Query keys: `['push','key']`, `['push','device']`.
- `signOut`: before `apiSend('/api/auth/logout')`, when `platform.kind === 'web'`, best-effort `unsubscribeBrowser()` then `apiSend('/api/push/subscription','DELETE',{ endpoint })`; errors swallowed (sign-out must still work).

- [ ] **Step 1: Write failing tests:**
  - platform `detectPushState` table: desktop UA → `hidden`; Android Chrome default → `not-asked`; denied → `blocked`; granted → `granted`; Zalo UA → `unsupported`; iPhone Safari not standalone → `ios-needs-install`; iPhone standalone with push API → `not-asked`; Android without PushManager → `unsupported`.
  - platform `pushStore.dismiss persists and survives a throwing localStorage`.
  - data-access `useEnablePush PUTs the browser subscription` (stub `navigator.serviceWorker.ready`, `PushManager.subscribe`, `Notification.requestPermission → 'granted'`, mock fetch) → PUT body has `endpoint` and `keys`.
  - data-access `usePushDevice returns null on 404`.
  - data-access `signOut removes the push subscription and still signs out when it fails`.
- [ ] **Step 2:** `npx nx test @cc/web-platform -- push` and `npx nx test @cc/web-data-access -- push` → FAIL.
- [ ] **Step 3:** Implement. Convert the base64url public key to `Uint8Array` for `applicationServerKey`.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(web): browser push state, subscribe and API hooks (#97)`.

---

### Task 9: Notifications sheet — push group

**Files:**
- Create: `libs/web/screens/src/components/PushSettingsGroup.tsx`
- Modify: `libs/web/screens/src/components/NotificationSettingsModal.tsx`
- Modify: `libs/web/i18n/src/vi.ts`, `libs/web/i18n/src/en.ts`
- Test: `libs/web/screens/src/components/__tests__/push-settings.test.tsx`; update expectations only where the title changed in `notification-settings.test.tsx` **(existing test: the planner, not the implementer, edits it)**

**Interfaces:**
- Consumes: Task 8 hooks and `usePushState`; `InstallAppSheet` (existing).
- Produces: `export function PushSettingsGroup(): JSX.Element | null` (null when `platform.kind === 'zmp'`, state `hidden`, or `usePushKey().data === null`).
- Layout per spec "The Notifications sheet": section label `push.sectionLabel` + hint `push.sectionHint`, then exactly one block per state (`unsupported` muted line; `ios-needs-install` row opening `InstallAppSheet`; `not-asked` row + secondary `Button` calling `useEnablePush`; `blocked` Jade Mist note with `bell-off` and three steps; `granted` with a device row → three switches; `granted` without a device row → same as `not-asked`). Lead-time control on the reminder row: shadcn `select` (add with `npx shadcn@latest add select` in `libs/web/ui` if missing) or a choice sheet — `min-h-11`, `text-base`, shown only while the reminder switch is on.
- `NotificationSettingsModal`: render `<PushSettingsGroup />` first; then a new section label `notifications.emailSection` above the existing list; move the `!hasEmail` warning into the bottom of the email list as a row (keep `fsl-notification-settings__warning` and the link button). Title key `notifications.title` → `'Thông báo'` / `'Notifications'`.
- Classes / test ids: `fsl-push-settings`, modifier `fsl-push-settings--<state>`, `data-testid="push-settings"`; switches `data-testid="push-switch-newSession|sessionReminder|expenseNew"`; lead select `data-testid="push-lead"`.
- Copy keys (vi from the spec, `// REVIEW`): `push.sectionLabel` `Trên điện thoại này`, `push.sectionHint` `Chỉ áp dụng cho điện thoại này.`, `push.unsupported`, `push.iosInstallTitle`, `push.iosInstallDesc`, `push.enableTitle`, `push.enableDesc`, `push.enableButton` `Bật thông báo`, `push.blockedTitle`, `push.blockedStep1..3`, `push.newSession` `Buổi chơi mới có tên bạn`, `push.newSessionDesc` `Khi admin thêm bạn vào buổi chơi`, `push.reminder` `Nhắc trước buổi chơi`, `push.reminderDesc` `{lead} trước giờ bắt đầu`, `push.lead15` `15 phút`, `push.lead30` `30 phút`, `push.lead60` `1 giờ`, `push.lead120` `2 giờ`, `push.expense` `Thay đổi giao dịch`, `push.expenseDesc` `Khoản chi mới tính phần của bạn`, `notifications.emailSection` `Qua email`.

- [ ] **Step 1: Write failing tests** (`mockApi`, stub push state via `vi.mock('@cc/web-platform/push', …)`):
  - one test per state asserting the `fsl-push-settings--<state>` modifier and its key text.
  - `hidden in zmp` (render with the zmp platform test helper) → no `push-settings`.
  - `hidden without a server key` (`GET /api/push/key` → `{ publicKey: null }`).
  - `toggling expenseNew PATCHes the device` → PATCH body `{ endpoint, expenseNew: false }`.
  - `lead select shows only when reminder is on and PATCHes reminderLeadMinutes 60`.
  - `re-reads state on visibilitychange` (Review Focus 5): state mock returns `granted` then `blocked`; dispatch `visibilitychange` → `--blocked` shown.
  - `sheet title is Thông báo and the no-email warning sits inside the email list`.
- [ ] **Step 2:** `npx nx test @cc/web-screens -- push-settings` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** → PASS; `npx nx test @cc/web-screens -- notification-settings style-guard` PASS (after the planner updates the title assertion).
- [ ] **Step 5:** Commit `feat(web): push group in the Notifications sheet (#97)`.

---

### Task 10: Home pill and ask sheet

**Files:**
- Create: `libs/web/screens/src/components/PushPill.tsx`, `libs/web/screens/src/components/PushAskSheet.tsx`
- Modify: `libs/web/screens/src/screens/Home.tsx` (render `<PushPill />` right after `<InstallPill />`)
- Modify: `libs/web/i18n/src/vi.ts`, `en.ts`
- Test: `libs/web/screens/src/components/__tests__/push-pill.test.tsx`

**Interfaces:**
- Consumes: `useInstallVisibility()` (existing, for "not with the install pill"), `installStore.visits()`, `pushStore`, `usePushState`, `usePushKey`, `usePushDevice`, `useEnablePush`.
- Produces: `export function PushPill(): JSX.Element | null`; `export function PushAskSheet(props: { open: boolean; onClose: () => void }): JSX.Element`.
- Pill visible iff: `platform.kind === 'web'`, signed in, `usePushState() === 'not-asked'` (or `granted` with no device row), server key present, `!pushStore.isDismissed()`, `installStore.visits() >= 2`, and `useInstallVisibility().pill === false`. Anatomy copies `InstallPill` (`bell` icon, `push.pill` `Nhận thông báo trên điện thoại`, chevron, ✕ with `common.dismiss`); classes `fsl-push-pill`, `fsl-push-pill__close`; `data-testid="push-pill"`.
- Sheet: `Sheet` titled `push.askTitle` `Nhận thông báo trên điện thoại`; three rows (Jade Mist round tile with `calendar-check` / `alarm-clock` / `receipt`, bold `push.newSession` / `push.reminder` / `push.expense`, muted `push.askNewSessionDesc` `Khi admin lên lịch buổi chơi và thêm bạn vào danh sách`, `push.reminderDesc` with the current lead (default 30), `push.askExpenseDesc` `Khi có khoản chi mới tính phần của bạn`); primary `push.enableButton`, ghost `push.notNow` `Để sau`. Granted+saved → close + snackbar `push.enabled` `Đã bật thông báo`; denied → close (pill disappears via state); error → `InlineError`, button retries. Classes `fsl-push-ask`; `data-testid="push-ask-sheet"`.

- [ ] **Step 1: Write failing tests:**
  - `shows on the second signed-in visit when push is not asked`.
  - `hidden on the first visit`, `hidden while the install pill shows`, `hidden after ✕ and stays hidden after remount`, `hidden in zmp`, `hidden when state is blocked`.
  - `tapping opens the ask sheet; Để sau closes it and the pill stays`.
  - `Bật thông báo subscribes, shows Đã bật thông báo, and the pill disappears`.
  - `subscribe failure shows an inline error`.
- [ ] **Step 2:** `npx nx test @cc/web-screens -- push-pill` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** → PASS; then full gate `npm test && npm run typecheck && npm run lint` → all PASS.
- [ ] **Step 5:** Commit `feat(web): Home pill and sheet to turn on push (#97)`.

---

### Task 11: End-to-end check on devices (planner + owner)

- [ ] Apply `0023_push.sql` with `--local`, set VAPID vars in `.dev.vars`, `npm run build`, restart the tunnel.
- [ ] Browser-verify Home pill, ask sheet and every settings state at 375px in Jade and Pink (screenshots).
- [ ] Owner tests on real phones: Android Chrome (browser + installed), iPhone installed (iOS 16.4+), iPhone Safari (install row), Zalo webview (unsupported). Plan a session 35 minutes ahead and confirm the 30-minute reminder; add an expense from another account and confirm the push opens the expense.
- [ ] Owner reviews the `// REVIEW` Vietnamese strings (blocked-state steps especially).
