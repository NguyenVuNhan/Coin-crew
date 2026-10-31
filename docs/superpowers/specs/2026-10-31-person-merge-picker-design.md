# One merge picker on the person page — design

Date: 2026-10-31 · Status: approved · Mockup: `.superpowers/brainstorm/15020-1793461977/content/person-and-merge.html`

## Why

Cleaning up duplicates across groups is confusing today. The two real cases the owner hit:

1. **The same guest typed twice inside one group.**
2. **A signed-in friend who is also a guest in some group.**

Today the person page (`/people/:key`) offers two overlapping things:

- **"Merge with…"** — a sheet of bare name buttons. It makes a *view-only* "same person" link (`POST /api/me/people/link`, `person_links` kind `merge`). Similar names are sorted first (`findSimilarNames`) but not marked, nothing else identifies a row, and it can't be searched.
- **"Rename or merge in {group}"** — one button per group, jumping to `/t/:id/people`, where an admin does a *real* group merge (`POST /trips/:id/people/merge`) or a rename.

People can't tell them apart, and a row with just a name isn't enough to spot a duplicate. Case 2 can't be fixed from the person page at all: the view-only link leaves the group showing a separate guest.

## Goals

- One **"Merge with…"** entry on the person page that handles every case, and says before you tap what will happen.
- The picker **suggests likely duplicates**, is **searchable**, and shows enough per row to recognise someone: avatar, Gmail/Zalo, the groups they're in.
- **Email visibility (owner's decision):** the picker shows a signed-in user's Gmail address (or "Zalo" for a Zalo login) to anyone who shares at least one group with them. This is a deliberate change: today only admins see it, on a pending claim.
- Case 2 becomes a real fix: a **request that both the friend and the group admin accept**, after which the guest's expenses and payments belong to the friend's account in that group.
- The person page looks better: a **bigger avatar**, and "Edit nickname" becomes a **✎ icon next to the name**. The ✎ sheet also renames the guest in groups you admin.

## Non-goals

- No change to the group People page (`/t/:id/people`): its own merge and rename stay for admins working inside a group.
- No cross-group "real" merge for two guests in *different* groups (or Quick Expenses + a group). Those stay **"only for you"**. The owner confirmed this is good enough.
- No change to the account-merge flow (sign-in methods, `MergeSheet` / `MergeRequestBanner`).

## Anti-goals (a failure even if it works)

- A tap that changes a group for everyone without the user knowing it would. Every row says what it does, and a confirm step repeats it in words.
- A signed-in person's balance moving to them without their consent.
- Gmail/Zalo shown to someone who has **no group in common** with that user.

## The person page

Spec'd against the "Friendly" look (`2026-10-28-shadcn-friendly-redesign-design.md`); use the app wrappers (`Avatar`, `Button`, `Sheet`, `Icon`, `Pill`, `Snackbar`).

- **Header:** avatar at 96px (it shows a photo for a signed-in person when one exists; initials otherwise). Name in `text-xl`/`2xl font-semibold`, with an icon button (lucide `pencil`, ghost, ≥44px target, aria-label "Edit") right next to it. Under the name: the nickname in quotes if set, plus (my call) "Guest in {group}" for a guest.
- **Remove** the "Rename or merge in {group}" buttons.
- **Keep** "Merge with…" (`data-testid="person-merge"`) where it is now, shown when merging is possible (see "Who sees the button").
- **Pending requests:** while a merge request this user made is waiting, show a row on the person page: *"Waiting for {friend} and the {group} admin"* with a Cancel action.

### The ✎ sheet

- **Nickname** field: "Only you see this." Same as today (`setNickname`).
- **Name in {group}** field: one for each group where this person is a **guest and the caller is an admin**. Saving renames the participant for everyone in that group, using the same rename the group People page uses. In groups where the caller isn't an admin, show the name as plain text (my call).
- A signed-in person has no group-name fields, because they choose their own name (my call).
- One Save button saves all changed fields and shows one snackbar. If one save fails, show that error inline and keep the sheet open; the fields that saved stay saved.

## The merge picker

A `Sheet` titled "Merge {name} with…".

- **Search box** at the top (`text-base`): matches name, nickname, email/Zalo label, and group name, ignoring case and Vietnamese diacritics (reuse the normaliser behind `findSimilarNames`).
- **"Looks like {name}"** section: the `findSimilarNames` matches, shown while the search box is empty. When the user types, show a single filtered list (my call), still with suggested matches first.
- **"Everyone else"**: the rest, A–Z.
- **Each row** (the mockup shows the layout):
  - avatar (photo if signed in, initials otherwise)
  - name
  - meta line: Gmail address or "Zalo" when signed in · the groups they're in ("Quick Expenses" for direct)
  - an **outcome tag** (a `Pill`):
    - 🔒 **Only for you** (neutral)
    - 👥 **Merges in {group} for everyone** (secondary)
    - ⏳ **{friend} + {group} admin must accept** (warning-soft)
    - ⏳ **{group} admin must accept** (warning-soft): a same-group merge when you're not an admin there
    - or disabled with a reason (e.g. both signed in, as today)
- **Tapping a row** opens a confirm step (inside the same sheet, or a `Modal`; builder's call) that says the outcome in a full sentence, then **Confirm** / **Back**.

### What each pick does

The pick is classified from the two people's participant rows. Call the person on the page **A** and the picked row **B**.

**Group merge: whose name stays (my call):** B is merged into A (`mergeParticipants(from=B, into=A)`), so A, the person whose page you're on, keeps their name in the group. The confirm step says so. Undo of a group merge stays on the group People page, as today.

| A and B | Outcome | How |
|---|---|---|
| Two guests, **same group** (one participant each in group G) | 👥 Group merge in G | If the caller can merge in G (admin/organiser, `can(actor,'merge')`): run `mergeParticipants` now. **Otherwise (owner's decision): a request to G's admins** ("{caller} says '{B}' and '{A}' are the same person"), approved or declined in `ApprovalsCard`. Approval runs the same merge. This is a request with no user attached, so it needs a new request kind or table. |
| Guests in **different groups**, or a **Quick Expenses** guest + any group guest | 🔒 Only for you | The existing `POST /api/me/people/link`. Instant, undoable from the person page as today. |
| A guest in group G + a **signed-in user** U | ⏳ Request | A new "is this you?" request. **U and an admin of G** must both accept. If the caller is G's admin, the admin side counts as accepted. |
| A **Quick Expenses** guest + a signed-in user U | ⏳ Request | Only U must accept, since Quick Expenses belongs to the caller. |
| Both signed in | Disabled | "Both have accounts", as today. |

When A or B spans **several groups** (it's already a linked person), the outcome is per group. The row shows the strongest outcome (my call: request > group merge > only for you). The confirm step lists each group's outcome, and the "only for you" parts apply immediately alongside any request.

### The request (new)

Built on the existing claim flow (`membership_requests`: a signed-in user claims a guest name, an admin approves, the participant gets the user id). The new request is a claim **made on the friend's behalf**:

- Created by the caller for (group G, guest participant P, user U). It stays pending until **both** sides accept.
- **While it's pending, nothing changes in the caller's view (owner's decision):** the guest and the friend stay two separate people. No "only for you" link is made for that pair, so declining has nothing to undo.
- **One request per group (my call):** if A has guests in several groups, each group gets its own request (each with its own admin), but the friend sees them together in one banner and can accept them all at once or one by one.
- **Guests already linked to an account** by an older "only for you" link show up as the `u:` person and get no Merge button. Out of scope for now (my call).
- **Friend's side:** U sees it where incoming requests already appear. *My guess:* a banner like the merge-request banner: *"{caller} says '{P name}' in {G} is you."*, with Accept / Decline.
- **Admin's side:** G's admins see it in the existing approvals (`ApprovalsCard`, next to "{name} wants to become a member"), as *"{caller} says '{P name}' is {U name}"*.
- **When both accept:** if U has no participant in G, link P to U, the same as an approved claim (name/gender taken from the account). If U is already a member of G, merge P into U's participant (`mergeParticipants`).
- **Decline or cancel:** either side declining cancels it, and the caller sees "declined" on the person page (my call: a one-time snackbar or a row, builder's call). The caller can cancel while it's pending.
- **Races:** at most one pending request per guest participant, sharing the uniqueness rule with ordinary claims (a pending claim or request blocks another, giving `ALREADY_CLAIMED`). If P is already linked or merged by the time the second side accepts, the request is void (`ALREADY_HANDLED`).
- **When the friend is claiming at the same time (owner-approved):**
  1. *The friend already has a pending claim on P:* the picker row is disabled, with the tag "{friend} already asked to be this person. Waiting for the {group} admin." No new request.
  2. *Your request is pending and the friend opens the claim flow for the same P:* instead of `ALREADY_CLAIMED`, the claim screen shows "{caller} already said this is you" with **Accept**. Accepting counts as the friend's side of your request, leaving only the admin.
  3. *The friend claims a different guest Q in the same group:* both go ahead. The outcome (link P to U, or merge P into U's participant) is decided **when the last side accepts**, not when the request was created. So whichever finishes second sees U already in the group and merges into them.
  - If P is gone when someone accepts (merged, removed, or claimed by another user), the request is cancelled and the caller sees it as no longer needed.
- Each step goes in the group activity log like the membership actions.
- Expiry: builder's call; match the account-merge requests if there's a natural fit.

## Who sees the "Merge with…" button

Today it shows only when `person.userId === null`. Keep that: you start from a guest. Starting from a signed-in person's page could be a later addition. *(My call.)*

## Constraints

- Web: shadcn/ui + Tailwind v4, the "Friendly" look, theme only in `globals.css`, no raw hex, no per-component CSS (`style-guard.test.ts`). Add any new shadcn component with `npx shadcn@latest add`.
- Keep `fsl-*` classes and `data-testid`s on the same elements (`person-merge`, `merge-pick-{key}`, `person-settle`…). Update existing tests that assert the "Rename or merge in…" link, since that behaviour is removed on purpose.
- i18n: every new string goes in `en.ts` and the Vietnamese file.
- API: Hono on Workers + D1/drizzle. Writes go through `commitTripWrite` and respect `assertWritable` (archived groups refuse).

## Left to the builder

- Schema for the new request: extend `membership_requests` (e.g. a `requested_by` column and per-side accept flags) or add a new table. Either works if the one-pending-per-participant rule still holds across both kinds.
- The extra fields `PersonSummary` needs for rows (avatar URL, identity label, per-item participant ids and kinds), and whether they come from the summary or from a separate picker endpoint.
- Whether the confirm step is in-sheet or a `Modal`.
- Exact copy, in the app's existing tone.
