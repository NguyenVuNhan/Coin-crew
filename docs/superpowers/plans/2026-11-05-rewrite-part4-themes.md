# Rewrite Part 4: colour themes. Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Signed-in people pick a personal colour theme, and a group's admin picks the group's colours. The group's colours win inside that group, for guests too.

**Architecture:**
- **Shared ids.** `@cc/core` owns the theme ids and the one rule that picks the theme in view.
- **Storage.** The API stores a nullable `theme` on users (via `PATCH /api/me`) and on trips (via `PATCH /api/trips/:id`, admins only).
- **Tokens.** Each theme is a `[data-theme='<id>']` token block in `globals.css`.
- **Applying it.** A `ThemeController` at the app root sets `data-theme` on `<html>`, so sheets and other portals follow too. A `GroupThemeScope` around the group routes reports the group's colour to it.
- **First paint.** The personal theme is cached on the device, so the first paint uses it.

**Tech Stack:** React 19, react-router 8, TanStack Query 5, Tailwind v4 tokens, Hono on Cloudflare Workers, D1/Drizzle, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-05-app-rewrite-design.md` §7. Read §2's anti-goals and §3 too.

## Global Constraints

- **Ids and order:** the themes are `jade` (default), `orchid`, `sky` and `indigo`, in that order. Indigo is the spec's "one more chosen during the build" (§9, my call).
- **What a theme defines:** a theme block may set only `--background` (the page and header wash), `--primary`, `--primary-foreground`, `--secondary`, `--secondary-foreground` and `--ring`.
  - Money colours (`--success*`, `--danger*`, `--warning*`) and avatar pastels (`--avatar-*`) never appear in a theme block.
- **Jade keeps today's values exactly:** `--background #f6f7f4`, `--primary #0f766e`, `--primary-foreground #ffffff`, `--secondary #ccfbf1`, `--secondary-foreground #134e4a`, `--ring #0f766e`. Nothing changes for anyone who never picks a theme.
- **New theme values** (checked: every pair below is ≥ 4.5:1):

  | id | --background | --primary | --primary-foreground | --secondary | --secondary-foreground | --ring |
  |---|---|---|---|---|---|---|
  | orchid | `#fbf6fb` | `#a21caf` | `#ffffff` | `#fae8ff` | `#701a75` | `#a21caf` |
  | sky | `#f4f8fb` | `#0369a1` | `#ffffff` | `#e0f2fe` | `#0c4a6e` | `#0369a1` |
  | indigo | `#f6f6fb` | `#4338ca` | `#ffffff` | `#e0e7ff` | `#312e81` | `#4338ca` |
- **Contrast pairs:** AA (≥ 4.5:1) holds for:
  - primary-foreground/primary;
  - primary on white, on the wash and on secondary;
  - secondary-foreground/secondary;
  - foreground `#1c1917` and muted-foreground `#57534e` on the wash.
- **Hue distance:** no new theme's primary hue is within 30° of Leaf `#047857`, Lychee `#be123c` or Turmeric `#b45309`.
- **One source of colour:** hex appears only in `libs/web/ui/src/styles/globals.css` (`style-guard.test.ts`). TypeScript that needs a colour reads the token at runtime (`getComputedStyle`).
- **Status bar:** the phone's status bar (`<meta name="theme-color">`) is the theme's `--primary`, so Jade stays `#0f766e` as today.
- **Saving:** choices save immediately; there is no Save button. A failed save shows `InlineError` and the choice reverts.
- **Migration:** Opus runs `npx drizzle-kit generate --name themes` in `apps/api` and does not commit the result.
  - The SQL and the `migrations/meta` changes stay in the working tree for the owner to review and commit.
  - Never run `db:migrate:remote` or `deploy`.
- **Copy:** every key goes in en and vi; vi lines end with `// REVIEW`.
- **Selectors:** `fsl-*` classes and `data-testid` stay on their elements.
- **Light themes only.**

## Review Focus

1. **A shared phone after sign-out** keeps the last person's colours. It should go back to Jade. → Task 3 test `signing out drops the cached theme`.
2. **Reloading the page** flashes Jade before the person's theme. → Task 2 inline script, plus Task 3 test `boot applies the cached theme before the first render`.
3. **An unknown theme id** (a theme added later, or a corrupted cache) → Jade, never a broken page. → Task 1 test `unknown ids fall back to jade` and Task 2 test `an unknown cached id is ignored`.
4. **Sheets and dialogs inside a coloured group** (portals outside the screen tree) must use the group's colours. → Task 3 test `the theme lives on <html>, so portals follow it`.
5. **The picker's previews** show each theme's own colours while another theme is applied. → Task 2 test `jade has its own block` and Task 4 test `each preview carries its own data-theme`.
6. **An archived group** can't change colours. → Task 1 API test `archived groups refuse a colour change` and Task 4 test `no Group colours row in an archived group`.

---

### Task 1: Theme ids and storage (Argon: core + DB)

**Files:**
- Create: `libs/shared/core/src/themes.ts`; export it from `libs/shared/core/src/index.ts`.
- Test: `libs/shared/core/test/themes.test.ts`.
- Modify `libs/shared/core/src/api-types.ts`:
  - `MeUserView.theme?: ThemeId | null`
  - `UpdateProfileInput.theme?: ThemeId | null`
  - `TripView.trip.theme?: ThemeId | null`
  - an activity action `'theme_changed'` next to `'ratings_changed'`
- Modify `libs/shared/core/src/permissions.ts`: a new `Action` `'set_theme'` in the `isMember && isAdmin` group.
- Modify `libs/api/db/src/schema.ts`: `users.theme: text('theme')` and `trips.theme: text('theme')`, both nullable.
- Modify the API:
  - `libs/api/auth/src/me.ts`: the user view returns `theme`, with null as the default.
  - `apps/api/src/auth/routes.ts`: `PATCH /me` accepts `theme`.
  - `apps/api/src/trips/routes.ts`: `PATCH /trips/:id` accepts `theme`.
  - `apps/api/src/trips/snapshot.ts`: the trip view carries `theme`.
- Modify the copy: `libs/web/i18n/src/en.ts` / `vi.ts` get `'activity.action.theme_changed'`: 'changed the group colours' / 'đã đổi màu của nhóm' `// REVIEW`.
- Test: `apps/api/test/themes.test.ts`. Copy the setup from `apps/api/test/me.test.ts` and `ratings.test.ts`.

**Interfaces (produced, used by Tasks 2–4):**
```ts
export const THEME_IDS = ['jade', 'orchid', 'sky', 'indigo'] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export const DEFAULT_THEME: ThemeId; // 'jade'
export function isThemeId(value: unknown): value is ThemeId;
/** The theme in view: a group's colours win inside it, else the signed-in person's own, else Jade. Unknown ids count as none. */
export function resolveTheme(input: { personal?: string | null; group?: string | null }): ThemeId;
```
- `PATCH /api/me` takes `{ theme: ThemeId | null }`. A string that is not a ThemeId gets a 422. `null` clears the theme.
- `PATCH /api/trips/:id` takes `{ theme: ThemeId | null }`, alone or with the existing keys.
  - It checks `ensure(actor, 'set_theme')` and `assertWritable`.
  - It commits `theme_changed` with `details.theme`.
  - It bumps the version via `commitTripWrite`.

- [ ] **Step 1 (worker): core tests.** In `themes.test.ts`:
  - `resolveTheme: the group wins`: `({ personal: 'sky', group: 'orchid' })` → `'orchid'`.
  - `personal when the group has none`: `({ personal: 'sky', group: null })` → `'sky'`.
  - `guests get jade`: `({ personal: null, group: null })` → `'jade'`.
  - `unknown ids fall back to jade`: `({ personal: 'pink', group: 'neon' })` → `'jade'`.
  - `isThemeId` accepts each of the four ids and rejects `'Jade'`, `''`, `null` and `3`.
  - In `permissions.test.ts`'s style, a new case in `themes.test.ts`: `set_theme` is true for an admin member and the organiser, false for a plain member, a guest and a viewer.
- [ ] **Step 2 (worker): API tests.** In `apps/api/test/themes.test.ts`:
  - `PATCH /api/me saves a theme and /api/me returns it`;
  - `null clears it`;
  - `an unknown theme is a 422`;
  - `an admin sets the group colours and the trip view returns them`, with an activity row of action `theme_changed` and `details.theme === 'sky'`;
  - `null returns to each person's own theme`;
  - `a plain member gets 403`;
  - `a guest gets 403`;
  - `archived groups refuse a colour change` (the archived error `assertWritable` already throws);
  - `an unknown theme is a 422`.
- [ ] **Step 3 (worker): implement** to the interfaces above.
- [ ] **Step 4 (Opus):** `cd apps/api && npx drizzle-kit generate --name themes`. Check that the generated SQL contains only `ALTER TABLE \`users\` ADD \`theme\` text;` and `ALTER TABLE \`trips\` ADD \`theme\` text;`. Leave it uncommitted.
- [ ] **Step 5 (Opus):** `npm test`, `npm run typecheck`, `npm run lint`. Then commit everything except `apps/api/migrations/`: `feat: theme ids, personal theme on /me, group colours on the trip (admins)`.

### Task 2: Theme tokens and applying them (Flash)

**Files:**
- Modify `libs/web/ui/src/styles/globals.css`:
  - Move the six themeable tokens out of `:root` into a block `:root, [data-theme='jade'] { … }` with Jade's values.
  - Add `[data-theme='orchid']`, `[data-theme='sky']` and `[data-theme='indigo']` blocks with the table's values, each with a contrast comment like the existing ones.
- Create: `libs/web/ui/src/lib/theme.ts`.
- Test: `libs/web/ui/src/lib/__tests__/theme.test.ts`.
- Create the test `libs/web/ui/src/styles/__tests__/theme-tokens.test.ts`. It reads `globals.css` with `fs` and parses the blocks with a regex.
- Modify `libs/web/ui/src/components/icons.ts`: add `palette: Palette` (lucide).
- Modify `apps/web/index.html`: an inline `<script>` in `<head>`, before the module script:
  `try{var t=localStorage.getItem('theme');if(t)document.documentElement.setAttribute('data-theme',t)}catch(e){}`

**Interfaces:**
- Consumes: `ThemeId` and `isThemeId` (Task 1).
- Produces (`@cc/web-ui/lib/theme`):
  ```ts
  export const THEME_CACHE_KEY = 'theme';
  /** Sets data-theme on <html> and points <meta name="theme-color"> at the theme's --primary (creates the meta if missing). */
  export function applyTheme(id: ThemeId): void;
  /** The personal theme cached on this device, or null (missing, unknown, or storage unavailable). */
  export function readCachedTheme(): ThemeId | null;
  /** Caches the personal theme; null removes it. Never throws. */
  export function cacheTheme(id: ThemeId | null): void;
  ```

- [ ] **Step 1 (worker): `theme-tokens.test.ts`:**
  - `every theme has a block, jade included`: one block per `THEME_IDS` entry, and `jade has its own block`.
  - `themes set only the six themeable tokens`: no `--success`, `--danger`, `--warning` or `--avatar-` inside a theme block.
  - `every theme passes AA`: every pair in Global Constraints is ≥ 4.5, using the WCAG relative-luminance formula. Foreground and muted come from `:root`.
  - `no new theme looks like a money colour`: the primary hue distance from `#047857`, `#be123c` and `#b45309` is ≥ 30° for orchid, sky and indigo.
- [ ] **Step 2 (worker): `theme.test.ts`:**
  - `applyTheme sets data-theme on <html> and the theme-color meta`. The meta content equals the computed `--primary`; in jsdom, stub `getComputedStyle` to return `#a21caf` for `--primary`.
  - `readCachedTheme returns a cached id`.
  - `an unknown cached id is ignored` → null.
  - `cacheTheme(null) removes it`.
  - `storage that throws is ignored`: stub `localStorage.getItem` to throw → null, and no throw from `cacheTheme`.
- [ ] **Step 3 (worker):** implement.
- [ ] **Step 4 (Opus):** run `cd libs/web/ui && npx vitest run`, then `npm test`. Open the app once to see that Jade looks unchanged. Commit: `feat(web): theme tokens (Jade, Orchid, Sky, Indigo) and applying them`.

### Task 3: The theme in view (Antigravity Opus: complex but short)

**Files:**
- Create: `libs/web/screens/src/lib/groupTheme.ts`. It holds a module store `setGroupTheme(id: ThemeId | null): void` and `useGroupTheme(): ThemeId | null` (via `useSyncExternalStore`), plus the component `GroupThemeScope({ children }: { children: ReactNode })`.
  - The component gets `tripId` from `useTrip()`.
  - It reads the cached view with `useQuery<TripView>({ queryKey: ['trip', tripId], queryFn: skipToken })`. It never fetches; the screens do.
  - It calls `setGroupTheme(view?.trip.theme ?? null)` in an effect, and `setGroupTheme(null)` on unmount.
- Create: `libs/web/screens/src/components/ThemeController.tsx`, `ThemeController(): null`.
  - `personal`: once `useMe()` has data, it is `me.user?.theme ?? null`. Before then it is `readCachedTheme()`.
  - An effect runs `applyTheme(resolveTheme({ personal, group: useGroupTheme() }))`.
  - Another effect runs `cacheTheme(me.user?.theme ?? null)` once `/api/me` has answered. On a fetch error it keeps the cache.
- Modify `libs/web/screens/src/App.tsx`:
  - render `<ThemeController />` next to `<AuthNotice />`;
  - `/t/:tripId` gets `element={<GroupThemeScope><Outlet /></GroupThemeScope>}`.
- Modify `libs/web/screens/src/screens/Join.tsx`: wrap its `<Outlet />` in `<GroupThemeScope>`, inside `TripBaseProvider`.
- Modify `libs/web/screens/src/AppRoot.tsx`: `bootApp` calls `applyTheme(readCachedTheme() ?? DEFAULT_THEME)` before `setLang`.
- Modify `libs/web/data-access/src/signOut.ts`: call `cacheTheme(null)` inside the `try`, with the other device clean-up.
- Test: `libs/web/screens/src/test/theme-in-view.test.tsx`. Use `renderApp` / `mockApi` as `back-navigation.test.tsx` does.

**Interfaces:**
- Consumes: Task 1 (`resolveTheme`, `ThemeId`, `DEFAULT_THEME`, `me.user.theme`, `view.trip.theme`) and Task 2 (`applyTheme`, `readCachedTheme`, `cacheTheme`).
- Produces: nothing new for Task 4. Task 4 only changes `['me']` and `['trip', id]`, and this task's code reacts to that.

- [ ] **Step 1 (worker):** write the tests.
  - `outside a group the signed-in person's theme applies`: `/groups` with me `theme: 'sky'` → `document.documentElement.dataset.theme === 'sky'`.
  - `inside a group its colours win`: `/t/t-1` with trip `theme: 'orchid'` and me `theme: 'sky'` → `'orchid'`. Navigating back to `/groups` → `'sky'`.
  - `a group without colours shows the person's own theme`: trip theme null, me `'sky'` → `'sky'`.
  - `guests see the group's colours, and Jade elsewhere`: me `{ user: null }`, `/j/<token>` with trip theme `'indigo'` → `'indigo'`; `/` → `'jade'`.
  - `the theme lives on <html>, so portals follow it`: the attribute is on `document.documentElement`, and no `[data-theme]` element sits under `#root`'s screens.
  - `boot applies the cached theme before the first render`: `localStorage.theme = 'sky'`, `await bootApp()` → `'sky'` before any render.
  - `signing out drops the cached theme`: after `signOut(...)`, `localStorage.getItem('theme')` is null.
  - `a fetched me caches the theme`: me `'indigo'` → `localStorage.theme === 'indigo'`. Then me `{ user: null }` → removed.
- [ ] **Step 2 (worker):** implement.
- [ ] **Step 3 (Opus):** run `npm test`, `npm run typecheck` and `npm run lint`, then commit: `feat(web): the theme in view — a group's colours win inside it, your own elsewhere`.

### Task 4: Choosing a theme (Argon: several screens)

**Files:**
- Create `libs/web/data-access/src/theme.ts`:
  - `useSetMyTheme()`: a mutation `(theme: ThemeId | null) => PATCH /api/me`.
    - It is optimistic: it sets `['me']` `user.theme` and calls `cacheTheme`.
    - On error it reverts both. On settle it invalidates `['me']`.
  - `useSetGroupTheme(tripId: string)`: a mutation `(theme: ThemeId | null) => apiSend('/api/trips/' + tripId, 'PATCH', { theme }, tripId)`. On success it invalidates `['trip', tripId]`.
- Create `libs/web/screens/src/components/ThemePicker.tsx`:
  ```ts
  ThemePicker(props: { open: boolean; onClose(): void; title: string; explain: string;
    value: ThemeId | null; onChange(theme: ThemeId | null): void; noneLabel?: string;
    busy?: boolean; error?: ApiClientError | null })
  ```
  - It uses the `Sheet` wrapper.
  - The options sit in a `role="radiogroup"` named by the title, two per row. The `noneLabel` option comes first when given.
  - Each option is a `button` with `role="radio"`, `aria-checked`, class `fsl-theme-picker__option`, `data-theme-option={id | 'none'}` and at least 44px of height.
  - It shows a mini-screen preview:
    - a `div` with `data-theme={id}` and `bg-background`;
    - a thin header strip;
    - a `bg-primary` pill;
    - a `bg-secondary` chip;
    - the name `t('theme.name.<id>')`.
  - The none option's preview is a neutral `bg-muted` tile with the `noneLabel`.
  - The selected option shows a `check` icon and `ring-2 ring-primary`.
  - Tapping calls `onChange` right away. `error` shows an `InlineError` under the grid.
- Modify `libs/web/screens/src/components/AccountMenu.tsx`:
  - Add a row button `fsl-account-menu__theme` between "Your bank details" and Language: the `palette` icon, `t('theme.title')`, the current theme's name and a chevron.
  - It opens the picker the way the crop modal does: the menu hides while `themeOpen` and returns on close.
  - `explain = t('theme.personalExplain')`, with no none option.
- Modify `libs/web/screens/src/screens/Settings.tsx`: add a third row `fsl-settings__colours` in `fsl-settings__list`.
  - It shows only when `can(actorOf(view), 'set_theme') && !view.trip.archived`.
  - Its label is `t('theme.groupTitle')`, and its value is the theme name or `t('theme.useOwn')`.
  - It opens the picker with `noneLabel = t('theme.useOwn')` and `explain = t('theme.groupExplain')`.
- Copy (en / vi `// REVIEW`):

  | key | en | vi |
  |---|---|---|
  | `theme.title` | Theme | Màu giao diện |
  | `theme.personalExplain` | Your colours everywhere outside a group. Inside a group, the colours its admin picked win. | Màu của bạn ở mọi nơi ngoài nhóm. Trong nhóm, màu do quản trị viên chọn sẽ được dùng. |
  | `theme.groupTitle` | Group colours | Màu của nhóm |
  | `theme.groupExplain` | Everyone sees these colours inside this group, guests included. | Mọi người trong nhóm, kể cả khách, đều thấy màu này. |
  | `theme.useOwn` | Each person's own theme | Theo màu riêng của mỗi người |
  | `theme.name.jade` | Jade | Ngọc bích |
  | `theme.name.orchid` | Orchid | Lan tím |
  | `theme.name.sky` | Sky | Bầu trời |
  | `theme.name.indigo` | Indigo | Chàm |
- Test: `libs/web/screens/src/components/__tests__/theme-picker.test.tsx`, and `libs/web/screens/src/screens/__tests__/theme-choose.test.tsx`.

**Interfaces:**
- Consumes: Task 1's endpoints and types, Task 2's `cacheTheme` and the `palette` icon.
- Task 3 applies the result on its own.

- [ ] **Step 1 (worker):** write the tests.
  - In `theme-picker.test.tsx`:
    - `four themes, in order`;
    - `the none option comes first when given`;
    - `each preview carries its own data-theme`;
    - `the chosen one is checked`;
    - `a tap calls onChange at once` (no Save button exists).
  - In `theme-choose.test.tsx`:
    - `the account menu's Theme row opens the picker, and Orchid saves straight away`: a PATCH `/api/me` with `{ theme: 'orchid' }`, and `<html>` becomes `orchid`.
    - `a failed save reverts and shows the error`.
    - `an admin sets Group colours`: a PATCH `/api/trips/t-1` with `{ theme: 'sky' }`.
    - `Each person's own theme sends null`.
    - `a plain member sees no Group colours row`.
    - `no Group colours row in an archived group`.
- [ ] **Step 2 (worker):** implement.
- [ ] **Step 3 (Opus):** run `npm test`, `npm run typecheck` and `npm run lint`, then commit: `feat(web): choose your theme from the account menu; admins pick a group's colours`.

### Task 5: Docs, e2e, verification, handoff (Opus)

- [ ] **DESIGN.md:**
  - The theme set and the token table.
  - A named rule: "The Fixed Money Rule" (money colours and avatar pastels never change with a theme). Fold it into The Money Means Something Rule if that reads better.
  - The status-bar colour.
  - The Theme picker component.
  - Check that the add bar, gender pill and People entry from Parts 2–3 are present; they were added then.
  - Regenerate `.impeccable/design.json`: the colours section gets the four themes, and the components get the Theme Picker.
- [ ] **e2e:** add `e2e/themes.spec.ts`.
  - A signed-in person picks Orchid from the account menu, and `<html data-theme="orchid">` survives a reload.
  - An admin picks Sky for a group.
  - A guest opening the group link sees `data-theme="sky"`.
  - Run `npm run e2e`, then the walkthrough. Look at the groups, group page and a sheet in each theme at phone size.
- [ ] **Branch review and handoff:**
  - Run the final whole-branch review, then one fix wave.
  - Push and open the PR. Point out the uncommitted migration (`apps/api/migrations/0018_themes.sql` and meta) for the owner to commit before merging, plus the remote migration.
  - Restart the tunnel, probe it, hand off, and wait for approval.
