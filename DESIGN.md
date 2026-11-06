---
name: CoinCrew (Tiền Đâu)
description: Split group costs with friends and settle up with VietQR; phone first, shared through Zalo, saved to the home screen.
colors:
  primary: "#0f766e"
  primary-foreground: "#ffffff"
  secondary: "#ccfbf1"
  secondary-foreground: "#134e4a"
  theme-orchid-primary: "#a21caf"
  theme-sky-primary: "#0369a1"
  theme-indigo-primary: "#4338ca"
  background: "#f6f7f4"
  card: "#ffffff"
  foreground: "#1c1917"
  muted: "#efefeb"
  muted-foreground: "#57534e"
  subtle-foreground: "#78716c"
  accent: "#f5f5f4"
  border: "#e7e5e4"
  input: "#d6d3d1"
  success: "#047857"
  success-soft: "#d1fae5"
  danger: "#be123c"
  danger-soft: "#ffe4e6"
  destructive: "#be123c"
  warning: "#b45309"
  warning-soft: "#fef3c7"
  warning-border: "#fcd34d"
  warning-foreground: "#78350f"
  avatar-1: "#fde68a"
  avatar-1-fg: "#78350f"
  avatar-2: "#bfdbfe"
  avatar-2-fg: "#1e3a8a"
  avatar-3: "#fecdd3"
  avatar-3-fg: "#881337"
  avatar-4: "#bbf7d0"
  avatar-4-fg: "#14532d"
  avatar-5: "#99f6e4"
  avatar-5-fg: "#134e4a"
  avatar-6: "#ddd6fe"
  avatar-6-fg: "#4c1d95"
typography:
  display:
    fontFamily: "Be Vietnam Pro, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.2
    fontFeature: "tnum"
  headline:
    fontFamily: "Be Vietnam Pro, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.4
  title:
    fontFamily: "Be Vietnam Pro, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.556
  body:
    fontFamily: "Be Vietnam Pro, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: "Be Vietnam Pro, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.429
  label:
    fontFamily: "Be Vietnam Pro, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.429
  caption:
    fontFamily: "Be Vietnam Pro, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.333
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
  4xl: "32px"
  full: "9999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "0 20px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "#0f766ee6"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "0 20px"
    height: "44px"
  button-danger:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "0 20px"
    height: "44px"
  button-ghost:
    textColor: "{colors.foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "0 20px"
    height: "44px"
  button-ghost-hover:
    backgroundColor: "{colors.muted}"
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.xl}"
    padding: "4px 12px"
    height: "44px"
  grouped-list:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.xl}"
  summary-card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
    padding: "20px"
  list-row:
    textColor: "{colors.foreground}"
    typography: "{typography.body-sm}"
    padding: "12px 16px"
    height: "44px"
  pill-neutral:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.full}"
  pill-accent:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    rounded: "{rounded.full}"
  pill-success:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.success}"
    rounded: "{rounded.full}"
  pill-danger:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
    rounded: "{rounded.full}"
  pill-warning:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.warning-foreground}"
    rounded: "{rounded.full}"
  avatar:
    rounded: "{rounded.full}"
    size: "36px"
  screen-header:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.title}"
    height: "56px"
  nav-bar:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.full}"
    padding: "6px"
  nav-item-active:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.full}"
    size: "44px"
  nav-add:
    backgroundColor: "{colors.foreground}"
    textColor: "{colors.background}"
    rounded: "{rounded.full}"
    size: "56px"
  sheet:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.4xl}"
  snackbar:
    backgroundColor: "{colors.foreground}"
    textColor: "{colors.background}"
    rounded: "{rounded.2xl}"
    height: "48px"
  gender-pill:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.full}"
    height: "28px"
    size: "44px"
  add-bar:
    backgroundColor: "{colors.card}"
    height: "72px"
---

# Design System: CoinCrew (Tiền Đâu)

## Overview

**Creative North Star: "The Friendly Ledger"**

CoinCrew is bookkeeping you'd happily show your friends. The sums are exact and easy to read, and nothing about money feels stern. Every screen is a ledger page: white grouped lists on Rice Paper, one name per row, the amount at the right edge. Teal is the one confident colour, and Leaf, Lychee and Turmeric say only whether money is coming in, going out, or waiting. The tone is calm: round pills, soft pastel avatars, and generous 44px touch targets. That calm never slows anyone down. The surfaces are light and quick, because people are on a phone in a group chat and want to be done in a minute.

The system is shadcn/ui on Tailwind v4, themed in one stylesheet (`libs/web/ui/src/styles/globals.css`). It is phone first: a single 480px column with a floating bottom nav. From 1024px a side nav appears and a few screens widen to two columns. Depth comes from white on warm off-white, not from shadows. Two looks are rejected: the stock shadcn demo (black buttons, sharp grey borders) and anything that reads as a corporate bank app or a dense spreadsheet.

There are four light themes: Jade (the default, everything above), Orchid, Sky and Indigo. Signed-in people pick their own, and a group's admin can pick the group's colours, which win inside that group. A theme changes only the accent and a faint wash on the page; colour lives only in theme tokens, so a theme is a token swap.

**Key Characteristics:**
- Warm off-white page, white `rounded-xl` grouped lists, no nested cards
- Pill buttons, 44px tall, semibold labels
- One accent per theme (Jade by default; Orchid, Sky, Indigo); money states in Leaf, Lychee, Turmeric in every theme
- Money always in `tabular-nums`; the balance is the loudest thing on screen
- Pastel initial avatars, picked by name
- Flat surfaces; shadows only on things that float
- Fast, small motion (100–200ms, ease-out) that respects reduced motion

## Colors

One teal accent on warm stone neutrals, with three soft money-state hues. Each colour is named by role in code (`bg-primary`, `text-success`); the names below say what it is.

### Primary
- **Jade** (`primary`): the one confident colour. Primary buttons, the focus ring, the "owed to you" balance, links, active states. White text on it passes AA.
- **Jade Mist** (`secondary`) with **Jade Ink** (`secondary-foreground`): soft-teal pills for secondary buttons, the active nav item, accent pills and empty-state icon tiles.

### Themes
Each theme is a `[data-theme='<id>']` block in `globals.css` that sets six tokens and nothing else. `data-theme` sits on `<html>`, so sheets and other portals follow it.

| Theme | Page wash (`background`) | Accent (`primary`) | Mist (`secondary`) | Ink on mist (`secondary-foreground`) |
|---|---|---|---|---|
| **Jade** (default) | Rice Paper `#f6f7f4` | `#0f766e` | `#ccfbf1` | `#134e4a` |
| **Orchid** | `#fbf6fb` | `#a21caf` | `#fae8ff` | `#701a75` |
| **Sky** | `#f4f8fb` | `#0369a1` | `#e0f2fe` | `#0c4a6e` |
| **Indigo** | `#f6f6fb` | `#4338ca` | `#e0e7ff` | `#312e81` |

- **Text on accents:** `primary-foreground` is white in every theme. `ring` matches `primary`.
- **What follows the theme:** buttons, the active nav item, accent pills, links, the focus ring, the "owed to you" balance, and the faint wash on the page and the header. Cards, lists, sheets and fields stay white.
- **Who picks:**
  - Signed-in people pick theirs in the account menu → Theme.
  - A group's admin picks the group's colours in Group settings → Group colours. The default there is "Each person's own theme".
  - Inside a group, its colours win for everyone, guests included. Elsewhere, people see their own theme, and guests see Jade.
- **Remembered on the device:** the personal theme is cached on the phone (`localStorage` key `theme`), so the first paint already uses it. Signing out forgets it.
- **Status bar:** the phone's status bar (`<meta name="theme-color">`) follows the accent of the theme in view.
- **Adding a theme:** it must pass AA for every text pairing, and its accent must sit at least 30° of hue away from Leaf, Lychee and Turmeric. `libs/web/ui/src/styles/__tests__/theme-tokens.test.ts` checks both.

### Tertiary (money states)
- **Leaf** (`success`, soft fill `success-soft`): money owed to you, paid, settled, confirmed.
- **Lychee** (`danger`, soft fill `danger-soft`; `destructive` for buttons): money you owe, and removing or disabling something.
- **Turmeric** (`warning`, `warning-soft`, `warning-border`, text `warning-foreground`): waiting for approval, needs action, pending.

### Neutral
- **Rice Paper** (`background`): the page behind everything, and the sticky screen header.
- **White Card** (`card`): grouped lists, fields, sheets, the bottom bar, the nav pill.
- **Ink** (`foreground`): body text and titles. The dark nav "+" button and the snackbar invert it.
- **Stone Muted** (`muted-foreground`): meta lines, section labels and hints, safe on both Rice Paper and white.
- **Stone Subtle** (`subtle-foreground`): quieter hints, **on white only**.
- **Muted Fill** (`muted`) and **Hover Fill** (`accent`): neutral pills, ghost hovers, image placeholders.
- **Hairline** (`border`): dividers inside grouped lists, the header's bottom edge, the bottom bar's top edge. **Field Edge** (`input`): the outline of text fields.
- **Avatar pastels** (`avatar-1` … `avatar-6`, each with an `-fg` ink of the same hue): butter, sky, blush, mint, seafoam, lavender. They are picked from the person's name, so the same person always gets the same colour.

### Named Rules
**The One Source Rule.** Every colour comes from a theme token in `globals.css`; a component never carries a raw hex. The four themes (Jade, Orchid, Sky, Indigo) are token swaps in `[data-theme]` blocks, and any new theme must be one too, never a rewrite. `libs/web/screens/src/test/style-guard.test.ts` enforces this.

**The Money Means Something Rule.** Leaf, Lychee and Turmeric mean money in, money out, and waiting. Never use them for decoration, and never let the accent of a future theme be mistaken for one of them. Turmeric is only for waiting or needs action. A tip, a transfer memo, a table total or a trophy is never Turmeric. Plain notes use Jade Mist (`bg-secondary text-secondary-foreground`), totals use Muted Fill, and a destructive action is a Lychee-text ghost button with a faint Lychee outline, never red on Jade Mist. The one exception is rating stars: the vote stars and their sparks are Turmeric gold, as people expect stars to look.

**The Fixed Money Rule.** Themes never touch the money colours (Leaf, Lychee, Turmeric) or the avatar pastels. A theme block that sets `--success*`, `--danger*`, `--warning*` or `--avatar-*` fails the token test. "You owe", "paid" and "waiting" must read the same in every theme.

**The Rice Paper Rule.** `subtle-foreground` sits on white only. On the Rice Paper page, quiet text uses `muted-foreground`.

## Typography

**Font:** Be Vietnam Pro (with system-ui, -apple-system, Segoe UI, Roboto, sans-serif), self-hosted through `@fontsource` in weights 400, 500, 600 and 700. It is one family for everything.

**Character:** a friendly sans drawn for Vietnamese, so diacritics stack cleanly on names like Dũng and Nguyễn. The hierarchy comes from weight and a short size scale, not from a second typeface.

### Hierarchy
- **Display** (700, 30px): the balance hero amount ("owed to you" in Jade, "you owe" in Lychee). It is the only display use.
- **Headline** (600, 20px): the landing headline and the few in-content page headings.
- **Title** (600, 18px): the screen header title (centred, or left-aligned in the Zalo Mini App), sheet and dialog titles, detail titles, the settled-up line.
- **Body** (400, 16px): main text and every input, select and text area (never smaller, or iOS zooms).
- **Body small** (400, 14px): the workhorse size, used for row meta lines, descriptions and most UI text. Row titles use it at 600.
- **Label** (600, 14px, Stone Muted): section headings above grouped lists ("Recent") and button labels.
- **Caption** (400, 12px): small hints, badges, per-row extras.

### Named Rules
**The Tabular Money Rule.** Every amount is set in `tabular-nums` and formatted `1.245.000₫`, so columns of money line up and digits don't jump as they change.

**The Weight Not Size Rule.** Emphasis comes from 600 weight inside the 12–20px range. Only the balance goes bigger.

## Layout

The layout is phone first, one column. Screen content sits in a centred column at most 480px wide, padded 16px. A few screens opt into a wide layout that grows to 1040px from 1024px.

- **Spacing:** a 4px grid. 8px and 12px gaps are the everyday rhythm; 16px separates blocks. Sections stack as label + grouped list, with a 4px inset on the label.
- **Screen frame:**
  - a sticky header (56px, Rice Paper, hairline bottom edge) with a 44px round back button and the title
  - the content
  - an optional fixed bottom action bar (white, hairline top edge, about 72px plus the safe area) for a screen's main action
- **Phones (below 1024px):** navigation is a floating white pill (home, groups, activity) about 16px above the bottom edge, next to a dark 56px round "+" button. Content keeps room underneath so nothing hides behind it.
- **From 640px (`sm`):** bottom sheets become centred dialogs.
- **From 1024px (`lg`):** "layout A". A 240px white side nav with a hairline right edge replaces the floating pill. The bottom action bar becomes part of the page flow.
- **Safe areas:** iOS safe-area insets are added to fixed bars (the page uses `viewport-fit=cover`). Inside the Zalo Mini App the header also clears Zalo's top inset and its capsule button on the right.
- **Home screen:** saved to the home screen, the app runs standalone with no browser bar, a status-bar colour that follows the theme in view, and a Rice Paper launch screen. The app's own header, back button and nav are the only way around there. The launch colours in the PWA manifest (`apps/web/vite.config.ts`) and the starting `theme-color` in `apps/web/index.html` stay Jade. Once the app runs, `applyTheme` points `theme-color` at the current accent.

## Elevation & Depth

The system is flat by default. Depth comes from tone: white surfaces on Rice Paper, hairline dividers, and soft tinted fills. Grouped lists carry no shadow and no border. Summary cards (the balance, the home total) add a hairline border, never a shadow. Shadows mark things that float above the page.

### Shadow Vocabulary
- **Floating** (`shadow-lg`): the phone nav pill, the "+" button, the snackbar, the floating leaderboard bar.
- **Control** (`shadow-xs`): shadcn form controls such as selects and input groups. It is barely visible.

### Named Rules
**The Float Only Rule.** A shadow means "this floats over the page". Lists, cards and forms sit flat on Rice Paper.

## Shapes

Everything is round and soft; there are no sharp corners in the app's own surfaces. The base radius is 20px.

- **Pills** (`rounded-full`): every button, every pill and chip, the nav pill and its items, avatars, switches, the back button.
- **20px** (`rounded-xl`): grouped lists, summary cards, text fields, info blocks.
- **24px** (`rounded-2xl`): the snackbar, empty-state icon tiles.
- **32px** (`rounded-4xl`): the top of bottom sheets and dialogs.
- **Smaller steps** (8, 12, 16px): reserved for small inner pieces such as image thumbnails and the bank logo tiles.

## Components

Two app layers exist: shadcn parts in `libs/web/ui/src/components/ui/`, and app wrappers in `libs/web/ui/src/components/` (`Button`, `Sheet`, `Modal`, `Pill`, `Avatar`, `Amount`, `Skeleton`, `InlineError`, `Snackbar`, `Icon`). Screens use the wrappers first.

### Buttons
Calm, confident pills that are easy to hit.
- **Shape:** a pill (fully round), 44px tall, 20px side padding, 14px semibold label. Icons sit at 16px.
- **Primary:** Jade with white text. Use one per view, for the main action.
- **Secondary:** Jade Mist with Jade Ink text, for the second action.
- **Danger:** Lychee with white text, for remove or disable.
- **Ghost:** no fill; a Muted Fill appears on hover. Use it for low-key actions in rows and headers.
- **States:**
  - hover shifts the fill a touch (Jade to 90%, Jade Mist slightly darker)
  - keyboard focus draws a 3px soft Jade ring
  - pressing nudges the button down 1px
  - disabled is 50% opacity
  - loading shows a spinning loader before the label
- **Full width:** `block` buttons wrap long Vietnamese names onto two lines instead of overflowing.
- **Links:** an `href` inside the app routes without a page load.

### Pills (status chips)
- **Style:** a fully round pill with a soft fill and a semibold label of the same hue. Five tones: neutral, accent (Jade Mist), success (Leaf), danger (Lychee), warning (Turmeric).
- **Use:** status and counts ("Waiting", fund totals, list-mode chips). Pills are not buttons, with one exception: the gender pill (below).

### Gender pill
- **Style:** a small Muted Fill pill (28px tall, 14px semibold Ink label) with a ♂/♀ icon: "♂ Nam" / "♀ Nữ". Both genders use the same neutral fill: gender never uses a money colour.
- **Tap area:** 44px, by an invisible hit area around the pill; the pill itself stays small.
- **Who taps it:** admins flip anyone (Nam ↔ Nữ, with Undo in the snackbar); a member flips only their own row; guests see plain text. Someone without a gender shows "Set gender", which opens the two choices in a sheet.
- **Where:** every person row in a sport group (People, creating a group). Joining a sport group asks "You play as" with two 44px pill choices instead.

### Add bar
- **Shape:** one row: the name field (16px text) and, in sport groups, "+ Nam" and "+ Nữ" secondary pill buttons; in trip groups one "+ Add".
- **People screen:** docked in the bottom bar, riding above the on-screen keyboard. **Creating a group:** inline under the roster, which lists you first.
- **Flow:** each add clears the field and keeps focus, so the keyboard stays up. Enter adds with the gender last used; pasting several lines adds each line. A snackbar confirms each add ("Added Anh · Nữ") with Undo.
- **Look-alike names** are added, never refused. A small "Like Tuấn Anh? Merge" line sits under the new row, with dismiss.

### Grouped lists and rows
The signature ledger pattern.
- **Container:** white, 20px corners, hairline dividers between rows, no shadow. Never put a card inside a card.
- **Row:** at least 44px tall, 12px × 16px padding.
  - Content runs left to right: a leading avatar or icon tile, a title (14px semibold), a muted meta line, and on the right the amount (semibold, tabular).
  - Status pills sit under the amount.
  - Rows can reveal swipe actions on phones; on desktop, tools show on hover.
- **Section label:** a 14px semibold Stone Muted heading just above the list.

### Summary cards and the balance hero
- **Summary card:** white, 20px corners, 20px padding, a hairline border, no shadow. It holds one headline figure (the group balance, the home total), with the label above it.
- **Balance hero:** the loudest element on a group screen.
  - The label is 14px medium Stone Muted.
  - The amount is 30px bold tabular: Jade when you are owed, Lychee when you owe.
  - When you owe, a full-width Jade "Pay with VietQR" button follows.
  - When everything is settled, an 18px semibold line with a Jade check replaces the amount.

### Pay link pages
What a friend sees after tapping a "pay me" link: what to pay comes first, everything else comes after.
- **"You owe" list** (`/owe`, the reminder's link): a grouped list with one row per person to pay.
  - Each row has an avatar, the name with the amount in Lychee under it, and a "Pay {name}" button on the right. The first button is primary, the rest secondary, and long labels truncate.
  - A payment waiting for confirmation is a row with a Turmeric clock tile and "Waiting for {name} to confirm".
  - Nothing owed shows the "You're all set" empty state.
  - Owing exactly one person skips the list and opens that pay screen.
  - A ghost "See the group" button always ends the page.
- **Bill sheet:** on a bill's pay screen, a full-width secondary "View the bill" button under "I've paid" opens the bill in a `Sheet`, so the QR stays underneath.
- **Session table:** fixed columns sized to fit 320px. Names wrap, amounts never clip, the cost breakdown sits under "Costs", and both per-slot rates share one cell. No sideways scrolling.
- **No share in this bill:** one line, "Nothing for {name} in this bill", then "Not {name}? Switch" (guests only) and "See the group". The bill is never shown in its place.
- **Bank details first:** sharing a "pay me" link without your own bank details suggests adding them and never blocks.
  - In the Invite sheet it is a plain block above Share/Copy, and Share drops to secondary.
  - Before "Share bill & QR" it is a sheet with "Add bank details" (primary) and "Share anyway".

### Leaderboard
- **In the page:** the sport group's ratings widget is a white card holding the podium, or a one-line bar ("#1 Minh 18★ · #2 …") once the person taps collapse. Scrolling never changes its height, so the page never jumps under the finger.
- **Floating bar:** once the widget has scrolled above the screen, a copy of the one-line bar fades in under the header (white, hairline border, `shadow-lg`, up to 480px; below the taller Mini App header too). Phones and tablets only: from 1024px there is room enough without it. Its expand button scrolls back to the widget and opens the podium. Old WebViews without IntersectionObserver get no floating bar.
- **Colour:** the trophy, the crown and the #1 avatar ring are Jade on Jade Mist. Turmeric stays for waiting.

### Avatars
Round initial avatars, 28 / 36 / 96px, in a soft pastel fill with dark text of the same hue. The tone comes from a hash (FNV-1a) of the normalised name, so accents, capitals and spacing don't change it and a group spreads over all six tones. A profile photo replaces them when there is one. Groups show overlapping stacks.

### Inputs / Fields
- **Style:** a white fill, a Field Edge outline, 20px corners, 44px tall, 16px text, 12px side padding.
- **Focus:** the outline turns Jade, with a 3px soft Jade ring.
- **Error:** Lychee outline and ring. Messages appear inline (`InlineError`), next to what failed.
- **Disabled:** 50% opacity.

### Theme picker
- **Where:** a sheet from the account menu's Theme row (your own theme) or from Group settings' Group colours row (admins only).
- **Options:** a two-column grid of swatches. Each one is a mini screen in its own theme: the wash, a thin header strip, an accent pill and a mist chip, with the theme's name underneath.
- **The group picker** starts with "Each person's own theme".
- **Choosing:** the chosen swatch shows a check and a 2px accent ring. A tap saves straight away; there is no Save button. A failed save shows the error under the grid and goes back to the previous choice.

### Sheets and dialogs
On phones a sheet is a bottom drawer: white, 32px top corners, at most 85% of the screen tall, with an 18px semibold title. From 640px the same component opens as a centred dialog up to 448px wide. Always use the `Sheet` / `Modal` wrappers; focus moves in on open and returns on close.

### Navigation
- **Phones:**
  - a floating white pill holding three 44px round icon links (home, groups, activity)
  - the current one gets a Jade Mist fill; the others are Stone Muted and darken on hover
  - beside it sits the dark 56px round "+" button for adding
- **Desktop (from 1024px):** a 240px white side nav with the app name and text links.
- **Header:** sticky on Rice Paper, with the back arrow in a 44px round button.
- **Group page header:** the back arrow, the group name on up to two lines (it wraps, never scrolls sideways), and the 44px gear. Nothing else: Invite lives at the top of People (in the Mini App, Zalo's share plus a "Group links" button for the Invite sheet), and the account menu stays on the groups list and Home.
- **People entry:** the first thing under the header on a member's group page. A white `rounded-xl` row: an overlapping stack of up to four small avatars, "4 people" and a chevron. It opens People.

### Snackbar
A dark Ink pill-card (24px corners) floating above the nav, with the message in tabular figures and a Jade Mist text action ("Undo"). It slides up with a short fade. When the on-screen keyboard is up it rides above it, so a confirmation is seen while typing (the People add bar does the same).

### Motion
Small and quick: 100–200ms, ease-out, with fades and short slides for sheets and toasts. The star ratings have a playful pop, shake and sparks. Reduced motion is honoured at the call site (`motion-reduce:`), and every new animation must do the same.

## Do's and Don'ts

### Do:
- **Do** take every colour from the theme (`bg-primary`, `bg-card`, `text-muted-foreground`, `bg-warning-soft`…), so another colour theme stays a token swap.
- **Do** put content in white `rounded-xl` grouped lists on Rice Paper, with a small semibold Stone Muted label above.
- **Do** make every touch target at least 44px (`min-h-11`), and every field at least 16px text.
- **Do** set money in `tabular-nums`, formatted `1.245.000₫`, coloured by meaning (Leaf, Lychee, Turmeric) or Ink.
- **Do** use the app wrappers (`Button`, `Sheet`, `Modal`, `Pill`, `Avatar`, `Amount`) before raw shadcn parts. Look shadcn parts up with the shadcn MCP and add them with its CLI.
- **Do** keep one primary (Jade) button per view; the second action is secondary or ghost.

### Don't:
- **Don't** let it look like the stock shadcn demo: no black buttons, no sharp grey borders.
- **Don't** let it look like a corporate bank app: no navy or blue-grey palette, dense forms, small type or formal tone.
- **Don't** let it look like a dense spreadsheet (the Excel bill it replaces): no grid lines everywhere, no tiny numbers, no tables of borders.
- **Don't** write raw hex or add a `.css` file per component; `globals.css` is the only stylesheet.
- **Don't** nest cards inside cards, or add shadows to content that doesn't float.
- **Don't** use Leaf, Lychee or Turmeric for decoration.
- **Don't** use shadcn `Drawer` or `Dialog` directly for a sheet; use `Sheet` / `Modal`.
- **Don't** put `subtle-foreground` text on the Rice Paper page.
