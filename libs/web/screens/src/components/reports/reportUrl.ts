import type { ReportPeriodMode, ReportPeriodWindow, ReportQuery } from '@cc/core';
import type { useT } from '@cc/web-i18n';
import { todayLocal } from '@cc/web-util/localDate';

// --- Pure UTC Date Arithmetic Helpers ---

function parseYmd(ymd: string): [number, number, number] {
  const [y, m, d] = ymd.split('-').map(Number);
  return [y ?? 1970, m ?? 1, d ?? 1];
}

function formatYmd(year: number, month: number, day: number): string {
  const y = String(year).padStart(4, '0');
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysUtc(ymd: string, days: number): string {
  const [y, m, d] = parseYmd(ymd);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return formatYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function diffDaysUtc(from: string, to: string): number {
  const [y1, m1, d1] = parseYmd(from);
  const [y2, m2, d2] = parseYmd(to);
  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((t2 - t1) / 86400000);
}

export function addMonthsUtc(ym: string, deltaMonths: number): string {
  const [y, m] = ym.split('-').map(Number);
  const totalMonths = (y ?? 1970) * 12 + ((m ?? 1) - 1) + deltaMonths;
  const ry = Math.floor(totalMonths / 12);
  const rm = (((totalMonths % 12) + 12) % 12) + 1;
  return `${String(ry).padStart(4, '0')}-${String(rm).padStart(2, '0')}`;
}

export function formatDdMmYy(dateStr: string): string {
  return `${dateStr.slice(8, 10)}/${dateStr.slice(5, 7)}/${dateStr.slice(0, 4)}`;
}

/**
 * Parses URL search string into a strongly-typed ReportQuery.
 */
export function parseReportQueryFromSearch(search: string, today?: string): ReportQuery {
  const t = today ?? todayLocal();
  const searchStr = search.startsWith('?') ? search.slice(1) : search;
  const params = new URLSearchParams(searchStr);

  const rawMode = params.get('mode');
  const mode: ReportPeriodMode =
    rawMode === 'week' || rawMode === 'month' || rawMode === 'year' || rawMode === 'custom'
      ? rawMode
      : 'month';

  const rawGroups = params.get('groups');
  const includeGroups = rawGroups !== 'hide';

  const rawWalletId = params.get('walletId')?.trim();
  const walletId = rawWalletId && rawWalletId.length > 0 ? rawWalletId : undefined;

  const result: ReportQuery = {
    mode,
    includeGroups,
    ...(walletId ? { walletId } : {}),
  };

  if (mode === 'month') {
    const rawMonth = params.get('month');
    result.month = rawMonth && /^\d{4}-\d{2}$/.test(rawMonth) ? rawMonth : t.slice(0, 7);
  } else if (mode === 'week') {
    const rawWeek = params.get('week');
    result.week = rawWeek && /^\d{4}-\d{2}-\d{2}$/.test(rawWeek) ? rawWeek : t;
  } else if (mode === 'year') {
    const rawYear = params.get('year');
    result.year = rawYear && /^\d{4}$/.test(rawYear) ? rawYear : t.slice(0, 4);
  } else if (mode === 'custom') {
    const rawFrom = params.get('from');
    const rawTo = params.get('to');
    result.from = rawFrom && /^\d{4}-\d{2}-\d{2}$/.test(rawFrom) ? rawFrom : `${t.slice(0, 7)}-01`;
    result.to = rawTo && /^\d{4}-\d{2}-\d{2}$/.test(rawTo) ? rawTo : t;
  }

  return result;
}

/**
 * Serializes a ReportQuery into search params string ("" or "?mode=...").
 */
export function buildReportSearch(query: ReportQuery): string {
  const params = new URLSearchParams();

  if (query.mode) {
    params.set('mode', query.mode);
  }

  if (query.mode === 'month') {
    if (query.month) params.set('month', query.month);
  } else if (query.mode === 'week') {
    if (query.week) params.set('week', query.week);
  } else if (query.mode === 'year') {
    if (query.year) params.set('year', query.year);
  } else if (query.mode === 'custom') {
    if (query.from) params.set('from', query.from);
    if (query.to) params.set('to', query.to);
  }

  if (query.walletId && query.walletId.trim()) {
    params.set('walletId', query.walletId.trim());
  }

  if (!query.includeGroups) {
    params.set('groups', 'hide');
  }

  const str = params.toString();
  return str ? `?${str}` : '';
}

/**
 * Steps the active period forward (+1) or backward (-1).
 */
export function stepReportPeriod(query: ReportQuery, delta: -1 | 1, today?: string): ReportQuery {
  const t = today ?? todayLocal();

  if (query.mode === 'month') {
    const targetMonth = query.month ?? t.slice(0, 7);
    return {
      ...query,
      month: addMonthsUtc(targetMonth, delta),
    };
  }

  if (query.mode === 'week') {
    const anchor = query.week ?? t;
    return {
      ...query,
      week: addDaysUtc(anchor, delta * 7),
    };
  }

  if (query.mode === 'year') {
    const targetYear = Number(query.year ?? t.slice(0, 4));
    return {
      ...query,
      year: String(targetYear + delta),
    };
  }

  // mode === 'custom'
  const rawFrom = query.from ?? `${t.slice(0, 7)}-01`;
  const rawTo = query.to ?? t;
  const actualFrom = rawFrom <= rawTo ? rawFrom : rawTo;
  const actualTo = rawFrom <= rawTo ? rawTo : rawFrom;
  const L = diffDaysUtc(actualFrom, actualTo) + 1;

  const nextFrom = addDaysUtc(actualFrom, delta * L);
  const nextTo = addDaysUtc(actualTo, delta * L);

  return {
    ...query,
    from: nextFrom,
    to: nextTo,
  };
}

/**
 * Formats the period heading according to mode and active period bounds.
 */
export function formatReportPeriodHeading(
  period: ReportPeriodWindow,
  t: ReturnType<typeof useT>,
): string {
  switch (period.mode) {
    case 'month':
      return t('reports.monthLabel', {
        month: `${period.from.slice(5, 7)}/${period.from.slice(0, 4)}`,
      });
    case 'year':
      return t('reports.yearLabel', {
        year: period.from.slice(0, 4),
      });
    case 'week':
      return t('reports.weekLabel', {
        from: `${period.from.slice(8, 10)}/${period.from.slice(5, 7)}`,
        to: `${period.to.slice(8, 10)}/${period.to.slice(5, 7)}`,
      });
    case 'custom':
      return t('reports.customLabel', {
        from: formatDdMmYy(period.from),
        to: formatDdMmYy(period.to),
      });
  }
}

/**
 * Builds the URL link to /transactions for a specific tag drilled down in reports.
 */
export function buildTransactionsTagUrl(
  tagId: string,
  period: ReportPeriodWindow,
  query: ReportQuery,
): string {
  const params = new URLSearchParams();
  params.set('tagId', tagId);
  params.set('from', period.from);
  params.set('to', period.effectiveTo);
  if (query.walletId && query.walletId.trim()) {
    params.set('walletId', query.walletId.trim());
  }
  if (!query.includeGroups) {
    params.set('groups', 'hide');
  }
  return `/transactions?${params.toString()}`;
}

/**
 * Formats compact chart axis/center values (e.g. 1.5M, 250k).
 */
export function compactReportAmount(val: number | string): string {
  const num = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(num) || num === 0) return '0';
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  if (abs >= 1_000_000_000) {
    return `${sign}${(abs / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  }
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (abs >= 1_000) {
    return `${sign}${(abs / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  }
  return `${sign}${abs}`;
}
