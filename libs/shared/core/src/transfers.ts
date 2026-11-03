import type { Balances, LedgerExpense, LedgerPayment } from './balances';

export interface Transfer {
  fromId: string;
  toId: string;
  amount: number;
}

function createOrderComparator(order: string[]): (a: string, b: string) => number {
  const orderMap = new Map<string, number>();
  for (let i = 0; i < order.length; i++) {
    orderMap.set(order[i]!, i);
  }

  return (a: string, b: string): number => {
    const idxA = orderMap.get(a);
    const idxB = orderMap.get(b);

    if (idxA !== undefined && idxB !== undefined) {
      return idxA - idxB;
    }
    if (idxA !== undefined) {
      return -1;
    }
    if (idxB !== undefined) {
      return 1;
    }
    return a.localeCompare(b);
  };
}

export function suggestTransfers(
  balances: Balances,
  order: string[],
  previous?: Transfer[],
): Transfer[] {
  const remaining: Balances = { ...balances };
  const result: Transfer[] = [];
  const compareOrder = createOrderComparator(order);

  // Step 1: Retain previous transfers if still matching signs
  for (const t of previous ?? []) {
    const fromBal = remaining[t.fromId] ?? 0;
    const toBal = remaining[t.toId] ?? 0;

    if (fromBal < 0 && toBal > 0) {
      const amt = Math.min(-fromBal, toBal);
      if (amt > 0) {
        result.push({ fromId: t.fromId, toId: t.toId, amount: amt });
        remaining[t.fromId] = fromBal + amt;
        remaining[t.toId] = toBal - amt;
      }
    }
  }

  // Step 2: Greedy matching with order-based tie breaking
  while (true) {
    let d: string | undefined;
    let minBal = 0;

    let c: string | undefined;
    let maxBal = 0;

    for (const id of Object.keys(remaining)) {
      const bal = remaining[id] ?? 0;
      if (bal < 0) {
        if (d === undefined || bal < minBal) {
          d = id;
          minBal = bal;
        } else if (bal === minBal) {
          if (compareOrder(id, d) < 0) {
            d = id;
          }
        }
      } else if (bal > 0) {
        if (c === undefined || bal > maxBal) {
          c = id;
          maxBal = bal;
        } else if (bal === maxBal) {
          if (compareOrder(id, c) < 0) {
            c = id;
          }
        }
      }
    }

    if (d === undefined || c === undefined) {
      break;
    }

    const dBal = remaining[d] ?? 0;
    const cBal = remaining[c] ?? 0;
    const amt = Math.min(-dBal, cBal);

    if (amt <= 0) {
      break;
    }

    result.push({ fromId: d, toId: c, amount: amt });
    remaining[d] = dBal + amt;
    remaining[c] = cBal - amt;
  }

  return result;
}

export function pairwiseTransfers(
  order: string[],
  expenses: LedgerExpense[],
  payments: LedgerPayment[],
): Transfer[] {
  // debts: Map<fromId, Map<toId, amount>>
  const debts = new Map<string, Map<string, number>>();

  const addDebt = (fromId: string, toId: string, amount: number) => {
    let m = debts.get(fromId);
    if (!m) {
      m = new Map<string, number>();
      debts.set(fromId, m);
    }
    m.set(toId, (m.get(toId) ?? 0) + amount);
  };

  for (const expense of expenses) {
    if (expense.status !== 'approved') {
      continue;
    }
    for (const share of expense.shares) {
      if (share.participantId !== expense.payerId) {
        addDebt(share.participantId, expense.payerId, share.amount);
      }
    }
  }

  for (const payment of payments) {
    if (payment.status === 'confirmed' || payment.status === 'says_paid') {
      addDebt(payment.fromId, payment.toId, -payment.amount);
    }
  }

  // Collect all unique participant IDs
  const allIds = new Set<string>(order);
  for (const [fromId, m] of debts) {
    allIds.add(fromId);
    for (const toId of m.keys()) {
      allIds.add(toId);
    }
  }

  const ids = Array.from(allIds);
  const compareOrder = createOrderComparator(order);
  const result: Transfer[] = [];

  for (let i = 0; i < ids.length; i++) {
    const a = ids[i]!;
    for (let j = i + 1; j < ids.length; j++) {
      const b = ids[j]!;

      const debtAtoB = debts.get(a)?.get(b) ?? 0;
      const debtBtoA = debts.get(b)?.get(a) ?? 0;
      const netAtoB = debtAtoB - debtBtoA;

      if (netAtoB > 0) {
        result.push({ fromId: a, toId: b, amount: netAtoB });
      } else if (netAtoB < 0) {
        result.push({ fromId: b, toId: a, amount: -netAtoB });
      }
    }
  }

  result.sort((x, y) => {
    const cmpFrom = compareOrder(x.fromId, y.fromId);
    if (cmpFrom !== 0) {
      return cmpFrom;
    }
    return compareOrder(x.toId, y.toId);
  });

  return result;
}
