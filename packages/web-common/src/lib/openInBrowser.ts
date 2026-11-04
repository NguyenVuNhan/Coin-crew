/**
 * Generates an Android Intent URL to open a URL in Chrome from inside an in-app webview.
 * Returns null on non-Android platforms (e.g. iOS / desktop).
 */
export function browserUrl(url: string, ua?: string): string | null {
  if (!url || !url.trim()) {
    return null;
  }
  const userAgent = ua !== undefined ? ua : (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  if (!/Android/i.test(userAgent)) {
    return null;
  }
  try {
    const base = typeof location !== 'undefined' && location.href ? location.href : 'https://coincrew.app';
    const parsed = new URL(url, base);
    const hostAndPath = `${parsed.host}${parsed.pathname}${parsed.search}`;
    const fullUrl = parsed.href;
    const encoded = encodeURIComponent(fullUrl);
    return `intent://${hostAndPath}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encoded};end`;
  } catch {
    return null;
  }
}
