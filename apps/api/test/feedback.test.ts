import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { call, cookieHeader, memberSid } from './helpers';
import { hourBucket } from '../src/feedback/time';

const valid = {
  message: 'The total looks wrong',
  type: 'bug',
  screen: 'trip-expenses',
  device: 'phone',
  lang: 'vi',
  appVersion: 'abc1234',
  contactMe: false,
};

function post(body: unknown, cookies: Record<string, string> = { did: 'device-1' }): Promise<Response> {
  return call('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader(cookies) },
    body: JSON.stringify(body),
  });
}

async function rows(): Promise<Record<string, unknown>[]> {
  return (await env.DB.prepare('SELECT * FROM feedback').all<Record<string, unknown>>()).results;
}

describe('POST /api/feedback', () => {
  it('stores an anonymous row', async () => {
    const res = await post(valid);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    const [row] = await rows();
    expect(Object.keys(row!).sort()).toEqual(
      ['app_version', 'contact', 'created_at', 'delivered_at', 'device', 'id', 'lang', 'message', 'screen', 'type'].sort(),
    );
    expect(row).toMatchObject({ message: 'The total looks wrong', type: 'bug', screen: 'trip-expenses', device: 'phone', lang: 'vi', app_version: 'abc1234', contact: null, delivered_at: null });
    expect(String(row!.created_at)).toMatch(/T\d\d:00:00\.000Z$/);
  });

  it('accepts a null type and trims the message', async () => {
    expect((await post({ ...valid, type: null, message: '  hi  ' })).status).toBe(201);
    expect((await rows())[0]).toMatchObject({ type: null, message: 'hi' });
  });

  it('rejects blank message', async () => {
    const res = await post({ ...valid, message: '   ' });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('VALIDATION');
  });

  it.each([
    ['too long', { message: 'x'.repeat(2001) }],
    ['bad type', { type: 'rant' }],
    ['bad device', { device: 'tablet' }],
    ['bad lang', { lang: 'fr' }],
    ['screen with a token', { screen: '/j/secret' }],
    ['missing appVersion', { appVersion: undefined }],
  ])('rejects %s', async (_name, patch) => {
    expect((await post({ ...valid, ...patch })).status).toBe(422);
    expect(await rows()).toHaveLength(0);
  });

  it('signed-in contact uses session user', async () => {
    const sid = await memberSid('u-minh', 'Minh');
    expect((await post({ ...valid, contactMe: true }, { did: 'd', sid })).status).toBe(201);
    expect((await rows())[0]!.contact).toBe('Minh <u-minh@example.com>');
  });

  it('zalo user contact', async () => {
    await env.DB.prepare('INSERT INTO users (id, zalo_sub, email, name, created_at) VALUES (?, ?, NULL, ?, ?)')
      .bind('u-z', 'zalo-123', 'Lan', '2026-10-12T00:00:00.000Z').run();
    const sid = await memberSid('u-z');
    await post({ ...valid, contactMe: true }, { did: 'd', sid });
    expect((await rows())[0]!.contact).toBe('Lan (Zalo)');
  });

  it('signed-in contact ignores client text', async () => {
    const sid = await memberSid('u-minh', 'Minh');
    await post({ ...valid, contactMe: true, contactText: 'Someone else' }, { did: 'd', sid });
    expect((await rows())[0]!.contact).toBe('Minh <u-minh@example.com>');
  });

  it('signed-in without contactMe stores no contact', async () => {
    const sid = await memberSid('u-minh', 'Minh');
    await post(valid, { did: 'd', sid });
    expect((await rows())[0]!.contact).toBeNull();
  });

  it('guest contact text', async () => {
    await post({ ...valid, contactMe: true, contactText: '  An zalo 09x  ' });
    expect((await rows())[0]!.contact).toBe('An zalo 09x');
  });

  it('guest empty contact text becomes null', async () => {
    await post({ ...valid, contactMe: true, contactText: '   ' });
    await post({ ...valid, contactMe: false, contactText: 'An' });
    expect((await rows()).map((r) => r.contact)).toEqual([null, null]);
  });

  it('rejects guest contact text over 100 chars', async () => {
    expect((await post({ ...valid, contactMe: true, contactText: 'x'.repeat(101) })).status).toBe(422);
  });

  it('rate limits per device', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await post(valid, { did: 'spammy' })).status).toBe(201);
    }
    const res = await post(valid, { did: 'spammy' });
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('RATE_LIMITED');
    expect((await post(valid, { did: 'other' })).status).toBe(201);
  });

  it('global hourly cap', async () => {
    const bucket = hourBucket(new Date());
    const stmts = Array.from({ length: 100 }, (_, i) =>
      env.DB.prepare("INSERT INTO feedback (id, message, screen, device, lang, app_version, created_at) VALUES (?, 'm', 's', 'phone', 'vi', 'v', ?)").bind(`f-${i}`, bucket),
    );
    await env.DB.batch(stmts);
    expect((await post(valid)).status).toBe(429);
  });
});

describe('hourBucket', () => {
  it('truncates to the hour in UTC', () => {
    expect(hourBucket(new Date('2026-11-01T13:47:12.345Z'))).toBe('2026-11-01T13:00:00.000Z');
  });
});
