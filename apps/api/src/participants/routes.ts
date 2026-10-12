import type { Context } from 'hono';
import { Hono } from 'hono';
import { and, asc, eq, max, or, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { PickerView } from '@fsl/core';
import { findSimilarNames, normalizeName } from '@fsl/core';
import type { AppBindings } from '../env';
import { getDb } from '../db/client';
import {
  deviceParticipants,
  expenseShares,
  expenses,
  membershipRequests,
  participants,
  payments,
} from '../db/schema';
import { getSessionUser } from '../auth/session';
import type { ResolvedActor } from '../access/actor';
import { assertWritable, resolveActor } from '../access/actor';
import { ensure } from '../access/guard';
import { commitTripWrite } from '../lib/commit';
import { ApiError } from '../lib/errors';
import { newId, nowIso } from '../lib/ids';
import { mergeParticipants } from './merge';

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

async function getActor(c: Context<AppBindings>, tripId: string): Promise<ResolvedActor> {
  const actor = await resolveActor(c, tripId);
  if (actor.kind === 'viewer') {
    throw new ApiError('FORBIDDEN', 403);
  }
  return actor;
}

export function participantRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  // GET /trips/:id/people/picker
  app.get('/trips/:id/people/picker', async (c) => {
    const tripId = c.req.param('id');
    const actor = await getActor(c, tripId);
    const db = getDb(c.env);

    const participantList = await db
      .select()
      .from(participants)
      .where(
        and(
          eq(participants.tripId, tripId),
          or(eq(participants.status, 'active'), eq(participants.status, 'pending')),
        ),
      )
      .orderBy(asc(participants.sortOrder));

    const dpRows = await db
      .select()
      .from(deviceParticipants)
      .where(eq(deviceParticipants.tripId, tripId));

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const people = participantList.map((p) => {
      const lastUsedHere = dpRows.some(
        (dp) => dp.deviceHash === actor.deviceHash && dp.participantId === p.id,
      );

      const otherRecent = dpRows
        .filter(
          (dp) =>
            dp.participantId === p.id &&
            dp.deviceHash !== actor.deviceHash &&
            dp.lastUsedAt >= cutoff,
        )
        .map((dp) => dp.lastUsedAt);

      const activeElsewhere =
        otherRecent.length > 0 ? otherRecent.reduce((a, b) => (a > b ? a : b)) : null;

      return {
        id: p.id,
        name: p.name,
        status: p.status as 'active' | 'pending',
        isMember: p.userId !== null,
        lastUsedHere,
        activeElsewhere,
      };
    });

    const view: PickerView = {
      people,
      myPick: actor.participantId,
    };

    return c.json(view);
  });

  // POST /trips/:id/people/pick
  app.post('/trips/:id/people/pick', async (c) => {
    const tripId = c.req.param('id');
    const actor = await getActor(c, tripId);
    if (actor.kind !== 'guest') {
      throw new ApiError('FORBIDDEN', 403);
    }

    const body = await parseJson<{ participantId?: unknown }>(c);
    if (typeof body?.participantId !== 'string') {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    const db = getDb(c.env);
    const target = await db
      .select()
      .from(participants)
      .where(
        and(
          eq(participants.id, body.participantId),
          eq(participants.tripId, tripId),
          or(eq(participants.status, 'active'), eq(participants.status, 'pending')),
        ),
      )
      .get();

    if (!target) {
      throw new ApiError('NOT_FOUND', 404);
    }

    if (target.userId !== null) {
      throw new ApiError('FORBIDDEN', 403, `Sign in to continue as ${target.name}`);
    }

    const now = nowIso();
    await db
      .insert(deviceParticipants)
      .values({
        deviceHash: actor.deviceHash,
        tripId,
        participantId: target.id,
        lastUsedAt: now,
      })
      .onConflictDoUpdate({
        target: [deviceParticipants.deviceHash, deviceParticipants.tripId],
        set: {
          participantId: target.id,
          lastUsedAt: now,
        },
      })
      .run();

    return c.body(null, 204);
  });

  // POST /trips/:id/people/check-name
  app.post('/trips/:id/people/check-name', async (c) => {
    const tripId = c.req.param('id');
    await getActor(c, tripId);

    const body = await parseJson<{ name?: unknown }>(c);
    if (typeof body?.name !== 'string') {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    const db = getDb(c.env);
    const rows = await db
      .select({ id: participants.id, name: participants.name })
      .from(participants)
      .where(
        and(
          eq(participants.tripId, tripId),
          or(eq(participants.status, 'active'), eq(participants.status, 'pending')),
        ),
      );

    const matches = findSimilarNames(body.name, rows);
    return c.json({ matches });
  });

  // POST /trips/:id/people
  app.post('/trips/:id/people', async (c) => {
    const tripId = c.req.param('id');
    const actor = await getActor(c, tripId);
    assertWritable(actor.trip);

    const body = await parseJson<{ name?: unknown; confirmNew?: unknown }>(c);
    if (typeof body?.name !== 'string') {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    const name = body.name.trim();
    if (name.length < 1 || name.length > 40) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    const db = getDb(c.env);
    const existing = await db
      .select({ id: participants.id, name: participants.name })
      .from(participants)
      .where(
        and(
          eq(participants.tripId, tripId),
          or(eq(participants.status, 'active'), eq(participants.status, 'pending')),
        ),
      );

    const matches = findSimilarNames(name, existing);
    if (matches.length > 0 && body.confirmNew !== true) {
      throw new ApiError('VALIDATION', 422, 'A similar name is already in this trip.');
    }

    if (actor.kind === 'guest') {
      const pendingCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(participants)
        .where(
          and(
            eq(participants.tripId, tripId),
            eq(participants.createdByDevice, actor.deviceHash),
            eq(participants.status, 'pending'),
          ),
        )
        .get();

      if ((pendingCount?.count ?? 0) >= 3) {
        throw new ApiError('RATE_LIMITED', 429);
      }
    }

    const maxOrderRow = await db
      .select({ maxOrder: max(participants.sortOrder) })
      .from(participants)
      .where(eq(participants.tripId, tripId))
      .get();
    const sortOrder = (maxOrderRow?.maxOrder ?? -1) + 1;

    const participantId = newId();
    const now = nowIso();
    const status = actor.kind === 'guest' ? 'pending' : 'active';

    const insertParticipant = db.insert(participants).values({
      id: participantId,
      tripId,
      name,
      normalizedName: normalizeName(name),
      userId: null,
      status,
      sortOrder,
      createdByDevice: actor.deviceHash,
      createdAt: now,
    });

    const queries: BatchItem<'sqlite'>[] = [insertParticipant];

    if (actor.kind === 'guest') {
      const upsertDevice = db
        .insert(deviceParticipants)
        .values({
          deviceHash: actor.deviceHash,
          tripId,
          participantId,
          lastUsedAt: now,
        })
        .onConflictDoUpdate({
          target: [deviceParticipants.deviceHash, deviceParticipants.tripId],
          set: {
            participantId,
            lastUsedAt: now,
          },
        });
      queries.push(upsertDevice);
    }

    await commitTripWrite(db, tripId, queries, {
      action: 'name_added',
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details: { name },
    });

    return c.json({ participantId }, 201);
  });

  // POST /trips/:id/people/:pid/approve
  app.post('/trips/:id/people/:pid/approve', async (c) => {
    const tripId = c.req.param('id');
    const pid = c.req.param('pid');
    const actor = await getActor(c, tripId);
    assertWritable(actor.trip);
    ensure(actor, 'approve');

    const body = await parseOptionalJson<{ sameAs?: unknown }>(c);
    const sameAs = typeof body?.sameAs === 'string' ? body.sameAs : undefined;
    const db = getDb(c.env);

    if (sameAs) {
      const target = await db
        .select()
        .from(participants)
        .where(and(eq(participants.id, pid), eq(participants.tripId, tripId)))
        .get();

      if (!target || target.status !== 'pending') {
        throw new ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.');
      }

      const sameAsParticipant = await db
        .select()
        .from(participants)
        .where(and(eq(participants.id, sameAs), eq(participants.tripId, tripId)))
        .get();

      if (!sameAsParticipant || sameAsParticipant.status !== 'active') {
        throw new ApiError('VALIDATION', 422);
      }

      await mergeParticipants(db, tripId, pid, sameAs, actor);
      return c.body(null, 204);
    } else {
      const target = await db
        .select()
        .from(participants)
        .where(and(eq(participants.id, pid), eq(participants.tripId, tripId)))
        .get();

      if (!target) {
        throw new ApiError('NOT_FOUND', 404);
      }

      const r = await db
        .update(participants)
        .set({ status: 'active' })
        .where(and(eq(participants.id, pid), eq(participants.status, 'pending')))
        .run();

      if (r.meta.changes === 0) {
        throw new ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.');
      }

      await commitTripWrite(db, tripId, [], {
        action: 'name_approved',
        actorParticipantId: actor.participantId,
        actorUserId: actor.userId,
        actorDevice: actor.deviceHash,
        details: { name: target.name },
      });

      return c.body(null, 204);
    }
  });

  // POST /trips/:id/people/merge
  app.post('/trips/:id/people/merge', async (c) => {
    const tripId = c.req.param('id');
    const actor = await getActor(c, tripId);
    assertWritable(actor.trip);
    ensure(actor, 'merge');

    const body = await parseJson<{ fromId?: unknown; intoId?: unknown }>(c);
    if (typeof body?.fromId !== 'string' || typeof body?.intoId !== 'string') {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    const db = getDb(c.env);
    await mergeParticipants(db, tripId, body.fromId, body.intoId, actor);
    return c.body(null, 204);
  });

  // DELETE /trips/:id/people/:pid
  app.delete('/trips/:id/people/:pid', async (c) => {
    const tripId = c.req.param('id');
    const pid = c.req.param('pid');
    const actor = await getActor(c, tripId);
    assertWritable(actor.trip);
    ensure(actor, 'remove_person');

    const db = getDb(c.env);
    const target = await db
      .select()
      .from(participants)
      .where(and(eq(participants.id, pid), eq(participants.tripId, tripId)))
      .get();

    if (!target) {
      throw new ApiError('NOT_FOUND', 404);
    }

    // Removing a signed-in person would lock them (or the organiser) out of their own trip.
    if (target.userId !== null) {
      throw new ApiError('VALIDATION', 409, 'Signed-in people cannot be removed.');
    }

    const expensePayer = await db
      .select({ id: expenses.id })
      .from(expenses)
      .where(and(eq(expenses.tripId, tripId), eq(expenses.payerId, pid)))
      .limit(1)
      .get();

    if (expensePayer) {
      throw new ApiError('VALIDATION', 409, 'Use merge instead');
    }

    const share = await db
      .select({ expenseId: expenseShares.expenseId })
      .from(expenseShares)
      .innerJoin(expenses, eq(expenseShares.expenseId, expenses.id))
      .where(and(eq(expenses.tripId, tripId), eq(expenseShares.participantId, pid)))
      .limit(1)
      .get();

    if (share) {
      throw new ApiError('VALIDATION', 409, 'Use merge instead');
    }

    const paymentRow = await db
      .select({ id: payments.id })
      .from(payments)
      .where(
        and(
          eq(payments.tripId, tripId),
          or(eq(payments.fromId, pid), eq(payments.toId, pid)),
        ),
      )
      .limit(1)
      .get();

    if (paymentRow) {
      throw new ApiError('VALIDATION', 409, 'Use merge instead');
    }

    const deleteParticipant = db
      .delete(participants)
      .where(and(eq(participants.id, pid), eq(participants.tripId, tripId)));

    const deleteDeviceParticipants = db
      .delete(deviceParticipants)
      .where(
        and(
          eq(deviceParticipants.participantId, pid),
          eq(deviceParticipants.tripId, tripId),
        ),
      );

    await commitTripWrite(db, tripId, [deleteParticipant, deleteDeviceParticipants], {
      action: 'person_removed',
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details: { name: target.name },
    });

    return c.body(null, 204);
  });

  // POST /trips/:id/membership
  app.post('/trips/:id/membership', async (c) => {
    const tripId = c.req.param('id');
    const user = await getSessionUser(c);
    if (!user) {
      throw new ApiError('UNAUTHENTICATED', 401);
    }

    const actor = await getActor(c, tripId);
    const body = await parseJson<{ participantId?: unknown }>(c);
    if (typeof body?.participantId !== 'string') {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    const participantId = body.participantId;
    if (actor.kind !== 'guest' || actor.participantId !== participantId) {
      throw new ApiError('FORBIDDEN', 403);
    }

    const db = getDb(c.env);
    const target = await db
      .select()
      .from(participants)
      .where(and(eq(participants.id, participantId), eq(participants.tripId, tripId)))
      .get();

    if (!target || target.userId !== null) {
      throw new ApiError('FORBIDDEN', 403);
    }

    assertWritable(actor.trip);

    const requestId = newId();
    const insertRequest = db.insert(membershipRequests).values({
      id: requestId,
      tripId,
      participantId,
      userId: user.id,
      status: 'pending',
      createdAt: nowIso(),
    });

    await commitTripWrite(db, tripId, [insertRequest], {
      action: 'membership_requested',
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details: {},
    });

    return c.json({ requestId }, 201);
  });

  // POST /trips/:id/membership/:rid/approve
  app.post('/trips/:id/membership/:rid/approve', async (c) => {
    const tripId = c.req.param('id');
    const rid = c.req.param('rid');
    const actor = await getActor(c, tripId);
    assertWritable(actor.trip);
    ensure(actor, 'approve');

    const db = getDb(c.env);
    const req = await db
      .select()
      .from(membershipRequests)
      .where(
        and(
          eq(membershipRequests.id, rid),
          eq(membershipRequests.tripId, tripId),
        ),
      )
      .get();

    if (!req) {
      throw new ApiError('NOT_FOUND', 404);
    }

    const r = await db
      .update(membershipRequests)
      .set({ status: 'approved' })
      .where(
        and(
          eq(membershipRequests.id, rid),
          eq(membershipRequests.tripId, tripId),
          eq(membershipRequests.status, 'pending'),
        ),
      )
      .run();

    if (r.meta.changes === 0) {
      throw new ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.');
    }

    const p = await db
      .select()
      .from(participants)
      .where(
        and(
          eq(participants.id, req.participantId),
          eq(participants.tripId, tripId),
        ),
      )
      .get();

    if (!p || p.userId !== null) {
      throw new ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.');
    }

    const updateParticipant = db
      .update(participants)
      .set({ userId: req.userId })
      .where(eq(participants.id, req.participantId));

    await commitTripWrite(db, tripId, [updateParticipant], {
      action: 'membership_approved',
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details: {},
    });

    return c.body(null, 204);
  });

  // POST /trips/:id/membership/:rid/reject
  app.post('/trips/:id/membership/:rid/reject', async (c) => {
    const tripId = c.req.param('id');
    const rid = c.req.param('rid');
    const actor = await getActor(c, tripId);
    assertWritable(actor.trip);
    ensure(actor, 'approve');

    const db = getDb(c.env);
    const r = await db
      .update(membershipRequests)
      .set({ status: 'rejected' })
      .where(
        and(
          eq(membershipRequests.id, rid),
          eq(membershipRequests.tripId, tripId),
          eq(membershipRequests.status, 'pending'),
        ),
      )
      .run();

    if (r.meta.changes === 0) {
      throw new ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.');
    }

    await commitTripWrite(db, tripId, [], {
      action: 'membership_rejected',
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details: {},
    });

    return c.body(null, 204);
  });

  return app;
}
