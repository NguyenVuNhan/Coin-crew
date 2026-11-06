import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from 'react';
import type React from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router';

/**
 * Back navigation for the whole app: "back returns to the page I came from".
 *
 * The provider remembers, for every history entry (by the router's `location.key`), how many of the app's own pages
 * are behind it, the address it was opened as, where it was scrolled and small view state such as the open tab.
 * `useBack(parent)` then steps back in history when an app page is behind, and otherwise replaces the page with its
 * natural parent, so a page opened from a shared link never sends the user out of the app.
 *
 * Records live in `sessionStorage` (per tab, they survive a reload). The router's first entry of a page load has the
 * key `default`; it always counts as depth 0 and is kept in memory only. When storage is blocked the records stay in
 * memory for the visit, and a reload counts as depth 0.
 */

const STORAGE_KEY = 'fsl:nav';
const MAX_ENTRIES = 100;
const MAX_RESTORE_FRAMES = 60;

/**
 * Router state for a push that keeps the window where it is: the wide layout opens details in a panel beside the
 * list, which stays mounted, so jumping to the top would lose the user's place in it.
 */
export const KEEP_SCROLL = { keepScroll: true } as const;

function keepsScroll(state: unknown): boolean {
  return typeof state === 'object' && state !== null && (state as { keepScroll?: unknown }).keepScroll === true;
}

interface EntryRecord {
  depth: number;
  /** `pathname + search` when the entry was pushed or first loaded; a replace of the same entry keeps it. */
  openedAs: string;
  scrollY?: number;
  view?: Record<string, unknown>;
  /** Last time the record was written, for pruning. */
  t: number;
}

type Store = Record<string, EntryRecord>;

let clock = 0;
/** Strictly increasing, so records written in the same millisecond still prune in order. */
function now(): number {
  clock = Math.max(clock + 1, Date.now());
  return clock;
}

function loadStore(): Store {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return typeof parsed === 'object' && parsed !== null ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

function saveStore(store: Store): void {
  const keys = Object.keys(store).filter((k) => k !== 'default');
  if (keys.length > MAX_ENTRIES) {
    keys.sort((a, b) => store[a]!.t - store[b]!.t);
    for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete store[k];
  }
  const { default: _first, ...persisted } = store;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  } catch {
    // Storage blocked or full: the records stay in memory for this visit.
  }
}

interface NavContext {
  key: string;
  entry: EntryRecord;
  setView: (name: string, value: unknown) => void;
}

const NavHistoryContext = createContext<NavContext | null>(null);

function currentScrollY(): number {
  return typeof window !== 'undefined' && typeof window.scrollY === 'number' ? window.scrollY : 0;
}

function scrollWindowTo(y: number): void {
  if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') window.scrollTo(0, y);
}

/**
 * Puts the window back at `y` once the page is tall enough to hold it: a list that is still loading would clamp the
 * position to the top. Gives up waiting after a second's worth of frames, and stops if the user scrolls first.
 * Returns a cancel function.
 */
function restoreScroll(y: number): () => void {
  const root = typeof document !== 'undefined' ? document.documentElement : null;
  if (!root || root.scrollHeight === 0 || typeof requestAnimationFrame !== 'function') {
    scrollWindowTo(y); // no layout (tests), or no frames: nothing to wait for
    return () => {};
  }
  let frames = 0;
  let id = 0;
  const stop = () => {
    cancelAnimationFrame(id);
    window.removeEventListener('wheel', stop);
    window.removeEventListener('touchstart', stop);
    window.removeEventListener('keydown', stop);
  };
  const tick = () => {
    frames += 1;
    if (root.scrollHeight - window.innerHeight >= y || frames >= MAX_RESTORE_FRAMES) {
      stop();
      scrollWindowTo(y);
      return;
    }
    id = requestAnimationFrame(tick);
  };
  window.addEventListener('wheel', stop, { passive: true });
  window.addEventListener('touchstart', stop, { passive: true });
  window.addEventListener('keydown', stop);
  if (root.scrollHeight - window.innerHeight >= y) tick();
  else id = requestAnimationFrame(tick);
  return stop;
}

export function NavHistoryProvider({ children }: { children: ReactNode }): JSX.Element {
  const location = useLocation();
  const type = useNavigationType();
  const path = location.pathname + location.search;

  const storeRef = useRef<Store | null>(null);
  if (storeRef.current === null) storeRef.current = loadStore();
  const store = storeRef.current;

  const keyRef = useRef<string | null>(null);
  const contextRef = useRef<NavContext | null>(null);

  // Work out the new entry's record while rendering, before React touches the page: the window is still scrolled
  // where the page being left was.
  if (keyRef.current !== location.key) {
    const prevKey = keyRef.current;
    const prev = prevKey !== null ? store[prevKey] : undefined;
    let entry: EntryRecord;
    if (prevKey === null || type === 'POP') {
      if (prev) prev.scrollY = currentScrollY();
      const known = location.key !== 'default' ? store[location.key] : undefined;
      entry = known ?? (location.key === 'default' && store.default ? store.default : { depth: 0, openedAs: path, t: now() });
    } else if (type === 'REPLACE') {
      // Same page (search params, rows switched in place): keep everything. Another page in the same slot (a tab
      // switch, a finished step): keep the depth only, so its opener, scroll and view state start fresh.
      const samePage = prev !== undefined && new URL(prev.openedAs, 'http://x').pathname === location.pathname;
      entry = prev
        ? samePage
          ? { ...prev, t: now() }
          : { depth: prev.depth, openedAs: path, t: now() }
        : { depth: 0, openedAs: path, t: now() };
      if (prevKey !== location.key) delete store[prevKey];
    } else {
      if (prev) prev.scrollY = currentScrollY();
      entry = { depth: (prev?.depth ?? 0) + 1, openedAs: path, t: now() };
    }
    store[location.key] = entry;
    keyRef.current = location.key;
    const key = location.key;
    contextRef.current = {
      key,
      entry,
      setView: (name, value) => {
        entry.view = { ...entry.view, [name]: value };
        entry.t = now();
        saveStore(store);
      },
    };
  }

  const first = useRef(true);
  useLayoutEffect(() => {
    saveStore(store);
    const isFirst = first.current;
    first.current = false;
    if (isFirst) {
      try {
        if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
      } catch {
        // Not allowed here: the browser keeps restoring by itself.
      }
      return;
    }
    if (type === 'PUSH') {
      if (!keepsScroll(location.state)) scrollWindowTo(0);
      return;
    }
    if (type === 'POP') {
      const y = store[location.key]?.scrollY;
      if (y !== undefined) return restoreScroll(y);
    }
    return;
  }, [location.key]);

  return <NavHistoryContext.Provider value={contextRef.current}>{children}</NavHistoryContext.Provider>;
}

/** How deep the current entry sits in the app's own history, and the address it was opened as. */
export function useNavEntry(): { depth: number; openedAs: string | null } {
  const ctx = useContext(NavHistoryContext);
  return { depth: ctx?.entry.depth ?? 0, openedAs: ctx?.entry.openedAs ?? null };
}

/**
 * The back action for a screen whose natural parent is `parent`: one step back in history when an app page is
 * behind, else the parent in place of the current page. A second call before the page changes is ignored, so a
 * double tap never skips past the opener.
 */
export function useBack(parent?: string): { canGoBack: boolean; goBack: () => void } {
  const navigate = useNavigate();
  const { depth } = useNavEntry();
  const { key } = useLocation();
  const firedFor = useRef<string | null>(null);
  // A screen that stays mounted can come back to the same entry (browser forward): its back must work again.
  useEffect(() => {
    firedFor.current = null;
  }, [key]);
  const goBack = useCallback(() => {
    if (firedFor.current === key) return;
    if (depth > 0) {
      firedFor.current = key;
      void navigate(-1);
    } else if (parent !== undefined) {
      firedFor.current = key;
      void navigate(parent, { replace: true });
    }
  }, [navigate, depth, parent, key]);
  return { canGoBack: depth > 0 || parent !== undefined, goBack };
}

/** Props for an in-page back <Link> (or <Button href>) whose natural parent is `parent`: a plain click goes back like the arrow, while a modified or middle click opens the parent as a normal link. */
export function useBackLink(parent: string): { to: string; onClick: (event: React.MouseEvent<HTMLElement>) => void } {
  const { goBack } = useBack(parent);
  const onClick = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      event.preventDefault();
      goBack();
    },
    [goBack],
  );
  return { to: parent, onClick };
}

/**
 * `useState` kept on the current history entry: going back to the entry, or reloading it, brings the value back;
 * a new visit starts from `initial`. While the page stays mounted across a push (the wide panel opening), the
 * value carries over to the new entry.
 */
export function useEntryState<T>(name: string, initial: T): [T, (value: T) => void] {
  const ctx = useContext(NavHistoryContext);
  const stored = ctx?.entry.view?.[name] as T | undefined;
  const [value, setValue] = useState<T>(stored !== undefined ? stored : initial);
  const [seenKey, setSeenKey] = useState(ctx?.key);
  if (ctx && seenKey !== ctx.key) {
    setSeenKey(ctx.key);
    if (stored !== undefined) setValue(stored);
    else ctx.setView(name, value);
  }
  const set = useCallback(
    (next: T) => {
      setValue(next);
      ctx?.setView(name, next);
    },
    [ctx, name],
  );
  return [value, set];
}
