import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
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

const categories: CategoryView[] = [
  { id: 'cat-food', parentId: null, type: 'expense', name: 'Ăn uống', icon: 'utensils', hidden: false, sortOrder: 0 },
];

const tags: TagView[] = [
  { id: 'tag-trip', name: 'Đà Lạt', useCount: 1 },
];

const fineDef: BudgetDef = {
  id: 'b-fine',
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

const endedDef: BudgetDef = {
  id: 'b-ended',
  name: 'Chuyến Đà Lạt',
  target: { kind: 'tag', tagId: 'tag-trip' },
  currency: 'VND',
  periodKind: 'once',
  monthStartDay: null,
  from: '2026-10-01',
  to: '2026-10-15',
  excludedWalletIds: [],
  limits: [{ effectiveFrom: '2026-10-01', amount: 2_000_000 }],
  suggestionDismissedUntil: null,
  createdOn: '2026-10-01',
};

function stubBudgetsApi(budgets: BudgetDef[], rows: CountedSpendRow[] = []) {
  mockApi({
    'GET /api/me': meOn,
    'GET /api/me/personal/budgets': { budgets },
    'GET /api/me/personal/budgets/progress': { today: '2026-11-26', rows },
    'GET /api/me/personal/wallets': { wallets: [cashWallet] },
    'GET /api/me/personal/categories': { categories },
    'GET /api/me/personal/tags': { tags },
    'GET /api/me/personal/group-settings': { settings: { defaultGroupCategoryId: null, countLoans: false } },
    'GET /api/me/ledger': ledger,
    'GET /api/me/people': peopleSummary,
    'GET /api/trips/t-led': ledgerView(),
    'GET /api/trips': { trips: [] },
  });
}

function renderBudgetsVi() {
  const utils = renderAt(<App />, { route: '/budgets', path: '*' });
  act(() => {
    setLang('vi', false);
  });
  return utils;
}

describe('BudgetsScreen today-mark hint', () => {
  it('shows under the first visible group, dismisses and persists to localStorage, and stays hidden on re-render', async () => {
    stubBudgetsApi([fineDef]);
    const user = userEvent.setup();

    const first = renderBudgetsVi();

    const onPaceGroup = await screen.findByTestId('budgets-group-on-pace');
    const hint = within(onPaceGroup).getByTestId('budgets-tick-hint');
    expect(hint).toHaveTextContent(
      'Vạch đen là hôm nay. Thanh dài quá vạch là "Chi nhanh quá"; đã dùng từ 85% mức là "Sắp chạm mức".',
    );

    await user.click(within(hint).getByTestId('budgets-tick-hint-dismiss'));

    await waitFor(() => {
      expect(screen.queryByTestId('budgets-tick-hint')).not.toBeInTheDocument();
    });
    expect(localStorage.getItem('cc.budgets.tickHintSeen')).toBe('1');

    first.unmount();

    renderBudgetsVi();
    await screen.findByTestId('budgets-group-on-pace');
    expect(screen.queryByTestId('budgets-tick-hint')).not.toBeInTheDocument();
  });

  it('does not show when only ended budgets are listed', async () => {
    stubBudgetsApi([endedDef]);
    renderBudgetsVi();

    await screen.findByTestId('budgets-group-ended');
    expect(screen.queryByTestId('budgets-tick-hint')).not.toBeInTheDocument();
  });
});
