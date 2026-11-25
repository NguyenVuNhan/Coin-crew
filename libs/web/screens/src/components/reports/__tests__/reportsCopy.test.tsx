import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { setLang } from '@cc/web-i18n';
import type { ReportPeriodWindow, ReportQuery } from '@cc/core';
import { compactReportAmount } from '../reportUrl';
import { TagBarsCard } from '../TagBarsCard';

afterEach(() => {
  setLang('vi', false);
});

describe('compactReportAmount', () => {
  it('formats Vietnamese compact amounts with comma decimals and Vietnamese units', () => {
    setLang('vi', false);
    expect(compactReportAmount(1_500_000)).toBe('1,5tr');
    expect(compactReportAmount(2_000_000)).toBe('2tr');
    expect(compactReportAmount(1_200_000_000)).toBe('1,2 tỷ');
    expect(compactReportAmount(250_000)).toBe('250k');
    expect(compactReportAmount(999)).toBe('999');
    expect(compactReportAmount(-1_500_000)).toBe('-1,5tr');
    expect(compactReportAmount(0)).toBe('0');
  });

  it('formats English compact amounts with dot decimals and M/B/k units', () => {
    setLang('en', false);
    expect(compactReportAmount(1_500_000)).toBe('1.5M');
    expect(compactReportAmount(2_000_000)).toBe('2M');
    expect(compactReportAmount(1_200_000_000)).toBe('1.2B');
    expect(compactReportAmount(250_000)).toBe('250k');
    expect(compactReportAmount(999)).toBe('999');
    expect(compactReportAmount(-1_500_000)).toBe('-1.5M');
    expect(compactReportAmount(0)).toBe('0');
  });
});

describe('TagBarsCard entry count copy', () => {
  it('renders "{n} giao dịch" alongside percent in muted meta text', () => {
    setLang('vi', false);
    const period: ReportPeriodWindow = {
      mode: 'month',
      from: '2026-11-01',
      to: '2026-11-30',
      effectiveTo: '2026-11-25',
      inProgress: true,
      granularity: 'day',
      previous: { from: '2026-10-01', to: '2026-10-31', effectiveTo: '2026-10-25' },
      baselines: [],
    };
    const query: ReportQuery = {
      mode: 'month',
      month: '2026-11',
      includeGroups: true,
    };

    render(
      <MemoryRouter>
        <TagBarsCard
          tags={{
            expense: [
              { tagId: 't1', name: 'Ăn uống', amount: 340_000, percent: 34, entryCount: 12 },
            ],
            income: [],
            hasMultiTagOverlap: false,
          }}
          period={period}
          query={query}
          currency="VND"
          approximate={false}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText(/12 giao dịch · 34%/)).toBeInTheDocument();
  });
});
