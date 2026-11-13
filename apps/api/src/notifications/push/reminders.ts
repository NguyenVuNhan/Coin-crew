import { and, eq, inArray, isNull, ne } from 'drizzle-orm';
import { isPlanningExpense, type ExpenseMeta } from '@cc/core';
import type { Db } from '@cc/api-db/client';
import { participants, pushReminders, pushSubscriptions, transactions, trips } from '@cc/api-db/schema';
import { newId } from '@cc/api-util/ids';
import { sessionStartUtc } from './sessionTime';
import { subscriptionsForUsers } from './store';

function parseMeta(json: string | null): ExpenseMeta | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as ExpenseMeta;
  } catch {
    return null;
  }
}

/** Rebuilds all unsent reminders for one planned session (`rootId`). */
export async function rebuildSessionReminders(db: Db, rootId: string, now: Date): Promise<void> {
  await db.delete(pushReminders).where(and(eq(pushReminders.transactionRootId, rootId), isNull(pushReminders.sentAt)));

  const head = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.rootId, rootId), eq(transactions.isLatest, 1)))
    .get();
  if (!head || head.status !== 'approved') return;

  const meta = parseMeta(head.metaJson);
  if (!isPlanningExpense({ meta })) return;

  const trip = await db.select({ id: trips.id, preset: trips.preset }).from(trips).where(eq(trips.id, head.tripId)).get();
  if (!trip || trip.preset === 'direct') return;

  const start = sessionStartUtc(head.spentOn, meta?.sport?.courtSlots);
  if (!start) return;

  const participantIds = (meta?.sport?.entries ?? []).map((e) => e.participantId);
  if (participantIds.length === 0) return;

  const people = await db
    .select({ userId: participants.userId })
    .from(participants)
    .where(and(eq(participants.tripId, trip.id), inArray(participants.id, participantIds)));
  const userIds = [...new Set(people.map((p) => p.userId).filter((u): u is string => Boolean(u)))];
  if (userIds.length === 0) return;

  const subs = await subscriptionsForUsers(db, userIds, 'sessionReminder');
  for (const sub of subs) {
    const dueMs = start.getTime() - sub.reminderLeadMinutes * 60_000;
    if (dueMs <= now.getTime()) continue;
    await db
      .insert(pushReminders)
      .values({
        id: newId(),
        subscriptionId: sub.id,
        transactionRootId: rootId,
        tripId: trip.id,
        dueAt: new Date(dueMs).toISOString(),
        sentAt: null,
      })
      .onConflictDoNothing();
  }
}

/** Rebuilds the precomputed session reminders of one device. */
export async function rebuildRemindersForSubscription(db: Db, subscriptionId: string, now: Date): Promise<void> {
  await db.delete(pushReminders).where(and(eq(pushReminders.subscriptionId, subscriptionId), isNull(pushReminders.sentAt)));

  const sub = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.id, subscriptionId)).get();
  if (!sub || sub.sessionReminder !== 1) return;

  const memberRows = await db
    .select({ participantId: participants.id, tripId: participants.tripId })
    .from(participants)
    .innerJoin(trips, eq(trips.id, participants.tripId))
    .where(and(eq(participants.userId, sub.userId), ne(trips.preset, 'direct')));
  if (memberRows.length === 0) return;

  const pidsByTrip = new Map<string, Set<string>>();
  for (const r of memberRows) {
    const set = pidsByTrip.get(r.tripId) ?? new Set<string>();
    set.add(r.participantId);
    pidsByTrip.set(r.tripId, set);
  }

  const txs = await db
    .select()
    .from(transactions)
    .where(
      and(
        inArray(transactions.tripId, [...pidsByTrip.keys()]),
        eq(transactions.type, 'expense'),
        eq(transactions.isLatest, 1),
        eq(transactions.status, 'approved'),
      ),
    );

  for (const tx of txs) {
    const meta = parseMeta(tx.metaJson);
    if (!isPlanningExpense({ meta })) continue;
    const myPids = pidsByTrip.get(tx.tripId);
    if (!myPids || !(meta?.sport?.entries ?? []).some((e) => myPids.has(e.participantId))) continue;
    const start = sessionStartUtc(tx.spentOn, meta?.sport?.courtSlots);
    if (!start) continue;
    const dueMs = start.getTime() - sub.reminderLeadMinutes * 60_000;
    if (dueMs <= now.getTime()) continue;
    await db
      .insert(pushReminders)
      .values({
        id: newId(),
        subscriptionId: sub.id,
        transactionRootId: tx.rootId,
        tripId: tx.tripId,
        dueAt: new Date(dueMs).toISOString(),
        sentAt: null,
      })
      .onConflictDoNothing();
  }
}
