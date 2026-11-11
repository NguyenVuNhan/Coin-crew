# Person history: manual checklist

Seeded by `npm run seed:local` (`scripts/seed-local.mjs`), once per signed-in user ("O", the owner). Ids are `seed-<first 8 of your user id>-…`; the script prints your S16, S17 and S18 links at the end.

**The numbers below assume a fresh `npm run seed:local -- --reset`.** Anything you add or settle by hand changes them.

- [ ] **S1 Trim after a settled stretch.** Home → An. Expect: only Taxi (and S2–S4 lines). Lunch and the payment are hidden.
- [ ] **S2 Waiting payment counts.** Home → An. Expect: line with a "Waiting" pill, −50.000₫, included in the total.
- [ ] **S3 Disabled expense.** Home → An (Boat). Expect: crossed out, not counted.
- [ ] **S4 Other person paid.** Home → An (Coffee). Expect: −45.000₫.
- [ ] **An's ledger total.** Home → An. Expect: 165k − 50k − 45k = **70.000₫ owes you**. Lines add up to it.
- [ ] **S5 You owe someone.** Home → Dũng. Expect: **You owe 200.000₫** in Lychee, one −200.000₫ line.
- [ ] **S6 Merged ledger guest.** Home → An (ledger row "An (cũ)" is merged into An). Expect: An's screen also lists Snack, and the Merged list shows "An (cũ)".
- [ ] **S7 Their ledger with me.** Home → Khoa (mock account with his own ledger holding you). Expect: −100.000₫ line tagged "In Khoa's expenses".
- [ ] **S8 Long open history.** Home → Chi. Expect: scrolls cleanly, newest first, nothing trimmed (25 expenses).
- [ ] **S9 Group rows + quick expenses together.** Home → An (Hội An's An is linked to ledger An). Expect: An's screen shows a "Hội An +100.000₫" row. Tapping it opens group mode. An's overall total is **230.000₫** (70k + 60k S6 + 100k).
- [ ] **S10 Reroute, named.** Đà Lạt (seed) → transfer "Bình pays you 210.000₫" → See history. Expect: "Between you two 300.000₫", "90.000₫ moved to Minh to save transfers."
- [ ] **S11 Unapproved guest expense.** Đà Lạt (seed) → Bình's group history (Ice cream added by guest Hà). Expect: in Bình's group history a "Waiting for approval" line, not counted. S10's numbers are unchanged. The group's approvals list shows it.
- [ ] **S12 Reroute, unnamed.** Phú Quốc (seed) → Bình's group history. Expect: between you 400.000₫, "To save transfers, the group changed this to 200.000₫." No name.
- [ ] **S13 Reroute with no two-way lines.** Nha Trang (seed) → transfer "Bình pays you 300.000₫" → history. Expect: no lines, gap line only, no crash.
- [ ] **S14 Pairwise group, no gap.** Hội An (seed) → Dũng, group mode. Expect: you owe 200.000₫, lines match, no gap block.
- [ ] **S15 Rounding caption.** Cầu lông T5 (seed) → Chi. Expect: total 125.000₫, between you 125.300₫, "Rounded to 1.000₫".
- [ ] **S16 Settled in a group.** Open `/people/in/seed-<o>-hoian/seed-<o>-hoian-giang` directly (no transfer row). Expect: settled line, no lines.
- [ ] **S17 Guest sees no history entry.** Open `/j/seed-<o>-dalat-g` (Đà Lạt's group link) in a private window, pick Hà. Expect: no "See history" button.
- [ ] **S18 Request page.** Open `/r/seed-r-<o>-an00000000000000` (ledger An's seeded request token; padded to the 32 characters `/r/` accepts). Expect: "You owe … 230.000₫" with three rows. The quick-expense row reads "Coffee, Taxi and 2 more" (the old Lunch stretch is trimmed; the disabled Boat is listed but never named) and opens into the compact list; the merged row reads "Snack"; the Hội An row reads "Lantern tour".
