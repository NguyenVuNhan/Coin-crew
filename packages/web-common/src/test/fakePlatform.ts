import type { PlatformBridge, PlatformStorage, ShareCard, ZaloFriend } from '../platform';

/** Every recorded method, so `calls.share` etc. are always defined. */
export type FakeCallName =
  | 'share' | 'saveImage' | 'openExternal' | 'zaloAccessToken' | 'zaloUserInfo' | 'chatContext' | 'pickZaloFriends'
  | 'storage.get' | 'storage.set' | 'storage.remove';
export type FakePlatform = PlatformBridge & { calls: Record<FakeCallName, unknown[][]>; store: Map<string, string> };

export function fakePlatform(overrides: Partial<PlatformBridge> = {}): FakePlatform {
  const store = new Map<string, string>();
  const calls: Record<FakeCallName, unknown[][]> = {
    share: [],
    saveImage: [],
    openExternal: [],
    zaloAccessToken: [],
    zaloUserInfo: [],
    chatContext: [],
    pickZaloFriends: [],
    'storage.get': [],
    'storage.set': [],
    'storage.remove': [],
  };

  function record(method: FakeCallName, args: unknown[]): void {
    calls[method].push(args);
  }

  const storage: PlatformStorage = {
    async get(key: string): Promise<string | null> {
      record('storage.get', [key]);
      if (overrides.storage?.get) {
        return overrides.storage.get(key);
      }
      return store.get(key) ?? null;
    },
    async set(key: string, value: string): Promise<void> {
      record('storage.set', [key, value]);
      if (overrides.storage?.set) {
        return overrides.storage.set(key, value);
      }
      store.set(key, value);
    },
    async remove(key: string): Promise<void> {
      record('storage.remove', [key]);
      if (overrides.storage?.remove) {
        return overrides.storage.remove(key);
      }
      store.delete(key);
    },
  };

  const platform: FakePlatform = {
    kind: overrides.kind ?? 'zmp',
    apiBase: overrides.apiBase ?? 'https://api.test',
    storage,
    async share(card: ShareCard): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
      record('share', [card]);
      if (overrides.share) {
        return overrides.share(card);
      }
      return 'shared';
    },
    async saveImage(png: Blob, fileName: string): Promise<'saved' | 'cancelled' | 'failed'> {
      record('saveImage', [png, fileName]);
      if (overrides.saveImage) {
        return overrides.saveImage(png, fileName);
      }
      return 'saved';
    },
    async openExternal(url: string): Promise<'opened' | 'blocked'> {
      record('openExternal', [url]);
      if (overrides.openExternal) {
        return overrides.openExternal(url);
      }
      return 'opened';
    },
    async zaloAccessToken(): Promise<string | null> {
      record('zaloAccessToken', []);
      if (overrides.zaloAccessToken) {
        return overrides.zaloAccessToken();
      }
      return 'zalo-token';
    },
    async zaloUserInfo(): Promise<{ name: string; avatar: string } | 'declined' | null> {
      record('zaloUserInfo', []);
      if (overrides.zaloUserInfo) {
        return overrides.zaloUserInfo();
      }
      return { name: 'An', avatar: 'https://avatar.test/an.png' };
    },
    async chatContext(): Promise<{ type: 'user' | 'group'; id: string } | null> {
      record('chatContext', []);
      if (overrides.chatContext) {
        return overrides.chatContext();
      }
      return null;
    },
    async pickZaloFriends(max: number): Promise<ZaloFriend[] | null> {
      record('pickZaloFriends', [max]);
      if (overrides.pickZaloFriends) {
        return overrides.pickZaloFriends(max);
      }
      return [];
    },
    calls,
    store,
  };

  return platform;
}
