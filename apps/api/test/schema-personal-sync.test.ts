import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { seedUser } from './helpers';

const NOW = '2026-11-19T00:00:00.000Z';

async function colsOf(table: string): Promise<string[]> {
  const res = await env.DB.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  return res.results.map((r) => r.name);
}

async function indexesOf(table: string): Promise<string[]> {
  const res = await env.DB.prepare(`PRAGMA index_list(${table})`).all<{ name: string }>();
  return res.results.map((r) => r.name);
}

describe('personal sync tables (0029)', () => {
  it('creates the state and deletion tables with their indexes', async () => {
    expect(await colsOf('personal_sync_state')).toEqual([
      'user_id',
      'version',
      'epoch',
      'purged_version',
      'updated_at',
    ]);
    expect(await colsOf('personal_sync_deletions')).toEqual([
      'user_id',
      'transaction_id',
      'version',
      'deleted_at',
    ]);
    expect(await indexesOf('personal_sync_deletions')).toEqual(
      expect.arrayContaining(['personal_sync_del_user_version_idx', 'personal_sync_del_deleted_at_idx']),
    );
  });

  it('adds sync_version to personal_transactions, defaulting to 0, with its index', async () => {
    expect(await colsOf('personal_transactions')).toContain('sync_version');
    expect(await indexesOf('personal_transactions')).toContain('personal_tx_user_sync_idx');

    await seedUser('u-sync-schema', 'SyncSchema');
    await env.DB.prepare(
      "INSERT INTO personal_wallets (id, user_id, name, currency, start_amount, start_date, is_default, created_at, updated_at) VALUES ('w-sync-schema', 'u-sync-schema', 'Ví', 'VND', 0, '2026-01-01', 1, ?, ?)",
    )
      .bind(NOW, NOW)
      .run();
    await env.DB.prepare(
      "INSERT INTO personal_transactions (id, user_id, wallet_id, type, amount, date, created_at, updated_at) VALUES ('tx-sync-schema', 'u-sync-schema', 'w-sync-schema', 'expense', 1000, '2026-11-19', ?, ?)",
    )
      .bind(NOW, NOW)
      .run();
    const row = await env.DB.prepare("SELECT sync_version FROM personal_transactions WHERE id = 'tx-sync-schema'").first<{
      sync_version: number;
    }>();
    expect(row?.sync_version).toBe(0);
  });
});
