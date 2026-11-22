import type { ListQuery, ListRow } from './api-types';
import { matchesNote, monthBounds } from './listFilter';
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
  activityAt: string;
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

export function createGroupWalletResolver(
  wallets: (CalcWallet & { kind?: string; isDefault?: boolean })[],
  defaultWalletId: string | null,
): (row: GroupRow) => string | null {
  const byId = new Map<string, GroupWalletCandidate>();
  for (const w of wallets) byId.set(w.id, w);
  const chosen = pickFallbackVndWallet(wallets, defaultWalletId);

  return (row: GroupRow): string | null => {
    const linkedId = row.link?.walletId ?? null;
    if (linkedId !== null) {
      const linked = byId.get(linkedId);
      if (linked && linked.currency === 'VND') {
        return linked.id;
      }
    }
    return chosen;
  };
}

export function groupWalletEntries(
  rows: GroupRow[],
  wallets: (CalcWallet & { kind?: string; isDefault?: boolean })[],
  defaultWalletId: string | null,
  settings: GroupSettingsView,
): CalcEntry[] {
  const resolveWalletId = createGroupWalletResolver(wallets, defaultWalletId);
  const entries: CalcEntry[] = [];

  for (const row of rows) {
    if (row.pending) continue;
    const { walletDelta } = groupRowEffect(row, settings);
    if (walletDelta === 0) continue;

    const walletId = resolveWalletId(row);
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

export type BookRow = ListRow | GroupRow;

export type GroupListQuery = Omit<ListQuery, 'type'> & {
  type?: ListQuery['type'] | 'group';
};

export interface FilterGroupRowsOptions {
  settings?: GroupSettingsView;
  paybacks?: Map<string, number>;
  fallbackGroupCategoryId?: string | null;
  categoryParentOf?: (categoryId: string) => string | null;
  period?: { from: string; to: string };
}

const DEFAULT_GROUP_SETTINGS: GroupSettingsView = {
  defaultGroupCategoryId: null,
  countLoans: false,
};

export function groupRowCategoryId(
  row: GroupRow,
  settings: GroupSettingsView,
  fallbackGroupCategoryId: string | null,
): string | null {
  return row.link?.categoryId ?? settings.defaultGroupCategoryId ?? fallbackGroupCategoryId;
}

export function groupRowsTotals(
  rows: GroupRow[],
  settings: GroupSettingsView,
  paybacks: Map<string, number>,
): { spent: number; income: number } {
  let spent = 0;
  let income = 0;
  for (const row of rows) {
    const eff = groupRowEffect(row, settings, paybacks.get(row.id));
    spent += eff.spending;
    income += eff.income;
  }
  return { spent: normZero(spent), income: normZero(income) };
}

function bookRowSortFields(row: BookRow): { date: string; createdAt: string; id: string } {
  if (row.kind === 'entry') {
    return { date: row.entry.date, createdAt: row.entry.createdAt, id: row.entry.id };
  }
  return { date: row.date, createdAt: row.createdAt, id: row.id };
}

export function compareBookRows(a: BookRow, b: BookRow): number {
  const ka = bookRowSortFields(a);
  const kb = bookRowSortFields(b);
  if (ka.date !== kb.date) return ka.date > kb.date ? -1 : 1;
  if (ka.createdAt !== kb.createdAt) return ka.createdAt > kb.createdAt ? -1 : 1;
  if (ka.id !== kb.id) return ka.id < kb.id ? -1 : 1;
  return 0;
}

function recentRowSortFields(row: BookRow): { activityAt: string; id: string } {
  if (row.kind === 'entry') {
    return { activityAt: row.entry.createdAt, id: row.entry.id };
  }
  if (row.kind === 'group') {
    return { activityAt: row.activityAt, id: row.id };
  }
  return { activityAt: row.createdAt, id: row.id };
}

export function compareRecentRows(a: BookRow, b: BookRow): number {
  const ka = recentRowSortFields(a);
  const kb = recentRowSortFields(b);
  if (ka.activityAt !== kb.activityAt) return ka.activityAt > kb.activityAt ? -1 : 1;
  if (ka.id !== kb.id) return ka.id < kb.id ? -1 : 1;
  return 0;
}

export function filterGroupRows(
  rows: GroupRow[],
  query: GroupListQuery,
  tagNames: Map<string, string>,
  resolveWalletId?: (row: GroupRow) => string | null,
  opts?: FilterGroupRowsOptions,
): GroupRow[] {
  if (query.groups !== 'show') return [];
  if (query.assetId) return [];
  if (
    query.type !== undefined &&
    query.type !== 'group' &&
    query.type !== 'expense' &&
    query.type !== 'income'
  ) {
    return [];
  }

  const settings = opts?.settings ?? DEFAULT_GROUP_SETTINGS;
  const paybacks = opts?.paybacks;
  const fallbackGroupCategoryId = opts?.fallbackGroupCategoryId ?? null;
  const categoryParentOf = opts?.categoryParentOf;

  let from: string | undefined;
  let to: string | undefined;
  if (opts?.period) {
    from = opts.period.from;
    to = opts.period.to;
  } else if (query.month !== undefined) {
    const bounds = monthBounds(query.month);
    if (bounds) {
      from = bounds.from;
      to = bounds.to;
    }
  } else {
    from = query.from;
    to = query.to;
  }

  const q = query.q?.trim();
  const hasQ = q !== undefined && q.length > 0;

  return rows.filter((row) => {
    if (from !== undefined && row.date < from) return false;
    if (to !== undefined && row.date > to) return false;

    if (query.type === 'expense' || query.type === 'income') {
      const eff = groupRowEffect(row, settings, paybacks?.get(row.id));
      if (query.type === 'expense' && eff.spending <= 0) return false;
      if (query.type === 'income' && eff.income <= 0) return false;
    }

    if (query.tripId && row.tripId !== query.tripId) return false;

    if (query.walletId) {
      const rowWalletId = resolveWalletId
        ? resolveWalletId(row)
        : (row.link?.walletId ?? null);
      if (rowWalletId !== query.walletId) return false;
    }

    if (query.categoryId) {
      const catId = groupRowCategoryId(row, settings, fallbackGroupCategoryId);
      if (!catId) return false;
      const matchesCategory =
        catId === query.categoryId ||
        (categoryParentOf !== undefined && categoryParentOf(catId) === query.categoryId);
      if (!matchesCategory) return false;
    }

    if (query.tagId) {
      if (!(row.link?.tagIds.includes(query.tagId) ?? false)) return false;
    }

    if (hasQ) {
      const matchesText =
        matchesNote(row.title, q) ||
        matchesNote(row.tripName, q) ||
        (row.counterpartName !== null && matchesNote(row.counterpartName, q)) ||
        (row.payerName !== null && matchesNote(row.payerName, q)) ||
        (row.link?.tagIds.some((tid) => {
          const name = tagNames.get(tid);
          return name !== undefined && matchesNote(name, q);
        }) ??
          false);
      if (!matchesText) return false;
    }

    return true;
  });
}
