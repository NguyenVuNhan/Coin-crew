import { Hono } from 'hono';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import type { PersonKey } from '@fsl/core';
import type { AppBindings } from '../env';
import { getDb, type Db } from '../db/client';
import { participants } from '../db/schema';
import { getSessionUser, requireUser } from '../auth/session';
import { ApiError } from '../lib/errors';
import { newToken } from '../lib/ids';
import { ensurePersonalLedger, importPerson } from './ledger';

function parseKey(raw: string): PersonKey {
  if (/^[up]:.+$/.test(raw)) return raw as PersonKey;
  throw new ApiError('NOT_FOUND', 404);
}

/**
 * The person's row in the owner's ledger, imported from one of the owner's groups when there is
 * none yet. 404 when the key is not someone the owner shares a group or ledger with.
 */
async function ensureLedgerPerson(db: Db, user: { id: string; name: string }, key: PersonKey, device: string | null): Promise<string> {
  const ledger = await ensurePersonalLedger(db, user);
  const id = key.slice(2);
  if (key.startsWith('u:')) {
    if (id === user.id) throw new ApiError('NOT_FOUND', 404);
    const existing = await db
      .select({ id: participants.id })
      .from(participants)
      .where(and(eq(participants.tripId, ledger.tripId), eq(participants.userId, id)))
      .get();
    if (existing) return existing.id;
    const source = await db
      .select({ id: participants.id })
      .from(participants)
      .where(and(
        eq(participants.userId, id),
        ne(participants.tripId, ledger.tripId),
        sql`${participants.tripId} IN (SELECT m.trip_id FROM participants m WHERE m.user_id = ${user.id} AND m.status = 'active')`,
      ))
      .get();
    if (!source) throw new ApiError('NOT_FOUND', 404);
    return importPerson(db, user.id, ledger, source.id, device);
  }

  const row = await db
    .select({ id: participants.id, tripId: participants.tripId, userId: participants.userId })
    .from(participants)
    .where(eq(participants.id, id))
    .get();
  if (!row || row.userId === user.id) throw new ApiError('NOT_FOUND', 404);
  if (row.tripId === ledger.tripId) return row.id;
  try {
    return await importPerson(db, user.id, ledger, row.id, device);
  } catch (err) {
    // Someone in a group the owner is not in: same answer as a key that does not exist.
    if (err instanceof ApiError && err.code === 'FORBIDDEN') throw new ApiError('NOT_FOUND', 404);
    throw err;
  }
}

/** The participant's request token, created on first use (unguessable: 256 random bits, URL-safe). */
async function ensureRequestToken(db: Db, participantId: string): Promise<string> {
  await db
    .update(participants)
    .set({ requestToken: newToken() })
    .where(and(eq(participants.id, participantId), isNull(participants.requestToken)));
  const row = await db.select({ token: participants.requestToken }).from(participants).where(eq(participants.id, participantId)).get();
  if (!row?.token) throw new ApiError('NOT_FOUND', 404);
  return row.token;
}

export function personRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  // A Tikkie-style link: the same link every time, for one person to see and pay what they owe.
  app.post('/me/people/:key/request-link', requireUser, async (c) => {
    const user = (await getSessionUser(c))!;
    const db = getDb(c.env);
    const key = parseKey(c.req.param('key'));
    const personPid = await ensureLedgerPerson(db, user, key, c.get('deviceHash') ?? null);
    const token = await ensureRequestToken(db, personPid);
    return c.json({ url: `${c.env.APP_ORIGIN}/r/${token}` });
  });

  return app;
}
