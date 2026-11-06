import { and, desc, eq, gt, isNotNull } from 'drizzle-orm';
import type { Db } from '@cc/api-db/client';
import { accountMergeRequests } from '@cc/api-db/schema';
import { nowIso } from '@cc/api-util/ids';

export async function getClaimGrant(
  db: Db,
  userId: string | null,
  tripId: string,
): Promise<{ requestId: string; participantId: string } | null> {
  if (!userId) return null;
  const now = nowIso();
  const row = await db
    .select({
      requestId: accountMergeRequests.id,
      participantId: accountMergeRequests.claimParticipantId,
    })
    .from(accountMergeRequests)
    .where(
      and(
        eq(accountMergeRequests.mergedUserId, userId),
        eq(accountMergeRequests.claimTripId, tripId),
        eq(accountMergeRequests.initiatedBy, 'merged'),
        eq(accountMergeRequests.status, 'pending'),
        gt(accountMergeRequests.expiresAt, now),
        isNotNull(accountMergeRequests.claimParticipantId),
      ),
    )
    .orderBy(desc(accountMergeRequests.createdAt))
    .get();
  if (!row || !row.participantId) return null;
  return { requestId: row.requestId, participantId: row.participantId };
}
