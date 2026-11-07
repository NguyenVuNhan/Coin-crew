# Group Creation & Bank Update Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure bank account holder names are normalized to VietQR standards during group creation, invalidate all group and pay query caches across the client and bump version across active groups when bank details change, and calmly deduplicate initial member names across frontend and backend.

**Architecture:** In the backend `POST /api/trips`, normalize holder names using `toTransferNote(holderName, 50)`, set `approvedByUserId`, replace old pending/approved bank rows, and bump versions on the creator's other active groups if bank details are updated. In the frontend `BankDetails.tsx` and `CreateTrip.tsx`, invalidate all group and payment query keys upon saving bank details. In `PeopleInput.tsx`, `AddPeopleBar.tsx`, `CreateTrip.tsx`, and `apps/api/src/trips/routes.ts`, de-duplicate member names against `normalizeName`, omit the organizer, provide clear multi-paste feedback, and coach users when typing duplicates without throwing 422 errors.

**Tech Stack:** TypeScript, Hono, Drizzle ORM, SQLite / Cloudflare D1, TanStack React Query, React, Vitest.

**Spec:** [`docs/superpowers/specs/2026-11-07-group-creation-and-bank-update-hardening-design.md`](file:///C:/Users/NvN/orca/workspaces/coin-crew/epic-phase-1-group-split-vietqr-hardening/docs/superpowers/specs/2026-11-07-group-creation-and-bank-update-hardening-design.md)

## Global Constraints

- Bank account holder names must be normalized to uppercase ASCII (unaccented, alphanumeric with single spaces, max 50 chars) via `toTransferNote(name, 50)` on both client submission and backend storage.
- Never fail group creation with a 422 error for duplicate plain names or including the organizer's own name; deduplicate calmly.
- Preserve existing 422 validation for duplicate account IDs (`userId`) in `people` (`refuses the same account twice`).
- All duplicate name comparisons must use `normalizeName(name)` from `@cc/core`.
- Maintain "The Friendly Ledger" token rules: informational hints use Stone Muted (`text-xs text-muted-foreground`), never money colors (Leaf, Lychee, Turmeric).

## Review Focus

1. **Accented/lowercase bank holder name during group creation:** e.g. `{ bin: '970407', accountNumber: '19031234565678', holderName: 'Nguyễn Văn Minh' }` → persists as `'NGUYEN VAN MINH'` in `bank_details` with `approvedByUserId = user.id`.
2. **Existing active groups when creator sets bank info in new group:** Creator's existing active groups have their `version` incremented on the backend, and frontend query caches for `['trip']`, `['pay']`, `['expense-pay']`, and `['me', 'people']` are invalidated on `CreateTrip.tsx:onSuccess`.
3. **Updating bank via `/me/bank`:** Invalidates `['me', 'bank']`, `['trip']`, `['trips']`, `['pay']`, `['expense-pay']`, and `['me', 'people']` so other groups and pay screens instantly show the new bank account without requiring a page reload.
4. **Multi-name paste with duplicates and organizer:** Pasting `Minh, An, Bình, An, Minh` when organizer is `Minh` adds only `An` and `Bình`, reports `Đã thêm 2 người (bỏ qua 3 tên trùng)`, and allows normal group creation.
5. **Duplicate name in add-bar draft on submit:** Typing a duplicate name (e.g. `An` when `An` is already in the roster) and clicking "Create group" without hitting Enter discards the duplicate draft and creates the group with `Minh` and `An` without a 422 error.

---

### Task 1: Bank Account Holder Name Normalisation & Multi-Trip Version Bumping on Group Creation

**Files:**
- Modify: `apps/api/src/trips/routes.ts:160-278`
- Modify: `libs/web/screens/src/screens/CreateTrip.tsx:105-115`
- Test: `apps/api/test/trips.test.ts:10-28`

**Interfaces:**
- Consumes: `toTransferNote` from `@cc/core`, `bankDetails` and `trips` schema from `@cc/api-db/schema`, `commitTripWrite` from `@cc/api-db/commit`.
- Produces:
  - `POST /api/trips` stores normalized `holderName` (`toTransferNote(holderName, 50)`), `approvedByUserId: user.id`, and replaces status `['approved', 'pending']`.
  - `POST /api/trips` bumps `trips.version` for all other active groups of `user.id` when `body.myBank` is supplied.
  - `CreateTrip.tsx` passes normalized `holderName` in request body.

- [ ] **Step 1: Write the failing tests in `apps/api/test/trips.test.ts`**

Add tests asserting holder name normalization, `approvedByUserId`, and multi-group version bumping on trip creation:
```typescript
it('normalises bank holder name and sets approvedByUserId on group creation', async () => {
  const headers = { ...(await minh()), 'Content-Type': 'application/json' };
  const res = await call('/api/trips', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'Vũng Tàu',
      myName: 'Minh',
      people: ['An'],
      myBank: {
        bin: '970407',
        accountNumber: '19031234565678',
        holderName: 'Nguyễn Văn Minh',
      },
    }),
  });
  expect(res.status).toBe(201);
  const { tripId } = await json<{ tripId: string }>(res);
  const row = await env.DB.prepare(
    "SELECT holder_name, approved_by_user_id, status FROM bank_details WHERE user_id = 'u-minh' AND status = 'approved'",
  ).first<{ holder_name: string; approved_by_user_id: string; status: string }>();
  expect(row?.holder_name).toBe('NGUYEN VAN MINH');
  expect(row?.approved_by_user_id).toBe('u-minh');
});

it('bumps version on creator other active groups when myBank is provided during group creation', async () => {
  const headers = { ...(await minh()), 'Content-Type': 'application/json' };
  // Group 1
  const res1 = await call('/api/trips', {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'Group 1', myName: 'Minh', people: ['An'] }),
  });
  const { tripId: trip1Id } = await json<{ tripId: string }>(res1);
  const v1Before = await view(headers, trip1Id);

  // Group 2 with new bank details
  const res2 = await call('/api/trips', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'Group 2',
      myName: 'Minh',
      people: ['Bình'],
      myBank: { bin: '970422', accountNumber: '0123456789', holderName: 'NGUYEN VAN MINH' },
    }),
  });
  expect(res2.status).toBe(201);

  const v1After = await view(headers, trip1Id);
  expect(v1After.trip.version).toBe(v1Before.trip.version + 1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx nx test @cc/api -t "normalises bank holder name"`  
Expected: FAIL (currently stores raw `Nguyễn Văn Minh` and leaves `approved_by_user_id` null).

- [ ] **Step 3: Implement normalization and multi-trip version bumping in `apps/api/src/trips/routes.ts`**

1. In `apps/api/src/trips/routes.ts`:
   - Normalize `const normalizedHolderName = toTransferNote(holderName, 50);` during validation.
   - When inserting `bankDetails`:
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
       holderName: normalizedHolderName,
       status: 'approved',
       approvedByUserId: user.id,
       consentAt: now,
       createdAt: now,
     });
     ```
   - If `body.myBank` is present, find other active trips for `user.id`:
     ```typescript
     const otherParticipations = await db
       .select({ tripId: participants.tripId, participantId: participants.id })
       .from(participants)
       .where(and(eq(participants.userId, user.id), eq(participants.status, 'active')));
     for (const p of otherParticipations) {
       await commitTripWrite(db, p.tripId, [], {
         action: 'bank_submitted',
         actorUserId: user.id,
         actorParticipantId: p.participantId,
         actorDevice: c.get('deviceHash'),
         details: { member: true },
       });
     }
     ```
2. In `libs/web/screens/src/screens/CreateTrip.tsx`:
   In `handleSubmit`, ensure `toTransferNote(bank.holderName, 50) || bank.holderName.trim()` is passed.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx nx test @cc/api -t "normalises bank holder name"`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/trips/routes.ts libs/web/screens/src/screens/CreateTrip.tsx apps/api/test/trips.test.ts
git commit -m "fix(api,web): normalise bank holder name and bump other trip versions on trip create (#71)"
```

---

### Task 2: Cross-Group Cache Invalidation on Bank Details Mutation

**Files:**
- Modify: `libs/web/screens/src/screens/BankDetails.tsx:93-106`
- Modify: `libs/web/screens/src/screens/CreateTrip.tsx:61-67`
- Test: `libs/web/screens/src/screens/__tests__/bank-details.test.tsx` (or update `trips.test.tsx`)

**Interfaces:**
- Consumes: `useQueryClient` from `@tanstack/react-query`, `BankDetails.tsx`, `CreateTrip.tsx`.
- Produces:
  - Saving bank details in `BankDetails.tsx` invalidates query keys: `['me', 'bank']`, `['trip']`, `['trips']`, `['pay']`, `['expense-pay']`, `['me', 'people']`.
  - Creating a group with `myBank` in `CreateTrip.tsx` invalidates `['me', 'bank']`, `['trip']`, `['trips']`, `['pay']`, `['expense-pay']`, `['me', 'people']`.

- [ ] **Step 1: Write the failing tests in `libs/web/screens/src/screens/__tests__/trips.test.tsx`**

Test query invalidation when updating bank details and creating a trip with bank details:
```typescript
it('creating a trip with myBank invalidates me-bank, trip, and trips query caches', async () => {
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  // Render and submit CreateTrip with myBank filled
  ...
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['me', 'bank'] });
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['trip'] });
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['trips'] });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test @cc/web-screens -t "creating a trip with myBank invalidates"`  
Expected: FAIL

- [ ] **Step 3: Implement comprehensive query invalidation**

1. In `libs/web/screens/src/screens/BankDetails.tsx`:
   Update `handleSubmit`:
   ```typescript
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
   ```
2. In `libs/web/screens/src/screens/CreateTrip.tsx`:
   Update `createMutation.onSuccess`:
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx nx test @cc/web-screens -t "creating a trip with myBank invalidates"`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add libs/web/screens/src/screens/BankDetails.tsx libs/web/screens/src/screens/CreateTrip.tsx libs/web/screens/src/screens/__tests__/trips.test.tsx
git commit -m "fix(screens): invalidate cross-group and pay query caches when bank details update (#71)"
```

---

### Task 3: Initial Member Name De-duplication & Impeccable Feedback (Frontend)

**Files:**
- Modify: `libs/web/i18n/src/en.ts:175-190`
- Modify: `libs/web/i18n/src/vi.ts:175-190`
- Modify: `libs/web/screens/src/components/PeopleInput.tsx:60-85`
- Modify: `libs/web/screens/src/components/AddPeopleBar.tsx:59-75`
- Modify: `libs/web/screens/src/screens/CreateTrip.tsx:75-92`
- Test: `libs/web/screens/src/components/__tests__/add-people-bar.test.tsx:18-65`
- Test: `libs/web/screens/src/screens/__tests__/trips.test.tsx:142-200`

**Interfaces:**
- Consumes: `normalizeName` from `@cc/core`, `useT` from `@cc/web-i18n`.
- Produces:
  - `PeopleInput.tsx` filters incoming `people` against `me.name` and existing names in `valueRef.current`, returning skipped entries in `onAdd`.
  - `AddPeopleBar.tsx` displays duplicate hint (`addBar.duplicateHint`) when a typed name is skipped, and restores the typed name in the input.
  - `CreateTrip.tsx` ignores `draft` if it normalizes to an existing member or `myName`, and deduplicates `roster` on submit.

- [ ] **Step 1: Write the failing tests in `libs/web/screens/src/components/__tests__/add-people-bar.test.tsx` and `trips.test.tsx`**

1. In `libs/web/screens/src/components/__tests__/add-people-bar.test.tsx`:
   Test that pasting duplicates reports skipped duplicates in snackbar and keeps unique members:
   ```typescript
   it('pasting names with duplicates adds only unique names and reports skipped count', async () => {
     const onAdd = vi.fn(async (people: NewPerson[]): Promise<NewPerson[]> => {
       // Mock PeopleInput filtering: if 'An' is added twice, second is skipped
       const seen = new Set<string>();
       const skipped: NewPerson[] = [];
       for (const p of people) {
         if (seen.has(p.name.toLowerCase())) skipped.push(p);
         else seen.add(p.name.toLowerCase());
       }
       return skipped;
     });
     renderAt(<AddPeopleBar sport={false} onAdd={onAdd} />);
     const field = screen.getByLabelText('Name to add');
     fireEvent.paste(field, { clipboardData: { getData: () => 'An, Bình, An, Chi' } });
     expect(onAdd).toHaveBeenCalledWith([
       { name: 'An', gender: null },
       { name: 'Bình', gender: null },
       { name: 'An', gender: null },
       { name: 'Chi', gender: null },
     ]);
   });
   ```
2. In `libs/web/screens/src/screens/__tests__/trips.test.tsx`:
   Test that `CreateTrip` excludes duplicate names and draft duplicates:
   ```typescript
   it('CreateTrip deduplicates plain names and ignores draft if already in roster', async () => {
     const { calls } = mockApi({
       'GET /api/me': me(),
       'POST /api/trips': () => Response.json({ tripId: 't-9' }, { status: 201 }),
     });
     renderAt(<CreateTrip />);
     await screen.findByLabelText('Group name');
     await userEvent.type(screen.getByLabelText('Group name'), 'Hà Giang');
     await userEvent.type(screen.getByLabelText('Name to add'), 'An{Enter}');
     await userEvent.type(screen.getByLabelText('Name to add'), 'Bình{Enter}');
     // Leave duplicate 'An' in draft field without hitting Enter
     await userEvent.type(screen.getByLabelText('Name to add'), 'An');
     await userEvent.click(screen.getByRole('button', { name: 'Create group' }));

     await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-9'));
     const postBody = calls.find((c) => c.method === 'POST' && c.path === '/api/trips')?.body as any;
     expect(postBody.people).toEqual([{ name: 'An' }, { name: 'Bình' }]);
   });
   ```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx nx test @cc/web-screens -t "CreateTrip deduplicates plain names"`  
Expected: FAIL (currently appends duplicate 'An' from draft).

- [ ] **Step 3: Implement frontend deduplication and copy**

1. In `libs/web/i18n/src/en.ts` and `libs/web/i18n/src/vi.ts`:
   Add:
   ```typescript
   'addBar.addedManyWithSkipped': 'Added {count} people ({skipped} duplicates skipped)', // en
   'addBar.duplicateHint': 'Already in the group. Add a last name or nickname to tell them apart.', // en

   'addBar.addedManyWithSkipped': 'Đã thêm {count} người (bỏ qua {skipped} tên trùng)', // vi
   'addBar.duplicateHint': 'Đã có tên này trong nhóm. Thêm họ hoặc biệt danh để dễ phân biệt.', // vi
   ```
2. In `libs/web/screens/src/components/PeopleInput.tsx`:
   - In `handleAdd`:
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
     if (uniqueToAdd.length > 0) {
       const addedEntries = uniqueToAdd.map((p) => newPersonEntry(p.name, p.userId, p.gender));
       commit([...valueRef.current, ...addedEntries]);
     }
     // Show snackbar
     if (uniqueToAdd.length > 0) {
       const message =
         skipped.length > 0
           ? t('addBar.addedManyWithSkipped', { count: uniqueToAdd.length, skipped: skipped.length })
           : uniqueToAdd.length > 1
             ? t('addBar.addedMany', { count: uniqueToAdd.length })
             : uniqueToAdd[0]?.gender
               ? t('addBar.addedWithGender', {
                   name: uniqueToAdd[0].name,
                   gender: uniqueToAdd[0].gender === 'M' ? t('gender.pillM') : t('gender.pillF'),
                 })
               : t('addBar.added', { name: uniqueToAdd[0]!.name });
       showUndo({
         message,
         actionLabel: t('common.undo'),
         onAction: () => commit(valueRef.current.filter((e) => !keys.has(e.key))),
       });
     }
     return Promise.resolve(skipped);
     ```
3. In `libs/web/screens/src/components/AddPeopleBar.tsx`:
   - Store `[duplicateHint, setDuplicateHint] = useState<string | null>(null)`.
   - Clear `duplicateHint` in `setName` or `handleKeyDown`.
   - In `submit`:
     ```typescript
     void pending.then((left) => {
       if (left.length === 1 && left[0]) {
         const restore = left[0].name;
         setName((current) => (current === '' ? restore : current));
         setDuplicateHint(t('addBar.duplicateHint'));
       }
     });
     ```
   - Render `duplicateHint` below input when present:
     `<span className="text-xs text-muted-foreground mt-1">{duplicateHint}</span>`
4. In `libs/web/screens/src/screens/CreateTrip.tsx`:
   In `handleSubmit`:
   ```typescript
   const existingNorms = new Set([
     normalizeName(user?.name || ''),
     ...people.map((p) => normalizeName(p.name)),
   ]);
   const typedName = draft.trim();
   const typedNorm = normalizeName(typedName);
   const shouldIncludeDraft = typedName !== '' && typedName.length <= 40 && !existingNorms.has(typedNorm);
   const roster: PersonEntry[] = shouldIncludeDraft
     ? [...people, { key: 'draft', name: typedName, gender: draftGender }]
     : people;
   ```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx nx test @cc/web-screens -t "CreateTrip deduplicates plain names"`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add libs/web/i18n/src/en.ts libs/web/i18n/src/vi.ts libs/web/screens/src/components/PeopleInput.tsx libs/web/screens/src/components/AddPeopleBar.tsx libs/web/screens/src/screens/CreateTrip.tsx libs/web/screens/src/components/__tests__/add-people-bar.test.tsx libs/web/screens/src/screens/__tests__/trips.test.tsx
git commit -m "feat(screens): deduplicate initial member names with Impeccable coaching (#71)"
```

---

### Task 4: Backend Name De-duplication in `POST /api/trips`

**Files:**
- Modify: `apps/api/src/trips/routes.ts:130-158`
- Modify: `apps/api/src/trips/routes.ts:220-240`
- Test: `apps/api/test/trips.test.ts:240-270`

**Interfaces:**
- Consumes: `normalizeName` from `@cc/core`, `POST /api/trips` handler in `apps/api/src/trips/routes.ts`.
- Produces:
  - `POST /api/trips` removes any entry matching `user.id` or `normalizeName(myName)`.
  - `POST /api/trips` deduplicates plain guest names by `normalizeName`, preserving the first entry.
  - Maintains existing 422 error check on duplicate `accountIds`.

- [ ] **Step 1: Write the failing tests in `apps/api/test/trips.test.ts`**

Add tests for plain name deduplication and organizer omission:
```typescript
it('silently deduplicates plain names and omits organizer from people array', async () => {
  const headers = { ...(await minh()), 'Content-Type': 'application/json' };
  const res = await call('/api/trips', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'Ninh Bình',
      myName: 'Minh',
      people: ['An', 'an', 'An ', 'Minh', 'Bình'],
    }),
  });
  expect(res.status).toBe(201);
  const { tripId } = await json<{ tripId: string }>(res);
  const v = await view(headers, tripId);
  expect(v.people.map((p) => p.name)).toEqual(['Minh', 'An', 'Bình']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test @cc/api -t "silently deduplicates plain names"`  
Expected: FAIL (currently inserts duplicate participants `['Minh', 'An', 'an', 'An ', 'Minh', 'Bình']`).

- [ ] **Step 3: Implement backend deduplication in `apps/api/src/trips/routes.ts`**

1. Retain existing validation on `accountIds` (ensuring 422 is thrown if an API caller sends duplicate account IDs):
   ```typescript
   const accountIds = people.flatMap((p) => (p.userId ? [p.userId] : []));
   if (accountIds.length > 0) {
     if (new Set(accountIds).size !== accountIds.length) {
       throw new ApiError('VALIDATION', 422, 'Invalid request');
     }
     ...
   }
   ```
2. Deduplicate `people` prior to creating database inserts:
   ```typescript
   const organizerNorm = normalizeName(myName);
   const nonOrganizerPeople = people.filter(
     (p) => !(p.userId && p.userId === user.id) && normalizeName(p.name) !== organizerNorm,
   );

   const seenNormalized = new Set<string>();
   const uniquePeople: typeof people = [];
   for (const p of nonOrganizerPeople) {
     const norm = normalizeName(p.name);
     if (seenNormalized.has(norm)) continue;
     seenNormalized.add(norm);
     uniquePeople.push(p);
   }
   ```
3. Insert `uniquePeople` into `participants`:
   ```typescript
   const otherParticipantInserts = uniquePeople.map((p, index) =>
     db.insert(participants).values({
       id: newId(),
       tripId,
       name: p.name,
       normalizedName: normalizeName(p.name),
       gender: p.gender ?? null,
       userId: p.userId,
       zaloSub: p.zaloSub,
       status: 'active',
       sortOrder: index + 1,
       createdAt: now,
     }),
   );
   ```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx nx test @cc/api -t "silently deduplicates plain names"`  
Expected: PASS  
Run full test suite: `npx nx test @cc/api -t "refuses the same account twice"`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/trips/routes.ts apps/api/test/trips.test.ts
git commit -m "fix(api): deduplicate plain names and omit organizer in trip creation (#71)"
```

---

### Task 5: Full Integration & Typecheck Verification

**Files:**
- Test all: `apps/api/test/trips.test.ts`, `libs/web/screens/src/screens/__tests__/trips.test.tsx`, `libs/web/screens/src/components/__tests__/add-people-bar.test.tsx`.

- [ ] **Step 1: Run typecheck and lint across workspace**

Run: `npm run typecheck`  
Expected: PASS (0 type errors).  
Run: `npm run lint`  
Expected: PASS (0 lint errors).

- [ ] **Step 2: Run all affected test suites**

Run: `npx nx test @cc/core`  
Expected: PASS  
Run: `npx nx test @cc/api`  
Expected: PASS  
Run: `npx nx test @cc/web-screens`  
Expected: PASS

- [ ] **Step 3: Commit any final test cleanups**

```bash
git commit --allow-empty -m "chore: verify full test suite for group creation and bank hardening (#71)"
```
