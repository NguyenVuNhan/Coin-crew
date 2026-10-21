import type { AuthProvider } from '@fsl/core';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { accountMergeRequests, users } from '../db/schema';
import { newId, nowIso } from '../lib/ids';

export async function upsertIdentity(
  db: Db,
  provider: AuthProvider,
  profile: { sub: string; name: string; avatarUrl: string | null; email?: string },
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
    if (existing.customProfile === 0) {
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
    await db
      .update(accountMergeRequests)
      .set({ status: 'cancelled', decidedAt: now })
      .where(
        and(
          eq(accountMergeRequests.survivorUserId, userId),
          eq(accountMergeRequests.mergedUserId, owner.id),
          eq(accountMergeRequests.status, 'pending'),
        ),
      );

    const requestId = newId();
    const expiresAt = new Date(Date.parse(now) + 7 * 86400000).toISOString();
    await db.insert(accountMergeRequests).values({
      id: requestId,
      survivorUserId: userId,
      mergedUserId: owner.id,
      provider,
      providerSub: profile.sub,
      status: 'pending',
      createdAt: now,
      expiresAt,
    });

    return { result: 'merge_requested', requestId };
  }

  const updates: Partial<typeof users.$inferInsert> = {
    ...(provider === 'google' ? { googleSub: profile.sub } : { zaloSub: profile.sub }),
  };
  if (provider === 'google' && profile.email && profile.email.trim() !== '') {
    updates.email = profile.email.trim();
  }

  await db.update(users).set(updates).where(eq(users.id, userId));
  return { result: 'linked' };
}
