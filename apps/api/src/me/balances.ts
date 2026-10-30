import { Hono } from 'hono';
import { and, eq, sql } from 'drizzle-orm';
import { pairItems, type PersonKey, type PersonSummary, type TripPairInput } from '@fsl/core';
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

/** The cached view when it is current; `getSnapshot` otherwise (it rebuilds and stores it). */
async function snapshotFor(db: Db, trip: TripRow, viewVersion: number | null, viewJson: string | null): Promise<TripSnapshot> {
  if (viewJson !== null && viewVersion === trip.version) {
    try {
      const cached = JSON.parse(viewJson) as TripSnapshot;
      if ('fund' in cached && 'ratings' in cached) return cached;
    } catch {
      // Fall through and rebuild.
    }
  }
  return getSnapshot(db, trip);
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
 * their personal ledger. A fixed handful of queries plus one per group whose cached view
 * is stale; every query binds only the caller's id (D1 allows 100 bound parameters).
 */
export async function loadPeopleSummary(db: Db, userId: string): Promise<PersonSummary[]> {
  const mine = await db
    .select({ trip: trips, myPid: participants.id, viewVersion: tripViews.version, viewJson: tripViews.json })
    .from(participants)
    .innerJoin(trips, eq(trips.id, participants.tripId))
    .leftJoin(tripViews, eq(tripViews.tripId, trips.id))
    .where(and(eq(participants.userId, userId), eq(participants.status, 'active')));
  if (mine.length === 0) return [];

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

  for (const row of mine) {
    const trip = row.trip;
    const snapshot = await snapshotFor(db, trip, row.viewVersion, row.viewJson);
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
  return out;
}

export function balanceRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.get('/me/people/summary', requireUser, async (c) => {
    const user = (await getSessionUser(c))!;
    return c.json(await loadPeopleSummary(getDb(c.env), user.id));
  });

  return app;
}
