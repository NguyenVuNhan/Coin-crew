import { CURRENCIES, type CurrencyCode } from './currency';
import type { CategoryView } from './api-types';
import type { CountedSpendRow } from './reports';

export type BudgetPeriodKind = 'week' | 'month' | 'year' | 'once';

export type BudgetTarget =
  | { kind: 'category'; categoryId: string }
  | { kind: 'tag'; tagId: string };

export interface BudgetLimit {
  /** Period start date (YYYY-MM-DD) from which this limit applies. */
  effectiveFrom: string;
  amount: number;
}

export interface BudgetDef {
  id: string;
  name: string;
  target: BudgetTarget;
  currency: CurrencyCode;
  periodKind: BudgetPeriodKind;
  /** Start day of month (1-31), monthly budgets only. */
  monthStartDay: number | null;
  /** Inclusive start date (YYYY-MM-DD), once budgets only. */
  from: string | null;
  /** Inclusive end date (YYYY-MM-DD), once budgets only. */
  to: string | null;
  excludedWalletIds: string[];
  /** Limits sorted by effectiveFrom ascending. */
  limits: BudgetLimit[];
  /** Period start date (YYYY-MM-DD) until which limit suggestions are dismissed. */
  suggestionDismissedUntil: string | null;
  /** Local YYYY-MM-DD of creation. */
  createdOn: string;
}

export interface BudgetPeriod {
  /** Inclusive start date (YYYY-MM-DD). */
  from: string;
  /** Inclusive end date (YYYY-MM-DD). */
  to: string;
}

export type BudgetState = 'over' | 'fast' | 'near' | 'fine';

export interface BudgetProgress {
  budgetId: string;
  period: BudgetPeriod;
  limit: number;
  spent: number;
  /** limit - spent (negative when over). */
  left: number;
  /** 0..1, days up to and including today / period days (1 for past periods). */
  elapsed: number;
  /** Days remaining including today; 0 for past periods. */
  daysLeft: number;
  state: BudgetState;
  /** (spent / elapsed - limit) / limit, when state === 'fast', else null. */
  projectedOverPct: number | null;
  /** Remaining allowance per day or per month; null when over or period ended. */
  pace: { unit: 'day' | 'month'; amount: number } | null;
  /** True for a once-budget whose range is before today. */
  ended: boolean;
}

export const BUDGET_NEAR = 0.85;
export const BUDGET_FAST_MARGIN = 1.1;
export const BUDGET_SUGGEST_RUN = 6;
export const BUDGET_UNDER = 0.8;

const LONG_PERIOD_PACE_DAYS = 31;
const LONG_PERIOD_GRACE_DAYS = 92;
const LONG_PERIOD_GRACE_ELAPSED = 0.05;
const MIN_DAYS_FOR_FAST = 2;

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

function clampMonthDay(year: number, month: number, day: number): string {
  const maxDay = daysInMonthUtc(year, month);
  const clamped = Math.min(Math.max(1, day), maxDay);
  return formatYmd(year, month, clamped);
}

function shiftYearMonth(year: number, month: number, deltaMonths: number): [number, number] {
  const total = year * 12 + (month - 1) + deltaMonths;
  const ry = Math.floor(total / 12);
  const rm = ((total % 12) + 12) % 12 + 1;
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
  return Math.round((t2 - t1) / 86400000);
}

// --- Period Windows ---

export function budgetPeriodAt(def: BudgetDef, date: string): BudgetPeriod | null {
  if (def.periodKind === 'once') {
    if (def.from === null || def.to === null) return null;
    if (date < def.from || date > def.to) return null;
    return { from: def.from, to: def.to };
  }

  if (def.periodKind === 'week') {
    const [y, m, d] = parseYmd(date);
    const dt = new Date(Date.UTC(y, m - 1, d));
    const isoWeekday = (dt.getUTCDay() + 6) % 7; // Mon=0..Sun=6
    const from = addDaysUtc(date, -isoWeekday);
    const to = addDaysUtc(from, 6);
    return { from, to };
  }

  if (def.periodKind === 'year') {
    const [y] = parseYmd(date);
    const yStr = String(y).padStart(4, '0');
    return { from: `${yStr}-01-01`, to: `${yStr}-12-31` };
  }

  // Monthly with per-budget start day (1..31, clamped to month length)
  const startDay = Math.min(Math.max(1, Math.trunc(def.monthStartDay ?? 1)), 31);
  const [y, m] = parseYmd(date);
  const thisMonthStart = clampMonthDay(y, m, startDay);

  if (date >= thisMonthStart) {
    const [ny, nm] = shiftYearMonth(y, m, 1);
    const nextMonthStart = clampMonthDay(ny, nm, startDay);
    return { from: thisMonthStart, to: addDaysUtc(nextMonthStart, -1) };
  }

  const [py, pm] = shiftYearMonth(y, m, -1);
  const prevMonthStart = clampMonthDay(py, pm, startDay);
  return { from: prevMonthStart, to: addDaysUtc(thisMonthStart, -1) };
}

export function firstBudgetPeriod(def: BudgetDef): BudgetPeriod {
  if (def.periodKind === 'once') {
    if (def.from !== null && def.to !== null) {
      return { from: def.from, to: def.to };
    }
    return { from: def.createdOn, to: def.createdOn };
  }
  return budgetPeriodAt(def, def.createdOn)!;
}

export function budgetPeriodsUpTo(def: BudgetDef, today: string): BudgetPeriod[] {
  const first = firstBudgetPeriod(def);
  if (def.periodKind === 'once') {
    return [first];
  }

  const current = budgetPeriodAt(def, today);
  if (!current || current.from < first.from) {
    return [];
  }

  const periods: BudgetPeriod[] = [];
  let cursor: BudgetPeriod = current;

  while (cursor.from >= first.from) {
    periods.push(cursor);
    if (cursor.from === first.from) break;
    const prevDate = addDaysUtc(cursor.from, -1);
    const prev = budgetPeriodAt(def, prevDate);
    if (!prev || prev.from >= cursor.from) break;
    cursor = prev;
  }

  return periods;
}

// --- Limits ---

export function limitFor(def: BudgetDef, period: BudgetPeriod): number {
  let best: BudgetLimit | null = null;
  for (const lim of def.limits) {
    if (lim.effectiveFrom <= period.from) {
      if (best === null || lim.effectiveFrom >= best.effectiveFrom) {
        best = lim;
      }
    }
  }
  if (best !== null) return best.amount;

  if (def.limits.length === 0) return 0;
  let earliest = def.limits[0]!;
  for (const lim of def.limits) {
    if (lim.effectiveFrom < earliest.effectiveFrom) earliest = lim;
  }
  return earliest.amount;
}

// --- Spending ---

export function budgetSpent(
  def: BudgetDef,
  rows: CountedSpendRow[],
  period: BudgetPeriod,
  categories: CategoryView[],
): number {
  const excluded = new Set(def.excludedWalletIds);
  let parentById: Map<string, string | null> | null = null;

  if (def.target.kind === 'category') {
    parentById = new Map<string, string | null>();
    for (const c of categories) {
      parentById.set(c.id, c.parentId);
    }
  }

  const matchesCategory = (categoryId: string, targetCategoryId: string): boolean => {
    let cur: string | null = categoryId;
    const seen = new Set<string>();
    while (cur !== null) {
      if (cur === targetCategoryId) return true;
      if (seen.has(cur)) return false;
      seen.add(cur);
      cur = parentById?.get(cur) ?? null;
    }
    return false;
  };

  let total = 0;
  for (const row of rows) {
    if (row.currency !== def.currency) continue;
    if (row.walletId === null || excluded.has(row.walletId)) continue;
    if (row.date < period.from || row.date > period.to) continue;

    if (def.target.kind === 'category') {
      if (!matchesCategory(row.categoryId, def.target.categoryId)) continue;
    } else {
      if (!row.tagIds.includes(def.target.tagId)) continue;
    }

    total += row.amount;
  }

  return total;
}

// --- Progress, State and Pace ---

export function budgetProgress(
  def: BudgetDef,
  spent: number,
  period: BudgetPeriod,
  today: string,
): BudgetProgress {
  const limit = limitFor(def, period);
  const left = limit - spent;
  const totalDays = Math.max(1, diffDaysUtc(period.from, period.to) + 1);
  const isPast = today > period.to;
  const ended = def.periodKind === 'once' && isPast;

  let daysElapsed: number;
  let elapsed: number;
  let daysLeft: number;

  if (isPast) {
    daysElapsed = totalDays;
    elapsed = 1;
    daysLeft = 0;
  } else if (today < period.from) {
    daysElapsed = 0;
    elapsed = 0;
    daysLeft = totalDays;
  } else {
    daysElapsed = diffDaysUtc(period.from, today) + 1;
    elapsed = daysElapsed / totalDays;
    daysLeft = diffDaysUtc(today, period.to) + 1;
  }

  const inFastGrace =
    daysElapsed <= MIN_DAYS_FOR_FAST ||
    (totalDays > LONG_PERIOD_GRACE_DAYS && elapsed < LONG_PERIOD_GRACE_ELAPSED);

  let state: BudgetState;
  let projectedOverPct: number | null = null;

  if (spent > limit) {
    state = 'over';
  } else if (
    !inFastGrace &&
    elapsed > 0 &&
    limit > 0 &&
    spent / elapsed >= BUDGET_FAST_MARGIN * limit
  ) {
    state = 'fast';
    projectedOverPct = (spent / elapsed - limit) / limit;
  } else if (limit > 0 && spent >= BUDGET_NEAR * limit) {
    state = 'near';
  } else {
    state = 'fine';
  }

  let pace: { unit: 'day' | 'month'; amount: number } | null = null;
  if (state !== 'over' && daysLeft > 0) {
    if (totalDays > LONG_PERIOD_PACE_DAYS) {
      const refDate = today < period.from ? period.from : today;
      const [refY, refM] = parseYmd(refDate);
      const [endY, endM] = parseYmd(period.to);
      const monthsLeft = Math.max(1, (endY - refY) * 12 + (endM - refM) + 1);
      pace = { unit: 'month', amount: Math.floor(left / monthsLeft) };
    } else {
      pace = { unit: 'day', amount: Math.floor(left / daysLeft) };
    }
  }

  return {
    budgetId: def.id,
    period,
    limit,
    spent,
    left,
    elapsed,
    daysLeft,
    state,
    projectedOverPct,
    pace,
    ended,
  };
}

// --- Ordering ---

function usageRatio(p: BudgetProgress): number {
  if (p.limit > 0) return p.spent / p.limit;
  return p.spent > 0 ? Infinity : 0;
}

export function orderBudgets(list: BudgetProgress[]): {
  over: BudgetProgress[];
  fast: BudgetProgress[];
  onPace: BudgetProgress[];
  ended: BudgetProgress[];
} {
  const over: BudgetProgress[] = [];
  const fast: BudgetProgress[] = [];
  const onPace: BudgetProgress[] = [];
  const ended: BudgetProgress[] = [];

  for (const item of list) {
    if (item.ended) {
      ended.push(item);
    } else if (item.state === 'over') {
      over.push(item);
    } else if (item.state === 'fast') {
      fast.push(item);
    } else {
      onPace.push(item);
    }
  }

  over.sort((a, b) => usageRatio(b) - usageRatio(a));
  fast.sort((a, b) => (b.projectedOverPct ?? 0) - (a.projectedOverPct ?? 0));
  onPace.sort((a, b) => usageRatio(b) - usageRatio(a));

  return { over, fast, onPace, ended };
}

// --- Limit Suggestions ---

export interface BudgetSuggestion {
  direction: 'raise' | 'lower';
  amount: number;
  average: number;
}

export function budgetSuggestion(
  def: BudgetDef,
  history: { period: BudgetPeriod; limit: number; spent: number }[],
  today: string,
): BudgetSuggestion | null {
  if (def.periodKind === 'once') return null;

  const first = firstBudgetPeriod(def);
  const completed = history
    .filter((h) => h.period.to < today && h.period.from >= first.from)
    .sort((a, b) => (a.period.from > b.period.from ? -1 : a.period.from < b.period.from ? 1 : 0));

  if (completed.length < BUDGET_SUGGEST_RUN) return null;

  const run = completed.slice(0, BUDGET_SUGGEST_RUN);

  if (
    def.suggestionDismissedUntil !== null &&
    run.some((h) => h.period.from < def.suggestionDismissedUntil!)
  ) {
    return null;
  }

  const allOver = run.every((h) => h.spent > h.limit);
  const allUnder = run.every((h) => h.spent < BUDGET_UNDER * h.limit);
  if (!allOver && !allUnder) return null;

  const rawAverage = run.reduce((acc, h) => acc + h.spent, 0) / run.length;
  const step = def.currency === 'VND' ? 100_000 : 10 ** CURRENCIES[def.currency].decimals;
  const amount = Math.round(rawAverage / step) * step;

  const currentPeriod = budgetPeriodAt(def, today);
  const currentLimit = currentPeriod ? limitFor(def, currentPeriod) : run[0]!.limit;
  if (amount === currentLimit) return null;

  return {
    direction: allOver ? 'raise' : 'lower',
    amount,
    average: Math.round(rawAverage),
  };
}

// --- Entry Impact ---

export interface BudgetDraft {
  amount: number;
  categoryId: string | null;
  tagIds: string[];
  date: string;
  walletId: string;
  currency: CurrencyCode;
  replacesId?: string;
}

export interface BudgetImpact {
  budgetId: string;
  name: string;
  before: BudgetProgress;
  after: BudgetProgress;
}

const STATE_SEVERITY: Record<BudgetState, number> = {
  over: 0,
  fast: 1,
  near: 2,
  fine: 3,
};

export function budgetImpacts(
  defs: BudgetDef[],
  rows: CountedSpendRow[],
  draft: BudgetDraft,
  categories: CategoryView[],
  today: string,
): BudgetImpact[] {
  if (draft.amount <= 0) return [];

  const parentById = new Map<string, string | null>();
  for (const c of categories) {
    parentById.set(c.id, c.parentId);
  }

  const matchesCat = (categoryId: string, targetCategoryId: string): boolean => {
    let cur: string | null = categoryId;
    const seen = new Set<string>();
    while (cur !== null) {
      if (cur === targetCategoryId) return true;
      if (seen.has(cur)) return false;
      seen.add(cur);
      cur = parentById.get(cur) ?? null;
    }
    return false;
  };

  const targetNarrowness = (def: BudgetDef): number => {
    if (def.target.kind === 'tag') return -1;
    let depth = 0;
    let cur: string | null = parentById.get(def.target.categoryId) ?? null;
    const seen = new Set<string>([def.target.categoryId]);
    while (cur !== null) {
      if (seen.has(cur)) break;
      seen.add(cur);
      depth++;
      cur = parentById.get(cur) ?? null;
    }
    return depth;
  };

  const baseRows =
    draft.replacesId !== undefined ? rows.filter((r) => r.id !== draft.replacesId) : rows;

  const matched: { impact: BudgetImpact; narrowness: number }[] = [];

  for (const def of defs) {
    if (def.currency !== draft.currency) continue;
    if (def.excludedWalletIds.includes(draft.walletId)) continue;

    const period = budgetPeriodAt(def, draft.date);
    if (!period) continue;
    if (period.from < firstBudgetPeriod(def).from) continue;

    if (def.target.kind === 'category') {
      if (draft.categoryId === null || !matchesCat(draft.categoryId, def.target.categoryId)) {
        continue;
      }
    } else {
      if (!draft.tagIds.includes(def.target.tagId)) continue;
    }

    const spentBefore = budgetSpent(def, baseRows, period, categories);
    const before = budgetProgress(def, spentBefore, period, today);
    const after = budgetProgress(def, spentBefore + draft.amount, period, today);

    if (after.state === 'fine') continue;

    matched.push({
      impact: { budgetId: def.id, name: def.name, before, after },
      narrowness: targetNarrowness(def),
    });
  }

  matched.sort((a, b) => {
    const sevDiff = STATE_SEVERITY[a.impact.after.state] - STATE_SEVERITY[b.impact.after.state];
    if (sevDiff !== 0) return sevDiff;
    return b.narrowness - a.narrowness;
  });

  return matched.map((m) => m.impact);
}
