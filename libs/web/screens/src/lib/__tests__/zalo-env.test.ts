import { describe, it, expect, vi, afterEach } from 'vitest';
import { isZaloWebView } from '../zaloEnv';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isZaloWebView', () => {
  it('is true for the iOS Zalo app', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Zalo iOS/24.10.1 ZaloTheme/light ZaloLanguage/vi';
    expect(isZaloWebView(ua)).toBe(true);
  });

  it('is true for the Android Zalo app', () => {
    const ua =
      'Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36 Zalo android/12100740 ZaloTheme/dark ZaloLanguage/vi';
    expect(isZaloWebView(ua)).toBe(true);
  });

  it('is false for Safari, Chrome and desktop', () => {
    const iosSafari =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
    const androidChrome =
      'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
    const desktopChrome =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

    expect(isZaloWebView(iosSafari)).toBe(false);
    expect(isZaloWebView(androidChrome)).toBe(false);
    expect(isZaloWebView(desktopChrome)).toBe(false);
  });

  it('is true when only a ZaloTheme or ZaloLanguage token is present', () => {
    const ua =
      'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36 ZaloTheme/light ZaloLanguage/vi';
    expect(isZaloWebView(ua)).toBe(true);
  });

  it('reads navigator.userAgent by default', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('… Zalo android/1');
    expect(isZaloWebView()).toBe(true);
  });
});
