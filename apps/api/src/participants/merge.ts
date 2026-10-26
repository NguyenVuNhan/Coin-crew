import type { BatchItem } from 'drizzle-orm/batch';
import { and, eq, inArray, or } from 'drizzle-orm';
import type { Db } from '../db/client';
import type { ResolvedActor } from '../access/actor';
import {
  bankDetails,
  deviceParticipants,
  membershipRequests,
  participants,
  paymentRefs,
  transactions,
  transactionShares,
} from '../db/schema';
import { commitTripWrite } from '../lib/commit';
import { ApiError } from '../lib/errors';

export async function mergeParticipants(
  db: Db,
  tripId: string,
  fromId: string,
  intoId: string,
  actor: ResolvedActor,
): Promise<void> {
  if (fromId === intoId) {
    throw new ApiError('VALIDATION', 422, 'Cannot merge person into themselves');
  }

  const [from, into] = await Promise.all([
    db
      .select()
      .from(participants)
      .where(and(eq(participants.id, fromId), eq(participants.tripId, tripId)))
      .get(),
    db
      .select()
      .from(participants)
      .where(and(eq(participants.id, intoId), eq(participants.tripId, tripId)))
      .get(),
  ]);

  if (
    !from ||
    !into ||
    (from.status !== 'active' && from.status !== 'pending') ||
    (into.status !== 'active' && into.status !== 'pending')
  ) {
    throw new ApiError('VALIDATION', 422, 'Invalid participants for merge');
  }

  if (from.userId !== null && into.userId !== null && from.userId !== into.userId) {
    throw new ApiError('VALIDATION', 422, 'Both names belong to signed-in people.');
  }

  const queries: BatchItem<'sqlite'>[] = [];

  if (from.userId !== null && into.userId === null) {
    queries.push(
      db
        .update(participants)
        .set({ userId: from.userId })
        .where(eq(participants.id, intoId)),
    );
  }

  queries.push(
    db
      .update(participants)
      .set({
        status: 'merged',
        mergedInto: intoId,
        ...(from.userId !== null && into.userId === null ? { userId: null } : {}),
      })
      .where(eq(participants.id, fromId)),
  );

  queries.push(
    db
      .update(transactions)
      .set({ payerId: intoId })
      .where(and(eq(transactions.tripId, tripId), eq(transactions.payerId, fromId))),
    db
      .update(transactions)
      .set({ createdByParticipantId: intoId })
      .where(
        and(
          eq(transactions.tripId, tripId),
          eq(transactions.createdByParticipantId, fromId),
        ),
      ),
  );

  // Subqueries, not lists of ids: D1 allows only 100 bound parameters per query.
  const tripTxIds = db.select({ id: transactions.id }).from(transactions).where(eq(transactions.tripId, tripId));
  const fromTxIdsQuery = db
    .select({ id: transactionShares.transactionId })
    .from(transactionShares)
    .where(and(inArray(transactionShares.transactionId, tripTxIds), eq(transactionShares.participantId, fromId)));

  {
    const fromShares = await db
      .select()
      .from(transactionShares)
      .where(and(inArray(transactionShares.transactionId, tripTxIds), eq(transactionShares.participantId, fromId)));

    const fromTxIds = fromShares.map((s) => s.transactionId);
    if (fromTxIds.length > 0) {
      const relevantShares = await db
        .select()
        .from(transactionShares)
        .where(inArray(transactionShares.transactionId, fromTxIdsQuery));

      const sharesByTx = new Map<string, typeof relevantShares>();
      for (const s of relevantShares) {
        let list = sharesByTx.get(s.transactionId);
        if (!list) {
          list = [];
          sharesByTx.set(s.transactionId, list);
        }
        list.push(s);
      }

      for (const txId of fromTxIds) {
        const shares = sharesByTx.get(txId) ?? [];
        const fromRow = shares.find((s) => s.participantId === fromId);
        const intoRow = shares.find((s) => s.participantId === intoId);

        if (!fromRow) continue;

        if (intoRow) {
          const newIntoAmount = intoRow.amount + fromRow.amount;
          queries.push(
            db
              .update(transactionShares)
              .set({ amount: newIntoAmount, inputValue: newIntoAmount, inputAuto: 0 })
              .where(
                and(
                  eq(transactionShares.transactionId, txId),
                  eq(transactionShares.participantId, intoId),
                ),
              ),
            db
              .delete(transactionShares)
              .where(
                and(
                  eq(transactionShares.transactionId, txId),
                  eq(transactionShares.participantId, fromId),
                ),
              ),
          );

          for (const other of shares) {
            if (other.participantId !== fromId && other.participantId !== intoId) {
              queries.push(
                db
                  .update(transactionShares)
                  .set({ inputValue: other.amount, inputAuto: 0 })
                  .where(
                    and(
                      eq(transactionShares.transactionId, txId),
                      eq(transactionShares.participantId, other.participantId),
                    ),
                  ),
              );
            }
          }

          queries.push(
            db
              .update(transactions)
              .set({ splitMode: 'amounts' })
              .where(and(eq(transactions.id, txId), eq(transactions.type, 'expense'))),
          );
        } else {
          queries.push(
            db
              .update(transactionShares)
              .set({ participantId: intoId })
              .where(
                and(
                  eq(transactionShares.transactionId, txId),
                  eq(transactionShares.participantId, fromId),
                ),
              ),
          );
        }
      }
    }
  }

  const tripPayments = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.tripId, tripId),
        eq(transactions.type, 'payment'),
        or(eq(transactions.payerId, fromId), eq(transactions.toId, fromId)),
      ),
    );

  for (const p of tripPayments) {
    const newFrom = p.payerId === fromId ? intoId : p.payerId;
    const newTo = p.toId === fromId ? intoId : p.toId;
    const isDisabled = newFrom === newTo;
    queries.push(
      db
        .update(transactions)
        .set({
          payerId: newFrom,
          toId: newTo,
          ...(isDisabled ? { status: 'disabled' } : {}),
        })
        .where(eq(transactions.id, p.id)),
    );
  }

  queries.push(
    db
      .update(paymentRefs)
      .set({ fromId: intoId })
      .where(and(eq(paymentRefs.tripId, tripId), eq(paymentRefs.fromId, fromId))),
    db
      .update(paymentRefs)
      .set({ toId: intoId })
      .where(and(eq(paymentRefs.tripId, tripId), eq(paymentRefs.toId, fromId))),
  );

  queries.push(
    db
      .update(deviceParticipants)
      .set({ participantId: intoId })
      .where(
        and(
          eq(deviceParticipants.tripId, tripId),
          eq(deviceParticipants.participantId, fromId),
        ),
      ),
  );

  queries.push(
    db
      .update(membershipRequests)
      .set({ participantId: intoId })
      .where(
        and(
          eq(membershipRequests.tripId, tripId),
          eq(membershipRequests.participantId, fromId),
        ),
      ),
  );

  const intoApprovedBank = await db
    .select({ id: bankDetails.id })
    .from(bankDetails)
    .where(
      and(
        eq(bankDetails.participantId, intoId),
        eq(bankDetails.status, 'approved'),
      ),
    )
    .get();

  if (intoApprovedBank) {
    queries.push(
      db
        .update(bankDetails)
        .set({ status: 'replaced' })
        .where(eq(bankDetails.participantId, fromId)),
    );
  } else {
    queries.push(
      db
        .update(bankDetails)
        .set({ participantId: intoId })
        .where(eq(bankDetails.participantId, fromId)),
    );
  }

  await commitTripWrite(db, tripId, queries, {
    action: 'name_merged',
    actorParticipantId: actor.participantId,
    actorUserId: actor.userId,
    actorDevice: actor.deviceHash,
    details: { fromName: from.name, intoName: into.name },
  });
}
