import type { Context } from 'hono';
import { Hono } from 'hono';
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import {
  MAX_AMOUNT,
  canConfirmPayment,
  notArrivedOutcome,
  arrivedOutcome,
  statusForNewPayment,
} from '@fsl/core';
import type { AppBindings } from '../env';
import { getDb, type Db } from '../db/client';
import { participants, transactions, transactionShares } from '../db/schema';
import { assertWritable, resolveActor } from '../access/actor';
import { ensure } from '../access/guard';
import { commitTripWrite } from '../lib/commit';
import { ApiError } from '../lib/errors';
import { newId, nowIso } from '../lib/ids';
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

    ensure(actor, 'record_payment', {
      paymentFromId: fromId,
      paymentToId: toId,
    });

    const db = getDb(c.env);
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

    const paymentId = newId();
    const now = nowIso();

    const insertPayment = db.insert(transactions).values({
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
      createdByParticipantId: actor.participantId!,
      createdByDevice: actor.deviceHash,
      confirmedByParticipantId: status === 'confirmed' ? actor.participantId : null,
      metaJson: null,
      createdAt: now,
      updatedAt: now,
    });

    const insertShare = db.insert(transactionShares).values({
      transactionId: paymentId,
      participantId: toId,
      inputValue: amount,
      amount: status === 'confirmed' ? amount : amount,
    });

    await commitTripWrite(db, tripId, [insertPayment, insertShare], {
      action: 'payment_recorded',
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details: {
        fromId,
        toId,
        amount,
        status,
      },
    });

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
    if (!canConfirmPayment(actor, { toId: payment.toId, status: 'says_paid' }, isMember)) {
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
    const r = await db
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
      )
      .run();

    if (r.meta.changes === 0) {
      throw new ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.');
    }

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

    await commitTripWrite(db, tripId, [updateShare], {
      action: 'payment_confirmed',
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details: { amount: confirmed },
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

    if (outcome === 'reject') {
      const r = await db
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
        .run();

      if (r.meta.changes === 0) {
        throw new ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.');
      }
    } else if (outcome === 'flag') {
      const r = await db
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
        )
        .run();

      if (r.meta.changes === 0) {
        throw new ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.');
      }
    }

    await commitTripWrite(db, tripId, [], {
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
    const r = await db
      .update(transactions)
      .set({
        status: 'disabled',
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
      )
      .run();

    if (r.meta.changes === 0) {
      throw new ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.');
    }

    await commitTripWrite(db, tripId, [], {
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
    const r = await db
      .update(transactions)
      // Back to what it was before disabling: a payment nobody confirmed yet waits for its receiver again (spec §9.4).
      .set({
        status: sql<'says_paid' | 'confirmed'>`CASE WHEN ${transactions.confirmedByParticipantId} IS NULL THEN 'says_paid' ELSE 'confirmed' END`,
        amountConfirmed: sql<number | null>`CASE WHEN ${transactions.confirmedByParticipantId} IS NULL THEN NULL ELSE coalesce(${transactions.amountConfirmed}, ${transactions.amount}) END`,
        notArrivedAt: null,
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
      )
      .run();

    if (r.meta.changes === 0) {
      throw new ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.');
    }

    await commitTripWrite(db, tripId, [], {
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
    const r =
      outcome === 'confirm'
        ? await db
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
            .run()
        : await db
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
            )
            .run();

    if (r.meta.changes === 0) {
      throw new ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.');
    }

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

    await commitTripWrite(db, tripId, extraQueries, {
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
    const r = await db
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
      )
      .run();
    if (r.meta.changes === 0) {
      throw new ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.');
    }

    await commitTripWrite(db, tripId, [], {
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
