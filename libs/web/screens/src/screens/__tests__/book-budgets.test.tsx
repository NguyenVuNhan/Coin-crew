import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
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
import { mockMedia } from '../../test/media';
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
  { id: 'cat-shop', parentId: null, type: 'expense', name: 'Mua sắm', icon: 'shopping-bag', hidden: false, sortOrder: 0 },
  { id: 'cat-coffee', parentId: null, type: 'expense', name: 'Cà phê', icon: 'coffee', hidden: false, sortOrder: 1 },
  { id: 'cat-food', parentId: null, type: 'expense', name: 'Ăn uống', icon: 'utensils', hidden: false, sortOrder: 2 },
  { id: 'cat-transport', parentId: null, type: 'expense', name: 'Di chuyển', icon: 'car', hidden: false, sortOrder: 3 },
];

const tags: TagView[] = [];

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
  limits: [{ effectiveFrom: '2026-01-01', amount: 3_000_000 }],
  suggestionDismissedUntil: null,
  createdOn: '2026-01-01',
};

const endedDef: BudgetDef = {
  id: 'b-ended',
  name: 'Di chuyển',
  target: { kind: 'category', categoryId: 'cat-transport' },
  currency: 'VND',
  periodKind: 'once',
  monthStartDay: null,
  from: '2026-10-01',
  to: '2026-10-15',
  excludedWalletIds: [],
  limits: [{ effectiveFrom: '2026-10-01', amount: 500_000 }],
  suggestionDismissedUntil: null,
  createdOn: '2026-10-01',
};

const spendRows: CountedSpendRow[] = [
  { kind: 'entry', id: 'e-1', date: '2026-11-20', amount: 1_800_000, currency: 'VND', walletId: 'w-cash', categoryId: 'cat-shop', tagIds: [] },
  { kind: 'entry', id: 'e-2', date: '2026-11-24', amount: 220_000, currency: 'VND', walletId: 'w-cash', categoryId: 'cat-coffee', tagIds: [] },
  { kind: 'entry', id: 'e-3', date: '2026-11-15', amount: 600_000, currency: 'VND', walletId: 'w-cash', categoryId: 'cat-food', tagIds: [] },
  { kind: 'entry', id: 'e-4', date: '2026-10-10', amount: 700_000, currency: 'VND', walletId: 'w-cash', categoryId: 'cat-transport', tagIds: [] },
];

type Routes = Parameters<typeof mockApi>[0];

function mockApp(me: unknown, budgets: BudgetDef[], rows: CountedSpendRow[] = spendRows, extra: Routes = {}) {
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
    ...extra,
  });
}

describe('BookBudgets on Sổ chi tiêu', () => {
  it('shows the two most urgent active budgets in orderBudgets order with no amounts', async () => {
    mockApp(meOn, [fineDef, endedDef, fastDef, overDef]);
    renderAt(<App />, { route: '/trips' });

    const card = await screen.findByTestId('book-budgets');
    expect(within(card).getByRole('heading', { name: 'Budgets' })).toBeInTheDocument();

    const allLink = within(card).getByTestId('book-budgets-all');
    expect(allLink).toHaveAttribute('href', '/budgets');

    const rows = card.querySelectorAll('.fsl-book__budget-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute('data-testid', 'book-budget-row-b-over');
    expect(rows[1]).toHaveAttribute('data-testid', 'book-budget-row-b-fast');

    expect(within(rows[0] as HTMLElement).getByText('Mua sắm')).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByText('Over limit')).toBeInTheDocument();
    expect(rows[0]!.querySelector('.fsl-budget-bar')).toBeInTheDocument();

    expect(within(rows[1] as HTMLElement).getByText('Cà phê')).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText('Spending too fast')).toBeInTheDocument();
    expect(rows[1]!.querySelector('.fsl-budget-bar')).toBeInTheDocument();

    // Quiet overview rule: no tabular-nums money or currency symbols in the card.
    expect(card.querySelector('.tabular-nums')).toBeNull();
    expect(card.textContent).not.toMatch(/₫|\d+\.\d{3}/);

    expect(screen.queryByTestId('book-budget-row-b-fine')).not.toBeInTheDocument();
    expect(screen.queryByTestId('book-budget-row-b-ended')).not.toBeInTheDocument();
  });

  it('renders Vietnamese state words without amounts', async () => {
    mockApp(meOn, [fastDef, overDef]);
    renderAt(<App />, { route: '/trips' });
    setLang('vi');

    const card = await screen.findByTestId('book-budgets');
    expect(within(card).getByRole('heading', { name: 'Ngân sách' })).toBeInTheDocument();
    expect(within(card).getByTestId('book-budgets-all')).toHaveTextContent('Tất cả');
    expect(within(card).getByText('Đã vượt mức')).toBeInTheDocument();
    expect(within(card).getByText('Chi nhanh quá')).toBeInTheDocument();
    expect(card.textContent).not.toMatch(/₫|\d+\.\d{3}/);
  });

  it('renders in the wide layout before recent transactions', async () => {
    mockMedia({ wide: true });
    mockApp(meOn, [overDef, fastDef]);
    renderAt(<App />, { route: '/trips' });

    const card = await screen.findByTestId('book-budgets');
    const recent = await screen.findByTestId('book-recent');
    expect(
      card.compareDocumentPosition(recent) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('shows the empty state when there are no budgets', async () => {
    mockApp(meOn, []);
    renderAt(<App />, { route: '/trips' });

    const card = await screen.findByTestId('book-budgets');
    expect(within(card).getByTestId('book-budgets-empty')).toBeInTheDocument();
    const addBtn = within(card).getByTestId('book-budgets-add');
    expect(addBtn).toHaveAttribute('href', '/budgets?new=1');
  });

  it('is hidden and does not fetch budgets when the spending book switch is off', async () => {
    const { calls } = mockApp(meOff, [overDef, fastDef]);
    renderAt(<App />, { route: '/trips' });

    await screen.findByTestId('home-total');
    expect(screen.queryByTestId('book-budgets')).not.toBeInTheDocument();
    expect(calls.some((c) => c.path.startsWith('/api/me/personal/budgets'))).toBe(false);
  });
});
