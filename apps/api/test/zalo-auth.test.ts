import { describe, it, expect, vi, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import { app, call, cookiesFrom, cookieHeader, memberSid } from './helpers';

const realFetch = globalThis.fetch;

const DEFAULT_PROFILE = {
  id: '84123',
  name: 'Chi Nguyễn',
  picture: {
    data: {
      url: 'https://p.zalo/a.png',
    },
  },
};

function mockZaloFetch(
  profile: Record<string, unknown> = DEFAULT_PROFILE,
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

async function signInZalo(
  profile: Record<string, unknown> = DEFAULT_PROFILE,
  returnTo = '/trips',
  extraCookies: Record<string, string> = {},
) {
  const start = await call(`/api/auth/zalo/start?returnTo=${encodeURIComponent(returnTo)}`);
  const startCookies = cookiesFrom(start);
  const location = start.headers.get('Location');
  const state = location ? (new URL(location).searchParams.get('state') ?? '') : '';
  mockZaloFetch(profile);
  const cb = await call(`/api/auth/zalo/callback?code=c&state=${state}`, {
    headers: {
      Cookie: cookieHeader({ ...startCookies, ...extraCookies }),
    },
  });
  return { start, cb, sid: cookiesFrom(cb).sid };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Zalo sign-in', () => {
  it('start answers 404 when Zalo is not configured', async () => {
    const res = await app.request('/api/auth/zalo/start', {}, { ...env, ZALO_APP_SECRET: undefined });
    expect(res.status).toBe(404);
  });

  it('start sets the four cookies and redirects to Zalo', async () => {
    const res = await call('/api/auth/zalo/start?returnTo=/trips');
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get('Location')!);
    expect(location.host).toBe('oauth.zaloapp.com');

    const cookieLines = res.headers.getSetCookie();
    for (const name of ['zalo_oauth_state', 'zalo_oauth_verifier', 'zalo_oauth_return', 'zalo_oauth_intent']) {
      const line = cookieLines.find((l) => l.trim().startsWith(`${name}=`));
      expect(line, `missing cookie ${name}`).toBeDefined();
      expect(line).toContain('HttpOnly');
      expect(line).toContain('Secure');
      expect(line).toContain('SameSite=Lax');
      expect(line).toContain('Max-Age=600');
    }
  });

  it('creates a Zalo user and signs in', async () => {
    const { cb, sid } = await signInZalo(DEFAULT_PROFILE, '/t/abc');
    expect(cb.status).toBe(302);
    expect(cb.headers.get('Location')).toBe('/t/abc');
    expect(sid).toBeTruthy();

    const user = await env.DB.prepare(
      "SELECT id, google_sub, zalo_sub, email, name, avatar_url, custom_profile FROM users WHERE zalo_sub = '84123'",
    ).first<{
      id: string;
      google_sub: string | null;
      zalo_sub: string;
      email: string | null;
      name: string;
      avatar_url: string | null;
      custom_profile: number;
    }>();

    expect(user).toBeDefined();
    expect(user?.zalo_sub).toBe('84123');
    expect(user?.name).toBe('Chi Nguyễn');
    expect(user?.avatar_url).toBe('https://p.zalo/a.png');
    expect(user?.email).toBeNull();
    expect(user?.google_sub).toBeNull();

    const cbCookies = cookiesFrom(cb);
    expect(cbCookies.zalo_oauth_state).toBe('');
    expect(cbCookies.zalo_oauth_verifier).toBe('');
    expect(cbCookies.zalo_oauth_return).toBe('');
    expect(cbCookies.zalo_oauth_intent).toBe('');
  });

  it('a returning user gets the new name and avatar', async () => {
    await signInZalo(DEFAULT_PROFILE);
    await signInZalo({
      id: '84123',
      name: 'Chi Mới',
      picture: { data: { url: 'https://p.zalo/b.png' } },
    });

    const count = await env.DB.prepare(
      "SELECT count(*) AS n FROM users WHERE zalo_sub = '84123'",
    ).first<{ n: number }>();
    expect(count?.n).toBe(1);

    const user = await env.DB.prepare(
      "SELECT name, avatar_url FROM users WHERE zalo_sub = '84123'",
    ).first<{ name: string; avatar_url: string }>();
    expect(user).toMatchObject({
      name: 'Chi Mới',
      avatar_url: 'https://p.zalo/b.png',
    });
  });

  it('a customised profile is kept', async () => {
    await signInZalo(DEFAULT_PROFILE);
    await env.DB.prepare("UPDATE users SET custom_profile = 1 WHERE zalo_sub = '84123'").run();

    await signInZalo({
      id: '84123',
      name: 'Chi Khác',
      picture: { data: { url: 'https://p.zalo/diff.png' } },
    });

    const user = await env.DB.prepare(
      "SELECT name, avatar_url FROM users WHERE zalo_sub = '84123'",
    ).first<{ name: string; avatar_url: string }>();
    expect(user).toMatchObject({
      name: 'Chi Nguyễn',
      avatar_url: 'https://p.zalo/a.png',
    });
  });

  it('an empty name and no picture still work', async () => {
    const { sid } = await signInZalo({ id: '9', name: '' });
    expect(sid).toBeTruthy();

    const user = await env.DB.prepare(
      "SELECT name, avatar_url FROM users WHERE zalo_sub = '9'",
    ).first<{ name: string; avatar_url: string | null }>();
    expect(user).toMatchObject({
      name: 'Zalo',
      avatar_url: null,
    });
  });

  it('signing in while signed in as someone else switches account', async () => {
    const sid = await memberSid('u-g');
    const { sid: newSid } = await signInZalo(DEFAULT_PROFILE, '/trips', { sid });
    expect(newSid).toBeTruthy();
    expect(newSid).not.toBe(sid);

    const meRes = await call('/api/me', { headers: { Cookie: `sid=${newSid}` } });
    expect(meRes.status).toBe(200);
    const meBody = (await meRes.json()) as { user: { name: string } };
    expect(meBody.user.name).toBe('Chi Nguyễn');

    const mergeCount = await env.DB.prepare(
      'SELECT count(*) AS n FROM account_merge_requests',
    ).first<{ n: number }>();
    expect(mergeCount?.n).toBe(0);
  });

  it('failures go back with auth=failed', async () => {
    // 1. wrong state -> Location '/t/abc?auth=failed'
    const start1 = await call('/api/auth/zalo/start?returnTo=/t/abc');
    const cookies1 = cookiesFrom(start1);
    const res1 = await call('/api/auth/zalo/callback?code=c&state=wrong-state', {
      headers: { Cookie: cookieHeader(cookies1) },
    });
    expect(res1.status).toBe(302);
    expect(res1.headers.get('Location')).toBe('/t/abc?auth=failed');

    // 2. callback with error=access_denied (and valid state/cookies, no code) -> same
    const start2 = await call('/api/auth/zalo/start?returnTo=/t/abc');
    const cookies2 = cookiesFrom(start2);
    const state2 = new URL(start2.headers.get('Location')!).searchParams.get('state')!;
    const res2 = await call(`/api/auth/zalo/callback?error=access_denied&state=${state2}`, {
      headers: { Cookie: cookieHeader(cookies2) },
    });
    expect(res2.status).toBe(302);
    expect(res2.headers.get('Location')).toBe('/t/abc?auth=failed');

    // 3. token endpoint mocked to return {error:-14019,error_name:'bad'} (HTTP 200) -> same
    const start3 = await call('/api/auth/zalo/start?returnTo=/t/abc');
    const cookies3 = cookiesFrom(start3);
    const state3 = new URL(start3.headers.get('Location')!).searchParams.get('state')!;
    mockZaloFetch(DEFAULT_PROFILE, { error: -14019, error_name: 'bad' });
    const res3 = await call(`/api/auth/zalo/callback?code=c&state=${state3}`, {
      headers: { Cookie: cookieHeader(cookies3) },
    });
    expect(res3.status).toBe(302);
    expect(res3.headers.get('Location')).toBe('/t/abc?auth=failed');

    // 4. no cookies at all (call callback?code=c&state=x with no Cookie) -> '/?auth=failed'
    const res4 = await call('/api/auth/zalo/callback?code=c&state=x');
    expect(res4.status).toBe(302);
    expect(res4.headers.get('Location')).toBe('/?auth=failed');

    // 5. returnTo '/t/abc?becomeMember=1' with wrong state -> '/t/abc?becomeMember=1&auth=failed'
    const start5 = await call(
      `/api/auth/zalo/start?returnTo=${encodeURIComponent('/t/abc?becomeMember=1')}`,
    );
    const cookies5 = cookiesFrom(start5);
    const res5 = await call('/api/auth/zalo/callback?code=c&state=wrong-state', {
      headers: { Cookie: cookieHeader(cookies5) },
    });
    expect(res5.status).toBe(302);
    expect(res5.headers.get('Location')).toBe('/t/abc?becomeMember=1&auth=failed');
  });

  it('ignores an outside returnTo', async () => {
    const { cb } = await signInZalo(DEFAULT_PROFILE, '//evil.com');
    expect(cb.status).toBe(302);
    expect(cb.headers.get('Location')).toBe('/trips');
  });
});
