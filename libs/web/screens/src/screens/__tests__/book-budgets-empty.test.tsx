import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CategoryView, TripView, WalletDetailView } from '@cc/core';
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
  entryCount: 0,
  excludeFromReports: false,
};

const categories: CategoryView[] = [
  { id: 'cat-food', parentId: null, type: 'expense', name: 'Ăn uống', icon: 'utensils', hidden: false, sortOrder: 0 },
];

function mockEmptyBudgetsApp() {
  return mockApi({
    'GET /api/me': meOn,
    'GET /api/me/ledger': ledger,
    'GET /api/me/people/summary': peopleSummary,
    'GET /api/trips/t-led': ledgerView(),
    'GET /api/trips/t-led/version': { version: 1 },
    'GET /api/me/personal/wallets': { wallets: [cashWallet] },
    'GET /api/me/personal/categories': { categories },
    'GET /api/me/personal/tags': { tags: [] },
    'GET /api/me/personal/group-settings': { settings: { defaultGroupCategoryId: null, countLoans: false } },
    'GET /api/me/personal/transactions': { rows: [], totals: [] },
    'GET /api/me/personal/budgets': { budgets: [] },
    'GET /api/me/personal/budgets/progress': { rows: [], today: '2026-11-26' },
  });
}

describe('BookBudgets empty state', () => {
  it('shows the Ngân sách card with empty line and secondary Đặt ngân sách button that opens the create sheet', async () => {
    const user = userEvent.setup();
    mockEmptyBudgetsApp();
    renderAt(<App />, { route: '/trips' });
    setLang('vi', false);

    const card = await screen.findByTestId('book-budgets');
    expect(within(card).getByRole('heading', { name: 'Ngân sách' })).toBeInTheDocument();
    expect(
      within(card).getByText('Đặt mức chi cho một danh mục để biết mỗi ngày còn chi được bao nhiêu'),
    ).toBeInTheDocument();

    const addBtn = within(card).getByTestId('book-budgets-add');
    expect(addBtn).toHaveTextContent('Đặt ngân sách');
    expect(addBtn).toHaveClass('fsl-button--secondary');
    expect(addBtn).toHaveAttribute('href', '/budgets?new=1');

    await user.click(addBtn);

    expect(await screen.findByTestId('budget-form')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/budgets');
  });
});
