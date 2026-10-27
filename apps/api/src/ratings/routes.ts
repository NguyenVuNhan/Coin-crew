import type { Context } from 'hono';
import { Hono } from 'hono';
import { and, eq, sql } from 'drizzle-orm';
import { RATING_MAX_STARS_PER_TARGET, maxStarsForGroup } from '@fsl/core';
import type { AppBindings } from '../env';
import { getDb } from '../db/client';
import { participants, playerRatings, trips } from '../db/schema';
import { assertWritable, resolveActor } from '../access/actor';
import { ensure } from '../access/guard';
import { ApiError } from '../lib/errors';
import { nowIso } from '../lib/ids';

async function parseJson<T>(c: Context): Promise<T> {
  try {
    return await c.req.json<T>();
  } catch {
    throw new ApiError('VALIDATION', 422, 'Invalid request');
  }
}

export function ratingRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  // POST /trips/:id/ratings
  app.post('/trips/:id/ratings', async (c) => {
    const tripId = c.req.param('id');
    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);

    if (actor.trip.preset !== 'sport' || actor.trip.ratingsEnabled !== 1) {
      throw new ApiError('FORBIDDEN', 403, 'Player ratings are not enabled for this group.');
    }

    ensure(actor, 'rate_player');
    if (actor.participantId === null) {
      throw new ApiError('FORBIDDEN', 403);
    }

    const body = await parseJson<{
      targetParticipantId?: unknown;
      delta?: unknown;
      stars?: unknown;
    }>(c);

    if (
      !body ||
      typeof body.targetParticipantId !== 'string' ||
      body.targetParticipantId.length < 1
    ) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    const isValidDelta =
      body.stars === undefined && (body.delta === 1 || body.delta === -1);

    const isValidStars =
      body.delta === undefined &&
      typeof body.stars === 'number' &&
      Number.isInteger(body.stars) &&
      body.stars >= 0 &&
      body.stars <= RATING_MAX_STARS_PER_TARGET;

    if (!isValidDelta && !isValidStars) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    const raterId = actor.participantId;
    const targetId = body.targetParticipantId;

    if (targetId === raterId) {
      throw new ApiError('VALIDATION', 422, 'You cannot rate yourself.');
    }

    const db = getDb(c.env);
    const activeRows = await db
      .select({ id: participants.id })
      .from(participants)
      .where(and(eq(participants.tripId, tripId), eq(participants.status, 'active')));

    const activeIds = new Set(activeRows.map((p) => p.id));
    if (!activeIds.has(targetId)) {
      throw new ApiError('VALIDATION', 422, 'Invalid player.');
    }

    const maxStars = maxStarsForGroup(activeIds.size);

    const myRows = await db
      .select({
        targetParticipantId: playerRatings.targetParticipantId,
        stars: playerRatings.stars,
      })
      .from(playerRatings)
      .where(
        and(
          eq(playerRatings.tripId, tripId),
          eq(playerRatings.raterParticipantId, raterId),
        ),
      );

    let spentStars = 0;
    let currentTargetStars = 0;
    for (const r of myRows) {
      if (activeIds.has(r.targetParticipantId) && r.stars > 0) {
        spentStars += r.stars;
        if (r.targetParticipantId === targetId) {
          currentTargetStars = r.stars;
        }
      }
    }

    const nextTargetStars =
      typeof body.stars === 'number'
        ? body.stars
        : currentTargetStars + (body.delta as 1 | -1);
    const diff = nextTargetStars - currentTargetStars;

    if (diff > 0) {
      if (spentStars + diff > maxStars) {
        throw new ApiError('RATING_LIMIT', 409, 'No stars left in your budget.');
      }
      if (nextTargetStars > RATING_MAX_STARS_PER_TARGET) {
        throw new ApiError('RATING_LIMIT', 409, 'Maximum stars per player reached.');
      }
    }

    if (diff <= 0 && body.delta === -1) {
      if (currentTargetStars <= 0) {
        throw new ApiError('RATING_LIMIT', 409, 'No stars to take back.');
      }
    }

    if (diff === 0 && body.stars === 0 && currentTargetStars === 0) {
      throw new ApiError('RATING_LIMIT', 409, 'No stars to take back.');
    }

    const nextSpentStars = spentStars + diff;
    const now = nowIso();

    const ratingWrite =
      nextTargetStars <= 0
        ? db
            .delete(playerRatings)
            .where(
              and(
                eq(playerRatings.tripId, tripId),
                eq(playerRatings.raterParticipantId, raterId),
                eq(playerRatings.targetParticipantId, targetId),
              ),
            )
        : db
            .insert(playerRatings)
            .values({
              tripId,
              raterParticipantId: raterId,
              targetParticipantId: targetId,
              stars: nextTargetStars,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: [
                playerRatings.tripId,
                playerRatings.raterParticipantId,
                playerRatings.targetParticipantId,
              ],
              set: {
                stars: nextTargetStars,
                updatedAt: now,
              },
            });

    // Strict anonymity: bump trip version so the cached snapshot rebuilds, without writing an activity row.
    const bumpVersion = db
      .update(trips)
      .set({ version: sql`${trips.version} + 1` })
      .where(eq(trips.id, tripId));

    await db.batch([ratingWrite, bumpVersion]);

    return c.json({ stars: nextTargetStars, spentStars: nextSpentStars, maxStars }, 200);
  });

  return app;
}
