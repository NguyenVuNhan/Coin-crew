import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import type {
  AuthProvider,
  IncomingMergeRequest,
  MeResponse,
  MeUserView,
  OutgoingMergeRequest,
} from '@fsl/core';
import type { Db } from '../db/client';
import { accountMergeRequests, participants, users } from '../db/schema';
import type { Env } from '../env';
import { nowIso } from '../lib/ids';
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

  const [incomingRows, outgoingRows] = await Promise.all([
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
        ),
      )
      .orderBy(desc(accountMergeRequests.createdAt)),

    db
      .select({
        id: accountMergeRequests.id,
        provider: accountMergeRequests.provider,
        status: accountMergeRequests.status,
        expiresAt: accountMergeRequests.expiresAt,
      })
      .from(accountMergeRequests)
      .where(
        and(
          eq(accountMergeRequests.survivorUserId, user.id),
          inArray(accountMergeRequests.status, ['pending', 'accepted', 'declined']),
          gt(accountMergeRequests.expiresAt, now),
        ),
      )
      .orderBy(desc(accountMergeRequests.createdAt)),
  ]);

  const outgoing: OutgoingMergeRequest[] = outgoingRows.map((r) => ({
    id: r.id,
    provider: r.provider,
    status: r.status as 'pending' | 'accepted' | 'declined',
    expiresAt: r.expiresAt,
  }));

  if (incomingRows.length === 0) {
    return {
      user: toMeUserView(user),
      signIn,
      mergeRequests: {
        incoming: [],
        outgoing,
      },
    };
  }

  const userIds = Array.from(new Set([user.id, ...incomingRows.map((r) => r.survivorId)]));

  const groupCounts = await db
    .select({
      userId: participants.userId,
      n: sql<number>`count(*)`,
    })
    .from(participants)
    .where(
      and(
        eq(participants.status, 'active'),
        inArray(participants.userId, userIds),
      ),
    )
    .groupBy(participants.userId);

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

  return {
    user: toMeUserView(user),
    signIn,
    mergeRequests: {
      incoming,
      outgoing,
    },
  };
}
