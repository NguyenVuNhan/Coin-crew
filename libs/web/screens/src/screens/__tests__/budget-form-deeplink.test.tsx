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

const archivedWallet: WalletDetailView = {
  ...cashWallet,
  id: 'w-old',
  name: 'Ví cũ',
  isDefault: false,
  sortOrder: 2,
  archived: true,
  excludeFromReports: false,
};

const categories: CategoryView[] = [
  { id: 'cat-food', parentId: null, type: 'expense', name: 'Ăn uống', icon: 'utensils', hidden: false, sortOrder: 0 },
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
  excludedWalletIds: ['w-bank', 'w-old'],
  limits: [
    { effectiveFrom: '2026-09-01', amount: 2_500_000 },
    { effectiveFrom: '2026-11-01', amount: 3_000_000 },
  ],
  suggestionDismissedUntil: null,
  createdOn: '2026-09-01',
};

describe('BudgetForm deep link (?edit=1)', () => {
  it('prefills name, current limit amount, and unticked wallets on direct load of /budgets/:id?edit=1 and preserves archived excluded wallets on PATCH', async () => {
    const user = userEvent.setup();
    const api = mockApi({
      'GET /api/me': meOn,
      'GET /api/me/personal/budgets': { budgets: [foodBudget] },
      'GET /api/me/personal/budgets/progress': { rows: [] },
      'GET /api/me/personal/wallets': { wallets: [cashWallet, bankWallet, archivedWallet] },
      'GET /api/me/personal/categories': { categories },
      'GET /api/me/personal/tags': { tags },
      'GET /api/me/personal/group-settings': {
        settings: { defaultGroupCategoryId: null, countLoans: false },
      },
      'GET /api/me/personal/list': { rows: [], totals: [], groupRows: [] },
      'PATCH /api/me/personal/budgets/b-food': { budget: foodBudget },
      'GET /api/me/ledger': ledger,
      'GET /api/me/people': peopleSummary,
      'GET /api/trips/t-led': ledgerView(),
      'GET /api/trips': { trips: [] },
    });

    renderAt(<App />, { route: '/budgets/b-food?edit=1', path: '*' });
    act(() => {
      setLang('vi', false);
    });

    await screen.findByTestId('budget-form');

    expect(screen.getByTestId('budget-form-name')).toHaveValue('Ăn uống');
    expect(screen.getByTestId('budget-form-amount')).toHaveValue('3000000');

    expect(await screen.findByTestId('budget-form-wallet-check-w-cash')).toBeChecked();
    expect(screen.getByTestId('budget-form-wallet-check-w-bank')).not.toBeChecked();
    // Archived wallet is not shown in the checklist
    expect(screen.queryByTestId('budget-form-wallet-w-old')).not.toBeInTheDocument();

    // Save without touching wallets -> preserves both w-bank and archived w-old
    await user.click(screen.getByTestId('budget-form-submit'));

    await waitFor(() => {
      expect(api.calls.filter((c) => c.method === 'PATCH')).toHaveLength(1);
    });

    expect(api.calls.find((c) => c.method === 'PATCH')?.body).toEqual({
      name: 'Ăn uống',
      excludedWalletIds: ['w-bank', 'w-old'],
      today: '2026-11-26',
    });
  });
});
