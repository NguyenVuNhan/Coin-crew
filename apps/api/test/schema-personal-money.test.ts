import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import {
  personalWalletSettings,
  personalCategories,
  personalTags,
  personalTransactions,
  personalTransactionTags,
} from '@cc/api-db/schema';
import { seedUser } from './helpers';

const NOW = '2026-11-16T00:00:00.000Z';

async function colsOf(table: string): Promise<string[]> {
  const res = await env.DB.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  return res.results.map((r) => r.name);
}

async function seedWallet(id: string, userId: string): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO personal_wallets (id, user_id, name, currency, start_amount, start_date, is_default, created_at, updated_at) VALUES (?, ?, 'Ví chính', 'VND', 100000, '2026-11-16', 1, ?, ?)",
  )
    .bind(id, userId, NOW, NOW)
    .run();
}

describe('personal money tables (0027)', () => {
  it('the five tables exist with their columns', async () => {
    expect(personalWalletSettings.walletId).toBeDefined();
    expect(personalCategories.id).toBeDefined();
    expect(personalTags.id).toBeDefined();
    expect(personalTransactions.id).toBeDefined();
    expect(personalTransactionTags.transactionId).toBeDefined();

    expect(await colsOf('personal_wallet_settings')).toEqual([
      'wallet_id',
      'user_id',
      'kind',
      'start_cost_vnd',
      'icon',
      'sort_order',
      'archived_at',
      'updated_at',
    ]);

    expect(await colsOf('personal_categories')).toEqual([
      'id',
      'user_id',
      'parent_id',
      'type',
      'name',
      'icon',
      'hidden',
      'sort_order',
      'created_at',
      'updated_at',
    ]);

    expect(await colsOf('personal_tags')).toEqual(['id', 'user_id', 'name', 'created_at']);

    expect(await colsOf('personal_transactions')).toEqual([
      'id',
      'user_id',
      'wallet_id',
      'type',
      'amount',
      'category_id',
      'transfer_id',
      'asset_id',
      'quantity',
      'date',
      'time',
      'note',
      'exclude_from_reports',
      'source',
      'external_ref',
      'created_at',
      'updated_at',
      'sync_version',
    ]);

    expect(await colsOf('personal_transaction_tags')).toEqual(['transaction_id', 'tag_id']);
  });

  it('a sixth type is refused by the CHECK', async () => {
    await seedUser('u-pm-type', 'Type User');
    await seedWallet('w-pm-type', 'u-pm-type');

    for (const [i, t] of ['expense', 'income', 'transfer_out', 'transfer_in', 'buy', 'sell'].entries()) {
      await env.DB.prepare(
        "INSERT INTO personal_transactions (id, user_id, wallet_id, type, amount, date, created_at, updated_at) VALUES (?, 'u-pm-type', 'w-pm-type', ?, 1000, '2026-11-16', ?, ?)",
      )
        .bind(`tx-ok-${i}`, t, NOW, NOW)
        .run();
    }

    await expect(
      env.DB.prepare(
        "INSERT INTO personal_transactions (id, user_id, wallet_id, type, amount, date, created_at, updated_at) VALUES ('tx-bad', 'u-pm-type', 'w-pm-type', 'loan', 1000, '2026-11-16', ?, ?)",
      )
        .bind(NOW, NOW)
        .run(),
    ).rejects.toThrow();
  });

  it('two tags differing only in case are refused', async () => {
    await seedUser('u-pm-tag', 'Tag User');
    await env.DB.prepare(
      "INSERT INTO personal_tags (id, user_id, name, created_at) VALUES ('tag-1', 'u-pm-tag', 'Binance', ?)",
    )
      .bind(NOW)
      .run();

    await expect(
      env.DB.prepare(
        "INSERT INTO personal_tags (id, user_id, name, created_at) VALUES ('tag-2', 'u-pm-tag', 'binance', ?)",
      )
        .bind(NOW)
        .run(),
    ).rejects.toThrow();

    await seedUser('u-pm-tag-2', 'Other Tag User');
    await env.DB.prepare(
      "INSERT INTO personal_tags (id, user_id, name, created_at) VALUES ('tag-3', 'u-pm-tag-2', 'binance', ?)",
    )
      .bind(NOW)
      .run();
  });

  it('the same external_ref twice for one user and source is refused, null twice is fine', async () => {
    await seedUser('u-pm-ext', 'Ext User');
    await seedWallet('w-pm-ext', 'u-pm-ext');

    await env.DB.prepare(
      "INSERT INTO personal_transactions (id, user_id, wallet_id, type, amount, date, source, external_ref, created_at, updated_at) VALUES ('tx-null-1', 'u-pm-ext', 'w-pm-ext', 'expense', 5000, '2026-11-16', 'manual', NULL, ?, ?)",
    )
      .bind(NOW, NOW)
      .run();

    await env.DB.prepare(
      "INSERT INTO personal_transactions (id, user_id, wallet_id, type, amount, date, source, external_ref, created_at, updated_at) VALUES ('tx-null-2', 'u-pm-ext', 'w-pm-ext', 'expense', 6000, '2026-11-16', 'manual', NULL, ?, ?)",
    )
      .bind(NOW, NOW)
      .run();

    await env.DB.prepare(
      "INSERT INTO personal_transactions (id, user_id, wallet_id, type, amount, date, source, external_ref, created_at, updated_at) VALUES ('tx-ref-1', 'u-pm-ext', 'w-pm-ext', 'expense', 7000, '2026-11-16', 'import', 'ref-123', ?, ?)",
    )
      .bind(NOW, NOW)
      .run();

    await expect(
      env.DB.prepare(
        "INSERT INTO personal_transactions (id, user_id, wallet_id, type, amount, date, source, external_ref, created_at, updated_at) VALUES ('tx-ref-2', 'u-pm-ext', 'w-pm-ext', 'expense', 8000, '2026-11-16', 'import', 'ref-123', ?, ?)",
      )
        .bind(NOW, NOW)
        .run(),
    ).rejects.toThrow();
  });

  it("deleting a user removes all five tables' rows", async () => {
    await seedUser('u-pm-del', 'Delete User');
    await seedWallet('w-pm-del', 'u-pm-del');

    await env.DB.prepare(
      "INSERT INTO personal_wallet_settings (wallet_id, user_id, kind, updated_at) VALUES ('w-pm-del', 'u-pm-del', 'everyday', ?)",
    )
      .bind(NOW)
      .run();

    await env.DB.prepare(
      "INSERT INTO personal_categories (id, user_id, type, name, icon, created_at, updated_at) VALUES ('cat-del', 'u-pm-del', 'expense', 'Ăn uống', 'utensils', ?, ?)",
    )
      .bind(NOW, NOW)
      .run();

    await env.DB.prepare(
      "INSERT INTO personal_tags (id, user_id, name, created_at) VALUES ('tag-del', 'u-pm-del', 'lunch', ?)",
    )
      .bind(NOW)
      .run();

    await env.DB.prepare(
      "INSERT INTO personal_transactions (id, user_id, wallet_id, type, amount, category_id, date, created_at, updated_at) VALUES ('tx-del', 'u-pm-del', 'w-pm-del', 'expense', 50000, 'cat-del', '2026-11-16', ?, ?)",
    )
      .bind(NOW, NOW)
      .run();

    await env.DB.prepare(
      "INSERT INTO personal_transaction_tags (transaction_id, tag_id) VALUES ('tx-del', 'tag-del')",
    ).run();

    await env.DB.prepare("DELETE FROM users WHERE id = 'u-pm-del'").run();

    for (const table of [
      'personal_wallet_settings',
      'personal_categories',
      'personal_tags',
      'personal_transactions',
      'personal_transaction_tags',
    ]) {
      const row = await env.DB.prepare(`SELECT count(*) AS n FROM ${table}`).first<{ n: number }>();
      expect(row?.n, `expected 0 rows in ${table}`).toBe(0);
    }
  });
});
