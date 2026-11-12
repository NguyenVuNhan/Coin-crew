import type { ActivityAction } from '@cc/core';
import type { BatchItem } from 'drizzle-orm/batch';
import { eq, sql } from 'drizzle-orm';
import type { Db } from './client';
import { activity as activityTable, trips } from './schema';
import { newId, nowIso } from '@cc/api-util/ids';
import { ApiError, isDbError } from '@cc/api-util/errors';

export interface ActivityInput {
  action: ActivityAction;
  actorParticipantId: string | null;
  actorUserId: string | null;
  actorDevice: string | null;
  details: Record<string, unknown>;
}

function activityInsert(db: Db, tripId: string, activity: ActivityInput) {
  return db.insert(activityTable).values({
    id: newId(),
    tripId,
    actorParticipantId: activity.actorParticipantId,
    actorUserId: activity.actorUserId,
    actorDevice: activity.actorDevice,
    action: activity.action,
    detailsJson: JSON.stringify(activity.details),
    createdAt: nowIso(),
  });
}

export async function commitTripWrite(
  db: Db,
  tripId: string,
  queries: BatchItem<'sqlite'>[],
  activity: ActivityInput,
): Promise<void> {
  const updateTrip = db
    .update(trips)
    .set({ version: sql`${trips.version} + 1` })
    .where(eq(trips.id, tripId));

  const insertActivity = activityInsert(db, tripId, activity);

  await db.batch([
    ...queries,
    updateTrip,
    insertActivity,
  ] as unknown as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
}

/**
 * Like `commitTripWrite`, but the whole batch only lands when `guard` (a conditional UPDATE or
 * INSERT…SELECT) changed at least one row. The version bump sits right after the guard and reads
 * `changes()`: on a miss it sets `trips.version` to NULL, the NOT NULL constraint fails, and D1 rolls
 * the batch back. That one failure becomes `onMiss()`; every other error is rethrown unchanged.
 */
export async function guardedTripWrite(
  db: Db,
  tripId: string,
  guard: BatchItem<'sqlite'>,
  queries: BatchItem<'sqlite'>[],
  activity: ActivityInput,
  onMiss: () => Error = () => new ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.'),
): Promise<void> {
  const bumpIfGuardHit = db
    .update(trips)
    .set({ version: sql`CASE WHEN changes() > 0 THEN ${trips.version} + 1 ELSE NULL END` })
    .where(eq(trips.id, tripId));

  try {
    await db.batch([
      guard,
      bumpIfGuardHit,
      ...queries,
      activityInsert(db, tripId, activity),
    ] as unknown as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
  } catch (err) {
    if (isDbError(err, 'NOT NULL constraint failed: trips.version')) throw onMiss();
    throw err;
  }
}
