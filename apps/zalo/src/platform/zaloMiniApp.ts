import type { PlatformBridge, ShareCard, ZaloFriend } from '@fsl/web-common';

/** The slice of `zmp-sdk` the platform uses; tests hand in a fake with the same shape. */
export interface ZmpSdk {
  openShareSheet(args: {
    type: 'zmp_deep_link';
    data: { title: string; description: string; thumbnail: string; path: string };
  }): Promise<{ status?: string | number } | undefined>;
  saveImageToGallery(args: { imageBase64Data: string }): Promise<void>;
  openOutApp(args: { url: string }): Promise<void>;
  nativeStorage: { getItem(key: string): string; setItem(key: string, value: string): void; removeItem(key: string): void };
  getAccessToken(): Promise<string>;
  authorize(args: { scopes: string[] }): Promise<unknown>;
  getUserInfo(args: { autoRequestPermission: boolean; avatarType: 'large' }): Promise<{ userInfo: { name: string; avatar: string } }>;
  getContextAsync(): Promise<{ type?: string; id?: string } | null>;
  openProfilePicker(args: { maxProfile: number }): Promise<{ users: { id: string; profile?: { name?: string; avatar?: string }; code?: number }[] }>;
}

/** Zalo's "user declined" error codes for the name-and-avatar permission. */
const DECLINED = new Set([-1401, -201]);

function errorCode(err: unknown): number | null {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'number' ? code : null;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** The Mini App's PlatformBridge: everything Zalo-native goes through `sdk`. */
export function createZaloPlatform(sdk: ZmpSdk, apiOrigin: string): PlatformBridge {
  return {
    kind: 'zmp',
    apiBase: apiOrigin,
    storage: {
      async get(key) {
        try {
          const value = sdk.nativeStorage.getItem(key);
          return value === '' || value === undefined || value === null ? null : value;
        } catch {
          return null;
        }
      },
      async set(key, value) {
        try {
          sdk.nativeStorage.setItem(key, value);
        } catch {
          // storage full or unavailable: the app still works for this session
        }
      },
      async remove(key) {
        try {
          sdk.nativeStorage.removeItem(key);
        } catch {
          // nothing to do
        }
      },
    },
    async share(card: ShareCard) {
      try {
        const res = await sdk.openShareSheet({
          type: 'zmp_deep_link',
          data: { title: card.title, description: card.description, thumbnail: card.thumbnailUrl, path: card.path },
        });
        return String(res?.status ?? '') === '0' ? 'cancelled' : 'shared';
      } catch {
        return 'failed';
      }
    },
    async saveImage(png: Blob): Promise<'saved' | 'cancelled' | 'failed'> {
      try {
        // Native SAVE_IMAGE_GALLERY wants a full data URL, not bare base64 (see the zmp-sdk docs example).
        const type = png.type || 'image/png';
        await sdk.saveImageToGallery({ imageBase64Data: `data:${type};base64,${await blobToBase64(png)}` });
        return 'saved';
      } catch {
        return 'failed';
      }
    },
    async openExternal(url: string) {
      try {
        await sdk.openOutApp({ url });
        return 'opened';
      } catch {
        return 'blocked';
      }
    },
    async zaloAccessToken() {
      try {
        const token = await sdk.getAccessToken();
        return token ? token : null;
      } catch {
        return null;
      }
    },
    async zaloUserInfo() {
      try {
        await sdk.authorize({ scopes: ['scope.userInfo'] });
        const { userInfo } = await sdk.getUserInfo({ autoRequestPermission: true, avatarType: 'large' });
        return { name: userInfo.name, avatar: userInfo.avatar };
      } catch (err) {
        const code = errorCode(err);
        return code !== null && DECLINED.has(code) ? 'declined' : null;
      }
    },
    async chatContext() {
      try {
        const ctx = await sdk.getContextAsync();
        if (ctx?.type === 'GROUP_CHAT' && ctx.id) return { type: 'group', id: ctx.id };
        if (ctx?.type === 'USER_CHAT' && ctx.id) return { type: 'user', id: ctx.id };
        return null;
      } catch {
        return null;
      }
    },
    async pickZaloFriends(max: number) {
      try {
        // zmp-sdk rejects maxProfile outside 1..10 before the picker opens.
        const maxProfile = Math.min(10, Math.max(1, Math.floor(max)));
        const { users } = await sdk.openProfilePicker({ maxProfile });
        return users
          .filter((u) => (u.code === undefined || u.code === 0) && u.id && u.profile?.name)
          .map((u): ZaloFriend => ({ zaloId: u.id, name: u.profile!.name!, avatar: u.profile?.avatar ?? '' }));
      } catch {
        return null;
      }
    },
  };
}

/**
 * The path prefix Zalo serves the Mini App under, or '' when run locally: `/zapps/<appId>` for the live version,
 * `/zapps/<appId>/<version>` for a development or testing version (app routes never start with a number).
 */
export function zmpBasename(pathname: string): string {
  const match = /^\/zapps\/[^/]+(?:\/\d+(?=\/|$))?/.exec(pathname);
  return match ? match[0] : '';
}
