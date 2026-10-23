import type { Context } from 'hono';
import { Hono } from 'hono';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import type {
  ExpenseInput,
  ExpenseMeta,
  ExpenseSportMeta,
  ExpenseStatus,
  SplitEntry,
  SplitMode,
  SportParticipantEntry,
  SportRule,
} from '@fsl/core';
import {
  computeShares,
  computeSportShares,
  initialExpenseStatus,
} from '@fsl/core';
import type { AppBindings } from '../env';
import { getDb, type Db } from '../db/client';
import { participants, transactions, transactionShares } from '../db/schema';
import { assertWritable, resolveActor } from '../access/actor';
import { ensure } from '../access/guard';
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
  shares: { participantId: string; inputValue: number; amount: number }[];
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
    if (typeof pid !== 'string' || typeof val !== 'number') {
      throw new ApiError('VALIDATION', 422, 'Invalid entry');
    }
    if (seenIds.has(pid)) {
      throw new ApiError('VALIDATION', 422, 'Duplicate participant in entries');
    }
    seenIds.add(pid);
    entries.push({ participantId: pid, value: val });
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

  if (!participantMap.has(payerId)) {
    throw new ApiError('VALIDATION', 422, 'Invalid payer');
  }

  for (const entry of entries) {
    if (!participantMap.has(entry.participantId)) {
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
  const shares = r.shares.map((sh) => ({
    participantId: sh.participantId,
    inputValue: mode === 'equal' ? 1 : (entryValueMap.get(sh.participantId) ?? 1),
    amount: sh.amount,
  }));

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

    const status = initialExpenseStatus(actor);
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
      payerId: validated.payerId,
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
      payerId: validated.payerId,
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

    const expenseInvolved = await isExpenseInvolved(db, head.id, head.payerId, actor.participantId);
    ensure(actor, 'approve_expense', { expenseInvolved });

    if (head.status !== 'pending') {
      throw new ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.');
    }

    await assertNoPendingPeople(db, tripId, head.id, head.payerId);

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

    const expenseInvolved = await isExpenseInvolved(db, head.id, head.payerId, actor.participantId);
    ensure(actor, 'disable', { expenseInvolved });

    if (head.status === 'disabled') await assertNoPendingPeople(db, tripId, head.id, head.payerId);

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
