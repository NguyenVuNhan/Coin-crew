import type { CategoryView, WalletDetailView } from './api-types';
import type { CurrencyCode } from './currency';
import { foldForSearch } from './listFilter';
import type { CountedSpendRow } from './reports';
import { categoryRoot } from './visibility';

export interface EventDef {
  id: string;
  tagId: string | null;
  name: string;
  start: string;            // YYYY-MM-DD, always set
  end: string | null;       // null = runs until stopped
  stoppedAt: string | null; // ISO timestamp when Dừng was tapped
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

function formatYmdUtc(dt: Date): string {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDdmmyy(ymd: string): string {
  const [y = '', m = '', d = ''] = ymd.split('-');
  return `${d}${m}${y.slice(-2)}`;
}

/** Returns whether an event is upcoming, currently on, or done for the given local YYYY-MM-DD date. */
export function eventState(e: EventDef, today: string): EventState {
  if (e.stoppedAt !== null) return 'done';
  if (today < e.start) return 'upcoming';
  if (e.end === null || today <= e.end) return 'on';
  return 'done';
}

/**
 * Returns the last YYYY-MM-DD date that auto-tags for `e`, or `null` when open-ended.
 * If `stoppedAt` is set, takes the smaller of `end` and the day before `stoppedAt`'s local date.
 */
export function eventMatchEnd(e: EventDef): string | null {
  if (e.stoppedAt !== null) {
    const stopped = new Date(e.stoppedAt);
    const dayBeforeStop = formatYmdUtc(
      new Date(Date.UTC(stopped.getFullYear(), stopped.getMonth(), stopped.getDate() - 1)),
    );
    if (e.end === null) return dayBeforeStop;
    return dayBeforeStop < e.end ? dayBeforeStop : e.end;
  }
  return e.end;
}

/**
 * Returns all events matching `date`, sorted by `start` ascending.
 * Matches `'on'` when `start <= date` and (`matchEnd === null || date <= matchEnd`),
 * or `'leadup'` when `countsFrom <= date < start`. One match per event, `'on'` wins.
 */
export function eventsForDate(events: EventDef[], date: string): EventMatch[] {
  const matches: EventMatch[] = [];
  for (const event of events) {
    const matchEnd = eventMatchEnd(event);
    if (event.start <= date && (matchEnd === null || date <= matchEnd)) {
      matches.push({ event, mode: 'on' });
    } else if (event.countsFrom <= date && date < event.start) {
      matches.push({ event, mode: 'leadup' });
    }
  }
  return matches.sort((a, b) =>
    a.event.start < b.event.start ? -1 : a.event.start > b.event.start ? 1 : 0,
  );
}

/**
 * Returns every event whose `groupIds` include `share.tripId`, `countsFrom <= date`,
 * and (`matchEnd === null || date <= matchEnd`), sorted by `start` ascending.
 */
export function eventsForShare(
  events: EventDef[],
  share: { tripId: string; date: string },
): EventDef[] {
  return events
    .filter((e) => {
      if (!e.groupIds.includes(share.tripId)) return false;
      if (share.date < e.countsFrom) return false;
      const matchEnd = eventMatchEnd(e);
      return matchEnd === null || share.date <= matchEnd;
    })
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}

/** Builds a generated tag name from an event's name and dates: `<slug>-<ddmmyy>[-<ddmmyy>]`. */
export function eventTagName(name: string, start: string, end: string | null): string {
  const folded = foldForSearch(name).replace(/[^a-z0-9]/g, '');
  const base = folded.length > 0 ? folded : 'event';
  const startPart = formatDdmmyy(start);
  if (end === null) {
    return `${base}-${startPart}`;
  }
  return `${base}-${startPart}-${formatDdmmyy(end)}`;
}

/** Returns `base` if not in `taken` (case-insensitively), else `base-2`, `base-3`, etc. */
export function uniqueTagName(base: string, taken: Iterable<string>): string {
  const takenLower = new Set<string>();
  for (const name of taken) {
    takenLower.add(name.toLowerCase());
  }
  if (!takenLower.has(base.toLowerCase())) {
    return base;
  }
  let n = 2;
  while (takenLower.has(`${base}-${n}`.toLowerCase())) {
    n++;
  }
  return `${base}-${n}`;
}

/** Default countsFrom date: min(today, start). */
export function defaultCountsFrom(start: string, today: string): string {
  return today <= start ? today : start;
}

/** 1-based day index within an event when currently `'on'`, otherwise null. */
export function eventDayIndex(e: EventDef, today: string): { day: number; of: number | null } | null {
  if (eventState(e, today) !== 'on') return null;
  return {
    day: diffDaysUtc(e.start, today) + 1,
    of: e.end === null ? null : diffDaysUtc(e.start, e.end) + 1,
  };
}

/** Signed number of days from today until e.start. */
export function daysUntil(e: EventDef, today: string): number {
  return diffDaysUtc(today, e.start);
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
 * Filters counted spend rows to those belonging to `e`: tagged with `e.tagId`,
 * and on a non-null wallet not excluded from reports. Returns `[]` when `e.tagId` is null.
 */
export function eventRows(
  e: EventDef,
  rows: CountedSpendRow[],
  wallets: WalletDetailView[],
): CountedSpendRow[] {
  if (e.tagId === null) return [];
  const tagId = e.tagId;
  const includedWalletIds = new Set(
    wallets.filter((w) => !w.excludeFromReports).map((w) => w.id),
  );
  return rows.filter(
    (row) =>
      row.tagIds.includes(tagId) &&
      row.walletId !== null &&
      includedWalletIds.has(row.walletId),
  );
}

function summarizeCurrencyRows(
  currency: CurrencyCode,
  rows: CountedSpendRow[],
  eventStart: string,
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

    const dayKey: string | 'leadup' = row.date < eventStart ? 'leadup' : row.date;
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

/** Summarizes an event's counted spend per currency, category root, day, and optional approx VND. */
export function summarizeEvent(
  e: EventDef,
  rows: CountedSpendRow[],
  wallets: WalletDetailView[],
  categories: CategoryView[],
): EventSummary {
  const matched = eventRows(e, rows, wallets);
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
      summarizeCurrencyRows(currency, cRows, e.start, resolveTopCategoryId),
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
