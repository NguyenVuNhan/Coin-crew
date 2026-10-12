import type { ActivityAction } from '@fsl/core';
import type { BatchItem } from 'drizzle-orm/batch';
import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { activity as activityTable, trips } from '../db/schema';
import { newId, nowIso } from './ids';

export interface ActivityInput {
  action: ActivityAction;
  actorParticipantId: string | null;
  actorUserId: string | null;
  actorDevice: string | null;
  details: Record<string, unknown>;
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

  const insertActivity = db.insert(activityTable).values({
    id: newId(),
    tripId,
    actorParticipantId: activity.actorParticipantId,
    actorUserId: activity.actorUserId,
    actorDevice: activity.actorDevice,
    action: activity.action,
    detailsJson: JSON.stringify(activity.details),
    createdAt: nowIso(),
  });

  await db.batch([
    ...queries,
    updateTrip,
    insertActivity,
  ] as unknown as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
}
