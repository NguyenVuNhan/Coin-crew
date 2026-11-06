import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, cacheTheme, readCachedTheme, THEME_CACHE_KEY } from '../theme';

describe('theme helpers', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    const existingMeta = document.querySelector('meta[name="theme-color"]');
    if (existingMeta) {
      existingMeta.remove();
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('applyTheme sets data-theme on <html> and the theme-color meta', () => {
    vi.spyOn(window, 'getComputedStyle').mockImplementation((_elt) => {
      return {
        getPropertyValue: (prop: string) => (prop === '--primary' ? '#a21caf' : ''),
      } as CSSStyleDeclaration;
    });

    applyTheme('orchid');

    expect(document.documentElement.getAttribute('data-theme')).toBe('orchid');
    const meta = document.querySelector('meta[name="theme-color"]');
    expect(meta).not.toBeNull();
    expect(meta?.getAttribute('content')).toBe('#a21caf');
  });

  it('readCachedTheme returns a cached id', () => {
    localStorage.setItem(THEME_CACHE_KEY, 'orchid');
    expect(readCachedTheme()).toBe('orchid');

    localStorage.setItem(THEME_CACHE_KEY, 'jade');
    expect(readCachedTheme()).toBe('jade');
  });

  it('an unknown cached id is ignored', () => {
    localStorage.setItem(THEME_CACHE_KEY, 'neon');
    expect(readCachedTheme()).toBeNull();

    localStorage.setItem(THEME_CACHE_KEY, 'unknown-theme');
    expect(readCachedTheme()).toBeNull();

    localStorage.setItem(THEME_CACHE_KEY, '');
    expect(readCachedTheme()).toBeNull();
  });

  it('cacheTheme(null) removes it', () => {
    cacheTheme('sky');
    expect(localStorage.getItem(THEME_CACHE_KEY)).toBe('sky');

    cacheTheme(null);
    expect(localStorage.getItem(THEME_CACHE_KEY)).toBeNull();
  });

  it('storage that throws is ignored', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Access denied');
    });
    expect(readCachedTheme()).toBeNull();

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Quota exceeded');
    });
    expect(() => cacheTheme('orchid')).not.toThrow();

    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('Access denied');
    });
    expect(() => cacheTheme(null)).not.toThrow();
  });
});
