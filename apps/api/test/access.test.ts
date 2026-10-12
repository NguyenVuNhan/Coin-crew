import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { createApp } from '../src/app';
import { resolveActor, assertWritable } from '../src/access/actor';
import { call, cookiesFrom, seedTrip, memberSid, newDevice, pickAs, T, U, PID } from './helpers';

const probe = createApp();
probe.get('/api/test/actor/:tripId', async (c) => {
  const a = await resolveActor(c, c.req.param('tripId'));
  return c.json({ kind: a.kind, participantId: a.participantId, participantPending: a.participantPending, isOrganiser: a.isOrganiser, userId: a.userId });
});
probe.post('/api/test/write/:tripId', async (c) => {
  const a = await resolveActor(c, c.req.param('tripId'));
  assertWritable(a.trip);
  return c.json({ ok: true });
});
const actor = (headers: Record<string, string>, tripId: string = T.tripId) => probe.request(`/api/test/actor/${tripId}`, { headers }, env);
const count = async (table: string) => (await env.DB.prepare(`SELECT count(*) AS n FROM ${table}`).first<{ n: number }>())!.n;

beforeEach(seedTrip);

describe('device identity', () => {
  it('first request creates a device cookie and tells the browser its id', async () => {
    const res = await call('/api/health');
    expect(res.headers.get('X-Device-Id')).toBeTruthy();
    expect(cookiesFrom(res).did).toBe(res.headers.get('X-Device-Id'));
  });

  it('a request with the cookie reuses the device', async () => {
    const { cookie } = await newDevice();
    const before = await count('devices');
    const res = await call('/api/health', { headers: { Cookie: cookie } });
    expect(res.headers.get('X-Device-Id')).toBeNull();
    expect(await count('devices')).toBe(before);
  });

  it('X-Device-Restore brings back a lost cookie without a new device', async () => {
    const { deviceId } = await newDevice();
    const before = await count('devices');
    const res = await call('/api/health', { headers: { 'X-Device-Restore': deviceId } });
    expect(cookiesFrom(res).did).toBe(deviceId);
    expect(await count('devices')).toBe(before);
  });
});

describe('links', () => {
  it('group link', async () => {
    const res = await call(`/api/links/${T.groupToken}`);
    expect(await res.json()).toEqual({ tripId: T.tripId, tripName: 'Đà Lạt · Oct 2026', access: 'group' });
  });
  it('view-only link', async () => {
    expect(await (await call(`/api/links/${T.viewToken}`)).json()).toMatchObject({ access: 'view' });
  });
  it('unknown link is dead', async () => {
    const res = await call('/api/links/nope');
    expect(res.status).toBe(410);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('LINK_DEAD');
  });
});

describe('resolveActor', () => {
  it('signed-in organiser is a member', async () => {
    const sid = await memberSid(U.minh, 'Minh');
    expect(await (await actor({ Cookie: `sid=${sid}` })).json()).toMatchObject({ kind: 'member', participantId: PID.M, isOrganiser: true, userId: U.minh });
  });

  it('signed-in non-member with the group link is a guest', async () => {
    const sid = await memberSid(U.an, 'An');
    expect(await (await actor({ Cookie: `sid=${sid}`, 'X-Link-Token': T.groupToken })).json()).toMatchObject({ kind: 'guest', participantId: null, userId: U.an });
  });

  it('guest gets the participant their device picked', async () => {
    const { deviceId, cookie } = await newDevice();
    await pickAs(deviceId, PID.C);
    expect(await (await actor({ Cookie: cookie, 'X-Link-Token': T.groupToken })).json()).toMatchObject({ kind: 'guest', participantId: PID.C, participantPending: false });
  });

  it('a pick of a pending name is flagged pending', async () => {
    await env.DB.prepare("INSERT INTO participants (id, trip_id, name, normalized_name, status, sort_order, created_at) VALUES ('p-new', ?, 'Dũng', 'dung', 'pending', 9, '2026-10-12T00:00:00.000Z')").bind(T.tripId).run();
    const { deviceId, cookie } = await newDevice();
    await pickAs(deviceId, 'p-new');
    expect(await (await actor({ Cookie: cookie, 'X-Link-Token': T.groupToken })).json()).toMatchObject({ participantId: 'p-new', participantPending: true });
  });

  it('Review Focus 3: a merged pick lands on the merged-into person, following chains', async () => {
    await env.DB.prepare("INSERT INTO participants (id, trip_id, name, normalized_name, status, merged_into, sort_order, created_at) VALUES ('p-old', ?, 'Chi Nguyễn', 'chi nguyen', 'merged', 'p-mid', 7, '2026-10-12T00:00:00.000Z'), ('p-mid', ?, 'Chi N', 'chi n', 'merged', ?, 8, '2026-10-12T00:00:00.000Z')").bind(T.tripId, T.tripId, PID.C).run();
    const { deviceId, cookie } = await newDevice();
    await pickAs(deviceId, 'p-old');
    expect(await (await actor({ Cookie: cookie, 'X-Link-Token': T.groupToken })).json()).toMatchObject({ participantId: PID.C });
  });

  it('view-only link is a viewer', async () => {
    expect(await (await actor({ 'X-Link-Token': T.viewToken })).json()).toMatchObject({ kind: 'viewer', participantId: null });
  });

  it('an old link is dead', async () => {
    await env.DB.prepare("UPDATE trips SET group_token = 'gtok-new' WHERE id = ?").bind(T.tripId).run();
    const res = await actor({ 'X-Link-Token': T.groupToken });
    expect(res.status).toBe(410);
  });

  it('no session and no link is forbidden', async () => {
    expect((await actor({})).status).toBe(403);
  });

  it('missing trip is 404', async () => {
    expect((await actor({ 'X-Link-Token': T.groupToken }, 'no-such-trip')).status).toBe(404);
  });

  it('archived trip refuses writes', async () => {
    await env.DB.prepare("UPDATE trips SET archived_at = '2026-10-13T00:00:00.000Z' WHERE id = ?").bind(T.tripId).run();
    const sid = await memberSid(U.minh, 'Minh');
    const res = await probe.request(`/api/test/write/${T.tripId}`, { method: 'POST', headers: { Cookie: `sid=${sid}` } }, env);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('TRIP_ARCHIVED');
  });
});
