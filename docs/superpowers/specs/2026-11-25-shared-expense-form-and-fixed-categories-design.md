# Shared expense form and fixed danh mục (issue #140, item 3)

Date: 2026-11-25 · Issue: #140 (item 3 "Sửa khoản chi" layout) · Follow-ups: #140 items 1–2, #152

## Intent

Recording money spent **with other people** happens in three places today, and they look like three different apps:

- the group's **"Thêm khoản chi" / "Sửa khoản chi"** (`ExpenseForm`),
- the **"Khoản chi nhanh"** with a person (direct preset, also `ExpenseForm`),
- the **Vay/Nợ** tab of the Sổ chi tiêu entry page (`EntryPage`, `activeTab === 'loan-debt'`).

The owner's view: all three serve **exactly the same purpose** (who spent what, with whom, who owes whom). They should become **one shared form** that looks like the Chi/Thu page (same amount box, chips, grouped rows, save bar), but with its own priorities: a clear title first, a small danh mục, and payer + date always visible.

To give that form a danh mục that a whole group can share, CoinCrew gets **one fixed category list** used by every user and every group.

## Goals

1. One shared expense form, used by the three screens above, visually built from the Chi/Thu components.
2. A fixed, built-in danh mục list (Splitwise-based) that every user and every group has, which cannot be deleted or renamed.
3. Group expenses carry a danh mục and a separate optional Nội dung (note).
4. Users keep their own categories, can merge a custom one into a fixed one, and can hide fixed ones they don't use.

## Non-goals

- #140 item 1 (picking Đi vay in Thu / Cho vay in Chi creates a real loan) and item 2 (removing the Vay/Nợ tab). Next, after this ships.
- #152 (group as a special wallet type). Separate brainstorm.
- A group-managed (admin-editable) category list. The owner first wanted this, then chose the fixed list "to keep it simple".
- Income/transfer/trade flows on the entry page stay as they are.

## Anti-goals (would be a failure even if it works)

- The shared form feels like a different app from Chi/Thu (different field styles, layout or save bar).
- The danh mục picker becomes as prominent as Chi/Thu's big tile grid. Here it is a secondary detail.
- Payer or date hidden behind a fold.
- Existing users lose categories, or existing transactions change category without them choosing to merge.
- Sport sessions or the group fund lose any of their current abilities.
- Tests break because `fsl-*` classes or `data-testid`s moved.

## Constraints

- Follow `DESIGN.md`, `PRODUCT.md` and the CLAUDE.md UI rules (app wrappers first, theme tokens only, `min-h-11` targets, `text-base` fields, `tabular-nums` money).
- Icons come from lucide through the `Icon` registry (`libs/web/ui/src/components/icons.tsx`). Add missing names there and to `CATEGORY_ICON_OPTIONS` where useful. No generated SVGs.
- D1 migrations are hand-written SQL (next after `0033_…`), applied `--local` for the tunnel.
- Respect the Nx import rules. The fixed list is logic both sides need, so it lives in `@cc/core`.
- The Zalo Mini App shares these screens. Don't break `platform.kind === 'zmp'` paths.

## 1. The fixed danh mục list

Source: Splitwise's public `get_categories` (7 groups, 41 sub-categories). Owner-approved changes: Vietnamese names, no per-group "Khác" (picking the group itself means "other"), loans added, plus a small income set because Splitwise has none.

Each entry has a **stable key** (never shown, never changes), a type, a name, a lucide icon and an optional parent.

| Group (parent) | Sub-categories |
|---|---|
| **Ăn uống** `utensils` | Ăn ngoài `utensils-crossed` · Đi chợ / siêu thị `shopping-basket` · Bia rượu `beer` |
| **Di chuyển** `car` | Xe đạp `bike` · Xe buýt / tàu `bus` · Ô tô `car` · Xăng xe `fuel` · Khách sạn `hotel` · Gửi xe `square-parking` · Máy bay `plane` · Taxi / Grab `car-taxi-front` |
| **Giải trí** `party-popper` | Trò chơi `gamepad-2` · Xem phim `film` · Âm nhạc `music` · Thể thao `dumbbell` |
| **Nhà cửa** `house` | Đồ điện tử `tv` · Nội thất `sofa` · Đồ gia dụng `package` · Sửa chữa `wrench` · Trả góp nhà `landmark` · Thú cưng `paw-print` · Tiền nhà `key-round` · Dịch vụ `concierge-bell` |
| **Cuộc sống** `heart-handshake` | Con cái `baby` · Quần áo `shirt` · Học tập `graduation-cap` · Quà tặng `gift` · Bảo hiểm `shield` · Khám chữa bệnh `stethoscope` · Thuế `scale` |
| **Hóa đơn** `receipt` | Dọn dẹp `spray-can` · Điện `zap` · Gas `flame` · Rác `trash-2` · Mạng / ĐT / TV `wifi` · Nước `droplet` |
| **Chung** `tag` | (no subs) the "uncategorized" fallback |
| **Cho vay** `hand-coins` (expense) · **Đi vay** `handshake` (income) | loans |
| **Income:** Lương `wallet` · Thưởng `trophy` · Lãi `piggy-bank` · Thu nhập khác `coins` | (owner approved an income set; exact four are my call) |

All icon names were checked against the installed lucide-react 1.63.0.

**Rules (owner-decided):**
- Every user and every group has the whole list. Nobody can delete or rename a fixed category, or change its icon or parent.
- New users start with the fixed list only (it replaces today's starter seeding in `apps/api/src/personal/starterCategories.ts` and the `GROUP_STARTERS` in `groupLinks.ts`).
- Existing users keep their own categories and their transactions stay where they are.
- **Merge:** on the categories screen a user can merge one of their own categories into a fixed one. Its transactions (and group-link overrides) move over, and the custom category is removed. Reuse the existing delete-with-`moveTo` path from #151 (`DELETE /me/personal/categories/:id?moveTo=`).
- **Hide:** a user can switch off any fixed category. It disappears from their own pickers, and existing transactions with it still display normally (existing `hidden` flag).
- **Groups use the fixed list only.** Hiding a fixed category in your Sổ chi tiêu does **not** hide it in the group form's picker.
- Old starter categories that aren't in the fixed list (Đầu tư, Phí & lệ phí with Thuế/Phí, Thu nhập khác › Thưởng / Staking, Cổ tức, Nhóm…) become ordinary custom categories for existing users, to keep or merge.

**My calls:**
- **Storage.** The fixed list is defined in code in `@cc/core` (keys, names, icons, parents, order). Each user gets real `personal_categories` rows for it, marked with a new nullable `system_key` column (unique per user), so `personal_transactions.category_id` and `personal_group_links.category_id` keep working unchanged. The API refuses delete/rename/icon/parent edits on rows with a `system_key`, and allows `hidden`. The fixed rows are created lazily, the same way starters are today.
- **Adopting existing rows.** On first sync, an existing user's old **starter** row (matched by its starter id, `${userId}:<starterKey>`, never by name) whose key maps to a fixed entry (food → Ăn uống, transport → Di chuyển, lend → Cho vay, borrow → Đi vay, salary → Lương, interest → Lãi, other-income → Thu nhập khác) gets that `system_key` instead of a duplicate being created. Its transactions keep their category. Name, icon and parent are reset to the fixed values. Rows a user created themselves are never adopted, even with the same name.
- **No silent re-parenting.** Starters whose parent differs from the fixed list (Thuế under Phí & lệ phí) are not adopted. They stay custom where they are. Custom children under an adopted fixed parent (e.g. Thưởng / Staking under Thu nhập khác) stay as custom children. Custom sub-categories under fixed parents are allowed.
- **Default for group spending.** The existing per-user `defaultGroupCategoryId` stays. For new users it defaults to **Chung**. Existing users keep whatever they have set (usually "Nhóm").

## 2. Danh mục on group expenses

- A group transaction (`transactions`) gets a nullable `category_key` (a fixed-list key). It is set from the shared form's danh mục icon and follows the expense's existing edit and approval rules. *(my call: no admin-only restriction beyond what editing an expense already requires)*
- **Only `type = 'expense'` rows get a danh mục.** Fund income and payments don't, and the API rejects `category_key` on them, and rejects keys that aren't expense-type. *(my call)*
- **Nothing picked → `category_key` stays null.** "Chung" is only what the icon shows. That way a member's default for group spending still applies to new expenses. *(my call)*
- **Vay/Nợ tab (owner-decided):** a danh mục picked there sets the group's `category_key` **and** replaces the automatic Cho vay / Đi vay on the user's own copy. With nothing picked, the copy is filed as Cho vay / Đi vay by who paid, as today. Either way the link keeps `intent = 'loan'`, so debt tracking and balances are unchanged. Only the category differs. *(my call: the payer flip only re-picks Cho vay ↔ Đi vay while no danh mục is chosen)*
- **Chi shared with people** (EntryPage creating a group expense, Chi/Thu otherwise unchanged): if the entry's personal category is a fixed one, its key is sent as the group's `category_key`. If it's custom, null is sent. *(my call)*
- Which category a member sees for a group expense in their Sổ chi tiêu (owner-decided order):
  1. their own override (`personal_group_links.category_id`, set when they edit their copy),
  2. else the group expense's `category_key`, resolved to their row with that `system_key`,
  3. else their default for group spending (`defaultGroupCategoryId`).
- Overriding on the member side never changes the group's category.
- Group lists and details (`GroupTxRow`, `GroupRowSheet`, transaction detail) show the danh mục icon. *(my call: icon only where a row currently shows a generic group icon. The exact spot is left to the builder.)*

## 3. Nội dung (note) on group expenses

- Today the group form's single text field is labelled "Nội dung" but is really the title (`transactions.description`).
- It becomes the **title** field. A new nullable `note` column on `transactions` holds the separate optional **Nội dung**.
- Existing expenses keep their text as the title, with an empty Nội dung. *(my call)*
- The note goes through the API views, the approval/proposal flow (so a pending edit can change it) and shows on the transaction detail. *(my call: the detail shows it under the title when it isn't empty)*

## 4. The shared expense form

Used by group "Thêm/Sửa khoản chi" (`expenses/new`, `expenses/:expenseId/edit`), "Khoản chi nhanh" (direct preset, same routes) and the Vay/Nợ tab of `EntryPage`. The group fund (`fund/:incomeId/edit`, `fromFund`) and sport sessions keep their extra sections, placed inside this layout.

```
┌──────────────────────────────────┐
│ ←  Sửa khoản chi    (or tabs)    │  entry page keeps its Chi|Thu|Vay/Nợ tabs
├──────────────────────────────────┤
│ [🍜]  Ăn tối quán nướng__________ │  title (required); icon button opens danh mục
│ ┌──────────────────────────────┐ │
│ │ Số tiền                      │ │  Chi/Thu amount box
│ │                 350.000 đ    │ │
│ └──────────────────────────────┘ │
│ ┌──────────────────────────────┐ │
│ │ Người trả          Nhân    › │ │  always visible
│ │ Ngày           25/11/2026  › │ │  always visible
│ │ Ví             Tiền mặt    › │ │  Sổ chi tiêu only
│ └──────────────────────────────┘ │
│ Với ai?  (An)(Bình)(Nhân)(+)     │  Chi/Thu people chips
│ Chia đều · 3 người          ›    │  split modes (+ sport rule)
│ An và Bình nợ bạn 233.333 đ      │  outcome sentence
│ [ sport / fund sections ]        │  only for those groups
│ ┌──────────────────────────────┐ │
│ │ Nội dung   [ghi chú thêm…  ] │ │  optional
│ └──────────────────────────────┘ │
├──────────────────────────────────┤
│ [ keypad while amount focused ]  │
│ [             Lưu             ]  │
└──────────────────────────────────┘
```

Owner-decided:
- A clear **title on top**. **Nội dung** is a separate field.
- The **danh mục icon sits next to the title.** It is small and secondary, never the Chi/Thu tile grid.
- **Người trả and Ngày are always shown.**
- Components look like the Chi/Thu page.

My calls:
- The title is required, and Nội dung is optional. With no danh mục picked, the icon shows **Chung**.
- The danh mục icon opens a sheet (`Sheet` wrapper) listing the fixed list grouped by parent, with a search like the existing `CategoryPicker`. In Sổ chi tiêu it also lists the user's visible custom categories. In a group it lists the fixed list only.
- Amount entry reuses the Chi/Thu amount box (`AmountField`). *Revised during build:* the group form types into it on every device (no docked keypad) and keeps its "180k" / "1,5tr" shorthand alongside sums like "120000+35000", plus the "1.500.000₫" preview and hint. The Vay/Nợ tab keeps the Chi/Thu keypad as today.
- Người trả defaults to the current user and Ngày to today. *Revised during build:* in the group form Người trả is a labelled native select inside the details card (one tap opens the system picker on phones). The Vay/Nợ tab opens a `PayerSheet`. Ngày uses `EntryDateRow`. The Vay/Nợ tab's existing payer handling (`quickSplit.payerId`, flip in the outcome sentence) maps onto the Người trả row.
- The split section reuses the Chi/Thu `SplitWithPeople` / `SplitFold` / `OutcomeSentence` pieces. The group's modes (đều / số tiền / phần / sport) open from the "Chia đều · 3 người ›" row. Per-person amount rows, "left" badges, guest note and gone-member errors keep working.
- Ví shows only on the Sổ chi tiêu side, as today.
- **Implementation shape is left to the builder,** for example extracting shared pieces into `libs/web/screens/src/components/` used by both `ExpenseForm` and `EntryPage`, or one new form component. Constraint: behaviour of existing flows (approval, proposals, gone members, fund check, sport extraction from image, planning/complete sport modes) is unchanged.
- Keep existing `fsl-*` classes and `data-testid`s on the same elements wherever the element survives. Where an element changes shape, update the affected tests deliberately and list them in the PR.

## 5. Categories screen

- Fixed categories are shown with a lock/"built-in" marker and a hide switch, and no delete, rename or icon edit.
- Custom categories get a **"Gộp vào…"** (merge into) action that picks a fixed category. Confirm first, then reuse the `moveTo` delete. It is an icon button, per the "icons for obvious actions" rule.
- Hidden fixed categories are listed in a "Đã ẩn" section so they can be switched back on. *(my call)*

## Left to the builder

- Exact keys for the fixed list, and the sort order within groups.
- Migration numbering and SQL, the backfill/adoption job (lazy on first categories GET, like today's seeding, is fine).
- How the group picker and the personal picker share code.
- Copy wording beyond the names above (vi + en, marked `// REVIEW` like the existing entries).
- Test plan: API tests for locked fixed rows, adoption, merge into fixed, group `category_key`/`note` round-trip and resolution order. Screen tests for the shared form on all three entry points, plus sport and fund regressions.
