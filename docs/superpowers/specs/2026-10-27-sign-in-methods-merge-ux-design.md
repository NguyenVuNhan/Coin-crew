# Sign-in methods and account merge UX — design

Status: approved in conversation section by section (2026-10-27), pending review of this document.
Builds on: [2026-10-20-zalo-oauth-webview-og-design.md](2026-10-20-zalo-oauth-webview-og-design.md) §4.5 (linking, unlinking, merging). Where the two differ, this document wins.
Lands on: `feat/zalo-oauth-webview-og` (PR 14), before that branch first ships.

## 1. Problem

The "Cách đăng nhập" (sign-in methods) section of the account menu is hard to read:

1. **Floating text.** "Liên kết thêm một cách đăng nhập trước" and the backup nudge sit under the rows instead of belonging to one. A lone sign-in method shows a disabled **Gỡ** that does nothing.
2. **Merges without context.** A merge starts when you link a Google or Zalo login that already has its own CoinCrew account, but the section only says "Tài khoản kia…" ("the other account"). It names neither the account nor the provider.
3. **No next step.** Once the 4-second snackbar is gone, a pending merge doesn't say what to do: sign in to the other account and approve. A declined merge is a dead end that can't be dismissed or retried.
4. **Placeholder icons.** Sign-in buttons use a drawn speech-bubble glyph for Zalo and no logo for Google.

## 2. Decisions

- **Approach B:** compact provider rows. A merge in progress shows as a status chip on its provider's row, and the details open in a step-by-step sheet.
- The person who started a merge may see the other account's CoinCrew name and the verified login (the Zalo name or the Google email). They have just signed in with that login.
- Dismissing a declined or accepted merge is stored on the server, so it applies on every device.
- The fastest way to confirm is on the same device: sign in as the other account there, approve, and the merge brings the device back.
- The Zalo **name** is shown, not the phone number. Zalo's basic sign-in permission doesn't include the phone number. That needs a separate permission Zalo grants only after reviewing the app.
- Every sign-in button and every provider row uses the official Google and Zalo logos.

## 3. Design

### 3.1 Provider logos

- New `apps/web/src/components/ProviderLogo.tsx` (+ `.css`): `ProviderLogo({ provider: AuthProvider; size?: number; muted?: boolean })` draws the brand mark as inline SVG with `aria-hidden="true"`. `muted` adds `fsl-provider-logo--muted` (`filter: grayscale(1); opacity: 0.45`).
- **Official artwork only, copied from the source, never redrawn:**
  - Google: the standard multicolour "G" from Google Identity's sign-in branding guidelines (developers.google.com/identity/branding-guidelines).
  - Zalo: the official Zalo logo from Zalo's own brand assets.

  A comment in the file cites each source URL. If no official Zalo SVG can be found, implementation stops and asks the owner for the brand file. The brand colours stay inside the SVG; tokens don't apply to brand marks. This is the one exception to "no raw hex in components".
- **Sign-in buttons** (`SignInButtons`, used by Landing, Who-are-you, GuestTrip and `SignInSheet`):
  - each button starts with its provider's logo at 20px;
  - Google's G always sits on white, as Google's guidelines require: on a coloured or primary button, it's inside a 28px white rounded square;
  - the Zalo mark carries its own blue background and needs no square.
- The placeholder `zalo` glyph in `icons.tsx` is removed; `SignInButtons` was its only user.
- **Profile rows** (`LinkedAccounts`) use a 24px logo, muted whenever that provider isn't linked to this account. That includes while a merge for it is pending or was declined.

### 3.2 Rows and chips

One row per provider. The Zalo row is hidden when Zalo isn't set up on the server (`signIn.zalo === false`) and isn't linked. Each row has the logo, the provider name, a subtitle, and **one** trailing control. Rows are at least 56px tall; controls are tap targets of at least 44px.

```
Only Google linked                          Both linked
┌──────────────────────────────────────┐    ┌──────────────────────────────────────┐
│ (G) Google                   [Đổi]   │    │ (G) Google              [Đổi] [Gỡ]   │
│     minh@gmail.com                   │    │     minh@gmail.com                   │
├──────────────────────────────────────┤    ├──────────────────────────────────────┤
│ (z) Zalo                [Liên kết]   │    │ (Z) Zalo                [Đổi] [Gỡ]   │
│     Chưa liên kết                    │    │     Noah Nguyen                      │
└──────────────────────────────────────┘    └──────────────────────────────────────┘
 (z) = muted logo

Merge in progress for Zalo (the whole row opens the merge sheet, §3.3)
│ (z) Zalo           ⏳ Chờ xác nhận  ›  │   pending   (Pill warning)
│     Noah Nguyen                          │
│ (z) Zalo           ✕ Bị từ chối    ›  │   declined  (Pill danger)
│     Noah Nguyen                          │
│ (Z) Zalo           ✓ Đã gộp        ›  │   accepted  (Pill success), until dismissed
│     Noah Nguyen                          │
```

- **Subtitle:**
  - linked Google: the `email`;
  - linked Zalo: `user.zaloName`, or `account.linked` ("Đã liên kết") when it's empty;
  - not linked: `account.notLinked` ("Chưa liên kết") in muted text;
  - a row with a chip: the merge's `otherName`.
- **Trailing control:**
  - not linked: **Liên kết** (Link);
  - linked: **Đổi** (Change), plus **Gỡ** (Unlink) only when two methods are linked. With one method, **Gỡ** is hidden, not disabled;
  - a merge for this provider: the chip, and the whole row becomes one button that opens the sheet.
- **Inside the Zalo app:** the Google row shows the existing `signIn.googleInZalo` hint instead of **Liên kết** or **Đổi**.
- **Removed:** the floating note `account.unlinkLast`, the nudges `account.backupNudgeZalo` and `account.backupNudgeGoogle`, and the line-per-request `merge.outgoing*` messages. Their keys are deleted from `en.ts` and `vi.ts`.
- **Chips** use the existing `Pill` tones with an icon plus text, so colour is never the only signal. A chip row's screen-reader label is `merge.rowLabel`.
- **Which request a row shows:** the one the server returns for its provider (§3.5): at most one per provider.

### 3.3 Merge sheet

New `apps/web/src/components/MergeSheet.tsx` (+ `.css`), shown in the existing `Sheet`. Its contents:
- title `merge.sheetTitle`;
- the intro `merge.sheetIntro` (pending and declined);
- three steps as an `<ol>` with `aria-current="step"` on the current one, each step marked ✓, ●, ✕ or ○ plus text;
- the buttons for the status.

All of it comes from `/api/me`, so the sheet needs no loading state. When it opens, focus goes to the primary button.

| Status | Step 1 | Step 2 | Step 3 | Below the steps | Buttons |
|---|---|---|---|---|---|
| pending | ✓ `merge.step1` | ● `merge.step2Pending` + `merge.step2Help` (expiry as dd/MM, Vietnam time) | ○ `merge.step3` | — | primary **`merge.confirmHere`** with `merge.switchNote` under it (§3.4); text button **`merge.cancelRequest`** |
| declined | ✓ | ✕ `merge.step2Declined` | ○ muted | `merge.declinedHelp` | primary **`merge.linkAgain`** (`/api/auth/{provider}/start?intent=link&returnTo={current path}`); text button **`merge.gotIt`** (dismiss) |
| accepted | ✓ | ✓ `merge.step2Accepted` | ✓ | `merge.acceptedSummary` | primary **`merge.gotIt`** (dismiss) |

- Step 1 names the verified login (`identityLabel`), and the title names the other CoinCrew account (`otherName`).
- **`merge.cancelRequest`** calls `POST /api/me/merge-requests/:id/cancel`. It needs no confirmation, because linking again recreates the request.
- **`merge.gotIt`** calls the new `POST /api/me/merge-requests/:id/dismiss`.
- On success, both close the sheet and reload `['me']`.
- ✕ or tapping outside closes the sheet and changes nothing.
- **Inside the Zalo app, a pending Google merge:** the `signIn.googleInZalo` hint replaces the **`merge.confirmHere`** button.

### 3.4 Confirming on this device

1. **`merge.confirmHere`** is a link to `/api/auth/{provider}/start?returnTo=/trips?mergeReview={id}`. It's an ordinary sign-in, not a link. `merge.switchNote` under the button warns that this device switches accounts.
2. The provider identity belongs to the other account (B), so the callback gives this device a session for B. This is existing behaviour; `safeReturnTo` already keeps the query string.
3. `MyTrips` reads `mergeReview`:
   - **Matching incoming request:** it renders that request's `MergeRequestBanner` with `autoOpen` (a new prop), which opens the existing `MergeConfirmSheet` on mount. The banner and the avatar dot stay if the sheet is closed.
   - **No match:** a `Snackbar` shows `merge.noRequestHere`.
   - **Either way:** the parameter is then removed with `navigate(…, { replace: true })`.
4. **Gộp tài khoản** (merge accounts): accepting runs the existing merge. It moves B's sessions to A, so this device is back on A after `resetQueries`. A's row for that provider shows **✓ Đã gộp** until dismissed.
5. **Declining:** if the other account declines here, the device stays on B, as `merge.switchNote` warned. Signing in with A's other method returns to A, where the row shows **✕ Bị từ chối**.

There's no new security exposure: whoever started the merge has just signed in with that login, so they can already sign in as B.

### 3.5 Data and API

**Migration `apps/api/migrations/0007_merge_ux.sql`.** It's additive only, after `0006`, which test databases have already applied. `schema.ts` is updated to match.

```sql
ALTER TABLE `users` ADD COLUMN `zalo_name` text;
ALTER TABLE `account_merge_requests` ADD COLUMN `other_name` text;
ALTER TABLE `account_merge_requests` ADD COLUMN `identity_label` text;
ALTER TABLE `account_merge_requests` ADD COLUMN `dismissed_at` text;
```

**Contract** (`packages/core/src/api-types.ts`):

```ts
export interface MeUserView { /* existing fields */ zaloName: string | null }
export interface OutgoingMergeRequest {
  id: string;
  provider: AuthProvider;
  status: 'pending' | 'accepted' | 'declined';
  expiresAt: string;
  /** The other account's CoinCrew name when the request was made. */
  otherName: string;
  /** The verified login: the Zalo name, or the Google email. */
  identityLabel: string;
}
```

**Server rules**

- **Creating a request** (`linkIdentity`, "belongs to B" case in `apps/api/src/auth/identity.ts`):
  - store `other_name = B.name`;
  - store `identity_label`: the verified profile's `email` for Google, its `name` for Zalo;
  - in the same batch, cancel every **other pending** request the same account started **for the same provider**, whatever account it was sent to. This replaces the old rule of cancelling only requests to the same B.
- **`/api/me` outgoing requests** (`buildMeResponse`):
  - **Which ones:** requests the signed-in account started, with status `pending`, `accepted` or `declined`, `expires_at > now` and `dismissed_at IS NULL`. Newest first, keeping the **first per provider** (at most two).
  - **`otherName` fallback:** `other_name`, then the other account's current `name` (left join, since it's gone after an accept), then the provider name.
  - **`identityLabel` fallback:** `identity_label`, then the provider name.
- **New route `POST /api/me/merge-requests/:id/dismiss`** (`accountRoutes.ts`, requires a session):
  - only the account that started the request, and only status `accepted` or `declined`;
  - sets `dismissed_at`, then 204;
  - 404 otherwise: not yours, pending, already dismissed, or unknown.
- **`users.zalo_name`:**
  - set from the verified profile's `name` on every Zalo sign-in (`upsertIdentity`), for new and existing accounts, without touching `name`. The edit-your-profile rule (`custom_profile`) is unchanged;
  - set when linking or changing Zalo (`linkIdentity`);
  - cleared by `DELETE /api/me/identities/zalo`;
  - on an account merge, `mergedUserFields` keeps the `zalo_name` that goes with the `zalo_sub` the surviving account ends up with.
- `toMeUserView` exposes `zaloName`.
- The other account's side (`IncomingMergeRequest`, `MergeRequestBanner` copy, `MergeConfirmSheet`) is unchanged, apart from the `autoOpen` prop.

### 3.6 Errors

| Failure | Shown |
|---|---|
| Cancel or dismiss gets 404 (expired, already handled elsewhere) | Nothing; the sheet closes and `['me']` reloads |
| Cancel or dismiss fails any other way | `InlineError` in the sheet; the sheet stays open to retry |
| **Liên kết lại** or **confirm here** fails at Google or Zalo | The existing `auth=failed` snackbar |
| `mergeReview` matches no incoming request | `merge.noRequestHere` snackbar |
| Accept fails (`MERGE_STALE`, expired) | The existing `MergeConfirmSheet` handling |
| No `zaloName`, or an old request without the new fields | The fallbacks in §3.2 and §3.5 |

### 3.7 Copy

Every new Vietnamese line ends with `// REVIEW`, and en/vi stay in parity.

| Key | vi | en |
|---|---|---|
| `merge.chipPending` | Chờ xác nhận | Waiting to confirm |
| `merge.chipDeclined` | Bị từ chối | Declined |
| `merge.chipAccepted` | Đã gộp | Merged |
| `merge.rowLabel` | {provider}: {status}, {name}. Xem chi tiết | {provider}: {status}, {name}. See details |
| `merge.sheetTitle` | Gộp với tài khoản {name} | Merge with {name}'s account |
| `merge.sheetIntro` | {provider} này đã thuộc tài khoản CoinCrew {name}. Khi gộp, nhóm, ngân hàng và lịch sử của {name} sẽ chuyển sang tài khoản này. | This {provider} already belongs to the CoinCrew account {name}. Merging moves {name}'s groups, bank details and history into this account. |
| `merge.step1` | Bạn đã xác minh {provider} {label} | You verified {provider} {label} |
| `merge.step2Pending` | Xác nhận từ tài khoản {name} | Confirm from {name}'s account |
| `merge.step2Help` | Đăng nhập bằng {provider} đó rồi chọn "Xem & gộp". Hết hạn {date}. | Sign in with that {provider}, then tap "Review & merge". Expires {date}. |
| `merge.step2Declined` | {name} đã từ chối gộp | {name} declined the merge |
| `merge.step2Accepted` | {name} đã đồng ý | {name} agreed |
| `merge.step3` | Hai tài khoản thành một | The two accounts become one |
| `merge.declinedHelp` | Bạn có thể liên kết {provider} khác, hoặc thử lại nếu {name} đổi ý. | You can link a different {provider}, or try again if {name} changes their mind. |
| `merge.acceptedSummary` | Nhóm, ngân hàng và lịch sử của {name} đã chuyển sang tài khoản này. | {name}'s groups, bank details and history are now in this account. |
| `merge.confirmHere` | Đăng nhập {provider} để xác nhận | Sign in with {provider} to confirm |
| `merge.switchNote` | Thiết bị này sẽ chuyển sang tài khoản {name}. Sau khi gộp, bạn quay lại tài khoản này với mọi thứ của cả hai. | This device switches to {name}'s account. After the merge you're back in this account with everything from both. |
| `merge.cancelRequest` | Huỷ yêu cầu | Cancel request |
| `merge.linkAgain` | Liên kết lại | Link again |
| `merge.gotIt` | Đã hiểu | Got it |
| `merge.noRequestHere` | Tài khoản này không có yêu cầu gộp nào đang chờ. | This account has no merge request waiting. |

## 4. Testing

Under the harness, Gemini writes new test files first and never edits existing ones. The controller runs every test and makes any edit to an existing test.

- **API (Workers pool):**
  - **Migration `0007`:** the new columns exist and are nullable.
  - **Creating a request:** it stores `other_name` and `identity_label` (a Zalo name, a Google email). It cancels the same account's other pending requests for the same provider and leaves the other provider's untouched.
  - **Outgoing requests in `/api/me`:** newest per provider; dismissed and expired ones left out; `otherName` and `identityLabel` included, plus each fallback.
  - **Dismiss:** 204 for an accepted or declined request you started; 404 for pending, someone else's, already dismissed, or unknown.
  - **`zalo_name`:** set on a new Zalo sign-in; refreshed on a later one without changing an edited `name`; set on link and change; cleared on unlink; merge keeps the right one. `me.user.zaloName` is exposed.
  - **`safeReturnTo`:** keeps `/trips?mergeReview=x`.
- **Web (jsdom):**
  - **`ProviderLogo`:** renders each provider, with the muted class.
  - **`SignInButtons`:** each button holds its provider's logo, and Google's G sits in the white square on the primary button.
  - **Rows:**
    - logo muted or full colour;
    - Zalo name or email subtitle, with the fallback;
    - **Gỡ** hidden with one method;
    - none of the removed note or nudge text;
    - the Google hint inside Zalo.
  - **Chip rows:** each status shows its chip; the row button carries `merge.rowLabel` and opens the sheet.
  - **`MergeSheet`:**
    - the steps and `aria-current` for each status;
    - the buttons for each status;
    - cancel and dismiss calls followed by a `['me']` reload, with the sheet closing;
    - a 404 closes quietly;
    - a 500 shows `InlineError` and the sheet stays open;
    - the confirm link is `/api/auth/{provider}/start?returnTo=%2Ftrips%3FmergeReview%3D{id}`;
    - a Google merge inside Zalo shows the hint.
  - **`MyTrips` + `mergeReview`:** auto-opens the matching request's confirmation sheet, shows the snackbar when nothing matches, and always removes the parameter.
  - The existing en/vi parity and `// REVIEW` tests cover the copy.
- **Existing tests the controller updates:** `linked-accounts.test.tsx` and `linked-accounts-zalo-off.test.tsx`, which check the removed note and nudge text.
- **Device check on the tunnel** (real Google and Zalo), added to the manual checklist:
  1. Signed in with Google, link a Zalo that already has its own account: the row shows **Chờ xác nhận**.
  2. Open the sheet and tap **Đăng nhập Zalo để xác nhận**: the confirmation sheet opens by itself.
  3. Tap **Gộp tài khoản**: the device is back on the Google account, and the row shows **Đã gộp**.
  4. Tap **Đã hiểu**: the chip disappears.
  5. Repeat steps 1–2, then decline: on returning to the Google account, the row shows **Bị từ chối**; **Đã hiểu** clears it, and **Liên kết lại** starts a new request.

## 5. Files

| Area | Files |
|---|---|
| API | new `apps/api/migrations/0007_merge_ux.sql`; edit `apps/api/src/db/schema.ts`, `auth/identity.ts`, `auth/me.ts`, `auth/accountRoutes.ts`, `auth/mergeUsers.ts` |
| Core | `packages/core/src/api-types.ts` |
| Web | new `components/ProviderLogo.tsx` (+ `.css`), `components/MergeSheet.tsx` (+ `.css`); edit `components/SignInButtons.tsx` (+ `.css`), `components/LinkedAccounts.tsx` (+ `.css`), `components/MergeRequestBanner.tsx` (`autoOpen`), `components/icons.tsx` (remove the placeholder `zalo` glyph), `screens/MyTrips.tsx`, `i18n/en.ts`, `i18n/vi.ts` |

## 6. Known limits

- A Zalo-only account no longer gets a written nudge to add Google. The muted Google row with **Liên kết** takes over that role. If its Zalo identity is lost, the account still can't be recovered (base spec §8).
- The Zalo name appears only after the next Zalo sign-in for accounts linked before `0007`; until then the row says "Đã liên kết".
- If the other account declines while this device is signed in to it (§3.4 step 5), the device stays on that account until you sign in again with your other method.
