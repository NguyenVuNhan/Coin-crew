# Crew Awards Fullscreen Story Design

**Date:** 2026-11-14
**Route:** `/t/:tripId/awards` (`CrewAwards`)
**Status:** Draft — pending builder check & user approval

## Intent & Why

Currently, `/t/:tripId/awards` renders up to four 9:16 meme cards stacked vertically inside white grouped sections on a scrolling page. Opening Crew Awards should feel like a celebratory Spotify Wrapped / Instagram & Facebook Stories recap instead: full-screen, phone-first, easy to swipe through in front of friends after a badminton/sport session, and effortless to save or share as a 1080×1920 PNG.

## Goals, Non-Goals, and Anti-Goals

### Goals
- **Fullscreen story player (Option B — Framed 9:16 Card + Bottom Bar):** Present the active award card on a `100dvh` dark stage (`--meme-story-bg`) with segmented top progress bars, group & card header, close `×` button, scaled 9:16 card centered in the stage, and a dedicated bottom action bar (`Replay`, `Save`, `Share`) that never overlaps card artwork.
- **Facebook / Instagram Stories transition & pacing:** Switch between cards with a 3D perspective cube transition that tracks horizontal swipe drags in real time and animates smoothly on tap, desktop arrow click, or keyboard navigation. Auto-advance each segment (~7s) with press-and-hold to pause and automatic pause during Save/Share/Replay or candidate switching.
- **Single Wanted slide with inline picker (Option 2):** When multiple people qualify for Wanted (`wantedCandidates.length > 1`), keep Wanted as one story segment and show compact name pills right above the bottom bar to swap the poster in place.
- **CoinCrew profile photo on Wanted:** Display the person's `avatarUrl` (with the poster's sepia treatment) inside the Wanted portrait box when available, falling back cleanly to their 2-letter given-name initials when missing or on image load failure — in both the DOM card and the 1080×1920 PNG export.
- **CoinCrew standards:** Keep all colours in `libs/web/ui/src/styles/globals.css` (passing `style-guard.test.ts`), preserve `data-testid` / `fsl-*` selectors where applicable, respect `prefers-reduced-motion`, and clear Zalo Mini App safe-area/capsule insets.

### Non-Goals
- Adding new intro/summary slides beyond the existing four card types (`awards`, `wanted`, `verse`, `board`).
- Changing attendance reliability scoring or winner selection rules (`@cc/core`, `buildAwards` winner logic).
- Adding background music/audio or video export.
- Opening `/awards` to non-admin members (admin-only guard stays unchanged).

### Anti-Goals
- Cropping or overlapping card borders/stamps/footers with floating controls on short phone screens.
- Auto-closing `/awards` or looping unexpectedly when the final slide finishes its timer.
- Jumping to the next slide while the user is tapping a Wanted name pill, holding a card to read, or inside the Share sheet / Save download.
- Hardcoding hex colours in TSX files.

## Design Details

### 1. Screen States & Entry/Exit
- **Loading, Error, Non-Admin, and Empty (`awards-empty`) states:** Remain inside the standard `<Screen title={t('awards.title')} onBack={goBack}>` frame so errors, permissions, and "No counted sessions yet" behave consistently with the rest of CoinCrew.
- **Active Story State:** Replaces `<Screen>` with a fullscreen story root (`data-testid="crew-awards-screen"`, `h-dvh w-full overflow-hidden flex flex-col`) so there is no page header, bottom nav pill, or vertical page scroll competing with gestures.
- **Back / Close:** The top-right `×` button (`aria-label={t('common.back')}`, `min-h-11 min-w-11`) and desktop `Escape` key call `goBack` to return to the group screen.

### 2. Layout: Framed 9:16 Stage (Option B)
From top to bottom inside the `100dvh` dark stage:
1. **Top chrome** (padded with `env(safe-area-inset-top)` and Zalo Mini App `platform.kind === 'zmp'` top/capsule clearance, constrained to `max-w-[440px]` centered on desktop):
   - **Segmented progress bar:** One track per available card in fixed order (`awards` → `wanted` → `verse` → `board`). Completed segments are solid bright fill, upcoming segments are muted translucent track, and the active segment fills smoothly from `0%` to `100%`.
   - **Header row:** Group initial badge/avatar + group name + active card label (e.g., `t('awards.cardTitle.awards')`) on the left, and the `×` close button on the right (with right-side clearance in Zalo Mini App so it stays clear of Zalo's floating capsule).
2. **Center card stage:**
   - Flex-1 stage area that centers the active 270×480 card (`9:16` aspect ratio) and scales it uniformly to fit the available stage height and width without clipping or distorting typography/positions inside the four existing meme card components (`AwardNightCard`, `WantedCard`, `VerseCard`, `BoardCard`).
   - Status feedback (saved / copied / failed toast or subtle inline pill banner) appears cleanly without shifting layout height.
3. **Wanted name picker strip (Wanted slide only, when `wantedCandidates.length > 1`):**
   - Sits in its own dedicated row directly above the bottom action bar so it never overlaps the Wanted poster artwork.
   - Renders pill buttons (`data-testid="wanted-pick-${cid}"`, `aria-pressed={selected}`) for each candidate. Tapping a pill updates `pickedWantedId` in place, restarts the Wanted card entrance animation (`playKey`), and resets/pauses or restarts the Wanted segment cleanly without advancing the story. (Design call: reset the current Wanted segment's progress to `0` and pause briefly / keep playing from `0` while staying on the Wanted slide.)
4. **Bottom action bar:**
   - Dedicated dark bar padded with `env(safe-area-inset-bottom)` (`min-h-[60px]`), holding the three actions for the currently active card:
     - `Replay` (`data-testid="replay-${kind}"`): replays the active card's CSS entrance animation and resets the current segment timer to `0`.
     - `Save` (`data-testid="save-${kind}"`): exports and saves the 1080×1920 PNG (`renderMemePng`).
     - `Share` (`data-testid="share-${kind}"`): opens the existing `useImageShare` flow (`share()` + `sheet`).

### 3. Story Motion, Gestures & Pacing
- **3D Cube Transition (Facebook / Instagram Stories feel):**
  - The center stage renders inside a `perspective` container (`transform-style: preserve-3d`). Adjacent slides sit at `rotateY(±90deg)` around the cube's vertical axis (`transform-origin` recessed by half the stage width).
  - Horizontal pointer/touch drag (`touch-action: pan-y` or captured horizontal swipe) scrubs the cube angle smoothly in real time (`0deg` toward `±90deg`), snapping forward/backward on release when drag distance or velocity crosses the threshold, or springing back to `0deg` if canceled.
  - Tap navigation: tapping the left third of the card stage goes to the previous slide (or restarts the current slide's timer/animation if more than 1.5s into the current slide, matching Instagram Stories; design call); tapping the right two-thirds advances to the next slide.
  - Desktop affordances: subtle circular `←` / `→` buttons on `sm:`/`lg:` viewports beside the framed stage, plus keyboard `ArrowLeft`, `ArrowRight`, `Space` (pause/resume), and `Escape` (close).
  - **Reduced motion (`prefers-reduced-motion`):** Disables 3D cube rotation and uses an instant/short opacity crossfade instead; card internal animations continue to respect `motion-reduce:animate-none`.
- **Auto-Advance & Pause:**
  - Segment duration: **7 seconds** per slide (design call: gives time for 1.5–2s card entrance animations like the Wanted stamp slam and Folk Verse seal to complete plus reading time).
  - **Hold-to-pause:** Pressing and holding on the card stage (`pointerdown` held past ~180ms) pauses the segment timer without triggering a tap-skip on release.
  - **Automatic pause:** Timer pauses whenever `sharing` / `busyKey !== null` (Save/Share in progress or Share sheet open), or `document.visibilityState === 'hidden'`.
  - **End of story:** When the final segment reaches 100%, the story stays open on the final slide with all segments filled so the admin can still Replay, Save, or Share (never auto-closes).
- **Card Replay on Entry:** Entering a slide mounts/triggers its card entrance animation fresh (same `playKey` mechanism the cards already support).

### 4. Wanted Portrait Photo (`avatarUrl`)
- **Data flow (`CrewAwards.tsx`, `awards.ts`, `memeCards.ts`):**
  - `activePeople` passes `avatarUrl: p.avatarUrl ?? null` alongside `id` and `name`.
  - `MemeInput` (`kind: 'wanted'`) gains an optional `avatarUrl?: string | null` field.
- **DOM card (`WantedCard.tsx`):**
  - Inside the 132×132 sepia photo frame (`border-[3px] border-meme-wanted-ink bg-avatar-3 sepia-[.35]`): when `input.avatarUrl` is truthy and hasn't errored, render `<img src={input.avatarUrl} alt="" className="size-full object-cover" onError={...} />`; otherwise render `input.initials` as before.
- **PNG export (`libs/web/util/src/memeCards.ts`):**
  - `renderMemePng` resolves `paintWanted`: if `input.avatarUrl` is set, asynchronously load an `Image` with `crossOrigin = 'anonymous'` (with a short timeout fallback so offline/CORS-blocked images never hang export).
  - When loaded, draw it center-cropped (`object-cover` math) inside the 126×126 inner box with sepia filter (`ctx.filter = 'sepia(0.35)'`, or fallback if unsupported) before drawing the `BACK ON COURT!` stamp on top.
  - If `avatarUrl` fails to load or throws a tainted-canvas error, silently fall back to painting the existing `input.initials` portrait box so `Save` and `Share` always succeed.

### 5. Styling & Tokens (`globals.css`)
- All dark stage colours, progress bar track/fill, chrome pill backgrounds, and borders are defined as `--meme-story-*` CSS variables in `libs/web/ui/src/styles/globals.css` (and mapped via `@theme inline` if used as Tailwind classes). Zero raw hex values in TSX.
- Existing `fsl-meme-card--*` and `data-testid` attributes (`crew-awards-screen`, `awards-empty`, `meme-card-*`, `award-row-*`, `wanted-stamp`, `wanted-pick-*`, `replay-*`, `save-*`, `share-*`) are preserved on the active card/controls so unit and E2E selectors remain clean and predictable.

## What Is Left to the Builder
- Exact stage scaling mechanism (e.g. CSS `transform: scale(...)` computed from stage container `ResizeObserver` vs responsive `aspect-[9/16]` sizing) so all four cards render identically to their 270×480 layout without text wrapping shifts.
- Exact pointer-gesture state machine thresholds (tap vs hold-to-pause duration, swipe commit distance/velocity, and cube perspective depth).
- Exact `requestAnimationFrame` / `performance.now()` progress loop implementation so pausing and resuming stays smooth at 60fps.
- Updating `e2e/crew-awards.spec.ts` to step through the story segments when asserting all four cards and `wanted-pick-*` / `save-awards`, plus unit tests for `avatarUrl` fallback in `awards.ts` / `WantedCard.tsx` / `memeCards.ts`.
