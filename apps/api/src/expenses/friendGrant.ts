import { and, eq } from 'drizzle-orm';
import type { Db } from '@cc/api-db/client';
import { deviceExpenseGrants } from '@cc/api-db/schema';

export async function getFriendGrant(
  db: Db,
  deviceHash: string,
  tripId: string,
  expenseRootId: string,
): Promise<string | null> {
  const row = await db
    .select({ participantId: deviceExpenseGrants.participantId })
    .from(deviceExpenseGrants)
    .where(
      and(
        eq(deviceExpenseGrants.deviceHash, deviceHash),
        eq(deviceExpenseGrants.tripId, tripId),
        eq(deviceExpenseGrants.expenseRootId, expenseRootId),
      ),
    )
    .get();
  return row?.participantId ?? null;
}
