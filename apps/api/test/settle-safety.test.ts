import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import type { PeopleSummaryResponse, PersonSummary, RequestView, TripView } from '@fsl/core';
import { app, call, json, memberSid, seedUser, U } from './helpers';

const OWNER = 'u-owner';
const NOW = '2026-10-20T00:00:00.000Z';

async function run(query: string, ...binds: unknown[]) {
  await env.DB.prepare(query).bind(...binds).run();
}

async function addTrip(id: string, name: string, preset: 'trip' | 'direct' = 'trip') {
  await run(
    "INSERT INTO trips (id, name, preset, currency, fewest_transfers, organiser_user_id, group_token, view_token, version, created_at) VALUES (?, ?, ?, 'VND', 1, ?, ?, ?, 0, ?)",
    id, name, preset, OWNER, `g-${id}`, `v-${id}`, NOW,
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

/** Lan (a guest) owes the owner 120.000₫ in one group. */
async function seedLan() {
  await seedUser(OWNER, 'Nhan');
  await addTrip('t-g', 'Hội An');
  await addPerson('t-g', 'g-o', 'Nhan', OWNER, 0);
  await addPerson('t-g', 'g-lan', 'Lan', null, 1);
  await addExpense('t-g', 'e-lan', 'g-o', 240000, ['g-o', 'g-lan']);
}

/** Minh (signed in) owes the owner 370 in the ledger; the owner owes Minh 100 in badminton. */
async function seedMinhBothWays() {
  await seedUser(OWNER, 'Nhan');
  await seedUser(U.minh, 'Minh');
  await addTrip('t-led', 'Nhan', 'direct');
  await addPerson('t-led', 'led-o', 'Nhan', OWNER, 0);
  await addPerson('t-led', 'led-m', 'Minh', U.minh, 1);
  await addExpense('t-led', 'e-led', 'led-o', 740, ['led-o', 'led-m'], '2026-10-01T00:00:00.000Z');
  await addTrip('t-bad', 'Badminton');
  await addPerson('t-bad', 'bad-o', 'Nhan', OWNER, 0);
  await addPerson('t-bad', 'bad-m', 'Minh', U.minh, 1);
  await addExpense('t-bad', 'e-bad', 'bad-m', 200, ['bad-o', 'bad-m'], '2026-10-02T00:00:00.000Z');
}

async function headersFor(userId: string, name: string): Promise<Record<string, string>> {
  return { Cookie: `sid=${await memberSid(userId, name)}`, 'Content-Type': 'application/json' };
}

async function tokenFor(owner: Record<string, string>, key: string): Promise<string> {
  const res = await call(`/api/me/people/${encodeURIComponent(key)}/request-link`, { method: 'POST', headers: owner });
  expect(res.status).toBe(200);
  return (await json<{ url: string }>(res)).url.split('/r/')[1]!;
}

async function view(token: string): Promise<RequestView> {
  let res = await call(`/api/r/${token}`);
  for (let i = 0; i < 25 && res.status === 409; i++) res = await call(`/api/r/${token}`);
  expect(res.status).toBe(200);
  return json<RequestView>(res);
}

function paid(token: string, body: unknown): Promise<Response> {
  return call(`/api/r/${token}/paid`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

async function summary(headers: Record<string, string>): Promise<PersonSummary[]> {
  let body: PeopleSummaryResponse | null = null;
  for (let i = 0; i < 10 && (body === null || body.incomplete); i++) {
    body = await json<PeopleSummaryResponse>(call('/api/me/people/summary', { headers }));
  }
  expect(body!.incomplete).toBe(false);
  return body!.people;
}

interface PaymentRow { id: string; trip_id: string; payer_id: string; to_id: string; amount: number; status: string; meta_json: string | null }

async function payments(): Promise<PaymentRow[]> {
  const r = await env.DB.prepare("SELECT id, trip_id, payer_id, to_id, amount, status, meta_json FROM transactions WHERE type = 'payment' ORDER BY trip_id").all<PaymentRow>();
  return r.results;
}

const KEY_A = 'key-aaaaaaaaaaaaaaaaaaaa';
const KEY_B = 'key-bbbbbbbbbbbbbbbbbbbb';

describe('settlement idempotency (I1)', () => {
  it('the owner submitting "Paid in cash" twice with one key writes one settlement', async () => {
    await seedLan();
    const owner = await headersFor(OWNER, 'Nhan');
    const settle = () => call('/api/me/people/p%3Ag-lan/settle', { method: 'POST', headers: owner, body: JSON.stringify({ paid: 120000, direction: 'toOwner', idempotencyKey: KEY_A }) });

    const first = await settle();
    expect(first.status).toBe(201);
    const a = await json<{ settlementId: string; status: string }>(first);
    const second = await settle();
    expect(second.status).toBe(200);
    expect(await json<{ settlementId: string; status: string }>(second)).toEqual(a);

    expect(await payments()).toHaveLength(1);
  });

  it('two identical submits at the same moment still write one settlement', async () => {
    await seedLan();
    const owner = await headersFor(OWNER, 'Nhan');
    const settle = () => call('/api/me/people/p%3Ag-lan/settle', { method: 'POST', headers: owner, body: JSON.stringify({ paid: 120000, direction: 'toOwner', idempotencyKey: KEY_A }) });
    const [x, y] = await Promise.all([settle(), settle()]);
    expect([x.status, y.status].sort()).toEqual([200, 201]);
    const ids = new Set([(await json<{ settlementId: string }>(x)).settlementId, (await json<{ settlementId: string }>(y)).settlementId]);
    expect(ids.size).toBe(1);
    expect(await payments()).toHaveLength(1);
  });

  it('a different key is a new settlement, a malformed key is 422, and no key still works', async () => {
    await seedLan();
    const owner = await headersFor(OWNER, 'Nhan');
    const settle = (body: unknown) => call('/api/me/people/p%3Ag-lan/settle', { method: 'POST', headers: owner, body: JSON.stringify(body) });
    expect((await settle({ paid: 1000, direction: 'toOwner', idempotencyKey: 'short' })).status).toBe(422);
    expect((await settle({ paid: 1000, direction: 'toOwner', idempotencyKey: 42 })).status).toBe(422);
    expect((await settle({ paid: 1000, direction: 'toOwner', idempotencyKey: KEY_A })).status).toBe(201);
    expect((await settle({ paid: 1000, direction: 'toOwner', idempotencyKey: KEY_B })).status).toBe(201);
    expect((await settle({ paid: 1000, direction: 'toOwner' })).status).toBe(201);
    expect(await payments()).toHaveLength(3);
  });

  it("the guest's \"I've paid\" retried with its key gets the same settlement back", async () => {
    await seedLan();
    const owner = await headersFor(OWNER, 'Nhan');
    const token = await tokenFor(owner, 'p:g-lan');
    await view(token);

    const first = await paid(token, { amount: 120000, idempotencyKey: KEY_A });
    expect(first.status).toBe(201);
    const a = await json<{ settlementId: string }>(first);
    const again = await paid(token, { amount: 120000, idempotencyKey: KEY_A });
    expect(again.status).toBe(200);
    expect((await json<{ settlementId: string }>(again)).settlementId).toBe(a.settlementId);
    expect(await payments()).toHaveLength(1);
  });

  it("someone else's key is refused, not looked up", async () => {
    await seedLan();
    const owner = await headersFor(OWNER, 'Nhan');
    expect((await call('/api/me/people/p%3Ag-lan/settle', { method: 'POST', headers: owner, body: JSON.stringify({ paid: 1000, direction: 'toOwner', idempotencyKey: KEY_A }) })).status).toBe(201);

    await seedUser(U.an, 'An');
    await run("INSERT INTO trips (id, name, preset, currency, fewest_transfers, organiser_user_id, group_token, view_token, version, created_at) VALUES ('t-an', 'An trip', 'trip', 'VND', 1, ?, 'g-an', 'v-an', 0, ?)", U.an, NOW);
    await addPerson('t-an', 'an-a', 'An', U.an, 0);
    await addPerson('t-an', 'an-b', 'Bao', null, 1);
    await addExpense('t-an', 'e-an', 'an-a', 2000, ['an-a', 'an-b']);
    const an = await headersFor(U.an, 'An');
    const res = await call('/api/me/people/p%3Aan-b/settle', { method: 'POST', headers: an, body: JSON.stringify({ paid: 1000, direction: 'toOwner', idempotencyKey: KEY_A }) });
    expect(res.status).toBe(409);
  });
});

describe('rejecting a waiting "I\'ve paid" (I2)', () => {
  it('"Not received" disables every waiting part and the total comes back', async () => {
    await seedLan();
    const owner = await headersFor(OWNER, 'Nhan');
    const token = await tokenFor(owner, 'p:g-lan');
    await view(token);
    const { settlementId } = await json<{ settlementId: string }>(paid(token, { amount: 120000 }));

    const before = (await summary(owner)).find((p) => p.name === 'Lan')!;
    expect(before.waiting).toHaveLength(1);

    const res = await call(`/api/me/settlements/${settlementId}/reject`, { method: 'POST', headers: owner });
    expect(res.status).toBe(204);
    expect((await payments()).map((p) => p.status)).toEqual(['disabled']);

    const after = (await summary(owner)).find((p) => p.name === 'Lan')!;
    expect(after.total).toBe(120000);
    expect(after.waiting).toEqual([]);

    const act = await env.DB.prepare("SELECT details_json FROM activity WHERE action = 'payment_disabled'").all<{ details_json: string }>();
    expect(act.results.map((r) => JSON.parse(r.details_json))).toEqual([expect.objectContaining({ settlementId, notReceived: true })]);

    expect((await call(`/api/me/settlements/${settlementId}/reject`, { method: 'POST', headers: owner })).status).toBe(409);
    expect((await call(`/api/me/settlements/${settlementId}/confirm`, { method: 'POST', headers: owner })).status).toBe(409);

    // The guest can say "I've paid" again once the claim is turned down.
    const view2 = await view(token);
    expect(view2.settlementWaiting).toBe(false);
    expect((await paid(token, { amount: 120000 })).status).toBe(201);
  });

  it('only a signed-in receiver can reject', async () => {
    await seedLan();
    const owner = await headersFor(OWNER, 'Nhan');
    const token = await tokenFor(owner, 'p:g-lan');
    await view(token);
    const { settlementId } = await json<{ settlementId: string }>(paid(token, { amount: 120000 }));
    expect((await call(`/api/me/settlements/${settlementId}/reject`, { method: 'POST' })).status).toBe(401);
    const stranger = await headersFor(U.an, 'An');
    expect((await call(`/api/me/settlements/${settlementId}/reject`, { method: 'POST', headers: stranger })).status).toBe(404);
  });

  it('the guest cannot claim more than the current total', async () => {
    await seedLan();
    const owner = await headersFor(OWNER, 'Nhan');
    const token = await tokenFor(owner, 'p:g-lan');
    await view(token);
    expect((await paid(token, { amount: 120001 })).status).toBe(422);
    expect((await paid(token, { amount: 240000 })).status).toBe(422);
    expect(await payments()).toHaveLength(0);
    expect((await paid(token, { amount: 50000 })).status).toBe(201);
  });
});

describe('no self-confirm (I4)', () => {
  it('Minh cannot confirm or reject his own "I\'ve paid", even though its offset part pays him', async () => {
    await seedMinhBothWays();
    const owner = await headersFor(OWNER, 'Nhan');
    const token = await tokenFor(owner, `u:${U.minh}`);
    const v = await view(token);
    expect(v.total).toBe(270);

    const res = await paid(token, { amount: 270 });
    expect(res.status).toBe(201);
    const { settlementId } = await json<{ settlementId: string }>(res);
    const rows = await payments();
    expect(rows.map((r) => [r.trip_id, r.payer_id, r.to_id, r.amount, r.status])).toEqual([
      ['t-bad', 'bad-o', 'bad-m', 100, 'says_paid'],
      ['t-led', 'led-m', 'led-o', 370, 'says_paid'],
    ]);

    const minh = await headersFor(U.minh, 'Minh');
    expect((await call(`/api/me/settlements/${settlementId}/confirm`, { method: 'POST', headers: minh })).status).toBe(403);
    expect((await call(`/api/me/settlements/${settlementId}/reject`, { method: 'POST', headers: minh })).status).toBe(403);
    expect((await payments()).every((r) => r.status === 'says_paid')).toBe(true);

    // Minh's own People view offers him nothing to confirm.
    const nhan = (await summary(minh)).find((p) => p.key === `u:${OWNER}`);
    expect(nhan?.waiting ?? []).toEqual([]);

    expect((await call(`/api/me/settlements/${settlementId}/confirm`, { method: 'POST', headers: owner })).status).toBe(204);
    expect((await payments()).every((r) => r.status === 'confirmed')).toBe(true);
  });
});

describe('confirming after a group was archived (M2)', () => {
  it('confirms every waiting part, the archived group included', async () => {
    await seedMinhBothWays();
    const owner = await headersFor(OWNER, 'Nhan');
    const token = await tokenFor(owner, `u:${U.minh}`);
    await view(token);
    const { settlementId } = await json<{ settlementId: string }>(paid(token, { amount: 270 }));
    await run("UPDATE trips SET archived_at = ? WHERE id = 't-bad'", NOW);

    expect((await call(`/api/me/settlements/${settlementId}/confirm`, { method: 'POST', headers: owner })).status).toBe(204);
    expect((await payments()).map((r) => r.status)).toEqual(['confirmed', 'confirmed']);
    expect((await summary(owner)).find((p) => p.key === `u:${U.minh}`)).toBeUndefined();
  });
});

describe('the offset part is labelled (M3)', () => {
  it('the group shows its part as settled through the People total', async () => {
    await seedMinhBothWays();
    const owner = await headersFor(OWNER, 'Nhan');
    const res = await call(`/api/me/people/u%3A${U.minh}/settle`, { method: 'POST', headers: owner, body: JSON.stringify({ paid: 270, direction: 'toOwner' }) });
    expect(res.status).toBe(201);
    const bad = await json<TripView>(call('/api/trips/t-bad', { headers: owner }));
    expect(bad.payments).toHaveLength(1);
    expect(bad.payments[0]!.throughPeople).toBe(true);
    const led = await json<TripView>(call('/api/trips/t-led', { headers: owner }));
    expect(led.payments[0]!.throughPeople).toBeUndefined();
  });
});

describe('"I\'ve paid" query budget (M1)', () => {
  function counting() {
    let statements = 0;
    const db = new Proxy(env.DB, {
      get(target, prop) {
        if (prop === 'prepare') return (q: string) => { statements += 1; return target.prepare(q); };
        const value = Reflect.get(target, prop) as unknown;
        return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
      },
    });
    return { db, count: () => statements };
  }

  async function seedGroups(n: number) {
    await seedUser(OWNER, 'Nhan');
    await seedUser(U.minh, 'Minh');
    for (let i = 0; i < n; i++) {
      const t = `t-${String(i).padStart(2, '0')}`;
      await addTrip(t, `Group ${i}`);
      await addPerson(t, `${t}-o`, 'Nhan', OWNER, 0);
      await addPerson(t, `${t}-m`, 'Minh', U.minh, 1);
      await addExpense(t, `${t}-e`, `${t}-o`, 20, [`${t}-o`, `${t}-m`]);
    }
  }

  it('a pair open in 25 groups settles in one invocation under 50 statements', async () => {
    await seedGroups(25);
    const owner = await headersFor(OWNER, 'Nhan');
    const token = await tokenFor(owner, `u:${U.minh}`);
    expect((await view(token)).total).toBe(250);

    const { db, count } = counting();
    const res = await app.request(`/api/r/${token}/paid`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: 250, idempotencyKey: KEY_A }) }, { ...env, DB: db });
    expect(res.status).toBe(201);
    expect(count()).toBeLessThan(50);
    expect(await payments()).toHaveLength(25);
  }, 60_000);

  it('a pair open in 40 groups is refused cleanly instead of failing half way', async () => {
    await seedGroups(40);
    const owner = await headersFor(OWNER, 'Nhan');
    const token = await tokenFor(owner, `u:${U.minh}`);
    expect((await view(token)).total).toBe(400);

    const { db, count } = counting();
    const res = await app.request(`/api/r/${token}/paid`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: 400 }) }, { ...env, DB: db });
    expect(res.status).toBe(422);
    expect(count()).toBeLessThan(50);
    expect(await payments()).toHaveLength(0);
  }, 60_000);
});

describe('Settle up when the owner owes (I3)', () => {
  /** The owner owes Minh 300 in badminton; Minh owes the owner 100 in quick expenses: net, the owner owes 200. */
  async function seedOwnerOwes() {
    await seedUser(OWNER, 'Nhan');
    await seedUser(U.minh, 'Minh');
    await addTrip('t-led', 'Nhan', 'direct');
    await addPerson('t-led', 'led-o', 'Nhan', OWNER, 0);
    await addPerson('t-led', 'led-m', 'Minh', U.minh, 1);
    await addExpense('t-led', 'e-led', 'led-o', 200, ['led-o', 'led-m'], '2026-10-01T00:00:00.000Z');
    await addTrip('t-bad', 'Badminton');
    await addPerson('t-bad', 'bad-o', 'Nhan', OWNER, 0);
    await addPerson('t-bad', 'bad-m', 'Minh', U.minh, 1);
    await addExpense('t-bad', 'e-bad', 'bad-m', 600, ['bad-o', 'bad-m'], '2026-10-02T00:00:00.000Z');
  }

  it("shows Minh's VietQR for the netted 200, and \"I've paid them\" settles both groups", async () => {
    await seedOwnerOwes();
    await run("INSERT INTO bank_details (id, user_id, bin, account_number, holder_name, status, consent_at, created_at) VALUES ('b-m', ?, '970407', '19031234565678', 'NGUYEN MINH', 'approved', ?, ?)", U.minh, NOW, NOW);
    const owner = await headersFor(OWNER, 'Nhan');
    await summary(owner);

    const res = await call(`/api/me/people/u%3A${U.minh}/pay`, { headers: owner });
    expect(res.status).toBe(200);
    const info = await json<{ amount: number; bankState: string; payload: string | null; to: { id: string; name: string }; refCode: string }>(res);
    expect(info).toMatchObject({ amount: 200, bankState: 'ok', to: { id: 'bad-m', name: 'Minh' } });
    expect(info.payload).toContain('19031234565678');
    expect(info.refCode).not.toBe('');

    const settle = await call(`/api/me/people/u%3A${U.minh}/settle`, { method: 'POST', headers: owner, body: JSON.stringify({ paid: 200, direction: 'fromOwner', idempotencyKey: KEY_A }) });
    expect(settle.status).toBe(201);
    expect((await payments()).map((r) => [r.trip_id, r.payer_id, r.to_id, r.amount])).toEqual([
      ['t-bad', 'bad-o', 'bad-m', 300],
      ['t-led', 'led-m', 'led-o', 100],
    ]);
    expect((await summary(owner)).find((p) => p.key === `u:${U.minh}`)).toBeUndefined();
  });

  it('without bank details: the amount but no QR; nothing owed: amount 0', async () => {
    await seedOwnerOwes();
    const owner = await headersFor(OWNER, 'Nhan');
    await summary(owner);
    const info = await json<{ amount: number; bankState: string; payload: string | null }>(call(`/api/me/people/u%3A${U.minh}/pay`, { headers: owner }));
    expect(info).toMatchObject({ amount: 200, bankState: 'none', payload: null });

    await seedLan();
    const lan = await json<{ amount: number; payload: string | null }>(call('/api/me/people/p%3Ag-lan/pay', { headers: owner }));
    expect(lan).toMatchObject({ amount: 0, payload: null });
    expect((await call('/api/me/people/p%3Anobody/pay', { headers: owner })).status).toBe(404);
    expect((await call(`/api/me/people/u%3A${U.minh}/pay`)).status).toBe(401);
  });
});
