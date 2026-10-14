import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type DOMAttributes,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

/** Sideways movement (px) before a gesture counts as a swipe. */
const START_DISTANCE = 8;
/** A row snaps open once pulled this far (a fraction of the actions' width), otherwise it springs back. */
const SNAP_FRACTION = 0.4;

interface SwipeGroup {
  openId: string | null;
  open(id: string, el: Element): void;
  /** Close the row `id` (if it is the open one), or whichever row is open when `id` is left out. */
  close(id?: string): void;
}

/**
 * Which row is open, and the listeners that close it again: a press anywhere outside it, or any scroll.
 * Listeners exist only while a row is open.
 */
function useSwipeGroupState(): SwipeGroup {
  const [current, setCurrent] = useState<{ id: string; el: Element } | null>(null);
  const open = useCallback((id: string, el: Element) => setCurrent({ id, el }), []);
  const close = useCallback(
    (id?: string) => setCurrent((cur) => (id === undefined || cur?.id === id ? null : cur)),
    [],
  );

  useEffect(() => {
    if (!current) return;
    const { el } = current;
    const onPointerDown = (e: PointerEvent) => {
      if (!(e.target instanceof Node) || !el.contains(e.target)) close();
    };
    const onScroll = () => close();
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [current, close]);

  return useMemo(() => ({ openId: current?.id ?? null, open, close }), [current, open, close]);
}

const GroupContext = createContext<SwipeGroup | null>(null);

/** Wrap a list of swipeable rows so only one is open at a time. A row outside any group still works on its own. */
export function SwipeGroupProvider({ children }: { children: ReactNode }) {
  const group = useSwipeGroupState();
  return createElement(GroupContext.Provider, { value: group }, children);
}

type Pointer = ReactPointerEvent<HTMLElement>;

interface Gesture {
  pointerId: number;
  x: number;
  y: number;
  /** Pixels revealed when the finger went down (all of them when the row was already open). */
  from: number;
  /** Not decided yet, a sideways swipe, or a vertical scroll that this row must leave alone. */
  mode: 'pending' | 'swiping' | 'scrolling';
  offset: number;
}

/** Browsers may fire a click after a drag with a mouse; swallow that one so a swipe never also "taps". */
function swallowNextClick(el: HTMLElement) {
  const stop = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
  };
  el.addEventListener('click', stop, { capture: true, once: true });
  setTimeout(() => el.removeEventListener('click', stop, true), 0);
}

/**
 * Swipe a row left to reveal `actionsWidth` pixels of actions behind it.
 * Spread `handlers` on the element that receives the pointer (give it `touch-action: pan-y`) and slide the row
 * by `-offset` px. `offset` is the revealed distance: it follows the finger, then settles at 0 or `actionsWidth`.
 */
export function useSwipeReveal({ actionsWidth, disabled = false }: { actionsWidth: number; disabled?: boolean }): {
  offset: number;
  open: boolean;
  close(): void;
  handlers: Pick<DOMAttributes<HTMLElement>, 'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel'>;
} {
  const id = useId();
  const inherited = useContext(GroupContext);
  const own = useSwipeGroupState(); // used only when the row is not inside a SwipeGroupProvider
  const group = inherited ?? own;
  const { close: closeInGroup, open: openInGroup } = group;

  const inactive = disabled || actionsWidth <= 0;
  const open = !inactive && group.openId === id;
  const [live, setLive] = useState<number | null>(null); // revealed pixels while a finger is down
  const gesture = useRef<Gesture | null>(null);

  const close = useCallback(() => closeInGroup(id), [closeInGroup, id]);
  // A row that goes away (or stops being swipeable) must not stay registered as the open one.
  useEffect(() => () => closeInGroup(id), [closeInGroup, id]);

  const onPointerDown = (e: Pointer) => {
    if (inactive) return;
    if (gesture.current && gesture.current.pointerId !== e.pointerId) return; // a second finger
    const from = open ? actionsWidth : 0;
    gesture.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, from, mode: 'pending', offset: from };
  };

  const onPointerMove = (e: Pointer) => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId || g.mode === 'scrolling') return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (g.mode === 'pending') {
      if (Math.abs(dx) > START_DISTANCE && Math.abs(dx) > Math.abs(dy)) {
        g.mode = 'swiping';
        try {
          e.currentTarget.setPointerCapture?.(e.pointerId); // keep a mouse drag even if it leaves the row
        } catch {
          // not supported here: the drag still works while the pointer stays over the row
        }
      } else {
        if (Math.abs(dy) > START_DISTANCE) g.mode = 'scrolling'; // a vertical drag stays a scroll for good
        return;
      }
    }
    g.offset = Math.min(actionsWidth, Math.max(0, g.from - dx));
    setLive(g.offset);
  };

  const onPointerUp = (e: Pointer) => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    gesture.current = null;
    if (g.mode !== 'swiping') return; // a tap or a scroll: nothing to settle
    setLive(null);
    // Judge the distance pulled in the direction of the gesture: opening needs 40%, so does closing again.
    const snapsOpen = g.from > 0 ? g.offset > actionsWidth * (1 - SNAP_FRACTION) : g.offset >= actionsWidth * SNAP_FRACTION;
    if (snapsOpen) openInGroup(id, e.currentTarget);
    else closeInGroup(id);
    swallowNextClick(e.currentTarget);
  };

  const onPointerCancel = (e: Pointer) => {
    if (gesture.current?.pointerId !== e.pointerId) return;
    gesture.current = null;
    setLive(null);
  };

  return {
    offset: live ?? (open ? actionsWidth : 0),
    open,
    close,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
  };
}
