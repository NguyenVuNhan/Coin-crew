import type { RecurringSchedule } from '@cc/core';
import type { t as translateFn } from '@cc/web-i18n';

export type TranslateFn = typeof translateFn;

type WeekdayFullKey =
  | 'recurring.weekday.full.1'
  | 'recurring.weekday.full.2'
  | 'recurring.weekday.full.3'
  | 'recurring.weekday.full.4'
  | 'recurring.weekday.full.5'
  | 'recurring.weekday.full.6'
  | 'recurring.weekday.full.7';

type WeekdayShortKey =
  | 'recurring.weekday.short.1'
  | 'recurring.weekday.short.2'
  | 'recurring.weekday.short.3'
  | 'recurring.weekday.short.4'
  | 'recurring.weekday.short.5'
  | 'recurring.weekday.short.6'
  | 'recurring.weekday.short.7';

const FULL_WEEKDAY_KEYS: Record<number, WeekdayFullKey> = {
  1: 'recurring.weekday.full.1',
  2: 'recurring.weekday.full.2',
  3: 'recurring.weekday.full.3',
  4: 'recurring.weekday.full.4',
  5: 'recurring.weekday.full.5',
  6: 'recurring.weekday.full.6',
  7: 'recurring.weekday.full.7',
};

const SHORT_WEEKDAY_KEYS: Record<number, WeekdayShortKey> = {
  1: 'recurring.weekday.short.1',
  2: 'recurring.weekday.short.2',
  3: 'recurring.weekday.short.3',
  4: 'recurring.weekday.short.4',
  5: 'recurring.weekday.short.5',
  6: 'recurring.weekday.short.6',
  7: 'recurring.weekday.short.7',
};

function parseYmd(ymd: string): [number, number, number] {
  const [y, m, d] = ymd.split('-').map(Number);
  return [y ?? 1970, m ?? 1, d ?? 1];
}

/** Returns the 1-based day of month for a YYYY-MM-DD date. */
export function dayOfMonth(ymd: string): number {
  const [, , d] = parseYmd(ymd);
  return d;
}

/** Returns true when a YYYY-MM-DD date is the last calendar day of its month. */
export function isLastDayOfMonth(ymd: string): boolean {
  const [y, m, d] = parseYmd(ymd);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d === lastDay;
}

/** Builds the default monthly schedule for an entry date (using 'last' on the month's last day). */
export function defaultMonthlySchedule(ymd: string): RecurringSchedule {
  return {
    unit: 'month',
    every: 1,
    monthDay: isLastDayOfMonth(ymd) ? 'last' : dayOfMonth(ymd),
    startDate: ymd,
    end: { kind: 'never' },
  };
}

/** ISO weekday: 1 = Mon ... 7 = Sun. */
export function isoWeekday(ymd: string): number {
  const [y, m, d] = parseYmd(ymd);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Formats YYYY-MM-DD as "d/m" (no leading zeros), e.g. "5/12". */
export function formatDayMonth(ymd: string): string {
  const [, m, d] = parseYmd(ymd);
  return `${d}/${m}`;
}

export function weekdayFullLabel(wd: number, t: TranslateFn): string {
  const key = FULL_WEEKDAY_KEYS[wd] ?? 'recurring.weekday.full.1';
  return t(key);
}

export function weekdayShortLabel(wd: number, t: TranslateFn): string {
  const key = SHORT_WEEKDAY_KEYS[wd] ?? 'recurring.weekday.short.1';
  return t(key);
}

/** Formats YYYY-MM-DD as "{Weekday}, d/m", e.g. "Thứ Sáu, 5/12". */
export function formatWeekdayDayMonth(ymd: string, t: TranslateFn): string {
  return `${weekdayFullLabel(isoWeekday(ymd), t)}, ${formatDayMonth(ymd)}`;
}

/** Renders a RecurringSchedule in words per spec Addendum item 3. */
export function scheduleInWords(schedule: RecurringSchedule, t: TranslateFn): string {
  const every = Math.max(1, Math.trunc(schedule.every));

  if (schedule.unit === 'day') {
    return every === 1
      ? t('recurring.schedule.daily')
      : t('recurring.schedule.everyDays', { n: every });
  }

  if (schedule.unit === 'week') {
    const raw =
      schedule.weekdays && schedule.weekdays.length > 0
        ? Array.from(
            new Set(schedule.weekdays.map((w) => Math.trunc(w)).filter((w) => w >= 1 && w <= 7)),
          ).sort((a, b) => a - b)
        : [isoWeekday(schedule.startDate)];
    const weekdays = raw.length > 0 ? raw : [isoWeekday(schedule.startDate)];
    const days =
      weekdays.length === 1
        ? weekdayFullLabel(weekdays[0]!, t)
        : weekdays.map((w) => weekdayShortLabel(w, t)).join(', ');

    return every === 1
      ? t('recurring.schedule.weekly', { days })
      : t('recurring.schedule.everyWeeks', { n: every, days });
  }

  if (schedule.unit === 'month') {
    if (schedule.monthDay === 'last') {
      return every === 1
        ? t('recurring.schedule.monthlyLast')
        : t('recurring.schedule.everyMonthsLast', { n: every });
    }
    const [, , startDay] = parseYmd(schedule.startDate);
    const day =
      typeof schedule.monthDay === 'number'
        ? Math.max(1, Math.min(31, Math.trunc(schedule.monthDay)))
        : startDay;

    return every === 1
      ? t('recurring.schedule.monthly', { day })
      : t('recurring.schedule.everyMonths', { n: every, day });
  }

  // unit === 'year'
  const date = formatDayMonth(schedule.startDate);
  return every === 1
    ? t('recurring.schedule.yearly', { date })
    : t('recurring.schedule.everyYears', { n: every, date });
}
