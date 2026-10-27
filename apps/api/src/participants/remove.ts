import type { BatchItem } from 'drizzle-orm/batch';
import { and, eq, or, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { nowIso } from '../lib/ids';
import {
  bankDetails,
  deviceParticipants,
  membershipRequests,
  participants,
  playerRatings,
  transactions,
  transactionShares,
} from '../db/schema';

/** Takes a participant out of a trip: deleted if no history, status 'left' if history exists. */
export async function takeOutOfTrip(
  db: Db,
  tripId: string,
  participantId: string,
): Promise<{ queries: BatchItem<'sqlite'>[]; outcome: 'deleted' | 'left' }> {
  const txInvolved = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.tripId, tripId),
        or(
          eq(transactions.payerId, participantId),
          eq(transactions.toId, participantId),
          eq(transactions.createdByParticipantId, participantId),
        ),
      ),
    )
    .limit(1)
    .get();

  let hasHistory = Boolean(txInvolved);

  if (!hasHistory) {
    const share = await db
      .select({ transactionId: transactionShares.transactionId })
      .from(transactionShares)
      .innerJoin(transactions, eq(transactionShares.transactionId, transactions.id))
      .where(
        and(
          eq(transactions.tripId, tripId),
          eq(transactionShares.participantId, participantId),
        ),
      )
      .limit(1)
      .get();

    hasHistory = Boolean(share);
  }

  const deleteRatingsQuery = db
    .delete(playerRatings)
    .where(
      and(
        eq(playerRatings.tripId, tripId),
        or(
          eq(playerRatings.raterParticipantId, participantId),
          eq(playerRatings.targetParticipantId, participantId),
        ),
      ),
    );

  if (!hasHistory) {
    return {
      outcome: 'deleted',
      queries: [
        db
          .delete(participants)
          .where(and(eq(participants.id, participantId), eq(participants.tripId, tripId))),
        db
          .delete(deviceParticipants)
          .where(
            and(
              eq(deviceParticipants.participantId, participantId),
              eq(deviceParticipants.tripId, tripId),
            ),
          ),
        deleteRatingsQuery,
      ],
    };
  }

  return {
    outcome: 'left',
    queries: [
      db
        .update(participants)
        .set({ status: 'left', isAdmin: 0 })
        .where(eq(participants.id, participantId)),
      db
        .delete(deviceParticipants)
        .where(
          and(
            eq(deviceParticipants.participantId, participantId),
            eq(deviceParticipants.tripId, tripId),
          ),
        ),
      deleteRatingsQuery,
      db
        .update(membershipRequests)
        .set({ status: 'rejected' })
        .where(
          and(
            eq(membershipRequests.participantId, participantId),
            eq(membershipRequests.tripId, tripId),
            eq(membershipRequests.status, 'pending'),
          ),
        ),
      db
        .update(bankDetails)
        .set({ status: 'rejected' })
        .where(
          and(
            eq(bankDetails.participantId, participantId),
            eq(bankDetails.status, 'pending'),
          ),
        ),
      // Nobody can confirm a payment waiting for someone who left, and a left person counts as a guest receiver,
      // so what was said paid to them counts now (as if they had confirmed it).
      db
        .update(transactions)
        .set({
          status: 'confirmed',
          amountConfirmed: sql`${transactions.amount}`,
          confirmedByParticipantId: participantId,
          updatedAt: nowIso(),
        })
        .where(
          and(
            eq(transactions.tripId, tripId),
            eq(transactions.type, 'payment'),
            eq(transactions.toId, participantId),
            eq(transactions.status, 'says_paid'),
          ),
        ),
    ],
  };
}
