import { CURRENCY_CODES, type CurrencyCode } from './currency';
import {
  type CalcWallet,
  type CalcEntry,
  type CountedRow,
  type WalletBalanceSeriesResult,
  walletBalanceSeries,
  replayEntryVndAmounts,
} from './wallets';
import {
  type GroupRow,
  type GroupSettingsView,
  groupRowEffect,
  loanPaybacks,
  createGroupWalletResolver,
  groupRowCategoryId,
  groupWalletEntries,
} from './groupShares';
import { foldForSearch } from './listFilter';
import type { CategoryView, TagView, WalletDetailView } from './api-types';

export const UNCATEGORIZED_CATEGORY_ID = '__uncategorized__';
export const SYNTHETIC_GROUP_CATEGORY_ID = '__group__';
export const SYNTHETIC_LEND_CATEGORY_ID = '__lend__';
export const SYNTHETIC_BORROW_CATEGORY_ID = '__borrow__';

export type ReportPeriodMode = 'week' | 'month' | 'year' | 'custom';

export interface ReportQuery {
  mode: ReportPeriodMode;
  /** 'YYYY-MM' when mode === 'month' */
  month?: string;
  /** Any 'YYYY-MM-DD' inside target Mon-Sun week when mode === 'week' */
  week?: string;
  /** 'YYYY' when mode === 'year' */
  year?: string;
  from?: string;
  to?: string;
  walletId?: string;
  includeGroups: boolean;
}

export interface ReportPeriodWindow {
  mode: ReportPeriodMode;
  from: string;
  to: string;
  effectiveTo: string;
  inProgress: boolean;
  granularity: 'day' | 'month';
  previous: { from: string; to: string; effectiveTo: string };
  baselines: { from: string; to: string; effectiveTo: string }[];
}

export interface ReportMoneyTotals {
  spent: number;
  income: number;
  net: number;
}

export interface ReportDelta {
  previousSpent: number;
  previousIncome: number;
  spentDiff: number;
  incomeDiff: number;
  spentPct: number | null;
  incomePct: number | null;
}

export interface ReportHealthPoint {
  index: number;
  date: string;
  label: string;
  income: number | null;
  expense: number | null;
  avgIncome: number | null;
  avgExpense: number | null;
}

export interface ReportSubCategoryItem {
  categoryId: string;
  name: string;
  icon: string;
  amount: number;
  percent: number;
  isGeneralParentBucket?: boolean;
}

export interface ReportCategoryItem {
  categoryId: string;
  name: string;
  icon: string;
  type: 'expense' | 'income';
  amount: number;
  percent: number;
  subCategories: ReportSubCategoryItem[];
}

export interface ReportTagItem {
  tagId: string;
  name: string;
  amount: number;
  percent: number;
  entryCount: number;
}

export interface ReportUnratedWallet {
  walletId: string;
  name: string;
  currency: CurrencyCode;
  spent: number;
  income: number;
}

export type ReportRowRef =
  | { kind: 'entry'; entryId: string; categoryId: string; type: 'expense' | 'income'; vndAmount: number | null; nativeAmount: number }
  | { kind: 'group'; groupRowId: string; categoryId: string; type: 'expense' | 'income'; amount: number };

export interface ReportData {
  period: ReportPeriodWindow;
  currency: CurrencyCode;
  approximate: boolean;
  singleWallet: { walletId: string; name: string; currency: CurrencyCode; excludedFromTotal: boolean } | null;
  totals: ReportMoneyTotals;
  perCurrency: { currency: CurrencyCode; spent: number; income: number }[];
  previousDelta: ReportDelta;
  baseline3m: (ReportDelta & { historyCount: number }) | null;
  unratedWallets: ReportUnratedWallet[];
  countedCount: number;
  hasAnyUnratedOnly: boolean;
  healthSeries: ReportHealthPoint[];
  spendingByCategory: ReportCategoryItem[];
  incomeByCategory: ReportCategoryItem[];
  tags: {
    expense: ReportTagItem[];
    income: ReportTagItem[];
    hasMultiTagOverlap: boolean;
  };
  walletBalance: WalletBalanceSeriesResult | null;
  /** Normalized counted rows in the active period for 0-cost drill-down. */
  countedRows: ReportRowRef[];
}

export interface ReportCategoryDrilldown {
  categoryId: string;
  name: string;
  icon: string;
  type: 'expense' | 'income';
  currency: CurrencyCode;
  approximate: boolean;
  total: number;
  previousTotal: number;
  diffFromPrevious: number;
  pctFromPrevious: number | null;
  baseline3mAvg: number | null;
  historyCount: number;
  subCategories: ReportSubCategoryItem[];
  rows: ReportRowRef[];
}

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

function daysInMonthUtc(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function endOfMonthUtc(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const lastDay = daysInMonthUtc(y ?? 1970, m ?? 1);
  return `${ym}-${String(lastDay).padStart(2, '0')}`;
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

function addMonthsUtc(ym: string, deltaMonths: number): string {
  const [y, m] = ym.split('-').map(Number);
  const totalMonths = (y ?? 1970) * 12 + ((m ?? 1) - 1) + deltaMonths;
  const ry = Math.floor(totalMonths / 12);
  const rm = ((totalMonths % 12) + 12) % 12 + 1;
  return `${String(ry).padStart(4, '0')}-${String(rm).padStart(2, '0')}`;
}

function clampDayOfMonth(ym: string, dayNum: number): string {
  const [y, m] = ym.split('-').map(Number);
  const maxDay = daysInMonthUtc(y ?? 1970, m ?? 1);
  const clamped = Math.min(Math.max(1, dayNum), maxDay);
  return `${ym}-${String(clamped).padStart(2, '0')}`;
}

function clampMonthDay(year: number, month: number, day: number): string {
  const maxDay = daysInMonthUtc(year, month);
  const clamped = Math.min(Math.max(1, day), maxDay);
  return formatYmd(year, month, clamped);
}

export function resolveReportPeriod(query: ReportQuery, today: string): ReportPeriodWindow {
  const mode = query.mode;

  if (mode === 'month') {
    const targetMonth = query.month ?? today.slice(0, 7);
    const from = `${targetMonth}-01`;
    const to = endOfMonthUtc(targetMonth);
    const granularity: 'day' = 'day';
    const inProgress = from <= today && today <= to;
    const effectiveTo = inProgress ? today : to;
    const dayNum = Number(today.slice(8, 10));

    const baselines: { from: string; to: string; effectiveTo: string }[] = [];
    for (let i = 1; i <= 3; i++) {
      const m_i = addMonthsUtc(targetMonth, -i);
      const bFrom = `${m_i}-01`;
      const bTo = endOfMonthUtc(m_i);
      const bEffectiveTo = inProgress ? clampDayOfMonth(m_i, dayNum) : bTo;
      baselines.push({ from: bFrom, to: bTo, effectiveTo: bEffectiveTo });
    }

    const previous = baselines[0]!;
    return { mode, from, to, effectiveTo, inProgress, granularity, previous, baselines };
  }

  if (mode === 'week') {
    const anchor = query.week ?? today;
    const [y, m, d] = parseYmd(anchor);
    const dt = new Date(Date.UTC(y, m - 1, d));
    const isoWeekday = (dt.getUTCDay() + 6) % 7; // Mon=0..Sun=6
    const from = addDaysUtc(anchor, -isoWeekday);
    const to = addDaysUtc(from, 6);
    const granularity: 'day' = 'day';
    const inProgress = from <= today && today <= to;
    const effectiveTo = inProgress ? today : to;
    const offsetDays = diffDaysUtc(from, effectiveTo);

    const baselines: { from: string; to: string; effectiveTo: string }[] = [];
    for (let i = 1; i <= 3; i++) {
      const bFrom = addDaysUtc(from, -7 * i);
      const bTo = addDaysUtc(to, -7 * i);
      const bEffectiveTo = inProgress ? addDaysUtc(bFrom, offsetDays) : bTo;
      baselines.push({ from: bFrom, to: bTo, effectiveTo: bEffectiveTo });
    }

    const previous = baselines[0]!;
    return { mode, from, to, effectiveTo, inProgress, granularity, previous, baselines };
  }

  if (mode === 'year') {
    const targetYear = Number(query.year ?? today.slice(0, 4));
    const from = `${targetYear}-01-01`;
    const to = `${targetYear}-12-31`;
    const granularity: 'month' = 'month';
    const inProgress = from <= today && today <= to;
    const effectiveTo = inProgress ? today : to;
    const todayMonth = Number(today.slice(5, 7));
    const todayDay = Number(today.slice(8, 10));

    const baselines: { from: string; to: string; effectiveTo: string }[] = [];
    for (let i = 1; i <= 3; i++) {
      const y_i = targetYear - i;
      const bFrom = `${y_i}-01-01`;
      const bTo = `${y_i}-12-31`;
      const bEffectiveTo = inProgress ? clampMonthDay(y_i, todayMonth, todayDay) : bTo;
      baselines.push({ from: bFrom, to: bTo, effectiveTo: bEffectiveTo });
    }

    const previous = baselines[0]!;
    return { mode, from, to, effectiveTo, inProgress, granularity, previous, baselines };
  }

  // mode === 'custom'
  const rawFrom = query.from ?? today;
  const rawTo = query.to ?? today;
  const from = rawFrom <= rawTo ? rawFrom : rawTo;
  const to = rawFrom <= rawTo ? rawTo : rawFrom;
  const L = diffDaysUtc(from, to) + 1;
  const granularity: 'day' | 'month' = L <= 90 ? 'day' : 'month';
  const inProgress = from <= today && today <= to;
  const effectiveTo = inProgress ? today : to;
  const offsetDays = diffDaysUtc(from, effectiveTo);

  const baselines: { from: string; to: string; effectiveTo: string }[] = [];
  for (let i = 1; i <= 3; i++) {
    const bTo = addDaysUtc(from, -1 - (i - 1) * L);
    const bFrom = addDaysUtc(bTo, -(L - 1));
    const bEffectiveTo = inProgress ? addDaysUtc(bFrom, offsetDays) : bTo;
    baselines.push({ from: bFrom, to: bTo, effectiveTo: bEffectiveTo });
  }

  const previous = baselines[0]!;
  return { mode, from, to, effectiveTo, inProgress, granularity, previous, baselines };
}

// --- Group Category Resolution ---

function findStarterCategory(
  categoriesById: Map<string, CategoryView>,
  starterKey: 'group' | 'lend' | 'borrow',
  fallbackId: string,
): string {
  let fallbackFound: CategoryView | undefined;
  for (const c of categoriesById.values()) {
    if (c.starterKey === starterKey) {
      if (!c.hidden) return c.id;
      if (!fallbackFound) fallbackFound = c;
    }
  }
  return fallbackFound?.id ?? fallbackId;
}

function resolveGroupReportCategoryIdWithMap(
  row: GroupRow,
  settings: GroupSettingsView,
  payback: number,
  categoriesById: Map<string, CategoryView>,
  effOverride?: ReturnType<typeof groupRowEffect>,
): { categoryId: string; side: 'expense' | 'income' } | null {
  const eff = effOverride ?? groupRowEffect(row, settings, payback);
  if (eff.spending <= 0 && eff.income <= 0) return null;
  const side: 'expense' | 'income' = eff.spending > 0 ? 'expense' : 'income';

  const isLoanOrPayback = Boolean(settings.countLoans && (row.link?.intent === 'loan' || payback > 0));

  if (isLoanOrPayback) {
    if (row.link?.categoryId) {
      const explicit = categoriesById.get(row.link.categoryId);
      if (explicit && explicit.type === side) {
        return { categoryId: explicit.id, side };
      }
    }
    if (side === 'expense') {
      return { categoryId: findStarterCategory(categoriesById, 'lend', SYNTHETIC_LEND_CATEGORY_ID), side };
    }
    return { categoryId: findStarterCategory(categoriesById, 'borrow', SYNTHETIC_BORROW_CATEGORY_ID), side };
  }

  const fallback = findStarterCategory(categoriesById, 'group', SYNTHETIC_GROUP_CATEGORY_ID);
  const cid = groupRowCategoryId(row, settings, fallback) ?? fallback;
  return { categoryId: cid, side };
}

export function resolveGroupReportCategoryId(
  row: GroupRow,
  settings: GroupSettingsView,
  payback: number,
  categories: CategoryView[],
): { categoryId: string; side: 'expense' | 'income' } | null {
  const categoriesById = new Map<string, CategoryView>();
  for (const c of categories) categoriesById.set(c.id, c);
  return resolveGroupReportCategoryIdWithMap(row, settings, payback, categoriesById);
}

// --- Tag Filtering ---

export function filterReportTags(tags: ReportTagItem[], search: string): ReportTagItem[] {
  const q = foldForSearch(search.trim());
  if (!q) return tags;
  return tags.filter((t) => foldForSearch(t.name).includes(q));
}

// --- Category Display Metadata Helpers ---

interface CategoryMeta {
  id: string;
  name: string;
  icon: string;
  parentId: string | null;
  type?: 'expense' | 'income';
}

function resolveCategoryMeta(categoryId: string | null, categoriesById: Map<string, CategoryView>): CategoryMeta {
  if (categoryId === null || categoryId === UNCATEGORIZED_CATEGORY_ID) {
    return { id: UNCATEGORIZED_CATEGORY_ID, name: 'Chưa phân loại', icon: 'tag', parentId: null };
  }
  if (categoryId === SYNTHETIC_GROUP_CATEGORY_ID) {
    return { id: SYNTHETIC_GROUP_CATEGORY_ID, name: 'Nhóm', icon: 'users', parentId: null };
  }
  if (categoryId === SYNTHETIC_LEND_CATEGORY_ID) {
    return { id: SYNTHETIC_LEND_CATEGORY_ID, name: 'Cho vay', icon: 'arrow-up-right', parentId: null, type: 'expense' };
  }
  if (categoryId === SYNTHETIC_BORROW_CATEGORY_ID) {
    return { id: SYNTHETIC_BORROW_CATEGORY_ID, name: 'Đi vay', icon: 'arrow-down-left', parentId: null, type: 'income' };
  }
  const found = categoriesById.get(categoryId);
  if (found) {
    return { id: found.id, name: found.name, icon: found.icon, parentId: found.parentId, type: found.type };
  }
  return { id: UNCATEGORIZED_CATEGORY_ID, name: 'Chưa phân loại', icon: 'tag', parentId: null };
}

function calcPercent(diff: number, prev: number): number | null {
  return prev > 0 ? Math.round((diff / prev) * 100) : null;
}

// --- Counted Row Mapping ---

function toCountedRow(e: CalcEntry, currency: CurrencyCode): CountedRow {
  const isTrade = e.type === 'buy' || e.type === 'sell';
  const isAdjustment = (e as { source?: string }).source === 'adjustment';
  const isOut = e.type === 'expense' || e.type === 'transfer_out';
  return {
    currency,
    signedAmount: isOut ? -e.amount : e.amount,
    counted: !e.excludeFromReports && !isTrade && !isAdjustment,
  };
}

// --- Internal Normalized Transaction Row & Discriminated Ref Helper ---

interface NormalizedTx {
  kind: 'entry' | 'group';
  id: string;
  walletId: string;
  currency: CurrencyCode;
  date: string;
  side: 'expense' | 'income';
  amount: number;
  vndAmount: number | null;
  categoryId: string;
  tagIds: string[];
}

function toReportRowRef(
  tx: NormalizedTx,
  isSingleWallet: boolean,
  reportAmount: number | null,
): ReportRowRef {
  if (tx.kind === 'entry') {
    return {
      kind: 'entry',
      entryId: tx.id,
      categoryId: tx.categoryId,
      type: tx.side,
      vndAmount: isSingleWallet ? null : (reportAmount ?? null),
      nativeAmount: tx.amount,
    };
  }
  return {
    kind: 'group',
    groupRowId: tx.id,
    categoryId: tx.categoryId,
    type: tx.side,
    amount: reportAmount ?? tx.amount,
  };
}

// --- Shared In-Scope Normalizer ---

interface NormalizedScope {
  walletsById: Map<string, WalletDetailView>;
  categoriesById: Map<string, CategoryView>;
  isSingleWallet: boolean;
  targetWallet: WalletDetailView | undefined;
  reportCurrency: CurrencyCode;
  txs: NormalizedTx[];
  allGroupEntries: CalcEntry[];
  paybacks: Map<string, number>;
  entryVnd: Map<string, number | null>;
}

function normalizeInScopeTransactions(input: Parameters<typeof buildReport>[0]): NormalizedScope {
  const { wallets, entries, categories, groupRows, groupSettings, query } = input;

  const walletsById = new Map<string, WalletDetailView>();
  for (const w of wallets) walletsById.set(w.id, w);

  const categoriesById = new Map<string, CategoryView>();
  for (const c of categories) categoriesById.set(c.id, c);

  const excludedWalletIds = new Set(
    wallets.filter((w) => Boolean(w.excludeFromReports)).map((w) => w.id),
  );

  const defaultWalletId =
    wallets.find((w) => w.isDefault && !w.archived)?.id ??
    wallets.find((w) => w.isDefault)?.id ??
    null;

  const resolveGroupWallet = createGroupWalletResolver(wallets, defaultWalletId);
  const allGroupEntries = groupWalletEntries(groupRows, wallets, defaultWalletId, groupSettings);
  const { entryVnd } = replayEntryVndAmounts(wallets, [...entries, ...allGroupEntries]);
  const paybacks = groupSettings.countLoans ? loanPaybacks(groupRows) : new Map<string, number>();

  const isSingleWallet = Boolean(query.walletId);
  const targetWallet = isSingleWallet ? walletsById.get(query.walletId!) : undefined;
  const reportCurrency: CurrencyCode = targetWallet ? targetWallet.currency : 'VND';

  const isWalletInScope = (wId: string): boolean => {
    if (isSingleWallet) return wId === query.walletId;
    return !excludedWalletIds.has(wId);
  };

  const isGroupRowInScope = (row: GroupRow): boolean => {
    const wId = resolveGroupWallet(row);
    if (isSingleWallet) return wId === query.walletId;
    return wId === null || !excludedWalletIds.has(wId);
  };

  const txs: NormalizedTx[] = [];

  for (const e of entries) {
    if (!isWalletInScope(e.walletId)) continue;
    const w = walletsById.get(e.walletId);
    const curr: CurrencyCode = w?.currency ?? 'VND';

    const cRow = toCountedRow(e, curr);
    if (!cRow.counted) continue;

    const side: 'expense' | 'income' = cRow.signedAmount < 0 ? 'expense' : 'income';
    const amount = Math.abs(cRow.signedAmount);
    const vndVal = entryVnd.get(e.id) ?? (curr === 'VND' ? amount : null);
    const categoryId = resolveCategoryMeta(e.categoryId ?? UNCATEGORIZED_CATEGORY_ID, categoriesById).id;

    txs.push({
      kind: 'entry',
      id: e.id,
      walletId: e.walletId,
      currency: curr,
      date: e.date,
      side,
      amount,
      vndAmount: vndVal,
      categoryId,
      tagIds: e.tagIds ?? [],
    });
  }

  if (query.includeGroups) {
    for (const row of groupRows) {
      if (!isGroupRowInScope(row)) continue;
      const pb = paybacks.get(row.id) ?? 0;
      const eff = groupRowEffect(row, groupSettings, pb);
      if (eff.spending <= 0 && eff.income <= 0) continue;

      const side: 'expense' | 'income' = eff.spending > 0 ? 'expense' : 'income';
      const amount = eff.spending > 0 ? eff.spending : eff.income;
      const resolved = resolveGroupReportCategoryIdWithMap(row, groupSettings, pb, categoriesById, eff);
      const rawCatId =
        resolved?.categoryId ??
        (side === 'expense' ? SYNTHETIC_LEND_CATEGORY_ID : SYNTHETIC_BORROW_CATEGORY_ID);
      const catId = resolveCategoryMeta(rawCatId, categoriesById).id;

      const wId = resolveGroupWallet(row) ?? '';

      txs.push({
        kind: 'group',
        id: row.id,
        walletId: wId,
        currency: 'VND',
        date: row.date,
        side,
        amount,
        vndAmount: amount,
        categoryId: catId,
        tagIds: row.link?.tagIds ?? [],
      });
    }
  }

  return {
    walletsById,
    categoriesById,
    isSingleWallet,
    targetWallet,
    reportCurrency,
    txs,
    allGroupEntries,
    paybacks,
    entryVnd,
  };
}

// --- Single-Purpose Window Totals Aggregator ---

function sumWindowTotals(
  txs: NormalizedTx[],
  from: string,
  to: string,
  isSingleWallet: boolean,
  categoryFilter?: (categoryId: string) => boolean,
): { spent: number; income: number; count: number } {
  let spent = 0;
  let income = 0;
  let count = 0;

  for (const tx of txs) {
    if (tx.date < from || tx.date > to) continue;
    if (categoryFilter && !categoryFilter(tx.categoryId)) continue;

    let amt: number;
    if (isSingleWallet) {
      amt = tx.amount;
    } else {
      if (tx.vndAmount === null) continue;
      amt = tx.vndAmount;
    }

    count++;
    if (tx.side === 'expense') {
      spent += amt;
    } else {
      income += amt;
    }
  }

  return { spent, income, count };
}

interface PrefixCounter {
  sumRange(from: string, to: string): { spent: number; income: number };
}

function createPrefixCounter(txs: NormalizedTx[], isSingleWallet: boolean): PrefixCounter {
  const pts: Array<{ date: string; side: 'expense' | 'income'; amt: number }> = [];
  for (const tx of txs) {
    const amt = isSingleWallet ? tx.amount : tx.vndAmount;
    if (amt === null) continue;
    pts.push({ date: tx.date, side: tx.side, amt });
  }
  pts.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const dates: string[] = [];
  const pSpent: number[] = [];
  const pIncome: number[] = [];
  let s = 0;
  let inc = 0;
  for (const p of pts) {
    if (p.side === 'expense') s += p.amt;
    else inc += p.amt;
    dates.push(p.date);
    pSpent.push(s);
    pIncome.push(inc);
  }

  const prefixAt = (targetDate: string, inclusive: boolean): { spent: number; income: number } => {
    let lo = 0;
    let hi = dates.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const cmp = dates[mid]!;
      if (inclusive ? cmp <= targetDate : cmp < targetDate) lo = mid + 1;
      else hi = mid;
    }
    const idx = lo - 1;
    return idx >= 0 ? { spent: pSpent[idx]!, income: pIncome[idx]! } : { spent: 0, income: 0 };
  };

  return {
    sumRange(from: string, to: string) {
      if (to < from || dates.length === 0) return { spent: 0, income: 0 };
      const hi = prefixAt(to, true);
      const lo = prefixAt(from, false);
      return { spent: hi.spent - lo.spent, income: hi.income - lo.income };
    },
  };
}

// --- Health Series Builder ---

function buildHealthSeries(params: {
  prefix: PrefixCounter;
  period: ReportPeriodWindow;
  activeBaselines: ReportPeriodWindow['baselines'];
  today: string;
}): ReportHealthPoint[] {
  const { prefix, period, activeBaselines, today } = params;
  const k = activeBaselines.length;
  const healthSeries: ReportHealthPoint[] = [];

  if (period.granularity === 'day') {
    const numDays = diffDaysUtc(period.from, period.to) + 1;
    const WEEK_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

    for (let idx = 0; idx < numDays; idx++) {
      const date = addDaysUtc(period.from, idx);
      let label: string;
      if (period.mode === 'month') {
        label = date.slice(8, 10);
      } else if (period.mode === 'week') {
        label = WEEK_LABELS[idx] ?? '';
      } else {
        label = `${date.slice(8, 10)}/${date.slice(5, 7)}`;
      }

      let expense: number | null = null;
      let income: number | null = null;

      if (date <= period.effectiveTo && date <= today) {
        const cum = prefix.sumRange(period.from, date);
        expense = cum.spent;
        income = cum.income;
      }

      let avgExpense: number | null = null;
      let avgIncome: number | null = null;

      if (k > 0) {
        let bSumSpent = 0;
        let bSumIncome = 0;
        for (const b of activeBaselines) {
          let cutoff: string;
          if (period.mode === 'month') {
            cutoff = clampDayOfMonth(b.from.slice(0, 7), idx + 1);
          } else {
            const candidate = addDaysUtc(b.from, idx);
            cutoff = candidate <= b.to ? candidate : b.to;
          }
          const bCum = prefix.sumRange(b.from, cutoff);
          bSumSpent += bCum.spent;
          bSumIncome += bCum.income;
        }
        avgExpense = Math.round(bSumSpent / k);
        avgIncome = Math.round(bSumIncome / k);
      }

      healthSeries.push({ index: idx, date, label, income, expense, avgIncome, avgExpense });
    }
  } else {
    // Monthly granularity
    interface MonthBucket {
      monthKey: string;
      start: string;
      end: string;
      date: string;
      label: string;
    }
    const mBuckets: MonthBucket[] = [];

    if (period.mode === 'year') {
      const yStr = period.from.slice(0, 4);
      for (let m = 1; m <= 12; m++) {
        const mKey = `${yStr}-${String(m).padStart(2, '0')}`;
        const start = `${mKey}-01`;
        const end = endOfMonthUtc(mKey);
        mBuckets.push({ monthKey: mKey, start, end, date: end, label: `T${m}` });
      }
    } else {
      const fromYm = period.from.slice(0, 7);
      const toYm = period.to.slice(0, 7);
      let curYm = fromYm;
      while (curYm <= toYm) {
        const start = curYm === fromYm ? period.from : `${curYm}-01`;
        const end = curYm === toYm ? period.to : endOfMonthUtc(curYm);
        mBuckets.push({
          monthKey: curYm,
          start,
          end,
          date: end,
          label: `${curYm.slice(5, 7)}/${curYm.slice(2, 4)}`,
        });
        curYm = addMonthsUtc(curYm, 1);
      }
    }

    for (let idx = 0; idx < mBuckets.length; idx++) {
      const bkt = mBuckets[idx]!;

      let expense: number | null = null;
      let income: number | null = null;

      if (period.effectiveTo >= bkt.start && today >= bkt.start) {
        const rawCutoff = bkt.end <= period.effectiveTo ? bkt.end : period.effectiveTo;
        const cutoff = rawCutoff <= today ? rawCutoff : today;
        const cum = prefix.sumRange(period.from, cutoff);
        expense = cum.spent;
        income = cum.income;
      }

      let avgExpense: number | null = null;
      let avgIncome: number | null = null;

      if (k > 0) {
        let bSumSpent = 0;
        let bSumIncome = 0;
        for (const b of activeBaselines) {
          let cutoff: string;
          if (period.mode === 'year') {
            const bYear = b.from.slice(0, 4);
            const mNum = bkt.monthKey.slice(5, 7);
            cutoff = endOfMonthUtc(`${bYear}-${mNum}`);
          } else {
            const offsetEnd = diffDaysUtc(period.from, bkt.end);
            const candidate = addDaysUtc(b.from, offsetEnd);
            cutoff = candidate <= b.to ? candidate : b.to;
          }
          const bCum = prefix.sumRange(b.from, cutoff);
          bSumSpent += bCum.spent;
          bSumIncome += bCum.income;
        }
        avgExpense = Math.round(bSumSpent / k);
        avgIncome = Math.round(bSumIncome / k);
      }

      healthSeries.push({
        index: idx,
        date: bkt.date,
        label: bkt.label,
        income,
        expense,
        avgIncome,
        avgExpense,
      });
    }
  }

  return healthSeries;
}

// --- Category & Tag Lists Builders ---

interface CatAccum {
  meta: CategoryMeta;
  side: 'expense' | 'income';
  total: number;
  subMap: Map<string, { meta: CategoryMeta; amount: number; isGeneral?: boolean }>;
}

function buildCategoryLists(
  categoryAccums: Map<string, CatAccum>,
  totals: ReportMoneyTotals,
): { spendingByCategory: ReportCategoryItem[]; incomeByCategory: ReportCategoryItem[] } {
  const buildList = (targetSide: 'expense' | 'income', sideTotal: number): ReportCategoryItem[] => {
    const list: ReportCategoryItem[] = [];
    for (const acc of categoryAccums.values()) {
      if (acc.side !== targetSide || acc.total <= 0) continue;

      const subCategories: ReportSubCategoryItem[] = [];
      for (const sub of acc.subMap.values()) {
        if (sub.amount <= 0) continue;
        const name = sub.isGeneral ? `${acc.meta.name} (chung)` : sub.meta.name;
        subCategories.push({
          categoryId: sub.meta.id,
          name,
          icon: sub.meta.icon,
          amount: sub.amount,
          percent: acc.total > 0 ? Math.round((sub.amount / acc.total) * 100) : 0,
          isGeneralParentBucket: sub.isGeneral,
        });
      }

      subCategories.sort((a, b) => {
        if (b.amount !== a.amount) return b.amount - a.amount;
        return a.name.localeCompare(b.name);
      });

      list.push({
        categoryId: acc.meta.id,
        name: acc.meta.name,
        icon: acc.meta.icon,
        type: acc.side,
        amount: acc.total,
        percent: sideTotal > 0 ? Math.round((acc.total / sideTotal) * 100) : 0,
        subCategories,
      });
    }

    list.sort((a, b) => {
      if (b.amount !== a.amount) return b.amount - a.amount;
      return a.name.localeCompare(b.name);
    });

    return list;
  };

  return {
    spendingByCategory: buildList('expense', totals.spent),
    incomeByCategory: buildList('income', totals.income),
  };
}

function buildTagLists(
  expenseTagMap: Map<string, { amount: number; count: number }>,
  incomeTagMap: Map<string, { amount: number; count: number }>,
  tags: TagView[],
  totals: ReportMoneyTotals,
): { expense: ReportTagItem[]; income: ReportTagItem[] } {
  const tagsById = new Map<string, string>();
  for (const t of tags) tagsById.set(t.id, t.name);

  const buildList = (
    tMap: Map<string, { amount: number; count: number }>,
    sideTotal: number,
  ): ReportTagItem[] => {
    const list: ReportTagItem[] = [];
    for (const [tid, vals] of tMap.entries()) {
      if (vals.amount <= 0) continue;
      const name = tagsById.get(tid) ?? tid;
      list.push({
        tagId: tid,
        name,
        amount: vals.amount,
        percent: sideTotal > 0 ? Math.round((vals.amount / sideTotal) * 100) : 0,
        entryCount: vals.count,
      });
    }
    list.sort((a, b) => {
      if (b.amount !== a.amount) return b.amount - a.amount;
      return a.name.localeCompare(b.name);
    });
    return list;
  };

  return {
    expense: buildList(expenseTagMap, totals.spent),
    income: buildList(incomeTagMap, totals.income),
  };
}

// --- Main Report Builder ---

export function buildReport(input: {
  wallets: WalletDetailView[];
  entries: Array<CalcEntry & { categoryId: string | null; tagIds: string[] }>;
  categories: CategoryView[];
  tags: TagView[];
  groupRows: GroupRow[];
  groupSettings: GroupSettingsView;
  query: ReportQuery;
  today: string;
}): ReportData {
  const { entries, categories, tags, query, today } = input;
  const period = resolveReportPeriod(query, today);

  const norm = normalizeInScopeTransactions(input);
  const {
    walletsById,
    categoriesById,
    isSingleWallet,
    targetWallet,
    reportCurrency,
    txs,
    allGroupEntries,
  } = norm;

  const singleWallet = targetWallet
    ? {
        walletId: targetWallet.id,
        name: targetWallet.name,
        currency: targetWallet.currency,
        excludedFromTotal: Boolean(targetWallet.excludeFromReports),
      }
    : null;

  // Determine earliestDate across all in-scope historical rows
  let earliestDate: string | null = null;
  for (const tx of txs) {
    if (earliestDate === null || tx.date < earliestDate) {
      earliestDate = tx.date;
    }
  }

  const activeBaselines =
    earliestDate === null ? [] : period.baselines.filter((b) => earliestDate! <= b.to);
  const k = activeBaselines.length;

  // Active period transactions
  const activeTxs = txs.filter((tx) => tx.date >= period.from && tx.date <= period.effectiveTo);

  let spentTotal = 0;
  let incomeTotal = 0;
  let countedCount = 0;
  let approximate = false;

  const perCurrencyMap = new Map<CurrencyCode, { spent: number; income: number }>();
  const unratedMap = new Map<string, { spent: number; income: number }>();
  const countedRows: ReportRowRef[] = [];
  let hasMultiTagOverlap = false;

  const categoryAccums = new Map<string, CatAccum>();
  const expenseTagMap = new Map<string, { amount: number; count: number }>();
  const incomeTagMap = new Map<string, { amount: number; count: number }>();

  for (const tx of activeTxs) {
    countedCount++;

    // Update perCurrency (native currency)
    let pCurr = perCurrencyMap.get(tx.currency);
    if (!pCurr) {
      pCurr = { spent: 0, income: 0 };
      perCurrencyMap.set(tx.currency, pCurr);
    }
    if (tx.side === 'expense') pCurr.spent += tx.amount;
    else pCurr.income += tx.amount;

    // Handle unrated in All-wallets mode
    if (!isSingleWallet && tx.vndAmount === null) {
      let u = unratedMap.get(tx.walletId);
      if (!u) {
        u = { spent: 0, income: 0 };
        unratedMap.set(tx.walletId, u);
      }
      if (tx.side === 'expense') u.spent += tx.amount;
      else u.income += tx.amount;

      countedRows.push(toReportRowRef(tx, isSingleWallet, null));
      continue;
    }

    const reportAmount = isSingleWallet ? tx.amount : tx.vndAmount!;
    if (!isSingleWallet && tx.currency !== 'VND') {
      approximate = true;
    }

    if (tx.side === 'expense') spentTotal += reportAmount;
    else incomeTotal += reportAmount;

    countedRows.push(toReportRowRef(tx, isSingleWallet, reportAmount));

    // Accumulate Category
    const rawCat = resolveCategoryMeta(tx.categoryId, categoriesById);
    let parentCat: CategoryMeta = rawCat;
    let subCat: CategoryMeta = rawCat;
    let isGeneral = true;

    if (rawCat.parentId) {
      const parentFound = categoriesById.get(rawCat.parentId);
      if (parentFound && parentFound.type === tx.side) {
        parentCat = {
          id: parentFound.id,
          name: parentFound.name,
          icon: parentFound.icon,
          parentId: null,
          type: parentFound.type,
        };
        subCat = rawCat;
        isGeneral = false;
      }
    }

    const catKey = `${tx.side}:${parentCat.id}`;
    let catAcc = categoryAccums.get(catKey);
    if (!catAcc) {
      catAcc = { meta: parentCat, side: tx.side, total: 0, subMap: new Map() };
      categoryAccums.set(catKey, catAcc);
    }
    catAcc.total += reportAmount;

    let subItem = catAcc.subMap.get(subCat.id);
    if (!subItem) {
      subItem = { meta: subCat, amount: 0, isGeneral };
      catAcc.subMap.set(subCat.id, subItem);
    }
    subItem.amount += reportAmount;

    // Accumulate Tags (deduplicated per entry, overlap flagged only for counted entries)
    const uniqueTags = new Set(tx.tagIds);
    if (uniqueTags.size > 1) {
      hasMultiTagOverlap = true;
    }

    const tMap = tx.side === 'expense' ? expenseTagMap : incomeTagMap;
    for (const tid of uniqueTags) {
      let tAcc = tMap.get(tid);
      if (!tAcc) {
        tAcc = { amount: 0, count: 0 };
        tMap.set(tid, tAcc);
      }
      tAcc.amount += reportAmount;
      tAcc.count += 1;
    }
  }

  // Build unratedWallets
  const unratedWallets: ReportUnratedWallet[] = [];
  if (!isSingleWallet) {
    for (const [wId, vals] of unratedMap.entries()) {
      if (vals.spent > 0 || vals.income > 0) {
        const w = walletsById.get(wId);
        if (w) {
          unratedWallets.push({
            walletId: w.id,
            name: w.name,
            currency: w.currency,
            spent: vals.spent,
            income: vals.income,
          });
        }
      }
    }
    unratedWallets.sort((a, b) => a.name.localeCompare(b.name));
  }

  const totals: ReportMoneyTotals = {
    spent: spentTotal,
    income: incomeTotal,
    net: incomeTotal - spentTotal,
  };

  const hasAnyUnratedOnly =
    !isSingleWallet &&
    countedCount > 0 &&
    totals.spent === 0 &&
    totals.income === 0 &&
    unratedWallets.length > 0;

  // Build perCurrency
  const perCurrency: { currency: CurrencyCode; spent: number; income: number }[] = [];
  if (isSingleWallet) {
    const acc = perCurrencyMap.get(reportCurrency);
    if (acc && (acc.spent > 0 || acc.income > 0)) {
      perCurrency.push({ currency: reportCurrency, spent: acc.spent, income: acc.income });
    }
  } else {
    const seenCodes = new Set(perCurrencyMap.keys());
    const sortedCodes: CurrencyCode[] = [];
    if (seenCodes.has('VND')) sortedCodes.push('VND');
    for (const code of CURRENCY_CODES) {
      if (code !== 'VND' && seenCodes.has(code)) sortedCodes.push(code);
    }
    for (const code of sortedCodes) {
      const acc = perCurrencyMap.get(code);
      if (acc && (acc.spent > 0 || acc.income > 0)) {
        perCurrency.push({ currency: code, spent: acc.spent, income: acc.income });
      }
    }
  }

  const prefix = createPrefixCounter(txs, isSingleWallet);

  // previousDelta
  const prevTotals = prefix.sumRange(period.previous.from, period.previous.effectiveTo);
  const spentDiff = totals.spent - prevTotals.spent;
  const incomeDiff = totals.income - prevTotals.income;
  const previousDelta: ReportDelta = {
    previousSpent: prevTotals.spent,
    previousIncome: prevTotals.income,
    spentDiff,
    incomeDiff,
    spentPct: calcPercent(spentDiff, prevTotals.spent),
    incomePct: calcPercent(incomeDiff, prevTotals.income),
  };

  // baseline3m
  let baseline3m: (ReportDelta & { historyCount: number }) | null = null;
  if (k > 0) {
    let sumBaseSpent = 0;
    let sumBaseIncome = 0;
    for (const b of activeBaselines) {
      const bTotals = prefix.sumRange(b.from, b.effectiveTo);
      sumBaseSpent += bTotals.spent;
      sumBaseIncome += bTotals.income;
    }
    const avgSpent = Math.round(sumBaseSpent / k);
    const avgIncome = Math.round(sumBaseIncome / k);
    const bSpentDiff = totals.spent - avgSpent;
    const bIncomeDiff = totals.income - avgIncome;
    baseline3m = {
      previousSpent: avgSpent,
      previousIncome: avgIncome,
      spentDiff: bSpentDiff,
      incomeDiff: bIncomeDiff,
      spentPct: calcPercent(bSpentDiff, avgSpent),
      incomePct: calcPercent(bIncomeDiff, avgIncome),
      historyCount: k,
    };
  }

  // Health series
  const healthSeries = buildHealthSeries({
    prefix,
    period,
    activeBaselines,
    today,
  });

  // Categories & Tags
  const { spendingByCategory, incomeByCategory } = buildCategoryLists(categoryAccums, totals);
  const tagLists = buildTagLists(expenseTagMap, incomeTagMap, tags, totals);

  // Wallet balance series
  let walletBalance: WalletBalanceSeriesResult | null = null;
  if (targetWallet) {
    const walletEntries = entries.filter((e) => e.walletId === targetWallet.id);
    const walletGroup = allGroupEntries.filter((ge) => ge.walletId === targetWallet.id);
    walletBalance = walletBalanceSeries(
      targetWallet,
      [...walletEntries, ...walletGroup],
      { from: period.from, to: period.to, granularity: period.granularity },
      today,
    );
  }

  return {
    period,
    currency: reportCurrency,
    approximate,
    singleWallet,
    totals,
    perCurrency,
    previousDelta,
    baseline3m,
    unratedWallets,
    countedCount,
    hasAnyUnratedOnly,
    healthSeries,
    spendingByCategory,
    incomeByCategory,
    tags: {
      expense: tagLists.expense,
      income: tagLists.income,
      hasMultiTagOverlap,
    },
    walletBalance,
    countedRows,
  };
}

// --- Category Drilldown Builder ---

export function buildCategoryDrilldown(
  report: ReportData,
  input: Parameters<typeof buildReport>[0] & { categoryId: string },
): ReportCategoryDrilldown | null {
  const { categoryId } = input;
  const norm = normalizeInScopeTransactions(input);

  const activeItem =
    report.spendingByCategory.find((c) => c.categoryId === categoryId) ??
    report.incomeByCategory.find((c) => c.categoryId === categoryId);

  const meta = resolveCategoryMeta(categoryId, norm.categoriesById);
  const isKnown =
    activeItem !== undefined ||
    meta.id !== UNCATEGORIZED_CATEGORY_ID ||
    categoryId === UNCATEGORIZED_CATEGORY_ID ||
    norm.categoriesById.has(categoryId);

  const childCategoryIds = new Set<string>();
  for (const c of norm.categoriesById.values()) {
    if (c.parentId === categoryId) {
      childCategoryIds.add(c.id);
    }
  }

  const matchesCategory = (cid: string | null): boolean => {
    const rawId = cid ?? UNCATEGORIZED_CATEGORY_ID;
    return rawId === categoryId || childCategoryIds.has(rawId);
  };

  const determinedType: 'expense' | 'income' =
    activeItem?.type ??
    meta.type ??
    (norm.categoriesById.get(categoryId)?.type ?? 'expense');

  // Reuse shared sumWindowTotals with categoryFilter
  const prevRes = sumWindowTotals(
    norm.txs,
    report.period.previous.from,
    report.period.previous.effectiveTo,
    norm.isSingleWallet,
    matchesCategory,
  );
  const previousTotal = determinedType === 'expense' ? prevRes.spent : prevRes.income;

  const k = report.baseline3m?.historyCount ?? 0;
  let baseline3mAvg: number | null = null;
  if (k > 0) {
    let sumBase = 0;
    for (let i = 0; i < k; i++) {
      const b = report.period.baselines[i]!;
      const bRes = sumWindowTotals(norm.txs, b.from, b.effectiveTo, norm.isSingleWallet, matchesCategory);
      sumBase += determinedType === 'expense' ? bRes.spent : bRes.income;
    }
    baseline3mAvg = Math.round(sumBase / k);
  }

  const activeRes = sumWindowTotals(
    norm.txs,
    report.period.from,
    report.period.effectiveTo,
    norm.isSingleWallet,
    matchesCategory,
  );

  if (!isKnown && activeRes.count === 0 && prevRes.count === 0 && (baseline3mAvg === null || baseline3mAvg === 0)) {
    return null;
  }

  const total = activeItem?.amount ?? (determinedType === 'expense' ? activeRes.spent : activeRes.income);
  const name = activeItem?.name ?? meta.name;
  const icon = activeItem?.icon ?? meta.icon;
  const subCategories = activeItem?.subCategories ?? [];

  const rows = report.countedRows.filter((r) => {
    if (r.type !== determinedType) return false;
    return matchesCategory(r.categoryId);
  });

  const diffFromPrevious = total - previousTotal;
  const pctFromPrevious = calcPercent(diffFromPrevious, previousTotal);

  return {
    categoryId,
    name,
    icon,
    type: determinedType,
    currency: report.currency,
    approximate: report.approximate,
    total,
    previousTotal,
    diffFromPrevious,
    pctFromPrevious,
    baseline3mAvg,
    historyCount: k,
    subCategories,
    rows,
  };
}
