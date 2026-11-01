import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import type { PeopleSummaryResponse, PersonSummary } from '@fsl/core';
import { call, json, memberSid, seedUser } from './helpers';

const OWNER = 'u-owner';
const OTHER = 'u-other';
const NOW = '2026-10-20T00:00:00.000Z';

async function run(query: string, ...binds: unknown[]) {
  await env.DB.prepare(query).bind(...binds).run();
}

async function addTrip(id: string, name: string, opts: { preset?: 'trip' | 'sport' | 'direct'; organiser?: string } = {}) {
  await run(
    "INSERT INTO trips (id, name, preset, currency, fewest_transfers, organiser_user_id, group_token, view_token, version, created_at) VALUES (?, ?, ?, 'VND', 1, ?, ?, ?, 0, ?)",
    id, name, opts.preset ?? 'trip', opts.organiser ?? OWNER, `g-${id}`, `v-${id}`, NOW,
  );
}

async function addPerson(tripId: string, id: string, name: string, userId: string | null, sort = 0, createdAt = NOW) {
  await run(
    "INSERT INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)",
    id, tripId, name, name.toLowerCase(), userId, sort, createdAt,
  );
}

/** The owner paid `owed` * 2, split with `debtor`: the debtor owes `owed`. */
async function owes(tripId: string, id: string, owner: string, debtor: string, owed: number) {
  await run(
    "INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, currency, spent_on, payer_id, split_mode, status, created_by_participant_id, created_at, updated_at) VALUES (?, ?, NULL, 1, ?, 'expense', 'x', ?, 'VND', '2026-10-10', ?, 'equal', 'approved', ?, ?, ?)",
    id, id, tripId, owed * 2, owner, owner, NOW, NOW,
  );
  for (const p of [owner, debtor]) {
    await run('INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES (?, ?, 1, ?)', id, p, owed);
  }
}

const sids = new Map<string, string>();
async function auth(userId = OWNER): Promise<Record<string, string>> {
  let sid = sids.get(userId);
  if (!sid) {
    sid = await memberSid(userId, userId);
    sids.set(userId, sid);
  }
  return { Cookie: `sid=${sid}`, 'Content-Type': 'application/json' };
}

async function summary(userId = OWNER): Promise<PersonSummary[]> {
  let body: PeopleSummaryResponse | null = null;
  for (let i = 0; i < 10 && (body === null || body.incomplete); i++) {
    const res = await call('/api/me/people/summary', { headers: await auth(userId) });
    expect(res.status).toBe(200);
    body = await json<PeopleSummaryResponse>(res);
  }
  expect(body!.incomplete).toBe(false);
  return body!.people;
}

function link(keys: unknown, userId = OWNER): Promise<Response> {
  return auth(userId).then((headers) => call('/api/me/people/link', { method: 'POST', headers, body: JSON.stringify({ keys }) }));
}

function unlink(participantId: string, userId = OWNER): Promise<Response> {
  return auth(userId).then((headers) => call(`/api/me/people/link/${encodeURIComponent(participantId)}`, { method: 'DELETE', headers }));
}

const byId = (a: { participantId: string }, b: { participantId: string }) => a.participantId.localeCompare(b.participantId);

/** Owner's ledger with guest Minh (owes 120000), and Badminton with guest "Minh" (owes 50000). */
async function seedMinh() {
  sids.clear();
  await seedUser(OWNER, 'Owen');
  await addTrip('t-led', 'Owen', { preset: 'direct' });
  await addPerson('t-led', 'led-o', 'Owen', OWNER, 0);
  await addPerson('t-led', 'led-minh', 'Minh', null, 1);
  await run("UPDATE participants SET request_token = 'tok-ledger-minh-0123456789abcdefghijkl' WHERE id = 'led-minh'");
  await owes('t-led', 'e-led', 'led-o', 'led-minh', 120000);
  await addTrip('t-bad', 'Badminton', { preset: 'sport' });
  await addPerson('t-bad', 'bad-o', 'Owen', OWNER, 0);
  await addPerson('t-bad', 'bad-minh', 'Minh', null, 1);
  await owes('t-bad', 'e-bad', 'bad-o', 'bad-minh', 50000);
}

describe('POST /api/me/people/link (any guest with anyone)', () => {
  it('merges a ledger guest with a group guest into one person with combined totals', async () => {
    await seedMinh();
    const res = await link(['p:led-minh', 'p:bad-minh']);
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ key: 'p:led-minh' });

    const rows = await summary();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: 'p:led-minh', total: 170000, groupLabel: null });
    expect(rows[0]!.linked).toEqual([{ participantId: 'bad-minh', tripName: 'Badminton', kind: 'group', name: 'Minh' }]);
  });

  it('merges two ledger guests', async () => {
    sids.clear();
    await seedUser(OWNER, 'Owen');
    await addTrip('t-led', 'Owen', { preset: 'direct' });
    await addPerson('t-led', 'led-o', 'Owen', OWNER, 0);
    await addPerson('t-led', 'led-a', 'Minh', null, 1);
    await addPerson('t-led', 'led-b', 'Minh N', null, 2);
    await owes('t-led', 'e-a', 'led-o', 'led-a', 100000);
    await owes('t-led', 'e-b', 'led-o', 'led-b', 20000);

    const res = await link(['p:led-a', 'p:led-b']);
    expect(res.status).toBe(200);
    const { key } = await json<{ key: string }>(res);
    expect(['p:led-a', 'p:led-b']).toContain(key);

    const rows = await summary();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key, total: 120000 });
    expect(rows[0]!.items).toHaveLength(2);
  });

  it('merges a guest into a signed-in user', async () => {
    sids.clear();
    await seedUser(OWNER, 'Owen');
    await seedUser('u-linh', 'Linh');
    await addTrip('t-a', 'Hội An');
    await addPerson('t-a', 'a-o', 'Owen', OWNER, 0);
    await addPerson('t-a', 'a-linh', 'Linh', null, 1);
    await owes('t-a', 'e-a', 'a-o', 'a-linh', 30000);
    await addTrip('t-b', 'Sapa');
    await addPerson('t-b', 'b-o', 'Owen', OWNER, 0);
    await addPerson('t-b', 'b-linh', 'Linh', 'u-linh', 1);
    await owes('t-b', 'e-b', 'b-o', 'b-linh', 40000);

    const res = await link(['p:a-linh', 'u:u-linh']);
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ key: 'u:u-linh' });

    const rows = await summary();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: 'u:u-linh', userId: 'u-linh', total: 70000 });
    expect(rows[0]!.items).toHaveLength(2);
    expect(rows[0]!.linked).toEqual([{ participantId: 'a-linh', tripName: 'Hội An', kind: 'group', name: 'Linh' }]);

    const settled = await call('/api/me/people/u%3Au-linh/settle', {
      method: 'POST', headers: await auth(), body: JSON.stringify({ paid: 70000, direction: 'toOwner' }),
    });
    expect(settled.status).toBeLessThan(300);
    const pays = await env.DB.prepare("SELECT trip_id, payer_id, amount FROM transactions WHERE type = 'payment' ORDER BY trip_id").all<{ trip_id: string; payer_id: string; amount: number }>();
    expect(pays.results).toEqual([
      { trip_id: 't-a', payer_id: 'a-linh', amount: 30000 },
      { trip_id: 't-b', payer_id: 'b-linh', amount: 40000 },
    ]);
    expect((await summary()).find((p) => p.key === 'u:u-linh')).toBeUndefined();
  });

  it('refuses two accounts', async () => {
    sids.clear();
    await seedUser(OWNER, 'Owen');
    await seedUser('u-a', 'A');
    await seedUser('u-b', 'B');
    await addTrip('t-a', 'Hội An');
    await addPerson('t-a', 'a-o', 'Owen', OWNER, 0);
    await addPerson('t-a', 'a-a', 'A', 'u-a', 1);
    await addPerson('t-a', 'a-b', 'B', 'u-b', 2);
    const res = await link(['u:u-a', 'u:u-b']);
    expect(res.status).toBe(422);
    expect(await json(res)).toMatchObject({ error: { code: 'VALIDATION', message: "Two accounts can't be merged" } });
  });

  it('refuses a guest already merged into one account together with another account', async () => {
    sids.clear();
    await seedUser(OWNER, 'Owen');
    await seedUser('u-a', 'A');
    await seedUser('u-b', 'B');
    await addTrip('t-a', 'Hội An');
    await addPerson('t-a', 'a-o', 'Owen', OWNER, 0);
    await addPerson('t-a', 'a-a', 'A', 'u-a', 1);
    await addPerson('t-a', 'a-b', 'B', 'u-b', 2);
    await addPerson('t-a', 'a-g', 'Guest', null, 3);
    expect((await link(['p:a-g', 'u:u-a'])).status).toBe(200);
    expect((await link(['p:a-g', 'u:u-b'])).status).toBe(422);
  });

  it('repoints links that pointed at the merged ledger guest', async () => {
    sids.clear();
    await seedUser(OWNER, 'Owen');
    await addTrip('t-led', 'Owen', { preset: 'direct' });
    await addPerson('t-led', 'led-o', 'Owen', OWNER, 0);
    await addPerson('t-led', 'led-b', 'Minh N', null, 1, '2026-10-01T00:00:00.000Z');
    await addPerson('t-led', 'led-a', 'Minh', null, 2, '2026-10-05T00:00:00.000Z');
    await owes('t-led', 'e-a', 'led-o', 'led-a', 1000);
    await owes('t-led', 'e-b', 'led-o', 'led-b', 2000);
    await addTrip('t-g', 'Badminton', { preset: 'sport' });
    await addPerson('t-g', 'g-o', 'Owen', OWNER, 0);
    await addPerson('t-g', 'g-minh', 'Minh', null, 1);
    await owes('t-g', 'e-g', 'g-o', 'g-minh', 4000);

    expect(await json(await link(['p:g-minh', 'p:led-a']))).toEqual({ key: 'p:led-a' });
    expect(await json(await link(['p:led-a', 'p:led-b']))).toEqual({ key: 'p:led-b' });

    const g = await env.DB.prepare("SELECT person_pid FROM person_links WHERE participant_id = 'g-minh'").first<{ person_pid: string }>();
    expect(g!.person_pid).toBe('led-b');

    const rows = await summary();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: 'p:led-b', total: 7000 });
    expect([...rows[0]!.linked].sort(byId)).toEqual([
      { participantId: 'g-minh', tripName: 'Badminton', kind: 'group', name: 'Minh' },
      { participantId: 'led-a', tripName: 'Owen', kind: 'direct', name: 'Minh' },
    ]);
  });

  it('moves nicknames onto the survivor key', async () => {
    await seedMinh();
    await run("INSERT INTO nicknames (owner_user_id, person_key, nickname, updated_at) VALUES (?, 'p:bad-minh', 'Minh cầu lông', ?)", OWNER, NOW);
    await link(['p:led-minh', 'p:bad-minh']);
    const nicks = await env.DB.prepare('SELECT person_key, nickname FROM nicknames WHERE owner_user_id = ?').bind(OWNER).all();
    expect(nicks.results).toEqual([{ person_key: 'p:led-minh', nickname: 'Minh cầu lông' }]);
  });
});

describe('request links after a merge', () => {
  async function getRequest(token: string): Promise<Response> {
    let res = await call(`/api/r/${token}`);
    for (let i = 0; i < 5 && res.status === 409; i++) res = await call(`/api/r/${token}`);
    return res;
  }

  it("a merged-away guest's old link shows the kept person's waiting \"I've paid\" and refuses a second one", async () => {
    sids.clear();
    await seedUser(OWNER, 'Owen');
    await addTrip('t-led', 'Owen', { preset: 'direct' });
    await addPerson('t-led', 'led-o', 'Owen', OWNER, 0);
    await addPerson('t-led', 'led-b', 'Minh N', null, 1, '2026-10-01T00:00:00.000Z');
    await addPerson('t-led', 'led-a', 'Minh', null, 2, '2026-10-05T00:00:00.000Z');
    await owes('t-led', 'e-a', 'led-o', 'led-a', 1000);
    await owes('t-led', 'e-b', 'led-o', 'led-b', 2000);
    const tokenA = 'tok-a-0123456789abcdefghijklmnopqrstuv';
    const tokenB = 'tok-b-0123456789abcdefghijklmnopqrstuv';
    await run("UPDATE participants SET request_token = ? WHERE id = 'led-a'", tokenA);
    await run("UPDATE participants SET request_token = ? WHERE id = 'led-b'", tokenB);

    expect(await json(await link(['p:led-a', 'p:led-b']))).toEqual({ key: 'p:led-b' });
    const before = await getRequest(tokenA);
    expect(await json(before)).toMatchObject({ total: 3000, settlementWaiting: false });

    // B records "I've paid" for the combined 3000 through B's own link.
    const paid = await call(`/api/r/${tokenB}/paid`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: 3000 }) });
    expect(paid.status).toBe(201);

    const res = await getRequest(tokenA);
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ settlementWaiting: true, settled: false });

    const again = await call(`/api/r/${tokenA}/paid`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: 3000 }) });
    expect(again.status).toBe(409);
    expect(await json(again)).toMatchObject({ error: { code: 'ALREADY_WAITING' } });
  });
});

describe('DELETE /api/me/people/link/:participantId', () => {
  it('unmerge splits one entry off', async () => {
    await seedMinh();
    expect((await link(['p:led-minh', 'p:bad-minh'])).status).toBe(200);
    expect(await summary()).toHaveLength(1);

    const res = await unlink('bad-minh');
    expect(res.status).toBe(204);

    const rows = await summary();
    expect(rows.map((r) => [r.key, r.total, r.groupLabel])).toEqual([
      ['p:led-minh', 120000, null],
      ['p:bad-minh', 50000, 'Badminton'],
    ]);
    expect(rows.every((r) => r.linked.length === 0)).toBe(true);
    const tok = await env.DB.prepare("SELECT request_token FROM participants WHERE id = 'led-minh'").first<{ request_token: string }>();
    expect(tok!.request_token).toBe('tok-ledger-minh-0123456789abcdefghijkl');

    const act = await env.DB.prepare("SELECT action FROM activity WHERE trip_id = 't-led' ORDER BY created_at DESC LIMIT 1").first<{ action: string }>();
    expect(act!.action).toBe('person_unlinked');
  });

  it("unmerge of someone else's or a missing link is 404", async () => {
    await seedMinh();
    await link(['p:led-minh', 'p:bad-minh']);
    await seedUser(OTHER, 'Other');
    expect((await unlink('bad-minh', OTHER)).status).toBe(404);
    expect((await unlink('nobody')).status).toBe(404);
    const left = await env.DB.prepare('SELECT COUNT(*) AS n FROM person_links').first<{ n: number }>();
    expect(left!.n).toBe(1);
  });

  it('requires sign-in', async () => {
    expect((await call('/api/me/people/link/x', { method: 'DELETE' })).status).toBe(401);
  });
});

describe("a person's own source link is not a merge", () => {
  /** Badminton guest Minh only (owes 50000), and Cầu lông guest Minh (owes 7000). No ledger row yet. */
  async function seedGroupMinh() {
    sids.clear();
    await seedUser(OWNER, 'Owen');
    await addTrip('t-bad', 'Badminton', { preset: 'sport' });
    await addPerson('t-bad', 'bad-o', 'Owen', OWNER, 0);
    await addPerson('t-bad', 'bad-minh', 'Minh', null, 1);
    await owes('t-bad', 'e-bad', 'bad-o', 'bad-minh', 50000);
    await addTrip('t-cl', 'Cầu lông', { preset: 'sport' });
    await addPerson('t-cl', 'cl-o', 'Owen', OWNER, 0);
    await addPerson('t-cl', 'cl-minh', 'Minh', null, 1);
    await owes('t-cl', 'e-cl', 'cl-o', 'cl-minh', 7000);
  }

  async function requestLink(key: string) {
    const res = await call(`/api/me/people/${encodeURIComponent(key)}/request-link`, { method: 'POST', headers: await auth() });
    expect(res.status).toBe(200);
    const row = await env.DB.prepare("SELECT person_pid FROM person_links WHERE participant_id = 'bad-minh'").first<{ person_pid: string }>();
    return row!.person_pid;
  }

  it('a group guest sent a request link has linked: []', async () => {
    await seedGroupMinh();
    const ledgerPid = await requestLink('p:bad-minh');
    const minh = (await summary()).find((p) => p.key === `p:${ledgerPid}`);
    expect(minh).toMatchObject({ total: 50000, linked: [] });
  });

  it('a genuine merge after a request link lists only the merged guest', async () => {
    await seedGroupMinh();
    const ledgerPid = await requestLink('p:bad-minh');
    expect(await json(await link([`p:${ledgerPid}`, 'p:cl-minh']))).toEqual({ key: `p:${ledgerPid}` });
    const rows = await summary();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: `p:${ledgerPid}`, total: 57000 });
    expect(rows[0]!.linked).toEqual([{ participantId: 'cl-minh', tripName: 'Cầu lông', kind: 'group', name: 'Minh' }]);
    expect((await unlink('cl-minh')).status).toBe(204);
  });

  it('unmerge of the link a request link made is 422 and changes nothing', async () => {
    await seedGroupMinh();
    const ledgerPid = await requestLink('p:bad-minh');
    const res = await unlink('bad-minh');
    expect(res.status).toBe(422);
    expect(await json(res)).toMatchObject({ error: { code: 'VALIDATION', message: 'Not a merge' } });
    const row = await env.DB.prepare("SELECT person_pid, kind FROM person_links WHERE participant_id = 'bad-minh'").first();
    expect(row).toEqual({ person_pid: ledgerPid, kind: 'import' });
  });

  it('a settlement that imports a group guest makes an import link too', async () => {
    await seedGroupMinh();
    const settled = await call('/api/me/people/p%3Abad-minh/settle', {
      method: 'POST', headers: await auth(), body: JSON.stringify({ paid: 60000, direction: 'toOwner' }),
    });
    expect(settled.status).toBeLessThan(300);
    const row = await env.DB.prepare("SELECT kind FROM person_links WHERE participant_id = 'bad-minh'").first<{ kind: string }>();
    expect(row?.kind).toBe('import');
    expect((await unlink('bad-minh')).status).toBe(422);
  });
});

describe('POST /api/me/people/link in someone else ledger', () => {
  it("refuses a contact from someone else's ledger (403)", async () => {
    sids.clear();
    await seedUser(OWNER, 'Owen');
    await seedUser(OTHER, 'Olga');
    await addTrip('t-led', 'Owen', { preset: 'direct' });
    await addPerson('t-led', 'led-o', 'Owen', OWNER, 0);
    await addPerson('t-led', 'led-minh', 'Minh', null, 1);
    // Olga's ledger, where Owen was imported: Olga's other contacts are not Owen's.
    await addTrip('t-olga', 'Olga', { preset: 'direct', organiser: OTHER });
    await addPerson('t-olga', 'olga-o', 'Olga', OTHER, 0);
    await addPerson('t-olga', 'olga-owen', 'Owen', OWNER, 1);
    await addPerson('t-olga', 'olga-minh', 'Minh', null, 2);
    const res = await link(['p:led-minh', 'p:olga-minh']);
    expect(res.status).toBe(403);
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM person_links').first<{ n: number }>();
    expect(n!.n).toBe(0);
  });
});
