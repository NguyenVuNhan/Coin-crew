import type { CategoryView, WalletDetailView } from './api-types';
import type { CurrencyCode } from './currency';
import type { CountedSpendRow } from './reports';
import { categoryRoot } from './visibility';

export interface EventDef {
  id: string;
  tagId: string;
  name: string;
  start: string;
  end: string;
  countsFrom: string;
  groupIds: string[];
  budgetId: string | null;
}

export type EventState = 'upcoming' | 'on' | 'done';

export type EventMatch = { event: EventDef; mode: 'on' | 'leadup' };

function parseYmd(ymd: string): [number, number, number] {
  const [y, m, d] = ymd.split('-').map(Number);
  return [y ?? 1970, m ?? 1, d ?? 1];
}

function diffDaysUtc(from: string, to: string): number {
  const [y1, m1, d1] = parseYmd(from);
  const [y2, m2, d2] = parseYmd(to);
  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((t2 - t1) / 86400000);
}

function pickEarliestStart(matches: EventDef[]): EventDef | null {
  if (matches.length === 0) return null;
  let best = matches[0]!;
  for (let i = 1; i < matches.length; i++) {
    const candidate = matches[i]!;
    if (candidate.start < best.start) {
      best = candidate;
    }
  }
  return best;
}

/** Returns whether a trip is upcoming, currently on, or done for the given local YYYY-MM-DD date. */
export function eventState(t: EventDef, today: string): EventState {
  if (today < t.start) return 'upcoming';
  if (today <= t.end) return 'on';
  return 'done';
}

/**
 * Matches a trip for a given date: 'on' when start <= date <= end, otherwise 'leadup'
 * when countsFrom <= date < start (picking the earliest start among matching lead-ups).
 */
export function eventForDate(events: EventDef[], date: string): EventMatch | null {
  const onMatches = events.filter((t) => t.start <= date && date <= t.end);
  const on = pickEarliestStart(onMatches);
  if (on) return { event: on, mode: 'on' };

  const leadupMatches = events.filter((t) => t.countsFrom <= date && date < t.start);
  const leadup = pickEarliestStart(leadupMatches);
  if (leadup) return { event: leadup, mode: 'leadup' };

  return null;
}

/**
 * Matches a trip for a CoinCrew share: only trips whose groupIds include share.tripId
 * and whose countsFrom <= date <= end. Prefers 'on' over 'leadup', then earliest start.
 */
export function eventForShare(
  events: EventDef[],
  share: { tripId: string; date: string },
): EventDef | null {
  const eligible = events.filter(
    (t) => t.groupIds.includes(share.tripId) && t.countsFrom <= share.date && share.date <= t.end,
  );
  const onMatches = eligible.filter((t) => t.start <= share.date && share.date <= t.end);
  if (onMatches.length > 0) return pickEarliestStart(onMatches);
  return pickEarliestStart(eligible);
}

/**
 * Finds an existing trip whose active [start, end] range overlaps (including touching)
 * the given [start, end] range, ignoring lead-up windows and optional exceptId.
 */
export function findEventOverlap(
  events: EventDef[],
  start: string,
  end: string,
  exceptId?: string,
): EventDef | null {
  for (const t of events) {
    if (exceptId !== undefined && t.id === exceptId) continue;
    if (start <= t.end && t.start <= end) return t;
  }
  return null;
}

/** Default countsFrom date: min(today, start). */
export function defaultCountsFrom(start: string, today: string): string {
  return today <= start ? today : start;
}

/** 1-based day index within a trip when today is inside [start, end], otherwise null. */
export function eventDayIndex(t: EventDef, today: string): { day: number; of: number } | null {
  if (today < t.start || today > t.end) return null;
  return {
    day: diffDaysUtc(t.start, today) + 1,
    of: diffDaysUtc(t.start, t.end) + 1,
  };
}

/** Signed number of days from today until t.start. */
export function daysUntil(t: EventDef, today: string): number {
  return diffDaysUtc(today, t.start);
}

export interface EventCurrencySummary {
  currency: CurrencyCode;
  total: number;
  own: number;
  group: number;
  byCategory: { categoryId: string; amount: number }[];
  byDay: { date: string | 'leadup'; amount: number }[];
  count: number;
}

export interface EventSummary {
  currencies: EventCurrencySummary[];
  approxVnd: number | null;
  rowIds: string[];
}

/**
 * Filters counted spend rows to those belonging to `t`: tagged with `t.tagId`,
 * within `t.countsFrom <= date <= t.end`, and on a non-null wallet not excluded from reports.
 */
export function eventRows(
  t: EventDef,
  rows: CountedSpendRow[],
  wallets: WalletDetailView[],
): CountedSpendRow[] {
  const includedWalletIds = new Set(
    wallets.filter((w) => !w.excludeFromReports).map((w) => w.id),
  );
  return rows.filter(
    (row) =>
      row.tagIds.includes(t.tagId) &&
      t.countsFrom <= row.date &&
      row.date <= t.end &&
      row.walletId !== null &&
      includedWalletIds.has(row.walletId),
  );
}

function summarizeCurrencyRows(
  currency: CurrencyCode,
  rows: CountedSpendRow[],
  tripStart: string,
  resolveTopCategoryId: (categoryId: string) => string,
): EventCurrencySummary {
  let own = 0;
  let group = 0;
  const categoryTotals = new Map<string, number>();
  const dayTotals = new Map<string | 'leadup', number>();

  for (const row of rows) {
    if (row.kind === 'entry') {
      own += row.amount;
    } else {
      group += row.amount;
    }

    const topCatId = resolveTopCategoryId(row.categoryId);
    categoryTotals.set(topCatId, (categoryTotals.get(topCatId) ?? 0) + row.amount);

    const dayKey: string | 'leadup' = row.date < tripStart ? 'leadup' : row.date;
    dayTotals.set(dayKey, (dayTotals.get(dayKey) ?? 0) + row.amount);
  }

  const byCategory = Array.from(categoryTotals.entries())
    .map(([categoryId, amount]) => ({ categoryId, amount }))
    .sort((a, b) => b.amount - a.amount);

  const byDay = Array.from(dayTotals.entries())
    .filter(([, amount]) => amount !== 0)
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => {
      if (a.date === 'leadup') return -1;
      if (b.date === 'leadup') return 1;
      return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    });

  return {
    currency,
    total: own + group,
    own,
    group,
    byCategory,
    byDay,
    count: rows.length,
  };
}

/** Summarizes a trip's counted spend per currency, category root, day, and optional approx VND. */
export function summarizeEvent(
  t: EventDef,
  rows: CountedSpendRow[],
  wallets: WalletDetailView[],
  categories: CategoryView[],
): EventSummary {
  const matched = eventRows(t, rows, wallets);
  const categoriesById = new Map(categories.map((c) => [c.id, c]));
  const topCategoryCache = new Map<string, string>();

  const resolveTopCategoryId = (categoryId: string): string => {
    const cached = topCategoryCache.get(categoryId);
    if (cached !== undefined) return cached;
    const cat = categoriesById.get(categoryId);
    const rootId = cat ? categoryRoot(cat, categories).id : categoryId;
    topCategoryCache.set(categoryId, rootId);
    return rootId;
  };

  const byCurrency = new Map<CurrencyCode, CountedSpendRow[]>();
  let hasForeign = false;
  let hasUnrated = false;
  let vndSum = 0;

  for (const row of matched) {
    const list = byCurrency.get(row.currency);
    if (list) {
      list.push(row);
    } else {
      byCurrency.set(row.currency, [row]);
    }

    if (row.currency !== 'VND') {
      hasForeign = true;
    }
    if (row.vnd == null) {
      hasUnrated = true;
    } else {
      vndSum += row.vnd;
    }
  }

  const currencies = Array.from(byCurrency.entries())
    .map(([currency, cRows]) =>
      summarizeCurrencyRows(currency, cRows, t.start, resolveTopCategoryId),
    )
    .sort((a, b) => {
      if (a.currency === 'VND' && b.currency !== 'VND') return -1;
      if (b.currency === 'VND' && a.currency !== 'VND') return 1;
      return b.total - a.total;
    });

  return {
    currencies,
    approxVnd: hasForeign && !hasUnrated ? vndSum : null,
    rowIds: matched.map((r) => r.id),
  };
}
