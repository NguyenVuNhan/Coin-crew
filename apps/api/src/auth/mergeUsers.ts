import type { AuthProvider } from '@fsl/core';
import type { BatchItem } from 'drizzle-orm/batch';
import { and, asc, eq, exists, inArray, ne, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { ResolvedActor } from '../access/actor';
import type { Db } from '../db/client';
import {
  accountMergeRequests,
  activity,
  bankDetails,
  membershipRequests,
  participants,
  sessions,
  transactions,
  trips,
  users,
} from '../db/schema';
import { ApiError } from '../lib/errors';
import { nowIso } from '../lib/ids';
import { mergeParticipants } from '../participants/merge';
import type { UserRow } from './session';

export type MergeRequestRow = typeof accountMergeRequests.$inferSelect;

/**
 * A's identity and profile columns once B is merged into it (spec §4.3.3).
 * A takes the proved identity for `provider`; for the other provider it keeps its own, or takes B's when it has none.
 * The email follows whichever Google identity A ends up with.
 */
function mergedUserFields(a: UserRow, b: UserRow, provider: AuthProvider, providerSub: string) {
  const googleFromB = provider === 'google' || (a.googleSub == null && b.googleSub != null);
  const googleSub = provider === 'google' ? providerSub : (a.googleSub ?? b.googleSub);
  const zaloSub = provider === 'zalo' ? providerSub : (a.zaloSub ?? b.zaloSub);
  const takeProfile = a.customProfile === 0 && b.customProfile === 1;
  const profile = takeProfile ? b : a;
  return {
    googleSub,
    zaloSub,
    email: googleSub == null ? null : (googleFromB ? b.email : a.email),
    name: profile.name,
    gender: profile.gender,
    avatarUrl: profile.avatarUrl,
    customProfile: takeProfile ? 1 : a.customProfile,
    consentAt: a.consentAt ?? b.consentAt,
  };
}

/**
 * Merge account B (`request.mergedUserId`) into account A (`request.survivorUserId`), spec §4.5.5.
 * The caller has already checked the request is B's, pending, unexpired and not stale.
 *
 * Phase 1 is one atomic batch with a constant number of set-based statements.
 * Phase 2 merges the two names in each group both accounts were in; a failure there is logged and the
 * account merge still stands (both names stay in that group, linked to A, and an admin can merge them).
 * `deps` exists only so tests can make a group merge fail.
 */
export async function mergeUsers(
  db: Db,
  request: MergeRequestRow,
  deviceHash: string,
  deps: { mergeParticipants: typeof mergeParticipants } = { mergeParticipants },
): Promise<void> {
  const aId = request.survivorUserId;
  const bId = request.mergedUserId;

  const pair = await db.select().from(users).where(inArray(users.id, [aId, bId]));
  const a = pair.find((u) => u.id === aId);
  const b = pair.find((u) => u.id === bId);
  if (!a || !b) {
    throw new ApiError('MERGE_STALE', 409, 'This merge request is out of date.');
  }

  // Groups where both accounts have an active name, read before phase 1 makes B's names A's.
  const aName = alias(participants, 'a_name');
  const bName = alias(participants, 'b_name');
  const sharedRows = await db
    .select({
      trip: trips,
      fromId: bName.id,
      fromAdmin: bName.isAdmin,
      intoId: aName.id,
      intoAdmin: aName.isAdmin,
    })
    .from(bName)
    .innerJoin(aName, and(eq(aName.tripId, bName.tripId), eq(aName.userId, aId), eq(aName.status, 'active')))
    .innerJoin(trips, eq(trips.id, bName.tripId))
    .where(and(eq(bName.userId, bId), eq(bName.status, 'active')))
    .orderBy(asc(bName.tripId), asc(aName.sortOrder));
  // If A has more than one active name in a group, merge B's into the first one.
  const shared = sharedRows.filter((row, i) => sharedRows.findIndex((r) => r.fromId === row.fromId) === i);

  const now = nowIso();
  const aApprovedBank = alias(bankDetails, 'a_approved_bank');

  const phase1: BatchItem<'sqlite'>[] = [
    // 1. B first, so its identities free the unique indexes A takes next.
    db.delete(users).where(eq(users.id, bId)),
    // 2. A: identities, profile and consent.
    db.update(users).set(mergedUserFields(a, b, request.provider, request.providerSub)).where(eq(users.id, aId)),
    // 3. Every reference to B now points at A.
    db.update(participants).set({ userId: aId }).where(eq(participants.userId, bId)),
    db.update(trips).set({ organiserUserId: aId }).where(eq(trips.organiserUserId, bId)),
    db.update(membershipRequests).set({ userId: aId }).where(eq(membershipRequests.userId, bId)),
    db.update(transactions).set({ disabledByUserId: aId }).where(eq(transactions.disabledByUserId, bId)),
    db.update(bankDetails).set({ approvedByUserId: aId }).where(eq(bankDetails.approvedByUserId, bId)),
    db.update(activity).set({ actorUserId: aId }).where(eq(activity.actorUserId, bId)),
    db.update(sessions).set({ userId: aId }).where(eq(sessions.userId, bId)),
    // 4. Bank details: when A already has an approved one, B's live ones are replaced; then all of B's move to A.
    //    The check runs inside the batch, so it sees A's rows as of this transaction.
    db
      .update(bankDetails)
      .set({ status: 'replaced' })
      .where(
        and(
          eq(bankDetails.userId, bId),
          inArray(bankDetails.status, ['approved', 'pending']),
          exists(
            db
              .select({ id: aApprovedBank.id })
              .from(aApprovedBank)
              .where(and(eq(aApprovedBank.userId, aId), eq(aApprovedBank.status, 'approved'))),
          ),
        ),
      ),
    db.update(bankDetails).set({ userId: aId }).where(eq(bankDetails.userId, bId)),
    // 5. This request is accepted; any other pending request involving B is moot.
    db
      .update(accountMergeRequests)
      .set({ status: 'accepted', decidedAt: now })
      .where(eq(accountMergeRequests.id, request.id)),
    db
      .update(accountMergeRequests)
      .set({ status: 'cancelled', decidedAt: now })
      .where(
        and(
          eq(accountMergeRequests.status, 'pending'),
          or(eq(accountMergeRequests.survivorUserId, bId), eq(accountMergeRequests.mergedUserId, bId)),
          ne(accountMergeRequests.id, request.id),
        ),
      ),
    // 6. Rebuild the snapshot of every group A is now in. A subquery, not a list of ids (D1's 100-parameter limit).
    db
      .update(trips)
      .set({ version: sql`${trips.version} + 1` })
      .where(
        inArray(
          trips.id,
          db.select({ id: participants.tripId }).from(participants).where(eq(participants.userId, aId)),
        ),
      ),
  ];
  await db.batch(phase1 as unknown as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);

  // Phase 2: one name per shared group. Each merge is its own batch (version bump + `name_merged` activity).
  for (const group of shared) {
    try {
      if (group.fromAdmin === 1 && group.intoAdmin !== 1) {
        await db.update(participants).set({ isAdmin: 1 }).where(eq(participants.id, group.intoId));
      }
      const organiserUserId = group.trip.organiserUserId === bId ? aId : group.trip.organiserUserId;
      const isOrganiser = organiserUserId === aId;
      const actor: ResolvedActor = {
        kind: 'member',
        participantId: group.intoId,
        participantPending: false,
        isOrganiser,
        isAdmin: isOrganiser || group.intoAdmin === 1 || group.fromAdmin === 1,
        userId: aId,
        deviceHash,
        trip: { ...group.trip, organiserUserId },
      };
      await deps.mergeParticipants(db, group.trip.id, group.fromId, group.intoId, actor);
    } catch (err) {
      console.error('mergeUsers: group merge failed', { tripId: group.trip.id, fromId: group.fromId, intoId: group.intoId }, err);
    }
  }
}
