import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import type { MeResponse } from '@cc/core';
import { call, json, memberSid } from './helpers';

async function setSwitch(userId: string, enabled: 0 | 1) {
  await env.DB.prepare(
    "INSERT INTO user_personal_settings (user_id, enabled, updated_at) VALUES (?, ?, '2026-11-15T00:00:00.000Z') ON CONFLICT(user_id) DO UPDATE SET enabled = excluded.enabled",
  ).bind(userId, enabled).run();
}
const as = (sid: string) => ({ headers: { Cookie: `sid=${sid}` } });

describe('personal area switch', () => {
  it('GET /api/me leaves personalArea out when there is no row', async () => {
    const sid = await memberSid('u-off', 'Off');
    const body = await json<MeResponse>(await call('/api/me', as(sid)));
    expect('personalArea' in body).toBe(false);
  });

  it('GET /api/me leaves personalArea out when the row says off', async () => {
    const sid = await memberSid('u-zero', 'Zero');
    await setSwitch('u-zero', 0);
    const body = await json<MeResponse>(await call('/api/me', as(sid)));
    expect('personalArea' in body).toBe(false);
  });

  it('GET /api/me says personalArea: true when on', async () => {
    const sid = await memberSid('u-on', 'On');
    await setSwitch('u-on', 1);
    const body = await json<MeResponse>(await call('/api/me', as(sid)));
    expect(body.personalArea).toBe(true);
  });

  it('GET /api/me/personal: 401 signed out, 403 off, 403 row off, 200 on', async () => {
    expect((await call('/api/me/personal')).status).toBe(401);

    const off = await memberSid('u-off2', 'Off');
    const offRes = await call('/api/me/personal', as(off));
    expect(offRes.status).toBe(403);
    expect((await json<{ error: { code: string } }>(offRes)).error.code).toBe('FORBIDDEN');

    const zero = await memberSid('u-zero2', 'Zero');
    await setSwitch('u-zero2', 0);
    expect((await call('/api/me/personal', as(zero))).status).toBe(403);

    const on = await memberSid('u-on2', 'On');
    await setSwitch('u-on2', 1);
    const onRes = await call('/api/me/personal', as(on));
    expect(onRes.status).toBe(200);
    expect(await json(onRes)).toEqual({ ok: true });
  });

  it("one account's switch does nothing for another account", async () => {
    await memberSid('u-owner', 'Owner');
    await setSwitch('u-owner', 1);
    const other = await memberSid('u-other', 'Other');
    expect((await call('/api/me/personal', as(other))).status).toBe(403);
    const body = await json<MeResponse>(await call('/api/me', as(other)));
    expect('personalArea' in body).toBe(false);
  });

  const patch = (sid: string | null, body: unknown, path = '/api/me/personal') =>
    call(path, {
      method: 'PATCH',
      headers: { ...(sid ? { Cookie: `sid=${sid}` } : {}), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('PATCH /api/me/personal: 401 signed out, 422 for a body that is not { enabled: boolean }', async () => {
    expect((await patch(null, { enabled: true })).status).toBe(401);
    const sid = await memberSid('u-bad', 'Bad');
    for (const body of [{}, { enabled: 'yes' }, { enabled: 1 }, [true], null]) {
      expect((await patch(sid, body)).status).toBe(422);
    }
  });

  it('PATCH /api/me/personal turns the caller on, then off again', async () => {
    const sid = await memberSid('u-flip', 'Flip');
    const on = await patch(sid, { enabled: true });
    expect(on.status).toBe(200);
    expect(await json(on)).toEqual({ enabled: true });
    expect((await json<MeResponse>(await call('/api/me', as(sid)))).personalArea).toBe(true);
    expect((await call('/api/me/personal', as(sid))).status).toBe(200);

    expect(await json(await patch(sid, { enabled: false }))).toEqual({ enabled: false });
    expect('personalArea' in (await json<MeResponse>(await call('/api/me', as(sid))))).toBe(false);
    expect((await call('/api/me/personal', as(sid))).status).toBe(403);
    const rows = await env.DB.prepare("SELECT COUNT(*) AS n FROM user_personal_settings WHERE user_id = 'u-flip'").first<{ n: number }>();
    expect(rows?.n).toBe(1);
  });

  it('PATCH /api/me/personal changes only the caller', async () => {
    const a = await memberSid('u-a', 'A');
    const b = await memberSid('u-b', 'B');
    await patch(a, { enabled: true, userId: 'u-b' });
    expect((await call('/api/me/personal', as(b))).status).toBe(403);
  });

  it('PATCH /api/me does not change the setting', async () => {
    const sid = await memberSid('u-try', 'Try');
    const res = await patch(sid, { personalArea: true }, '/api/me');
    expect(res.status).toBeLessThan(500);
    const row = await env.DB.prepare("SELECT enabled FROM user_personal_settings WHERE user_id = 'u-try'").first();
    expect(row).toBeNull();
  });
});
