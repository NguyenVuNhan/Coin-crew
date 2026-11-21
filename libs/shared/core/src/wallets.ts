import { CURRENCY_CODES, type CurrencyCode } from './currency';

export type PersonalEntryType =
  | 'expense'
  | 'income'
  | 'transfer_out'
  | 'transfer_in'
  | 'buy'
  | 'sell';

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
  assetId?: string | null;
  quantity?: number | null;
}

export interface Holding {
  assetId: string;
  quantity: number;
  cost: number;
  costVnd: number | null;
}

export function isBeforeStart(
  _entry: Pick<CalcEntry, 'date'>,
  _wallet: Pick<CalcWallet, 'startDate'>,
): boolean {
  return false;
}

export function walletBalance(wallet: CalcWallet, entries: CalcEntry[]): number {
  let balance = wallet.startAmount;
  for (const e of entries) {
    if (e.walletId !== wallet.id) continue;
    if (isBeforeStart(e, wallet)) continue;
    if (e.type === 'income' || e.type === 'transfer_in' || e.type === 'sell') {
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
  if (t === 'sell') return 3;
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

function applyBuyToHolding(
  holdings: Map<string, Holding>,
  assetId: string | null | undefined,
  quantity: number | null | undefined,
  cost: number,
  costVnd: number | null,
): void {
  if (!assetId || !quantity || quantity <= 0) return;
  let h = holdings.get(assetId);
  if (!h) {
    h = { assetId, quantity: 0, cost: 0, costVnd: costVnd === null ? null : 0 };
    holdings.set(assetId, h);
  }
  h.quantity += quantity;
  h.cost += cost;
  if (costVnd !== null) {
    h.costVnd = (h.costVnd ?? 0) + costVnd;
  }
}

function applySellToHolding(
  holdings: Map<string, Holding>,
  assetId: string | null | undefined,
  quantity: number | null | undefined,
): void {
  if (!assetId || !quantity || quantity <= 0) return;
  const h = holdings.get(assetId);
  if (!h || h.quantity <= 0) return;
  if (quantity >= h.quantity) {
    holdings.delete(assetId);
    return;
  }
  const removedCost = Math.round((h.cost * quantity) / h.quantity);
  const removedCostVnd =
    h.costVnd !== null ? Math.round((h.costVnd * quantity) / h.quantity) : null;
  h.quantity -= quantity;
  h.cost -= removedCost;
  if (h.costVnd !== null && removedCostVnd !== null) {
    h.costVnd -= removedCostVnd;
  }
}

function replayWallets(
  wallets: CalcWallet[],
  entries: CalcEntry[],
): {
  vndValues: Map<string, number | null>;
  cashVndValues: Map<string, number | null>;
  holdingsByWallet: Map<string, Holding[]>;
} {
  const walletMap = new Map<string, CalcWallet>();
  const states = new Map<string, NonVndState>();
  const holdingsMaps = new Map<string, Map<string, Holding>>();

  for (const w of wallets) {
    walletMap.set(w.id, w);
    holdingsMaps.set(w.id, new Map<string, Holding>());
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

    const hMap = holdingsMaps.get(w.id)!;

    if (w.currency === 'VND') {
      if (e.type === 'transfer_out' && e.transferId !== null) {
        transferCostVnd.set(e.transferId, e.amount);
      } else if (e.type === 'buy') {
        applyBuyToHolding(hMap, e.assetId, e.quantity, e.amount, e.amount);
      } else if (e.type === 'sell') {
        applySellToHolding(hMap, e.assetId, e.quantity);
      }
      continue;
    }

    const st = states.get(w.id);
    if (!st) continue;

    if (e.type === 'expense' || e.type === 'transfer_out' || e.type === 'buy') {
      if (st.rated) {
        const rate = st.qty > 0 ? st.cost / st.qty : st.lastRate;
        const removed = Math.round(rate * e.amount);
        st.cost -= removed;
        st.qty -= e.amount;
        if (e.type === 'transfer_out' && e.transferId !== null) {
          transferCostVnd.set(e.transferId, removed);
        } else if (e.type === 'buy') {
          applyBuyToHolding(hMap, e.assetId, e.quantity, e.amount, removed);
        }
      } else {
        st.qty -= e.amount;
        st.unratedQty -= e.amount;
        if (e.type === 'transfer_out' && e.transferId !== null) {
          transferCostVnd.set(e.transferId, null);
        } else if (e.type === 'buy') {
          applyBuyToHolding(hMap, e.assetId, e.quantity, e.amount, null);
        }
      }
    } else if (e.type === 'income' || e.type === 'sell') {
      if (e.type === 'sell') {
        applySellToHolding(hMap, e.assetId, e.quantity);
      }
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
          for (const h of hMap.values()) {
            h.costVnd = Math.round(h.cost * inflowRate);
          }
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

  const vndValues = new Map<string, number | null>();
  const cashVndValues = new Map<string, number | null>();
  const holdingsByWallet = new Map<string, Holding[]>();

  for (const w of wallets) {
    const hMap = holdingsMaps.get(w.id)!;
    const holdings = [...hMap.values()];
    holdingsByWallet.set(w.id, holdings);

    if (w.currency === 'VND') {
      const cash = walletBalance(w, entries);
      let holdingsVnd = 0;
      for (const h of holdings) holdingsVnd += h.cost;
      cashVndValues.set(w.id, cash);
      vndValues.set(w.id, cash + holdingsVnd);
    } else {
      const st = states.get(w.id);
      if (!st || !st.rated) {
        cashVndValues.set(w.id, null);
        vndValues.set(w.id, null);
      } else {
        let holdingsVnd = 0;
        for (const h of holdings) holdingsVnd += h.costVnd ?? 0;
        cashVndValues.set(w.id, st.cost);
        vndValues.set(w.id, st.cost + holdingsVnd);
      }
    }
  }

  return { vndValues, cashVndValues, holdingsByWallet };
}

export function walletHoldings(
  wallet: CalcWallet,
  entries: CalcEntry[],
  allWallets?: CalcWallet[],
): Holding[] {
  return replayWallets(allWallets ?? [wallet], entries).holdingsByWallet.get(wallet.id) ?? [];
}

export function findOversell(
  wallet: CalcWallet,
  entries: CalcEntry[],
): { assetId: string; date: string } | null {
  const trades = entries
    .filter(
      (e) =>
        e.walletId === wallet.id &&
        !isBeforeStart(e, wallet) &&
        (e.type === 'buy' || e.type === 'sell'),
    )
    .sort(compareEntries);

  const held = new Map<string, number>();
  for (const e of trades) {
    if (!e.assetId || !e.quantity || e.quantity <= 0) continue;
    const cur = held.get(e.assetId) ?? 0;
    if (e.type === 'buy') {
      held.set(e.assetId, cur + e.quantity);
    } else {
      if (e.quantity > cur) {
        return { assetId: e.assetId, date: e.date };
      }
      held.set(e.assetId, cur - e.quantity);
    }
  }
  return null;
}

export function walletVndValues(
  wallets: CalcWallet[],
  entries: CalcEntry[],
): Map<string, number | null> {
  return replayWallets(wallets, entries).vndValues;
}

export interface VndTotal {
  totalVnd: number;
  cashVnd?: number;
  approximate: boolean;
  perCurrency: { currency: CurrencyCode; balance: number }[];
  unratedWalletIds: string[];
}

export function vndTotal(wallets: CalcWallet[], entries: CalcEntry[]): VndTotal {
  const { vndValues, cashVndValues, holdingsByWallet } = replayWallets(wallets, entries);
  let totalVnd = 0;
  let cashVnd = 0;
  let approximate = false;
  const unratedWalletIds: string[] = [];
  const currencyBalances = new Map<CurrencyCode, number>();

  for (const w of wallets) {
    if (w.archived) continue;
    const bal = walletBalance(w, entries);
    currencyBalances.set(w.currency, (currencyBalances.get(w.currency) ?? 0) + bal);

    const hasHoldings = (holdingsByWallet.get(w.id)?.length ?? 0) > 0;
    if (w.currency !== 'VND' && (bal !== 0 || hasHoldings)) {
      approximate = true;
    }

    const vndVal = vndValues.get(w.id) ?? null;
    if (vndVal === null) {
      unratedWalletIds.push(w.id);
    } else {
      totalVnd += vndVal;
    }

    const cashVal = cashVndValues.get(w.id) ?? null;
    if (cashVal !== null) {
      cashVnd += cashVal;
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
    ...(cashVnd !== totalVnd ? { cashVnd } : {}),
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
