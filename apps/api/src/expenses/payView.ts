import { Hono } from 'hono';
import { and, eq, inArray } from 'drizzle-orm';
import type { ExpensePayView, PaidBy } from '@fsl/core';
import {
  MAX_AMOUNT,
  expenseRemaining,
  expenseShareOf,
  isFundPaid,
  linkedPaid,
  pairwiseTransfers,
  rowSlots,
  slotTiles,
  statusForNewPayment,
} from '@fsl/core';
import type { AppBindings } from '../env';
import { getDb, type Db } from '../db/client';
import { accountMergeRequests, participants } from '../db/schema';
import { assertWritable, resolveActor, type ResolvedActor } from '../access/actor';
import { buildPayInfo } from '../bank/routes';
import { ApiError } from '../lib/errors';
import { insertPayment } from '../payments/routes';
import { getSnapshot, toLedger } from '../trips/snapshot';
import { getClaimGrant } from './claimGrant';
import { getFriendGrant } from './friendGrant';

export async function buildExpensePayView(
  db: Db,
  actor: ResolvedActor,
  expenseId: string,
): Promise<ExpensePayView | { row: null }> {
  const tripId = actor.trip.id;
  const snapshot = await getSnapshot(db, actor.trip);
  const expense = snapshot.expenses.find(
    (e) =>
      (e.id === expenseId || e.rootId === expenseId) &&
      (e.status === 'approved' || e.status === 'pending') &&
      !isFundPaid(e),
  );
  if (!expense) {
    throw new ApiError('NOT_FOUND', 404);
  }

  const rootId = expense.rootId ?? expense.id;
  let rowId: string | null = null;
  let viewer: PaidBy | 'claim' = 'self';
  let claimRequestId: string | null = null;

  if (
    actor.participantId &&
    actor.participantId !== expense.payerId &&
    expenseShareOf(expense, actor.participantId) > 0
  ) {
    rowId = actor.participantId;
    viewer = 'self';
  }
  if (!rowId) {
    const grantedId = await getFriendGrant(db, actor.deviceHash, tripId, rootId);
    if (
      grantedId &&
      grantedId !== expense.payerId &&
      expenseShareOf(expense, grantedId) > 0
    ) {
      rowId = grantedId;
      viewer = 'friend';
    }
  }
  if (!rowId) {
    const claimGrant = await getClaimGrant(db, actor.userId, tripId);
    if (
      claimGrant &&
      claimGrant.participantId !== expense.payerId &&
      expenseShareOf(expense, claimGrant.participantId) > 0
    ) {
      rowId = claimGrant.participantId;
      viewer = 'claim';
      claimRequestId = claimGrant.requestId;
    }
  }

  if (!rowId) {
    return { row: null };
  }

  const person = snapshot.people.find((p) => p.id === rowId);
  const payer = snapshot.people.find((p) => p.id === expense.payerId);
  if (!person || !payer) {
    return { row: null };
  }

  let claim: { name: string; expiresAt: string } | undefined;
  if (viewer === 'claim' && claimRequestId) {
    const reqRow = await db
      .select({ expiresAt: accountMergeRequests.expiresAt })
      .from(accountMergeRequests)
      .where(eq(accountMergeRequests.id, claimRequestId))
      .get();
    if (reqRow) {
      claim = { name: person.name, expiresAt: reqRow.expiresAt };
    }
  }

  const rowParticipant = await db
    .select({ userId: participants.userId })
    .from(participants)
    .where(eq(participants.id, rowId))
    .get();
  const isMember = rowParticipant ? rowParticipant.userId !== null : person.isMember;

  const ledger = toLedger(snapshot);
  const pairwise = pairwiseTransfers(ledger.order, ledger.expenses, ledger.payments);
  const pairOwed =
    pairwise.find((t) => t.fromId === rowId && t.toId === expense.payerId)?.amount ?? 0;

  const share = expenseShareOf(expense, rowId);
  const paidSum = linkedPaid(snapshot.payments, rootId, rowId);
  const remaining = expenseRemaining(share, paidSum, pairOwed);
  const slots = rowSlots(expense, rowId);
  const tiles = slotTiles(expense, rowId, person.gender, remaining);

  const pay =
    remaining > 0
      ? await buildPayInfo(db, actor.trip, {
          payerId: rowId,
          toId: expense.payerId,
          amount: remaining,
          snapshot,
          purpose: expense.description,
          senderId: actor.participantId,
        })
      : null;

  const paid = snapshot.payments
    .filter((p) => p.expenseId === rootId && p.fromId === rowId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((p) => ({
      paymentId: p.id,
      amount: p.amountConfirmed ?? p.amountClaimed,
      status: p.status,
      paidBy: p.paidBy ?? 'self',
      notArrived: p.notArrived,
      ...(p.claimPending ? { claimPending: true as const } : {}),
    }));

  return {
    expense: {
      id: rootId,
      description: expense.description,
      spentOn: expense.spentOn,
      amount: expense.amount,
    },
    payer: {
      id: payer.id,
      name: payer.name,
    },
    row: {
      participantId: rowId,
      name: person.name,
      isMember,
      slots,
      share,
      remaining,
      tiles,
    },
    viewer,
    ...(claim ? { claim } : {}),
    paid,
    pay,
  };
}

export function expensePayRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  // GET /trips/:id/expenses/:eid/pay
  app.get('/trips/:id/expenses/:eid/pay', async (c) => {
    const tripId = c.req.param('id');
    const expenseId = c.req.param('eid');
    const actor = await resolveActor(c, tripId);
    const db = getDb(c.env);

    const result = await buildExpensePayView(db, actor, expenseId);
    return c.json(result);
  });

  // POST /trips/:id/expenses/:eid/pay-report
  app.post('/trips/:id/expenses/:eid/pay-report', async (c) => {
    const tripId = c.req.param('id');
    const expenseId = c.req.param('eid');
    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);

    if (actor.kind === 'viewer' || actor.participantPending) {
      throw new ApiError('FORBIDDEN', 403);
    }

    let body: { amount?: unknown; paidBy?: unknown };
    try {
      body = await c.req.json();
    } catch {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    if (!body || typeof body !== 'object') {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    const db = getDb(c.env);
    const view = await buildExpensePayView(db, actor, expenseId);
    if (!view.row) {
      throw new ApiError('FORBIDDEN', 403);
    }

    if (
      typeof body.amount !== 'number' ||
      !Number.isSafeInteger(body.amount) ||
      body.amount < 1 ||
      body.amount > MAX_AMOUNT
    ) {
      throw new ApiError('VALIDATION', 422, 'Invalid amount');
    }
    const amount = body.amount;

    if (
      view.viewer === 'self' &&
      body.paidBy !== 'self' &&
      body.paidBy !== 'friend'
    ) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }
    const paidBy: PaidBy =
      view.viewer === 'friend'
        ? 'friend'
        : view.viewer === 'claim'
          ? 'self'
          : (body.paidBy as PaidBy);

    if (view.row.remaining === 0) {
      throw new ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.');
    }

    if (amount > view.row.remaining) {
      throw new ApiError('VALIDATION', 422, 'Invalid amount');
    }

    const rowId = view.row.participantId;
    const payerId = view.payer.id;
    const rootId = view.expense.id;

    const tripParticipants = await db
      .select()
      .from(participants)
      .where(
        and(
          eq(participants.tripId, tripId),
          inArray(participants.id, [rowId, payerId]),
          inArray(participants.status, ['active', 'left']),
        ),
      );

    const fromP = tripParticipants.find((p) => p.id === rowId);
    const toP = tripParticipants.find((p) => p.id === payerId);
    if (!fromP || !toP) {
      throw new ApiError('VALIDATION', 422, 'Participants must be active members of the trip');
    }

    const receiverIsMember = toP.userId !== null && toP.status === 'active';
    const payerIsMember = fromP.userId !== null && fromP.status === 'active';

    let status: 'says_paid' | 'confirmed';
    let claimRequestId: string | null = null;
    if (view.viewer === 'claim') {
      const claimGrant = await getClaimGrant(db, actor.userId, tripId);
      if (!claimGrant || claimGrant.participantId !== rowId) {
        throw new ApiError('FORBIDDEN', 403);
      }
      claimRequestId = claimGrant.requestId;
      status = 'says_paid';
    } else if (view.viewer === 'self') {
      const s = statusForNewPayment({
        actorId: rowId,
        fromId: rowId,
        toId: payerId,
        receiverIsMember,
        payerIsMember,
      });
      if (s === 'forbidden') {
        throw new ApiError('FORBIDDEN', 403);
      }
      status = s;
    } else {
      status = receiverIsMember ? 'says_paid' : 'confirmed';
    }

    const paymentId = await insertPayment(db, {
      tripId,
      fromId: rowId,
      toId: payerId,
      amount,
      status,
      createdByParticipantId: rowId,
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      metaJson: JSON.stringify({ expenseId: rootId, paidBy }),
      expenseId: rootId,
      ...(claimRequestId ? { claimRequestId } : {}),
    });

    return c.json({ paymentId, status }, 201);
  });

  return app;
}
