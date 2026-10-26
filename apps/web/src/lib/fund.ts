import { can, isFundPaid, type ExpenseView, type IncomeView, type TripView } from '@fsl/core';
import { actorOf } from './rowActions';

/** The group fund of a sport group; null for any other kind of group. */
export function fundOf(view: TripView): NonNullable<TripView['fund']> | null {
  return view.fund ?? null;
}

/** The fund shows once it has history: an income, or an expense paid from it. */
export function showFund(view: TripView): boolean {
  const fund = fundOf(view);
  return fund !== null && (fund.incomes.length > 0 || view.expenses.some(isFundPaid));
}

export function isFundAdmin(view: TripView): boolean {
  return fundOf(view) !== null && !view.trip.archived && can(actorOf(view), 'manage_fund');
}

/** What an expense may still draw from the fund: the balance, plus what the expense being edited already took. */
export function fundAvailable(view: TripView, editing?: ExpenseView): number {
  const balance = fundOf(view)?.balance ?? 0;
  return editing && editing.status === 'approved' && isFundPaid(editing) ? balance + editing.amount : balance;
}

/** The least an income can be lowered to: what the fund has already spent of it. */
export function incomeMinimum(view: TripView, income: IncomeView): number {
  return income.status === 'approved' ? Math.max(0, income.amount - (fundOf(view)?.balance ?? 0)) : 0;
}

export type FeedItem = { kind: 'expense'; item: ExpenseView } | { kind: 'income'; item: IncomeView };

/** Expenses and fund income in one list, newest first; an expense without `createdAt` counts as oldest. */
export function mergeFeed(expenses: ExpenseView[], incomes: IncomeView[]): FeedItem[] {
  const feed: FeedItem[] = [
    ...expenses.map((item) => ({ kind: 'expense' as const, item })),
    ...incomes.map((item) => ({ kind: 'income' as const, item })),
  ];
  const at = (f: FeedItem) => f.item.createdAt ?? '';
  return feed.sort((a, b) => (at(a) < at(b) ? 1 : at(a) > at(b) ? -1 : 0));
}
