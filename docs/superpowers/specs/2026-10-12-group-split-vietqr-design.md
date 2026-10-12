# Phase 1 design: group splitting and VietQR settle-up

Date: 2026-10-12 · Status: approved by the product owner on 2026-10-12 · Implementation plan: `docs/superpowers/plans/2026-10-12-phase1-group-split-vietqr.md`

Marking used below: anything tagged **[Claude's call]** was decided by Claude as a sensible default and has not been explicitly approved by the product owner. Everything else was decided by the product owner during brainstorming.

## 1. Why this exists

The product owner tracks personal money in **Money Lover** and shared expenses and loans in **Splitwise**. The biggest pain is keeping the two in sync by hand. Each app also has its own problems:

- Splitwise's free plan limits how many expenses a user can add per day.
- Splitwise's "simplify debts" setting is confusing for new users. The mechanism is good; the wording is not.
- Splitwise needs everyone to create an account and log in. Friends who join one trip a year will not do that. The goal is Tikkie-level convenience: open a link, see what you owe, pay with your bank app.

The long-term product replaces both apps, Vietnam first, and uses each user's own Google Gemini where it is available (see §12). It is a **public product**: strangers sign up and use it as their own finance app, and their friends join trips without accounts.

**Phase 1 is the part the product owner wants most: splitting expenses in a group (a trip) and settling up with VietQR.**

## 2. Goals (phase 1)

1. An organiser creates a trip, enters everyone's names, and shares a link in the group chat.
2. Members (signed in) and guests (no account) add expenses using all five Splitwise split modes, with no daily limit.
3. Everyone sees balances and a "who pays whom" list, with the option to minimise the number of transfers.
4. Debts are settled by scanning a VietQR code in any Vietnamese banking app; the person being paid confirms receipt by hand.
5. Guests never need an account, and the app keeps the same person from showing up twice.
6. A separate view-only link lets people see the trip without being able to change anything.

## 3. Non-goals (phase 1)

- No Gemini or other AI features.
- No Google Sheets export (phase 2).
- No automatic payment matching from bank emails or bank APIs (phase 2). Confirmation is manual.
- No personal money records, wallets or categories (phase 3).
- No "pay through our app" QR scanning, no Apple Pay capture (phase 3).
- No investment tracking, no import from Money Lover or Splitwise (phase 4).
- No native iOS/Android apps.
- No currency conversion. VND only in the interface.
- No push notifications, emails or SMS sent by the app.
- The app never moves money. All payments happen inside the user's own bank app.

## 4. Anti-goals (would be a failure even if it technically works)

- A guest has to create an account, install anything, or log in to see what they owe or to pay.
- Any limit on the number of expenses.
- Jargon wording, such as "simplify debts".
- Asking for Gmail or Drive permissions in phase 1.
- Needing paid hosting to run.
- A guest's unapproved input changes anyone's balance. The one exception, set by the product owner, is a payment from one guest to another: it counts as soon as either guest marks it, and members can disable it (§9.4).

## 5. Constraints

- **Free hosting.** Cloudflare Workers free plan: 100,000 server requests per day, with static assets free and unlimited. Cloudflare D1 free plan: since 2026-09-01, queries **fail** once the account passes the daily row-read or row-write limit, until midnight UTC (07:00 Vietnam time). The design must be careful with database reads, including the pay screen's polling. Upgrading to the paid plan (about $5/month) is the escape hatch, not the plan.
  - **Load target [Claude's call]:** phase 1 must comfortably run on the free plan at about 200 active trips a day (roughly 1,000 people), including pay screens left open.
    - That means a cheap "has this trip changed?" check that avoids full database reads, and caching of per-trip results.
    - Daily usage is logged, with an alert at about 80% of any free limit, so the upgrade happens before users see errors.
    - Beyond that, the plan is to switch to the paid plan, not to redesign.
- **Phone first.** It must work well in mobile Safari and Chrome at 375px wide, and be installable to the home screen (PWA). Desktop works but is secondary.
- **Vietnam first.**
  - Amounts are VND whole numbers, formatted `1.245.000₫`.
  - Names contain Vietnamese diacritics.
  - Payments use VietQR (NAPAS 247 account-transfer QR), which all major Vietnamese bank apps scan.
- **Personal data.** The app stores strangers' names and bank account numbers. Vietnam's personal-data rules apply (Decree 13/2023/ND-CP and the Personal Data Protection Law in force from 2026-01-01). At minimum, include a privacy notice and get consent when someone first enters bank details or signs in. **[Claude's call; the builder should confirm what is legally required]**

## 6. People, links and identity

### 6.1 Roles

| Role | How they get in | Can do |
|---|---|---|
| **Organiser** | Signs in with Google and creates the trip | Everything a member can, plus regenerate links and archive the trip **[Claude's call]** |
| **Member** | Signed in with Google and part of the trip | Add expenses (they count immediately); edit or delete any expense; approve or reject guest expenses, new guest names and guest bank details; merge two people; confirm payments as allowed in §9.4; disable any expense or payment |
| **Guest** | Opens the group link; no account | Pick or add their name; see the whole trip; add expenses (pending until a member approves); add their own bank details (pending until a member approves); pay with VietQR; mark payments as allowed in §9.4 |
| **Viewer** | Opens the view-only link | See the trip, balances and expenses. Cannot add anything, pick a name, pay, or see bank details **[Claude's call on the exact limits]** |

- **Guests cannot act as members.** A name linked to a Google account appears in "Who are you?" but can't be picked by a guest; tapping it asks that person to sign in. **[Claude's call]**
- **Members can disable any expense or payment**, because guests make mistakes. A disabled item stays visible, crossed out and labelled "Disabled by Minh", but is left out of every balance. It is recorded in the activity history. A member can enable it again. **[Product owner's decision; Claude's call on keeping it visible and allowing re-enable]**
- **Becoming a member.** A guest can tap "Sign in with Google" inside the trip to become a member linked to the name they picked. Because members are approvers, this needs approval from an existing member. **[Claude's call]**
- **Links.**
  - Each trip has exactly two links: the **group link** (guest access) and the **view-only link**.
  - Both carry long unguessable tokens.
  - Members can regenerate either one, which makes the old link stop working. **[Claude's call]**
  - A dead link shows "This link no longer works. Ask the organiser for a new one."

### 6.2 Guest identity (all decided by the product owner)

The group link goes into one group chat, and each guest picks their name. To stop one person showing up twice:

1. **Organiser enters everyone's names** when creating the trip, so most guests only pick.
2. **"Who are you?" shows the name list first.** "I'm someone new" is the second choice.
3. **Remember the last name picked on this device** for this trip and pre-select it ("You picked this on this phone last time"). The guest can continue with one tap.
4. **"Not Chi? Switch"** on the guest banner, for someone who picked wrong.
5. **Autocomplete existing names** while a new name is being typed.
6. **Similar-name check.** If the typed name resembles an existing one, ask "Are you Bình?" with "Yes, I'm Bình" / "No, add me". Matching ignores case and Vietnamese diacritics (`Binh` = `Bình`, `Dung` = `Dũng`, `đ` = `d`). It also catches near-misses such as one-letter typos and a full name versus a short name (`Chi Nguyễn` vs `Chi`). **[Claude's call on the exact matching rules; the builder tunes the thresholds]**
7. **New names wait for approval** by any member. The approval card suggests a likely match ("Looks like Chi") with "Same as Chi" (merges into Chi) and "New person". **[Claude's call]** A pending guest can already add expenses; those expenses are pending anyway.
8. **"Active on another phone · 2 h ago"** shown under a name that another device used recently. This is a hint, not a lock: one person may use two phones.
9. **Merge tool for members.** Move every expense, share and payment from one person to another, then retire the duplicate. Recorded in the activity history.
10. **View-only link**, covered in §6.1.

How a device is recognised: a random device ID kept in the browser (localStorage, mirrored in an HTTP-only cookie) and linked to a participant per trip. Clearing browser data loses it, and the guest simply picks their name again. **[Claude's call]**

Impersonation is an accepted risk, as in every link-based splitting app (Tricount, Spliit, Settle Up, Kittysplit). Four things limit it:

- guest expenses and new names need member approval
- guest bank details need member approval, so nobody can redirect someone else's money
- a payment to a member only counts when that member confirms it
- every change is recorded in an activity history showing who did it and from which device, and members can disable anything that looks wrong

## 7. Expenses

- **Fields:**
  - description
  - amount, a positive whole number of VND
  - date, defaulting to today
  - paid by: one person **[Claude's call; Splitwise's "several people paid" waits for a later phase]**
  - split mode and split details
- **Split modes (all five Splitwise modes):**

  | Mode | Input | Rule |
  |---|---|---|
  | Equally | Tick who's included | Even shares |
  | Amounts | An exact amount per person | Must add up to the total |
  | % | A percentage per person | Must add up to 100 |
  | Shares | A weight per person, e.g. 2 / 1 / 1 | Proportional |
  | ± Adjust | A plus or minus per person | Applied on top of an equal split of the rest |

- **Rounding [Claude's call].** Work in whole đồng. Compute each share, round down, then hand out the leftover đồng one at a time in a fixed order (largest remainder first, ties broken by the order people were added). Shares always add up exactly to the total.
- **Approval.**
  - Expenses added by a member count immediately.
  - Expenses added by a guest are **pending**. They are shown with a "Waiting" label but left out of every balance until a member approves them.
  - The guest sees what their balance would become if the expense is approved.
  - A member can **Approve**, **Edit** (then approve), or **Reject with a reason** that the guest sees.
- **Editing [Claude's call].**
  - Members can edit or delete any expense.
  - Guests can edit or delete only their own pending expenses.
  - Changing an expense after payments were confirmed simply recalculates balances; confirmed payments stay as they are.
- **Disable.** Any member can disable any expense, including approved ones, as in §6.1. It stays visible crossed out and is left out of balances until a member enables it again.
- **Not in phase 1:** receipt photos, categories, recurring expenses, refunds or negative amounts.
- **Removing a person [Claude's call].** Only allowed when they have no expenses or shares, otherwise use merge.

## 8. Balances and "Fewest transfers"

- Each person's balance is what they paid in approved expenses, minus what they owe in approved expenses, adjusted by confirmed payments.
- **"Fewest transfers"** is Splitwise's "simplify debts" under a new name. The mechanism is the same.
  - It is a per-trip switch, **on by default [Claude's call]**.
  - Explanation shown under the switch: "We combine everyone's debts so people make as few bank transfers as possible. What each person owes in total stays the same."
  - **On:** compute a small set of transfers that settles everyone (greedy, matching the largest debtor with the largest creditor, is fine).
  - **Off:** show debts between each pair of people, netted per pair.
- The trip page shows:
  - **"You're still owed X"** or **"You owe Y"**
  - the trip total
  - the "Who pays whom" list, each row with its payment state (§9)

## 9. Settling up with VietQR

### 9.1 Bank details

- Anyone who is owed money adds their bank details:
  - the bank, chosen from the NAPAS/VietQR bank list
  - the account number
  - the account holder's name
- Members save bank details on their profile and reuse them across trips. Guests enter them per trip. **[Claude's call]**
- **A guest's bank details need a member's approval**, for the first entry and for every change. **[Product owner's decision]**
  - Until approved, no QR is shown for that guest. Payers see "Bình's bank details are waiting for approval".
  - When details change, the previously approved details stay in use until the new ones are approved. **[Claude's call]**
  - The approval card shows the bank, the full account number and the holder name, so the member can check them against the person's name in the trip.
- Bank details appear only on the pay screen of someone who owes that person. They never appear on the view-only link. **[Claude's call]**
- If someone is owed money but has no bank details, the person paying sees "Bình hasn't added bank details yet" plus a "Remind" action.

### 9.2 The QR and the transfer note

- The app generates the VietQR payload itself. That payload is the EMVCo merchant-presented format with the NAPAS account-transfer service, carrying the bank, account, amount and transfer note. The app renders the QR on the device; no outside service is involved.
- **Transfer note.** Each payer → receiver pair in a trip gets a short reference that never changes, for example `DALAT C7K2` (a trip slug plus a 4-character code). **[Claude's call]** Because the note belongs to the pair and not to a particular amount, an old saved QR still carries a valid note even after the amount has changed.
  - Uppercase ASCII only, because banks strip diacritics.
  - Kept short, because each bank has a length limit; the builder must check the limits.
  - The pay screen says "Keep this note unchanged so the payment can be matched."
  - Phase 1 does not use the note for matching. It exists so phase 2 can match payments automatically without changing anything already built.

### 9.3 Pay screen (see mockup 1, screen 3)

- It shows:
  - the amount and who is being paid
  - the QR code
  - bank, masked account number, holder name, amount and transfer note
- **"Open my bank app"** opens a picker of bank apps from VietQR's public list (`https://api.vietqr.io/v2/android-app-deeplinks` and the iOS equivalent) and opens the chosen app through `https://dl.vietqr.io/pay?app=<appId>`.
  - According to that list, 5 apps can open with the payment already filled in: VietinBank iPay, BIDV SmartBanking, OCB OMNI, ACB One and MB Bank.
  - The others open the app's home screen, and the user scans the saved QR.
  - **Unverified:** the exact parameters for the pre-filled version. The builder must confirm them on real devices.
- **"Save QR"** saves the QR image so it can be scanned from the bank app's gallery option.
- **"I've already paid"** records the payment. Whether it counts straight away or waits for the receiver depends on who is paying whom (§9.4).
- While open and visible, the screen checks for a status change every few seconds and stops when hidden. **[Claude's call on the interval]**

### 9.4 Who confirms a payment [Product owner's decision, except where marked]

| Payer → receiver | Who can make it count | What happens when the payer taps "I've already paid" |
|---|---|---|
| Guest → member | **Only the receiving member** | It becomes **Says paid**: no effect on balances yet. The member sees "Chi says it's paid. Did it arrive?" with **Confirm** or **Didn't arrive**. The member can also mark money received without waiting for a claim. |
| Member → guest | **The paying member** confirms it themselves (the receiving guest may also mark it received) | It counts straight away |
| Guest → guest | **Either guest**, with no approval | It counts straight away (auto-confirmed) |
| Member → member | **Only the receiving member [Claude's call; not specified by the owner]** | Same as guest → member |

- **Payment states:**
  - **Waiting:** a "Who pays whom" row with nothing done yet.
  - **Says paid:** only for payments into a member's account; waiting for that member.
  - **Confirmed:** counts in balances.
  - **Disabled:** a member switched it off; kept visible, crossed out, and left out of balances.
- **Mistakes.**
  - Any member can **disable** any payment, including a guest → guest payment that was auto-confirmed (§6.1). This is the safety net for guest mistakes and for false claims.
  - A receiving guest who didn't get the money can tap **"Didn't arrive"**. That doesn't change anything by itself; it puts the payment on the members' approvals card for a member to disable or keep. **[Claude's call]**
- **Partial payments [Claude's call].** Whoever confirms can enter a **different amount** than requested; the rest stays owed.

### 9.5 When balances change [Claude's call, following the owner's "keep Splitwise's mechanism"]

- **"Who pays whom" is a live suggestion, as in Splitwise.** It is recalculated from approved expenses and confirmed payments whenever either changes.
- **A payment is a record of money that actually moved between two specific people.** It is created when the payer taps "I've already paid" or when the receiver marks money as received. It is never part of a stored plan.
- **A payment marked "says paid" (one waiting for a member) lowers the suggested transfers straight away**, so nobody is asked to pay the same debt twice. It does **not** change balances until the member confirms it (§4). Balance summaries show both, e.g. "You owe 1.245.000₫ · 1.245.000₫ waiting for Minh to confirm". If the receiver taps "Didn't arrive", the debt comes back into the suggestions.
- **The pay screen always shows the current amount.** If someone pays from an old saved QR with an outdated amount, the receiver confirms what actually arrived, and the suggestions recalculate from there.
- **Suggestions should stay stable.** Recalculating must not shuffle unchanged debts between different people for no reason: if nothing touching Chi changed, Chi's suggested transfer stays the same. The builder can choose how to do this, for example by keeping the previous pairs where they still balance.

### 9.6 Remind

The app sends nothing itself. "Remind" builds a short message in Vietnamese with the amount and the group link, and opens the phone's share sheet (Web Share API), falling back to copying the message to the clipboard. The user pastes it into Zalo or Messenger.

## 10. Screens

The mockups from brainstorming are in `docs/superpowers/mockups/`:

- `v1-flow.html`: organiser trip page, guest view, pay screen
- `v2-guest-expense.html`: guest adds an expense, waiting state, member approval
- `v3-who-are-you.html`: name picker, similar-name check, new-person approval and merge

Phase 1 screens:

1. Landing and Google sign-in.
2. My trips (member).
3. Create trip: name, everyone's names, your bank details.
4. Trip page (member).
   - Balance summary.
   - Approvals card: guest expenses, new names, guest bank details, "says paid" payments into your account, and "didn't arrive" reports.
   - Who pays whom, with states.
   - Expenses list.
   - Add expense.
   - Share: group link and view-only link.
   - Trip settings: Fewest transfers switch, regenerate links, people and merge, archive.
5. "Who are you?": name picker, then new name with autocomplete and similar-name check.
6. Guest trip view: what you owe or are owed, how your share was worked out, expenses with pending labels, Pay with VietQR.
7. Add or edit expense, with the five split modes as tabs.
8. Pay screen.
9. Bank details form.
10. View-only trip page.
11. Activity history: who did what, when, from which device.

**Every screen** needs:

- a loading skeleton
- an empty state with one clear action (e.g. "No expenses yet. Add the first one.")
- inline error recovery
  - e.g. if the free database limit is hit: "We're over today's free limit. Try again after 07:00."

**Visual direction (from the mockups):**

- zinc neutrals
- one teal accent
- emerald for money owed to you, rose for money you owe, amber for waiting or needing action
- tabular numbers, amounts right-aligned
- plain wording

**Language [Claude's call].** Vietnamese and English, picked from the browser language, with a switcher. Mockups are in English only for review.

## 11. How it is built [Claude's call; the product owner asked for sensible defaults and free hosting]

- **TypeScript** throughout.
- **Frontend:** React + Vite, built as an installable PWA. Offline use is not required.
- **API:** Cloudflare Workers (e.g. Hono).
- **Database:** Cloudflare D1 (SQLite) with schema migrations (e.g. Drizzle).
- **Sign-in:** Google sign-in (OpenID Connect) with scopes `openid email profile` only. Session in an HTTP-only cookie. No Drive or Gmail scopes in phase 1, so no Google app verification is needed beyond the basic consent screen.
- **QR** generated on the device.
- **Hosting:** Cloudflare (static assets + Workers) on the free plan. No other paid or third-party services.

### Data model sketch (the builder may refine it)

- `users`: Google subject ID, email, name, saved bank details
- `trips`: name, currency (`VND`), fewest-transfers switch, organiser, group-link token, view-link token, created/archived times
- `participants`: trip, display name, normalised name (for matching), linked user (optional), status (active / pending / merged), merged-into
- `bank_details`: owner (user or participant), bank, account number, holder name, status (pending / approved / replaced), approved by, timestamps
- `devices` and `device_participants`: device ID (hashed), last seen, which participant it picked in which trip
- `expenses`: trip, description, amount, currency, date, payer, split mode, status (approved / pending / rejected / disabled), reject reason, disabled by, created-by participant and device, timestamps
- `expense_shares`: expense, participant, value as entered (amount, %, shares or adjustment), final amount owed
- `payment_refs`: trip, from, to, reference code (one per pair, never changes)
- `payments`: trip, from, to, amount claimed, amount confirmed, status (says paid / confirmed / disabled), "didn't arrive" flag, created by and confirmed by (participant + device), timestamps. "Who pays whom" is calculated, not stored (§9.5).
- `activity`: trip, actor (participant + device), action, details, time

Every amount carries its currency, even though phase 1 is VND only. That leaves room for trips abroad later.

## 12. Later phases (context only; not to be built now)

- **Phase 2: Google Sheets and Gemini.**
  - Export to the user's Google Sheet, on request or automatically, depending on user settings.
  - Users with Gemini set up a Workspace Studio flow. It reads incoming bank emails, extracts amount and transfer note, and writes them to a private sheet. The app matches them to settlements by reference code.
  - Users ask Gemini in the Sheets side panel about their spending.
  - Users without Gemini keep manual confirmation.
  - The app itself never asks for Gmail access.
- **Phase 3: personal money records (Money Lover replacement).**
  - Each member's share of group expenses lands in their personal records automatically.
  - Pay through the app by scanning a merchant's VietQR, recording the payment and opening the bank app.
  - Capture Apple Pay payments with an iPhone Shortcuts "Wallet transaction" automation.
  - Add transactions from bank emails with Gemini.
- **Phase 4:** investment tracking; import from Money Lover (CSV/Sheets export) and Splitwise (API).

Phase 1 should not block these:

- keep the settlement reference codes
- keep currency on every amount
- link participants to user accounts where possible
- keep the activity history

## 13. Left to the builder

- Library choices beyond those named, project structure, test strategy.
- Exact name-matching thresholds and the "fewest transfers" algorithm, within the behaviour described above.
- How often to poll, and how to cache reads to stay inside D1's free limits.
- Choice of QR encoder. It must be tested against at least two real Vietnamese bank apps.
- Rate limiting and abuse protection for the public link endpoints.
- Visual polish within the stated direction.

## 14. Things to verify early

- The `dl.vietqr.io` pre-fill parameters, and which bank apps honour them.
- Transfer-note length and character limits across major banks.
- Current D1 and Workers free-plan numbers.
- What Vietnam's personal-data rules require for a small app storing bank account numbers.
