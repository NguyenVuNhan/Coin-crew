# Events (replacing trip mode) and a report for any tag

Date: 2026-11-28 · Issue: #158 · Branch: `feat/trip-mode` (PR #160, not merged). This changes `2026-11-27-trip-mode-design.md` after the owner's first manual test. **Every decision there still holds unless this document changes it.** The Phase 2 rules from #116 apply unchanged.

## 1. Why

The owner tried trip mode and came back with four changes:
- dates should not be required;
- the trip name should not double as a tag; tags should be generated;
- "trip" should become "event";
- events should be started and stopped by hand.

While we talked it through, a second need came up: following a long project like **buying a house**, where they want every transaction for it in one place for months. Auto-tagging is wrong there, because most spending during those months has nothing to do with the house. The owner's answer: **long-term things are just a tag they add by hand, plus a report for that tag.** Events stay short and automatic.

So this round has two parts:
1. **Events:** trip mode, renamed and loosened. Dates are optional, it starts and stops by hand, several can run at once, and the tag is generated.
2. **Tag report:** the existing report, filtered to one tag.

## 2. Goals

- Starting an event takes one name and one tap. Dates, groups and a limit are optional.
- Several events can run at once (a holiday during a months-long house purchase), and a new expense lands in every running one.
- For any tag, the owner can see its total, its categories, its months and days, and its transactions, from the report they already know.

## 3. Non-goals

- A limit on a tag report. The owner said "total on its own".
- Auto-tagging for long-term tags. They are tagged by hand.
- Anything else trip mode's non-goals already exclude.

## 4. Anti-goals

- An expense that belongs to no running event still getting an event tag.
- The event page and the tag report disagreeing for the same tag.
- Generated tags that collide with each other or with the owner's own tags, or whose names don't follow the event's dates.

## 5. Decisions

| # | Decision | Who |
|---|---|---|
| E1 | **"Trip" becomes "event" everywhere in the UI.** In Vietnamese, "Chuyến đi" becomes **"Sự kiện"**. This covers the Sổ chi tiêu row, the list, the form, the expense form row and the page. State words become **"Đang diễn ra" / "Sắp tới" / "Đã xong"**, and "Trước chuyến đi" becomes **"Trước sự kiện"**. The ✈️ icon becomes a neutral calendar-style lucide icon. English uses "Event". New vi lines keep `// REVIEW`. | owner (rename, "Sự kiện" everywhere); my call (state words, icon) |
| E2 | **The code name moves from `travel` to `event`** (`personal_events`, `personal_event_groups`, `personal_event_share_marks`, `/api/me/personal/events`, `EventView`…). Migration `0038` has never run on the remote database, so **it is rewritten in place** rather than adding `0039`. Local databases need the old tables dropped and 0038 re-applied (the builder adds a one-line note on how). | my call (cost if wrong: a local DB reset) |
| E3 | **Dates are optional.** The form has a start date that defaults to **today** when left empty (saving then starts the event right away) and an optional end date. Without an end date the event runs until it is stopped. A future start date saves it as upcoming, and it starts by itself on that day. An end date stops it by itself after that day. | owner; my call (empty start = today, so there is never an event with no start) |
| E4 | **Start and stop by hand.** A running event has **"Dừng"** on its page and its Sổ chi tiêu row (with a confirm). It sets the end date to today **and marks the event stopped at once** (a stored stopped flag/time): from that moment it shows as "Đã xong", new expenses no longer get its tag (even later the same day), and share tagging stops. The tag's end date is today. A stopped event has **"Tiếp tục"**, which clears the end date and the stopped mark so it runs again and keeps adding to the same event. **Tiếp tục first asks the existing-items question (E9) for the days it was stopped**; group shares from that gap are never tagged without asking. An upcoming event has **"Bắt đầu ngay"**, which moves the start date to today. This replaces "Kết thúc sớm". | owner (start/stop); my call (resume, start now) |
| E5 | **Several events can run at once.** The trip-mode rule that start→end ranges may not overlap (T12) is removed, along with its overlap warning. A new own expense gets the tag of **every** running event (pre-filled, removable). A group share gets the tag of every event that includes its group and covers its date. The single-winner rule in T7 is removed. | owner |
| E6 | **Each event owns exactly one tag, generated for it.** Picking an existing tag for an event (trip-mode T1 reuse) is gone. The tag's name is `<name>-<start ddmmyy>[-<end ddmmyy>]`. The name is folded to lowercase ASCII with no accents (đ → d), and spaces and punctuation are removed, so "Đà Lạt" 20–30/12/2026 becomes **`dalat-201226-301226`**. With no end date yet it is `dalat-201226`. The name field is just the event's name, no longer "also tag". If the generated name is already taken by another tag, `-2`, `-3`… is added. If the owner renames the tag by hand, the next date change regenerates the name. If the owner deletes the tag, the event gets a new generated tag on its next save. | owner (format); my call (folding, suffix, one tag per event, hand rename/delete) |
| E7 | **The tag follows the event's dates.** Whenever the start or end date changes (in the form, by Dừng, Tiếp tục, Bắt đầu ngay, or by itself), the tag is **renamed** to match. Because every item shares that one tag, they all follow. A rename never merges into another tag (E6 suffix). | owner |
| E8 | **An event's total is everything that carries its tag.** Each event now has its own tag, so the trip-mode counted-range rule (T2's "count only this trip's dates") is no longer needed for counting. The event page and the tag report (E10) for that tag show the same figure. Counts-from stays, but **only as the range for lead-up suggestions and group-share tagging**, and only appears when a start date is chosen in the form. | my call (follows from E6) |
| E9 | **The existing-items question stays** (T10, with the final-review fix: exactly the items it counted). It is asked whenever saving makes an event cover existing items, including a start date of today, and never on Dừng. | carried over; my call |
| E10 | **Tag report: the existing report screen filtered to one tag.** Tapping a tag in the report's tag list (or an event page link "Xem báo cáo") opens the report with that tag as a filter. A dismissible filter chip with the tag name sits under the period. Everything on the report (totals, categories, by period, transactions) then counts only items carrying that tag, by the same rules as now (#115). The tag goes in the report URL so it can be shared and survives a refresh. When opened from a tag, the period starts as a **custom range from the tag's first item to today**, so a months-long tag shows in full; the owner can change it like any period. No limit, no auto-tagging. | owner (report for any tag, total only); my call (entry points, default period, URL) |
| E12 | **A limit needs an end date.** The limit field shows only when an end date is set. Without one, the form shows a quiet line instead: "Đặt ngày kết thúc để đặt hạn mức". Clearing the end date (in the form or by Tiếp tục) removes the limit's budget, after a confirm in the form. Dừng keeps it, since Dừng sets an end. The limit stays a #159 one-off budget over counts-from → end. | owner (my suggestion, approved) |
| E13 | **Several running events on screen.** On Sổ chi tiêu, with one event running the row is as in trip mode. With two or more it reads "N sự kiện đang diễn ra · Đà Lạt, Mua sắm Tết" and opens the event list. With none running but one or more upcoming, it shows the soonest upcoming one, as now. In the expense form there is **one row per running event**, each with its own 44px ✕, plus lead-up suggestion rows for upcoming events. | owner (my suggestion, approved) |
| E11 | **Long-term tags are ordinary tags.** There is nothing new to create: the owner makes a tag ("Mua nhà"), adds it by hand, and reads it through E10. | owner |

## 6. Constraints

- Everything in trip mode's §6 still applies: shares are read, never copied; no new group write paths; spending book off hides everything; budget pieces reused.
- **Limit:** see E12. The one-off budget always has an end, so #159's core needs no change.
- **Renaming the tag** is one write to the tag row; links stay (tags are referenced by id). Group-share marks key on the event, not the tag name.
- **Report filter:** `ReportQuery` gains an optional `tagId`, and the report computation (client copy and server fallback) applies it. Existing report tests must keep passing untouched.
- Existing tests are never edited or deleted. Tests the rename breaks are **new tests from this branch**, so they may be updated. Tests that existed before `feat/trip-mode` may not be.

## 7. Left to the builder

- The exact folding function (reuse `foldForSearch` in core if it fits).
- Where "Xem báo cáo" sits on the event page.
- How the filter chip looks (use `Pill`).
- Copy for the Dừng / Tiếp tục / Bắt đầu ngay confirms.
