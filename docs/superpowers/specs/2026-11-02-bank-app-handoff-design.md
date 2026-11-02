# Bank app hand-off: search, remember, save-then-open

Date: 2026-11-02 · Status: draft for review · Builds on: [[2026-10-20-zalo-oauth-webview-og-design]] (§4.1.5 bank hand-off) · [[2026-11-01-zalo-mini-app-design]] (§10, `PlatformBridge`) · [[2026-10-28-shadcn-friendly-redesign-design]] ("The look")

## 1. Why

Paying a friend today takes too many steps. People screenshot the QR, leave the app, open their bank app, find "Scan QR", pick the screenshot and only then transfer. The **"Mở ứng dụng ngân hàng"** button saves them nothing:

- the bank list is ~35 rows with no search and no logos, so people can't find their bank;
- the chosen app opens empty (no account, amount or note);
- inside Zalo, the fallback ("long-press the picture to save") doesn't work: Zalo's long-press menu on Android has no "Save image".

Success: a person taps one button and lands in their own bank app with the QR already in their photos, ready to upload. Next time, the app remembers their bank. Works in Chrome, in Zalo's built-in browser and in the **Zalo Mini App** (`apps/zalo`), on Android and iPhone.

Since #32 the app lives in `packages/web-common` and runs in two shells: the web app (`apps/web`) and the Zalo Mini App (`apps/zalo`). Platform-specific work goes through `PlatformBridge` (`packages/web-common/src/platform`): `saveImage`, `openExternal` and `storage`. This design builds on that bridge instead of adding its own branches.

## 2. What we tested (2026-11-02, throwaway page `spike-bank.html`)

Tested on a real Samsung (Android 17), partly driven by adb, and on the user's iPhone.

| | Android · Zalo | Android · Chrome | iPhone · Zalo |
|---|---|---|---|
| `dl.vietqr.io/pay?app=…` opens the bank app | ✓ | ✓ | ✓ |
| …with account/amount/note filled in | ✗ | ✗ | ✗ |
| Download, `<a download>` + **blob:** URL | ✗ | (not tested; works in practice today) | – |
| Download, `<a download>` + **data:** URL | ✓ lands in gallery (`Download/Zalo/`, Zalo picks its own file name) | – | ✗ |
| `navigator.share({ files })` | ✗ not supported | – | ✓ offers "Save image" |
| Long-press the image | ✗ no save option | – | – |
| Move the page out to Chrome / Safari (`intent://…;package=com.android.chrome` / `x-safari-https://`) | ✓ | – | ✓ |

**The chained flow (save → 500 ms → `location.href = dl.vietqr.io…`, no second tap), test X1:**
- Android Chrome: fully automatic. The PNG (data: URL) landed in `Download/` and ACB ONE opened.
- Android Zalo: the PNG saved silently to `Download/Zalo/`, then **Zalo showed its own dialog, "You will exit Zalo and open another application" (Cancel / Process)**. Tapping Process opened Vietcombank. That one confirmation is Zalo's and we can't avoid it.
- iPhone (share sheet → open, test X2): see §6.

**Zalo Mini App** (testing build, Android, opened via `zalo.me/s/<appId>/?env=TESTING`):
- `platform.saveImage` → `saveImageToGallery` saved the QR silently into the gallery (`Download/Zalo/`) and reported success ("QR saved to your photos").
- `platform.openExternal` → `openOutApp` could not be tested: the account had no debt to anyone with bank details, so no pay QR was shown. Still to check (§6).
- Found on the way: in the `receive` variant, the second action button ("Lưu mã QR") is pushed off-screen to the right of a full-width Share button.

**Prefill is not available to us.** For ACB ONE (listed by VietQR as "autofill"), `dl.vietqr.io` redirected to plain `acbone://` with no payment data (checked with `adb dumpsys activity`). With a dummy account the MB, BIDV and VCB redirects carried no data either. Bank apps open on their home or QR-scan screen; ACB's scan screen has an **upload from photos** button. Every Vietnamese bank app can scan a VietQR from a saved picture, and that is the path this design is built on.

## 3. Goals, non-goals, anti-goals

**Goals**
- Search the bank list: accent-insensitive, matching the short name/code ("vcb"), the app name and the full bank name.
- Remember the last-used bank app and offer it as a one-tap button.
- One tap: save the QR, then open the bank app, automatically, with a visible fallback for each step.
- A separate download button for the QR picture that works in Zalo (Android and iPhone) and in normal browsers.
- One behaviour on every phone and browser: the same sheet, the same steps.

**Non-goals**
- Prefilled transfers. The prefill parameters (`ba`, `am`, `tn`, `bn`) are not sent; `PREFILL_VERIFIED` and `autofill` go away (my call: dead code once prefill is out).
- Any change to computers (fine pointer): they keep "scan with your phone" plus the download button, with no bank button.
- Reworking the other Zalo image flows (`ExpenseDetails` share, the `receive` variant's Share). They keep `SaveImageSheet` for now (my call: separate change).
- Pushing people out of Zalo into Chrome/Safari. It works, but nothing in this flow needs it.

**Anti-goals** (it fails even if it technically works)
- Two different flows for Android and iPhone that people have to learn separately.
- A step that silently does nothing. Every step must end as ✓ done or as a button the person can tap.
- Claiming the bank app will fill in the payment.

## 4. The design

Mockups: `.superpowers/brainstorm/6853-1793637960/content/bank-flow.html` (buttons, picker) and `bank-flow-v2.html` (the sheet and its states).

### 4.1 Buttons on the pay QR (`PayQr`, variant `pay`, touch devices)

- **No remembered bank:** primary `Mở ứng dụng ngân hàng` opens the picker (§4.2); after a pick, the save-and-open sheet (§4.3) runs straight away.
- **Remembered bank:** primary `Mở <app name>` with the app's logo opens the sheet (§4.3) directly. Next to it, an **icon button** (lucide `ArrowLeftRight`, `aria-label`/`title` "Đổi ngân hàng") opens the picker. The user asked for icons, not text, for obvious actions like this.
- **Secondary** `Tải mã QR` (download icon) runs only the save step (§4.4), with feedback in the existing status line.
- Computers (fine pointer): unchanged apart from the save button using §4.4.

This applies wherever `PayQr` is used with `variant="pay"`: `PayScreen`, `PersonScreen`, `RequestPage`, `YourTransfers` (all in `packages/web-common`), and so to both the web app and the Mini App. While reworking the actions row, fix the overflow so both buttons always fit (the `receive` variant's Share + Save today).

### 4.2 Bank picker (replaces `BankAppSheet`'s list)

- `Sheet` titled `Chọn ngân hàng của bạn`, with a search field at the top (16px text, search icon). The placeholder is something like `Tìm: vcb, techcom, Á Châu…`.
- With no query: a **Dùng gần đây** group (the remembered app, ticked), then **Phổ biến**: every app for the platform (iOS/Android list) sorted by monthly installs.
- With a query: one flat list of matches. Matching is case- and accent-insensitive (NFD + strip marks, `đ`→`d`) on app id/code, app name, bank short name and full bank name. Nothing found → a short empty line.
- Each row: logo, app name, bank short name underneath; ≥44px tall.
- Tapping a row remembers it (§4.5), closes the picker and starts the sheet (§4.3).

### 4.3 Save-and-open sheet

One `Sheet`, titled `Thanh toán bằng <app>` with the logo, holding two steps. Both steps start automatically, one after the other. Each one shows a spinner while it is working, ✓ when done, or turns into a button when it cannot finish on its own.

1. **Save the QR** with `platform.saveImage` (§4.4). Spinner + `Đang lưu mã QR…`; on iPhone the share sheet opens over it, with the hint `Chọn "Lưu hình ảnh"`.
   - done → ✓ `Đã lưu mã QR`;
   - cancelled or failed → step shows a **Lưu** button that retries; step 2 still runs (the person may already have the picture).
2. **Open the bank app**: ~500 ms after step 1 ends, call `platform.openExternal(bankAppLink(appId))`. On the web this navigates **in the same tab** (`location.assign`, as today; proven in Chrome and Zalo, `window.open` is not used); in the Mini App it is `openOutApp`. A `'blocked'` result shows the Mở button at once instead of waiting 3 s. Spinner + `Đang mở <app>…`. Inside Zalo the sub-line says Zalo will ask to leave, e.g. `Zalo sẽ hỏi — chọn "Tiếp tục"`, because Zalo always shows its own exit dialog here.
   - page hidden (`visibilitychange`/`pagehide`) → treat as opened; on return show ✓ `Đã mở <app>`. Because we navigate in the same tab, coming back relies on the browser's back/forward cache. If the page reloads instead, the sheet simply isn't open, and that's acceptable;
   - page still visible after ~3 s → step shows a **Mở** button (a real `<a href>` so a direct tap always works) and the sub-line `Chưa mở được?`. While Zalo's exit dialog is up the page stays visible, so the button may appear behind the dialog. That's harmless;
   - app not installed: `dl.vietqr.io` shows its own "couldn't open" page (Android uses `browser_fallback_url`) and the person goes back. We accept this.
3. Under the steps, a tip that is always visible: `Trong <app>: Quét QR → tải ảnh lên → chọn mã QR vừa lưu.`

On iPhone, the automatic open in step 2 comes after the share sheet, outside a fresh tap. If iOS refuses it, the 3-second fallback button covers it (see §6).

### 4.4 Saving the QR picture (`platform.saveImage`)

Both the sheet and `Tải mã QR` call `platform.saveImage(png, fileName)` with the PNG from `qrPngBlob`. Its result widens to `'saved' | 'cancelled' | 'failed'`.

- **Mini App:** unchanged, `saveImageToGallery` (verified on Android).
- **Web** (`browserPlatform.saveImage`, rewritten from the test results):

  - **iPhone/iPad** (any browser; detect iPadOS that reports "Macintosh" by touch support): `navigator.share({ files: [png] })` when `canShare` says yes. Resolves → `saved`; `AbortError` → `cancelled`. If file sharing isn't supported, return `failed`; `PayQr` then offers the existing `SaveImageSheet` (long-press to save on iOS) and the step shows its Lưu button (my call).
  - **Everything else**: `<a download>` with a **data: URL** of the PNG. It's proven in Zalo Android and Chrome Android; blob: URLs fail in Zalo, so use data: everywhere. It can't report success, so a click without an exception counts as `saved`.
- The PNG is the existing 1024px `qrPngBlob` (with the logo).

`saveQr` and the Zalo-webview branch of `PayQr` that opens `SaveImageSheet` are replaced by `platform.saveImage` for **both** variants' "Tải mã QR"/"Lưu mã QR" button (my call: one save path). The `receive` variant's **Share** button is unchanged. Other callers of `platform.saveImage` (e.g. the sport bill in `ExpenseDetails`) get the new web behaviour for free; that's intended.

### 4.5 Remembering the bank

- Stored on the device through `platform.storage` (key e.g. `fsl.bankApp`, value = `appId`): `localStorage` on the web, Zalo `nativeStorage` in the Mini App. My call: the bank app lives on the phone, so the memory is per device, not per account.
- An id that isn't in the current platform's list is ignored.

### 4.6 Bank app data (`packages/core`)

- Refresh `data/bank-apps.json` from `api.vietqr.io/v2/{android,ios}-app-deeplinks` and keep per app: `appId`, `appName`, `bankName`, `monthlyInstall`, and the bank code/short name needed for search (join with `banks.json`).
- Logos: bundle the VietQR icons as assets of `packages/web-common` so both shells get them, rather than loading them from `cdn.vietqr.io` (my call: works offline in the PWA and doesn't leak page views to a third party). The builder may choose the format/size.
- `bankAppLink(appId)` stays `https://dl.vietqr.io/pay?app=<id>`. It handles "app not installed" with its own page.

## 5. Constraints

- shadcn/ui + Tailwind v4 "Friendly" look; use the app wrappers (`Sheet`, `Button`, `Icon`, `Skeleton`…); theme colours only; touch targets ≥44px; fields at 16px. See `CLAUDE.md`.
- Keep existing `fsl-*` classes and `data-testid`s; new elements get `fsl-bank-*` classes.
- All new strings in `i18n/en.ts` and `vi.ts`.
- Platform differences go through `PlatformBridge`; never import `zmp-sdk` in `web-common` (`apps/zalo/src/__tests__/no-sdk-in-web.test.ts`). Zalo-webview detection stays `lib/zaloEnv.ts` (only for the "Zalo sẽ hỏi" hint); platform detection by user agent (`iPhone|iPad`), as `BankAppSheet` does today.

## 6. Left to the builder / to check during build

- Whether iOS opens the bank app automatically after the share sheet closes (spike test X2, still to run on the user's iPhone). If not, nothing changes in the design: the Mở fallback button appears.
- Spot-check the data:-URL download in Samsung Internet (proven in Zalo Android and Chrome Android).
- Exact timings (≈500 ms between steps, ≈3 s open timeout) and the spinner component.
- In the Mini App: whether `openOutApp` opens `dl.vietqr.io` into the bank app (and whether Zalo asks first) on Android and iPhone, and `saveImageToGallery` on iPhone. Test with a testing build in the "Coin crew Test" group.
- Delete `apps/web/public/spike-bank.html` (untracked, in the main checkout) and its copy in the `Zalo-Mini-App` worktree once this ships.
