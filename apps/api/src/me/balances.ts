import { Hono } from 'hono';
import { and, eq, sql } from 'drizzle-orm';
import { pairItems, type PaymentView, type PeopleSummaryResponse, type PersonItem, type PersonKey, type PersonSummary, type TripPairInput } from '@fsl/core';
import type { AppBindings } from '../env';
import { getDb, type Db } from '../db/client';
import { nicknames, participants, personLinks, trips, tripViews } from '../db/schema';
import { getSessionUser, requireUser } from '../auth/session';
import { getSnapshot, type TripSnapshot } from '../trips/snapshot';
import type { TripRow } from '../access/actor';
import { ApiError } from '../lib/errors';

interface OtherRow {
  id: string;
  trip_id: string;
  name: string;
  user_id: string | null;
  user_name: string | null;
}

interface WaitingPart {
  paymentId: string;
  key: PersonKey;
  /** > 0: the person pays the caller. */
  signed: number;
  toMe: boolean;
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
 * their personal ledger. Four fixed queries, one more only when a payment waits on the caller
 * (to find its settlement), plus at most MAX_COLD_REBUILDS snapshot rebuilds; groups past that
 * cap are left out and `incomplete` is true. Every query binds
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
  const waitingParts: WaitingPart[] = [];

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
    const waitingWith = new Map<string, PaymentView[]>();
    for (const p of snapshot.payments) {
      if (p.status !== 'says_paid') continue;
      const other = p.fromId === me ? p.toId : p.toId === me ? p.fromId : null;
      if (other) {
        otherPids.add(other);
        const list = waitingWith.get(other) ?? [];
        list.push(p);
        waitingWith.set(other, list);
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
          summary: { key, name, nickname: nicknameOf.get(key) ?? null, userId: other.user_id, groupLabel, total: 0, items: [], waiting: [] },
          inputs: [],
          waiting: false,
        };
        people.set(key, person);
      }
      const waitingPayments = waitingWith.get(pid);
      if (waitingPayments) {
        person.waiting = true;
        for (const p of waitingPayments) {
          const toMe = p.toId === me;
          waitingParts.push({ paymentId: p.id, key, signed: toMe ? p.amountClaimed : -p.amountClaimed, toMe });
        }
      }
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

  const waitingOf = await waitingSettlements(db, userId, waitingParts);

  const out: PersonSummary[] = [];
  for (const person of people.values()) {
    const items: PersonItem[] = [];
    for (const input of person.inputs) {
      const [item] = pairItems([input]);
      if (item) items.push({ ...item, ownerPid: input.ownerPid, otherPid: input.otherPid });
    }
    items.sort((a, b) => a.oldestOpenAt.localeCompare(b.oldestOpenAt));
    const total = items.reduce((sum, i) => sum + i.amount, 0);
    if (total === 0 && !person.waiting) continue;
    out.push({ ...person.summary, items, total, waiting: waitingOf.get(person.summary.key) ?? [] });
  }
  out.sort((a, b) => Math.abs(b.total) - Math.abs(a.total) || a.name.localeCompare(b.name));
  return { people: out, incomplete };
}

/**
 * Groups the caller's waiting payments into settlements (payments tagged `{"settlementId"}`),
 * per person, keeping only those the caller can confirm: at least one part pays the caller.
 * One query, and only when something is waiting; it binds only the caller's id.
 */
async function waitingSettlements(db: Db, userId: string, parts: WaitingPart[]): Promise<Map<PersonKey, PersonSummary['waiting']>> {
  const out = new Map<PersonKey, PersonSummary['waiting']>();
  if (parts.length === 0) return out;

  const rows = await db.all<{ id: string; meta_json: string }>(sql`
    SELECT t.id AS id, t.meta_json AS meta_json
    FROM transactions t
    WHERE t.type = 'payment' AND t.is_latest = 1 AND t.status = 'says_paid' AND t.meta_json LIKE '%settlementId%'
      AND t.trip_id IN (SELECT m.trip_id FROM participants m WHERE m.user_id = ${userId} AND m.status = 'active')
  `);
  const settlementOf = new Map<string, string>();
  for (const row of rows) {
    try {
      const meta = JSON.parse(row.meta_json) as { settlementId?: unknown };
      if (typeof meta.settlementId === 'string') settlementOf.set(row.id, meta.settlementId);
    } catch {
      // Not a settlement part.
    }
  }

  const sums = new Map<string, { key: PersonKey; net: number; toMe: boolean }>();
  for (const part of parts) {
    const settlementId = settlementOf.get(part.paymentId);
    if (!settlementId) continue;
    const sum = sums.get(settlementId) ?? { key: part.key, net: 0, toMe: false };
    sum.net += part.signed;
    sum.toMe ||= part.toMe;
    sums.set(settlementId, sum);
  }
  for (const [settlementId, sum] of sums) {
    if (!sum.toMe) continue;
    const list = out.get(sum.key) ?? [];
    list.push({ settlementId, amount: Math.abs(sum.net), direction: sum.net >= 0 ? 'toOwner' : 'fromOwner' });
    out.set(sum.key, list);
  }
  return out;
}

/** One open item with the person, with the two participants that stand for owner and person there. */
export interface PersonTripItem extends PersonItem {
  writable: boolean;
  ownerPid: string;
  personPid: string;
}

export interface PersonItems {
  /** Canonical key: a guest linked to a ledger person is that ledger person. */
  key: PersonKey;
  name: string;
  userId: string | null;
  /** Every open item, from every group (archived ones too) where the person has a participant. */
  items: PersonTripItem[];
  /** The owner's ledger, when the person has a row in it. */
  ledger: { tripId: string; ownerPid: string; personPid: string } | null;
  /** An unlinked group guest: the participant a new ledger row should be linked from. */
  guestPid: string | null;
  /** D1 statements this load prepared (counts toward the 50-per-invocation budget). */
  queries: number;
  /** Snapshot rebuilds this load did. */
  rebuilt: number;
}

/**
 * Cold rebuilds allowed per settlement. A rebuild costs up to 9 statements; 3 fixed queries plus
 * 3 rebuilds leaves about 20 of the 50 for the writes. More cold groups than this: TRY_AGAIN
 * (the rebuilds done here warm the cache, so a retry converges).
 */
export const MAX_SETTLE_REBUILDS = 3;
export const REBUILD_COST = 9;

interface PersonRow {
  id: string;
  trip_id: string;
  name: string;
  user_id: string | null;
}

/**
 * Everything open between the owner and one person, for a settlement. Unlike loadPeopleSummary it
 * never answers with a partial picture: it looks only at trips where the person has a participant,
 * rebuilds those snapshots, and throws 409 TRY_AGAIN when more than MAX_SETTLE_REBUILDS are cold.
 * Returns null when the key is not someone the owner shares a group or ledger with.
 */
export async function loadPersonItems(db: Db, userId: string, key: PersonKey): Promise<PersonItems | null> {
  let queries = 0;
  const myTrips = sql`SELECT m.trip_id FROM participants m WHERE m.user_id = ${userId} AND m.status = 'active'`;

  let cond;
  let canonical: PersonKey = key;
  if (key.startsWith('u:')) {
    const otherUser = key.slice(2);
    if (otherUser === userId || otherUser === '') return null;
    cond = sql`p.user_id = ${otherUser}`;
  } else {
    let target = key.slice(2);
    if (target === '') return null;
    const link = await db
      .select({ personPid: personLinks.personPid })
      .from(personLinks)
      .where(and(eq(personLinks.ownerUserId, userId), eq(personLinks.participantId, target)))
      .get();
    queries += 1;
    if (link) target = link.personPid;
    canonical = `p:${target}`;
    cond = sql`p.user_id IS NULL AND (p.id = ${target} OR p.id IN (SELECT pl.participant_id FROM person_links pl WHERE pl.owner_user_id = ${userId} AND pl.person_pid = ${target}))`;
  }

  const rows = await db.all<PersonRow>(sql`
    SELECT p.id AS id, p.trip_id AS trip_id, p.name AS name, p.user_id AS user_id
    FROM participants p
    WHERE (${cond}) AND p.trip_id IN (${myTrips})
  `);
  queries += 1;
  if (rows.length === 0) return null;

  const mine = await db
    .select({ trip: trips, myPid: participants.id, viewVersion: tripViews.version, viewJson: tripViews.json })
    .from(participants)
    .innerJoin(trips, eq(trips.id, participants.tripId))
    .leftJoin(tripViews, eq(tripViews.tripId, trips.id))
    .where(and(
      eq(participants.userId, userId),
      eq(participants.status, 'active'),
      sql`${trips.id} IN (SELECT p.trip_id FROM participants p WHERE ${cond})`,
    ));
  queries += 1;

  const cold = mine.filter((r) => !cachedSnapshot(r.trip, r.viewVersion, r.viewJson));
  if (cold.length > MAX_SETTLE_REBUILDS) {
    // Warm what fits so a retry gets further, then refuse: never settle on a partial picture.
    for (const row of cold.slice(0, MAX_SETTLE_REBUILDS)) {
      const cache = row.viewJson !== null && row.viewVersion !== null ? { version: row.viewVersion, json: row.viewJson } : null;
      await getSnapshot(db, row.trip, cache);
    }
    throw new ApiError('TRY_AGAIN', 409, 'Still adding things up. Try again.');
  }

  let rebuilt = 0;
  const items: PersonTripItem[] = [];
  let ledger: PersonItems['ledger'] = null;
  for (const row of mine) {
    const trip = row.trip;
    let snapshot = cachedSnapshot(trip, row.viewVersion, row.viewJson);
    if (!snapshot) {
      const cache = row.viewJson !== null && row.viewVersion !== null ? { version: row.viewVersion, json: row.viewJson } : null;
      snapshot = await getSnapshot(db, trip, cache);
      rebuilt += 1;
    }
    const isDirect = trip.preset === 'direct';
    const ownLedger = isDirect && trip.organiserUserId === userId;
    for (const person of rows) {
      if (person.trip_id !== trip.id) continue;
      if (ownLedger && ledger === null) ledger = { tripId: trip.id, ownerPid: row.myPid, personPid: person.id };
      const [item] = pairItems([{
        tripId: trip.id,
        tripName: trip.name,
        kind: isDirect ? 'direct' : 'group',
        ownerPid: row.myPid,
        otherPid: person.id,
        suggestions: snapshot.suggestions,
        oldestOpenAt: oldestShared(snapshot, row.myPid, person.id) ?? trip.createdAt,
        writable: trip.archivedAt === null,
      }]);
      if (item) items.push({ ...item, writable: trip.archivedAt === null, ownerPid: row.myPid, otherPid: person.id, personPid: person.id });
    }
  }
  queries += rebuilt * REBUILD_COST;

  const named = rows.find((r) => r.id === canonical.slice(2)) ?? rows[0]!;
  items.sort((a, b) => a.oldestOpenAt.localeCompare(b.oldestOpenAt));
  return {
    key: canonical,
    name: named.name,
    userId: canonical.startsWith('u:') ? canonical.slice(2) : null,
    items,
    ledger,
    guestPid: canonical.startsWith('p:') && ledger === null ? canonical.slice(2) : null,
    queries,
    rebuilt,
  };
}

export function balanceRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.get('/me/people/summary', requireUser, async (c) => {
    const user = (await getSessionUser(c))!;
    return c.json(await loadPeopleSummary(getDb(c.env), user.id));
  });

  return app;
}
