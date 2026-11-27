import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
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
import {
  findChildBudgets,
  findParentBudget,
} from '../../components/budgets/budgetOverlap';

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

function makeCategoryBudget(
  id: string,
  name: string,
  categoryId: string,
  currency: 'VND' | 'USD' = 'VND',
  createdOn = '2026-11-01',
): BudgetDef {
  return {
    id,
    name,
    target: { kind: 'category', categoryId },
    currency,
    periodKind: 'month',
    monthStartDay: 1,
    from: null,
    to: null,
    excludedWalletIds: [],
    limits: [{ effectiveFrom: '2026-11-01', amount: 1_000_000 }],
    suggestionDismissedUntil: null,
    createdOn,
  };
}

function makeTagBudget(
  id: string,
  name: string,
  tagId: string,
  currency: 'VND' | 'USD' = 'VND',
): BudgetDef {
  return {
    id,
    name,
    target: { kind: 'tag', tagId },
    currency,
    periodKind: 'month',
    monthStartDay: 1,
    from: null,
    to: null,
    excludedWalletIds: [],
    limits: [{ effectiveFrom: '2026-11-01', amount: 1_000_000 }],
    suggestionDismissedUntil: null,
    createdOn: '2026-11-01',
  };
}

describe('budgetOverlap helpers', () => {
  // Hierarchy: cat-food -> cat-dining -> cat-coffee
  const parentById = new Map<string, string | null>([
    ['cat-food', null],
    ['cat-dining', 'cat-food'],
    ['cat-coffee', 'cat-dining'],
  ]);

  it('finds nearest ancestor budget including grandparent when intermediate parent has no budget', () => {
    const food = makeCategoryBudget('b-food', 'Ăn uống', 'cat-food');
    const coffee = makeCategoryBudget('b-coffee', 'Cà phê', 'cat-coffee');
    const defs = [food, coffee];

    expect(findParentBudget(coffee, defs, parentById)?.id).toBe('b-food');
    expect(findParentBudget(food, defs, parentById)).toBeNull();
    expect(findChildBudgets(food, defs, parentById).map((d) => d.id)).toEqual([
      'b-coffee',
    ]);
  });

  it('prefers direct parent over grandparent when both have budgets', () => {
    const food = makeCategoryBudget('b-food', 'Ăn uống', 'cat-food');
    const dining = makeCategoryBudget('b-dining', 'Ăn ngoài', 'cat-dining');
    const coffee = makeCategoryBudget('b-coffee', 'Cà phê', 'cat-coffee');
    const defs = [food, dining, coffee];

    expect(findParentBudget(coffee, defs, parentById)?.id).toBe('b-dining');
    expect(findParentBudget(dining, defs, parentById)?.id).toBe('b-food');
    expect(findChildBudgets(food, defs, parentById).map((d) => d.id)).toEqual([
      'b-dining',
    ]);
    expect(findChildBudgets(dining, defs, parentById).map((d) => d.id)).toEqual([
      'b-coffee',
    ]);
  });

  it('ignores budgets in a different currency', () => {
    const foodVnd = makeCategoryBudget('b-food', 'Ăn uống', 'cat-food', 'VND');
    const coffeeUsd = makeCategoryBudget('b-coffee', 'Coffee', 'cat-coffee', 'USD');
    const defs = [foodVnd, coffeeUsd];

    expect(findParentBudget(coffeeUsd, defs, parentById)).toBeNull();
    expect(findChildBudgets(foodVnd, defs, parentById)).toEqual([]);
  });

  it('ignores tag budgets', () => {
    const food = makeCategoryBudget('b-food', 'Ăn uống', 'cat-food');
    const tagB = makeTagBudget('b-tag', 'Đà Lạt', 'tag-trip');
    const defs = [food, tagB];

    expect(findParentBudget(tagB, defs, parentById)).toBeNull();
    expect(findChildBudgets(tagB, defs, parentById)).toEqual([]);
    expect(findChildBudgets(food, defs, parentById)).toEqual([]);
  });
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
  { id: 'cat-coffee', parentId: 'cat-food', type: 'expense', name: 'Cà phê', icon: 'coffee', hidden: false, sortOrder: 1 },
];

const tags: TagView[] = [];

function stubApp(budgets: BudgetDef[], rows: CountedSpendRow[]) {
  return mockApi({
    'GET /api/me': meOn,
    'GET /api/me/ledger': ledger,
    'GET /api/me/people': peopleSummary,
    'GET /api/me/people/summary': peopleSummary,
    'GET /api/trips/t-led': ledgerView(),
    'GET /api/trips/t-led/version': { version: 1 },
    'GET /api/trips': { trips: [] },
    'GET /api/me/personal/wallets': { wallets: [cashWallet] },
    'GET /api/me/personal/categories': { categories },
    'GET /api/me/personal/tags': { tags },
    'GET /api/me/personal/group-settings': {
      settings: { defaultGroupCategoryId: null, countLoans: false },
    },
    'GET /api/me/personal/transactions': { rows: [], totals: [] },
    'GET /api/me/personal/list': { rows: [], totals: [], groupRows: [] },
    'GET /api/me/personal/budgets': { budgets },
    'GET /api/me/personal/budgets/progress': { rows, today: '2026-11-26' },
  });
}

describe('overlapping budgets UI', () => {
  it('shows "trong Ăn uống" on the sub-category row in BudgetsScreen', async () => {
    const food = makeCategoryBudget('b-food', 'Ăn uống', 'cat-food');
    const coffee = makeCategoryBudget('b-coffee', 'Cà phê', 'cat-coffee');
    const rows: CountedSpendRow[] = [
      { kind: 'entry', id: 'e-1', date: '2026-11-20', amount: 200_000, currency: 'VND', walletId: 'w-cash', categoryId: 'cat-coffee', tagIds: [] },
    ];
    stubApp([food, coffee], rows);

    renderAt(<App />, { route: '/budgets' });
    act(() => {
      setLang('vi', false);
    });

    const coffeeRow = await screen.findByTestId('budget-row-b-coffee');
    expect(within(coffeeRow).getByTestId('budget-row-within')).toHaveTextContent(
      'trong Ăn uống',
    );

    const foodRow = screen.getByTestId('budget-row-b-food');
    expect(within(foodRow).queryByTestId('budget-row-within')).not.toBeInTheDocument();
  });

  it('shows child budget names on parent detail page and hides history chart when fewer than 2 periods exist', async () => {
    const food = makeCategoryBudget('b-food', 'Ăn uống', 'cat-food', 'VND', '2026-11-01');
    const coffee = makeCategoryBudget('b-coffee', 'Cà phê', 'cat-coffee', 'VND', '2026-11-01');
    stubApp([food, coffee], []);

    renderAt(<App />, { route: '/budgets/b-food' });
    act(() => {
      setLang('vi', false);
    });

    const card = await screen.findByTestId('budget-summary-card');
    expect(within(card).getByTestId('budget-includes')).toHaveTextContent(
      'Gồm cả ngân sách Cà phê',
    );
    expect(screen.queryByTestId('budget-history-chart')).not.toBeInTheDocument();
  });
});
