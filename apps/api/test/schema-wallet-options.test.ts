import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { personalWalletOptions } from '@cc/api-db/schema';
import { seedUser } from './helpers';

const NOW = '2026-11-21T00:00:00.000Z';

async function seedWallet(id: string, userId: string): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO personal_wallets (id, user_id, name, currency, start_amount, start_date, is_default, created_at, updated_at) VALUES (?, ?, 'Ví chính', 'VND', 100000, '2026-11-21', 1, ?, ?)",
  )
    .bind(id, userId, NOW, NOW)
    .run();
}

describe('personal_wallet_options (0030)', () => {
  it('has the six columns, in order', async () => {
    expect(personalWalletOptions.walletId).toBeDefined();
    const cols = await env.DB.prepare('PRAGMA table_info(personal_wallet_options)').all<{
      name: string;
    }>();
    expect(cols.results.map((r) => r.name)).toEqual([
      'wallet_id',
      'user_id',
      'exclude_from_reports',
      'enable_notification',
      'linked_bank_code',
      'updated_at',
    ]);
  });

  it('cascades delete when the wallet or user is deleted', async () => {
    await seedUser('u-opt-1', 'Opt User 1');
    await seedWallet('w-opt-1', 'u-opt-1');

    await env.DB.prepare(
      "INSERT INTO personal_wallet_options (wallet_id, user_id, exclude_from_reports, updated_at) VALUES ('w-opt-1', 'u-opt-1', 1, ?)",
    )
      .bind(NOW)
      .run();

    const before = await env.DB.prepare(
      "SELECT exclude_from_reports, enable_notification, linked_bank_code FROM personal_wallet_options WHERE wallet_id = 'w-opt-1'",
    ).first<{
      exclude_from_reports: number;
      enable_notification: number;
      linked_bank_code: string | null;
    }>();
    expect(before).toEqual({
      exclude_from_reports: 1,
      enable_notification: 0,
      linked_bank_code: null,
    });

    await env.DB.prepare("DELETE FROM personal_wallets WHERE id = 'w-opt-1'").run();
    const afterWalletDelete = await env.DB.prepare(
      "SELECT 1 AS x FROM personal_wallet_options WHERE wallet_id = 'w-opt-1'",
    ).first();
    expect(afterWalletDelete).toBeNull();

    await seedWallet('w-opt-2', 'u-opt-1');
    await env.DB.prepare(
      "INSERT INTO personal_wallet_options (wallet_id, user_id, exclude_from_reports, updated_at) VALUES ('w-opt-2', 'u-opt-1', 1, ?)",
    )
      .bind(NOW)
      .run();

    await env.DB.prepare("DELETE FROM users WHERE id = 'u-opt-1'").run();
    const afterUserDelete = await env.DB.prepare(
      "SELECT 1 AS x FROM personal_wallet_options WHERE user_id = 'u-opt-1'",
    ).first();
    expect(afterUserDelete).toBeNull();
  });
});
