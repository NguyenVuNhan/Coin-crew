import { describe, it, expect, afterEach, vi, type MockInstance } from 'vitest';
import { browserUrl } from '../openInBrowser';

const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1';
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

let uaSpy: MockInstance | undefined;

afterEach(() => {
  uaSpy?.mockRestore();
  uaSpy = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('browserUrl', () => {
  it('returns an intent:// URL for an Android UA', () => {
    const url = 'https://coincrew.app/t/t-1';
    const result = browserUrl(url, ANDROID_UA);
    expect(result).toBe(
      'intent://coincrew.app/t/t-1#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fcoincrew.app%2Ft%2Ft-1;end',
    );
  });

  it('preserves query parameters in host/path and fallback url', () => {
    const url = 'https://coincrew.app/t/t-1/who?next=%2Fprofile';
    const result = browserUrl(url, ANDROID_UA);
    expect(result).toBe(
      'intent://coincrew.app/t/t-1/who?next=%2Fprofile#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fcoincrew.app%2Ft%2Ft-1%2Fwho%3Fnext%3D%252Fprofile;end',
    );
  });

  it('returns null for iPhone UA', () => {
    const url = 'https://coincrew.app/t/t-1';
    expect(browserUrl(url, IPHONE_UA)).toBeNull();
  });

  it('returns null for desktop UA', () => {
    const url = 'https://coincrew.app/t/t-1';
    expect(browserUrl(url, DESKTOP_UA)).toBeNull();
  });

  it('reads navigator.userAgent when ua parameter is omitted', () => {
    const url = 'https://coincrew.app/t/t-1';
    uaSpy = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ANDROID_UA);
    expect(browserUrl(url)).toBe(
      'intent://coincrew.app/t/t-1#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fcoincrew.app%2Ft%2Ft-1;end',
    );

    uaSpy.mockReturnValue(IPHONE_UA);
    expect(browserUrl(url)).toBeNull();
  });

  it('returns null for empty or invalid input', () => {
    expect(browserUrl('', ANDROID_UA)).toBeNull();
    expect(browserUrl('   ', ANDROID_UA)).toBeNull();
  });
});
