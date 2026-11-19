import type { ListQuery, ListRow } from './api-types';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Normalizes text for accent-insensitive search.
 * Applies NFD decomposition, strips combining diacritical marks (U+0300–U+036F),
 * replaces đ/Đ with d, and converts to lower case. Does NOT collapse or trim spaces.
 */
export function foldForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
}

/**
 * Checks if a note matches the search query `q`.
 * An empty or whitespace-only query matches everything; otherwise matches
 * if the accent-folded note contains the accent-folded, trimmed query.
 */
export function matchesNote(note: string | null | undefined, q: string): boolean {
  const trimmed = q.trim();
  if (trimmed.length === 0) {
    return true;
  }
  return foldForSearch(note ?? '').includes(foldForSearch(trimmed));
}

/**
 * Returns the first and last day ('YYYY-MM-01' and 'YYYY-MM-DD') for a valid 'YYYY-MM' month string.
 * Returns null when the given string is not a valid month format.
 */
export function monthBounds(month: string): { from: string; to: string } | null {
  if (!MONTH_RE.test(month)) {
    return null;
  }
  const year = Number(month.slice(0, 4));
  const mon = Number(month.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return {
    from: `${month}-01`,
    to: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

/**
 * Resolves the start and end dates for a list query against `today`.
 * If `query.month` is given, returns its bounds (falling back to today's month if invalid).
 * Otherwise `to` defaults to `today` and `from` defaults to the first day of `to`'s month.
 */
export function resolveListPeriod(query: ListQuery, today: string): { from: string; to: string } {
  if (query.month !== undefined) {
    const bounds = monthBounds(query.month);
    if (bounds) {
      return bounds;
    }
    const todayMonth = today.slice(0, 7);
    const fallbackBounds = monthBounds(todayMonth);
    if (fallbackBounds) {
      return fallbackBounds;
    }
    return { from: `${todayMonth}-01`, to: today };
  }
  const to = query.to ?? today;
  const from = query.from ?? `${to.slice(0, 7)}-01`;
  return { from, to };
}

function rowSortFields(row: ListRow): { date: string; time: string | null; createdAt: string; id: string } {
  if (row.kind === 'entry') {
    return { date: row.entry.date, time: row.entry.time, createdAt: row.entry.createdAt, id: row.entry.id };
  }
  return { date: row.date, time: null, createdAt: row.createdAt, id: row.id };
}

/**
 * Compares two ListRows for descending sort order: date desc, then time desc
 * (with null time last), then createdAt desc, then id asc.
 */
export function compareListRows(a: ListRow, b: ListRow): number {
  const ka = rowSortFields(a);
  const kb = rowSortFields(b);
  if (ka.date !== kb.date) return ka.date > kb.date ? -1 : 1;
  if (ka.time !== kb.time) {
    if (ka.time === null) return 1;
    if (kb.time === null) return -1;
    return ka.time > kb.time ? -1 : 1;
  }
  if (ka.createdAt !== kb.createdAt) return ka.createdAt > kb.createdAt ? -1 : 1;
  // Ties (both sides of a transfer share date, time and createdAt) fall back to the id, so the server and the
  // saved copy always agree on the order.
  if (ka.id !== kb.id) return ka.id < kb.id ? -1 : 1;
  return 0;
}

/**
 * Determines whether a ListRow matches the given ListQuery under the provided context rules.
 * Applies period bounds, type/wallet/category/asset/tag filters, and accent-insensitive note search.
 */
export function matchesListQuery(
  row: ListRow,
  query: ListQuery,
  ctx: {
    period: { from: string; to: string };
    tagIdsOf(entryId: string): string[];
    categoryParentOf(categoryId: string): string | null;
    defaultWalletId: string | null;
  },
): boolean {
  const date = row.kind === 'entry' ? row.entry.date : row.date;
  if (date < ctx.period.from || date > ctx.period.to) {
    return false;
  }

  if (row.kind === 'entry') {
    const e = row.entry;
    if (query.type !== undefined) {
      if (query.type === 'person') {
        return false;
      }
      if (query.type === 'expense' && e.type !== 'expense') {
        return false;
      }
      if (query.type === 'income' && e.type !== 'income') {
        return false;
      }
      if (query.type === 'transfer' && e.type !== 'transfer_out' && e.type !== 'transfer_in') {
        return false;
      }
      if (query.type === 'trade' && e.type !== 'buy' && e.type !== 'sell') {
        return false;
      }
    }
    if (query.walletId && e.walletId !== query.walletId) {
      return false;
    }
    if (query.categoryId) {
      if (!e.categoryId) {
        return false;
      }
      const matchesCategory =
        e.categoryId === query.categoryId ||
        ctx.categoryParentOf(e.categoryId) === query.categoryId;
      if (!matchesCategory) {
        return false;
      }
    }
    if (query.assetId && e.assetId !== query.assetId) {
      return false;
    }
    if (query.tagId) {
      const tagIds = ctx.tagIdsOf(e.id);
      if (!tagIds.includes(query.tagId)) {
        return false;
      }
    }
    if (query.q && !matchesNote(e.note, query.q)) {
      return false;
    }
    return true;
  }

  // row.kind === 'person'
  if (query.categoryId || query.assetId || query.tagId) {
    return false;
  }
  if (query.type !== undefined && query.type !== 'person') {
    return false;
  }
  if (ctx.defaultWalletId === null) {
    return false;
  }
  if (query.walletId && query.walletId !== ctx.defaultWalletId) {
    return false;
  }
  if (query.q && !matchesNote(row.note, query.q)) {
    return false;
  }
  return true;
}
