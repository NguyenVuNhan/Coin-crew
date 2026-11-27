import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  entryCount: 20,
  excludeFromReports: false,
};

const categories: CategoryView[] = [
  { id: 'cat-food', parentId: null, type: 'expense', name: 'Ăn uống', icon: 'utensils', hidden: false, sortOrder: 0 },
];

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
  limits: [{ effectiveFrom: '2026-10-01', amount: 3_000_000 }],
  suggestionDismissedUntil: null,
  createdOn: '2026-10-15',
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

function stubApis(opts: { budgets: BudgetDef[]; rows: CountedSpendRow[] }) {
  return mockApi({
    'GET /api/me': meOn,
    'GET /api/me/personal/budgets': { budgets: opts.budgets },
    'GET /api/me/personal/budgets/progress': { rows: opts.rows },
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

function renderDetailVi(route: string) {
  const utils = renderAt(<App />, { route, path: '*' });
  act(() => {
    setLang('vi', false);
  });
  return utils;
}

describe('BudgetDetailScreen hero summary card', () => {
  it('shows per-day pace in budget-pace-amount, remaining in budget-remaining-amount, and today tick when fine', async () => {
    const rows: CountedSpendRow[] = [
      spendRow('e-nov-1', '2026-11-10', 'cat-food', 1_130_000),
      spendRow('e-nov-2', '2026-11-20', 'cat-food', 1_000_000),
    ];
    stubApis({ budgets: [foodBudget], rows });
    renderDetailVi('/budgets/b-food');

    const card = await screen.findByTestId('budget-summary-card');
    expect(within(card).getByText('mỗi ngày còn')).toBeInTheDocument();
    expect(within(card).getByTestId('budget-pace-amount')).toHaveTextContent('174.000₫');
    expect(within(card).getByText('còn 5 ngày')).toBeInTheDocument();
    expect(within(card).getByTestId('budget-remaining-amount')).toHaveTextContent('870.000₫');
    expect(within(card).getByTestId('budget-state-note')).toHaveTextContent('Đang chi đúng nhịp.');
    expect(card.querySelector('svg.fsl-budget-arc line.stroke-foreground')).not.toBeNull();
  });

  it('shows "Kỳ mới từ" in arc centre and "−" overage in budget-remaining-amount when over', async () => {
    const rows: CountedSpendRow[] = [
      spendRow('e-nov-over', '2026-11-15', 'cat-food', 3_450_000),
    ];
    stubApis({ budgets: [foodBudget], rows });
    renderDetailVi('/budgets/b-food');

    const card = await screen.findByTestId('budget-summary-card');
    expect(within(card).getByText('Kỳ mới từ 1/12')).toBeInTheDocument();
    expect(within(card).queryByTestId('budget-pace-amount')).toBeNull();
    expect(within(card).getByTestId('budget-remaining-amount')).toHaveTextContent('−450.000₫');
    expect(within(card).getByTestId('budget-state-note')).toHaveTextContent('Mọi khoản chi thêm đều cộng vào phần vượt.');
  });

  it('shows "Còn dư" when past period is under limit and no pace or today tick', async () => {
    const user = userEvent.setup();
    const rows: CountedSpendRow[] = [
      spendRow('e-oct-1', '2026-10-18', 'cat-food', 2_100_000),
      spendRow('e-nov-1', '2026-11-10', 'cat-food', 500_000),
    ];
    stubApis({ budgets: [foodBudget], rows });
    renderDetailVi('/budgets/b-food');

    await screen.findByTestId('budget-summary-card');
    await user.click(screen.getByTestId('budget-prev-period'));

    const card = screen.getByTestId('budget-summary-card');
    expect(within(card).getByText('Còn dư')).toBeInTheDocument();
    expect(within(card).getAllByText('900.000₫').length).toBeGreaterThanOrEqual(1);
    expect(within(card).queryByTestId('budget-pace-amount')).toBeNull();
    expect(within(card).queryByText(/mỗi ngày còn|mỗi tháng còn/)).toBeNull();
    expect(card.querySelector('svg.fsl-budget-arc line.stroke-foreground')).toBeNull();
  });

  it('shows "Vượt" when past period is over limit and no pace', async () => {
    const user = userEvent.setup();
    const rows: CountedSpendRow[] = [
      spendRow('e-oct-1', '2026-10-18', 'cat-food', 3_240_000),
      spendRow('e-nov-1', '2026-11-10', 'cat-food', 500_000),
    ];
    stubApis({ budgets: [foodBudget], rows });
    renderDetailVi('/budgets/b-food');

    await screen.findByTestId('budget-summary-card');
    await user.click(screen.getByTestId('budget-prev-period'));

    const card = screen.getByTestId('budget-summary-card');
    expect(within(card).getAllByText('Vượt').length).toBeGreaterThanOrEqual(1);
    expect(within(card).getByText('240.000₫')).toBeInTheDocument();
    expect(within(card).getByTestId('budget-remaining-amount')).toHaveTextContent('−240.000₫');
    expect(within(card).queryByTestId('budget-pace-amount')).toBeNull();
  });
});
