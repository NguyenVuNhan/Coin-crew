import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import {
  personalAssetCounts,
  personalTripCache,
  personalWalletBalances,
  tripBalanceCache,
} from '@cc/api-db/schema';
import { seedUser } from './helpers';

const NOW = '2026-11-22T00:00:00.000Z';

async function colsOf(table: string): Promise<string[]> {
  const res = await env.DB.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  return res.results.map((r) => r.name);
}

async function indexesOf(table: string): Promise<string[]> {
  const res = await env.DB.prepare(`PRAGMA index_list(${table})`).all<{ name: string }>();
  return res.results.map((r) => r.name);
}

function backfillQueries0033(): string[] {
  const m = env.TEST_MIGRATIONS!.find((item) => item.name.startsWith('0033'));
  expect(m, 'migration 0033_balance_caching.sql must exist').toBeDefined();
  const queries = m!.queries
    .map((q) => q.replace(/^-->\s*statement-breakpoint\s*/i, '').trim())
    .filter((q) => {
      const upper = q.toUpperCase();
      return upper.startsWith('INSERT') || upper.startsWith('UPDATE');
    });
  expect(queries).toHaveLength(2);
  return queries;
}

describe('balance caching schema and migration 0033', () => {
  it('creates cache tables and indexes without altering personal_assets', async () => {
    expect(personalAssetCounts.assetId).toBeDefined();
    expect(personalAssetCounts.entryCount).toBeDefined();
    expect(personalWalletBalances.walletId).toBeDefined();
    expect(personalTripCache.userId).toBeDefined();
    expect(tripBalanceCache.tripId).toBeDefined();

    const tablesRes = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('personal_asset_counts', 'personal_wallet_balances', 'personal_trip_cache', 'trip_balance_cache') ORDER BY name",
    ).all<{ name: string }>();
    expect(tablesRes.results.map((r) => r.name)).toEqual([
      'personal_asset_counts',
      'personal_trip_cache',
      'personal_wallet_balances',
      'trip_balance_cache',
    ]);

    expect(await colsOf('personal_asset_counts')).toEqual(['asset_id', 'user_id', 'entry_count']);
    expect(await indexesOf('personal_asset_counts')).toContain('personal_asset_counts_user_idx');

    expect(await colsOf('personal_wallet_balances')).toEqual([
      'wallet_id',
      'user_id',
      'personal_net',
      'entry_count',
      'vnd_value',
      'cash_vnd',
      'holdings_json',
      'needs_replay',
      'updated_at',
    ]);
    expect(await indexesOf('personal_wallet_balances')).toContain('personal_wallet_balances_user_idx');

    expect(await colsOf('personal_trip_cache')).toEqual([
      'user_id',
      'trip_id',
      'trip_version',
      'links_version',
      'wallet_deltas_json',
      'rows_json',
      'updated_at',
    ]);
    expect(await indexesOf('personal_trip_cache')).toContain('personal_trip_cache_trip_idx');

    expect(await colsOf('trip_balance_cache')).toEqual([
      'trip_id',
      'trip_version',
      'balances_json',
      'rounded_balances_json',
      'suggestions_json',
      'waiting_json',
      'oldest_shared_json',
      'updated_at',
    ]);
  });

  it('backfills personal_wallet_balances and personal_asset_counts accurately and idempotently', async () => {
    const uid = 'u-bc-mig';
    await seedUser(uid, 'Backfill User');

    // Wallets: VND everyday, USD everyday, VND investment, empty VND everyday
    await env.DB.prepare(
      `INSERT INTO personal_wallets (id, user_id, name, currency, start_amount, start_date, is_default, created_at, updated_at) VALUES
        ('w-vnd', ?, 'VND Cash', 'VND', 100000, '2026-01-01', 1, ?, ?),
        ('w-usd', ?, 'USD Cash', 'USD', 500, '2026-01-01', 0, ?, ?),
        ('w-inv', ?, 'Invest VND', 'VND', 1000000, '2026-01-01', 0, ?, ?),
        ('w-empty', ?, 'Empty VND', 'VND', 0, '2026-01-01', 0, ?, ?)`,
    )
      .bind(uid, NOW, NOW, uid, NOW, NOW, uid, NOW, NOW, uid, NOW, NOW)
      .run();

    await env.DB.prepare(
      `INSERT INTO personal_wallet_settings (wallet_id, user_id, kind, updated_at) VALUES
        ('w-vnd', ?, 'everyday', ?),
        ('w-usd', ?, 'everyday', ?),
        ('w-inv', ?, 'investment', ?)`,
    )
      .bind(uid, NOW, uid, NOW, uid, NOW)
      .run();

    // Assets: one used, one unused
    await env.DB.prepare(
      `INSERT INTO personal_assets (id, user_id, name, unit, group_name, decimals, hidden, sort_order, created_at, updated_at) VALUES
        ('a-btc', ?, 'Bitcoin', 'BTC', 'Crypto', 8, 0, 1, ?, ?),
        ('a-gold', ?, 'Gold', 'chỉ', 'Gold', 2, 0, 2, ?, ?)`,
    )
      .bind(uid, NOW, NOW, uid, NOW, NOW)
      .run();

    // Transactions across wallets and types
    await env.DB.prepare(
      `INSERT INTO personal_transactions (id, user_id, wallet_id, type, amount, asset_id, quantity, date, created_at, updated_at) VALUES
        ('tx-1', ?, 'w-vnd', 'income', 500000, NULL, NULL, '2026-11-01', ?, ?),
        ('tx-2', ?, 'w-vnd', 'expense', 120000, NULL, NULL, '2026-11-02', ?, ?),
        ('tx-3', ?, 'w-vnd', 'transfer_in', 30000, NULL, NULL, '2026-11-03', ?, ?),
        ('tx-4', ?, 'w-vnd', 'transfer_out', 10000, NULL, NULL, '2026-11-04', ?, ?),
        ('tx-5', ?, 'w-usd', 'income', 200, NULL, NULL, '2026-11-05', ?, ?),
        ('tx-6', ?, 'w-usd', 'expense', 50, NULL, NULL, '2026-11-06', ?, ?),
        ('tx-7', ?, 'w-inv', 'buy', 400000, 'a-btc', 1000000, '2026-11-07', ?, ?),
        ('tx-8', ?, 'w-inv', 'sell', 150000, 'a-btc', 500000, '2026-11-08', ?, ?),
        ('tx-9', ?, 'w-inv', 'buy', 250000, 'a-btc', 500000, '2026-11-09', ?, ?)`,
    )
      .bind(
        uid, NOW, NOW,
        uid, NOW, NOW,
        uid, NOW, NOW,
        uid, NOW, NOW,
        uid, NOW, NOW,
        uid, NOW, NOW,
        uid, NOW, NOW,
        uid, NOW, NOW,
        uid, NOW, NOW,
      )
      .run();

    const queries = backfillQueries0033();
    for (const q of queries) {
      await env.DB.prepare(q).run();
    }

    const balances = await env.DB.prepare(
      'SELECT wallet_id, user_id, personal_net, entry_count, needs_replay FROM personal_wallet_balances WHERE user_id = ? ORDER BY wallet_id',
    )
      .bind(uid)
      .all<{ wallet_id: string; user_id: string; personal_net: number; entry_count: number; needs_replay: number }>();

    expect(balances.results).toEqual([
      { wallet_id: 'w-empty', user_id: uid, personal_net: 0, entry_count: 0, needs_replay: 0 },
      { wallet_id: 'w-inv', user_id: uid, personal_net: -500000, entry_count: 3, needs_replay: 1 },
      { wallet_id: 'w-usd', user_id: uid, personal_net: 150, entry_count: 2, needs_replay: 1 },
      { wallet_id: 'w-vnd', user_id: uid, personal_net: 400000, entry_count: 4, needs_replay: 0 },
    ]);

    const assets = await env.DB.prepare(
      'SELECT asset_id, user_id, entry_count FROM personal_asset_counts WHERE user_id = ? ORDER BY asset_id',
    )
      .bind(uid)
      .all<{ asset_id: string; user_id: string; entry_count: number }>();
    expect(assets.results).toEqual([
      { asset_id: 'a-btc', user_id: uid, entry_count: 3 },
      { asset_id: 'a-gold', user_id: uid, entry_count: 0 },
    ]);

    // Idempotent on re-run
    for (const q of queries) {
      await env.DB.prepare(q).run();
    }
    const balancesAfter = await env.DB.prepare(
      'SELECT wallet_id, personal_net, entry_count, needs_replay FROM personal_wallet_balances WHERE user_id = ? ORDER BY wallet_id',
    )
      .bind(uid)
      .all<{ wallet_id: string; personal_net: number; entry_count: number; needs_replay: number }>();
    expect(balancesAfter.results).toEqual(
      balances.results.map(({ wallet_id, personal_net, entry_count, needs_replay }) => ({
        wallet_id,
        personal_net,
        entry_count,
        needs_replay,
      })),
    );
    const assetsAfter = await env.DB.prepare(
      'SELECT asset_id, entry_count FROM personal_asset_counts WHERE user_id = ? ORDER BY asset_id',
    )
      .bind(uid)
      .all<{ asset_id: string; entry_count: number }>();
    expect(assetsAfter.results).toEqual([
      { asset_id: 'a-btc', entry_count: 3 },
      { asset_id: 'a-gold', entry_count: 0 },
    ]);
  });

  it('cascades deletes from personal_wallets, personal_assets, and users and enforces primary keys', async () => {
    const uid = 'u-bc-cas';
    await seedUser(uid, 'Cascade User');
    await env.DB.prepare(
      "INSERT INTO personal_wallets (id, user_id, name, currency, start_amount, start_date, is_default, created_at, updated_at) VALUES ('w-cas', ?, 'Ví', 'VND', 0, '2026-01-01', 1, ?, ?)",
    )
      .bind(uid, NOW, NOW)
      .run();

    await env.DB.prepare(
      "INSERT INTO personal_assets (id, user_id, name, unit, group_name, decimals, hidden, sort_order, created_at, updated_at) VALUES ('a-cas', ?, 'Gold', 'chỉ', 'Gold', 2, 0, 1, ?, ?)",
    )
      .bind(uid, NOW, NOW)
      .run();

    await env.DB.prepare(
      "INSERT INTO personal_wallet_balances (wallet_id, user_id, personal_net, entry_count, needs_replay, updated_at) VALUES ('w-cas', ?, 1000, 1, 0, ?)",
    )
      .bind(uid, NOW)
      .run();

    await env.DB.prepare(
      "INSERT INTO personal_asset_counts (asset_id, user_id, entry_count) VALUES ('a-cas', ?, 2)",
    )
      .bind(uid)
      .run();

    await env.DB.prepare(
      "INSERT INTO personal_trip_cache (user_id, trip_id, trip_version, links_version, wallet_deltas_json, rows_json, updated_at) VALUES (?, 't-cas', 1, 0, '{}', '[]', ?)",
    )
      .bind(uid, NOW)
      .run();

    await env.DB.prepare(
      "INSERT INTO trip_balance_cache (trip_id, trip_version, balances_json, rounded_balances_json, suggestions_json, waiting_json, oldest_shared_json, updated_at) VALUES ('t-cas', 1, '{}', '{}', '[]', '[]', '{}', ?)",
    )
      .bind(NOW)
      .run();

    // Primary key uniqueness checks
    await expect(
      env.DB.prepare(
        "INSERT INTO personal_asset_counts (asset_id, user_id, entry_count) VALUES ('a-cas', ?, 5)",
      )
        .bind(uid)
        .run(),
    ).rejects.toThrow();

    await expect(
      env.DB.prepare(
        "INSERT INTO personal_trip_cache (user_id, trip_id, trip_version, links_version, wallet_deltas_json, rows_json, updated_at) VALUES (?, 't-cas', 2, 0, '{}', '[]', ?)",
      )
        .bind(uid, NOW)
        .run(),
    ).rejects.toThrow();

    await expect(
      env.DB.prepare(
        "INSERT INTO trip_balance_cache (trip_id, trip_version, balances_json, rounded_balances_json, suggestions_json, waiting_json, oldest_shared_json, updated_at) VALUES ('t-cas', 2, '{}', '{}', '[]', '[]', '{}', ?)",
      )
        .bind(NOW)
        .run(),
    ).rejects.toThrow();

    // Deleting wallet cascades to personal_wallet_balances
    await env.DB.prepare("DELETE FROM personal_wallets WHERE id = 'w-cas'").run();
    const balAfterWalletDel = await env.DB.prepare(
      "SELECT count(*) AS n FROM personal_wallet_balances WHERE wallet_id = 'w-cas'",
    ).first<{ n: number }>();
    expect(balAfterWalletDel?.n).toBe(0);

    // Deleting asset cascades to personal_asset_counts
    await env.DB.prepare("DELETE FROM personal_assets WHERE id = 'a-cas'").run();
    const assetCountAfterDel = await env.DB.prepare(
      "SELECT count(*) AS n FROM personal_asset_counts WHERE asset_id = 'a-cas'",
    ).first<{ n: number }>();
    expect(assetCountAfterDel?.n).toBe(0);

    // Deleting user cascades to personal_trip_cache
    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(uid).run();
    const tripCacheAfterUserDel = await env.DB.prepare(
      'SELECT count(*) AS n FROM personal_trip_cache WHERE user_id = ?',
    )
      .bind(uid)
      .first<{ n: number }>();
    expect(tripCacheAfterUserDel?.n).toBe(0);
  });
});
