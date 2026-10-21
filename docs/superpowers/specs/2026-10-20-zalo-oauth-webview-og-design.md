# Zalo Sign-In, Account Linking & Merge, Link Preview Cards & Zalo Webview Bridge — Design

Date: 2026-10-20 · Status: draft for review · Branch: `feat/zalo-oauth-webview-og` (from `main`) · Builds on: [[2026-10-12-group-split-vietqr-design]] · [[2026-10-14-ui-ux-restructure-design]] · [[2026-10-16-sport-group-splitting-design]] · [[2026-10-17-ui-ux-and-transactions-design]] · Code: `C:\repo\experience\coin-crew`

---

## 1. Intent & Why

Most people open CoinCrew (Tiền Đâu) links (`/j/:token`) from a Zalo group chat, so the page runs inside Zalo's in-app browser (the "Zalo webview"). Four things go wrong there today:

1. **Sign-in is a dead end.** The only option is Google, and Google refuses OAuth inside embedded browsers (`403 disallowed_useragent`). A member who opens a link in Zalo cannot sign in at all.
2. **Pasted links have no preview.** Zalo shows a bare URL: no group name, no total, no sport-session breakdown, so people do not know what the link is for.
3. **Saving and sharing pictures silently fail.** `<a download>` blob downloads and `navigator.share({ files })` do nothing in the Zalo webview, so "Save QR" and "Share bill & QR" appear broken. Copying the message after the picture renders also fails on iOS, because the tap's user activation has expired by then.
4. **Bank hand-off from the webview is unreliable**, and the user has no fallback guidance.

This design adds Zalo sign-in with account linking and a confirmed merge, rich link-preview cards on token links, and a Zalo-specific save/share path. Everything stays free (Cloudflare Workers + D1 Free plan) and adds no npm dependency.

### Success criteria

- Inside the Zalo app, a person can sign in with one tap on "Đăng nhập bằng Zalo".
- A person with both a Google and a Zalo account can link them, and merge two existing CoinCrew accounts after confirming from the second one.
- A `/j/…` link pasted into Zalo, Facebook or Telegram shows a card with the group name and a short money summary; a sport-bill link shows that session's breakdown.
- Inside Zalo, "Save QR" and "Share bill & QR" always end with a picture the person can long-press to save or share, and the message is already on the clipboard.

---

## 2. Goals, Non-Goals & Anti-Goals

### Goals

1. **Stage 1 — Zalo webview bridge (web only):** detect the Zalo webview; replace download/share attempts there with a long-press "save picture" sheet; copy the message synchronously in the tap; add bank hand-off guidance.
2. **Stage 2 — Link preview cards (API + small web change):** inject Open Graph meta tags into the served `index.html` for `/j/:token` and the new `/j/:token/e/:rootId`; serve static branded 1200×630 PNG images; use per-expense links in sport-bill messages.
3. **Stage 3 — Zalo sign-in, linking, merge (migration `0005_zalo_oauth.sql`):** Zalo OAuth v4 with PKCE; nullable `google_sub` and `email`; link, unlink and change a provider identity from the account menu; merge two accounts after the other account confirms; Smart Name Match on "Who are you?".

Each stage ships on its own and ends with typecheck and the full test suite green.

### Non-Goals

- Sending any notification outside CoinCrew. Messaging a user on Zalo needs a paid Official Account (ZNS) and email needs a mail service. Merge requests are shown in-app only.
- Dynamic PNG preview images (numbers drawn into the picture). The numbers go in the card's text.
- Rich previews on `/t/:tripId/*` URLs (see §4.2.1).
- Recovering a Zalo-only account whose Zalo identity is lost with no signed-in device left (see §8).
- Zalo phone-number access, Zalo Official Account features, Zalo Mini App.
- Account deletion.

### Anti-Goals

- **Never** put people's names, bank names or account numbers in a preview card.
- **Never** sign a person in as account B during A's link flow. B's owner confirms from B's own session.
- **Never** let search engines index group links (`noindex` on every `/j/*` and `/t/*` response).
- **Never** fail a page because preview generation failed: fall back to the plain `index.html`.

---

## 3. Global Constraints

- **Zero new npm dependencies.** Use Workers built-ins (`HTMLRewriter`, `crypto.subtle`, `fetch`, `AbortSignal.timeout`) and the existing `arctic` (for `generateState` / `generateCodeVerifier`), `drizzle-orm`, `hono`. The one-off image render script uses the existing `@playwright/test` devDependency.
- **Free plan budget.** Workers Free: 100k requests/day, 10 ms CPU per request, 50 D1 queries per invocation. D1 Free: 5M rows read and 100k rows written per day. A preview request costs one indexed `trips` read plus `getSnapshot` (one `trip_views` read when the cache is fresh; at most one rebuild per trip version). A 50-person chat opening a link therefore never triggers 50 rebuilds; after their first visit, people are served `index.html` by the PWA service worker anyway.
- **Design system.** Use `tokens.css` custom properties; touch targets ≥ 44×44 px; new `'zalo'` icon in `apps/web/src/components/icons.tsx` in the existing 24×24 stroke style. Invoke the `ui-ux-design-companion` skill for every frontend change.
- **i18n parity.** Every new key exists in both `apps/web/src/i18n/en.ts` and `vi.ts`; every new `vi.ts` line ends with `// REVIEW`. Server-side preview strings live in `apps/api/src/og/text.ts` with their own en/vi parity test.
- **Tests.** TDD per task (red → green). Existing tests are never edited by the implementer subagent; the existing Google, participant and admin suites guard the refactors.

---

## 4. Detailed Design

### 4.1 Stage 1 — Zalo webview bridge

#### 4.1.1 Detection — `apps/web/src/lib/zaloEnv.ts`

```ts
export function isZaloWebView(ua: string = typeof navigator !== 'undefined' ? navigator.userAgent : ''): boolean {
  return /Zalo/i.test(ua);
}
```

Evaluated at render time (never at module load), so tests can stub `navigator.userAgent`. Tests cover a real iOS Zalo UA, a real Android Zalo UA, and negatives for iOS Safari, Android Chrome and desktop Chrome.

#### 4.1.2 Clipboard — `apps/web/src/lib/clipboard.ts`

```ts
/** Copies text. Call it synchronously inside the tap handler, before any await, so the tap still counts as user activation. */
export function copyText(text: string): Promise<boolean>;
```

Order: if `navigator.clipboard?.writeText` exists, call it immediately and resolve `true` on success; if it is missing or rejects, fall back to a hidden, `readonly`, off-screen `<textarea>` + `select()` + `document.execCommand('copy')` (guarded by `typeof document.execCommand === 'function'`), resolving its boolean result; resolve `false` when both fail. Never throws.

#### 4.1.3 Save-picture sheet — `apps/web/src/components/SaveImageSheet.tsx` (+ `.css`)

A `<Sheet>` with:

- Title: `share.imageTitle` ("Lưu ảnh" / "Save the picture").
- The picture as `<img src={dataUrl}>` with a `data:` URL (some webviews cannot long-press-save `blob:` URLs), full width, `-webkit-touch-callout: default`. A `Skeleton` while the picture renders.
- Instruction `share.longPress`: *"Nhấn giữ ảnh (2 giây) để Lưu về máy hoặc Chia sẻ ngay vào nhóm Zalo"*.
- When a message was passed: a status line, `share.copied` ("Đã sao chép tin nhắn — dán vào nhóm Zalo") when the automatic copy worked, and a **Copy message** button (`share.copyMessage`, ≥ 44 px) that copies again and updates the status.
- Quiet hint `share.openInBrowser`: *"Không lưu được? Nhấn ⋯ → Mở bằng trình duyệt"*.
- When the picture cannot be made (render returned `null`): no image, `share.imageFailed` text, the copy button and the hint remain.

Driven by a hook in the same file:

```ts
export function useImageSheet(): {
  sheet: JSX.Element;                                   // render once in the caller
  show(render: () => Promise<Blob | null>, message?: string): void;
};
```

`show` starts `copyText(message)` first (synchronously), opens the sheet in its loading state, awaits `render()`, converts the blob with `blobToDataUrl` (new helper in `lib/qr.ts`, `FileReader.readAsDataURL`), then sets the copy status from the copy promise.

#### 4.1.4 Call sites

| Where | Outside Zalo (unchanged) | Inside Zalo |
|---|---|---|
| `PayQr` **Save QR** | `saveQr(svg, refCode)` | `show(() => qrPngBlob(svg))` (no message) |
| `PayQr` **Share** (variant `receive`) | `shareQr(svg, shareText, refCode)` | `show(() => qrPngBlob(svg), shareText)` (`shareText` is the `remindText`) |
| `ExpenseDetails` **Share bill & QR** | `shareSportBill(billInput, msgText, ref)` | `show(() => renderSportBillPng(billInput), msgText)` |

Inside Zalo none of these call `navigator.share` or create an `<a download>`.

#### 4.1.5 Bank hand-off — `BankAppSheet.tsx`

Navigation stays an `<a href={bankAppLink(appId)}>`. A target-less anchor is already a top-level navigation, so `window.location.href` would behave identically. Inside Zalo the sheet adds one hint row below the list, `pay.zaloBankHint`: *"Ứng dụng ngân hàng không mở? Lưu mã QR, rồi trong app ngân hàng chọn Quét QR → chọn ảnh. Hoặc nhấn ⋯ → Mở bằng trình duyệt."*

### 4.2 Stage 2 — Link preview cards

#### 4.2.1 Which URLs get which card

| URL | Card |
|---|---|
| `/j/:token` (group or view token, live) | Rich group card (§4.2.3) |
| `/j/:token/e/:rootId` (live token, expense found, status `approved` or `pending`) | Rich expense card |
| `/j/:token/e/:rootId` (expense missing, `rejected`, `disabled` or `superseded`) | Rich group card |
| `/j/:token…` (unknown or regenerated token, or a malformed token) | Dead-link card |
| `/t/*` | Generic CoinCrew card, **no trip lookup** |
| `/` and everything else | Static generic text tags in `index.html`, no image |

`/t/:tripId` URLs get no trip data because a trip ID is not a credential: opening one without a token shows nothing today, and a rich card would leak the group name and totals to anyone who sees a member's address bar. Every link the app shares is a `/j/` link.

#### 4.2.2 Routing

- `apps/api/wrangler.jsonc`: `"run_worker_first": ["/api/*", "/j/*", "/t/*"]`.
- `apps/web/index.html` gains static generic tags: `<meta name="description">`, `og:site_name` = `CoinCrew (Tiền Đâu)`, `og:type` = `website`, `og:title`, `og:description` (vi generic text), `twitter:card` = `summary_large_image`.
- `apps/api/src/og/routes.ts` exports `pageRoutes()`, mounted in `createApp()` with `app.route('/', pageRoutes())`. Handlers are catch-alls, `GET /j/*` and `GET /t/*` (Hono answers `HEAD` with the same handler), so an unexpected sub-path still gets the app instead of the JSON 404. `deviceMiddleware` stays `/api/*` only.
- Handler flow:
  1. `const page = await c.env.ASSETS.fetch(new Request(new URL('/', c.req.url)))`. Fetch `/`, not `/index.html`, which the assets layer redirects. If `page` is not OK, return it unchanged.
  2. Parse the path: `/j/:token` or `/j/:token/e/:rootId`. A token must match `^[A-Za-z0-9_-]{1,64}$`; anything else is treated as dead.
  3. For `/j/*`: one query, `trips WHERE group_token = ? OR view_token = ?` (both unique-indexed), then `getSnapshot(db, trip)`.
  4. Build the meta with `pageMeta(...)` (§4.2.3) and return `injectMeta(page, meta)`.
  5. Any error in steps 2–4 is logged and answered with `injectMeta(page, genericMeta)`; if `injectMeta` itself throws, return the plain `page`.

#### 4.2.3 Card text — `apps/api/src/og/text.ts` (pure)

```ts
export type PageMetaInput =
  | { kind: 'generic' }
  | { kind: 'dead' }
  | { kind: 'group'; snapshot: TripSnapshot; now: Date }
  | { kind: 'expense'; snapshot: TripSnapshot; expense: ExpenseView; now: Date };
export interface PageMeta { title: string; description: string; image: 'trip' | 'sport'; locale: 'vi_VN' | 'en_US' }
export function pageMeta(input: PageMetaInput): PageMeta;
```

Language: `snapshot.trip.defaultLang` (`'vi'` when absent); generic and dead cards use `vi`. Money with `formatVnd` from `@fsl/core`. Dates are the crawl date in Asia/Ho_Chi_Minh (UTC+7): vi `dd/MM`, en `d MMM` (e.g. `21 Oct`). `n` = number of `active` people. Title ≤ 90 characters and description ≤ 200, cut with `…`.

| Kind | Title | Description (vi) | Description (en) |
|---|---|---|---|
| generic | `CoinCrew (Tiền Đâu)` | `Chia tiền nhóm, trả nhau bằng VietQR.` | `Split group costs and settle up with VietQR.` |
| dead | `CoinCrew (Tiền Đâu)` | `Link này không còn dùng được. Hỏi người tạo nhóm link mới.` | `This link no longer works. Ask the organiser for a new one.` |
| group, total > 0 | trip name | `Đến {date}: tổng chi {total} · {n} người — mở để xem ai cần trả ai bao nhiêu.` | `As of {date}: {total} spent · {n} people — open to see who owes whom.` |
| group, total = 0 | trip name | `Chưa có chi tiêu nào · {n} người — mở để thêm và chia tiền.` | `No expenses yet · {n} people — open to add and split.` |
| group, sport preset | trip name | prefix `Nhóm thể thao · ` + the group line | prefix `Sport group · ` + the group line |
| expense, sport (`meta.sport` present) | `{description} · {trip name}` | parts joined by ` · `: `Sân {court}` (if > 0), `Cầu {shuttlecocks}` (if > 0), `Phụ phí {extra}` (if > 0), then `Nam {male} / Nữ {female}` when both slot totals > 0 and the rates differ, else `Mỗi suất {rate}`; then ` — mở để lấy mã QR.` | same with `Court`, `Shuttlecocks`, `Extra`, `Men {m} / Women {f}`, `Per slot {r}`, ` — open for your QR.` |
| expense, other | `{description} · {trip name}` | `{amount} · chia {k} người — mở để xem phần của bạn.` | `{amount} · split {k} ways — open to see your share.` |

Sport values come from the stored `meta.sport` (no recomputing): `court`, `Σ shuttlecocks qty × unitPrice`, `extra`, `maleSlotRate`, `femaleSlotRate`; slot totals are the sums of `maleSlots` and `femaleSlots` over entries without `fixedAmount`, and `rate` is the male rate when male slots exist, else the female rate (the same rule as `sportShareText`). `k` = number of shares. Image: `'sport'` when `trip.preset === 'sport'`, else `'trip'`.

The cards contain the group name, the expense description and amounts only, never people's names, bank names or account numbers.

#### 4.2.4 Tag rendering — `apps/api/src/og/html.ts`

- `escapeHtml(s)`: replaces `& < > " '` with entities.
- `metaTagsHtml(meta, url, origin)` returns these tags, every value escaped: `description`, `og:title`, `og:description`, `og:image` = `${origin}/og/${meta.image}.png`, `og:image:width` = `1200`, `og:image:height` = `630`, `og:image:type` = `image/png`, `og:url` = `${origin}${pathname}` (no query), `og:type` = `website`, `og:site_name`, `og:locale`, `twitter:card` = `summary_large_image`, `twitter:title`, `twitter:description`, `twitter:image`, `robots` = `noindex, nofollow`. `origin` is `APP_ORIGIN`.
- `injectMeta(res, meta, url, origin)` uses `HTMLRewriter`: removes `meta[name="description"]`, `meta[property^="og:"]`, `meta[name^="twitter:"]` and `meta[name="robots"]`; sets `<title>` with `setInnerContent(meta.title)` (escaped text); appends `metaTagsHtml(...)` to `<head>` with `{ html: true }`. Response headers: copy the asset's, delete `ETag` and `Content-Length`, set `Content-Type: text/html; charset=utf-8`, `Cache-Control: no-cache`, `X-Robots-Tag: noindex, nofollow`.

#### 4.2.5 Card images

- `apps/web/public/og/trip.png` and `apps/web/public/og/sport.png`: 1200×630 PNG, ≤ 300 KB each, committed (Vite copies them to `apps/api/public/og/`).
- Rendered once by `scripts/render-og-images.mjs`: launches Chromium from `@playwright/test`, opens `scripts/og/trip.svg` and `scripts/og/sport.svg` at a 1200×630 viewport, screenshots to the PNGs. Run manually with `node scripts/render-og-images.mjs` (needs `npx playwright install chromium`, already required for E2E). Not part of the build.
- Look: brand teal from `tokens.css` (`#0f766e`), the app icon, the wordmark *CoinCrew (Tiền Đâu)*, one tagline (trip: *"Chia tiền nhóm · Trả bằng VietQR"*; sport: *"Chia tiền sân · Nam / Nữ · VietQR"*). The safe area for the text is the centre 1000×500, because Zalo and Facebook crop to different ratios. Final visual review through the `ui-ux-design-companion` skill.

#### 4.2.6 Web: expense links

- `App.tsx`: new route `<Route path="/j/:token/e/:expenseId" element={<Join />} />`.
- `Join.tsx`: after the link resolves and the token is stored, if `expenseId` is present → `navigate('/t/{tripId}/expenses/{expenseId}', { replace: true })` for both access kinds; otherwise the current behaviour.
- `TripRoute.tsx`: the redirect of a guest with no pick becomes `navigate('/t/{tripId}/who?next=' + encodeURIComponent(pathname + search), { replace: true })`.
- `WhoAreYou.tsx`: reads `next`; `safeTripPath(next, tripId)` accepts only `/t/{tripId}` or a path starting with `/t/{tripId}/`, with no `//`, no `\` and no control characters, else `/t/{tripId}`. After a pick, navigate there. The sign-in `returnTo` on this screen uses the same target.
- `lib/remind.ts`: `expenseLink(view, id) = groupLink(view) + '/e/' + encodeURIComponent(id)`; when there is no token it returns `groupLink(view)` unchanged.
- `ExpenseDetails.tsx`: `msgText` passes `link: expenseLink(view, e.rootId ?? e.id)`. `rootId` survives edits, and `ExpenseDetails` already finds an expense by `id`, `rootId` or a history id.

### 4.3 Stage 3 — Data model (`apps/api/migrations/0005_zalo_oauth.sql`)

#### 4.3.1 `users` rebuild

SQLite cannot drop `NOT NULL` in place. There are no foreign keys, so the migration rebuilds the table inside D1's migration transaction:

```sql
CREATE TABLE `users_new` (
  `id` text PRIMARY KEY NOT NULL,
  `google_sub` text,
  `zalo_sub` text,
  `email` text,
  `name` text NOT NULL,
  `gender` text,
  `avatar_url` text,
  `custom_profile` integer DEFAULT 0 NOT NULL,
  `consent_at` text,
  `created_at` text NOT NULL,
  CHECK (`google_sub` IS NOT NULL OR `zalo_sub` IS NOT NULL)
);
--> statement-breakpoint
INSERT INTO `users_new` (`id`, `google_sub`, `zalo_sub`, `email`, `name`, `gender`, `avatar_url`, `custom_profile`, `consent_at`, `created_at`)
SELECT `id`, `google_sub`, NULL, `email`, `name`, `gender`, `avatar_url`, `custom_profile`, `consent_at`, `created_at` FROM `users`;
--> statement-breakpoint
DROP TABLE `users`;
--> statement-breakpoint
ALTER TABLE `users_new` RENAME TO `users`;
--> statement-breakpoint
CREATE UNIQUE INDEX `users_google_sub_unique` ON `users` (`google_sub`) WHERE `google_sub` IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `users_zalo_sub_unique` ON `users` (`zalo_sub`) WHERE `zalo_sub` IS NOT NULL;
```

Drizzle (`apps/api/src/db/schema.ts`): `googleSub: text('google_sub')`, `zaloSub: text('zalo_sub')`, `email: text('email')` (all nullable), with the two partial `uniqueIndex(...).on(...).where(sql\`… IS NOT NULL\`)` entries and `check('users_identity_check', sql\`google_sub IS NOT NULL OR zalo_sub IS NOT NULL\`)`.

#### 4.3.2 `account_merge_requests`

```sql
CREATE TABLE `account_merge_requests` (
  `id` text PRIMARY KEY NOT NULL,
  `survivor_user_id` text NOT NULL,   -- A: started the request, keeps living
  `merged_user_id` text NOT NULL,     -- B: must confirm, is deleted on accept
  `provider` text NOT NULL,           -- 'google' | 'zalo': the identity A proved
  `provider_sub` text NOT NULL,
  `status` text NOT NULL,             -- 'pending' | 'accepted' | 'declined' | 'cancelled'
  `created_at` text NOT NULL,
  `expires_at` text NOT NULL,         -- created_at + 7 days
  `decided_at` text
);
--> statement-breakpoint
CREATE INDEX `account_merge_requests_merged_idx` ON `account_merge_requests` (`merged_user_id`, `status`);
--> statement-breakpoint
CREATE INDEX `account_merge_requests_survivor_idx` ON `account_merge_requests` (`survivor_user_id`, `status`);
```

Expiry is checked on read (`status = 'pending' AND expires_at > now`); no cron. Creating a request from A to B cancels A's older pending requests to B.

#### 4.3.3 Identity rules

- An account has at most one identity per provider (one column each) and always at least one (CHECK).
- **Unlink** is refused for the last identity. Unlinking Google also clears `email`.
- **Change** (provider already linked, new identity proved, the new identity is unused) replaces the column at once; the old identity is released, and signing in with it later creates a new, empty account.
- **Merge result** (B merged into A, A proved B's identity for provider P): A's P becomes the proved identity; for the other provider Q, A keeps its own, or takes B's when A has none. B's identities that are dropped this way are listed on B's confirm screen as `released`.
- **Profile after merge:** A keeps its name, avatar and gender, unless A has `custom_profile = 0` and B has `custom_profile = 1`, in which case B's name, avatar and gender carry over and A becomes `custom_profile = 1`. `consent_at` = A's, or B's when A has none.

#### 4.3.4 Contract changes (`packages/core/src/api-types.ts`)

```ts
export type AuthProvider = 'google' | 'zalo';
export interface MeUserView {
  id: string; email: string | null; name: string; gender?: Gender | null; avatarUrl?: string | null;
  consentAt: string | null; providers: AuthProvider[];
}
export interface IncomingMergeRequest {
  id: string; provider: AuthProvider; expiresAt: string;
  survivor: { name: string; avatarUrl: string | null; email: string | null; providers: AuthProvider[] };
  groups: { survivor: number; merged: number };      // active memberships of each account
  released: { provider: AuthProvider; email: string | null }[];
}
export interface OutgoingMergeRequest { id: string; provider: AuthProvider; status: 'pending' | 'accepted' | 'declined'; expiresAt: string }
export interface MeResponse {
  user: MeUserView | null;
  signIn: { zalo: boolean };                         // false when ZALO_APP_ID or ZALO_APP_SECRET is missing
  mergeRequests: { incoming: IncomingMergeRequest[]; outgoing: OutgoingMergeRequest[] };   // both empty when signed out
}
```

- `Approval` kind `membership`: `userEmail: string | null`. `ApprovalsCard` shows `{userName} · Zalo` when it is null.
- `ApiErrorCode` gains `'LAST_IDENTITY' | 'MERGE_STALE'`.
- `outgoing` lists A's requests with status `pending`, `accepted` or `declined` whose `expires_at` has not passed; `incoming` lists B's `pending` unexpired ones.
- Web: the local `MeResponse` copies in `Landing.tsx`, `MyTrips.tsx`, `CreateTrip.tsx` and `ConsentSheet.tsx` are replaced by a shared `useMe()` hook in `apps/web/src/api/hooks.ts` returning the core `MeResponse`.

#### 4.3.5 Environment — `apps/api/src/env.ts`

`ZALO_APP_ID?: string` and `ZALO_APP_SECRET?: string`. `testLogin` (`POST /api/test/login`, E2E only) accepts an optional `provider: 'google' | 'zalo'` (default `'google'`) and writes the `sub` into the matching column; `email` is optional.

### 4.4 Stage 3 — Zalo OAuth and sign-in UI

#### 4.4.1 Zalo helpers — `apps/api/src/auth/zalo.ts`

- `zaloConfigured(env)`: `Boolean(env.ZALO_APP_ID && env.ZALO_APP_SECRET)`.
- `zaloPkce(): Promise<{ verifier: string; challenge: string }>`: verifier from `arctic`'s `generateCodeVerifier()` (43 characters); challenge = unpadded base64url of `SHA-256(ASCII(verifier))`. Tested with RFC 7636 Appendix B: verifier `dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk` → challenge `E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM`.
- `zaloAuthorizeUrl(env, state, challenge)`: `https://oauth.zaloapp.com/v4/permission?app_id={ZALO_APP_ID}&redirect_uri={APP_ORIGIN}/api/auth/zalo/callback&code_challenge={challenge}&state={state}` (URL-encoded).
- `exchangeZaloCode(env, code, verifier): Promise<string>`: `POST https://oauth.zaloapp.com/v4/access_token`, `Content-Type: application/x-www-form-urlencoded`, header `secret_key: {ZALO_APP_SECRET}`, body `code`, `app_id`, `grant_type=authorization_code`, `code_verifier`. Returns the `access_token`.
- `fetchZaloProfile(accessToken): Promise<{ sub: string; name: string; avatarUrl: string | null }>`: `GET https://graph.zalo.me/v2.0/me?fields=id,name,picture`, header `access_token: {token}`; `avatarUrl` from `picture.data.url`; `name` falls back to `'Zalo'` when empty.
- **Zalo often reports errors with HTTP 200.** Both calls throw `ZaloError` when the status is not 2xx, the body is not JSON, `error` is present and not `0`, or `access_token` / `id` is missing. Both use `AbortSignal.timeout(8000)`.

#### 4.4.2 Shared identity code — `apps/api/src/auth/identity.ts`

- `upsertIdentity(db, provider, profile: { sub; name; avatarUrl; email? }): Promise<string>` returns the user id. It finds the user by `google_sub` / `zalo_sub`; on found, it sets `email` (Google only), `name` when `custom_profile = 0`, and `avatar_url` when (`custom_profile = 0` or no avatar) and the profile has one; otherwise it inserts a new user. This is the current Google rule, moved.
- `linkIdentity(db, userId, provider, profile)`: see §4.5.2.
- The Google callback is refactored to call `upsertIdentity`; the existing Google tests stay green unchanged.

#### 4.4.3 Routes (in `apps/api/src/auth/routes.ts`)

- `GET /api/auth/zalo/start?returnTo=&intent=signin|link`: 404 `NOT_FOUND` when not configured. Sets HttpOnly, Secure, `SameSite=Lax`, `path=/`, 600 s cookies `zalo_oauth_state`, `zalo_oauth_verifier`, `zalo_oauth_return` (`safeReturnTo`) and `zalo_oauth_intent`; `intent=link` without a session is stored as `signin`. Redirects 302 to `zaloAuthorizeUrl`.
- `GET /api/auth/google/start` accepts the same `intent` and stores `oauth_intent`.
- `GET /api/auth/zalo/callback?code&state` (Zalo may also send `error`): requires `code`, `state` equal to the `zalo_oauth_state` cookie, and the verifier cookie. It exchanges the code and fetches the profile, then:
  - `signin`: `upsertIdentity` → `createSession` → `sid` cookie → 302 to `returnTo`.
  - `link`: `linkIdentity` (§4.5.2) → 302 to `returnTo` with the result flag.
  - It always deletes the four cookies.
- **Failure** (the user cancelled, state mismatch, missing cookies, `ZaloError`, timeout) → 302 to `returnTo` (or `/` when the return cookie is gone) with `auth=failed` added to the query. Missing cookies happen when mobile Safari hands the login to the Zalo app and the callback opens in a different browser. Google keeps its current JSON 400 behaviour.

#### 4.4.4 Web sign-in UI

- **`AuthNotice`** (rendered once in `App.tsx`): reads `auth`, `linked` and `merge` from the query, shows one `Snackbar`, then removes the parameters with `navigate(..., { replace: true })`. Messages: `auth=failed` → `auth.failed` ("Đăng nhập chưa xong — thử lại"); `linked=google|zalo` → `auth.linked` ("Đã liên kết {provider}"); `merge=requested` → `auth.mergeRequested` (§4.5.2).
- **`SignInButtons`** (`apps/web/src/components/SignInButtons.tsx`, props `returnTo: string`, `layout: 'stack' | 'inline'`, optional `intent`):
  - Inside Zalo: one primary **Đăng nhập bằng Zalo** button (`'zalo'` icon), plus the hint `signIn.googleInZalo`: *"Đã dùng Google trước đây? Nhấn ⋯ → Mở bằng trình duyệt để đăng nhập Google, rồi liên kết Zalo trong menu tài khoản."* No Google button.
  - Elsewhere: **Đăng nhập bằng Google** (primary, as today), then **Đăng nhập bằng Zalo** (secondary).
  - The Zalo button is hidden when `signIn.zalo` is false; inside Zalo with Zalo unconfigured, only the hint is shown.
  - Every button ≥ 44 px; plain links to `/api/auth/{provider}/start?returnTo=…`.
- **`SignInSheet`**: a `<Sheet>` wrapping `SignInButtons`.
- **`Landing.tsx`**: `SignInButtons layout="stack" returnTo="/trips"` replaces the single Google button.
- **`GuestTrip.tsx`**: the footer's "become a member" link becomes `SignInButtons layout="inline"` with `returnTo=/t/{id}?becomeMember=1` under the label `guest.becomeMember` (reworded without "Google").
- **`WhoAreYou.tsx`**:
  - Signed in: the guest sign-in note is hidden.
  - Member rows open `SignInSheet` (returnTo = the `next` target), because the app cannot know which provider that member uses.
  - **Smart Name Match**: when signed in, `myPick` is null and no row has `lastUsedHere`, run `findSimilarNames(me.name, nonMemberRows)`. If exactly one row holds the best-ranked reason, pre-select it and show `who.nameMatch`: *"Có phải bạn là {name}? Đã chọn sẵn theo tên tài khoản của bạn."* A tie selects nothing and shows no hint. Example: account name "Nguyễn Văn Minh" pre-selects the slot "Minh" (`part`).
- **`AccountMenu.tsx`**: the email line shows `u.email ?? t('account.zaloAccount')` ("Tài khoản Zalo").
- **`icons.tsx`**: `'zalo'`, a speech bubble with a "Z", 24×24, stroke style.
- **Privacy notice** (`Privacy.tsx`, whose draft text is hard-coded English today): the "What information is stored" paragraph becomes *"We store your name and email address from Google sign-in, or your Zalo user ID, display name and profile picture from Zalo sign-in (Zalo does not share your phone number); …"*, the rest unchanged.

### 4.5 Stage 3 — Linking, unlinking, changing, merging

#### 4.5.1 Account menu — "Sign-in methods"

A new section in `AccountMenu` (`LinkedAccounts.tsx`) with one row per provider:

- **Google**: the email or `account.notLinked` ("Chưa liên kết").
- **Zalo**: `account.linked` ("Đã liên kết") or "Chưa liên kết".
- Actions: **Link** (when not linked), **Change** and **Unlink** (when linked). Link and Change go to `/api/auth/{provider}/start?intent=link&returnTo={current path}`. Inside Zalo, Link/Change Google shows the open-in-browser hint instead.
- **Unlink** is disabled on the last identity, with `account.unlinkLast`: *"Liên kết thêm một cách đăng nhập trước"*. Unlinking asks for confirmation in a small `Sheet`.
- A single-identity account shows the nudge `account.backupNudge`: *"Liên kết thêm Google để không mất tài khoản khi đổi số Zalo"* (or the reverse wording for a Google-only account).
- A pending or decided outgoing request shows here: pending → `merge.outgoingPending` with **Huỷ**; accepted → `merge.outgoingAccepted`; declined → `merge.outgoingDeclined`.

#### 4.5.2 Link result — `linkIdentity(db, A, provider, profile)`

| Proved identity | Result | Redirect flag |
|---|---|---|
| Unused | Set A's column (replacing any current one), and `email` for Google. Name and avatar are never changed by linking. | `linked={provider}` |
| Already A's | Nothing | `linked={provider}` |
| Belongs to B | Insert a merge request (A = survivor, B = merged, `provider`, `provider_sub`), cancelling A's older pending ones to B. **No session for B is created.** | `merge=requested` |
| No valid session (expired mid-flow) | Nothing | `auth=failed` |

`auth.mergeRequested`: *"Tài khoản {provider} này đã có tài khoản CoinCrew riêng. Đăng nhập vào tài khoản đó để xác nhận gộp (hết hạn sau 7 ngày)."*

#### 4.5.3 Endpoints (`apps/api/src/auth/accountRoutes.ts`, all require a session)

| Method & path | Who | Result |
|---|---|---|
| `DELETE /api/me/identities/:provider` | any user | 200 `{ user }`; 409 `LAST_IDENTITY`; 404 when that provider is not linked |
| `POST /api/me/merge-requests/:id/accept` | B only | 200 `{ user }` (now account A); 404 when not B's or not pending/unexpired; 409 `MERGE_STALE` (request marked `cancelled`) when A no longer exists or B no longer holds `provider_sub` |
| `POST /api/me/merge-requests/:id/decline` | B only | 204 |
| `POST /api/me/merge-requests/:id/cancel` | A only | 204 |

#### 4.5.4 Confirming as B

- `useMe()` exposes `mergeRequests.incoming`. A **dot badge** on the `AccountMenu` avatar button (shown on `MyTrips` and `MemberTrip`, the screens that carry it) appears while one is pending; **`MergeRequestBanner`** shows at the top of `MyTrips` and inside `AccountMenu`: *"{survivor.name} ({survivor.email or 'Zalo'}) muốn gộp tài khoản này vào tài khoản của họ"* with **Xem & gộp** and **Từ chối**.
- **`MergeConfirmSheet`** lists what moves (groups count, bank details, history) and each `released` identity (*"Google {email} sẽ không còn đăng nhập vào đây"*), then a destructive-style **Gộp tài khoản** button.
- On accept success the web calls `queryClient.clear()` and refetches `/api/me`: the same browser session now belongs to A.

#### 4.5.5 Merge executor — `apps/api/src/auth/mergeUsers.ts`

`mergeUsers(db, request, deviceHash)` runs in two phases.

**Phase 1, one atomic `db.batch`** (a constant number of set-based statements):

1. `DELETE FROM users WHERE id = B` first, so B's identities free their unique indexes.
2. `UPDATE users` for A: identities per §4.3.3, the profile rule, `consent_at`.
3. Repoint B → A in `participants.user_id`, `trips.organiser_user_id`, `membership_requests.user_id`, `transactions.disabled_by_user_id`, `bank_details.approved_by_user_id`, `activity.actor_user_id`, `sessions.user_id`.
4. Bank details: when A has an approved user-level bank row, B's `approved` and `pending` user-level rows become `replaced`; then every B user-level row moves to A (history kept).
5. Request → `accepted` with `decided_at`; any other pending request involving B → `cancelled`.
6. `UPDATE trips SET version = version + 1` for every trip where A now has a participant, so snapshots rebuild.

**Phase 2, per shared group** (groups where A and B each had an `active` participant before phase 1): if B's participant was admin, set A's participant `is_admin = 1`; then call the existing `mergeParticipants(db, tripId, B's participant, A's participant, actor)`. That is allowed because both rows now carry user A. Each group is its own atomic batch, bumps its version and logs the existing `name_merged` activity. If one fails, the error is logged and the response still succeeds; the two names stay in that group, linked to the same account, and an admin can merge them from the People screen (same-user merges are allowed).

The shared groups are computed before phase 1.

---

## 5. Error Handling

- API: `LAST_IDENTITY` (409), `MERGE_STALE` (409), plus existing codes. `InlineError` maps both to new i18n messages `error.lastIdentity` and `error.mergeStale`.
- OAuth callbacks never show JSON to a browser for Zalo; they redirect with `auth=failed`.
- Preview routes never fail a page (§4.2.2 step 5).
- Zalo outages cost only Zalo sign-in: Google keeps working and the snackbar explains.
- Webview: a failed picture render still leaves the message and copy button (§4.1.3).

---

## 6. Testing

### API (`apps/api/test`, vitest + Workers pool)

- **Migration**: existing users keep their data and `google_sub` uniqueness; a second user with the same `zalo_sub` is rejected; a user with neither sub is rejected by the CHECK; two users with `NULL` `google_sub` coexist.
- **`zalo.ts`**: PKCE RFC vector; authorize URL parameters; exchange request shape (headers and form body); error-in-200 bodies, non-2xx, bad JSON, missing `access_token` / `id`.
- **Zalo routes** (fetch mocked): start 404 when unconfigured; start sets the four cookies; new user; returning user updates name and avatar; `custom_profile = 1` keeps both; wrong state → `auth=failed`; missing cookies → `/?auth=failed`; Zalo `error` param → `auth=failed`; open-redirect `returnTo` ignored.
- **Linking**: attach to a Google-only user; change (replace) Zalo; already mine; belongs to B creates a pending request and sets no `sid` for B; expired session → `auth=failed`; Google `intent=link` attaches `google_sub` and `email`.
- **Unlink**: works with two identities; 409 on the last; Google unlink clears email.
- **Merge**: accept moves participants, organiser role, bank details (both sides with approved banks → B's replaced), sessions (B's `sid` now resolves to A), membership requests, and bumps versions; shared group → names merged, admin carried over; released identity listed in `/api/me` incoming; profile rule both ways; decline; cancel by A; wrong user → 404; expired → 404; B unlinked the proved identity → 409 `MERGE_STALE`; `/api/me` incoming/outgoing contents.
- **Preview routes** (`env.ASSETS` stubbed with a fixture `index.html`): group card (title, description, absolute image, `og:url`), view-token card, sport-expense breakdown, non-sport expense card, rejected-expense fallback, dead token, malformed token, `/t/*` generic even when the trip exists, hostile trip name `"><script>alert(1)</script>` escaped, a seeded bank account number absent from the body, `X-Robots-Tag` header, `ASSETS` non-OK passed through, DB failure → generic card.
- **`og/text.ts`**: every row of the §4.2.3 table in vi and en; truncation; en/vi key parity.
- The existing Google auth, participant merge and admin suites stay green.

### Web (`apps/web`, vitest + jsdom)

- `zaloEnv` UA matrix; `copyText` (Clipboard API, `execCommand` fallback, both blocked).
- `SaveImageSheet` / `useImageSheet`: copy starts before the render resolves; image shown; render `null` → failure text; copy button retries.
- `PayQr` and `ExpenseDetails` with a Zalo UA: Save and Share open the sheet; no `navigator.share` and no `<a download>`. One test each without Zalo: existing behaviour unchanged.
- `BankAppSheet`: Zalo hint shown only in Zalo.
- `Join` with `/j/:token/e/:id`; `TripRoute` → `who?next=`; `WhoAreYou` returns to `next`, rejects foreign `next`; `ExpenseDetails` share text contains `/j/{token}/e/{rootId}`.
- `SignInButtons`: Zalo webview, normal browser, Zalo unconfigured; `WhoAreYou` Smart Name Match (same, part, tie, members ignored, `myPick` wins, signed out → nothing); member row opens `SignInSheet`.
- `AuthNotice` for each flag; `AccountMenu` sign-in methods (link, change, unlink disabled on last, nudge, outgoing states); `MergeRequestBanner` and `MergeConfirmSheet` accept/decline; avatar dot.
- i18n: key parity between `en.ts` and `vi.ts`; every new `vi.ts` line ends with `// REVIEW`.

Typecheck (`npm run typecheck`) and the full suite (`npm test`) run after every stage.

---

## 7. Rollout & Setup

1. **Stage 1** ships alone (web only).
2. **Stage 2** ships with the `run_worker_first` change. After deploying, check real cards with Zalo's sharing debugger (`developers.zalo.me/tools/debug-sharing`, which also re-crawls a cached URL), the Facebook Sharing Debugger, and a Telegram paste.
3. **Stage 3** ships with migration 0005 (applied automatically on deploy). The Zalo buttons stay hidden until the secrets exist, so the code can ship before the Zalo app is approved. Add to `docs/setup.md`:
   1. Create an app at `developers.zalo.me` and enable Social API / "Đăng nhập với Zalo".
   2. Register the callback URL `{APP_ORIGIN}/api/auth/zalo/callback` and verify the domain.
   3. Activate the app for public use (in development mode only the app's admins and testers can sign in).
   4. `wrangler secret put ZALO_APP_ID` and `wrangler secret put ZALO_APP_SECRET` (and `.dev.vars` locally).

### Manual device checklist

- iOS Zalo and Android Zalo: long-press saves the QR picture and the bill picture; the automatic copy works; the copy button works.
- Zalo sign-in from inside the Zalo app; from iOS Safari and Android Chrome (does the hand-off to the Zalo app come back to the same browser? If not, the `auth=failed` snackbar must show).
- A bank link from inside Zalo on both platforms; the hint is visible.
- Pasting `/j/{token}` and `/j/{token}/e/{rootId}` into a Zalo chat shows the cards; trip and sport images look right after Zalo's crop.
- After regenerating a group link: the old link's cached card may still show in old messages, and opening it shows the dead-link screen; the new link gets a fresh card.

---

## 8. Known Limits & Risks

- **Lost Zalo-only account.** A Zalo-only account whose Zalo identity is gone (for example, a new Zalo account after a phone-number change) with no signed-in device left cannot be recovered: there is no email or phone to prove ownership. Mitigation: the backup-identity nudge (§4.5.1).
- **Android long-press.** Whether Zalo's Android browser offers "save image" on long-press can only be confirmed on a device; the open-in-browser hint covers it if not.
- **Mobile-browser Zalo hand-off.** Starting Zalo sign-in from Safari or Chrome may hand off to the Zalo app and return in a different browser without the state cookies; the result is a clear `auth=failed`, never a wrong account.
- **Zalo preview cache.** Zalo caches a card per URL. The group card's "Đến {date}" makes an old card self-explaining; expense links are unique per expense.
- **Zalo API details.** Endpoint shapes follow the brief (OAuth v4 + Graph v2.0) and community usage; the defensive error rule (§4.4.1) covers HTTP-200 errors. Confirm against the Zalo app console during setup.
- **Phase-2 query budget.** `mergeParticipants` adds one statement per shared transaction; if D1 counts batch statements individually, one busy shared sport group can exhaust the free plan's ~50 queries per invocation. The account merge still completes and the leftover duplicate names stay mergeable from People.
- **Pending names and requests.** B's pending names / pending membership requests in groups where A is active move to A without being merged; approving one later gives A two names in that group (same state as the degrade path above).
- **Migration dry run.** Before the first production deploy, dry-run migration 0005 against a local import of a `wrangler d1 export` of production.

---

## 9. Summary of File Changes

| Stage | Files |
|---|---|
| 1 | new `apps/web/src/lib/zaloEnv.ts`, `lib/clipboard.ts`, `components/SaveImageSheet.tsx` + `.css`; edit `lib/qr.ts` (`blobToDataUrl`), `components/PayQr.tsx`, `components/ExpenseDetails.tsx`, `components/BankAppSheet.tsx` (+ `.css`), `i18n/en.ts`, `i18n/vi.ts` |
| 2 | new `apps/api/src/og/text.ts`, `og/html.ts`, `og/routes.ts`, `scripts/render-og-images.mjs`, `scripts/og/trip.svg`, `scripts/og/sport.svg`, `apps/web/public/og/trip.png`, `apps/web/public/og/sport.png`; edit `apps/api/src/app.ts`, `apps/api/wrangler.jsonc`, `apps/web/index.html`, `apps/web/src/App.tsx`, `screens/Join.tsx`, `screens/TripRoute.tsx`, `screens/WhoAreYou.tsx`, `lib/remind.ts`, `components/ExpenseDetails.tsx` |
| 3 | new `apps/api/migrations/0005_zalo_oauth.sql`, `apps/api/src/auth/zalo.ts`, `auth/identity.ts`, `auth/accountRoutes.ts`, `auth/mergeUsers.ts`, `apps/web/src/components/SignInButtons.tsx` (+ `.css`), `SignInSheet.tsx`, `AuthNotice.tsx`, `LinkedAccounts.tsx` (+ `.css`), `MergeRequestBanner.tsx` (+ `.css`), `MergeConfirmSheet.tsx`; edit `apps/api/src/db/schema.ts`, `env.ts`, `auth/routes.ts`, `auth/testLogin.ts`, `trips/view.ts`, `app.ts`, `packages/core/src/api-types.ts`, `apps/web/src/api/hooks.ts`, `components/icons.tsx`, `components/AccountMenu.tsx` (+ `.css`, incl. the badge dot on its trigger), `components/ApprovalsCard.tsx`, `components/ConsentSheet.tsx`, `components/InlineError.tsx`, `screens/Landing.tsx`, `screens/MyTrips.tsx`, `screens/CreateTrip.tsx`, `screens/GuestTrip.tsx`, `screens/WhoAreYou.tsx`, `screens/Privacy.tsx`, `App.tsx`, `i18n/en.ts`, `i18n/vi.ts`, `docs/setup.md` |
