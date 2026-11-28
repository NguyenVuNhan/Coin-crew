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

const thbWallet: WalletDetailView = {
  id: 'w-thb',
  name: 'Baht',
  currency: 'THB',
  balance: 10_000_00,
  isDefault: false,
  kind: 'everyday',
  startAmount: 10_000_00,
  startDate: '2026-01-01',
  startCostVnd: 7_200_000,
  vndValue: 7_200_000,
  icon: 'wallet',
  sortOrder: 1,
  archived: false,
  entryCount: 5,
  excludeFromReports: false,
};

const categories: CategoryView[] = [
  { id: 'cat-food', parentId: null, type: 'expense', name: 'Ăn uống', icon: 'utensils', hidden: false, sortOrder: 0 },
  { id: 'cat-stay', parentId: null, type: 'expense', name: 'Lưu trú', icon: 'hotel', hidden: false, sortOrder: 1 },
  { id: 'cat-shop', parentId: null, type: 'expense', name: 'Mua sắm', icon: 'shopping-bag', hidden: false, sortOrder: 2 },
];

const tags: TagView[] = [
  { id: 'tag-dl', name: 'Đà Lạt', useCount: 4 },
  { id: 'tag-bkk', name: 'Bangkok', useCount: 3 },
];

const daLatEvent: EventView = {
  id: 'tr-dl',
  tagId: 'tag-dl',
  tagName: 'dalat-121126-141126',
  name: 'Đà Lạt',
  start: '2026-11-12',
  end: '2026-11-14',
  stoppedAt: null,
  countsFrom: '2026-11-05',
  groupIds: ['g-friends'],
  budgetId: 'b-dl',
  createdAt: '2026-11-05T00:00:00.000Z',
};

const noLimitEvent: EventView = {
  id: 'tr-nolim',
  tagId: 'tag-dl',
  tagName: 'dalattutuc-121126-141126',
  name: 'Đà Lạt tự túc',
  start: '2026-11-12',
  end: '2026-11-14',
  stoppedAt: null,
  countsFrom: '2026-11-05',
  groupIds: [],
  budgetId: null,
  createdAt: '2026-11-05T00:00:00.000Z',
};

const bangkokEvent: EventView = {
  id: 'tr-bkk',
  tagId: 'tag-bkk',
  tagName: 'bangkok-101126-151126',
  name: 'Bangkok',
  start: '2026-11-10',
  end: '2026-11-15',
  stoppedAt: null,
  countsFrom: '2026-11-01',
  groupIds: [],
  budgetId: null,
  createdAt: '2026-11-01T00:00:00.000Z',
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

function spendRow(
  id: string,
  date: string,
  amount: number,
  tagIds: string[],
  opts: Partial<CountedSpendRow> = {},
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
    ...opts,
  };
}

function stubApis(opts: {
  events?: EventView[];
  budgets?: BudgetDef[];
  rows?: CountedSpendRow[];
  wallets?: WalletDetailView[];
  me?: typeof meOn;
} = {}) {
  const {
    events = [],
    budgets = [],
    rows = [],
    wallets = [cashWallet, thbWallet],
    me = meOn,
  } = opts;
  return mockApi({
    'GET /api/me': me,
    'GET /api/me/personal/events': { events },
    'GET /api/me/personal/budgets': { budgets },
    'GET /api/me/personal/budgets/progress': { today: '2026-11-13', rows },
    'GET /api/me/personal/wallets': { wallets },
    'GET /api/me/personal/categories': { categories },
    'GET /api/me/personal/tags': { tags },
    'GET /api/me/personal/group-settings': {
      settings: { defaultGroupCategoryId: null, countLoans: false },
    },
    'GET /api/me/groups': {
      items: [
        { id: 'g-friends', name: 'Nhóm Đà Lạt', preset: 'trip' },
      ],
    },
    'GET /api/me/ledger': ledger,
    'GET /api/me/people': peopleSummary,
    'GET /api/trips/t-led': ledgerView(),
    'GET /api/trips': [],
  });
}

function renderDetailVi(route: string) {
  const utils = renderAt(<App />, { route, path: '*' });
  act(() => {
    setLang('vi', false);
  });
  return utils;
}

describe('EventDetailScreen', () => {
  it('shows total, own and group split', async () => {
    const rows: CountedSpendRow[] = [
      spendRow('r-1', '2026-11-12', 1_200_000, ['tag-dl'], { kind: 'entry', categoryId: 'cat-food' }),
      spendRow('r-2', '2026-11-13', 800_000, ['tag-dl'], { kind: 'group', categoryId: 'cat-stay' }),
    ];
    stubApis({ events: [daLatEvent], budgets: [dlBudget], rows });
    renderDetailVi('/events/tr-dl');

    const card = await screen.findByTestId('event-summary-card');
    expect(card).toHaveTextContent('2.000.000₫');
    expect(card).toHaveTextContent('Bạn tự chi');
    expect(card).toHaveTextContent('1.200.000₫');
    expect(card).toHaveTextContent('Phần của bạn trong nhóm');
    expect(card).toHaveTextContent('800.000₫');
  });

  it('shows over line and bar only with a limit', async () => {
    const rows: CountedSpendRow[] = [
      spendRow('r-1', '2026-11-12', 5_860_000, ['tag-dl']),
    ];

    // With limit (over)
    stubApis({ events: [daLatEvent], budgets: [dlBudget], rows });
    const first = renderDetailVi('/events/tr-dl');

    const cardWithLimit = await screen.findByTestId('event-summary-card');
    expect(cardWithLimit).toHaveTextContent('Vượt 860.000₫ so với hạn mức 5.000.000₫');
    expect(cardWithLimit.querySelector('.fsl-budget-bar')).not.toBeNull();
    first.unmount();

    // Without limit
    stubApis({ events: [noLimitEvent], budgets: [dlBudget], rows });
    renderDetailVi('/events/tr-nolim');

    const cardNoLimit = await screen.findByTestId('event-summary-card');
    expect(cardNoLimit.querySelector('.fsl-budget-bar')).toBeNull();
    expect(cardNoLimit).not.toHaveTextContent('Vượt');
    expect(cardNoLimit).not.toHaveTextContent('Còn');
  });

  it('two currencies show two totals, the approx line, and a currency switch', async () => {
    const user = userEvent.setup();
    const rows: CountedSpendRow[] = [
      spendRow('r-thb-1', '2026-11-11', 2_100_00, ['tag-bkk'], {
        currency: 'THB',
        walletId: 'w-thb',
        categoryId: 'cat-food',
        vnd: 1_512_000,
      }),
      spendRow('r-thb-2', '2026-11-12', 1_600_00, ['tag-bkk'], {
        currency: 'THB',
        walletId: 'w-thb',
        categoryId: 'cat-shop',
        vnd: 1_152_000,
      }),
      spendRow('r-vnd-1', '2026-11-10', 3_200_000, ['tag-bkk'], {
        currency: 'VND',
        walletId: 'w-cash',
        categoryId: 'cat-stay',
        vnd: 3_200_000,
      }),
    ];
    stubApis({ events: [bangkokEvent], budgets: [dlBudget], rows });
    renderDetailVi('/events/tr-bkk');

    const card = await screen.findByTestId('event-summary-card');
    expect(card).toHaveTextContent('3.200.000₫');
    expect(card).toHaveTextContent('3.700');
    expect(screen.getByTestId('event-approx')).toHaveTextContent('5.864.000₫');

    const switchEl = screen.getByTestId('event-currency-switch');
    expect(within(switchEl).getByRole('button', { name: /VND/i })).toBeInTheDocument();
    const thbBtn = within(switchEl).getByRole('button', { name: /THB/i });
    expect(thbBtn).toBeInTheDocument();

    // Default VND selected -> Lưu trú in category breakdown
    expect(screen.getByTestId('event-by-category')).toHaveTextContent('Lưu trú');
    expect(screen.getByTestId('event-by-category')).not.toHaveTextContent('Mua sắm');

    // Switch to THB -> Ăn uống and Mua sắm in category breakdown
    await user.click(thbBtn);
    expect(screen.getByTestId('event-by-category')).toHaveTextContent('Ăn uống');
    expect(screen.getByTestId('event-by-category')).toHaveTextContent('Mua sắm');
  });

  it('approx line hidden when approxVnd is null', async () => {
    const rows: CountedSpendRow[] = [
      spendRow('r-thb-1', '2026-11-11', 2_100_00, ['tag-bkk'], {
        currency: 'THB',
        walletId: 'w-thb',
        categoryId: 'cat-food',
        vnd: null,
      }),
      spendRow('r-vnd-1', '2026-11-10', 3_200_000, ['tag-bkk'], {
        currency: 'VND',
        walletId: 'w-cash',
        categoryId: 'cat-stay',
        vnd: 3_200_000,
      }),
    ];
    stubApis({ events: [bangkokEvent], budgets: [dlBudget], rows });
    renderDetailVi('/events/tr-bkk');

    await screen.findByTestId('event-summary-card');
    expect(screen.queryByTestId('event-approx')).toBeNull();
  });

  it('lead-up bucket first in by-day', async () => {
    const rows: CountedSpendRow[] = [
      spendRow('r-day1', '2026-11-12', 1_610_000, ['tag-dl']),
      spendRow('r-lead', '2026-11-08', 1_240_000, ['tag-dl']),
      spendRow('r-day2', '2026-11-13', 900_000, ['tag-dl']),
    ];
    stubApis({ events: [daLatEvent], budgets: [dlBudget], rows });
    renderDetailVi('/events/tr-dl');

    const byDay = await screen.findByTestId('event-by-day');
    const items = within(byDay).getAllByTestId(/^event-day-row-/);
    expect(items[0]).toHaveTextContent('Trước sự kiện');
    expect(items[0]).toHaveTextContent('1.240.000₫');
    expect(items[1]).toHaveTextContent('12/11');
    expect(items[2]).toHaveTextContent('13/11');
  });

  it('not-found state for a deleted trip', async () => {
    stubApis({ events: [], rows: [] });
    renderDetailVi('/events/tr-missing');

    await waitFor(() => {
      expect(screen.getByTestId('event-not-found')).toBeInTheDocument();
    });
  });

  it('transactions link carries tag and dates', async () => {
    const rows: CountedSpendRow[] = [
      spendRow('r-1', '2026-11-12', 1_000_000, ['tag-dl']),
      spendRow('r-2', '2026-11-13', 500_000, ['tag-dl']),
    ];
    stubApis({ events: [daLatEvent], budgets: [dlBudget], rows });
    renderDetailVi('/events/tr-dl');

    const link = await screen.findByTestId('event-see-tx');
    expect(link).toHaveTextContent('Xem 2 giao dịch');
    expect(link.getAttribute('href')).toBe(
      '/transactions?tagId=tag-dl&from=2026-11-12&to=2026-11-13',
    );
  });

  it('transactions link spans the earliest to the latest tagged item and report link is removed', async () => {
    const rows: CountedSpendRow[] = [
      spendRow('r-early', '2026-10-01', 400_000, ['tag-dl']),
      spendRow('r-mid', '2026-11-12', 1_000_000, ['tag-dl']),
      spendRow('r-late', '2026-12-05', 300_000, ['tag-dl']),
    ];
    stubApis({ events: [daLatEvent], budgets: [dlBudget], rows });
    renderDetailVi('/events/tr-dl');

    const txLink = await screen.findByTestId('event-see-tx');
    expect(screen.queryByTestId('event-view-report')).not.toBeInTheDocument();
    expect(txLink).toHaveAttribute(
      'href',
      '/transactions?tagId=tag-dl&from=2026-10-01&to=2026-12-05',
    );
  });
});
