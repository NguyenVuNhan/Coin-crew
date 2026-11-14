import type { Context } from 'hono';
import { and, desc, eq, inArray, ne } from 'drizzle-orm';
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
import { changedSessionMessage, expenseMessage, newSessionMessage } from './messages';
import { sessionStartUtc } from './sessionTime';
import { rebuildSessionReminders } from './reminders';

const EXPENSE_TTL_SECONDS = 86400;
const MAX_PUSH_SUBREQUESTS = 40;

export type TransactionRow = typeof transactions.$inferSelect;

export interface SessionSnapshot {
  participantIds: string[];
  startUtc: string | null;
  locationName: string | null;
  live: boolean;
}

/** Sends to every device at once (capped at 40 per call for Workers' 50-subrequest limit): `gone` devices are removed, `ok` ones get `last_success_at`. */
export async function sendToSubscriptions(
  env: Env,
  db: Db,
  subs: PushSubscriptionRow[],
  payload: PushPayload,
  opts: { ttlSeconds: number; urgency: 'normal' | 'high' },
): Promise<void> {
  const keys = vapidFromEnv(env);
  if (!keys || subs.length === 0) return;
  const batch = subs.slice(0, MAX_PUSH_SUBREQUESTS);
  const skipped = subs.length - batch.length;
  if (skipped > 0) {
    console.warn(`[sendToSubscriptions] skipped ${skipped} subscriptions due to subrequest limit`);
  }
  await Promise.allSettled(
    batch.map(async (sub) => {
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

export function sessionSnapshotOf(row: TransactionRow | null): SessionSnapshot {
  if (!row) {
    return { participantIds: [], startUtc: null, locationName: null, live: false };
  }
  const meta = parseMeta(row.metaJson);
  const planning = isPlanningExpense({ meta });
  const live = planning && row.status === 'approved';
  const sport = meta?.sport;
  const participantIds = (sport?.entries ?? []).map((e) => e.participantId);
  const startUtc = sessionStartUtc(row.spentOn, sport?.courtSlots)?.toISOString() ?? null;
  const locationName = sport?.location?.name?.trim() || null;
  return { participantIds, startUtc, locationName, live };
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

async function runSessionPush(
  c: Context<AppBindings>,
  rootId: string,
  before: SessionSnapshot | null,
  actor: DispatchActor,
): Promise<void> {
  const db = getDb(c.env);
  await rebuildSessionReminders(db, rootId, new Date());

  if (!vapidFromEnv(c.env)) return;

  const head = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.rootId, rootId), eq(transactions.isLatest, 1)))
    .get();
  const after = sessionSnapshotOf(head ?? null);
  if (!head || !after.live) return;

  const trip = await db.select().from(trips).where(eq(trips.id, head.tripId)).get();
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

  const actorParticipant = actorParticipantId
    ? await db
        .select()
        .from(participants)
        .where(and(eq(participants.id, actorParticipantId), eq(participants.tripId, trip.id)))
        .get()
    : undefined;
  const excludedUsers = new Set([actorUserId, actorParticipant?.userId].filter((id): id is string => !!id));

  const beforeSet = before?.live ? new Set(before.participantIds) : new Set<string>();
  const newPids = after.participantIds.filter((pid) => !beforeSet.has(pid));
  const timeOrPlaceChanged = Boolean(
    before?.live && (after.startUtc !== before.startUtc || after.locationName !== before.locationName),
  );
  const changedPids = timeOrPlaceChanged ? after.participantIds.filter((pid) => beforeSet.has(pid)) : [];
  if (newPids.length === 0 && changedPids.length === 0) return;

  const people = await db
    .select()
    .from(participants)
    .where(and(eq(participants.tripId, trip.id), ne(participants.status, 'left'), inArray(participants.id, after.participantIds)));
  const userByPid = new Map<string, string>();
  for (const p of people) {
    if (!p.userId || p.id === actorParticipantId || excludedUsers.has(p.userId)) continue;
    userByPid.set(p.id, p.userId);
  }

  const newUserIds = [...new Set(newPids.map((pid) => userByPid.get(pid)).filter((u): u is string => u !== undefined))];
  const newUserSet = new Set(newUserIds);
  const changedUserIds = [
    ...new Set(changedPids.map((pid) => userByPid.get(pid)).filter((u): u is string => u !== undefined && !newUserSet.has(u))),
  ];

  const sportEntries = parseMeta(head.metaJson)?.sport?.entries ?? [];
  const male = sportEntries.reduce((sum, e) => sum + e.maleSlots, 0);
  const female = sportEntries.reduce((sum, e) => sum + e.femaleSlots, 0);

  if (newUserIds.length > 0) {
    const subs = await subscriptionsForUsers(db, newUserIds, 'newSession');
    await sendToSubscriptions(
      c.env,
      db,
      subs,
      newSessionMessage({
        description: head.description,
        locationName: after.locationName,
        startUtc: after.startUtc,
        male,
        female,
        tripId: trip.id,
        rootId,
      }),
      { ttlSeconds: EXPENSE_TTL_SECONDS, urgency: 'normal' },
    );
  }

  if (changedUserIds.length > 0) {
    const subs = await subscriptionsForUsers(db, changedUserIds, 'newSession');
    await sendToSubscriptions(
      c.env,
      db,
      subs,
      changedSessionMessage({
        description: head.description,
        locationName: after.locationName,
        startUtc: after.startUtc,
        tripId: trip.id,
        rootId,
      }),
      { ttlSeconds: EXPENSE_TTL_SECONDS, urgency: 'normal' },
    );
  }
}

/** Pushes new/changed planned sessions and rebuilds precomputed session reminders. */
export async function dispatchSessionPush(
  c: Context<AppBindings>,
  rootId: string,
  before: SessionSnapshot | null,
  actor: DispatchActor,
): Promise<void> {
  const promise = runSessionPush(c, rootId, before, actor).catch((err) => {
    console.error('[dispatchSessionPush] failed:', safeError(err));
  });

  try {
    c.executionCtx.waitUntil(promise);
  } catch {
    await promise;
  }
}
