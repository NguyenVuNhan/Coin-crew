import type { ExpenseView, PaymentView } from './api-types';
import { isFundPaid, isPlanningExpense } from './fund';
import type { Transfer } from './transfers';

export type HistoryLineState = 'counted' | 'waiting' | 'disabled' | 'unapproved';
export interface HistoryLine {
  /** Transaction id. */
  id: string;
  kind: 'expense' | 'payment';
  tripId: string;
  /** Expense description; null for a payment. */
  title: string | null;
  /** YYYY-MM-DD: spentOn (expense) or createdAt's date (payment). */
  date: string;
  /** Sort key. */
  createdAt: string;
  /** Full expense amount, or the payment amount (amountConfirmed ?? amountClaimed). */
  amount: number;
  /** Expense payer, or the payment's sender. */
  paidBy: 'owner' | 'other';
  /** 0 for payments. */
  ownerShare: number;
  /** 0 for payments. */
  otherShare: number;
  /** Signed, owner's view: > 0 adds to what `other` owes `owner`. */
  effect: number;
  state: HistoryLineState;
}
export type HistoryGap =
  | { kind: 'rounding' }
  /** difference = suggested − twoWay */
  | { kind: 'reroute'; difference: number; viaPid: string | null };
export interface PairHistoryInput {
  tripId: string;
  ownerPid: string;
  otherPid: string;
  /** snapshot.expenses, already toLedger-filterable */
  expenses: ExpenseView[];
  payments: PaymentView[];
  /** snapshot.suggestions */
  suggestions: Transfer[];
  roundTransfers: boolean;
}
export interface PairHistory {
  /** Newest first, after trimming. */
  lines: HistoryLine[];
  /** Sum of effects of counted and waiting lines (whole history, not just kept lines). */
  twoWay: number;
  /** pairItems-equivalent amount for the pair from suggestions. */
  suggested: number;
  gap: HistoryGap | null;
  /** True when older lines were cut. */
  trimmed: boolean;
}

/** Rounded transfers snap to 1.000 ₫, so a smaller difference is rounding. */
const ROUNDING_LIMIT = 1000;

const EXPENSE_STATE: Partial<Record<ExpenseView['status'], HistoryLineState>> = {
  approved: 'counted',
  pending: 'unapproved',
  disabled: 'disabled',
};
const PAYMENT_STATE: Partial<Record<PaymentView['status'], HistoryLineState>> = {
  confirmed: 'counted',
  says_paid: 'waiting',
  disabled: 'disabled',
};

function counts(line: HistoryLine): boolean {
  return line.state === 'counted' || line.state === 'waiting';
}

function shareOf(e: ExpenseView, pid: string): number {
  let sum = 0;
  for (const s of e.shares) if (s.participantId === pid) sum += s.amount;
  return sum;
}

function expenseLine(e: ExpenseView, input: PairHistoryInput): HistoryLine | null {
  const { ownerPid, otherPid, tripId } = input;
  if (e.payerId !== ownerPid && e.payerId !== otherPid) return null;
  if (isFundPaid(e) || isPlanningExpense(e)) return null;
  const state = EXPENSE_STATE[e.status];
  if (!state) return null;
  const ownerShare = shareOf(e, ownerPid);
  const otherShare = shareOf(e, otherPid);
  const ownerPaid = e.payerId === ownerPid;
  const effect = ownerPaid ? otherShare : -ownerShare;
  if (effect === 0) return null;
  return {
    id: e.id,
    kind: 'expense',
    tripId,
    title: e.description,
    date: e.spentOn,
    createdAt: e.createdAt ?? e.spentOn,
    amount: e.amount,
    paidBy: ownerPaid ? 'owner' : 'other',
    ownerShare,
    otherShare,
    effect,
    state,
  };
}

function paymentLine(p: PaymentView, input: PairHistoryInput): HistoryLine | null {
  const { ownerPid, otherPid, tripId } = input;
  const ownerSent = p.fromId === ownerPid && p.toId === otherPid;
  const otherSent = p.fromId === otherPid && p.toId === ownerPid;
  if (!ownerSent && !otherSent) return null;
  const state = PAYMENT_STATE[p.status];
  if (!state) return null;
  const amount = p.amountConfirmed ?? p.amountClaimed;
  return {
    id: p.id,
    kind: 'payment',
    tripId,
    title: null,
    date: p.createdAt.slice(0, 10),
    createdAt: p.createdAt,
    amount,
    paidBy: ownerSent ? 'owner' : 'other',
    ownerShare: 0,
    otherShare: 0,
    effect: ownerSent ? amount : -amount,
    state,
  };
}

function findGap(input: PairHistoryInput, twoWay: number, suggested: number): HistoryGap | null {
  if (suggested === twoWay) return null;
  const difference = suggested - twoWay;
  if (input.roundTransfers && Math.abs(difference) < ROUNDING_LIMIT) return { kind: 'rounding' };
  const pair = new Set([input.ownerPid, input.otherPid]);
  const viaThird = input.suggestions.filter((t) => pair.has(t.fromId) !== pair.has(t.toId));
  let viaPid: string | null = null;
  if (viaThird.length === 1 && viaThird[0]!.amount === Math.abs(difference)) {
    const t = viaThird[0]!;
    viaPid = pair.has(t.fromId) ? t.toId : t.fromId;
  }
  return { kind: 'reroute', difference, viaPid };
}

/** The two-way lines between owner and other in one trip, with the sum, the suggested amount and why they may differ. */
export function pairHistory(input: PairHistoryInput): PairHistory {
  const all: HistoryLine[] = [];
  for (const e of input.expenses) {
    const line = expenseLine(e, input);
    if (line) all.push(line);
  }
  for (const p of input.payments) {
    const line = paymentLine(p, input);
    if (line) all.push(line);
  }
  all.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));

  let twoWay = 0;
  let cut = 0;
  for (let i = 0; i < all.length; i++) {
    const line = all[i]!;
    if (!counts(line)) continue;
    twoWay += line.effect;
    if (twoWay === 0) cut = i + 1;
  }

  let suggested = 0;
  for (const t of input.suggestions) {
    if (t.fromId === input.otherPid && t.toId === input.ownerPid) suggested += t.amount;
    else if (t.fromId === input.ownerPid && t.toId === input.otherPid) suggested -= t.amount;
  }

  const gap = findGap(input, twoWay, suggested);
  if (gap?.kind === 'reroute') cut = 0;

  return {
    lines: all.slice(cut).reverse(),
    twoWay,
    suggested,
    gap,
    trimmed: cut > 0,
  };
}
