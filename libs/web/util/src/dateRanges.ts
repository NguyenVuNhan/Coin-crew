import { todayLocal } from './localDate';

export type QuickRange = 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'last30';

const MS_PER_DAY = 86_400_000;
const FROM_TO_RANGES: readonly QuickRange[] = ['thisWeek', 'lastWeek', 'last30'];

function parseUtcDate(dateStr: string): Date {
  const y = Number(dateStr.slice(0, 4));
  const m = Number(dateStr.slice(5, 7));
  const d = Number(dateStr.slice(8, 10));
  return new Date(Date.UTC(y, m - 1, d));
}

function formatUtcDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(dateStr: string, days: number): string {
  const date = parseUtcDate(dateStr);
  date.setUTCDate(date.getUTCDate() + days);
  return formatUtcDate(date);
}

function resolveRangeEndpoints(
  from: string | undefined,
  to: string | undefined,
  today: string,
): { from: string; to: string } {
  const resolvedTo = to || today;
  const resolvedFrom = from || `${resolvedTo.slice(0, 7)}-01`;
  return { from: resolvedFrom, to: resolvedTo };
}

function formatDM(dateStr: string): string {
  return `${dateStr.slice(8, 10)}/${dateStr.slice(5, 7)}`;
}

function formatDMY(dateStr: string): string {
  return `${formatDM(dateStr)}/${dateStr.slice(0, 4)}`;
}

/** Computes the inclusive `YYYY-MM-DD` bounds for a quick range relative to `today` (weeks run Mon–Sun). */
export function quickRangeDates(range: QuickRange, today: string): { from: string; to: string } {
  const todayDate = parseUtcDate(today);
  const dowFromMonday = (todayDate.getUTCDay() + 6) % 7;

  switch (range) {
    case 'thisWeek':
      return { from: addDays(today, -dowFromMonday), to: today };
    case 'lastWeek': {
      const thisMonday = addDays(today, -dowFromMonday);
      return { from: addDays(thisMonday, -7), to: addDays(thisMonday, -1) };
    }
    case 'thisMonth':
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case 'lastMonth': {
      const first = new Date(Date.UTC(todayDate.getUTCFullYear(), todayDate.getUTCMonth() - 1, 1));
      const last = new Date(Date.UTC(todayDate.getUTCFullYear(), todayDate.getUTCMonth(), 0));
      return { from: formatUtcDate(first), to: formatUtcDate(last) };
    }
    case 'last30':
      return { from: addDays(today, -29), to: today };
  }
}

/** Matches exact `from`/`to` dates against the non-month quick ranges (`thisWeek`, `lastWeek`, `last30`). */
export function matchQuickRange(
  from: string | undefined,
  to: string | undefined,
  today: string,
): QuickRange | null {
  if (!from || !to) return null;
  for (const range of FROM_TO_RANGES) {
    const dates = quickRangeDates(range, today);
    if (dates.from === from && dates.to === to) {
      return range;
    }
  }
  return null;
}

/** Formats a date range pill label (e.g. `'12/11 – 19/11/2026'`), filling missing ends like `resolveListPeriod`. */
export function formatRangeLabel(
  from: string | undefined,
  to: string | undefined,
  today: string,
): string {
  const resolved = resolveRangeEndpoints(from, to, today);
  if (resolved.from === resolved.to) {
    return formatDMY(resolved.from);
  }
  if (resolved.from.slice(0, 4) === resolved.to.slice(0, 4)) {
    return `${formatDM(resolved.from)} \u2013 ${formatDMY(resolved.to)}`;
  }
  return `${formatDMY(resolved.from)} \u2013 ${formatDMY(resolved.to)}`;
}

/** Validates a custom date range after filling missing ends like `resolveListPeriod`. */
export function validateRange(
  from?: string,
  to?: string,
  opts?: { maxDays?: number; today?: string },
): 'ok' | 'fromAfterTo' | 'tooLong' {
  const today = opts?.today ?? todayLocal();
  const resolved = resolveRangeEndpoints(from, to, today);
  if (resolved.from > resolved.to) {
    return 'fromAfterTo';
  }
  if (opts?.maxDays !== undefined) {
    const days =
      Math.round(
        (parseUtcDate(resolved.to).getTime() - parseUtcDate(resolved.from).getTime()) / MS_PER_DAY,
      ) + 1;
    if (days > opts.maxDays) {
      return 'tooLong';
    }
  }
  return 'ok';
}
