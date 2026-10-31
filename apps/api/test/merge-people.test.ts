import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import type { PeopleSummaryResponse, RequestView } from '@fsl/core';
import { call, json, memberSid, seedUser } from './helpers';

const OWNER = 'u-owner';
const NOW = '2026-10-20T00:00:00.000Z';
const TOKEN = 'T'.repeat(43);

async function run(query: string, ...binds: unknown[]) {
  await env.DB.prepare(query).bind(...binds).run();
}

async function addTrip(id: string, name: string, preset: 'trip' | 'direct') {
  await run(
    "INSERT INTO trips (id, name, preset, currency, fewest_transfers, organiser_user_id, group_token, view_token, version, created_at) VALUES (?, ?, ?, 'VND', 1, ?, ?, ?, 0, ?)",
    id, name, preset, OWNER, `g-${id}`, `v-${id}`, NOW,
  );
}

async function addPerson(tripId: string, id: string, name: string, userId: string | null, sort: number, token: string | null = null) {
  await run(
    "INSERT INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at, request_token) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)",
    id, tripId, name, name.toLowerCase(), userId, sort, NOW, token,
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
 * Group guest G owes the owner 100 in Hội An and is linked to ledger row L1 (with a nickname and a
 * request link). L2 is the same person typed again in the ledger.
 */
async function seed() {
  await seedUser(OWNER, 'Nhan');
  await addTrip('t-g', 'Hội An', 'trip');
  await addPerson('t-g', 'g-o', 'Nhan', OWNER, 0);
  await addPerson('t-g', 'g-giang', 'Giang', null, 1);
  await addExpense('t-g', 'e-g', 'g-o', 200, ['g-o', 'g-giang']);

  await addTrip('t-led', 'Nhan', 'direct');
  await addPerson('t-led', 'led-o', 'Nhan', OWNER, 0);
  await addPerson('t-led', 'l1', 'Giang', null, 1, TOKEN);
  await addPerson('t-led', 'l2', 'Giang Tran', null, 2);
  await run('INSERT INTO person_links (owner_user_id, participant_id, person_pid, created_at) VALUES (?, ?, ?, ?)', OWNER, 'g-giang', 'l1', NOW);
  await run('INSERT INTO nicknames (owner_user_id, person_key, nickname, updated_at) VALUES (?, ?, ?, ?)', OWNER, 'p:l1', 'chị Giang', NOW);
}

async function owner(): Promise<Record<string, string>> {
  return { Cookie: `sid=${await memberSid(OWNER, 'Nhan')}`, 'Content-Type': 'application/json' };
}

async function merge(tripId: string, fromId: string, intoId: string): Promise<Response> {
  return call(`/api/trips/${tripId}/people/merge`, { method: 'POST', headers: await owner(), body: JSON.stringify({ fromId, intoId }) });
}

describe('merging people the People view knows about (I5)', () => {
  it('moves the link, the nickname and the request link to the survivor, and logs them', async () => {
    await seed();
    expect((await merge('t-led', 'l1', 'l2')).status).toBe(204);

    const link = await env.DB.prepare("SELECT person_pid FROM person_links WHERE participant_id = 'g-giang'").first<{ person_pid: string }>();
    expect(link?.person_pid).toBe('l2');
    const nicks = await env.DB.prepare('SELECT person_key, nickname FROM nicknames').all<{ person_key: string; nickname: string }>();
    expect(nicks.results).toEqual([{ person_key: 'p:l2', nickname: 'chị Giang' }]);
    const tokens = await env.DB.prepare("SELECT id, request_token FROM participants WHERE id IN ('l1', 'l2') ORDER BY id").all<{ id: string; request_token: string | null }>();
    expect(tokens.results).toEqual([{ id: 'l1', request_token: null }, { id: 'l2', request_token: TOKEN }]);

    const rows = await env.DB.prepare('SELECT table_name, before_json FROM participant_merge_rows').all<{ table_name: string; before_json: string }>();
    const tables = rows.results.map((r) => r.table_name);
    expect(tables).toEqual(expect.arrayContaining(['person_links', 'nicknames', 'participants']));
    const linkBefore = rows.results.find((r) => r.table_name === 'person_links')!;
    expect(JSON.parse(linkBefore.before_json)).toMatchObject({ participant_id: 'g-giang', person_pid: 'l1' });
    const l1Before = rows.results.find((r) => r.table_name === 'participants' && JSON.parse(r.before_json).id === 'l1')!;
    expect(JSON.parse(l1Before.before_json).request_token).toBe(TOKEN);

    // The old link still opens the pair, now through the survivor.
    let res = await call(`/api/r/${TOKEN}`);
    for (let i = 0; i < 5 && res.status === 409; i++) res = await call(`/api/r/${TOKEN}`);
    expect(res.status).toBe(200);
    expect((await json<RequestView>(res)).total).toBe(100);
  });

  it("the survivor's own request link wins", async () => {
    await seed();
    const other = 'U'.repeat(43);
    await run("UPDATE participants SET request_token = ? WHERE id = 'l2'", other);
    expect((await merge('t-led', 'l1', 'l2')).status).toBe(204);
    const tokens = await env.DB.prepare("SELECT id, request_token FROM participants WHERE id IN ('l1', 'l2') ORDER BY id").all<{ id: string; request_token: string | null }>();
    expect(tokens.results).toEqual([{ id: 'l1', request_token: TOKEN }, { id: 'l2', request_token: other }]);
  });

  it('a settlement after the merge lands on the survivor and shows in the total', async () => {
    await seed();
    expect((await merge('t-led', 'l1', 'l2')).status).toBe(204);

    // 50 more than owed: the remainder goes to the ledger, on the survivor.
    const res = await call('/api/me/people/p%3Ag-giang/settle', { method: 'POST', headers: await owner(), body: JSON.stringify({ paid: 150, direction: 'toOwner' }) });
    expect(res.status).toBe(201);
    const parts = await env.DB.prepare("SELECT trip_id, payer_id, amount FROM transactions WHERE type = 'payment' ORDER BY trip_id").all<{ trip_id: string; payer_id: string; amount: number }>();
    expect(parts.results).toEqual([
      { trip_id: 't-g', payer_id: 'g-giang', amount: 100 },
      { trip_id: 't-led', payer_id: 'l2', amount: 50 },
    ]);

    let body: PeopleSummaryResponse | null = null;
    for (let i = 0; i < 5 && (body === null || body.incomplete); i++) {
      body = await json<PeopleSummaryResponse>(call('/api/me/people/summary', { headers: await owner() }));
    }
    const giang = body!.people.find((p) => p.key === 'p:l2');
    expect(giang?.total).toBe(-50);
    expect(body!.people.some((p) => p.key === 'p:l1')).toBe(false);
  });

  it('merging a linked group guest moves its link to the survivor', async () => {
    await seed();
    await addPerson('t-g', 'g-giang2', 'Giang T', null, 2);
    expect((await merge('t-g', 'g-giang', 'g-giang2')).status).toBe(204);
    const links = await env.DB.prepare('SELECT participant_id, person_pid FROM person_links').all<{ participant_id: string; person_pid: string }>();
    expect(links.results).toEqual([{ participant_id: 'g-giang2', person_pid: 'l1' }]);
  });

  it('a link still pointing at a merged row settles onto its survivor', async () => {
    await seed();
    // An old link left pointing at the merged row (as before this fix) must not receive money.
    expect((await merge('t-led', 'l1', 'l2')).status).toBe(204);
    await run("UPDATE person_links SET person_pid = 'l1' WHERE participant_id = 'g-giang'");
    const res = await call('/api/me/people/p%3Ag-giang/settle', { method: 'POST', headers: await owner(), body: JSON.stringify({ paid: 150, direction: 'toOwner' }) });
    expect(res.status).toBe(201);
    const onMerged = await env.DB.prepare("SELECT count(*) AS n FROM transactions WHERE payer_id = 'l1' OR to_id = 'l1'").first<{ n: number }>();
    expect(onMerged?.n).toBe(0);
    const ledgerPart = await env.DB.prepare("SELECT payer_id FROM transactions WHERE type = 'payment' AND trip_id = 't-led'").first<{ payer_id: string }>();
    expect(ledgerPart?.payer_id).toBe('l2');
  });
});
