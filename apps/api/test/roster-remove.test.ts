import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import type { TripView } from '@fsl/core';
import { call, json, seedTrip, seedExpenses, memberSid, guestHeaders, linkMember, T, U, PID } from './helpers';

const base = `/api/trips/${T.tripId}`;
const post = (path: string, headers: Record<string, string>, body?: unknown) =>
  call(`${base}${path}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const del = (path: string, headers: Record<string, string>) => call(`${base}${path}`, { method: 'DELETE', headers });
const minh = async () => ({ Cookie: `sid=${await memberSid(U.minh, 'Minh')}` });
const view = async (headers: Record<string, string>) => json<TripView>(call(base, { headers }));
const status = (id: string) =>
  env.DB.prepare('SELECT status, is_admin FROM participants WHERE id = ?').bind(id).first<{ status: string; is_admin: number }>();

beforeEach(async () => {
  await seedTrip();
  await seedExpenses();
});

describe('removing people', () => {
  it('a guest with history becomes Left and keeps their balance', async () => {
    const before = await view(await minh());
    expect((await del(`/people/${PID.C}`, await minh())).status).toBe(204);
    const after = await view(await minh());
    expect(after.people.find((p) => p.id === PID.C)?.status).toBe('left');
    expect(after.balances[PID.C]).toBe(before.balances[PID.C]);
  });

  it('a name with no history is deleted', async () => {
    const { participantId } = await json<{ participantId: string }>(await post('/people', await minh(), { name: 'Giang' }));
    expect((await del(`/people/${participantId}`, await minh())).status).toBe(204);
    expect((await view(await minh())).people.some((p) => p.id === participantId)).toBe(false);
  });

  it('a removed member loses member access', async () => {
    const anSid = await linkMember(PID.A, U.an, 'An');
    expect((await del(`/people/${PID.A}`, await minh())).status).toBe(204);
    expect(await status(PID.A)).toEqual({ status: 'left', is_admin: 0 });
    const trips = await json<{ id: string }[]>(call('/api/trips', { headers: { Cookie: `sid=${anSid}` } }));
    expect(trips.some((t) => t.id === T.tripId)).toBe(false);
    expect((await call(base, { headers: { Cookie: `sid=${anSid}` } })).status).toBe(403);
    const g = await guestHeaders();
    const withLink = await view({ ...g, Cookie: `${g.Cookie}; sid=${anSid}` });
    expect(withLink.me).toMatchObject({ kind: 'guest', participantId: null });
  });

  it("a removed guest's phone has no name any more", async () => {
    const chi = await guestHeaders(PID.C);
    await del(`/people/${PID.C}`, await minh());
    expect((await view(chi)).me.participantId).toBeNull();
  });

  it('removing rejects their waiting claim and waiting bank details', async () => {
    await env.DB.prepare("INSERT INTO membership_requests (id, trip_id, participant_id, user_id, status, created_at) VALUES ('mr-1', ?, ?, 'u-x', 'pending', '2026-10-12T00:00:00.000Z')").bind(T.tripId, PID.C).run();
    await env.DB.prepare("INSERT INTO bank_details (id, participant_id, bin, account_number, holder_name, status, consent_at, created_at) VALUES ('b-chi', ?, '970407', '0123456789', 'CHI', 'pending', '2026-10-12T00:00:00.000Z', '2026-10-12T00:00:00.000Z')").bind(PID.C).run();
    await del(`/people/${PID.C}`, await minh());
    expect((await env.DB.prepare("SELECT status FROM membership_requests WHERE id = 'mr-1'").first<{ status: string }>())?.status).toBe('rejected');
    expect((await env.DB.prepare("SELECT status FROM bank_details WHERE id = 'b-chi'").first<{ status: string }>())?.status).toBe('rejected');
  });

  it('only the organiser removes an admin', async () => {
    const anSid = await linkMember(PID.A, U.an, 'An');
    await linkMember(PID.B, 'u-binh', 'Bình');
    await env.DB.prepare('UPDATE participants SET is_admin = 1 WHERE id IN (?, ?)').bind(PID.A, PID.B).run();
    expect((await del(`/people/${PID.B}`, { Cookie: `sid=${anSid}` })).status).toBe(403);
    expect((await del(`/people/${PID.B}`, await minh())).status).toBe(204);
  });

  it('nobody removes the organiser, and nobody removes themselves', async () => {
    const anSid = await linkMember(PID.A, U.an, 'An');
    await env.DB.prepare('UPDATE participants SET is_admin = 1 WHERE id = ?').bind(PID.A).run();
    expect((await del(`/people/${PID.M}`, { Cookie: `sid=${anSid}` })).status).toBe(403);
    expect((await del(`/people/${PID.M}`, await minh())).status).toBe(403);
    expect((await del(`/people/${PID.A}`, { Cookie: `sid=${anSid}` })).status).toBe(403);
  });

  it('a non-admin member cannot remove anyone', async () => {
    const anSid = await linkMember(PID.A, U.an, 'An');
    expect((await del(`/people/${PID.C}`, { Cookie: `sid=${anSid}` })).status).toBe(403);
  });

  it('removing twice says not found', async () => {
    await del(`/people/${PID.C}`, await minh());
    expect((await del(`/people/${PID.C}`, await minh())).status).toBe(404);
  });
});

describe('leaving', () => {
  it('a member leaves and the group leaves their list', async () => {
    const anSid = await linkMember(PID.A, U.an, 'An');
    expect((await post('/leave', { Cookie: `sid=${anSid}` })).status).toBe(204);
    expect((await status(PID.A))?.status).toBe('left');
    const trips = await json<{ id: string }[]>(call('/api/trips', { headers: { Cookie: `sid=${anSid}` } }));
    expect(trips).toEqual([]);
    const activity = await env.DB.prepare("SELECT details_json FROM activity WHERE trip_id = ? AND action = 'person_left'").bind(T.tripId).first<{ details_json: string }>();
    expect(JSON.parse(activity!.details_json)).toEqual({ name: 'An' });
  });

  it('the organiser and guests cannot leave', async () => {
    expect((await post('/leave', await minh())).status).toBe(403);
    expect((await post('/leave', await guestHeaders(PID.C))).status).toBe(403);
  });

  it('an archived group refuses leaving', async () => {
    const anSid = await linkMember(PID.A, U.an, 'An');
    await env.DB.prepare("UPDATE trips SET archived_at = '2026-10-20T00:00:00.000Z' WHERE id = ?").bind(T.tripId).run();
    const res = await post('/leave', { Cookie: `sid=${anSid}` });
    expect(res.status).toBe(409);
  });
});

describe('bringing people back', () => {
  it('an admin brings a left member back as a member, not an admin', async () => {
    const anSid = await linkMember(PID.A, U.an, 'An');
    await env.DB.prepare('UPDATE participants SET is_admin = 1 WHERE id = ?').bind(PID.A).run();
    await del(`/people/${PID.A}`, await minh());
    expect((await post(`/people/${PID.A}/restore`, await minh())).status).toBe(204);
    expect((await view({ Cookie: `sid=${anSid}` })).me).toMatchObject({ kind: 'member', isAdmin: false });
  });

  it('only a left name can be brought back, and only by an admin', async () => {
    expect((await post(`/people/${PID.C}/restore`, await minh())).status).toBe(404);
    await del(`/people/${PID.C}`, await minh());
    const anSid = await linkMember(PID.A, U.an, 'An');
    expect((await post(`/people/${PID.C}/restore`, { Cookie: `sid=${anSid}` })).status).toBe(403);
  });
});
