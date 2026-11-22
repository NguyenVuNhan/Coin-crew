import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { drizzle } from 'drizzle-orm/d1';
import { and, eq, lte, sql } from 'drizzle-orm';
import * as schema from '@cc/api-db/schema';
import type {
  HoldingsResponse,
  ListResponse,
  PersonalSummary,
  SyncResponse,
  WalletDetailsResponse,
} from '@cc/core';
import { app, call, json, memberSid, seedUser } from './helpers';

async function enablePersonal(userId: string) {
  await env.DB.prepare(
    "INSERT INTO user_personal_settings (user_id, enabled, updated_at) VALUES (?, 1, '2026-11-01T00:00:00.000Z') ON CONFLICT(user_id) DO UPDATE SET enabled = 1",
  )
    .bind(userId)
    .run();
}

function countingEnv() {
  const counter = { queries: 0, sqls: [] as string[] };
  const DB = new Proxy(env.DB, {
    get(target, prop) {
      if (prop === 'prepare') {
        return (q: string) => {
          counter.queries += 1;
          counter.sqls.push(q);
          return target.prepare(q);
        };
      }
      const value = Reflect.get(target, prop) as unknown;
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  });
  return { env: { ...env, DB }, counter };
}

async function postJson(sid: string, path: string, body: unknown, method = 'POST') {
  return call(path, {
    method,
    headers: { Cookie: `sid=${sid}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function getJson<T>(sid: string, path: string): Promise<T> {
  const res = await call(path, { headers: { Cookie: `sid=${sid}` } });
  expect(res.status).toBe(200);
  return json<T>(res);
}

async function seedComplexFixture(userId: string) {
  const sid = await memberSid(userId, 'Parity User');
  await enablePersonal(userId);
  await seedUser('u-peer', 'Peer');

  // 1. Wallets: default VND everyday, secondary VND everyday, USD everyday, VND investment
  const wDefRes = await postJson(sid, '/api/me/personal/wallets', {
    name: 'Cash VND',
    currency: 'VND',
    startAmount: 1_000_000,
    startDate: '2026-11-01',
  });
  expect(wDefRes.status).toBe(201);
  const wDefId = (await json<{ wallet: { id: string } }>(wDefRes)).wallet.id;

  const wSecRes = await postJson(sid, '/api/me/personal/wallets/add', {
    name: 'Bank VND',
    currency: 'VND',
    startAmount: 2_000_000,
    startDate: '2026-11-01',
  });
  expect(wSecRes.status).toBe(201);
  const wSecId = (await json<{ wallet: { id: string } }>(wSecRes)).wallet.id;

  const wUsdRes = await postJson(sid, '/api/me/personal/wallets/add', {
    name: 'USD Wallet',
    currency: 'USD',
    startAmount: 10000, // $100.00 in cents
    startDate: '2026-11-01',
    startCostVnd: 2_500_000,
  });
  expect(wUsdRes.status).toBe(201);
  const wUsdId = (await json<{ wallet: { id: string } }>(wUsdRes)).wallet.id;

  const wInvRes = await postJson(sid, '/api/me/personal/wallets/add', {
    name: 'Invest VND',
    currency: 'VND',
    kind: 'investment',
    startAmount: 5_000_000,
    startDate: '2026-11-01',
  });
  expect(wInvRes.status).toBe(201);
  const wInvId = (await json<{ wallet: { id: string } }>(wInvRes)).wallet.id;

  // Asset for investment wallet
  const assetRes = await postJson(sid, '/api/me/personal/assets', {
    name: 'Gold',
    unit: 'chỉ',
    groupName: 'Kim loại quý',
    decimals: 2,
  });
  expect(assetRes.status).toBe(201);
  const assetId = (await json<{ asset: { id: string } }>(assetRes)).asset.id;

  // Fetch starter categories for expense/income
  const catsRes = await getJson<{ categories: { id: string; type: string }[] }>(
    sid,
    '/api/me/personal/categories',
  );
  const expCatId = catsRes.categories.find((c) => c.type === 'expense')!.id;
  const incCatId = catsRes.categories.find((c) => c.type === 'income')!.id;

  // Personal transactions: expense, income, cross-currency transfer, buy, sell
  expect(
    (
      await postJson(sid, '/api/me/personal/transactions', {
        walletId: wDefId,
        type: 'expense',
        amount: 100_000,
        categoryId: expCatId,
        date: '2026-11-05',
        note: 'Coffee',
      })
    ).status,
  ).toBe(201);

  expect(
    (
      await postJson(sid, '/api/me/personal/transactions', {
        walletId: wSecId,
        type: 'income',
        amount: 500_000,
        categoryId: incCatId,
        date: '2026-11-06',
        note: 'Bonus',
      })
    ).status,
  ).toBe(201);

  // Cross-currency transfer: VND -> USD
  expect(
    (
      await postJson(sid, '/api/me/personal/transactions', {
        type: 'transfer',
        fromWalletId: wDefId,
        toWalletId: wUsdId,
        amountSent: 500_000,
        amountReceived: 2000, // $20.00
        date: '2026-11-07',
      })
    ).status,
  ).toBe(201);

  // Investment buy & partial sell
  expect(
    (
      await postJson(sid, '/api/me/personal/transactions', {
        walletId: wInvId,
        type: 'buy',
        amount: 2_000_000,
        assetId,
        quantity: 200, // 2.00 chỉ
        date: '2026-11-08',
      })
    ).status,
  ).toBe(201);

  expect(
    (
      await postJson(sid, '/api/me/personal/transactions', {
        walletId: wInvId,
        type: 'sell',
        amount: 1_200_000,
        assetId,
        quantity: 100, // 1.00 chỉ
        date: '2026-11-09',
      })
    ).status,
  ).toBe(201);

  // 2. Two trips: one active trip (t-active) and one archived trip (t-arch)
  await env.DB.prepare(
    `INSERT INTO trips (id, name, preset, currency, fewest_transfers, round_transfers, organiser_user_id, group_token, view_token, version, archived_at, created_at) VALUES
      ('t-active', 'Active Trip', 'trip', 'VND', 1, 0, ?, 'g-act', 'v-act', 1, NULL, '2026-11-01T00:00:00.000Z'),
      ('t-arch', 'Archived Trip', 'direct', 'VND', 1, 0, ?, 'g-arch', 'v-arch', 1, '2026-11-10T00:00:00.000Z', '2026-11-01T00:00:00.000Z')`,
  )
    .bind(userId, userId)
    .run();

  await env.DB.prepare(
    `INSERT INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at) VALUES
      ('p-me-act', 't-active', 'Me', 'me', ?, 'active', 0, '2026-11-01T00:00:00.000Z'),
      ('p-peer-act', 't-active', 'Peer', 'peer', 'u-peer', 'active', 1, '2026-11-01T00:00:00.000Z'),
      ('p-me-arch', 't-arch', 'Me', 'me', ?, 'active', 0, '2026-11-01T00:00:00.000Z'),
      ('p-peer-arch', 't-arch', 'Peer', 'peer', 'u-peer', 'active', 1, '2026-11-01T00:00:00.000Z')`,
  )
    .bind(userId, userId)
    .run();

  // Active trip: I paid 300k, split 150k/150k (unlinked -> goes to __default__)
  await env.DB.prepare(
    `INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, currency, spent_on, payer_id, split_mode, status, created_by_participant_id, created_at, updated_at) VALUES
      ('g-e1', 'g-e1', NULL, 1, 't-active', 'expense', 'Dinner', 300000, 'VND', '2026-11-10', 'p-me-act', 'equal', 'approved', 'p-me-act', '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
      ('g-e2', 'g-e2', NULL, 1, 't-arch', 'expense', 'Loan to Peer', 200000, 'VND', '2026-11-11', 'p-me-arch', 'exact', 'approved', 'p-me-arch', '2026-11-11T00:00:00.000Z', '2026-11-11T00:00:00.000Z'),
      ('g-p2', 'g-p2', NULL, 1, 't-arch', 'payment', 'Payback', 100000, 'VND', '2026-11-12', 'p-peer-arch', 'exact', 'confirmed', 'p-peer-arch', '2026-11-12T00:00:00.000Z', '2026-11-12T00:00:00.000Z')`,
  ).run();

  await env.DB.prepare(
    `UPDATE transactions SET to_id = 'p-me-arch', amount_confirmed = 100000 WHERE id = 'g-p2'`,
  ).run();

  await env.DB.prepare(
    `INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES
      ('g-e1', 'p-me-act', 150000, 150000),
      ('g-e1', 'p-peer-act', 150000, 150000),
      ('g-e2', 'p-me-arch', 0, 0),
      ('g-e2', 'p-peer-arch', 200000, 200000)`,
  ).run();

  return { sid, wDefId, wSecId, wUsdId, wInvId, assetId };
}

describe('personal balance caching parity & trip cache', () => {
  it('populates personal_trip_cache, matches all read endpoints, and stays within D1 query budget on warm reads', async () => {
    const uid = 'u-parity-1';
    const { sid, wDefId, wSecId, wUsdId, wInvId } = await seedComplexFixture(uid);

    // Cold read warms personal_trip_cache & personal_wallet_balances
    const wallets1 = await getJson<WalletDetailsResponse>(sid, '/api/me/personal/wallets');
    const summary1 = await getJson<PersonalSummary>(sid, '/api/me/personal/summary?month=2026-11');
    const holdings1 = await getJson<HoldingsResponse>(sid, '/api/me/personal/holdings');
    const tx1 = await getJson<ListResponse>(sid, '/api/me/personal/transactions?month=2026-11&groups=show');
    const groupRows1 = await getJson<{ status: string; rows?: unknown[] }>(sid, '/api/me/personal/group-rows');
    const sync1 = await getJson<SyncResponse>(sid, '/api/me/personal/sync?groups=show');

    // Verify personal_trip_cache is populated for BOTH active and archived trips
    const cacheRows = await env.DB.prepare(
      'SELECT trip_id, trip_version, links_version, wallet_deltas_json FROM personal_trip_cache WHERE user_id = ? ORDER BY trip_id',
    )
      .bind(uid)
      .all<{ trip_id: string; trip_version: number; links_version: number; wallet_deltas_json: string }>();
    expect(cacheRows.results.map((r) => r.trip_id)).toEqual(['t-active', 't-arch']);
    expect(JSON.parse(cacheRows.results[0]!.wallet_deltas_json)).toEqual({ __default__: -300000 });
    expect(JSON.parse(cacheRows.results[1]!.wallet_deltas_json)).toEqual({ __default__: -100000 });

    // Check exact wallet balances:
    // wDef: 1_000_000 - 100_000 (coffee) - 500_000 (transfer) - 300_000 (g-e1) - 200_000 (g-e2) + 100_000 (g-p2) = 0
    // wSec: 2_000_000 + 500_000 = 2_500_000
    // wUsd: 10000 + 2000 = 12000 ($120.00), vndValue = 2_500_000 + 500_000 = 3_000_000
    // wInv: 5_000_000 - 2_000_000 + 1_200_000 = 4_200_000, remaining holding = 1.00 chỉ @ 1_000_000 VND -> vndValue = 5_200_000
    const byId = new Map(wallets1.wallets.map((w) => [w.id, w]));
    expect(byId.get(wDefId)?.balance).toBe(0);
    expect(byId.get(wSecId)?.balance).toBe(2_500_000);
    expect(byId.get(wUsdId)?.balance).toBe(12_000);
    expect(byId.get(wUsdId)?.vndValue).toBe(3_000_000);
    expect(byId.get(wInvId)?.balance).toBe(4_200_000);
    expect(byId.get(wInvId)?.vndValue).toBe(5_200_000);

    expect(holdings1.holdings).toHaveLength(1);
    expect(holdings1.holdings[0]).toMatchObject({
      walletId: wInvId,
      quantity: 100,
      cost: 1_000_000,
      costVnd: 1_000_000,
    });
    expect(summary1.totalVnd).toBe(0 + 2_500_000 + 3_000_000 + 5_200_000);
    expect(tx1.groupRows).toHaveLength(3);
    expect(groupRows1.rows).toHaveLength(3);
    expect(sync1.groups?.rows).toHaveLength(3);

    // Warm read D1 query budget & 0 personal_transactions reads on GET /me/personal/wallets
    const cWallets = countingEnv();
    const wRes = await app.request(
      '/api/me/personal/wallets',
      { headers: { Cookie: `sid=${sid}` } },
      cWallets.env,
    );
    expect(wRes.status).toBe(200);
    expect(cWallets.counter.queries).toBeLessThanOrEqual(6);
    expect(
      cWallets.counter.sqls.some((s) => s.toLowerCase().includes('personal_transactions')),
    ).toBe(false);

    const cSummary = countingEnv();
    const sRes = await app.request(
      '/api/me/personal/summary?month=2026-11',
      { headers: { Cookie: `sid=${sid}` } },
      cSummary.env,
    );
    expect(sRes.status).toBe(200);
    // Auth middleware (getSessionUser + requirePersonal) runs 3 queries; summary route itself runs <= 6 queries.
    expect(cSummary.counter.queries - 3).toBeLessThanOrEqual(6);
  });

  it('re-routes __default__ group deltas when changing isDefault or archiving without invalidating personal_trip_cache', async () => {
    const uid = 'u-parity-default';
    const { sid, wDefId, wSecId } = await seedComplexFixture(uid);

    // Warm cache
    await getJson<WalletDetailsResponse>(sid, '/api/me/personal/wallets');
    const beforeCache = await env.DB.prepare(
      'SELECT trip_id, updated_at FROM personal_trip_cache WHERE user_id = ? ORDER BY trip_id',
    )
      .bind(uid)
      .all<{ trip_id: string; updated_at: string }>();

    // Swap default to wSecId and archive wDefId
    expect((await postJson(sid, `/api/me/personal/wallets/${wSecId}`, { isDefault: true }, 'PATCH')).status).toBe(200);
    expect((await postJson(sid, `/api/me/personal/wallets/${wDefId}`, { archived: true }, 'PATCH')).status).toBe(200);

    const walletsAfter = await getJson<WalletDetailsResponse>(sid, '/api/me/personal/wallets');
    const byId = new Map(walletsAfter.wallets.map((w) => [w.id, w]));
    // Group delta (-400_000) moved from wDefId to wSecId!
    expect(byId.get(wDefId)?.balance).toBe(400_000);
    expect(byId.get(wSecId)?.balance).toBe(2_500_000 - 400_000);

    // personal_trip_cache was NOT invalidated
    const afterCache = await env.DB.prepare(
      'SELECT trip_id, updated_at FROM personal_trip_cache WHERE user_id = ? ORDER BY trip_id',
    )
      .bind(uid)
      .all<{ trip_id: string; updated_at: string }>();
    expect(afterCache.results).toEqual(beforeCache.results);

    // Summary excludes archived wDefId (400k), includes wSecId (2.1M) + wUsd (3.0M) + wInv (5.2M) = 10_300_000
    const summaryAfter = await getJson<PersonalSummary>(sid, '/api/me/personal/summary?month=2026-11');
    expect(summaryAfter.totalVnd).toBe(2_100_000 + 3_000_000 + 5_200_000);
  });

  it('refreshes only the changed trip on group-links and handles group-settings countLoans', async () => {
    const uid = 'u-parity-links';
    const { sid, wDefId, wSecId } = await seedComplexFixture(uid);

    await getJson<WalletDetailsResponse>(sid, '/api/me/personal/wallets');
    const beforeCache = await env.DB.prepare(
      'SELECT trip_id, updated_at FROM personal_trip_cache WHERE user_id = ? ORDER BY trip_id',
    )
      .bind(uid)
      .all<{ trip_id: string; updated_at: string }>();
    const archBefore = beforeCache.results.find((r) => r.trip_id === 't-arch')!;

    // Link g-e1 (in t-active) to wSecId, intent 'loan', excludeFromReports: true
    const linkRes = await postJson(
      sid,
      '/api/me/personal/group-links/g-e1',
      { walletId: wSecId, intent: 'loan', excludeFromReports: true },
      'PUT',
    );
    expect(linkRes.status).toBe(200);

    // Enable countLoans
    const settingsRes = await postJson(
      sid,
      '/api/me/personal/group-settings',
      { countLoans: true },
      'PUT',
    );
    expect(settingsRes.status).toBe(200);

    const walletsAfter = await getJson<WalletDetailsResponse>(sid, '/api/me/personal/wallets');
    const byId = new Map(walletsAfter.wallets.map((w) => [w.id, w]));
    // g-e1 (-300k) moved to wSecId; t-arch (-100k) stays on wDefId
    expect(byId.get(wDefId)?.balance).toBe(300_000);
    expect(byId.get(wSecId)?.balance).toBe(2_200_000);

    // t-arch cache row was NOT refreshed
    const afterCache = await env.DB.prepare(
      'SELECT trip_id, updated_at FROM personal_trip_cache WHERE user_id = ? ORDER BY trip_id',
    )
      .bind(uid)
      .all<{ trip_id: string; updated_at: string }>();
    const archAfter = afterCache.results.find((r) => r.trip_id === 't-arch')!;
    expect(archAfter.updated_at).toBe(archBefore.updated_at);

    // group-rows, transactions?groups=show, sync?groups=show all reflect the updated link
    const groupRows = await getJson<{ status: string; rows: { id: string; link: { walletId: string | null } | null }[] }>(
      sid,
      '/api/me/personal/group-rows',
    );
    const txRows = await getJson<ListResponse>(sid, '/api/me/personal/transactions?month=2026-11&groups=show');
    const syncRows = await getJson<SyncResponse>(sid, '/api/me/personal/sync?groups=show');
    expect(groupRows.rows.find((r) => r.id === 'g-e1')?.link?.walletId).toBe(wSecId);
    expect(txRows.groupRows?.find((r) => r.id === 'g-e1')?.link?.walletId).toBe(wSecId);
    expect(syncRows.groups?.rows.find((r) => r.id === 'g-e1')?.link?.walletId).toBe(wSecId);
  });

  it('prevents stale trip_version from overwriting a newer personal_trip_cache row', async () => {
    const uid = 'u-parity-stale';
    await seedUser(uid, 'Stale Guard');
    const db = drizzle(env.DB, { schema });

    await db
      .insert(schema.personalTripCache)
      .values({
        userId: uid,
        tripId: 't-1',
        tripVersion: 5,
        linksVersion: 2,
        walletDeltasJson: '{"__default__":-50000}',
        rowsJson: '[]',
        updatedAt: '2026-11-22T00:00:05.000Z',
      });

    // Simulate an out-of-order stale reader with tripVersion = 3
    await db
      .insert(schema.personalTripCache)
      .values({
        userId: uid,
        tripId: 't-1',
        tripVersion: 3,
        linksVersion: 1,
        walletDeltasJson: '{"__default__":-10000}',
        rowsJson: '[]',
        updatedAt: '2026-11-22T00:00:03.000Z',
      })
      .onConflictDoUpdate({
        target: [schema.personalTripCache.userId, schema.personalTripCache.tripId],
        set: {
          tripVersion: 3,
          linksVersion: 1,
          walletDeltasJson: '{"__default__":-10000}',
          rowsJson: '[]',
          updatedAt: '2026-11-22T00:00:03.000Z',
        },
        setWhere: lte(schema.personalTripCache.tripVersion, sql`excluded.trip_version`),
      });

    const row = await env.DB.prepare(
      'SELECT trip_version, wallet_deltas_json FROM personal_trip_cache WHERE user_id = ? AND trip_id = ?',
    )
      .bind(uid, 't-1')
      .first<{ trip_version: number; wallet_deltas_json: string }>();

    expect(row?.trip_version).toBe(5);
    expect(row?.wallet_deltas_json).toBe('{"__default__":-50000}');
  });

  it('returns vndValue and totalVnd immediately for a newly created rated non-VND everyday wallet', async () => {
    const uid = 'u-parity-rated-usd';
    const sid = await memberSid(uid, 'Rated USD');
    await enablePersonal(uid);

    const wRes = await postJson(sid, '/api/me/personal/wallets', {
      name: 'USD Wallet',
      currency: 'USD',
      startAmount: 10000,
      startDate: '2026-11-01',
      startCostVnd: 2_500_000,
    });
    expect(wRes.status).toBe(201);
    const wId = (await json<{ wallet: { id: string } }>(wRes)).wallet.id;

    const wallets = await getJson<WalletDetailsResponse>(sid, '/api/me/personal/wallets');
    const summary = await getJson<PersonalSummary>(sid, '/api/me/personal/summary');

    const usdWallet = wallets.wallets.find((w) => w.id === wId);
    expect(usdWallet?.vndValue).toBe(2_500_000);
    expect(summary.totalVnd).toBe(2_500_000);
  });
});
