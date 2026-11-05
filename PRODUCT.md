# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Trips and sport groups weigh equally; neither is the "main" use (owner, 2026-11-05).

- **Organisers and members** sign in (Google or Zalo) and run a group: a **trip** (friends travelling together, one-off) or a **weekly sport group** (badminton, pickleball, tennis, football) with a stable roster. They enter people and expenses (or a session's court and shuttlecock costs), approve what guests add, and share the group's link or bill to the group chat.
- **Guests** are friends who tap one link in the group chat, usually a Zalo chat, usually on a phone. Where it opens depends on their Zalo setting: Zalo's in-app browser, or their own browser (Chrome on Android and PC, Safari on iPhone). They pick their name, see what they owe, and pay in their own bank app. They have no account and install nothing.
- **Viewers** open a separate view-only link and can only look.

## Product Purpose

CoinCrew (Tiền Đâu) splits shared costs in a group and settles them up with VietQR in any Vietnamese bank app. It exists because the owner kept shared expenses in Splitwise and personal money in Money Lover and had to enter every loan twice. Splitwise also caps expenses per day on its free plan, uses jargon ("simplify debts"), and makes friends who join once a year create an account. Sport-group organisers did the same job in an Excel sheet and posted screenshots to Zalo.

Success: friends run a whole trip or a season of sessions on it without anyone installing anything, and organisers stop keeping the books by hand.

**Direction (owner-confirmed):** CoinCrew grows into one app that replaces both Money Lover and Splitwise, Vietnam first. Future design should leave room for it without building it early:

1. Group split + VietQR settle-up (built, live)
2. Google Sheets export and Gemini: automatic payment matching by transfer note through the user's own Gemini flow, spending questions. The app never asks for Gmail access.
3. Personal money records replacing Money Lover (group shares flow in automatically), QR pay gateway, Apple Pay capture, bank-email capture
4. Investment tracking; imports from Money Lover and Splitwise

Source: owner's notes in the Obsidian vault `30_Projects/Coin Crew/` (`2026-10-13-idea-discussion-next-steps.md`, `2026-10-12-group-split-vietqr-design.md`).

## Positioning

Three things every screen protects (owner-confirmed); Splitwise or Tricount cannot truthfully claim all three:

- **No account for friends.** One link in the group chat: pick your name, see what you owe, pay. Nothing to sign up for or install.
- **VietQR settle-up.** A QR with the amount and a readable transfer note (sender, what for, group) that any Vietnamese bank app scans.
- **Shared through Zalo.** Links and share cards travel through Zalo chats, members can sign in with Zalo, and there is a Zalo Mini App. The link then works wherever it opens: Zalo's in-app browser, Chrome, Safari, the Mini App, or the app saved to the home screen.

## Operating Context

- **The group chat is where it starts.** The organiser shares the group link (or, for sport groups, a bill table + VietQR card and a one-line message) into a Zalo group chat. Friends tap it there.
- **Where the link opens:** most visits come from Zalo, but not necessarily inside Zalo's browser. Zalo users can set it to open links in their phone's own browser. Chrome is the most common browser on Android and PC; Safari is used a lot on iPhone. No single browser can be assumed.
- **Inside Zalo's in-app browser**, Google sign-in is blocked; members signed in with Google merge their Zalo account instead, or are told "⋯ → Open in browser".
- **Zalo Mini App** (`apps/zalo`): silent Zalo sign-in, share cards, gallery save. Zalo refuses `openOutApp` to non-partner apps, so the Mini App cannot open bank apps; it tells the user to open their bank app themselves.
- **Paying:** no Vietnamese bank app fills in the payment from a link (tested on real phones 2026-11-02). The flow is: save the QR image → open the bank app → Scan QR → upload the image. The person being paid confirms receipt by hand; nothing matches payments automatically yet.
- **Devices:** phones first at 375px. Desktop works (mostly Chrome) and is secondary.
- **Home screen:** the web app aims to be saved to the home screen (PWA) and opened from there like an app, in standalone mode with no browser bar.
- **Languages:** Vietnamese first, English second.

## Capabilities and Constraints

**What it does today**
- Groups as **trips/general** or **sport groups**. Sport groups have per-session costs, men/women (`Nam`/`Nữ`) slot pricing and guest slots. Groups can also have a group fund and player ratings.
- **Expenses:**
  - five split modes: equally, amounts, %, shares, ± adjust
  - whole VND, shown as `1.245.000₫`
  - "fewest transfers"
  - optional rounding of settlements to the nearest 1,000₫
- **Approvals and money safety:**
  - Guest expenses and guest bank details wait for a member's approval. Guests don't add names: they pick one, or sign in to join.
  - A payment to a member counts only when that member confirms it.
  - Members can disable any expense or payment; it stays visible, crossed out.
  - An activity history records who did what, from which device.
- **One person, one name:**
  - The name list comes first.
  - Similar names are caught, ignoring accents (`Binh` = `Bình`), and the last name picked is remembered on each phone.
  - Members have a merge tool, and a Google account and a Zalo account can be merged.
- **Other:** paying a single expense from a shared bill link; anonymous feedback.

**Constraints**
- **Free hosting:** Cloudflare Workers + D1 on the free plan. Database reads are a budget, and queries fail for the rest of the day once the limit is passed. The paid plan is the escape hatch, not the plan.
- **The app never moves money.** Every payment happens in the user's own bank app.
- **Never in the product, permanently:** push, email or SMS from the app. No Gmail or Drive permissions; Google sign-in uses `openid email profile` only.
- **Not yet:** native apps, currencies other than VND, receipt photos, categories.
- **No limit on the number of expenses**, and no jargon wording (owner's phase-1 anti-goals).
- **Personal data:** names and bank account numbers of strangers, under Vietnam's Decree 13/2023/ND-CP and the Personal Data Protection Law (2026). There is a privacy notice and consent on first bank details or sign-in.
- **Zalo's profile API** refuses callers outside Vietnam, so profile requests go through a small relay server in Vietnam (`apps/zalo-relay`).

**Open (undecided or unverified; do not design as if settled)**
- What Vietnam's personal-data rules actually require. The privacy notice is a draft.
- Transfer-note length and character limits at the major banks.
- Whether Zalo will grant `openOutApp` (opening bank apps from the Mini App) or the friend-list lookup.
- The Vietnamese copy is partly draft: lines marked `// REVIEW` in `libs/web/i18n/src/vi.ts`.

## Brand Commitments

- **Name:** CoinCrew (Tiền Đâu); short name CoinCrew.
- **Voice:** plain everyday words, Vietnamese first. Mechanisms are explained, never named in jargon ("fewest transfers", not "simplify debts").
- **Visual system:** the owner chose the "Friendly" look on 2026-10-28 (spec `docs/superpowers/specs/2026-10-28-shadcn-friendly-redesign-design.md`, built in `libs/web/ui`). `DESIGN.md` records it ("The Friendly Ledger"). More colour themes are planned (a friend asked for a pink one).
- **Assets:**
  - app icon `apps/web/public/icon.svg`
  - link-preview images `apps/web/public/og/trip.png` and `og/sport.png` (sources `scripts/og/*.svg`)
  - Google and Zalo sign-in marks `libs/web/screens/src/assets/brand/`
  - bank app logos `libs/web/screens/src/assets/bank-apps/`

## Evidence on Hand

- A live deployment on Cloudflare Workers (first real use 2026-10-14).
- Real-device findings on bank-app hand-off, Zalo's webview and the Mini App (owner's notes, 2026-11-02/03).
- Layout mockups: `docs/superpowers/mockups/` (v1–v6).
- **Absent, never to be invented:** user numbers, testimonials, reviews, press, partner banks, pricing or plans.

## Product Principles

1. **From the chat link to "paid" without friction.** A friend never needs an account, an install or a jargon word to see what they owe and pay.
2. **Money safety before convenience.** What a guest adds never changes anyone's balance until a member approves it; the person being paid confirms it arrived. The one exception: a payment between two guests counts as soon as either marks it, and members can turn that off.
3. **One person, one name.** Prevent duplicates where people pick their name; make merging easy when they slip through.
4. **Shared through Zalo, works wherever it opens.** Links arrive mostly through Zalo, then open in Zalo's browser, Chrome, Safari, the Mini App or the home-screen app, and each must work. Where one blocks something (Google sign-in in Zalo's browser, opening bank apps from the Mini App), say so plainly and offer the next step.
5. **Leave room for the whole-finance future** (personal money, Sheets, Gemini) without building it before its phase.

## Accessibility & Inclusion

- **Contrast:** all text meets WCAG AA (≥4.5:1).
- **Phones:** inputs are at least 16px so iOS doesn't zoom, and touch targets are at least 44px.
- **Focus:** focus moves into a sheet or dialog when it opens and returns to the opener when it closes.
- **Names:** names carry Vietnamese diacritics; search and similar-name matching ignore them.
