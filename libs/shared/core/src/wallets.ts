import { CURRENCY_CODES, type CurrencyCode } from './currency';

export type PersonalEntryType = 'expense' | 'income' | 'transfer_out' | 'transfer_in';

export interface CalcWallet {
  id: string;
  currency: CurrencyCode;
  startAmount: number;
  startDate: string;
  startCostVnd: number | null;
  archived: boolean;
}

export interface CalcEntry {
  id: string;
  walletId: string;
  type: PersonalEntryType;
  amount: number;
  date: string;
  time: string | null;
  createdAt: string;
  transferId: string | null;
  excludeFromReports: boolean;
}

export function isBeforeStart(
  entry: Pick<CalcEntry, 'date'>,
  wallet: Pick<CalcWallet, 'startDate'>,
): boolean {
  return entry.date < wallet.startDate;
}

export function walletBalance(wallet: CalcWallet, entries: CalcEntry[]): number {
  let balance = wallet.startAmount;
  for (const e of entries) {
    if (e.walletId !== wallet.id) continue;
    if (isBeforeStart(e, wallet)) continue;
    if (e.type === 'income' || e.type === 'transfer_in') {
      balance += e.amount;
    } else {
      balance -= e.amount;
    }
  }
  return balance;
}

interface NonVndState {
  qty: number;
  cost: number;
  rated: boolean;
  lastRate: number;
  unratedQty: number;
}

function entryOrderKey(t: PersonalEntryType): number {
  if (t === 'transfer_out') return 0;
  if (t === 'transfer_in') return 1;
  return 2;
}

function compareEntries(a: CalcEntry, b: CalcEntry): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const ta = a.time ?? '';
  const tb = b.time ?? '';
  if (ta !== tb) return ta < tb ? -1 : 1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return entryOrderKey(a.type) - entryOrderKey(b.type);
}

export function walletVndValues(
  wallets: CalcWallet[],
  entries: CalcEntry[],
): Map<string, number | null> {
  const walletMap = new Map<string, CalcWallet>();
  const states = new Map<string, NonVndState>();

  for (const w of wallets) {
    walletMap.set(w.id, w);
    if (w.currency !== 'VND') {
      const rated = w.startCostVnd !== null && w.startAmount !== 0;
      const cost = w.startCostVnd ?? 0;
      const qty = w.startAmount;
      states.set(w.id, {
        qty,
        cost: rated ? cost : 0,
        rated,
        lastRate: rated ? cost / qty : 0,
        unratedQty: rated ? 0 : qty,
      });
    }
  }

  const transferCostVnd = new Map<string, number | null>();
  const sorted = [...entries].sort(compareEntries);

  for (const e of sorted) {
    const w = walletMap.get(e.walletId);
    if (!w) continue;

    if (isBeforeStart(e, w)) {
      if (e.type === 'transfer_out' && e.transferId !== null) {
        if (w.currency === 'VND') {
          transferCostVnd.set(e.transferId, e.amount);
        } else {
          const st = states.get(w.id);
          if (st && st.rated) {
            const rate = st.qty > 0 ? st.cost / st.qty : st.lastRate;
            transferCostVnd.set(e.transferId, Math.round(rate * e.amount));
          } else {
            transferCostVnd.set(e.transferId, null);
          }
        }
      }
      continue;
    }

    if (w.currency === 'VND') {
      if (e.type === 'transfer_out' && e.transferId !== null) {
        transferCostVnd.set(e.transferId, e.amount);
      }
      continue;
    }

    const st = states.get(w.id);
    if (!st) continue;

    if (e.type === 'expense' || e.type === 'transfer_out') {
      if (st.rated) {
        const rate = st.qty > 0 ? st.cost / st.qty : st.lastRate;
        const removed = Math.round(rate * e.amount);
        st.cost -= removed;
        st.qty -= e.amount;
        if (e.type === 'transfer_out' && e.transferId !== null) {
          transferCostVnd.set(e.transferId, removed);
        }
      } else {
        st.qty -= e.amount;
        st.unratedQty -= e.amount;
        if (e.type === 'transfer_out' && e.transferId !== null) {
          transferCostVnd.set(e.transferId, null);
        }
      }
    } else if (e.type === 'income') {
      if (st.rated) {
        const rate = st.qty > 0 ? st.cost / st.qty : st.lastRate;
        st.cost += Math.round(rate * e.amount);
        st.qty += e.amount;
      } else {
        st.qty += e.amount;
        st.unratedQty += e.amount;
      }
    } else if (e.type === 'transfer_in') {
      const inCost = e.transferId !== null ? (transferCostVnd.get(e.transferId) ?? null) : null;
      if (inCost !== null && e.amount > 0) {
        if (!st.rated) {
          st.rated = true;
          const inflowRate = inCost / e.amount;
          st.cost = inCost + Math.round(st.unratedQty * inflowRate);
          st.unratedQty = 0;
        } else {
          st.cost += inCost;
        }
        st.qty += e.amount;
      } else {
        st.qty += e.amount;
        if (!st.rated) {
          st.unratedQty += e.amount;
        }
      }
    }

    if (st.rated && st.qty > 0) {
      st.lastRate = st.cost / st.qty;
    }
  }

  const result = new Map<string, number | null>();
  for (const w of wallets) {
    if (w.currency === 'VND') {
      result.set(w.id, walletBalance(w, entries));
    } else {
      const st = states.get(w.id);
      if (!st || !st.rated) {
        result.set(w.id, null);
      } else {
        result.set(w.id, st.cost);
      }
    }
  }

  return result;
}

export interface VndTotal {
  totalVnd: number;
  approximate: boolean;
  perCurrency: { currency: CurrencyCode; balance: number }[];
  unratedWalletIds: string[];
}

export function vndTotal(wallets: CalcWallet[], entries: CalcEntry[]): VndTotal {
  const vndValues = walletVndValues(wallets, entries);
  let totalVnd = 0;
  let approximate = false;
  const unratedWalletIds: string[] = [];
  const currencyBalances = new Map<CurrencyCode, number>();

  for (const w of wallets) {
    if (w.archived) continue;
    const bal = walletBalance(w, entries);
    currencyBalances.set(w.currency, (currencyBalances.get(w.currency) ?? 0) + bal);

    if (w.currency !== 'VND' && bal !== 0) {
      approximate = true;
    }

    const vndVal = vndValues.get(w.id) ?? null;
    if (vndVal === null) {
      unratedWalletIds.push(w.id);
    } else {
      totalVnd += vndVal;
    }
  }

  const perCurrency: { currency: CurrencyCode; balance: number }[] = [];
  for (const code of CURRENCY_CODES) {
    const bal = currencyBalances.get(code);
    if (bal !== undefined) {
      perCurrency.push({ currency: code, balance: bal });
    }
  }

  return {
    totalVnd,
    approximate,
    perCurrency,
    unratedWalletIds,
  };
}

export interface CountedRow {
  currency: CurrencyCode;
  signedAmount: number;
  counted: boolean;
} // − for money out

export function sumCounted(
  rows: CountedRow[],
): { currency: CurrencyCode; spent: number; income: number }[] {
  const map = new Map<CurrencyCode, { spent: number; income: number }>();

  for (const row of rows) {
    if (!row.counted) continue;
    let acc = map.get(row.currency);
    if (!acc) {
      acc = { spent: 0, income: 0 };
      map.set(row.currency, acc);
    }
    if (row.signedAmount < 0) {
      acc.spent += -row.signedAmount;
    } else if (row.signedAmount > 0) {
      acc.income += row.signedAmount;
    }
  }

  const result: { currency: CurrencyCode; spent: number; income: number }[] = [];
  for (const code of CURRENCY_CODES) {
    const acc = map.get(code);
    if (acc && (acc.spent !== 0 || acc.income !== 0)) {
      result.push({ currency: code, spent: acc.spent, income: acc.income });
    }
  }

  return result;
}
