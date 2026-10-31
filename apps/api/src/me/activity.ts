import { Hono } from 'hono';
import { and, desc, eq, inArray, lt, ne, or } from 'drizzle-orm';
import type { ActivityAction, MyActivityItem, MyActivityPage } from '@fsl/core';
import type { AppBindings } from '../env';
import { getDb } from '../db/client';
import { activity, participants, trips } from '../db/schema';
import { getSessionUser, requireUser } from '../auth/session';
import { ApiError } from '../lib/errors';
import { actorName, loadActivityNames } from '../lib/activityNames';

const PAGE_SIZE = 50;
/** Keys in `details` that hold participant ids. */
const NAME_KEYS = ['fromId', 'toId', 'participantId'] as const;

function parseCursor(raw: string): { createdAt: string; id: string } {
  const i = raw.indexOf('~');
  if (i <= 0 || i === raw.length - 1) throw new ApiError('VALIDATION', 422, 'Invalid cursor');
  return { createdAt: raw.slice(0, i), id: raw.slice(i + 1) };
}

function detailIds(details: Record<string, unknown>): string[] {
  return NAME_KEYS.map((k) => details[k]).filter((v): v is string => typeof v === 'string' && v !== '');
}

export function myActivityRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  // GET /me/activity?before=<createdAt>~<id>
  // Every trip where I'm an active participant (archived groups too), plus my own ledger, never
  // someone else's ledger even when I'm a contact in it. At most 1 + 3 + 1 queries for a page:
  // the page, participant names (≤ 200 ids in chunks of 90) and actor account names (≤ 50 ids).
  app.get('/me/activity', requireUser, async (c) => {
    const user = (await getSessionUser(c))!;
    const db = getDb(c.env);
    const before = c.req.query('before');

    const myTrips = db
      .select({ id: participants.tripId })
      .from(participants)
      .where(and(eq(participants.userId, user.id), eq(participants.status, 'active')));

    const conditions = [
      inArray(activity.tripId, myTrips),
      or(ne(trips.preset, 'direct'), eq(trips.organiserUserId, user.id)),
    ];
    if (before) {
      const cursor = parseCursor(before);
      conditions.push(
        or(
          lt(activity.createdAt, cursor.createdAt),
          and(eq(activity.createdAt, cursor.createdAt), lt(activity.id, cursor.id)),
        ),
      );
    }

    const rows = await db
      .select({ row: activity, tripName: trips.name, preset: trips.preset })
      .from(activity)
      .innerJoin(trips, eq(trips.id, activity.tripId))
      .where(and(...conditions))
      .orderBy(desc(activity.createdAt), desc(activity.id))
      .limit(PAGE_SIZE + 1);

    const pageRows = rows.slice(0, PAGE_SIZE).map((r) => ({
      ...r,
      details: JSON.parse(r.row.detailsJson) as Record<string, unknown>,
    }));

    const names = await loadActivityNames(
      db,
      pageRows.flatMap((r) => [
        ...(r.row.actorParticipantId ? [r.row.actorParticipantId] : []),
        ...detailIds(r.details),
      ]),
      pageRows.flatMap((r) => (r.row.actorUserId ? [r.row.actorUserId] : [])),
    );

    const items: MyActivityItem[] = pageRows.map(({ row, tripName, preset, details }) => {
      const lineNames: Record<string, string> = {};
      for (const id of detailIds(details)) {
        const name = names.participants.get(id);
        if (name !== undefined) lineNames[id] = name;
      }
      return {
        id: row.id,
        action: row.action as ActivityAction,
        actorName: actorName(names, row),
        deviceShort: row.actorDevice ? row.actorDevice.slice(0, 6) : null,
        details,
        createdAt: row.createdAt,
        tripId: row.tripId,
        tripName,
        kind: preset === 'direct' ? 'direct' : 'group',
        names: lineNames,
      };
    });

    const last = items[items.length - 1];
    const page: MyActivityPage = {
      items,
      next: rows.length > PAGE_SIZE && last ? `${last.createdAt}~${last.id}` : null,
    };
    return c.json(page);
  });

  return app;
}
