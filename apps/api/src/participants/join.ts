import type { Context } from 'hono';
import { Hono } from 'hono';
import { and, eq, max, or } from 'drizzle-orm';
import type { JoinResponse } from '@fsl/core';
import { findSimilarNames, normalizeName } from '@fsl/core';
import type { AppBindings } from '../env';
import { getDb } from '../db/client';
import {
  deviceParticipants,
  membershipRequests,
  participants,
} from '../db/schema';
import { getSessionUser } from '../auth/session';
import { assertWritable, resolveActor } from '../access/actor';
import { commitTripWrite } from '../lib/commit';
import { ApiError } from '../lib/errors';
import { newId, nowIso } from '../lib/ids';

async function parseJson<T>(c: Context): Promise<T> {
  try {
    const text = await c.req.text();
    if (!text || text.trim() === '') {
      return {} as T;
    }
    const val = JSON.parse(text);
    if (!val || typeof val !== 'object' || Array.isArray(val)) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }
    return val as T;
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }
    throw new ApiError('VALIDATION', 422, 'Invalid request');
  }
}

export function joinRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  // POST /trips/:id/join
  app.post('/trips/:id/join', async (c) => {
    const user = await getSessionUser(c);
    if (!user) {
      throw new ApiError('UNAUTHENTICATED', 401);
    }

    const tripId = c.req.param('id');
    const actor = await resolveActor(c, tripId);
    if (actor.kind === 'member') {
      throw new ApiError('ALREADY_HANDLED', 409, 'You are already in this group.');
    }
    if (actor.kind === 'viewer') {
      throw new ApiError('FORBIDDEN', 403);
    }

    assertWritable(actor.trip);

    const body = await parseJson<{ name?: unknown; gender?: unknown; confirmNew?: unknown }>(c);

    const db = getDb(c.env);
    const rejectClaims = db
      .update(membershipRequests)
      .set({ status: 'rejected' })
      .where(
        and(
          eq(membershipRequests.userId, user.id),
          eq(membershipRequests.tripId, tripId),
          eq(membershipRequests.status, 'pending'),
        ),
      );

    const left = await db
      .select()
      .from(participants)
      .where(
        and(
          eq(participants.tripId, tripId),
          eq(participants.userId, user.id),
          eq(participants.status, 'left'),
        ),
      )
      .get();

    if (left) {
      await commitTripWrite(
        db,
        tripId,
        [
          db
            .update(participants)
            .set({ status: 'active' })
            .where(eq(participants.id, left.id)),
          rejectClaims,
        ],
        {
          action: 'member_rejoined',
          actorParticipantId: left.id,
          actorUserId: user.id,
          actorDevice: actor.deviceHash,
          details: { name: left.name },
        },
      );
      return c.json({ participantId: left.id, rejoined: true } satisfies JoinResponse, 201);
    }

    const rawName = typeof body.name === 'string' ? body.name : user.name;
    const name = rawName.trim();
    if (name.length < 1 || name.length > 40) {
      throw new ApiError('VALIDATION', 422, 'Invalid name');
    }

    let gender: 'M' | 'F' | null = null;
    if (body.gender === 'M' || body.gender === 'F') {
      gender = body.gender;
    } else if (body.gender !== undefined && body.gender !== null) {
      throw new ApiError('VALIDATION', 422, 'Invalid gender');
    } else {
      gender = user.gender === 'M' || user.gender === 'F' ? user.gender : null;
    }

    if (actor.trip.preset === 'sport' && gender === null) {
      throw new ApiError('VALIDATION', 422, 'Gender required');
    }

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

    const maxOrderRow = await db
      .select({ maxOrder: max(participants.sortOrder) })
      .from(participants)
      .where(eq(participants.tripId, tripId))
      .get();
    const sortOrder = (maxOrderRow?.maxOrder ?? -1) + 1;

    const participantId = newId();
    const now = nowIso();

    const insertParticipant = db.insert(participants).values({
      id: participantId,
      tripId,
      name,
      normalizedName: normalizeName(name),
      gender,
      userId: user.id,
      status: 'active',
      sortOrder,
      createdByDevice: actor.deviceHash,
      createdAt: now,
    });

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

    await commitTripWrite(
      db,
      tripId,
      [insertParticipant, upsertDevice, rejectClaims],
      {
        action: 'member_joined',
        actorParticipantId: participantId,
        actorUserId: user.id,
        actorDevice: actor.deviceHash,
        details: { name },
      },
    );

    return c.json({ participantId, rejoined: false } satisfies JoinResponse, 201);
  });

  return app;
}
