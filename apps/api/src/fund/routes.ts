import type { Context } from 'hono';
import { Hono } from 'hono';
import { and, eq, or } from 'drizzle-orm';
import { MAX_AMOUNT } from '@fsl/core';
import type { AppBindings } from '../env';
import { getDb } from '../db/client';
import { transactions } from '../db/schema';
import { assertWritable, resolveActor } from '../access/actor';
import { ensure } from '../access/guard';
import { commitTripWrite } from '../lib/commit';
import { ApiError } from '../lib/errors';
import { newId, nowIso } from '../lib/ids';
import { assertFundCovers, assertSportGroup, currentFundBalance } from './check';

async function parseJson<T>(c: Context): Promise<T> {
  try {
    return await c.req.json<T>();
  } catch {
    throw new ApiError('VALIDATION', 422, 'Invalid request');
  }
}

function validateIncome(body: unknown): { amount: number; spentOn: string; description: string } {
  if (!body || typeof body !== 'object') {
    throw new ApiError('VALIDATION', 422, 'Invalid request');
  }

  const input = body as Record<string, unknown>;

  if (typeof input.description !== 'string') {
    throw new ApiError('VALIDATION', 422, 'Invalid description');
  }
  const description = input.description.trim();
  if (description.length < 1 || description.length > 80) {
    throw new ApiError('VALIDATION', 422, 'Description must be 1 to 80 characters');
  }

  if (
    typeof input.amount !== 'number' ||
    !Number.isSafeInteger(input.amount) ||
    input.amount < 1 ||
    input.amount > MAX_AMOUNT
  ) {
    throw new ApiError('VALIDATION', 422, 'Invalid amount');
  }
  const amount = input.amount;

  if (typeof input.spentOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.spentOn)) {
    throw new ApiError('VALIDATION', 422, 'Invalid spentOn');
  }
  const spentOn = input.spentOn;

  if (input.category !== undefined && input.category !== null) {
    throw new ApiError('VALIDATION', 422, 'Invalid category');
  }

  return { amount, spentOn, description };
}

export function fundRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  // POST /trips/:id/fund/incomes
  app.post('/trips/:id/fund/incomes', async (c) => {
    const tripId = c.req.param('id');
    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);
    assertSportGroup(actor.trip);
    ensure(actor, 'manage_fund');

    if (!actor.participantId) {
      throw new ApiError('FORBIDDEN', 403, 'Pick your name first.');
    }

    const body = await parseJson(c);
    const validated = validateIncome(body);

    const db = getDb(c.env);
    const incomeId = newId();
    const now = nowIso();

    const insertIncome = db.insert(transactions).values({
      id: incomeId,
      rootId: incomeId,
      parentId: null,
      isLatest: 1,
      tripId,
      type: 'income',
      description: validated.description,
      amount: validated.amount,
      amountConfirmed: null,
      currency: 'VND',
      spentOn: validated.spentOn,
      payerId: actor.participantId,
      toId: null,
      splitMode: 'equal',
      status: 'approved',
      rejectReason: null,
      notArrivedAt: null,
      disabledByUserId: null,
      createdByParticipantId: actor.participantId,
      createdByDevice: actor.deviceHash,
      confirmedByParticipantId: null,
      metaJson: '{"category":null}',
      createdAt: now,
      updatedAt: now,
    });

    await commitTripWrite(db, tripId, [insertIncome], {
      action: 'income_added',
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details: {
        description: validated.description,
        amount: validated.amount,
      },
    });

    return c.json({ incomeId }, 201);
  });

  // PATCH /trips/:id/fund/incomes/:iid
  app.patch('/trips/:id/fund/incomes/:iid', async (c) => {
    const tripId = c.req.param('id');
    const iid = c.req.param('iid');
    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);
    assertSportGroup(actor.trip);
    ensure(actor, 'manage_fund');

    const db = getDb(c.env);
    const head = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.tripId, tripId),
          eq(transactions.type, 'income'),
          eq(transactions.isLatest, 1),
          or(eq(transactions.id, iid), eq(transactions.rootId, iid)),
        ),
      )
      .get();

    if (!head) {
      throw new ApiError('NOT_FOUND', 404);
    }

    const body = await parseJson(c);
    const validated = validateIncome(body);

    const balance = await currentFundBalance(db, tripId);
    assertFundCovers(
      balance,
      { kind: 'income', amount: head.amount, status: head.status },
      { kind: 'income', amount: validated.amount, status: head.status },
    );

    const newHeadId = newId();
    const now = nowIso();

    const supersedeOld = db
      .update(transactions)
      .set({
        status: 'superseded',
        isLatest: 0,
        updatedAt: now,
      })
      .where(
        and(
          eq(transactions.id, head.id),
          eq(transactions.tripId, tripId),
          eq(transactions.isLatest, 1),
        ),
      );

    const insertNewHead = db.insert(transactions).values({
      id: newHeadId,
      rootId: head.rootId,
      parentId: head.id,
      isLatest: 1,
      tripId,
      type: 'income',
      description: validated.description,
      amount: validated.amount,
      amountConfirmed: null,
      currency: 'VND',
      spentOn: validated.spentOn,
      payerId: head.payerId,
      toId: null,
      splitMode: 'equal',
      status: head.status,
      rejectReason: null,
      notArrivedAt: null,
      disabledByUserId: head.disabledByUserId,
      createdByParticipantId: actor.participantId!,
      createdByDevice: actor.deviceHash,
      confirmedByParticipantId: null,
      metaJson: '{"category":null}',
      createdAt: now,
      updatedAt: now,
    });

    await commitTripWrite(db, tripId, [supersedeOld, insertNewHead], {
      action: 'income_edited',
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details: {
        description: validated.description,
        amount: validated.amount,
      },
    });

    return c.json({ incomeId: newHeadId, rootId: head.rootId }, 200);
  });

  // POST /trips/:id/fund/incomes/:iid/rollback
  app.post('/trips/:id/fund/incomes/:iid/rollback', async (c) => {
    const tripId = c.req.param('id');
    const iid = c.req.param('iid');
    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);
    assertSportGroup(actor.trip);
    ensure(actor, 'manage_fund');

    const db = getDb(c.env);
    const head = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.tripId, tripId),
          eq(transactions.type, 'income'),
          eq(transactions.isLatest, 1),
          or(eq(transactions.id, iid), eq(transactions.rootId, iid)),
        ),
      )
      .get();

    if (!head) {
      throw new ApiError('NOT_FOUND', 404);
    }

    const body = await parseJson<{ targetHistoryId?: unknown }>(c);
    if (!body || typeof body.targetHistoryId !== 'string') {
      throw new ApiError('VALIDATION', 422, 'Invalid targetHistoryId');
    }
    const targetHistoryId = body.targetHistoryId;

    const targetRow = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.tripId, tripId),
          eq(transactions.type, 'income'),
          eq(transactions.id, targetHistoryId),
          eq(transactions.rootId, head.rootId),
          eq(transactions.isLatest, 0),
        ),
      )
      .get();

    if (!targetRow) {
      throw new ApiError('NOT_FOUND', 404, 'Historical version not found');
    }

    const balance = await currentFundBalance(db, tripId);
    assertFundCovers(
      balance,
      { kind: 'income', amount: head.amount, status: head.status },
      { kind: 'income', amount: targetRow.amount, status: head.status },
    );

    const newHeadId = newId();
    const now = nowIso();

    const supersedeOld = db
      .update(transactions)
      .set({
        status: 'superseded',
        isLatest: 0,
        updatedAt: now,
      })
      .where(
        and(
          eq(transactions.id, head.id),
          eq(transactions.tripId, tripId),
          eq(transactions.isLatest, 1),
        ),
      );

    const insertNewHead = db.insert(transactions).values({
      id: newHeadId,
      rootId: head.rootId,
      parentId: head.id,
      isLatest: 1,
      tripId,
      type: 'income',
      description: targetRow.description,
      amount: targetRow.amount,
      amountConfirmed: null,
      currency: 'VND',
      spentOn: targetRow.spentOn,
      payerId: head.payerId,
      toId: null,
      splitMode: 'equal',
      status: head.status,
      rejectReason: null,
      notArrivedAt: null,
      disabledByUserId: head.disabledByUserId,
      createdByParticipantId: actor.participantId!,
      createdByDevice: actor.deviceHash,
      confirmedByParticipantId: null,
      metaJson: targetRow.metaJson,
      createdAt: now,
      updatedAt: now,
    });

    await commitTripWrite(db, tripId, [supersedeOld, insertNewHead], {
      action: 'income_rolled_back',
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details: {
        description: targetRow.description,
        amount: targetRow.amount,
        targetHistoryId,
      },
    });

    return c.json({ incomeId: newHeadId, rootId: head.rootId }, 200);
  });

  // POST /trips/:id/fund/incomes/:iid/disable
  app.post('/trips/:id/fund/incomes/:iid/disable', async (c) => {
    const tripId = c.req.param('id');
    const iid = c.req.param('iid');
    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);
    assertSportGroup(actor.trip);
    ensure(actor, 'manage_fund');

    const db = getDb(c.env);
    const head = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.tripId, tripId),
          eq(transactions.type, 'income'),
          eq(transactions.isLatest, 1),
          or(eq(transactions.id, iid), eq(transactions.rootId, iid)),
        ),
      )
      .get();

    if (!head) {
      throw new ApiError('NOT_FOUND', 404);
    }

    if (head.status !== 'approved') {
      throw new ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.');
    }

    const balance = await currentFundBalance(db, tripId);
    assertFundCovers(balance, { kind: 'income', amount: head.amount, status: head.status }, null);

    const now = nowIso();
    const r = await db
      .update(transactions)
      .set({
        status: 'disabled',
        disabledByUserId: actor.userId,
        updatedAt: now,
      })
      .where(
        and(
          eq(transactions.id, head.id),
          eq(transactions.tripId, tripId),
          eq(transactions.isLatest, 1),
          eq(transactions.status, 'approved'),
        ),
      )
      .run();

    if (r.meta.changes === 0) {
      throw new ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.');
    }

    await commitTripWrite(db, tripId, [], {
      action: 'income_disabled',
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details: {
        description: head.description,
        amount: head.amount,
      },
    });

    return c.body(null, 204);
  });

  // POST /trips/:id/fund/incomes/:iid/enable
  app.post('/trips/:id/fund/incomes/:iid/enable', async (c) => {
    const tripId = c.req.param('id');
    const iid = c.req.param('iid');
    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);
    assertSportGroup(actor.trip);
    ensure(actor, 'manage_fund');

    const db = getDb(c.env);
    const head = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.tripId, tripId),
          eq(transactions.type, 'income'),
          eq(transactions.isLatest, 1),
          or(eq(transactions.id, iid), eq(transactions.rootId, iid)),
        ),
      )
      .get();

    if (!head) {
      throw new ApiError('NOT_FOUND', 404);
    }

    if (head.status !== 'disabled') {
      throw new ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.');
    }

    const now = nowIso();
    const r = await db
      .update(transactions)
      .set({
        status: 'approved',
        disabledByUserId: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(transactions.id, head.id),
          eq(transactions.tripId, tripId),
          eq(transactions.isLatest, 1),
          eq(transactions.status, 'disabled'),
        ),
      )
      .run();

    if (r.meta.changes === 0) {
      throw new ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.');
    }

    await commitTripWrite(db, tripId, [], {
      action: 'income_enabled',
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details: {
        description: head.description,
        amount: head.amount,
      },
    });

    return c.body(null, 204);
  });

  return app;
}
