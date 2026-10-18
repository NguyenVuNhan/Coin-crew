# User Profile, Group Admin Permissions, Sport Expense UX & Unified Transactions Ledger — Design

Date: 2026-10-17 · Status: draft for review · Builds on: [[2026-10-12-group-split-vietqr-design]] · [[2026-10-14-ui-ux-restructure-design]] · [[2026-10-16-sport-group-splitting-design]] · Overview: [[2026-10-13-idea-discussion-next-steps]] · Code: https://github.com/NguyenVuNhan/coin-crew (local `C:\repo\experience\coin-crew`)

---

## 1. Intent & Why

After using **CoinCrew (Tiền Đâu)** across standard trips and weekly sport groups, five practical friction points surfaced:

1. **Fragmented User Identity & Settings:** Logged-in users did not inherit their Google avatar on sign-in, could not upload/crop a custom avatar, and had personal settings (Bank details, Language) duplicated inside Group Settings instead of living in one place (their top-right User Avatar menu). Meanwhile, the Member Group View header lacked the user's avatar in the top-right corner.
2. **All-or-Nothing Member Permissions & Guest Identity Friction:** Previously, any signed-in member could approve any guest request (even bank details or identity claims), and guests could add arbitrary new names or rename themselves. Real groups need a **Group Admin** role (defaulting to the organiser and promotable by any admin) for sensitive group/identity approvals, while allowing any signed-in member involved in a guest's expense to approve that expense.
3. **Cluttered Sport Expense Form & Share Bill Preview:** Always showing all shuttlecock rows and the extra fee field took up vertical space when only court fees applied; the 44px checkbox wrapper squeezed player names; the slot drawer needed clearer separation between **"This player brings guest?"** (`♀` / `♂` guest counters) and **"Or want to set a fixed amount for {name}"**; and the Zalo text/QR preview block on `ExpenseDetails` duplicated information already inside the generated bill PNG.
4. **Long Scrolling Between Expenses & Payments:** In active groups, scrolling past dozens of expenses to reach payments made checking transfers tedious.
5. **Post-Payment Expense Edits & Separate `expenses` / `payments` Tables:** Updating an expense in-place after a participant had already paid overwrote the original record without preserving history or notifying the payer why their balance changed. Architecturally, `expenses` and `payments` are both ledger transactions; unifying them into a single append-only `transactions` table (`type: 'expense' | 'payment'`) simplifies balance/debt calculation, preserves full edit history with one-tap rollback (`↺`), and powers a one-time per-device update notification.

---

## 2. Goals, Non-Goals & Anti-Goals

### Goals
1. **User Profile, Avatar Cropper & Consolidated Header (`users`, `AccountMenu`, `MemberTrip`, `GuestTrip`):**
   - Store user basic info on `users`: `name` (required), `gender` (`'M' | 'F' | null`, required when creating or joining a `'sport'` group), `email` (from Google OAuth), `avatar` (Google `picture` URL by default on first sign-in, or a cropped 256×256 WebP/JPEG data URL), and approved `bank_details`.
   - Add an **Account & Profile** modal accessible from the top-right user avatar on both `MyTrips` and `MemberTrip`, with a Gmail-style circular pan + zoom avatar cropper (`<canvas>`), name input, gender selector (`M` / `F`), bank account editor, and language toggle.
   - Update `MemberTrip` header: shift the group title to the left next to the back arrow (`←`), and place the logged-in user's avatar in the top-right. Keep `GuestTrip` header unchanged (guests have no avatar and can sign in with Google).
   - Remove **Bank details** and **Language** from Group Settings (`Settings.tsx`).
   - Inherit the organiser's language when sharing a group link (`?lang=vi` / `?lang=en` or trip default), while keeping the language button in the `GuestTrip` footer so guests can switch language anytime.
2. **Group Admin Role & Two-Tier Guest Approval Matrix (`participants.is_admin`, `permissions.ts`):**
   - Add `isAdmin` (`integer('is_admin').notNull().default(0)`) to `participants`. The group creator (`organiserUserId`) is automatically a Group Admin (`isAdmin = 1`). Any Group Admin can promote another signed-in member (`userId !== null`) to Group Admin. A guest (`userId === null`) can never be a Group Admin.
   - Signed-in members can update their own profile, name, gender, avatar, and bank account immediately without approval.
   - Guests **cannot** add a new name to the group (`POST /api/trips/:id/people` is restricted to Group Admins) and **cannot** rename themselves directly—they must sign in with Google and claim their participant identity first.
   - **Expense approval:** Any signed-in member **involved in the guest's expense** (as `payerId` or in `shares`) OR any **Group Admin** can approve/reject a pending guest expense.
   - **Admin-only approvals:** Only a **Group Admin** can approve a guest's bank account submission (`kind: 'bank'`) or a guest's Google sign-in identity claim (`kind: 'membership'`, which also applies their account name/gender if updated).
3. **Refined Sport Add Expense View & Share Bill (`ExpenseForm.tsx`, `ExpenseDetails.tsx`):**
   - Show only the **Court (`Tiền sân`)** input initially, with `+ Add shuttlecock price` and `+ Add extra fee` buttons below it to reveal shuttlecock rows (up to 3, each removable with `×`) and the extra fee field on demand.
   - Tighten `.fsl-split-row__check-label` width/gap so player names get maximum horizontal space.
   - Each ticked player starts with `1` slot of their own gender (`1 M` or `1 F`); if they bring guests, their row badge and share reflect **the player themselves + their guests**.
   - Pressing **Edit** on a player row opens a two-part drawer:
     1. `"This player brings guest?"` with Female (`♀`) and Male (`♂`) guest counters (`0..20`) below it (plus a quick swap to `1♀` for a male player paying the female slot rate).
     2. `"Or want to set a fixed amount for {player name}"` with a VND input below it.
   - Group Admins can press/hold (or click the info/gender badge on) a player in the split list to view their info and quick-update their gender (`M` / `F`).
   - Use **Shuttlecocks** (`Tiền cầu`) as the label (removing `/ Balls`) and remove the redundant "Zalo message & bill card" preview section from `ExpenseDetails.tsx`, keeping the breakdown table and the primary **Share bill & QR** button.
4. **Group View 2-Tab Switcher & Group Settings Cleanup (`MemberTrip.tsx`, `GuestTrip.tsx`, `ViewOnlyTrip.tsx`, `Settings.tsx`, `LanguageButton.tsx`):**
   - Keep the Balance hero card and "Your transfers" at the top of the Group View, and place a **2-tab segmented switcher (`Expenses` | `Payments`)** below them (with the `Show mine` / `Show all` filter chip inside the active tab).
   - Display the current language label (`Tiếng Việt` / `English`) alongside the globe icon in `LanguageButton.tsx`.
   - Default `fewestTransfers` to `0` (`false`) when creating a group.
   - Rename `Trip settings` / `Archive trip` copy to `Group settings` / `Archive group`, and keep archiving restricted to the group organiser (`isOrganiser`).
5. **Unified `transactions` Table, Append-Only Edit History, Icon-Only Rollback (`↺`) & One-Time Update Notification:**
   - Unify `expenses` + `expense_shares` + `payments` into `transactions` + `transaction_shares` (`type: 'expense' | 'payment'`).
   - Make expense edits and rollbacks **append-only**: editing an expense marks the previous active row as `'superseded'` (`isLatest = 0`) and inserts a new active head row (`isLatest = 1`) linked via `rootId` and `parentId`.
   - In `ExpenseDetails.tsx`, display the **Edit history** list without version numbers (`v1`, `v2`, etc.)—simply show the updated content summary, actor/timestamp, and an **icon-only rollback button (`↺`)** on each prior entry. Rolling back creates a new head row (treated as a normal expense update, never deleting history).
   - Notify guests/members **once per device** when a transaction involving them is updated, with a one-tap filter/modal to view all updated transactions.

### Non-Goals
- Sport type selector and sport-specific custom bill templates (noted in the Obsidian roadmap for a future iteration).
- Automated tips for enabling `fewestTransfers` (noted for a future iteration).
- External object storage (R2/S3) for avatars—avatars are cropped client-side to a compact `<= 35 KB` data URL stored directly in D1 `users.avatar_url`.

### Anti-Goals
- Overwriting or deleting historical transaction rows on edit or rollback.
- Showing version numbers (`v1`, `v2`, `v3`) in the Expense History UI.

---

## 3. Global Constraints

- **Zero new npm dependencies.**
- **Cloudflare Workers + D1 limits:** Subqueries must be used instead of large `inArray(..., ids)` lists to stay well under D1's 100 bound parameters per query limit.
- **Whole-VND integer math (`@fsl/core`):** All currency amounts are whole VND integers (`parseVnd`, `formatVnd`).
- **Accessibility & UI polish:** CSS custom properties from `apps/web/src/styles/tokens.css`, Lucide SVG icons in `apps/web/src/components/icons.tsx`, `>= 44x44px` interactive targets (except compact inline checkboxes whose row label remains `>= 44px` tall), WCAG 2.2 AA contrast, and zero horizontal overflow at `375px`, `768px`, and `1280px`.
- **i18n parity:** Every new or updated key in `apps/web/src/i18n/en.ts` has a matching entry in `apps/web/src/i18n/vi.ts` ending with `// REVIEW`.

---

## 4. Detailed Design

### 4.1 User Profile, Avatar Cropper, Header Layout & Language Inheritance

#### 4.1.1 Database & Auth (`users`, `/api/auth/google/callback`, `/api/me`)
1. **`users` table additions (`0002_unified_transactions_and_profiles.sql`):**
   - `gender: text('gender', { enum: ['M', 'F'] })` (nullable; required when creating a sport group or claiming a participant in a sport group).
   - `avatarUrl: text('avatar_url')` (nullable; stores the Google `picture` URL or a client-cropped `data:image/webp;base64,...` / `data:image/jpeg;base64,...` string up to `60_000` chars).
   - `customProfile: integer('custom_profile').notNull().default(0)` (`1` once the user manually edits their name or avatar in CoinCrew so subsequent Google sign-ins do not overwrite their custom name or avatar; if `avatarUrl` is still `null` on sign-in, populate it from Google's `picture` claim).
2. **`GET /api/me` response (`MeView`):**
   ```ts
   export interface MeView {
     id: string;
     email: string;
     name: string;
     gender: Gender | null;
     avatarUrl: string | null;
     consentAt: string | null;
     bank: { bin: string; bankName: string; accountNumber: string; holderName: string } | null;
   }
   ```
3. **`PATCH /api/me` endpoint:**
   - Allows a signed-in user to update `{ name?: string; gender?: 'M' | 'F' | null; avatarUrl?: string | null }`.
   - Validates `name` (`1..40` chars trimmed), `gender` (`'M' | 'F' | null`), and `avatarUrl` (either `null`, an `https://` URL, or a `data:image/(webp|jpeg|png);base64,...` string with length `<= 60_000`).
   - Sets `customProfile = 1` when `name` or `avatarUrl` is updated.
   - Also propagates `name` (and `normalizedName`) and `gender` to all active `participants` rows where `participants.userId = user.id`, bumping `trips.version` on affected trips so the user's updated name/gender/avatar appears across their groups immediately without admin approval.

#### 4.1.2 Gmail-Style Avatar Cropper & User Settings Modal (`AccountMenu.tsx`, `AvatarCropModal.tsx`)
1. **Avatar display (`Avatar.tsx`):**
   - Extend `<Avatar name={...} avatarUrl={...} />`: when `avatarUrl` is provided, render `<img src={avatarUrl} alt="" className="fsl-avatar__img" />` inside the circular avatar container; otherwise fall back to the deterministic initials circle.
2. **User Settings Modal (`AccountMenu.tsx`):**
   - Clicking the top-right user avatar on `MyTrips` or `MemberTrip` opens the **Account Settings** dialog/popover containing:
     - **Avatar & Change photo button:** Opens `AvatarCropModal` when a local image file (`image/*`) is selected.
     - **Profile fields:** `Name` (required), `Gender` (`Nam` / `Nữ` segmented pill), `Email` (read-only Gmail address from Google sign-in), and `Bank account` (selecting bank BIN, account number, holder name via `PUT /api/me/bank`).
     - **Language switcher:** `LanguageButton` showing `Tiếng Việt` / `English`.
     - **Sign out** button.
3. **Avatar Cropper (`AvatarCropModal.tsx`):**
   - Renders a `240×240px` viewport with a circular mask overlay.
   - Supports pointer drag (`onPointerDown` / `onPointerMove` / `onPointerUp`) to pan `(offsetX, offsetY)` and a zoom range slider (`1.0x` to `3.0x`).
   - On **Save photo**, draws the cropped region onto a `256×256` `<canvas>` and exports `canvas.toDataURL('image/webp', 0.82)` (falling back to `'image/jpeg'` if WebP encoding isn't supported), then saves via `PATCH /api/me`.

#### 4.1.3 Header Layout & Language Inheritance (`MemberTrip.tsx`, `GuestTrip.tsx`, `Settings.tsx`)
1. **`MemberTrip.tsx` Header:**
   - Left side: Back button (`←`) immediately followed by the group title (`<h1 className="fsl-detail-header__title">{view.trip.name}</h1>`), left-aligned.
   - Right side: `+ Invite` button, `⚙` (`Group settings`) icon button, and `<AccountMenu />` (the signed-in user's clickable avatar, in the exact same top-right position as on `MyTrips.tsx`).
2. **`GuestTrip.tsx` Header:**
   - Remains unchanged: guests do not have an avatar or top-right account menu. They see the `Sign in with Google` banner/action to claim their identity.
3. **Settings Consolidation (`Settings.tsx`):**
   - Remove the **Bank account** section and **Language** section from `Settings.tsx` (both now live exclusively in the signed-in user's `AccountMenu`, while guests manage their bank via the prompt on `GuestTrip` and switch language in the `GuestTrip` footer).
4. **Organizer Language Inheritance on Shared Links (`trips.default_lang`, `InviteModal.tsx`, `JoinRedirect.tsx`):**
   - Add `defaultLang: text('default_lang', { enum: ['en', 'vi'] }).notNull().default('vi')` to `trips` (populated from the organiser's active language when creating the group or updated when an admin shares).
   - Also append `?lang={lang}` when copying/sharing the invite link in `InviteModal.tsx` / `remind.ts`.
   - When a guest opens `/j/:token` or `/v/:token` (or loads `TripView` where `trip.defaultLang` is present) and has **Not** explicitly picked a language on this device (`localStorage.getItem('fsl_lang_manual') !== '1'`), initialize their UI language to the `?lang=` query param or `view.trip.defaultLang`. Tapping the `LanguageButton` in the `GuestTrip` footer sets `fsl_lang_manual = '1'` so the guest's manual choice is respected thereafter.

---

### 4.2 Group Admin Role & Two-Tier Permission Matrix

#### 4.2.1 Group Admin Data Model (`participants.is_admin`, `PersonView.isAdmin`, `TripView.me.isAdmin`)
- In `participants`: add `isAdmin: integer('is_admin').notNull().default(0)`.
- On `POST /api/trips`: the organiser's participant row is inserted with `isAdmin: 1`.
- Backfill in migration `0002`: `UPDATE participants SET is_admin = 1 WHERE user_id = (SELECT organiser_user_id FROM trips WHERE trips.id = participants.trip_id);`
- Expose `isAdmin: boolean` on `PersonView` and `TripView['me']` (`actor.isAdmin` is `true` iff `actor.kind === 'member'` and `(participant.isAdmin === 1 || trip.organiserUserId === user.id)`).
- **Promote to Admin endpoint (`POST /api/trips/:id/people/:pid/admin`):**
  - Callable only by a current Group Admin (`actor.isAdmin === true`).
  - Target participant `:pid` must belong to the trip, have `status === 'active'`, and be a signed-in member (`userId !== null`). Guests (`userId === null`) cannot be promoted (`422 VALIDATION`).
  - Sets `participants.isAdmin = 1` and logs activity `'admin_promoted'`.

#### 4.2.2 Permission Rules (`packages/core/src/permissions.ts`)
| Action | Who Can Perform It |
| :--- | :--- |
| **Update own account / name / gender / avatar / bank** | Any signed-in member (`PATCH /api/me`, `PUT /api/me/bank`) — takes effect immediately, **no approval needed**. |
| **Add new participant to group (`POST /api/trips/:id/people`)** | **Group Admin only** (`actor.isAdmin`). Guests **cannot** add new names to the participant list (`WhoAreYou.tsx` shows only the existing participant roster for guests to pick from). |
| **Guest rename** | Guests **cannot** rename themselves directly. To change their name, a guest must sign in with Google and claim their participant slot (`POST /api/trips/:id/claim`). |
| **Claim guest identity with Google (`POST /api/trips/:id/claim`)** | A signed-in user who is not yet a member of the group selects their existing guest participant slot (`participantId`) and optionally provides their updated `name` and `gender` (required if `trip.preset === 'sport'`). Creates a `membership_requests` row (`status: 'pending'`). |
| **Approve guest identity claim (`POST /api/trips/:id/membership/:reqId/approve`)** | **Group Admin only** (`actor.isAdmin`). Links `participants.userId = req.userId`, updates `participants.name` / `gender` from the user's profile, and migrates any approved user bank details. |
| **Approve guest bank account (`POST /api/trips/:id/bank/:bankId/approve`)** | **Group Admin only** (`actor.isAdmin`). |
| **Approve / reject pending guest expense (`POST /api/trips/:id/expenses/:eid/approve` or `reject`)** | Any **signed-in member involved in the expense** (`expense.payerId === actor.participantId` or `expense.shares.some(s => s.participantId === actor.participantId)`) **OR** any **Group Admin** (`actor.isAdmin`). Non-admin members who are not involved in the expense cannot approve it (`403 FORBIDDEN`, and it is omitted from their `view.approvals` list). |
| **Quick-edit participant gender / info (`PATCH /api/trips/:id/people/:pid`)** | **Group Admin** (`actor.isAdmin`) for any participant in the group, or a signed-in member for themselves. |
| **Manage group roster (merge, remove person, regenerate links, set fewest transfers)** | **Group Admin** (`actor.isAdmin`). |
| **Archive group (`POST /api/trips/:id/archive`)** | **Group Organiser only** (`actor.isOrganiser`). |

---

### 4.3 Sport Add Expense View & Share Bill (`ExpenseForm.tsx`, `ExpenseDetails.tsx`)

1. **Dynamic Session Cost Inputs (`ExpenseForm.tsx`):**
   - Initially render only the **Court (`Tiền sân`)** input row.
   - Directly below it, render two compact action pills:
     - `+ Add shuttlecock price` (`+ Thêm tiền cầu`): reveals the Shuttlecocks (`Tiền cầu`) section with `1` row (`qty × unitPrice`). While visible, up to 3 shuttlecock rows can be added via `+ Add shuttlecock price`, and each row has an `×` button to remove it (removing the last row hides the Shuttlecocks section again and resets its subtotal to `0`).
     - `+ Add extra fee` (`+ Thêm phụ phí`): reveals the Extra fee (`Phụ phí`) input row with an `×` button to remove/hide it.
   - When editing an existing sport expense (`meta.sport`), automatically expand Shuttlecocks if `meta.sport.shuttlecocks.length > 0` and Extra fee if `meta.sport.extra > 0`.
2. **Compact Checkbox & Full-Width Player Name (`components.css`, `ExpenseForm.tsx`):**
   - Change `.fsl-split-row__check-label` from `width: 44px; justify-content: center;` to `width: auto; padding-right: var(--space-1); justify-content: flex-start;` and reduce `.fsl-split-row` horizontal gap to `var(--space-2)` so the player's name gets maximum horizontal width without truncation.
3. **Player Slot Model & Two-Part Edit Drawer (`ExpenseForm.tsx`):**
   - Every ticked player starts with **1 base slot of their own gender** (`baseMale = person.gender === 'F' ? 0 : 1`, `baseFemale = person.gender === 'F' ? 1 : 0`).
   - A player's total slots in `SportParticipantEntry` are `maleSlots = baseMale + guestMaleSlots` and `femaleSlots = baseFemale + guestFemaleSlots` (unless they use the single-tap swap to pay the opposite gender's rate, or set a fixed VND override).
   - When `guestMaleSlots + guestFemaleSlots > 0`, the row's slot pill displays the combined slots (e.g., `1M + 1♀ 1♂ (3 slots)` / `3 suất (1 Nữ, 2 Nam)`) and the row's calculated VND share covers **the player + their guests**.
   - Tapping the **Edit** button (or share pill) on a ticked player row toggles open a clean inline drawer with two clearly labeled sections:
     - **Section 1:** Header `"This player brings guest?"` (`"Người chơi này có dẫn khách?"`), followed by two stepper rows below it:
       - `♀ Female guest` (`Khách Nữ`): `−` / count / `+` (`0..20`)
       - `♂ Male guest` (`Khách Nam`): `−` / count / `+` (`0..20`)
     - **Section 2:** Header `"Or want to set a fixed amount for {player.name}"` (`"Hoặc đặt số tiền cố định cho {player.name}"`), followed by the VND input below it (with a `Clear` / `×` button when set).
4. **Admin Press/Hold (or Info Tap) Quick-View & Gender Edit (`ExpenseForm.tsx`):**
   - When `view.me.isAdmin` is `true`, long-pressing (`500ms` pointer press on touch) or clicking the gender/info chip next to a player's name in `ExpenseForm.tsx` opens a lightweight popover/modal showing that player's name, membership status (`Member` / `Guest`), and a `Nam (M)` / `Nữ (F)` segmented selector that saves immediately via `PATCH /api/trips/:id/people/:pid` and updates their default slot gender in the form.
5. **Share Bill Cleanup (`ExpenseDetails.tsx`, `en.ts`, `vi.ts`):**
   - Update all Shuttlecocks labels from `"Shuttlecocks / Balls"` (`"Tiền cầu / bóng"`) to **"Shuttlecocks"** (`"Tiền cầu"`).
   - In `ExpenseDetails.tsx`, remove the `"Zalo message & bill card"` preview card (the `msgText` gray box and the inline QR preview footer block). Keep the session breakdown table and the primary **"Share bill & QR"** (`"Chia sẻ bill & QR"`) button (plus **"Copy message"** as a quiet secondary action) right below the breakdown table.

---

### 4.4 Group View 2-Tab Switcher & Settings Updates

1. **2-Tab Segmented Switcher (`MemberTrip.tsx`, `GuestTrip.tsx`, `ViewOnlyTrip.tsx`):**
   - Below the Balance hero card, Pending Approvals (if any), and "Your transfers" section, render a 2-tab segmented bar (`role="tablist"`):
     - **Tab 1 (Default): `Expenses ({count})`** — renders the `Show mine` / `Show all` filter chip (when the actor is a participant) and the list of expenses.
     - **Tab 2: `Payments ({count})`** — renders the `Show mine` / `Show all` filter chip and the list of recorded payments.
2. **Settings & Language Button (`LanguageButton.tsx`, `Settings.tsx`, `trips/routes.ts`):**
   - **`LanguageButton.tsx`:** Render both `<Icon name="globe" size={16} />` and the visible language name (`lang === 'vi' ? 'Tiếng Việt' : 'English'`) inside the button so users immediately recognize it as the language switcher.
   - **`fewestTransfers` Default (`schema.ts`, `trips/routes.ts`):** Change the default value of `trips.fewestTransfers` from `1` to `0` in `schema.ts` and `POST /api/trips` (`fewestTransfers: 0`), so new groups default to pairwise transfers (`fewestTransfers: false`).
   - **Group Settings Copy & Archive Permission (`Settings.tsx`, `en.ts`, `vi.ts`):**
     - Rename `"Trip settings"` / `"Archive trip"` to **"Group settings"** (`"Cài đặt nhóm"`) / **"Archive group"** (`"Lưu trữ nhóm"`).
     - Only show/enable the **Archive group** button when `view.me.isOrganiser === true`.

---

### 4.5 Unified `transactions` Ledger, Edit History/Rollback & Update Notification

#### 4.5.1 Unified `transactions` + `transaction_shares` Schema (`0002_unified_transactions_and_profiles.sql`)
Expenses and payments are unified into a single `transactions` table and `transaction_shares` table:

```ts
export const transactions = sqliteTable(
  'transactions',
  {
    id: text('id').primaryKey(),
    /** Stable chain identifier across edits/rollbacks. Equals `id` on initial creation. */
    rootId: text('root_id').notNull(),
    /** Previous transaction row `id` that this edit/rollback superseded (`null` for initial creation). */
    parentId: text('parent_id'),
    /** 1 for the current active head of the chain; 0 for historical rows superseded by an edit/rollback. */
    isLatest: integer('is_latest').notNull().default(1),
    tripId: text('trip_id').notNull(),
    type: text('type', { enum: ['expense', 'payment'] }).notNull(),
    description: text('description').notNull().default(''),
    /** For expenses: total bill amount. For payments: amountClaimed. */
    amount: integer('amount').notNull(),
    /** For payments: confirmed amount once confirmed (nullable). */
    amountConfirmed: integer('amount_confirmed'),
    currency: text('currency').notNull().default('VND'),
    spentOn: text('spent_on').notNull(),
    /** For expenses: payer_id. For payments: from_id (sender). */
    payerId: text('payer_id').notNull(),
    /** For payments: to_id (recipient). Null for expenses. */
    toId: text('to_id'),
    splitMode: text('split_mode').notNull().default('equal'),
    status: text('status', {
      enum: ['approved', 'pending', 'rejected', 'disabled', 'superseded', 'says_paid', 'confirmed'],
    }).notNull(),
    rejectReason: text('reject_reason'),
    notArrivedAt: text('not_arrived_at'),
    disabledByUserId: text('disabled_by_user_id'),
    createdByParticipantId: text('created_by_participant_id').notNull(),
    createdByDevice: text('created_by_device'),
    confirmedByParticipantId: text('confirmed_by_participant_id'),
    metaJson: text('meta_json'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    index('transactions_trip_id_idx').on(t.tripId),
    index('transactions_root_id_idx').on(t.rootId),
  ],
);

export const transactionShares = sqliteTable(
  'transaction_shares',
  {
    transactionId: text('transaction_id').notNull(),
    participantId: text('participant_id').notNull(),
    inputValue: integer('input_value').notNull(),
    amount: integer('amount').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.transactionId, t.participantId] }),
    index('transaction_shares_participant_id_idx').on(t.participantId),
  ],
);
```

- **Data Migration in `0002_unified_transactions_and_profiles.sql`:**
  - Copies all existing rows from `expenses` into `transactions` (`type = 'expense'`, `root_id = id`, `parent_id = NULL`, `is_latest = 1`) and `expense_shares` into `transaction_shares`.
  - Copies all existing rows from `payments` into `transactions` (`type = 'payment'`, `root_id = id`, `parent_id = NULL`, `is_latest = 1`, `payer_id = from_id`, `to_id = to_id`, `amount = amount_claimed`, `spent_on = substr(created_at, 1, 10)`, `created_by_participant_id = recorded_by_participant_id`, `created_by_device = recorded_by_device`) and inserts a corresponding recipient share row into `transaction_shares` (`transaction_id = id`, `participant_id = to_id`, `input_value = amount_claimed`, `amount = COALESCE(amount_confirmed, amount_claimed)`).
  - Drops legacy `expense_shares`, `expenses`, and `payments` tables after copying.

#### 4.5.2 Unified Balance & Transfer Calculation (`@fsl/core` & `snapshot.ts`)
- Both expenses and payments now have the exact same accounting structure in `transactions` + `transaction_shares`:
  - The transaction's `payerId` is credited `+effectiveAmount` (where `effectiveAmount = tx.type === 'payment' ? (tx.amountConfirmed ?? tx.amount) : tx.amount`).
  - Each row in `transaction_shares` debits `share.participantId` by `-share.amount`.
- **Consistent `says_paid` handling when an expense is updated after payment:**
  - Only rows with `isLatest === 1` participate in current balances and transfer suggestions (`status === 'superseded'` rows are historical).
  - In `snapshot.ts`, `balances` and `suggestions` (`suggestTransfers` and `pairwiseTransfers`) both use the unified ledger. In `TripView.myBalance`, `now` reflects confirmed balances, `waitingConfirm` shows any in-flight `says_paid` outgoing transfers, and if an expense is edited after a payment was already confirmed (or `says_paid`), the new net difference (`newShare - paidAmount`) automatically appears as a remaining transfer in `suggestions` and `balances`!

#### 4.5.3 Append-Only Expense Edit & Rollback (`PATCH /api/trips/:id/expenses/:eid`, `POST /api/trips/:id/expenses/:eid/rollback`)
1. **Editing an Expense (`PATCH /api/trips/:id/expenses/:eid`):**
   - Look up the active head row where `(id = :eid OR rootId = :eid) AND isLatest = 1 AND type = 'expense'`.
   - Permission check: any signed-in member can edit an approved/pending expense; a guest can edit their own pending expense.
   - Instead of mutating the existing row in place:
     1. Update the old head row: `SET status = 'superseded', is_latest = 0, updated_at = now`.
     2. Insert a **new** row into `transactions` with a new `id`, `rootId = oldRow.rootId`, `parentId = oldRow.id`, `isLatest = 1`, `createdByParticipantId = actor.participantId`, `createdAt = now`, `updatedAt = now`, and the new `description, amount, spentOn, payerId, splitMode, metaJson`.
     3. Insert the new shares into `transaction_shares`.
     4. Record activity `'expense_edited'` and bump `trips.version`.
   - Return `{ expenseId: newId, rootId: oldRow.rootId }`.
2. **Rolling Back an Expense (`POST /api/trips/:id/expenses/:eid/rollback`):**
   - Request body: `{ targetHistoryId: string }`.
   - Look up the current head row (`(id = :eid OR rootId = :eid) AND isLatest = 1`) and the target historical row (`id = targetHistoryId AND rootId = headRow.rootId AND isLatest = 0`).
   - Permission check: any signed-in member (same as editing an approved expense).
   - Creates a **new** transaction row at the head of the chain copying `description, amount, spentOn, payerId, splitMode, metaJson` and `transaction_shares` from `targetHistoryId`, marks the previous head row as `status = 'superseded', is_latest = 0`, and sets `parentId = headRow.id, rootId = headRow.rootId, isLatest = 1`.
   - Never deletes any history rows—rolling back is simply recorded as another update at the top of the history list.
3. **Expense History in `ExpenseView` & UI (`ExpenseDetails.tsx`):**
   - `ExpenseView` includes:
     ```ts
     export interface ExpenseHistoryItem {
       id: string;
       description: string;
       amount: number;
       spentOn: string;
       payerId: string;
       mode: SplitMode;
       createdById: string;
       createdAt: string;
       shares: { participantId: string; amount: number; inputValue: number }[];
       meta?: ExpenseMeta | null;
     }
     ```
     and `rootId: string; history: ExpenseHistoryItem[];` (ordered newest-first).
   - **UI in `ExpenseDetails.tsx`:**
     - Only shown when `expense.history.length > 0`.
     - **No version numbers (`v1`, `v2`, `v3`) are displayed anywhere.**
     - Each row in the **History** section shows:
       - The updated content summary: formatted total amount (`formatVnd(item.amount)`), description/breakdown summary (e.g., `Court 240k · Shuttlecocks 120k` or payer + split summary, plus the actor's own share on that entry if applicable), and `{actorName} · {timestamp}`.
       - For every prior entry (`item` in `expense.history`), an **icon-only rollback button** on the right rendering the Lucide `rotate-ccw` (`↺`) SVG icon (`aria-label={t('expense.rollback')}`, `title={t('expense.rollback')}`) with no button text.

#### 4.5.4 One-Time Per-Device Notification for Updated Transactions (`UpdatedTransactionsBanner.tsx`)
1. **Detection:**
   - An active expense (`e.status === 'approved'`) is considered **updated for the current user/guest** if:
     - `e.history.length > 0` (it has been edited or rolled back at least once), AND
     - `me.participantId !== null` is involved in the expense (either in current `e.shares`, `e.payerId`, or in any `h.shares` / `h.payerId` in `e.history`), AND
     - The latest edit was not made by `me.participantId` (`e.createdById !== me.participantId`), AND
     - This device has not yet dismissed/viewed version `e.id` in `localStorage` (`fsl_seen_tx_updates_${trip.id}`, which stores a JSON array of seen transaction head `id`s).
2. **One-Time Banner & Modal/Filter View:**
   - When 1 or more unseen updated expenses exist for the current participant on this device, display a prominent alert banner at the top of `GuestTrip` / `MemberTrip`:
     - Copy: `"Transactions involving you were updated"` (`"Có giao dịch liên quan đến bạn vừa được cập nhật"`), showing the count and net impact.
     - Actions:
       - **"View updated transactions"** (`"Xem giao dịch cập nhật"`): opens a modal (or filters the `Expenses` tab) listing all updated expenses with their before → after share diff (`Previous: 55.000₫ → Now: 65.000₫`) and a link to open each expense's details & history. Opening or dismissing marks those `e.id`s as seen in `localStorage` (`fsl_seen_tx_updates_${trip.id}`) so the notification appears **only once per update on each device**.

---

## 5. Summary of Database & File Changes

| Area | Files Touched |
| :--- | :--- |
| **D1 Schema & Migration** | `apps/api/src/db/schema.ts`, `apps/api/migrations/0002_unified_transactions_and_profiles.sql` |
| **Core Logic & Types** | `packages/core/src/api-types.ts`, `packages/core/src/permissions.ts`, `packages/core/src/balances.ts`, `packages/core/src/transfers.ts` |
| **API Routes & Snapshot** | `apps/api/src/auth/routes.ts`, `apps/api/src/me/routes.ts`, `apps/api/src/trips/routes.ts`, `apps/api/src/trips/snapshot.ts`, `apps/api/src/trips/view.ts`, `apps/api/src/participants/routes.ts`, `apps/api/src/expenses/routes.ts`, `apps/api/src/payments/routes.ts`, `apps/api/src/bank/routes.ts` |
| **Web Components & Screens** | `apps/web/src/components/Avatar.tsx`, `apps/web/src/components/AccountMenu.tsx`, `apps/web/src/components/AvatarCropModal.tsx`, `apps/web/src/components/LanguageButton.tsx`, `apps/web/src/screens/MemberTrip.tsx`, `apps/web/src/screens/GuestTrip.tsx`, `apps/web/src/screens/ViewOnlyTrip.tsx`, `apps/web/src/screens/ExpenseForm.tsx`, `apps/web/src/screens/ExpenseDetails.tsx`, `apps/web/src/screens/Settings.tsx`, `apps/web/src/screens/WhoAreYou.tsx`, `apps/web/src/screens/People.tsx`, `apps/web/src/i18n/en.ts`, `apps/web/src/i18n/vi.ts` |

---

## 6. What's Left to the Builder

- Exact pointer math inside `AvatarCropModal.tsx` for clamping pan offsets `(offsetX, offsetY)` to the scaled image bounds and graceful fallback in JSDOM tests where `<canvas>` 2D context returns `null`.
- Internal state layout in `ExpenseForm.tsx` for mapping `guestMaleSlots` / `guestFemaleSlots` to `SportParticipantEntry.maleSlots` / `femaleSlots` while preserving backward compatibility with previously saved `ExpenseSportMeta` rows.
- Visual layout details of the "Updated transactions" modal/filter list when the user taps **"View updated transactions"** on the one-time device banner.
