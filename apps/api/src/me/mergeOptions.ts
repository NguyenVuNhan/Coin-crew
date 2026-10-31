import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import {
  findSimilarNames,
  planMerge,
  type MergeCandidate,
  type MergeGroupRef,
  type MergeOptionsResponse,
  type MergePlanContext,
  type PersonKey,
} from '@fsl/core';
import type { AppBindings } from '../env';
import { getDb, type Db } from '../db/client';
import { getSessionUser, requireUser } from '../auth/session';
import { ApiError } from '../lib/errors';
import { loadPeopleIndex, type OtherRow, type PeoplePlace } from './balances';

function parseKey(raw: string): PersonKey {
  if (/^[up]:.+$/.test(raw)) return raw as PersonKey;
  throw new ApiError('NOT_FOUND', 404);
}

const byTripName = (a: PeoplePlace, b: PeoplePlace) => a.tripName.localeCompare(b.tripName) || a.tripId.localeCompare(b.tripId);

/** One entry per trip, A–Z. */
function groupRefs(places: PeoplePlace[]): MergeGroupRef[] {
  const seen = new Set<string>();
  const out: MergeGroupRef[] = [];
  for (const p of [...places].sort(byTripName)) {
    if (seen.has(p.tripId)) continue;
    seen.add(p.tripId);
    out.push({ tripId: p.tripId, tripName: p.tripName, kind: p.kind });
  }
  return out;
}

function signInOf(row: OtherRow | undefined): MergeCandidate['signIn'] {
  if (!row) return null;
  if (row.user_google_sub && row.user_email) return { provider: 'google', label: row.user_email };
  if (row.user_zalo_sub) return { provider: 'zalo', label: row.user_zalo_name ?? 'Zalo' };
  return null;
}

/**
 * The person page's "Merge with…" picker: the person's places, and everyone else the caller shares
 * a group or ledger with, each with the plan a pick would run. Six fixed statements: the people
 * index (four) plus pending claims and pending proposals over the caller's trips.
 * Returns null when the key is not someone the caller shares a group or ledger with.
 */
export async function loadMergeOptions(db: Db, userId: string, rawKey: PersonKey): Promise<MergeOptionsResponse | null> {
  const myTrips = sql`SELECT m.trip_id FROM participants m WHERE m.user_id = ${userId} AND m.status = 'active'`;
  const [index, claims, proposals] = await Promise.all([
    loadPeopleIndex(db, userId),
    db.all<{ participant_id: string; user_id: string }>(sql`
      SELECT r.participant_id AS participant_id, r.user_id AS user_id FROM membership_requests r
      WHERE r.status = 'pending' AND r.trip_id IN (${myTrips})
    `),
    db.all<{ guest_pid: string }>(sql`
      SELECT mp.guest_pid AS guest_pid FROM merge_proposals mp
      WHERE mp.status = 'pending' AND mp.trip_id IN (${myTrips})
    `),
  ]);

  const key = rawKey.startsWith('p:') ? index.keyOfPid.get(rawKey.slice(2)) : rawKey;
  const person = key ? index.people.get(key) : undefined;
  if (!key || !person) return null;

  const ctx: MergePlanContext = {
    adminTripIds: index.adminTripIds,
    pendingClaims: new Map(claims.map((c) => [c.participant_id, c.user_id])),
    pendingProposals: new Set(proposals.map((p) => p.guest_pid)),
  };

  // Accounts that are active in one of the caller's active groups (ledgers don't count).
  const activeGroups = new Set(
    index.mine.filter((r) => r.trip.archivedAt === null && r.trip.preset !== 'direct').map((r) => r.trip.id),
  );
  const sharesGroup = new Set<string>();
  const accountRow = new Map<string, OtherRow>();
  for (const o of index.byPid.values()) {
    if (!o.user_id) continue;
    accountRow.set(o.user_id, o);
    if (o.status === 'active' && activeGroups.has(o.trip_id)) sharesGroup.add(o.user_id);
  }

  const side = { key, userId: person.userId, places: person.places };
  const candidates: MergeCandidate[] = [];
  for (const [otherKey, other] of index.people) {
    if (otherKey === key) continue;
    const account = other.userId ? accountRow.get(other.userId) : undefined;
    candidates.push({
      key: otherKey,
      name: other.name,
      nickname: index.nicknameOf.get(otherKey) ?? null,
      avatarUrl: account?.user_avatar_url ?? null,
      signIn: other.userId && sharesGroup.has(other.userId) ? signInOf(account) : null,
      groups: groupRefs(other.places),
      similar: false,
      plan: planMerge(side, { key: otherKey, userId: other.userId, places: other.places }, ctx),
    });
  }

  const similar = findSimilarNames(person.name, candidates.map((c) => ({ id: c.key, name: c.name })));
  const rank = new Map(similar.map((s, i) => [s.id, i]));
  for (const c of candidates) c.similar = rank.has(c.key);
  candidates.sort((a, b) => {
    const ra = rank.get(a.key);
    const rb = rank.get(b.key);
    if (ra !== undefined || rb !== undefined) return (ra ?? Infinity) - (rb ?? Infinity);
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.key.localeCompare(b.key);
  });

  return {
    person: {
      key,
      groups: [...person.places].sort(byTripName).map((p) => ({
        tripId: p.tripId,
        tripName: p.tripName,
        kind: p.kind,
        participantId: p.participantId,
        name: p.name,
        // Only a group's admin renames its guests, and an archived group can't change.
        canRename: p.userId === null && index.adminTripIds.has(p.tripId) && !p.archived,
      })),
    },
    candidates,
  };
}

export function mergeOptionsRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.get('/me/people/:key/merge-options', requireUser, async (c) => {
    const user = (await getSessionUser(c))!;
    const body = await loadMergeOptions(getDb(c.env), user.id, parseKey(c.req.param('key')));
    if (!body) throw new ApiError('NOT_FOUND', 404);
    return c.json(body);
  });

  return app;
}
