import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { purgeSyncDeletions } from '../src/personal/syncPurge';
import { seedUser } from './helpers';

describe('purgeSyncDeletions', () => {
  it('records older than 90 days are removed and purgedVersion rises', async () => {
    const userId = 'u-psync-purge-1';
    await seedUser(userId, 'Purge User 1');

    const now = new Date('2026-11-19T12:00:00.000Z');
    const hundredDaysAgo = new Date(now.getTime() - 100 * 86_400_000).toISOString();
    const tenDaysAgo = new Date(now.getTime() - 10 * 86_400_000).toISOString();

    await env.DB.prepare(
      'INSERT INTO personal_sync_state (user_id, version, epoch, purged_version, updated_at) VALUES (?, 7, 0, 0, ?)',
    )
      .bind(userId, now.toISOString())
      .run();

    await env.DB.prepare(
      'INSERT INTO personal_sync_deletions (user_id, transaction_id, version, deleted_at) VALUES (?, ?, 3, ?), (?, ?, 6, ?)',
    )
      .bind(userId, 'tx-del-100d', hundredDaysAgo, userId, 'tx-del-10d', tenDaysAgo)
      .run();

    await purgeSyncDeletions(env, now);

    const state = await env.DB.prepare(
      'SELECT version, purged_version FROM personal_sync_state WHERE user_id = ?',
    )
      .bind(userId)
      .first<{ version: number; purged_version: number }>();
    expect(state?.purged_version).toBe(3);
    expect(state?.version).toBe(7);

    const deletions = await env.DB.prepare(
      'SELECT transaction_id, version FROM personal_sync_deletions WHERE user_id = ?',
    )
      .bind(userId)
      .all<{ transaction_id: string; version: number }>();
    expect(deletions.results).toHaveLength(1);
    expect(deletions.results[0]?.version).toBe(6);
    expect(deletions.results[0]?.transaction_id).toBe('tx-del-10d');
  });

  it('newer records stay and purged_version is unchanged when nothing is old', async () => {
    const userId = 'u-psync-purge-2';
    await seedUser(userId, 'Purge User 2');

    const now = new Date('2026-11-19T12:00:00.000Z');
    const tenDaysAgo = new Date(now.getTime() - 10 * 86_400_000).toISOString();
    const twentyDaysAgo = new Date(now.getTime() - 20 * 86_400_000).toISOString();

    await env.DB.prepare(
      'INSERT INTO personal_sync_state (user_id, version, epoch, purged_version, updated_at) VALUES (?, 5, 0, 0, ?)',
    )
      .bind(userId, now.toISOString())
      .run();

    await env.DB.prepare(
      'INSERT INTO personal_sync_deletions (user_id, transaction_id, version, deleted_at) VALUES (?, ?, 4, ?), (?, ?, 5, ?)',
    )
      .bind(userId, 'tx-del-20d', twentyDaysAgo, userId, 'tx-del-10d', tenDaysAgo)
      .run();

    await purgeSyncDeletions(env, now);

    const state = await env.DB.prepare(
      'SELECT version, purged_version FROM personal_sync_state WHERE user_id = ?',
    )
      .bind(userId)
      .first<{ version: number; purged_version: number }>();
    expect(state?.purged_version).toBe(0);
    expect(state?.version).toBe(5);

    const deletions = await env.DB.prepare(
      'SELECT transaction_id, version FROM personal_sync_deletions WHERE user_id = ? ORDER BY version ASC',
    )
      .bind(userId)
      .all<{ transaction_id: string; version: number }>();
    expect(deletions.results).toHaveLength(2);
    expect(deletions.results.map((r) => r.version)).toEqual([4, 5]);
  });

  it('a user with no old records keeps purged_version 0', async () => {
    const userId = 'u-psync-purge-3';
    await seedUser(userId, 'Purge User 3');

    const now = new Date('2026-11-19T12:00:00.000Z');
    const fiveDaysAgo = new Date(now.getTime() - 5 * 86_400_000).toISOString();

    await env.DB.prepare(
      'INSERT INTO personal_sync_state (user_id, version, epoch, purged_version, updated_at) VALUES (?, 2, 0, 0, ?)',
    )
      .bind(userId, now.toISOString())
      .run();

    await env.DB.prepare(
      'INSERT INTO personal_sync_deletions (user_id, transaction_id, version, deleted_at) VALUES (?, ?, 1, ?)',
    )
      .bind(userId, 'tx-del-5d', fiveDaysAgo)
      .run();

    const otherUserId = 'u-psync-purge-other';
    await seedUser(otherUserId, 'Purge Other User');
    const hundredDaysAgo = new Date(now.getTime() - 100 * 86_400_000).toISOString();

    await env.DB.prepare(
      'INSERT INTO personal_sync_state (user_id, version, epoch, purged_version, updated_at) VALUES (?, 10, 0, 0, ?)',
    )
      .bind(otherUserId, now.toISOString())
      .run();

    await env.DB.prepare(
      'INSERT INTO personal_sync_deletions (user_id, transaction_id, version, deleted_at) VALUES (?, ?, 8, ?)',
    )
      .bind(otherUserId, 'tx-other-old', hundredDaysAgo)
      .run();

    await purgeSyncDeletions(env, now);

    const state = await env.DB.prepare(
      'SELECT purged_version FROM personal_sync_state WHERE user_id = ?',
    )
      .bind(userId)
      .first<{ purged_version: number }>();
    expect(state?.purged_version).toBe(0);

    const otherState = await env.DB.prepare(
      'SELECT purged_version FROM personal_sync_state WHERE user_id = ?',
    )
      .bind(otherUserId)
      .first<{ purged_version: number }>();
    expect(otherState?.purged_version).toBe(8);
  });
});
