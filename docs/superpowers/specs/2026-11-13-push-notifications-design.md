# Push notifications for the installed app — design

Issue: [#97](https://github.com/NguyenVuNhan/Coin-crew/issues/97) (epic #82). Depends on #92 (add to home screen, built).
Status: agreed in brainstorm on 2026-11-13; this document is the build reference.
Mockup: `.superpowers/brainstorm/2299-1794586321/content/push-overview-v3.html` (owner said "looks right").

## Intent

Nothing in CoinCrew needs anyone's attention urgently. The point of push is convenience and pulling people back into the app: the app already knows when a session is planned, when it starts, and when an expense includes you. Push brings that one fact to the person's phone, so they don't have to open the app and check.

The issue said "admins first". The owner widened it: **every signed-in member** gets the same three notifications. There is nothing admin-only.

## Goals

1. Three notifications, for signed-in members who turned push on, on that phone:
   - **Buổi chơi mới có tên bạn** (new session with you in it): an admin plans a sport session and you're on its list.
   - **Nhắc trước buổi chơi** (session reminder): before a planned session starts. Default 30 minutes before; each person picks their own lead time.
   - **Thay đổi giao dịch** (expense change): a new expense that includes you. One notification per expense, no grouping.
2. A gentle ask to turn push on (a pill on Home and a sheet) and a push group in the existing Notifications sheet, covering every permission/support state.
3. `PRODUCT.md` updated in the same PR to the new rule (below).

## Non-goals (owner decisions)

- **Guests and view-only visitors** get no push, and no prompt to sign in for it. "Nothing for now."
- **The Zalo Mini App** (`apps/zalo`): no push UI there, ever, in this work. The push group is hidden when `platform.kind === 'zmp'`.
- **Grouping/batching:** ten expenses entered in a row means ten buzzes. Owner chose this explicitly.
- **Quiet hours.** Not doing.
- **"You owe" nagging** or any reminder about money. Not in this work.
- **Admin-only events** (approvals waiting, join requests). Not in this work.
- **Changing email.** Email settings and sends stay exactly as today. Push and email are independent: if both are on for an expense, it arrives both ways.

## Anti-goals (would make this a failure even if it works)

- An ask that is louder than the Home balance, or comes back after ✕ (same rule as the install pill in `2026-11-10-add-to-home-screen-design.md`).
- The phone's own "Allow?" box appearing without the person tapping our button first (a refusal there can never be asked again).
- A notification about something you did yourself.
- A reminder for a session that was completed, deleted or moved.
- Blowing the D1 free-plan read budget (see Constraints).

## The product rule (PRODUCT.md)

Replace the line in **Capabilities and Constraints**:

> **Never in the product, permanently:** push, email or SMS from the app.

with (owner-approved wording):

> **Notifications are opt-in only:** push to the installed app and email, each switchable per event. Never SMS, never marketing or "come back" messages.

Keep the rest of that bullet (no Gmail/Drive permissions; Google sign-in scopes) as is.

## Who receives what

Common rules for all three:

- Recipient = a **participant row with a `userId`** (a signed-in member) who has at least one **active push subscription** with that event's switch on.
- Never the **actor** (the user who caused it). Same actor resolution as `transactionDispatcher.ts` (`actorUserId`, falling back to the session user).
- One user can have several phones; each subscribed phone gets it according to *its own* switches.
- Deep link: tapping opens the item in the app (URLs below). If the app is open, focus it and navigate; otherwise open a window.

### 1. Buổi chơi mới có tên bạn

- **When:** a planning session (`isPlanningExpense`) is created, *and* when an existing planned session is edited so that you are newly on its list, or its date/time/place changed (you already on the list). (Brainstorm guesses the owner confirmed in playback.)
- **Not when:** you are removed from the list (nothing sent); the admin who planned it (actor).
- **Who:** the participants in `meta.sport.entries[].participantId`, filtered by the common rules.
- **Text (draft, `// REVIEW`):** title `"{session description} · bạn có tên"`, body `"{location name} · {start time} {weekday} · {n} Nam, {m} Nữ"` (omit parts that are missing). Changed time/place: title `"{description} đổi giờ/địa điểm"` — builder's call on exact wording, keep it one line.
- **Opens:** `/t/{tripId}/expenses/{rootId}`.

### 2. Nhắc trước buổi chơi

- **When:** `start − leadTime` for each subscribed device of each person on the planned session's list. Default lead time **30 minutes**; choices **15 min, 30 min, 1 hour, 2 hours** (choices are my call, confirmed in playback).
- **Who:** everyone on the list, *including* the admin who planned it (the reminder isn't an action they took).
- **Not when:** the session was completed ("Hoàn tất & Tính tiền"), deleted/disabled, or the person was removed. If the time changed, the old reminder is dropped and a new one scheduled.
- **Start time:** the session's date (`spentOn`, `YYYY-MM-DD`) plus the **earliest start** among `meta.sport.courtSlots[].timeRange` (free text such as `"05:00 - 07:00"` or `"9h - 11h"`), in **Asia/Ho_Chi_Minh** (UTC+7). Parse the start of each range (`HH:MM`, `H:MM`, `Hh`, `HhMM`, `H giờ`…). If no slot parses, **no reminder** is scheduled — never guess a time.
- **Late scheduling:** if the session is planned/edited when the reminder time has already passed but the session hasn't started, send nothing (the "new session" push covers it). Builder's call to tighten this.
- **Text (draft):** title `"Còn {lead} nữa: {description}"` (e.g. "Còn 30 phút nữa: Cầu lông T5"), body `"{location} · {courts} · {time range}"`.
- **Opens:** `/t/{tripId}/expenses/{rootId}`.

### 3. Thay đổi giao dịch

- **When:** a **new approved expense** that includes you, i.e. exactly where `dispatchExpenseNotification(c, 'approved', …)` fires today for non-planning expenses (create when approved, guest expense approved by a member, a planning session completed into a bill). Edits and deletions send **no push** (email still covers them).
- **Who:** participants with a share > 0 in the expense (same set the email dispatcher builds, minus the payer-with-zero-share addition — builder: a payer with no share isn't "included"; my call), filtered by the common rules.
- **Text (draft):** title `"{actor name} thêm {description} · {group name}"`, body `"Phần của bạn {share}"` formatted `85.000₫` (no space before ₫, the Tabular Money Rule). Actor name = the participant name of whoever added/approved it in that group.
- **Opens:** `/t/{tripId}/expenses/{rootId}`. (Owner's guess accepted: the expense screen, where the pay button already is.)
- Payments are **not** in scope (no push on payments).
- **Never for the personal ledger:** skip expenses in `direct` trips (`trips.preset = 'direct'`, the quick-expense ledger in `apps/api/src/me/ledger.ts`). The Phase 2 spec (`2026-11-13-phase-2-personal-money-breakdown-design.md`, rule 8) says "No push, SMS or email about personal money". Only real groups send this push.

## The ask (UI)

Matches mockup v3, step 1.

### Push pill (`PushPill`, `@cc/web-screens`)

- Same anatomy and classes pattern as `InstallPill`: `min-h-11 rounded-full bg-secondary text-secondary-foreground`, lucide `bell` icon, label `"Nhận thông báo trên điện thoại"`, chevron, 44px ✕ (`common.dismiss`). Classes `fsl-push-pill`, `fsl-push-pill__close`; `data-testid="push-pill"`.
- Placement: Home (`/trips`) only, in the same slot as the install pill. **Never both on one visit:** if the install pill is visible, the push pill is hidden.
- Shows only when **all** hold: `platform.kind === 'web'`; a phone or tablet (the same `mobile` check `InstallPill` uses); signed in (`useMe().data.user`); push is **possible on this device** (state `not-asked`, see below — so on iPhone only inside the installed app); not dismissed (`localStorage` `cc.push.dismissed`, try/catch like `installStore`); from the **second signed-in visit** (reuse the install visit counter, `installStore.visits() >= 2`).
- Tap row → opens the ask sheet. ✕ → sets `cc.push.dismissed`, gone for good on that device. The settings row stays.
- Once permission is granted or denied, the pill never shows again (state is no longer `not-asked`).

### Ask sheet (`PushAskSheet`)

- `Sheet` wrapper. Title `"Nhận thông báo trên điện thoại"`. Three rows, each a Jade Mist round icon tile + bold line + muted line: `calendar-check` new session, `alarm-clock` reminder ("30 phút trước giờ bắt đầu" — show the person's current lead time), `receipt` expense.
- One **primary** `"Bật thông báo"` → calls `Notification.requestPermission()` (from this tap — must be a user gesture), then subscribes and saves the subscription. Ghost `"Để sau"` → closes the sheet; pill stays.
- Outcomes: granted + saved → close, snackbar `"Đã bật thông báo"`, pill gone. Denied → close, pill gone (state becomes `blocked`; Settings explains how to fix). Subscribe/save failed → `InlineError` in the sheet, button retries.

## The Notifications sheet (UI)

Matches mockup v3, step 2. Same `NotificationSettingsModal` sheet, opened from AccountMenu as today.

- Title changes from `"Thông báo qua email"` to `"Thông báo"` (`notifications.title`; update en too).
- Two sections, each a 14px semibold Stone Muted label (`px-1`) above a grouped list:
  1. **"Trên điện thoại này"** with hint line `"Chỉ áp dụng cho điện thoại này."` — the push group. Hidden entirely when `platform.kind === 'zmp'`.
  2. **"Qua email"** — the existing three email rows, unchanged in behaviour and descriptions.
- The existing **no-email warning moves inside the email group** (a row at the bottom of that list, info icon + text + the existing link button), so it no longer sits above working push switches. Email switches stay disabled without email, as today.
- Rows keep the existing anatomy: `Label` `text-base font-semibold` + `text-sm text-muted-foreground` description with `aria-describedby`, shadcn `Switch`, `min-h-11 p-3`.

### Push group states

One lead block per state, computed client-side (`usePushState()` in `@cc/web-platform`):

| State | When | Shows |
|---|---|---|
| `desktop` | not a phone or tablet (my call: push is for phones; all copy says "điện thoại") | the whole push group is hidden; the sheet shows only email |
| `unsupported` | no `serviceWorker`/`PushManager`/`Notification`, or in-app browser (Zalo webview etc., reuse `installContext() === 'in-app'`) | muted line with info icon: `"Trình duyệt này không gửi được thông báo. Mở CoinCrew bằng Chrome hoặc Safari để bật."` |
| `ios-needs-install` | iOS and not standalone | row `"Thêm vào màn hình chính trước"` / `"iPhone chỉ gửi thông báo khi mở CoinCrew từ màn hình chính"` with chevron → opens the existing `InstallAppSheet` |
| `not-asked` | `Notification.permission === 'default'` | row `"Bật thông báo trên điện thoại này"` / `"Buổi chơi, lời nhắc và khoản chi có bạn"` + secondary button `"Bật thông báo"` (same flow as the ask sheet's primary) |
| `blocked` | `permission === 'denied'` | Jade Mist note (`bg-secondary text-secondary-foreground`, not Turmeric), `bell-off` icon, `"Điện thoại đang chặn thông báo của CoinCrew"` + 3 numbered steps (open phone Settings → Thông báo → CoinCrew → allow, then come back). Steps differ per OS/browser; draft strings `// REVIEW`, owner checks on real phones. No screenshots. |
| `on` | granted **and** this device has a saved subscription | the three switches (below) |
| `granted-no-subscription` | granted but no subscription saved (cleared, expired, new browser) | treat as `not-asked`: the button re-subscribes silently (no OS prompt needed) |

Re-check the state when the sheet opens and on `visibilitychange` (people come back from phone Settings).

### The three switches (`on` state)

| Row | Description | Notes |
|---|---|---|
| `Buổi chơi mới có tên bạn` | `Khi admin thêm bạn vào buổi chơi` | |
| `Nhắc trước buổi chơi` | `{lead} trước giờ bắt đầu` | When on, a lead-time choice (15 phút / 30 phút / 1 giờ / 2 giờ). Builder's call on the control (a small select or a row that opens a choice sheet); must be ≥44px, `text-base`. Hidden/disabled while the switch is off. |
| `Thay đổi giao dịch` | `Khoản chi mới tính phần của bạn` | Same name as the email row on purpose (owner choice); the description says what push covers. |

All three start **on** when a device first subscribes. Changes save immediately (optimistic, like the email switches). These settings are **per device** (stored on the subscription row), which is what "chỉ áp dụng cho điện thoại này" promises. The lead time is per device too (my call: it lives beside the switches; "each person for themselves" is satisfied).

### Copy

All new strings in `vi.ts` (marked `// REVIEW`) and `en.ts`, under `push.*` (and the renamed `notifications.title`). English is a plain translation.

## Server

### Web Push

- Standard Web Push (RFC 8030) with VAPID (RFC 8292) and message encryption (RFC 8291, `aes128gcm`), sent with `fetch` from the Worker. Must run on Workers (WebCrypto, `nodejs_compat` is on). Builder picks a library that works on Workers or writes the small encrypt/sign module; no Node-only deps.
- VAPID key pair: public key as a var (`VAPID_PUBLIC_KEY`, also served to the client via an endpoint or `/api/me` field), private key as a secret (`VAPID_PRIVATE_KEY`), subject `VAPID_SUBJECT` (`mailto:` or the app origin). Add them to `.dev.vars` docs and the deploy notes. With keys missing, the feature is off: **hide the push group and the pill entirely** when the server has no public key.
- Send with `TTL` (expense/new-session: 1 day; reminder: until session start) and `Urgency: normal` (reminder `high`).
- Response `404`/`410` → delete that subscription. Other failures → log via `safeError`, no retry (best effort, same as email).
- Sends happen in `ctx.waitUntil` / `c.executionCtx.waitUntil` so they never slow or fail the user's request. The expense write never depends on push.

### Data (hand-written D1 migration `0023_push.sql`, per repo convention)

- **`push_subscriptions`**: `id`, `user_id` (FK users), `endpoint` (unique), `p256dh`, `auth`, `new_session` int default 1, `session_reminder` int default 1, `reminder_lead_minutes` int default 30, `expense_new` int default 1, `user_agent` (short, for the user's own device list later; optional), `created_at`, `updated_at`, `last_success_at` (nullable). Index on `user_id`.
- **`push_reminders`**: precomputed due reminders so the cron reads only what is due: `id`, `subscription_id` (FK, cascade), `transaction_root_id`, `trip_id`, `due_at` (ISO UTC), `sent_at` nullable. Index on `(sent_at, due_at)`. Unique `(subscription_id, transaction_root_id)`.
  - (Re)built for a session whenever it is planned or edited (delete rows for that root, insert one per subscribed device of each listed user with `session_reminder = 1`), and when a user changes their lead time or reminder switch (rebuild their future rows), and when a device subscribes (add rows for upcoming sessions they're on — builder's call; acceptable to skip and only cover sessions planned after subscribing). Deleted when the session is completed, deleted, or disabled.
- `notification_logs.type` gets new values only if the builder wants dedupe logging; not required.

### Endpoints (`apps/api/src/notifications/pushRoutes.ts`, `requireUser`)

- `GET /api/push/key` → `{ publicKey }` or `{ publicKey: null }`.
- `PUT /api/push/subscription` body `{ endpoint, keys: { p256dh, auth } }` → upsert by endpoint for the session user (if the endpoint belongs to another user, move it: the phone changed hands/accounts). Returns the device settings.
- `GET /api/push/subscription?endpoint=…` → this device's settings or 404.
- `PATCH /api/push/subscription` body `{ endpoint, newSession?, sessionReminder?, reminderLeadMinutes?, expenseNew? }` → validate (lead ∈ {15,30,60,120}), save, rebuild reminders.
- `DELETE /api/push/subscription` body `{ endpoint }` → remove (used on sign-out).
- Sign-out on the web app should unsubscribe this device (call DELETE, then `subscription.unsubscribe()`), so a shared phone doesn't keep getting someone else's money notifications. Account merge (`mergeUsers.ts`) must move `push_subscriptions` to the surviving user.

### Hooks into existing writes

- `apps/api/src/expenses/routes.ts`: next to each `dispatchExpenseNotification(c, 'approved', …)` call for non-planning expenses, call a new `dispatchExpensePush` (which skips `direct` trips). On planning create/edit/complete/delete, call `dispatchSessionPush` (new-session notification + reminder rebuild/delete).
- **Rollback and enable count as edits** (my call). `POST …/rollback` can change a planned session's list, time or place, or turn a completed bill back into a planned session; `POST …/enable` brings a disabled one back. Both run the same `dispatchSessionPush` as an edit, comparing the before and after heads. Reminders are rebuilt (or deleted if the result is no longer a live planned session), and "new session / changed time" goes out under the same rules as an edit. Rolling a planned session forward into a bill counts as completing it.
- Keep push in its own module (`apps/api/src/notifications/push/…`), not mixed into the email dispatcher; share recipient resolution where it's genuinely the same.

### Cron

- `wrangler.jsonc` triggers today: `["0 * * * *"]`. Add `"*/5 * * * *"` and branch on `controller.cron` in `index.ts` so the hourly jobs keep their schedule and the 5-minute job only sends due reminders. (Free plan allows this; 5-minute granularity means a reminder can be up to 5 minutes late. Acceptable — my call.)
- Reminder job: select `push_reminders` where `sent_at IS NULL AND due_at <= now` (indexed, small), skip rows whose session is no longer a live planning session, send, set `sent_at`. Drop rows older than the session start without sending. Keep the read count tiny on empty runs (one indexed query).

## Service worker (`apps/web`)

- `vite-plugin-pwa` today uses the generated Workbox SW (`generateSW`). Push needs `push` and `notificationclick` handlers. Builder's call: switch to `injectManifest` with a small `src/sw.ts`, or keep `generateSW` and add `importScripts` for a push handler file. Keep the existing behaviour (skipWaiting, clientsClaim, cleanupOutdatedCaches, no API caching, `/api/` denylist).
- `push`: parse JSON `{ title, body, url, tag }`, `showNotification(title, { body, icon: '/icons/icon-192.png', badge, data: { url }, tag })`. Tag per item (`expense:{rootId}`, `session:{rootId}`, `reminder:{rootId}`) so a repeat replaces rather than stacks; different expenses still stack (owner wants ten buzzes).
- `notificationclick`: focus an open client and navigate to `url`, else `clients.openWindow(url)`.
- iOS requires the push to always show a notification (no silent pushes). Every push we send shows one.

## Client platform code (`@cc/web-platform`)

- `push.ts`: `usePushState()` (the table above), `subscribePush()` (permission → `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` → PUT), `unsubscribePush()`. React Query hooks for the device settings go in `@cc/web-data-access`.
- Web only; `zmp` returns `unsupported` and the UI hides.

## Constraints

- `DESIGN.md` ("The Friendly Ledger") and CLAUDE.md library rules: `Sheet`, `Button`, `Icon` (lucide), `Snackbar`, `InlineError`; theme tokens only; one primary per view; 44px targets; `text-base` fields; Be Vietnam Pro. Tests select by `fsl-*` and `data-testid`.
- Free Cloudflare plan: D1 reads are a daily budget. The 5-minute cron must cost one indexed query when nothing is due. Recipient lookups on expense create add a few reads per expense — acceptable, but batch (one `IN` query for subscriptions, not one per participant).
- Vietnamese first; all new copy `// REVIEW`.
- No new third-party services (no FCM project, no OneSignal). Browser push services only.

## Testing notes

- Unit: time-range parsing (including `"9h - 11h"`, `"05:00 - 07:00"`, garbage → none), due-time math in UTC+7, recipient filtering (actor excluded, guests excluded, switch off excluded), reminder rebuild on edit/complete/delete, 404/410 cleanup, VAPID JWT and payload encryption against a known vector.
- UI: each push-group state renders the right block; pill rules (second visit, not with install pill, ✕ permanent, hidden in zmp); title rename; no-email warning moved.
- Real devices (owner, over the tunnel): Android Chrome in browser and installed; iPhone installed (iOS 16.4+); iPhone Safari not installed shows the install row; Zalo webview shows unsupported.

## Left to the builder

- Web Push library vs own module; `injectManifest` vs `importScripts`.
- Exact Vietnamese copy (drafts above), the lead-time control's shape, blocked-state steps per OS.
- Whether subscribing back-fills reminders for already-planned sessions.
- Whether to log sends in `notification_logs`.

## Calls I made (not discussed with the owner)

- Payer with zero share is not "included" for the expense push.
- Lead-time choices 15/30/60/120 minutes; per device, not per account.
- 5-minute cron granularity.
- Admin who planned a session still gets its reminder.
- Late-planned sessions inside the lead window get no reminder.
- Sign-out unsubscribes the device; merges move subscriptions.
- Server without VAPID keys hides the feature.
- Rollback and enable of a planned session count as edits (reminders rebuilt, same push rules).
- Phones and tablets only: no pill and no push group on desktop.
