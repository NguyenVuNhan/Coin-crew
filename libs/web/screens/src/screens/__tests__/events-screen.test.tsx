import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  BudgetDef,
  CategoryView,
  CountedSpendRow,
  TagView,
  EventView,
  TripView,
  WalletDetailView,
} from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { renderAt, mockApi } from '../../test/render';
import { tripView } from '../../test/fixtures';
import { App } from '../../App';

vi.mock('@cc/web-util/localDate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cc/web-util/localDate')>();
  return {
    ...actual,
    todayLocal: () => '2026-11-13',
  };
});

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const meOff = {
  user: { id: 'u-me', email: 'me@example.com', name: 'Me', consentAt: '2026-10-12T00:00:00.000Z' },
  signIn: { zalo: true },
  mergeRequests: { incoming: [], outgoing: [] },
  personalArea: false,
};

const meOn = { ...meOff, personalArea: true };

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

const tags: TagView[] = [
  { id: 'tag-dl', name: 'Đà Lạt', useCount: 3 },
  { id: 'tag-hue', name: 'Huế', useCount: 1 },
  { id: 'tag-pq', name: 'Phú Quốc', useCount: 2 },
  { id: 'tag-hn', name: 'Hà Nội', useCount: 1 },
];

const onEvent: EventView = {
  id: 'tr-dl',
  tagId: 'tag-dl',
  name: 'Đà Lạt',
  start: '2026-11-12',
  end: '2026-11-14',
  countsFrom: '2026-11-05',
  groupIds: [],
  budgetId: 'b-dl',
  createdAt: '2026-11-05T00:00:00.000Z',
};

const upcomingEvent: EventView = {
  id: 'tr-hue',
  tagId: 'tag-hue',
  name: 'Huế',
  start: '2026-11-18',
  end: '2026-11-21',
  countsFrom: '2026-11-10',
  groupIds: [],
  budgetId: null,
  createdAt: '2026-11-10T00:00:00.000Z',
};

const doneOverEvent: EventView = {
  id: 'tr-pq',
  tagId: 'tag-pq',
  name: 'Phú Quốc',
  start: '2026-08-02',
  end: '2026-08-06',
  countsFrom: '2026-07-20',
  groupIds: [],
  budgetId: 'b-pq',
  createdAt: '2026-07-20T00:00:00.000Z',
};

const doneNoLimitEvent: EventView = {
  id: 'tr-hn',
  tagId: 'tag-hn',
  name: 'Hà Nội',
  start: '2026-03-01',
  end: '2026-03-03',
  countsFrom: '2026-03-01',
  groupIds: [],
  budgetId: null,
  createdAt: '2026-03-01T00:00:00.000Z',
};

const dlBudget: BudgetDef = {
  id: 'b-dl',
  name: 'Đà Lạt',
  target: { kind: 'tag', tagId: 'tag-dl' },
  currency: 'VND',
  periodKind: 'once',
  monthStartDay: null,
  from: '2026-11-05',
  to: '2026-11-14',
  excludedWalletIds: [],
  limits: [{ effectiveFrom: '2026-11-05', amount: 5_000_000 }],
  suggestionDismissedUntil: null,
  createdOn: '2026-11-05',
};

const pqBudget: BudgetDef = {
  id: 'b-pq',
  name: 'Phú Quốc',
  target: { kind: 'tag', tagId: 'tag-pq' },
  currency: 'VND',
  periodKind: 'once',
  monthStartDay: null,
  from: '2026-07-20',
  to: '2026-08-06',
  excludedWalletIds: [],
  limits: [{ effectiveFrom: '2026-07-20', amount: 7_000_000 }],
  suggestionDismissedUntil: null,
  createdOn: '2026-07-20',
};

function spendRow(
  id: string,
  date: string,
  amount: number,
  tagIds: string[],
): CountedSpendRow {
  return {
    id,
    kind: 'entry',
    date,
    amount,
    currency: 'VND',
    walletId: 'w-cash',
    categoryId: 'cat-food',
    tagIds,
  };
}

function stubApis(opts: {
  events?: EventView[];
  budgets?: BudgetDef[];
  rows?: CountedSpendRow[];
  me?: typeof meOn;
} = {}) {
  const { events = [], budgets = [], rows = [], me = meOn } = opts;
  return mockApi({
    'GET /api/me': me,
    'GET /api/me/personal/events': { events },
    'GET /api/me/personal/budgets': { budgets },
    'GET /api/me/personal/budgets/progress': { today: '2026-11-13', rows },
    'GET /api/me/personal/wallets': { wallets: [cashWallet] },
    'GET /api/me/personal/categories': { categories },
    'GET /api/me/personal/tags': { tags },
    'GET /api/me/personal/group-settings': {
      settings: { defaultGroupCategoryId: null, countLoans: false },
    },
    'GET /api/me/ledger': ledger,
    'GET /api/me/people': peopleSummary,
    'GET /api/trips/t-led': ledgerView(),
    'GET /api/trips': [],
  });
}

function renderEventsVi(route = '/events') {
  const utils = renderAt(<App />, { route, path: '*' });
  act(() => {
    setLang('vi', false);
  });
  return utils;
}

describe('EventsScreen', () => {
  it('lists trips in on, upcoming and done sections', async () => {
    const rows: CountedSpendRow[] = [
      spendRow('r-dl', '2026-11-12', 3_100_000, ['tag-dl']),
      spendRow('r-hue', '2026-11-11', 1_240_000, ['tag-hue']),
      spendRow('r-pq', '2026-08-03', 7_860_000, ['tag-pq']),
      spendRow('r-hn', '2026-03-02', 4_200_000, ['tag-hn']),
    ];

    stubApis({
      events: [doneOverEvent, upcomingEvent, onEvent, doneNoLimitEvent],
      budgets: [dlBudget, pqBudget],
      rows,
    });
    renderEventsVi('/events');

    await waitFor(() => {
      expect(screen.getByTestId('event-row-tr-dl')).toHaveTextContent('3.100.000₫');
    });

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['Đang đi', 'Sắp tới', 'Đã đi']);

    // On section
    const onSection = screen.getByTestId('events-section-on');
    const dlRow = within(onSection).getByTestId('event-row-tr-dl');
    expect(dlRow).toHaveAttribute('href', '/events/tr-dl');
    expect(dlRow).toHaveTextContent('Đà Lạt');
    expect(dlRow).toHaveTextContent('12–14/11');
    expect(dlRow).toHaveTextContent('3.100.000₫');

    // Upcoming section
    const upcomingSection = screen.getByTestId('events-section-upcoming');
    const hueRow = within(upcomingSection).getByTestId('event-row-tr-hue');
    expect(hueRow).toHaveAttribute('href', '/events/tr-hue');
    expect(hueRow).toHaveTextContent('Huế');
    expect(hueRow).toHaveTextContent('18–21/11');
    expect(hueRow).toHaveTextContent('còn 5 ngày');
    expect(hueRow).toHaveTextContent('1.240.000₫');

    // Done section: ending in words (over limit + no limit)
    const doneSection = screen.getByTestId('events-section-done');
    const pqRow = within(doneSection).getByTestId('event-row-tr-pq');
    expect(pqRow).toHaveAttribute('href', '/events/tr-pq');
    expect(pqRow).toHaveTextContent('Phú Quốc');
    expect(pqRow).toHaveTextContent('7.860.000₫');
    expect(pqRow).toHaveTextContent(/Vượt 860\.000₫/);

    const hnRow = within(doneSection).getByTestId('event-row-tr-hn');
    expect(hnRow).toHaveTextContent('Hà Nội');
    expect(hnRow).toHaveTextContent('4.200.000₫');
    expect(hnRow).toHaveTextContent(/Không đặt hạn mức/i);

    // BottomBar has "+ Chuyến đi mới"
    const newBtn = screen.getByTestId('events-new-button');
    expect(newBtn).toHaveTextContent('+ Chuyến đi mới');
  });

  it('empty state offers a new trip', async () => {
    const user = userEvent.setup();
    stubApis({ events: [] });
    renderEventsVi('/events');

    const emptyAdd = await screen.findByTestId('events-empty-add');
    expect(emptyAdd).toHaveTextContent('Chuyến đi mới');

    await user.click(emptyAdd);
    expect(await screen.findByTestId('event-form')).toBeInTheDocument();
  });

  it('/events redirects to /trips with the spending book off', async () => {
    stubApis({ events: [onEvent], me: meOff });
    renderEventsVi('/events');

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/trips');
    });
    expect(screen.queryByTestId('event-row-tr-dl')).not.toBeInTheDocument();
  });
});
