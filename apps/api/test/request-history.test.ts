import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import type { RequestView } from '@cc/core';
import { call, json, memberSid, seedUser } from './helpers';

const OWNER = 'u-owner';
const NOW = '2026-10-20T00:00:00.000Z';

async function run(query: string, ...binds: unknown[]) {
  await env.DB.prepare(query).bind(...binds).run();
}

async function addTrip(id: string, name: string) {
  await run(
    "INSERT INTO trips (id, name, preset, currency, fewest_transfers, default_lang, organiser_user_id, group_token, view_token, version, created_at) VALUES (?, ?, 'trip', 'VND', 1, 'vi', ?, ?, ?, 0, ?)",
    id, name, OWNER, `g-${id}`, `v-${id}`, NOW,
  );
}

async function addPerson(tripId: string, id: string, name: string, userId: string | null, sort = 0) {
  await run(
    "INSERT INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)",
    id, tripId, name, name.toLowerCase(), userId, sort, NOW,
  );
}

/** Shares are given per participant, so a test can split unevenly. */
async function addExpense(tripId: string, id: string, description: string, payer: string, shares: Record<string, number>, createdAt = NOW) {
  const amount = Object.values(shares).reduce((a, b) => a + b, 0);
  await run(
    "INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, currency, spent_on, payer_id, split_mode, status, created_by_participant_id, created_at, updated_at) VALUES (?, ?, NULL, 1, ?, 'expense', ?, ?, 'VND', ?, ?, 'exact', 'approved', ?, ?, ?)",
    id, id, tripId, description, amount, createdAt.slice(0, 10), payer, payer, createdAt, createdAt,
  );
  for (const [pid, share] of Object.entries(shares)) {
    await run('INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES (?, ?, ?, ?)', id, pid, share, share);
  }
  await run('UPDATE trips SET version = version + 1 WHERE id = ?', tripId);
}

let ownerSid: string | null = null;
async function auth(): Promise<Record<string, string>> {
  ownerSid ??= await memberSid(OWNER, 'Nhan');
  return { Cookie: `sid=${ownerSid}`, 'Content-Type': 'application/json' };
}

async function tokenFor(key: string): Promise<string> {
  const res = await call(`/api/me/people/${encodeURIComponent(key)}/request-link`, { method: 'POST', headers: await auth() });
  expect(res.status).toBe(200);
  const { url } = await json<{ url: string }>(res);
  return url.split('/r/')[1]!;
}

/** Anonymous: no cookie. Retries TRY_AGAIN while cold groups warm. */
async function view(token: string): Promise<Response> {
  let res = await call(`/api/r/${token}`);
  for (let i = 0; i < 5 && res.status === 409; i++) {
    expect((await json<{ error: { code: string } }>(res)).error.code).toBe('TRY_AGAIN');
    res = await call(`/api/r/${token}`);
  }
  return res;
}

/** The owner's ledger trip and both pids in it, once the request link made Lan's row. */
async function ledgerOf(token: string): Promise<{ tripId: string; ownerPid: string; personPid: string }> {
  const row = await env.DB.prepare('SELECT id, trip_id FROM participants WHERE request_token = ?').bind(token).first<{ id: string; trip_id: string }>();
  const owner = await env.DB.prepare('SELECT id FROM participants WHERE trip_id = ? AND user_id = ?').bind(row!.trip_id, OWNER).first<{ id: string }>();
  return { tripId: row!.trip_id, ownerPid: owner!.id, personPid: row!.id };
}

/**
 * Group "Hội An" (fewest transfers): Nhan paid 200.000 for Lan; Lan paid 100.000 for Hoa.
 * Two-way Nhan↔Lan is 200.000, but the group routes Hoa's 100.000 straight to Nhan, so Lan pays 100.000.
 */
async function seedGroup() {
  await seedUser(OWNER, 'Nhan');
  await addTrip('t-g', 'Hội An');
  await addPerson('t-g', 'g-o', 'Nhan', OWNER, 0);
  await addPerson('t-g', 'g-lan', 'Lan', null, 1);
  await addPerson('t-g', 'g-hoa', 'Hoa', null, 2);
  await addExpense('t-g', 'e-dinner', 'Dinner', 'g-o', { 'g-lan': 200000 }, '2026-10-01T00:00:00.000Z');
  await addExpense('t-g', 'e-hoa', 'Hoa coffee', 'g-lan', { 'g-hoa': 100000 }, '2026-10-02T00:00:00.000Z');
}

describe('request page history', () => {
  it('GET /api/r/:token → each item has lines; a quick-expense item lists its open expenses newest first', async () => {
    ownerSid = null;
    await seedGroup();
    const token = await tokenFor('p:g-lan');
    const ledger = await ledgerOf(token);
    await addExpense(ledger.tripId, 'q-lunch', 'Lunch', ledger.ownerPid, { [ledger.ownerPid]: 50000, [ledger.personPid]: 50000 }, '2026-10-05T00:00:00.000Z');
    await addExpense(ledger.tripId, 'q-taxi', 'Taxi', ledger.ownerPid, { [ledger.personPid]: 30000 }, '2026-10-07T00:00:00.000Z');

    const res = await view(token);
    expect(res.status).toBe(200);
    const body = await json<RequestView>(res);
    expect(body.items.length).toBe(2);
    // This server always sends both fields (they are optional only for older servers).
    for (const item of body.items) {
      expect(Array.isArray(item.lines)).toBe(true);
      expect(item).toHaveProperty('gap');
    }

    const quick = body.items.find((i) => i.kind === 'direct')!;
    expect(quick.amount).toBe(80000);
    expect(quick.lines!.map((l) => l.title)).toEqual(['Taxi', 'Lunch']);
    expect(quick.lines!.map((l) => l.effect)).toEqual([30000, 50000]);
    expect(quick.gap).toBeNull();

    const group = body.items.find((i) => i.kind === 'group')!;
    expect(group.lines!.map((l) => l.title)).toEqual(['Dinner']);
  });

  it("group item from a fewest-transfers group carries gap.kind 'reroute'", async () => {
    ownerSid = null;
    await seedGroup();
    const token = await tokenFor('p:g-lan');
    const text = await (await view(token)).text();
    // One transfer (Hoa → Nhan) explains it, but the public page never names Hoa's id.
    expect(text).not.toContain('g-hoa');
    const body = JSON.parse(text) as RequestView;
    const group = body.items.find((i) => i.tripId === 't-g')!;
    expect(group.amount).toBe(100000);
    expect(group.gap?.kind).toBe('reroute');
    expect(group.gap).toMatchObject({ kind: 'reroute', difference: -100000, viaPid: null });
    // Lan's coffee for Hoa involves Nhan in no way: not a line.
    expect(group.lines!.map((l) => l.id)).toEqual(['e-dinner']);
  });

  it("anonymous GET: JSON contains no participant id other than owner/person pids and no third person's share", async () => {
    ownerSid = null;
    await seedGroup();
    // Hoa also shares Dinner with Lan; her 65.000 share must not reach the page.
    await addExpense('t-g', 'e-shared', 'Boat', 'g-o', { 'g-lan': 40000, 'g-hoa': 65000 }, '2026-10-03T00:00:00.000Z');
    const token = await tokenFor('p:g-lan');
    const res = await view(token);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain('g-hoa');
    expect(text).not.toContain('Hoa');
    expect(text).not.toContain('65000');
    const body = JSON.parse(text) as RequestView;
    const boat = body.items.find((i) => i.tripId === 't-g')!.lines!.find((l) => l.id === 'e-shared')!;
    expect(boat.otherShare).toBe(40000);
    expect(boat.ownerShare).toBe(0);
    // A reroute through Hoa is explained without naming her.
    const group = body.items.find((i) => i.tripId === 't-g')!;
    if (group.gap?.kind === 'reroute') expect(group.gap.viaPid).toBeNull();
  });
});
