import type { ExpenseMeta } from './api-types';

export type IncomeStatus = 'approved' | 'disabled';

export interface LedgerIncome { id: string; amount: number; status: IncomeStatus }
export interface FundSummary { balance: number; added: number; spent: number }
export type FundItem = { kind: 'income' | 'expense'; amount: number; status: string; meta?: ExpenseMeta | null };

/** The whole expense came out of the group fund rather than a person's pocket. */
export function isFundPaid(e: { meta?: ExpenseMeta | null }): boolean {
  return e.meta?.paidFromFund === true;
}

/** What one entry does to the fund balance: approved income adds, an approved fund-paid expense takes away, the rest nothing. */
export function fundEffect(item: FundItem): number {
  if (item.status !== 'approved') return 0;
  if (item.kind === 'income') return item.amount;
  return isFundPaid(item) ? -item.amount : 0;
}

export function fundSummary(
  incomes: LedgerIncome[],
  expenses: { amount: number; status: string; meta?: ExpenseMeta | null }[],
): FundSummary {
  let added = 0;
  let spent = 0;
  for (const i of incomes) added += fundEffect({ kind: 'income', amount: i.amount, status: i.status });
  for (const e of expenses) spent -= fundEffect({ kind: 'expense', amount: e.amount, status: e.status, meta: e.meta });
  return { balance: added - spent, added, spent };
}
