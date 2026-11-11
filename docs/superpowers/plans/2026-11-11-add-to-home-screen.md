# Add to Home Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let signed-in people install CoinCrew to their phone's home screen: a 1-tap install where the browser allows it, short guidance where it doesn't, and launching on Khoản chi nhanh in standalone mode.

**Architecture:** Install detection and the `beforeinstallprompt` store are a framework-free module plus one hook in `@cc/web-platform`. The UI is three pieces in `@cc/web-screens`: a visibility hook, the adaptive `InstallAppSheet`, and the small `InstallPill`. They're wired into Home, Groups and the account menu. Manifest and icons stay in `vite-plugin-pwa` (`apps/web/vite.config.ts`), with PNGs rendered once by a Playwright script and committed.

**Tech Stack:** React 19, TypeScript 7 (`tsc`), Vitest + Testing Library (jsdom), Playwright (e2e and icon rendering), vite-plugin-pwa, lucide-react, Nx on npm workspaces.

**Spec:** `docs/superpowers/specs/2026-11-10-add-to-home-screen-design.md`. Read it first; this plan only adds the names and tests.

## Global Constraints

- Library rules (CLAUDE.md): screens/components → `@cc/web-screens`; detection → `@cc/web-platform`; icons → `@cc/web-ui`; copy → `@cc/web-i18n`. Relative imports inside a library, package names across. No `@/`.
- Theme tokens only, no raw hex in components, no per-component `.css` (`style-guard.test.ts`). Touch targets `min-h-11`. One primary button per view.
- Use the `Sheet`, `Button`, `Icon`, `Snackbar` wrappers from `@cc/web-ui/components/*`; never raw Drawer/Dialog.
- Nothing renders when `platform.kind === 'zmp'`. Check this first.
- `localStorage` keys exactly: `cc.install.dismissed`, `cc.install.installed`, `cc.install.visits`. Every read and write goes in try/catch.
- Manifest: `start_url: '/trips'`, `scope: '/'`, `id: '/'`, `theme_color: '#0f766e'`, `background_color: '#f6f7f4'`, `display: 'standalone'`.
- Every new string goes in `en.ts` and `vi.ts` (the `vi.ts` lines end with `// REVIEW`), under `install.*`.
- Tests: add new test files only, never edit existing ones. Select by `fsl-*` / `data-testid`. Run `npm test`, `npm run typecheck` and `npm run lint` through Nx.
- The service worker is not changed beyond what the manifest needs.

## Review Focus

1. **`localStorage` throws** (Safari private mode, blocked storage): the pill and the menu row must still render or hide without crashing. Test in Task 2 (store) and Task 4 (pill).
2. **`beforeinstallprompt` fires before React mounts:** it must still be captured. Capture starts in `bootApp`, before the first await. Test in Task 2.
3. **Zalo Mini App user agent also contains "Zalo":** with `platform.kind === 'zmp'` nothing shows, even though the context would say `in-app`. Test in Task 4.
4. **StrictMode / remounts count a visit twice:** the visit counter increments at most once per page load. Test in Task 4.
5. **Prompt dismissed, or `prompt()` called again:** no throw. The sheet falls back to the manual Android steps. Test in Task 3.

---

### Task 1: Manifest, icons and iOS tags

**Files:**
- Create: `scripts/render-app-icons.mjs`, `apps/web/public/icons/icon-192.png`, `apps/web/public/icons/icon-512.png`, `apps/web/public/icons/icon-maskable-512.png`, `apps/web/public/apple-touch-icon.png`
- Modify: `apps/web/vite.config.ts` (the `VitePWA({...})` block), `apps/web/index.html` (`<head>`)
- Test: `e2e/pwa-manifest.spec.ts`

**Interfaces:**
- Produces: `/manifest.webmanifest` with the icons below; `/apple-touch-icon.png`.

- [ ] **Step 1: Write the failing e2e test** `e2e/pwa-manifest.spec.ts`

```ts
test('manifest makes the app installable and starts on Home', async ({ request }) => {
  const m = await (await request.get('/manifest.webmanifest')).json();
  expect(m).toMatchObject({ start_url: '/trips', scope: '/', id: '/', display: 'standalone', theme_color: '#0f766e', background_color: '#f6f7f4' });
  const sizes = m.icons.map((i: { sizes: string; purpose?: string }) => `${i.sizes}:${i.purpose ?? 'any'}`);
  expect(sizes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']));
  for (const path of ['/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png', '/apple-touch-icon.png']) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
    expect(res.headers()['content-type']).toContain('image/png');
  }
});
test('index.html carries the iOS home-screen tags', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/apple-touch-icon.png');
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'CoinCrew');
});
```

- [ ] **Step 2: Run it and check that it fails:** `npm run e2e -- e2e/pwa-manifest.spec.ts` (this builds first). Expected: FAIL on `start_url` and the missing PNGs.

- [ ] **Step 3: Write `scripts/render-app-icons.mjs`.** Follow the pattern in `scripts/render-og-images.mjs` (Playwright `chromium`, screenshot). Render `apps/web/public/icon.svg` at 192 and 512 → `icons/icon-192.png` and `icons/icon-512.png`, and at 180 → `apple-touch-icon.png`. Use an opaque background (Jade `#0f766e` behind the rounded rect, so iOS shows no black corners). For `icon-maskable-512.png`, use a full-bleed Jade square with the SVG scaled to 80% and centred (the safe zone). Add a top comment, the same as the OG script: "committed PNGs are the source of truth". Run it with `node scripts/render-app-icons.mjs` and commit the PNGs.

- [ ] **Step 4: Update `VitePWA` in `apps/web/vite.config.ts`.** Add `start_url: '/trips'`, `scope: '/'` and `id: '/'`. Keep `background_color: '#f6f7f4'`. Set `icons` to: the existing SVG entry, `{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }`, the same at 512, and `{ src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }`. Add `'icons/*.png'` and `'apple-touch-icon.png'` to `includeAssets`.

- [ ] **Step 5: Add to the `<head>` of `apps/web/index.html`,** after the existing icon link: `<link rel="apple-touch-icon" href="/apple-touch-icon.png" />`, `<meta name="apple-mobile-web-app-capable" content="yes" />`, `<meta name="mobile-web-app-capable" content="yes" />`, `<meta name="apple-mobile-web-app-title" content="CoinCrew" />`, `<meta name="apple-mobile-web-app-status-bar-style" content="default" />`.

- [ ] **Step 6: Run** `npm run e2e -- e2e/pwa-manifest.spec.ts`. Expected: PASS.

- [ ] **Step 7: Commit:** `feat(pwa): add PNG icons, iOS tags and start on Home (#92)`

---

### Task 2: Install detection and the prompt store (`@cc/web-platform`)

**Files:**
- Create: `libs/web/platform/src/install.ts`, `libs/web/platform/vitest.config.ts` (copy `libs/web/util/vitest.config.ts`, without `setupFiles`), `libs/web/platform/src/__tests__/install.test.ts`
- Modify: `libs/web/platform/package.json` (`"test": "vitest run"` script; `"./install": "./src/install.ts"` export; dependency `"@cc/web-util": "*"`), `libs/web/screens/src/AppRoot.tsx` (`bootApp`)

**Interfaces:**
- Consumes: `isIosDevice(nav)` from `./browser`; `isZaloWebView(ua)` from `@cc/web-util/zaloEnv`.
- Produces (all exported from `@cc/web-platform/install`):

```ts
export type InstallContext =
  | 'standalone' | 'in-app' | 'prompt'          // 'prompt' = a captured beforeinstallprompt (spec's android-prompt, or desktop with prompt)
  | 'android-manual' | 'ios-safari' | 'ios-chrome' | 'ios-other' | 'desktop';
export interface InstallEnv { ua: string; maxTouchPoints: number; standalone: boolean; hasPrompt: boolean }
export function currentInstallEnv(): InstallEnv;               // reads navigator, matchMedia('(display-mode: standalone)'), navigator.standalone, the store
export function detectInstallContext(env: InstallEnv): InstallContext;
export function isMobileEnv(env: InstallEnv): boolean;         // Android or iOS (incl. iPad)
export function iosMajorVersion(ua: string): number | null;    // from "OS 18_2" / "Version/26.0"; null if not iOS
export function isInAppBrowser(ua: string): boolean;           // isZaloWebView || /FBAN|FBAV|Instagram|Line\//
export function startInstallCapture(win?: Window): void;       // idempotent; preventDefault + store the event; on 'appinstalled' → installStore.markInstalled()
export function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'>; // clears the stored event after use; 'accepted' → markInstalled()
export function subscribeInstall(listener: () => void): () => void; // notified when the stored event or installed flag changes
export function useInstallPrompt(): { context: InstallContext; mobile: boolean; installed: boolean; prompt: () => Promise<'accepted' | 'dismissed' | 'unavailable'> };
export const installStore: {
  isDismissed(): boolean; dismiss(): void;
  isInstalled(): boolean; markInstalled(): void;
  visits(): number; countVisit(): number; // countVisit increments and returns the new count
};
```

The order in `detectInstallContext` is fixed: standalone → in-app → prompt → Android (`/Android/`) → iOS (`isIosDevice` on `{ userAgent: ua, maxTouchPoints }`): `CriOS` → `ios-chrome`, `FxiOS|EdgiOS|OPiOS` → `ios-other`, else `ios-safari` → desktop.

- [ ] **Step 1: Write the failing tests** in `install.test.ts`, with UA constants for each case:
  - `detectInstallContext` table: standalone wins over everything (`{standalone:true, ua: ZALO_UA}` → `'standalone'`); Zalo UA and a Facebook `FBAN` UA → `'in-app'` even with `hasPrompt:true`; Android Chrome with/without a prompt → `'prompt'` / `'android-manual'`; iPhone Safari → `'ios-safari'`; iPhone `CriOS` → `'ios-chrome'`; iPhone `FxiOS` → `'ios-other'`; iPad desktop-mode UA (`Macintosh`, `maxTouchPoints: 5`) → `'ios-safari'`; Windows Chrome → `'desktop'`; Windows Chrome with a prompt → `'prompt'`.
  - `isMobileEnv`: true for the Android and iPad UAs, false for Windows Chrome.
  - `iosMajorVersion`: `'… iPhone OS 18_2 like Mac OS X …'` → `18`; an iOS 26 UA → `26`; the Android UA → `null`.
  - `startInstallCapture`: dispatch a fake `beforeinstallprompt` event (an `Event` with `prompt` and `userChoice: Promise.resolve({ outcome: 'accepted' })`) on `window` **after** calling it. Expect `defaultPrevented === true` and `currentInstallEnv().hasPrompt === true`. Calling `startInstallCapture` twice still stores one event.
  - `promptInstall`: accepted → `'accepted'`, `installStore.isInstalled() === true`, `hasPrompt` false afterwards; a second call → `'unavailable'`; a dismissed outcome → `'dismissed'` and not installed.
  - `appinstalled` event → `installStore.isInstalled() === true`.
  - `installStore` when `localStorage.getItem`/`setItem` throw (`vi.spyOn(Storage.prototype, …).mockImplementation(() => { throw new Error() })`): `isDismissed()` false, `visits()` 0, `dismiss()`/`countVisit()` don't throw.

- [ ] **Step 2: Run** `npx nx run @cc/web-platform:test`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement `libs/web/platform/src/install.ts`** to the interfaces above. `useInstallPrompt` uses `useSyncExternalStore(subscribeInstall, …)`, so a captured prompt or an install re-renders consumers. Keep the snapshot a primitive or a cached object, so it doesn't loop.

- [ ] **Step 4: In `bootApp`** (`libs/web/screens/src/AppRoot.tsx`), call `startInstallCapture()` right after `applyTheme(...)` and before the first `await`, only when `platform.kind === 'web'`.

- [ ] **Step 5: Run** `npx nx run @cc/web-platform:test` and `npm run typecheck`. Expected: PASS.

- [ ] **Step 6: Commit:** `feat(platform): detect install context and keep the install prompt (#92)`

---

### Task 3: Install sheet, icons and copy

**Files:**
- Create: `libs/web/screens/src/components/InstallAppSheet.tsx`, `libs/web/screens/src/components/__tests__/install-app-sheet.test.tsx`
- Modify: `libs/web/ui/src/components/icons.tsx` (add `smartphone: Smartphone`, `ellipsis: Ellipsis`, `ellipsisVertical: EllipsisVertical`, `squarePlus: SquarePlus`, `shareIos: Share`), `libs/web/i18n/src/en.ts`, `libs/web/i18n/src/vi.ts`

**Interfaces:**
- Consumes: `useInstallPrompt`, `iosMajorVersion`, `InstallContext` (Task 2).
- Produces: `export function InstallAppSheet(props: { open: boolean; onClose: () => void; onInstalled?: () => void }): JSX.Element`. The component stays mounted when `open` is false, so its snackbar can outlive the sheet.

**Copy:** these keys and strings go in `en.ts` / `vi.ts`. Every `vi` line gets `// REVIEW`. `{icon}` positions are rendered as inline `<Icon>`s by the component, not by the string.

| key | en | vi |
|---|---|---|
| `install.title` | Add CoinCrew to your home screen | Thêm CoinCrew vào màn hình chính |
| `install.pill` | Add CoinCrew to your home screen | Thêm CoinCrew vào màn hình chính |
| `install.menuRow` | Add to home screen | Thêm vào màn hình chính |
| `install.promptBody` | Opens in one tap, full screen, no browser bar. | Mở bằng một chạm, toàn màn hình, không có thanh trình duyệt. |
| `install.installNow` | Install now | Cài đặt ngay |
| `install.notNow` | Not now | Để sau |
| `install.gotIt` | Got it | Đã hiểu |
| `install.installed` | Added to your home screen | Đã thêm vào màn hình chính |
| `install.androidStep1` | Tap ⋮ at the top of the browser | Nhấn ⋮ ở góc trên trình duyệt |
| `install.androidStep2` | Choose "Add to Home screen" or "Install app" | Chọn "Thêm vào màn hình chính" hoặc "Cài đặt ứng dụng" |
| `install.iosStepMore` | Tap ⋯ in the Safari bar | Nhấn ⋯ trên thanh Safari |
| `install.iosStepShare` | Choose Share | Chọn Chia sẻ |
| `install.iosStepShareOld` | Tap Share in the bottom bar | Nhấn Chia sẻ ở thanh dưới |
| `install.iosStepAdd` | Scroll down and choose "Add to Home Screen" | Kéo xuống, chọn "Thêm vào MH chính" |
| `install.iosChromeStep1` | Tap Share in the address bar | Nhấn Chia sẻ trên thanh địa chỉ |
| `install.iosChromeStep2` | Choose "Add to Home Screen" | Chọn "Thêm vào MH chính" |
| `install.iosOtherStep` | Open the browser menu, choose Share → "Add to Home Screen" | Mở menu của trình duyệt, chọn Chia sẻ → "Thêm vào MH chính" |
| `install.iosSignInNote` | You'll need to sign in once the first time you open it from your home screen. | Lần đầu mở từ màn hình chính, bạn cần đăng nhập lại một lần. |
| `install.inAppTitle` | Open in your browser to install | Mở bằng trình duyệt để cài |
| `install.inAppZalo` | CoinCrew can't be installed from inside Zalo. | Không thể cài CoinCrew từ trong Zalo. |
| `install.inAppOther` | CoinCrew can't be installed from inside this app. | Không thể cài CoinCrew từ trong ứng dụng này. |
| `install.inAppStep1` | Tap ⋯ at the top | Nhấn ⋯ ở góc trên |
| `install.inAppStep2` | Choose "Open in browser", then tap "Add to home screen" again | Chọn "Mở bằng trình duyệt", rồi nhấn lại "Thêm vào màn hình chính" |
| `install.copyLink` | Copy link | Sao chép liên kết |
| `install.desktopStep` | Click the install icon in the address bar | Nhấn biểu tượng cài đặt trên thanh địa chỉ |

The copy-link snackbar reuses `share.copied`.

- [ ] **Step 1: Write the failing tests** in `install-app-sheet.test.tsx`. Mock `@cc/web-platform/install` with `vi.mock`, so `useInstallPrompt` returns a chosen context; render through `renderAt`.
  - `'prompt'`: `getByRole('button', { name: 'Install now' })` exists and is the only primary button in the sheet. Clicking it calls `prompt`. When `prompt` resolves `'accepted'`: `onInstalled` is called, the sheet closes (`onClose` called), and `getByRole('status')` has the text "Added to your home screen".
  - `'prompt'`, and `prompt` resolves `'dismissed'`: the sheet stays open and now shows the Android manual steps (the text "Install app" is visible), with no "Install now".
  - `'android-manual'`: two steps and a "Got it" button that calls `onClose`.
  - `'ios-safari'` with an iOS 26 UA (stub `navigator.userAgent`): three step rows (`within(sheet).getAllByTestId('install-step')` has length 3) and the sign-in note. With an iOS 18 UA: two rows, the first containing "bottom bar".
  - `'ios-chrome'`: two rows and the sign-in note. `'ios-other'`: one row and the sign-in note.
  - `'in-app'` with a Zalo UA: title "Open in your browser to install", text "inside Zalo". Clicking "Copy link" calls `navigator.clipboard.writeText` with `window.location.href` and shows the "Copied" status. With an `FBAN` UA: "inside this app".
  - `'desktop'`: the `desktopStep` text and "Got it".
  - The sheet root has `data-testid="install-sheet"` and the class `fsl-install-sheet--<context>`.

- [ ] **Step 2: Run** `npx nx run @cc/web-screens:test -- install-app-sheet`. Expected: FAIL.

- [ ] **Step 3: Add the icons and the copy,** then implement `InstallAppSheet`. Use `Sheet` with `title={t(context === 'in-app' ? 'install.inAppTitle' : 'install.title')}`. Steps are a white `rounded-xl` list; each row has `data-testid="install-step"`, a numbered `bg-secondary text-secondary-foreground` circle, and inline `Icon`s (`ellipsis`, `ellipsisVertical`, `shareIos`, `squarePlus`). The sign-in note is a `bg-secondary text-secondary-foreground rounded-xl` block. Only "Install now" uses the `primary` variant; "Got it" and "Copy link" are `secondary`, "Not now" is `ghost`. Snackbar messages clear after 4000 ms.

- [ ] **Step 4: Run** the sheet tests and `npx nx run @cc/web-screens:test -- style-guard`. Expected: PASS.

- [ ] **Step 5: Commit:** `feat(install): add the platform-adaptive install sheet (#92)`

---

### Task 4: Visibility hook and the install pill

**Files:**
- Create: `libs/web/screens/src/components/InstallPill.tsx` (exports the pill and `useInstallVisibility`), `libs/web/screens/src/components/__tests__/install-pill.test.tsx`

**Interfaces:**
- Consumes: `useInstallPrompt`, `installStore` (Task 2); `InstallAppSheet` (Task 3); `usePlatform()`; `useMe()` from `@cc/web-data-access/hooks`.
- Produces:
  - `export function useInstallVisibility(): { pill: boolean; menuRow: boolean }`
  - `export function InstallPill(): JSX.Element | null`

Rules (from spec §3): `menuRow` = `platform.kind === 'web'` && `useMe` succeeded with a non-null user && context ≠ `'standalone'` && not installed. `pill` = `menuRow` && `mobile` && not dismissed && visit count ≥ 2. The visit is counted with `installStore.countVisit()` the first time a signed-in user is seen. Guard it with a module-level `let visitCounted = false`, so remounts and StrictMode count once per page load. Export `__resetInstallVisitForTests()` for tests.

- [ ] **Step 1: Write the failing tests** in `install-pill.test.tsx`. Mock `@cc/web-platform/install`'s `useInstallPrompt`, use `mockApi({ 'GET /api/me': … })`, and reset `localStorage` plus the visit flag before each test.
  - A signed-in user, `ios-safari`, mobile, `cc.install.visits = '1'` beforehand: the pill (`data-testid="install-pill"`) shows. Tapping it opens `install-sheet`.
  - First visit (no `visits` key): no pill. Rendering two pills in the same test leaves `cc.install.visits === '1'` (counted once).
  - `GET /api/me` → `{ user: null }`: no pill, and `cc.install.visits` stays unset.
  - Context `'standalone'`: no pill. `installed: true`: no pill. `mobile: false` (desktop): no pill.
  - `platform: fakePlatform({ kind: 'zmp' })` with context `'in-app'`: no pill.
  - Tapping ✕ (`.fsl-install-pill__close`, `aria-label` "Dismiss"): the pill disappears and `cc.install.dismissed === '1'`. After unmount and re-render it stays hidden.
  - `localStorage` throwing on every call: rendering doesn't throw, and there's no pill (visit count reads 0).

- [ ] **Step 2: Run** `npx nx run @cc/web-screens:test -- install-pill`. Expected: FAIL.

- [ ] **Step 3: Implement `InstallPill`.** It's a `button` row with the classes `fsl-install-pill flex min-h-11 items-center gap-2 rounded-full bg-secondary pl-4 pr-1 text-secondary-foreground`, an `Icon name="smartphone"`, the label `t('install.pill')` in `text-sm font-semibold` with a `chevronRight`, and a sibling 44px ✕ icon button (`fsl-install-pill__close`, `aria-label={t('common.dismiss')}`). Don't nest a button inside the button; wrap both in a `div`. The pill renders `InstallAppSheet` and returns `null` while `useMe` is loading or errored.

- [ ] **Step 4: Run** the pill tests. Expected: PASS.

- [ ] **Step 5: Commit:** `feat(install): add the dismissible install pill (#92)`

---

### Task 5: Wire into Home, Groups and the account menu

**Files:**
- Modify: `libs/web/screens/src/screens/Home.tsx` (first child of both the `wide` and the phone content branches, after `<ConsentSheet />`), `libs/web/screens/src/screens/Groups.tsx` (before `<MyTrips embedded />`), `libs/web/screens/src/components/AccountMenu.tsx` (a new row after the Notifications row)
- Test: `libs/web/screens/src/screens/__tests__/install-entry-points.test.tsx`

**Interfaces:**
- Consumes: `InstallPill`, `useInstallVisibility` (Task 4); `InstallAppSheet` (Task 3).

- [ ] **Step 1: Write the failing tests** in `install-entry-points.test.tsx`, reusing the API fixtures from `home-main.test.tsx` / `trips.test.tsx` by importing from `../../test/fixtures`. Mock `useInstallPrompt` to return `ios-safari`, mobile, and set `cc.install.visits = '1'`.
  - `<Home />` at `/trips`: `install-pill` is in the document and comes before `home-total` (`compareDocumentPosition`).
  - `<Groups />` at `/groups`: `install-pill` is in the document.
  - `<AccountMenu user={user} />`: after opening the menu, `data-testid="account-install"` (class `fsl-account-menu__install`) is shown with the text "Add to home screen". Clicking it opens `install-sheet`.
  - With context `'standalone'`: no `account-install` row, and no pill on Home.
  - With `mobile: false`: the `account-install` row shows, and there's no pill on Home.

- [ ] **Step 2: Run** `npx nx run @cc/web-screens:test -- install-entry-points`. Expected: FAIL.

- [ ] **Step 3: Add `<InstallPill />`** to Home (both branches) and Groups. In `AccountMenu`, add the row in the same markup and classes as the Notifications row: `Icon name="smartphone"`, `t('install.menuRow')`, a chevron, shown only when `useInstallVisibility().menuRow`. Clicking it opens its own `InstallAppSheet`.

- [ ] **Step 4: Run the whole suite:** `npm test`, `npm run typecheck`, `npm run lint`. Expected: all PASS, with no edits to existing tests.

- [ ] **Step 5: Commit:** `feat(install): show the install pill on Home and Groups and add it to the account menu (#92)`

---

### Task 6: Device check and handoff

- [ ] **Step 1:** `npm run build`. Start the tunnel on the fresh build (memory: ngrok `sawfish-dear-heron.ngrok-free.app`, restarted after the rebuild). Check it in a desktop browser first: Chrome DevTools → Application → Manifest shows it as installable with no warnings, and the pill appears on the second signed-in load under phone emulation.
- [ ] **Step 2:** Hand off to the owner for the manual phone test. Cover Android Chrome 1-tap, iPhone Safari (iOS 26 and older), iPhone Chrome, and Zalo's in-app browser. Check the Vietnamese menu labels against the real menus, and that the app launches on Khoản chi nhanh with no pill. Fix the `// REVIEW` labels from their findings.
- [ ] **Step 3:** After the owner approves: push, and open a PR into the branch the owner names, referencing #92.
