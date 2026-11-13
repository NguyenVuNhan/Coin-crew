import { eq, inArray, and } from 'drizzle-orm';
import type { Db } from '@cc/api-db/client';
import { pushReminders, pushSubscriptions } from '@cc/api-db/schema';

export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;

const FLAG_COLUMN = {
  newSession: pushSubscriptions.newSession,
  expenseNew: pushSubscriptions.expenseNew,
  sessionReminder: pushSubscriptions.sessionReminder,
} as const;

/** Devices of these users that have the given switch on. */
export async function subscriptionsForUsers(
  db: Db,
  userIds: string[],
  flag: keyof typeof FLAG_COLUMN,
): Promise<PushSubscriptionRow[]> {
  if (userIds.length === 0) return [];
  return db
    .select()
    .from(pushSubscriptions)
    .where(and(inArray(pushSubscriptions.userId, userIds), eq(FLAG_COLUMN[flag], 1)))
    .all();
}

/** Removes a device and its reminders. */
export async function deleteSubscription(db: Db, id: string): Promise<void> {
  await db.delete(pushReminders).where(eq(pushReminders.subscriptionId, id));
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id));
}
