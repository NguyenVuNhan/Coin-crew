import type { BatchItem } from 'drizzle-orm/batch';
import { and, eq, or } from 'drizzle-orm';
import type { Db } from '../db/client';
import {
  bankDetails,
  deviceParticipants,
  membershipRequests,
  participants,
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
    ],
  };
}
