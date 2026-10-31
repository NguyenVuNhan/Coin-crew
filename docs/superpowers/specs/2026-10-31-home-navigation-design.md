# Home, navigation and people merging (feedback on quick expenses)

Date: 2026-10-31 · Builds on: `docs/superpowers/specs/2026-10-31-quick-expenses-and-people-design.md` (PR #25, branch `feat/no-group-expenses`)
Mockups: `.superpowers/brainstorm/9239-1793422519/content/` (`home-layout.html` option A, `floating-footer.html`, `desktop-panel.html`)

## 1. Intent

The owner tried the quick-expense build and reported:

- Can't merge a person from "Khoản chi nhanh" with a person in a group.
- Can't see the list of quick expenses and payments.
- The "Mọi người" page should feel like a group page.
- "New group" shouldn't be on that page.

The underlying wish, in their words: *"I simply want the experience to be similar across multiple screens. Also, I want a place to view expenses and transactions easily."*

Now that the app has two modes (groups and quick expenses), navigation also changes. Phones get a floating footer and computers get a side panel, so the owner can reach the main screen, groups and activity from anywhere.

## 2. Goals

1. **The main screen is "Khoản chi nhanh".**
   - It is the first screen after sign-in, and it is **not a group**: it shows the owner's status across all groups.
   - It is built like a group page: same order, cards, tabs and look (mockup `home-layout.html`, **option A**).
   - From top to bottom:
     1. **Total card.** What people owe the owner across all groups and quick expenses, and what the owner owes. It uses the same card style as the group balance card.
     2. **"Theo người · mọi nhóm" (by person, all groups).** The per-person netted list from PR #25: one row per person with their signed total and "waiting for you to confirm" when relevant. Tapping a row opens that person's page. It sits where a group page shows "your transfers".
     3. **Tabs "Chi tiêu" / "Thanh toán" (Expenses / Payments).** They list **quick expenses only**, from the personal ledger. They reuse the group page's expense and payment lists, rows and details, so each item can be opened, edited and disabled the same way as in a group.
   - No "New group" button on this screen.
2. **Phone navigation is a floating footer** (`floating-footer.html`, with the owner's adjustments).
   - **Left:** a floating white rounded pill with three icon-only buttons:
     - **Khoản chi nhanh** (home icon): the main screen.
     - **Nhóm** (people icon): the group list as it is today, with its "New group" button.
     - **Hoạt động** (clock icon): activity.
     - The current section is highlighted.
   - **Right:** a separate floating round black **"+"**.
   - The whole row floats above the content. Content gets bottom padding so nothing hides behind it.
   - **Settings stay where they are**, behind the avatar menu in the header. There is no settings icon in the footer.
3. **"+" depends on where you are.**
   - On the main screen, on Activity and on the group list, it adds a **quick expense**.
   - Inside a group, it adds an expense **to that group** (the existing add-expense flow), with the **Nhóm** icon highlighted.
   - The group page's own "+ Add expense" bottom bar is replaced by this footer.
4. **On a computer (≥1024px) there is a side panel** (`desktop-panel.html`).
   - **Left panel, from top to bottom:**
     - the app name
     - a black **"+ Thêm giao dịch"** button, which follows the same rule as "+" in goal 3
     - **Khoản chi nhanh**, **Nhóm** and **Hoạt động** (icon + label, current one highlighted)
     - the avatar/settings at the bottom
   - **Main screen layout on a computer:** two columns like the group page's "layout A". The middle holds the quick-expense Chi tiêu and Thanh toán lists. The right holds the total card and the per-person list.
   - Group pages keep their existing wide layout, inside the side panel.
5. **Activity covers everything.** "Hoạt động" shows activity from **all the owner's groups and quick expenses** in one feed, newest first, grouped by day like today's activity screen. Each line names the group it came from, or "Khoản chi nhanh". Tapping a line opens the item in its group or in quick expenses.
6. **Merging people across quick expenses and groups.**
   - On a person's page, a **"Gộp với…" (Merge with…)** action appears for anyone the owner added by name (any guest).
   - It opens a sheet listing every other person in the owner's People list: guests or signed-in people, from quick expenses or any group, not only people with an open balance if that is feasible. Similar names come first. The owner can pick anyone, so "Minh" and "Minh Nguyễn" can also be merged.
   - **The result:** they become **one person with combined totals**: one row on the main screen, one request link, and one person's page listing their lines from every group and from quick expenses.
   - **Groups are untouched.** Inside each group nothing changes for its members. The merge is the owner's own view, built on the `person_links` "same person" link from PR #25, which is extended to cover these cases.
   - **"Tách ra" (Unmerge)** on the person's page undoes a merge the owner made. This is my call; the owner hasn't seen it yet.
7. **Same feel across screens.** The main screen, the group page, the person page and Activity share the header, cards, lists, tabs and footer/side panel. Moving between them should not feel like switching apps.

## 3. Non-goals

- No change to how money is netted, settled or confirmed (PR #25 rules stand).
- No new settings screen; settings stay in the avatar menu.
- Group members don't see the owner's merges.
- No redesign of the group page beyond swapping its bottom bar for the shared footer or side panel.

## 4. Anti-goals

- A footer or side panel that covers content or buttons, especially the expense form's save bar.
- The main screen looking or behaving like a "group" (it has no members, invite link or settings of its own).
- Merges that change other people's group data.
- Two places showing different totals for the same person.

## 5. Decided by the owner

| Topic | Decision |
|---|---|
| Main screen | "Khoản chi nhanh", not a group, shows status across all groups |
| Main screen layout | Option A: total card → by-person list → Chi tiêu / Thanh toán tabs |
| Expense/payment lists on main screen | quick expenses only |
| Phone footer | icon-only pill on the left [Khoản chi nhanh · Nhóm · Hoạt động], floating round "+" on the right |
| Settings | stay in the avatar menu, no footer icon |
| "+" inside a group | adds to that group; Nhóm highlighted |
| Computer | side panel [+ Thêm giao dịch · Khoản chi nhanh · Nhóm · Hoạt động], avatar/settings at the bottom; main screen in two columns |
| Activity | all groups and quick expenses together |
| Merge result | one person with combined totals |
| New group button | only on the group list |

## 6. My calls (owner to check)

- **Unmerge exists** (goal 6).
- **"+" on the group list and on Activity adds a quick expense**, not a new group. New groups are created from the group list's own button.
- **Routes.** Keep `/trips` as the main screen so existing links and sign-in returns still land there. Move the group list to `/groups`. Old `/trips?tab=groups` and `/trips?mergeReview=…` links go to `/groups` with the same parameters, so the merge-review banner still shows. Activity gets `/activity`.
- **The footer and side panel are one shared component** used by the main screen, the group list, Activity, group pages and person pages. Forms (add/edit expense, pay screen) keep their own bottom save bar, and the footer is hidden there.
- **Guests and link viewers** (no account) keep today's group page, without the footer or side panel. The navigation is for signed-in people only.

### Settled after the builder check (my calls)

- **Merging with a signed-in person.**
  - The signed-in person is the one kept. The merged row uses their `u:` key, name and request link.
  - A guest from a group or the ledger can be linked to that user. How it is stored is the builder's choice: for example, a link row pointing at the user's ledger participant, imported if missing.
  - Two signed-in people can't be merged. Their rows are shown but disabled in the "Gộp với…" sheet, with a short reason.
- **"Gộp với…" is offered on guest rows only.** The sheet lists guests and signed-in people.
- **Unmerge splits one person off.**
  - It is listed per linked entry on the person's page ("Tách {name} ra"), so a three-way merge can be split one at a time.
  - Nicknames moved by a merge are not restored.
  - The request link stays with the kept person.
- **Activity.**
  - It shows everything that happens in the owner's groups, including other members' actions, plus the owner's quick expenses, newest first.
  - Lines from quick expenses are labelled "Khoản chi nhanh" and open on the main screen's expense or payment details.
  - Paging uses a `(created_at, id)` cursor across trips.
- **Editing quick expenses from the main screen.** The owner is the ledger's organiser, so the group page's organiser rules apply: edit, disable, history. "+" on the main screen is the existing quick-expense form.
- **The total card is exactly the sum of the per-person list**, owed and owing separately, and is fed by the same summary. Currency is VND only, as today.
- **Every place that sends someone to `/trips` lands on the main screen.** That covers sign-in returns, the landing page and the back from a group. Invites go to `/j/…` and `/t/…` as today. The merge-review link moves to `/groups?mergeReview=…`, and `/trips?mergeReview=…` and `/trips?tab=groups` redirect there.
- **Navigation shows for any signed-in user**, including on a group they only view by link and on the no-access screen. Visitors who aren't signed in get none.

## 7. Left to the builder

- **The cross-group activity API.** For example `GET /api/me/activity?before=`, paginated and within D1 limits (≤100 bound params, ≤50 queries per invocation). Reuse `activityLine` text where possible.
- **How the main screen reuses the group page's expense/payment list components** for the hidden ledger trip (the owner-only access from PR #25 already allows it).
- **Extending `POST /api/me/people/link`.**
  - Today it may only accept guest (`p:`) keys. It needs to accept a guest with a signed-in person (`u:` + `p:`) and to cover ledger guests. Two signed-in people stay separate, since they are already one identity each.
  - It also needs an unlink route.
- Exact icons (lucide via the `Icon` wrapper), shadows and sizes within the "Friendly" look in `CLAUDE.md`. No raw hex; touch targets ≥44px.
- **Tests.** Footer and side panel navigation, "+" target per screen, merge and unmerge, and activity across groups. The existing e2e golden paths must keep passing (they create groups from the group list), and `e2e/quick-expense.spec.ts` is updated for the new main screen.
