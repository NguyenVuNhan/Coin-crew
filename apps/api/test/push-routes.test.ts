import { describe, it, expect, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import { call, memberSid, U, json } from './helpers';

const EP = 'https://fcm.googleapis.com/fcm/send/abc123';
const KEYS = { p256dh: 'BPk-abc_123', auth: 'au-th_1' };
const DEFAULTS = { newSession: true, sessionReminder: true, reminderLeadMinutes: 30, expenseNew: true };

function req(method: string, sid: string | null, body?: unknown, path = '/api/push/subscription') {
  return call(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(sid ? { Cookie: `sid=${sid}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const put = (sid: string | null, endpoint = EP, extra: Record<string, unknown> = {}) =>
  req('PUT', sid, { endpoint, keys: KEYS, ...extra });
const get = (sid: string, endpoint = EP) =>
  call(`/api/push/subscription?endpoint=${encodeURIComponent(endpoint)}`, { headers: { Cookie: `sid=${sid}` } });

describe('push subscription routes', () => {
  afterEach(async () => {
    delete (env as any).VAPID_PUBLIC_KEY;
    delete (env as any).VAPID_PRIVATE_KEY;
  });

  it('GET key returns null without VAPID env', async () => {
    delete (env as any).VAPID_PUBLIC_KEY;
    delete (env as any).VAPID_PRIVATE_KEY;
    const res = await call('/api/push/key');
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ publicKey: null });
  });

  it('GET key returns the key when set', async () => {
    (env as any).VAPID_PUBLIC_KEY = 'pub-key';
    (env as any).VAPID_PRIVATE_KEY = 'priv-key';
    expect(await json(call('/api/push/key'))).toEqual({ publicKey: 'pub-key' });
  });

  it('requires sign-in', async () => {
    expect((await put(null)).status).toBe(401);
    expect((await req('GET', null, undefined, `/api/push/subscription?endpoint=${encodeURIComponent(EP)}`)).status).toBe(401);
    expect((await req('PATCH', null, { endpoint: EP })).status).toBe(401);
    expect((await req('DELETE', null, { endpoint: EP })).status).toBe(401);
  });

  it('PUT creates a subscription with default settings', async () => {
    const sid = await memberSid(U.minh, 'Minh');
    const res = await put(sid, EP, { userAgent: 'TestUA' });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ settings: DEFAULTS });
    const row = await env.DB.prepare('SELECT user_id, p256dh, auth, user_agent FROM push_subscriptions WHERE endpoint = ?').bind(EP).first();
    expect(row).toEqual({ user_id: U.minh, p256dh: KEYS.p256dh, auth: KEYS.auth, user_agent: 'TestUA' });
    expect((await get(sid)).status).toBe(200);
  });

  it('PUT again by the same user keeps their switches', async () => {
    const sid = await memberSid(U.minh, 'Minh');
    await put(sid);
    await req('PATCH', sid, { endpoint: EP, expenseNew: false });
    const res = await put(sid);
    expect((await json<{ settings: typeof DEFAULTS }>(res)).settings.expenseNew).toBe(false);
  });

  it('PUT moves an endpoint to the new user and resets switches', async () => {
    const minh = await memberSid(U.minh, 'Minh');
    const an = await memberSid(U.an, 'An');
    await put(minh);
    await req('PATCH', minh, { endpoint: EP, expenseNew: false, reminderLeadMinutes: 60 });
    expect(await json(put(an))).toEqual({ settings: DEFAULTS });
    expect((await get(minh)).status).toBe(404);
    expect((await get(an)).status).toBe(200);
  });

  it('GET unknown endpoint returns 404', async () => {
    const sid = await memberSid(U.minh, 'Minh');
    expect((await get(sid, 'https://example.com/nope')).status).toBe(404);
  });

  it('PATCH rejects lead 45', async () => {
    const sid = await memberSid(U.minh, 'Minh');
    await put(sid);
    expect((await req('PATCH', sid, { endpoint: EP, reminderLeadMinutes: 45 })).status).toBe(422);
  });

  it('PATCH rejects non-boolean switches', async () => {
    const sid = await memberSid(U.minh, 'Minh');
    await put(sid);
    const res = await req('PATCH', sid, { endpoint: EP, newSession: 'yes' });
    expect(res.status).toBe(422);
    expect((await json<{ error: { code: string } }>(res)).error.code).toBe('VALIDATION');
  });

  it('PATCH saves expenseNew false', async () => {
    const sid = await memberSid(U.minh, 'Minh');
    await put(sid);
    const res = await req('PATCH', sid, { endpoint: EP, expenseNew: false, reminderLeadMinutes: 120 });
    expect(await json(res)).toEqual({ settings: { ...DEFAULTS, expenseNew: false, reminderLeadMinutes: 120 } });
    const after = await json<{ settings: typeof DEFAULTS }>(get(sid));
    expect(after.settings.expenseNew).toBe(false);
    expect(after.settings.reminderLeadMinutes).toBe(120);
  });

  it('PATCH returns 404 for another user\'s or unknown endpoint', async () => {
    const minh = await memberSid(U.minh, 'Minh');
    const an = await memberSid(U.an, 'An');
    await put(minh);
    expect((await req('PATCH', an, { endpoint: EP, expenseNew: false })).status).toBe(404);
    expect((await req('PATCH', an, { endpoint: 'https://example.com/none' })).status).toBe(404);
  });

  it('DELETE removes subscription and reminders; repeat is 204', async () => {
    const sid = await memberSid(U.minh, 'Minh');
    await put(sid);
    const row = await env.DB.prepare('SELECT id FROM push_subscriptions WHERE endpoint = ?').bind(EP).first<{ id: string }>();
    await env.DB.prepare("INSERT INTO push_reminders (id, subscription_id, transaction_root_id, trip_id, due_at) VALUES ('r-1', ?, 'root-1', 't-1', '2026-11-20T00:00:00.000Z')").bind(row!.id).run();

    expect((await req('DELETE', sid, { endpoint: EP })).status).toBe(204);
    expect(await env.DB.prepare('SELECT id FROM push_subscriptions WHERE endpoint = ?').bind(EP).first()).toBeNull();
    expect(await env.DB.prepare("SELECT id FROM push_reminders WHERE id = 'r-1'").first()).toBeNull();
    expect((await req('DELETE', sid, { endpoint: EP })).status).toBe(204);
  });

  it('DELETE does not remove another user\'s subscription', async () => {
    const minh = await memberSid(U.minh, 'Minh');
    const an = await memberSid(U.an, 'An');
    await put(minh);
    expect((await req('DELETE', an, { endpoint: EP })).status).toBe(204);
    expect((await get(minh)).status).toBe(200);
  });

  describe('PUT validation', () => {
    const bad: [string, unknown][] = [
      ['http endpoint', { endpoint: 'http://example.com/x', keys: KEYS }],
      ['https IPv4 literal', { endpoint: 'https://127.0.0.1/x', keys: KEYS }],
      ['https IPv6 literal', { endpoint: 'https://[::1]/x', keys: KEYS }],
      ['localhost', { endpoint: 'https://localhost/x', keys: KEYS }],
      ['endpoint over 1000 chars', { endpoint: 'https://example.com/' + 'a'.repeat(1000), keys: KEYS }],
      ['not a url', { endpoint: 'nope', keys: KEYS }],
      ['missing keys', { endpoint: EP }],
      ['empty auth key', { endpoint: EP, keys: { p256dh: KEYS.p256dh, auth: '' } }],
      ['non-base64url key', { endpoint: EP, keys: { p256dh: 'not base64!', auth: KEYS.auth } }],
      ['key over 200 chars', { endpoint: EP, keys: { p256dh: 'a'.repeat(201), auth: KEYS.auth } }],
      ['userAgent over 200 chars', { endpoint: EP, keys: KEYS, userAgent: 'u'.repeat(201) }],
    ];
    for (const [name, body] of bad) {
      it(`rejects ${name} with 422 VALIDATION`, async () => {
        const sid = await memberSid(U.minh, 'Minh');
        const res = await req('PUT', sid, body);
        expect(res.status).toBe(422);
        expect((await json<{ error: { code: string } }>(res)).error.code).toBe('VALIDATION');
      });
    }
  });
});
