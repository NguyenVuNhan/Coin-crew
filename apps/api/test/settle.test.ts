import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { drizzle } from 'drizzle-orm/d1';
import type { ActivityItem, PeopleSummaryResponse, PersonSummary, TripListItem, TripView } from '@fsl/core';
import * as schema from '../src/db/schema';
import { createSettlement } from '../src/me/settle';
import { call, guestHeaders, json, memberSid, seedUser, U } from './helpers';

const OWNER = 'u-owner';
const NOW = '2026-10-20T00:00:00.000Z';

async function run(query: string, ...binds: unknown[]) {
  await env.DB.prepare(query).bind(...binds).run();
}

async function addTrip(id: string, name: string, opts: { preset?: 'trip' | 'sport' | 'direct'; archived?: boolean; roundTransfers?: boolean } = {}) {
  await run(
    'INSERT INTO trips (id, name, preset, currency, fewest_transfers, round_transfers, organiser_user_id, group_token, view_token, version, created_at, archived_at) VALUES (?, ?, ?, \'VND\', 1, ?, ?, ?, ?, 0, ?, ?)',
    id, name, opts.preset ?? 'trip', opts.roundTransfers ? 1 : 0, OWNER, `g-${id}`, `v-${id}`, NOW, opts.archived ? NOW : null,
  );
}

async function addPayment(tripId: string, id: string, fromId: string, toId: string, amount: number, status = 'confirmed', createdAt = NOW) {
  await run(
    "INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, amount_confirmed, currency, spent_on, payer_id, to_id, split_mode, status, created_by_participant_id, confirmed_by_participant_id, created_at, updated_at) VALUES (?, ?, NULL, 1, ?, 'payment', '', ?, ?, 'VND', '2026-10-10', ?, ?, 'equal', ?, ?, ?, ?, ?)",
    id, id, tripId, amount, status === 'confirmed' ? amount : null, fromId, toId, status, fromId, status === 'confirmed' ? toId : null, createdAt, createdAt,
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
    // The dinner part runs against the handover (no cash moved there): marked as settled through the People total.
    for (const r of rows) expect(JSON.parse(r.meta_json!)).toEqual(r.trip_id === 't-din' ? { settlementId, offset: true } : { settlementId });

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

describe('roundTransfers in settlement snapshot', () => {
  it('equal split 50.000 ₫ 3 ways -> suggestions are 17.000 ₫ when roundTransfers is enabled', async () => {
    ownerSid = null;
    await seedUser(OWNER, 'Owen');
    await addTrip('t-round-3way', 'Split 50k 3-way', { roundTransfers: true });
    await addPerson('t-round-3way', 'p-o', 'Owen', OWNER, 0);
    await addPerson('t-round-3way', 'p-b', 'Bob', null, 1);
    await addPerson('t-round-3way', 'p-c', 'Charlie', null, 2);
    await addExpense('t-round-3way', 'e-50k', 'p-o', 50_000, ['p-o', 'p-b', 'p-c']);

    const res = await call('/api/trips/t-round-3way', { headers: await auth() });
    expect(res.status).toBe(200);
    const view = await json<TripView>(res);
    expect(view.trip.roundTransfers).toBe(true);
    expect(view.suggestions).toHaveLength(2);
    expect(view.suggestions.map((s) => s.amount)).toEqual([17_000, 17_000]);

    const listRes = await call('/api/trips', { headers: await auth() });
    expect(listRes.status).toBe(200);
    const list = await json<TripListItem[]>(listRes);
    const item = list.find((t) => t.id === 't-round-3way');
    expect(item?.myBalance).toBe(34_000);
  });

  it('equal split 500.000 ₫ 6 ways -> suggestions are 83.000 ₫ when roundTransfers is enabled', async () => {
    ownerSid = null;
    await seedUser(OWNER, 'Owen');
    await addTrip('t-round-6way', 'Split 500k 6-way', { roundTransfers: true });
    await addPerson('t-round-6way', 'p-o', 'Owen', OWNER, 0);
    for (let i = 1; i <= 5; i++) {
      await addPerson('t-round-6way', `p-${i}`, `P${i}`, null, i);
    }
    const all = ['p-o', 'p-1', 'p-2', 'p-3', 'p-4', 'p-5'];
    await addExpense('t-round-6way', 'e-500k', 'p-o', 500_000, all);

    const res = await call('/api/trips/t-round-6way', { headers: await auth() });
    expect(res.status).toBe(200);
    const view = await json<TripView>(res);
    expect(view.suggestions).toHaveLength(5);
    expect(view.suggestions.map((s) => s.amount)).toEqual([83_000, 83_000, 83_000, 83_000, 83_000]);
  });

  it('extinguishing residual debts <= 500 ₫: after paying 83.000 ₫ on an 83.333 ₫ debt, suggestions is empty and view.myBalance.now is 0', async () => {
    ownerSid = null;
    await seedUser(OWNER, 'Owen');
    await addTrip('t-extinguish', 'Residual debt', { roundTransfers: true });
    await addPerson('t-extinguish', 'p-o', 'Owen', OWNER, 0);
    await addPerson('t-extinguish', 'p-a', 'Alice', null, 1);
    // Owen owes 83.333 ₫: Alice pays 166.667 ₫ for Alice and Owen
    await addExpense('t-extinguish', 'e-split', 'p-a', 166_667, ['p-a', 'p-o']);
    // Owen pays 83.000 ₫ to Alice -> leaving a ~333.5 ₫ residual
    await addPayment('t-extinguish', 'pay-1', 'p-o', 'p-a', 83_000);

    const res = await call('/api/trips/t-extinguish', { headers: await auth() });
    expect(res.status).toBe(200);
    const view = await json<TripView>(res);
    expect(view.suggestions).toHaveLength(0);
    expect(view.myBalance?.now).toBe(0);

    const listRes = await call('/api/trips', { headers: await auth() });
    expect(listRes.status).toBe(200);
    const list = await json<TripListItem[]>(listRes);
    const item = list.find((t) => t.id === 't-extinguish');
    expect(item?.myBalance).toBe(0);
  });

  it('overpayment <= 500 ₫ does not ping-pong: paying 8.000 ₫ on a 7.500 ₫ debt produces a 500 ₫ credit, which extinguishes', async () => {
    ownerSid = null;
    await seedUser(OWNER, 'Owen');
    await addTrip('t-pingpong', 'Overpayment pingpong', { roundTransfers: true });
    await addPerson('t-pingpong', 'p-o', 'Owen', OWNER, 0);
    await addPerson('t-pingpong', 'p-a', 'Alice', null, 1);
    // Alice pays 15.000 ₫ for Alice and Owen -> Owen owes 7.500 ₫
    await addExpense('t-pingpong', 'e-split', 'p-a', 15_000, ['p-a', 'p-o']);
    // Owen pays 8.000 ₫ to Alice -> Owen has 500 ₫ credit
    await addPayment('t-pingpong', 'pay-1', 'p-o', 'p-a', 8_000);

    const res = await call('/api/trips/t-pingpong', { headers: await auth() });
    expect(res.status).toBe(200);
    const view = await json<TripView>(res);
    expect(view.suggestions).toHaveLength(0);
    expect(view.myBalance?.now).toBe(0);
  });

  it('full settlement of 3-way (50k) split leaves suggestions empty and myBalance.now === 0 for all participants', async () => {
    ownerSid = null;
    await seedUser(OWNER, 'Owen');
    const tripId = 't-round-3way-settled';
    await addTrip(tripId, 'Split 50k 3-way Settled', { roundTransfers: true });
    await addPerson(tripId, 'p-o', 'Owen', OWNER, 0);
    await addPerson(tripId, 'p-b', 'Bob', null, 1);
    await addPerson(tripId, 'p-c', 'Charlie', null, 2);
    await addExpense(tripId, 'e-50k', 'p-o', 50_000, ['p-o', 'p-b', 'p-c']);

    // Pre-settlement: 2 suggestions of 17.000 ₫
    const preOwenRes = await call(`/api/trips/${tripId}`, { headers: await auth() });
    expect(preOwenRes.status).toBe(200);
    const preOwenView = await json<TripView>(preOwenRes);
    expect(preOwenView.suggestions).toHaveLength(2);
    expect(preOwenView.myBalance?.now).toBe(34_000);

    const preBobHeaders = await guestHeaders('p-b', `g-${tripId}`, tripId);
    const preBobView = await json<TripView>(call(`/api/trips/${tripId}`, { headers: preBobHeaders }));
    expect(preBobView.myBalance?.now).toBe(-17_000);

    // Both suggested transfers are paid
    await addPayment(tripId, 'pay-b', 'p-b', 'p-o', 17_000);
    await addPayment(tripId, 'pay-c', 'p-c', 'p-o', 17_000);
    await run('UPDATE trips SET version = version + 1 WHERE id = ?', tripId);

    // Verify for Owen (creditor)
    const owenRes = await call(`/api/trips/${tripId}`, { headers: await auth() });
    expect(owenRes.status).toBe(200);
    const owenView = await json<TripView>(owenRes);
    expect(owenView.suggestions).toHaveLength(0);
    expect(owenView.myBalance?.now).toBe(0);

    // Verify for Bob (debtor)
    const bobHeaders = await guestHeaders('p-b', `g-${tripId}`, tripId);
    const bobRes = await call(`/api/trips/${tripId}`, { headers: bobHeaders });
    expect(bobRes.status).toBe(200);
    const bobView = await json<TripView>(bobRes);
    expect(bobView.suggestions).toHaveLength(0);
    expect(bobView.myBalance?.now).toBe(0);

    // Verify for Charlie (debtor)
    const charlieHeaders = await guestHeaders('p-c', `g-${tripId}`, tripId);
    const charlieRes = await call(`/api/trips/${tripId}`, { headers: charlieHeaders });
    expect(charlieRes.status).toBe(200);
    const charlieView = await json<TripView>(charlieRes);
    expect(charlieView.suggestions).toHaveLength(0);
    expect(charlieView.myBalance?.now).toBe(0);
  });

  it('full settlement of 6-way (500k) split leaves suggestions empty and myBalance.now === 0 for all participants', async () => {
    ownerSid = null;
    await seedUser(OWNER, 'Owen');
    const tripId = 't-round-6way-settled';
    await addTrip(tripId, 'Split 500k 6-way Settled', { roundTransfers: true });
    await addPerson(tripId, 'p-o', 'Owen', OWNER, 0);
    for (let i = 1; i <= 5; i++) {
      await addPerson(tripId, `p-${i}`, `P${i}`, null, i);
    }
    const all = ['p-o', 'p-1', 'p-2', 'p-3', 'p-4', 'p-5'];
    await addExpense(tripId, 'e-500k', 'p-o', 500_000, all);

    // Pre-settlement: 5 suggestions of 83.000 ₫ each (total 415.000 ₫)
    const preOwenRes = await call(`/api/trips/${tripId}`, { headers: await auth() });
    expect(preOwenRes.status).toBe(200);
    const preOwenView = await json<TripView>(preOwenRes);
    expect(preOwenView.suggestions).toHaveLength(5);
    expect(preOwenView.myBalance?.now).toBe(415_000);

    // All 5 debtors pay 83.000 ₫
    for (let i = 1; i <= 5; i++) {
      await addPayment(tripId, `pay-${i}`, `p-${i}`, 'p-o', 83_000);
    }
    await run('UPDATE trips SET version = version + 1 WHERE id = ?', tripId);

    // Verify for Owen (creditor)
    const owenRes = await call(`/api/trips/${tripId}`, { headers: await auth() });
    expect(owenRes.status).toBe(200);
    const owenView = await json<TripView>(owenRes);
    expect(owenView.suggestions).toHaveLength(0);
    expect(owenView.myBalance?.now).toBe(0);

    // Verify for all debtors (p-1 through p-5)
    for (let i = 1; i <= 5; i++) {
      const debtorHeaders = await guestHeaders(`p-${i}`, `g-${tripId}`, tripId);
      const debtorRes = await call(`/api/trips/${tripId}`, { headers: debtorHeaders });
      expect(debtorRes.status).toBe(200);
      const debtorView = await json<TripView>(debtorRes);
      expect(debtorView.suggestions).toHaveLength(0);
      expect(debtorView.myBalance?.now).toBe(0);
    }
  });

  it('when roundTransfers is disabled (default), exact unrounded suggestions are retained', async () => {
    ownerSid = null;
    await seedUser(OWNER, 'Owen');
    await addTrip('t-exact', 'Exact suggestions', { roundTransfers: false });
    await addPerson('t-exact', 'p-o', 'Owen', OWNER, 0);
    await addPerson('t-exact', 'p-b', 'Bob', null, 1);
    await addPerson('t-exact', 'p-c', 'Charlie', null, 2);
    await addExpense('t-exact', 'e-50k', 'p-o', 50_000, ['p-o', 'p-b', 'p-c']);

    const res = await call('/api/trips/t-exact', { headers: await auth() });
    expect(res.status).toBe(200);
    const view = await json<TripView>(res);
    expect(view.trip.roundTransfers).toBe(false);
    expect(view.suggestions).toHaveLength(2);
    expect(view.suggestions[0]!.amount).toBeCloseTo(16666.67, 1);
    expect(view.suggestions[0]!.amount).not.toBe(17000);
  });
});
