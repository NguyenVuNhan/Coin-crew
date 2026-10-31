import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { mergeProposals } from '../db/schema';
import { ApiError, isDbError } from '../lib/errors';
import { newId, nowIso } from '../lib/ids';

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
