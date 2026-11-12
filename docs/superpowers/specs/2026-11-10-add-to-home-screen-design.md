# Add to Home Screen (PWA install) — design

Issue: #92 (epic #82). Follow-up: #97 (push notifications, separate brainstorm).
Status: approved in brainstorm on 2026-11-10; this document is the build reference.

## Intent

Group admins open CoinCrew many times a day, and today they get there by finding a link in a Zalo chat. Saving the app to the home screen turns that into one tap: it opens full screen, without the browser bar, straight onto **Khoản chi nhanh** (Home, `/trips`). Members who check a loan or a shared expense now and then benefit as well, but the admin is the person we're designing for. Installing is also the step that makes web push possible on iPhone later (#97). That work is **not** part of this issue.

## Goals

- Signed-in people on a phone browser can discover the install, and do it in as few taps as their browser allows.
- Android Chrome (and other browsers that fire `beforeinstallprompt`): 1-tap install from our sheet.
- iPhone Safari / iPhone Chrome / Android browsers with no 1-tap: short step-by-step guidance using inline icons.
- In-app browsers (Zalo's webview, Facebook, etc.): explain that installing doesn't work there, and how to open the page in a real browser.
- The installed app opens on Home (`/trips`) in standalone mode.
- The install passes Chrome's installability check and Lighthouse's manifest audit.

## Non-goals

- Push notifications, notification permission prompts, any server change (#97).
- Restoring "the last group". Home is the landing page. **The issue's "restore last active group" criterion is dropped by owner decision.**
- Offline use. The service worker stays as it is (no API caching).
- Anything in the Zalo Mini App (`apps/zalo`).
- Guests (people without an account) and view-only link visitors. They never see the pill or the menu row. On iPhone the installed app can't see Safari's storage, so a guest would land on the welcome page with nothing to show.
- Making iPhone sign-in carry over into the installed app. iOS gives home-screen apps their own storage, so people sign in once more there. The owner accepted this as a platform limit; the sheet warns about it.

## Anti-goals (would make this a failure even if it technically works)

- Nagging: a prompt that comes back after ✕, or that shows on someone's very first visit.
- Clutter: a floating banner stacked on the floating nav pill, the "+" button and the snackbar.
- The prompt being louder than the page's real content, the balance in particular.
- Instructions that point at the wrong place in the browser's UI (no screenshots, no arrows aimed at a bar position).

## Constraints

- Follow `DESIGN.md` ("The Friendly Ledger") and the CLAUDE.md library rules. Use the `Sheet` wrapper (not raw Drawer/Dialog), `Button`, `Icon` (lucide), `Snackbar`. Theme tokens only; no raw hex in components; one primary button per view.
- Platform detection lives in `@cc/web-platform` (`libs/web/platform`), with `isZaloWebView` from `@cc/web-util/zaloEnv`. Screens/components live in `@cc/web-screens`. Copy goes in `@cc/web-i18n`, in `vi.ts` and `en.ts`; new Vietnamese lines get the `// REVIEW` marker like other draft copy.
- Tests select by `fsl-*` classes and `data-testid`.
- Free hosting; no new API calls for this feature.

## What gets built

### 1. Manifest, icons and HTML tags (`apps/web`)

The manifest is already produced by `vite-plugin-pwa` in `apps/web/vite.config.ts`. Keep it there; **don't** add a hand-written `public/manifest.webmanifest`. Changes:

- `start_url: '/trips'`, plus `scope: '/'` and `id: '/'`. (Builder's call: `/` also works, because `Landing` already sends signed-in users to `/trips`. `/trips` saves a redirect.) Signed out is safe too: when `/api/me` returns no user, Home already redirects to `/` (`Home.tsx`, the `user === null` effect), so an iPhone user whose sign-in didn't carry over lands on the welcome page with sign-in buttons.
- The service worker is unchanged (no offline, no API caching; owner's non-goal). Chrome no longer needs a fetch handler to offer install. Treat "installable in DevTools" as a verification step, not a service-worker change.
- Keep `name`, `short_name`, `display: 'standalone'`, and `theme_color: '#0f766e'` / `background_color: '#f6f7f4'` (Rice Paper, per DESIGN.md: the launch colours stay Jade. The issue's `#faf9f5` is wrong).
- Icons: generate PNGs from `apps/web/public/icon.svg`. Sizes: 192 and 512 (`purpose: 'any'`), a 512 maskable (`purpose: 'maskable'`, artwork inside the 80% safe zone on a Jade or Rice Paper fill), and `apple-touch-icon.png` at 180×180 (no transparency). Keep the SVG entry. Commit the PNGs under `apps/web/public/icons/` (apple-touch-icon at `/apple-touch-icon.png`), and add them to `includeAssets`. A small script under `scripts/` that regenerates them is welcome but optional.
- `index.html`: add `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`, `<meta name="apple-mobile-web-app-capable" content="yes">`, `<meta name="mobile-web-app-capable" content="yes">`, `<meta name="apple-mobile-web-app-title" content="CoinCrew">`, `<meta name="apple-mobile-web-app-status-bar-style" content="default">`. The existing `theme-color` meta stays (`applyTheme` keeps updating it).

### 2. Install state (`@cc/web-platform`)

A small module (for example `libs/web/platform/src/install.ts`), exported from the package:

- `isStandalone()`: `matchMedia('(display-mode: standalone)').matches` or `navigator.standalone === true`.
- `installContext()`: returns one of
  - `'standalone'`: already installed and running from the home screen
  - `'in-app'`: Zalo webview (`isZaloWebView`), or another known in-app browser (FBAN/FBAV/Instagram/Line). The builder may extend the list.
  - `'android-prompt'`: a `beforeinstallprompt` event has been captured
  - `'android-manual'`: Android, no captured event
  - `'ios-safari'`: iOS, not Chrome/other (use `isIosDevice`)
  - `'ios-chrome'`: iOS, UA contains `CriOS`
  - `'ios-other'`: iOS, UA contains `FxiOS` / `EdgiOS` / another non-Safari browser. One generic line: "Mở menu của trình duyệt, chọn **Chia sẻ** → **Thêm vào MH chính**", plus the sign-in note. iPad counts as iOS: `isIosDevice` already treats a Mac UA with touch points as iOS, so iPad Safari gets the `ios-safari` steps.
  - `'desktop'`: everything else
- `beforeinstallprompt` capture: call `preventDefault()` and keep the event in a module-level store. The listener must be attached at app start, before React mounts or in the shell, because the event can fire early. Expose a hook `useInstallPrompt()` → `{ context, canPrompt, prompt(): Promise<'accepted'|'dismissed'|'unavailable'> }`. Listen for `appinstalled`, and also treat an accepted `prompt()` as installed: write `localStorage` `cc.install.installed = '1'`, so the pill and the row stay hidden in that browser after a reload, not just for the rest of the session.
- All of this is web-only. When `platform.kind === 'zmp'`, nothing in this feature renders.

### 3. When the pill and the menu row show

Both need **all** of:

- `platform.kind === 'web'`
- a signed-in user: `useMe().data.user` is non-null. That's only true for real Google/Zalo accounts; guests and view-only visitors are device participants with `user: null`, so they're excluded by this check alone.
- `installContext() !== 'standalone'` and `cc.install.installed` not set

The **pill** also needs:

- the device is a phone or tablet (not desktop)
- not dismissed: `localStorage` key `cc.install.dismissed` (read and write through try/catch, like `browserStorage`)
- not the first visit: keep a visit counter in `localStorage` (`cc.install.visits`). Count only app loads (not route changes) where the user is signed in, and show from the second signed-in load on. That way the load right after signing up never shows it.

The **menu row** shows on desktop too. Desktop Chrome/Edge can install: it uses the 1-tap prompt when one was captured, otherwise one line, "Nhấn biểu tượng cài đặt trên thanh địa chỉ".

### 4. The pill (`InstallPill`, `@cc/web-screens`)

- Placement: the first thing in the content of **Home** (`/trips`) and the **Groups list** (`/groups`). It is **not** on group pages (owner: keep it small; the balance stays loudest).
- Screen states: render it only after `useMe` has loaded (no flash during loading). It shows above whatever the screen shows, including the empty state ("No open debts" / no groups yet), because it's one small row and doesn't replace that state's call to action. It's hidden on a full-screen error.
- Look (owner picked mockup B, "Jade Mist pill"): one row, `min-h-11`, `rounded-full`, `bg-secondary text-secondary-foreground`. A leading lucide icon (for example `smartphone` / `download`, builder's choice), the label "Thêm CoinCrew vào màn hình chính" in `text-sm font-semibold` with a trailing chevron, and a 44px ✕ icon button on the right. Flat: no shadow, no border.
- The whole row (except ✕) opens the install sheet. ✕ sets `cc.install.dismissed` and hides the pill right away. It never comes back on this device, but the menu row stays.
- Classes: `fsl-install-pill`, `fsl-install-pill__close`; `data-testid="install-pill"`.

### 5. Account menu row (`AccountMenu.tsx`)

- A new row after Notifications, in the same style as the Bank, Theme and Notifications rows: icon, label "Thêm vào màn hình chính", chevron. It opens the same sheet.
- Class: `fsl-account-menu__install`; `data-testid="account-install"`.

### 6. The install sheet (`InstallAppSheet`, `@cc/web-screens`)

One `Sheet`, whose content depends on `installContext()`. Steps are a white `rounded-xl` grouped list, each row with a numbered Jade Mist circle and text with **inline icons**. No screenshots, and no arrows pointing at a browser bar. The title is the same everywhere except in-app: "Thêm CoinCrew vào màn hình chính".

| Context | Body | Buttons |
|---|---|---|
| `android-prompt` | One line: "Mở bằng một chạm, toàn màn hình, không có thanh trình duyệt." | **Primary** "Cài đặt ngay" → `prompt()`; ghost "Để sau". Accepted → close sheet, snackbar "Đã thêm vào màn hình chính", hide the pill. Dismissed → stay on the sheet, and the button falls back to the manual steps (the event can't be reused). |
| `android-manual` | 1. Nhấn ⋮ ở góc trên trình duyệt · 2. Chọn **Thêm vào màn hình chính** hoặc **Cài đặt ứng dụng** | secondary "Đã hiểu" |
| `ios-safari` | 1. Nhấn ⋯ trên thanh Safari · 2. Chọn (share icon) **Chia sẻ** · 3. Kéo xuống, chọn (plus-square icon) **Thêm vào MH chính** · Jade Mist note: "Lần đầu mở từ màn hình chính, bạn cần đăng nhập lại một lần." | secondary "Đã hiểu" |
| `ios-chrome` | 1. Nhấn (share icon) trên thanh địa chỉ · 2. Chọn (plus-square) **Thêm vào MH chính** · same sign-in note | secondary "Đã hiểu" |
| `in-app` | Title "Mở bằng trình duyệt để cài"; line "Không thể cài CoinCrew từ trong Zalo." (or a generic "trong ứng dụng này" for non-Zalo); 1. Nhấn ⋯ ở góc trên · 2. Chọn **Mở bằng trình duyệt**, rồi nhấn lại **Thêm vào màn hình chính** | secondary "Sao chép liên kết" (copies the current URL; snackbar "Đã sao chép"); ghost "Để sau" |
| `desktop` | the `android-prompt` body if a prompt is available, otherwise "Nhấn biểu tượng cài đặt trên thanh địa chỉ" | as above / "Đã hiểu" |

- iOS version: the 3-step Safari list is for iOS 26 (Share moved behind ⋯). For iOS < 26 (parse the `OS xx_` version from the UA), drop step 1 and say "Nhấn (share icon) **Chia sẻ** ở thanh dưới". The menu labels ship as draft strings marked `// REVIEW`. The builder doesn't block on them: the owner checks them on real phones during the usual manual test over the tunnel, and fixes go in before the PR merges.
- Sheet classes: `fsl-install-sheet`, with a modifier per context (`fsl-install-sheet--ios-safari`, …); `data-testid="install-sheet"`.
- The sheet stays usable on a desktop dialog (from 640px), as `Sheet` already handles.

### 7. Copy

Every string above gets a key in `vi.ts` (marked `// REVIEW`) and `en.ts`, under an `install.*` namespace. English is a plain translation ("Add CoinCrew to your home screen", "Install now", "Got it", "Not now", "Open in your browser to install", "Copy link", "You'll need to sign in once the first time you open it from your home screen.").

## Tests (builder adds new ones; existing tests are not edited)

- `installContext()` for each UA/state, including Zalo UA, CriOS, iOS 18 vs iOS 26, and a stubbed `matchMedia` standalone.
- Pill visibility: hidden for guests, in standalone, on the first visit, after ✕ (and stays hidden on reload), after `appinstalled`, and in `zmp`.
- Sheet renders the right variant per context. On `android-prompt`, "Cài đặt ngay" calls `prompt()`; the accepted path shows the snackbar and hides the pill.
- The menu row is present for a signed-in web user and absent in standalone.
- An e2e or build check that the built manifest has the 192/512/maskable PNGs and `start_url: '/trips'`.

## Acceptance criteria (replaces the issue's list)

- [ ] Built manifest + `apple-touch-icon` + iOS meta tags. Chrome DevTools → Application shows the app as installable, with no manifest warnings.
- [ ] Android Chrome: the pill or menu row → sheet → "Cài đặt ngay" installs in one tap.
- [ ] iPhone Safari (iOS 26 and one older version) and iPhone Chrome: the sheet shows the matching steps and the sign-in note, verified on a real device.
- [ ] Zalo's in-app browser: the sheet explains "⋯ → Mở bằng trình duyệt" and can copy the link.
- [ ] Opened from the home screen: standalone, lands on Khoản chi nhanh, no pill, no menu row.
- [ ] ✕ hides the pill on that device for good; the pill never shows on the first visit or to guests.
- [ ] All copy is in `vi.ts` and `en.ts`.

## Decisions made by the owner

- Scope: install only. Notifications go to #97.
- Audience: admins first. The pill and the row show to **every signed-in user**, never to guests.
- Landing: Khoản chi nhanh, not "the last group".
- iPhone re-sign-in: accepted as a platform limit, with a warning in the sheet.
- Prompt: a small inline pill (mockup B, Jade Mist), not the floating bottom banner.
- Sheet: the five variants as mocked up ("Looks nice").

## Calls made by the planner (owner can overrule)

- The pill shows on Home and the Groups list only, not on group pages.
- Not on the first visit (visit counter in `localStorage`).
- The menu row also shows on desktop browsers.
- `start_url: '/trips'`; `background_color` stays Rice Paper `#f6f7f4`.
- A "Sao chép liên kết" fallback in the in-app sheet.
- iOS 26 vs older step lists, chosen by the UA version.
- Firefox/Edge on iPhone get one generic line (`ios-other`); iPad follows the iPhone Safari steps.
- The visit counter counts only signed-in loads.
- A successful install is remembered in `localStorage` (`cc.install.installed`), so the pill doesn't come back in that browser.
- The pill shows above empty states, waits for sign-in data to load, and hides on full-screen errors.
- Menu labels ship as `// REVIEW` drafts; the owner checks them on real devices during the tunnel test.
