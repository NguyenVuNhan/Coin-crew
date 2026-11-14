# Crew Awards Fullscreen Story Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/t/:tripId/awards` (`CrewAwards`) into a fullscreen story viewer (Option B framed 9:16 card + bottom action bar) with Facebook/Instagram Stories 3D cube transitions, 7-second auto-advance with hold-to-pause, inline Wanted candidate pills (Option 2), and CoinCrew profile photos on the Wanted card.

**Architecture:** Extract the story stage, segmented progress header, 3D cube viewport, gesture/keyboard/timer controller, Wanted picker strip, and bottom action bar into a dedicated `AwardsStory` component rendered by `CrewAwards` when awards content is ready (while loading, error, non-admin redirect, and empty states remain in `<Screen>`). Add optional `avatarUrl` flow through `buildAwards` → `WantedCard` and `renderMemePng` with graceful initials fallback on load/CORS errors.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4 (`globals.css` tokens), Vitest + Testing Library (`jsdom`), Playwright.

**Spec:** [docs/superpowers/specs/2026-11-14-crew-awards-story-design.md](file:///C:/Users/NvN/orca/workspaces/coin-crew/track-participant-attendance-reliability-planned/docs/superpowers/specs/2026-11-14-crew-awards-story-design.md)

## Global Constraints

- Every colour in UI code must come from CSS tokens in `libs/web/ui/src/styles/globals.css` (no raw hex in `.tsx`/`.ts` outside `IMAGE_PAINTERS` in `libs/web/util/src/memeCards.ts`; `libs/web/screens/src/test/style-guard.test.ts` enforces this).
- No `.css` files outside `libs/web/ui/src/styles/globals.css`.
- Touch targets must be at least 44px (`min-h-11`).
- `prefers-reduced-motion` (`usePrefersReducedMotion()` + `motion-reduce:`) disables 3D cube rotation (falls back to crossfade) and card entrance animations.
- Zalo Mini App (`platform.kind === 'zmp'`) top chrome clears `--zmp-safe-top` and `--zmp-capsule-width`.
- Preserve `data-testid` and `fsl-*` hooks (`crew-awards-screen`, `awards-empty`, `meme-card-*`, `award-row-*`, `wanted-stamp`, `wanted-pick-*`, `replay-*`, `save-*`, `share-*`).

## Review Focus

1. **CORS-blocked or broken `avatarUrl` during PNG export:** `renderMemePng` must time out or handle `onerror`/tainted canvas and fall back to painting `input.initials` so `Save` and `Share` never hang or reject with `null`.
2. **Left-third tap threshold (1.5s):** Tapping the left third within 1.5s of entering slide > 0 steps to the previous slide; tapping after 1.5s (or on slide 0) restarts the current slide's progress to `0` and replays its animation.
3. **Final slide timer completion:** When the last segment reaches 100%, the story remains open on the final slide with all segments filled instead of closing or wrapping.
4. **Hold-to-pause release suppression:** Holding pointer down (`>= 180ms`) pauses progress and releasing must not trigger a left/right tap navigation.
5. **Action & visibility pause + reduced motion:** `Save`/`Share` activity (`busyKey !== null` or `sharing`), `document.visibilityState === 'hidden'`, and `prefers-reduced-motion` behave safely without advancing slides mid-action or rotating in 3D under reduced motion.

---

### Task 1: Wanted Profile Photo (`avatarUrl`) in Data, DOM Card, and PNG Export

**Files:**
- Modify: `libs/web/util/src/memeCards.ts:14-27,315-345,528-578`
- Modify: `libs/web/screens/src/lib/awards.ts:69-79,156-178`
- Modify: `libs/web/screens/src/components/meme/WantedCard.tsx:10-55`
- Modify: `libs/web/screens/src/screens/CrewAwards.tsx:55-58`
- Test: `libs/web/util/src/__tests__/memeCards.test.ts`
- Test: `libs/web/screens/src/lib/__tests__/awards.test.ts`

**Interfaces:**
- Produces:
  - `MemeInput` `kind: 'wanted'` variant with optional `avatarUrl?: string | null`
  - `buildAwards(view: AttendanceView, people: { id: string; name: string; avatarUrl?: string | null }[], t: Translate, tripName?: string): AwardsContent`
  - `WantedCard` renders `<img src={input.avatarUrl} ... />` inside the 132×132 sepia frame and falls back to `input.initials` on missing URL or `onError`.

- [ ] **Step 1: Write failing unit tests for `avatarUrl` in `buildAwards` and `renderMemePng`**

In `libs/web/screens/src/lib/__tests__/awards.test.ts`, add a test verifying `buildAwards` forwards `avatarUrl` on `content.wanted(id)` and leaves it `null`/undefined when absent.

In `libs/web/util/src/__tests__/memeCards.test.ts`, add two tests:
1. `renderMemePng` with `wanted` + `avatarUrl` loads an `Image` with `crossOrigin = 'anonymous'`, calls `ctx.drawImage`, and still produces a PNG `Blob`.
2. `renderMemePng` with `wanted` + failing/blocked `avatarUrl` (`onerror`) falls back to drawing `input.initials` via `ctx.fillText` and still returns a PNG `Blob`.

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `npx vitest run libs/web/util/src/__tests__/memeCards.test.ts libs/web/screens/src/lib/__tests__/awards.test.ts`
Expected: FAIL because `avatarUrl` is not yet wired on `MemeInput` / `buildAwards` / `renderMemePng`.

- [ ] **Step 3: Implement `avatarUrl` support across `memeCards.ts`, `awards.ts`, `WantedCard.tsx`, and `CrewAwards.tsx`**

1. In `libs/web/util/src/memeCards.ts`:
   - Add `avatarUrl?: string | null;` to the `kind: 'wanted'` member of `MemeInput`.
   - Exclude `avatarUrl` in `textOf(input)` so URLs are not passed to `fonts.load`.
   - Add `loadAvatarImage(url: string, timeoutMs = 2000): Promise<HTMLImageElement | null>` that sets `img.crossOrigin = 'anonymous'` before `img.src = url`, resolves `img` on `onload`, and resolves `null` on `onerror` or timeout.
   - Update `paintWanted(ctx, input, avatarImg)` so when `avatarImg` has non-zero `naturalWidth` and `naturalHeight`, it computes center-crop (`object-cover`) coordinates into `(px + 3, py + 3, 126, 126)`, clips to that box, applies `ctx.filter = 'sepia(0.35)'` inside `ctx.save()/restore()`, and draws the image; otherwise draws the existing `C.photo` fill + `input.initials`.
   - In `renderMemePng(input)`: if `input.kind === 'wanted' && input.avatarUrl`, await `loadAvatarImage(input.avatarUrl)` before painting; if `canvas.toBlob` throws (e.g. tainted canvas), re-paint `wanted` without `avatarImg` and call `canvas.toBlob` again.
2. In `libs/web/screens/src/lib/awards.ts`:
   - Accept `{ id: string; name: string; avatarUrl?: string | null }[]` in `buildAwards`.
   - Include `avatarUrl: personAvatarMap.get(participantId) ?? null` in the returned `wanted(participantId)` object.
3. In `libs/web/screens/src/components/meme/WantedCard.tsx`:
   - Track `failedUrl` state (`useState<string | null>(null)`), resetting or comparing against `input.avatarUrl` so switching candidates retries cleanly.
   - Inside the 132×132 portrait `div`, render `<img src={input.avatarUrl} alt="" onError={() => setFailedUrl(input.avatarUrl ?? null)} className="size-full object-cover" />` when `Boolean(input.avatarUrl) && failedUrl !== input.avatarUrl`, else render `{input.initials}`.
4. In `libs/web/screens/src/screens/CrewAwards.tsx`:
   - Pass `avatarUrl: p.avatarUrl ?? null` in `activePeople`.

- [ ] **Step 4: Run tests and verify pass**

Run: `npx vitest run libs/web/util/src/__tests__/memeCards.test.ts libs/web/screens/src/lib/__tests__/awards.test.ts libs/web/screens/src/__tests__/crew-awards.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/web/util/src/memeCards.ts libs/web/util/src/__tests__/memeCards.test.ts libs/web/screens/src/lib/awards.ts libs/web/screens/src/lib/__tests__/awards.test.ts libs/web/screens/src/components/meme/WantedCard.tsx libs/web/screens/src/screens/CrewAwards.tsx
git commit -m "feat(awards): show CoinCrew profile photo on Wanted card and PNG export"
```

---

### Task 2: Story Stage Tokens, Icons, and i18n Labels

**Files:**
- Modify: `libs/web/ui/src/styles/globals.css`
- Modify: `libs/web/ui/src/components/icons.tsx`
- Modify: `libs/web/i18n/src/en.ts`
- Modify: `libs/web/i18n/src/vi.ts`

**Interfaces:**
- Produces:
  - Tailwind colour tokens `bg-meme-story-bg`, `text-meme-story-ink`, `text-meme-story-muted`, `bg-meme-story-track`, `bg-meme-story-bar`, `bg-meme-story-chrome`, `border-meme-story-border` in `globals.css`.
  - `IconName` `'chevronLeft'` in `libs/web/ui/src/components/icons.tsx`.
  - i18n keys `'awards.story.prev'` and `'awards.story.next'` in `en.ts` and `vi.ts`.

- [ ] **Step 1: Add `--meme-story-*` tokens to `libs/web/ui/src/styles/globals.css`**

In `@theme inline` and `:root` in `libs/web/ui/src/styles/globals.css`:
- `--meme-story-bg: #0b1110;`
- `--meme-story-ink: #f6f7f4;`
- `--meme-story-muted: rgba(246, 247, 244, 0.68);`
- `--meme-story-track: rgba(246, 247, 244, 0.28);`
- `--meme-story-bar: #ffffff;`
- `--meme-story-chrome: rgba(246, 247, 244, 0.12);`
- `--meme-story-border: rgba(246, 247, 244, 0.16);`
Map each `--color-meme-story-*` in `@theme inline`.

- [ ] **Step 2: Add `chevronLeft` to `libs/web/ui/src/components/icons.tsx` and story nav labels to `en.ts` / `vi.ts`**

- Import `ChevronLeft` from `lucide-react`, add `'chevronLeft'` to `IconName` and `SHAPES`.
- Add `'awards.story.prev': 'Previous story'` / `'awards.story.next': 'Next story'` in `libs/web/i18n/src/en.ts` and Vietnamese equivalents (`'Thẻ trước'` / `'Thẻ tiếp theo'`) in `libs/web/i18n/src/vi.ts`.

- [ ] **Step 3: Run style-guard and typecheck to verify tokens and i18n keys**

Run: `npx vitest run libs/web/screens/src/test/style-guard.test.ts libs/web/ui/src/styles/__tests__/theme-tokens.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add libs/web/ui/src/styles/globals.css libs/web/ui/src/components/icons.tsx libs/web/i18n/src/en.ts libs/web/i18n/src/vi.ts
git commit -m "feat(ui,i18n): add fullscreen story tokens, chevronLeft icon, and story labels"
```

---

### Task 3: Fullscreen Story Player (`AwardsStory`) and `CrewAwards` Integration

**Files:**
- Modify: `libs/web/screens/src/components/meme/AwardNightCard.tsx`
- Modify: `libs/web/screens/src/components/meme/WantedCard.tsx`
- Modify: `libs/web/screens/src/components/meme/VerseCard.tsx`
- Modify: `libs/web/screens/src/components/meme/BoardCard.tsx`
- Create: `libs/web/screens/src/components/meme/AwardsStory.tsx`
- Modify: `libs/web/screens/src/screens/CrewAwards.tsx`
- Modify: `libs/web/screens/src/__tests__/crew-awards.test.tsx`

**Interfaces:**
- Consumes: Task 1 `WantedCard` + `avatarUrl`, Task 2 `--meme-story-*` tokens, `'chevronLeft'` icon, `'awards.story.prev'` / `'awards.story.next'` i18n keys.
- Produces:
  - Optional `replayKey?: number` and `hideActions?: boolean` props on `AwardNightCard`, `WantedCard`, `VerseCard`, `BoardCard` (defaulting to current standalone behavior so existing direct usage still works).
  - `AwardsStory` component accepting `{ slides, groupName, wantedCandidates, wantedId, onPickWanted, nameMap, onClose, renderActions, onReplayCard, statusBanner, pausedExternal, sheet }`.

- [ ] **Step 1: Write failing component tests in `libs/web/screens/src/__tests__/crew-awards.test.tsx`**

Update/add tests covering:
1. Active story renders fullscreen (`crew-awards-screen`), shows the first slide (`meme-card-awards`), top progress segments matching available cards (`4` segments), close button (`aria-label` matching `common.back`) calling back navigation, and bottom `replay-awards` / `save-awards` / `share-awards`.
2. Stepping forward (Next button / `ArrowRight` / right-zone tap) advances through `awards` → `wanted` → `verse` → `board`, and stepping left restarts current slide when `elapsed >= 1500ms` or goes back when `< 1500ms`.
3. On the `wanted` slide, `wanted-pick-p-4` and `wanted-pick-p-5` are visible, selecting `wanted-pick-p-5` displays `wanted-stamp` (`BACK ON COURT!` / `ĐÃ RA SÂN!`), and shows `<img>` inside the Wanted portrait when `avatarUrl` is set on the person (falling back to initials when missing or after `fireEvent.error(img)`).
4. Auto-advance uses fake timers / rAF: advances after `7000ms`, pauses while pointer is held (`pointerdown` >= 180ms, and releasing does not advance), pauses while `busyKey !== null` or `sharing`, and stops on the final slide (`board`) without closing or wrapping.
5. `prefers-reduced-motion` renders with no `animate-[` classes and uses non-3D crossfade transition (`data-transition="fade"` vs `"cube"`).

- [ ] **Step 2: Run `crew-awards.test.tsx` to verify failure**

Run: `npx vitest run libs/web/screens/src/__tests__/crew-awards.test.tsx`
Expected: FAIL because `AwardsStory` does not exist yet and `CrewAwards` still renders the stacked layout.

- [ ] **Step 3: Update the 4 card components and implement `AwardsStory.tsx` + `CrewAwards.tsx`**

1. In `AwardNightCard.tsx`, `WantedCard.tsx`, `VerseCard.tsx`, `BoardCard.tsx`:
   - Add optional `replayKey?: number` and `hideActions?: boolean` props. Combine internal `playKey` with `replayKey ?? 0` on the card animation root key. When `hideActions` is true, omit the inline Replay + actions footer row so `AwardsStory` renders the single shared bottom bar (`replay-${kind}`, `save-${kind}`, `share-${kind}`).
2. Create `libs/web/screens/src/components/meme/AwardsStory.tsx`:
   - **Layout (Option B):** `h-dvh w-full overflow-hidden bg-meme-story-bg text-meme-story-ink flex flex-col items-center` (`data-testid="crew-awards-screen"`).
   - **Top chrome:** `w-full max-w-[440px] px-3 pb-2` with top padding clearing `env(safe-area-inset-top)` and `platform.kind === 'zmp'` `--zmp-safe-top` / right `--zmp-capsule-width`:
     - Segmented progress bar (`role="tablist"` / `data-testid="story-progress"`) with one bar per slide (`bg-meme-story-track`, fill `bg-meme-story-bar`, width `%` from `progress`).
     - Header row: group initial chip + `groupName` + active card title (`awards.cardTitle.${kind}`) on the left, close `×` button (`min-h-11 min-w-11`, `aria-label={t('common.back')}`, `data-testid="story-close"`) on the right.
   - **Center stage + 3D cube:**
     - `flex-1 min-h-0 w-full flex items-center justify-center relative px-3` with desktop `sm:flex` Prev/Next circular `min-h-11 min-w-11` buttons (`data-testid="story-prev"`, `data-testid="story-next"`, `aria-label={t('awards.story.prev')}` / `t('awards.story.next')`).
     - Measure stage container via `ResizeObserver` (with sensible fallback `270×480` scale `1` in jsdom) to compute uniform scale `min(availW / 270, availH / 480)` so the 270×480 card fits completely inside the frame with zero clipping.
     - Render the cube viewport (`perspective: 960px`, `data-transition={reducedMotion ? 'fade' : 'cube'}`) holding the active slide (and adjacent slide during drag/transition) with `rotateY` cube transforms when `!reducedMotion`, or opacity fade when `reducedMotion`.
     - Pointer gesture handlers on the stage: `pointerdown` starts hold-detection timer (`180ms` -> paused); horizontal drag (`|dx| > 10px`) scrubs cube rotation (`dragOffset / stageWidth * 90deg`) and commits prev/next on release if `|dx| > stageWidth * 0.22` or fast flick; short tap without hold/drag navigates left third (restart if `elapsedMs >= 1500` or `index === 0`, else prev) or right two-thirds (next).
   - **Auto-advance timer:** `7000ms` per slide via `requestAnimationFrame` (paused when `held || pausedExternal || docHidden || atEndOfLastSlide`). When reaching `100%`: if `index < slides.length - 1`, advance to `index + 1` with cube flip; if on last slide, clamp at `100%` and stay open.
   - **Keyboard:** `ArrowLeft` (prev / restart), `ArrowRight` (next), `Space` (toggle pause), `Escape` (`onClose`).
   - **Wanted picker strip:** Rendered above the bottom bar only when `activeSlide.kind === 'wanted' && wantedCandidates.length > 1`, holding `wanted-pick-${cid}` pills (`min-h-11`). Picking a candidate calls `onPickWanted(cid)`, increments `replayKey`, and resets current segment progress to `0`.
   - **Bottom bar:** `w-full max-w-[440px] border-t border-meme-story-border px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]` holding `replay-${kind}`, `save-${kind}`, `share-${kind}` (`min-h-11`) plus optional non-shifting status pill.
3. Update `libs/web/screens/src/screens/CrewAwards.tsx`:
   - Build `slides` in fixed order (`awards` → `wanted` → `verse` → `board`), skipping nulls.
   - Pass `slides` and handlers to `<AwardsStory ... />` instead of the stacked `<Screen>` layout when `hasAnyCard` is true.

- [ ] **Step 4: Run tests and verify pass**

Run: `npx vitest run libs/web/screens/src/__tests__/crew-awards.test.tsx libs/web/screens/src/test/style-guard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/web/screens/src/components/meme/ libs/web/screens/src/screens/CrewAwards.tsx libs/web/screens/src/__tests__/crew-awards.test.tsx
git commit -m "feat(awards): build fullscreen Crew Awards story player with 3D cube motion"
```

---

### Task 4: E2E Test Update, `DESIGN.md` Sync, and Full Verification

**Files:**
- Modify: `e2e/crew-awards.spec.ts:153-187`
- Modify: `DESIGN.md:414-425`

- [ ] **Step 1: Update `e2e/crew-awards.spec.ts`**

Update step 6 & 7 in `e2e/crew-awards.spec.ts`:
- Assert `crew-awards-screen` and initial `meme-card-awards` (`Minh`) are visible; trigger `save-awards` and assert `crew-awards-awards.png` download.
- Step through the story (`story-next` button) to assert `meme-card-wanted` (`wanted-pick-${anPid}` / `An`), `meme-card-verse`, and `meme-card-board` each appear on their slide, plus `story-close` navigates back to `/t/${tripId}`.

- [ ] **Step 2: Update `DESIGN.md` Crew meme cards section**

Document the fullscreen Option B story viewer on `/awards` (dark `--meme-story-bg` stage, top segmented progress bars, 3D cube transition, 7s auto-advance with hold-to-pause, inline Wanted picker strip, bottom `Replay`/`Save`/`Share` bar, and Wanted profile photo with sepia treatment + initials fallback).

- [ ] **Step 3: Run full test suite, typecheck, lint, and crew-awards Playwright E2E**

Run:
1. `npm test`
2. `npm run typecheck`
3. `npm run lint`
4. `npx playwright test e2e/crew-awards.spec.ts`

Expected: All unit tests, typecheck, lint (including Nx import boundaries and `style-guard`), and `e2e/crew-awards.spec.ts` PASS.

- [ ] **Step 4: Commit**

```bash
git add e2e/crew-awards.spec.ts DESIGN.md
git commit -m "test,docs(awards): update E2E story navigation and DESIGN.md"
```

---

## Self-Review Check (Completed)
- **Spec coverage:** Option B layout (Task 3), 3D cube + swipe/tap/keyboard + reduced-motion fallback (Task 3), 7s auto-advance + hold-to-pause + action pause + stay open on final card (Task 3), Option 2 single Wanted slide with inline pills (Task 3), `avatarUrl` in DOM & PNG with fallback (Task 1), `--meme-story-*` tokens in `globals.css` (Task 2), E2E + `DESIGN.md` (Task 4).
- **Consistency:** `WantedInput.avatarUrl`, `buildAwards`, `replayKey`, `hideActions`, and `data-testid` names match across tasks.
