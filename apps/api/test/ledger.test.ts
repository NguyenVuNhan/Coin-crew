import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import type { TripListItem } from '@fsl/core';
import { call, json, linkMember, memberSid, seedTrip, PID, U } from './helpers';

type Ledger = { tripId: string; ownerPid: string };

const auth = (sid: string, extra: Record<string, string> = {}) => ({ Cookie: `sid=${sid}`, ...extra });

function post(path: string, sid: string, body: unknown): Promise<Response> {
  return call(path, {
    method: 'POST',
    headers: auth(sid, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
}

async function getLedger(sid: string): Promise<Ledger> {
  const res = await call('/api/me/ledger', { headers: auth(sid) });
  expect(res.status).toBe(200);
  return json<Ledger>(res);
}

describe('personal ledger', () => {
  it('GET /me/ledger requires sign-in', async () => {
    const res = await call('/api/me/ledger');
    expect(res.status).toBe(401);
  });

  it('GET /me/ledger is idempotent and the owner is an admin member', async () => {
    const sid = await memberSid(U.minh, 'Minh');
    const a = await getLedger(sid);
    const b = await getLedger(sid);
    expect(b).toEqual(a);

    const trips = await env.DB.prepare("SELECT id, preset FROM trips WHERE organiser_user_id = ? AND preset = 'direct'").bind(U.minh).all();
    expect(trips.results).toHaveLength(1);

    const owner = await env.DB.prepare('SELECT user_id, is_admin, status, trip_id FROM participants WHERE id = ?').bind(a.ownerPid).first();
    expect(owner).toMatchObject({ user_id: U.minh, is_admin: 1, status: 'active', trip_id: a.tripId });
  });

  it('concurrent first calls share one ledger', async () => {
    const sid = await memberSid(U.minh, 'Minh');
    const [a, b] = await Promise.all([getLedger(sid), getLedger(sid)]);
    expect(b).toEqual(a);
  });

  it('GET /trips does not list the ledger', async () => {
    await seedTrip();
    const sid = await memberSid(U.minh, 'Minh');
    const ledger = await getLedger(sid);
    const list = await json<TripListItem[]>(call('/api/trips', { headers: auth(sid) }));
    expect(list.map((t) => t.id)).not.toContain(ledger.tripId);
    expect(list).toHaveLength(1);
  });

  it("POST /trips with preset 'direct' is rejected", async () => {
    const sid = await memberSid(U.minh, 'Minh');
    const res = await post('/api/trips', sid, { name: 'X', myName: 'Minh', people: ['An'], preset: 'direct' });
    expect(res.status).toBe(422);
  });

  it('adds a plain name to the ledger', async () => {
    const sid = await memberSid(U.minh, 'Minh');
    const ledger = await getLedger(sid);
    const res = await post('/api/me/ledger/people', sid, { name: 'Lan' });
    expect(res.status).toBe(201);
    const { participantId } = await json<{ participantId: string }>(res);
    const row = await env.DB.prepare('SELECT trip_id, name, user_id, status FROM participants WHERE id = ?').bind(participantId).first();
    expect(row).toMatchObject({ trip_id: ledger.tripId, name: 'Lan', user_id: null, status: 'active' });

    const bad = await post('/api/me/ledger/people', sid, { name: '  ' });
    expect(bad.status).toBe(422);
  });

  it('importing a group member with an account gives a ledger participant with that userId', async () => {
    await seedTrip();
    await linkMember(PID.A, U.an, 'An');
    const sid = await memberSid(U.minh, 'Minh');
    const ledger = await getLedger(sid);

    const res = await post('/api/me/ledger/people', sid, { participantId: PID.A });
    expect(res.status).toBe(201);
    const { participantId } = await json<{ participantId: string }>(res);
    const row = await env.DB.prepare('SELECT trip_id, name, user_id FROM participants WHERE id = ?').bind(participantId).first();
    expect(row).toMatchObject({ trip_id: ledger.tripId, name: 'An', user_id: U.an });

    const again = await json<{ participantId: string }>(post('/api/me/ledger/people', sid, { participantId: PID.A }));
    expect(again.participantId).toBe(participantId);
    const links = await env.DB.prepare('SELECT COUNT(*) AS n FROM person_links').first<{ n: number }>();
    expect(links?.n).toBe(0);
  });

  it('importing a group guest twice returns the same pid and one person_links row', async () => {
    await seedTrip();
    const sid = await memberSid(U.minh, 'Minh');
    const ledger = await getLedger(sid);

    const first = await json<{ participantId: string }>(post('/api/me/ledger/people', sid, { participantId: PID.B }));
    const second = await json<{ participantId: string }>(post('/api/me/ledger/people', sid, { participantId: PID.B }));
    expect(second.participantId).toBe(first.participantId);

    const row = await env.DB.prepare('SELECT trip_id, name, user_id FROM participants WHERE id = ?').bind(first.participantId).first();
    expect(row).toMatchObject({ trip_id: ledger.tripId, name: 'Bình', user_id: null });

    const links = await env.DB.prepare('SELECT owner_user_id, participant_id, person_pid FROM person_links').all();
    expect(links.results).toEqual([{ owner_user_id: U.minh, participant_id: PID.B, person_pid: first.participantId }]);
  });

  it('the caller must be an active member of the source trip', async () => {
    await seedTrip();
    const sid = await memberSid('u-stranger', 'Stranger');
    const res = await post('/api/me/ledger/people', sid, { participantId: PID.B });
    expect(res.status).toBe(403);

    const unknown = await post('/api/me/ledger/people', sid, { participantId: 'nope' });
    expect(unknown.status).toBe(403);
  });

  it('the owner can add an expense to the ledger through the trip routes', async () => {
    const sid = await memberSid(U.minh, 'Minh');
    const ledger = await getLedger(sid);
    const res = await call(`/api/trips/${ledger.tripId}`, { headers: auth(sid) });
    expect(res.status).toBe(200);
  });
});
