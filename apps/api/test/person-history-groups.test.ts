import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import type { PersonHistoryView } from '@cc/core';
import { call, json, memberSid, seedUser, U } from './helpers';

const OWNER = 'u-owner';
const NOW = '2026-10-20T00:00:00.000Z';

async function run(query: string, ...binds: unknown[]) {
  await env.DB.prepare(query).bind(...binds).run();
}

async function addTrip(id: string, name: string, preset: 'trip' | 'sport' | 'direct' = 'trip') {
  await run(
    'INSERT INTO trips (id, name, preset, currency, fewest_transfers, organiser_user_id, group_token, view_token, version, created_at) VALUES (?, ?, ?, \'VND\', 1, ?, ?, ?, 0, ?)',
    id, name, preset, OWNER, `g-${id}`, `v-${id}`, NOW,
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

describe('GET /api/me/people/:key/history — group places', () => {
  it("all mode: a fewest-transfers group place carries its history (gap.kind 'reroute'); the direct place keeps its lines", async () => {
    await seedUser(OWNER, 'Owen');
    await seedUser(U.minh, 'Minh');
    // Owner paid 300 for Minh; Chi paid 100 for the owner. Owner +200, Chi +100, Minh -300:
    // Minh pays the owner 200 and Chi 100, so the two-way 300 is rerouted to a suggested 200.
    await addTrip('t-bad', 'Badminton', 'sport');
    await addPerson('t-bad', 'o', 'Owen', OWNER, 0);
    await addPerson('t-bad', 'm', 'Minh', U.minh, 1);
    await addPerson('t-bad', 'c', 'Chi', null, 2);
    await addExpense('t-bad', 'e-g1', 'o', 300, ['m'], '2026-10-02T00:00:00.000Z');
    await addExpense('t-bad', 'e-g2', 'c', 100, ['o'], '2026-10-03T00:00:00.000Z');

    await addTrip('t-led', 'Owen', 'direct');
    await addPerson('t-led', 'led-o', 'Owen', OWNER, 0);
    await addPerson('t-led', 'led-m', 'Minh', U.minh, 1);
    await addExpense('t-led', 'e-led', 'led-o', 60, ['led-o', 'led-m'], '2026-10-08T00:00:00.000Z');

    const sid = await memberSid(OWNER, 'Owen');
    const res = await call('/api/me/people/u:u-minh/history', { headers: { Cookie: `sid=${sid}` } });
    expect(res.status).toBe(200);
    const body = await json<PersonHistoryView>(res);
    expect(body.places).toHaveLength(2);

    const group = body.places.find((p) => p.tripId === 't-bad')!;
    expect(group).toMatchObject({ kind: 'group', source: 'group', amount: 200 });
    expect(group.history).not.toBeNull();
    expect(group.history!.gap?.kind).toBe('reroute');
    expect(group.history!.twoWay).toBe(300);
    expect(group.history!.suggested).toBe(200);
    expect(group.history!.lines.map((l) => l.id)).toEqual(['e-g1']);

    const direct = body.places.find((p) => p.tripId === 't-led')!;
    expect(direct).toMatchObject({ kind: 'direct', source: 'own', amount: 30 });
    expect(direct.history!.lines.map((l) => [l.id, l.effect])).toEqual([['e-led', 30]]);
    expect(body.total).toBe(230);
  });
});
