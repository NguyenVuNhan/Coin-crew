# Bank App Hand-off Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One tap on the pay QR saves the QR to the phone, then opens the person's remembered bank app; a searchable picker chooses the bank; a separate button downloads the QR. Works in the web app (Chrome, Zalo webview) and the Zalo Mini App.

**Architecture:** Bank-app data and search live in `@fsl/core`. Everything platform-specific goes through the existing `PlatformBridge` (`saveImage`, `openExternal`, `storage`) in `@fsl/web-common/src/platform`: only the web bridge's `saveImage` changes. Two new sheets in `web-common` (picker, save-and-open) replace `BankAppSheet`, and `PayQr` wires them together.

**Tech Stack:** React 19, TypeScript, Tailwind v4 + shadcn wrappers, Vitest + Testing Library, lucide-react.

**Spec:** `docs/superpowers/specs/2026-11-02-bank-app-handoff-design.md`

**Worktree:** `C:\repo\experience\coin-crew-bank`, branch `feat/bank-app-handoff` (from `origin/main` 1b61967).

## Global Constraints

- UI rules from `CLAUDE.md`: app wrappers first (`Sheet`, `Button`, `Skeleton`…); theme colours only (no raw hex, no per-component `.css`; `src/test/style-guard.test.ts` enforces); touch targets `min-h-11`; inputs `text-base`; money `tabular-nums`.
- Obvious secondary actions are **icon buttons** with `aria-label` + `title` (user's rule): the switch-bank button uses lucide `ArrowLeftRight`.
- Never import `zmp-sdk` in `packages/web-common` (`apps/zalo/src/__tests__/no-sdk-in-web.test.ts`).
- Keep existing `fsl-pay-qr*` classes and `data-testid`s; new elements use `fsl-bank-*` classes.
- Every new string goes into both `packages/web-common/src/i18n/en.ts` and `vi.ts`, with exact copy from the table below.
- No prefill: links stay `bankAppLink(appId)` = `https://dl.vietqr.io/pay?app=<id>`; `PREFILL_VERIFIED`, `autofill` and `pay.fillsIn` are removed.
- Timings: **500 ms** from step 1 ending to step 2 starting; **3000 ms** before step 2 offers its button.
- Storage key for the remembered bank: **`fsl.bankApp`** (value = `appId`).
- Repo rule: Gemini implementers may **add** tests but never edit or delete existing ones. Edits to existing tests (Tasks 2, 6) are done by the planner.

### Strings (key → en / vi)

| key | en | vi |
|---|---|---|
| `pay.openBankApp` (exists) | Open bank app | Mở ứng dụng ngân hàng |
| `pay.openApp` | Open {app} | Mở {app} |
| `pay.switchBank` | Change bank | Đổi ngân hàng |
| `pay.downloadQr` | Download QR | Tải mã QR |
| `pay.pickBank` | Choose your bank | Chọn ngân hàng của bạn |
| `pay.searchBank` | Search: vcb, techcom, Á Châu… | Tìm: vcb, techcom, Á Châu… |
| `pay.recentBank` | Recently used | Dùng gần đây |
| `pay.popularBanks` | Popular | Phổ biến |
| `pay.noBankMatch` | No bank matches "{q}" | Không tìm thấy ngân hàng "{q}" |
| `pay.handoffTitle` | Pay with {app} | Thanh toán bằng {app} |
| `pay.saving` | Saving the QR… | Đang lưu mã QR… |
| `pay.savingIos` | Choose "Save Image" | Chọn "Lưu hình ảnh" |
| `pay.savedStep` | QR saved | Đã lưu mã QR |
| `pay.saveStep` | Save the QR | Lưu mã QR |
| `pay.saveAction` | Save | Lưu |
| `pay.opening` | Opening {app}… | Đang mở {app}… |
| `pay.openedStep` | {app} opened | Đã mở {app} |
| `pay.openStep` | Open {app} | Mở {app} |
| `pay.openAction` | Open | Mở |
| `pay.notOpened` | Didn't open? | Chưa mở được? |
| `pay.zaloAsks` | Zalo will ask: choose "Continue" | Zalo sẽ hỏi: chọn "Tiếp tục" |
| `pay.handoffTip` | In {app}: Scan QR → upload picture → pick the saved QR. | Trong {app}: Quét QR → tải ảnh lên → chọn mã QR vừa lưu. |

Removed keys: `pay.chooseApp`, `pay.fillsIn`, `pay.zaloBankHint`, `pay.bankFallback` (only if no other user remains; grep first).

## Review Focus

1. **A remembered bank that no longer exists** (the app was removed from the list, or the id is from the other platform, e.g. an Android id on iPhone) should be treated as "no bank remembered", not crash or show a blank button. Test in Task 3.
2. **Closing the sheet mid-flow** (during "Đang lưu…" or the 500 ms gap) must cancel the timers, so the app never opens after the sheet is gone. Test in Task 5.
3. **Tapping "Mở ACB ONE" twice quickly** must run one save, not two. Test in Task 5.
4. **Searches like "VCB ", "á châu", "Đông Á", "zzz"** should match without accents, case or surrounding spaces, and show the empty line for no match. Test in Task 1 (logic) and Task 4 (empty line).
5. **Coming back from the bank app** (page visible again after being hidden) shows step 2 as ✓ and the tip; a page that never hid shows the Mở button after 3 s. Test in Task 5.

---

### Task 1: Bank app data, logos and search (`@fsl/core`)

**Files:**
- Create: `packages/core/scripts/refresh-bank-apps.mjs`
- Modify: `packages/core/src/data/bank-apps.json` (regenerated), `packages/core/src/banks.ts`, `packages/core/src/index.ts` (export)
- Create: `packages/web-common/src/assets/bank-apps/{android,ios}-<appId>.webp` (written by the script)
- Test: `packages/core/test/banks.test.ts` (new)

**Interfaces:**
- Produces:
  - `interface BankApp { appId: string; appName: string; bankName: string; bankShortName: string | null; bankCode: string | null; monthlyInstall: number }`
  - `BANK_APPS: { android: BankApp[]; ios: BankApp[] }` (each list sorted by `monthlyInstall` desc)
  - `searchBankApps(apps: BankApp[], query: string): BankApp[]`
  - `bankAppLink(appId: string): string` (unchanged)
  - Removed: `PREFILL_VERIFIED`, `BankApp.autofill`

- [ ] **Step 1: Write the refresh script.** `node packages/core/scripts/refresh-bank-apps.mjs` fetches `https://api.vietqr.io/v2/android-app-deeplinks` and `.../ios-app-deeplinks`, joins each app to `src/data/banks.json` by exact full name (`app.bankName === bank.name`) to get `shortName` and `code` (null when no match; today `lpb` and `oceanbank` don't match), writes `src/data/bank-apps.json` in the `BankApp` shape, and downloads each `appLogo` to `packages/web-common/src/assets/bank-apps/<platform>-<appId>.webp`. Run it once and commit the output.
- [ ] **Step 2: Write the failing tests** in `packages/core/test/banks.test.ts`:

```ts
const apps: BankApp[] = [
  { appId: 'vcb', appName: 'VCB Digibank', bankName: 'Ngân hàng TMCP Ngoại Thương Việt Nam', bankShortName: 'Vietcombank', bankCode: 'VCB', monthlyInstall: 300000 },
  { appId: 'acb', appName: 'ACB ONE', bankName: 'Ngân hàng TMCP Á Châu', bankShortName: 'ACB', bankCode: 'ACB', monthlyInstall: 70000 },
  { appId: 'mb', appName: 'MB Bank', bankName: 'Ngân hàng TMCP Quân đội', bankShortName: 'MBBank', bankCode: 'MB', monthlyInstall: 500000 },
  { appId: 'lpb', appName: 'LPBank', bankName: 'Ngân hàng TMCP Bưu Điện Liên Việt', bankShortName: null, bankCode: null, monthlyInstall: 10000 },
];
it('empty or blank query lists every app, most installed first', () => {
  expect(searchBankApps(apps, '').map((a) => a.appId)).toEqual(['mb', 'vcb', 'acb', 'lpb']);
  expect(searchBankApps(apps, '   ').map((a) => a.appId)).toEqual(['mb', 'vcb', 'acb', 'lpb']);
});
it('matches code, app name, short name and full name, ignoring case, accents and spaces', () => {
  expect(searchBankApps(apps, 'VCB ').map((a) => a.appId)).toEqual(['vcb']);
  expect(searchBankApps(apps, 'á châu').map((a) => a.appId)).toEqual(['acb']);
  expect(searchBankApps(apps, 'a chau').map((a) => a.appId)).toEqual(['acb']);
  expect(searchBankApps(apps, 'vietcom').map((a) => a.appId)).toEqual(['vcb']);
  expect(searchBankApps(apps, 'buu dien').map((a) => a.appId)).toEqual(['lpb']);
});
it('no match gives an empty list', () => {
  expect(searchBankApps(apps, 'zzz')).toEqual([]);
});
it('the shipped lists have both platforms, unique ids, no autofill field', () => {
  for (const list of [BANK_APPS.android, BANK_APPS.ios]) {
    expect(list.length).toBeGreaterThan(20);
    expect(new Set(list.map((a) => a.appId)).size).toBe(list.length);
    expect(list.every((a) => !('autofill' in a))).toBe(true);
  }
});
```

- [ ] **Step 3: Run** `npm test -w @fsl/core -- banks`. Expected: FAIL (`searchBankApps` not exported).
- [ ] **Step 4: Implement** `searchBankApps` in `packages/core/src/banks.ts`: trim, then `normalizeName` (from `./names`) the query and each of `appId`, `appName`, `bankShortName`, `bankCode`, `bankName`; keep the app when any normalized field contains the query; sort by `monthlyInstall` desc. Update the `BankApp` type and drop `PREFILL_VERIFIED`.
- [ ] **Step 5: Run** `npm test -w @fsl/core && npm run typecheck -w @fsl/core`. Expected: PASS. (`web-common` won't typecheck until Task 6 removes the `PREFILL_VERIFIED` import; that's expected.)
- [ ] **Step 6: Commit** `feat(core): bank app list with installs, logos and accent-free search`.

### Task 2: Web `saveImage` from the device tests

**Files:**
- Modify: `packages/web-common/src/platform/index.tsx` (result type), `packages/web-common/src/platform/browser.ts`, `packages/web-common/src/test/fakePlatform.ts` (type only), `apps/zalo/src/platform/zaloMiniApp.ts` (type only)
- Test: `packages/web-common/src/platform/__tests__/browser-save.test.ts` (new)

**Interfaces:**
- Produces: `PlatformBridge.saveImage(png: Blob, fileName: string): Promise<'saved' | 'cancelled' | 'failed'>`; `isIosDevice(nav?: Navigator): boolean` exported from `platform/browser.ts`.

- [ ] **Step 1: Write the failing tests** in `browser-save.test.ts` (stub `navigator` with `vi.stubGlobal`):
  - `'iPhone shares the PNG as a file and reports saved'`: UA `iPhone`, `canShare → true`, `share` resolves → result `'saved'`; `share` called with `{ files: [File] }`, where the file's name is the given `fileName` and its type is `image/png`.
  - `'iPhone share cancelled reports cancelled'`: `share` rejects `{ name: 'AbortError' }` → `'cancelled'`.
  - `'iPhone without file sharing reports failed and does not download'`: `canShare → false` → `'failed'`; no `<a>` clicked.
  - `'iPadOS (Macintosh UA with touch) counts as iOS'`: UA `Macintosh`, `maxTouchPoints: 5` → `isIosDevice()` is `true`; `maxTouchPoints: 0` → `false`.
  - `'Android downloads a data: URL, not a blob: URL'`: UA `Android`; spy on `HTMLAnchorElement.prototype.click`; the clicked anchor's `href` starts with `data:image/png;base64,` and `download === fileName`; result `'saved'`.
- [ ] **Step 2: Run** `npm test -w @fsl/web-common -- browser-save`. Expected: FAIL.
- [ ] **Step 3: Implement** in `browser.ts`: `isIosDevice` = `/iPhone|iPad|iPod/` in the UA, or `Macintosh` with `maxTouchPoints > 1`. `saveImage`: on iOS, `navigator.share({ files })` when `canShare({ files })`; otherwise `'failed'`. Elsewhere, read the blob with `FileReader.readAsDataURL` and click an `<a download>`. Widen the type in `index.tsx` and fix the two other implementers' signatures.
- [ ] **Step 4 (planner): update existing tests.** Change any existing assertions that expected a `blob:` URL from `browserPlatform.saveImage` (grep `platform.test.tsx`, `qr.test.ts`).
- [ ] **Step 5: Run** `npm test -w @fsl/web-common -- platform && npm test -w @fsl/zalo`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(web-common): web saveImage shares on iPhone and downloads a data URL elsewhere`.

### Task 3: Remembered bank and per-platform list

**Files:**
- Create: `packages/web-common/src/lib/bankApps.ts`
- Test: `packages/web-common/src/lib/__tests__/bank-apps.test.ts`

**Interfaces:**
- Consumes: `BANK_APPS`, `BankApp` (Task 1); `isIosDevice` (Task 2); `PlatformStorage`.
- Produces:
  - `BANK_APP_KEY = 'fsl.bankApp'`
  - `deviceBankApps(): BankApp[]` (iOS list when `isIosDevice()`, else Android)
  - `bankAppLogo(appId: string): string | undefined` (URL of the bundled webp for the device's platform, via `import.meta.glob('../assets/bank-apps/*.webp', { eager: true, query: '?url', import: 'default' })`)
  - `loadRememberedBankApp(storage: PlatformStorage, apps: BankApp[]): Promise<BankApp | null>`
  - `rememberBankApp(storage: PlatformStorage, appId: string): Promise<void>`
  - `useRememberedBankApp(): { app: BankApp | null; remember(app: BankApp): void }` (hook over `usePlatform().storage`)

- [ ] **Step 1: Write the failing tests**:
  - `'returns the stored app when it is in the list'`: store `fsl.bankApp=acb` → resolves the `acb` entry.
  - `'ignores an id that is not in this platform's list'`: store `fsl.bankApp=nope` → `null` (Review Focus 1).
  - `'storage that throws counts as nothing remembered'`: `get` rejects → `null`.
  - `'rememberBankApp writes the id under fsl.bankApp'`.
  - `'bankAppLogo gives a URL for a known app and undefined for an unknown one'`.
- [ ] **Step 2: Run** `npm test -w @fsl/web-common -- bank-apps`. Expected: FAIL.
- [ ] **Step 3: Implement** `lib/bankApps.ts` with the signatures above.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web-common): remember the bank app per device`.

### Task 4: Bank picker sheet

**Files:**
- Create: `packages/web-common/src/components/BankPickerSheet.tsx`
- Modify: `packages/web-common/src/i18n/en.ts`, `vi.ts` (picker strings from the table)
- Test: `packages/web-common/src/components/__tests__/bank-picker.test.tsx`

**Interfaces:**
- Consumes: `searchBankApps`, `BankApp` (Task 1); `bankAppLogo` (Task 3).
- Produces: `BankPickerSheet(props: { open: boolean; onClose(): void; apps: BankApp[]; recent: BankApp | null; onPick(app: BankApp): void }): JSX.Element`

Layout per spec §4.2 / mockup `bank-flow.html` §2: `Sheet` titled `pay.pickBank`; a search `<input type="search">` (`text-base`, `aria-label` = `pay.searchBank`, lucide `Search` icon); with no query, a "Dùng gần đây" group (only when `recent`, ticked with lucide `Check`), then "Phổ biến" with every app; with a query, one flat list of results. Rows are `<button class="fsl-bank-row">` with `min-h-11`, logo (`<img alt="">`, 32px, `rounded-lg`), app name (`font-semibold`), bank short name (or full name when null) in `text-muted-foreground`.

- [ ] **Step 1: Write the failing tests**:
  - `'lists recent first, then every app'`: with `recent=acb`, the first `.fsl-bank-row` is ACB ONE, and the "Popular" group has every app.
  - `'typing filters without accents'`: type `á châu` → exactly one row, ACB ONE.
  - `'no match shows the empty line'`: type `zzz` → `No bank matches "zzz"` (Review Focus 4).
  - `'picking a row calls onPick with that app'`.
  - `'the search field is 16px and labelled'`: has class `text-base` and the accessible name `pay.searchBank`.
- [ ] **Step 2: Run** `npm test -w @fsl/web-common -- bank-picker`. Expected: FAIL.
- [ ] **Step 3: Implement** `BankPickerSheet.tsx` and add the strings.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web-common): searchable bank picker`.

### Task 5: Save-and-open sheet

**Files:**
- Create: `packages/web-common/src/components/BankHandoffSheet.tsx`
- Modify: `en.ts`, `vi.ts` (hand-off strings from the table)
- Test: `packages/web-common/src/components/__tests__/bank-handoff.test.tsx`

**Interfaces:**
- Consumes: `usePlatform()` → `saveImage`, `openExternal`; `bankAppLink` (Task 1); `bankAppLogo` (Task 3); `isIosDevice` (Task 2); `isZaloWebView` (`lib/zaloEnv`).
- Produces: `BankHandoffSheet(props: { open: boolean; onClose(): void; app: BankApp; makePng(): Promise<Blob | null>; fileName: string; onSaveFailed?(): void }): JSX.Element`

Behaviour (spec §4.3, mockup `bank-flow-v2.html`). Each time `open` turns true, run once:
1. Step 1 `saving` (spinner: lucide `Loader2` `animate-spin`; sub-line `pay.savingIos` on iOS). Call `makePng()`, then `platform.saveImage(png, fileName)`. `'saved'` → ✓ `pay.savedStep`. `'cancelled'`, `'failed'` or a null png → `pay.saveStep` with a `pay.saveAction` button that retries step 1 only, and calls `onSaveFailed?.()` on `'failed'`. Either way, continue to step 2.
2. After **500 ms**: step 2 `opening` (`pay.opening`; sub-line `pay.zaloAsks` when `isZaloWebView()`), and call `platform.openExternal(bankAppLink(app.appId))`. `'blocked'` → show the button at once. The page going hidden (`visibilitychange` to hidden, or `pagehide`) → `opened`. Becoming visible again after hidden → ✓ `pay.openedStep`. Still visible after **3000 ms** without having hidden → `pay.openStep` + `pay.notOpened` + a `pay.openAction` link (`<a href={bankAppLink(appId)}>`, for web) or button (calls `openExternal`, for `platform.kind === 'zmp'`).
3. Always show the tip `pay.handoffTip` under the steps (`bg-warning-soft`, `rounded-xl`).

Steps are white `rounded-xl` rows (`fsl-bank-step`, `data-state="saving|saved|save-failed|waiting|opening|opened|open-failed"`). Closing clears all timers and listeners, and nothing runs after close.

- [ ] **Step 1: Write the failing tests** (fake platform, `vi.useFakeTimers()`):
  - `'saves, then opens the bank 500 ms later'`: `saveImage` → `'saved'`; step 1 `data-state="saved"`; `openExternal` not called at 499 ms and called once with `https://dl.vietqr.io/pay?app=acb` at 500 ms.
  - `'shows the Mở button after 3 s when the page never hid'`: state `open-failed`, with the link/button present.
  - `'blocked opens the fallback at once'`: `openExternal` → `'blocked'` → `open-failed` without advancing 3 s.
  - `'hidden then visible marks the bank opened'`: dispatch `visibilitychange` with `document.visibilityState` stubbed to hidden, then visible → step 2 `opened` and the tip visible (Review Focus 5).
  - `'cancelled save offers Lưu and still opens the bank'`: `saveImage` → `'cancelled'` → `save-failed` with a `Save` button; `openExternal` still called at 500 ms; clicking Save calls `saveImage` a second time.
  - `'failed save calls onSaveFailed'`.
  - `'closing mid-flow cancels the open'`: rerender with `open=false` at 200 ms, advance 1000 ms → `openExternal` never called (Review Focus 2).
  - `'opening twice runs one save'`: rerender `open=true` twice in a row → `saveImage` called once (Review Focus 3).
  - `'Zalo webview shows the Zalo-asks hint'`: Zalo UA → `pay.zaloAsks` visible in step 2.
- [ ] **Step 2: Run** `npm test -w @fsl/web-common -- bank-handoff`. Expected: FAIL.
- [ ] **Step 3: Implement** `BankHandoffSheet.tsx` with a reducer over the step states; one `useEffect` keyed on `open` owns the timers and listeners, and a ref guards against a second run.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web-common): save-then-open bank sheet`.

### Task 6: Wire `PayQr`, remove the old sheet

**Files:**
- Modify: `packages/web-common/src/components/PayQr.tsx`, `packages/web-common/src/lib/qr.ts` (drop `saveQr`), `en.ts`, `vi.ts` (button strings; delete the removed keys)
- Delete: `packages/web-common/src/components/BankAppSheet.tsx`
- Test: `packages/web-common/src/components/__tests__/pay-qr-bank.test.tsx` (new); planner updates `zmp-save.test.tsx`, `zalo-share.test.tsx`, `expense-links.test.tsx`, `lib/__tests__/qr.test.ts`

**Interfaces:**
- Consumes: Tasks 2–5 (`saveImage`, `useRememberedBankApp`, `deviceBankApps`, `bankAppLogo`, `BankPickerSheet`, `BankHandoffSheet`).
- Produces: no new exports. `PayQr` props are unchanged.

Behaviour (spec §4.1):
- Pay variant, coarse pointer, nothing remembered: primary `pay.openBankApp` → picker; `onPick` → `remember(app)`, close the picker, open the hand-off sheet.
- Pay variant, coarse pointer, remembered: primary `pay.openApp` with logo → hand-off sheet; next to it an icon button (`ArrowLeftRight`, `aria-label`/`title` = `pay.switchBank`, `size-11`, `fsl-bank-switch`) → picker.
- Secondary `pay.downloadQr` (lucide `Download`) on both variants: `platform.saveImage(png, vietqr-<ref>.png)`. `'saved'` → existing status line (`pay.savedToGallery`); `'failed'` on iOS → open `SaveImageSheet` (existing `useImageSheet`); other `'failed'` → `pay.shareFailed`.
- Hand-off `onSaveFailed` → open `SaveImageSheet` on iOS too.
- Fine pointer: no bank button; the download button is primary for the pay variant, as today.
- Actions layout: the remembered-bank row (button + icon) and the download button stack in a column; for the `receive` variant, Share and Download sit in a row of two `flex-1 min-w-0` buttons. Neither may overflow at 320px (spec §4.1 overflow fix).

- [ ] **Step 1: Write the failing tests** in `pay-qr-bank.test.tsx` (coarse pointer via `mockMedia`, `fakePlatform`):
  - `'first time: Open bank app opens the picker, picking remembers and starts the hand-off'`: `storage.set` called with `('fsl.bankApp', 'acb')`; dialog `Pay with ACB ONE` visible.
  - `'remembered: the button reads Open ACB ONE and the switch icon opens the picker'`: preset store `fsl.bankApp=acb`; button name `Open ACB ONE`; `getByRole('button', { name: 'Change bank' })` opens `Choose your bank`.
  - `'Download QR saves through the platform'`: `saveImage` called with a `Blob` and `vietqr-DALAT-C7K2.png`.
  - `'iPhone save failure falls back to the long-press sheet'`: iPhone UA, `saveImage` → `'failed'` → `SaveImageSheet` dialog visible.
  - `'receive variant keeps Share and Download inside the card'`: both buttons have `flex-1` and `min-w-0`.
- [ ] **Step 2: Run** `npm test -w @fsl/web-common -- pay-qr-bank`. Expected: FAIL.
- [ ] **Step 3: Implement** the `PayQr` changes; delete `BankAppSheet.tsx`, `saveQr` and the removed i18n keys (grep first that nothing else uses them).
- [ ] **Step 4 (planner): update existing tests** that import `BankAppSheet`/`saveQr` or assert `pay.zaloBankHint`/`pay.bankFallback`/`Choose your bank app`, so they assert the new flow instead (the zmp blocked case becomes the hand-off's `open-failed`).
- [ ] **Step 5: Run** `npm test && npm run typecheck` (root). Expected: all PASS, including `style-guard`.
- [ ] **Step 6: Commit** `feat(web-common): one-tap bank hand-off on the pay QR`.

### Task 7: Device check and clean-up (planner)

- [ ] **Step 1:** `npm run tunnel` from this worktree. On the Android phone via adb, test only inside the **"Coin crew Test"** Zalo group or Chrome: first-time picker → hand-off → ACB ONE opens; remembered button; Download QR lands in the gallery.
- [ ] **Step 2:** Zalo Mini App testing build (`deploy:tunnel`, opened via `zalo.me/s/<appId>/?env=TESTING`): the hand-off saves to the gallery and `openOutApp` opens the bank. Record the result in the spec's §2.
- [ ] **Step 3:** Ask the user to run the iPhone checks (Zalo webview + Mini App): the share sheet saves, then the bank opens or the Mở button appears.
- [ ] **Step 4:** Delete `apps/web/public/spike-bank.html` (untracked in `C:\repo\experience\coin-crew`) and its copy in the `Zalo-Mini-App` worktree (both `apps/web/public` and `apps/api/public`).
