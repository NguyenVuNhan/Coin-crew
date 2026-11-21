# Per-wallet visibility for categories and assets (issue #130)

Date: 2026-11-21. Status: draft for owner approval.

## Why

The owner records investment trades in a Binance wallet. Today the entry page there offers everything:
- **assets:** ETF, gold and stocks, which never trade on Binance
- **categories:** Ăn uống, Mua sắm, Thể thao, which make no sense on an exchange wallet

Each wallet should offer only what belongs in it, without the owner doing per-item chores.

The Part 2 critique (2026-11-18) also found that one buy can be recorded two ways. On an investment wallet, the Đầu tư spending sub-categories (Cổ phiếu, Crypto, ETF, Vàng) sit next to "Mua tài sản". Part 1's hard-coded rule (`investingIds` in `libs/web/screens/src/components/CategoryPicker.tsx`) hides Đầu tư tiles on **everyday** wallets. That is backwards.

## Goals

- Each wallet shows a chosen set of categories and assets on the entry page: the tiles, the "Khác"/"Thêm" sheet and the asset picker.
- Most owners never touch the setting. **Defaults by wallet kind** do the work.
- When the owner does change it, a **wallet** can be set up from one screen. Making one item wallet-specific is a quick extra on the item's own edit sheet.
- Each buy has one way to be recorded:
  - on an investment wallet, buying is "Mua tài sản" (a holding)
  - on an everyday wallet, buying an ETF from the bank app is plain spending under Đầu tư (spec W7, owner-confirmed 2026-11-21)

## Non-goals

- Hiding entries from history, lists, search, filters or reports. Visibility only limits what the entry page **offers** for new entries.
- Per-wallet visibility for tags.
- Renaming or moving existing categories, or migrating old entries.

## Anti-goals (a failure even if it works)

- Setting up Binance means opening 15+ category sheets one by one.
- An existing entry loses its category or asset label anywhere, or can't be edited because its category is now hidden in its wallet.
- A new crypto asset or a new sub-category needs a separate trip to the visibility setting before it shows in the right wallets.

## What the owner decided

1. **The wallet is the main place to set it** ("Hiện trong ví này"), with **defaults by wallet kind**. The category and asset edit sheets get a small "Hiện ở ví" row as a secondary shortcut. (Option C, wallet-led.)
2. **Starter categories are reshaped** (owner, 2026-11-21):
   - **A new top-level expense parent "Phí & lệ phí"** (Fees & charges) holds **Thuế** and **Phí**, which are today's top-level starters, moved under it. Trading taxes and fees are recorded here, in any wallet.
   - **Đầu tư has no sub-categories by default.** New users get the Đầu tư parent alone. Existing users keep the Cổ phiếu/Crypto/ETF/Vàng subs they already have, and their entries, untouched.
   - **A new income sub "Thưởng / Staking"** goes under **Thu nhập khác**, for staking and exchange rewards.
3. Buying an ETF from a bank wallet stays **plain spending** under Đầu tư (W7). It does not go through the buy flow.
4. Existing entries keep their category ids. Moving Thuế and Phí under the new parent changes only where they appear in the tree.

## Behaviour

### Defaults by wallet kind

When a wallet is created, it gets the default for its kind:

- **Everyday wallet:** every category and every asset shows. (Assets only matter on investment wallets today; the asset picker is gated on `kind === 'investment'` or trade mode.)
- **Investment wallet:**
  - *Expense categories:* only **Phí & lệ phí** (Thuế, Phí) shows. Everything else is hidden: Ăn uống, Di chuyển, Mua sắm, Hóa đơn, Sức khỏe, **Đầu tư** and its old subs, and the owner's own top-level expense categories.
    - *My call:* Đầu tư is hidden on investment wallets. Now that fees live under Phí & lệ phí, a bare Đầu tư tile next to "Mua tài sản" would bring back the two-ways-to-record-a-buy problem the critique found. Đầu tư still shows on every everyday wallet, and the owner can switch it on for any investment wallet.
  - *Income categories:* all show. (Lãi, Cổ tức and Thu nhập khác all happen on exchange wallets; Lương rarely does but is harmless.) *Builder's call: keep income all-visible.*
  - *Assets:* all show. The app can't know Binance is crypto-only, so the owner turns groups off once.

**Existing wallets at release** get their kind default automatically, because defaults are computed at read time (see Data). Binance turns lean on day one. Everyday wallets show everything, which is today's behaviour minus the old rule.

**Changing a wallet's kind** switches it to the new kind's defaults. Anything the owner set explicitly stays as they set it.

### "Hiện trong ví này": the wallet's own setting

- **Entry point:** a row on the wallet screen (`WalletScreen`) or in the wallet edit sheet (`WalletForm`) opens a `Sheet` (the app wrapper: bottom drawer on phones, dialog from 640px). *Builder's call* which entry point: pick whichever sits better beside the existing wallet actions, following DESIGN.md.
- **Two grouped lists** (white `rounded-xl` grouped lists, no nested cards):
  - **Danh mục:** split into Chi and Thu, each listing top-level categories with a switch. A parent with sub-categories has its switch plus an expand control that shows each sub-category with its own switch.
    - Turning a parent off or on sets the parent and all its subs.
    - A parent with mixed subs shows a partial state, e.g. "2/4" next to the switch. The parent's switch acts on the parent row only; see the open question in Data. *Builder's call* how the partial state looks.
  - **Tài sản:** grouped by `group_name` (Crypto, Cổ phiếu, ETF, Vàng, custom groups), with a group switch and an expand control for single assets, working the same way.
- Globally hidden items (`hidden = 1`) are left out of this sheet, or shown dimmed and not switchable. They're hidden everywhere anyway. *Builder's call.*
- **Saving:** changes apply as they're made (optimistic, with undo through the existing `Snackbar` on failure) or on a Save button. *Builder's call*, following how other personal-money sheets save.
- Touch targets ≥44px, switches labelled with the item name for screen readers, focus returns to the opener on close.

### "Hiện ở ví": on each category and asset edit sheet

- A row in the category edit sheet (`CategoryFormSheet` in `CategoriesScreen.tsx`) and in `AssetForm`. It shows a summary: "Tất cả ví", "Chỉ Binance", "Binance, MB" (a count once it's long), or "Không ví nào".
- Tapping it opens a small sheet: a checklist of the user's non-archived wallets.
- It reads and writes the same data as the wallet sheet, so the two always agree.
- For a parent category, changing the wallets applies to the parent and all its subs, just like the wallet sheet's parent switch.

### New items inherit

- **New sub-category:** copies its parent's wallet visibility.
- **New top-level category:** gets each wallet's kind default. Expense categories are hidden in investment wallets; income categories show everywhere. *My call*, so Binance stays lean when the owner adds e.g. "Cà phê".
- **New asset:** for each wallet, it's hidden if every existing asset in its group is hidden there; otherwise it shows. A new group, or an empty one, shows everywhere. So adding SOL to Crypto shows it on Binance, and if Crypto is off on the bank wallet it stays off there.
- **New wallet:** kind default (above).

### Entry page

- The category tiles, the "Thêm"/"Khác" sheet (`CategoryPicker`) and the asset picker (`AssetPicker`) offer only items visible in the **selected wallet**. When the owner switches wallets mid-entry, the offered set updates.
  - If the chosen category isn't visible in the new wallet, it **stays selected** and still shows as a tile. That's the same behaviour the picker already has for `value`. The owner switching wallets shouldn't silently lose their pick.
- **Editing an existing entry** whose category or asset is hidden in its wallet still shows that item as selected and saves fine.
- **Transfers:** visibility applies to the source wallet's entry page only. Transfers carry no category, so there's nothing to filter.
- **Remove the old rule:** `investingIds` and the `walletKind` prop's blocking go away. The kind defaults replace them.
- The Part 1 test `entry-critique-step5.test.tsx` ("recent tiles skip investing categories on an everyday wallet…") pins the old rule. Rewrite it to pin the new behaviour: on an investment wallet with defaults, Đầu tư is not offered and Phí & lệ phí › Thuế/Phí are. On an everyday wallet, Đầu tư is offered. This is the one existing test that may change, and only because the issue replaces the rule it pins.

### History stays whole

Transaction lists, search, filters, detail, wallet history and holdings are untouched. Every category and asset resolves and shows in every wallet's history.

## Data and API

- **Model: defaults computed at read time; rows store only the owner's overrides.** *My call* (after the builder check). The kind defaults are a pure function of (wallet kind, item). The table only records where the owner overrode that default:

  ```
  effective visible = override row's `visible` ?? kindDefault(item, wallet.kind)
  ```

  Why this beats storing defaults as rows:
  - **Kind changes work.** Changing a wallet's kind (`PATCH /me/personal/wallets/:id` accepts `kind`) flips the defaults automatically, and the owner's explicit changes stay.
  - **Lazy starter seeding is safe.** Starter categories are seeded lazily on the first `GET /me/personal/categories`, so a wallet can exist before its categories do. Defaults computed at read time are still right.
  - **The migration writes no default rows.**

  "No rows means visible everywhere" from the issue still holds for assets and for everyday wallets. On investment wallets, no rows means the investment default.
- **Tables:** two tables, so each FK cascades properly:

  ```
  personal_category_visibility(user_id, wallet_id, category_id, visible 0|1)
  personal_asset_visibility(user_id, wallet_id, asset_id, visible 0|1)
  ```

  - PK is (wallet_id, item_id), with an index on (user_id).
  - FKs cascade on wallet and item delete. The category `moveTo` delete path and the asset delete paths get cleanup for free.
  - A row whose `visible` equals the current default may be deleted or kept. *Builder's call.*
- **`kindDefault` for categories:**
  - *Everyday wallet:* always visible.
  - *Investment wallet:* use the category's root. Starter ids are stable as `${userId}:${key}`, so key on the root starter `key`:
    - the root `fees` (Phí & lệ phí) is visible, and its children follow
    - any other expense root, including `invest` and the owner's own, is hidden, and its children follow
    - income categories are visible
- **`kindDefault` for assets:** always visible.
- **Rows exist for parents and subs alike.** The parent switch in the UI writes overrides for the parent and its children. There's no "hidden via parent" rule at read time.
  - When a parent is hidden and one sub is switched back on, the parent stays hidden and the sub shows on its own. *Builder's call* how the "Thêm" sheet groups such a sub (e.g. under its parent's heading, greyed).
- **Inheritance with this model:**
  - A new sub-category copies its parent's override rows. Its default already follows its root.
  - A new asset gets a `visible = 0` override in each wallet where every existing asset in its group is hidden.
  - A new top-level category needs no rows; its default does the work.
- **Migration:** hand-written SQL, the next number after `0029_personal_sync.sql` in `apps/api/migrations/`. It creates the two tables, then reshapes the starter categories for existing users. Every step is idempotent (`INSERT OR IGNORE`, guarded `UPDATE`):
  1. For each user who has `${userId}:tax` or `${userId}:fee`, insert the parent `${userId}:fees` ("Phí & lệ phí", expense, a fitting lucide icon, e.g. `receipt-text`; *builder's call*) at the old Thuế sort position.
  2. Re-parent `${userId}:tax` and `${userId}:fee` under it, but only where they're still top-level. If the owner already moved one, leave it.
  3. For each user who has `${userId}:other-income`, insert `${userId}:other-income-reward` ("Thưởng / Staking", income, parent `other-income`).
  4. Leave the existing Đầu tư subs alone.
  5. Bump each affected user's personal sync version. Apply `--local` for the tunnel; commit only when the owner says.
- **Starter categories:** reshape `STARTER_CATEGORIES` (`apps/api/src/personal/starterCategories.ts`) so new users get the same tree through the existing lazy seeding:
  - add the `fees` root
  - put `tax` and `fee` under it
  - remove the four `invest-*` subs
  - add `other-income-reward` under `other-income`

  Check that categories with no parent of their own still make sense as tiles: the parent Phí & lệ phí is selectable like any parent.
- **Sync:** *my call*, these tables do **not** join the versioned transaction sync. Today only transactions sync; categories, assets and wallets just bump the version. Do the same: every visibility write goes through `commitPersonalWrite` to bump the version, and the rows ride on the existing categories and assets responses.
- **Routes**, all behind `requirePersonal` and scoped to the user:
  - **Read:** include the override rows in the categories and assets list responses the entry page already loads (e.g. `walletOverrides: {walletId, visible}[]` per item). Don't add a per-wallet fetch on every wallet switch; it would eat into the D1 read budget.
  - `PUT /me/personal/wallets/:id/visibility` with a body `{ categories: {id, visible}[], assets: {id, visible}[] }`.
  - `PUT /me/personal/{categories|assets}/:id/wallets` with the wallet ids it shows in. For a category parent this applies to its subs too.
  - Another user's wallet, category or asset id gives **404**. Archived wallets keep their rows. The edit sheet's checklist offers non-archived wallets only.
- **Shared logic** (`@cc/core`): `isVisibleIn(walletId, item, hiddenRows)` and the kind-default and inheritance rules, so the API (defaults on create, inheritance) and the web (filtering pickers) agree.
- **Data access** (`@cc/web-data-access/personalMoney`): React Query hooks for reading and the two writes, invalidating categories, assets and wallet data.

## Copy (Vietnamese first; new lines marked `// REVIEW` in `vi.ts`)

- Wallet sheet title: "Hiện trong ví này". Sections: "Danh mục" (Chi / Thu) and "Tài sản".
- Item row: "Hiện ở ví". Summaries: "Tất cả ví", "Chỉ {wallet}", "{n} ví", "Không ví nào".
- New starter names: "Phí & lệ phí" and "Thưởng / Staking". *My Vietnamese wording; the owner can rename.*

## Left to the builder

The exact placement of the wallet entry point, the partial-switch visuals, live save vs. Save button, how globally hidden items appear in the wallet sheet, and where the visibility data rides on the wire within the read budget. All of it within DESIGN.md, the shadcn components already in `libs/web/ui`, and the `fsl-*`/`data-testid` conventions.
