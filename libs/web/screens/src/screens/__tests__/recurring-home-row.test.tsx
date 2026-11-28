import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import type {
  PlannedItemView,
  RecurringRuleView,
  TripView,
  WalletDetailView,
} from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { renderAt, mockApi } from '../../test/render';
import { tripView } from '../../test/fixtures';
import { App } from '../../App';

vi.mock('@cc/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cc/core')>();
  return {
    ...actual,
    vnDate: () => '2026-11-28',
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

const bankWallet: WalletDetailView = {
  id: 'w-bank',
  name: 'Ví ngân hàng',
  currency: 'VND',
  balance: 48_250_000,
  isDefault: true,
  kind: 'everyday',
  startAmount: 48_250_000,
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: 48_250_000,
  icon: 'bank',
  sortOrder: 0,
  archived: false,
  entryCount: 10,
  excludeFromReports: false,
};

function makeRule(
  id: string,
  type: 'expense' | 'income',
  amount: number,
  monthDay: number | 'last',
  nextDueOn: string,
): RecurringRuleView {
  return {
    id,
    draft: {
      type,
      walletId: 'w-bank',
      categoryId: `cat-${id}`,
      amount,
      tags: [],
      note: null,
    },
    schedule: {
      unit: 'month',
      every: 1,
      monthDay,
      startDate: '2026-01-05',
      end: { kind: 'never' },
    },
    askMe: false,
    status: 'active',
    pausedReason: null,
    nextDueOn,
    lastConfirmedOn: '2026-11-05',
  };
}

// 4 rules: 6,000,000 + 250,000 + 1,200,000 = 7,450,000 VND outgoing in next 30 days (Nov 29 .. Dec 28)
// + 1 income rule (25,000,000) which is not counted in vndOut.
const fourRules: RecurringRuleView[] = [
  makeRule('r-rent', 'expense', 6_000_000, 5, '2026-12-05'),
  makeRule('r-net', 'expense', 250_000, 5, '2026-12-05'),
  makeRule('r-elec', 'expense', 1_200_000, 15, '2026-12-15'),
  makeRule('r-salary', 'income', 25_000_000, 'last', '2026-11-30'),
];

const threeWaiting: PlannedItemView[] = [
  {
    id: 'p-1',
    kind: 'recurring_occurrence',
    ruleId: 'r-elec',
    dueOn: '2026-11-20',
    draft: fourRules[2]!.draft,
    status: 'waiting',
    meta: null,
    createdOn: '2026-11-20',
  },
  {
    id: 'p-2',
    kind: 'recurring_checkin',
    ruleId: 'r-net',
    dueOn: '2026-11-25',
    draft: null,
    status: 'waiting',
    meta: { pausesAfter: { occurrences: 3 } },
    createdOn: '2026-11-25',
  },
  {
    id: 'p-3',
    kind: 'recurring_paused',
    ruleId: 'r-rent',
    dueOn: '2026-11-27',
    draft: null,
    status: 'waiting',
    meta: { reason: 'missing_wallet' },
    createdOn: '2026-11-27',
  },
];

function stubHomeApis(opts: {
  me?: typeof meOn;
  wallets?: WalletDetailView[];
  rules?: RecurringRuleView[];
  planned?: PlannedItemView[];
}) {
  mockApi({
    'GET /api/me': opts.me ?? meOn,
    'GET /api/me/personal/wallets': { wallets: opts.wallets ?? [bankWallet] },
    'GET /api/me/personal/summary': { totalVnd: 48_250_000, cashVnd: 48_250_000, approximate: false },
    'GET /api/me/personal/reports': { month: '2026-11', spent: 0, income: 0, approximate: false, categories: [] },
    'GET /api/me/personal/budgets': { budgets: [] },
    'GET /api/me/personal/budgets/progress': { today: '2026-11-28', rows: [] },
    'GET /api/me/personal/categories': { categories: [] },
    'GET /api/me/personal/assets': { assets: [] },
    'GET /api/me/personal/group-settings': {
      settings: { defaultGroupCategoryId: null, countLoans: false },
    },
    'GET /api/me/personal/list': { rows: [], groupRows: [] },
    'GET /api/me/personal/recurring/rules': { rules: opts.rules ?? [] },
    'GET /api/me/personal/planned': { items: opts.planned ?? [] },
    'GET /api/me/ledger': ledger,
    'GET /api/me/people/summary': peopleSummary,
    'GET /api/trips/t-led': ledgerView(),
    'GET /api/trips': { trips: [] },
  });
}

function renderHomeVi() {
  const utils = renderAt(<App />, { route: '/trips', path: '*' });
  act(() => {
    setLang('vi', false);
  });
  return utils;
}

describe('SpendingBook recurring home row', () => {
  it('shows "4 quy tắc · 30 ngày tới chi 7.450.000₫" and count pill of 3 when three items wait', async () => {
    stubHomeApis({ rules: fourRules, planned: threeWaiting });
    renderHomeVi();

    const row = await screen.findByTestId('book-recurring-row');
    expect(row).toHaveClass('fsl-book__recurring');
    expect(row).toHaveAttribute('href', '/recurring');
    expect(row).toHaveTextContent('Định kỳ & chờ xác nhận');

    await waitFor(() => {
      expect(row).toHaveTextContent('4 quy tắc · 30 ngày tới chi 7.450.000₫');
    });

    const pill = within(row).getByTestId('book-recurring-count');
    expect(pill).toHaveTextContent('3 chờ');
  });

  it('omits the count pill when no items are waiting', async () => {
    stubHomeApis({ rules: fourRules, planned: [] });
    renderHomeVi();

    const row = await screen.findByTestId('book-recurring-row');
    await waitFor(() => {
      expect(row).toHaveTextContent('4 quy tắc · 30 ngày tới chi 7.450.000₫');
    });
    expect(within(row).queryByTestId('book-recurring-count')).not.toBeInTheDocument();
  });

  it('shows empty description when there are no rules', async () => {
    stubHomeApis({ rules: [], planned: [] });
    renderHomeVi();

    const row = await screen.findByTestId('book-recurring-row');
    expect(row).toHaveTextContent('Tự ghi các khoản lặp lại');
  });

  it('is absent when personalArea is switched off', async () => {
    stubHomeApis({ me: meOff, rules: fourRules, planned: threeWaiting });
    renderHomeVi();

    await waitFor(() => {
      expect(screen.queryByTestId('book-recurring-row')).not.toBeInTheDocument();
    });
  });

  it('is absent when the user has no wallet yet', async () => {
    stubHomeApis({ wallets: [], rules: [], planned: [] });
    renderHomeVi();

    await screen.findByTestId('book-empty');
    expect(screen.queryByTestId('book-recurring-row')).not.toBeInTheDocument();
  });
});
