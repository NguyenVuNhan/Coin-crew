import type { Db } from '@cc/api-db/client';

/** Rebuilds the precomputed session reminders of one device. Filled in by the reminders task; a no-op until then. */
export async function rebuildRemindersForSubscription(_db: Db, _subscriptionId: string, _now: Date): Promise<void> {}
