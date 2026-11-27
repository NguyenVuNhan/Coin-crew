import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type {
  BudgetDef,
  CategoryView,
  CountedSpendRow,
  RecurringRuleView,
  TagView,
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
  startDate: '2025-01-01',
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
  { id: 'cat-bill', parentId: null, type: 'expense', name: 'Hóa đơn', icon: 'receipt', hidden: false, sortOrder: 1 },
];

const tags: TagView[] = [];

const foodBudget: BudgetDef = {
  id: 'b-food',
  name: 'Ăn uống',
  target: { kind: 'category', categoryId: 'cat-food' },
  currency: 'VND',
  periodKind: 'month',
  monthStartDay: 1,
  from: null,
  to: null,
  excludedWalletIds: [],
  limits: [{ effectiveFrom: '2026-11-01', amount: 3_000_000 }],
  suggestionDismissedUntil: null,
  createdOn: '2026-11-01',
};

const spentRow: CountedSpendRow = {
  id: 'tx-1',
  kind: 'entry',
  date: '2026-11-10',
  amount: 900_000,
  currency: 'VND',
  walletId: 'w-cash',
  categoryId: 'cat-food',
  tagIds: [],
};

const inScopeRule: RecurringRuleView = {
  id: 'r-food-due',
  draft: {
    type: 'expense',
    walletId: 'w-cash',
    categoryId: 'cat-food',
    amount: 600_000,
    tags: [],
    note: 'Cơm trưa định kỳ',
    excludeFromReports: false,
  },
  schedule: {
    unit: 'month',
    every: 1,
    monthDay: 28,
    startDate: '2026-10-28',
    end: { kind: 'never' },
  },
  askMe: false,
  status: 'active',
  pausedReason: null,
  nextDueOn: '2026-11-28',
  lastConfirmedOn: '2026-11-01',
};

const outOfScopeRule: RecurringRuleView = {
  ...inScopeRule,
  id: 'r-bill-other',
  draft: {
    ...inScopeRule.draft,
    categoryId: 'cat-bill',
  },
};

function stubApis(rules: RecurringRuleView[], rows: CountedSpendRow[] = [spentRow]) {
  mockApi({
    'GET /api/me': meOn,
    'GET /api/me/personal/budgets': { budgets: [foodBudget] },
    'GET /api/me/personal/budgets/progress': { today: '2026-11-26', rows },
    'GET /api/me/personal/wallets': { wallets: [cashWallet] },
    'GET /api/me/personal/categories': { categories },
    'GET /api/me/personal/tags': { tags },
    'GET /api/me/personal/recurring/rules': { rules },
    'GET /api/me/personal/planned': { items: [] },
    'GET /api/me/personal/group-settings': {
      settings: { defaultGroupCategoryId: null, countLoans: false },
    },
    'GET /api/me/personal/list': { rows: [] },
    'GET /api/me/ledger': ledger,
    'GET /api/me/people': peopleSummary,
    'GET /api/trips/t-led': ledgerView(),
  });
}

describe('Budget still due', () => {
  it('shows still-due line and adjusted pace on BudgetDetailScreen while keeping state unchanged', async () => {
    stubApis([inScopeRule]);
    renderAt(<App />, { route: '/budgets/b-food' });
    setLang('vi');

    // limit = 3.000.000, spent = 900.000 => left = 2.100.000, daysLeft = 5 (Nov 26..30 inclusive)
    // stillDue = 600.000 => (2.100.000 - 600.000) / 5 = 300.000
    const stillDueLine = await screen.findByTestId('budget-still-due');
    expect(stillDueLine).toHaveTextContent('Còn 1 khoản định kỳ sắp tới · 600.000₫');
    // The detail screen shows progress as an arc; the hatched segment lives on the list rows' bars.
    expect(screen.queryByTestId('budget-bar-still-due')).not.toBeInTheDocument();

    const paceLine = screen.getByTestId('budget-pace');
    expect(paceLine).toHaveTextContent('Sau đó, mỗi ngày còn khoảng 300.000₫ (5 ngày)');

    // State label remains unchanged ("fine" -> "Đang chi đúng nhịp.")
    expect(screen.getByTestId('budget-state-note')).toHaveTextContent('Đang chi đúng nhịp.');
  });

  it('hides still-due section on BudgetDetailScreen when no rule is in scope', async () => {
    stubApis([outOfScopeRule]);
    renderAt(<App />, { route: '/budgets/b-food' });
    setLang('vi');

    await screen.findByTestId('budget-summary-card');
    expect(screen.queryByTestId('budget-still-due')).not.toBeInTheDocument();
    expect(screen.queryByTestId('budget-pace')).not.toBeInTheDocument();
    expect(screen.queryByTestId('budget-bar-still-due')).not.toBeInTheDocument();
    expect(screen.getByTestId('budget-state-note')).toHaveTextContent('Đang chi đúng nhịp.');
  });

  it('shows compact still-due line on BudgetsScreen row when count > 0 and hides it when count is 0', async () => {
    stubApis([inScopeRule]);
    const { unmount } = renderAt(<App />, { route: '/budgets' });
    setLang('vi');

    const rowLine = await screen.findByTestId('budget-row-still-due-b-food');
    expect(rowLine).toHaveTextContent('Còn 1 khoản định kỳ · 600.000₫');
    expect(screen.getByTestId('budget-bar-still-due')).toBeInTheDocument();
    unmount();

    stubApis([]);
    renderAt(<App />, { route: '/budgets' });
    setLang('vi');

    await screen.findByTestId('budget-row-b-food');
    expect(screen.queryByTestId('budget-row-still-due-b-food')).not.toBeInTheDocument();
  });
});
