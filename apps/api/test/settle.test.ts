import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { drizzle } from 'drizzle-orm/d1';
import type { ActivityItem, PeopleSummaryResponse, PersonSummary } from '@fsl/core';
import * as schema from '../src/db/schema';
import { createSettlement } from '../src/me/settle';
import { call, json, memberSid, seedUser, U } from './helpers';

const OWNER = 'u-owner';
const NOW = '2026-10-20T00:00:00.000Z';

async function run(query: string, ...binds: unknown[]) {
  await env.DB.prepare(query).bind(...binds).run();
}

async function addTrip(id: string, name: string, opts: { preset?: 'trip' | 'sport' | 'direct'; archived?: boolean } = {}) {
  await run(
    'INSERT INTO trips (id, name, preset, currency, fewest_transfers, organiser_user_id, group_token, view_token, version, created_at, archived_at) VALUES (?, ?, ?, \'VND\', 1, ?, ?, ?, 0, ?, ?)',
    id, name, opts.preset ?? 'trip', OWNER, `g-${id}`, `v-${id}`, NOW, opts.archived ? NOW : null,
  );
}

async function addPerson(tripId: string, id: string, name: string, userId: string | null, sort = 0) {
  await run(
    "INSERT INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)",
    id, tripId, name, name.toLowerCase(), userId, sort, NOW,
  );
}

async function addExpense(tripId: string, id: string, payer: string, amount: number, between: string[], createdAt = NOW) {
  await run(
    "INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, currency, spent_on, payer_id, split_mode, status, created_by_participant_id, created_at, updated_at) VALUES (?, ?, NULL, 1, ?, 'expense', 'x', ?, 'VND', '2026-10-10', ?, 'equal', 'approved', ?, ?, ?)",
    id, id, tripId, amount, payer, payer, createdAt, createdAt,
  );
  for (const p of between) {
    await run('INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES (?, ?, 1, ?)', id, p, amount / between.length);
  }
}

/** Task 4 fixture: Minh owes the owner 200 (badminton) + 120 (ledger), the owner owes Minh 50 (dinner). */
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

let ownerSid: string | null = null;
async function auth(): Promise<Record<string, string>> {
  ownerSid ??= await memberSid(OWNER, 'Owen');
  return { Cookie: `sid=${ownerSid}`, 'Content-Type': 'application/json' };
}

async function minh(): Promise<PersonSummary | undefined> {
  // A settlement bumps every trip it touches, so the summary may need a few calls to warm up.
  let body: PeopleSummaryResponse | null = null;
  for (let i = 0; i < 10 && (body === null || body.incomplete); i++) {
    const res = await call('/api/me/people/summary', { headers: await auth() });
    expect(res.status).toBe(200);
    body = await json<PeopleSummaryResponse>(res);
  }
  expect(body!.incomplete).toBe(false);
  return body!.people.find((p) => p.key === 'u:u-minh');
}

async function settle(key: string, body: unknown): Promise<Response> {
  return call(`/api/me/people/${encodeURIComponent(key)}/settle`, { method: 'POST', headers: await auth(), body: JSON.stringify(body) });
}

interface PaymentRow {
  id: string;
  trip_id: string;
  payer_id: string;
  to_id: string;
  amount: number;
  status: string;
  meta_json: string | null;
}

async function payments(): Promise<PaymentRow[]> {
  const r = await env.DB.prepare("SELECT id, trip_id, payer_id, to_id, amount, status, meta_json FROM transactions WHERE type = 'payment' ORDER BY trip_id").all<PaymentRow>();
  return r.results;
}

function db() {
  return drizzle(env.DB, { schema });
}

describe('cross-group settlements', () => {
  it('owner "Paid in cash" 270 writes three confirmed payments with one settlementId and clears the total', async () => {
    ownerSid = null;
    await seedMinhEverywhere();
    expect((await minh())!.total).toBe(270);

    const res = await settle('u:u-minh', { paid: 270, direction: 'toOwner' });
    expect(res.status).toBe(201);
    const { settlementId, status } = await json<{ settlementId: string; status: string }>(res);
    expect(status).toBe('confirmed');

    const rows = await payments();
    expect(rows.map((r) => [r.trip_id, r.payer_id, r.to_id, r.amount, r.status])).toEqual([
      ['t-bad', 'bad-m', 'bad-o', 200, 'confirmed'],
      ['t-din', 'din-o', 'din-m', 50, 'confirmed'],
      ['t-led', 'led-m', 'led-o', 120, 'confirmed'],
    ]);
    for (const r of rows) expect(JSON.parse(r.meta_json!)).toEqual({ settlementId });

    expect(await minh()).toBeUndefined();

    const activity = await json<ActivityItem[]>(await call('/api/trips/t-bad/activity', { headers: await auth() }));
    const items = Array.isArray(activity) ? activity : (activity as unknown as { items: ActivityItem[] }).items;
    expect(items.some((a) => a.action === 'payment_recorded' && a.details.settlementId === settlementId && a.details.amount === 200)).toBe(true);
  });

  it('disabling the badminton part brings the total back to 200', async () => {
    ownerSid = null;
    await seedMinhEverywhere();
    expect((await settle('u:u-minh', { paid: 270, direction: 'toOwner' })).status).toBe(201);
    const bad = (await payments()).find((p) => p.trip_id === 't-bad')!;

    const res = await call(`/api/trips/t-bad/payments/${bad.id}/disable`, { method: 'POST', headers: await auth() });
    expect(res.status).toBe(204);
    expect((await minh())!.total).toBe(200);
  });

  it('guest-recorded parts all wait until the owner confirms the settlement', async () => {
    ownerSid = null;
    await seedMinhEverywhere();
    const { settlementId, status } = await createSettlement(db(), {
      ownerUserId: OWNER,
      key: 'u:u-minh',
      paid: 270,
      direction: 'toOwner',
      recordedBy: 'guest',
      device: 'dev-1',
    });
    expect(status).toBe('says_paid');
    const rows = await payments();
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.status === 'says_paid')).toBe(true);
    // Snapshots count a says_paid payment provisionally (computeBalances includeSaysPaid), so the
    // total already nets to 0; Minh stays listed as waiting until the owner confirms.
    const waiting = await minh();
    expect(waiting).toBeDefined();
    expect(waiting!.total).toBe(0);

    const res = await call(`/api/me/settlements/${settlementId}/confirm`, { method: 'POST', headers: await auth() });
    expect(res.status).toBe(204);
    expect((await payments()).every((r) => r.status === 'confirmed')).toBe(true);
    expect(await minh()).toBeUndefined();

    const again = await call(`/api/me/settlements/${settlementId}/confirm`, { method: 'POST', headers: await auth() });
    expect(again.status).toBe(409);
  });

  it('confirming an unknown settlement is 404', async () => {
    ownerSid = null;
    await seedMinhEverywhere();
    const res = await call('/api/me/settlements/nope/confirm', { method: 'POST', headers: await auth() });
    expect(res.status).toBe(404);
  });

  it('the part for an archived group goes to the ledger', async () => {
    ownerSid = null;
    await seedMinhEverywhere();
    await run("UPDATE trips SET archived_at = ? WHERE id = 't-bad'", NOW);

    expect((await settle('u:u-minh', { paid: 270, direction: 'toOwner' })).status).toBe(201);
    const rows = await payments();
    expect(rows.map((r) => [r.trip_id, r.payer_id, r.to_id, r.amount])).toEqual([
      ['t-din', 'din-o', 'din-m', 50],
      ['t-led', 'led-m', 'led-o', 320],
    ]);
    expect((await minh())?.total ?? 0).toBe(0);
  });

  it('a person with no ledger row gets one when a part lands in the ledger', async () => {
    ownerSid = null;
    await seedUser(OWNER, 'Owen');
    await addTrip('t-a', 'Hội An');
    await addPerson('t-a', 'a-o', 'Owen', OWNER, 0);
    await addPerson('t-a', 'a-g', 'Giang', null, 1);
    await addExpense('t-a', 'e-a', 'a-o', 200, ['a-o', 'a-g']);

    const res = await settle('p:a-g', { paid: 150, direction: 'toOwner' });
    expect(res.status).toBe(201);
    const rows = await payments();
    expect(rows.map((r) => [r.trip_id, r.payer_id, r.amount])).toEqual(
      expect.arrayContaining([['t-a', 'a-g', 100]]),
    );
    const ledgerPart = rows.find((r) => r.trip_id !== 't-a')!;
    expect(ledgerPart.amount).toBe(50);
    const link = await env.DB.prepare('SELECT person_pid FROM person_links WHERE owner_user_id = ? AND participant_id = ?').bind(OWNER, 'a-g').first<{ person_pid: string }>();
    expect(link?.person_pid).toBe(ledgerPart.payer_id);
  });

  it('rejects paid <= 0 and a bad direction with 422', async () => {
    ownerSid = null;
    await seedMinhEverywhere();
    expect((await settle('u:u-minh', { paid: 0, direction: 'toOwner' })).status).toBe(422);
    expect((await settle('u:u-minh', { paid: -5, direction: 'toOwner' })).status).toBe(422);
    expect((await settle('u:u-minh', { paid: 10, direction: 'sideways' })).status).toBe(422);
    expect(await payments()).toHaveLength(0);
  });

  it('an unknown person is 404 and the route needs sign-in', async () => {
    ownerSid = null;
    await seedMinhEverywhere();
    expect((await settle('u:u-nobody', { paid: 10, direction: 'toOwner' })).status).toBe(404);
    const anon = await call('/api/me/people/u%3Au-minh/settle', { method: 'POST', body: JSON.stringify({ paid: 10, direction: 'toOwner' }) });
    expect(anon.status).toBe(401);
  });

  it('too many cold groups answers 409 TRY_AGAIN without writing, then succeeds once caches are warm', async () => {
    ownerSid = null;
    await seedUser(OWNER, 'Owen');
    await seedUser(U.minh, 'Minh');
    for (let i = 0; i < 8; i++) {
      const t = `t-${i}`;
      await addTrip(t, `Group ${i}`);
      await addPerson(t, `${t}-o`, 'Owen', OWNER, 0);
      await addPerson(t, `${t}-m`, 'Minh', U.minh, 1);
      await addExpense(t, `${t}-e`, `${t}-o`, 20, [`${t}-o`, `${t}-m`]);
    }

    const first = await settle('u:u-minh', { paid: 80, direction: 'toOwner' });
    expect(first.status).toBe(409);
    expect((await json<{ error: { code: string } }>(first)).error.code).toBe('TRY_AGAIN');
    expect(await payments()).toHaveLength(0);

    let res = first;
    for (let i = 0; i < 5 && res.status === 409; i++) res = await settle('u:u-minh', { paid: 80, direction: 'toOwner' });
    expect(res.status).toBe(201);
    expect(await payments()).toHaveLength(8);
    expect(await minh()).toBeUndefined();
  }, 30_000);

  it('a settlement with the most cold rebuilds allowed stays under 50 D1 statements', async () => {
    ownerSid = null;
    await seedUser(OWNER, 'Owen');
    await seedUser(U.minh, 'Minh');
    for (let i = 0; i < 3; i++) {
      const t = `t-${i}`;
      await addTrip(t, `Group ${i}`);
      await addPerson(t, `${t}-o`, 'Owen', OWNER, 0);
      await addPerson(t, `${t}-m`, 'Minh', U.minh, 1);
      await addExpense(t, `${t}-e`, `${t}-o`, 20, [`${t}-o`, `${t}-m`]);
    }
    let statements = 0;
    const counted = new Proxy(env.DB, {
      get(target, prop) {
        if (prop === 'prepare') return (q: string) => { statements += 1; return target.prepare(q); };
        const value = Reflect.get(target, prop) as unknown;
        return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
      },
    });
    // 30 more than owed: the leftover creates the owner's ledger and Minh's row in it.
    await createSettlement(drizzle(counted, { schema }), {
      ownerUserId: OWNER, key: 'u:u-minh', paid: 60, direction: 'toOwner', recordedBy: 'owner', device: null,
    });
    expect(await payments()).toHaveLength(4);
    expect(statements).toBeLessThan(50);
  });
});
