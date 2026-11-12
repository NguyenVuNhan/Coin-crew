# Person history: manual checklist

Seeded by `npm run seed:local` (`scripts/seed-local.mjs`), once per signed-in user ("O", the owner). Ids are `seed-<first 8 of your user id>-…`; the script prints your S16, S17 and S18 links at the end.

**The numbers below assume a fresh `npm run seed:local -- --reset`.** Anything you add or settle by hand changes them. The first Home load after a reset may miss a few seed groups (it rebuilds at most 4 groups per load); refresh once.

**How it works now (Part 2):**
- The person page shows one ledger: a merged "Quick expenses" row, then a row per group, then a Total. Tapping a row opens a sheet with what makes it up.
- In a group, a "<name> → You" transfer row opens that person's page with the group's sheet already open. Rows where you pay still expand to the QR, with "See history" inside.

## Person page (Home → person)

- [ ] **S1 Trim after a settled stretch.** Home → An → tap "Quick expenses". Expect: the sheet shows Taxi and the S2–S4 lines. The old Lunch and its payment are hidden.
- [ ] **S2 Waiting payment counts.** Same sheet. Expect: "An paid you −50.000₫" with a "Waiting" pill, counted in the row's amount.
- [ ] **S3 Disabled expense.** Same sheet (Boat). Expect: crossed out, grey amount, not counted.
- [ ] **S4 Other person paid.** Same sheet (Coffee). Expect: −45.000₫.
- [ ] **S6 Merged ledger guest.** Same sheet. Expect: Snack +60.000₫ is listed too (from "An (cũ)", merged into An). The "Quick expenses" row reads **+130.000₫** (70k + 60k), and "Merged here" lists "An (cũ)".
- [ ] **S9 Group rows + quick expenses together.** Home → An. Expect ledger rows "Quick expenses +130.000₫" and "Hội An (seed) +100.000₫", with Total **230.000₫**, the same as the number at the top. Tapping "Hội An" opens its sheet (Lantern tour) with "Open Hội An (seed)", which goes to the group page. Back returns to An's page with no sheet.
- [ ] **S5 You owe someone.** Home → Dũng (the quick-expense one). Expect: **You owe 200.000₫** in Lychee, and a "Quick expenses −200.000₫" row whose sheet has one −200.000₫ line.
- [ ] **S7 Their ledger with me.** Home → Khoa. Expect: the "Quick expenses −100.000₫" sheet has Fuel tagged "In Khoa's expenses".
- [ ] **S8 Long open history.** Home → Chi (the quick-expense one) → "Quick expenses". Expect: 25 lines in the sheet, newest first, scrolling inside the sheet, nothing trimmed.

## Groups (group page → "Your transfers")

- [ ] **S10 Reroute, named.** Đà Lạt (seed) → tap the "Bình → You 210.000₫" row (not the circle). Expect: Bình's page with the Đà Lạt sheet open: "Between you two 300.000₫", "90.000₫ moved to Minh to save transfers."
- [ ] **Tick still works.** Đà Lạt (seed) → tap the circle on "Bình → You". Expect: it marks received with Undo and does **not** open Bình's page. Tap Undo.
- [ ] **S11 Unapproved guest expense.** Same Đà Lạt sheet. Expect: "Ice cream +100.000₫" in grey with "Waiting for approval", not counted. The group page shows it in its approvals card.
- [ ] **S12 Reroute, unnamed.** Phú Quốc (seed) → "Bình → You 200.000₫". Expect: between you 400.000₫, and "To save transfers, the group changed this to 200.000₫." with no name.
- [ ] **S13 Reroute with no two-way lines.** Nha Trang (seed) → "Bình → You 300.000₫". Expect: the gap block only (between you 0₫), no lines, no crash.
- [ ] **S14 You pay in a group.** Hội An (seed) → the "You → Dũng 200.000₫" row. Expect: it still expands in place to pay, with "See history with Dũng" inside. That button opens Dũng's page with the Hội An sheet: −200.000₫ and no gap block.
- [ ] **S15 Rounding caption.** Cầu lông T5 (seed) → "Chi → You 125.000₫". Expect: between you 125.300₫, "Rounded to 1.000₫".
- [ ] **S16 Settled in a group.** Open `/people/in/seed-<o>-hoian/seed-<o>-hoian-giang` directly. Expect: it redirects to Giang's page, which says there is nothing open. No sheet, no crash.
- [ ] **S17 Guest sees no change.** Open `/j/seed-<o>-dalat-g` (Đà Lạt's group link) in a private window and pick Hà. Expect: transfer rows still expand to the QR, with no link to a person page.

## Request link

- [ ] **S18 Request page.** Open `/r/seed-r-<o>-an00000000000000` in a private window (ledger An's seeded request token, padded to the 32 characters `/r/` accepts). Expect:
  - **Layout:** like a group pay page: "Pay <you>", "You owe … 230.000₫", the QR or a "no bank details" card, "I've paid", then "What this covers (2)".
  - **The sheet:** "What this covers" opens a sheet with "Expenses with <you>" (−130.000₫) and "Hội An (seed)" (−100.000₫), Total −230.000₫. Tapping a row expands its lines in place, with the waiting payment and the crossed-out Boat.
  - **Privacy:** no third person is named anywhere.
