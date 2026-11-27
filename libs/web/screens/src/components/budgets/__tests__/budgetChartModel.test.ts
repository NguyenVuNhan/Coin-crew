import { describe, it, expect } from 'vitest';
import type { BudgetDef, CountedSpendRow } from '@cc/core';
import { t as translate, setLang } from '@cc/web-i18n';
import {
  buildBudgetChartModel,
  type BudgetHistoryEntry,
} from '../budgetChartModel';
import { formatBudgetPeriodLabel } from '../budgetLabels';

const monthlyDef: BudgetDef = {
  id: 'b-month',
  name: 'Ăn uống',
  target: { kind: 'category', categoryId: 'cat-food' },
  currency: 'VND',
  periodKind: 'month',
  monthStartDay: 1,
  from: null,
  to: null,
  excludedWalletIds: [],
  limits: [
    { effectiveFrom: '2026-04-01', amount: 2_500_000 },
    { effectiveFrom: '2026-09-01', amount: 3_000_000 },
  ],
  suggestionDismissedUntil: null,
  createdOn: '2026-04-01',
};

const yearlyDef: BudgetDef = {
  id: 'b-year',
  name: 'Du lịch',
  target: { kind: 'category', categoryId: 'cat-travel' },
  currency: 'VND',
  periodKind: 'year',
  monthStartDay: null,
  from: null,
  to: null,
  excludedWalletIds: [],
  limits: [{ effectiveFrom: '2024-01-01', amount: 30_000_000 }],
  suggestionDismissedUntil: null,
  createdOn: '2024-01-01',
};

const multiYearOnceDef: BudgetDef = {
  id: 'b-once',
  name: 'Sửa nhà',
  target: { kind: 'category', categoryId: 'cat-home' },
  currency: 'VND',
  periodKind: 'once',
  monthStartDay: null,
  from: '2025-01-01',
  to: '2027-12-31',
  excludedWalletIds: [],
  limits: [{ effectiveFrom: '2025-01-01', amount: 200_000_000 }],
  suggestionDismissedUntil: null,
  createdOn: '2025-01-01',
};

describe('buildBudgetChartModel', () => {
  it('caps standard periods at 6 in chronological order with per-period limits', () => {
    setLang('vi', false);
    const allPeriods: BudgetHistoryEntry[] = [
      { period: { from: '2026-11-01', to: '2026-11-30' }, limit: 3_000_000, spent: 2_130_000 },
      { period: { from: '2026-10-01', to: '2026-10-31' }, limit: 3_000_000, spent: 3_240_000 },
      { period: { from: '2026-09-01', to: '2026-09-30' }, limit: 3_000_000, spent: 2_890_000 },
      { period: { from: '2026-08-01', to: '2026-08-31' }, limit: 2_500_000, spent: 2_050_000 },
      { period: { from: '2026-07-01', to: '2026-07-31' }, limit: 2_500_000, spent: 2_780_000 },
      { period: { from: '2026-06-01', to: '2026-06-30' }, limit: 2_500_000, spent: 2_310_000 },
      { period: { from: '2026-05-01', to: '2026-05-31' }, limit: 2_500_000, spent: 2_100_000 },
    ];

    const model = buildBudgetChartModel({
      def: monthlyDef,
      shownItem: allPeriods[0]!,
      allPeriods,
      countedRows: [],
      today: '2026-11-26',
      lang: 'vi',
      t: translate,
    });

    expect(model.heading).toBe('6 kỳ gần đây');
    expect(model.showCaption).toBe(true);
    expect(model.bars).toHaveLength(6);
    expect(model.bars.map((b) => b.label)).toEqual(['T6', 'T7', 'T8', 'T9', 'T10', 'T11']);
    expect(model.bars[0]?.limit).toBe(2_500_000);
    expect(model.bars[5]?.limit).toBe(3_000_000);
    expect(model.bars[5]?.isCurrent).toBe(true);
    expect(model.bars[4]?.isCurrent).toBe(false);
  });

  it('builds per-year bars with limits for yearly budgets (> 92 days)', () => {
    setLang('vi', false);
    const allPeriods: BudgetHistoryEntry[] = [
      { period: { from: '2026-01-01', to: '2026-12-31' }, limit: 30_000_000, spent: 18_000_000 },
      { period: { from: '2025-01-01', to: '2025-12-31' }, limit: 25_000_000, spent: 27_000_000 },
    ];

    const model = buildBudgetChartModel({
      def: yearlyDef,
      shownItem: allPeriods[0]!,
      allPeriods,
      countedRows: [],
      today: '2026-11-26',
      lang: 'vi',
      t: translate,
    });

    expect(model.heading).toBe('Theo năm');
    expect(model.showCaption).toBe(true);
    expect(model.bars.map((b) => [b.label, b.spent, b.limit])).toEqual([
      ['2025', 27_000_000, 25_000_000],
      ['2026', 18_000_000, 30_000_000],
    ]);
  });

  it('aggregates counted rows per year for multi-year once budgets without limit lines', () => {
    setLang('vi', false);
    const shownItem: BudgetHistoryEntry = {
      period: { from: '2025-01-01', to: '2027-12-31' },
      limit: 200_000_000,
      spent: 82_000_000,
    };
    const countedRows: CountedSpendRow[] = [
      { id: 'r1', kind: 'entry', date: '2025-06-10', amount: 40_000_000, currency: 'VND', walletId: 'w1', categoryId: 'cat-home', tagIds: [] },
      { id: 'r2', kind: 'entry', date: '2026-03-10', amount: 22_000_000, currency: 'VND', walletId: 'w1', categoryId: 'cat-home', tagIds: [] },
      { id: 'r3', kind: 'entry', date: '2026-08-10', amount: 20_000_000, currency: 'VND', walletId: 'w1', categoryId: 'cat-home', tagIds: [] },
    ];

    const model = buildBudgetChartModel({
      def: multiYearOnceDef,
      shownItem,
      allPeriods: [shownItem],
      countedRows,
      today: '2026-11-26',
      lang: 'vi',
      t: translate,
    });

    expect(model.heading).toBe('Theo năm');
    expect(model.showCaption).toBe(false);
    expect(model.bars.map((b) => [b.label, b.spent, b.limit, b.isCurrent])).toEqual([
      ['2025', 40_000_000, undefined, false],
      ['2026', 42_000_000, undefined, true],
      ['2027', 0, undefined, false],
    ]);
  });
});

describe('formatBudgetPeriodLabel', () => {
  it('formats full, short, and row styles consistently for month and year periods', () => {
    const nov = { from: '2026-11-01', to: '2026-11-30' };
    expect(formatBudgetPeriodLabel(monthlyDef, nov, 'vi', 'full')).toBe(
      'Tháng 11/2026 · 1/11 – 30/11',
    );
    expect(formatBudgetPeriodLabel(monthlyDef, nov, 'vi', 'short')).toBe('T11');
    expect(formatBudgetPeriodLabel(monthlyDef, nov, 'vi', 'row')).toBe('Tháng 11');
    expect(formatBudgetPeriodLabel(monthlyDef, nov, 'en', 'short')).toBe('M11');

    const y2026 = { from: '2026-01-01', to: '2026-12-31' };
    expect(formatBudgetPeriodLabel(yearlyDef, y2026, 'vi', 'full')).toBe(
      'Năm 2026 · 1/1 – 31/12',
    );
    expect(formatBudgetPeriodLabel(yearlyDef, y2026, 'vi', 'short')).toBe('2026');
    expect(formatBudgetPeriodLabel(yearlyDef, y2026, 'vi', 'row')).toBe('Năm 2026');
  });
});
