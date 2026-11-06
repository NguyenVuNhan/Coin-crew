import type { Context } from 'hono';
import { Hono } from 'hono';
import { and, asc, eq } from 'drizzle-orm';
import type { ZaloChatLookup } from '@cc/core';
import type { AppBindings } from '@cc/api-db/env';
import { getDb } from '@cc/api-db/client';
import { devices, participants, trips, zaloChatLinks } from '@cc/api-db/schema';
import { getSessionUser } from '@cc/api-auth/session';
import type { ResolvedActor } from '@cc/api-auth/actor';
import { assertWritable, resolveActor } from '@cc/api-auth/actor';
import { ApiError } from '@cc/api-util/errors';
import { nowIso } from '@cc/api-util/ids';

function validateChatId(chatId: string | undefined): asserts chatId is string {
  if (!chatId || chatId.length < 1 || chatId.length > 64) {
    throw new ApiError('VALIDATION', 422, 'Invalid chat id');
  }
}

async function parseJson<T>(c: Context): Promise<T> {
  try {
    const text = await c.req.text();
    if (!text || text.trim() === '') {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }
    const val = JSON.parse(text);
    if (!val || typeof val !== 'object' || Array.isArray(val)) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }
    return val as T;
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }
    throw new ApiError('VALIDATION', 422, 'Invalid request');
  }
}

async function requireVerifiedZaloIdentity(c: Context<AppBindings>): Promise<{ zaloSub: string }> {
  const user = await getSessionUser(c);
  if (user && user.zaloSub !== null && user.zaloSub !== undefined && user.zaloSub !== '') {
    return { zaloSub: user.zaloSub };
  }

  const deviceHash = c.get('deviceHash');
  if (deviceHash) {
    const db = getDb(c.env);
    const device = await db
      .select({ zaloSub: devices.zaloSub })
      .from(devices)
      .where(eq(devices.idHash, deviceHash))
      .get();

    if (device && device.zaloSub !== null && device.zaloSub !== undefined && device.zaloSub !== '') {
      return { zaloSub: device.zaloSub };
    }
  }

  throw new ApiError('UNAUTHENTICATED', 401);
}

export function zaloChatRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  // GET /zalo/chats/:chatId
  app.get('/zalo/chats/:chatId', async (c) => {
    const chatId = c.req.param('chatId');
    validateChatId(chatId);

    const { zaloSub } = await requireVerifiedZaloIdentity(c);
    console.log('zalo chat lookup chat=' + chatId + ' zalo=' + zaloSub);

    const db = getDb(c.env);
    const link = await db
      .select()
      .from(zaloChatLinks)
      .where(eq(zaloChatLinks.chatId, chatId))
      .get();

    if (!link) {
      return c.json<ZaloChatLookup>({ linked: false });
    }

    const tripId = link.tripId;
    const trip = await db
      .select()
      .from(trips)
      .where(eq(trips.id, tripId))
      .get();

    if (!trip) {
      throw new ApiError('NOT_FOUND', 404);
    }
    if (trip.preset === 'direct') {
      throw new ApiError('FORBIDDEN', 403);
    }

    const user = await getSessionUser(c);
    let isMember = false;
    if (user) {
      const member = await db
        .select({ id: participants.id })
        .from(participants)
        .where(
          and(
            eq(participants.tripId, tripId),
            eq(participants.userId, user.id),
            eq(participants.status, 'active'),
          ),
        )
        .get();
      isMember = Boolean(member);
    }

    return c.json<ZaloChatLookup>({
      linked: true,
      tripId,
      tripName: trip.name,
      joinToken: trip.groupToken,
      isMember,
    });
  });

  // POST /zalo/chats/:chatId/link
  app.post('/zalo/chats/:chatId/link', async (c) => {
    const chatId = c.req.param('chatId');
    validateChatId(chatId);

    const body = await parseJson<{ tripId?: unknown }>(c);
    if (typeof body?.tripId !== 'string' || body.tripId.trim().length === 0) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }
    const tripId = body.tripId.trim();

    const user = await getSessionUser(c);
    if (!user) {
      throw new ApiError('UNAUTHENTICATED', 401);
    }

    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);
    if (actor.trip.preset === 'direct') {
      throw new ApiError('FORBIDDEN', 403);
    }
    if (actor.kind !== 'member') {
      throw new ApiError('FORBIDDEN', 403);
    }

    const db = getDb(c.env);
    const existing = await db
      .select()
      .from(zaloChatLinks)
      .where(eq(zaloChatLinks.chatId, chatId))
      .get();

    if (existing && existing.tripId !== tripId) {
      let currentActor: ResolvedActor;
      try {
        currentActor = await resolveActor(c, existing.tripId);
      } catch {
        throw new ApiError('CONFLICT', 409);
      }
      if (
        currentActor.kind !== 'member' ||
        (!currentActor.isAdmin && !currentActor.isOrganiser)
      ) {
        throw new ApiError('CONFLICT', 409);
      }
    }

    const now = nowIso();
    await db
      .insert(zaloChatLinks)
      .values({
        chatId,
        tripId,
        linkedByUserId: user.id,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: zaloChatLinks.chatId,
        set: {
          tripId,
          linkedByUserId: user.id,
          createdAt: now,
        },
      });

    return c.body(null, 204);
  });

  // DELETE /zalo/chats/:chatId
  app.delete('/zalo/chats/:chatId', async (c) => {
    const chatId = c.req.param('chatId');
    validateChatId(chatId);

    const db = getDb(c.env);
    const link = await db
      .select()
      .from(zaloChatLinks)
      .where(eq(zaloChatLinks.chatId, chatId))
      .get();

    if (!link) {
      throw new ApiError('NOT_FOUND', 404);
    }

    const user = await getSessionUser(c);
    if (!user) {
      throw new ApiError('UNAUTHENTICATED', 401);
    }

    let actor: ResolvedActor;
    try {
      actor = await resolveActor(c, link.tripId);
    } catch {
      throw new ApiError('FORBIDDEN', 403);
    }

    if (actor.kind !== 'member' || (!actor.isAdmin && !actor.isOrganiser)) {
      throw new ApiError('FORBIDDEN', 403);
    }

    await db
      .delete(zaloChatLinks)
      .where(eq(zaloChatLinks.chatId, chatId));

    return c.body(null, 204);
  });

  // GET /trips/:id/zalo-chats
  app.get('/trips/:id/zalo-chats', async (c) => {
    const tripId = c.req.param('id');

    const user = await getSessionUser(c);
    if (!user) {
      throw new ApiError('UNAUTHENTICATED', 401);
    }

    let actor: ResolvedActor;
    try {
      actor = await resolveActor(c, tripId);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        throw err;
      }
      throw new ApiError('FORBIDDEN', 403);
    }

    if (actor.kind !== 'member' || (!actor.isAdmin && !actor.isOrganiser)) {
      throw new ApiError('FORBIDDEN', 403);
    }

    const db = getDb(c.env);
    const rows = await db
      .select({
        chatId: zaloChatLinks.chatId,
        createdAt: zaloChatLinks.createdAt,
      })
      .from(zaloChatLinks)
      .where(eq(zaloChatLinks.tripId, tripId))
      .orderBy(asc(zaloChatLinks.createdAt));

    return c.json({ chats: rows });
  });

  return app;
}
