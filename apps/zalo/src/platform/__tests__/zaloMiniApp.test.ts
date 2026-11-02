import { describe, expect, it, vi } from 'vitest';
import { createZaloPlatform, zmpBasename, type ZmpSdk } from '../zaloMiniApp';

const card = { title: 'T', description: 'D', path: 'j/gtok-1', thumbnailUrl: 'https://api.test/og/trip.png', text: 'x', url: 'https://api.test/j/gtok-1' };

function fakeSdk(over: Partial<ZmpSdk> = {}): ZmpSdk {
  const store = new Map<string, string>();
  return {
    openShareSheet: vi.fn(async () => ({ status: '2' })),
    saveImageToGallery: vi.fn(async () => {}),
    openOutApp: vi.fn(async () => {}),
    nativeStorage: {
      getItem: (k) => store.get(k) ?? '',
      setItem: (k, v) => void store.set(k, v),
      removeItem: (k) => void store.delete(k),
    },
    getAccessToken: vi.fn(async () => 'tok'),
    authorize: vi.fn(async () => ({})),
    getUserInfo: vi.fn(async () => ({ userInfo: { name: 'An', avatar: 'https://a.test/an.png' } })),
    getContextAsync: vi.fn(async () => null),
    openProfilePicker: vi.fn(async () => ({ users: [] })),
    ...over,
  };
}

class AppError {
  constructor(public code: number) {}
}

describe('createZaloPlatform', () => {
  it('shares a zmp_deep_link card', async () => {
    const sdk = fakeSdk();
    const p = createZaloPlatform(sdk, 'https://api.test');
    expect(await p.share(card)).toBe('shared');
    expect(sdk.openShareSheet).toHaveBeenCalledWith({
      type: 'zmp_deep_link',
      data: { title: 'T', description: 'D', thumbnail: 'https://api.test/og/trip.png', path: 'j/gtok-1' },
    });
  });

  it('a cancelled share sheet is cancelled, a thrown one failed', async () => {
    expect(await createZaloPlatform(fakeSdk({ openShareSheet: async () => ({ status: '0' }) }), '').share(card)).toBe('cancelled');
    expect(await createZaloPlatform(fakeSdk({ openShareSheet: async () => { throw new Error('x'); } }), '').share(card)).toBe('failed');
  });

  it('saves a PNG to the gallery as a base64 data URL (the format zmp-sdk documents)', async () => {
    const sdk = fakeSdk();
    const p = createZaloPlatform(sdk, '');
    expect(await p.saveImage(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), 'qr.png')).toBe('saved');
    expect(sdk.saveImageToGallery).toHaveBeenCalledWith({ imageBase64Data: 'data:image/png;base64,AQID' });
  });

  it('a refused gallery save failed', async () => {
    const p = createZaloPlatform(fakeSdk({ saveImageToGallery: async () => { throw new AppError(-2); } }), '');
    expect(await p.saveImage(new Blob([]), 'qr.png')).toBe('failed');
  });

  it('opens bank links outside Zalo, blocked when refused', async () => {
    const sdk = fakeSdk();
    expect(await createZaloPlatform(sdk, '').openExternal('https://dl.vietqr.io/x')).toBe('opened');
    expect(sdk.openOutApp).toHaveBeenCalledWith({ url: 'https://dl.vietqr.io/x' });
    expect(await createZaloPlatform(fakeSdk({ openOutApp: async () => { throw new Error('no'); } }), '').openExternal('x')).toBe('blocked');
  });

  it('storage round-trips through native storage; empty reads as null', async () => {
    const p = createZaloPlatform(fakeSdk(), '');
    expect(await p.storage.get('sessionToken')).toBeNull();
    await p.storage.set('sessionToken', 's1');
    expect(await p.storage.get('sessionToken')).toBe('s1');
    await p.storage.remove('sessionToken');
    expect(await p.storage.get('sessionToken')).toBeNull();
  });

  it('access token, or null when Zalo refuses', async () => {
    expect(await createZaloPlatform(fakeSdk(), '').zaloAccessToken()).toBe('tok');
    expect(await createZaloPlatform(fakeSdk({ getAccessToken: async () => { throw new Error('x'); } }), '').zaloAccessToken()).toBeNull();
  });

  it('user info asks for scope.userInfo; -1401 and -201 are declined', async () => {
    const sdk = fakeSdk();
    expect(await createZaloPlatform(sdk, '').zaloUserInfo()).toEqual({ name: 'An', avatar: 'https://a.test/an.png' });
    expect(sdk.authorize).toHaveBeenCalledWith({ scopes: ['scope.userInfo'] });
    expect(sdk.getUserInfo).toHaveBeenCalledWith({ autoRequestPermission: true, avatarType: 'large' });
    for (const code of [-1401, -201]) {
      const p = createZaloPlatform(fakeSdk({ authorize: async () => { throw new AppError(code); } }), '');
      expect(await p.zaloUserInfo()).toBe('declined');
    }
    const other = createZaloPlatform(fakeSdk({ getUserInfo: async () => { throw new AppError(-1); } }), '');
    expect(await other.zaloUserInfo()).toBeNull();
  });

  it('chat context: group chats only count with an id', async () => {
    const ctx = (v: { type?: string; id?: string } | null) => createZaloPlatform(fakeSdk({ getContextAsync: async () => v }), '').chatContext();
    expect(await ctx({ type: 'GROUP_CHAT', id: 'g1' })).toEqual({ type: 'group', id: 'g1' });
    expect(await ctx({ type: 'USER_CHAT', id: 'u1' })).toEqual({ type: 'user', id: 'u1' });
    expect(await ctx({ type: '', id: '' })).toBeNull();
    expect(await ctx(null)).toBeNull();
  });

  it('friend picker keeps the profiles Zalo returned', async () => {
    const sdk = fakeSdk({
      openProfilePicker: vi.fn(async () => ({
        users: [
          { id: 'z1', profile: { name: 'Dũng', avatar: 'https://a.test/d.png' }, code: 0 },
          { id: 'z2', code: -1 },
        ],
      })),
    });
    expect(await createZaloPlatform(sdk, '').pickZaloFriends(10)).toEqual([{ zaloId: 'z1', name: 'Dũng', avatar: 'https://a.test/d.png' }]);
    expect(sdk.openProfilePicker).toHaveBeenCalledWith({ maxProfile: 10 });
  });

  it('kind and apiBase', () => {
    const p = createZaloPlatform(fakeSdk(), 'https://coin-crew.example.workers.dev');
    expect(p.kind).toBe('zmp');
    expect(p.apiBase).toBe('https://coin-crew.example.workers.dev');
  });
});

describe('zmpBasename', () => {
  it('finds the /zapps/<id> prefix', () => {
    expect(zmpBasename('/zapps/1234567/j/gtok-1')).toBe('/zapps/1234567');
    expect(zmpBasename('/zapps/1234567')).toBe('/zapps/1234567');
    expect(zmpBasename('/j/gtok-1')).toBe('');
  });

  it('keeps the version segment of a testing build', () => {
    expect(zmpBasename('/zapps/2974436365831148474/6/')).toBe('/zapps/2974436365831148474/6');
    expect(zmpBasename('/zapps/2974436365831148474/6/j/gtok-1')).toBe('/zapps/2974436365831148474/6');
    expect(zmpBasename('/zapps/2974436365831148474/6')).toBe('/zapps/2974436365831148474/6');
    expect(zmpBasename('/zapps/2974436365831148474/j/gtok-1')).toBe('/zapps/2974436365831148474');
  });
});
