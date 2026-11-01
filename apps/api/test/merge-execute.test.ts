import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { drizzle } from 'drizzle-orm/d1';
import type { PersonKey } from '@fsl/core';
import * as schema from '../src/db/schema';
import { loadMergeOptions } from '../src/me/mergeOptions';
import { call, json, memberSid, seedUser } from './helpers';

const OWNER = 'u-owner';
const CHI = 'u-chi';
const DAO = 'u-dao';
const NOW = '2026-10-20T00:00:00.000Z';

const db = () => drizzle(env.DB, { schema });

async function run(query: string, ...binds: unknown[]) {
  await env.DB.prepare(query).bind(...binds).run();
}

async function all<R>(query: string, ...binds: unknown[]): Promise<R[]> {
  return (await env.DB.prepare(query).bind(...binds).all<R>()).results;
}

async function addTrip(id: string, name: string) {
  await run(
    'INSERT INTO trips (id, name, preset, currency, fewest_transfers, organiser_user_id, group_token, view_token, version, created_at) VALUES (?, ?, \'trip\', \'VND\', 1, ?, ?, ?, 0, ?)',
    id, name, OWNER, `g-${id}`, `v-${id}`, NOW,
  );
}

async function addPerson(tripId: string, id: string, name: string, userId: string | null) {
  await run(
    'INSERT INTO participants (id, trip_id, name, normalized_name, user_id, is_admin, status, sort_order, created_at) VALUES (?, ?, ?, ?, ?, 0, \'active\', 0, ?)',
    id, tripId, name, name.toLowerCase(), userId, NOW,
  );
}

/**
 * T1 "Đà Lạt" (owner organises): owner, guests An and Bình, members Chi and Đào (not admins).
 * T2 "Hội An": owner, guest Minh.
 */
async function seed() {
  await seedUser(OWNER, 'Owen');
  await seedUser(CHI, 'Chi');
  await seedUser(DAO, 'Đào');
  await addTrip('t1', 'Đà Lạt');
  await addPerson('t1', 't1-o', 'Owen', OWNER);
  await addPerson('t1', 'p-an', 'An', null);
  await addPerson('t1', 'p-binh', 'Bình', null);
  await addPerson('t1', 't1-chi', 'Chi', CHI);
  await addPerson('t1', 't1-dao', 'Đào', DAO);
  await addTrip('t2', 'Hội An');
  await addPerson('t2', 't2-o', 'Owen', OWNER);
  await addPerson('t2', 'p-minh', 'Minh', null);
}

async function merge(keys: unknown, userId = OWNER): Promise<Response> {
  const sid = await memberSid(userId);
  return call('/api/me/people/merge', {
    method: 'POST',
    headers: { Cookie: `sid=${sid}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ keys }),
  });
}

async function ok(keys: PersonKey[], userId = OWNER): Promise<{ key: PersonKey; proposals: string[] }> {
  const res = await merge(keys, userId);
  expect(res.status, await res.clone().text()).toBe(200);
  return json(res);
}

async function errorCode(res: Response): Promise<string> {
  return (await json<{ error: { code: string } }>(res)).error.code;
}

interface ProposalDbRow {
  id: string; trip_id: string; guest_pid: string; into_pid: string | null; target_user_id: string | null;
  requested_by_user_id: string; needs_user: number; needs_admin: number; status: string;
}
const proposals = () => all<ProposalDbRow>('SELECT * FROM merge_proposals ORDER BY created_at');

/** Everything a merge could write, to check that a refused one wrote nothing. */
async function writes() {
  return {
    proposals: await all('SELECT * FROM merge_proposals'),
    links: await all('SELECT * FROM person_links'),
    merges: await all('SELECT * FROM participant_merges'),
    participants: await all('SELECT id, status, merged_into, user_id FROM participants ORDER BY id'),
    activity: await all('SELECT id FROM activity'),
    versions: await all('SELECT id, version FROM trips ORDER BY id'),
  };
}

describe('POST /api/me/people/merge', () => {
  it('guests in two groups → link, no proposal', async () => {
    await seed();
    const body = await ok(['p:p-an', 'p:p-minh']);
    expect(body.proposals).toEqual([]);

    // One person now, under the key the response gave.
    const opts = await loadMergeOptions(db(), OWNER, 'p:p-an');
    expect(opts!.person.key).toBe(body.key);
    // Both guests, plus the owner's ledger row the link made for them.
    expect(opts!.person.groups.map((g) => g.participantId)).toEqual(expect.arrayContaining(['p-an', 'p-minh']));
    expect(opts!.person.groups).toHaveLength(3);
    expect(opts!.candidates.map((c) => c.key)).not.toContain('p:p-minh');
    expect(await proposals()).toEqual([]);
  });

  it('admin merges two guests in the same group', async () => {
    await seed();
    const body = await ok(['p:p-an', 'p:p-binh']);
    expect(body).toEqual({ key: 'p:p-an', proposals: [] });

    const [binh] = await all<{ status: string; merged_into: string }>('SELECT status, merged_into FROM participants WHERE id = ?', 'p-binh');
    expect(binh).toEqual({ status: 'merged', merged_into: 'p-an' });
    expect(await all('SELECT id FROM activity WHERE trip_id = ? AND action = ?', 't1', 'name_merged')).toHaveLength(1);
    expect(await proposals()).toEqual([]);
  });

  it('non-admin same-group pick creates an admin-only proposal', async () => {
    await seed();
    const body = await ok(['p:p-an', 'p:p-binh'], CHI);
    expect(body.key).toBe('p:p-an');
    expect(body.proposals).toHaveLength(1);

    expect(await proposals()).toEqual([expect.objectContaining({
      id: body.proposals[0],
      trip_id: 't1',
      guest_pid: 'p-binh',
      into_pid: 'p-an',
      target_user_id: null,
      requested_by_user_id: CHI,
      needs_user: 0,
      needs_admin: 1,
      status: 'pending',
    })]);
    // Nothing merged yet; the request is in the group's log.
    const [binh] = await all<{ status: string }>('SELECT status FROM participants WHERE id = ?', 'p-binh');
    expect(binh!.status).toBe('active');
    const logged = await all<{ actor_user_id: string; actor_participant_id: string; details_json: string }>(
      'SELECT actor_user_id, actor_participant_id, details_json FROM activity WHERE trip_id = ? AND action = ?', 't1', 'merge_proposed',
    );
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ actor_user_id: CHI, actor_participant_id: 't1-chi' });
    expect(JSON.parse(logged[0]!.details_json)).toMatchObject({ proposalId: body.proposals[0], participantId: 'p-binh', intoId: 'p-an' });
  });

  it('guest + signed-in user creates a proposal and leaves the caller view at two people', async () => {
    await seed();
    const body = await ok(['p:p-an', 'u:u-chi']);
    expect(body.key).toBe('p:p-an');
    expect(body.proposals).toHaveLength(1);
    expect(await proposals()).toEqual([expect.objectContaining({
      trip_id: 't1',
      guest_pid: 'p-an',
      into_pid: null,
      target_user_id: CHI,
      requested_by_user_id: OWNER,
      needs_user: 1,
      // The owner organises Đà Lạt, so the admin side is already there.
      needs_admin: 0,
    })]);

    // Still two people for the owner: no view-only link was made for the pair.
    expect(await all('SELECT * FROM person_links')).toEqual([]);
    const opts = await loadMergeOptions(db(), OWNER, 'p:p-an');
    expect(opts!.person.key).toBe('p:p-an');
    const chi = opts!.candidates.find((c) => c.key === 'u:u-chi');
    expect(chi!.plan).toEqual({ ok: false, block: { reason: 'request_pending', tripName: 'Đà Lạt' } });
  });

  it('a non-admin asking a signed-in friend needs the admin too', async () => {
    await seed();
    const body = await ok(['p:p-an', 'u:u-dao'], CHI);
    expect(body.proposals).toHaveLength(1);
    expect(await proposals()).toEqual([expect.objectContaining({
      guest_pid: 'p-an', target_user_id: DAO, requested_by_user_id: CHI, needs_user: 1, needs_admin: 1,
    })]);
  });

  it('two ledger people, one also a guest elsewhere → link', async () => {
    await seed();
    await run(
      'INSERT INTO trips (id, name, preset, currency, fewest_transfers, organiser_user_id, group_token, view_token, version, created_at) VALUES (?, ?, \'direct\', \'VND\', 1, ?, ?, ?, 0, ?)',
      't-led', 'Owen', OWNER, 'g-led', 'v-led', NOW,
    );
    await addPerson('t-led', 'led-o', 'Owen', OWNER);
    await addPerson('t-led', 'led-x', 'Xuân', null);
    await addPerson('t-led', 'led-y', 'Xuân', null);
    // Minh in Hội An is already the ledger's second Xuân for the owner.
    await run('INSERT INTO person_links (owner_user_id, participant_id, person_pid, kind, created_at) VALUES (?, ?, ?, \'import\', ?)', OWNER, 'p-minh', 'led-y', NOW);

    const body = await ok(['p:led-x', 'p:led-y']);
    expect(body).toEqual({ key: 'p:led-x', proposals: [] });
    const opts = await loadMergeOptions(db(), OWNER, 'p:led-x');
    expect(opts!.person.groups.map((g) => g.participantId).sort()).toEqual(['led-x', 'led-y', 'p-minh']);
  });

  it('re-plans: a guest merged after loading gives 409 and writes nothing', async () => {
    await seed();
    // The picker loaded while Bình was still a guest…
    const loaded = await loadMergeOptions(db(), CHI, 'p:p-an');
    expect(loaded!.candidates.find((c) => c.key === 'p:p-binh')!.plan).toMatchObject({ ok: true, tag: 'ask_admin' });
    // …then someone merged Bình away in the group.
    await run('UPDATE participants SET status = \'merged\', merged_into = ? WHERE id = ?', 'p-an', 'p-binh');
    const before = await writes();

    const res = await merge(['p:p-an', 'p:p-binh'], CHI);
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('ALREADY_HANDLED');
    expect(await writes()).toEqual(before);
  });

  it('re-plans: a claim made after loading gives 409 ALREADY_CLAIMED and writes nothing', async () => {
    await seed();
    await run(
      'INSERT INTO membership_requests (id, trip_id, participant_id, user_id, status, created_at) VALUES (?, ?, ?, ?, \'pending\', ?)',
      'r1', 't1', 'p-an', DAO, NOW,
    );
    const before = await writes();

    const res = await merge(['p:p-an', 'u:u-chi']);
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('ALREADY_CLAIMED');
    expect(await writes()).toEqual(before);
  });

  it('both signed in → 409 BOTH_SIGNED_IN', async () => {
    await seed();
    const before = await writes();
    const res = await merge(['u:u-chi', 'u:u-dao']);
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('BOTH_SIGNED_IN');
    expect(await writes()).toEqual(before);
  });

  it('rejects anything but two different keys', async () => {
    await seed();
    expect((await merge(['p:p-an'])).status).toBe(422);
    expect((await merge(['p:p-an', 'p:p-binh', 'p:p-minh'])).status).toBe(422);
    expect((await merge(['p:p-an', 'p:p-an'])).status).toBe(422);
    expect((await merge('p:p-an')).status).toBe(422);
    expect((await merge(['p:p-an', 'p:nobody'])).status).toBe(404);
  });

  it('requires sign-in', async () => {
    const res = await call('/api/me/people/merge', { method: 'POST', body: '{"keys":[]}' });
    expect(res.status).toBe(401);
  });

  it('double submit makes one proposal', async () => {
    await seed();
    const results = await Promise.all([merge(['p:p-an', 'p:p-binh'], CHI), merge(['p:p-an', 'p:p-binh'], CHI)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const loser = results.find((r) => r.status === 409)!;
    expect(await errorCode(loser)).toBe('ALREADY_CLAIMED');
    expect((await proposals()).filter((p) => p.status === 'pending')).toHaveLength(1);
  });
});
