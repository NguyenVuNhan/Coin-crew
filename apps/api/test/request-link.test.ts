import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import type { RequestView } from '@fsl/core';
import { app, call, json, memberSid, newDevice, seedUser, U } from './helpers';
import { INDEX_HTML } from './fixtures/indexHtml';

const OWNER = 'u-owner';
const NOW = '2026-10-20T00:00:00.000Z';

async function run(query: string, ...binds: unknown[]) {
  await env.DB.prepare(query).bind(...binds).run();
}

async function addTrip(id: string, name: string, preset: 'trip' | 'direct' = 'trip', lang: 'vi' | 'en' = 'vi') {
  await run(
    "INSERT INTO trips (id, name, preset, currency, fewest_transfers, default_lang, organiser_user_id, group_token, view_token, version, created_at) VALUES (?, ?, ?, 'VND', 1, ?, ?, ?, ?, 0, ?)",
    id, name, preset, lang, OWNER, `g-${id}`, `v-${id}`, NOW,
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

/** Lan (a guest) owes Nhan 120.000₫ in one group; Hoa, in the same group, owes 50.000₫. */
async function seedLan() {
  await seedUser(OWNER, 'Nhan');
  await addTrip('t-g', 'Hội An');
  await addPerson('t-g', 'g-o', 'Nhan', OWNER, 0);
  await addPerson('t-g', 'g-lan', 'Lan', null, 1);
  await addPerson('t-g', 'g-hoa', 'Hoa', null, 2);
  await addExpense('t-g', 'e-lan', 'g-o', 240000, ['g-o', 'g-lan']);
  await addExpense('t-g', 'e-hoa', 'g-o', 100000, ['g-o', 'g-hoa']);
}

/** Minh (an account) owes Nhan in three places: 100.000 + 50.000 + 120.000 = 270.000₫. */
async function seedMinh() {
  await seedUser(OWNER, 'Nhan');
  await seedUser(U.minh, 'Minh');
  for (const [i, t] of ['t-a', 't-b', 't-c'].entries()) {
    await addTrip(t, `Group ${t}`);
    await addPerson(t, `${t}-o`, 'Nhan', OWNER, 0);
    await addPerson(t, `${t}-m`, 'Minh', U.minh, 1);
    await addExpense(t, `e-${t}`, `${t}-o`, [200000, 100000, 240000][i]!, [`${t}-o`, `${t}-m`], `2026-10-0${i + 1}T00:00:00.000Z`);
  }
}

let ownerSid: string | null = null;
async function auth(): Promise<Record<string, string>> {
  ownerSid ??= await memberSid(OWNER, 'Nhan');
  return { Cookie: `sid=${ownerSid}`, 'Content-Type': 'application/json' };
}

async function requestLink(key: string): Promise<Response> {
  return call(`/api/me/people/${encodeURIComponent(key)}/request-link`, { method: 'POST', headers: await auth() });
}

async function tokenFor(key: string): Promise<string> {
  const res = await requestLink(key);
  expect(res.status).toBe(200);
  const { url } = await json<{ url: string }>(res);
  return url.split('/r/')[1]!;
}

async function view(token: string, headers: Record<string, string> = {}): Promise<Response> {
  // Cold groups: the API answers TRY_AGAIN (and warms caches) rather than show a partial total.
  let res = await call(`/api/r/${token}`, { headers });
  for (let i = 0; i < 5 && res.status === 409; i++) {
    expect((await json<{ error: { code: string } }>(res)).error.code).toBe('TRY_AGAIN');
    res = await call(`/api/r/${token}`, { headers });
  }
  return res;
}

async function paid(token: string, amount: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return call(`/api/r/${token}/paid`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ amount }) });
}

async function ogTitle(path: string): Promise<string | null> {
  const assets = { fetch: async () => new Response(INDEX_HTML, { headers: { 'content-type': 'text/html' } }) };
  const res = await app.request(path, {}, { ...env, ASSETS: assets } as unknown as typeof env);
  const html = await res.text();
  const m = html.match(/<meta property="og:title" content="([^"]*)"/);
  return m ? m[1]! : null;
}

describe('request links', () => {
  it('gives a stable, unguessable link and a ledger row for the person', async () => {
    ownerSid = null;
    await seedLan();
    const first = await requestLink('p:g-lan');
    expect(first.status).toBe(200);
    const { url } = await json<{ url: string }>(first);
    expect(url).toMatch(/^http:\/\/localhost:8787\/r\/[A-Za-z0-9_-]{32,}$/);

    const again = await json<{ url: string }>(await requestLink('p:g-lan'));
    expect(again.url).toBe(url);

    const link = await env.DB.prepare('SELECT person_pid FROM person_links WHERE owner_user_id = ? AND participant_id = ?').bind(OWNER, 'g-lan').first<{ person_pid: string }>();
    expect(link).not.toBeNull();
    const row = await env.DB.prepare('SELECT request_token FROM participants WHERE id = ?').bind(link!.person_pid).first<{ request_token: string }>();
    expect(url.endsWith(`/r/${row!.request_token}`)).toBe(true);
  });

  it('needs a signed-in owner and someone they know', async () => {
    ownerSid = null;
    await seedLan();
    expect((await call('/api/me/people/p%3Ag-lan/request-link', { method: 'POST' })).status).toBe(401);
    expect((await requestLink('p:nobody')).status).toBe(404);
    expect((await requestLink(`u:${OWNER}`)).status).toBe(404);
  });

  it('unknown token is 404', async () => {
    expect((await view('A'.repeat(43))).status).toBe(404);
    expect((await paid('A'.repeat(43), 1000)).status).toBe(404);
  });

  it('one item: the person sees what they owe, and nobody else', async () => {
    ownerSid = null;
    await seedLan();
    const token = await tokenFor('p:g-lan');
    const res = await view(token);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain('Hoa');
    const body = JSON.parse(text) as RequestView;
    expect(body.ownerName).toBe('Nhan');
    expect(body.total).toBe(120000);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.amount).toBe(120000);
    expect(body.settled).toBe(false);
    expect(body.settlementWaiting).toBe(false);
    expect(body.pay).toBeNull();
  });

  it('several items add up across groups', async () => {
    ownerSid = null;
    await seedMinh();
    const token = await tokenFor(`u:${U.minh}`);
    const body = await json<RequestView>(view(token));
    expect(body.items).toHaveLength(3);
    expect(body.total).toBe(270000);
  });

  it('a settled person sees settled with total 0', async () => {
    ownerSid = null;
    await seedLan();
    await addPerson('t-g', 'g-tu', 'Tú', null, 3);
    const token = await tokenFor('p:g-tu');
    const body = await json<RequestView>(view(token));
    expect(body).toMatchObject({ settled: true, total: 0, items: [], settlementWaiting: false });
  });

  it("the owner's approved bank details become a VietQR", async () => {
    ownerSid = null;
    await seedLan();
    await run("INSERT INTO bank_details (id, user_id, bin, account_number, holder_name, status, consent_at, created_at) VALUES ('b-o', ?, '970407', '19031234565678', 'NGUYEN NHAN', 'approved', ?, ?)", OWNER, NOW, NOW);
    const token = await tokenFor('p:g-lan');
    const body = await json<RequestView>(view(token));
    expect(body.pay).not.toBeNull();
    expect(body.pay!.bankState).toBe('ok');
    expect(body.pay!.amount).toBe(120000);
    expect(body.pay!.to.name).toBe('Nhan');
    expect(body.pay!.payload).toContain('19031234565678');
  });

  it('binds the viewing device to the ledger person', async () => {
    ownerSid = null;
    await seedLan();
    const token = await tokenFor('p:g-lan');
    const { deviceId, cookie } = await newDevice();
    expect((await view(token, { Cookie: cookie })).status).toBe(200);
    const { sha256Hex } = await import('../src/lib/ids');
    const row = await env.DB.prepare('SELECT dp.participant_id AS pid FROM device_participants dp JOIN participants p ON p.id = dp.participant_id WHERE dp.device_hash = ? AND p.request_token = ?')
      .bind(await sha256Hex(deviceId), token).first<{ pid: string }>();
    expect(row).not.toBeNull();
  });

  it('"I\'ve paid" waits for the owner, refuses a second one, and the owner confirms it', async () => {
    ownerSid = null;
    await seedLan();
    const token = await tokenFor('p:g-lan');

    expect((await paid(token, 0)).status).toBe(422);
    expect((await paid(token, 1200001)).status).toBe(422);
    expect((await paid(token, 'x')).status).toBe(422);

    const res = await paid(token, 120000);
    expect(res.status).toBe(201);
    const { settlementId, status } = await json<{ settlementId: string; status: string }>(res);
    expect(status).toBe('says_paid');

    const waiting = await json<RequestView>(view(token));
    expect(waiting.settlementWaiting).toBe(true);
    expect(waiting.settled).toBe(false);

    const second = await paid(token, 120000);
    expect(second.status).toBe(409);
    expect((await json<{ error: { code: string } }>(second)).error.code).toBe('ALREADY_WAITING');

    const confirm = await call(`/api/me/settlements/${settlementId}/confirm`, { method: 'POST', headers: await auth() });
    expect(confirm.status).toBe(204);

    const done = await json<RequestView>(view(token));
    expect(done).toMatchObject({ settled: true, total: 0, settlementWaiting: false });
  });

  it('link preview names the owner and the amount, in the ledger language', async () => {
    ownerSid = null;
    await seedLan();
    const lan = await tokenFor('p:g-lan');
    expect(await ogTitle(`/r/${lan}`)).toBe('Nhan nhờ bạn trả 120.000₫');

    await run("UPDATE trips SET default_lang = 'en' WHERE preset = 'direct'");
    expect(await ogTitle(`/r/${lan}`)).toBe('Nhan asked you for 120.000₫');

    await seedMinh();
    const minh = await tokenFor(`u:${U.minh}`);
    expect((await view(minh)).status).toBe(200); // a cold preview falls back to the app card
    expect(await ogTitle(`/r/${minh}`)).toBe('You owe Nhan 270.000₫');

    expect(await ogTitle(`/r/${'A'.repeat(43)}`)).toBe('CoinCrew (Tiền Đâu)');
  });
});
