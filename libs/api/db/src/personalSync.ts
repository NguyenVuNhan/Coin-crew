import { nowIso } from '@cc/api-util/ids';
import type { BatchItem } from 'drizzle-orm/batch';
import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { Db } from './client';
import { personalSyncDeletions, personalSyncState } from './schema';

/** SQL expression resolving to the user's current personal sync version. */
export function personalVersionExpr(userId: string): SQL {
  return sql`(SELECT version FROM personal_sync_state WHERE user_id = ${userId})`;
}

/** Batch item that bumps the user's sync version (or initializes it at 1). */
export function personalBumpStatement(db: Db, userId: string): BatchItem<'sqlite'> {
  const now = nowIso();
  return db
    .insert(personalSyncState)
    .values({
      userId,
      version: 1,
      epoch: 0,
      purgedVersion: 0,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: personalSyncState.userId,
      set: {
        version: sql`${personalSyncState.version} + 1`,
        updatedAt: sql`excluded.updated_at`,
      },
    }) as unknown as BatchItem<'sqlite'>;
}

/** Commits a personal write batch by bumping the user's version and running the built statements. */
export async function commitPersonalWrite(
  db: Db,
  userId: string,
  build: (v: SQL) => BatchItem<'sqlite'>[],
): Promise<void> {
  await db.batch([
    personalBumpStatement(db, userId),
    ...build(personalVersionExpr(userId)),
  ] as unknown as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
}

/**
 * Batch item recording the personal transactions matched by `where` as deleted, at the current version.
 * Place it before the DELETE in the same batch (after the bump), so the rows still exist to be read.
 */
export function recordDeletions(db: Db, userId: string, where: SQL): BatchItem<'sqlite'> {
  return db
    .insert(personalSyncDeletions)
    .select(
      sql`SELECT user_id, id, ${personalVersionExpr(userId)}, ${nowIso()} FROM personal_transactions WHERE user_id = ${userId} AND (${where})`,
    )
    .onConflictDoUpdate({
      target: [personalSyncDeletions.userId, personalSyncDeletions.transactionId],
      set: { version: sql`excluded.version`, deletedAt: sql`excluded.deleted_at` },
    }) as unknown as BatchItem<'sqlite'>;
}

/** Batch item deleting records from personal_sync_deletions for the given transaction IDs. */
export function clearDeletions(db: Db, userId: string, ids: string[]): BatchItem<'sqlite'> {
  return db
    .delete(personalSyncDeletions)
    .where(
      and(
        eq(personalSyncDeletions.userId, userId),
        ids.length === 0 ? sql`0 = 1` : inArray(personalSyncDeletions.transactionId, ids),
      ),
    ) as unknown as BatchItem<'sqlite'>;
}

/** Batch item that raises the user's sync epoch by 1 and leaves version unchanged. */
export function bumpPersonalEpoch(db: Db, userId: string): BatchItem<'sqlite'> {
  const now = nowIso();
  return db
    .insert(personalSyncState)
    .values({
      userId,
      version: 0,
      epoch: 1,
      purgedVersion: 0,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: personalSyncState.userId,
      set: {
        epoch: sql`${personalSyncState.epoch} + 1`,
        updatedAt: sql`excluded.updated_at`,
      },
    }) as unknown as BatchItem<'sqlite'>;
}
