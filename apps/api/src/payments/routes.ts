import type { Context } from 'hono';
import { Hono } from 'hono';
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import {
  type PaymentStatus,
  MAX_AMOUNT,
  canConfirmPayment,
  canRevisePayment,
  notArrivedOutcome,
  arrivedOutcome,
  statusForNewPayment,
} from '@cc/core';
import type { AppBindings } from '@cc/api-db/env';
import { getDb, type Db } from '@cc/api-db/client';
import { participants, paymentKeys, transactions, transactionShares } from '@cc/api-db/schema';
import { assertWritable, resolveActor } from '@cc/api-auth/actor';
import { ensure } from '@cc/api-auth/guard';
import { commitTripWrite, guardedTripWrite } from '@cc/api-db/commit';
import { ApiError, isDbError } from '@cc/api-util/errors';
import { parseIdempotencyKey } from '@cc/api-util/idempotency';
import { newId, nowIso } from '@cc/api-util/ids';
import { dispatchPaymentNotification } from '../notifications/transactionDispatcher';
import { getSnapshot } from '../trips/snapshot';

async function parseJson<T>(c: Context): Promise<T> {
  try {
    return await c.req.json<T>();
  } catch {
    throw new ApiError('VALIDATION', 422, 'Invalid request');
  }
}

async function parseOptionalJson<T>(c: Context): Promise<T | null> {
  try {
    const text = await c.req.text();
    if (!text || text.trim() === '') return null;
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError('VALIDATION', 422, 'Invalid request');
  }
}

function isValidAmount(amount: unknown): amount is number {
  return (
    typeof amount === 'number' &&
    Number.isSafeInteger(amount) &&
    amount >= 1 &&
    amount <= MAX_AMOUNT
  );
}

async function receiverIsMember(
  db: Db,
  tripId: string,
  toId: string,
): Promise<boolean> {
  const p = await db
    .select({ userId: participants.userId })
    .from(participants)
    .where(and(eq(participants.id, toId), eq(participants.tripId, tripId)))
    .get();

  return p?.userId !== null && p?.userId !== undefined;
}

export interface InsertPaymentArgs {
  tripId: string;
  fromId: string;
  toId: string;
  amount: number;
  status: 'says_paid' | 'confirmed';
  createdByParticipantId: string;
  actorParticipantId: string | null;
  actorUserId: string | null;
  actorDevice: string;
  metaJson?: string | null;
  expenseId?: string;
  claimRequestId?: string | null;
  /** Client key for this submit; written in the same batch so a repeat fails on `payment_keys.key`. */
  idempotencyKey?: string | null;
}

/**
 * The payment an idempotency key already recorded in this trip, with its current head's status,
 * or null when the key is new. A key from another trip, or for a different from/to/amount, is a
 * conflict (as `settlementForKey` treats a reused key).
 */
export async function paymentForKey(
  db: Db,
  key: string,
  tripId: string,
  expected: { fromId: string; toId: string; amount: number },
): Promise<{ paymentId: string; status: PaymentStatus } | null> {
  const rows = await db.all<{
    trip_id: string;
    payment_id: string;
    payer_id: string | null;
    to_id: string | null;
    amount: number | null;
    head_status: PaymentStatus | null;
    first_status: PaymentStatus | null;
  }>(sql`
    SELECT k.trip_id AS trip_id, k.payment_id AS payment_id,
      f.payer_id AS payer_id, f.to_id AS to_id, f.amount AS amount, f.status AS first_status,
      (SELECT h.status FROM transactions h WHERE h.root_id = k.payment_id AND h.is_latest = 1 LIMIT 1) AS head_status
    FROM payment_keys k
    LEFT JOIN transactions f ON f.id = k.payment_id
    WHERE k.key = ${key}
  `);
  const found = rows[0];
  if (!found) return null;
  if (
    found.trip_id !== tripId ||
    found.payer_id !== expected.fromId ||
    found.to_id !== expected.toId ||
    found.amount !== expected.amount
  ) {
    throw new ApiError('CONFLICT', 409, 'Invalid request');
  }
  return { paymentId: found.payment_id, status: (found.head_status ?? found.first_status)! };
}

export async function insertPayment(
  db: Db,
  args: InsertPaymentArgs,
): Promise<string> {
  const {
    tripId,
    fromId,
    toId,
    amount,
    status,
    createdByParticipantId,
    actorParticipantId,
    actorUserId,
    actorDevice,
    metaJson = null,
    expenseId,
    claimRequestId = null,
    idempotencyKey = null,
  } = args;
  const paymentId = newId();
  const now = nowIso();

  const paymentRow = db.insert(transactions).values({
    id: paymentId,
    rootId: paymentId,
    parentId: null,
    isLatest: 1,
    tripId,
    type: 'payment',
    description: '',
    amount,
    amountConfirmed: status === 'confirmed' ? amount : null,
    currency: 'VND',
    spentOn: now.slice(0, 10),
    payerId: fromId,
    toId,
    splitMode: 'equal',
    status,
    rejectReason: null,
    notArrivedAt: null,
    disabledByUserId: null,
    createdByParticipantId,
    createdByDevice: actorDevice,
    confirmedByParticipantId: status === 'confirmed' ? actorParticipantId : null,
    metaJson,
    claimRequestId,
    createdAt: now,
    updatedAt: now,
  });

  const shareRow = db.insert(transactionShares).values({
    transactionId: paymentId,
    participantId: toId,
    inputValue: amount,
    amount: status === 'confirmed' ? amount : amount,
  });

  const keyRow = idempotencyKey
    ? [db.insert(paymentKeys).values({ key: idempotencyKey, tripId, paymentId, createdAt: now })]
    : [];

  await commitTripWrite(db, tripId, [...keyRow, paymentRow, shareRow], {
    action: 'payment_recorded',
    actorParticipantId,
    actorUserId,
    actorDevice,
    details: {
      fromId,
      toId,
      amount,
      status,
      ...(expenseId !== undefined ? { expenseId } : {}),
    },
  });

  return paymentId;
}

export function paymentRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  // POST /trips/:id/payments
  app.post('/trips/:id/payments', async (c) => {
    const tripId = c.req.param('id');
    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);

    const body = await parseJson<{
      fromId?: unknown;
      toId?: unknown;
      amount?: unknown;
      /** Sent by a transfer tick: record it only if this pair still owes at least `amount`. */
      settles?: unknown;
      /** Client key for this submit; a repeat returns the first payment (200). */
      idempotencyKey?: unknown;
    }>(c);

    if (
      !body ||
      typeof body !== 'object' ||
      typeof body.fromId !== 'string' ||
      typeof body.toId !== 'string'
    ) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    const { fromId, toId } = body;

    if (!isValidAmount(body.amount)) {
      throw new ApiError('VALIDATION', 422, 'Invalid amount');
    }
    const amount = body.amount;

    if (body.settles !== undefined && typeof body.settles !== 'boolean') {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    if (fromId === toId) {
      throw new ApiError('VALIDATION', 422, 'Cannot pay oneself');
    }

    const idempotencyKey = parseIdempotencyKey(body.idempotencyKey);

    ensure(actor, 'record_payment', {
      paymentFromId: fromId,
      paymentToId: toId,
    });

    const db = getDb(c.env);

    // Before the `settles` check, so a retried tick gets its original payment, not ALREADY_HANDLED.
    if (idempotencyKey) {
      const existing = await paymentForKey(db, idempotencyKey, tripId, { fromId, toId, amount });
      if (existing) return c.json(existing, 200);
    }

    const tripParticipants = await db
      .select()
      .from(participants)
      .where(
        and(
          eq(participants.tripId, tripId),
          inArray(participants.id, [fromId, toId]),
          // Someone who left can still be paid, or pay what they owe.
          inArray(participants.status, ['active', 'left']),
        ),
      );

    const fromP = tripParticipants.find((p) => p.id === fromId);
    const toP = tripParticipants.find((p) => p.id === toId);

    if (!fromP || !toP) {
      throw new ApiError('VALIDATION', 422, 'Participants must be active members of the trip');
    }

    // A member who left cannot confirm anything, so they count as a guest here.
    const toIsMember = toP.userId !== null && toP.status === 'active';

    const status = statusForNewPayment({
      actorId: actor.participantId!,
      fromId,
      toId,
      receiverIsMember: toIsMember,
      payerIsMember: fromP.userId !== null && fromP.status === 'active',
    });

    if (status === 'forbidden') {
      throw new ApiError('FORBIDDEN', 403);
    }

    // A tick settles the transfer it showed. If that pair no longer owes this much, someone recorded it in the
    // meantime (the other side ticked it too): refuse, so it isn't counted twice. The check and the write are
    // separate steps, so the race is narrowed to milliseconds, not closed.
    if (body.settles === true) {
      const snapshot = await getSnapshot(db, actor.trip);
      const open = snapshot.suggestions.find((s) => s.fromId === fromId && s.toId === toId);
      if (!open || open.amount < amount) {
        throw new ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.');
      }
    }

    let paymentId: string;
    try {
      paymentId = await insertPayment(db, {
        tripId,
        fromId,
        toId,
        amount,
        status,
        createdByParticipantId: actor.participantId!,
        actorParticipantId: actor.participantId,
        actorUserId: actor.userId,
        actorDevice: actor.deviceHash,
        idempotencyKey,
      });
    } catch (err) {
      if (idempotencyKey && isDbError(err, 'UNIQUE constraint failed: payment_keys.key')) {
        // The same submit landed meanwhile (a double tap or a retry): answer with that payment.
        const existing = await paymentForKey(db, idempotencyKey, tripId, { fromId, toId, amount });
        if (existing) return c.json(existing, 200);
      }
      throw err;
    }

    if (status === 'says_paid') {
      await dispatchPaymentNotification(c, 'says_paid', paymentId, {
        actorUserId: actor.userId,
        actorParticipantId: actor.participantId,
      });
    }

    return c.json({ paymentId, status }, 201);
  });

  // POST /trips/:id/payments/:pid/confirm
  app.post('/trips/:id/payments/:pid/confirm', async (c) => {
    const tripId = c.req.param('id');
    const pid = c.req.param('pid');
    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);

    const db = getDb(c.env);
    const payment = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.id, pid),
          eq(transactions.tripId, tripId),
          eq(transactions.type, 'payment'),
          eq(transactions.isLatest, 1),
        ),
      )
      .get();

    if (!payment || !payment.toId) {
      throw new ApiError('NOT_FOUND', 404);
    }

    const isMember = await receiverIsMember(db, tripId, payment.toId);
    if (!canConfirmPayment(actor, { toId: payment.toId, status: 'says_paid', claimPending: payment.claimRequestId !== null }, isMember)) {
      throw new ApiError('FORBIDDEN', 403);
    }

    if (payment.status !== 'says_paid') {
      throw new ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.');
    }

    const body = await parseOptionalJson<{ amount?: unknown }>(c);
    const amount = body?.amount;
    const confirmed = amount ?? payment.amount;

    if (!isValidAmount(confirmed)) {
      throw new ApiError('VALIDATION', 422, 'Invalid amount');
    }

    const now = nowIso();
    const guard = db
      .update(transactions)
      .set({
        status: 'confirmed',
        amountConfirmed: confirmed,
        confirmedByParticipantId: actor.participantId,
        updatedAt: now,
      })
      .where(
        and(
          eq(transactions.id, pid),
          eq(transactions.tripId, tripId),
          eq(transactions.type, 'payment'),
          eq(transactions.isLatest, 1),
          eq(transactions.status, 'says_paid'),
        ),
      );

    const updateShare = db
      .update(transactionShares)
      .set({
        amount: confirmed,
      })
      .where(
        and(
          eq(transactionShares.transactionId, pid),
          eq(transactionShares.participantId, payment.toId),
        ),
      );

    await guardedTripWrite(db, tripId, guard, [updateShare], {
      action: 'payment_confirmed',
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details: { amount: confirmed },
    });

    await dispatchPaymentNotification(c, 'confirmed', pid, {
      actorUserId: actor.userId,
      actorParticipantId: actor.participantId,
    });

    return c.body(null, 204);
  });

  // POST /trips/:id/payments/:pid/revise
  app.post('/trips/:id/payments/:pid/revise', async (c) => {
    const tripId = c.req.param('id');
    const pid = c.req.param('pid');
    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);

    const db = getDb(c.env);
    const payment = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.id, pid),
          eq(transactions.tripId, tripId),
          eq(transactions.type, 'payment'),
          eq(transactions.isLatest, 1),
        ),
      )
      .get();

    if (!payment || !payment.toId) {
      throw new ApiError('NOT_FOUND', 404);
    }

    const isMember = await receiverIsMember(db, tripId, payment.toId);
    if (
      !canRevisePayment(
        actor,
        {
          toId: payment.toId,
          status: payment.status as PaymentStatus,
          confirmedById: payment.confirmedByParticipantId,
        },
        isMember,
      )
    ) {
      throw new ApiError('FORBIDDEN', 403);
    }

    const body = await parseJson<{
      action?: unknown;
      amount?: unknown;
    }>(c);

    if (
      !body ||
      typeof body !== 'object' ||
      (body.action !== 'undo' &&
        body.action !== 'amount' &&
        body.action !== 'not_arrived')
    ) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    const action = body.action;
    let newAmount: number | undefined;
    if (action === 'amount') {
      if (!isValidAmount(body.amount)) {
        throw new ApiError('VALIDATION', 422, 'Invalid amount');
      }
      newAmount = body.amount;
    }

    const now = nowIso();
    const setValues =
      action === 'undo'
        ? {
            status: 'says_paid' as const,
            amountConfirmed: null,
            confirmedByParticipantId: null,
            updatedAt: now,
          }
        : action === 'amount'
          ? {
              amountConfirmed: newAmount!,
              updatedAt: now,
            }
          : {
              status: 'rejected' as const,
              updatedAt: now,
            };

    const guard = db
      .update(transactions)
      .set(setValues)
      .where(
        and(
          eq(transactions.id, pid),
          eq(transactions.tripId, tripId),
          eq(transactions.type, 'payment'),
          eq(transactions.isLatest, 1),
          eq(transactions.status, 'confirmed'),
        ),
      );

    const extraQueries = [];
    if (action === 'undo' || action === 'amount') {
      const shareAmount = action === 'undo' ? payment.amount : newAmount!;
      extraQueries.push(
        db
          .update(transactionShares)
          .set({ amount: shareAmount })
          .where(
            and(
              eq(transactionShares.transactionId, pid),
              eq(transactionShares.participantId, payment.toId),
            ),
          ),
      );
    }

    await guardedTripWrite(db, tripId, guard, extraQueries, {
      action: 'payment_revised',
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details: {
        action,
        ...(newAmount !== undefined ? { amount: newAmount } : {}),
      },
    });

    return c.body(null, 204);
  });

  // POST /trips/:id/payments/:pid/not-arrived
  app.post('/trips/:id/payments/:pid/not-arrived', async (c) => {
    const tripId = c.req.param('id');
    const pid = c.req.param('pid');
    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);

    const db = getDb(c.env);
    const payment = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.id, pid),
          eq(transactions.tripId, tripId),
          eq(transactions.type, 'payment'),
          eq(transactions.isLatest, 1),
        ),
      )
      .get();

    if (!payment || !payment.toId) {
      throw new ApiError('NOT_FOUND', 404);
    }

    const isMember = await receiverIsMember(db, tripId, payment.toId);
    const outcome = notArrivedOutcome(actor, { toId: payment.toId, status: payment.status as any }, isMember);

    if (outcome === 'forbidden') {
      throw new ApiError('FORBIDDEN', 403);
    }

    const now = nowIso();

    // After the 'forbidden' check the outcome is 'reject' or 'flag'; each has its own guard.
    const guard =
      outcome === 'reject'
        ? db
            .update(transactions)
            .set({
              status: 'rejected',
              updatedAt: now,
            })
            .where(
              and(
                eq(transactions.id, pid),
                eq(transactions.tripId, tripId),
                eq(transactions.type, 'payment'),
                eq(transactions.isLatest, 1),
                eq(transactions.status, 'says_paid'),
              ),
            )
        : db
            .update(transactions)
            .set({
              notArrivedAt: now,
              updatedAt: now,
            })
            .where(
              and(
                eq(transactions.id, pid),
                eq(transactions.tripId, tripId),
                eq(transactions.type, 'payment'),
                eq(transactions.isLatest, 1),
                eq(transactions.status, 'confirmed'),
                isNull(transactions.notArrivedAt),
              ),
            );

    await guardedTripWrite(db, tripId, guard, [], {
      action: 'payment_not_arrived',
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details: { outcome },
    });

    return c.body(null, 204);
  });

  // POST /trips/:id/payments/:pid/disable
  app.post('/trips/:id/payments/:pid/disable', async (c) => {
    const tripId = c.req.param('id');
    const pid = c.req.param('pid');
    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);
    ensure(actor, 'disable');

    const db = getDb(c.env);
    const payment = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.id, pid),
          eq(transactions.tripId, tripId),
          eq(transactions.type, 'payment'),
          eq(transactions.isLatest, 1),
        ),
      )
      .get();

    if (!payment) {
      throw new ApiError('NOT_FOUND', 404);
    }

    const now = nowIso();
    const guard = db
      .update(transactions)
      .set({
        status: 'disabled',
        disabledByUserId: actor.userId,
        updatedAt: now,
      })
      .where(
        and(
          eq(transactions.id, pid),
          eq(transactions.tripId, tripId),
          eq(transactions.type, 'payment'),
          eq(transactions.isLatest, 1),
          inArray(transactions.status, ['confirmed', 'says_paid']),
        ),
      );

    await guardedTripWrite(db, tripId, guard, [], {
      action: 'payment_disabled',
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details: {},
    });

    return c.body(null, 204);
  });

  // POST /trips/:id/payments/:pid/enable
  app.post('/trips/:id/payments/:pid/enable', async (c) => {
    const tripId = c.req.param('id');
    const pid = c.req.param('pid');
    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);
    ensure(actor, 'disable');

    const db = getDb(c.env);
    const payment = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.id, pid),
          eq(transactions.tripId, tripId),
          eq(transactions.type, 'payment'),
          eq(transactions.isLatest, 1),
        ),
      )
      .get();

    if (!payment) {
      throw new ApiError('NOT_FOUND', 404);
    }

    const now = nowIso();
    const guard = db
      .update(transactions)
      // Back to what it was before disabling: a payment nobody confirmed yet waits for its receiver again (spec §9.4).
      .set({
        status: sql<'says_paid' | 'confirmed'>`CASE WHEN ${transactions.confirmedByParticipantId} IS NULL THEN 'says_paid' ELSE 'confirmed' END`,
        amountConfirmed: sql<number | null>`CASE WHEN ${transactions.confirmedByParticipantId} IS NULL THEN NULL ELSE coalesce(${transactions.amountConfirmed}, ${transactions.amount}) END`,
        notArrivedAt: null,
        disabledByUserId: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(transactions.id, pid),
          eq(transactions.tripId, tripId),
          eq(transactions.type, 'payment'),
          eq(transactions.isLatest, 1),
          eq(transactions.status, 'disabled'),
        ),
      );

    await guardedTripWrite(db, tripId, guard, [], {
      action: 'payment_enabled',
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details: {},
    });

    return c.body(null, 204);
  });

  // POST /trips/:id/payments/:pid/arrived — the receiver who said a payment didn't arrive says it did after all.
  app.post('/trips/:id/payments/:pid/arrived', async (c) => {
    const tripId = c.req.param('id');
    const pid = c.req.param('pid');
    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);

    const db = getDb(c.env);
    const payment = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.id, pid),
          eq(transactions.tripId, tripId),
          eq(transactions.type, 'payment'),
          eq(transactions.isLatest, 1),
        ),
      )
      .get();

    if (!payment || !payment.toId) {
      throw new ApiError('NOT_FOUND', 404);
    }

    const isMember = await receiverIsMember(db, tripId, payment.toId);
    const outcome = arrivedOutcome(
      actor,
      { toId: payment.toId, status: payment.status as any, notArrived: payment.notArrivedAt !== null },
      isMember,
    );

    if (outcome === 'forbidden') {
      // The receiver pressing it again after it already counts: someone (they) already handled it.
      const alreadyArrived = actor.participantId === payment.toId && payment.status === 'confirmed' && payment.notArrivedAt === null;
      throw alreadyArrived ? new ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.') : new ApiError('FORBIDDEN', 403);
    }

    const now = nowIso();
    const guard =
      outcome === 'confirm'
        ? db
            .update(transactions)
            .set({
              status: 'confirmed',
              amountConfirmed: payment.amount,
              confirmedByParticipantId: actor.participantId,
              updatedAt: now,
            })
            .where(
              and(
                eq(transactions.id, pid),
                eq(transactions.tripId, tripId),
                eq(transactions.type, 'payment'),
                eq(transactions.isLatest, 1),
                eq(transactions.status, 'rejected'),
              ),
            )
        : db
            .update(transactions)
            .set({ notArrivedAt: null, updatedAt: now })
            .where(
              and(
                eq(transactions.id, pid),
                eq(transactions.tripId, tripId),
                eq(transactions.type, 'payment'),
                eq(transactions.isLatest, 1),
                eq(transactions.status, 'confirmed'),
                isNotNull(transactions.notArrivedAt),
              ),
            );

    const extraQueries = [];
    if (outcome === 'confirm') {
      extraQueries.push(
        db
          .update(transactionShares)
          .set({ amount: payment.amount })
          .where(
            and(
              eq(transactionShares.transactionId, pid),
              eq(transactionShares.participantId, payment.toId),
            ),
          ),
      );
    }

    await guardedTripWrite(db, tripId, guard, extraQueries, {
      action: 'payment_arrived',
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details: { outcome, amount: payment.amountConfirmed ?? payment.amount },
    });

    return c.body(null, 204);
  });

  // POST /trips/:id/payments/:pid/keep — a member decides a "didn't arrive" report is wrong and clears it.
  app.post('/trips/:id/payments/:pid/keep', async (c) => {
    const tripId = c.req.param('id');
    const pid = c.req.param('pid');
    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);
    ensure(actor, 'disable');

    const db = getDb(c.env);
    const guard = db
      .update(transactions)
      .set({ notArrivedAt: null, updatedAt: nowIso() })
      .where(
        and(
          eq(transactions.id, pid),
          eq(transactions.tripId, tripId),
          eq(transactions.type, 'payment'),
          eq(transactions.isLatest, 1),
          eq(transactions.status, 'confirmed'),
          isNotNull(transactions.notArrivedAt),
        ),
      );

    await guardedTripWrite(db, tripId, guard, [], {
      action: 'payment_enabled',
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details: { kept: true },
    });

    return c.body(null, 204);
  });

  return app;
}
