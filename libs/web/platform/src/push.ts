import { useSyncExternalStore } from 'react';
import { isIosDevice } from './browser';
import { currentInstallEnv, isInAppBrowser, isMobileEnv, type InstallEnv } from './install';

export type PushState = 'hidden' | 'unsupported' | 'ios-needs-install' | 'not-asked' | 'blocked' | 'granted';

export interface PushEnv extends InstallEnv {
  hasPushApi: boolean;
  permission: NotificationPermission | null;
}

const KEY_DISMISSED = 'cc.push.dismissed';

const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((l) => l());
}

export const pushStore = {
  isDismissed(): boolean {
    try {
      return localStorage.getItem(KEY_DISMISSED) === '1';
    } catch {
      return false;
    }
  },
  dismiss(): void {
    try {
      localStorage.setItem(KEY_DISMISSED, '1');
    } catch {
      // storage unavailable: the prompt just may show again
    }
    notify();
  },
};

export function currentPushEnv(): PushEnv {
  const install = currentInstallEnv();
  const hasPushApi =
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    Boolean(navigator.serviceWorker) &&
    typeof PushManager !== 'undefined' &&
    typeof Notification !== 'undefined';
  let permission: NotificationPermission | null = null;
  try {
    permission = typeof Notification !== 'undefined' ? (Notification.permission ?? null) : null;
  } catch {
    permission = null;
  }
  return {
    ...install,
    hasPushApi,
    permission,
  };
}

export function detectPushState(env: PushEnv): PushState {
  if (!isMobileEnv(env)) return 'hidden';
  if (isInAppBrowser(env.ua)) return 'unsupported';
  if (!env.standalone && isIosDevice({ userAgent: env.ua, maxTouchPoints: env.maxTouchPoints } as Navigator)) {
    return 'ios-needs-install';
  }
  if (!env.hasPushApi) return 'unsupported';
  if (env.permission === 'denied') return 'blocked';
  if (env.permission === 'granted') return 'granted';
  return 'not-asked';
}

function subscribePushState(listener: () => void): () => void {
  listeners.add(listener);
  const onVisibilityChange = () => listener();
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }
  return () => {
    listeners.delete(listener);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    }
  };
}

function getPushSnapshot(): PushState {
  return detectPushState(currentPushEnv());
}

export function usePushState(): PushState {
  return useSyncExternalStore(subscribePushState, getPushSnapshot, () => 'hidden');
}

function b64urlToBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

export async function getBrowserSubscription(): Promise<PushSubscription | null> {
  if (
    typeof navigator === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !navigator.serviceWorker ||
    typeof navigator.serviceWorker.getRegistration !== 'function'
  ) {
    return null;
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg?.pushManager) return null;
    return (await reg.pushManager.getSubscription()) ?? null;
  } catch {
    return null;
  }
}

export async function subscribeBrowser(publicKey: string): Promise<PushSubscriptionJSON> {
  if (typeof Notification === 'undefined' || typeof Notification.requestPermission !== 'function') {
    throw new Error('Push notifications are not supported');
  }
  const permission = await Notification.requestPermission();
  notify();
  if (permission !== 'granted') {
    throw new Error('Notification permission denied');
  }
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator) || !navigator.serviceWorker) {
    throw new Error('Service worker is not supported');
  }
  const reg = await navigator.serviceWorker.ready;
  if (!reg?.pushManager) {
    throw new Error('PushManager is not supported');
  }
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: b64urlToBytes(publicKey),
  });
  notify();
  return typeof sub.toJSON === 'function' ? sub.toJSON() : (sub as unknown as PushSubscriptionJSON);
}

export async function unsubscribeBrowser(): Promise<string | null> {
  const sub = await getBrowserSubscription();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  try {
    await sub.unsubscribe();
  } catch {
    // Best-effort: return endpoint even if browser unsubscribe throws
  } finally {
    notify();
  }
  return endpoint;
}
