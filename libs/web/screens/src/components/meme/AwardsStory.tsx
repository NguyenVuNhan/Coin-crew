import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import type { MessageKey } from '@cc/web-i18n/en';
import { useT } from '@cc/web-i18n';
import { usePlatform } from '@cc/web-platform';
import type { MemeInput, MemeKind } from '@cc/web-util/memeCards';
import { usePrefersReducedMotion } from '@cc/web-util/media';
import { Button } from '@cc/web-ui/components/Button';
import { Icon } from '@cc/web-ui/components/icons';
import { cn } from '@cc/web-ui/lib/utils';
import { initialsOf } from '../../lib/awards';
import { AwardNightCard } from './AwardNightCard';
import { BoardCard } from './BoardCard';
import { VerseCard } from './VerseCard';
import { WantedCard } from './WantedCard';

const CARD_W = 270;
const CARD_H = 480;
const STORY_DURATION_MS = 7000;
const RESTART_THRESHOLD_MS = 1500;
const HOLD_DELAY_MS = 180;
const DRAG_START_PX = 10;
const CUBE_TRANSITION_MS = 360;

const CARD_TITLE_KEYS: Record<MemeKind, MessageKey> = {
  awards: 'awards.cardTitle.awards',
  wanted: 'awards.cardTitle.wanted',
  verse: 'awards.cardTitle.verse',
  board: 'awards.cardTitle.board',
};

interface CubeTransition {
  outgoing: MemeInput;
  dir: 1 | -1;
  startAngle: number;
  settled: boolean;
}

function renderCard(input: MemeInput, replayKey: number) {
  switch (input.kind) {
    case 'awards':
      return <AwardNightCard input={input} replayKey={replayKey} hideActions />;
    case 'wanted':
      return <WantedCard input={input} replayKey={replayKey} hideActions />;
    case 'verse':
      return <VerseCard input={input} replayKey={replayKey} hideActions />;
    case 'board':
      return <BoardCard input={input} replayKey={replayKey} hideActions />;
  }
}

export interface AwardsStoryProps {
  slides: MemeInput[];
  groupName: string;
  wantedCandidates: string[];
  wantedId: string | null;
  onPickWanted: (participantId: string) => void;
  nameMap: Map<string, string>;
  onClose: () => void;
  renderActions: (input: MemeInput, primaryShare: boolean) => ReactNode;
  statusBanner?: ReactNode;
  pausedExternal: boolean;
  sheet?: ReactNode;
}

export function AwardsStory({
  slides,
  groupName,
  wantedCandidates,
  wantedId,
  onPickWanted,
  nameMap,
  onClose,
  renderActions,
  statusBanner,
  pausedExternal,
  sheet,
}: AwardsStoryProps) {
  const t = useT();
  const platform = usePlatform();
  const reducedMotion = usePrefersReducedMotion();

  const [activeIndex, setActiveIndex] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [replayCount, setReplayCount] = useState(0);
  const [held, setHeld] = useState(false);
  const [manualPaused, setManualPaused] = useState(false);
  const [docHidden, setDocHidden] = useState(
    () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
  );
  const [dragPx, setDragPx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [cubeAnim, setCubeAnim] = useState<CubeTransition | null>(null);
  const [stageSize, setStageSize] = useState({ width: CARD_W + 32, height: CARD_H + 16 });

  const stageRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const elapsedRef = useRef(0);
  const activeIndexRef = useRef(0);
  const heldRef = useRef(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerRef = useRef<{
    id: number;
    startX: number;
    startY: number;
    dragging: boolean;
  } | null>(null);

  const safeIndex = Math.min(activeIndex, Math.max(0, slides.length - 1));
  const activeSlide = slides[safeIndex] ?? slides[0]!;
  const isAtFinalEnd = safeIndex === slides.length - 1 && elapsedMs >= STORY_DURATION_MS;
  const isPaused = held || dragging || manualPaused || pausedExternal || docHidden || isAtFinalEnd;

  elapsedRef.current = elapsedMs;
  activeIndexRef.current = safeIndex;

  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setStageSize({ width: rect.width, height: rect.height });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVis = () => setDocHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const scale = Math.max(0.45, Math.min((stageSize.width - 24) / CARD_W, (stageSize.height - 16) / CARD_H));
  const frameW = Math.round(CARD_W * scale);
  const frameH = Math.round(CARD_H * scale);
  const halfW = frameW / 2;

  const stepTo = useCallback(
    (nextIndex: number, fromAngle = 0) => {
      const bounded = Math.max(0, Math.min(slides.length - 1, nextIndex));
      const current = activeIndexRef.current;
      if (bounded === current) return;
      const outgoing = slides[current];
      const dir: 1 | -1 = bounded > current ? 1 : -1;
      activeIndexRef.current = bounded;
      setActiveIndex(bounded);
      setElapsedMs(0);
      elapsedRef.current = 0;
      setManualPaused(false);
      setReplayCount((c) => c + 1);
      if (!reducedMotion && outgoing) {
        setCubeAnim({
          outgoing,
          dir,
          startAngle: dir * 90 + fromAngle,
          settled: false,
        });
      } else {
        setCubeAnim(null);
      }
    },
    [reducedMotion, slides],
  );

  useEffect(() => {
    if (!cubeAnim) return;
    if (cubeAnim.settled) {
      const clearTimer = setTimeout(() => setCubeAnim(null), CUBE_TRANSITION_MS + 30);
      return () => clearTimeout(clearTimer);
    }
    const raf = requestAnimationFrame(() => {
      setCubeAnim((prev) => (prev ? { ...prev, settled: true } : null));
    });
    return () => cancelAnimationFrame(raf);
  }, [cubeAnim]);

  const restartSlide = useCallback(() => {
    setElapsedMs(0);
    elapsedRef.current = 0;
    setManualPaused(false);
    setReplayCount((c) => c + 1);
  }, []);

  useEffect(() => {
    if (isPaused) return;
    let rafId = 0;
    let lastTs = performance.now();
    const tick = (now: number) => {
      const delta = Math.max(0, now - lastTs);
      lastTs = now;
      const nextElapsed = elapsedRef.current + delta;
      if (nextElapsed >= STORY_DURATION_MS) {
        if (activeIndexRef.current < slides.length - 1) {
          stepTo(activeIndexRef.current + 1);
          return;
        }
        elapsedRef.current = STORY_DURATION_MS;
        setElapsedMs(STORY_DURATION_MS);
        return;
      }
      elapsedRef.current = nextElapsed;
      setElapsedMs(nextElapsed);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPaused, safeIndex, slides.length, stepTo]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (activeIndexRef.current < slides.length - 1) stepTo(activeIndexRef.current + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (elapsedRef.current >= RESTART_THRESHOLD_MS || activeIndexRef.current === 0) {
          restartSlide();
        } else {
          stepTo(activeIndexRef.current - 1);
        }
      } else if (e.key === ' ' && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        setManualPaused((p) => !p);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, restartSlide, slides.length, stepTo]);

  const clearHoldTimer = () => {
    if (holdTimerRef.current !== null) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  useEffect(() => () => clearHoldTimer(), []);

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* synthetic or unsupported pointer id */
    }
    clearHoldTimer();
    heldRef.current = false;
    pointerRef.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, dragging: false };
    holdTimerRef.current = setTimeout(() => {
      heldRef.current = true;
      setHeld(true);
    }, HOLD_DELAY_MS);
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const ptr = pointerRef.current;
    if (!ptr || ptr.id !== e.pointerId) return;
    const dx = e.clientX - ptr.startX;
    const dy = e.clientY - ptr.startY;
    if (!ptr.dragging && Math.abs(dx) > DRAG_START_PX && Math.abs(dx) > Math.abs(dy)) {
      ptr.dragging = true;
      clearHoldTimer();
      heldRef.current = false;
      setHeld(false);
      setCubeAnim(null);
      setDragging(true);
    }
    if (ptr.dragging) {
      const atStart = safeIndex === 0 && dx > 0;
      const atEnd = safeIndex === slides.length - 1 && dx < 0;
      const clamped = Math.max(-frameW, Math.min(frameW, atStart || atEnd ? dx * 0.25 : dx));
      setDragPx(clamped);
    }
  };

  const finishPointer = (e: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const ptr = pointerRef.current;
    if (!ptr || ptr.id !== e.pointerId) return;
    pointerRef.current = null;
    clearHoldTimer();
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      /* pointer already released */
    }

    if (ptr.dragging) {
      const threshold = Math.min(72, frameW * 0.22);
      const currentAngle = (dragPx / Math.max(1, frameW)) * 90;
      setDragging(false);
      setDragPx(0);
      if (!cancelled) {
        if (dragPx < -threshold && safeIndex < slides.length - 1) {
          stepTo(safeIndex + 1, currentAngle);
        } else if (dragPx > threshold && safeIndex > 0) {
          stepTo(safeIndex - 1, currentAngle);
        }
      }
      return;
    }

    if (heldRef.current) {
      heldRef.current = false;
      setHeld(false);
      return;
    }

    if (cancelled) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    if (relX < rect.width / 3) {
      if (elapsedRef.current >= RESTART_THRESHOLD_MS || safeIndex === 0) {
        restartSlide();
      } else {
        stepTo(safeIndex - 1);
      }
    } else if (safeIndex < slides.length - 1) {
      stepTo(safeIndex + 1);
    }
  };

  const dragAngle = dragging ? (dragPx / Math.max(1, frameW)) * 90 : 0;
  const cubeAngle = cubeAnim ? (cubeAnim.settled ? 0 : cubeAnim.startAngle) : dragAngle;
  const dragNeighborIdx = dragPx < 0 ? safeIndex + 1 : dragPx > 0 ? safeIndex - 1 : -1;
  const dragNeighbor =
    dragging && dragNeighborIdx >= 0 && dragNeighborIdx < slides.length ? slides[dragNeighborIdx] : null;
  const dragNeighborDir: 1 | -1 = dragPx < 0 ? 1 : -1;

  const isZmp = platform.kind === 'zmp';

  return (
    <div
      className="fsl-awards fsl-story flex h-dvh w-full flex-col items-center overflow-hidden bg-meme-story-bg text-meme-story-ink select-none"
      data-testid="crew-awards-screen"
    >
      <header
        className="w-full max-w-[440px] shrink-0 px-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] pb-2"
        style={
          isZmp
            ? {
                paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px) + var(--zmp-safe-top))',
                paddingRight: 'calc(0.75rem + var(--zmp-capsule-width))',
              }
            : undefined
        }
      >
        <div
          className="flex items-center gap-1.5"
          data-testid="story-progress"
          role="progressbar"
          aria-valuenow={safeIndex + 1}
          aria-valuemin={1}
          aria-valuemax={slides.length}
        >
          {slides.map((slide, idx) => {
            const pct =
              idx < safeIndex
                ? 100
                : idx > safeIndex
                  ? 0
                  : Math.min(100, (elapsedMs / STORY_DURATION_MS) * 100);
            return (
              <div
                key={slide.kind}
                className="h-[3px] flex-1 overflow-hidden rounded-full bg-meme-story-track"
              >
                <div
                  className="h-full rounded-full bg-meme-story-bar"
                  style={{ width: `${pct}%` }}
                />
              </div>
            );
          })}
        </div>

        <div className="mt-2.5 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {initialsOf(groupName || 'CC')}
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-meme-story-ink">
                {groupName || t('awards.title')}
              </div>
              <div className="truncate text-xs text-meme-story-muted">
                {t(CARD_TITLE_KEYS[activeSlide.kind])}
              </div>
            </div>
          </div>

          <button
            type="button"
            data-testid="story-close"
            aria-label={t('common.back')}
            title={t('common.back')}
            onClick={onClose}
            className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-meme-story-chrome text-meme-story-ink transition-colors hover:bg-meme-story-track focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transition-none"
          >
            <Icon name="x" size={20} />
          </button>
        </div>
      </header>

      {statusBanner && (
        <div className="w-full max-w-[440px] shrink-0 px-3 pb-1 text-center">{statusBanner}</div>
      )}

      <div
        ref={stageRef}
        className="relative flex min-h-0 w-full max-w-[600px] flex-1 items-center justify-center px-3"
      >
        <button
          type="button"
          data-testid="story-prev"
          aria-label={t('awards.story.prev')}
          disabled={safeIndex === 0}
          onClick={() => stepTo(safeIndex - 1)}
          className="mr-3 hidden size-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-meme-story-border bg-meme-story-chrome text-meme-story-ink transition-colors hover:bg-meme-story-track disabled:pointer-events-none disabled:opacity-30 sm:inline-flex motion-reduce:transition-none"
        >
          <Icon name="chevronLeft" size={20} />
        </button>

        <div
          ref={viewportRef}
          data-testid="story-viewport"
          data-transition={reducedMotion ? 'fade' : 'cube'}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={(e) => finishPointer(e, false)}
          onPointerCancel={(e) => finishPointer(e, true)}
          className="relative touch-pan-y"
          style={{
            width: frameW,
            height: frameH,
            perspective: reducedMotion ? undefined : `${Math.round(frameW * 3.2)}px`,
          }}
        >
          {reducedMotion ? (
            <div
              key={`${activeSlide.kind}-${safeIndex}`}
              className="size-full transition-opacity duration-150 motion-reduce:transition-none"
            >
              <div
                style={{
                  width: CARD_W,
                  height: CARD_H,
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                }}
              >
                {renderCard(activeSlide, replayCount)}
              </div>
            </div>
          ) : (
            <div
              className={cn(
                'relative size-full',
                !dragging &&
                  (!cubeAnim || cubeAnim.settled) &&
                  'transition-transform duration-[360ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
              )}
              style={{
                transformStyle: 'preserve-3d',
                transform: `translateZ(-${halfW}px) rotateY(${cubeAngle}deg)`,
              }}
            >
              {cubeAnim && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0"
                  style={{
                    backfaceVisibility: 'hidden',
                    transform: `rotateY(${-cubeAnim.dir * 90}deg) translateZ(${halfW}px)`,
                  }}
                >
                  <div
                    style={{
                      width: CARD_W,
                      height: CARD_H,
                      transform: `scale(${scale})`,
                      transformOrigin: 'top left',
                    }}
                  >
                    {renderCard(cubeAnim.outgoing, 0)}
                  </div>
                </div>
              )}

              <div
                className="absolute inset-0"
                style={{
                  backfaceVisibility: 'hidden',
                  transform: `rotateY(0deg) translateZ(${halfW}px)`,
                }}
              >
                <div
                  style={{
                    width: CARD_W,
                    height: CARD_H,
                    transform: `scale(${scale})`,
                    transformOrigin: 'top left',
                  }}
                >
                  {renderCard(activeSlide, replayCount)}
                </div>
              </div>

              {dragNeighbor && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0"
                  style={{
                    backfaceVisibility: 'hidden',
                    transform: `rotateY(${dragNeighborDir * 90}deg) translateZ(${halfW}px)`,
                  }}
                >
                  <div
                    style={{
                      width: CARD_W,
                      height: CARD_H,
                      transform: `scale(${scale})`,
                      transformOrigin: 'top left',
                    }}
                  >
                    {renderCard(dragNeighbor, 0)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          data-testid="story-next"
          aria-label={t('awards.story.next')}
          disabled={safeIndex >= slides.length - 1}
          onClick={() => stepTo(safeIndex + 1)}
          className="ml-3 hidden size-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-meme-story-border bg-meme-story-chrome text-meme-story-ink transition-colors hover:bg-meme-story-track disabled:pointer-events-none disabled:opacity-30 sm:inline-flex motion-reduce:transition-none"
        >
          <Icon name="chevronRight" size={20} />
        </button>
      </div>

      {activeSlide.kind === 'wanted' && wantedCandidates.length > 1 && (
        <div
          className="flex w-full max-w-[440px] shrink-0 flex-wrap items-center justify-center gap-2 px-3 pt-2"
          role="group"
          aria-label={t('awards.cardTitle.wanted')}
        >
          {wantedCandidates.map((cid) => {
            const name = nameMap.get(cid);
            if (!name) return null;
            const selected = cid === wantedId;
            return (
              <Button
                key={cid}
                variant={selected ? 'primary' : 'secondary'}
                data-testid={`wanted-pick-${cid}`}
                aria-pressed={selected}
                onClick={() => {
                  onPickWanted(cid);
                  restartSlide();
                }}
                className="min-h-11 rounded-full px-4"
              >
                {name}
              </Button>
            );
          })}
        </div>
      )}

      <footer className="mt-2 flex w-full max-w-[440px] shrink-0 flex-wrap items-center justify-center gap-2 border-t border-meme-story-border px-3 pt-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
        <Button
          variant="ghost"
          data-testid={`replay-${activeSlide.kind}`}
          onClick={restartSlide}
          className="min-h-11 text-meme-story-ink hover:bg-meme-story-chrome"
        >
          <Icon name="rotateCcw" size={16} />
          <span>{t('awards.replay')}</span>
        </Button>
        {renderActions(activeSlide, true)}
      </footer>

      {sheet}
    </div>
  );
}
