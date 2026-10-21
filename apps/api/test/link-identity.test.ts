import { describe, it, expect, vi, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import { call, cookiesFrom, cookieHeader, unsignedJwt, memberSid } from './helpers';
import { sha256Hex } from '../src/lib/ids';

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
    name: 'Zalo Name',
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

async function linkGoogle(
  sid: string | null,
  claims: Record<string, unknown>,
  intent = 'link',
  returnTo = '/trips',
) {
  const startHeaders: Record<string, string> = {};
  if (sid) {
    startHeaders.Cookie = `sid=${sid}`;
  }
  const start = await call(
    `/api/auth/google/start?returnTo=${encodeURIComponent(returnTo)}&intent=${encodeURIComponent(intent)}`,
    { headers: startHeaders },
  );
  const startCookies = cookiesFrom(start);
  const location = start.headers.get('Location');
  const state = location ? (new URL(location).searchParams.get('state') ?? '') : '';

  mockGoogleToken(claims);

  const cbCookies: Record<string, string> = { ...startCookies };
  if (sid) {
    cbCookies.sid = sid;
  }
  const cb = await call(`/api/auth/google/callback?code=abc&state=${encodeURIComponent(state)}`, {
    headers: {
      Cookie: cookieHeader(cbCookies),
    },
  });

  return { start, cb };
}

async function createZaloUser(
  userId: string,
  zaloSub: string,
  name = 'Zalo User',
  customProfile = 0,
): Promise<string> {
  await env.DB.prepare(
    'INSERT INTO users (id, zalo_sub, name, custom_profile, created_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(userId, zaloSub, name, customProfile, '2026-10-12T00:00:00.000Z')
    .run();
  const sid = `sid-${userId}-${crypto.randomUUID()}`;
  await env.DB.prepare(
    'INSERT INTO sessions (id_hash, user_id, expires_at) VALUES (?, ?, ?)',
  )
    .bind(await sha256Hex(sid), userId, '2099-01-01T00:00:00.000Z')
    .run();
  return sid;
}

async function createDualUser(
  userId: string,
  googleSub: string,
  zaloSub: string,
  email = `${userId}@example.com`,
  name = 'Dual User',
): Promise<string> {
  await env.DB.prepare(
    'INSERT INTO users (id, google_sub, zalo_sub, email, name, custom_profile, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
  )
    .bind(userId, googleSub, zaloSub, email, name, '2026-10-12T00:00:00.000Z')
    .run();
  const sid = `sid-${userId}-${crypto.randomUUID()}`;
  await env.DB.prepare(
    'INSERT INTO sessions (id_hash, user_id, expires_at) VALUES (?, ?, ?)',
  )
    .bind(await sha256Hex(sid), userId, '2099-01-01T00:00:00.000Z')
    .run();
  return sid;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Identity linking and unlinking', () => {
  it('links Zalo to a Google user', async () => {
    const sid = await memberSid('u-a', 'Anh');
    const { cb } = await linkZalo(sid, 'z-1');
    expect(cb.status).toBe(302);
    expect(cb.headers.get('Location')).toBe('/trips?linked=zalo');

    const user = await env.DB.prepare(
      'SELECT id, google_sub, zalo_sub, email, name, avatar_url FROM users WHERE id = ?',
    )
      .bind('u-a')
      .first<{
        id: string;
        google_sub: string | null;
        zalo_sub: string | null;
        email: string | null;
        name: string;
        avatar_url: string | null;
      }>();

    expect(user?.google_sub).toBe('g-u-a');
    expect(user?.zalo_sub).toBe('z-1');
    expect(user?.name).toBe('Anh');
    expect(user?.avatar_url).toBeNull();

    expect(cookiesFrom(cb).sid).toBeUndefined();
  });

  it('changes Zalo to a new unused identity', async () => {
    const userId = 'u-zalo-old';
    const sid = await createZaloUser(userId, 'z-old', 'Old User');

    const { cb: cbLink } = await linkZalo(sid, 'z-new');
    expect(cbLink.status).toBe(302);
    expect(cbLink.headers.get('Location')).toBe('/trips?linked=zalo');

    const user = await env.DB.prepare('SELECT id, zalo_sub FROM users WHERE id = ?')
      .bind(userId)
      .first<{ id: string; zalo_sub: string }>();
    expect(user?.zalo_sub).toBe('z-new');

    const { cb: cbSignIn } = await linkZalo(null, 'z-old', 'signin');
    expect(cbSignIn.status).toBe(302);
    const newSid = cookiesFrom(cbSignIn).sid;
    expect(newSid).toBeTruthy();

    const newUser = await env.DB.prepare('SELECT id, zalo_sub FROM users WHERE zalo_sub = ?')
      .bind('z-old')
      .first<{ id: string; zalo_sub: string }>();
    expect(newUser).toBeDefined();
    expect(newUser?.id).not.toBe(userId);
    expect(newUser?.zalo_sub).toBe('z-old');
  });

  it('linking my own identity again is a no-op', async () => {
    const existing = await env.DB.prepare("SELECT id FROM users WHERE zalo_sub = 'z-1'").first<{ id: string }>();
    let userId: string;
    let sid: string;
    if (existing) {
      userId = existing.id;
      sid = `sid-${userId}-${crypto.randomUUID()}`;
      await env.DB.prepare('INSERT INTO sessions (id_hash, user_id, expires_at) VALUES (?, ?, ?)')
        .bind(await sha256Hex(sid), userId, '2099-01-01T00:00:00.000Z')
        .run();
    } else {
      userId = 'u-noop';
      sid = await createZaloUser(userId, 'z-1', 'Noop User');
    }

    const before = await env.DB.prepare('SELECT id, google_sub, zalo_sub, email, name, avatar_url FROM users WHERE id = ?')
      .bind(userId)
      .first();

    const { cb } = await linkZalo(sid, 'z-1');
    expect(cb.status).toBe(302);
    expect(cb.headers.get('Location')).toBe('/trips?linked=zalo');

    const after = await env.DB.prepare('SELECT id, google_sub, zalo_sub, email, name, avatar_url FROM users WHERE id = ?')
      .bind(userId)
      .first();
    expect(after).toEqual(before);
  });

  it('intent=link without a session signs in instead', async () => {
    const { start, cb } = await linkZalo(null, 'z-link-nosid', 'link', '/trips');
    expect(cookiesFrom(start).zalo_oauth_intent).toBe('signin');
    expect(cb.status).toBe(302);
    expect(cb.headers.get('Location')).toBe('/trips');

    const sid = cookiesFrom(cb).sid;
    expect(sid).toBeTruthy();

    const user = await env.DB.prepare('SELECT id, zalo_sub FROM users WHERE zalo_sub = ?')
      .bind('z-link-nosid')
      .first<{ id: string; zalo_sub: string }>();
    expect(user).toBeDefined();
    expect(user?.zalo_sub).toBe('z-link-nosid');
  });

  it('an identity owned by B creates a merge request and no session for B', async () => {
    const userBId = 'u-b';
    await createZaloUser(userBId, 'z-b', 'User B');
    const sidA = await memberSid('u-a', 'User A');

    const { cb } = await linkZalo(sidA, 'z-b');
    expect(cb.status).toBe(302);
    expect(cb.headers.get('Location')).toBe('/trips?merge=requested&provider=zalo');

    const mergeReqs = await env.DB.prepare(
      'SELECT id, survivor_user_id, merged_user_id, provider, provider_sub, status, created_at, expires_at FROM account_merge_requests WHERE survivor_user_id = ? AND merged_user_id = ?',
    )
      .bind('u-a', userBId)
      .all<{
        id: string;
        survivor_user_id: string;
        merged_user_id: string;
        provider: string;
        provider_sub: string;
        status: string;
        created_at: string;
        expires_at: string;
      }>();

    expect(mergeReqs.results).toHaveLength(1);
    const req = mergeReqs.results[0]!;
    expect(req.status).toBe('pending');
    expect(req.survivor_user_id).toBe('u-a');
    expect(req.merged_user_id).toBe(userBId);
    expect(req.provider).toBe('zalo');
    expect(req.provider_sub).toBe('z-b');
    expect(Date.parse(req.expires_at) - Date.parse(req.created_at)).toBe(7 * 86400000);

    expect(cookiesFrom(cb).sid).toBeUndefined();

    const meRes = await call('/api/me', { headers: { Cookie: `sid=${sidA}` } });
    expect(meRes.status).toBe(200);
    const meBody = (await meRes.json()) as { user: { id: string } };
    expect(meBody.user.id).toBe('u-a');
  });

  it('a second request to the same B cancels the first', async () => {
    const survivorA = 'u-a-6';
    const mergedB = 'u-b-6';
    const sidA = await memberSid(survivorA, 'User A 6');
    await createZaloUser(mergedB, 'z-b-6', 'User B 6');

    await linkZalo(sidA, 'z-b-6');
    await linkZalo(sidA, 'z-b-6');

    const rows = await env.DB.prepare(
      'SELECT status FROM account_merge_requests WHERE survivor_user_id = ? AND merged_user_id = ? ORDER BY created_at ASC',
    )
      .bind(survivorA, mergedB)
      .all<{ status: string }>();

    expect(rows.results).toHaveLength(2);
    expect(rows.results[0]?.status).toBe('cancelled');
    expect(rows.results[1]?.status).toBe('pending');
  });

  it('link with an expired session fails', async () => {
    const userId = 'u-exp-7';
    const sid = await memberSid(userId, 'Exp User');

    const start = await call('/api/auth/zalo/start?returnTo=/trips&intent=link', {
      headers: { Cookie: `sid=${sid}` },
    });
    const startCookies = cookiesFrom(start);
    const state = new URL(start.headers.get('Location')!).searchParams.get('state')!;

    mockZaloFetch({
      id: 'z-7',
      name: 'Zalo Name',
      picture: { data: { url: 'https://p.zalo/z.png' } },
    });

    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();

    const cb = await call(`/api/auth/zalo/callback?code=c&state=${encodeURIComponent(state)}`, {
      headers: {
        Cookie: cookieHeader({ ...startCookies, sid }),
      },
    });

    expect(cb.status).toBe(302);
    const location = cb.headers.get('Location') ?? '';
    expect(location.startsWith('/trips?auth=failed')).toBe(true);

    const user = await env.DB.prepare('SELECT zalo_sub FROM users WHERE id = ?')
      .bind(userId)
      .first<{ zalo_sub: string | null }>();
    expect(user?.zalo_sub).toBeNull();
  });

  it('Google intent=link attaches google_sub and email', async () => {
    const userId = 'u-zalo-8';
    const sid = await createZaloUser(userId, 'z-8', 'Original Zalo Name');

    const { cb } = await linkGoogle(sid, {
      sub: 'g-new',
      email: 'new@example.com',
      name: 'G Name',
      email_verified: true,
    });

    expect(cb.status).toBe(302);
    expect(cb.headers.get('Location')).toBe('/trips?linked=google');

    const user = await env.DB.prepare(
      'SELECT google_sub, email, name FROM users WHERE id = ?',
    )
      .bind(userId)
      .first<{ google_sub: string | null; email: string | null; name: string }>();

    expect(user).toMatchObject({
      google_sub: 'g-new',
      email: 'new@example.com',
      name: 'Original Zalo Name',
    });
  });

  it('unlink works when another identity stays', async () => {
    const userId = 'u-dual-9';
    const sid = await createDualUser(userId, 'g-9', 'z-9', 'dual9@example.com', 'Dual User 9');

    const res = await call('/api/me/identities/google', {
      method: 'DELETE',
      headers: { Cookie: `sid=${sid}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { providers: string[]; email: string | null } };
    expect(body.user.providers).toEqual(['zalo']);
    expect(body.user.email).toBeNull();

    const user = await env.DB.prepare(
      'SELECT google_sub, zalo_sub, email FROM users WHERE id = ?',
    )
      .bind(userId)
      .first<{ google_sub: string | null; zalo_sub: string | null; email: string | null }>();
    expect(user?.google_sub).toBeNull();
    expect(user?.email).toBeNull();
    expect(user?.zalo_sub).toBe('z-9');
  });

  it('unlink refuses the last identity', async () => {
    const sid = await memberSid('u-g-10', 'User 10');

    const res = await call('/api/me/identities/google', {
      method: 'DELETE',
      headers: { Cookie: `sid=${sid}` },
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('LAST_IDENTITY');
  });

  it('unlink of a provider I do not have is 404', async () => {
    const sid = await memberSid('u-g-11', 'User 11');

    const res = await call('/api/me/identities/zalo', {
      method: 'DELETE',
      headers: { Cookie: `sid=${sid}` },
    });

    expect(res.status).toBe(404);
  });

  it('unlink needs a session', async () => {
    const res = await call('/api/me/identities/google', {
      method: 'DELETE',
    });

    expect(res.status).toBe(401);
  });
});
