# Group Creation & Bank Update Hardening (Normalise Holder Name, Refresh Other Groups, Deduplicate Names) — Design

Date: 2026-11-07 · Status: Ready for Review & Approval  
Issue: [NguyenVuNhan/Coin-crew#71](https://github.com/NguyenVuNhan/Coin-crew/issues/71)  
Parent Epic: [NguyenVuNhan/Coin-crew#53](https://github.com/NguyenVuNhan/Coin-crew/issues/53) (*Phase 1: Group Split & VietQR Hardening*)  

---

## 1. Why

During the Phase 1 final review, three related defects were uncovered across group creation, bank profile persistence, and member roster state synchronization:

1. **Un-normalised Bank Account Holder Name on Group Creation:** When an organizer enters their bank account details while creating a group (`POST /api/trips`), the backend validates `toTransferNote(holderName, 50)`, but persists the raw, un-normalised `body.myBank.holderName` into the `bank_details` table. This creates a data inconsistency with `/me/bank` and `/trips/:id/bank`, which always store the standard VietQR format (uppercase, ASCII unaccented, max 50 characters). Furthermore, on the web client, submitting without blurring the holder input leaves raw accented characters in the request payload.
2. **Stale Cached Group Views After Updating Bank Details:** When a signed-in member updates their bank details via `/me/bank`, the backend `saveMemberBank` bumps `trips.version` on all groups where that member is active (invalidating the server's snapshot cache). However, the web client's mutation handler in `BankDetails.tsx` only invalidates the TanStack Query key `['me', 'bank']`. The queries for other groups (`['trip']`), payee QR codes (`['pay']`, `['expense-pay']`), and personal ledger settle-ups (`['me', 'people']`) remain cached with stale bank details, leaving old bank prompts or outdated VietQR payloads in the user's browser.
3. **No De-duplication of Initial Member Names on Group Creation:** When creating a group, neither the frontend roster input (`PeopleInput.tsx`, `AddPeopleBar.tsx`, `CreateTrip.tsx`) nor the backend (`apps/api/src/trips/routes.ts`) deduplicates participant names. If an organizer pastes a roster containing duplicates, types a duplicate name, or includes their own name (who is already participant #0), the database inserts duplicate rows with identical names. This results in duplicate member cards, distorted expense splits, and confusing settle-up suggestions.

Addressing these three defects hardens group setup and bank updates in full compliance with **The Friendly Ledger** design system (`DESIGN.md`) and CoinCrew's core product philosophy (`PRODUCT.md`).

---

## 2. Goals

1. **Consistent Bank Account Normalisation:** Bank account holder names submitted during group creation (`POST /api/trips`) must be normalized to VietQR standards (uppercase, diacritics stripped, alphanumeric and spaces only, max 50 characters) on both client submission and backend database persistence.
2. **Instant Cross-Group Cache Refresh:** Mutating bank details via `/me/bank` (or from within a group) must invalidate all client-side query caches for groups (`['trip']`), group lists (`['trips']`), VietQR payment payloads (`['pay']`, `['expense-pay']`), and personal ledger settle-ups (`['me', 'people']`).
3. **Calm, Forgiving Name De-duplication:** Initial member names added during group creation must be deduplicated across typing, paste, draft submission, and backend persistence:
   - Evaluated using `normalizeName(name)` (case-insensitive, accent-insensitive, whitespace-collapsed).
   - Omit names matching the organizer (`myName` / `me.name`), who is already participant #0.
   - For multi-line paste, deduplicate within the batch, add unique members, and display clear, polite feedback in the snackbar.
   - For typing a duplicate name, keep the typed text in the add bar and show a helpful inline hint suggesting a nickname or last name to differentiate real friends.
   - On backend, silently deduplicate `people` entries during `POST /api/trips` to guarantee database integrity without ever failing the user with an aggressive 422 error banner.

---

## 3. Non-Goals

- Modifying existing post-creation participant addition (`POST /trips/:id/people`): Adding participants to existing groups already supports look-alikes and merge hints as designed.
- Changing merge proposal mechanics or admin approval workflows for existing groups.
- Altering VietQR payload EMVCo structure (`libs/shared/core/src/vietqr.ts`).

---

## 4. Anti-Goals

- **Never break group creation with 422 for duplicate names:** Organizers pasting attendance lists from Zalo chats should never see a red error banner stopping group creation. Deduplication must be smooth, silent on backend, and helpful on frontend.
- **Never lose user input on duplicate collision:** When an organizer types a name that is already taken, do not wipe the input field; restore or keep the input so the user can easily append a nickname (e.g. "Minh B").
- **Never use Turmeric or Lychee for non-error duplicate hints:** Duplicate name hints are informational coaching, not danger or pending money states (violating the *Money Means Something Rule*).

---

## 5. Detailed Technical Specifications

### Defect 1: Bank Account Holder Name Normalisation on Group Creation

#### Affected Files:
* `apps/api/src/trips/routes.ts`
* `libs/web/screens/src/screens/CreateTrip.tsx`
* `apps/api/test/trips.test.ts`

#### Changes:

1. **Backend Persistence in `apps/api/src/trips/routes.ts`:**
   - In `POST /trips` validation (`lines 160-181`):
     ```typescript
     const { bin, accountNumber, holderName } = body.myBank;
     ...
     const normalizedHolderName = toTransferNote(holderName, 50);
     if (!normalizedHolderName) {
       throw new ApiError('VALIDATION', 422, 'Invalid request');
     }
     ```
   - In `POST /trips` database insertion (`lines 255-278`):
     ```typescript
     const updateBank = db
       .update(bankDetails)
       .set({ status: 'replaced' })
       .where(
         and(
           eq(bankDetails.userId, user.id),
           inArray(bankDetails.status, ['approved', 'pending']),
         ),
       );

     const insertBank = db.insert(bankDetails).values({
       id: newId(),
       userId: user.id,
       participantId: null,
       bin: body.myBank.bin,
       accountNumber: body.myBank.accountNumber,
       holderName: normalizedHolderName, // Normalized uppercase ASCII
       status: 'approved',
       approvedByUserId: user.id,
       consentAt: now,
       createdAt: now,
     });
     ```
   - Replaces both `approved` and `pending` records (matching `saveMemberBank` in `apps/api/src/bank/routes.ts:82`).

2. **Frontend Form Submission in `libs/web/screens/src/screens/CreateTrip.tsx`:**
   - In `handleSubmit` (`lines 105-115`), normalize the holder name:
     ```typescript
     if (
       bank.bin.trim() !== '' &&
       bank.accountNumber.trim() !== '' &&
       bank.holderName.trim() !== ''
     ) {
       input.myBank = {
         bin: bank.bin.trim(),
         accountNumber: bank.accountNumber.trim(),
         holderName: toTransferNote(bank.holderName, 50) || bank.holderName.trim(),
       };
     }
     ```

---

### Defect 2: Cache Refresh & Invalidation on Member Bank Update

#### Affected Files:
* `libs/web/screens/src/screens/BankDetails.tsx`
* `libs/web/screens/src/screens/CreateTrip.tsx`
* `libs/web/screens/src/screens/__tests__/bank-details.test.tsx` (or new test file)

#### Changes:

1. **Comprehensive Invalidation in `BankDetails.tsx`:**
   - In `handleSubmit` (`lines 93-102`), when bank details are saved successfully:
     ```typescript
     try {
       if (tripId) {
         await apiSend(`/api/trips/${tripId}/bank`, 'PUT', body, tripId);
       } else {
         await apiSend('/api/me/bank', 'PUT', body);
       }
       await Promise.all([
         queryClient.invalidateQueries({ queryKey: ['me', 'bank'] }),
         queryClient.invalidateQueries({ queryKey: ['trip'] }),
         queryClient.invalidateQueries({ queryKey: ['trips'] }),
         queryClient.invalidateQueries({ queryKey: ['pay'] }),
         queryClient.invalidateQueries({ queryKey: ['expense-pay'] }),
         queryClient.invalidateQueries({ queryKey: ['me', 'people'] }),
       ]);
       setSuccess(true);
     }
     ```
   - Invalidating prefix `['trip']` invalidates all cached group snapshots.
   - Invalidating `['pay']` and `['expense-pay']` clears any cached VietQR codes for payees.
   - Invalidating `['me', 'people']` updates personal ledger settle-up payment codes.

2. **Group Creation Invalidation in `CreateTrip.tsx`:**
   - In `createMutation.onSuccess` (`lines 61-64`):
     ```typescript
     onSuccess: (data, variables) => {
       if (variables.myBank) {
         void queryClient.invalidateQueries({ queryKey: ['me', 'bank'] });
         void queryClient.invalidateQueries({ queryKey: ['trip'] });
         void queryClient.invalidateQueries({ queryKey: ['pay'] });
         void queryClient.invalidateQueries({ queryKey: ['expense-pay'] });
         void queryClient.invalidateQueries({ queryKey: ['me', 'people'] });
       }
       void queryClient.invalidateQueries({ queryKey: ['trips'] });
       navigate(`/t/${data.tripId}`, { replace: true });
     },
     ```
   - *Builder Call:* If the organizer enters bank details during group creation, all group caches (`['trip']`, `['pay']`, etc.) are invalidated alongside `['me', 'bank']`, ensuring that if the organizer navigates back to any previously open group, their updated payee bank details are immediately visible.
   - *Backend Version Bumping:* In `POST /trips`, if `body.myBank` replaces the organizer's bank details, query all active trips the user belongs to (excluding the new `tripId`) and bump `version` via `commitTripWrite` (matching `saveMemberBank` behavior).

---

### Defect 3: Initial Member Name De-duplication with Impeccable Polish

#### Affected Files:
* `libs/web/screens/src/components/PeopleInput.tsx`
* `libs/web/screens/src/components/AddPeopleBar.tsx`
* `libs/web/screens/src/screens/CreateTrip.tsx`
* `apps/api/src/trips/routes.ts`
* `libs/web/i18n/src/en.ts` & `libs/web/i18n/src/vi.ts`

#### Impeccable UX Mechanics:

1. **Frontend `PeopleInput.tsx`:**
   - In `handleAdd`:
     - Compare candidate names against `me.name` (normalized) and existing entries in `valueRef.current` (normalized).
     - Filter out duplicates within the incoming batch itself.
     - Add only unique new members to the roster:
       ```typescript
       const existingNorms = new Set([
         ...(me ? [normalizeName(me.name)] : []),
         ...valueRef.current.map((e) => normalizeName(e.name)),
       ]);

       const uniqueToAdd: NewPerson[] = [];
       const skipped: NewPerson[] = [];

       for (const p of people) {
         const norm = normalizeName(p.name);
         if (norm === '' || existingNorms.has(norm)) {
           skipped.push(p);
         } else {
           existingNorms.add(norm);
           uniqueToAdd.push(p);
         }
       }
       ```
     - Return `skipped` in the `onAdd` promise:
       ```typescript
       return Promise.resolve(skipped);
       ```
     - For single add that was skipped: `AddPeopleBar` retains the name in the field.
     - For multi-add (paste): show customized snackbar text indicating how many were added and how many duplicate names were skipped.

2. **Inline Guidance in `AddPeopleBar.tsx`:**
   - When a typed single name is rejected by `onAdd` because it is already present:
     - `AddPeopleBar` restores the typed text into the field.
     - Shows a quiet helper text in `text-xs text-muted-foreground` below the input:
       - **VI:** `Đã có tên này trong nhóm. Thêm họ hoặc biệt danh để dễ phân biệt (vd: Minh B).`
       - **EN:** `Already in the group. Add a last name or nickname to tell them apart (e.g. Minh B).`
     - Dismisses automatically on next keystroke.

3. **Form Submission in `CreateTrip.tsx`:**
   - Check `draft`: If `normalizeName(draft)` matches `me.name` or any person already in `people`, omit `draft` from the roster.
   - Filter `roster` so only unique normalized names are sent to `POST /api/trips`, ensuring no duplicate names or self-duplication can escape to the network call.

4. **Backend Deduplication in `apps/api/src/trips/routes.ts`:**
   - *Builder Call on Account IDs vs Plain Names:*
     - Existing contract preservation: The API continues to enforce `new Set(accountIds).size === accountIds.length`, throwing 422 if an API caller intentionally sends the same other account ID twice in `people` (preserving the contract tested in `apps/api/test/trips.test.ts:240`: `refuses the same account twice`).
     - Plain name deduplication & Organizer self-omission:
       ```typescript
       // Omit any person entry matching the organizer (by userId or normalized name)
       const nonOrganizerPeople = people.filter(
         (p) => !(p.userId && p.userId === user.id) && normalizeName(p.name) !== normalizeName(myName),
       );

       // Deduplicate guest/member names by normalizedName (preserving first occurrence)
       const seenNormalized = new Set<string>();
       const uniquePeople: typeof people = [];

       for (const p of nonOrganizerPeople) {
         const norm = normalizeName(p.name);
         if (seenNormalized.has(norm)) continue;
         seenNormalized.add(norm);
         uniquePeople.push(p);
       }
       ```
   - Only `uniquePeople` are inserted into the database.
   - Result: 100% clean participant rows, no duplicate guest cards, no double-listed organizer, while preserving strict 422 account ID uniqueness.

5. **Copy & i18n (`en.ts` / `vi.ts`):**
   - `addBar.addedManyWithSkipped`:
     - **VI:** `Đã thêm {count} người (bỏ qua {skipped} tên trùng)`
     - **EN:** `Added {count} people ({skipped} duplicates skipped)`
   - `addBar.duplicateHint`:
     - **VI:** `Đã có tên này trong nhóm. Thêm họ hoặc biệt danh để dễ phân biệt.`
     - **EN:** `Already in the group. Add a last name or nickname to tell them apart.`

---

## 6. What's Left to the Builder

- Exact placement and styling of the quiet duplicate hint in `AddPeopleBar.tsx` (must follow `DESIGN.md`: Stone Muted, 12px, 4px margin, no layout jump).
- Updating test suites:
  - `apps/api/test/trips.test.ts`: verify passing duplicate names (`['An', 'an', 'An ', 'Minh']`) with organiser `'Minh'` creates only 2 participants (`Minh` and `An`).
  - `libs/web/screens/src/components/__tests__/add-people-bar.test.tsx`: verify paste deduplication and snackbar messaging.
  - `libs/web/screens/src/screens/__tests__/trips.test.tsx`: verify group creation with draft and duplicate names.

---

## 7. Verification Plan

1. **Automated Tests:**
   * Run API unit & integration tests: `npx nx test @cc/api`
   * Run Web screens tests: `npx nx test @cc/web-screens`
   * Run Core unit tests: `npx nx test @cc/core`
   * Run Workspace typecheck and lint: `npm run typecheck && npm run lint`
2. **Defect-Specific Verification:**
   * Create trip with lowercase/diacritic bank name (`Nguyễn Văn Minh`) → DB contains `NGUYEN VAN MINH`.
   * Update `/me/bank` → verify `['trip']`, `['pay']`, `['trips']` cache keys are invalidated in TanStack Query.
   * Paste duplicate list into `PeopleInput` → duplicates skipped, correct snackbar shown, unique members created.
