import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { drizzle } from 'drizzle-orm/d1';
import type { MergeCandidate, MergeOptionsResponse } from '@cc/core';
import * as schema from '@cc/api-db/schema';
import { loadMergeOptions } from '../src/me/mergeOptions';
import { call, json, memberSid, seedUser } from './helpers';

const OWNER = 'u-owner';
const CHI = 'u-chi';
const DAO = 'u-dao';
const NOW = '2026-10-20T00:00:00.000Z';

async function run(query: string, ...binds: unknown[]) {
  await env.DB.prepare(query).bind(...binds).run();
}

async function addTrip(id: string, name: string, opts: { preset?: 'trip' | 'direct'; organiser?: string; archived?: boolean } = {}) {
  await run(
    'INSERT INTO trips (id, name, preset, currency, fewest_transfers, organiser_user_id, group_token, view_token, version, created_at, archived_at) VALUES (?, ?, ?, \'VND\', 1, ?, ?, ?, 0, ?, ?)',
    id, name, opts.preset ?? 'trip', opts.organiser ?? OWNER, `g-${id}`, `v-${id}`, NOW, opts.archived ? NOW : null,
  );
}

async function addPerson(tripId: string, id: string, name: string, userId: string | null, opts: { admin?: boolean; status?: string } = {}) {
  await run(
    'INSERT INTO participants (id, trip_id, name, normalized_name, user_id, is_admin, status, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)',
    id, tripId, name, name.toLowerCase(), userId, opts.admin ? 1 : 0, opts.status ?? 'active', NOW,
  );
}

/**
 * T1 "Đà Lạt" (owner organises): owner, guests An, Bình, "Minh N", member Chi.
 * T2 "Hội An": owner, guest Minh. Owner's ledger: Đào (an account sharing no group with the owner).
 */
async function seed() {
  await seedUser(OWNER, 'Owen');
  await seedUser(CHI, 'Chi');
  await seedUser(DAO, 'Đào');
  await addTrip('t1', 'Đà Lạt');
  await addPerson('t1', 't1-o', 'Owen', OWNER);
  await addPerson('t1', 'p-an', 'An', null);
  await addPerson('t1', 'p-binh', 'Bình', null);
  await addPerson('t1', 'p-minhn', 'Minh N', null);
  await addPerson('t1', 't1-chi', 'Chi', CHI);
  await addTrip('t2', 'Hội An');
  await addPerson('t2', 't2-o', 'Owen', OWNER);
  await addPerson('t2', 'p-minh', 'Minh', null);
  await addTrip('t-led', 'Owen', { preset: 'direct' });
  await addPerson('t-led', 'led-o', 'Owen', OWNER);
  await addPerson('t-led', 'led-dao', 'Đào', DAO);
}

async function options(key: string, userId = OWNER): Promise<Response> {
  const sid = await memberSid(userId);
  return call(`/api/me/people/${encodeURIComponent(key)}/merge-options`, { headers: { Cookie: `sid=${sid}` } });
}

async function ok(key: string, userId = OWNER): Promise<MergeOptionsResponse> {
  const res = await options(key, userId);
  expect(res.status).toBe(200);
  return json<MergeOptionsResponse>(res);
}

const find = (body: MergeOptionsResponse, key: string): MergeCandidate => {
  const c = body.candidates.find((x) => x.key === key);
  expect(c, key).toBeDefined();
  return c!;
};

/** A drizzle client over env.DB that counts the statements it prepares. */
function countingDb() {
  const counter = { queries: 0 };
  const proxied = new Proxy(env.DB, {
    get(target, prop) {
      if (prop === 'prepare') {
        return (q: string) => {
          counter.queries += 1;
          return target.prepare(q);
        };
      }
      const value = Reflect.get(target, prop) as unknown;
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  });
  return { db: drizzle(proxied, { schema }), counter };
}

describe('GET /api/me/people/:key/merge-options', () => {
  it('lists everyone else with plans, similar names first', async () => {
    await seed();

    const an = await ok('p:p-an');
    expect(an.person.key).toBe('p:p-an');
    expect(an.candidates.map((c) => c.key)).toEqual(['p:p-binh', 'u:u-chi', 'u:u-dao', 'p:p-minh', 'p:p-minhn']);
    expect(an.candidates.every((c) => !c.similar)).toBe(true);
    // Same group, the owner organises it: a real merge of Bình into An.
    expect(find(an, 'p:p-binh').plan).toEqual({
      ok: true,
      tag: 'merge',
      steps: [{ kind: 'merge', tripId: 't1', tripName: 'Đà Lạt', fromPid: 'p-binh', intoPid: 'p-an' }],
    });
    expect(find(an, 'p:p-minh').plan).toEqual({ ok: true, tag: 'link', steps: [{ kind: 'link' }] });
    expect(find(an, 'p:p-minh').groups).toEqual([{ tripId: 't2', tripName: 'Hội An', kind: 'group' }]);

    const minh = await ok('p:p-minh');
    expect(minh.candidates[0]).toMatchObject({ key: 'p:p-minhn', name: 'Minh N', similar: true });
    expect(minh.candidates.slice(1).every((c) => !c.similar)).toBe(true);
    expect(minh.candidates.slice(1).map((c) => c.key)).toEqual(['p:p-an', 'p:p-binh', 'u:u-chi', 'u:u-dao']);
    expect(find(minh, 'p:p-minhn').plan).toEqual({ ok: true, tag: 'link', steps: [{ kind: 'link' }] });
  });

  it('shows Gmail only for users sharing a group', async () => {
    await seed();
    await run('UPDATE users SET avatar_url = ? WHERE id = ?', 'https://x/chi.png', CHI);
    const body = await ok('p:p-an');

    const chi = find(body, 'u:u-chi');
    expect(chi.signIn).toEqual({ provider: 'google', label: 'u-chi@example.com' });
    expect(chi.avatarUrl).toBe('https://x/chi.png');
    expect(chi.plan).toEqual({
      ok: true,
      tag: 'ask_user',
      steps: [{ kind: 'ask_user', tripId: 't1', tripName: 'Đà Lạt', tripKind: 'group', guestPid: 'p-an', userId: CHI, needsAdmin: false }],
    });

    // Reachable only through the owner's ledger: no shared group, so no address.
    const dao = find(body, 'u:u-dao');
    expect(dao.signIn).toBeNull();
    expect(dao.groups).toEqual([{ tripId: 't-led', tripName: 'Owen', kind: 'direct' }]);
  });

  it('labels a Zalo login with its Zalo name, or "Zalo"', async () => {
    await seed();
    await run('UPDATE users SET google_sub = NULL, zalo_sub = ?, zalo_name = ? WHERE id = ?', 'z-chi', 'Chi Zalo', CHI);
    expect(find(await ok('p:p-an'), 'u:u-chi').signIn).toEqual({ provider: 'zalo', label: 'Chi Zalo' });
    await run('UPDATE users SET zalo_name = NULL WHERE id = ?', CHI);
    expect(find(await ok('p:p-an'), 'u:u-chi').signIn).toEqual({ provider: 'zalo', label: 'Zalo' });
  });

  it('person.groups marks canRename for an admin only', async () => {
    await seed();
    const owner = await ok('p:p-an');
    expect(owner.person.groups).toEqual([
      { tripId: 't1', tripName: 'Đà Lạt', kind: 'group', participantId: 'p-an', name: 'An', canRename: true },
    ]);

    // Chi is a plain member of Đà Lạt: no rename, and same-group picks ask the admin.
    const chi = await ok('p:p-an', CHI);
    expect(chi.person.groups).toEqual([
      { tripId: 't1', tripName: 'Đà Lạt', kind: 'group', participantId: 'p-an', name: 'An', canRename: false },
    ]);
    expect(find(chi, 'p:p-binh').plan).toMatchObject({ ok: true, tag: 'ask_admin' });
    // Chi shares no group with Đào, and Hội An is not Chi's.
    expect(chi.candidates.map((c) => c.key)).toEqual(['p:p-binh', 'p:p-minhn', 'u:u-owner']);

    // An admin of an archived group can't rename there.
    await run('UPDATE trips SET archived_at = ? WHERE id = ?', NOW, 't1');
    expect((await ok('p:p-an')).person.groups[0]!.canRename).toBe(false);
  });

  it('a participant admin counts as admin; a signed-in person has no renamable groups', async () => {
    await seed();
    await run('UPDATE participants SET is_admin = 1 WHERE id = ?', 't1-chi');
    expect((await ok('p:p-an', CHI)).person.groups[0]!.canRename).toBe(true);
    expect((await ok('u:u-chi')).person.groups).toEqual([
      { tripId: 't1', tripName: 'Đà Lạt', kind: 'group', participantId: 't1-chi', name: 'Chi', canRename: false },
    ]);
  });

  it('pending claims and proposals block the plan', async () => {
    await seed();
    await run("INSERT INTO membership_requests (id, trip_id, participant_id, user_id, status, created_at) VALUES ('mr-1', 't1', 'p-an', ?, 'pending', ?)", CHI, NOW);
    await run(
      "INSERT INTO merge_proposals (id, trip_id, guest_pid, into_pid, target_user_id, requested_by_user_id, needs_user, needs_admin, status, created_at) VALUES ('mp-1', 't1', 'p-minhn', NULL, ?, ?, 1, 0, 'pending', ?)",
      CHI, OWNER, NOW,
    );
    const an = await ok('p:p-an');
    expect(find(an, 'u:u-chi').plan).toEqual({ ok: false, block: { reason: 'claim_pending', tripName: 'Đà Lạt', byTarget: true } });
    expect(find(an, 'p:p-binh').plan).toEqual({ ok: false, block: { reason: 'request_pending', tripName: 'Đà Lạt' } });
    const minhn = await ok('p:p-minhn');
    expect(find(minhn, 'u:u-chi').plan).toEqual({ ok: false, block: { reason: 'request_pending', tripName: 'Đà Lạt' } });
  });

  it('a guest linked into a ledger person answers under that person', async () => {
    await seed();
    await addPerson('t-led', 'led-an', 'An', null);
    await run("INSERT INTO person_links (owner_user_id, participant_id, person_pid, kind, created_at) VALUES (?, 'p-an', 'led-an', 'import', ?)", OWNER, NOW);
    const body = await ok('p:p-an');
    expect(body.person.key).toBe('p:led-an');
    expect(body.person.groups.map((g) => g.participantId).sort()).toEqual(['led-an', 'p-an']);
    expect(body.candidates.some((c) => c.key === 'p:led-an' || c.key === 'p:p-an')).toBe(false);
  });

  it('merged participants are left out; unknown, own and foreign keys are 404', async () => {
    await seed();
    await run("UPDATE participants SET status = 'merged', merged_into = 'p-an' WHERE id = 'p-binh'");
    expect((await ok('p:p-an')).candidates.some((c) => c.key === 'p:p-binh')).toBe(false);
    expect((await options('p:p-binh')).status).toBe(404);
    expect((await options('p:nobody')).status).toBe(404);
    expect((await options(`u:${OWNER}`)).status).toBe(404);
    expect((await options('x')).status).toBe(404);
    // Hội An is not Chi's group.
    expect((await options('p:p-minh', CHI)).status).toBe(404);
  });

  it('someone else\'s ledger shows only its owner', async () => {
    await seed();
    await addTrip('t-chi-led', 'Chi', { preset: 'direct', organiser: CHI });
    await addPerson('t-chi-led', 'cl-chi', 'Chi', CHI);
    await addPerson('t-chi-led', 'cl-o', 'Owen', OWNER);
    await addPerson('t-chi-led', 'cl-x', 'Xuân', null);
    const body = await ok('p:p-an');
    expect(body.candidates.some((c) => c.key === 'p:cl-x')).toBe(false);
    expect(find(body, 'u:u-chi').groups).toEqual([
      { tripId: 't-chi-led', tripName: 'Chi', kind: 'direct' },
      { tripId: 't1', tripName: 'Đà Lạt', kind: 'group' },
    ]);
    expect((await options('p:cl-x')).status).toBe(404);
  });

  it('needs a session', async () => {
    const res = await call('/api/me/people/p:p-an/merge-options');
    expect(res.status).toBe(401);
  });

  it('uses at most 6 statements, however many people', async () => {
    await seed();
    for (let i = 0; i < 25; i++) await addPerson('t1', `p-x${i}`, `Guest ${i}`, null);
    const { db, counter } = countingDb();
    const body = await loadMergeOptions(db, OWNER, 'p:p-an');
    expect(body?.candidates.length).toBe(30);
    expect(counter.queries).toBeLessThanOrEqual(6);
  });
});
