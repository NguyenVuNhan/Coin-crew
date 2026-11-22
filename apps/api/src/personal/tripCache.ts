import { and, eq, inArray, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { Db } from '@cc/api-db/client';
import {
  participants,
  personalGroupLinks,
  personalTripCache,
  trips,
} from '@cc/api-db/schema';
import { nowIso } from '@cc/api-util/ids';
import { groupRowEffect, type GroupRow, type GroupSettingsView } from '@cc/core';
import { loadGroupRows } from './groupShares';

export const DEFAULT_WALLET_DELTA_KEY = '__default__';

const TRIP_CHUNK_SIZE = 90;
// 7 bound parameters per row in multi-row upsert -> 13 * 7 = 91 < 100 D1 param limit
const UPSERT_CHUNK_SIZE = 13;

const DEFAULT_EFFECT_SETTINGS: GroupSettingsView = {
  defaultGroupCategoryId: null,
  countLoans: false,
};

export function computeWalletDeltasForTrip(rows: GroupRow[]): Record<string, number> {
  const deltas: Record<string, number> = {};
  for (const row of rows) {
    if (row.pending) continue;
    const { walletDelta } = groupRowEffect(row, DEFAULT_EFFECT_SETTINGS);
    if (walletDelta === 0) continue;
    const key = row.link?.walletId ?? DEFAULT_WALLET_DELTA_KEY;
    deltas[key] = (deltas[key] ?? 0) + walletDelta;
  }
  return deltas;
}

interface ActiveTripCacheRow {
  tripId: string;
  tripVersion: number;
  cachedTripVersion: number | null;
  cachedLinksVersion: number | null;
  walletDeltasJson: string | null;
  rowsJson: string | null;
  maxLinksVersion: number;
}

interface EnsureTripCacheResult {
  tripIds: string[];
  walletDeltasByTrip: Map<string, Record<string, number>>;
  rowsByTrip: Map<string, GroupRow[]>;
}

async function ensureTripCache(
  db: Db,
  userId: string,
  includeRows: boolean,
): Promise<EnsureTripCacheResult> {
  const activeQuery = db
    .select({
      tripId: trips.id,
      tripVersion: trips.version,
      cachedTripVersion: personalTripCache.tripVersion,
      cachedLinksVersion: personalTripCache.linksVersion,
      walletDeltasJson: personalTripCache.walletDeltasJson,
      rowsJson: includeRows ? personalTripCache.rowsJson : sql<string | null>`null`,
      maxLinksVersion: sql<number>`coalesce((
        SELECT max(${personalGroupLinks.syncVersion})
        FROM ${personalGroupLinks}
        WHERE ${personalGroupLinks.userId} = ${userId}
          AND ${personalGroupLinks.tripId} = ${trips.id}
      ), 0)`,
    })
    .from(participants)
    .innerJoin(trips, eq(trips.id, participants.tripId))
    .leftJoin(
      personalTripCache,
      and(
        eq(personalTripCache.tripId, trips.id),
        eq(personalTripCache.userId, userId),
      ),
    )
    .where(and(eq(participants.userId, userId), eq(participants.status, 'active')))
    .all();

  const [activeRows, cachedTripIdRows] = includeRows
    ? await Promise.all([
        activeQuery,
        db
          .select({ tripId: personalTripCache.tripId })
          .from(personalTripCache)
          .where(eq(personalTripCache.userId, userId))
          .all(),
      ])
    : [await activeQuery, []];

  const activeByTrip = new Map<string, ActiveTripCacheRow>();
  for (const r of activeRows) {
    if (!activeByTrip.has(r.tripId)) {
      activeByTrip.set(r.tripId, {
        tripId: r.tripId,
        tripVersion: r.tripVersion,
        cachedTripVersion: r.cachedTripVersion ?? null,
        cachedLinksVersion: r.cachedLinksVersion ?? null,
        walletDeltasJson: r.walletDeltasJson ?? null,
        rowsJson: r.rowsJson ?? null,
        maxLinksVersion: Number(r.maxLinksVersion ?? 0),
      });
    }
  }

  const orphanedTripIds: string[] = [];
  for (const c of cachedTripIdRows) {
    if (!activeByTrip.has(c.tripId)) {
      orphanedTripIds.push(c.tripId);
    }
  }

  const staleTrips: ActiveTripCacheRow[] = [];
  const walletDeltasByTrip = new Map<string, Record<string, number>>();
  const rowsByTrip = new Map<string, GroupRow[]>();

  for (const t of activeByTrip.values()) {
    const isWarm =
      t.cachedTripVersion !== null &&
      t.cachedTripVersion === t.tripVersion &&
      t.cachedLinksVersion === t.maxLinksVersion &&
      t.walletDeltasJson !== null &&
      (!includeRows || t.rowsJson !== null);

    if (!isWarm) {
      staleTrips.push(t);
    } else {
      walletDeltasByTrip.set(
        t.tripId,
        JSON.parse(t.walletDeltasJson!) as Record<string, number>,
      );
      if (includeRows) {
        rowsByTrip.set(t.tripId, JSON.parse(t.rowsJson!) as GroupRow[]);
      }
    }
  }

  const stmts: BatchItem<'sqlite'>[] = [];

  if (staleTrips.length > 0) {
    const staleIds = staleTrips.map((t) => t.tripId);
    const freshRows = await loadGroupRows(db, userId, undefined, staleIds);
    const groupedRows = new Map<string, GroupRow[]>();
    for (const row of freshRows) {
      let list = groupedRows.get(row.tripId);
      if (!list) {
        list = [];
        groupedRows.set(row.tripId, list);
      }
      list.push(row);
    }

    const now = nowIso();
    const upsertValues: {
      userId: string;
      tripId: string;
      tripVersion: number;
      linksVersion: number;
      walletDeltasJson: string;
      rowsJson: string;
      updatedAt: string;
    }[] = [];

    for (const t of staleTrips) {
      const tripRows = groupedRows.get(t.tripId) ?? [];
      const walletDeltas = computeWalletDeltasForTrip(tripRows);
      const walletDeltasJson = JSON.stringify(walletDeltas);
      const rowsJson = JSON.stringify(tripRows);

      walletDeltasByTrip.set(t.tripId, walletDeltas);
      if (includeRows) {
        rowsByTrip.set(t.tripId, tripRows);
      }

      upsertValues.push({
        userId,
        tripId: t.tripId,
        tripVersion: t.tripVersion,
        linksVersion: t.maxLinksVersion,
        walletDeltasJson,
        rowsJson,
        updatedAt: now,
      });
    }

    for (let i = 0; i < upsertValues.length; i += UPSERT_CHUNK_SIZE) {
      const chunk = upsertValues.slice(i, i + UPSERT_CHUNK_SIZE);
      stmts.push(
        db
          .insert(personalTripCache)
          .values(chunk)
          .onConflictDoUpdate({
            target: [personalTripCache.userId, personalTripCache.tripId],
            set: {
              tripVersion: sql`excluded.trip_version`,
              linksVersion: sql`excluded.links_version`,
              walletDeltasJson: sql`excluded.wallet_deltas_json`,
              rowsJson: sql`excluded.rows_json`,
              updatedAt: sql`excluded.updated_at`,
            },
            setWhere: sql`(${personalTripCache.tripVersion} < excluded.trip_version OR (${personalTripCache.tripVersion} = excluded.trip_version AND ${personalTripCache.linksVersion} <= excluded.links_version))`,
          }) as unknown as BatchItem<'sqlite'>,
      );
    }
  }

  if (orphanedTripIds.length > 0) {
    for (let i = 0; i < orphanedTripIds.length; i += TRIP_CHUNK_SIZE) {
      const chunk = orphanedTripIds.slice(i, i + TRIP_CHUNK_SIZE);
      stmts.push(
        db
          .delete(personalTripCache)
          .where(
            and(
              eq(personalTripCache.userId, userId),
              inArray(personalTripCache.tripId, chunk),
            ),
          ) as unknown as BatchItem<'sqlite'>,
      );
    }
  }

  if (stmts.length > 0) {
    await db.batch([stmts[0]!, ...stmts.slice(1)]);
  }

  return {
    tripIds: Array.from(activeByTrip.keys()),
    walletDeltasByTrip,
    rowsByTrip,
  };
}

export async function loadCachedGroupRows(db: Db, userId: string): Promise<GroupRow[]> {
  const { rowsByTrip } = await ensureTripCache(db, userId, true);
  const rows: GroupRow[] = [];
  for (const tripRows of rowsByTrip.values()) {
    rows.push(...tripRows);
  }
  rows.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    if (a.createdAt !== b.createdAt) return b.createdAt.localeCompare(a.createdAt);
    return b.id.localeCompare(a.id);
  });
  return rows;
}

export async function loadCachedGroupWalletDeltas(
  db: Db,
  userId: string,
): Promise<Map<string, number>> {
  const { walletDeltasByTrip } = await ensureTripCache(db, userId, false);
  const totals = new Map<string, number>();
  for (const deltas of walletDeltasByTrip.values()) {
    for (const [key, delta] of Object.entries(deltas)) {
      totals.set(key, (totals.get(key) ?? 0) + delta);
    }
  }
  return totals;
}
