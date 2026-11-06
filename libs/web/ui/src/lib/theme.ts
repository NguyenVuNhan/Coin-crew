import type { ThemeId } from '@cc/core';

// The device cache lives in web-util so data-access can use it too; re-exported here for screens.
export { THEME_CACHE_KEY, readCachedTheme, cacheTheme } from '@cc/web-util/themeCache';

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
