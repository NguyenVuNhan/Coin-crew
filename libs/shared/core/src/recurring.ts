import type { RecurringRuleView } from './api-types';
export type { RecurringRuleView, PlannedKind, PlannedItemView } from './api-types';

export type RepeatUnit = 'day' | 'week' | 'month' | 'year';

export type RepeatEnd =
  | { kind: 'never' }
  | { kind: 'count'; count: number }
  | { kind: 'date'; date: string };

export interface RecurringSchedule {
  unit: RepeatUnit;
  every: number;
  weekdays?: number[];
  monthDay?: number | 'last';
  startDate: string;
  end: RepeatEnd;
}

export type RecurringType = 'expense' | 'income' | 'transfer' | 'buy';

export interface RecurringDraft {
  type: RecurringType;
  walletId: string;
  toWalletId?: string;
  amount: number;
  amountReceived?: number;
  categoryId?: string;
  assetId?: string;
  tags: string[];
  note: string | null;
  excludeFromReports?: boolean;
}

export type CheckInPolicy =
  | { kind: 'every' }
  | {
      kind: 'after';
      askAfterDays: number;
      graceDays: number | null;
      graceOccurrences: number | null;
    };

export interface RunInput {
  rule: Pick<RecurringRuleView, 'schedule' | 'askMe' | 'status' | 'nextDueOn' | 'lastConfirmedOn'>;
  today: string;
  waitingOccurrences: number;
  openCheckIn: { createdOn: string; occurrencesSince: number } | null;
  maxOccurrences: number;
}

export interface RunPlan {
  record: string[];
  wait: string[];
  nextDueOn: string | null;
  openCheckIn: boolean;
  pause: 'checkin' | 'waiting' | null;
}

export interface UpcomingItem {
  ruleId: string;
  date: string;
  draft: RecurringDraft;
  approximate: boolean;
}

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const MAX_WAITING_BEFORE_PAUSE = 3;

// --- Pure UTC Date Helpers ---

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

function daysInMonthUtc(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function shiftYearMonth(year: number, month: number, deltaMonths: number): [number, number] {
  const total = year * 12 + (month - 1) + deltaMonths;
  const ry = Math.floor(total / 12);
  const rm = (((total % 12) + 12) % 12) + 1;
  return [ry, rm];
}

function addDaysUtc(ymd: string, days: number): string {
  const [y, m, d] = parseYmd(ymd);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return formatYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function diffDaysUtc(from: string, to: string): number {
  const [y1, m1, d1] = parseYmd(from);
  const [y2, m2, d2] = parseYmd(to);
  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((t2 - t1) / 86_400_000);
}

/** ISO weekday: 1 = Mon ... 7 = Sun. */
function isoWeekdayUtc(ymd: string): number {
  const [y, m, d] = parseYmd(ymd);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 ? 7 : day;
}

function normalizedWeekdays(s: RecurringSchedule): number[] {
  if (s.weekdays && s.weekdays.length > 0) {
    const unique = Array.from(
      new Set(s.weekdays.map((w) => Math.trunc(w)).filter((w) => w >= 1 && w <= 7)),
    );
    if (unique.length > 0) {
      unique.sort((a, b) => a - b);
      return unique;
    }
  }
  return [isoWeekdayUtc(s.startDate)];
}

// --- Public Functions ---

/** UTC+7 (Vietnam) calendar date in YYYY-MM-DD. */
export function vnDate(now: Date): string {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  return formatYmd(vn.getUTCFullYear(), vn.getUTCMonth() + 1, vn.getUTCDate());
}

function collectOccurrences(
  s: RecurringSchedule,
  from: string,
  upper: string | null,
  limit: number | null,
): string[] {
  if (limit !== null && limit <= 0) return [];
  if (s.end.kind === 'count' && s.end.count <= 0) return [];

  const effectiveUpper =
    s.end.kind === 'date'
      ? upper === null || s.end.date < upper
        ? s.end.date
        : upper
      : upper;

  if (effectiveUpper !== null && (effectiveUpper < from || effectiveUpper < s.startDate)) {
    return [];
  }

  const every = Math.max(1, Math.trunc(s.every));
  const maxCount = s.end.kind === 'count' ? Math.trunc(s.end.count) : null;
  const out: string[] = [];

  if (s.unit === 'day') {
    let k = from <= s.startDate ? 0 : Math.ceil(diffDaysUtc(s.startDate, from) / every);
    while (true) {
      if (maxCount !== null && k >= maxCount) break;
      const cand = addDaysUtc(s.startDate, k * every);
      if (effectiveUpper !== null && cand > effectiveUpper) break;
      if (cand >= from) {
        out.push(cand);
        if (limit !== null && out.length >= limit) break;
      }
      k++;
    }
    return out;
  }

  if (s.unit === 'week') {
    const weekdays = normalizedWeekdays(s);
    const startWd = isoWeekdayUtc(s.startDate);
    const week0Monday = addDaysUtc(s.startDate, -(startWd - 1));
    const week0ValidCount = weekdays.filter((wd) => wd >= startWd).length;
    const perWeek = weekdays.length;

    const daysFromWeek0 = diffDaysUtc(week0Monday, from);
    let w = daysFromWeek0 <= 0 ? 0 : Math.floor(daysFromWeek0 / (every * 7));

    while (true) {
      const monday = addDaysUtc(week0Monday, w * every * 7);
      let week0Index = 0;
      for (let j = 0; j < perWeek; j++) {
        const wd = weekdays[j]!;
        const cand = addDaysUtc(monday, wd - 1);
        if (cand < s.startDate) continue;

        const occNum = w === 0 ? ++week0Index : week0ValidCount + (w - 1) * perWeek + (j + 1);
        if (maxCount !== null && occNum > maxCount) return out;
        if (effectiveUpper !== null && cand > effectiveUpper) return out;

        if (cand >= from) {
          out.push(cand);
          if (limit !== null && out.length >= limit) return out;
        }
      }
      w++;
    }
  }

  if (s.unit === 'month') {
    const [y0, m0, d0] = parseYmd(s.startDate);
    const monthDate = (k: number): string => {
      const [yk, mk] = shiftYearMonth(y0, m0, k * every);
      const maxD = daysInMonthUtc(yk, mk);
      const day =
        s.monthDay === 'last'
          ? maxD
          : Math.min(Math.max(1, Math.trunc(s.monthDay ?? d0)), maxD);
      return formatYmd(yk, mk, day);
    };

    const firstK = monthDate(0) < s.startDate ? 1 : 0;
    const [yf, mf] = parseYmd(from);
    const monthsDiff = (yf - y0) * 12 + (mf - m0);
    let k = monthsDiff <= 0 ? firstK : Math.max(firstK, Math.floor(monthsDiff / every));

    while (true) {
      const occNum = k - firstK + 1;
      if (maxCount !== null && occNum > maxCount) break;
      const cand = monthDate(k);
      if (effectiveUpper !== null && cand > effectiveUpper) break;
      if (cand >= from) {
        out.push(cand);
        if (limit !== null && out.length >= limit) break;
      }
      k++;
    }
    return out;
  }

  // unit === 'year'
  const [y0, m0, d0] = parseYmd(s.startDate);
  const [yf] = parseYmd(from);
  const yearsDiff = yf - y0;
  let k = yearsDiff <= 0 ? 0 : Math.floor(yearsDiff / every);

  while (true) {
    if (maxCount !== null && k + 1 > maxCount) break;
    const yk = y0 + k * every;
    const day = Math.min(d0, daysInMonthUtc(yk, m0));
    const cand = formatYmd(yk, m0, day);
    if (effectiveUpper !== null && cand > effectiveUpper) break;
    if (cand >= from) {
      out.push(cand);
      if (limit !== null && out.length >= limit) break;
    }
    k++;
  }
  return out;
}

export function occurrencesBetween(s: RecurringSchedule, from: string, to: string): string[] {
  if (from > to) return [];
  return collectOccurrences(s, from, to, null);
}

export function nextOccurrenceAfter(s: RecurringSchedule, date: string): string | null {
  const res = collectOccurrences(s, addDaysUtc(date, 1), null, 1);
  return res[0] ?? null;
}

export function intervalDays(s: RecurringSchedule): number {
  const every = Math.max(1, Math.trunc(s.every));
  if (s.unit === 'day') return every;
  if (s.unit === 'week') {
    const count = normalizedWeekdays(s).length;
    return (7 * every) / count;
  }
  if (s.unit === 'month') return 30 * every;
  return 365 * every;
}

export function checkInPolicy(s: RecurringSchedule): CheckInPolicy {
  const days = intervalDays(s);
  if (days < 7) {
    return { kind: 'after', askAfterDays: 30, graceDays: 14, graceOccurrences: null };
  }
  if (days < 28) {
    return { kind: 'after', askAfterDays: 60, graceDays: null, graceOccurrences: 3 };
  }
  if (days < 365) {
    return { kind: 'after', askAfterDays: 182, graceDays: null, graceOccurrences: 3 };
  }
  return { kind: 'every' };
}

export function planRuleRun(input: RunInput): RunPlan {
  const { rule, today, waitingOccurrences, openCheckIn, maxOccurrences } = input;
  if (rule.status !== 'active' || rule.nextDueOn === null) {
    return {
      record: [],
      wait: [],
      nextDueOn: rule.nextDueOn,
      openCheckIn: false,
      pause: null,
    };
  }

  const allDue =
    rule.nextDueOn <= today ? occurrencesBetween(rule.schedule, rule.nextDueOn, today) : [];
  const dates = maxOccurrences > 0 ? allDue.slice(0, maxOccurrences) : [];
  const policy = checkInPolicy(rule.schedule);

  if (rule.askMe || policy.kind === 'every') {
    const slots = Math.max(0, MAX_WAITING_BEFORE_PAUSE - waitingOccurrences);
    const wait = dates.slice(0, slots);
    const pause: 'waiting' | null =
      waitingOccurrences + wait.length >= MAX_WAITING_BEFORE_PAUSE ? 'waiting' : null;
    const nextDueOn =
      wait.length > 0 ? nextOccurrenceAfter(rule.schedule, wait[wait.length - 1]!) : rule.nextDueOn;

    return {
      record: [],
      wait,
      nextDueOn,
      openCheckIn: false,
      pause,
    };
  }

  // Automatic rule with policy.kind === 'after'
  let record: string[] = dates;
  let pause: 'checkin' | null = null;
  let shouldOpenCheckIn = false;

  if (openCheckIn === null) {
    const checkInDueOn = addDaysUtc(rule.lastConfirmedOn, policy.askAfterDays);
    shouldOpenCheckIn = today >= checkInDueOn;
  } else {
    if (policy.graceDays !== null) {
      const graceDeadline = addDaysUtc(openCheckIn.createdOn, policy.graceDays);
      if (today >= graceDeadline) {
        record = dates.filter((d) => d < graceDeadline);
        pause = 'checkin';
      }
    }
    if (pause === null && policy.graceOccurrences !== null) {
      // "Pauses if unanswered after N more occurrences": N are recorded, the next one pauses.
      if (openCheckIn.occurrencesSince + dates.length > policy.graceOccurrences) {
        const maxBeforePause = Math.max(0, policy.graceOccurrences - openCheckIn.occurrencesSince);
        record = dates.slice(0, maxBeforePause);
        pause = 'checkin';
      }
    }
  }

  const nextDueOn =
    record.length > 0
      ? nextOccurrenceAfter(rule.schedule, record[record.length - 1]!)
      : rule.nextDueOn;

  return {
    record,
    wait: [],
    nextDueOn,
    openCheckIn: shouldOpenCheckIn,
    pause,
  };
}

export function upcomingOccurrences(
  rules: RecurringRuleView[],
  today: string,
  days: number,
): UpcomingItem[] {
  if (days <= 0) return [];
  const windowFrom = addDaysUtc(today, 1);
  const windowTo = addDaysUtc(today, days);
  const items: UpcomingItem[] = [];

  for (const rule of rules) {
    if (rule.status !== 'active' || rule.nextDueOn === null) continue;
    const from = rule.nextDueOn > windowFrom ? rule.nextDueOn : windowFrom;
    if (from > windowTo) continue;

    for (const date of occurrencesBetween(rule.schedule, from, windowTo)) {
      items.push({
        ruleId: rule.id,
        date,
        draft: rule.draft,
        approximate: rule.askMe,
      });
    }
  }

  items.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.ruleId.localeCompare(b.ruleId);
  });

  return items;
}

export interface RepeatCandidateRow {
  date: string;
  amount: number;
}

function isWithin10Percent(amount: number, reference: number): boolean {
  return Math.abs(amount - reference) * 10 <= reference;
}

/** rows: same user, type, category and wallet, last 100 days, including the new one. */
export function detectRepeat(
  rows: RepeatCandidateRow[],
  latest: RepeatCandidateRow,
): { schedule: RecurringSchedule; amount: number } | null {
  if (latest.amount <= 0) return null;

  const matching = rows.filter((r) => isWithin10Percent(r.amount, latest.amount));
  const [ly, lm, ld] = parseYmd(latest.date);

  // Monthly: one row in each of the last 3 calendar months (including the latest's)
  // within ±3 days of the latest's day.
  let monthlyMatch = true;
  for (let delta = 0; delta >= -2; delta--) {
    const [ty, tm] = shiftYearMonth(ly, lm, delta);
    const targetDay = Math.min(ld, daysInMonthUtc(ty, tm));
    const found = matching.some((r) => {
      const [ry, rm, rd] = parseYmd(r.date);
      return ry === ty && rm === tm && Math.abs(rd - targetDay) <= 3;
    });
    if (!found) {
      monthlyMatch = false;
      break;
    }
  }

  if (monthlyMatch) {
    const [nextY, nextM] = shiftYearMonth(ly, lm, 1);
    const nextDay = Math.min(ld, daysInMonthUtc(nextY, nextM));
    return {
      schedule: {
        unit: 'month',
        every: 1,
        monthDay: ld,
        startDate: formatYmd(nextY, nextM, nextDay),
        end: { kind: 'never' },
      },
      amount: latest.amount,
    };
  }

  // Weekly: one row on the latest's weekday in each of the last 4 weeks.
  const matchingDates = new Set(matching.map((r) => r.date));
  let weeklyMatch = true;
  for (let w = 0; w < 4; w++) {
    if (!matchingDates.has(addDaysUtc(latest.date, -7 * w))) {
      weeklyMatch = false;
      break;
    }
  }

  if (weeklyMatch) {
    return {
      schedule: {
        unit: 'week',
        every: 1,
        weekdays: [isoWeekdayUtc(latest.date)],
        startDate: addDaysUtc(latest.date, 7),
        end: { kind: 'never' },
      },
      amount: latest.amount,
    };
  }

  return null;
}
