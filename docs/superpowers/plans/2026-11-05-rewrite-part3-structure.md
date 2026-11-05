# Rewrite Part 3: structure and visual fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo implementers are Orca workers in Antigravity (owner's routing): **Flash** = `gemini-3.8-flash-high`; **Argon** = `gemini-4-argon-medium`; **Opus-AG** = `claude-opus-5-5-medium` (falls back to Argon if its quota is out). **Opus** = the planner in Claude Code (test updates, docs, verification).

**Goal:** The group page's header has room for the name, and People sits one tap from the group page. Avatar colours spread out, and colours are used only for their meaning. The ratings widget stops jolting the page while you scroll.

**Architecture:** These are UI-only changes in `@cc/web-ui` and `@cc/web-screens`, with no API or schema change.
- **Group page:** loses Invite and the account avatar from its header, so the name can wrap to two lines. It gains a People entry (an avatar stack and a count). People gets the Invite button at its top.
- **Avatar tone:** a well-mixed hash.
- **Leaderboard widget:** never changes its own height on scroll. A fixed compact bar fades in once the widget has scrolled out of view.

**Tech Stack:** React 19, react-router 8, Tailwind v4 + `@cc/web-ui` wrappers, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-05-app-rewrite-design.md` §6, plus the owner's backlog bug (2026-11-05): "The rating widget animation is very clunky when scroll on phone, when reach certain threshold it colapsed too fast which shift the whole page with it".

Branch `feat/rewrite-structure` (from `NguyenVuNhan/Nx-workspace` at 520cc6d); the PR targets `NguyenVuNhan/Nx-workspace`.

## Why the widget jolts (root cause)

`LeaderboardWidget` sits in the page flow and listens to `window.scrollY`. Past a threshold it animates its own `max-height` from 340px to 60px, then to 0. That widget is above the viewport, so shrinking it pulls the whole page up under the finger, and `scrollY` jumps with it. The change of `scrollY` can cross the restore threshold again.

## Global Constraints

- Everything in the app that is not named here stays as it is (spec §1). Money, splits and approvals are untouched.
- `DESIGN.md` is the visual authority: no raw hex, no nested cards, touch targets ≥ 44px, phone first at 375px with no sideways scroll.
- **Colour meanings** (DESIGN.md): Leaf = coming in, Lychee = going out or destructive, Turmeric = waiting or needs action, Jade / Jade Mist = brand, selection and info. Gender never uses a money colour.
- Keep `fsl-*` classes and `data-testid` on the same elements; new elements get new `fsl-*` classes.
- Copy goes in `en.ts` and `vi.ts`; every new Vietnamese line ends with `// REVIEW`.
- **Test ownership:** workers may add new tests but never edit or delete existing ones, and never run tests. Opus updates the existing tests named here, runs every suite, and commits.

## Review Focus

1. **A long Vietnamese group name** (60 characters, e.g. "Cầu lông CN tối thứ 5 sân Thành Công quận Đống Đa") at 375px wraps to at most two lines, with no sideways scroll, and the gear stays a 44px target. → Task 4 test `a long group name wraps to two lines and keeps the gear`.
2. **A view-only link** (`me.kind === 'viewer'`) never shows a People entry that leads to a no-access page. → Task 4 test `viewers get no People entry`.
3. **Scrolling past the leaderboard** never changes the widget's height in the page flow. The compact bar is an overlay. → Task 3 test `scrolling never changes the in-flow widget`.
4. **The same person gets the same colour everywhere**, whatever their accents, capitals or extra spaces. → Task 1 test `ignores accents, capitals and spacing`.
5. **Inviting from Zalo still works** once Invite leaves the header: People's top button opens Zalo's share in the Mini App and the Invite sheet on the web. → Task 4 test `People's Invite opens the share in Zalo and the sheet on the web`.

---

### Task 1: Avatar colours spread out (Flash)

**Files:**
- Modify: `libs/web/ui/src/components/Avatar.tsx:10-17` (`avatarTone`)
- Test (Opus, existing): `libs/web/screens/src/components/__tests__/primitives.test.tsx` (its pinned tones)
- Test (new): `libs/web/ui/src/components/__tests__/avatar-tone.test.ts`

**Interfaces:**
- Produces: `avatarTone(name: string): 1 | 2 | 3 | 4 | 5 | 6`.
  - The algorithm is FNV-1a 32-bit over the UTF-16 code units of `normalizeName(name)` (`@cc/core`): offset `0x811c9dc5`; per unit `h ^= code; h = Math.imul(h, 0x01000193)`; result `((h >>> 0) % 6) + 1`.

- [ ] **Step 1 (worker):** write `avatar-tone.test.ts`:
  - `spreads a real group over the palette`: `avatarTone` of `Minh, Bình, Chi, Tuấn Anh, Dũng, Nguyễn Thị Thanh Hương` is exactly `[4, 5, 6, 3, 6, 1]`, and the `Set` size is ≥ 5.
  - `ignores accents, capitals and spacing`: `avatarTone('Bình') === avatarTone('binh') === avatarTone('  BINH ')`.
- [ ] **Step 2 (worker):** implement.
- [ ] **Step 3 (Opus):** update the pinned tones in `primitives.test.tsx`, run `npm test`, and commit `feat(web-ui): avatar colours spread out across a group`.

---

### Task 2: Colours used for their meaning only (Flash)

**Files and changes:**
- **Disable button** (`libs/web/screens/src/components/ExpenseDetails.tsx:369-376`): a `tone === 'danger'` action renders as `variant="ghost"`, with `fsl-details__action--danger text-danger border border-danger/40 hover:bg-danger-soft`. It must not be a secondary (Jade Mist) button with red text.
- **Danger zone heading** (`libs/web/screens/src/screens/Settings.tsx`, both `fsl-settings__heading` headings, about lines 151 and 167): drop `uppercase tracking-wider`, use `text-sm font-semibold text-muted-foreground` (DESIGN.md section label), and set the copy to sentence case (`settings.dangerZone` en "Danger zone", which already is).
- **Leaderboard title** (`LeaderboardWidget.tsx` `fsl-leaderboard__title`): the same sentence-case section-label classes.
- **Info notices become Jade Mist** (`bg-secondary text-secondary-foreground`):
  - `JoinRequestSheet.tsx:117` (`join.groupsMove`);
  - `BankHandoffSheet.tsx:317` (`pay.handoffTip`);
  - `PayQr.tsx:131` (memo highlight).
- **Sport bill totals** (`SportBillTable.tsx:67` and `:86`, the totals rows): `bg-muted text-foreground font-semibold`.
- **Already done in Part 2:** the Nữ pill is neutral (spec §6.4 first bullet), and Group settings keeps its People row (§6.1); nothing to change.
- **Kept on purpose** (they mean waiting or needs action; list them in the PR):
  - ApprovalQueue, BalanceCard clock, ExpenseRow/ExpenseDetails/PaymentDetails "waiting", ExpensePaymentsApproval, YourTransfers waiting;
  - MergeRequestBanner, ProposalBanner, MergeSheet current step, LinkedAccounts pending chip, MergePicker ask-admin tags;
  - MyBankRow pending, the PeopleInput "already listed" hint.
- **Test (new):** `libs/web/screens/src/components/__tests__/colour-meaning.test.tsx`:
  - `Disable is a Lychee-text ghost, not red on mint`: render `ExpenseDetails` for an admin with an approved expense, using the fixtures in `../../test/fixtures`. The `Disable` button's class has `text-danger` and no `bg-secondary`.
  - `the danger zone heading is sentence case`: on Settings, the heading's class has no `uppercase`.

- [ ] **Step 1 (worker):** write the test.
- [ ] **Step 2 (worker):** make the changes.
- [ ] **Step 3 (Opus):** run `npm test`, then commit `fix(web): colours keep their meaning (disable, danger zone, info notes, bill totals)`.

---

### Task 3: The leaderboard stops jolting the page (Argon)

**Files:**
- Modify: `libs/web/screens/src/components/LeaderboardWidget.tsx`
- Test (Opus, existing): `libs/web/screens/src/components/__tests__/LeaderboardWidget.test.tsx` case `transitions smoothly across full -> collapsed -> hidden on scroll…` is rewritten (Step 1).

**Interfaces:**
- **Scroll never changes height.** The in-flow widget's stage is only `'full'` or `'collapsed'`. `'collapsed'` happens only when the person taps collapse, and expand restores `'full'`. Remove the `scroll` listener and `HIDE_SCROLL_Y` / `COLLAPSE_SCROLL_Y` / `RESTORE_SCROLL_Y`.
- **The overlay bar.**
  - An `IntersectionObserver` watches the widget section. When it is not intersecting and its `boundingClientRect.top < 0` (scrolled above the viewport), a fixed overlay bar renders.
  - The bar reuses the collapsed bar's content and is a `div.fsl-leaderboard__float` with `role="region"` and aria-label `t('ratings.leaderboard')`.
  - Classes: `fixed inset-x-0 top-14 z-10 mx-auto max-w-[448px] px-4`, inner `rounded-xl border border-border bg-card shadow-lg`, with fade `animate-in fade-in motion-reduce:animate-none`.
  - Its expand button scrolls the widget into view (`scrollIntoView({ block: 'start', behavior: 'smooth' })`) and restores `'full'`.
  - Without `IntersectionObserver` (old WebViews), no overlay is shown.
- **Colour:**
  - the collapsed bar becomes `border-border bg-card` (not Turmeric);
  - the trophy and crown use `text-primary`;
  - the #1 podium avatar uses `border-primary bg-secondary text-secondary-foreground`.

- [ ] **Step 1 (Opus):** rewrite the scroll case as two tests:
  - `scrolling never changes the in-flow widget`: set `scrollY` to 100, then 260, and dispatch `scroll`. `data-stage` stays `full`.
  - `the floating bar shows once the widget scrolls above the screen`: stub `IntersectionObserver` to capture its callback, then call it with `{ isIntersecting: false, boundingClientRect: { top: -50 } }`. A region named `Leaderboard` (or the en `ratings.leaderboard`) with class `fsl-leaderboard__float` appears. Calling it with `isIntersecting: true` removes it.

  Keep the manual collapse/expand assertions. Commit them red.
- [ ] **Step 2 (worker):** implement. Add `the floating bar never shows without IntersectionObserver`.
- [ ] **Step 3 (Opus):** run `npm test`, then commit `fix(web): the ratings widget no longer shrinks under your finger while scrolling`.

---

### Task 4: Group header room, People one tap away, Invite in People (Opus-AG)

**Files:**
- Modify: `libs/web/screens/src/components/Screen.tsx` (new prop `titleLines?: 1 | 2`, default 1). With 2, the `<h1>` swaps `truncate` for `line-clamp-2 [overflow-wrap:anywhere]`.
- Modify: `libs/web/screens/src/screens/MemberTrip.tsx`:
  - `header` keeps only the gear Link (`fsl-member__settings`), on both platforms; remove the header Invite button and `<AccountMenu />`;
  - `Screen` gets `titleLines={2}`;
  - render `<PeopleEntry view={view} />` as the first content item (phone: before `{notice}`; wide: first in `left`);
  - keep `InviteCard` on an empty group; the InviteSheet state may stay for the card's own needs.
- Create: `libs/web/screens/src/components/PeopleEntry.tsx`: `PeopleEntry({ view }: { view: TripView })`.
  - Returns null when `view.me.kind === 'viewer'`.
  - Otherwise a `Link` to `href('/people')` (`useTrip`). It is a white `rounded-xl border border-border bg-card` row, `min-h-14 px-4`, class `fsl-member__people`. Its accessible name is `t('member.peopleEntry', { count })`.
  - Inside: an avatar stack of the first 4 non-left people (`Avatar size="sm"`, each after the first `-ml-2 ring-2 ring-card`), the text `t('member.peopleCount', { count })`, and a `chevronRight` Icon. `count` = people whose status isn't `left`.
- Modify: `libs/web/screens/src/screens/People.tsx`:
  - An Invite button at the top of the content, before the list, shown when `!view.trip.archived && view.links !== null` and the viewer may invite (the same condition MemberTrip uses for `canInvite`).
  - In the Mini App it is the existing `ZaloInviteButton` (moved from the bottom). On the web it is a secondary block `Button` (`fsl-people__invite`, `userPlus` icon, `t('invite.button')`) that opens `InviteSheet` (`../components/InviteSheet`).
  - `Screen` `back` becomes `href()`.
- Copy (en / vi):
  - `member.peopleCount`: `{count} people` / `{count} người`
  - `member.peopleEntry`: `People in this group: {count}` / `Thành viên trong nhóm: {count}`
- Test (Opus, existing): update `libs/web/screens/src/screens/__tests__/member-trip.test.tsx` cases that find the header Invite button or the account menu on the group page. Grep it for `Invite` and `Account`.
- Test (new, worker): `libs/web/screens/src/screens/__tests__/group-header.test.tsx`:
  - `the header keeps only the gear`: the header has no `Invite` button and no `Account` button; the `Trip settings` link is present.
  - `a long group name wraps to two lines and keeps the gear`: the 60-char name above; the `h1` has `line-clamp-2` and no `truncate`; the gear link is present.
  - `the People entry opens People`: the link `People in this group: 4` (fixture `tripView()`) has `href` ending `/people`.
  - `viewers get no People entry`.
  - `People's Invite opens the share in Zalo and the sheet on the web`:
    - web: clicking `Invite` on People shows the invite sheet (find it by its title);
    - with `fakePlatform()` (zmp): clicking the Zalo invite button records `calls.share`.

- [ ] **Step 1 (Opus):** update `member-trip.test.tsx` and commit it red.
- [ ] **Step 2 (worker):** implement, and write `group-header.test.tsx`.
- [ ] **Step 3 (Opus):** run `npm test`, `npm run typecheck` and `npm run lint`, then commit `feat(web): People one tap from the group page; the header keeps room for the name`.

---

### Task 5: Docs, e2e, verification, handoff (Opus)

- [ ] **DESIGN.md:**
  - Navigation / group page: the header holds back, a two-line title and the gear; the People entry sits under it.
  - Avatars: the tone comes from a hash of the normalised name.
  - Colour sweep outcome under "Named Rules": Turmeric only for waiting or needs action.
  - Leaderboard: the overlay bar instead of the scroll collapse.
  - Mirror any new component in `.impeccable/design.json`.
- [ ] **e2e:** grep `e2e/` for the header `Invite` button or the group-page account menu (`getByRole('button', { name: 'Invite' })`, `'Account'`) and route them through People. Run `npm run e2e`, then `npm run build -w @cc/web && WALKTHROUGH=1 npm run e2e -- e2e/walkthrough.spec.ts`. Look at the group page, People and sport-group shots in vi and en, phone and desktop.
- [ ] **Branch review and handoff:**
  - Final whole-branch review and one fix wave.
  - Push, open the PR with the colour-sweep list (kept vs changed).
  - Restart the tunnel, probe it, hand off, and wait for the owner's approval.
  - Remove the rating-widget line from the `rewrite-bug-backlog` memory once merged.
