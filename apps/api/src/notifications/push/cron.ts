import { and, eq, inArray, isNull, lte } from 'drizzle-orm';
import type { Env } from '@cc/api-db/env';
import { getDb } from '@cc/api-db/client';
import { pushReminders, pushSubscriptions, transactions } from '@cc/api-db/schema';
import type { ExpenseMeta, PushLeadMinutes } from '@cc/core';
import { safeError } from '@cc/api-util/logSafe';
import { sendToSubscriptions, sessionSnapshotOf, type TransactionRow } from './dispatch';
import { reminderMessage } from './messages';
import { vapidFromEnv } from './webPush';
import type { PushSubscriptionRow } from './store';

/** Maximum rows to process in one cron run (under D1's 100-param limit and Workers' 50-subrequest limit). */
export const BATCH_LIMIT = 40;

function parseMeta(json: string | null): ExpenseMeta | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as ExpenseMeta;
  } catch {
    return null;
  }
}

export async function sendDueReminders(env: Env, now: Date = new Date()): Promise<void> {
  if (!vapidFromEnv(env)) return;

  const db = getDb(env);
  const nowIso = now.toISOString();

  const dueRows = await db
    .select()
    .from(pushReminders)
    .where(and(isNull(pushReminders.sentAt), lte(pushReminders.dueAt, nowIso)))
    .limit(BATCH_LIMIT);

  if (dueRows.length === 0) return;

  const distinctRoots = [...new Set(dueRows.map((r) => r.transactionRootId))];
  const distinctSubIds = [...new Set(dueRows.map((r) => r.subscriptionId))];

  const heads = await db
    .select()
    .from(transactions)
    .where(and(inArray(transactions.rootId, distinctRoots), eq(transactions.isLatest, 1)));

  const headByRoot = new Map<string, TransactionRow>();
  for (const h of heads) {
    headByRoot.set(h.rootId, h);
  }

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.id, distinctSubIds));

  const subById = new Map<string, PushSubscriptionRow>();
  for (const s of subs) {
    subById.set(s.id, s);
  }

  interface SendGroup {
    head: TransactionRow;
    subs: PushSubscriptionRow[];
    leadMinutes: PushLeadMinutes;
    ttlSeconds: number;
  }
  const sendGroups = new Map<string, SendGroup>();

  for (const row of dueRows) {
    const head = headByRoot.get(row.transactionRootId) ?? null;
    const snapshot = sessionSnapshotOf(head);

    if (!snapshot.live || !snapshot.startUtc) {
      continue;
    }

    const sessionStart = new Date(snapshot.startUtc);
    if (sessionStart.getTime() <= now.getTime()) {
      continue;
    }

    const sub = subById.get(row.subscriptionId);
    if (!sub || sub.sessionReminder !== 1) {
      continue;
    }

    const diffSeconds = Math.floor((sessionStart.getTime() - now.getTime()) / 1000);
    const ttlSeconds = Math.max(diffSeconds, 60);
    const leadMinutes = (sub.reminderLeadMinutes as PushLeadMinutes) || 30;

    const groupKey = `${row.transactionRootId}:${leadMinutes}`;
    const existing = sendGroups.get(groupKey);
    if (existing) {
      existing.subs.push(sub);
    } else {
      sendGroups.set(groupKey, {
        head: head!,
        subs: [sub],
        leadMinutes,
        ttlSeconds,
      });
    }
  }

  await Promise.allSettled(
    Array.from(sendGroups.values()).map(async (group) => {
      try {
        const meta = parseMeta(group.head.metaJson);
        const courtSlots = meta?.sport?.courtSlots ?? [];
        const courtNames = courtSlots.map((c) => c.courtName.trim()).filter(Boolean);
        const courts = courtNames.length > 0 ? [...new Set(courtNames)].join(', ') : null;
        const slotTimes = courtSlots.map((c) => c.timeRange.trim()).filter(Boolean);
        const timeRange = slotTimes.length > 0 ? [...new Set(slotTimes)].join(', ') : null;
        const locationName = meta?.sport?.location?.name?.trim() || null;

        const payload = reminderMessage({
          description: group.head.description,
          leadMinutes: group.leadMinutes,
          locationName,
          courts,
          timeRange,
          tripId: group.head.tripId,
          rootId: group.head.rootId,
        });

        await sendToSubscriptions(env, db, group.subs, payload, {
          ttlSeconds: group.ttlSeconds,
          urgency: 'high',
        });
      } catch (err) {
        console.error('[sendDueReminders] group send failed:', safeError(err));
      }
    }),
  );

  const processedIds = dueRows.map((r) => r.id);
  await db
    .update(pushReminders)
    .set({ sentAt: nowIso })
    .where(inArray(pushReminders.id, processedIds));
}
