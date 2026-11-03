import { describe, it, expect, vi, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import { app, call, cookiesFrom, cookieHeader, memberSid, seedTrip, PID, U } from './helpers';
import { sha256Hex } from '@cc/api-util/ids';
import { zaloDeviceId } from '../src/auth/zaloMini';

const realFetch = globalThis.fetch;

const PROFILE = {
  id: 'z-new',
  name: 'Chi Nguyễn',
  picture: { data: { url: 'https://p.zalo/chi.png' } },
};

type GraphCall = { url: string; headers: Record<string, string> };

/** Mock Graph /me; `respond(fields)` decides the body. Records every Graph call. */
function mockGraph(respond: (fields: string) => Record<string, unknown> = () => PROFILE): GraphCall[] {
  const calls: GraphCall[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith('https://oauth.zaloapp.com/v4/access_token')) {
      return Response.json({ access_token: 'at' });
    }
    if (url.startsWith('https://graph.zalo.me/v2.0/me')) {
      calls.push({ url, headers: { ...((init?.headers ?? {}) as Record<string, string>) } });
      return Response.json(respond(new URL(url).searchParams.get('fields') ?? ''));
    }
    return realFetch(input, init);
  });
  return calls;
}

function post(body: unknown, headers: Record<string, string> = {}, e: Record<string, unknown> = env) {
  return app.request(
    '/api/auth/zalo-mini',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    },
    e,
  );
}

async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg)));
  return Array.from(sig).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function one<T>(query: string, ...binds: unknown[]): Promise<T | null> {
  return env.DB.prepare(query).bind(...binds).first<T>();
}

async function userCount(): Promise<number> {
  return (await one<{ n: number }>('SELECT COUNT(*) AS n FROM users'))!.n;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/auth/zalo-mini', () => {
  it('sends appsecret_proof', async () => {
    const calls = mockGraph();
    await post({ accessToken: 'tok-123' });
    expect(calls.length).toBeGreaterThan(0);
    const expected = await hmacHex('test-zalo-secret', 'tok-123');
    for (const c of calls) {
      expect(c.headers.appsecret_proof).toBe(expected);
      expect(c.headers.access_token).toBe('tok-123');
    }
  });

  it('known Zalo user is signed in silently', async () => {
    await memberSid(U.minh, 'Minh');
    await env.DB.prepare("UPDATE users SET zalo_sub = 'z-minh' WHERE id = ?").bind(U.minh).run();
    mockGraph(() => ({ ...PROFILE, id: 'z-minh' }));

    const res = await post({ accessToken: 'tok' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; sessionToken: string };
    expect(body.status).toBe('signed_in');
    expect(typeof body.sessionToken).toBe('string');
    expect(res.headers.getSetCookie().some((l) => l.trim().startsWith('sid='))).toBe(false);

    vi.restoreAllMocks();
    const me = await call('/api/me', { headers: { Authorization: `Bearer ${body.sessionToken}` } });
    const meBody = (await me.json()) as { user: { id: string } | null };
    expect(meBody.user?.id).toBe(U.minh);
  });

  it('unknown Zalo user stays a guest', async () => {
    mockGraph();
    const before = await userCount();
    const res = await post({ accessToken: 'tok' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; deviceId: string };
    expect(body.status).toBe('guest');
    expect(body.deviceId.startsWith('z_')).toBe(true);
    expect(body.deviceId).toBe(await zaloDeviceId('test-device-secret', 'z-new'));
    expect(body.deviceId.length).toBe(45);
    expect(await userCount()).toBe(before);
    const dev = await one<{ zalo_sub: string | null }>('SELECT zalo_sub FROM devices WHERE id_hash = ?', await sha256Hex(body.deviceId));
    expect(dev?.zalo_sub).toBe('z-new');
  });

  it('same Zalo user gets the same deviceId on another phone', async () => {
    mockGraph();
    const a = (await (await post({ accessToken: 'tok-a' }, { 'X-Device-Restore': 'phone-one' })).json()) as { deviceId: string };
    const b = (await (await post({ accessToken: 'tok-b' }, { 'X-Device-Restore': 'phone-two' })).json()) as { deviceId: string };
    expect(a.deviceId).toBe(b.deviceId);
    const n = await one<{ n: number }>('SELECT COUNT(*) AS n FROM devices WHERE zalo_sub = ?', 'z-new');
    expect(n!.n).toBe(1);
  });

  it('consent creates the user and links slots', async () => {
    await seedTrip();
    await env.DB.prepare("UPDATE participants SET zalo_sub = 'z-new' WHERE id = ?").bind(PID.C).run();
    mockGraph();

    const res = await post({ accessToken: 'tok', consent: true, profile: { name: 'Chi', avatar: null } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; sessionToken: string };
    expect(body.status).toBe('signed_in');
    expect(res.headers.getSetCookie().some((l) => l.trim().startsWith('sid='))).toBe(false);

    const user = await one<{ id: string; name: string; consent_at: string | null; avatar_url: string | null }>(
      "SELECT id, name, consent_at, avatar_url FROM users WHERE zalo_sub = 'z-new'",
    );
    expect(user).not.toBeNull();
    expect(user!.consent_at).not.toBeNull();
    expect(user!.name).toBe('Chi Nguyễn');
    expect(user!.avatar_url).toBe('https://p.zalo/chi.png');
    const slot = await one<{ user_id: string | null }>('SELECT user_id FROM participants WHERE id = ?', PID.C);
    expect(slot!.user_id).toBe(user!.id);

    const dev = await one<{ zalo_sub: string | null }>(
      'SELECT zalo_sub FROM devices WHERE id_hash = ?',
      await sha256Hex(await zaloDeviceId('test-device-secret', 'z-new')),
    );
    expect(dev?.zalo_sub).toBe('z-new');

    vi.restoreAllMocks();
    const me = await call('/api/me', { headers: { Authorization: `Bearer ${body.sessionToken}` } });
    const meBody = (await me.json()) as { user: { id: string } | null };
    expect(meBody.user?.id).toBe(user!.id);
  });

  it('consent with withheld profile uses the client name', async () => {
    mockGraph((fields) =>
      fields === 'id' ? { id: 'z-new' } : { error: -216, message: 'Access to personal information is restricted' },
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await post({
      accessToken: 'tok',
      consent: true,
      profile: { name: '  Chi từ Zalo  ', avatar: 'https://s.zalo/chi.jpg' },
    });
    expect(res.status).toBe(200);
    const user = await one<{ name: string; zalo_name: string | null; avatar_url: string | null; consent_at: string | null }>(
      "SELECT name, zalo_name, avatar_url, consent_at FROM users WHERE zalo_sub = 'z-new'",
    );
    expect(user!.name).toBe('Chi từ Zalo');
    expect(user!.avatar_url).toBe('https://s.zalo/chi.jpg');
    expect(user!.consent_at).not.toBeNull();
  });

  it('consent without a profile name → 422', async () => {
    mockGraph();
    const res = await post({ accessToken: 'tok', consent: true });
    expect(res.status).toBe(422);
    const res2 = await post({ accessToken: 'tok', consent: true, profile: { name: '   ', avatar: null } });
    expect(res2.status).toBe(422);
    expect(await userCount()).toBe(0);
  });

  it('silent sign-in also links slots', async () => {
    await seedTrip();
    await memberSid('u-chi', 'Chi');
    await env.DB.prepare("UPDATE users SET zalo_sub = 'z-chi' WHERE id = 'u-chi'").run();
    await env.DB.prepare("UPDATE participants SET zalo_sub = 'z-chi' WHERE id = ?").bind(PID.C).run();
    mockGraph(() => ({ ...PROFILE, id: 'z-chi' }));

    const res = await post({ accessToken: 'tok' });
    expect(((await res.json()) as { status: string }).status).toBe('signed_in');
    const slot = await one<{ user_id: string | null }>('SELECT user_id FROM participants WHERE id = ?', PID.C);
    expect(slot!.user_id).toBe('u-chi');
  });

  it('bad token → 401 ZALO_TOKEN_INVALID', async () => {
    mockGraph(() => ({ error: -124, message: 'Access token is invalid' }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await post({ accessToken: 'bad' });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('ZALO_TOKEN_INVALID');
    expect(warn.mock.calls.some((args) => String(args[0]).startsWith('Zalo mini sign-in failed: '))).toBe(true);
  });

  it('missing accessToken → 422', async () => {
    const calls = mockGraph();
    for (const body of [{}, { accessToken: '' }, { accessToken: 42 }, { accessToken: 'x'.repeat(2049) }]) {
      const res = await post(body);
      expect(res.status).toBe(422);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe('VALIDATION');
    }
    expect(calls.length).toBe(0);
  });

  it('Zalo not configured → 503', async () => {
    const calls = mockGraph();
    const noApp = await post({ accessToken: 'tok' }, {}, { ...env, ZALO_APP_ID: undefined });
    expect(noApp.status).toBe(503);
    const noSecret = await post({ accessToken: 'tok' }, {}, { ...env, ZALO_APP_SECRET: undefined });
    expect(noSecret.status).toBe(503);
    const noDevice = await post({ accessToken: 'tok' }, {}, { ...env, DEVICE_SECRET: undefined });
    expect(noDevice.status).toBe(503);
    expect(calls.length).toBe(0);
  });
});

describe('web Zalo OAuth', () => {
  it('web Zalo OAuth sign-in links Zalo-tied slots', async () => {
    await seedTrip();
    await env.DB.prepare("UPDATE participants SET zalo_sub = 'z-new' WHERE id = ?").bind(PID.C).run();

    const start = await call('/api/auth/zalo/start?returnTo=/trips');
    const startCookies = cookiesFrom(start);
    const state = new URL(start.headers.get('Location')!).searchParams.get('state') ?? '';
    mockGraph();
    const cb = await call(`/api/auth/zalo/callback?code=c&state=${state}`, {
      headers: { Cookie: cookieHeader(startCookies) },
    });
    expect(cb.status).toBe(302);
    expect(cookiesFrom(cb).sid).toBeTruthy();

    const user = await one<{ id: string }>("SELECT id FROM users WHERE zalo_sub = 'z-new'");
    const slot = await one<{ user_id: string | null }>('SELECT user_id FROM participants WHERE id = ?', PID.C);
    expect(slot!.user_id).toBe(user!.id);
  });

  it('web Zalo link links Zalo-tied slots', async () => {
    await seedTrip();
    await env.DB.prepare("UPDATE participants SET zalo_sub = 'z-new' WHERE id = ?").bind(PID.C).run();
    const sid = await memberSid(U.an, 'An');

    const start = await call('/api/auth/zalo/start?returnTo=/trips&intent=link', { headers: { Cookie: `sid=${sid}` } });
    const startCookies = cookiesFrom(start);
    const state = new URL(start.headers.get('Location')!).searchParams.get('state') ?? '';
    mockGraph();
    const cb = await call(`/api/auth/zalo/callback?code=c&state=${state}`, {
      headers: { Cookie: cookieHeader({ ...startCookies, sid }) },
    });
    expect(cb.status).toBe(302);
    expect(cb.headers.get('Location')).toContain('linked=zalo');
    const slot = await one<{ user_id: string | null }>('SELECT user_id FROM participants WHERE id = ?', PID.C);
    expect(slot!.user_id).toBe(U.an);
  });
});
