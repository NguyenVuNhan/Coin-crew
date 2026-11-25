import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReportData } from '@cc/core';
import { setLang, t } from '@cc/web-i18n';
import {
  ReportSummaryCard,
  buildSpendComparison,
} from '../ReportSummaryCard';

function makeReport(overrides: Partial<ReportData> = {}): ReportData {
  return {
    period: {
      mode: 'month',
      from: '2026-11-01',
      to: '2026-11-30',
      effectiveTo: '2026-11-25',
      inProgress: false,
      granularity: 'day',
      previous: {
        from: '2026-10-01',
        to: '2026-10-31',
        effectiveTo: '2026-10-31',
      },
      baselines: [],
    },
    currency: 'VND',
    approximate: false,
    singleWallet: null,
    totals: {
      spent: 1200000,
      income: 3500000,
      net: 2300000,
    },
    perCurrency: [{ currency: 'VND', spent: 1200000, income: 3500000 }],
    previousDelta: {
      previousSpent: 1000000,
      previousIncome: 3000000,
      spentDiff: 200000,
      incomeDiff: 500000,
      spentPct: 20,
      incomePct: 17,
    },
    baseline3m: null,
    unratedWallets: [],
    countedCount: 3,
    hasAnyUnratedOnly: false,
    healthSeries: [],
    spendingByCategory: [],
    incomeByCategory: [],
    tags: { expense: [], income: [], hasMultiTagOverlap: false },
    walletBalance: null,
    countedRows: [],
    ...overrides,
  };
}

describe('buildSpendComparison', () => {
  beforeEach(() => {
    setLang('en', false);
  });

  it('formats positive spentPct (+20%) for finished month and in-progress month', () => {
    const finished = makeReport({
      previousDelta: {
        previousSpent: 1000000,
        previousIncome: 3000000,
        spentDiff: 200000,
        incomeDiff: 500000,
        spentPct: 20,
        incomePct: 17,
      },
    });
    expect(buildSpendComparison(finished, t)).toBe(
      'Spent 20% more than 10/2026',
    );

    const inProgress = makeReport({
      period: { ...finished.period, inProgress: true },
      previousDelta: finished.previousDelta,
    });
    expect(buildSpendComparison(inProgress, t)).toBe(
      'Spent 20% more than last month at this point',
    );
  });

  it('formats negative spentPct (-15%)', () => {
    const report = makeReport({
      previousDelta: {
        previousSpent: 1000000,
        previousIncome: 3000000,
        spentDiff: -150000,
        incomeDiff: 0,
        spentPct: -15,
        incomePct: 0,
      },
    });
    expect(buildSpendComparison(report, t)).toBe(
      'Spent 15% less than 10/2026',
    );
  });

  it('formats zero spentPct (0%)', () => {
    const report = makeReport({
      previousDelta: {
        previousSpent: 1000000,
        previousIncome: 3000000,
        spentDiff: 0,
        incomeDiff: 0,
        spentPct: 0,
        incomePct: 0,
      },
    });
    expect(buildSpendComparison(report, t)).toBe(
      'Spent the same as 10/2026',
    );
  });

  it('returns noBaselineYet when spentPct is null and there is no history', () => {
    const report = makeReport({
      previousDelta: {
        previousSpent: 0,
        previousIncome: 0,
        spentDiff: 1200000,
        incomeDiff: 0,
        spentPct: null,
        incomePct: null,
      },
      baseline3m: null,
    });
    expect(buildSpendComparison(report, t)).toBe(
      'Not enough prior data to compare',
    );
  });

  it('formats null spentPct with previousSpent 0 but income history', () => {
    const finishedMonth = makeReport({
      previousDelta: {
        previousSpent: 0,
        previousIncome: 2500000,
        spentDiff: 1200000,
        incomeDiff: 1000000,
        spentPct: null,
        incomePct: 40,
      },
      baseline3m: null,
    });
    expect(buildSpendComparison(finishedMonth, t)).toBe(
      'Nothing was spent in 10/2026',
    );

    const inProgressWeek = makeReport({
      period: {
        mode: 'week',
        from: '2026-11-23',
        to: '2026-11-29',
        effectiveTo: '2026-11-25',
        inProgress: true,
        granularity: 'day',
        previous: {
          from: '2026-11-16',
          to: '2026-11-22',
          effectiveTo: '2026-11-18',
        },
        baselines: [],
      },
      previousDelta: finishedMonth.previousDelta,
      baseline3m: null,
    });
    expect(buildSpendComparison(inProgressWeek, t)).toBe(
      'Nothing was spent at the same point last period',
    );
  });

  it('formats in-progress vs finished target wording across week, year, and vi', () => {
    const finishedYear = makeReport({
      period: {
        mode: 'year',
        from: '2026-01-01',
        to: '2026-12-31',
        effectiveTo: '2026-12-31',
        inProgress: false,
        granularity: 'month',
        previous: {
          from: '2025-01-01',
          to: '2025-12-31',
          effectiveTo: '2025-12-31',
        },
        baselines: [],
      },
    });
    expect(buildSpendComparison(finishedYear, t)).toBe(
      'Spent 20% more than 2025',
    );

    const finishedWeek = makeReport({
      period: {
        mode: 'week',
        from: '2026-10-12',
        to: '2026-10-18',
        effectiveTo: '2026-10-18',
        inProgress: false,
        granularity: 'day',
        previous: {
          from: '2026-10-05',
          to: '2026-10-11',
          effectiveTo: '2026-10-11',
        },
        baselines: [],
      },
    });
    expect(buildSpendComparison(finishedWeek, t)).toBe(
      'Spent 20% more than 05/10–11/10',
    );

    const inProgressWeek = makeReport({
      period: { ...finishedWeek.period, inProgress: true },
    });
    expect(buildSpendComparison(inProgressWeek, t)).toBe(
      'Spent 20% more than last week at this point',
    );

    setLang('vi', false);
    expect(buildSpendComparison(finishedYear, t)).toBe(
      'Chi nhiều hơn 20% so với năm 2025',
    );
    expect(buildSpendComparison(inProgressWeek, t)).toBe(
      'Chi nhiều hơn 20% so với cùng thời điểm tuần trước',
    );
  });
});

describe('ReportSummaryCard', () => {
  beforeEach(() => {
    setLang('en', false);
  });

  it('renders net colour class for > 0, < 0, and = 0', () => {
    const { rerender } = render(
      <ReportSummaryCard
        report={makeReport({
          totals: { spent: 1000000, income: 3000000, net: 2000000 },
        })}
      />,
    );

    const card = screen.getByTestId('reports-summary');
    expect(card).toHaveClass('fsl-report-summary');
    expect(screen.getByText('+2.000.000₫')).toHaveClass('text-success');

    rerender(
      <ReportSummaryCard
        report={makeReport({
          totals: { spent: 3000000, income: 1000000, net: -2000000 },
        })}
      />,
    );
    expect(screen.getByText('-2.000.000₫')).toHaveClass('text-danger');

    rerender(
      <ReportSummaryCard
        report={makeReport({
          totals: { spent: 1000000, income: 1000000, net: 0 },
        })}
      />,
    );
    const zeroNet = screen.getByText('0₫');
    expect(zeroNet).toHaveClass('text-foreground');
    expect(zeroNet).not.toHaveClass('text-success');
    expect(zeroNet).not.toHaveClass('text-danger');
  });

  it('renders ≈ prefix and usual 3-period baseline when present', () => {
    render(
      <ReportSummaryCard
        report={makeReport({
          approximate: true,
          totals: { spent: 1200000, income: 3500000, net: 2300000 },
          baseline3m: {
            previousSpent: 1000000,
            previousIncome: 3000000,
            spentDiff: 200000,
            incomeDiff: 500000,
            spentPct: 20,
            incomePct: 17,
            historyCount: 3,
          },
        })}
      />,
    );

    expect(screen.getByText('≈ 1.200.000₫')).toHaveClass('text-danger');
    expect(screen.getByText('≈ 3.500.000₫')).toHaveClass('text-success');
    expect(screen.getByText('+≈ 2.300.000₫')).toHaveClass('text-success');
    expect(
      screen.getByText('Usual (3 periods before): ≈ 1.000.000₫'),
    ).toBeInTheDocument();
  });
});
