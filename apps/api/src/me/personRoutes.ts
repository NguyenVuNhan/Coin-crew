import type { Context } from 'hono';
import { Hono } from 'hono';
import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { BatchItem } from 'drizzle-orm/batch';
import type { PersonKey } from '@fsl/core';
import type { AppBindings } from '../env';
import { getDb, type Db } from '../db/client';
import { nicknames, participants, personLinks } from '../db/schema';
import { getSessionUser, requireUser } from '../auth/session';
import { commitTripWrite } from '../lib/commit';
import { ApiError } from '../lib/errors';
import { newToken, nowIso } from '../lib/ids';
import { ensurePersonalLedger, importPerson, type PersonalLedger } from './ledger';

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
    try {
      return await ensureLedgerUser(db, user.id, ledger, id, device);
    } catch (err) {
      // Someone the owner shares no group with: same answer as a key that does not exist.
      if (err instanceof ApiError && err.code === 'FORBIDDEN') throw new ApiError('NOT_FOUND', 404);
      throw err;
    }
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
  const target = alias(participants, 'link_target');
  const row = await db
    .select({ id: participants.id, personPid: personLinks.personPid, targetUserId: target.userId })
    .from(participants)
    .leftJoin(personLinks, and(eq(personLinks.ownerUserId, userId), eq(personLinks.participantId, participants.id)))
    .leftJoin(target, eq(target.id, personLinks.personPid))
    .where(and(eq(participants.id, id), isNull(participants.userId), sql`${participants.tripId} IN (${myTrips(userId)})`))
    .get();
  if (!row) throw new ApiError('NOT_FOUND', 404);
  // A guest merged into an account is that account.
  if (row.targetUserId) return `u:${row.targetUserId}`;
  return `p:${row.personPid ?? row.id}`;
}

function parseNickname(raw: unknown): string | null {
  if (raw === null) return null;
  if (typeof raw !== 'string') throw new ApiError('VALIDATION', 422, 'Invalid nickname');
  const nickname = raw.trim();
  if (nickname.length < 1 || nickname.length > NICKNAME_MAX) throw new ApiError('VALIDATION', 422, 'Invalid nickname');
  return nickname;
}

interface LinkRequest {
  /** Participant ids behind the `p:` keys. */
  pids: string[];
  /** The account behind the one `u:` key, if any. */
  userId: string | null;
}

function parseLinkKeys(raw: unknown): LinkRequest {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > LINK_MAX_KEYS) {
    throw new ApiError('VALIDATION', 422, 'Pick at least two people');
  }
  const pids: string[] = [];
  const users: string[] = [];
  for (const k of raw) {
    if (typeof k !== 'string' || !/^[up]:.+$/.test(k)) throw new ApiError('VALIDATION', 422, 'Invalid person');
    (k.startsWith('u:') ? users : pids).push(k.slice(2));
  }
  if (new Set(pids).size !== pids.length || new Set(users).size !== users.length) {
    throw new ApiError('VALIDATION', 422, 'Pick different people');
  }
  // Accounts are already one person each.
  if (users.length > 1) throw new ApiError('VALIDATION', 422, "Two accounts can't be merged");
  return { pids, userId: users[0] ?? null };
}

/**
 * The account's row in the owner's ledger, imported from one of the owner's groups when there is
 * none yet. 403 when the owner shares no group with the account (the request-link route answers
 * that as 404, like a key that does not exist).
 */
async function ensureLedgerUser(db: Db, ownerUserId: string, ledger: PersonalLedger, userId: string, device: string | null): Promise<string> {
  const existing = await db
    .select({ id: participants.id })
    .from(participants)
    .where(and(eq(participants.tripId, ledger.tripId), eq(participants.userId, userId)))
    .get();
  if (existing) return existing.id;
  const source = await db
    .select({ id: participants.id })
    .from(participants)
    .where(and(
      // Any status: someone who left a group can still have money open with the owner.
      eq(participants.userId, userId),
      ne(participants.tripId, ledger.tripId),
      sql`${participants.tripId} IN (${myTrips(ownerUserId)})`,
      // In someone else's ledger only its owner counts as shared.
      sql`${participants.tripId} NOT IN (SELECT d.id FROM trips d WHERE d.preset = 'direct' AND d.organiser_user_id <> ${userId})`,
    ))
    .get();
  if (!source) throw new ApiError('FORBIDDEN', 403);
  return importPerson(db, ownerUserId, ledger, source.id, device);
}

/**
 * Make everyone behind the keys one person in the owner's lists. The survivor is the account's
 * ledger row when an account is among them (imported if missing), else the oldest ledger row among
 * the keys or behind their links, else a new import. Every other participant (group guests, other
 * ledger guests, and anyone already linked to a merged ledger guest) gets a link to the survivor,
 * so links stay one hop. Nicknames move onto the survivor's key, its own winning. Returns the
 * survivor's key.
 */
async function linkGuests(db: Db, user: { id: string; name: string }, req: LinkRequest, device: string | null): Promise<PersonKey> {
  if (req.userId === user.id) throw new ApiError('VALIDATION', 422, "You can't merge yourself");
  const ledger = await ensurePersonalLedger(db, user);
  const target = alias(participants, 'link_target');
  const rows = await db
    .select({
      id: participants.id,
      tripId: participants.tripId,
      userId: participants.userId,
      createdAt: participants.createdAt,
      personPid: personLinks.personPid,
      targetUserId: target.userId,
      targetCreatedAt: target.createdAt,
      member: sql<number>`${participants.tripId} IN (${myTrips(user.id)})`,
      // Someone else's ledger: its owner's other contacts are not the caller's to merge.
      foreign: sql<number>`${participants.tripId} IN (SELECT d.id FROM trips d WHERE d.preset = 'direct' AND d.organiser_user_id <> ${user.id})`,
    })
    .from(participants)
    .leftJoin(personLinks, and(eq(personLinks.ownerUserId, user.id), eq(personLinks.participantId, participants.id)))
    .leftJoin(target, eq(target.id, personLinks.personPid))
    .where(inArray(participants.id, req.pids));
  const byId = new Map(rows.map((r) => [r.id, r]));

  let accountId = req.userId;
  let accountRoot: string | null = null;
  // Guest ledger rows the keys stand for (directly or through a link), with their age.
  const ledgerRoots = new Map<string, string>();
  // Each key's participant, with the key the summary showed for it before this merge.
  const members: { id: string; oldKey: PersonKey }[] = [];
  for (const pid of req.pids) {
    const row = byId.get(pid);
    // Unknown, or in a trip the caller is not active in: same answer.
    if (!row || !row.member || row.foreign) throw new ApiError('FORBIDDEN', 403);
    // An account is picked by its u: key, never by one of its participants.
    if (row.userId) throw new ApiError('VALIDATION', 422, 'Only guests can be linked');
    if (row.personPid && row.targetUserId) {
      if (accountId !== null && accountId !== row.targetUserId) throw new ApiError('VALIDATION', 422, "Two accounts can't be merged");
      accountId = row.targetUserId;
      accountRoot = row.personPid;
      members.push({ id: row.id, oldKey: `u:${row.targetUserId}` });
    } else if (row.personPid) {
      ledgerRoots.set(row.personPid, row.targetCreatedAt ?? '');
      members.push({ id: row.id, oldKey: `p:${row.personPid}` });
    } else {
      if (row.tripId === ledger.tripId) ledgerRoots.set(row.id, row.createdAt);
      members.push({ id: row.id, oldKey: `p:${row.id}` });
    }
  }
  if (accountId === user.id) throw new ApiError('VALIDATION', 422, "You can't merge yourself");

  let survivor: string;
  let survivorKey: PersonKey;
  if (accountId !== null) {
    survivor = accountRoot ?? (await ensureLedgerUser(db, user.id, ledger, accountId, device));
    survivorKey = `u:${accountId}`;
  } else if (ledgerRoots.size > 0) {
    survivor = [...ledgerRoots].sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]))[0]![0];
    survivorKey = `p:${survivor}`;
  } else {
    // importPerson links this first guest to the new ledger row itself.
    survivor = await importPerson(db, user.id, ledger, members[0]!.id, device);
    survivorKey = `p:${survivor}`;
  }

  const now = nowIso();
  const queries: BatchItem<'sqlite'>[] = [];
  const merged = [...ledgerRoots.keys()].filter((id) => id !== survivor);
  if (merged.length > 0) {
    // Whoever was linked to a merged ledger guest now follows the survivor (links stay one hop).
    queries.push(
      db.update(personLinks)
        .set({ personPid: survivor, kind: 'merge' })
        .where(and(eq(personLinks.ownerUserId, user.id), inArray(personLinks.personPid, merged))),
    );
  }
  const linkIds = new Set([...members.map((m) => m.id), ...merged]);
  linkIds.delete(survivor);
  for (const id of linkIds) {
    if (byId.get(id)?.personPid === survivor) continue;
    queries.push(
      db.insert(personLinks)
        .values({ ownerUserId: user.id, participantId: id, personPid: survivor, kind: 'merge', createdAt: now })
        .onConflictDoUpdate({ target: [personLinks.ownerUserId, personLinks.participantId], set: { personPid: survivor, kind: 'merge' } }),
    );
  }

  // A nickname under a key that goes away carries over to the survivor's key; the survivor's own wins.
  const movedKeys = [...new Set<PersonKey>([...members.map((m) => m.oldKey), ...merged.map((id): PersonKey => `p:${id}`)])]
    .filter((k) => k !== survivorKey);
  if (movedKeys.length > 0) {
    const nicks = await db
      .select({ personKey: nicknames.personKey, nickname: nicknames.nickname })
      .from(nicknames)
      .where(and(eq(nicknames.ownerUserId, user.id), inArray(nicknames.personKey, [survivorKey, ...movedKeys])));
    const hasSurvivor = nicks.some((n) => n.personKey === survivorKey);
    const carried = movedKeys.map((k) => nicks.find((n) => n.personKey === k)).find((n) => n !== undefined);
    if (!hasSurvivor && carried) {
      queries.push(db.insert(nicknames).values({ ownerUserId: user.id, personKey: survivorKey, nickname: carried.nickname, updatedAt: now }));
    }
    if (carried) {
      queries.push(db.delete(nicknames).where(and(eq(nicknames.ownerUserId, user.id), inArray(nicknames.personKey, movedKeys))));
    }
  }

  if (queries.length > 0) await db.batch(queries as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
  return survivorKey;
}

/** Split one participant off the person it was merged into. Nicknames moved by the merge stay. */
async function unlinkGuest(db: Db, user: { id: string; name: string }, participantId: string, device: string | null): Promise<void> {
  const row = await db
    .select({ personPid: personLinks.personPid, kind: personLinks.kind, name: participants.name })
    .from(personLinks)
    .leftJoin(participants, eq(participants.id, personLinks.participantId))
    .where(and(eq(personLinks.ownerUserId, user.id), eq(personLinks.participantId, participantId)))
    .get();
  if (!row) throw new ApiError('NOT_FOUND', 404);
  // The link written when the person's ledger row was made from this guest is the person itself.
  if (row.kind !== 'merge') throw new ApiError('VALIDATION', 422, 'Not a merge');
  const ledger = await ensurePersonalLedger(db, user);
  await commitTripWrite(
    db,
    ledger.tripId,
    [db.delete(personLinks).where(and(eq(personLinks.ownerUserId, user.id), eq(personLinks.participantId, participantId)))],
    {
      action: 'person_unlinked',
      actorParticipantId: ledger.ownerPid,
      actorUserId: user.id,
      actorDevice: device,
      details: { participantId, personPid: row.personPid, name: row.name ?? '' },
    },
  );
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

  // "Same person?": any guests, and at most one account, become one person in the caller's lists.
  app.post('/me/people/link', requireUser, async (c) => {
    const user = (await getSessionUser(c))!;
    const db = getDb(c.env);
    const body = await parseJson<{ keys?: unknown } | null>(c);
    if (!body || typeof body !== 'object') throw new ApiError('VALIDATION', 422, 'Invalid request');
    const req = parseLinkKeys(body.keys);
    const key = await linkGuests(db, user, req, c.get('deviceHash') ?? null);
    return c.json({ key });
  });

  // "Tách ra": undo one merge the caller made (never a person's own source link).
  app.delete('/me/people/link/:participantId', requireUser, async (c) => {
    const user = (await getSessionUser(c))!;
    await unlinkGuest(getDb(c.env), user, c.req.param('participantId'), c.get('deviceHash') ?? null);
    return c.body(null, 204);
  });

  return app;
}
