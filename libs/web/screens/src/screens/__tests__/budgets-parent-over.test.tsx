import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import type {
  BudgetDef,
  CategoryView,
  CountedSpendRow,
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
  { id: 'cat-dining', parentId: 'cat-food', type: 'expense', name: 'Ăn ngoài', icon: 'utensils', hidden: false, sortOrder: 1 },
  { id: 'cat-transport', parentId: null, type: 'expense', name: 'Di chuyển', icon: 'car', hidden: false, sortOrder: 2 },
];

const foodParentDef: BudgetDef = {
  id: 'b-food',
  name: 'Ăn uống',
  target: { kind: 'category', categoryId: 'cat-food' },
  currency: 'VND',
  periodKind: 'month',
  monthStartDay: 1,
  from: null,
  to: null,
  excludedWalletIds: [],
  limits: [{ effectiveFrom: '2026-11-01', amount: 2_000_000 }],
  suggestionDismissedUntil: null,
  createdOn: '2026-11-01',
};

const diningChildDef: BudgetDef = {
  id: 'b-dining',
  name: 'Ăn ngoài',
  target: { kind: 'category', categoryId: 'cat-dining' },
  currency: 'VND',
  periodKind: 'month',
  monthStartDay: 1,
  from: null,
  to: null,
  excludedWalletIds: [],
  limits: [{ effectiveFrom: '2026-11-01', amount: 1_000_000 }],
  suggestionDismissedUntil: null,
  createdOn: '2026-11-01',
};

const transportFineDef: BudgetDef = {
  id: 'b-transport',
  name: 'Di chuyển',
  target: { kind: 'category', categoryId: 'cat-transport' },
  currency: 'VND',
  periodKind: 'month',
  monthStartDay: 1,
  from: null,
  to: null,
  excludedWalletIds: [],
  limits: [{ effectiveFrom: '2026-11-01', amount: 1_000_000 }],
  suggestionDismissedUntil: null,
  createdOn: '2026-11-01',
};

function spendRow(
  id: string,
  date: string,
  categoryId: string,
  amount: number,
): CountedSpendRow {
  return {
    id,
    kind: 'entry',
    date,
    amount,
    currency: 'VND',
    walletId: 'w-cash',
    categoryId,
    tagIds: [],
  };
}

function stubApis(budgets: BudgetDef[], rows: CountedSpendRow[]) {
  return mockApi({
    'GET /api/me': meOn,
    'GET /api/me/personal/budgets': { budgets },
    'GET /api/me/personal/budgets/progress': { today: '2026-11-26', rows },
    'GET /api/me/personal/wallets': { wallets: [cashWallet] },
    'GET /api/me/personal/categories': { categories },
    'GET /api/me/personal/tags': { tags: [] },
    'GET /api/me/personal/group-settings': {
      settings: { defaultGroupCategoryId: null, countLoans: false },
    },
    'GET /api/me/personal/list': { rows: [], totals: [], groupRows: [] },
    'GET /api/me/ledger': ledger,
    'GET /api/me/people': peopleSummary,
    'GET /api/trips/t-led': ledgerView(),
    'GET /api/trips': { trips: [] },
  });
}

function renderVi(route: string) {
  const utils = renderAt(<App />, { route, path: '*' });
  act(() => {
    setLang('vi', false);
  });
  return utils;
}

describe('budgets parent-over inheritance, over copy, and tick hint placement', () => {
  it('moves near child into over group, hides its amount & today mark, updates over meta, and keeps tick hint out of over group', async () => {
    // Ăn ngoài: 860k / 1M = 86% (near, not over); Ăn uống: 860k + 1.39M = 2.25M / 2M (over by 250k)
    // Di chuyển: 300k / 1M (fine -> onPace)
    const rows: CountedSpendRow[] = [
      spendRow('r-dining', '2026-11-15', 'cat-dining', 860_000),
      spendRow('r-food', '2026-11-16', 'cat-food', 1_390_000),
      spendRow('r-transport', '2026-11-18', 'cat-transport', 300_000),
    ];
    stubApis([foodParentDef, diningChildDef, transportFineDef], rows);
    renderVi('/budgets');

    const overGroup = await screen.findByTestId('budgets-group-over');

    // Child row is in the over group
    const childRow = within(overGroup).getByTestId('budget-row-b-dining');
    expect(within(childRow).getByTestId('budget-state-words')).toHaveTextContent('Ăn uống đã vượt');
    expect(within(childRow).queryByTestId('budget-row-amount')).not.toBeInTheDocument();
    expect(within(childRow).queryByTestId('budget-row-within')).not.toBeInTheDocument();
    expect(within(childRow).getByText(/Nên dừng đến hết kỳ/)).toBeInTheDocument();
    expect(childRow).toHaveAttribute('aria-label', 'Ăn ngoài, Ăn uống đã vượt');

    // Own-over row meta line and aria-label
    const parentRow = within(overGroup).getByTestId('budget-row-b-food');
    expect(within(parentRow).getByText(/Nên dừng đến hết kỳ · Kỳ mới từ/)).toBeInTheDocument();
    expect(parentRow.getAttribute('aria-label')).toMatch(/^Ăn uống, Vượt \d+%, vượt mức 250\.000₫$/);

    // Tick hint is NOT inside the over group; it is under the onPace group
    expect(within(overGroup).queryByTestId('budgets-tick-hint')).not.toBeInTheDocument();
    const onPaceGroup = screen.getByTestId('budgets-group-on-pace');
    expect(within(onPaceGroup).getByTestId('budgets-tick-hint')).toBeInTheDocument();
  });

  it('shows budget-parent-over linking to parent on child detail page and "Nên dừng" on own-over detail page', async () => {
    const rows: CountedSpendRow[] = [
      spendRow('r-dining', '2026-11-15', 'cat-dining', 860_000),
      spendRow('r-food', '2026-11-16', 'cat-food', 1_390_000),
    ];
    stubApis([foodParentDef, diningChildDef], rows);
    renderVi('/budgets/b-dining');

    const card = await screen.findByTestId('budget-summary-card');
    expect(within(card).getByText('Nên dừng')).toBeInTheDocument();
    expect(within(card).getByText('Ăn uống đã vượt')).toBeInTheDocument();
    expect(within(card).queryByTestId('budget-pace-amount')).not.toBeInTheDocument();

    const parentOverLink = within(card).getByTestId('budget-parent-over');
    expect(parentOverLink).toHaveAttribute('href', '/budgets/b-food');
    expect(parentOverLink).toHaveTextContent('Ăn uống (gồm cả mục này) đã vượt 250.000₫');

    // Also verify own-over detail page
    stubApis([foodParentDef, diningChildDef], rows);
    renderVi('/budgets/b-food');
    await waitFor(() => {
      const cards = screen.getAllByTestId('budget-summary-card');
      const parentCard = cards[cards.length - 1]!;
      expect(within(parentCard).getByText('Nên dừng')).toBeInTheDocument();
      expect(within(parentCard).getByTestId('budget-state-note')).toHaveTextContent(
        'Mọi khoản chi thêm đều cộng vào phần vượt.',
      );
    });
  });
});
