import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { eq, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { getDb } from '@cc/api-db/client';
import { personalTransactions } from '@cc/api-db/schema';
import {
  bumpPersonalEpoch,
  clearDeletions,
  commitPersonalWrite,
  recordDeletions,
} from '@cc/api-db/personalSync';
import { seedUser } from './helpers';

const NOW = '2026-11-19T00:00:00.000Z';

async function seedWallet(walletId: string, userId: string): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO personal_wallets (id, user_id, name, currency, start_amount, start_date, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(walletId, userId, 'Ví chính', 'VND', 0, '2026-01-01', 1, NOW, NOW)
    .run();
}

describe('personal sync write helpers', () => {
  it('commitPersonalWrite bumps from 0 to 1 then 2', async () => {
    const userId = 'u-psync-bump-1';
    await seedUser(userId, 'Sync Bump');
    const db = getDb(env);

    await commitPersonalWrite(db, userId, () => []);
    const row1 = await env.DB.prepare('SELECT version FROM personal_sync_state WHERE user_id = ?')
      .bind(userId)
      .first<{ version: number }>();
    expect(row1?.version).toBe(1);

    await commitPersonalWrite(db, userId, () => []);
    const row2 = await env.DB.prepare('SELECT version FROM personal_sync_state WHERE user_id = ?')
      .bind(userId)
      .first<{ version: number }>();
    expect(row2?.version).toBe(2);
  });

  it('stamps rows with the new version', async () => {
    const userId = 'u-psync-stamp-2';
    const walletId = 'w-psync-stamp-2';
    const txId = 'tx-psync-stamp-2';
    await seedUser(userId, 'Sync Stamp');
    await seedWallet(walletId, userId);
    const db = getDb(env);

    await commitPersonalWrite(db, userId, (v) => [
      db.insert(personalTransactions).values({
        id: txId,
        userId,
        walletId,
        type: 'expense',
        amount: 25000,
        date: '2026-11-19',
        createdAt: NOW,
        updatedAt: NOW,
        syncVersion: v as unknown as number,
      }),
    ]);

    const state = await env.DB.prepare('SELECT version FROM personal_sync_state WHERE user_id = ?')
      .bind(userId)
      .first<{ version: number }>();
    expect(state?.version).toBe(1);

    const tx = await env.DB.prepare('SELECT sync_version FROM personal_transactions WHERE id = ?')
      .bind(txId)
      .first<{ sync_version: number }>();
    expect(tx?.sync_version).toBe(1);
    expect(tx?.sync_version).toBe(state?.version);
  });

  it('recordDeletions before delete records id and version', async () => {
    const userId = 'u-psync-rec-del-3';
    const walletId = 'w-psync-rec-del-3';
    const txId = 'tx1';
    await seedUser(userId, 'Sync Rec Del');
    await seedWallet(walletId, userId);
    const db = getDb(env);

    await env.DB.prepare(
      "INSERT INTO personal_transactions (id, user_id, wallet_id, type, amount, date, created_at, updated_at) VALUES ('tx1', ?, ?, 'expense', 1000, '2026-11-19', ?, ?)",
    )
      .bind(userId, walletId, NOW, NOW)
      .run();

    await commitPersonalWrite(db, userId, () => [
      recordDeletions(db, userId, sql`id = 'tx1'`),
      db.delete(personalTransactions).where(eq(personalTransactions.id, 'tx1')),
    ]);

    const state = await env.DB.prepare('SELECT version FROM personal_sync_state WHERE user_id = ?')
      .bind(userId)
      .first<{ version: number }>();
    expect(state?.version).toBe(1);

    const delRow = await env.DB.prepare(
      'SELECT transaction_id, version, deleted_at FROM personal_sync_deletions WHERE user_id = ? AND transaction_id = ?',
    )
      .bind(userId, txId)
      .first<{ transaction_id: string; version: number; deleted_at: string }>();
    expect(delRow).toBeDefined();
    expect(delRow?.transaction_id).toBe('tx1');
    expect(delRow?.version).toBe(state?.version);

    const txRow = await env.DB.prepare('SELECT id FROM personal_transactions WHERE id = ?')
      .bind(txId)
      .first();
    expect(txRow).toBeNull();
  });

  it('clearDeletions removes the record', async () => {
    const userId = 'u-psync-clr-del-4';
    await seedUser(userId, 'Sync Clear Del');
    const db = getDb(env);

    await env.DB.prepare(
      'INSERT INTO personal_sync_deletions (user_id, transaction_id, version, deleted_at) VALUES (?, ?, 1, ?)',
    )
      .bind(userId, 'tx-del-1', NOW)
      .run();

    await db.batch([clearDeletions(db, userId, ['tx-del-1'])] as unknown as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);

    const row = await env.DB.prepare(
      'SELECT transaction_id FROM personal_sync_deletions WHERE user_id = ? AND transaction_id = ?',
    )
      .bind(userId, 'tx-del-1')
      .first();
    expect(row).toBeNull();
  });

  it('clearDeletions with no ids deletes nothing', async () => {
    const userId = 'u-psync-clr-empty-5';
    await seedUser(userId, 'Sync Clear Empty');
    const db = getDb(env);

    await env.DB.prepare(
      'INSERT INTO personal_sync_deletions (user_id, transaction_id, version, deleted_at) VALUES (?, ?, 1, ?), (?, ?, 2, ?)',
    )
      .bind(userId, 'tx-keep-1', NOW, userId, 'tx-keep-2', NOW)
      .run();

    await db.batch([clearDeletions(db, userId, [])] as unknown as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);

    const res = await env.DB.prepare(
      'SELECT transaction_id FROM personal_sync_deletions WHERE user_id = ? ORDER BY transaction_id',
    )
      .bind(userId)
      .all<{ transaction_id: string }>();
    expect(res.results.map((r) => r.transaction_id)).toEqual(['tx-keep-1', 'tx-keep-2']);
  });

  it('bumpPersonalEpoch raises epoch by 1 and leaves version', async () => {
    const userId = 'u-psync-epoch-6';
    await seedUser(userId, 'Sync Epoch');
    const db = getDb(env);

    await commitPersonalWrite(db, userId, () => []);
    await commitPersonalWrite(db, userId, () => []);

    const before = await env.DB.prepare('SELECT version, epoch FROM personal_sync_state WHERE user_id = ?')
      .bind(userId)
      .first<{ version: number; epoch: number }>();
    expect(before?.version).toBe(2);
    expect(before?.epoch).toBe(0);

    await db.batch([bumpPersonalEpoch(db, userId)] as unknown as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);

    const after = await env.DB.prepare('SELECT version, epoch FROM personal_sync_state WHERE user_id = ?')
      .bind(userId)
      .first<{ version: number; epoch: number }>();
    expect(after?.version).toBe(2);
    expect(after?.epoch).toBe(1);

    const userNew = 'u-psync-epoch-new';
    await seedUser(userNew, 'Sync Epoch New');
    await db.batch([bumpPersonalEpoch(db, userNew)] as unknown as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);

    const initial = await env.DB.prepare('SELECT version, epoch FROM personal_sync_state WHERE user_id = ?')
      .bind(userNew)
      .first<{ version: number; epoch: number }>();
    expect(initial?.version).toBe(0);
    expect(initial?.epoch).toBe(1);
  });
});
