import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import type { PeopleSummaryResponse, PersonSummary } from '@fsl/core';
import { call, json, memberSid, seedUser, U } from './helpers';

const OWNER = 'u-owner';
const OTHER = 'u-other';
const NOW = '2026-10-20T00:00:00.000Z';

async function run(query: string, ...binds: unknown[]) {
  await env.DB.prepare(query).bind(...binds).run();
}

async function addTrip(id: string, name: string, organiser = OWNER, preset: 'trip' | 'direct' = 'trip') {
  await run(
    "INSERT INTO trips (id, name, preset, currency, fewest_transfers, organiser_user_id, group_token, view_token, version, created_at) VALUES (?, ?, ?, 'VND', 1, ?, ?, ?, 0, ?)",
    id, name, preset, organiser, `g-${id}`, `v-${id}`, NOW,
  );
}

async function addPerson(tripId: string, id: string, name: string, userId: string | null, sort = 0) {
  await run(
    "INSERT INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)",
    id, tripId, name, name.toLowerCase(), userId, sort, NOW,
  );
}

async function addExpense(tripId: string, id: string, payer: string, amount: number, between: string[]) {
  await run(
    "INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, currency, spent_on, payer_id, split_mode, status, created_by_participant_id, created_at, updated_at) VALUES (?, ?, NULL, 1, ?, 'expense', 'x', ?, 'VND', '2026-10-10', ?, 'equal', 'approved', ?, ?, ?)",
    id, id, tripId, amount, payer, payer, NOW, NOW,
  );
  for (const p of between) {
    await run('INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES (?, ?, 1, ?)', id, p, amount / between.length);
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
  const res = await call('/api/me/people/summary', { headers: await auth(userId) });
  expect(res.status).toBe(200);
  return (await json<PeopleSummaryResponse>(res)).people;
}

function setNickname(key: string, nickname: unknown, userId = OWNER): Promise<Response> {
  return auth(userId).then((headers) =>
    call(`/api/me/people/${encodeURIComponent(key)}/nickname`, { method: 'PUT', headers, body: JSON.stringify({ nickname }) }));
}

function link(keys: unknown, userId = OWNER): Promise<Response> {
  return auth(userId).then((headers) => call('/api/me/people/link', { method: 'POST', headers, body: JSON.stringify({ keys }) }));
}

/** Lan, a guest in two of the owner's groups: owes 100 in Hội An and 50 in Đà Lạt. Minh (account) owes 30. */
async function seed() {
  sids.clear();
  await seedUser(OWNER, 'Nhan');
  await seedUser(U.minh, 'Minh');
  await addTrip('t-a', 'Hội An');
  await addPerson('t-a', 'a-o', 'Nhan', OWNER, 0);
  await addPerson('t-a', 'a-lan', 'Lan', null, 1);
  await addPerson('t-a', 'a-m', 'Minh', U.minh, 2);
  await addExpense('t-a', 'e-a', 'a-o', 200, ['a-o', 'a-lan']);
  await addExpense('t-a', 'e-am', 'a-o', 60, ['a-o', 'a-m']);
  await addTrip('t-b', 'Đà Lạt');
  await addPerson('t-b', 'b-o', 'Nhan', OWNER, 0);
  await addPerson('t-b', 'b-lan', 'Lan N.', null, 1);
  await addExpense('t-b', 'e-b', 'b-o', 100, ['b-o', 'b-lan']);
}

describe('PUT /api/me/people/:key/nickname', () => {
  it('sets and clears a nickname, shown in the summary', async () => {
    await seed();
    const res = await setNickname('p:a-lan', '  Lan hàng xóm  ');
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ key: 'p:a-lan', nickname: 'Lan hàng xóm' });
    expect((await summary()).find((p) => p.key === 'p:a-lan')?.nickname).toBe('Lan hàng xóm');

    expect((await setNickname('u:u-minh', 'Minh béo')).status).toBe(200);
    expect((await summary()).find((p) => p.key === 'u:u-minh')?.nickname).toBe('Minh béo');

    expect((await setNickname('p:a-lan', 'Lan 2')).status).toBe(200);
    expect((await summary()).find((p) => p.key === 'p:a-lan')?.nickname).toBe('Lan 2');

    const cleared = await setNickname('p:a-lan', null);
    expect(cleared.status).toBe(200);
    expect(await json(cleared)).toEqual({ key: 'p:a-lan', nickname: null });
    expect((await summary()).find((p) => p.key === 'p:a-lan')?.nickname).toBeNull();
  });

  it('is visible only to its owner', async () => {
    await seed();
    await seedUser(OTHER, 'Other');
    await addPerson('t-a', 'a-x', 'Other', OTHER, 3);
    await addExpense('t-a', 'e-ax', 'a-x', 40, ['a-x', 'a-m']);
    expect((await setNickname('u:u-minh', 'Minh béo')).status).toBe(200);
    expect((await summary()).find((p) => p.key === 'u:u-minh')?.nickname).toBe('Minh béo');
    const theirs = (await summary(OTHER)).find((p) => p.key === 'u:u-minh');
    expect(theirs).toBeDefined();
    expect(theirs!.nickname).toBeNull();
  });

  it('validates the nickname and the key', async () => {
    await seed();
    expect((await setNickname('p:a-lan', '   ')).status).toBe(422);
    expect((await setNickname('p:a-lan', 'x'.repeat(41))).status).toBe(422);
    expect((await setNickname('p:a-lan', 5)).status).toBe(422);
    expect((await setNickname('p:nobody', 'Nobody')).status).toBe(404);
    expect((await setNickname(`u:${OWNER}`, 'Me')).status).toBe(404);
    expect((await call('/api/me/people/p%3Aa-lan/nickname', { method: 'PUT', body: '{"nickname":"x"}' })).status).toBe(401);
  });

  it('a linked guest stores the nickname under the merged key', async () => {
    await seed();
    const merged = (await json<{ key: string }>(await link(['p:a-lan', 'p:b-lan']))).key;
    const res = await setNickname('p:b-lan', 'Lan');
    expect(await json(res)).toEqual({ key: merged, nickname: 'Lan' });
    expect((await summary()).find((p) => p.key === merged)?.nickname).toBe('Lan');
  });
});

describe('POST /api/me/people/link', () => {
  it('links two group guests into one row with the combined total', async () => {
    await seed();
    const before = await summary();
    expect(before.filter((p) => p.name.startsWith('Lan'))).toHaveLength(2);

    const res = await link(['p:a-lan', 'p:b-lan']);
    expect(res.status).toBe(200);
    const { key } = await json<{ key: string }>(res);
    expect(key).toMatch(/^p:/);
    expect(['p:a-lan', 'p:b-lan']).not.toContain(key);

    const after = await summary();
    const lans = after.filter((p) => p.name.startsWith('Lan'));
    expect(lans).toHaveLength(1);
    expect(lans[0]).toMatchObject({ key, total: 150, groupLabel: null });
    expect(lans[0]!.items).toHaveLength(2);
  });

  it('is idempotent and reuses an existing ledger person', async () => {
    await seed();
    const first = (await json<{ key: string }>(await link(['p:a-lan', 'p:b-lan']))).key;
    const again = await link(['p:b-lan', first]);
    expect(again.status).toBe(200);
    expect((await json<{ key: string }>(again)).key).toBe(first);
  });

  it('moves a nickname to the merged key, keeping the target\'s', async () => {
    await seed();
    await setNickname('p:b-lan', 'Lan Đà Lạt');
    const { key } = await json<{ key: string }>(await link(['p:a-lan', 'p:b-lan']));
    expect((await summary()).find((p) => p.key === key)?.nickname).toBe('Lan Đà Lạt');
    const rows = await env.DB.prepare('SELECT person_key FROM nicknames WHERE owner_user_id = ?').bind(OWNER).all<{ person_key: string }>();
    expect(rows.results.map((r) => r.person_key)).toEqual([key]);
  });

  it('refuses account keys and bad bodies (422)', async () => {
    await seed();
    expect((await link(['p:a-lan', 'u:u-minh'])).status).toBe(422);
    expect((await link(['p:a-lan'])).status).toBe(422);
    expect((await link(['p:a-lan', 'p:a-lan'])).status).toBe(422);
    expect((await link('p:a-lan')).status).toBe(422);
    expect((await link(['p:a-lan', 'p:a-m'])).status).toBe(422);
  });

  it('refuses two different ledger people (422)', async () => {
    await seed();
    const ledgerLan = (await json<{ participantId: string }>(await call('/api/me/ledger/people', {
      method: 'POST', headers: await auth(), body: JSON.stringify({ participantId: 'a-lan' }),
    }))).participantId;
    const ledgerLan2 = (await json<{ participantId: string }>(await call('/api/me/ledger/people', {
      method: 'POST', headers: await auth(), body: JSON.stringify({ participantId: 'b-lan' }),
    }))).participantId;
    expect(ledgerLan).not.toBe(ledgerLan2);
    expect((await link([`p:${ledgerLan}`, `p:${ledgerLan2}`])).status).toBe(422);
    expect((await link(['p:a-lan', 'p:b-lan'])).status).toBe(422);
  });

  it('refuses guests from trips the caller is not in (403)', async () => {
    await seed();
    await seedUser(OTHER, 'Other');
    await addTrip('t-x', 'Elsewhere', OTHER);
    await addPerson('t-x', 'x-o', 'Other', OTHER, 0);
    await addPerson('t-x', 'x-lan', 'Lan', null, 1);
    expect((await link(['p:a-lan', 'p:x-lan'])).status).toBe(403);
    expect((await link(['p:a-lan', 'p:nobody'])).status).toBe(403);
    const left = await env.DB.prepare('SELECT COUNT(*) AS n FROM person_links').first<{ n: number }>();
    expect(left!.n).toBe(0);
  });

  it('requires sign-in', async () => {
    expect((await call('/api/me/people/link', { method: 'POST', body: '{"keys":[]}' })).status).toBe(401);
  });
});
