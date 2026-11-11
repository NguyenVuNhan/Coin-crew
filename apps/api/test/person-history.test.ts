import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import type { PersonHistoryView } from '@cc/core';
import { call, json, memberSid, seedUser, U } from './helpers';

const OWNER = 'u-owner';
const NOW = '2026-10-20T00:00:00.000Z';

async function run(query: string, ...binds: unknown[]) {
  await env.DB.prepare(query).bind(...binds).run();
}

async function addTrip(id: string, name: string, opts: { preset?: 'trip' | 'sport' | 'direct'; organiser?: string } = {}) {
  await run(
    'INSERT INTO trips (id, name, preset, currency, fewest_transfers, organiser_user_id, group_token, view_token, version, created_at) VALUES (?, ?, ?, \'VND\', 1, ?, ?, ?, 0, ?)',
    id, name, opts.preset ?? 'trip', opts.organiser ?? OWNER, `g-${id}`, `v-${id}`, NOW,
  );
}

async function addPerson(tripId: string, id: string, name: string, userId: string | null, sort = 0) {
  await run(
    "INSERT INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)",
    id, tripId, name, name.toLowerCase(), userId, sort, NOW,
  );
}

/** An approved expense of `amount` paid by `payer`, split equally between `between`. */
async function addExpense(tripId: string, id: string, payer: string, amount: number, between: string[], createdAt = NOW) {
  await run(
    "INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, currency, spent_on, payer_id, split_mode, status, created_by_participant_id, created_at, updated_at) VALUES (?, ?, NULL, 1, ?, 'expense', ?, ?, 'VND', '2026-10-10', ?, 'equal', 'approved', ?, ?, ?)",
    id, id, tripId, `desc ${id}`, amount, payer, payer, createdAt, createdAt,
  );
  for (const p of between) {
    await run('INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES (?, ?, 1, ?)', id, p, amount / between.length);
  }
}

async function get(path: string, userId = OWNER): Promise<Response> {
  const sid = await memberSid(userId, userId === OWNER ? 'Owen' : userId);
  return call(path, { headers: { Cookie: `sid=${sid}` } });
}

async function view(path: string): Promise<PersonHistoryView> {
  const res = await get(path);
  expect(res.status).toBe(200);
  return json<PersonHistoryView>(res);
}

describe('GET /api/me/people/:key/history', () => {
  it('all mode: ledger with two quick expenses and a group → direct place has history lines, group place history null, total = sum of amounts', async () => {
    await seedUser(OWNER, 'Owen');
    await seedUser(U.minh, 'Minh');
    await addTrip('t-din', 'Dinner');
    await addPerson('t-din', 'din-o', 'Owen', OWNER, 0);
    await addPerson('t-din', 'din-m', 'Minh', U.minh, 1);
    await addExpense('t-din', 'e-din', 'din-m', 100, ['din-o', 'din-m'], '2026-10-03T00:00:00.000Z');

    await addTrip('t-led', 'Owen', { preset: 'direct' });
    await addPerson('t-led', 'led-o', 'Owen', OWNER, 0);
    await addPerson('t-led', 'led-m', 'Minh', U.minh, 1);
    await addExpense('t-led', 'e-led1', 'led-o', 240, ['led-o', 'led-m'], '2026-10-07T00:00:00.000Z');
    await addExpense('t-led', 'e-led2', 'led-o', 60, ['led-o', 'led-m'], '2026-10-08T00:00:00.000Z');

    const body = await view('/api/me/people/u:u-minh/history');
    expect(body).toMatchObject({ key: 'u:u-minh', name: 'Minh', mode: 'all' });
    expect(body.places).toHaveLength(2);
    const group = body.places.find((p) => p.tripId === 't-din')!;
    const direct = body.places.find((p) => p.tripId === 't-led')!;
    expect(group).toMatchObject({ kind: 'group', source: 'group', amount: -50, history: null, tripName: 'Dinner' });
    expect(direct).toMatchObject({ kind: 'direct', source: 'own', amount: 150 });
    expect(direct.history!.lines.map((l) => [l.id, l.effect])).toEqual([['e-led2', 30], ['e-led1', 120]]);
    expect(direct.history!.twoWay).toBe(150);
    expect(body.total).toBe(100);
    expect(body.total).toBe(body.places.reduce((s, p) => s + p.amount, 0));
  });

  it("all mode: merged ledger guest → two direct places, sources 'own' and 'merged', lines from both", async () => {
    await seedUser(OWNER, 'Owen');
    await addTrip('t-led', 'Owen', { preset: 'direct' });
    await addPerson('t-led', 'led-o', 'Owen', OWNER, 0);
    await addPerson('t-led', 'led-m', 'Minh', null, 1);
    await addPerson('t-led', 'led-m2', 'Minh cũ', null, 2);
    await run("INSERT INTO person_links (owner_user_id, participant_id, person_pid, kind, created_at) VALUES (?, 'led-m2', 'led-m', 'merge', ?)", OWNER, NOW);
    await addExpense('t-led', 'e-1', 'led-o', 200, ['led-o', 'led-m'], '2026-10-05T00:00:00.000Z');
    await addExpense('t-led', 'e-2', 'led-o', 300, ['led-o', 'led-m2'], '2026-10-06T00:00:00.000Z');

    const body = await view('/api/me/people/p:led-m/history');
    expect(body).toMatchObject({ key: 'p:led-m', name: 'Minh', mode: 'all', total: 250 });
    expect(body.places).toHaveLength(2);
    const own = body.places.find((p) => p.source === 'own')!;
    const merged = body.places.find((p) => p.source === 'merged')!;
    expect(own).toMatchObject({ tripId: 't-led', kind: 'direct', amount: 100 });
    expect(merged).toMatchObject({ tripId: 't-led', kind: 'direct', amount: 150 });
    expect(own.history!.lines.map((l) => l.id)).toEqual(['e-1']);
    expect(merged.history!.lines.map((l) => l.id)).toEqual(['e-2']);
    expect(own.history!.twoWay + merged.history!.twoWay).toBe(body.total);
  });

  it('unauthenticated → 401', async () => {
    expect((await call('/api/me/people/u:u-minh/history')).status).toBe(401);
    expect((await call('/api/me/trips/t-x/people/p-x/history')).status).toBe(401);
  });

  it('unknown person → 404', async () => {
    await seedUser(OWNER, 'Owen');
    expect((await get('/api/me/people/u:u-nobody/history')).status).toBe(404);
  });
});

describe('GET /api/me/trips/:tripId/people/:pid/history', () => {
  it("group mode: fewest-transfers group → one place, history.gap.kind 'reroute'", async () => {
    await seedUser(OWNER, 'Owen');
    await seedUser(U.minh, 'Minh');
    await addTrip('t-bad', 'Badminton', { preset: 'sport' });
    await addPerson('t-bad', 'o', 'Owen', OWNER, 0);
    await addPerson('t-bad', 'm', 'Minh', U.minh, 1);
    await addPerson('t-bad', 'c', 'Chi', null, 2);
    await addPerson('t-bad', 'd', 'Dung', null, 3);
    // Owner +200, Chi +100, Minh -100, Dung -200: Dung pays the owner, Minh pays Chi.
    await addExpense('t-bad', 'e-1', 'o', 300, ['m', 'd']);
    await run("UPDATE transaction_shares SET amount = 100 WHERE transaction_id = 'e-1' AND participant_id = 'm'");
    await run("UPDATE transaction_shares SET amount = 200 WHERE transaction_id = 'e-1' AND participant_id = 'd'");
    await addExpense('t-bad', 'e-2', 'c', 100, ['o']);

    const body = await view('/api/me/trips/t-bad/people/m/history');
    expect(body).toMatchObject({ key: 'u:u-minh', name: 'Minh', mode: 'group', total: 0 });
    expect(body.places).toHaveLength(1);
    const [place] = body.places;
    expect(place).toMatchObject({ tripId: 't-bad', kind: 'group', source: 'group', amount: 0 });
    expect(place!.history!.gap?.kind).toBe('reroute');
    expect(place!.history!.twoWay).toBe(100);
    expect(place!.history!.suggested).toBe(0);
    expect(place!.history!.lines.map((l) => l.id)).toEqual(['e-1']);
  });

  it("group mode: guest pid linked to a ledger person → key is the ledger person's canonical key and name", async () => {
    await seedUser(OWNER, 'Owen');
    await addTrip('t-a', 'Hội An');
    await addPerson('t-a', 'a-o', 'Owen', OWNER, 0);
    await addPerson('t-a', 'a-m', 'Minh', null, 1);
    await addExpense('t-a', 'e-a', 'a-o', 200, ['a-o', 'a-m']);
    await addTrip('t-led', 'Owen', { preset: 'direct' });
    await addPerson('t-led', 'led-o', 'Owen', OWNER, 0);
    await addPerson('t-led', 'led-m', 'Minh Nguyễn', null, 1);
    await run('INSERT INTO person_links (owner_user_id, participant_id, person_pid, created_at) VALUES (?, ?, ?, ?)', OWNER, 'a-m', 'led-m', NOW);

    const body = await view('/api/me/trips/t-a/people/a-m/history');
    expect(body).toMatchObject({ key: 'p:led-m', name: 'Minh Nguyễn', mode: 'group', total: 100 });
    expect(body.places).toHaveLength(1);
    expect(body.places[0]).toMatchObject({ tripId: 't-a', tripName: 'Hội An', source: 'group', amount: 100 });
    expect(body.places[0]!.history!.lines.map((l) => [l.id, l.effect])).toEqual([['e-a', 100]]);
  });

  it('group mode: caller not in trip → 404', async () => {
    await seedUser(OWNER, 'Owen');
    await seedUser(U.minh, 'Minh');
    await seedUser(U.an, 'An');
    await addTrip('t-x', 'Elsewhere', { organiser: U.minh });
    await addPerson('t-x', 'x-m', 'Minh', U.minh, 0);
    await addPerson('t-x', 'x-a', 'An', U.an, 1);
    await addExpense('t-x', 'e-x', 'x-m', 200, ['x-m', 'x-a']);

    expect((await get('/api/me/trips/t-x/people/x-a/history')).status).toBe(404);
  });

  it('group mode: a pid from another trip → 404', async () => {
    await seedUser(OWNER, 'Owen');
    await seedUser(U.minh, 'Minh');
    await addTrip('t-a', 'A');
    await addPerson('t-a', 'a-o', 'Owen', OWNER, 0);
    await addPerson('t-a', 'a-m', 'Minh', U.minh, 1);
    await addTrip('t-b', 'B');
    await addPerson('t-b', 'b-o', 'Owen', OWNER, 0);
    await addPerson('t-b', 'b-m', 'Minh', U.minh, 1);

    expect((await get('/api/me/trips/t-a/people/b-m/history')).status).toBe(404);
  });
});
