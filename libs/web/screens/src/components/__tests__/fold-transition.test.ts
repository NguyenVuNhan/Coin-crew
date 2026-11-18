import { afterEach, describe, expect, it, vi } from 'vitest';
import { runFoldTransition } from '../foldTransition';

afterEach(() => {
  vi.unstubAllGlobals();
  delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
});

describe('runFoldTransition', () => {
  it('calls update once synchronously when document.startViewTransition is missing', () => {
    const update = vi.fn();
    runFoldTransition(update);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('passes a callback to document.startViewTransition that runs update', () => {
    const update = vi.fn();
    const startViewTransition = vi.fn((cb: () => void) => {
      cb();
      return {} as ViewTransition;
    });
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      writable: true,
      value: startViewTransition,
    });

    runFoldTransition(update);

    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('skips document.startViewTransition when prefers-reduced-motion is reduce', () => {
    const update = vi.fn();
    const startViewTransition = vi.fn();
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      writable: true,
      value: startViewTransition,
    });
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: /prefers-reduced-motion:\s*reduce/.test(query),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }));

    runFoldTransition(update);

    expect(startViewTransition).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
  });
});
