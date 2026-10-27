import type { Context } from 'hono';
import { Hono } from 'hono';
import { and, desc, eq, inArray, lt } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type {
  ActivityAction,
  ActivityItem,
  CreateTripInput,
  TripListItem,
} from '@fsl/core';
import {
  findBank,
  normalizeName,
  toTransferNote,
} from '@fsl/core';
import type { AppBindings } from '../env';
import { getDb } from '../db/client';
import {
  activity as activityTable,
  bankDetails,
  participants,
  trips,
  users,
} from '../db/schema';
import { getSessionUser, requireUser } from '../auth/session';
import { assertWritable, resolveActor } from '../access/actor';
import { ensure } from '../access/guard';
import { commitTripWrite } from '../lib/commit';
import { ApiError } from '../lib/errors';
import { newId, newToken, nowIso } from '../lib/ids';
import { loadRecentPeople } from '../me/people';
import { getSnapshot } from './snapshot';
import { toTripView } from './view';

async function parseJson<T>(c: Context): Promise<T> {
  try {
    return await c.req.json<T>();
  } catch {
    throw new ApiError('VALIDATION', 422, 'Invalid request');
  }
}

export function tripRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  // POST /trips
  app.post('/trips', requireUser, async (c) => {
    const user = (await getSessionUser(c))!;
    if (!user.consentAt) {
      throw new ApiError('FORBIDDEN', 403, 'Accept the privacy notice first.');
    }

    const body = await parseJson<CreateTripInput>(c);
    if (!body || typeof body !== 'object') {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    if (typeof body.name !== 'string' || typeof body.myName !== 'string') {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    const preset = body.preset ?? 'trip';
    if (preset !== 'trip' && preset !== 'sport') {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    if (body.myGender !== undefined && body.myGender !== null && body.myGender !== 'M' && body.myGender !== 'F') {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    if (body.defaultLang !== undefined && body.defaultLang !== null && body.defaultLang !== 'en' && body.defaultLang !== 'vi') {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }
    const defaultLang = body.defaultLang === 'en' ? 'en' : 'vi';

    const name = body.name.trim();
    if (name.length < 1 || name.length > 60) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    const myName = body.myName.trim();
    if (myName.length < 1 || myName.length > 40) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    if (!Array.isArray(body.people) || body.people.length < 1) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    // Each entry is a plain name (older clients) or { name, userId?, gender? } for someone with an account/gender.
    const people: { name: string; userId: string | null; gender: 'M' | 'F' | null }[] = [];
    for (const p of body.people as unknown[]) {
      let rawName: unknown;
      let userId: string | null = null;
      let gender: 'M' | 'F' | null = null;
      if (typeof p === 'string') {
        rawName = p;
      } else if (p && typeof p === 'object' && !Array.isArray(p)) {
        const entry = p as { name?: unknown; userId?: unknown; gender?: unknown };
        rawName = entry.name;
        if (entry.userId !== undefined) {
          if (typeof entry.userId !== 'string' || entry.userId.length < 1) {
            throw new ApiError('VALIDATION', 422, 'Invalid request');
          }
          userId = entry.userId;
        }
        if (entry.gender !== undefined && entry.gender !== null) {
          if (entry.gender !== 'M' && entry.gender !== 'F') {
            throw new ApiError('VALIDATION', 422, 'Invalid request');
          }
          gender = entry.gender;
        }
      }
      if (typeof rawName !== 'string') {
        throw new ApiError('VALIDATION', 422, 'Invalid request');
      }
      const trimmed = rawName.trim();
      if (trimmed.length < 1 || trimmed.length > 40) {
        throw new ApiError('VALIDATION', 422, 'Invalid request');
      }
      people.push({ name: trimmed, userId, gender });
    }

    // Only people the caller already shares a trip with can be added by account, each once.
    const db = getDb(c.env);
    const accountIds = people.flatMap((p) => (p.userId ? [p.userId] : []));
    if (accountIds.length > 0) {
      if (new Set(accountIds).size !== accountIds.length) {
        throw new ApiError('VALIDATION', 422, 'Invalid request');
      }
      const recent = new Set((await loadRecentPeople(db, user.id)).map((r) => r.userId));
      if (!accountIds.every((id) => recent.has(id))) {
        throw new ApiError('VALIDATION', 422, 'Invalid request');
      }
    }

    if (body.myBank !== undefined && body.myBank !== null) {
      if (typeof body.myBank !== 'object') {
        throw new ApiError('VALIDATION', 422, 'Invalid request');
      }
      const { bin, accountNumber, holderName } = body.myBank;
      if (
        typeof bin !== 'string' ||
        typeof accountNumber !== 'string' ||
        typeof holderName !== 'string'
      ) {
        throw new ApiError('VALIDATION', 422, 'Invalid request');
      }
      if (!findBank(bin)) {
        throw new ApiError('VALIDATION', 422, 'Invalid request');
      }
      if (!/^\d{6,19}$/.test(accountNumber)) {
        throw new ApiError('VALIDATION', 422, 'Invalid request');
      }
      if (!toTransferNote(holderName, 50)) {
        throw new ApiError('VALIDATION', 422, 'Invalid request');
      }
    }

    const tripId = newId();
    const organiserParticipantId = newId();
    const now = nowIso();

    const tripInsert = db.insert(trips).values({
      id: tripId,
      name,
      preset,
      currency: 'VND',
      fewestTransfers: 0,
      defaultLang,
      organiserUserId: user.id,
      groupToken: newToken(),
      viewToken: newToken(),
      version: 0,
      createdAt: now,
    });

    const organiserGender =
      body.myGender !== undefined && body.myGender !== null
        ? body.myGender
        : ((user.gender as 'M' | 'F' | null) ?? null);

    const organiserInsert = db.insert(participants).values({
      id: organiserParticipantId,
      tripId,
      name: myName,
      normalizedName: normalizeName(myName),
      gender: organiserGender,
      userId: user.id,
      isAdmin: 1,
      status: 'active',
      sortOrder: 0,
      createdAt: now,
    });

    const otherParticipantInserts = people.map((p, index) =>
      db.insert(participants).values({
        id: newId(),
        tripId,
        name: p.name,
        normalizedName: normalizeName(p.name),
        gender: p.gender ?? null,
        userId: p.userId,
        status: 'active',
        sortOrder: index + 1,
        createdAt: now,
      }),
    );

    const queries: BatchItem<'sqlite'>[] = [
      tripInsert,
      organiserInsert,
      ...otherParticipantInserts,
    ];

    const userSync: Partial<typeof users.$inferInsert> = {};
    if (!user.gender && body.myGender) {
      userSync.gender = body.myGender;
      user.gender = body.myGender;
    }
    if (user.customProfile === 0 && myName !== user.name) {
      userSync.name = myName;
      user.name = myName;
    }
    if (Object.keys(userSync).length > 0) {
      queries.push(db.update(users).set(userSync).where(eq(users.id, user.id)));
    }

    if (body.myBank) {
      const updateBank = db
        .update(bankDetails)
        .set({ status: 'replaced' })
        .where(
          and(
            eq(bankDetails.userId, user.id),
            eq(bankDetails.status, 'approved'),
          ),
        );

      const insertBank = db.insert(bankDetails).values({
        id: newId(),
        userId: user.id,
        bin: body.myBank.bin,
        accountNumber: body.myBank.accountNumber,
        holderName: body.myBank.holderName,
        status: 'approved',
        consentAt: now,
        createdAt: now,
      });

      queries.push(updateBank, insertBank);
    }

    await commitTripWrite(db, tripId, queries, {
      action: 'trip_created',
      actorUserId: user.id,
      actorParticipantId: organiserParticipantId,
      actorDevice: c.get('deviceHash'),
      details: { name, addedAccounts: people.filter((p) => p.userId).map((p) => p.name) },
    });

    return c.json({ tripId }, 201);
  });

  // GET /trips
  app.get('/trips', requireUser, async (c) => {
    const user = (await getSessionUser(c))!;
    const db = getDb(c.env);

    const rows = await db
      .select({
        participantId: participants.id,
        trip: trips,
      })
      .from(participants)
      .innerJoin(trips, eq(participants.tripId, trips.id))
      .where(
        and(
          eq(participants.userId, user.id),
          eq(participants.status, 'active'),
        ),
      )
      .orderBy(desc(trips.createdAt));

    const list: TripListItem[] = [];
    for (const row of rows) {
      const snapshot = await getSnapshot(db, row.trip);
      const myBalance = snapshot.balances[row.participantId] ?? 0;
      list.push({
        id: row.trip.id,
        name: row.trip.name,
        preset: (row.trip.preset as 'trip' | 'sport') ?? 'trip',
        archived: row.trip.archivedAt !== null,
        myBalance,
      });
    }

    return c.json(list);
  });

  // GET /trips/:id/version
  app.get('/trips/:id/version', async (c) => {
    const tripId = c.req.param('id');
    const actor = await resolveActor(c, tripId);
    return c.json({ version: actor.trip.version });
  });

  // GET /trips/:id/activity
  app.get('/trips/:id/activity', async (c) => {
    const tripId = c.req.param('id');
    const actor = await resolveActor(c, tripId);
    if (actor.kind === 'viewer') {
      throw new ApiError('FORBIDDEN', 403);
    }

    const before = c.req.query('before');
    const db = getDb(c.env);

    const conditions = [eq(activityTable.tripId, tripId)];
    if (before) {
      conditions.push(lt(activityTable.createdAt, before));
    }

    const rows = await db
      .select()
      .from(activityTable)
      .where(and(...conditions))
      .orderBy(desc(activityTable.createdAt))
      .limit(50);

    const participantIds = Array.from(
      new Set(
        rows
          .map((r) => r.actorParticipantId)
          .filter((id): id is string => id !== null),
      ),
    );
    const userIds = Array.from(
      new Set(
        rows
          .map((r) => r.actorUserId)
          .filter((id): id is string => id !== null),
      ),
    );

    const participantMap = new Map<string, string>();
    if (participantIds.length > 0) {
      const pRows = await db
        .select({ id: participants.id, name: participants.name })
        .from(participants)
        .where(inArray(participants.id, participantIds));
      for (const p of pRows) {
        participantMap.set(p.id, p.name);
      }
    }

    const userMap = new Map<string, string>();
    if (userIds.length > 0) {
      const uRows = await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.id, userIds));
      for (const u of uRows) {
        userMap.set(u.id, u.name);
      }
    }

    const items: ActivityItem[] = rows.map((r) => {
      const actorName =
        (r.actorParticipantId ? participantMap.get(r.actorParticipantId) : undefined) ??
        (r.actorUserId ? userMap.get(r.actorUserId) : undefined) ??
        null;

      return {
        id: r.id,
        action: r.action as ActivityAction,
        actorName,
        deviceShort: r.actorDevice ? r.actorDevice.slice(0, 6) : null,
        details: JSON.parse(r.detailsJson),
        createdAt: r.createdAt,
      };
    });

    return c.json(items);
  });

  // POST /trips/:id/links/regenerate
  app.post('/trips/:id/links/regenerate', async (c) => {
    const tripId = c.req.param('id');
    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);
    ensure(actor, 'regenerate_links');

    const body = await parseJson<{ which?: unknown }>(c);
    if (body?.which !== 'group' && body?.which !== 'view') {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    const token = newToken();
    const group = body.which === 'group' ? token : actor.trip.groupToken;
    const view = body.which === 'view' ? token : actor.trip.viewToken;
    const db = getDb(c.env);

    const updateQuery = db
      .update(trips)
      .set(body.which === 'group' ? { groupToken: token } : { viewToken: token })
      .where(eq(trips.id, tripId));

    await commitTripWrite(db, tripId, [updateQuery], {
      action: 'links_regenerated',
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details: { which: body.which },
    });

    return c.json({ group, view });
  });

  // POST /trips/:id/archive
  app.post('/trips/:id/archive', async (c) => {
    const tripId = c.req.param('id');
    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);
    ensure(actor, 'archive');

    const now = nowIso();
    const db = getDb(c.env);
    const updateQuery = db
      .update(trips)
      .set({ archivedAt: now })
      .where(eq(trips.id, tripId));

    await commitTripWrite(db, tripId, [updateQuery], {
      action: 'trip_archived',
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details: {},
    });

    return c.body(null, 204);
  });

  // POST /trips/:id/unarchive: the one write an archived trip accepts, so no assertWritable.
  app.post('/trips/:id/unarchive', async (c) => {
    const tripId = c.req.param('id');
    const actor = await resolveActor(c, tripId);
    ensure(actor, 'unarchive');
    if (!actor.trip.archivedAt) return c.body(null, 204);

    const db = getDb(c.env);
    const updateQuery = db
      .update(trips)
      .set({ archivedAt: null })
      .where(eq(trips.id, tripId));

    await commitTripWrite(db, tripId, [updateQuery], {
      action: 'trip_unarchived',
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details: {},
    });

    return c.body(null, 204);
  });

  // PATCH /trips/:id
  app.patch('/trips/:id', async (c) => {
    const tripId = c.req.param('id');
    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);

    const body = await parseJson<{ fewestTransfers?: unknown; ratingsEnabled?: unknown }>(c);
    const hasFewest = body?.fewestTransfers !== undefined;
    const hasRatings = body?.ratingsEnabled !== undefined;

    if (
      (!hasFewest && !hasRatings) ||
      (hasFewest && typeof body.fewestTransfers !== 'boolean') ||
      (hasRatings && typeof body.ratingsEnabled !== 'boolean')
    ) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    if (hasRatings) {
      if (actor.trip.preset !== 'sport') {
        throw new ApiError('FORBIDDEN', 403, 'Player ratings are only for sport groups.');
      }
      ensure(actor, 'manage_ratings');
    }
    if (hasFewest) {
      ensure(actor, 'set_fewest');
    }

    const db = getDb(c.env);
    const patchSet: Partial<typeof trips.$inferInsert> = {};
    if (hasFewest) patchSet.fewestTransfers = body.fewestTransfers ? 1 : 0;
    if (hasRatings) patchSet.ratingsEnabled = body.ratingsEnabled ? 1 : 0;

    const updateQuery = db
      .update(trips)
      .set(patchSet)
      .where(eq(trips.id, tripId));

    const action = hasRatings && !hasFewest ? 'ratings_changed' : 'fewest_changed';
    const details =
      hasRatings && !hasFewest
        ? { ratingsEnabled: body.ratingsEnabled as boolean }
        : { fewestTransfers: body.fewestTransfers as boolean };

    await commitTripWrite(db, tripId, [updateQuery], {
      action,
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details,
    });

    return c.body(null, 204);
  });

  // GET /trips/:id
  app.get('/trips/:id', async (c) => {
    const tripId = c.req.param('id');
    const actor = await resolveActor(c, tripId);
    const db = getDb(c.env);
    const snapshot = await getSnapshot(db, actor.trip);
    const view = await toTripView(db, snapshot, actor);
    return c.json(view);
  });

  return app;
}
