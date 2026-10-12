export type ExpenseStatus = 'approved' | 'pending' | 'rejected' | 'disabled';
export type PaymentStatus = 'says_paid' | 'confirmed' | 'rejected' | 'disabled';

export interface LedgerExpense {
  id: string;
  payerId: string;
  amount: number;
  status: ExpenseStatus;
  createdById: string;
  shares: { participantId: string; amount: number }[];
}

export interface LedgerPayment {
  id: string;
  fromId: string;
  toId: string;
  amount: number;
  status: PaymentStatus;
}

export type Balances = Record<string, number>;

export interface BalanceOptions {
  includeSaysPaid?: boolean;
  includePendingCreatedBy?: string;
  ignorePayments?: boolean;
}

export function computeBalances(
  people: string[],
  expenses: LedgerExpense[],
  payments: LedgerPayment[],
  opts?: BalanceOptions,
): Balances {
  const balances: Balances = {};

  for (const person of people) {
    balances[person] = 0;
  }

  for (const expense of expenses) {
    const isCounted =
      expense.status === 'approved' ||
      (expense.status === 'pending' &&
        opts?.includePendingCreatedBy !== undefined &&
        expense.createdById === opts.includePendingCreatedBy);

    if (!isCounted) {
      continue;
    }

    balances[expense.payerId] = (balances[expense.payerId] ?? 0) + expense.amount;
    for (const share of expense.shares) {
      balances[share.participantId] = (balances[share.participantId] ?? 0) - share.amount;
    }
  }

  if (!opts?.ignorePayments) {
    for (const payment of payments) {
      const isCounted =
        payment.status === 'confirmed' ||
        (payment.status === 'says_paid' && opts?.includeSaysPaid === true);

      if (!isCounted) {
        continue;
      }

      balances[payment.fromId] = (balances[payment.fromId] ?? 0) + payment.amount;
      balances[payment.toId] = (balances[payment.toId] ?? 0) - payment.amount;
    }
  }

  return balances;
}
