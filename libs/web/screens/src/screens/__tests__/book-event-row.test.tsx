import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
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
    todayLocal: () => '2026-11-26',
  };
});

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  setLang('en');
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
  balance: 5_000_000,
  isDefault: true,
  kind: 'everyday',
  startAmount: 5_000_000,
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: 5_000_000,
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
  { id: 'tag-dalat', name: 'Đà Lạt', useCount: 1 },
  { id: 'tag-hue', name: 'Huế', useCount: 1 },
];

const tripOnWithBudget: EventView = {
  id: 'tr-dalat',
  tagId: 'tag-dalat',
  tagName: 'Đà Lạt',
  name: 'Đà Lạt',
  start: '2026-11-25',
  end: '2026-11-27',
  stoppedAt: null,
  countsFrom: '2026-11-20',
  groupIds: [],
  budgetId: 'b-dalat',
  createdAt: '2026-11-20T00:00:00.000Z',
};

const tripOnNoBudget: EventView = {
  ...tripOnWithBudget,
  budgetId: null,
};

const tripUpcomingHue: EventView = {
  id: 'tr-hue',
  tagId: 'tag-hue',
  tagName: 'Huế',
  name: 'Huế',
  start: '2026-12-01',
  end: '2026-12-04',
  stoppedAt: null,
  countsFrom: '2026-11-20',
  groupIds: [],
  budgetId: null,
  createdAt: '2026-11-20T00:00:00.000Z',
};

const tripUpcomingFar: EventView = {
  id: 'tr-tokyo',
  tagId: 'tag-tokyo',
  tagName: 'Tokyo',
  name: 'Tokyo',
  start: '2026-12-20',
  end: '2026-12-28',
  stoppedAt: null,
  countsFrom: '2026-11-20',
  groupIds: [],
  budgetId: null,
  createdAt: '2026-11-20T00:00:00.000Z',
};

const dalatBudget: BudgetDef = {
  id: 'b-dalat',
  name: 'Đà Lạt',
  target: { kind: 'tag', tagId: 'tag-dalat' },
  currency: 'VND',
  periodKind: 'once',
  monthStartDay: null,
  from: '2026-11-25',
  to: '2026-11-27',
  excludedWalletIds: [],
  limits: [{ effectiveFrom: '2026-11-25', amount: 5_000_000 }],
  suggestionDismissedUntil: null,
  createdOn: '2026-11-20',
};

type Routes = Parameters<typeof mockApi>[0];

function mockApp(
  me: unknown,
  events: EventView[],
  opts: { budgets?: BudgetDef[]; rows?: CountedSpendRow[]; extra?: Routes } = {},
) {
  const budgets = opts.budgets ?? [];
  const rows = opts.rows ?? [];
  return mockApi({
    'GET /api/me': me,
    'GET /api/me/ledger': ledger,
    'GET /api/me/people/summary': peopleSummary,
    'GET /api/trips/t-led': ledgerView(),
    'GET /api/trips/t-led/version': { version: 1 },
    'GET /api/me/personal/wallets': { wallets: [cashWallet] },
    'GET /api/me/personal/categories': { categories },
    'GET /api/me/personal/tags': { tags },
    'GET /api/me/personal/group-settings': { settings: { defaultGroupCategoryId: null, countLoans: false } },
    'GET /api/me/personal/transactions': { rows: [], totals: [] },
    'GET /api/me/personal/budgets': { budgets },
    'GET /api/me/personal/budgets/progress': { rows, today: '2026-11-26' },
    'GET /api/me/personal/events': { events },
    'POST /api/me/personal/events/tag-shares': { tagged: 0 },
    ...opts.extra,
  });
}

describe('BookEventRow on Sổ chi tiêu', () => {
  it('idle row links to /events', async () => {
    mockApp(meOn, []);
    renderAt(<App />, { route: '/trips' });

    const row = await screen.findByTestId('book-event-row');
    expect(row).toHaveAttribute('href', '/events');
    expect(row).toHaveClass('fsl-book__event-row');
    expect(within(row).getByText('Events')).toBeInTheDocument();

    const reportsRow = screen.getByTestId('book-reports-row');
    expect(
      reportsRow.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('on row shows day of trip and bar with a limit', async () => {
    const rows: CountedSpendRow[] = [
      {
        kind: 'entry',
        id: 'e-1',
        date: '2026-11-26',
        amount: 3_100_000,
        currency: 'VND',
        walletId: 'w-cash',
        categoryId: 'cat-food',
        tagIds: ['tag-dalat'],
      },
    ];
    const { calls } = mockApp(meOn, [tripOnWithBudget], {
      budgets: [dalatBudget],
      rows,
      extra: {
        'GET /api/me/personal/events/tr-dalat/rows': { rows },
      },
    });
    renderAt(<App />, { route: '/trips' });

    const row = await screen.findByTestId('book-event-row');
    await waitFor(() => {
      expect(row).toHaveAttribute('href', '/events/tr-dalat');
    });
    expect(within(row).getByText('Đà Lạt is on')).toBeInTheDocument();
    expect(within(row).getByText('day 2/3')).toBeInTheDocument();

    await waitFor(() => {
      expect(row.querySelector('.fsl-budget-bar')).toBeInTheDocument();
    });
    expect(within(row).getByText(/1\.900\.000₫/)).toBeInTheDocument();
    expect(within(row).getByText(/3\.100\.000₫ \/ 5\.000\.000₫/)).toBeInTheDocument();

    await waitFor(() => {
      expect(calls.some((c) => c.method === 'POST' && c.path === '/api/me/personal/events/tag-shares')).toBe(true);
    });
  });

  it('on row without limit shows no bar', async () => {
    mockApp(meOn, [tripOnNoBudget]);
    renderAt(<App />, { route: '/trips' });

    const row = await screen.findByTestId('book-event-row');
    await waitFor(() => {
      expect(row).toHaveAttribute('href', '/events/tr-dalat');
    });
    expect(within(row).getByText('Đà Lạt is on')).toBeInTheDocument();
    expect(within(row).getByText('day 2/3')).toBeInTheDocument();
    expect(row.querySelector('.fsl-budget-bar')).toBeNull();
  });

  it('upcoming row shows days left and lead-up spent', async () => {
    const rows: CountedSpendRow[] = [
      {
        kind: 'entry',
        id: 'e-lead',
        date: '2026-11-23',
        amount: 1_240_000,
        currency: 'VND',
        walletId: 'w-cash',
        categoryId: 'cat-food',
        tagIds: ['tag-hue'],
      },
    ];
    mockApp(meOn, [tripUpcomingFar, tripUpcomingHue], {
      rows,
      extra: {
        'GET /api/me/personal/events/tr-hue/rows': { rows },
      },
    });
    renderAt(<App />, { route: '/trips' });

    const row = await screen.findByTestId('book-event-row');
    await waitFor(() => {
      expect(row).toHaveAttribute('href', '/events/tr-hue');
    });
    expect(within(row).getByText('Upcoming: Huế')).toBeInTheDocument();
    expect(within(row).getByText('5 days left')).toBeInTheDocument();
    await waitFor(() => {
      expect(within(row).getByText('Spent before: 1.240.000₫')).toBeInTheDocument();
    });
  });

  it('row disappears with the spending book off', async () => {
    const { calls } = mockApp(meOff, [tripOnWithBudget], { budgets: [dalatBudget] });
    renderAt(<App />, { route: '/trips' });

    await screen.findByTestId('home-total');
    expect(screen.queryByTestId('book-event-row')).not.toBeInTheDocument();
    expect(calls.some((c) => c.path.startsWith('/api/me/personal/events'))).toBe(false);
  });

  it('a deleted trip falls back to the idle row', async () => {
    mockApp(meOn, [], {
      extra: {
        'GET /api/me/personal/events': () =>
          Response.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 }),
      },
    });
    renderAt(<App />, { route: '/trips' });

    const row = await screen.findByTestId('book-event-row');
    expect(row).toHaveAttribute('href', '/events');
    expect(within(row).getByText('Events')).toBeInTheDocument();
  });
});
