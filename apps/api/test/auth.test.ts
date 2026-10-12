import { describe, it, expect, vi, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import { call, cookiesFrom, cookieHeader, unsignedJwt } from './helpers';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

function mockGoogleToken(claims: Record<string, unknown>) {
  const real = globalThis.fetch;
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith(GOOGLE_TOKEN_URL)) {
      return Response.json({ access_token: 'at', token_type: 'Bearer', expires_in: 3600, id_token: unsignedJwt(claims) });
    }
    return real(input, init);
  });
}

async function signIn(sub = 'g-1', returnTo = '/trips') {
  const start = await call(`/api/auth/google/start?returnTo=${encodeURIComponent(returnTo)}`);
  const startCookies = cookiesFrom(start);
  const state = new URL(start.headers.get('Location')!).searchParams.get('state')!;
  mockGoogleToken({ sub, email: 'minh@example.com', name: 'Minh', email_verified: true });
  const cb = await call(`/api/auth/google/callback?code=abc&state=${state}`, { headers: { Cookie: cookieHeader(startCookies) } });
  return { start, cb, sid: cookiesFrom(cb).sid };
}

afterEach(() => vi.restoreAllMocks());

describe('Google sign-in', () => {
  it('start redirects to Google with only openid email profile', async () => {
    const res = await call('/api/auth/google/start?returnTo=/trips');
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get('Location')!);
    expect(loc.host).toBe('accounts.google.com');
    expect(loc.searchParams.get('scope')).toBe('openid email profile');
    expect(Object.keys(cookiesFrom(res))).toEqual(expect.arrayContaining(['oauth_state', 'oauth_verifier']));
  });

  it('callback creates the user, sets sid and redirects to returnTo', async () => {
    const { cb, sid } = await signIn('g-1', '/t/abc');
    expect(cb.status).toBe(302);
    expect(cb.headers.get('Location')).toBe('/t/abc');
    expect(sid).toBeTruthy();
    const user = await env.DB.prepare("SELECT id, email, name FROM users WHERE google_sub = 'g-1'").first<{ id: string; email: string; name: string }>();
    expect(user).toMatchObject({ email: 'minh@example.com', name: 'Minh' });
  });

  it('a second login with the same Google account reuses the user', async () => {
    await signIn('g-2');
    await signIn('g-2');
    const n = await env.DB.prepare("SELECT count(*) AS n FROM users WHERE google_sub = 'g-2'").first<{ n: number }>();
    expect(n?.n).toBe(1);
  });

  it('rejects a wrong state', async () => {
    const start = await call('/api/auth/google/start');
    const res = await call('/api/auth/google/callback?code=abc&state=wrong', { headers: { Cookie: cookieHeader(cookiesFrom(start)) } });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('VALIDATION');
  });

  it('ignores a backslash returnTo that browsers treat as another site', async () => {
    const { cb } = await signIn('g-7', '/\\evil.example');
    expect(cb.headers.get('Location')).toBe('/trips');
  });

  it('keeps an ordinary trip path with hyphens', async () => {
    const { cb } = await signIn('g-8', '/t/0f8c-4b2a?becomeMember=1');
    expect(cb.headers.get('Location')).toBe('/t/0f8c-4b2a?becomeMember=1');
  });

  it('ignores an outside returnTo', async () => {
    const { cb } = await signIn('g-3', '//evil.com');
    expect(cb.headers.get('Location')).toBe('/trips');
  });
});

describe('/api/me, logout, consent', () => {
  it('returns the signed-in user, then null after logout', async () => {
    const { sid } = await signIn('g-4');
    const me = await call('/api/me', { headers: { Cookie: `sid=${sid}` } });
    expect(((await me.json()) as { user: { email: string; consentAt: string | null } }).user).toMatchObject({ email: 'minh@example.com', consentAt: null });
    const out = await call('/api/auth/logout', { method: 'POST', headers: { Cookie: `sid=${sid}` } });
    expect(out.status).toBe(204);
    const after = await call('/api/me', { headers: { Cookie: `sid=${sid}` } });
    expect(await after.json()).toEqual({ user: null });
  });

  it('returns null without a session', async () => {
    expect(await (await call('/api/me')).json()).toEqual({ user: null });
  });

  it('returns null for an expired session', async () => {
    const { sid } = await signIn('g-5');
    await env.DB.prepare("UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000Z'").run();
    expect(await (await call('/api/me', { headers: { Cookie: `sid=${sid}` } })).json()).toEqual({ user: null });
  });

  it('consent sets consentAt', async () => {
    const { sid } = await signIn('g-6');
    const res = await call('/api/me/consent', { method: 'POST', headers: { Cookie: `sid=${sid}` } });
    expect(res.status).toBe(204);
    const me = (await (await call('/api/me', { headers: { Cookie: `sid=${sid}` } })).json()) as { user: { consentAt: string | null } };
    expect(me.user.consentAt).toBeTruthy();
  });

  it('consent without a session is 401', async () => {
    const res = await call('/api/me/consent', { method: 'POST' });
    expect(res.status).toBe(401);
  });
});
