/**
 * Detects whether the current environment is running inside the Zalo in-app webview.
 * Evaluated at call time so caller or test environment can stub navigator.userAgent.
 */
export function isZaloWebView(ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): boolean {
  return /\bZalo\b/i.test(ua);
}
