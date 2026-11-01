import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import type { PeopleSummaryResponse, TripView } from '@fsl/core';
import { call, json, memberSid, newDevice, seedUser, U } from './helpers';

const OWNER = 'u-owner';
const NOW = '2026-10-20T00:00:00.000Z';

async function run(query: string, ...binds: unknown[]) {
  await env.DB.prepare(query).bind(...binds).run();
}

async function addTrip(id: string, name: string, preset: 'trip' | 'direct') {
  await run(
    "INSERT INTO trips (id, name, preset, currency, fewest_transfers, organiser_user_id, group_token, view_token, version, created_at) VALUES (?, ?, ?, 'VND', 0, ?, ?, ?, 0, ?)",
    id, name, preset, OWNER, `g-${id}-${'x'.repeat(24)}`, `v-${id}-${'x'.repeat(24)}`, NOW,
  );
}

async function addPerson(tripId: string, id: string, name: string, userId: string | null, sort: number) {
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

/**
 * The owner's ledger holds Minh (signed in) and Lan (a guest): Minh owes the owner 100, and the owner
 * recorded "Minh paid for Lan" (Lan owes Minh 50 there). In a shared group the owner owes Minh 30.
 */
async function seed() {
  await seedUser(OWNER, 'Nhan');
  await seedUser(U.minh, 'Minh');
  await addTrip('t-led', 'Nhan', 'direct');
  await addPerson('t-led', 'led-o', 'Nhan', OWNER, 0);
  await addPerson('t-led', 'led-m', 'Minh', U.minh, 1);
  await addPerson('t-led', 'led-lan', 'Lan', null, 2);
  await addExpense('t-led', 'e-led', 'led-o', 200, ['led-o', 'led-m']);
  await addExpense('t-led', 'e-lan', 'led-m', 100, ['led-m', 'led-lan']);

  await addTrip('t-g', 'Badminton', 'trip');
  await addPerson('t-g', 'g-o', 'Nhan', OWNER, 0);
  await addPerson('t-g', 'g-m', 'Minh', U.minh, 1);
  await addExpense('t-g', 'e-g', 'g-m', 60, ['g-o', 'g-m']);
}

async function headersFor(userId: string, name: string): Promise<Record<string, string>> {
  return { Cookie: `sid=${await memberSid(userId, name)}`, 'Content-Type': 'application/json' };
}

describe("someone else's personal ledger", () => {
  it('a signed-in contact cannot read it, write to it, or get its links', async () => {
    await seed();
    const minh = await headersFor(U.minh, 'Minh');

    expect((await call('/api/trips/t-led', { headers: minh })).status).toBe(403);
    expect((await call('/api/trips/t-led/activity', { headers: minh })).status).toBe(403);
    const expense = await call('/api/trips/t-led/expenses', {
      method: 'POST',
      headers: minh,
      body: JSON.stringify({ description: 'Taxi', amount: 100, spentOn: '2026-10-20', payerId: 'led-m', mode: 'equal', entries: [{ participantId: 'led-m', value: 1 }, { participantId: 'led-o', value: 1 }] }),
    });
    expect(expense.status).toBe(403);
    const rename = await call('/api/trips/t-led/people/led-lan', { method: 'PATCH', headers: minh, body: JSON.stringify({ name: 'Lan B' }) });
    expect(rename.status).toBe(403);
    const regenerate = await call('/api/trips/t-led/links/regenerate', { method: 'POST', headers: minh, body: JSON.stringify({ which: 'group' }) });
    expect(regenerate.status).toBe(403);
    const payment = await call('/api/trips/t-led/payments', { method: 'POST', headers: minh, body: JSON.stringify({ fromId: 'led-m', toId: 'led-o', amount: 10 }) });
    expect(payment.status).toBe(403);

    const count = await env.DB.prepare("SELECT count(*) AS n FROM transactions WHERE trip_id = 't-led'").first<{ n: number }>();
    expect(count?.n).toBe(2);
  });

  it("the ledger's own tokens open nothing", async () => {
    await seed();
    const trip = await env.DB.prepare("SELECT group_token, view_token FROM trips WHERE id = 't-led'").first<{ group_token: string; view_token: string }>();
    const { cookie } = await newDevice();
    for (const token of [trip!.group_token, trip!.view_token]) {
      expect((await call('/api/trips/t-led', { headers: { Cookie: cookie, 'X-Link-Token': token } })).status).toBe(403);
      expect((await call(`/api/links/${token}`)).status).toBe(410);
    }
  });

  it('the owner still reads and writes it', async () => {
    await seed();
    const owner = await headersFor(OWNER, 'Nhan');
    const res = await call('/api/trips/t-led', { headers: owner });
    expect(res.status).toBe(200);
    const view = await json<TripView>(res);
    expect(view.links).not.toBeNull();
    const payment = await call('/api/trips/t-led/payments', { method: 'POST', headers: owner, body: JSON.stringify({ fromId: 'led-m', toId: 'led-o', amount: 10 }) });
    expect(payment.status).toBe(201);
  });

  it("the contact's People summary still nets with the owner, and shows none of the owner's other contacts", async () => {
    await seed();
    const minh = await headersFor(U.minh, 'Minh');
    let body: PeopleSummaryResponse | null = null;
    for (let i = 0; i < 5 && (body === null || body.incomplete); i++) {
      body = await json<PeopleSummaryResponse>(call('/api/me/people/summary', { headers: minh }));
    }
    expect(body!.incomplete).toBe(false);
    expect(body!.people.map((p) => p.key)).toEqual([`u:${OWNER}`]);
    // Minh owes the owner 100 in the ledger; the owner owes Minh 30 in the group.
    expect(body!.people[0]!.total).toBe(-70);
  });

  it("the contact cannot pull the owner's other contacts into their own ledger", async () => {
    await seed();
    const minh = await headersFor(U.minh, 'Minh');
    expect((await call('/api/me/people/p%3Aled-lan/request-link', { method: 'POST', headers: minh })).status).toBe(404);
    expect((await call('/api/me/ledger/people', { method: 'POST', headers: minh, body: JSON.stringify({ participantId: 'led-lan' }) })).status).toBe(403);
    const settle = await call('/api/me/people/p%3Aled-lan/settle', { method: 'POST', headers: minh, body: JSON.stringify({ paid: 50, direction: 'toOwner' }) });
    expect(settle.status).toBe(404);
  });
});
