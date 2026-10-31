import type { Context } from 'hono';
import { Hono } from 'hono';
import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { PersonKey } from '@fsl/core';
import type { AppBindings } from '../env';
import { getDb, type Db } from '../db/client';
import { nicknames, participants, personLinks } from '../db/schema';
import { getSessionUser, requireUser } from '../auth/session';
import { ApiError } from '../lib/errors';
import { newToken, nowIso } from '../lib/ids';
import { ensurePersonalLedger, importPerson } from './ledger';

const NICKNAME_MAX = 40;
const LINK_MAX_KEYS = 20;

function parseKey(raw: string): PersonKey {
  if (/^[up]:.+$/.test(raw)) return raw as PersonKey;
  throw new ApiError('NOT_FOUND', 404);
}

async function parseJson<T>(c: Context): Promise<T> {
  try {
    return await c.req.json<T>();
  } catch {
    throw new ApiError('VALIDATION', 422, 'Invalid request');
  }
}

/** Trips where the caller is an active participant (their ledger included). */
const myTrips = (userId: string) => sql`SELECT m.trip_id FROM participants m WHERE m.user_id = ${userId} AND m.status = 'active'`;

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
        // In someone else's ledger only its owner counts as shared.
        sql`${participants.tripId} NOT IN (SELECT d.id FROM trips d WHERE d.preset = 'direct' AND d.organiser_user_id <> ${id})`,
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

/**
 * The key the summary shows for this person: a guest linked to a ledger person is that ledger
 * person. 404 when the key is not someone the caller shares a group or ledger with.
 */
async function canonicalKey(db: Db, userId: string, key: PersonKey): Promise<PersonKey> {
  const id = key.slice(2);
  if (key.startsWith('u:')) {
    if (id === userId) throw new ApiError('NOT_FOUND', 404);
    const shared = await db
      .select({ id: participants.id })
      .from(participants)
      .where(and(eq(participants.userId, id), sql`${participants.tripId} IN (${myTrips(userId)})`))
      .get();
    if (!shared) throw new ApiError('NOT_FOUND', 404);
    return key;
  }
  const row = await db
    .select({ id: participants.id, personPid: personLinks.personPid })
    .from(participants)
    .leftJoin(personLinks, and(eq(personLinks.ownerUserId, userId), eq(personLinks.participantId, participants.id)))
    .where(and(eq(participants.id, id), isNull(participants.userId), sql`${participants.tripId} IN (${myTrips(userId)})`))
    .get();
  if (!row) throw new ApiError('NOT_FOUND', 404);
  return `p:${row.personPid ?? row.id}`;
}

function parseNickname(raw: unknown): string | null {
  if (raw === null) return null;
  if (typeof raw !== 'string') throw new ApiError('VALIDATION', 422, 'Invalid nickname');
  const nickname = raw.trim();
  if (nickname.length < 1 || nickname.length > NICKNAME_MAX) throw new ApiError('VALIDATION', 422, 'Invalid nickname');
  return nickname;
}

function parseLinkKeys(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > LINK_MAX_KEYS) {
    throw new ApiError('VALIDATION', 422, 'Pick at least two people');
  }
  const pids: string[] = [];
  for (const k of raw) {
    // Accounts are already one person: only guests can be linked.
    if (typeof k !== 'string' || !/^p:.+$/.test(k)) throw new ApiError('VALIDATION', 422, 'Only guests can be linked');
    pids.push(k.slice(2));
  }
  if (new Set(pids).size !== pids.length) throw new ApiError('VALIDATION', 422, 'Pick different people');
  return pids;
}

/**
 * Point every guest behind the keys at one ledger person (the one already among them, or a new
 * import) and move nicknames from keys that change onto the merged key. Two different ledger
 * people are refused: merging those is the merge tool's job.
 */
async function linkGuests(db: Db, user: { id: string; name: string }, pids: string[], device: string | null): Promise<PersonKey> {
  const ledger = await ensurePersonalLedger(db, user);
  const rows = await db
    .select({
      id: participants.id,
      tripId: participants.tripId,
      userId: participants.userId,
      personPid: personLinks.personPid,
      member: sql<number>`${participants.tripId} IN (${myTrips(user.id)})`,
    })
    .from(participants)
    .leftJoin(personLinks, and(eq(personLinks.ownerUserId, user.id), eq(personLinks.participantId, participants.id)))
    .where(inArray(participants.id, pids));
  const byId = new Map(rows.map((r) => [r.id, r]));

  const ledgerPids = new Set<string>();
  const guests: { id: string; personPid: string | null }[] = [];
  for (const pid of pids) {
    const row = byId.get(pid);
    // Unknown, or in a trip the caller is not active in: same answer.
    if (!row || !row.member) throw new ApiError('FORBIDDEN', 403);
    if (row.userId) throw new ApiError('VALIDATION', 422, 'Only guests can be linked');
    if (row.tripId === ledger.tripId) {
      ledgerPids.add(row.id);
    } else {
      if (row.personPid) ledgerPids.add(row.personPid);
      guests.push({ id: row.id, personPid: row.personPid });
    }
  }
  if (ledgerPids.size > 1) {
    throw new ApiError('VALIDATION', 422, 'These are already two different people. Merge them instead.');
  }

  const target = ledgerPids.size === 1 ? [...ledgerPids][0]! : await importPerson(db, user.id, ledger, guests[0]!.id, device);
  const targetKey: PersonKey = `p:${target}`;

  const now = nowIso();
  const queries: BatchItem<'sqlite'>[] = [];
  // Keys the summary showed for guests that were not linked to the target yet.
  const movedKeys: PersonKey[] = [];
  for (const g of guests) {
    if (g.personPid === target) continue;
    movedKeys.push(`p:${g.id}`);
    queries.push(
      db.insert(personLinks)
        .values({ ownerUserId: user.id, participantId: g.id, personPid: target, createdAt: now })
        .onConflictDoUpdate({ target: [personLinks.ownerUserId, personLinks.participantId], set: { personPid: target } }),
    );
  }

  // A nickname under a moved key carries over to the merged key; the target's own wins.
  if (movedKeys.length > 0) {
    const nicks = await db
      .select({ personKey: nicknames.personKey, nickname: nicknames.nickname })
      .from(nicknames)
      .where(and(eq(nicknames.ownerUserId, user.id), inArray(nicknames.personKey, [targetKey, ...movedKeys])));
    const hasTarget = nicks.some((n) => n.personKey === targetKey);
    const carried = movedKeys.map((k) => nicks.find((n) => n.personKey === k)).find((n) => n !== undefined);
    if (!hasTarget && carried) {
      queries.push(db.insert(nicknames).values({ ownerUserId: user.id, personKey: targetKey, nickname: carried.nickname, updatedAt: now }));
    }
    if (carried) {
      queries.push(db.delete(nicknames).where(and(eq(nicknames.ownerUserId, user.id), inArray(nicknames.personKey, movedKeys))));
    }
  }

  if (queries.length > 0) await db.batch(queries as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
  return targetKey;
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

  // A private name for someone, seen only by the caller. null clears it.
  app.put('/me/people/:key/nickname', requireUser, async (c) => {
    const user = (await getSessionUser(c))!;
    const db = getDb(c.env);
    const body = await parseJson<{ nickname?: unknown } | null>(c);
    if (!body || typeof body !== 'object' || !('nickname' in body)) throw new ApiError('VALIDATION', 422, 'Invalid request');
    const nickname = parseNickname(body.nickname);
    const key = await canonicalKey(db, user.id, parseKey(c.req.param('key')));
    if (nickname === null) {
      await db.delete(nicknames).where(and(eq(nicknames.ownerUserId, user.id), eq(nicknames.personKey, key)));
    } else {
      const now = nowIso();
      await db
        .insert(nicknames)
        .values({ ownerUserId: user.id, personKey: key, nickname, updatedAt: now })
        .onConflictDoUpdate({ target: [nicknames.ownerUserId, nicknames.personKey], set: { nickname, updatedAt: now } });
    }
    return c.json({ key, nickname });
  });

  // "Same person?": guests from different groups become one person in the caller's lists.
  app.post('/me/people/link', requireUser, async (c) => {
    const user = (await getSessionUser(c))!;
    const db = getDb(c.env);
    const body = await parseJson<{ keys?: unknown } | null>(c);
    if (!body || typeof body !== 'object') throw new ApiError('VALIDATION', 422, 'Invalid request');
    const pids = parseLinkKeys(body.keys);
    const key = await linkGuests(db, user, pids, c.get('deviceHash') ?? null);
    return c.json({ key });
  });

  return app;
}
