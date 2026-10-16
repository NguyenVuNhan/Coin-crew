import { vi } from 'vitest';

/**
 * jsdom has no `window.matchMedia`. Stub it so `(min-width: 1024px)`, `(pointer: coarse)` and
 * `(prefers-reduced-motion: reduce)` answer as given (all false by default).
 * Call `vi.unstubAllGlobals()` in `afterEach` to remove it again.
 */
type MediaAnswers = { wide?: boolean; coarse?: boolean; reducedMotion?: boolean };

/**
 * Like `mockMedia`, but the answers can change while a page is shown: `set` changes them and tells every listener, as
 * resizing or rotating a tablet across 1024px does. Wrap `set` in `act`.
 */
export function mockMediaLive(initial: MediaAnswers = {}): { set(next: MediaAnswers): void } {
  let m = { ...initial };
  const listeners = new Set<() => void>();
  const matches = (query: string): boolean => {
    if (/min-width:\s*1024px/.test(query)) return m.wide ?? false;
    if (/pointer:\s*coarse/.test(query)) return m.coarse ?? false;
    if (/prefers-reduced-motion:\s*reduce/.test(query)) return m.reducedMotion ?? false;
    return false;
  };
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: matches(query),
    media: query,
    onchange: null,
    addEventListener: (_type: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_type: string, cb: () => void) => listeners.delete(cb),
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
  return {
    set(next) {
      m = { ...m, ...next };
      for (const cb of [...listeners]) cb();
    },
  };
}

export function mockMedia(m: MediaAnswers = {}): void {
  const matches = (query: string): boolean => {
    if (/min-width:\s*1024px/.test(query)) return m.wide ?? false;
    if (/pointer:\s*coarse/.test(query)) return m.coarse ?? false;
    if (/prefers-reduced-motion:\s*reduce/.test(query)) return m.reducedMotion ?? false;
    return false;
  };
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: matches(query),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}
