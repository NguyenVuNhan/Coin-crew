# Sport Session Planning Mode Design (`#83`)

- **Date:** 2026-11-08
- **Issue:** [NguyenVuNhan/Coin-crew#83](https://github.com/NguyenVuNhan/Coin-crew/issues/83)
- **Future Follow-up:** [NguyenVuNhan/Coin-crew#87](https://github.com/NguyenVuNhan/Coin-crew/issues/87) (Track participant attendance reliability)

---

## 1. Intent & Why

Before a badminton/sport session happens, the group admin polls the Zalo group for headcount, books the courts (typically on Alobo `datlich.alobo.vn`), and posts a confirmation message to the Zalo group with:
1. Where and when the group is playing (venue, address, Google Maps link, booked court numbers & time slots).
2. The list of people signed up (`TÊN | NỮ | NAM` and `TỔNG SUẤT`).
3. Proof of court booking.

Today, CoinCrew only supports finalized expenses with positive costs (`amount > 0`) and always renders the 4-column bill table (`TÊN | NỮ | NAM | THÀNH TIỀN`), cost breakdown rows (`CHI PHÍ`, `MỖI SUẤT`), and VietQR code. As a result, admins have to create a fake/dummy transaction and manually crop the right-hand money column and bottom payment section out of screenshots before posting to Zalo.

**Sport Session Planning Mode** lets admins create a planned session directly from the floating `+` button, attach/extract court booking details, share a clean schedule + headcount card (with optional side-by-side booking proof collage) and Zalo message without any payment clutter, and later transition that exact same session into the finalized bill once the game wraps up.

---

## 2. Goals, Non-Goals & Anti-Goals

### Goals
- **Reusable Group Locations:** Allow admins/members in sport groups to save and reuse court venues (`Name` and `Address` required; `Phone`, `Google Maps link`, and `Notes` optional).
- **Optional AI Screenshot Extraction (Env-Gated):** When `GEMINI_API_KEY` is configured on the API Worker, display a **"✨ Đọc từ ảnh đặt sân"** (`Auto-fill from booking screenshot`) action that extracts venue details, date, booked court slots, booking code, total hours, and court fee from an Alobo/booking screenshot. When the env variable is absent, hide this AI extraction control completely.
- **Unified Expense Mechanism:** Store and display planned sessions in the existing `transactions` table and `ExpenseList` / `ExpenseDetails` flow so version history, rollbacks, and deep links (`/t/:tripId/expenses/:id` and `/j/:token/e/:id`) work identically to regular expenses.
- **Zero Balance Impact While Planning:** Planned sessions must not affect member balances, settlement suggestions, group fund balances, or payment reminder notifications until completed.
- **Cropping-Free Planning Share (Style A & Style B):**
  - **Style A (Default):** Render a 1080px PNG card with the session header, venue/court schedule block, and a **3-column headcount table** (`TÊN | NỮ | NAM` + `TỔNG SUẤT`), omitting `THÀNH TIỀN`, `CHI PHÍ`, `MỖI SUẤT`, and VietQR.
  - **Style B (Toggleable when booking image attached):** Stitch the attached booking screenshot side-by-side with the 3-column headcount table + header so admins can include visual court grids or raw Alobo proof when desired.
  - Generate an accompanying Zalo text message (`sportPlanningShareText`) with venue, address, Google Maps link, booked courts/time slots, total slots (`Nữ`/`Nam`), and session link.
- **Seamless Transition to Completed Bill:** After the session, the admin taps **Hoàn tất & Tính tiền** (`Complete & split bill`), updates who actually attended, adds shuttlecock/extra fees to the pre-filled court cost, and saves—creating a new immutable version (`isLatest = 1`, `parentId = planningRow.id`) that becomes a normal approved sport expense with full payment/VietQR sharing.

### Non-Goals
- **Embedded Interactive Map SDKs:** No Google Maps JS SDK or Leaflet embed in v1; admins paste a Google Maps URL (`maps.app.goo.gl` or `google.com/maps`).
- **In-App Attendance Voting / Polling:** Admins still collect votes in Zalo and enter the headcount into the planning session.
- **Attendance Reliability Penalties:** Tracking no-show penalties is deferred to [#87](https://github.com/NguyenVuNhan/Coin-crew/issues/87); however, immutable version history on completion naturally preserves the planned vs. actual participant lists in the database.
- **External Blob Storage (Cloudflare R2):** Do not require a new R2 bucket binding; attached booking screenshots are compressed client-side to lightweight WebP data URLs (`<= 60 KB`) stored in `metaJson`.

### Anti-Goals
- **Violating "The Friendly Ledger" ([`.impeccable/design.json`](file:///C:/Users/NvN/orca/workspaces/coin-crew/epic-phase-1-group-split-vietqr-hardening/.impeccable/design.json)):** Never use money-state colours (Leaf, Lychee, Turmeric) for decorative planning banners or badges; never nest cards inside cards; never use raw hex colours in components or drop below 44px touch targets / 16px input font size.

---

## 3. Data Model & Backend API

### 3.1 Permissions & Admin Scope (`libs/shared/core/src/permissions.ts`)
- Add action `'plan_session'` to `Action` in [`libs/shared/core/src/permissions.ts`](file:///C:/Users/NvN/orca/workspaces/coin-crew/epic-phase-1-group-split-vietqr-hardening/libs/shared/core/src/permissions.ts), granted to group admins (`isMember && isAdmin`, where `isAdmin = Boolean(actor.isAdmin) || actor.isOrganiser`).
- Creating a planning session, managing saved locations (`trip_locations`), calling the AI booking extractor (`POST /api/trips/:id/sport-booking/extract`), and editing or completing a planning session (`isPlanningExpense(head) === true`) require `can(actor, 'plan_session')` (any group admin in the sport group, not guests or non-admin members).
- Extend `ActionContext` with `isPlanning?: boolean`. In `can(actor, 'edit_expense' | 'delete_expense', ctx)`, if `ctx.isPlanning === true`, return `isMember && isAdmin` so any co-admin in the group can update or complete a planned session. When an admin completes a planning session via `PATCH /trips/:id/expenses/:eid`, the new completed head records `createdByParticipantId: actor.participantId!`, after which standard creator-only `edit_expense` rules apply to the finalized bill.

### 3.2 Saved Group Locations (`trip_locations` Table)
Add a new D1 table `trip_locations` in [`libs/api/db/src/schema.ts`](file:///C:/Users/NvN/orca/workspaces/coin-crew/epic-phase-1-group-split-vietqr-hardening/libs/api/db/src/schema.ts):
- `id`: `text('id').primaryKey()`
- `tripId`: `text('trip_id').notNull()` (indexed by `tripId`)
- `name`: `text('name').notNull()` (1–120 chars, required)
- `address`: `text('address').notNull()` (1–200 chars, required)
- `phone`: `text('phone')` (optional, max 30 chars)
- `mapUrl`: `text('map_url')` (optional, max 500 chars; must be `http://` or `https://` URL when provided)
- `notes`: `text('notes')` (optional, max 200 chars)
- `createdAt`: `text('created_at').notNull()`
- `updatedAt`: `text('updated_at').notNull()`

Expose `locations: TripLocationView[]` on `TripSnapshot` / `TripView` (empty array for non-sport trips or when none exist).

**Location Endpoints (`apps/api/src/trips/locations.ts`):**
- `POST /api/trips/:id/locations` — Create a saved location (requires `can(actor, 'plan_session')`).
- `PATCH /api/trips/:id/locations/:locationId` — Update a saved location (requires `can(actor, 'plan_session')`).
- `DELETE /api/trips/:id/locations/:locationId` — Delete a saved location (requires `can(actor, 'plan_session')`).

### 3.3 `ExpenseSportMeta` Extensions (`libs/shared/core/src/api-types.ts`)
Extend `ExpenseSportMeta` to support planning mode and court booking metadata:

```ts
export interface SportCourtSlot {
  /** e.g. "Cầu Lông 6" or "Sân 6" (1–40 chars) */
  courtName: string;
  /** e.g. "05:00 - 07:00" or "9h - 11h" (1–40 chars) */
  timeRange: string;
}

export interface SportLocationSnapshot {
  locationId?: string | null;
  name: string;
  address: string;
  phone?: string | null;
  mapUrl?: string | null;
}

export interface ExpenseSportMeta {
  /** True while the session is in Planning mode; false/undefined once completed. */
  planning?: boolean;
  /** Venue snapshot so past sessions retain location info even if the saved location changes. */
  location?: SportLocationSnapshot | null;
  /** Booked court and time slot lines. */
  courtSlots?: SportCourtSlot[];
  /** Optional booking reference code (e.g. "#4139") and total duration text (e.g. "3h30p"). */
  bookingCode?: string | null;
  totalDuration?: string | null;
  /** Optional compressed WebP data URL (<= 80_000 chars) of the booking screenshot for Style B sharing. */
  bookingImageDataUrl?: string | null;
  court: number;
  shuttlecocks: { qty: number; unitPrice: number }[];
  extra: number;
  rule: SportRule;
  entries: SportParticipantEntry[];
  maleSlotRate: number;
  femaleSlotRate: number;
}
```

### 3.4 Validation & Balance Isolation for Planning Sessions
In [`apps/api/src/expenses/routes.ts`](file:///C:/Users/NvN/orca/workspaces/coin-crew/epic-phase-1-group-split-vietqr-hardening/apps/api/src/expenses/routes.ts) (`validateExpenseInput`):
- **When `meta.sport?.planning === true`:**
  - Actor must have `can(actor, 'plan_session')` (`403 FORBIDDEN` otherwise).
  - As with all `meta.sport` expenses, `paidFromFund` is never allowed (`422 VALIDATION` — sport sessions are always split across participants).
  - `meta.sport.court` may be `>= 0` (stored as the pre-filled court fee for later completion); `shuttlecocks` and `extra` default to `[]` and `0`.
  - The transaction's `amount` is stored as `0`, `maleSlotRate` and `femaleSlotRate` are `0`, and each participant in `meta.sport.entries` gets a `transactionShares` row with `amount: 0`, `inputValue: 0`, `inputAuto: 0`.
  - At least 1 participant with positive slots (`totalMaleSlots + totalFemaleSlots > 0`) is required.
  - If `meta.sport.location` is provided, `name` (1–120 chars) and `address` (1–200 chars) are required.
- **When `meta.sport?.planning` is `false` or omitted (Completed Sport Expense):**
  - Existing validation applies unchanged (`amount > 0`, `court + extra + shuttlecocks === amount`, `computeSportShares` matches `shares` and slot rates, `paidFromFund` disallowed).
  - `location`, `courtSlots`, `bookingCode`, `totalDuration`, and `bookingImageDataUrl` are preserved on the completed expense so venue and court history remain visible on the finalized bill.
- **Balance & Ledger Isolation (`apps/api/src/trips/snapshot.ts`, `libs/shared/core`):**
  - Add helper `isPlanningExpense(e: { meta?: ExpenseMeta | null }): boolean` returning `Boolean(e.meta?.sport?.planning)`.
  - In `toLedger(s)` (`apps/api/src/trips/snapshot.ts`), exclude planning expenses (`!isFundPaid(e) && !isPlanningExpense(e)`).
  - In `fundSummary`, exclude planning expenses.
  - In `/api/trips/:id/pay-info` and `/j/:token/e/:id/qr.png`, return `404` / disabled for planning expenses since no payment is due yet.
  - In `dispatchExpenseNotification` (`apps/api/src/expenses/routes.ts`), skip sending payment/bill email notifications while `isPlanningExpense(validated)` is true; when `PATCH /trips/:id/expenses/:eid` transitions a head from `planning: true` to `planning: false`, trigger `dispatchExpenseNotification(c, 'approved', head.rootId, ...)` so members get the finalized bill notification upon completion.

### 3.5 Env-Gated AI Screenshot Extraction (`POST /api/trips/:id/sport-booking/extract`)
- **Environment Variable (`libs/api/db/src/env.ts`):**
  - Add `GEMINI_API_KEY?: string;` and `GEMINI_MODEL?: string;` (defaults to `gemini-2.5-flash-lite`) to `Env`.
  - Expose `aiBookingExtract?: boolean` on `TripView` (true when `Boolean(c.env.GEMINI_API_KEY)` and actor has `plan_session` permission).
- **Endpoint (`POST /api/trips/:id/sport-booking/extract`):**
  - Requires `can(actor, 'plan_session')` on the trip; returns `501 NOT_IMPLEMENTED` if `GEMINI_API_KEY` is not set.
  - Accepts `{ imageDataUrl: string }` (base64 JPEG/PNG/WebP, max 1.5 MB).
  - Calls Gemini `generateContent` REST API with `responseMimeType: "application/json"` and structured schema to extract:
    ```ts
    export interface ExtractedSportBooking {
      clubName: string | null;
      address: string | null;
      phone: string | null;
      date: string | null; // YYYY-MM-DD if recognizable
      bookingCode: string | null; // e.g. "#4139"
      totalDuration: string | null; // e.g. "3h30p"
      totalAmount: number | null; // integer VND, e.g. 168000
      courtSlots: SportCourtSlot[];
    }
    ```

---

## 4. Frontend UX & "The Friendly Ledger" UI Design

All UI strictly follows [`.impeccable/design.json`](file:///C:/Users/NvN/orca/workspaces/coin-crew/epic-phase-1-group-split-vietqr-hardening/.impeccable/design.json):
- **Colours:** Theme tokens only (`bg-background` Rice Paper, `bg-card` White, `border-border` Hairline, `bg-primary` Jade, `bg-secondary text-secondary-foreground` Jade Mist, `bg-muted text-muted-foreground` Stone Muted). **Never** use Turmeric (`warning`), Leaf (`success`), or Lychee (`danger`) for planning pills or schedule callouts.
- **Surfaces & Touch Targets:** Flat white `rounded-xl` / `rounded-[20px]` grouped lists on Rice Paper; no nested cards; all interactive controls `min-h-11` (44px); inputs `16px` text.

### 4.1 Floating `+` Button 2-Option Menu (`AppNav.tsx` & `MemberTrip.tsx`)
- When inside a **sport group** where the signed-in caller is a group admin (`view.trip.preset === 'sport' && !view.trip.archived && can(actorOf(view), 'plan_session')`), clicking the floating `+` button (`[data-testid="nav-add"]` on mobile or `+ Thêm` button in the desktop sidebar) opens a floating `Popover` with two `min-h-11` items:
  1. **Lên lịch buổi đánh** (`Plan session`) → navigates to `/t/:tripId/expenses/new?mode=planning`
  2. **Thêm chi phí** (`Add expense`) → navigates to `/t/:tripId/expenses/new`
- On non-sport groups (`preset !== 'sport'`) or for non-admin callers, the `+` button navigates directly to `addHref` as before.

### 4.2 Creating & Editing a Planning Session (`ExpenseForm.tsx`)
When opened with `?mode=planning` or when editing an expense where `expense.meta?.sport?.planning === true`:
1. **Screen Header:** Title is `Lên lịch buổi đánh` (`Plan sport session`).
2. **Session Name & Screenshot Auto-Fill:**
   - Standard description field (`Buổi đánh`, e.g., `Cầu lông sáng CN`).
   - Image picker control (`Đính kèm ảnh đặt sân` / `✨ Đọc từ ảnh đặt sân` when `view.aiBookingExtract` is true):
     - Compresses the selected image client-side via `<canvas>` to a WebP data URL (`maxWidth: 720`, quality `0.75`, capped under `60 KB`) and stores it in `bookingImageDataUrl`.
     - If `view.aiBookingExtract` is true, sends the image to `POST /api/trips/:id/sport-booking/extract` and pre-fills:
       - Matching saved location (by case-insensitive name match) or opens the new-location fields pre-filled with `clubName`, `address`, and `phone`.
       - `spentOn` date (if parsed), `courtSlots`, `bookingCode`, `totalDuration`, and `courtText` (`totalAmount`).
3. **Location & Court Schedule Grouped List:**
   - **Location selector:** Choose an existing saved location from `view.locations` or `+ Thêm sân mới` (inline/sheet form with required **Tên sân**, **Địa chỉ**, and optional **Số điện thoại**, **Link Google Maps**).
   - **Date (`Ngày đánh`):** Date input (`spentOn`).
   - **Court & Time Slots (`Sân & khung giờ`):** Editable rows of `{ courtName, timeRange }` (e.g., `Cầu Lông 6` · `05:00 - 07:00`) with `+ Thêm sân` and remove `×` buttons.
   - **Optional Booking Meta & Pre-filled Court Fee:** Optional `Mã đặt / Tổng giờ` and `Tiền sân dự kiến` (`courtText`, stored in `meta.sport.court` for later completion).
4. **Participants (`Người tham gia dự kiến`):**
   - Reuses the existing sport participant & guest slot selector (`Nữ` / `Nam` slots), hiding per-person VND amounts while in planning mode.
5. **Submit Bar:**
   - Single primary Jade button: `Lưu lịch dự kiến` (`Save planned session`).

### 4.3 Expense List Row (`ExpenseRow.tsx`)
When `isPlanningExpense(expense)` is true:
- **Icon Box:** Calendar icon inside the standard `size-[38px] rounded-xl bg-secondary text-secondary-foreground` badge.
- **Title:** `expense.description`.
- **Subline:** `<Location name> · <Court slots summary> · <totalSlots> suất` (falls back to `<payerName> · <totalSlots> suất` if no location is set).
- **Right Column:** Top line shows `<totalSlots> suất` in `text-sm font-semibold tabular-nums text-muted-foreground`; bottom line shows `<Pill tone="accent">Lên lịch</Pill>` (Jade Mist `bg-secondary text-secondary-foreground`).

### 4.4 Planned Session Details (`ExpenseDetails.tsx` & `SportBillTable.tsx`)
When viewing an expense with `isPlanningExpense(e) === true`:
1. **Header & Hero Summary:**
   - Title `e.description` + `<Pill tone="accent">Lên lịch</Pill>`.
   - Hero line: `{totalSlots} suất` with `(X Nữ · Y Nam)` in `text-muted-foreground` instead of a VND `<Amount />`.
2. **Facts List (`<dl className="fsl-details__facts">`):**
   - **Ngày** (`formatDay(e.spentOn)`)
   - **Địa điểm** (`location.name`, if present)
   - **Địa chỉ** (`location.address`, with a `Mở bản đồ ↗` link if `location.mapUrl` is set, using `platform.openOutApp` / `<a target="_blank">` as appropriate)
   - **Số điện thoại** (`location.phone`, if present)
   - **Sân đã đặt** (formatted `courtSlots`, e.g. `Cầu Lông 6 (05:00–07:00) · Cầu Lông 5 (05:30–07:00)`)
   - **Mã đặt sân** (`bookingCode` / `totalDuration`, if present)
3. **3-Column `SportBillTable.tsx`:**
   - Pass `planning?: boolean` to `SportBillTable`.
   - When `planning` is true, render a 3-column `<colgroup>` (`TÊN`, `NỮ`, `NAM`), hide the `THÀNH TIỀN` column, and render only the `TỔNG SUẤT` footer row (`bg-muted text-foreground font-semibold`), omitting `CHI PHÍ` and `MỖI SUẤT`.
4. **Admin Planning Share & Transition Actions:**
   - For group admins (`can(actorOf(view), 'plan_session')`):
     - Render the share card (`fsl-sport-preview-card`): if `e.meta.sport.bookingImageDataUrl` is present, show a clean toggle row **Ghép kèm ảnh đặt sân** (`includeProofImage`, default `false` = Style A; `true` = Style B), and the primary Jade button **Chia sẻ lịch & danh sách** (`Share schedule & headcount`).
     - Render a secondary Jade Mist button (`variant="secondary"`): **✓ Hoàn tất & Tính tiền** (`Complete & split bill`), alongside the ghost **Sửa** (`Edit`) and **Vô hiệu** (`Disable`) actions.
     - Clicking **✓ Hoàn tất & Tính tiền** navigates to `/t/:tripId/expenses/:expenseId/edit?mode=complete`.
     - In `ExpenseForm` (`mode=complete`), `planning` switches to `false`, the pre-filled `court` fee is active, the shuttlecock & extra fee rows are shown, the admin adjusts the participant slots to match who actually showed up, and submitting calls `PATCH /trips/:id/expenses/:eid`—creating the completed version while keeping the planning version in `ExpenseHistoryList`.

### 4.5 Canvas PNG Renderer & Zalo Message (`libs/web/util/src/qr.ts` & `libs/web/screens/src/lib/remind.ts`)
- **`renderSportPlanningPng(input: SportPlanningCardInput)`:**
  - **Style A (Default, 1080px wide):**
    - White (`#ffffff`) card with title, date + group name, and a Jade Mist (`#ccfbf1` / `#134e4a`) `LÊN LỊCH · X SUẤT` pill.
    - Flat Muted Fill (`#efefeb`) venue & court schedule box (Venue name, address, phone, court slot chips, booking code).
    - 3-column table (`TÊN | NỮ | NAM`) + `TỔNG SUẤT` footer row.
  - **Style B (When `includeProofImage && bookingImageDataUrl` is enabled):**
    - Stitches the 3-column table + venue header on the left column and draws the attached `bookingImageDataUrl` image scaled proportionally on the right column (1440px wide canvas), matching the group's 2-panel collage habit automatically without manual cropping.
- **`sportPlanningShareText(lang, input)`:**
  - Generates the copyable Zalo message:
    - Location name & address
    - Google Maps link (if present)
    - Date & booked court slots
    - Total headcount (`X suất: Y Nữ, Z Nam`)
    - Deep link to the session (`https://.../j/<token>/e/<rootId>`)

---

## 5. Builder Calls & What's Left to the Builder

### Calls Made in This Spec (for Reviewer Check)
1. **Co-Admin Handoff on Planning Sessions:** Any group admin (`isOrganiser || isAdmin`) can edit or complete a planned session (`isPlanningExpense(head) === true`), even if another co-admin created the plan. Once completed into a real bill, standard creator-only `edit_expense` ownership applies to the completed version.
2. **Client-Side WebP Compression Instead of Cloudflare R2:** Attached booking screenshots are compressed client-side to `<= 60 KB` WebP data URLs in `meta.sport.bookingImageDataUrl` so Style B collage sharing works across devices with zero new Cloudflare R2 infrastructure.
3. **Sport Expenses Remain Player-Split Only:** Consistent with existing `meta.sport` validation (`routes.ts:131`), planned and completed sport sessions are always split across participants (`paidFromFund` is not used).
4. **Deferred Payment Notifications:** Creating/editing a session while `planning: true` does not send bill-payment email notifications; the `'approved'` bill notification fires when the session transitions from `planning: true` to `planning: false`.

### Left to the Builder
- Exact Drizzle migration numbering for adding `trip_locations`.
- Exact Gemini prompt wording for `POST /api/trips/:id/sport-booking/extract` and fallback handling when an uploaded image has partial fields.
- Canvas layout spacing constants in `renderSportPlanningPng` for Style A and Style B.
- Bilingual translation keys in `libs/web/i18n/src/vi.ts` and `libs/web/i18n/src/en.ts`.
