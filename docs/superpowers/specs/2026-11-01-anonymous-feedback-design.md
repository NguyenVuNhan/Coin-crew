# Anonymous in-app feedback, sorted by AI

Date: 2026-11-01 · Status: draft for approval

## Why

Today CoinCrew feedback arrives through Zalo chats or when the owner asks people in person. It is
scattered, and people soften what they say because they know who is asking. We want:

1. A feedback box **inside CoinCrew** that is **anonymous by default**, so people are honest.
2. Everything in **one place**.
3. **AI does the sorting**: drop noise and test messages, group feature requests, collect defects.

The owner already pays for **Google One (Gemini, incl. Gemini in Gmail and scheduled actions)** and
**Claude**. The solution must not add a paid service or an AI API key.

## Goals

- One-tap entry: a headset icon at the top right of the main tabs (Home, Groups, Activity), next to the avatar and clear of the bottom nav and add button; sending takes one text box and one tap.
- No user identity stored with a message unless the sender explicitly opts in.
- Every message lands in a Google Sheet owned by the owner.
- A weekly, bilingual (Vietnamese + English) digest from a Gemini scheduled action: noise removed,
  feature requests grouped by theme with counts, defects listed with screen/device context.

## Non-goals

- No in-app admin screen for reading feedback (the Sheet and the digest are the UI).
- No AI calls from the CoinCrew server.
- No replying to users from inside the app, no screenshots/attachments, no voting.

## Anti-goals (failure even if it "works")

- A message can be traced back to a person who did not tick "contact me" **by anyone reading the
  Sheet or the digest** — no user id, device hash, IP or trip id in what leaves D1.
  (Owner decision: anonymity is from other users and casual reading, **not** from the owner. The
  owner, with D1 + logs + timing, may be able to correlate; that is accepted. No batching/shuffling
  or log suppression needed.)
- Feedback is lost because Google was unreachable.
- The form feels like a chore (required fields, multi-step, confirmation dialogs).

## The flow

```
User ──► Feedback sheet (web) ──POST /api/feedback──► Worker
                                                       ├─ insert row in D1 `feedback` (no identity)
                                                       └─ POST to Apps Script URL (secret) ─► Google Sheet row
Hourly cron (existing) ──► re-sends rows not yet delivered
Apps Script weekly trigger ──► emails the week's rows to the owner's Gmail ("CoinCrew feedback – week of …")
Gemini scheduled action (weekly, set up by owner) ──► reads that email (and the Sheet if it can) ──► bilingual digest
```

## The form (decided: option A, "one quick sheet")

Mockup: `.superpowers/brainstorm/*/content/feedback-form.html` (option A).

- **Entry:** a new "Send feedback" row in `AccountMenu` (signed-in users). **Guests** (on `/j/:token`
  pages, no account menu) get a small "Send feedback" entry on the guest trip page near the
  `LanguageButton` — exact placement is the builder's call, it must be reachable on every guest
  screen without scrolling to the bottom of a long list.
- Opens with the app `Sheet` wrapper (bottom drawer on phones, dialog ≥640px).
- Title "Send feedback", hint "Anonymous — we don't see who you are."
- **Type chips** Bug / Idea / Other (`Pill`-style, single select, **optional, none preselected**,
  tap again to deselect).
- **Textarea** autofocused on open (keyboard up immediately), `text-base`, placeholder
  "What happened, or what would make CoinCrew better?". Max 2000 characters; show a counter only
  near the limit.
- **"You can contact me about this (shares your name)"** checkbox, unticked by default.
  - Signed-in: ticking attaches the user's name and how to reach them (email or "Zalo account" + name).
  - Guest: ticking reveals one optional text field "Your name or Zalo"; only that text is attached.
- **Send** (primary pill button, `min-h-11`) enabled once the trimmed text is non-empty.
- On success: sheet closes, `Snackbar` "Thanks — we read every message." No confirm step.
- On failure: sheet stays open, text kept, `InlineError` with retry.
- **Draft kept** in `localStorage` (per device) if the sheet is closed without sending; cleared on
  successful send. Wrap storage access in try/catch.
- All strings in both `en.ts` and `vi.ts`.
- Follow the project UI rules (CLAUDE.md): real shadcn components, theme tokens only, `fsl-*`
  classes / `data-testid` for tests.

## Data captured automatically (never typed by the user)

| Field | Example | Notes |
|---|---|---|
| `screen` | `trip`, `people`, `expense-form` | route **name/pattern**, never the URL (URLs contain trip ids / guest tokens) |
| `device` | `phone` / `desktop` | from viewport width (<640px = phone) |
| `lang` | `vi` / `en` | current app language |
| `appVersion` | build id / git short sha | whatever the build can inject; builder's call |
| `type` | `bug` / `idea` / `other` / null | from the chip |
| `createdAt` | ISO, **rounded to the hour** | reduces timing correlation |

Never captured: user id, device hash, IP, user agent string, trip id, guest token.

## Server

- **Migration** `0013_feedback.sql`: table `feedback` with `id`, `type`, `message`, `screen`,
  `device`, `lang`, `app_version`, `contact` (nullable text, only when opted in), `created_at`
  (hour-rounded), `delivered_at` (nullable). No foreign keys to users/devices/trips.
- **Route** `POST /api/feedback` in `apps/api/src/feedback/routes.ts`, registered in `app.ts`.
  Works for signed-in users and guests. Validates lengths and enums; trims text; rejects empty.
  Contact text for signed-in users is built **on the server** from the session user (the client
  only sends `contactMe: true`), so it can't be spoofed as someone else. Format: display name, plus
  email if the user has one (Zalo-only users: name + "(Zalo)"). Never internal ids (`zaloSub`,
  user id).
- **Rate limit (accident/casual-spam guard, not real abuse protection):** 5 messages per device
  per hour, plus a **global cap of 100 messages per hour**. Stored in a small table separate from
  feedback rows (e.g. key = `sha256(deviceHash + hour bucket)`, count; old rows deleted by the
  cron). Over the limit → 429 with a friendly message.
- Each feedback row has a random `id` (no link to anything) that is sent to the Apps Script so it
  can skip duplicates on retry.
- **Delivery:** after insert, `ctx.waitUntil` a POST to `FEEDBACK_SHEET_WEBHOOK_URL` (new optional
  secret in `env.ts`; documented in `docs/setup.md`) with a shared secret
  `FEEDBACK_SHEET_TOKEN` in the body. On 2xx set `delivered_at`. If the URL is unset, rows just
  stay in D1.
- **Retry:** the existing hourly `scheduled` handler also sends undelivered rows (oldest first,
  small batch). Delivered rows are kept in D1 as the backup copy.
- The user's request never waits on Google: the API responds once the D1 insert succeeds.

## Google side (owner sets up once; documented in `docs/setup.md`)

1. **Google Sheet** "CoinCrew feedback" with columns matching the fields above.
2. **Apps Script** bound to the Sheet (code checked into `scripts/feedback-apps-script.gs`):
   `doPost` checks the token, skips a row whose `id` already exists, appends a row, returns 200.
   Deployed as a web app ("Execute as me", "Anyone" access — the token is the guard; rotate by
   changing both the script property and the Worker secret).
   A **weekly time-driven trigger** (Monday ~07:00, Asia/Ho_Chi_Minh) emails the owner the last 7
   days of rows as a plain table, subject "CoinCrew feedback – week of <date>". This is the main
   input for Gemini, because Gemini can always read Gmail (owner was unsure whether a scheduled
   action can open Sheets).
3. **Gemini scheduled action**, weekly (Monday ~08:00), with this prompt (included in setup doc):

> Find this week's email titled "CoinCrew feedback – week of …" in my Gmail (or open my Google
> Sheet "CoinCrew feedback" and use rows from the last 7 days). Messages may be in Vietnamese or
> English.
> 1. Ignore noise: test messages, gibberish, empty or one-word messages, duplicates from the same hour.
> 2. **Defects:** list each real bug with a one-line summary, the screen, device, and language, and
>    the contact if given. Merge reports that describe the same problem and show the count.
> 3. **Feature requests:** group by theme, show the count per theme, and quote one or two example
>    messages.
> 4. **Other:** anything worth knowing that isn't a bug or idea.
> Write the whole digest twice: first in Vietnamese, then in English. Start with a 3-line
> summary of the most important items. Email it to me.

## Testing

- API: validation, empty/too-long rejection, rate limit, no identity stored without opt-in,
  server-built contact, delivery marks `delivered_at`, cron retries undelivered rows (mock fetch).
- Web: sheet opens from the main-tab header icon and guest page, autofocus, Send disabled when empty, chip
  optional/toggle, draft restore, success snackbar, error keeps text, guest contact field.
- Existing style guard must pass.

## Calls made by Claude (not explicitly decided by the owner)

- Guests can send feedback too.
- Timestamp rounded to the hour; route pattern instead of URL.
- Rate limit 5/hour/device + global 100/hour; an accident guard, not real abuse protection.
- Contact = display name + email if present; no internal ids.
- Random row id sent to the Sheet for de-duplication.
- Weekly Apps Script email is the main route into Gemini; reading the Sheet directly is a bonus.
- D1 is the source of truth; hourly retry; rows kept after delivery.
- Draft kept in localStorage.
- Server builds the contact string for signed-in users.
- Gemini digest weekly on Monday; owner can change the schedule.

## Left to the builder

- Exact guest entry placement, chip component choice, app version source, batch size for retry,
  Apps Script details.
