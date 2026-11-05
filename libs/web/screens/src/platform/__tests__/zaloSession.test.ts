import { describe, it, expect, afterEach, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { mockApi } from '../../test/render';
import { fakePlatform } from '../../test/fakePlatform';
import { sessionStore } from '@cc/web-platform/session';
import { zaloHandshake, zaloSignIn } from '@cc/web-data-access/zaloSession';
import { browserPlatform } from '@cc/web-platform';
import { bootApp } from '../../AppRoot';

afterEach(() => {
  sessionStore.reset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const signedInMe = { user: { id: 'u-an', name: 'An', providers: ['zalo'], consentAt: null, email: null }, signIn: { zalo: true } };

describe('zaloHandshake', () => {
  it('signed_in stores the token', async () => {
    const p = fakePlatform();
    await sessionStore.init(p);
    const { calls } = mockApi({ 'POST /api/auth/zalo-mini': { status: 'signed_in', sessionToken: 'sess-1' } });
    expect(await zaloHandshake(p)).toBe('signed_in');
    expect(calls).toEqual([{ method: 'POST', path: '/api/auth/zalo-mini', body: { accessToken: 'zalo-token' } }]);
    expect(sessionStore.token()).toBe('sess-1');
    expect(p.store.get('sessionToken')).toBe('sess-1');
  });

  it('guest stores the deviceId and no token', async () => {
    const p = fakePlatform();
    await sessionStore.init(p);
    mockApi({ 'POST /api/auth/zalo-mini': { status: 'guest', deviceId: 'z_abc' } });
    expect(await zaloHandshake(p)).toBe('guest');
    expect(sessionStore.deviceId()).toBe('z_abc');
    expect(p.store.get('deviceId')).toBe('z_abc');
    expect(sessionStore.token()).toBeNull();
    expect(p.store.has('sessionToken')).toBe(false);
  });

  it('no Zalo access token skips without a request', async () => {
    const p = fakePlatform({ zaloAccessToken: async () => null });
    await sessionStore.init(p);
    const { fetchMock } = mockApi({});
    expect(await zaloHandshake(p)).toBe('skipped');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('bootApp in Zalo', () => {
  it('boot falls back to guest when the handshake fails', async () => {
    const p = fakePlatform();
    const fetchMock = vi.fn(async () => {
      throw new TypeError('network down');
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(bootApp(p)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sessionStore.token()).toBeNull();
    expect(sessionStore.deviceId()).toBeNull();
    expect(p.store.size).toBe(0);
  });

  it('boot falls back to guest when the server rejects the Zalo token', async () => {
    const p = fakePlatform();
    mockApi({
      'POST /api/auth/zalo-mini': () =>
        Response.json({ error: { code: 'ZALO_TOKEN_INVALID', message: 'bad' } }, { status: 401 }),
    });
    await expect(bootApp(p)).resolves.toBeUndefined();
    expect(p.store.size).toBe(0);
  });

  it('boot retries the handshake once after a 401', async () => {
    const p = fakePlatform();
    p.store.set('sessionToken', 'stale');
    const { calls } = mockApi({
      'GET /api/me': () => Response.json({ error: { code: 'UNAUTHENTICATED', message: 'no' } }, { status: 401 }),
      'POST /api/auth/zalo-mini': { status: 'signed_in', sessionToken: 'fresh' },
    });
    await bootApp(p);
    expect(calls.filter((c) => c.path === '/api/auth/zalo-mini')).toHaveLength(1);
    expect(calls.filter((c) => c.path === '/api/me')).toHaveLength(1);
    expect(sessionStore.token()).toBe('fresh');
  });

  it('boot with a stale token the API answers with no user re-runs the handshake once', async () => {
    const p = fakePlatform();
    p.store.set('sessionToken', 'stale');
    const { calls } = mockApi({
      'GET /api/me': { user: null, signIn: { zalo: true } },
      'POST /api/auth/zalo-mini': { status: 'guest', deviceId: 'z_new' },
    });
    await bootApp(p);
    expect(calls.filter((c) => c.path === '/api/auth/zalo-mini')).toHaveLength(1);
    expect(sessionStore.token()).toBeNull();
    expect(p.store.has('sessionToken')).toBe(false);
    expect(sessionStore.deviceId()).toBe('z_new');
  });

  it('boot with a valid stored token does no handshake', async () => {
    const p = fakePlatform();
    p.store.set('sessionToken', 'good');
    const { calls } = mockApi({ 'GET /api/me': signedInMe });
    await bootApp(p);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(['GET /api/me']);
    expect(p.calls.zaloAccessToken).toHaveLength(0);
    expect(sessionStore.token()).toBe('good');
  });

  it('boot without a stored token runs the handshake', async () => {
    const p = fakePlatform();
    const { calls } = mockApi({ 'POST /api/auth/zalo-mini': { status: 'signed_in', sessionToken: 'sess-2' } });
    await bootApp(p);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(['POST /api/auth/zalo-mini']);
    expect(sessionStore.token()).toBe('sess-2');
  });

  it('web platform skips', async () => {
    const { fetchMock } = mockApi({});
    await bootApp(browserPlatform);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await zaloHandshake(browserPlatform)).toBe('skipped');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('boots signed out after an explicit sign-out', async () => {
    const p = fakePlatform();
    p.store.set('signedOut', '1');
    const { fetchMock } = mockApi({ 'POST /api/auth/zalo-mini': { status: 'signed_in', sessionToken: 'sess-x' } });
    await bootApp(p);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sessionStore.token()).toBeNull();
  });
});

describe('zaloSignIn', () => {
  it('declined sends no POST', async () => {
    const p = fakePlatform({ zaloUserInfo: async () => 'declined' });
    await sessionStore.init(p);
    const { fetchMock } = mockApi({});
    expect(await zaloSignIn(p, new QueryClient())).toBe('declined');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('granted posts consent and the profile, stores the token and the Zalo name', async () => {
    const p = fakePlatform();
    await sessionStore.init(p);
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { calls } = mockApi({ 'POST /api/auth/zalo-mini': { status: 'signed_in', sessionToken: 'sess-3' } });
    expect(await zaloSignIn(p, client)).toBe('signed_in');
    expect(calls[0]?.body).toEqual({
      accessToken: 'zalo-token',
      consent: true,
      profile: { name: 'An', avatar: 'https://avatar.test/an.png' },
    });
    expect(sessionStore.token()).toBe('sess-3');
    expect(p.store.get('zaloName')).toBe('An');
    expect(invalidate).toHaveBeenCalledWith();
  });

  it('an empty avatar is sent as null', async () => {
    const p = fakePlatform({ zaloUserInfo: async () => ({ name: 'Bình', avatar: '' }) });
    await sessionStore.init(p);
    const { calls } = mockApi({ 'POST /api/auth/zalo-mini': { status: 'signed_in', sessionToken: 's' } });
    await zaloSignIn(p, new QueryClient());
    expect(calls[0]?.body).toMatchObject({ profile: { name: 'Bình', avatar: null } });
  });

  it('a server error fails without storing a token', async () => {
    const p = fakePlatform();
    await sessionStore.init(p);
    mockApi({
      'POST /api/auth/zalo-mini': () =>
        Response.json({ error: { code: 'ZALO_TOKEN_INVALID', message: 'bad' } }, { status: 401 }),
    });
    expect(await zaloSignIn(p, new QueryClient())).toBe('failed');
    expect(sessionStore.token()).toBeNull();
    expect(p.store.has('zaloName')).toBe(false);
  });
  it('signing in with Zalo again clears the signed-out mark', async () => {
    const p = fakePlatform();
    p.store.set('signedOut', '1');
    await sessionStore.init(p);
    mockApi({ 'POST /api/auth/zalo-mini': { status: 'signed_in', sessionToken: 'sess-4' } });
    expect(await zaloSignIn(p, new QueryClient())).toBe('signed_in');
    expect(p.store.has('signedOut')).toBe(false);
  });
});
