import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import type { PickerView, TripView } from '@cc/core';
import { getDb } from '@cc/api-db/client';
import { linkZaloSlots } from '../src/auth/zaloSlots';
import { call, json, guestHeaders, linkMember, memberSid, seedTrip, T, U, PID } from './helpers';

const base = `/api/trips/${T.tripId}`;

async function sql(query: string, ...binds: unknown[]) {
  await env.DB.prepare(query).bind(...binds).run();
}

async function row(pid: string): Promise<{ zalo_sub: string | null; user_id: string | null; name: string }> {
  return (await env.DB.prepare('SELECT zalo_sub, user_id, name FROM participants WHERE id = ?').bind(pid).first())!;
}

const send = (method: string, path: string, headers: Record<string, string>, body: unknown) =>
  call(`${base}${path}`, {
    method,
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const minh = async () => ({ Cookie: `sid=${await memberSid(U.minh, 'Minh')}` });
/** Bình as a signed-in member who is not an admin. */
const binhMember = async () => ({ Cookie: `sid=${await linkMember(PID.B, 'u-binh', 'Bình')}` });

beforeEach(seedTrip);

describe('add a Zalo friend', () => {
  it('admin adds a Zalo friend', async () => {
    const res = await send('POST', '/people', await minh(), { name: 'Dũng', zaloSub: 'z-dung' });
    expect(res.status).toBe(201);
    const { participantId } = await json<{ participantId: string }>(res);
    expect((await row(participantId)).zalo_sub).toBe('z-dung');
  });

  it('non-admin member cannot add with zaloSub', async () => {
    const h = await binhMember();
    const res = await send('POST', '/people', h, { name: 'Dũng', zaloSub: 'z-dung' });
    expect(res.status).toBe(403);
    const count = await env.DB.prepare("SELECT count(*) AS n FROM participants WHERE trip_id = ? AND name = 'Dũng'").bind(T.tripId).first<{ n: number }>();
    expect(count!.n).toBe(0);
    // As today: adding anyone is already admin-only (add_person), with or without zaloSub.
    expect((await send('POST', '/people', h, { name: 'Dũng' })).status).toBe(403);
  });

  it('a promoted admin may add a Zalo friend', async () => {
    const h = await binhMember();
    await sql('UPDATE participants SET is_admin = 1 WHERE id = ?', PID.B);
    const res = await send('POST', '/people', h, { name: 'Dũng', zaloSub: 'z-dung' });
    expect(res.status).toBe(201);
    const { participantId } = await json<{ participantId: string }>(res);
    expect((await row(participantId)).zalo_sub).toBe('z-dung');
  });

  it('guest cannot add with zaloSub', async () => {
    const h = await guestHeaders(PID.C);
    expect((await send('POST', '/people', h, { name: 'Dũng', zaloSub: 'z-dung' })).status).toBe(403);
  });

  it('rejects a bad zaloSub', async () => {
    const h = await minh();
    expect((await send('POST', '/people', h, { name: 'Dũng', zaloSub: '' })).status).toBe(422);
    expect((await send('POST', '/people', h, { name: 'Dũng', zaloSub: 'z'.repeat(65) })).status).toBe(422);
    expect((await send('POST', '/people', h, { name: 'Dũng', zaloSub: 42 })).status).toBe(422);
  });

  it('same friend twice', async () => {
    const h = await minh();
    expect((await send('POST', '/people', h, { name: 'Dũng', zaloSub: 'z-dung' })).status).toBe(201);
    const res = await send('POST', '/people', h, { name: 'Dũng Lê', zaloSub: 'z-dung' });
    expect(res.status).toBe(409);
    expect((await json<{ error: { code: string } }>(res)).error.code).toBe('CONFLICT');
  });

  it('same friend held by a left participant still conflicts', async () => {
    await sql("UPDATE participants SET zalo_sub = 'z-dung', status = 'left' WHERE id = ?", PID.C);
    expect((await send('POST', '/people', await minh(), { name: 'Dũng', zaloSub: 'z-dung' })).status).toBe(409);
  });
});

describe('link a Zalo friend to an existing person', () => {
  it('admin links a friend to an existing person', async () => {
    const res = await send('PATCH', `/people/${PID.A}`, await minh(), { zaloSub: 'z-an' });
    expect(res.status).toBe(204);
    const r = await row(PID.A);
    expect(r.zalo_sub).toBe('z-an');
    expect(r.name).toBe('An');
  });

  it('link never overwrites', async () => {
    const h = await minh();
    await sql("UPDATE participants SET zalo_sub = 'z-other' WHERE id = ?", PID.A);
    expect((await send('PATCH', `/people/${PID.A}`, h, { zaloSub: 'z-an' })).status).toBe(409);
    expect((await row(PID.A)).zalo_sub).toBe('z-other');

    await linkMember(PID.C, 'u-chi', 'Chi');
    expect((await send('PATCH', `/people/${PID.C}`, h, { zaloSub: 'z-chi' })).status).toBe(409);
    expect((await row(PID.C)).zalo_sub).toBeNull();
  });

  it('link conflicts when another person in the group holds the friend', async () => {
    await sql("UPDATE participants SET zalo_sub = 'z-an' WHERE id = ?", PID.C);
    expect((await send('PATCH', `/people/${PID.A}`, await minh(), { zaloSub: 'z-an' })).status).toBe(409);
    expect((await row(PID.A)).zalo_sub).toBeNull();
  });

  it('non-admin cannot link', async () => {
    const h = await binhMember();
    expect((await send('PATCH', `/people/${PID.A}`, h, { zaloSub: 'z-an' })).status).toBe(403);
    // Not even their own row.
    await sql('UPDATE participants SET user_id = NULL WHERE id = ?', PID.B);
    const g = await guestHeaders(PID.B);
    expect((await send('PATCH', `/people/${PID.B}`, g, { zaloSub: 'z-binh' })).status).toBe(403);
    expect((await row(PID.A)).zalo_sub).toBeNull();
    expect((await row(PID.B)).zalo_sub).toBeNull();
  });

  it('rename still works as before', async () => {
    expect((await send('PATCH', `/people/${PID.A}`, await minh(), { name: 'An Nguyễn' })).status).toBe(204);
    expect((await row(PID.A)).name).toBe('An Nguyễn');
  });
});

describe('zaloLinked', () => {
  it('picker exposes zaloLinked, not the id', async () => {
    await sql("UPDATE participants SET zalo_sub = 'z-an' WHERE id = ?", PID.A);
    const res = await call(`${base}/people/picker`, { headers: await minh() });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain('z-an');
    const view = JSON.parse(text) as PickerView;
    expect(view.people.find((p) => p.id === PID.A)?.zaloLinked).toBe(true);
    expect(view.people.find((p) => p.id === PID.B)?.zaloLinked).toBe(false);
  });

  it('trip view exposes zaloLinked, not the id', async () => {
    await sql("UPDATE participants SET zalo_sub = 'z-an' WHERE id = ?", PID.A);
    const res = await call(base, { headers: await minh() });
    const text = await res.text();
    expect(text).not.toContain('z-an');
    const view = JSON.parse(text) as TripView;
    expect(view.people.find((p) => p.id === PID.A)?.zaloLinked).toBe(true);
    expect(view.people.find((p) => p.id === PID.C)?.zaloLinked).toBe(false);
  });
});

describe('create a group with Zalo friends', () => {
  const create = async (people: unknown[]) =>
    call('/api/trips', {
      method: 'POST',
      headers: { ...(await minh()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Cầu lông', myName: 'Minh', people }),
    });

  it('creating a group with Zalo friends stores zalo_sub', async () => {
    const res = await create([{ name: 'Dũng', zaloSub: 'z-dung' }, 'Hà', { name: 'Lan', zaloSub: 'z-lan' }]);
    expect(res.status).toBe(201);
    const { tripId } = await json<{ tripId: string }>(res);
    const rows = await env.DB.prepare('SELECT name, zalo_sub FROM participants WHERE trip_id = ? ORDER BY sort_order').bind(tripId).all<{ name: string; zalo_sub: string | null }>();
    expect(rows.results.map((r) => [r.name, r.zalo_sub])).toEqual([
      ['Minh', null],
      ['Dũng', 'z-dung'],
      ['Hà', null],
      ['Lan', 'z-lan'],
    ]);
  });

  it('rejects duplicate or bad zaloSub in the create body', async () => {
    expect((await create([{ name: 'Dũng', zaloSub: 'z-dung' }, { name: 'Dũng 2', zaloSub: 'z-dung' }])).status).toBe(422);
    expect((await create([{ name: 'Dũng', zaloSub: '' }])).status).toBe(422);
    expect((await create([{ name: 'Dũng', zaloSub: 'z'.repeat(65) }])).status).toBe(422);
  });
});

describe('end to end', () => {
  it('a linked friend becomes a member when they sign in', async () => {
    const res = await send('POST', '/people', await minh(), { name: 'Dũng', zaloSub: 'z-dung' });
    expect(res.status).toBe(201);
    const { participantId } = await json<{ participantId: string }>(res);

    await sql("INSERT INTO users (id, zalo_sub, name, consent_at, created_at) VALUES ('u-dung', 'z-dung', 'Dũng', ?, ?)",
      '2026-10-12T00:00:00.000Z', '2026-10-12T00:00:00.000Z');
    expect(await linkZaloSlots(getDb(env), 'u-dung', 'z-dung')).toBe(1);
    expect((await row(participantId)).user_id).toBe('u-dung');
  });
});

