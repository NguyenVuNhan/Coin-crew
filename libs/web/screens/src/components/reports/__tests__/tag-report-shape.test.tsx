import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { setLang } from '@cc/web-i18n';
import type { EventView, ReportData } from '@cc/core';
import { renderAt, mockApi } from '../../../test/render';
import { App } from '../../../App';

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

const dalatEvent: EventView = {
  id: 'ev-dalat',
  tagId: 't-dalat',
  tagName: 'dalat-281126',
  name: 'Đà Lạt',
  start: '2026-11-20',
  end: '2026-11-28',
  stoppedAt: null,
  countsFrom: '2026-11-20',
  groupIds: [],
  budgetId: null,
  createdAt: '2026-11-20T00:00:00.000Z',
};

function makeReport(overrides?: Partial<ReportData>): ReportData {
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
      previousSpent: 200_000,
      previousIncome: 0,
      spentDiff: 100_000,
      incomeDiff: 0,
      spentPct: 50,
      incomePct: null,
    },
    baseline3m: {
      previousSpent: 250_000,
      previousIncome: 100_000,
      spentDiff: 50_000,
      incomeDiff: -100_000,
      spentPct: 20,
      incomePct: -100,
      historyCount: 3,
    },
    unratedWallets: [],
    countedCount: 2,
    hasAnyUnratedOnly: false,
    healthSeries: [
      {
        index: 0,
        date: '2026-11-20',
        label: '20/11',
        income: 0,
        expense: 300_000,
        avgIncome: 100_000,
        avgExpense: 250_000,
      },
    ],
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
      expense: [
        { tagId: 't-dalat', name: 'dalat-281126', amount: 200_000, percent: 67, entryCount: 1 },
        { tagId: 't-house', name: 'Mua nhà', amount: 100_000, percent: 33, entryCount: 1 },
      ],
      income: [],
      hasMultiTagOverlap: false,
    },
    walletBalance: null,
    countedRows: [],
    ...overrides,
  };
}

describe('D1 & D2: TagBarsCard event routing and tag-filtered report shape', () => {
  it('routes event tag chart button to /events/<id> and non-event tag to filtered report, with matching title attributes', async () => {
    mockApi({
      'GET /api/me': meOn,
      'GET /api/me/personal/wallets': { wallets: [] },
      'GET /api/me/personal/events': { events: [dalatEvent] },
      'GET /api/me/personal/report': makeReport(),
    });

    renderAt(<App />, { route: '/reports?mode=custom&from=2026-09-01&to=2026-11-28' });

    await waitFor(() => {
      const links = screen.getAllByTestId('tag-report-link');
      expect(links).toHaveLength(2);
      expect(links[0]).toHaveAttribute('href', '/events/ev-dalat');
    });

    const links = screen.getAllByTestId('tag-report-link');
    expect(links[0]).toHaveAttribute('href', '/events/ev-dalat');
    expect(links[0]).toHaveAttribute('title', links[0]!.getAttribute('aria-label'));

    expect(links[1]).toHaveAttribute(
      'href',
      '/reports?mode=custom&from=2026-09-01&to=2026-11-28&tagId=t-house',
    );
    expect(links[1]).toHaveAttribute('title', links[1]!.getAttribute('aria-label'));
  });

  it('in tag mode hides comparison/baseline UI, zero-income panel, and Theo thẻ while keeping totals and categories', async () => {
    mockApi({
      'GET /api/me': meOn,
      'GET /api/me/personal/wallets': { wallets: [] },
      'GET /api/me/personal/tags': {
        tags: [{ id: 't-house', name: 'Mua nhà', useCount: 1 }],
      },
      'GET /api/me/personal/events': { events: [] },
      'GET /api/me/personal/report': makeReport({
        totals: { spent: 300_000, income: 0, net: -300_000 },
        incomeByCategory: [],
      }),
    });

    renderAt(<App />, {
      route: '/reports?mode=custom&from=2026-09-01&to=2026-11-28&tagId=t-house',
    });

    await waitFor(() => {
      expect(screen.getByTestId('reports-tag-filter-pill')).toHaveTextContent('#Mua nhà');
    });

    // Summary totals stay, comparison and 3-period baseline lines are hidden
    const summary = screen.getByTestId('reports-summary');
    expect(summary.textContent).toContain('300.000₫');
    expect(summary.textContent).not.toMatch(/50%|more than|nhiều hơn|No previous|Chưa đủ dữ liệu/i);
    expect(summary.textContent).not.toMatch(/Usual|Mức thường/i);

    // Health trend baseline legend is hidden
    expect(screen.queryByText(/Usual spending|Chi thường/i)).not.toBeInTheDocument();

    // Category section keeps spending donut & category list, hides zero-income donut
    const catSection = screen.getByTestId('reports-category-section');
    expect(within(catSection).getByRole('button', { name: /Spending|Chi tiêu/i })).toBeInTheDocument();
    expect(within(catSection).queryByRole('button', { name: /Income|Thu nhập/i })).not.toBeInTheDocument();
    expect(within(catSection).getByText('Ăn uống')).toBeInTheDocument();

    // Theo thẻ (TagBarsCard) is hidden
    expect(screen.queryByTestId('reports-tags-section')).not.toBeInTheDocument();
  });

  it('in tag mode still shows the income panel when filtered income > 0', async () => {
    mockApi({
      'GET /api/me': meOn,
      'GET /api/me/personal/wallets': { wallets: [] },
      'GET /api/me/personal/tags': {
        tags: [{ id: 't-house', name: 'Mua nhà', useCount: 2 }],
      },
      'GET /api/me/personal/events': { events: [] },
      'GET /api/me/personal/report': makeReport({
        totals: { spent: 300_000, income: 500_000, net: 200_000 },
        incomeByCategory: [
          {
            categoryId: 'cat-refund',
            name: 'Hoàn tiền',
            icon: 'cash',
            type: 'income',
            amount: 500_000,
            percent: 100,
            subCategories: [],
          },
        ],
      }),
    });

    renderAt(<App />, {
      route: '/reports?mode=custom&from=2026-09-01&to=2026-11-28&tagId=t-house',
    });

    await waitFor(() => {
      expect(screen.getByTestId('reports-tag-filter-pill')).toHaveTextContent('#Mua nhà');
    });

    const catSection = screen.getByTestId('reports-category-section');
    expect(within(catSection).getByRole('button', { name: /Income|Thu nhập/i })).toBeInTheDocument();
    expect(screen.queryByTestId('reports-tags-section')).not.toBeInTheDocument();
  });

  it('in non-tag mode still shows comparison, baseline, income panel (even when 0), and Theo thẻ', async () => {
    mockApi({
      'GET /api/me': meOn,
      'GET /api/me/personal/wallets': { wallets: [] },
      'GET /api/me/personal/events': { events: [] },
      'GET /api/me/personal/report': makeReport({
        totals: { spent: 300_000, income: 0, net: -300_000 },
        incomeByCategory: [],
      }),
    });

    renderAt(<App />, {
      route: '/reports?mode=custom&from=2026-09-01&to=2026-11-28',
    });

    await waitFor(() => {
      expect(screen.getByTestId('reports-summary')).toBeInTheDocument();
    });

    // Comparison and 3-period usual baseline still show
    const summary = screen.getByTestId('reports-summary');
    expect(summary.textContent).toMatch(/50%/);
    expect(summary.textContent).toMatch(/Usual|Mức thường/i);

    // Health trend baseline legend still shows
    expect(screen.getByText(/Usual spending|Chi thường/i)).toBeInTheDocument();

    // Both spending and income donuts still show
    const catSection = screen.getByTestId('reports-category-section');
    expect(within(catSection).getByRole('button', { name: /Spending|Chi tiêu/i })).toBeInTheDocument();
    expect(within(catSection).getByRole('button', { name: /Income|Thu nhập/i })).toBeInTheDocument();

    // Theo thẻ (TagBarsCard) still shows
    expect(screen.getByTestId('reports-tags-section')).toBeInTheDocument();
  });
});
