import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { deviceParticipants, devices, participants } from '../db/schema';
import { nowIso } from '../lib/ids';

/** The Zalo account this device signed in with as a guest, if any. */
export async function deviceZaloSub(db: Db, deviceHash: string): Promise<string | null> {
  const row = await db
    .select({ zaloSub: devices.zaloSub })
    .from(devices)
    .where(eq(devices.idHash, deviceHash))
    .get();
  return row?.zaloSub ?? null;
}

/**
 * Turn every active, user-less slot tied to `zaloSub` into a membership of `userId`. The owner
 * already decided this person is that slot, so there is no request and no approval. A group where
 * the user already has a participant row is skipped (no second membership).
 */
export async function linkZaloSlots(db: Db, userId: string, zaloSub: string): Promise<number> {
  const slots = await db
    .select({ id: participants.id, tripId: participants.tripId })
    .from(participants)
    .where(
      and(
        eq(participants.zaloSub, zaloSub),
        isNull(participants.userId),
        eq(participants.status, 'active'),
      ),
    );

  let linked = 0;
  for (const slot of slots) {
    // The "no row yet" check sits in the UPDATE itself, so a concurrent link or claim can't
    // give the user two rows in one group.
    const done = await db
      .update(participants)
      .set({ userId })
      .where(
        and(
          eq(participants.id, slot.id),
          isNull(participants.userId),
          eq(participants.status, 'active'),
          sql`NOT EXISTS (SELECT 1 FROM participants p2 WHERE p2.trip_id = ${slot.tripId} AND p2.user_id = ${userId})`,
        ),
      )
      .returning({ id: participants.id });

    if (done.length > 0) {
      linked++;
    } else {
      console.warn(`Zalo slot ${slot.id} in trip ${slot.tripId} not linked to user ${userId}: they already have a slot there`);
    }
  }
  return linked;
}

/**
 * A Zalo guest device opening a group it hasn't picked in yet lands on its Zalo-tied slot.
 * Returns the participant id when it made that pick, else null.
 */
export async function claimZaloSlot(db: Db, deviceHash: string, tripId: string): Promise<string | null> {
  const zaloSub = await deviceZaloSub(db, deviceHash);
  if (!zaloSub) return null;

  const existing = await db
    .select({ participantId: deviceParticipants.participantId })
    .from(deviceParticipants)
    .where(and(eq(deviceParticipants.deviceHash, deviceHash), eq(deviceParticipants.tripId, tripId)))
    .get();
  if (existing) return null;

  const slot = await db
    .select({ id: participants.id })
    .from(participants)
    .where(
      and(
        eq(participants.tripId, tripId),
        eq(participants.zaloSub, zaloSub),
        isNull(participants.userId),
        eq(participants.status, 'active'),
      ),
    )
    .get();
  if (!slot) return null;

  const inserted = await db
    .insert(deviceParticipants)
    .values({ deviceHash, tripId, participantId: slot.id, lastUsedAt: nowIso() })
    .onConflictDoNothing({ target: [deviceParticipants.deviceHash, deviceParticipants.tripId] })
    .returning({ participantId: deviceParticipants.participantId });

  return inserted[0]?.participantId ?? null;
}
