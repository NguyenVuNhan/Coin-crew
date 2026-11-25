# Personal money Part 2 polish (#132): design brief

Confirmed by the owner on 2026-11-25 (`/impeccable shape`). Source: issue #132, the 2026-11-18 critique of the Part 2 screens.

## Job and audience

These are Operate-mode screens for the owner's own money: the entry page, transactions, wallet, assets, categories and the filter sheet. The owner uses them on a phone just after paying and on a computer for the weekly review. The goal is precision and consistency. The Friendly look in DESIGN.md stays as it is; this is not a redesign.

## Scope

All the P2s and minors go in one polish PR. The three "ideas" are out of scope and each gets its own issue: implied price on buy, one holdings view, realised gain on sell.

### Already fixed on main (verified 2026-11-25; no work)

- `text-[11px]` on the TransactionRow pill: #147 rewrote the row.
- 24 edit/hide icons on the categories screen: #155 (row tap edits, a Switch hides).
- About 30 chips in the filter sheet: the filter is now pick views (`FilterPickView`).
- The wallet's "Xem tất cả" link: now `min-h-11`.
- "Bắt đầu từ 2026-10-09" on the wallet headline: the start date was removed in #145. The before-start divider already uses `formatShortCalendarDate`.
- "→ Techcombank" on the receiving side in the list: `transactions.directionFrom` is now `← {wallet}`.

### To do

1. **Asset icons** (new, owner-approved packs). Assets get an optional icon, picked from four packs in `libs/web/screens/src/assets/asset-icons/` (crypto 17, stocks 14, gold 12, property 14; each pack has a `manifest.json`). The picker is built like the wallet icon picker: tabs plus search. With no icon set, the asset shows a **letter tile**. The icon value is `<pack>:<slug>`, for example `crypto:btc`.
2. **Trades:**
   - Trade amounts are black (neutral) everywhere, including the entry page while in trade mode.
   - The verb ("Mua" / "Bán") and an in/out icon show the direction. Buy and sell use different icons: a trade row's leading icon is the asset's icon, with a small arrow badge (buy ↙ in, sell ↗ out).
   - The entry page's wallet chip uses the muted fill (`bg-muted`), not `bg-warning-soft`. Turmeric is reserved for "waiting".
3. **Units ("Đơn vị"):**
   - Keep the single field, which already accepts `0,0001`.
   - Show steps with a comma (`0,0001`, never `0.0001`).
   - In lists and the picker, the subtitle of a lot asset reads "lẻ đến 0,0001". For a word unit it reads the unit ("chỉ").
   - The help text says a word unit allows 2 decimals.
4. **"Theo danh mục" view:** a row inside a category section doesn't repeat the category name as its title. It uses its note, else its wallet name, else the generic Chi/Thu word.
5. **Filter sheet:** the category pick view splits categories into **Chi** and **Thu** sections.
6. **Dates:** the trade detail date reads dd/mm/yyyy, not ISO.
7. **Asset rows:** "one place per action", as on categories (#155). Row tap edits, a Switch shows or hides the asset, and delete stays in the row actions. On desktop hover, edit and hide no longer show twice.
8. **Oversell:**
   - The error shows and is announced once, at the quantity field.
   - The copy reads "Chỉ còn {qty} {unit}", for example "Chỉ còn 0,03 BTC".
   - The save button's disabled reason no longer repeats it.
9. **Keypad:** after an asset is picked, the amount keypad closes and focus moves to Số lượng. Số lượng and Ngày are no longer covered.

## Boundaries

- No new colour tokens. Raw hex is allowed only inside the approved SVG files.
- `fsl-*` classes and `data-testid` stay on the same elements.
- Vietnamese copy comes first. New strings get `// REVIEW` and an English twin.
- The Mini App gets these changes only with its next redeploy.
- Don't redraw or rename the approved icons.
