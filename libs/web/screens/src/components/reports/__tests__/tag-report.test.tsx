import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { setLang } from '@cc/web-i18n';
import type { ReportData, ReportPeriodWindow, ReportQuery } from '@cc/core';
import { renderAt, mockApi } from '../../../test/render';
import { App } from '../../../App';
import { TagBarsCard } from '../TagBarsCard';
import {
  buildReportSearch,
  buildTagReportUrl,
  parseReportQueryFromSearch,
} from '../reportUrl';

vi.mock('@cc/web-util/localDate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cc/web-util/localDate')>();
  return {
    ...actual,
    todayLocal: () => '2026-11-28',
    currentMonthLocal: () => '2026-11',
  };
});

class FakeResizeObserver {
  private cb: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb;
  }
  observe(target: Element) {
    this.cb(
      [
        {
          target,
          contentRect: {
            width: 400,
            height: 300,
            top: 0,
            left: 0,
            bottom: 300,
            right: 400,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          },
        } as unknown as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver,
    );
  }
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  localStorage.clear();
  setLang('vi', false);
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  setLang('vi', false);
});

const meOn = {
  user: { id: 'u-me', email: 'me@example.com', name: 'Me', consentAt: '2026-10-12T00:00:00.000Z' },
  signIn: { zalo: true },
  mergeRequests: { incoming: [], outgoing: [] },
  personalArea: true,
};

function makeEmptyReport(overrides?: Partial<ReportData>): ReportData {
  return {
    period: {
      mode: 'custom',
      from: '2026-09-01',
      to: '2026-11-28',
      effectiveTo: '2026-11-28',
      inProgress: true,
      granularity: 'day',
      previous: { from: '2026-06-03', to: '2026-08-31', effectiveTo: '2026-08-31' },
      baselines: [],
    },
    currency: 'VND',
    approximate: false,
    singleWallet: null,
    totals: { spent: 300_000, income: 0, net: -300_000 },
    perCurrency: [{ currency: 'VND', spent: 300_000, income: 0 }],
    previousDelta: {
      previousSpent: 0,
      previousIncome: 0,
      spentDiff: 300_000,
      incomeDiff: 0,
      spentPct: null,
      incomePct: null,
    },
    baseline3m: null,
    unratedWallets: [],
    countedCount: 1,
    hasAnyUnratedOnly: false,
    healthSeries: [],
    spendingByCategory: [
      {
        categoryId: 'cat-food',
        name: 'Ăn uống',
        icon: 'utensils',
        type: 'expense',
        amount: 300_000,
        percent: 100,
        subCategories: [],
      },
    ],
    incomeByCategory: [],
    tags: {
      expense: [{ tagId: 't-house', name: 'Mua nhà', amount: 300_000, percent: 100, entryCount: 1 }],
      income: [],
      hasMultiTagOverlap: false,
    },
    walletBalance: null,
    countedRows: [],
    ...overrides,
  };
}

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc-search">{loc.search}</div>;
}

describe('tag report URL and UI', () => {
  it('round-trips tagId in parseReportQueryFromSearch, buildReportSearch and buildTagReportUrl', () => {
    const url = buildTagReportUrl('t-house', '2026-03-15', '2026-11-28');
    expect(url).toBe('/reports?mode=custom&from=2026-03-15&to=2026-11-28&tagId=t-house');

    const parsed = parseReportQueryFromSearch(url.replace('/reports', ''), '2026-11-28');
    expect(parsed).toEqual({
      mode: 'custom',
      from: '2026-03-15',
      to: '2026-11-28',
      includeGroups: true,
      tagId: 't-house',
    });

    expect(buildReportSearch(parsed)).toBe('?mode=custom&from=2026-03-15&to=2026-11-28&tagId=t-house');
  });

  it('chip shows and clears the filter', async () => {
    const user = userEvent.setup();
    const reportQueries: string[] = [];

    mockApi({
      'GET /api/me': meOn,
      'GET /api/me/personal/wallets': { wallets: [] },
      'GET /api/me/personal/tags': {
        tags: [{ id: 't-house', name: 'Mua nhà', useCount: 1 }],
      },
      'GET /api/me/personal/report': (_init: unknown, url: string) => {
        reportQueries.push(url);
        return makeEmptyReport();
      },
    });

    renderAt(
      <>
        <App />
        <LocationProbe />
      </>,
      { route: '/reports?mode=custom&from=2026-09-01&to=2026-11-28&tagId=t-house' },
    );

    await waitFor(() => {
      expect(screen.getByTestId('reports-tag-filter-pill')).toHaveTextContent('#Mua nhà');
    });

    // Report request carries tagId
    expect(reportQueries.some((u) => u.includes('tagId=t-house'))).toBe(true);

    const clearBtn = screen.getByRole('button', { name: /Bỏ lọc tag|Clear tag filter/ });
    await user.click(clearBtn);

    await waitFor(() => {
      expect(screen.queryByTestId('reports-tag-filter-pill')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('loc-search').textContent).not.toContain('tagId=');
  });

  it('tag row button opens the custom range from firstDate', () => {
    const period: ReportPeriodWindow = {
      mode: 'month',
      from: '2026-11-01',
      to: '2026-11-30',
      effectiveTo: '2026-11-28',
      inProgress: true,
      granularity: 'day',
      previous: { from: '2026-10-01', to: '2026-10-31', effectiveTo: '2026-10-28' },
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
              { tagId: 't-house', name: 'Mua nhà', amount: 500_000, percent: 80, entryCount: 3 },
              { tagId: 't-food', name: 'Ăn uống', amount: 125_000, percent: 20, entryCount: 1 },
            ],
            income: [],
            hasMultiTagOverlap: false,
          }}
          period={period}
          query={query}
          currency="VND"
          approximate={false}
          firstDates={{ 't-house': '2026-03-15' }}
        />
      </MemoryRouter>,
    );

    // Existing row link to /transactions is preserved
    const txLink = screen.getByText('#Mua nhà').closest('a');
    expect(txLink).toHaveAttribute(
      'href',
      '/transactions?tagId=t-house&from=2026-11-01&to=2026-11-28',
    );

    // New icon button links to custom-range tag report from firstDate (or period.from fallback) to today
    const reportLinks = screen.getAllByTestId('tag-report-link');
    expect(reportLinks).toHaveLength(2);
    expect(reportLinks[0]).toHaveAttribute('aria-label', expect.stringMatching(/Xem báo cáo cho|View report for/));
    expect(reportLinks[0]).toHaveAttribute(
      'href',
      '/reports?mode=custom&from=2026-03-15&to=2026-11-28&tagId=t-house',
    );
    expect(reportLinks[1]).toHaveAttribute(
      'href',
      '/reports?mode=custom&from=2026-11-01&to=2026-11-28&tagId=t-food',
    );
  });

  it('unknown tag id shows the chip without a skeleton after tags load', async () => {
    mockApi({
      'GET /api/me': meOn,
      'GET /api/me/personal/wallets': { wallets: [] },
      'GET /api/me/personal/tags': {
        tags: [{ id: 't-house', name: 'Mua nhà', useCount: 1 }],
      },
      'GET /api/me/personal/report': () =>
        makeEmptyReport({
          countedCount: 0,
          tags: { expense: [], income: [], hasMultiTagOverlap: false },
        }),
    });

    renderAt(<App />, {
      route: '/reports?mode=custom&from=2026-09-01&to=2026-11-28&tagId=t-missing',
    });

    const pill = await screen.findByTestId('reports-tag-filter-pill');
    await waitFor(() => {
      expect(pill).toHaveTextContent('#?');
    });
    expect(pill.querySelector('.fsl-skeleton')).toBeNull();
    expect(pill.textContent).not.toContain('t-missing');
  });
});
