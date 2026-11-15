# Sổ chi tiêu: switch, guard and empty screen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **This repo's routing (`CLAUDE.md`):** each task runs as an Orca worker through the `gemini-execution` skill. Workers may add tests, never edit or delete existing ones, and never run them; the planner runs every "Run" step and reviews the diff before accepting a task.

**Goal:** Add the per-user personal-area setting (a row in the account menu that any signed-in user can flip) with its server guard, and show switched-on users the renamed first section "Sổ chi tiêu" with its empty screen, while every other user sees exactly today's app.

**Architecture:** A new table `user_personal_settings` holds the switch; `GET /api/me` reports it only when it is on, and a `requirePersonal` middleware refuses everyone else. On the web, `usePersonalArea()` reads that flag; `/trips` renders `SpendingBook` (today's `Home` with a different title and summary block) when it is on, the nav's first item changes its label and icon, and a new `/people` page holds the per-person list.

**Tech Stack:** Cloudflare Workers + D1 (hand-written SQL migrations, Drizzle schema), Hono, React 19, React Router v7, TanStack Query, Tailwind v4 + shadcn wrappers in `@cc/web-ui`, Vitest (`cloudflare:test` for the API, Testing Library for the web), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-15-spending-book-shape-and-navigation-design.md` (mockup: `docs/superpowers/mockups/v7-spending-book.html`). Read both before any task.

## Global Constraints

- **Additive only.** The migration only creates a table. Never alter or drop a Phase 1 table or column, and never add a column to one.
- **Do not edit the group money code:** `libs/api/db/src/commit.ts`, `computeBalances` / `computeShares` / `suggestTransfers` (`libs/shared/core`), `apps/api/src/trips/snapshot.ts`, `apps/api/src/me/balances.ts`, `apps/api/src/me/settle.ts`, `apps/api/src/me/ledger.ts`, `libs/api/auth/src/device.ts`, the expense and payment routes. Importing from them is allowed.
- **Never edit or delete an existing test** (that includes `apps/api/test/setup.ts` and `helpers.ts`). New tests go in new files.
- **Setting off means today's app:** `GET /api/me` omits `personalArea` when it is off (existing tests assert the exact body), the nav label and icon are unchanged, `/trips` is `Home`. The single visible addition for everyone is the setting's row in the account menu (spec S25).
- **No popup and no wallet in this sub-task** (spec S19, S26): turning the setting on shows the empty screen. The popup is #113's.
- **Naming:** the new code is `personal` / `SpendingBook` / `book.*`. Never `ledger`; never extend `apps/api/src/me/ledger.ts`.
- **UI:** components from `@cc/web-ui` (wrappers first), theme tokens only, no raw hex, no per-component `.css`; touch targets `min-h-11`; keep existing `fsl-*` classes and `data-testid`s on the same elements.
- **Copy:** Vietnamese first, English second; every new line in `vi.ts` ends with `// REVIEW`.
- **Imports:** relative inside a library, package name across libraries; no `@/`.
- **Commands:** `npm test`, `npm run typecheck`, `npm run lint` (through Nx only). One package: `npm test -w <package>`; one file: `npm test -w <package> -- <file>`.
- **Cost:** `GET /api/me` +1 query and +1 row read; the guard 1 query and 1 row read; no rows written by any request.
- **Deviation from the spec, on purpose:** the web does not call `GET /api/me/personal` in this sub-task (nothing on the empty screen needs it), so opening Sổ chi tiêu costs exactly what Home costs today.

## Review Focus

1. **A shared phone:** a switched-on user signs out and a switched-off user signs in. The cached hint must not show the second user "Sổ chi tiêu". (Task 3)
2. **A row that says off:** `user_personal_settings.enabled = 0` behaves exactly like no row, in `GET /api/me` and in the guard. (Task 2)
3. **The switch is taken away:** the phone still holds the hint but the server now says off. The app falls back to Home and forgets the hint. (Task 3)
4. **A deep link on a phone:** a switched-on user opening `/trips?expense=<id>` is still sent to that quick expense's own page, as today. (Task 6)
5. **Signed out at `/people`:** ends on the landing page, never on a blank or personal screen. (Task 6)
6. **Turned off while on `/people`:** the page leaves for `/trips` as soon as the setting is off. (Task 6)
7. **The save fails:** the switch in the account menu flips back and says why; the app does not half-switch. (Task 4b)

## File Structure

| File | Responsibility |
|---|---|
| `apps/api/migrations/0025_personal_area.sql` (new) | Creates `user_personal_settings` |
| `libs/api/db/src/schema.ts` (modify) | `userPersonalSettings` table definition |
| `libs/api/auth/src/personal.ts` (new) | `isPersonalAreaOn`, `requirePersonal` |
| `libs/api/auth/src/me.ts` (modify) | `buildMeResponse` adds `personalArea: true` when on |
| `libs/shared/core/src/api-types.ts` (modify) | `MeResponse.personalArea?: boolean` |
| `apps/api/src/personal/routes.ts` (new) | `GET /me/personal` (guarded) and `PATCH /me/personal` (the setting) |
| `apps/api/src/app.ts` (modify) | Mounts `personalRoutes()` |
| `libs/web/data-access/src/hooks.ts` (modify) | `useMe` keeps `personalArea`; `usePersonalArea()` |
| `libs/web/data-access/src/personalHint.ts` (new) | The first-paint hint in `localStorage` |
| `libs/web/data-access/src/personal.ts` (new) | `useSetPersonalArea()` |
| `libs/web/screens/src/components/AccountMenu.tsx` (modify) | The setting's row |
| `libs/web/ui/src/components/icons.tsx` (modify) | `wallet` icon |
| `libs/web/i18n/src/vi.ts`, `en.ts` (modify) | `nav.book`, `book.*` |
| `libs/web/screens/src/components/AppNav.tsx` (modify) | First item's label and icon follow the switch |
| `libs/web/screens/src/components/PeopleSummary.tsx` (new) | `usePeopleTotals`, `PeopleTotalCard`, `PeopleByPerson`, moved out of `Home` |
| `libs/web/screens/src/screens/Home.tsx` (modify) | Uses `PeopleSummary`; accepts `title` and `summary` |
| `libs/web/screens/src/screens/SpendingBook.tsx` (new) | The switched-on main screen |
| `libs/web/screens/src/screens/PeopleOwed.tsx` (new) | `/people`: the per-person list on its own page |
| `libs/web/screens/src/App.tsx` (modify) | `/trips` and `/people` follow the switch |
| `docs/navigation-map.md`, `PRODUCT.md`, `DESIGN.md`, the Phase 2 breakdown spec (modify) | Documents |

---

### Task 1: The switch table

**Files:**
- Create: `apps/api/migrations/0025_personal_area.sql`
- Modify: `libs/api/db/src/schema.ts` (after `userNotificationSettings`)
- Test: `apps/api/test/schema-personal.test.ts` (new)

**Interfaces:**
- Produces: `userPersonalSettings` exported from `@cc/api-db/schema`, with columns `userId`, `enabled`, `updatedAt`.

- [ ] **Step 0: Name the branch**

```bash
git branch -m feat/spending-book-shape
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { userPersonalSettings } from '@cc/api-db/schema';
import { seedUser } from './helpers';

describe('user_personal_settings', () => {
  it('has the three columns, in order', async () => {
    expect(userPersonalSettings.userId).toBeDefined();
    const cols = await env.DB.prepare('PRAGMA table_info(user_personal_settings)').all<{ name: string }>();
    expect(cols.results.map((r) => r.name)).toEqual(['user_id', 'enabled', 'updated_at']);
  });

  it('defaults to off', async () => {
    await seedUser('u-p1', 'P One');
    await env.DB.prepare("INSERT INTO user_personal_settings (user_id, updated_at) VALUES ('u-p1', '2026-11-15T00:00:00.000Z')").run();
    const row = await env.DB.prepare("SELECT enabled FROM user_personal_settings WHERE user_id = 'u-p1'").first<{ enabled: number }>();
    expect(row?.enabled).toBe(0);
  });

  it('goes away with its user, so tests and merges never trip on it', async () => {
    await seedUser('u-p2', 'P Two');
    await env.DB.prepare("INSERT INTO user_personal_settings (user_id, enabled, updated_at) VALUES ('u-p2', 1, '2026-11-15T00:00:00.000Z')").run();
    await env.DB.prepare("DELETE FROM users WHERE id = 'u-p2'").run();
    const row = await env.DB.prepare("SELECT 1 AS x FROM user_personal_settings WHERE user_id = 'u-p2'").first();
    expect(row).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npm test -w @cc/api -- schema-personal`
Expected: FAIL (`userPersonalSettings` is not exported; no such table).

- [ ] **Step 3: Write the migration**

```sql
CREATE TABLE `user_personal_settings` (
  `user_id` text PRIMARY KEY NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `enabled` integer NOT NULL DEFAULT 0,
  `updated_at` text NOT NULL
);
```

`ON DELETE CASCADE` is deliberate: `apps/api/test/setup.ts` deletes tables in an order this plan may not change.

- [ ] **Step 4: Add `userPersonalSettings` to `schema.ts`**, matching the SQL: `userId` (`text('user_id')`, primary key, references `users.id` with `{ onDelete: 'cascade' }`), `enabled` (`integer`, not null, default `0`), `updatedAt` (`text`, not null).

- [ ] **Step 5: Run the test, then the whole API suite**

Run: `npm test -w @cc/api -- schema-personal`, then `npm test -w @cc/api`
Expected: PASS, and no other API test changes result.

- [ ] **Step 6: Apply locally and commit**

```bash
npx -w @cc/api wrangler d1 migrations apply fsl --local
git add apps/api/migrations/0025_personal_area.sql libs/api/db/src/schema.ts apps/api/test/schema-personal.test.ts
git commit -m "feat: add the personal-area switch table"
```

---

### Task 2: The guard, the `/me` field and the first guarded route

**Files:**
- Create: `libs/api/auth/src/personal.ts`, `apps/api/src/personal/routes.ts`
- Modify: `libs/api/auth/src/me.ts` (`buildMeResponse`), `libs/shared/core/src/api-types.ts` (`MeResponse`), `apps/api/src/app.ts`
- Test: `apps/api/test/personal-area.test.ts` (new)

**Interfaces:**
- Consumes: `userPersonalSettings` (Task 1); `getSessionUser`, `requireUser` from `@cc/api-auth/session`.
- Produces:
  - `isPersonalAreaOn(db: Db, userId: string): Promise<boolean>` in `@cc/api-auth/personal`: true only for a row with `enabled = 1`.
  - `requirePersonal: MiddlewareHandler<AppBindings>` in `@cc/api-auth/personal`: 401 `UNAUTHENTICATED` when signed out, 403 `FORBIDDEN` when off, else `next()`. Every Phase 2 route uses it instead of `requireUser`.
  - `MeResponse.personalArea?: boolean`: present and `true` only when on.
  - `personalRoutes(): Hono<AppBindings>` with `GET /me/personal` (behind `requirePersonal`) → `200 { ok: true }`, and `PATCH /me/personal` (behind `requireUser`) taking `{ enabled: boolean }` → `200 { enabled: boolean }`; anything else in the body → `422 VALIDATION`. It upserts the caller's own row with `updated_at = nowIso()`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import type { MeResponse } from '@cc/core';
import { call, json, memberSid } from './helpers';

async function setSwitch(userId: string, enabled: 0 | 1) {
  await env.DB.prepare(
    "INSERT INTO user_personal_settings (user_id, enabled, updated_at) VALUES (?, ?, '2026-11-15T00:00:00.000Z') ON CONFLICT(user_id) DO UPDATE SET enabled = excluded.enabled",
  ).bind(userId, enabled).run();
}
const as = (sid: string) => ({ headers: { Cookie: `sid=${sid}` } });

describe('personal area switch', () => {
  it('GET /api/me leaves personalArea out when there is no row', async () => {
    const sid = await memberSid('u-off', 'Off');
    const body = await json<MeResponse>(await call('/api/me', as(sid)));
    expect('personalArea' in body).toBe(false);
  });

  it('GET /api/me leaves personalArea out when the row says off', async () => {
    const sid = await memberSid('u-zero', 'Zero');
    await setSwitch('u-zero', 0);
    const body = await json<MeResponse>(await call('/api/me', as(sid)));
    expect('personalArea' in body).toBe(false);
  });

  it('GET /api/me says personalArea: true when on', async () => {
    const sid = await memberSid('u-on', 'On');
    await setSwitch('u-on', 1);
    const body = await json<MeResponse>(await call('/api/me', as(sid)));
    expect(body.personalArea).toBe(true);
  });

  it('GET /api/me/personal: 401 signed out, 403 off, 403 row off, 200 on', async () => {
    expect((await call('/api/me/personal')).status).toBe(401);

    const off = await memberSid('u-off2', 'Off');
    const offRes = await call('/api/me/personal', as(off));
    expect(offRes.status).toBe(403);
    expect((await json<{ error: { code: string } }>(offRes)).error.code).toBe('FORBIDDEN');

    const zero = await memberSid('u-zero2', 'Zero');
    await setSwitch('u-zero2', 0);
    expect((await call('/api/me/personal', as(zero))).status).toBe(403);

    const on = await memberSid('u-on2', 'On');
    await setSwitch('u-on2', 1);
    const onRes = await call('/api/me/personal', as(on));
    expect(onRes.status).toBe(200);
    expect(await json(onRes)).toEqual({ ok: true });
  });

  it("one account's switch does nothing for another account", async () => {
    await memberSid('u-owner', 'Owner');
    await setSwitch('u-owner', 1);
    const other = await memberSid('u-other', 'Other');
    expect((await call('/api/me/personal', as(other))).status).toBe(403);
    const body = await json<MeResponse>(await call('/api/me', as(other)));
    expect('personalArea' in body).toBe(false);
  });

  const patch = (sid: string | null, body: unknown, path = '/api/me/personal') =>
    call(path, {
      method: 'PATCH',
      headers: { ...(sid ? { Cookie: `sid=${sid}` } : {}), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('PATCH /api/me/personal: 401 signed out, 422 for a body that is not { enabled: boolean }', async () => {
    expect((await patch(null, { enabled: true })).status).toBe(401);
    const sid = await memberSid('u-bad', 'Bad');
    for (const body of [{}, { enabled: 'yes' }, { enabled: 1 }, [true], null]) {
      expect((await patch(sid, body)).status).toBe(422);
    }
  });

  it('PATCH /api/me/personal turns the caller on, then off again', async () => {
    const sid = await memberSid('u-flip', 'Flip');
    const on = await patch(sid, { enabled: true });
    expect(on.status).toBe(200);
    expect(await json(on)).toEqual({ enabled: true });
    expect((await json<MeResponse>(await call('/api/me', as(sid)))).personalArea).toBe(true);
    expect((await call('/api/me/personal', as(sid))).status).toBe(200);

    expect(await json(await patch(sid, { enabled: false }))).toEqual({ enabled: false });
    expect('personalArea' in (await json<MeResponse>(await call('/api/me', as(sid))))).toBe(false);
    expect((await call('/api/me/personal', as(sid))).status).toBe(403);
    const rows = await env.DB.prepare("SELECT COUNT(*) AS n FROM user_personal_settings WHERE user_id = 'u-flip'").first<{ n: number }>();
    expect(rows?.n).toBe(1);
  });

  it('PATCH /api/me/personal changes only the caller', async () => {
    const a = await memberSid('u-a', 'A');
    const b = await memberSid('u-b', 'B');
    await patch(a, { enabled: true, userId: 'u-b' });
    expect((await call('/api/me/personal', as(b))).status).toBe(403);
  });

  it('PATCH /api/me does not change the setting', async () => {
    const sid = await memberSid('u-try', 'Try');
    const res = await patch(sid, { personalArea: true }, '/api/me');
    expect(res.status).toBeLessThan(500);
    const row = await env.DB.prepare("SELECT enabled FROM user_personal_settings WHERE user_id = 'u-try'").first();
    expect(row).toBeNull();
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npm test -w @cc/api -- personal-area`
Expected: FAIL (404 for `/api/me/personal`; `personalArea` undefined).

- [ ] **Step 3: Write `libs/api/auth/src/personal.ts`** with `isPersonalAreaOn` (one `select` of `enabled` by `userId`) and `requirePersonal` (calls `getSessionUser`; throws `new ApiError('UNAUTHENTICATED', 401)` or `new ApiError('FORBIDDEN', 403)`).

- [ ] **Step 4: Add `personalArea?: boolean` to `MeResponse`**, with a doc comment: "Present and true only when the personal area is switched on for this user."

- [ ] **Step 5: In `buildMeResponse`,** add `isPersonalAreaOn(db, user.id)` to the existing `Promise.all`, and spread `...(on ? { personalArea: true } : {})` into the signed-in response. The signed-out response is unchanged.

- [ ] **Step 6: Write `apps/api/src/personal/routes.ts`** (`personalRoutes()` with both routes as specified in Interfaces) and mount it in `app.ts` with `app.route('/api', personalRoutes())` beside the other `/me` routes.

- [ ] **Step 7: Run the tests, then the whole API suite**

Run: `npm test -w @cc/api -- personal-area`, then `npm test -w @cc/api`, then `npm run typecheck`
Expected: PASS; `me.test.ts` and every other existing test unchanged.

- [ ] **Step 8: Commit**

```bash
git add libs/api/auth/src/personal.ts libs/api/auth/src/me.ts libs/shared/core/src/api-types.ts apps/api/src/personal/routes.ts apps/api/src/app.ts apps/api/test/personal-area.test.ts
git commit -m "feat: personal-area guard, /me field and first guarded route"
```

---

### Task 3: The web reads the switch

**Files:**
- Create: `libs/web/data-access/src/personalHint.ts`
- Modify: `libs/web/data-access/src/hooks.ts` (`useMe`; new `usePersonalArea`)
- Test: `libs/web/data-access/src/__tests__/personal-area.test.tsx` (new)

**Interfaces:**
- Consumes: `MeResponse.personalArea` (Task 2).
- Produces:
  - `useMe()` result keeps `personalArea: true` when the API sent it, and has no such key otherwise (existing tests compare the whole object).
  - `usePersonalArea(): boolean` in `@cc/web-data-access/hooks`. It subscribes to the `['me']` query **without fetching** (`useMe({ enabled: false })`), so adding it to a component never adds a request. While `['me']` has no data it returns the hint; once data exists it returns `data.personalArea === true` and stores that as the hint.
  - `useSetPersonalArea()` in `@cc/web-data-access/personal` (new file `personal.ts`): a `useMutation<{ enabled: boolean }, Error, boolean>` that sends `PATCH /api/me/personal` with `{ enabled }`, and on success writes the hint and invalidates `['me']`. Follow `useSetMyTheme` in `theme.ts`.
  - `readPersonalHint(): boolean` and `writePersonalHint(on: boolean): void` in `personalHint.ts`: `localStorage` key `personalArea`, value `'1'` when on, key removed when off; every access in try/catch (private windows, the Mini App).

- [ ] **Step 1: Write the failing tests.** Use the repo's existing pattern for data-access hook tests (a `QueryClientProvider` wrapper with `renderHook`, and `fetch` stubbed with `vi.stubGlobal`). Cases, each with `localStorage.clear()` first:

```ts
it('is false with no data and no hint', ...)           // usePersonalArea() === false, fetch not called
it('is true with no data when the hint is set', ...)    // writePersonalHint(true) → true, fetch not called
it('follows the server once /api/me has loaded', ...)   // seed ['me'] via useMe() returning { user, signIn, mergeRequests, personalArea: true } → true; localStorage.getItem('personalArea') === '1'
it('forgets the hint when the server says off', ...)    // hint set, /api/me without personalArea → false; localStorage.getItem('personalArea') === null   (Review Focus 3)
it('forgets the hint when signed out', ...)             // hint set, /api/me with user: null → false; key removed                                        (Review Focus 1)
it('useMe adds no personalArea key when the API omits it', ...) // 'personalArea' in result.current.data === false
it('useSetPersonalArea sends the PATCH, stores the hint and refetches /api/me', ...) // mutate(true) → PATCH /api/me/personal with { enabled: true }; localStorage 'personalArea' === '1'; GET /api/me called again
it('useSetPersonalArea leaves the hint alone when the save fails', ...)             // PATCH → 500; mutation isError; localStorage unchanged
```

- [ ] **Step 2: Run them and see them fail**

Run: `npm test -w @cc/web-data-access -- personal-area`
Expected: FAIL (`usePersonalArea` is not exported).

- [ ] **Step 3: Implement** `personalHint.ts` and `personal.ts`; in `useMe`'s `select`, spread `...(p.personalArea === true ? { personalArea: true } : {})`; add `usePersonalArea` as specified, writing the hint in an effect when data is present.

- [ ] **Step 4: Run the tests, then the package and the screens package** (screens tests exercise `useMe`)

Run: `npm test -w @cc/web-data-access`, then `npm test -w @cc/web-screens`
Expected: PASS, nothing else changes result.

- [ ] **Step 5: Commit**

```bash
git add libs/web/data-access/src/personalHint.ts libs/web/data-access/src/personal.ts libs/web/data-access/src/hooks.ts libs/web/data-access/src/__tests__/personal-area.test.tsx
git commit -m "feat: usePersonalArea hook with a first-paint hint"
```

---

### Task 4: The nav's first item follows the switch

**Files:**
- Modify: `libs/web/ui/src/components/icons.tsx`, `libs/web/i18n/src/vi.ts`, `libs/web/i18n/src/en.ts`, `libs/web/screens/src/components/AppNav.tsx`
- Test: `libs/web/screens/src/components/__tests__/app-nav-personal.test.tsx` (new)

**Interfaces:**
- Consumes: `usePersonalArea()` (Task 3).
- Produces: icon name `'wallet'` (lucide `Wallet`); copy keys below, used by Tasks 5 and 6.

| Key | Vietnamese (`// REVIEW`) | English |
|---|---|---|
| `nav.book` | Sổ chi tiêu | Spending book |
| `book.title` | Sổ chi tiêu | Spending book |
| `book.emptyTitle` | Bắt đầu bằng một chiếc ví | Start with a wallet |
| `book.emptyBody` | Ví là nơi bạn giữ tiền: tiền mặt, tài khoản ngân hàng, quỹ đầu tư. Bạn sẽ sớm tạo được ví đầu tiên ở đây. | A wallet is where your money sits: cash, a bank account, a fund. You will soon be able to create your first one here. |
| `account.book` | Sổ chi tiêu | Spending book |
| `account.bookHint` | Ghi lại tiền của riêng bạn, cùng chỗ với các nhóm. | Keep track of your own money, next to your groups. |
| `account.bookBeta` | Thử nghiệm | Beta |
| `book.peopleOwe` | Mọi người nợ bạn | People owe you |
| `book.peopleTitle` | Mọi người | People |

- [ ] **Step 1: Write the failing tests** (seed the switch by setting `localStorage.setItem('personalArea', '1')` before `renderAt`; clear it in `afterEach`):

```tsx
it('switch off: the first item is unchanged', () => {
  renderAt(<AppNav section="home" addHref="/t/t-1/expenses/new" />);
  const bar = screen.getByTestId('app-nav-bar');
  expect(within(bar).getByTestId('nav-home')).toHaveAccessibleName('Quick expenses');
  expect(within(screen.getByTestId('app-nav-side')).getByTestId('nav-home')).toHaveTextContent('Quick expenses');
});

it('switch on: the first item is the spending book, same address and test id', () => {
  localStorage.setItem('personalArea', '1');
  renderAt(<AppNav section="home" addHref="/t/t-1/expenses/new" />);
  const bar = screen.getByTestId('app-nav-bar');
  const first = within(bar).getByTestId('nav-home');
  expect(first).toHaveAccessibleName('Spending book');
  expect(first).toHaveAttribute('href', '/trips');
  expect(within(screen.getByTestId('app-nav-side')).getByTestId('nav-home')).toHaveTextContent('Spending book');
  expect(within(bar).getAllByRole('link')).toHaveLength(4); // three sections and "+"
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npm test -w @cc/web-screens -- app-nav-personal`
Expected: FAIL (label is still "Quick expenses").

- [ ] **Step 3: Implement.** Add `wallet` to `IconName` and `SHAPES`; add the nine keys to both language files; in `AppNav`, when `usePersonalArea()` is true the `home` item uses `labelKey: 'nav.book'` and `icon: 'wallet'`. Its `id`, `href` and `data-testid` do not change, and the "+" is untouched (only one kind of transaction exists, so the short menu arrives with #113).

- [ ] **Step 4: Run the tests and the existing nav tests**

Run: `npm test -w @cc/web-screens -- app-nav`
Expected: PASS for the new file and for `app-nav.test.tsx` and `AppNav.tabs.test.tsx`, both untouched.

- [ ] **Step 5: Commit**

```bash
git add libs/web/ui/src/components/icons.tsx libs/web/i18n/src/vi.ts libs/web/i18n/src/en.ts libs/web/screens/src/components/AppNav.tsx libs/web/screens/src/components/__tests__/app-nav-personal.test.tsx
git commit -m "feat: nav shows the spending book when the switch is on"
```

---

### Task 4b: The setting in the account menu

**Before writing any UI:** read `DESIGN.md`, `PRODUCT.md` and `C:\Users\NvN\.claude\skills\impeccable\reference\craft-floor.md`.

**Files:**
- Modify: `libs/web/screens/src/components/AccountMenu.tsx`
- Test: `libs/web/screens/src/components/__tests__/account-book.test.tsx` (new)

**Interfaces:**
- Consumes: `usePersonalArea()`, `useSetPersonalArea()` (Task 3); copy keys `account.book`, `account.bookHint`, `account.bookBeta` and the `wallet` icon (Task 4); `Switch` from `@cc/web-ui/components/ui/switch`, `Pill`, `InlineError`, `Icon`.
- Produces: a row directly after the Notifications row, in the same row style but not a button: the `wallet` icon, the label `account.book` with a neutral `Pill` reading `account.bookBeta`, the muted line `account.bookHint` under it (`text-sm text-muted-foreground`), and on the right a `Switch` with `data-testid="account-book"`, labelled by the row's text through `useId` (as `NotificationSettingsModal` does). Row class `fsl-account-menu__book`, `min-h-11`. `checked` is `usePersonalArea()`; a tap calls `mutate(!checked)`; the switch is disabled while saving; on error an `InlineError` shows under the row and the switch shows the server's value again.

- [ ] **Step 1: Write the failing tests.** Open the account menu the way `account-theme-focus.test.tsx` does; `calls` is what `mockApi` returns.

```tsx
it('is off for a user who never turned it on, and says what it is', async () => {
  // GET /api/me without personalArea
  const sw = await screen.findByTestId('account-book');
  expect(sw).toHaveAttribute('aria-checked', 'false');
  expect(sw).toHaveAccessibleName(/Spending book/);
  expect(screen.getByText('Beta')).toBeInTheDocument();
});

it('turning it on saves, and the switch follows the server', async () => {
  // PATCH /api/me/personal → { enabled: true }; GET /api/me then returns personalArea: true
  await userEvent.click(await screen.findByTestId('account-book'));
  await waitFor(() => expect(calls).toContainEqual({ method: 'PATCH', path: '/api/me/personal', body: { enabled: true } }));
  await waitFor(() => expect(screen.getByTestId('account-book')).toHaveAttribute('aria-checked', 'true'));
});

it('a failed save flips it back and says so', async () => {                       // Review Focus 7
  // PATCH /api/me/personal → 500
  await userEvent.click(await screen.findByTestId('account-book'));
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(screen.getByTestId('account-book')).toHaveAttribute('aria-checked', 'false');
  expect(localStorage.getItem('personalArea')).toBeNull();
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npm test -w @cc/web-screens -- account-book`
Expected: FAIL (`account-book` not found).

- [ ] **Step 3: Implement the row** as specified.

- [ ] **Step 4: Run the tests and the existing account-menu tests**

Run: `npm test -w @cc/web-screens -- account`
Expected: PASS for the new file and for every existing `account*` and `linked-accounts*` test, untouched.

- [ ] **Step 5: Commit**

```bash
git add libs/web/screens/src/components/AccountMenu.tsx libs/web/screens/src/components/__tests__/account-book.test.tsx
git commit -m "feat: spending book setting in the account menu"
```

---

### Task 5: Move the people summary out of Home

A pure refactor: Home must render the same DOM as before. It exists so Tasks 6's two screens can reuse the per-person list.

**Files:**
- Create: `libs/web/screens/src/components/PeopleSummary.tsx`
- Modify: `libs/web/screens/src/screens/Home.tsx`
- Test: none new; the existing Home tests are the proof.

**Interfaces:**
- Produces, from `components/PeopleSummary.tsx`:
  - `usePeopleTotals(): { owedToYou: PersonSummary[]; youOwe: PersonSummary[]; sumPositive: number; sumNegative: number; isEmpty: boolean; incomplete: boolean; isLoading: boolean; error: Error | null; refetch: () => void }` (wraps `usePeopleSummary()` with Home's current `owedSide` / `oweSide` sorting and sums).
  - `PeopleTotalCard(): JSX.Element` (Home's `totalCard`).
  - `PeopleByPerson(): JSX.Element` (Home's `byPersonSection`, including `renderPersonRow`).
  - `Home` gains optional props `{ title?: string; summary?: ReactNode }`. `title` defaults to `t('home.title')`; `summary` defaults to `<><PeopleTotalCard /><PeopleByPerson /></>` and is rendered wherever Home renders those two today (the phone column, and the wide layout's right column when nothing is selected).

- [ ] **Step 1: Record the baseline**

Run: `npm test -w @cc/web-screens`
Expected: PASS. Note the count of passing tests.

- [ ] **Step 2: Move the code.** Cut `owedSide`, `oweSide`, the sums, `renderPersonRow`, `totalCard` and `byPersonSection` from `Home.tsx` into `PeopleSummary.tsx` unchanged: same markup, same `fsl-home__*` classes, same `data-testid`s (`home-total`, `person-row-<key>`), same copy keys. Add the two props to `Home`.

- [ ] **Step 3: Run the suite again**

Run: `npm test -w @cc/web-screens`, then `npm run typecheck`, then `npm run lint`
Expected: the same count passes; no test file changed.

- [ ] **Step 4: Commit**

```bash
git add libs/web/screens/src/components/PeopleSummary.tsx libs/web/screens/src/screens/Home.tsx
git commit -m "refactor: move the people summary out of Home"
```

---

### Task 6: Sổ chi tiêu, the People page and the routes

**Before writing any UI:** read `DESIGN.md`, `PRODUCT.md` and `C:\Users\NvN\.claude\skills\impeccable\reference\craft-floor.md`.

**Files:**
- Create: `libs/web/screens/src/screens/SpendingBook.tsx`, `libs/web/screens/src/screens/PeopleOwed.tsx`
- Modify: `libs/web/screens/src/App.tsx`
- Test: `libs/web/screens/src/screens/__tests__/spending-book.test.tsx` (new)

**Interfaces:**
- Consumes: `usePersonalArea()` (Task 3); copy keys and the `wallet` icon (Task 4); `Home` props, `usePeopleTotals`, `PeopleByPerson` (Task 5); `EmptyState`, `Avatar`, `Amount`, `Icon`, `SkeletonList`, `InlineError` from `@cc/web-ui`; `Screen`, `useBack` from this library.
- Produces:
  - `SpendingBook(): JSX.Element`: `<Home title={t('book.title')} summary={<BookSummary />} />`. `BookSummary` is private to the file:
    1. `EmptyState` with `icon="wallet"`, title `book.emptyTitle`, body `book.emptyBody`, **no button** (spec S19), `data-testid="book-empty"`.
    2. One white grouped list (`bg-card rounded-xl overflow-hidden`) holding a single row, a `Link` to `/people` with `data-testid="book-people-row"` and class `fsl-book__people`: up to three `Avatar`s (size 28, overlapping) from `owedToYou`, the title `book.peopleOwe` in `font-semibold`, `sumPositive` as `<Amount tone="success">`, a `chevronRight` icon. When `sumNegative > 0`, a muted second line reuses `home.totalOwe`. While loading: `SkeletonList rows={1}`; on error: `InlineError` with retry. Row height `min-h-14`.
    Home's quick-expense lists, tabs, pills, details panel and deep-link handling all come from `Home` unchanged.
  - `PeopleOwed(): JSX.Element`: `<Screen title={t('book.peopleTitle')} back="/trips" nav={…same as Home's navProps…}>` with `<PeopleByPerson />` in the usual column. Redirects a signed-out visitor to `/` the way `Home` does.
  - `App.tsx`: `TripsRoute` returns `<SpendingBook />` when `usePersonalArea()` is true, else `<Home />` (the `mergeReview` / `tab=groups` redirect stays first). New route `/people` → `PeopleRoute`: `<PeopleOwed />` when on, else `<Navigate to="/trips" replace />`. It sits before `/people/:key`.

- [ ] **Step 1: Write the failing tests.** Render `<App />` with `renderAt` and `mockApi`. Copy the set-up from `screens/__tests__/home-main.test.tsx` into the new file (its `me`, `ledger`, `peopleSummary` and `ledgerView()` objects and its `mockApi` route map; they are local to that file, so copying is the only way to reuse them without editing it). Below, `meFixture` is that `me` object with `signIn` and `mergeRequests` added, `homeRoutes` is that route map without `GET /api/me`, and `expenseId` is the id of the first expense in `ledgerView()`. `localStorage.clear()` in `beforeEach`; `vi.unstubAllGlobals()` in `afterEach`.

```tsx
const meOn = { ...meFixture, personalArea: true };

it('switch off: /trips is today\'s Home and nothing new is on screen', async () => {
  mockApi({ 'GET /api/me': meFixture, ...homeRoutes });
  renderAt(<App />, { route: '/trips' });
  expect(await screen.findByTestId('home-total')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Quick expenses' })).toBeInTheDocument();
  expect(screen.queryByTestId('book-empty')).not.toBeInTheDocument();
  expect(screen.queryByTestId('book-people-row')).not.toBeInTheDocument();
});

it('switch off: /people goes back to the main screen', async () => {
  mockApi({ 'GET /api/me': meFixture, ...homeRoutes });
  renderAt(<App />, { route: '/people' });
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/trips'));
});

it('signed out: /people ends on the landing page', async () => {            // Review Focus 5
  mockApi({ 'GET /api/me': { user: null, signIn: { zalo: true }, mergeRequests: { incoming: [], outgoing: [] } } });
  renderAt(<App />, { route: '/people' });
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/));
});

it('turned off while on /people: leaves for the main screen', async () => {      // Review Focus 6
  let on = true;
  mockApi({ 'GET /api/me': () => Response.json(on ? meOn : meFixture), ...homeRoutes });
  const { rerender } = renderAt(<App />, { route: '/people' });
  await screen.findByRole('heading', { name: 'People' });
  on = false;
  // Make the app refetch ['me'], as useSetPersonalArea does after a save: export the test QueryClient
  // from a local render helper in this file (copy renderAt's body; do not edit test/render.tsx) and call
  // client.invalidateQueries({ queryKey: ['me'] }) inside act().
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/trips'));
});

it('switch on: /trips is the spending book with its empty state', async () => {
  mockApi({ 'GET /api/me': meOn, ...homeRoutes });
  renderAt(<App />, { route: '/trips' });
  expect(await screen.findByTestId('book-empty')).toHaveTextContent('Start with a wallet');
  expect(screen.getByRole('heading', { name: 'Spending book' })).toBeInTheDocument();
  expect(within(screen.getByTestId('book-empty')).queryByRole('button')).not.toBeInTheDocument();
  expect(screen.queryByTestId('home-total')).not.toBeInTheDocument();
  // today's quick expenses are still there
  expect(await screen.findByText(ledgerView().expenses[0]!.title)).toBeInTheDocument();
});

it('switch on: the people row shows the total and opens the people page', async () => {
  mockApi({ 'GET /api/me': meOn, ...homeRoutes });
  renderAt(<App />, { route: '/trips' });
  const row = await screen.findByTestId('book-people-row');
  expect(row).toHaveAttribute('href', '/people');
  expect(row).toHaveTextContent('620.000₫'); // Linh 350.000 + Minh 270.000
  await userEvent.click(row);
  expect(await screen.findByRole('heading', { name: 'People' })).toBeInTheDocument();
  expect(screen.getByTestId('person-row-u:u-linh')).toBeInTheDocument();
});

it('switch on, phone: /trips?expense=<id> still opens that expense\'s own page', async () => {   // Review Focus 4
  mockApi({ 'GET /api/me': meOn, ...homeRoutes });
  renderAt(<App />, { route: `/trips?expense=${expenseId}` });
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(`/t/t-led/expenses/${expenseId}`));
});

it('switch on, computer: the side panel names the spending book', async () => {
  mockMedia({ wide: true }); // src/test/media.ts
  mockApi({ 'GET /api/me': meOn, ...homeRoutes });
  renderAt(<App />, { route: '/trips' });
  await screen.findByTestId('book-empty');
  expect(within(screen.getByTestId('app-nav-side')).getByTestId('nav-home')).toHaveTextContent('Spending book');
});

it('switch on, Zalo Mini App: the same screen renders', async () => {
  mockApi({ 'GET /api/me': meOn, ...homeRoutes });
  renderAt(<App />, { route: '/trips', platform: fakePlatform({ kind: 'zmp' }) /* src/test/fakePlatform.ts */ });
  expect(await screen.findByTestId('book-empty')).toBeInTheDocument();
});
```

If `ledgerView()`'s expense field is named differently from `title`, use the field `ExpenseList` renders as the row's name.

- [ ] **Step 2: Run them and see them fail**

Run: `npm test -w @cc/web-screens -- spending-book`
Expected: FAIL (`book-empty` never appears; `/people` renders nothing).

- [ ] **Step 3: Implement** `SpendingBook.tsx`, `PeopleOwed.tsx` and the `App.tsx` routes as specified.

- [ ] **Step 4: Run the tests, the package, and the guards**

Run: `npm test -w @cc/web-screens`, then `npm run typecheck`, then `npm run lint`
Expected: PASS, including `style-guard.test.ts` and `ui-components-guard.test.ts`.

- [ ] **Step 5: Look at it.** Run the app, turn the setting on in the account menu, and check at 375px and at 1280px against `docs/superpowers/mockups/v7-spending-book.html`: header title, the empty state, the people row's height and alignment, nothing hidden behind the floating nav. Fix what one look shows before looking again.

- [ ] **Step 6: Commit**

```bash
git add libs/web/screens/src/screens/SpendingBook.tsx libs/web/screens/src/screens/PeopleOwed.tsx libs/web/screens/src/App.tsx libs/web/screens/src/screens/__tests__/spending-book.test.tsx
git commit -m "feat: spending book empty screen and people page behind the switch"
```

---

### Task 7: Documents

**Files:**
- Modify: `docs/superpowers/specs/2026-11-13-phase-2-personal-money-breakdown-design.md`, `docs/navigation-map.md`, `PRODUCT.md`, `DESIGN.md`

No tests. Each edit is listed in the spec's section 7; the exact content:

- [ ] **Step 1: The Phase 2 breakdown spec** (`docs/superpowers/specs/2026-11-13-phase-2-personal-money-breakdown-design.md`). Do not rewrite it. Add one dated line under decision D8 and one under rule 5 of section 6: "Changed 2026-11-15 (owner): every signed-in user can turn the personal area on or off in the account menu; see S25 in `2026-11-15-spending-book-shape-and-navigation-design.md`. The server guard and the default of off stand."

- [ ] **Step 2: `docs/navigation-map.md`.**
  - Route table: `/trips` → "`Home`, or `SpendingBook` when the personal area is on"; new row `/people` → "`PeopleOwed` when on; else redirect to `/trips`".
  - AppNav paragraph: the first item reads "Sổ chi tiêu" with the wallet icon when on; address, section id and test id unchanged.
  - A new section "Personal area: places for later sub-tasks" holding the table from the spec's section 3.
  - Add `/people` to the mermaid graph (from `HOME`, labelled "people row (switch on)").

- [ ] **Step 3: `PRODUCT.md`.**
  - Direction list reordered to match GitHub: 1 group split (built), 2 personal money records replacing Money Lover, 3 Sheets export and Gemini, 4 investment tracking and imports.
  - In that list: "QR pay gateway" marked "parked"; "bank-email capture" replaced by "spreadsheet import with review"; "Apple Pay capture" kept.
  - "Not yet": remove "currencies other than VND" and "categories", and add one line: "Both exist on the personal side only (Phase 2); group money stays whole VND with no categories."
  - Users: add "**The owner, for their own money** (Phase 2, switched on per account): records what they spend, earn and move between wallets, on a phone just after paying and on a computer for a weekly look-over. Friends get it once it is stable."

- [ ] **Step 4: `DESIGN.md`.** Add, in the document's existing voice:
  - Components → "Overview (Sổ chi tiêu)": summary card, top list, widgets that each open their own page; a widget appears only when its feature ships and hides when empty.
  - Named rule **The Quiet Overview Rule**: below the summary card the overview shows shape and words, not amounts; recent transactions are the exception; figures live on each widget's own page.
  - "Wallet pie": tints of the theme accent, never a money colour; at most four segments, the rest grouped as "Khác"; a text alternative naming the order.
  - "Budget bar": theme accent when healthy, Turmeric from 85% ("Sắp chạm mức"), Lychee when over ("Đã vượt mức"); the words always change with the colour. Add this as a named allowed use under The Money Means Something Rule.
  - Navigation: the first item's label and icon follow the personal-area setting.
  - Account menu: the "Sổ chi tiêu" row with its switch and the neutral "Thử nghiệm" pill; it saves on tap, like the theme picker.
  Do not touch the front matter or `.impeccable/design.json` beyond what these additions need.

- [ ] **Step 5: Commit**

```bash
git add docs/navigation-map.md PRODUCT.md DESIGN.md docs/superpowers/specs/2026-11-13-phase-2-personal-money-breakdown-design.md
git commit -m "docs: spending book navigation, product phases and design rules"
```

---

### Task 8: Whole-branch check and hand-over

- [ ] **Step 1: Everything green**

Run: `npm test`, `npm run typecheck`, `npm run lint`
Expected: PASS.

- [ ] **Step 2: Phase 1 untouched**

Run: `npm run e2e -- golden-path`, then `npm run e2e -- walkthrough`
Expected: PASS, with neither spec edited.

Run: `git diff --stat main -- '*.test.ts' '*.test.tsx' '*.spec.ts' apps/api/test/setup.ts apps/api/test/helpers.ts`
Expected: only new files listed; no existing test file modified.

Run: `git diff --stat main -- libs/api/db/src/commit.ts libs/shared/core apps/api/src/trips/snapshot.ts apps/api/src/me/balances.ts apps/api/src/me/settle.ts apps/api/src/me/ledger.ts libs/api/auth/src/device.ts apps/api/src/expenses apps/api/src/payments`
Expected: only `libs/shared/core/src/api-types.ts` (the `MeResponse` field).

- [ ] **Step 3: The owner's test.** Build, apply the migration locally, start the tunnel on the fresh build, and check in a browser before handing over: with the switch off the app is unchanged; with it on, the phone and computer layouts show Sổ chi tiêu and the People page. Then wait for the owner's own test and approval.

- [ ] **Step 4: Pull request**, only after the owner approves: push `feat/spending-book-shape` and open a PR into `main` that links #112, lists what is built against the issue's "Done when", states the query cost table from the spec, and says plainly that this changes issue #112's requirement 4 and decision D8 (any signed-in user can now turn the spending book on; spec S25). Post the same note as a comment on #112 and #55. The migration must be applied to production before the setting works there.
