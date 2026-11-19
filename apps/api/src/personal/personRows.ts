import { and, asc, eq, gte, lte } from 'drizzle-orm';
import type { Db } from '@cc/api-db/client';
import { participants, transactionShares, transactions } from '@cc/api-db/schema';
import type { PersonRow, SyncLedgerRow } from '@cc/core';
import { findLedger } from '../me/ledger';

export interface LoadPersonRowsParams {
  userId: string;
  defaultWalletId: string | null;
  from: string;
  to: string;
}

export async function loadLedgerRows(
  db: Db,
  ledger: { tripId: string; ownerPid: string },
  range?: { from: string; to: string },
): Promise<SyncLedgerRow[]> {
  const conditions = [
    eq(transactions.tripId, ledger.tripId),
    eq(transactions.type, 'expense'),
    eq(transactions.isLatest, 1),
    eq(transactions.status, 'approved'),
  ];
  if (range) {
    conditions.push(gte(transactions.spentOn, range.from), lte(transactions.spentOn, range.to));
  }

  const txRows = await db
    .select({
      id: transactions.id,
      amount: transactions.amount,
      description: transactions.description,
      spentOn: transactions.spentOn,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .where(and(...conditions))
    .all();

  if (txRows.length === 0) return [];

  const shareRows = await db
    .select({
      transactionId: transactionShares.transactionId,
      participantId: transactionShares.participantId,
      amount: transactionShares.amount,
      name: participants.name,
    })
    .from(transactionShares)
    .innerJoin(transactions, eq(transactions.id, transactionShares.transactionId))
    .innerJoin(participants, eq(participants.id, transactionShares.participantId))
    .where(and(...conditions))
    .orderBy(asc(participants.sortOrder))
    .all();

  const shareByTx = new Map<string, { ownerShare: number; people: string[] }>();
  for (const s of shareRows) {
    let acc = shareByTx.get(s.transactionId);
    if (!acc) {
      acc = { ownerShare: 0, people: [] };
      shareByTx.set(s.transactionId, acc);
    }
    if (s.participantId === ledger.ownerPid) {
      acc.ownerShare = s.amount;
    } else {
      acc.people.push(s.name);
    }
  }

  return txRows.map((tx) => {
    const info = shareByTx.get(tx.id);
    return {
      id: tx.id,
      tripId: ledger.tripId,
      date: tx.spentOn,
      share: info?.ownerShare ?? 0,
      total: tx.amount,
      note: tx.description,
      people: info?.people ?? [],
      createdAt: tx.createdAt,
    };
  });
}

/**
 * Load read-only quick-expense rows from the user's direct ledger within [from, to].
 * Uses the same approved / isLatest = 1 expense filter as the people history/balances code.
 */
export async function loadPersonRows(db: Db, params: LoadPersonRowsParams): Promise<PersonRow[]> {
  if (!params.defaultWalletId) return [];

  const ledger = await findLedger(db, params.userId);
  if (!ledger) return [];

  const rows = await loadLedgerRows(db, ledger, { from: params.from, to: params.to });

  return rows.map((r) => ({
    kind: 'person',
    ...r,
    walletId: params.defaultWalletId!,
    currency: 'VND',
  }));
}
