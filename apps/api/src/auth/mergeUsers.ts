import type { AuthProvider } from '@cc/core';
import type { BatchItem } from 'drizzle-orm/batch';
import { and, asc, eq, exists, inArray, ne, notExists, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { ResolvedActor } from '../access/actor';
import type { Db } from '../db/client';
import {
  accountMergeRequests,
  activity,
  bankDetails,
  deviceExpenseGrants,
  deviceParticipants,
  membershipRequests,
  mergeProposals,
  nicknames,
  participantMerges,
  participants,
  paymentRefs,
  personLinks,
  playerRatings,
  sessions,
  transactions,
  tripViews,
  trips,
  users,
  zaloChatLinks,
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
    zaloName: provider === 'zalo' ? b.zaloName : (a.zaloSub != null ? a.zaloName : b.zaloName),
    email: googleSub == null ? null : (googleFromB ? b.email : a.email),
    name: profile.name,
    gender: profile.gender,
    avatarUrl: profile.avatarUrl,
    customProfile: takeProfile ? 1 : a.customProfile,
    consentAt: a.consentAt ?? b.consentAt,
  };
}

/**
 * Statements that move every row of ledger `fromTrip` into ledger `intoTrip` and delete `fromTrip`.
 * A device bound to both keeps its binding to `intoTrip`. The names are merged afterwards (phase 2).
 */
function foldLedger(db: Db, fromTrip: string, intoTrip: string): BatchItem<'sqlite'>[] {
  const intoDevice = alias(deviceParticipants, 'into_device');
  const tables = [
    participants,
    membershipRequests,
    mergeProposals,
    zaloChatLinks,
    deviceExpenseGrants,
    transactions,
    paymentRefs,
    activity,
    playerRatings,
    participantMerges,
  ] as const;
  return [
    ...tables.map((t) => db.update(t).set({ tripId: intoTrip }).where(eq(t.tripId, fromTrip))),
    db
      .update(deviceParticipants)
      .set({ tripId: intoTrip })
      .where(
        and(
          eq(deviceParticipants.tripId, fromTrip),
          notExists(
            db
              .select({ x: intoDevice.tripId })
              .from(intoDevice)
              .where(and(eq(intoDevice.tripId, intoTrip), eq(intoDevice.deviceHash, deviceParticipants.deviceHash))),
          ),
        ),
      ),
    db.delete(deviceParticipants).where(eq(deviceParticipants.tripId, fromTrip)),
    db.delete(tripViews).where(eq(tripViews.tripId, fromTrip)),
    db.delete(trips).where(eq(trips.id, fromTrip)),
  ];
}

/**
 * Merge account B (`request.mergedUserId`) into account A (`request.survivorUserId`), spec §4.5.5.
 * The caller has already checked the request is B's, pending, unexpired and not stale.
 *
 * Phase 1 is one atomic batch with a constant number of set-based statements; its last statement reads A back,
 * and that row is returned, so the caller can answer without another query.
 * Phase 2 merges the two names in each group both accounts were in; a failure there (including running out of
 * D1's per-invocation query budget) is logged and the account merge still stands (both names stay in that group,
 * linked to A, and an admin can merge them).
 * `deps` exists only so tests can make a group merge fail.
 */
export async function mergeUsers(
  db: Db,
  request: MergeRequestRow,
  deviceHash: string,
  deps: { mergeParticipants: typeof mergeParticipants } = { mergeParticipants },
): Promise<UserRow> {
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
    .where(and(eq(bName.userId, bId), eq(bName.status, 'active'), ne(trips.preset, 'direct')))
    .orderBy(asc(bName.tripId), asc(aName.sortOrder));
  // If A has more than one active name in a group, merge B's into the first one.
  const shared = sharedRows.filter((row, i) => sharedRows.findIndex((r) => r.fromId === row.fromId) === i);

  // Personal ledgers (one per user, trips_organiser_direct_idx): when both have one, B's folds into A's
  // in phase 1 and every name of A or B in it is merged into A's own name in phase 2.
  const ledgers = await db
    .select()
    .from(trips)
    .where(and(eq(trips.preset, 'direct'), inArray(trips.organiserUserId, [aId, bId])));
  const ledgerA = ledgers.find((t) => t.organiserUserId === aId);
  const ledgerB = ledgers.find((t) => t.organiserUserId === bId);
  const ledger = ledgerA ?? ledgerB;
  if (ledger) {
    const selves = await db
      .select({ id: participants.id, userId: participants.userId, isAdmin: participants.isAdmin })
      .from(participants)
      .where(
        and(
          inArray(participants.tripId, ledgers.map((t) => t.id)),
          inArray(participants.userId, [aId, bId]),
          eq(participants.status, 'active'),
        ),
      )
      .orderBy(asc(participants.sortOrder));
    // The ledger's owner name (A's, or B's when only B has a ledger): it becomes A's in phase 1.
    const ownerPids = await db
      .select({ id: participants.id })
      .from(participants)
      .where(and(eq(participants.tripId, ledger.id), eq(participants.userId, ledger.organiserUserId)));
    const into = selves.find((p) => ownerPids.some((o) => o.id === p.id));
    if (into) {
      for (const from of selves) {
        if (from.id === into.id) continue;
        shared.push({ trip: ledger, fromId: from.id, fromAdmin: from.isAdmin, intoId: into.id, intoAdmin: into.isAdmin });
      }
    }
  }

  const now = nowIso();
  const aApprovedBank = alias(bankDetails, 'a_approved_bank');
  const aLink = alias(personLinks, 'a_link');
  const aNick = alias(nicknames, 'a_nick');

  const phase1: BatchItem<'sqlite'>[] = [
    // 1. B first, so its identities free the unique indexes A takes next.
    db.delete(users).where(eq(users.id, bId)),
    // 2. A: identities, profile and consent.
    db.update(users).set(mergedUserFields(a, b, request.provider, request.providerSub)).where(eq(users.id, aId)),
    // 3. Every reference to B now points at A.
    ...(ledgerA && ledgerB ? foldLedger(db, ledgerB.id, ledgerA.id) : []),
    db.update(participants).set({ userId: aId }).where(eq(participants.userId, bId)),
    db.update(trips).set({ organiserUserId: aId }).where(eq(trips.organiserUserId, bId)),
    db.update(membershipRequests).set({ userId: aId }).where(eq(membershipRequests.userId, bId)),
    db.update(transactions).set({ disabledByUserId: aId }).where(eq(transactions.disabledByUserId, bId)),
    db.update(bankDetails).set({ approvedByUserId: aId }).where(eq(bankDetails.approvedByUserId, bId)),
    db.update(activity).set({ actorUserId: aId }).where(eq(activity.actorUserId, bId)),
    db.update(sessions).set({ userId: aId }).where(eq(sessions.userId, bId)),
    // B's People-view data: A's own link or nickname wins; then others' nicknames for B name A.
    db
      .update(personLinks)
      .set({ ownerUserId: aId })
      .where(
        and(
          eq(personLinks.ownerUserId, bId),
          notExists(
            db
              .select({ x: aLink.participantId })
              .from(aLink)
              .where(and(eq(aLink.ownerUserId, aId), eq(aLink.participantId, personLinks.participantId))),
          ),
        ),
      ),
    db.delete(personLinks).where(eq(personLinks.ownerUserId, bId)),
    db
      .update(nicknames)
      .set({ ownerUserId: aId })
      .where(
        and(
          eq(nicknames.ownerUserId, bId),
          notExists(
            db
              .select({ x: aNick.personKey })
              .from(aNick)
              .where(and(eq(aNick.ownerUserId, aId), eq(aNick.personKey, nicknames.personKey))),
          ),
        ),
      ),
    db.delete(nicknames).where(eq(nicknames.ownerUserId, bId)),
    db
      .update(nicknames)
      .set({ personKey: `u:${aId}` })
      .where(
        and(
          eq(nicknames.personKey, `u:${bId}`),
          notExists(
            db
              .select({ x: aNick.personKey })
              .from(aNick)
              .where(and(eq(aNick.ownerUserId, nicknames.ownerUserId), eq(aNick.personKey, `u:${aId}`))),
          ),
        ),
      ),
    db.delete(nicknames).where(eq(nicknames.personKey, `u:${bId}`)),
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
    // 5. This request is accepted; any other pending request involving B (or another claim on A) is moot.
    // Claim payments to a guest now follow the normal rule (a member paying a guest counts straight away).
    db
      .update(transactions)
      .set({
        status: 'confirmed',
        amountConfirmed: sql`${transactions.amount}`,
        confirmedByParticipantId: sql`${transactions.payerId}`,
        updatedAt: now,
      })
      .where(
        and(
          eq(transactions.claimRequestId, request.id),
          eq(transactions.status, 'says_paid'),
          eq(transactions.isLatest, 1),
          notExists(
            db
              .select({ id: participants.id })
              .from(participants)
              .where(
                and(
                  eq(participants.id, transactions.toId),
                  sql`${participants.userId} IS NOT NULL`,
                  eq(participants.status, 'active'),
                ),
              ),
          ),
        ),
      ),
    db
      .update(transactions)
      .set({ claimRequestId: null })
      .where(eq(transactions.claimRequestId, request.id)),
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
          or(
            eq(accountMergeRequests.survivorUserId, bId),
            eq(accountMergeRequests.mergedUserId, bId),
            and(eq(accountMergeRequests.survivorUserId, aId), eq(accountMergeRequests.initiatedBy, 'merged')),
          ),
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
    // 7. A as committed, for the response: phase 2 may spend the rest of the query budget.
    db.select().from(users).where(eq(users.id, aId)),
  ];
  const results = await db.batch(phase1 as unknown as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
  const merged = (results[results.length - 1] as UserRow[] | undefined)?.[0];
  if (!merged) {
    // Only if A was deleted between the checks and this batch.
    throw new Error(`mergeUsers: survivor ${aId} missing after phase 1`);
  }

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

  return merged;
}
