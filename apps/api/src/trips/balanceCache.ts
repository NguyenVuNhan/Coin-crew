import { lte, sql } from 'drizzle-orm';
import type { Transfer } from '@cc/core';
import type { Db } from '@cc/api-db/client';
import type { TripRow } from '@cc/api-auth/actor';
import { tripBalanceCache } from '@cc/api-db/schema';
import { myBalanceIn, settleLedger, type LedgerSource } from './snapshot';

export interface WaitingPaymentItem {
  id: string;
  fromId: string;
  toId: string;
  amountClaimed: number;
}

export interface TripBalanceCachePayload {
  tripId: string;
  tripVersion: number;
  balances: Record<string, number>;
  roundedBalances: Record<string, number>;
  suggestions: Transfer[];
  waiting: WaitingPaymentItem[];
  oldestShared: Record<string, string>;
}

const CHUNK_SIZE = 12; // 12 rows * 8 columns = 96 bound parameters (< 100 D1 limit)

/** Build the consolidated per-trip balance cache payload from settled ledger data. */
export function buildTripBalanceCachePayload(
  trip: Pick<TripRow, 'id' | 'version' | 'fewestTransfers' | 'roundTransfers'>,
  source: LedgerSource & {
    expenses: {
      id: string;
      payerId: string;
      status: string;
      createdAt?: string;
      shares: { participantId: string }[];
    }[];
    payments: {
      id: string;
      fromId: string;
      toId: string;
      amountClaimed: number;
      status: string;
    }[];
  },
  settled?: { balances: Record<string, number>; suggestions: Transfer[] },
): TripBalanceCachePayload {
  const { balances, suggestions } = settled ?? settleLedger(trip, source);

  const roundedBalances: Record<string, number> = {};
  for (const person of source.people) {
    roundedBalances[person.id] = myBalanceIn(trip, { balances, suggestions }, person.id);
  }

  const waiting: WaitingPaymentItem[] = [];
  for (const p of source.payments) {
    if (p.status === 'says_paid') {
      waiting.push({
        id: p.id,
        fromId: p.fromId,
        toId: p.toId,
        amountClaimed: p.amountClaimed,
      });
    }
  }

  const oldestShared: Record<string, string> = {};
  for (const e of source.expenses) {
    if (e.status !== 'approved' || !e.createdAt) continue;
    const ids = Array.from(new Set([e.payerId, ...e.shares.map((s) => s.participantId)]));
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i]!;
        const b = ids[j]!;
        const key = a < b ? `${a}~${b}` : `${b}~${a}`;
        const existing = oldestShared[key];
        if (!existing || e.createdAt < existing) {
          oldestShared[key] = e.createdAt;
        }
      }
    }
  }

  return {
    tripId: trip.id,
    tripVersion: trip.version,
    balances,
    roundedBalances,
    suggestions,
    waiting,
    oldestShared,
  };
}

/**
 * Upsert trip_balance_cache rows in batches of 12, guarding against out-of-order
 * stale reads overwriting a newer tripVersion.
 */
export async function upsertTripBalanceCacheBatch(
  db: Db,
  payloads: TripBalanceCachePayload[],
  now: string,
): Promise<void> {
  if (payloads.length === 0) return;

  for (let i = 0; i < payloads.length; i += CHUNK_SIZE) {
    const chunk = payloads.slice(i, i + CHUNK_SIZE);
    await db
      .insert(tripBalanceCache)
      .values(
        chunk.map((p) => ({
          tripId: p.tripId,
          tripVersion: p.tripVersion,
          balancesJson: JSON.stringify(p.balances),
          roundedBalancesJson: JSON.stringify(p.roundedBalances),
          suggestionsJson: JSON.stringify(p.suggestions),
          waitingJson: JSON.stringify(p.waiting),
          oldestSharedJson: JSON.stringify(p.oldestShared),
          updatedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: tripBalanceCache.tripId,
        set: {
          tripVersion: sql`excluded.trip_version`,
          balancesJson: sql`excluded.balances_json`,
          roundedBalancesJson: sql`excluded.rounded_balances_json`,
          suggestionsJson: sql`excluded.suggestions_json`,
          waitingJson: sql`excluded.waiting_json`,
          oldestSharedJson: sql`excluded.oldest_shared_json`,
          updatedAt: sql`excluded.updated_at`,
        },
        setWhere: lte(tripBalanceCache.tripVersion, sql`excluded.trip_version`),
      });
  }
}
