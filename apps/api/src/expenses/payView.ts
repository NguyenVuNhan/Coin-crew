import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { ExpensePayView, PaidBy } from '@fsl/core';
import {
  expenseRemaining,
  expenseShareOf,
  isFundPaid,
  linkedPaid,
  pairwiseTransfers,
  rowSlots,
  slotTiles,
} from '@fsl/core';
import type { AppBindings } from '../env';
import { getDb, type Db } from '../db/client';
import { participants } from '../db/schema';
import { resolveActor, type ResolvedActor } from '../access/actor';
import { buildPayInfo } from '../bank/routes';
import { ApiError } from '../lib/errors';
import { getSnapshot, toLedger } from '../trips/snapshot';
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
  let viewer: PaidBy = 'self';

  if (
    actor.participantId &&
    actor.participantId !== expense.payerId &&
    expenseShareOf(expense, actor.participantId) > 0
  ) {
    rowId = actor.participantId;
    viewer = 'self';
  } else {
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
    return { row: null };
  }

  const person = snapshot.people.find((p) => p.id === rowId);
  const payer = snapshot.people.find((p) => p.id === expense.payerId);
  if (!person || !payer) {
    return { row: null };
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

  return app;
}
