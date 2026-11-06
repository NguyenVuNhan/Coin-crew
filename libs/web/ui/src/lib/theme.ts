import { isThemeId, type ThemeId } from '@cc/core';

export const THEME_CACHE_KEY = 'theme';

/** Sets data-theme on <html> and points <meta name="theme-color"> at the theme's --primary (creates the meta if missing). */
export function applyTheme(id: ThemeId): void {
  try {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', id);
    const primary =
      typeof getComputedStyle === 'function'
        ? getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()
        : '';
    if (primary) {
      let meta = document.querySelector('meta[name="theme-color"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'theme-color');
        document.head?.appendChild(meta);
      }
      meta.setAttribute('content', primary);
    }
  } catch {
    // Never throws
  }
}

/** The personal theme cached on this device, or null (missing, unknown, or storage unavailable). */
export function readCachedTheme(): ThemeId | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const value = localStorage.getItem(THEME_CACHE_KEY);
    if (isThemeId(value)) {
      return value;
    }
    return null;
  } catch {
    return null;
  }
}

/** Caches the personal theme; null removes it. Never throws. */
export function cacheTheme(id: ThemeId | null): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (id === null) {
      localStorage.removeItem(THEME_CACHE_KEY);
    } else {
      localStorage.setItem(THEME_CACHE_KEY, id);
    }
  } catch {
    // Never throws
  }
}
