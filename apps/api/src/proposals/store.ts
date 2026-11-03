import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { normalizeName } from '@cc/core';
import type { Db } from '../db/client';
import { mergeProposals, participants, users } from '../db/schema';
import { commitTripWrite } from '../lib/commit';
import { ApiError, isDbError } from '../lib/errors';
import { newId, nowIso } from '../lib/ids';
import { mergeParticipants } from '../participants/merge';

export type ProposalRow = typeof mergeProposals.$inferSelect;

const alreadyClaimed = () => new ApiError('ALREADY_CLAIMED', 409, 'Someone already claimed this person, ask the owner');

/**
 * Inserts a pending proposal unless the guest already has a pending claim or proposal
 * (ALREADY_CLAIMED, 409), or is no longer an unlinked active/pending guest of the trip
 * (ALREADY_HANDLED, 409). One statement, so it is race-safe against claims; the partial
 * unique index merge_proposals_one_pending settles two proposals racing each other.
 */
export async function insertProposal(
  db: Db,
  p: {
    tripId: string;
    guestPid: string;
    intoPid: string | null;
    targetUserId: string | null;
    requestedBy: string;
    needsUser: boolean;
    needsAdmin: boolean;
  },
): Promise<string> {
  const id = newId();
  let inserted: number;
  try {
    const r = await db.run(sql`
      INSERT INTO merge_proposals
        (id, trip_id, guest_pid, into_pid, target_user_id, requested_by_user_id, needs_user, needs_admin, status, created_at)
      SELECT ${id}, ${p.tripId}, ${p.guestPid}, ${p.intoPid}, ${p.targetUserId}, ${p.requestedBy},
        ${p.needsUser ? 1 : 0}, ${p.needsAdmin ? 1 : 0}, 'pending', ${nowIso()}
      WHERE NOT EXISTS (
        SELECT 1 FROM membership_requests WHERE participant_id = ${p.guestPid} AND status = 'pending'
      ) AND EXISTS (
        SELECT 1 FROM participants
        WHERE id = ${p.guestPid} AND trip_id = ${p.tripId} AND status IN ('active', 'pending') AND user_id IS NULL
      )`);
    inserted = r.meta.changes;
  } catch (err) {
    if (isDbError(err, 'UNIQUE constraint failed')) throw alreadyClaimed();
    throw err;
  }
  if (inserted === 0) {
    // Tell "someone is already asking" apart from "the guest is gone".
    const claim = await db.get<{ one: number }>(
      sql`SELECT 1 AS one FROM membership_requests WHERE participant_id = ${p.guestPid} AND status = 'pending' LIMIT 1`,
    );
    if (claim) throw alreadyClaimed();
    throw new ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.');
  }
  return id;
}

export async function pendingProposalFor(db: Db, guestPid: string): Promise<ProposalRow | null> {
  const row = await db
    .select()
    .from(mergeProposals)
    .where(and(eq(mergeProposals.guestPid, guestPid), eq(mergeProposals.status, 'pending')))
    .get();
  return row ?? null;
}

const alreadyHandled = () => new ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.');

const isLive = (p: { status: string } | undefined) => p !== undefined && (p.status === 'active' || p.status === 'pending');

/** Marks a pending proposal void: its guest (or the person it merges into) is gone. */
async function cancelProposal(db: Db, id: string): Promise<void> {
  await db
    .update(mergeProposals)
    .set({ status: 'cancelled', decidedAt: nowIso() })
    .where(and(eq(mergeProposals.id, id), eq(mergeProposals.status, 'pending')));
}

/**
 * Finishes a proposal once every side it needs has accepted; until then answers 'waiting'.
 * The outcome is decided now, not when it was asked: P merges into `into_pid`, or into the
 * friend's participant if they joined the trip meanwhile, or else P is linked to the friend the
 * way an approved claim is. A guest (or `into_pid`) that is no longer there voids the proposal:
 * it is marked cancelled and this throws ALREADY_HANDLED. `logActor` is whoever accepted last.
 */
export async function completeIfReady(
  db: Db,
  proposalId: string,
  logActor: { participantId: string | null; userId: string | null; deviceHash: string | null },
): Promise<'approved' | 'waiting'> {
  const row = await db.select().from(mergeProposals).where(eq(mergeProposals.id, proposalId)).get();
  if (!row || row.status !== 'pending') throw alreadyHandled();
  if ((row.needsUser && !row.userAcceptedAt) || (row.needsAdmin && !row.adminAcceptedAt)) return 'waiting';

  const pick = (id: string) =>
    db.select().from(participants).where(and(eq(participants.id, id), eq(participants.tripId, row.tripId))).get();
  const [guest, into] = await Promise.all([pick(row.guestPid), row.intoPid ? pick(row.intoPid) : undefined]);
  if (!isLive(guest) || guest!.userId !== null || (row.intoPid !== null && !isLive(into))) {
    await cancelProposal(db, row.id);
    throw alreadyHandled();
  }

  let intoPid = row.intoPid;
  const friend = row.targetUserId
    ? await db.select().from(users).where(eq(users.id, row.targetUserId)).get()
    : undefined;
  if (!intoPid && row.targetUserId) {
    const member = await db
      .select({ id: participants.id })
      .from(participants)
      .where(and(eq(participants.tripId, row.tripId), eq(participants.userId, row.targetUserId), eq(participants.status, 'active')))
      .get();
    intoPid = member?.id ?? null;
  }
  if (!intoPid && !row.targetUserId) {
    await cancelProposal(db, row.id);
    throw alreadyHandled();
  }

  // Claim the proposal first, so two last accepts racing each other complete it once.
  const claimed = await db
    .update(mergeProposals)
    .set({ status: 'approved', decidedAt: nowIso() })
    .where(and(eq(mergeProposals.id, row.id), eq(mergeProposals.status, 'pending')))
    .run();
  if (claimed.meta.changes === 0) throw alreadyHandled();

  try {
    if (intoPid) {
      // The merge is recorded under whoever accepted last; a device-only admin falls back to the requester.
      await mergeParticipants(db, row.tripId, row.guestPid, intoPid, {
        userId: logActor.userId ?? row.requestedByUserId,
        participantId: logActor.participantId,
        deviceHash: logActor.deviceHash ?? '',
      });
    } else {
      const updates: { userId: string; name?: string; normalizedName?: string; gender?: 'M' | 'F' | null } = {
        userId: row.targetUserId!,
      };
      if (friend?.name) {
        updates.name = friend.name;
        updates.normalizedName = normalizeName(friend.name);
      }
      if (friend?.gender === 'M' || friend?.gender === 'F') updates.gender = friend.gender;
      // Link only a name that is still active or pending and unlinked; otherwise the proposal is void.
      const linked = await db
        .update(participants)
        .set(updates)
        .where(
          and(
            eq(participants.id, row.guestPid),
            eq(participants.tripId, row.tripId),
            isNull(participants.userId),
            or(eq(participants.status, 'active'), eq(participants.status, 'pending')),
          ),
        )
        .run();
      if (linked.meta.changes === 0) {
        await db.update(mergeProposals).set({ status: 'cancelled' }).where(eq(mergeProposals.id, row.id));
        throw alreadyHandled();
      }
    }
  } catch (err) {
    if (!(err instanceof ApiError && err.code === 'ALREADY_HANDLED')) {
      // Nothing was written: the proposal waits again.
      await db.update(mergeProposals).set({ status: 'pending', decidedAt: null }).where(eq(mergeProposals.id, row.id));
    }
    throw err;
  }

  await commitTripWrite(db, row.tripId, [], {
    action: 'merge_proposal_accepted',
    actorParticipantId: logActor.participantId,
    actorUserId: logActor.userId,
    actorDevice: logActor.deviceHash,
    details: {
      proposalId: row.id,
      participantId: row.guestPid,
      name: guest!.name,
      ...(intoPid ? { intoId: intoPid, intoName: intoPid === row.intoPid ? into!.name : friend?.name ?? '' } : {}),
      ...(row.targetUserId ? { targetUserId: row.targetUserId, targetName: friend?.name ?? '' } : {}),
    },
  });
  return 'approved';
}
