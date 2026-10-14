import { and, asc, eq } from 'drizzle-orm';
import { makeRefCode } from '@fsl/core';
import type { Db } from '../db/client';
import { paymentRefs } from '../db/schema';
import { nowIso } from '../lib/ids';

/**
 * The transfer note for one payer -> receiver pair in a trip: the first code ever issued for the pair,
 * so it stays the same on every screen and for both people. Creates it on first use.
 */
export async function getOrCreateRefCode(
  db: Db,
  trip: { id: string; name: string },
  fromId: string,
  toId: string,
): Promise<string> {
  const firstForPair = () =>
    db
      .select()
      .from(paymentRefs)
      .where(and(eq(paymentRefs.tripId, trip.id), eq(paymentRefs.fromId, fromId), eq(paymentRefs.toId, toId)))
      .orderBy(asc(paymentRefs.createdAt))
      .limit(1)
      .get();

  const existing = await firstForPair();
  if (existing) return existing.code;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeRefCode(trip.name, Math.random);
    try {
      await db.insert(paymentRefs).values({ code, tripId: trip.id, fromId, toId, createdAt: nowIso() });
      return code;
    } catch {
      // A code clash with another pair, or another request issued this pair's code first.
      const raced = await firstForPair();
      if (raced) return raced.code;
    }
  }

  return '';
}
