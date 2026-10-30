import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { drizzle } from 'drizzle-orm/d1';
import type { PersonSummary } from '@fsl/core';
import * as schema from '../src/db/schema';
import { loadPeopleSummary } from '../src/me/balances';
import { call, json, memberSid, seedUser, U } from './helpers';

const OWNER = 'u-owner';
const NOW = '2026-10-20T00:00:00.000Z';

async function run(query: string, ...binds: unknown[]) {
  await env.DB.prepare(query).bind(...binds).run();
}

async function addTrip(
  id: string,
  name: string,
  opts: { preset?: 'trip' | 'sport' | 'direct'; organiser?: string; archived?: boolean } = {},
) {
  await run(
    'INSERT INTO trips (id, name, preset, currency, fewest_transfers, organiser_user_id, group_token, view_token, version, created_at, archived_at) VALUES (?, ?, ?, \'VND\', 1, ?, ?, ?, 0, ?, ?)',
    id, name, opts.preset ?? 'trip', opts.organiser ?? OWNER, `g-${id}`, `v-${id}`, NOW, opts.archived ? NOW : null,
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
    "INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, currency, spent_on, payer_id, split_mode, status, created_by_participant_id, created_at, updated_at) VALUES (?, ?, NULL, 1, ?, 'expense', 'x', ?, 'VND', '2026-10-10', ?, 'equal', 'approved', ?, ?, ?)",
    id, id, tripId, amount, payer, payer, createdAt, createdAt,
  );
  for (const p of between) {
    await run('INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES (?, ?, 1, ?)', id, p, amount / between.length);
  }
}

async function summary(): Promise<PersonSummary[]> {
  const sid = await memberSid(OWNER, 'Owen');
  const res = await call('/api/me/people/summary', { headers: { Cookie: `sid=${sid}` } });
  expect(res.status).toBe(200);
  return json<PersonSummary[]>(res);
}

/** Owner and Minh (with an account) in badminton, dinner and the owner's ledger. */
async function seedMinhEverywhere() {
  await seedUser(OWNER, 'Owen');
  await seedUser(U.minh, 'Minh');

  await addTrip('t-bad', 'Badminton', { preset: 'sport' });
  await addPerson('t-bad', 'bad-o', 'Owen', OWNER, 0);
  await addPerson('t-bad', 'bad-m', 'Minh', U.minh, 1);
  await addExpense('t-bad', 'e-bad', 'bad-o', 400, ['bad-o', 'bad-m'], '2026-10-05T00:00:00.000Z');

  await addTrip('t-din', 'Dinner');
  await addPerson('t-din', 'din-o', 'Owen', OWNER, 0);
  await addPerson('t-din', 'din-m', 'Minh', U.minh, 1);
  await addExpense('t-din', 'e-din', 'din-m', 100, ['din-o', 'din-m'], '2026-10-03T00:00:00.000Z');

  await addTrip('t-led', 'Owen', { preset: 'direct' });
  await addPerson('t-led', 'led-o', 'Owen', OWNER, 0);
  await addPerson('t-led', 'led-m', 'Minh', U.minh, 1);
  await addExpense('t-led', 'e-led', 'led-o', 240, ['led-o', 'led-m'], '2026-10-07T00:00:00.000Z');
}

describe('GET /api/me/people/summary', () => {
  it('requires sign-in', async () => {
    const res = await call('/api/me/people/summary');
    expect(res.status).toBe(401);
  });

  it('adds up one person with an account across groups and the ledger', async () => {
    await seedMinhEverywhere();
    const rows = await summary();
    expect(rows).toHaveLength(1);
    const [minh] = rows;
    expect(minh).toMatchObject({ key: 'u:u-minh', name: 'Minh', nickname: null, userId: U.minh, groupLabel: null, total: 270 });
    expect(minh!.items).toHaveLength(3);
    expect(minh!.items.map((i) => [i.tripId, i.kind, i.amount, i.oldestOpenAt])).toEqual([
      ['t-din', 'group', -50, '2026-10-03T00:00:00.000Z'],
      ['t-bad', 'group', 200, '2026-10-05T00:00:00.000Z'],
      ['t-led', 'direct', 120, '2026-10-07T00:00:00.000Z'],
    ]);
  });

  it('archived groups still count', async () => {
    await seedMinhEverywhere();
    await run("UPDATE trips SET archived_at = ? WHERE id = 't-bad'", NOW);
    const [minh] = await summary();
    expect(minh!.total).toBe(270);
  });

  it('a suggestion that routes Minh\'s debt to someone else gives no item for that group', async () => {
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

    const rows = await summary();
    expect(rows.find((r) => r.key === 'u:u-minh')).toBeUndefined();
    expect(rows.map((r) => [r.key, r.total])).toEqual([['p:d', 200]]);
  });

  it('unlinked guests with the same name stay apart until linked to one ledger person', async () => {
    await seedUser(OWNER, 'Owen');
    await addTrip('t-a', 'Hội An');
    await addPerson('t-a', 'a-o', 'Owen', OWNER, 0);
    await addPerson('t-a', 'a-m', 'Minh', null, 1);
    await addExpense('t-a', 'e-a', 'a-o', 200, ['a-o', 'a-m']);
    await addTrip('t-b', 'Sapa');
    await addPerson('t-b', 'b-o', 'Owen', OWNER, 0);
    await addPerson('t-b', 'b-m', 'Minh', null, 1);
    await addExpense('t-b', 'e-b', 'b-o', 600, ['b-o', 'b-m']);

    const before = await summary();
    expect(before.map((r) => [r.key, r.name, r.groupLabel, r.total])).toEqual([
      ['p:b-m', 'Minh', 'Sapa', 300],
      ['p:a-m', 'Minh', 'Hội An', 100],
    ]);

    await addTrip('t-led', 'Owen', { preset: 'direct' });
    await addPerson('t-led', 'led-o', 'Owen', OWNER, 0);
    await addPerson('t-led', 'led-m', 'Minh Nguyễn', null, 1);
    for (const pid of ['a-m', 'b-m']) {
      await run('INSERT INTO person_links (owner_user_id, participant_id, person_pid, created_at) VALUES (?, ?, ?, ?)', OWNER, pid, 'led-m', NOW);
    }

    const after = await summary();
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ key: 'p:led-m', name: 'Minh Nguyễn', groupLabel: null, userId: null, total: 400 });
    expect(after[0]!.items).toHaveLength(2);
  });

  it('shows the nickname', async () => {
    await seedMinhEverywhere();
    await run('INSERT INTO nicknames (owner_user_id, person_key, nickname, updated_at) VALUES (?, ?, ?, ?)', OWNER, 'u:u-minh', 'Minh Béo', NOW);
    const [minh] = await summary();
    expect(minh!.nickname).toBe('Minh Béo');
  });

  it('keeps someone whose only open item is a payment waiting for confirmation', async () => {
    await seedUser(OWNER, 'Owen');
    await seedUser(U.minh, 'Minh');
    await addTrip('t-din', 'Dinner');
    await addPerson('t-din', 'o', 'Owen', OWNER, 0);
    await addPerson('t-din', 'm', 'Minh', U.minh, 1);
    await addExpense('t-din', 'e-1', 'o', 200, ['o', 'm']);
    await run(
      "INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, currency, spent_on, payer_id, to_id, status, created_by_participant_id, created_at, updated_at) VALUES ('pay-1', 'pay-1', NULL, 1, 't-din', 'payment', '', 100, 'VND', '2026-10-11', 'm', 'o', 'says_paid', 'm', ?, ?)",
      NOW, NOW,
    );
    const rows = await summary();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.key).toBe('u:u-minh');
  });

  it('30 groups with Minh stay under 50 database queries', async () => {
    await seedUser(OWNER, 'Owen');
    await seedUser(U.minh, 'Minh');
    const trip = env.DB.prepare("INSERT INTO trips (id, name, currency, fewest_transfers, organiser_user_id, group_token, view_token, version, created_at) VALUES (?, ?, 'VND', 1, ?, ?, ?, 0, ?)");
    const person = env.DB.prepare("INSERT INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)");
    const expense = env.DB.prepare("INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, currency, spent_on, payer_id, split_mode, status, created_by_participant_id, created_at, updated_at) VALUES (?, ?, NULL, 1, ?, 'expense', 'x', 20, 'VND', '2026-10-10', ?, 'equal', 'approved', ?, ?, ?)");
    const share = env.DB.prepare('INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES (?, ?, 1, 10)');
    const stmts = [];
    for (let i = 0; i < 30; i++) {
      const t = `t-${i}`;
      stmts.push(
        trip.bind(t, `Group ${i}`, OWNER, `g-${t}`, `v-${t}`, NOW),
        person.bind(`${t}-o`, t, 'Owen', 'owen', OWNER, 0, NOW),
        person.bind(`${t}-m`, t, 'Minh', 'minh', U.minh, 1, NOW),
        expense.bind(`${t}-e`, `${t}-e`, t, `${t}-o`, `${t}-o`, NOW, NOW),
        share.bind(`${t}-e`, `${t}-o`),
        share.bind(`${t}-e`, `${t}-m`),
      );
    }
    await env.DB.batch(stmts);
    // The first read fills the per-group snapshot cache (trip_views), as opening each group does.
    await summary();

    let queries = 0;
    const counting = new Proxy(env.DB, {
      get(target, prop) {
        if (prop === 'prepare') {
          return (q: string) => {
            queries += 1;
            return target.prepare(q);
          };
        }
        const value = Reflect.get(target, prop) as unknown;
        return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
      },
    });
    const rows = await loadPeopleSummary(drizzle(counting, { schema }), OWNER);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.total).toBe(300);
    expect(rows[0]!.items).toHaveLength(30);
    expect(queries).toBeLessThan(50);
  }, 30_000);
});
