# Rewrite Part 2: adding people, and sign-out that forgets — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo the implementer for routine tasks is Gemini 3.8 Flash (High) in an Orca worktree (`gemini-execution` skill); tasks marked **Builder: Opus** are done by the planner, with the reason given.

**Goal:** Organisers add people one after another without being blocked: a docked add bar, gender pills on every row, look-alike names suggested rather than refused. Signing out makes the phone forget the person.

**Architecture:**
- **Server.** It stops refusing look-alike names and stops guests changing gender. Sign-out deletes this device's name picks and bill passes.
- **Client.** One new `AddPeopleBar` and one new `GenderPill` serve both the People screen and creating a group. The bottom bar and the snackbar ride above the on-screen keyboard. Sign-out clears the session token, the device id, the saved group links and the cached data. In the Mini App it also remembers the sign-out, so the next start doesn't silently sign the person back in.

**Tech Stack:** React 19, react-router 8, TanStack Query 5, Tailwind v4 + shadcn wrappers (`@cc/web-ui`), Vitest + Testing Library, Playwright, Hono + D1/Drizzle.

**Spec:** `docs/superpowers/specs/2026-11-05-app-rewrite-design.md` §5. The sign-out fix comes from the owner, 2026-11-05: "If a user logged out, revisit the site still remember them and allow seeing their info … Lets the sign out fix part of part 2". Its findings are below.

Branch `feat/rewrite-adding-people` (from `NguyenVuNhan/Nx-workspace` at 1bfd986). The PR targets `NguyenVuNhan/Nx-workspace`.

## Sign-out findings (reproduced 2026-11-05 on the e2e server)

- **Plain sign-out works.** Afterwards the `sid` cookie is gone, `/api/me` has no user, and `/` and `/groups` show the landing page.
- **The leak.** It needs a phone that picked a name on a group link, or a signed-in person who joined from one.
  - `POST /trips/:id/join` and `people/pick` both write a `device_participants` row ("this phone is Chi").
  - Opening a group link also saves `lt:<tripId>` in localStorage.
  - Neither is cleared at sign-out. Revisiting `/t/<id>` then lands on `/j/<token>` showing "Viewing as Chi · You owe Minh 150.000₫", with Chi's transfers and bank section.
- **Mini App.** `AccountMenu` never drops the bearer token, and `AppRoot.zaloBoot` silently signs a known Zalo user back in at every start.

## Global Constraints

- Only the organiser and admins add people; guests pick a name or sign in to join. Guests adding their own name stays removed. (spec §5, §2 non-goals)
- Money never changes: amounts, splits, approvals, confirmation rules and balances behave exactly as today. (spec §2 anti-goals)
- Look-alike names never stop someone from adding a person. (spec §2 anti-goals)
- `DESIGN.md` is the visual authority.
  - No raw hex, no `.css` per component, no nested cards, no shadows on flat content.
  - Gender never uses a money colour: neutral Muted Fill (`bg-muted`) for both genders.
- Touch targets ≥ 44px (`min-h-11` / a 44px hit area); fields `text-base`; phone first at 375px with no sideways scroll.
- Keep `fsl-*` classes and `data-testid` on the same elements. New elements get new `fsl-*` classes (`fsl-add-bar*`, `fsl-gender-pill*`, `fsl-people__like*`).
- Copy: English in `libs/web/i18n/src/en.ts`, Vietnamese in `vi.ts`, every new Vietnamese line ends with `// REVIEW`.
- Code goes by kind (CLAUDE.md "Where new code goes"); lint only through Nx (`npm run lint`).
- No schema change and no migration in this part. Never run `npm run deploy`, `db:migrate:remote` or `deploy:*`.
- **Test ownership.** Gemini may add new tests but never edits or deletes existing ones, and never runs tests. Opus updates the existing tests this plan names (spec §3, §5.1 "Changed on purpose") and runs every suite.

## Review Focus

1. **Vietnamese IME.** Telex on iOS/macOS ends a composition with an Enter (`keyCode 229` or `isComposing`). It must not add a half-typed name. → Task 6 test `ignores the Enter that ends an IME composition`.
2. **Rapid adds.** Names typed and added back-to-back while the previous request is in flight all land, in order. The field is never disabled, so the keyboard stays up. → Task 8 test `adds names typed back-to-back in order without disabling the field`.
3. **A failed add.** Offline, 422 or 403 puts the name back in an empty field and shows why; nothing is silently lost. → Task 8 test `a failed add puts the name back and says why`.
4. **Undo scope.** Undo after a second add only removes the second add's people. Undo of a pasted list removes every pasted person. → Task 8 test `Undo removes only the latest add, and all of a pasted list`.
5. **Reopening the group link after sign-out** (from the Zalo chat) shows "Who are you?" with no name chosen. In the Mini App the next start stays signed out. → Task 1 test `logout forgets who this phone picked`, Task 2 test `boots signed out after an explicit sign-out`, Task 11 e2e `signing out forgets who this phone was`.

---

### Task 1: Sign-out forgets this phone's picks (API)

**Builder: Opus.** DB write in the auth route (standing rule: core/DB work goes to Argon or Claude).

**Files:**
- Modify: `apps/api/src/auth/routes.ts:302-311` (`POST /auth/logout`)
- Test: `apps/api/test/auth.test.ts` (new cases in `describe('/api/me, logout, consent')`)

**Interfaces:**
- Produces: after `POST /api/auth/logout`, no `device_participants` or `device_expense_grants` row is left for the request's device (`c.get('deviceHash')`). Session deletion and `deleteCookie('sid')` stay as they are. The response is still `204`.

- [ ] **Step 1: Write the failing tests**

```ts
it('logout forgets who this phone picked, in every group, and its bill passes', async () => {
  await seedTrip();
  const { deviceId, cookie } = await newDevice();
  await pickAs(deviceId, PID.C);
  const hash = await sha256Hex(deviceId);
  await env.DB.prepare("INSERT INTO device_expense_grants (device_hash, trip_id, expense_root_id, participant_id, created_at) VALUES (?, ?, 'e-x', ?, '2026-11-05T00:00:00.000Z')").bind(hash, T.tripId, PID.C).run();
  const sid = await memberSid('u-chi', 'Chi');
  expect((await call('/api/auth/logout', { method: 'POST', headers: { Cookie: `${cookie}; sid=${sid}` } })).status).toBe(204);
  const v = await json<TripView>(call(`/api/trips/${T.tripId}`, { headers: { Cookie: cookie, 'X-Link-Token': T.groupToken } }));
  expect(v.me).toMatchObject({ kind: 'guest', participantId: null });
  expect((await env.DB.prepare('SELECT count(*) AS n FROM device_expense_grants WHERE device_hash = ?').bind(hash).first<{ n: number }>())!.n).toBe(0);
});

it('logout leaves other phones picks alone', async () => {
  await seedTrip();
  const mine = await newDevice();
  const other = await newDevice();
  await pickAs(mine.deviceId, PID.C);
  await pickAs(other.deviceId, PID.B);
  await call('/api/auth/logout', { method: 'POST', headers: { Cookie: mine.cookie } });
  const v = await json<TripView>(call(`/api/trips/${T.tripId}`, { headers: { Cookie: other.cookie, 'X-Link-Token': T.groupToken } }));
  expect(v.me.participantId).toBe(PID.B);
});
```

Imports to add: `seedTrip, newDevice, pickAs, memberSid, json, T, PID` from `./helpers`, `sha256Hex` from `@cc/api-util/ids`, `type TripView` from `@cc/core`.

- [ ] **Step 2: Run them and see them fail**

Run: `npx nx run api:test -- auth.test.ts` (or `npm test -w @cc/api -- auth.test.ts`)
Expected: the first test fails, because `me.participantId` is `'p-chi'`.

- [ ] **Step 3: Implement.** In `/auth/logout`, add a `db.batch` of two deletes, `deviceParticipants` and `deviceExpenseGrants` where `deviceHash = c.get('deviceHash')`. It runs whether or not a session was found. Add a comment saying why: a shared phone must not keep showing the person's group as them.

- [ ] **Step 4: Run the API suite.** Run: `npm test -w @cc/api`. Expected: all pass (`bearer-cors.test.ts`'s logout case included).

- [ ] **Step 5: Commit** `fix(api): signing out forgets this phone's name picks and bill passes`

---

### Task 2: Sign-out forgets on the client; the Mini App stays signed out

**Builder: Opus.** It touches session handling across platform, data-access and screens, which is security-sensitive.

**Files:**
- Modify: `libs/web/util/src/linkTokens.ts` (add `clearAll`)
- Modify: `libs/web/platform/src/session.ts` (add `clearDeviceId`)
- Create: `libs/web/data-access/src/signOut.ts`
- Modify: `libs/web/data-access/src/zaloSession.ts` (`zaloSignIn` clears the flag)
- Modify: `libs/web/screens/src/AppRoot.tsx` (`zaloBoot` skips the handshake when flagged)
- Modify: `libs/web/screens/src/components/AccountMenu.tsx:115-126` (calls `signOut`)
- Test: `libs/web/util/src/__tests__/linkTokens.test.ts` (create), `libs/web/screens/src/platform/__tests__/zaloSession.test.ts` (new cases), `libs/web/screens/src/components/__tests__/sign-out.test.tsx` (create)

**Interfaces:**
- Consumes: Task 1's server behaviour.
- Produces:
  - `linkTokens.clearAll(): void` removes every `lt:*` localStorage key and keeps the rest.
  - `sessionStore.clearDeviceId(): Promise<void>` sets the current id to null and removes `deviceId` from platform storage (or localStorage without a platform).
  - `SIGNED_OUT_KEY = 'signedOut'` and `signOut(platform: PlatformBridge, queryClient: QueryClient): Promise<void>`, both in `@cc/web-data-access/signOut`.
- **The order inside `signOut`:**
  1. `POST /api/auth/logout`. It throws on failure, and then nothing is forgotten, so the person can retry.
  2. `sessionStore.setToken(null)`, `sessionStore.clearDeviceId()`, `linkTokens.clearAll()` and `platform.storage.remove('zaloName')`.
  3. If `platform.kind === 'zmp'`, `platform.storage.set(SIGNED_OUT_KEY, '1')`.
  4. `queryClient.clear()`.

- [ ] **Step 1: Write the failing tests**
  - `linkTokens.test.ts` `clearAll removes saved group links only`: set `lt:t-1`, `lt:t-2` and `lang`. After `clearAll()`, `localStorage` keys are `['lang']`.
  - `zaloSession.test.ts`, `describe('bootApp in Zalo')`:
    - `boots signed out after an explicit sign-out`: `fakePlatform()` with `store.set('signedOut', '1')`. `bootApp(p)` makes no `POST /api/auth/zalo-mini` call, and `sessionStore.token()` is `null`.
    - `signing in with Zalo again clears it`: after `zaloSignIn` resolves `'signed_in'`, `p.store.has('signedOut')` is `false`.
  - `sign-out.test.tsx`, `signing out forgets this phone`:
    - Render `AccountMenu` signed in, inside a `PlatformProvider` with a zmp `fakePlatform` whose store has `sessionToken`, `deviceId` and `zaloName`, and with `lt:t-1` in localStorage.
    - Click the account button, then "Sign out".
    - Expect `POST /api/auth/logout`, then:
      - `p.store` has no `sessionToken`, `deviceId` or `zaloName`;
      - `p.store.get('signedOut') === '1'`;
      - `localStorage.getItem('lt:t-1')` is `null`;
      - the location is `/`.
  - `sign-out.test.tsx`, `a failed sign-out forgets nothing and shows the error`: logout answers 500, so `sessionToken` and `lt:t-1` stay and an alert shows.
- [ ] **Step 2: Run them and see them fail.** Run: `npx vitest run libs/web/util/src/__tests__/linkTokens.test.ts libs/web/screens/src/platform/__tests__/zaloSession.test.ts libs/web/screens/src/components/__tests__/sign-out.test.tsx`
- [ ] **Step 3: Implement** the interfaces above.
  - In `zaloBoot`, read `SIGNED_OUT_KEY` right before `await zaloHandshake(platform)` and return if it is `'1'`.
  - In `zaloSignIn`, remove the key once the person is signed in, inside the existing try that writes `zaloName`.
  - `AccountMenu` gets the platform from `usePlatform()`.
- [ ] **Step 4: Run** `npm test` and `npm run typecheck`. Expected: pass.
- [ ] **Step 5: Commit** `fix(web): signing out forgets the session, saved group links and device here`

---

### Task 3: Look-alike names never block; guests can't change gender (API)

**Builder: Opus.** API rule changes plus three existing tests that pin today's behaviour (spec §5.2, §5.3).

**Files:**
- Modify: `apps/api/src/participants/routes.ts`. In `addPersonToTrip` (lines 130-136), drop the refusal; `confirmNew` stays accepted and ignored. In `PATCH /trips/:id/people/:pid` (lines 520-529), any non-member gets 403.
- Modify: `apps/api/src/participants/join.ts:136-139`. Drop the refusal and the `findSimilarNames` import if it becomes unused.
- Test, updated by the architect:
  - `apps/api/test/participants.test.ts:45` → `guests cannot add a person; admins add a look-alike name straight away`. `{ name: 'Binh' }` without `confirmNew` is `201`, and the guest is still `403`.
  - `apps/api/test/roster-join.test.ts:34` → `a look-alike name joins straight away`. `post('/join', h, {})` is `201`.
  - `apps/api/test/admin-permissions.test.ts:230-232` → `Guest cannot change even their own gender -> 403`.

**Interfaces:**
- Produces: `POST /api/trips/:id/people` → `201 { participantId }` for any valid name (Task 8 uses it). `PATCH /people/:pid` → members only: admins any row, non-admins their own row.

- [ ] **Step 1: Update the three tests** as above, plus one new case in `participants.test.ts`: `the quick-expense ledger adds a look-alike too`. It goes through the same `addPersonToTrip` that `apps/api/src/me/ledger.ts` uses; post a look-alike to the ledger's add route and expect `201`. Find the route by reading `me/ledger.ts`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm test -w @cc/api -- participants roster-join admin-permissions`
- [ ] **Step 3: Implement.** Keep `findSimilarNames` in `routes.ts`, because `check-name` still uses it.
- [ ] **Step 4: Run** `npm test -w @cc/api`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(api): look-alike names are added, never refused; guests can't change gender`

---

### Task 4: The bottom bar and the snackbar ride above the keyboard

**Builder: Gemini.**

**Files:**
- Create: `libs/web/util/src/useKeyboardInset.ts`
- Modify: `libs/web/ui/src/components/BottomBar.tsx` (new `keyboardAware?: boolean` prop)
- Modify: `libs/web/ui/src/components/Snackbar.tsx` (always keyboard-aware)
- Modify: `libs/web/screens/src/components/Screen.tsx` (new `barAboveKeyboard?: boolean` prop, passed to `BottomBar` as `keyboardAware`)
- Test: `libs/web/util/src/__tests__/useKeyboardInset.test.ts` (create)

**Interfaces:**
- Produces: `useKeyboardInset(enabled = true): number`.
  - It returns how many px of the layout viewport the on-screen keyboard covers: `Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))`.
  - It updates on `visualViewport` `resize` and `scroll`. It is 0 without `visualViewport` or when `enabled` is false.
  - The `BottomBar` (when `keyboardAware`) and `Snackbar` apply `style={{ transform: inset ? \`translateY(-${inset}px)\` : undefined }}` to their outer fixed element. Below `lg` only: from `lg` the bottom bar is static, so `BottomBar` passes `enabled = keyboardAware && !matchMedia('(min-width: 1024px)').matches`.
  - `Screen`'s `barAboveKeyboard` is used by Task 8 only.

- [ ] **Step 1: Write the failing tests** with a stubbed `window.visualViewport` (an `EventTarget` with `height` and `offsetTop`) and `innerHeight = 800`:
  - `is 0 without a keyboard`: `height: 800`.
  - `is the covered height when the keyboard is up`: `height: 500, offsetTop: 0` → `300`, after dispatching `resize`.
  - `subtracts the page scroll offset`: `height: 500, offsetTop: 40` → `260`.
  - `is 0 when disabled`.
  - `is 0 without visualViewport`.
- [ ] **Step 2:** Opus runs `npx vitest run libs/web/util/src/__tests__/useKeyboardInset.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the hook and the three props above. Classes are unchanged; only the inline transform is added.
- [ ] **Step 4:** Opus runs `npm test` and `npm run typecheck`. Expected: pass; Snackbar and BottomBar tests unchanged.
- [ ] **Step 5: Commit** `feat(web-ui): bottom bars and the snackbar stay above the keyboard`

---

### Task 5: GenderPill

**Builder: Gemini.**

**Files:**
- Create: `libs/web/screens/src/components/GenderPill.tsx`
- Modify: `libs/web/i18n/src/en.ts`, `libs/web/i18n/src/vi.ts`
- Test: `libs/web/screens/src/components/__tests__/gender-pill.test.tsx` (create)

**Interfaces:**
- Produces: `GenderPill({ name, value, editable, onChange, disabled }: { name: string; value: Gender | null; editable: boolean; onChange?: (next: Gender) => void; disabled?: boolean })`.
  - **Editable, with a gender:** a `<button type="button">` showing the `mars`/`venus` Icon (14px) and `t('gender.pillM' | 'gender.pillF')`. Its accessible name is `t('gender.pillLabel', { name, gender })`. A tap calls `onChange` with the other gender. No swap icon.
  - **Editable, without a gender:** a button labelled `t('gender.set')`. It opens `ActionSheet` (`@cc/web-ui/components/ActionSheet`) titled `t('gender.label', { name })` with two actions (`icon: 'mars'`/`'venus'`, labels `gender.pillM`/`gender.pillF`), each calling `onChange`.
  - **Not editable:** plain text (`fsl-gender-pill fsl-gender-pill--text text-sm text-muted-foreground`), with the same icon and label, or nothing when `value` is null.
  - **Look:**
    - Visible pill `h-7 px-2.5 rounded-full bg-muted text-foreground text-sm font-semibold inline-flex items-center gap-1`.
    - A 44px hit area through `relative after:absolute after:-inset-x-1 after:-inset-y-2 after:content-['']` (no layout growth).
    - `focus-visible:ring-2 ring-ring`.
    - Classes `fsl-gender-pill fsl-gender-pill--M|F|unset`.
- Copy (en / vi):
  - `gender.pillM`: Male / Nam
  - `gender.pillF`: Female / Nữ
  - `gender.pillLabel`: `Gender for {name}: {gender}` / `Giới tính của {name}: {gender}`
  - `gender.set`: Set gender / Chọn giới tính
  - `gender.changed`: `{name} · {gender}` (both)

- [ ] **Step 1: Write the failing tests:**
  - `flips Male to Female in one tap`: `onChange` is called with `'F'`; the button name is `Gender for Chi: Male`.
  - `Set gender opens the two choices`: clicking `Set gender` then `Female` calls `onChange('F')`.
  - `shows plain text to people who can't change it`: no button; the text is `Male`.
  - `shows nothing for an unknown gender when not editable`.
  - `never uses a money colour`: `className` contains `bg-muted` and none of `success|danger|warning`.
- [ ] **Step 2:** Opus runs `npx vitest run libs/web/screens/src/components/__tests__/gender-pill.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Opus runs `npm test -w @cc/web-i18n` (key parity, review markers) and the new test → PASS.
- [ ] **Step 5: Commit** `feat(web): gender pill (tap to flip, neutral colour)`

---

### Task 6: AddPeopleBar

**Builder: Gemini.**

**Files:**
- Create: `libs/web/screens/src/components/AddPeopleBar.tsx`
- Modify: `libs/web/i18n/src/en.ts`, `libs/web/i18n/src/vi.ts`
- Test: `libs/web/screens/src/components/__tests__/add-people-bar.test.tsx` (create)
- Read first: `libs/web/screens/src/components/PeopleInput.tsx`. Its keyboard handling, paste splitting and suggestion combobox are ported as they are.

**Interfaces:**
- Produces:

```ts
export interface NewPerson { name: string; gender: Gender | null; userId?: string }
export interface AddPeopleBarProps {
  /** Sport groups: "+ Male" and "+ Female". Trip groups: one "+ Add". */
  sport: boolean;
  /** Resolves with the people that could NOT be added (empty when all were). */
  onAdd(people: NewPerson[]): Promise<NewPerson[]>;
  /** Creating a group: suggest friends from your other groups; these userIds are already listed. */
  suggest?: { exclude: Set<string> };
}
export function AddPeopleBar(props: AddPeopleBarProps): JSX.Element
```

- **The field.** `Input` (`fsl-add-bar__field fsl-input`, `text-base`), `maxLength={40}`, `autoComplete="off"`, `enterKeyHint="done"`, placeholder `t('create.otherPlaceholder')` ("Name"). Its accessible name is `t('addBar.nameLabel')`. With `suggest` it is a `role="combobox"`, exactly as in `PeopleInput`. It is never disabled.
- **Buttons** (`fsl-add-bar__add`, secondary `Button`, `min-h-11`, disabled while the trimmed field is empty):
  - Sport: `t('addBar.addM')` and `t('addBar.addF')`. Each adds the typed name with that gender and remembers it as the last-used gender.
  - Trip: `t('addBar.add')` adds with `gender: null`.
  - Every button has `onMouseDown={e => e.preventDefault()}` so the field keeps focus and the keyboard stays up.
- **Enter** adds with the last-used gender (initially `'M'`, today's default; trip groups: `null`). Enter on a highlighted suggestion picks it. The IME guard is `e.nativeEvent.isComposing || e.keyCode === 229` → do nothing. Enter always calls `preventDefault()`, so a form never submits.
- **Every add:** call `onAdd([...])`, then clear the field at once and keep focus. If the promise resolves with exactly one person left and the field is still empty, put that name back.
- **Paste.** Text containing `,` `\n` or `\r` is split on `/[,\n\r]+/`, trimmed, emptied lines dropped, each cut to 40. One `onAdd` call gets all of them with `gender: null`, and the field text stays as it was. A paste without separators fills the field normally.
- **Suggestion pick** (click, or Enter on the highlighted one): `onAdd([{ name: p.name, userId: p.userId, gender: sport ? lastGender : null }])`.
- **Layout:** `fsl-add-bar flex items-center gap-2 w-full`; the field is `flex-1 min-w-0`. The suggestion dropdown opens upward (`bottom-[calc(100%+4px)]`), because the bar sits at the bottom.
- Copy (en / vi):
  - `addBar.nameLabel`: Name to add / Tên người cần thêm
  - `addBar.add`: + Add / + Thêm
  - `addBar.addM`: + Male / + Nam
  - `addBar.addF`: + Female / + Nữ
  - `addBar.added`: `Added {name}` / `Đã thêm {name}`
  - `addBar.addedWithGender`: `Added {name} · {gender}` / `Đã thêm {name} · {gender}`
  - `addBar.addedMany`: `Added {count} people` / `Đã thêm {count} người`

- [ ] **Step 1: Write the failing tests.** `onAdd` is a `vi.fn(async () => [])`; the suggestion cases use `mockApi({ 'GET /api/me/people': [chi, chau] })` as in `trips.test.tsx`.
  - `trip group: + Add adds the name, clears the field and keeps focus` → `onAdd([{ name: 'An', gender: null }])`, the field value is `''`, and the field has focus.
  - `sport group: + Female adds with Female, then Enter reuses it` → calls `[{name:'Lan',gender:'F'}]`, then `[{name:'Hoa',gender:'F'}]`.
  - `sport group: Enter before any button adds as Male`.
  - `ignores the Enter that ends an IME composition` → `fireEvent.keyDown(field, { key: 'Enter', keyCode: 229 })` makes no call and leaves the value unchanged.
  - `Enter is always cancelled, so no form submits` → `fireEvent.keyDown(...)` returns `false`.
  - `buttons are disabled for an empty or blank name`.
  - `pasting a list adds every name in one call` → `'An, Bình\nChi'` gives `[An, Bình, Chi]`, all `gender: null`, with the field unchanged.
  - `pasting one name just fills the field`.
  - `a name that could not be added comes back into an empty field` → `onAdd` resolves `[{ name: 'An', gender: null }]`, and the field value becomes `'An'`.
  - `suggests friends from other groups and adds their account` → typing `ch` opens the listbox `From your recent trips`; clicking `Chi Trần` calls `[{ name: 'Chi Trần', userId: 'u-chi', gender: null }]`.
  - `arrow keys choose a suggestion and Escape closes the list` (ported from `trips.test.tsx`).
  - `listed accounts are not suggested` → `exclude: new Set(['u-chi'])`.
- [ ] **Step 2:** Opus runs `npx vitest run libs/web/screens/src/components/__tests__/add-people-bar.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Opus runs the test, `npm test -w @cc/web-i18n` and `npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(web): add bar for adding people one after another`

---

### Task 7: Creating a group uses the add bar

**Builder:** Opus rewrites the existing tests (Step 1); Gemini implements (Step 3).

**Files:**
- Modify (rewrite): `libs/web/screens/src/components/PeopleInput.tsx`. Same export and same `fsl-people-input*` row and remove classes; the per-line inputs are gone.
- Modify: `libs/web/screens/src/screens/CreateTrip.tsx`. Initial roster `[]`; the organiser's gender state.
- Test (architect): `libs/web/screens/src/screens/__tests__/trips.test.tsx` (`describe('CreateTrip')` and `describe('CreateTrip people')`), and `libs/web/screens/src/test/sportGroup.test.tsx` (first case).

**Interfaces:**
- Consumes: `AddPeopleBar`, `NewPerson` (Task 6); `GenderPill` (Task 5); `showUndo` (`../components/UndoSnackbarHost`); `newPersonEntry`, `PersonEntry` (`@cc/web-util/recentPeople`).
- Produces: `PeopleInput({ value, onChange, showGender, me }: { value: PersonEntry[]; onChange(v: PersonEntry[]): void; showGender?: boolean; me?: { name: string; gender: Gender | null; onGenderChange(g: Gender): void } })`.
  - **Layout:** label `create.others`, then a white grouped list (`fsl-people-input__list bg-card border border-border rounded-xl divide-y divide-border`).
  - **The organiser's row** comes first: Avatar, name and the `trip.you` sub-line, with no remove button; it has a `GenderPill` (editable) when `showGender`.
  - **Then one row per entry:**
    - Avatar and name.
    - An account row keeps the `UserCheck` icon and `aria-label={t('create.hasAccount', { name })}`.
    - A `GenderPill` (editable, flips the entry) when `showGender`.
    - The 44px remove button (`fsl-people-input__remove`, `aria-label` `create.removePerson`).
  - **The hint** `create.alreadyListed` stays under a plain row whose `normalizeName` equals an account row's.
  - **The add bar** goes under the list, with `<AddPeopleBar sport={showGender} suggest={{ exclude }} onAdd={…} />`. `onAdd` appends `newPersonEntry(name, userId, gender)` for each, then calls `showUndo({ message, actionLabel: t('common.undo'), onAction })`. Undo removes exactly those keys. It resolves `[]`. The message uses `addBar.added`, `addBar.addedWithGender` or `addBar.addedMany`.
- `CreateTrip`:
  - Holds `myGender` (`useState<Gender | null>(null)`) and uses `myGender ?? user?.gender ?? null`.
  - Passes `me` when `user` is known.
  - In a sport group it sends `myGender` when that is non-null. The rest of the POST body is unchanged.

- [ ] **Step 1 (Opus): Rewrite the CreateTrip people tests.** Render `<><CreateTrip /><UndoSnackbarHost /></>` where the snackbar is asserted.
  - Kept as they are: `the back arrow returns to the groups list`; `needs a trip name and allows creating with empty members` (`people: []`); `works without suggestions when the list fails to load`; `shows why the trip could not be created next to the button`.
  - `posts the trip and opens it without asking for your name`: type `An` + Enter, then `Bình` + Enter, in the `Name to add` field. The posted `people` is `[{ name: 'An' }, { name: 'Bình' }]`.
  - `Enter adds a row and never submits`: rows `An` and `Bình`, nothing posted, and the field is focused and empty.
  - `pasting a list adds one row per name`: `'An, Bình\nChi'`, then `' Dũng ,, \r\n Em,'` → rows `An, Bình, Chi, Dũng, Em`.
  - `suggests people with an account and adds their account`: the row `Chi Trần · has an account`; the posted body includes `{ name: 'Chi Trần', userId: 'u-chi' }`; `/api/me/people` is fetched once.
  - `an account cannot be picked twice`.
  - `warns when a typed name matches a picked account, and the group can still be created`.
  - `the warning goes away when the account row is removed`.
  - New: `your own row is first and has no remove button`.
  - New: `Undo removes the rows just added`.
  - Removed on purpose (no per-line inputs any more, spec §5.1): `Enter on a line above an empty one moves to it…`, `Backspace on an empty line removes it`, `a suggestion chosen on one line is never picked by Enter on another`, `a suggestion highlighted but not chosen stays with its line`, `handles Enter itself…` (now in Task 6), `the Enter that ends an IME composition…` (now in Task 6), `Enter without a chosen suggestion…` (folded into `Enter adds a row`), `removing the account row leaves a line to type in`.
  - `sportGroup.test.tsx` first case, `submits preset="sport", myGender, and per-person gender from CreateTrip`:
    - Add `Lan` with `+ Female` and `Chi` with `+ Male`.
    - Tap `Gender for Chi: Male` to flip it to Female.
    - Set your own pill to Male.
    - Expected body: `people: [{ name: 'Lan', gender: 'F' }, { name: 'Chi', gender: 'F' }], myGender: 'M', preset: 'sport'`.
- [ ] **Step 2 (Opus): Run them and see them fail.** `npx vitest run libs/web/screens/src/screens/__tests__/trips.test.tsx libs/web/screens/src/test/sportGroup.test.tsx`
- [ ] **Step 3 (Gemini): Implement** `PeopleInput` and `CreateTrip` per the Interfaces. The brief carries the rewritten tests' path as the target behaviour.
- [ ] **Step 4 (Opus): Run** `npm test`, `npm run typecheck` and `npm run lint`. Expected: pass.
- [ ] **Step 5: Commit** `feat(web): creating a group adds people with the add bar`

---

### Task 8: The People screen: docked add bar, gender pills, look-alike hint, Undo

**Builder:** Opus updates the existing tests (Step 1); Gemini implements (Step 3).

**Files:**
- Create: `libs/web/data-access/src/tripPeople.ts`
- Modify: `libs/web/screens/src/screens/People.tsx`
- Modify: `libs/web/i18n/src/en.ts`, `libs/web/i18n/src/vi.ts`
- Test (architect, existing):
  - `libs/web/screens/src/screens/__tests__/people-add-similar.test.tsx` (rewritten to the hint behaviour);
  - `libs/web/screens/src/test/sportGroup.test.tsx` case `toggles a player gender in People screen when preset is sport`.
- Test (new): `libs/web/screens/src/screens/__tests__/people-add-bar.test.tsx`

**Interfaces:**
- Consumes: Task 3's API; `AddPeopleBar`/`NewPerson` (Task 6); `GenderPill` (Task 5); `Screen`'s `barAboveKeyboard` (Task 4); `showUndo` (`../components/UndoSnackbarHost`); `findSimilarNames` (`@cc/core`).
- Produces:
  - `addTripPerson(tripId: string, input: { name: string; gender?: Gender }): Promise<string>` → `POST /api/trips/:id/people` with `X-Link-Token` via `apiSend(path, 'POST', input, tripId)`. It returns `participantId`.
  - `removeTripPerson(tripId: string, participantId: string): Promise<void>` → `DELETE`.
- **The bar.** When the add form shows today (not archived, member, admin or organiser), `Screen` gets `barAboveKeyboard` and `bottomBar={<>{addError && <p role="alert" className="fsl-people__add-error m-0 text-sm text-danger">…</p>}<AddPeopleBar sport={isSport} onAdd={addPeople} /></>}`. The old add form, the `similar` block and both `GenderToggle` uses go.
- **`addPeople(people)`.** It is chained on a `useRef<Promise<unknown>>` queue, so adds made back-to-back reach the server one at a time, in order.
  - Posts each with `addTripPerson` (gender only in sport groups and when non-null), collecting `{ id, name, gender }`.
  - Stops at the first failure: `addError = t('people.addFailed', { names })` plus the error's message. It resolves the people not added.
  - After the loop: `invalidateQueries(['trip', tripId])`, then `showUndo` with the `addBar.*` message. Its Undo removes those ids one by one with `removeTripPerson`, invalidates, and drops their hints.
  - It then scrolls the last new row into view (`[data-person-id="<id>"]`, `scrollIntoView({ block: 'nearest' })`) once it appears in `view.people`.
- **The look-alike hint.** For each added person, match against `findSimilarNames(name, others)`. `others` is the non-left people of the view at the moment of adding, plus those added earlier in the same batch. The first match is kept in `hints: Record<newId, { id; name }>`. Under that row:

  ```tsx
  <div className="fsl-people__like flex items-center gap-2 px-4 pb-3 text-sm text-muted-foreground">
    {t('people.likeHint', { name })} <Button variant="ghost" …>{t('people.likeMerge')}</Button> <button aria-label={t('people.likeDismiss')} className="… size-11"><Icon name="close" /></button>
  </div>
  ```

  **Merge** asks `window.confirm(t('people.mergeConfirm', { from: newName, into: match.name }))`, then calls `run('/people/merge', { fromId: newId, intoId: match.id })` and drops the hint. **Dismiss** drops the hint. Hints live only while the screen is open.
- **Gender on rows** (sport groups):
  - `editable = !archived && view.me.kind === 'member' && (view.me.isAdmin || view.me.isOrganiser || person.id === view.me.participantId)`.
  - `onChange(next)` sends `PATCH { gender: next }`, then `showUndo({ message: t('gender.changed', { name, gender }), onAction: PATCH { gender: previous } })`. `previous` may be `null`.
  - The amber Nữ pill goes; trip groups show no pill.
- Every person `<li>` gains `data-person-id={person.id}`; the existing classes are kept.
- Copy (en / vi):
  - `people.likeHint`: `Like {name}?` / `Giống {name}?`
  - `people.likeMerge`: Merge / Gộp
  - `people.likeDismiss`: Not the same person / Không phải cùng một người
  - `people.addFailed`: `Couldn't add {names}.` / `Không thêm được {names}.`

- [ ] **Step 1 (Opus): Update the existing tests.**
  - `people-add-similar.test.tsx`:
    - `a look-alike is added straight away, with a Merge hint` → `POST /people` body `{ name: 'Binh' }` (no `confirmNew`); the text `Like Bình?` shows.
    - `Merge offers to move the new person into the look-alike` → stub `window.confirm` to return true; POST `/people/merge` `{ fromId: <new id>, intoId: PIDS.B }`.
    - `the hint can be dismissed`.
    - `a name like nobody else is added straight away, without a hint`.
  - `sportGroup.test.tsx` People case → the pill `Gender for Chi: Male` sends PATCH `{ gender: 'F' }`; clicking Undo in the snackbar sends PATCH `{ gender: 'M' }`.
- [ ] **Step 2 (Opus): Specify the new test file** `people-add-bar.test.tsx` for Gemini to write. Render `<><People /><UndoSnackbarHost /></>` at `/t/t-1/people`.
  - `admins get the add bar; members and guests don't`.
  - `sport group shows + Male and + Female; trip group shows + Add`.
  - `adds names typed back-to-back in order without disabling the field` → in a sport group, type `An`+Enter then `Bình`+Enter without awaiting. The POST bodies, in order, are `[{name:'An',gender:'M'},{name:'Bình',gender:'M'}]`, and the field is never `disabled`.
  - `a failed add puts the name back and says why` → POST answers 422 `{ error: { code: 'VALIDATION', message: 'Invalid request' } }`. The field value is `An`, and an alert contains `Couldn't add An.`.
  - `Undo removes only the latest add, and all of a pasted list` → add `An` (id `p-new-1`), then paste `'Bảo\nCúc'` (ids `p-new-2`, `p-new-3`), then Undo. The DELETEs are exactly `/people/p-new-2` and `/people/p-new-3`.
  - `the snackbar names the person and gender` → `Added Lan · Female`.
  - `members change only their own gender; guests change none` → member An: their own row has a button, Bình's row has plain text; a guest view has no gender buttons.
  - `scrolls the new row into view` → `Element.prototype.scrollIntoView` mocked, called once the row with `data-person-id="p-new-1"` renders.
- [ ] **Step 3 (Gemini): Implement** `tripPeople.ts`, `People.tsx` and the copy, and write `people-add-bar.test.tsx` per Step 2.
- [ ] **Step 4 (Opus): Run** `npm test`, `npm run typecheck` and `npm run lint` → PASS.
- [ ] **Step 5: Commit** `feat(web): People screen adds with a docked bar, gender pills and look-alike hints`

---

### Task 9: "You play as" when joining a sport group

**Builder:** Opus updates the existing tests (Step 1); Gemini implements (Step 3).

**Files:**
- Modify: `libs/web/screens/src/screens/WhoAreYou.tsx:663-673` (the `joinStep === 'gender'` block)
- Modify: `libs/web/i18n/src/en.ts`, `libs/web/i18n/src/vi.ts`
- Test (architect): `libs/web/screens/src/screens/__tests__/who-join.test.tsx` case `asks for a gender first when the group needs one`

**Interfaces:**
- Produces: in place of the lone `GenderToggle`, a labelled choice inside `fsl-who__join-gender` (kept on the wrapper):
  - A `role="radiogroup"` labelled by a `text-sm font-semibold` span `t('who.playAs')`.
  - Two `role="radio"` pill buttons (`min-h-11 px-5 rounded-full border border-border`, Icon `mars`/`venus` and `gender.pillM`/`gender.pillF`). Selected is `bg-secondary text-secondary-foreground border-transparent`, with `aria-checked`.
  - The reason line `t('who.playAsHint')` in `text-sm text-muted-foreground`, referenced by `aria-describedby`.
  - The existing bottom-bar Join button stays disabled until one is chosen.
- Copy (en / vi):
  - `who.playAs`: You play as / Bạn chơi là
  - `who.playAsHint`: Used to split court costs. You can change it later. / Dùng để chia tiền sân. Bạn có thể đổi sau.

- [ ] **Step 1 (Opus): Update the test.**
  - Inside `getByRole('radiogroup', { name: 'You play as' })`, click `radio` `Male`.
  - The Join body is `{ gender: 'M' }`.
  - `Used to split court costs. You can change it later.` is shown.
  - `Join as Dũng` is disabled before the choice.
- [ ] **Step 2 (Opus): Run it and see it fail.** `npx vitest run libs/web/screens/src/screens/__tests__/who-join.test.tsx`
- [ ] **Step 3 (Gemini): Implement.**
- [ ] **Step 4 (Opus): Run** `npm test` and `npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(web): joining a sport group asks "You play as" with two clear choices`

---

### Task 10: Clean-ups and docs

**Builder: Opus.** It deletes files and keys (Gemini doesn't delete) and edits the design authority.

**Files:**
- Delete: `libs/web/screens/src/components/GenderToggle.tsx` (no users left after Tasks 7–9).
- Modify: `libs/web/util/src/recentPeople.ts`. Remove `nextGender` and its test cases if nothing imports it (spec §5.5: the three-state cycle is retired).
- Modify: `libs/web/i18n/src/en.ts`, `vi.ts`. Remove `who.someoneNew`, `who.newTitle`, `who.newHint` and `who.newPendingNote` (spec §5.5). Remove also any key left unused by this part, after checking each with grep: `people.similar`, `people.addAnyway`, `create.addPerson`, `gender.unset`.
- Modify: `PRODUCT.md:61` → "Guest expenses and guest bank details wait for a member's approval. Guests don't add names: they pick one, or sign in to join."
- Modify: `DESIGN.md`:
  - **Components:** add "Add bar" (docked on People, inline when creating a group; field plus `+ Male`/`+ Female` or `+ Add`; Enter, paste, Undo snackbar; rides above the keyboard).
  - **Components:** add "Gender pill" (Muted Fill, never a money colour; small visible pill with a 44px hit area; admins flip any row, members their own, guests none; the one pill that is a button).
  - **Pills section:** amend "Pills are not buttons" to name that exception.
  - **Snackbar:** note it rides above the keyboard.
  - **Frontmatter:** add `gender-pill` and `add-bar` component tokens in the same shape as `snackbar`.
- Modify: `.impeccable/design.json`. Add matching `components` entries (same shape as the existing ones) and bump `generatedAt`.

- [ ] **Step 1:** `grep -rn "GenderToggle\|nextGender\|who.someoneNew\|who.newTitle\|who.newHint\|who.newPendingNote\|people.similar\|people.addAnyway\|create.addPerson\|gender.unset" libs apps e2e`. Every hit outside the locale files and this cleanup is a blocker; fix it before deleting.
- [ ] **Step 2:** Make the deletions and doc edits.
- [ ] **Step 3:** Run `npm test`, `npm run typecheck` and `npm run lint` → PASS (the i18n parity and review-marker tests included).
- [ ] **Step 4: Commit** `chore: retire GenderToggle and unused add-name copy; document the add bar and gender pill`

---

### Task 11: e2e, the full check, and the tunnel handoff

**Builder:** Opus updates the existing e2e specs and runs everything; Gemini writes the new spec.

**Files:**
- Modify (architect):
  - `e2e/golden-path.spec.ts:41-46`: add An, Bình and Chi through the `Name to add` field with Enter.
  - `e2e/payment-share.spec.ts:283-284`: `getByRole('radiogroup', { name: 'You play as' }).getByRole('radio', { name: 'Male' })`.
  - `e2e/walkthrough.spec.ts:144-151` and `:626`: the same, in en and vi; vi field label `Tên người cần thêm`, vi radiogroup `Bạn chơi là`, vi radio `Nam`.
- Create (Gemini): `e2e/adding-people.spec.ts`, using the helpers in `e2e/payment-share.spec.ts` (`loginAndConsent`, `englishContext`, `noSidewaysScroll`):
  - `an organiser adds a sport roster fast`:
    - Create a sport group; add `Lan` with `+ Female` and `Minh Anh` with Enter.
    - Open People; add `Hùng`+Enter, `Tú`+Enter, then paste `"Quân\nVy"`.
    - Every name shows, in order. Flip Tú to Female and see `Gender for Tú: Female`; Undo; it's Male again.
    - A 40-character name leaves no sideways scroll at 375px.
  - `a look-alike is added and offered as a merge`: add `Binh` when `Bình` exists; the row shows; `Like Bình?`; accept the dialog on Merge; one Bình row remains.
  - `signing out forgets who this phone was`:
    - A guest picks Chi on `/j/<token>`, signs in through `/api/test/login`, then signs out from the account menu.
    - `/t/<id>` doesn't show `Viewing as Chi`.
    - `/j/<token>` shows `Who are you?` with no radio checked.

- [ ] **Step 1 (Opus):** update the three existing specs.
- [ ] **Step 2 (Gemini):** write `e2e/adding-people.spec.ts`.
- [ ] **Step 3 (Opus):**
  - Run `npm test`, `npm run typecheck`, `npm run lint`, then `npm run e2e` (it builds first).
  - Run `npm run build -w @cc/web && WALKTHROUGH=1 npm run e2e -- e2e/walkthrough.spec.ts`.
  - Expected: all pass.
- [ ] **Step 4 (Opus):**
  - Final whole-branch review and one fix wave; typecheck before committing it.
  - Push `feat/rewrite-adding-people` and open the PR with base `NguyenVuNhan/Nx-workspace`.
- [ ] **Step 5 (Opus): Hand off.**
  - Restart the tunnel (`npm run tunnel`; the earlier one is stale after any rebuild).
  - Probe it in headless Chrome: no page errors, no 4xx/5xx, JS served as JavaScript.
  - Check it on the phone over adb (Zalo "Coin crew Test" group only): the docked bar with the keyboard up; the snackbar visible while typing; signing out in Zalo's browser.
  - Then hand the tunnel to the owner and wait for their approval.
  - Once merged, remove the logout line from the `rewrite-bug-backlog` memory.
