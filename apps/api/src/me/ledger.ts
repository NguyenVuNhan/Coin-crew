import type { Context } from 'hono';
import { Hono } from 'hono';
import { and, eq, max } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { normalizeName } from '@fsl/core';
import type { AppBindings } from '../env';
import { getDb, type Db } from '../db/client';
import { participants, personLinks, trips } from '../db/schema';
import { getSessionUser, requireUser } from '../auth/session';
import { resolveActor } from '../access/actor';
import { commitTripWrite } from '../lib/commit';
import { ApiError } from '../lib/errors';
import { newId, newToken, nowIso } from '../lib/ids';
import { addPersonToTrip } from '../participants/routes';

export interface PersonalLedger {
  tripId: string;
  ownerPid: string;
}

export async function findLedger(db: Db, userId: string): Promise<PersonalLedger | null> {
  const row = await db
    .select({ tripId: trips.id, ownerPid: participants.id })
    .from(trips)
    .innerJoin(participants, and(eq(participants.tripId, trips.id), eq(participants.userId, userId)))
    .where(and(eq(trips.organiserUserId, userId), eq(trips.preset, 'direct')))
    .get();
  return row ?? null;
}

/**
 * The caller's hidden "direct" trip that holds quick expenses. Created on first use; a
 * concurrent create loses on `trips_organiser_direct_idx` and re-reads the winner's row.
 */
export async function ensurePersonalLedger(db: Db, user: { id: string; name: string }): Promise<PersonalLedger> {
  const existing = await findLedger(db, user.id);
  if (existing) return existing;

  const tripId = newId();
  const ownerPid = newId();
  const now = nowIso();
  const name = user.name.trim().slice(0, 40) || 'Me';

  const queries: BatchItem<'sqlite'>[] = [
    db.insert(trips).values({
      id: tripId,
      name,
      preset: 'direct',
      currency: 'VND',
      fewestTransfers: 0,
      defaultLang: 'vi',
      organiserUserId: user.id,
      // Never shown: a ledger is reached only through the owner's session.
      groupToken: newToken(),
      viewToken: newToken(),
      version: 0,
      createdAt: now,
    }),
    db.insert(participants).values({
      id: ownerPid,
      tripId,
      name,
      normalizedName: normalizeName(name),
      userId: user.id,
      isAdmin: 1,
      status: 'active',
      sortOrder: 0,
      createdAt: now,
    }),
  ];

  try {
    await commitTripWrite(db, tripId, queries, {
      action: 'trip_created',
      actorUserId: user.id,
      actorParticipantId: ownerPid,
      actorDevice: null,
      details: { name },
    });
  } catch (err) {
    const winner = await findLedger(db, user.id);
    if (winner) return winner;
    throw err;
  }
  return { tripId, ownerPid };
}

async function parseJson<T>(c: Context): Promise<T> {
  try {
    return await c.req.json<T>();
  } catch {
    throw new ApiError('VALIDATION', 422, 'Invalid request');
  }
}

async function nextSortOrder(db: Db, tripId: string): Promise<number> {
  const row = await db
    .select({ maxOrder: max(participants.sortOrder) })
    .from(participants)
    .where(eq(participants.tripId, tripId))
    .get();
  return (row?.maxOrder ?? -1) + 1;
}

/** Copy someone from one of the caller's groups into the caller's ledger (idempotent). */
export async function importPerson(
  db: Db,
  userId: string,
  ledger: PersonalLedger,
  sourcePid: string,
  deviceHash: string | null,
): Promise<string> {
  const source = await db
    .select({
      id: participants.id,
      tripId: participants.tripId,
      name: participants.name,
      userId: participants.userId,
      preset: trips.preset,
      organiserUserId: trips.organiserUserId,
    })
    .from(participants)
    .innerJoin(trips, eq(trips.id, participants.tripId))
    .where(eq(participants.id, sourcePid))
    .get();
  if (!source || source.tripId === ledger.tripId) throw new ApiError('FORBIDDEN', 403);
  // Someone else's ledger: only its owner can be picked from it, never the owner's other contacts.
  if (source.preset === 'direct' && source.userId !== source.organiserUserId) throw new ApiError('FORBIDDEN', 403);

  const membership = await db
    .select({ id: participants.id })
    .from(participants)
    .where(and(eq(participants.tripId, source.tripId), eq(participants.userId, userId), eq(participants.status, 'active')))
    .get();
  if (!membership) throw new ApiError('FORBIDDEN', 403);

  if (source.userId === userId) return ledger.ownerPid;

  if (source.userId) {
    // Same account on both sides, so no claim is needed: reuse their ledger row if there is one.
    const same = await db
      .select({ id: participants.id })
      .from(participants)
      .where(and(eq(participants.tripId, ledger.tripId), eq(participants.userId, source.userId)))
      .get();
    if (same) return same.id;
  } else {
    const link = await findLink(db, userId, source.id);
    if (link) return link;
  }

  const participantId = newId();
  const now = nowIso();
  const queries: BatchItem<'sqlite'>[] = [
    db.insert(participants).values({
      id: participantId,
      tripId: ledger.tripId,
      name: source.name,
      normalizedName: normalizeName(source.name),
      userId: source.userId,
      status: 'active',
      sortOrder: await nextSortOrder(db, ledger.tripId),
      createdByDevice: deviceHash,
      createdAt: now,
    }),
  ];
  if (!source.userId) {
    queries.push(db.insert(personLinks).values({ ownerUserId: userId, participantId: source.id, personPid: participantId, kind: 'import', createdAt: now }));
  }

  try {
    await commitTripWrite(db, ledger.tripId, queries, {
      action: 'name_added',
      actorParticipantId: ledger.ownerPid,
      actorUserId: userId,
      actorDevice: deviceHash,
      details: { name: source.name },
    });
  } catch (err) {
    // A concurrent import of the same guest won the person_links primary key.
    const link = source.userId ? null : await findLink(db, userId, source.id);
    if (link) return link;
    throw err;
  }
  return participantId;
}

async function findLink(db: Db, userId: string, participantId: string): Promise<string | null> {
  const row = await db
    .select({ personPid: personLinks.personPid })
    .from(personLinks)
    .where(and(eq(personLinks.ownerUserId, userId), eq(personLinks.participantId, participantId)))
    .get();
  return row?.personPid ?? null;
}

export function ledgerRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.get('/me/ledger', requireUser, async (c) => {
    const user = (await getSessionUser(c))!;
    return c.json(await ensurePersonalLedger(getDb(c.env), user));
  });

  app.post('/me/ledger/people', requireUser, async (c) => {
    const user = (await getSessionUser(c))!;
    const db = getDb(c.env);
    const body = await parseJson<{ name?: unknown; participantId?: unknown } | null>(c);
    if (!body || typeof body !== 'object') {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    const ledger = await ensurePersonalLedger(db, user);

    if (body.participantId !== undefined) {
      if (typeof body.participantId !== 'string' || body.participantId.length < 1) {
        throw new ApiError('VALIDATION', 422, 'Invalid request');
      }
      const participantId = await importPerson(db, user.id, ledger, body.participantId, c.get('deviceHash') ?? null);
      return c.json({ participantId }, 201);
    }

    // A plain name goes through the same path as POST /trips/:id/people, as the owner.
    const actor = await resolveActor(c, ledger.tripId);
    const participantId = await addPersonToTrip(db, actor, body);
    return c.json({ participantId }, 201);
  });

  return app;
}
