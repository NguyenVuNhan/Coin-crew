import { describe, it, expect, vi, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import { call, cookiesFrom, cookieHeader, unsignedJwt, memberSid } from './helpers';
import { sha256Hex } from '../src/lib/ids';
import { getDb } from '../src/db/client';
import { upsertIdentity } from '../src/auth/identity';

const realFetch = globalThis.fetch;

function mockZaloFetch(
  profile: Record<string, unknown>,
  tokenResponse: Record<string, unknown> = { access_token: 'at' },
) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith('https://oauth.zaloapp.com/v4/access_token')) {
      return Response.json(tokenResponse);
    }
    if (url.startsWith('https://graph.zalo.me/v2.0/me')) {
      return Response.json(profile);
    }
    return realFetch(input, init);
  });
}

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

function mockGoogleToken(claims: Record<string, unknown>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith(GOOGLE_TOKEN_URL)) {
      return Response.json({
        access_token: 'at',
        token_type: 'Bearer',
        expires_in: 3600,
        id_token: unsignedJwt(claims),
      });
    }
    return realFetch(input, init);
  });
}

async function linkZalo(
  sid: string | null,
  zaloId: string,
  zaloName = 'Zalo Name',
  intent = 'link',
  returnTo = '/trips',
) {
  const startHeaders: Record<string, string> = {};
  if (sid) {
    startHeaders.Cookie = `sid=${sid}`;
  }
  const start = await call(
    `/api/auth/zalo/start?returnTo=${encodeURIComponent(returnTo)}&intent=${encodeURIComponent(intent)}`,
    { headers: startHeaders },
  );
  const startCookies = cookiesFrom(start);
  const location = start.headers.get('Location');
  const state = location ? (new URL(location).searchParams.get('state') ?? '') : '';

  mockZaloFetch({
    id: zaloId,
    name: zaloName,
    picture: {
      data: {
        url: 'https://p.zalo/z.png',
      },
    },
  });

  const cbCookies: Record<string, string> = { ...startCookies };
  if (sid) {
    cbCookies.sid = sid;
  }
  const cb = await call(`/api/auth/zalo/callback?code=c&state=${encodeURIComponent(state)}`, {
    headers: {
      Cookie: cookieHeader(cbCookies),
    },
  });

  return { start, cb };
}

async function addSession(sid: string, userId: string): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO sessions (id_hash, user_id, expires_at) VALUES (?, ?, ?)',
  )
    .bind(await sha256Hex(sid), userId, '2099-01-01T00:00:00.000Z')
    .run();
}

function accept(id: string, sid?: string): Promise<Response> {
  return call(`/api/me/merge-requests/${id}/accept`, {
    method: 'POST',
    headers: sid ? { Cookie: `sid=${sid}` } : {},
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('users.zalo_name tracking', () => {
  it('stores the Zalo name on a first Zalo sign-in', async () => {
    const { cb } = await linkZalo(null, 'z-1', 'Noah Zalo');
    expect(cb.status).toBe(302);

    const found = await env.DB.prepare('SELECT id FROM users WHERE zalo_sub = ?')
      .bind('z-1')
      .first<{ id: string }>();
    expect(found).toBeDefined();

    const user = await env.DB.prepare('SELECT zalo_name, name FROM users WHERE id = ?')
      .bind(found!.id)
      .first<{ zalo_name: string | null; name: string }>();

    expect(user?.zalo_name).toBe('Noah Zalo');
  });

  it('refreshes the Zalo name on a later sign-in without changing an edited name', async () => {
    const userId = 'u-z-9';
    await env.DB.prepare(
      'INSERT INTO users (id, zalo_sub, name, custom_profile, zalo_name, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
      .bind(userId, 'z-9', 'Minh tự đặt', 1, 'Old', '2026-10-12T00:00:00.000Z')
      .run();

    const { cb } = await linkZalo(null, 'z-9', 'Noah Mới');
    expect(cb.status).toBe(302);

    const user = await env.DB.prepare('SELECT zalo_name, name FROM users WHERE id = ?')
      .bind(userId)
      .first<{ zalo_name: string | null; name: string }>();

    expect(user?.zalo_name).toBe('Noah Mới');
    expect(user?.name).toBe('Minh tự đặt');
  });

  it('sets the Zalo name when linking and changing Zalo', async () => {
    const sid = await memberSid('u-a', 'Anh');

    const { cb: cbLink1 } = await linkZalo(sid, 'z-2', 'Zalo A', 'link');
    expect(cbLink1.status).toBe(302);

    const user1 = await env.DB.prepare('SELECT zalo_name, name FROM users WHERE id = ?')
      .bind('u-a')
      .first<{ zalo_name: string | null; name: string }>();
    expect(user1?.zalo_name).toBe('Zalo A');

    const { cb: cbLink2 } = await linkZalo(sid, 'z-3', 'Zalo B', 'link');
    expect(cbLink2.status).toBe(302);

    const user2 = await env.DB.prepare('SELECT zalo_name, name FROM users WHERE id = ?')
      .bind('u-a')
      .first<{ zalo_name: string | null; name: string }>();
    expect(user2?.zalo_name).toBe('Zalo B');
  });

  it('clears the Zalo name on unlink', async () => {
    const userId = 'u-dual';
    await env.DB.prepare(
      'INSERT INTO users (id, google_sub, zalo_sub, email, name, custom_profile, zalo_name, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)',
    )
      .bind(
        userId,
        'g-dual',
        'z-dual',
        'dual@example.com',
        'Dual User',
        'Zalo Dual',
        '2026-10-12T00:00:00.000Z',
      )
      .run();

    const sid = `sid-${userId}-${crypto.randomUUID()}`;
    await addSession(sid, userId);

    const res = await call('/api/me/identities/zalo', {
      method: 'DELETE',
      headers: { Cookie: `sid=${sid}` },
    });
    expect(res.status).toBe(200);

    const user = await env.DB.prepare('SELECT zalo_name, name FROM users WHERE id = ?')
      .bind(userId)
      .first<{ zalo_name: string | null; name: string }>();
    expect(user?.zalo_name).toBeNull();
  });

  it('keeps the Zalo name that goes with the surviving zalo_sub after a merge', async () => {
    const CREATED = '2026-10-12T00:00:00.000Z';
    const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const now = new Date().toISOString();

    // (a) provider zalo: A has google only, B has zalo_sub z-b with zalo_name 'B Zalo'; after accept, u-a.zalo_name==='B Zalo'.
    await env.DB.prepare(
      'INSERT INTO users (id, google_sub, zalo_sub, email, name, custom_profile, zalo_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind('u-a', 'g-a', null, 'a@example.com', 'Anh A', 0, null, CREATED)
      .run();
    await env.DB.prepare(
      'INSERT INTO users (id, google_sub, zalo_sub, email, name, custom_profile, zalo_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind('u-b', null, 'z-b', null, 'Bé Chi', 0, 'B Zalo', CREATED)
      .run();

    await addSession('sid-b1', 'u-b');

    await env.DB.prepare(
      'INSERT INTO account_merge_requests (id, survivor_user_id, merged_user_id, provider, provider_sub, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind('mr-1', 'u-a', 'u-b', 'zalo', 'z-b', 'pending', now, expiresAt)
      .run();

    const resA = await accept('mr-1', 'sid-b1');
    expect(resA.status).toBe(200);

    const uaAfterZaloMerge = await env.DB.prepare('SELECT zalo_name, name FROM users WHERE id = ?')
      .bind('u-a')
      .first<{ zalo_name: string | null; name: string }>();
    expect(uaAfterZaloMerge?.zalo_name).toBe('B Zalo');

    // Clean up minimal fixtures before case (b)
    await env.DB.prepare('DELETE FROM account_merge_requests').run();
    await env.DB.prepare('DELETE FROM sessions').run();
    await env.DB.prepare('DELETE FROM users').run();

    // (b) provider google: A has google_sub g-a AND zalo_sub z-a with zalo_name 'A Zalo'; B has google_sub g-b and zalo_sub null; after accept u-a.zalo_name==='A Zalo'.
    await env.DB.prepare(
      'INSERT INTO users (id, google_sub, zalo_sub, email, name, custom_profile, zalo_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind('u-a', 'g-a', 'z-a', 'a@example.com', 'Anh A', 0, 'A Zalo', CREATED)
      .run();
    await env.DB.prepare(
      'INSERT INTO users (id, google_sub, zalo_sub, email, name, custom_profile, zalo_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind('u-b', 'g-b', null, 'b@example.com', 'Bé Chi', 0, null, CREATED)
      .run();

    await addSession('sid-b1', 'u-b');

    await env.DB.prepare(
      'INSERT INTO account_merge_requests (id, survivor_user_id, merged_user_id, provider, provider_sub, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind('mr-2', 'u-a', 'u-b', 'google', 'g-b', 'pending', now, expiresAt)
      .run();

    const resB = await accept('mr-2', 'sid-b1');
    expect(resB.status).toBe(200);

    const uaAfterGoogleMerge = await env.DB.prepare('SELECT zalo_name, name FROM users WHERE id = ?')
      .bind('u-a')
      .first<{ zalo_name: string | null; name: string }>();
    expect(uaAfterGoogleMerge?.zalo_name).toBe('A Zalo');
  });

  it('a sign-in without the name keeps the Zalo name a user already has', async () => {
    const db = getDb(env);
    const id = await upsertIdentity(db, 'zalo', { sub: 'z-withheld', name: 'Chi Zalo', avatarUrl: null });

    await upsertIdentity(db, 'zalo', { sub: 'z-withheld', name: 'Zalo', avatarUrl: null, nameWithheld: true });

    const row = await env.DB.prepare('SELECT zalo_name, name FROM users WHERE id = ?')
      .bind(id)
      .first<{ zalo_name: string | null; name: string }>();
    expect(row).toEqual({ zalo_name: 'Chi Zalo', name: 'Chi Zalo' });
  });
});
