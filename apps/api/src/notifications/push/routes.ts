import type { Context } from 'hono';
import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import type { AppBindings } from '@cc/api-db/env';
import { getDb } from '@cc/api-db/client';
import { pushSubscriptions } from '@cc/api-db/schema';
import { getSessionUser, requireUser } from '@cc/api-auth/session';
import { ApiError } from '@cc/api-util/errors';
import { newId, nowIso } from '@cc/api-util/ids';
import type { PushDeviceSettings, PushLeadMinutes } from '@cc/core';
import { vapidFromEnv } from './webPush';
import { rebuildRemindersForSubscription } from './reminders';
import { deleteSubscription, type PushSubscriptionRow } from './store';

const MAX_ENDPOINT = 1000;
const MAX_KEY = 200;
const MAX_USER_AGENT = 200;
const LEADS: readonly number[] = [15, 30, 60, 120];
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const IPV4_HOST = /^\d{1,3}(\.\d{1,3}){3}$/;

async function parseJson(c: Context): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new ApiError('VALIDATION', 422, 'Invalid request');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError('VALIDATION', 422, 'Invalid request');
  }
  return body as Record<string, unknown>;
}

/** The Worker later POSTs to this URL, so only public https hosts are accepted (no localhost, no IP literals). */
function validEndpoint(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_ENDPOINT) {
    throw new ApiError('VALIDATION', 422, 'Invalid endpoint');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApiError('VALIDATION', 422, 'Invalid endpoint');
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  const blocked =
    url.protocol !== 'https:' ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.startsWith('[') ||
    IPV4_HOST.test(host);
  if (blocked) throw new ApiError('VALIDATION', 422, 'Invalid endpoint');
  return value;
}

function validKey(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_KEY || !BASE64URL.test(value)) {
    throw new ApiError('VALIDATION', 422, `Invalid ${name}`);
  }
  return value;
}

function toSettings(row: PushSubscriptionRow): PushDeviceSettings {
  return {
    newSession: Boolean(row.newSession),
    sessionReminder: Boolean(row.sessionReminder),
    reminderLeadMinutes: row.reminderLeadMinutes as PushLeadMinutes,
    expenseNew: Boolean(row.expenseNew),
  };
}

export function pushRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.get('/push/key', (c) => c.json({ publicKey: vapidFromEnv(c.env)?.publicKey ?? null }, 200));

  app.put('/push/subscription', requireUser, async (c) => {
    const user = (await getSessionUser(c))!;
    const body = await parseJson(c);
    const endpoint = validEndpoint(body.endpoint);
    const keys = body.keys as Record<string, unknown> | undefined;
    if (!keys || typeof keys !== 'object') throw new ApiError('VALIDATION', 422, 'Invalid keys');
    const p256dh = validKey(keys.p256dh, 'p256dh');
    const auth = validKey(keys.auth, 'auth');
    if (body.userAgent !== undefined && (typeof body.userAgent !== 'string' || body.userAgent.length > MAX_USER_AGENT)) {
      throw new ApiError('VALIDATION', 422, 'Invalid userAgent');
    }
    const userAgent = (body.userAgent as string | undefined) ?? null;

    const db = getDb(c.env);
    const now = nowIso();
    const existing = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).get();

    let row: PushSubscriptionRow;
    if (!existing) {
      row = {
        id: newId(),
        userId: user.id,
        endpoint,
        p256dh,
        auth,
        newSession: 1,
        sessionReminder: 1,
        reminderLeadMinutes: 30,
        expenseNew: 1,
        userAgent,
        createdAt: now,
        updatedAt: now,
        lastSuccessAt: null,
      };
      await db.insert(pushSubscriptions).values(row);
    } else if (existing.userId === user.id) {
      row = { ...existing, p256dh, auth, userAgent: userAgent ?? existing.userAgent, updatedAt: now };
      await db
        .update(pushSubscriptions)
        .set({ p256dh, auth, userAgent: row.userAgent, updatedAt: now })
        .where(eq(pushSubscriptions.id, existing.id));
    } else {
      // The endpoint moved to another account on this phone: it takes over with default switches.
      row = {
        ...existing,
        userId: user.id,
        p256dh,
        auth,
        newSession: 1,
        sessionReminder: 1,
        reminderLeadMinutes: 30,
        expenseNew: 1,
        userAgent,
        updatedAt: now,
        lastSuccessAt: null,
      };
      const { id: _id, endpoint: _endpoint, createdAt: _createdAt, ...changes } = row;
      await db.update(pushSubscriptions).set(changes).where(eq(pushSubscriptions.id, existing.id));
    }

    await rebuildRemindersForSubscription(db, row.id, new Date());
    return c.json({ settings: toSettings(row) }, 200);
  });

  app.get('/push/subscription', requireUser, async (c) => {
    const user = (await getSessionUser(c))!;
    const endpoint = c.req.query('endpoint');
    if (!endpoint) throw new ApiError('VALIDATION', 422, 'Invalid request');
    const row = await getDb(c.env)
      .select()
      .from(pushSubscriptions)
      .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, user.id)))
      .get();
    if (!row) throw new ApiError('NOT_FOUND', 404, 'Subscription not found');
    return c.json({ settings: toSettings(row) }, 200);
  });

  app.patch('/push/subscription', requireUser, async (c) => {
    const user = (await getSessionUser(c))!;
    const body = await parseJson(c);
    if (typeof body.endpoint !== 'string' || body.endpoint.length === 0) {
      throw new ApiError('VALIDATION', 422, 'Invalid endpoint');
    }
    const patch: Partial<typeof pushSubscriptions.$inferInsert> = {};
    for (const key of ['newSession', 'sessionReminder', 'expenseNew'] as const) {
      const value = body[key];
      if (value === undefined) continue;
      if (typeof value !== 'boolean') throw new ApiError('VALIDATION', 422, `${key} must be a boolean`);
      patch[key] = value ? 1 : 0;
    }
    const lead = body.reminderLeadMinutes;
    if (lead !== undefined) {
      if (typeof lead !== 'number' || !LEADS.includes(lead)) {
        throw new ApiError('VALIDATION', 422, 'reminderLeadMinutes must be 15, 30, 60 or 120');
      }
      patch.reminderLeadMinutes = lead;
    }

    const db = getDb(c.env);
    const existing = await db
      .select()
      .from(pushSubscriptions)
      .where(and(eq(pushSubscriptions.endpoint, body.endpoint), eq(pushSubscriptions.userId, user.id)))
      .get();
    if (!existing) throw new ApiError('NOT_FOUND', 404, 'Subscription not found');

    const updatedAt = nowIso();
    await db.update(pushSubscriptions).set({ ...patch, updatedAt }).where(eq(pushSubscriptions.id, existing.id));
    if (body.sessionReminder !== undefined || body.reminderLeadMinutes !== undefined) {
      await rebuildRemindersForSubscription(db, existing.id, new Date());
    }

    const row = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.id, existing.id)).get();
    return c.json({ settings: toSettings(row!) }, 200);
  });

  app.delete('/push/subscription', requireUser, async (c) => {
    const user = (await getSessionUser(c))!;
    const body = await parseJson(c);
    if (typeof body.endpoint !== 'string' || body.endpoint.length === 0) {
      throw new ApiError('VALIDATION', 422, 'Invalid endpoint');
    }
    const db = getDb(c.env);
    const existing = await db
      .select()
      .from(pushSubscriptions)
      .where(and(eq(pushSubscriptions.endpoint, body.endpoint), eq(pushSubscriptions.userId, user.id)))
      .get();
    if (existing) await deleteSubscription(db, existing.id);
    return c.body(null, 204);
  });

  return app;
}
