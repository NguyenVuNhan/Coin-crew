import { and, asc, eq, gt, isNull, ne, or } from 'drizzle-orm';
import type { Db } from '@cc/api-db/client';
import {
  tripBalanceCache,
  trips,
  userPersonalSettings,
  users,
} from '@cc/api-db/schema';
import { nowIso } from '@cc/api-util/ids';
import {
  buildTripBalanceCachePayload,
  upsertTripBalanceCacheBatch,
  type TripBalanceCachePayload,
} from '../trips/balanceCache';
import { loadLedgerSourcesBatch, settleLedger } from '../trips/snapshot';
import { loadCachedGroupRows } from '../personal/tripCache';

const DEFAULT_TRIP_LIMIT = 20;
const DEFAULT_USER_LIMIT = 10;

export interface BackfillTripResult {
  processed: number;
  lastTripId: string | null;
  done: boolean;
}

export interface BackfillPersonalResult {
  processed: number;
  lastUserId: string | null;
  done: boolean;
}

/**
 * Resumable cursor-paged backfill for `trip_balance_cache`.
 * Processes up to `limit` (default 20) stale or uncached trips ordered by `id`.
 */
export async function backfillTripBalanceCache(
  db: Db,
  opts?: { limit?: number; afterTripId?: string },
): Promise<BackfillTripResult> {
  const limit = Math.max(1, opts?.limit ?? DEFAULT_TRIP_LIMIT);
  const staleCondition = or(
    isNull(tripBalanceCache.tripVersion),
    ne(tripBalanceCache.tripVersion, trips.version),
  );
  const where = opts?.afterTripId
    ? and(gt(trips.id, opts.afterTripId), staleCondition)
    : staleCondition;

  const rows = await db
    .select({
      id: trips.id,
      version: trips.version,
      fewestTransfers: trips.fewestTransfers,
      roundTransfers: trips.roundTransfers,
    })
    .from(trips)
    .leftJoin(tripBalanceCache, eq(tripBalanceCache.tripId, trips.id))
    .where(where)
    .orderBy(asc(trips.id))
    .limit(limit);

  if (rows.length === 0) {
    return { processed: 0, lastTripId: null, done: true };
  }

  const staleTripIds = db
    .select({ id: trips.id })
    .from(trips)
    .leftJoin(tripBalanceCache, eq(tripBalanceCache.tripId, trips.id))
    .where(where)
    .orderBy(asc(trips.id))
    .limit(limit);

  const sources = await loadLedgerSourcesBatch(db, staleTripIds);
  const payloads: TripBalanceCachePayload[] = [];
  for (const trip of rows) {
    const source = sources.get(trip.id);
    if (!source) continue;
    const settled = settleLedger(trip, source);
    payloads.push(buildTripBalanceCachePayload(trip, source, settled));
  }

  if (payloads.length > 0) {
    await upsertTripBalanceCacheBatch(db, payloads, nowIso());
  }

  const lastTripId = rows[rows.length - 1]!.id;
  return {
    processed: rows.length,
    lastTripId,
    done: rows.length < limit,
  };
}

/**
 * Resumable cursor-paged backfill for `personal_trip_cache`.
 * Processes up to `limit` (default 10) personal-enabled users ordered by `id`.
 */
export async function backfillPersonalTripCache(
  db: Db,
  opts?: { limit?: number; afterUserId?: string },
): Promise<BackfillPersonalResult> {
  const limit = Math.max(1, opts?.limit ?? DEFAULT_USER_LIMIT);
  const baseWhere = eq(userPersonalSettings.enabled, 1);
  const where = opts?.afterUserId
    ? and(gt(users.id, opts.afterUserId), baseWhere)
    : baseWhere;

  const userRows = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(userPersonalSettings, eq(userPersonalSettings.userId, users.id))
    .where(where)
    .orderBy(asc(users.id))
    .limit(limit);

  if (userRows.length === 0) {
    return { processed: 0, lastUserId: null, done: true };
  }

  for (const user of userRows) {
    await loadCachedGroupRows(db, user.id);
  }

  const lastUserId = userRows[userRows.length - 1]!.id;
  return {
    processed: userRows.length,
    lastUserId,
    done: userRows.length < limit,
  };
}
