import type { Context } from 'hono';
import { Hono } from 'hono';
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import {
  MAX_AMOUNT,
  canConfirmPayment,
  notArrivedOutcome,
  statusForNewPayment,
} from '@fsl/core';
import type { AppBindings } from '../env';
import { getDb, type Db } from '../db/client';
import { participants, payments } from '../db/schema';
import { assertWritable, resolveActor } from '../access/actor';
import { ensure } from '../access/guard';
import { commitTripWrite } from '../lib/commit';
import { ApiError } from '../lib/errors';
import { newId, nowIso } from '../lib/ids';

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
          eq(participants.status, 'active'),
        ),
      );

    const fromP = tripParticipants.find((p) => p.id === fromId);
    const toP = tripParticipants.find((p) => p.id === toId);

    if (!fromP || !toP) {
      throw new ApiError('VALIDATION', 422, 'Participants must be active members of the trip');
    }

    const toIsMember = toP.userId !== null;

    const status = statusForNewPayment({
      actorId: actor.participantId!,
      fromId,
      toId,
      receiverIsMember: toIsMember,
      payerIsMember: fromP.userId !== null,
    });

    if (status === 'forbidden') {
      throw new ApiError('FORBIDDEN', 403);
    }

    const paymentId = newId();
    const now = nowIso();

    const insertPayment = db.insert(payments).values({
      id: paymentId,
      tripId,
      fromId,
      toId,
      amountClaimed: amount,
      amountConfirmed: status === 'confirmed' ? amount : null,
      currency: 'VND',
      status,
      recordedByParticipantId: actor.participantId!,
      recordedByDevice: actor.deviceHash,
      confirmedByParticipantId: status === 'confirmed' ? actor.participantId : null,
      createdAt: now,
      updatedAt: now,
    });

    await commitTripWrite(db, tripId, [insertPayment], {
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
      .from(payments)
      .where(and(eq(payments.id, pid), eq(payments.tripId, tripId)))
      .get();

    if (!payment) {
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
    const confirmed = amount ?? payment.amountClaimed;

    if (!isValidAmount(confirmed)) {
      throw new ApiError('VALIDATION', 422, 'Invalid amount');
    }

    const now = nowIso();
    const r = await db
      .update(payments)
      .set({
        status: 'confirmed',
        amountConfirmed: confirmed,
        confirmedByParticipantId: actor.participantId,
        updatedAt: now,
      })
      .where(
        and(
          eq(payments.id, pid),
          eq(payments.tripId, tripId),
          eq(payments.status, 'says_paid'),
        ),
      )
      .run();

    if (r.meta.changes === 0) {
      throw new ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.');
    }

    await commitTripWrite(db, tripId, [], {
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
      .from(payments)
      .where(and(eq(payments.id, pid), eq(payments.tripId, tripId)))
      .get();

    if (!payment) {
      throw new ApiError('NOT_FOUND', 404);
    }

    const isMember = await receiverIsMember(db, tripId, payment.toId);
    const outcome = notArrivedOutcome(actor, payment, isMember);

    if (outcome === 'forbidden') {
      throw new ApiError('FORBIDDEN', 403);
    }

    const now = nowIso();

    if (outcome === 'reject') {
      const r = await db
        .update(payments)
        .set({
          status: 'rejected',
          updatedAt: now,
        })
        .where(
          and(
            eq(payments.id, pid),
            eq(payments.tripId, tripId),
            eq(payments.status, 'says_paid'),
          ),
        )
        .run();

      if (r.meta.changes === 0) {
        throw new ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.');
      }
    } else if (outcome === 'flag') {
      const r = await db
        .update(payments)
        .set({
          notArrivedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(payments.id, pid),
            eq(payments.tripId, tripId),
            eq(payments.status, 'confirmed'),
            isNull(payments.notArrivedAt),
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
      .from(payments)
      .where(and(eq(payments.id, pid), eq(payments.tripId, tripId)))
      .get();

    if (!payment) {
      throw new ApiError('NOT_FOUND', 404);
    }

    const now = nowIso();
    const r = await db
      .update(payments)
      .set({
        status: 'disabled',
        updatedAt: now,
      })
      .where(
        and(
          eq(payments.id, pid),
          eq(payments.tripId, tripId),
          inArray(payments.status, ['confirmed', 'says_paid']),
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
      .from(payments)
      .where(and(eq(payments.id, pid), eq(payments.tripId, tripId)))
      .get();

    if (!payment) {
      throw new ApiError('NOT_FOUND', 404);
    }

    const now = nowIso();
    const r = await db
      .update(payments)
      // Back to what it was before disabling: a payment nobody confirmed yet waits for its receiver again (spec §9.4).
      .set({
        status: sql<'says_paid' | 'confirmed'>`CASE WHEN ${payments.confirmedByParticipantId} IS NULL THEN 'says_paid' ELSE 'confirmed' END`,
        amountConfirmed: sql<number | null>`CASE WHEN ${payments.confirmedByParticipantId} IS NULL THEN NULL ELSE coalesce(${payments.amountConfirmed}, ${payments.amountClaimed}) END`,
        notArrivedAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(payments.id, pid),
          eq(payments.tripId, tripId),
          eq(payments.status, 'disabled'),
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

  // POST /trips/:id/payments/:pid/keep — a member decides a "didn't arrive" report is wrong and clears it.
  app.post('/trips/:id/payments/:pid/keep', async (c) => {
    const tripId = c.req.param('id');
    const pid = c.req.param('pid');
    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);
    ensure(actor, 'disable');

    const db = getDb(c.env);
    const r = await db
      .update(payments)
      .set({ notArrivedAt: null, updatedAt: nowIso() })
      .where(and(eq(payments.id, pid), eq(payments.tripId, tripId), eq(payments.status, 'confirmed'), isNotNull(payments.notArrivedAt)))
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
