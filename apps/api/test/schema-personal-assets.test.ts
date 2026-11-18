import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { personalAssets } from '@cc/api-db/schema';
import { seedUser } from './helpers';

const NOW = '2026-11-17T00:00:00.000Z';

async function colsOf(table: string): Promise<string[]> {
  const res = await env.DB.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  return res.results.map((r) => r.name);
}

describe('personal assets table (0028)', () => {
  it('exists with its columns', async () => {
    expect(personalAssets.id).toBeDefined();
    expect(await colsOf('personal_assets')).toEqual([
      'id',
      'user_id',
      'name',
      'unit',
      'group_name',
      'decimals',
      'hidden',
      'sort_order',
      'created_at',
      'updated_at',
    ]);
  });

  it('inserts an asset with hidden defaulting to 0 and rejects decimals 9', async () => {
    await seedUser('u-pa-dec', 'Asset User');

    await env.DB.prepare(
      "INSERT INTO personal_assets (id, user_id, name, unit, group_name, decimals, sort_order, created_at, updated_at) VALUES ('asset-1', 'u-pa-dec', 'Bitcoin', 'BTC', 'Crypto', 8, 1, ?, ?)",
    )
      .bind(NOW, NOW)
      .run();

    const row = await env.DB.prepare(
      "SELECT id, decimals, hidden FROM personal_assets WHERE id = 'asset-1'",
    ).first<{ id: string; decimals: number; hidden: number }>();
    expect(row).toEqual({ id: 'asset-1', decimals: 8, hidden: 0 });

    await expect(
      env.DB.prepare(
        "INSERT INTO personal_assets (id, user_id, name, unit, group_name, decimals, sort_order, created_at, updated_at) VALUES ('asset-bad', 'u-pa-dec', 'BadCoin', 'BAD', 'Crypto', 9, 2, ?, ?)",
      )
        .bind(NOW, NOW)
        .run(),
    ).rejects.toThrow();
  });

  it('rejects duplicate name differing only in case for the same user, allows for another user', async () => {
    await seedUser('u-pa-1', 'Asset User 1');
    await seedUser('u-pa-2', 'Asset User 2');

    await env.DB.prepare(
      "INSERT INTO personal_assets (id, user_id, name, unit, group_name, decimals, sort_order, created_at, updated_at) VALUES ('asset-u1-1', 'u-pa-1', 'Vàng SJC', 'chỉ', 'Vàng', 2, 1, ?, ?)",
    )
      .bind(NOW, NOW)
      .run();

    await expect(
      env.DB.prepare(
        "INSERT INTO personal_assets (id, user_id, name, unit, group_name, decimals, sort_order, created_at, updated_at) VALUES ('asset-u1-2', 'u-pa-1', 'vàng sjc', 'chỉ', 'Vàng', 2, 2, ?, ?)",
      )
        .bind(NOW, NOW)
        .run(),
    ).rejects.toThrow();

    await env.DB.prepare(
      "INSERT INTO personal_assets (id, user_id, name, unit, group_name, decimals, sort_order, created_at, updated_at) VALUES ('asset-u2-1', 'u-pa-2', 'vàng sjc', 'chỉ', 'Vàng', 2, 1, ?, ?)",
    )
      .bind(NOW, NOW)
      .run();

    const other = await env.DB.prepare(
      "SELECT id FROM personal_assets WHERE id = 'asset-u2-1'",
    ).first<{ id: string }>();
    expect(other).toEqual({ id: 'asset-u2-1' });
  });
});
