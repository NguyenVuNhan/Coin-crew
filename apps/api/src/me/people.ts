import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import type { GroupPerson, RecentPerson } from '@fsl/core';
import type { AppBindings } from '../env';
import { getDb, type Db } from '../db/client';
import { getSessionUser, requireUser } from '../auth/session';

const MAX_PEOPLE = 50;
const MAX_TRIPS = 2;
const MAX_CANDIDATES = 200;

interface RecentPersonRow {
  user_id: string;
  name: string;
  trip_id: string;
  trip_name: string;
}

export async function loadRecentPeople(db: Db, userId: string): Promise<RecentPerson[]> {
  // One query with two bound parameters (both the caller's id) and the literals written in
  // the SQL text: D1 allows at most 100 bound parameters per query, so no id lists here.
  const rows = await db.all<RecentPersonRow>(sql`
    SELECT p.user_id AS user_id, p.name AS name, t.id AS trip_id, t.name AS trip_name
    FROM participants p JOIN trips t ON t.id = p.trip_id AND t.preset <> 'direct'
    WHERE p.status = 'active' AND p.user_id IS NOT NULL AND p.user_id <> ${userId}
      AND p.trip_id IN (SELECT m.trip_id FROM participants m WHERE m.user_id = ${userId} AND m.status = 'active')
    ORDER BY t.created_at DESC, t.id, p.sort_order
    LIMIT 500
  `);

  const people = new Map<string, RecentPerson>();
  const lastTripIds = new Map<string, string>();

  for (const row of rows) {
    const existing = people.get(row.user_id);
    if (!existing) {
      if (people.size >= MAX_PEOPLE) {
        continue;
      }
      people.set(row.user_id, {
        userId: row.user_id,
        name: row.name,
        trips: [row.trip_name],
      });
      lastTripIds.set(row.user_id, row.trip_id);
    } else if (existing.trips.length < MAX_TRIPS && lastTripIds.get(row.user_id) !== row.trip_id) {
      existing.trips.push(row.trip_name);
      lastTripIds.set(row.user_id, row.trip_id);
    }
  }

  return Array.from(people.values());
}

interface GroupPersonRow {
  id: string;
  name: string;
  user_id: string | null;
  trip_name: string;
}

/**
 * Everyone active in my groups but me, newest group first; a signed-in person once. Someone already
 * in my ledger is left out by identity (same account, or a guest linked to a ledger row), never by
 * name: a second "Minh" stays pickable. One query, four bound parameters (all the caller's id).
 */
export async function loadGroupPeople(db: Db, userId: string): Promise<GroupPerson[]> {
  const ledgerRows = sql`SELECT lp.id, lp.user_id FROM participants lp JOIN trips lt ON lt.id = lp.trip_id
    WHERE lt.preset = 'direct' AND lt.organiser_user_id = ${userId} AND lp.status = 'active'`;
  const rows = await db.all<GroupPersonRow>(sql`
    SELECT p.id AS id, p.name AS name, p.user_id AS user_id, t.name AS trip_name
    FROM participants p JOIN trips t ON t.id = p.trip_id AND t.preset <> 'direct' AND t.archived_at IS NULL
    WHERE p.status = 'active' AND (p.user_id IS NULL OR p.user_id <> ${userId})
      AND p.trip_id IN (SELECT m.trip_id FROM participants m WHERE m.user_id = ${userId} AND m.status = 'active')
      AND NOT (p.user_id IS NOT NULL AND p.user_id IN (SELECT l.user_id FROM (${ledgerRows}) l WHERE l.user_id IS NOT NULL))
      AND NOT (p.user_id IS NULL AND EXISTS (
        SELECT 1 FROM person_links pl WHERE pl.owner_user_id = ${userId} AND pl.participant_id = p.id
          AND pl.person_pid IN (SELECT l.id FROM (${ledgerRows}) l)
      ))
    ORDER BY t.created_at DESC, t.id, p.sort_order
    LIMIT 500
  `);

  const out: GroupPerson[] = [];
  const seenUsers = new Set<string>();
  for (const row of rows) {
    if (out.length >= MAX_CANDIDATES) break;
    if (row.user_id) {
      if (seenUsers.has(row.user_id)) continue;
      seenUsers.add(row.user_id);
    }
    out.push({ participantId: row.id, name: row.name, userId: row.user_id, tripName: row.trip_name });
  }
  return out;
}

export function peopleRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.get('/me/people', requireUser, async (c) => {
    const user = (await getSessionUser(c))!;
    const people = await loadRecentPeople(getDb(c.env), user.id);
    return c.json(people);
  });

  app.get('/me/people/candidates', requireUser, async (c) => {
    const user = (await getSessionUser(c))!;
    return c.json(await loadGroupPeople(getDb(c.env), user.id));
  });

  return app;
}
