import { and, asc, desc, eq, gt, inArray, isNull, notExists, sql } from 'drizzle-orm';
import type {
  AuthProvider,
  ClaimStatus,
  IncomingMergeRequest,
  JoiningMergeRequest,
  MeResponse,
  MeUserView,
  OutgoingMergeRequest,
} from '@cc/core';
import type { Db } from '@cc/api-db/client';
import { alias } from 'drizzle-orm/sqlite-core';
import { accountMergeRequests, participants, transactions, trips, users } from '@cc/api-db/schema';
import type { Env } from '@cc/api-db/env';
import { nowIso } from '@cc/api-util/ids';
import type { UserRow } from './session';

export function zaloConfigured(env: Env): boolean {
  return Boolean(env.ZALO_APP_ID && env.ZALO_APP_SECRET);
}

export function providersOf(user: Pick<UserRow, 'googleSub' | 'zaloSub'>): AuthProvider[] {
  const providers: AuthProvider[] = [];
  if (user.googleSub != null) {
    providers.push('google');
  }
  if (user.zaloSub != null) {
    providers.push('zalo');
  }
  return providers;
}

export function toMeUserView(user: UserRow): MeUserView {
  return {
    id: user.id,
    email: user.email ?? null,
    name: user.name,
    gender: (user.gender as 'M' | 'F' | null) ?? null,
    avatarUrl: user.avatarUrl ?? null,
    consentAt: user.consentAt ?? null,
    providers: providersOf(user),
    zaloName: user.zaloName ?? null,
  };
}

export async function buildMeResponse(
  db: Db,
  env: Env,
  user: UserRow | null,
): Promise<MeResponse> {
  const signIn = { zalo: zaloConfigured(env) };

  if (!user) {
    return {
      user: null,
      signIn,
      mergeRequests: { incoming: [], outgoing: [] },
    };
  }

  const now = nowIso();

  const [incomingRows, outgoingRows, joiningRows, claimRows] = await Promise.all([
    db
      .select({
        id: accountMergeRequests.id,
        provider: accountMergeRequests.provider,
        expiresAt: accountMergeRequests.expiresAt,
        survivorId: users.id,
        survivorName: users.name,
        survivorAvatarUrl: users.avatarUrl,
        survivorEmail: users.email,
        survivorGoogleSub: users.googleSub,
        survivorZaloSub: users.zaloSub,
      })
      .from(accountMergeRequests)
      .innerJoin(users, eq(users.id, accountMergeRequests.survivorUserId))
      .where(
        and(
          eq(accountMergeRequests.mergedUserId, user.id),
          eq(accountMergeRequests.status, 'pending'),
          gt(accountMergeRequests.expiresAt, now),
          eq(accountMergeRequests.initiatedBy, 'survivor'),
        ),
      )
      .orderBy(desc(accountMergeRequests.createdAt)),

    db
      .select({
        id: accountMergeRequests.id,
        provider: accountMergeRequests.provider,
        status: accountMergeRequests.status,
        expiresAt: accountMergeRequests.expiresAt,
        otherName: accountMergeRequests.otherName,
        identityLabel: accountMergeRequests.identityLabel,
        mergedName: users.name,
        createdAt: accountMergeRequests.createdAt,
      })
      .from(accountMergeRequests)
      .leftJoin(users, eq(users.id, accountMergeRequests.mergedUserId))
      .where(
        and(
          eq(accountMergeRequests.survivorUserId, user.id),
          inArray(accountMergeRequests.status, ['pending', 'accepted', 'declined']),
          gt(accountMergeRequests.expiresAt, now),
          isNull(accountMergeRequests.dismissedAt),
          eq(accountMergeRequests.initiatedBy, 'survivor'),
        ),
      )
      .orderBy(desc(accountMergeRequests.createdAt)),

    db
      .select({
        id: accountMergeRequests.id,
        expiresAt: accountMergeRequests.expiresAt,
        mergedUserId: accountMergeRequests.mergedUserId,
        zaloName: users.name,
        zaloAccountName: users.zaloName,
        zaloAvatarUrl: users.avatarUrl,
      })
      .from(accountMergeRequests)
      .innerJoin(users, eq(users.id, accountMergeRequests.mergedUserId))
      .where(
        and(
          eq(accountMergeRequests.survivorUserId, user.id),
          eq(accountMergeRequests.status, 'pending'),
          gt(accountMergeRequests.expiresAt, now),
          eq(accountMergeRequests.initiatedBy, 'merged'),
        ),
      )
      .orderBy(desc(accountMergeRequests.createdAt)),

    db
      .select({
        id: accountMergeRequests.id,
        tripId: accountMergeRequests.claimTripId,
        participantId: accountMergeRequests.claimParticipantId,
        name: participants.name,
        expiresAt: accountMergeRequests.expiresAt,
      })
      .from(accountMergeRequests)
      .leftJoin(participants, eq(participants.id, accountMergeRequests.claimParticipantId))
      .where(
        and(
          eq(accountMergeRequests.mergedUserId, user.id),
          eq(accountMergeRequests.status, 'pending'),
          gt(accountMergeRequests.expiresAt, now),
          eq(accountMergeRequests.initiatedBy, 'merged'),
        ),
      )
      .orderBy(desc(accountMergeRequests.createdAt))
      .limit(1),
  ]);

  const seenProviders = new Set<AuthProvider>();
  const outgoing: OutgoingMergeRequest[] = [];
  for (const r of outgoingRows) {
    if (seenProviders.has(r.provider)) {
      continue;
    }
    seenProviders.add(r.provider);
    const providerLabel = r.provider === 'google' ? 'Google' : 'Zalo';
    outgoing.push({
      id: r.id,
      provider: r.provider,
      status: r.status as 'pending' | 'accepted' | 'declined',
      expiresAt: r.expiresAt,
      otherName: r.otherName ?? r.mergedName ?? providerLabel,
      identityLabel: r.identityLabel ?? providerLabel,
    });
  }

  const claimRow = claimRows[0];
  const claim: ClaimStatus | null =
    claimRow && claimRow.tripId && claimRow.participantId
      ? {
          id: claimRow.id,
          tripId: claimRow.tripId,
          participantId: claimRow.participantId,
          name: claimRow.name ?? '',
          expiresAt: claimRow.expiresAt,
        }
      : null;

  const incomingUserIds =
    incomingRows.length > 0
      ? Array.from(new Set([user.id, ...incomingRows.map((r) => r.survivorId)]))
      : [];

  const joiningUserIds =
    joiningRows.length > 0
      ? Array.from(new Set([user.id, ...joiningRows.map((r) => r.mergedUserId)]))
      : [];

  const toPerson = alias(participants, 'to_person');
  const toMember = alias(participants, 'to_member');
  const joiningIds = joiningRows.map((r) => r.id);

  const [groupCounts, joiningParticipantRows, autoConfirmRows] = await Promise.all([
    incomingUserIds.length > 0
      ? db
          .select({
            userId: participants.userId,
            n: sql<number>`count(*)`,
          })
          .from(participants)
          .where(
            and(
              eq(participants.status, 'active'),
              inArray(participants.userId, incomingUserIds),
            ),
          )
          .groupBy(participants.userId)
      : Promise.resolve([]),

    joiningUserIds.length > 0
      ? db
          .select({
            userId: participants.userId,
            tripId: trips.id,
            tripName: trips.name,
            participantName: participants.name,
            sortOrder: participants.sortOrder,
          })
          .from(participants)
          .innerJoin(trips, eq(trips.id, participants.tripId))
          .where(
            and(
              eq(participants.status, 'active'),
              inArray(participants.userId, joiningUserIds),
            ),
          )
          .orderBy(asc(trips.name), asc(trips.id), asc(participants.sortOrder))
      : Promise.resolve([]),

    // The same rows `mergeUsers` confirms on accept: claim payments still waiting, to someone who isn't a member.
    joiningIds.length > 0
      ? db
          .select({
            requestId: transactions.claimRequestId,
            paymentId: transactions.id,
            amount: transactions.amount,
            tripName: trips.name,
            toName: toPerson.name,
          })
          .from(transactions)
          .innerJoin(trips, eq(trips.id, transactions.tripId))
          .innerJoin(toPerson, eq(toPerson.id, transactions.toId))
          .where(
            and(
              inArray(transactions.claimRequestId, joiningIds),
              eq(transactions.status, 'says_paid'),
              eq(transactions.isLatest, 1),
              notExists(
                db
                  .select({ id: toMember.id })
                  .from(toMember)
                  .where(
                    and(
                      eq(toMember.id, transactions.toId),
                      sql`${toMember.userId} IS NOT NULL`,
                      eq(toMember.status, 'active'),
                    ),
                  ),
              ),
            ),
          )
          .orderBy(asc(transactions.createdAt))
      : Promise.resolve([]),
  ]);

  const groupCountMap = new Map<string, number>();
  for (const row of groupCounts) {
    if (row.userId) {
      groupCountMap.set(row.userId, Number(row.n));
    }
  }

  const incoming: IncomingMergeRequest[] = incomingRows.map((r) => {
    const P = r.provider;
    const Q: AuthProvider = P === 'google' ? 'zalo' : 'google';
    const survivorHasQ = Q === 'google' ? r.survivorGoogleSub != null : r.survivorZaloSub != null;
    const userHasQ = Q === 'google' ? user.googleSub != null : user.zaloSub != null;

    const released: IncomingMergeRequest['released'] =
      survivorHasQ && userHasQ
        ? [
            {
              provider: Q,
              email: Q === 'google' ? user.email ?? null : null,
            },
          ]
        : [];

    return {
      id: r.id,
      provider: r.provider,
      expiresAt: r.expiresAt,
      survivor: {
        name: r.survivorName,
        avatarUrl: r.survivorAvatarUrl ?? null,
        email: r.survivorEmail ?? null,
        providers: providersOf({
          googleSub: r.survivorGoogleSub,
          zaloSub: r.survivorZaloSub,
        }),
      },
      groups: {
        survivor: groupCountMap.get(r.survivorId) ?? 0,
        merged: groupCountMap.get(user.id) ?? 0,
      },
      released,
    };
  });

  const yourParticipantsByTrip = new Map<string, string>();
  for (const row of joiningParticipantRows) {
    if (row.userId === user.id && !yourParticipantsByTrip.has(row.tripId)) {
      yourParticipantsByTrip.set(row.tripId, row.participantName);
    }
  }

  const joining: JoiningMergeRequest[] = joiningRows.map((r) => {
    const zaloRows = joiningParticipantRows.filter((row) => row.userId === r.mergedUserId);
    const groups: { tripId: string; name: string }[] = [];
    const collapsing: { tripId: string; name: string; zaloPersonName: string; yourPersonName: string }[] = [];
    const seenGroupTripIds = new Set<string>();
    const seenCollapsingTripIds = new Set<string>();

    for (const row of zaloRows) {
      if (!seenGroupTripIds.has(row.tripId)) {
        seenGroupTripIds.add(row.tripId);
        groups.push({ tripId: row.tripId, name: row.tripName });
      }
      const yourPersonName = yourParticipantsByTrip.get(row.tripId);
      if (yourPersonName && !seenCollapsingTripIds.has(row.tripId)) {
        seenCollapsingTripIds.add(row.tripId);
        collapsing.push({
          tripId: row.tripId,
          name: row.tripName,
          zaloPersonName: row.participantName,
          yourPersonName,
        });
      }
    }

    return {
      id: r.id,
      expiresAt: r.expiresAt,
      zalo: {
        name: (r.zaloAccountName && r.zaloAccountName.trim()) || r.zaloName,
        avatarUrl: r.zaloAvatarUrl ?? null,
      },
      groups,
      collapsing,
      autoConfirm: autoConfirmRows
        .filter((a) => a.requestId === r.id)
        .map((a) => ({ paymentId: a.paymentId, tripName: a.tripName, toName: a.toName, amount: a.amount })),
    };
  });

  return {
    user: toMeUserView(user),
    signIn,
    mergeRequests: {
      incoming,
      outgoing,
      joining,
      claim,
    },
  };
}
