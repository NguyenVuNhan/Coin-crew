import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  BudgetDef,
  CategoryView,
  CountedSpendRow,
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
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: 5_000_000,
  icon: 'wallet',
  sortOrder: 0,
  archived: false,
  entryCount: 10,
  excludeFromReports: false,
};

const bankWallet: WalletDetailView = {
  ...cashWallet,
  id: 'w-bank',
  name: 'Vietcombank',
  isDefault: false,
  sortOrder: 1,
  excludeFromReports: false,
};

const excludedVndWallet: WalletDetailView = {
  ...cashWallet,
  id: 'w-stash',
  name: 'Quỹ riêng',
  isDefault: false,
  sortOrder: 2,
  excludeFromReports: true,
};

const usdWallet: WalletDetailView = {
  ...cashWallet,
  id: 'w-usd',
  name: 'USD Card',
  currency: 'USD',
  balance: 50_000,
  isDefault: false,
  sortOrder: 3,
  excludeFromReports: false,
};

const usdExcludedWallet: WalletDetailView = {
  ...usdWallet,
  id: 'w-usd-ex',
  name: 'USD Savings',
  sortOrder: 4,
  excludeFromReports: true,
};

const categories: CategoryView[] = [
  { id: 'cat-food', parentId: null, type: 'expense', name: 'Ăn uống', icon: 'utensils', hidden: false, sortOrder: 0 },
  { id: 'cat-coffee', parentId: 'cat-food', type: 'expense', name: 'Cà phê', icon: 'coffee', hidden: false, sortOrder: 1 },
  { id: 'cat-shop', parentId: null, type: 'expense', name: 'Mua sắm', icon: 'shopping-bag', hidden: false, sortOrder: 2 },
  { id: 'cat-salary', parentId: null, type: 'income', name: 'Lương', icon: 'coins', hidden: false, sortOrder: 0 },
];

const tags: TagView[] = [
  { id: 'tag-trip', name: 'Đà Lạt', useCount: 3 },
  { id: 'tag-tet', name: 'Tết 2027', useCount: 1 },
];

const existingFoodBudget: BudgetDef = {
  id: 'b-food',
  name: 'Ăn uống',
  target: { kind: 'category', categoryId: 'cat-food' },
  currency: 'VND',
  periodKind: 'month',
  monthStartDay: 1,
  from: null,
  to: null,
  excludedWalletIds: ['w-stash'],
  limits: [
    { effectiveFrom: '2026-09-01', amount: 2_500_000 },
    { effectiveFrom: '2026-11-01', amount: 3_000_000 },
  ],
  suggestionDismissedUntil: null,
  createdOn: '2026-09-01',
};

function stubApis(opts: {
  budgets?: BudgetDef[];
  wallets?: WalletDetailView[];
  rows?: CountedSpendRow[];
  extraRoutes?: Record<string, unknown>;
} = {}) {
  const {
    budgets = [],
    wallets = [cashWallet, bankWallet, excludedVndWallet],
    rows = [],
    extraRoutes = {},
  } = opts;
  return mockApi({
    'GET /api/me': meOn,
    'GET /api/me/personal/budgets': { budgets },
    'GET /api/me/personal/budgets/progress': { rows },
    'GET /api/me/personal/wallets': { wallets },
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
    ...extraRoutes,
  });
}

function renderVi(route: string) {
  const utils = renderAt(<App />, { route, path: '*' });
  act(() => {
    setLang('vi', false);
  });
  return utils;
}

describe('BudgetForm', () => {
  it('creates a monthly category budget with exact CreateBudgetInput, defaults name to category, hides currency with one currency, unticks excludeFromReports wallets, and navigates to the new budget', async () => {
    const user = userEvent.setup();
    const createdBudget: BudgetDef = {
      id: 'b-new-1',
      name: 'Ăn uống',
      target: { kind: 'category', categoryId: 'cat-food' },
      currency: 'VND',
      periodKind: 'month',
      monthStartDay: 1,
      from: null,
      to: null,
      excludedWalletIds: ['w-stash'],
      limits: [{ effectiveFrom: '2026-11-01', amount: 3_000_000 }],
      suggestionDismissedUntil: null,
      createdOn: '2026-11-26',
    };

    const api = stubApis({
      budgets: [],
      wallets: [cashWallet, bankWallet, excludedVndWallet],
      extraRoutes: {
        'POST /api/me/personal/budgets': () =>
          Response.json({ budget: createdBudget }, { status: 201 }),
      },
    });

    renderVi('/budgets');
    const emptyAdd = await screen.findByTestId('budgets-empty-add');
    await user.click(emptyAdd);

    const form = await screen.findByTestId('budget-form');

    // Currency is hidden when user only has one currency (VND)
    expect(screen.queryByTestId('budget-form-currency')).not.toBeInTheDocument();

    // Wallets of VND: cash & bank ticked, excludeFromReports wallet unticked
    expect(screen.getByTestId('budget-form-wallet-check-w-cash')).toBeChecked();
    expect(screen.getByTestId('budget-form-wallet-check-w-bank')).toBeChecked();
    expect(screen.getByTestId('budget-form-wallet-check-w-stash')).not.toBeChecked();

    // Monthly start day defaults to 1
    expect(screen.getByTestId('budget-form-month-start-day')).toHaveValue(1);

    // Pick expense category "Ăn uống" -> name defaults to "Ăn uống"
    await user.click(screen.getByTestId('category-tile-cat-food'));
    expect(screen.getByTestId('budget-form-name')).toHaveValue('Ăn uống');

    // Amount parsed with parseMoney ("3tr" -> 3_000_000)
    const amountInput = screen.getByTestId('budget-form-amount');
    await user.type(amountInput, '3tr');
    expect(screen.getByTestId('budget-form-amount-preview')).toHaveTextContent('3.000.000₫');

    // Verify fields are text-base and buttons are min-h-11
    expect(amountInput).toHaveClass('text-base');
    expect(screen.getByTestId('budget-form-name')).toHaveClass('text-base');
    expect(screen.getByTestId('budget-form-month-start-day')).toHaveClass('text-base');
    const submitBtn = screen.getByTestId('budget-form-submit');
    expect(submitBtn).toHaveClass('min-h-11');
    expect(within(form).getByTestId('budget-form-target-category')).toHaveClass('min-h-11');

    await user.click(submitBtn);

    await waitFor(() => {
      expect(api.calls.filter((c) => c.method === 'POST')).toHaveLength(1);
    });

    expect(api.calls.find((c) => c.method === 'POST')?.body).toEqual({
      name: 'Ăn uống',
      target: { kind: 'category', categoryId: 'cat-food' },
      currency: 'VND',
      amount: 3_000_000,
      periodKind: 'month',
      monthStartDay: 1,
      excludedWalletIds: ['w-stash'],
      today: '2026-11-26',
    });

    // Navigates to the newly created budget page
    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/budgets/b-new-1');
    });
  });

  it('creates a one-time tag budget and enforces from <= to', async () => {
    const user = userEvent.setup();
    const createdTagBudget: BudgetDef = {
      id: 'b-tag-1',
      name: 'Đà Lạt',
      target: { kind: 'tag', tagId: 'tag-trip' },
      currency: 'VND',
      periodKind: 'once',
      monthStartDay: null,
      from: '2026-12-01',
      to: '2026-12-05',
      excludedWalletIds: ['w-stash'],
      limits: [{ effectiveFrom: '2026-12-01', amount: 5_000_000 }],
      suggestionDismissedUntil: null,
      createdOn: '2026-11-26',
    };

    const api = stubApis({
      budgets: [],
      wallets: [cashWallet, excludedVndWallet],
      extraRoutes: {
        'POST /api/me/personal/budgets': () =>
          Response.json({ budget: createdTagBudget }, { status: 201 }),
      },
    });

    renderVi('/budgets?new=1');
    await screen.findByTestId('budget-form');

    // Switch to Tag target and pick "Đà Lạt"
    await user.click(screen.getByTestId('budget-form-target-tag'));
    await user.click(screen.getByTestId('budget-form-tag-tag-trip'));
    expect(screen.getByTestId('budget-form-name')).toHaveValue('Đà Lạt');

    // Enter amount
    await user.type(screen.getByTestId('budget-form-amount'), '5.000.000');

    // Switch period to One-time ("Một lần")
    await user.click(screen.getByTestId('budget-form-period-once'));

    const fromInput = screen.getByTestId('budget-form-from');
    const toInput = screen.getByTestId('budget-form-to');
    expect(fromInput).toHaveClass('text-base');
    expect(toInput).toHaveClass('text-base');

    // Invalid range: from > to disables submit and shows error
    fireEvent.change(fromInput, { target: { value: '2026-12-10' } });
    fireEvent.change(toInput, { target: { value: '2026-12-05' } });
    expect(screen.getByTestId('budget-form-range-error')).toBeInTheDocument();
    expect(screen.getByTestId('budget-form-submit')).toBeDisabled();

    // Valid range: from <= to
    fireEvent.change(fromInput, { target: { value: '2026-12-01' } });
    expect(screen.queryByTestId('budget-form-range-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('budget-form-submit')).not.toBeDisabled();

    await user.click(screen.getByTestId('budget-form-submit'));

    await waitFor(() => {
      expect(api.calls.filter((c) => c.method === 'POST')).toHaveLength(1);
    });

    expect(api.calls.find((c) => c.method === 'POST')?.body).toEqual({
      name: 'Đà Lạt',
      target: { kind: 'tag', tagId: 'tag-trip' },
      currency: 'VND',
      amount: 5_000_000,
      periodKind: 'once',
      from: '2026-12-01',
      to: '2026-12-05',
      excludedWalletIds: ['w-stash'],
      today: '2026-11-26',
    });

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/budgets/b-tag-1');
    });
  });

  it('shows currency picker when user has multiple currencies and updates wallets and parseMoney on currency switch', async () => {
    const user = userEvent.setup();
    const createdUsd: BudgetDef = {
      id: 'b-usd-1',
      name: 'Mua sắm',
      target: { kind: 'category', categoryId: 'cat-shop' },
      currency: 'USD',
      periodKind: 'month',
      monthStartDay: 25,
      from: null,
      to: null,
      excludedWalletIds: ['w-usd-ex'],
      limits: [{ effectiveFrom: '2026-11-25', amount: 12_050 }],
      suggestionDismissedUntil: null,
      createdOn: '2026-11-26',
    };

    const api = stubApis({
      budgets: [],
      wallets: [cashWallet, usdWallet, usdExcludedWallet],
      extraRoutes: {
        'POST /api/me/personal/budgets': () =>
          Response.json({ budget: createdUsd }, { status: 201 }),
      },
    });

    renderVi('/budgets?new=1');
    await screen.findByTestId('budget-form');

    // Currency picker is shown and defaults to VND
    expect(await screen.findByTestId('budget-form-currency')).toBeInTheDocument();
    expect(screen.getByTestId('budget-form-currency-VND')).toHaveAttribute('aria-pressed', 'true');

    // Switch to USD
    await user.click(screen.getByTestId('budget-form-currency-USD'));
    expect(screen.getByTestId('budget-form-wallet-check-w-usd')).toBeChecked();
    expect(screen.getByTestId('budget-form-wallet-check-w-usd-ex')).not.toBeChecked();
    expect(screen.queryByTestId('budget-form-wallet-w-cash')).not.toBeInTheDocument();

    // Pick category, amount in USD, custom monthStartDay = 25
    await user.click(screen.getByTestId('category-tile-cat-shop'));
    await user.type(screen.getByTestId('budget-form-amount'), '120.50');
    const startDayInput = screen.getByTestId('budget-form-month-start-day');
    await user.clear(startDayInput);
    await user.type(startDayInput, '25');

    await user.click(screen.getByTestId('budget-form-submit'));

    await waitFor(() => {
      expect(api.calls.filter((c) => c.method === 'POST')).toHaveLength(1);
    });

    expect(api.calls.find((c) => c.method === 'POST')?.body).toEqual({
      name: 'Mua sắm',
      target: { kind: 'category', categoryId: 'cat-shop' },
      currency: 'USD',
      amount: 12_050,
      periodKind: 'month',
      monthStartDay: 25,
      excludedWalletIds: ['w-usd-ex'],
      today: '2026-11-26',
    });
  });

  it('edit mode shows only name, amount, and wallets, and PATCHes updates', async () => {
    const user = userEvent.setup();
    const api = stubApis({
      budgets: [existingFoodBudget],
      wallets: [cashWallet, bankWallet, excludedVndWallet],
      extraRoutes: {
        'PATCH /api/me/personal/budgets/b-food': {
          budget: { ...existingFoodBudget, name: 'Ăn uống tháng' },
        },
      },
    });

    renderVi('/budgets/b-food');
    const editBtn = await screen.findByTestId('budget-edit-button');
    await user.click(editBtn);

    await screen.findByTestId('budget-form');

    // Only name, amount, wallets are shown; target, currency, period are absent
    expect(screen.getByTestId('budget-form-name')).toHaveValue('Ăn uống');
    expect(screen.getByTestId('budget-form-amount')).toHaveValue('3000000');
    expect(screen.getByTestId('budget-form-wallets')).toBeInTheDocument();
    expect(screen.queryByTestId('budget-form-target-category')).not.toBeInTheDocument();
    expect(screen.queryByTestId('budget-form-currency')).not.toBeInTheDocument();
    expect(screen.queryByTestId('budget-form-period')).not.toBeInTheDocument();

    // Wallets reflect existing excludedWalletIds
    expect(screen.getByTestId('budget-form-wallet-check-w-cash')).toBeChecked();
    expect(screen.getByTestId('budget-form-wallet-check-w-bank')).toBeChecked();
    expect(screen.getByTestId('budget-form-wallet-check-w-stash')).not.toBeChecked();

    // Edit name, amount, untick w-bank
    const nameInput = screen.getByTestId('budget-form-name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Ăn uống tháng');

    const amountInput = screen.getByTestId('budget-form-amount');
    await user.clear(amountInput);
    await user.type(amountInput, '3,5tr');

    await user.click(screen.getByTestId('budget-form-wallet-check-w-bank'));

    await user.click(screen.getByTestId('budget-form-submit'));

    await waitFor(() => {
      expect(api.calls.filter((c) => c.method === 'PATCH')).toHaveLength(1);
    });

    expect(api.calls.find((c) => c.method === 'PATCH')?.body).toEqual({
      name: 'Ăn uống tháng',
      amount: 3_500_000,
      excludedWalletIds: ['w-stash', 'w-bank'],
      today: '2026-11-26',
    });

    // Closes the sheet after saving
    await waitFor(() => {
      expect(screen.queryByTestId('budget-form')).not.toBeInTheDocument();
    });
  });

  it('remove asks in a confirm sheet, then DELETEs and returns to /budgets', async () => {
    const user = userEvent.setup();
    const api = stubApis({
      budgets: [existingFoodBudget],
      wallets: [cashWallet, bankWallet, excludedVndWallet],
      extraRoutes: {
        'DELETE /api/me/personal/budgets/b-food': { ok: true },
      },
    });

    renderVi('/budgets/b-food?edit=1');
    await screen.findByTestId('budget-form');

    const removeBtn = screen.getByTestId('budget-form-remove');
    expect(removeBtn).toHaveClass('text-danger');
    expect(removeBtn).toHaveClass('min-h-11');
    await user.click(removeBtn);

    const confirmSheet = await screen.findByTestId('budget-remove-confirm-sheet');
    expect(confirmSheet).toBeInTheDocument();
    expect(within(confirmSheet).getByText(/Xóa ngân sách này/)).toBeInTheDocument();

    await user.click(screen.getByTestId('budget-form-remove-confirm'));

    await waitFor(() => {
      expect(api.calls.filter((c) => c.method === 'DELETE')).toHaveLength(1);
    });
    expect(api.calls.find((c) => c.method === 'DELETE')?.path).toBe(
      '/api/me/personal/budgets/b-food',
    );

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/budgets');
    });
  });

  it('409 DUPLICATE shows an inline error naming the duplicate', async () => {
    const user = userEvent.setup();
    stubApis({
      budgets: [existingFoodBudget],
      wallets: [cashWallet],
      extraRoutes: {
        'POST /api/me/personal/budgets': () =>
          Response.json(
            {
              error: {
                code: 'DUPLICATE',
                message: 'A budget for this target and period already exists.',
              },
            },
            { status: 409 },
          ),
      },
    });

    renderVi('/budgets?new=1');
    await screen.findByTestId('budget-form');

    await user.click(await screen.findByTestId('category-tile-cat-food'));
    await user.type(screen.getByTestId('budget-form-amount'), '2tr');
    await user.click(screen.getByTestId('budget-form-submit'));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Ăn uống/);
  });
});
