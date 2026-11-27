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
  { id: 'cat-shop', parentId: null, type: 'expense', name: 'Mua sắm', icon: 'shopping-bag', hidden: false, sortOrder: 0 },
  { id: 'cat-coffee', parentId: null, type: 'expense', name: 'Cà phê', icon: 'coffee', hidden: false, sortOrder: 1 },
  { id: 'cat-transport', parentId: null, type: 'expense', name: 'Di chuyển', icon: 'car', hidden: false, sortOrder: 2 },
  { id: 'cat-food', parentId: null, type: 'expense', name: 'Ăn uống', icon: 'utensils', hidden: false, sortOrder: 3 },
];

const tags: TagView[] = [
  { id: 'tag-trip', name: 'Đà Lạt', useCount: 2 },
];

const overDef: BudgetDef = {
  id: 'b-over',
  name: 'Mua sắm',
  target: { kind: 'category', categoryId: 'cat-shop' },
  currency: 'VND',
  periodKind: 'month',
  monthStartDay: 1,
  from: null,
  to: null,
  excludedWalletIds: [],
  limits: [{ effectiveFrom: '2026-01-01', amount: 1_500_000 }],
  suggestionDismissedUntil: null,
  createdOn: '2026-01-01',
};

const fastDef: BudgetDef = {
  id: 'b-fast',
  name: 'Cà phê',
  target: { kind: 'category', categoryId: 'cat-coffee' },
  currency: 'VND',
  periodKind: 'week',
  monthStartDay: null,
  from: null,
  to: null,
  excludedWalletIds: [],
  limits: [{ effectiveFrom: '2026-11-02', amount: 300_000 }],
  suggestionDismissedUntil: null,
  createdOn: '2026-11-02',
};

const nearDef: BudgetDef = {
  id: 'b-near',
  name: 'Di chuyển',
  target: { kind: 'category', categoryId: 'cat-transport' },
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
  to: '2026-10-10',
  excludedWalletIds: [],
  limits: [{ effectiveFrom: '2026-10-01', amount: 5_000_000 }],
  suggestionDismissedUntil: null,
  createdOn: '2026-10-01',
};

function spendRow(
  id: string,
  date: string,
  categoryId: string,
  amount: number,
  tagIds: string[] = [],
): CountedSpendRow {
  return {
    id,
    kind: 'entry',
    date,
    amount,
    currency: 'VND',
    walletId: 'w-cash',
    categoryId,
    tagIds,
  };
}

function stubPersonalApis(budgets: BudgetDef[], rows: CountedSpendRow[], me = meOn) {
  mockApi({
    'GET /api/me': me,
    'GET /api/me/personal/budgets': { budgets },
    'GET /api/me/personal/budgets/progress': { today: '2026-11-26', rows },
    'GET /api/me/personal/wallets': { wallets: [cashWallet] },
    'GET /api/me/personal/categories': { categories },
    'GET /api/me/personal/tags': { tags },
    'GET /api/me/personal/group-settings': {
      settings: { defaultGroupCategoryId: null, countLoans: false },
    },
    'GET /api/me/ledger': ledger,
    'GET /api/me/people': peopleSummary,
    'GET /api/trips/t-led': ledgerView(),
    'GET /api/trips': { trips: [] },
  });
}

function renderBudgetsVi(route = '/budgets') {
  const utils = renderAt(<App />, { route, path: '*' });
  act(() => {
    setLang('vi', false);
  });
  return utils;
}

describe('BudgetsScreen', () => {
  it('renders three groups in order with counts and exact headings, over amount in text-danger, fast projected words, and icons for every state', async () => {
    const rows: CountedSpendRow[] = [
      // Over: 1.720.000 / 1.500.000 => −220.000₫ (15% over)
      spendRow('r-over', '2026-11-10', 'cat-shop', 1_720_000),
      // Fast (week 2026-11-23..29, today 26 => 4/7 elapsed): 200.000 / (4/7) = 350.000 >= 1.1 * 300.000
      spendRow('r-fast', '2026-11-24', 'cat-coffee', 200_000),
      // Near: 736.000 / 800.000 = 92% (elapsed 26/30 = 86.7%, 92/86.7 = 1.06 < 1.1 => near)
      spendRow('r-near', '2026-11-15', 'cat-transport', 736_000),
      // Fine: 2.130.000 / 3.000.000 = 71%
      spendRow('r-fine', '2026-11-15', 'cat-food', 2_130_000),
    ];

    stubPersonalApis([fineDef, nearDef, fastDef, overDef], rows);
    renderBudgetsVi('/budgets');

    await waitFor(() => {
      expect(screen.getByTestId('budgets-group-over')).toBeInTheDocument();
    });

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      'Đã vượt mức · 1',
      'Đang chi nhanh quá · 1',
      'Trong mức · 2',
    ]);

    // Over row: −220.000₫ in text-danger, the next-period line, links to /budgets/b-over, class fsl-budget-row
    const overRow = screen.getByTestId('budget-row-b-over');
    expect(overRow).toHaveClass('fsl-budget-row');
    expect(overRow).toHaveAttribute('href', '/budgets/b-over');
    const overAmount = within(overRow).getByText('−220.000₫');
    expect(overAmount).toHaveClass('text-danger');
    expect(within(overRow).getByText(/Kỳ mới từ/)).toBeInTheDocument();

    // Fast row: projected words
    const fastRow = screen.getByTestId('budget-row-b-fast');
    expect(fastRow).toHaveAttribute('href', '/budgets/b-fast');
    expect(within(fastRow).getByText(/Sẽ vượt khoảng/)).toBeInTheDocument();

    // Every state (over, fast, near, fine) has state words and an icon (not colour alone)
    for (const id of ['b-over', 'b-fast', 'b-near', 'b-fine']) {
      const row = screen.getByTestId(`budget-row-${id}`);
      const stateEl = within(row).getByTestId('budget-state-words');
      expect(stateEl.textContent?.trim().length).toBeGreaterThan(0);
      expect(stateEl.querySelector('svg')).not.toBeNull();
    }
  });

  it('omits groups that have no budgets', async () => {
    const rows: CountedSpendRow[] = [
      spendRow('r-fine', '2026-11-15', 'cat-food', 1_000_000),
    ];
    stubPersonalApis([fineDef], rows);
    renderBudgetsVi('/budgets');

    await waitFor(() => {
      expect(screen.getByTestId('budgets-group-on-pace')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('budgets-group-over')).not.toBeInTheDocument();
    expect(screen.queryByTestId('budgets-group-fast')).not.toBeInTheDocument();
    expect(screen.queryByTestId('budgets-group-ended')).not.toBeInTheDocument();
  });

  it('places ended budgets in a collapsed "Đã kết thúc" list that expands on click', async () => {
    const user = userEvent.setup();
    const rows: CountedSpendRow[] = [
      spendRow('r-fine', '2026-11-15', 'cat-food', 1_000_000),
      spendRow('r-trip', '2026-10-05', 'cat-food', 4_200_000, ['tag-trip']),
    ];
    stubPersonalApis([fineDef, endedDef], rows);
    renderBudgetsVi('/budgets');

    await waitFor(() => {
      expect(screen.getByTestId('budgets-group-ended')).toBeInTheDocument();
    });

    const toggle = screen.getByTestId('budgets-ended-toggle');
    expect(toggle).toHaveTextContent('Đã kết thúc');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('budget-row-b-ended')).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('budget-row-b-ended')).toBeInTheDocument();
  });

  it('shows data-testid="budget-suggest-mark" on a row with a pending suggestion (B12)', async () => {
    // 6 completed months (May..Oct 2026) all over 1_500_000 for b-over
    const rows: CountedSpendRow[] = [
      spendRow('m5', '2026-05-10', 'cat-shop', 1_800_000),
      spendRow('m6', '2026-06-10', 'cat-shop', 1_900_000),
      spendRow('m7', '2026-07-10', 'cat-shop', 1_850_000),
      spendRow('m8', '2026-08-10', 'cat-shop', 1_950_000),
      spendRow('m9', '2026-09-10', 'cat-shop', 2_000_000),
      spendRow('m10', '2026-10-10', 'cat-shop', 1_900_000),
      spendRow('m11', '2026-11-10', 'cat-shop', 1_720_000),
      spendRow('f11', '2026-11-15', 'cat-food', 1_000_000),
    ];

    stubPersonalApis([overDef, fineDef], rows);
    renderBudgetsVi('/budgets');

    await waitFor(() => {
      expect(screen.getByTestId('budget-row-b-over')).toBeInTheDocument();
    });

    const overRow = screen.getByTestId('budget-row-b-over');
    expect(within(overRow).getByTestId('budget-suggest-mark')).toBeInTheDocument();

    const fineRow = screen.getByTestId('budget-row-b-fine');
    expect(within(fineRow).queryByTestId('budget-suggest-mark')).not.toBeInTheDocument();
  });

  it('renders empty state with "Đặt ngân sách" when there are no budgets and navigates to /budgets?new=1', async () => {
    const user = userEvent.setup();
    stubPersonalApis([], []);
    renderBudgetsVi('/budgets');

    const cta = await screen.findByTestId('budgets-empty-add');
    expect(cta).toHaveTextContent('Đặt ngân sách');
    expect(cta).toHaveAttribute('href', '/budgets?new=1');

    const headerAdd = screen.getByTestId('budgets-add-button');
    expect(headerAdd).toHaveAttribute('href', '/budgets?new=1');

    await user.click(cta);
    expect(screen.getByTestId('location')).toHaveTextContent('/budgets');
  });

  it('is not reachable when personalArea is switched off (PersonalRoute)', async () => {
    stubPersonalApis([fineDef], [], meOff);
    renderBudgetsVi('/budgets');

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/trips');
    });
    expect(screen.queryByTestId('budget-row-b-fine')).not.toBeInTheDocument();
  });
});
