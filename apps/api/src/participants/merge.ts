import type { BatchItem } from 'drizzle-orm/batch';
import { and, eq, getTableColumns, inArray, or, sql } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { Db } from '@cc/api-db/client';
import type { ResolvedActor } from '@cc/api-auth/actor';
import {
  attendanceScores,
  attendanceState,
  bankDetails,
  deviceParticipants,
  membershipRequests,
  nicknames,
  participants,
  participantMergeRows,
  participantMerges,
  paymentRefs,
  personLinks,
  transactions,
  transactionShares,
} from '@cc/api-db/schema';
import { commitTripWrite } from '@cc/api-db/commit';
import { ApiError, isDbError, validationError } from '@cc/api-util/errors';
import { newId, nowIso } from '@cc/api-util/ids';

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
  /** Only these are read: the user records the merge, and all three go in the activity log. */
  actor: Pick<ResolvedActor, 'userId' | 'participantId' | 'deviceHash'>,
): Promise<void> {
  if (fromId === intoId) {
    throw validationError('pickDifferentPeople', 'Cannot merge person into themselves');
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
    throw validationError('bothSignedIn', 'Both names belong to signed-in people.');
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
  // check above, or another request already merged either person away, actor_user_id is NULL,
  // the NOT NULL constraint fails, and the whole batch rolls back.
  const queries: BatchItem<'sqlite'>[] = [
    db.insert(participantMerges).values({
      id: mergeId,
      tripId,
      fromId,
      intoId,
      actorUserId: sql`CASE WHEN EXISTS (SELECT 1 FROM membership_requests WHERE participant_id IN (${fromId}, ${intoId}) AND status = 'pending')
        OR NOT EXISTS (SELECT 1 FROM participants WHERE id = ${fromId} AND status IN ('active', 'pending'))
        OR NOT EXISTS (SELECT 1 FROM participants WHERE id = ${intoId} AND status IN ('active', 'pending'))
        THEN NULL ELSE ${actorUserId} END`,
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

  // One note per payer→receiver pair (payment_refs_trip_pair_uidx). Before moving fromId's notes onto
  // intoId, drop the ones that would collide: notes between the two (they'd become self-pairs) and
  // fromId's notes to/from someone intoId already has a note with. The survivor's note is kept (it's
  // the code people have been seeing). Every dropped row is in touchedRefs, so the log restores it.
  const refsOf = (col: 'fromId' | 'toId', who: string) =>
    db
      .select({ id: col === 'fromId' ? paymentRefs.toId : paymentRefs.fromId })
      .from(paymentRefs)
      .where(and(eq(paymentRefs.tripId, tripId), eq(paymentRefs[col], who)));
  queries.push(
    db
      .delete(paymentRefs)
      .where(
        and(
          eq(paymentRefs.tripId, tripId),
          or(
            and(eq(paymentRefs.fromId, fromId), eq(paymentRefs.toId, intoId)),
            and(eq(paymentRefs.fromId, intoId), eq(paymentRefs.toId, fromId)),
          ),
        ),
      ),
    db
      .delete(paymentRefs)
      .where(
        and(
          eq(paymentRefs.tripId, tripId),
          eq(paymentRefs.fromId, fromId),
          inArray(paymentRefs.toId, refsOf('fromId', intoId)),
        ),
      ),
    db
      .delete(paymentRefs)
      .where(
        and(
          eq(paymentRefs.tripId, tripId),
          eq(paymentRefs.toId, fromId),
          inArray(paymentRefs.fromId, refsOf('toId', intoId)),
        ),
      ),
  );

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

  // People-view data follows the survivor (spec goal 11): owners' links, nicknames and the request
  // link. Otherwise a link or a settlement could land on the merged, invisible row.
  const fromKey = `p:${fromId}`;
  const intoKey = `p:${intoId}`;
  const [linksToFrom, linksOfFrom, linksOfInto, nicks, scoreRows] = await Promise.all([
    db.select().from(personLinks).where(eq(personLinks.personPid, fromId)),
    db.select().from(personLinks).where(eq(personLinks.participantId, fromId)),
    db.select().from(personLinks).where(eq(personLinks.participantId, intoId)),
    db.select().from(nicknames).where(inArray(nicknames.personKey, [fromKey, intoKey])),
    db
      .select()
      .from(attendanceScores)
      .where(and(eq(attendanceScores.tripId, tripId), inArray(attendanceScores.participantId, [fromId, intoId]))),
  ]);
  const logLink = (row: Record<string, unknown>) => log.add(personLinks, 'person_links', ['owner_user_id', 'participant_id'], row);

  for (const l of linksToFrom) logLink(l);
  if (linksToFrom.length > 0) {
    queries.push(db.update(personLinks).set({ personPid: intoId }).where(eq(personLinks.personPid, fromId)));
  }
  for (const l of linksOfFrom) {
    logLink(l);
    // The survivor's own link for that owner wins; otherwise the link moves to the survivor.
    const where = and(eq(personLinks.ownerUserId, l.ownerUserId), eq(personLinks.participantId, fromId));
    queries.push(
      linksOfInto.some((i) => i.ownerUserId === l.ownerUserId)
        ? db.delete(personLinks).where(where)
        : db.update(personLinks).set({ participantId: intoId }).where(where),
    );
  }

  for (const n of nicks.filter((x) => x.personKey === fromKey)) {
    log.add(nicknames, 'nicknames', ['owner_user_id', 'person_key'], n);
    const where = and(eq(nicknames.ownerUserId, n.ownerUserId), eq(nicknames.personKey, fromKey));
    queries.push(
      nicks.some((x) => x.personKey === intoKey && x.ownerUserId === n.ownerUserId)
        ? db.delete(nicknames).where(where)
        : db.update(nicknames).set({ personKey: intoKey }).where(where),
    );
  }

  // Attendance: the survivor keeps the higher of each score (spec: every merge), computed in SQL at
  // write time so a count landing between our read and this batch can't be undone by stale values.
  // Same rule as mergeScores (@cc/core): MAX of every number; last_* from the row with the later
  // last_played_on (NULL last, tie -> into). HAVING: nothing is written unless from has a row.
  // The read above only feeds the merge log's before-images.
  for (const r of scoreRows) log.add(attendanceScores, 'attendance_scores', ['trip_id', 'participant_id'], r);
  const pair = sql`${attendanceScores.tripId} = ${tripId} AND ${attendanceScores.participantId} IN (${fromId}, ${intoId})`;
  const fromLater = (col: string) =>
    sql`(SELECT ${sql.raw(col)} FROM attendance_scores WHERE ${pair}
      ORDER BY last_played_on IS NULL, last_played_on DESC, participant_id = ${intoId} DESC LIMIT 1)`;
  const maxCols = [
    'presence', 'reliability', 'guest',
    'presence_join_streak', 'presence_skip_streak', 'reliability_join_streak', 'reliability_skip_streak',
    'sessions_seen', 'sessions_planned', 'times_played', 'guests_total',
  ] as const;
  const lastCols = ['last_played_on', 'last_session_root', 'last_back', 'last_return_gap', 'last_ended_no_show_streak'] as const;
  const byName = new Map(Object.values(getTableColumns(attendanceScores)).map((c) => [c.name, c]));
  // Columns in table order: drizzle's INSERT … SELECT lists every column of the table in that order.
  const selectCols = [...byName.keys()].map((name) => {
    if (name === 'trip_id') return sql`${tripId}`;
    if (name === 'participant_id') return sql`${intoId}`;
    if (name === 'updated_at') return sql`${nowIso()}`;
    if ((maxCols as readonly string[]).includes(name)) return sql`MAX(${sql.raw(name)})`;
    if ((lastCols as readonly string[]).includes(name)) return fromLater(name);
    throw new Error(`attendance_scores.${name} has no merge rule`);
  });
  const conflictSet = Object.fromEntries(
    Object.entries(getTableColumns(attendanceScores))
      .filter(([, c]) => c.name !== 'trip_id' && c.name !== 'participant_id')
      .map(([key, c]) => [key, sql.raw(`excluded."${c.name}"`)]),
  );
  queries.push(
    db
      .insert(attendanceScores)
      .select(
        sql`SELECT ${sql.join(selectCols, sql`, `)} FROM attendance_scores WHERE ${pair}
          HAVING SUM(participant_id = ${fromId}) > 0`,
      )
      .onConflictDoUpdate({ target: [attendanceScores.tripId, attendanceScores.participantId], set: conflictSet }),
    db
      .delete(attendanceScores)
      .where(and(eq(attendanceScores.tripId, tripId), eq(attendanceScores.participantId, fromId))),
    // Always: any count that read scores before this merge must miss its version guard ('raced')
    // rather than write pre-merge rows back. Its sessions stay uncounted until the next count.
    db
      .insert(attendanceState)
      .values({ tripId, version: 1 })
      .onConflictDoUpdate({ target: attendanceState.tripId, set: { version: sql`${attendanceState.version} + 1` } }),
  );

  // The request link keeps working on the survivor; the survivor's own link wins.
  if (from.requestToken !== null && into.requestToken === null) {
    logParticipant(into);
    queries.push(
      db.update(participants).set({ requestToken: null }).where(eq(participants.id, fromId)),
      db.update(participants).set({ requestToken: from.requestToken }).where(eq(participants.id, intoId)),
    );
  }

  // The Zalo tie follows the survivor when it has none. Clear it first: (trip, zalo_sub) is unique.
  if (from.zaloSub !== null && into.zaloSub === null) {
    logParticipant(into);
    queries.push(
      db.update(participants).set({ zaloSub: null }).where(eq(participants.id, fromId)),
      db.update(participants).set({ zaloSub: from.zaloSub }).where(eq(participants.id, intoId)),
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
      // The guard fired: tell "someone already merged them" apart from "a claim is pending".
      const live = await db
        .select({ id: participants.id })
        .from(participants)
        .where(and(inArray(participants.id, [fromId, intoId]), inArray(participants.status, ['active', 'pending'])));
      if (live.length < 2) {
        throw new ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.');
      }
      throw claimPending();
    }
    throw err;
  }
}
