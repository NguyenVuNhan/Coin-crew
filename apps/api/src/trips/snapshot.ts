import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type {
  ExpenseView,
  LedgerExpense,
  LedgerPayment,
  PaymentView,
  PersonView,
  SplitMode,
  Transfer,
  TripView,
} from '@fsl/core';
import {
  computeBalances,
  pairwiseTransfers,
  suggestTransfers,
} from '@fsl/core';
import type { Db } from '../db/client';
import type { TripRow } from '../access/actor';
import {
  bankDetails,
  expenseShares,
  expenses,
  participants,
  payments,
  tripViews,
  users,
} from '../db/schema';
import { nowIso } from '../lib/ids';

export type TripSnapshot = Omit<TripView, 'me' | 'myBalance' | 'approvals' | 'links'>;

export function toLedger(s: TripSnapshot): {
  order: string[];
  expenses: LedgerExpense[];
  payments: LedgerPayment[];
} {
  const order = s.people.map((p) => p.id);
  const ledgerExpenses: LedgerExpense[] = s.expenses.map((e) => ({
    id: e.id,
    payerId: e.payerId,
    amount: e.amount,
    status: e.status,
    createdById: e.createdById,
    shares: e.shares.map((sh) => ({
      participantId: sh.participantId,
      amount: sh.amount,
    })),
  }));
  const ledgerPayments: LedgerPayment[] = s.payments.map((p) => ({
    id: p.id,
    fromId: p.fromId,
    toId: p.toId,
    amount: p.amountConfirmed ?? p.amountClaimed,
    status: p.status,
  }));
  return { order, expenses: ledgerExpenses, payments: ledgerPayments };
}

export async function buildSnapshot(
  db: Db,
  trip: TripRow,
  previous?: Transfer[],
): Promise<TripSnapshot> {
  const participantRows = await db
    .select()
    .from(participants)
    .where(
      and(
        eq(participants.tripId, trip.id),
        inArray(participants.status, ['active', 'pending']),
      ),
    )
    .orderBy(asc(participants.sortOrder));

  const memberUserIds = participantRows
    .map((p) => p.userId)
    .filter((id): id is string => id !== null);

  const guestParticipantIds = participantRows
    .filter((p) => p.userId === null)
    .map((p) => p.id);

  let approvedUserSet = new Set<string>();
  if (memberUserIds.length > 0) {
    const memberBanks = await db
      .select({ userId: bankDetails.userId })
      .from(bankDetails)
      .where(
        and(
          inArray(bankDetails.userId, memberUserIds),
          eq(bankDetails.status, 'approved'),
        ),
      );
    approvedUserSet = new Set(
      memberBanks.map((b) => b.userId).filter((id): id is string => id !== null),
    );
  }

  const guestApprovedSet = new Set<string>();
  const guestPendingSet = new Set<string>();
  if (guestParticipantIds.length > 0) {
    const guestBanks = await db
      .select({ participantId: bankDetails.participantId, status: bankDetails.status })
      .from(bankDetails)
      .where(
        and(
          inArray(bankDetails.participantId, guestParticipantIds),
          inArray(bankDetails.status, ['approved', 'pending']),
        ),
      );
    for (const b of guestBanks) {
      if (b.participantId) {
        if (b.status === 'approved') {
          guestApprovedSet.add(b.participantId);
        } else if (b.status === 'pending') {
          guestPendingSet.add(b.participantId);
        }
      }
    }
  }

  const people: PersonView[] = participantRows.map((p) => {
    let bank: PersonView['bank'] = 'none';
    if (p.userId !== null) {
      bank = approvedUserSet.has(p.userId) ? 'approved' : 'none';
    } else if (guestApprovedSet.has(p.id)) {
      bank = 'approved';
    } else if (guestPendingSet.has(p.id)) {
      bank = 'pending';
    }
    return {
      id: p.id,
      name: p.name,
      gender: (p.gender as 'M' | 'F' | null) ?? null,
      status: p.status as 'active' | 'pending',
      isMember: p.userId !== null,
      isOrganiser: p.userId !== null && p.userId === trip.organiserUserId,
      bank,
    };
  });

  const expenseRows = await db
    .select()
    .from(expenses)
    .where(eq(expenses.tripId, trip.id))
    .orderBy(desc(expenses.createdAt));

  const expenseIds = expenseRows.map((e) => e.id);
  const disabledUserIds = Array.from(
    new Set(
      expenseRows.map((e) => e.disabledByUserId).filter((id): id is string => id !== null),
    ),
  );

  const disabledNameMap = new Map<string, string>();
  if (disabledUserIds.length > 0) {
    const userRows = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, disabledUserIds));
    for (const u of userRows) {
      disabledNameMap.set(u.id, u.name);
    }
  }

  const sharesByExpenseId = new Map<string, ExpenseView['shares']>();
  if (expenseIds.length > 0) {
    // A subquery, not a list of ids: D1 allows only 100 bound parameters per query.
    const shareRows = await db
      .select()
      .from(expenseShares)
      .where(inArray(expenseShares.expenseId, db.select({ id: expenses.id }).from(expenses).where(eq(expenses.tripId, trip.id))));
    for (const s of shareRows) {
      let list = sharesByExpenseId.get(s.expenseId);
      if (!list) {
        list = [];
        sharesByExpenseId.set(s.expenseId, list);
      }
      list.push({
        participantId: s.participantId,
        amount: s.amount,
        inputValue: s.inputValue,
      });
    }
  }

  const expenseViews: ExpenseView[] = expenseRows.map((e) => ({
    id: e.id,
    description: e.description,
    amount: e.amount,
    spentOn: e.spentOn,
    payerId: e.payerId,
    mode: e.splitMode as SplitMode,
    status: e.status,
    rejectReason: e.rejectReason,
    disabledByName: e.disabledByUserId ? (disabledNameMap.get(e.disabledByUserId) ?? null) : null,
    createdById: e.createdByParticipantId,
    shares: sharesByExpenseId.get(e.id) ?? [],
    meta: e.metaJson ? (JSON.parse(e.metaJson) as ExpenseView['meta']) : null,
  }));

  const paymentRows = await db
    .select()
    .from(payments)
    .where(eq(payments.tripId, trip.id))
    .orderBy(desc(payments.createdAt));

  const paymentViews: PaymentView[] = paymentRows.map((p) => ({
    id: p.id,
    fromId: p.fromId,
    toId: p.toId,
    amountClaimed: p.amountClaimed,
    amountConfirmed: p.amountConfirmed,
    status: p.status,
    notArrived: p.notArrivedAt !== null,
    createdAt: p.createdAt,
  }));

  const partialSnapshot: TripSnapshot = {
    trip: {
      id: trip.id,
      name: trip.name,
      preset: (trip.preset as 'trip' | 'sport') ?? 'trip',
      currency: 'VND',
      fewestTransfers: trip.fewestTransfers === 1,
      archived: trip.archivedAt !== null,
      version: trip.version,
      total: 0,
    },
    people,
    balances: {},
    suggestions: [],
    expenses: expenseViews,
    payments: paymentViews,
  };

  const ledger = toLedger(partialSnapshot);
  const balances = computeBalances(ledger.order, ledger.expenses, ledger.payments);
  const suggestions =
    trip.fewestTransfers === 1
      ? suggestTransfers(
          computeBalances(ledger.order, ledger.expenses, ledger.payments, { includeSaysPaid: true }),
          ledger.order,
          previous,
        )
      : pairwiseTransfers(ledger.order, ledger.expenses, ledger.payments);

  const total = expenseViews
    .filter((e) => e.status === 'approved')
    .reduce((sum, e) => sum + e.amount, 0);

  return {
    trip: {
      id: trip.id,
      name: trip.name,
      preset: (trip.preset as 'trip' | 'sport') ?? 'trip',
      currency: 'VND',
      fewestTransfers: trip.fewestTransfers === 1,
      archived: trip.archivedAt !== null,
      version: trip.version,
      total,
    },
    people,
    balances,
    suggestions,
    expenses: expenseViews,
    payments: paymentViews,
  };
}

export async function getSnapshot(db: Db, trip: TripRow): Promise<TripSnapshot> {
  const row = await db
    .select()
    .from(tripViews)
    .where(eq(tripViews.tripId, trip.id))
    .get();

  if (row && row.version === trip.version) {
    return JSON.parse(row.json) as TripSnapshot;
  }

  let previous: Transfer[] | undefined;
  if (row) {
    try {
      const prev = JSON.parse(row.json) as TripSnapshot;
      previous = prev.suggestions;
    } catch {
      previous = undefined;
    }
  }

  const snapshot = await buildSnapshot(db, trip, previous);
  const json = JSON.stringify(snapshot);
  const updatedAt = nowIso();

  await db
    .insert(tripViews)
    .values({
      tripId: trip.id,
      version: trip.version,
      json,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: tripViews.tripId,
      set: {
        version: trip.version,
        json,
        updatedAt,
      },
    });

  return snapshot;
}
