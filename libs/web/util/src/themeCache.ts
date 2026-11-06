import { isThemeId, type ThemeId } from '@cc/core';

// The personal theme cached on this device, so the first paint uses it (apps/web/index.html reads the same key).
// It lives in web-util, not web-ui, so data-access (sign-out, saving a theme) may use it too.
export const THEME_CACHE_KEY = 'theme';

/** The personal theme cached on this device, or null (missing, unknown, or storage unavailable). */
export function readCachedTheme(): ThemeId | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const value = localStorage.getItem(THEME_CACHE_KEY);
    return isThemeId(value) ? value : null;
  } catch {
    return null;
  }
}

/** Caches the personal theme; null removes it. Never throws. */
export function cacheTheme(id: ThemeId | null): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (id === null) localStorage.removeItem(THEME_CACHE_KEY);
    else localStorage.setItem(THEME_CACHE_KEY, id);
  } catch {
    // Storage may be unavailable (private mode, some webviews).
  }
}
