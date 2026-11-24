import { and, asc, eq, exists, inArray, isNotNull, isNull, lte, ne, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { Env } from '@cc/api-db/env';
import { getDb } from '@cc/api-db/client';
import {
  accountMergeRequests,
  activity,
  attendanceCounted,
  attendanceScores,
  attendanceState,
  bankDetails,
  deviceExpenseGrants,
  deviceParticipants,
  membershipRequests,
  mergeProposals,
  notificationLogs,
  participantMergeRows,
  participantMerges,
  participants,
  paymentKeys,
  paymentRefs,
  personLinks,
  personalGroupLinkTags,
  personalGroupLinks,
  playerRatings,
  pushReminders,
  transactionShares,
  transactions,
  tripLocations,
  tripViews,
  trips,
  zaloChatLinks,
} from '@cc/api-db/schema';
import { isDbError } from '@cc/api-util/errors';

export const PURGE_BATCH_LIMIT = 10;

const TRIP_SCOPED_TABLES = [
  notificationLogs,
  tripViews,
  activity,
  paymentRefs,
  playerRatings,
  membershipRequests,
  mergeProposals,
  zaloChatLinks,
  deviceParticipants,
  deviceExpenseGrants,
  paymentKeys,
  pushReminders,
  tripLocations,
  attendanceScores,
  attendanceCounted,
  attendanceState,
  participants,
] as const;

/**
 * Permanently deletes groups whose 30-day grace period (`trips.delete_after <= now`) has elapsed.
 * Runs up to `PURGE_BATCH_LIMIT` due groups in a single atomic D1 batch (~30 statements total)
 * and rolls back via `trips.version NOT NULL` if any group was concurrently cancelled.
 */
export async function purgeDeletedGroups(env: Env, now: Date): Promise<void> {
  const db = getDb(env);
  const nowStr = now.toISOString();

  try {
    const due = await db
      .select({ id: trips.id })
      .from(trips)
      .where(and(isNotNull(trips.deleteAfter), lte(trips.deleteAfter, nowStr), ne(trips.preset, 'direct')))
      .orderBy(asc(trips.deleteAfter))
      .limit(PURGE_BATCH_LIMIT)
      .all();

    if (due.length === 0) return;

    const ids = due.map((row) => row.id);

    const guard = db
      .update(trips)
      .set({ deleteAfter: sql`${trips.deleteAfter}` })
      .where(
        and(
          inArray(trips.id, ids),
          isNotNull(trips.deleteAfter),
          lte(trips.deleteAfter, nowStr),
          ne(trips.preset, 'direct'),
        ),
      );

    // Must target all selected ids (Controller Guard 2 ruling) so any surviving cancelled trip
    // trips `NOT NULL constraint failed: trips.version` even if another selected trip was removed.
    const guardCheck = db
      .update(trips)
      .set({
        version: sql`CASE WHEN changes() = ${ids.length} THEN ${trips.version} + 1 ELSE NULL END`,
      })
      .where(inArray(trips.id, ids));

    const participantIdsForTrips = db
      .select({ id: participants.id })
      .from(participants)
      .where(inArray(participants.tripId, ids));

    const batch: BatchItem<'sqlite'>[] = [
      guard,
      guardCheck,
      db.delete(personalGroupLinkTags).where(
        exists(
          db
            .select({ one: sql`1` })
            .from(personalGroupLinks)
            .where(
              and(
                eq(personalGroupLinks.userId, personalGroupLinkTags.userId),
                eq(personalGroupLinks.rootId, personalGroupLinkTags.rootId),
                inArray(personalGroupLinks.tripId, ids),
              ),
            ),
        ),
      ),
      db.delete(personalGroupLinks).where(inArray(personalGroupLinks.tripId, ids)),
      db.delete(participantMergeRows).where(
        inArray(
          participantMergeRows.mergeId,
          db
            .select({ id: participantMerges.id })
            .from(participantMerges)
            .where(inArray(participantMerges.tripId, ids)),
        ),
      ),
      db.delete(participantMerges).where(inArray(participantMerges.tripId, ids)),
      db.delete(transactionShares).where(
        inArray(
          transactionShares.transactionId,
          db.select({ id: transactions.id }).from(transactions).where(inArray(transactions.tripId, ids)),
        ),
      ),
      db.delete(transactions).where(inArray(transactions.tripId, ids)),
      db.delete(bankDetails).where(and(isNull(bankDetails.userId), inArray(bankDetails.participantId, participantIdsForTrips))),
      db.delete(personLinks).where(inArray(personLinks.participantId, participantIdsForTrips)),
      db
        .update(accountMergeRequests)
        .set({
          status: sql`CASE WHEN ${accountMergeRequests.status} = 'pending' THEN 'cancelled' ELSE ${accountMergeRequests.status} END`,
          decidedAt: sql`CASE WHEN ${accountMergeRequests.status} = 'pending' THEN ${nowStr} ELSE ${accountMergeRequests.decidedAt} END`,
          claimTripId: null,
          claimParticipantId: null,
        })
        .where(inArray(accountMergeRequests.claimTripId, ids)),
      ...TRIP_SCOPED_TABLES.map((table) => db.delete(table).where(inArray(table.tripId, ids))),
      db.delete(trips).where(inArray(trips.id, ids)),
    ];

    await db.batch(batch as unknown as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
  } catch (err) {
    if (isDbError(err, 'NOT NULL constraint failed: trips.version')) return;
    console.error('Failed to purge deleted groups:', err);
  }
}
