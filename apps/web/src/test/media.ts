import { vi } from 'vitest';

/**
 * jsdom has no `window.matchMedia`. Stub it so `(min-width: 1024px)`, `(pointer: coarse)` and
 * `(prefers-reduced-motion: reduce)` answer as given (all false by default).
 * Call `vi.unstubAllGlobals()` in `afterEach` to remove it again.
 */
export function mockMedia(m: { wide?: boolean; coarse?: boolean; reducedMotion?: boolean } = {}): void {
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
