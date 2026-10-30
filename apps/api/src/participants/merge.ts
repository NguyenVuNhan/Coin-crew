import type { BatchItem } from 'drizzle-orm/batch';
import { and, eq, getTableColumns, inArray, or, sql } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { Db } from '../db/client';
import type { ResolvedActor } from '../access/actor';
import {
  bankDetails,
  deviceParticipants,
  membershipRequests,
  participants,
  participantMergeRows,
  participantMerges,
  paymentRefs,
  transactions,
  transactionShares,
} from '../db/schema';
import { commitTripWrite } from '../lib/commit';
import { ApiError, isDbError } from '../lib/errors';
import { newId, nowIso } from '../lib/ids';

/** Rows per participant_merge_rows insert: 4 bound params each, D1 allows 100 per statement. */
const MERGE_ROWS_PER_INSERT = 25;

/** A row as the database stores it (column names, not Drizzle property names). */
function dbRow(table: SQLiteTable, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [prop, col] of Object.entries(getTableColumns(table))) {
    out[col.name] = row[prop];
  }
  return out;
}

/** Collects the before-image of every row a merge changes, keyed by primary key. */
class MergeLog {
  readonly rows = new Map<string, { tableName: string; rowKey: string; beforeJson: string }>();

  add(table: SQLiteTable, tableName: string, keyColumns: string[], row: Record<string, unknown>): void {
    const before = dbRow(table, row);
    const key: Record<string, unknown> = {};
    for (const k of keyColumns) key[k] = before[k];
    const rowKey = JSON.stringify(key);
    const id = `${tableName}|${rowKey}`;
    if (!this.rows.has(id)) {
      this.rows.set(id, { tableName, rowKey, beforeJson: JSON.stringify(before) });
    }
  }
}

/** A participant with a pending membership request blocks any merge involving them. */
function claimPending(): ApiError {
  return new ApiError('CONFLICT', 409, 'CLAIM_PENDING');
}

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

  const actorUserId = actor.userId;
  if (actorUserId === null) {
    throw new ApiError('FORBIDDEN', 403);
  }

  const pending = await db
    .select({ id: membershipRequests.id })
    .from(membershipRequests)
    .where(
      and(
        inArray(membershipRequests.participantId, [fromId, intoId]),
        eq(membershipRequests.status, 'pending'),
      ),
    )
    .get();
  if (pending) {
    throw claimPending();
  }

  const log = new MergeLog();
  const logParticipant = (row: Record<string, unknown>) => log.add(participants, 'participants', ['id'], row);
  const logTransaction = (row: Record<string, unknown>) => log.add(transactions, 'transactions', ['id'], row);
  const logShare = (row: Record<string, unknown>) =>
    log.add(transactionShares, 'transaction_shares', ['transaction_id', 'participant_id'], row);

  const mergeId = newId();
  // Goes first in the batch and doubles as the race guard: if a claim became pending since the
  // check above, actor_user_id is NULL, the NOT NULL constraint fails, and the whole batch rolls back.
  const queries: BatchItem<'sqlite'>[] = [
    db.insert(participantMerges).values({
      id: mergeId,
      tripId,
      fromId,
      intoId,
      actorUserId: sql`CASE WHEN EXISTS (SELECT 1 FROM membership_requests WHERE participant_id IN (${fromId}, ${intoId}) AND status = 'pending') THEN NULL ELSE ${actorUserId} END`,
      createdAt: nowIso(),
    }),
  ];

  logParticipant(from);
  if (from.userId !== null && into.userId === null) {
    logParticipant(into);
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

  const touchedTransactions = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.tripId, tripId),
        or(
          eq(transactions.payerId, fromId),
          eq(transactions.createdByParticipantId, fromId),
          eq(transactions.toId, fromId),
        ),
      ),
    );
  for (const t of touchedTransactions) logTransaction(t);

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

    for (const share of fromShares) logShare(share);

    const fromTxIds = fromShares.map((s) => s.transactionId);
    if (fromTxIds.length > 0) {
      const sharedTransactions = await db
        .select()
        .from(transactions)
        .where(and(inArray(transactions.id, fromTxIdsQuery), eq(transactions.type, 'expense')));
      const sharedTxById = new Map(sharedTransactions.map((t) => [t.id, t]));

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
          for (const share of shares) logShare(share);
          const sharedTx = sharedTxById.get(txId);
          if (sharedTx) logTransaction(sharedTx);

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

  const touchedRefs = await db
    .select()
    .from(paymentRefs)
    .where(and(eq(paymentRefs.tripId, tripId), or(eq(paymentRefs.fromId, fromId), eq(paymentRefs.toId, fromId))));
  for (const r of touchedRefs) log.add(paymentRefs, 'payment_refs', ['trip_id', 'code'], r);

  const touchedDevices = await db
    .select()
    .from(deviceParticipants)
    .where(and(eq(deviceParticipants.tripId, tripId), eq(deviceParticipants.participantId, fromId)));
  for (const d of touchedDevices) log.add(deviceParticipants, 'device_participants', ['device_hash', 'trip_id'], d);

  const touchedRequests = await db
    .select()
    .from(membershipRequests)
    .where(and(eq(membershipRequests.tripId, tripId), eq(membershipRequests.participantId, fromId)));
  for (const r of touchedRequests) log.add(membershipRequests, 'membership_requests', ['id'], r);

  const touchedBanks = await db.select().from(bankDetails).where(eq(bankDetails.participantId, fromId));
  for (const b of touchedBanks) log.add(bankDetails, 'bank_details', ['id'], b);

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

  const logRows = [...log.rows.values()];
  for (let i = 0; i < logRows.length; i += MERGE_ROWS_PER_INSERT) {
    queries.push(
      db.insert(participantMergeRows).values(
        logRows.slice(i, i + MERGE_ROWS_PER_INSERT).map((r) => ({ mergeId, ...r })),
      ),
    );
  }

  try {
    await commitTripWrite(db, tripId, queries, {
      action: 'name_merged',
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details: { fromName: from.name, intoName: into.name },
    });
  } catch (err) {
    if (isDbError(err, 'NOT NULL constraint failed: participant_merges.actor_user_id')) {
      throw claimPending();
    }
    throw err;
  }
}
