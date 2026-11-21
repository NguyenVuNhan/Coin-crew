import type { CalcEntry, CalcWallet } from './wallets';

export type GroupRowSource = 'expense' | 'fund' | 'payment';

export interface GroupLinkView {
  walletId: string | null;
  categoryId: string | null;
  tagIds: string[];
  intent: 'shared' | 'loan' | null;
  excludeFromReports: boolean;
}

export interface GroupRow {
  kind: 'group';
  id: string;
  rootId: string;
  tripId: string;
  tripName: string;
  isDirect: boolean;
  source: GroupRowSource;
  date: string;
  title: string;
  total: number;
  myShare: number;
  iPaid: boolean;
  payerName: string | null;
  counterpartName: string | null;
  people: string[];
  pending: boolean;
  link: GroupLinkView | null;
  createdAt: string;
}

export interface GroupSettingsView {
  defaultGroupCategoryId: string | null;
  countLoans: boolean;
}

export interface GroupEffect {
  spending: number;
  income: number;
  walletDelta: number;
}

function normZero(n: number): number {
  return n === 0 ? 0 : n;
}

export function groupRowEffect(
  row: GroupRow,
  settings: GroupSettingsView,
  payback?: number,
): GroupEffect {
  if (row.pending) {
    return { spending: 0, income: 0, walletDelta: 0 };
  }

  let spending = 0;
  let income = 0;
  let walletDelta = 0;

  if (row.source === 'fund') {
    if (row.iPaid) {
      spending = row.total;
      walletDelta = -row.total;
    }
  } else if (row.source === 'payment') {
    const pb = payback ?? 0;
    if (row.iPaid) {
      spending = settings.countLoans ? pb : 0;
      walletDelta = -row.total;
    } else {
      income = settings.countLoans ? pb : 0;
      walletDelta = row.total;
    }
  } else {
    // expense
    const isLoan = row.link?.intent === 'loan';
    if (isLoan) {
      if (row.iPaid) {
        spending = settings.countLoans ? row.total - row.myShare : 0;
        walletDelta = -row.total;
      } else {
        income = settings.countLoans ? row.myShare : 0;
        walletDelta = row.myShare;
      }
    } else if (row.iPaid) {
      spending = row.myShare;
      walletDelta = -row.total;
    } else {
      spending = row.myShare;
      walletDelta = 0;
    }
  }

  if (row.link?.excludeFromReports) {
    spending = 0;
    income = 0;
  }

  return {
    spending: normZero(spending),
    income: normZero(income),
    walletDelta: normZero(walletDelta),
  };
}

function compareGroupRows(a: GroupRow, b: GroupRow): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

function loanCounterpart(row: GroupRow): string | null {
  if (row.iPaid) {
    return row.people.length === 1 ? (row.people[0] ?? null) : null;
  }
  if (row.payerName) return row.payerName;
  return row.people.length === 1 ? (row.people[0] ?? null) : null;
}

export function loanPaybacks(rows: GroupRow[]): Map<string, number> {
  const result = new Map<string, number>();
  const direct = rows.filter((r) => r.isDirect && !r.pending).sort(compareGroupRows);

  // Positive = counterpart owes me (I lent); negative = I owe counterpart (I borrowed).
  const openByPerson = new Map<string, number>();

  for (const row of direct) {
    if (row.source === 'expense' && row.link?.intent === 'loan') {
      const person = loanCounterpart(row);
      if (!person) continue;
      const open = openByPerson.get(person) ?? 0;
      if (row.iPaid) {
        openByPerson.set(person, open + (row.total - row.myShare));
      } else {
        openByPerson.set(person, open - row.myShare);
      }
    } else if (row.source === 'payment') {
      const person = row.counterpartName;
      if (!person) continue;
      const open = openByPerson.get(person) ?? 0;
      let payback = 0;
      if (!row.iPaid && open > 0) {
        // Counterpart pays me back for what I lent
        payback = Math.min(row.total, open);
        openByPerson.set(person, open - payback);
      } else if (row.iPaid && open < 0) {
        // I pay counterpart back for what I borrowed
        payback = Math.min(row.total, -open);
        openByPerson.set(person, open + payback);
      }
      if (payback > 0) {
        result.set(row.id, payback);
      }
    }
  }

  return result;
}

type GroupWalletCandidate = CalcWallet & { kind?: string; isDefault?: boolean };

function pickFallbackVndWallet(
  wallets: GroupWalletCandidate[],
  defaultWalletId: string | null,
): string | null {
  const byId = new Map<string, GroupWalletCandidate>();
  for (const w of wallets) byId.set(w.id, w);

  const def =
    defaultWalletId !== null
      ? byId.get(defaultWalletId)
      : wallets.find((w) => w.isDefault);
  if (def && def.currency === 'VND' && !def.archived) {
    return def.id;
  }

  for (const w of wallets) {
    if (w.currency === 'VND' && !w.archived && (w.kind === undefined || w.kind === 'everyday')) {
      return w.id;
    }
  }

  return null;
}

export function groupWalletEntries(
  rows: GroupRow[],
  wallets: (CalcWallet & { kind?: string; isDefault?: boolean })[],
  defaultWalletId: string | null,
  settings: GroupSettingsView,
): CalcEntry[] {
  const byId = new Map<string, GroupWalletCandidate>();
  for (const w of wallets) byId.set(w.id, w);

  const chosen = pickFallbackVndWallet(wallets, defaultWalletId);
  const entries: CalcEntry[] = [];

  for (const row of rows) {
    if (row.pending) continue;
    const { walletDelta } = groupRowEffect(row, settings);
    if (walletDelta === 0) continue;

    let walletId: string | null = null;
    const linkedId = row.link?.walletId ?? null;
    if (linkedId !== null) {
      const linked = byId.get(linkedId);
      if (linked && linked.currency === 'VND') {
        walletId = linked.id;
      }
    }
    if (walletId === null) {
      walletId = chosen;
    }
    if (walletId === null) continue;

    entries.push({
      id: `g:${row.id}`,
      walletId,
      type: walletDelta > 0 ? 'income' : 'expense',
      amount: Math.abs(walletDelta),
      date: row.date,
      time: null,
      createdAt: row.createdAt,
      transferId: null,
      excludeFromReports: true,
    });
  }

  return entries;
}

export function groupNetFor(rows: GroupRow[], tripId: string): number {
  let net = 0;
  for (const row of rows) {
    if (row.tripId !== tripId) continue;
    if (row.pending) continue;
    if (row.source === 'fund') continue;
    if (row.source === 'expense') {
      if (row.iPaid) net += row.total;
      net -= row.myShare;
    } else if (row.source === 'payment') {
      if (row.iPaid) net += row.total;
      else net -= row.total;
    }
  }
  return normZero(net);
}
