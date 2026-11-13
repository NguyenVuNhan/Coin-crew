# Group Payment Request Share Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two new share flows:
- **Request payment:** the balance card gets a "Yêu cầu thanh toán" button that shares one picture, a text and one
  `/owe` link into a group chat.
- **Bill share:** the payer of any normal group expense gets a "Chia sẻ hoá đơn & mã QR" button that shares a bill
  picture with a QR.

**Architecture:**
- **One canvas renderer:** a generic "ledger card" in `@cc/web-util` draws both pictures.
- **Text and cards:** text builders and Mini App cards live in `libs/web/screens/src/lib`.
- **One share hook:** `useImageShare` holds the per-platform branches (phone share sheet / Mini App / Zalo webview /
  PC). The sport bill moves onto it.
- **Self-contained buttons:** two new components carry the buttons, each fetching its own QR and bank guard.
- **No API changes.**

**Tech Stack:** React 19, TypeScript, React Query, Vitest + Testing Library, canvas 2D, Nx workspace (`@cc/*`).

**Spec:** `docs/superpowers/specs/2026-11-12-group-payment-request-share-design.md`

## Global Constraints

- No new API routes, tokens or link types. Links are `payLink(view)` (`/j/<token>/owe`) and `expenseLink(view, rootId)`.
- **QR sources:**
  - Group picture: the viewer's own QR from `usePayInfo({ tripId, toId: me, bill: true, enabled, version })` (no
    `expenseId`), which has no amount.
  - Expense bill: `usePayInfo({ tripId, toId: e.payerId, bill: true, expenseId: e.rootId ?? e.id, ... })`.
- Copy is neutral ("Dán vào tin nhắn hoặc nhóm chat" / "Paste into a message or group chat"). Never name Zalo in web
  copy. Every new key goes in both `libs/web/i18n/src/vi.ts` and `en.ts`.
- `@cc/web-util` can't import `@cc/web-i18n`, so the canvas renderer takes all its labels as input.
- **UI:**
  - use the `Button` wrapper (primary, block, `min-h-11`) and `Icon name="share"`;
  - money in `tabular-nums`;
  - theme colours only in components (the canvas keeps fixed hex like `renderSportBillPng`);
  - new `fsl-*` classes as named in each task.
- Platform features only through `usePlatform()`. Branch on `platform.kind === 'zmp'` first.
- **Sport bill:** its button, picture and PC behaviour (copy text only) don't change. Existing tests must pass
  unedited, except import paths of moved helpers.
- **Tests:** add new test files only. Run tests per library with `npx nx run <pkg>:test -- <path>`. Finish with
  `npm test`, `npm run typecheck` and `npm run lint` (lint only through Nx).
- Branch: `feat/group-payment-request-share`, not Orca's `NguyenVuNhan/` prefix.

## Review Focus

1. **Long or accented names** (e.g. "Nguyễn Thị Phương Thảo (chị họ của Lan)") must not run into the amount column.
   The renderer clips names to the column width. Test in Task 1.
2. **Many debtors** (12 rows): the canvas grows with the row count, and the QR and bank line stay below the table.
   Test in Task 1.
3. **A guest sharing** (no `view.links`): the `/owe` link must fall back to the stored link token, never `/j/`. Test in
   Task 2.
4. **An expense edited after it was shared:** the link and Mini App card use `e.rootId ?? e.id`, so an old message
   keeps working. Test in Task 2.
5. **Cancelling the system share sheet** (`AbortError`): no "failed" message shows. Test in Task 3.

---

### Task 1: Ledger card renderer and shared image-file share

**Files:**
- Create: `libs/web/util/src/ledgerCard.ts`
- Modify: `libs/web/util/src/qr.ts` (pull the files/download/clipboard part of `shareSportBill` into `shareImageFile`
  and call it from `shareSportBill`)
- Test: `libs/web/util/src/__tests__/ledgerCard.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface LedgerCardRow { name: string; amount: number; muted?: boolean; tag?: string }
  export interface LedgerCardInput {
    title: string;          // e.g. "Đà Lạt · Yêu cầu thanh toán" / the expense description
    meta: string;           // grey line under the title
    nameHeader: string;     // "TÊN"
    amountHeader: string;   // "CẦN CHUYỂN" / "PHẦN CHIA"
    rows: LedgerCardRow[];  // muted → grey text, normal → debt colour #be123c; tag drawn after the name, e.g. "(người trả)"
    totalLabel: string;     // "TỔNG" / "TỔNG HOÁ ĐƠN"
    total: number;
    qrSvg?: string;         // omitted → no QR, bank line or hint
    bankLine?: string;      // "Minh · Vietcombank · 0123 · NGUYEN VAN MINH"
    hint?: string;          // small grey line under the bank line
  }
  export function renderLedgerPng(input: LedgerCardInput): Promise<Blob | null>;
  // in qr.ts:
  export function shareImageFile(blob: Blob | null, fileName: string, text: string): Promise<'shared' | 'saved' | 'failed'>;
  ```

- [ ] **Step 1: Write the failing tests** in `ledgerCard.test.ts`, mocking `document.createElement('canvas')` the same
  way `qr-planning.test.ts` does (record `fillText` calls, `fillStyle` at each call, and the canvas height):
  - `draws title, meta, headers, every row, total label and formatted total`: 3 rows (An 385000, Bình 565000,
    Chi 1245000), total 2195000. The `fillText` texts include `'TÊN'`, `'CẦN CHUYỂN'`, `'An'`, `'385.000 ₫'`,
    `'TỔNG'`, `'2.195.000 ₫'`. The blob is non-null.
  - `a muted row is grey and a normal row is the debt colour`: the fillStyle when drawing the muted row's amount is not
    `'#be123c'`; for a normal row it is `'#be123c'`.
  - `without qrSvg there is no bank line, hint or drawImage`: `drawImage` isn't called, and `bankLine` / `hint` texts
    are absent.
  - `with qrSvg the QR, bank line and hint are drawn below the table`: the `drawImage` y value is greater than the y
    value of the TỔNG text.
  - `clips a long name to its column` (Review Focus 1): mock `measureText` as `text.length * 10`. A 60-character name is
    drawn shorter than the original and ends with `'…'`.
  - `canvas height grows with rows` (Review Focus 2): height with 12 rows is greater than height with 3 rows.
  - `shareImageFile falls back to download plus copy when navigator.share is missing`: it returns `'saved'` and calls
    `navigator.clipboard.writeText` with the text.

- [ ] **Step 2: Run** `npx nx run @cc/web-util:test -- src/__tests__/ledgerCard.test.ts`.
  Expected: FAIL (module not found).

- [ ] **Step 3: Implement `renderLedgerPng`** in `ledgerCard.ts`.
  - Copy the layout constants and styles from `renderSportBillPng`: width as there, padX 48, title bold 36px #111827,
    meta 22px #6b7280, header and total rows filled #f3f4f6 / #e5e7eb, row height 56, borders #e5e7eb, 240px QR.
  - Two columns: name (left) and amount (right, about 260px wide).
  - Height = header + (rows + 2) × rowHeight, plus the QR block only when there's a `qrSvg`.
  - Clip names with `measureText` so they fit their column, and append `'…'` when clipped.
  - Draw the QR with the same `qrSrc` + `Image` approach as `renderSportBillPng` (export `qrSrc` from `qr.ts` if it
    isn't exported).
  - Format money with `formatVnd` from `@cc/core`.

- [ ] **Step 4: Implement `shareImageFile`.** Move the body of `shareSportBill` after `renderSportBillPng` into it
  unchanged. `shareSportBill` becomes `shareImageFile(await renderSportBillPng(input), billFileName, text)`.

- [ ] **Step 5: Run** the new test plus `src/__tests__/qr.test.ts` and `qr-planning.test.ts`.
  Expected: all PASS.

- [ ] **Step 6: Commit**
  `git commit -m "feat(web-util): ledger card renderer and shared image-file share"`

---

### Task 2: Copy, text builders, Mini App cards and the debtor list

**Files:**
- Modify: `libs/web/i18n/src/vi.ts`, `libs/web/i18n/src/en.ts`
- Modify: `libs/web/screens/src/lib/remind.ts`, `libs/web/screens/src/lib/shareCards.ts`, `libs/web/screens/src/lib/owe.ts`
- Test: `libs/web/screens/src/lib/__tests__/requestShare.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // owe.ts
  export function requestTotalRows(view: TripView): Transfer[];
  // [] when archived, me.kind === 'viewer' or participantId null; else suggestions with toId === me, in view order
  // remind.ts
  export function groupRequestText(lang: Lang, input: { trip: string; creditor: string; rows: { name: string; amount: number }[]; link: string }): string;
  export function expenseBillText(lang: Lang, input: { description: string; total: number; shares: { name: string; amount: number }[]; link: string }): string;
  // shares = everyone except the payer
  // shareCards.ts
  export function groupRequestCard(view: TripView, text: string, origin: string): ShareCard;            // path `j/<token>/owe`
  export function expenseBillCard(view: TripView, rootExpenseId: string, text: string, origin: string): ShareCard; // path `j/<token>/e/<id>`
  ```
- **i18n keys:** add to both files. Vietnamese values below; English in brackets.
  - `request.button`: 'Yêu cầu thanh toán' ['Request payment']
  - `request.copied`: 'Đã sao chép tin nhắn. Dán vào tin nhắn hoặc nhóm chat nhé.' ['Message copied. Paste it into a message or group chat.']
  - `request.textHead`: 'Nhóm "{trip}", cần chuyển cho {creditor}:' ['"{trip}": please send {creditor}:']
  - `request.textFoot`: 'Chọn tên mình để xem mã QR: {link}' ['Pick your name to see your QR: {link}']
  - `request.cardTitle`: '{trip} · Yêu cầu thanh toán' ['{trip} · Payment request']
  - `request.cardMeta`: '{date} · Nhận: {name}' ['{date} · To: {name}']
  - `request.cardAmount`: 'CẦN CHUYỂN' ['TO SEND']
  - `request.cardTotal`: 'TỔNG' ['TOTAL']
  - `request.cardHint`: 'Mở link để có mã QR đúng số tiền của bạn' ['Open the link for a QR with your exact amount']
  - `card.name`: 'TÊN' ['NAME']
  - `bill.button`: 'Chia sẻ hoá đơn & mã QR' ['Share bill & QR']
  - `bill.cardMeta`: '{date} · {trip} · Trả trước: {name}' ['{date} · {trip} · Paid by: {name}']
  - `bill.cardAmount`: 'PHẦN CHIA' ['SHARE']
  - `bill.cardTotal`: 'TỔNG HOÁ ĐƠN' ['BILL TOTAL']
  - `bill.payerTag`: '(người trả)' ['(paid)']
  - `bill.hintEqual`: 'Quét mã để chuyển {amount}' ['Scan to send {amount}']
  - `bill.hintUneven`: 'Mở link để có mã QR đúng phần của bạn' ['Open the link for a QR with your exact share']
  - `bill.textEqual`: '{description}: {total}, mỗi người {amount}.' ['{description}: {total}, {amount} each.']
  - `bill.textUneven`: '{description}: {total}. {list}.' ['{description}: {total}. {list}.']
  - `bill.textFoot`: 'Mã QR & chi tiết: {link}' ['QR & details: {link}']
  - `share.requestTitle`: 'Yêu cầu thanh toán · {trip}' ['Payment request · {trip}']
  - `share.billTitle`: 'Hoá đơn · {trip}' ['Bill · {trip}']

- [ ] **Step 1: Write the failing tests** in `requestShare.test.ts`:
  - `groupRequestText vi lists each debtor and ends with the link`:
    ```ts
    expect(groupRequestText('vi', { trip: 'Đà Lạt', creditor: 'Minh', rows: [{ name: 'Chi', amount: 1245000 }, { name: 'An', amount: 385000 }], link: 'https://x/j/gtok-1/owe' }))
      .toBe('Nhóm "Đà Lạt", cần chuyển cho Minh:\n• Chi 1.245.000 ₫\n• An 385.000 ₫\nChọn tên mình để xem mã QR: https://x/j/gtok-1/owe');
    ```
  - `groupRequestText en`: starts with `'"Đà Lạt": please send Minh:'`.
  - `expenseBillText equal split`: `('vi', { description: 'Lẩu', total: 900000, shares: [A 300000, B 300000], link: L })`
    gives `'Lẩu: 900.000 ₫, mỗi người 300.000 ₫.\nMã QR & chi tiết: ' + L`.
  - `expenseBillText uneven split`: shares A 100000 and B 200000 give `'Lẩu: 900.000 ₫. A 100.000 ₫, B 200.000 ₫.\nMã QR & chi tiết: ' + L`.
  - `requestTotalRows returns suggestions into me in view order`: with `tripView()`, the order is
    `[C, B, A]`.
  - `requestTotalRows is empty when archived, for a viewer, or when nothing comes in`.
  - `groupRequestCard path goes to owe`: `groupRequestCard(tripView(), 'txt', 'https://o').path === 'j/gtok-1/owe'` and
    `url === 'https://o/j/gtok-1/owe'`.
  - `expenseBillCard uses the root id` (Review Focus 4): with `rootId 'e-root'`, the path is `'j/gtok-1/e/e-root'`.
  - `payLink for a guest falls back to the stored token` (Review Focus 3): set `links: undefined` and call
    `linkTokens.set('t-1', 'gtok-g')`. `payLink(view)` ends with `'/j/gtok-g/owe'`. If `linkTokens` has no `set`, use its
    existing write API.

- [ ] **Step 2: Run** `npx nx run @cc/web-screens:test -- src/lib/__tests__/requestShare.test.ts`.
  Expected: FAIL.

- [ ] **Step 3: Add the i18n keys.** Implement the five functions using each language's dictionary, the same way
  `remindText` reads `vi` / `en` and replaces `{key}`.
  - Debtor lines: `• <name> <formatVnd(amount)>`, joined with `\n`.
  - Uneven `{list}`: `<name> <formatVnd(amount)>` joined with `', '`.
  - The split counts as equal when every entry in `shares` has the same amount.
  - Cards follow `sportBillCard`: titles through `clip(..., 100)`, description `clip(text, 400)`,
    `thumbnailFor(view, origin)`.

- [ ] **Step 4: Run** the test from Step 2, plus `npx nx run @cc/web-i18n:test`, which checks that both dictionaries have
  the same keys. Expected: PASS.

- [ ] **Step 5: Commit**
  `git commit -m "feat(web): request and bill share copy, text builders and cards"`

---

### Task 3: `useImageShare` hook, with the sport bill moved onto it

**Files:**
- Create: `libs/web/screens/src/lib/useImageShare.tsx`
- Modify: `libs/web/screens/src/components/ExpenseDetails.tsx` (`handleShareSportBill` uses the hook)
- Test: `libs/web/screens/src/lib/__tests__/useImageShare.test.tsx`

**Interfaces:**
- Consumes: `shareImageFile` (Task 1); `useImageSheet` (`components/SaveImageSheet`); `copyText`
  (`@cc/web-util/clipboard`); `useIsMousePointer` (`@cc/web-util/media`); `isZaloWebView` (`@cc/web-util/zaloEnv`);
  `usePlatform`.
- Produces:
  ```ts
  export type ImageShareStatus = 'saved' | 'copied' | 'failed' | null;
  export interface ImageShareRequest {
    render: () => Promise<Blob | null>;
    text: string;
    fileName: string;
    card: ShareCard;      // used in the Mini App
    pcPicture: boolean;   // PC: also open the image sheet after copying (new shares true, sport bill false)
  }
  export function useImageShare(): {
    share(req: ImageShareRequest): Promise<void>;
    status: ImageShareStatus;
    sharing: boolean;
    sheet: JSX.Element;   // the image sheet; render it once in the caller
  };
  ```
- **Branches, in this order** (taken from `handleShareSportBill`). Reset `status` to null at the start.
  1. **Mouse pointer outside the Zalo webview:**
     - copy the text first: `status = copied ? 'copied' : 'failed'`;
     - then, if `pcPicture`, open the image sheet with `render` and `text`.
  2. **`platform.kind === 'zmp'`:**
     - render, then `platform.saveImage(blob, fileName)`;
     - then `platform.share(card)`;
     - `status = saved ? 'saved' : 'failed'`.
  3. **`isZaloWebView()`:** open the image sheet with `render` and `text`.
  4. **Otherwise:** `shareImageFile(await render(), fileName, text)`.
     - `'shared'` → status stays null;
     - `'saved'` / `'failed'` → set that status;
     - a thrown error → `'failed'`.
- `sharing` is true while branches 2 and 4 run.

- [ ] **Step 1: Write the failing tests** using `renderHook` inside the providers from `test/render.tsx` (or a small
  wrapper with `PlatformProvider`):
  - `PC copies the text then opens the picture sheet when pcPicture`: stub `matchMedia` to return `matches: true` and
    stub `navigator.clipboard.writeText`. Then `status === 'copied'`, `writeText` was called with the text, and the
    sheet shows (`.fsl-save-image` is in the rendered `sheet`).
  - `PC with pcPicture false only copies`: no sheet.
  - `Mini App saves the image and shares the card`: a platform mock with `kind: 'zmp'`, `saveImage` resolving
    `'saved'`, and a `share` spy. Then `share` was called with the card, and `status === 'saved'`.
  - `phone browser shares the file with the text`: `navigator.share` and `canShare` stubbed to true. `navigator.share`
    is called with `{ files: [File], text }`, and status is null.
  - `cancelling the share sheet shows no failure` (Review Focus 5): `navigator.share` rejects with
    `Object.assign(new Error(), { name: 'AbortError' })`, and `status === null`.

- [ ] **Step 2: Run** `npx nx run @cc/web-screens:test -- src/lib/__tests__/useImageShare.test.tsx`.
  Expected: FAIL.

- [ ] **Step 3: Implement the hook.** In `ExpenseDetails`:
  - replace the branch logic in `handleShareSportBill` with `share({ render: () => renderSportBillPng(billInput),
    text: msgText, fileName, card: sportBillCard(...), pcPicture: false })`;
  - drive the sport status `<p>`s and the button's `loading` from the hook's `status` / `sharing`;
  - render `sheet` in place of the old `imageSheet` (the planning share keeps its own `useImageSheet`; leave it as is).

- [ ] **Step 4: Run** the new test plus `src/test/sportExpense.test.tsx`, `src/test/sportShare.test.ts` and
  `src/__tests__/sport-planning-ui.test.tsx`. Expected: all PASS, with the existing ones unedited.

- [ ] **Step 5: Commit**
  `git commit -m "refactor(web-screens): one image-share hook; sport bill uses it"`

---

### Task 4: "Yêu cầu thanh toán" on the balance card

**Files:**
- Create: `libs/web/screens/src/components/RequestTotalButton.tsx`
- Modify: `libs/web/screens/src/components/BalanceCard.tsx` (render it after the waiting list, before the bank prompt,
  when `requestTotalRows(view).length > 0`)
- Test: `libs/web/screens/src/components/__tests__/request-total-button.test.tsx`

**Interfaces:**
- Consumes: `requestTotalRows`, `groupRequestText`, `groupRequestCard`, `payLink`, the i18n keys (Task 2);
  `renderLedgerPng` (Task 1); `useImageShare` (Task 3); `useBankFirst` (`components/BankFirstSheet`); `usePayInfo`;
  `useQrSvg`.
- Produces: `export function RequestTotalButton({ view }: { view: TripView }): JSX.Element`.

**Behaviour:**
- `usePayInfo({ tripId, toId: me, bill: true, enabled: true, version: view.trip.version })` and
  `useQrSvg(payInfo?.payload ?? null)`. The QR is fetched while the button is on screen, so the click doesn't wait on
  the network.
- **Picture** (`renderLedgerPng`):
  - title `request.cardTitle`;
  - meta `request.cardMeta` with today's date (`formatDay` on today's local `YYYY-MM-DD`) and the viewer's name;
  - headers `card.name` / `request.cardAmount`;
  - rows: debtor names (`nameOf`) and `amount`, already rounded by the server, so don't round again;
  - total: the sum of the rows, labelled `request.cardTotal`.
  - With `bankState === 'ok'` and a QR, add `qrSvg`, `bankLine` (`<my name> · <bankName> · <accountNumber> ·
    <holderName>`) and `hint` `request.cardHint`. Otherwise leave out all three.
- **Text:** `groupRequestText(lang, { trip, creditor: my name, rows, link: payLink(view) })`.
- **File name:** `request-<trip name with spaces → '-'>.png`.
- **Card:** `groupRequestCard(view, text, platform.apiBase)`. Set `pcPicture: true`.
- **Click:** `guard(() => share(...))`.
- **Markup:**
  - `<Button variant="primary" block className="fsl-balance__request mt-3">` with `Icon share` and
    `t('request.button')`;
  - a status `<p className="fsl-balance__request-status">` showing `request.copied` / `pay.shareSaved` /
    `pay.shareFailed`;
  - the guard `sheet` and the image-share `sheet`.

- [ ] **Step 1: Write the failing tests** (`renderAt` + `mockApi` + `tripView()` fixtures; mock `@cc/web-util/ledgerCard`
  so `renderLedgerPng` resolves a Blob and records its input):
  - `shows on the balance card when people owe me`: `.fsl-balance__request` with the text "Request payment".
  - `hidden when nobody sends me money`: `suggestions: []`.
  - `hidden on an archived group and for a viewer`.
  - `shows with transfers into me even when my net is not positive`: `myBalance.now: 0` with one suggestion into me
    (pairwise case).
  - `phone share sends the picture rows and the owe link`: stub `navigator.share` / `canShare`. After a click:
    - the `renderLedgerPng` input rows are `[Chi 1245000, Bình 565000, An 385000]`;
    - `total === 2195000`;
    - the `navigator.share` text contains `/j/gtok-1/owe`.
  - `no bank details opens the bank-first sheet`: me with `bank: 'none'`. The click shows the bank-first sheet, and
    `navigator.share` isn't called.
  - `pending bank details share without QR`: the pay route returns `bankState: 'pending', payload: null`. The
    `renderLedgerPng` input has no `qrSvg` and no `bankLine`.

- [ ] **Step 2: Run** `npx nx run @cc/web-screens:test -- src/components/__tests__/request-total-button.test.tsx`.
  Expected: FAIL.

- [ ] **Step 3: Implement `RequestTotalButton`** and mount it in `BalanceCard`.

- [ ] **Step 4: Run** the new test plus `src/components/__tests__/balance-money-colour.test.tsx`, then `npm test` (other
  screens render `BalanceCard`). Expected: PASS.

- [ ] **Step 5: Commit**
  `git commit -m "feat(web-screens): request payment from the balance card"`

---

### Task 5: "Chia sẻ hoá đơn & mã QR" on a normal expense

**Files:**
- Create: `libs/web/screens/src/components/ExpenseBillShare.tsx`
- Modify: `libs/web/screens/src/components/ExpenseDetails.tsx` (in the non-sport branch, right after
  `ul.fsl-details__shares`, render `<ExpenseBillShare view={view} expense={e} />` when `canShareExpenseBill(view, e)`)
- Test: `libs/web/screens/src/components/__tests__/expense-bill-share.test.tsx`

**Interfaces:**
- Consumes: `expenseBillText`, `expenseBillCard`, `expenseLink`, the i18n keys (Task 2); `renderLedgerPng` (Task 1);
  `useImageShare` (Task 3); `useBankFirst`, `usePayInfo`, `useQrSvg`, `isFundPaid`.
- Produces:
  ```ts
  export function canShareExpenseBill(view: TripView, e: ExpenseView): boolean;
  // payer === me && status === 'approved' && !isFundPaid(e) && !view.trip.archived && !e.meta?.sport
  export function ExpenseBillShare({ view, expense }: { view: TripView; expense: ExpenseView }): JSX.Element;
  ```

**Behaviour:**
- `rootId = e.rootId ?? e.id`. Fetch with `usePayInfo({ tripId, toId: e.payerId, bill: true, expenseId: rootId,
  enabled: true, version })`.
- Amounts come from `e.shares`, through `roundToThousand` when `view.trip.roundTransfers`, as the shares list shows them.
- **Picture** (`renderLedgerPng`):
  - title `e.description`;
  - meta `bill.cardMeta` with `formatDay(e.spentOn)`, the trip name and the payer name;
  - headers `card.name` / `bill.cardAmount`;
  - rows: all shares in people order. The payer's row has `muted: true, tag: t('bill.payerTag')`;
  - total: `e.amount`, labelled `bill.cardTotal`.
  - With a QR, add `qrSvg`, `bankLine` and a hint: `bill.hintEqual` (`formatVnd(payInfo.amount)`) when
    `payInfo.amount > 0`, else `bill.hintUneven`.
- **Text:** `expenseBillText(lang, { description, total: e.amount, shares: non-payer shares, link: expenseLink(view,
  rootId) })`.
- **File name:** `bill-<refCode or description, spaces → '-'>.png`.
- **Card:** `expenseBillCard(view, rootId, text, platform.apiBase)`. Set `pcPicture: true`.
- **Click:** `guard(() => share(...))`.
- **Markup:**
  - a wrapper `div.fsl-expense-share` (same classes as `fsl-sport-preview-card`);
  - `Button variant="primary" className="rounded-full"` with `Icon share` and `t('bill.button')`;
  - a status `p.fsl-expense-share__status` with `request.copied` / `pay.shareSaved` / `pay.shareFailed`;
  - both sheets.

- [ ] **Step 1: Write the failing tests** (render `TripRoute` at `/t/t-1/expenses/e-1`, as `sportExpense.test.tsx`
  does, with `tripView()`, where `e-1` is paid by Minh = me; mock `@cc/web-util/ledgerCard`):
  - `the payer sees Share bill & QR on a normal expense`.
  - `hidden for someone who didn't pay`: open `e-2` (paid by An).
  - `hidden for a pending expense, a fund-paid expense and an archived group`.
  - `a sport expense still shows only the sport button`: exactly one "Share bill & QR" button, inside
    `.fsl-sport-preview-card`, and no `.fsl-expense-share`.
  - `equal split: picture hint asks for the amount`: the bill pay route returns `amount: 800000` with a payload. The
    `renderLedgerPng` input `hint` is "Scan to send 800.000 ₫". The payer row is muted with tag "(paid)". `total` is
    `3200000`.
  - `uneven split: hint says open the link`: `amount: 0`. The hint is "Open the link for a QR with your exact share".
  - `phone share text links to the expense by root id`: `e-1` with `rootId: 'e-1-root'`. The `navigator.share` text
    contains `/j/gtok-1/e/e-1-root`.
  - `PC copies then opens the picture sheet`: stub `matchMedia` to `matches: true`. The clipboard gets the text,
    `.fsl-save-image` shows, and the status reads `request.copied`.

- [ ] **Step 2: Run** `npx nx run @cc/web-screens:test -- src/components/__tests__/expense-bill-share.test.tsx`.
  Expected: FAIL.

- [ ] **Step 3: Implement `ExpenseBillShare` / `canShareExpenseBill`** and mount it in `ExpenseDetails`.

- [ ] **Step 4: Run** the new test plus the sport tests from Task 3, then the full checks: `npm test`,
  `npm run typecheck`, `npm run lint`. Expected: all PASS, with no lint errors (including the import-boundary rule and
  `style-guard.test.ts`).

- [ ] **Step 5: Commit**
  `git commit -m "feat(web-screens): share a normal expense's bill and QR"`

---

### Task 6: Walkthrough

- [ ] **Step 1:** Run `npm run build`, then restart the tunnel on the new build (the project's tunnel routine).
- [ ] **Step 2:** In a phone-sized browser on the tunnel, check:
  - as a member who is owed money, the balance card shows "Yêu cầu thanh toán", and the picture matches wireframe A;
  - the payer of a normal expense sees "Chia sẻ hoá đơn & mã QR", and the picture matches wireframe B;
  - opening the `/owe` link in a private window leads to "Who are you?", then to that person's QR;
  - in a desktop-width window, the text is copied and the picture sheet opens.
- [ ] **Step 3:** Hand over to the owner for a manual test. Push and open the PR only after they approve.
