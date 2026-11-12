import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  currentInstallEnv,
  detectInstallContext,
  installStore,
  iosMajorVersion,
  isMobileEnv,
  promptInstall,
  startInstallCapture,
  type InstallEnv,
} from '../install';

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1';
const IPHONE_FIREFOX = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/130.0 Mobile/15E148 Safari/605.1.15';
const IPHONE_26 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const ZALO_UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36 Zalo/24.1';
const FB_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 [FBAN/FBIOS;FBAV/450.0]';

const env = (ua: string, over: Partial<InstallEnv> = {}): InstallEnv => ({
  ua,
  maxTouchPoints: 0,
  standalone: false,
  hasPrompt: false,
  ...over,
});

describe('detectInstallContext', () => {
  it('standalone wins over everything', () => {
    expect(detectInstallContext(env(ZALO_UA, { standalone: true, hasPrompt: true }))).toBe('standalone');
  });
  it('in-app browsers, even with a prompt', () => {
    expect(detectInstallContext(env(ZALO_UA, { hasPrompt: true }))).toBe('in-app');
    expect(detectInstallContext(env(FB_UA))).toBe('in-app');
  });
  it('android', () => {
    expect(detectInstallContext(env(ANDROID, { hasPrompt: true }))).toBe('prompt');
    expect(detectInstallContext(env(ANDROID))).toBe('android-manual');
  });
  it('ios', () => {
    expect(detectInstallContext(env(IPHONE_SAFARI))).toBe('ios-safari');
    expect(detectInstallContext(env(IPHONE_CHROME))).toBe('ios-chrome');
    expect(detectInstallContext(env(IPHONE_FIREFOX))).toBe('ios-other');
    expect(detectInstallContext(env(IPAD_DESKTOP, { maxTouchPoints: 5 }))).toBe('ios-safari');
  });
  it('desktop', () => {
    expect(detectInstallContext(env(WINDOWS))).toBe('desktop');
    expect(detectInstallContext(env(WINDOWS, { hasPrompt: true }))).toBe('prompt');
  });
});

describe('isMobileEnv', () => {
  it('is true for Android and iPad, false for desktop', () => {
    expect(isMobileEnv(env(ANDROID))).toBe(true);
    expect(isMobileEnv(env(IPAD_DESKTOP, { maxTouchPoints: 5 }))).toBe(true);
    expect(isMobileEnv(env(WINDOWS))).toBe(false);
  });
});

describe('iosMajorVersion', () => {
  it('reads the iOS version', () => {
    expect(iosMajorVersion(IPHONE_SAFARI)).toBe(18);
    expect(iosMajorVersion(IPHONE_26)).toBe(26);
    expect(iosMajorVersion(ANDROID)).toBeNull();
  });
});

function fakePrompt(outcome: 'accepted' | 'dismissed') {
  const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: string }>;
  };
  e.prompt = vi.fn(() => Promise.resolve());
  e.userChoice = Promise.resolve({ outcome });
  return e;
}

describe('capture and prompt', () => {
  beforeEach(() => {
    localStorage.clear();
    startInstallCapture();
  });

  it('stores the prompt once and prevents the default', () => {
    startInstallCapture();
    const e = fakePrompt('accepted');
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(currentInstallEnv().hasPrompt).toBe(true);
  });

  it('accepted → installed, then unavailable', async () => {
    window.dispatchEvent(fakePrompt('accepted'));
    expect(await promptInstall()).toBe('accepted');
    expect(installStore.isInstalled()).toBe(true);
    expect(currentInstallEnv().hasPrompt).toBe(false);
    expect(await promptInstall()).toBe('unavailable');
  });

  it('dismissed is not installed', async () => {
    localStorage.clear();
    window.dispatchEvent(fakePrompt('dismissed'));
    expect(await promptInstall()).toBe('dismissed');
    expect(installStore.isInstalled()).toBe(false);
  });

  it('appinstalled marks installed', () => {
    localStorage.clear();
    window.dispatchEvent(new Event('appinstalled'));
    expect(installStore.isInstalled()).toBe(true);
  });
});

describe('installStore without storage', () => {
  afterEach(() => vi.restoreAllMocks());
  it('never throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error();
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error();
    });
    expect(installStore.isDismissed()).toBe(false);
    expect(installStore.visits()).toBe(0);
    expect(() => installStore.dismiss()).not.toThrow();
    expect(() => installStore.countVisit()).not.toThrow();
  });
});
