import type { Context } from 'hono';
import { Hono } from 'hono';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import type {
  ExpenseInput,
  ExpenseMeta,
  ExpenseSportMeta,
  ExpenseStatus,
  FundItem,
  SplitEntry,
  SplitMode,
  SportParticipantEntry,
  SportRule,
} from '@fsl/core';
import {
  computeShares,
  computeSportShares,
  initialExpenseStatus,
  isFundPaid,
  MAX_AMOUNT,
} from '@fsl/core';
import type { AppBindings } from '../env';
import { getDb, type Db } from '../db/client';
import { participants, transactions, transactionShares } from '../db/schema';
import { assertWritable, resolveActor, type ResolvedActor } from '../access/actor';
import { ensure } from '../access/guard';
import { assertFundCovers, assertSportGroup, currentFundBalance } from '../fund/check';
import { commitTripWrite } from '../lib/commit';
import { ApiError } from '../lib/errors';
import { newId, nowIso } from '../lib/ids';

async function parseJson<T>(c: Context): Promise<T> {
  try {
    return await c.req.json<T>();
  } catch {
    throw new ApiError('VALIDATION', 422, 'Invalid request');
  }
}

const SPLIT_MODES: ReadonlySet<SplitMode> = new Set([
  'equal',
  'amounts',
  'percent',
  'shares',
  'adjust',
]);

interface ValidatedExpense {
  description: string;
  amount: number;
  spentOn: string;
  payerId: string;
  mode: SplitMode;
  shares: { participantId: string; inputValue: number; inputAuto: 0 | 1; amount: number }[];
  meta?: ExpenseMeta | null;
}

/** `allowedLeftIds`: people who left but are already on the expense being edited, so they may stay on it. */
async function validateExpenseInput(
  db: Db,
  tripId: string,
  body: unknown,
  allowedLeftIds: ReadonlySet<string>,
): Promise<ValidatedExpense> {
  if (!body || typeof body !== 'object') {
    throw new ApiError('VALIDATION', 422, 'Invalid request');
  }

  const input = body as Record<string, unknown>;

  if (typeof input.description !== 'string') {
    throw new ApiError('VALIDATION', 422, 'Invalid description');
  }
  const description = input.description.trim();
  if (description.length < 1 || description.length > 80) {
    throw new ApiError('VALIDATION', 422, 'Description must be 1 to 80 characters');
  }

  if (typeof input.amount !== 'number') {
    throw new ApiError('VALIDATION', 422, 'INVALID_AMOUNT');
  }
  const amount = input.amount;

  if (typeof input.spentOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.spentOn)) {
    throw new ApiError('VALIDATION', 422, 'Invalid spentOn');
  }
  const spentOn = input.spentOn;

  if (typeof input.mode !== 'string' || !SPLIT_MODES.has(input.mode as SplitMode)) {
    throw new ApiError('VALIDATION', 422, 'Invalid split mode');
  }
  const mode = input.mode as SplitMode;

  if (typeof input.payerId !== 'string') {
    throw new ApiError('VALIDATION', 422, 'Invalid payer');
  }
  const payerId = input.payerId;

  if (!Array.isArray(input.entries)) {
    throw new ApiError('VALIDATION', 422, 'Invalid entries');
  }

  const seenIds = new Set<string>();
  const entries: SplitEntry[] = [];
  for (const entry of input.entries) {
    if (!entry || typeof entry !== 'object') {
      throw new ApiError('VALIDATION', 422, 'Invalid entry');
    }
    const pid = (entry as Record<string, unknown>).participantId;
    const val = (entry as Record<string, unknown>).value;
    // A null value is a blank box; core says which split modes allow one.
    if (typeof pid !== 'string' || (typeof val !== 'number' && val !== null)) {
      throw new ApiError('VALIDATION', 422, 'Invalid entry');
    }
    if (seenIds.has(pid)) {
      throw new ApiError('VALIDATION', 422, 'Duplicate participant in entries');
    }
    seenIds.add(pid);
    entries.push({ participantId: pid, value: val });
  }

  // Paid from the group fund: the whole amount came out of group money, so there is no split and nobody gets a share (spec §6.2).
  const paidFromFund =
    input.meta && typeof input.meta === 'object' ? (input.meta as Record<string, unknown>).paidFromFund : undefined;
  if (paidFromFund !== undefined && paidFromFund !== true) {
    throw new ApiError('VALIDATION', 422, 'Invalid paidFromFund');
  }
  if (paidFromFund === true) {
    const sport = (input.meta as Record<string, unknown>).sport;
    if (entries.length > 0 || mode !== 'equal' || (sport !== undefined && sport !== null)) {
      throw new ApiError('VALIDATION', 422, 'A fund-paid expense has no split');
    }
    // computeShares is skipped, so the amount gets its check here.
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > MAX_AMOUNT) {
      throw new ApiError('VALIDATION', 422, 'INVALID_AMOUNT');
    }
    // The request's payerId is ignored: the handler records the admin who wrote it.
    return { description, amount, spentOn, payerId, mode, shares: [], meta: { paidFromFund: true } };
  }

  const tripParticipants = await db
    .select()
    .from(participants)
    .where(
      and(
        eq(participants.tripId, tripId),
        inArray(participants.status, ['active', 'pending', 'left']),
      ),
    );

  const participantMap = new Map(
    tripParticipants.filter((p) => p.status !== 'left' || allowedLeftIds.has(p.id)).map((p) => [p.id, p]),
  );
  // Someone who left can't be put on an expense. Usually the form was opened before they left, so say so plainly.
  const leftIds = new Set(tripParticipants.filter((p) => !participantMap.has(p.id)).map((p) => p.id));
  const personLeft = () => new ApiError('PERSON_LEFT', 409, 'Someone on this expense has left the group.');

  if (!participantMap.has(payerId)) {
    if (leftIds.has(payerId)) throw personLeft();
    throw new ApiError('VALIDATION', 422, 'Invalid payer');
  }

  for (const entry of entries) {
    if (!participantMap.has(entry.participantId)) {
      if (leftIds.has(entry.participantId)) throw personLeft();
      throw new ApiError('VALIDATION', 422, 'Invalid participant in entries');
    }
  }

  const sortedEntries = [...entries].sort((a, b) => {
    const pA = participantMap.get(a.participantId);
    const pB = participantMap.get(b.participantId);
    return (pA?.sortOrder ?? 0) - (pB?.sortOrder ?? 0);
  });

  const r = computeShares(amount, mode, sortedEntries);
  if (!r.ok) {
    throw new ApiError('VALIDATION', 422, r.error);
  }

  let meta: ExpenseMeta | null = null;
  if (input.meta !== undefined && input.meta !== null) {
    if (typeof input.meta !== 'object' || Array.isArray(input.meta)) {
      throw new ApiError('VALIDATION', 422, 'Invalid meta');
    }
    const rawMeta = input.meta as Record<string, unknown>;
    if (rawMeta.sport !== undefined && rawMeta.sport !== null) {
      if (typeof rawMeta.sport !== 'object' || Array.isArray(rawMeta.sport)) {
        throw new ApiError('VALIDATION', 422, 'Invalid sport meta');
      }
      if (mode !== 'amounts') {
        throw new ApiError('VALIDATION', 422, 'Sport meta requires amounts mode');
      }
      const sport = rawMeta.sport as Record<string, unknown>;
      if (!Number.isSafeInteger(sport.court) || (sport.court as number) < 0) {
        throw new ApiError('VALIDATION', 422, 'Invalid court amount');
      }
      if (!Number.isSafeInteger(sport.extra) || (sport.extra as number) < 0) {
        throw new ApiError('VALIDATION', 422, 'Invalid extra amount');
      }
      if (!Array.isArray(sport.shuttlecocks) || sport.shuttlecocks.length > 5) {
        throw new ApiError('VALIDATION', 422, 'Invalid shuttlecocks');
      }
      for (const item of sport.shuttlecocks) {
        if (!item || typeof item !== 'object') {
          throw new ApiError('VALIDATION', 422, 'Invalid shuttlecock item');
        }
        const { qty, unitPrice } = item as { qty: unknown; unitPrice: unknown };
        if (
          !Number.isSafeInteger(qty) ||
          (qty as number) < 0 ||
          !Number.isSafeInteger(unitPrice) ||
          (unitPrice as number) < 0
        ) {
          throw new ApiError('VALIDATION', 422, 'Invalid shuttlecock item values');
        }
      }
      const shuttlecockTotal = (sport.shuttlecocks as { qty: number; unitPrice: number }[]).reduce(
        (sum, item) => sum + item.qty * item.unitPrice,
        0,
      );
      if ((sport.court as number) + (sport.extra as number) + shuttlecockTotal !== amount) {
        throw new ApiError('VALIDATION', 422, 'Sport breakdown does not equal total amount');
      }

      const sportRes = computeSportShares(
        amount,
        sport.rule as SportRule,
        sport.entries as SportParticipantEntry[],
      );
      if (!sportRes.ok) {
        throw new ApiError('VALIDATION', 422, sportRes.error);
      }
      if (
        sportRes.maleSlotRate !== sport.maleSlotRate ||
        sportRes.femaleSlotRate !== sport.femaleSlotRate
      ) {
        throw new ApiError('VALIDATION', 422, 'Sport slot rates mismatch');
      }
      if (sportRes.shares.length !== r.shares.length) {
        throw new ApiError('VALIDATION', 422, 'Sport shares length mismatch');
      }
      const rMap = new Map(r.shares.map((s) => [s.participantId, s.amount]));
      for (const s of sportRes.shares) {
        if (rMap.get(s.participantId) !== s.amount) {
          throw new ApiError('VALIDATION', 422, 'Sport shares mismatch with expense shares');
        }
      }
      meta = { sport: sport as unknown as ExpenseSportMeta };
    } else {
      meta = rawMeta as ExpenseMeta;
    }
  }

  const entryValueMap = new Map(sortedEntries.map((e) => [e.participantId, e.value]));
  const shares = r.shares.map((sh) => {
    const value = entryValueMap.get(sh.participantId);
    // A blank box is kept as automatic, so editing opens it blank and re-divides what is left.
    if (value === null) return { participantId: sh.participantId, inputValue: 0, inputAuto: 1 as const, amount: sh.amount };
    return { participantId: sh.participantId, inputValue: mode === 'equal' ? 1 : (value ?? 1), inputAuto: 0 as const, amount: sh.amount };
  });

  return {
    description,
    amount,
    spentOn,
    payerId,
    mode,
    shares,
    meta,
  };
}

/** Approving (or re-enabling) an expense that involves a name still waiting for approval is refused (spec §6.2). */
async function assertNoPendingPeople(db: Db, tripId: string, expenseId: string, payerId: string): Promise<void> {
  const pending = await db
    .select({ id: participants.id })
    .from(participants)
    .where(
      and(
        eq(participants.tripId, tripId),
        eq(participants.status, 'pending'),
        or(
          eq(participants.id, payerId),
          inArray(participants.id, db.select({ id: transactionShares.participantId }).from(transactionShares).where(eq(transactionShares.transactionId, expenseId))),
        ),
      ),
    )
    .limit(1);
  if (pending.length > 0) throw new ApiError('PERSON_PENDING', 409, 'Approve the new name first.');
}

/** Every write on a fund-paid expense needs a sport group and `manage_fund`, on top of the usual rules (spec §6.2). */
function ensureFundWrite(actor: ResolvedActor): void {
  assertSportGroup(actor.trip);
  ensure(actor, 'manage_fund');
}

/** A stored expense row as the fund sees it; `status` is the one it is about to take, if that differs. */
function fundItemOf(row: { amount: number; status: string; metaJson: string | null }, status = row.status): FundItem {
  return { kind: 'expense', amount: row.amount, status, meta: row.metaJson ? (JSON.parse(row.metaJson) as ExpenseMeta) : null };
}

export function expenseRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  // POST /trips/:id/expenses
  app.post('/trips/:id/expenses', async (c) => {
    const tripId = c.req.param('id');
    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);
    ensure(actor, 'add_expense');

    const participantId = actor.participantId;
    if (!participantId) {
      throw new ApiError('FORBIDDEN', 403, 'Pick your name first.');
    }

    const db = getDb(c.env);

    if (actor.kind === 'guest') {
      const pendingCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(transactions)
        .where(
          and(
            eq(transactions.tripId, tripId),
            eq(transactions.type, 'expense'),
            eq(transactions.isLatest, 1),
            eq(transactions.status, 'pending'),
          ),
        )
        .get();

      if ((pendingCount?.count ?? 0) >= 50) {
        throw new ApiError('RATE_LIMITED', 429);
      }
    }

    const body = await parseJson<ExpenseInput>(c);
    const validated = await validateExpenseInput(db, tripId, body, new Set());
    const fundPaid = isFundPaid(validated);
    if (fundPaid) ensureFundWrite(actor);

    const status = initialExpenseStatus(actor);
    if (fundPaid) {
      const after: FundItem = { kind: 'expense', amount: validated.amount, status, meta: validated.meta };
      assertFundCovers(await currentFundBalance(db, tripId), null, after);
    }
    const expenseId = newId();
    const now = nowIso();

    const insertExpense = db.insert(transactions).values({
      id: expenseId,
      rootId: expenseId,
      parentId: null,
      isLatest: 1,
      tripId,
      type: 'expense',
      description: validated.description,
      amount: validated.amount,
      amountConfirmed: null,
      currency: 'VND',
      spentOn: validated.spentOn,
      // Nobody paid a fund-paid expense personally; the column holds the admin who recorded it.
      payerId: fundPaid ? participantId : validated.payerId,
      toId: null,
      splitMode: validated.mode,
      status,
      rejectReason: null,
      notArrivedAt: null,
      disabledByUserId: null,
      createdByParticipantId: participantId,
      createdByDevice: actor.deviceHash,
      confirmedByParticipantId: null,
      metaJson: validated.meta ? JSON.stringify(validated.meta) : null,
      createdAt: now,
      updatedAt: now,
    });

    const insertShares = validated.shares.map((sh) =>
      db.insert(transactionShares).values({
        transactionId: expenseId,
        participantId: sh.participantId,
        inputValue: sh.inputValue,
        inputAuto: sh.inputAuto,
        amount: sh.amount,
      }),
    );

    await commitTripWrite(db, tripId, [insertExpense, ...insertShares], {
      action: 'expense_added',
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details: {
        description: validated.description,
        amount: validated.amount,
        ...(fundPaid ? { paidFromFund: true } : {}),
      },
    });

    return c.json({ expenseId }, 201);
  });

  // PATCH /trips/:id/expenses/:eid
  app.patch('/trips/:id/expenses/:eid', async (c) => {
    const tripId = c.req.param('id');
    const eid = c.req.param('eid');
    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);

    const db = getDb(c.env);
    const head = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.tripId, tripId),
          eq(transactions.type, 'expense'),
          eq(transactions.isLatest, 1),
          or(eq(transactions.id, eid), eq(transactions.rootId, eid)),
        ),
      )
      .get();

    if (!head) {
      throw new ApiError('NOT_FOUND', 404);
    }

    const headItem = fundItemOf(head);
    if (isFundPaid(headItem)) ensureFundWrite(actor);

    ensure(actor, 'edit_expense', {
      expenseCreatedById: head.createdByParticipantId,
      expenseStatus: head.status as ExpenseStatus,
    });

    const body = await parseJson<ExpenseInput>(c);
    const currentShares = await db
      .select({ participantId: transactionShares.participantId })
      .from(transactionShares)
      .where(eq(transactionShares.transactionId, head.id));
    const onExpense = new Set([head.payerId, ...currentShares.map((s) => s.participantId)]);
    const validated = await validateExpenseInput(db, tripId, body, onExpense);
    const fundPaid = isFundPaid(validated);
    if (fundPaid) ensureFundWrite(actor);
    // The new version keeps the head's status, and fund-paid expenses are never pending (spec §3).
    if (fundPaid && head.status === 'pending') {
      throw new ApiError('VALIDATION', 422, 'A pending expense cannot be paid from the group fund.');
    }

    // The expense's own amount is available again, so editing it within that is fine (spec §9.2).
    if (fundPaid || isFundPaid(headItem)) {
      const after: FundItem = { kind: 'expense', amount: validated.amount, status: head.status, meta: validated.meta };
      assertFundCovers(await currentFundBalance(db, tripId), headItem, after);
    }

    const newHeadId = newId();
    const now = nowIso();

    const supersedeOld = db
      .update(transactions)
      .set({
        status: 'superseded',
        isLatest: 0,
        updatedAt: now,
      })
      .where(
        and(
          eq(transactions.id, head.id),
          eq(transactions.tripId, tripId),
          eq(transactions.isLatest, 1),
        ),
      );

    const insertNewHead = db.insert(transactions).values({
      id: newHeadId,
      rootId: head.rootId,
      parentId: head.id,
      isLatest: 1,
      tripId,
      type: 'expense',
      description: validated.description,
      amount: validated.amount,
      amountConfirmed: null,
      currency: 'VND',
      spentOn: validated.spentOn,
      payerId: fundPaid ? actor.participantId! : validated.payerId,
      toId: null,
      splitMode: validated.mode,
      status: head.status,
      rejectReason: head.rejectReason,
      notArrivedAt: null,
      disabledByUserId: head.disabledByUserId,
      createdByParticipantId: actor.participantId!,
      createdByDevice: actor.deviceHash,
      confirmedByParticipantId: head.confirmedByParticipantId,
      metaJson: validated.meta ? JSON.stringify(validated.meta) : null,
      createdAt: now,
      updatedAt: now,
    });

    const insertShares = validated.shares.map((sh) =>
      db.insert(transactionShares).values({
        transactionId: newHeadId,
        participantId: sh.participantId,
        inputValue: sh.inputValue,
        inputAuto: sh.inputAuto,
        amount: sh.amount,
      }),
    );

    await commitTripWrite(db, tripId, [supersedeOld, insertNewHead, ...insertShares], {
      action: 'expense_edited',
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details: {
        description: validated.description,
        amount: validated.amount,
        ...(fundPaid ? { paidFromFund: true } : {}),
      },
    });

    return c.json({ expenseId: newHeadId, rootId: head.rootId }, 200);
  });

  // POST /trips/:id/expenses/:eid/rollback
  app.post('/trips/:id/expenses/:eid/rollback', async (c) => {
    const tripId = c.req.param('id');
    const eid = c.req.param('eid');
    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);

    const db = getDb(c.env);
    const head = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.tripId, tripId),
          eq(transactions.type, 'expense'),
          eq(transactions.isLatest, 1),
          or(eq(transactions.id, eid), eq(transactions.rootId, eid)),
        ),
      )
      .get();

    if (!head) {
      throw new ApiError('NOT_FOUND', 404);
    }

    const headItem = fundItemOf(head);
    if (isFundPaid(headItem)) ensureFundWrite(actor);

    ensure(actor, 'edit_expense', {
      expenseCreatedById: head.createdByParticipantId,
      expenseStatus: head.status as ExpenseStatus,
    });

    const body = await parseJson<{ targetHistoryId?: unknown }>(c);
    if (!body || typeof body.targetHistoryId !== 'string') {
      throw new ApiError('VALIDATION', 422, 'Invalid targetHistoryId');
    }
    const targetHistoryId = body.targetHistoryId;

    const targetRow = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.tripId, tripId),
          eq(transactions.type, 'expense'),
          eq(transactions.id, targetHistoryId),
          eq(transactions.rootId, head.rootId),
          eq(transactions.isLatest, 0),
        ),
      )
      .get();

    if (!targetRow) {
      throw new ApiError('NOT_FOUND', 404, 'Historical version not found');
    }

    // The new latest copies the target (its meta included) but keeps the current status.
    const targetItem = fundItemOf(targetRow, head.status);
    if (isFundPaid(targetItem)) ensureFundWrite(actor);
    if (isFundPaid(targetItem) && head.status === 'pending') {
      throw new ApiError('VALIDATION', 422, 'A pending expense cannot be paid from the group fund.');
    }
    if (isFundPaid(headItem) || isFundPaid(targetItem)) {
      assertFundCovers(await currentFundBalance(db, tripId), headItem, targetItem);
    }

    const targetShares = await db
      .select()
      .from(transactionShares)
      .where(eq(transactionShares.transactionId, targetHistoryId));

    const newHeadId = newId();
    const now = nowIso();

    const supersedeOld = db
      .update(transactions)
      .set({
        status: 'superseded',
        isLatest: 0,
        updatedAt: now,
      })
      .where(
        and(
          eq(transactions.id, head.id),
          eq(transactions.tripId, tripId),
          eq(transactions.isLatest, 1),
        ),
      );

    const insertNewHead = db.insert(transactions).values({
      id: newHeadId,
      rootId: head.rootId,
      parentId: head.id,
      isLatest: 1,
      tripId,
      type: 'expense',
      description: targetRow.description,
      amount: targetRow.amount,
      amountConfirmed: null,
      currency: targetRow.currency,
      spentOn: targetRow.spentOn,
      payerId: targetRow.payerId,
      toId: null,
      splitMode: targetRow.splitMode,
      status: head.status,
      rejectReason: head.rejectReason,
      notArrivedAt: null,
      disabledByUserId: head.disabledByUserId,
      createdByParticipantId: actor.participantId!,
      createdByDevice: actor.deviceHash,
      confirmedByParticipantId: head.confirmedByParticipantId,
      metaJson: targetRow.metaJson,
      createdAt: now,
      updatedAt: now,
    });

    const insertNewShares = targetShares.map((sh) =>
      db.insert(transactionShares).values({
        transactionId: newHeadId,
        participantId: sh.participantId,
        inputValue: sh.inputValue,
        inputAuto: sh.inputAuto,
        amount: sh.amount,
      }),
    );

    await commitTripWrite(db, tripId, [supersedeOld, insertNewHead, ...insertNewShares], {
      action: 'expense_rolled_back',
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details: {
        description: targetRow.description,
        amount: targetRow.amount,
        targetHistoryId,
      },
    });

    return c.json({ expenseId: newHeadId, rootId: head.rootId }, 200);
  });

  // DELETE /trips/:id/expenses/:eid
  app.delete('/trips/:id/expenses/:eid', async (c) => {
    const tripId = c.req.param('id');
    const eid = c.req.param('eid');
    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);

    const db = getDb(c.env);
    const head = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.tripId, tripId),
          eq(transactions.type, 'expense'),
          eq(transactions.isLatest, 1),
          or(eq(transactions.id, eid), eq(transactions.rootId, eid)),
        ),
      )
      .get();

    if (!head) {
      throw new ApiError('NOT_FOUND', 404);
    }

    // Deleting only returns money to the fund, so it needs no fund check.
    if (isFundPaid(fundItemOf(head))) ensureFundWrite(actor);

    ensure(actor, 'delete_expense', {
      expenseCreatedById: head.createdByParticipantId,
      expenseStatus: head.status as ExpenseStatus,
    });

    const rootTxIds = db
      .select({ id: transactions.id })
      .from(transactions)
      .where(and(eq(transactions.tripId, tripId), eq(transactions.rootId, head.rootId)));

    const deleteShares = db
      .delete(transactionShares)
      .where(inArray(transactionShares.transactionId, rootTxIds));

    const deleteTransactions = db
      .delete(transactions)
      .where(and(eq(transactions.tripId, tripId), eq(transactions.rootId, head.rootId)));

    await commitTripWrite(db, tripId, [deleteShares, deleteTransactions], {
      action: 'expense_deleted',
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details: {
        description: head.description,
        amount: head.amount,
        payerId: head.payerId,
        spentOn: head.spentOn,
        status: head.status,
      },
    });

    return c.body(null, 204);
  });

async function isExpenseInvolved(db: Db, eid: string, payerId: string, participantId: string | null): Promise<boolean> {
  if (participantId === null) return false;
  if (payerId === participantId) return true;
  const share = await db
    .select({ participantId: transactionShares.participantId })
    .from(transactionShares)
    .where(
      and(
        eq(transactionShares.transactionId, eid),
        eq(transactionShares.participantId, participantId),
      ),
    )
    .get();
  return Boolean(share);
}

  // POST /trips/:id/expenses/:eid/approve
  app.post('/trips/:id/expenses/:eid/approve', async (c) => {
    const tripId = c.req.param('id');
    const eid = c.req.param('eid');
    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);

    const db = getDb(c.env);
    const head = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.tripId, tripId),
          eq(transactions.type, 'expense'),
          eq(transactions.isLatest, 1),
          or(eq(transactions.id, eid), eq(transactions.rootId, eid)),
        ),
      )
      .get();

    if (!head) {
      throw new ApiError('NOT_FOUND', 404);
    }

    // Fund-paid expenses are never pending now, but older data could hold one: approving it spends from the fund.
    const headItem = fundItemOf(head);
    if (isFundPaid(headItem)) ensureFundWrite(actor);

    const expenseInvolved = await isExpenseInvolved(db, head.id, head.payerId, actor.participantId);
    ensure(actor, 'approve_expense', { expenseInvolved });

    if (head.status !== 'pending') {
      throw new ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.');
    }

    await assertNoPendingPeople(db, tripId, head.id, head.payerId);
    if (isFundPaid(headItem)) {
      assertFundCovers(await currentFundBalance(db, tripId), null, fundItemOf(head, 'approved'));
    }

    const now = nowIso();
    const r = await db
      .update(transactions)
      .set({ status: 'approved', updatedAt: now })
      .where(
        and(
          eq(transactions.id, head.id),
          eq(transactions.tripId, tripId),
          eq(transactions.isLatest, 1),
          eq(transactions.status, 'pending'),
        ),
      )
      .run();

    if (r.meta.changes === 0) {
      throw new ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.');
    }

    await commitTripWrite(db, tripId, [], {
      action: 'expense_approved',
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details: { description: head.description },
    });

    return c.body(null, 204);
  });

  // POST /trips/:id/expenses/:eid/reject
  app.post('/trips/:id/expenses/:eid/reject', async (c) => {
    const tripId = c.req.param('id');
    const eid = c.req.param('eid');
    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);

    const db = getDb(c.env);
    const head = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.tripId, tripId),
          eq(transactions.type, 'expense'),
          eq(transactions.isLatest, 1),
          or(eq(transactions.id, eid), eq(transactions.rootId, eid)),
        ),
      )
      .get();

    if (!head) {
      throw new ApiError('NOT_FOUND', 404);
    }

    const expenseInvolved = await isExpenseInvolved(db, head.id, head.payerId, actor.participantId);
    ensure(actor, 'approve_expense', { expenseInvolved });

    if (head.status !== 'pending') {
      throw new ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.');
    }

    const body = await parseJson<{ reason?: unknown }>(c);
    if (typeof body?.reason !== 'string') {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    const reason = body.reason.trim();
    if (reason.length < 1 || reason.length > 140) {
      throw new ApiError('VALIDATION', 422, 'Reason must be 1 to 140 characters');
    }

    const now = nowIso();
    const r = await db
      .update(transactions)
      .set({ status: 'rejected', rejectReason: reason, updatedAt: now })
      .where(
        and(
          eq(transactions.id, head.id),
          eq(transactions.tripId, tripId),
          eq(transactions.isLatest, 1),
          eq(transactions.status, 'pending'),
        ),
      )
      .run();

    if (r.meta.changes === 0) {
      throw new ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.');
    }

    await commitTripWrite(db, tripId, [], {
      action: 'expense_rejected',
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details: { description: head.description, reason },
    });

    return c.body(null, 204);
  });

  // POST /trips/:id/expenses/:eid/disable
  app.post('/trips/:id/expenses/:eid/disable', async (c) => {
    const tripId = c.req.param('id');
    const eid = c.req.param('eid');
    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);

    const db = getDb(c.env);
    const head = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.tripId, tripId),
          eq(transactions.type, 'expense'),
          eq(transactions.isLatest, 1),
          or(eq(transactions.id, eid), eq(transactions.rootId, eid)),
        ),
      )
      .get();

    if (!head) {
      throw new ApiError('NOT_FOUND', 404);
    }

    // Disabling only returns money to the fund, so it needs no fund check.
    if (isFundPaid(fundItemOf(head))) ensureFundWrite(actor);

    const expenseInvolved = await isExpenseInvolved(db, head.id, head.payerId, actor.participantId);
    ensure(actor, 'disable', { expenseInvolved });

    const now = nowIso();
    const r = await db
      .update(transactions)
      .set({
        status: 'disabled',
        disabledByUserId: actor.userId,
        updatedAt: now,
      })
      .where(
        and(
          eq(transactions.id, head.id),
          eq(transactions.tripId, tripId),
          eq(transactions.isLatest, 1),
          inArray(transactions.status, ['approved', 'pending']),
        ),
      )
      .run();

    if (r.meta.changes === 0) {
      throw new ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.');
    }

    await commitTripWrite(db, tripId, [], {
      action: 'expense_disabled',
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details: {},
    });

    return c.body(null, 204);
  });

  // POST /trips/:id/expenses/:eid/enable
  app.post('/trips/:id/expenses/:eid/enable', async (c) => {
    const tripId = c.req.param('id');
    const eid = c.req.param('eid');
    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);

    const db = getDb(c.env);
    const head = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.tripId, tripId),
          eq(transactions.type, 'expense'),
          eq(transactions.isLatest, 1),
          or(eq(transactions.id, eid), eq(transactions.rootId, eid)),
        ),
      )
      .get();

    if (!head) {
      throw new ApiError('NOT_FOUND', 404);
    }

    const headItem = fundItemOf(head);
    if (isFundPaid(headItem)) ensureFundWrite(actor);

    const expenseInvolved = await isExpenseInvolved(db, head.id, head.payerId, actor.participantId);
    ensure(actor, 'disable', { expenseInvolved });

    if (head.status === 'disabled') await assertNoPendingPeople(db, tripId, head.id, head.payerId);
    // Enabling spends from the fund again, so it is checked like a new one (spec §9.3).
    if (head.status === 'disabled' && isFundPaid(headItem)) {
      assertFundCovers(await currentFundBalance(db, tripId), null, fundItemOf(head, 'approved'));
    }

    const now = nowIso();
    const r = await db
      .update(transactions)
      .set({
        status: 'approved',
        disabledByUserId: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(transactions.id, head.id),
          eq(transactions.tripId, tripId),
          eq(transactions.isLatest, 1),
          eq(transactions.status, 'disabled'),
        ),
      )
      .run();

    if (r.meta.changes === 0) {
      throw new ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.');
    }

    await commitTripWrite(db, tripId, [], {
      action: 'expense_enabled',
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details: {},
    });

    return c.body(null, 204);
  });

  return app;
}
