import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { personalWallets } from '@cc/api-db/schema';
import { seedUser } from './helpers';

describe('personal_wallets', () => {
  it('has the nine columns, in order', async () => {
    expect(personalWallets.id).toBeDefined();
    const cols = await env.DB.prepare('PRAGMA table_info(personal_wallets)').all<{ name: string }>();
    expect(cols.results.map((r) => r.name)).toEqual([
      'id',
      'user_id',
      'name',
      'currency',
      'start_amount',
      'start_date',
      'is_default',
      'created_at',
      'updated_at',
    ]);
  });

  it('rejects a second default wallet for the same user, but accepts a second non-default wallet', async () => {
    await seedUser('u-w1', 'Wallet User 1');
    await env.DB.prepare(
      "INSERT INTO personal_wallets (id, user_id, name, currency, start_amount, start_date, is_default, created_at, updated_at) VALUES ('w-1', 'u-w1', 'First Wallet', 'VND', 100000, '2026-11-16', 1, '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z')",
    ).run();

    await expect(
      env.DB.prepare(
        "INSERT INTO personal_wallets (id, user_id, name, currency, start_amount, start_date, is_default, created_at, updated_at) VALUES ('w-2', 'u-w1', 'Second Default', 'VND', 50000, '2026-11-16', 1, '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z')",
      ).run(),
    ).rejects.toThrow();

    await env.DB.prepare(
      "INSERT INTO personal_wallets (id, user_id, name, currency, start_amount, start_date, is_default, created_at, updated_at) VALUES ('w-3', 'u-w1', 'Second Non-Default', 'VND', 50000, '2026-11-16', 0, '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z')",
    ).run();

    const count = await env.DB.prepare("SELECT count(*) AS n FROM personal_wallets WHERE user_id = 'u-w1'").first<{ n: number }>();
    expect(count?.n).toBe(2);
  });

  it('deleting the user removes their wallets', async () => {
    await seedUser('u-w2', 'Wallet User 2');
    await env.DB.prepare(
      "INSERT INTO personal_wallets (id, user_id, name, currency, start_amount, start_date, is_default, created_at, updated_at) VALUES ('w-del', 'u-w2', 'To Delete', 'VND', 0, '2026-11-16', 1, '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z')",
    ).run();
    await env.DB.prepare("DELETE FROM users WHERE id = 'u-w2'").run();
    const row = await env.DB.prepare("SELECT 1 AS x FROM personal_wallets WHERE user_id = 'u-w2'").first();
    expect(row).toBeNull();
  });
});
