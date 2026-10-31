import type { Context } from 'hono';
import { and, eq } from 'drizzle-orm';
import type { Actor } from '@fsl/core';
import type { AppBindings } from '../env';
import { getDb } from '../db/client';
import { deviceParticipants, participants, trips } from '../db/schema';
import { getSessionUser } from '../auth/session';
import { ApiError } from '../lib/errors';

export type TripRow = typeof trips.$inferSelect;
export type ResolvedActor = Actor & { userId: string | null; deviceHash: string; trip: TripRow };

export async function resolveActor(c: Context<AppBindings>, tripId: string): Promise<ResolvedActor> {
  const db = getDb(c.env);
  const trip = await db
    .select()
    .from(trips)
    .where(eq(trips.id, tripId))
    .get();

  if (!trip) {
    throw new ApiError('NOT_FOUND', 404);
  }

  const deviceHash = c.get('deviceHash');
  const user = await getSessionUser(c);

  // A personal ledger is its organiser's alone. The people in it reach their own pair only through
  // /me/people/*, /me/settlements/* and /r/:token, never as a member or through its (unshown) links.
  if (trip.preset === 'direct' && (!user || user.id !== trip.organiserUserId)) {
    throw new ApiError('FORBIDDEN', 403);
  }

  if (user) {
    const participant = await db
      .select()
      .from(participants)
      .where(
        and(
          eq(participants.tripId, tripId),
          eq(participants.userId, user.id),
          eq(participants.status, 'active'),
        ),
      )
      .get();

    if (participant) {
      return {
        kind: 'member',
        participantId: participant.id,
        participantPending: false,
        isOrganiser: trip.organiserUserId === user.id,
        isAdmin: participant.isAdmin === 1 || trip.organiserUserId === user.id,
        userId: user.id,
        deviceHash,
        trip,
      };
    }
  }

  const token = c.req.header('X-Link-Token');

  if (token) {
    if (token === trip.groupToken) {
      let participantId: string | null = null;
      let participantPending = false;

      const dp = await db
        .select()
        .from(deviceParticipants)
        .where(
          and(
            eq(deviceParticipants.deviceHash, deviceHash),
            eq(deviceParticipants.tripId, tripId),
          ),
        )
        .get();

      if (dp) {
        let current = await db
          .select()
          .from(participants)
          .where(eq(participants.id, dp.participantId))
          .get();

        let hops = 0;
        while (current && current.status === 'merged' && current.mergedInto && hops < 10) {
          hops++;
          const next = await db
            .select()
            .from(participants)
            .where(eq(participants.id, current.mergedInto))
            .get();
          if (!next) {
            break;
          }
          current = next;
        }

        if (current) {
          participantId = current.id;
          participantPending = current.status === 'pending';
        }
      }

      return {
        kind: 'guest',
        participantId,
        participantPending,
        isOrganiser: false,
        userId: user?.id ?? null,
        deviceHash,
        trip,
      };
    }

    if (token === trip.viewToken) {
      return {
        kind: 'viewer',
        participantId: null,
        participantPending: false,
        isOrganiser: false,
        userId: user?.id ?? null,
        deviceHash,
        trip,
      };
    }

    throw new ApiError('LINK_DEAD', 410, 'This link no longer works. Ask the organiser for a new one.');
  }

  throw new ApiError('FORBIDDEN', 403);
}

export function assertWritable(trip: TripRow): void {
  if (trip.archivedAt) {
    throw new ApiError('TRIP_ARCHIVED', 409, 'This trip is archived.');
  }
}
