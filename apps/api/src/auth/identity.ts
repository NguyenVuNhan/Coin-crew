import type { AuthProvider } from '@cc/core';
import { and, eq, gt } from 'drizzle-orm';
import type { Db } from '../db/client';
import { accountMergeRequests, participants, users } from '../db/schema';
import { newId, nowIso } from '../lib/ids';

export type ClaimOutcome =
  | { result: 'self' }
  | { result: 'incoming'; requestId: string }
  | { result: 'taken' }
  | { result: 'requested'; requestId: string }
  | { result: 'invalid' };

export async function upsertIdentity(
  db: Db,
  provider: AuthProvider,
  // nameWithheld: Zalo didn't give the name (see fetchZaloProfile), so `name` is a placeholder not to save over a real one.
  profile: { sub: string; name: string; avatarUrl: string | null; email?: string; nameWithheld?: boolean },
): Promise<string> {
  const existing = await db
    .select()
    .from(users)
    .where(provider === 'google' ? eq(users.googleSub, profile.sub) : eq(users.zaloSub, profile.sub))
    .get();

  if (existing) {
    const updates: Partial<typeof users.$inferInsert> = {};
    if (provider === 'google' && profile.email) {
      updates.email = profile.email;
    }
    if (provider === 'zalo' && !profile.nameWithheld) {
      updates.zaloName = profile.name;
    }
    if (existing.customProfile === 0 && !profile.nameWithheld) {
      updates.name = profile.name;
    }
    if ((existing.customProfile === 0 || !existing.avatarUrl) && profile.avatarUrl) {
      updates.avatarUrl = profile.avatarUrl;
    }
    if (Object.keys(updates).length > 0) {
      await db.update(users).set(updates).where(eq(users.id, existing.id));
    }
    return existing.id;
  }

  const id = newId();
  await db.insert(users).values({
    id,
    googleSub: provider === 'google' ? profile.sub : null,
    zaloSub: provider === 'zalo' ? profile.sub : null,
    zaloName: provider === 'zalo' ? profile.name : null,
    email: provider === 'google' ? profile.email ?? null : null,
    name: profile.name,
    avatarUrl: profile.avatarUrl,
    customProfile: 0,
    createdAt: nowIso(),
  });
  return id;
}

export async function linkIdentity(
  db: Db,
  userId: string,
  provider: AuthProvider,
  profile: { sub: string; name: string; avatarUrl: string | null; email?: string },
): Promise<{ result: 'linked' } | { result: 'merge_requested'; requestId: string }> {
  const owner = await db
    .select()
    .from(users)
    .where(provider === 'google' ? eq(users.googleSub, profile.sub) : eq(users.zaloSub, profile.sub))
    .get();

  if (owner) {
    if (owner.id === userId) {
      return { result: 'linked' };
    }

    const now = nowIso();
    const requestId = newId();
    const expiresAt = new Date(Date.parse(now) + 7 * 86400000).toISOString();
    await db.batch([
      db
        .update(accountMergeRequests)
        .set({ status: 'cancelled', decidedAt: now })
        .where(
          and(
            eq(accountMergeRequests.survivorUserId, userId),
            eq(accountMergeRequests.provider, provider),
            eq(accountMergeRequests.status, 'pending'),
          ),
        ),
      db.insert(accountMergeRequests).values({
        id: requestId,
        survivorUserId: userId,
        mergedUserId: owner.id,
        provider,
        providerSub: profile.sub,
        status: 'pending',
        createdAt: now,
        expiresAt,
        otherName: owner.name,
        identityLabel: provider === 'google' ? (profile.email ?? profile.name) : profile.name,
      }),
    ]);

    return { result: 'merge_requested', requestId };
  }

  const updates: Partial<typeof users.$inferInsert> = {
    ...(provider === 'google' ? { googleSub: profile.sub } : { zaloSub: profile.sub, zaloName: profile.name }),
  };
  if (provider === 'google' && profile.email && profile.email.trim() !== '') {
    updates.email = profile.email.trim();
  }

  await db.update(users).set(updates).where(eq(users.id, userId));
  return { result: 'linked' };
}

export async function requestClaim(
  db: Db,
  zaloUserId: string,
  claim: { tripId: string; participantId: string },
): Promise<ClaimOutcome> {
  const participant = await db
    .select()
    .from(participants)
    .where(and(eq(participants.id, claim.participantId), eq(participants.tripId, claim.tripId)))
    .get();

  if (!participant || participant.status !== 'active' || !participant.userId) {
    return { result: 'invalid' };
  }

  if (participant.userId === zaloUserId) {
    return { result: 'self' };
  }

  const now = nowIso();
  const incoming = await db
    .select({ id: accountMergeRequests.id })
    .from(accountMergeRequests)
    .where(
      and(
        eq(accountMergeRequests.survivorUserId, participant.userId),
        eq(accountMergeRequests.mergedUserId, zaloUserId),
        eq(accountMergeRequests.initiatedBy, 'survivor'),
        eq(accountMergeRequests.status, 'pending'),
        gt(accountMergeRequests.expiresAt, now),
      ),
    )
    .get();

  if (incoming) {
    return { result: 'incoming', requestId: incoming.id };
  }

  const survivor = await db.select().from(users).where(eq(users.id, participant.userId)).get();
  if (!survivor) {
    return { result: 'invalid' };
  }

  if (survivor.zaloSub) {
    return { result: 'taken' };
  }

  const zaloUser = await db.select().from(users).where(eq(users.id, zaloUserId)).get();
  if (!zaloUser || !zaloUser.zaloSub) {
    return { result: 'invalid' };
  }

  const requestId = newId();
  const expiresAt = new Date(Date.parse(now) + 7 * 86400000).toISOString();
  await db.batch([
    db
      .update(accountMergeRequests)
      .set({ status: 'cancelled', decidedAt: now })
      .where(
        and(
          eq(accountMergeRequests.mergedUserId, zaloUserId),
          eq(accountMergeRequests.initiatedBy, 'merged'),
          eq(accountMergeRequests.status, 'pending'),
        ),
      ),
    db.insert(accountMergeRequests).values({
      id: requestId,
      survivorUserId: survivor.id,
      mergedUserId: zaloUserId,
      provider: 'zalo',
      providerSub: zaloUser.zaloSub,
      status: 'pending',
      createdAt: now,
      expiresAt,
      otherName: survivor.name,
      identityLabel: zaloUser.zaloName ?? zaloUser.name,
      initiatedBy: 'merged',
      claimTripId: claim.tripId,
      claimParticipantId: claim.participantId,
    }),
  ]);

  return { result: 'requested', requestId };
}
