import type { Context } from 'hono';
import { Hono } from 'hono';
import { and, eq, sql } from 'drizzle-orm';
import { buildVietQrPayload, findBank, maskAccountNumber, type PayInfo, type PersonItem, type PersonKey, type RequestView } from '@fsl/core';
import type { AppBindings } from '../env';
import { getDb, type Db } from '../db/client';
import { bankDetails, deviceParticipants, participants, trips, users } from '../db/schema';
import { getSessionUser } from '../auth/session';
import { ApiError } from '../lib/errors';
import { nowIso } from '../lib/ids';
import { getOrCreateRefCode } from '../payments/refs';
import { loadPersonItems, type PersonItems } from '../me/balances';
import { createSettlement, parseIdempotencyKey, settlementForKey } from '../me/settle';

/** One request link: a person's row in an owner's personal ledger. */
export interface RequestTarget {
  personPid: string;
  personUserId: string | null;
  tripId: string;
  tripName: string;
  lang: 'vi' | 'en';
  ownerUserId: string;
  ownerPid: string;
  ownerName: string;
  key: PersonKey;
}

const TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/;

/** The ledger row behind a request token, or null. Never matches a group (non-ledger) participant. */
export async function findRequest(db: Db, token: string): Promise<RequestTarget | null> {
  if (!TOKEN_RE.test(token)) return null;
  const row = await db
    .select({
      personPid: participants.id,
      personUserId: participants.userId,
      status: participants.status,
      tripId: trips.id,
      tripName: trips.name,
      lang: trips.defaultLang,
      ownerUserId: trips.organiserUserId,
      ownerName: users.name,
    })
    .from(participants)
    .innerJoin(trips, eq(trips.id, participants.tripId))
    .innerJoin(users, eq(users.id, trips.organiserUserId))
    .where(and(eq(participants.requestToken, token), eq(trips.preset, 'direct')))
    .get();
  if (!row || row.status !== 'active' || !row.ownerUserId || row.personUserId === row.ownerUserId) return null;
  const owner = await db
    .select({ id: participants.id })
    .from(participants)
    .where(and(eq(participants.tripId, row.tripId), eq(participants.userId, row.ownerUserId), eq(participants.status, 'active')))
    .get();
  if (!owner) return null;
  return {
    personPid: row.personPid,
    personUserId: row.personUserId,
    tripId: row.tripId,
    tripName: row.tripName,
    lang: row.lang === 'en' ? 'en' : 'vi',
    ownerUserId: row.ownerUserId,
    ownerPid: owner.id,
    ownerName: row.ownerName,
    key: row.personUserId ? `u:${row.personUserId}` : `p:${row.personPid}`,
  };
}

/** Open items for the pair, from the person's side (positive: they owe the owner). */
export async function requestItems(
  db: Db,
  target: RequestTarget,
): Promise<{ items: PersonItem[]; total: number; rebuilt: number; person: PersonItems | null }> {
  const person = await loadPersonItems(db, target.ownerUserId, target.key);
  const items: PersonItem[] = (person?.items ?? []).map((i) => ({
    tripId: i.tripId,
    tripName: i.tripName,
    kind: i.kind,
    amount: i.amount,
    oldestOpenAt: i.oldestOpenAt,
  }));
  return { items, total: items.reduce((sum, i) => sum + i.amount, 0), rebuilt: person?.rebuilt ?? 0, person };
}

/** True while a settlement the person recorded ("I've paid") still waits for the owner. */
async function settlementWaiting(db: Db, target: RequestTarget): Promise<boolean> {
  const personCond = target.personUserId
    ? sql`p.user_id = ${target.personUserId}`
    : sql`p.user_id IS NULL AND (p.id = ${target.personPid} OR p.id IN (SELECT pl.participant_id FROM person_links pl WHERE pl.owner_user_id = ${target.ownerUserId} AND pl.person_pid = ${target.personPid}))`;
  const rows = await db.all<{ id: string }>(sql`
    SELECT t.id AS id
    FROM transactions t
    JOIN participants p ON p.id = t.created_by_participant_id AND p.id IN (t.payer_id, t.to_id)
    JOIN participants o ON o.trip_id = t.trip_id AND o.user_id = ${target.ownerUserId} AND o.id IN (t.payer_id, t.to_id)
    WHERE t.type = 'payment' AND t.is_latest = 1 AND t.status = 'says_paid'
      AND t.meta_json LIKE '{"settlementId":%' AND (${personCond})
    LIMIT 1
  `);
  return rows.length > 0;
}

/** The owner's approved bank details as a VietQR for the person; null when the owner has none. */
async function payInfo(db: Db, target: RequestTarget, total: number): Promise<PayInfo | null> {
  const approved = await db
    .select()
    .from(bankDetails)
    .where(and(eq(bankDetails.userId, target.ownerUserId), eq(bankDetails.status, 'approved')))
    .get();
  if (!approved) return null;
  const amount = Math.max(total, 0);
  const refCode = await getOrCreateRefCode(db, { id: target.tripId, name: target.tripName }, target.personPid, target.ownerPid);
  return {
    to: { id: target.ownerPid, name: target.ownerName },
    amount,
    bankState: 'ok',
    bank: {
      bin: approved.bin,
      bankName: findBank(approved.bin)?.shortName ?? approved.bin,
      accountNumber: approved.accountNumber,
      accountNumberMasked: maskAccountNumber(approved.accountNumber),
      holderName: approved.holderName,
    },
    refCode,
    payload: amount > 0 ? buildVietQrPayload({ bin: approved.bin, accountNumber: approved.accountNumber, amount, note: refCode }) : null,
    inFlight: [],
  };
}

async function targetFor(c: Context<AppBindings>): Promise<RequestTarget> {
  const target = await findRequest(getDb(c.env), c.req.param('token') ?? '');
  if (!target) throw new ApiError('NOT_FOUND', 404);
  return target;
}

async function parseJson<T>(c: Context): Promise<T> {
  try {
    return await c.req.json<T>();
  } catch {
    throw new ApiError('VALIDATION', 422, 'Invalid request');
  }
}

/**
 * D1 statements the "I've paid" route prepares before the settlement itself: the device lookup
 * (up to 2), findRequest (2), the idempotency key lookup (1) and settlementWaiting (1). The pair's
 * own load is counted by the settlement.
 */
const PAID_ROUTE_QUERIES = 6;

export function requestRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  // Public: whoever holds the link sees this one pair, nothing else of the owner's.
  app.get('/r/:token', async (c) => {
    const db = getDb(c.env);
    const target = await targetFor(c);
    const { items, total } = await requestItems(db, target);
    const waiting = await settlementWaiting(db, target);

    // Remember this device as the person in the ledger (not when the owner opens their own link).
    const viewer = await getSessionUser(c);
    const deviceHash = c.get('deviceHash');
    if (deviceHash && viewer?.id !== target.ownerUserId) {
      const now = nowIso();
      await db
        .insert(deviceParticipants)
        .values({ deviceHash, tripId: target.tripId, participantId: target.personPid, lastUsedAt: now })
        .onConflictDoUpdate({
          target: [deviceParticipants.deviceHash, deviceParticipants.tripId],
          set: { participantId: target.personPid, lastUsedAt: now },
        });
    }

    return c.json<RequestView>({
      ownerName: target.ownerName,
      total,
      items,
      settled: items.length === 0 && !waiting,
      pay: await payInfo(db, target, total),
      settlementWaiting: waiting,
    });
  });

  // "I've paid": recorded as the person, waits for the owner to confirm. At most what is owed:
  // only the owner records an overpayment.
  app.post('/r/:token/paid', async (c) => {
    const db = getDb(c.env);
    const target = await targetFor(c);
    const body = await parseJson<{ amount?: unknown; idempotencyKey?: unknown } | null>(c);
    const amount = body && typeof body === 'object' ? body.amount : undefined;
    if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 1) {
      throw new ApiError('VALIDATION', 422, 'Invalid amount');
    }
    const idempotencyKey = parseIdempotencyKey(body!.idempotencyKey);
    // A retry of a submit that already landed gets that settlement back, not "already waiting".
    if (idempotencyKey) {
      const existing = await settlementForKey(db, idempotencyKey, target.ownerUserId);
      if (existing) return c.json({ settlementId: existing, status: 'says_paid' as const }, 200);
    }
    if (await settlementWaiting(db, target)) {
      throw new ApiError('ALREADY_WAITING', 409, 'Your payment is waiting for confirmation.');
    }
    const { total, person } = await requestItems(db, target);
    if (!person || amount > total) throw new ApiError('VALIDATION', 422, 'Invalid amount');

    // The pair loaded here goes straight into the settlement (no second load), and the budget
    // counts what this route already spent.
    const { replayed, ...result } = await createSettlement(db, {
      ownerUserId: target.ownerUserId,
      key: target.key,
      paid: amount,
      direction: 'toOwner',
      recordedBy: 'guest',
      device: c.get('deviceHash') ?? null,
      idempotencyKey,
      person,
      spent: PAID_ROUTE_QUERIES,
    });
    return c.json(result, replayed ? 200 : 201);
  });

  return app;
}
