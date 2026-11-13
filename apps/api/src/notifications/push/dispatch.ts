import type { Context } from 'hono';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { isPlanningExpense, type ExpenseMeta } from '@cc/core';
import type { AppBindings, Env } from '@cc/api-db/env';
import { getDb, type Db } from '@cc/api-db/client';
import { participants, pushSubscriptions, transactions, transactionShares, trips, users } from '@cc/api-db/schema';
import { getSessionUser } from '@cc/api-auth/session';
import { nowIso } from '@cc/api-util/ids';
import { safeError } from '@cc/api-util/logSafe';
import type { DispatchActor } from '../transactionDispatcher';
import { sendPush, vapidFromEnv, type PushPayload } from './webPush';
import { deleteSubscription, subscriptionsForUsers, type PushSubscriptionRow } from './store';
import { expenseMessage } from './messages';

const EXPENSE_TTL_SECONDS = 86400;

/** Sends to every device at once: `gone` devices are removed, `ok` ones get `last_success_at`. */
export async function sendToSubscriptions(
  env: Env,
  db: Db,
  subs: PushSubscriptionRow[],
  payload: PushPayload,
  opts: { ttlSeconds: number; urgency: 'normal' | 'high' },
): Promise<void> {
  const keys = vapidFromEnv(env);
  if (!keys || subs.length === 0) return;
  await Promise.allSettled(
    subs.map(async (sub) => {
      const result = await sendPush(sub, payload, keys, opts);
      if (result === 'gone') {
        await deleteSubscription(db, sub.id);
      } else if (result === 'ok') {
        await db.update(pushSubscriptions).set({ lastSuccessAt: nowIso() }).where(eq(pushSubscriptions.id, sub.id));
      }
    }),
  );
}

function parseMeta(json: string | null): ExpenseMeta | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as ExpenseMeta;
  } catch {
    return null;
  }
}

async function runExpensePush(c: Context<AppBindings>, expenseRootId: string, actor: DispatchActor): Promise<void> {
  if (!vapidFromEnv(c.env)) return;
  const db = getDb(c.env);

  const tx = await db
    .select()
    .from(transactions)
    .where(eq(transactions.rootId, expenseRootId))
    .orderBy(desc(transactions.isLatest), desc(transactions.createdAt))
    .get();
  if (!tx || tx.status !== 'approved' || isPlanningExpense({ meta: parseMeta(tx.metaJson) })) return;

  const trip = await db.select().from(trips).where(eq(trips.id, tx.tripId)).get();
  if (!trip || trip.preset === 'direct') return;

  let actorUserId = actor.actorUserId ?? null;
  const actorParticipantId = actor.actorParticipantId ?? null;
  if (!actorUserId && !actorParticipantId) {
    try {
      actorUserId = (await getSessionUser(c))?.id ?? null;
    } catch {
      // ignore
    }
  }

  const shares = (await db.select().from(transactionShares).where(eq(transactionShares.transactionId, tx.id))).filter(
    (s) => s.amount > 0,
  );
  if (shares.length === 0) return;

  const people = await db
    .select()
    .from(participants)
    .where(and(eq(participants.tripId, trip.id), inArray(participants.id, shares.map((s) => s.participantId))));
  const actorParticipant = actorParticipantId
    ? await db
        .select()
        .from(participants)
        .where(and(eq(participants.id, actorParticipantId), eq(participants.tripId, trip.id)))
        .get()
    : undefined;
  const excludedUsers = new Set([actorUserId, actorParticipant?.userId].filter((id): id is string => !!id));

  const shareByUser = new Map<string, number>();
  for (const p of people) {
    if (!p.userId || p.id === actorParticipantId || excludedUsers.has(p.userId)) continue;
    const share = shares.find((s) => s.participantId === p.id)!.amount;
    shareByUser.set(p.userId, (shareByUser.get(p.userId) ?? 0) + share);
  }
  if (shareByUser.size === 0) return;

  let actorName = actorParticipant?.name;
  if (!actorName && actorUserId) {
    actorName = (await db.select({ name: users.name }).from(users).where(eq(users.id, actorUserId)).get())?.name;
  }

  const subs = await subscriptionsForUsers(db, [...shareByUser.keys()], 'expenseNew');
  const byUser = new Map<string, PushSubscriptionRow[]>();
  for (const sub of subs) byUser.set(sub.userId, [...(byUser.get(sub.userId) ?? []), sub]);

  await Promise.allSettled(
    [...byUser].map(([userId, devices]) =>
      sendToSubscriptions(
        c.env,
        db,
        devices,
        expenseMessage({
          actorName: actorName ?? '',
          description: tx.description,
          groupName: trip.name,
          share: shareByUser.get(userId)!,
          tripId: trip.id,
          rootId: expenseRootId,
        }),
        { ttlSeconds: EXPENSE_TTL_SECONDS, urgency: 'normal' },
      ),
    ),
  );
}

/** Pushes a new approved expense to the members it includes, except the person who added it. */
export async function dispatchExpensePush(c: Context<AppBindings>, expenseRootId: string, actor: DispatchActor): Promise<void> {
  const promise = runExpensePush(c, expenseRootId, actor).catch((err) => {
    console.error('[dispatchExpensePush] failed:', safeError(err));
  });

  try {
    c.executionCtx.waitUntil(promise);
  } catch {
    await promise;
  }
}
