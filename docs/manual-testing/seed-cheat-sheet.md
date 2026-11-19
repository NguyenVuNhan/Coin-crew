# Manual Testing Seed Cheat Sheet

Quick reference for every seed script, seeded group, direct link, and test scenario in this repository.

## Commands

| Command | Target DB | What it seeds |
| --- | --- | --- |
| `npm run seed:local` | Local dev D1 (`apps/api/.wrangler`) | Person-history fixtures (S1–S18) **and** `Cầu lông CN (seed)` for every signed-in user (`owner`) |
| `npm run seed:local -- --reset` | Local dev D1 | Deletes all `seed-%` rows (including attendance tables) and re-seeds cleanly |
| `npm run seed:local -- --dry-run` | — | Prints generated SQL (owner details redacted) without modifying D1 |
| `npm run seed:local -- --from <checkout>` | Local dev D1 | Copies real signed-in users from another checkout's local D1, then seeds |
| `node scripts/seed-recent-people.mjs` | E2E D1 (`apps/api/.wrangler/e2e`) | 60 users, 30 trips, 300 participants; benchmarks `/api/me/people` & `filterRecentPeople()` (requires `npm run e2e:server -w @cc/api`) |

> **Note:** Local dev seed IDs are prefixed with `seed-<o>-`, where `<o>` is the first 8 alphanumeric characters of your signed-in `users.id`. On the first Home load after a reset, refresh once if some seed groups haven't appeared yet (Home rebuilds at most 4 groups per load).

---

## Which Group / Ledger to Open

| Name | ID / Preset | Use it to test |
| --- | --- | --- |
| **Cầu lông CN (seed)** | `seed-<o>-att-club` (`sport`) | Attendance reliability (7 planned → billed sessions), turnout estimate (`5 / 7`), "Look who's back", Wanted poster, and all 4 Crew awards cards |
| **Cầu lông T5 (seed)** | `seed-<o>-caulong` (`sport`) | Attendance start-up delay (`1` session < `5` → everyone shows as `new`); transfer rounding to `1.000₫` (**S15**) |
| **Your Personal Ledger** | `seed-<o>-ledger` (`direct`) | Settled-stretch trimming (**S1**), waiting payment (**S2**), disabled expense (**S3**), other person paid (**S4**), you owe someone (**S5**), merged guest (**S6**), long 25-item scroll (**S8**) |
| **Khoa's Ledger** | `seed-<o>-khoa-ledger` (`direct`) | Viewing an expense in someone else's ledger tagged *"In Khoa's expenses"* (**S7**) |
| **Hội An (seed)** | `seed-<o>-hoian` (`trip`) | Group + quick expenses combined on An's page (**S9**), "You pay" QR + *"See history with Dũng"* (**S14**), settled member redirect (**S16**) |
| **Đà Lạt (seed)** | `seed-<o>-dalat` (`trip`) | Named transfer reroute gap block (**S10**), pending guest approval (**S11**), guest view immutability (**S17**) |
| **Phú Quốc (seed)** | `seed-<o>-phuquoc` (`trip`) | Unnamed transfer reroute gap block (**S12**) |
| **Nha Trang (seed)** | `seed-<o>-nhatrang` (`trip`) | Transfer reroute with `0₫` direct two-way lines (**S13**) |

---

## Direct URLs (replace `<o>` with your 8-char owner tag)

- **New plan (Attendance turnout card):** `/t/seed-<o>-att-club/expenses/new?mode=planning`
- **Crew awards:** `/t/seed-<o>-att-club/awards`
- **S16 — Settled member in group (Giang):** `/people/in/seed-<o>-hoian/seed-<o>-hoian-giang`
- **S17 — Guest group link (Đà Lạt, pick Hà in private window):** `/j/seed-<o>-dalat-g`
- **S18 — Public request link (An, open in private window):** `/r/seed-r-<o>-an00000000000000`

---

## Attendance Reliability & Crew Awards (`Cầu lông CN (seed)`)

With all 7 members selected on a plan, the turnout card reads **5 / 7** (`sure: 4`, `unsure: 2`, `flaky: 1`). Saving a new plan or bill in `Cầu lông CN (seed)` counts any uncounted sessions and updates scores.

| Member | Sessions S1–S7 | Presence / Reliability | Labels & Flags | Turnout Bucket |
| --- | --- | --- | --- | --- |
| **You (admin)** | Planned 7/7, played 7/7 | 86 / 96 | `regular` | Sure |
| **An** | Planned 7/7, played 7/7, guests in S5–S7 (`guest 3.24`) | 86 / 96 | `regular`, `topGuest` | Sure |
| **Bình** | Planned 7/7, played S1–S2, no-showed S3–S7 | 2 / 4 | `rare`, `flaky` | Often no-show |
| **Chi** | Planned 7/7, no-showed S5–S6, returned S7 | 40 / 54 | `wantedStamp` (Wanted poster) | Unsure |
| **Dũng** | Played S1, skipped S2–S6, returned S7 (gap 5) | 10 / 80 | `rare`, `back` ("Look who's back") | Sure |
| **Hà** | Planned 7/7, played S1, S3, S5, S7 | 32 / 51 | — | Unsure |
| **Giang** | Joined S6–S7 (2 sessions seen < 5) | 43 / 84 | `new` | Sure (newcomer) |

### Checklist

- [ ] **New plan → Turnout card.** Open `Cầu lông CN (seed)` → **New plan** (`/t/seed-<o>-att-club/expenses/new?mode=planning`). Expect: **"Likely to actually come"** card under the schedule, with sure (teal), unsure (light teal), and often no-show (grey) segments.
- [ ] **See who & Look who's back.** Tap **"See who"** on the turnout card. Expect: each member's labels and scores matching the table above, and **Dũng** highlighted for **"Look who's back"** (tapping it leaves the plan form).
- [ ] **Crew awards.** Open `Cầu lông CN (seed)` → **Crew awards** (`/t/seed-<o>-att-club/awards`). Expect all 4 animated meme cards: **Award night** (regular / top guest / flaky), **Wanted poster** (Chi), **Folk verse**, and **Stadium board**.
- [ ] **Card actions.** On Crew awards, tap **Replay** (re-triggers animation), **Save** (downloads image), and **Share** (produces share image).
- [ ] **Start-up delay (< 5 sessions).** Open `Cầu lông T5 (seed)` → **New plan** → **See who**. Expect members to show as `new`.

---

## Person History Scenarios (`S1–S18`)

Full checklist: [person-history.md](./person-history.md)

| Scenario | Where | What to expect |
| --- | --- | --- |
| **S1** | Home → An → Quick expenses | Settled Lunch + confirmed payment hidden; Taxi + S2–S4 shown |
| **S2** | Home → An → Quick expenses | `−50.000₫` with **Waiting** pill (`says_paid`), counted in total |
| **S3** | Home → An → Quick expenses | Boat (`200.000₫`) crossed out in grey, excluded from total |
| **S4** | Home → An → Quick expenses | Coffee (`−45.000₫`) paid by An |
| **S5** | Home → Dũng | **You owe 200.000₫** in Lychee; Quick expenses `−200.000₫` |
| **S6** | Home → An → Quick expenses | Snack (`+60.000₫` from merged `An (cũ)`) included in **+130.000₫** total |
| **S7** | Home → Khoa → Quick expenses | Fuel (`−100.000₫`) tagged *"In Khoa's expenses"* |
| **S8** | Home → Chi → Quick expenses | 25 snacks, newest first, scrollable without trimming |
| **S9** | Home → An | Quick expenses (`+130.000₫`) + Hội An (`+100.000₫`) = **+230.000₫** |
| **S10** | Đà Lạt → Bình → You (`210.000₫`) | Sheet shows `300.000₫` between you, *"90.000₫ moved to Minh to save transfers"* |
| **S11** | Đà Lạt → Bình sheet / Approvals | Ice cream (`+100.000₫`, `pending`) in grey, not counted; also in approvals card |
| **S12** | Phú Quốc → Bình → You (`200.000₫`) | Sheet shows `400.000₫` between you, unnamed *"changed this to 200.000₫"* |
| **S13** | Nha Trang → Bình → You (`300.000₫`) | Gap block only (`0₫` direct lines), no crash |
| **S14** | Hội An → You → Dũng (`200.000₫`) | Expands in place to QR with *"See history with Dũng"* |
| **S15** | Cầu lông T5 → Chi → You (`125.000₫`) | Between you `125.300₫`, *"Rounded to 1.000₫"* |
| **S16** | `/people/in/seed-<o>-hoian/seed-<o>-hoian-giang` | Redirects to Giang's page showing nothing open |
| **S17** | `/j/seed-<o>-dalat-g` (private window, Hà) | Transfer rows expand to QR only, no person-page links |
| **S18** | `/r/seed-r-<o>-an00000000000000` (private window) | **230.000₫** request page, *"What this covers (2)"*, no 3rd parties named |

---

## E2E Recent People Benchmark (`scripts/seed-recent-people.mjs`)

- **Seeded data:** `seed-user-minh` (`e2e-minh`, `minh@example.com`), 60 generated Vietnamese users (`seed-user-01`..`60`), and 30 trips (`Seed trip 01`..`30`) with 10 participants each (300 rows).
- **What it verifies:** Runs 5 `curl` calls to `GET /api/me/people` (asserting `< 0.300s` returning 50 recent people) and 1,000 Playwright `filterRecentPeople()` evaluations (asserting `< 1ms` average).

---

## Sổ chi tiêu (`/transactions`) — search, quick dates, saved copy (#133 / PR #139)

`npm run seed:local` also turns Sổ chi tiêu on for every owner and seeds about 550 entries (ids `seed-<o>-p-…`). It bumps the owner's sync epoch, so every browser copy downloads again in two pages of 500.

| Data | Use it to test |
| --- | --- |
| Wallets `Tiền mặt (seed)`, `Techcombank (seed)`, `Ví đầu tư (seed)` (investment), `MoMo cũ (seed)` (archived) | Wallet filter; archived wallet history 11–15 months back |
| Sub-category `Cà phê` under `Ăn uống`; the starter categories | Category filter, parent vs sub-category |
| Tags `#congtac`, `#giadinh`, `#dulich-dalat`, `#Tết`, `#sinhnhat`, `#hoàn-tiền` | `#` suggestions turning into a chip; tag filter |
| Assets `BTC`, `FPT`, `Vàng SJC` (buys monthly, FPT sold ~95 days ago) | Asset filter, buy/sell rows |
| Notes like `Cà phê sữa đá`, `Bún chả`, `Đổ xăng`, `Lương tháng …` | Accent-free search (`ca phe`, `bun cha`, `do xang`) |
| Entries today, yesterday, 7 and 29 days ago; a Đà Lạt trip ~2 months ago | Quick picks: this week, last week, this month, last month, last 30 days |
| No entries 8–10 months back; `Mua laptop cũ` ~26 months back | Empty-month auto-load; all-time search beyond loaded months |
| Monthly transfers (`Rút tiền mặt`, `Nạp ví đầu tư`), `Cho Minh mượn` (kept out of reports) | Transfer rows, exclude-from-reports |
