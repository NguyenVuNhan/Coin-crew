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
import { hideUndo } from '../../components/UndoSnackbarHost';
import { BudgetHistoryChart } from '../../components/budgets/BudgetHistoryChart';

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
  hideUndo();
  txCopyState.status = 'ready';
  txCopyState.snapshot = { entries: [] };
  groupCopyState.status = 'ready';
  groupCopyState.snapshot = { rows: [] };
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  hideUndo();
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
  limits: [
    { effectiveFrom: '2026-04-01', amount: 2_500_000 },
    { effectiveFrom: '2026-09-01', amount: 3_000_000 },
  ],
  suggestionDismissedUntil: null,
  createdOn: '2026-04-10',
};

function spendRow(id: string, date: string, amount: number): CountedSpendRow {
  return {
    id,
    kind: 'entry',
    date,
    amount,
    currency: 'VND',
    walletId: 'w-cash',
    categoryId: 'cat-food',
    tagIds: [],
  };
}

function stubApis(opts: {
  budgets?: BudgetDef[];
  wallets?: WalletDetailView[];
  rows?: CountedSpendRow[];
  extraRoutes?: Record<string, unknown>;
} = {}) {
  const {
    budgets = [],
    wallets = [cashWallet],
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

describe('BudgetForm hardening and screen-reader fixes', () => {
  it('shows defaults summary on collapsed "Thêm tùy chọn" and currency suffix + placeholder on amount field', async () => {
    const user = userEvent.setup();
    stubApis({ budgets: [] });

    renderVi('/budgets?new=1');
    await screen.findByTestId('budget-form');

    const defaultsLine = screen.getByTestId('budget-form-defaults');
    expect(defaultsLine).toHaveTextContent('Hằng tháng · từ ngày 1 · mọi ví VND');

    const amountInput = screen.getByTestId('budget-form-amount');
    expect(amountInput).toHaveAttribute('type', 'text');
    expect(amountInput).toHaveAttribute('inputmode', 'text');
    expect(amountInput).toHaveAttribute('placeholder', 'VD: 3tr hoặc 3.000.000');
    expect(amountInput).toHaveClass('pr-8');
    expect(amountInput.parentElement).toHaveTextContent('₫');

    // Expanding hides the defaults line
    await user.click(screen.getByTestId('budget-form-more-options'));
    expect(screen.queryByTestId('budget-form-defaults')).not.toBeInTheDocument();
  });

  it('edit mode shows read-only period field and no period choice buttons', async () => {
    stubApis({ budgets: [foodBudget] });

    renderVi('/budgets/b-food?edit=1');
    await screen.findByTestId('budget-form');

    const readonlyPeriod = screen.getByTestId('budget-form-period-readonly');
    expect(readonlyPeriod).toHaveTextContent('Chu kỳ');
    expect(readonlyPeriod).toHaveTextContent('Hằng tháng · từ ngày 1');
    expect(readonlyPeriod).toHaveTextContent('Muốn đổi chu kỳ? Xóa ngân sách này rồi đặt lại.');
    expect(within(readonlyPeriod).queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.queryByTestId('budget-form-period-week')).not.toBeInTheDocument();
    expect(screen.queryByTestId('budget-form-period-month')).not.toBeInTheDocument();
    expect(screen.queryByTestId('budget-form-period-year')).not.toBeInTheDocument();
    expect(screen.queryByTestId('budget-form-period-once')).not.toBeInTheDocument();
  });

  it('create toast action label is "Hoàn tác" and clicking it deletes the created budget and returns to /budgets', async () => {
    const user = userEvent.setup();
    const createdBudget: BudgetDef = {
      id: 'b-undo-1',
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
      createdOn: '2026-11-26',
    };

    const api = stubApis({
      budgets: [],
      extraRoutes: {
        'POST /api/me/personal/budgets': () =>
          Response.json({ budget: createdBudget }, { status: 201 }),
        'DELETE /api/me/personal/budgets/b-undo-1': { ok: true },
      },
    });

    renderVi('/budgets?new=1&categoryId=cat-food&amount=3000000');
    await screen.findByTestId('budget-form');

    await user.click(screen.getByTestId('budget-form-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/budgets/b-undo-1');
    });

    const undoBtn = screen.getByRole('button', { name: 'Hoàn tác' });
    expect(undoBtn).toBeInTheDocument();
    await user.click(undoBtn);

    await waitFor(() => {
      expect(api.calls.filter((c) => c.method === 'DELETE')).toHaveLength(1);
    });
    expect(api.calls.find((c) => c.method === 'DELETE')?.path).toBe('/api/me/personal/budgets/b-undo-1');

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/budgets');
    });
  });

  it('BudgetHistoryChart hides svg from screen readers and renders an sr-only list with one item per bar', () => {
    const bars = [
      { key: '2026-09', label: 'T9', spent: 1_500_000, limit: 2_000_000, ariaLabel: 'Tháng 9: đã chi 1.500.000₫ trên 2.000.000₫' },
      { key: '2026-10', label: 'T10', spent: 2_200_000, limit: 2_000_000, ariaLabel: 'Tháng 10: đã chi 2.200.000₫ trên 2.000.000₫' },
      { key: '2026-11', label: 'T11', spent: 800_000, limit: 2_000_000, isCurrent: true, ariaLabel: 'Tháng 11: đã chi 800.000₫ trên 2.000.000₫' },
    ];

    renderAt(<BudgetHistoryChart bars={bars} ariaLabel="Chi tiêu 3 kỳ gần đây" />, {
      route: '/',
      path: '/',
    });

    const svg = screen.getByTestId('budget-history-chart');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).not.toHaveAttribute('role');

    const list = screen.getByRole('list', { name: 'Chi tiêu 3 kỳ gần đây' });
    expect(list).toHaveClass('sr-only');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Tháng 9: đã chi 1.500.000₫ trên 2.000.000₫');
    expect(items[1]).toHaveTextContent('Tháng 10: đã chi 2.200.000₫ trên 2.000.000₫');
    expect(items[2]).toHaveTextContent('Tháng 11: đã chi 800.000₫ trên 2.000.000₫');
  });

  it('BudgetRow suggestion mark is aria-hidden with sr-only text, and BudgetDetailScreen past-period rows have no chevron', async () => {
    const rows: CountedSpendRow[] = [
      spendRow('s-05', '2026-05-15', 3_500_000),
      spendRow('s-06', '2026-06-15', 3_600_000),
      spendRow('s-07', '2026-07-15', 3_500_000),
      spendRow('s-08', '2026-08-15', 3_700_000),
      spendRow('s-09', '2026-09-15', 3_600_000),
      spendRow('s-10', '2026-10-15', 3_700_000),
    ];

    stubApis({
      budgets: [foodBudget],
      rows,
    });

    renderVi('/budgets');
    const suggestMark = await screen.findByTestId('budget-suggest-mark');
    expect(suggestMark).toHaveAttribute('aria-hidden', 'true');
    expect(suggestMark).not.toHaveAttribute('aria-label');
    expect(suggestMark).not.toHaveAttribute('title');
    expect(screen.getByText('Có gợi ý đổi mức')).toHaveClass('sr-only');

    // Navigate to detail and verify past-period row has aria-pressed and no trailing chevron
    const user = userEvent.setup();
    await user.click(screen.getByTestId('budget-row-b-food'));

    const pastRow = await screen.findByTestId('budget-past-row-2026-10-01');
    expect(pastRow).toHaveAttribute('aria-pressed', 'false');
    expect(pastRow.querySelector('.lucide-chevron-right')).toBeNull();
  });
});
