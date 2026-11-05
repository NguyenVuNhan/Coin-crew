# CoinCrew app rewrite: payment share, people, structure, themes

Date: 2026-11-05 · Status: approved by the owner 2026-11-05 · Integration branch: PR #37 (`NguyenVuNhan/Nx-workspace`); each part lands on its own branch and merges into it.
Read first: `PRODUCT.md` (who it's for, what every screen protects) and `DESIGN.md` ("The Friendly Ledger": tokens, components, rules). Mockups the owner reacted to: `.superpowers/brainstorm/33561-1793843378/content/` (git-ignored, local).

Marking: **[owner]** = decided by the owner in the brainstorm. **[my call]** = Claude's default, open to the owner's correction. Unmarked facts come from the code or the audit.

## 1. Intent and why

Most bugs, including UI/UX ones, surfaced only after the owner shared the app with their team, and most sat in the **payment share** path, the core of the app. People who tap a "pay me" link expect to pay right away; organisers find adding people clumsy and buggy. The rewrite makes the core path solid and direct, fixes what the audit found, and adds colour themes (a friend asked for a pink app). **[owner]**

The rewrite is only: a visual refresh with colour themes; reworking the flows guests and organisers go through; restructure, UI/UX review and improvement. **[owner]** Everything else in the app is considered good and stays as it is. **[owner]**

## 2. Goals, non-goals, anti-goals

**Goals**
1. From a Zalo link to paid in the fewest steps, in both share situations (§4).
2. Adding people one after another is fast, never blocked by look-alike names, and gender is clear (§5).
3. Every audit finding is fixed (§4, §6).
4. Signed-in people pick a personal theme; a group's admin picks the group's colours (§7).
5. The payment share path is bug-checked end to end before it reaches the owner's team again (§4.9).

**Non-goals**
- New features beyond these (no personal-finance phases, no new split modes, no new sign-in methods).
- Dark mode. Themes are light themes. **[owner: "light for now"]**
- Changing the navigation model (Quick expenses / Groups / Activity) beyond moving People (§6.1). **[owner: "the rest seems good"]**
- Guests adding their own name. It stays removed. **[owner]**

**Anti-goals** (failure even if it works)
- A friend who taps a "pay me" link has to hunt for the pay button.
- Any money changes hands differently: amounts, splits, approvals, confirmation rules and balances behave exactly as today, except the rounding default for new groups (§4.7).
- A theme makes "you owe" / "paid" / "waiting" ambiguous, or text drops below WCAG AA.
- Look-alike names stop someone from adding a person.
- The "Friendly Ledger" look drifts: raw hex, nested cards, shadows on flat content, money colours used for decoration (DESIGN.md Do's and Don'ts).

## 3. Constraints

- Everything in `PRODUCT.md` → Capabilities and Constraints, in particular: free Cloudflare plan (watch D1 reads, e.g. on pay screens), the app never moves money, phone first at 375px, Vietnamese first.
- Links open in Zalo's in-app browser, Chrome (Android, PC), Safari (iPhone), the Zalo Mini App and the home-screen app; each must work (`PRODUCT.md` principle 4).
- `DESIGN.md` is the visual authority. New patterns introduced here (the add bar, gender pills, themes) get added to it and its sidecar is regenerated.
- Workspace rules in `CLAUDE.md`: where code goes by kind, import rules enforced by lint, shadcn parts added with its CLI, `fsl-*` classes and `data-testid` kept on the same elements.
- Database changes (theme columns, §7) come as a migration. Per the owner's rule, Claude does not commit generated migrations; the owner reviews and commits them, and remote migrations are run by the owner.
- Harness: routine code is built by Gemini Flash in Orca worktrees; Opus plans, reviews and runs tests. Gemini may add tests but never edits or deletes existing ones. Where an existing test pins behaviour this design changes on purpose (listed per part), the architect updates that test.

## 4. Part 1: payment share, and the bug check

Two ways a "pay me" link reaches a Zalo group **[owner]**:
1. **Situation 1:** someone who paid for the group asks everyone to pay them back (the reminder message carries the group link `/j/<token>`).
2. **Situation 2:** after a sport session, the organiser shares that one session's bill (`/j/<token>/e/<expenseId>` → `/j/<token>/expenses/<id>/pay`).

### 4.1 Situation 1: after "Who are you?", show what you owe
Today `WhoAreYou` sends a guest to the group page after they pick a name, and they must find "Pay with VietQR" among bank details, transfers and expenses.
- **[owner]** Only "pay me" messages open the new screen. Reminders and pay requests get a link of their own (its exact path is the builder's choice, e.g. `/j/<token>/owe`): `remindText` and the reminder actions on the group page, transfers and pay screen use it. The ordinary invite link `/j/<token>` keeps opening the group page as today, so friends who open it mid-trip to add expenses aren't pushed to pay. Other messages that carry the group link (e.g. asking someone to add bank details) keep the ordinary link. Tests that pin the reminder's link text are updated by the architect.
- **[owner]** On that pay link, after the name (or straight away when this phone already remembers it), the guest sees **"Chi, you owe"**: one row per person to pay (fewest transfers can make it 2–3 people), each with its own Pay button, and a "See the group" link to the full group page.
- **[owner]** If they owe exactly **one** person, skip the list and open that person's pay screen directly (amount, QR, Open bank app, I've paid), still with "See the group".
- **[owner, confirmed after playback]** If they owe nothing or have already paid everything, a clear "You're all set" state with "See the group".
- Signed-in members who open the pay link get the same "you owe" screen (they skip "Who are you?"). **[my call]**
- The e2e golden path's guest still opens the ordinary invite link and lands on the group page, so it stays as it is.

### 4.2 Situation 2: the session bill link opens on your share and the QR
- **[owner]** The first screen is the pay screen for that session: "Pay Minh · Sunday badminton", the friend's share (and their slot, e.g. "your share (Nữ)"), the QR, Open bank app, I've paid. A "View the bill" control opens the bill (court, shuttles, per-slot amounts) as a sheet over the pay screen, so the QR is never lost.
- Name picking happens first only if this phone doesn't remember the person. **[owner]**
- The organiser's own view of the bill keeps "Share bill & QR". **[owner, confirmed after playback]**
- **[my call]** If this phone remembers someone who has no share in that bill, show "Nothing for Bình in this bill" with "Not Bình? Switch" (today's switch, which changes who the phone is for the whole group, as everywhere else) and "See the group". Never silently show the bill instead.
- **To reproduce first:** the owner's team reported that the first tap "only shows the bill and the share button". In code, `ExpensePay` redirects to the bill page whenever the viewer has no share row in that expense (for example they are the payer, or this phone remembers a different name). The builder reproduces the report, finds which case the team hit, and fixes it so a person who owes in that bill always lands on the pay screen.

### 4.3 The bill link's first screen: no warning box
A guest opening a bill link first sees a large amber "Joining as a guest" box about approvals and bank details. For someone paying one bill this is noise, and it uses the "waiting" colour as a warning. **[my call]** On bill links, show the short "Who are you?" list only; move the guest explanation to the group link's picker as one quiet line (Stone Muted text, no amber box), with the sign-in buttons kept below the list.

### 4.4 A signed-in newcomer can join from a bill link (bug)
A signed-in person who isn't in the group yet, opening a bill link, sees only other people's names; "Join as …" is hidden in expense mode (`WhoAreYou`: `!isExpenseMode && account`). Fix: offer "Join as <name>" (with the gender step in sport groups, §5.4) on bill links too, then continue to their pay screen for that bill.

### 4.5 The session bill fits a phone (bug)
At 375px the bill table on the expense details page runs past the right edge: the amount column header and the ₫ signs are clipped. People screenshot this table for Zalo. Fix so the whole table fits 320–375px wide without sideways scrolling (narrower columns, wrapping names, or a stacked layout: builder's choice), in Vietnamese and English. The shared bill image (share card) gets the same check.

### 4.6 Sharing before bank details exist
An organiser can share a group or a bill before adding a bank account; every guest then gets "Minh hasn't added bank details yet" instead of a QR. **[my call]** When the person being paid has no bank details and they share a "pay me" link (Invite/Share on the group, Share bill & QR, a reminder), first ask them to add bank details, with "Share anyway" still available. It suggests, never blocks.

### 4.7 Round to 1.000₫ by default for new groups
Today a 400.000₫ session split six ways asks for 66.667₫ and 66.666₫; rounding exists but is off. **[owner]** New groups start with "Round transfer amounts" on. **[my call]** This applies to every new group (trips and sport), and existing groups keep their current setting. Rounding itself behaves exactly as it does today.

### 4.8 Pay screen states to cover
The pay screen (both situations) handles: a QR with amount and transfer note; no bank details for the payee (today's message and "Remind"); payment already marked, waiting for the payee to confirm; confirmed; nothing owed. Each state is reachable and correct in all six environments (§3).

### 4.9 The bug check **[my call]**
"Done" for Part 1 means all of:
1. **Scripted walkthroughs** at 375×812 and 1280×800, in Vietnamese and English, against the private e2e server (`npm run e2e:server -w @cc/api`, test sign-in, port 8788, never tunnelled): organiser creates a sport group and a trip, adds people, records a session, shares; a guest opens the group link (owes one person; owes several; owes nothing); a guest opens a bill link (new phone; remembered phone; the payer themselves); a signed-in newcomer joins from each link; payment marked and confirmed. Screenshots reviewed by the architect.
2. **End-to-end tests** (Playwright) for both share situations and the newcomer-joins-from-bill-link case, added next to the existing golden path.
3. **Real-phone pass** by the owner before the team sees it: Zalo's in-app browser (Android and iPhone), Chrome Android, Safari iPhone, the home-screen app, the Mini App. A checklist goes with the PR.
4. Unit tests, typecheck and lint green through Nx.

## 5. Part 2: adding people

Who adds people: only the organiser and admins; guests pick a name or sign in to join. **[owner]**

### 5.1 The add bar
- **[owner]** On the People screen, a bar docked at the bottom (above the keyboard) holds the name field and the add buttons. In **sport groups** the buttons are **"+ Nam"** and **"+ Nữ"**: each adds the typed name with that gender. In **trip groups** one **"+ Add"**.
- **[owner]** Adding many people in a row must flow: after each add the field clears and keeps focus, and the keyboard stays up.
- **[my call]** Enter adds with the gender last used (trip groups: just adds). Pasting several lines (e.g. the Zalo member list) adds every line as a person; genders are then fixed with the row pills. The list scrolls to show each new row; the bar doesn't jump.
- **[owner]** A snackbar confirms each add ("Added Anh · Nữ") with Undo, which removes that person.
- **[my call]** Creating a group uses the same add bar for its first roster, so adding looks and works the same in both places. The organiser's own row stays at the top. While creating a group, the bar keeps today's suggestions of friends from your other groups (picking one attaches their account, as today); the People screen's bar has no suggestions, since that would need a new server feature.
- Changed on purpose: e2e and unit tests that drive the old "Add person" rows in `CreateTrip`/`PeopleInput` are updated by the architect.

### 5.2 Look-alike names suggest, never block
- **[owner]** The name is added straight away. A small hint sits under the new row: "Like Tuấn Anh? Merge", plus dismiss. "Merge" opens the existing merge tool with both people picked.
- **[my call]** The server stops refusing look-alike names (`addPersonToTrip` no longer throws without `confirmNew`; the field may stay accepted and ignored). This applies to every add path: the People screen, creating a group, the quick-expense person picker, signed-in joining. The "Yes, I'm X / No, add me" choice on signed-in joining stays, because there the person is choosing who they are.
- The similarity rule itself (`findSimilarNames`) is unchanged; only blocking goes.

### 5.3 Gender on every row
- **[owner]** Each person row in a sport group shows a small gender pill button ("♂ Nam" / "♀ Nữ"). An admin taps it to flip Nam ↔ Nữ, with Undo in the snackbar. No swap icon. Someone without a gender shows a "Set gender" pill that opens the two choices.
- **[owner]** Non-admins see other people's gender as plain text. **[owner]** Every signed-in member can still change their own (their own row's pill stays tappable), as the join step promises ("You can change it later"). Guests cannot change gender at all, not even their own: the server stops allowing it, and the guest-gender case in `apps/api/test/admin-permissions.test.ts` is updated by the architect to expect a refusal.
- The pill's visible size stays small; its tap area is 44px (DESIGN.md touch-target rule). Gender never uses a money colour: today's amber Nữ pill goes (neutral Muted Fill for both).

### 5.4 Gender when a signed-in person joins a sport group
- **[owner]** After "Join as Nhân", a labelled question "You play as" with two clear choices, Nam and Nữ, a one-line reason ("Used to split court costs. You can change it later.") and a Join button. Replaces today's lone, unlabelled cycling icon.

### 5.5 Clean-ups
- Remove the unused "add my name" copy (`who.someoneNew`, `who.newTitle`, `who.newHint`, `who.newPendingNote` in both languages). **[my call]**
- `PRODUCT.md`: correct "new guest names wait for a member's approval" (guests no longer add names). **[my call]**
- `GenderToggle`'s three-state cycle is retired from the UI. **[my call]**

## 6. Part 3: structure and visual fixes

### 6.1 People out of Settings
Today: group → settings gear → Group settings → People. **[my call]** The group page gets a "People" entry beside the group name area, shown as an avatar stack with the count, opening People; People keeps Invite at its top. Group settings keeps a People row too, for people who look there.

### 6.2 Room for the group name
The header cuts "Cầu lông CN" to "Cầu lông …" because Invite, the gear and the avatar share it. **[my call]** The header keeps back, title and the gear; Invite moves into People (and the empty-group invite card stays). The name may wrap to two lines rather than truncate.

### 6.3 Avatar colours spread out
`avatarTone` sums character codes mod 6; six real names got two colours. Use a well-mixed hash of the normalised name (e.g. FNV-1a) so colours spread. Same person, same colour everywhere. Tests that pin a specific tone are updated by the architect.

### 6.4 Colours used for their meaning only
- Nữ pill: neutral, not Turmeric (§5.3).
- Info notices (e.g. the guest explanation): quiet text or Jade Mist, not Turmeric; Turmeric means waiting / needs action.
- "Disable" on expense details: a Lychee-text ghost or outline button, not red text on mint.
- "DANGER ZONE": sentence case like every other section label.
- Sweep the app for other money-colour or amber misuse while doing this; record anything found in the PR.

## 7. Part 4: colour themes

### 7.1 Who picks what **[owner]**
- **Signed-in people** pick a personal theme. It applies everywhere outside a group: Quick expenses, Groups, Activity, settings and sign-in screens.
- **A group's admin** picks the group's colours. Inside that group they win for everyone, guests included.
- Guests have no personal theme; they see the group's colours inside a group and the default elsewhere.

### 7.2 What a theme changes **[owner]**
- The accent: buttons, the active nav item, accent pills, links, focus ring, the "owed to you" balance (today Jade's job).
- A faint wash of the theme colour on the page and the header. Cards, lists, sheets and fields stay white. **[owner]** The default Jade theme is the exception: it keeps today's warm off-white page (Rice Paper), so nothing changes for anyone who never picks a theme.
- The phone's status-bar colour (`theme-color`) follows the theme in view. **[my call]**
- **Never:** the money colours (Leaf, Lychee, Turmeric) and the avatar pastels stay fixed in every theme.

### 7.3 The set **[owner: ready-made; my call: which]**
A short set of ready-made light themes, not a free colour picker. Start with four: **Jade** (default, today's), **Orchid** (a purple-leaning pink, so it never reads as the "you owe" red), **Sky** (blue), plus one more chosen during the build. Each theme is a full token set in `globals.css` (primary, its foreground, secondary and its ink, ring, page and header wash) and passes WCAG AA for every text pairing. A hue that could be mistaken for Leaf, Lychee or Turmeric is not allowed.

### 7.4 Where people choose **[my call]**
- Personal theme: the account menu → "Theme", a sheet of swatches previewing each theme on a mini screen.
- Group colours: Group settings (admins only) → "Group colours", the same sheet, with "Use each person's own theme" as the default option (no group colour set).
- Choices save immediately; no Save button.

### 7.5 Storage **[my call]**
- Personal theme: a column on users, returned with the session (`/api/me`), also cached on the device so the first paint doesn't flash the default.
- Group colours: a column on the group (trip), returned in the trip view, settable only by admins (server-enforced).
- A migration adds both columns (nullable; null = default / no group colour). See §3 for who commits it.

### 7.6 DESIGN.md
Update DESIGN.md for themes: the theme set and its tokens, the rule that money colours and avatar pastels never change, the status-bar colour, and the new patterns from Parts 2–3 (add bar, gender pill, people entry). Regenerate `.impeccable/design.json`.

## 8. Order and delivery **[owner: order]**

1. Part 1: payment share + the bug check
2. Part 2: adding people
3. Part 3: structure and visual fixes
4. Part 4: themes

Each part: its own branch from `NguyenVuNhan/Nx-workspace` (which already has PRODUCT.md and DESIGN.md, PR #46), its own PR with base `NguyenVuNhan/Nx-workspace`, merged before the next part starts. The whole rewrite reaches `main` together through PR #37. **[owner]** The tunnel (`npm run tunnel`) is offered after each part's PR for a hands-on check; the full real-phone pass of §4.9 runs once per part and again before PR #37 merges. **[my call]**

## 9. Left to the builder

- Exact layout within the DESIGN.md system: spacing, copy wording (Vietnamese first, `// REVIEW` on draft translations), icons, the "you owe" list's row design, the bill sheet's layout.
- How the bill table fits a phone (§4.5).
- The fourth theme and the exact token values for Orchid and Sky, within §7.3's rules.
- How the theme is applied in code (e.g. a `data-theme` attribute and CSS variables), as long as there is one source of colour (DESIGN.md "One Source Rule").
- Which library each new piece lives in, following CLAUDE.md's "where new code goes" and the import rules.
- Splitting each part into tasks for delegation.
