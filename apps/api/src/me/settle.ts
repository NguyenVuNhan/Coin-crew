import type { Context } from 'hono';
import { Hono } from 'hono';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { MAX_AMOUNT, normalizeName, spreadSettlement, type PersonKey } from '@fsl/core';
import type { AppBindings } from '../env';
import { getDb, type Db } from '../db/client';
import { activity, participants, personLinks, transactions, transactionShares, trips, users } from '../db/schema';
import { getSessionUser, requireUser } from '../auth/session';
import { ApiError } from '../lib/errors';
import { newId, nowIso } from '../lib/ids';
import { loadPersonItems } from './balances';
import { ensurePersonalLedger, findLedger } from './ledger';

/**
 * D1 statements a settlement may prepare in one Worker invocation (the hard limit is 50; every
 * statement inside a batch counts). Kept a little under, as loadPeopleSummary does.
 */
export const SETTLE_QUERY_BUDGET = 45;

/** Rows per multi-row insert, so no statement binds more than D1's 100 parameters. */
const SHARE_ROWS_PER_INSERT = 20; // 4 columns
const ACTIVITY_ROWS_PER_INSERT = 12; // 8 columns

export interface CreateSettlementArgs {
  ownerUserId: string;
  key: PersonKey;
  paid: number;
  direction: 'toOwner' | 'fromOwner';
  recordedBy: 'owner' | 'guest';
  device: string | null;
}

interface Target {
  tripId: string;
  ownerPid: string;
  personPid: string;
}

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function asBatch(queries: BatchItem<'sqlite'>[]): [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]] {
  return queries as unknown as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]];
}

/**
 * One cash handover with a person, spread over every group (and the ledger) where money is open
 * between them: one `payment` per part, all tagged `{"settlementId"}` in metaJson, written in a
 * single D1 batch so the settlement lands whole or not at all. Refuses (409 TRY_AGAIN) rather than
 * act on an incomplete picture of what is open.
 */
export async function createSettlement(db: Db, args: CreateSettlementArgs): Promise<{ settlementId: string; status: 'confirmed' | 'says_paid' }> {
  if (!Number.isSafeInteger(args.paid) || args.paid < 1 || args.paid > MAX_AMOUNT) {
    throw new ApiError('VALIDATION', 422, 'Invalid amount');
  }
  if (args.direction !== 'toOwner' && args.direction !== 'fromOwner') {
    throw new ApiError('VALIDATION', 422, 'Invalid request');
  }

  const person = await loadPersonItems(db, args.ownerUserId, args.key);
  if (!person) throw new ApiError('NOT_FOUND', 404);

  // spreadSettlement works on trip ids; a group can hold two rows linked to one person, so each
  // item gets its own ref and the ledger its own, mapped back to (trip, owner, person) below.
  const LEDGER = 'ledger';
  const targets = new Map<string, Target>();
  const ledgerRow = person.ledger;
  const spreadItems = person.items.map((item, i) => {
    // The person's own ledger item shares the ledger ref, so redirected parts merge into it.
    const isLedger = ledgerRow !== null && item.tripId === ledgerRow.tripId && item.personPid === ledgerRow.personPid;
    const ref = isLedger ? LEDGER : `item:${i}`;
    targets.set(ref, { tripId: item.tripId, ownerPid: item.ownerPid, personPid: item.personPid });
    return { ...item, tripId: ref };
  });
  if (ledgerRow) targets.set(LEDGER, ledgerRow);
  const parts = spreadSettlement(spreadItems, args.paid, args.direction, LEDGER);

  const needsLedgerRow = !person.ledger && parts.some((p) => p.tripId === LEDGER);
  const ledgerRowCost = needsLedgerRow ? 1 + (person.guestPid ? 1 : 0) : 0;
  // Worst case to find or create the owner's ledger: find (1), user (1), ensure (find 1 + batch 4).
  const ledgerLookupCost = needsLedgerRow ? 7 : 0;
  const writeCost =
    parts.length + Math.ceil(parts.length / SHARE_ROWS_PER_INSERT) + 1 + Math.ceil(parts.length / ACTIVITY_ROWS_PER_INSERT) + ledgerRowCost;
  if (person.queries + ledgerLookupCost + writeCost > SETTLE_QUERY_BUDGET) {
    if (person.rebuilt > 0) throw new ApiError('TRY_AGAIN', 409, 'Still adding things up. Try again.');
    throw new ApiError('VALIDATION', 422, 'Too many groups to settle at once.');
  }

  const now = nowIso();
  const queries: BatchItem<'sqlite'>[] = [];

  if (needsLedgerRow) {
    let ledger = await findLedger(db, args.ownerUserId);
    if (!ledger) {
      const owner = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, args.ownerUserId)).get();
      if (!owner) throw new ApiError('NOT_FOUND', 404);
      ledger = await ensurePersonalLedger(db, owner);
    }
    const personPid = newId();
    queries.push(
      db.insert(participants).values({
        id: personPid,
        tripId: ledger.tripId,
        name: person.name,
        normalizedName: normalizeName(person.name),
        userId: person.userId,
        status: 'active',
        sortOrder: sql`(SELECT coalesce(max(sort_order), -1) + 1 FROM participants WHERE trip_id = ${ledger.tripId})`,
        createdByDevice: args.device,
        createdAt: now,
      }),
    );
    if (person.guestPid) {
      queries.push(db.insert(personLinks).values({ ownerUserId: args.ownerUserId, participantId: person.guestPid, personPid, createdAt: now }));
    }
    targets.set(LEDGER, { tripId: ledger.tripId, ownerPid: ledger.ownerPid, personPid });
  }

  const settlementId = newId();
  const metaJson = JSON.stringify({ settlementId });
  const status = args.recordedBy === 'owner' ? 'confirmed' : 'says_paid';
  const shares: (typeof transactionShares.$inferInsert)[] = [];
  const activities: (typeof activity.$inferInsert)[] = [];
  const tripIds = new Set<string>();

  for (const part of parts) {
    const target = targets.get(part.tripId)!;
    const fromId = part.fromOwner ? target.ownerPid : target.personPid;
    const toId = part.fromOwner ? target.personPid : target.ownerPid;
    const actorPid = args.recordedBy === 'owner' ? target.ownerPid : target.personPid;
    const paymentId = newId();
    tripIds.add(target.tripId);

    queries.push(
      db.insert(transactions).values({
        id: paymentId,
        rootId: paymentId,
        parentId: null,
        isLatest: 1,
        tripId: target.tripId,
        type: 'payment',
        description: '',
        amount: part.amount,
        amountConfirmed: status === 'confirmed' ? part.amount : null,
        currency: 'VND',
        spentOn: now.slice(0, 10),
        payerId: fromId,
        toId,
        splitMode: 'equal',
        status,
        rejectReason: null,
        notArrivedAt: null,
        disabledByUserId: null,
        createdByParticipantId: actorPid,
        createdByDevice: args.device,
        confirmedByParticipantId: status === 'confirmed' ? target.ownerPid : null,
        metaJson,
        createdAt: now,
        updatedAt: now,
      }),
    );
    shares.push({ transactionId: paymentId, participantId: toId, inputValue: part.amount, amount: part.amount });
    activities.push({
      id: newId(),
      tripId: target.tripId,
      actorParticipantId: actorPid,
      actorUserId: args.recordedBy === 'owner' ? args.ownerUserId : person.userId,
      actorDevice: args.device,
      action: 'payment_recorded',
      detailsJson: JSON.stringify({ fromId, toId, amount: part.amount, status, settlementId }),
      createdAt: now,
    });
  }

  for (const rows of chunks(shares, SHARE_ROWS_PER_INSERT)) queries.push(db.insert(transactionShares).values(rows));
  // Same as commitTripWrite, once per trip: the version bump invalidates each cached snapshot.
  queries.push(db.update(trips).set({ version: sql`${trips.version} + 1` }).where(inArray(trips.id, [...tripIds])));
  for (const rows of chunks(activities, ACTIVITY_ROWS_PER_INSERT)) queries.push(db.insert(activity).values(rows));

  await db.batch(asBatch(queries));
  return { settlementId, status };
}

interface SettlementPartRow {
  id: string;
  trip_id: string;
  amount: number;
  payer_id: string;
  to_id: string;
  status: string;
  owner_pid: string;
  archived_at: string | null;
}

/**
 * The owner confirms a guest-recorded settlement: every part still waiting (`says_paid`) is
 * confirmed at its amount, in one batch. The owner must be the receiver of at least one part; the
 * offsetting parts where the owner is the payer are confirmed with it, since the settlement is one
 * handover and the owner is the one accepting it.
 */
export async function confirmSettlement(db: Db, userId: string, settlementId: string): Promise<void> {
  const metaJson = JSON.stringify({ settlementId });
  const rows = await db.all<SettlementPartRow>(sql`
    SELECT t.id AS id, t.trip_id AS trip_id, t.amount AS amount, t.payer_id AS payer_id, t.to_id AS to_id,
           t.status AS status, o.id AS owner_pid, tr.archived_at AS archived_at
    FROM transactions t
    JOIN participants o ON o.trip_id = t.trip_id AND o.user_id = ${userId} AND o.status = 'active'
      AND (o.id = t.to_id OR o.id = t.payer_id)
    JOIN trips tr ON tr.id = t.trip_id
    WHERE t.meta_json = ${metaJson} AND t.type = 'payment' AND t.is_latest = 1
  `);
  if (rows.length === 0) throw new ApiError('NOT_FOUND', 404);
  if (!rows.some((r) => r.to_id === r.owner_pid)) throw new ApiError('FORBIDDEN', 403);

  const waiting = rows.filter((r) => r.status === 'says_paid');
  if (waiting.length === 0) throw new ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.');
  if (waiting.some((r) => r.archived_at !== null)) throw new ApiError('TRIP_ARCHIVED', 409, 'This trip is archived.');

  const now = nowIso();
  const queries: BatchItem<'sqlite'>[] = [];
  const activities: (typeof activity.$inferInsert)[] = [];
  for (const r of waiting) {
    queries.push(
      db
        .update(transactions)
        .set({ status: 'confirmed', amountConfirmed: r.amount, confirmedByParticipantId: r.owner_pid, updatedAt: now })
        .where(and(eq(transactions.id, r.id), eq(transactions.isLatest, 1), eq(transactions.status, 'says_paid'))),
      db
        .update(transactionShares)
        .set({ amount: r.amount })
        .where(and(eq(transactionShares.transactionId, r.id), eq(transactionShares.participantId, r.to_id))),
    );
    activities.push({
      id: newId(),
      tripId: r.trip_id,
      actorParticipantId: r.owner_pid,
      actorUserId: userId,
      actorDevice: null,
      action: 'payment_confirmed',
      detailsJson: JSON.stringify({ amount: r.amount, settlementId }),
      createdAt: now,
    });
  }
  const tripIds = [...new Set(waiting.map((r) => r.trip_id))];
  queries.push(db.update(trips).set({ version: sql`${trips.version} + 1` }).where(inArray(trips.id, tripIds)));
  for (const chunk of chunks(activities, ACTIVITY_ROWS_PER_INSERT)) queries.push(db.insert(activity).values(chunk));

  await db.batch(asBatch(queries));
}

async function parseJson<T>(c: Context): Promise<T> {
  try {
    return await c.req.json<T>();
  } catch {
    throw new ApiError('VALIDATION', 422, 'Invalid request');
  }
}

function parseKey(raw: string): PersonKey {
  if (/^[up]:.+$/.test(raw)) return raw as PersonKey;
  throw new ApiError('NOT_FOUND', 404);
}

export function settleRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  // "Paid in cash" (toOwner) and "I paid them" (fromOwner), recorded by the owner.
  app.post('/me/people/:key/settle', requireUser, async (c) => {
    const user = (await getSessionUser(c))!;
    const key = parseKey(c.req.param('key'));
    const body = await parseJson<{ paid?: unknown; direction?: unknown } | null>(c);
    if (!body || typeof body !== 'object' || typeof body.paid !== 'number' || (body.direction !== 'toOwner' && body.direction !== 'fromOwner')) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }
    const result = await createSettlement(getDb(c.env), {
      ownerUserId: user.id,
      key,
      paid: body.paid,
      direction: body.direction,
      recordedBy: 'owner',
      device: c.get('deviceHash') ?? null,
    });
    return c.json(result, 201);
  });

  app.post('/me/settlements/:sid/confirm', requireUser, async (c) => {
    const user = (await getSessionUser(c))!;
    await confirmSettlement(getDb(c.env), user.id, c.req.param('sid'));
    return c.body(null, 204);
  });

  return app;
}
