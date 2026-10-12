import type { BatchItem } from 'drizzle-orm/batch';
import { and, eq, inArray, or } from 'drizzle-orm';
import type { Db } from '../db/client';
import type { ResolvedActor } from '../access/actor';
import {
  bankDetails,
  deviceParticipants,
  expenseShares,
  expenses,
  membershipRequests,
  participants,
  paymentRefs,
  payments,
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
      .update(expenses)
      .set({ payerId: intoId })
      .where(and(eq(expenses.tripId, tripId), eq(expenses.payerId, fromId))),
    db
      .update(expenses)
      .set({ createdByParticipantId: intoId })
      .where(
        and(
          eq(expenses.tripId, tripId),
          eq(expenses.createdByParticipantId, fromId),
        ),
      ),
  );

  // Subqueries, not lists of ids: D1 allows only 100 bound parameters per query.
  const tripExpenseIds = db.select({ id: expenses.id }).from(expenses).where(eq(expenses.tripId, tripId));
  const fromExpenseIdsQuery = db
    .select({ id: expenseShares.expenseId })
    .from(expenseShares)
    .where(and(inArray(expenseShares.expenseId, tripExpenseIds), eq(expenseShares.participantId, fromId)));

  {
    const fromShares = await db
      .select()
      .from(expenseShares)
      .where(and(inArray(expenseShares.expenseId, tripExpenseIds), eq(expenseShares.participantId, fromId)));

    const fromExpenseIds = fromShares.map((s) => s.expenseId);
    if (fromExpenseIds.length > 0) {
      const relevantShares = await db
        .select()
        .from(expenseShares)
        .where(inArray(expenseShares.expenseId, fromExpenseIdsQuery));

      const sharesByExpense = new Map<string, typeof relevantShares>();
      for (const s of relevantShares) {
        let list = sharesByExpense.get(s.expenseId);
        if (!list) {
          list = [];
          sharesByExpense.set(s.expenseId, list);
        }
        list.push(s);
      }

      for (const expId of fromExpenseIds) {
        const shares = sharesByExpense.get(expId) ?? [];
        const fromRow = shares.find((s) => s.participantId === fromId);
        const intoRow = shares.find((s) => s.participantId === intoId);

        if (!fromRow) continue;

        if (intoRow) {
          const newIntoAmount = intoRow.amount + fromRow.amount;
          queries.push(
            db
              .update(expenseShares)
              .set({ amount: newIntoAmount, inputValue: newIntoAmount })
              .where(
                and(
                  eq(expenseShares.expenseId, expId),
                  eq(expenseShares.participantId, intoId),
                ),
              ),
            db
              .delete(expenseShares)
              .where(
                and(
                  eq(expenseShares.expenseId, expId),
                  eq(expenseShares.participantId, fromId),
                ),
              ),
          );

          for (const other of shares) {
            if (other.participantId !== fromId && other.participantId !== intoId) {
              queries.push(
                db
                  .update(expenseShares)
                  .set({ inputValue: other.amount })
                  .where(
                    and(
                      eq(expenseShares.expenseId, expId),
                      eq(expenseShares.participantId, other.participantId),
                    ),
                  ),
              );
            }
          }

          queries.push(
            db
              .update(expenses)
              .set({ splitMode: 'amounts' })
              .where(eq(expenses.id, expId)),
          );
        } else {
          queries.push(
            db
              .update(expenseShares)
              .set({ participantId: intoId })
              .where(
                and(
                  eq(expenseShares.expenseId, expId),
                  eq(expenseShares.participantId, fromId),
                ),
              ),
          );
        }
      }
    }
  }

  const tripPayments = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.tripId, tripId),
        or(eq(payments.fromId, fromId), eq(payments.toId, fromId)),
      ),
    );

  for (const p of tripPayments) {
    const newFrom = p.fromId === fromId ? intoId : p.fromId;
    const newTo = p.toId === fromId ? intoId : p.toId;
    const isDisabled = newFrom === newTo;
    queries.push(
      db
        .update(payments)
        .set({
          fromId: newFrom,
          toId: newTo,
          ...(isDisabled ? { status: 'disabled' } : {}),
        })
        .where(eq(payments.id, p.id)),
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
