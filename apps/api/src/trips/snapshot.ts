import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type {
  ExpenseHistoryItem,
  ExpenseStatus,
  ExpenseView,
  LedgerExpense,
  LedgerPayment,
  PaymentStatus,
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
  participants,
  transactionShares,
  transactions,
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

  const txRows = await db
    .select()
    .from(transactions)
    .where(eq(transactions.tripId, trip.id))
    .orderBy(desc(transactions.createdAt));

  const sharesByTxId = new Map<string, ExpenseView['shares']>();
  if (txRows.length > 0) {
    // A subquery, not a list of ids: D1 allows only 100 bound parameters per query.
    const shareRows = await db
      .select()
      .from(transactionShares)
      .where(
        inArray(
          transactionShares.transactionId,
          db.select({ id: transactions.id }).from(transactions).where(eq(transactions.tripId, trip.id)),
        ),
      );
    for (const s of shareRows) {
      let list = sharesByTxId.get(s.transactionId);
      if (!list) {
        list = [];
        sharesByTxId.set(s.transactionId, list);
      }
      list.push({
        participantId: s.participantId,
        amount: s.amount,
        inputValue: s.inputValue,
      });
    }
  }

  const historyByRootId = new Map<string, ExpenseHistoryItem[]>();
  for (const tx of txRows) {
    if (tx.type === 'expense' && tx.isLatest === 0) {
      let list = historyByRootId.get(tx.rootId);
      if (!list) {
        list = [];
        historyByRootId.set(tx.rootId, list);
      }
      list.push({
        id: tx.id,
        description: tx.description,
        amount: tx.amount,
        spentOn: tx.spentOn,
        payerId: tx.payerId,
        mode: tx.splitMode as SplitMode,
        createdById: tx.createdByParticipantId,
        createdAt: tx.createdAt,
        shares: sharesByTxId.get(tx.id) ?? [],
        meta: tx.metaJson ? (JSON.parse(tx.metaJson) as ExpenseView['meta']) : null,
      });
    }
  }

  // Ensure history items are sorted newest-first (createdAt DESC)
  for (const list of historyByRootId.values()) {
    list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const activeExpenseRows = txRows.filter((tx) => tx.type === 'expense' && tx.isLatest === 1);
  const disabledUserIds = Array.from(
    new Set(
      activeExpenseRows.map((e) => e.disabledByUserId).filter((id): id is string => id !== null),
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

  const expenseViews: ExpenseView[] = activeExpenseRows.map((e) => ({
    id: e.id,
    rootId: e.rootId,
    description: e.description,
    amount: e.amount,
    spentOn: e.spentOn,
    payerId: e.payerId,
    mode: e.splitMode as SplitMode,
    status: e.status as ExpenseStatus,
    rejectReason: e.rejectReason,
    disabledByName: e.disabledByUserId ? (disabledNameMap.get(e.disabledByUserId) ?? null) : null,
    createdById: e.createdByParticipantId,
    shares: sharesByTxId.get(e.id) ?? [],
    meta: e.metaJson ? (JSON.parse(e.metaJson) as ExpenseView['meta']) : null,
    history: historyByRootId.get(e.rootId) ?? [],
  }));

  const activePaymentRows = txRows.filter((tx) => tx.type === 'payment' && tx.isLatest === 1);
  const paymentViews: PaymentView[] = activePaymentRows.map((p) => ({
    id: p.id,
    fromId: p.payerId,
    toId: p.toId!,
    amountClaimed: p.amount,
    amountConfirmed: p.amountConfirmed,
    status: p.status as PaymentStatus,
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
