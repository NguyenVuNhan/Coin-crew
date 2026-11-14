import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  currentPushEnv,
  detectPushState,
  getBrowserSubscription,
  pushStore,
  subscribeBrowser,
  unsubscribeBrowser,
  usePushState,
  type PushEnv,
} from '../push';

const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1';
const WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const ZALO_UA =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36 Zalo/24.1';

const env = (ua: string, over: Partial<PushEnv> = {}): PushEnv => ({
  ua,
  maxTouchPoints: 0,
  standalone: false,
  hasPrompt: false,
  hasPushApi: true,
  permission: 'default',
  ...over,
});

describe('detectPushState', () => {
  it('desktop UA → hidden', () => {
    expect(detectPushState(env(WINDOWS))).toBe('hidden');
  });

  it('Android Chrome default → not-asked', () => {
    expect(detectPushState(env(ANDROID, { permission: 'default' }))).toBe('not-asked');
  });

  it('denied → blocked', () => {
    expect(detectPushState(env(ANDROID, { permission: 'denied' }))).toBe('blocked');
  });

  it('granted → granted', () => {
    expect(detectPushState(env(ANDROID, { permission: 'granted' }))).toBe('granted');
  });

  it('Zalo UA → unsupported', () => {
    expect(detectPushState(env(ZALO_UA))).toBe('unsupported');
  });

  it('iPhone Safari not standalone → ios-needs-install', () => {
    expect(detectPushState(env(IPHONE_SAFARI, { standalone: false, hasPushApi: false }))).toBe('ios-needs-install');
  });

  it('iPhone standalone with push API → not-asked', () => {
    expect(detectPushState(env(IPHONE_SAFARI, { standalone: true, hasPushApi: true, permission: 'default' }))).toBe(
      'not-asked',
    );
  });

  it('Android without PushManager → unsupported', () => {
    expect(detectPushState(env(ANDROID, { hasPushApi: false }))).toBe('unsupported');
  });
});

describe('pushStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dismiss persists and survives a throwing localStorage', () => {
    expect(pushStore.isDismissed()).toBe(false);
    pushStore.dismiss();
    expect(pushStore.isDismissed()).toBe(true);
    expect(localStorage.getItem('cc.push.dismissed')).toBe('1');

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(pushStore.isDismissed()).toBe(false);
    expect(() => pushStore.dismiss()).not.toThrow();
  });
});

describe('subscribeBrowser, unsubscribeBrowser, and usePushState', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('converts base64url publicKey to Uint8Array and updates usePushState on subscribe/unsubscribe and visibilitychange', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ANDROID);
    let currentPerm: NotificationPermission = 'default';
    const requestPermission = vi.fn(async () => {
      currentPerm = 'granted';
      return currentPerm;
    });
    vi.stubGlobal('Notification', {
      get permission() {
        return currentPerm;
      },
      requestPermission,
    });
    vi.stubGlobal('PushManager', function PushManager() {});

    let activeSub: {
      endpoint: string;
      toJSON: () => PushSubscriptionJSON;
      unsubscribe: () => Promise<boolean>;
    } | null = null;

    const subscribeMock = vi.fn(async (_opts: PushSubscriptionOptionsInit) => {
      activeSub = {
        endpoint: 'https://fcm.googleapis.com/fcm/send/sub-1',
        toJSON: () => ({
          endpoint: 'https://fcm.googleapis.com/fcm/send/sub-1',
          keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
        }),
        unsubscribe: vi.fn(async () => {
          activeSub = null;
          return true;
        }),
      };
      return activeSub;
    });

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: vi.fn(async () => ({
          pushManager: {
            subscribe: subscribeMock,
            getSubscription: vi.fn(async () => activeSub),
          },
        })),
        ready: Promise.resolve({
          pushManager: {
            subscribe: subscribeMock,
            getSubscription: vi.fn(async () => activeSub),
          },
        }),
      },
    });

    expect(currentPushEnv().hasPushApi).toBe(true);
    const { result } = renderHook(() => usePushState());
    expect(result.current).toBe('not-asked');

    // "AQAB" in base64url is bytes [1, 0, 1]
    const subJson = await act(async () => subscribeBrowser('AQAB'));
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(subscribeMock).toHaveBeenCalledTimes(1);
    const passedOpts = subscribeMock.mock.calls[0]![0];
    expect(passedOpts.userVisibleOnly).toBe(true);
    expect(Array.from(passedOpts.applicationServerKey as Uint8Array)).toEqual([1, 0, 1]);
    expect(subJson).toEqual({
      endpoint: 'https://fcm.googleapis.com/fcm/send/sub-1',
      keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
    });
    expect(result.current).toBe('granted');

    expect((await getBrowserSubscription())?.endpoint).toBe('https://fcm.googleapis.com/fcm/send/sub-1');
    const removed = await act(async () => unsubscribeBrowser());
    expect(removed).toBe('https://fcm.googleapis.com/fcm/send/sub-1');
    expect(await getBrowserSubscription()).toBeNull();

    // Simulate user revoking permission in OS settings and returning to the tab
    currentPerm = 'denied';
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current).toBe('blocked');
  });

  it('rejects subscribeBrowser when permission is denied and returns null from unsubscribeBrowser when unsubscribed', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ANDROID);
    let currentPerm: NotificationPermission = 'default';
    vi.stubGlobal('Notification', {
      get permission() {
        return currentPerm;
      },
      requestPermission: vi.fn(async () => {
        currentPerm = 'denied';
        return currentPerm;
      }),
    });
    vi.stubGlobal('PushManager', function PushManager() {});
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: vi.fn(async () => ({
          pushManager: {
            subscribe: vi.fn(),
            getSubscription: vi.fn(async () => null),
          },
        })),
        ready: Promise.resolve({
          pushManager: {
            subscribe: vi.fn(),
            getSubscription: vi.fn(async () => null),
          },
        }),
      },
    });

    const { result } = renderHook(() => usePushState());
    expect(result.current).toBe('not-asked');

    await act(async () => {
      await expect(subscribeBrowser('AQAB')).rejects.toThrow();
    });
    expect(result.current).toBe('blocked');
    expect(await unsubscribeBrowser()).toBeNull();
  });

  it('no registration -> getBrowserSubscription resolves null', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: vi.fn(async () => undefined),
      },
    });
    expect(await getBrowserSubscription()).toBeNull();
  });

  it('unsubscribeBrowser returns the endpoint even if sub.unsubscribe throws', async () => {
    const sub = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/err-1',
      toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/err-1' }),
      unsubscribe: vi.fn(async () => {
        throw new Error('browser unsubscribe failed');
      }),
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: vi.fn(async () => ({
          pushManager: {
            getSubscription: vi.fn(async () => sub),
          },
        })),
      },
    });
    expect(await unsubscribeBrowser()).toBe('https://fcm.googleapis.com/fcm/send/err-1');
    expect(sub.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
