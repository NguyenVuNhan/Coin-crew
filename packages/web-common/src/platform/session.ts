import type { PlatformBridge } from './index';

let platform: PlatformBridge | null = null;
let currentToken: string | null = null;
let currentDeviceId: string | null = null;

export const sessionStore = {
  async init(p: PlatformBridge): Promise<void> {
    platform = p;
    const [t, d] = await Promise.all([
      p.storage.get('sessionToken'),
      p.storage.get('deviceId'),
    ]);
    currentToken = t;
    currentDeviceId = d;
  },

  token(): string | null {
    if (!platform) {
      return null;
    }
    return currentToken;
  },

  async setToken(t: string | null): Promise<void> {
    currentToken = t;
    if (platform) {
      if (t === null) {
        await platform.storage.remove('sessionToken');
      } else {
        await platform.storage.set('sessionToken', t);
      }
    }
  },

  deviceId(): string | null {
    if (!platform) {
      try {
        return typeof localStorage !== 'undefined' ? localStorage.getItem('deviceId') : null;
      } catch {
        return null;
      }
    }
    return currentDeviceId;
  },

  async setDeviceId(id: string): Promise<void> {
    currentDeviceId = id;
    if (platform) {
      await platform.storage.set('deviceId', id);
    } else {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('deviceId', id);
        }
      } catch {
        // ignore
      }
    }
  },

  apiBase(): string {
    if (!platform) {
      return '';
    }
    return platform.apiBase;
  },

  reset(): void {
    platform = null;
    currentToken = null;
    currentDeviceId = null;
  },
};
