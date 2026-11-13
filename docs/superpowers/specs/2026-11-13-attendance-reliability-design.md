# Attendance reliability and crew memes (#87)

Status: draft for owner approval · 2026-11-13 · issue #87 (follows planning mode, #83)

## Why

Sport-group admins decide how many courts to book from gut feeling about who really turns up. That feeling sticks to people unfairly: one memorable no-show can colour someone for months. CoinCrew already knows who signed up (the plan) and who played (the final bill). This feature turns that into a fair, stored record so admins plan from facts, and into playful cards the admin can post to the Zalo group: teasing the usual no-shows, celebrating the regulars, welcoming back the people who rarely come, and crowning whoever brings the most guests.

## Goals

1. Track, per sport group and per person (members and guests), four kinds of behaviour:
   - **No-shows**: on the plan, not on the bill.
   - **Regulars**: join most sessions.
   - **Rare joiners**: hardly ever join; when one does join, celebrate it ("look who's back").
   - **Guest bringers**: who brings the most guests.
2. Store each as a score in the database, updated one session at a time. Normal reads never add up history (D1 read budget, see PRODUCT.md constraints).
3. Show admins, while planning, how many of the signed-up people are likely to come.
4. Let admins share four kinds of meme card to the group, with animation in the app.

## Non-goals

- No time-window queries ("last 3 months"). Scores are a stored running value only.
- No excuses, reasons or cancellation tracking. Attendance is exactly plan vs bill.
- No exact correction of old sessions edited after they were counted (owner accepted small mistakes).
- No push, email or SMS (permanent product rule). Sharing is the admin's own action.
- No automatic court booking or court-count changes.

## Anti-goals (a failure even if it works)

- Members seeing their own or others' scores or labels in the app. Only admins see them; the group sees only what an admin chooses to share.
- Teasing that reads as humiliation. Praise leads every multi-person card; the no-show tease is one item, never the headline.
- A label that is wrong because of how the app counted (counting a session twice, or labelling a newcomer after one game).

## Attendance rule (owner)

For a session that was finalised from a plan:

| On plan | On bill | Meaning |
|---|---|---|
| yes | yes | showed up |
| yes | no | **no-show** |
| no | yes | **walk-in** (counts as joining, never hurts reliability) |
| no | no | not there |

A bill made directly (never planned) has no plan list: every person on it counts as joining, and nobody's reliability changes.

"Guests brought" for a person in a session = their slots on the bill beyond their own one: `max(0, maleSlots + femaleSlots − 1)`. Named guests, who have their own participant in the group, are tracked as people in their own right. *(My call: this is how CoinCrew records "+2" today. Builder to confirm against the guest-slot code.)*

## Scores (owner-tuned in the playground)

Three scores per (group, person), each 0–100 except guests.

### Shared step formula

- **Join**, s = joins in a row including this one: `gain = min(0.08 + 0.04·(s−1), 0.35)`, then `score += gain·(100 − score)`
- **Skip**, k = skips in a row including this one: `loss = min(0.2 · 1.5^(k−1), 0.6)`, then `score ×= (1 − loss)`

A join resets the skip streak, and a skip resets the join streak.

### Presence (regular ↔ rare)

- Updated for **every tracked person in the group** on **every counted sport session**.
- Join = on the bill (showed up or walk-in). Skip = not on the bill (no-show or not there).
- Starts at **30**.

### Reliability (no-shows)

- Updated **only for people on the plan** of a planned session.
- Join = on the bill. Skip = no-show. Walk-ins and direct bills leave it alone.
- Starts at **80**.
- It has its own streaks, separate from presence.

### Guests

`guest = 0.8 · guest + guestsBrought`, updated for every tracked person on every counted session. It starts at 0.

### Labels

| Label | Rule |
|---|---|
| Regular | presence ≥ 75 |
| Rare joiner | presence ≤ 20 |
| Flaky | reliability ≤ 50, and on at least 5 plans |
| Top guest bringer | highest guest score in the group, if ≥ 1 |
| Look who's back | joined this session while presence was ≤ 20 before it |
| (no label) | fewer than 5 counted sessions |

Constants live in one place in `@cc/core`, so they can be tuned later without changing the logic.

Worked examples with these numbers:
- A newcomer joining every week becomes a regular after about 6 sessions (30 → 36 → 43 → 52 → 62 → 71 → 79).
- A regular at 80 drops 64 → 45 → 25 → 10 over four skips in a row.
- Two no-shows in a row take someone from 80 to 45, which is flaky.

### Who is "tracked"

Every participant in the sport group who has been on at least one counted bill or plan. They are tracked from their first appearance, and sessions before that don't count against them. *(My call: otherwise a newcomer's presence would start dragged down by sessions held before they joined.)* People removed from the group or merged away stop being tracked.

### Guest merge (owner)

Guests keep a stable participant identity. When a guest is merged into another person, the surviving person keeps the **higher** value of each score, and the higher streaks and counts that go with it. *(Taking the max per field is my call; the owner said "take the higher score".)* The rule applies to **every merge**, because they all go through `mergeParticipants` (guest merges, "same as" on join, claims, account merges, proposals). *(My call.)*

**Leaving and rejoining:** leaving the group pauses a person's score row, and rejoining resumes it with the old scores. Sessions held while they were away don't count against them. *(My call.)*

## When scores update (owner: option C, "score on next plan")

- Finishing a bill changes nothing yet.
- The moment an admin **creates a new sport plan** in the group, every finished sport session not yet counted is counted, oldest first by session date. The new plan then shows fresh numbers.
- **Preview of not-yet-counted sessions (owner):** stored scores change only at the next plan, but the plan-form summary and the Crew awards cards show a *preview*. It applies every finished-but-uncounted session on top of the stored scores, in memory, each time they are opened, and is never saved. Tonight's bill shows on tonight's cards, and groups that only make direct bills still get cards. The preview reads only the uncounted sessions (normally one or two).
- **One session = one sport bill** (one expense chain with a `sport` block, keyed by its `rootId`). *(My call: groups record one bill per session; splitting an evening into several bills is not supported for counting.)*
- Each session gets a "counted" mark **keyed on its `rootId`** (a separate table, or a column `writeExpenseEdit` and rollback copy forward). Every edit inserts a new expense row (`apps/api/src/expenses/routes.ts:596-637`), so a mark on the row itself would be lost and the session counted twice. Two admins creating plans at once must not double-count either (conditional insert / the race-guard pattern of migration 0022).
- **The plan list already survives:** finishing a plan is an edit, and the planning version stays as a superseded row with its `meta_json` (`routes.ts:596-637`). "Was it planned, and who was on the plan" is read from the **last planning version in the chain before the first bill version**, never from the current `planning` flag (a later ordinary edit drops it).
- **Merged people:** sport entries inside old bills still point at merged-away participants (`participants/merge.ts:155-295`), so counting resolves every participant id through `participants.merged_into` to the surviving person.
- Sessions waiting for approval wait. Deleted or disabled sessions are never counted. Sessions edited after being counted are not recounted.
- **Launch backfill:** count every existing finished sport session once, oldest first, rebuilding each one's plan list from its version history as above, so reliability labels exist from day one. Sessions that were never planned count as direct bills. *(My call.)*

## Where admins see it

### On the plan (owner chose option B)

- **In the plan form** (owner; `ExpenseForm` in planning mode, which only admins can open), there is a summary card: **"Likely to actually come: about 7 of 9"**.
  - Under it, a three-part bar (regulars / unsure / often no-show) and a one-line count: "5 regulars · 2 unsure · 2 often no-show".
  - It recalculates on the device as the admin adds or removes names and slots, from the form's state plus one fetch of the group's scores (with the preview above).
  - Members can't sign themselves up for a plan (`permissions.ts:35`), so there is no other "join" event. The saved plan's detail page does not show the card.
- The estimate is the sum of each signed-up person's reliability ÷ 100, rounded to a whole person. Newcomers without a label count at 0.8. Unnamed guest slots count as one each, at their bringer's reliability. *(My call.)*
- "Unsure" is reliability above 50 and below 75. "Often no-show" is flaky.
- The names in the plan list carry no labels. "See who ›" opens a `Sheet` listing each signed-up person with their label and their three scores.
- Members and guests see the plan exactly as today.
- When the admin adds a rare joiner to the plan form, a short "look who's back" moment plays on that row. Tapping it offers the share cards.

### Opening the memes

There's a "Crew awards" entry where admins can open the cards any time: from the sport group page, and from the summary card's sheet. It shows the four card styles, filled from the previewed scores (stored scores plus any finished-but-uncounted sessions) and the latest finished session.

## The four meme cards (owner: build all four)

Mockups: `.superpowers/brainstorm/*/content/meme-cards.html` (the throwaway companion). Each is a phone-portrait image (9:16), rendered in the app with its animation, and shared through `usePlatform()`, which saves an image, or shares it on the Mini App and the web share sheet. The image posted is the final frame. Every animation respects reduced motion: with it, the card appears at its final frame.

1. **Award night (Lễ trao giải)**
   - Up to four awards on one card, revealed in turn: regular, comeback, guest bringer, then the no-show award last.
   - Each award shows an avatar, the award title, the name and a one-line stat.
   - Shuttlecocks fall over the reveal.
   - Missing awards are left out. If there are no awards, the card isn't offered.
2. **Wanted poster (TRUY NÃ)**
   - One person: the admin picks from the flaky list.
   - Crime line: "bùng kèo N trận liên tiếp" (the no-show streak), plus the last session date they played.
   - When that person later shows up, the same poster gets a green "ĐÃ RA SÂN!" stamp that slams on, so the joke ends well. The stamped version is offered whenever the score row shows a no-show streak of 2 or more that ended in the last counted session. Nothing records who was put on a poster. *(My call.)*
3. **Folk verse (Ca dao sân cầu)**
   - Up to three lục bát couplets, one each for regular, comeback and no-show, with names dropped in.
   - Written in line by line like ink, with a red seal at the end.
   - Each label has a small pool of verses, picked so the same group doesn't see the same couplet every week.
4. **Stadium board (Bảng vàng sân cầu)**
   - Flip-digit counters: join streak for the top regulars, weeks away for the comeback, guests brought, and the no-show streak.
   - A news ticker runs across the bottom.

All copy is Vietnamese first with English in `@cc/web-i18n`. New lines are marked `// REVIEW`. The award names and verses in the mockup are drafts for the owner to rewrite.

### Design-system notes

- These cards are a sanctioned **own world** inside CoinCrew. They may use display faces beyond Be Vietnam Pro (a slab for the poster, a serif for the verse, a sports face for the board), each self-hosted with full Vietnamese diacritics. Record that in DESIGN.md.
- The trophy and award accents are Jade, never Turmeric (The Money Means Something Rule).
- Colours still come from tokens in `globals.css`. Add card-world tokens there rather than raw hex (style-guard test).
- The in-app parts (the summary card, the sheet, the awards entry) are ordinary Friendly Ledger UI built from the existing wrappers (`Sheet`, `Pill`, `Avatar`, `Button`).
- Shape and animate the cards with `/impeccable` (owner's request) when building them.

## Data (builder decides exact shape)

- A per-(group, participant) score row: presence, reliability, guest score, the four streak counters, counted sessions, sessions planned, last no-show streak and last session played. It's written only by the counting step.
- Per session (`rootId`): a "counted at" mark. The plan list comes from version history, so no new storage is needed for it.
- Per score row: also the no-show streak that ended most recently, for the poster stamp.
- The counting step runs inside the "create plan" request and batches its writes. It reads only the uncounted sessions and the group's score rows.
- Hand-written D1 migration (project convention).
- Pure scoring functions in `@cc/core`, with unit tests that include the worked examples above. DB writes go in `@cc/api-db`. Admin-only routes go in `apps/api`, checked through `permissions.ts`.

## Left to the builder

- Table and column names, and the API shape for the summary and the awards.
- How the image is rendered (DOM-to-canvas or a canvas drawing), as long as it looks like the mockups and works in Zalo's browser and the Mini App.
- The exact verse pool and stat wording, as drafts for owner review.

## Open

- None blocking. The Vietnamese copy needs the owner's review before release.
