import { describe, it, expect } from 'vitest';
import {
  resolveReportPeriod,
  resolveGroupReportCategoryId,
  buildReport,
  buildCategoryDrilldown,
  filterReportTags,
  UNCATEGORIZED_CATEGORY_ID,
  SYNTHETIC_GROUP_CATEGORY_ID,
  SYNTHETIC_LEND_CATEGORY_ID,
  SYNTHETIC_BORROW_CATEGORY_ID,
  type ReportQuery,
  type ReportTagItem,
} from '../src/reports';
import { sumCounted, type CountedRow, type CalcWallet, type CalcEntry } from '../src/wallets';
import { groupRowsTotals, type GroupRow, type GroupSettingsView } from '../src/groupShares';
import type { CategoryView, TagView, WalletDetailView } from '../src/api-types';

function createWallet(
  id: string,
  currency: 'VND' | 'USD' | 'USDT' = 'VND',
  overrides?: Partial<WalletDetailView>,
): WalletDetailView {
  return {
    id,
    name: `Wallet ${id}`,
    currency,
    balance: 10_000_000,
    isDefault: id === 'w-default',
    kind: 'everyday',
    startAmount: 10_000_000,
    startDate: '2026-01-01',
    startCostVnd: currency === 'VND' ? null : 25_000_000,
    vndValue: 10_000_000,
    icon: 'wallet',
    sortOrder: 1,
    archived: false,
    entryCount: 0,
    excludeFromReports: false,
    ...overrides,
  };
}

function createEntry(
  id: string,
  walletId: string,
  type: CalcEntry['type'],
  amount: number,
  date: string,
  categoryId: string | null = null,
  tagIds: string[] = [],
  overrides?: Partial<CalcEntry>,
): CalcEntry & { categoryId: string | null; tagIds: string[] } {
  return {
    id,
    walletId,
    type,
    amount,
    date,
    time: null,
    createdAt: `${date}T10:00:00Z`,
    transferId: null,
    excludeFromReports: false,
    categoryId,
    tagIds,
    ...overrides,
  };
}

function createGroupRow(
  id: string,
  date: string,
  source: 'expense' | 'fund' | 'payment',
  total: number,
  myShare: number,
  iPaid: boolean,
  overrides?: Partial<GroupRow>,
): GroupRow {
  return {
    kind: 'group',
    id,
    rootId: id,
    tripId: 'trip-1',
    tripName: 'Trip 1',
    isDirect: false,
    source,
    date,
    title: `Group row ${id}`,
    total,
    myShare,
    iPaid,
    payerName: iPaid ? 'Me' : 'Friend',
    counterpartName: iPaid ? 'Friend' : 'Me',
    people: ['Me', 'Friend'],
    pending: false,
    link: null,
    createdAt: `${date}T10:00:00Z`,
    activityAt: `${date}T10:00:00Z`,
    ...overrides,
  };
}

describe('reports engine', () => {
  const defaultSettings: GroupSettingsView = {
    defaultGroupCategoryId: null,
    countLoans: false,
  };

  // Block 1: Periods, In-Progress Cutoffs, Clamping, History Counts
  describe('Block 1: Periods & UTC arithmetic', () => {
    const today = '2026-11-24';

    it('resolves active month mode with in-progress cutoff and baselines', () => {
      const q: ReportQuery = { mode: 'month', month: '2026-11', includeGroups: true };
      const res = resolveReportPeriod(q, today);

      expect(res.mode).toBe('month');
      expect(res.from).toBe('2026-11-01');
      expect(res.to).toBe('2026-11-30');
      expect(res.inProgress).toBe(true);
      expect(res.effectiveTo).toBe('2026-11-24');
      expect(res.granularity).toBe('day');

      expect(res.previous).toEqual({
        from: '2026-10-01',
        to: '2026-10-31',
        effectiveTo: '2026-10-24',
      });

      expect(res.baselines).toHaveLength(3);
      expect(res.baselines[0]).toEqual(res.previous);
      expect(res.baselines[1]).toEqual({
        from: '2026-09-01',
        to: '2026-09-30',
        effectiveTo: '2026-09-24',
      });
      expect(res.baselines[2]).toEqual({
        from: '2026-08-01',
        to: '2026-08-31',
        effectiveTo: '2026-08-24',
      });
    });

    it('resolves completed past month without in-progress cutoff', () => {
      const q: ReportQuery = { mode: 'month', month: '2026-10', includeGroups: true };
      const res = resolveReportPeriod(q, today);

      expect(res.inProgress).toBe(false);
      expect(res.from).toBe('2026-10-01');
      expect(res.to).toBe('2026-10-31');
      expect(res.effectiveTo).toBe('2026-10-31');
      expect(res.previous.effectiveTo).toBe('2026-09-30');
    });

    it('clamps day 31 to Feb 28 on non-leap years and Feb 29 on leap years', () => {
      // 2026 is non-leap
      const q2026: ReportQuery = { mode: 'month', month: '2026-03', includeGroups: true };
      const res2026 = resolveReportPeriod(q2026, '2026-03-31');
      expect(res2026.previous.effectiveTo).toBe('2026-02-28');

      // 2024 is leap year
      const q2024: ReportQuery = { mode: 'month', month: '2024-03', includeGroups: true };
      const res2024 = resolveReportPeriod(q2024, '2024-03-31');
      expect(res2024.previous.effectiveTo).toBe('2024-02-29');
    });

    it('resolves week mode (Mon-Sun)', () => {
      // 2026-11-24 is Tuesday
      const q: ReportQuery = { mode: 'week', week: '2026-11-24', includeGroups: true };
      const res = resolveReportPeriod(q, today);

      expect(res.from).toBe('2026-11-23'); // Mon
      expect(res.to).toBe('2026-11-29'); // Sun
      expect(res.inProgress).toBe(true);
      expect(res.effectiveTo).toBe('2026-11-24'); // Tue
      expect(res.previous).toEqual({
        from: '2026-11-16',
        to: '2026-11-22',
        effectiveTo: '2026-11-17',
      });
    });

    it('resolves year mode with monthly granularity and Jan 1..today cutoff', () => {
      const q: ReportQuery = { mode: 'year', year: '2026', includeGroups: true };
      const res = resolveReportPeriod(q, today);

      expect(res.from).toBe('2026-01-01');
      expect(res.to).toBe('2026-12-31');
      expect(res.inProgress).toBe(true);
      expect(res.effectiveTo).toBe('2026-11-24');
      expect(res.granularity).toBe('month');
      expect(res.previous).toEqual({
        from: '2025-01-01',
        to: '2025-12-31',
        effectiveTo: '2025-11-24',
      });
    });

    it('computes healthSeries avgExpense with Feb 28 clamping, Year T1..T12 points, and previousDelta/baseline3m', () => {
      const w = createWallet('w1');
      // Non-leap Mar 2026 day 31 clamps to Feb 28 in avgExpense and compares Mar vs Feb
      const entriesMar = [
        createEntry('m1', 'w1', 'expense', 300_000, '2026-03-31'),
        createEntry('f1', 'w1', 'expense', 100_000, '2026-02-28'),
        createEntry('f2', 'w1', 'income', 500_000, '2026-02-15'),
      ];
      const repMar = buildReport({
        wallets: [w],
        entries: entriesMar,
        categories: [],
        tags: [],
        groupRows: [],
        groupSettings: defaultSettings,
        query: { mode: 'month', month: '2026-03', includeGroups: false },
        today: '2026-03-31',
      });
      expect(repMar.healthSeries).toHaveLength(31);
      expect(repMar.healthSeries[30]?.avgExpense).toBe(100_000);
      expect(repMar.previousDelta.previousSpent).toBe(100_000);
      expect(repMar.previousDelta.spentDiff).toBe(200_000);
      expect(repMar.previousDelta.spentPct).toBe(200);
      expect(repMar.baseline3m?.historyCount).toBe(1);
      expect(repMar.baseline3m?.spentPct).toBe(200);

      // Year mode T1..T12 cumulative + Jan 1..today cutoff on 2026-11-24
      const repYear = buildReport({
        wallets: [w],
        entries: [
          createEntry('y26-1', 'w1', 'expense', 200_000, '2026-02-10'),
          createEntry('y26-2', 'w1', 'expense', 100_000, '2026-11-10'),
          createEntry('y25-1', 'w1', 'expense', 150_000, '2025-11-20'), // within 2025-11-24
          createEntry('y25-2', 'w1', 'expense', 900_000, '2025-12-10'), // excluded from in-progress comparison
        ],
        categories: [],
        tags: [],
        groupRows: [],
        groupSettings: defaultSettings,
        query: { mode: 'year', year: '2026', includeGroups: false },
        today,
      });
      expect(repYear.healthSeries).toHaveLength(12);
      expect(repYear.healthSeries[0]?.label).toBe('T1');
      expect(repYear.healthSeries[1]?.expense).toBe(200_000);
      expect(repYear.healthSeries[10]?.expense).toBe(300_000);
      expect(repYear.healthSeries[11]?.expense).toBeNull(); // T12 future bucket
      expect(repYear.healthSeries[11]?.avgExpense).toBe(1_050_000); // Full prior year in area baseline
      expect(repYear.previousDelta.previousSpent).toBe(150_000);
      expect(repYear.previousDelta.spentPct).toBe(100);
    });

    it('resolves custom mode: <= 90 days is day granularity, > 90 days is month granularity, swaps reversed bounds', () => {
      // Reversed bounds <= 90 days
      const qShort: ReportQuery = {
        mode: 'custom',
        from: '2026-11-20',
        to: '2026-11-01',
        includeGroups: true,
      };
      const resShort = resolveReportPeriod(qShort, today);
      expect(resShort.from).toBe('2026-11-01');
      expect(resShort.to).toBe('2026-11-20');
      expect(resShort.granularity).toBe('day');

      // > 90 days
      const qLong: ReportQuery = {
        mode: 'custom',
        from: '2026-01-01',
        to: '2026-06-30',
        includeGroups: true,
      };
      const resLong = resolveReportPeriod(qLong, today);
      expect(resLong.granularity).toBe('month');
    });

    it('correctly sets historyCount k = 0, 1, 2, 3 and future healthSeries points to null', () => {
      const w = createWallet('w1');
      const baseInput = {
        wallets: [w],
        categories: [],
        tags: [],
        groupRows: [],
        groupSettings: defaultSettings,
        query: { mode: 'month' as const, month: '2026-11', includeGroups: true },
        today,
      };

      // k = 0 (no history before 2026-11)
      const r0 = buildReport({
        ...baseInput,
        entries: [createEntry('e1', 'w1', 'expense', 100_000, '2026-11-10')],
      });
      expect(r0.baseline3m).toBeNull();
      // In healthSeries, day 25 is > today ('2026-11-24'), so expense and income must be null
      const day25 = r0.healthSeries.find((p) => p.date === '2026-11-25');
      expect(day25?.expense).toBeNull();
      expect(day25?.income).toBeNull();
      expect(day25?.avgExpense).toBeNull();

      // k = 1 (history extends to Oct 2026)
      const r1 = buildReport({
        ...baseInput,
        entries: [
          createEntry('e1', 'w1', 'expense', 100_000, '2026-11-10'),
          createEntry('e0', 'w1', 'expense', 120_000, '2026-10-15'),
        ],
      });
      expect(r1.baseline3m?.historyCount).toBe(1);

      // k = 2 (history extends to Sep 2026)
      const r2 = buildReport({
        ...baseInput,
        entries: [
          createEntry('e1', 'w1', 'expense', 100_000, '2026-11-10'),
          createEntry('e0', 'w1', 'expense', 120_000, '2026-09-15'),
        ],
      });
      expect(r2.baseline3m?.historyCount).toBe(2);

      // k = 3 (history extends to Aug 2026 or earlier)
      const r3 = buildReport({
        ...baseInput,
        entries: [
          createEntry('e1', 'w1', 'expense', 100_000, '2026-11-10'),
          createEntry('e0', 'w1', 'expense', 120_000, '2026-08-01'),
        ],
      });
      expect(r3.baseline3m?.historyCount).toBe(3);
    });

    it('returns income: null, expense: null on future buckets when period is in the future', () => {
      const w = createWallet('w1');
      const res = buildReport({
        wallets: [w],
        entries: [createEntry('e1', 'w1', 'expense', 100_000, '2026-12-05')],
        categories: [],
        tags: [],
        groupRows: [],
        groupSettings: defaultSettings,
        query: { mode: 'month', month: '2026-12', includeGroups: true },
        today,
      });

      expect(res.period.inProgress).toBe(false);
      expect(res.healthSeries.length).toBeGreaterThan(0);
      // All health points in Dec 2026 should have null actuals since today is 2026-11-24
      for (const pt of res.healthSeries) {
        expect(pt.expense).toBeNull();
        expect(pt.income).toBeNull();
      }
    });
  });

  // Block 2: Agreement invariant with sumCounted + groupRowsTotals
  describe('Block 2: Agreement invariant with sumCounted + groupRowsTotals', () => {
    it('strictly satisfies agreement invariant across all entry/group variations', () => {
      const wMain = createWallet('w-main', 'VND');
      const wArchived = createWallet('w-arch', 'VND', { archived: true });
      const wExcluded = createWallet('w-excl', 'VND', { excludeFromReports: true });

      const wallets = [wMain, wArchived, wExcluded];

      const entries = [
        createEntry('e1', 'w-main', 'expense', 100_000, '2026-11-05'),
        createEntry('e2', 'w-main', 'income', 500_000, '2026-11-06'),
        createEntry('e3', 'w-arch', 'expense', 40_000, '2026-11-07'), // Archived wallet counts!
        createEntry('e4', 'w-excl', 'expense', 999_000, '2026-11-08'), // Excluded wallet stays out!
        createEntry('e5', 'w-main', 'transfer_out', 50_000, '2026-11-09', null, [], {
          excludeFromReports: true,
        }), // Normal transfer excluded
        createEntry('e6', 'w-main', 'transfer_out', 30_000, '2026-11-10', null, [], {
          excludeFromReports: false,
        }), // Un-excluded transfer_out counts as spent
        createEntry('e7', 'w-main', 'buy', 200_000, '2026-11-11'), // Trade ignored
        createEntry('e8', 'w-main', 'sell', 200_000, '2026-11-12'), // Trade ignored
        createEntry('e9', 'w-main', 'expense', 15_000, '2026-11-13', null, [], {
          source: 'adjustment',
        } as unknown as Partial<CalcEntry>), // Adjustment ignored
      ];

      const groupRows = [
        createGroupRow('g1', '2026-11-15', 'expense', 120_000, 60_000, true), // Expense: myShare 60k spent
        createGroupRow('g2', '2026-11-16', 'fund', 50_000, 0, true), // Fund contribution: 50k spent
        createGroupRow('g3', '2026-11-17', 'expense', 200_000, 100_000, false, { pending: true }), // Pending ignored
      ];

      const report = buildReport({
        wallets,
        entries,
        categories: [],
        tags: [],
        groupRows,
        groupSettings: defaultSettings,
        query: { mode: 'month', month: '2026-11', includeGroups: true },
        today: '2026-11-24',
      });

      // Compute with sumCounted:
      // In-scope entries (non-excluded wallets, non-trade, non-adjustment, non-excludedFromReports)
      const countedRowsForSum: CountedRow[] = [
        { currency: 'VND', signedAmount: -100_000, counted: true },
        { currency: 'VND', signedAmount: 500_000, counted: true },
        { currency: 'VND', signedAmount: -40_000, counted: true }, // w-arch
        { currency: 'VND', signedAmount: -30_000, counted: true }, // e6
      ];
      const manualSum = sumCounted(countedRowsForSum);
      const manualSpent = manualSum.find((s) => s.currency === 'VND')?.spent ?? 0;
      const manualIncome = manualSum.find((s) => s.currency === 'VND')?.income ?? 0;

      const groupTotals = groupRowsTotals(groupRows, defaultSettings, new Map());

      expect(report.totals.spent).toBe(manualSpent + groupTotals.spent);
      expect(report.totals.income).toBe(manualIncome + groupTotals.income);
      expect(report.totals.spent).toBe(100_000 + 40_000 + 30_000 + 60_000 + 50_000);
      expect(report.totals.income).toBe(500_000);
    });

    it('matches countLoans: true and excludes group rows resolved to excludeFromReports wallets', () => {
      const wMain = createWallet('w-main', 'VND');
      const wExcl = createWallet('w-excl', 'VND', { excludeFromReports: true });
      const groupRows = [
        createGroupRow('g-loan', '2026-11-10', 'expense', 300_000, 100_000, true, {
          isDirect: true,
          link: {
            walletId: 'w-main',
            categoryId: null,
            tagIds: [],
            intent: 'loan',
            excludeFromReports: false,
          },
        }),
        createGroupRow('g-excl', '2026-11-12', 'expense', 200_000, 100_000, true, {
          link: {
            walletId: 'w-excl',
            categoryId: null,
            tagIds: [],
            intent: null,
            excludeFromReports: false,
          },
        }),
      ];
      const loanSettings: GroupSettingsView = { defaultGroupCategoryId: null, countLoans: true };
      const report = buildReport({
        wallets: [wMain, wExcl],
        entries: [],
        categories: [],
        tags: [],
        groupRows,
        groupSettings: loanSettings,
        query: { mode: 'month', month: '2026-11', includeGroups: true },
        today: '2026-11-24',
      });
      // g-loan counts (total - myShare = 200k), g-excl is ignored under All wallets
      const expectedInScope = groupRowsTotals([groupRows[0]!], loanSettings, new Map());
      expect(report.totals.spent).toBe(expectedInScope.spent);
      expect(report.totals.spent).toBe(200_000);
    });
  });

  // Block 3: countLoans = true category routing
  describe('Block 3: countLoans category routing & starter key bypassing', () => {
    const categories: CategoryView[] = [
      {
        id: 'cat-group',
        name: 'Nhóm',
        icon: 'users',
        type: 'expense',
        hidden: false,
        sortOrder: 1,
        parentId: null,
        starterKey: 'group',
      },
      {
        id: 'cat-lend',
        name: 'Cho vay',
        icon: 'arrow-up-right',
        type: 'expense',
        hidden: false,
        sortOrder: 2,
        parentId: null,
        starterKey: 'lend',
      },
      {
        id: 'cat-borrow',
        name: 'Đi vay',
        icon: 'arrow-down-left',
        type: 'income',
        hidden: false,
        sortOrder: 3,
        parentId: null,
        starterKey: 'borrow',
      },
      {
        id: 'cat-default',
        name: 'Default Group',
        icon: 'folder',
        type: 'expense',
        hidden: false,
        sortOrder: 4,
        parentId: null,
      },
      {
        id: 'cat-explicit',
        name: 'Explicit Loan',
        icon: 'star',
        type: 'expense',
        hidden: false,
        sortOrder: 5,
        parentId: null,
      },
    ];

    const settings: GroupSettingsView = {
      defaultGroupCategoryId: 'cat-default',
      countLoans: true,
    };

    it('routes loan rows to lend/borrow categories, bypassing defaultGroupCategoryId', () => {
      // Loan where I paid: spending > 0 -> routes to cat-lend (bypassing cat-default!)
      const loanLend = createGroupRow('l1', '2026-11-10', 'expense', 200_000, 50_000, true, {
        isDirect: true,
        link: {
          walletId: null,
          categoryId: null,
          tagIds: [],
          intent: 'loan',
          excludeFromReports: false,
        },
      });

      const resLend = resolveGroupReportCategoryId(loanLend, settings, 0, categories);
      expect(resLend).toEqual({ categoryId: 'cat-lend', side: 'expense' });

      // Loan where counterpart paid: income > 0 -> routes to cat-borrow
      const loanBorrow = createGroupRow('l2', '2026-11-10', 'expense', 200_000, 50_000, false, {
        isDirect: true,
        link: {
          walletId: null,
          categoryId: null,
          tagIds: [],
          intent: 'loan',
          excludeFromReports: false,
        },
      });

      const resBorrow = resolveGroupReportCategoryId(loanBorrow, settings, 0, categories);
      expect(resBorrow).toEqual({ categoryId: 'cat-borrow', side: 'income' });
    });

    it('honors explicit categoryId on loan when matching side', () => {
      const explicitLoan = createGroupRow('l3', '2026-11-10', 'expense', 200_000, 50_000, true, {
        isDirect: true,
        link: {
          walletId: null,
          categoryId: 'cat-explicit',
          tagIds: [],
          intent: 'loan',
          excludeFromReports: false,
        },
      });

      const res = resolveGroupReportCategoryId(explicitLoan, settings, 0, categories);
      expect(res).toEqual({ categoryId: 'cat-explicit', side: 'expense' });
    });

    it('falls back to SYNTHETIC_* when categories catalog is empty', () => {
      const loan = createGroupRow('l4', '2026-11-10', 'expense', 200_000, 50_000, true, {
        isDirect: true,
        link: {
          walletId: null,
          categoryId: null,
          tagIds: [],
          intent: 'loan',
          excludeFromReports: false,
        },
      });

      const res = resolveGroupReportCategoryId(loan, settings, 0, []);
      expect(res).toEqual({ categoryId: SYNTHETIC_LEND_CATEGORY_ID, side: 'expense' });

      const normalGroup = createGroupRow('g1', '2026-11-10', 'expense', 100_000, 50_000, true);
      const resNorm = resolveGroupReportCategoryId(normalGroup, { ...settings, defaultGroupCategoryId: null }, 0, []);
      expect(resNorm).toEqual({ categoryId: SYNTHETIC_GROUP_CATEGORY_ID, side: 'expense' });
    });

    it('routes matched loan payback payments by cashflow direction even when defaultGroupCategoryId is set', () => {
      const wMain = createWallet('w-main');
      // Lent 200k then received 80k payback; borrowed 100k then paid back 40k
      const lent = createGroupRow('loan-out', '2026-11-05', 'expense', 200_000, 0, true, {
        isDirect: true,
        people: ['Minh'],
        link: {
          walletId: 'w-main',
          categoryId: null,
          tagIds: [],
          intent: 'loan',
          excludeFromReports: false,
        },
      });
      const paybackIn = createGroupRow('pay-in', '2026-11-10', 'payment', 80_000, 0, false, {
        isDirect: true,
        counterpartName: 'Minh',
      });
      const borrowed = createGroupRow('loan-in', '2026-11-06', 'expense', 100_000, 100_000, false, {
        isDirect: true,
        payerName: 'Lan',
        people: [],
        link: {
          walletId: 'w-main',
          categoryId: null,
          tagIds: [],
          intent: 'loan',
          excludeFromReports: false,
        },
      });
      const paybackOut = createGroupRow('pay-out', '2026-11-12', 'payment', 40_000, 0, true, {
        isDirect: true,
        counterpartName: 'Lan',
      });

      const rep = buildReport({
        wallets: [wMain],
        entries: [],
        categories,
        tags: [],
        groupRows: [lent, paybackIn, borrowed, paybackOut],
        groupSettings: settings,
        query: { mode: 'month', month: '2026-11', includeGroups: true },
        today: '2026-11-24',
      });

      expect(rep.spendingByCategory.map((c) => c.categoryId)).toEqual(['cat-lend']);
      expect(rep.spendingByCategory[0]?.amount).toBe(240_000);
      expect(rep.incomeByCategory.map((c) => c.categoryId)).toEqual(['cat-borrow']);
      expect(rep.incomeByCategory[0]?.amount).toBe(180_000);
    });
  });

  // Block 4: Parent->sub-category roll-up, "(chung)", and drilldown
  describe('Block 4: Category hierarchy, (chung) buckets, drilldown', () => {
    const catFood: CategoryView = {
      id: 'food',
      name: 'Ăn uống',
      icon: 'utensils',
      type: 'expense',
      parentId: null,
      hidden: false,
      sortOrder: 1,
    };
    const catRestaurant: CategoryView = {
      id: 'restaurant',
      name: 'Nhà hàng',
      icon: 'burger',
      type: 'expense',
      parentId: 'food',
      hidden: false,
      sortOrder: 2,
    };
    const catCoffee: CategoryView = {
      id: 'coffee',
      name: 'Cà phê',
      icon: 'coffee',
      type: 'expense',
      parentId: 'food',
      hidden: false,
      sortOrder: 3,
    };
    const catStudy: CategoryView = {
      id: 'study',
      name: 'Học tập',
      icon: 'book',
      type: 'expense',
      parentId: null,
      hidden: false,
      sortOrder: 4,
    };

    const categories = [catFood, catRestaurant, catCoffee, catStudy];
    const w = createWallet('w1');

    it('aggregates direct parent amount as "<Parent> (chung)" and rolls up children', () => {
      const entries = [
        createEntry('e1', 'w1', 'expense', 100_000, '2026-11-10', 'food'), // Direct on parent
        createEntry('e2', 'w1', 'expense', 200_000, '2026-11-11', 'restaurant'), // Subcategory 1
        createEntry('e3', 'w1', 'expense', 100_000, '2026-11-12', 'coffee'), // Subcategory 2
        createEntry('e4', 'w1', 'expense', 50_000, '2026-11-13', null), // Uncategorized
      ];

      const report = buildReport({
        wallets: [w],
        entries,
        categories,
        tags: [],
        groupRows: [],
        groupSettings: defaultSettings,
        query: { mode: 'month', month: '2026-11', includeGroups: true },
        today: '2026-11-24',
      });

      expect(report.spendingByCategory).toHaveLength(2);

      const foodItem = report.spendingByCategory.find((c) => c.categoryId === 'food');
      expect(foodItem).toBeDefined();
      expect(foodItem?.amount).toBe(400_000);
      expect(foodItem?.subCategories).toHaveLength(3);

      expect(foodItem?.subCategories[0]).toEqual({
        categoryId: 'restaurant',
        name: 'Nhà hàng',
        icon: 'burger',
        amount: 200_000,
        percent: 50,
        isGeneralParentBucket: false,
      });

      const chungBucket = foodItem?.subCategories.find((s) => s.isGeneralParentBucket);
      expect(chungBucket).toEqual({
        categoryId: 'food',
        name: 'Ăn uống (chung)',
        icon: 'utensils',
        amount: 100_000,
        percent: 25,
        isGeneralParentBucket: true,
      });

      const uncatItem = report.spendingByCategory.find(
        (c) => c.categoryId === UNCATEGORIZED_CATEGORY_ID,
      );
      expect(uncatItem).toBeDefined();
      expect(uncatItem?.amount).toBe(50_000);
      expect(uncatItem?.name).toBe('Chưa phân loại');
    });

    it('builds category drilldown with accurate deltas and zero-spent known category', () => {
      const entries = [
        createEntry('e1', 'w1', 'expense', 100_000, '2026-11-10', 'food'),
        createEntry('e0', 'w1', 'expense', 80_000, '2026-10-10', 'food'), // Previous month
      ];

      const input = {
        wallets: [w],
        entries,
        categories,
        tags: [],
        groupRows: [],
        groupSettings: defaultSettings,
        query: { mode: 'month' as const, month: '2026-11', includeGroups: true },
        today: '2026-11-24',
      };

      const report = buildReport(input);

      // Drilldown on active category
      const ddFood = buildCategoryDrilldown(report, { ...input, categoryId: 'food' });
      expect(ddFood).not.toBeNull();
      expect(ddFood?.total).toBe(100_000);
      expect(ddFood?.previousTotal).toBe(80_000);
      expect(ddFood?.diffFromPrevious).toBe(20_000);
      expect(ddFood?.pctFromPrevious).toBe(25);
      expect(ddFood?.rows).toHaveLength(1);

      // Drilldown on known category with zero spending in active month
      const ddStudy = buildCategoryDrilldown(report, { ...input, categoryId: 'study' });
      expect(ddStudy).not.toBeNull();
      expect(ddStudy?.total).toBe(0);
      expect(ddStudy?.previousTotal).toBe(0);
      expect(ddStudy?.rows).toEqual([]);

      // Drilldown on unknown category
      const ddUnknown = buildCategoryDrilldown(report, { ...input, categoryId: 'non-existent' });
      expect(ddUnknown).toBeNull();
    });

    it('routes unknown or deleted categoryId consistently into __uncategorized__ across buildReport and buildCategoryDrilldown', () => {
      const entries = [
        createEntry('e1', 'w1', 'expense', 75_000, '2026-11-10', 'deleted-cat-id'),
        createEntry('e0', 'w1', 'expense', 25_000, '2026-10-10', 'deleted-cat-id'),
      ];
      const input = {
        wallets: [w],
        entries,
        categories,
        tags: [],
        groupRows: [],
        groupSettings: defaultSettings,
        query: { mode: 'month' as const, month: '2026-11', includeGroups: true },
        today: '2026-11-24',
      };
      const report = buildReport(input);
      expect(report.spendingByCategory.map((c) => c.categoryId)).toEqual([UNCATEGORIZED_CATEGORY_ID]);
      expect(report.spendingByCategory[0]?.amount).toBe(75_000);

      const ddUncat = buildCategoryDrilldown(report, {
        ...input,
        categoryId: UNCATEGORIZED_CATEGORY_ID,
      });
      expect(ddUncat).not.toBeNull();
      expect(ddUncat?.total).toBe(75_000);
      expect(ddUncat?.previousTotal).toBe(25_000);
      expect(ddUncat?.diffFromPrevious).toBe(50_000);
      expect(ddUncat?.rows).toHaveLength(1);
      expect(ddUncat?.rows[0]).toMatchObject({ kind: 'entry', entryId: 'e1', categoryId: UNCATEGORIZED_CATEGORY_ID });
    });
  });

  // Block 5: Multi-currency, Unrated Wallets, Single Wallet Scope
  describe('Block 5: Multi-currency, unrated wallets, single-wallet scope', () => {
    it('handles converted totals, approximate flag, and idle vs active unrated wallets', () => {
      const wVnd = createWallet('w-vnd', 'VND');
      const wUsd = createWallet('w-usd', 'USD', { startAmount: 1000, startCostVnd: 25_000_000 });
      const wUsdt = createWallet('w-usdt', 'USDT', { startAmount: 0, startCostVnd: null }); // Unrated
      const wIdle = createWallet('w-idle', 'USDT', { startAmount: 0, startCostVnd: null }); // Idle unrated

      const wallets = [wVnd, wUsd, wUsdt, wIdle];

      const entries = [
        createEntry('e1', 'w-vnd', 'expense', 100_000, '2026-11-10'),
        createEntry('e2', 'w-usd', 'expense', 400, '2026-11-11'), // Rated non-VND
        createEntry('e3', 'w-usdt', 'expense', 100, '2026-11-12'), // Active unrated
      ];

      const report = buildReport({
        wallets,
        entries,
        categories: [],
        tags: [],
        groupRows: [],
        groupSettings: defaultSettings,
        query: { mode: 'month', month: '2026-11', includeGroups: false },
        today: '2026-11-24',
      });

      expect(report.approximate).toBe(true);
      expect(report.totals.spent).toBeGreaterThan(100_000); // Includes rated USD in VND

      // Only w-usdt is active unrated; w-idle had 0 transactions and must NOT appear
      expect(report.unratedWallets).toHaveLength(1);
      expect(report.unratedWallets[0]?.walletId).toBe('w-usdt');
      expect(report.unratedWallets[0]?.spent).toBe(100);
      expect(report.hasAnyUnratedOnly).toBe(false);
    });

    it('sets hasAnyUnratedOnly = true when period contains only unrated transactions', () => {
      const wUsdt = createWallet('w-usdt', 'USDT', { startAmount: 0, startCostVnd: null });
      const entries = [createEntry('e1', 'w-usdt', 'expense', 50, '2026-11-10')];

      const report = buildReport({
        wallets: [wUsdt],
        entries,
        categories: [],
        tags: [],
        groupRows: [],
        groupSettings: defaultSettings,
        query: { mode: 'month', month: '2026-11', includeGroups: false },
        today: '2026-11-24',
      });

      expect(report.countedCount).toBe(1);
      expect(report.totals.spent).toBe(0);
      expect(report.unratedWallets).toHaveLength(1);
      expect(report.hasAnyUnratedOnly).toBe(true);
    });

    it('handles single-wallet scope in native currency with walletBalanceSeries', () => {
      const wUsdt = createWallet('w-usdt', 'USDT', {
        startAmount: 500,
        startCostVnd: null,
        excludeFromReports: true,
      });
      const entries = [createEntry('e1', 'w-usdt', 'expense', 50, '2026-11-10')];

      const report = buildReport({
        wallets: [wUsdt],
        entries,
        categories: [],
        tags: [],
        groupRows: [],
        groupSettings: defaultSettings,
        query: { mode: 'month', month: '2026-11', walletId: 'w-usdt', includeGroups: false },
        today: '2026-11-24',
      });

      expect(report.currency).toBe('USDT');
      expect(report.approximate).toBe(false);
      expect(report.totals.spent).toBe(50);
      expect(report.unratedWallets).toEqual([]);
      expect(report.singleWallet).toEqual({
        walletId: 'w-usdt',
        name: 'Wallet w-usdt',
        currency: 'USDT',
        excludedFromTotal: true,
      });
      expect(report.walletBalance).not.toBeNull();
      expect(report.walletBalance?.currency).toBe('USDT');
      expect(report.walletBalance?.closing).toBe(450);
    });

    it('unrated entry items in countedRows have kind === "entry" and "groupRowId" in r === false', () => {
      const wUsdt = createWallet('w-usdt', 'USDT', { startAmount: 0, startCostVnd: null });
      const entries = [createEntry('e-unrated', 'w-usdt', 'expense', 100, '2026-11-10')];

      const report = buildReport({
        wallets: [wUsdt],
        entries,
        categories: [],
        tags: [],
        groupRows: [],
        groupSettings: defaultSettings,
        query: { mode: 'month', month: '2026-11', includeGroups: false },
        today: '2026-11-24',
      });

      expect(report.countedRows).toHaveLength(1);
      const row = report.countedRows[0]!;
      expect(row.kind).toBe('entry');
      expect('groupRowId' in row).toBe(false);
      if (row.kind === 'entry') {
        expect(row.entryId).toBe('e-unrated');
        expect(row.vndAmount).toBeNull();
        expect(row.nativeAmount).toBe(100);
      }
    });
  });

  // Block 6: Tags & Accent-folded filtering
  describe('Block 6: Tags aggregation & accent-folded filtering', () => {
    it('aggregates tags, sorts descending, flags multi-tag overlap, and filters tags', () => {
      const tags: TagView[] = [
        { id: 't-food', name: 'Ăn uống', useCount: 10 },
        { id: 't-coffee', name: 'Cà phê', useCount: 5 },
        { id: 't-salary', name: 'Lương', useCount: 1 },
      ];

      const w = createWallet('w1');
      const entries = [
        createEntry('e1', 'w1', 'expense', 100_000, '2026-11-10', null, ['t-food', 't-coffee']), // Multiple tags
        createEntry('e2', 'w1', 'expense', 150_000, '2026-11-11', null, ['t-food']),
        createEntry('e3', 'w1', 'income', 10_000_000, '2026-11-12', null, ['t-salary']),
      ];

      const report = buildReport({
        wallets: [w],
        entries,
        categories: [],
        tags,
        groupRows: [],
        groupSettings: defaultSettings,
        query: { mode: 'month', month: '2026-11', includeGroups: false },
        today: '2026-11-24',
      });

      expect(report.tags.hasMultiTagOverlap).toBe(true);

      expect(report.tags.expense).toHaveLength(2);
      expect(report.tags.expense[0]).toEqual({
        tagId: 't-food',
        name: 'Ăn uống',
        amount: 250_000,
        percent: 100,
        entryCount: 2,
      });
      expect(report.tags.expense[1]).toEqual({
        tagId: 't-coffee',
        name: 'Cà phê',
        amount: 100_000,
        percent: 40,
        entryCount: 1,
      });

      expect(report.tags.income).toHaveLength(1);
      expect(report.tags.income[0]?.tagId).toBe('t-salary');

      // Test accent-folded filterReportTags
      const allTags: ReportTagItem[] = [...report.tags.expense, ...report.tags.income];

      expect(filterReportTags(allTags, 'an')).toEqual([
        expect.objectContaining({ name: 'Ăn uống' }),
      ]);
      expect(filterReportTags(allTags, 'ĂN')).toEqual([
        expect.objectContaining({ name: 'Ăn uống' }),
      ]);
      expect(filterReportTags(allTags, 'ca phe')).toEqual([
        expect.objectContaining({ name: 'Cà phê' }),
      ]);
      expect(filterReportTags(allTags, 'luong')).toEqual([
        expect.objectContaining({ name: 'Lương' }),
      ]);
      expect(filterReportTags(allTags, 'not-found')).toEqual([]);
      expect(filterReportTags(allTags, '  ')).toEqual(allTags);
    });
  });
});
