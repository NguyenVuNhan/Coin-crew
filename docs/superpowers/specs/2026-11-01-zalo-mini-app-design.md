# CoinCrew inside Zalo: native Zalo Mini App (`zmp-sdk`)

Status: design, approved in brainstorming on 2026-11-01 (incl. the web / zalo / common split). Branch: `feat/zalo-mini-app`.

## Intent and why

CoinCrew groups already live in Zalo chats: people paste `/j/:token` links there and pay by VietQR from
their banking app. A Zalo Mini App (`https://zalo.me/s/<mini_app_id>/...`) lets the same app open
**inside** Zalo: instantly, already knowing who you are, with native share cards and one-tap saving of QR
images. The owner's goal is growth and time-in-app: friends meet CoinCrew where they already talk, and
every share drops an interactive card back into a chat.

Every existing screen and function comes along; `@fsl/core` and the `@fsl/web` screens are reused as they
are. The Mini App is a second build of the same web app, plus a thin platform layer.

## Goals

1. A Mini App build of `@fsl/web` that runs inside Zalo with all current features.
2. Silent recognition: a person who has ever signed in with Zalo lands signed in, no popup.
3. Guests stay guests, but their claimed slot follows their Zalo account across phones.
4. Explicit "Tiếp tục với tài khoản Zalo" sign-in with name and avatar (consent popup), and a
   "Bạn là {name} phải không?" shortcut on WhoAreYou.
5. Native Zalo share cards for invites, payment reminders and sport bills.
6. One-tap save of the VietQR and sport-bill PNGs to the phone's gallery.
7. Opening CoinCrew from a Zalo group chat's menu leads to the CoinCrew group linked to that chat.
8. Adding group members straight from the user's Zalo friends.

## Non-goals

- **Push / OA notifications.** Zalo only sends them through a business-owned Official Account the user
  follows (or paid ZNS by phone number), and its Open API requires a fixed server IP that Cloudflare
  Workers don't have. Deferred to its own project. "Remind" uses the share card instead.
- Phone number access (`getPhoneNumber`): reviewed by Zalo, not needed.
- Google sign-in inside the Mini App: Google blocks embedded webviews. Google-only users link Zalo instead.
- Zalo payments / checkout, ads, camera, location.
- Any change to how the web app behaves on the open web.

## Anti-goals (a failure even if it works)

- The web bundle grows, or the web app's behaviour changes, because of Mini App code.
- An account gets created for someone without them tapping a Zalo sign-in button.
- A guessed or forged Zalo ID / chat ID gives access to a group someone could not otherwise open.
- Header buttons collide with Zalo's "··· | ×" capsule.
- Forking screens into Mini App copies.

## Constraints

- Free tiers: the Mini App bundle is hosted by Zalo; the API stays on the existing Cloudflare Worker
  (`coin-crew`, `workers.dev`) and D1 Free plan. No new servers.
- The Mini App is registered under the **same Zalo App ID** (`ZALO_APP_ID`) that "Sign in with Zalo" uses
  today. Zalo user IDs are scoped to the Zalo App, so the ID the Mini App sees equals `users.zalo_sub`.
  (Owner confirmed the App ID. That the IDs match is a reading of the docs: verify with one real account
  before relying on it in production.)
- i18n: 100% key parity between `packages/web-common/src/i18n/en.ts` and `vi.ts`; every new `vi.ts` line ends with
  `// REVIEW`.
- UI rules from `CLAUDE.md`: shadcn + app wrappers, theme only in `globals.css`, `fsl-*` classes and
  `data-testid` stay on their elements, touch targets ≥44px, fields at 16px.
- Migrations already run to `0012`; the new one is **`0014_zalo_mini_app.sql`**, additive only.

## What Zalo gives us (research summary)

| Without a popup | Only after a consent popup |
|---|---|
| `getAccessToken()`: token that resolves only the user's app-scoped ID (no popup since SDK 2.35.0) | `authorize({ scopes: ['scope.userInfo'] })` / `getUserInfo({ autoRequestPermission: true, avatarType: 'large' })`: name + avatar; declining gives `-1401` |
| `getContextAsync()`: `{ type: 'USER_CHAT' \| 'GROUP_CHAT' \| '', id }` when opened from a chat's extended menu; empty otherwise | |
| `getRouteParams()`, `getSystemInfo()`, `getAppInfo()` | |

Also used: `openShareSheet` (`zmp_deep_link`: `title` ≤100 chars, `thumbnail` URL required,
`description` ≤400, `path`), `saveImageToGallery`, `openProfilePicker` (1–10 friends, each with app-scoped
`id`, `name`, `avatar`), `configAppView`, `setItem`/`getItem` native storage, `openWebview`.

## Design

### 1. Split the web app into web, zalo and common (step 0, ships first)

Owner's decision. The split is a pure move with no behaviour change, done and merged before any Zalo
work; all existing unit tests and the Playwright e2e run stay green. Laid out so an Nx workspace can
adopt it later: each project has its own `package.json` (`build` / `test` / `typecheck` scripts where
they apply) and `tsconfig`, and no project reaches into another's files by relative path.

| Project | Holds | Output |
|---|---|---|
| `packages/web-common` (`@fsl/web-common`) | `App.tsx`, `screens/`, `components/` (incl. shadcn `ui/`), `lib/`, `i18n/`, `api/client.ts`, `styles/globals.css`, `config.ts`, `platform/` (the `PlatformBridge` interface + React context), test setup and the tests next to that code, `components.json` | none; consumed as source by the two apps |
| `apps/web` (`@fsl/web`) | `main.tsx`, `index.html`, `public/`, Vite config with PWA, `src/platform/web.ts` | `apps/api/public` (unchanged) |
| `apps/zalo` (`@fsl/zalo`) | `main.tsx`, `index.html`, Vite config, `app-config.json`, `zmp-cli` (dev), `zmp-sdk`, `src/platform/zaloMiniApp.ts` | `apps/zalo/dist` → `zmp deploy` |

- `@fsl/web-common` exports `<App platform={...} />` (and what tests need). Each app's `main.tsx`
  creates its platform and renders `App`. The `@/` alias keeps pointing at `web-common/src` inside
  that package.
- `zmp-sdk` is a dependency of `apps/zalo` only, so the web bundle cannot contain it; no dynamic-import
  trick, no `VITE_TARGET` flag.
- Repo references move with it: `.mcp.json` (`--cwd packages/web-common`), shadcn `add` runs in
  `packages/web-common`, `CLAUDE.md` UI section paths, `style-guard.test.ts` paths,
  `scripts/render-og-images.mjs` (`apps/web/public/og` stays in `apps/web`). Root scripts (`dev`,
  `e2e`, `tunnel`) keep calling `@fsl/web`.
- `apps/zalo` scripts: `dev` (`zmp start` or Vite with the API proxy), `build` (Vite →
  `dist`, `VITE_API_ORIGIN=https://coin-crew.<subdomain>.workers.dev` from env, never hard-coded),
  `deploy` (`zmp deploy`). `app-config.json` holds title, hidden Zalo header, status bar, and
  `listCSS`/`listSyncJS` as `zmp-cli` expects.
- Routing: the Mini App runs the same React Router routes. Card paths (`j/<token>`, `t/<tripId>/...`)
  arrive through the Mini App URL; boot reads them and navigates.

### 2. Platform bridge

`packages/web-common/src/platform/index.ts` exports `PlatformBridge`, `PlatformProvider` and
`usePlatform()`. `apps/web/src/platform/web.ts` wraps today's behaviour; `apps/zalo/src/platform/zaloMiniApp.ts`
wraps `zmp-sdk`. A shared `webDefaults` helper in web-common may hold the browser implementations both reuse. Screens call the bridge, never `navigator.share` or `zmp-sdk` directly.

```ts
interface PlatformBridge {
  kind: 'web' | 'zmp';
  apiBase: string;                                 // '' on web, VITE_API_ORIGIN in the Mini App
  storage: { get(k: string): Promise<string | null>; set(k: string, v: string): Promise<void>; remove(k: string): Promise<void> };
  share(card: ShareCard): Promise<'shared' | 'copied' | 'cancelled' | 'failed'>;
  saveImage(png: Blob, fileName: string): Promise<'saved' | 'failed'>;
  openExternal(url: string): Promise<'opened' | 'blocked'>;
  // Mini App only; web returns null / no-ops:
  zaloAccessToken(): Promise<string | null>;
  zaloUserInfo(): Promise<{ name: string; avatar: string } | 'declined' | null>;
  chatContext(): Promise<{ type: 'user' | 'group'; id: string } | null>;
  pickZaloFriends(max: number): Promise<Array<{ zaloId: string; name: string; avatar: string }> | null>;
}
interface ShareCard { title: string; description: string; path: string; thumbnailUrl: string; text: string; url: string }
```

- Detection: none at runtime; the app that is running passes its own platform.
- Web `share` keeps today's `navigator.share` → clipboard fallback using `text`/`url`; Mini App `share`
  uses `openShareSheet({ type: 'zmp_deep_link', data: { title, description, thumbnail, path } })`,
  where `status: '0'` → `'cancelled'`.
- Web `saveImage` keeps today's `<a download>`; Mini App converts the PNG to base64 and calls
  `saveImageToGallery({ imageBase64Data })`.
- Storage: web uses `localStorage`; Mini App uses `zmp-sdk` `getItem`/`setItem`.
- `usePlatform()` reads the context; tests in web-common inject a fake platform.

### 3. Session token alongside the cookie

Inside Zalo the app's origin is Zalo's, so every API call is cross-site and the `sid` cookie can't be
relied on (iOS webviews block it).

- **Server (`apps/api/src/auth/session.ts`):** `getSessionUser` reads `Authorization: Bearer <sid>` first,
  then the `sid` cookie. Same hash lookup, same expiry.
- Sign-in endpoints used by the Mini App return `{ sessionToken }` in the JSON body (they never set the
  cookie for these requests). Logout accepts the bearer token and deletes that session.
- **Client (`packages/web-common/src/api/client.ts`):** `apiFetch` prefixes `platform.apiBase`, adds
  `Authorization` when a stored session token exists, and uses `credentials: 'omit'` when `apiBase` is
  cross-origin (`'include'` stays on web). `X-Device-Restore` / `X-Device-Id` keep working through
  `platform.storage`. A 401 clears the stored token.
- **CORS** (`apps/api/src/app.ts`, `/api/*` only): `Access-Control-Allow-Origin` echoes the request origin
  only if it is in `ZMP_ALLOWED_ORIGINS` (comma-separated Worker var; production holds the Mini App
  origin(s), e.g. `https://h5.zdn.vn` and `https://h5.zadn.vn`; dev adds the `zmp start` localhost origin).
  Allowed headers: `Authorization, Content-Type, X-Link-Token, X-Device-Restore`. Exposed:
  `X-Device-Id`. No `Allow-Credentials`. Preflight `OPTIONS` answered without hitting D1. Unknown origins
  get no CORS headers. The exact Mini App origin is confirmed on the first real deploy.

### 4. Zalo identity

**`POST /api/auth/zalo-mini`** `{ accessToken }`:

1. Server calls `GET https://graph.zalo.me/v2.0/me?fields=id,name,picture` with header
   `access_token: <token>` and `appsecret_proof = HMAC-SHA256(ZALO_APP_SECRET, accessToken)` (hex). A
   failure → `401 ZALO_TOKEN_INVALID`, logged with the Zalo error (as #27 does for OAuth).
2. If a user has `zalo_sub = id`: create a session, return `{ status: 'signed_in', sessionToken }`.
3. Otherwise **no account is created**. Return `{ status: 'guest', deviceId }` where
   `deviceId = 'z_' + base64url(HMAC-SHA256(DEVICE_SECRET, 'zalo:' + id))`. The client stores it as its
   device ID, so every phone on that Zalo account shares the same `device_participants` claims. The
   server upserts the `devices` row for that hash with `zalo_sub = id` (§5), so later requests carrying
   this device ID are known to belong to that verified Zalo account. The binding is only ever written
   here, from a verified token, never from a client-sent ID.

On boot the Mini App calls `getAccessToken()` then this endpoint before the first screen query.
Target: first screen interactive in under 2 s on a mid-range phone; the handshake runs in parallel with
loading the route's chunk.

**"Tiếp tục với tài khoản Zalo"** (Mini App replacement for the "Sign in with Zalo" OAuth button, in the
sign-in sheet and AccountMenu):

1. `zaloUserInfo()` (`authorize` + `getUserInfo`, `avatarType: 'large'`).
2. Declined (`-1401` / `-201`) → stay a guest, show an inline note "Cần tên và ảnh Zalo để tạo tài khoản"
   with a retry; nothing else changes.
   Before the popup, the sign-in sheet shows one line: "Đã dùng CoinCrew bằng Google? Hãy liên kết Zalo
   trên web trước" with a link to the web app, plus "Tiếp tục" (my call: Google sign-in can't run inside
   Zalo, so a Google-only user who continues gets a second account that the existing account merge can
   join later from the web).
3. Granted → `POST /api/auth/zalo-mini` `{ accessToken, profile: { name, avatar }, consent: true }`
   creates the user (same rules as `identity.ts` for a new Zalo user, `consent_at` set). The server
   re-verifies the token; the client-sent name/avatar are only used when the Graph response withholds
   them (`nameWithheld`).
4. **Zalo-tied slots become memberships at once (owner's decision).** In the same request, every
   participant with `zalo_sub = id`, `user_id IS NULL` and status `active` gets `user_id` set to the new
   (or existing, on the silent path in step 2 of the handshake as well) user, with **no membership
   request and no admin approval**. A slot is "Zalo-tied" when an admin picked that friend (§9) or a
   Zalo-verified guest claimed it in the Mini App (§5). At most one slot per group (unique index). If the
   user already holds a different slot in that group, the Zalo-tied slot is left alone and logged.
   This new linking lives in one function (`linkZaloSlots(db, userId, zaloSub)`) called from both the
   Mini App endpoint and the existing Zalo OAuth callback, so a web Zalo sign-in links the same way.
   Browser-guest claims (non-Zalo device IDs) keep today's behaviour: they still go through
   `POST /trips/:id/membership` and approval.

**WhoAreYou** (`screens/WhoAreYou.tsx`): WhoAreYou in the Mini App offers "Tiếp tục với tài khoản Zalo"
at the top. When a Zalo name is known (right after that grant, or for a signed-in Zalo user), run `findSimilarNames(name, picker.people)` (`@fsl/core`). On a match, show a
banner above the cards: "Bạn là {name} phải không?" with the primary button "Tiếp tục với tên {name}",
and pre-select that card. If the slot has `participants.zalo_sub` equal to the verified ID, skip
WhoAreYou entirely (§7).

### 5. Schema: `0014_zalo_mini_app.sql`

```sql
ALTER TABLE participants ADD COLUMN zalo_sub text;
CREATE UNIQUE INDEX participants_trip_zalo_sub_unique ON participants (trip_id, zalo_sub) WHERE zalo_sub IS NOT NULL;
CREATE TABLE zalo_chat_links (
  chat_id text PRIMARY KEY,           -- getContextAsync id of a GROUP_CHAT
  trip_id text NOT NULL,
  linked_by_user_id text,             -- null if a guest linked it (not allowed, see §8); kept nullable for safety
  created_at text NOT NULL
);
CREATE INDEX zalo_chat_links_trip_id_idx ON zalo_chat_links (trip_id);
ALTER TABLE devices ADD COLUMN zalo_sub text;   -- set only by POST /api/auth/zalo-mini from a verified token
```

`users` is unchanged (`zalo_sub` exists since `0006_zalo_oauth`). Drizzle schema updated to match.
No backfill.

`participants.zalo_sub` is set (only if empty, never overwritten) when: an admin adds a friend through
the picker or links a friend to an existing person (§9); a guest whose device row has a `zalo_sub`
claims the slot (the server copies the device's `zalo_sub`, never a client value); a signed-in Zalo
user's slot is created. Merges carry it to the surviving participant if that one has none.
Because a Zalo-tied slot turns into a membership without approval (§4 step 4), a guest claim in the
Mini App is effectively the approval. That is the owner's decision; the two-tier approval still applies
to everyone else.

### 6. Share cards

Every share goes through `platform.share`. Paths are relative to the Mini App root:

| Where | `path` | Title / description |
|---|---|---|
| `InviteSheet.tsx` | `j/<groupToken>` | "Tham gia nhóm {group} trên CoinCrew" / members + total |
| `YourTransfers.tsx` Remind (and `PersonScreen.tsx`'s remind) | `j/<groupToken>` (+ query that opens Pay) | "{name} ơi, còn {amount}" / group name |
| `ExpenseDetails.tsx` Share sport bill | `t/<tripId>/expenses/<expenseId>?token=<groupToken>` | sport bill title / per-person summary |

Thumbnail: an absolute URL on the Worker. Invites and reminders use a static brand card
(`/brand/share-card.png`, 1200×630, served by the Worker from `apps/web/public`); sport bills and reminders with a QR may
use the existing `/j/:token/e/:id/qr.png` route. On the web, the same calls keep today's text + link
behaviour (`remindText`, `sportShareText`, `groupLink`).

### 7. Opening a card or the app

Boot order: handshake (§4) → read route params → chat context (§8) → navigate.

- `j/<token>`: same as `/j/:token` today. If the Zalo guest's verified ID matches a participant's
  `zalo_sub` in that group, the server treats it as an existing claim (writes the `device_participants`
  row) so they skip WhoAreYou and need no approval. This lookup happens server-side on the join/link-view
  request using the Zalo ID bound to the device hash, never an ID sent by the client.
- `t/<tripId>/...`: as today for members; non-members fall back to the `token` query param.

### 8. Group chat ↔ group

- If `chatContext()` returns a group chat, the client calls `GET /api/zalo/chats/:chatId`. The endpoint
  only answers requests from a signed-in Zalo user or a device whose row has a `zalo_sub` (i.e. after a
  verified handshake); others get `401`. Requests are logged with the Zalo ID.
  - Linked → `{ tripId, joinToken }` and the app opens the group (members) or its join page (others).
    Guest approval rules still apply. Being in the chat counts the same as having the invite link (my
    call: people post that link in the chat anyway; chat IDs are app-scoped, not shown to users, and
    the lookup requires a verified Zalo identity). If real chat IDs turn out short or sequential when
    checked on a phone, the builder stops and raises it: the fallback is to return only the group name
    and send the user through the invite link.
  - Not linked → a `Sheet`: "Liên kết nhóm chat này với một nhóm CoinCrew": the user's groups where they
    may invite, plus "Tạo nhóm mới". Requires being signed in; a guest sees "Tiếp tục với tài khoản Zalo"
    first. `POST /api/zalo/chats/:chatId/link { tripId }` checks the user can invite in that group.
- Unlink and relink from group Settings (admins). Settings also shows a one-line hint: open CoinCrew from
  the Zalo group chat's menu to link it (Zalo only reveals the chat ID that way).
- One chat links to one group; a group may be linked from several chats.
- `USER_CHAT` context is ignored in this project.

### 9. Add members from Zalo friends

Next to `PeopleInput` (create group and group Settings → members), the Mini App shows a secondary
`Button` "Chọn từ bạn bè Zalo" → `pickZaloFriends(10)`, shown **only to group admins** (and to the
creator while creating a group), because a Zalo-tied slot grants membership (§4 step 4). Each picked
friend becomes a person with their Zalo name and `zalo_sub` (via the existing add-participants API,
extended with an optional `zaloSub` per person; the server accepts it only from an admin). Avatars of
picked friends are **not stored** this round (my call: `participants` has no avatar column and Zalo
avatar URLs may expire); they show initials like any non-user person. A friend already in the group
(same `zalo_sub`) is skipped with a note. If `findSimilarNames` matches an existing person without a
`user_id` and without a `zalo_sub`, offer "Gắn {friend} với {person}" (admin only, never overwrites)
instead of adding a duplicate. The web build never shows the button.

**Gate:** before building this section, confirm on a real phone that a picked friend's `id` equals the
`id` that friend's own `getAccessToken` → Graph `/me` returns. Zalo's docs say both are unique per user
within the Zalo App; if they differ, stop and raise it.

### 10. Saving images and the bank app

- `PayQr.tsx` / `PayScreen.tsx` "Lưu QR" and `ExpenseDetails.tsx` "Share bill & QR" call
  `platform.saveImage` with the existing PNG (`qrPngBlob`, `renderSportBillPng`). Success toast via
  `Snackbar`: "Đã lưu ảnh QR vào thư viện ảnh".
- VietQR bank deep links (`dl.vietqr.io`) go through `platform.openExternal` (Mini App: `openWebview` with
  external mode, builder to confirm the right API). If Zalo blocks the hand-off, show an inline
  instruction: "Mở app ngân hàng → Quét QR → chọn ảnh từ thư viện" with a "Lưu QR" button next to it.

### 11. Header and Zalo's capsule

- `app-config.json` hides Zalo's title bar; `configAppView` sets the status bar to our background.
- `globals.css` defines `--zmp-safe-top` (default `0px`) and `--zmp-capsule-width` (default `0px`);
  the Mini App root sets them (status-bar height from `getSystemInfo`, capsule ~96px, measured on a real
  phone and kept in this one variable). `.fsl-screen__header` adds `padding-top: var(--zmp-safe-top)` and
  the inner row `padding-right: var(--zmp-capsule-width)`.
- Group screens (`MemberTrip`, `GuestTrip`) in the Mini App: back · left title · **Invite as icon-only**
  · Settings · capsule. The avatar (`AccountMenu`) is not shown there; it stays on Home and Groups.
  Landing and Join keep the language button. The bottom nav is unchanged.
- All of this is driven by `platform.kind === 'zmp'`; the web header is untouched.

### 12. Linking existing data (migration plan)

Nothing is bulk-migrated; existing data links itself:

| Who / what | Path |
|---|---|
| Users who signed in with Zalo before | `users.zalo_sub` matches → signed in on first open, all groups present |
| Google-only users | Guest at first; they're told to link Zalo via the web's existing "add sign-in method", after which they're recognised. Continuing in the Mini App anyway creates a second account, mergeable later from the web (§4) |
| Browser guests with a claimed slot | Pick themselves once on WhoAreYou in the Mini App; from then on the slot holds `zalo_sub`, follows their Zalo account across phones, and becomes their membership when they sign in with Zalo |
| Members picked by name before (no Zalo link) | An admin can tie them to a Zalo friend with "Gắn {friend} với {person}" (§9) |
| Existing groups | Linked to a chat lazily the first time someone opens CoinCrew from that chat's menu (§8) |

Rollout: deploy the API first (migration, bearer auth, CORS, new endpoints; web unaffected), then the
Mini App in Zalo's testing environment with the owner's account, verify the ID match and the origin,
then submit for review.

## Decided by the owner

- Same Zalo App ID as today's Zalo sign-in.
- Unknown Zalo IDs stay guests until they tap "Tiếp tục với tài khoản Zalo" (name + avatar needed).
- Header option C with Invite placement A (icon-only Invite stays; avatar leaves group screens).
- In scope: group chat linking, add from Zalo friends. Notifications wait; Remind uses share cards.
- Existing groups and members link lazily as above.
- A Zalo-tied slot becomes a full membership as soon as that Zalo user signs in, without approval.

## Calls made in this design (check these)

- `devices.zalo_sub` records which verified Zalo account a device belongs to.
- Chat lookups need a verified Zalo identity; a stop-and-raise check if chat IDs look guessable.
- Google-only users are warned to link Zalo on the web first; continuing makes a second account.
- No avatars stored for friends picked from Zalo this round.
- The friend picker and "Gắn" are admin-only, since they grant membership.
- The "Bạn là {name}?" banner appears after the Zalo grant, which also creates the account.

- Bearer token in the body + `Authorization` header for the Mini App; cookie stays for the web.
- CORS allow-list via `ZMP_ALLOWED_ORIGINS`, no credentials.
- Zalo-derived HMAC device ID to carry guest claims across phones.
- Chat membership ≈ invite link for joining.
- (Superseded by the owner's split into web / zalo / web-common.) The split ships first as a pure move.
- Package name `@fsl/web-common`.
- No `zalo_app_user_id` column; `participants.zalo_sub` + `zalo_chat_links` only.

## Left to the builder

- Exact Mini App origins, capsule width and status-bar handling, confirmed on a real phone.
- `app-config.json` details and the `zmp-cli` deploy wiring.
- Which `zmp-sdk` call opens external bank links.
- Share card copy (both languages) and the brand thumbnail image.

## Verified on device (2026-11-02, testing version 10 through `npm run tunnel`)

- **Origin:** the Mini App runs on `https://h5.zadn.vn` (not `h5.zdn.vn`); `ZMP_ALLOWED_ORIGINS` needs it.
- **Path:** a development or testing version is served under `/zapps/<appId>/<version>/`; the router basename keeps the version segment.
- **Sign-in:** silent handshake and "Tiếp tục với tài khoản Zalo" both work. The Zalo profile call goes through the DSM relay (Zalo refuses Cloudflare IPs); the relay passes on `appsecret_proof` as `X-Zalo-Appsecret-Proof`.
- **Deploys:** `zmp-cli` reads `APP_ID` from `apps/zalo/.env` and the asset lists from the root `app-config.json` (generated by the build), and uploads `dist` as it is, so each deploy script builds first. `deploy:tunnel` targets the ngrok API; `deploy:testing` and `deploy` target `.env.production`.
- **Not yet verifiable:** a share card opens the published version, so the card's link, the second-account flows (join from a card, bank hand-off as the payer) and the friend-picker ids are checked after the first publish. Until then a second account can be added as a tester and opened with `https://zalo.me/s/<appId>/?env=TESTING&version=<n>`.
- **Still to check:** header against the capsule and safe area, gallery save, bank hand-off.
