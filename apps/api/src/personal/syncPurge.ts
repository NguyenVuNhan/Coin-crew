import { lt, sql } from 'drizzle-orm';
import type { Env } from '@cc/api-db/env';
import { getDb } from '@cc/api-db/client';
import { personalSyncDeletions, personalSyncState } from '@cc/api-db/schema';

export async function purgeSyncDeletions(env: Env, now: Date): Promise<void> {
  try {
    const cutoff = new Date(now.getTime() - 90 * 86_400_000).toISOString();
    const db = getDb(env);

    await db.batch([
      db
        .update(personalSyncState)
        .set({
          purgedVersion: sql`MAX(purged_version, (SELECT MAX(version) FROM personal_sync_deletions d WHERE d.user_id = personal_sync_state.user_id AND d.deleted_at < ${cutoff}))`,
          updatedAt: now.toISOString(),
        })
        .where(
          sql`user_id IN (SELECT user_id FROM personal_sync_deletions WHERE deleted_at < ${cutoff})`,
        ),
      db
        .delete(personalSyncDeletions)
        .where(lt(personalSyncDeletions.deletedAt, cutoff)),
    ]);
  } catch (err) {
    console.error('Failed to purge sync deletions:', err);
  }
}
