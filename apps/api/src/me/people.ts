import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import type { RecentPerson } from '@fsl/core';
import type { AppBindings } from '../env';
import { getDb, type Db } from '../db/client';
import { getSessionUser, requireUser } from '../auth/session';

const MAX_PEOPLE = 50;
const MAX_TRIPS = 2;

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

export function peopleRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.get('/me/people', requireUser, async (c) => {
    const user = (await getSessionUser(c))!;
    const people = await loadRecentPeople(getDb(c.env), user.id);
    return c.json(people);
  });

  return app;
}
