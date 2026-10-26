import { and, eq, inArray } from 'drizzle-orm';
import type { ExpenseMeta, FundItem, IncomeStatus, LedgerIncome } from '@fsl/core';
import { fundEffect, fundSummary } from '@fsl/core';
import type { Db } from '../db/client';
import { transactions } from '../db/schema';
import type { TripRow } from '../access/actor';
import { ApiError } from '../lib/errors';

export function assertSportGroup(trip: TripRow): void {
  if (trip.preset !== 'sport') {
    throw new ApiError('FORBIDDEN', 403, 'The group fund is for sport groups.');
  }
}

export async function currentFundBalance(db: Db, tripId: string): Promise<number> {
  const rows = await db
    .select({
      id: transactions.id,
      amount: transactions.amount,
      status: transactions.status,
      type: transactions.type,
      metaJson: transactions.metaJson,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.tripId, tripId),
        eq(transactions.isLatest, 1),
        inArray(transactions.type, ['income', 'expense']),
      ),
    );

  const incomes: LedgerIncome[] = [];
  const expenses: { amount: number; status: string; meta?: ExpenseMeta | null }[] = [];

  for (const row of rows) {
    if (row.type === 'income') {
      incomes.push({
        id: row.id,
        amount: row.amount,
        status: row.status as IncomeStatus,
      });
    } else if (row.type === 'expense') {
      let meta: ExpenseMeta | null = null;
      if (row.metaJson) {
        try {
          const parsed = JSON.parse(row.metaJson);
          if (parsed && typeof parsed === 'object') {
            meta = parsed as ExpenseMeta;
          }
        } catch {
          meta = null;
        }
      }
      expenses.push({
        amount: row.amount,
        status: row.status,
        meta,
      });
    }
  }

  return fundSummary(incomes, expenses).balance;
}

export function assertFundCovers(
  balance: number,
  before: FundItem | null,
  after: FundItem | null,
): void {
  const diff = balance - (before ? fundEffect(before) : 0) + (after ? fundEffect(after) : 0);
  if (diff < 0) {
    throw new ApiError('FUND_SHORT', 409, 'Not enough in the group fund.');
  }
}
