import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import type {
  CategoriesResponse,
  CategoryView,
  CountedSpendRow,
  EventView,
  ReportData,
  ReportPeriodWindow,
  ReportQuery,
  TagView,
  TripView,
  WalletDetailView,
} from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { browserPlatform, PlatformProvider } from '@cc/web-platform';
import { renderAt, mockApi } from '../../test/render';
import { tripView } from '../../test/fixtures';
import { mockMedia } from '../../test/media';
import { NavHistoryProvider } from '../../lib/navHistory';
import { UndoSnackbarHost, hideUndo } from '../../components/UndoSnackbarHost';
import { App } from '../../App';
import { EntryPage } from '../EntryPage';
import { EventForm } from '../../components/events/EventForm';
import { TagBarsCard } from '../../components/reports/TagBarsCard';

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
  hideUndo();
  mockMedia();
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  hideUndo();
  setLang('en');
});

const meOn = {
  user: { id: 'u-me', email: 'me@example.com', name: 'Me', consentAt: '2026-10-12T00:00:00.000Z' },
  signIn: { zalo: true },
  mergeRequests: { incoming: [], outgoing: [] },
  personalArea: true,
};

const ledger = { tripId: 't-led', ownerPid: 'p-me' };
const peopleSummary = { people: [], incomplete: false };

function ledgerView(): TripView {
  return tripView({
    trip: {
      id: 't-led',
      name: 'Quick expenses',
      currency: 'VND',
      fewestTransfers: true,
      archived: false,
      version: 1,
      total: 0,
    },
    me: { kind: 'member', participantId: 'p-me', participantPending: false, isOrganiser: true },
    people: [{ id: 'p-me', name: 'Me', status: 'active', isMember: true, bank: 'approved' }],
    expenses: [],
    payments: [],
  });
}

const cashWallet: WalletDetailView = {
  id: 'w-cash',
  name: 'Tiền mặt',
  currency: 'VND',
  balance: 10_000_000,
  isDefault: true,
  kind: 'everyday',
  startAmount: 10_000_000,
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: 10_000_000,
  icon: 'wallet',
  sortOrder: 0,
  archived: false,
  entryCount: 10,
  excludeFromReports: false,
};

const categories: CategoryView[] = [
  { id: 'cat-food', parentId: null, type: 'expense', name: 'Ăn uống', icon: 'utensils', hidden: false, sortOrder: 0 },
];

const categoriesResp: CategoriesResponse = {
  categories,
  recentIds: ['cat-food'],
};

const tags: TagView[] = [
  { id: 'tag-dalat', name: 'dalat-281126', useCount: 2 },
  { id: 'tag-tet', name: 'muasamtet-281126-100227', useCount: 1 },
  { id: 'tag-house', name: 'Mua nhà', useCount: 1 },
];

const openEvent: EventView = {
  id: 'ev-dalat',
  tagId: 'tag-dalat',
  tagName: 'dalat-281126',
  name: 'Đà Lạt',
  start: '2026-11-28',
  end: null,
  stoppedAt: null,
  countsFrom: '2026-11-28',
  groupIds: [],
  budgetId: null,
  createdAt: '2026-11-28T00:00:00.000Z',
};

const crossYearEvent: EventView = {
  id: 'ev-tet',
  tagId: 'tag-tet',
  tagName: 'muasamtet-281126-100227',
  name: 'Mua sắm Tết',
  start: '2026-11-28',
  end: '2027-02-10',
  stoppedAt: null,
  countsFrom: '2026-11-28',
  groupIds: [],
  budgetId: null,
  createdAt: '2026-11-28T00:00:00.000Z',
};

function makeReport(overrides?: Partial<ReportData>): ReportData {
  return {
    period: {
      mode: 'custom',
      from: '2026-11-01',
      to: '2026-11-28',
      effectiveTo: '2026-11-28',
      inProgress: true,
      granularity: 'day',
      previous: { from: '2026-10-01', to: '2026-10-31', effectiveTo: '2026-10-28' },
      baselines: [],
    },
    currency: 'VND',
    approximate: false,
    singleWallet: null,
    totals: { spent: 450_000, income: 0, net: -450_000 },
    perCurrency: [{ currency: 'VND', spent: 450_000, income: 0 }],
    previousDelta: {
      previousSpent: 0,
      previousIncome: 0,
      spentDiff: 450_000,
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
        amount: 450_000,
        percent: 100,
        subCategories: [],
      },
    ],
    incomeByCategory: [],
    tags: {
      expense: [{ tagId: 'tag-dalat', name: 'dalat-281126', amount: 450_000, percent: 100, entryCount: 1 }],
      income: [],
      hasMultiTagOverlap: false,
    },
    walletBalance: null,
    countedRows: [],
    ...overrides,
  };
}

function stubApis(opts: {
  events?: EventView[];
  rows?: CountedSpendRow[];
  report?: ReportData;
  groups?: { id: string; name: string; preset: string }[];
} = {}) {
  const { events = [], rows = [], report = makeReport(), groups = [] } = opts;
  return mockApi({
    'GET /api/me': meOn,
    'GET /api/me/ledger': ledger,
    'GET /api/me/people': peopleSummary,
    'GET /api/me/people/summary': peopleSummary,
    'GET /api/trips/t-led': ledgerView(),
    'GET /api/trips/t-led/version': { version: 1 },
    'GET /api/trips': [],
    'GET /api/me/groups': { items: groups },
    'GET /api/me/personal/wallets': { wallets: [cashWallet] },
    'GET /api/me/personal/categories': categoriesResp,
    'GET /api/me/personal/tags': { tags },
    'GET /api/me/personal/group-settings': {
      settings: { defaultGroupCategoryId: null, countLoans: false },
    },
    'GET /api/me/personal/transactions': { rows: [], totals: [] },
    'GET /api/me/personal/budgets': { budgets: [] },
    'GET /api/me/personal/budgets/progress': { today: '2026-11-28', rows },
    'GET /api/me/personal/events': { events },
    'GET /api/me/personal/events/ev-dalat/rows': { rows },
    'GET /api/me/personal/events/ev-tet/rows': { rows },
    'GET /api/me/personal/report': report,
    'POST /api/me/personal/events/tag-shares': { tagged: 0 },
  });
}

function renderVi(route: string) {
  const utils = renderAt(<App />, { route, path: '*' });
  act(() => {
    setLang('vi', false);
  });
  return utils;
}

describe('Design round 2 (R1–R6)', () => {
  it('R1: TagBarsCard and ReportsScreen chip show event name + calendar icon + D4 dates instead of raw slug', async () => {
    setLang('vi', false);
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
    const query: ReportQuery = { mode: 'month', month: '2026-11', includeGroups: true };

    const card = render(
      <MemoryRouter>
        <TagBarsCard
          tags={{
            expense: [
              { tagId: 'tag-dalat', name: 'dalat-281126', amount: 450_000, percent: 50, entryCount: 2 },
              { tagId: 'tag-tet', name: 'muasamtet-281126-100227', amount: 300_000, percent: 30, entryCount: 1 },
              { tagId: 'tag-house', name: 'Mua nhà', amount: 200_000, percent: 20, entryCount: 1 },
            ],
            income: [],
            hasMultiTagOverlap: false,
          }}
          period={period}
          query={query}
          currency="VND"
          approximate={false}
          events={[openEvent, crossYearEvent]}
        />
      </MemoryRouter>,
    );

    expect(card.container).toHaveTextContent('Đà Lạt');
    expect(card.container).toHaveTextContent('· 28/11');
    expect(card.container).toHaveTextContent('Mua sắm Tết');
    expect(card.container).toHaveTextContent('· 28/11 – 10/2/2027');
    expect(card.container).toHaveTextContent('#Mua nhà');
    expect(card.container).not.toHaveTextContent('#dalat-281126');
    expect(card.container).not.toHaveTextContent('#muasamtet-281126-100227');
    card.unmount();

    // ReportsScreen chip for an event tag
    stubApis({ events: [openEvent] });
    renderVi('/reports?mode=custom&from=2026-11-01&to=2026-11-28&tagId=tag-dalat');

    const pill = await screen.findByTestId('reports-tag-filter-pill');
    await waitFor(() => {
      expect(pill).toHaveTextContent('Đà Lạt');
      expect(pill).toHaveTextContent('· 28/11');
    });
    expect(pill).not.toHaveTextContent('#dalat-281126');
    expect(pill.querySelector('svg')).not.toBeNull();
  });

  it('R2: resume confirm shows resumeDropsLimit only when budget exists and plannedEnd is null or < today', async () => {
    const user = userEvent.setup();
    const baseStopped: EventView = {
      id: 'ev-stop',
      tagId: 'tag-dalat',
      tagName: 'dalat-201126-281126',
      name: 'Đà Lạt',
      start: '2026-11-20',
      end: '2026-11-28',
      stoppedAt: '2026-11-28T08:00:00.000Z',
      countsFrom: '2026-11-20',
      groupIds: [],
      budgetId: 'b-1',
      createdAt: '2026-11-20T00:00:00.000Z',
    };

    // Case 1: plannedEnd >= today -> NO warning
    stubApis({ events: [{ ...baseStopped, plannedEnd: '2026-12-05' }] });
    const first = renderVi('/events/ev-stop');
    await user.click(await screen.findByTestId('event-resume-button'));
    const modal1 = await screen.findByTestId('event-resume-confirm-modal');
    expect(within(modal1).queryByTestId('event-resume-drops-limit')).not.toBeInTheDocument();
    first.unmount();

    // Case 2: plannedEnd < today -> warning shown
    stubApis({ events: [{ ...baseStopped, plannedEnd: '2026-11-25' }] });
    const second = renderVi('/events/ev-stop');
    await user.click(await screen.findByTestId('event-resume-button'));
    const modal2 = await screen.findByTestId('event-resume-confirm-modal');
    expect(within(modal2).getByTestId('event-resume-drops-limit')).toBeInTheDocument();
    second.unmount();

    // Case 3: plannedEnd is null -> warning shown
    stubApis({ events: [{ ...baseStopped, plannedEnd: null }] });
    renderVi('/events/ev-stop');
    await user.click(await screen.findByTestId('event-resume-button'));
    const modal3 = await screen.findByTestId('event-resume-confirm-modal');
    expect(within(modal3).getByTestId('event-resume-drops-limit')).toBeInTheDocument();
  });

  it('R3: EventDateRow is one line per date with the empty meaning as its value, a clear button once set, and the limit hint under the end row', async () => {
    stubApis();
    renderAt(<EventForm open onClose={vi.fn()} onSaved={vi.fn()} />, {
      route: '/events',
      path: '*',
    });
    act(() => {
      setLang('vi', false);
    });

    await screen.findByTestId('event-form');

    // One line per date: label + what an empty value means, no hint lines, no chips
    expect(screen.getByTestId('event-form-start-display')).toHaveTextContent('Hôm nay');
    expect(screen.queryByTestId('event-form-start-today')).not.toBeInTheDocument();
    expect(screen.queryByTestId('event-form-start-pick')).not.toBeInTheDocument();
    expect(screen.queryByTestId('event-form-start-hint')).not.toBeInTheDocument();

    const endLabel = screen.getByText('Kết thúc');
    expect(endLabel.tagName).toBe('LABEL');
    expect(endLabel).toHaveClass('whitespace-nowrap');
    expect(screen.getByTestId('event-form-end-display')).toHaveTextContent('Đến khi bạn dừng');
    expect(screen.queryByTestId('event-form-end-pick')).not.toBeInTheDocument();
    expect(screen.queryByTestId('event-form-end-clear')).not.toBeInTheDocument();

    // Limit hint sits inside the same rounded-xl dates group as end row
    const limitHint = screen.getByTestId('event-form-limit-needs-end');
    const endInput = screen.getByTestId('event-form-end');
    expect(limitHint.parentElement).toBe(endInput.closest('.divide-y'));

    // Picking a start date shows it and a clear button; clearing goes back to "Hôm nay"
    fireEvent.change(screen.getByTestId('event-form-start'), { target: { value: '2027-02-08' } });
    expect(screen.getByTestId('event-form-start-display')).toHaveTextContent('T2, 8/2/2027');
    fireEvent.click(screen.getByTestId('event-form-start-clear'));
    expect(screen.getByTestId('event-form-start-display')).toHaveTextContent('Hôm nay');

    // Picking an end date shows it with a clear button and drops the limit hint
    fireEvent.change(endInput, { target: { value: '2027-02-10' } });
    expect(screen.getByTestId('event-form-end-display')).toHaveTextContent('T4, 10/2/2027');
    expect(screen.getByTestId('event-form-end-clear')).toBeInTheDocument();
    expect(screen.queryByTestId('event-form-limit-needs-end')).not.toBeInTheDocument();
  });

  it('R4: EventDetailScreen header 3-line hierarchy, lifecycle pill in summary card, and solo hides zero group row', async () => {
    const soloRows: CountedSpendRow[] = [
      {
        id: 'r-1',
        kind: 'entry',
        date: '2026-11-28',
        amount: 450_000,
        currency: 'VND',
        walletId: 'w-cash',
        categoryId: 'cat-food',
        tagIds: ['tag-dalat'],
      },
    ];
    stubApis({ events: [openEvent], rows: soloRows });
    renderVi('/events/ev-dalat');

    // Line 1: state pill + dates
    const line1 = await screen.findByTestId('event-meta-line');
    expect(within(line1).getByTestId('event-state-pill')).toHaveTextContent('Đang diễn ra');
    expect(line1).toHaveTextContent('Từ 28/11 · chưa có ngày kết thúc');

    // Line 2: day · solo
    const line2 = screen.getByTestId('event-meta-sub');
    expect(within(line2).getByTestId('event-day-line')).toHaveTextContent('ngày 1');
    expect(line2).toHaveTextContent('một mình');

    // Line 3: Thẻ: #…
    expect(screen.getByTestId('event-tag-name')).toHaveTextContent('Thẻ: #dalat-281126');

    // Summary card contains full-width secondary Dừng button and hides "Phần của bạn trong nhóm"
    const summaryCard = screen.getByTestId('event-summary-card');
    const stopBtn = within(summaryCard).getByTestId('event-stop-button');
    expect(stopBtn).toHaveClass('fsl-button--secondary', 'w-full');
    expect(summaryCard).toHaveTextContent('Bạn tự chi');
    expect(summaryCard).not.toHaveTextContent('Phần của bạn trong nhóm');
  });

  it('R5: EntryPage renders all event rows inside ONE white rounded-xl group with "Tính vào {name}" copy', async () => {
    setLang('vi', false);
    stubApis({ events: [openEvent, crossYearEvent] });

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
    });
    render(
      <PlatformProvider platform={browserPlatform}>
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={[{ pathname: '/entries/new', search: '?type=expense' }]}>
            <NavHistoryProvider>
              <UndoSnackbarHost />
              <Routes>
                <Route path="/entries/new" element={<EntryPage />} />
              </Routes>
            </NavHistoryProvider>
          </MemoryRouter>
        </QueryClientProvider>
      </PlatformProvider>,
    );

    const group = await screen.findByTestId('entry-event-group');
    expect(group).toHaveClass('rounded-xl', 'bg-card', 'divide-y', 'divide-border');

    const row1 = within(group).getByTestId('entry-event-row-ev-dalat');
    const row2 = within(group).getByTestId('entry-event-row-ev-tet');
    expect(row1).toHaveTextContent('Tính vào Đà Lạt');
    expect(row2).toHaveTextContent('Tính vào Mua sắm Tết');
    expect(row1).toHaveClass('min-h-11');
    expect(row1).not.toHaveClass('rounded-xl');
    expect(within(row1).getByRole('button', { name: 'Bỏ khỏi Đà Lạt' })).toHaveClass('size-11');
  });

  it('R6: idle BookEventRow shows muted hint and EventsScreen uses en dash in date ranges', async () => {
    // Idle book row
    stubApis({ events: [] });
    const first = renderVi('/trips');
    const row = await screen.findByTestId('book-event-row');
    expect(within(row).getByTestId('book-event-subtitle')).toHaveTextContent(
      'Tự gắn thẻ chi tiêu cho chuyến đi, dự án',
    );
    first.unmount();

    // EventsScreen list date range uses en dash
    stubApis({ events: [crossYearEvent] });
    renderVi('/events');
    const evRow = await screen.findByTestId('event-row-ev-tet');
    expect(evRow).toHaveTextContent('28/11 – 10/2/2027');
  });
});
