import type { Context } from 'hono';
import { Hono } from 'hono';
import { and, eq, sql } from 'drizzle-orm';
import type { TripLocationInput, TripLocationView } from '@cc/core';
import type { AppBindings } from '@cc/api-db/env';
import { getDb } from '@cc/api-db/client';
import { tripLocations, trips } from '@cc/api-db/schema';
import { assertWritable, resolveActor } from '@cc/api-auth/actor';
import { ensure } from '@cc/api-auth/guard';
import { ApiError, validationError } from '@cc/api-util/errors';
import { newId, nowIso } from '@cc/api-util/ids';

async function parseJson<T>(c: Context): Promise<T> {
  try {
    return await c.req.json<T>();
  } catch {
    throw new ApiError('VALIDATION', 422, 'Invalid request');
  }
}

function validateName(val: unknown, required: boolean): string | undefined {
  if (val === undefined) {
    if (required) throw new ApiError('VALIDATION', 422, 'Name is required');
    return undefined;
  }
  if (typeof val !== 'string') throw new ApiError('VALIDATION', 422, 'Name must be a string');
  const trimmed = val.trim();
  if (trimmed.length < 1 || trimmed.length > 120) {
    throw new ApiError('VALIDATION', 422, 'Name must be 1-120 characters');
  }
  return trimmed;
}

function validateAddress(val: unknown, required: boolean): string | undefined {
  if (val === undefined) {
    if (required) throw new ApiError('VALIDATION', 422, 'Address is required');
    return undefined;
  }
  if (typeof val !== 'string') throw new ApiError('VALIDATION', 422, 'Address must be a string');
  const trimmed = val.trim();
  if (trimmed.length < 1 || trimmed.length > 200) {
    throw new ApiError('VALIDATION', 422, 'Address must be 1-200 characters');
  }
  return trimmed;
}

function validatePhone(val: unknown): string | null | undefined {
  if (val === undefined) return undefined;
  if (val === null) return null;
  if (typeof val !== 'string') throw new ApiError('VALIDATION', 422, 'Phone must be a string');
  const trimmed = val.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > 30) throw new ApiError('VALIDATION', 422, 'Phone must be <= 30 characters');
  return trimmed;
}

function validateMapUrl(val: unknown): string | null | undefined {
  if (val === undefined) return undefined;
  if (val === null) return null;
  if (typeof val !== 'string') throw new ApiError('VALIDATION', 422, 'Map URL must be a string');
  const trimmed = val.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > 500 || !/^https?:\/\/\S+$/i.test(trimmed)) {
    throw validationError('mapUrl', 'Map URL must be a valid http or https URL <= 500 characters');
  }
  return trimmed;
}

function validateNotes(val: unknown): string | null | undefined {
  if (val === undefined) return undefined;
  if (val === null) return null;
  if (typeof val !== 'string') throw new ApiError('VALIDATION', 422, 'Notes must be a string');
  const trimmed = val.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > 200) throw new ApiError('VALIDATION', 422, 'Notes must be <= 200 characters');
  return trimmed;
}

export function locationRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  // POST /trips/:id/locations
  app.post('/trips/:id/locations', async (c) => {
    const tripId = c.req.param('id');
    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);
    ensure(actor, 'plan_session');

    const body = await parseJson<TripLocationInput>(c);
    if (!body || typeof body !== 'object') {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    const name = validateName(body.name, true)!;
    const address = validateAddress(body.address, true)!;
    const phone = validatePhone(body.phone) ?? null;
    const mapUrl = validateMapUrl(body.mapUrl) ?? null;
    const notes = validateNotes(body.notes) ?? null;

    const db = getDb(c.env);
    const id = newId();
    const now = nowIso();

    const insertQuery = db.insert(tripLocations).values({
      id,
      tripId: actor.trip.id,
      name,
      address,
      phone,
      mapUrl,
      notes,
      createdAt: now,
      updatedAt: now,
    });

    const bumpVersion = db
      .update(trips)
      .set({ version: sql`${trips.version} + 1` })
      .where(eq(trips.id, actor.trip.id));

    await db.batch([insertQuery, bumpVersion]);

    const location: TripLocationView = {
      id,
      name,
      address,
      phone,
      mapUrl,
      notes,
    };

    return c.json({ location }, 201);
  });

  // PATCH /trips/:id/locations/:locationId
  app.patch('/trips/:id/locations/:locationId', async (c) => {
    const tripId = c.req.param('id');
    const locationId = c.req.param('locationId');
    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);
    ensure(actor, 'plan_session');

    const db = getDb(c.env);
    const existing = await db
      .select()
      .from(tripLocations)
      .where(and(eq(tripLocations.id, locationId), eq(tripLocations.tripId, actor.trip.id)))
      .get();

    if (!existing) {
      throw new ApiError('NOT_FOUND', 404, 'Location not found');
    }

    const body = await parseJson<Record<string, unknown>>(c);
    if (!body || typeof body !== 'object') {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    const nextName = body.name !== undefined ? validateName(body.name, true)! : existing.name;
    const nextAddress = body.address !== undefined ? validateAddress(body.address, true)! : existing.address;
    const nextPhone = body.phone !== undefined ? validatePhone(body.phone) ?? null : existing.phone;
    const nextMapUrl = body.mapUrl !== undefined ? validateMapUrl(body.mapUrl) ?? null : existing.mapUrl;
    const nextNotes = body.notes !== undefined ? validateNotes(body.notes) ?? null : existing.notes;

    const now = nowIso();
    const updateQuery = db
      .update(tripLocations)
      .set({
        name: nextName,
        address: nextAddress,
        phone: nextPhone,
        mapUrl: nextMapUrl,
        notes: nextNotes,
        updatedAt: now,
      })
      .where(and(eq(tripLocations.id, locationId), eq(tripLocations.tripId, actor.trip.id)));

    const bumpVersion = db
      .update(trips)
      .set({ version: sql`${trips.version} + 1` })
      .where(eq(trips.id, actor.trip.id));

    await db.batch([updateQuery, bumpVersion]);

    const location: TripLocationView = {
      id: existing.id,
      name: nextName,
      address: nextAddress,
      phone: nextPhone,
      mapUrl: nextMapUrl,
      notes: nextNotes,
    };

    return c.json({ location }, 200);
  });

  // DELETE /trips/:id/locations/:locationId
  app.delete('/trips/:id/locations/:locationId', async (c) => {
    const tripId = c.req.param('id');
    const locationId = c.req.param('locationId');
    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);
    ensure(actor, 'plan_session');

    const db = getDb(c.env);
    const existing = await db
      .select()
      .from(tripLocations)
      .where(and(eq(tripLocations.id, locationId), eq(tripLocations.tripId, actor.trip.id)))
      .get();

    if (!existing) {
      throw new ApiError('NOT_FOUND', 404, 'Location not found');
    }

    const deleteQuery = db
      .delete(tripLocations)
      .where(and(eq(tripLocations.id, locationId), eq(tripLocations.tripId, actor.trip.id)));

    const bumpVersion = db
      .update(trips)
      .set({ version: sql`${trips.version} + 1` })
      .where(eq(trips.id, actor.trip.id));

    await db.batch([deleteQuery, bumpVersion]);

    return c.json({ ok: true }, 200);
  });

  return app;
}
