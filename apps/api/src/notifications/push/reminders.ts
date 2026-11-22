import { and, eq, gte, inArray, isNull, ne, sql } from 'drizzle-orm';
import { isPlanningExpense, type ExpenseMeta } from '@cc/core';
import type { Db } from '@cc/api-db/client';
import { participants, pushReminders, pushSubscriptions, transactions, trips } from '@cc/api-db/schema';
import { newId } from '@cc/api-util/ids';
import { sessionStartUtc } from './sessionTime';
import { subscriptionsForUsers } from './store';

const ICT_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function parseMeta(json: string | null): ExpenseMeta | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as ExpenseMeta;
  } catch {
    return null;
  }
}

function yesterdayIctDate(now: Date): string {
  return new Date(now.getTime() + ICT_OFFSET_MS - DAY_MS).toISOString().slice(0, 10);
}

async function upsertReminder(
  db: Db,
  subscriptionId: string,
  transactionRootId: string,
  tripId: string,
  dueAt: string,
): Promise<void> {
  await db
    .insert(pushReminders)
    .values({
      id: newId(),
      subscriptionId,
      transactionRootId,
      tripId,
      dueAt,
      sentAt: null,
    })
    .onConflictDoUpdate({
      target: [pushReminders.subscriptionId, pushReminders.transactionRootId],
      set: {
        dueAt,
        sentAt: null,
        tripId,
      },
      setWhere: sql`${pushReminders.dueAt} <> excluded.due_at`,
    });
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

  const trip = await db
    .select({ id: trips.id, preset: trips.preset, archivedAt: trips.archivedAt })
    .from(trips)
    .where(eq(trips.id, head.tripId))
    .get();
  if (!trip || trip.preset === 'direct' || trip.archivedAt !== null) return;

  const start = sessionStartUtc(head.spentOn, meta?.sport?.courtSlots);
  if (!start) return;

  const participantIds = (meta?.sport?.entries ?? []).map((e) => e.participantId);
  if (participantIds.length === 0) return;

  const people = await db
    .select({ userId: participants.userId })
    .from(participants)
    .where(and(eq(participants.tripId, trip.id), ne(participants.status, 'left'), inArray(participants.id, participantIds)));
  const userIds = [...new Set(people.map((p) => p.userId).filter((u): u is string => Boolean(u)))];
  if (userIds.length === 0) return;

  const subs = await subscriptionsForUsers(db, userIds, 'sessionReminder');
  for (const sub of subs) {
    const dueMs = start.getTime() - sub.reminderLeadMinutes * 60_000;
    if (dueMs <= now.getTime()) continue;
    await upsertReminder(db, sub.id, rootId, trip.id, new Date(dueMs).toISOString());
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
    .where(
      and(
        eq(participants.userId, sub.userId),
        ne(participants.status, 'left'),
        ne(trips.preset, 'direct'),
        isNull(trips.archivedAt),
      ),
    );
  if (memberRows.length === 0) return;

  const pidsByTrip = new Map<string, Set<string>>();
  for (const r of memberRows) {
    const set = pidsByTrip.get(r.tripId) ?? new Set<string>();
    set.add(r.participantId);
    pidsByTrip.set(r.tripId, set);
  }

  const minSpentOn = yesterdayIctDate(now);
  const txs = await db
    .select()
    .from(transactions)
    .where(
      and(
        inArray(transactions.tripId, [...pidsByTrip.keys()]),
        eq(transactions.type, 'expense'),
        eq(transactions.isLatest, 1),
        eq(transactions.status, 'approved'),
        eq(transactions.amount, 0),
        gte(transactions.spentOn, minSpentOn),
        sql`json_extract(${transactions.metaJson}, '$.sport.planning') = 1`,
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
    await upsertReminder(db, sub.id, tx.rootId, tx.tripId, new Date(dueMs).toISOString());
  }
}
