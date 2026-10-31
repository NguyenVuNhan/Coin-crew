import type { Context } from 'hono';
import { Hono } from 'hono';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { buildVietQrPayload, findBank, maskAccountNumber, MAX_AMOUNT, normalizeName, spreadSettlement, type PayInfo, type PersonKey } from '@fsl/core';
import type { AppBindings } from '../env';
import { getDb, type Db } from '../db/client';
import { activity, bankDetails, participants, personLinks, settlementKeys, transactions, transactionShares, trips, users } from '../db/schema';
import { getSessionUser, requireUser } from '../auth/session';
import { ApiError, isDbError } from '../lib/errors';
import { newId, nowIso } from '../lib/ids';
import { loadPersonItems, type PersonItems } from './balances';
import { ensurePersonalLedger, findLedger } from './ledger';
import { getOrCreateRefCode } from '../payments/refs';

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
  /** Client key for this submit (one per sheet open / page load); a repeat returns the first result. */
  idempotencyKey?: string | null;
  /** The pair, when the caller already loaded it in this invocation (skips a second load). */
  person?: PersonItems;
  /** D1 statements the caller already prepared in this invocation (counts toward the budget). */
  spent?: number;
}

export interface SettlementResult {
  settlementId: string;
  status: 'confirmed' | 'says_paid';
  /** True when the key had been used: nothing new was written. */
  replayed: boolean;
}

const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_-]{16,64}$/;

/** The body's `idempotencyKey`: absent (old clients) is null, anything malformed is 422. */
export function parseIdempotencyKey(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string' || !IDEMPOTENCY_KEY_RE.test(raw)) throw new ApiError('VALIDATION', 422, 'Invalid request');
  return raw;
}

/**
 * The settlement an idempotency key already made for this owner, or null when the key is new.
 * A key used for someone else's settlement is a conflict, never a lookup into their data.
 */
export async function settlementForKey(db: Db, key: string, ownerUserId: string): Promise<string | null> {
  const row = await db.all<{ settlement_id: string; owned: number }>(sql`
    SELECT k.settlement_id AS settlement_id,
      EXISTS (
        SELECT 1 FROM transactions t
        JOIN participants o ON o.trip_id = t.trip_id AND o.user_id = ${ownerUserId} AND o.id IN (t.payer_id, t.to_id)
        WHERE t.type = 'payment' AND json_extract(t.meta_json, '$.settlementId') = k.settlement_id
      ) AS owned
    FROM settlement_keys k WHERE k.key = ${key}
  `);
  const found = row[0];
  if (!found) return null;
  if (!found.owned) throw new ApiError('CONFLICT', 409, 'Invalid request');
  return found.settlement_id;
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
export async function createSettlement(db: Db, args: CreateSettlementArgs): Promise<SettlementResult> {
  if (!Number.isSafeInteger(args.paid) || args.paid < 1 || args.paid > MAX_AMOUNT) {
    throw new ApiError('VALIDATION', 422, 'Invalid amount');
  }
  if (args.direction !== 'toOwner' && args.direction !== 'fromOwner') {
    throw new ApiError('VALIDATION', 422, 'Invalid request');
  }
  const status = args.recordedBy === 'owner' ? 'confirmed' : 'says_paid';
  const key = args.idempotencyKey ?? null;
  let spent = args.spent ?? 0;

  if (key) {
    const existing = await settlementForKey(db, key, args.ownerUserId);
    spent += 1;
    if (existing) return { settlementId: existing, status, replayed: true };
  }

  const person = args.person ?? (await loadPersonItems(db, args.ownerUserId, args.key));
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
    (key ? 1 : 0) +
    parts.length + Math.ceil(parts.length / SHARE_ROWS_PER_INSERT) + 1 + Math.ceil(parts.length / ACTIVITY_ROWS_PER_INSERT) + ledgerRowCost;
  if (spent + person.queries + ledgerLookupCost + writeCost > SETTLE_QUERY_BUDGET) {
    if (person.rebuilt > 0) throw new ApiError('TRY_AGAIN', 409, 'Still adding things up. Try again.');
    throw new ApiError('VALIDATION', 422, 'Too many groups to settle at once.');
  }

  const now = nowIso();
  const settlementId = newId();
  // First in the batch: a repeat of the same submit fails here and nothing else is written.
  const queries: BatchItem<'sqlite'>[] = key ? [db.insert(settlementKeys).values({ key, settlementId, createdAt: now })] : [];

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

  const shares: (typeof transactionShares.$inferInsert)[] = [];
  const activities: (typeof activity.$inferInsert)[] = [];
  const tripIds = new Set<string>();

  for (const part of parts) {
    const target = targets.get(part.tripId)!;
    const fromId = part.fromOwner ? target.ownerPid : target.personPid;
    const toId = part.fromOwner ? target.personPid : target.ownerPid;
    const actorPid = args.recordedBy === 'owner' ? target.ownerPid : target.personPid;
    // The part that runs against the money handed over (§6a.2): no cash moved in that group, the
    // People total settled it. Marked so payment lists can say so.
    const offset = part.fromOwner !== (args.direction === 'fromOwner');
    const metaJson = JSON.stringify(offset ? { settlementId, offset: true } : { settlementId });
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
      detailsJson: JSON.stringify({ fromId, toId, amount: part.amount, status, settlementId, ...(offset ? { offset: true } : {}) }),
      createdAt: now,
    });
  }

  for (const rows of chunks(shares, SHARE_ROWS_PER_INSERT)) queries.push(db.insert(transactionShares).values(rows));
  // Same as commitTripWrite, once per trip: the version bump invalidates each cached snapshot.
  queries.push(db.update(trips).set({ version: sql`${trips.version} + 1` }).where(inArray(trips.id, [...tripIds])));
  for (const rows of chunks(activities, ACTIVITY_ROWS_PER_INSERT)) queries.push(db.insert(activity).values(rows));

  try {
    await db.batch(asBatch(queries));
  } catch (err) {
    if (key && isDbError(err, 'UNIQUE constraint failed: settlement_keys.key')) {
      // The same submit landed meanwhile (a double tap or a retry): answer with that settlement.
      const existing = await settlementForKey(db, key, args.ownerUserId);
      if (existing) return { settlementId: existing, status, replayed: true };
    }
    throw err;
  }
  return { settlementId, status, replayed: false };
}

interface SettlementPartRow {
  id: string;
  trip_id: string;
  amount: number;
  payer_id: string;
  to_id: string;
  status: string;
  created_by: string | null;
  owner_pid: string;
}

/**
 * The parts of a settlement still waiting (`says_paid`) that the caller may answer: the caller
 * must be the receiver of the real money, i.e. the waiting parts sum toward them, and must not
 * have recorded any of them (no confirming your own "I've paid", spec §5).
 */
async function waitingPartsToAnswer(db: Db, userId: string, settlementId: string): Promise<SettlementPartRow[]> {
  const rows = await db.all<SettlementPartRow>(sql`
    SELECT t.id AS id, t.trip_id AS trip_id, t.amount AS amount, t.payer_id AS payer_id, t.to_id AS to_id,
           t.status AS status, t.created_by_participant_id AS created_by, o.id AS owner_pid
    FROM transactions t
    JOIN participants o ON o.trip_id = t.trip_id AND o.user_id = ${userId} AND o.status = 'active'
      AND (o.id = t.to_id OR o.id = t.payer_id)
    WHERE json_extract(t.meta_json, '$.settlementId') = ${settlementId} AND t.type = 'payment' AND t.is_latest = 1
  `);
  if (rows.length === 0) throw new ApiError('NOT_FOUND', 404);

  const waiting = rows.filter((r) => r.status === 'says_paid');
  if (waiting.length === 0) throw new ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.');
  if (waiting.some((r) => r.created_by === r.owner_pid)) throw new ApiError('FORBIDDEN', 403);
  const towardMe = waiting.reduce((sum, r) => sum + (r.to_id === r.owner_pid ? r.amount : -r.amount), 0);
  if (towardMe <= 0) throw new ApiError('FORBIDDEN', 403);
  return waiting;
}

/**
 * The receiver confirms a guest-recorded settlement: every part still waiting (`says_paid`) is
 * confirmed at its amount, in one batch. The offsetting parts where the receiver is the payer are
 * confirmed with it, since the settlement is one handover and the receiver is the one accepting it.
 * Parts in a group archived since are confirmed too: confirming only settles a status the
 * settlement already counted, and refusing would leave the settlement waiting for good.
 */
export async function confirmSettlement(db: Db, userId: string, settlementId: string): Promise<void> {
  const waiting = await waitingPartsToAnswer(db, userId, settlementId);

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
  await commitParts(db, queries, waiting, activities);
}

/**
 * The receiver says a waiting "I've paid" never arrived: every part still waiting is disabled
 * (as disabling a payment does), with an activity row in each group, in one batch.
 */
export async function rejectSettlement(db: Db, userId: string, settlementId: string): Promise<void> {
  const waiting = await waitingPartsToAnswer(db, userId, settlementId);

  const now = nowIso();
  const queries: BatchItem<'sqlite'>[] = [];
  const activities: (typeof activity.$inferInsert)[] = [];
  for (const r of waiting) {
    queries.push(
      db
        .update(transactions)
        .set({ status: 'disabled', updatedAt: now })
        .where(and(eq(transactions.id, r.id), eq(transactions.isLatest, 1), eq(transactions.status, 'says_paid'))),
    );
    activities.push({
      id: newId(),
      tripId: r.trip_id,
      actorParticipantId: r.owner_pid,
      actorUserId: userId,
      actorDevice: null,
      action: 'payment_disabled',
      detailsJson: JSON.stringify({ amount: r.amount, settlementId, notReceived: true }),
      createdAt: now,
    });
  }
  await commitParts(db, queries, waiting, activities);
}

/** One version bump per touched trip and the activity rows, in the same batch as the part updates. */
async function commitParts(
  db: Db,
  queries: BatchItem<'sqlite'>[],
  parts: SettlementPartRow[],
  activities: (typeof activity.$inferInsert)[],
): Promise<void> {
  const tripIds = [...new Set(parts.map((r) => r.trip_id))];
  queries.push(db.update(trips).set({ version: sql`${trips.version} + 1` }).where(inArray(trips.id, tripIds)));
  for (const chunk of chunks(activities, ACTIVITY_ROWS_PER_INSERT)) queries.push(db.insert(activity).values(chunk));
  await db.batch(asBatch(queries));
}

/**
 * How the owner pays the person the netted total they owe (spec goal 6, "Settle up"): the person's
 * approved bank details as a VietQR for `-total`. The receiving participant and the transfer note
 * come from the group where the owner owes the most. Amount 0 (and no bank) when nothing is owed.
 */
export async function personPayInfo(db: Db, userId: string, key: PersonKey): Promise<PayInfo> {
  const person = await loadPersonItems(db, userId, key);
  if (!person) throw new ApiError('NOT_FOUND', 404);
  const total = person.items.reduce((sum, i) => sum + i.amount, 0);
  const amount = total < 0 ? -total : 0;
  const most = person.items.reduce<(typeof person.items)[number] | undefined>((m, i) => (i.amount < 0 && (!m || i.amount < m.amount) ? i : m), undefined);
  const to = most ?? person.ledger;
  const nothing: PayInfo = { to: { id: to?.personPid ?? '', name: person.name }, amount: 0, bankState: 'none', bank: null, refCode: '', payload: null, inFlight: [] };
  if (amount === 0 || !most) return nothing;

  const approved = person.userId
    ? await db.select().from(bankDetails).where(and(eq(bankDetails.userId, person.userId), eq(bankDetails.status, 'approved'))).get()
    : await db
        .select()
        .from(bankDetails)
        .where(and(
          inArray(bankDetails.participantId, [...new Set([most.personPid, ...person.items.map((i) => i.personPid), ...(person.ledger ? [person.ledger.personPid] : [])])].slice(0, 50)),
          eq(bankDetails.status, 'approved'),
        ))
        .get();
  const refCode = await getOrCreateRefCode(db, { id: most.tripId, name: most.tripName }, most.ownerPid, most.personPid);
  if (!approved) return { ...nothing, amount, refCode };
  return {
    to: { id: most.personPid, name: person.name },
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
    payload: buildVietQrPayload({ bin: approved.bin, accountNumber: approved.accountNumber, amount, note: refCode }),
    inFlight: [],
  };
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
    const body = await parseJson<{ paid?: unknown; direction?: unknown; idempotencyKey?: unknown } | null>(c);
    if (!body || typeof body !== 'object' || typeof body.paid !== 'number' || (body.direction !== 'toOwner' && body.direction !== 'fromOwner')) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }
    const { replayed, ...result } = await createSettlement(getDb(c.env), {
      ownerUserId: user.id,
      key,
      paid: body.paid,
      direction: body.direction,
      recordedBy: 'owner',
      device: c.get('deviceHash') ?? null,
      idempotencyKey: parseIdempotencyKey(body.idempotencyKey),
    });
    return c.json(result, replayed ? 200 : 201);
  });

  // "Settle up": the person's VietQR for the netted total the owner owes them.
  app.get('/me/people/:key/pay', requireUser, async (c) => {
    const user = (await getSessionUser(c))!;
    return c.json<PayInfo>(await personPayInfo(getDb(c.env), user.id, parseKey(c.req.param('key'))));
  });

  app.post('/me/settlements/:sid/confirm', requireUser, async (c) => {
    const user = (await getSessionUser(c))!;
    await confirmSettlement(getDb(c.env), user.id, c.req.param('sid'));
    return c.body(null, 204);
  });

  // "Not received": the receiver turns down a waiting "I've paid".
  app.post('/me/settlements/:sid/reject', requireUser, async (c) => {
    const user = (await getSessionUser(c))!;
    await rejectSettlement(getDb(c.env), user.id, c.req.param('sid'));
    return c.body(null, 204);
  });

  return app;
}
