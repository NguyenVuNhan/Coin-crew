import { Hono } from 'hono';
import { and, eq, sql } from 'drizzle-orm';
import { pairItems, type PeopleSummaryResponse, type PersonKey, type PersonSummary, type TripPairInput } from '@fsl/core';
import type { AppBindings } from '../env';
import { getDb, type Db } from '../db/client';
import { nicknames, participants, personLinks, trips, tripViews } from '../db/schema';
import { getSessionUser, requireUser } from '../auth/session';
import { getSnapshot, type TripSnapshot } from '../trips/snapshot';
import type { TripRow } from '../access/actor';

interface OtherRow {
  id: string;
  trip_id: string;
  name: string;
  user_id: string | null;
  user_name: string | null;
}

interface Person {
  summary: PersonSummary;
  inputs: TripPairInput[];
  waiting: boolean;
}

/**
 * Cold rebuilds allowed per request. A rebuild costs about 8 queries (measured 8–9 with the
 * cache read, which is skipped here), and a Worker gets 50 D1 queries per invocation:
 * 4 fixed queries + 4 rebuilds stays well under 45. Each request warms more caches, so a
 * client that asks again while `incomplete` is true converges.
 */
export const MAX_COLD_REBUILDS = 4;

/** The cached view when it is current, else null. */
function cachedSnapshot(trip: TripRow, viewVersion: number | null, viewJson: string | null): TripSnapshot | null {
  if (viewJson === null || viewVersion !== trip.version) return null;
  try {
    const cached = JSON.parse(viewJson) as TripSnapshot;
    // Same rule as getSnapshot: views from before the fund or ratings get rebuilt.
    return 'fund' in cached && 'ratings' in cached ? cached : null;
  } catch {
    return null;
  }
}

/** True when the caller has no suggested transfer and no payment waiting in this snapshot. */
function nothingOpen(snapshot: TripSnapshot, me: string): boolean {
  return (
    !snapshot.suggestions.some((s) => s.fromId === me || s.toId === me) &&
    !snapshot.payments.some((p) => p.status === 'says_paid' && (p.fromId === me || p.toId === me))
  );
}

/** createdAt of the oldest approved expense that involves both people. */
function oldestShared(snapshot: TripSnapshot, a: string, b: string): string | null {
  let oldest: string | null = null;
  for (const e of snapshot.expenses) {
    if (e.status !== 'approved' || !e.createdAt) continue;
    const ids = new Set([e.payerId, ...e.shares.map((s) => s.participantId)]);
    if (ids.has(a) && ids.has(b) && (oldest === null || e.createdAt < oldest)) oldest = e.createdAt;
  }
  return oldest;
}

/**
 * Everyone the caller has money open with, across their groups (archived ones too) and
 * their personal ledger. Four fixed queries plus at most MAX_COLD_REBUILDS snapshot
 * rebuilds; groups past that cap are left out and `incomplete` is true. Every query binds
 * only the caller's id (D1 allows 100 bound parameters).
 */
export async function loadPeopleSummary(db: Db, userId: string): Promise<PeopleSummaryResponse> {
  const mine = await db
    .select({ trip: trips, myPid: participants.id, viewVersion: tripViews.version, viewJson: tripViews.json })
    .from(participants)
    .innerJoin(trips, eq(trips.id, participants.tripId))
    .leftJoin(tripViews, eq(tripViews.tripId, trips.id))
    .where(and(eq(participants.userId, userId), eq(participants.status, 'active')));
  if (mine.length === 0) return { people: [], incomplete: false };

  const [others, links, nicks] = await Promise.all([
    db.all<OtherRow>(sql`
      SELECT p.id AS id, p.trip_id AS trip_id, p.name AS name, p.user_id AS user_id, u.name AS user_name
      FROM participants p LEFT JOIN users u ON u.id = p.user_id
      WHERE p.trip_id IN (SELECT m.trip_id FROM participants m WHERE m.user_id = ${userId} AND m.status = 'active')
    `),
    db.select({ participantId: personLinks.participantId, personPid: personLinks.personPid }).from(personLinks).where(eq(personLinks.ownerUserId, userId)),
    db.select({ personKey: nicknames.personKey, nickname: nicknames.nickname }).from(nicknames).where(eq(nicknames.ownerUserId, userId)),
  ]);

  const byPid = new Map(others.map((o) => [o.id, o]));
  const linkOf = new Map(links.map((l) => [l.participantId, l.personPid]));
  const nicknameOf = new Map(nicks.map((n) => [n.personKey, n.nickname]));
  const people = new Map<PersonKey, Person>();

  const warm: { row: (typeof mine)[number]; snapshot: TripSnapshot }[] = [];
  const cold: (typeof mine)[number][] = [];
  for (const row of mine) {
    const snapshot = cachedSnapshot(row.trip, row.viewVersion, row.viewJson);
    if (!snapshot) cold.push(row);
    // An archived group with nothing open for the caller adds nothing.
    else if (row.trip.archivedAt === null || !nothingOpen(snapshot, row.myPid)) warm.push({ row, snapshot });
  }

  // Rebuild the caller's ledger first, then open groups, newest first; archived ones last.
  const rank = (r: (typeof mine)[number]) =>
    r.trip.preset === 'direct' && r.trip.organiserUserId === userId ? 0 : r.trip.archivedAt === null ? 1 : 2;
  cold.sort((a, b) => rank(a) - rank(b) || b.trip.createdAt.localeCompare(a.trip.createdAt));
  for (const row of cold.slice(0, MAX_COLD_REBUILDS)) {
    const cache = row.viewJson !== null && row.viewVersion !== null ? { version: row.viewVersion, json: row.viewJson } : null;
    warm.push({ row, snapshot: await getSnapshot(db, row.trip, cache) });
  }
  const incomplete = cold.length > MAX_COLD_REBUILDS;

  for (const { row, snapshot } of warm) {
    const trip = row.trip;
    const me = row.myPid;
    const isDirect = trip.preset === 'direct';
    const ownLedger = isDirect && trip.organiserUserId === userId;

    const otherPids = new Set<string>();
    for (const s of snapshot.suggestions) {
      if (s.fromId === me) otherPids.add(s.toId);
      else if (s.toId === me) otherPids.add(s.fromId);
    }
    const waitingWith = new Set<string>();
    for (const p of snapshot.payments) {
      if (p.status !== 'says_paid') continue;
      const other = p.fromId === me ? p.toId : p.toId === me ? p.fromId : null;
      if (other) {
        otherPids.add(other);
        waitingWith.add(other);
      }
    }

    for (const pid of otherPids) {
      const other = byPid.get(pid);
      if (!other || other.user_id === userId) continue;

      let key: PersonKey;
      let name: string;
      let groupLabel: string | null = null;
      const linked = other.user_id ? undefined : linkOf.get(pid);
      if (other.user_id) {
        key = `u:${other.user_id}`;
        name = other.user_name ?? other.name;
      } else if (linked) {
        key = `p:${linked}`;
        name = byPid.get(linked)?.name ?? other.name;
      } else {
        key = `p:${pid}`;
        name = other.name;
        if (!ownLedger) groupLabel = trip.name;
      }

      let person = people.get(key);
      if (!person) {
        person = {
          summary: { key, name, nickname: nicknameOf.get(key) ?? null, userId: other.user_id, groupLabel, total: 0, items: [] },
          inputs: [],
          waiting: false,
        };
        people.set(key, person);
      }
      if (waitingWith.has(pid)) person.waiting = true;
      person.inputs.push({
        tripId: trip.id,
        tripName: trip.name,
        kind: isDirect ? 'direct' : 'group',
        ownerPid: me,
        otherPid: pid,
        suggestions: snapshot.suggestions,
        oldestOpenAt: oldestShared(snapshot, me, pid) ?? trip.createdAt,
        writable: trip.archivedAt === null,
      });
    }
  }

  const out: PersonSummary[] = [];
  for (const person of people.values()) {
    const items = pairItems(person.inputs);
    const total = items.reduce((sum, i) => sum + i.amount, 0);
    if (total === 0 && !person.waiting) continue;
    out.push({ ...person.summary, items, total });
  }
  out.sort((a, b) => Math.abs(b.total) - Math.abs(a.total) || a.name.localeCompare(b.name));
  return { people: out, incomplete };
}

export function balanceRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.get('/me/people/summary', requireUser, async (c) => {
    const user = (await getSessionUser(c))!;
    return c.json(await loadPeopleSummary(getDb(c.env), user.id));
  });

  return app;
}
