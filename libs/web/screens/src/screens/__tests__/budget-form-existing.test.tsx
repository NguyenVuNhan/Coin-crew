import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  BudgetDef,
  CategoryView,
  TagView,
  TripView,
  WalletDetailView,
} from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { renderAt, mockApi } from '../../test/render';
import { tripView } from '../../test/fixtures';
import { App } from '../../App';

const txCopyState: {
  status: 'opening' | 'ready' | 'unavailable';
  snapshot: { entries: unknown[] } | null;
} = {
  status: 'ready',
  snapshot: { entries: [] },
};

const groupCopyState: {
  status: 'ready' | 'unavailable';
  snapshot: { rows: unknown[] } | null;
} = {
  status: 'ready',
  snapshot: { rows: [] },
};

vi.mock('@cc/web-util/localDate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cc/web-util/localDate')>();
  return {
    ...actual,
    todayLocal: () => '2026-11-26',
  };
});

vi.mock('@cc/web-data-access/txCopy/hooks', () => ({
  useTxCopy: () => txCopyState,
}));

vi.mock('@cc/web-data-access/txCopy/groupCopy', () => ({
  useGroupCopy: () => groupCopyState,
}));

beforeEach(() => {
  localStorage.clear();
  txCopyState.status = 'ready';
  txCopyState.snapshot = { entries: [] };
  groupCopyState.status = 'ready';
  groupCopyState.snapshot = { rows: [] };
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
  { id: 'cat-shop', parentId: null, type: 'expense', name: 'Mua sắm', icon: 'shopping-bag', hidden: false, sortOrder: 1 },
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
  limits: [{ effectiveFrom: '2026-11-01', amount: 800_000 }],
  suggestionDismissedUntil: null,
  createdOn: '2026-11-01',
};

function stubApis(budgets: BudgetDef[]) {
  return mockApi({
    'GET /api/me': meOn,
    'GET /api/me/personal/budgets': { budgets },
    'GET /api/me/personal/budgets/progress': { rows: [] },
    'GET /api/me/personal/wallets': { wallets: [cashWallet] },
    'GET /api/me/personal/categories': { categories },
    'GET /api/me/personal/tags': { tags },
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

describe('BudgetForm existing budget mark, missing hint, edit amount, and defaults line', () => {
  it('marks existing category in grid, shows view-existing block with Lưu disabled, shows missing-target hint, and ends defaults line with "mọi ví VND"', async () => {
    const user = userEvent.setup();
    stubApis([foodBudget]);

    renderVi('/budgets?new=1');
    await screen.findByTestId('budget-form');

    // Defaults line ends with "mọi ví VND"
    expect(screen.getByTestId('budget-form-defaults').textContent).toMatch(/mọi ví VND$/);

    // With nothing picked, Lưu is disabled and missing hint says pick category or tag
    expect(screen.getByTestId('budget-form-submit')).toBeDisabled();
    expect(screen.getByTestId('budget-form-missing')).toHaveTextContent(
      'Chọn danh mục hoặc thẻ để lưu.',
    );

    // Category tile for Ăn uống shows "Đã có"
    const foodTile = screen.getByTestId('category-tile-cat-food');
    expect(foodTile).toHaveTextContent('Đã có');

    // Category tile for Mua sắm does not show "Đã có"
    const shopTile = screen.getByTestId('category-tile-cat-shop');
    expect(shopTile).not.toHaveTextContent('Đã có');

    // Picking Mua sắm switches missing hint to missing amount
    await user.click(shopTile);
    expect(screen.queryByTestId('budget-form-existing')).not.toBeInTheDocument();
    expect(screen.getByTestId('budget-form-missing')).toHaveTextContent(
      'Nhập mức ngân sách để lưu.',
    );

    // Picking Ăn uống shows budget-form-existing with link to /budgets/b-food and Lưu disabled
    await user.click(foodTile);
    const existingBlock = screen.getByTestId('budget-form-existing');
    expect(existingBlock).toHaveTextContent('Ăn uống đã có ngân sách với chu kỳ này.');
    const viewLink = screen.getByTestId('budget-form-view-existing');
    expect(viewLink).toHaveTextContent('Xem ngân sách');
    expect(viewLink).toHaveAttribute('href', '/budgets/b-food');
    expect(screen.getByTestId('budget-form-submit')).toBeDisabled();
    expect(screen.queryByTestId('budget-form-missing')).not.toBeInTheDocument();

    // Clicking Xem ngân sách closes the sheet and navigates to /budgets/b-food
    await user.click(viewLink);
    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/budgets/b-food');
    });
    expect(screen.queryByTestId('budget-form')).not.toBeInTheDocument();
  });

  it('pre-fills formatted "800.000" for an 800000 VND limit in edit mode and shows no missing hint', async () => {
    stubApis([foodBudget]);

    renderVi('/budgets/b-food?edit=1');
    await screen.findByTestId('budget-form');

    expect(screen.getByTestId('budget-form-amount')).toHaveValue('800.000');
    expect(screen.queryByTestId('budget-form-missing')).not.toBeInTheDocument();
  });
});
