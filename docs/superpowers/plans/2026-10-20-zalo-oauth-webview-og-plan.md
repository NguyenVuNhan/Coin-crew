# Zalo Sign-In, Account Merge, Link Previews & Zalo Webview Bridge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make CoinCrew links work inside Zalo's in-app browser: a picture sheet for saving and sharing, rich link-preview cards, and Zalo sign-in with account linking and confirmed merges.

**Architecture:** Three stages that each ship alone. Stage 1 is web-only (`isZaloWebView` branches in three call sites). Stage 2 adds a Worker route for `/j/*` and `/t/*` that rewrites `index.html` with `HTMLRewriter`, using text from the cached `trip_views` snapshot and two static PNGs. Stage 3 rebuilds `users` (nullable `google_sub` and `email`, new `zalo_sub`), adds `account_merge_requests`, Zalo OAuth v4 with PKCE, link/unlink/change, and a two-phase merge.

**Tech Stack:** Cloudflare Workers + D1 (Hono, Drizzle, `arctic`), React 19 + React Router + TanStack Query (Vite PWA), Vitest (Workers pool for the API, jsdom for the web), Playwright (only for the one-off image render).

**Spec:** `docs/superpowers/specs/2026-10-20-zalo-oauth-webview-og-design.md`. Read it with this plan; section numbers below (§) refer to it.

## Global Constraints

- Zero new npm dependencies (spec §3).
- Workers Free: 10 ms CPU per request, 50 D1 queries per invocation. A preview request is one indexed `trips` read plus `getSnapshot`.
- Never put people's names, bank names or account numbers in preview cards. Every `/j/*` and `/t/*` response carries `X-Robots-Tag: noindex, nofollow`.
- Every new i18n key goes in both `apps/web/src/i18n/en.ts` and `vi.ts`. Every new `vi.ts` key line ends with `// REVIEW`.
- Use `tokens.css` custom properties. Touch targets ≥ 44×44 px. Invoke the `ui-ux-design-companion` skill before any frontend change.
- **Existing tests are never edited by the implementer.** Where a copy change makes an existing assertion out of date, the task has a **Controller step**: the controller (not the implementer) makes that exact edit.
- Every commit message ends with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Commands run from the repo root. Web: `npm run test -w @fsl/web -- <file>`. API: `npm run test -w @fsl/api -- <file>`. Typecheck: `npm run typecheck`. Full suite: `npm test`.
- `formatVnd` writes `4.900.000₫` (dots, no space before `₫`). Expected strings below use that form.

## Review Focus

1. **A clipboard call that never settles** (some webviews leave `writeText` pending). The picture must still appear, and the copy status simply stays empty. Test in Task 2.
2. **Odd `/j/` paths:** trailing slash, URL-encoded junk, an extra segment. They must give the right card or the dead-link card, never a 500 or JSON. Test in Task 6.
3. **A Zalo profile with an empty name or no picture.** It must create a user named `Zalo` with `avatar_url` NULL, not crash. Test in Task 12.
4. **Signing in with Zalo while signed in as a different account** (`intent=signin`). The browser becomes the Zalo account's session, and no merge request is created. Test in Task 12.
5. **Two quick taps on Share bill in Zalo.** The sheet must end on the latest render, never a stale earlier picture. Test in Task 2.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/web/src/lib/zaloEnv.ts` | `isZaloWebView(ua)` |
| `apps/web/src/lib/clipboard.ts` | `copyText(text)`, with the `execCommand` fallback |
| `apps/web/src/components/SaveImageSheet.tsx` (+ `.css`) | Long-press picture sheet and the `useImageSheet()` hook |
| `apps/api/src/og/text.ts` | Pure card text (`pageMeta`) in vi/en |
| `apps/api/src/og/html.ts` | `escapeHtml`, `metaTagsHtml`, `injectMeta` (HTMLRewriter) |
| `apps/api/src/og/routes.ts` | `pageRoutes()`: `GET /j/*`, `GET /t/*` |
| `scripts/og/*.svg`, `scripts/render-og-images.mjs`, `apps/web/public/og/*.png` | Static card images |
| `apps/api/migrations/0005_zalo_oauth.sql` | `users` rebuild + `account_merge_requests` |
| `apps/api/src/auth/zalo.ts` | Zalo OAuth v4 HTTP helpers and PKCE |
| `apps/api/src/auth/identity.ts` | `upsertIdentity`, `linkIdentity` |
| `apps/api/src/auth/me.ts` | `toMeUserView`, `buildMeResponse` |
| `apps/api/src/auth/accountRoutes.ts` | Unlink and merge-request endpoints |
| `apps/api/src/auth/mergeUsers.ts` | Two-phase account merge |
| `apps/web/src/components/SignInButtons.tsx` (+ `.css`), `SignInSheet.tsx` | Provider buttons, aware of the Zalo webview |
| `apps/web/src/components/AuthNotice.tsx` | Snackbar for `auth` / `linked` / `merge` query flags |
| `apps/web/src/components/LinkedAccounts.tsx` (+ `.css`) | "Sign-in methods" section of the account menu |
| `apps/web/src/components/MergeRequestBanner.tsx` (+ `.css`), `MergeConfirmSheet.tsx` | Confirming an incoming merge |

---

# Stage 1 — Zalo webview bridge

### Task 1: Zalo detection and clipboard helper

**Lane:** small build (2 new files + 2 tests).

**Files:**
- Create: `apps/web/src/lib/zaloEnv.ts`, `apps/web/src/lib/clipboard.ts`
- Test: `apps/web/src/lib/__tests__/zalo-env.test.ts`, `apps/web/src/lib/__tests__/clipboard.test.ts`

**Interfaces:**
- Produces: `isZaloWebView(ua?: string): boolean`; `copyText(text: string): Promise<boolean>` (never rejects).

- [ ] **Step 1: Write the failing tests**

`zalo-env.test.ts`, `describe('isZaloWebView')`:
- `it('is true for the iOS Zalo app')`: UA `'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Zalo iOS/24.10.1 ZaloTheme/light ZaloLanguage/vi'` → `true`.
- `it('is true for the Android Zalo app')`: UA `'Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36 Zalo android/12100740 ZaloTheme/dark ZaloLanguage/vi'` → `true`.
- `it('is false for Safari, Chrome and desktop')`: iOS Safari, Android Chrome and desktop Chrome UAs → `false`.
- `it('reads navigator.userAgent by default')`: `vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('… Zalo android/1')` → `isZaloWebView()` is `true`.

`clipboard.test.ts`, `describe('copyText')`:
- `it('uses the Clipboard API when it works')`: stub `navigator.clipboard.writeText` resolving → `true`, called with the text; `document.execCommand` not called.
- `it('falls back to execCommand when the Clipboard API rejects')`: `writeText` rejects; `document.execCommand = vi.fn(() => true)` → `true`; `execCommand` called with `'copy'`; no `<textarea>` left in `document.body`.
- `it('falls back to execCommand when there is no Clipboard API')`: `navigator.clipboard` undefined → uses `execCommand`.
- `it('is false when both are blocked')`: `writeText` rejects; `execCommand` returns `false` → `false`.
- `it('starts the Clipboard API call synchronously')`: `const p = copyText('x')`; assert `writeText` was already called before `await p`.

- [ ] **Step 2: Run them and see them fail**

Run: `npm run test -w @fsl/web -- src/lib/__tests__/zalo-env.test.ts src/lib/__tests__/clipboard.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

- `isZaloWebView`: as spec §4.1.1.
- `copyText` order (§4.1.2): call `navigator.clipboard.writeText(text)` immediately when it exists; on rejection or absence, use a hidden `readonly` off-screen `<textarea>` with `select()` and `document.execCommand('copy')`, guarded by `typeof document.execCommand === 'function'`. Always remove the textarea.

- [ ] **Step 4: Run them and see them pass**

Same command. Expected: PASS.

- [ ] **Step 5: Commit**

`git add apps/web/src/lib/zaloEnv.ts apps/web/src/lib/clipboard.ts apps/web/src/lib/__tests__/zalo-env.test.ts apps/web/src/lib/__tests__/clipboard.test.ts`
`git commit -m "feat(web): detect the Zalo webview and copy text with a webview fallback"`

### Task 2: Save-picture sheet and `useImageSheet`

**Lane:** screen (invoke `ui-ux-design-companion` first).

**Files:**
- Create: `apps/web/src/components/SaveImageSheet.tsx`, `apps/web/src/components/SaveImageSheet.css`, `apps/web/src/i18n/__tests__/review-markers.test.ts`
- Modify: `apps/web/src/lib/qr.ts` (add `blobToDataUrl`), `apps/web/src/i18n/en.ts`, `apps/web/src/i18n/vi.ts`
- Test: `apps/web/src/components/__tests__/save-image-sheet.test.tsx`

**Interfaces:**
- Consumes: `copyText` (Task 1); `Sheet` (`{ open, onClose, title, children }`); `Skeleton`; `Button`.
- Produces:
  - `blobToDataUrl(blob: Blob): Promise<string>` in `lib/qr.ts`.
  - `useImageSheet(): { sheet: JSX.Element; show(render: () => Promise<Blob | null>, message?: string): void }`.
  - i18n keys: `share.imageTitle`, `share.longPress`, `share.copied`, `share.copyMessage`, `share.openInBrowser`, `share.imageFailed`.

- [ ] **Step 1: Write the failing tests**

i18n copy, en / vi (vi lines end with `// REVIEW`):
- `share.imageTitle`: `'Save the picture'` / `'Lưu ảnh'`
- `share.longPress`: `'Press and hold the picture (2 seconds) to save it or share it straight to your Zalo group'` / `'Nhấn giữ ảnh (2 giây) để Lưu về máy hoặc Chia sẻ ngay vào nhóm Zalo'`
- `share.copied`: `'Message copied — paste it in the Zalo group'` / `'Đã sao chép tin nhắn — dán vào nhóm Zalo'`
- `share.copyMessage`: `'Copy message'` / `'Sao chép tin nhắn'`
- `share.openInBrowser`: `"Can't save? Tap ⋯ → Open in browser"` / `'Không lưu được? Nhấn ⋯ → Mở bằng trình duyệt'`
- `share.imageFailed`: `"Couldn't make the picture."` / `'Không tạo được ảnh.'`

`save-image-sheet.test.tsx`: a test harness component calls `useImageSheet()`, renders `sheet`, and exposes a button that calls `show(...)`. `render` resolves `new Blob(['x'], { type: 'image/png' })`; jsdom's real `FileReader` turns it into a `data:image/png;base64,…` URL.
- `it('copies the message before the picture is ready, then shows both')`: `render` returns a promise resolved manually. After the click, `copyText` (spied via `vi.mock('../../lib/clipboard')`) has already been called with `'msg'`, and a `Skeleton` is visible. After resolving, `screen.getByRole('img')` has `src` starting with `data:image/png`; texts `share.longPress` and `share.copied` are visible.
- `it('shows no copy controls without a message')`: `show(render)` → no `Copy message` button, no copied status.
- `it('still shows the picture when the copy never settles')` (Review Focus 1): `copyText` returns `new Promise(() => {})` → the img appears; `share.copied` absent; `Copy message` present.
- `it('says so when the picture cannot be made')`: `render` resolves `null` → no img; `share.imageFailed`, `Copy message` and `share.openInBrowser` visible.
- `it('the copy button copies again and updates the status')`: first copy resolves `false`; clicking `Copy message` (second copy resolves `true`) shows `share.copied`.
- `it('ends on the latest picture after two quick shows')` (Review Focus 5): the first render resolves after the second → the img shows the second blob's data URL.

`review-markers.test.ts`, `it('every vi key line is marked for review except the two shared words')`: read `vi.ts` with `readFileSync(join(import.meta.dirname, '..', 'vi.ts'), 'utf8')`. Take every line matching `/^\s+'[\w.]+': /` that does not end with `// REVIEW`, map each to its key, and expect exactly `["'people.genderMale'", "'people.genderFemale'"]`.

- [ ] **Step 2: Run them and see them fail**

Run: `npm run test -w @fsl/web -- src/components/__tests__/save-image-sheet.test.tsx src/i18n/__tests__/review-markers.test.ts`
Expected: the sheet tests FAIL (module missing). The marker test PASSES before the new keys and must still pass after them.

- [ ] **Step 3: Implement**

- `blobToDataUrl` uses `FileReader.readAsDataURL`.
- `useImageSheet` (§4.1.3): each `show` call increments a request counter; a render result is applied only if its counter is still the latest. The copy promise sets the status only when it settles.
- Sheet layout: image full width with `-webkit-touch-callout: default`; instruction; status line (`aria-live="polite"`); `Copy message` as a secondary block `Button` ≥ 44 px; the hint as muted small text. Colours and spacing from `tokens.css`.

- [ ] **Step 4: Run them and see them pass**

Same command. Expected: PASS. Also run `npm run typecheck`. Expected: no errors (the `vi` record type enforces key parity).

- [ ] **Step 5: Commit**

`git commit -m "feat(web): long-press picture sheet for the Zalo webview"`

### Task 3: Use the sheet in Zalo at the three call sites, plus the bank hint

**Lane:** small build (3 component files + i18n).

**Files:**
- Modify: `apps/web/src/components/PayQr.tsx`, `apps/web/src/components/ExpenseDetails.tsx` (`handleShareSportBill`), `apps/web/src/components/BankAppSheet.tsx` (+ `BankAppSheet.css`), `apps/web/src/i18n/en.ts`, `vi.ts`
- Test: `apps/web/src/components/__tests__/zalo-share.test.tsx`

**Interfaces:**
- Consumes: `isZaloWebView` (Task 1); `useImageSheet` (Task 2); existing `qrPngBlob(svg)`, `renderSportBillPng(input)`, `saveQr`, `shareQr`, `shareSportBill`.
- Produces: i18n key `pay.zaloBankHint`.

- [ ] **Step 1: Write the failing tests**

Copy for `pay.zaloBankHint`:
- en: `"Bank app didn't open? Save the QR, then in your bank app choose Scan QR → pick the picture. Or tap ⋯ → Open in browser."`
- vi: `'Ứng dụng ngân hàng không mở? Lưu mã QR, rồi trong app ngân hàng chọn Quét QR → chọn ảnh. Hoặc nhấn ⋯ → Mở bằng trình duyệt.'`

`zalo-share.test.tsx`:
- Mock `../../lib/qr` like `your-transfers.test.tsx` does (keep the originals, but replace `qrPngBlob`, `renderSportBillPng`, `saveQr`, `shareQr` and `shareSportBill` with `vi.fn`; the renders resolve a PNG `Blob`).
- Mock `../../lib/clipboard` so `copyText` resolves `true`.
- Stub the user agent with `vi.spyOn(navigator, 'userAgent', 'get')`.
- Reuse the `payInfo()` shape from `your-transfers.test.tsx` and the sport expense fixture shape from `src/test/sportExpense.test.tsx:296`.

Tests:
- `it('Save QR opens the picture sheet inside Zalo')`: render `<PayQr variant="pay" info={payInfo()} />` with a Zalo UA, click `Save QR` → dialog `Save the picture` with an img; `saveQr` not called; `copyText` not called.
- `it('Share copies the reminder and opens the sheet inside Zalo')`: `<PayQr variant="receive" shareText="Nhắc Chi" … />`, click `Share` → `copyText` called with `'Nhắc Chi'`; `shareQr` not called; the dialog is shown.
- `it('Share bill & QR copies the message and opens the sheet inside Zalo')`: through `TripRoute` at `/t/t-sport/expenses/e-sport-1` with a Zalo UA (tests run in English) → click `Share bill & QR` → `copyText` called with a string containing `'Court 300.000₫'`; `shareSportBill` not called; dialog shown.
- `it('outside Zalo the old paths run')`: Chrome UA: `Save QR` calls `saveQr`; `Share` calls `shareQr`; no dialog.
- `it('the bank app sheet shows the Zalo hint only in Zalo')`: render `<BankAppSheet open onClose={() => {}} />` with a Zalo UA → `pay.zaloBankHint` text present; with the Chrome UA → absent.

- [ ] **Step 2: Run them and see them fail**

Run: `npm run test -w @fsl/web -- src/components/__tests__/zalo-share.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

- Branch on `isZaloWebView()` at click time, per the §4.1.4 table.
- In `ExpenseDetails`, build `billInput` synchronously, then call `show(() => renderSportBillPng(billInput), msgText)` before any `await`.
- Render `sheet` once in each component.
- `BankAppSheet` keeps its `<a href>`, and adds `<p className="fsl-bank-app-sheet__zalo-hint">` below the list when in Zalo.

- [ ] **Step 4: Run them and see them pass, then the stage gate**

Run: `npm run test -w @fsl/web -- src/components/__tests__/zalo-share.test.tsx`, then `npm run typecheck`, then `npm test`.
Expected: all PASS. The existing `your-transfers`, `pay` and `sportExpense` suites are unchanged.

- [ ] **Step 5: Commit**

`git commit -m "feat(web): save and share pictures through the sheet inside Zalo"`

---

# Stage 2 — Link preview cards

### Task 4: Card text (`og/text.ts`)

**Lane:** small build (1 file + 1 test).

**Files:**
- Create: `apps/api/src/og/text.ts`
- Test: `apps/api/test/og-text.test.ts`

**Interfaces:**
- Consumes: `TripSnapshot` (`apps/api/src/trips/snapshot.ts`), `ExpenseView`, `formatVnd` (`@fsl/core`).
- Produces: `PageMetaInput`, `PageMeta` and `pageMeta(input)` exactly as spec §4.2.3; also `export const OG_TEXT: Record<'vi' | 'en', Record<OgTextKey, string>>` (the string table, exported for the parity test).

- [ ] **Step 1: Write the failing tests**

Fixtures:
- `snap(overrides)` builds a `TripSnapshot` with trip `{ name: 'Đà Lạt · Oct 2026', preset: 'trip', defaultLang: 'vi', total: 4900000 }` and 4 active people plus 1 pending (the pending one is not counted).
- `NOW = new Date('2026-10-20T20:00:00Z')`, which is 21/10 in UTC+7.

Tests (each asserts exact strings):
- `it('generic card')`: title `'CoinCrew (Tiền Đâu)'`, description `'Chia tiền nhóm, trả nhau bằng VietQR.'`, image `'trip'`, locale `'vi_VN'`.
- `it('dead card')`: description `'Link này không còn dùng được. Hỏi người tạo nhóm link mới.'`.
- `it('group card with a total, dated in Vietnam time')`: title `'Đà Lạt · Oct 2026'`; description `'Đến 21/10: tổng chi 4.900.000₫ · 4 người — mở để xem ai cần trả ai bao nhiêu.'`.
- `it('group card in English')`: `defaultLang: 'en'` → `'As of 21 Oct: 4.900.000₫ spent · 4 people — open to see who owes whom.'`, locale `'en_US'`.
- `it('group card with no expenses')`: total `0` → `'Chưa có chi tiêu nào · 4 người — mở để thêm và chia tiền.'`.
- `it('sport group card')`: preset `'sport'` → description starts with `'Nhóm thể thao · Đến 21/10'`; image `'sport'`.
- `it('sport expense breakdown with different rates')`:
  - expense `{ description: 'Cầu lông tối T5', meta.sport: { court: 300000, shuttlecocks: [{ qty: 2, unitPrice: 60000 }], extra: 50000, maleSlotRate: 45000, femaleSlotRate: 35000, entries: [{ maleSlots: 2, femaleSlots: 0 }, { maleSlots: 0, femaleSlots: 1 }, { maleSlots: 1, femaleSlots: 0, fixedAmount: 20000 }] } }`
  - title `'Cầu lông tối T5 · Đà Lạt · Oct 2026'`
  - description `'Sân 300.000₫ · Cầu 120.000₫ · Phụ phí 50.000₫ · Nam 45.000₫ / Nữ 35.000₫ — mở để lấy mã QR.'`
- `it('sport expense with one rate')`: equal rates → `'Sân 300.000₫ · Mỗi suất 100.000₫ — mở để lấy mã QR.'`; zero shuttlecocks and zero extra are omitted.
- `it('other expense card has no names')`: an expense of 860000 with 4 shares → `'860.000₫ · chia 4 người — mở để xem phần của bạn.'`. Assert the output contains none of the snapshot's people names.
- `it('cuts long text')`: a trip name of 120 characters → title length ≤ 90 and ends with `'…'`; a description longer than 200 characters is likewise ≤ 200.
- `it('vi and en have the same keys')`: `Object.keys(OG_TEXT.vi).sort()` equals `Object.keys(OG_TEXT.en).sort()`.

- [ ] **Step 2: Run them and see them fail**

Run: `npm run test -w @fsl/api -- test/og-text.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `pageMeta`**

Dates via `Intl.DateTimeFormat` with `timeZone: 'Asia/Ho_Chi_Minh'`: vi `{ day: '2-digit', month: '2-digit' }` (`21/10`), en `en-GB` `{ day: 'numeric', month: 'short' }` (`21 Oct`). Sport rules exactly as §4.2.3.

- [ ] **Step 4: Run them and see them pass**

Same command. Expected: PASS.

- [ ] **Step 5: Commit**

`git commit -m "feat(api): preview card text for group and expense links"`

### Task 5: Tag rendering and HTML injection (`og/html.ts`)

**Lane:** small build.

**Files:**
- Create: `apps/api/src/og/html.ts`, `apps/api/test/fixtures/indexHtml.ts` (exports `INDEX_HTML`, the `FIXTURE` below; Task 6 reuses it)
- Test: `apps/api/test/og-html.test.ts`

**Interfaces:**
- Consumes: `PageMeta` (Task 4).
- Produces:
  - `escapeHtml(s: string): string`
  - `metaTagsHtml(meta: PageMeta, pathname: string, origin: string): string`
  - `injectMeta(res: Response, meta: PageMeta, pathname: string, origin: string): Response`

- [ ] **Step 1: Write the failing tests**

`FIXTURE`: `index.html` text with `<title>CoinCrew (Tiền Đâu)</title>`, `<meta name="description" content="x">`, `<meta property="og:title" content="x">` and `<meta name="twitter:card" content="x">`. `ORIGIN = 'https://coin-crew.example.workers.dev'`.

Tests:
- `it('escapes the five characters')`: `escapeHtml(`<a href="x">'&'</a>`)` → `'&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;'`.
- `it('renders every tag with absolute URLs')`: for `{ title: 'T', description: 'D', image: 'sport', locale: 'vi_VN' }` and pathname `'/j/gtok-1'`, the output contains:
  - `<meta property="og:image" content="https://coin-crew.example.workers.dev/og/sport.png">`
  - `og:image:width` `1200`, `og:image:height` `630`, `og:image:type` `image/png`
  - `og:url` `${ORIGIN}/j/gtok-1`, `og:locale` `vi_VN`, `og:site_name` `CoinCrew (Tiền Đâu)`
  - `twitter:card` `summary_large_image`, `twitter:image`
  - `<meta name="robots" content="noindex, nofollow">`
- `it('replaces the default tags and the title')`: `await injectMeta(new Response(FIXTURE, { headers: { 'content-type': 'text/html', etag: '"1"' } }), meta, '/j/gtok-1', ORIGIN).text()` has exactly one `og:title`, exactly one `name="description"`, `<title>T</title>`, and no `content="x"`.
- `it('a hostile name cannot break out')`: title `'"><script>alert(1)</script>'` → the body does not contain `<script>alert(1)`, and does contain `&lt;script&gt;`.
- `it('sets the headers')`: response has no `etag` or `content-length`; `x-robots-tag` is `'noindex, nofollow'`; `cache-control` is `'no-cache'`; `content-type` starts with `'text/html'`.

- [ ] **Step 2: Run them and see them fail**

Run: `npm run test -w @fsl/api -- test/og-html.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement as spec §4.2.4**

Use `HTMLRewriter`: `.on('title', { element: (e) => e.setInnerContent(meta.title) })`; `.remove()` on the four default-tag selectors; `.on('head', { element: (e) => e.append(metaTagsHtml(...), { html: true }) })`.

- [ ] **Step 4: Run them and see them pass**

Same command. Expected: PASS.

- [ ] **Step 5: Commit**

`git commit -m "feat(api): render preview meta tags into index.html"`

### Task 6: Page routes, worker-first paths and static default tags

**Lane:** small build.

**Files:**
- Create: `apps/api/src/og/routes.ts`
- Modify: `apps/api/src/app.ts` (mount `app.route('/', pageRoutes())`), `apps/api/wrangler.jsonc` (`run_worker_first`), `apps/web/index.html`
- Test: `apps/api/test/og-routes.test.ts`

**Interfaces:**
- Consumes: `pageMeta` (Task 4), `injectMeta` (Task 5), `getSnapshot` (`trips/snapshot.ts`), `getDb`, `trips` schema.
- Produces: `pageRoutes(): Hono<AppBindings>`.

- [ ] **Step 1: Write the failing tests**

Helpers:
- `page(path, overrides = {})` calls `app.request(path, {}, { ...env, ASSETS: { fetch: async () => new Response(INDEX_HTML, { headers: { 'content-type': 'text/html' } }) }, ...overrides })`, with `INDEX_HTML` from `test/fixtures/indexHtml.ts` (Task 5).
- `metaContent(html, prop)` extracts a tag's `content`.

Use `seedTrip()` and `seedExpenses()` from `test/helpers.ts` (total `4.900.000₫`, 4 active people). For the sport case, insert one `transactions` row (`id = root_id = 'e-sport'`, status `approved`, `meta_json` set to the Task 4 sport meta) and set `trips.preset = 'sport'`.

Tests:
- `it('a group link gets the group card')`: `/j/gtok-1` → `og:title` `'Đà Lạt · Oct 2026'`; `og:description` contains `'tổng chi 4.900.000₫ · 4 người'`; `og:image` `'http://localhost:8787/og/trip.png'`; `og:url` `'http://localhost:8787/j/gtok-1'`.
- `it('a view-only link gets the same card')`: `/j/vtok-1` → same `og:title`.
- `it('an expense link gets the sport breakdown')`: `/j/gtok-1/e/e-sport` → `og:description` starts with `'Sân 300.000₫'`; `og:image` ends `'/og/sport.png'`.
- `it('a rejected or missing expense falls back to the group card')`: `/j/gtok-1/e/nope` → the group description.
- `it('an unknown token gets the dead card')`: `/j/old` → `og:description` `'Link này không còn dùng được. Hỏi người tạo nhóm link mới.'`.
- `it('odd paths never fail')` (Review Focus 2):
  - `/j/gtok-1/` → group card.
  - `/j/%E2%80%A6%3Cscript%3E` → dead card, status 200.
  - `/j/gtok-1/x/y` → group card.
- `it('/t paths get the generic card, even for a real trip')`: `/t/t-1` and `/t/t-1/expenses/e-1` → `og:title` `'CoinCrew (Tiền Đâu)'`; the body does not contain `'Đà Lạt'`.
- `it('never shows a bank account number')`: after `seedMinhBank()`, `/j/gtok-1` does not contain `'19031234565678'`, `'1903'` or `'Techcombank'`.
- `it('is not indexed')`: header `x-robots-tag` `'noindex, nofollow'` on `/j/gtok-1` and `/t/t-1`.
- `it('passes a failing asset fetch through')`: `ASSETS.fetch` returns `new Response('no', { status: 503 })` → status 503, body `'no'`.
- `it('falls back to the generic card when the database fails')`: override `DB` with an object whose `prepare` throws → status 200, `og:title` `'CoinCrew (Tiền Đâu)'`.
- `it('reads the cached snapshot instead of rebuilding')`: open `/j/gtok-1` twice; `SELECT version FROM trip_views WHERE trip_id = 't-1'` equals the trip's version, and the row's `updated_at` is unchanged between the two calls.

- [ ] **Step 2: Run them and see them fail**

Run: `npm run test -w @fsl/api -- test/og-routes.test.ts`
Expected: FAIL (404 JSON).

- [ ] **Step 3: Implement as spec §4.2.2**

- `GET /j/*`: split `c.req.path` into segments. Token = segment 1, decoded with `decodeURIComponent` inside a try; a failed decode or a mismatch with `^[A-Za-z0-9_-]{1,64}$` → dead card. If segment 2 is `'e'` and segment 3 exists → expense lookup by `id` or `rootId`, with status `approved` or `pending`, else the group card.
- `GET /t/*`: generic card, no DB access.
- Origin comes from `c.env.APP_ORIGIN`. Fetch `new URL('/', c.req.url)` from `ASSETS`.
- `wrangler.jsonc`: `"run_worker_first": ["/api/*", "/j/*", "/t/*"]`.
- `index.html`: add the static generic tags from §4.2.2: description and `og:description` `'Chia tiền nhóm, trả nhau bằng VietQR.'`, `og:title` and `og:site_name` `'CoinCrew (Tiền Đâu)'`, `og:type` `website`, `twitter:card` `summary_large_image`.

- [ ] **Step 4: Run them and see them pass, then the API suite**

Run: `npm run test -w @fsl/api -- test/og-routes.test.ts`, then `npm run test -w @fsl/api`.
Expected: PASS (scaffold and access tests unchanged).

- [ ] **Step 5: Commit**

`git commit -m "feat(api): serve preview cards on group and expense links"`

### Task 7: Card images (controller task)

**Lane:** controller. It needs Chromium, a visual review and committed binaries.

**Files:**
- Create: `scripts/og/trip.svg`, `scripts/og/sport.svg`, `scripts/render-og-images.mjs`, `apps/web/public/og/trip.png`, `apps/web/public/og/sport.png`

- [ ] **Step 1:** Invoke `ui-ux-design-companion` with the §4.2.5 brief:
  - 1200×630, brand teal `#0f766e`, the app icon from `apps/web/public/icon.svg`, the wordmark `CoinCrew (Tiền Đâu)`
  - tagline `Chia tiền nhóm · Trả bằng VietQR` (trip) or `Chia tiền sân · Nam / Nữ · VietQR` (sport)
  - all text inside the centre 1000×500

  Write the two SVGs.
- [ ] **Step 2:** Write `scripts/render-og-images.mjs`: `import { chromium } from '@playwright/test'`; for each name, `page.setViewportSize({ width: 1200, height: 630 })`, `page.goto(pathToFileURL('scripts/og/<name>.svg').href)`, `page.screenshot({ path: 'apps/web/public/og/<name>.png' })`.
- [ ] **Step 3:** Run `node scripts/render-og-images.mjs`. Expected: two PNGs, each 1200×630 and ≤ 300 KB (check with `node -e` reading the IHDR width and height and `fs.statSync().size`).
- [ ] **Step 4:** Look at both PNGs, and at a 1.91:1 and a 1:1 centre crop. Reject if any text is clipped.
- [ ] **Step 5:** Run `npm run build -w @fsl/web`. Expected: `apps/api/public/og/trip.png` exists.
- [ ] **Step 6: Commit**

`git commit -m "feat(web): static preview card images"`

### Task 8: Expense links on the web

**Lane:** small build (≤ 3 screens + lib).

**Files:**
- Modify: `apps/web/src/App.tsx`, `apps/web/src/screens/Join.tsx`, `apps/web/src/screens/TripRoute.tsx`, `apps/web/src/screens/WhoAreYou.tsx`, `apps/web/src/lib/remind.ts`, `apps/web/src/components/ExpenseDetails.tsx` (`msgText`)
- Test: `apps/web/src/screens/__tests__/expense-links.test.tsx`

**Interfaces:**
- Produces:
  - `expenseLink(view: TripView, id: string): string` in `lib/remind.ts`.
  - `safeTripPath(next: string | null, tripId: string): string`, exported from `WhoAreYou.tsx`.

- [ ] **Step 1: Write the failing tests**

- `it('an expense link stores the token and opens the expense')`: `mockApi({ 'GET /api/links/gtok-1': { tripId: 't-1', tripName: 'x', access: 'group' } })`; `renderAt(<Join />, { route: '/j/gtok-1/e/e-2', path: '/j/:token/e/:expenseId' })` → location `/t/t-1/expenses/e-2`; `linkTokens.get('t-1')` is `'gtok-1'`.
- `it('a guest who has not picked is sent to who with next')`: render `TripRoute` at `/t/t-1/expenses/e-2` with a guest view where `participantId: null`. Use a test-local location probe that shows `pathname + search`; it shows `/t/t-1/who?next=%2Ft%2Ft-1%2Fexpenses%2Fe-2`.
- `it('after a pick, who returns to next')`: `WhoAreYou` at `/t/t-1/who?next=%2Ft%2Ft-1%2Fexpenses%2Fe-2`, continue as Chi → location `/t/t-1/expenses/e-2`.
- `it('safeTripPath accepts only this trip')`:
  - `safeTripPath('/t/t-1/expenses/e-2', 't-1')` → same
  - `safeTripPath('/t/t-2', 't-1')` → `'/t/t-1'`
  - `safeTripPath('//evil.com', 't-1')` → `'/t/t-1'`
  - `safeTripPath('/t/t-1\\x', 't-1')` → `'/t/t-1'`
  - `safeTripPath(null, 't-1')` → `'/t/t-1'`
- `it('expenseLink appends the expense and falls back without a token')`: `expenseLink(tripView(), 'e-2')` ends with `'/j/gtok-1/e/e-2'`; with `links: null` and no stored token it equals `groupLink(view)`.
- `it('the bill message links to the expense')`: with the sport fixture from `src/test/sportExpense.test.tsx:296` (rootId `e-sport-1`), its `links` set to `{ group: 'gtok-s', view: 'vtok-s' }`, and `shareSportBill` mocked. Click `Share bill & QR` (Chrome UA) → the text passed to `shareSportBill` contains `'/j/gtok-s/e/e-sport-1'`.

- [ ] **Step 2: Run them and see them fail**

Run: `npm run test -w @fsl/web -- src/screens/__tests__/expense-links.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement as spec §4.2.6**

The `WhoAreYou` sign-in `returnTo` values use `safeTripPath(next, tripId)`.

- [ ] **Step 4: Run them and see them pass, then the stage gate**

Run the file, then `npm run typecheck`, then `npm test`.
Expected: PASS. The existing `join.test.tsx` cases stay green, because with no `next` the target is `/t/t-1`.

- [ ] **Step 5: Commit**

`git commit -m "feat(web): per-expense share links that survive the who-are-you step"`

---

# Stage 3 — Zalo sign-in, linking, merging

### Task 9: Migration 0005 and schema

**Lane:** small build.

**Files:**
- Create: `apps/api/migrations/0005_zalo_oauth.sql`
- Modify: `apps/api/src/db/schema.ts`, `apps/api/src/auth/testLogin.ts`, `packages/core/src/api-types.ts` (only `MeUserView.email: string | null` and the membership `Approval`'s `userEmail: string | null`, so typecheck stays green)
- Test: `apps/api/test/migration-0005.test.ts`

**Interfaces:**
- Produces:
  - Drizzle `users.googleSub`, `users.zaloSub` and `users.email`, all `string | null`.
  - Core `MeUserView.email: string | null`; membership `Approval.userEmail: string | null`.
  - Table `accountMergeRequests` with fields `id`, `survivorUserId`, `mergedUserId`, `provider` (enum `['google', 'zalo']`), `providerSub`, `status` (enum `['pending', 'accepted', 'declined', 'cancelled']`), `createdAt`, `expiresAt`, `decidedAt`.
  - `POST /api/test/login` accepts `{ sub, name, email?, provider?: 'google' | 'zalo' }`.

- [ ] **Step 1: Write the failing tests**

All against `env.DB` (migrations are applied by `test/setup.ts`):
- `it('keeps google_sub unique')`: two inserts with the same `google_sub` → the second rejects.
- `it('keeps zalo_sub unique')`: same with `zalo_sub`.
- `it('lets many users have no google_sub')`: two Zalo-only users (`google_sub` NULL, `email` NULL) both insert.
- `it('refuses a user with no identity')`: insert with both subs NULL → rejects (CHECK).
- `it('has the merge request table')`: insert a row and select it back.
- `it('test login can create a Zalo-only user')`: with `E2E_LOGIN: '1'` in the env override, `POST /api/test/login` with `{ sub: 'z-1', name: 'Chi', provider: 'zalo' }` → the row has `zalo_sub 'z-1'`, `google_sub` NULL and `email` NULL.

- [ ] **Step 2: Run them and see them fail**

Run: `npm run test -w @fsl/api -- test/migration-0005.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

- SQL exactly as spec §4.3.1 and §4.3.2.
- Drizzle: partial `uniqueIndex(...).on(...).where(sql\`… IS NOT NULL\`)` and `check('users_identity_check', sql\`google_sub IS NOT NULL OR zalo_sub IS NOT NULL\`)`.
- `testLogin` looks the user up by the matching column.

- [ ] **Step 4: Run them and see them pass, then the API suite and typecheck**

Run the file, `npm run test -w @fsl/api` and `npm run typecheck`.
Expected: tests PASS (`seedUser` still inserts `google_sub`); typecheck clean. The Google callback's `claims.email` is still a string. If a file other than `auth/routes.ts`, `auth/testLogin.ts`, `trips/view.ts` or `api-types.ts` needs a change to compile, stop and report.

- [ ] **Step 5: Commit**

`git commit -m "feat(api): users can sign in with Zalo or Google, and accounts can request a merge (migration 0005)"`

### Task 10: Contract changes and the new `/api/me`

**Lane:** small build.

**Files:**
- Create: `apps/api/src/auth/me.ts`
- Modify: `packages/core/src/api-types.ts`, `apps/api/src/env.ts`, `apps/api/src/auth/routes.ts` (`GET /me`, `PATCH /me` use `me.ts`), `apps/api/src/trips/view.ts` (nullable `userEmail`), `apps/api/vitest.config.ts` (bindings `ZALO_APP_ID: 'test-zalo-app'`, `ZALO_APP_SECRET: 'test-zalo-secret'`)
- Test: `apps/api/test/me.test.ts`

**Interfaces:**
- Consumes: the nullable `email` types from Task 9.
- Produces:
  - Core types `AuthProvider`, `MeUserView.providers`, `IncomingMergeRequest`, `OutgoingMergeRequest` and `MeResponse` exactly as spec §4.3.4.
  - `ApiErrorCode` plus `'LAST_IDENTITY' | 'MERGE_STALE'`.
  - API `toMeUserView(user: UserRow): MeUserView`, `buildMeResponse(db: Db, env: Env, user: UserRow | null): Promise<MeResponse>`, `zaloConfigured(env: Env): boolean` (in `me.ts`; Task 11 re-exports it from `zalo.ts`).

- [ ] **Step 1: Write the failing tests**

- `it('signed out')`: `GET /api/me` → `{ user: null, signIn: { zalo: true }, mergeRequests: { incoming: [], outgoing: [] } }`.
- `it('Zalo hidden when not configured')`: env override `ZALO_APP_SECRET: undefined` → `signIn.zalo === false`.
- `it('lists providers')`: a Google user → `providers: ['google']`; a user with both subs → `['google', 'zalo']`; a Zalo-only user → `['zalo']` and `email: null`.
- `it('incoming lists pending unexpired requests for me')`: seed A (Google, email `a@x.com`, 2 active memberships), B (Zalo, 1 membership) and one pending request A→B expiring in 7 days, plus an expired one and a declined one. As B: `incoming` has exactly 1 item with `survivor: { name: 'A', email: 'a@x.com', providers: ['google'] }`, `groups: { survivor: 2, merged: 1 }`, `released: []`, `provider: 'zalo'`. As A: `outgoing` lists the pending one and the declined one; the expired one is absent.
- `it('released lists the identity B would lose')`: A has Google g1; B has Zalo z1 and Google g2 → `released: [{ provider: 'google', email: <B's email> }]`.
- `it('membership approvals carry a null email for Zalo users')`: a Zalo-only user requests membership; the admin's trip view has a `membership` approval with `userEmail: null`.

- [ ] **Step 2: Run them and see them fail**

Run: `npm run test -w @fsl/api -- test/me.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`buildMeResponse` runs at most three queries when signed in: incoming requests joined to survivor users; outgoing requests; and group counts via one `participants` count grouped by `user_id` for the user ids involved.

- [ ] **Step 4: Run them and see them pass**

Run the file, `npm run test -w @fsl/api` and `npm run typecheck`.
Expected: PASS, typecheck clean. The web keeps its local `MeResponse` types until Task 15.

- [ ] **Step 5: Commit**

`git commit -m "feat(core,api): providers, Zalo availability and merge requests in /api/me"`

### Task 11: Zalo OAuth helpers

**Lane:** small build.

**Files:**
- Create: `apps/api/src/auth/zalo.ts`
- Test: `apps/api/test/zalo-client.test.ts`

**Interfaces:**
- Produces:
  - `zaloPkce(): Promise<{ verifier: string; challenge: string }>` and `s256Challenge(verifier: string): Promise<string>`
  - `zaloAuthorizeUrl(env: Env, state: string, challenge: string): URL`
  - `exchangeZaloCode(env: Env, code: string, verifier: string): Promise<string>`
  - `fetchZaloProfile(accessToken: string): Promise<{ sub: string; name: string; avatarUrl: string | null }>`
  - `class ZaloError extends Error`
  - re-export `zaloConfigured`

- [ ] **Step 1: Write the failing tests**

Mock fetch with `vi.spyOn(globalThis, 'fetch')`, as `test/auth.test.ts` does.

- `it('S256 matches RFC 7636')`: `s256Challenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')` → `'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'`.
- `it('makes a 43-character verifier')`: `(await zaloPkce()).verifier` matches `/^[A-Za-z0-9_-]{43}$/`.
- `it('builds the authorize URL')`: host `oauth.zaloapp.com`, path `/v4/permission`; params `app_id 'test-zalo-app'`, `redirect_uri 'http://localhost:8787/api/auth/zalo/callback'`, `code_challenge`, `state`.
- `it('exchanges the code')`: assert the request is `POST https://oauth.zaloapp.com/v4/access_token`, header `secret_key: test-zalo-secret`, content type `application/x-www-form-urlencoded`, body params `code`, `app_id`, `grant_type=authorization_code`, `code_verifier`. Response `{ access_token: 'at', refresh_token: 'rt', expires_in: '3600' }` → `'at'`.
- `it('treats an error inside a 200 as failure')`: `{ error: -14002, error_name: 'Invalid code' }` with status 200 → rejects with `ZaloError`.
- `it('treats non-2xx, bad JSON and a missing token as failure')`: three cases → `ZaloError`.
- `it('reads the profile')`: `GET https://graph.zalo.me/v2.0/me?fields=id,name,picture` with header `access_token: at`; body `{ id: '84123', name: 'Chi Nguyễn', picture: { data: { url: 'https://s120-ava-talk.zadn.vn/a.jpg' } }, error: 0, message: 'Success' }` → `{ sub: '84123', name: 'Chi Nguyễn', avatarUrl: 'https://s120-ava-talk.zadn.vn/a.jpg' }`.
- `it('a profile error in a 200 is failure')`: `{ error: 452, message: 'Session key invalid' }` → `ZaloError`.

- [ ] **Step 2: Run them and see them fail**

Run: `npm run test -w @fsl/api -- test/zalo-client.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement as spec §4.4.1**

`generateCodeVerifier` comes from `arctic`; SHA-256 from `crypto.subtle`; `AbortSignal.timeout(8000)` on both requests. An empty profile name becomes `'Zalo'`.

- [ ] **Step 4: Run them and see them pass**

Same command. Expected: PASS.

- [ ] **Step 5: Commit**

`git commit -m "feat(api): Zalo OAuth v4 helpers with PKCE"`

### Task 12: Zalo sign-in routes and the shared identity upsert

**Lane:** small build.

**Files:**
- Create: `apps/api/src/auth/identity.ts` (`upsertIdentity`)
- Modify: `apps/api/src/auth/routes.ts` (Google callback uses `upsertIdentity`; Zalo `start` / `callback`; `intent` cookie on Google `start`), `docs/setup.md` (Zalo setup, spec §7 stage 3)
- Test: `apps/api/test/zalo-auth.test.ts`

**Interfaces:**
- Consumes: Task 11 helpers; `createSession`, `setSessionCookie`, `safeReturnTo`.
- Produces:
  - `upsertIdentity(db: Db, provider: AuthProvider, profile: { sub: string; name: string; avatarUrl: string | null; email?: string }): Promise<string>`
  - Routes `GET /api/auth/zalo/start`, `GET /api/auth/zalo/callback`
  - Cookie names `zalo_oauth_state`, `zalo_oauth_verifier`, `zalo_oauth_return`, `zalo_oauth_intent`, `oauth_intent`
  - Helper `withQuery(path: string, key: string, value: string): string`, exported from `routes.ts` for Task 13

- [ ] **Step 1: Write the failing tests**

`signInZalo(profile, returnTo = '/trips', extraCookies?)` is a helper: call `start`, read the cookies and `state`, mock fetch for the token and the profile, then call `callback?code=c&state=…`.

- `it('start answers 404 when Zalo is not configured')`.
- `it('start sets the four cookies and redirects to Zalo')`: 302 to host `oauth.zaloapp.com`; all four cookies present, `HttpOnly`, `Secure`, `SameSite=Lax`, `Max-Age=600`.
- `it('creates a Zalo user and signs in')`: callback 302 to `/t/abc`; `sid` set; row with `zalo_sub '84123'`, `name 'Chi Nguyễn'`, `avatar_url` from the profile, `email` NULL, `google_sub` NULL; the four cookies are cleared.
- `it('a returning user gets the new name and avatar')`.
- `it('a customised profile is kept')`: `custom_profile = 1` → name and avatar unchanged.
- `it('an empty name and no picture still work')` (Review Focus 3): profile `{ id: '9', name: '' }` → user name `'Zalo'`, `avatar_url` NULL.
- `it('signing in while signed in as someone else switches account')` (Review Focus 4): with a Google user's `sid` cookie, Zalo sign-in for a new identity → a new `sid` for the Zalo user; `account_merge_requests` is empty.
- `it('failures go back with auth=failed')`:
  - wrong state → `Location` `/t/abc?auth=failed`
  - Zalo `error=access_denied` → same
  - exchange `ZaloError` → same
  - no cookies at all → `/?auth=failed`
  - an existing query string → `/t/abc?becomeMember=1&auth=failed`
- `it('ignores an outside returnTo')`: `//evil.com` → `/trips`.
- The existing `test/auth.test.ts` Google suite stays green (it runs with the API suite).

- [ ] **Step 2: Run them and see them fail**

Run: `npm run test -w @fsl/api -- test/zalo-auth.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement as spec §4.4.2 and §4.4.3**

In this task `intent=link` is only stored; the `link` branch arrives in Task 13. Until then the callback treats every intent as `signin`. `docs/setup.md` gets the four setup steps from spec §7.

- [ ] **Step 4: Run them and see them pass**

Run the file and `npm run test -w @fsl/api`. Expected: PASS, including `auth.test.ts` unchanged.

- [ ] **Step 5: Commit**

`git commit -m "feat(api): sign in with Zalo"`

### Task 13: Link, change and unlink identities

**Lane:** small build.

**Files:**
- Modify: `apps/api/src/auth/identity.ts` (add `linkIdentity`), `apps/api/src/auth/routes.ts` (the `link` branch in both callbacks)
- Create: `apps/api/src/auth/accountRoutes.ts` (unlink here; Task 14 adds merge endpoints), mounted in `app.ts`
- Test: `apps/api/test/link-identity.test.ts`

**Interfaces:**
- Produces:
  - `linkIdentity(db: Db, userId: string, provider: AuthProvider, profile): Promise<{ result: 'linked' } | { result: 'merge_requested'; requestId: string }>`
  - `DELETE /api/me/identities/:provider` → `{ user: MeUserView }`
  - `accountRoutes(): Hono<AppBindings>`

- [ ] **Step 1: Write the failing tests**

- `it('links Zalo to a Google user')`: Google user with `sid`; Zalo start with `intent=link&returnTo=/trips` and the session cookie; callback → `Location` `/trips?linked=zalo`; the user row now has both subs; name and avatar unchanged; no new `sid` cookie set.
- `it('changes Zalo to a new unused identity')`: the user has `zalo_sub 'z-old'`; link proves `'z-new'` → `zalo_sub 'z-new'`; signing in later with `'z-old'` creates a different, new user.
- `it('linking my own identity again is a no-op')`: `?linked=zalo`, row unchanged.
- `it('intent=link without a session signs in instead')`: start with `intent=link` and no `sid` → the stored intent cookie is `signin`; the callback signs in as the Zalo user.
- `it('an identity owned by B creates a merge request and no session for B')`: B has `zalo_sub 'z-b'`; A links `'z-b'` → `Location` `/trips?merge=requested&provider=zalo`; one `pending` row (`survivor` A, `merged` B, `provider 'zalo'`, `provider_sub 'z-b'`, `expires_at` 7 days after `created_at`); the response's `sid` cookie is absent; `GET /api/me` with A's cookie is still A.
- `it('a second request to the same B cancels the first')`.
- `it('link with an expired session fails')`: start with `sid`, then delete the session row before the callback → `auth=failed`; no user changed.
- `it('Google intent=link attaches google_sub and email')`: a Zalo-only user links Google (mock the Google token as `auth.test.ts` does) → `google_sub` and `email` set.
- `it('unlink works when another identity stays')`: a user with both → `DELETE /api/me/identities/google` → 200, `providers: ['zalo']`, `email: null`.
- `it('unlink refuses the last identity')`: 409 `LAST_IDENTITY`.
- `it('unlink of a provider I do not have is 404')`.
- `it('unlink needs a session')`: 401.

- [ ] **Step 2: Run them and see them fail**

Run: `npm run test -w @fsl/api -- test/link-identity.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement as spec §4.5.2 and §4.5.3 (unlink row)**

Redirect flags are added with `withQuery` (Task 12). A merge request adds two parameters, `merge=requested` and `provider={provider}`, so the web notice can name the provider.

- [ ] **Step 4: Run them and see them pass**

Run the file and `npm run test -w @fsl/api`. Expected: PASS.

- [ ] **Step 5: Commit**

`git commit -m "feat(api): link, change and unlink Google or Zalo sign-in"`

### Task 14: Merge executor and merge-request endpoints

**Lane:** Claude (two-phase data migration logic across many tables; needs architect-level care).

**Files:**
- Create: `apps/api/src/auth/mergeUsers.ts`
- Modify: `apps/api/src/auth/accountRoutes.ts` (accept / decline / cancel)
- Test: `apps/api/test/merge-users.test.ts`

**Interfaces:**
- Consumes: `mergeParticipants(db, tripId, fromId, intoId, actor)` (`participants/merge.ts`, unchanged); `toMeUserView`.
- Produces:
  - `mergeUsers(db: Db, request: typeof accountMergeRequests.$inferSelect, deviceHash: string, deps: { mergeParticipants: typeof mergeParticipants } = { mergeParticipants }): Promise<void>` (the `deps` parameter exists only so the test can inject a failure)
  - `POST /api/me/merge-requests/:id/accept` → `{ user }`
  - `POST /api/me/merge-requests/:id/decline` → 204
  - `POST /api/me/merge-requests/:id/cancel` → 204

- [ ] **Step 1: Write the failing tests**

Fixture `seedMergeCase()`:
- A = `u-a`: Google `g-a`, email `a@x.com`, organiser of trip `t-1`, approved user-level bank.
- B = `u-b`: Zalo `z-b`, custom profile `'Bé Chi'`; member of `t-2` (organiser); a member of `t-1` too (participant `p-chi`, with `is_admin = 1`); a pending membership request in `t-3`; an approved user-level bank; two sessions (`sid-b1`, `sid-b2`).
- A pending request A→B with provider `zalo` and `provider_sub 'z-b'`.

Tests:
- `it('accept moves everything to A and deletes B')`, as B with `sid-b1`. Response 200, `user.id` is `'u-a'` and `providers` is `['google', 'zalo']`. Then:
  - `users` has no `u-b`, and `u-a` has `zalo_sub 'z-b'`
  - `t-2` has organiser `u-a`; its participant has `user_id u-a`
  - the membership request in `t-3` has `user_id u-a`
  - `sid-b1` and `sid-b2` both resolve to A via `GET /api/me`
  - B's approved bank row has status `'replaced'` and `user_id u-a`
  - the request is `accepted` with `decided_at` set
  - `trips.version` has increased for `t-1` and `t-2`
- `it('a group both were in ends with one name, admin kept')`: in `t-1`, `p-chi` becomes `merged` into A's participant; A's participant has `is_admin = 1`; an activity row `name_merged` exists for `t-1`.
- `it('profile carries over from a customised B to an uncustomised A')`: A `custom_profile = 0` → A's name becomes `'Bé Chi'` and `custom_profile = 1`. In the reverse case (A customised) A's name is kept.
- `it('a released identity is dropped')`: B also has Google `g-b` → after accept, no row has `google_sub 'g-b'`; signing in with `g-b` later creates a new user.
- `it('only B can accept, while pending and unexpired')`: A accepting → 404; expired → 404; already declined → 404.
- `it('stale when B no longer holds the identity')`: B unlinks Zalo first (B also has Google), then accept → 409 `MERGE_STALE`; the request becomes `cancelled`; nothing else changes.
- `it('decline and cancel')`: B declines → 204, status `declined`, A's `/api/me` outgoing shows `declined`. A cancels another pending → 204, status `cancelled`; a decline by A → 404.
- `it('a failed group merge still completes the account merge')`: call `mergeUsers(db, request, 'dev', { mergeParticipants: async () => { throw new Error('boom'); } })` directly → resolves; B deleted; `t-1` now has two active participants with `user_id u-a`.

- [ ] **Step 2: Run them and see them fail**

Run: `npm run test -w @fsl/api -- test/merge-users.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement as spec §4.5.5**

- Before phase 1, compute: shared groups (trips with active participants of both A and B, with B's participant id and admin flag); A's approved user-level bank; and the identity and profile result per §4.3.3.
- Phase 1 is one `db.batch`, in this order: delete B; update A; the repoint statements; bank statements; request statuses; version bump.
- Phase 2 loops over the shared groups. Build the `ResolvedActor` from A's participant and the trip row, and catch and `console.error` each failure.
- The accept handler validates per §4.5.3 before calling `mergeUsers`.

- [ ] **Step 4: Run them and see them pass, then the API suite**

Run the file and `npm run test -w @fsl/api`. Expected: PASS (the participants and admin suites unchanged).

- [ ] **Step 5: Commit**

`git commit -m "feat(api): merge two accounts after the second one confirms"`

### Task 15: `useMe`, `AuthNotice`, nullable email on the web

**Lane:** small build.

**Files:**
- Create: `apps/web/src/components/AuthNotice.tsx`
- Modify: `apps/web/src/api/hooks.ts` (`useMe`), `apps/web/src/App.tsx` (render `<AuthNotice />`), `components/AccountMenu.tsx`, `components/ConsentSheet.tsx`, `screens/Landing.tsx`, `screens/MyTrips.tsx`, `screens/CreateTrip.tsx` (use `useMe`), `components/ApprovalsCard.tsx` (null email), `components/InlineError.tsx` (two codes), `i18n/en.ts`, `vi.ts`
- Test: `apps/web/src/test/me-and-notices.test.tsx`

**Interfaces:**
- Produces:
  - `useMe(): UseQueryResult<MeResponse>` with `queryKey: ['me']`. A `select` normalises a partial body to `{ user: d.user ?? null, signIn: { zalo: d.signIn?.zalo === true }, mergeRequests: { incoming: d.mergeRequests?.incoming ?? [], outgoing: d.mergeRequests?.outgoing ?? [] } }`.
  - i18n keys: `auth.failed`, `auth.linked`, `auth.mergeRequested`, `account.zaloAccount`, `error.lastIdentity`, `error.mergeStale`.

- [ ] **Step 1: Write the failing tests**

Copy (en / vi with `// REVIEW`):
- `auth.failed`: `"Sign-in didn't finish — try again"` / `'Đăng nhập chưa xong — thử lại'`
- `auth.linked`: `'{provider} is now linked'` / `'Đã liên kết {provider}'`
- `auth.mergeRequested`: `'This {provider} account already has its own CoinCrew account. Sign in to that account to confirm the merge (expires in 7 days).'` / `'Tài khoản {provider} này đã có tài khoản CoinCrew riêng. Đăng nhập vào tài khoản đó để xác nhận gộp (hết hạn sau 7 ngày).'`
- `account.zaloAccount`: `'Zalo account'` / `'Tài khoản Zalo'`
- `error.lastIdentity`: `'Link another way to sign in first.'` / `'Liên kết thêm một cách đăng nhập trước.'`
- `error.mergeStale`: `'This merge request is no longer valid.'` / `'Yêu cầu gộp này không còn hiệu lực.'`

Tests:
- `it('useMe fills in what an older API leaves out')`: `GET /api/me` returns `{ user: null }` → `signIn.zalo === false` and `incoming` is `[]`.
- `it('AuthNotice shows the failure and clears the flag')`: render `<AuthNotice />` alone in a `MemoryRouter` at `/trips?auth=failed`, with a test-local probe showing `location.search` → the status shows `auth.failed`; the probe's text no longer contains `auth=`.
- `it('AuthNotice says what was linked and when a merge was requested')`: `?linked=zalo` → `'Zalo is now linked'`; `?merge=requested&provider=zalo` → the `auth.mergeRequested` text with `Zalo` (Task 13 sends both parameters).
- `it('the account menu shows the Zalo label without an email')`: `AccountMenu` with a user whose `email` is `null` → `'Zalo account'`.
- `it('a Zalo membership approval shows · Zalo')`: `ApprovalsCard` membership approval with `userEmail: null` → text `'Lan · Zalo'`.
- `it('maps the two new errors')`: `InlineError` with `ApiClientError('LAST_IDENTITY', …)` → `error.lastIdentity` text; same for `MERGE_STALE`.

- [ ] **Step 2: Run them and see them fail**

Run: `npm run test -w @fsl/web -- src/test/me-and-notices.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`AuthNotice` reads `useLocation().search`, shows one `Snackbar` for 4 s, and removes `auth`, `linked`, `merge` and `provider` with `navigate({ search }, { replace: true })`. Provider labels are `'Google'` and `'Zalo'` (brand names, same in both languages).

- [ ] **Step 4: Run them and see them pass, then the web suite**

Run the file, then `npm test` and `npm run typecheck`.
Expected: PASS. The existing `trips`, `account`, `profile-and-tabs` and `sportGroup` suites stay green with their partial `/api/me` bodies.

- [ ] **Step 5: Commit**

`git commit -m "feat(web): shared useMe, sign-in notices and Zalo-only accounts"`

### Task 16: Sign-in buttons on Landing, Guest and Who-are-you, plus Smart Name Match

**Lane:** screen (invoke `ui-ux-design-companion` first).

**Files:**
- Create: `apps/web/src/components/SignInButtons.tsx` (+ `.css`), `apps/web/src/components/SignInSheet.tsx`
- Modify: `components/icons.tsx` (`'zalo'`), `screens/Landing.tsx`, `screens/GuestTrip.tsx`, `screens/WhoAreYou.tsx`, `screens/Privacy.tsx`, `i18n/en.ts`, `vi.ts`
- Test: `apps/web/src/screens/__tests__/sign-in.test.tsx`

**Interfaces:**
- Consumes: `useMe` (Task 15), `isZaloWebView` (Task 1), `safeTripPath` (Task 8), `findSimilarNames` (`@fsl/core`), `Sheet`.
- Produces:
  - `SignInButtons({ returnTo, layout, intent, labels }: { returnTo: string; layout: 'stack' | 'inline'; intent?: 'signin' | 'link'; labels?: { google: MessageKey; zalo: MessageKey } })`. The default labels are `{ google: 'landing.signIn', zalo: 'signIn.zalo' }`. The hrefs are `/api/auth/{provider}/start?returnTo={encoded}`, plus `&intent=link` when linking.
  - `SignInSheet({ open, onClose, returnTo }: { open: boolean; onClose(): void; returnTo: string })`.
  - Icon name `'zalo'`.
  - i18n keys: `signIn.zalo`, `signIn.googleInZalo`, `guest.becomeMemberZalo`, `who.guestSignInZalo`, `who.nameMatch`, `who.signInTitle`. Also new text for the existing `who.hasAccount`.

- [ ] **Step 1: Write the failing tests**

Copy (en / vi with `// REVIEW`):
- `signIn.zalo`: `'Sign in with Zalo'` / `'Đăng nhập bằng Zalo'`
- `signIn.googleInZalo`: `'Used Google before? Tap ⋯ → Open in browser to sign in with Google, then link Zalo in the account menu.'` / `'Đã dùng Google trước đây? Nhấn ⋯ → Mở bằng trình duyệt để đăng nhập Google, rồi liên kết Zalo trong menu tài khoản.'`
- `guest.becomeMemberZalo`: `'Sign in with Zalo to become a member'` / `'Đăng nhập bằng Zalo để trở thành thành viên'`
- `who.guestSignInZalo`: `'Sign in with Zalo for full access'` / `'Đăng nhập bằng Zalo để dùng đầy đủ'`
- `who.nameMatch`: `'Is this you, {name}? Picked from your account name.'` / `'Có phải bạn là {name}? Đã chọn sẵn theo tên tài khoản của bạn.'`
- `who.signInTitle`: `'Sign in'` / `'Đăng nhập'`
- `who.hasAccount` becomes `'Has an account · tap to sign in'` / `'Đã có tài khoản · nhấn để đăng nhập'`

Zalo icon (`icons.tsx`): `zalo: <><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /><path d="M9 9h6l-6 6h6" /></>`.

Tests (`mockApi` with `GET /api/me` → `{ user: null, signIn: { zalo: true } }` unless stated):
- `it('Landing offers Google then Zalo in a normal browser')`: two links in order; hrefs `/api/auth/google/start?returnTo=%2Ftrips` and `/api/auth/zalo/start?returnTo=%2Ftrips`.
- `it('inside Zalo only Zalo is offered, with the Google hint')`: Zalo UA → one link `Sign in with Zalo`; no Google link; `signIn.googleInZalo` text present.
- `it('Zalo is hidden when not configured')`: `signIn.zalo: false` → only the Google link.
- `it('GuestTrip offers both ways to become a member')`: guest view → links `Sign in with Google to become a member` and `Sign in with Zalo to become a member`, both with `returnTo=%2Ft%2Ft-1%3FbecomeMember%3D1`, inside the footer.
- `it('Who are you hides the guest note when signed in')`: `/api/me` user `{ name: 'Lan' }` → no `note` named `Joining as a guest`.
- `it('a member row opens the sign-in sheet')`: click the `Minh` link → a dialog `Sign in` with both provider links, whose `returnTo` is `/t/t-1`; the location is unchanged.
- Smart Name Match. Use picker `myPick: null` and Chi's `lastUsedHere: false`; `/api/me` user name varies:
  - `'Nguyễn Văn Chi'` → radio `Chi` checked; text `'Is this you, Chi? Picked from your account name.'`
  - `'Chi'` with rows `Chi` and `Chi Mai` → `Chi` checked (one `same` match beats `part`)
  - `'Bình An'` → no radio checked (tie between `An` and `Bình`); no hint
  - `'Minh'` → nothing checked (member rows are ignored)
  - `myPick: PIDS.B` with name `'Nguyễn Văn Chi'` → `Bình` checked; no hint
  - signed out → no hint
- `it('the privacy notice mentions Zalo')`: the `Privacy` text contains `'Zalo user ID, display name and profile picture'`.

**Controller step (not the implementer):** in `apps/web/src/screens/__tests__/join.test.tsx` lines 137 and 140, replace `'Has an account · sign in with Google'` with `'Has an account · tap to sign in'`.

- [ ] **Step 2: Run them and see them fail**

Run: `npm run test -w @fsl/web -- src/screens/__tests__/sign-in.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement as spec §4.4.4**

- Labels per call site:
  - Landing: defaults.
  - GuestTrip: `{ google: 'guest.becomeMember', zalo: 'guest.becomeMemberZalo' }`.
  - WhoAreYou note: `{ google: 'who.guestSignIn', zalo: 'who.guestSignInZalo' }`.

  Existing label texts are unchanged, so `guest-trip.test.tsx`, `join.test.tsx:56` and `trips.test.tsx:19` stay green.
- Member rows stay `<a>` elements. The `href` is the provider start URL (Zalo inside Zalo when enabled, else Google), and `onClick` calls `preventDefault()` and opens `SignInSheet`.
- Name match runs inside the existing `useEffect` that sets `selectedId`, only when `initial` is null.
- `Privacy.tsx`: update the paragraph per spec §4.4.4.
- `stack` layout uses block `Button`s; `inline` layout uses ghost links like the current GuestTrip footer.

- [ ] **Step 4: Run them and see them pass, then the web suite**

Run the file, then (after the controller step) `npm test` and `npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit**

`git commit -m "feat(web): sign in with Zalo, Zalo-first inside the Zalo app, and name match on who-are-you"`

### Task 17: Sign-in methods in the account menu

**Lane:** screen (invoke `ui-ux-design-companion` first).

**Files:**
- Create: `apps/web/src/components/LinkedAccounts.tsx` (+ `.css`)
- Modify: `components/AccountMenu.tsx` (render the section), `i18n/en.ts`, `vi.ts`
- Test: `apps/web/src/components/__tests__/linked-accounts.test.tsx`

**Interfaces:**
- Consumes: `useMe` (Task 15), `SignInButtons`' URL rule (Task 16; build the hrefs the same way), `isZaloWebView`, `apiSend` (`DELETE /api/me/identities/:provider`, `POST /api/me/merge-requests/:id/cancel`), `Sheet`, `InlineError`.
- Produces: `LinkedAccounts({ me }: { me: MeResponse })`; i18n keys `account.methods`, `account.notLinked`, `account.linked`, `account.link`, `account.change`, `account.unlink`, `account.unlinkConfirm`, `account.unlinkLast`, `account.backupNudgeZalo`, `account.backupNudgeGoogle`, `merge.outgoingPending`, `merge.outgoingAccepted`, `merge.outgoingDeclined`, `merge.cancel`.

- [ ] **Step 1: Write the failing tests**

Copy (en / vi with `// REVIEW`):

| Key | en | vi |
|---|---|---|
| `account.methods` | `Sign-in methods` | `Cách đăng nhập` |
| `account.notLinked` | `Not linked` | `Chưa liên kết` |
| `account.linked` | `Linked` | `Đã liên kết` |
| `account.link` | `Link` | `Liên kết` |
| `account.change` | `Change` | `Đổi` |
| `account.unlink` | `Unlink` | `Gỡ` |
| `account.unlinkConfirm` | `Unlink {provider}? You will sign in with the other method.` | `Gỡ {provider}? Bạn sẽ đăng nhập bằng cách còn lại.` |
| `account.unlinkLast` | `Link another way to sign in first` | `Liên kết thêm một cách đăng nhập trước` |
| `account.backupNudgeZalo` | `Link Google too so you don't lose this account if your Zalo changes` | `Liên kết thêm Google để không mất tài khoản khi đổi số Zalo` |
| `account.backupNudgeGoogle` | `Link Zalo too so you can sign in from the Zalo app` | `Liên kết thêm Zalo để đăng nhập ngay trong Zalo` |
| `merge.outgoingPending` | `Waiting for the other account to confirm the merge` | `Đang chờ tài khoản kia xác nhận gộp` |
| `merge.outgoingAccepted` | `Accounts merged` | `Đã gộp tài khoản` |
| `merge.outgoingDeclined` | `The other account declined the merge` | `Tài khoản kia đã từ chối gộp` |
| `merge.cancel` | `Cancel` | `Huỷ` |

Tests:
- `it('shows both providers with their state')`: Google-only user `email: 'minh@example.com'` → the Google row shows the email with `Change` and `Unlink`; the Zalo row shows `Not linked` with a `Link` link to `/api/auth/zalo/start?returnTo=%2Ftrips&intent=link`.
- `it('the last method cannot be unlinked')`: `Unlink` disabled; `account.unlinkLast` text; `account.backupNudgeGoogle` text.
- `it('unlinks after confirming')`: a user with both → click `Unlink` on Zalo → confirm in the sheet → `DELETE /api/me/identities/zalo` called; `['me']` refetched.
- `it('shows a refused unlink')`: the API answers 409 `LAST_IDENTITY` → `error.lastIdentity` text.
- `it('inside Zalo, linking Google shows the browser hint')`: Zalo UA, Zalo-only user → no Google `Link` link; `signIn.googleInZalo` text.
- `it('shows the outgoing request and cancels it')`: `outgoing: [{ id: 'm-1', status: 'pending', … }]` → `merge.outgoingPending` text; `Cancel` → `POST /api/me/merge-requests/m-1/cancel`.
- `it('shows a decided request')`: `declined` → `merge.outgoingDeclined`; `accepted` → `merge.outgoingAccepted`.

- [ ] **Step 2: Run them and see them fail**

Run: `npm run test -w @fsl/web -- src/components/__tests__/linked-accounts.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement as spec §4.5.1**

`returnTo` is the current `pathname`. Rows are ≥ 44 px.

- [ ] **Step 4: Run them and see them pass**

Run the file, `npm test` and `npm run typecheck`. Expected: PASS (`account.test.tsx` unchanged).

- [ ] **Step 5: Commit**

`git commit -m "feat(web): manage Google and Zalo sign-in from the account menu"`

### Task 18: Confirming an incoming merge

**Lane:** screen (invoke `ui-ux-design-companion` first).

**Files:**
- Create: `apps/web/src/components/MergeRequestBanner.tsx` (+ `.css`), `apps/web/src/components/MergeConfirmSheet.tsx`
- Modify: `screens/MyTrips.tsx` (banner at the top), `components/AccountMenu.tsx` (+ `.css`: banner inside; dot on the trigger), `i18n/en.ts`, `vi.ts`
- Test: `apps/web/src/components/__tests__/merge-request.test.tsx`

**Interfaces:**
- Consumes: `useMe` (Task 15); `apiSend` for `POST /api/me/merge-requests/:id/accept|decline`; `useQueryClient().clear()`.
- Produces:
  - `MergeRequestBanner({ request }: { request: IncomingMergeRequest })` and `MergeConfirmSheet({ request, open, onClose })`
  - i18n keys `merge.incoming`, `merge.review`, `merge.decline`, `merge.confirmTitle`, `merge.moves`, `merge.released`, `merge.confirm`, `merge.dot`

- [ ] **Step 1: Write the failing tests**

Copy (en / vi with `// REVIEW`):

| Key | en | vi |
|---|---|---|
| `merge.incoming` | `{name} ({who}) wants to merge this account into theirs` | `{name} ({who}) muốn gộp tài khoản này vào tài khoản của họ` |
| `merge.review` | `Review & merge` | `Xem & gộp` |
| `merge.decline` | `Decline` | `Từ chối` |
| `merge.confirmTitle` | `Merge accounts?` | `Gộp tài khoản?` |
| `merge.moves` | `Your {groups} groups, bank details and history move to {name}'s account.` | `{groups} nhóm, tài khoản ngân hàng và lịch sử của bạn sẽ chuyển sang tài khoản của {name}.` |
| `merge.released` | `{provider} {email} will no longer sign in here` | `{provider} {email} sẽ không còn đăng nhập vào đây` |
| `merge.confirm` | `Merge accounts` | `Gộp tài khoản` |
| `merge.dot` | `A merge request is waiting` | `Có yêu cầu gộp tài khoản` |

`{who}` is the survivor's email, or `'Zalo'` when it is null.

Fixture `incoming = { id: 'm-1', provider: 'zalo', expiresAt: '2026-10-27T00:00:00Z', survivor: { name: 'Minh', avatarUrl: null, email: 'minh@example.com', providers: ['google'] }, groups: { survivor: 2, merged: 1 }, released: [{ provider: 'google', email: 'b@x.com' }] }`.

Tests:
- `it('My Trips shows the banner')`: `/api/me` with `incoming: [incoming]` → text `'Minh (minh@example.com) wants to merge this account into theirs'`, with buttons `Review & merge` and `Decline`.
- `it('the confirm sheet says what moves and what is released')`: click `Review & merge` → dialog `Merge accounts?` containing `'Your 1 groups, bank details and history move to Minh's account.'` and `'Google b@x.com will no longer sign in here'`; the `Merge accounts` button uses `variant="danger"`.
- `it('accepting clears the cache and refetches me')`: `POST /api/me/merge-requests/m-1/accept` → `{ user: { id: 'u-minh', … } }`; afterwards `GET /api/me` is fetched again and the banner is gone.
- `it('declining removes the banner')`: `POST …/decline` (204) → `['me']` refetched; the banner is gone once `/api/me` returns no incoming.
- `it('shows MERGE_STALE')`: accept answers 409 `MERGE_STALE` → `error.mergeStale` text.
- `it('the account button shows a dot while a request waits')`: `AccountMenu` trigger contains an element with `aria-label` `'A merge request is waiting'`; none when `incoming` is `[]`.

- [ ] **Step 2: Run them and see them fail**

Run: `npm run test -w @fsl/web -- src/components/__tests__/merge-request.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement as spec §4.5.4**

Show only the first incoming request (normally there is one).

- [ ] **Step 4: Run them and see them pass, then the final gate**

Run the file, then `npm run typecheck`, then `npm test`. Expected: everything PASSES.

- [ ] **Step 5: Commit**

`git commit -m "feat(web): confirm or decline an account merge"`

---

## After the last task

- Run `npm run e2e` once (Playwright, existing suite). Expected: PASS. It uses `POST /api/test/login` (Google default) and the existing flows.
- Hand the spec's §7 manual device checklist to the user. Device behaviour (long-press saving, Zalo app hand-off, bank links, real Zalo cards) cannot be checked in CI.
