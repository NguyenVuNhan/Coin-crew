import { can, fundEffect, isFundPaid, type ExpenseView, type IncomeView, type TripView } from '@fsl/core';
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

/**
 * Paying `amount` from the fund, for a new expense or for `editing` (whose new version keeps its status, so a disabled
 * one takes nothing): the fund once saved, and whether the API turns the save down. Like `assertFundCovers` it refuses
 * only a save that lowers the fund and leaves it below 0₫, so a fund below 0₫ after a race (spec §9.10) can still be
 * fixed.
 */
export function fundPaidCheck(view: TripView, editing: ExpenseView | undefined, amount: number): { after: number; over: boolean } {
  const balance = fundOf(view)?.balance ?? 0;
  const before = editing ? fundEffect({ kind: 'expense', amount: editing.amount, status: editing.status, meta: editing.meta }) : 0;
  const delta = fundEffect({ kind: 'expense', amount, status: editing?.status ?? 'approved', meta: { paidFromFund: true } }) - before;
  return { after: balance + delta, over: delta < 0 && balance + delta < 0 };
}

/**
 * The least an income can be lowered to (the API refuses less): what the fund has already spent of it, which is all
 * of it while the fund is below 0₫.
 */
export function incomeMinimum(view: TripView, income: IncomeView): number {
  return income.status === 'approved' ? Math.max(0, income.amount - Math.max(0, fundOf(view)?.balance ?? 0)) : 0;
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
