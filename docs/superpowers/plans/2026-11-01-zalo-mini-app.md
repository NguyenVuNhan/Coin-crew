# CoinCrew Zalo Mini App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run CoinCrew natively inside Zalo as a Mini App: silent Zalo recognition, Zalo sign-in, native share cards, gallery save, group-chat linking and adding members from Zalo friends.

**Architecture:** The API gains bearer sessions, CORS for the Mini App origin, `POST /api/auth/zalo-mini`, Zalo-tied participant slots and chat links (migration `0013`). `@fsl/web-common` gains a `PlatformBridge` (React context, default = browser behaviour) that every share/save/sign-in path goes through. A new `apps/zalo` shell supplies the `zmp-sdk` implementation and the Mini App build; `zmp-sdk` exists only there.

**Tech Stack:** Hono on Cloudflare Workers + D1 (Drizzle), `@cloudflare/vitest-plugin`; React 19, React Router, TanStack Query, Vite, Vitest/jsdom; `zmp-sdk` (≥ 2.35.0), `zmp-cli`.

**Spec:** `docs/superpowers/specs/2026-11-01-zalo-mini-app-design.md`. **Prerequisite:** `docs/superpowers/plans/2026-11-01-web-split.md` is merged (paths below assume `packages/web-common`).

## Global Constraints

- Migration file is `apps/api/migrations/0013_zalo_mini_app.sql`, additive only; Drizzle schema in `apps/api/src/db/schema.ts` matches it.
- The web build's behaviour does not change: cookie sessions, `navigator.share`/clipboard, `<a download>`, header layout. Everything new is keyed off `platform.kind === 'zmp'` or off request headers the web never sends.
- `zmp-sdk` and `zmp-cli` are dependencies of `apps/zalo` only.
- No account is created without the user tapping "Tiếp tục với tài khoản Zalo" (`consent: true`).
- A Zalo ID is only trusted when the server got it from Graph with a token; `devices.zalo_sub` and `participants.zalo_sub` are only written from server-verified values or by a group admin (friend picker / "Gắn").
- A Zalo-tied slot (`participants.zalo_sub` set, `user_id` null, `status = 'active'`) becomes that Zalo user's membership with no approval when they sign in (owner's decision).
- i18n: every new key exists in both `packages/web-common/src/i18n/en.ts` and `vi.ts`; every new `vi.ts` line ends with `// REVIEW`. Vietnamese copy fixed by the spec is used verbatim: "Tiếp tục với tài khoản Zalo", "Bạn là {name} phải không?", "Tiếp tục với tên {name}", "Đã lưu ảnh QR vào thư viện ảnh", "Chọn từ bạn bè Zalo", "Gắn {friend} với {person}", "Liên kết nhóm chat này với một nhóm CoinCrew", "Tạo nhóm mới", "Cần tên và ảnh Zalo để tạo tài khoản", "Đã dùng CoinCrew bằng Google? Hãy liên kết Zalo trên web trước", "Mở app ngân hàng → Quét QR → chọn ảnh từ thư viện".
- UI rules from `CLAUDE.md`: app wrappers (`Button`, `Sheet`, `Snackbar`, `InlineError`, `Icon`), theme colours only, `min-h-11` touch targets, keep existing `fsl-*` classes and `data-testid`s; new elements get new `fsl-*` classes.
- New Worker vars/secrets: `DEVICE_SECRET` (secret), `ZMP_ALLOWED_ORIGINS` (comma-separated). Test bindings in `apps/api/vitest.config.ts`: `DEVICE_SECRET: 'test-device-secret'`, `ZMP_ALLOWED_ORIGINS: 'https://h5.zdn.vn,http://localhost:3000'`.

## Review Focus

1. **Graph withholds the profile from Cloudflare IPs** (as `fetchZaloProfile` already handles): the consent sign-in must still create the user, using the client-sent `profile.name`/`avatar`. Test added in Task 4 (`consent with withheld profile uses the client name`).
2. **A stale or revoked bearer token** in the Mini App: a 401 must clear the stored token and re-run the handshake once, never loop. Test added in Task 7 (`401 clears the session token`) and Task 10 (`boot retries the handshake once after a 401`).
3. **The handshake fails** (Graph down, no network, SDK error): the app still renders as an anonymous guest; no blank screen. Test in Task 10 (`boot falls back to guest when the handshake fails`).
4. **The Zalo user already holds another slot in the group** when `linkZaloSlots` runs: the Zalo-tied slot is left alone, no second membership. Test in Task 4 (`linkZaloSlots skips a group where the user already has a slot`).
5. **The share sheet is cancelled or gallery permission denied**: no success snackbar; the save failure shows the existing failure copy, and the bank fallback instruction stays reachable. Tests in Task 8 (`cancelled share shows nothing`, `failed gallery save shows the failure text`).

---

## Part A: API

### Task 1: Migration 0013 and schema

**Files:**
- Create: `apps/api/migrations/0013_zalo_mini_app.sql`
- Modify: `apps/api/src/db/schema.ts` (`participants`, `devices`, new `zaloChatLinks`)
- Test: `apps/api/test/zalo-schema.test.ts`

**Interfaces:**
- Produces: `participants.zaloSub: text('zalo_sub')`; `devices.zaloSub: text('zalo_sub')`; `zaloChatLinks = sqliteTable('zalo_chat_links', { chatId (PK), tripId, linkedByUserId, createdAt })` with index `zalo_chat_links_trip_id_idx`; unique index `participants_trip_zalo_sub_unique` on `(trip_id, zalo_sub) WHERE zalo_sub IS NOT NULL`.

- [ ] **Step 1: Write the failing test**: `zalo-schema.test.ts`: after migrations, `INSERT` two participants in trip `T.tripId` with the same `zalo_sub` → second insert throws `UNIQUE`; same `zalo_sub` in two different trips → both succeed; `INSERT INTO zalo_chat_links` then `SELECT` returns the row; `UPDATE devices SET zalo_sub = 'z1'` succeeds.
- [ ] **Step 2: Run** `npm test -w @fsl/api -- zalo-schema` → FAIL (no such column).
- [ ] **Step 3: Write the SQL** exactly as spec §5 (including `ALTER TABLE devices ADD COLUMN zalo_sub text;`), and the Drizzle columns/table listed above.
- [ ] **Step 4: Run** `npm test -w @fsl/api` → all PASS.
- [ ] **Step 5: Commit** `feat(api): migration 0013 for Zalo Mini App`.

### Task 2: Bearer sessions and CORS

**Files:**
- Modify: `apps/api/src/auth/session.ts`, `apps/api/src/auth/routes.ts` (logout), `apps/api/src/app.ts`, `apps/api/src/env.ts`, `apps/api/vitest.config.ts`
- Create: `apps/api/src/lib/cors.ts`
- Test: `apps/api/test/bearer-cors.test.ts`

**Interfaces:**
- Produces: `readSessionToken(c: Context<AppBindings>): string | undefined` (Bearer first, then `sid` cookie) used by `getSessionUser` and logout; `corsMiddleware: MiddlewareHandler<AppBindings>` registered with `app.use('/api/*', corsMiddleware)` **before** `deviceMiddleware`; `Env.ZMP_ALLOWED_ORIGINS?: string`, `Env.DEVICE_SECRET?: string`.

- [ ] **Step 1: Write the failing tests** in `bearer-cors.test.ts`:
  - `bearer token signs the request in`: `memberSid(U.minh)` → `GET /api/me` with `Authorization: Bearer <sid>` and no cookie → body's user id is `U.minh`.
  - `bearer wins over cookie`: cookie `sid` of `U.an`, bearer of `U.minh` → `U.minh`.
  - `logout with bearer deletes that session`: `POST /api/auth/logout` with bearer → 204; the same bearer on `/api/me` is then signed out.
  - `allowed origin gets CORS headers`: `GET /api/health` with `Origin: https://h5.zdn.vn` → `access-control-allow-origin: https://h5.zdn.vn`, `access-control-expose-headers` contains `X-Device-Id`, `vary` contains `Origin`, no `access-control-allow-credentials`.
  - `preflight answers without D1`: `OPTIONS /api/trips/x` with that origin and `Access-Control-Request-Method: POST` → 204, `access-control-allow-headers` equals `Authorization, Content-Type, X-Link-Token, X-Device-Restore`, `access-control-allow-methods` includes `GET, POST, PATCH, DELETE`, and no `set-cookie` and no `x-device-id` header (device middleware not run).
  - `unknown origin gets no CORS headers`: `Origin: https://evil.example` → no `access-control-allow-origin`.
- [ ] **Step 2: Run** `npm test -w @fsl/api -- bearer-cors` → FAIL.
- [ ] **Step 3: Implement** `readSessionToken`, use it in `getSessionUser` and logout (logout still deletes the cookie); `corsMiddleware` parses `ZMP_ALLOWED_ORIGINS` (trim, drop empties), echoes an exact match, returns `c.body(null, 204)` for `OPTIONS` with an allowed origin, else continues. Add both test bindings.
- [ ] **Step 4: Run** `npm test -w @fsl/api` → all PASS.
- [ ] **Step 5: Commit** `feat(api): bearer sessions and CORS for the Zalo Mini App`.

### Task 3: Zalo-tied slot helpers

**Files:**
- Create: `apps/api/src/auth/zaloSlots.ts`
- Modify: `apps/api/src/participants/routes.ts` (`POST /trips/:id/people/pick`), `apps/api/src/access/actor.ts` (`resolveActor`), `apps/api/src/participants/merge.ts`
- Test: `apps/api/test/zalo-slots.test.ts`

**Interfaces:**
- Produces:
  - `deviceZaloSub(db: Db, deviceHash: string): Promise<string | null>`
  - `linkZaloSlots(db: Db, userId: string, zaloSub: string): Promise<number>`: for every `participants` row with `zalo_sub = zaloSub`, `user_id IS NULL`, `status = 'active'`, in a trip where the user has **no** participant yet → set `user_id = userId`; returns how many were linked; logs (`console.warn`) each skipped trip.
  - `claimZaloSlot(db: Db, deviceHash: string, tripId: string): Promise<string | null>`: if the device has a `zalo_sub` and no `device_participants` row for the trip, and an active, user-less participant with that `zalo_sub` exists → insert the `device_participants` row, return its id.

- [ ] **Step 1: Write the failing tests** (`seedTrip()` fixture; set `devices.zalo_sub` via SQL on the test device hash):
  - `pick copies the device's zalo_sub onto the slot`: device has `zalo_sub = 'z-an'`, guest picks `PID.A` → `participants.zalo_sub` of `PID.A` is `'z-an'`.
  - `pick never overwrites zalo_sub`: `PID.A` already `'z-other'` → stays `'z-other'`.
  - `pick from a plain device writes no zalo_sub`.
  - `a Zalo device is recognised on its slot without picking`: `PID.B.zalo_sub = 'z-binh'`, device `zalo_sub = 'z-binh'`, `GET /api/trips/t-1/people/picker` with the link token → `myPick === PID.B`.
  - `linkZaloSlots makes the slot a membership`: `PID.C.zalo_sub = 'z-chi'`, user `u-chi` → returns 1; `PID.C.user_id = 'u-chi'`; no `membership_requests` row.
  - `linkZaloSlots skips a group where the user already has a slot`: `u-chi` already owns `PID.B` in `t-1` → returns 0, `PID.C.user_id` stays null.
  - `linkZaloSlots ignores pending and merged slots`.
  - `merge carries zalo_sub to the survivor`: merge `PID.C` (zalo `'z-chi'`) into `PID.B` (none) → `PID.B.zalo_sub = 'z-chi'`.
- [ ] **Step 2: Run** `npm test -w @fsl/api -- zalo-slots` → FAIL.
- [ ] **Step 3: Implement** the three helpers; call `claimZaloSlot` in `resolveActor` right before it reads `device_participants` for a guest; in the pick route set `zalo_sub` with `WHERE zalo_sub IS NULL` from `deviceZaloSub`; in `merge.ts` copy `zalo_sub` to the survivor when it has none (in the same batch).
- [ ] **Step 4: Run** `npm test -w @fsl/api` → all PASS.
- [ ] **Step 5: Commit** `feat(api): Zalo-tied participant slots`.

### Task 4: `POST /api/auth/zalo-mini`

**Files:**
- Create: `apps/api/src/auth/zaloMini.ts`, `apps/api/src/auth/zaloMiniRoutes.ts`
- Modify: `apps/api/src/auth/zalo.ts` (`fetchZaloProfile` options), `apps/api/src/auth/routes.ts` (OAuth callback calls `linkZaloSlots`), `apps/api/src/app.ts`, `packages/core/src/api-types.ts`
- Test: `apps/api/test/zalo-mini.test.ts`

**Interfaces:**
- Consumes: `linkZaloSlots` (Task 3), `readSessionToken`/`createSession` (Task 2 / existing), `upsertIdentity` (existing).
- Produces:
  - `ApiErrorCode` gains `'ZALO_TOKEN_INVALID'`.
  - `@fsl/core` types: `ZaloMiniRequest = { accessToken: string; consent?: true; profile?: { name: string; avatar: string | null } }`; `ZaloMiniResponse = { status: 'signed_in'; sessionToken: string } | { status: 'guest'; deviceId: string }`.
  - `fetchZaloProfile(accessToken, opts?: { appSecret?: string })`: when `appSecret` is given, sends header `appsecret_proof: hex(HMAC-SHA256(appSecret, accessToken))`.
  - `zaloDeviceId(secret: string, zaloSub: string): Promise<string>` → `'z_' + base64url(HMAC-SHA256(secret, 'zalo:' + zaloSub))` (45 chars, under the device middleware's 64 limit).

- [ ] **Step 1: Write the failing tests** (mock `fetch` for `https://graph.zalo.me/v2.0/me` like `link-identity.test.ts`):
  - `sends appsecret_proof`: the Graph request carries `appsecret_proof` equal to the HMAC of `'test-zalo-secret'` over the token.
  - `known Zalo user is signed in silently`: user with `zalo_sub = 'z-minh'` → `{ status: 'signed_in', sessionToken }`; that token as bearer on `/api/me` → `U.minh`; **no** `set-cookie: sid`.
  - `unknown Zalo user stays a guest`: → `{ status: 'guest', deviceId }`, `deviceId` starts with `z_`, equals `zaloDeviceId('test-device-secret', 'z-new')`; no row added to `users`; `devices` row for `sha256(deviceId)` has `zalo_sub = 'z-new'`.
  - `same Zalo user gets the same deviceId on another phone` (two calls, different `X-Device-Restore`).
  - `consent creates the user and links slots`: `consent: true`, `PID.C.zalo_sub = 'z-new'` → `signed_in`; new user has `zalo_sub = 'z-new'`, `consent_at` set; `PID.C.user_id` is the new user.
  - `consent with withheld profile uses the client name`: Graph returns an error for `id,name,picture` and `{ id }` for `id` → user name is `profile.name`.
  - `silent sign-in also links slots`.
  - `bad token → 401 ZALO_TOKEN_INVALID`; `missing accessToken → 422 VALIDATION`; `ZALO_APP_ID unset → 503`.
  - `web Zalo OAuth sign-in links Zalo-tied slots` (existing callback test pattern from `auth.test.ts`).
- [ ] **Step 2: Run** `npm test -w @fsl/api -- zalo-mini` → FAIL.
- [ ] **Step 3: Implement** the route per spec §4: verify via `fetchZaloProfile(token, { appSecret: env.ZALO_APP_SECRET })`; signed-in path → `createSession` + `linkZaloSlots`; guest path → upsert `devices` (`id_hash = sha256(deviceId)`, `zalo_sub`); consent path → `upsertIdentity(db, 'zalo', { ...profile, name: withheld ? body.profile.name : profile.name, avatarUrl: withheld ? body.profile.avatar : profile.avatarUrl })` then session + `linkZaloSlots`. Graph failure → `console.warn('Zalo mini sign-in failed: …')` + 401. Register `app.route('/api', zaloMiniRoutes())`. In the OAuth callback, after `upsertIdentity`, call `linkZaloSlots(db, userId, profile.sub)`.
- [ ] **Step 4: Run** `npm test -w @fsl/api && npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(api): Zalo Mini App sign-in endpoint`.

### Task 5: Friends as members, "Gắn"

**Files:**
- Modify: `apps/api/src/participants/routes.ts` (`addPersonToTrip`, `PATCH /trips/:id/people/:pid`), `packages/core/src/api-types.ts`
- Test: `apps/api/test/zalo-friends.test.ts`

**Interfaces:**
- Produces: `POST /api/trips/:id/people` body accepts optional `zaloSub: string` (1–64 chars); `PATCH /api/trips/:id/people/:pid` accepts `{ zaloSub: string }`; `PickerView.people[]` and the trip snapshot's participant gain `zaloLinked: boolean` (never the raw ID).

- [ ] **Step 1: Write the failing tests**:
  - `admin adds a Zalo friend`: organiser Minh posts `{ name: 'Dũng', zaloSub: 'z-dung' }` → 201, row has `zalo_sub = 'z-dung'`.
  - `non-admin member cannot add with zaloSub` → 403 FORBIDDEN; same body without `zaloSub` still works as today.
  - `guest cannot add with zaloSub` → 403.
  - `same friend twice` → 409 CONFLICT.
  - `admin links a friend to an existing person`: PATCH `PID.A` `{ zaloSub: 'z-an' }` → 200, set.
  - `link never overwrites`: `PID.A` already linked → 409 CONFLICT; a person with `user_id` → 409 CONFLICT.
  - `picker exposes zaloLinked, not the id`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (admin = `actor.isAdmin || actor.isOrganiser`, as in the PATCH route). **Step 4: Run** `npm test -w @fsl/api` → PASS.
- [ ] **Step 5: Commit** `feat(api): add and link Zalo friends`.

### Task 6: Zalo chat links

**Files:**
- Create: `apps/api/src/zalo/chatRoutes.ts`
- Modify: `apps/api/src/app.ts`, `packages/core/src/api-types.ts`
- Test: `apps/api/test/zalo-chats.test.ts`

**Interfaces:**
- Produces:
  - `GET /api/zalo/chats/:chatId` → `{ linked: false }` | `{ linked: true; tripId: string; tripName: string; joinToken: string; isMember: boolean }`.
  - `POST /api/zalo/chats/:chatId/link` `{ tripId }` → 204.
  - `DELETE /api/zalo/chats/:chatId` → 204.
  - `GET /api/trips/:id/zalo-chats` → `{ chats: { chatId: string; createdAt: string }[] }` (admins only).
  - Core type `ZaloChatLookup` for the GET response.

- [ ] **Step 1: Write the failing tests**:
  - `lookup needs a verified Zalo identity`: plain device, no session → 401 UNAUTHENTICATED; device with `zalo_sub` → 200.
  - `unlinked chat` → `{ linked: false }`.
  - `link then lookup`: Minh (member) links `chat-1` to `t-1` → 204; a Zalo guest device looks up → `{ linked: true, tripId: 't-1', joinToken: T.groupToken, isMember: false }`.
  - `only users who may invite can link`: a signed-in non-member → 403; a guest → 401.
  - `relinking an already linked chat` by another group's member → 409 CONFLICT; by the same group's admin → 204 (moves).
  - `unlink is admin-only` → 403 for a plain member, 204 for organiser.
  - `chatId longer than 64 chars` → 422.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** ("may invite" = the same check `InviteSheet`'s data relies on; read it from the trip's actor permissions, `ensure(actor, 'invite')` or the existing equivalent). Each lookup logs `zalo chat lookup chat=<id> zalo=<sub>`. **Step 4: Run** `npm test -w @fsl/api` → PASS.
- [ ] **Step 5: Commit** `feat(api): link Zalo group chats to groups`.

## Part B: shared web app

### Task 7: Platform bridge, session store and API client

**Files:**
- Create: `packages/web-common/src/platform/index.ts`, `packages/web-common/src/platform/browser.ts`, `packages/web-common/src/platform/session.ts`, `packages/web-common/src/test/fakePlatform.ts`
- Modify: `packages/web-common/src/AppRoot.tsx`, `packages/web-common/src/api/client.ts`, `packages/web-common/src/test/render.tsx`, `packages/web-common/src/index.ts`
- Test: `packages/web-common/src/platform/__tests__/platform.test.tsx`, `packages/web-common/src/api/__tests__/client-platform.test.ts`

**Interfaces:**
- Produces:
  - `PlatformBridge` and `ShareCard` exactly as spec §2, with `kind: 'web' | 'zmp'`, plus `ZaloFriend = { zaloId: string; name: string; avatar: string }`.
  - `browserPlatform: PlatformBridge` (`kind: 'web'`, `apiBase: ''`, `localStorage` storage, today's share/save code moved from `lib/qr.ts` / `InviteSheet` / `lib/remind.ts`, Zalo methods return `null`).
  - `PlatformProvider({ platform, children })`, `usePlatform(): PlatformBridge` (default `browserPlatform`).
  - `sessionStore`: `{ init(p: PlatformBridge): Promise<void>; token(): string | null; setToken(t: string | null): Promise<void>; deviceId(): string | null; setDeviceId(id: string): Promise<void>; apiBase(): string }`. `init` preloads `sessionToken` and `deviceId` from `p.storage` into memory so `apiFetch` stays synchronous.
  - `AppRoot({ platform = browserPlatform, basename }: { platform?: PlatformBridge; basename?: string })` wraps `PlatformProvider` and passes `basename` to `BrowserRouter` (the Mini App is served under a path prefix); `bootApp(platform?)` becomes `async` and awaits `sessionStore.init`.
  - `renderAt(ui, { route, path, platform })`: new optional `platform`, default `browserPlatform`.
  - `fakePlatform(overrides?: Partial<PlatformBridge>): PlatformBridge & { calls: Record<string, unknown[][]> }` for tests (`kind: 'zmp'`, `apiBase: 'https://api.test'`, in-memory storage).

- [ ] **Step 1: Write the failing tests**:
  - `client-platform.test.ts`: with `sessionStore` initialised from `browserPlatform` and no token, `apiFetch('/api/me')` calls `fetch('/api/me', { credentials: 'include' })` with no `Authorization` (web unchanged); with `fakePlatform` + token `'s1'`, calls `fetch('https://api.test/api/me', …)` with `Authorization: Bearer s1` and `credentials: 'omit'`; `X-Device-Id` response header is saved through `platform.storage`; `401 clears the session token` (store token null and `storage.remove('sessionToken')` called).
  - `platform.test.tsx`: `usePlatform()` without a provider returns `browserPlatform`; inside `PlatformProvider` returns the fake.
- [ ] **Step 2: Run** `npm test -w @fsl/web-common -- platform client-platform` → FAIL.
- [ ] **Step 3: Implement**; `apiFetch` reads `sessionStore` instead of `localStorage` for the device ID (key name `deviceId` unchanged on web).
- [ ] **Step 4: Run** `npm test -w @fsl/web-common && npm run typecheck` → PASS (all existing tests unchanged).
- [ ] **Step 5: Commit** `feat(web): platform bridge and bearer-aware API client`.

### Task 8: Shares and saves through the platform

**Files:**
- Create: `packages/web-common/src/lib/shareCards.ts`
- Modify: `components/InviteSheet.tsx`, `components/YourTransfers.tsx`, `screens/PersonScreen.tsx`, `components/PayQr.tsx`, `screens/PayScreen.tsx`, `components/ExpenseDetails.tsx`, `lib/qr.ts`, `lib/remind.ts`, `i18n/en.ts`, `i18n/vi.ts` (all under `packages/web-common/src/`); `apps/web/public/brand/share-card.png` (1200×630, brand colours, logo + "CoinCrew (Tiền Đâu)")
- Test: `packages/web-common/src/lib/__tests__/shareCards.test.ts`, `packages/web-common/src/components/__tests__/zmp-share-save.test.tsx`

**Interfaces:**
- Consumes: `usePlatform`, `ShareCard`, `fakePlatform` (Task 7).
- Produces: `inviteCard(lang, view, origin): ShareCard`, `remindCard(lang, input, origin): ShareCard`, `sportBillCard(lang, input, origin): ShareCard`. `path` values: invite and remind `j/<groupToken>`; sport bill `t/<tripId>/expenses/<expenseId>?token=<groupToken>`. `title` ≤100 chars and `description` ≤400 (truncate with `…`). `thumbnailUrl = origin + '/brand/share-card.png'` (sport bill: the existing `/j/<token>/e/<id>/qr.png` when a QR exists). `text`/`url` carry today's `remindText` / `sportShareText` / invite text so the web path is byte-identical.
  i18n keys: `share.inviteTitle`, `share.inviteDescription`, `share.remindTitle`, `share.sportTitle`, `pay.savedToGallery` ("Đã lưu ảnh QR vào thư viện ảnh" / "QR saved to your photos"), `pay.bankFallback` ("Mở app ngân hàng → Quét QR → chọn ảnh từ thư viện" / "Open your bank app → Scan QR → pick the image from your photos").

- [ ] **Step 1: Write the failing tests**:
  - `shareCards.test.ts`: each builder's `path` matches the formats above; a 150-char group name gives a 100-char title ending in `…`; `text` equals today's `remindText(...)` output for the same input.
  - `zmp-share-save.test.tsx` (render with `fakePlatform`): Invite → `platform.share` called once with `path: 'j/gtok-1'`; `cancelled share shows nothing` (share resolves `'cancelled'` → no snackbar/"copied" text); Save QR → `platform.saveImage` called with a `Blob` and the ref-code file name, then "QR saved to your photos" shows; `failed gallery save shows the failure text` (existing `pay.shareFailed`); bank button with `openExternal` → `'blocked'` shows `pay.bankFallback` and a Save QR button next to it.
  - Existing web tests for invite/remind/save stay green unmodified (they run on `browserPlatform`).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**: components call `usePlatform().share/saveImage/openExternal`; `browserPlatform` holds today's logic. **Step 4: Run** `npm test -w @fsl/web-common` → PASS; i18n parity test passes.
- [ ] **Step 5: Commit** `feat(web): native share cards and gallery save via the platform`.

### Task 9: Header and Zalo's capsule

**Files:**
- Modify: `packages/web-common/src/styles/globals.css`, `components/Screen.tsx`, `screens/MemberTrip.tsx`, `screens/GuestTrip.tsx`, `screens/Settings.tsx` (hint only), `i18n/en.ts`, `i18n/vi.ts`
- Test: `packages/web-common/src/components/__tests__/zmp-header.test.tsx`

**Interfaces:**
- Consumes: `usePlatform` (Task 7).
- Produces: CSS custom properties `--zmp-safe-top` and `--zmp-capsule-width` (default `0px` on `:root`); `Screen` adds `fsl-screen--zmp` to the root when `platform.kind === 'zmp'`; under that class the header gets `padding-top: var(--zmp-safe-top)` (height grows by it) and `.fsl-screen__header-inner` gets `padding-right: calc(1rem + var(--zmp-capsule-width))`. i18n `settings.zaloChatHint`: "Mở CoinCrew từ menu của nhóm chat Zalo để liên kết nhóm chat đó." / "Open CoinCrew from your Zalo group chat's menu to link that chat."

- [ ] **Step 1: Write the failing tests**:
  - web platform: `MemberTrip` header shows `.fsl-member__invite` with its text label and the `AccountMenu`; no `fsl-screen--zmp` (unchanged).
  - zmp platform: root has `fsl-screen--zmp`; `.fsl-member__invite` has an accessible name "Invite" but no visible text span; `.fsl-member__settings` present; **no** `.fsl-account-menu` in the header; `Home` header still shows `.fsl-account-menu`.
  - Same for `GuestTrip`'s header actions.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (variables only in `globals.css`; no new CSS files). **Step 4: Run** `npm test -w @fsl/web-common` → PASS (style guard included).
- [ ] **Step 5: Commit** `feat(web): header leaves room for Zalo's capsule`.

### Task 10: Boot handshake, Zalo sign-in and the WhoAreYou banner

**Files:**
- Create: `packages/web-common/src/platform/zaloSession.ts`, `packages/web-common/src/components/ZaloSignIn.tsx`
- Modify: `packages/web-common/src/AppRoot.tsx` (`bootApp`), `components/SignInButtons.tsx`, `screens/WhoAreYou.tsx`, `i18n/en.ts`, `i18n/vi.ts`
- Test: `packages/web-common/src/platform/__tests__/zaloSession.test.ts`, `packages/web-common/src/screens/__tests__/zmp-signin.test.tsx`

**Interfaces:**
- Consumes: `POST /api/auth/zalo-mini` + `ZaloMiniResponse` (Task 4), `sessionStore` (Task 7), `findSimilarNames` (`@fsl/core`).
- Produces:
  - `zaloHandshake(p: PlatformBridge): Promise<'signed_in' | 'guest' | 'skipped'>`: no-op `'skipped'` on web or when `zaloAccessToken()` is null; on `signed_in` stores the token; on `guest` stores the `deviceId`; on any error resolves `'guest'` without storing anything. `bootApp` awaits it before the first render when `p.kind === 'zmp'`, retrying once if the stored token gets a 401.
  - `zaloSignIn(p): Promise<'signed_in' | 'declined' | 'failed'>`: `zaloUserInfo()` → `'declined'` stops; else posts `{ accessToken, consent: true, profile }`, stores the token, invalidates `['me']`, and caches the name in `sessionStore` storage key `zaloName`.
  - `<ZaloSignIn onDone?>`: the Google warning line (link to `APP_ORIGIN`), primary button "Tiếp tục với tài khoản Zalo", inline `InlineError`-styled note `signIn.zaloDeclined` on decline. `SignInButtons` renders it instead of OAuth buttons when `platform.kind === 'zmp'`.
  - WhoAreYou (zmp only): `<ZaloSignIn>` at the top for guests; once a Zalo name is known, `findSimilarNames(name, picker.people)` → banner `fsl-who__zalo-match` "Bạn là {name} phải không?" with primary button "Tiếp tục với tên {name}" that picks that person; the card is pre-selected.
  - i18n: `signIn.zaloContinue`, `signIn.zaloDeclined`, `signIn.zaloGoogleWarning`, `who.zaloMatch`, `who.zaloMatchContinue` (Vietnamese copy from Global Constraints).

- [ ] **Step 1: Write the failing tests**:
  - `zaloSession.test.ts`: `signed_in` stores token; `guest` stores deviceId and no token; `boot falls back to guest when the handshake fails` (fetch rejects → `'guest'`, nothing stored, no throw); `boot retries the handshake once after a 401` (stored token → `/api/me` 401 → one new handshake call, not two); web platform → `'skipped'`, no fetch.
  - `zmp-signin.test.tsx`: Landing on zmp shows "Continue with your Zalo account" and the Google warning, no Google button; tap → declined → `signIn.zaloDeclined` text, no POST; tap → granted → POST body has `consent: true` and the profile; WhoAreYou with Zalo name "An" and people An/Bình/Chi → banner "Are you An?", tapping "Continue as An" posts `/people/pick` with `PID.A`; web WhoAreYou shows no banner.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `npm test -w @fsl/web-common` → PASS.
- [ ] **Step 5: Commit** `feat(web): Zalo handshake, sign-in and "Bạn là…?" banner`.

## Part C: Mini App shell and real-device gate

### Task 11: `apps/zalo` shell and the `zmp-sdk` platform

**Files:**
- Create: `apps/zalo/package.json` (`@fsl/zalo`; deps `@fsl/web-common`, `react`, `react-dom`, `zmp-sdk`; devDeps `vite`, `@vitejs/plugin-react`, `@tailwindcss/vite`, `zmp-cli`, `vitest`, `jsdom`; scripts `dev`, `build`, `deploy`, `test`, `typecheck`), `apps/zalo/tsconfig.json`, `apps/zalo/vite.config.ts`, `apps/zalo/index.html`, `apps/zalo/app-config.json`, `apps/zalo/src/main.tsx`, `apps/zalo/src/platform/zaloMiniApp.ts`, `apps/zalo/.env.example` (`VITE_API_ORIGIN=`)
- Test: `apps/zalo/src/platform/__tests__/zaloMiniApp.test.ts`, `apps/zalo/src/__tests__/no-sdk-in-web.test.ts`

**Interfaces:**
- Consumes: `PlatformBridge`, `AppRoot`, `bootApp` (Tasks 7, 10).
- Produces: `createZaloPlatform(sdk: typeof import('zmp-sdk'), apiOrigin: string): PlatformBridge` (`kind: 'zmp'`). Mapping: `share` → `openShareSheet({ type: 'zmp_deep_link', data: { title, description, thumbnail: thumbnailUrl, path } })`, `status '0'` → `'cancelled'`, thrown → `'failed'`; `saveImage` → base64 of the PNG → `saveImageToGallery({ imageBase64Data })`; `openExternal` → `openWebview({ url, config: { style: 'normal' } })` (`'blocked'` on throw); `storage` → `getItem`/`setItem`/`removeItem`; `zaloAccessToken` → `getAccessToken()` (`null` on throw); `zaloUserInfo` → `authorize({ scopes: ['scope.userInfo'] })` then `getUserInfo({ autoRequestPermission: true, avatarType: 'large' })`, error code `-1401` or `-201` → `'declined'`; `chatContext` → `getContextAsync()`, `GROUP_CHAT` → `{ type: 'group', id }`, empty → `null`; `pickZaloFriends(max)` → `openProfilePicker({ maxProfile: max })`, keep entries with `code === 0`. `main.tsx`: `configAppView({ actionBar: { hide: true }, statusBarType: 'transparent' })`, set `--zmp-safe-top` from `getSystemInfo().statusBarHeight` (px) and `--zmp-capsule-width: 96px` on `document.documentElement`, then `await bootApp(platform)` and render `<AppRoot platform={platform} basename={…} />`, where the basename is the path prefix Zalo serves the app under (from `window.location.pathname` up to and including the app's root segment as `zmp-cli` documents it; confirmed in Task 12 Step 2 by opening a `j/<token>` share card). Add a unit test: `/zapps/123/j/gtok-1` with basename `/zapps/123` routes to the join screen. Vite: `build.outDir: 'dist'`, `base: './'`, `@` alias to `../../packages/web-common/src`, no PWA; `VITE_API_ORIGIN` required at build (throw if empty).

- [ ] **Step 1: Write the failing tests**: `zaloMiniApp.test.ts` with a hand-made fake `sdk` object (no real `zmp-sdk` calls): each mapping above, including `-1401` → `'declined'`, share `status: '0'` → `'cancelled'`, picker drops `code: -1` entries, `getContextAsync` `{ type: '', id: '' }` → `null`. `no-sdk-in-web.test.ts`: after `npm run build -w @fsl/web` output exists, no file under `apps/api/public/assets` contains `zmp-sdk` or `openShareSheet` (skip with a clear message if the build output is missing).
- [ ] **Step 2: Run** `npm test -w @fsl/zalo` → FAIL. **Step 3: Implement**; `app-config.json` per the current `zmp-cli` docs (title "CoinCrew (Tiền Đâu)", header hidden, `listCSS`/`listSyncJS` matching the Vite output). **Step 4: Run** `npm test -w @fsl/zalo && VITE_API_ORIGIN=https://example.workers.dev npm run build -w @fsl/zalo` → PASS; `apps/zalo/dist/index.html` exists.
- [ ] **Step 5: Commit** `feat(zalo): Mini App shell and zmp-sdk platform`.

### Task 12: Real-device gate (owner, manual)

Nothing in Tasks 13–14 is built until this passes. Done by the owner with the planner; record results in the spec under a new "Verified on device" heading.

- [ ] **Step 1:** Deploy the API (`npm run deploy -w @fsl/api`, with `DEVICE_SECRET` set as a secret and `ZMP_ALLOWED_ORIGINS` set) and the Mini App to Zalo's testing environment (`npm run deploy -w @fsl/zalo`).
- [ ] **Step 2:** On the owner's phone, open the Mini App and read the Worker log for the CORS `Origin` and the handshake. Expected: signed in silently as the existing Zalo account (proves `zalo_sub` match). Put the real origin(s) in `ZMP_ALLOWED_ORIGINS`.
- [ ] **Step 3:** With a second Zalo account (a friend), use a debug build's `pickZaloFriends(1)` from account A to pick account B, and compare B's picked `id` with B's own handshake `zalo_sub` in the log. Expected: equal. If not: stop, Task 14 is cancelled and the owner decides.
- [ ] **Step 4:** Open the Mini App from a Zalo group chat's extended menu; log `getContextAsync()`. Expected: `GROUP_CHAT` with a long, non-sequential id. If short/sequential: stop and raise per spec §8 before Task 13.
- [ ] **Step 5:** Measure the capsule width and status bar on iOS and Android; adjust `--zmp-capsule-width` in `apps/zalo/src/main.tsx` if 96px is wrong. Check share card, gallery save, bank deep link (note whether `openWebview` hands off to the bank app).

## Part D: Zalo-only features

### Task 13: Group chat → group

**Files:**
- Create: `packages/web-common/src/components/LinkChatSheet.tsx`, `packages/web-common/src/platform/useChatRoute.ts`
- Modify: `packages/web-common/src/AppRoot.tsx` (mount `useChatRoute`), `screens/Settings.tsx` (linked-chats list + unlink for admins, hint from Task 9), `i18n/en.ts`, `i18n/vi.ts`
- Test: `packages/web-common/src/components/__tests__/zalo-chat-link.test.tsx`

**Interfaces:**
- Consumes: `GET/POST/DELETE /api/zalo/chats/...`, `GET /api/trips/:id/zalo-chats` (Task 6), `platform.chatContext` (Task 7), `<ZaloSignIn>` (Task 10).
- Produces: `useChatRoute()`: once per app start on zmp, if `chatContext()` is a group → lookup; linked + member → navigate `/t/<tripId>`; linked + not member → `/j/<joinToken>`; not linked → open `LinkChatSheet`. `LinkChatSheet` (app `Sheet`): title `zaloChat.linkTitle` "Liên kết nhóm chat này với một nhóm CoinCrew", the user's groups where they may invite (from the existing groups query), and "Tạo nhóm mới" → `/trips/new?zaloChat=<chatId>`; `CreateTrip` links the chat after creating when that param is present. Guests see `<ZaloSignIn>` in the sheet first. i18n: `zaloChat.linkTitle`, `zaloChat.createNew`, `zaloChat.linked`, `zaloChat.unlink`, `settings.zaloChats`.

- [ ] **Step 1: Write the failing tests**: linked chat + member → location `/t/t-1`; linked + not member → `/j/gtok-1`; unlinked → sheet lists groups, choosing one POSTs `/api/zalo/chats/chat-1/link` `{ tripId }` and navigates; "Create new group" goes to `/trips/new?zaloChat=chat-1`; web platform → no lookup request at all; `chatContext` null → no request; Settings (admin, zmp) lists a linked chat with Unlink → DELETE.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `npm test -w @fsl/web-common` → PASS.
- [ ] **Step 5: Commit** `feat(web): open the group linked to a Zalo chat`.

### Task 14: Add members from Zalo friends

**Files:**
- Create: `packages/web-common/src/components/ZaloFriendPicker.tsx`
- Modify: `screens/CreateTrip.tsx`, `screens/People.tsx`, `i18n/en.ts`, `i18n/vi.ts`
- Test: `packages/web-common/src/components/__tests__/zalo-friends.test.tsx`

**Interfaces:**
- Consumes: `POST /api/trips/:id/people` with `zaloSub`, `PATCH /api/trips/:id/people/:pid` with `zaloSub`, `zaloLinked` (Task 5); `platform.pickZaloFriends` (Task 7); `findSimilarNames`.
- Produces: `<ZaloFriendPicker tripId? existing={people} onAdded>`: secondary `Button` `fsl-zalo-friends` "Chọn từ bạn bè Zalo", shown only when `platform.kind === 'zmp'` and the viewer is admin/organiser (or creating the group). After picking: friends whose name `findSimilarNames`-matches a person with `zaloLinked: false` and no member get a row "Gắn {friend} với {person}" (PATCH) with "Thêm mới" as the alternative; others are added with `{ name, zaloSub }`; `409` on a friend shows `zaloFriends.alreadyIn` and continues with the rest. In `CreateTrip` (no trip yet) picked friends join the `PeopleInput` list carrying `zaloSub`, sent with the create request (extend its people entries with optional `zaloSub`, same admin rule: the creator is organiser). i18n: `zaloFriends.button`, `zaloFriends.linkTo`, `zaloFriends.addNew`, `zaloFriends.alreadyIn`.

- [ ] **Step 1: Write the failing tests**: hidden on web; hidden for a non-admin member on zmp; admin picks Dũng + An → An matches existing An → row "Link An to An" → tap → PATCH `PID.A` `{ zaloSub }`; Dũng → POST `{ name: 'Dũng', zaloSub }`; 409 → "already in this group" text, other adds still sent; CreateTrip sends `zaloSub` on picked people.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (CreateTrip's create endpoint: extend server-side people validation with optional `zaloSub`, test in `apps/api/test/zalo-friends.test.ts`: `creating a group with Zalo friends stores zalo_sub`). **Step 4: Run** `npm test --workspaces --if-present && npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat: add group members from Zalo friends`.

### Task 15: Finish

- [ ] **Step 1:** `npm test --workspaces --if-present && npm run typecheck && npm run e2e` → all PASS.
- [ ] **Step 2:** i18n parity and `// REVIEW` check: `grep -c "// REVIEW" packages/web-common/src/i18n/vi.ts` grew by the number of new keys.
- [ ] **Step 3:** Update `CLAUDE.md` with one line under UI: "`usePlatform()` for share/save/sign-in; never call `navigator.share` or `zmp-sdk` from screens."
- [ ] **Step 4:** Commit `docs: platform bridge rule`.
